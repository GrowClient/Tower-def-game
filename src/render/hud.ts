/**
 * HUD: top stat strip, bottom build bar, and the selected-tower panel.
 *
 * Styled as carved stone slabs rather than flat UI cards — the chrome should
 * belong to the same world as the board. Colours come from the current biome,
 * so the HUD re-skins itself when the age advances.
 *
 * Every clickable rectangle this file draws is also EXPORTED, so `input/`
 * hit-tests the exact geometry that was rendered. One source of truth: a
 * button can never be somewhere other than where it looks.
 */

import {
  BUILD_ORDER,
  TARGET_MODE_LABELS,
  TOWERS,
  WAVES,
  WORLD,
  type TowerKind,
} from '../config/balance';
import { upgradeCost } from '../core/economy';
import { towerDamage, towerRange } from '../core/towers';
import type { GameState, Tower } from '../core/types';
import type { UiState } from '../uiState';
import { speedMultiplier } from '../uiState';
import { AGE_NAMES, COLORS, biomeFor, font } from './palette';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HudButton extends Rect {
  id: 'pause' | 'speed' | 'restart';
}

export interface BuildButton extends Rect {
  kind: TowerKind;
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

const BUILD_W = 168;
const BUILD_H = 84;
const BUILD_GAP = 14;

/**
 * Build bar, centred along the bottom edge. Buttons are deliberately large:
 * at the smallest supported window this is still well over the ~44px minimum
 * comfortable touch target on a phone held in landscape.
 */
export const BUILD_BUTTONS: BuildButton[] = BUILD_ORDER.map((kind, i) => {
  const total = BUILD_ORDER.length * BUILD_W + (BUILD_ORDER.length - 1) * BUILD_GAP;
  return {
    kind,
    x: (WORLD.width - total) / 2 + i * (BUILD_W + BUILD_GAP),
    y: WORLD.height - WORLD.hudBottom + (WORLD.hudBottom - BUILD_H) / 2,
    w: BUILD_W,
    h: BUILD_H,
  };
});

/** Buttons inside the selected-tower panel. */
export const UPGRADE_BUTTON: Rect = { x: WORLD.width - 268, y: WORLD.hudTop + 126, w: 244, h: 50 };
export const TARGET_BUTTON: Rect = { x: WORLD.width - 268, y: WORLD.hudTop + 182, w: 244, h: 42 };
export const PANEL: Rect = { x: WORLD.width - 288, y: WORLD.hudTop + 16, w: 264, h: 222 };

export function drawHud(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  ageIndex: number,
): void {
  const accent = biomeFor(ageIndex).accent;
  drawTopStrip(ctx, state, ui, ageIndex, accent);
  drawBuildBar(ctx, state, ui, accent);
  drawSelectionPanel(ctx, state, ui, accent);
}

// ---------------------------------------------------------------------------
// Top strip
// ---------------------------------------------------------------------------

function drawTopStrip(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  ageIndex: number,
  accent: string,
): void {
  slab(ctx, 0, 0, WORLD.width, WORLD.hudTop, 'down', accent);

  let x = 26;
  x = stat(ctx, x, 'WAVE', String(state.wave.number), COLORS.text);
  x = stat(ctx, x, 'GOLD', String(Math.floor(state.gold)), '#F0C46A');
  x = stat(ctx, x, 'LIVES', String(state.lives), state.lives <= 5 ? '#F4664F' : COLORS.text);
  x = stat(ctx, x, 'AGE', AGE_NAMES[ageIndex] ?? '—', accent);

  // Between waves, the countdown is the most useful number on screen — it's
  // the build window. During a wave, show what's left to kill instead.
  if (!state.wave.active) {
    stat(ctx, x, 'NEXT WAVE', state.wave.timer.toFixed(1), accent);
  } else {
    const left = state.wave.queue.length + state.enemies.length;
    stat(ctx, x, 'REMAINING', String(left), COLORS.text);
  }

  for (const b of HUD_BUTTONS) {
    // Pause/play are drawn as shapes rather than glyphs: ⏸/▶ are missing from
    // most monospace fonts and render as tofu boxes.
    if (b.id === 'pause') button(ctx, b, null, COLORS.text, ui.paused ? 'play' : 'pause');
    else if (b.id === 'speed')
      button(ctx, b, `${speedMultiplier(ui)}×`, ui.speedIndex > 0 ? accent : COLORS.text);
    else button(ctx, b, '↻', COLORS.text);
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

  ctx.font = font(14);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(label, x, 28);

  ctx.font = font(28);
  // Cut shadow under the value so it stays legible over the slab gradient.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillText(value, x, 59);
  ctx.fillStyle = valueColor;
  ctx.fillText(value, x, 58);

  const w = Math.max(ctx.measureText(value).width, ctx.measureText(label).width * 0.9, 46);
  return x + w + 34;
}

// ---------------------------------------------------------------------------
// Build bar
// ---------------------------------------------------------------------------

function drawBuildBar(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  accent: string,
): void {
  const y = WORLD.height - WORLD.hudBottom;
  slab(ctx, 0, y, WORLD.width, WORLD.hudBottom, 'up', accent);

  for (const b of BUILD_BUTTONS) {
    const def = TOWERS[b.kind]!;
    const affordable = state.gold >= def.cost;
    const armed = ui.buildKind === b.kind;

    panel(ctx, b, armed ? '#5A4A2E' : '#3A3223', armed ? accent : 'rgba(0,0,0,0.55)', armed ? 3 : 2.5);

    // Tower glyph, so the button shows the thing rather than only naming it.
    towerGlyph(ctx, b.x + 34, b.y + b.h / 2, 17, b.kind, affordable ? accent : '#6B6252');

    ctx.textAlign = 'left';
    ctx.fillStyle = affordable ? COLORS.text : '#7A705F';
    ctx.font = font(19);
    ctx.fillText(def.label, b.x + 60, b.y + 34);

    ctx.fillStyle = affordable ? '#F0C46A' : '#8A6E42';
    ctx.font = font(20);
    ctx.fillText(`${def.cost}g`, b.x + 60, b.y + 62);
  }
}

// ---------------------------------------------------------------------------
// Selected tower panel
// ---------------------------------------------------------------------------

export function findSelectedTower(state: GameState, ui: UiState): Tower | null {
  if (ui.selectedTowerId === null) return null;
  return state.towers.find((t) => t.id === ui.selectedTowerId) ?? null;
}

function drawSelectionPanel(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  accent: string,
): void {
  const tower = findSelectedTower(state, ui);
  if (!tower) return;

  const def = TOWERS[tower.kind]!;
  panel(ctx, PANEL, 'rgba(26, 21, 15, 0.94)', accent, 2.5);

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.text;
  ctx.font = font(22);
  ctx.fillText(def.label, PANEL.x + 18, PANEL.y + 34);

  ctx.fillStyle = accent;
  ctx.font = font(15);
  ctx.fillText(`LEVEL ${tower.level}`, PANEL.x + 18, PANEL.y + 58);

  ctx.fillStyle = COLORS.textDim;
  ctx.font = font(15);
  const dmg = def.slowFactor < 1 ? 'slow' : Math.round(towerDamage(tower)).toString();
  ctx.fillText(`dmg ${dmg}`, PANEL.x + 18, PANEL.y + 84);
  ctx.fillText(`range ${Math.round(towerRange(tower))}`, PANEL.x + 110, PANEL.y + 84);
  ctx.fillText(`kills ${tower.kills}`, PANEL.x + 18, PANEL.y + 106);

  const cost = upgradeCost(tower);
  if (cost === null) {
    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(17);
    ctx.textAlign = 'center';
    ctx.fillText('MAX LEVEL', UPGRADE_BUTTON.x + UPGRADE_BUTTON.w / 2, UPGRADE_BUTTON.y + 32);
    ctx.textAlign = 'left';
  } else {
    const affordable = state.gold >= cost;
    panel(
      ctx,
      UPGRADE_BUTTON,
      affordable ? '#4A3D24' : '#2A2519',
      affordable ? accent : 'rgba(0,0,0,0.5)',
      2,
    );
    ctx.textAlign = 'center';
    ctx.fillStyle = affordable ? COLORS.text : '#7A705F';
    ctx.font = font(19);
    ctx.fillText(
      `UPGRADE  ${cost}g`,
      UPGRADE_BUTTON.x + UPGRADE_BUTTON.w / 2,
      UPGRADE_BUTTON.y + 33,
    );
  }

  // Targeting mode. Slowers have no target — showing them a mode selector
  // would imply a choice that does nothing.
  if (def.slowFactor >= 1) {
    panel(ctx, TARGET_BUTTON, '#2C2519', 'rgba(0,0,0,0.5)', 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(13);
    ctx.fillText('TARGET', TARGET_BUTTON.x + 44, TARGET_BUTTON.y + 27);
    ctx.fillStyle = accent;
    ctx.font = font(17);
    ctx.fillText(
      TARGET_MODE_LABELS[tower.targetMode],
      TARGET_BUTTON.x + TARGET_BUTTON.w / 2 + 34,
      TARGET_BUTTON.y + 27,
    );
  }
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Wave banner
// ---------------------------------------------------------------------------

/** Big centred callout when a wave starts, and the boss warning later. */
export function drawWaveBanner(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.wave.active || state.wave.number === 0) return;
  // Only for the first moment of a wave — after that it's just noise.
  const since = state.time - (state.wave.queue[0]?.at ?? state.time);
  if (since > 1.6 || since < 0) return;

  const alpha = Math.max(0, 1 - since / 1.6);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.font = font(44);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillText(`WAVE ${state.wave.number}`, WORLD.width / 2 + 2, WORLD.hudTop + 74);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(`WAVE ${state.wave.number}`, WORLD.width / 2, WORLD.hudTop + 72);
  if (state.wave.number % WAVES.bossEvery === 0) {
    ctx.font = font(20);
    ctx.fillStyle = '#F4664F';
    ctx.fillText('BOSS WAVE', WORLD.width / 2, WORLD.hudTop + 102);
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

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

  ctx.fillStyle = 'rgba(255, 240, 210, 0.06)';
  ctx.fillRect(x, seam === 'down' ? y : y + h - 3, w, 3);

  const seamY = seam === 'down' ? y + h - 4 : y;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(x, seamY, w, 4);
  ctx.fillStyle = hexToRgba(accent, 0.35);
  ctx.fillRect(x, seam === 'down' ? seamY + 3 : seamY, w, 1.5);
}

function panel(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  fill: string,
  edge: string,
  edgeWidth: number,
): void {
  ctx.fillStyle = fill;
  roundRect(ctx, r.x, r.y, r.w, r.h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = edgeWidth + 1.5;
  ctx.stroke();
  ctx.strokeStyle = edge;
  ctx.lineWidth = edgeWidth;
  ctx.stroke();
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
    ctx.fillRect(cx - 9, cy - 11, 6, 22);
    ctx.fillRect(cx + 3, cy - 11, 6, 22);
    return;
  }
  if (icon === 'play') {
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy - 12);
    ctx.lineTo(cx + 10, cy);
    ctx.lineTo(cx - 7, cy + 12);
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

/**
 * The same silhouettes the towers use on the board, at button size. Drawing
 * them twice from one function means the icon can never drift from the thing
 * it builds.
 */
export function towerGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  kind: TowerKind,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = r * 0.16;
  ctx.lineJoin = 'round';

  switch (kind) {
    case 'thrower': {
      // A sling arm over a base.
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, r * 0.7);
      ctx.lineTo(r * 0.8, r * 0.7);
      ctx.lineTo(r * 0.5, -r * 0.2);
      ctx.lineTo(-r * 0.5, -r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 0.6, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'trap': {
      // Downward spikes in a pit.
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(i * r * 0.38 - r * 0.16, r * 0.7);
        ctx.lineTo(i * r * 0.38, -r * 0.7);
        ctx.lineTo(i * r * 0.38 + r * 0.16, r * 0.7);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'slower': {
      // A six-point star: cold, radial, obviously not a gun.
      ctx.beginPath();
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.42;
        const px = Math.cos(a) * rr;
        const py = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'heavy': {
      // A boulder on a heavy plinth.
      ctx.beginPath();
      ctx.rect(-r * 0.85, r * 0.25, r * 1.7, r * 0.55);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -r * 0.25, r * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
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

export function hitTest(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
