/**
 * Abilities: the things the player does DURING a wave.
 *
 * Everything else in this game is a purchase made in the quiet between waves,
 * which then plays itself. That is most of a tower defence's appeal and all of
 * its weakness — once the board is built there is nothing to do but watch it
 * work or watch it fail. An ability is a decision taken while a wave is
 * already going wrong, and it is the only such decision in the game.
 *
 * Costs are paid in DIAMONDS, which are only ever minted by burning gold (see
 * `mintDiamonds`). That is what keeps the system honest: an ability is never
 * free progress, it is a tower you chose not to build.
 *
 * Two kinds of effect live here, and the split matters:
 *   - INSTANT (a strike) resolves entirely inside `castAbility` and leaves
 *     nothing behind but an event for the fx layer.
 *   - LINGERING (fields, barrages, the horn) becomes an AbilityEffect that
 *     keeps working while the player does something else, which is the whole
 *     reason a field is a different thing from a very large shot.
 */

import {
  ABILITIES,
  DIAMONDS,
  TOWERS,
  type AbilityDef,
  type AbilityKey,
} from '../config/balance';
import { applySlow, damageEnemy } from './enemies';
import { emit } from './events';
import { towerOutputScale } from './towers';
import type { GameState, Tower } from './types';

export function abilityDef(key: AbilityKey): AbilityDef | undefined {
  return ABILITIES.find((a) => a.key === key);
}

/** Seconds of cooldown left, or 0 when ready. */
export function abilityCooldown(state: GameState, key: AbilityKey): number {
  return Math.max(0, state.abilityCooldowns[key] ?? 0);
}

export type AbilityError = 'unknown' | 'lockedAge' | 'tooPoor' | 'cooling' | null;

/**
 * Why a cast would fail, or null if it is legal.
 *
 * Exported so the ability menu can grey out and LABEL a card for the same
 * reason the sim would reject it — the identical "one rule, so what you see is
 * what you get" contract the placement ghost has with `placementError`.
 */
export function abilityError(state: GameState, key: AbilityKey): AbilityError {
  const def = abilityDef(key);
  if (!def) return 'unknown';
  if (def.age > state.age) return 'lockedAge';
  if (abilityCooldown(state, key) > 0) return 'cooling';
  if (state.diamonds < def.cost) return 'tooPoor';
  return null;
}

/**
 * Cast an ability at a point. Called from `applyIntents`, so like every other
 * player action it lands at the START of a step and can never arrive mid-step.
 */
export function castAbility(
  state: GameState,
  key: AbilityKey,
  x: number,
  y: number,
): boolean {
  const def = abilityDef(key);
  if (!def || abilityError(state, key) !== null) {
    emit(state, { type: 'abilityDenied', key });
    return false;
  }

  state.diamonds -= def.cost;
  state.abilityCooldowns[key] = def.cooldown;
  emit(state, { type: 'abilityCast', key, at: { x, y }, radius: def.radius });

  // The horn is board-wide and has no position, so it never becomes a field.
  if (def.kind === 'towerHaste') {
    // Strongest wins and the timer refreshes, rather than multiplying: two
    // horns should be insurance, not a way to break the fire rate curve.
    state.towerHasteMul = Math.max(state.towerHasteMul, def.fireRateMul);
    state.towerHasteTimer = Math.max(state.towerHasteTimer, def.duration);
    return true;
  }

  // A strike is over the instant it is cast. Resolving it here rather than as
  // a zero-duration field keeps "did it hit?" free of any dependence on
  // whether a field gets one tick or two before expiring.
  if (def.kind === 'strike') {
    const rSq = def.radius * def.radius;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - x;
      const dy = e.pos.y - y;
      if (dx * dx + dy * dy > rSq) continue;
      damageEnemy(state, e, def.damage, def.armorPierce, 0);
    }
    return true;
  }

  state.abilityEffects.push({
    id: state.nextEntityId++,
    key,
    pos: { x, y },
    radius: def.radius,
    remaining: def.duration,
    // Barrages land their first tick immediately. Waiting a full interval
    // before doing anything makes an expensive button feel like it misfired.
    tickTimer: 0,
  });
  return true;
}

/**
 * Per-step update: cooldowns, the horn timer, and every running field.
 *
 * Runs BEFORE towers and enemies in the step order, so a Null Field cast this
 * step is already softening its targets when this step's shots land, and a
 * barrage tick happens before the units it hit get to move.
 */
