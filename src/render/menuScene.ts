/**
 * The title screen's backdrop: a painted landscape of the game's own world.
 *
 * The menu was one flat gradient with a row of small tower icons floating in
 * the middle of it, which advertised nothing. This is a scene — sun, layered
 * hills, a road winding out of the haze, towers standing along it, and enemies
 * walking down it — and it makes a specific promise about the game behind the
 * buttons, which the old version could not.
 *
 * It is also an argument the game already makes elsewhere, made once more: the
 * three ages read LEFT TO RIGHT across the road, stone through masonry to
 * plated steel, so the title "Ages of Defense" is illustrated rather than
 * merely written.
 *
 * Three rules from the rest of the renderer apply here unchanged:
 *
 * - **Baked, never per-frame.** The sky, hills, road and scatter are a few
 *   thousand shapes; they go into an offscreen canvas once and get blitted.
 *   Only the things that actually move — enemies, dust, the sun's shimmer —
 *   are drawn live. Same pattern as `terrain.ts`, for the same reason.
 * - **Seeded, never `Math.random`.** Its own fixed seed and its own `Rng`, so
 *   the title screen looks identical on every visit. A landscape that
 *   reshuffles itself each time you back out of a run reads as a glitch.
 * - **Wall clock, never sim time.** `main.ts` owns the clock and passes the
 *   elapsed seconds in. Nothing here can touch or depend on a run.
 */

import { WORLD } from '../config/balance';
import { makeRng, nextFloat, nextInt, nextRange, type Rng } from '../core/rng';
import { biomeFor } from './palette';
import { drawTowerArt } from './drawEntities';
import { roundRect } from './hud';

/** Fixed, so the title screen is the same place every time you come back. */
const SCENE_SEED = 0x5cede0;

/**
 * Where the road sits, as a fraction of world height.
 *
 * Composition is in BANDS, and the bands are what make a busy picture readable
 * behind a menu: title at the top, the road and its towers through the middle,
 * and a deliberately empty darkened foreground at the bottom for the buttons
 * to sit on. The first version put the road at 0.66 and the buttons landed on
 * top of it, so the two most important things on the screen — what the game
 * looks like, and how to start it — were fighting for the same pixels.
 */
const HORIZON = 0.30;
const ROAD_Y = 0.46;

interface SceneCache {
  canvas: HTMLCanvasElement;
  quality: number;
}

let cache: SceneCache | null = null;

/**
 * The road's centre line, as a function of x. A shallow double bend rather
 * than a straight band — a straight road reads as a stripe, a bent one reads
 * as a place with distance in it.
 */
function roadY(x: number): number {
  const t = x / WORLD.width;
  return (
    WORLD.height * ROAD_Y +
    Math.sin(t * Math.PI * 1.6 - 0.4) * 46 +
    Math.sin(t * Math.PI * 3.1) * 14
  );
}

/** Road half-width at x — wider in front, narrower toward the haze. */
function roadHalf(x: number): number {
  return 34 + (x / WORLD.width) * 16;
}

export function drawMenuScene(
  ctx: CanvasRenderingContext2D,
  pixelScale: number,
  time: number,
): void {
  const quality = Math.min(2, Math.max(1, pixelScale));
  if (cache === null || Math.abs(cache.quality - quality) > 0.2) cache = bake(quality);
  ctx.drawImage(cache.canvas, 0, 0, WORLD.width, WORLD.height);

  drawLiveLayer(ctx, time);
}

// ---------------------------------------------------------------------------
// The baked half
// ---------------------------------------------------------------------------

function bake(quality: number): SceneCache {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WORLD.width * quality);
  canvas.height = Math.round(WORLD.height * quality);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(quality, quality);

  const rng = makeRng(SCENE_SEED);

  paintSky(ctx);
  paintSun(ctx);
  // Back to front, each layer darker and warmer than the one behind, which is
  // the whole of the depth effect — no perspective maths, just value.
  paintClouds(ctx, rng);
  paintHills(ctx, rng, WORLD.height * HORIZON + 8, '#D2A462', 0.6, 70);
  paintHills(ctx, rng, WORLD.height * HORIZON + 46, '#A87C42', 0.9, 92);
  paintHills(ctx, rng, WORLD.height * HORIZON + 96, '#7E5A2C', 1, 116);
  paintGround(ctx);
  paintRoad(ctx, rng);
  paintScatter(ctx, rng);
  paintTowers(ctx);
  paintAgeLabels(ctx);
  paintForeground(ctx, rng);
  paintVignette(ctx);

  return { canvas, quality };
}

function paintSky(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD.height * HORIZON + 120);
  g.addColorStop(0, '#E9B96B');
  g.addColorStop(0.45, '#EFC178');
  g.addColorStop(1, '#F6D79B');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height * HORIZON + 130);
}

