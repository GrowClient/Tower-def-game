/**
 * Sound effects, synthesised in code.
 *
 * There are no audio files in this project and there never will be — the same
 * rule as the art. Every sound here is built from oscillators and white noise
 * shaped by envelopes, which is enough for thuds, cracks, whooshes and stings.
 *
 * This lives outside `core/` and is driven entirely by the SimEvent queue, so
 * the simulation stays unaware that sound exists — exactly like the fx layer.
 *
 * Two practical constraints shape the design:
 *
 *  - **Browsers refuse to start audio without a user gesture.** The context is
 *    created lazily and resumed on the first tap, so nothing is heard (and no
 *    console warning is produced) until the player touches the screen.
 *  - **A busy wave emits dozens of events per frame.** Playing all of them at
 *    once is both deafening and a CPU sink, so each sound has a minimum
 *    retrigger gap and there is a hard cap on voices per frame.
 */

import type { SimEvent, TowerKind } from '../core/types';

type SoundId =
  | 'shootLight'
  | 'shootHeavy'
  | 'shootRail'
  | 'trapSnap'
  | 'zap'
  | 'hit'
  | 'kill'
  | 'leak'
  | 'place'
  | 'upgrade'
  | 'sell'
  | 'denied'
  | 'waveStart'
  | 'bossSpawn'
  | 'bossKill'
  | 'advance'
  | 'perk'
  | 'gameOver';

/** Minimum seconds between retriggers of the same sound. */
const THROTTLE: Record<SoundId, number> = {
  shootLight: 0.05,
  shootHeavy: 0.08,
  shootRail: 0.05,
  trapSnap: 0.07,
  zap: 0.06,
  hit: 0.045,
  kill: 0.04,
  leak: 0.12,
  place: 0,
  upgrade: 0,
  sell: 0,
  denied: 0.15,
  waveStart: 0,
  bossSpawn: 0,
  bossKill: 0,
  advance: 0,
  perk: 0,
  gameOver: 0,
};

/** Hard cap on how many voices a single frame may start. */
const MAX_VOICES_PER_FRAME = 8;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let muted = false;
const lastPlayed = new Map<SoundId, number>();

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master && ctx) {
    master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.01);
  }
}

/**
 * Create or resume the audio context. Must be called from inside a user
 * gesture; `main.ts` hooks it to the first pointerdown.
 */
