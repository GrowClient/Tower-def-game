/**
 * Bootstrap and the frame loop.
 *
 * This file owns everything the simulation is not allowed to touch: the
 * canvas, the wall clock, the URL, localStorage and the browser event loop. It
 * converts real elapsed time into a whole number of FIXED sim steps and then
 * draws.
 *
 * Why fixed steps: a variable dt makes the sim non-reproducible, and any
 * balance change becomes impossible to evaluate because two runs of the same
 * seed diverge. Speed 2x runs twice as many steps per frame; it never doubles
 * dt.
 */

import { SIM } from './config/balance';
import { drainEvents } from './core/events';
import { queueIntent } from './core/intents';
import { step } from './core/sim';
import { newRun } from './core/state';
import type { GameState } from './core/types';
import { isMuted, playEvents, setMuted, unlockAudio } from './audio/sfx';
import { consumeEvents, newFx, trackEnemies, updateFx } from './fx/effects';
import { attachInput } from './input/input';
import { loadBestWave, saveBestWave } from './platform/storage';
import { accentFor } from './render/palette';
import { render } from './render/renderer';
import { resizeCanvas, type Viewport } from './render/viewport';
import { cycleSpeed, newUiState, speedMultiplier } from './uiState';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('#game canvas not found');
const ctx = canvas.getContext('2d', { alpha: false });
if (!ctx) throw new Error('2D canvas context unavailable');

/**
 * Seed selection. `?seed=123` pins a run so a map/balance issue can be
 * reproduced exactly; otherwise we pick one from the clock. Reading the clock
 * HERE is fine — the rule is that nothing inside `core/` may do it.
 */
const urlSeed = new URLSearchParams(window.location.search).get('seed');
const pinnedSeed = urlSeed !== null && urlSeed !== '' ? Number(urlSeed) >>> 0 : null;
let seedCounter = pinnedSeed ?? Date.now() >>> 0;

const ui = newUiState();
let fx = newFx();
let state: GameState = newRun(seedCounter);
let viewport: Viewport = resizeCanvas(canvas);
let bestWave = loadBestWave();
/** So the run's score is only banked once, on the step it ends. */
let scoreBanked = false;

window.addEventListener('resize', () => {
  viewport = resizeCanvas(canvas);
});
window.addEventListener('orientationchange', () => {
  viewport = resizeCanvas(canvas);
});

function restart(): void {
  // A pinned seed replays identically on restart, which is what you want
  // while tuning. An unpinned run gets a fresh map each time.
  if (pinnedSeed === null) seedCounter = (seedCounter + 0x9e3779b1) >>> 0;
  state = newRun(seedCounter);
  ui.paused = false;
  ui.buildKind = null;
  ui.selectedTowerId = null;
  ui.showCombos = false;
  ui.armedAbility = null;
  // A new run has not been warned yet, so the briefing must come back.
  ui.armorBriefingDismissed = false;
  // Otherwise the previous run's smoke, shake and slow motion carry into the
  // first frame of the new one.
  fx = newFx();
  scoreBanked = false;
}

attachInput(
  canvas,
  ui,
  () => state,
  () => viewport,
  {
    togglePause: () => {
      ui.paused = !ui.paused;
    },
    cycleSpeed: () => cycleSpeed(ui),
    restart,
    placeTower: (kind, cx, cy) => queueIntent(state, { type: 'placeTower', kind, cx, cy }),
    upgradeTower: (towerId) => queueIntent(state, { type: 'upgradeTower', towerId }),
    sellTower: (towerId) => queueIntent(state, { type: 'sellTower', towerId }),
    cycleTargetMode: (towerId) => queueIntent(state, { type: 'cycleTargetMode', towerId }),
    advanceAge: () => queueIntent(state, { type: 'advanceAge' }),
    choosePerk: (key) => queueIntent(state, { type: 'choosePerk', key }),
    castAbility: (key, x, y) => queueIntent(state, { type: 'castAbility', key, x, y }),
    toggleTower: (towerId) => queueIntent(state, { type: 'toggleTower', towerId }),
    toggleFullscreen,
    toggleMute: () => {
      setMuted(!isMuted());
      ui.muted = isMuted();
    },
  },
);

