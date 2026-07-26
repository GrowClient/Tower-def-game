/**
 * Mouse + touch input.
 *
 * Both go through Pointer Events, so a finger tap and a mouse click produce
 * exactly the same action — there is no separate touch code path to keep in
 * sync. Screen coordinates are converted to world units once, here.
 *
 * Input never mutates GameState. It either changes UiState (what's selected)
 * or emits an Intent, which the sim applies at the start of its next step.
 */

import { WORLD, type PerkKey, type TowerKind } from '../config/balance';
import { worldToCell } from '../core/grid';
import { inBounds } from '../core/grid';
import type { GameState } from '../core/types';
import {
  ADVANCE_BUTTON,
  HUD_BUTTONS,
  PANEL,
  SELL_BUTTON,
  TARGET_BUTTON,
  UPGRADE_BUTTON,
  buildButtons,
  hitTest,
} from '../render/hud';
import { PERK_CARDS } from '../render/screens';
import { placementError } from '../core/towers';
import { screenToWorld, type Viewport } from '../render/viewport';
import { armBuild, selectTower, type UiState } from '../uiState';

export interface InputActions {
  togglePause(): void;
  cycleSpeed(): void;
  restart(): void;
  placeTower(kind: TowerKind, cx: number, cy: number): void;
  upgradeTower(towerId: number): void;
  sellTower(towerId: number): void;
  cycleTargetMode(towerId: number): void;
  advanceAge(): void;
  choosePerk(key: PerkKey): void;
  toggleFullscreen(): void;
  toggleMute(): void;
}

export function attachInput(
  canvas: HTMLCanvasElement,
  ui: UiState,
  getState: () => GameState,
  getViewport: () => Viewport,
  actions: InputActions,
): void {
  const toWorld = (e: PointerEvent) => screenToWorld(getViewport(), e.clientX, e.clientY);

  canvas.addEventListener('pointerdown', (e) => {
    // preventDefault stops a touch from also firing synthetic mouse events and
    // from starting a text-selection / scroll gesture on mobile.
    e.preventDefault();
    const p = toWorld(e);
    ui.pointer = p;
    handleTap(ui, getState(), actions, p.x, p.y);
  });

  canvas.addEventListener('pointermove', (e) => {
    ui.pointer = toWorld(e);
  });

  // A lifted finger has no hover position; nor does a mouse leaving the window.
  // But keep the last position while a build tool is armed on touch, or the
  // placement ghost flickers out between taps.
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse' && ui.buildKind === null) ui.pointer = null;
  });
  canvas.addEventListener('pointercancel', () => {
    ui.pointer = null;
  });
  canvas.addEventListener('pointerleave', () => {
    ui.pointer = null;
  });

  // Block the long-press context menu so it can't interrupt placement.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    switch (e.key) {
      case ' ':
      case 'p':
      case 'P':
        e.preventDefault();
        actions.togglePause();
        break;
      case 'f':
      case 'F':
        actions.cycleSpeed();
        break;
      case 'r':
      case 'R':
        actions.restart();
        break;
      case 'Escape':
        armBuild(ui, null);
        selectTower(ui, null);
        ui.showCombos = false;
        break;
      case 'm':
      case 'M':
        actions.toggleMute();
        break;
      case 'c':
      case 'C':
        ui.showCombos = !ui.showCombos;
        break;
      // Number keys arm the build tools, matching the bar order. Six, because
      // the Tech Age bar is six wide once the Factory is on it.
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6': {
        const btn = buildButtons(getState().age)[Number(e.key) - 1];
        if (btn) armBuild(ui, btn.kind);
        break;
      }
      default:
        break;
    }
  });
}

/**
 * One tap, resolved in priority order: chrome first, then the board. Chrome
 * wins because its buttons overlap the board's world coordinates, and a tap
 * meant for a button must never also place a tower behind it.
 */
function handleTap(
  ui: UiState,
  state: GameState,
  actions: InputActions,
  x: number,
  y: number,
): void {
  // A perk draft is modal: it takes the whole screen and nothing behind it is
  // reachable, so it must be resolved before anything else is considered.
  if (state.perkChoices !== null) {
    state.perkChoices.forEach((key, i) => {
      const card = PERK_CARDS[i];
      if (card && hitTest(card, x, y)) actions.choosePerk(key);
    });
    return;
  }

  // The combos sheet is modal too — any tap dismisses it, so it can never
  // swallow a tap meant for the board underneath.
  if (ui.showCombos) {
    ui.showCombos = false;
    return;
  }

  for (const b of HUD_BUTTONS) {
    if (!hitTest(b, x, y)) continue;
    if (b.id === 'pause') actions.togglePause();
    else if (b.id === 'speed') actions.cycleSpeed();
    else if (b.id === 'fullscreen') actions.toggleFullscreen();
    else if (b.id === 'mute') actions.toggleMute();
    else if (b.id === 'combos') ui.showCombos = !ui.showCombos;
    else actions.restart();
    return;
  }

  for (const b of buildButtons(state.age)) {
    if (!hitTest(b, x, y)) continue;
    armBuild(ui, b.kind);
    return;
  }

  if (hitTest(ADVANCE_BUTTON, x, y)) {
    actions.advanceAge();
    return;
  }

  // The selection panel only swallows taps while it's actually open.
  if (ui.selectedTowerId !== null) {
    if (hitTest(UPGRADE_BUTTON, x, y)) {
      actions.upgradeTower(ui.selectedTowerId);
      return;
    }
    if (hitTest(TARGET_BUTTON, x, y)) {
      actions.cycleTargetMode(ui.selectedTowerId);
      return;
    }
    if (hitTest(SELL_BUTTON, x, y)) {
      actions.sellTower(ui.selectedTowerId);
      selectTower(ui, null); // the panel's subject no longer exists
      return;
    }
    if (hitTest(PANEL, x, y)) return;
  }

  // Taps in the HUD strips that missed every button do nothing, rather than
  // falling through to the board underneath.
  if (y < WORLD.hudTop || y > WORLD.height - WORLD.hudBottom) return;

  const cell = worldToCell(state.layout, x, y);
  if (!inBounds(state.map, cell.cx, cell.cy)) {
    selectTower(ui, null);
    return;
  }

  if (ui.buildKind !== null) {
    actions.placeTower(ui.buildKind, cell.cx, cell.cy);
    // Disarm after a placement that will actually succeed, so one tap on the
    // build bar buys exactly one tower. Checked with the SAME placementError
    // the simulation uses to accept the intent, so a rejected tap (no gold,
    // occupied cell, wrong terrain) leaves the tool armed for a retry rather
    // than silently dropping it.
    if (placementError(state, ui.buildKind, cell.cx, cell.cy) === null) {
      armBuild(ui, null);
    }
    return;
  }

  // Not building: tap a tower to open its panel, tap bare ground to close it.
  const towerId = state.occupancy[cell.cy * state.map.cols + cell.cx] ?? 0;
  selectTower(ui, towerId !== 0 ? towerId : null);
}
