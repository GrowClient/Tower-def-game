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
  /**
   * Raised from 20 alongside the boss leak curve.
   *
   * A boss now takes 8 + 4 per appearance, so the third one costs 16. Against
   * a 20-life bar that made every boss from the third onward a single
   * pass/fail check — the death histogram collapsed onto wave 30 for fourteen
   * of fifteen seeds, which is a wall rather than a difficulty curve. A wider
   * bar keeps the toll frightening while leaving room to survive one mistake
   * and rebuild.
   */
  startingLives: 30,
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
  /**
   * Plated units cannot be harmed AT ALL by a tower with no armor-piercing —
   * and, crucially, such towers will not even target them. A Thrower facing a
   * column of Armored simply sits idle, which says "I cannot hurt that" far
   * more clearly than shots landing for zero ever could.
   *
   * This is what turns armor from a soft tax into a real requirement: by the
   * wave they arrive you must own something that pierces, or nothing on your
   * board can touch them.
   */
  plated: boolean;
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
  /** Slows have no effect on this unit. */
  slowImmune: boolean;
  /** Flat armor granted to other enemies within armorAuraRadius. */
  armorAura: number;
  armorAuraRadius: number;
  /** Speed multiplier granted to OTHER enemies within speedAuraRadius. The
   *  Warchief's whole mechanic: visible, immediately dangerous, and it stops
   *  the moment you kill the carrier. */
  speedAura: number;
  speedAuraRadius: number;

  // --- Reactive behaviours -------------------------------------------------
  // Enemies that only walk are scenery. These make a unit respond to what the
  // player is doing to it, so the fight has a shape rather than being a queue.

  /** Below this fraction of max HP the unit speeds up by `enrageSpeedMul`.
   *  Reacts to being hurt: chip damage makes it MORE dangerous, so half-killing
   *  a pack of them is worse than killing half of them. */
  enrageBelowHp: number;
  enrageSpeedMul: number;

  /** On death, spawn this many of `splitInto` at the same spot. Reacts to
   *  dying: splash that wipes a group instantly is now worth more than
   *  single-target overkill, and leaks compound if you ignore the pieces.
   *
   *  Typed as a plain string rather than EnemyKind on purpose: EnemyKind is
   *  derived from this very table, so naming a sibling here would make the
   *  table's type reference itself. Validated at spawn instead. */
  splitInto: string | null;
  splitCount: number;

  /** Restores this much HP per second after `regenDelay` seconds without being
   *  hit. Reacts to being ignored: spread, weak fire never finishes it, and
   *  it punishes a board that cannot concentrate damage. */
  regenPerSecond: number;
  regenDelay: number;
}

