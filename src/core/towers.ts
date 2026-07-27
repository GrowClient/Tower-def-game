/**
 * Tower placement, targeting and firing.
 *
 * The four stone-age towers deliberately answer different problems:
 *   thrower — cheap reliable single target
 *   trap    — sits ON the path, never misses, covers one cell
 *   slower  — zero damage, pure force multiplier
 *   heavy   — huge hit, punishing reload, shrugs off armor
 */

import {
  SELL_REFUND,
  TARGET_MODES,
  TOWER_CAP,
  TOWERS,
  TRAPS,
  UPGRADES,
  VETERANCY,
} from '../config/balance';
import { comboEffect, refreshCombos } from './combos';
import {
  burnMul,
  damageMul,
  fireRateMul,
  interestMul,
  rangeMul,
  refundRate,
  slowDurationMul,
  splashMul,
} from './perks';
import { cellCenter, cellIndex, inBounds, kindAt } from './grid';
import { applyBurn, applySlow, damageEnemy } from './enemies';
import { emit } from './events';
import { spend, towerCost, upgradeCost } from './economy';
import { spawnProjectile } from './projectiles';
import {
  CellKind,
  type Enemy,
  type GameState,
  type ProjectileLook,
  type Tower,
  type TowerKind,
} from './types';

/**
 * What each tower's shot looks like in flight. Presentation, but it belongs
 * with the tower identity rather than being re-derived in the renderer.
 *
 * Every entry is distinct on purpose. These all used to collapse onto 'rock'
 * or 'bullet', which meant a Singularity and a Thrower were indistinguishable
 * from the instant they fired — and a shot crossing the board is visible for
 * far longer than the tower that launched it.
 *
 * The entries for towers that never fire (economy buildings, and the traps
 * that resolve on their own cell) are inert. They exist because the map is
 * exhaustive over TowerKind, which is what makes adding a tower without
 * choosing its ammunition a compile error rather than a silent grey pebble.
 */
export const PROJECTILE_LOOK: Record<TowerKind, ProjectileLook> = {
  thrower: 'rock',
  trap: 'rock',
  slower: 'slush',
  heavy: 'boulder',
  campfire: 'rock',
  ballista: 'arrow',
  oilFire: 'rock',
  frost: 'frostShard',
  siegeCannon: 'cannonball',
  goldMine: 'rock',
  exchanger: 'rock',
  railgun: 'laser',
  teslaCoil: 'rock',
  cryo: 'cryoOrb',
  singularity: 'blackHole',
  sniper: 'rail',
  factory: 'rock',
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
  return (
    def.damage *
    (UPGRADES.damageMul[tower.level - 1] ?? 1) *
    damageMul(state) *
    comboEffect(tower).damageMul *
    veteranMul(tower)
  );
}

export function towerFireRate(state: GameState, tower: Tower): number {
  const def = TOWERS[tower.kind]!;
  // A slower has no damage for veterancy to improve, so its service shows up
  // as a faster reload — more of the lane kept chilled, never a deeper chill.
  const veteran = def.damage <= 0 && def.slowFactor < 1 ? veteranMul(tower) : 1;
  return (
    def.fireRate *
    (UPGRADES.fireRateMul[tower.level - 1] ?? 1) *
    fireRateMul(state) *
    comboEffect(tower).fireRateMul *
    veteran *
    // War Horn. Read straight off the state rather than by scanning the
    // ability list, because this is called for every tower every step.
    state.towerHasteMul
  );
}

/**
 * The shared multiplier a non-combat building applies to its own output.
 *
 * Split out so a Gold Mine's gold and an Exchanger's diamonds improve on ONE
 * curve. When they each had their own copy of "level, then combo, then rank",
 * the two drifted the first time any of the three was retuned.
 */
export function towerOutputScale(state: GameState, tower: Tower): number {
  return (
    (UPGRADES.damageMul[tower.level - 1] ?? 1) *
    comboEffect(tower).goldMul *
    interestMul(state) *
    veteranMul(tower)
  );
}

/**
 * Slow strength is a FIXED property of the tower — not of its level, not of
 * your perks, not of what it stands next to.
 *
 * Every source that used to deepen it has been removed on purpose. Upgrades
 * make a slower shoot faster and further; the perk makes the chill last
 * longer. Nothing anywhere makes a slow stronger, because the failure mode is
 * not "slows are weak", it is "the wave stopped moving".
 */
