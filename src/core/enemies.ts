/**
 * Enemy spawning, scaling, movement and damage.
 *
 * Movement is a single scalar per enemy (`dist` along the path), so a slow is
 * one multiply and "who is furthest along" is one compare.
 */

import { COMBAT, ENEMIES, SCALING } from '../config/balance';
import { killReward } from './economy';
import { emit } from './events';
import { sampleAt } from './path';
import type { Enemy, EnemyKind, GameState } from './types';

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
  return (wave - SCALING.armorStartWave + 1) * SCALING.armorPerWave;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------

export function spawnEnemy(state: GameState, kind: EnemyKind, wave: number): Enemy {
  const def = ENEMIES[kind]!;
  const start = sampleAt(state.path, 0, 0);
  const hp = Math.round(def.maxHp * hpMultiplier(wave));

  const enemy: Enemy = {
    id: state.nextEntityId++,
    kind,
    dist: 0,
    seg: 0,
    pos: start.pos,
    dir: start.dir,
    hp,
    maxHp: hp,
    baseSpeed: def.speed * speedMultiplier(wave),
    radius: def.radius,
    armor: def.armor + armorBonus(wave),
    bounty: killReward(def.bounty, wave),
    leak: def.leak,
    slowFactor: 1,
    slowTimer: 0,
    flash: 0,
    dead: false,
  };
  state.enemies.push(enemy);
  emit(state, { type: 'enemySpawned', at: { ...enemy.pos } });
  return enemy;
}

// ---------------------------------------------------------------------------
// Per-step update
// ---------------------------------------------------------------------------

/**
 * Advance every enemy along the path, then resolve leaks. Enemies are flagged
 * rather than spliced mid-loop so that iteration order — and therefore
 * determinism — never depends on removal timing.
 */
export function updateEnemies(state: GameState, dt: number): void {
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
 * Apply damage. Armor is subtracted flat and floors at COMBAT.minDamage, so an
 * armored enemy blunts many small hits without ever making a tower literally
 * useless — that's what makes armor a puzzle rather than a wall.
 */
export function damageEnemy(
  state: GameState,
  enemy: Enemy,
  amount: number,
  armorPierce: number,
  ownerTowerId: number,
): void {
  if (enemy.dead) return;

  const effectiveArmor = Math.max(0, enemy.armor - armorPierce);
  const dealt = Math.max(COMBAT.minDamage, amount - effectiveArmor);

  enemy.hp -= dealt;
  enemy.flash = 0.12;
  emit(state, { type: 'enemyHit', at: { ...enemy.pos }, damage: Math.round(dealt) });

  if (enemy.hp <= 0) kill(state, enemy, ownerTowerId);
}

/** Apply (or refresh) a slow. The strongest active slow wins. */
export function applySlow(enemy: Enemy, factor: number): void {
  if (factor < enemy.slowFactor || enemy.slowTimer <= 0) enemy.slowFactor = factor;
  else enemy.slowFactor = Math.min(enemy.slowFactor, factor);
  enemy.slowTimer = COMBAT.slowLinger;
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
