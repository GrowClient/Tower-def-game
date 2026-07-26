# GAME_DESIGN.md

The design reference for this prototype. If code and this document disagree,
this document is the intent — fix the code or update this on purpose.

**Phase 1 goal: prove the core loop is fun.** No monetization, no backend, no
accounts, no native mobile build. There are no image or audio files in this
project and none should be added.

---

## Art direction

Everything is drawn in code. That is a constraint on *technique*, not on
ambition: "no assets" must not mean "flat coloured rectangles on a grid". A
board made of plates and bands reads as a spreadsheet, and no amount of
gameplay rescues that first impression.

The rule is: **each age must be recognisable from a screenshot with the label
covered up.** Not by adding fine detail, but by getting three things right —
what the ground is made of, what the road is worn into, and what is lying
around on it.

| | Ground | Track | Props |
|---|---|---|---|
| **Stone Age** | overgrown meadow, clumped grass, bare-earth scuffs | dirt rutted through the grass, gravel, a kerb of loose stones | standing stones, fallen logs, scattered rock |
| **Middle Age** | tilled earth and trodden turf | packed road, cobble at the edges | timber stakes, cart ruts |
| **Tech Age** | poured concrete, panel seams | sunken plating with painted markings | pylons, vents, cable runs |

Technique that gets this out of pure code:

- **Scatter in clumps, not uniformly.** Uniform random placement has no visual
  rhythm and reads instantly as generated noise. Real ground grows in patches.
- **Light everything from the same direction.** One consistent key light
  (upper-left) plus a contact shadow is what makes a flat polygon read as a
  raised rock.
- **Density gradients, not hard edges.** Vegetation should thin out toward the
  track over a margin. A clean boundary is what makes scatter look stamped on.
- **Bake it.** Terrain is generated once per run into an offscreen canvas from
  the run seed, then blitted. It costs one frame at startup and nothing after.
- **Units get a heavy dark outline.** Against textured ground, readable
  silhouettes matter more than unit detail — gameplay clarity always wins.

The grid is drawn as a whisper on buildable cells only, and lights up when the
player is actually placing something.

---

## Platform

Landscape **16:9**. The canonical play area is a fixed 1600×900 world rectangle
that is letterboxed into whatever window it gets, so a desktop browser and a
phone held sideways are the same code path — the desktop just gets bigger bars.
A phone held in portrait gets a "rotate your device" overlay rather than a
squashed board.

Mouse and touch both work, through the same Pointer Events path. Bottom-edge
build controls are sized for thumbs.

---

## Core loop

Endless single level. Waves escalate forever. The run ends when lives hit 0.

1. Waves of enemies walk the path from entrance to exit.
2. Enemies that reach the exit cost lives.
3. Kills grant gold.
4. Gold buys towers, in-age tower upgrades, and age advancement.
5. Repeat until dead. Score = wave reached.

Target: a new player's first run reaches roughly **wave 12–15**. The opening
must not be brutal.

---

## Map

A grid (default 20×9), regenerated every run from the run seed. **Not a fixed
layout.**

The path is assembled from two alternating piece types:

- **RUN** — a horizontal stretch, always left-to-right
- **JOG** — a vertical stretch, up or down

Because the column index never decreases, the path provably cannot cross
itself. That is what makes random assembly safe with no retry loop and no
validity check: every seed produces a legal map on the first attempt. Straight
vs corner tile appearance is derived afterwards from each cell's in/out
directions.

Enemies enter from off-board left and exit off-board right.

- **Non-path cells** are buildable — towers go beside the path.
- **Path cells** accept **traps only**.

Enemies track a single scalar: distance walked along the path. Slows are one
multiply, knockback is a subtraction, "furthest along" targeting is a compare,
and leaking is `dist >= pathLength`.

---

## Ages

Three ages: **Stone → Middle → Tech**. One accent colour each (amber, crimson,
cyan).

Advancement is **player-triggered by spending gold**, never automatic on a wave
number. This is the central strategic decision of the game:

> Advancing early = weaker now, stronger later.

The gold spent on advancing is gold not spent on towers for the wave in front
of you, but every tower you own becomes a stronger form.

**On advancement:** full-screen flash + shockwave, then every existing tower
instantly transforms into the next age's **base** form. Each transformed tower
then shows a pulsing `?` badge. Clicking a badged tower opens a 2-card panel to
lock in one of two **branches**. The game keeps running while badges are
pending — the player may pause to decide, and may deliberately delay a choice
to see what the next waves bring.

---

## Towers

Four types. Two branches at each advancement. Branches must **play
differently**, not be bigger numbers.

