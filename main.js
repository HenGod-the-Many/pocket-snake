// Screen and controls for Pocket Snake: draws the board, runs the clock, reads swipes and arrows.
import { createGame, step, turn, tickMs } from './game.js';

const $ = (id) => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const overlay = $('overlay');

const COLORS = { grid: '#273244', snake: '#4ade80', head: '#86efac', food: '#f87171' };

let game = createGame();
let phase = 'ready'; // ready | playing | paused | over
let timer = null;

// Saved on the phone between games. Storage can be unavailable (private mode), so never let it throw.
const store = {
  get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* not saved */ } },
};
let best = Number(store.get('pocket-snake-best', 0)) || 0;
let muted = store.get('pocket-snake-muted', '0') === '1';

// Exposed for the automated tests, which read the game state from outside.
const soundLog = [];
window.__snake = {
  get game() { return game; }, get phase() { return phase; }, get best() { return best; }, sounds: soundLog,
};

// Sound: short tones made in code, so there are no audio files. iPhone only allows audio
// after a tap, so the audio context is created by the Play button.
let audio = null;
function unlockAudio() {
  if (audio) { audio.resume?.(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (Ctx) audio = new Ctx();
}
function playSound(name) {
  if (muted) return;
  soundLog.push(name);
  if (!audio) return;
  const notes = name === 'eat' ? [[660, 0, 0.06], [990, 0.05, 0.08]] : [[300, 0, 0.15], [180, 0.14, 0.3]];
  const now = audio.currentTime;
  for (const [freq, at, len] of notes) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = name === 'eat' ? 'square' : 'sawtooth';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, now + at);
    gain.gain.exponentialRampToValueAtTime(0.001, now + at + len);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + at);
    osc.stop(now + at + len + 0.02);
  }
}
function showMute() {
  $('mute').textContent = muted ? '🔇' : '🔊';
  $('mute').setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
}

function fitBoard() {
  // The board is the largest square that leaves room for the score bar and the arrows.
  const app = $('app');
  const style = getComputedStyle(app);
  const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const used = document.querySelector('.bar').offsetHeight + document.querySelector('.pad').offsetHeight + 24;
  const side = Math.floor(Math.max(160, Math.min(app.clientWidth - padX, 480, app.clientHeight - padY - used)));
  const wrap = $('board-wrap');
  wrap.style.width = wrap.style.height = `${side}px`;
  canvas.width = canvas.height = Math.round(side * devicePixelRatio);
  draw();
}

function draw() {
  const n = game.grid;
  const s = canvas.width / n;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const p = Math.round(i * s) + 0.5;
    ctx.moveTo(p, 0); ctx.lineTo(p, canvas.height);
    ctx.moveTo(0, p); ctx.lineTo(canvas.width, p);
  }
  ctx.stroke();
  if (game.food) {
    ctx.fillStyle = COLORS.food;
    ctx.beginPath();
    ctx.arc((game.food.x + 0.5) * s, (game.food.y + 0.5) * s, s * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = s * 0.08;
  game.snake.forEach((p, i) => {
    ctx.fillStyle = i === 0 ? COLORS.head : COLORS.snake;
    roundRect(p.x * s + g, p.y * s + g, s - 2 * g, s - 2 * g, s * 0.25);
  });
  $('score').textContent = game.score;
  $('best').textContent = best;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.fill();
}

function showOverlay(title, text, button) {
  $('overlay-title').textContent = title;
  $('overlay-text').textContent = text;
  $('start').textContent = button;
  overlay.hidden = false;
}

function start() {
  if (phase === 'paused') { resume(); return; }
  unlockAudio();
  game = createGame();
  phase = 'playing';
  overlay.hidden = true;
  draw();
  schedule();
}

function schedule() {
  clearTimeout(timer);
  if (phase === 'playing') timer = setTimeout(tick, tickMs(game.snake.length));
}

function tick() {
  const result = step(game);
  if (result.ate) playSound('eat');
  if (game.score > best) {
    best = game.score;
    store.set('pocket-snake-best', String(best));
  }
  draw();
  if (result.died) {
    phase = 'over';
    playSound('over');
    showOverlay('Game over', `Score ${game.score} · Best ${best}`, 'Play again');
    return;
  }
  schedule();
}

function pause() {
  if (phase !== 'playing') return;
  phase = 'paused';
  clearTimeout(timer);
  $('pause').textContent = '▶';
  $('pause').setAttribute('aria-label', 'Resume');
  showOverlay('Paused', `Score ${game.score}`, 'Resume');
}

function resume() {
  if (phase !== 'paused') return;
  unlockAudio();
  phase = 'playing';
  overlay.hidden = true;
  $('pause').textContent = '⏸';
  $('pause').setAttribute('aria-label', 'Pause');
  schedule();
}

function steer(dir) {
  if (phase === 'playing') turn(game, dir);
}

// Swipes: anywhere on the screen except the buttons. The page itself never scrolls.
let touchStart = null;
document.addEventListener('touchstart', (e) => {
  if (e.target.closest('button')) return;
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!e.target.closest('button')) e.preventDefault();
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  touchStart = { x: t.clientX, y: t.clientY }; // a long drag can make a second turn
}, { passive: false });
document.addEventListener('touchend', () => { touchStart = null; });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// Arrow buttons react on press, not release, so they feel immediate.
document.querySelectorAll('.arrow').forEach((b) => {
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); steer(b.dataset.dir); });
});

// Keyboard, for playing on a computer.
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
document.addEventListener('keydown', (e) => {
  if (KEYS[e.key]) { e.preventDefault(); steer(KEYS[e.key]); }
});

$('start').addEventListener('click', start);
$('pause').addEventListener('click', () => (phase === 'paused' ? resume() : pause()));
$('mute').addEventListener('click', () => {
  muted = !muted;
  store.set('pocket-snake-muted', muted ? '1' : '0');
  showMute();
  if (!muted) unlockAudio();
});
// Leaving the app (Home, app switcher, a call) pauses the game.
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('pagehide', pause);
showMute();
window.addEventListener('resize', fitBoard);
fitBoard();
