# Ages of Defense

Endless tower defense. TypeScript + Vite + HTML5 Canvas 2D. No game engine, no
physics library, no art or audio assets — every visual is flat geometry drawn
in code.

Landscape 16:9: plays in a desktop browser and on a phone held sideways.

## Play it

Deployed from the default branch on every push:

**https://growclient.github.io/Tower-def-game/**

> **One-time setup:** GitHub Pages must be enabled once, by hand, at
> *Settings → Pages → Build and deployment → Source: **GitHub Actions***.
> The workflow cannot do this itself — creating a Pages site needs admin
> permission the default `GITHUB_TOKEN` doesn't carry. After that single
> toggle, every push deploys automatically.

That is a top-level page, which matters: the Fullscreen API is gated by a
permission the embedding page must grant, so an embedded copy can never go
fullscreen. From this URL the ⛶ button works, and on iOS — where the
Fullscreen API doesn't exist at all — Safari's *Add to Home Screen* launches it
without browser chrome.

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
| Mute | `M`, or the speaker button | tap the speaker |
| Sell a tower | select it, then SELL | same |
| Advance an age | the button, lower left | same |

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

Built in vertical slices. Shipped so far:

1. Seeded map generation, terrain, the path, enemies walking it
2. Tower placement, targeting, projectiles, upgrades, gold
3. Waves, difficulty curves, lives, run summary, local high score
4. All six enemy types, bosses every 10 waves, tower targeting modes
5. All three ages, selling towers, the perk draft, and synthesised sound
6. Per-age tower art, Gold Mines, Snipers, and a costlier age advance

**Still to do — the juice pass.** Screenshake, hit-flash, squash/stretch,
particle bursts on death, floating damage numbers, slow-motion on a boss kill,
and a full-screen flash + shockwave when an age advances. The sim already
pushes every `SimEvent` these need; only `audio/sfx.ts` drains that queue
today. The two files this pass adds — `src/fx/effects.ts` and
`src/render/drawEffects.ts` — are already named in
[CLAUDE.md](./CLAUDE.md)'s file map.

Alongside it: balance tuning against real playtests, in particular whether
advancing an age at 1000 gold *feels* worth it. A scripted bot can't answer
that one — see [GAME_DESIGN.md](./GAME_DESIGN.md).

## Publishing

The game is a static site — one HTML file and one JS bundle, no server, no
assets. Three build targets, and the difference between them is only the base
path the bundle's asset URLs are written against:

```bash
npm run build        # dist/       — absolute /assets/..., for a domain root
npm run build:pages  # dist/       — /Tower-def-game/..., for GitHub Pages
npm run build:itch   # dist-itch/  — RELATIVE ./assets/..., for itch.io et al
```

**Use `build:itch` for any portal that serves your game from a subdirectory**,
which is all of them: itch.io serves from something like
`html-classic.itch.zone/html/12345678/index.html`, so a bundle built with the
default absolute `/assets/...` resolves to the domain root, 404s, and shows a
black screen. Relative paths work from any depth.

To upload: zip the CONTENTS of `dist-itch/` (index.html at the top level of the
zip, not inside a folder), and on itch tick "This file will be played in the
browser". Viewport 1280x720, fullscreen button on — the game letterboxes itself
to 16:9 at any size.