const NO_SPECIALS = {
  plated: false,
  shieldHits: 0,
  slowImmune: false,
  armorAura: 0,
  armorAuraRadius: 0,
  speedAura: 0,
  speedAuraRadius: 0,
  enrageBelowHp: 0,
  enrageSpeedMul: 1,
  splitInto: null as string | null,
  splitCount: 0,
  regenPerSecond: 0,
  regenDelay: 0,
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
    bounty: 21,
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
    bounty: 79,
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
    bounty: 9,
    leak: 1,
    threat: 0.55,
  },
  // High flat armor blunts every small hit down to the damage floor, so
  // stacking cheap throwers stops working. The answer is armor piercing.
  armored: {
    ...NO_SPECIALS,
    label: 'Armored',
    plated: true,
    maxHp: 190,
    speed: 62,
    radius: 18,
    armor: 11,
    bounty: 60,
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
    bounty: 55,
    leak: 1,
    threat: 3.5,
    shieldHits: 4,
  },

  /**
   * Speeds up everything around it. Replaces the Healer, which was the reason
   * targeting modes existed but failed at the job: healing was an invisible
   * number ticking up, so players never noticed it and never focused it.
   * A speed aura is the readable version of the same idea — you can SEE the
   * pack accelerate, and see it drop back the moment the Warchief dies — and
   * it is directly threatening rather than merely wasteful, because faster
   * enemies mean less time to kill them.
   */
  warchief: {
    ...NO_SPECIALS,
    label: 'Warchief',
    maxHp: 210,
    speed: 60,
    radius: 17,
    armor: 2,
    bounty: 79,
    leak: 2,
    threat: 4.5,
    speedAura: 1.5,
    speedAuraRadius: 155,
  },

  // --- Middle Age arrivals -------------------------------------------------
  /**
   * Reacts to being hurt: drops below half and charges. Chip damage makes a
   * Zealot worse, so a board that spreads its fire across a pack turns six
   * walkers into six sprinters and gets run over.
   */
  zealot: {
    ...NO_SPECIALS,
    label: 'Zealot',
    maxHp: 260,
    speed: 58,
    radius: 17,
    armor: 3,
    bounty: 67,
    leak: 2,
    threat: 5,
    enrageBelowHp: 0.5,
    enrageSpeedMul: 2.1,
  },

  // --- Tech Age arrivals ---------------------------------------------------
  /**
   * Reacts to dying: bursts into two Swarm units. Overkilling one with a
   * Singularity just hands you two more problems slightly further back, so
   * splash that catches the pieces is worth more than raw single-target size.
   */
  splitter: {
    ...NO_SPECIALS,
    label: 'Splitter',
    maxHp: 420,
    speed: 66,
    radius: 20,
    armor: 4,
    bounty: 91,
    leak: 2,
    threat: 7,
    splitInto: 'swarm',
    splitCount: 2,
  },
  /**
   * Reacts to being ignored: heals back up unless it is kept under fire.
   * A board of many weak towers cannot finish one, which is precisely the
   * board this unit exists to retire.
   */
  juggernaut: {
    ...NO_SPECIALS,
    label: 'Juggernaut',
    maxHp: 1400,
    speed: 34,
    radius: 26,
    armor: 14,
    bounty: 176,
    leak: 3,
    threat: 14,
    regenPerSecond: 70,
    regenDelay: 1.6,
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
    bounty: 900,
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
    bounty: 1200,
    leak: 8,
    threat: 40,
    slowImmune: true,
    armorAura: 6,
    armorAuraRadius: 170,
  },
  bossRegenerator: {
    ...NO_SPECIALS,
    label: 'Ancient',
    maxHp: 4200,
    speed: 34,
    radius: 38,
    armor: 6,
    bounty: 1520,
    leak: 8,
    threat: 40,
    shieldHits: 4,
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

  /**
   * regenerator: the Ancient repairs itself — but ONLY after it has been left
   * alone for `regenCalmSeconds`.
   *
   * It used to repair on a pure timer, and that combination was close to
   * unbeatable for reasons that had nothing to do with its health bar. A shield
   * absorbs one WHOLE hit whatever its size, and the Ancient was restoring
   * about one shield per second. Measured against what a player actually
   * fields at wave 30:
   *
   *   Singularity  0.45 shots/s  -> every shot eaten, exactly zero damage
   *   Cannon       0.54 shots/s  -> zero
   *   Sniper       0.90 shots/s  -> ~zero
   *   Tesla Coil   1.65 shots/s  -> below its 2055 HP/s regen, so unkillable
   *   Gun Turret   2.55 shots/s  -> the only tower in the game that worked
   *
   * Every heavy hitter a player builds FOR a boss did nothing to this one, and
   * nothing on screen explained why. Gating the repair on being left alone
   * turns a flat DPS tax into a mechanic with an answer: keep it under fire and
   * it never heals at all. The numbers below are much smaller too, because the
   * heal was a fraction of a max HP that the per-appearance boss curve had
   * already inflated — it was compounding with itself.
   */
  regenIntervalSec: 7,
  regenCalmSeconds: 2,
  regenShieldRestore: 1,
  regenHealFraction: 0.022,
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
   * Diamonds minted when a wave is cleared, by BURNING gold at
   * DIAMONDS.goldPerDiamond each. A tower with this set is an Exchanger: it
   * never targets and never fires, it just turns one currency into the other.
   *
   * Deliberately a conversion rather than a second income stream. Diamonds
   * that simply accumulated would make abilities a reward for surviving; gold
   * that could have been a tower makes them a CHOICE, and that choice — board
   * strength now versus a saved answer later — is the whole point of the
   * currency existing.
   */
  diamondsPerWave: number;

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
  diamondsPerWave: 0,
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
    cost: 95,
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
    cost: 80,
    range: 0,
    damage: 44,
    fireRate: 0.75,
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
    cost: 130,
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
    cost: 340,
    range: 195,
    damage: 155,
    fireRate: 0.42,
    projectileSpeed: 320,
    splash: 46,
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
    cost: 420,
    range: 0,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: false,
    goldPerWave: 92,
    tags: ['economy'],
  },

  // --- Age 1: Middle ------------------------------------------------------
  // A bolt that runs THROUGH a line of enemies. Against a column marching down
  // a straight it is worth several Throwers; against stragglers, one.
  ballista: {
    ...PLAIN,
    label: 'Archer Tower',
    age: 1,
    cost: 1150,
    range: 215,
    damage: 250,
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
    cost: 1000,
    range: 0,
    damage: 78,
    fireRate: 0.95,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: true,
    burnDps: 185,
    burnSeconds: 3.5,
    tags: ['fire', 'trap'],
  },
  frost: {
    ...PLAIN,
    label: 'Frost Tower',
    age: 1,
    cost: 1300,
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
    cost: 2100,
    range: 235,
    damage: 1250,
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
    cost: 5200,
    range: 0,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: false,
    goldPerWave: 1150,
    tags: ['economy'],
  },

  // --- Age 2: Tech --------------------------------------------------------
  /**
   * The Gun Turret used to end runs on its own, and it was not the damage.
   *
   * At pierce 8 and range 290 a single one swept an entire column from most of
   * the board, so its throughput per gold was twelve times the next best tower
   * in its own age — stack a combo and Elite rank on that and one tower simply
   * was the defence. It is now a heavy rapid-fire gun that punches through a
   * couple of bodies rather than a whole queue: far more damage per shot than
   * the Archer Tower it succeeds, far fewer targets per shot. The Archer Tower
   * keeps the line-clearing identity; this one keeps the punch.
   */
  railgun: {
    ...PLAIN,
    label: 'Gun Turret',
    age: 2,
    cost: 11000,
    range: 250,
    damage: 2500,
    fireRate: 1.5,
    projectileSpeed: 1500,
    splash: 0,
    armorPierce: 20,
    slowFactor: 1,
    onPath: false,
    pierce: 2,
    tags: ['rapid', 'pierce'],
  },
  // Chains between nearby enemies, so a swarm is BETTER for it than a lone
  // target — the inverse of every other tower in the game.
  teslaCoil: {
    ...PLAIN,
    label: 'Tesla Coil',
    age: 2,
    cost: 10000,
    range: 0,
    damage: 1750,
    fireRate: 1.1,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 10,
    slowFactor: 1,
    onPath: true,
    chainCount: 3,
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
    cost: 12500,
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
    cost: 18000,
    range: 260,
    damage: 15500,
    fireRate: 0.28,
    projectileSpeed: 420,
    splash: 92,
    armorPierce: 9999,
    slowFactor: 1,
    onPath: false,
    tags: ['heavy'],
  },
  /**
   * Covers the ENTIRE board — no range ring, nothing out of reach.
   *
   * It used to pay for that reach with the worst damage per gold in the age,
   * and that was the wrong trade: the dearest tower in the game landed a
   * smaller hit than the Singularity and nobody bought it twice. It is now the
   * hardest SINGLE-TARGET hitter in the Tech Age — no pierce, no splash, so it
   * is still the wrong answer to a crowd, and the Gun Turret keeps the column.
   * What a Sniper is for is the one thing that has to die: the boss, the
   * plated leader, the runner about to reach the gate from the corner your
   * board never covered.
   */
  sniper: {
    ...PLAIN,
    label: 'Sniper',
    age: 2,
    cost: 24000,
    range: 0,
    damage: 9800,
    fireRate: 0.72,
    projectileSpeed: 2200,
    splash: 0,
    armorPierce: 60,
    slowFactor: 1,
    onPath: false,
    unlimitedRange: true,
    tags: ['precision'],
  },

  /**
   * The Exchanger: gold in, diamonds out.
   *
   * The only building available in EVERY age, because the ability system it
   * feeds runs the whole length of a run. Its price is set for the Stone Age,
   * where 300 starting gold is the whole world — a Tech Age player buying one
   * is not being charged meaningfully, and shouldn't be. What an Exchanger
   * costs you is not its sticker price, it is the gold it burns every wave
   * forever after.
   */
  exchanger: {
    ...PLAIN,
    label: 'Exchanger',
    age: 0,
    cost: 260,
    range: 0,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: false,
    diamondsPerWave: 1,
    tags: ['economy'],
  },

  /** The Tech Age economy building — an automated plant, same role as a mine. */
  factory: {
    ...PLAIN,
    label: 'Factory',
    age: 2,
    cost: 38000,
    range: 0,
    damage: 0,
    fireRate: 0,
    projectileSpeed: 0,
    splash: 0,
    armorPierce: 0,
    slowFactor: 1,
    onPath: false,
    goldPerWave: 8400,
    tags: ['economy'],
  },
} satisfies Record<string, TowerDef>;