export function unlockAudio(): void {
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // No Web Audio at all — the game just stays silent.
    try {
      ctx = new Ctor();
    } catch {
      return;
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    noiseBuffer = makeNoiseBuffer(ctx);
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/**
 * Turn one frame's simulation events into sounds. Called by main.ts with the
 * drained queue, so audio never reaches into game state.
 */
export function playEvents(events: SimEvent[]): void {
  if (!ctx || !master || muted || events.length === 0) return;

  let voices = 0;
  for (const e of events) {
    if (voices >= MAX_VOICES_PER_FRAME) break;
    const id = soundFor(e);
    if (id === null) continue;
    if (play(id)) voices++;
  }
}

/** Map a simulation event onto a sound, or null for events that are silent. */
function soundFor(e: SimEvent): SoundId | null {
  switch (e.type) {
    case 'towerFired':
      return shootSoundFor(e.kind);
    case 'chainArc':
      return 'zap';
    case 'enemyHit':
      return 'hit';
    case 'enemyKilled':
      return 'kill';
    case 'enemyLeaked':
      return 'leak';
    case 'towerPlaced':
      return 'place';
    case 'towerUpgraded':
      return 'upgrade';
    case 'towerSold':
      return 'sell';
    case 'purchaseDenied':
      return 'denied';
    case 'waveStarted':
      return 'waveStart';
    case 'bossSpawned':
      return 'bossSpawn';
    case 'bossKilled':
      return 'bossKill';
    case 'ageAdvanced':
      return 'advance';
    case 'perkChosen':
      return 'perk';
    case 'gameOver':
      return 'gameOver';
    default:
      // enemySpawned, shieldAbsorbed, enemyHealed, waveCleared, perkDraftOpened
      // are deliberately silent — they fire constantly and would turn a busy
      // wave into noise.
      return null;
  }
}

/** A tower's shot should sound like the thing it is: heft, snap or crack. */
function shootSoundFor(kind: TowerKind): SoundId {
  switch (kind) {
    case 'heavy':
    case 'siegeCannon':
    case 'singularity':
      return 'shootHeavy';
    case 'railgun':
      return 'shootRail';
    case 'trap':
    case 'oilFire':
      return 'trapSnap';
    case 'teslaCoil':
      return 'zap';
    default:
      return 'shootLight';
  }
}

function play(id: SoundId): boolean {
  if (!ctx || !master) return false;
  const now = ctx.currentTime;
  const gap = THROTTLE[id];
  const last = lastPlayed.get(id) ?? -Infinity;
  if (now - last < gap) return false;
  lastPlayed.set(id, now);

  switch (id) {
    // A rock leaving a sling: a short filtered noise whoosh.
    case 'shootLight':
      noise(now, 0.09, 0.16, 'bandpass', 900, 1.6);
      break;
    // Heavy artillery: low body plus a click of transient so it doesn't turn
    // to mush on a phone speaker with no bass response.
    case 'shootHeavy':
      tone(now, 'sine', 150, 55, 0.22, 0.32);
      noise(now, 0.05, 0.12, 'lowpass', 700, 1);
      break;
    case 'shootRail':
      tone(now, 'sawtooth', 1400, 260, 0.13, 0.12);
      noise(now, 0.06, 0.09, 'highpass', 2200, 1);
      break;
    case 'trapSnap':
      noise(now, 0.05, 0.2, 'highpass', 1800, 1);
      tone(now, 'square', 320, 140, 0.06, 0.07);
      break;
    case 'zap':
      tone(now, 'square', 2400, 700, 0.07, 0.07);
      noise(now, 0.05, 0.1, 'highpass', 3000, 1);
      break;
    // Kept very quiet: this one plays dozens of times a wave.
    case 'hit':
      noise(now, 0.03, 0.045, 'bandpass', 1500, 3);
      break;
    case 'kill':
      noise(now, 0.11, 0.13, 'lowpass', 1100, 1);
      tone(now, 'triangle', 220, 70, 0.1, 0.08);
      break;
    // A life lost has to cut through everything else — it's the only sound
    // that means you are losing.
    case 'leak':
      tone(now, 'sawtooth', 300, 90, 0.4, 0.3);
      break;
    case 'place':
      tone(now, 'sine', 180, 120, 0.13, 0.22);
      noise(now, 0.05, 0.1, 'lowpass', 900, 1);
      break;
    case 'upgrade':
      arpeggio(now, [440, 660, 880], 0.07, 0.16);
      break;
    case 'sell':
      arpeggio(now, [880, 620], 0.07, 0.14);
      break;
    case 'denied':
      tone(now, 'square', 150, 120, 0.13, 0.12);
      break;
    case 'waveStart':
      arpeggio(now, [330, 495], 0.11, 0.16);
      break;
    case 'bossSpawn':
      tone(now, 'sawtooth', 90, 55, 0.9, 0.3);
      tone(now, 'sine', 45, 30, 0.9, 0.25);
      break;
    case 'bossKill':
      tone(now, 'sine', 200, 40, 0.8, 0.4);
      noise(now, 0.5, 0.3, 'lowpass', 800, 1);
      break;
    // Age advancement: a rising sweep with a chord on top. The biggest moment
    // in a run should be the biggest sound in it.
    case 'advance':
      tone(now, 'sawtooth', 160, 720, 0.7, 0.22);
      arpeggio(now + 0.18, [523, 659, 784, 1047], 0.16, 0.2);
      break;
    case 'perk':
      arpeggio(now, [660, 880, 1320], 0.1, 0.18);
      break;
    case 'gameOver':
      arpeggio(now, [440, 370, 294, 220], 0.34, 0.26);
      break;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Synthesis primitives
// ---------------------------------------------------------------------------

/** An oscillator whose pitch slides from `from` to `to` over its lifetime. */
function tone(
  at: number,
  type: OscillatorType,
  from: number,
  to: number,
  duration: number,
  peak: number,
): void {
  if (!ctx || !master) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + duration);

  // A few ms of attack instead of an instant start: a hard edge on a square
  // wave clicks audibly.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  osc.connect(gain);
  gain.connect(master);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/** A burst of filtered white noise — the basis of every impact and whoosh. */
function noise(
  at: number,
  duration: number,
  peak: number,
  filterType: BiquadFilterType,
  frequency: number,
  q: number,
): void {
  if (!ctx || !master || !noiseBuffer) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = q;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(peak, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  src.start(at);
  src.stop(at + duration + 0.02);
}

function arpeggio(at: number, freqs: number[], total: number, peak: number): void {
  const step = total / freqs.length;
  freqs.forEach((f, i) => tone(at + i * step, 'triangle', f, f, step * 1.6, peak));
}

/** One second of white noise, generated once and reused by every noise voice. */
function makeNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.floor(context.sampleRate);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  // Math.random is fine here: this is presentation, not simulation, and the
  // determinism rule applies only to `core/`.
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
