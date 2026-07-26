/**
 * Tower placement, targeting and firing.
 *
 * The four stone-age towers deliberately answer different problems:
 *   thrower — cheap reliable single target
 *   trap    — sits ON the path, never misses, covers one cell
 *   slower  — zero damage, pure force multiplier
 *   heavy   — huge hit, punishing reload, shrugs off armor
 */

import { SELL_REFUND, TARGET_MODES, TOWERS, UPGRADES } from '../config/balance';
import {
  bonusPierce,
  burnMul,
  damageMul,
  fireRateMul,
  rangeMul,
  refundRate,
  slowBonus,
  splashMul,
} from './perks';
import { cellCenter, cellIndex, inBounds, kindAt } from './grid';
import { applyBurn, applyFreeze, applySlow, damageEnemy } from './enemies';
import { emit } from './events';
import { spend, towerCost, upgradeCost } from './economy';
import { nextFloat } from './rng';
import { spawnProjectile } from './projectiles';
import {
  CellKind,
  type Enemy,
  type GameState,
  type ProjectileLook,
  type Tower,
  type TowerKind,
} from './types';

/** What each tower's shot looks like in flight. Presentation, but it belongs
 *  with the tower identity rather than being re-derived in the renderer. */
const PROJECTILE_LOOK: Record<TowerKind, ProjectileLook> = {
  thrower: 'rock',
  trap: 'rock',
  slower: 'rock',
  heavy: 'boulder',
  ballista: 'arrow',
  oilFire: 'rock',
  frost: 'rock',
  siegeCannon: 'cannonball',
  goldMine: 'rock',
  railgun: 'bullet',
  teslaCoil: 'bullet',
  cryo: 'bullet',
  singularity: 'cannonball',
  sniper: 'rail',
};

// ---------------------------------------------------------------------------
// Derived stats
// ---------------------------------------------------------------------------
// Read per use rather than cached on the tower, so an upgrade takes effect
// immediately and there is no stale copy to keep in sync.

export function towerRange(state: GameState, tower: Tower): number {
  const def = TOWERS[tower.kind]!;
  // A Sniper reaches the whole board. Returning Infinity rather than a big
  // number keeps every distance comparison honest and lets the renderer test
  // isFinite() to decide whether a range ring means anything.
  if (def.unlimitedRange) return Infinity;
  return def.range * (UPGRADES.rangeMul[tower.level - 1] ?? 1) * rangeMul(state);
}

export function towerDamage(state: GameState, tower: Tower): number {
  const def = TOWERS[tower.kind]!;
  return def.damage * (UPGRADES.damageMul[tower.level - 1] ?? 1) * damageMul(state);
}

export function towerFireRate(state: GameState, tower: Tower): number {
  const def = TOWERS[tower.kind]!;
  return def.fireRate * (UPGRADES.fireRateMul[tower.level - 1] ?? 1) * fireRateMul(state);
}

export function towerSlowFactor(state: GameState, tower: Tower): number {
  const def = TOWERS[tower.kind]!;
  if (def.slowFactor >= 1) return 1;
  // Upgrades and the Deep Freeze perk both push the multiplier toward zero.
  const strength = (UPGRADES.slowBonus[tower.level - 1] ?? 0) + slowBonus(state) * def.slowFactor;
  return Math.max(0.1, def.slowFactor - strength);
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export type PlacementError = 'outOfBounds' | 'occupied' | 'wrongTerrain' | 'tooPoor' | null;

/**
 * Why a placement would fail, or null if it's legal. The renderer uses this to
 * colour the placement ghost, and the sim uses it to reject the intent — one
 * rule, so what you see is exactly what you get.
 */
export function placementError(
  state: GameState,
  kind: TowerKind,
  cx: number,
  cy: number,
): PlacementError {
  if (!inBounds(state.map, cx, cy)) return 'outOfBounds';
  if (state.occupancy[cellIndex(state.map, cx, cy)] !== 0) return 'occupied';

  const onPath = kindAt(state.map, cx, cy) === CellKind.Path;
  // Traps are the inverse of every other tower: they only work underfoot.
  if (TOWERS[kind]!.onPath !== onPath) return 'wrongTerrain';

  if (state.gold < towerCost(kind)) return 'tooPoor';
  return null;
}

export function placeTower(
  state: GameState,
  kind: TowerKind,
  cx: number,
  cy: number,
): Tower | null {
  const pos = cellCenter(state.layout, cx, cy);
  if (placementError(state, kind, cx, cy) !== null) {
    emit(state, { type: 'purchaseDenied', at: pos });
    return null;
  }
  if (!spend(state, towerCost(kind))) {
    emit(state, { type: 'purchaseDenied', at: pos });
    return null;
  }

  const tower: Tower = {
    id: state.nextEntityId++,
    kind,
    cell: { cx, cy },
    pos,
    level: 1,
    cooldown: 0,
    invested: towerCost(kind),
    kills: 0,
    aim: 0,
    recoil: 0,
    targetMode: 'first',
  };
  state.towers.push(tower);
  state.occupancy[cellIndex(state.map, cx, cy)] = tower.id;
  emit(state, { type: 'towerPlaced', at: pos, kind });
  return tower;
}

export function upgradeTower(state: GameState, towerId: number): boolean {
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower) return false;

  const cost = upgradeCost(tower);
  if (cost === null || !spend(state, cost)) {
    emit(state, { type: 'purchaseDenied', at: tower.pos });
    return false;
  }

  tower.level++;
  tower.invested += cost;
  emit(state, { type: 'towerUpgraded', at: tower.pos, level: tower.level });
  return true;
}

