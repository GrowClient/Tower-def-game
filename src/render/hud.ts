/**
 * HUD: top stat strip and the bottom build bar.
 *
 * Laid out for landscape — stats along the top, build/action buttons along the
 * bottom edge where thumbs sit when a phone is held sideways.
 *
 * Button rectangles are exported so `input/` can hit-test the exact same
 * geometry that gets drawn. One source of truth, no drift.
 */

import { WORLD } from '../config/balance';
import type { GameState } from '../core/types';
import type { UiState } from '../uiState';
import { speedMultiplier } from '../uiState';
import { AGE_NAMES, COLORS, accentFor, font } from './palette';

export interface HudButton {
  id: 'pause' | 'speed' | 'restart';
  x: number;
  y: number;
  w: number;
  h: number;
}

const BTN_W = 78;
const BTN_H = 50;
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
  drawTopStrip(ctx, state, ui, ageIndex);
  drawBottomBar(ctx);
}

function drawTopStrip(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  ageIndex: number,
): void {
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(0, 0, WORLD.width, WORLD.hudTop);
  ctx.fillStyle = COLORS.hudEdge;
  ctx.fillRect(0, WORLD.hudTop - 2, WORLD.width, 2);

  const accent = accentFor(ageIndex);
  let x = 26;
  x = stat(ctx, x, 'WAVE', String(state.wave), COLORS.text);
  x = stat(ctx, x, 'GOLD', String(Math.floor(state.gold)), '#F5C542');
  x = stat(ctx, x, 'LIVES', String(state.lives), state.lives <= 5 ? '#F87171' : COLORS.text);
  x = stat(ctx, x, 'AGE', AGE_NAMES[ageIndex] ?? '—', accent);
  stat(ctx, x, 'SEED', String(state.seed), COLORS.textDim);

  for (const b of HUD_BUTTONS) {
    // Pause/play are drawn as shapes rather than glyphs: ⏸/▶ are missing from
    // most monospace fonts and render as tofu boxes.
    if (b.id === 'pause') drawButton(ctx, b, null, COLORS.text, ui.paused ? 'play' : 'pause');
    else if (b.id === 'speed')
      drawButton(ctx, b, `${speedMultiplier(ui)}×`, ui.speedIndex > 0 ? accent : COLORS.text);
    else drawButton(ctx, b, '↻', COLORS.text);
  }
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

  ctx.font = font(15);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(label, x, 30);

  ctx.font = font(28);
  ctx.fillStyle = valueColor;
  ctx.fillText(value, x, 60);

  const w = Math.max(ctx.measureText(value).width, 46);
  return x + w + 34;
}

function drawButton(
  ctx: CanvasRenderingContext2D,
  b: HudButton,
  label: string | null,
  color: string,
  icon?: 'play' | 'pause',
): void {
  ctx.fillStyle = '#161B29';
  roundRect(ctx, b.x, b.y, b.w, b.h, 8);
  ctx.fill();
  ctx.strokeStyle = COLORS.hudEdge;
  ctx.lineWidth = 2;
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

function drawBottomBar(ctx: CanvasRenderingContext2D): void {
  const y = WORLD.height - WORLD.hudBottom;
  ctx.fillStyle = COLORS.hudBg;
  ctx.fillRect(0, y, WORLD.width, WORLD.hudBottom);
  ctx.fillStyle = COLORS.hudEdge;
  ctx.fillRect(0, y, WORLD.width, 2);

  ctx.fillStyle = COLORS.textDim;
  ctx.font = font(18);
  ctx.textAlign = 'center';
  ctx.fillText('BUILD BAR — slice 2', WORLD.width / 2, y + WORLD.hudBottom / 2 + 6);
  ctx.textAlign = 'left';
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