export function updateAbilities(state: GameState, dt: number): void {
  for (const key of Object.keys(state.abilityCooldowns) as AbilityKey[]) {
    const left = state.abilityCooldowns[key];
    if (left !== undefined && left > 0) state.abilityCooldowns[key] = Math.max(0, left - dt);
  }

  if (state.towerHasteTimer > 0) {
    state.towerHasteTimer -= dt;
    if (state.towerHasteTimer <= 0) {
      state.towerHasteTimer = 0;
      state.towerHasteMul = 1;
    }
  }

  // Vulnerability is rebuilt from scratch every step, exactly like the enemy
  // auras and for the same reason: accumulating it would leave a unit
  // permanently soft because of a field that expired twenty seconds ago.
  for (const e of state.enemies) e.vulnerable = 1;

  for (const fx of state.abilityEffects) {
    const def = abilityDef(fx.key);
    if (!def) {
      fx.remaining = 0;
      continue;
    }
    fx.remaining -= dt;
    const rSq = fx.radius * fx.radius;

    if (def.kind === 'barrage') {
      fx.tickTimer -= dt;
      if (fx.tickTimer <= 0 && fx.remaining > 0) {
        fx.tickTimer += def.tickInterval;
        for (const e of state.enemies) {
          if (e.dead) continue;
          const dx = e.pos.x - fx.pos.x;
          const dy = e.pos.y - fx.pos.y;
          if (dx * dx + dy * dy > rSq) continue;
          damageEnemy(state, e, def.damage, def.armorPierce, 0);
        }
        emit(state, { type: 'abilityTick', key: fx.key, at: { ...fx.pos }, radius: fx.radius });
      }
      continue;
    }

    if (fx.remaining <= 0) continue;

    if (def.kind === 'slowField') {
      for (const e of state.enemies) {
        if (e.dead) continue;
        const dx = e.pos.x - fx.pos.x;
        const dy = e.pos.y - fx.pos.y;
        if (dx * dx + dy * dy > rSq) continue;
        // Refreshed every step while inside, and only just long enough to
        // outlive one step. Leaving the field has to un-stick you promptly, or
        // a tar pit becomes a permanent slow on everything that ever crossed it.
        applySlow(e, def.slowFactor, 0.25);
      }
      continue;
    }

    if (def.kind === 'vulnField') {
      for (const e of state.enemies) {
        if (e.dead) continue;
        const dx = e.pos.x - fx.pos.x;
        const dy = e.pos.y - fx.pos.y;
        if (dx * dx + dy * dy > rSq) continue;
        // Strongest wins rather than multiplying, so overlapping two fields is
        // wasted diamonds rather than an exploit.
        e.vulnerable = Math.max(e.vulnerable, def.vulnerableMul);
      }
    }
  }

  // Flag-then-sweep, same as every other entity list in the sim.
  let write = 0;
  for (let read = 0; read < state.abilityEffects.length; read++) {
    const fx = state.abilityEffects[read]!;
    if (fx.remaining > 0) state.abilityEffects[write++] = fx;
  }
  state.abilityEffects.length = write;
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

/**
 * How many diamonds this Exchanger tries to mint per wave.
 *
 * Upgrades and veterancy raise throughput, which is the only reason to ever
 * upgrade one — it has no damage and no range for them to improve. Floored to
 * a whole number because a fractional diamond is not a thing the HUD can say.
 */
export function exchangerOutput(state: GameState, tower: Tower): number {
  const def = TOWERS[tower.kind];
  if (!def || def.diamondsPerWave <= 0) return 0;
  // Reuses the economy building's own scaling so a mine and an Exchanger
  // improve on the same curve rather than on two that drift apart.
  const scaled = towerOutputScale(state, tower) * def.diamondsPerWave;
  return Math.max(1, Math.floor(scaled));
}

/**
 * Convert gold into diamonds for every Exchanger on the board.
 *
 * Called on wave clear, alongside the economy buildings' payout, so both
 * halves of "what my buildings did this wave" arrive in the same beat.
 *
 * Partial conversion is deliberate: an Exchanger that cannot afford its full
 * output mints what it can rather than nothing at all. Silently doing nothing
 * because you were 40 gold short is the kind of thing a player never diagnoses.
 */
export function mintDiamonds(state: GameState): number {
  let minted = 0;
  for (const tower of state.towers) {
    // Switched off means it does nothing and costs nothing — that is the
    // point of the switch. Checked here rather than in exchangerOutput so the
    // panel can still show what it WOULD produce while it is idle.
    if (!tower.enabled) continue;
    const want = exchangerOutput(state, tower);
    if (want <= 0) continue;

    const affordable = Math.min(want, Math.floor(state.gold / DIAMONDS.goldPerDiamond));
    if (affordable <= 0) continue;

    const goldSpent = affordable * DIAMONDS.goldPerDiamond;
    state.gold -= goldSpent;
    state.diamonds += affordable;
    minted += affordable;
    tower.earned += goldSpent;
    emit(state, {
      type: 'diamondsMinted',
      at: { ...tower.pos },
      amount: affordable,
      goldSpent,
    });
  }
  return minted;
}
