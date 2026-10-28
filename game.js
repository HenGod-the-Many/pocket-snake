// Game rules for Pocket Snake: pure functions over a plain state object, no screen.

export const GRID = 20;
export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

// Small seedable random generator, so tests can replay a game exactly.
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame({ grid = GRID, seed } = {}) {
  const mid = Math.floor(grid / 2);
  const state = {
    grid,
    snake: [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }],
    dir: 'right',
    queue: [],
    food: null,
    score: 0,
    over: false,
    rng: makeRng(seed),
  };
  state.food = spawnFood(state);
  return state;
}

// Queue a turn. A turn back into the snake's own neck is ignored, and so is a repeat.
// Up to two turns are kept so a quick "up, left" between ticks both happen.
export function turn(state, dir) {
  if (!DIRS[dir] || state.over) return false;
  const last = state.queue.length ? state.queue[state.queue.length - 1] : state.dir;
  if (dir === last || dir === OPPOSITE[last] || state.queue.length >= 2) return false;
  state.queue.push(dir);
  return true;
}

// Advance one tick. Returns what happened, for sound and the screen.
export function step(state) {
  if (state.over) return { ate: false, died: false };
  if (state.queue.length) state.dir = state.queue.shift();
  const d = DIRS[state.dir];
  const head = { x: state.snake[0].x + d.x, y: state.snake[0].y + d.y };
  const ate = state.food && head.x === state.food.x && head.y === state.food.y;
  // The tail moves away this tick unless the snake is growing, so it isn't an obstacle.
  const body = ate ? state.snake : state.snake.slice(0, -1);
  const hitWall = head.x < 0 || head.y < 0 || head.x >= state.grid || head.y >= state.grid;
  const hitSelf = body.some((p) => p.x === head.x && p.y === head.y);
  if (hitWall || hitSelf) {
    state.over = true;
    return { ate: false, died: true };
  }
  state.snake = [head, ...body];
  if (ate) {
    state.score += 1;
    state.food = spawnFood(state);
  }
  return { ate: !!ate, died: false };
}

// Pick a random empty cell. Returns null only if the board is full.
export function spawnFood(state) {
  const taken = new Set(state.snake.map((p) => p.y * state.grid + p.x));
  const free = state.grid * state.grid - taken.size;
  if (free <= 0) return null;
  let n = Math.floor(state.rng() * free);
  for (let i = 0; i < state.grid * state.grid; i++) {
    if (taken.has(i)) continue;
    if (n-- === 0) return { x: i % state.grid, y: Math.floor(i / state.grid) };
  }
  return null;
}

// Milliseconds per tick: starts relaxed and speeds up as the snake grows, down to a floor.
export function tickMs(length) {
  return Math.max(70, 170 - (length - 3) * 5);
}
