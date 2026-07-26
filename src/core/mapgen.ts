/**
 * Seeded map generation.
 *
 * The path is assembled from two kinds of piece, alternating:
 *   RUN — a horizontal stretch, always left-to-right
 *   JOG — a vertical stretch, up or down
 *
 * Because the column index never decreases, the path provably cannot cross
 * itself. That's the whole trick: no retry loop, no validity check, every seed
 * produces a legal map on the first try. Straight/corner tile art is derived
 * afterwards from each cell's in/out directions.
 */

import { MAP } from '../config/balance';
import type { Cell, CellKind, GameMap, PathTile, Vec2 } from './types';
import { CellKind as Kind } from './types';
import { nextBool, nextInt, type Rng } from './rng';

/**
 * Generate a map, re-rolling until the path is long enough to be worth
 * defending. Short paths give towers far less time on target, so accepting
 * them makes two seeds two different difficulties — see MAP.minPathCells.
 *
 * Re-rolls keep consuming the same RNG stream, so this stays fully
 * deterministic: a seed always lands on the same accepted map.
 */
export function generateMap(rng: Rng): GameMap {
  let best: GameMap | null = null;
  for (let attempt = 0; attempt < MAP.maxGenAttempts; attempt++) {
    const candidate = generateOnce(rng);
    if (candidate.tiles.length >= MAP.minPathCells) return candidate;
    if (best === null || candidate.tiles.length > best.tiles.length) best = candidate;
  }
  return best!;
}

function generateOnce(rng: Rng): GameMap {
  const cols = MAP.cols;
  const rows = MAP.rows;

  const minRow = MAP.rowMargin;
  const maxRow = rows - 1 - MAP.rowMargin;

  const walked: Cell[] = [];
  let cx = 0;
  let cy = clamp(nextInt(rng, MAP.startRowMin, MAP.startRowMax), minRow, maxRow);
  walked.push({ cx, cy });

  // Hard iteration cap: purely a guard against a bad balance edit (e.g. a
  // zero-length run) turning this into an infinite loop.
  for (let guard = 0; guard < cols * rows * 4; guard++) {
    if (cx >= cols - 1) break;

    // --- RUN piece: step right ---
    const runLen = nextInt(rng, MAP.runLenMin, MAP.runLenMax);
    for (let i = 0; i < runLen && cx < cols - 1; i++) {
      cx++;
      walked.push({ cx, cy });
    }
    if (cx >= cols - 1) break;

    // --- JOG piece: step up or down, whichever has room ---
    const roomUp = cy - minRow;
    const roomDown = maxRow - cy;
    let dir = 0;
    if (roomUp > 0 && roomDown > 0) dir = nextBool(rng) ? -1 : 1;
    else if (roomUp > 0) dir = -1;
    else if (roomDown > 0) dir = 1;
    if (dir === 0) continue; // boxed in vertically — just keep running right

    const room = dir < 0 ? roomUp : roomDown;
    const jogLen = Math.min(nextInt(rng, MAP.jogLenMin, MAP.jogLenMax), room);
    for (let i = 0; i < jogLen; i++) {
      cy += dir;
      walked.push({ cx, cy });
    }
  }

  const cells: CellKind[] = new Array(cols * rows).fill(Kind.Empty);
  for (const c of walked) cells[c.cy * cols + c.cx] = Kind.Path;

  return { cols, rows, cells, tiles: buildTiles(walked) };
}

/**
 * Annotate each path cell with the direction stepped in and out, so the
 * renderer can pick a straight or corner piece without re-deriving adjacency.
 */
function buildTiles(walked: Cell[]): PathTile[] {
  return walked.map((cell, i) => {
    const prev = walked[i - 1];
    const next = walked[i + 1];
    const outDir: Vec2 = next
      ? { x: Math.sign(next.cx - cell.cx), y: Math.sign(next.cy - cell.cy) }
      : { x: 1, y: 0 }; // last cell exits right, off the board
    const inDir: Vec2 = prev
      ? { x: Math.sign(cell.cx - prev.cx), y: Math.sign(cell.cy - prev.cy) }
      : { x: 1, y: 0 }; // first cell is entered from the left, off the board
    return {
      cell,
      inDir,
      outDir,
      corner: inDir.x !== outDir.x || inDir.y !== outDir.y,
    };
  });
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
