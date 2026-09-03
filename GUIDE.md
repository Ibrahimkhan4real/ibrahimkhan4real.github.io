# Site Technical Guide

This guide explains the grounded research guide and the four interactive learning demos. Reproducible environment commands live in [`DEVELOPMENT.md`](DEVELOPMENT.md); the maintained RAG acceptance matrix lives in [`RAG_EVALUATION.md`](RAG_EVALUATION.md).

---

## Table of Contents

1. [Research Guide — Setup and Operations](#1-research-guide--setup-and-operations)
2. [Research Guide — How It Works](#2-research-guide--how-it-works)
3. [Demo 1: MCTS Decision Tree Visualization](#3-demo-1-mcts-decision-tree-visualization)
4. [Demo 2: Q-Learning Grid World](#4-demo-2-q-learning-grid-world)
5. [Demo 3: MCTS vs Greedy Comparison](#5-demo-3-mcts-vs-greedy-comparison)
6. [Demo 4: Multi-Armed Bandit Playground](#6-demo-4-multi-armed-bandit-playground)
7. [How the Rendering Works (All Demos)](#7-how-the-rendering-works-all-demos)

---

## 1. Research Guide — Setup and Operations

The guide is a Cloudflare Worker-backed public research interface. It is useful without an API key: deterministic facts, evaluated lexical retrieval, policy refusals, citations, and extractive fallback all run from the checked-in corpus.

### Build the public corpus

From the repository root:

```bash
python3 scripts/build_rag_index.py --no-embeddings
python3 scripts/build_rag_index.py --check
npm run test:rag
```

The indexer reads only reviewed profile, current-work, project, publication, explainer, resource, and Blog sources. It does not crawl the repository or parse the raw CV. The generated file is `worker/src/rag_index.json`.

Optional semantic ranking uses a complete embedding set. A partial or dimension-mismatched result never replaces the current index:

```bash
export GEMINI_API_KEY="your-key"
python3 scripts/build_rag_index.py
```

### Validate the Worker

```bash
npm --prefix worker ci
npm --prefix worker test
npm --prefix worker run deploy:dry-run
```

The tests cover the 100-question audience and policy matrix, typos, direct facts, privacy and prompt injection, unsupported questions, feed failure, provider failure, request limits, exact CORS behavior, safe API-key handling, and source serialization.

### Configure and deploy

The production frontend reads its Worker endpoint from `chat_api` in `_config.yml`; the current value is `https://ibrahim-research-chat.immicoc1.workers.dev`. Do not duplicate this endpoint in a layout script.

`worker/wrangler.toml` holds the exact production origin and public feed URL. For a browser-based local session, add only the exact temporary local origin to `ALLOWED_ORIGINS`; do not weaken the production allowlist.

Store the provider key as a Worker secret:

```bash
cd worker
npx wrangler secret put GEMINI_API_KEY
```

Deployment is deliberately separate from validation and requires an explicit decision:

```bash
npx wrangler deploy
```

See [`worker/README.md`](worker/README.md) for the response schema, configuration keys, model identifiers, and failure behavior.

---

## 2. Research Guide — How It Works

RAG means Retrieval-Augmented Generation: retrieve public evidence first, then answer from that evidence. This implementation adds deterministic routing so questions that should never reach a model are handled before retrieval or provider use.

### Request pipeline

```text
Browser
  -> validate origin, method, type, size, query and short history
  -> policy-first route: privacy, private research, injection, unrelated
  -> deterministic public fact when available
  -> merge checked-in corpus with the current public rag-feed.json
  -> evaluated aliases plus weighted lexical retrieval
  -> optional semantic reranking when every embedding is compatible
  -> source-constrained Gemini generation when a key is configured
  -> grounded extractive fallback when no key or provider is unavailable
  -> answer, mode, public sources, freshness and diagnostic metadata
```

### Retrieval and evidence

Each chunk has a stable ID, title, kind, public URL, text, search questions, keywords, and content hash. Evaluated question aliases receive a strong exact-match boost; title, question, keyword, and body matches have separate weights. Minor typo tolerance helps natural queries, while a relevance threshold prevents unrelated content from being forced into an answer.

The live `rag-feed.json` uses the same schema for public profile, themes, current work, projects, papers, explainers, resources, and posts. Fresh chunks replace matching stable IDs rather than creating duplicates. If the feed fails, the checked-in corpus remains usable.

### Direct answers and policies

Stable facts such as the public name, contact links, CV, roles, latest Blog entry, and publication snapshot can be formatted deterministically. Privacy, private-research, prompt-injection, and unrelated requests return fixed policy responses with no retrieved context and no provider call.

Conversation history is limited and validated for continuity only. It is treated as untrusted text, never as factual evidence or instruction. Public source records are delimited in the model prompt and the model is asked to cite them with source markers.

### Security and failure behavior

- The browser never receives the Gemini key.
- Provider keys travel in the `x-goog-api-key` header, not in URLs.
- Only exact allowed origins receive CORS access.
- Body, query, and history sizes are bounded.
- Upstream requests have timeouts.
- Only public HTTPS source URLs are returned.
- The frontend renders answers with text nodes and rejects unsafe source schemes.
- Feed and provider outages fall back to local grounded behavior.
- An optional Cloudflare rate-limiter binding is honored when configured.

### Core files

| File | Role |
|---|---|
| `scripts/build_rag_index.py` | Validates structured sources and atomically builds the corpus |
| `_data/rag_questions.json` | 100-question retrieval and safety evaluation matrix |
| `worker/src/retrieval.js` | Policy routing, intents, direct answers, merge, lexical and semantic ranking |
| `worker/src/index.js` | HTTP boundary, rate limiting, fresh feed, provider calls and response serialization |
| `worker/src/rag_index.json` | Checked-in public corpus, optionally with a complete embedding set |
| `rag-feed.json` | Server-rendered public freshness feed |
| `_layouts/default.html` | Accessible chat UI, safe rendering, privacy notice and citations |
| `worker/test/` | Retrieval and Worker HTTP/provider regression suites |
| `tests/smoke/chat.spec.js` | Responsive frontend, XSS, source, clear-history and error-state checks |

---
## 3. Demo 1: MCTS Decision Tree Visualization

**File:** `assets/js/mcts-demo.js`

This demo shows how Monte Carlo Tree Search works by animating each of the four phases on a binary tree.

### What MCTS is

MCTS is a search algorithm for making decisions. Given a tree of possible actions and outcomes, MCTS figures out which action is best by running many simulated "playouts". Unlike exhaustive search (which tries every path), MCTS focuses its effort on the most promising branches.

It repeats four phases, over and over:

### Phase 1 — Selection (amber)

Starting from the root, walk down the tree picking the "best" child at each level until you reach a node that has an unvisited child. "Best" is determined by the **UCB1 formula**:

```
UCB1(child) = (child.totalReward / child.visits) + C × √(ln(parent.visits) / child.visits)
```

- The first term is **exploitation** — prefer nodes with high average reward.
- The second term is **exploration** — prefer nodes that haven't been visited much (the `ln(parent) / child` ratio is large when `child.visits` is small).
- `C = √2` controls the balance. Higher C means more exploration.

In the code (line 61-91), the `select()` function walks down the tree. If any child has `visits === 0`, it picks that child immediately (unexplored nodes have infinite UCB1 score). Otherwise it computes UCB1 for each child and picks the highest.

### Phase 2 — Expansion (green)

The node reached by selection is the "expanded" node. It hasn't been evaluated yet. In the visualisation, it turns green briefly.

### Phase 3 — Simulation / Rollout (purple)

From the expanded node, take random actions all the way down to a leaf node. The leaf's reward value becomes the result of this simulation. This is called a "rollout" because you're rolling out a random policy.

In the code (line 94-102), `rollout()` randomly picks a child at each level until it hits a leaf, then returns `{ reward, path }`.

### Phase 4 — Backpropagation (red)

Walk back up the selection path and update every node along it:
- Increment its `visits` counter
- Add the rollout reward to its `totalReward`

This is how information flows upward. After many iterations, the root's children have accurate reward estimates, and the most-visited child is the best action.

In the code (line 105-110), `backprop()` simply loops through the path and increments both values.

### What you see on screen

- **Internal nodes** show two numbers: visit count (top) and average reward (bottom, which is `totalReward / visits`).
- **Leaf nodes** show their fixed reward value (randomly assigned at initialisation).
- **Node opacity** increases with visit count — heavily explored branches appear bolder.
- The **legend** at the bottom maps colours to phases.
- The **phase label** in the top-right shows which phase is currently highlighted.
- Clicking "Step" advances through one phase at a time (4 clicks = 1 full MCTS iteration). The phases auto-advance with a 600ms delay.

### Why the tree structure

The tree is a complete binary tree of depth 4, giving 16 leaf nodes with random reward values (0.0 to 10.0). This is small enough to visualise but large enough to show how MCTS focuses on promising branches. After ~20 iterations you can clearly see that high-reward leaves get more visits from their ancestor nodes.

---

## 4. Demo 2: Q-Learning Grid World

**File:** `assets/js/qlearning-demo.js`

This demo teaches a tabular Q-learning agent to navigate an 8x8 grid from a start cell (top-left) to a goal cell (bottom-right), avoiding walls.

### What Q-Learning is

Q-learning is a reinforcement learning algorithm that learns the **value of each action in each state** through trial and error, without needing a model of the environment. It maintains a table `Q[state][action]` and updates it after every step.

### The Q-table

The agent's knowledge is stored in a 3D array: `Q[row][col][action]`, where `action` is one of 4 directions (left, right, up, down). Initially all values are 0 (the agent knows nothing).

Each entry `Q[r][c][a]` answers: "If I'm at cell (r,c) and take action `a`, what's the expected cumulative reward from here?"

### The update rule

After taking action `a` in state `(r,c)`, receiving reward `r`, and landing in state `(nr, nc)`:

```
Q[r][c][a] = Q[r][c][a] + α × (reward + γ × max(Q[nr][nc]) - Q[r][c][a])
```

In the code (line 196-198):

```javascript
var oldQ = Q[r][c][aIdx];
var nextMax = Math.max.apply(null, Q[nr][nc]);
Q[r][c][aIdx] = oldQ + ALPHA * (reward + GAMMA * nextMax - oldQ);
```

Breaking down the terms:
- `α = 0.1` (ALPHA) — **learning rate**. How much new information overrides old. Too high = unstable. Too low = learns slowly.
- `γ = 0.95` (GAMMA) — **discount factor**. How much future reward matters vs immediate reward. 0.95 means future rewards are almost as important as immediate ones.
- `reward + γ × max(Q[nr][nc])` — the **target**. The actual reward received plus the estimated future value of the best action from the next state.
- `target - oldQ` — the **TD error** (temporal difference). If positive, the action was better than expected. If negative, worse.

### Exploration vs exploitation (epsilon-greedy)

The agent needs to balance trying new things (exploration) with doing what it already knows works (exploitation). It uses **epsilon-greedy**:

- With probability `ε`, pick a random action (explore).
- With probability `1-ε`, pick the action with the highest Q-value (exploit).

In the code (line 175-181):

```javascript
if (Math.random() < epsilon) {
  aIdx = Math.floor(Math.random() * 4);  // random action
} else {
  aIdx = qVals.indexOf(maxV);            // best known action
}
```

`ε` starts at 1.0 (100% random) and decays by 0.995 per episode, down to a minimum of 0.01. This means early episodes are mostly exploration (the agent tries everything), and later episodes are mostly exploitation (the agent follows what it learned).

### Rewards

- **+1** for reaching the goal
- **-1** for hitting a wall or going out of bounds (the agent stays in place)
- **-0.01** for each step (small cost to encourage shorter paths)

### What you see on screen

- **Arrows** show the best action (highest Q-value) for each cell. After sufficient training, arrows form a clear path from S to G.
- **Cell colour intensity** shows the maximum Q-value for that cell (heatmap). Cells near the goal are brighter because their future reward is higher.
- **Grey cells** are walls. Click to toggle them.
- **"G"** marks the goal. Shift-click or right-click to move it.
- **Stats** show episode count, total accumulated reward, and current epsilon.
- **"Train 1 Episode"** runs one episode with animation (you can watch the dot move). **"Train 100"** runs 100 episodes instantly (no animation, just updates the Q-table).

### Why the arrows converge

After ~200 episodes, every cell's arrow points toward the shortest path to the goal. This happens because:
1. Cells adjacent to the goal learn `Q ≈ 1` for the action that moves toward G.
2. Cells two steps away learn `Q ≈ γ × 1 = 0.95` for moving toward those cells.
3. This propagates backward: cell three steps away learns `Q ≈ γ² ≈ 0.90`, etc.

The discount factor creates a "gradient" flowing from the goal outward.

---

## 5. Demo 3: MCTS vs Greedy Comparison

**File:** `assets/js/mcts-vs-greedy-demo.js`

This demo runs MCTS and a Greedy strategy on the same randomly generated binary tree to show why exploration matters.

### The setup

A binary tree of depth 4 is generated with 16 leaf nodes. Each leaf gets a random reward between 1.0 and 9.0, except one random leaf which gets a high reward between 15.0 and 20.0. Both algorithms receive a copy of the same tree and must find a path from root to a leaf.

### How Greedy works

The greedy algorithm makes one pass from root to leaf. At each internal node, it:

1. Takes a single random sample from each child subtree (one random rollout to a leaf).
2. Picks the child whose sample had a higher reward.
3. Commits to that child and never looks back.

In the code (line 59-65), `greedySample()` does a random walk to a leaf:

```javascript
function greedySample(node) {
  var current = node;
  while (!current.isLeaf) {
    current = current.children[Math.floor(Math.random() * current.children.length)];
  }
  return current.reward;
}
```

The problem: with only one sample per child, the greedy strategy is easily fooled. If the high-reward leaf happens to be in a subtree where the single random sample lands on a low-reward leaf, greedy will pick the wrong branch. And once it commits, it can never recover.

### How MCTS works here

MCTS runs 100 iterations of the Select → Expand → Rollout → Backpropagate cycle (same algorithm as Demo 1). After all iterations, it follows the **most-visited child** at each level to pick its final path.

In the code (line 138-150), `findBestMCTSPath()` follows most-visited children (standard MCTS practice — visit count is more robust than average reward):

```javascript
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
```

### Why MCTS usually wins

With 100 iterations and 16 leaves, MCTS explores each leaf roughly 6 times on average. The UCB1 exploration bonus ensures it doesn't ignore any branch entirely. When it samples the high-reward leaf (even once), the reward propagates up and attracts more visits to that branch. Over many iterations, the branch containing the best leaf accumulates the most visits.

Greedy, by contrast, makes irreversible decisions based on a single sample at each level. It has a roughly 50% chance of going wrong at each branch point, and 4 branch points to pass through.

### What you see

- **Left canvas**: MCTS tree. Node numbers show visit counts. The highlighted path (after completion) shows the most-visited route.
- **Right canvas**: Greedy tree. The highlighted path shows where greedy committed.
- **Stats**: Iteration counts and the reward at each algorithm's chosen leaf, plus a winner label.
- **"New Tree"**: Generates a fresh random tree.
- **"Step"**: Runs one MCTS iteration + one greedy step (until greedy finishes).
- **"Run Comparison"**: Runs greedy to completion immediately, then animates 100 MCTS iterations.
- **Speed slider**: Controls animation speed.

---

## 6. Demo 4: Multi-Armed Bandit Playground

**File:** `assets/js/bandit-demo.js`

This demo illustrates the **exploration vs exploitation dilemma** — the fundamental trade-off in reinforcement learning.

### The problem

You have 5 slot machines ("arms"). Each arm pays out 1 with some hidden probability `p` and 0 otherwise (a Bernoulli distribution). You don't know the probabilities. Your goal is to maximise total reward over many pulls.

The dilemma: do you keep pulling the arm that's been paying well (exploit), or try other arms that might be even better (explore)?

### The arms

At reset, each arm gets a random hidden probability between 0.1 and 0.9:

```javascript
arms.push(Math.random() * 0.8 + 0.1);
```

The optimal strategy (if you knew the probabilities) would be to always pull the arm with the highest `p`. Since you don't, you have to estimate.

### Strategy 1: Epsilon-Greedy

With probability `ε = 0.1`, pick a random arm (explore). Otherwise, pick the arm with the highest estimated reward (exploit).

In the code (line 63-74):

```javascript
function chooseEpsilonGreedy() {
  if (Math.random() < 0.1 || totalPulls === 0) {
    return Math.floor(Math.random() * N_ARMS);  // 10% random
  }
  // Otherwise pick arm with highest average reward
  var best = 0, bestAvg = -1;
  for (var i = 0; i < N_ARMS; i++) {
    var avg = pulls[i] > 0 ? rewards[i] / pulls[i] : 0;
    if (avg > bestAvg) { bestAvg = avg; best = i; }
  }
  return best;
}
```

The estimated reward for each arm is simply: `total wins / total pulls` for that arm.

### Strategy 2: UCB1

UCB1 (Upper Confidence Bound) is smarter. Instead of random exploration, it picks the arm that maximises:

```
score = estimated_reward + √(2 × ln(total_pulls) / arm_pulls)
```

The second term is a **confidence bonus** — it's large for arms with few pulls (high uncertainty) and shrinks as an arm is pulled more (low uncertainty). This way, UCB1 explores under-sampled arms without wasting pulls on arms it's already confident about.

In the code (line 76-87):

```javascript
function chooseUCB1() {
  for (var i = 0; i < N_ARMS; i++) {
    if (pulls[i] === 0) return i;  // always try unpulled arms first
  }
  var best = 0, bestScore = -Infinity;
  for (var i = 0; i < N_ARMS; i++) {
    var avg = rewards[i] / pulls[i];
    var score = avg + Math.sqrt(2 * Math.log(totalPulls) / pulls[i]);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}
```

### Regret

**Regret** measures how much reward you lost compared to always pulling the best arm. After each pull:

```
regret += optimal_p - chosen_arm_p
```

If you chose the best arm, regret doesn't increase. If you chose a suboptimal arm, regret increases by the gap. Lower cumulative regret = better strategy.

The regret chart plots this over time. A good strategy has regret that grows slowly (sublinearly). A bad strategy has regret that grows linearly.

### What you see

- **Bar chart**: Each bar shows the estimated reward (wins/pulls) for that arm. Bar opacity indicates how often that arm has been pulled relative to others — darker bars have been pulled more.
- **Labels**: "Arm 1" through "Arm 5" with pull counts above each bar and estimated values below.
- **Regret chart**: A line chart of cumulative regret over time. The x-axis is number of pulls, y-axis is total regret.
- **Manual mode**: Click directly on a bar to pull that arm. Useful for intuition — try pulling each arm a few times, then focus on the one that seems best.
- **Auto mode**: Select a strategy (epsilon-greedy or UCB1) from the dropdown, then click "Auto Run 100" to run 100 automated pulls.
- **Stats**: Total pulls, total reward, cumulative regret, and which arm currently has the highest estimated reward.

### Typical behaviour

- **Epsilon-greedy**: Regret grows linearly because it keeps wasting 10% of pulls on random arms even after it's confident about the best one. Simple but wasteful.
- **UCB1**: Regret grows logarithmically (much slower). After initial exploration, it almost exclusively pulls the best arm, only occasionally re-checking others as the confidence bonus demands.

---

## 7. How the Rendering Works (All Demos)

All four demos use the same rendering approach: **HTML Canvas with CSS variable theming**. No frameworks, no WebGL — just the 2D Canvas API.

### Canvas setup

Each demo creates a `<canvas>` element sized to its container. To handle high-DPI displays (Retina screens), the canvas is drawn at `devicePixelRatio` resolution but displayed at CSS size:

```javascript
canvas.width = container.clientWidth * devicePixelRatio;   // internal resolution
canvas.height = 400 * devicePixelRatio;
canvas.style.width = container.clientWidth + 'px';         // display size
canvas.style.height = '400px';
ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);  // scale context
```

This means you draw in CSS pixel coordinates (e.g. "circle at x=200, y=150") but the actual pixels are 2x or 3x denser on Retina screens, keeping everything sharp.

### Theme awareness

Every demo reads CSS variables at draw time using `getComputedStyle`:

```javascript
function getCSS(v) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}

// Usage:
var accent = getCSS('--accent');   // '#111111' in light mode, '#38bdf8' in dark mode
var text = getCSS('--text');
var border = getCSS('--border');
```

This means the demos automatically adapt to light/dark mode without any extra logic. When the user toggles the theme, the next `draw()` call picks up the new colours.

### Responsive resizing

All demos listen for the `resize` event and recalculate canvas dimensions:

```javascript
window.addEventListener('resize', resize);
```

The `resize()` function reads the container's current width, recalculates the canvas dimensions, and redraws everything. This makes the demos work on any screen size.

### IIFE wrapping

Every demo script is wrapped in an immediately-invoked function expression:

```javascript
(function () {
  // all code here
})();
```

This prevents variables from leaking into the global scope. Each demo's variables (`canvas`, `ctx`, `tree`, etc.) are completely isolated from each other and from the rest of the page.

---

## Quick Reference

| Component | Key Files | What to change |
|-----------|-----------|---------------|
| **Chatbot content** | `scripts/build_rag_index.py` | Add new content sources in `extract_chunks()` |
| **Chatbot behaviour** | `worker/src/index.js` | Edit `SYSTEM_PROMPT`, `TOP_K`, `GEMINI_CHAT_MODEL` |
| **Chatbot frontend** | `_layouts/default.html` (lines 73-155) | Change UI, add typing indicators, etc. |
| **MCTS demo** | `assets/js/mcts-demo.js` | Change `DEPTH`, `C` (exploration constant), animation speed |
| **Q-Learning demo** | `assets/js/qlearning-demo.js` | Change `GRID` size, `ALPHA`, `GAMMA`, `EPS_DECAY`, rewards |
| **MCTS vs Greedy** | `assets/js/mcts-vs-greedy-demo.js` | Change `DEPTH`, max iterations (line 316), tree generation |
| **Bandit demo** | `assets/js/bandit-demo.js` | Change `N_ARMS`, epsilon value (line 64), reward distribution |
| **Styling** | `assets/css/site.css` | Demo styles start at the `.demo-container` section |
