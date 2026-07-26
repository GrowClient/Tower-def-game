/**
 * balance.ts — THE ONLY PLACE TUNABLE NUMBERS LIVE.
 *
 * Rule: if you would ever want to change a number to make the game feel
 * different, it belongs here. Nothing balance-related is hard-coded anywhere
 * else in the codebase. Pure data — this file imports nothing.
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

  /**
   * Minimum path cells before a generated map is accepted.
   *
   * Path length is the single biggest source of run-to-run difficulty
   * variance: a short path gives towers far less time on each enemy, and a
   * seed that rolled three jogs instead of eight was measurably a different
   * game. Rejecting the shortest maps keeps seeds comparable, which is the
   * whole point of being able to pin one.
   */
  minPathCells: 30,
  /** Give up re-rolling after this many attempts and take the longest found. */
  maxGenAttempts: 24,
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
  startingGold: 300,
} as const;

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
// Each type must demand a DIFFERENT answer — see GAME_DESIGN.md. Four more
// (armored, swarm, shielded, healer) land in slice 4; they need mechanics,
// not just stats, which is why they aren't here yet.
export interface EnemyDef {
  label: string;
  maxHp: number;
  /** World units per second along the path. */
  speed: number;
  /** Drawn radius in world units. */
  radius: number;
  /** Flat damage subtracted from every hit. */
  armor: number;
  /** Gold granted on kill, before the wave bounty curve. */
  bounty: number;
  /** Lives removed if it reaches the exit. */
  leak: number;
  /** Cost against a wave's threat budget — how "expensive" this unit is. */
  threat: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  // Fast and fragile. Raw single-target DPS struggles to track them; the
  // answer is slowers and traps.
  runner: {
    label: 'Runner',
    maxHp: 46,
    speed: 108,
    radius: 14,
    armor: 0,
    bounty: 7,
    leak: 1,
    threat: 1,
  },
  // Slow and very tough. The answer is heavy towers, not more small hits.
  brute: {
    label: 'Brute',
    maxHp: 280,
    speed: 46,
    radius: 22,
    armor: 2,
    bounty: 26,
    leak: 2,
    threat: 6,
  },
};

export type EnemyKind = keyof typeof ENEMIES & string;

// ---------------------------------------------------------------------------
// Towers
// ---------------------------------------------------------------------------
export interface TowerDef {
  label: string;
  cost: number;
  /** Range in world units. Traps ignore this (they act on their own cell). */
  range: number;
  damage: number;
  /** Shots per second. */
  fireRate: number;
  /** World units per second; 0 means the tower has no projectile. */
  projectileSpeed: number;
  /** Radius of splash damage on impact; 0 = single target. */
  splash: number;
  /** Flat armor ignored by this tower's hits. */
  armorPierce: number;
  /** Movement multiplier applied to enemies in range; 1 = no slow. */
  slowFactor: number;
  /** True for towers that sit ON the path instead of beside it. */
  onPath: boolean;
}

export const TOWERS: Record<string, TowerDef> = {
  // Cheap, reliable single target. The tower you open with.
  thrower: {
    label: 'Thrower',
    cost: 90,
    range: 165,
    damage: 14,
    fireRate: 1.7,
    projectileSpeed: 460,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: false,
  },
  // Sits on the path and hits everything walking over it. No targeting, so it
  // never wastes a shot, but it only covers one cell.
  trap: {
    label: 'Spike Pit',
    cost: 75,
    range: 0,
    damage: 30,
    fireRate: 0.62,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: true,
  },
  // Deals no damage at all. Pure force multiplier for everything else.
  slower: {
    label: 'Cold Mud',
    cost: 120,
    range: 135,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 0.55,
    onPath: false,
  },
  // Huge damage, punishing fire rate. Overkills small units, so it wants to
  // be pointed at the things nothing else can dent.
  heavy: {
    label: 'Boulder',
    cost: 195,
    range: 195,
    damage: 78,
    fireRate: 0.42,
    projectileSpeed: 320,
    splash: 34,
    armorPierce: 12,
    slowFactor: 1,
    onPath: false,
  },
};

export type TowerKind = keyof typeof TOWERS & string;

/** Order of the build bar buttons, left to right. */
export const BUILD_ORDER: TowerKind[] = ['thrower', 'trap', 'slower', 'heavy'];

/**
 * In-age upgrades. Level 1 is the tower as placed; levels 2 and 3 are bought.
 * Multipliers are indexed by level - 1, so index 0 is always 1.
 */
