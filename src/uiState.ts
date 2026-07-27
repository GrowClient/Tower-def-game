/**
 * Session state that is NOT part of the simulation.
 *
 * Pause, speed, pointer position and what the player currently has selected
 * must never live on GameState: they are presentation/session concerns, and
 * putting them in the sim would break the "same seed + same inputs = same run"
 * guarantee (a run replay doesn't care that you paused for lunch, or that you
 * had a tower selected when you died).
 *
 * `main.ts` owns the single instance and passes it to input and render.
 */

import { SIM, type TowerKind } from './config/balance';

/**
 * Pausing is the one moment a player is guaranteed to be reading rather than
 * reacting, so it is where the reference material belongs.
 */
export const PAUSE_TABS = ['game', 'combos', 'enemies', 'towers'] as const;
export type PauseTab = (typeof PAUSE_TABS)[number];

export interface UiState {
  paused: boolean;
  /** Index into SIM.speeds. */
  speedIndex: number;
  /** Pointer position in world units, or null when there is no pointer
   *  (touch devices between taps). */
  pointer: { x: number; y: number } | null;
  /** Tower type armed for placement, or null. */
  buildKind: TowerKind | null;
  /** Tower whose info panel is open, or null. */
  selectedTowerId: number | null;
  /** True while the browser reports we own the screen. Mirrored from the
   *  fullscreenchange event rather than queried per frame. */
  fullscreen: boolean;
  /** Sound off. Mirrors the audio layer so the HUD can draw the right icon. */
  muted: boolean;
  /** The combos reference sheet is open. Session state, not simulation — a
   *  replay does not care that you stopped to read the rules. */
  showCombos: boolean;
  /** Which tab the pause menu is showing. */
  pauseTab: PauseTab;
  /** Smoothed frames-per-second, for the debug corner. */
  fps: number;
}

export function newUiState(): UiState {
  return {
    paused: false,
    speedIndex: 0,
    pointer: null,
    buildKind: null,
    selectedTowerId: null,
    fullscreen: false,
    muted: false,
    showCombos: false,
    pauseTab: 'game',
    fps: 0,
  };
}

export function speedMultiplier(ui: UiState): number {
  return SIM.speeds[ui.speedIndex] ?? 1;
}

export function cycleSpeed(ui: UiState): void {
  ui.speedIndex = (ui.speedIndex + 1) % SIM.speeds.length;
}

/** Arming a build tool and having a tower selected are mutually exclusive. */
export function armBuild(ui: UiState, kind: TowerKind | null): void {
  ui.buildKind = ui.buildKind === kind ? null : kind;
  if (ui.buildKind !== null) ui.selectedTowerId = null;
}

export function selectTower(ui: UiState, towerId: number | null): void {
  ui.selectedTowerId = towerId;
  if (towerId !== null) ui.buildKind = null;
}
