/**
 * The ability tray: a column of cards down the right edge, opened by the
 * diamond button in the top strip.
 *
 * It lives on the right rather than in the bottom bar for a reason. The build
 * bar is a between-waves menu — you read it while nothing is happening. The
 * tray is used mid-wave, with a hand already on the board, so it sits beside
 * the play area instead of under it and never covers the road.
 *
 * Every rect this file draws is exported, so `input/` hit-tests exactly the
 * geometry that was rendered. Same one-source-of-truth rule as the build bar
 * and the tower panel — a button you can click somewhere it isn't drawn is a
 * bug waiting to be reported as "the game ignored me".
 *
 * Render rule: reads state, never mutates it.
 */

import {
  ABILITIES,
  WORLD,
  goldPerDiamond,
  type AbilityDef,
  type AbilityKey,
} from '../config/balance';
import { abilityCooldown, abilityError, abilityPrice } from '../core/abilities';
import type { GameState } from '../core/types';
import type { UiState } from '../uiState';
import { COLORS, font, type Biome } from './palette';
import { roundRect, type Rect } from './hud';

const CARD_W = 306;
const CARD_H = 92;
const CARD_GAP = 8;
const TRAY_PAD = 16;

/** Where the tray sits. Anchored to the right edge, below the HUD strip. */
export const TRAY_X = WORLD.width - CARD_W - TRAY_PAD;
const TRAY_TOP = WORLD.hudTop + 74;

/**
 * One rect per ability, in table order.
 *
 * Computed for ALL abilities rather than only the unlocked ones so a card's
 * position never shifts when an age is advanced. A menu whose items move under
 * the cursor is a menu that gets misclicked.
 */
export const ABILITY_CARDS: { key: AbilityKey; rect: Rect }[] = ABILITIES.map((a, i) => ({
  key: a.key,
  rect: { x: TRAY_X, y: TRAY_TOP + i * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H },
}));

/** The cards actually on screen right now — everything unlocked at this age. */
export function visibleAbilityCards(
  state: GameState,
): { key: AbilityKey; def: AbilityDef; rect: Rect }[] {
  const out: { key: AbilityKey; def: AbilityDef; rect: Rect }[] = [];
  let slot = 0;
  for (const def of ABILITIES) {
    if (def.age > state.age) continue;
    const rect = {
      x: TRAY_X,
      y: TRAY_TOP + slot * (CARD_H + CARD_GAP),
      w: CARD_W,
      h: CARD_H,
    };
    out.push({ key: def.key, def, rect });
    slot++;
  }
  return out;
}

