/**
 * Draws towers, projectiles and enemies.
 *
 * Placeholder art, but not flat: everything gets a contact shadow, shaded
 * volume and a heavy dark outline. The outline is what keeps units readable on
 * top of a busy textured ground — without it they dissolve into the grass.
 *
 * Gameplay clarity beats detail: an enemy's silhouette has to say what it is
 * at a glance, because that's the information the player acts on.
 */

import { BOSS_MECHANICS, TOWERS, TRAPS, type TowerKind } from '../config/balance';

import type { Enemy, GameState, Projectile, Tower } from '../core/types';
import { veteranRank } from '../core/towers';
import { popScale, type FxState } from '../fx/effects';
import { COLORS, tierFor, type Biome, type Tier } from './palette';

export function drawEntities(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  biome: Biome,
  selectedId: number | null,
  fx: FxState,
): void {
  // Shadows in their own pass, so no unit's body is drawn under another's
  // shadow.
  for (const t of state.towers) shadow(ctx, t.pos.x, t.pos.y, state.layout.cellSize * 0.34, 0.4);
  for (const e of state.enemies) shadow(ctx, e.pos.x, e.pos.y + e.radius * 0.55, e.radius, 0.35);

  for (const t of state.towers) drawTower(ctx, t, state.layout.cellSize, biome, t.id === selectedId);
  for (const e of state.enemies) drawEnemy(ctx, e, popScale(fx, e.id));
  for (const p of state.projectiles) drawProjectile(ctx, p, biome);
}

function shadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fill();
}

// ---------------------------------------------------------------------------
// Towers
// ---------------------------------------------------------------------------

function drawTower(
  ctx: CanvasRenderingContext2D,
  tower: Tower,
  cellSize: number,
  biome: Biome,
  selected: boolean,
): void {
  const s = cellSize * 0.46;
  const def = TOWERS[tower.kind]!;

  ctx.save();
  ctx.translate(tower.pos.x, tower.pos.y);

  // Recoil: shove the whole tower back along its aim for a moment after
  // firing. Cheap, and it reads as force far better than a muzzle flash.
  if (tower.recoil > 0) {
    const kick = tower.recoil * 26;
    ctx.translate(-Math.cos(tower.aim) * kick, -Math.sin(tower.aim) * kick);
  }

  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.15;
  ctx.strokeStyle = OUTLINE;

  if (!def.onPath) drawPlinth(ctx, s, biome);
  // A switched-off building is drawn cold and dark. It has to be obvious from
  // the board rather than only from its panel: an Exchanger you left off is
  // gold you are saving, and one you forgot to switch on is a run's worth of
  // diamonds you silently did not get.
  if (!tower.enabled) ctx.globalAlpha = 0.42;
  drawTowerArt(ctx, tower.kind, s, tower.aim, tower.cooldown, biome, tower.level);
  ctx.restore();

  if (!tower.enabled) {
    ctx.save();
    ctx.strokeStyle = '#F4664F';
    ctx.lineWidth = s * 0.14;
    ctx.lineCap = 'round';
    const d = s * 0.42;
    ctx.beginPath();
    ctx.moveTo(tower.pos.x - d, tower.pos.y - s * 0.9 - d);
    ctx.lineTo(tower.pos.x + d, tower.pos.y - s * 0.9 + d);
    ctx.moveTo(tower.pos.x + d, tower.pos.y - s * 0.9 - d);
    ctx.lineTo(tower.pos.x - d, tower.pos.y - s * 0.9 + d);
    ctx.stroke();
    ctx.restore();
  }

  // Service rank, as chevrons under the tower. Deliberately a DIFFERENT
  // language from the upgrade tiers (which re-forge the tower's working end in
  // silver and gold), because they are different things: level is what you
  // bought, rank is what the tower earned.
  drawRankChevrons(ctx, tower, s);

  // A trap's bank, as a small bar that fills above it.
  //
  // Without this the charge mechanic is invisible arithmetic: the trap simply
  // hits for a different amount each time and the player has no way to know
  // why, let alone to plan around it. With it, an armed trap is a thing you
  // can see waiting — which was most of what "traps feel unsatisfying" meant.
  //
  // It was a ring, and a ring is the wrong shape here: a trap can only sit on
  // the path, so traps come in ROWS, and a row of rings is a row of touching
  // hoops that reads as its own pattern and hides the traps inside it. A short
  // bar occupies a sliver of the tile, stacks cleanly along a mined road, and
  // says the same thing.
  if (def.onPath && tower.charge > 0) {
    const frac = Math.min(1, tower.charge / TRAPS.maxCharge);
    const bw = s * 1.15;
    const bh = s * 0.19;
    const bx = tower.pos.x - bw / 2;
    const by = tower.pos.y - s * 1.02;
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = frac >= 1 ? '#FFD24A' : 'rgba(255, 210, 74, 0.62)';
    ctx.fillRect(bx, by, bw * frac, bh);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.strokeRect(bx, by, bw, bh);
    // Fully banked gets a thin glow along the bar rather than a second shape —
    // "ready" should be readable at a glance without adding board clutter.
    if (frac >= 1) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#FFF0B8';
      ctx.fillRect(bx, by, bw, bh * 0.4);
    }
    ctx.restore();
  }

  if (selected) {
    ctx.beginPath();
    ctx.arc(tower.pos.x, tower.pos.y, s * 1.35, 0, Math.PI * 2);
    ctx.strokeStyle = biome.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

const OUTLINE = '#14100B';

/** Earned rank, drawn as military chevrons rather than pips. */
function drawRankChevrons(ctx: CanvasRenderingContext2D, tower: Tower, s: number): void {
  const rank = veteranRank(tower);
  if (rank <= 0) return;

  const { x, y } = tower.pos;
  ctx.save();
  ctx.strokeStyle = rank >= 3 ? '#FFE082' : rank === 2 ? '#DCE4F0' : '#C0A87A';
  ctx.lineWidth = s * 0.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < rank; i++) {
    const cy = y + s * 0.86 + i * s * 0.19;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.26, cy);
    ctx.lineTo(x, cy - s * 0.13);
    ctx.lineTo(x + s * 0.26, cy);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Every tower's silhouette, in one place.
 *
 * Used by the board AND by the build-bar icons, so a button can never drift
 * from the thing it builds. Each age gets its own vocabulary rather than a
 * recoloured version of the last: stone is timber and rock, the middle age is
 * masonry and gunpowder, the tech age is plated steel and glowing optics —
 * because "the towers look the same" is exactly the complaint that makes an
 * age advance feel like it did nothing.
 */
export function drawTowerArt(
  ctx: CanvasRenderingContext2D,
  kind: TowerKind,
  s: number,
  aim: number,
  cooldown: number,
  biome: Biome,
  level = 1,
): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.14;
  ctx.strokeStyle = OUTLINE;

  const tier = tierFor(level);

  // The top tier gets a halo, drawn under the tower so it reads as the thing
  // glowing rather than as a sticker behind it.
  if (tier.glow) {
    const halo = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 1.7);
    halo.addColorStop(0, tier.glow);
    halo.addColorStop(1, 'rgba(245, 205, 90, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(-s * 1.8, -s * 1.8, s * 3.6, s * 3.6);
  }

  switch (kind) {
    // --- Stone Age ---------------------------------------------------------
    case 'thrower':
      drawThrower(ctx, s, aim, biome, tier);
      break;
    case 'trap':
      drawSpikePit(ctx, s, cooldown, biome, tier);
      break;
    case 'slower':
      drawColdMud(ctx, s, tier);
      break;
    case 'heavy':
      drawBoulder(ctx, s, aim, biome, tier);
      break;
    case 'campfire':
      drawCampfire(ctx, s, biome, tier);
      break;

    // --- Middle Age --------------------------------------------------------
    case 'ballista':
      drawArcherTower(ctx, s, aim, tier);
      break;
    case 'oilFire':
      drawCauldron(ctx, s, cooldown, tier);
      break;
    case 'frost':
      drawFrostTower(ctx, s, tier);
      break;
    case 'siegeCannon':
      drawCannon(ctx, s, aim, tier);
      break;
    case 'goldMine':
      drawGoldMine(ctx, s, tier);
      break;

    // --- Tech Age ----------------------------------------------------------
    case 'railgun':
      drawGunTurret(ctx, s, aim, tier);
      break;
    case 'teslaCoil':
      drawTeslaCoil(ctx, s, cooldown, tier);
      break;
    case 'cryo':
      drawCryoField(ctx, s, tier);
      break;
    case 'singularity':
      drawSingularity(ctx, s, tier);
      break;
    case 'sniper':
      drawSniper(ctx, s, aim, tier);
      break;
    case 'factory':
      drawFactory(ctx, s, tier);
      break;

    case 'exchanger':
      drawExchanger(ctx, s, tier);
      break;
  }
}