export type TowerKind = keyof typeof TOWERS;

// ---------------------------------------------------------------------------
// Diamonds and abilities
// ---------------------------------------------------------------------------

/**
 * The second currency.
 *
 * Diamonds exist to give the player something to DO in the moment. Everything
 * else in the game is a purchase made between waves that then plays itself;
 * an ability is a decision taken while a wave is going wrong, which is the one
 * kind of agency a tower defence otherwise has none of.
 *
 * They are minted only by burning gold, never earned directly. That keeps the
 * two currencies in tension: every diamond is a tower you did not build, so
 * "how much of my economy do I convert into answers?" is a real question with
 * no correct answer.
 */
export const DIAMONDS = {
  /**
   * Gold burned per diamond minted, PER AGE.
   *
   * A flat 6,000 was wrong at both ends. In the Stone Age a whole board earns
   * a few hundred gold a wave, so 6,000 was simply unreachable and the ability
   * system did not exist for the first fifteen waves of every run. In the Tech
   * Age a developed economy prints tens of thousands a wave, so the same
   * 6,000 was pocket change and diamonds piled up faster than cooldowns.
   *
   * The rate is now anchored to what an age's economy actually produces —
   * roughly 2-3 waves of income from a developed set of that age's economy
   * buildings buys one cast. The ratios between the three (1 : 6.7 : 27)
   * follow the ratios between a Campfire, a Gold Mine and a Factory, so a
   * diamond costs about the same SHARE of your income whichever age you are
   * in, while costing far more gold in absolute terms as the run goes on.
   *
   * It is also still the late game's only unbounded gold sink: at 12,000 a
   * diamond, a Tech Age surplus can be poured into ability power at any rate.
   */
  goldPerDiamond: [450, 3000, 7000] as readonly number[],
  /** You start with a couple, so the ability menu is not an empty room the
   *  first time curiosity opens it. */
  starting: 2,
} as const;

/** What one diamond costs in this age. Clamped, so an out-of-range age can
 *  never produce a NaN price that silently mints for free. */
export function goldPerDiamond(age: number): number {
  const rates = DIAMONDS.goldPerDiamond;
  return rates[Math.min(Math.max(age, 0), rates.length - 1)]!;
}

export type AbilityKey =
  | 'stoneRain'
  | 'tarPit'
  | 'arrowRain'
  | 'warHorn'
  | 'orbitalLance'
  | 'nullField';

/**
 * How an ability resolves. Each kind is a different SHAPE of answer, not a
 * different damage number — the same rule the enemy table lives by.
 */
export type AbilityKind =
  /** Repeated damage ticks inside a circle, over a few seconds. */
  | 'barrage'
  /** A lingering field that chills everything inside it. */
  | 'slowField'
  /** One enormous instant hit at a point, ignoring armor entirely. */
  | 'strike'
  /** Every tower on the board reloads faster for a while. */
  | 'towerHaste'
  /** Enemies inside take more damage from every source. */
  | 'vulnField';

export interface AbilityDef {
  key: AbilityKey;
  label: string;
  /** Which age unlocks it. An ability from an older age stays available. */
  age: number;
  kind: AbilityKind;
  cost: number;
  /** Seconds of SIM time before it can be cast again. */
  cooldown: number;
  /** World-unit radius of the effect. Zero for board-wide effects. */
  radius: number;
  /** How long the effect lingers. Zero means it resolves on the instant. */
  duration: number;
  /** Seconds between damage ticks, for barrages. */
  tickInterval: number;
  damage: number;
  armorPierce: number;
  /** slowField: movement multiplier applied inside. */
  slowFactor: number;
  /** towerHaste: fire rate multiplier while it runs. */
  fireRateMul: number;
  /** vulnField: damage multiplier taken by enemies inside. */
  vulnerableMul: number;
  detail: string;
}

const ABILITY_PLAIN = {
  tickInterval: 0,
  damage: 0,
  armorPierce: 0,
  slowFactor: 1,
  fireRateMul: 1,
  vulnerableMul: 1,
};

