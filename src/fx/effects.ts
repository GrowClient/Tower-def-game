/**
 * The juice layer: particles, screenshake, floating numbers, slow motion.
 *
 * This is the SECOND consumer of the simulation's event queue, alongside
 * `audio/sfx.ts`. The sim pushes plain data — `enemyKilled`, `bossKilled`,
 * `ageAdvanced` — and this file turns it into things that move. The
 * simulation is not allowed to know any of it exists, which is why nothing
 * here is ever called from `core/` and why every effect is driven by an event
 * rather than by a callback the sim would have to hold.
 *
 * Two hard rules for this file:
 *
 *  - **It owns its own state.** Nothing here is written onto `GameState`. A
 *    replay of the same seed must produce the same run whether or not anything
 *    was ever drawn, so a particle count can never be something the sim can
 *    see.
 *  - **It runs on WALL-CLOCK time, not sim time.** Effects keep animating
 *    while the game is paused and while a perk draft holds the wave clock;
 *    freezing the sim should not freeze the smoke.
 *
 * `Math.random` is fine in here. The determinism rule applies to `core/`;
 * seeding the sparks would buy nothing and cost a shared RNG stream.
 */

import type { AbilityKey, SimEvent, Vec2 } from '../core/types';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
// Presentation, so these live here rather than in config/balance.ts — none of
// them changes how the game plays, only how hard it hits.

const FX = {
  /** Hard caps. A wave-30 flood emits hundreds of events per second, and an
   *  uncapped particle array is the one thing here that can cost frames. */
  maxParticles: 520,
  maxFloaters: 34,
  /** Damage numbers spawned per frame, at most. Beyond this they overlap into
   *  an unreadable smear anyway, so the cap costs nothing legible. */
  floatersPerFrame: 3,

  /**
   * Shake is reserved for events that MATTER, and nothing else.
   *
   * Ordinary shots landing and ordinary kills used to add trauma. On a mature
   * board that is dozens of impacts a second, and since trauma accumulates
   * faster than it decays the screen simply never stopped moving — playable
   * for about a minute and unbearable after that. Shots, kills and placements
   * now shake by exactly zero; they have sparks, debris and recoil to sell the
   * impact. Losing a life, a boss dying and an age turning still shake, because
   * those happen a handful of times in a run and are supposed to land hard.
   */
  traumaPerLeak: 0.4,
  traumaPerBossSpawn: 0.35,
  traumaDecay: 2.2,
  maxShake: 15,

  /** Boss-kill slow motion. */
  slowmoScale: 0.28,
  slowmoSeconds: 0.9,

  flashDecay: 2.6,
  popDecay: 5.5,
} as const;

/**
 * Debris tints per enemy family. Deliberately NOT the unit skins from
 * `render/drawEntities.ts` — a burst reads better slightly hotter and more
 * saturated than the body it came from, and copying the skins would tie the fx
 * layer to the renderer for no gain.
 */
const DEBRIS: Record<string, string> = {
  runner: '#E8C88A',
  brute: '#A07850',
  swarm: '#D4C08E',
  armored: '#AEB8C2',
  shielded: '#C8B0DC',
  warchief: '#F2D97A',
  zealot: '#F0B872',
  splitter: '#DCA0E0',
  juggernaut: '#9CA8BC',
  bossSummoner: '#F0A870',
  bossWarlord: '#E88080',
  bossRegenerator: '#8AD8EA',
};

/** One tint per ability, matching its tray icon so a cast and its card agree. */
const ABILITY_TINT: Record<AbilityKey, string> = {
  stoneRain: '#B9A98C',
  tarPit: '#6E6882',
  arrowRain: '#DCE4E8',
  warHorn: '#F2C24A',
  orbitalLance: '#BEFAFF',
  nullField: '#C08AE8',
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  /** Downward pull. Sparks fall, smoke rises, ring shards drift flat. */
  gravity: number;
  /** Drawn as a square shard rather than a dot — shards read as debris. */
  spin: number;
  angle: number;
}

export interface Floater {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
}

