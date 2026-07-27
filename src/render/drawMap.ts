/**
 * The dynamic map overlay: everything drawn *on top of* the baked terrain that
 * can change between frames — the cell lattice, placement ghosts, range rings.
 *
 * The terrain itself (ground, scatter, track) is baked once per run in
 * terrain.ts. Nothing static belongs here.
 *
 * Render rule: reads game state, never mutates it.
 */

import { COMBOS, TOWERS, type ComboKey } from '../config/balance';
import { comboPartners, previewCombos } from '../core/combos';
import { cellOrigin, cellCenter, inBounds } from '../core/grid';
import { placementError } from '../core/towers';
import { towerRange } from '../core/towers';
import { CellKind, type GameState, type Tower } from '../core/types';
import type { UiState } from '../uiState';
import { COLORS, font } from './palette';
import { drawTowerArt } from './drawEntities';
import { roundRect } from './hud';
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
  if (kind === null || ui.pointer === null) return;

  const { layout } = state;
  const cx = Math.floor((ui.pointer.x - layout.originX) / layout.cellSize);
  const cy = Math.floor((ui.pointer.y - layout.originY) / layout.cellSize);
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

  // While building: preview what the tower under the cursor WOULD gain, so a
  // combo can be seen before it is paid for rather than discovered after.
  const kind = ui.buildKind;
  if (kind === null || ui.pointer === null) {
    ctx.restore();
    return;
  }
  const { layout } = state;
  const cx = Math.floor((ui.pointer.x - layout.originX) / layout.cellSize);
  const cy = Math.floor((ui.pointer.y - layout.originY) / layout.cellSize);
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
