/**
 * Wave composition and pacing.
 *
 * The important idea here is that difficulty is NOT an HP multiplier. Each
 * wave gets a THREAT BUDGET, and that budget is spent on a seeded weighted
 * draw from the enemy types unlocked so far. Because each type has a different
 * threat cost and a weight that drifts over time, the *mix* changes as the run
 * goes on — a wave 20 is not a wave 8 with bigger numbers, it's a different
 * composition that asks a different question of your board.
 *
 * The opening is hand-authored instead of generated, because a random wave 1
 * can be brutal and first impressions decide whether the loop gets a chance.
 */

import { ENEMIES, WAVES } from '../config/balance';
import { waveClearReward } from './economy';
import { spawnEnemy } from './enemies';
import { emit } from './events';
import { nextFloat, nextInt } from './rng';
import type { EnemyKind, GameState, SpawnOrder } from './types';

export function newWaveState(): GameState['wave'] {
  return { number: 0, timer: WAVES.firstWaveDelay, queue: [], active: false };
}

export function updateWaves(state: GameState, dt: number): void {
  const wave = state.wave;

  // Between waves: count down, then compose and schedule the next one.
  if (!wave.active) {
    wave.timer -= dt;
    if (wave.timer <= 0) startWave(state);
    return;
  }

  // Release any spawns whose time has come. A while-loop rather than an if,
  // so a group scheduled at the same instant all enters together.
  while (wave.queue.length > 0 && wave.queue[0]!.at <= state.time) {
    const order = wave.queue.shift()!;
    spawnEnemy(state, order.kind, wave.number);
  }

  // The wave is only over once the board is clear, not once spawning stops.
  if (wave.queue.length === 0 && state.enemies.length === 0) {
    const reward = waveClearReward(wave.number);
    state.gold += reward;
    wave.active = false;
    wave.timer = WAVES.betweenWaves;
    emit(state, { type: 'waveCleared', number: wave.number, reward });
  }
}

function startWave(state: GameState): void {
  const wave = state.wave;
  wave.number++;
  wave.active = true;
  wave.queue = composeWave(state, wave.number);
  emit(state, { type: 'waveStarted', number: wave.number });
}

/**
 * Turn a wave number into a concrete, time-stamped spawn list.
 */
function composeWave(state: GameState, waveNumber: number): SpawnOrder[] {
  const units = waveNumber <= WAVES.scripted.length
    ? scriptedUnits(waveNumber)
    : drawUnits(state, waveNumber);

  // Interleave the draw. Without this a budget spent brute-first arrives as a
  // block of brutes followed by a block of runners, which is two easy waves
  // stapled together rather than one interesting one.
  shuffle(state, units);

  const interval = Math.max(
    WAVES.spawnIntervalMin,
    WAVES.spawnInterval * Math.pow(WAVES.spawnIntervalDecay, waveNumber - 1),
  );

  return units.map((kind, i) => ({ kind, at: state.time + i * interval }));
}

function scriptedUnits(waveNumber: number): EnemyKind[] {
  const script = WAVES.scripted[waveNumber - 1] ?? [];
  const out: EnemyKind[] = [];
  for (const entry of script) {
    for (let i = 0; i < entry.count; i++) out.push(entry.kind);
  }
  return out;
}

/** Spend the wave's threat budget on a weighted draw from unlocked types. */
function drawUnits(state: GameState, waveNumber: number): EnemyKind[] {
  const w = waveNumber - 1;
  let budget =
    (WAVES.budgetBase + WAVES.budgetLinear * w + WAVES.budgetQuadratic * w * w) *
    Math.pow(WAVES.budgetExpGrowth, w);

  const pool = WAVES.roster.filter((r) => waveNumber >= r.introWave);
  if (pool.length === 0) return [];

  // Weights drift with wave number, so the same budget buys a nastier mix
  // later on — brutes crowd out runners rather than simply joining them.
  const weights = pool.map((r) =>
    Math.max(0.05, r.weight + r.weightGrowth * (waveNumber - r.introWave)),
  );

  const out: EnemyKind[] = [];
  // Guard against a balance edit that leaves every threat at zero.
  for (let guard = 0; guard < 500 && budget > 0; guard++) {
    const pick = weightedPick(state, pool, weights);
    const def = ENEMIES[pick.kind]!;
    const cost = def.threat * pick.groupSize;

    // Near the end of the budget, only take what still fits — otherwise the
    // last pick can overshoot by a whole brute and spike the wave.
    if (cost > budget && out.length > 0) break;

    for (let i = 0; i < pick.groupSize; i++) out.push(pick.kind);
    budget -= cost;
  }

  return out;
}

function weightedPick<T>(state: GameState, items: T[], weights: number[]): T {
  let total = 0;
  for (const w of weights) total += w;

  let roll = nextFloat(state.rng) * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Fisher-Yates, driven by the run RNG so a seed always shuffles the same. */
function shuffle<T>(state: GameState, arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(state.rng, 0, i);
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}
