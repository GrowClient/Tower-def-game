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
cyan), and a full biome each — advancing re-skins the ground, the road and the
props, not just a colour.

Advancement is **player-triggered by spending gold**, never automatic on a wave
number. Prices are many times a tower (**3000**, then **10000**) so paying is a
real commitment — you are giving up several towers' worth of defence for it.

**Advancing UNLOCKS the next age's four towers to build. It does not transform,
remove or refund the towers you already own.** They keep standing and keep
firing exactly as before. That is what makes advancing a decision rather than a
reward:

- The gold is gone, and the new towers cost more than the old ones.
- Your board is still the old board until you sell it off piece by piece.
- Selling refunds only **60%** of everything sunk in (85% with the Salvage
  perk), so rebuilding is a real loss, not a free respec.

> Advance early = weaker now, stronger later.

### Why the later towers must be more gold-efficient

Each tier deals roughly **2.2× the previous tier's damage per gold**. The gap
has to widen along with the price, or a costlier advance is simply a worse deal. This is
not flavour, it is load-bearing. When every age had the same damage per gold,
advancing bought nothing but bigger price tags, and a scripted player that
never advanced beat one that did by eight whole waves.

### Why armor scaling is what forces the decision

Flat armor per wave climbs from wave 8. Small hits are exactly what
flat armor blunts to the damage floor, so a board of Stone Age Throwers stops
working somewhere in the mid-teens **no matter how many you own**. Without that
ceiling, stacking cheap towers was strictly better than advancing, and the age
system was decorative.

It is a balance in both directions. Cranked too high, runs ended around wave 12
— *before* anyone could save the gold an age costs — which made the age
system unreachable instead of merely unattractive. The pressure has to bite
without ending the run before the decision can be made.

---

## Perks

After clearing every **5th** wave the run pauses and offers **3 of 10** perks;
the player takes one. They are run-wide and stack, so a run compounds in a
direction rather than every run converging on the same board.

**Every draft offers one power perk against one economy perk**, plus a
wildcard. That is the whole design: more killing power, or more money? A round
of three damage perks is not a decision.

Perk sizes are deliberately single digits (5-10% a stack). They used to be
12-40%, four stacks deep — maxed Scavenger alone reached +80% gold, which on
top of a runaway kill count is most of how a run ended up sitting on 200k with
nothing left to buy. A perk should tilt a run, not decide it; the compounding
across ten drafts is the reward.

"Punch Through" (+1 pierced enemy) was deleted: it did nothing at all for the
towers that do not already pierce, so on most boards it was a blank card
wasting one of your three options.

The draft holds wave progression while it is open — a player must never be
punished for reading their options.

---

## Towers

Sixteen towers across three ages. Each age has its own **visual vocabulary**,
not a recoloured version of the last — stone is timber and rock, the middle age
is masonry and gunpowder, the tech age is plated steel and glowing optics. "The
towers look the same" is exactly the complaint that makes an age advance feel
like it did nothing.

| Role | Stone Age | Middle Age | Tech Age |
|---|---|---|---|
| Single target | Thrower (90g) — sling on a timber frame | **Archer Tower** (250g) — crenellated turret, the bolt runs *through* a line | **Gun Turret** (675g) — plated barrel, pierces up to 8 |
| On the path | Spike Pit (75g) | **Oil Cauldron** (220g) — stacking burn that bypasses armor | **Tesla Coil** (600g) — chains to 4 nearby enemies |
| Slower | Cold Mud (120g) | **Frost Tower** (310g) — faster, bursts on impact | **Cryo Field** (775g) — fastest, widest burst |
| Heavy | Boulder (195g) | **Cannon** (510g) — wheeled gunpowder cannon, ignores armor | **Singularity** (1250g) — enormous damage and splash |
| Economy | **Campfire** (120g) | **Gold Mine** (400g) | **Factory** (1100g) |
| Special | — | — | **Sniper** (1625g) |

### Economy buildings

Pure economy. No range, no target, no shots — placed on any buildable cell, it
pays out **when a wave is cleared**.

Every age has one, and they differ only in scale and skin: a ring of stones
around a fire, a timbered pit head, a plant with a lit stack. Restricting income
to the Middle Age made advancing to it a foregone conclusion and left the Stone
Age with no economic decision at all.

