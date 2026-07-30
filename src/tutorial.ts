/**
 * The opening tutorial, which runs inside a normal game.
 *
 * Not a mode and not a menu item: pressing NEW GAME starts an ordinary run
 * that happens to explain itself, and one small button puts the explanation
 * away. A separate tutorial is a thing players either skip on principle or
 * finish and then have to start over from; this is just the first few waves of
 * the game they already wanted to play.
 *
 * Seven ideas, one at a time, covering the four things a player cannot work
 * out from the board alone: that traps go ON the road, that income is a
 * building you buy rather than a reward you earn, that gold can be burned into
 * diamonds, and — the big one — that towers built beside each other combine.
 *
 * Two rules keep it from becoming the thing people close without reading.
 *
 * **It is derived, not driven.** A step's `done` is a question asked of the
 * live run — "do you own a tower yet?", "does any tower carry `shatter`?" — so
 * a player who works something out on their own is never told about it, and
 * the tutorial cannot get out of step with what is actually on the board. It
 * holds no progress counter of its own to go stale.
 *
 * **It never blocks.** No modal, no forced clicks, no pause. It is a card in a
 * corner that goes away by itself the moment the thing it describes happens.
 *
 * It reads GameState and never writes to it: the sim has no idea this exists,
 * which is what keeps `?seed=123` reproducing the same run whether or not
 * anyone read the hints.
 */

import { TOWERS, WAVES } from './config/balance';
import type { GameState } from './core/types';
import type { UiState } from './uiState';

/**
 * Two kinds of step, because two kinds of lesson.
 *
 * A **do** step waits for the player to actually perform the thing, and holds
 * the queue until they do — that is what makes it a lesson rather than a
 * caption. A **know** step is a fact that has no action attached ("enemies
 * follow the road"), so it clears itself when the run moves on. Mixing the two
 * was the mistake waiting to happen here: gating "there are other combos" on
 * some purchase would have stalled the tutorial on a decision the player has
 * no reason to make yet.
 */
export type StepKind = 'do' | 'know';

export interface TutorialStep {
  key: string;
  kind: StepKind;
  title: string;
  body: string;
  /** Has the player done the thing? Asked of the run, never remembered. */
  done: (state: GameState) => boolean;
  /** Don't raise it before this wave — one idea at a time. */
  fromWave: number;
}

/** Does the board hold a building that pays gold every wave? */
const hasEconomy = (s: GameState): boolean =>
  s.towers.some((t) => (TOWERS[t.kind]?.goldPerWave ?? 0) > 0);

