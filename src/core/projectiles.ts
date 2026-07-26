/**
 * Projectiles: flight and impact.
 *
 * Shots home on an entity but remember its last known position, so a shot
 * whose target dies mid-flight still lands somewhere sensible instead of
 * vanishing or chasing a null. That matters for splash: an overkill shot at a
 * dying brute should still catch the runners around it.
 */

import { COMBAT } from '../config/balance';
import { damageEnemy } from './enemies';
import type { Enemy, GameState, Projectile, Tower } from './types';

interface ShotSpec {
  damage: number;
  splash: number;
  armorPierce: number;
  speed: number;
}

export function spawnProjectile(
  state: GameState,
  tower: Tower,
  target: Enemy,
  spec: ShotSpec,
): void {
  state.projectiles.push({
    id: state.nextEntityId++,
    pos: { ...tower.pos },
    targetId: target.id,
    aimAt: { ...target.pos },
    speed: spec.speed,
    damage: spec.damage,
    splash: spec.splash,
    armorPierce: spec.armorPierce,
    ownerId: tower.id,
    life: COMBAT.projectileLifetime,
    dead: false,
  });
}

export function updateProjectiles(state: GameState, dt: number): void {
  for (const p of state.projectiles) {
    if (p.dead) continue;

    p.life -= dt;
    if (p.life <= 0) {
      p.dead = true;
      continue;
    }

    // Re-acquire the live target each step so the shot tracks; if it's gone,
    // aimAt still holds where it last was.
    const target = findEnemy(state, p.targetId);
    if (target) p.aimAt = target.pos;

    const dx = p.aimAt.x - p.pos.x;
    const dy = p.aimAt.y - p.pos.y;
    const dist = Math.hypot(dx, dy);
    const travel = p.speed * dt;

    if (dist <= Math.max(travel, COMBAT.hitRadius)) {
      p.pos = { ...p.aimAt };
      impact(state, p, target);
      p.dead = true;
      continue;
    }

    p.pos = { x: p.pos.x + (dx / dist) * travel, y: p.pos.y + (dy / dist) * travel };
  }
}

function impact(state: GameState, p: Projectile, target: Enemy | null): void {
  if (p.splash > 0) {
    const rSq = p.splash * p.splash;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - p.pos.x;
      const dy = e.pos.y - p.pos.y;
      if (dx * dx + dy * dy <= rSq) damageEnemy(state, e, p.damage, p.armorPierce, p.ownerId);
    }
    return;
  }

  if (target && !target.dead) damageEnemy(state, target, p.damage, p.armorPierce, p.ownerId);
}

function findEnemy(state: GameState, id: number): Enemy | null {
  for (const e of state.enemies) {
    if (e.id === id && !e.dead) return e;
  }
  return null;
}

export function removeDeadProjectiles(state: GameState): void {
  let write = 0;
  for (let read = 0; read < state.projectiles.length; read++) {
    const p = state.projectiles[read]!;
    if (!p.dead) state.projectiles[write++] = p;
  }
  state.projectiles.length = write;
}