/** Squash/stretch memory for one enemy, keyed by its sim id. */
interface Pop {
  /** Counts down from 1 after spawning — the unit pops into existence. */
  spawn: number;
  /** Counts down from 1 after taking a hit — a quick flinch. */
  hit: number;
}

export interface FxState {
  particles: Particle[];
  floaters: Floater[];
  shockwaves: Shockwave[];
  arcs: Arc[];

  /** 0..1. Squared before it becomes an offset. */
  trauma: number;
  shakeX: number;
  shakeY: number;

  /** Full-screen flash, 0..1. */
  flash: number;
  flashColor: string;

  /**
   * Multiplier applied to the frame's elapsed time before it is handed to the
   * fixed-step accumulator. Slow motion therefore runs FEWER sim steps per
   * frame; it never changes `SIM.dt`, so the simulation cannot tell that a
   * boss died dramatically.
   */
  timeScale: number;
  slowmo: number;

  pops: Map<number, Pop>;
}

export function newFx(): FxState {
  return {
    particles: [],
    floaters: [],
    shockwaves: [],
    arcs: [],
    trauma: 0,
    shakeX: 0,
    shakeY: 0,
    flash: 0,
    flashColor: '#FFFFFF',
    timeScale: 1,
    slowmo: 0,
    pops: new Map(),
  };
}

// ---------------------------------------------------------------------------
// Event intake
// ---------------------------------------------------------------------------

/**
 * Turn one frame's simulation events into effects.
 *
 * `enemyIdAt` is not available — events carry positions, not ids — so
 * squash/stretch is keyed by the id the renderer can see. Spawn and hit pops
 * are therefore driven from the enemy list in `updateFx`, and this function
 * handles everything that is a one-shot burst.
 */
