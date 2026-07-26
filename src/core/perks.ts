/**
 * The perk draft.
 *
 * Every Nth cleared wave the player picks one of three randomly drawn perks.
 * Perks are run-wide, so a run compounds in a direction instead of every run
 * converging on the same board — that's the point, and it's what turns
 * "place towers until you die" into a build with an identity.
 *
 * The draft PAUSES wave progression: the sim holds at `awaitingPerk` until an
 * intent picks one. Letting waves continue during the choice would punish
 * players for reading the options.
 */

import { PERK_RULES, PERKS, type PerkKey } from '../config/balance';
import { emit } from './events';
import { nextInt } from './rng';
import type { GameState } from './types';

export function perkStacks(state: GameState, key: PerkKey): number {
  return state.perks[key] ?? 0;
}

/** True when the wave just cleared should trigger a draft. */
export function shouldDraft(waveNumber: number): boolean {
  return waveNumber > 0 && waveNumber % PERK_RULES.everyWaves === 0;
}

/**
 * Draw the offered perks, excluding any already at max stacks. Uses the run
 * RNG so a seed always offers the same choices — a replay has to be able to
 * make the same decisions.
 */
export function openDraft(state: GameState): void {
  const eligible = PERKS.filter((p) => perkStacks(state, p.key) < p.maxStacks);
  if (eligible.length === 0) return;

  const pool = [...eligible];
  const offered: PerkKey[] = [];
  const n = Math.min(PERK_RULES.choices, pool.length);
  for (let i = 0; i < n; i++) {
    const idx = nextInt(state.rng, 0, pool.length - 1);
    offered.push(pool[idx]!.key);
    pool.splice(idx, 1);
  }

  state.perkChoices = offered;
  emit(state, { type: 'perkDraftOpened' });
}

export function choosePerk(state: GameState, key: PerkKey): boolean {
  if (state.perkChoices === null) return false;
  // Only accept a key that was actually offered — otherwise a stray or
  // malicious intent could hand out any perk at any time.
  if (!state.perkChoices.includes(key)) return false;

  state.perks[key] = perkStacks(state, key) + 1;
  state.perkChoices = null;

  // 'lives' is the one perk with an immediate effect rather than a multiplier.
  if (key === 'lives') state.lives += PERK_RULES.livesPerStack;

  // Farsight widens every ring at once, which can form combos across the whole
  // board. Cheaper to re-sweep on any perk than to special-case which ones
  // move ranges and silently miss one added later.
  state.combosDirty = true;

  emit(state, { type: 'perkChosen', key });
  return true;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
// Read at the point of use rather than baked into towers when placed, so a
// perk taken at wave 15 immediately improves towers built at wave 2.

export function damageMul(state: GameState): number {
  return 1 + perkStacks(state, 'damage') * PERK_RULES.damagePerStack;
}

export function fireRateMul(state: GameState): number {
  return 1 + perkStacks(state, 'fireRate') * PERK_RULES.fireRatePerStack;
}

export function rangeMul(state: GameState): number {
  return 1 + perkStacks(state, 'range') * PERK_RULES.rangePerStack;
}

export function splashMul(state: GameState): number {
  return 1 + perkStacks(state, 'splash') * PERK_RULES.splashPerStack;
}

export function bountyMul(state: GameState): number {
  return 1 + perkStacks(state, 'bounty') * PERK_RULES.bountyPerStack;
}

export function burnMul(state: GameState): number {
  return 1 + perkStacks(state, 'burn') * PERK_RULES.burnPerStack;
}

export function bonusPierce(state: GameState): number {
  return perkStacks(state, 'pierce') * PERK_RULES.piercePerStack;
}

/** Slows get *stronger*, i.e. the movement multiplier moves toward zero. */
export function slowBonus(state: GameState): number {
  return perkStacks(state, 'slow') * PERK_RULES.slowPerStack;
}

export function refundRate(state: GameState, base: number): number {
  return perkStacks(state, 'refund') > 0 ? PERK_RULES.refundBoost : base;
}