// Browsers refuse to start audio outside a user gesture, so the context is
// created on the first touch of the canvas rather than at load. Registered in
// the capture phase so it runs before the game's own pointerdown handler.
canvas.addEventListener('pointerdown', () => unlockAudio(), { capture: true });

/**
 * Fullscreen, for playing on a phone without the browser's address bar eating
 * a fifth of the screen.
 *
 * Must be called from inside a user gesture or browsers reject it, which is
 * why it hangs off the tap handler rather than running at startup. Safari
 * still uses the webkit-prefixed names. Failure is swallowed deliberately: a
 * rejected fullscreen request is not a reason to interrupt a run.
 */
function toggleFullscreen(): void {
  const doc = document as Document & {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void>;
  };
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };

  const active = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
  try {
    if (active) {
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.());
    } else {
      void (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
    }
  } catch {
    // Blocked by the browser or the embedding frame — leave the run alone.
  }
}

// Mirror the browser's actual state rather than assuming the toggle worked:
// the user can leave fullscreen with the system back gesture or Esc, and the
// button icon has to follow.
for (const evt of ['fullscreenchange', 'webkitfullscreenchange']) {
  document.addEventListener(evt, () => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    ui.fullscreen = Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
    // The viewport changes size on entering/leaving, and orientationchange
    // doesn't always fire for it.
    viewport = resizeCanvas(canvas!);
  });
}

/**
 * Dev-only inspection hook. `import.meta.env.DEV` is false in a production
 * build, so this whole block is dead-code-eliminated from the shipped bundle.
 * It exists so tooling and manual debugging can read the live run without the
 * simulation having to export mutable module state.
 */
if (import.meta.env.DEV) {
  (window as unknown as { __td: unknown }).__td = {
    state: () => state,
    ui: () => ui,
    queue: (intent: Parameters<typeof queueIntent>[1]) => queueIntent(state, intent),
  };
}

let lastMs = performance.now();
/** Leftover real time not yet consumed by a whole sim step. */
let accumulator = 0;

function frame(nowMs: number): void {
  const frameSec = Math.min((nowMs - lastMs) / 1000, 0.25); // clamp: tab was backgrounded
  lastMs = nowMs;

  ui.fps += ((frameSec > 0 ? 1 / frameSec : 0) - ui.fps) * 0.1;

  if (!ui.paused && state.phase === 'playing') {
    // fx.timeScale is how boss-kill slow motion works: it feeds FEWER whole
    // steps into the accumulator. SIM.dt is never touched, so the simulation
    // cannot tell that anything dramatic happened — a run replays identically
    // whether or not the moment was ever drawn.
    accumulator += frameSec * speedMultiplier(ui) * fx.timeScale;
    let steps = 0;
    while (accumulator >= SIM.dt && steps < SIM.maxStepsPerFrame) {
      step(state);
      accumulator -= SIM.dt;
      steps++;
    }
    // If we hit the cap the machine can't keep up; drop the backlog rather
    // than spiralling further behind every frame.
    if (steps >= SIM.maxStepsPerFrame) accumulator = 0;
  }

  if (state.phase === 'gameover' && !scoreBanked) {
    bestWave = saveBestWave(state.wave.number);
    scoreBanked = true;
  }

  // The event queue must be drained every frame or it grows without bound.
  // Two consumers now, neither of which the sim knows about: sound and juice.
  const events = drainEvents(state);
  playEvents(events);
  consumeEvents(fx, events, accentFor(state.age));

  // Effects run on the WALL clock, not sim time, so smoke keeps drifting while
  // the game is paused or a perk draft is holding the wave clock.
  trackEnemies(fx, state.enemies);
  updateFx(fx, frameSec, new Set(state.enemies.map((e) => e.id)));

  render(ctx!, viewport, state, ui, bestWave, fx);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
