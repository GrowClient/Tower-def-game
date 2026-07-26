/**
 * Draws enemies (and later towers and projectiles).
 *
 * Placeholder art: flat geometric shapes built in code. Enemies are circles
 * with a facing wedge so direction of travel is obvious without any sprite.
 */

import type { Enemy, GameState } from '../core/types';
import { COLORS } from './palette';

export function drawEntities(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const e of state.enemies) drawEnemy(ctx, e);
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const { x, y } = e.pos;
  const r = e.radius;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.enemy;
  ctx.fill();
  ctx.lineWidth = r * 0.22;
  ctx.strokeStyle = COLORS.enemyEdge;
  ctx.stroke();

  // Facing wedge: a triangle poking out of the leading edge.
  const a = Math.atan2(e.dir.y, e.dir.x);
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * r * 1.55, y + Math.sin(a) * r * 1.55);
  ctx.lineTo(x + Math.cos(a + 2.4) * r * 0.85, y + Math.sin(a + 2.4) * r * 0.85);
  ctx.lineTo(x + Math.cos(a - 2.4) * r * 0.85, y + Math.sin(a - 2.4) * r * 0.85);
  ctx.closePath();
  ctx.fillStyle = COLORS.enemy;
  ctx.fill();

  if (e.hp < e.maxHp) drawHpBar(ctx, e);
}

function drawHpBar(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const w = e.radius * 2.4;
  const h = Math.max(2, e.radius * 0.28);
  const x = e.pos.x - w / 2;
  const y = e.pos.y - e.radius - h * 2.2;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.hpFill;
  ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), h);
}
