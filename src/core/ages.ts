/**
 * Age advancement.
 *
 * Advancing UNLOCKS the next age's four towers to build. It deliberately does
 * NOT transform, remove or refund the towers you already own — they keep
 * standing and keep firing exactly as before.
 *
 * That is what makes advancing a decision instead of a reward. The gold is
 * gone, the new towers cost more than the old ones, and your board is still
 * the old board until you sell it off piece by piece. Advance too early and
 * you spend several waves defending with Stone Age towers and no money;
 * advance too late and the Tech Age arrives after the waves that needed it.
 */

import { AGES } from '../config/balance';
import { spend } from './economy';
import { emit } from './events';
import type { GameState } from './types';

export function maxAgeIndex(): number {
  return AGES.length - 1;
}

export function isMaxAge(state: GameState): boolean {
  return state.age >= maxAgeIndex();
}

/** Cost to reach the next age, or null when already at the last one. */
export function advanceCost(state: GameState): number | null {
  const next = state.age + 1;
  if (next > maxAgeIndex()) return null;
  return AGES[next]!.advanceCost;
}

export function canAdvance(state: GameState): boolean {
  const cost = advanceCost(state);
  return cost !== null && state.gold >= cost;
}

export function advanceAge(state: GameState): boolean {
  const cost = advanceCost(state);
  if (cost === null) return false;
  if (!spend(state, cost)) {
    emit(state, { type: 'purchaseDenied', at: { x: 0, y: 0 } });
    return false;
  }

  state.age++;
  emit(state, { type: 'ageAdvanced', age: state.age });
  return true;
}