/** Upgrades make a mine produce more, since it has no damage to improve. */
export function mineRate(tower: Tower): number {
  return UPGRADES.damageMul[tower.level - 1] ?? 1;
}

/**
 * Refund for scrapping a tower: a fraction of everything sunk into it,
 * upgrades included. Rounded down, so selling is never a way to gain value.
 */
export function sellValue(state: GameState, tower: Tower): number {
  return Math.floor(tower.invested * refundRate(state, SELL_REFUND));
}

export function sellTower(state: GameState, towerId: number): boolean {
  const index = state.towers.findIndex((t) => t.id === towerId);
  if (index < 0) return false;

  const tower = state.towers[index]!;
  state.gold += sellValue(state, tower);
  state.occupancy[cellIndex(state.map, tower.cell.cx, tower.cell.cy)] = 0;
  state.towers.splice(index, 1);

  emit(state, { type: 'towerSold', at: tower.pos, refund: sellValue(state, tower) });
  return true;
}

// ---------------------------------------------------------------------------
// Targeting
// ---------------------------------------------------------------------------

export function cycleTargetMode(state: GameState, towerId: number): boolean {
  const tower = state.towers.find((t) => t.id === towerId);
  if (!tower) return false;
  const i = TARGET_MODES.indexOf(tower.targetMode);
  tower.targetMode = TARGET_MODES[(i + 1) % TARGET_MODES.length]!;
  return true;
}

/**
 * Target selection.
 *
 * `first` — furthest along the path, i.e. closest to leaking. The safe default.
 * `strongest` — most current HP; points slow heavy hitters at the thing worth
 *   hitting instead of whichever runner happened to get ahead.
 * `healers` — prefers anything with a heal aura, falling back to `first`.
 *   This mode is the reason healers are answerable at all: without it, towers
 *   shoot the front of the pack while the healer at the back undoes it.
 *
 * Every comparison ends in an id tiebreak so selection is deterministic
 * regardless of array order.
 */
function findTarget(state: GameState, tower: Tower, range: number): Enemy | null {
  let best: Enemy | null = null;
  let bestScore = -Infinity;
  const rangeSq = range * range;

  for (const e of state.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - tower.pos.x;
    const dy = e.pos.y - tower.pos.y;
    if (dx * dx + dy * dy > rangeSq) continue;

    let score: number;
    switch (tower.targetMode) {
      case 'strongest':
        score = e.hp;
        break;
      case 'healers':
        // Huge constant bias rather than a separate pass: any healer in range
        // outranks every non-healer, and among equals it falls back to
        // progress along the path.
        score = (e.healPerSecond > 0 ? 1e9 : 0) + e.dist;
        break;
      case 'first':
      default:
        score = e.dist;
        break;
    }

    if (score > bestScore || (score === bestScore && best !== null && e.id < best.id)) {
      best = e;
      bestScore = score;
    }
  }
  return best;
}


// ---------------------------------------------------------------------------
// Per-step update
// ---------------------------------------------------------------------------

export function updateTowers(state: GameState, dt: number): void {
  for (const tower of state.towers) {
    if (tower.cooldown > 0) tower.cooldown -= dt;
    if (tower.recoil > 0) tower.recoil -= dt;

    const def = TOWERS[tower.kind]!;

    // Economy buildings never target anything; they just pay out.
    if (def.goldPerSecond > 0) {
      // Fractional gold accumulates on state.gold directly. Everything that
      // spends compares with >=, and the HUD floors for display, so there is
      // no need for a separate accumulator to round-trip through.
      state.gold += def.goldPerSecond * mineRate(tower) * dt;
      continue;
    }

    if (def.slowFactor < 1) {
      updateSlower(state, tower);
      continue;
    }
    if (def.onPath) {
      updateTrap(state, tower);
      continue;
    }
    updateShooter(state, tower);
  }
}

