/**
 * Gold: what things cost and what kills pay.
 *
 * One currency funds towers, upgrades and (from slice 5) age advancement. The
 * tension between those three sinks is the game, so every price and payout
 * lives in balance.ts — nothing here invents a number.
 */

import { SCALING, TOWERS, UPGRADES } from '../config/balance';
import { bountyMul } from './perks';
import type { GameState, Tower, TowerKind } from './types';

/**
 * What a tower costs. A flat, stable sticker price.
 *
 * It briefly scaled with how many towers you already owned, as a brake on
 * filling every cell. It worked mechanically and read terribly: every price in
 * the build bar drifted to an arbitrary number like 154g, so nothing on screen
 * was memorable and the bar looked broken rather than deliberate. A price the
 * player can learn is worth more than a clever curve.
 */
export function towerCost(kind: TowerKind): number {
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
  // Tied to how tough the unit actually is, at an exponent below 1, so gold
  // per point of HP killed falls as the run goes on.
  //
  // Clamped at bountyFreezeWave. By then the board is at its cap with every
  // tower maxed, so income has nothing left to buy and its only remaining
  // effect was to guarantee the player could replace anything that died. From
  // here the wave curve climbs against a defence that has stopped growing.
  const w = Math.max(0, Math.min(waveNumber, SCALING.bountyFreezeWave) - 1);
  const hpMul = 1 + SCALING.hpLinear * w + SCALING.hpQuadratic * w * w;
  const mul = Math.pow(hpMul, SCALING.bountyHpExponent);
  return Math.round(baseBounty * mul * bountyMul(state));
}

export function waveClearReward(waveNumber: number): number {
  return Math.round(SCALING.waveClearBase + SCALING.waveClearPerWave * waveNumber);
}
