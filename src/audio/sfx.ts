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

import type { AbilityKey, SimEvent, TowerKind } from '../core/types';

/**
 * One voice per weapon, not one per rough category.
 *
 * Five buckets used to cover fourteen towers, so a sling, a bowstring and a
 * spike pit were the same noise, and advancing an age changed how the board
 * looked without changing how it sounded. A shot is the main feedback a tower
 * gives, and it should tell you *which* tower fired without you looking: sinew
 * and stone in the Stone Age, timber and gunpowder in the Middle Age, electric
 * and metallic in the Tech Age.
 */
type SoundId =
  // --- Stone Age: sinew, wood, rock. Nothing metallic, nothing electric. ---
  | 'slingThrow'
  | 'spikeSnap'
  | 'mudSquelch'
  | 'boulderLaunch'
  | 'fireCrackle'
  // --- Middle Age: bowstrings, burning oil, ice, gunpowder. ---
  | 'bowRelease'
  | 'oilWhoosh'
  | 'frostRing'
  | 'cannonBoom'
  | 'minePick'
  // --- Tech Age: rifled cracks, capacitors, cryo hiss, mass drivers. ---
  | 'turretCrack'
  | 'teslaDischarge'
  | 'cryoHiss'
  | 'singularityHum'
  | 'sniperCrack'
  | 'factoryStamp'
  // --- Diamonds and abilities. Deliberately crystalline against a palette of
  // wood, gunpowder and capacitors: a currency you cannot hear is a currency
  // you forget you have. ---
  | 'exchangeChime'
  | 'diamondMint'
  | 'stoneRainCast'
  | 'stoneRainTick'
  | 'tarPitCast'
  | 'arrowRainCast'
  | 'arrowRainTick'
  | 'warHornCast'
  | 'lanceCast'
  | 'nullFieldCast'
  | 'trapCharged'
  | 'switchOn'
  | 'switchOff'
  // --- Shared feedback ---
  | 'zap'
  | 'hit'
  | 'hitHeavy'
  | 'shieldPing'
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

/**
 * Minimum seconds between retriggers of the same sound.
 *
 * Roughly the tower's own reload, so a fast tower is allowed to sound fast
 * while a dozen of them still can't turn the wave into a wall of noise.
 */
const THROTTLE: Record<SoundId, number> = {
  slingThrow: 0.05,
  spikeSnap: 0.07,
  mudSquelch: 0.2,
  boulderLaunch: 0.1,
  fireCrackle: 0.5,
  bowRelease: 0.05,
  oilWhoosh: 0.09,
  frostRing: 0.25,
  cannonBoom: 0.1,
  minePick: 0.4,
  turretCrack: 0.045,
  teslaDischarge: 0.07,
  cryoHiss: 0.25,
  singularityHum: 0.12,
  sniperCrack: 0.1,
  factoryStamp: 0.4,
  exchangeChime: 0.3,
  diamondMint: 0.25,
  stoneRainCast: 0,
  stoneRainTick: 0.18,
  tarPitCast: 0,
  arrowRainCast: 0,
  arrowRainTick: 0.1,
  warHornCast: 0,
  lanceCast: 0,
  nullFieldCast: 0,
  trapCharged: 0.12,
  switchOn: 0,
  switchOff: 0,
  zap: 0.06,
  hit: 0.045,
  hitHeavy: 0.07,
  shieldPing: 0.11,
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
    // An economy building never fires, so its voice plays when it pays out —
    // which means a campfire, a mine and a factory each sound like themselves
    // at the end of a wave.
    case 'goldMined':
      return shootSoundFor(e.kind);
    case 'chainArc':
      return 'zap';
    // Minting is the sound of gold becoming diamonds — the one moment the
    // second currency is happening, and it happens off-screen at a building
    // the player may not be looking at.
    case 'diamondsMinted':
      return 'diamondMint';
    // A trap that has been banking goes off louder than one that just fired.
    // Half of "traps feel unsatisfying" was that a full charge and an empty
    // one were audibly identical.
    case 'trapTriggered':
      return e.charge > 1 ? 'trapCharged' : null;
    case 'abilityCast':
      return ABILITY_CAST_SOUND[e.key];
    case 'abilityTick':
      return e.key === 'arrowRain' ? 'arrowRainTick' : 'stoneRainTick';
    case 'abilityDenied':
      return 'denied';
    case 'towerToggled':
      return e.on ? 'switchOn' : 'switchOff';
    // A hit that landed for 3000 should not sound like one that landed for 4.
    case 'enemyHit':
      return e.damage >= 150 ? 'hitHeavy' : 'hit';
    // A shield eating a hit is the one thing a player most needs to HEAR:
    // it is the difference between "my towers are working" and "my towers are
    // doing literally nothing". Throttled, because a shielded pack triggers it
    // constantly.
    case 'shieldAbsorbed':
      return 'shieldPing';
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
      // enemySpawned, enemyHealed, waveCleared and perkDraftOpened are
      // deliberately silent — they fire constantly and would turn a busy wave
      // into noise. The fx layer marks them visually instead.
      return null;
  }
}

