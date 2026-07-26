/**
 * Local persistence. Isolated here because `core/` may never touch
 * localStorage — the simulation has no business knowing the browser exists.
 *
 * Every access is wrapped: private browsing modes and storage-disabled
 * settings throw on access rather than returning null, and a high score is
 * never worth crashing a run over.
 */

const BEST_WAVE_KEY = 'td.bestWave';

export function loadBestWave(): number {
  try {
    const raw = window.localStorage.getItem(BEST_WAVE_KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Stores the wave if it beats the stored best. Returns the current best. */
export function saveBestWave(wave: number): number {
  const best = loadBestWave();
  if (wave <= best) return best;
  try {
    window.localStorage.setItem(BEST_WAVE_KEY, String(wave));
  } catch {
    // Storage unavailable — the run still counts, it just won't persist.
  }
  return wave;
}