const STEPS: TutorialStep[] = [
  {
    key: 'build',
    kind: 'do',
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
    kind: 'know',
    title: 'THEY FOLLOW THE ROAD',
    body: 'Enemies never leave it. A tower only shoots what comes inside its ring.',
    done: (s) => s.wave.number >= 2,
    fromWave: 1,
  },
  {
    key: 'economy',
    kind: 'know',
    title: 'BUY YOUR INCOME',
    // Taught EARLY and taught as a bet, because that is what it is. Killing
    // things pays a third of what it used to; almost all late gold comes from
    // buildings, so a player who never buys one is playing a version of the
    // game with the economy switched off — and they will not discover that
    // from a build bar that shows them a tower with no damage number.
    body: 'A Campfire has no gun — it pays gold every time you CLEAR a wave, and pays for itself in about five. Buying one is defence you did not build, betting you survive long enough to collect.',
    // Clears if they buy one OR the run moves on: a 420g building is a real
    // decision this early, and stalling the whole tutorial behind it would
    // turn a suggestion into a toll gate.
    done: (s) => hasEconomy(s) || s.wave.number >= 4,
    fromWave: 2,
  },
  {
    key: 'trap',
    kind: 'do',
    title: 'MINE THE ROAD',
    body: 'A Spike Pit goes ON the road, and it does not use up a tower slot. It banks charge while nothing walks over it, so a quiet lane hits harder.',
    done: (s) => s.towers.some((t) => t.kind === 'trap'),
    fromWave: 3,
  },
  {
    key: 'shatter',
    kind: 'do',
    title: 'MAKE A SHATTER',
    body: 'Build a Cold Mud and a Boulder within two cells of each other. Towers that overlap form a named COMBO and both get stronger. Shatter is +30% damage.',
    // Named, not generic. `combos` is rebuilt from every tower pair whenever
    // the board changes, so this is asking the live run whether the pairing
    // actually exists — not whether the player pressed the right buttons.
    done: (s) => s.towers.some((t) => t.combos.includes('shatter')),
    fromWave: 4,
  },
  {
    key: 'combos',
    kind: 'know',
    title: 'THERE ARE MORE COMBOS',
    // A hidden synergy is a trap, not a mechanic. Having taught ONE pairing by
    // name, the honest next sentence is that the others exist and where the
    // list lives — otherwise the player reasonably concludes Shatter is the
    // whole system and stops looking.
    body: 'Four in total, and they stack with each other. Press C or the ⧉ button for the full list, and drag a tower around the board to see which links it would make before you pay.',
    done: (s) => s.wave.number >= 6,
    fromWave: 5,
  },
  {
    key: 'exchanger',
    kind: 'know',
    title: 'GOLD INTO DIAMONDS',
    // Last, because it is the only system that costs you something every wave
    // forever, and a player who buys one at wave 2 without understanding the
    // switch has quietly signed up for a drain they cannot see.
    body: 'An Exchanger burns gold each wave to mint diamonds, and diamonds are the only thing that pays for abilities. It has an ON/OFF switch — turn it off while you save for the next age.',
    done: (s) => s.wave.number >= 8,
    fromWave: 6,
  },
];

/**
 * The step to show right now, or null.
 *
 * Strictly in order and one at a time: showing the combo hint while the player
 * still has no towers is how a tutorial becomes wallpaper.
 */
export function currentTutorialStep(state: GameState, ui: UiState): TutorialStep | null {
  if (ui.tutorialDone) return null;
  if (state.phase !== 'playing') return null;

  // Never two teaching cards at once. The wave-7 armor briefing is the more
  // urgent lesson and it is modal-ish, so the tutorial stands down while it is
  // up — but only while it is up. The old rule stopped the tutorial DEAD at
  // wave 7, which was fine when there were four steps and impossible once
  // there were seven.
  if (armorBriefingUp(state, ui)) return null;

  // A hard backstop. A player still on step two at wave 12 is not reading it,
  // and a card that never leaves stops being information and becomes
  // furniture. It is offered again next run.
  if (state.wave.number > TUTORIAL_LAST_WAVE) return null;

  for (const step of STEPS) {
    if (step.done(state)) continue;
    if (state.wave.number < step.fromWave) return null;
    return step;
  }
  return null;
}

const TUTORIAL_LAST_WAVE = 12;

/**
 * The armor briefing's visibility rule, restated.
 *
 * Deliberately duplicated from `render/screens.ts` rather than imported:
 * screens.ts already imports this module for `TutorialStep`, and importing it
 * back would be a cycle for the sake of one boolean. An assertion pins the two
 * together so the copy cannot quietly drift.
 */
function armorBriefingUp(state: GameState, ui: UiState): boolean {
  if (ui.armorBriefingDismissed) return false;
  if (state.wave.active) return false;
  if (state.wave.number + 1 !== WAVES.armorBriefingWave) return false;
  return state.perkChoices === null;
}

/** True once every step's goal has been met — used to stop asking forever. */
export function tutorialComplete(state: GameState): boolean {
  return STEPS.every((s) => s.done(state));
}

/** For assertions: the step list, so the rules above can be tested. */
export function tutorialSteps(): readonly TutorialStep[] {
  return STEPS;
}
