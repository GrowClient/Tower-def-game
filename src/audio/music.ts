/**
 * The soundtrack.
 *
 * This is the ONE place the project's "no assets" rule is relaxed, and
 * deliberately: synthesised music has a ceiling. Oscillators can produce
 * something pleasant and vaguely retro; they cannot produce something composed,
 * and a theme people remember is most of what "atmosphere" actually means. SFX
 * stay synthesised — they are short, they must react instantly to events, and
 * they are exactly what code is good at.
 *
 * Three things this has to get right, none of them obvious:
 *
 * **It must never block the game.** The track is fetched in the background and
 * simply starts whenever it arrives. A missing or unreachable file is silence,
 * not an error and not a delay — the game shipped without music and must keep
 * working without it.
 *
 * **It must loop without a seam.** Not an `<audio loop>` tag: MP3 encoders pad
 * the start and end of a file, so a tag-looped MP3 has an audible gap every
 * time round. Decoding to a raw buffer and looping an `AudioBufferSourceNode`
 * is sample-accurate, and it also lets a track skip its intro on repeat via
 * `loopStart`.
 *
 * **It cannot start itself.** Browsers refuse audio until a user gesture, so
 * nothing here runs until the first tap — the same unlock the SFX layer waits
 * for.
 */

const TRACK_BASE = 'audio/theme';

/**
 * Relative, not absolute. The game is served from a subdirectory on every web
 * game portal, so `/audio/theme.ogg` would resolve to the domain root and 404 —
 * the same trap that made the first itch build a black screen.
 */
function trackUrl(ext: string): string {
  return new URL(`${TRACK_BASE}.${ext}`, document.baseURI).href;
}

interface MusicState {
  ctx: AudioContext | null;
  gain: GainNode | null;
  buffer: AudioBuffer | null;
  source: AudioBufferSourceNode | null;
  /** Set once the fetch has been attempted, so it is never attempted twice. */
  requested: boolean;
  wanted: boolean;
  muted: boolean;
  volume: number;
}

const music: MusicState = {
  ctx: null,
  gain: null,
  buffer: null,
  source: null,
  requested: false,
  wanted: false,
  muted: false,
  volume: 0.55,
};

/**
 * Hand the music layer the audio context the SFX already unlocked, and start
 * fetching. Safe to call repeatedly; only the first call does anything.
 */
export function initMusic(ctx: AudioContext): void {
  if (music.ctx !== null) return;
  music.ctx = ctx;
  music.gain = ctx.createGain();
  music.gain.gain.value = 0;
  music.gain.connect(ctx.destination);
  void loadTrack();
}

async function loadTrack(): Promise<void> {
  if (music.requested || music.ctx === null) return;
  music.requested = true;

  // OGG first, MP3 second. Chrome and Firefox prefer OGG (smaller at the same
  // quality); Safari has historically only had MP3/AAC. Trying both in order
  // means one pair of files covers every browser without sniffing user agents,
  // which is a thing that is wrong more often than it is right.
  for (const ext of ['ogg', 'mp3']) {
    try {
      const res = await fetch(trackUrl(ext));
      if (!res.ok) continue;
      const bytes = await res.arrayBuffer();
      music.buffer = await music.ctx.decodeAudioData(bytes);
      if (music.wanted) start();
      return;
    } catch {
      // Missing, unreachable, or not decodable in this browser. Try the next
      // format; if none work the game is simply silent, which is the state it
      // shipped in and a perfectly good fallback.
    }
  }
}

function start(): void {
  const { ctx, gain, buffer } = music;
  if (ctx === null || gain === null || buffer === null || music.source !== null) return;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  source.start();
  music.source = source;
  applyGain(1.2);
}

/** Fade to whatever the volume/mute state currently implies. */
function applyGain(seconds: number): void {
  const { ctx, gain } = music;
  if (ctx === null || gain === null) return;
  const target = music.muted || !music.wanted ? 0 : music.volume;
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  // Ramped, never stepped. A gain jump on a playing buffer is an audible click.
  gain.gain.linearRampToValueAtTime(target, now + seconds);
}

/**
 * Music should be playing (or not).
 *
 * The source keeps running across a stop — it is faded out rather than torn
 * down, so resuming picks the track up where it would have been instead of
 * restarting the intro every time the player opens a menu.
 */
export function setMusicPlaying(playing: boolean): void {
  if (music.wanted === playing) return;
  music.wanted = playing;
  if (playing && music.source === null) start();
  else applyGain(0.9);
}

/** Follows the game's single mute control, so one button silences everything. */
export function setMusicMuted(muted: boolean): void {
  if (music.muted === muted) return;
  music.muted = muted;
  applyGain(0.35);
}

export function setMusicVolume(volume: number): void {
  music.volume = Math.max(0, Math.min(1, volume));
  applyGain(0.2);
}

export function musicVolume(): number {
  return music.volume;
}

/** True once a track has actually decoded — used to keep the UI honest. */
export function musicLoaded(): boolean {
  return music.buffer !== null;
}
