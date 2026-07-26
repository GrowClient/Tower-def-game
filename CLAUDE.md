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
│   ├── intents.ts        player actions, applied at the START of a step
│   ├── enemies.ts        spawn, per-wave scaling, movement, damage, leaks
│   ├── towers.ts         placement rules, targeting, firing, upgrades
│   ├── projectiles.ts    flight and impact (incl. splash)
│   ├── waves.ts          threat budget, composition draw, pacing
│   ├── economy.ts        costs, kill bounty, wave clear reward
│   ├── ages.ts           advancement: unlocks tiers, never transforms towers
│   ├── perks.ts          the every-5-waves draft and its run-wide effects
│   ├── combos.ts         overlapping tower fields -> named synergy bonuses
│   └── events.ts         sim -> presentation event queue
├── render/               READS state, never mutates — see rule 2
│   ├── viewport.ts       16:9 letterbox, DPR, screen <-> world
│   ├── palette.ts        BIOMES (one per age), shared colours, font helper
│   ├── terrain.ts        procedural ground + track, baked once per run
│   ├── renderer.ts       draw orchestration
│   ├── drawMap.ts        dynamic map overlay: lattice, build mode, ghosts
│   ├── drawEntities.ts   towers, enemies, projectiles
│   ├── drawEffects.ts    particles, shockwaves, damage numbers, screen flash
│   ├── hud.ts            stat strip, build bar, tower panel, button rects
│   └── screens.ts        pause / summary / perk draft / combos codex
├── fx/
│   └── effects.ts        particle + camera state. SECOND SimEvent consumer,
│                         alongside audio. Wall-clock, never sim time.
├── audio/
│   └── sfx.ts            synthesised SFX, driven by the SimEvent queue
├── input/
│   └── input.ts          Pointer Events -> world coords -> intents
└── platform/
    └── storage.ts        localStorage high score (never touched by core)
```

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
- **No assets.** All art is geometry drawn in code, and all SOUND is
  synthesised in `audio/sfx.ts` from oscillators and noise. Do not add image or
  audio files, and do not reference any.
- **Audio is a SimEvent consumer, exactly like fx.** The sim must never know
  sound exists. Sounds are throttled per type and capped per frame, because a
  busy wave emits dozens of events and playing them all is both deafening and a
  CPU sink.
- **Advancing an age unlocks, it never transforms.** Towers you already own
  keep working unchanged; selling them at a partial refund is how the
  transition is funded. That loss is the strategic cost of advancing.
- **Texture is baked, never per-frame.** The ground is a few thousand small
  shapes. `render/terrain.ts` scatters them once into an offscreen canvas and
  blits that every frame; it re-bakes only when the seed, age or display
  resolution changes. Anything static belongs in the bake, not in the loop.
- **Terrain scatter is seeded too.** It uses its own `Rng` derived from
  `state.seed` (never `Math.random`), so `?seed=123` reproduces the same
  meadow, not just the same path. That RNG stream is deliberately separate
  from the sim's, so adding decoration can never shift wave composition.
- **Scatter in clumps, not uniformly.** Uniform random placement reads as
  machine-made confetti. Pick clump centres and grow shapes around them, and
  fade density near the track instead of stopping dead at its edge.
- **Don't build clip regions by unioning subpaths.** Canvas uses nonzero
  winding, so quads and circles that wind oppositely cancel where they
  overlap and punch holes in the clip. To mask to a stroked shape, draw onto
  a layer and trim it with `destination-in` + the real stroke.
- **Derive behaviour from identity, not from context.** A boss's mechanic
  comes from *what it is*, looked up from its kind — not from which wave
  spawned it. Keying behaviour off the surrounding situation means the same
  entity silently loses it when spawned any other way.
- **Assert mechanics, don't eyeball them.** `core/` is pure, so every rule
  ("a shield eats one whole hit regardless of size", "a healer never heals
  itself") is directly testable headlessly. A rule with no assertion is a rule
  that will quietly stop holding.
- **`window.__td` exists in dev only.** `main.ts` exposes the live state behind
  `import.meta.env.DEV` so tooling can drive real runs; it is dead-code
  eliminated from production builds. Verify that with a grep after building,
  not by assuming.
- **Tune balance with the headless driver, not by eye.** `step()` needs no
  canvas, so a scripted player can run hundreds of full games in seconds.
  Bundle a driver with esbuild (NOT through the Vite dev server — a dynamic
  import there gets a *second* instance of `balance.ts`, so mutating `SCALING`
  changes nothing and every sweep row comes back identical). Assert that a
  mutation actually moves a sim output before trusting a sweep.
- **Measure the economy before pricing anything.** Every guess about an
  advance cost is really a guess about how much gold a run generates. Ask the
  driver for cumulative income per wave instead of picking a number and
  re-rolling the whole sweep.
- **A scripted probe must play the strategy the design intends.** The probe
  measured advancing as strictly bad until it was taught to sell old towers to
  fund the transition — until then it was benchmarking a strategy the game was
  never built around.
- **Change one lever at a time.** Difficulty knobs interact: moving eleven
  numbers at once took the median run from wave 7 to wave 46 with no way to
  attribute it.
- **Effects run on the wall clock, never on sim time.** `fx/` is updated with
  the real frame delta, so smoke keeps drifting while the game is paused or a
  perk draft holds the wave clock. Slow motion is `fx.timeScale` scaling the
  *accumulator* — it feeds fewer whole steps into the loop and never touches
  `SIM.dt`, so a boss dying dramatically cannot change the run.
- **Screenshake moves the board, not the chrome.** The HUD is drawn outside the
  shake transform: text that jitters is text you stop being able to read
  exactly when a wave is going badly.
- **An O(n²) sweep runs on a dirty flag, not per step.** Combos re-derive from
  every tower pair, so `state.combosDirty` is set by placing, selling,
  upgrading or taking a perk, and `updateTowers` clears it. Anything that can
  change a range ring has to set it.
- **A hidden synergy is a trap, not a mechanic.** Anything that silently
  multiplies a tower must be visible on the board (named links), previewable
  before purchase (the placement ghost), and listed somewhere the player can
  read it. A player who never notices a bonus is playing a strictly worse game
  with no way to find out.
- **Pacing is not difficulty.** Threat cost per unit doesn't scale with the
  wave, so the budget curve is really a unit-count curve, and a bigger budget on
  a fixed spawn interval buys a *longer* wave rather than a harder one. Bound
  the spawn window instead of hand-tuning the interval decay — it self-corrects
  when the budget is retuned.
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
