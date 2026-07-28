/**
 * Mouse + touch input.
 *
 * Both go through Pointer Events, so a finger tap and a mouse click produce
 * exactly the same action — there is no separate touch code path to keep in
 * sync. Screen coordinates are converted to world units once, here.
 *
 * Input never mutates GameState. It either changes UiState (what's selected)
 * or emits an Intent, which the sim applies at the start of its next step.
 */

import { WORLD, type AbilityKey, type PerkKey, type TowerKind } from '../config/balance';
import { worldToCell } from '../core/grid';
import { inBounds } from '../core/grid';
import type { GameState } from '../core/types';
import {
  ADVANCE_BUTTON,
  HUD_BUTTONS,
  buildButtons,
  hitTest,
  towerPanelRects,
} from '../render/hud';
import { MENU_BUTTONS } from '../render/menu';
import { currentTutorialStep } from '../tutorial';
import {
  ARMOR_BRIEFING_CLOSE,
  PAUSE_BUTTONS,
  PAUSE_TAB_RECTS,
  PERK_CARDS,
  RESTART_CONFIRM,
  TUTORIAL_CARD,
  armorBriefingVisible,
} from '../render/screens';
import { visibleAbilityCards } from '../render/abilityMenu';
import { placementError } from '../core/towers';
import { screenToWorld, type Viewport } from '../render/viewport';
import { armAbility, armBuild, selectTower, type UiState } from '../uiState';

export interface InputActions {
  togglePause(): void;
  cycleSpeed(): void;
  restart(): void;
  placeTower(kind: TowerKind, cx: number, cy: number): void;
  upgradeTower(towerId: number): void;
  sellTower(towerId: number): void;
  cycleTargetMode(towerId: number): void;
  advanceAge(): void;
  choosePerk(key: PerkKey): void;
  castAbility(key: AbilityKey, x: number, y: number): void;
  toggleTower(towerId: number): void;
  toggleFullscreen(): void;
  toggleMute(): void;
  /** Leave the run for the title screen. Saves on the way out. */
  openMenu(): void;
  /** Title screen actions. */
  startNewRun(): void;
  continueRun(): void;
}

