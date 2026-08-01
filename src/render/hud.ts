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
  SCALING,
  COMBOS,
  TARGET_MODE_LABELS,
  TOWERS,
  VETERANCY,
  WAVES,
  WORLD,
  type TowerKind,
} from '../config/balance';
import { goldPerDiamond } from '../config/balance';
import { exchangerOutput } from '../core/abilities';
import { advanceCost, isMaxAge } from '../core/ages';
import { towerCost, upgradeCost } from '../core/economy';
import {
  atCapacity,
  canToggle,
  cappedTowerCount,
  towerCap,
  sellValue,
  towerDamage,
  towerFireRate,
  towerIncome,
  towerRange,
  veteranMul,
  veteranNext,
  veteranRank,
} from '../core/towers';
import type { GameState, Tower } from '../core/types';
import type { UiState } from '../uiState';
import { speedMultiplier } from '../uiState';
import { AGE_NAMES, COLORS, biomeFor, font, type Biome } from './palette';
import { comboColor } from './drawMap';
import { drawTowerArt } from './drawEntities';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HudButton extends Rect {
  id: 'pause' | 'speed' | 'restart' | 'fullscreen' | 'mute' | 'combos' | 'abilities';
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
  ? ['abilities', 'combos', 'mute', 'fullscreen', 'pause', 'speed', 'restart']
  : ['abilities', 'combos', 'mute', 'pause', 'speed', 'restart'];

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
  // Cheapest on the left, dearest on the right. Sorted HERE rather than in the
  // balance table so the bar can never drift out of order when a price is
  // retuned, and so the number-key shortcuts always match what is on screen.
  const kinds = [...BUILD_ORDER[Math.min(age, BUILD_ORDER.length - 1)]!].sort(
    (a, b) => TOWERS[a]!.cost - TOWERS[b]!.cost,
  );
  const total = kinds.length * BUILD_W + (kinds.length - 1) * BUILD_GAP;
  return kinds.map((kind, i) => ({
    kind,
    x: (WORLD.width - total) / 2 + i * (BUILD_W + BUILD_GAP),
    y: WORLD.height - WORLD.hudBottom + (WORLD.hudBottom - BUILD_H) / 2,
    w: BUILD_W,
    h: BUILD_H,
  }));
}

/**
 * Geometry for the selected-tower panel.
 *
 * Two things changed here and both were real problems. The panel used to be
 * pinned to the top-right corner, so with a dozen towers on the board there was
 * nothing connecting the numbers you were reading to the tower you had tapped.
 * It now hangs off the tower itself. And its buttons were sized for a 264-wide
 * box they did not fit in, with labels running past their own edges — they are
 * now full-width and finger-sized.
 *
 * Returned as a function rather than exported constants because the rects move
 * with the tower. `input/` calls this exact function, so the thing you tap is
 * still guaranteed to be the thing that was drawn.
 */
const PANEL_W = 304;
const PANEL_PAD = 16;

export interface TowerPanel {
  panel: Rect;
  upgrade: Rect;
  target: Rect | null;
  /** The Exchanger's on/off switch. Occupies the same row a shooter uses for
   *  its targeting mode, since the two never appear on the same tower. */
  toggle: Rect | null;
  sell: Rect;
}

/** Economy buildings and Exchangers have no target, so are offered no button. */
function hasTargeting(kind: TowerKind): boolean {
  const def = TOWERS[kind]!;
  return def.goldPerWave === 0 && def.diamondsPerWave === 0;
}