export function towerSlowFactor(tower: Tower): number {
  return TOWERS[tower.kind]!.slowFactor;
}

/** How long this tower's chill lasts, extended by the Lingering Chill perk. */
export function towerSlowSeconds(state: GameState, tower: Tower): number {
  return TOWERS[tower.kind]!.slowSeconds * slowDurationMul(state);
}

/**
 * Gold this economy building pays when a wave is cleared. Upgrades raise output
 * instead of damage, since it has no damage to raise.
 */
export function towerIncome(state: GameState, tower: Tower): number {
  const def = TOWERS[tower.kind]!;
  if (def.goldPerWave <= 0) return 0;
  return Math.round(def.goldPerWave * towerOutputScale(state, tower));
}

/**
 * How many ranks of service this tower has earned, 0 to 3.
 *
 * Derived from `xp` at the point of use rather than stored, so there is no
 * second copy to keep in sync when a threshold is retuned.
 */
export function veteranRank(tower: Tower): number {
  let rank = 0;
  for (const need of VETERANCY.thresholds) {
    if (tower.xp >= need) rank++;
  }
  return rank;
}

/** The multiplier a tower's rank applies to its own primary output. */
export function veteranMul(tower: Tower): number {
  return VETERANCY.outputMul[veteranRank(tower)] ?? 1;
}

