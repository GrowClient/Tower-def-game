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

import { SIM, type AbilityKey, type TowerKind } from './config/balance';

/**
 * Pausing is the one moment a player is guaranteed to be reading rather than
 * reacting, so it is where the reference material belongs.
 */
export const PAUSE_TABS = ['game', 'combos', 'enemies', 'towers', 'abilities'] as const;
export type PauseTab = (typeof PAUSE_TABS)[number];

/**
 * Which screen owns the frame. The menu is session state, not simulation: a
 * replay of a seed must not care that the player stopped at the title screen,
 * and the sim has no concept of "not currently being played".
 */
export type Screen = 'menu' | 'playing';

export interface UiState {
  screen: Screen;
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
  /** The ability tray on the right edge is open. */
  abilityMenuOpen: boolean;
  /**
   * The wave-7 armor briefing has been closed by hand.
   *
   * Session state, not simulation: dismissing a warning does not change the
   * run, and a replay of the same seed must not care whether you read it.
   */
  armorBriefingDismissed: boolean;
  /**
   * The cell the placement ghost is currently sitting on, or null.
   *
   * Placement RESOLVES ON RELEASE, not on press. That one change is what gives
   * a touchscreen the combo preview it never had: press down anywhere on the
   * board, drag, and the ghost follows your finger the whole way — range ring,
   * placement legality and named combo links updating live — then lift to
   * build where it ended up.
   *
   * Deliberately not a separate touch path (see CLAUDE.md). A mouse does the
   * identical thing: press, optionally drag, release. An ordinary click is
   * just a drag of zero distance, so desktop plays exactly as before while
   * gaining the same drag-to-aim if you want it.
   */
  ghostCell: { cx: number; cy: number } | null;
  /** True between pressing on the board with a build tool armed and releasing.
   *  While it is set the ghost tracks the pointer without needing a hover. */
  placing: boolean;
  /** The restart button has been pressed once and is awaiting confirmation. */
  confirmingRestart: boolean;
  /**
   * An ability picked from the tray and waiting for a target on the board.
   *
   * Two-step on purpose, exactly like placing a tower: an ability costs a
   * building's worth of gold and lands somewhere permanent-ish, so "click the
   * card, then click the ground" gives the player a beat to change their mind.
   * A one-click cast would fire the expensive thing at whatever was under the
   * cursor when they were reading the tooltip.
   */
  armedAbility: AbilityKey | null;
  /**
   * The opening tutorial has been retired for good.
   *
   * Only a flag, never a step index: which step is showing is DERIVED from the
   * run (see tutorial.ts), so there is no counter here to drift out of sync
   * with what the player has actually done.
   */
  tutorialDone: boolean;
  /** Smoothed frames-per-second, for the debug corner. */
  fps: number;
}

export function newUiState(): UiState {
  return {
    screen: 'menu',
    paused: false,
    speedIndex: 0,
    pointer: null,
    buildKind: null,
    selectedTowerId: null,
    fullscreen: false,
    muted: false,
    showCombos: false,
    pauseTab: 'game',
    abilityMenuOpen: false,
    armorBriefingDismissed: false,
    ghostCell: null,
    placing: false,
    confirmingRestart: false,
    armedAbility: null,
    tutorialDone: false,
    fps: 0,
  };
}

export function speedMultiplier(ui: UiState): number {
  return SIM.speeds[ui.speedIndex] ?? 1;
}

export function cycleSpeed(ui: UiState): void {
  ui.speedIndex = (ui.speedIndex + 1) % SIM.speeds.length;
}

/**
 * Arming a build tool, having a tower selected, and holding an ability are all
 * mutually exclusive — each one wants the next board click to mean something
 * different, so at most one of them may be true at a time.
 */
export function armBuild(ui: UiState, kind: TowerKind | null): void {
  ui.buildKind = ui.buildKind === kind ? null : kind;
  // The pinned ghost previewed the OLD tool's range and combos, so it must not
  // survive into the new one — the next tap would build something the player
  // never saw a preview of.
  ui.ghostCell = null;
  ui.placing = false;
  if (ui.buildKind !== null) {
    ui.selectedTowerId = null;
    ui.armedAbility = null;
  }
}

export function selectTower(ui: UiState, towerId: number | null): void {
  ui.selectedTowerId = towerId;
  if (towerId !== null) {
    ui.buildKind = null;
    ui.armedAbility = null;
  }
}

/** Pick up an ability, or put it back down if it was already held. */
export function armAbility(ui: UiState, key: AbilityKey | null): void {
  ui.armedAbility = ui.armedAbility === key ? null : key;
  if (ui.armedAbility !== null) {
    ui.buildKind = null;
    ui.selectedTowerId = null;
  }
}