Each is priced to pay for itself in roughly **six waves**, which *is* the
decision: a mine is six waves of defence you did not build, betting you'll still
be alive to collect. They also compete with towers for cells, which is what
stops "just build mines" from being free.

Paying **per cleared wave** rather than per second is load-bearing. Per-second
income quietly rewarded dawdling — a wave you let run long printed more gold
than one you killed fast — and it kept paying during the between-wave lull, so
the safest possible play was also the richest. Tying income to a wave you
actually finished makes a mine a bet rather than a metronome.

### Sniper

Covers the **entire board**. No range ring, nothing out of reach. Expensive and
slow-firing to pay for that — its damage per gold is deliberately the worst in
the Tech Age, because reach on a winding map is worth more than raw output. One
Sniper answers the corner your board never covered.

Within an age each tower has 3 upgrade levels. On an economy building those
upgrades raise output instead of damage.

**A level must be readable from the board, not counted.** Each upgrade re-forges
the tower's working end — the sling that throws the rock, the muzzle the shell
leaves, the tip of the ice spire: native wood and stone at level 1, silver at 2, gold at 3,
with a halo on the top tier only. Three dots under a tower's feet is a readout,
not a picture; you had to stop and count them and at board scale they were
invisible anyway.

### Combos

**Two towers whose fields overlap form a named combo and both get stronger.**

This exists because a board of twelve identical towers was a winning board.
A tower's value never depended on what stood next to it, so the optimal play was
to find the best damage-per-gold tower and spam it. Combos make the same gold
buy more or less depending on where it goes.

Combos are keyed off **tags** (`ice`, `fire`, `heavy`, `rapid`, `chain`,
`pierce`, `trap`, `precision`, `economy`) rather than off specific towers, so a
combo learned in the Stone Age still means something in the Tech Age — Cold Mud
and Cryo Field are both `ice`.

| Combo | Tags | Effect |
|---|---|---|
| **Thermal Shock** | ice + fire | +22% damage, +30% burn |
| **Shatter** | ice + heavy | +20% damage |
| **Spotter** | precision + rapid | +12% fire rate |
| **Foundry** | economy + heavy | +10% fire rate, +20% gold |

Both towers in a pairing receive the same effect and each uses only the parts
that mean anything to it — which is how the Foundry pays the mine and hurries
the cannon without needing per-side rules.

Three properties keep this a mechanic rather than a hidden spreadsheet:

- **The trigger is small and visible.** Two towers link when they are within
  about two cells — immediate neighbours, diagonals included, and nothing else.
  The placement ghost no longer draws that radius as a second dashed ring: two
  concentric circles of different sizes around one ghost read as a confusing
  diagram rather than two facts, and the named link lines already say which
  towers you would pair with. It was originally "your range
  rings overlap", which sounded elegant and played terribly: two 250-range Tech
  towers linked from five cells apart, so on a developed board everything
  comboed with everything and there was no placement decision left to make.
- **A combo counts once**, however many partners supply it — ten Frost Towers
  around one Oil Cauldron is one Thermal Shock, not ten. Different combos DO
  multiply with each other; each of them just applies exactly once. Otherwise
  "stack more partners" becomes the new mindless answer. This is stated on the
  combos sheet and beside the list in the tower panel, because players
  reasonably assume more neighbours means more bonus and nothing on screen
  said otherwise.
- **It is taught, not discovered.** The board draws named links while a tower is
  selected, the placement ghost previews what a tower *would* gain before you
  pay for it, and a combos sheet lists all of them.

Each damage-dealing tower also has a **targeting mode** — first, strongest, or
healers. Without the healer mode, towers shoot the front of the pack while the
healer at the back undoes the damage. Slowers and mines have no target and are
not offered the choice.

Any tower can be **sold** for 60% of everything sunk into it.

### Veterancy — why fewer towers beat more towers

**Towers get better at their job the longer they do it.** They earn service XP
from what they actually do — kills for shooters, chills for slowers, payouts
for economy buildings — and rise through three ranks (Seasoned, Veteran, Elite)
worth up to +50% to that tower's own output. Rank shows as chevrons under the
tower, and is a deliberately different visual language from upgrade tiers:
**level is what you bought, rank is what the tower earned.**

