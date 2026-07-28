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

import { WORLD } from '../config/balance';
import { COLORS, font } from './palette';
import { roundRect, type Rect } from './hud';
import { drawTowerArt } from './drawEntities';
import { biomeFor } from './palette';

export type MenuButtonId = 'new' | 'continue';

const BTN_W = 420;
const BTN_H = 76;
const BTN_GAP = 18;
const FIRST_Y = 452;

/**
 * Two buttons, deliberately. There was a HOW TO PLAY here and it was the wrong
 * shape for this game: a reference sheet read cold, before you have a board to
 * look at, teaches nobody anything. The teaching happens inside the run now —
 * NEW GAME starts an ordinary game that explains itself for the first few
 * waves and gets out of the way the moment you tap the card. Everything the
 * button used to open is still one press of PAUSE away, which is where a
 * player actually wants it: mid-run, with a specific question.
 */
export const MENU_BUTTONS: { id: MenuButtonId; rect: Rect }[] = (
  ['continue', 'new'] as MenuButtonId[]
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
): void {
  const biome = biomeFor(0);

  // Its own backdrop rather than a scrim over a live board: the menu is a
  // place, not an overlay on top of somewhere else.
  //
  // Warm ochre rather than the near-black it started as. The dark version read
  // as a loading screen — every other surface in this game is sunlit stone and
  // dirt, and the title screen was the one place that looked like a different
  // product. Light at the top, deeper at the bottom, so the dark button panels
  // sit against the strongest part of the wash.
  const grad = ctx.createLinearGradient(0, 0, 0, WORLD.height);
  grad.addColorStop(0, '#D9A85B');
  grad.addColorStop(0.55, '#B07F3F');
  grad.addColorStop(1, '#7A5528');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);

  // A row of the game's own towers, drawn by the same code the board uses, so
  // the title screen advertises the actual art rather than a logo.
  const kinds = ['thrower', 'heavy', 'ballista', 'siegeCannon', 'railgun', 'singularity'] as const;
  kinds.forEach((kind, i) => {
    const x = WORLD.width / 2 + (i - (kinds.length - 1) / 2) * 130;
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.translate(x, 300);
    drawTowerArt(ctx, kind, 30, -Math.PI / 2, 0, biomeFor(Math.floor(i / 2)));
    ctx.restore();
  });

  ctx.textAlign = 'center';
  // Dark ink, not the amber accent. Amber on ochre is amber on amber — the
  // title has to be the highest-contrast thing on the screen, and against a
  // light wash that means going darker rather than brighter. The pale line
  // above it is a bevel, the same carved-stone trick the HUD slabs use.
  ctx.font = font(76);
  ctx.fillStyle = 'rgba(255, 236, 190, 0.45)';
  ctx.fillText('AGES OF DEFENSE', WORLD.width / 2, 158);
  ctx.fillStyle = '#3A2711';
  ctx.fillText('AGES OF DEFENSE', WORLD.width / 2, 161);

  ctx.fillStyle = '#5C4220';
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

    const label = b.id === 'new' ? 'NEW GAME' : 'CONTINUE';
    ctx.fillStyle = !enabled ? '#5A5346' : COLORS.text;
    ctx.font = font(28);
    // Nudged up when there is a subtitle, so the pair sits centred as a block.
    const sub = b.id === 'continue' ? continueLabel : null;
    ctx.fillText(label, b.rect.x + b.rect.w / 2, b.rect.y + (sub ? 36 : 48));
    if (sub) {
      ctx.fillStyle = enabled ? biome.accent : '#5A5346';
      ctx.font = font(16);
      ctx.fillText(sub, b.rect.x + b.rect.w / 2, b.rect.y + 60);
    }
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