/**
 * A low sun behind the title. Deliberately off-centre and low: centred behind
 * the wordmark it fought with it, and high it stopped reading as evening.
 */
function paintSun(ctx: CanvasRenderingContext2D): void {
  const cx = WORLD.width * 0.78;
  const cy = WORLD.height * HORIZON - 26;

  const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, 300);
  halo.addColorStop(0, 'rgba(255, 244, 214, 0.95)');
  halo.addColorStop(0.35, 'rgba(255, 226, 160, 0.42)');
  halo.addColorStop(1, 'rgba(255, 214, 140, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - 300, cy - 300, 600, 600);

  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 249, 228, 0.9)';
  ctx.fill();
}

/**
 * One ridge line of rolling hills, as a filled polygon walked left to right.
 * The randomness is in the ridge height, which is what makes them read as
 * land rather than as a sine wave.
 */
function paintHills(
  ctx: CanvasRenderingContext2D,
  rng: Rng,
  baseY: number,
  color: string,
  alpha: number,
  amp: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(-20, WORLD.height);
  ctx.lineTo(-20, baseY);

  // Walk a handful of control points and round the corners between them, so
  // the ridge has shoulders instead of spikes.
  const points: { x: number; y: number }[] = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const x = -20 + ((WORLD.width + 40) * i) / steps;
    const y = baseY - nextRange(rng, amp * 0.25, amp);
    points.push({ x, y });
  }
  ctx.lineTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    const p = points[i]!;
    const prev = points[i - 1]!;
    const mx = (prev.x + p.x) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, mx, (prev.y + p.y) / 2);
    ctx.quadraticCurveTo(p.x, p.y, p.x, p.y);
  }
  ctx.lineTo(WORLD.width + 20, WORLD.height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function paintGround(ctx: CanvasRenderingContext2D): void {
  const top = WORLD.height * HORIZON + 70;
  const g = ctx.createLinearGradient(0, top, 0, WORLD.height);
  g.addColorStop(0, '#8A6231');
  g.addColorStop(0.35, '#7A5528');
  g.addColorStop(1, '#3E2913');
  ctx.fillStyle = g;
  ctx.fillRect(0, top, WORLD.width, WORLD.height - top);
}

/** A few flat sunset clouds, stretched wide so they read as distance. */
function paintClouds(ctx: CanvasRenderingContext2D, rng: Rng): void {
  for (let i = 0; i < 7; i++) {
    const cy = nextRange(rng, 60, WORLD.height * HORIZON - 40);
    const cx = nextRange(rng, -100, WORLD.width + 100);
    const w = nextRange(rng, 130, 340);
    const h = nextRange(rng, 9, 19);
    ctx.globalAlpha = nextRange(rng, 0.18, 0.4);
    ctx.fillStyle = '#FFF0CE';
    for (let b = 0; b < 4; b++) {
      ctx.beginPath();
      ctx.ellipse(
        cx + nextRange(rng, -w / 2, w / 2),
        cy + nextRange(rng, -h / 3, h / 3),
        nextRange(rng, w * 0.2, w * 0.42),
        h,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * STONE · MIDDLE · TECH, under their own stretch of road.
 *
 * The lineup already runs in age order, but "these three groups are three
 * different eras" is exactly the kind of thing a player only sees once it is
 * named. It is the title's claim, labelled.
 */
function paintAgeLabels(ctx: CanvasRenderingContext2D): void {
  // On ONE fixed line up in the haze, not each following its own stretch of
  // road. Tracking the road put the middle label directly behind the CONTINUE
  // button, and three captions at three different heights read as debris
  // rather than as a row of headings over the three thirds of the picture.
  const labels: [string, number][] = [
    ['STONE AGE', 250],
    ['MIDDLE AGE', 700],
    ['TECH AGE', 1220],
  ];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '700 21px "IBM Plex Mono", ui-monospace, monospace';
  const y = 262;
  for (const [text, x] of labels) {
    // Each label gets its own dark plate.
    //
    // Shadowed text alone was not enough and could not be: these sit on hills
    // that run from near-white at the sun to deep brown at the edges, so ANY
    // single text colour is invisible over part of its own width. A plate
    // makes the background a constant, which is the only thing that makes a
    // label on a painted scene reliably readable.
    const w = ctx.measureText(text).width + 30;
    ctx.fillStyle = 'rgba(28, 16, 5, 0.62)';
    roundRect(ctx, x - w / 2, y - 20, w, 29, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 232, 180, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#FFEFCD';
    ctx.fillText(text, x, y);
  }
  ctx.restore();
}

/** Darkens the corners so the eye lands in the middle. */
function paintVignette(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createRadialGradient(
    WORLD.width / 2,
    WORLD.height * 0.45,
    WORLD.height * 0.35,
    WORLD.width / 2,
    WORLD.height * 0.45,
    WORLD.width * 0.72,
  );
  g.addColorStop(0, 'rgba(30, 18, 6, 0)');
  g.addColorStop(1, 'rgba(30, 18, 6, 0.42)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
}

/** The track itself, kerbed with scattered stones exactly like the board's. */
function paintRoad(ctx: CanvasRenderingContext2D, rng: Rng): void {
  ctx.beginPath();
  ctx.moveTo(-10, roadY(-10) - roadHalf(-10));
  for (let x = -10; x <= WORLD.width + 10; x += 12) ctx.lineTo(x, roadY(x) - roadHalf(x));
  for (let x = WORLD.width + 10; x >= -10; x -= 12) ctx.lineTo(x, roadY(x) + roadHalf(x));
  ctx.closePath();

  const g = ctx.createLinearGradient(0, WORLD.height * ROAD_Y - 60, 0, WORLD.height * ROAD_Y + 60);
  g.addColorStop(0, '#B08B52');
  g.addColorStop(1, '#8F6C3A');
  ctx.fillStyle = g;
  ctx.fill();

  // Ruts, so the road looks travelled rather than drawn.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(90, 62, 28, 0.28)';
  ctx.lineWidth = 5;
  for (const off of [-14, 12]) {
    ctx.beginPath();
    for (let x = -10; x <= WORLD.width + 10; x += 14) {
      const y = roadY(x) + off + Math.sin(x * 0.03) * 3;
      if (x === -10) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // Kerb stones. Clumped rather than evenly spaced — uniform placement reads
  // as machine-made confetti, which is the same note the board's scatter has.
  for (let x = -10; x <= WORLD.width + 10; x += nextRange(rng, 9, 22)) {
    for (const side of [-1, 1]) {
      if (nextFloat(rng) > 0.82) continue;
      const y = roadY(x) + side * (roadHalf(x) + nextRange(rng, -2, 4));
      const r = nextRange(rng, 2.4, 5.4);
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.78, nextFloat(rng) * Math.PI, 0, Math.PI * 2);
      ctx.fillStyle = nextFloat(rng) > 0.4 ? '#C9C2B2' : '#A79E8C';
      ctx.fill();
      ctx.strokeStyle = 'rgba(48, 34, 16, 0.35)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
}

/** Grass tufts and rock, in clumps, thinning near the road. */
function paintScatter(ctx: CanvasRenderingContext2D, rng: Rng): void {
  const top = WORLD.height * HORIZON + 70;
  const clumps = 46;
  for (let c = 0; c < clumps; c++) {
    const cx = nextRange(rng, -20, WORLD.width + 20);
    const cy = nextRange(rng, top, WORLD.height + 10);
    // Fade density near the track rather than stopping dead at its edge.
    const dist = Math.abs(cy - roadY(cx));
    if (dist < roadHalf(cx) + 10 && nextFloat(rng) > 0.15) continue;
    const n = nextInt(rng, 4, 14);
    for (let i = 0; i < n; i++) {
      const x = cx + nextRange(rng, -46, 46);
      const y = cy + nextRange(rng, -22, 22);
      if (Math.abs(y - roadY(x)) < roadHalf(x) + 4) continue;
      // Everything is smaller further away, which is the only perspective cue
      // the scene needs.
      const depth = (y - top) / (WORLD.height - top);
      const s = 0.4 + depth * 0.9;

      if (nextFloat(rng) > 0.28) {
        ctx.strokeStyle = nextFloat(rng) > 0.5 ? '#6E8A3A' : '#5A7430';
        ctx.lineWidth = 1.4 * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let b = 0; b < 3; b++) {
          const lean = nextRange(rng, -4, 4) * s;
          ctx.moveTo(x + b * 2 * s, y);
          ctx.lineTo(x + b * 2 * s + lean, y - nextRange(rng, 5, 11) * s);
        }
        ctx.stroke();
      } else {
        const r = nextRange(rng, 2, 6) * s;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.7, nextFloat(rng) * Math.PI, 0, Math.PI * 2);
        ctx.fillStyle = '#9E9484';
        ctx.fill();
        ctx.strokeStyle = 'rgba(48, 34, 16, 0.4)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }
  }
}

/**
 * Towers along the road, in age order left to right.
 *
 * Drawn by the same `drawTowerArt` the board uses, at their real proportions,
 * so the title screen advertises the actual game rather than a mock-up of it —
 * and so it can never drift from what the towers look like in play.
 */
function paintTowers(ctx: CanvasRenderingContext2D): void {
  const lineup: { kind: Parameters<typeof drawTowerArt>[1]; x: number; side: number; s: number }[] =
    [
      { kind: 'thrower', x: 120, side: -1, s: 26 },
      { kind: 'heavy', x: 250, side: 1, s: 30 },
      { kind: 'campfire', x: 372, side: -1, s: 26 },
      { kind: 'ballista', x: 560, side: 1, s: 32 },
      { kind: 'siegeCannon', x: 700, side: -1, s: 34 },
      { kind: 'frost', x: 840, side: 1, s: 30 },
      { kind: 'railgun', x: 1070, side: -1, s: 34 },
      { kind: 'singularity', x: 1220, side: 1, s: 36 },
      { kind: 'sniper', x: 1370, side: -1, s: 32 },
    ];

  for (const t of lineup) {
    const age = t.x < 460 ? 0 : t.x < 960 ? 1 : 2;
    const y = roadY(t.x) + t.side * (roadHalf(t.x) + 36);

    // Contact shadow, or the tower looks pasted on rather than standing there.
    ctx.beginPath();
    ctx.ellipse(t.x, y + t.s * 0.5, t.s * 0.85, t.s * 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 26, 10, 0.3)';
    ctx.fill();

    ctx.save();
    ctx.translate(t.x, y);
    drawTowerArt(ctx, t.kind, t.s, -Math.PI / 2, 0, biomeFor(age));
    ctx.restore();
  }
}

/**
 * A darker band across the bottom, so the buttons have something to sit on.
 *
 * This is not decoration — it is the reason the composition works. The buttons
 * are light text on dark panels, and without a deliberately empty, deliberately
 * dark third at the bottom of the picture they would be sitting on grass,
 * stones and a road, which is where the first version put them.
 */
function paintForeground(ctx: CanvasRenderingContext2D, rng: Rng): void {
  // Starts BELOW the tower line, not through it. At 420 the gradient began
  // right where the near-side towers stand and swallowed half the lineup the
  // scene exists to show off.
  const g = ctx.createLinearGradient(0, WORLD.height - 330, 0, WORLD.height);
  g.addColorStop(0, 'rgba(48, 30, 12, 0)');
  g.addColorStop(0.4, 'rgba(44, 28, 11, 0.62)');
  g.addColorStop(1, 'rgba(28, 18, 7, 0.92)');
  ctx.fillStyle = g;
  ctx.fillRect(0, WORLD.height - 330, WORLD.width, 330);

  // A few big out-of-focus rocks right at the bottom edge for depth.
  for (let i = 0; i < 9; i++) {
    const x = nextRange(rng, -40, WORLD.width + 40);
    const y = WORLD.height + nextRange(rng, -18, 26);
    const r = nextRange(rng, 26, 62);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.55, nextRange(rng, -0.3, 0.3), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 22, 8, 0.55)';
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// The live half — only what actually moves
// ---------------------------------------------------------------------------

/** Enemy silhouettes walking the road, and dust in the light. */
function drawLiveLayer(ctx: CanvasRenderingContext2D, time: number): void {
  // A marching column, evenly spaced and looping across the screen. Bodies
  // only — no health bars, no type marks: this is scenery, and a menu that
  // looks like a live fight invites taps that do nothing.
  const n = 9;
  const span = WORLD.width + 200;
  for (let i = 0; i < n; i++) {
    const x = (((time * 42 + (i * span) / n) % span) + span) % span - 100;
    // Kept well inside the kerbs. Strays reading as "off the road" undo the
    // one thing this layer is here to say.
    const y = roadY(x) + Math.sin(i * 2.7) * (roadHalf(x) * 0.45);
    const bob = Math.sin(time * 5 + i) * 1.8;
    const r = 11 + Math.sin(i * 1.3) * 3;

    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.9, r * 0.9, r * 0.34, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(40, 26, 10, 0.28)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y + bob, r, 0, Math.PI * 2);
    ctx.fillStyle = i % 5 === 0 ? '#8C4A34' : '#6E4A2C';
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 20, 8, 0.75)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Dust motes drifting up through the low sun. Cheap, and it stops the whole
  // picture from being completely still behind a static menu.
  ctx.save();
  for (let i = 0; i < 40; i++) {
    const seed = i * 12.9898;
    const baseX = ((Math.sin(seed) * 43758.5453) % 1) * WORLD.width;
    const speed = 8 + ((Math.cos(seed) * 1000) % 10);
    const y = WORLD.height - ((time * speed + i * 90) % (WORLD.height * 0.7));
    const x = baseX + Math.sin(time * 0.5 + i) * 22;
    const a = 0.06 + Math.sin(time + i) * 0.05;
    ctx.globalAlpha = Math.max(0, a);
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF3D2';
    ctx.fill();
  }
  ctx.restore();
}
