/**
 * Enemy spawning, scaling, movement, auras and damage.
 *
 * Movement is a single scalar per enemy (`dist` along the path), so a slow is
 * one multiply and "who is furthest along" is one compare.
 *
 * The six types exist to demand six different answers. The mechanics that make
 * that true — shields that eat whole hits, healers that undo damage, armor
 * that blunts small hits — all live in this file.
 */

import {
  BOSS_MECHANICS,
  BOSS_SCALING,
  BOSSES,
  COMBAT,
  ENEMIES,
  SCALING,
  WAVES,
} from '../config/balance';
import { killReward } from './economy';
import { emit } from './events';
import { sampleAt } from './path';
import type { BossMechanic, Enemy, EnemyKind, GameState } from './types';

// ---------------------------------------------------------------------------
// Per-wave scaling
// ---------------------------------------------------------------------------
// Deliberately three separate curves rather than one HP multiplier: speed and
// armor need to escalate on their own schedules or every wave feels the same
// with bigger numbers.

export function hpMultiplier(wave: number): number {
  const w = Math.max(0, wave - 1);
  return 1 + SCALING.hpLinear * w + SCALING.hpQuadratic * w * w;
}

export function speedMultiplier(wave: number): number {
  const w = Math.max(0, wave - 1);
  return Math.min(SCALING.speedMax, 1 + SCALING.speedLinear * w);
}

export function armorBonus(wave: number): number {
  if (wave < SCALING.armorStartWave) return 0;
  const base = (wave - SCALING.armorStartWave + 1) * SCALING.armorPerWave;
  // A second, steeper ramp once the Tech Age is realistically in play, so
  // armor doesn't quietly stop mattering the moment you own a Gun Turret.
  const late = Math.max(0, wave - SCALING.armorLateStartWave) * SCALING.armorLatePerWave;
  return base + late;
}

/**
 * Which appearance of a boss this is: 1 at wave 10, 2 at wave 20, and so on.
 * Boss strength is keyed off this rather than off the wave number so the curve
 * is stated in the units it is actually about — "the third boss you meet".
 */
export function bossAppearance(wave: number): number {
  return Math.max(1, Math.floor(wave / WAVES.bossEvery));
}

/** Which boss belongs to a boss wave, cycling once the list is exhausted. */
export function bossForWave(wave: number): { kind: EnemyKind; mechanic: BossMechanic } | null {
  if (wave <= 0 || wave % WAVES.bossEvery !== 0) return null;
  const index = (wave / WAVES.bossEvery - 1) % BOSSES.length;
  return BOSSES[index] ?? null;
}

/**
 * A boss's mechanic is a property of WHAT IT IS, not of when it happened to be
 * spawned. Deriving it from the wave number instead meant a boss spawned on any
 * other wave — a future boss rush, a debug spawn, an escort — came out as an
 * inert bag of HP with its behaviour silently missing.
 */
