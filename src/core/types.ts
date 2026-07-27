/**
 * Shared types for the pure simulation.
 *
 * `core/` may only import from `core/` and `config/`. No DOM, no Canvas,
 * no `window`, no `Date`, no `Math.random`.
 */

import type {
  AbilityKey,
  BossMechanic,
  ComboKey,
  EnemyKind,
  PerkKey,
  TargetMode,
  TowerKind,
} from '../config/balance';
import type { Rng } from './rng';

export type {
  AbilityKey,
  BossMechanic,
  ComboKey,
  EnemyKind,
  PerkKey,
  TargetMode,
  TowerKind,
};

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
  /**
   * Nothing without armor piercing (or a burn) can hurt this unit — and such
   * towers refuse to target it at all, so an unanswered Armored column makes
   * half your board visibly stand down. See EnemyDef.plated.
   */
  plated: boolean;
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

  /** Armor granted to nearby enemies, and armor currently received from auras.
   *  `auraArmor` is recomputed from scratch every step, never accumulated. */
  armorAura: number;
  armorAuraRadius: number;
  auraArmor: number;

  /** Speed multiplier granted to nearby enemies, and the one currently being
   *  received. `auraSpeed` is rebuilt from scratch every step for the same
   *  reason `auraArmor` is: an accumulated multiplier would leave a unit
   *  permanently sprinting long after the Warchief that buffed it died. */
  speedAura: number;
  speedAuraRadius: number;
  auraSpeed: number;

  /** Boss state. `mechanic` is null for ordinary units. */
  mechanic: BossMechanic | null;
  /** summoner: how many HP thresholds have already fired. */
  summonsFired: number;
  /** summoner: units released per threshold. Carried on the unit rather than
   *  read from a table at use time, so a boss's escalated mechanic travels
   *  with it however it was spawned. */
  summonCount: number;
  /** regenerator: seconds until the next self-repair, and the gap it resets to. */
  regenTimer: number;
  regenInterval: number;

  /** Damage-over-time. Stored as one stack rather than a list: re-applying
   *  refreshes the timer and keeps the stronger dps, which is far cheaper than
   *  tracking N independent burns and reads the same in play. */
  burnDps: number;
  burnTimer: number;

  /** Reacts to being hurt: below `enrageBelowHp` of max, speed multiplies. */
  enrageBelowHp: number;
  enrageSpeedMul: number;
  /** True once enraged, so the renderer can show it and the speed change is
   *  applied exactly once rather than re-derived every step. */
  enraged: boolean;

  /** Reacts to dying: bursts into `splitCount` of `splitInto`. Kept as a plain
   *  string to match the balance table, and validated at the point of use. */
  splitInto: string | null;
  splitCount: number;

  /** Reacts to being ignored: heals once untouched for `regenDelay` seconds. */
  regenPerSecond: number;
  regenDelay: number;
  /** Seconds since this unit last took damage. */
  sinceHit: number;

  /** Damage multiplier from a Null Field. Rebuilt from scratch every step for
   *  the same reason the auras are: a lingering multiplier from an expired
   *  field would quietly make a unit soft for the rest of the run. */
  vulnerable: number;

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
  /** Service record. Earned from whatever this tower actually does — kills for
   *  shooters, chills for slowers, payouts for economy buildings — and spent
   *  on nothing: it only ever raises the tower's rank. See VETERANCY. */
  xp: number;
  /** Gold this tower has paid out over its life. Only ever non-zero on an
   *  economy building, and the number the panel compares against `invested`
   *  to tell the player whether it is in profit yet. */
  earned: number;
  /** Aim angle, kept so the renderer can point the tower without owning state. */
  aim: number;
  /** Counts down after firing; drives the renderer's recoil. */
  recoil: number;
  /** Which enemy this tower prefers to shoot. */
  targetMode: TargetMode;
  /**
   * The last enemy this tower actually fired at.
   *
   * Only slowers consult it, and only to avoid shooting the same unit twice in
   * a row: a chill takes a moment to arrive, so "prefer someone un-chilled" on
   * its own would still re-shoot a target whose shot is mid-flight. Together
   * they make a slower sweep the lane instead of pinning one enemy forever.
   */
  lastTargetId: number;
  /**
   * Traps only. Builds while the trap sits unused and is dumped into the next
   * trigger, so an idle trap lands a big hit instead of being wasted road.
   * Lives on the tower rather than being derived from a timestamp because the
   * renderer draws it, and `state.time - lastFired` would keep climbing while
   * a perk draft holds the clock.
   */
  charge: number;
  /**
   * Switched on. Only an Exchanger can be switched off, and it is the whole
   * reason the building is a strategy rather than a purchase: it SPENDS gold
   * every wave, so "is converting worth it right now?" is a question with a
   * different answer while you are saving for an age than while you are
   * sitting on a surplus you cannot spend.
   *
   * Lives on the tower rather than in UiState because it changes what the
   * simulation does, and anything that changes the sim has to be part of the
   * run that a seed reproduces.
   */
  enabled: boolean;
  /**
   * Combos currently active on this tower, deduplicated and sorted.
   *
   * Cached rather than recomputed per use because it is an O(towers²) sweep
   * and it only changes when the board does — see `core/combos.ts`.
   */
  combos: ComboKey[];
}

