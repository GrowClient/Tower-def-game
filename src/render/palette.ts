/**
 * Colours and drawing constants.
 *
 * Placeholder art only — flat geometric shapes, high contrast, ONE accent
 * colour per age so the board reads instantly at a glance. No image or audio
 * assets exist anywhere in this project.
 *
 * This is presentation, not balance, so it lives here rather than in
 * config/balance.ts.
 */

export const COLORS = {
  bg: '#0B0D14',
  /** Letterbox bars outside the 16:9 world. */
  letterbox: '#05060A',

  gridLine: '#161A27',
  buildable: '#121623',
  buildableEdge: '#1D2233',

  path: '#2B3145',
  pathEdge: '#3C4460',
  pathCenter: '#4A5473',

  entrance: '#4ADE80',
  exit: '#F87171',

  hudBg: '#0E1119',
  hudEdge: '#1C2233',
  text: '#E8ECF5',
  textDim: '#7C879E',

  enemy: '#E7E3D6',
  enemyEdge: '#0B0D14',
  hpBack: '#2A2016',
  hpFill: '#7BE04F',
} as const;

/** One accent per age. Ages are indexed 0 = Stone, 1 = Middle, 2 = Tech. */
export const AGE_ACCENT = ['#E8A33D', '#E4443A', '#35D6E8'] as const;
export const AGE_NAMES = ['Stone Age', 'Middle Age', 'Tech Age'] as const;

export function accentFor(ageIndex: number): string {
  return AGE_ACCENT[Math.min(ageIndex, AGE_ACCENT.length - 1)]!;
}

/** Font stack — system fonts only, no webfont downloads. Size is in world units. */
export function font(sizeWorldUnits: number, weight = 700): string {
  return `${weight} ${sizeWorldUnits}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
}