/**
 * Every tower gets its own voice.
 *
 * Exhaustive on purpose rather than defaulting: a new tower added later must
 * be a compile error here, not something that silently comes out sounding like
 * a sling.
 */
/** One voice per ability, for the same reason each tower has one. */
const ABILITY_CAST_SOUND: Record<AbilityKey, SoundId> = {
  stoneRain: 'stoneRainCast',
  tarPit: 'tarPitCast',
  arrowRain: 'arrowRainCast',
  warHorn: 'warHornCast',
  orbitalLance: 'lanceCast',
  nullField: 'nullFieldCast',
};

const SHOOT_SOUND: Record<TowerKind, SoundId> = {
  thrower: 'slingThrow',
  trap: 'spikeSnap',
  slower: 'mudSquelch',
  heavy: 'boulderLaunch',
  campfire: 'fireCrackle',

  ballista: 'bowRelease',
  oilFire: 'oilWhoosh',
  frost: 'frostRing',
  siegeCannon: 'cannonBoom',
  goldMine: 'minePick',
  exchanger: 'exchangeChime',

  railgun: 'turretCrack',
  teslaCoil: 'teslaDischarge',
  cryo: 'cryoHiss',
  singularity: 'singularityHum',
  sniper: 'sniperCrack',
  factory: 'factoryStamp',
};

function shootSoundFor(kind: TowerKind): SoundId {
  return SHOOT_SOUND[kind];
}