/**
 * The Exchanger: a crucible with a cut gem suspended over it.
 *
 * Deliberately reads as a piece of machinery rather than as another mine —
 * it is not producing anything, it is converting one thing into another, and
 * the gem floating above the melt is that sentence as a picture. It is also
 * the only building present in all three ages, so its silhouette has to work
 * against grass, cobbles and steel plate alike.
 */
function drawExchanger(ctx: CanvasRenderingContext2D, s: number, tier: Tier): void {
  // Crucible.
  ctx.beginPath();
  ctx.moveTo(-s * 0.66, s * 0.18);
  ctx.lineTo(s * 0.66, s * 0.18);
  ctx.lineTo(s * 0.46, s * 0.86);
  ctx.lineTo(-s * 0.46, s * 0.86);
  ctx.closePath();
  ctx.fillStyle = mat(tier, '#6E6A64');
  ctx.fill();
  ctx.lineWidth = s * 0.13;
  ctx.strokeStyle = '#1B1712';
  ctx.stroke();

  // Molten gold in the bowl.
  ctx.beginPath();
  ctx.ellipse(0, s * 0.2, s * 0.56, s * 0.15, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#F0C46A';
  ctx.fill();
  ctx.strokeStyle = '#8A6A22';
  ctx.lineWidth = s * 0.07;
  ctx.stroke();

  // The gem, held above the melt. Its facets take the tier metal, so an
  // upgraded Exchanger is legible at a glance like every other tower.
  const gy = -s * 0.5;
  ctx.beginPath();
  ctx.moveTo(0, gy + s * 0.5);
  ctx.lineTo(-s * 0.42, gy - s * 0.06);
  ctx.lineTo(-s * 0.24, gy - s * 0.38);
  ctx.lineTo(s * 0.24, gy - s * 0.38);
  ctx.lineTo(s * 0.42, gy - s * 0.06);
  ctx.closePath();
  ctx.fillStyle = '#8FE3FF';
  ctx.fill();
  ctx.lineWidth = s * 0.09;
  ctx.strokeStyle = matLit(tier, '#2E5A6E');
  ctx.stroke();

  // Facet lines, so it reads as cut rather than as a blue pentagon.
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, gy - s * 0.06);
  ctx.lineTo(s * 0.42, gy - s * 0.06);
  ctx.moveTo(-s * 0.16, gy - s * 0.06);
  ctx.lineTo(0, gy + s * 0.5);
  ctx.moveTo(s * 0.16, gy - s * 0.06);
  ctx.lineTo(0, gy + s * 0.5);
  ctx.strokeStyle = 'rgba(20, 46, 60, 0.55)';
  ctx.lineWidth = s * 0.055;
  ctx.stroke();
}

/**
 * The tower's working end, in whatever this upgrade tier is forged from.
 * `fallback` is the tower's own native material, used at level 1.
 */
function mat(tier: Tier, fallback: string): string {
  return tier.metal ?? fallback;
}

function matLit(tier: Tier, fallback: string): string {
  return tier.metal === null ? fallback : tier.metalLit;
}

