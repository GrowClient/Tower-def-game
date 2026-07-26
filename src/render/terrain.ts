/**
 * Procedural terrain.
 *
 * The board should *read* as its age without a label on it: stone age is an
 * overgrown meadow worn through by a dirt track, littered with rock and
 * standing stones. None of that comes from an image file — it's a few thousand
 * tiny shapes scattered by a seeded RNG.
 *
 * Two things make this cheap enough to be worth doing:
 *
 * 1. **It is baked once per run into an offscreen canvas** and blitted every
 *    frame. Scattering ~4000 shapes at 60fps would be absurd; scattering them
 *    once and copying one bitmap is nothing.
 * 2. **It is derived from the run seed**, not from `Math.random()`, so the same
 *    `?seed=` gives the same meadow — a reported bug looks identical for me.
 *
 * Render rule holds: this reads GameState and never writes to it. The bake
 * cache lives here, in the render layer, not on GameState.
 */

import { WORLD } from '../config/balance';
import { makeRng, nextFloat, nextInt, nextRange, type Rng } from '../core/rng';
import type { GameState, Path, Vec2 } from '../core/types';
import { biomeFor, COLORS, type Biome } from './palette';

interface TerrainCache {
  canvas: HTMLCanvasElement;
  seed: number;
  ageIndex: number;
  quality: number;
}

let cache: TerrainCache | null = null;

/**
 * Blit the baked terrain, re-baking only when the run, the age or the display
 * resolution has actually changed.
 */
export function drawTerrain(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ageIndex: number,
  pixelScale: number,
): void {
  // Bake at roughly the resolution we're displayed at, clamped: below 1 the
  // grit turns to mush, above 2 we're paying for detail nobody can see.
  const quality = Math.min(2, Math.max(1, pixelScale));

  const stale =
    cache === null ||
    cache.seed !== state.seed ||
    cache.ageIndex !== ageIndex ||
    Math.abs(cache.quality - quality) > 0.2;

  if (stale) cache = bake(state, ageIndex, quality);

  ctx.drawImage(cache!.canvas, 0, 0, WORLD.width, WORLD.height);
}

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------

function bake(state: GameState, ageIndex: number, quality: number): TerrainCache {
  const biome = biomeFor(ageIndex);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WORLD.width * quality);
  canvas.height = Math.round(WORLD.height * quality);

  const g = canvas.getContext('2d')!;
  g.scale(quality, quality);

  // Terrain decoration is visual only, so it gets its own RNG stream seeded
  // from the run seed. Mixing in a constant keeps it from marching in lockstep
  // with anything the simulation rolls.
  const rng = makeRng((state.seed ^ 0x5eed1e5) >>> 0);

  const band = state.layout.cellSize * 0.55; // keep scatter clear of the track
  const halfWidth = state.layout.cellSize * 0.5;
  const field = buildDistField(state.path);

  groundBase(g, biome, rng);
  scatterVegetation(g, field, biome, rng, band);
  scatterRocks(g, field, biome, rng, band);
  scatterProps(g, field, biome, rng, band);
  drawTrack(g, state.path, biome, rng, halfWidth);
  vignette(g);

  return { canvas, seed: state.seed, ageIndex, quality };
}