function mechanicFor(kind: EnemyKind): BossMechanic | null {
  return BOSSES.find((b) => b.kind === kind)?.mechanic ?? null;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

export function spawnEnemy(
  state: GameState,
  kind: EnemyKind,
  wave: number,
  startDist = 0,
): Enemy {
  const def = ENEMIES[kind];
  const mechanic = mechanicFor(kind);

  /**
   * Bosses get an extra curve of their own, on top of the per-wave one.
   *
   * The wave curves track how far into the run you are; they do not track how
   * much your BOARD has compounded since the last boss — three upgrade levels,
   * a couple of perks, a whole age of better towers, and now combos. Without a
   * term that grows per boss, the third one walks into a defence built to kill
   * the first and simply falls over.
   */
  const app = mechanic ? bossAppearance(wave) : 1;
  const bossHpMul = mechanic ? Math.pow(BOSS_SCALING.hpGrowth, app - 1) : 1;
  const bossArmor = mechanic ? BOSS_SCALING.armorPerAppearance * (app - 1) : 0;
  const bossAura = mechanic && def.armorAura > 0 ? BOSS_SCALING.auraPerAppearance * (app - 1) : 0;

  const hp = Math.round(def.maxHp * hpMultiplier(wave) * bossHpMul);

  const start = sampleAt(state.path, startDist, 0);
  const enemy: Enemy = {
    id: state.nextEntityId++,
    kind,
    dist: startDist,
    seg: start.segment,
    pos: start.pos,
    dir: start.dir,
    hp,
    maxHp: hp,
    baseSpeed: def.speed * speedMultiplier(wave),
    radius: def.radius,
    armor: def.armor + armorBonus(wave) + bossArmor,
    bounty: killReward(state, def.bounty, wave),
    leak: def.leak,

    slowFactor: 1,
    slowTimer: 0,
    slowImmune: def.slowImmune,

    burnDps: 0,
    burnTimer: 0,

    shield: def.shieldHits,
    maxShield: def.shieldHits,

    healPerSecond: def.healPerSecond,
    healRadius: def.healRadius,

    armorAura: def.armorAura + bossAura,
    armorAuraRadius: def.armorAuraRadius,
    auraArmor: 0,

    mechanic,
    summonsFired: 0,
    // A later Ancient repairs itself more often, so out-damaging it stays the
    // problem it was the first time rather than becoming a formality.
    regenTimer: BOSS_MECHANICS.regenIntervalSec * Math.pow(BOSS_SCALING.regenIntervalDecay, app - 1),
    regenInterval:
      BOSS_MECHANICS.regenIntervalSec * Math.pow(BOSS_SCALING.regenIntervalDecay, app - 1),
    summonCount: BOSS_MECHANICS.summonCount + BOSS_SCALING.summonsPerAppearance * (app - 1),

    flash: 0,
    dead: false,
  };

  state.enemies.push(enemy);
  emit(state, { type: 'enemySpawned', at: { ...enemy.pos } });
  if (mechanic) emit(state, { type: 'bossSpawned', at: { ...enemy.pos }, kind });
  return enemy;
}

// ---------------------------------------------------------------------------
// Per-step update
// ---------------------------------------------------------------------------

export function updateEnemies(state: GameState, dt: number): void {
  applyAuras(state, dt);
  updateBosses(state, dt);

  for (const e of state.enemies) {
    if (e.dead) continue;

    // Slows expire on a timer that auras refresh every step they're in range.
    // Storing an expiry rather than re-deriving it each step means overlapping
    // slowers don't need to know about each other.
    if (e.slowTimer > 0) {
      e.slowTimer -= dt;
      if (e.slowTimer <= 0) e.slowFactor = 1;
    }
    if (e.flash > 0) e.flash -= dt;

    // Burn ticks before movement so a unit that burns to death this step
    // doesn't also get a step of travel out of it.
    if (e.burnTimer > 0) {
      e.burnTimer -= dt;
      tickBurn(state, e, dt);
      if (e.dead) continue;
    }

    e.dist += e.baseSpeed * e.slowFactor * dt;

    if (e.dist >= state.path.length) {
      e.dist = state.path.length;
      leak(state, e);
      continue;
    }

    const s = sampleAt(state.path, e.dist, e.seg);
    e.pos = s.pos;
    e.dir = s.dir;
    e.seg = s.segment;
  }
}

/**
 * Healer and armor auras.
 *
 * `auraArmor` is zeroed and rebuilt from scratch every step rather than being
 * added to and subtracted from. Accumulating it would drift as sources come
 * and go, and a unit could end a run permanently armored by an aura that died
 * twenty seconds ago.
 */
function applyAuras(state: GameState, dt: number): void {
  for (const e of state.enemies) e.auraArmor = 0;

  for (const source of state.enemies) {
    if (source.dead) continue;

    if (source.armorAura > 0) {
      const rSq = source.armorAuraRadius * source.armorAuraRadius;
      for (const target of state.enemies) {
        if (target.dead || target === source) continue;
        if (distSq(source, target) <= rSq) {
          target.auraArmor = Math.max(target.auraArmor, source.armorAura);
        }
      }
    }

    if (source.healPerSecond > 0) {
      const rSq = source.healRadius * source.healRadius;
      const amount = source.healPerSecond * dt;
      for (const target of state.enemies) {
        // A healer never heals itself — otherwise it out-sustains focused fire
        // and the "kill it first" answer stops working.
        if (target.dead || target === source) continue;
        if (target.hp >= target.maxHp) continue;
        if (distSq(source, target) > rSq) continue;

        const before = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + amount);
        // Only announce a heal that crossed a whole HP, or the fx layer gets
        // an event every frame for every unit in range.
        if (Math.floor(target.hp) > Math.floor(before) && Math.floor(target.hp) % 10 === 0) {
          emit(state, { type: 'enemyHealed', at: { ...target.pos } });
        }
      }
    }
  }
}