| Tower | Stone Age | Middle Age branches | Tech Age branches |
|---|---|---|---|
| **Thrower** — single target, cheap | Rock thrower | **Ballista** — shot pierces a line of enemies · **Catapult** — AoE on impact | **Railgun** — full-lane pierce · **Mortar** — big AoE, has a minimum range |
| **Trap** — damages enemies walking over a path cell | Spike pit | **Oil fire** — burn DoT that stacks · **Snare** — damage plus a brief root | **Tesla coil** — chains between enemies · **Gravity mine** — pulls, then bursts |
| **Slower** — no damage, slows in an area | Cold mud | **Frost** — hard slow, small radius · **Tar** — weak slow but applies damage-taken vulnerability | **Cryo** — chance to freeze solid briefly · **EMP** — strips shields and suppresses healers |
| **Heavy** — high damage, very slow fire rate, strong vs armor | Boulder | **Siege cannon** — massive single hit, ignores armor · **Shock hammer** — cone damage with knockback along the path | **Rail lance** — piercing, armor-ignoring, very long range · **Singularity** — pulls enemies together then heavy AoE |

Within an age each tower has 3 upgrade levels bought with gold. Each tower also
has a targeting mode (first / strongest / healer-priority).

---

## Enemies

Six types. Each must demand a **different answer** — no type should be solvable
by "more of the same tower".

| Type | Behaviour | The answer |
|---|---|---|
| **Runner** | Fast, low HP | Slowers and traps; raw DPS can't track them |
| **Brute** | Slow, very high HP | Heavy towers |
| **Armored** | Flat armor subtracted from every hit | Piercing or armor-ignoring heavy; many small hits are useless |
| **Swarm** | Spawns in groups, individually weak | AoE / splash |
| **Shielded** | Absorbs the first N hits regardless of damage | Fast fire rate to strip the shield; big single hits are wasted |
| **Healer** | Heals nearby enemies on a tick | Must be focused down — targeting priority matters |

### Bosses

Every 10th wave. Each boss has a **distinct mechanic**, not just a large HP
bar:

- **Wave 10** — summons swarm groups when it crosses damage thresholds
- **Wave 20** — immune to slows, and grants an armor aura to nearby enemies
- **Wave 30** — periodically re-shields and heals itself

Killing a boss triggers a brief slow-motion moment.

---

## Difficulty & wave composition

Scaling is **not** HP multiplication. Two independent systems:

1. **Stat curves** — HP, speed and armor multipliers per wave.
2. **Threat budget** — each wave has a budget that grows on a curve. Each enemy
   type has an `introWave` and a weight curve; composition is a seeded weighted
   draw that spends the budget.

The result is that the **mix genuinely shifts** over time: new types unlock,
and ratios drift toward nastier combinations (e.g. healers behind brutes,
shielded escorting swarms). A build that answered wave 8 should not answer
wave 20.

Waves 1–6 are hand-authored so the opening is gentle and teaches. The
generated curve must **hand over continuously** from the last scripted wave:
an unmatched handoff put wave 7 at 2.4× the threat of wave 6, and every run
died there no matter how the rest of the curve was tuned.

The budget also carries an exponential term. A purely polynomial curve is
eventually out-scaled by a full board — the grid has a finite number of cells,
so without exponential growth the run reaches a state where nothing can end
it.

---

## Economy

- Kills grant gold (per-type bounty × a wave curve).
- Gold is spent on: placing a tower, upgrading a tower within its age, and
  advancing the age.
- Lives are lost when an enemy reaches the exit. 0 lives ends the run.

One currency for all three sinks — the tension between them is the game.

---

## Feel — "bold, not childish"

This is the polish priority, not sprite detail. All of it is code-driven.

- Screenshake on impact
- Hit-flash on damage
- Squash/stretch on spawn and hit
- Particle burst on death
- Floating damage numbers
- Brief slow-motion on boss kill
- Full-screen flash + shockwave on age advancement

The simulation is not allowed to know any of this exists. It pushes plain data
events (`hit`, `kill`, `ageAdvanced`, `bossKilled`, `lifeLost`) onto a queue and
the fx layer turns them into visuals.

---

## HUD and run flow

- Top strip: wave, gold, lives, current age, seed, high score
- Bottom bar: tower build buttons (thumb-reachable in landscape)
- Pause, speed toggle (1× / 2×), restart
- Local high score in `localStorage` — no accounts, no backend
- **End-of-run summary**: wave reached, age reached, tower loadout, and what
  killed you (the enemy type that took the last life)

---

## Build order

Each slice is independently runnable and gets its own commit.

1. Scaffold, letterboxed canvas, seeded map generation, path, one enemy walking
2. Tower placement, targeting, projectiles, economy
3. Waves, scaling curves, lives, game over
4. All six enemy types and bosses
5. Age advancement and branching
6. Juice, run summary, high score, balance tuning
