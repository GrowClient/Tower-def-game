/**
 * Local persistence. Isolated here because `core/` may never touch
 * localStorage — the simulation has no business knowing the browser exists.
 *
 * Every access is wrapped: private browsing modes and storage-disabled
 * settings throw on access rather than returning null, and a high score is
 * never worth crashing a run over.
 */

import type { GameState } from '../core/types';

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

// ---------------------------------------------------------------------------
// Saved run — what "Continue" continues
// ---------------------------------------------------------------------------

const RUN_KEY = 'td.run';

/**
 * Bumped whenever a change makes an old save unsafe to load.
 *
 * A stored run is a snapshot of GameState, so a rename, a new required field,
 * or a change to map generation all make yesterday's save a run that cannot
 * exist. Rather than migrate, an old save is simply dropped: losing one
 * interrupted run is a far smaller cost than resuming into a corrupt one, and
 * a save that half-loads is the worst outcome of the three.
 *
 * v2: runs carry a `mode`. A v1 save has none, and a run with no mode would
 * resume as a campaign that never ends or an endless run that stops at 60 —
 * exactly the silent half-load this counter exists to prevent.
 */
const RUN_VERSION = 2;

interface SavedRun {
  v: number;
  /** GameState with `occupancy` swapped for a plain array — see below. */
  state: unknown;
}

/**
 * `occupancy` is the one non-JSON field on GameState: an Int32Array, which
 * JSON.stringify silently turns into an object keyed by index. Converting it
 * explicitly in both directions is what keeps the round trip honest, and doing
 * it HERE keeps `core/` unaware that saving exists at all.
 */
function toPlain(state: GameState): unknown {
  return { ...state, occupancy: Array.from(state.occupancy) };
}

function fromPlain(raw: Record<string, unknown>): GameState {
  const occ = raw['occupancy'];
  return {
    ...(raw as unknown as GameState),
    occupancy: Int32Array.from(Array.isArray(occ) ? (occ as number[]) : []),
  };
}

export function saveRun(state: GameState): void {
  // A finished run is not resumable, and leaving one saved means "Continue"
  // drops the player onto their own game-over screen.
  if (state.phase !== 'playing') {
    clearSavedRun();
    return;
  }
  try {
    const payload: SavedRun = { v: RUN_VERSION, state: toPlain(state) };
    window.localStorage.setItem(RUN_KEY, JSON.stringify(payload));
  } catch {
    // Storage full or disabled. The run continues; it just won't survive a
    // reload, which is not worth interrupting play over.
  }
}

/** The stored run, or null if there is none, it is stale, or it is unreadable. */
export function loadRun(): GameState | null {
  try {
    const raw = window.localStorage.getItem(RUN_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as SavedRun;
    if (parsed.v !== RUN_VERSION) {
      clearSavedRun();
      return null;
    }
    const state = fromPlain(parsed.state as Record<string, unknown>);
    // Cheap sanity check rather than trust. A truncated or hand-edited save
    // would otherwise crash on the first step, inside the sim, where the cause
    // is unrecognisable.
    if (
      typeof state.seed !== 'number' ||
      !Array.isArray(state.towers) ||
      !Array.isArray(state.enemies) ||
      state.map === undefined ||
      state.occupancy.length !== state.map.cols * state.map.rows
    ) {
      clearSavedRun();
      return null;
    }
    return state;
  } catch {
    clearSavedRun();
    return null;
  }
}

export function hasSavedRun(): boolean {
  try {
    return window.localStorage.getItem(RUN_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSavedRun(): void {
  try {
    window.localStorage.removeItem(RUN_KEY);
  } catch {
    // Nothing to do — a save we cannot delete is a save we also cannot read.
  }
}

// ---------------------------------------------------------------------------
// Tutorial
// ---------------------------------------------------------------------------

const TUTORIAL_KEY = 'td.tutorialDone';

/**
 * Persisted rather than per-session, because a returning player being taught
 * to build a tower again is the game calling them a beginner every visit.
 */
export function loadTutorialDone(): boolean {
  try {
    return window.localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveTutorialDone(): void {
  try {
    window.localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    // Storage unavailable — the tutorial will simply offer itself again.
  }
}

// ---------------------------------------------------------------------------
// Music volume
// ---------------------------------------------------------------------------

const MUSIC_VOLUME_KEY = 'td.musicVolume';

/**
 * Persisted, because a volume setting is a statement about the player's room
 * rather than about the run. Someone who turned the music down once did not
 * mean "for this session"; making them do it again every launch is the setting
 * not working.
 */
export function loadMusicVolume(fallback: number): number {
  try {
    const raw = window.localStorage.getItem(MUSIC_VOLUME_KEY);
    if (raw === null) return fallback;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : fallback;
  } catch {
    return fallback;
  }
}

export function saveMusicVolume(volume: number): void {
  try {
    window.localStorage.setItem(MUSIC_VOLUME_KEY, volume.toFixed(3));
  } catch {
    // Storage unavailable — the slider still works, it just won't be remembered.
  }
}
