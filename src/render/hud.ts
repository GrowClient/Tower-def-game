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
  AGES,
  BUILD_ORDER,
  TARGET_MODE_LABELS,
  TOWERS,
  WAVES,
  WORLD,
  type TowerKind,
} from '../config/balance';
import { advanceCost, isMaxAge } from '../core/ages';
import { upgradeCost } from '../core/economy';
import { sellValue, towerDamage, towerRange } from '../core/towers';
import type { GameState, Tower } from '../core/types';
import type { UiState } from '../uiState';
import { speedMultiplier } from '../uiState';
import { AGE_NAMES, COLORS, biomeFor, font, type Biome } from './palette';
import { drawTowerArt } from './drawEntities';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HudButton extends Rect {
  id: 'pause' | 'speed' | 'restart' | 'fullscreen' | 'mute';
}

/**
 * Whether to offer a fullscreen control at all.
 *
 * The Fullscreen API is unavailable on iPhone Safari (iPad has it), and it is
 * also blocked inside an iframe that wasn't granted the permission. A button
 * that silently does nothing is worse than no button, so the control is only
 * built when the browser actually reports the capability — and because input
 * hit-tests this same array, it can't be tapped when it isn't drawn.
 */
const FULLSCREEN_AVAILABLE: boolean =
  typeof document !== 'undefined' &&
  Boolean(
    document.fullscreenEnabled ||
      (document as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled,
  );

export interface BuildButton extends Rect {
  kind: TowerKind;
}

const BTN_W = 78;
const BTN_H = 52;
const BTN_GAP = 10;

/** Right-aligned button cluster in the top strip. */
const HUD_BUTTON_IDS: HudButton['id'][] = FULLSCREEN_AVAILABLE
  ? ['mute', 'fullscreen', 'pause', 'speed', 'restart']
  : ['mute', 'pause', 'speed', 'restart'];

export const HUD_BUTTONS: HudButton[] = HUD_BUTTON_IDS.map((id, i) => {
  const n = HUD_BUTTON_IDS.length;
  return {
    id,
    x: WORLD.width - 24 - (BTN_W * n + BTN_GAP * (n - 1)) + i * (BTN_W + BTN_GAP),
    y: (WORLD.hudTop - BTN_H) / 2,
    w: BTN_W,
    h: BTN_H,
  };
});

const BUILD_W = 168;
const BUILD_H = 84;
const BUILD_GAP = 14;

/**
 * Build bar, centred along the bottom edge. Buttons are deliberately large:
 * at the smallest supported window this is still well over the ~44px minimum
 * comfortable touch target on a phone held in landscape.
 */
/**
 * The build bar shows the CURRENT age's four towers. Geometry is identical
 * across ages so the buttons never move under the player's thumb — only the
 * contents change when you advance.
 */
export function buildButtons(age: number): BuildButton[] {
  const kinds = BUILD_ORDER[Math.min(age, BUILD_ORDER.length - 1)]!;
  const total = kinds.length * BUILD_W + (kinds.length - 1) * BUILD_GAP;
  return kinds.map((kind, i) => ({
    kind,
    x: (WORLD.width - total) / 2 + i * (BUILD_W + BUILD_GAP),
    y: WORLD.height - WORLD.hudBottom + (WORLD.hudBottom - BUILD_H) / 2,
    w: BUILD_W,
    h: BUILD_H,
  }));
}

/** Buttons inside the selected-tower panel. */
export const UPGRADE_BUTTON: Rect = { x: WORLD.width - 268, y: WORLD.hudTop + 126, w: 244, h: 48 };
export const TARGET_BUTTON: Rect = { x: WORLD.width - 268, y: WORLD.hudTop + 180, w: 244, h: 40 };
export const SELL_BUTTON: Rect = { x: WORLD.width - 268, y: WORLD.hudTop + 226, w: 244, h: 40 };
export const PANEL: Rect = { x: WORLD.width - 288, y: WORLD.hudTop + 16, w: 264, h: 264 };

/**
 * Advance-age button, bottom-left of the board. Deliberately large and always
 * visible rather than buried in a menu: it is the most important decision in
 * the game and the player has to be able to see the price they're saving for.
 */
export const ADVANCE_BUTTON: Rect = {
  x: 24,
  y: WORLD.height - WORLD.hudBottom - 74,
  w: 286,
  h: 58,
};

export function drawHud(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  ageIndex: number,
): void {
  const accent = biomeFor(ageIndex).accent;
  drawTopStrip(ctx, state, ui, ageIndex, accent);
  drawAdvanceButton(ctx, state, accent);
  drawBuildBar(ctx, state, ui, accent);
  drawSelectionPanel(ctx, state, ui, accent);
}

/** The age button: what it costs, or that you're already at the last age. */
function drawAdvanceButton(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  accent: string,
): void {
  const b = ADVANCE_BUTTON;
  if (isMaxAge(state)) {
    panel(ctx, b, 'rgba(26, 21, 15, 0.8)', 'rgba(0,0,0,0.5)', 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(17);
    ctx.fillText('FINAL AGE', b.x + b.w / 2, b.y + 35);
    ctx.textAlign = 'left';
    return;
  }

  const cost = advanceCost(state) ?? 0;
  const affordable = state.gold >= cost;
  const nextName = AGES[state.age + 1]?.name ?? '';

  panel(
    ctx,
    b,
    affordable ? '#4A3D24' : 'rgba(26, 21, 15, 0.88)',
    affordable ? accent : 'rgba(0,0,0,0.55)',
    affordable ? 3 : 2,
  );

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.textDim;
  ctx.font = font(12);
  ctx.fillText('ADVANCE TO', b.x + 16, b.y + 21);

  ctx.fillStyle = affordable ? COLORS.text : '#7A705F';
  ctx.font = font(20);
  ctx.fillText(nextName.toUpperCase(), b.x + 16, b.y + 45);

  ctx.textAlign = 'right';
  ctx.fillStyle = affordable ? '#F0C46A' : '#8A6E42';
  ctx.font = font(23);
  ctx.fillText(`${cost}g`, b.x + b.w - 16, b.y + 40);
  ctx.textAlign = 'left';
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
    else if (b.id === 'fullscreen')
      button(ctx, b, null, ui.fullscreen ? accent : COLORS.text, ui.fullscreen ? 'exitFull' : 'enterFull');
    else if (b.id === 'mute')
      button(ctx, b, null, ui.muted ? '#7A705F' : COLORS.text, ui.muted ? 'muted' : 'sound');
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

/** Which age a tower belongs to — its icon should use that age's palette. */
function ageIndexOf(kind: TowerKind): number {
  return TOWERS[kind]!.age;
}

function drawBuildBar(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  accent: string,
): void {
  const y = WORLD.height - WORLD.hudBottom;
  slab(ctx, 0, y, WORLD.width, WORLD.hudBottom, 'up', accent);

  for (const b of buildButtons(state.age)) {
    const def = TOWERS[b.kind]!;
    const affordable = state.gold >= def.cost;
    const armed = ui.buildKind === b.kind;

    panel(ctx, b, armed ? '#5A4A2E' : '#3A3223', armed ? accent : 'rgba(0,0,0,0.55)', armed ? 3 : 2.5);

    // Tower glyph, so the button shows the thing rather than only naming it.
    ctx.save();
    if (!affordable) ctx.globalAlpha = 0.45;
    towerGlyph(ctx, b.x + 36, b.y + b.h / 2, 19, b.kind, biomeFor(ageIndexOf(b.kind)));
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.fillStyle = affordable ? COLORS.text : '#7A705F';
    // Shrink to fit rather than clip: tower names vary a lot in length across
    // ages ("Boulder" vs "Siege Cannon"), and a name cut off mid-word tells
    // the player nothing.
    fitText(ctx, def.label, b.x + 60, b.y + 34, b.w - 70, 19);

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
  const dmg = def.slowFactor < 1 ? 'slow' : Math.round(towerDamage(state, tower)).toString();
  ctx.fillText(`dmg ${dmg}`, PANEL.x + 18, PANEL.y + 84);
  ctx.fillText(`range ${Math.round(towerRange(state, tower))}`, PANEL.x + 110, PANEL.y + 84);
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

  // Sell. Always available, and always shows the exact refund so the player
  // can weigh scrapping an old-age tower against keeping it firing.
  const refund = sellValue(state, tower);
  panel(ctx, SELL_BUTTON, '#3A2A22', '#8A5A46', 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#E8A08A';
  ctx.font = font(17);
  ctx.fillText(`SELL  +${refund}g`, SELL_BUTTON.x + SELL_BUTTON.w / 2, SELL_BUTTON.y + 26);

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
  icon?: 'play' | 'pause' | 'enterFull' | 'exitFull' | 'sound' | 'muted',
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
  if (icon === 'sound' || icon === 'muted') {
    // Speaker cone plus either waves or a cross.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 5);
    ctx.lineTo(cx - 6, cy - 5);
    ctx.lineTo(cx + 1, cy - 12);
    ctx.lineTo(cx + 1, cy + 12);
    ctx.lineTo(cx - 6, cy + 5);
    ctx.lineTo(cx - 12, cy + 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    if (icon === 'sound') {
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(cx + 2, cy, 4 + i * 5, -0.9, 0.9);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(cx + 7, cy - 7);
      ctx.lineTo(cx + 17, cy + 7);
      ctx.moveTo(cx + 17, cy - 7);
      ctx.lineTo(cx + 7, cy + 7);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    return;
  }
  if (icon === 'enterFull' || icon === 'exitFull') {
    // Four corner brackets, pointing out to expand and in to collapse.
    const out = icon === 'enterFull';
    const o = 13;
    const len = 8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const px = cx + sx * o;
      const py = cy + sy * o;
      ctx.beginPath();
      if (out) {
        ctx.moveTo(px - sx * len, py);
        ctx.lineTo(px, py);
        ctx.lineTo(px, py - sy * len);
      } else {
        ctx.moveTo(px, py - sy * len);
        ctx.lineTo(px, py);
        ctx.lineTo(px - sx * len, py);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
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
/**
 * Build-bar icon: the real tower art, scaled down.
 *
 * Reusing drawTowerArt rather than keeping a parallel set of icons means a
 * button can never end up showing something other than what it builds.
 */
export function towerGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  kind: TowerKind,
  biome: Biome,
): void {
  ctx.save();
  ctx.translate(x, y + r * 0.15);
  // aim points right and cooldown is 0, so every icon shows its tower ready
  // and facing the same way.
  drawTowerArt(ctx, kind, r * 0.78, 0, 0, biome);
  ctx.restore();
}

/** Draw text at the largest size (up to `size`) that fits `maxWidth`. */
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
): void {
  let px = size;
  ctx.font = font(px);
  while (ctx.measureText(text).width > maxWidth && px > 10) {
    px -= 1;
    ctx.font = font(px);
  }
  ctx.fillText(text, x, y);
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
