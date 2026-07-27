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
  /** Safety clamp: max sim steps per rendered frame (prevents spiral of death).
   *  Has to clear 4x speed at 60fps (4 steps a frame) with room to catch up
   *  after a hitch, or the top speed silently runs slow on a busy wave. */
  maxStepsPerFrame: 12,
  /** Speed toggle multipliers, cycled by the HUD button / [F] key. */
  speeds: [1, 2, 4],
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
/**
 * What a tower *is*, for the purposes of combos. Tags are deliberately about
 * the nature of the weapon rather than its age, so a Cold Mud and a Cryo Field
 * both read as `ice` and both light up the same synergies — a combo learned in
 * the Stone Age still means something in the Tech Age.
 */
export type TowerTag =
  | 'fire'
  | 'ice'
  | 'heavy'
  | 'rapid'
  | 'chain'
  | 'pierce'
  | 'trap'
  | 'precision'
  | 'economy';

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
  /**
   * Movement multiplier applied to an enemy this tower HITS; 1 = no slow.
   *
   * Slowers are shooters, not auras. An aura that permanently pinned
   * everything in a radius was both the strongest effect in the game and the
   * least interesting: it needed no aiming, could not miss, and stacking two
   * of them stopped a wave dead. Firing a real (damage-free) shot means a
   * slower has a rate, a range and a travel time like everything else, and the
   * enemies keep flowing.
   */
  slowFactor: number;
  /** How long a slow from this tower lasts. Its reload vs this number is what
   *  decides how much of the lane it can keep chilled at once. */
  slowSeconds: number;
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

  /**
   * Gold paid out when a wave is CLEARED. A tower with this set is an ECONOMY
   * building: it never targets, never fires, and pays back per wave instead.
   *
   * Per wave rather than per second on purpose. Paying by the second quietly
   * rewarded dawdling — a wave you let run long printed more gold than one you
   * killed fast — and it paid out during the between-wave pause too, so the
   * safest possible play was also the richest. Tying income to a CLEARED wave
   * makes a mine a bet on surviving that wave instead of a metronome.
   */
  goldPerWave: number;
  /** Ignores range entirely and can hit anything on the board. */
  unlimitedRange: boolean;
  /** What this tower counts as when looking for combos. See COMBOS. */
  tags: TowerTag[];
}