export function attachInput(
  canvas: HTMLCanvasElement,
  ui: UiState,
  getState: () => GameState,
  getViewport: () => Viewport,
  actions: InputActions,
): void {
  const toWorld = (e: PointerEvent) => screenToWorld(getViewport(), e.clientX, e.clientY);

  /** Is this press on the board rather than on a HUD strip? */
  const onBoard = (y: number) => y >= WORLD.hudTop && y <= WORLD.height - WORLD.hudBottom;

  canvas.addEventListener('pointerdown', (e) => {
    // preventDefault stops a touch from also firing synthetic mouse events and
    // from starting a text-selection / scroll gesture on mobile.
    e.preventDefault();
    const p = toWorld(e);
    ui.pointer = p;
    ui.ghostCell = cellUnder(getState(), p.x, p.y);

    // Pressing on the board with a tool armed STARTS a placement drag; it does
    // not build. The build happens on release, wherever the ghost ended up —
    // which is what lets a finger drag around and watch the range ring and the
    // combo links before committing. A plain click is simply a drag of zero
    // length, so a mouse behaves exactly as it always did.
    //
    // A modal outranks the drag, and getting that wrong locked the game solid.
    // A perk draft covers the middle of the board, so with a build tool still
    // armed every press on a perk card started a placement drag and returned
    // before `handleTap` ever ran: the cards could not be clicked, the tower
    // could not be placed because the draft holds the wave, and the draft could
    // not be dismissed because dismissing it means clicking a card. Nothing on
    // screen responded and the run was over.
    if (!modalUp(ui, getState()) && ui.buildKind !== null && onBoard(p.y) && ui.ghostCell !== null) {
      ui.placing = true;
      // Capture, so a drag that wanders off the canvas still tracks and still
      // delivers its pointerup rather than stranding the ghost mid-placement.
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Some browsers refuse capture for synthetic pointers; the drag still
        // works, it just stops updating outside the canvas.
      }
      return;
    }

    const armedBefore = ui.buildKind;
    handleTap(ui, getState(), actions, p.x, p.y);

    // Arming a tool from the build bar STARTS a placement gesture too, so a
    // drag that runs from the button straight onto a cell builds there.
    //
    // That is the obvious gesture on a phone — press the tower you want, slide
    // your thumb to where it goes, lift — and it used to arm the tool and then
    // do nothing at all on release, because `placing` was only ever set by a
    // press that landed on the board. The player saw the button light up, saw
    // the ghost follow their thumb, lifted, and got no tower and no
    // explanation. `armBuild` clears the ghost, so nothing can be built until
    // the drag actually reaches a cell.
    if (ui.buildKind !== null && ui.buildKind !== armedBefore) {
      ui.placing = true;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // See above: capture is a nicety, the gesture works without it.
      }
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = toWorld(e);
    ui.pointer = p;
    // The ghost follows a hovering mouse AND a dragging finger, from the same
    // line — that is the whole of "one input path" for this feature.
    const cell = cellUnder(getState(), p.x, p.y);
    if (cell !== null || !ui.placing) ui.ghostCell = cell;
  });

  canvas.addEventListener('pointerup', (e) => {
    if (ui.placing) {
      ui.placing = false;
      // A modal that opened mid-drag cancels the build. A wave can clear while
      // a finger is down, and finishing that drag onto a perk card would both
      // spend gold the player did not mean to spend and eat the tap they did.
      if (modalUp(ui, getState())) {
        if (e.pointerType !== 'mouse') ui.pointer = null;
        return;
      }
      const kind = ui.buildKind;
      const cell = ui.ghostCell;
      if (kind !== null && cell !== null) {
        actions.placeTower(kind, cell.cx, cell.cy);
        // Disarm only for a placement that will actually succeed, checked with
        // the SAME placementError the sim uses — a rejected drag leaves the
        // tool armed for another try rather than silently dropping it.
        if (placementError(getState(), kind, cell.cx, cell.cy) === null) {
          armBuild(ui, null);
        }
      }
    }
    // A lifted finger has no hover position; a mouse still does.
    if (e.pointerType !== 'mouse') ui.pointer = null;
  });

  canvas.addEventListener('pointercancel', () => {
    // A cancelled gesture must not build anything — that is what cancelled
    // means. The armed tool survives so the player can simply try again.
    ui.placing = false;
    ui.pointer = null;
  });
  canvas.addEventListener('pointerleave', () => {
    if (!ui.placing) ui.pointer = null;
  });

  // Block the long-press context menu so it can't interrupt placement.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    // The title screen has no keyboard verbs of its own, and every shortcut
    // below acts on a run. Pausing, restarting or arming a build tool from the
    // menu would all quietly change a game the player is not looking at.
    if (ui.screen === 'menu') return;
    switch (e.key) {
      case ' ':
      case 'p':
      case 'P':
        e.preventDefault();
        actions.togglePause();
        break;
      case 'f':
      case 'F':
        actions.cycleSpeed();
        break;
      case 'r':
      case 'R':
        // Same destructive action as the button, so it gets the same question.
        // R sits next to the number keys that arm build tools, which is
        // exactly the sort of neighbour a mis-key finds.
        ui.confirmingRestart = true;
        break;
      case 'Escape':
        // From a finished run, Escape is the way back to the title screen —
        // there is nothing left to put down.
        if (getState().phase !== 'playing') {
          actions.openMenu();
          break;
        }
        armBuild(ui, null);
        selectTower(ui, null);
        ui.showCombos = false;
        // Escape means "put down whatever I am holding", in the order a player
        // would expect: the thing in hand first, then the menu it came from.
        if (ui.confirmingRestart) ui.confirmingRestart = false;
        else if (ui.armedAbility !== null) armAbility(ui, null);
        else ui.abilityMenuOpen = false;
        break;
      case 'm':
      case 'M':
        actions.toggleMute();
        break;
      case 'c':
      case 'C':
        ui.showCombos = !ui.showCombos;
        break;
      case 'q':
      case 'Q':
        ui.abilityMenuOpen = !ui.abilityMenuOpen;
        if (!ui.abilityMenuOpen) armAbility(ui, null);
        break;
      // Number keys arm the build tools, matching the bar order. Six, because
      // the Tech Age bar is six wide once the Factory is on it.
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6': {
        const btn = buildButtons(getState().age)[Number(e.key) - 1];
        if (btn) armBuild(ui, btn.kind);
        break;
      }
      default:
        break;
    }
  });
}