export function consumeEvents(fx: FxState, events: SimEvent[], accent: string): void {
  let floatersThisFrame = 0;

  for (const e of events) {
    switch (e.type) {
      // Damage is read from the health bar, NOT from a number. Floating damage
      // numbers over a crowd of twenty units is a wall of digits that hides the
      // thing it is describing — the bar is the readable channel, so the hit
      // gets sparks and shake and nothing to read.
      case 'enemyHit': {
        sparks(fx, e.at, 3, '#FFE9B0', 90);
        break;
      }

      case 'shieldAbsorbed':
        // A shield eating a hit has to look different from a hit landing, or
        // the player cannot tell why their damage is doing nothing.
        sparks(fx, e.at, 6, '#9FD8F0', 130);
        addShockwave(fx, e.at, 34, 'rgba(159, 216, 240, 0.75)', 3);
        break;

      case 'enemyKilled': {
        burst(fx, e.at, 12, DEBRIS[e.kind] ?? '#E8C88A');
        if (e.bounty > 0 && floatersThisFrame < FX.floatersPerFrame) {
          addFloater(fx, e.at, `+${e.bounty}`, '#F0C46A', 20);
          floatersThisFrame++;
        }
        break;
      }

      case 'bossKilled':
        fx.trauma = 1;
        // The one moment the game stops to let you look at it.
        fx.slowmo = FX.slowmoSeconds;
        burst(fx, e.at, 60, DEBRIS[e.kind] ?? '#F0A870');
        addShockwave(fx, e.at, 300, 'rgba(255, 232, 180, 0.9)', 9);
        addShockwave(fx, e.at, 190, 'rgba(255, 140, 70, 0.8)', 6);
        fx.flash = 0.45;
        fx.flashColor = '#FFE8B4';
        break;

      case 'enemyLeaked':
        fx.trauma = Math.min(1, fx.trauma + FX.traumaPerLeak);
        // Deliberately modest. A leak flash should be a punch, and when a wave
        // is leaking continuously the per-leak flashes overlap into a solid
        // red wash that hides the board exactly when you most need to read it.
        fx.flash = Math.max(fx.flash, 0.26);
        fx.flashColor = '#F4664F';
        addFloater(fx, e.at, `-${e.livesLost}`, '#F4664F', 30);
        addShockwave(fx, e.at, 120, 'rgba(244, 102, 79, 0.85)', 5);
        break;

      case 'enemySpawned':
        sparks(fx, e.at, 4, '#B8A98A', 60);
        break;

      // Minting is the one place gold visibly becomes something else, so it
      // gets both numbers: what was spent and what came out.
      case 'diamondsMinted':
        if (floatersThisFrame < FX.floatersPerFrame) {
          addFloater(fx, e.at, `+${e.amount}◆`, '#8FE3FF', 30);
          floatersThisFrame++;
        }
        sparks(fx, e.at, 12, '#8FE3FF', 130);
        addShockwave(fx, e.at, 60, 'rgba(143, 227, 255, 0.8)', 3);
        break;

      // A trap dumping a full bank looks like the thing you were waiting for;
      // a routine trigger is left alone, or a lane of traps becomes a strobe.
      case 'trapTriggered':
        if (e.charge >= 1) {
          burst(fx, e.at, 10 + Math.round(e.charge * 8), '#FFD24A');
          addShockwave(fx, e.at, 40 + e.charge * 34, 'rgba(255, 210, 74, 0.85)', 4);
        }
        break;

      // Abilities are the biggest single spend in the game, so they get the
      // loudest feedback that isn't reserved for a boss dying.
      case 'abilityCast':
        addShockwave(fx, e.at, Math.max(90, e.radius * 1.6), ABILITY_TINT[e.key], 7);
        sparks(fx, e.at, 26, ABILITY_TINT[e.key], 220);
        if (e.key === 'orbitalLance') {
          // The one ability that is a single event rather than a duration, so
          // it is the only one that earns shake and a flash.
          fx.trauma = Math.min(1, fx.trauma + 0.55);
          fx.flash = Math.max(fx.flash, 0.35);
          fx.flashColor = '#EAFBFF';
          burst(fx, e.at, 40, '#BEFAFF');
        }
        break;

      case 'abilityTick':
        sparks(fx, e.at, 5, ABILITY_TINT[e.key], 120);
        break;

      case 'bossSpawned':
        addShockwave(fx, e.at, 200, 'rgba(240, 120, 90, 0.7)', 6);
        fx.trauma = Math.min(1, fx.trauma + FX.traumaPerBossSpawn);
        break;

      // No trauma: you place towers constantly, and a thump every time you
      // spend gold is exactly the sort of shake that wears a player out.
      case 'towerPlaced':
        addShockwave(fx, e.at, 70, hexToRgba(accent, 0.8), 4);
        sparks(fx, e.at, 10, '#C8B48A', 120);
        break;

      case 'towerUpgraded':
        // Silver at 2, gold at 3 — the burst matches what the tower just
        // became, so the upgrade reads before you look at the tower.
        addShockwave(fx, e.at, 90, e.level >= 3 ? 'rgba(232,185,61,0.9)' : 'rgba(196,203,216,0.9)', 5);
        sparks(fx, e.at, 16, e.level >= 3 ? '#FFF3B0' : '#F2F6FC', 150);
        break;

      case 'towerSold':
        sparks(fx, e.at, 12, '#E8A08A', 110);
        addFloater(fx, e.at, `+${e.refund}`, '#E8A08A', 20);
        break;

      // Payday. This is the one moment an economy building does anything at
      // all, so it gets a proper coin fountain and a number big enough to read
      // from across the board — otherwise a mine is a building that visibly
      // does nothing for the entire run.
      case 'goldMined':
        addFloater(fx, e.at, `+${e.amount}g`, '#FFD766', 30, 1.5);
        coinFountain(fx, e.at);
        addShockwave(fx, e.at, 66, 'rgba(245, 200, 70, 0.85)', 4);
        break;

      case 'chainArc':
        // The arc itself is drawn by drawEffects; the sparks mark its ends.
        sparks(fx, e.to, 4, '#BFF4FF', 140);
        addArc(fx, e.from, e.to);
        break;

      case 'ageAdvanced':
        fx.trauma = 1;
        fx.flash = 1;
        fx.flashColor = accent;
        // A wave that crosses the whole board: the board itself is changing.
        addShockwave(fx, { x: 800, y: 460 }, 1500, hexToRgba(accent, 0.9), 14);
        addShockwave(fx, { x: 800, y: 460 }, 1100, 'rgba(255,255,255,0.7)', 8);
        break;

      case 'perkChosen':
        fx.flash = Math.max(fx.flash, 0.35);
        fx.flashColor = accent;
        break;

      case 'purchaseDenied':
        addFloater(fx, e.at, 'NO GOLD', '#F4664F', 18);
        break;

      case 'gameOver':
        fx.flash = 0.8;
        fx.flashColor = '#F4664F';
        fx.trauma = 1;
        break;

      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Chain arcs
// ---------------------------------------------------------------------------
// Tesla arcs are their own short-lived thing rather than particles: they are a
// line between two points, and they need to fade over a handful of frames.

export interface Arc {
  from: Vec2;
  to: Vec2;
  life: number;
  maxLife: number;
}

function addArc(fx: FxState, from: Vec2, to: Vec2): void {
  push(fx.arcs, { from: { ...from }, to: { ...to }, life: 0.16, maxLife: 0.16 }, 40);
}

// ---------------------------------------------------------------------------
// Emitters
// ---------------------------------------------------------------------------

function push<T>(list: T[], item: T, cap: number): void {
  // Drop the OLDEST rather than refusing the newest: what just happened is
  // always more interesting than what happened four hundred sparks ago.
  if (list.length >= cap) list.shift();
  list.push(item);
}

function sparks(fx: FxState, at: Vec2, count: number, color: string, speed: number): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.65);
    push(
      fx.particles,
      {
        x: at.x,
        y: at.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.22 + Math.random() * 0.25,
        maxLife: 0.47,
        size: 1.6 + Math.random() * 2.2,
        color,
        gravity: 210,
        spin: (Math.random() - 0.5) * 14,
        angle: Math.random() * Math.PI,
      },
      FX.maxParticles,
    );
  }
}

