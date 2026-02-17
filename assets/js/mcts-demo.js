(function () {
  var canvas = document.getElementById('mcts-canvas');
  var ctx = canvas.getContext('2d');
  var stepBtn = document.getElementById('mcts-step');
  var resetBtn = document.getElementById('mcts-reset');

  var DEPTH = 4;
  var C = Math.SQRT2;
  var tree, phase, phasePath, phaseLeaf, phaseReward, phaseTimer;

  // Phase labels for the status indicator
  var PHASE_NAMES = ['Select', 'Expand', 'Simulate', 'Backpropagate', 'Done'];
  var PHASE_COLORS = [];

  function getCSS(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function resize() {
    var w = canvas.parentElement.clientWidth;
    var h = canvas.parentElement.clientHeight;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    draw();
  }

  function generateTree() {
    var id = 0;
    function build(depth) {
      var node = {
        id: id++, children: [], visits: 0, totalReward: 0,
        isLeaf: depth === 0, reward: 0,
        selectHighlight: false, expandHighlight: false,
        simHighlight: false, backpropHighlight: false
      };
      if (depth === 0) {
        node.reward = Math.round((Math.random() * 10) * 10) / 10;
      } else {
        node.children.push(build(depth - 1));
        node.children.push(build(depth - 1));
      }
      return node;
    }
    return build(DEPTH);
  }

  function clearHighlights(node) {
    node.selectHighlight = false;
    node.expandHighlight = false;
    node.simHighlight = false;
    node.backpropHighlight = false;
    for (var i = 0; i < node.children.length; i++) {
      clearHighlights(node.children[i]);
    }
  }

  // UCB1 selection: descend to a node that has an unvisited child or is a leaf
  function select(node) {
    var path = [node];
    var current = node;
    while (!current.isLeaf) {
      // Check for unvisited children
      var unvisited = null;
      for (var i = 0; i < current.children.length; i++) {
        if (current.children[i].visits === 0) {
          unvisited = current.children[i];
          break;
        }
      }
      if (unvisited) {
        path.push(unvisited);
        return path;
      }
      // UCB1
      var best = null, bestScore = -Infinity;
      for (var i = 0; i < current.children.length; i++) {
        var child = current.children[i];
        var score = child.totalReward / child.visits + C * Math.sqrt(Math.log(current.visits) / child.visits);
        if (score > bestScore) {
          bestScore = score;
          best = child;
        }
      }
      current = best;
      path.push(current);
    }
    return path;
  }

  // Rollout: random walk to a leaf from the given node
  function rollout(node) {
    var current = node;
    var simPath = [current];
    while (!current.isLeaf) {
      current = current.children[Math.floor(Math.random() * current.children.length)];
      simPath.push(current);
    }
    return { reward: current.reward, path: simPath };
  }

  // Backpropagation
  function backprop(path, reward) {
    for (var i = 0; i < path.length; i++) {
      path[i].visits++;
      path[i].totalReward += reward;
    }
  }

  // Animated step: cycles through the 4 phases visually
  phase = 0; // 0=select, 1=expand/arrive, 2=simulate, 3=backprop
  phasePath = [];
  phaseLeaf = null;
  phaseReward = 0;

  var simPath = [];

  function doStep() {
    if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }

    if (phase === 0) {
      // SELECTION
      clearHighlights(tree);
      phasePath = select(tree);
      for (var i = 0; i < phasePath.length; i++) {
        phasePath[i].selectHighlight = true;
      }
      phase = 1;
      draw();
      phaseTimer = setTimeout(doStep, 600);
    } else if (phase === 1) {
      // EXPANSION (the selected leaf/unvisited node)
      var expandNode = phasePath[phasePath.length - 1];
      expandNode.expandHighlight = true;
      expandNode.selectHighlight = false;
      phase = 2;
      draw();
      phaseTimer = setTimeout(doStep, 600);
    } else if (phase === 2) {
      // SIMULATION (rollout from expanded node)
      var expandNode = phasePath[phasePath.length - 1];
      var result = rollout(expandNode);
      phaseReward = result.reward;
      simPath = result.path;
      for (var i = 0; i < simPath.length; i++) {
        simPath[i].simHighlight = true;
      }
      expandNode.expandHighlight = false;
      phase = 3;
      draw();
      phaseTimer = setTimeout(doStep, 600);
    } else if (phase === 3) {
      // BACKPROPAGATION
      clearHighlights(tree);
      backprop(phasePath, phaseReward);
      for (var i = 0; i < phasePath.length; i++) {
        phasePath[i].backpropHighlight = true;
      }
      phase = 0;
      draw();
      updateInfo();
    }
  }

  function updateInfo() {
    var el = document.getElementById('mcts-info');
    if (!el) return;
    var rootVisits = tree.visits;
    var bestChild = null, bestVisits = -1;
    for (var i = 0; i < tree.children.length; i++) {
      if (tree.children[i].visits > bestVisits) {
        bestVisits = tree.children[i].visits;
        bestChild = i;
      }
    }
    var avg = rootVisits > 0 ? (tree.totalReward / tree.visits).toFixed(1) : '--';
    el.innerHTML =
      '<span>Iterations: <strong>' + rootVisits + '</strong></span>' +
      '<span>Avg Reward: <strong>' + avg + '</strong></span>' +
      '<span>Best Branch: <strong>' + (bestChild !== null ? (bestChild === 0 ? 'Left' : 'Right') : '--') + '</strong></span>';
  }

  // Layout
  function layoutTree(node, x, y, spread, positions) {
    positions[node.id] = { x: x, y: y };
    if (!node.isLeaf) {
      var childSpread = spread / 2;
      layoutTree(node.children[0], x - childSpread, y + 60, childSpread, positions);
      layoutTree(node.children[1], x + childSpread, y + 60, childSpread, positions);
    }
    return positions;
  }

  function draw() {
    var w = canvas.width / devicePixelRatio;
    var h = canvas.height / devicePixelRatio;
    ctx.clearRect(0, 0, w, h);
    if (!tree) return;

    var accent = getCSS('--accent');
    var text = getCSS('--text');
    var border = getCSS('--border');
    var muted = getCSS('--text-muted');
    var panel = getCSS('--panel');

    var positions = layoutTree(tree, w / 2, 35, w / 4, {});

    // Phase indicator
    var phaseLabel = '';
    var phaseColor = muted;
    if (phase === 1) { phaseLabel = 'Selection'; phaseColor = '#f59e0b'; }
    else if (phase === 2) { phaseLabel = 'Expansion'; phaseColor = '#10b981'; }
    else if (phase === 3) { phaseLabel = 'Simulation'; phaseColor = '#8b5cf6'; }
    else {
      // Check if we just backpropagated
      var anyBackprop = false;
      (function check(n) {
        if (n.backpropHighlight) anyBackprop = true;
        for (var i = 0; i < n.children.length; i++) check(n.children[i]);
      })(tree);
      if (anyBackprop) { phaseLabel = 'Backpropagation'; phaseColor = '#ef4444'; }
    }

    if (phaseLabel) {
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillStyle = phaseColor;
      ctx.fillText(phaseLabel, w - 12, 20);
    }

    // Draw edges then nodes
    function drawEdges(node) {
      var pos = positions[node.id];
      for (var i = 0; i < node.children.length; i++) {
        var child = node.children[i];
        var cpos = positions[child.id];

        var edgeColor = border;
        var edgeWidth = 1;
        if (child.selectHighlight) { edgeColor = '#f59e0b'; edgeWidth = 2.5; }
        else if (child.simHighlight) { edgeColor = '#8b5cf6'; edgeWidth = 2; }
        else if (child.backpropHighlight && node.backpropHighlight) { edgeColor = '#ef4444'; edgeWidth = 2.5; }
        else if (child.visits > 0) { edgeColor = accent; edgeWidth = 1; }

        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(cpos.x, cpos.y);
        ctx.strokeStyle = edgeColor;
        ctx.lineWidth = edgeWidth;
        ctx.stroke();

        drawEdges(child);
      }
    }

    function drawNodes(node) {
      var pos = positions[node.id];
      for (var i = 0; i < node.children.length; i++) drawNodes(node.children[i]);

      var radius = node.isLeaf ? 16 : 14;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

      // Fill based on highlight state
      if (node.selectHighlight) {
        ctx.fillStyle = '#f59e0b';
        ctx.globalAlpha = 0.8;
      } else if (node.expandHighlight) {
        ctx.fillStyle = '#10b981';
        ctx.globalAlpha = 0.9;
      } else if (node.simHighlight) {
        ctx.fillStyle = '#8b5cf6';
        ctx.globalAlpha = 0.6;
      } else if (node.backpropHighlight) {
        ctx.fillStyle = '#ef4444';
        ctx.globalAlpha = 0.8;
      } else if (node.visits > 0) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.15 + Math.min(0.6, node.visits / 20);
      } else {
        ctx.fillStyle = panel;
        ctx.globalAlpha = 1;
      }
      ctx.fill();
      ctx.globalAlpha = 1;

      // Border
      ctx.strokeStyle = node.visits > 0 ? accent : border;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Text: visits/value for internal nodes, reward for leaves
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (node.isLeaf) {
        ctx.fillStyle = text;
        ctx.font = 'bold 10px monospace';
        ctx.fillText(node.reward.toFixed(1), pos.x, pos.y);
      } else if (node.visits > 0) {
        ctx.fillStyle = text;
        ctx.font = '9px monospace';
        var avg = (node.totalReward / node.visits).toFixed(1);
        ctx.fillText(node.visits.toString(), pos.x, pos.y - 5);
        ctx.fillStyle = muted;
        ctx.font = '8px monospace';
        ctx.fillText(avg, pos.x, pos.y + 6);
      }
    }

    drawEdges(tree);
    drawNodes(tree);

    // Legend
    var legendY = h - 12;
    var items = [
      { color: '#f59e0b', label: 'Select' },
      { color: '#10b981', label: 'Expand' },
      { color: '#8b5cf6', label: 'Simulate' },
      { color: '#ef4444', label: 'Backprop' }
    ];
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    var lx = 12;
    for (var i = 0; i < items.length; i++) {
      ctx.fillStyle = items[i].color;
      ctx.fillRect(lx, legendY - 8, 10, 10);
      ctx.fillStyle = muted;
      ctx.fillText(items[i].label, lx + 14, legendY);
      lx += ctx.measureText(items[i].label).width + 26;
    }
  }

  function init() {
    tree = generateTree();
    phase = 0;
    phasePath = [];
    simPath = [];
    if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
    updateInfo();
    draw();
  }

  stepBtn.addEventListener('click', doStep);
  resetBtn.addEventListener('click', init);
  window.addEventListener('resize', resize);

  init();
  resize();

  // Auto-run a few steps to show initial state
  var autoCount = 0;
  function autoStep() {
    if (autoCount >= 16) return; // 4 full iterations
    autoCount++;
    doStep();
    setTimeout(autoStep, 400);
  }
  setTimeout(autoStep, 300);
})();