/** Flat fill plus soft mottling, so the ground isn't one dead colour. */
function groundBase(g: CanvasRenderingContext2D, biome: Biome, rng: Rng): void {
  g.fillStyle = biome.ground;
  g.fillRect(0, 0, WORLD.width, WORLD.height);

  // Radial gradients give soft-edged patches without needing a blur filter.
  for (let i = 0; i < 150; i++) {
    const x = nextRange(rng, -100, WORLD.width + 100);
    const y = nextRange(rng, -60, WORLD.height + 60);
    const r = nextRange(rng, 50, 210);
    const light = nextFloat(rng) < 0.5;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const tone = light ? biome.groundLight : biome.groundDark;
    grad.addColorStop(0, hexToRgba(tone, light ? 0.34 : 0.42));
    grad.addColorStop(1, hexToRgba(tone, 0));
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // A handful of bare-earth scuffs where the grass has worn through.
  for (let i = 0; i < 26; i++) {
    const x = nextRange(rng, 0, WORLD.width);
    const y = nextRange(rng, 0, WORLD.height);
    const r = nextRange(rng, 18, 60);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, hexToRgba(biome.pathEdge, 0.3));
    grad.addColorStop(1, hexToRgba(biome.pathEdge, 0));
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

/**
 * Vegetation, scattered in CLUMPS rather than uniformly.
 *
 * This is the difference between terrain and confetti: uniform random scatter
 * has no visual rhythm, so the eye immediately reads it as machine-generated
 * noise. Real ground grows in patches with bare gaps between them, so we pick
 * clump centres and grow a handful of tufts around each.
 */
function scatterVegetation(
  g: CanvasRenderingContext2D,
  field: DistField,
  biome: Biome,
  rng: Rng,
  band: number,
): void {
  if (biome.tuft.length === 0 || biome.tuftDensity <= 0) return;

  const area = (WORLD.width * WORLD.height) / 1000;
  g.lineCap = 'round';

  const clumps = Math.round(area * biome.tuftDensity * 0.22);
  for (let c = 0; c < clumps; c++) {
    const cxp = nextRange(rng, 0, WORLD.width);
    const cyp = nextRange(rng, 0, WORLD.height);
    const spread = nextRange(rng, 14, 46);
    const n = nextInt(rng, 4, 16);
    for (let i = 0; i < n; i++) {
      // Two summed uniforms approximate a bell curve, so tufts bunch toward
      // the clump centre and thin out at its edge.
      const x = cxp + (nextRange(rng, -1, 1) + nextRange(rng, -1, 1)) * spread;
      const y = cyp + (nextRange(rng, -1, 1) + nextRange(rng, -1, 1)) * spread * 0.7;
      if (x < 4 || y < 4 || x > WORLD.width - 4 || y > WORLD.height - 4) continue;
      if (!clearOfPath(field, x, y, band, rng)) continue;
      tuft(g, x, y, nextRange(rng, 4, 10), biome.tuft[nextInt(rng, 0, biome.tuft.length - 1)]!, rng);
    }
  }

  // A thin uniform sprinkle on top, so the gaps between clumps aren't bald.
  const strays = Math.round(area * biome.tuftDensity * 0.5);
  for (let i = 0; i < strays; i++) {
    const x = nextRange(rng, 4, WORLD.width - 4);
    const y = nextRange(rng, 4, WORLD.height - 4);
    if (!clearOfPath(field, x, y, band, rng)) continue;
    tuft(g, x, y, nextRange(rng, 3, 7), biome.tuft[nextInt(rng, 0, biome.tuft.length - 1)]!, rng);
  }

  // Shrubs: denser mounds that break up the flat green.
  for (let i = 0; i < 46; i++) {
    const x = nextRange(rng, 20, WORLD.width - 20);
    const y = nextRange(rng, 20, WORLD.height - 20);
    if (fieldAt(field, x, y) < band * 1.5) continue;
    shrub(g, x, y, nextRange(rng, 9, 18), biome, rng);
  }
}

/**
 * Keep scatter off the track — but fade out over a margin rather than stopping
 * dead at the edge. A hard boundary is exactly what makes procedural scatter
 * look stamped on.
 */
function clearOfPath(
  field: DistField,
  x: number,
  y: number,
  band: number,
  rng: Rng,
): boolean {
  const d = fieldAt(field, x, y);
  if (d < band) return false;
  if (d < band * 2 && nextFloat(rng) < 0.55) return false;
  return true;
}

/** A low mound of overlapping blobs with a lit crown. */
function shrub(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  biome: Biome,
  rng: Rng,
): void {
  g.beginPath();
  g.ellipse(x, y + r * 0.42, r * 1.05, r * 0.4, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0, 0, 0, 0.28)';
  g.fill();

  const dark = biome.tuft[biome.tuft.length - 1]!;
  const lit = biome.tuft[0]!;
  for (let i = 0; i < 5; i++) {
    const ox = nextRange(rng, -r * 0.6, r * 0.6);
    const oy = nextRange(rng, -r * 0.35, r * 0.3);
    g.beginPath();
    g.arc(x + ox, y + oy, r * nextRange(rng, 0.45, 0.7), 0, Math.PI * 2);
    g.fillStyle = dark;
    g.fill();
  }
  for (let i = 0; i < 3; i++) {
    const ox = nextRange(rng, -r * 0.4, r * 0.35);
    const oy = nextRange(rng, -r * 0.5, -r * 0.05);
    g.beginPath();
    g.arc(x + ox, y + oy, r * nextRange(rng, 0.28, 0.45), 0, Math.PI * 2);
    g.fillStyle = lit;
    g.fill();
  }
}

/** Three splayed blades. Small and repeated is what sells it, not detail. */
function tuft(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  color: string,
  rng: Rng,
): void {
  const lean = nextRange(rng, -0.35, 0.35);
  g.strokeStyle = color;
  g.lineWidth = nextRange(rng, 1.1, 1.9);
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x - h * 0.4 + lean * h, y - h * 0.85);
  g.moveTo(x, y);
  g.lineTo(x + lean * h, y - h * 1.2);
  g.moveTo(x, y);
  g.lineTo(x + h * 0.4 + lean * h, y - h * 0.8);
  g.stroke();
}

function scatterRocks(
  g: CanvasRenderingContext2D,
  field: DistField,
  biome: Biome,
  rng: Rng,
  band: number,
): void {
  for (let i = 0; i < 260; i++) {
    const x = nextRange(rng, 6, WORLD.width - 6);
    const y = nextRange(rng, 6, WORLD.height - 6);
    if (fieldAt(field, x, y) < band) continue;
    // Mostly pebbles, occasionally a boulder — a uniform size reads as noise,
    // a mix reads as terrain.
    const r = nextFloat(rng) < 0.88 ? nextRange(rng, 2, 5) : nextRange(rng, 8, 17);
    rock(g, x, y, r, biome, rng);
  }
}

/** Irregular polygon with a lit top facet and a contact shadow. */
function rock(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  biome: Biome,
  rng: Rng,
): void {
  const sides = nextInt(rng, 5, 7);
  const pts: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + nextRange(rng, -0.25, 0.25);
    const rr = r * nextRange(rng, 0.72, 1.15);
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * 0.82 });
  }

  // Contact shadow first, so the rock sits on the ground rather than floating.
  // Not worth the fill on pebbles, which are too small to read as raised.
  if (r > 3) {
    g.beginPath();
    g.ellipse(x, y + r * 0.5, r * 1.05, r * 0.42, 0, 0, Math.PI * 2);
    g.fillStyle = 'rgba(0, 0, 0, 0.28)';
    g.fill();
  }

  poly(g, pts);
  g.fillStyle = biome.rock;
  g.fill();

  // Lit facet: the same silhouette shrunk toward the upper-left. Scaling the
  // polygon keeps it inside the outline for free — clipping would be correct
  // too, but a save/clip/restore per rock costs more than the whole rest of
  // the shape put together, and there are hundreds of these.
  poly(
    g,
    pts.map((p) => ({
      x: x - r * 0.18 + (p.x - x) * 0.62,
      y: y - r * 0.22 + (p.y - y) * 0.62,
    })),
  );
  g.fillStyle = biome.rockLit;
  g.fill();

  if (r > 7) {
    poly(g, pts);
    g.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    g.lineWidth = 1.2;
    g.stroke();
  }
}