/** A death burst: chunkier, slower and longer-lived than a spark shower. */
function burst(fx: FxState, at: Vec2, count: number, color: string): void {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * 190;
    push(
      fx.particles,
      {
        x: at.x,
        y: at.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        life: 0.4 + Math.random() * 0.45,
        maxLife: 0.85,
        size: 2.4 + Math.random() * 3.6,
        color,
        gravity: 330,
        spin: (Math.random() - 0.5) * 18,
        angle: Math.random() * Math.PI,
      },
      FX.maxParticles,
    );
  }
}

function addFloater(
  fx: FxState,
  at: Vec2,
  text: string,
  color: string,
  size: number,
  lifeScale = 1,
): void {
  const life = 0.85 * lifeScale;
  push(
    fx.floaters,
    {
      // Jittered so two simultaneous numbers don't stack into one blur.
      x: at.x + (Math.random() - 0.5) * 14,
      y: at.y - 10,
      vy: -46 - Math.random() * 22,
      life,
      maxLife: life,
      text,
      color,
      size,
    },
    FX.maxFloaters,
  );
}

/**
 * Coins tossed up out of the building and falling back. Deliberately slower
 * and heavier than a spark shower: this should read as money being counted
 * out, not as an explosion.
 */
function coinFountain(fx: FxState, at: Vec2): void {
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
    const v = 120 + Math.random() * 130;
    push(
      fx.particles,
      {
        x: at.x + (Math.random() - 0.5) * 22,
        y: at.y,
        vx: Math.cos(a) * v * 0.7,
        vy: Math.sin(a) * v,
        life: 0.6 + Math.random() * 0.35,
        maxLife: 0.95,
        size: 3.4 + Math.random() * 2.2,
        color: i % 3 === 0 ? '#FFF0B0' : '#F5C842',
        gravity: 420,
        spin: (Math.random() - 0.5) * 22,
        angle: Math.random() * Math.PI,
      },
      FX.maxParticles,
    );
  }
}

function addShockwave(
  fx: FxState,
  at: Vec2,
  maxRadius: number,
  color: string,
  width: number,
): void {
  push(
    fx.shockwaves,
    { x: at.x, y: at.y, radius: 0, maxRadius, life: 0.42, maxLife: 0.42, color, width },
    24,
  );
}

// ---------------------------------------------------------------------------
// Per-frame update
// ---------------------------------------------------------------------------

