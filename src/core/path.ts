/**
 * The path as an arc-length-parameterised polyline.
 *
 * Every enemy stores one scalar: how far along the path it has walked. This is
 * deliberately not "chase the next waypoint" — with a scalar we get, for free:
 *   - slows/hastes are a single multiply on the step
 *   - knockback is a subtraction
 *   - "which enemy is furthest along" (the default tower target) is a compare
 *   - "has it leaked" is `dist >= length`
 */

import { cellCenter } from './grid';
import type { GameMap, Layout, Path, Vec2 } from './types';

/**
 * Build the polyline through every path cell centre, extended one cell beyond
 * each end so enemies visibly walk in from off-board and exit off-board.
 */
export function buildPath(map: GameMap, layout: Layout): Path {
  const tiles = map.tiles;
  if (tiles.length === 0) {
    return { points: [], cumulative: [], length: 0 };
  }

  const points: Vec2[] = [];

  const first = tiles[0]!.cell;
  const firstC = cellCenter(layout, first.cx, first.cy);
  points.push({ x: firstC.x - layout.cellSize, y: firstC.y });

  for (const t of tiles) points.push(cellCenter(layout, t.cell.cx, t.cell.cy));

  const last = tiles[tiles.length - 1]!.cell;
  const lastC = cellCenter(layout, last.cx, last.cy);
  points.push({ x: lastC.x + layout.cellSize, y: lastC.y });

  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
    cumulative.push(total);
  }

  return { points, cumulative, length: total };
}

export interface PathSample {
  pos: Vec2;
  dir: Vec2;
}

/**
 * Position and facing at `dist` along the path. Clamped at both ends.
 *
 * Linear scan from a hint index: enemies only ever move forwards, so callers
 * pass their previous segment and this is O(1) amortised. `segmentHint` is an
 * optimisation only — the result is identical without it.
 */
export function sampleAt(path: Path, dist: number, segmentHint = 0): PathSample & { segment: number } {
  const n = path.points.length;
  if (n === 0) return { pos: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, segment: 0 };
  if (n === 1) return { pos: { ...path.points[0]! }, dir: { x: 1, y: 0 }, segment: 0 };

  const d = clamp(dist, 0, path.length);

  let i = clamp(segmentHint, 0, n - 2);
  // Walk the hint backwards then forwards until d lands inside segment i.
  while (i > 0 && d < path.cumulative[i]!) i--;
  while (i < n - 2 && d > path.cumulative[i + 1]!) i++;

  const a = path.points[i]!;
  const b = path.points[i + 1]!;
  const segStart = path.cumulative[i]!;
  const segLen = path.cumulative[i + 1]! - segStart;
  const t = segLen > 0 ? (d - segStart) / segLen : 0;

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const inv = segLen > 0 ? 1 / segLen : 0;

  return {
    pos: { x: a.x + dx * t, y: a.y + dy * t },
    dir: { x: dx * inv, y: dy * inv },
    segment: i,
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
