/**
 * The dynamic map overlay: everything drawn *on top of* the baked terrain that
 * can change between frames — the cell lattice, placement ghosts, range rings.
 *
 * The terrain itself (ground, scatter, track) is baked once per run in
 * terrain.ts. Nothing static belongs here.
 *
 * Render rule: reads game state, never mutates it.
 */

import { TOWERS } from '../config/balance';
import { cellOrigin, cellCenter, inBounds } from '../core/grid';
import { placementError } from '../core/towers';
import { towerRange } from '../core/towers';
import { CellKind, type GameState, type Tower } from '../core/types';
import type { UiState } from '../uiState';
import { COLORS } from './palette';
import { towerGlyph } from './hud';

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
  accent: string,
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
  const wantsPath = TOWERS[arming]!.onPath;
  for (let cy = 0; cy < map.rows; cy++) {
    for (let cx = 0; cx < map.cols; cx++) {
      const isPath = map.cells[cy * map.cols + cx] === CellKind.Path;
      if (isPath !== wantsPath) continue;

      const free = state.occupancy[cy * map.cols + cx] === 0;
      const o = cellOrigin(layout, cx, cy);
      ctx.fillStyle = free ? hexToRgba(accent, 0.13) : 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(o.x + 2, o.y + 2, cs - 4, cs - 4);
      ctx.strokeStyle = free ? hexToRgba(accent, 0.35) : 'rgba(0, 0, 0, 0.35)';
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
  accent: string,
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

  // Range preview first, so the ghost sits on top of it.
  if (def.range > 0) {
    ctx.beginPath();
    ctx.arc(center.x, center.y, def.range, 0, Math.PI * 2);
    ctx.fillStyle = ok ? hexToRgba(accent, 0.08) : 'rgba(244, 102, 79, 0.07)';
    ctx.fill();
    ctx.strokeStyle = ok ? hexToRgba(accent, 0.5) : 'rgba(244, 102, 79, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 7]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const o = cellOrigin(layout, cx, cy);
  ctx.fillStyle = ok ? hexToRgba(accent, 0.28) : 'rgba(244, 102, 79, 0.3)';
  ctx.fillRect(o.x + 2, o.y + 2, layout.cellSize - 4, layout.cellSize - 4);

  ctx.save();
  ctx.globalAlpha = 0.75;
  towerGlyph(ctx, center.x, center.y, layout.cellSize * 0.3, kind, ok ? accent : '#F4664F');
  ctx.restore();
}

/** Range ring for the tower whose panel is open. */
export function drawSelectionRing(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  tower: Tower,
  accent: string,
): void {
  const range = towerRange(state, tower);
  if (range <= 0) return;

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