/** Auras re-apply every step; the slow itself expires on a short timer. */
function updateSlower(state: GameState, tower: Tower): void {
  const def = TOWERS[tower.kind]!;
  const range = towerRange(state, tower);
  const rangeSq = range * range;
  const factor = towerSlowFactor(state, tower);

  for (const e of state.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - tower.pos.x;
    const dy = e.pos.y - tower.pos.y;
    if (dx * dx + dy * dy > rangeSq) continue;

    applySlow(e, factor);
    // Cryo occasionally locks a unit solid. Rolled from the run RNG so a seed
    // reproduces exactly which enemies froze and when.
    if (def.freezeChance > 0 && nextFloat(state.rng) < def.freezeChance) {
      applyFreeze(e, def.freezeSeconds);
    }
  }
}

/**
 * A trap hits everything standing on its cell when it rearms. It cannot miss
 * and cannot overkill a single target, which is what makes it the cheap answer
 * to fast units that shooters struggle to track.
 */
function updateTrap(state: GameState, tower: Tower): void {
  if (tower.cooldown > 0) return;

  const reach = state.layout.cellSize * 0.5;
  const reachSq = reach * reach;
  const def = TOWERS[tower.kind]!;
  const damage = towerDamage(state, tower);
  const struck: typeof state.enemies = [];

  for (const e of state.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - tower.pos.x;
    const dy = e.pos.y - tower.pos.y;
    if (dx * dx + dy * dy > reachSq) continue;
    damageEnemy(state, e, damage, def.armorPierce, tower.id);
    if (def.burnDps > 0) applyBurn(e, def.burnDps * burnMul(state), def.burnSeconds);
    struck.push(e);
  }

  if (struck.length === 0) return;

  // Tesla chains outward from whatever it hit. Unlike splash this follows the
  // enemies rather than a radius from the tower, so a strung-out line is a
  // better target for it than a tight clump.
  if (def.chainCount > 0) {
    chainFrom(state, tower, struck, def.chainCount, def.chainRange, damage, def.armorPierce);
  }

  tower.cooldown = 1 / towerFireRate(state, tower);
  tower.recoil = 0.15;
  emit(state, { type: 'towerFired', at: tower.pos, kind: tower.kind });
}

function chainFrom(
  state: GameState,
  tower: Tower,
  seeds: Enemy[],
  count: number,
  range: number,
  damage: number,
  armorPierce: number,
): void {
  const hit = new Set(seeds.map((e) => e.id));
  let from = seeds[0]!;
  const rangeSq = range * range;

  for (let i = 0; i < count; i++) {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of state.enemies) {
      if (e.dead || hit.has(e.id)) continue;
      const dx = e.pos.x - from.pos.x;
      const dy = e.pos.y - from.pos.y;
      const d = dx * dx + dy * dy;
      // Tie-break on id so the chain path is deterministic.
      if (d <= rangeSq && (d < bestD || (d === bestD && best !== null && e.id < best.id))) {
        best = e;
        bestD = d;
      }
    }
    if (!best) return;

    hit.add(best.id);
    damageEnemy(state, best, damage, armorPierce, tower.id);
    emit(state, { type: 'chainArc', from: { ...from.pos }, to: { ...best.pos } });
    from = best;
  }
}

function updateShooter(state: GameState, tower: Tower): void {
  const range = towerRange(state, tower);
  const target = findTarget(state, tower, range);
  if (!target) return;

  // Aim continuously, even while reloading — the barrel tracking its target is
  // most of what makes a slow tower feel alive rather than idle.
  tower.aim = Math.atan2(target.pos.y - tower.pos.y, target.pos.x - tower.pos.x);
  if (tower.cooldown > 0) return;

  const def = TOWERS[tower.kind]!;
  spawnProjectile(state, tower, target, {
    look: PROJECTILE_LOOK[tower.kind],
    damage: towerDamage(state, tower),
    splash: def.splash * splashMul(state),
    armorPierce: def.armorPierce,
    speed: def.projectileSpeed,
    // Only towers that already pierce benefit from the perk; it shouldn't
    // silently turn every Thrower into a lance.
    pierce: def.pierce > 0 ? def.pierce + bonusPierce(state) : 0,
    burnDps: def.burnDps * burnMul(state),
    burnSeconds: def.burnSeconds,
  });

  tower.cooldown = 1 / towerFireRate(state, tower);
  tower.recoil = 0.12;
  emit(state, { type: 'towerFired', at: tower.pos, kind: tower.kind });
}
