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
// Each type must demand a DIFFERENT answer — see GAME_DESIGN.md. A type whose
// only distinction is a bigger number is a failure of this table.
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

  /**
   * Hits absorbed outright before damage lands, regardless of how big each hit
   * is. This is what makes a shield a puzzle: a single huge hit strips one
   * layer exactly as a pebble does, so the answer is fire RATE, not damage.
   */
  shieldHits: number;
  /** HP per second restored to OTHER enemies within healRadius. */
  healPerSecond: number;
  healRadius: number;
  /** Slows have no effect on this unit. */
  slowImmune: boolean;
  /** Flat armor granted to other enemies within armorAuraRadius. */
  armorAura: number;
  armorAuraRadius: number;
}

const NO_SPECIALS = {
  shieldHits: 0,
  healPerSecond: 0,
  healRadius: 0,
  slowImmune: false,
  armorAura: 0,
  armorAuraRadius: 0,
};

export const ENEMIES = {
  // Fast and fragile. Raw single-target DPS struggles to track them; the
  // answer is slowers and traps.
  runner: {
    ...NO_SPECIALS,
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
    ...NO_SPECIALS,
    label: 'Brute',
    maxHp: 280,
    speed: 46,
    radius: 22,
    armor: 2,
    bounty: 26,
    leak: 2,
    threat: 6,
  },
  // Individually trivial, but they arrive as a block. Single-target towers
  // can only kill one at a time; the answer is splash.
  swarm: {
    ...NO_SPECIALS,
    label: 'Swarm',
    maxHp: 22,
    speed: 88,
    radius: 9,
    armor: 0,
    bounty: 3,
    leak: 1,
    threat: 0.55,
  },
  // High flat armor blunts every small hit down to the damage floor, so
  // stacking cheap throwers stops working. The answer is armor piercing.
  armored: {
    ...NO_SPECIALS,
    label: 'Armored',
    maxHp: 190,
    speed: 62,
    radius: 18,
    armor: 11,
    bounty: 20,
    leak: 1,
    threat: 4,
  },
  // Absorbs whole hits. A Boulder wastes its entire payload stripping one
  // layer; a cheap fast tower strips all of them.
  shielded: {
    ...NO_SPECIALS,
    label: 'Shielded',
    maxHp: 120,
    speed: 70,
    radius: 17,
    armor: 1,
    bounty: 18,
    leak: 1,
    threat: 3.5,
    shieldHits: 4,
  },
  // Undoes your damage on everything around it. Must be killed FIRST, which
  // is why towers have a targeting mode at all.
  healer: {
    ...NO_SPECIALS,
    label: 'Healer',
    maxHp: 150,
    speed: 64,
    radius: 16,
    armor: 1,
    bounty: 24,
    leak: 1,
    threat: 4.5,
    healPerSecond: 26,
    healRadius: 130,
  },

  // --- Bosses -------------------------------------------------------------
  // One per 10 waves, cycling. Each has a MECHANIC (see BOSSES below), not
  // simply a larger health bar.
  // The FIRST boss a player ever meets, at wave 10. Sized to be a wall you
  // can just about break rather than a run-ender: at 10 leaked lives it was
  // halving a 20-life run in one mistake, and the measured median run died on
  // wave 10 rather than getting past it.
  bossSummoner: {
    ...NO_SPECIALS,
    label: 'Hive Mother',
    maxHp: 1700,
    speed: 38,
    radius: 34,
    armor: 4,
    bounty: 220,
    leak: 6,
    threat: 40,
  },
  bossWarlord: {
    ...NO_SPECIALS,
    label: 'Warlord',
    maxHp: 4200,
    speed: 42,
    radius: 36,
    armor: 8,
    bounty: 300,
    leak: 8,
    threat: 40,
    slowImmune: true,
    armorAura: 6,
    armorAuraRadius: 170,
  },
  bossRegenerator: {
    ...NO_SPECIALS,
    label: 'Ancient',
    maxHp: 5200,
    speed: 34,
    radius: 38,
    armor: 6,
    bounty: 380,
    leak: 8,
    threat: 40,
    shieldHits: 6,
  },
} satisfies Record<string, EnemyDef>;

