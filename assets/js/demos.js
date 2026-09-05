/*
 * Interactive demonstrations for /demos.html.
 *
 * Seven self-contained demos, each wired to plain DOM rather than a canvas so
 * every control is a real button, slider or link and reaches the keyboard for
 * free. Each demo owns its state and repaints only its own section.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  /* ====================================================================
     01 — Play against a planner: tic-tac-toe against MCTS.
     ==================================================================== */

  function plannerDemo() {
    var board = $('tt-board');
    if (!board) return;

    var statusEl = $('tt-status');
    var detailEl = $('tt-detail');
    var toggleEl = $('tt-toggle');

    var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6],
                 [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

    var state = { board: ['', '', '', '', '', '', '', '', ''], stats: null, done: false, result: null, last: null, show: true };
    var cells = [];

    function winner(b) {
      for (var i = 0; i < LINES.length; i++) {
        var a = LINES[i][0], c = LINES[i][1], d = LINES[i][2];
        if (b[a] && b[a] === b[c] && b[c] === b[d]) return b[a];
      }
      return b.indexOf('') === -1 ? 'draw' : null;
    }

    function moves(b) {
      var m = [];
      for (var i = 0; i < 9; i++) if (!b[i]) m.push(i);
      return m;
    }

    function rollout(start, turn) {
      var b = start.slice(), t = turn, w = winner(b);
      while (!w) {
        var m = moves(b);
        b[m[(Math.random() * m.length) | 0]] = t;
        t = t === 'X' ? 'O' : 'X';
        w = winner(b);
      }
      return w;
    }

    // UCB1 tree search. Rewards are scored for the player who moved into the
    // node, so a node's mean value reads as "how well that move worked out".
    // C is deliberately below the textbook sqrt(2): at 400 simulations over an
    // eight-move position sqrt(2) spreads the budget almost uniformly, which
    // both plays weakly and hides the selectivity this demo exists to show.
    var EXPLORATION = 0.7;

    function search(start, me, iterations) {
      function mk(b, turn, move) { return { b: b, turn: turn, move: move, N: 0, W: 0, kids: null }; }
      var root = mk(start.slice(), me, null);

      for (var i = 0; i < iterations; i++) {
        var node = root;
        var path = [node];
        while (true) {
          if (winner(node.b)) break;
          if (!node.kids) {
            node.kids = moves(node.b).map(function (mv) {
              var nb = node.b.slice();
              nb[mv] = node.turn;
              return mk(nb, node.turn === 'X' ? 'O' : 'X', mv);
            });
          }
          var fresh = node.kids.filter(function (k) { return k.N === 0; });
          if (fresh.length) {
            node = fresh[(Math.random() * fresh.length) | 0];
            path.push(node);
            break;
          }
          var best = node.kids[0], bestValue = -Infinity;
          for (var j = 0; j < node.kids.length; j++) {
            var k = node.kids[j];
            var v = k.W / k.N + EXPLORATION * Math.sqrt(Math.log(node.N) / k.N);
            if (v > bestValue) { bestValue = v; best = k; }
          }
          node = best;
          path.push(node);
        }
        var result = winner(node.b) || rollout(node.b, node.turn);
        for (var p = 0; p < path.length; p++) {
          var n = path[p];
          var mover = n.turn === 'X' ? 'O' : 'X';
          n.N++;
          n.W += result === 'draw' ? 0.5 : (result === mover ? 1 : 0);
        }
      }
      return root;
    }

    function render() {
      var total = 0;
      if (state.stats) {
        for (var key in state.stats) if (Object.prototype.hasOwnProperty.call(state.stats, key)) total += state.stats[key].n;
      }

      for (var i = 0; i < 9; i++) {
        var cell = cells[i];
        var mark = state.board[i];
        var stat = state.stats && state.stats[i];
        var showStat = state.show && stat && (!mark || i === state.last);

        cell.button.setAttribute('aria-label', 'Square ' + (i + 1) + ', ' + (mark || 'empty'));
        cell.button.classList.toggle('is-chosen', i === state.last);
        cell.button.disabled = Boolean(mark) || state.done;
        cell.mark.textContent = mark;
        cell.share.textContent = showStat ? Math.round((stat.n / (total || 1)) * 100) + '%' : '';
        cell.fill.style.height = showStat ? Math.round(stat.q * 100) + '%' : '0%';
      }

      var text = 'Your move — you are X.';
      if (state.result === 'X') text = 'You won.';
      else if (state.result === 'O') text = 'MCTS won.';
      else if (state.result === 'draw') text = 'A draw, which is the correct result.';
      statusEl.textContent = text;

      detailEl.textContent = state.stats
        ? '400 simulations. The search spent most of them on the move it played; the fill height in each remaining square is its estimated win rate from there.'
        : 'Make a move and the search will run 400 simulated games before replying.';

      toggleEl.textContent = state.show ? 'Hide the search statistics' : 'Show the search statistics';
    }

    function play(i) {
      if (state.board[i] || state.done) return;
      state.board[i] = 'X';
      state.stats = null;
      state.last = null;
      var w = winner(state.board);
      if (w) {
        state.done = true;
        state.result = w;
        render();
        return;
      }
      // Paint the human move before the search blocks the thread. A timer
      // rather than requestAnimationFrame, so the reply still arrives when
      // the tab is in the background.
      render();
      window.setTimeout(function () {
        var root = search(state.board, 'O', 400);
        var kids = root.kids || [];
        var pick = kids[0];
        for (var j = 0; j < kids.length; j++) if (kids[j].N > pick.N) pick = kids[j];
        var stats = {};
        for (var m = 0; m < kids.length; m++) stats[kids[m].move] = { n: kids[m].N, q: kids[m].N ? kids[m].W / kids[m].N : 0 };
        state.board[pick.move] = 'O';
        state.stats = stats;
        state.last = pick.move;
        var result = winner(state.board);
        state.done = Boolean(result);
        state.result = result;
        render();
      });
    }

    for (var i = 0; i < 9; i++) {
      var button = el('button', 'tt-cell');
      button.type = 'button';
      var fill = el('span', 'tt-fill');
      fill.setAttribute('aria-hidden', 'true');
      var share = el('span', 'tt-share');
      share.setAttribute('aria-hidden', 'true');
      var mark = el('span', 'tt-mark');
      mark.setAttribute('aria-hidden', 'true');
      button.appendChild(fill);
      button.appendChild(share);
      button.appendChild(mark);
      button.addEventListener('click', (function (index) {
        return function () { play(index); };
      })(i));
      board.appendChild(button);
      cells.push({ button: button, fill: fill, share: share, mark: mark });
    }

    $('tt-reset').addEventListener('click', function () {
      state = { board: ['', '', '', '', '', '', '', '', ''], stats: null, done: false, result: null, last: null, show: state.show };
      render();
    });
    toggleEl.addEventListener('click', function () {
      state.show = !state.show;
      render();
    });

    render();
  }

  /* ====================================================================
     02 — You versus UCB1: a five-armed bandit you and UCB1 both play.
     ==================================================================== */

  function banditDemo() {
    var container = $('bandit-arms');
    if (!container) return;

    var ARMS = 5;
    var state = newArms();
    var rows = [];

    function newArms() {
      var p = [];
      for (var i = 0; i < ARMS; i++) p.push(0.12 + Math.random() * 0.76);
      return {
        p: p,
        mine: [0, 0, 0, 0, 0], mineWin: [0, 0, 0, 0, 0],
        theirs: [0, 0, 0, 0, 0], theirsWin: [0, 0, 0, 0, 0],
        you: 0, ucb: 0, reveal: false
      };
    }

    function ucbChoice(b) {
      for (var i = 0; i < ARMS; i++) if (b.theirs[i] === 0) return i;
      var total = 0;
      for (var j = 0; j < ARMS; j++) total += b.theirs[j];
      var best = 0, bestValue = -Infinity;
      for (var k = 0; k < ARMS; k++) {
        var v = b.theirsWin[k] / b.theirs[k] + Math.sqrt(2 * Math.log(total) / b.theirs[k]);
        if (v > bestValue) { bestValue = v; best = k; }
      }
      return best;
    }

    // One round: your pull (when you made one), then UCB1's own pull.
    function step(myArm) {
      if (myArm !== null) {
        var r = Math.random() < state.p[myArm] ? 1 : 0;
        state.mine[myArm]++;
        state.mineWin[myArm] += r;
        state.you += r;
      }
      var arm = ucbChoice(state);
      var r2 = Math.random() < state.p[arm] ? 1 : 0;
      state.theirs[arm]++;
      state.theirsWin[arm] += r2;
      state.ucb += r2;
    }

    function sum(list) {
      var total = 0;
      for (var i = 0; i < list.length; i++) total += list[i];
      return total;
    }

    function render() {
      var bestP = Math.max.apply(null, state.p);
      var myPulls = sum(state.mine);
      var theirPulls = sum(state.theirs);

      for (var i = 0; i < ARMS; i++) {
        var estimate = state.mine[i] ? state.mineWin[i] / state.mine[i] : 0;
        rows[i].fill.style.height = Math.round(estimate * 100) + '%';
        rows[i].meta.textContent = 'you ' + state.mine[i] + ' · ucb1 ' + state.theirs[i] +
          (state.reveal ? ' · true ' + state.p[i].toFixed(2) : '');
      }

      $('bandit-you-pulls').textContent = String(myPulls);
      $('bandit-ucb-pulls').textContent = String(theirPulls);
      $('bandit-you').textContent = String(state.you);
      $('bandit-ucb').textContent = String(state.ucb);
      // Realised regret can dip below zero on a lucky first pull; the quantity
      // people mean is the shortfall, so it is reported from zero up.
      $('bandit-your-regret').textContent = Math.max(0, bestP * myPulls - state.you).toFixed(1);
      $('bandit-ucb-regret').textContent = Math.max(0, bestP * theirPulls - state.ucb).toFixed(1);
      $('bandit-reveal').textContent = state.reveal ? 'Hide true rates' : 'Reveal true rates';
    }

    for (var i = 0; i < ARMS; i++) {
      var wrap = el('div', 'bandit-arm');
      var track = el('div', 'bandit-track');
      track.setAttribute('aria-hidden', 'true');
      var fill = el('div', 'bandit-fill');
      track.appendChild(fill);

      var button = el('button', 'demo-button', 'Pull ' + (i + 1));
      button.type = 'button';
      button.addEventListener('click', (function (index) {
        return function () { step(index); render(); };
      })(i));

      var meta = el('p', 'bandit-meta', 'you 0 · ucb1 0');

      wrap.appendChild(track);
      wrap.appendChild(button);
      wrap.appendChild(meta);
      container.appendChild(wrap);
      rows.push({ fill: fill, meta: meta });
    }

    // Advancing only UCB1 would leave the two regrets counted over different
    // numbers of pulls, which makes the comparison the page invites
    // meaningless. Each round plays both: you repeat whichever arm you have
    // favoured so far, UCB1 keeps choosing for itself.
    $('bandit-auto').addEventListener('click', function () {
      var favourite = null;
      for (var a = 0; a < ARMS; a++) {
        if (state.mine[a] > 0 && (favourite === null || state.mine[a] > state.mine[favourite])) favourite = a;
      }
      for (var i = 0; i < 100; i++) step(favourite);
      render();
    });
    $('bandit-reveal').addEventListener('click', function () {
      state.reveal = !state.reveal;
      render();
    });
    $('bandit-reset').addEventListener('click', function () {
      state = newArms();
      render();
    });

    render();
  }

  /* ====================================================================
     03 — Prune the search tree: cut nodes and watch the visits move.
     ==================================================================== */

  function treeDemo() {
    var midHost = $('tree-mid');
    if (!midHost) return;

    var leafHost = $('tree-leaves');
    var statusEl = $('tree-status');
    var state = newTree();
    var midNodes = [];
    var leafNodes = [];
    var memoKey = null;
    var memoResult = null;

    function newTree() {
      var leaves = [];
      for (var i = 0; i < 9; i++) leaves.push(Math.round(Math.random() * 90 + 5) / 100);
      return { leaves: leaves, cut: {} };
    }

    function searchMemo() {
      var key = state.leaves.join(',') + '|' + Object.keys(state.cut).sort().join(',');
      if (memoKey !== key) { memoKey = key; memoResult = runSearch(); }
      return memoResult;
    }

    function runSearch() {
      var visits = { mid: [0, 0, 0], leaf: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
      var reward = { mid: [0, 0, 0], leaf: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
      var liveMid = [0, 1, 2].filter(function (i) {
        return !state.cut['m' + i] && [0, 1, 2].some(function (j) { return !state.cut['l' + (i * 3 + j)]; });
      });
      if (!liveMid.length) return { visits: visits, reward: reward, total: 0, best: -1 };

      var total = 0;
      for (var it = 0; it < 2000; it++) {
        var mid = liveMid[0];
        var unseen = liveMid.filter(function (i) { return visits.mid[i] === 0; });
        if (unseen.length) mid = unseen[(Math.random() * unseen.length) | 0];
        else {
          var bv = -Infinity;
          for (var a = 0; a < liveMid.length; a++) {
            var i2 = liveMid[a];
            var v = reward.mid[i2] / visits.mid[i2] + 1.414 * Math.sqrt(Math.log(total) / visits.mid[i2]);
            if (v > bv) { bv = v; mid = i2; }
          }
        }

        var liveLeaf = [0, 1, 2].map(function (j) { return mid * 3 + j; })
          .filter(function (k) { return !state.cut['l' + k]; });
        var leaf = liveLeaf[0];
        var unseenLeaf = liveLeaf.filter(function (k) { return visits.leaf[k] === 0; });
        if (unseenLeaf.length) leaf = unseenLeaf[(Math.random() * unseenLeaf.length) | 0];
        else {
          var bl = -Infinity;
          for (var b = 0; b < liveLeaf.length; b++) {
            var k2 = liveLeaf[b];
            var lv = reward.leaf[k2] / visits.leaf[k2] + 1.414 * Math.sqrt(Math.log(visits.mid[mid]) / visits.leaf[k2]);
            if (lv > bl) { bl = lv; leaf = k2; }
          }
        }

        var r = Math.max(0, Math.min(1, state.leaves[leaf] + (Math.random() - 0.5) * 0.16));
        visits.mid[mid]++; reward.mid[mid] += r;
        visits.leaf[leaf]++; reward.leaf[leaf] += r;
        total++;
      }

      var best = liveMid[0];
      for (var c = 0; c < liveMid.length; c++) if (visits.mid[liveMid[c]] > visits.mid[best]) best = liveMid[c];
      return { visits: visits, reward: reward, total: total, best: best };
    }

    function toggleCut(key) {
      if (state.cut[key]) delete state.cut[key]; else state.cut[key] = true;
      render();
    }

    function render() {
      var res = searchMemo();

      for (var i = 0; i < 3; i++) {
        var dead = Boolean(state.cut['m' + i]);
        var n = res.visits.mid[i];
        var node = midNodes[i];
        var letter = String.fromCharCode(65 + i);
        node.button.classList.toggle('is-cut', dead);
        node.button.classList.toggle('is-best', !dead && i === res.best);
        node.value.textContent = n ? (res.reward.mid[i] / n).toFixed(2) : '—';
        node.visits.textContent = dead ? 'cut' : n + ' visits';
        node.button.setAttribute('aria-label', 'Branch ' + letter + ' — ' + (dead ? 'cut from the search' : n + ' visits'));
      }

      for (var k = 0; k < 9; k++) {
        var branch = (k / 3) | 0;
        var leafDead = Boolean(state.cut['l' + k]) || Boolean(state.cut['m' + branch]);
        var leafNode = leafNodes[k];
        var leafVisits = res.visits.leaf[k];
        leafNode.button.classList.toggle('is-cut', leafDead);
        leafNode.button.classList.toggle('is-hot', !leafDead && leafVisits > res.total / 6);
        leafNode.value.textContent = state.leaves[k].toFixed(2);
        leafNode.visits.textContent = leafDead ? 'cut' : String(leafVisits);
        leafNode.button.setAttribute('aria-label',
          'Leaf ' + String.fromCharCode(65 + branch) + ((k % 3) + 1) +
          ', value ' + state.leaves[k].toFixed(2) + ', ' + (leafDead ? 'cut from the search' : leafVisits + ' visits'));
      }

      if (res.best < 0) {
        statusEl.textContent = 'Every branch is cut, so there is nothing left to search. Restore one.';
        return;
      }
      var bestLeafValue = -1;
      for (var m = 0; m < 9; m++) {
        if (state.cut['l' + m] || state.cut['m' + ((m / 3) | 0)]) continue;
        if (state.leaves[m] > bestLeafValue) bestLeafValue = state.leaves[m];
      }
      statusEl.textContent = 'The search put ' + Math.round((res.visits.mid[res.best] / res.total) * 100) +
        '% of its 2,000 simulations into branch ' + String.fromCharCode(65 + res.best) +
        ', whose best surviving leaf is worth ' + (bestLeafValue >= 0 ? bestLeafValue.toFixed(2) : '—') +
        '. Cut it and the simulations move to the next most promising branch.';
    }

    for (var i = 0; i < 3; i++) {
      var button = el('button', 'tree-node');
      button.type = 'button';
      var label = el('p', 'tree-node-label', 'Branch ' + String.fromCharCode(65 + i));
      label.setAttribute('aria-hidden', 'true');
      var value = el('p', 'tree-node-value');
      value.setAttribute('aria-hidden', 'true');
      var visits = el('p', 'tree-node-visits');
      visits.setAttribute('aria-hidden', 'true');
      button.appendChild(label);
      button.appendChild(value);
      button.appendChild(visits);
      button.addEventListener('click', (function (key) {
        return function () { toggleCut(key); };
      })('m' + i));
      midHost.appendChild(button);
      midNodes.push({ button: button, value: value, visits: visits });
    }

    for (var k = 0; k < 9; k++) {
      var leafButton = el('button', 'tree-leaf');
      leafButton.type = 'button';
      var leafValue = el('p', 'tree-leaf-value');
      leafValue.setAttribute('aria-hidden', 'true');
      var leafVisitsEl = el('p', 'tree-leaf-visits');
      leafVisitsEl.setAttribute('aria-hidden', 'true');
      leafButton.appendChild(leafValue);
      leafButton.appendChild(leafVisitsEl);
      leafButton.addEventListener('click', (function (key) {
        return function () { toggleCut(key); };
      })('l' + k));
      leafHost.appendChild(leafButton);
      leafNodes.push({ button: leafButton, value: leafValue, visits: leafVisitsEl });
    }

    $('tree-reset').addEventListener('click', function () { state = newTree(); render(); });
    $('tree-restore').addEventListener('click', function () { state.cut = {}; render(); });

    render();
  }

  /* ====================================================================
     04 — Break your own objective: exhaustive search over 4,096 schedules.
     ==================================================================== */

  function objectiveDemo() {
    var strip = $('schedule-strip');
    if (!strip) return;

    var PRICE = [0.09, 0.09, 0.10, 0.12, 0.16, 0.23, 0.29, 0.32, 0.24, 0.17, 0.13, 0.11];
    var TIMES = ['03:00', '03:30', '04:00', '04:30', '05:00', '05:30', '06:00',
                 '06:30', '07:00', '07:30', '08:00', '08:30'];
    var DEADLINE = 8;

    var columns = [];
    var pending = null;

    function solve(wC, wE, wD) {
      var bestJ = -Infinity, bestRun = null;
      for (var mask = 0; mask < 4096; mask++) {
        var T = 20, cost = 0;
        var temps = [], on = [];
        for (var k = 0; k < 12; k++) {
          var heat = (mask >> k) & 1;
          if (heat) { T += 6.8; cost += 1.5 * PRICE[k]; }
          T -= 0.5 + 0.022 * (T - 20);
          if (T > 95) T = 95;
          temps.push(T);
          on.push(heat);
        }
        var Td = temps[DEADLINE];
        var J = wC * (Td / 60) - wE * cost - (Td < 60 ? wD : 0);
        if (J > bestJ) { bestJ = J; bestRun = { temps: temps, on: on, cost: cost, Td: Td, miss: Td < 60 ? 1 : 0 }; }
      }
      return bestRun;
    }

    function verdictFor(run, onCount, wE, wD) {
      if (run.miss && wD === 0) {
        return 'No deadline penalty, so the optimiser simply never gets there. The water reaches ' +
          run.Td.toFixed(0) + '°C at seven o’clock and your objective is perfectly satisfied.';
      }
      if (run.miss) {
        return 'The optimiser missed the deadline on purpose: at these weights, ' + run.Td.toFixed(0) +
          '°C water is worth less than the electricity it would have cost. This is the failure a mean-reward plot hides.';
      }
      if (run.Td > 78) {
        return 'Look at the temperature: ' + run.Td.toFixed(0) +
          '°C. Your comfort term has no upper bound, so more heat is always more reward and the agent boils the tank through the most expensive hours.';
      }
      if (onCount === 0) {
        return 'The optimiser found the cheapest possible schedule — do nothing at all. Every weight you set is being satisfied by inaction.';
      }
      if (wE === 0) {
        return 'With no energy penalty the heater has no reason to wait for cheap electricity. It meets the deadline, and it costs £' +
          run.cost.toFixed(2) + ' to do it.';
      }
      return 'A sensible schedule: ' + onCount + ' half-hours of heating placed in the cheap early morning, ' +
        run.Td.toFixed(0) + '°C at the deadline for £' + run.cost.toFixed(2) +
        '. This is the behaviour the objective was meant to produce.';
    }

    function recompute() {
      var wC = Number($('w-comfort').value);
      var wE = Number($('w-energy').value);
      var wD = Number($('w-deadline').value);
      var run = solve(wC, wE, wD);
      var onCount = 0;
      for (var i = 0; i < run.on.length; i++) onCount += run.on[i];

      for (var k = 0; k < 12; k++) {
        var scaled = Math.max(0, Math.min(1, (run.temps[k] - 15) / 80));
        columns[k].fill.style.height = Math.round(scaled * 100) + '%';
        columns[k].heater.classList.toggle('is-on', Boolean(run.on[k]));
      }

      $('hack-temp').textContent = run.Td.toFixed(0) + '°C';
      $('hack-cost').textContent = '£' + run.cost.toFixed(2);
      $('hack-on').textContent = String(onCount);
      $('hack-met').textContent = run.miss ? 'missed' : 'met';
      $('hack-met').classList.toggle('is-alert', Boolean(run.miss));
      $('hack-verdict').textContent = verdictFor(run, onCount, wE, wD);
    }

    // The solve is an exhaustive 4,096-schedule sweep, so it runs on `change`
    // and on a short debounce while dragging; the readouts track every input.
    function scheduleRecompute() {
      if (pending) window.clearTimeout(pending);
      pending = window.setTimeout(function () { pending = null; recompute(); }, 60);
    }

    for (var k = 0; k < 12; k++) {
      var column = el('div', 'schedule-column');
      var track = el('div', 'schedule-track');
      var fill = el('div', 'schedule-fill');
      track.appendChild(fill);
      var heater = el('div', 'schedule-heater');
      var time = el('p', 'schedule-time', TIMES[k]);
      if (k === DEADLINE) time.classList.add('is-deadline');
      column.appendChild(track);
      column.appendChild(heater);
      column.appendChild(time);
      strip.appendChild(column);
      columns.push({ fill: fill, heater: heater });
    }

    ['comfort', 'energy', 'deadline'].forEach(function (name) {
      var input = $('w-' + name);
      var readout = $('w-' + name + '-value');
      input.addEventListener('input', function () {
        readout.textContent = input.value;
        scheduleRecompute();
      });
      input.addEventListener('change', function () {
        readout.textContent = input.value;
        if (pending) { window.clearTimeout(pending); pending = null; }
        recompute();
      });
    });

    recompute();
  }

  /* ====================================================================
     05 — Draw a world, watch it learn: editable Q-learning grid world.
     ==================================================================== */

  function gridDemo() {
    var host = $('ql-grid');
    if (!host) return;

    var N = 8;
    var ARROWS = ['↑', '↓', '←', '→'];
    var ARROW_NAMES = ['policy up', 'policy down', 'policy left', 'policy right'];
    var ACTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

    var state = { walls: {}, goal: N * N - 1, q: new Float64Array(N * N * 4), episodes: 0, mode: 'wall' };
    var buttons = [];

    function train() {
      var q = state.q;
      var eps = Math.max(0.05, 0.35 * Math.pow(0.995, state.episodes));
      for (var ep = 0; ep < 100; ep++) {
        var pos = 0;
        for (var step = 0; step < 220; step++) {
          if (pos === state.goal) break;
          var a;
          if (Math.random() < eps) a = (Math.random() * 4) | 0;
          else {
            a = 0;
            for (var k = 1; k < 4; k++) if (q[pos * 4 + k] > q[pos * 4 + a]) a = k;
          }
          var r0 = (pos / N) | 0, c0 = pos % N;
          var r1 = r0 + ACTIONS[a][0], c1 = c0 + ACTIONS[a][1];
          if (r1 < 0 || r1 >= N || c1 < 0 || c1 >= N) { r1 = r0; c1 = c0; }
          var next = r1 * N + c1;
          if (state.walls[next]) next = pos;
          var done = next === state.goal;
          var reward = done ? 1 : -0.04;
          var mx = q[next * 4];
          for (var m = 1; m < 4; m++) if (q[next * 4 + m] > mx) mx = q[next * 4 + m];
          var idx = pos * 4 + a;
          q[idx] += 0.1 * (reward + (done ? 0 : 0.95 * mx) - q[idx]);
          pos = next;
        }
        eps = Math.max(0.05, eps * 0.995);
      }
      state.episodes += 100;
    }

    function editCell(i) {
      if (i === 0) return;
      if (state.mode === 'goal') {
        state.goal = i;
        delete state.walls[i];
      } else {
        if (i === state.goal) return;
        if (state.walls[i]) delete state.walls[i]; else state.walls[i] = true;
      }
      render();
    }

    function render() {
      var maxQ = 0.0001;
      for (var i = 0; i < state.q.length; i++) if (state.q[i] > maxQ) maxQ = state.q[i];

      for (var c = 0; c < N * N; c++) {
        var button = buttons[c];
        var row = ((c / N) | 0) + 1;
        var col = (c % N) + 1;
        var mark = '';
        var description = 'empty';

        button.classList.remove('is-wall', 'is-goal', 'is-start');
        button.style.removeProperty('background-color');

        if (state.walls[c]) {
          button.classList.add('is-wall');
          description = 'wall';
        } else if (c === state.goal) {
          button.classList.add('is-goal');
          mark = 'G';
          description = 'goal';
        } else if (c === 0) {
          button.classList.add('is-start');
          mark = 'S';
          description = 'start';
        } else if (state.episodes) {
          var a = 0;
          for (var k = 1; k < 4; k++) if (state.q[c * 4 + k] > state.q[c * 4 + a]) a = k;
          var value = state.q[c * 4 + a];
          if (value > 0.001) {
            mark = ARROWS[a];
            description = ARROW_NAMES[a];
            var alpha = Math.min(0.5, (value / maxQ) * 0.5);
            button.style.backgroundColor = 'color-mix(in srgb, var(--accent) ' + Math.round(alpha * 100) + '%, var(--ground))';
          }
        }

        button.textContent = mark;
        button.setAttribute('aria-label', 'Row ' + row + ', column ' + col + ', ' + description);
      }

      $('ql-status').textContent = state.episodes ? state.episodes + ' episodes trained' : 'Untrained';
      $('ql-detail').textContent = state.mode === 'wall'
        ? 'Clicking a cell adds or removes a wall. The agent starts at S and is rewarded for reaching G.'
        : 'Clicking a cell moves the goal there. Switch back to draw walls.';
      $('ql-mode').textContent = state.mode === 'wall' ? 'Switch to moving the goal' : 'Switch to drawing walls';
    }

    for (var i = 0; i < N * N; i++) {
      var button = el('button', 'ql-cell');
      button.type = 'button';
      button.addEventListener('click', (function (index) {
        return function () { editCell(index); };
      })(i));
      host.appendChild(button);
      buttons.push(button);
    }

    $('ql-train').addEventListener('click', function () {
      train();
      render();
    });
    $('ql-reset').addEventListener('click', function () {
      state.q = new Float64Array(N * N * 4);
      state.episodes = 0;
      render();
    });
    $('ql-mode').addEventListener('click', function () {
      state.mode = state.mode === 'wall' ? 'goal' : 'wall';
      render();
    });

    render();
  }

  /* ====================================================================
     06 — One seed is not a result: twelve runs, one set of hyperparameters.
     ==================================================================== */

  function seedDemo() {
    var host = $('seed-table');
    if (!host) return;

    var RUNS = 12;
    var POINTS = 60;

    function runSeeds() {
      var runs = [];
      for (var s = 0; s < RUNS; s++) {
        var seed = (Math.random() * 1e9) | 0;
        var rnd = function () {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          return seed / 0x7fffffff;
        };
        var collapses = rnd() < 0.22;
        var collapseAt = 18 + ((rnd() * 30) | 0);
        var rate = 0.055 + rnd() * 0.05;
        var ceiling = 0.62 + rnd() * 0.34;
        var cells = [];
        var v = 0.04, dead = false;
        for (var t = 0; t < POINTS; t++) {
          if (collapses && t === collapseAt) dead = true;
          if (dead) v = Math.max(0, v - 0.09);
          else v = v + rate * (ceiling - v) + (rnd() - 0.5) * 0.05;
          cells.push(Math.max(0, Math.min(1, v)));
        }
        runs.push({ cells: cells, collapsed: dead });
      }
      return runs;
    }

    function render(runs) {
      clear(host);
      var finals = runs.map(function (r) { return r.cells[POINTS - 1]; });
      var sorted = finals.slice().sort(function (a, b) { return a - b; });

      runs.forEach(function (run, i) {
        var row = el('div', 'seed-row');
        var label = el('p', 'seed-label', 'seed ' + (i + 1));
        if (run.collapsed) label.classList.add('is-collapsed');
        var track = el('div', 'seed-cells');
        track.setAttribute('aria-hidden', 'true');
        run.cells.forEach(function (v) {
          var cell = el('div', 'seed-cell');
          cell.style.backgroundColor = 'color-mix(in srgb, var(--ink) ' + Math.round(v * 78) + '%, var(--ground))';
          track.appendChild(cell);
        });
        var final = el('p', 'seed-final', run.collapsed ? 'collapsed' : run.cells[POINTS - 1].toFixed(2));
        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(final);
        host.appendChild(row);
      });

      var best = sorted[RUNS - 1];
      var worst = sorted[0];
      var median = (sorted[RUNS / 2 - 1] + sorted[RUNS / 2]) / 2;
      var collapsed = runs.filter(function (r) { return r.collapsed; }).length;

      $('seed-best').textContent = best.toFixed(2);
      $('seed-median').textContent = median.toFixed(2);
      $('seed-worst').textContent = worst.toFixed(2);
      $('seed-collapsed').textContent = collapsed + ' of ' + RUNS;
      $('seed-claim-best').textContent = '“The method reaches ' + best.toFixed(2) +
        ' on this task.” True of one run out of twelve, and the sentence contains nothing that is factually wrong.';
      $('seed-claim-honest').textContent = '“Median ' + median.toFixed(2) + ', range ' + worst.toFixed(2) +
        ' to ' + best.toFixed(2) + ', with ' + collapsed + ' of ' + RUNS +
        ' runs failing to converge.” Same experiment, and now a reader can judge whether to rely on it.';
    }

    $('seed-rerun').addEventListener('click', function () { render(runSeeds()); });
    render(runSeeds());
  }

  /* ====================================================================
     07 — Recover the physics: pick library terms, sparse regression fits.
     ==================================================================== */

  function physicsDemo() {
    var host = $('sindy-terms');
    if (!host) return;

    var LIBRARY = [
      { key: 'one', label: '1', f: function () { return 1; }, truth: true },
      { key: 'T', label: 'T', f: function (p) { return p.T; }, truth: true },
      { key: 'u', label: 'u', f: function (p) { return p.u; }, truth: true },
      { key: 'T2', label: 'T²', f: function (p) { return p.T * p.T / 100; }, truth: false },
      { key: 'Tu', label: 'T · u', f: function (p) { return p.T * p.u / 10; }, truth: false },
      { key: 'sinT', label: 'sin T', f: function (p) { return Math.sin(p.T / 8); }, truth: false },
      { key: 'T3', label: 'T³', f: function (p) { return p.T * p.T * p.T / 10000; }, truth: false }
    ];
    var TRAIN_SAMPLES = 14;

    var selected = { one: true, T: true, u: true };
    var noisy = false;
    var termNodes = [];

    function data() {
      var pts = [];
      var T = 68;
      var seed = 20260903;
      var rnd = function () {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      var amp = noisy ? 0.9 : 0.18;
      for (var i = 0; i < 100; i++) {
        var u = (i % 17) < 5 ? 1 : 0;
        var dT = 1.1 - 0.055 * T + 3.4 * u;
        pts.push({ T: T, u: u, dT: dT + (rnd() - 0.5) * amp });
        T = Math.max(18, Math.min(95, T + dT * 0.5));
      }
      return pts;
    }

    // Normal equations with a small ridge, solved by Gauss-Jordan.
    function lstsq(A, y) {
      var k = A[0].length;
      var M = [];
      for (var i = 0; i < k; i++) {
        M.push(new Array(k + 1).fill(0));
        for (var j = 0; j < k; j++) for (var r = 0; r < A.length; r++) M[i][j] += A[r][i] * A[r][j];
        for (var r2 = 0; r2 < A.length; r2++) M[i][k] += A[r2][i] * y[r2];
        M[i][i] += 1e-8;
      }
      for (var c = 0; c < k; c++) {
        var piv = c;
        for (var r3 = c + 1; r3 < k; r3++) if (Math.abs(M[r3][c]) > Math.abs(M[piv][c])) piv = r3;
        var tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
        if (Math.abs(M[c][c]) < 1e-12) continue;
        for (var r4 = 0; r4 < k; r4++) {
          if (r4 === c) continue;
          var factor = M[r4][c] / M[c][c];
          for (var j2 = c; j2 <= k; j2++) M[r4][j2] -= factor * M[c][j2];
        }
      }
      var out = [];
      for (var i2 = 0; i2 < k; i2++) out.push(Math.abs(M[i2][i2]) < 1e-12 ? 0 : M[i2][k] / M[i2][i2]);
      return out;
    }

    function render() {
      var points = data();
      var chosen = LIBRARY.filter(function (t) { return selected[t.key]; });
      var train = points.slice(0, TRAIN_SAMPLES);
      var test = points.slice(TRAIN_SAMPLES);
      var coefs = [], trainErr = 0, testErr = 0;

      if (chosen.length) {
        var A = train.map(function (p) { return chosen.map(function (t) { return t.f(p); }); });
        var y = train.map(function (p) { return p.dT; });
        coefs = lstsq(A, y);
        var rmse = function (set) {
          var acc = 0;
          for (var i = 0; i < set.length; i++) {
            var pred = 0;
            for (var j = 0; j < chosen.length; j++) pred += coefs[j] * chosen[j].f(set[i]);
            acc += (pred - set[i].dT) * (pred - set[i].dT);
          }
          return Math.sqrt(acc / set.length);
        };
        trainErr = rmse(train);
        testErr = rmse(test);
      }

      LIBRARY.forEach(function (term, i) {
        var on = Boolean(selected[term.key]);
        var node = termNodes[i];
        var index = chosen.findIndex(function (t) { return t.key === term.key; });
        node.button.classList.toggle('is-on', on);
        node.tick.textContent = on ? '●' : '○';
        node.coef.textContent = index < 0 ? '' : (coefs[index] >= 0 ? '+' : '−') + Math.abs(coefs[index]).toFixed(3);
        node.button.setAttribute('aria-label',
          (on ? 'Remove ' + term.label + ' from the equation' : 'Add ' + term.label + ' to the equation'));
      });

      var equation = 'dT/dt = ';
      if (!chosen.length) equation = 'dT/dt = ?  — select at least one term';
      else {
        equation += chosen.map(function (t, i) {
          var lead = i ? (coefs[i] >= 0 ? ' + ' : ' − ') : (coefs[i] < 0 ? '− ' : '');
          return lead + Math.abs(coefs[i]).toFixed(3) + (t.key === 'one' ? '' : ' · ' + t.label);
        }).join('');
      }
      $('sindy-equation').textContent = equation;
      $('sindy-count').textContent = String(chosen.length);
      $('sindy-train').textContent = chosen.length ? trainErr.toFixed(3) : '—';
      $('sindy-test').textContent = chosen.length ? testErr.toFixed(3) : '—';
      $('sindy-test').classList.toggle('is-alert', Boolean(chosen.length) && testErr > trainErr * 5);
      $('sindy-noise').textContent = noisy ? 'Use clean measurements' : 'Use noisy measurements';

      var extra = chosen.filter(function (t) { return !t.truth; }).length;
      var missing = 3 - chosen.filter(function (t) { return t.truth; }).length;
      var verdict;
      if (!chosen.length) {
        verdict = 'Nothing selected. The true law needs a constant, a term in T and a term in the heater input.';
      } else if (missing > 0 && extra === 0) {
        verdict = 'Underspecified: ' + missing +
          ' of the three real terms are missing, so both errors stay high. No amount of fitting recovers a term that is not in the library you offered.';
      } else if (missing === 0 && extra === 0) {
        verdict = 'This is the true model. Held-out error ' + testErr.toFixed(3) +
          ' is essentially the measurement noise, the coefficients are readable as physics — a cooling rate and a heater gain — and you can tell a building engineer what it means.';
      } else if (missing === 0 && extra > 0) {
        verdict = 'Fit error fell to ' + trainErr.toFixed(3) + ' but held-out error is ' + testErr.toFixed(3) +
          '. The ' + extra + ' extra term' + (extra > 1 ? 's are' : ' is') +
          ' fitting noise, and the physical coefficients have shifted to compensate — the model still predicts, but it no longer explains.';
      } else {
        verdict = 'Wrong terms and missing terms together: the regression compensates with whatever is available, which is how a model can look adequate on its training data and mean nothing.';
      }
      $('sindy-verdict').textContent = verdict;
    }

    LIBRARY.forEach(function (term) {
      var button = el('button', 'sindy-term');
      button.type = 'button';
      var tick = el('span', 'sindy-tick');
      tick.setAttribute('aria-hidden', 'true');
      var label = el('span', 'sindy-label', term.label);
      label.setAttribute('aria-hidden', 'true');
      var coef = el('span', 'sindy-coef');
      coef.setAttribute('aria-hidden', 'true');
      button.appendChild(tick);
      button.appendChild(label);
      button.appendChild(coef);
      button.addEventListener('click', function () {
        if (selected[term.key]) delete selected[term.key]; else selected[term.key] = true;
        render();
      });
      host.appendChild(button);
      termNodes.push({ button: button, tick: tick, coef: coef });
    });

    $('sindy-true').addEventListener('click', function () {
      selected = { one: true, T: true, u: true };
      render();
    });
    $('sindy-all').addEventListener('click', function () {
      selected = {};
      LIBRARY.forEach(function (t) { selected[t.key] = true; });
      render();
    });
    $('sindy-clear').addEventListener('click', function () { selected = {}; render(); });
    $('sindy-noise').addEventListener('click', function () { noisy = !noisy; render(); });

    render();
  }

  function start() {
    plannerDemo();
    banditDemo();
    treeDemo();
    objectiveDemo();
    gridDemo();
    seedDemo();
    physicsDemo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