export function drawAbilityTray(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  biome: Biome,
): void {
  if (!ui.abilityMenuOpen) return;

  const cards = visibleAbilityCards(state);
  const height = cards.length * (CARD_H + CARD_GAP) + 84;

  // Backing panel, so cards never have to be read against a moving battlefield.
  ctx.save();
  ctx.fillStyle = 'rgba(10, 16, 22, 0.88)';
  roundRect(ctx, TRAY_X - 12, TRAY_TOP - 64, CARD_W + 24, height, 14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(143, 227, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = font(22);
  ctx.fillStyle = '#8FE3FF';
  ctx.fillText('ABILITIES', TRAY_X, TRAY_TOP - 38);

  // On its own line under the title: at 118px along it sat on top of the "S".
  ctx.font = font(12, 500);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(
    `1 diamond = ${goldPerDiamond(state.age).toLocaleString('en-US')}g in this age`,
    TRAY_X,
    TRAY_TOP - 18,
  );

  for (const { key, def, rect } of cards) {
    drawCard(ctx, state, ui, biome, key, def, rect);
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  biome: Biome,
  key: AbilityKey,
  def: AbilityDef,
  rect: Rect,
): void {
  const err = abilityError(state, key);
  const cooling = abilityCooldown(state, key);
  const armed = ui.armedAbility === key;
  const usable = err === null;

  ctx.fillStyle = armed ? 'rgba(30, 62, 78, 0.96)' : 'rgba(22, 30, 38, 0.94)';
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
  ctx.fill();
  ctx.strokeStyle = armed ? '#8FE3FF' : usable ? 'rgba(143, 227, 255, 0.4)' : 'rgba(255,255,255,0.12)';
  ctx.lineWidth = armed ? 3 : 1.6;
  ctx.stroke();

  // The cooldown sweeps across the card as a filled bar rather than sitting in
  // a corner as a number: "how long until I can do that again" is a thing you
  // want to read at a glance while a wave is on top of you.
  if (cooling > 0) {
    const frac = cooling / def.cooldown;
    ctx.save();
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.clip();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(rect.x, rect.y, rect.w * frac, rect.h);
    ctx.restore();
  }

  drawAbilityIcon(ctx, key, rect.x + 38, rect.y + rect.h / 2, 21, usable);

  ctx.textAlign = 'left';
  ctx.font = font(19);
  ctx.fillStyle = usable ? COLORS.text : COLORS.textDim;
  ctx.fillText(def.label, rect.x + 70, rect.y + 28);

  ctx.font = font(12, 500);
  ctx.fillStyle = COLORS.textDim;
  wrap(ctx, def.detail, rect.x + 70, rect.y + 46, rect.w - 84, 14, 3);

  // Cost, and — when it can't be cast — the reason, in the same corner. The
  // player should never have to guess which of the three gates is closed.
  ctx.textAlign = 'right';
  ctx.font = font(17);
  const label =
    err === 'lockedAge'
      ? 'LOCKED'
      : err === 'cooling'
        ? `${cooling.toFixed(0)}s`
        : // The PRICE, not the list cost: the Cut Stones perk discounts what
          // castAbility actually charges, and a tray that keeps showing the
          // base number is a tray that lies about affordability.
          `${abilityPrice(state, key)}`;
  ctx.fillStyle =
    err === 'tooPoor' ? '#F4664F' : err === null ? '#8FE3FF' : COLORS.textDim;
  ctx.fillText(label, rect.x + rect.w - 12, rect.y + 26);
  if (err === null || err === 'tooPoor') {
    drawAbilityIcon(ctx, null, rect.x + rect.w - 20 - ctx.measureText(label).width, rect.y + 20, 8, err === null);
  }

  ctx.textAlign = 'left';
  void biome;
}

/**
 * One icon per ability, drawn as geometry like everything else in this game.
 *
 * Passing `null` draws the plain diamond used for costs. Each shape is a
 * picture of what the ability DOES — falling rocks, a bubbling pit, a volley,
 * a horn, a beam, a broken grid — because a row of six abstract glyphs is a
 * row the player has to memorise instead of recognise.
 */
export function drawAbilityIcon(
  ctx: CanvasRenderingContext2D,
  key: AbilityKey | null,
  cx: number,
  cy: number,
  r: number,
  bright: boolean,
): void {
  ctx.save();
  ctx.globalAlpha = bright ? 1 : 0.45;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (key === null) {
    ctx.fillStyle = '#8FE3FF';
    gem(ctx, cx, cy, r);
    ctx.restore();
    return;
  }

  switch (key) {
    case 'stoneRain': {
      // Three boulders falling onto a ground line.
      ctx.fillStyle = '#B9A98C';
      for (let i = 0; i < 3; i++) {
        const x = cx + (i - 1) * r * 0.62;
        const y = cy - r * 0.55 + (i % 2) * r * 0.42;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.27, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#7E7059';
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.85, cy + r * 0.72);
      ctx.lineTo(cx + r * 0.85, cy + r * 0.72);
      ctx.stroke();
      break;
    }
    case 'tarPit': {
      // A viscous pool with bubbles rising off it.
      ctx.fillStyle = '#2C2A33';
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.35, r * 0.9, r * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5E5A6E';
      for (const [dx, dy, rr] of [[-0.4, -0.35, 0.2], [0.15, -0.6, 0.15], [0.5, -0.2, 0.12]]) {
        ctx.beginPath();
        ctx.arc(cx + dx! * r, cy + dy! * r, rr! * r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'arrowRain': {
      // A slanted volley, all falling the same way.
      ctx.strokeStyle = '#DCE4E8';
      ctx.lineWidth = r * 0.15;
      for (let i = 0; i < 3; i++) {
        const x = cx + (i - 1) * r * 0.6;
        ctx.beginPath();
        ctx.moveTo(x - r * 0.3, cy - r * 0.75);
        ctx.lineTo(x + r * 0.16, cy + r * 0.55);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + r * 0.16, cy + r * 0.62);
        ctx.lineTo(x - r * 0.02, cy + r * 0.2);
        ctx.lineTo(x + r * 0.36, cy + r * 0.24);
        ctx.closePath();
        ctx.fillStyle = '#DCE4E8';
        ctx.fill();
      }
      break;
    }
    case 'warHorn': {
      // A curved horn with sound rings coming off the bell.
      ctx.strokeStyle = '#F2C24A';
      ctx.lineWidth = r * 0.26;
      ctx.beginPath();
      ctx.arc(cx + r * 0.1, cy + r * 0.2, r * 0.62, Math.PI * 1.15, Math.PI * 1.95);
      ctx.stroke();
      ctx.fillStyle = '#F2C24A';
      ctx.beginPath();
      ctx.moveTo(cx + r * 0.42, cy - r * 0.62);
      ctx.lineTo(cx + r * 0.95, cy - r * 0.95);
      ctx.lineTo(cx + r * 0.92, cy - r * 0.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(242, 194, 74, 0.6)';
      ctx.lineWidth = r * 0.11;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(cx + r * 0.9, cy - r * 0.55, r * (0.28 + i * 0.26), -1.1, 0.5);
        ctx.stroke();
      }
      break;
    }
    case 'orbitalLance': {
      // A beam coming down out of nowhere onto a bright impact point.
      const grad = ctx.createLinearGradient(cx, cy - r, cx, cy + r * 0.7);
      grad.addColorStop(0, 'rgba(190, 250, 255, 0.15)');
      grad.addColorStop(1, 'rgba(190, 250, 255, 0.95)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.2, cy - r);
      ctx.lineTo(cx + r * 0.2, cy - r);
      ctx.lineTo(cx + r * 0.44, cy + r * 0.55);
      ctx.lineTo(cx - r * 0.44, cy + r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#EAFBFF';
      ctx.beginPath();
      ctx.ellipse(cx, cy + r * 0.62, r * 0.75, r * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'nullField': {
      // A dome of broken grid: the ability does not damage, it changes rules.
      ctx.strokeStyle = '#C08AE8';
      ctx.lineWidth = r * 0.13;
      ctx.beginPath();
      ctx.arc(cx, cy + r * 0.25, r * 0.85, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.85, cy + r * 0.25);
      ctx.lineTo(cx + r * 0.85, cy + r * 0.25);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(192, 138, 232, 0.6)';
      ctx.lineWidth = r * 0.09;
      for (const t of [-0.42, 0, 0.42]) {
        ctx.beginPath();
        ctx.moveTo(cx + t * r, cy + r * 0.25);
        ctx.lineTo(cx + t * r * 0.6, cy - r * 0.55);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

function gem(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r);
  ctx.lineTo(cx - r * 0.92, cy - r * 0.22);
  ctx.lineTo(cx - r * 0.54, cy - r * 0.85);
  ctx.lineTo(cx + r * 0.54, cy - r * 0.85);
  ctx.lineTo(cx + r * 0.92, cy - r * 0.22);
  ctx.closePath();
  ctx.fill();
}

/** Left-aligned word wrap, bounded to `maxLines` so a card can't overflow. */
function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(' ');
  let line = '';
  let row = 0;
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && line) {
      ctx.fillText(line, x, y + row * lineHeight);
      row++;
      if (row >= maxLines) return;
      line = word;
    } else {
      line = attempt;
    }
  }
  if (line && row < maxLines) ctx.fillText(line, x, y + row * lineHeight);
}
