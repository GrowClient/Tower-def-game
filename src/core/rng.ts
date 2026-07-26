/**
 * Seeded PRNG (mulberry32).
 *
 * Determinism rule for the whole `core/` folder: NOTHING calls Math.random().
 * All randomness flows through an Rng object carried on the game state, so a
 * given seed + given player inputs always reproduce the same run. That's what
 * makes a balance change measurable instead of anecdotal.
 */

export interface Rng {
  /** Mutable 32-bit state. Kept as a field (not a closure) so the whole run
   *  state stays a plain serialisable object. */
  s: number;
}

export function makeRng(seed: number): Rng {
  // Force to uint32 and avoid a zero state, which mulberry32 handles poorly.
  return { s: (seed >>> 0) || 0x9e3779b9 };
}

/** Float in [0, 1). */
export function nextFloat(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [min, max] inclusive. */
export function nextInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

/** Float in [min, max). */
export function nextRange(rng: Rng, min: number, max: number): number {
  return min + nextFloat(rng) * (max - min);
}

export function nextBool(rng: Rng): boolean {
  return nextFloat(rng) < 0.5;
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  if (arr.length === 0) throw new Error('pick() from empty array');
  return arr[nextInt(rng, 0, arr.length - 1)] as T;
}

/**
 * Derive a fresh, independent Rng from an existing one. Used so that (for
 * example) map generation consuming a different number of rolls doesn't shift
 * every later wave's composition.
 */
export function forkRng(rng: Rng): Rng {
  return makeRng(Math.floor(nextFloat(rng) * 0xffffffff));
}
