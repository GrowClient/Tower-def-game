/**
 * The dynamic map overlay: everything drawn *on top of* the baked terrain that
 * can change between frames — the cell lattice and, from slice 2, placement
 * ghosts and range circles.
 *
 * The terrain itself (ground, scatter, track) is baked once per run in
 * terrain.ts. Nothing static belongs here.
 *
 * Render rule: reads game state, never mutates it.
 */

import { cellOrigin } from '../core/grid';
import { CellKind, type GameState } from '../core/types';
import { COLORS } from './palette';

/**
 * A whisper of a grid. Players need to know cells exist, but a hard lattice is
 * what makes a board look like a spreadsheet instead of a place.
 *
 * Only BUILDABLE cells are outlined. Ruling the track into squares made it
 * read as laid brickwork instead of worn dirt, and the grid there is useless
 * anyway — you can't build on the path (traps aside, in slice 2).
 *
 * Slice 2 lights these up properly while a tower is being placed.
 */
export function drawGrid(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { layout, map } = state;
  const cs = layout.cellSize;

  ctx.save();
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
}
