/**
 * The title screen.
 *
 * The game used to drop you straight into wave 0 of a fresh run, which made
 * two things impossible: leaving and coming back, and knowing what you were
 * looking at before you were already playing it. A menu is where a run gets a
 * beginning.
 *
 * CONTINUE is the load-bearing half. A run reaches wave 40 over half an hour,
 * and a closed tab used to end it — so the entire game was "however long you
 * can sit still". The button is drawn dead even when there is nothing to
 * resume rather than hidden, because a button that appears and disappears
 * between visits reads as a bug, and its subtitle explains itself.
 *
 * Render rule as everywhere else: reads state, never mutates it. Button rects
 * are exported so `input/` hit-tests exactly what was drawn.
 */

import { WAVES, WORLD } from '../config/balance';
import { COLORS, font } from './palette';
import { roundRect, type Rect } from './hud';
import { drawMenuScene } from './menuScene';
import { biomeFor } from './palette';

export type MenuButtonId = 'new' | 'continue' | 'endless';

const BTN_W = 440;
const BTN_H = 72;
const BTN_GAP = 14;
const FIRST_Y = 500;

/**
 * Two buttons, deliberately. There was a HOW TO PLAY here and it was the wrong
 * shape for this game: a reference sheet read cold, before you have a board to
 * look at, teaches nobody anything. The teaching happens inside the run now —
 * NEW GAME starts an ordinary game that explains itself for the first few
 * waves and gets out of the way the moment you tap the card. Everything the
 * button used to open is still one press of PAUSE away, which is where a
 * player actually wants it: mid-run, with a specific question.
 */
const FINALE_WAVES = WAVES.finalWave;

export const MENU_BUTTONS: { id: MenuButtonId; rect: Rect }[] = (
  ['continue', 'new', 'endless'] as MenuButtonId[]
).map((id, i) => ({
  id,
  rect: {
    x: (WORLD.width - BTN_W) / 2,
    y: FIRST_Y + i * (BTN_H + BTN_GAP),
    w: BTN_W,
    h: BTN_H,
  },
}));

export function drawMainMenu(
  ctx: CanvasRenderingContext2D,
  canContinue: boolean,
  continueLabel: string,
  bestWave: number,
  pixelScale: number,
  time: number,
): void {
  const biome = biomeFor(0);

  // Its own place, not a scrim over a live board. See menuScene.ts — a sunset
  // landscape with the road running through it and the three ages standing
  // along it in order, so the title is illustrated rather than only written.
  drawMenuScene(ctx, pixelScale, time);

  ctx.textAlign = 'center';
  // Dark ink, not the amber accent. Amber on a sunlit sky is amber on amber —
  // the title has to be the highest-contrast thing on the screen, and against
  // a light wash that means going darker rather than brighter. The pale line
  // above it is a bevel, the same carved-stone trick the HUD slabs use.
  //
  // The soft dark pad behind it is doing real work: the scene has clouds, a
  // sun and hills under this text, and dark-on-light stops being readable the
  // moment something light-on-light passes beneath it.
  const pad = ctx.createRadialGradient(WORLD.width / 2, 150, 40, WORLD.width / 2, 150, 560);
  pad.addColorStop(0, 'rgba(60, 38, 14, 0.42)');
  pad.addColorStop(1, 'rgba(60, 38, 14, 0)');
  ctx.fillStyle = pad;
  ctx.fillRect(0, 0, WORLD.width, 340);

  ctx.font = font(76);
  ctx.fillStyle = 'rgba(255, 240, 200, 0.5)';
  ctx.fillText('AGES OF DEFENSE', WORLD.width / 2, 158);
  ctx.fillStyle = '#33220E';
  ctx.fillText('AGES OF DEFENSE', WORLD.width / 2, 161);

  ctx.fillStyle = 'rgba(255, 240, 208, 0.85)';
  ctx.font = font(20);
  ctx.fillText('Three ages. One road. Hold it.', WORLD.width / 2, 201);

  for (const b of MENU_BUTTONS) {
    const enabled = b.id !== 'continue' || canContinue;
    const primary = b.id === (canContinue ? 'continue' : 'new');

    ctx.fillStyle = primary ? 'rgba(74, 61, 36, 0.95)' : 'rgba(26, 21, 15, 0.94)';
    roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 14);
    ctx.fill();
    ctx.strokeStyle = !enabled
      ? 'rgba(255,255,255,0.1)'
      : primary
        ? biome.accent
        : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = primary ? 3 : 2;
    ctx.stroke();

    const label =
      b.id === 'new' ? 'NEW GAME' : b.id === 'continue' ? 'CONTINUE' : 'INFINITE MODE';
    // Every button carries a subtitle, because the two ways to start are a real
    // choice and "NEW GAME" beside "INFINITE MODE" does not say which is which.
    // One ends. One does not. That is the whole distinction and it has to be on
    // the button rather than discovered on wave 60.
    const sub =
      b.id === 'continue'
        ? continueLabel
        : b.id === 'new'
          ? `${FINALE_WAVES} waves, then a final stand`
          : 'no last wave — see how far you get';

    ctx.fillStyle = !enabled ? '#5A5346' : COLORS.text;
    ctx.font = font(26);
    ctx.fillText(label, b.rect.x + b.rect.w / 2, b.rect.y + 34);
    ctx.fillStyle = !enabled ? '#5A5346' : b.id === 'continue' ? biome.accent : '#B9AC93';
    ctx.font = font(15);
    ctx.fillText(sub, b.rect.x + b.rect.w / 2, b.rect.y + 56);
  }

  if (bestWave > 0) {
    ctx.fillStyle = '#F6E7C4';
    ctx.font = font(18);
    ctx.fillText(`best run: wave ${bestWave}`, WORLD.width / 2, WORLD.height - 54);
  }
  // Both footer lines sit on the DEEP end of the gradient, so they go light
  // where the header went dark.
  ctx.fillStyle = 'rgba(255, 240, 214, 0.62)';
  ctx.font = font(15);
  ctx.fillText(
    'a new game teaches itself for the first few waves · tap the card to skip',
    WORLD.width / 2,
    WORLD.height - 26,
  );

  ctx.textAlign = 'left';
}
