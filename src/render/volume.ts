/**
 * The music volume slider.
 *
 * One widget, two homes: the title screen and the GAME tab of the pause menu.
 * They are the two places a player is already stopped and reading, and they are
 * the two places the question "can I turn the music down" actually gets asked —
 * once before starting, once mid-run when a wave is loud.
 *
 * Deliberately separate from SOUND: ON/OFF. That button silences everything,
 * effects included, which is the wrong answer to "the theme is a bit loud". A
 * player who has to mute the game to quiet the music ends up playing without
 * hit feedback, which is worse than playing without a soundtrack.
 *
 * Geometry is exported and shared, so `input/` hit-tests exactly the rect that
 * was drawn — the same one-source-of-truth rule as the build bar and the tray.
 * The hit rect is deliberately TALLER than the groove: a 6px-high line is not a
 * touch target, and a slider you have to hit precisely is a slider people give
 * up on.
 *
 * Render rule as everywhere else: reads state, never mutates it.
 */

import { WORLD } from '../config/balance';
import { COLORS, font } from './palette';
import { roundRect, type Rect } from './hud';
import type { Biome } from './palette';

const SLIDER_W = 440;
/** The full touch target. The groove drawn inside it is a fraction of this. */
const SLIDER_H = 56;

function sliderRect(y: number): Rect {
  return { x: (WORLD.width - SLIDER_W) / 2, y, w: SLIDER_W, h: SLIDER_H };
}

/** Under the three title-screen buttons, above the footer lines. */
export const MENU_VOLUME_SLIDER = sliderRect(758);

/** Under the six pause buttons, which end at y = 658. */
export const PAUSE_VOLUME_SLIDER = sliderRect(682);

/** Where the groove itself lives inside the (much taller) hit rect. */
function groove(rect: Rect): { x: number; y: number; w: number } {
  return { x: rect.x + 12, y: rect.y + rect.h - 16, w: rect.w - 24 };
}

/**
 * The volume a press at this x means.
 *
 * Clamped rather than ignored outside the groove: dragging past the end of a
 * slider should pin it to the end, not drop the drag, and a finger tracking a
 * knob routinely leaves the rect it started in.
 */
export function volumeFromX(rect: Rect, x: number): number {
  const g = groove(rect);
  return Math.max(0, Math.min(1, (x - g.x) / g.w));
}

export function drawVolumeSlider(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  volume: number,
  biome: Biome,
  /** Dimmed when there is no track to hear — see musicLoaded(). */
  active: boolean,
): void {
  const g = groove(rect);
  const knobX = g.x + g.w * volume;
  const accent = active ? biome.accent : 'rgba(255,255,255,0.22)';

  ctx.textAlign = 'left';
  ctx.font = font(16);
  ctx.fillStyle = active ? COLORS.textDim : '#5A5346';
  ctx.fillText('MUSIC VOLUME', rect.x + 12, rect.y + 20);

  ctx.textAlign = 'right';
  ctx.fillStyle = active ? accent : '#5A5346';
  // A percentage, not a bare bar. "Off" is a state worth naming, because a
  // slider dragged to the left end looks identical to a slider that is broken.
  ctx.fillText(volume <= 0.001 ? 'OFF' : `${Math.round(volume * 100)}%`, rect.x + rect.w - 12, rect.y + 20);

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  roundRect(ctx, g.x, g.y - 3, g.w, 6, 3);
  ctx.fill();

  ctx.fillStyle = accent;
  roundRect(ctx, g.x, g.y - 3, Math.max(6, knobX - g.x), 6, 3);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(knobX, g.y, 11, 0, Math.PI * 2);
  ctx.fillStyle = active ? '#F6E7C4' : '#6A6152';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.textAlign = 'left';
}
