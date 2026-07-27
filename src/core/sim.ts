/**
 * The fixed-timestep tick.
 *
 * `step()` is the ONLY function that advances the game. It always advances by
 * exactly SIM.dt — never by a variable frame delta. The 2x speed toggle runs
 * two steps per frame rather than doubling dt, so physics, fire rates and
 * scaling behave identically at every speed setting.
 *
 * Order within a step matters and is deliberate:
 *   intents -> waves -> abilities -> towers -> projectiles -> enemies -> sweep
 * Player actions land before anything moves; towers aim at where enemies
 * currently are; enemies then move; and dead things are removed only at the
 * very end, so removal timing can never shift anyone else's iteration order.
 */

import { SIM } from '../config/balance';
import { updateAbilities } from './abilities';
import { removeDeadEnemies, updateEnemies } from './enemies';
import { applyIntents } from './intents';
import { removeDeadProjectiles, updateProjectiles } from './projectiles';
import { updateTowers } from './towers';
import { updateWaves } from './waves';
import type { GameState } from './types';

export function step(state: GameState): void {
  if (state.phase !== 'playing') {
    // Intents still drain when the run is over, so a queued action can't leak
    // into the next run's first step.
    state.intents.length = 0;
    return;
  }

  const dt = SIM.dt;
  state.time += dt;

  applyIntents(state);
  updateWaves(state, dt);
  // Before towers and enemies on purpose: a Null Field cast this step is
  // already softening its targets when this step's shots land, and a barrage
  // tick lands before the units it hit get to move away from it.
  updateAbilities(state, dt);
  updateTowers(state, dt);
  updateProjectiles(state, dt);
  updateEnemies(state, dt);

  removeDeadEnemies(state);
  removeDeadProjectiles(state);
}
