/**
 * Full-screen overlays: pause, end-of-run summary, and the portrait rotate hint.
 *
 * The rotate hint is drawn in SCREEN space (not world space) because the whole
 * point is that the world rectangle is currently a bad fit for the window.
 */

import { ENEMIES, TOWERS, WORLD } from '../config/balance';
import type { GameState } from '../core/types';
import { COLORS, font, type Biome } from './palette';
import { roundRect } from './hud';
import type { Viewport } from './viewport';

export function drawPauseOverlay(ctx: CanvasRenderingContext2D): void {
  scrim(ctx, 0.55);
  centeredText(ctx, 'PAUSED', 72, COLORS.text, -20);
  centeredText(ctx, 'tap ▶ or press SPACE to resume', 22, COLORS.textDim, 40);
}

/**
 * End-of-run summary: how far you got, and — the part that actually teaches —
 * what killed you and what you'd built when it did.
 */
export function drawGameOverOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  biome: Biome,
  bestWave: number,
): void {
  scrim(ctx, 0.78);

  const cx = WORLD.width / 2;
  const top = 118;

  ctx.textAlign = 'center';
  ctx.font = font(64);
  ctx.fillStyle = '#F4664F';
  ctx.fillText('RUN OVER', cx, top);

  const isBest = state.wave.number >= bestWave;
  ctx.font = font(30);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(`Wave ${state.wave.number}`, cx, top + 48);

  ctx.font = font(17);
  ctx.fillStyle = isBest ? biome.accent : COLORS.textDim;
  ctx.fillText(isBest ? 'NEW BEST' : `best  wave ${bestWave}`, cx, top + 76);

  // What killed you.
  const killer = state.killedBy ? ENEMIES[state.killedBy]?.label ?? state.killedBy : 'nothing';
  ctx.font = font(19);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText('the last life went to a', cx, top + 116);
  ctx.font = font(28);
  ctx.fillStyle = '#F4664F';
  ctx.fillText(killer.toUpperCase(), cx, top + 148);

  drawLoadout(ctx, state, biome, top + 188);

  ctx.textAlign = 'center';
  ctx.font = font(20);
  ctx.fillStyle = COLORS.textDim;
  // Sit above the build bar, not on top of it — the bar is still drawn under
  // this overlay and the two collide at the bottom of the world rect.
  ctx.fillText('tap ↻ or press R for a new run', cx, WORLD.height - WORLD.hudBottom - 28);
  ctx.textAlign = 'left';
}

/** Tower loadout as a row of counted cards — what your board actually was. */
function drawLoadout(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  biome: Biome,
  y: number,
): void {
  const counts = new Map<string, { n: number; kills: number; spent: number }>();
  for (const t of state.towers) {
    const entry = counts.get(t.kind) ?? { n: 0, kills: 0, spent: 0 };
    entry.n++;
    entry.kills += t.kills;
    entry.spent += t.invested;
    counts.set(t.kind, entry);
  }

  ctx.textAlign = 'center';
  ctx.font = font(15);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText('LOADOUT', WORLD.width / 2, y);

  if (counts.size === 0) {
    ctx.font = font(20);
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText('you never built anything', WORLD.width / 2, y + 40);
    return;
  }

  const cardW = 180;
  const cardH = 96;
  const gap = 14;
  const entries = [...counts.entries()];
  const total = entries.length * cardW + (entries.length - 1) * gap;
  let x = (WORLD.width - total) / 2;

  for (const [kind, entry] of entries) {
    ctx.fillStyle = 'rgba(26, 21, 15, 0.9)';
    roundRect(ctx, x, y + 18, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = biome.accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = font(19);
    ctx.fillText(`${entry.n}× ${TOWERS[kind]?.label ?? kind}`, x + cardW / 2, y + 48);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(15);
    ctx.fillText(`${entry.kills} kills`, x + cardW / 2, y + 74);
    ctx.fillStyle = '#F0C46A';
    ctx.fillText(`${entry.spent}g spent`, x + cardW / 2, y + 96);

    x += cardW + gap;
  }
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
