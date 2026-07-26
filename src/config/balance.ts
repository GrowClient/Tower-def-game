/**
 * balance.ts — THE ONLY PLACE TUNABLE NUMBERS LIVE.
 *
 * Rule: if you would ever want to change a number to make the game feel
 * different, it belongs here. Nothing balance-related is hard-coded anywhere
 * else in the codebase. Pure data — this file imports nothing.
 *
 * Sections grow as slices land. Slice 1 covers: world/layout, map generation,
 * simulation timing, and a placeholder enemy so we can watch the path work.
 */

// ---------------------------------------------------------------------------
// World & layout
// ---------------------------------------------------------------------------
// The sim works in fixed "world units", never pixels. The renderer letterboxes
// this 16:9 rectangle into whatever window/phone screen it gets, so the game
// is identical on desktop and on a phone held sideways.
export const WORLD = {
  width: 1600,
  height: 900,
  /** Top strip reserved for the HUD (wave / gold / lives / age). */
  hudTop: 76,
  /** Bottom strip reserved for the tower build bar (thumb reach in landscape). */
  hudBottom: 116,
  /**
   * Horizontal breathing room around the play grid. Must be at least half a
   * cell, because the path is extended one cell past the grid on each side so
   * enemies walk in and out from off-board — with less padding those stubs
   * spill over the letterbox edge.
   */
  padX: 64,
} as const;

// ---------------------------------------------------------------------------
// Map generation
// ---------------------------------------------------------------------------
export const MAP = {
  cols: 20,
  rows: 9,

  /**
   * The path is assembled as alternating pieces: a horizontal RUN (always
   * left-to-right) followed by a vertical JOG. Because column index never
   * decreases, the path mathematically cannot cross itself — that's what
   * makes random assembly safe without a retry loop.
   */
  runLenMin: 2,
  runLenMax: 5,
  jogLenMin: 1,
  jogLenMax: 3,

  /** Rows the path is allowed to occupy (keeps it off the very edge). */
  rowMargin: 1,

  /** Start row is drawn from the middle band so runs feel similar in length. */
  startRowMin: 2,
  startRowMax: 6,
} as const;

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
export const SIM = {
  /** Fixed timestep. The sim ONLY ever advances by exactly this much. */
  dt: 1 / 60,
  /** Safety clamp: max sim steps per rendered frame (prevents spiral of death). */
  maxStepsPerFrame: 8,
  /** Speed toggle multipliers, cycled by the HUD button / [F] key. */
  speeds: [1, 2],
} as const;

// ---------------------------------------------------------------------------
// Run start values
// ---------------------------------------------------------------------------
export const RUN = {
  startingLives: 20,
  startingGold: 250,
} as const;

// ---------------------------------------------------------------------------
// Enemies (slice 1: one placeholder walker so we can see the path work)
// ---------------------------------------------------------------------------
export const ENEMIES = {
  grunt: {
    label: 'Grunt',
    maxHp: 100,
    /** World units per second along the path. */
    speed: 90,
    /** Drawn radius in world units. */
    radius: 16,
    armor: 0,
    bounty: 8,
    /** Lives removed if it reaches the exit. */
    leak: 1,
  },
} as const;

/** Slice-1 demo spawner. Waves (slice 3) replace this entirely. */
export const DEMO_SPAWN = {
  intervalSec: 1.6,
} as const;
