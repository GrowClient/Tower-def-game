/**
 * Top-level draw orchestration.
 *
 * HARD RULE for everything under `src/render/`: read game state, never write
 * it. If a draw function needs to remember something between frames, that
 * state belongs in `src/fx/` or `UiState`, not on GameState.
 */

import { WORLD } from '../config/balance';
import type { GameState } from '../core/types';
import type { UiState } from '../uiState';
import { drawEntities } from './drawEntities';
import { drawMap } from './drawMap';
import { drawHud } from './hud';
import { COLORS } from './palette';
import { drawGameOverOverlay, drawPauseOverlay, drawRotateHint } from './screens';
import { applyWorldTransform, type Viewport } from './viewport';

export function render(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  state: GameState,
  ui: UiState,
): void {
  // Letterbox bars, drawn in raw screen space.
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.fillStyle = COLORS.letterbox;
  ctx.fillRect(0, 0, vp.cssW, vp.cssH);

  if (vp.portrait) {
    drawRotateHint(ctx, vp);
    return;
  }

  applyWorldTransform(ctx, vp);

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  drawMap(ctx, state);
  drawEntities(ctx, state);

  // Age index is fixed at 0 until slice 5 introduces advancement.
  drawHud(ctx, state, ui, 0);

  if (state.phase === 'gameover') drawGameOverOverlay(ctx, state);
  else if (ui.paused) drawPauseOverlay(ctx);
}
