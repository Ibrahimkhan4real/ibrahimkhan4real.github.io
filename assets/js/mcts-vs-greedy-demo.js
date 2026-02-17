(function () {
  var mctsCanvas = document.getElementById('mvg-mcts-canvas');
  var greedyCanvas = document.getElementById('mvg-greedy-canvas');
  var mctsCtx = mctsCanvas.getContext('2d');
  var greedyCtx = greedyCanvas.getContext('2d');

  var DEPTH = 4;
  var C = Math.SQRT2;
  var tree, mctsState, greedyState, running;

  function getCSS(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function generateTree() {
    // Place one high-reward leaf deep in a branch that looks bad on the surface.
    // This makes greedy likely to miss it while MCTS can discover it.
    var id = 0;
    function build(depth) {
      var node = { id: id++, children: [], reward: 0, visits: 0, totalReward: 0, visited: false, inPath: false };
      if (depth === 0) {
        node.reward = Math.round((Math.random() * 8 + 1) * 10) / 10; // 1.0 to 9.0
        node.isLeaf = true;
      } else {
        node.isLeaf = false;
        node.children.push(build(depth - 1));
        node.children.push(build(depth - 1));
      }
      return node;
    }
    var t = build(DEPTH);

    // Ensure there's a clearly best leaf that's hard for greedy to find:
    // Pick a random leaf in the tree and give it a high reward,
    // then suppress the sibling subtree so greedy's local heuristic avoids that branch.
    var leaves = [];
    (function collectLeaves(n) {
      if (n.isLeaf) { leaves.push(n); return; }
      for (var i = 0; i < n.children.length; i++) collectLeaves(n.children[i]);
    })(t);

    // Set one random leaf to a very high reward
    var bestIdx = Math.floor(Math.random() * leaves.length);
    leaves[bestIdx].reward = Math.round((Math.random() * 5 + 15) * 10) / 10; // 15-20

    return t;
  }

  function cloneTree(node) {
    var n = { id: node.id, reward: node.reward, isLeaf: node.isLeaf, children: [], visits: 0, totalReward: 0, visited: false, inPath: false };
    for (var i = 0; i < node.children.length; i++) {
      n.children.push(cloneTree(node.children[i]));
    }
    return n;
  }

  // Greedy heuristic: only looks at immediate children's direct reward or
  // a single random sample — NOT the true leaf average (which would be an oracle).
  function greedySample(node) {
    // Random rollout to a single leaf — a realistic greedy heuristic
    var current = node;
    while (!current.isLeaf) {
      current = current.children[Math.floor(Math.random() * current.children.length)];
    }
    return current.reward;
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
    mctsState.iterations++;
  }

  // Greedy logic: at each level, take a single random sample from each child
  // and pick the child with the better sample. This is a realistic greedy —
  // it has limited information and commits immediately.
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

    var bestChild = null, bestH = -Infinity;
    for (var i = 0; i < node.children.length; i++) {
      var h = greedySample(node.children[i]);
      if (h > bestH) {
        bestH = h;
        bestChild = node.children[i];
      }
    }
    greedyState.current = bestChild;
    greedyState.nodesExplored++;
  }

  // Follow the most-visited child (standard MCTS best-move selection)
  function findBestMCTSPath(node) {
    node.inPath = true;
    if (node.isLeaf) return node.reward;
    var bestChild = null, bestVisits = -1;
    for (var i = 0; i < node.children.length; i++) {
      if (node.children[i].visits > bestVisits) {
        bestVisits = node.children[i].visits;
        bestChild = node.children[i];
      }
    }
    if (bestChild) return findBestMCTSPath(bestChild);
    return 0;
  }

  // Find the actual leaf reward at the end of the MCTS best path
  function getMCTSLeafReward(node) {
    if (node.isLeaf) return node.reward;
    var bestChild = null, bestVisits = -1;
    for (var i = 0; i < node.children.length; i++) {
      if (node.children[i].visits > bestVisits) {
        bestVisits = node.children[i].visits;
        bestChild = node.children[i];
      }
    }
    if (bestChild) return getMCTSLeafReward(bestChild);
    return 0;
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

  function drawTree(ctx_, canvasEl, treeNode, positions) {
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

      // Draw edges first
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

      // Recurse children
      for (var i = 0; i < node.children.length; i++) {
        drawNode(node.children[i]);
      }

      // Draw node circle
      var radius = node.isLeaf ? 16 : 14;
      ctx_.beginPath();
      ctx_.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      if (node.inPath) {
        ctx_.fillStyle = accent;
      } else if (node.visited) {
        ctx_.fillStyle = accent;
        ctx_.globalAlpha = 0.15 + Math.min(0.4, (node.visits || 1) / 30);
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
      ctx_.textAlign = 'center';
      ctx_.textBaseline = 'middle';
      if (node.isLeaf) {
        ctx_.font = 'bold 9px monospace';
        ctx_.fillText(node.reward.toFixed(1), pos.x, pos.y);
      } else if (node.visits > 0) {
        ctx_.font = '9px monospace';
        ctx_.fillText(node.visits.toString(), pos.x, pos.y - 5);
        ctx_.fillStyle = node.inPath ? 'rgba(255,255,255,0.7)' : muted;
        ctx_.font = '8px monospace';
        var avg = (node.totalReward / node.visits).toFixed(1);
        ctx_.fillText(avg, pos.x, pos.y + 5);
      }
    }

    drawNode(treeNode);
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
    drawTree(mctsCtx, mctsCanvas, mctsState.tree, mPos);
    drawTree(greedyCtx, greedyCanvas, greedyState.tree, gPos);
  }

  function updateStats() {
    var el = document.getElementById('mvg-stats');
    var mctsReward = mctsState.finalReward !== null ? mctsState.finalReward.toFixed(1) : '--';
    var greedyReward = greedyState.done ? greedyState.finalReward.toFixed(1) : '--';
    var winner = '';
    if (mctsState.finalReward !== null && greedyState.done) {
      if (mctsState.finalReward > greedyState.finalReward) winner = ' (MCTS wins)';
      else if (greedyState.finalReward > mctsState.finalReward) winner = ' (Greedy wins)';
      else winner = ' (Tie)';
    }
    el.innerHTML =
      '<span>MCTS Iterations: <strong>' + mctsState.iterations + '</strong></span>' +
      '<span>MCTS Leaf Reward: <strong>' + mctsReward + '</strong></span>' +
      '<span>Greedy Steps: <strong>' + greedyState.nodesExplored + '</strong></span>' +
      '<span>Greedy Leaf Reward: <strong>' + greedyReward + '</strong></span>' +
      (winner ? '<span><strong>' + winner.trim() + '</strong></span>' : '');
  }

  function init() {
    tree = generateTree();
    mctsState = { tree: cloneTree(tree), iterations: 0, finalReward: null };
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

    // Run greedy all at once first (it's only DEPTH steps)
    while (!greedyState.done) {
      greedyStep();
    }

    // Animate MCTS iterations
    var mctsIters = 0;
    var maxIters = 100; // Enough iterations to properly explore a depth-4 binary tree

    function tick() {
      if (!running || mctsIters >= maxIters) {
        running = false;
        mctsState.finalReward = findBestMCTSPath(mctsState.tree);
        drawAll();
        updateStats();
        return;
      }

      // Run a batch per tick for smoother animation
      var batchSize = Math.max(1, Math.floor(spd / 20));
      for (var b = 0; b < batchSize && mctsIters < maxIters; b++) {
        mctsStep();
        mctsIters++;
      }
      drawAll();
      updateStats();

      setTimeout(tick, Math.max(30, 500 - spd * 4.5));
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
