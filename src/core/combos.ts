/**
 * Tower combos: what happens when two towers' fields overlap.
 *
 * The problem this solves is that placement used to be almost free of
 * decisions. A tower's output depended only on the tower, so the optimal board
 * was N copies of whatever had the best damage per gold, arranged wherever
 * there was room. Combos make the same gold worth more or less depending on
 * what it stands next to, which is what turns filling cells into building a
 * defence.
 *
 * Three properties this file is responsible for keeping true:
 *
 *  - **The trigger is visible.** Two towers combo when their rings overlap,
 *    the same rings the renderer already draws. There is no second, invisible
 *    adjacency rule that disagrees with what is on screen.
 *  - **A combo counts once.** No matter how many partners supply it, a given
 *    combo multiplies a tower exactly once. Otherwise "stack six partners"
 *    becomes the new mindless answer.
 *  - **It is deterministic.** The sweep is over `state.towers` in order and
 *    the result is sorted, so the same board always produces the same combos
 *    in the same order regardless of what got built when.
 */

import {
  COMBO_RULES,
  COMBOS,
  TOWERS,
  type ComboEffect,
  type ComboKey,
  type TowerTag,
} from '../config/balance';
import type { GameState, Tower } from './types';

const NEUTRAL: ComboEffect = {
  damageMul: 1,
  fireRateMul: 1,
  burnMul: 1,
  goldMul: 1,
  chainBonus: 0,
};

/**
 * Are these two towers close enough to combo?
 *
 * ONE fixed radius for every tower, deliberately independent of range. The
 * original rule was "your range rings overlap", which sounded elegant and
 * played badly: two 250-range Tech towers linked from five cells apart, so on
 * a developed board everything comboed with everything and there was no
 * placement decision left. A small fixed radius makes a combo a question about
 * the cell you are clicking, which is the decision this system exists to
 * create.
 */
export function towersLinked(a: Tower, b: Tower): boolean {
  const r = COMBO_RULES.linkRadius;
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  return dx * dx + dy * dy <= r * r;
}

/** Which combos this specific pair of towers forms. */
export function combosBetween(a: Tower, b: Tower): ComboKey[] {
  // Annotated rather than inferred: each tower's literal tag list narrows to
  // its own element type, and `includes` across that union of array types
  // resolves its parameter to `never`.
  const tagsA: readonly TowerTag[] = TOWERS[a.kind]!.tags;
  const tagsB: readonly TowerTag[] = TOWERS[b.kind]!.tags;
  const out: ComboKey[] = [];

  for (const combo of COMBOS) {
    // Either assignment of the two tags across the two towers counts, so a
    // combo definition never has to be written twice.
    const matched =
      (tagsA.includes(combo.a) && tagsB.includes(combo.b)) ||
      (tagsA.includes(combo.b) && tagsB.includes(combo.a));
    if (matched) out.push(combo.key);
  }
  return out;
}

/**
 * Recompute every tower's combo list. O(towers²), which is why it is gated on
 * `state.combosDirty` rather than run every step.
 */
export function refreshCombos(state: GameState): void {
  const towers = state.towers;
  const found: Set<ComboKey>[] = towers.map(() => new Set<ComboKey>());

  for (let i = 0; i < towers.length; i++) {
    for (let j = i + 1; j < towers.length; j++) {
      const a = towers[i]!;
      const b = towers[j]!;
      if (!towersLinked(a, b)) continue;
      for (const key of combosBetween(a, b)) {
        found[i]!.add(key);
        found[j]!.add(key);
      }
    }
  }

  for (let i = 0; i < towers.length; i++) {
    // Sorted so two identical boards built in different orders produce
    // identical state — the arrays are compared and rendered, not just read.
    towers[i]!.combos = [...found[i]!].sort();
  }
  state.combosDirty = false;
}

/** The combined effect of everything currently active on one tower. */
export function comboEffect(tower: Tower): ComboEffect {
  if (tower.combos.length === 0) return NEUTRAL;

  const out: ComboEffect = { ...NEUTRAL };
  for (const key of tower.combos) {
    const def = COMBOS.find((c) => c.key === key);
    if (!def) continue;
    out.damageMul *= def.effect.damageMul;
    out.fireRateMul *= def.effect.fireRateMul;
    out.burnMul *= def.effect.burnMul;
    out.goldMul *= def.effect.goldMul;
    out.chainBonus += def.effect.chainBonus;
  }
  return out;
}

/**
 * Every partner that supplies `tower` with at least one combo, and which.
 * Used by the renderer to draw the links, and by the HUD to explain them — so
 * what is drawn is derived from the same rule that grants the bonus.
 */
export function comboPartners(
  state: GameState,
  tower: Tower,
): { partner: Tower; keys: ComboKey[] }[] {
  const out: { partner: Tower; keys: ComboKey[] }[] = [];
  for (const other of state.towers) {
    if (other.id === tower.id) continue;
    if (!towersLinked(tower, other)) continue;
    const keys = combosBetween(tower, other);
    if (keys.length > 0) out.push({ partner: other, keys });
  }
  return out;
}

/**
 * What combos a tower of `kind` WOULD get if it were dropped at this position.
 * Drives the placement preview, so the player can see a combo before paying
 * for it rather than discovering it afterwards.
 */
export function previewCombos(
  state: GameState,
  kind: Tower['kind'],
  pos: { x: number; y: number },
): { partner: Tower; keys: ComboKey[] }[] {
  // A throwaway tower stands in for the real one. Building the candidate out of
  // the same Tower shape means the preview goes through exactly the same
  // overlap and tag rules as a placed tower, instead of a parallel copy of them
  // that can drift.
  const ghost: Tower = {
    id: -1,
    kind,
    cell: { cx: -1, cy: -1 },
    pos: { x: pos.x, y: pos.y },
    level: 1,
    cooldown: 0,
    invested: 0,
    kills: 0,
    earned: 0,
    aim: 0,
    recoil: 0,
    targetMode: 'first',
    combos: [],
  };
  return comboPartners(state, ghost);
}
