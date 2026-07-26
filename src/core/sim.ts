/**
 * The fixed-timestep tick.
 *
 * `step()` is the ONLY function that advances the game. It always advances by
 * exactly SIM.dt — never by a variable frame delta. The 2x speed toggle runs
 * two steps per frame rather than doubling dt, so physics, fire rates and
 * scaling behave identically at every speed setting.
 */

import { DEMO_SPAWN, SIM } from '../config/balance';
import { spawnEnemy, updateEnemies } from './enemies';
import type { GameState } from './types';

export function step(state: GameState): void {
  if (state.phase !== 'playing') return;

  const dt = SIM.dt;
  state.time += dt;

  // Slice 1 stand-in for the wave system: a metronome of single grunts, just
  // enough to prove the generated path is walkable. Slice 3 deletes this.
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    state.spawnTimer += DEMO_SPAWN.intervalSec;
    spawnEnemy(state, 'grunt');
  }

  updateEnemies(state, dt);
}
