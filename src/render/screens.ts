/**
 * Full-screen overlays: pause, end-of-run summary, and the portrait rotate hint.
 *
 * The rotate hint is drawn in SCREEN space (not world space) because the whole
 * point is that the world rectangle is currently a bad fit for the window.
 */

import {
  BUILD_ORDER,
  COMBOS,
  ENEMIES,
  ABILITIES,
  DIAMONDS,
  PERKS,
  TOWERS,
  WAVES,
  WORLD,
  type PerkKey,
  type TowerKind,
} from '../config/balance';
import { abilityCooldown } from '../core/abilities';
import { piercesPlating } from '../core/towers';
import { drawAbilityIcon } from './abilityMenu';
import type { GameState } from '../core/types';
import { PAUSE_TABS, speedMultiplier, type PauseTab, type UiState } from '../uiState';
import { comboColor } from './drawMap';
import { COLORS, biomeFor, font, type Biome } from './palette';
import { roundRect, towerGlyph, type Rect } from './hud';
import type { Viewport } from './viewport';

/**
 * Perk draft cards. Exported so input hit-tests exactly what was drawn — the
 * same one-source-of-truth rule as every other button in the game.
 */
const CARD_W = 340;
const CARD_H = 260;
const CARD_GAP = 26;

export const PERK_CARDS: Rect[] = [0, 1, 2].map((i) => {
  const total = 3 * CARD_W + 2 * CARD_GAP;
  return {
    x: (WORLD.width - total) / 2 + i * (CARD_W + CARD_GAP),
    y: WORLD.height / 2 - CARD_H / 2 + 26,
    w: CARD_W,
    h: CARD_H,
  };
});

/**
 * The draft. Wave progression is held while this is open, so the player can
 * actually read three options instead of being punished for looking.
 */
export function drawPerkDraft(
  ctx: CanvasRenderingContext2D,
  choices: PerkKey[],
  biome: Biome,
  stacks: Partial<Record<PerkKey, number>>,
): void {
  scrim(ctx, 0.82);

  ctx.textAlign = 'center';
  ctx.font = font(46);
  ctx.fillStyle = biome.accent;
  ctx.fillText('CHOOSE A PERK', WORLD.width / 2, 150);
  ctx.font = font(18);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText('lasts the whole run', WORLD.width / 2, 182);

  choices.forEach((key, i) => {
    const card = PERK_CARDS[i];
    const def = PERKS.find((p) => p.key === key);
    if (!card || !def) return;

    ctx.fillStyle = 'rgba(26, 21, 15, 0.96)';
    roundRect(ctx, card.x, card.y, card.w, card.h, 14);
    ctx.fill();
    ctx.strokeStyle = biome.accent;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = font(30);
    ctx.fillText(def.label, card.x + card.w / 2, card.y + 76);

    ctx.fillStyle = biome.accent;
    ctx.font = font(19);
    wrapText(ctx, def.detail, card.x + card.w / 2, card.y + 126, card.w - 48, 28);

    // Show what you already hold, so stacking is a visible decision rather
    // than a hidden one.
    const held = stacks[key] ?? 0;
    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(15);
    ctx.fillText(
      held > 0 ? `owned ${held}/${def.maxStacks}` : `up to ${def.maxStacks}`,
      card.x + card.w / 2,
      card.y + card.h - 30,
    );
  });

  ctx.textAlign = 'left';
}

/** Centre-aligned word wrap; canvas has no text layout of its own. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(' ');
  let line = '';
  let cursor = y;
  for (const word of words) {
    const attempt = line ? `${line} ${word}` : word;
    if (ctx.measureText(attempt).width > maxWidth && line) {
      ctx.fillText(line, cx, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = attempt;
    }
  }
  if (line) ctx.fillText(line, cx, cursor);
}

/**
 * The combos reference sheet.
 *
 * A hidden synergy is a trap, not a mechanic: a player who never notices that
 * ice built next to fire is worth free damage is playing a strictly worse game
 * and has no way to find out. So every combo is listed up front, with the tags
 * that make it and what it pays — and the board draws the links live while you
 * build, so the sheet is a reminder rather than something to memorise.
 */