/**
 * Is a screen up that owns every tap?
 *
 * These all cover the board, and `handleTap` already resolves them in priority
 * order — but only if it is reached at all. Anything that short-circuits before
 * `handleTap` (the placement drag does) has to consult this first, or it eats
 * the taps meant for a modal and the game stops responding.
 */
function modalUp(ui: UiState, state: GameState): boolean {
  return (
    ui.screen === 'menu' ||
    ui.confirmingRestart ||
    state.perkChoices !== null ||
    ui.paused ||
    ui.showCombos
  );
}

/** The grid cell a world position falls in, or null if it is off the board. */
function cellUnder(
  state: GameState,
  x: number,
  y: number,
): { cx: number; cy: number } | null {
  const c = worldToCell(state.layout, x, y);
  return inBounds(state.map, c.cx, c.cy) ? c : null;
}

/**
 * One tap, resolved in priority order: chrome first, then the board. Chrome
 * wins because its buttons overlap the board's world coordinates, and a tap
 * meant for a button must never also place a tower behind it.
 */
function handleTap(
  ui: UiState,
  state: GameState,
  actions: InputActions,
  x: number,
  y: number,
): void {
  // The title screen owns every tap while it is up. First, before anything
  // else is even considered: nothing behind it is on screen, so nothing behind
  // it may be reachable.
  if (ui.screen === 'menu') {
    for (const b of MENU_BUTTONS) {
      if (!hitTest(b.rect, x, y)) continue;
      if (b.id === 'new') actions.startNewRun();
      else actions.continueRun();
      return;
    }
    return;
  }

  // The restart confirmation outranks everything, including the perk draft:
  // it is a question the player just asked for, and nothing behind it should
  // be reachable while it is up.
  if (ui.confirmingRestart) {
    if (hitTest(RESTART_CONFIRM.yes, x, y)) {
      ui.confirmingRestart = false;
      actions.restart();
    } else if (hitTest(RESTART_CONFIRM.no, x, y) || !hitTest(RESTART_CONFIRM.panel, x, y)) {
      // Tapping outside cancels, which is the safe default for a destructive
      // question — a stray tap must never be the one that ends the run.
      ui.confirmingRestart = false;
    }
    return;
  }

  // A perk draft is modal: it takes the whole screen and nothing behind it is
  // reachable, so it must be resolved before anything else is considered.
  if (state.perkChoices !== null) {
    state.perkChoices.forEach((key, i) => {
      const card = PERK_CARDS[i];
      if (card && hitTest(card, x, y)) actions.choosePerk(key);
    });
    return;
  }

  // The pause menu is modal: it covers the board and owns every tap while it
  // is up, so nothing behind it can be reached by accident.
  if (ui.paused) {
    for (const tab of PAUSE_TAB_RECTS) {
      if (hitTest(tab.rect, x, y)) {
        ui.pauseTab = tab.id;
        return;
      }
    }
    if (ui.pauseTab === 'game') {
      for (const b of PAUSE_BUTTONS) {
        if (!hitTest(b.rect, x, y)) continue;
        if (b.id === 'resume') actions.togglePause();
        else if (b.id === 'menu') actions.openMenu();
        else if (b.id === 'restart') ui.confirmingRestart = true;
        else if (b.id === 'mute') actions.toggleMute();
        else if (b.id === 'speed') actions.cycleSpeed();
        else actions.toggleFullscreen();
        return;
      }
    }
    return;
  }

  // The combos sheet is modal too — any tap dismisses it, so it can never
  // swallow a tap meant for the board underneath.
  if (ui.showCombos) {
    ui.showCombos = false;
    return;
  }

  // Tapping the tutorial card retires the tutorial. Before the HUD and the
  // board, so the tap that dismisses it cannot also place a tower under it.
  if (!ui.tutorialDone && currentTutorialStep(state, ui) !== null && hitTest(TUTORIAL_CARD, x, y)) {
    ui.tutorialDone = true;
    return;
  }

  // The briefing's close button. Before the HUD and the board, because the
  // card is drawn over both and a tap on its X must not fall through to a
  // tower placement underneath it.
  if (armorBriefingVisible(state, ui) && hitTest(ARMOR_BRIEFING_CLOSE, x, y)) {
    ui.armorBriefingDismissed = true;
    return;
  }

  for (const b of HUD_BUTTONS) {
    if (!hitTest(b, x, y)) continue;
    if (b.id === 'pause') actions.togglePause();
    else if (b.id === 'speed') actions.cycleSpeed();
    else if (b.id === 'fullscreen') actions.toggleFullscreen();
    else if (b.id === 'mute') actions.toggleMute();
    else if (b.id === 'combos') ui.showCombos = !ui.showCombos;
    else if (b.id === 'abilities') {
      ui.abilityMenuOpen = !ui.abilityMenuOpen;
      // Closing the tray puts down whatever was picked up from it, so an armed
      // ability can never outlive the menu it came from and turn the next
      // board click into a surprise 8-diamond cast.
      if (!ui.abilityMenuOpen) armAbility(ui, null);
    } else ui.confirmingRestart = true;
    return;
  }

  // The tray, while it is open. Before the build bar and the board, because it
  // overlaps both and a tap on a card must never fall through to either.
  if (ui.abilityMenuOpen) {
    for (const card of visibleAbilityCards(state)) {
      if (!hitTest(card.rect, x, y)) continue;
      armAbility(ui, card.key);
      return;
    }
  }

  // An armed ability claims the next board tap. Checked after the chrome so
  // the tray, the HUD buttons and the build bar all still work while holding
  // one — you must be able to change your mind without spending it.
  if (ui.armedAbility !== null && y > WORLD.hudTop && y < WORLD.height - WORLD.hudBottom) {
    actions.castAbility(ui.armedAbility, x, y);
    armAbility(ui, null);
    return;
  }

  for (const b of buildButtons(state.age)) {
    if (!hitTest(b, x, y)) continue;
    armBuild(ui, b.kind);
    return;
  }

  if (hitTest(ADVANCE_BUTTON, x, y)) {
    actions.advanceAge();
    return;
  }

  // The selection panel only swallows taps while it's actually open. Its rects
  // travel with the tower, so they come from the SAME function that drew them.
  const selected = state.towers.find((t) => t.id === ui.selectedTowerId);
  if (selected) {
    const r = towerPanelRects(state, selected);
    if (hitTest(r.upgrade, x, y)) {
      actions.upgradeTower(selected.id);
      return;
    }
    if (r.target && hitTest(r.target, x, y)) {
      actions.cycleTargetMode(selected.id);
      return;
    }
    if (r.toggle && hitTest(r.toggle, x, y)) {
      actions.toggleTower(selected.id);
      return;
    }
    if (hitTest(r.sell, x, y)) {
      actions.sellTower(selected.id);
      selectTower(ui, null); // the panel's subject no longer exists
      return;
    }
    if (hitTest(r.panel, x, y)) return;
  }

  // Taps in the HUD strips that missed every button do nothing, rather than
  // falling through to the board underneath.
  if (y < WORLD.hudTop || y > WORLD.height - WORLD.hudBottom) return;

  const cell = worldToCell(state.layout, x, y);
  if (!inBounds(state.map, cell.cx, cell.cy)) {
    selectTower(ui, null);
    return;
  }

  // Placement is resolved on pointerup by the drag handler, never here — see
  // the pointerdown listener. If a build tool is armed this tap was already
  // claimed there and never reaches handleTap.

  // Not building: tap a tower to open its panel, tap bare ground to close it.
  const towerId = state.occupancy[cell.cy * state.map.cols + cell.cx] ?? 0;
  selectTower(ui, towerId !== 0 ? towerId : null);
}