/** XP still needed for the next rank, or null once Elite. */
export function veteranNext(tower: Tower): number | null {
  const rank = veteranRank(tower);
  const need = VETERANCY.thresholds[rank];
  return need === undefined ? null : Math.ceil(need - tower.xp);
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

export type PlacementError =
  | 'outOfBounds'
  | 'occupied'
  | 'wrongTerrain'
  | 'tooPoor'
  | 'atCapacity'
  | null;

/** How many towers this age allows. */
export function towerCap(state: GameState): number {
  return TOWER_CAP[Math.min(state.age, TOWER_CAP.length - 1)]!;
}

/**
 * Does this tower kind consume one of the capped slots?
 *
 * Traps do not — see TRAPS.exemptFromCap. They can only go on the path, which
 * is thirty-odd cells, so they are bounded by the map instead. Charging them a
 * slot as well made a trap strictly the worst use of a slot, which is exactly
 * why nobody built one.
 */
export function countsAgainstCap(kind: TowerKind): boolean {
  return !(TRAPS.exemptFromCap && TOWERS[kind]!.onPath);
}

/** Towers currently occupying a capped slot. */
export function cappedTowerCount(state: GameState): number {
  let n = 0;
  for (const t of state.towers) if (countsAgainstCap(t.kind)) n++;
  return n;
}

export function atCapacity(state: GameState, kind?: TowerKind): boolean {
  if (kind !== undefined && !countsAgainstCap(kind)) return false;
  return cappedTowerCount(state) >= towerCap(state);
}

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

  // Checked before gold, so a full board says "full" rather than blaming your
  // wallet for a purchase that was never going to be allowed.
  if (atCapacity(state, kind)) return 'atCapacity';
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
  const paid = towerCost(kind);
  if (!spend(state, paid)) {
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
    invested: paid,
    kills: 0,
    xp: 0,
    earned: 0,
    aim: 0,
    recoil: 0,
    targetMode: 'first',
    lastTargetId: 0,
    charge: 0,
    combos: [],
  };
  state.towers.push(tower);
  state.occupancy[cellIndex(state.map, cx, cy)] = tower.id;
  // A new tower can form combos for itself AND for everything already in
  // range, so the whole board is re-swept rather than just this tower.
  state.combosDirty = true;
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
  // An upgrade widens the range ring, which can reach a new partner.
  state.combosDirty = true;
  emit(state, { type: 'towerUpgraded', at: tower.pos, level: tower.level });
  return true;
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
  const refund = sellValue(state, tower);
  state.gold += refund;
  state.occupancy[cellIndex(state.map, tower.cell.cx, tower.cell.cy)] = 0;
  state.towers.splice(index, 1);
  // Selling can break combos on towers that are still standing.
  state.combosDirty = true;

  emit(state, { type: 'towerSold', at: tower.pos, refund });
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
 * Can this tower hurt this enemy AT ALL?
 *
 * Plated units are the one hard wall in the game. A tower with no armor
 * piercing and no burn cannot scratch them, so rather than firing shots that
 * land for nothing it declines to aim in the first place — the Thrower sits
 * still while the Armored column walks past, and "I cannot hurt that" is
 * delivered as something you watch instead of something you read.
 *
 * Two deliberate exemptions:
 *   - burn (`burnDps`), because fire seeps past plating rather than striking
 *     it. This is the Oil Cauldron's whole reason to exist.
 *   - damage-free towers (slowers), which are not trying to hurt anything.
 *     Excluding them would leave an all-Armored wave immune to chills too,
 *     and turn the one wave built to teach the rule into an unanswerable one.
 */
function canHarm(def: (typeof TOWERS)[TowerKind], enemy: Enemy): boolean {
  if (!enemy.plated) return true;
  return def.armorPierce > 0 || def.burnDps > 0 || def.damage <= 0;
}

/**
 * Can a tower of this kind get through plating at all?
 *
 * Exported so the wave-7 briefing and the build bar can name the answers from
 * the balance table instead of from a hand-written list that drifts the first
 * time a tower's armorPierce changes. Slowers are deliberately false: they are
 * allowed to chill an Armored unit, but a chill is not an answer to one.
 */
export function piercesPlating(kind: TowerKind): boolean {
  const def = TOWERS[kind]!;
  return def.armorPierce > 0 || def.burnDps > 0;
}

/**
 * Target selection.
 *
 * `first` — furthest along the path, i.e. closest to leaking. The safe default.
 * `strongest` — most current HP; points slow heavy hitters at the thing worth
 *   hitting instead of whichever runner happened to get ahead.
 * `support` — prefers anything carrying an aura (a Warchief's speed buff, a
 *   Warlord's armor), falling back to `first`. That unit is worth killing
 *   before the pack it is buffing, and nothing else on the board makes that
 *   choice for you.
 *
 * On top of the mode, a SLOWER spreads its work. Left to `first` it re-chills
 * whichever unit is furthest along every single shot, so one enemy crawls and
 * the twenty behind it are untouched. Preferring an un-chilled target — and
 * refusing to shoot the unit it just fired at, whose shot is still in flight —
 * turns a slower from a pin into a sweep, which is also what lets a slow
 * actually expire and lets a second slower contribute something.
 *
 * Every comparison ends in an id tiebreak so selection is deterministic
 * regardless of array order.
 */
function findTarget(state: GameState, tower: Tower, range: number): Enemy | null {
  const def = TOWERS[tower.kind]!;
  // A pure slower: no damage, but it does apply a chill.
  const spreads = def.damage <= 0 && def.slowFactor < 1;

  let best: Enemy | null = null;
  let bestScore = -Infinity;
  const rangeSq = range * range;

  for (const e of state.enemies) {
    if (e.dead) continue;
    if (!canHarm(def, e)) continue;
    const dx = e.pos.x - tower.pos.x;
    const dy = e.pos.y - tower.pos.y;
    if (dx * dx + dy * dy > rangeSq) continue;

    let score: number;
    switch (tower.targetMode) {
      case 'strongest':
        score = e.hp;
        break;
      case 'support':
        // Huge constant bias rather than a separate pass: any aura carrier in
        // range outranks every ordinary unit, and among equals it falls back
        // to progress along the path.
        score = (e.speedAura > 1 || e.armorAura > 0 ? 1e9 : 0) + e.dist;
        break;
      case 'first':
      default:
        score = e.dist;
        break;
    }

    if (spreads) {
      // Both terms dwarf `dist` (the path is a few thousand units long), so
      // they sort the candidates into bands: fresh targets first, then already
      // chilled ones, and the unit we just shot at dead last. Within a band it
      // is still whatever the mode asked for.
      //
      // The repeat penalty deliberately outweighs even the `support` bias, so
      // "never twice in a row" holds unconditionally. A slower with exactly
      // one enemy in reach still fires at it — everything is penalised
      // equally, so the best score is simply a negative one.
      if (e.slowTimer > 0) score -= 1e6;
      if (e.id === tower.lastTargetId) score -= 5e9;
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
  // Once per step at most, and only when the board actually changed.
  if (state.combosDirty) refreshCombos(state);

  for (const tower of state.towers) {
    if (tower.cooldown > 0) tower.cooldown -= dt;
    if (tower.recoil > 0) tower.recoil -= dt;

    const def = TOWERS[tower.kind]!;

    // Economy buildings and Exchangers never target anything. Both are settled
    // on wave clear — see collectIncome in waves.ts — so there is nothing to
    // do per step.
    if (def.goldPerWave > 0 || def.diamondsPerWave > 0) continue;

    // Slowers go through the SAME path as every other shooter now. They aim,
    // reload and lead their target like a Thrower does; the only difference is
    // that their shot carries a chill instead of damage.
    if (def.onPath) {
      updateTrap(state, tower, dt);
      continue;
    }
    updateShooter(state, tower);
  }
}

/**
 * A trap hits everything in reach when it rearms. It cannot miss and cannot
 * overkill a single target, which is what makes it the cheap answer to fast
 * units that shooters struggle to track.
 *
 * Two things make it worth building. Its reach is most of a cell rather than
 * the inscribed half-circle, so a Runner crossing at 108 units/second is
 * actually inside it when it goes off. And it BANKS while unused: charge
 * builds every idle step and the whole store is dumped into the next trigger,
 * so a quiet stretch of road is a saved-up hit instead of wasted gold.
 */
function updateTrap(state: GameState, tower: Tower, dt: number): void {
  if (tower.cooldown > 0) return;

  // Armed and waiting: bank. Deliberately only while rearmed, so charge
  // measures "how long since this last went off" rather than wall time.
  tower.charge = Math.min(TRAPS.maxCharge, tower.charge + TRAPS.chargePerSecond * dt);

  const reach = state.layout.cellSize * TRAPS.reach;
  const reachSq = reach * reach;
  const def = TOWERS[tower.kind]!;
  const combo = comboEffect(tower);
  const damage = towerDamage(state, tower) * (1 + tower.charge);
  const struck: typeof state.enemies = [];

  for (const e of state.enemies) {
    if (e.dead) continue;
    // A Spike Pit under a plated unit does not merely deal nothing — it does
    // not trigger at all, so it visibly sits armed while the column walks over
    // it. Skipping here rather than relying on damageEnemy's guard is what
    // keeps the trap from spending its cooldown and playing its sound on a
    // target it was never going to hurt.
    if (!canHarm(def, e)) continue;
    const dx = e.pos.x - tower.pos.x;
    const dy = e.pos.y - tower.pos.y;
    if (dx * dx + dy * dy > reachSq) continue;
    damageEnemy(state, e, damage, def.armorPierce, tower.id);
    if (def.burnDps > 0) {
      applyBurn(e, def.burnDps * burnMul(state) * combo.burnMul, def.burnSeconds);
    }
    if (def.slowFactor < 1) {
      applySlow(e, towerSlowFactor(tower), towerSlowSeconds(state, tower));
    }
    struck.push(e);
  }

  if (struck.length === 0) return;

  // Tesla chains outward from whatever it hit. Unlike splash this follows the
  // enemies rather than a radius from the tower, so a strung-out line is a
  // better target for it than a tight clump.
  if (def.chainCount > 0) {
    chainFrom(
      state,
      tower,
      struck,
      def.chainCount + combo.chainBonus,
      def.chainRange,
      damage,
      def.armorPierce,
    );
  }

  // The bank is spent, whatever it was worth. Reported on the event so the fx
  // and audio layers can make a fully charged trigger land harder than a
  // routine one — a trap that always sounds the same is a trap you stop
  // noticing, which was half the "traps feel unsatisfying" complaint.
  const spent = tower.charge;
  tower.charge = 0;
  tower.cooldown = 1 / towerFireRate(state, tower);
  tower.recoil = 0.15;
  emit(state, { type: 'trapTriggered', at: tower.pos, kind: tower.kind, charge: spent });
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
  const combo = comboEffect(tower);
  spawnProjectile(state, tower, target, {
    look: PROJECTILE_LOOK[tower.kind],
    damage: towerDamage(state, tower),
    splash: def.splash * splashMul(state),
    armorPierce: def.armorPierce,
    speed: def.projectileSpeed,
    pierce: def.pierce,
    burnDps: def.burnDps * burnMul(state) * combo.burnMul,
    burnSeconds: def.burnSeconds,
    slowFactor: towerSlowFactor(tower),
    slowSeconds: towerSlowSeconds(state, tower),
  });

  // Remembered so a slower can refuse to shoot the same unit twice running.
  // Recorded for every tower rather than only slowers: a field that is only
  // sometimes maintained is a field that lies the moment anything else reads it.
  tower.lastTargetId = target.id;
  tower.cooldown = 1 / towerFireRate(state, tower);
  tower.recoil = 0.12;
  emit(state, { type: 'towerFired', at: tower.pos, kind: tower.kind });
}
