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
import { drawAbilityFields, drawAbilityPreview, drawHorn } from './drawAbilities';
import { drawAbilityTray } from './abilityMenu';
import {
  drawComboLinks,
  drawGrid,
  drawCancelTarget,
  drawPlacementBanner,
  drawPlacementGhost,
  drawSelectionRing,
} from './drawMap';
import { drawHud, drawWaveBanner, findSelectedTower } from './hud';
import { biomeFor, COLORS } from './palette';
import {
  drawArmorBriefing,
  drawRestartConfirm,
  drawCombosCodex,
  drawGameOverOverlay,
  drawPauseMenu,
  drawPerkDraft,
  drawRotateHint,
  drawTutorial,
  drawVictoryOverlay,
} from './screens';
import { drawMainMenu } from './menu';
import { currentTutorialStep, tutorialSteps } from '../tutorial';
import { drawTerrain } from './terrain';
import { applyWorldTransform, type Viewport } from './viewport';

export function render(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  state: GameState,
  ui: UiState,
  bestWave: number,
  fx: FxState,
  // `time` is the WALL clock, owned by main.ts. The title screen's scene
  // animates while no simulation is running at all, so it cannot use sim time
  // and must not be given a reason to want one.
  menu: { canContinue: boolean; continueLabel: string; time: number },
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

  // The menu is a place, not an overlay: nothing of the board is drawn behind
  // it, so a title screen can never show a half-simulated run through itself.
  if (ui.screen === 'menu') {
    drawMainMenu(
      ctx,
      menu.canContinue,
      menu.continueLabel,
      bestWave,
      vp.scale * vp.dpr,
      menu.time,
    );
    return;
  }

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
  drawGrid(ctx, state, ui);

  const selected = findSelectedTower(state, ui);
  if (selected) drawSelectionRing(ctx, state, selected, biome.accent);

  drawComboLinks(ctx, state, ui, selected);
  // Fields are terrain, so they go UNDER the units standing in them — a Tar
  // Pit painted over its victims hides the thing it is doing.
  drawAbilityFields(ctx, state);
  drawEntities(ctx, state, biome, selected?.id ?? null, fx);
  drawPlacementGhost(ctx, state, ui);
  drawAbilityPreview(ctx, state, ui);
  drawBoardEffects(ctx, fx);

  ctx.restore();

  // The two big top-of-board captions share a slot, so only one draws. The
  // placement banner wins because the player is actively driving it, and the
  // wave number it hides is already in the stat strip two lines above.
  if (ui.buildKind === null) drawWaveBanner(ctx, state);
  drawHorn(ctx, state);
  // Chrome, so it is drawn outside the shake and pinned to the top of the
  // board — deliberately as far from a thumb on the build bar as the board
  // gets, because the whole point of it is to be readable while a finger is
  // covering the cell it describes.
  drawPlacementBanner(ctx, state, ui);
  // Outside the shake transform with the rest of the chrome, and BEFORE the
  // HUD so the build bar it tells you to use is never covered by it.
  drawArmorBriefing(ctx, state, ui, biome);
  drawHud(ctx, state, ui, ageIndex);
  // After the HUD: the cancel target deliberately overlaps the build bar, so
  // it has to be painted later than the bar it covers.
  drawCancelTarget(ctx, ui);

  // Above the HUD, but hidden entirely behind any full-screen overlay. A tray
  // showing through a pause menu is a menu you can see two of at once.
  const overlayUp =
    state.phase !== 'playing' ||
    state.perkChoices !== null ||
    ui.paused ||
    ui.showCombos ||
    ui.confirmingRestart;
  if (!overlayUp) drawAbilityTray(ctx, state, ui, biome);

  // Under every modal but over the board: the card teaches the board, and one
  // floating on top of a pause menu would be teaching a screen it does not
  // describe.
  if (!overlayUp) {
    const step = currentTutorialStep(state, ui);
    if (step) {
      const steps = tutorialSteps();
      drawTutorial(ctx, step, biome, steps.indexOf(step), steps.length);
    }
  }

  // Above every other overlay: it is a modal question, and the answer has to
  // be the only thing on screen that can be clicked.
  if (ui.confirmingRestart) drawRestartConfirm(ctx, state, biome);
  else if (state.phase === 'won') drawVictoryOverlay(ctx, state, biome);
  else if (state.phase === 'gameover') drawGameOverOverlay(ctx, state, biome, bestWave);
  else if (state.perkChoices !== null) drawPerkDraft(ctx, state.perkChoices, biome, state.perks);
  else if (ui.paused) drawPauseMenu(ctx, state, ui, biome);
  else if (ui.showCombos) drawCombosCodex(ctx, biome);

  // Over the overlays too: a flash is the screen, not a layer in it.
  drawScreenFlash(ctx, fx);
}
