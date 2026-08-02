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
import { MENU_VOLUME_SLIDER, drawVolumeSlider } from './volume';

export type MenuButtonId = 'new' | 'continue' | 'endless';

const BTN_W = 420;
const BTN_H = 66;
const BTN_GAP = 12;
const FIRST_Y = 516;

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

/**
 * The title, set as a lockup rather than as a line of text.
 *
 * It used to be the game's UI font — `ui-monospace` — at 76px. A monospace
 * face is right for a HUD, where columns of numbers have to line up and a
 * glyph has to be unmistakable at a glance, and it is wrong for a title, where
 * it reads as a terminal prompt rather than as a name. A heavy serif carries
 * the three-ages-of-history idea the whole game is built on, and Georgia is on
 * essentially every machine, so this costs no download and breaks the project's
 * no-assets rule not at all.
 *
 * Drawn glyph by glyph because the treatment needs it: canvas `letterSpacing`
 * is recent enough to be missing on browsers people still use, and laying the
 * characters out by hand also gives each one its own shadow, bevel and
 * gradient rather than one gradient smeared across the whole string.
 */
const TITLE = 'AGES OF DEFENSE';
const TITLE_SIZE = 82;
const TITLE_TRACKING = 5;

function drawTitle(ctx: CanvasRenderingContext2D, cx: number, baseline: number): void {
  ctx.save();
  ctx.font = `700 ${TITLE_SIZE}px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const widths = [...TITLE].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + TITLE_TRACKING * (TITLE.length - 1);
  let x = cx - total / 2;

  // Warm gold, lit from above, in LOCAL coordinates so the ramp is the same
  // for every glyph instead of stretching across the whole line.
  const grad = ctx.createLinearGradient(0, baseline - TITLE_SIZE, 0, baseline + 6);
  grad.addColorStop(0, '#FFF3D2');
  grad.addColorStop(0.42, '#F2C368');
  grad.addColorStop(1, '#B87B2C');

  for (let i = 0; i < TITLE.length; i++) {
    const ch = TITLE[i]!;
    if (ch !== ' ') {
      // Cast shadow first, offset down-right, so the letters sit ON the sky
      // rather than floating in front of it.
      ctx.fillStyle = 'rgba(46, 26, 6, 0.42)';
      ctx.fillText(ch, x + 5, baseline + 6);

      // A dark cut around every glyph. The sky behind runs from near-white at
      // the sun to deep amber at the edges, and gold on either of those is
      // gold on gold — the outline is what makes one treatment work across the
      // whole width.
      ctx.lineJoin = 'round';
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#2B1A06';
      ctx.strokeText(ch, x, baseline);

      ctx.fillStyle = grad;
      ctx.fillText(ch, x, baseline);

      // Top bevel: a sliver of near-white along the upper edge, the same
      // carved-stone trick the HUD slabs use.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - 10, baseline - TITLE_SIZE - 10, widths[i]! + 20, TITLE_SIZE * 0.34);
      ctx.clip();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(255, 248, 226, 0.75)';
      ctx.strokeText(ch, x, baseline - 1.5);
      ctx.restore();
    }
    x += widths[i]! + TITLE_TRACKING;
  }
  ctx.restore();
}

export function drawMainMenu(
  ctx: CanvasRenderingContext2D,
  canContinue: boolean,
  continueLabel: string,
  bestWave: number,
  pixelScale: number,
  time: number,
  musicVolume: number,
  musicAvailable: boolean,
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

  drawTitle(ctx, WORLD.width / 2, 152);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(58, 36, 12, 0.9)';
  ctx.font = '600 19px Georgia, "Times New Roman", serif';
  ctx.fillText('THREE AGES  ·  ONE ROAD  ·  HOLD IT', WORLD.width / 2, 196);

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

  // On its own dark plate: the slider sits over the sunlit road, and a thin
  // groove drawn straight onto that has nothing to be seen against.
  ctx.fillStyle = 'rgba(26, 21, 15, 0.72)';
  roundRect(
    ctx,
    MENU_VOLUME_SLIDER.x,
    MENU_VOLUME_SLIDER.y - 2,
    MENU_VOLUME_SLIDER.w,
    MENU_VOLUME_SLIDER.h,
    12,
  );
  ctx.fill();
  drawVolumeSlider(ctx, MENU_VOLUME_SLIDER, musicVolume, biome, musicAvailable);
  ctx.textAlign = 'center';

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
