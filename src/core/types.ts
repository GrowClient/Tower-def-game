/**
 * Shared types for the pure simulation.
 *
 * `core/` may only import from `core/` and `config/`. No DOM, no Canvas,
 * no `window`, no `Date`, no `Math.random`.
 */

import type { BossMechanic, EnemyKind, PerkKey, TargetMode, TowerKind } from '../config/balance';
import type { Rng } from './rng';

export type { BossMechanic, EnemyKind, PerkKey, TargetMode, TowerKind };

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

  /** Active movement multiplier, and how long it lasts. Refreshed by auras. */
  slowFactor: number;
  slowTimer: number;
  /** Slows simply don't apply — used by the Warlord boss. */
  slowImmune: boolean;

  /**
   * Whole hits still absorbed. Each hit costs exactly one, no matter its size,
   * which is what makes fire rate rather than damage the answer.
   */
  shield: number;
  maxShield: number;

  /** Healer aura: HP/sec restored to OTHER enemies within healRadius. */
  healPerSecond: number;
  healRadius: number;

  /** Armor granted to nearby enemies, and armor currently received from auras.
   *  `auraArmor` is recomputed from scratch every step, never accumulated. */
  armorAura: number;
  armorAuraRadius: number;
  auraArmor: number;

  /** Boss state. `mechanic` is null for ordinary units. */
  mechanic: BossMechanic | null;
  /** summoner: how many HP thresholds have already fired. */
  summonsFired: number;
  /** regenerator: seconds until the next self-repair. */
  regenTimer: number;

  /** Damage-over-time. Stored as one stack rather than a list: re-applying
   *  refreshes the timer and keeps the stronger dps, which is far cheaper than
   *  tracking N independent burns and reads the same in play. */
  burnDps: number;
  burnTimer: number;

  /** Counts down after taking damage; drives the renderer's hit flash. */
  flash: number;

  /** Set true when it dies or leaks; removed at the end of a step. */
  dead: boolean;
}

// --- Towers -----------------------------------------------------------------

export interface Tower {
  id: number;
  kind: TowerKind;
  cell: Cell;
  pos: Vec2;
  level: number;
  /** Seconds until this tower may fire again. */
  cooldown: number;
  /** Total gold sunk in, for the end-of-run summary. */
  invested: number;
  /** Kills credited to this tower, for the end-of-run summary. */
  kills: number;
  /** Aim angle, kept so the renderer can point the tower without owning state. */
  aim: number;
  /** Counts down after firing; drives the renderer's recoil. */
  recoil: number;
  /** Which enemy this tower prefers to shoot. */
  targetMode: TargetMode;
}

export type ProjectileLook = 'rock' | 'boulder' | 'arrow' | 'cannonball' | 'rail' | 'bullet';

export interface Projectile {
  id: number;
  pos: Vec2;
  /** The enemy this was fired at. It may die mid-flight. */
  targetId: number;
  /** Last known target position, so an orphaned shot still lands somewhere. */
  aimAt: Vec2;
  speed: number;
  damage: number;
  splash: number;
  armorPierce: number;
  /** Fired by which tower — so kill credit lands in the right place. */
  ownerId: number;
  /** How the renderer should draw this shot. Set from the firing tower, so a
   *  cannonball never comes out looking like a rifle round. */
  look: ProjectileLook;
  /** Enemies this shot may still pass through before stopping. */
  pierce: number;
  /** Already-hit enemy ids, so a piercing shot can't hit the same unit twice
   *  as it travels along the line. */
  hitIds: number[];
  burnDps: number;
  burnSeconds: number;
  life: number;
  dead: boolean;
}

// --- Waves ------------------------------------------------------------------

/** One pending spawn, already resolved to a concrete type and time. */
export interface SpawnOrder {
  kind: EnemyKind;
  /** Sim time at which this unit enters. */
  at: number;
}

export interface WaveState {
  /** Wave currently running, or just finished. 0 before the first wave. */
  number: number;
  /** Countdown to the next wave starting. */
  timer: number;
  /** Spawns still to come in the current wave. */
  queue: SpawnOrder[];
  /** True between the last spawn and the last enemy leaving the board. */
  active: boolean;
}

// --- Player intents ---------------------------------------------------------

/**
 * Player actions are queued and applied at the START of a sim step, never
 * mid-step. That keeps a run reproducible from (seed, intent log) and means
 * input timing can't desync the simulation.
 */
export type Intent =
  | { type: 'placeTower'; kind: TowerKind; cx: number; cy: number }
  | { type: 'upgradeTower'; towerId: number }
  | { type: 'cycleTargetMode'; towerId: number }
  | { type: 'sellTower'; towerId: number }
  | { type: 'advanceAge' }
  | { type: 'choosePerk'; key: PerkKey };

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
  towers: Tower[];
  projectiles: Projectile[];
  nextEntityId: number;

  /** Tower id occupying each cell, or 0. Row-major, same indexing as map.cells. */
  occupancy: Int32Array;

  gold: number;
  lives: number;
  wave: WaveState;

  /** 0 = Stone, 1 = Middle, 2 = Tech. Advancing unlocks; it never transforms. */
  age: number;
  /** Stacks taken per perk. */
  perks: Partial<Record<PerkKey, number>>;
  /** Perks currently offered, or null when no draft is open. While this is
   *  non-null the wave clock is held — see core/perks.ts. */
  perkChoices: PerkKey[] | null;

  /** Applied and cleared at the start of each step. */
  intents: Intent[];

  /** Populated when the run ends, for the summary screen. */
  killedBy: EnemyKind | null;

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
  | { type: 'enemyHit'; at: Vec2; damage: number }
  | { type: 'shieldAbsorbed'; at: Vec2; remaining: number }
  | { type: 'enemyHealed'; at: Vec2 }
  | { type: 'bossSpawned'; at: Vec2; kind: EnemyKind }
  | { type: 'bossKilled'; at: Vec2; kind: EnemyKind }
  | { type: 'enemyKilled'; at: Vec2; kind: EnemyKind; bounty: number }
  | { type: 'enemyLeaked'; at: Vec2; livesLost: number }
  | { type: 'towerPlaced'; at: Vec2; kind: TowerKind }
  | { type: 'towerFired'; at: Vec2; kind: TowerKind }
  | { type: 'towerUpgraded'; at: Vec2; level: number }
  | { type: 'towerSold'; at: Vec2; refund: number }
  | { type: 'chainArc'; from: Vec2; to: Vec2 }
  | { type: 'ageAdvanced'; age: number }
  | { type: 'perkDraftOpened' }
  | { type: 'perkChosen'; key: PerkKey }
  | { type: 'purchaseDenied'; at: Vec2 }
  | { type: 'waveStarted'; number: number }
  | { type: 'waveCleared'; number: number; reward: number }
  | { type: 'gameOver' };