/**
 * The set-dressing that actually names the age: standing stones and fallen
 * logs for stone age. Sparse and large — these are landmarks, not texture.
 */
function scatterProps(
  g: CanvasRenderingContext2D,
  field: DistField,
  biome: Biome,
  rng: Rng,
  band: number,
): void {
  if (biome.props === 'medieval') {
    scatterMedieval(g, field, biome, rng, band);
    return;
  }
  if (biome.props === 'tech') {
    scatterTech(g, field, rng, band);
    return;
  }

  let placedStones = 0;
  for (let attempt = 0; attempt < 120 && placedStones < 5; attempt++) {
    const x = nextRange(rng, 40, WORLD.width - 40);
    const y = nextRange(rng, WORLD.hudTop + 50, WORLD.height - WORLD.hudBottom - 20);
    if (fieldAt(field, x, y) < band * 2.2) continue;
    standingStone(g, x, y, nextRange(rng, 34, 56), biome, rng);
    placedStones++;
  }

  let placedLogs = 0;
  for (let attempt = 0; attempt < 120 && placedLogs < 6; attempt++) {
    const x = nextRange(rng, 40, WORLD.width - 40);
    const y = nextRange(rng, WORLD.hudTop + 30, WORLD.height - WORLD.hudBottom - 20);
    if (fieldAt(field, x, y) < band * 1.8) continue;
    log(g, x, y, nextRange(rng, 30, 52), nextRange(rng, -0.9, 0.9), rng);
    placedLogs++;
  }
}

