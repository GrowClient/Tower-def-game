/**
 * Draws whatever `fx/effects.ts` is currently holding.
 *
 * Split from the fx state on purpose: the state is plain numbers that tick
 * forward on wall-clock time, and this file is the only thing that knows what
 * a shard or a shockwave looks like. Same separation as sim/renderer, one
 * level down.
 *
 * Render rule applies here too — this reads fx state and never writes it.
 */

import { WORLD } from '../config/balance';
import type { FxState } from '../fx/effects';
import { font } from './palette';

/**
 * Effects that belong ON the board, drawn in world space under the HUD:
 * debris, shockwaves, chain arcs and damage numbers.
 */
export function drawBoardEffects(ctx: CanvasRenderingContext2D, fx: FxState): void {
  // Shockwaves first — they are blast fronts and everything else happens in
  // front of them.
  for (const w of fx.shockwaves) {
    const t = w.life / w.maxLife;
    ctx.save();
    ctx.globalAlpha = t * t;
    ctx.strokeStyle = w.color;
    ctx.lineWidth = w.width * t;
    ctx.beginPath();
    ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Chain lightning: a jagged polyline, re-jittered per frame so it crackles.
  for (const arc of fx.arcs) {
    const t = arc.life / arc.maxLife;
    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = '#BFF4FF';
    ctx.lineWidth = 3.5 * t + 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(arc.from.x, arc.from.y);
    const steps = 4;
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      const x = arc.from.x + (arc.to.x - arc.from.x) * k;
      const y = arc.from.y + (arc.to.y - arc.from.y) * k;
      // Perpendicular jitter — a straight line reads as a laser, not an arc.
      ctx.lineTo(x + (Math.random() - 0.5) * 22, y + (Math.random() - 0.5) * 22);
    }
    ctx.lineTo(arc.to.x, arc.to.y);
    ctx.stroke();
    ctx.restore();
  }

  // Debris. Squares rather than circles: at 3px a rotated square reads as a
  // chunk of something and a circle reads as a dot.
  for (const p of fx.particles) {
    const t = p.life / p.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.6);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }

  // Floating numbers last, so they are never buried under their own debris.
  for (const f of fx.floaters) {
    const t = f.life / f.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 2.2);
    ctx.font = font(f.size);
    ctx.textAlign = 'center';
    // Cut shadow: these land on top of textured ground and unit bodies alike.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillText(f.text, f.x + 1.5, f.y + 1.5);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.restore();
  }
  ctx.textAlign = 'left';
}

/**
 * The full-screen flash, drawn over everything including the HUD.
 *
 * Over the HUD deliberately: an age advance re-skins the entire board, and a
 * flash that stops at the edge of the play area would look like a window
 * rather than like the world changing.
 */
export function drawScreenFlash(ctx: CanvasRenderingContext2D, fx: FxState): void {
  if (fx.flash <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.85, fx.flash);
  ctx.fillStyle = fx.flashColor;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.restore();
}
