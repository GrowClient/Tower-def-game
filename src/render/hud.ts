/**
 * HUD: top stat strip and the bottom build bar.
 *
 * Styled as carved stone slabs rather than flat UI cards — the chrome should
 * belong to the same world as the board. Colours come from the current biome,
 * so the HUD re-skins itself when the age advances.
 *
 * Laid out for landscape: stats along the top, build/action buttons along the
 * bottom edge where thumbs sit when a phone is held sideways.
 *
 * Button rectangles are exported so `input/` can hit-test the exact same
 * geometry that gets drawn. One source of truth, no drift.
 */

import { WORLD } from '../config/balance';
import type { GameState } from '../core/types';
import type { UiState } from '../uiState';
import { speedMultiplier } from '../uiState';
import { AGE_NAMES, COLORS, biomeFor, font } from './palette';

export interface HudButton {
  id: 'pause' | 'speed' | 'restart';
  x: number;
  y: number;
  w: number;
  h: number;
}

const BTN_W = 78;
const BTN_H = 52;
const BTN_GAP = 10;

/** Right-aligned button cluster in the top strip. */
export const HUD_BUTTONS: HudButton[] = (['pause', 'speed', 'restart'] as const).map(
  (id, i) => ({
    id,
    x: WORLD.width - 24 - (BTN_W * 3 + BTN_GAP * 2) + i * (BTN_W + BTN_GAP),
    y: (WORLD.hudTop - BTN_H) / 2,
    w: BTN_W,
    h: BTN_H,
  }),
);

export function drawHud(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  ageIndex: number,
): void {
  const accent = biomeFor(ageIndex).accent;
  drawTopStrip(ctx, state, ui, ageIndex, accent);
  drawBottomBar(ctx, accent);
}

function drawTopStrip(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  ageIndex: number,
  accent: string,
): void {
  slab(ctx, 0, 0, WORLD.width, WORLD.hudTop, 'down', accent);

  let x = 26;
  x = stat(ctx, x, 'WAVE', String(state.wave), COLORS.text);
  x = stat(ctx, x, 'GOLD', String(Math.floor(state.gold)), '#F0C46A');
  x = stat(ctx, x, 'LIVES', String(state.lives), state.lives <= 5 ? '#F4664F' : COLORS.text);
  x = stat(ctx, x, 'AGE', AGE_NAMES[ageIndex] ?? '—', accent);
  stat(ctx, x, 'SEED', String(state.seed), COLORS.textDim);

  for (const b of HUD_BUTTONS) {
    // Pause/play are drawn as shapes rather than glyphs: ⏸/▶ are missing from
    // most monospace fonts and render as tofu boxes.
    if (b.id === 'pause') button(ctx, b, null, COLORS.text, ui.paused ? 'play' : 'pause');
    else if (b.id === 'speed')
      button(ctx, b, `${speedMultiplier(ui)}×`, ui.speedIndex > 0 ? accent : COLORS.text);
    else button(ctx, b, '↻', COLORS.text);
  }
}

function drawBottomBar(ctx: CanvasRenderingContext2D, accent: string): void {
  const y = WORLD.height - WORLD.hudBottom;
  slab(ctx, 0, y, WORLD.width, WORLD.hudBottom, 'up', accent);

  ctx.fillStyle = COLORS.textDim;
  ctx.font = font(18);
  ctx.textAlign = 'center';
  ctx.fillText('BUILD BAR — slice 2', WORLD.width / 2, y + WORLD.hudBottom / 2 + 6);
  ctx.textAlign = 'left';
}

/**
 * A stone slab: dark gradient, a chiselled highlight on the face that catches
 * the light, and an accent seam along the edge that meets the board.
 */
function slab(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  seam: 'up' | 'down',
  accent: string,
): void {
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, seam === 'down' ? '#2A241B' : '#1A160F');
  grad.addColorStop(1, seam === 'down' ? '#191510' : '#2A241B');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Chiselled highlight along the outer face.
  ctx.fillStyle = 'rgba(255, 240, 210, 0.06)';
  ctx.fillRect(x, seam === 'down' ? y : y + h - 3, w, 3);

  // Seam facing the board: a dark shadow line plus a thin accent.
  const seamY = seam === 'down' ? y + h - 4 : y;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x, seamY, w, 4);
  ctx.fillStyle = hexToRgba(accent, 0.35);
  ctx.fillRect(x, seam === 'down' ? seamY + 3 : seamY, w, 1.5);
}

/** Draws one label/value pair and returns the x to continue from. */
function stat(
  ctx: CanvasRenderingContext2D,
  x: number,
  label: string,
  value: string,
  valueColor: string,
): number {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  ctx.font = font(14);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(label, x, 28);

  ctx.font = font(28);
  // Cut shadow under the value so it stays legible over the slab gradient.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillText(value, x, 59);
  ctx.fillStyle = valueColor;
  ctx.fillText(value, x, 58);

  const w = Math.max(ctx.measureText(value).width, 46);
  return x + w + 34;
}

function button(
  ctx: CanvasRenderingContext2D,
  b: HudButton,
  label: string | null,
  color: string,
  icon?: 'play' | 'pause',
): void {
  const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  grad.addColorStop(0, '#453B2C');
  grad.addColorStop(1, '#2C2519');
  ctx.fillStyle = grad;
  roundRect(ctx, b.x, b.y, b.w, b.h, 9);
  ctx.fill();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 240, 210, 0.12)';
  ctx.lineWidth = 1.2;
  roundRect(ctx, b.x + 1.5, b.y + 1.5, b.w - 3, b.h - 3, 8);
  ctx.stroke();

  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  ctx.fillStyle = color;

  if (icon === 'pause') {
    const w = 6;
    const h = 22;
    ctx.fillRect(cx - w - 3, cy - h / 2, w, h);
    ctx.fillRect(cx + 3, cy - h / 2, w, h);
    return;
  }
  if (icon === 'play') {
    const s = 12;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.55, cy - s);
    ctx.lineTo(cx + s * 0.85, cy);
    ctx.lineTo(cx - s * 0.55, cy + s);
    ctx.closePath();
    ctx.fill();
    return;
  }

  ctx.font = font(24);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label ?? '', cx, cy + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
