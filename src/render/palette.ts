/**
 * Colours, biomes and drawing constants.
 *
 * All art is flat geometry drawn in code — there are no image or audio assets
 * anywhere in this project. "Texture" here means procedurally scattered small
 * shapes (grass tufts, gravel, rock), not a bitmap.
 *
 * This is presentation, not balance, so it lives here rather than in
 * config/balance.ts.
 */

export const COLORS = {
  /** Letterbox bars outside the 16:9 world. */
  letterbox: '#05060A',

  /** Faint lattice showing where cells are; deliberately near-invisible until
   *  the player is actually placing something. */
  gridLine: 'rgba(255, 255, 255, 0.045)',

  entrance: '#6FE39A',
  exit: '#F4664F',

  text: '#F2EDE1',
  textDim: '#9A8F7C',

  enemyEdge: '#14100B',
  hpBack: 'rgba(20, 14, 8, 0.75)',
  hpFill: '#8BE04F',
} as const;

/**
 * Upgrade tiers, as materials rather than as a counter.
 *
 * A tower's level used to be three small dots under its feet, which is a
 * readout, not a picture — you had to stop and count them, and at board scale
 * they were invisible anyway. Instead each level re-forges the tower's working
 * end: the sling that throws the rock, the muzzle the shell leaves, the tip of
 * the ice spire. Wood and stone, then silver, then gold. The player reads
 * "that one's fully upgraded" from across the board without counting anything.
 *
 * `metal` of null means "use whatever this tower is natively made of", which is
 * what keeps a level 1 tower looking like an honest piece of its own age
 * instead of a dimmer version of the upgraded one.
 */
export interface Tier {
  metal: string | null;
  metalLit: string;
  /** Halo behind the tower. Only the top tier gets one — if every level glowed
   *  the glow would stop meaning anything. */
  glow: string | null;
}

export const TIERS: Tier[] = [
  { metal: null, metalLit: '#FFFFFF', glow: null },
  { metal: '#C4CBD8', metalLit: '#F2F6FC', glow: null },
  { metal: '#E8B93D', metalLit: '#FFF3B0', glow: 'rgba(245, 205, 90, 0.30)' },
];

export function tierFor(level: number): Tier {
  return TIERS[Math.min(Math.max(level, 1), TIERS.length) - 1]!;
}

/**
 * A biome is the whole visual identity of an age: what the ground is made of,
 * what the path is worn into, and which props get scattered around.
 *
 * The goal is that the board *reads* as its age without a label on it — stone
 * age is overgrown grass, bare rock and standing stones; the later ages will
 * be tilled earth and cobble, then poured concrete and panelling.
 */
export interface Biome {
  name: string;
  accent: string;

  /** Ground fill and the two tones its mottling varies between. */
  ground: string;
  groundDark: string;
  groundLight: string;

  /** The worn track. */
  path: string;
  pathWorn: string;
  pathEdge: string;
  /** Gravel/debris scattered over the track. */
  grit: string[];

  /** Rock and its lit facet. */
  rock: string;
  rockLit: string;

  /** Vegetation colours; empty means this biome has none. */
  tuft: string[];
  /** Rough tufts per 1000 world units squared — vegetation density. */
  tuftDensity: number;

  /** Which prop set to scatter. */
  props: 'stone' | 'medieval' | 'tech';
}

export const BIOMES: Biome[] = [
  // --- 0: Stone Age — overgrown meadow, bare rock, standing stones ---------
  {
    name: 'Stone Age',
    accent: '#E8A33D',
    ground: '#3A4A28',
    groundDark: '#2C3A1F',
    groundLight: '#4A5C33',
    path: '#6B5233',
    pathWorn: '#7E6440',
    pathEdge: '#4A3722',
    grit: ['#8A7050', '#5C4629', '#9A8465', '#6E573A'],
    rock: '#6E6A5F',
    rockLit: '#8F8A7C',
    tuft: ['#5A7038', '#4C6030', '#688040', '#42522A'],
    tuftDensity: 2.1,
    props: 'stone',
  },
  // --- 1: Middle Age — tilled earth, cobble, timber (fleshed out in slice 5)
  {
    name: 'Middle Age',
    accent: '#E4443A',
    ground: '#3E4630',
    groundDark: '#313826',
    groundLight: '#4E5839',
    path: '#6A6055',
    pathWorn: '#7C7266',
    pathEdge: '#463F37',
    grit: ['#8C8378', '#5B534A', '#9B9287', '#6D655B'],
    rock: '#75705F',
    rockLit: '#948E7B',
    tuft: ['#56682F', '#485729', '#647A38'],
    tuftDensity: 1.3,
    props: 'medieval',
  },
  // --- 2: Tech Age — poured concrete and panelling (fleshed out in slice 5)
  {
    name: 'Tech Age',
    accent: '#35D6E8',
    ground: '#2B3138',
    groundDark: '#232830',
    groundLight: '#363E47',
    path: '#454E58',
    pathWorn: '#525C68',
    pathEdge: '#2F3640',
    grit: ['#6A7480', '#3E464F', '#7C8794'],
    rock: '#5A636E',
    rockLit: '#78828F',
    tuft: [],
    tuftDensity: 0,
    props: 'tech',
  },
];

export function biomeFor(ageIndex: number): Biome {
  return BIOMES[Math.min(Math.max(ageIndex, 0), BIOMES.length - 1)]!;
}

export const AGE_NAMES = BIOMES.map((b) => b.name);

export function accentFor(ageIndex: number): string {
  return biomeFor(ageIndex).accent;
}

/** Font stack — system fonts only, no webfont downloads. Size is in world units. */
export function font(sizeWorldUnits: number, weight = 700): string {
  return `${weight} ${sizeWorldUnits}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
}
