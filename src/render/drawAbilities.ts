/**
 * Ability effects on the board: the fields that are currently running, and the
 * targeting preview for one the player is holding.
 *
 * The FIELDS are read straight off `state.abilityEffects`, which is simulation
 * state — the sim owns where a Tar Pit is and how long it has left, because
 * those facts change what happens. Only the flourishes (which way a rock
 * tumbles, where a spark sits) are derived here, and they are derived from the
 * effect's id and position rather than stored, because this file may not write
 * to anything reachable from GameState.
 *
 * Drawn UNDER the entities on purpose: a field is terrain, and a Tar Pit that
 * paints over the units standing in it hides the thing it is doing.
 */

import { abilityDef } from '../core/abilities';
import { inBounds } from '../core/grid';
import { abilityError } from '../core/abilities';
import type { AbilityEffect, GameState } from '../core/types';
import type { UiState } from '../uiState';
import { COLORS, font } from './palette';

/** Fields currently running. Drawn beneath entities — see the file comment. */
export function drawAbilityFields(
  ctx: CanvasRenderingContext2D,
  state: GameState,
): void {
  for (const fx of state.abilityEffects) {
    const def = abilityDef(fx.key);
    if (!def) continue;

    // Everything fades out over its last second, so a field expiring is
    // something you can see coming rather than something that blinks off.
    const fade = Math.min(1, fx.remaining);
    ctx.save();
    ctx.globalAlpha = fade;

    switch (fx.key) {
      case 'stoneRain':
        drawStoneRain(ctx, fx, state.time);
        break;
      case 'arrowRain':
        drawArrowRain(ctx, fx, state.time);
        break;
      case 'tarPit':
        drawTarPit(ctx, fx, state.time);
        break;
      case 'nullField':
        drawNullField(ctx, fx, state.time);
        break;
      default:
        break;
    }
    ctx.restore();
  }
}

/**
 * The War Horn has no position, so it cannot be a field. It is drawn as a
 * pulse along the top of the play area instead — visible without covering the
 * board, and it has to be visible at all or a 65% fire rate buff is an
 * invisible eleven seconds.
 */
export function drawHorn(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.towerHasteTimer <= 0) return;
  const def = abilityDef('warHorn');
  const total = def?.duration ?? 1;
  const frac = Math.max(0, Math.min(1, state.towerHasteTimer / total));

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#F2C24A';
  ctx.font = font(16);
  ctx.textAlign = 'center';
  // Below the wave banner's line, which occupies the same strip for the first
  // 1.6 seconds of every wave — and a horn cast at a wave start is exactly
  // when the two would have overlapped.
  ctx.fillText(
    `WAR HORN  ×${state.towerHasteMul.toFixed(2)} FIRE RATE  ${state.towerHasteTimer.toFixed(1)}s`,
    800,
    196,
  );
  // A draining bar under the label, so the remaining time is readable without
  // reading a number in the middle of a fight.
  ctx.fillStyle = 'rgba(242, 194, 74, 0.28)';
  ctx.fillRect(620, 206, 360, 5);
  ctx.fillStyle = '#F2C24A';
  ctx.fillRect(620, 206, 360 * frac, 5);
  ctx.restore();
  ctx.textAlign = 'left';
}

/**
 * The targeting preview for a held ability: exactly the circle that will be
 * affected, in exactly the place it will land.
 *
 * It calls the same `abilityError` the sim uses to accept or reject the cast,
 * so a green ring can never turn out to be a cast that does nothing.
 */
export function drawAbilityPreview(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
): void {
  const key = ui.armedAbility;
  if (key === null || ui.pointer === null) return;
  const def = abilityDef(key);
  if (!def) return;

  const ok = abilityError(state, key) === null;
  const tint = ok ? '#8FE3FF' : COLORS.buildBad;
  const { x, y } = ui.pointer;

  // A board-wide ability has no place to point at, so it says so in the middle
  // of the screen rather than drawing a zero-radius ring under the cursor.
  if (def.radius <= 0) {
    ctx.save();
    ctx.font = font(20);
    ctx.textAlign = 'center';
    ctx.fillStyle = tint;
    ctx.fillText(`${def.label.toUpperCase()} — AFFECTS THE WHOLE BOARD`, 800, 500);
    ctx.fillText('click anywhere to cast', 800, 528);
    ctx.restore();
    ctx.textAlign = 'left';
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, def.radius, 0, Math.PI * 2);
  ctx.fillStyle = ok ? 'rgba(143, 227, 255, 0.12)' : 'rgba(244, 102, 79, 0.12)';
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Crosshair, so the exact centre is unambiguous on a busy board.
  ctx.beginPath();
  ctx.moveTo(x - 14, y);
  ctx.lineTo(x + 14, y);
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y + 14);
  ctx.stroke();

  ctx.font = font(15);
  ctx.textAlign = 'center';
  ctx.fillStyle = tint;
  ctx.fillText(def.label.toUpperCase(), x, y - def.radius - 12);
  ctx.restore();
  ctx.textAlign = 'left';
  void inBounds;
}

// ---------------------------------------------------------------------------
// Individual field art
// ---------------------------------------------------------------------------

