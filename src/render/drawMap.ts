/**
 * The dynamic map overlay: everything drawn *on top of* the baked terrain that
 * can change between frames — the cell lattice, placement ghosts, range rings.
 *
 * The terrain itself (ground, scatter, track) is baked once per run in
 * terrain.ts. Nothing static belongs here.
 *
 * Render rule: reads game state, never mutates it.
 */

import { COMBOS, TOWERS, WORLD, type ComboKey } from '../config/balance';
import { comboPartners, previewCombos } from '../core/combos';
import { cellOrigin, cellCenter, inBounds } from '../core/grid';
import { placementError } from '../core/towers';
import { towerRange } from '../core/towers';
import { CellKind, type GameState, type Tower } from '../core/types';
import type { UiState } from '../uiState';
import { COLORS, font } from './palette';
import { drawTowerArt } from './drawEntities';
import { PLACEMENT_CANCEL, roundRect } from './hud';
import { biomeFor } from './palette';

/**
 * A whisper of a grid. Players need to know cells exist, but a hard lattice is
 * what makes a board look like a spreadsheet instead of a place.
 *
 * Only BUILDABLE cells are outlined — ruling the track into squares made it
 * read as laid brickwork instead of worn dirt.
 *
 * While a build tool is armed, the cells that tool could legally use light up.
 * That is the moment the grid earns being visible, so that's when it gets loud.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
): void {
  const { layout, map } = state;
  const cs = layout.cellSize;
  const arming = ui.buildKind;

  ctx.save();

  if (arming === null) {
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let cy = 0; cy < map.rows; cy++) {
      for (let cx = 0; cx < map.cols; cx++) {
        if (map.cells[cy * map.cols + cx] === CellKind.Path) continue;
        const o = cellOrigin(layout, cx, cy);
        ctx.rect(o.x + 0.5, o.y + 0.5, cs - 1, cs - 1);
      }
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Build mode: shade every cell this tower type can actually go on.
  // Deliberately COLORS.buildOk rather than the biome accent — see palette.ts.
  const wantsPath = TOWERS[arming]!.onPath;
  for (let cy = 0; cy < map.rows; cy++) {
    for (let cx = 0; cx < map.cols; cx++) {
      const isPath = map.cells[cy * map.cols + cx] === CellKind.Path;
      if (isPath !== wantsPath) continue;

      const free = state.occupancy[cy * map.cols + cx] === 0;
      const o = cellOrigin(layout, cx, cy);
      ctx.fillStyle = free ? hexToRgba(COLORS.buildOk, 0.13) : 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(o.x + 2, o.y + 2, cs - 4, cs - 4);
      ctx.strokeStyle = free ? hexToRgba(COLORS.buildOk, 0.35) : 'rgba(0, 0, 0, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(o.x + 2, o.y + 2, cs - 4, cs - 4);
    }
  }
  ctx.restore();
}

/**
 * The ghost under the cursor: what you'd get, where, and whether it's allowed.
 * It calls the same `placementError` the simulation uses to accept or reject
 * the intent, so a green ghost can never turn out to be an illegal placement.
 */