/**
 * Two per age: one that kills, one that changes the terms of the fight.
 *
 * The damage ones all carry armor piercing, deliberately. An ability costs a
 * building's worth of gold to charge, so one that could be no-sold by the
 * plating rule would be a trap — and "the thing I saved for cannot touch the
 * thing that is killing me" is the worst sentence a game can make a player say.
 *
 * POTENCY TRACKS PRICE. Every cost here rose, because a cheap ability is a
 * button you mash rather than a decision you make — and each ability's
 * magnitude rose with it, so the change is rare-and-decisive rather than a
 * flat nerf.
 *
 * The rise is far steeper in the Tech Age than the Stone Age, and that is
 * deliberate rather than uniform. Late gold arrives in the tens of thousands
 * per wave, so a 7-diamond Lance was pocket change there; early gold arrives
 * in the tens, so pricing the Stone Age the same way simply deleted abilities
 * from the first fifteen waves. Measured: a uniform rise cost the scripted
 * probe eight median waves and left it stuck in the Stone Age.
 */
export const ABILITIES: AbilityDef[] = [
  {
    ...ABILITY_PLAIN,
    key: 'stoneRain',
    label: 'Stone Rain',
    age: 0,
    kind: 'barrage',
    cost: 3,
    cooldown: 20,
    radius: 175,
    duration: 5.5,
    tickInterval: 0.34,
    damage: 210,
    armorPierce: 25,
    detail: 'Boulders pound a wide area for five seconds. Cuts armor.',
  },
  {
    ...ABILITY_PLAIN,
    key: 'tarPit',
    label: 'Tar Pit',
    age: 0,
    kind: 'slowField',
    cost: 3,
    cooldown: 18,
    radius: 205,
    duration: 19,
    slowFactor: 0.36,
    detail: 'The road stays sticky for 19s. Everything crossing crawls.',
  },
  {
    ...ABILITY_PLAIN,
    key: 'arrowRain',
    label: 'Arrow Rain',
    age: 1,
    kind: 'barrage',
    cost: 7,
    cooldown: 22,
    radius: 215,
    duration: 6.0,
    tickInterval: 0.18,
    damage: 735,
    armorPierce: 60,
    detail: 'A brutal volley over a wide area. Deletes packed waves.',
  },
  {
    ...ABILITY_PLAIN,
    key: 'warHorn',
    label: 'War Horn',
    age: 1,
    kind: 'towerHaste',
    cost: 6,
    cooldown: 30,
    radius: 0,
    duration: 22,
    fireRateMul: 2.7,
    detail: 'EVERY tower reloads 2.7x faster for 22 seconds.',
  },
  {
    ...ABILITY_PLAIN,
    key: 'orbitalLance',
    label: 'Orbital Lance',
    age: 2,
    kind: 'strike',
    cost: 30,
    cooldown: 26,
    radius: 190,
    duration: 0,
    damage: 1100000,
    armorPierce: 9999,
    detail: 'One column of light. Deletes almost anything it lands on.',
  },
  {
    ...ABILITY_PLAIN,
    key: 'nullField',
    label: 'Null Field',
    age: 2,
    kind: 'vulnField',
    cost: 22,
    cooldown: 24,
    radius: 240,
    duration: 22,
    vulnerableMul: 5.5,
    detail: 'Enemies inside take 5.5x damage for 22s. Use it on a boss.',
  },
];

/** Abilities unlocked at this age — older ages stay available, like towers. */
export function abilitiesForAge(age: number): AbilityDef[] {
  return ABILITIES.filter((a) => a.age <= age);
}

/**
 * Targeting modes, cycled per tower. `first` (furthest along the path) is the
 * safe default; `support` exists because a unit that buffs the pack around it
 * is worth killing before the pack, and left alone it makes every other enemy
 * on the board harder to stop.
 */
export const TARGET_MODES = ['first', 'strongest', 'support'] as const;
export type TargetMode = (typeof TARGET_MODES)[number];

export const TARGET_MODE_LABELS: Record<TargetMode, string> = {
  first: 'FIRST',
  strongest: 'STRONGEST',
  support: 'SUPPORT',
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
  { name: 'Middle Age', advanceCost: 10000 },
  { name: 'Tech Age', advanceCost: 100000 },
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
  ['thrower', 'trap', 'slower', 'heavy', 'campfire', 'exchanger'],
  ['ballista', 'oilFire', 'frost', 'siegeCannon', 'goldMine', 'exchanger'],
  ['railgun', 'teslaCoil', 'cryo', 'singularity', 'sniper', 'factory', 'exchanger'],
];

/**
 * Fraction of everything sunk into a tower (purchase plus upgrades) returned
 * when selling it. Well under 1 on purpose: if selling were free, replacing
 * your whole board the instant you advanced would be an obvious no-brainer
 * instead of a cost you weigh against leaving the old towers firing.
 */
export const SELL_REFUND = 0.6;

/**
 * How many towers you may have standing, per age.
 *
 * Veterancy rewards concentrating your board; this is what makes concentrating
 * it necessary. Measured, the difference is not marginal: with no limit at all
 * a scripted player built 157 towers and survived past wave 60 on 10 of 11
 * seeds. Veterancy alone could not close that, because it only makes sprawl
 * WORSE — it never makes it impossible, so given enough cells sheer quantity
 * still won.
 *
 * A cap is the one brake that leaves prices alone. The earlier attempt scaled
 * the price of each new tower, which worked and looked terrible: every number
 * in the build bar drifted to an arbitrary figure like 154g. Here the sticker
 * price is a clean round number you can learn, and the limit is a single line
 * in the HUD you can read at a glance.
 *
 * Raised by advancing, which gives the age a second concrete reward beyond
 * unlocking towers: not just better tools, but room for more of them. And
 * because a capped board must concentrate, it is exactly the board veterancy
 * pays out on — the two mechanics push the same way.
 */
export const TOWER_CAP = [16, 22, 28] as const;

/**
 * Traps: the underfoot line (Spike Pit / Oil Cauldron / Tesla Coil).
 *
 * Nobody built them, and the reasons were mechanical rather than a matter of
 * taste. A trap covered the inscribed circle of ONE cell, so a Runner at 108
 * units/second was inside it for about half a second; with a 1.6-second reload
 * it missed most of what walked over it. It also spent one of your capped
 * tower slots to do that. Three fixes, all here:
 */
