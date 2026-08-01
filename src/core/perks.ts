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

import { PERK_RULES, PERKS, type PerkDef, type PerkKey } from '../config/balance';
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
/**
 * Draw the offered perks.
 *
 * Structured rather than uniformly random: one power option, one economy
 * option, then a wildcard. A purely random draw regularly produced three
 * damage perks, which is not a choice — the point of the draft is to ask "more
 * killing power, or more money?" every five waves, and you can only ask that
 * if both are on the table.
 *
 * Uses the run RNG so a seed always offers the same cards; a replay has to be
 * able to make the same decisions.
 */
export function openDraft(state: GameState): void {
  const eligible = PERKS.filter((p) => perkStacks(state, p.key) < p.maxStacks);
  if (eligible.length === 0) return;

  const pool = [...eligible];
  const offered: PerkKey[] = [];

  const take = (from: PerkDef[]): void => {
    if (from.length === 0) return;
    const pick = from[nextInt(state.rng, 0, from.length - 1)]!;
    offered.push(pick.key);
    pool.splice(pool.indexOf(pick), 1);
  };

  take(pool.filter((p) => p.category === 'power'));
  take(pool.filter((p) => p.category === 'economy'));
  // Wildcard from whatever is left, so utility perks still show up and a run
  // that has maxed one whole category still gets a full hand.
  while (offered.length < Math.min(PERK_RULES.choices, eligible.length)) take(pool);

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

export function bountyMul(state: GameState): number {
  return 1 + perkStacks(state, 'bounty') * PERK_RULES.bountyPerStack;
}

/**
 * Traps hit harder. The one damage perk that names a family rather than the
 * whole board, and the only one worth stacking indefinitely — traps are exempt
 * from the tower cap, so a run can genuinely be built around them.
 */
export function trapDamageMul(state: GameState): number {
  return 1 + perkStacks(state, 'trapDamage') * PERK_RULES.trapDamagePerStack;
}

/**
 * Diamonds off an ability's price, floored so a cast is never free.
 *
 * Subtracted from the COST rather than multiplied into it, which is what makes
 * it an early-game perk: one diamond is a third of a Stone Rain and a
 * thirtieth of an Orbital Lance.
 */
export function abilityCost(state: GameState, base: number): number {
  return Math.max(1, base - perkStacks(state, 'abilityDiscount') * PERK_RULES.abilityDiscountPerStack);
}

/** Economy buildings pay more. The economy-side counterpart to Sharpened. */
export function interestMul(state: GameState): number {
  return 1 + perkStacks(state, 'interest') * PERK_RULES.interestPerStack;
}

/**
 * Slows last LONGER, never bite harder.
 *
 * Deliberately duration and not strength: slow strength is fixed everywhere so
 * that a wave can always keep moving, and a perk that deepened it would undo
 * that in three picks.
 */
export function slowDurationMul(state: GameState): number {
  return 1 + perkStacks(state, 'slow') * PERK_RULES.slowDurationPerStack;
}

export function refundRate(state: GameState, base: number): number {
  return perkStacks(state, 'refund') > 0 ? PERK_RULES.refundBoost : base;
}
