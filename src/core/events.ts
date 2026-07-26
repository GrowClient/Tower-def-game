/**
 * Sim -> presentation event channel.
 *
 * The simulation is not allowed to know that screenshake exists. But juice
 * needs to fire at the exact moment something happens in the sim, so the sim
 * pushes plain data events onto a queue and the fx layer drains it every frame
 * and turns them into particles, shake, flashes and damage numbers.
 *
 * Events are pure data: no callbacks, no references to renderer objects. They
 * stay serialisable, which keeps replays and determinism honest.
 */

import type { GameState, SimEvent } from './types';

export function emit(state: GameState, event: SimEvent): void {
  state.events.push(event);
}

/** Returns the queued events and clears the queue. Called by the fx layer. */
export function drainEvents(state: GameState): SimEvent[] {
  if (state.events.length === 0) return [];
  const out = state.events;
  state.events = [];
  return out;
}