/**
 * One look per WEAPON, not per role.
 *
 * Every tower used to fire the same tumbling rock, which quietly undid the
 * work the tower art does: a Singularity and a Thrower looked identical the
 * moment the shot left the barrel, and the board read as one weapon repeated
 * twelve times. A shot in flight is on screen far longer than the muzzle
 * flash, so it is the strongest identity cue a tower has.
 */
export type ProjectileLook =
  | 'rock'
  | 'boulder'
  | 'slush'
  | 'arrow'
  | 'cannonball'
  | 'frostShard'
  | 'laser'
  | 'cryoOrb'
  | 'blackHole'
  | 'rail';

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
  /** Slow applied on impact. 1 means this shot doesn't slow. */
  slowFactor: number;
  slowSeconds: number;
  life: number;
  dead: boolean;
}

// --- Abilities --------------------------------------------------------------

/**
 * One ability field currently running on the board.
 *
 * Instant abilities (a strike) never produce one of these — they resolve
 * entirely inside `castAbility` and leave only an fx event behind. Anything
 * with a duration lives here so it keeps working while the player does
 * something else, which is the entire reason a field is different from a shot.
 */
export interface AbilityEffect {
  id: number;
  key: AbilityKey;
  pos: Vec2;
  radius: number;
  /** Seconds left before it expires. */
  remaining: number;
  /** Counts down to the next damage tick, for barrages. */
  tickTimer: number;
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
  | { type: 'choosePerk'; key: PerkKey }
  | { type: 'castAbility'; key: AbilityKey; x: number; y: number }
  | { type: 'toggleTower'; towerId: number };

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

  /**
   * Set whenever the board changes in a way that could form or break a combo:
   * a tower placed, sold or upgraded, or a perk that moves ranges. The combo
   * sweep is O(towers²), so it runs on this flag rather than every step.
   */
  combosDirty: boolean;

  gold: number;
  /**
   * The ability currency. Never earned directly — only minted by an Exchanger
   * burning gold, so every diamond is a tower that was not built.
   */
  diamonds: number;
  /** Seconds of cooldown left per ability; absent or <= 0 means ready. */
  abilityCooldowns: Partial<Record<AbilityKey, number>>;
  /** Ability fields currently running on the board. */
  abilityEffects: AbilityEffect[];
  /**
   * War Horn: a board-wide fire rate multiplier and how long it has left.
   * Held on the state rather than as an AbilityEffect with a null position
   * because `towerFireRate` has to read it on the hot path, and scanning a
   * list of fields for every tower every step to find a global buff is the
   * kind of thing that quietly costs a frame.
   */
  towerHasteMul: number;
  towerHasteTimer: number;
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
  | { type: 'trapTriggered'; at: Vec2; kind: TowerKind; charge: number }
  | { type: 'towerUpgraded'; at: Vec2; level: number }
  | { type: 'towerSold'; at: Vec2; refund: number }
  | { type: 'goldMined'; at: Vec2; amount: number; kind: TowerKind }
  | { type: 'chainArc'; from: Vec2; to: Vec2 }
  | { type: 'ageAdvanced'; age: number }
  | { type: 'perkDraftOpened' }
  | { type: 'perkChosen'; key: PerkKey }
  | { type: 'purchaseDenied'; at: Vec2 }
  | { type: 'diamondsMinted'; at: Vec2; amount: number; goldSpent: number }
  | { type: 'towerToggled'; at: Vec2; on: boolean }
  | { type: 'abilityCast'; key: AbilityKey; at: Vec2; radius: number }
  | { type: 'abilityTick'; key: AbilityKey; at: Vec2; radius: number }
  | { type: 'abilityDenied'; key: AbilityKey }
  | { type: 'waveStarted'; number: number }
  | { type: 'waveCleared'; number: number; reward: number }
  | { type: 'gameOver' };
