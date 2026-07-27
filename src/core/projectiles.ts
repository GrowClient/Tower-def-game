/**
 * Projectiles: flight and impact.
 *
 * Shots home on an entity but remember its last known position, so a shot
 * whose target dies mid-flight still lands somewhere sensible instead of
 * vanishing or chasing a null. That matters for splash: an overkill shot at a
 * dying brute should still catch the runners around it.
 *
 * Piercing shots keep flying after a hit, so they are resolved by sweeping for
 * enemies they touch along the way rather than only at the destination.
 */

import { COMBAT } from '../config/balance';
import { applyBurn, applySlow, damageEnemy } from './enemies';
import type { Enemy, GameState, Projectile, ProjectileLook, Tower } from './types';

interface ShotSpec {
  look: ProjectileLook;
  damage: number;
  splash: number;
  armorPierce: number;
  speed: number;
  pierce: number;
  burnDps: number;
  burnSeconds: number;
  slowFactor: number;
  slowSeconds: number;
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
    look: spec.look,
    pierce: spec.pierce,
    hitIds: [],
    burnDps: spec.burnDps,
    burnSeconds: spec.burnSeconds,
    slowFactor: spec.slowFactor,
    slowSeconds: spec.slowSeconds,
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

    if (p.pierce > 0) {
      // Piercing shots resolve along the way, not at a destination — they are
      // supposed to run through a line of enemies. A shot that only checked
      // its endpoint would sail straight past everything it should have hit.
      const stepX = dist > 0 ? (dx / dist) * travel : travel;
      const stepY = dist > 0 ? (dy / dist) * travel : 0;
      sweepPierce(state, p, stepX, stepY);
      p.pos = { x: p.pos.x + stepX, y: p.pos.y + stepY };
      // Keep flying past the original target until pierce or lifetime runs out.
      if (dist <= travel && !target) p.aimAt = { x: p.pos.x + stepX * 40, y: p.pos.y + stepY * 40 };
      continue;
    }

    if (dist <= Math.max(travel, COMBAT.hitRadius)) {
      p.pos = { ...p.aimAt };
      impact(state, p, target);
      p.dead = true;
      continue;
    }

    p.pos = { x: p.pos.x + (dx / dist) * travel, y: p.pos.y + (dy / dist) * travel };
  }
}

/**
 * Damage every enemy whose body the shot crossed this step. Uses a segment
 * distance rather than a point test, because at 1500 units/second a Railgun
 * moves 25 units per step and would tunnel straight through a 9-unit Swarm.
 */
function sweepPierce(state: GameState, p: Projectile, stepX: number, stepY: number): void {
  for (const e of state.enemies) {
    if (e.dead || p.pierce <= 0) continue;
    if (p.hitIds.includes(e.id)) continue;

    const d = pointSegmentDistance(e.pos.x, e.pos.y, p.pos.x, p.pos.y, p.pos.x + stepX, p.pos.y + stepY);
    if (d > e.radius + COMBAT.hitRadius) continue;

    p.hitIds.push(e.id);
    p.pierce--;
    applyPayload(state, p, e);
  }
  if (p.pierce <= 0) p.dead = true;
}

function impact(state: GameState, p: Projectile, target: Enemy | null): void {
  if (p.splash > 0) {
    const rSq = p.splash * p.splash;
    for (const e of state.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - p.pos.x;
      const dy = e.pos.y - p.pos.y;
      if (dx * dx + dy * dy > rSq) continue;
      applyPayload(state, p, e);
    }
    return;
  }

  if (target && !target.dead) applyPayload(state, p, target);
}

/**
 * Everything a shot does when it lands.
 *
 * The damage check matters: a slower's shot carries zero damage, and
 * `damageEnemy` floors at COMBAT.minDamage — so calling it unconditionally
 * would quietly turn every slower into a (bad) damage tower and spray hit
 * events and impact sounds that belong to weapons.
 */
function applyPayload(state: GameState, p: Projectile, enemy: Enemy): void {
  if (p.slowFactor < 1) applySlow(enemy, p.slowFactor, p.slowSeconds);
  if (p.damage > 0) damageEnemy(state, enemy, p.damage, p.armorPierce, p.ownerId);
  if (p.burnDps > 0) applyBurn(enemy, p.burnDps, p.burnSeconds);
}

function pointSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
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