export const TRAPS = {
  /**
   * Reach as a fraction of a cell. At 0.5 (the inscribed circle) a trap saw a
   * sliver of road. At 0.95 it covers its own cell properly and bites into the
   * neighbouring ones, so it catches a whole clump rather than whoever
   * happened to be standing on the exact centre when it rearmed.
   */
  reach: 0.95,

  /**
   * Traps do NOT count against the tower cap.
   *
   * They can only be built on the path, and a map has thirty-odd path cells,
   * so they are already bounded by something. Making them also compete for one
   * of your 28 tower slots meant a trap was always the worst thing you could
   * spend a slot on, which is the whole complaint. Path cells are now their
   * own separate resource and "how much of the road do I mine?" is a decision
   * in its own right rather than a tax on your real board.
   */
  exemptFromCap: true,

  /**
   * A trap builds charge while it sits unused, and dumps it on the next
   * trigger. This is what makes a trap satisfying rather than a metronome: it
   * goes off as an EVENT, and the longer the gap the bigger the hit.
   *
   * It also fixes the placement problem quietly. A trap on a quiet stretch of
   * road used to be simply wasted; now it is banking, so early-lane and
   * late-lane placements are both worth something for different reasons.
   */
  chargePerSecond: 0.34,
  maxCharge: 2.2,
} as const;

// ---------------------------------------------------------------------------
// Veterancy
// ---------------------------------------------------------------------------
/**
 * Towers get better at their job the longer they do it.
 *
 * This is the brake on tower-dumping, and deliberately a CARROT rather than a
 * wall. Nothing is ever forbidden: you may still fill every cell. But the work
 * of a run is a roughly fixed amount of killing, so spreading it across forty
 * towers leaves every one of them a raw recruit, while concentrating it into
 * twelve well-placed ones turns those twelve Elite. Sprawl is not banned, it
 * is simply weaker than investment.
 *
 * A previous attempt taxed the price of each new tower instead. It worked and
 * looked terrible — every price in the build bar drifted to an arbitrary
 * number, so nothing was memorable. This puts the pressure on the OUTPUT side,
 * where it can be shown as a rank badge instead of a fractional price.
 *
 * XP is earned from what a tower actually does, so a Cold Mud that never kills
 * anything and a Gold Mine that never fires still rank up. The reward likewise
 * lands on whatever that tower's real output is — damage, chill rate, or gold.
 */
export const VETERANCY = {
  /** XP for a kill credited to this tower. */
  killXp: 1,
  /**
   * XP for landing a chill, for towers that deal no damage and so can never
   * be credited with a kill.
   *
   * Cut from 0.34, and it needed to be much lower than "below 1". A slower
   * fires two or three times a second and lands a chill on nearly every shot,
   * where a shooter is credited with a kill maybe once a second on a good
   * wave — so at 0.34 an ice tower reached Elite in under a minute of play,
   * long before any weapon on the board, and its rank was a formality rather
   * than a record of service.
   *
   * At 0.07 a slower ranks up roughly on the same schedule as a busy shooter:
   * it still gets there, but it has to actually work a lane for several waves
   * first. Veterancy is the one reward in this game you cannot buy, and it
   * should not be the one that arrives fastest.
   */
  chillXp: 0.07,
  /** XP for an economy building each time it pays out. */
  payoutXp: 3,

  thresholds: [18, 55, 130],
  /** Output multiplier at rank 0 (recruit) through rank 3 (elite). */
  outputMul: [1, 1.07, 1.15, 1.26],
  names: ['', 'Seasoned', 'Veteran', 'Elite'],
} as const;


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
 *  - **The printed number is the real number.** Every `detail` string below
 *    states the same multiplier the effect applies. They drifted apart once,
 *    with the codex advertising +50% for a bonus that paid +22%, and a synergy
 *    the player cannot verify is indistinguishable from one that is not there.
 *  - **A combo counts ONCE per tower**, no matter how many partners supply it.
 *    Ten Frost Towers around one Oil Cauldron is one Thermal Shock, not ten.
 *    Otherwise the answer to combos would be "stack more partners", which is
 *    the same mindless-spam problem in a new hat. Different combos DO multiply
 *    with each other — a tower can hold Thermal Shock and Shatter at once —
 *    but each of them exactly once.
 */