/** Middle Age dressing: fence stakes and hay bales on trodden turf. */
function scatterMedieval(
  g: CanvasRenderingContext2D,
  field: DistField,
  biome: Biome,
  rng: Rng,
  band: number,
): void {
  // Stake lines: a run of posts, which reads as enclosure rather than scatter.
  for (let line = 0; line < 5; line++) {
    const x0 = nextRange(rng, 60, WORLD.width - 200);
    const y0 = nextRange(rng, WORLD.hudTop + 40, WORLD.height - WORLD.hudBottom - 40);
    const horizontal = nextFloat(rng) < 0.5;
    const count = nextInt(rng, 3, 7);
    for (let i = 0; i < count; i++) {
      const x = x0 + (horizontal ? i * 26 : nextRange(rng, -4, 4));
      const y = y0 + (horizontal ? nextRange(rng, -4, 4) : i * 26);
      if (x > WORLD.width - 20 || y > WORLD.height - 20) break;
      if (fieldAt(field, x, y) < band * 1.6) continue;
      stake(g, x, y, nextRange(rng, 16, 26));
    }
  }

  for (let i = 0; i < 10; i++) {
    const x = nextRange(rng, 40, WORLD.width - 40);
    const y = nextRange(rng, WORLD.hudTop + 40, WORLD.height - WORLD.hudBottom - 30);
    if (fieldAt(field, x, y) < band * 1.8) continue;
    hayBale(g, x, y, nextRange(rng, 14, 22), rng);
  }

  for (let i = 0; i < 90; i++) {
    const x = nextRange(rng, 10, WORLD.width - 10);
    const y = nextRange(rng, 10, WORLD.height - 10);
    if (fieldAt(field, x, y) < band) continue;
    rock(g, x, y, nextRange(rng, 2, 5), biome, rng);
  }
}

function stake(g: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  g.beginPath();
  g.ellipse(x + 2, y + 2, h * 0.22, h * 0.1, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.32)';
  g.fill();

  g.fillStyle = '#6B5233';
  g.fillRect(x - h * 0.09, y - h, h * 0.18, h);
  g.fillStyle = '#8A6C46';
  g.fillRect(x - h * 0.09, y - h, h * 0.08, h);
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 1.2;
  g.strokeRect(x - h * 0.09, y - h, h * 0.18, h);
}