/** Stacked stone base every above-ground tower sits on. */
function drawPlinth(ctx: CanvasRenderingContext2D, s: number, biome: Biome): void {
  ctx.beginPath();
  ctx.ellipse(0, s * 0.5, s * 1.02, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = biome.rock;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, s * 0.3, s * 0.82, s * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = biome.rockLit;
  ctx.fill();
  ctx.stroke();
}

// --- Stone Age ---------------------------------------------------------------

function drawThrower(
  ctx: CanvasRenderingContext2D,
  s: number,
  aim: number,
  biome: Biome,
  tier: Tier,
): void {
  // Posts FIRST so the arm swings in front of them; drawing the frame last
  // hides the arm and the tower collapses into a cone.
  ctx.fillStyle = '#5E4830';
  poly(ctx, [[-0.42, 0.3], [-0.2, -0.55], [0.2, -0.55], [0.42, 0.3]], s);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.rotate(aim);
  ctx.fillStyle = '#A8814F';
  poly(ctx, [[-0.3, -0.18], [1.3, -0.11], [1.3, 0.11], [-0.3, 0.18]], s);
  ctx.fill();
  ctx.stroke();
  // The sling itself is the working end: banded, then silver, then gold.
  if (tier.metal) {
    ctx.fillStyle = tier.metal;
    ctx.beginPath();
    ctx.rect(s * 0.55, -s * 0.17, s * 0.3, s * 0.34);
    ctx.fill();
    ctx.stroke();
  }
  circle(ctx, s * 1.2, 0, s * 0.3, mat(tier, biome.rockLit), true);
  if (tier.metal) circle(ctx, s * 1.12, -s * 0.09, s * 0.12, tier.metalLit, false);
  ctx.restore();
}

function drawSpikePit(
  ctx: CanvasRenderingContext2D,
  s: number,
  cooldown: number,
  biome: Biome,
  tier: Tier,
): void {
  ellipse(ctx, 0, 0, s * 0.86, s * 0.66, '#4A3722', true);
  ellipse(ctx, 0, s * 0.08, s * 0.68, s * 0.5, '#2E2214', false);

  // A forged rim around the pit, so an upgraded trap reads even with the
  // spikes retracted mid-reload.
  if (tier.metal) {
    ctx.strokeStyle = tier.metal;
    ctx.lineWidth = s * 0.12;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.86, s * 0.66, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = OUTLINE;
  }

  const armed = Math.max(0, 1 - Math.max(0, cooldown) / 1.6);
  if (armed <= 0.02) return;
  ctx.fillStyle = mat(tier, biome.rockLit);
  ctx.lineWidth = s * 0.07;
  for (const [ox, oy] of [[-0.5, 0.18], [-0.22, -0.2], [0.06, 0.22], [0.34, -0.16], [0.56, 0.14]]) {
    spike(ctx, ox! * s, oy! * s, s * 0.11, s * 0.4 * armed);
  }
}

function drawColdMud(ctx: CanvasRenderingContext2D, s: number, tier: Tier): void {
  circle(ctx, 0, -s * 0.08, s * 0.78, '#2E5A68', true);
  circle(ctx, -s * 0.2, -s * 0.28, s * 0.36, '#5E93A4', false);
  // A forged rim holding the pool — the ice stays ice at every level, because
  // the tower's identity is the cold, not the metal.
  if (tier.metal) {
    ctx.strokeStyle = tier.metal;
    ctx.lineWidth = s * 0.14;
    ctx.beginPath();
    ctx.arc(0, -s * 0.08, s * 0.78, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = matLit(tier, '#D6F0F8');
  ctx.lineWidth = s * 0.13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    ctx.moveTo(Math.cos(a) * s * 0.58, Math.sin(a) * s * 0.58 - s * 0.08);
    ctx.lineTo(-Math.cos(a) * s * 0.58, -Math.sin(a) * s * 0.58 - s * 0.08);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = OUTLINE;
}

function drawBoulder(
  ctx: CanvasRenderingContext2D,
  s: number,
  aim: number,
  biome: Biome,
  tier: Tier,
): void {
  ctx.save();
  ctx.rotate(aim);
  ctx.fillStyle = '#4E3A24';
  poly(ctx, [[-0.7, -0.5], [1.0, -0.34], [1.0, 0.34], [-0.7, 0.5]], s);
  ctx.fill();
  ctx.stroke();
  // Reinforcing straps down the throwing arm.
  if (tier.metal) {
    ctx.fillStyle = tier.metal;
    for (const ox of [-0.3, 0.45]) {
      ctx.beginPath();
      ctx.rect(ox * s, -s * 0.46, s * 0.14, s * 0.92);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
  circle(ctx, 0, -s * 0.18, s * 0.74, biome.rock, true);
  circle(ctx, -s * 0.22, -s * 0.4, s * 0.36, mat(tier, biome.rockLit), false);
}

/**
 * The Stone Age economy building: a ring of stones, a stack of logs and a
 * flame. No barrel, because like every economy building it never shoots.
 */
function drawCampfire(
  ctx: CanvasRenderingContext2D,
  s: number,
  biome: Biome,
  tier: Tier,
): void {
  // Hearth stones, laid in a ring.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    circle(
      ctx,
      Math.cos(a) * s * 0.74,
      Math.sin(a) * s * 0.42 + s * 0.2,
      s * 0.19,
      mat(tier, i % 2 === 0 ? biome.rock : biome.rockLit),
      true,
    );
  }

  // Crossed logs.
  ctx.fillStyle = '#6B5233';
  for (const rot of [-0.6, 0.6]) {
    ctx.save();
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.rect(-s * 0.62, -s * 0.09, s * 1.24, s * 0.18);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Flame. Static shape — this is baked-in identity, not an animation; the
  // fx layer owns anything that moves.
  const flame = ctx.createRadialGradient(0, -s * 0.25, s * 0.05, 0, -s * 0.2, s * 0.7);
  flame.addColorStop(0, 'rgba(255, 240, 170, 0.95)');
  flame.addColorStop(0.5, 'rgba(240, 150, 50, 0.75)');
  flame.addColorStop(1, 'rgba(220, 90, 30, 0)');
  ctx.fillStyle = flame;
  ctx.fillRect(-s * 0.8, -s * 1.0, s * 1.6, s * 1.4);

  ctx.fillStyle = '#F5D97A';
  ctx.beginPath();
  ctx.moveTo(-s * 0.22, -s * 0.1);
  ctx.quadraticCurveTo(-s * 0.08, -s * 0.5, 0, -s * 0.82);
  ctx.quadraticCurveTo(s * 0.1, -s * 0.5, s * 0.22, -s * 0.1);
  ctx.closePath();
  ctx.fill();
}

// --- Middle Age --------------------------------------------------------------

/** A crenellated masonry turret with an archer on top, drawing a bow. */
function drawArcherTower(
  ctx: CanvasRenderingContext2D,
  s: number,
  aim: number,
  tier: Tier,
): void {
  // Tower body with visible courses of stone.
  ctx.fillStyle = '#8E8676';
  poly(ctx, [[-0.52, 0.32], [-0.44, -0.62], [0.44, -0.62], [0.52, 0.32]], s);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = s * 0.05;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, s * 0.32 - i * s * 0.31);
    ctx.lineTo(s * 0.5, s * 0.32 - i * s * 0.31);
    ctx.stroke();
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = s * 0.14;

  // Crenellations — the single detail that says "castle" instantly, and the
  // natural place to show the tower has been re-faced.
  ctx.fillStyle = mat(tier, '#A69C89');
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.rect(i * s * 0.24 - s * 0.09, -s * 0.86, s * 0.18, s * 0.26);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.rect(-s * 0.58, -s * 0.66, s * 1.16, s * 0.16);
  ctx.fillStyle = mat(tier, '#B5AB97');
  ctx.fill();
  ctx.stroke();

  // The archer: a head plus a drawn bow that tracks the target.
  ctx.save();
  ctx.rotate(aim);
  ctx.strokeStyle = '#5E4830';
  ctx.lineWidth = s * 0.1;
  ctx.beginPath();
  ctx.arc(s * 0.34, 0, s * 0.42, -1.15, 1.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(s * 0.34 + Math.cos(-1.15) * s * 0.42, Math.sin(-1.15) * s * 0.42);
  ctx.lineTo(s * 0.34 + Math.cos(1.15) * s * 0.42, Math.sin(1.15) * s * 0.42);
  ctx.strokeStyle = matLit(tier, '#E8E0CC');
  ctx.lineWidth = s * 0.05;
  ctx.stroke();
  ctx.restore();

  circle(ctx, 0, -s * 0.98, s * 0.2, '#D8C49B', true);
  ctx.lineWidth = s * 0.14;
}

/** A cauldron of burning oil, set into the track. */
function drawCauldron(
  ctx: CanvasRenderingContext2D,
  s: number,
  cooldown: number,
  tier: Tier,
): void {
  ellipse(ctx, 0, s * 0.1, s * 0.9, s * 0.6, '#2A2016', true);

  ctx.fillStyle = mat(tier, '#3E3A38');
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.05, s * 0.62, s * 0.44, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ellipse(ctx, 0, -s * 0.1, s * 0.5, s * 0.32, '#1B1614', false);

  const hot = Math.max(0, 1 - Math.max(0, cooldown) / 1.2);
  if (hot <= 0.05) return;
  // Flames: three tongues whose height tracks how close it is to firing.
  for (const [ox, scale] of [[-0.26, 0.8], [0, 1], [0.26, 0.75]]) {
    const h = s * 0.75 * hot * scale!;
    ctx.beginPath();
    ctx.moveTo(ox! * s - s * 0.14, -s * 0.12);
    ctx.quadraticCurveTo(ox! * s - s * 0.05, -s * 0.12 - h * 0.6, ox! * s, -s * 0.12 - h);
    ctx.quadraticCurveTo(ox! * s + s * 0.05, -s * 0.12 - h * 0.6, ox! * s + s * 0.14, -s * 0.12);
    ctx.closePath();
    ctx.fillStyle = '#E8873D';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ox! * s - s * 0.07, -s * 0.12);
    ctx.quadraticCurveTo(ox! * s, -s * 0.12 - h * 0.5, ox! * s, -s * 0.12 - h * 0.62);
    ctx.quadraticCurveTo(ox! * s + s * 0.07, -s * 0.12 - h * 0.5, ox! * s + s * 0.07, -s * 0.12);
    ctx.closePath();
    ctx.fillStyle = '#F5D97A';
    ctx.fill();
  }
}

function drawFrostTower(ctx: CanvasRenderingContext2D, s: number, tier: Tier): void {
  // An ice spire: a tall crystal with two shoulders.
  ctx.fillStyle = '#7FB8CC';
  poly(ctx, [[-0.4, 0.36], [-0.24, -0.5], [0, -1.0], [0.24, -0.5], [0.4, 0.36]], s);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#BFE6F0';
  poly(ctx, [[-0.24, -0.5], [0, -1.0], [0, -0.2], [-0.12, 0.1]], s);
  ctx.fill();

  for (const dir of [-1, 1]) {
    ctx.fillStyle = '#9FD2E4';
    poly(ctx, [[dir * 0.34, 0.1], [dir * 0.5, -0.42], [dir * 0.6, 0.16]], s);
    ctx.fill();
    ctx.stroke();
  }

  // A cap forged onto the spire's tip. The crystal itself stays ice — the
  // upgrade is the setting it is mounted in, not a different element.
  if (tier.metal) {
    ctx.fillStyle = tier.metal;
    poly(ctx, [[-0.17, -0.62], [0, -1.05], [0.17, -0.62]], s);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tier.metalLit;
    poly(ctx, [[-0.07, -0.7], [0, -0.98], [0.03, -0.68]], s);
    ctx.fill();
  }
}

/** A wheeled gunpowder cannon. Barrel tracks the target. */
function drawCannon(ctx: CanvasRenderingContext2D, s: number, aim: number, tier: Tier): void {
  // Carriage. The wheels carry the upgrade tier as well as the barrel does:
  // a change confined to the muzzle was too small to spot on the board, and
  // the wheels are the widest, most visible part of this silhouette.
  ctx.fillStyle = mat(tier, '#5E4830');
  ctx.beginPath();
  ctx.rect(-s * 0.6, s * 0.06, s * 1.2, s * 0.34);
  ctx.fill();
  ctx.stroke();
  for (const dir of [-1, 1]) {
    circle(ctx, dir * s * 0.42, s * 0.36, s * 0.26, mat(tier, '#6B5233'), true);
    // Spokes, in the tier's bright metal — turns a flat disc into a wheel and
    // makes silver-vs-gold obvious at a glance.
    ctx.strokeStyle = matLit(tier, '#3A2A1C');
    ctx.lineWidth = s * 0.055;
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(dir * s * 0.42 - Math.cos(ang) * s * 0.22, s * 0.36 - Math.sin(ang) * s * 0.22);
      ctx.lineTo(dir * s * 0.42 + Math.cos(ang) * s * 0.22, s * 0.36 + Math.sin(ang) * s * 0.22);
      ctx.stroke();
    }
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = s * 0.14;
    circle(ctx, dir * s * 0.42, s * 0.36, s * 0.09, matLit(tier, '#3A2A1C'), false);
  }

  // Barrel, with a wider muzzle so the firing end is obvious.
  ctx.save();
  ctx.rotate(aim);
  ctx.fillStyle = '#4A4640';
  poly(ctx, [[-0.42, -0.26], [0.98, -0.2], [0.98, 0.2], [-0.42, 0.26]], s);
  ctx.fill();
  ctx.stroke();
  // The muzzle — where the shell leaves — is this tower's working end.
  ctx.fillStyle = mat(tier, '#6A655C');
  ctx.beginPath();
  ctx.rect(s * 0.9, -s * 0.26, s * 0.2, s * 0.52);
  ctx.fill();
  ctx.stroke();
  if (tier.metal) {
    ctx.fillStyle = tier.metal;
    ctx.beginPath();
    ctx.rect(s * 0.1, -s * 0.28, s * 0.14, s * 0.56);
    ctx.fill();
    ctx.stroke();
  }
  circle(ctx, s * 1.0, 0, s * 0.13, '#141210', false);
  ctx.restore();
}

/** A timbered mine head with a gold seam. No barrel — it never shoots. */
function drawGoldMine(ctx: CanvasRenderingContext2D, s: number, tier: Tier): void {
  // Spoil heap.
  ellipse(ctx, 0, s * 0.36, s * 0.98, s * 0.34, '#5A4A32', true);

  // Timber frame around a dark adit.
  ctx.fillStyle = '#2A1F14';
  ctx.beginPath();
  ctx.moveTo(-s * 0.46, s * 0.3);
  ctx.lineTo(-s * 0.46, -s * 0.32);
  ctx.quadraticCurveTo(0, -s * 0.86, s * 0.46, -s * 0.32);
  ctx.lineTo(s * 0.46, s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Pit-head timbers, replaced with forged supports as it is upgraded.
  ctx.fillStyle = mat(tier, '#6B5233');
  ctx.beginPath();
  ctx.rect(-s * 0.6, -s * 0.42, s * 0.16, s * 0.76);
  ctx.rect(s * 0.44, -s * 0.42, s * 0.16, s * 0.76);
  ctx.rect(-s * 0.62, -s * 0.5, s * 1.24, s * 0.16);
  ctx.fill();
  ctx.stroke();

  // Gold: a few nuggets catching the light, plus a glow so it reads as
  // valuable at a glance rather than as another brown building.
  const glow = ctx.createRadialGradient(0, s * 0.02, 0, 0, s * 0.02, s * 0.7);
  glow.addColorStop(0, 'rgba(245, 200, 70, 0.5)');
  glow.addColorStop(1, 'rgba(245, 200, 70, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4);

  for (const [ox, oy, r] of [[-0.16, 0.1, 0.13], [0.12, 0.16, 0.11], [0.0, -0.06, 0.09]]) {
    circle(ctx, ox! * s, oy! * s, r! * s, '#F5C842', false);
    circle(ctx, ox! * s - r! * s * 0.3, oy! * s - r! * s * 0.3, r! * s * 0.4, '#FFF0B0', false);
  }
}

// --- Tech Age ----------------------------------------------------------------

/** Plated turret with a long barrel and a vented muzzle. */
function drawGunTurret(
  ctx: CanvasRenderingContext2D,
  s: number,
  aim: number,
  tier: Tier,
): void {
  ctx.save();
  ctx.rotate(aim);

  ctx.fillStyle = '#4E5A66';
  poly(ctx, [[-0.46, -0.42], [0.34, -0.34], [0.34, 0.34], [-0.46, 0.42]], s);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = mat(tier, '#39424C');
  ctx.beginPath();
  ctx.rect(s * 0.2, -s * 0.15, s * 1.02, s * 0.3);
  ctx.fill();
  ctx.stroke();
  // Muzzle brake: two slots near the tip.
  ctx.fillStyle = '#20262C';
  ctx.fillRect(s * 0.86, -s * 0.16, s * 0.07, s * 0.32);
  ctx.fillRect(s * 1.0, -s * 0.16, s * 0.07, s * 0.32);
  ctx.restore();

  circle(ctx, 0, 0, s * 0.3, mat(tier, '#5E6B78'), true);
  circle(ctx, -s * 0.08, -s * 0.08, s * 0.13, '#35D6E8', false);
}

function drawTeslaCoil(
  ctx: CanvasRenderingContext2D,
  s: number,
  cooldown: number,
  tier: Tier,
): void {
  ellipse(ctx, 0, s * 0.2, s * 0.86, s * 0.4, '#2F3640', true);

  ctx.fillStyle = '#454E58';
  ctx.beginPath();
  ctx.rect(-s * 0.16, -s * 0.55, s * 0.32, s * 0.8);
  ctx.fill();
  ctx.stroke();
  // Coil windings.
  ctx.strokeStyle = '#8A6A3A';
  ctx.lineWidth = s * 0.07;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.42 + i * s * 0.17, s * 0.22, s * 0.06, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = s * 0.14;

  // The discharge electrode: the part that actually does the work.
  circle(ctx, 0, -s * 0.68, s * 0.24, mat(tier, '#7AC6D8'), true);

  const charged = Math.max(0, 1 - Math.max(0, cooldown) / 1.0);
  if (charged < 0.5) return;
  // Arcs snapping off the top ball when it's ready to discharge.
  ctx.strokeStyle = '#BFF4FF';
  ctx.lineWidth = s * 0.05;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + charged * 3;
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.68);
    ctx.lineTo(Math.cos(a) * s * 0.4, -s * 0.68 + Math.sin(a) * s * 0.4);
    ctx.stroke();
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = s * 0.14;
}

function drawCryoField(ctx: CanvasRenderingContext2D, s: number, tier: Tier): void {
  // A dish emitter venting vapour.
  ctx.fillStyle = '#3E4A56';
  poly(ctx, [[-0.3, 0.34], [-0.18, -0.1], [0.18, -0.1], [0.3, 0.34]], s);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = mat(tier, '#5E93A4');
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.2, s * 0.64, s * 0.26, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#CFEFF8';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.24, s * 0.44, s * 0.16, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#BFE6F0';
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  for (const dir of [-1, 0, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * s * 0.26, -s * 0.42);
    ctx.lineTo(dir * s * 0.34, -s * 0.74);
    ctx.stroke();
  }
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = s * 0.14;
}

function drawSingularity(ctx: CanvasRenderingContext2D, s: number, tier: Tier): void {
  ctx.fillStyle = '#2A2F3A';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.1, s * 0.9, s * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const grad = ctx.createRadialGradient(0, -s * 0.1, s * 0.05, 0, -s * 0.1, s * 0.55);
  grad.addColorStop(0, '#0A0C12');
  grad.addColorStop(0.7, '#2B1B44');
  grad.addColorStop(1, '#6A4FA8');
  circle(ctx, 0, -s * 0.1, s * 0.5, grad as unknown as string, true);

  // The containment ring — the only part of a singularity you can actually
  // build, so it is the part that gets re-forged.
  ctx.strokeStyle = mat(tier, '#B79CF0');
  ctx.lineWidth = s * (tier.metal ? 0.09 : 0.06);
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.1, s * 0.78, s * 0.26, 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = s * 0.14;
}

/** A long rifle on a tripod. The scope glint is the tell. */
function drawSniper(ctx: CanvasRenderingContext2D, s: number, aim: number, tier: Tier): void {
  // Tripod legs, drawn before the weapon so it sits on top.
  ctx.strokeStyle = '#39424C';
  ctx.lineWidth = s * 0.12;
  ctx.lineCap = 'round';
  for (const a of [-2.4, -0.75, 1.6]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6 + s * 0.2);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = s * 0.12;

  ctx.save();
  ctx.rotate(aim);

  // Receiver plus a very long, thin barrel — length is the whole read.
  ctx.fillStyle = '#454E58';
  ctx.beginPath();
  ctx.rect(-s * 0.42, -s * 0.2, s * 0.7, s * 0.4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = mat(tier, '#2F3640');
  ctx.beginPath();
  ctx.rect(s * 0.24, -s * 0.08, s * 1.5, s * 0.16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#20262C';
  ctx.fillRect(s * 1.6, -s * 0.13, s * 0.14, s * 0.26);

  // Scope with a cyan lens flare.
  ctx.fillStyle = '#20262C';
  ctx.beginPath();
  ctx.rect(-s * 0.16, -s * 0.42, s * 0.6, s * 0.2);
  ctx.fill();
  ctx.stroke();
  circle(ctx, s * 0.44, -s * 0.32, s * 0.1, '#35D6E8', false);
  ctx.restore();
}

/**
 * The Tech Age economy building: a plant with a stack and a conveyor. Reads as
 * industry rather than as a weapon, which is the point — nothing on it aims.
 */
function drawFactory(ctx: CanvasRenderingContext2D, s: number, tier: Tier): void {
  // Shed with a sawtooth roof — the silhouette that says "works" instantly.
  ctx.fillStyle = '#3E4A56';
  ctx.beginPath();
  ctx.rect(-s * 0.86, -s * 0.28, s * 1.5, s * 0.68);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = mat(tier, '#5E6B78');
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const x = -s * 0.86 + i * s * 0.5;
    ctx.moveTo(x, -s * 0.28);
    ctx.lineTo(x + s * 0.22, -s * 0.56);
    ctx.lineTo(x + s * 0.5, -s * 0.56);
    ctx.lineTo(x + s * 0.5, -s * 0.28);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Chimney.
  ctx.fillStyle = mat(tier, '#39424C');
  ctx.beginPath();
  ctx.rect(s * 0.52, -s * 0.98, s * 0.28, s * 0.74);
  ctx.fill();
  ctx.stroke();

  // Lit windows: the tell that it is running and producing.
  ctx.fillStyle = '#F5C842';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(-s * 0.7 + i * s * 0.44, -s * 0.14, s * 0.24, s * 0.2);
  }

  const glow = ctx.createRadialGradient(0, s * 0.0, 0, 0, s * 0.0, s * 0.9);
  glow.addColorStop(0, 'rgba(245, 200, 70, 0.35)');
  glow.addColorStop(1, 'rgba(245, 200, 70, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-s * 1.0, -s * 1.0, s * 2.0, s * 2.0);
}

// --- Shared primitives -------------------------------------------------------

function poly(ctx: CanvasRenderingContext2D, pts: number[][], s: number): void {
  ctx.beginPath();
  ctx.moveTo(pts[0]![0]! * s, pts[0]![1]! * s);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0]! * s, pts[i]![1]! * s);
  ctx.closePath();
}

function circle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  outline: boolean,
): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) ctx.stroke();
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  outline: boolean,
): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (outline) ctx.stroke();
}

