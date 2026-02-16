const canvas = document.getElementById('mcts-canvas');
const ctx = canvas.getContext('2d');
const stepBtn = document.getElementById('mcts-step');
const resetBtn = document.getElementById('mcts-reset');

let nodes = [];
let edges = [];

function resize() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight;
}

window.addEventListener('resize', resize);
resize();

class Node {
  constructor(x, y, level, parent = null) {
    this.x = x;
    this.y = y;
    this.level = level;
    this.parent = parent;
    this.children = [];
    this.visits = 0;
    this.value = Math.random();
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(56, 189, 248, ${0.3 + (this.value * 0.7)})`;
    ctx.fill();
    ctx.strokeStyle = 'var(--accent)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function init() {
  nodes = [new Node(canvas.width / 2, 40, 0)];
  edges = [];
  draw();
}

function step() {
  // Find a leaf node to expand
  const leaves = nodes.filter(n => n.children.length < 2 && n.level < 4);
  if (leaves.length === 0) return;

  const parent = leaves[Math.floor(Math.random() * leaves.length)];
  const level = parent.level + 1;
  const offset = (canvas.width / Math.pow(2, level + 1));
  const x = parent.x + (parent.children.length === 0 ? -offset : offset);
  const y = parent.y + 70;

  const newNode = new Node(x, y, level, parent);
  parent.children.push(newNode);
  nodes.push(newNode);
  edges.push([parent, newNode]);
  draw();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  edges.forEach(([p, c]) => {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(c.x, c.y);
    ctx.strokeStyle = 'var(--border)';
    ctx.stroke();
  });

  nodes.forEach(n => n.draw());
}

stepBtn.addEventListener('click', step);
resetBtn.addEventListener('click', init);

init();
// Auto step a few times
for(let i=0; i<5; i++) setTimeout(step, i * 200);
