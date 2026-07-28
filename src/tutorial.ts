/**
 * The opening tutorial.
 *
 * Four ideas, one at a time, over the first few waves — build something, watch
 * what the road does, mine the road, and build things NEXT to each other. That
 * last one is the whole reason this exists: combos are the difference between
 * placing towers and designing a defence, and a player who never notices them
 * is playing a strictly worse game with no way to find out.
 *
 * Two rules keep it from becoming the thing people close without reading.
 *
 * **It is derived, not driven.** A step's `done` is a question asked of the
 * live run — "do you own a tower yet?", "have two of your towers linked?" — so
 * a player who works something out on their own is never told about it, and
 * the tutorial cannot get out of step with what is actually on the board. It
 * holds no progress counter of its own to go stale.
 *
 * **It never blocks.** No modal, no forced clicks, no pause. It is one line in
 * a corner that goes away by itself the moment the thing it describes happens,
 * and a tap on it retires the whole tutorial for good.
 *
 * It reads GameState and never writes to it: the sim has no idea this exists,
 * which is what keeps `?seed=123` reproducing the same run whether or not
 * anyone read the hints.
 */

import { WAVES } from './config/balance';
import type { GameState } from './core/types';
import type { UiState } from './uiState';

export interface TutorialStep {
  key: string;
  title: string;
  body: string;
  /** Has the player done the thing? Asked of the run, never remembered. */
  done: (state: GameState) => boolean;
  /** Don't raise it before this wave — one idea at a time. */
  fromWave: number;
}

const STEPS: TutorialStep[] = [
  {
    key: 'build',
    title: 'BUILD A TOWER',
    body: 'Press one in the bar below, then drag onto the grass and let go.',
    done: (s) => s.towers.length > 0,
    fromWave: 0,
  },
  {
    key: 'road',
    title: 'THEY FOLLOW THE ROAD',
    body: 'Enemies never leave it. A tower only shoots what comes inside its ring.',
    done: (s) => s.wave.number >= 2,
    fromWave: 1,
  },
  {
    key: 'trap',
    title: 'MINE THE ROAD',
    body: 'A Spike Pit goes ON the road, and it does not use up a tower slot.',
    done: (s) => s.towers.some((t) => t.kind === 'trap'),
    fromWave: 2,
  },
  {
    key: 'combo',
    title: 'BUILD THEM SIDE BY SIDE',
    body: 'Two towers within about two cells form a named COMBO and both get stronger. Drag one around to see the links before you pay.',
    done: (s) => s.towers.some((t) => t.combos.length > 0),
    fromWave: 3,
  },
];

/**
 * The step to show right now, or null.
 *
 * Strictly in order and one at a time: showing the combo hint while the player
 * still has no towers is how a tutorial becomes wallpaper. It also stops
 * entirely once the armor briefing is due, because two teaching cards on
 * screen at once is one too many and the briefing is the more urgent lesson.
 */
export function currentTutorialStep(state: GameState, ui: UiState): TutorialStep | null {
  if (ui.tutorialDone) return null;
  if (state.phase !== 'playing') return null;
  if (state.wave.number >= WAVES.armorBriefingWave) return null;

  for (const step of STEPS) {
    if (step.done(state)) continue;
    if (state.wave.number < step.fromWave) return null;
    return step;
  }
  return null;
}

/** True once every step's goal has been met — used to stop asking forever. */
export function tutorialComplete(state: GameState): boolean {
  return STEPS.every((s) => s.done(state));
}
