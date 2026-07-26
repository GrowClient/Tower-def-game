/**
 * Top-level draw orchestration.
 *
 * Draw order is deliberate: baked terrain, then the cell lattice and any
 * placement preview, then units, then chrome. The terrain is a single blit of
 * a canvas baked once per run — see terrain.ts.
 *
 * HARD RULE for everything under `src/render/`: read game state, never write
 * it. If a draw function needs to remember something between frames, that
 * state belongs in `src/fx/` or `UiState`, not on GameState.
 */

import type { GameState } from '../core/types';
import type { UiState } from '../uiState';
import { drawEntities } from './drawEntities';
import { drawGrid, drawPlacementGhost, drawSelectionRing } from './drawMap';
import { drawHud, drawWaveBanner, findSelectedTower } from './hud';
import { biomeFor, COLORS } from './palette';
import { drawGameOverOverlay, drawPauseOverlay, drawRotateHint } from './screens';
import { drawTerrain } from './terrain';
import { applyWorldTransform, type Viewport } from './viewport';

export function render(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  state: GameState,
  ui: UiState,
  bestWave: number,
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

  // Age index is fixed at 0 until slice 5 introduces advancement.
  const ageIndex = 0;
  const biome = biomeFor(ageIndex);

  drawTerrain(ctx, state, ageIndex, vp.scale * vp.dpr);
  drawGrid(ctx, state, ui, biome.accent);

  const selected = findSelectedTower(state, ui);
  if (selected) drawSelectionRing(ctx, selected, biome.accent);

  drawEntities(ctx, state, biome, selected?.id ?? null);
  drawPlacementGhost(ctx, state, ui, biome.accent);

  drawWaveBanner(ctx, state);
  drawHud(ctx, state, ui, ageIndex);

  if (state.phase === 'gameover') drawGameOverOverlay(ctx, state, biome, bestWave);
  else if (ui.paused) drawPauseOverlay(ctx);
}
