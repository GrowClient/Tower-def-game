/**
 * Tower placement, targeting and firing.
 *
 * The four stone-age towers deliberately answer different problems:
 *   thrower — cheap reliable single target
 *   trap    — sits ON the path, never misses, covers one cell
 *   slower  — zero damage, pure force multiplier
 *   heavy   — huge hit, punishing reload, shrugs off armor
 */

import { TARGET_MODES, TOWERS, UPGRADES } from '../config/balance';
import { cellCenter, cellIndex, inBounds, kindAt } from './grid';
import { applySlow, damageEnemy } from './enemies';
import { emit } from './events';
import { spend, towerCost, upgradeCost } from './economy';
import { spawnProjectile } from './projectiles';
import { CellKind, type Enemy, type GameState, type Tower, type TowerKind } from './types';

// ---------------------------------------------------------------------------
// Derived stats
// ---------------------------------------------------------------------------
// Read per use rather than cached on the tower, so an upgrade takes effect
// immediately and there is no stale copy to keep in sync.

export function towerRange(tower: Tower): number {
  const def = TOWERS[tower.kind]!;
  return def.range * (UPGRADES.rangeMul[tower.level - 1] ?? 1);
}

export function towerDamage(tower: Tower): number {
  const def = TOWERS[tower.kind]!;
  return def.damage * (UPGRADES.damageMul[tower.level - 1] ?? 1);
}

export function towerFireRate(tower: Tower): number {
  const def = TOWERS[tower.kind]!;
  return def.fireRate * (UPGRADES.fireRateMul[tower.level - 1] ?? 1);
}

export function towerSlowFactor(tower: Tower): number {
  const def = TOWERS[tower.kind]!;
  if (def.slowFactor >= 1) return 1;
  return Math.max(0.15, def.slowFactor - (UPGRADES.slowBonus[tower.level - 1] ?? 0));
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

    if (def.slowFactor < 1) {
      updateSlower(state, tower);
      continue;
    }
    if (def.onPath) {
      updateTrap(state, tower, dt);
      continue;
    }
    updateShooter(state, tower);
  }
}

/** Auras re-apply every step; the slow itself expires on a short timer. */
function updateSlower(state: GameState, tower: Tower): void {
  const range = towerRange(tower);
  const rangeSq = range * range;
  const factor = towerSlowFactor(tower);

  for (const e of state.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - tower.pos.x;
    const dy = e.pos.y - tower.pos.y;
    if (dx * dx + dy * dy <= rangeSq) applySlow(e, factor);
  }
}

/**
 * A trap hits everything standing on its cell when it rearms. It cannot miss
 * and cannot overkill a single target, which is what makes it the cheap answer
 * to fast units that shooters struggle to track.
 */
function updateTrap(state: GameState, tower: Tower, _dt: number): void {
  if (tower.cooldown > 0) return;

  const reach = state.layout.cellSize * 0.5;
  const reachSq = reach * reach;
  const def = TOWERS[tower.kind]!;
  let triggered = false;

  for (const e of state.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - tower.pos.x;
    const dy = e.pos.y - tower.pos.y;
    if (dx * dx + dy * dy > reachSq) continue;
    damageEnemy(state, e, towerDamage(tower), def.armorPierce, tower.id);
    triggered = true;
  }

  if (triggered) {
    tower.cooldown = 1 / towerFireRate(tower);
    tower.recoil = 0.15;
    emit(state, { type: 'towerFired', at: tower.pos, kind: tower.kind });
  }
}

function updateShooter(state: GameState, tower: Tower): void {
  const range = towerRange(tower);
  const target = findTarget(state, tower, range);
  if (!target) return;

  // Aim continuously, even while reloading — the barrel tracking its target is
  // most of what makes a slow tower feel alive rather than idle.
  tower.aim = Math.atan2(target.pos.y - tower.pos.y, target.pos.x - tower.pos.x);
  if (tower.cooldown > 0) return;

  const def = TOWERS[tower.kind]!;
  spawnProjectile(state, tower, target, {
    damage: towerDamage(tower),
    splash: def.splash,
    armorPierce: def.armorPierce,
    speed: def.projectileSpeed,
  });

  tower.cooldown = 1 / towerFireRate(tower);
  tower.recoil = 0.12;
  emit(state, { type: 'towerFired', at: tower.pos, kind: tower.kind });
}
