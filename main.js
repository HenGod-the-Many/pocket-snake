// Screen for Pocket Snake. The skeleton draws an empty board; W-03 adds play.
import { GRID } from './game.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const size = canvas.clientWidth * devicePixelRatio;
canvas.width = canvas.height = size;
ctx.strokeStyle = '#273244';
for (let i = 1; i < GRID; i++) {
  const p = (i * size) / GRID;
  ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
}