const PLAIN = {
  goldPerWave: 0,
  unlimitedRange: false,
  tags: [] as TowerTag[],
  pierce: 0,
  burnDps: 0,
  burnSeconds: 0,
  chainCount: 0,
  chainRange: 0,
  slowSeconds: 0,
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
    tags: ['rapid'],
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
    tags: ['trap'],
  },
  /**
   * The slower line, across all three ages, deliberately shares ONE slow
   * strength. A later slower is not a colder slower — it is a faster, longer
   * ranged one that catches more of the lane per second. Escalating the
   * multiplier instead is what produced a Tech-age tower that simply stopped
   * the wave, and a stopped wave is not a harder wave, it is a stalled game.
   */
  slower: {
    ...PLAIN,
    label: 'Cold Mud',
    age: 0,
    cost: 120,
    range: 150,
    damage: 0,
    fireRate: 1.1,
    projectileSpeed: 400,
    splash: 0,
    armorPierce: 0,
    slowFactor: 0.6,
    slowSeconds: 1.8,
    onPath: false,
    tags: ['ice'],
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
    tags: ['heavy'],
  },

  /**
   * The Stone Age economy building. Every age has one now: the Middle Age mine
   * used to be the only source of passive income, which made advancing to it a
   * foregone conclusion and left the Stone Age with no economic decision at all.
   */
  campfire: {
    ...PLAIN,
    label: 'Campfire',
    age: 0,
    cost: 120,
    range: 0,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: false,
    goldPerWave: 24,
    tags: ['economy'],
  },

  // --- Age 1: Middle ------------------------------------------------------
  // A bolt that runs THROUGH a line of enemies. Against a column marching down
  // a straight it is worth several Throwers; against stragglers, one.
  ballista: {
    ...PLAIN,
    label: 'Archer Tower',
    age: 1,
    cost: 250,
    range: 215,
    damage: 99,
    fireRate: 1.45,
    projectileSpeed: 640,
    splash: 0,
    armorPierce: 8,
    slowFactor: 1,
    onPath: false,
    pierce: 3,
    tags: ['rapid', 'pierce'],
  },
  // Small hit, big burn. Beats armor in practice because the damage arrives as
  // a stack of ticks rather than as one blunted hit.
  oilFire: {
    ...PLAIN,
    label: 'Oil Cauldron',
    age: 1,
    cost: 220,
    range: 0,
    damage: 32,
    fireRate: 0.85,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: true,
    burnDps: 68,
    burnSeconds: 3.5,
    tags: ['fire', 'trap'],
  },
  frost: {
    ...PLAIN,
    label: 'Frost Tower',
    age: 1,
    cost: 310,
    range: 200,
    damage: 0,
    fireRate: 1.7,
    projectileSpeed: 520,
    // Bursts on impact, so one shot chills a clump rather than one straggler.
    splash: 44,
    armorPierce: 0,
    slowFactor: 0.6,
    slowSeconds: 2,
    onPath: false,
    tags: ['ice'],
  },
  // Ignores armor entirely — the dedicated answer to Armored and to Warlord
  // escorts, and nothing else in this age does that.
  siegeCannon: {
    ...PLAIN,
    label: 'Cannon',
    age: 1,
    cost: 510,
    range: 235,
    damage: 695,
    fireRate: 0.36,
    projectileSpeed: 380,
    splash: 22,
    armorPierce: 9999,
    slowFactor: 1,
    onPath: false,
    tags: ['heavy'],
  },

  /**
   * Pure economy: no range, no target, no shots. Placed anywhere buildable, it
   * simply pays out when a wave is cleared.
   *
   * Priced so it pays for itself in roughly six waves. That is the whole
   * decision — a mine is six waves of defence you did not build, betting that
   * you will still be alive to collect. Mines also compete with towers for
   * cells, which is what stops "just build mines" from being free.
   */
  goldMine: {
    ...PLAIN,
    label: 'Gold Mine',
    age: 1,
    cost: 400,
    range: 0,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: false,
    goldPerWave: 71,
    tags: ['economy'],
  },

  // --- Age 2: Tech --------------------------------------------------------
  railgun: {
    ...PLAIN,
    label: 'Gun Turret',
    age: 2,
    cost: 675,
    range: 290,
    damage: 500,
    fireRate: 1.7,
    projectileSpeed: 1500,
    splash: 0,
    armorPierce: 24,
    slowFactor: 1,
    onPath: false,
    pierce: 8,
    tags: ['rapid', 'pierce'],
  },
  // Chains between nearby enemies, so a swarm is BETTER for it than a lone
  // target — the inverse of every other tower in the game.
  teslaCoil: {
    ...PLAIN,
    label: 'Tesla Coil',
    age: 2,
    cost: 600,
    range: 0,
    damage: 325,
    fireRate: 1.1,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 10,
    slowFactor: 1,
    onPath: true,
    chainCount: 4,
    chainRange: 135,
    tags: ['chain', 'trap'],
  },
  /**
   * No freeze-solid mechanic. It used to roll a chance to pin a unit at 6% of
   * its speed, which read as "the enemies stopped" — the wave queued up at the
   * tower instead of flowing past it, and the answer to every late wave became
   * "build another Cryo". Its Tech-age edge is now reach and a wide burst.
   */
  cryo: {
    ...PLAIN,
    label: 'Cryo Field',
    age: 2,
    cost: 775,
    range: 250,
    damage: 0,
    fireRate: 2.4,
    projectileSpeed: 660,
    splash: 88,
    armorPierce: 0,
    slowFactor: 0.6,
    slowSeconds: 2.2,
    onPath: false,
    tags: ['ice'],
  },
  singularity: {
    ...PLAIN,
    label: 'Singularity',
    age: 2,
    cost: 1250,
    range: 260,
    damage: 3750,
    fireRate: 0.3,
    projectileSpeed: 420,
    splash: 92,
    armorPierce: 9999,
    slowFactor: 1,
    onPath: false,
    tags: ['heavy'],
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
    cost: 1625,
    range: 0,
    damage: 775,
    fireRate: 0.6,
    projectileSpeed: 2200,
    splash: 0,
    armorPierce: 40,
    slowFactor: 1,
    onPath: false,
    unlimitedRange: true,
    tags: ['precision'],
  },

  /** The Tech Age economy building — an automated plant, same role as a mine. */
  factory: {
    ...PLAIN,
    label: 'Factory',
    age: 2,
    cost: 1100,
    range: 0,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: false,
    goldPerWave: 205,
    tags: ['economy'],
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
  { name: 'Middle Age', advanceCost: 3000 },
  { name: 'Tech Age', advanceCost: 10000 },
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

/**
 * Build bar contents per age. Every age ends with its economy building, so the
 * "do I buy income or defence" decision sits in the same place on the bar in
 * all three ages rather than appearing out of nowhere in the Middle Age.
 */
export const BUILD_ORDER: TowerKind[][] = [
  ['thrower', 'trap', 'slower', 'heavy', 'campfire'],
  ['ballista', 'oilFire', 'frost', 'siegeCannon', 'goldMine'],
  ['railgun', 'teslaCoil', 'cryo', 'singularity', 'sniper', 'factory'],
];

/**
 * Fraction of everything sunk into a tower (purchase plus upgrades) returned
 * when selling it. Well under 1 on purpose: if selling were free, replacing
 * your whole board the instant you advanced would be an obvious no-brainer
 * instead of a cost you weigh against leaving the old towers firing.
 */
export const SELL_REFUND = 0.6;

/**
 * Every tower you already own makes the NEXT one more expensive.
 *
 * Without this the game is a dumping sim, and that is not a guess: a scripted
 * player that never advanced an age, never upgraded anything and simply filled
 * 115 of the board's ~145 buildable cells with cheap Stone Age towers reached
 * wave 30 — further than the same probe got by advancing properly. Quantity had
 * no cost curve, so quantity was the answer to everything.
 *
 * A flat percentage per tower owned fixes it at the root. Upgrades are priced
 * off the tower's BASE cost and are unaffected, so the more crowded your board
 * gets, the better improving what you already have looks compared to squeezing
 * in one more. That is the pressure that makes selling to fund an upgrade a
 * real move — and it is why the build bar shows the live price, not the base.
 *
 * Deliberately gentle early: at five towers it is +10%, which nobody notices,
 * and it only starts to bite around the twentieth.
 */
export const CROWDING_TAX = 0.02;

// ---------------------------------------------------------------------------
// Combos
// ---------------------------------------------------------------------------
/**
 * Towers whose fields OVERLAP form a named combo and both get stronger.
 *
 * This exists because a board of twelve identical towers was a winning board.
 * Placement had no texture: a tower's value never depended on what stood next
 * to it, so the optimal play was to find the best damage-per-gold tower and
 * spam it. Combos make the same gold buy more or less depending on where it
 * goes, which is the difference between building a defence and filling cells.
 *
 * Two rules keep this readable rather than a hidden spreadsheet:
 *
 *  - The trigger is ring overlap, which the player can SEE. No invisible
 *    adjacency radius that disagrees with the rings drawn on the board.
 *  - A combo counts ONCE per tower no matter how many partners supply it, so
 *    six Frost Towers around one Cannon is not six times the bonus. Otherwise
 *    the answer to combos would be "stack more partners", which is the same
 *    mindless-spam problem in a new hat.
 */
export type ComboKey =
  | 'thermalShock'
  | 'shatter'
  | 'conduction'
  | 'spotter'
  | 'killZone'
  | 'foundry';

/**
 * What a combo does. Both towers in the pairing receive the SAME effect, and
 * each simply uses the parts that mean anything to it — a gold bonus does
 * nothing to a cannon, a damage bonus does nothing to a mine. That is why the
 * Foundry can pay the mine and hurry the cannon without needing per-side rules.
 */
export interface ComboEffect {
  damageMul: number;
  fireRateMul: number;
  burnMul: number;
  goldMul: number;
  /** Extra enemies a chain jumps to. */
  chainBonus: number;
}

export interface ComboDef {
  key: ComboKey;
  label: string;
  detail: string;
  /** The two tags that must meet. When both are the same tag, it takes two
   *  DIFFERENT towers carrying it — a tower can never combo with itself. */
  a: TowerTag;
  b: TowerTag;
  effect: ComboEffect;
}

const NO_EFFECT = {
  damageMul: 1,
  fireRateMul: 1,
  burnMul: 1,
  goldMul: 1,
  chainBonus: 0,
};

export const COMBOS: ComboDef[] = [
  {
    key: 'thermalShock',
    label: 'Thermal Shock',
    detail: 'Ice + fire — chilled armor cracks: +50% damage, +60% burn',
    a: 'ice',
    b: 'fire',
    effect: { ...NO_EFFECT, damageMul: 1.22, burnMul: 1.3 },
  },
  {
    key: 'shatter',
    label: 'Shatter',
    detail: 'Ice + heavy — a frozen target breaks: +40% damage',
    a: 'ice',
    b: 'heavy',
    effect: { ...NO_EFFECT, damageMul: 1.2 },
  },
  {
    key: 'conduction',
    label: 'Conduction',
    detail: 'Ice + chain — wet ground carries the arc: +2 chain targets',
    a: 'ice',
    b: 'chain',
    effect: { ...NO_EFFECT, damageMul: 1.08, chainBonus: 1 },
  },
  {
    key: 'spotter',
    label: 'Spotter',
    detail: 'Precision + rapid — called shots: +25% fire rate',
    a: 'precision',
    b: 'rapid',
    effect: { ...NO_EFFECT, fireRateMul: 1.12 },
  },
  {
    key: 'killZone',
    label: 'Kill Zone',
    detail: 'Two traps on one stretch of road: +30% fire rate',
    a: 'trap',
    b: 'trap',
    effect: { ...NO_EFFECT, fireRateMul: 1.15 },
  },
  {
    key: 'foundry',
    label: 'Foundry',
    detail: 'Economy + heavy — the works keeps it fed: +20% fire rate, +30% gold',
    a: 'economy',
    b: 'heavy',
    effect: { ...NO_EFFECT, fireRateMul: 1.1, goldMul: 1.2 },
  },
];

export const COMBO_RULES = {
  /**
   * Centre-to-centre distance within which two towers combo. ONE number for
   * every tower, regardless of range.
   *
   * It used to be "your rings overlap", i.e. rangeA + rangeB. That sounded
   * elegant and played terribly: two 250-range Tech towers linked from five
   * cells apart, so on a mature board essentially everything comboed with
   * everything and there was no placement decision left to make. At ~1.8 cells
   * a tower links to its immediate neighbours including diagonals and nothing
   * else, which is small enough to plan a board around and easy to eyeball.
   *
   * A cell is ~74 world units, so this is a little under two cells.
   */
  linkRadius: 130,
} as const;

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
  // Duration, not strength. Slow strength is fixed everywhere on purpose, so a
  // perk that deepened it would reintroduce exactly the pinned-wave problem
  // the slower rework exists to remove.
  { key: 'slow', label: 'Lingering Chill', detail: 'Slows last 30% longer', maxStacks: 3 },
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
  slowDurationPerStack: 0.3,
  piercePerStack: 1,
  livesPerStack: 3,
  refundBoost: 0.85,
  burnPerStack: 0.4,
} as const;