function hayBale(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  rng: Rng,
): void {
  g.beginPath();
  g.ellipse(x, y + r * 0.4, r * 1.05, r * 0.38, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fill();

  g.beginPath();
  g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
  g.fillStyle = '#B79A56';
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 1.6;
  g.stroke();

  g.strokeStyle = 'rgba(90, 70, 30, 0.6)';
  g.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    const oy = (i - 1) * r * 0.4;
    g.beginPath();
    g.moveTo(x - r * 0.85, y + oy + nextRange(rng, -1, 1));
    g.lineTo(x + r * 0.85, y + oy + nextRange(rng, -1, 1));
    g.stroke();
  }
}

/** Tech Age dressing: pylons and vent grates set into concrete. */
function scatterTech(
  g: CanvasRenderingContext2D,
  field: DistField,
  rng: Rng,
  band: number,
): void {
  // Panel seams: long faint lines, the thing that makes poured concrete read
  // as poured concrete rather than as grey paint.
  g.strokeStyle = 'rgba(255,255,255,0.045)';
  g.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    const horizontal = nextFloat(rng) < 0.5;
    const p = nextRange(rng, 0, horizontal ? WORLD.height : WORLD.width);
    g.beginPath();
    if (horizontal) {
      g.moveTo(0, p);
      g.lineTo(WORLD.width, p);
    } else {
      g.moveTo(p, 0);
      g.lineTo(p, WORLD.height);
    }
    g.stroke();
  }

  for (let i = 0; i < 8; i++) {
    const x = nextRange(rng, 50, WORLD.width - 50);
    const y = nextRange(rng, WORLD.hudTop + 50, WORLD.height - WORLD.hudBottom - 30);
    if (fieldAt(field, x, y) < band * 2) continue;
    pylon(g, x, y, nextRange(rng, 30, 48));
  }

  for (let i = 0; i < 16; i++) {
    const x = nextRange(rng, 30, WORLD.width - 30);
    const y = nextRange(rng, 30, WORLD.height - 30);
    if (fieldAt(field, x, y) < band * 1.4) continue;
    vent(g, x, y, nextRange(rng, 14, 24));
  }
}

function pylon(g: CanvasRenderingContext2D, x: number, y: number, h: number): void {
  g.beginPath();
  g.ellipse(x, y, h * 0.34, h * 0.14, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.fill();

  g.fillStyle = '#4A535E';
  g.beginPath();
  g.moveTo(x - h * 0.26, y);
  g.lineTo(x - h * 0.1, y - h);
  g.lineTo(x + h * 0.1, y - h);
  g.lineTo(x + h * 0.26, y);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 1.8;
  g.stroke();

  // A single lit element — the only emissive thing in the biome, so it reads
  // as powered rather than as another grey block.
  g.fillStyle = '#35D6E8';
  g.fillRect(x - h * 0.06, y - h * 0.92, h * 0.12, h * 0.14);
}

function vent(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  g.fillStyle = '#333A43';
  g.fillRect(x - w / 2, y - w * 0.36, w, w * 0.72);
  g.strokeStyle = 'rgba(0,0,0,0.45)';
  g.lineWidth = 1.4;
  g.strokeRect(x - w / 2, y - w * 0.36, w, w * 0.72);
  g.strokeStyle = 'rgba(140,160,180,0.35)';
  g.lineWidth = 1.6;
  for (let i = 1; i <= 3; i++) {
    const yy = y - w * 0.36 + (i * w * 0.72) / 4;
    g.beginPath();
    g.moveTo(x - w * 0.4, yy);
    g.lineTo(x + w * 0.4, yy);
    g.stroke();
  }
}

/**
 * A menhir: a broad, chipped slab rather than a cone. Width matters — a narrow
 * tapered shape reads as a traffic cone or a gravestone, a wide one with a
 * ragged flat top reads as a raised megalith.
 */
function standingStone(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  biome: Biome,
  rng: Rng,
): void {
  const w = h * nextRange(rng, 0.68, 0.92);
  const lean = nextRange(rng, -0.06, 0.06) * h;

  // Shadow cast to the lower-right, matching the upper-left key light used by
  // the rocks — consistent lighting is most of what sells fake 3D.
  g.beginPath();
  g.ellipse(x + w * 0.16, y + w * 0.06, w * 0.72, w * 0.26, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0, 0, 0, 0.4)';
  g.fill();

  const top = y - h;
  const pts: Vec2[] = [
    { x: x - w * 0.5, y },
    { x: x - w * 0.44 + lean, y: top + h * 0.16 },
    { x: x - w * 0.2 + lean, y: top },
    { x: x + w * 0.18 + lean, y: top + h * 0.07 },
    { x: x + w * 0.46 + lean, y: top + h * 0.24 },
    { x: x + w * 0.5, y },
  ];
  poly(g, pts);
  g.fillStyle = biome.rock;
  g.fill();
  g.strokeStyle = 'rgba(0, 0, 0, 0.5)';
  g.lineWidth = 2;
  g.lineJoin = 'round';
  g.stroke();

  // Lit left face, clipped to the silhouette so the seam is a hard edge —
  // that hard vertical break is what makes it read as a flat stone face.
  g.save();
  poly(g, pts);
  g.clip();
  poly(g, [
    { x: x - w * 0.5, y: y + 2 },
    { x: x - w * 0.44 + lean, y: top },
    { x: x - w * 0.02 + lean, y: top },
    { x: x - w * 0.08, y: y + 2 },
  ]);
  g.fillStyle = biome.rockLit;
  g.fill();

  // A couple of weathering cracks.
  g.strokeStyle = 'rgba(0, 0, 0, 0.28)';
  g.lineWidth = 1.4;
  for (let i = 0; i < 2; i++) {
    const sx = x + nextRange(rng, -w * 0.3, w * 0.35);
    const sy = y - h * nextRange(rng, 0.15, 0.75);
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx + nextRange(rng, -4, 4), sy + nextRange(rng, 8, 20));
    g.stroke();
  }
  g.restore();
}

