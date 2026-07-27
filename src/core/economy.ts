/**
 * Gold: what things cost and what kills pay.
 *
 * One currency funds towers, upgrades and (from slice 5) age advancement. The
 * tension between those three sinks is the game, so every price and payout
 * lives in balance.ts — nothing here invents a number.
 */

import { CROWDING_TAX, SCALING, TOWERS, UPGRADES } from '../config/balance';
import { bountyMul } from './perks';
import type { GameState, Tower, TowerKind } from './types';

/**
 * What the next tower of this kind actually costs right now.
 *
 * Scales with how many towers are already standing — see CROWDING_TAX. Every
 * caller goes through this (placement, the ghost, the build bar), so the price
 * the player is quoted is always the price they are charged.
 */
export function towerCost(state: GameState, kind: TowerKind): number {
  return Math.round(TOWERS[kind]!.cost * (1 + CROWDING_TAX * state.towers.length));
}

/** The unscaled list price, for reference screens that describe a tower rather
 *  than sell you one. */
export function baseTowerCost(kind: TowerKind): number {
  return TOWERS[kind]!.cost;
}

/** Cost to take a tower from its current level to the next, or null if maxed. */
export function upgradeCost(tower: Tower): number | null {
  const next = tower.level + 1;
  if (next > UPGRADES.maxLevel) return null;
  const mul = UPGRADES.costMul[next - 1];
  if (mul === undefined) return null;
  return Math.round(TOWERS[tower.kind]!.cost * mul);
}

export function canAfford(state: GameState, cost: number): boolean {
  return state.gold >= cost;
}

export function spend(state: GameState, cost: number): boolean {
  if (!canAfford(state, cost)) return false;
  state.gold -= cost;
  return true;
}

/**
 * Kill payout. Bounty grows more slowly than enemy HP does, so income tightens
 * as waves escalate — that pressure is what forces the age-advancement
 * decision later rather than letting you buy everything.
 */
export function killReward(
  state: GameState,
  baseBounty: number,
  waveNumber: number,
): number {
  const mul = 1 + SCALING.bountyLinear * Math.max(0, waveNumber - 1);
  return Math.round(baseBounty * mul * bountyMul(state));
}

export function waveClearReward(waveNumber: number): number {
  return Math.round(SCALING.waveClearBase + SCALING.waveClearPerWave * waveNumber);
}
