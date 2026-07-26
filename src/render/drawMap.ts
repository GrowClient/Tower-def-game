/**
 * Draws the grid and the generated path.
 *
 * Render rule: this file READS game state and never mutates it. Nothing here
 * may write to any object reachable from GameState.
 */

import { cellOrigin } from '../core/grid';
import { CellKind } from '../core/types';
import type { GameState } from '../core/types';
import { COLORS } from './palette';

export function drawMap(ctx: CanvasRenderingContext2D, state: GameState): void {
  const { layout, map } = state;
  const cs = layout.cellSize;

  // --- Buildable cells: subtle plates so the player can read where towers go
  ctx.lineWidth = 1;
  for (let cy = 0; cy < map.rows; cy++) {
    for (let cx = 0; cx < map.cols; cx++) {
      if (map.cells[cy * map.cols + cx] === CellKind.Path) continue;
      const o = cellOrigin(layout, cx, cy);
      ctx.fillStyle = COLORS.buildable;
      ctx.fillRect(o.x + 1, o.y + 1, cs - 2, cs - 2);
      ctx.strokeStyle = COLORS.buildableEdge;
      ctx.strokeRect(o.x + 1.5, o.y + 1.5, cs - 3, cs - 3);
    }
  }

  drawPathBand(ctx, state);
}

/**
 * The path is drawn as one thick stroked polyline through the cell centres
 * rather than per-cell tiles. Round joins turn every corner piece into a clean
 * bend for free, which is exactly what the tile pieces describe anyway.
 */
function drawPathBand(ctx: CanvasRenderingContext2D, state: GameState): void {
  const pts = state.path.points;
  if (pts.length < 2) return;
  const cs = state.layout.cellSize;

  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Outer edge
  trace();
  ctx.strokeStyle = COLORS.pathEdge;
  ctx.lineWidth = cs * 0.92;
  ctx.stroke();

  // Inner fill
  trace();
  ctx.strokeStyle = COLORS.path;
  ctx.lineWidth = cs * 0.78;
  ctx.stroke();

  // Centre guide line — makes travel direction readable at a glance
  trace();
  ctx.strokeStyle = COLORS.pathCenter;
  ctx.lineWidth = Math.max(1, cs * 0.05);
  ctx.setLineDash([cs * 0.22, cs * 0.22]);
  ctx.stroke();
  ctx.setLineDash([]);

  drawEndCap(ctx, pts[0]!.x, pts[0]!.y, cs * 0.3, COLORS.entrance);
  drawEndCap(ctx, pts[pts.length - 1]!.x, pts[pts.length - 1]!.y, cs * 0.3, COLORS.exit);
}

function drawEndCap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