export function towerPanelRects(state: GameState, tower: Tower): TowerPanel {
  const targeted = hasTargeting(tower.kind);
  const switched = canToggle(tower.kind);
  // Leaves room for three stat lines AND the combo strip above it. At 132 the
  // upgrade button was drawn straight over the combo row.
  const upgradeY = 186;
  const targetY = upgradeY + 62;
  const sellY = targeted || switched ? targetY + 54 : targetY;
  const height = sellY + 52 + PANEL_PAD;

  // Prefer directly under the tower; flip above when that would run into the
  // build bar, and clamp sideways so an edge tower's panel stays on screen.
  const cell = state.layout.cellSize;
  const below = tower.pos.y + cell * 0.55;
  const flip = below + height > WORLD.height - WORLD.hudBottom - 8;
  const y = flip ? Math.max(WORLD.hudTop + 8, tower.pos.y - cell * 0.55 - height) : below;
  const x = Math.min(
    Math.max(tower.pos.x - PANEL_W / 2, 12),
    WORLD.width - PANEL_W - 12,
  );

  const inner = { x: x + PANEL_PAD, w: PANEL_W - PANEL_PAD * 2 };
  return {
    panel: { x, y, w: PANEL_W, h: height },
    upgrade: { x: inner.x, y: y + upgradeY, w: inner.w, h: 54 },
    target: targeted ? { x: inner.x, y: y + targetY, w: inner.w, h: 46 } : null,
    toggle: switched ? { x: inner.x, y: y + targetY, w: inner.w, h: 46 } : null,
    sell: { x: inner.x, y: y + sellY, w: inner.w, h: 52 },
  };
}

/**
 * Advance-age button, bottom-left of the board. Deliberately large and always
 * visible rather than buried in a menu: it is the most important decision in
 * the game and the player has to be able to see the price they're saving for.
 */
/**
 * Drop-here-to-cancel, shown only while a placement drag is in flight.
 *
 * A drag had no cancel on a touchscreen. On a mouse you can flick the pointer
 * off the board and let go; a thumb that has already committed to a drag has
 * nowhere to go, and releasing anywhere legal builds the tower. The player's
 * only escape was to place something they did not want and sell it back at a
 * loss.
 *
 * Deliberately over the build bar. That is where the thumb came FROM, so it is
 * the shortest possible retreat, and the bar has nothing to say mid-drag.
 */
