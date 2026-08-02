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

import { BOSSES, BOSS_SCALING, ENEMIES, SCALING, VETERANCY, WAVES } from '../config/balance';
import { mintDiamonds } from './abilities';
import { bossForWave, hpMultiplier } from './enemies';
import { waveClearReward } from './economy';
import { openDraft, shouldDraft } from './perks';
import { spawnEnemy } from './enemies';
import { emit } from './events';
import { towerIncome } from './towers';
import { nextFloat, nextInt } from './rng';
import type { EnemyKind, GameState, RunMode, SpawnOrder } from './types';

export function newWaveState(): GameState['wave'] {
  return { number: 0, timer: WAVES.firstWaveDelay, queue: [], active: false };
}

export function updateWaves(state: GameState, dt: number): void {
  const wave = state.wave;

  // A perk draft holds everything. Letting the countdown run while the player
  // reads three options would punish them for engaging with the choice.
  if (state.perkChoices !== null) return;

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
    spawnEnemy(state, order.kind, wave.number, 0, order.hpMul ?? 1);
  }

  // The wave is only over once the board is clear, not once spawning stops.
  if (wave.queue.length === 0 && state.enemies.length === 0) {
    const reward = waveClearReward(wave.number) + collectIncome(state);
    state.gold += reward;
    // Exchangers settle AFTER income lands, so a wave's own takings can be
    // converted the moment they arrive rather than always being a wave behind.
    mintDiamonds(state);
    wave.active = false;

    // The campaign ends here — you WON, which is a thing this game could not
    // previously say. Checked after the payout so the victory screen shows the
    // gold the last wave earned, and before the next wave is scheduled so
    // nothing is queued behind an ended run.
    if (isFinalWave(state, wave.number)) {
      state.phase = 'won';
      emit(state, { type: 'waveCleared', number: wave.number, reward });
      return;
    }
    // A longer breather before the wave that teaches plating, so the warning
    // has time to be read AND acted on. A lesson the player cannot afford to
    // answer is just a loss with a caption.
    wave.timer =
      wave.number + 1 === WAVES.armorBriefingWave
        ? WAVES.armorBriefingPause
        : WAVES.betweenWaves;
    emit(state, { type: 'waveCleared', number: wave.number, reward });

    if (shouldDraft(wave.number)) openDraft(state);
  }
}

/**
 * Pay out every economy building for the wave just cleared.
 *
 * Deliberately here and not in a per-step tick: a mine should be a bet that you
 * survive the wave, not a clock that runs whether or not you do. It also means
 * a run that ends mid-wave collects nothing for it, which is the risk that
 * makes buying income instead of defence an actual decision.
 */
