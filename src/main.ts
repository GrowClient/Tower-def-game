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
import { attachInput } from './input/input';
import { loadBestWave, saveBestWave } from './platform/storage';
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
  },
);

let lastMs = performance.now();
/** Leftover real time not yet consumed by a whole sim step. */
let accumulator = 0;

function frame(nowMs: number): void {
  const frameSec = Math.min((nowMs - lastMs) / 1000, 0.25); // clamp: tab was backgrounded
  lastMs = nowMs;

  ui.fps += ((frameSec > 0 ? 1 / frameSec : 0) - ui.fps) * 0.1;

  if (!ui.paused && state.phase === 'playing') {
    accumulator += frameSec * speedMultiplier(ui);
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

  // No fx layer until slice 6, but the queue must still be emptied or it grows
  // without bound. Slice 6 replaces this with the particle/shake feed.
  drainEvents(state);

  render(ctx!, viewport, state, ui, bestWave);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
