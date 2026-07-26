/**
 * Enemy spawning and movement.
 *
 * Slice 1 has a single placeholder "grunt" so we can watch the generated path
 * work. Slice 4 replaces this with the six real types; the movement code here
 * is already shaped for that (speed is read per-step so slows can multiply it).
 */

import { ENEMIES } from '../config/balance';
import { emit } from './events';
import { sampleAt } from './path';
import type { Enemy, EnemyKind, GameState } from './types';

export function spawnEnemy(state: GameState, kind: EnemyKind): Enemy {
  const def = ENEMIES[kind];
  const start = sampleAt(state.path, 0, 0);
  const enemy: Enemy = {
    id: state.nextEntityId++,
    kind,
    dist: 0,
    seg: 0,
    pos: start.pos,
    dir: start.dir,
    hp: def.maxHp,
    maxHp: def.maxHp,
    baseSpeed: def.speed,
    radius: def.radius,
    armor: def.armor,
    bounty: def.bounty,
    leak: def.leak,
    dead: false,
  };
  state.enemies.push(enemy);
  emit(state, { type: 'enemySpawned', at: { ...enemy.pos } });
  return enemy;
}

/**
 * Advance every enemy along the path by one fixed timestep, then resolve
 * leaks. Enemies are flagged rather than spliced mid-loop so that iteration
 * order — and therefore determinism — never depends on removal timing.
 */
export function updateEnemies(state: GameState, dt: number): void {
  for (const e of state.enemies) {
    if (e.dead) continue;

    // Speed is recomputed per step rather than stored, so status effects
    // (slow, root, haste) can just multiply into it in later slices.
    const speed = effectiveSpeed(e);
    e.dist += speed * dt;

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

  removeDead(state);
}

export function effectiveSpeed(e: Enemy): number {
  return e.baseSpeed;
}

function leak(state: GameState, e: Enemy): void {
  e.dead = true;
  state.lives -= e.leak;
  emit(state, { type: 'enemyLeaked', at: { ...e.pos }, livesLost: e.leak });
  if (state.lives <= 0) {
    state.lives = 0;
    state.phase = 'gameover';
    emit(state, { type: 'gameOver' });
  }
}

function removeDead(state: GameState): void {
  // Filter in place, preserving order — cheap and keeps array identity stable.
  let write = 0;
  for (let read = 0; read < state.enemies.length; read++) {
    const e = state.enemies[read]!;
    if (!e.dead) state.enemies[write++] = e;
  }
  state.enemies.length = write;
}
