/**
 * Run state construction.
 *
 * `newRun(seed)` is the only way a game starts. Everything random about the
 * run — currently the map, later wave composition — is derived from the seed,
 * so `newRun(7)` twice produces two byte-identical runs.
 */

import { RUN } from '../config/balance';
import { makeLayout } from './grid';
import { generateMap } from './mapgen';
import { buildPath } from './path';
import { forkRng, makeRng } from './rng';
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
    nextEntityId: 1,

    gold: RUN.startingGold,
    lives: RUN.startingLives,
    wave: 0,

    spawnTimer: 0,

    events: [],
  };
}