/**
 * Advance every effect by one rendered frame.
 *
 * `dt` here is WALL-CLOCK seconds, not sim time — see the note at the top.
 * `liveEnemyIds` lets the pop table drop entries for units that no longer
 * exist; without it the map grows for the whole run.
 */
export function updateFx(fx: FxState, dt: number, liveEnemyIds: Set<number>): void {
  // Slow motion eases back rather than snapping, so the moment has a tail.
  if (fx.slowmo > 0) {
    fx.slowmo = Math.max(0, fx.slowmo - dt);
    const t = fx.slowmo / FX.slowmoSeconds;
    fx.timeScale = FX.slowmoScale + (1 - FX.slowmoScale) * (1 - t) * (1 - t);
  } else {
    fx.timeScale = 1;
  }

  fx.trauma = Math.max(0, fx.trauma - FX.traumaDecay * dt);
  const shake = fx.trauma * fx.trauma * FX.maxShake;
  fx.shakeX = (Math.random() * 2 - 1) * shake;
  fx.shakeY = (Math.random() * 2 - 1) * shake;

  fx.flash = Math.max(0, fx.flash - FX.flashDecay * dt);

  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i]!;
    p.life -= dt;
    if (p.life <= 0) {
      fx.particles.splice(i, 1);
      continue;
    }
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.angle += p.spin * dt;
    // Air drag, so a burst decelerates instead of flying off in a straight
    // line — the difference between debris and confetti.
    p.vx *= 1 - Math.min(1, 2.4 * dt);
  }

  for (let i = fx.floaters.length - 1; i >= 0; i--) {
    const f = fx.floaters[i]!;
    f.life -= dt;
    if (f.life <= 0) {
      fx.floaters.splice(i, 1);
      continue;
    }
    f.y += f.vy * dt;
    f.vy += 42 * dt; // arc up then settle
  }

  for (let i = fx.shockwaves.length - 1; i >= 0; i--) {
    const w = fx.shockwaves[i]!;
    w.life -= dt;
    if (w.life <= 0) {
      fx.shockwaves.splice(i, 1);
      continue;
    }
    // Ease out: fast expansion that slows, which reads as a real blast front.
    const t = 1 - w.life / w.maxLife;
    w.radius = w.maxRadius * (1 - (1 - t) * (1 - t));
  }

  for (let i = fx.arcs.length - 1; i >= 0; i--) {
    fx.arcs[i]!.life -= dt;
    if (fx.arcs[i]!.life <= 0) fx.arcs.splice(i, 1);
  }

  for (const [id, pop] of fx.pops) {
    if (!liveEnemyIds.has(id)) {
      fx.pops.delete(id);
      continue;
    }
    pop.spawn = Math.max(0, pop.spawn - FX.popDecay * dt);
    pop.hit = Math.max(0, pop.hit - FX.popDecay * 1.6 * dt);
  }
}

/**
 * Register the squash/stretch triggers for the enemies currently on screen.
 *
 * Driven from the enemy list rather than from events because events carry
 * positions and not ids, and the effect has to follow a specific unit. `flash`
 * is already on the enemy for the renderer's hit flash, so a rising flash is
 * exactly "it was hit this frame".
 */
export function trackEnemies(
  fx: FxState,
  enemies: readonly { id: number; flash: number }[],
): void {
  for (const e of enemies) {
    let pop = fx.pops.get(e.id);
    if (!pop) {
      pop = { spawn: 1, hit: 0 };
      fx.pops.set(e.id, pop);
    }
    if (e.flash > 0.1 && pop.hit < 0.2) pop.hit = 1;
  }
}

/**
 * Non-uniform scale for one enemy: pops in on spawn, flinches on a hit.
 * Returns 1,1 for anything with no entry, so the renderer needs no branch.
 */
export function popScale(fx: FxState, id: number): { sx: number; sy: number } {
  const pop = fx.pops.get(id);
  if (!pop) return { sx: 1, sy: 1 };

  // Spawn: overshoot wide-and-flat, settle to round.
  const s = pop.spawn;
  const h = pop.hit;
  const sx = 1 + s * 0.45 - h * 0.28;
  const sy = 1 - s * 0.35 + h * 0.3;
  return { sx, sy };
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
