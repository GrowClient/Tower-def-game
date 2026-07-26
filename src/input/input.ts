/**
 * Mouse + touch input.
 *
 * Both go through Pointer Events, so a finger tap and a mouse click produce
 * exactly the same action — there is no separate touch code path to keep in
 * sync. Screen coordinates are converted to world units once, here.
 *
 * Input never touches GameState directly. It calls the action callbacks that
 * main.ts wires up; from slice 2 those become queued intents applied at a step
 * boundary, which is what keeps replays deterministic.
 */

import { HUD_BUTTONS } from '../render/hud';
import { screenToWorld, type Viewport } from '../render/viewport';
import type { UiState } from '../uiState';

export interface InputActions {
  togglePause(): void;
  cycleSpeed(): void;
  restart(): void;
  /** A tap/click on the board, in world units. */
  tapWorld(x: number, y: number): void;
}

export function attachInput(
  canvas: HTMLCanvasElement,
  ui: UiState,
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

    const btn = HUD_BUTTONS.find(
      (b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h,
    );
    if (btn) {
      if (btn.id === 'pause') actions.togglePause();
      else if (btn.id === 'speed') actions.cycleSpeed();
      else actions.restart();
      return;
    }

    actions.tapWorld(p.x, p.y);
  });

  canvas.addEventListener('pointermove', (e) => {
    ui.pointer = toWorld(e);
  });

  // A lifted finger has no hover position; a mouse leaving the window neither.
  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') ui.pointer = null;
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
      default:
        break;
    }
  });
}