function spike(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  halfWidth: number,
  height: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x - halfWidth, y + halfWidth);
  ctx.lineTo(x, y - height);
  ctx.lineTo(x + halfWidth, y + halfWidth);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------

/**
 * Every weapon fires something recognisably its own.
 *
 * This used to be one circle for all twelve towers, tinted by whether it had
 * splash — which meant the Singularity and the Thrower were the same grey
 * pebble the instant the shot left the barrel. A projectile is on screen for
 * most of its flight across the board, so it is doing more identity work than
 * the tower art ever gets to.
 *
 * Everything is drawn in the shot's own frame: translate to the position,
 * rotate to the heading, then draw pointing along +x. That keeps each look's
 * geometry readable as a shape instead of a pile of trigonometry, and it means
 * an arrow always flies point-first without every vertex being computed twice.
 */
function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, biome: Biome): void {
  // Heading from where it is to where it's going. A shot that has arrived has
  // no direction left, so fall back to +x rather than emitting a NaN rotation
  // that would blank the whole canvas transform.
  const dx = p.aimAt.x - p.pos.x;
  const dy = p.aimAt.y - p.pos.y;
  const heading = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);

  ctx.save();
  ctx.translate(p.pos.x, p.pos.y);
  ctx.rotate(heading);
  ctx.lineJoin = 'round';

  switch (p.look) {
    case 'rock':
      drawStone(ctx, 4.5, biome.rockLit, spin(p));
      break;

    case 'boulder':
      drawStone(ctx, 8, biome.rock, spin(p));
      break;

    case 'slush': {
      // A wet clod of cold mud: a lumpy dark ball shedding pale droplets, so
      // the Stone Age slower reads as thrown sludge rather than as a snowball.
      drawStone(ctx, 5.5, '#6E7F86', spin(p));
      ctx.fillStyle = 'rgba(196, 226, 238, 0.8)';
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(-7 - d, d * 3.2, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'arrow': {
      // Shaft, broadhead, fletching. Long and thin, which also sells the fact
      // that it will keep going through whatever it hits.
      ctx.strokeStyle = '#5A3E22';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.lineTo(6, 0);
      ctx.stroke();

      ctx.fillStyle = '#DCE4E8';
      ctx.beginPath();
      ctx.moveTo(12, 0);
      ctx.lineTo(4, -3.4);
      ctx.lineTo(4, 3.4);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#C8B48A';
      ctx.lineWidth = 1.6;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-11, 0);
        ctx.lineTo(-6, s * 3.4);
        ctx.stroke();
      }
      break;
    }

    case 'cannonball': {
      // Cast iron, lit from above, with powder smoke trailing behind it. The
      // smoke is the tell that this one is heavy and slow.
      ctx.fillStyle = 'rgba(120, 112, 104, 0.32)';
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(-7 * i, Math.sin(p.id + i) * 1.6, 4.6 - i, 0, Math.PI * 2);
        ctx.fill();
      }
      const iron = ctx.createRadialGradient(-2.5, -2.5, 1, 0, 0, 8);
      iron.addColorStop(0, '#6C6A68');
      iron.addColorStop(1, '#26241F');
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fillStyle = iron;
      ctx.fill();
      ctx.strokeStyle = '#14100B';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      break;
    }

    case 'frostShard': {
      // A single crystal, point-first, with a cold halo. Reads as ice at a
      // glance without being mistaken for the Cryo Field's orb.
      ctx.fillStyle = 'rgba(150, 214, 240, 0.28)';
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(0, -4.4);
      ctx.lineTo(-7, 0);
      ctx.lineTo(0, 4.4);
      ctx.closePath();
      ctx.fillStyle = '#DCF3FF';
      ctx.fill();
      ctx.strokeStyle = '#5E9CB8';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // Facet line, so it looks cut rather than drawn.
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, 0);
      ctx.strokeStyle = 'rgba(120, 180, 210, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      break;
    }

    case 'laser': {
      // The Gun Turret fires light: a hot white core inside a coloured bloom,
      // stretched along the direction of travel. Additive blending is what
      // makes it look emitted rather than painted.
      ctx.globalCompositeOperation = 'lighter';
      const bloom = ctx.createLinearGradient(-22, 0, 14, 0);
      bloom.addColorStop(0, 'rgba(80, 220, 255, 0)');
      bloom.addColorStop(0.55, 'rgba(90, 230, 255, 0.55)');
      bloom.addColorStop(1, 'rgba(190, 250, 255, 0.9)');
      ctx.fillStyle = bloom;
      ctx.fillRect(-22, -3.2, 36, 6.4);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillRect(-16, -1.1, 30, 2.2);
      ctx.beginPath();
      ctx.arc(13, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'cryoOrb': {
      // A slow, wide-bursting sphere of cold. Deliberately round and haloed
      // where the Frost Tower's shard is angular — same job, different age,
      // and the player should be able to tell which tower is covering a lane.
      ctx.globalCompositeOperation = 'lighter';
      const halo = ctx.createRadialGradient(0, 0, 1, 0, 0, 13);
      halo.addColorStop(0, 'rgba(210, 250, 255, 0.9)');
      halo.addColorStop(0.45, 'rgba(120, 200, 240, 0.45)');
      halo.addColorStop(1, 'rgba(90, 170, 230, 0)');
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.arc(0, 0, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = '#EAFAFF';
      ctx.fill();
      // Orbiting motes, turning with the shot's own spin.
      ctx.fillStyle = 'rgba(190, 240, 255, 0.85)';
      const s = spin(p);
      for (let i = 0; i < 3; i++) {
        const ang = s + (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(ang) * 8.5, Math.sin(ang) * 8.5, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case 'blackHole': {
      // A hole, not a ball: a dead-black disc with a bright accretion ring and
      // matter falling inward. The one shot on the board that is darker than
      // the ground it crosses, which is exactly what a Singularity should be.
      const s = spin(p);
      ctx.rotate(s);

      // Lensed streaks being dragged in, drawn under the disc.
      ctx.strokeStyle = 'rgba(206, 150, 250, 0.5)';
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(0, 0, 13, ang, ang + 0.7);
        ctx.stroke();
      }

      const ring = ctx.createRadialGradient(0, 0, 5.5, 0, 0, 11);
      ring.addColorStop(0, 'rgba(240, 200, 255, 0.95)');
      ring.addColorStop(0.5, 'rgba(150, 80, 220, 0.55)');
      ring.addColorStop(1, 'rgba(90, 40, 160, 0)');
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fillStyle = ring;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = '#080510';
      ctx.fill();
      ctx.strokeStyle = 'rgba(226, 178, 255, 0.9)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      break;
    }

    case 'rail': {
      // A hypervelocity lance. It travels fast enough that the streak behind
      // it is most of what you ever see, which is the point.
      ctx.globalCompositeOperation = 'lighter';
      const streak = ctx.createLinearGradient(-46, 0, 8, 0);
      streak.addColorStop(0, 'rgba(255, 214, 120, 0)');
      streak.addColorStop(1, 'rgba(255, 238, 190, 0.85)');
      ctx.fillStyle = streak;
      ctx.fillRect(-46, -1.6, 54, 3.2);

      ctx.fillStyle = '#FFF6DC';
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(1, -2.6);
      ctx.lineTo(1, 2.6);
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

/**
 * A tumbling irregular lump — the shared body of every thrown-rock look.
 *
 * The lobes are derived from a fixed sequence rather than a random one: the
 * renderer has no RNG and must not have one, and a shape that re-rolled every
 * frame would shimmer instead of tumble.
 */
function drawStone(
  ctx: CanvasRenderingContext2D,
  r: number,
  fill: string,
  angle: number,
): void {
  const lobes = [1, 0.82, 1.1, 0.88, 1.05, 0.92];
  ctx.save();
  ctx.rotate(angle);
  ctx.beginPath();
  for (let i = 0; i < lobes.length; i++) {
    const t = (i / lobes.length) * Math.PI * 2;
    const rr = r * lobes[i]!;
    const px = Math.cos(t) * rr;
    const py = Math.sin(t) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#14100B';
  ctx.stroke();
  ctx.restore();
}

/**
 * A shot's tumble angle, derived from its id and how far it has travelled.
 *
 * Deliberately computed rather than stored: rotation is presentation, and the
 * render rule forbids writing to anything reachable from GameState. Keying it
 * off position means the spin tracks distance covered, so a slow boulder rolls
 * lazily and a fast one whips round.
 */
function spin(p: Projectile): number {
  return p.id * 0.9 + (p.pos.x + p.pos.y) * 0.035;
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

interface EnemySkin {
  body: string;
  bodyDark: string;
  trim: string;
}

/**
 * One skin per type. Colour reinforces identity, but the SILHOUETTE carries
 * it: in a crowd of twenty units at 2x speed, shape is what the player reads,
 * and "which type is that" is the decision the whole game rests on.
 */
const SKINS: Record<string, EnemySkin> = {
  runner: { body: '#D8C49B', bodyDark: '#A8875C', trim: '#7A5C34' },
  brute: { body: '#8C6E52', bodyDark: '#5C4530', trim: '#3A2A1C' },
  swarm: { body: '#C2B48A', bodyDark: '#8E8158', trim: '#5A5136' },
  armored: { body: '#9AA3AC', bodyDark: '#5E666E', trim: '#33393F' },
  shielded: { body: '#B8A6C8', bodyDark: '#7C6A8E', trim: '#463A55' },
  // Deep red-bronze rather than gold. Gold sat right on top of the Runner's
  // tan, and in a pack of twenty the support unit you are meant to pick out
  // and kill first has to be the one colour nothing else on the board uses.
  warchief: { body: '#C4553C', bodyDark: '#7E2E20', trim: '#3E140E' },
  zealot: { body: '#E0A05A', bodyDark: '#A66830', trim: '#5A3418' },
  splitter: { body: '#C88ACC', bodyDark: '#8A5090', trim: '#4A2850' },
  juggernaut: { body: '#8894A8', bodyDark: '#4E5A6E', trim: '#262E3C' },
  bossSummoner: { body: '#D89A6A', bodyDark: '#95603A', trim: '#4A2E1A' },
  bossWarlord: { body: '#D07070', bodyDark: '#8E4040', trim: '#4A2020' },
  bossRegenerator: { body: '#7AC6D8', bodyDark: '#40808E', trim: '#1E4048' },
};

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  pop: { sx: number; sy: number },
): void {
  const { x, y } = e.pos;
  const r = e.radius;
  const a = Math.atan2(e.dir.y, e.dir.x);
  const skin = SKINS[e.kind] ?? SKINS.runner!;
  const isBoss = e.mechanic !== null;

  // Squash and stretch, applied ABOUT the unit's own centre so the body
  // deforms in place. Scaling around the origin instead would slide every
  // enemy toward the top-left corner of the world.
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pop.sx, pop.sy);
  ctx.translate(-x, -y);

  ctx.lineJoin = 'round';
  ctx.lineWidth = r * 0.2;
  ctx.strokeStyle = COLORS.enemyEdge;

  // Facing wedge behind the body, so it reads as a snout rather than a spike.
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5);
  ctx.lineTo(x + Math.cos(a + 2.3) * r * 0.9, y + Math.sin(a + 2.3) * r * 0.9);
  ctx.lineTo(x + Math.cos(a - 2.3) * r * 0.9, y + Math.sin(a - 2.3) * r * 0.9);
  ctx.closePath();
  ctx.fillStyle = skin.trim;
  ctx.fill();
  ctx.stroke();

  // Body: lit from the upper-left to match the terrain's rock shading.
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  grad.addColorStop(0, skin.body);
  grad.addColorStop(1, skin.bodyDark);
  ctx.beginPath();
  if (e.kind === 'armored') {
    // Hard-edged hexagonal plate. Angular vs round is the fastest silhouette
    // difference to read, which is what an armor check needs to be.
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + a;
      const px = x + Math.cos(ang) * r * 1.1;
      const py = y + Math.sin(ang) * r * 1.1;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.stroke();

  drawTypeMark(ctx, e, x, y, r, a, skin);

  // Rallied: this unit is inside a Warchief's banner and is moving faster
  // because of it. Marked on every affected unit rather than only on the
  // carrier, because "why is that pack suddenly outrunning my slowers" is the
  // question, and the answer has to be attached to the units doing it.
  // Speed lines trailing BEHIND the direction of travel read as motion at a
  // glance, which a ring or a tint would not.
  if (e.auraSpeed > 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(248, 214, 110, 0.75)';
    ctx.lineWidth = r * 0.13;
    ctx.lineCap = 'round';
    for (const side of [-0.85, 0, 0.85]) {
      const ox = -Math.sin(a) * r * side;
      const oy = Math.cos(a) * r * side;
      ctx.beginPath();
      ctx.moveTo(x + ox - Math.cos(a) * r * 1.15, y + oy - Math.sin(a) * r * 1.15);
      ctx.lineTo(x + ox - Math.cos(a) * r * 1.95, y + oy - Math.sin(a) * r * 1.95);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.restore();
  }

  // Rime on a chilled unit.
  //
  // Slowers fire a shot that lands on ONE target now, rather than blanketing a
  // radius, so "is that one slowed?" is a question the player actually has to
  // answer per enemy. A thin ring was not enough — the mark is a blue frosting
  // over the body plus crystals growing off it, readable in a crowd at 4x.
  if (e.slowTimer > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(150, 214, 240, 0.42)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(214, 244, 255, 0.95)';
    ctx.lineWidth = r * 0.13;
    ctx.stroke();

    // Ice crystals around the rim.
    ctx.fillStyle = '#DCF3FF';
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 + a * 0.5;
      const bx = x + Math.cos(ang) * r * 0.95;
      const by = y + Math.sin(ang) * r * 0.95;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(ang + 1.6) * r * 0.16, by + Math.sin(ang + 1.6) * r * 0.16);
      ctx.lineTo(bx + Math.cos(ang) * r * 0.42, by + Math.sin(ang) * r * 0.42);
      ctx.lineTo(bx + Math.cos(ang - 1.6) * r * 0.16, by + Math.sin(ang - 1.6) * r * 0.16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // Shield: an arc per remaining hit, so you can count what's left rather
  // than guessing why your damage isn't landing.
  if (e.shield > 0) {
    ctx.strokeStyle = '#9FD8F0';
    ctx.lineWidth = r * 0.16;
    ctx.lineCap = 'round';
    const seg = (Math.PI * 2) / Math.max(1, e.maxShield);
    for (let i = 0; i < e.shield; i++) {
      ctx.beginPath();
      ctx.arc(x, y, r * 1.42, i * seg + 0.12, (i + 1) * seg - 0.12);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  // Hit flash on top of everything.
  if (e.flash > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 250, 235, ${Math.min(0.85, e.flash * 6)})`;
    ctx.fill();
  }

  // Out of the squash before the HP bar: a health bar that stretches with the
  // body is a health bar you misread at exactly the wrong moment.
  ctx.restore();

  if (isBoss || e.hp < e.maxHp) drawHpBar(ctx, e, isBoss);
}

/** The per-type mark: the detail that names the unit once you've clocked it. */
function drawTypeMark(
  ctx: CanvasRenderingContext2D,
  e: Enemy,
  x: number,
  y: number,
  r: number,
  a: number,
  skin: EnemySkin,
): void {
  ctx.lineWidth = r * 0.16;
  ctx.strokeStyle = COLORS.enemyEdge;

  switch (e.kind) {
    case 'brute': {
      // Shoulder humps: bulk that reads even in a crowd.
      ctx.beginPath();
      ctx.arc(x - Math.cos(a) * r * 0.5 - Math.sin(a) * r * 0.6, y - Math.sin(a) * r * 0.5 + Math.cos(a) * r * 0.6, r * 0.4, 0, Math.PI * 2);
      ctx.arc(x - Math.cos(a) * r * 0.5 + Math.sin(a) * r * 0.6, y - Math.sin(a) * r * 0.5 - Math.cos(a) * r * 0.6, r * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = skin.bodyDark;
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'armored': {
      // Rivets around the plate rim.
      ctx.fillStyle = skin.trim;
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + a + 0.5;
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * r * 0.66, y + Math.sin(ang) * r * 0.66, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'warchief': {
      // A raised banner. It replaces the Healer's cross for the same reason
      // the unit replaced the Healer: the effect has to be legible at a
      // glance in a crowd, and a pole held above the pack is the tallest
      // silhouette on the board.
      // Deliberately oversized — it sticks a full body-length clear of the
      // pack, so it is the tallest thing on screen and stays identifiable
      // when six units are overlapping at 4x speed.
      const px = x;
      const py = y;
      const top = py - r * 2.6;

      ctx.strokeStyle = '#2A1008';
      ctx.lineWidth = r * 0.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px, py + r * 0.4);
      ctx.lineTo(px, top);
      ctx.stroke();
      ctx.lineCap = 'butt';

      // The pennant, always hanging to one side of the pole rather than
      // rotating with facing: a flag that swings around as the road turns
      // reads as a glitch, and the shape is doing identification work here,
      // not simulation.
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px + r * 1.5, top + r * 0.5);
      ctx.lineTo(px, top + r * 1.0);
      ctx.closePath();
      ctx.fillStyle = '#F2C24A';
      ctx.fill();
      ctx.lineWidth = r * 0.13;
      ctx.stroke();

      // Deliberately NO ring for the aura radius.
      //
      // It was a dashed circle on the ground, and a pack with three banners in
      // it was three overlapping dotted circles sliding across the board — the
      // radius is not the information the player needs anyway. What matters is
      // "these units are moving faster and that one is why", and the RALLIED
      // speed lines on each affected unit say exactly that, on the units
      // themselves, without drawing anything the size of a tower's range.
      break;
    }
    case 'shielded': {
      ctx.fillStyle = '#E4DAF0';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'zealot': {
      // Forward-swept horns. Once enraged they glow, because a unit that has
      // just doubled its speed must announce it or the player only finds out
      // when it reaches the exit.
      ctx.strokeStyle = e.enraged ? '#FFD24A' : COLORS.enemyEdge;
      ctx.lineWidth = r * (e.enraged ? 0.22 : 0.16);
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a + side * 0.9) * r * 0.7, y + Math.sin(a + side * 0.9) * r * 0.7);
        ctx.lineTo(x + Math.cos(a + side * 0.35) * r * 1.5, y + Math.sin(a + side * 0.35) * r * 1.5);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      if (e.enraged) {
        ctx.beginPath();
        ctx.arc(x, y, r * 1.2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 160, 60, 0.55)';
        ctx.lineWidth = r * 0.12;
        ctx.stroke();
      }
      break;
    }
    case 'splitter': {
      // A visible seam: this thing is going to come apart.
      ctx.strokeStyle = '#F0DCF4';
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a + Math.PI / 2) * r * 0.9, y + Math.sin(a + Math.PI / 2) * r * 0.9);
      ctx.lineTo(x + Math.cos(a - Math.PI / 2) * r * 0.9, y + Math.sin(a - Math.PI / 2) * r * 0.9);
      ctx.stroke();
      ctx.fillStyle = skin.trim;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(a + side * 1.57) * r * 0.45, y + Math.sin(a + side * 1.57) * r * 0.45, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'juggernaut': {
      // Heavy plating, plus a repair glow whenever it is actually healing —
      // that is the tell that you have stopped shooting it for too long.
      ctx.fillStyle = skin.trim;
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + a + 0.4;
        ctx.beginPath();
        ctx.rect(x + Math.cos(ang) * r * 0.6 - r * 0.16, y + Math.sin(ang) * r * 0.6 - r * 0.16, r * 0.32, r * 0.32);
        ctx.fill();
      }
      if (e.regenPerSecond > 0 && e.sinceHit >= e.regenDelay && e.hp < e.maxHp) {
        ctx.beginPath();
        ctx.arc(x, y, r * 1.25, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(120, 230, 160, 0.75)';
        ctx.lineWidth = r * 0.14;
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }

  // Bosses get a spiked crown so a boss is never mistaken for a big brute.
  if (e.mechanic !== null) {
    // Wide spikes with a thin outline. At r*0.1 the stroke was thicker than
    // the spike, so the crown filled solid dark and read as one stray horn
    // instead of a ring.
    ctx.fillStyle = '#F5D97A';
    ctx.strokeStyle = COLORS.enemyEdge;
    ctx.lineWidth = r * 0.045;
    const spikes = 9;
    const half = Math.PI / spikes;
    for (let i = 0; i < spikes; i++) {
      const ang = (i / spikes) * Math.PI * 2;
      const inner = r * 0.98;
      const outer = r * 1.38;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ang - half) * inner, y + Math.sin(ang - half) * inner);
      ctx.lineTo(x + Math.cos(ang) * outer, y + Math.sin(ang) * outer);
      ctx.lineTo(x + Math.cos(ang + half) * inner, y + Math.sin(ang + half) * inner);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // A repairing Ancient. Without this the player cannot tell the difference
    // between "my damage is not enough" and "I stopped shooting it for two
    // seconds and it healed" — which is the whole skill of the fight.
    if (e.mechanic === 'regenerator' && e.sinceHit >= BOSS_MECHANICS.regenCalmSeconds) {
      ctx.beginPath();
      ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120, 230, 160, 0.8)';
      ctx.lineWidth = r * 0.16;
      ctx.stroke();
    }

    // Armor aura, drawn so the Warlord's effect on its escort is visible.
    if (e.armorAura > 0) {
      ctx.beginPath();
      ctx.arc(x, y, e.armorAuraRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(230, 120, 110, 0.25)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function drawHpBar(ctx: CanvasRenderingContext2D, e: Enemy, isBoss: boolean): void {
  const w = e.radius * (isBoss ? 3.0 : 2.4);
  const h = Math.max(2.5, e.radius * (isBoss ? 0.3 : 0.26));
  const x = e.pos.x - w / 2;
  const y = e.pos.y - e.radius - h * (isBoss ? 3.0 : 2.4);
  ctx.fillStyle = COLORS.hpBack;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = isBoss ? '#F0C46A' : COLORS.hpFill;
  ctx.fillRect(x, y, w * Math.max(0, e.hp / e.maxHp), h);
}