/** Boss mechanics. Each is a distinct behaviour, not a bigger health bar. */
function updateBosses(state: GameState, dt: number): void {
  // Snapshot the list: summons append to state.enemies mid-loop, and a summon
  // must not itself be processed as a boss this step.
  const bosses = state.enemies.filter((e) => !e.dead && e.mechanic !== null);

  for (const boss of bosses) {
    switch (boss.mechanic) {
      case 'summoner': {
        const fraction = boss.hp / boss.maxHp;
        const thresholds = BOSS_MECHANICS.summonAtHpFraction;
        while (
          boss.summonsFired < thresholds.length &&
          fraction <= thresholds[boss.summonsFired]!
        ) {
          boss.summonsFired++;
          for (let i = 0; i < boss.summonCount; i++) {
            // Spawn behind the boss so the escort has to be fought through,
            // rather than appearing already past your defences.
            const behind = Math.max(
              0,
              boss.dist - BOSS_MECHANICS.summonTrailDistance - i * 12,
            );
            spawnEnemy(state, BOSS_MECHANICS.summonKind, state.wave.number, behind);
          }
        }
        break;
      }

      case 'regenerator': {
        boss.regenTimer -= dt;
        if (boss.regenTimer <= 0) {
          boss.regenTimer = boss.regenInterval;
          boss.shield = Math.min(boss.maxShield, boss.shield + BOSS_MECHANICS.regenShieldRestore);
          boss.hp = Math.min(
            boss.maxHp,
            boss.hp + boss.maxHp * BOSS_MECHANICS.regenHealFraction,
          );
          emit(state, { type: 'enemyHealed', at: { ...boss.pos } });
        }
        break;
      }

      case 'warlord':
        // Entirely passive: slow immunity and the armor aura are handled by
        // applySlow and applyAuras from its stat block.
        break;

      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

/**
 * Apply damage.
 *
 * Order matters. A shield absorbs the ENTIRE hit first — a Boulder's 78 damage
 * strips exactly one layer, the same as a pebble would. That's the whole point:
 * shields punish big slow hits and fold to fire rate.
 *
 * Armor is then subtracted flat and floors at COMBAT.minDamage, so armor blunts
 * many small hits without ever making a tower literally useless.
 */
export function damageEnemy(
  state: GameState,
  enemy: Enemy,
  amount: number,
  armorPierce: number,
  ownerTowerId: number,
): void {
  if (enemy.dead) return;

  if (enemy.shield > 0) {
    enemy.shield--;
    enemy.flash = 0.12;
    emit(state, { type: 'shieldAbsorbed', at: { ...enemy.pos }, remaining: enemy.shield });
    return;
  }

  const effectiveArmor = Math.max(0, enemy.armor + enemy.auraArmor - armorPierce);
  const dealt = Math.max(COMBAT.minDamage, amount - effectiveArmor);

  enemy.hp -= dealt;
  enemy.flash = 0.12;
  emit(state, { type: 'enemyHit', at: { ...enemy.pos }, damage: Math.round(dealt) });

  if (enemy.hp <= 0) kill(state, enemy, ownerTowerId);
}

/** Apply (or refresh) a slow. The strongest active slow wins. */
export function applySlow(enemy: Enemy, factor: number, seconds: number = COMBAT.slowLinger): void {
  if (enemy.slowImmune) return;
  if (enemy.slowTimer <= 0) enemy.slowFactor = factor;
  else enemy.slowFactor = Math.min(enemy.slowFactor, factor);
  // Never shorten an existing, longer slow — a freeze must not be cut short by
  // the aura that keeps re-applying a mild slow on top of it.
  enemy.slowTimer = Math.max(enemy.slowTimer, seconds);
}

/** Freeze solid: a very hard slow for a fixed time. Slow-immune units resist. */
export function applyFreeze(enemy: Enemy, seconds: number): void {
  applySlow(enemy, COMBAT.freezeFactor, seconds);
}

/**
 * Apply a burn. Stacks are collapsed into one: refresh the timer and keep the
 * stronger damage. Tracking every burn independently would multiply bookkeeping
 * for an effect the player reads as a single "it's on fire".
 */
export function applyBurn(enemy: Enemy, dps: number, seconds: number): void {
  if (enemy.dead || dps <= 0) return;
  enemy.burnDps = Math.max(enemy.burnDps, dps);
  enemy.burnTimer = Math.max(enemy.burnTimer, seconds);
}

/**
 * Burn damage bypasses armor. That's deliberate: it is what makes the Oil Fire
 * an answer to Armored, whose whole point is blunting per-hit damage.
 */
function tickBurn(state: GameState, enemy: Enemy, dt: number): void {
  if (enemy.burnDps <= 0) return;
  enemy.hp -= enemy.burnDps * dt;
  if (enemy.burnTimer <= 0) {
    enemy.burnDps = 0;
    enemy.burnTimer = 0;
  }
  if (enemy.hp <= 0) kill(state, enemy, 0);
}

function kill(state: GameState, enemy: Enemy, ownerTowerId: number): void {
  enemy.dead = true;
  state.gold += enemy.bounty;

  const owner = state.towers.find((t) => t.id === ownerTowerId);
  if (owner) owner.kills++;

  emit(state, {
    type: 'enemyKilled',
    at: { ...enemy.pos },
    kind: enemy.kind,
    bounty: enemy.bounty,
  });
  if (enemy.mechanic) {
    emit(state, { type: 'bossKilled', at: { ...enemy.pos }, kind: enemy.kind });
  }
}

function leak(state: GameState, e: Enemy): void {
  e.dead = true;
  state.lives -= e.leak;
  emit(state, { type: 'enemyLeaked', at: { ...e.pos }, livesLost: e.leak });

  if (state.lives <= 0) {
    state.lives = 0;
    state.phase = 'gameover';
    // What actually finished the run — the summary screen reports this.
    state.killedBy = e.kind;
    emit(state, { type: 'gameOver' });
  }
}

/** Filter in place, preserving order. Called once at the end of a step. */
export function removeDeadEnemies(state: GameState): void {
  let write = 0;
  for (let read = 0; read < state.enemies.length; read++) {
    const e = state.enemies[read]!;
    if (!e.dead) state.enemies[write++] = e;
  }
  state.enemies.length = write;
}

function distSq(a: Enemy, b: Enemy): number {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  return dx * dx + dy * dy;
}