function log(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  angle: number,
  rng: Rng,
): void {
  const r = len * nextRange(rng, 0.16, 0.22);
  g.save();
  g.translate(x, y);
  g.rotate(angle);

  g.beginPath();
  g.ellipse(0, r * 0.7, len * 0.5, r * 0.6, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0, 0, 0, 0.3)';
  g.fill();

  g.fillStyle = '#4E3A24';
  g.fillRect(-len / 2, -r, len, r * 2);
  g.fillStyle = '#5E4830';
  g.fillRect(-len / 2, -r, len, r * 0.7);

  // Cut end, so it reads as timber rather than a brown bar.
  g.beginPath();
  g.ellipse(-len / 2, 0, r * 0.45, r, 0, 0, Math.PI * 2);
  g.fillStyle = '#6B5438';
  g.fill();
  g.beginPath();
  g.ellipse(-len / 2, 0, r * 0.2, r * 0.45, 0, 0, Math.PI * 2);
  g.fillStyle = '#4A3721';
  g.fill();
  g.restore();
}

// ---------------------------------------------------------------------------
// The track
// ---------------------------------------------------------------------------

/**
 * The path is drawn as a stroked polyline rather than per-cell tiles: round
 * joins turn every corner piece into a clean bend for free. On top of that go
 * gravel, wear patches and a stone kerb, which is what stops it looking like a
 * UI element.
 */
