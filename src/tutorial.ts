/**
 * The opening tutorial, which runs inside a normal game.
 *
 * Not a mode and not a menu item: pressing NEW GAME starts an ordinary run
 * that happens to explain itself, and one tap puts the explanation away. A
 * separate tutorial is a thing players either skip on principle or finish and
 * then have to start over from; this is just the first few waves of the game
 * they already wanted to play.
 *
 * Four ideas, one at a time — build something, watch what the road does, mine
 * the road, and finally build a **Shatter**: a Cold Mud next to a Boulder.
 * That last step is the whole reason this exists and it is deliberately a
 * SPECIFIC pairing rather than "make any combo". Combos are the difference
 * between placing towers and designing a defence, and "two towers near each
 * other get a bonus" is an abstraction a new player cannot act on. Two names
 * they can see in the build bar is an instruction. Shatter is also the Stone
 * Age's natural teaching case: both halves are cheap combat towers a player
 * was going to buy anyway (470g the pair), where the only other early combo —
 * Foundry, a Campfire beside a Boulder — costs 760g and pairs a building with
 * a weapon, which teaches the rule and the exception at the same time.
 *
 * The run carries on from there with nothing switched off, because there was
 * never a tutorial mode to leave.
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
    // Both gestures, because both work and only one of them was ever
    // mentioned. A player told to "drag and let go" who tries a plain tap and
    // sees a tower appear has learned the game is inconsistent; a player told
    // to drag who only ever taps never finds the combo preview at all.
    body: 'Press one in the bar below, then tap a patch of grass. Or hold and drag onto it — the preview follows your finger.',
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
    key: 'shatter',
    title: 'LAST ONE — MAKE A SHATTER',
    body: 'Build a Cold Mud and a Boulder within two cells of each other. Towers that overlap form a named COMBO and both get stronger. Shatter is +30% damage.',
    // Named, not generic. `combos` is rebuilt from every tower pair whenever
    // the board changes, so this is asking the live run whether the pairing
    // actually exists — not whether the player pressed the right buttons.
    done: (s) => s.towers.some((t) => t.combos.includes('shatter')),
    fromWave: 3,
  },
];

/**
 * The step to show right now, or null.
 *
 * Strictly in order and one at a time: showing the combo hint while the player
 * still has no towers is how a tutorial becomes wallpaper. It also stops
 * entirely once the armor briefing is due, because two teaching cards on
 * screen at once is one too many and the briefing is the more urgent lesson —
 * a player who has not managed a Shatter by then is simply offered it again
 * next run rather than nagged through a wave that is about to get hard.
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
