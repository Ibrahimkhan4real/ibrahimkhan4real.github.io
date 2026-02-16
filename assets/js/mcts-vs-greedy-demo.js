(function () {
  var mctsCanvas = document.getElementById('mvg-mcts-canvas');
  var greedyCanvas = document.getElementById('mvg-greedy-canvas');
  var mctsCtx = mctsCanvas.getContext('2d');
  var greedyCtx = greedyCanvas.getContext('2d');

  var DEPTH = 4;
  var C = Math.SQRT2;
  var tree, mctsState, greedyState, running, speed;

  function getCSS(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function generateTree() {
    var id = 0;
    function build(depth) {
      var node = { id: id++, children: [], reward: 0, visits: 0, totalReward: 0, visited: false, inPath: false };
      if (depth === 0) {
        node.reward = Math.round((Math.random() * 20 - 5) * 10) / 10;
        node.isLeaf = true;
      } else {
        node.isLeaf = false;
        node.children.push(build(depth - 1));
        node.children.push(build(depth - 1));
      }
      return node;
    }
    return build(DEPTH);
  }

  function cloneTree(node) {
    var n = { id: node.id, reward: node.reward, isLeaf: node.isLeaf, children: [], visits: 0, totalReward: 0, visited: false, inPath: false };
    for (var i = 0; i < node.children.length; i++) {
      n.children.push(cloneTree(node.children[i]));
    }
    return n;
  }

  function leafAvg(node) {
    if (node.isLeaf) return node.reward;
    var sum = 0, count = 0;
    for (var i = 0; i < node.children.length; i++) {
      var leaves = countLeaves(node.children[i]);
      sum += leafAvg(node.children[i]) * leaves;
      count += leaves;
    }
    return count ? sum / count : 0;
  }

  function countLeaves(node) {
    if (node.isLeaf) return 1;
    var c = 0;
    for (var i = 0; i < node.children.length; i++) c += countLeaves(node.children[i]);
    return c;
  }

  // MCTS logic
  function mctsSelect(node) {
    if (node.isLeaf) return [node];
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < node.children.length; i++) {
      var child = node.children[i];
      if (child.visits === 0) {
        return [node, child];
      }
      var score = child.totalReward / child.visits + C * Math.sqrt(Math.log(node.visits) / child.visits);
      if (score > bestScore) {
        bestScore = score;
        best = child;
      }
    }
    var path = mctsSelect(best);
    path.unshift(node);
    return path;
  }

  function mctsRollout(node) {
    if (node.isLeaf) return node.reward;
    var child = node.children[Math.floor(Math.random() * node.children.length)];
    return mctsRollout(child);
  }

  function mctsBackprop(path, reward) {
    for (var i = 0; i < path.length; i++) {
      path[i].visits++;
      path[i].totalReward += reward;
      path[i].visited = true;
    }
  }

  function mctsStep() {
    var path = mctsSelect(mctsState.tree);
    var leaf = path[path.length - 1];
    var reward = mctsRollout(leaf);
    mctsBackprop(path, reward);
    mctsState.nodesExplored++;
    mctsState.iterations++;
  }

  // Greedy logic
  function greedyStep() {
    if (greedyState.done) return;
    var node = greedyState.current;
    node.visited = true;
    node.inPath = true;

    if (node.isLeaf) {
      greedyState.finalReward = node.reward;
      greedyState.done = true;
      return;
    }

    // Pick child with better noisy heuristic
    var bestChild = null, bestH = -Infinity;
    for (var i = 0; i < node.children.length; i++) {
      var h = leafAvg(node.children[i]) + (Math.random() - 0.5) * 2;
      if (h > bestH) {
        bestH = h;
        bestChild = node.children[i];
      }
    }
    greedyState.current = bestChild;
    greedyState.nodesExplored++;
  }

  function layoutTree(node, x, y, spread, depth, positions) {
    positions[node.id] = { x: x, y: y };
    if (!node.isLeaf) {
      var childSpread = spread / 2;
      for (var i = 0; i < node.children.length; i++) {
        var cx = x + (i === 0 ? -childSpread : childSpread);
        var cy = y + 50;
        layoutTree(node.children[i], cx, cy, childSpread, depth + 1, positions);
      }
    }
    return positions;
  }

  function drawTree(ctx_, canvasEl, treeNode, positions, label) {
    var w = canvasEl.width / devicePixelRatio;
    var h = canvasEl.height / devicePixelRatio;
    ctx_.clearRect(0, 0, w, h);

    var accent = getCSS('--accent');
    var text = getCSS('--text');
    var border = getCSS('--border');
    var muted = getCSS('--text-muted');
    var panel = getCSS('--panel');

    function drawNode(node) {
      var pos = positions[node.id];
      if (!pos) return;

      // Draw edges
      for (var i = 0; i < node.children.length; i++) {
        var cpos = positions[node.children[i].id];
        if (!cpos) continue;
        ctx_.beginPath();
        ctx_.moveTo(pos.x, pos.y);
        ctx_.lineTo(cpos.x, cpos.y);
        ctx_.strokeStyle = node.children[i].inPath ? accent : border;
        ctx_.lineWidth = node.children[i].inPath ? 2.5 : 1;
        ctx_.stroke();
      }

      for (var i = 0; i < node.children.length; i++) {
        drawNode(node.children[i]);
      }

      // Draw node circle
      ctx_.beginPath();
      ctx_.arc(pos.x, pos.y, 14, 0, Math.PI * 2);
      if (node.inPath) {
        ctx_.fillStyle = accent;
      } else if (node.visited) {
        ctx_.fillStyle = accent;
        ctx_.globalAlpha = 0.3;
      } else {
        ctx_.fillStyle = panel;
      }
      ctx_.fill();
      ctx_.globalAlpha = 1;
      ctx_.strokeStyle = node.visited ? accent : border;
      ctx_.lineWidth = 1;
      ctx_.stroke();

      // Label
      ctx_.fillStyle = node.inPath ? '#fff' : text;
      ctx_.font = '10px sans-serif';
      ctx_.textAlign = 'center';
      ctx_.textBaseline = 'middle';
      if (node.isLeaf) {
        ctx_.fillText(node.reward.toFixed(1), pos.x, pos.y);
      } else if (node.visits > 0) {
        ctx_.fillText(node.visits.toString(), pos.x, pos.y);
      }
    }

    drawNode(treeNode);
  }

  function findBestMCTSPath(node) {
    node.inPath = true;
    if (node.isLeaf) return node.reward;
    var bestChild = null, bestAvg = -Infinity;
    for (var i = 0; i < node.children.length; i++) {
      if (node.children[i].visits > 0) {
        var avg = node.children[i].totalReward / node.children[i].visits;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestChild = node.children[i];
        }
      }
    }
    if (bestChild) return findBestMCTSPath(bestChild);
    return 0;
  }

  function resize() {
    [
      [mctsCanvas, document.getElementById('mvg-mcts-panel')],
      [greedyCanvas, document.getElementById('mvg-greedy-panel')]
    ].forEach(function (pair) {
      var c = pair[0], p = pair[1];
      var w = p.clientWidth;
      var h = 280;
      c.width = w * devicePixelRatio;
      c.height = h * devicePixelRatio;
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      c.getContext('2d').setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    });
    drawAll();
  }

  function drawAll() {
    if (!tree) return;
    var mW = mctsCanvas.width / devicePixelRatio;
    var gW = greedyCanvas.width / devicePixelRatio;
    var mPos = layoutTree(mctsState.tree, mW / 2, 25, mW / 3, 0, {});
    var gPos = layoutTree(greedyState.tree, gW / 2, 25, gW / 3, 0, {});
    drawTree(mctsCtx, mctsCanvas, mctsState.tree, mPos, 'MCTS');
    drawTree(greedyCtx, greedyCanvas, greedyState.tree, gPos, 'Greedy');
  }

  function updateStats() {
    var el = document.getElementById('mvg-stats');
    var mctsReward = mctsState.iterations > 0 ? (mctsState.tree.totalReward / mctsState.tree.visits).toFixed(2) : '--';
    var greedyReward = greedyState.done ? greedyState.finalReward.toFixed(2) : '--';
    el.innerHTML =
      '<span>MCTS Iterations: <strong>' + mctsState.iterations + '</strong></span>' +
      '<span>MCTS Est. Reward: <strong>' + mctsReward + '</strong></span>' +
      '<span>Greedy Nodes: <strong>' + greedyState.nodesExplored + '</strong></span>' +
      '<span>Greedy Reward: <strong>' + greedyReward + '</strong></span>';
  }

  function init() {
    tree = generateTree();
    mctsState = { tree: cloneTree(tree), nodesExplored: 0, iterations: 0 };
    greedyState = { tree: cloneTree(tree), current: null, nodesExplored: 0, finalReward: 0, done: false };
    greedyState.current = greedyState.tree;
    running = false;
    updateStats();
    resize();
  }

  function runComparison() {
    if (running) return;
    running = true;
    var spd = parseInt(document.getElementById('mvg-speed').value, 10);
    var mctsIters = 0;
    var maxIters = 30;

    function tick() {
      if (!running || mctsIters >= maxIters) {
        running = false;
        // Mark MCTS best path
        findBestMCTSPath(mctsState.tree);
        drawAll();
        updateStats();
        return;
      }

      mctsStep();
      if (!greedyState.done) greedyStep();
      mctsIters++;
      drawAll();
      updateStats();

      setTimeout(tick, 600 - spd * 5);
    }
    tick();
  }

  function stepOnce() {
    if (running) return;
    mctsStep();
    if (!greedyState.done) greedyStep();
    drawAll();
    updateStats();
  }

  document.getElementById('mvg-generate').addEventListener('click', init);
  document.getElementById('mvg-run').addEventListener('click', runComparison);
  document.getElementById('mvg-step').addEventListener('click', stepOnce);

  window.addEventListener('resize', resize);
  init();
})();