function drawTrack(
  g: CanvasRenderingContext2D,
  path: Path,
  biome: Biome,
  rng: Rng,
  halfWidth: number,
): void {
  const pts = path.points;
  if (pts.length < 2) return;

  g.lineCap = 'round';
  g.lineJoin = 'round';

  // Dug-in edge, so the track sits *below* the grass line.
  tracePolyline(g, pts);
  g.strokeStyle = biome.pathEdge;
  g.lineWidth = halfWidth * 2.0;
  g.stroke();

  tracePolyline(g, pts);
  g.strokeStyle = biome.path;
  g.lineWidth = halfWidth * 1.72;
  g.stroke();

  // Worn centre where feet actually fall.
  tracePolyline(g, pts);
  g.strokeStyle = biome.pathWorn;
  g.lineWidth = halfWidth * 1.05;
  g.stroke();

  // Wear and gravel are drawn on their own layer and then masked down to the
  // track silhouette.
  //
  // The obvious approach — clip() to a Path2D built from per-segment quads
  // plus joint circles — is subtly WRONG: those subpaths wind in opposite
  // directions, so under nonzero winding every quad/circle overlap cancels to
  // zero and gets punched out of the clip. The result is the track visibly
  // tiled into blocks. Masking with the real stroke has no winding to get
  // wrong, and inherits the round joins for free.
  const layer = document.createElement('canvas');
  layer.width = g.canvas.width;
  layer.height = g.canvas.height;
  const lg = layer.getContext('2d')!;
  lg.setTransform(g.getTransform());

  // Uneven wear.
  for (let i = 0; i < 90; i++) {
    const d = nextRange(rng, 0, path.length);
    const p = pointAt(path, d);
    const r = nextRange(rng, 10, 34);
    const grad = lg.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    const dark = nextFloat(rng) < 0.6;
    grad.addColorStop(0, hexToRgba(dark ? biome.pathEdge : biome.pathWorn, 0.32));
    grad.addColorStop(1, hexToRgba(dark ? biome.pathEdge : biome.pathWorn, 0));
    lg.fillStyle = grad;
    lg.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  }

  // Gravel. Accumulated into one Path2D per colour and filled in a handful of
  // calls rather than two thousand individual beginPath/fill pairs.
  const gritCount = Math.round(path.length * 0.9);
  const gritPaths = biome.grit.map(() => new Path2D());
  for (let i = 0; i < gritCount; i++) {
    const d = nextRange(rng, 0, path.length);
    const p = pointAt(path, d);
    const off = nextRange(rng, -halfWidth * 0.85, halfWidth * 0.85);
    const n = normalAt(path, d);
    const which = nextInt(rng, 0, biome.grit.length - 1);
    const gx = p.x + n.x * off;
    const gy = p.y + n.y * off;
    const rx = nextRange(rng, 0.8, 2.4);
    const ry = nextRange(rng, 0.6, 1.8);
    // moveTo is REQUIRED before each ellipse: without it the ellipse is joined
    // to the previous subpath by a straight line, and filling the result draws
    // long angular shards between the pebbles instead of pebbles.
    gritPaths[which]!.moveTo(gx + rx, gy);
    gritPaths[which]!.ellipse(gx, gy, rx, ry, nextFloat(rng) * 3.14, 0, Math.PI * 2);
  }
  for (let i = 0; i < gritPaths.length; i++) {
    lg.fillStyle = biome.grit[i]!;
    lg.fill(gritPaths[i]!);
  }

  // Keep only what falls inside the track band, then composite.
  lg.globalCompositeOperation = 'destination-in';
  lg.lineCap = 'round';
  lg.lineJoin = 'round';
  tracePolyline(lg, pts);
  lg.strokeStyle = '#000';
  lg.lineWidth = halfWidth * 1.9;
  lg.stroke();

  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(layer, 0, 0);
  g.restore();

  // Stone kerb: pebbles lining both edges. This single detail does most of the
  // work of making the track look deliberately laid rather than drawn.
  const kerbCount = Math.round(path.length * 0.22);
  for (let i = 0; i < kerbCount; i++) {
    const d = nextRange(rng, 0, path.length);
    const p = pointAt(path, d);
    const n = normalAt(path, d);
    const side = nextFloat(rng) < 0.5 ? -1 : 1;
    const off = side * halfWidth * nextRange(rng, 0.92, 1.06);
    rock(g, p.x + n.x * off, p.y + n.y * off, nextRange(rng, 2.5, 6), biome, rng);
  }

  endCap(g, pts[0]!, halfWidth * 0.42, COLORS.entrance);
  endCap(g, pts[pts.length - 1]!, halfWidth * 0.42, COLORS.exit);
}

