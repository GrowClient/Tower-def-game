# CLAUDE.md

Architecture rules and conventions for this repo.
For *what the game is*, read **[GAME_DESIGN.md](./GAME_DESIGN.md)** — that is the
design reference and the source of truth for intent.

---

## The three rules

### 1. `src/core/` is a pure, deterministic simulation

`core/` may import **only** from `core/` and `config/`. It must never import
from `render/`, `fx/`, `input/`, `platform/`, or anything DOM-related.

Inside `core/` the following are **banned**:

- `Math.random()` — all randomness goes through `core/rng.ts` and an `Rng`
  carried on the game state
- `Date.now()` / `performance.now()` — the sim's only clock is `state.time`,
  which advances by exactly `SIM.dt` per step
- `window`, `document`, `canvas`, `localStorage`
- Variable timesteps

**Same seed + same inputs must always produce the same run.** This is not
academic tidiness: it is what makes a balance change measurable instead of
anecdotal. `?seed=123` in the URL pins a run so a problem can be reproduced.

### 2. `src/render/` reads state and never mutates it

Nothing under `render/` may write to any object reachable from `GameState`. If
a draw function needs memory between frames, that state belongs in `src/fx/`
or `UiState`, never on `GameState`.

### 3. All tunable numbers live in `src/config/balance.ts`

If you would ever want to change a number to make the game feel different, it
belongs in `balance.ts` — enemy HP/speed/armor, tower damage/range/firerate/
cost, age advancement cost, scaling curves, wave composition. Nothing
balance-related is hard-coded anywhere else. This file is edited constantly;
keep it readable and grouped.

Colours and layout constants are **presentation**, not balance — they live in
`render/palette.ts` and `WORLD` respectively.

---

## File map

```
src/
├── main.ts               bootstrap: canvas, fixed-timestep loop, wiring.
│                         Owns the wall clock and the URL — core may not.
├── uiState.ts            session state that is NOT simulation: pause, speed,
│                         pointer. Kept off GameState so replays stay honest.
├── config/
│   └── balance.ts        ALL tunable numbers. Imports nothing.
├── core/                 PURE SIM — see rule 1
│   ├── types.ts          entity/state types, enums, SimEvent union
│   ├── rng.ts            mulberry32 seeded PRNG, explicit state
│   ├── grid.ts           world-space grid layout, cell <-> world conversion
│   ├── mapgen.ts         seeded path assembly from RUN/JOG pieces
│   ├── path.ts           arc-length polyline; sampleAt(dist) -> pos + dir
│   ├── state.ts          newRun(seed) — the only way a game starts
│   ├── sim.ts            step(state) — the ONLY function that advances time
│   ├── enemies.ts        spawn, movement, leaks
│   └── events.ts         sim -> presentation event queue
├── render/               READS state, never mutates — see rule 2
│   ├── viewport.ts       16:9 letterbox, DPR, screen <-> world
│   ├── palette.ts        colours, per-age accents, font helper
│   ├── renderer.ts       draw orchestration
│   ├── drawMap.ts        grid plates and the path band
│   ├── drawEntities.ts   enemies (towers, projectiles later)
│   ├── hud.ts            top stat strip + bottom build bar + button rects
│   └── screens.ts        pause / game over / rotate-device overlays
└── input/
    └── input.ts          Pointer Events -> world coords -> actions
```

Landing in later slices, as listed in GAME_DESIGN.md's build order:
`core/towers.ts`, `core/projectiles.ts`, `core/waves.ts`, `core/ages.ts`,
`core/economy.ts`, `core/intents.ts`, `render/drawEffects.ts`, `fx/effects.ts`,
`platform/storage.ts`.

---

## Conventions

- **World units, not pixels.** The sim works in a fixed 1600×900 world rect.
  `render/viewport.ts` is the single place that translates to screen pixels.
- **Fixed timestep.** `step()` always advances exactly `SIM.dt`. The 2× speed
  toggle runs *two steps per frame*; it never doubles `dt`. Pause runs zero.
- **Events, not callbacks, for juice.** The sim pushes plain serialisable
  `SimEvent`s; the fx layer drains them each frame. The sim must not know that
  screenshake exists.
- **Flag then sweep.** Entities are marked `dead` and removed at the end of a
  step, never spliced mid-iteration — removal timing must not affect ordering,
  or determinism breaks.
- **One input path.** Mouse and touch both go through Pointer Events and
  produce identical actions. There is no separate touch code path.
- **Button geometry is exported.** `render/hud.ts` exports the rectangles it
  draws so `input/` hit-tests the exact same geometry. Never duplicate a rect.
- **No assets.** All art is flat geometry drawn in code. Do not add image or
  audio files, and do not reference any.
- **Comment the non-obvious.** Explain *why* (e.g. why the map generator can't
  self-intersect), not *what* the next line does.

---

## Commands

```bash
npm install
npm run dev        # http://localhost:5173  (--host, so a phone on the LAN can open it)
npm run typecheck  # tsc --noEmit, strict
npm run build
```

## Checks worth running before calling a slice done

- `npm run typecheck` clean
- Same `?seed=` twice produces an identical map
- Resize the window wide and tall — the board stays 16:9 and centred
- Nothing under `src/core/` imports from `render/`, `fx/`, `input/` or
  `platform/`; no `Math.random`, `Date.now` or `window` inside `core/`
