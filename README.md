# Tower Defense — Prototype

Endless tower defense. TypeScript + Vite + HTML5 Canvas 2D. No game engine, no
physics library, no art or audio assets — every visual is flat geometry drawn
in code.

Landscape 16:9: plays in a desktop browser and on a phone held sideways.

## Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

The dev server binds all interfaces, so to play on a phone open the **Network**
URL that Vite prints (e.g. `http://192.168.1.42:5173`) on a device on the same
Wi-Fi. Hold the phone in landscape.

Tap the **⛶** button in the top-right for fullscreen — worth it on a phone,
where the browser's address bar otherwise eats a chunk of the board. The
button is only shown when the browser actually supports it (iPhone Safari does
not; iPad and Android Chrome do).

## Controls

| Action | Mouse / keyboard | Touch |
|---|---|---|
| Pause | `Space` or `P`, or the ⏸ button | tap ⏸ |
| Speed 1× / 2× | `F`, or the speed button | tap the speed button |
| Restart | `R`, or the ↻ button | tap ↻ |
| Pick a tower | `1`–`4`, or the build bar | tap the build bar |
| Place it | click a highlighted cell | tap a highlighted cell |
| Inspect / upgrade | click a placed tower | tap a placed tower |
| Cancel | `Esc` | tap empty ground |
| Fullscreen | the ⛶ button | tap ⛶ |

## Reproducing a run

Add `?seed=123` to the URL to pin the run seed. The same seed always generates
the same map and the same wave composition, and restart keeps a pinned seed —
which makes balance changes measurable instead of anecdotal. Without the
parameter each run gets a fresh seed.

## Other commands

```bash
npm run typecheck   # tsc --noEmit, strict
npm run build       # typecheck + production bundle into dist/
npm run preview     # serve the production build
```

## Where things are

- **[GAME_DESIGN.md](./GAME_DESIGN.md)** — what the game is: ages, towers,
  enemies, scaling, economy, feel.
- **[CLAUDE.md](./CLAUDE.md)** — architecture rules, file map, conventions.
- **`src/config/balance.ts`** — every tunable number, in one file.

## Status

Built in vertical slices. Currently through **slice 3**:

1. Seeded map generation, terrain, the path, enemies walking it
2. Tower placement, targeting, projectiles, upgrades, gold
3. Waves, difficulty curves, lives, run summary, local high score
4. All six enemy types, bosses every 10 waves, tower targeting modes

Next: age advancement and branching (slice 5), then the juice and balance
pass (slice 6).