/**
 * Upgrades have to beat buying another tower, or the game is a dumping sim.
 *
 * The old curve made spam strictly correct: a level 2 cost 0.85x base for +60%
 * damage (70 damage per 100 gold) while a whole new tower cost 1.0x for +100%
 * (100 per 100 gold). So the optimal play was to never upgrade and fill every
 * cell, and the board became a carpet of level 1s.
 *
 * Now a level 2 buys +90% for 0.85x — better per gold than a new tower — and a
 * level 3 buys +150 points more for 1.6x, which is roughly break-even on raw
 * numbers and clearly ahead once you count the cell it does NOT consume and
 * the combo links it does not have to re-establish. Selling something to fund
 * an upgrade is now a real move rather than a mistake.
 *
 * Deliberately NO slow scaling: see TowerDef.slowFactor.
 */
export const UPGRADES = {
  maxLevel: 3,
  /** Cost of reaching level i+1, as a multiple of the tower's base cost. */
  costMul: [0, 0.85, 1.6],
  damageMul: [1, 1.9, 3.4],
  rangeMul: [1, 1.14, 1.3],
  fireRateMul: [1, 1.22, 1.5],
} as const;

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
export const COMBAT = {
  /** Damage floor after armor, so armor can never make a tower useless. */
  minDamage: 1,
  /**
   * Hard floor on how slow any enemy can ever be made, however many slowers
   * hit it. The whole point of the slower rework is that the wave keeps
   * moving: an enemy at 35% speed is being handled, an enemy at 6% is a
   * parked car and the run stops being a game.
   */
  minSlowFactor: 0.35,
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
  spawnIntervalMin: 0.1,

  /**
   * Longest a wave may take to finish spawning, in seconds.
   *
   * Threat cost per unit doesn't scale with the wave — a Brute costs 6 whether
   * it has 280 HP or 4000 — so the budget curve is really a UNIT COUNT curve,
   * and an exponential unit count on a fixed interval is an exponentially
   * longer wave. Measured, wave 25 took 163 seconds to trickle out: not hard,
   * just slow. Bounding the window instead of hand-tuning the decay makes a
   * big wave arrive as a flood rather than a queue, and it is self-correcting
   * — however the budget curve is retuned later, pacing holds.
   *
   * Early waves are far below this bound and are completely unaffected —
   * measured, waves 7/10/15/20 held at 38/55/50/51 seconds either way, while
   * wave 25 came down from 163 seconds to 62. At 42 seconds it over-corrected:
   * 150+ enemies on the board at once outran any possible defence and every
   * seed died on the same wave.
   */
  maxSpawnWindow: 70,

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
   * A SECOND exponential that only starts biting past `budgetSurgeWave`.
   *
   * The single gentle exponential above is tuned for the opening, where it has
   * to hand over cleanly from the scripted waves. That same rate is far too
   * slack once a player has an economy: a run could coast into the Tech Age by
   * wave 22 and then find the wave-30 boss easier than the wave-10 one,
   * because towers had compounded (upgrades, perks, combos, a fuller board)
   * faster than the wave curve did. This term is the answer — the early game
   * keeps its readable ramp and the late game stops being a victory lap.
   *
   * Measured with the headless driver over 13 seeds. At 1.055 and 1.035 the
   * scripted player's death wave collapsed onto 26 for every single seed — the
   * curve was drowning out how well the board was built, which is the opposite
   * of the goal. At 1.03 the median holds around 26 while the good runs still
   * reach 38-41, so surviving the Tech transition is what earns the late waves
   * rather than the curve deciding for you.
   */
  budgetSurgeWave: 15,
  budgetSurgeGrowth: 1.03,

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
 * Boss escalation across appearances.
 *
 * The ordinary wave curves apply to bosses too, but they are not enough on
 * their own: a player's board compounds between wave 10 and wave 30 in ways a
 * per-wave HP curve doesn't track — three upgrade levels, several perks, a
 * whole age of better towers and now combos. Without a term that grows per
 * BOSS rather than per wave, the third boss lands into a board built to kill
 * the first one and simply falls over.
 *
 * The mechanics escalate alongside the HP, because a boss that is only harder
 * to chew through is a longer fight, not a harder one.
 */
export const BOSS_SCALING = {
  /** HP multiplier per boss after the first: appearance n gets growth^(n-1). */
  hpGrowth: 1.4,
  /** Armor added per boss after the first. */
  armorPerAppearance: 3,
  /** Extra summons per appearance (Hive Mother). */
  summonsPerAppearance: 2,
  /** Regen interval shortens by this factor per appearance (Ancient). */
  regenIntervalDecay: 0.82,
  /** Extra armor the Warlord's aura grants per appearance. */
  auraPerAppearance: 2,
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

  /**
   * Armor accelerates again once the Tech Age is realistically reachable.
   *
   * The first ramp exists to retire Stone Age throwers. This second one exists
   * to stop the Tech Age's own cheap-and-fast towers becoming the new forever
   * answer: without it, armor stops mattering the moment you own a Gun Turret
   * (24 pierce) and the whole armor mechanic quietly switches off exactly when
   * the run is supposed to get harder.
   */
  armorLateStartWave: 20,
  armorLatePerWave: 0.9,

  /** Bounty grows slower than HP, so income tightens as waves escalate. */
  bountyLinear: 0.02,

  /** Flat gold for clearing a wave, plus a per-wave bonus. */
  waveClearBase: 20,
  waveClearPerWave: 3,
} as const;