/**
 * Deterministic per-effect jitter.
 *
 * The renderer has no RNG and must not have one, so the scatter inside a field
 * is hashed from the effect's id and the mote's index. Same field, same
 * arrangement, every frame — which is what makes it look like a place rather
 * than like static.
 */
function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function drawStoneRain(ctx: CanvasRenderingContext2D, fx: AbilityEffect, time: number): void {
  // Dust ring on the ground, then boulders dropping into it.
  ctx.fillStyle = 'rgba(140, 122, 96, 0.22)';
  ctx.beginPath();
  ctx.arc(fx.pos.x, fx.pos.y, fx.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(180, 160, 128, 0.5)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  for (let i = 0; i < 14; i++) {
    const ang = hash(fx.id, i) * Math.PI * 2;
    const rad = Math.sqrt(hash(fx.id, i + 40)) * fx.radius;
    const px = fx.pos.x + Math.cos(ang) * rad;
    const py = fx.pos.y + Math.sin(ang) * rad;
    // Each boulder runs its own loop, offset so they don't land in unison.
    const phase = (time * 1.6 + hash(fx.id, i + 90)) % 1;
    const drop = (1 - phase) * 90;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#8B7C63';
    ctx.beginPath();
    ctx.arc(px, py - drop, 6.5 - phase * 2, 0, Math.PI * 2);
    ctx.fill();
    if (phase > 0.88) {
      // Impact puff at the bottom of the fall.
      ctx.globalAlpha = (1 - phase) * 6;
      ctx.fillStyle = 'rgba(210, 196, 168, 0.7)';
      ctx.beginPath();
      ctx.ellipse(px, py, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawArrowRain(ctx: CanvasRenderingContext2D, fx: AbilityEffect, time: number): void {
  ctx.fillStyle = 'rgba(120, 140, 110, 0.16)';
  ctx.beginPath();
  ctx.arc(fx.pos.x, fx.pos.y, fx.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(190, 210, 170, 0.45)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = '#DCE4E8';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const ang = hash(fx.id, i) * Math.PI * 2;
    const rad = Math.sqrt(hash(fx.id, i + 70)) * fx.radius;
    const px = fx.pos.x + Math.cos(ang) * rad;
    const py = fx.pos.y + Math.sin(ang) * rad;
    const phase = (time * 3.1 + hash(fx.id, i + 130)) % 1;
    const drop = (1 - phase) * 120;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    // Slanted, all the same way, so it reads as one volley rather than as rain.
    ctx.moveTo(px - 5, py - drop - 16);
    ctx.lineTo(px, py - drop);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

function drawTarPit(ctx: CanvasRenderingContext2D, fx: AbilityEffect, time: number): void {
  const grad = ctx.createRadialGradient(
    fx.pos.x, fx.pos.y, fx.radius * 0.2,
    fx.pos.x, fx.pos.y, fx.radius,
  );
  grad.addColorStop(0, 'rgba(24, 22, 30, 0.85)');
  grad.addColorStop(1, 'rgba(24, 22, 30, 0.35)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(fx.pos.x, fx.pos.y, fx.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(96, 90, 116, 0.7)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Bubbles surfacing and popping, on their own staggered loops.
  for (let i = 0; i < 11; i++) {
    const ang = hash(fx.id, i) * Math.PI * 2;
    const rad = Math.sqrt(hash(fx.id, i + 30)) * fx.radius * 0.85;
    const phase = (time * 0.7 + hash(fx.id, i + 60)) % 1;
    ctx.globalAlpha = Math.sin(phase * Math.PI) * 0.8;
    ctx.fillStyle = '#5E5A6E';
    ctx.beginPath();
    ctx.arc(
      fx.pos.x + Math.cos(ang) * rad,
      fx.pos.y + Math.sin(ang) * rad,
      2 + phase * 6,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function drawNullField(ctx: CanvasRenderingContext2D, fx: AbilityEffect, time: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(fx.pos.x, fx.pos.y, fx.radius, 0, Math.PI * 2);
  ctx.clip();

  ctx.fillStyle = 'rgba(74, 34, 104, 0.24)';
  ctx.fillRect(fx.pos.x - fx.radius, fx.pos.y - fx.radius, fx.radius * 2, fx.radius * 2);

  // A grid that drifts: the field is doing something to the space itself,
  // which is the read that separates it from every damage circle in the game.
  ctx.strokeStyle = 'rgba(192, 138, 232, 0.4)';
  ctx.lineWidth = 1.4;
  const step = 22;
  const drift = (time * 14) % step;
  ctx.beginPath();
  for (let o = -fx.radius; o <= fx.radius; o += step) {
    ctx.moveTo(fx.pos.x + o + drift, fx.pos.y - fx.radius);
    ctx.lineTo(fx.pos.x + o + drift, fx.pos.y + fx.radius);
    ctx.moveTo(fx.pos.x - fx.radius, fx.pos.y + o + drift);
    ctx.lineTo(fx.pos.x + fx.radius, fx.pos.y + o + drift);
  }
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = 'rgba(214, 168, 250, 0.8)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(fx.pos.x, fx.pos.y, fx.radius, 0, Math.PI * 2);
  ctx.stroke();
}