export type EnemyKind = keyof typeof ENEMIES;

/**
 * Boss rotation. Wave 10 gets the first entry, wave 20 the second, and so on,
 * cycling once the list runs out (later loops are far stronger purely through
 * the wave stat curves).
 */
export type BossMechanic = 'summoner' | 'warlord' | 'regenerator';

export interface BossDef {
  kind: EnemyKind;
  mechanic: BossMechanic;
}

export const BOSSES: BossDef[] = [
  { kind: 'bossSummoner', mechanic: 'summoner' },
  { kind: 'bossWarlord', mechanic: 'warlord' },
  { kind: 'bossRegenerator', mechanic: 'regenerator' },
];

export const BOSS_MECHANICS = {
  /** summoner: spawns a group each time it drops past one of these HP fractions. */
  summonAtHpFraction: [0.75, 0.5, 0.25],
  summonKind: 'swarm' as EnemyKind,
  summonCount: 6,
  /** How far behind the boss its summons appear, in world units. */
  summonTrailDistance: 40,

  /** regenerator: restores its shield and heals on this interval. */
  regenIntervalSec: 6,
  regenShieldRestore: 4,
  regenHealFraction: 0.06,
} as const;

// ---------------------------------------------------------------------------
// Towers
// ---------------------------------------------------------------------------
export interface TowerDef {
  label: string;
  /** Which age unlocks this tower. Towers from earlier ages keep working. */
  age: number;
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

  /** Extra enemies a shot passes through before stopping. 0 = stops at first. */
  pierce: number;
  /** Damage-over-time applied on hit. */
  burnDps: number;
  burnSeconds: number;
  /** Extra nearby enemies struck when this tower hits. */
  chainCount: number;
  chainRange: number;
  /** Chance per hit to freeze an enemy nearly solid, and for how long. */
  freezeChance: number;
  freezeSeconds: number;

  /**
   * Gold generated per second. A tower with this set is an ECONOMY building:
   * it never targets, never fires, and pays back over time instead.
   */
  goldPerSecond: number;
  /** Ignores range entirely and can hit anything on the board. */
  unlimitedRange: boolean;
}

const PLAIN = {
  goldPerSecond: 0,
  unlimitedRange: false,
  pierce: 0,
  burnDps: 0,
  burnSeconds: 0,
  chainCount: 0,
  chainRange: 0,
  freezeChance: 0,
  freezeSeconds: 0,
};

/**
 * Twelve towers: four families across three ages.
 *
 * Advancing UNLOCKS the next age's set to build; it does not transform what
 * you already own. Old towers keep working exactly as they were, so the
 * transition is paid for by selling them — which is the strategic cost of
 * advancing early.
 *
 * Each age's take on a family plays differently rather than just hitting
 * harder: the Thrower line goes single-target -> piercing bolt -> full-lane
 * rail, and the Trap line goes flat damage -> burn -> chain lightning.
 */