function play(id: SoundId): boolean {
  if (!ctx || !master) return false;
  const now = ctx.currentTime;
  const gap = THROTTLE[id];
  const last = lastPlayed.get(id) ?? -Infinity;
  if (now - last < gap) return false;
  lastPlayed.set(id, now);

  switch (id) {
    // --- Stone Age -------------------------------------------------------
    // Sinew and stone. A rock leaving a sling: the whoosh of the loop, then
    // the rock itself letting go.
    case 'slingThrow':
      noise(now, 0.1, 0.15, 'bandpass', 780, 1.9);
      tone(now + 0.06, 'triangle', 420, 260, 0.05, 0.06);
      break;
    // Wooden stakes driven up through dirt: a dry knock, no ring to it.
    case 'spikeSnap':
      noise(now, 0.04, 0.22, 'highpass', 1500, 0.8);
      tone(now, 'square', 260, 90, 0.07, 0.09);
      noise(now + 0.03, 0.06, 0.1, 'lowpass', 500, 1);
      break;
    // Cold wet mud: a low, dull squelch with no attack at all.
    case 'mudSquelch':
      noise(now, 0.18, 0.09, 'lowpass', 340, 0.7);
      tone(now, 'sine', 130, 70, 0.2, 0.07);
      break;
    // A boulder in a timber arm: the creak of the throw, then the weight.
    case 'boulderLaunch':
      tone(now, 'sine', 120, 48, 0.26, 0.3);
      noise(now, 0.09, 0.14, 'lowpass', 620, 1);
      tone(now + 0.02, 'triangle', 300, 170, 0.12, 0.07);
      break;
    // A campfire doesn't fire — this is its ambient pop when it pays out.
    case 'fireCrackle':
      noise(now, 0.14, 0.09, 'bandpass', 1100, 1.2);
      noise(now + 0.07, 0.08, 0.06, 'highpass', 2400, 1);
      break;

    // --- Middle Age ------------------------------------------------------
    // A bowstring: the release snap, then the shaft cutting air.
    case 'bowRelease':
      tone(now, 'triangle', 900, 300, 0.05, 0.11);
      noise(now + 0.01, 0.11, 0.1, 'bandpass', 2000, 2.4);
      break;
    // Burning oil poured out: a rising hiss, not an impact.
    case 'oilWhoosh':
      noise(now, 0.26, 0.13, 'bandpass', 700, 0.9);
      tone(now, 'sawtooth', 90, 190, 0.24, 0.05);
      break;
    // Ice, as a crisp crackle rather than a ringing bell.
    //
    // It WAS two long sine tones held at 1760/2640 Hz. In isolation that reads
    // as "crystal"; at this tower's fire rate it was a pure sustained pitch
    // retriggering twice a second, which beats against itself and turns into a
    // whine that dominates everything else on screen. Short filtered noise with
    // a fast downward blip on top says "ice" without ever holding a note.
    case 'frostRing':
      noise(now, 0.13, 0.12, 'highpass', 3400, 0.8);
      noise(now, 0.07, 0.09, 'bandpass', 1500, 2.2);
      tone(now, 'triangle', 1500, 620, 0.09, 0.05);
      break;
    // Gunpowder: weight without volume.
    //
    // The first version simply pushed every gain up — a 0.36 sine under a 0.32
    // noise burst — which is loud rather than powerful, and on a busy wave it
    // buried the whole mix and clipped. What actually reads as heft is the
    // SHAPE: a tight transient, a short body that drops fast, and a low tail
    // you feel more than hear. Roughly half the peak level of the old one and
    // considerably punchier for it.
    case 'cannonBoom':
      noise(now, 0.02, 0.16, 'highpass', 2200, 0.7);
      tone(now, 'sine', 165, 38, 0.2, 0.19);
      tone(now, 'triangle', 92, 30, 0.32, 0.1);
      noise(now, 0.14, 0.08, 'lowpass', 320, 1);
      break;
    // A pick striking ore.
    case 'minePick':
      tone(now, 'triangle', 1400, 900, 0.07, 0.1);
      noise(now, 0.05, 0.1, 'bandpass', 2600, 3);
      break;

    // --- Tech Age --------------------------------------------------------
    // Rifled and mechanical: a hard crack with the action cycling behind it.
    case 'turretCrack':
      noise(now, 0.035, 0.26, 'highpass', 2600, 0.8);
      tone(now, 'square', 700, 180, 0.07, 0.12);
      noise(now + 0.05, 0.05, 0.07, 'bandpass', 1400, 3);
      break;
    // A capacitor bank dumping: the thump of the discharge, then the arc.
    case 'teslaDischarge':
      tone(now, 'sawtooth', 2600, 420, 0.11, 0.11);
      noise(now, 0.09, 0.13, 'highpass', 3200, 1);
      tone(now + 0.03, 'square', 160, 80, 0.09, 0.07);
      break;
    // Compressed gas venting: pure noise, no pitch at all.
    // A soft exhale, not a hiss.
    //
    // This one fires 2.4 times a second from every Cryo Field on the board, so
    // it is the most-played sound in the Tech Age by a wide margin — and it
    // sat in the 4kHz band, which is exactly where sibilance fatigues an ear.
    // Quieter, shorter, and moved well down the spectrum: a Cryo Field should
    // be something you notice stopping, not something you notice happening.
    case 'cryoHiss':
      noise(now, 0.16, 0.032, 'lowpass', 1400, 0.7);
      tone(now, 'sine', 660, 420, 0.14, 0.022);
      break;
    // Something collapsing inward: a pitch that falls away rather than decays.
    case 'singularityHum':
      tone(now, 'sine', 420, 30, 0.5, 0.3);
      tone(now + 0.04, 'sawtooth', 210, 24, 0.42, 0.12);
      noise(now, 0.3, 0.12, 'lowpass', 300, 1);
      break;
    // A supersonic round: crack first, then the long tail of the report.
    // A distant report rather than a rifle going off next to your head.
    //
    // The old one led with a 0.36-gain highpass crack at 3.6kHz and a 1900Hz
    // sawtooth — piercing on its own, and the Sniper covers the WHOLE board,
    // so it fires constantly no matter where the wave is. Most of the level
    // now lives in the low thump that follows, which carries the weight
    // without the sting.
    case 'sniperCrack':
      noise(now, 0.015, 0.1, 'bandpass', 1800, 1.2);
      tone(now, 'triangle', 900, 180, 0.1, 0.05);
      noise(now + 0.02, 0.26, 0.075, 'lowpass', 620, 1);
      break;
    // Industrial: a press cycling.
    case 'factoryStamp':
      tone(now, 'square', 220, 110, 0.09, 0.12);
      noise(now + 0.06, 0.1, 0.12, 'lowpass', 800, 1);
      break;

    // --- Diamonds. Glassy and bell-like, so the second currency has a voice
    // nothing else in the palette shares. ---
    case 'exchangeChime':
      arpeggio(now, [880, 1320], 0.18, 0.07);
      break;
    case 'diamondMint':
      arpeggio(now, [1046, 1568, 2093], 0.3, 0.1);
      break;
    // A trap dumping a full bank. Deeper and longer than the ordinary snap so
    // a charged trigger is audibly the thing you were waiting for.
    case 'trapCharged':
      tone(now, 'square', 180, 60, 0.13, 0.14);
      noise(now, 0.12, 0.16, 'lowpass', 1400, 1);
      break;

    // --- Abilities. Each is a big spend, so each gets a big, distinct sound. ---
    case 'stoneRainCast':
      // Distant rumble, then rock on rock.
      noise(now, 0.5, 0.16, 'lowpass', 420, 1);
      tone(now + 0.05, 'triangle', 150, 60, 0.4, 0.12);
      break;
    case 'stoneRainTick':
      noise(now, 0.08, 0.07, 'lowpass', 900, 1);
      break;
    case 'tarPitCast':
      // A thick, wet glug settling into the road.
      tone(now, 'sine', 260, 70, 0.45, 0.13);
      noise(now + 0.08, 0.3, 0.06, 'lowpass', 500, 2);
      break;
    case 'arrowRainCast':
      // A whole line loosing at once: bowstrings, then the hiss of the flight.
      noise(now, 0.09, 0.13, 'highpass', 1800, 1);
      noise(now + 0.12, 0.4, 0.09, 'bandpass', 2600, 2);
      break;
    case 'arrowRainTick':
      noise(now, 0.04, 0.05, 'highpass', 2600, 2);
      break;
    case 'warHornCast':
      // An actual horn: a low fundamental with a fifth over it, held.
      tone(now, 'sawtooth', 155, 233, 0.75, 0.1);
      tone(now + 0.02, 'sawtooth', 233, 233, 0.7, 0.055);
      break;
    case 'lanceCast':
      // Charge up, then the strike. The rising tone is what makes it read as
      // ORBITAL rather than as one more explosion.
      tone(now, 'sawtooth', 200, 2600, 0.32, 0.075);
      noise(now + 0.3, 0.5, 0.2, 'lowpass', 2200, 1);
      tone(now + 0.3, 'square', 90, 34, 0.5, 0.14);
      break;
    case 'nullFieldCast':
      // Inverted: a descending tone into a hollow hum, so the "field is up"
      // sound is unmistakably not a damage sound.
      tone(now, 'sine', 1400, 180, 0.4, 0.09);
      tone(now + 0.1, 'triangle', 92, 92, 0.7, 0.06);
      break;

    // A physical throw switch, up and down. Two clearly different sounds:
    // "did I leave it on?" must be answerable by ear.
    case 'switchOn':
      tone(now, 'square', 320, 640, 0.09, 0.09);
      break;
    case 'switchOff':
      tone(now, 'square', 640, 260, 0.11, 0.08);
      break;

    case 'zap':
      tone(now, 'square', 2400, 700, 0.07, 0.07);
      noise(now, 0.05, 0.1, 'highpass', 3000, 1);
      break;
    // Kept very quiet: this one plays dozens of times a wave.
    case 'hit':
      noise(now, 0.03, 0.045, 'bandpass', 1500, 3);
      break;
    // A big hit landing: same idea, with weight under it.
    case 'hitHeavy':
      noise(now, 0.07, 0.09, 'bandpass', 700, 1.6);
      tone(now, 'sine', 160, 80, 0.09, 0.09);
      break;
    // Glassy and pitched, so it is obviously NOT a hit landing.
    case 'shieldPing':
      tone(now, 'sine', 1320, 1180, 0.16, 0.07);
      tone(now + 0.01, 'sine', 1980, 1900, 0.1, 0.035);
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