function endCap(g: CanvasRenderingContext2D, p: Vec2, r: number, color: string): void {
  const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6);
  grad.addColorStop(0, hexToRgba(color, 0.5));
  grad.addColorStop(1, hexToRgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(p.x - r * 2.6, p.y - r * 2.6, r * 5.2, r * 5.2);

  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.strokeStyle = 'rgba(0, 0, 0, 0.45)';
  g.lineWidth = 2;
  g.stroke();
}

/** Darkened corners — cheap depth, and it pushes the eye to the middle. */
function vignette(g: CanvasRenderingContext2D): void {
  const grad = g.createRadialGradient(
    WORLD.width / 2,
    WORLD.height / 2,
    WORLD.height * 0.35,
    WORLD.width / 2,
    WORLD.height / 2,
    WORLD.width * 0.72,
  );
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
  g.fillStyle = grad;
  g.fillRect(0, 0, WORLD.width, WORLD.height);
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Point at a distance along the path. Local copy so render never leans on
 *  core's sampling hint state. */
function pointAt(path: Path, dist: number): Vec2 {
  const i = segmentIndex(path, dist);
  const a = path.points[i]!;
  const b = path.points[i + 1] ?? a;
  const segStart = path.cumulative[i]!;
  const segLen = (path.cumulative[i + 1] ?? segStart) - segStart;
  const t = segLen > 0 ? (dist - segStart) / segLen : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Unit vector perpendicular to the path at that distance. */
function normalAt(path: Path, dist: number): Vec2 {
  const i = segmentIndex(path, dist);
  const a = path.points[i]!;
  const b = path.points[i + 1] ?? a;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: -dy / len, y: dx / len };
}

function segmentIndex(path: Path, dist: number): number {
  let lo = 0;
  let hi = path.points.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (path.cumulative[mid]! <= dist) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}

/**
 * Distance-to-path lookup table.
 *
 * Every scattered shape needs to know how far it is from the track, and the
 * exact answer costs a loop over ~45 polyline segments. Thousands of shapes ×
 * 45 segments was the single biggest cost in the bake, so instead we compute
 * the exact distance once per coarse grid cell and look it up after that.
 *
 * A 10-unit grid is far finer than the tolerance any of these checks use.
 */
const FIELD_CELL = 10;

interface DistField {
  cols: number;
  rows: number;
  data: Float32Array;
}

function buildDistField(path: Path): DistField {
  const cols = Math.ceil(WORLD.width / FIELD_CELL) + 1;
  const rows = Math.ceil(WORLD.height / FIELD_CELL) + 1;
  const data = new Float32Array(cols * rows);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      data[gy * cols + gx] = exactDistanceToPath(path, gx * FIELD_CELL, gy * FIELD_CELL);
    }
  }
  return { cols, rows, data };
}

function fieldAt(field: DistField, x: number, y: number): number {
  const gx = Math.min(field.cols - 1, Math.max(0, Math.round(x / FIELD_CELL)));
  const gy = Math.min(field.rows - 1, Math.max(0, Math.round(y / FIELD_CELL)));
  return field.data[gy * field.cols + gx]!;
}

/** Shortest distance from a point to the path polyline. */
function exactDistanceToPath(path: Path, x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i < path.points.length - 1; i++) {
    const a = path.points[i]!;
    const b = path.points[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((x - a.x) * dx + (y - a.y) * dy) / lenSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x - (a.x + dx * t);
    const ey = y - (a.y + dy * t);
    const d = ex * ex + ey * ey;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Begin a path along the whole polyline. Used for both the visible track
 *  strokes and the mask that trims its detail layer. */
function tracePolyline(c: CanvasRenderingContext2D, pts: Vec2[]): void {
  c.beginPath();
  c.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]!.x, pts[i]!.y);
}

function poly(g: CanvasRenderingContext2D, pts: Vec2[]): void {
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.closePath();
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
