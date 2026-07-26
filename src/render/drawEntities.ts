/**
 * Draws enemies (and later towers and projectiles).
 *
 * Placeholder art, but not flat: every unit gets a contact shadow, a shaded
 * body and a heavy dark outline. The outline is what keeps units readable on
 * top of a busy textured ground — without it they dissolve into the grass.
 */

import type { Enemy, GameState } from '../core/types';
import { COLORS } from './palette';

export function drawEntities(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const e of state.enemies) drawShadow(ctx, e);
  for (const e of state.enemies) drawEnemy(ctx, e);
}

/** Shadows are a separate pass so no unit's body is ever drawn under another
 *  unit's shadow. */
function drawShadow(ctx: CanvasRenderingContext2D, e: Enemy): void {
  ctx.beginPath();
  ctx.ellipse(e.pos.x, e.pos.y + e.radius * 0.55, e.radius * 1.0, e.radius * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const { x, y } = e.pos;
  const r = e.radius;
  const a = Math.atan2(e.dir.y, e.dir.x);

  // Facing wedge behind the body, so it reads as a snout rather than a spike.
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5);
  ctx.lineTo(x + Math.cos(a + 2.3) * r * 0.9, y + Math.sin(a + 2.3) * r * 0.9);
  ctx.lineTo(x + Math.cos(a - 2.3) * r * 0.9, y + Math.sin(a - 2.3) * r * 0.9);
  ctx.closePath();
  ctx.fillStyle = '#9C7B52';
  ctx.fill();
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = COLORS.enemyEdge;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Body: lit from the upper-left to match the terrain's rock shading.
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  grad.addColorStop(0, '#D8C49B');
  grad.addColorStop(1, '#A8875C');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = COLORS.enemyEdge;
  ctx.stroke();

  if (e.hp < e.maxHp) drawHpBar(ctx, e);
}

function drawHpBar(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const w = e.radius * 2.4;
  const h = Math.max(2.5, e.radius * 0.26);
  const x = e.pos.x - w / 2;
  const y = e.pos.y - e.radius - h * 2.4;
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = COLORS.hpFill;
  ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), h);
}
