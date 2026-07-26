/**
 * Player intents.
 *
 * Input never touches the simulation directly. It queues an Intent, and the
 * queue is drained at the START of a step — never mid-step. Two reasons:
 *
 *  - A run stays reproducible from (seed, intent log). Replay and determinism
 *    survive.
 *  - A click landing between two enemy updates can't produce a different
 *    result than the same click landing between two other ones.
 */

import { emit } from './events';
import { placeTower, upgradeTower } from './towers';
import type { GameState, Intent } from './types';

export function queueIntent(state: GameState, intent: Intent): void {
  state.intents.push(intent);
}

export function applyIntents(state: GameState): void {
  if (state.intents.length === 0) return;

  for (const intent of state.intents) {
    switch (intent.type) {
      case 'placeTower':
        placeTower(state, intent.kind, intent.cx, intent.cy);
        break;
      case 'upgradeTower':
        upgradeTower(state, intent.towerId);
        break;
      case 'sellTower':
        // Selling isn't in the design yet. Swallow it rather than crash, and
        // make the rejection visible so a stray intent can't fail silently.
        emit(state, { type: 'purchaseDenied', at: { x: 0, y: 0 } });
        break;
    }
  }

  state.intents.length = 0;
}
