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

import { TOWERS, type TowerKind } from '../config/balance';

import type { Enemy, GameState, Projectile, Tower } from '../core/types';
import { COLORS, type Biome } from './palette';

/**
 * Which silhouette a tower uses. Keeping one shape per FAMILY across all three
 * ages is deliberate: a player who has learned that the frame-with-an-arm is
 * their single-target tower shouldn't have to relearn the board after
 * advancing. The age changes the palette and the detailing, not the read.
 */
const FAMILY: Record<TowerKind, 'thrower' | 'trap' | 'slower' | 'heavy'> = {
  thrower: 'thrower',
  trap: 'trap',
  slower: 'slower',
  heavy: 'heavy',
  ballista: 'thrower',
  oilFire: 'trap',
  frost: 'slower',
  siegeCannon: 'heavy',
  railgun: 'thrower',
  teslaCoil: 'trap',
  cryo: 'slower',
  singularity: 'heavy',
};

export function drawEntities(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  biome: Biome,
  selectedId: number | null,
): void {
  // Shadows in their own pass, so no unit's body is drawn under another's
  // shadow.
  for (const t of state.towers) shadow(ctx, t.pos.x, t.pos.y, state.layout.cellSize * 0.34, 0.4);
  for (const e of state.enemies) shadow(ctx, e.pos.x, e.pos.y + e.radius * 0.55, e.radius, 0.35);

  for (const t of state.towers) drawTower(ctx, t, state.layout.cellSize, biome, t.id === selectedId);
  for (const e of state.enemies) drawEnemy(ctx, e);
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
  ctx.strokeStyle = '#14100B';

  if (!def.onPath) drawPlinth(ctx, s, biome);

  switch (FAMILY[tower.kind]) {
    case 'thrower':
      drawThrower(ctx, s, tower.aim, biome);
      break;
    case 'trap':
      drawTrap(ctx, s, tower.cooldown, biome);
      break;
    case 'slower':
      drawSlower(ctx, s, biome);
      break;
    case 'heavy':
      drawHeavy(ctx, s, tower.aim, biome);
      break;
  }

  // Age pips: a small mark per age above Stone, so a Middle Age tower standing
  // next to a Stone Age one is distinguishable at a glance. That matters
  // precisely because advancing leaves the old towers on the board.
  const towerAge = TOWERS[tower.kind]!.age;
  if (towerAge > 0) {
    ctx.fillStyle = biome.accent;
    ctx.strokeStyle = '#14100B';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < towerAge; i++) {
      ctx.beginPath();
      ctx.moveTo(-s * 0.9 + i * s * 0.3, -s * 0.85);
      ctx.lineTo(-s * 0.75 + i * s * 0.3, -s * 1.1);
      ctx.lineTo(-s * 0.6 + i * s * 0.3, -s * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  drawLevelPips(ctx, s, tower.level, biome.accent);
  ctx.restore();

  if (selected) {
    ctx.beginPath();
    ctx.arc(tower.pos.x, tower.pos.y, s * 1.35, 0, Math.PI * 2);
    ctx.strokeStyle = biome.accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
}

/**
 * Stacked stone base every above-ground tower sits on. Two offset ellipses
 * read as courses of piled rock and, more importantly, give every tower the
 * same footprint so the board scans as a set of placed objects.
 */
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

/**
 * A sling on a timber frame. The arm is drawn LIGHT and extends well past the
 * base: an arm the same colour as the frame, contained inside the footprint,
 * just reads as a lump — the overhang is what makes the aim direction legible
 * from across the board.
 */
function drawThrower(
  ctx: CanvasRenderingContext2D,
  s: number,
  aim: number,
  biome: Biome,
): void {
  // Posts FIRST, so the arm swings in front of them. Drawing the frame last
  // hides the arm behind it and the whole tower collapses into a cone.
  ctx.fillStyle = '#5E4830';
  ctx.beginPath();
  ctx.moveTo(-s * 0.42, s * 0.3);
  ctx.lineTo(-s * 0.2, -s * 0.55);
  ctx.lineTo(s * 0.2, -s * 0.55);
  ctx.lineTo(s * 0.42, s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.save();
  ctx.rotate(aim);

  // Throwing arm, light against the dark frame and overhanging the base so
  // the aim direction is legible from across the board.
  ctx.fillStyle = '#A8814F';
  ctx.beginPath();
  ctx.moveTo(-s * 0.3, -s * 0.18);
  ctx.lineTo(s * 1.3, -s * 0.11);
  ctx.lineTo(s * 1.3, s * 0.11);
  ctx.lineTo(-s * 0.3, s * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // The rock in the sling, at the tip where it can be seen.
  ctx.beginPath();
  ctx.arc(s * 1.2, 0, s * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = biome.rockLit;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawTrap(
  ctx: CanvasRenderingContext2D,
  s: number,
  cooldown: number,
  biome: Biome,
): void {
  // A pit dug into the track, not a hole punched through the render. A solid
  // near-black oval reads as missing geometry, and a path lined with them
  // turns into a caterpillar of dark blobs — so this stays earth-coloured and
  // keeps a lit rim so the surrounding dirt still reads through.
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.86, s * 0.66, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#4A3722';
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, s * 0.08, s * 0.68, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#2E2214';
  ctx.fill();

  const armed = Math.max(0, 1 - Math.max(0, cooldown) / 1.6);
  if (armed <= 0.02) return;

  // Five spikes rather than eight: enough to read as a trap, few enough that
  // the tower doesn't out-shout the enemies walking over it.
  ctx.fillStyle = biome.rockLit;
  ctx.strokeStyle = '#1B140C';
  ctx.lineWidth = s * 0.07;
  const spikes: [number, number][] = [
    [-0.5, 0.18],
    [-0.22, -0.2],
    [0.06, 0.22],
    [0.34, -0.16],
    [0.56, 0.14],
  ];
  for (const [ox, oy] of spikes) {
    const px = ox * s;
    const py = oy * s;
    const h = s * 0.4 * armed;
    ctx.beginPath();
    ctx.moveTo(px - s * 0.11, py + s * 0.1);
    ctx.lineTo(px, py - h);
    ctx.lineTo(px + s * 0.11, py + s * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * A frozen pool with radiating frost spurs. Deliberately the only tower with
 * no barrel and no aim: it must not look like it shoots, because a player who
 * expects damage from it will misread every fight it is in.
 */
function drawSlower(ctx: CanvasRenderingContext2D, s: number, biome: Biome): void {
  ctx.beginPath();
  ctx.arc(0, -s * 0.08, s * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = '#2E5A68';
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(-s * 0.2, -s * 0.28, s * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = '#5E93A4';
  ctx.fill();

  ctx.strokeStyle = '#D6F0F8';
  ctx.lineWidth = s * 0.13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    ctx.moveTo(Math.cos(a) * s * 0.58, Math.sin(a) * s * 0.58 - s * 0.08);
    ctx.lineTo(-Math.cos(a) * s * 0.58, -Math.sin(a) * s * 0.58 - s * 0.08);
  }
  ctx.stroke();
  ctx.strokeStyle = '#14100B';
  void biome;
}

/** A boulder in a throwing cradle. Bulk is the read: this thing is slow. */
function drawHeavy(ctx: CanvasRenderingContext2D, s: number, aim: number, biome: Biome): void {
  ctx.save();
  ctx.rotate(aim);
  ctx.fillStyle = '#4E3A24';
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, -s * 0.5);
  ctx.lineTo(s * 1.0, -s * 0.34);
  ctx.lineTo(s * 1.0, s * 0.34);
  ctx.lineTo(-s * 0.7, s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, -s * 0.18, s * 0.74, 0, Math.PI * 2);
  ctx.fillStyle = biome.rock;
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-s * 0.22, -s * 0.4, s * 0.36, 0, Math.PI * 2);
  ctx.fillStyle = biome.rockLit;
  ctx.fill();
}

/** Small notches showing upgrade level, so the board shows your investment. */
function drawLevelPips(
  ctx: CanvasRenderingContext2D,
  s: number,
  level: number,
  accent: string,
): void {
  if (level <= 1) return;
  ctx.fillStyle = accent;
  ctx.strokeStyle = '#14100B';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < level - 1; i++) {
    const x = (i - (level - 2) / 2) * s * 0.34;
    ctx.beginPath();
    ctx.arc(x, s * 0.88, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Projectiles
// ---------------------------------------------------------------------------

function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, biome: Biome): void {
  const r = p.splash > 0 ? 7 : 4.5;
  ctx.beginPath();
  ctx.arc(p.pos.x, p.pos.y, r, 0, Math.PI * 2);
  ctx.fillStyle = p.splash > 0 ? biome.rock : biome.rockLit;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#14100B';
  ctx.stroke();
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
  healer: { body: '#A8D89A', bodyDark: '#6A9C60', trim: '#3A5A34' },
  bossSummoner: { body: '#D89A6A', bodyDark: '#95603A', trim: '#4A2E1A' },
  bossWarlord: { body: '#D07070', bodyDark: '#8E4040', trim: '#4A2020' },
  bossRegenerator: { body: '#7AC6D8', bodyDark: '#40808E', trim: '#1E4048' },
};

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy): void {
  const { x, y } = e.pos;
  const r = e.radius;
  const a = Math.atan2(e.dir.y, e.dir.x);
  const skin = SKINS[e.kind] ?? SKINS.runner!;
  const isBoss = e.mechanic !== null;

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

  // Slowed units get a frost ring — the player has to be able to see that the
  // slower is actually doing something.
  if (e.slowTimer > 0) {
    ctx.beginPath();
    ctx.arc(x, y, r * 1.28, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(160, 224, 240, 0.85)';
    ctx.lineWidth = r * 0.14;
    ctx.stroke();
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
    case 'healer': {
      // A cross. Unambiguous, and it is the one unit the player must identify
      // instantly to react correctly.
      ctx.fillStyle = '#EAFBE4';
      const t = r * 0.22;
      ctx.fillRect(x - t / 2, y - r * 0.5, t, r);
      ctx.fillRect(x - r * 0.5, y - t / 2, r, t);
      // Faint aura ring showing exactly who it's keeping alive.
      ctx.beginPath();
      ctx.arc(x, y, e.healRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(140, 230, 130, 0.22)';
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    }
    case 'shielded': {
      ctx.fillStyle = '#E4DAF0';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
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
