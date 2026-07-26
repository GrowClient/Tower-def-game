/**
 * Grid helpers: where the play grid sits in world space, and conversions
 * between cell coordinates and world coordinates.
 */

import { MAP, WORLD } from '../config/balance';
import type { Cell, CellKind, GameMap, Layout, Vec2 } from './types';
import { CellKind as Kind } from './types';

/**
 * Fit the grid into the world rectangle between the HUD strips, keeping cells
 * square and centring what's left over. Deriving this instead of hard-coding
 * means changing MAP.cols/rows in balance.ts just works.
 */
export function makeLayout(): Layout {
  const playW = WORLD.width - WORLD.padX * 2;
  const playH = WORLD.height - WORLD.hudTop - WORLD.hudBottom;
  const cellSize = Math.min(playW / MAP.cols, playH / MAP.rows);
  const gridW = cellSize * MAP.cols;
  const gridH = cellSize * MAP.rows;
  return {
    cols: MAP.cols,
    rows: MAP.rows,
    cellSize,
    originX: WORLD.padX + (playW - gridW) / 2,
    originY: WORLD.hudTop + (playH - gridH) / 2,
  };
}

export function cellIndex(map: GameMap, cx: number, cy: number): number {
  return cy * map.cols + cx;
}

export function inBounds(map: GameMap, cx: number, cy: number): boolean {
  return cx >= 0 && cy >= 0 && cx < map.cols && cy < map.rows;
}

export function kindAt(map: GameMap, cx: number, cy: number): CellKind {
  if (!inBounds(map, cx, cy)) return Kind.Empty;
  return map.cells[cellIndex(map, cx, cy)] ?? Kind.Empty;
}

/** World position of a cell's centre. */
export function cellCenter(layout: Layout, cx: number, cy: number): Vec2 {
  return {
    x: layout.originX + (cx + 0.5) * layout.cellSize,
    y: layout.originY + (cy + 0.5) * layout.cellSize,
  };
}

/** World position of a cell's top-left corner. */
export function cellOrigin(layout: Layout, cx: number, cy: number): Vec2 {
  return {
    x: layout.originX + cx * layout.cellSize,
    y: layout.originY + cy * layout.cellSize,
  };
}

/** Which cell contains this world point? May be out of bounds — check it. */
export function worldToCell(layout: Layout, x: number, y: number): Cell {
  return {
    cx: Math.floor((x - layout.originX) / layout.cellSize),
    cy: Math.floor((y - layout.originY) / layout.cellSize),
  };
}