export const TOWERS = {
  // --- Age 0: Stone -------------------------------------------------------
  thrower: {
    ...PLAIN,
    label: 'Thrower',
    age: 0,
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
  trap: {
    ...PLAIN,
    label: 'Spike Pit',
    age: 0,
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
  slower: {
    ...PLAIN,
    label: 'Cold Mud',
    age: 0,
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
  heavy: {
    ...PLAIN,
    label: 'Boulder',
    age: 0,
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

  // --- Age 1: Middle ------------------------------------------------------
  // A bolt that runs THROUGH a line of enemies. Against a column marching down
  // a straight it is worth several Throwers; against stragglers, one.
  ballista: {
    ...PLAIN,
    label: 'Archer Tower',
    age: 1,
    cost: 215,
    range: 215,
    damage: 85,
    fireRate: 1.45,
    projectileSpeed: 640,
    splash: 0,
    armorPierce: 8,
    slowFactor: 1,
    onPath: false,
    pierce: 3,
  },
  // Small hit, big burn. Beats armor in practice because the damage arrives as
  // a stack of ticks rather than as one blunted hit.
  oilFire: {
    ...PLAIN,
    label: 'Oil Cauldron',
    age: 1,
    cost: 190,
    range: 0,
    damage: 28,
    fireRate: 0.85,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: true,
    burnDps: 59,
    burnSeconds: 3.5,
  },
  frost: {
    ...PLAIN,
    label: 'Frost Tower',
    age: 1,
    cost: 270,
    range: 175,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 0.34,
    onPath: false,
  },
  // Ignores armor entirely — the dedicated answer to Armored and to Warlord
  // escorts, and nothing else in this age does that.
  siegeCannon: {
    ...PLAIN,
    label: 'Cannon',
    age: 1,
    cost: 440,
    range: 235,
    damage: 600,
    fireRate: 0.36,
    projectileSpeed: 380,
    splash: 22,
    armorPierce: 9999,
    slowFactor: 1,
    onPath: false,
  },

  /**
   * Pure economy: no range, no target, no shots. Placed anywhere buildable, it
   * simply prints gold.
   *
   * Priced so it pays for itself in roughly four waves. That is the whole
   * decision — a mine is four waves of defence you did not build, betting that
   * you will still be alive to collect. Mines also compete with towers for
   * cells, which is what stops "just build mines" from being free.
   */
  goldMine: {
    ...PLAIN,
    label: 'Gold Mine',
    age: 1,
    cost: 350,
    range: 0,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: false,
    goldPerSecond: 1.5,
  },

  // --- Age 2: Tech --------------------------------------------------------
  railgun: {
    ...PLAIN,
    label: 'Gun Turret',
    age: 2,
    cost: 540,
    range: 290,
    damage: 400,
    fireRate: 1.7,
    projectileSpeed: 1500,
    splash: 0,
    armorPierce: 24,
    slowFactor: 1,
    onPath: false,
    pierce: 8,
  },
  // Chains between nearby enemies, so a swarm is BETTER for it than a lone
  // target — the inverse of every other tower in the game.
  teslaCoil: {
    ...PLAIN,
    label: 'Tesla Coil',
    age: 2,
    cost: 480,
    range: 0,
    damage: 260,
    fireRate: 1.1,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 10,
    slowFactor: 1,
    onPath: true,
    chainCount: 4,
    chainRange: 135,
  },
  cryo: {
    ...PLAIN,
    label: 'Cryo Field',
    age: 2,
    cost: 620,
    range: 200,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 0.28,
    onPath: false,
    freezeChance: 0.12,
    freezeSeconds: 1.1,
  },
  singularity: {
    ...PLAIN,
    label: 'Singularity',
    age: 2,
    cost: 1000,
    range: 260,
    damage: 3000,
    fireRate: 0.3,
    projectileSpeed: 420,
    splash: 92,
    armorPierce: 9999,
    slowFactor: 1,
    onPath: false,
  },
  /**
   * Covers the ENTIRE board — no range ring, nothing out of reach. Expensive
   * and slow-firing to pay for that: its damage per gold is deliberately the
   * worst in the Tech Age, because reach on a winding map is worth more than
   * raw output. One Sniper answers the corner your board never covered.
   */
  sniper: {
    ...PLAIN,
    label: 'Sniper',
    age: 2,
    cost: 1300,
    range: 0,
    damage: 620,
    fireRate: 0.6,
    projectileSpeed: 2200,
    splash: 0,
    armorPierce: 40,
    slowFactor: 1,
    onPath: false,
    unlimitedRange: true,
  },
} satisfies Record<string, TowerDef>;

export type TowerKind = keyof typeof TOWERS;

/**
 * Targeting modes, cycled per tower. `first` (furthest along the path) is the
 * safe default; `healers` exists specifically because a Healer that isn't
 * focused undoes the damage every other tower is doing.
 */
export const TARGET_MODES = ['first', 'strongest', 'healers'] as const;
export type TargetMode = (typeof TARGET_MODES)[number];

export const TARGET_MODE_LABELS: Record<TargetMode, string> = {
  first: 'FIRST',
  strongest: 'STRONGEST',
  healers: 'HEALERS',
};

// ---------------------------------------------------------------------------
// Ages
// ---------------------------------------------------------------------------
/**
 * Advancing is the central strategic decision, so the cost is many times a
 * tower on purpose: paying it means fielding nothing new for several waves
 * while you sell off and rebuild. Advance early and you are weak now and
 * strong later; never advance and you out-scale nothing.
 */
export const AGES = [
  { name: 'Stone Age', advanceCost: 0 },
  { name: 'Middle Age', advanceCost: 1000 },
  { name: 'Tech Age', advanceCost: 3000 },
] as const;

/**
 * A note on why the later towers cost more AND hit disproportionately harder:
 * advancing has to be worth doing. When each age's towers had the same
 * damage-per-gold as the last, paying to advance bought nothing but bigger
 * price tags, and a scripted player that never advanced beat one that did by
 * eight whole waves. Each tier is now roughly 2.2x the previous
 * tier's damage per gold — the gap has to widen with the price, or a costlier
 * advance is simply a worse deal.
 */

/** Build bar contents per age — the four towers unlocked at that tier. */
export const BUILD_ORDER: TowerKind[][] = [
  ['thrower', 'trap', 'slower', 'heavy'],
  ['ballista', 'oilFire', 'frost', 'siegeCannon', 'goldMine'],
  ['railgun', 'teslaCoil', 'cryo', 'singularity', 'sniper'],
];

/**
 * Fraction of everything sunk into a tower (purchase plus upgrades) returned
 * when selling it. Well under 1 on purpose: if selling were free, replacing
 * your whole board the instant you advanced would be an obvious no-brainer
 * instead of a cost you weigh against leaving the old towers firing.
 */
export const SELL_REFUND = 0.6;

// ---------------------------------------------------------------------------
// Perks
// ---------------------------------------------------------------------------
/**
 * After clearing every Nth wave the player picks one of three randomly drawn
 * perks. These are run-wide, so a run compounds in a direction instead of
 * being the same build every time — which is the point: the board you end
 * with should be a consequence of choices, not of the tower list.
 */
export type PerkKey =
  | 'damage'
  | 'fireRate'
  | 'range'
  | 'splash'
  | 'bounty'
  | 'slow'
  | 'pierce'
  | 'lives'
  | 'refund'
  | 'burn';

export interface PerkDef {
  key: PerkKey;
  label: string;
  detail: string;
  /** Times this perk can be taken in one run. */
  maxStacks: number;
}

export const PERKS: PerkDef[] = [
  { key: 'damage', label: 'Sharpened', detail: '+15% tower damage', maxStacks: 4 },
  { key: 'fireRate', label: 'Quickened', detail: '+12% fire rate', maxStacks: 4 },
  { key: 'range', label: 'Farsight', detail: '+12% tower range', maxStacks: 3 },
  { key: 'splash', label: 'Wider Blast', detail: '+30% splash radius', maxStacks: 3 },
  { key: 'bounty', label: 'Scavenger', detail: '+20% gold from kills', maxStacks: 4 },
  { key: 'slow', label: 'Deep Freeze', detail: 'Slows bite 20% harder', maxStacks: 3 },
  { key: 'pierce', label: 'Punch Through', detail: 'Piercing shots hit +1 enemy', maxStacks: 3 },
  { key: 'lives', label: 'Rally', detail: 'Restore 3 lives', maxStacks: 4 },
  { key: 'refund', label: 'Salvage', detail: 'Sell towers for 85%, not 60%', maxStacks: 1 },
  { key: 'burn', label: 'Accelerant', detail: '+40% burn damage', maxStacks: 3 },
];

export const PERK_RULES = {
  /** A draft happens after clearing every Nth wave. */
  everyWaves: 5,
  /** How many options to offer. */
  choices: 3,
  /** Per-stack effect sizes. */
  damagePerStack: 0.15,
  fireRatePerStack: 0.12,
  rangePerStack: 0.12,
  splashPerStack: 0.3,
  bountyPerStack: 0.2,
  slowPerStack: 0.2,
  piercePerStack: 1,
  livesPerStack: 3,
  refundBoost: 0.85,
  burnPerStack: 0.4,
} as const;

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
  /** Movement multiplier while frozen solid — not quite zero, so a frozen
   *  enemy still reads as an enemy rather than a decoration. */
  freezeFactor: 0.06,
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
  budgetExpGrowth: 1.025,

  /**
   * Intro waves are chosen against where runs actually END, not against a
   * tidy ramp. A type introduced at wave 20 in a game whose median run is
   * wave 14 is content almost nobody sees, so every type has to land before
   * then — and the boss at wave 10 has to be reachable.
   */
  roster: [
    { kind: 'runner', introWave: 1, weight: 10, weightGrowth: -0.3, groupSize: 1 },
    { kind: 'brute', introWave: 6, weight: 2, weightGrowth: 0.3, groupSize: 1 },
    { kind: 'swarm', introWave: 7, weight: 4, weightGrowth: 0.5, groupSize: 5 },
    { kind: 'armored', introWave: 9, weight: 2, weightGrowth: 0.4, groupSize: 1 },
    { kind: 'shielded', introWave: 11, weight: 2, weightGrowth: 0.4, groupSize: 1 },
    { kind: 'healer', introWave: 13, weight: 1.2, weightGrowth: 0.25, groupSize: 1 },
  ] as RosterEntry[],

  /** Boss every N waves. */
  bossEvery: 10,
  /** A boss wave's normal budget is scaled down — the boss IS the wave. */
  bossWaveBudgetMul: 0.45,
  /** Head start so the boss arrives amid its escort, not alone in front. */
  bossSpawnDelay: 2.5,
} as const;

/**
 * Per-wave stat scaling. Kept as explicit curves rather than one HP multiplier
 * so speed and armor can escalate on their own schedules.
 */
export const SCALING = {
  /** hp x= 1 + linear*(w-1) + quad*(w-1)^2 */
  hpLinear: 0.085,
  hpQuadratic: 0.012,

  /** Speed creeps up slowly and caps, or late waves become unreactable. */
  speedLinear: 0.012,
  speedMax: 1.7,

  /**
   * Armor added flat per wave, once past armorStartWave.
   *
   * This is the pressure that makes advancing an age necessary rather than
   * optional. Cheap towers deal small hits, and small hits are exactly what
   * flat armor blunts to the damage floor — so a board of Stone Age Throwers
   * stops working somewhere in the mid-teens no matter how many you own.
   * It is a balancing act in both directions: at 0.22 a scripted player who
   * never advanced beat one who did by eight waves, because quantity of cheap
   * towers had no ceiling. At 2.2 runs ended around wave 12 — before anyone
   * could ever save the 1000 gold an age costs, which made the whole age
   * system unreachable. The pressure has to bite without ending the run
   * before the decision can be made.
   */
  armorPerWave: 1.0,
  armorStartWave: 8,

  /** Bounty grows slower than HP, so income tightens as waves escalate. */
  bountyLinear: 0.02,

  /** Flat gold for clearing a wave, plus a per-wave bonus. */
  waveClearBase: 20,
  waveClearPerWave: 3,
} as const;
