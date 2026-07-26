/**
 * Shared types for the pure simulation.
 *
 * `core/` may only import from `core/` and `config/`. No DOM, no Canvas,
 * no `window`, no `Date`, no `Math.random`.
 */

import type { Rng } from './rng';

// --- Geometry ---------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

/** Integer grid coordinate. */
export interface Cell {
  cx: number;
  cy: number;
}

// --- Grid / map -------------------------------------------------------------

export const CellKind = {
  Empty: 0,
  Path: 1,
} as const;
export type CellKind = (typeof CellKind)[keyof typeof CellKind];

/**
 * How a path cell connects to its neighbours. The renderer uses this to draw
 * the right "tile piece"; the sim never needs it.
 */
export interface PathTile {
  cell: Cell;
  /** Direction stepped INTO this cell (0 for the first cell). */
  inDir: Vec2;
  /** Direction stepped OUT of this cell (equals inDir on the last cell). */
  outDir: Vec2;
  /** True when in/out differ, i.e. this piece is a corner rather than a straight. */
  corner: boolean;
}

export interface GameMap {
  cols: number;
  rows: number;
  /** Row-major, length cols*rows. */
  cells: CellKind[];
  /** Ordered path cells, entrance first. */
  tiles: PathTile[];
}

/** World-space placement of the grid, derived from WORLD + MAP in balance.ts. */
export interface Layout {
  cols: number;
  rows: number;
  cellSize: number;
  /** World position of the grid's top-left corner. */
  originX: number;
  originY: number;
}

// --- Path -------------------------------------------------------------------

/**
 * The path as an arc-length-parameterised polyline. Enemies store a single
 * scalar `dist` along it, which makes slows, knockback and "who is furthest
 * along" targeting trivial scalar maths instead of vector chasing.
 */
export interface Path {
  points: Vec2[];
  /** cumulative[i] = distance from the start to points[i]. */
  cumulative: number[];
  length: number;
}

// --- Enemies ----------------------------------------------------------------

export type EnemyKind = 'grunt';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  /** Distance travelled along the path, in world units. */
  dist: number;
  /** Cached polyline segment index — a pure lookup optimisation for sampleAt. */
  seg: number;
  /** Cached world position, recomputed each step from `dist`. */
  pos: Vec2;
  /** Facing, derived from the path segment. Used by the renderer only. */
  dir: Vec2;
  hp: number;
  maxHp: number;
  baseSpeed: number;
  radius: number;
  armor: number;
  bounty: number;
  leak: number;
  /** Set true when it dies or leaks; removed at the end of the step. */
  dead: boolean;
}

// --- Run state --------------------------------------------------------------

export type RunPhase = 'playing' | 'gameover';

export interface GameState {
  seed: number;
  rng: Rng;
  /** Seconds of simulated time. Advances only in fixed SIM.dt increments. */
  time: number;
  phase: RunPhase;

  layout: Layout;
  map: GameMap;
  path: Path;

  enemies: Enemy[];
  nextEntityId: number;

  gold: number;
  lives: number;
  wave: number;

  /** Slice-1 demo spawner countdown. Waves replace this in slice 3. */
  spawnTimer: number;

  /** Drained by the renderer/fx layer each frame; see core/events.ts. */
  events: SimEvent[];
}

// --- Sim -> presentation events --------------------------------------------

/**
 * The sim never draws, but juice needs to know *when* things happened. So the
 * sim pushes plain data events and the fx layer turns them into particles,
 * shake and damage numbers. This is the only channel from core to visuals.
 */
export type SimEvent =
  | { type: 'enemySpawned'; at: Vec2 }
  | { type: 'enemyLeaked'; at: Vec2; livesLost: number }
  | { type: 'gameOver' };