export const PLACEMENT_CANCEL: Rect = {
  x: WORLD.width / 2 - 82,
  y: WORLD.height - WORLD.hudBottom + 14,
  w: 164,
  h: 88,
};

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
  // A campaign shows how far there is left to go. That number IS the mode:
  // "34 / 60" is a run with an end in sight, "34" is one without, and the
  // difference between the two games is the whole reason both exist.
  x = stat(
    ctx,
    x,
    'WAVE',
    state.mode === 'campaign'
      ? `${state.wave.number}/${WAVES.finalWave}`
      : String(state.wave.number),
    state.mode === 'campaign' && state.wave.number >= SCALING.finaleWave
      ? '#F4664F'
      : COLORS.text,
  );
  x = stat(ctx, x, 'GOLD', String(Math.floor(state.gold)), '#F0C46A');
  x = stat(ctx, x, 'DIAMONDS', String(state.diamonds), '#8FE3FF');
  x = stat(ctx, x, 'LIVES', String(state.lives), state.lives <= 5 ? '#F4664F' : COLORS.text);
  x = stat(ctx, x, 'AGE', AGE_NAMES[ageIndex] ?? '—', accent);
  // The cap is only a fair rule if it is visible BEFORE you try to build.
  const cap = towerCap(state);
  const used = cappedTowerCount(state);
  x = stat(ctx, x, 'TOWERS', `${used}/${cap}`, used >= cap ? '#F4664F' : COLORS.text);

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
    else if (b.id === 'combos') button(ctx, b, null, ui.showCombos ? accent : COLORS.text, 'combos');
    else if (b.id === 'abilities')
      button(ctx, b, null, ui.abilityMenuOpen ? '#8FE3FF' : COLORS.text, 'diamond');
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

  // Say why the bar is dead rather than letting the player tap a greyed button
  // and guess. Sell something, upgrade, advance — and TRAPS, which the cap
  // does not apply to at all and which the banner used to fail to mention
  // while their buttons sat greyed out beside it.
  //
  // It sits ABOVE the slab on its own backing pill, not inside it. Squeezed
  // into the 16px of bar above the buttons it was both clipped by the slab's
  // top seam and overlapping the button tops — the one message the player most
  // needs to read was the least readable thing on screen.
  if (atCapacity(state)) {
    const line = isMaxAge(state)
      ? 'TOWER LIMIT REACHED — sell one, upgrade what you have, or lay traps'
      : 'TOWER LIMIT REACHED — sell one, upgrade, advance an age, or lay traps';
    ctx.save();
    ctx.font = font(19);
    const pw = ctx.measureText(line).width + 44;
    const ph = 34;
    const px = (WORLD.width - pw) / 2;
    const py = y - ph - 10;
    ctx.fillStyle = 'rgba(24, 14, 10, 0.88)';
    roundRect(ctx, px, py, pw, ph, ph / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(244, 102, 79, 0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FF8B72';
    ctx.fillText(line, WORLD.width / 2, py + ph / 2 + 1);
    ctx.restore();
  }

  for (const b of buildButtons(state.age)) {
    const def = TOWERS[b.kind]!;
    const price = towerCost(b.kind);
    // Per KIND, not per board. Traps are exempt from the cap (they can only
    // go on the path, so the map already bounds them) — greying their buttons
    // out alongside everything else told the player the exact opposite of the
    // rule, and left them unable to work out that traps were still available.
    const full = atCapacity(state, b.kind);
    const affordable = state.gold >= price && !full;
    const armed = ui.buildKind === b.kind;

    panel(ctx, b, armed ? '#5A4A2E' : '#3A3223', armed ? accent : 'rgba(0,0,0,0.55)', armed ? 3 : 2.5);

    // Tower glyph, so the button shows the thing rather than only naming it.
    ctx.save();
    if (!affordable) ctx.globalAlpha = 0.45;
    towerGlyph(ctx, b.x + 36, b.y + b.h / 2, 19, b.kind, biomeFor(ageIndexOf(b.kind)));
    ctx.restore();

    // Text column: everything right of the glyph, inset from the far edge.
    const tx = b.x + 60;
    const tw = b.w - 70;
    // Economy buildings carry a third line, so their first two ride up to make
    // room for it. Everything else stays vertically centred as a pair.
    const payback = def.goldPerWave > 0 || def.diamondsPerWave > 0;

    ctx.textAlign = 'left';
    ctx.fillStyle = affordable ? COLORS.text : '#7A705F';
    // Shrink to fit rather than clip: tower names vary a lot in length across
    // ages ("Boulder" vs "Siege Cannon"), and a name cut off mid-word tells
    // the player nothing.
    fitText(ctx, def.label, tx, b.y + (payback ? 28 : 34), tw, 19);

    ctx.fillStyle = affordable ? '#F0C46A' : '#8A6E42';
    ctx.font = font(20);
    fitText(ctx, `${price}g`, tx, b.y + (payback ? 54 : 62), tw, 20);

    // What an economy building pays back, on the button. Otherwise its price
    // is the only number the player sees and it just looks like a bad tower.
    //
    // On its OWN LINE, fitted. It used to be tucked in beside the price, which
    // worked only while both numbers were small: by the Tech Age a Factory
    // reads "38000g" and "+8400/wave", and the second ran clean off the right
    // edge of the button. The Exchanger was worse — its line is a whole
    // sentence — and neither had any width bound at all, so the overflow got
    // steadily worse every time the economy was re-priced upward.
    if (payback) {
      // Full button width, starting under the GLYPH rather than beside it. The
      // other two lines have to clear the icon; this one does not, and the
      // Exchanger's rate is a long enough string that the 98px column beside
      // the glyph shrank it past legibility before it fitted.
      const px = b.x + 12;
      const pw = b.w - 24;
      ctx.font = font(13);
      if (def.goldPerWave > 0) {
        ctx.fillStyle = affordable ? '#9AD07A' : '#5F7A4E';
        fitText(ctx, `+${def.goldPerWave.toLocaleString('en-US')}g / wave`, px, b.y + 73, pw, 13);
      } else {
        // The Exchanger's real cost is not its sticker price, it is the gold it
        // burns every wave from here on — so the button says that, not just "+1".
        ctx.fillStyle = affordable ? '#8FE3FF' : '#4E6E7A';
        const burn = goldPerDiamond(state.age) * def.diamondsPerWave;
        fitText(
          ctx,
          `−${burn.toLocaleString('en-US')}g → ${def.diamondsPerWave}◆ / wave`,
          px,
          b.y + 73,
          pw,
          13,
        );
      }
    }
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
  const r = towerPanelRects(state, tower);
  const P = r.panel;

  // A leader from the tower down to the panel, so which tower this describes
  // is unambiguous even when the panel has been clamped away from it.
  ctx.strokeStyle = hexToRgba(accent, 0.75);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tower.pos.x, tower.pos.y);
  ctx.lineTo(P.x + P.w / 2, P.y + (tower.pos.y > P.y ? P.h : 0));
  ctx.stroke();

  panel(ctx, P, 'rgba(26, 21, 15, 0.96)', accent, 2.5);

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.text;
  ctx.font = font(22);
  ctx.fillText(def.label, P.x + PANEL_PAD, P.y + 34);

  ctx.fillStyle = accent;
  ctx.font = font(15);
  ctx.fillText(`LEVEL ${tower.level}`, P.x + PANEL_PAD, P.y + 58);

  // Earned rank sits beside bought level, because they are different currencies
  // and the player needs to see both: one you paid for, one this tower worked
  // for. The progress line is what makes concentrating fire feel like it counts.
  const rank = veteranRank(tower);
  if (rank > 0) {
    const bonus = Math.round((veteranMul(tower) - 1) * 100);
    ctx.fillStyle = rank >= 3 ? '#FFE082' : rank === 2 ? '#DCE4F0' : '#C0A87A';
    ctx.font = font(15);
    ctx.fillText(`${VETERANCY.names[rank]}  +${bonus}%`, P.x + PANEL_PAD + 96, P.y + 58);
  }
  const toNext = veteranNext(tower);
  if (toNext !== null) {
    ctx.fillStyle = '#6A6152';
    ctx.font = font(12);
    const unit =
      def.goldPerWave > 0 || def.diamondsPerWave > 0
        ? 'payouts'
        : def.damage <= 0
          ? 'chills'
          : 'kills';
    ctx.fillText(`${toNext} more ${unit} to rank up`, P.x + PANEL_PAD + 96, P.y + 74);
  }

  ctx.font = font(15);
  if (def.diamondsPerWave > 0) {
    // An Exchanger's numbers are a rate and a total, in both currencies. What
    // a player wants to know is "what is this costing me and what has it
    // bought me", and neither half means anything without the other.
    const out = exchangerOutput(state, tower);
    const burn = out * goldPerDiamond(state.age);
    // Starts at 100, not 84: the veterancy line sits at 74 and the three
    // Exchanger stats were being drawn straight through it.
    ctx.fillStyle = tower.enabled ? '#8FE3FF' : '#5E6E76';
    ctx.fillText(
      tower.enabled ? `${out}◆ per wave` : `idle — would make ${out}◆`,
      P.x + PANEL_PAD,
      P.y + 100,
    );
    ctx.fillStyle = tower.enabled ? '#F0C46A' : '#6A6152';
    fitText(
      ctx,
      tower.enabled
        ? `costs ${burn.toLocaleString('en-US')}g each wave`
        : `saving you ${burn.toLocaleString('en-US')}g each wave`,
      P.x + PANEL_PAD,
      P.y + 122,
      PANEL_W - PANEL_PAD * 2,
      15,
    );
    ctx.fillStyle = COLORS.textDim;
    fitText(
      ctx,
      `${tower.earned.toLocaleString('en-US')}g converted since built`,
      P.x + PANEL_PAD,
      P.y + 143,
      PANEL_W - PANEL_PAD * 2,
      14,
    );
  } else if (def.goldPerWave > 0) {
    // An economy building has no damage to report. Its numbers are what it
    // pays and whether it has paid for itself yet — which is the only question
    // a player actually has about a mine.
    const income = towerIncome(state, tower);
    const profit = tower.earned - tower.invested;
    ctx.fillStyle = '#F0C46A';
    ctx.fillText(`+${income}g per wave`, P.x + PANEL_PAD, P.y + 84);

    ctx.fillStyle = COLORS.textDim;
    // Late-game totals run to seven figures; without a bound this line walks
    // straight off the panel.
    fitText(
      ctx,
      `earned ${tower.earned.toLocaleString('en-US')}g  ·  spent ${tower.invested.toLocaleString('en-US')}g`,
      P.x + PANEL_PAD,
      P.y + 106,
      PANEL_W - PANEL_PAD * 2,
      15,
    );
    // Green once it is genuinely ahead of everything sunk into it, amber while
    // it is still paying itself off. This is the whole pitch of the building,
    // and it gets its own line — sharing one ran off the panel edge.
    ctx.fillStyle = profit >= 0 ? '#8BE04F' : '#C98A6A';
    ctx.font = font(17);
    ctx.fillText(
      profit >= 0 ? `+${profit}g in profit` : `${-profit}g to break even`,
      P.x + PANEL_PAD,
      P.y + 132,
    );
  } else {
    ctx.fillStyle = COLORS.textDim;
    const slower = def.slowFactor < 1;
    const dmg = slower
      ? `${Math.round((1 - def.slowFactor) * 100)}% slow`
      : Math.round(towerDamage(state, tower)).toString();
    ctx.fillText(slower ? dmg : `dmg ${dmg}`, P.x + PANEL_PAD, P.y + 84);
    const range = towerRange(state, tower);
    ctx.fillText(
      Number.isFinite(range) ? `range ${Math.round(range)}` : 'range all',
      P.x + PANEL_PAD + 132,
      P.y + 84,
    );
    ctx.fillText(`rate ${towerFireRate(state, tower).toFixed(2)}/s`, P.x + PANEL_PAD, P.y + 106);
    if (!slower) ctx.fillText(`kills ${tower.kills}`, P.x + PANEL_PAD + 132, P.y + 106);
  }

  drawActiveCombos(ctx, tower, P);

  const cost = upgradeCost(tower);
  if (cost === null) {
    panel(ctx, r.upgrade, '#2A2519', 'rgba(0,0,0,0.5)', 2);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(19);
    ctx.textAlign = 'center';
    ctx.fillText('MAX LEVEL', r.upgrade.x + r.upgrade.w / 2, r.upgrade.y + 34);
  } else {
    const affordable = state.gold >= cost;
    panel(
      ctx,
      r.upgrade,
      affordable ? '#4A3D24' : '#2A2519',
      affordable ? accent : 'rgba(0,0,0,0.5)',
      2,
    );
    ctx.textAlign = 'center';
    ctx.fillStyle = affordable ? COLORS.text : '#7A705F';
    ctx.font = font(21);
    ctx.fillText(`UPGRADE  ${cost}g`, r.upgrade.x + r.upgrade.w / 2, r.upgrade.y + 35);
  }

  if (r.target) {
    panel(ctx, r.target, '#2C2519', 'rgba(0,0,0,0.5)', 2);
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(14);
    ctx.fillText('TARGET', r.target.x + 14, r.target.y + 29);
    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.font = font(18);
    ctx.fillText(
      TARGET_MODE_LABELS[tower.targetMode],
      r.target.x + r.target.w - 14,
      r.target.y + 29,
    );
  }

  // The Exchanger's switch, in the row a shooter uses for its targeting mode.
  // Loud and unmissable in both states: an Exchanger you forgot to switch back
  // on is a run's worth of diamonds you silently did not get, and one you
  // forgot to switch OFF is the age you could not afford.
  if (r.toggle) {
    const on = tower.enabled;
    panel(
      ctx,
      r.toggle,
      on ? '#123542' : '#2A2419',
      on ? '#8FE3FF' : 'rgba(0,0,0,0.5)',
      2,
    );
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(14);
    ctx.fillText('CONVERTING', r.toggle.x + 14, r.toggle.y + 29);
    ctx.textAlign = 'right';
    ctx.fillStyle = on ? '#8FE3FF' : '#F4664F';
    ctx.font = font(19);
    ctx.fillText(on ? 'ON' : 'OFF', r.toggle.x + r.toggle.w - 14, r.toggle.y + 29);
  }

  // Sell. Always available, and always shows the exact refund so the player
  // can weigh scrapping an old-age tower against keeping it firing.
  panel(ctx, r.sell, '#3A2A22', '#8A5A46', 2);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#E8A08A';
  ctx.font = font(19);
  ctx.fillText(`SELL  +${sellValue(state, tower)}g`, r.sell.x + r.sell.w / 2, r.sell.y + 33);
  ctx.textAlign = 'left';
}

/**
 * The combos this tower is currently getting, named and priced.
 *
 * Named in the panel as well as on the board link, because the panel is where
 * a player goes to ask "is this tower pulling its weight" — and a Cannon that
 * is quietly running at +40% is the answer to that question.
 */
function drawActiveCombos(ctx: CanvasRenderingContext2D, tower: Tower, P: Rect): void {
  const y = P.y + 158;

  ctx.font = font(13);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText('COMBOS', P.x + PANEL_PAD, y - 4);
  // Stated right where the bonuses are listed. Players reasonably assume more
  // neighbours means more bonus, and nothing on screen said otherwise.
  if (tower.combos.length > 0) {
    ctx.font = font(11);
    ctx.fillStyle = '#6A6152';
    ctx.fillText('each applies once', P.x + PANEL_PAD + 66, y - 4);
    ctx.font = font(13);
  }

  if (tower.combos.length === 0) {
    ctx.fillStyle = '#6A6152';
    ctx.font = font(14);
    ctx.fillText('none — build a partner beside it', P.x + PANEL_PAD, y + 16);
    return;
  }

  let x = P.x + PANEL_PAD;
  let row = y + 16;
  for (const key of tower.combos) {
    const def = COMBOS.find((c) => c.key === key);
    if (!def) continue;
    ctx.font = font(13);
    const w = ctx.measureText(def.label).width + 16;
    // Wrap rather than run off the panel edge; three combos is common.
    if (x + w > P.x + P.w - PANEL_PAD) {
      x = P.x + PANEL_PAD;
      row += 22;
    }
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, row - 14, w, 20, 5);
    ctx.fill();
    ctx.strokeStyle = comboColor(key);
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = comboColor(key);
    ctx.fillText(def.label, x + 8, row);
    x += w + 6;
  }
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
  icon?:
    | 'play'
    | 'pause'
    | 'enterFull'
    | 'exitFull'
    | 'sound'
    | 'muted'
    | 'combos'
    | 'diamond',
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
  if (icon === 'diamond') {
    // A cut gem: crown facets over a pointed pavilion. The same shape the
    // diamond counter and every ability card use, so "this button is about
    // that currency" needs no label.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 13);
    ctx.lineTo(cx - 12, cy - 3);
    ctx.lineTo(cx - 7, cy - 11);
    ctx.lineTo(cx + 7, cy - 11);
    ctx.lineTo(cx + 12, cy - 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(10, 20, 26, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 3);
    ctx.lineTo(cx + 12, cy - 3);
    ctx.moveTo(cx - 7, cy - 11);
    ctx.lineTo(cx - 4, cy - 3);
    ctx.lineTo(cx, cy + 13);
    ctx.moveTo(cx + 7, cy - 11);
    ctx.lineTo(cx + 4, cy - 3);
    ctx.lineTo(cx, cy + 13);
    ctx.stroke();
    return;
  }
  if (icon === 'combos') {
    // Two interlocking rings: the combo rule is literally "two fields that
    // overlap", so the icon is that picture rather than a letter.
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(cx - 5, cy, 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 5, cy, 9, 0, Math.PI * 2);
    ctx.stroke();
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
