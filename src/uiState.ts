/**
 * Session state that is NOT part of the simulation.
 *
 * Pause, speed setting and pointer position must never live on GameState:
 * they are presentation/session concerns, and putting them in the sim would
 * break the "same seed + same inputs = same run" guarantee (a run replay
 * doesn't care that you paused for lunch).
 *
 * `main.ts` owns the single instance and passes it to input and render.
 */

import { SIM } from './config/balance';

export interface UiState {
  paused: boolean;
  /** Index into SIM.speeds. */
  speedIndex: number;
  /** Pointer position in world units, or null when there is no pointer
   *  (touch devices between taps). */
  pointer: { x: number; y: number } | null;
  /** Smoothed frames-per-second, for the debug corner. */
  fps: number;
}

export function newUiState(): UiState {
  return { paused: false, speedIndex: 0, pointer: null, fps: 0 };
}

export function speedMultiplier(ui: UiState): number {
  return SIM.speeds[ui.speedIndex] ?? 1;
}

export function cycleSpeed(ui: UiState): void {
  ui.speedIndex = (ui.speedIndex + 1) % SIM.speeds.length;
}
