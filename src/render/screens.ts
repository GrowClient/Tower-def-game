/**
 * Full-screen overlays: pause, game over, and the portrait rotate hint.
 *
 * The rotate hint is drawn in SCREEN space (not world space) because the whole
 * point is that the world rectangle is currently a bad fit for the window.
 */

import { WORLD } from '../config/balance';
import type { GameState } from '../core/types';
import { COLORS, font } from './palette';
import type { Viewport } from './viewport';

export function drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
  scrim(ctx, 0.55);
  centeredText(ctx, 'PAUSED', 72, COLORS.text, -20);
  centeredText(ctx, 'tap ▶ or press SPACE to resume', 22, COLORS.textDim, 40);
}

export function drawGameOverOverlay(ctx: CanvasRenderingContext2D, state: GameState): void {
  scrim(ctx, 0.7);
  centeredText(ctx, 'RUN OVER', 76, '#F87171', -50);
  centeredText(ctx, `wave ${state.wave}`, 30, COLORS.text, 10);
  centeredText(ctx, 'tap ↻ or press R to restart', 22, COLORS.textDim, 60);
}

/**
 * Drawn when the window is portrait. Uses the raw canvas transform so it fills
 * the actual screen rather than the letterboxed world box.
 */
export function drawRotateHint(ctx: CanvasRenderingContext2D, vp: Viewport): void {
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.fillStyle = 'rgba(6, 8, 14, 0.94)';
  ctx.fillRect(0, 0, vp.cssW, vp.cssH);

  const cx = vp.cssW / 2;
  const cy = vp.cssH / 2;
  const s = Math.min(vp.cssW, vp.cssH) * 0.16;

  // A rotating-phone glyph: a portrait rect with a curved arrow around it.
  ctx.save();
  ctx.translate(cx, cy - s * 0.4);
  ctx.rotate(-0.35);
  ctx.strokeStyle = '#E8A33D';
  ctx.lineWidth = Math.max(3, s * 0.09);
  ctx.lineJoin = 'round';
  ctx.strokeRect(-s * 0.42, -s * 0.72, s * 0.84, s * 1.44);
  ctx.restore();

  ctx.fillStyle = COLORS.text;
  ctx.font = font(Math.max(18, Math.min(vp.cssW, vp.cssH) * 0.055));
  ctx.textAlign = 'center';
  ctx.fillText('ROTATE YOUR DEVICE', cx, cy + s * 1.15);
  ctx.fillStyle = COLORS.textDim;
  ctx.font = font(Math.max(12, Math.min(vp.cssW, vp.cssH) * 0.032), 500);
  ctx.fillText('this game is played in landscape', cx, cy + s * 1.6);
  ctx.textAlign = 'left';
}

function scrim(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.fillStyle = `rgba(6, 8, 14, ${alpha})`;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
}

function centeredText(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  color: string,
  dy: number,
): void {
  ctx.fillStyle = color;
  ctx.font = font(size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, WORLD.width / 2, WORLD.height / 2 + dy);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