export function drawPlacementGhost(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
): void {
  const kind = ui.buildKind;
  const cell = ui.ghostCell;
  if (kind === null || cell === null) return;

  const { layout } = state;
  const { cx, cy } = cell;
  if (!inBounds(state.map, cx, cy)) return;

  const err = placementError(state, kind, cx, cy);
  const ok = err === null;
  const center = cellCenter(layout, cx, cy);
  const def = TOWERS[kind]!;
  const tint = ok ? COLORS.buildOk : COLORS.buildBad;

  // Range preview first, so the ghost sits on top of it. A Sniper has no
  // meaningful ring — drawing one of radius Infinity paints the whole screen.
  if (def.range > 0 && !def.unlimitedRange) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, def.range, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(tint, 0.08);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(tint, 0.5);
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Deliberately NO second circle for the combo link radius.
  //
  // It was drawn here, and two concentric dashed rings of different sizes
  // around one ghost read as one confusing diagram rather than two facts. The
  // named link lines to the actual partners already say everything the radius
  // was trying to: they show you exactly which towers you would pair with, and
  // they say what the pairing is called.

  // Name the reason on the ghost when it is the cap, because "everything is
  // red" is otherwise indistinguishable from "this cell is wrong".
  if (err === 'atCapacity') {
    ctx.font = font(14);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.buildBad;
    ctx.fillText('TOWER LIMIT', center.x, center.y - layout.cellSize * 0.6);
    ctx.textAlign = 'left';
  }

  // Only while actually dragging — that is the moment the player needs telling
  // that lifting is what commits. A hovering mouse does not need a caption on
  // every cell it passes over.
  if (ui.placing) {
    ctx.font = font(13);
    ctx.textAlign = 'center';
    ctx.fillStyle = hexToRgba(tint, 0.95);
    ctx.fillText(
      ok ? 'RELEASE TO BUILD' : 'CANNOT BUILD HERE',
      center.x,
      center.y + layout.cellSize * 0.78,
    );
    ctx.textAlign = 'left';
  }

  const o = cellOrigin(layout, cx, cy);
  ctx.fillStyle = hexToRgba(tint, 0.28);
  ctx.fillRect(o.x + 2, o.y + 2, layout.cellSize - 4, layout.cellSize - 4);

  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.translate(center.x, center.y);
  drawTowerArt(ctx, kind, layout.cellSize * 0.34, 0, 0, biomeFor(state.age));
  ctx.restore();
}

/**
 * Combo links: a line between every pair of towers currently comboing.
 *
 * Shown only while a tower is selected or a build tool is armed, because a
 * mature board has dozens of links and drawing them permanently turns the map
 * into a cat's cradle. Those two moments are exactly when the player is asking
 * "what does this touch?", which is the question the links answer.
 */
export function drawComboLinks(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  selected: Tower | null,
): void {
  if (selected === null && ui.buildKind === null) return;

  ctx.save();
  ctx.lineCap = 'round';

  // For a selected tower: only its own links, so the answer is unambiguous.
  if (selected) {
    for (const { partner, keys } of comboPartners(state, selected)) {
      linkLine(ctx, selected.pos, partner.pos, comboColor(keys[0]!), 3, 1);
      labelMidpoint(ctx, selected.pos, partner.pos, keys, 1);
    }
    ctx.restore();
    return;
  }

  // While building: preview what the tower at the ghost WOULD gain, so a combo
  // can be seen before it is paid for rather than discovered after.
  //
  // Keyed off the ghost CELL, not the pointer. A finger has no hover, and a
  // touch gesture can end in `pointercancel` — which cleared the pointer and
  // took the whole preview with it, leaving the two-step placement with
  // nothing to show between the taps.
  const kind = ui.buildKind;
  const cell = ui.ghostCell;
  if (kind === null || cell === null) {
    ctx.restore();
    return;
  }
  const { layout } = state;
  const { cx, cy } = cell;
  if (!inBounds(state.map, cx, cy)) {
    ctx.restore();
    return;
  }
  const center = cellCenter(layout, cx, cy);
  for (const { partner, keys } of previewCombos(state, kind, center)) {
    linkLine(ctx, center, partner.pos, comboColor(keys[0]!), 3.5, 0.9);
    labelMidpoint(ctx, center, partner.pos, keys, 0.9);
  }
  ctx.restore();
}