function collectIncome(state: GameState): number {
  let total = 0;
  for (const tower of state.towers) {
    const income = towerIncome(state, tower);
    if (income <= 0) continue;
    total += income;
    // Tracked per tower so the panel can show lifetime earnings against what
    // was sunk in, which is the only way to tell whether a mine has paid off.
    tower.earned += income;
    tower.xp += VETERANCY.payoutXp;
    emit(state, { type: 'goldMined', at: { ...tower.pos }, amount: income, kind: tower.kind });
  }
  return total;
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
/** Is this the wave a campaign ends on? Endless has no such wave. */
export function isFinalWave(state: GameState, waveNumber: number): boolean {
  return state.mode === 'campaign' && waveNumber >= WAVES.finalWave;
}

function composeWave(state: GameState, waveNumber: number): SpawnOrder[] {
  const boss = bossForWave(waveNumber);

  const units = waveNumber <= WAVES.scripted.length
    ? scriptedUnits(waveNumber)
    : drawUnits(state, waveNumber, boss !== null ? WAVES.bossWaveBudgetMul : 1);

  // Interleave the draw. Without this a budget spent brute-first arrives as a
  // block of brutes followed by a block of runners, which is two easy waves
  // stapled together rather than one interesting one.
  shuffle(state, units);

  // Two limits, whichever is tighter: the per-wave decay, and the bound on how
  // long the whole wave may take to arrive. Early waves are set by the first
  // and never come close to the second.
  const decayed = WAVES.spawnInterval * Math.pow(WAVES.spawnIntervalDecay, waveNumber - 1);
  const windowed = WAVES.maxSpawnWindow / Math.max(1, units.length);
  const interval = Math.max(WAVES.spawnIntervalMin, Math.min(decayed, windowed));

  const orders: SpawnOrder[] = units.map((kind, i) => ({
    kind,
    at: state.time + i * interval,
  }));

  // The boss enters a beat into its own wave, so it arrives surrounded by its
  // escort rather than walking in alone ahead of everything.
  //
  // The FINAL wave brings all three at once, spaced so they arrive as a
  // procession rather than a single unkillable lump. This is the finale built
  // out of what the game already has rather than out of a new enemy: a
  // Summoner, a Warlord and an Ancient together demand splash for the swarms,
  // armor piercing against the Warlord's aura, and sustained concentrated
  // damage to stop the Ancient repairing — which is every lesson the run
  // taught, asked at the same time. Each keeps its own mechanic because
  // `mechanicFor` reads it off the KIND, so a boss is itself wherever it is
  // spawned.
  if (isFinalWave(state, waveNumber)) {
    BOSSES.forEach((b, i) => {
      // The one that arrives LAST is cut down, and only that one.
      //
      // Boss HP grows per appearance, so by wave 60 the third of the
      // procession is the single toughest thing in the game — and it lands on
      // a board that has already spent the whole wave killing the other two
      // and their escort. Playtested as the wall the finale dies on rather
      // than the finish it is meant to be. The first two are untouched: they
      // are what makes the last stand a last stand.
      const last = i === BOSSES.length - 1;
      orders.push({
        kind: b.kind,
        at: state.time + WAVES.bossSpawnDelay + i * WAVES.finaleBossGap,
        ...(last ? { hpMul: BOSS_SCALING.finaleLastBossHpMul } : {}),
      });
    });
    orders.sort((a, b) => a.at - b.at);
  } else if (boss) {
    orders.push({ kind: boss.kind, at: state.time + WAVES.bossSpawnDelay });
    orders.sort((a, b) => a.at - b.at);
  }

  return orders;
}

function scriptedUnits(waveNumber: number): EnemyKind[] {
  const script = WAVES.scripted[waveNumber - 1] ?? [];
  const out: EnemyKind[] = [];
  for (const entry of script) {
    for (let i = 0; i < entry.count; i++) out.push(entry.kind);
  }
  return out;
}

/**
 * Threat budget for a wave.
 *
 * Two exponentials, deliberately. The gentle one shapes the whole curve and is
 * constrained by having to hand over cleanly from the last scripted wave. The
 * second only starts at `budgetSurgeWave` and exists because a player's board
 * compounds faster than that first curve does once an economy exists — upgrades,
 * perks, a better age and combos all land in the same stretch. Without it a run
 * reaches a point where nothing on the board is ever threatened again.
 *
 * Exported because the headless balance driver reports on it directly; a curve
 * you can't ask questions of is a curve you end up tuning by anecdote.
 */
export function waveBudget(waveNumber: number, mode: RunMode = 'endless'): number {
  const w = waveNumber - 1;
  const poly = WAVES.budgetBase + WAVES.budgetLinear * w + WAVES.budgetQuadratic * w * w;
  const surge = Math.pow(
    WAVES.budgetSurgeGrowth,
    Math.max(0, waveNumber - WAVES.budgetSurgeWave),
  );
  // The second surge covers the stretch where the board has stopped growing —
  // capped, maxed and veteran — so the curve has to climb on its own.
  const late = Math.pow(
    WAVES.lateSurgeGrowth,
    Math.max(0, waveNumber - WAVES.lateSurgeWave),
  );
  // THE FINALE, campaign only — and it has to be here, in the BUDGET, not only
  // in the HP curve. The arithmetic, learned the hard way twice now: threat
  // cost tracks HP, so a wave's total HP is `budget x hp^0.03` — raising HP
  // alone lowers the unit count by almost exactly as much as it raises
  // toughness, and the wave gets no harder. Measured: the HP-only finale moved
  // wave 58's total HP by 3% while halving its body count.
  //
  // Budget AND HP together is the pair that works. The budget sets how much
  // total HP walks down the road; the matching HP term decides whether that
  // arrives as 130 tough units or 800 weak ones. Growing them at the same rate
  // buys a genuinely harder finale at a FLAT entity count.
  const finale =
    mode === 'campaign'
      ? Math.pow(WAVES.finaleBudgetGrowth, Math.max(0, waveNumber - SCALING.finaleWave))
      : 1;
  return poly * Math.pow(WAVES.budgetExpGrowth, w) * surge * late * finale;
}

/** Spend the wave's threat budget on a weighted draw from unlocked types. */
function drawUnits(state: GameState, waveNumber: number, budgetMul: number): EnemyKind[] {
  let budget = waveBudget(waveNumber, state.mode) * budgetMul;

  const pool = WAVES.roster.filter((r) => waveNumber >= r.introWave);
  if (pool.length === 0) return [];

  // Weights drift with wave number, so the same budget buys a nastier mix
  // later on — brutes crowd out runners rather than simply joining them.
  const weights = pool.map((r) =>
    Math.max(0.05, r.weight + r.weightGrowth * (waveNumber - r.introWave)),
  );

  // A unit is worth what it actually costs the player to kill, so its threat
  // rises with the same curve as its HP. See WAVES.threatScaleExponent.
  const threatScale = Math.pow(hpMultiplier(waveNumber, state.mode), WAVES.threatScaleExponent);

  const out: EnemyKind[] = [];
  // Guard against a balance edit that leaves every threat at zero.
  for (let guard = 0; guard < 500 && budget > 0; guard++) {
    const pick = weightedPick(state, pool, weights);
    const def = ENEMIES[pick.kind]!;
    const cost = def.threat * threatScale * pick.groupSize;

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