export function drawCombosCodex(ctx: CanvasRenderingContext2D, biome: Biome): void {
  scrim(ctx, 0.88);

  ctx.textAlign = 'center';
  ctx.font = font(42);
  ctx.fillStyle = biome.accent;
  ctx.fillText('TOWER COMBOS', WORLD.width / 2, 96);

  drawCombosContent(ctx, 126);

  ctx.textAlign = 'center';
  ctx.font = font(19);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText('tap the button or press C to close', WORLD.width / 2, WORLD.height - 26);
  ctx.textAlign = 'left';
}

/**
 * The combo table itself, without any framing. Shared by the standalone codex
 * and by the pause menu's Combos tab so the two can never drift apart.
 */
function drawCombosContent(ctx: CanvasRenderingContext2D, top: number): void {
  ctx.textAlign = 'center';
  ctx.font = font(17);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(
    'Build two towers within about two cells of each other and both get stronger.',
    WORLD.width / 2,
    top,
  );
  ctx.fillStyle = '#F0C46A';
  ctx.font = font(17);
  ctx.fillText(
    'EACH COMBO APPLIES ONCE — ten partners give the same bonus as one. Different combos do stack with each other.',
    WORLD.width / 2,
    top + 24,
  );
  ctx.fillStyle = COLORS.textDim;
  ctx.font = font(17);

  const cols = 2;
  const cardW = 690;
  const cardH = 104;
  const gapX = 28;
  const gapY = 18;
  const startX = (WORLD.width - (cols * cardW + (cols - 1) * gapX)) / 2;

  COMBOS.forEach((combo, i) => {
    const cx = startX + (i % cols) * (cardW + gapX);
    const cy = top + 58 + Math.floor(i / cols) * (cardH + gapY);

    ctx.fillStyle = 'rgba(26, 21, 15, 0.94)';
    roundRect(ctx, cx, cy, cardW, cardH, 12);
    ctx.fill();
    ctx.strokeStyle = comboColor(combo.key);
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = comboColor(combo.key);
    ctx.font = font(24);
    ctx.fillText(combo.label, cx + 22, cy + 40);

    // The two tags that form it, as chips, right-aligned on the title row.
    // Laid out from the right edge because the chips vary a lot in width
    // (ECONOMY vs ICE), and running them left-to-right pushed the description
    // off the card for the widest pairs.
    const tags = [combo.a, combo.b].map((t) => t.toUpperCase());
    ctx.font = font(14);
    const chipW = tags.map((t) => ctx.measureText(t).width + 18);
    let tagX = cx + cardW - 22 - chipW.reduce((a, b) => a + b, 0) - (tags.length - 1) * 8;
    tags.forEach((tag, k) => {
      ctx.fillStyle = 'rgba(255,255,255,0.09)';
      roundRect(ctx, tagX, cy + 22, chipW[k]!, 24, 6);
      ctx.fill();
      ctx.strokeStyle = comboColor(combo.key);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = COLORS.text;
      ctx.fillText(tag, tagX + 9, cy + 39);
      tagX += chipW[k]! + 8;
    });

    // Description on its own full-width line, so no pairing can crowd it out.
    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(16);
    ctx.fillText(combo.detail, cx + 22, cy + 76);
  });

  // Which tower carries which tag — otherwise the tags above are abstractions.
  const legendY = top + 58 + Math.ceil(COMBOS.length / cols) * (cardH + gapY) + 22;
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.textDim;
  ctx.font = font(15);
  ctx.fillText('WHICH TOWERS CARRY WHICH TAG', WORLD.width / 2, legendY);

  const tags = [...new Set(COMBOS.flatMap((c) => [c.a, c.b]))];
  ctx.font = font(14);
  tags.forEach((tag, i) => {
    const owners = (Object.keys(TOWERS) as TowerKind[])
      .filter((k) => (TOWERS[k].tags as readonly string[]).includes(tag))
      .map((k) => TOWERS[k].label)
      .join(', ');
    ctx.fillStyle = COLORS.text;
    ctx.fillText(`${tag.toUpperCase()} — ${owners}`, WORLD.width / 2, legendY + 26 + i * 21);
  });
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Pause menu
// ---------------------------------------------------------------------------

/**
 * Pausing used to be a scrim with the word PAUSED on it, which wasted the one
 * moment in a run when the player is definitely reading rather than reacting.
 * It is now where all the reference material lives: what the combos are, what
 * each enemy type demands, what every tower actually costs and does.
 *
 * Geometry is exported so `input/` hit-tests exactly these rects.
 */
const TAB_W = 158;
const TAB_H = 48;
const TAB_Y = 128;

export const PAUSE_TAB_RECTS: { id: PauseTab; label: string; rect: Rect }[] = PAUSE_TABS.map(
  (id, i) => {
    const total = PAUSE_TABS.length * TAB_W + (PAUSE_TABS.length - 1) * 12;
    return {
      id,
      label: id.toUpperCase(),
      rect: {
        x: (WORLD.width - total) / 2 + i * (TAB_W + 12),
        y: TAB_Y,
        w: TAB_W,
        h: TAB_H,
      },
    };
  },
);

export type PauseAction = 'resume' | 'restart' | 'mute' | 'speed' | 'fullscreen';

const MENU_BTN_W = 420;
const MENU_BTN_H = 62;

export const PAUSE_BUTTONS: { id: PauseAction; rect: Rect }[] = (
  ['resume', 'speed', 'mute', 'fullscreen', 'restart'] as PauseAction[]
).map((id, i) => ({
  id,
  rect: {
    x: (WORLD.width - MENU_BTN_W) / 2,
    y: 250 + i * (MENU_BTN_H + 14),
    w: MENU_BTN_W,
    h: MENU_BTN_H,
  },
}));

export function drawPauseMenu(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  ui: UiState,
  biome: Biome,
): void {
  scrim(ctx, 0.9);

  ctx.textAlign = 'center';
  ctx.font = font(44);
  ctx.fillStyle = biome.accent;
  ctx.fillText('PAUSED', WORLD.width / 2, 84);

  for (const tab of PAUSE_TAB_RECTS) {
    const active = ui.pauseTab === tab.id;
    ctx.fillStyle = active ? 'rgba(74, 61, 36, 0.95)' : 'rgba(26, 21, 15, 0.9)';
    roundRect(ctx, tab.rect.x, tab.rect.y, tab.rect.w, tab.rect.h, 10);
    ctx.fill();
    ctx.strokeStyle = active ? biome.accent : 'rgba(0,0,0,0.55)';
    ctx.lineWidth = active ? 3 : 2;
    ctx.stroke();

    ctx.fillStyle = active ? COLORS.text : COLORS.textDim;
    ctx.font = font(19);
    ctx.fillText(tab.label, tab.rect.x + tab.rect.w / 2, tab.rect.y + 32);
  }

  switch (ui.pauseTab) {
    case 'combos':
      drawCombosContent(ctx, 214);
      break;
    case 'enemies':
      drawEnemyGuide(ctx, biome);
      break;
    case 'towers':
      drawTowerGuide(ctx, state, biome);
      break;
    case 'abilities':
      drawAbilityGuide(ctx, state, biome);
      break;
    case 'game':
    default:
      drawPauseButtons(ctx, ui, biome);
      break;
  }
  ctx.textAlign = 'left';
}

function drawPauseButtons(ctx: CanvasRenderingContext2D, ui: UiState, biome: Biome): void {
  for (const b of PAUSE_BUTTONS) {
    let label: string;
    switch (b.id) {
      case 'resume':
        label = 'RESUME';
        break;
      case 'restart':
        label = 'RESTART RUN';
        break;
      case 'mute':
        label = ui.muted ? 'SOUND: OFF' : 'SOUND: ON';
        break;
      case 'speed':
        label = `SPEED: ${speedMultiplier(ui)}×`;
        break;
      case 'fullscreen':
        label = ui.fullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
        break;
    }
    const primary = b.id === 'resume';
    ctx.fillStyle = primary ? 'rgba(74, 61, 36, 0.95)' : 'rgba(26, 21, 15, 0.94)';
    roundRect(ctx, b.rect.x, b.rect.y, b.rect.w, b.rect.h, 12);
    ctx.fill();
    ctx.strokeStyle = primary ? biome.accent : 'rgba(255,255,255,0.16)';
    ctx.lineWidth = primary ? 3 : 2;
    ctx.stroke();

    ctx.fillStyle = primary ? COLORS.text : COLORS.textDim;
    ctx.font = font(22);
    ctx.textAlign = 'center';
    ctx.fillText(label, b.rect.x + b.rect.w / 2, b.rect.y + 40);
  }
}

/**
 * What each enemy type demands. The stats come from the balance table so they
 * cannot go stale; the "answer" column is the design intent, which is the part
 * a player actually needs and cannot read off a health bar.
 */
const ENEMY_ANSWER: Record<string, string> = {
  runner: 'Fast, fragile. Slowers and traps — raw DPS struggles to track them.',
  brute: 'Slow, enormous HP. Heavy towers, not more small hits.',
  swarm: 'Arrives as a block of weaklings. Splash damage.',
  armored: 'PLATED — blunt towers cannot hurt it and will not aim at it. Bring piercing or burn.',
  shielded: 'Eats whole hits regardless of size. Fire RATE strips it; big hits are wasted.',
  warchief: 'Makes everything near it move faster. Kill the carrier and the pack drops back — set a tower to SUPPORT.',
  zealot: 'Charges once below half HP. Chip damage makes it worse — kill it or leave it.',
  splitter: 'Bursts into two Swarm on death. Splash that catches the pieces beats overkill.',
  juggernaut: 'Heals itself unless kept under fire. Needs concentrated damage, not spread.',
};

function drawEnemyGuide(ctx: CanvasRenderingContext2D, biome: Biome): void {
  const kinds = Object.keys(ENEMY_ANSWER) as (keyof typeof ENEMIES)[];
  // Sized so the WHOLE roster fits on one screen. The list has no scroll, so a
  // row height that leaves the last enemy hanging off the bottom edge simply
  // hides a unit from the one screen whose job is to explain the units.
  const gap = 6;
  const top = 196;
  const rowH = Math.min(74, (WORLD.height - top - 40) / kinds.length - gap);
  const x = 150;
  const w = WORLD.width - 300;

  ctx.textAlign = 'left';
  kinds.forEach((kind, i) => {
    const def = ENEMIES[kind];
    const y = top + i * (rowH + gap);

    ctx.fillStyle = 'rgba(26, 21, 15, 0.92)';
    roundRect(ctx, x, y, w, rowH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = biome.accent;
    ctx.font = font(22);
    ctx.fillText(def.label, x + 20, y + 32);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(14);
    ctx.fillText(
      `hp ${def.maxHp}   speed ${def.speed}   armor ${def.armor}   bounty ${def.bounty}g` +
        (def.plated ? '   PLATED' : '') +
        (def.shieldHits > 0 ? `   shield ${def.shieldHits}` : '') +
        (def.speedAura > 1 ? `   rallies x${def.speedAura}` : ''),
      x + 20,
      y + 56,
    );

    ctx.fillStyle = COLORS.text;
    ctx.font = font(16);
    ctx.fillText(ENEMY_ANSWER[kind] ?? '', x + 330, y + 44);
  });
}

/**
 * The ability roster, all six, whatever age you are in.
 *
 * Deliberately shows LOCKED entries as well. The tray only lists what you can
 * cast right now, which is correct for a mid-wave menu but tells a Stone Age
 * player nothing about what advancing buys them — and "what is later in this
 * game" is exactly the question someone reads a pause menu to answer.
 */
function drawAbilityGuide(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  biome: Biome,
): void {
  // Sized to clear the tab strip above (which ends at y=176) and the build bar
  // below, with every row on screen — the guide has no scroll, so a roster that
  // runs off the bottom simply hides an ability from the screen that documents
  // them.
  const gap = 8;
  const top = 206;
  const rowH = Math.min(88, (WORLD.height - top - 40) / ABILITIES.length - gap);
  const x = 190;
  const w = WORLD.width - 380;

  ctx.textAlign = 'center';
  ctx.font = font(15);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(
    `Build an Exchanger to turn gold into diamonds — ${DIAMONDS.goldPerDiamond}g each. Press Q for the tray.`,
    WORLD.width / 2,
    top - 16,
  );

  ctx.textAlign = 'left';
  ABILITIES.forEach((def, i) => {
    const y = top + i * (rowH + gap);
    const locked = def.age > state.age;

    ctx.fillStyle = 'rgba(20, 28, 36, 0.92)';
    roundRect(ctx, x, y, w, rowH, 10);
    ctx.fill();
    ctx.strokeStyle = locked ? 'rgba(255,255,255,0.1)' : 'rgba(143, 227, 255, 0.4)';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    drawAbilityIcon(ctx, def.key, x + 40, y + rowH / 2, 22, !locked);

    ctx.fillStyle = locked ? COLORS.textDim : '#8FE3FF';
    ctx.font = font(21);
    ctx.fillText(def.label, x + 76, y + 30);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(13);
    ctx.fillText(
      locked
        ? `unlocked in the ${AGE_LABELS[def.age] ?? 'next age'}`
        : `${def.cost} diamonds  ·  ${def.cooldown}s cooldown` +
          (def.duration > 0 ? `  ·  ${def.duration}s` : '  ·  instant') +
          (abilityCooldown(state, def.key) > 0
            ? `  ·  READY IN ${abilityCooldown(state, def.key).toFixed(0)}s`
            : ''),
      x + 76,
      y + 50,
    );

    ctx.fillStyle = locked ? '#6A6152' : COLORS.text;
    ctx.font = font(15);
    ctx.fillText(def.detail, x + 76, y + 74);
  });
  void biome;
}

const AGE_LABELS = ['Stone Age', 'Middle Age', 'Tech Age'];

/** Every tower unlocked so far, with the numbers that decide a purchase. */
function drawTowerGuide(ctx: CanvasRenderingContext2D, state: GameState, biome: Biome): void {
  const kinds: TowerKind[] = [];
  for (let a = 0; a <= state.age; a++) kinds.push(...BUILD_ORDER[a]!);

  const cols = 3;
  const cardW = 420;
  const cardH = 92;
  const gapX = 20;
  const gapY = 12;
  const startX = (WORLD.width - (cols * cardW + (cols - 1) * gapX)) / 2;

  ctx.textAlign = 'left';
  kinds.forEach((kind, i) => {
    const def = TOWERS[kind]!;
    const cx = startX + (i % cols) * (cardW + gapX);
    const cy = 210 + Math.floor(i / cols) * (cardH + gapY);

    ctx.fillStyle = 'rgba(26, 21, 15, 0.92)';
    roundRect(ctx, cx, cy, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    towerGlyph(ctx, cx + 40, cy + cardH / 2, 22, kind, biomeFor(def.age));

    ctx.fillStyle = biome.accent;
    ctx.font = font(19);
    ctx.fillText(def.label, cx + 76, cy + 28);

    ctx.fillStyle = '#F0C46A';
    ctx.font = font(16);
    ctx.fillText(`${def.cost}g`, cx + 76, cy + 52);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(13);
    const bits: string[] = [];
    if (def.goldPerWave > 0) bits.push(`+${def.goldPerWave}g/wave`);
    if (def.damage > 0) bits.push(`dmg ${def.damage}`);
    if (def.slowFactor < 1) bits.push(`${Math.round((1 - def.slowFactor) * 100)}% slow`);
    if (def.fireRate > 0) bits.push(`${def.fireRate}/s`);
    if (def.unlimitedRange) bits.push('whole board');
    else if (def.range > 0) bits.push(`range ${def.range}`);
    if (def.splash > 0) bits.push(`splash ${def.splash}`);
    if (def.armorPierce >= 9999) bits.push('ignores armor');
    else if (def.armorPierce > 0) bits.push(`pierce ${def.armorPierce}`);
    if (def.pierce > 0) bits.push(`hits ${def.pierce + 1}`);
    if (def.chainCount > 0) bits.push(`chains ${def.chainCount}`);
    if (def.burnDps > 0) bits.push(`burn ${def.burnDps}/s`);
    // Drop the least important trailing stats rather than letting the line run
    // off the card — a Boulder listed every property it had and lost the last
    // one mid-word.
    const maxW = cardW - 92;
    while (bits.length > 1 && ctx.measureText(bits.join('   ')).width > maxW) bits.pop();
    ctx.fillText(bits.join('   '), cx + 76, cy + 74);

    if (def.tags.length > 0) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8A8272';
      ctx.font = font(12);
      ctx.fillText(def.tags.join(' · ').toUpperCase(), cx + cardW - 16, cy + 28);
      ctx.textAlign = 'left';
    }
  });
}

/**
 * End-of-run summary: how far you got, and — the part that actually teaches —
 * what killed you and what you'd built when it did.
 */
export function drawGameOverOverlay(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  biome: Biome,
  bestWave: number,
): void {
  scrim(ctx, 0.78);

  const cx = WORLD.width / 2;
  const top = 118;

  ctx.textAlign = 'center';
  ctx.font = font(64);
  ctx.fillStyle = '#F4664F';
  ctx.fillText('RUN OVER', cx, top);

  const isBest = state.wave.number >= bestWave;
  ctx.font = font(30);
  ctx.fillStyle = COLORS.text;
  ctx.fillText(`Wave ${state.wave.number}`, cx, top + 48);

  ctx.font = font(17);
  ctx.fillStyle = isBest ? biome.accent : COLORS.textDim;
  ctx.fillText(isBest ? 'NEW BEST' : `best  wave ${bestWave}`, cx, top + 76);

  ctx.font = font(19);
  ctx.fillStyle = biome.accent;
  ctx.fillText(`reached the ${biome.name}`, cx, top + 100);

  // What killed you.
  const killer = state.killedBy ? ENEMIES[state.killedBy]?.label ?? state.killedBy : 'nothing';
  ctx.font = font(19);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText('the last life went to a', cx, top + 134);
  ctx.font = font(28);
  ctx.fillStyle = '#F4664F';
  ctx.fillText(killer.toUpperCase(), cx, top + 164);

  drawLoadout(ctx, state, biome, top + 200);

  ctx.textAlign = 'center';
  ctx.font = font(20);
  ctx.fillStyle = COLORS.textDim;
  // Sit above the build bar, not on top of it — the bar is still drawn under
  // this overlay and the two collide at the bottom of the world rect.
  ctx.fillText('tap ↻ or press R for a new run', cx, WORLD.height - WORLD.hudBottom - 28);
  ctx.textAlign = 'left';
}

/** Tower loadout as a row of counted cards — what your board actually was. */
function drawLoadout(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  biome: Biome,
  y: number,
): void {
  const counts = new Map<TowerKind, { n: number; kills: number; spent: number }>();
  for (const t of state.towers) {
    const entry = counts.get(t.kind) ?? { n: 0, kills: 0, spent: 0 };
    entry.n++;
    entry.kills += t.kills;
    entry.spent += t.invested;
    counts.set(t.kind, entry);
  }

  ctx.textAlign = 'center';
  ctx.font = font(15);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText('LOADOUT', WORLD.width / 2, y);

  if (counts.size === 0) {
    ctx.font = font(20);
    ctx.fillStyle = COLORS.textDim;
    ctx.fillText('you never built anything', WORLD.width / 2, y + 40);
    return;
  }

  const cardW = 180;
  const cardH = 96;
  const gap = 14;
  const entries = [...counts.entries()];
  const total = entries.length * cardW + (entries.length - 1) * gap;
  let x = (WORLD.width - total) / 2;

  for (const [kind, entry] of entries) {
    ctx.fillStyle = 'rgba(26, 21, 15, 0.9)';
    roundRect(ctx, x, y + 18, cardW, cardH, 10);
    ctx.fill();
    ctx.strokeStyle = biome.accent;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.text;
    ctx.font = font(19);
    ctx.fillText(`${entry.n}× ${TOWERS[kind].label}`, x + cardW / 2, y + 48);

    ctx.fillStyle = COLORS.textDim;
    ctx.font = font(15);
    ctx.fillText(`${entry.kills} kills`, x + cardW / 2, y + 74);
    ctx.fillStyle = '#F0C46A';
    ctx.fillText(`${entry.spent}g spent`, x + cardW / 2, y + 96);

    x += cardW + gap;
  }
}

/**
 * Drawn when the window is portrait. Uses the raw canvas transform so it fills
 * the actual screen rather than the letterboxed world box.
 */
export function drawRotateHint(ctx: CanvasRenderingContext2D, vp: Viewport): void {
  ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
  ctx.fillStyle = 'rgba(6, 8, 14, 0.94)';
  ctx.fillRect(0, 0, vp.cssW, vp.cssH);

  const cx = vp.cssW / 2;
  const cy = vp.cssH / 2;
  const s = Math.min(vp.cssW, vp.cssH) * 0.16;

  ctx.save();
  ctx.translate(cx, cy - s * 0.4);
  ctx.rotate(-0.35);
  ctx.strokeStyle = '#E8A33D';
  ctx.lineWidth = Math.max(3, s * 0.09);
  ctx.lineJoin = 'round';
  ctx.strokeRect(-s * 0.42, -s * 0.72, s * 0.84, s * 1.44);
  ctx.restore();

  ctx.fillStyle = COLORS.text;
  ctx.font = font(Math.max(18, Math.min(vp.cssW, vp.cssH) * 0.055));
  ctx.textAlign = 'center';
  ctx.fillText('ROTATE YOUR DEVICE', cx, cy + s * 1.15);
  ctx.fillStyle = COLORS.textDim;
  ctx.font = font(Math.max(12, Math.min(vp.cssW, vp.cssH) * 0.032), 500);
  ctx.fillText('this game is played in landscape', cx, cy + s * 1.6);
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// The armor briefing
// ---------------------------------------------------------------------------

/**
 * The one tutorial in the game, and it exists because plating is the one rule
 * that can end a run through ignorance rather than through a bad decision.
 *
 * Shown during the extended break before the all-Armored wave (see
 * WAVES.armorBriefingPause, which exists to give this room). It deliberately
 * does three things a static tooltip cannot:
 *
 *   1. States the rule in the terms the player will SEE — towers standing
 *      idle, not damage numbers reading zero.
 *   2. Names the answers by reading the balance table, so the list cannot
 *      drift out of date the first time a tower's armorPierce changes.
 *   3. Checks the player's ACTUAL BOARD and says whether they are ready.
 *      "You have no answer to this" is the sentence that saves the run, and
 *      it is worth more than the other two put together.
 *
 * It draws no scrim and swallows no input: the whole point of the long pause
 * is that you can go and buy the tower while reading about it.
 */
export function drawArmorBriefing(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  biome: Biome,
): void {
  if (state.wave.active) return;
  if (state.wave.number + 1 !== WAVES.armorBriefingWave) return;
  if (state.perkChoices !== null) return;

  const unlocked: TowerKind[] = [];
  for (let a = 0; a <= state.age; a++) unlocked.push(...BUILD_ORDER[a]!);
  const answers = unlocked.filter(piercesPlating);
  const ready = state.towers.some((t) => piercesPlating(t.kind));

  const w = 760;
  const h = 250;
  const x = (WORLD.width - w) / 2;
  const y = 150;

  ctx.save();
  ctx.fillStyle = 'rgba(18, 15, 11, 0.93)';
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = ready ? biome.accent : '#F4664F';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.textAlign = 'center';
  const cx = x + w / 2;

  ctx.font = font(30);
  ctx.fillStyle = '#F4664F';
  ctx.fillText(`WAVE ${WAVES.armorBriefingWave}: ARMORED COLUMN`, cx, y + 46);

  ctx.font = font(17, 500);
  ctx.fillStyle = COLORS.text;
  ctx.fillText('Armored units are PLATED. Blunt weapons cannot hurt them —', cx, y + 84);
  ctx.fillText('and will not even aim at them. Your Throwers will stand idle.', cx, y + 108);

  ctx.font = font(16, 500);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(
    `Plating is answered by: ${answers.map((k) => TOWERS[k]!.label).join(', ')}`,
    cx,
    y + 146,
  );

  // The verdict on the board as it stands right now.
  ctx.font = font(20);
  ctx.fillStyle = ready ? '#8ED28A' : '#F4664F';
  ctx.fillText(
    ready
      ? 'Your board can answer this wave.'
      : 'NOTHING ON YOUR BOARD CAN HURT THEM. Build one now.',
    cx,
    y + 190,
  );

  ctx.font = font(15, 500);
  ctx.fillStyle = COLORS.textDim;
  ctx.fillText(
    `The wave starts in ${state.wave.timer.toFixed(0)}s — build while you read.`,
    cx,
    y + 222,
  );

  ctx.textAlign = 'left';
  ctx.restore();
}

function scrim(ctx: CanvasRenderingContext2D, alpha: number): void {
  ctx.fillStyle = `rgba(6, 8, 14, ${alpha})`;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
}