function linkLine(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  color: string,
  width: number,
  alpha: number,
): void {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = width + 2.5;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** The combo's name, on the link itself — naming it is how it gets learned. */
function labelMidpoint(
  ctx: CanvasRenderingContext2D,
  a: { x: number; y: number },
  b: { x: number; y: number },
  keys: ComboKey[],
  alpha: number,
): void {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const text = keys.map((k) => COMBOS.find((c) => c.key === k)?.label ?? k).join(' + ');

  ctx.globalAlpha = alpha;
  ctx.font = font(13);
  ctx.textAlign = 'center';
  const w = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(10, 8, 6, 0.82)';
  roundRect(ctx, mx - w / 2 - 7, my - 11, w + 14, 20, 5);
  ctx.fill();
  ctx.fillStyle = comboColor(keys[0]!);
  ctx.fillText(text, mx, my + 4);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

/**
 * The placement banner: what you are holding, whether it can go here, what it
 * would pair with, and — loudly — how to commit it.
 *
 * This is CHROME, pinned to the top of the board and drawn outside the shake
 * transform, and it exists because of two things a phone does that a desk
 * does not.
 *
 * A finger covers the cell it is touching. Every piece of placement feedback
 * lived on that cell — the ghost, the RELEASE TO BUILD caption, and the combo
 * link labels radiating from it — so on mobile the player was making the
 * decision with their hand over the answer. The combo system was effectively
 * invisible there: it had been built, named and coloured for a mouse cursor,
 * which is one pixel wide and casts no shadow.
 *
 * And nothing said what commits the purchase. Drag-to-place builds on RELEASE,
 * which is not guessable — a player who drags to a cell, sees the ghost sitting
 * there, and lifts off expecting a second confirming tap has no way to learn
 * the rule except by accident. "Why isn't it placing?" is the report that comes
 * back from that, and it comes back from someone who did nothing wrong.
 */
export function drawPlacementBanner(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
): void {
  const kind = ui.buildKind;
  if (kind === null) return;


  const def = TOWERS[kind]!;
  const cell = ui.ghostCell;
  const err = cell === null ? 'noCell' : placementError(state, kind, cell.cx, cell.cy);
  const ok = err === null;

  // Combo names for the cell being considered — the whole reason this banner
  // is worth the screen space, since these are what the finger was covering.
  let keys: ComboKey[] = [];
  if (ok && cell !== null) {
    const center = cellCenter(state.layout, cell.cx, cell.cy);
    const seen = new Set<ComboKey>();
    for (const { keys: ks } of previewCombos(state, kind, center)) {
      for (const k of ks) seen.add(k);
    }
    keys = [...seen];
  }

  const status = ok
    ? ui.placing
      ? 'RELEASE TO BUILD'
      : 'DRAG ONTO A CELL — RELEASE TO BUILD'
    : PLACEMENT_REASONS[err] ?? 'CANNOT BUILD HERE';
  const statusColor = ok ? COLORS.buildOk : COLORS.buildBad;

  // Measure everything first: the panel is sized to its contents so a short
  // message does not sit in a wide empty box.
  const NAME_SIZE = 19;
  const STATUS_SIZE = 17;
  const CHIP_SIZE = 14;
  const PAD = 18;
  const GAP = 14;

  ctx.save();
  ctx.font = font(NAME_SIZE);
  const nameW = ctx.measureText(def.label).width;
  ctx.font = font(STATUS_SIZE);
  const statusW = ctx.measureText(status).width;
  ctx.font = font(CHIP_SIZE);
  const chips = keys.map((k) => ({
    key: k,
    text: COMBOS.find((c) => c.key === k)?.label ?? k,
    w: ctx.measureText(COMBOS.find((c) => c.key === k)?.label ?? k).width + 18,
  }));
  const chipsW = chips.reduce((a, c) => a + c.w + 8, 0);

  const h = 44;
  const w = PAD * 2 + nameW + GAP + statusW + (chips.length > 0 ? GAP + chipsW : 0);
  const x = (WORLD.width - w) / 2;
  const y = WORLD.hudTop + 12;

  ctx.fillStyle = 'rgba(18, 13, 9, 0.9)';
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(statusColor, 0.7);
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let cx = x + PAD;

  ctx.font = font(NAME_SIZE);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(def.label, cx, y + h / 2);
  cx += nameW + GAP;

  ctx.font = font(STATUS_SIZE);
  ctx.fillStyle = statusColor;
  ctx.fillText(status, cx, y + h / 2);
  cx += statusW + GAP;

  // Chips carry the SAME colour as the link line for that combo, so the two
  // readings of the same fact are recognisably one fact.
  ctx.font = font(CHIP_SIZE);
  for (const chip of chips) {
    const col = comboColor(chip.key);
    ctx.fillStyle = hexToRgba(col, 0.2);
    roundRect(ctx, cx, y + 11, chip.w, h - 22, (h - 22) / 2);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(col, 0.85);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.fillText(chip.text, cx + chip.w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left';
    cx += chip.w + 8;
  }

  ctx.restore();
}

/**
 * Drop here to throw the drag away. Lights up when the pointer is over it.
 *
 * Drawn AFTER the HUD, not with the rest of the placement chrome. It sits over
 * the build bar by design — that is where the thumb came from — and the build
 * bar is painted later than the placement banner, so drawing it any earlier
 * put it underneath the very thing it overlaps and made it invisible.
 */
export function drawCancelTarget(ctx: CanvasRenderingContext2D, ui: UiState): void {
  if (!ui.placing || ui.buildKind === null) return;
  const r = PLACEMENT_CANCEL;
  const over =
    ui.pointer !== null &&
    ui.pointer.x >= r.x &&
    ui.pointer.x <= r.x + r.w &&
    ui.pointer.y >= r.y &&
    ui.pointer.y <= r.y + r.h;

  ctx.save();
  ctx.fillStyle = over ? 'rgba(150, 34, 24, 0.95)' : 'rgba(30, 16, 12, 0.92)';
  roundRect(ctx, r.x, r.y, r.w, r.h, 12);
  ctx.fill();
  ctx.strokeStyle = over ? '#FFD9D0' : '#F4664F';
  ctx.lineWidth = over ? 4 : 2.5;
  ctx.stroke();

  // A big X, drawn rather than typed: a glyph at this size renders differently
  // across platforms and this one has to read instantly at arm's length.
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2 - 8;
  const d = over ? 19 : 16;
  ctx.strokeStyle = over ? '#FFFFFF' : '#F4664F';
  ctx.lineWidth = over ? 7 : 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - d, cy - d);
  ctx.lineTo(cx + d, cy + d);
  ctx.moveTo(cx + d, cy - d);
  ctx.lineTo(cx - d, cy + d);
  ctx.stroke();

  ctx.fillStyle = over ? '#FFFFFF' : '#C98A80';
  ctx.font = font(13);
  ctx.textAlign = 'center';
  ctx.fillText(over ? 'RELEASE TO CANCEL' : 'DRAG HERE TO CANCEL', cx, r.y + r.h - 12);
  ctx.textAlign = 'left';
  ctx.restore();
}

const PLACEMENT_REASONS: Record<string, string> = {
  noCell: 'DRAG ONTO THE BOARD',
  outOfBounds: 'OFF THE BOARD',
  occupied: 'CELL TAKEN',
  wrongTerrain: 'TRAPS GO ON THE ROAD — TOWERS GO BESIDE IT',
  atCapacity: 'TOWER LIMIT REACHED',
  tooPoor: 'NOT ENOUGH GOLD',
};

/** One colour per combo, so a link is identifiable before you read its label. */
export function comboColor(key: ComboKey): string {
  switch (key) {
    case 'thermalShock':
      return '#FF9A5C';
    case 'shatter':
      return '#9FD8F0';
    case 'spotter':
      return '#C8E88A';
    case 'foundry':
      return '#E8B93D';
  }
}

/** Range ring for the tower whose panel is open. */
export function drawSelectionRing(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  tower: Tower,
  accent: string,
): void {
  const range = towerRange(state, tower);
  if (range <= 0 || !Number.isFinite(range)) return;

  ctx.beginPath();
  ctx.arc(tower.pos.x, tower.pos.y, range, 0, Math.PI * 2);
  ctx.fillStyle = hexToRgba(accent, 0.07);
  ctx.fill();
  ctx.strokeStyle = hexToRgba(accent, 0.65);
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
