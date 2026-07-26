/**
 * Run state construction.
 *
 * `newRun(seed)` is the only way a game starts. Everything random about the
 * run — the map, and wave composition — is derived from the seed, so
 * `newRun(7)` twice produces two identical runs.
 */

import { RUN } from '../config/balance';
import { makeLayout } from './grid';
import { generateMap } from './mapgen';
import { buildPath } from './path';
import { forkRng, makeRng } from './rng';
import { newWaveState } from './waves';
import type { GameState } from './types';

export function newRun(seed: number): GameState {
  const rng = makeRng(seed);

  // Map generation gets its own forked stream so that changing how many rolls
  // mapgen consumes doesn't shift every later wave's composition.
  const mapRng = forkRng(rng);

  const layout = makeLayout();
  const map = generateMap(mapRng);
  const path = buildPath(map, layout);

  return {
    seed,
    rng,
    time: 0,
    phase: 'playing',

    layout,
    map,
    path,

    enemies: [],
    towers: [],
    projectiles: [],
    nextEntityId: 1,

    // Tower id per cell, 0 = free. Entity ids start at 1 precisely so that 0
    // is an unambiguous "empty" and this needs no parallel boolean array.
    occupancy: new Int32Array(map.cols * map.rows),

    gold: RUN.startingGold,
    lives: RUN.startingLives,
    wave: newWaveState(),

    intents: [],
    killedBy: null,

    events: [],
  };
}