This is the brake on tower-dumping, and it is a carrot rather than a wall.
Nothing is forbidden — you may still fill every cell. But a run contains a
roughly fixed amount of killing, so spreading it across forty towers leaves
every one of them a raw recruit, while concentrating it into a dozen
well-placed ones turns those into veterans.

Measured over three seeds, capping how many towers the probe could build:

| Board size | Average rank | Towers still at rank 0 | Wave reached |
|---|---|---|---|
| 10 towers | 0.77 | 3.3 | 21.7 |
| 20 towers | 0.35 | 14.3 | 19.0 |
| 40 towers | 0.14 | 24.3 | 15.0 |

A previous attempt taxed the *price* of each new tower instead. It worked and
looked terrible: every price in the build bar drifted to an arbitrary number
like 154g, so nothing on screen was memorable and the bar read as broken rather
than deliberate. Putting the pressure on the OUTPUT side means it can be shown
as a rank badge instead of a fractional price — and prices stay round numbers a
player can learn.

### Slowers are shooters, not auras

A slower **fires a damage-free shot** that chills whatever it hits for a few
seconds, and the target wears visible rime while it lasts. It aims, reloads and
leads its target exactly like a Thrower.

The old aura version pinned everything inside a radius permanently. It was
simultaneously the strongest effect in the game and the least interesting: it
could not miss, needed no placement thought, and two of them stopped a wave
dead.

**No slow anywhere gets stronger.** All three ages share one slow strength;
upgrades raise range and fire rate; the perk extends duration. A later slower is
not a colder slower, it is a faster one that keeps more of the lane chilled.
There is also a hard floor on how slow anything can be made, because a parked
enemy is not a handled enemy — the wave has to keep flowing. The Cryo Field's
freeze-solid roll was deleted outright for the same reason.

### Why crowding is taxed

Every tower you own makes the **next** one cost more (+2% each).

Without it the game is a dumping sim, and that is measured rather than assumed:
a scripted player that never advanced, never upgraded and simply filled 115 of
the board's ~145 buildable cells with cheap Stone Age towers reached wave 30 —
*further* than the same probe got playing the game as designed. Quantity had no
cost curve, so quantity was the answer to everything.

Upgrades are priced off a tower's base cost and are untaxed, so the fuller your
board gets, the better improving what you own looks against squeezing in one
more. That is the pressure that makes selling to fund an upgrade a real move.
The build bar always quotes the live price, never the list price.

### Feedback rules learned from play

- **No floating damage numbers.** The health bar is the readable channel; a
  crowd of twenty units generating damage text is a wall of digits covering the
  thing it describes.
- **Screenshake is for events that matter.** Shots landing and ordinary kills
  add none. Trauma accumulates faster than it decays, so shaking on every
  impact meant the screen never stopped moving. Losing a life, a boss dying and
  an age turning still shake.
- **Build mode is amber in every age**, never the biome accent — the Middle Age
  accent is crimson, which is already the colour for "illegal placement", so
  the whole board lit up red while holding a perfectly legal tower.
- **The tower panel hangs off its tower**, with a leader line, rather than
  living in a corner with nothing connecting the numbers to the thing.

### The pause menu

Pausing is the one moment a player is guaranteed to be reading rather than
reacting, so it is where the reference material lives: settings, the combo
table, what each enemy type demands, and every unlocked tower's real numbers.

---

## Enemies

Nine types, banded by age. Each must demand a **different answer** — no type
should be solvable by "more of the same tower".

| Type | Behaviour | The answer |
|---|---|---|
| **Runner** | Fast, low HP | Slowers and traps; raw DPS can't track them |
| **Brute** | Slow, very high HP | Heavy towers |
| **Armored** | Flat armor subtracted from every hit | Piercing or armor-ignoring heavy; many small hits are useless |
| **Swarm** | Spawns in groups, individually weak | AoE / splash |
| **Shielded** | Absorbs the first N hits regardless of damage | Fast fire rate to strip the shield; big single hits are wasted |
| **Healer** | Heals nearby enemies on a tick | Must be focused down — targeting priority matters |
| **Zealot** | Charges once below half HP | Kill it or leave it — chip damage makes it worse |
| **Splitter** | Bursts into two Swarm on death | Splash that catches the pieces; overkill is wasted |
| **Juggernaut** | Heals itself unless kept under fire | Concentrated damage, not spread |

