(function () {
  const GRID = 8;
  const ACTIONS = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // left, right, up, down
  const ACTION_ARROWS = ['\u2190', '\u2192', '\u2191', '\u2193'];
  const ALPHA = 0.1;
  const GAMMA = 0.95;
  const EPS_DECAY = 0.995;
  const EPS_MIN = 0.01;
  const STEP_COST = -0.01;
  const GOAL_REWARD = 1;
  const WALL_PENALTY = -1;

  const canvas = document.getElementById('ql-canvas');
  const ctx = canvas.getContext('2d');
  const container = document.getElementById('ql-container');

  let walls, goal, Q, epsilon, episodes, totalReward, animating;

  function getCSS(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function reset() {
    walls = Array.from({ length: GRID }, () => Array(GRID).fill(false));
    goal = [GRID - 1, GRID - 1];
    Q = Array.from({ length: GRID }, () =>
      Array.from({ length: GRID }, () => [0, 0, 0, 0])
    );
    epsilon = 1.0;
    episodes = 0;
    totalReward = 0;
    animating = false;
    updateStats();
    draw();
  }

  function resize() {
    const w = container.clientWidth;
    const h = Math.min(w, 500);
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    draw();
  }

  function cellSize() {
    return Math.min(canvas.width / devicePixelRatio / GRID, canvas.height / devicePixelRatio / GRID);
  }

  function gridOffset() {
    var cs = cellSize();
    return [
      (canvas.width / devicePixelRatio - cs * GRID) / 2,
      (canvas.height / devicePixelRatio - cs * GRID) / 2
    ];
  }

  function draw(agentPos) {
    var w = canvas.width / devicePixelRatio;
    var h = canvas.height / devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    var cs = cellSize();
    var off = gridOffset();
    var accent = getCSS('--accent');
    var text = getCSS('--text');
    var border = getCSS('--border');
    var panel = getCSS('--panel');
    var muted = getCSS('--text-muted');

    // Find Q range for heatmap
    var maxQ = -Infinity, minQ = Infinity;
    for (var r = 0; r < GRID; r++) {
      for (var c = 0; c < GRID; c++) {
        if (walls[r][c]) continue;
        var mv = Math.max.apply(null, Q[r][c]);
        if (mv > maxQ) maxQ = mv;
        if (mv < minQ) minQ = mv;
      }
    }
    var qRange = maxQ - minQ || 1;

    for (var r = 0; r < GRID; r++) {
      for (var c = 0; c < GRID; c++) {
        var x = off[0] + c * cs;
        var y = off[1] + r * cs;

        if (walls[r][c]) {
          ctx.fillStyle = muted;
          ctx.fillRect(x, y, cs, cs);
        } else if (r === goal[0] && c === goal[1]) {
          ctx.fillStyle = accent;
          ctx.globalAlpha = 0.3;
          ctx.fillRect(x, y, cs, cs);
          ctx.globalAlpha = 1;
        } else {
          var val = (Math.max.apply(null, Q[r][c]) - minQ) / qRange;
          ctx.fillStyle = accent;
          ctx.globalAlpha = val * 0.25;
          ctx.fillRect(x, y, cs, cs);
          ctx.globalAlpha = 1;
        }

        ctx.strokeStyle = border;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, cs, cs);

        // Arrow for best action
        if (!walls[r][c] && !(r === goal[0] && c === goal[1])) {
          var qVals = Q[r][c];
          var maxV = Math.max.apply(null, qVals);
          if (maxV !== 0) {
            var bestA = qVals.indexOf(maxV);
            ctx.fillStyle = text;
            ctx.font = Math.floor(cs * 0.4) + 'px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ACTION_ARROWS[bestA], x + cs / 2, y + cs / 2);
          }
        }

        // Goal marker
        if (r === goal[0] && c === goal[1]) {
          ctx.fillStyle = accent;
          ctx.font = 'bold ' + Math.floor(cs * 0.45) + 'px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('G', x + cs / 2, y + cs / 2);
        }
      }
    }

    // Start marker
    if (!walls[0][0]) {
      ctx.fillStyle = text;
      ctx.font = 'bold ' + Math.floor(cs * 0.35) + 'px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S', off[0] + cs / 2, off[1] + cs / 2);
    }

    // Agent position
    if (agentPos) {
      var ax = off[0] + agentPos[1] * cs + cs / 2;
      var ay = off[1] + agentPos[0] * cs + cs / 2;
      ctx.beginPath();
      ctx.arc(ax, ay, cs * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
    }
  }

  function runEpisode(animate, cb) {
    var state = [0, 0];
    var steps = 0;
    var epReward = 0;
    var maxSteps = GRID * GRID * 4;
    var path = [state.slice()];

    function step() {
      if (state[0] === goal[0] && state[1] === goal[1] || steps >= maxSteps) {
        episodes++;
        epsilon = Math.max(EPS_MIN, epsilon * EPS_DECAY);
        totalReward += epReward;
        updateStats();
        if (!animate) draw();
        if (cb) cb();
        return;
      }

      var r = state[0], c = state[1];
      var aIdx;
      if (Math.random() < epsilon) {
        aIdx = Math.floor(Math.random() * 4);
      } else {
        var qVals = Q[r][c];
        var maxV = Math.max.apply(null, qVals);
        aIdx = qVals.indexOf(maxV);
      }

      var nr = r + ACTIONS[aIdx][0];
      var nc = c + ACTIONS[aIdx][1];
      var reward = STEP_COST;

      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID || walls[nr][nc]) {
        reward = WALL_PENALTY;
        nr = r;
        nc = c;
      }
      if (nr === goal[0] && nc === goal[1]) {
        reward = GOAL_REWARD;
      }

      var oldQ = Q[r][c][aIdx];
      var nextMax = Math.max.apply(null, Q[nr][nc]);
      Q[r][c][aIdx] = oldQ + ALPHA * (reward + GAMMA * nextMax - oldQ);

      state = [nr, nc];
      epReward += reward;
      steps++;
      path.push(state.slice());

      if (animate) {
        draw(state);
        requestAnimationFrame(step);
      } else {
        step();
      }
    }

    step();
  }

  function trainN(n) {
    if (animating) return;
    animating = true;
    var count = 0;
    function next() {
      if (count >= n) {
        animating = false;
        draw();
        return;
      }
      count++;
      if (n === 1) {
        runEpisode(true, next);
      } else {
        runEpisode(false, next);
      }
    }
    next();
  }

  function updateStats() {
    var el = document.getElementById('ql-stats');
    if (el) {
      el.innerHTML =
        '<span>Episodes: <strong>' + episodes + '</strong></span>' +
        '<span>Total Reward: <strong>' + totalReward.toFixed(1) + '</strong></span>' +
        '<span>\u03B5: <strong>' + epsilon.toFixed(3) + '</strong></span>';
    }
  }

  // Click handling
  canvas.addEventListener('click', function (e) {
    if (animating) return;
    var rect = canvas.getBoundingClientRect();
    var cs_ = cellSize();
    var off_ = gridOffset();
    var c = Math.floor((e.clientX - rect.left - off_[0]) / cs_);
    var r = Math.floor((e.clientY - rect.top - off_[1]) / cs_);
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return;
    if (r === 0 && c === 0) return; // Don't wall start
    if (r === goal[0] && c === goal[1]) return;

    if (e.shiftKey) {
      goal = [r, c];
      walls[r][c] = false;
    } else {
      walls[r][c] = !walls[r][c];
    }
    draw();
  });

  canvas.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    if (animating) return;
    var rect = canvas.getBoundingClientRect();
    var cs_ = cellSize();
    var off_ = gridOffset();
    var c = Math.floor((e.clientX - rect.left - off_[0]) / cs_);
    var r = Math.floor((e.clientY - rect.top - off_[1]) / cs_);
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return;
    if (r === 0 && c === 0) return;
    goal = [r, c];
    walls[r][c] = false;
    draw();
  });

  document.getElementById('ql-train1').addEventListener('click', function () { trainN(1); });
  document.getElementById('ql-train100').addEventListener('click', function () { trainN(100); });
  document.getElementById('ql-reset').addEventListener('click', reset);

  window.addEventListener('resize', resize);
  reset();
  resize();
})();