export const UPGRADES = {
  maxLevel: 3,
  /** Cost of reaching level i+1, as a multiple of the tower's base cost. */
  costMul: [0, 0.85, 1.6],
  damageMul: [1, 1.6, 2.45],
  rangeMul: [1, 1.12, 1.26],
  fireRateMul: [1, 1.18, 1.4],
  /** Slowers get stronger by slowing harder, not by hitting harder. */
  slowBonus: [0, 0.1, 0.2],
} as const;

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
export const COMBAT = {
  /** Damage floor after armor, so armor can never make a tower useless. */
  minDamage: 1,
  /** How long a slow lingers after leaving the aura. Also the refresh window. */
  slowLinger: 0.25,
  /** Projectiles self-destruct after this long, in case a target vanishes. */
  projectileLifetime: 3,
  /** A projectile counts as hitting when this close to its target. */
  hitRadius: 9,
} as const;

// ---------------------------------------------------------------------------
// Waves & difficulty
// ---------------------------------------------------------------------------
/**
 * Difficulty is NOT HP multiplication. Two independent systems:
 *
 *  1. Stat curves scale what a given enemy is worth.
 *  2. A per-wave THREAT BUDGET is spent on a seeded weighted draw from the
 *     types unlocked so far, so the *mix* shifts as well as the numbers.
 *
 * The first few waves are hand-authored so the opening teaches instead of
 * punishing.
 */
export interface RosterEntry {
  kind: EnemyKind;
  /** First wave this type can appear in. */
  introWave: number;
  /** Relative draw weight once unlocked. */
  weight: number;
  /** Extra weight per wave after intro, so mixes drift over time. */
  weightGrowth: number;
  /** Units spawned per draw — swarms come in groups. */
  groupSize: number;
}

export const WAVES = {
  /** Grace period before wave 1, so you can build first. */
  firstWaveDelay: 8,
  /** Breather between waves. */
  betweenWaves: 5.5,
  /** Seconds between spawns inside a wave. */
  spawnInterval: 0.85,
  /** Spawn interval shrinks as waves go up, to a floor. */
  spawnIntervalDecay: 0.985,
  spawnIntervalMin: 0.3,

  /**
   * Hand-authored opening. Index 0 is wave 1.
   *
   * The pacing here is set by how fast gold accumulates, not by what looks
   * like a nice ramp: at wave 4 a player owns roughly four towers, so that is
   * far too early to meet the unit whose answer costs 195 gold. The first
   * brute arrives at wave 5 alone, as a demonstration, and only becomes a real
   * threat once you have had time to buy the tower that answers it.
   */
  scripted: [
    [{ kind: 'runner', count: 4 }],
    [{ kind: 'runner', count: 7 }],
    [{ kind: 'runner', count: 10 }],
    [{ kind: 'runner', count: 13 }],
    [{ kind: 'runner', count: 10 }, { kind: 'brute', count: 1 }],
    [{ kind: 'runner', count: 14 }, { kind: 'brute', count: 2 }],
  ] as { kind: EnemyKind; count: number }[][],

  /**
   * Threat budget for wave w (1-indexed) once past the scripted opening:
   *
   *   (base + linear*w + quad*w^2) * expGrowth^w
   *
   * The polynomial part shapes the early game, where it's readable and easy to
   * tune. The exponential term is what makes the game genuinely endless: a
   * board has a finite number of cells, so any purely polynomial curve is
   * eventually out-scaled by a full board and the run stops being able to end.
   */
  // These are chosen so the FIRST generated wave lands just above the last
  // scripted one (wave 6 is 14 runners + 2 brutes = 26 threat, so wave 7 is
  // ~30). Getting this wrong is not a subtle difficulty tweak: an unmatched
  // handoff put wave 7 at 64 threat, and every run died there regardless of
  // how the rest of the curve was tuned.
  budgetBase: 6,
  budgetLinear: 1.8,
  budgetQuadratic: 0.15,
  budgetExpGrowth: 1.05,

  roster: [
    { kind: 'runner', introWave: 1, weight: 10, weightGrowth: -0.25, groupSize: 1 },
    { kind: 'brute', introWave: 6, weight: 2, weightGrowth: 0.35, groupSize: 1 },
  ] as RosterEntry[],

  /** Boss every N waves. Boss mechanics land in slice 4. */
  bossEvery: 10,
} as const;

/**
 * Per-wave stat scaling. Kept as explicit curves rather than one HP multiplier
 * so speed and armor can escalate on their own schedules.
 */
export const SCALING = {
  /** hp x= 1 + linear*(w-1) + quad*(w-1)^2 */
  hpLinear: 0.10,
  hpQuadratic: 0.016,

  /** Speed creeps up slowly and caps, or late waves become unreactable. */
  speedLinear: 0.012,
  speedMax: 1.7,

  /** Armor is added flat, and only starts mattering after a few waves. */
  armorPerWave: 0.22,
  armorStartWave: 6,

  /** Bounty grows slower than HP, so income tightens as waves escalate. */
  bountyLinear: 0.02,

  /** Flat gold for clearing a wave, plus a per-wave bonus. */
  waveClearBase: 20,
  waveClearPerWave: 3,
} as const;
