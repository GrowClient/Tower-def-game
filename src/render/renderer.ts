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
import type { FxState } from '../fx/effects';
import type { UiState } from '../uiState';
import { drawEntities } from './drawEntities';
import { drawBoardEffects, drawScreenFlash } from './drawEffects';
import { drawComboLinks, drawGrid, drawPlacementGhost, drawSelectionRing } from './drawMap';
import { drawHud, drawWaveBanner, findSelectedTower } from './hud';
import { biomeFor, COLORS } from './palette';
import {
  drawCombosCodex,
  drawGameOverOverlay,
  drawPauseOverlay,
  drawPerkDraft,
  drawRotateHint,
} from './screens';
import { drawTerrain } from './terrain';
import { applyWorldTransform, type Viewport } from './viewport';

export function render(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  state: GameState,
  ui: UiState,
  bestWave: number,
  fx: FxState,
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

  // The whole board re-skins with the age: terrain.ts is keyed on this, so
  // advancing re-bakes the ground, track and props for the new biome.
  const ageIndex = state.age;
  const biome = biomeFor(ageIndex);

  // Screenshake moves the BOARD, not the chrome. Shaking the HUD as well makes
  // the whole thing feel like a loose camera instead of an impact, and text
  // that jitters is text you stop being able to read exactly when a wave is
  // going badly.
  ctx.save();
  ctx.translate(fx.shakeX, fx.shakeY);

  drawTerrain(ctx, state, ageIndex, vp.scale * vp.dpr);
  drawGrid(ctx, state, ui, biome.accent);

  const selected = findSelectedTower(state, ui);
  if (selected) drawSelectionRing(ctx, state, selected, biome.accent);

  drawComboLinks(ctx, state, ui, selected);
  drawEntities(ctx, state, biome, selected?.id ?? null, fx);
  drawPlacementGhost(ctx, state, ui, biome.accent);
  drawBoardEffects(ctx, fx);

  ctx.restore();

  drawWaveBanner(ctx, state);
  drawHud(ctx, state, ui, ageIndex);

  if (state.phase === 'gameover') drawGameOverOverlay(ctx, state, biome, bestWave);
  else if (state.perkChoices !== null) drawPerkDraft(ctx, state.perkChoices, biome, state.perks);
  else if (ui.showCombos) drawCombosCodex(ctx, biome);
  else if (ui.paused) drawPauseOverlay(ctx);

  // Over the overlays too: a flash is the screen, not a layer in it.
  drawScreenFlash(ctx, fx);
}