### Reactive, not just statted

The last three **react to what the player does**, which is the difference
between an enemy and scenery. A Zealot punishes spreading fire across a pack, a
Splitter punishes single-target overkill, and a Juggernaut punishes a board of
many weak towers that cannot finish anything. They also arrive with the later
ages, so a wave 30 is not a wave 5 with bigger numbers.

### Bosses

Every 10th wave. Each boss has a **distinct mechanic**, not just a large HP
bar:

- **Wave 10** — summons swarm groups when it crosses damage thresholds
- **Wave 20** — immune to slows, and grants an armor aura to nearby enemies
- **Wave 30** — periodically re-shields and heals itself

Killing a boss triggers a brief slow-motion moment.

A boss's mechanic belongs to the boss, not to the wave that spawned it — the
same unit summoned by any other means behaves identically.

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

### A wave's budget buys danger, not bodies

Threat cost per unit **scales with the wave**, on the same curve as HP.

It used to be flat — a Brute cost 6 threat whether it had 280 HP or 6000 —
which quietly made the budget curve a unit-COUNT curve. An exponential budget
then meant an exponential number of bodies: wave 40 spawned around 600 units.
Waves got longer and more tedious rather than harder, every extra body was
another bounty (which is where the runaway economy came from), and no
individual enemy was ever a threat.

Now the same budget buys the same total HP as fewer, far tougher units —
measured, wave 40 went from ~600 spawns to about 20. Total HP per wave still
climbs steeply; the head count barely moves.

### The late-game surge

A **second** exponential starts at wave 15. The first one is constrained by
having to hand over cleanly from the scripted opening, and that same gentle rate
is far too slack once a player has an economy: runs coasted into the Tech Age
around wave 22 and then found the wave-30 boss easier than the wave-10 one,
because the board compounds — upgrades, perks, a better age, combos — faster
than the original curve did.

Measured over 13 seeds with a scripted player, the surge rate is a real
trade-off and not a free knob. Too steep (1.055 or 1.035) and every seed died on
exactly wave 26: the curve was drowning out how well the board was built, which
is the opposite of the goal. At **1.03** the median holds around 26 while good
runs still reach 38–41, so surviving the Tech transition is what earns the late
waves rather than the curve deciding for you.

Bosses get a curve of their own on top, keyed to **which appearance it is**
rather than to the wave: HP ×1.4 per boss, more armor, and escalating mechanics
(the Hive Mother summons more, the Ancient repairs more often, the Warlord's
aura hardens). A boss that is only harder to chew through is a longer fight, not
a harder one.

### Pacing is a separate problem from difficulty

Threat cost per unit doesn't scale with the wave — a Brute costs 6 threat
whether it has 280 HP or 4000 — so the budget curve is really a *unit count*
curve, and an exponential unit count on a fixed spawn interval is an
exponentially longer wave. Measured, wave 25 took **163 seconds** to trickle
out: not hard, just slow.

So a wave has a bounded **spawn window**: whatever the count, it finishes
arriving within about 70 seconds. Early waves are far below that bound and are
completely unaffected (waves 7/10/15/20 measured at 38/55/50/51 seconds either
way) while wave 25 came down to 62. Bounding the window rather than hand-tuning
the interval decay is self-correcting — however the budget is retuned later,
pacing holds.

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

1. ✅ Scaffold, letterboxed canvas, seeded map generation, path, one enemy walking
2. ✅ Tower placement, targeting, projectiles, economy
3. ✅ Waves, scaling curves, lives, game over, run summary, high score
4. ✅ All six enemy types and bosses
5. ✅ All three ages, selling, the perk draft, synthesised sound
6. ✅ **Juice pass and balance tuning** — everything under *Feel*, above, plus
   combos, per-age economy buildings, readable upgrade tiers, per-weapon sound,
   and a measured late-game curve

`fx/effects.ts` holds the particle and camera state and `render/drawEffects.ts`
draws it. It is the queue's **second** consumer alongside `audio/sfx.ts`, and
the sim knows about neither: slow motion works by feeding fewer whole steps into
the fixed-timestep accumulator, never by touching `SIM.dt`.
