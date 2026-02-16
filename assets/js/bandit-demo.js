(function () {
  var N_ARMS = 5;
  var canvas = document.getElementById('bandit-canvas');
  var regretCanvas = document.getElementById('bandit-regret-canvas');
  var ctx = canvas.getContext('2d');
  var rCtx = regretCanvas.getContext('2d');

  var arms, pulls, rewards, totalPulls, totalReward, cumulativeRegret, regretHistory, optimalP, strategy;

  function getCSS(v) {
    return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  }

  function reset() {
    arms = [];
    for (var i = 0; i < N_ARMS; i++) {
      arms.push(Math.random() * 0.8 + 0.1); // p between 0.1 and 0.9
    }
    optimalP = Math.max.apply(null, arms);
    pulls = new Array(N_ARMS).fill(0);
    rewards = new Array(N_ARMS).fill(0);
    totalPulls = 0;
    totalReward = 0;
    cumulativeRegret = 0;
    regretHistory = [0];
    updateStats();
    drawArms();
    drawRegret();
  }

  function resize() {
    var container = document.getElementById('bandit-container');
    var w = container.clientWidth;
    canvas.width = w * devicePixelRatio;
    canvas.height = 220 * devicePixelRatio;
    canvas.style.width = w + 'px';
    canvas.style.height = '220px';
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    regretCanvas.width = w * devicePixelRatio;
    regretCanvas.height = 120 * devicePixelRatio;
    regretCanvas.style.width = w + 'px';
    regretCanvas.style.height = '120px';
    rCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

    drawArms();
    drawRegret();
  }

  function pullArm(idx) {
    var reward = Math.random() < arms[idx] ? 1 : 0;
    pulls[idx]++;
    rewards[idx] += reward;
    totalPulls++;
    totalReward += reward;
    cumulativeRegret += optimalP - arms[idx];
    regretHistory.push(cumulativeRegret);
    updateStats();
    drawArms();
    drawRegret();
  }

  function chooseEpsilonGreedy() {
    var eps = 0.1;
    if (Math.random() < eps || totalPulls === 0) {
      return Math.floor(Math.random() * N_ARMS);
    }
    var best = 0, bestAvg = -1;
    for (var i = 0; i < N_ARMS; i++) {
      var avg = pulls[i] > 0 ? rewards[i] / pulls[i] : 0;
      if (avg > bestAvg) { bestAvg = avg; best = i; }
    }
    return best;
  }

  function chooseUCB1() {
    for (var i = 0; i < N_ARMS; i++) {
      if (pulls[i] === 0) return i;
    }
    var best = 0, bestScore = -Infinity;
    for (var i = 0; i < N_ARMS; i++) {
      var avg = rewards[i] / pulls[i];
      var score = avg + Math.sqrt(2 * Math.log(totalPulls) / pulls[i]);
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }

  function autoRun(n) {
    var strat = document.getElementById('bandit-strategy').value;
    for (var i = 0; i < n; i++) {
      var idx;
      if (strat === 'epsilon') {
        idx = chooseEpsilonGreedy();
      } else {
        idx = chooseUCB1();
      }
      pullArm(idx);
    }
  }

  function drawArms() {
    var w = canvas.width / devicePixelRatio;
    var h = canvas.height / devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    var accent = getCSS('--accent');
    var text = getCSS('--text');
    var border = getCSS('--border');
    var muted = getCSS('--text-muted');
    var panel = getCSS('--panel');

    var barW = Math.min(60, (w - 40) / N_ARMS - 20);
    var maxH = h - 70;
    var gap = (w - barW * N_ARMS) / (N_ARMS + 1);

    for (var i = 0; i < N_ARMS; i++) {
      var x = gap + i * (barW + gap);
      var est = pulls[i] > 0 ? rewards[i] / pulls[i] : 0;
      var barH = est * maxH;
      var intensity = Math.min(1, pulls[i] / (totalPulls || 1) * N_ARMS);

      // Bar background
      ctx.fillStyle = border;
      ctx.fillRect(x, h - 40 - maxH, barW, maxH);

      // Estimated value bar
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.3 + intensity * 0.7;
      ctx.fillRect(x, h - 40 - barH, barW, barH);
      ctx.globalAlpha = 1;

      // Border
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, h - 40 - maxH, barW, maxH);

      // Label
      ctx.fillStyle = text;
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Arm ' + (i + 1), x + barW / 2, h - 22);

      // Estimated value
      ctx.fillStyle = muted;
      ctx.font = '11px monospace';
      ctx.fillText(est.toFixed(2), x + barW / 2, h - 8);

      // Pull count
      ctx.fillStyle = muted;
      ctx.font = '10px sans-serif';
      ctx.fillText(pulls[i] + ' pulls', x + barW / 2, h - 44 - maxH);
    }

    // Title
    ctx.fillStyle = text;
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Estimated Reward per Arm', 10, 16);
  }

  function drawRegret() {
    var w = regretCanvas.width / devicePixelRatio;
    var h = regretCanvas.height / devicePixelRatio;
    rCtx.clearRect(0, 0, w, h);

    var accent = getCSS('--accent');
    var text = getCSS('--text');
    var border = getCSS('--border');
    var muted = getCSS('--text-muted');

    // Axes
    rCtx.strokeStyle = border;
    rCtx.lineWidth = 1;
    rCtx.beginPath();
    rCtx.moveTo(40, 10);
    rCtx.lineTo(40, h - 20);
    rCtx.lineTo(w - 10, h - 20);
    rCtx.stroke();

    if (regretHistory.length < 2) {
      rCtx.fillStyle = muted;
      rCtx.font = '11px sans-serif';
      rCtx.textAlign = 'center';
      rCtx.fillText('Cumulative regret will appear here', w / 2, h / 2);
      return;
    }

    var maxR = Math.max.apply(null, regretHistory) || 1;
    var xScale = (w - 55) / (regretHistory.length - 1);
    var yScale = (h - 35) / maxR;

    rCtx.beginPath();
    rCtx.strokeStyle = accent;
    rCtx.lineWidth = 1.5;
    for (var i = 0; i < regretHistory.length; i++) {
      var px = 40 + i * xScale;
      var py = h - 20 - regretHistory[i] * yScale;
      if (i === 0) rCtx.moveTo(px, py);
      else rCtx.lineTo(px, py);
    }
    rCtx.stroke();

    // Labels
    rCtx.fillStyle = muted;
    rCtx.font = '10px sans-serif';
    rCtx.textAlign = 'right';
    rCtx.fillText(maxR.toFixed(1), 36, 16);
    rCtx.fillText('0', 36, h - 18);
    rCtx.textAlign = 'center';
    rCtx.fillText('Pulls', w / 2, h - 4);
    rCtx.save();
    rCtx.translate(10, h / 2);
    rCtx.rotate(-Math.PI / 2);
    rCtx.fillText('Regret', 0, 0);
    rCtx.restore();
  }

  function updateStats() {
    var el = document.getElementById('bandit-stats');
    var bestArm = 0, bestEst = -1;
    for (var i = 0; i < N_ARMS; i++) {
      var est = pulls[i] > 0 ? rewards[i] / pulls[i] : 0;
      if (est > bestEst) { bestEst = est; bestArm = i; }
    }
    el.innerHTML =
      '<span>Pulls: <strong>' + totalPulls + '</strong></span>' +
      '<span>Total Reward: <strong>' + totalReward + '</strong></span>' +
      '<span>Regret: <strong>' + cumulativeRegret.toFixed(2) + '</strong></span>' +
      '<span>Best Arm: <strong>' + (totalPulls > 0 ? 'Arm ' + (bestArm + 1) : '--') + '</strong></span>';
  }

  // Manual pull - click on arm bars
  canvas.addEventListener('click', function (e) {
    var rect = canvas.getBoundingClientRect();
    var w = canvas.width / devicePixelRatio;
    var h = canvas.height / devicePixelRatio;
    var mx = e.clientX - rect.left;
    var barW = Math.min(60, (w - 40) / N_ARMS - 20);
    var gap = (w - barW * N_ARMS) / (N_ARMS + 1);

    for (var i = 0; i < N_ARMS; i++) {
      var x = gap + i * (barW + gap);
      if (mx >= x && mx <= x + barW) {
        pullArm(i);
        return;
      }
    }
  });

  document.getElementById('bandit-auto').addEventListener('click', function () { autoRun(100); });
  document.getElementById('bandit-reset').addEventListener('click', reset);

  window.addEventListener('resize', resize);
  reset();
  resize();
})();
