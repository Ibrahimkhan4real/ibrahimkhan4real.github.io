# Site Technical Guide

This document explains how every dynamic component on the site works — the RAG chatbot, the four interactive demos, and the infrastructure that ties them together. It is written so you can understand the theory, modify any part, and deploy from scratch.

---

## Table of Contents

1. [RAG Chatbot — Setup Instructions](#1-rag-chatbot--setup-instructions)
2. [RAG Chatbot — How It Works](#2-rag-chatbot--how-it-works)
3. [Demo 1: MCTS Decision Tree Visualization](#3-demo-1-mcts-decision-tree-visualization)
4. [Demo 2: Q-Learning Grid World](#4-demo-2-q-learning-grid-world)
5. [Demo 3: MCTS vs Greedy Comparison](#5-demo-3-mcts-vs-greedy-comparison)
6. [Demo 4: Multi-Armed Bandit Playground](#6-demo-4-multi-armed-bandit-playground)
7. [How the Rendering Works (All Demos)](#7-how-the-rendering-works-all-demos)

---

## 1. RAG Chatbot — Setup Instructions

The chat widget in the bottom-right corner of every page connects to a Cloudflare Worker that answers questions about your research using Retrieval-Augmented Generation (RAG) with Google Gemini.

### Prerequisites

You need three things before starting:

| What | Where to get it |
|------|----------------|
| **Google Gemini API key** | [Google AI Studio](https://aistudio.google.com/apikey) — sign in, click "Create API Key". Free tier gives 15 requests/minute, 1,500/day. |
| **Cloudflare account** | [Cloudflare sign-up](https://dash.cloudflare.com/sign-up) — free tier is sufficient. After signing up, go to Workers & Pages > Overview and note your `*.workers.dev` subdomain (e.g. `abc123.workers.dev`). |
| **Node.js 18+** | [nodejs.org](https://nodejs.org/) — needed for the Wrangler CLI that deploys the Worker. |

### Step-by-step deployment

**Step 1: Build the RAG index**

This reads all your site content and turns it into searchable embeddings.

```bash
# From the repo root
export GEMINI_API_KEY="your-gemini-api-key-here"
python scripts/build_rag_index.py
```

You should see output like:

```
Extracting content chunks...
  Found 15 chunks
Generating embeddings via Gemini...
  [1/15] About Muhammad Ibrahim Khan...
  [2/15] Education...
  ...
Done! Wrote 15 entries to worker/src/rag_index.json
  Index size: 142.3 KB
```

If you get an error about the API key, double-check you exported it correctly. On Windows (Git Bash), use `export GEMINI_API_KEY="..."`. On Windows CMD, use `set GEMINI_API_KEY=...`.

**Step 2: Install Worker dependencies**

```bash
cd worker
npm install
```

This installs the Wrangler CLI (Cloudflare's deployment tool).

**Step 3: Log in to Cloudflare**

```bash
npx wrangler login
```

This opens a browser window. Authorise Wrangler to access your Cloudflare account.

**Step 4: Store your API key as a secret**

Secrets are encrypted and never visible in code or logs.

```bash
npx wrangler secret put GEMINI_API_KEY
```

It will prompt you to paste your Gemini API key. Paste it and press Enter.

**Step 5: Deploy the Worker**

```bash
npx wrangler deploy
```

Wrangler will print the URL of your deployed Worker, e.g.:

```
Published ibrahim-research-chat (1.2 sec)
  https://ibrahim-research-chat.abc123.workers.dev
```

Copy this URL.

**Step 6: Update the frontend**

Open `_layouts/default.html` and find this line (around line 92):

```javascript
const CHAT_API = 'https://ibrahim-research-chat.YOUR_CF_SUBDOMAIN.workers.dev';
```

Replace `YOUR_CF_SUBDOMAIN` with your actual Cloudflare subdomain from step 5. For example:

```javascript
const CHAT_API = 'https://ibrahim-research-chat.abc123.workers.dev';
```

**Step 7: Push and test**

Commit and push to GitHub. Once GitHub Pages rebuilds, open your site, click the chat widget, and ask a question like "What is your PhD about?".

### Updating the index later

Whenever you add new blog posts, publish papers, or update your profile:

```bash
export GEMINI_API_KEY="your-key"
python scripts/build_rag_index.py
cd worker
npx wrangler deploy
```

### Testing locally

```bash
cd worker
npx wrangler dev
```

This runs the Worker at `http://localhost:8787`. The frontend also allows `localhost:4000` (Jekyll's default) for CORS, so you can test end-to-end with:

```bash
# Terminal 1: run the worker locally
cd worker && npx wrangler dev

# Terminal 2: run Jekyll locally
bundle exec jekyll serve
```

Then temporarily change `CHAT_API` to `http://localhost:8787` in the layout file for testing.

### Cost

- **Cloudflare Workers free tier**: 100,000 requests/day. You will never hit this on a personal site.
- **Gemini API free tier**: Each chat message costs 2 API calls (1 embedding + 1 generation). The free tier allows ~1,500 calls/day — more than enough.
- **Total cost**: Zero for a personal site's traffic level.

---

## 2. RAG Chatbot — How It Works

RAG stands for **Retrieval-Augmented Generation**. The core idea is: instead of asking an LLM to answer from memory (where it might hallucinate), you first *retrieve* relevant documents, then feed those documents to the LLM as context so it answers based on facts.

### The full pipeline

```
┌─────────────────────────────────────────────────────────┐
│                    BUILD TIME (offline)                   │
│                                                           │
│  1. Python script reads your site content                 │
│     (index.html, papers.json, blog posts, now.yml)        │
│                                                           │
│  2. Splits content into "chunks" (~300-500 chars each)    │
│     e.g. one chunk for "About", one per paper, etc.       │
│                                                           │
│  3. Sends each chunk to Gemini Embedding API              │
│     Text → 768-dimensional vector of floats               │
│                                                           │
│  4. Saves all chunks + their vectors to rag_index.json    │
│     This file is bundled into the Cloudflare Worker        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                   QUERY TIME (live)                       │
│                                                           │
│  1. User types: "What papers has Ibrahim published?"      │
│                                                           │
│  2. Browser sends POST to Cloudflare Worker               │
│     Body: { query: "What papers...", history: [...] }     │
│                                                           │
│  3. Worker embeds the query using Gemini Embedding API    │
│     "What papers..." → [0.12, -0.03, 0.87, ...]          │
│                                                           │
│  4. Worker computes cosine similarity between the         │
│     query vector and every chunk vector in the index      │
│                                                           │
│  5. Picks the top 4 most similar chunks                   │
│     (e.g. the 4 paper chunks score highest)               │
│                                                           │
│  6. Sends to Gemini Chat API:                             │
│     System prompt: "You are a research assistant..."      │
│     User message: "[chunk1]\n[chunk2]\n...\nQuestion:..." │
│                                                           │
│  7. Gemini generates answer grounded in those chunks      │
│                                                           │
│  8. Worker returns { answer: "...", sources: [...] }      │
│     Browser displays the answer in the chat widget        │
└─────────────────────────────────────────────────────────┘
```

### Key concepts explained

**Embeddings.** An embedding is a list of numbers (a vector) that represents the *meaning* of a piece of text. Texts with similar meanings have vectors that point in similar directions. The Gemini `text-embedding-004` model produces 768-dimensional vectors. For example:

- "MCTS for energy control" → `[0.42, -0.11, 0.73, ...]`
- "Monte Carlo Tree Search in heating systems" → `[0.40, -0.09, 0.71, ...]` (very similar)
- "Recipe for chocolate cake" → `[-0.55, 0.82, -0.13, ...]` (very different)

**Cosine similarity.** Measures how similar two vectors are by computing the cosine of the angle between them. Returns a value between -1 (opposite) and 1 (identical). The formula is:

```
similarity = (A · B) / (|A| × |B|)
```

Where `A · B` is the dot product, and `|A|` is the magnitude. In the code (`worker/src/index.js`, line 106-114):

```javascript
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];       // dot product
    magA += a[i] * a[i];      // squared magnitude of a
    magB += b[i] * b[i];      // squared magnitude of b
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
```

**Chunking.** You can't embed your entire website as one giant string — the embedding would be too vague to match specific questions. Instead, the indexing script (`scripts/build_rag_index.py`) splits content into semantically meaningful chunks: one for "About", one for "Education", one per paper, etc. Each chunk is small enough to have a focused meaning but large enough to contain a complete thought.

**System prompt.** The system prompt tells Gemini how to behave. Ours says: answer only from the provided context, don't make things up, keep it concise. This is what prevents the model from hallucinating facts about you.

**Conversation history.** The frontend keeps the last 6 messages and sends them with each request. The Worker passes these to Gemini so it can understand follow-up questions like "Tell me more about that paper."

### Why a Cloudflare Worker?

Your site is static HTML on GitHub Pages — there's no server. But you can't call the Gemini API directly from browser JavaScript because that would expose your API key in the page source. The Cloudflare Worker acts as a thin proxy:

```
Browser → Worker (has API key stored securely) → Gemini API
```

The Worker runs on Cloudflare's edge network (200+ data centres worldwide), so it's fast regardless of where the visitor is. The free tier gives 100,000 requests/day, which is effectively unlimited for a personal site.

### File reference

| File | Role |
|------|------|
| `scripts/build_rag_index.py` | Reads site content, calls Gemini embedding API, outputs `rag_index.json` |
| `worker/src/index.js` | The Worker: handles requests, does similarity search, calls Gemini chat API |
| `worker/src/rag_index.json` | Pre-computed chunks + embeddings (generated by the Python script) |
| `worker/wrangler.toml` | Worker configuration (name, CORS settings) |
| `_layouts/default.html` | Frontend chat widget (lines 73-155) — sends queries, displays responses |

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