export type ComboKey = 'thermalShock' | 'shatter' | 'spotter' | 'foundry';

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
    detail: 'Ice + fire — chilled armor cracks: +30% damage, +10% burn',
    a: 'ice',
    b: 'fire',
    effect: { ...NO_EFFECT, damageMul: 1.3, burnMul: 1.1 },
  },
  {
    key: 'shatter',
    label: 'Shatter',
    detail: 'Ice + heavy — a frozen target breaks: +30% damage',
    a: 'ice',
    b: 'heavy',
    effect: { ...NO_EFFECT, damageMul: 1.3 },
  },
  {
    key: 'spotter',
    label: 'Spotter',
    detail: 'Precision + rapid — called shots: +12% fire rate',
    a: 'precision',
    b: 'rapid',
    effect: { ...NO_EFFECT, fireRateMul: 1.12 },
  },
  {
    key: 'foundry',
    label: 'Foundry',
    detail: 'Economy + heavy — the works keeps it fed: +10% fire rate, +20% gold',
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
  | 'interest'
  | 'slow'
  | 'lives'
  | 'refund'
  | 'burn';

/**
 * Every perk belongs to a side of one question: do you want to kill things
 * better, or do you want more money?
 *
 * The draft deliberately offers one of each plus a wildcard, so the pick is
 * always that trade rather than "take the biggest number on screen". A round
 * of three power perks is not a decision.
 */
export type PerkCategory = 'power' | 'economy' | 'utility';

export interface PerkDef {
  key: PerkKey;
  label: string;
  detail: string;
  category: PerkCategory;
  /** Times this perk can be taken in one run. */
  maxStacks: number;
}

/**
 * Perk sizes are single digits on purpose.
 *
 * They used to be 12-40% a stack, four stacks deep. Scavenger alone reached
 * +80% gold, which on top of a runaway kill count is most of why a run ended
 * up sitting on 200k with nothing to buy. A perk should tilt a run, not
 * decide it — the compounding across ten waves of drafts is the reward, not
 * any single pick.
 *
 * 'pierce' was removed outright. It only did anything for the three towers
 * that already pierce, so on most boards it was a blank card that wasted one
 * of your three options.
 */
export const PERKS: PerkDef[] = [
  // --- Power ---------------------------------------------------------------
  { key: 'damage', label: 'Sharpened', detail: '+7% tower damage', category: 'power', maxStacks: 5 },
  { key: 'fireRate', label: 'Quickened', detail: '+6% fire rate', category: 'power', maxStacks: 5 },
  { key: 'range', label: 'Farsight', detail: '+5% tower range', category: 'power', maxStacks: 4 },
  { key: 'splash', label: 'Wider Blast', detail: '+9% splash radius', category: 'power', maxStacks: 4 },
  { key: 'burn', label: 'Accelerant', detail: '+10% burn damage', category: 'power', maxStacks: 4 },

  // --- Economy -------------------------------------------------------------
  { key: 'bounty', label: 'Scavenger', detail: '+6% gold from kills', category: 'economy', maxStacks: 4 },
  { key: 'interest', label: 'Reserves', detail: '+8% from economy buildings', category: 'economy', maxStacks: 4 },
  { key: 'refund', label: 'Salvage', detail: 'Sell towers for 75%, not 60%', category: 'economy', maxStacks: 1 },

  // --- Utility -------------------------------------------------------------
  // Duration, not strength. Slow strength is fixed everywhere on purpose, so a
  // perk that deepened it would reintroduce exactly the pinned-wave problem
  // the slower rework exists to remove.
  { key: 'slow', label: 'Lingering Chill', detail: 'Slows last 10% longer', category: 'utility', maxStacks: 4 },
  { key: 'lives', label: 'Rally', detail: 'Restore 2 lives', category: 'utility', maxStacks: 4 },
];

export const PERK_RULES = {
  /** A draft happens after clearing every Nth wave. */
  everyWaves: 5,
  /** How many options to offer. */
  choices: 3,
  /** Per-stack effect sizes. */
  damagePerStack: 0.07,
  fireRatePerStack: 0.06,
  rangePerStack: 0.05,
  splashPerStack: 0.09,
  bountyPerStack: 0.06,
  interestPerStack: 0.08,
  slowDurationPerStack: 0.1,
  livesPerStack: 2,
  refundBoost: 0.75,
  burnPerStack: 0.1,
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
  /**
   * Four levels: the tower's own material, then silver, then gold, then
   * EMERALD.
   *
   * The fourth exists because a board reaching its ceiling was the moment a
   * run stopped having decisions in it — every tower maxed, gold piling up,
   * nothing left to buy. A fourth tier is somewhere for late gold to go that
   * is not simply "another tower", and it is priced so that maxing a whole
   * board is a project rather than a formality.
   */
  maxLevel: 4,
  /**
   * Cost of reaching level i+1, as a multiple of the tower's base cost.
   *
   * A fully upgraded tower now costs 5.4x its sticker price rather than 3.45x.
   * The old curve meant a board reached maximum level almost as a side effect
   * of playing, and once every tower was level 3 the run had no remaining
   * decisions in it — which is most of why a wave-40 board coasted to 100.
   */
  costMul: [0, 0.8, 2.2, 4.6],
  /**
   * The output ceiling, and the single most important number for late-game
   * difficulty.
   *
   * Cut from [1, 1.9, 3.4]. Stacked with Elite veterancy (1.26) and a combo
   * (up to ~1.15), a maxed tower used to reach 4.9x its printed damage — so a
   * board that was merely FINISHED was also unbeatable, and the wave curve had
   * to out-scale a number the player hits once and then keeps forever. The
   * same stack now reaches 3.6x.
   *
   * Deliberately FRONT-LOADED. The first upgrade has to beat buying a second
   * tower per gold or the anti-dumping rule inverts, and it is measured
   * (+0.85 damage for 0.8 cost, and it costs no tower slot either).
   * Every level after that buys less per gold than the one before, which is
   * the point: what you are really paying for at the top is output that does
   * not consume one of your capped slots.
   *
   * EMERALD is deliberately the worst deal in the game per gold — 4.6x the
   * sticker price for +0.75 damage. It is a gold SINK, not a power spike. A
   * fully emerald board costs 8.8x each tower's price, which is the only
   * reason a late run has anywhere to put its money, and the reason the wave
   * curve does not have to out-scale it: almost nobody gets there on
   * everything.
   */
  damageMul: [1, 1.85, 2.5, 3.25],
  rangeMul: [1, 1.12, 1.24, 1.34],
  fireRateMul: [1, 1.18, 1.4, 1.58],
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

  /**
   * The wave that teaches plating, and the much longer break granted before it.
   *
   * Wave 7 is nothing but Armored, and Armored cannot be touched by a board of
   * Throwers and Spike Pits. That is a strong lesson and a fair one — but only
   * if the player is told before it lands and has time to act on the telling.
   * The standard 5.5-second breather is enough to read a banner and nothing
   * else; this one is long enough to read it, look at the build bar, and go
   * buy the tower it points at.
   *
   * Held in the sim rather than the renderer because it changes the run clock,
   * and anything that changes the run clock has to be identical for the same
   * seed. See render/screens.ts for the briefing this pause exists to give
   * room for.
   */
  armorBriefingWave: 7,
  armorBriefingPause: 24,
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
    // Wave 7 is a TEACHING wave: nothing but Armored. A board with no
    // armor-piercing tower will watch every one of its towers stand idle,
    // which is the lesson delivered as an experience rather than a tooltip.
    // The warning is shown during the break before it — see render/screens.ts.
    [{ kind: 'armored', count: 9 }],
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
   *
   * Raised 1.03 -> 1.07 after the boss rework. That measurement exposed
   * something the death histogram had been hiding: the BOSSES were carrying
   * the entire late-game difficulty, and ordinary waves past 20 were not
   * threatening a capped, upgraded, veteran board at all. Fixing the Ancient
   * removed the wall and runs simply never ended. The pressure belongs in the
   * wave curve, where it applies continuously, rather than in three spikes.
   */
  budgetSurgeWave: 15,
  budgetSurgeGrowth: 1.07,

  /**
   * A SECOND, steeper surge once the board is finished.
   *
   * By the mid-thirties a played-as-designed run is at its tower cap, every
   * tower is level 3 and most are Elite. From that point the player's defence
   * is a fixed quantity — there is nothing left to buy and nothing left to
   * upgrade — while the first surge was still tuned against a board that grows.
   * The result was the complaint that started this pass: wave 40 onward was
   * free, and a run coasted to 100.
   *
   * This term only exists in the region where the board has stopped improving,
   * which is why it can be this steep without touching the early game at all.
   */
  lateSurgeWave: 30,
  lateSurgeGrowth: 1.09,

  /**
   * Intro waves are chosen against where runs actually END, not against a
   * tidy ramp. A type introduced at wave 20 in a game whose median run is
   * wave 14 is content almost nobody sees, so every type has to land before
   * then — and the boss at wave 10 has to be reachable.
   */
  /**
   * The roster is banded by AGE, not just spread along a ramp. Waves 1-12 are
   * the Stone Age's problem set, the Middle Age band adds units that answer a
   * Middle Age board, and the Tech band adds the reactive ones. Runners fade
   * out hard: a wave 30 made of the same units as a wave 5 is why the enemies
   * stopped feeling like a threat.
   */
  roster: [
    // Stone Age band
    { kind: 'runner', introWave: 1, weight: 10, weightGrowth: -0.55, groupSize: 1 },
    { kind: 'brute', introWave: 6, weight: 2, weightGrowth: 0.3, groupSize: 1 },
    { kind: 'swarm', introWave: 7, weight: 4, weightGrowth: 0.35, groupSize: 5 },
    { kind: 'armored', introWave: 7, weight: 2, weightGrowth: 0.4, groupSize: 1 },
    // Middle Age band
    { kind: 'shielded', introWave: 11, weight: 2, weightGrowth: 0.4, groupSize: 1 },
    { kind: 'warchief', introWave: 13, weight: 1.4, weightGrowth: 0.3, groupSize: 1 },
    { kind: 'zealot', introWave: 14, weight: 2.5, weightGrowth: 0.45, groupSize: 2 },
    // Tech Age band
    { kind: 'splitter', introWave: 22, weight: 3, weightGrowth: 0.5, groupSize: 1 },
    { kind: 'juggernaut', introWave: 27, weight: 2.5, weightGrowth: 0.5, groupSize: 1 },
  ] as RosterEntry[],

  /**
   * How much a unit's THREAT COST grows with the wave.
   *
   * This is the fix for "600 enemies at wave 40". Threat cost used to be flat —
   * a Brute cost 6 whether it had 280 HP or 6000 — so the budget curve was
   * secretly a unit-COUNT curve, and an exponential budget meant an exponential
   * number of bodies. Waves got longer and more tedious rather than harder, and
   * every extra body was another bounty, which is where the runaway economy
   * came from too.
   *
   * Scaling threat with the same curve that scales HP means a wave's budget
   * buys a fixed amount of DANGER: the total HP walking down the road is
   * unchanged, but it arrives as far fewer, far tougher units. Measured, wave
   * 40 drops from ~900 spawns to a few dozen.
   *
   * The exponent is below 1 so unit counts still creep up slowly — a wave 40
   * should feel busier than a wave 7, just not two-orders-of-magnitude busier.
   */
  threatScaleExponent: 0.97,

  /**
   * The campaign's last wave. Endless ignores this entirely.
   *
   * Sixty because it is where the players who reported this actually ran out
   * of things to buy, and because it lands on a boss wave — the finale is the
   * sixth of them, and the run ends on the fight rather than on an arbitrary
   * number a wave after one.
   */
  finalWave: 60,

  /** Boss every N waves. */
  bossEvery: 10,
  /** A boss wave's normal budget is scaled down — the boss IS the wave. */
  bossWaveBudgetMul: 0.32,
  /** Head start so the boss arrives amid its escort, not alone in front. */
  bossSpawnDelay: 2.5,
  /** Seconds between each boss of the campaign's final wave. Spaced, because
   *  three arriving together is one lump of HP rather than three fights. */
  finaleBossGap: 14,

  /**
   * The campaign finale's budget climb, paired with SCALING.finaleHpGrowth.
   *
   * Deliberately the SAME rate as the HP term. Budget alone buys bodies; HP
   * alone buys nothing at all (threat cost tracks HP, so the count falls by as
   * much as toughness rises). The two at matching rates raise total wave HP
   * while holding the entity count flat, which is a harder finale rather than
   * a longer one.
   */
  finaleBudgetGrowth: 1.15,
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
  /**
   * HP multiplier per boss after the first: appearance n gets growth^(n-1).
   *
   * Trimmed from 1.34 once the per-wave HP curve was steepened. The two
   * escalations MULTIPLY, and stacked they turned every boss wave into a
   * pass/fail wall — nine of fifteen seeds died on wave 30 and the rest on
   * wave 50, which is a staircase rather than a difficulty curve. The wave
   * curve now carries the growth; this term only keeps a boss ahead of it.
   */
  hpGrowth: 1.26,
  /** Armor added per boss after the first. */
  armorPerAppearance: 5,
  /** Extra summons per appearance (Hive Mother). */
  summonsPerAppearance: 3,
  /** Regen interval shortens by this factor per appearance (Ancient). Barely,
   *  now that the repair is suppressed by taking fire at all. */
  regenIntervalDecay: 0.93,
  /** Extra armor the Warlord's aura grants per appearance. */
  auraPerAppearance: 3,

  /**
   * Extra LIVES a boss takes on leak, per appearance after the first.
   *
   * The reason a late boss could be shrugged off had nothing to do with its
   * health bar: letting one through cost 8 lives out of 20 whether it was the
   * first boss or the fifth, so a board that could not kill it could simply
   * tank it and carry on. Making the toll grow means a boss you cannot kill
   * is a boss that ENDS the run, which is what a boss is for.
   *
   * At +4 per appearance the wave-50 boss takes 24 lives — more than a full
   * life bar, so from the fifth boss onward "let it through" stops being a
   * strategy at all.
   */
  leakPerAppearance: 3,
} as const;

/**
 * Per-wave stat scaling. Kept as explicit curves rather than one HP multiplier
 * so speed and armor can escalate on their own schedules.
 */
export const SCALING = {
  /** hp x= 1 + linear*(w-1) + quad*(w-1)^2 */
  hpLinear: 0.085,
  /**
   * Raised from 0.012. This is the lever that actually ends a late run.
   *
   * Pushing the wave BUDGET instead just bought more bodies — peak concurrent
   * enemies went to 160 and waves ran two minutes, which is tedium rather than
   * difficulty, and the "pacing is not difficulty" trap this file already
   * documents once. Per-unit HP is what a finished board has to chew through,
   * and it is the only number a capped, maxed, Elite defence cannot out-scale.
   */
  hpQuadratic: 0.017,

  /**
   * An EXPONENTIAL HP term past `lateHpWave`, mirroring the budget's late
   * surge — and the piece that was missing from every previous attempt to end
   * the late game.
   *
   * The arithmetic nobody had done: with threat cost tracking HP, a wave's
   * TOTAL hit points are set by its budget and almost nothing else. Unit count
   * is budget/hp and per-unit hp is hp, so the two cancel. That is why raising
   * `hpQuadratic` on its own moved the median death wave by nothing at all
   * across three separate attempts — it made the same wall of HP arrive as
   * fewer, tougher units, which is better pacing but identical difficulty.
   *
   * Raising the BUDGET alone has the opposite failure: an exponential budget
   * against a quadratic HP curve means an exponential number of BODIES, which
   * is 190 enemies and two-minute waves.
   *
   * Growing both at the same exponential rate is the answer. Counts stay flat,
   * total wave HP climbs exponentially, and a board that has stopped improving
   * gets out-scaled — which is the whole point.
   */
  lateHpWave: 30,
  lateHpGrowth: 1.088,

  /**
   * THE FINALE — campaign only.
   *
   * A third exponential, on top of the late one, over the closing stretch of a
   * campaign. It exists because of a specific playtest result: two players
   * reached wave 74 without strategising much, and both reported having
   * nothing left to buy by the sixties. That is not a difficulty curve that is
   * too gentle, it is a curve that runs out of ROAD — the board finishes
   * upgrading around wave 55 and everything after that is the same fight with
   * bigger numbers on both sides.
   *
   * So the campaign's last fifteen waves climb steeply enough that a finished
   * board is not automatically a winning one, and the run ends while that is
   * still true. Endless is deliberately untouched: it is the game those runs
   * were played on, and a mode people liked is not something to fix.
   *
   * HP, not budget. Established the hard way in an earlier round: a budget
   * surge buys BODIES — 190 enemies and two-minute waves — while per-unit HP
   * buys danger at a quarter of the entity count. When a curve has to
   * out-scale a finished board, scale the unit.
   */
  finaleWave: 46,
  finaleHpGrowth: 1.15,

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

  /**
   * How kill bounty scales, as an exponent on the HP curve.
   *
   * Below 1 on purpose: a wave-30 unit has ~14x the HP of a wave-1 unit but
   * pays only ~5x the gold, so gold per point of HP killed falls steadily and
   * the run gets economically tighter exactly as it gets harder.
   *
   * This replaced a flat +2%/wave, which looked conservative and was not: the
   * OLD wave curve delivered exponentially more bodies, so a small per-kill
   * bonus multiplied by an exploding kill count produced 200k gold with
   * nothing left to spend it on. Bounty is now tied to what a unit is worth
   * rather than to how many of them happened to show up.
   *
   * Measured: at 0.62 the cut was far too deep — a run could not bank the
   * 3000 gold an age costs before dying, so the age system became unreachable
   * rather than merely expensive, which is the exact failure GAME_DESIGN warns
   * about. At 0.85 a played-as-designed run reaches the Tech Age and still
   * earns roughly a third of what the old runaway curve paid.
   */
  bountyHpExponent: 0.93,

  /** Flat gold for clearing a wave, plus a per-wave bonus. Deliberately small:
   *  this is a nudge, not an income stream. */
  waveClearBase: 40,
  waveClearPerWave: 8,

  /**
   * Where income STOPS growing.
   *
   * Past this wave, kill bounty is frozen at its value here. This is the fix
   * for "wave 40 onward is free": the board is capped, every tower is level 3
   * and Elite, so the only thing still growing was the pile of gold — which
   * bought nothing, because there was nothing left to buy. Freezing income at
   * the point the board is finished means the wave curve is climbing against a
   * fixed defence from then on, and the run has to end somewhere.
   *
   * Deliberately a freeze rather than a decay: gold that goes DOWN reads as a
   * bug, and abilities (see ABILITIES) still need a steady diamond supply.
   */
  bountyFreezeWave: 38,
} as const;
