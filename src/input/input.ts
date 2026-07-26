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

import { WORLD, type TowerKind } from '../config/balance';
import { worldToCell } from '../core/grid';
import { inBounds } from '../core/grid';
import type { GameState } from '../core/types';
import {
  BUILD_BUTTONS,
  HUD_BUTTONS,
  PANEL,
  TARGET_BUTTON,
  UPGRADE_BUTTON,
  hitTest,
} from '../render/hud';
import { screenToWorld, type Viewport } from '../render/viewport';
import { armBuild, selectTower, type UiState } from '../uiState';

export interface InputActions {
  togglePause(): void;
  cycleSpeed(): void;
  restart(): void;
  placeTower(kind: TowerKind, cx: number, cy: number): void;
  upgradeTower(towerId: number): void;
  cycleTargetMode(towerId: number): void;
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
        break;
      // Number keys arm the build tools, matching the bar order.
      case '1':
      case '2':
      case '3':
      case '4': {
        const btn = BUILD_BUTTONS[Number(e.key) - 1];
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
  for (const b of HUD_BUTTONS) {
    if (!hitTest(b, x, y)) continue;
    if (b.id === 'pause') actions.togglePause();
    else if (b.id === 'speed') actions.cycleSpeed();
    else actions.restart();
    return;
  }

  for (const b of BUILD_BUTTONS) {
    if (!hitTest(b, x, y)) continue;
    armBuild(ui, b.kind);
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
    return;
  }

  // Not building: tap a tower to open its panel, tap bare ground to close it.
  const towerId = state.occupancy[cell.cy * state.map.cols + cell.cx] ?? 0;
  selectTower(ui, towerId !== 0 ? towerId : null);
}
