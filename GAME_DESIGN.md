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
number. Prices are many times a tower (**10,000**, then **100,000**) so paying
is a real commitment — you are giving up a board's worth of defence for it. See
"Prices, and why they went up tenfold" below for what that cost is measured
against.

Measured, a played-as-designed run reaches the Middle Age around wave 16 and
the Tech Age around wave 32. Those two waves are the constraint any future
re-price has to satisfy: **a price that cannot be banked is a removed age, not
an expensive one**, and this project has made that mistake twice.

**Advancing UNLOCKS the next age's towers to build. It does not transform,
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

Seventeen towers across three ages, one of which — the Exchanger — is
available in all of them. Each age has its own **visual vocabulary**,
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
support. Without the support mode, towers shoot the front of the pack while the
Warchief at the back makes everything else on the board harder to stop. Mines
have no target and are not offered the choice.

**Slowers ignore the mode in one respect: they never shoot the same unit
twice in a row, and they prefer a unit that is not already chilled.** Left on
`first` a slower re-froze whichever enemy was furthest along, every single
shot — one enemy crawled and the twenty behind it walked past untouched, and a
second slower added nothing because the first had already claimed the target.
Sweeping instead of pinning is also what lets a chill actually expire, which is
the only reason "the enemies keep flowing" survives contact with four slowers.

Any tower can be **sold** for 60% of everything sunk into it.

### The tower cap

**You may only field a limited number of towers, raised by advancing:
16 in the Stone Age, 22 in the Middle Age, 28 in the Tech Age.**

Veterancy rewards concentrating a board; the cap is what makes concentrating it
necessary. Measured, the difference is not marginal: with no limit at all a
scripted player built 157 towers and survived past wave 60 on 10 of 11 seeds.
Veterancy alone could not close that, because a carrot only makes sprawl
*worse* — never impossible — so given enough cells, quantity still won.

A cap is the one brake that leaves prices alone. The earlier attempt scaled the
price of each new tower, which worked and looked terrible: every number in the
build bar drifted to an arbitrary figure like 154g. Here the sticker price is a
clean round number you can learn, and the limit is one line in the HUD.

It also gives advancing a second concrete reward — not just better tools, but
room for more of them — and because a capped board must concentrate, it is
exactly the board veterancy pays out on. The two mechanics push the same way.

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

**And a slower sweeps rather than pins.** It never fires at the same unit
twice running, and it prefers a target that is not already chilled. Without
that rule the floor above was doing nothing useful: a slower on `first` simply
re-chilled whichever enemy was furthest along, forever, so one unit crawled,
everything behind it walked past untouched, and a second slower was worth
nothing because the first had already taken the only target it wanted. The
repeat ban is absolute — it outranks even an explicit `support` targeting
choice — because "hit something else" is the entire mechanic.

### Diamonds and abilities

A tower defence's weakness is that once the board is built there is nothing to
do but watch it work or watch it fail. **Abilities are the only decision in
this game that is taken while a wave is already going wrong.**

They are paid for in **diamonds**, and diamonds are never earned — they are
MINTED, by an **Exchanger** burning gold every wave at a rate that **rises with
the age**: 450g in the Stone Age, 3,000g in the Middle Age, 12,000g in the
Tech Age.

A flat price was wrong at both ends. A Stone Age board earns a few hundred gold
a wave, so a flat 6,000 meant the ability system simply did not exist for the
first fifteen waves of a run; a Tech Age economy prints tens of thousands a
wave, so the same 6,000 was pocket change. **Ability costs rise with the age
too** — Stone Rain 2◆, Arrow Rain 4◆, Orbital Lance 7◆ — so a later cast costs
more of both currencies. The two curves together keep a cast at roughly the
same SHARE of your income in every age (about ten waves of one economy
building), while the absolute gold escalates from 900 to 84,000. That is
the whole design. A diamond is a tower you did not build, so "how much of my
economy do I convert into saved answers?" is a real question with no correct
answer. Income that simply accumulated would make abilities a reward for
surviving instead of a cost.

The Exchanger is the only building available in **every** age, because the
system it feeds runs the length of a run. Its sticker price is set for the
Stone Age; what it actually costs you is the gold it burns every wave.

**It has an on/off switch, and that switch is the strategy.** Nobody wants a
building draining six thousand gold a wave while they are saving for an age —
so you turn it off, and turn it back on when you are rich. A switched-off
Exchanger is drawn cold with a red cross over it and its panel reads *"idle —
saving you 6,000g each wave"*, because the two ways to lose value here are
forgetting it is on and forgetting it is off, and both have to be visible from
the board.

That switch is also the answer to **"a million gold and nothing to buy"**. Past
the point where the board is capped and maxed, the Exchanger is the only
remaining sink, and an unbounded one: surplus gold becomes ability power at a
rate that can absorb any amount of it.

Two abilities per age — one that kills, one that changes the terms:

| Age | Damage | Utility |
|---|---|---|
| Stone | **Stone Rain** — boulders pound an area | **Tar Pit** — a stretch of road stays sticky |
| Middle | **Arrow Rain** — a dense, fast-ticking volley | **War Horn** — every tower reloads 65% faster |
| Tech | **Orbital Lance** — one enormous instant hit | **Null Field** — enemies inside take 3.2× damage |

Rules that keep them honest:

- **Every damaging ability pierces armor.** An ability costs a building's worth
  of gold to charge, so one that could be no-sold by the plating rule would be
  a trap — "the thing I saved for cannot touch the thing killing me" is the
  worst sentence a game can make a player say.
- **Nothing stacks with itself.** Two Null Fields do not multiply, two Horns
  refresh rather than compound. Overlapping the same ability is wasted
  diamonds, not an exploit.
- **Casting is two-step**, like placing a tower: pick the card, then pick the
  ground. A one-click cast fires the expensive thing at whatever was under the
  cursor while you were reading the tooltip.
- **The tray is on the right edge**, not in the build bar. The build bar is a
  between-waves menu; the tray is used mid-wave with a hand already on the
  board, so it sits beside the play area and never covers the road.

### Traps: why nobody built them

The trap line was the least-built family in the game, and the reasons were
mechanical rather than a matter of taste. A trap covered the inscribed circle
of ONE cell, so a Runner at 108 units/second was inside it for about half a
second against a 1.6-second reload — it missed most of what walked over it. And
it spent one of your capped tower slots to do that, which made it always the
worst possible use of a slot.

Three fixes:

- **Reach is most of a cell**, not its inscribed circle, so a trap catches a
  clump rather than whoever happened to be on the exact centre when it rearmed.
- **Traps do not count against the tower cap.** They can only go on the path,
  and a map has thirty-odd path cells, so they are already bounded by something.
  "How much of the road do I mine?" is now its own decision rather than a tax on
  your real board.
- **A trap BANKS while unused** and dumps the whole store into its next
  trigger, up to 3.2×. A quiet stretch of road is a saved-up hit instead of
  wasted gold, and the trigger is an event rather than a metronome — the charge
  ring fills visibly around the trap, and a full one sounds different from a
  routine one.

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
- **Placement resolves on RELEASE, and the ghost follows the drag.** Press
  anywhere on the board with a tool armed, drag, and the range ring, placement
  legality and named combo links update live under your finger; lift to build
  where it ended up. Before this a touchscreen player could not preview a combo
  at all — they tapped a cell and found out what it linked to after the gold
  was spent. Not a separate touch path: a mouse does the identical thing, and
  an ordinary click is a drag of zero length, so desktop plays exactly as
  before while gaining the same drag-to-aim. A cancelled gesture builds
  nothing, which is what cancelled means.
- **The only irreversible action asks.** Restart sits in the same cluster as
  pause and speed, which are pressed constantly and without looking, so it was
  one mis-tap from ending a forty-wave run. It now names what is about to be
  lost — the wave and the tower count — and a tap anywhere outside cancels,
  because the safe answer should be the easy one.
- **Every weapon fires something recognisably its own** — a rock, a boulder, a
  clod of cold mud, an arrow, a cannonball trailing smoke, a frost shard, a
  laser, a cryo orb, a black hole, a rail lance. They were all one grey pebble
  tinted by splash radius, which quietly undid the tower art: a Singularity and
  a Thrower became indistinguishable the instant a shot left the barrel. A
  projectile crosses most of the board, so it is on screen far longer than the
  muzzle flash and is doing more identity work than the tower it came from.
- **A buff is drawn on the units receiving it, not just on its source.** Every
  enemy inside a Warchief's banner wears speed lines. "Why is that pack
  outrunning my slowers" is the question, so the answer has to be attached to
  the units doing the outrunning — the aura ring on the carrier alone is the
  second half of the sentence, not the first.

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
| **Armored** | **PLATED** — blunt towers cannot hurt it and refuse to aim at it | Armor piercing, armor-ignoring, or burn |
| **Swarm** | Spawns in groups, individually weak | AoE / splash |
| **Shielded** | Absorbs the first N hits regardless of damage | Fast fire rate to strip the shield; big single hits are wasted |
| **Warchief** | Speeds up every enemy around it | Kill the carrier — the pack drops back instantly |
| **Zealot** | Charges once below half HP | Kill it or leave it — chip damage makes it worse |
| **Splitter** | Bursts into two Swarm on death | Splash that catches the pieces; overkill is wasted |
| **Juggernaut** | Heals itself unless kept under fire | Concentrated damage, not spread |

### Plating: the one hard requirement

Armored is not a tax, it is a **wall**. A tower with no armor piercing and no
burn cannot damage it *at all* — not reduced damage, not minimum damage,
nothing — and, crucially, **will not target it**. The Thrower simply stands
still while the column walks past.

Zero damage was the obvious version and the wrong one: numbers ticking up as
`1` look like the tower is working badly, not like the tower cannot work. A
weapon that visibly declines to aim says "I cannot hurt that" in a way no
damage number does.

Three exemptions, each load-bearing:

- **Burn passes through plating.** Fire seeps in rather than striking. This is
  the Oil Cauldron's entire reason to exist and the Middle Age's cheap answer.
- **Slowers may still chill plated units.** They deal no damage, so they were
  never trying to hurt anything — and without this the wave built to teach the
  rule would also be immune to every slower on the board.
- **Nothing else.** Splash, pierce and chain lightning all funnel through
  `damageEnemy`, which enforces the rule at the source. The targeting layer
  keeps a blunt tower from *aiming*; this keeps stray AoE from chipping.

**Wave 7 is nothing but Armored, and it is preceded by a 24-second briefing**
rather than the usual 5.5-second breather. The briefing states the rule, names
the answers by reading the balance table, and — the part that actually saves
runs — checks your board and tells you in red if nothing on it can hurt them.
The long pause exists so the warning can be *acted on*: a lesson you cannot
afford to answer is just a loss with a caption. Wave 7 costs lives, not the
run; a board with no answer typically dies somewhere around wave 10–17.

Measured, this is the single largest strategic decision in the early game. A
scripted player that keeps ~40% of its damage towers able to pierce reaches a
median wave 56; one that buys purely on damage-per-gold — which picks the
Thrower — collapses to a median wave **14**. Before plating, those two probes
were two waves apart.

### Reactive, not just statted

The last three **react to what the player does**, which is the difference
between an enemy and scenery. A Zealot punishes spreading fire across a pack, a
Splitter punishes single-target overkill, and a Juggernaut punishes a board of
many weak towers that cannot finish anything. They also arrive with the later
ages, so a wave 30 is not a wave 5 with bigger numbers.

### Why the Healer became the Warchief

The Healer was the reason targeting modes existed, and it failed at the job:
its effect was a number ticking upward. Players never noticed it, never
focused it, and so the mode it justified went unused — a mechanic nobody can
see is a mechanic nobody plays around.

The Warchief carries the same idea in a form you can watch. Everything near it
moves faster, every buffed unit wears speed lines, and the pack visibly drops
back to its own pace the instant the carrier dies. It is also *threatening*
rather than merely wasteful: faster enemies mean less time to kill them, so
ignoring it costs you the wave rather than costing you some damage.

Two rules make it readable. It never buffs itself, so it is always the thing
you can catch. And two Warchiefs do not multiply — the strongest aura wins —
so a pack with a pair of them is twice as many bodies to kill, not a pack
moving at 2.25×.

### Bosses

Every 10th wave. Each boss has a **distinct mechanic**, not just a large HP
bar:

- **Wave 10** — summons swarm groups when it crosses damage thresholds
- **Wave 20** — immune to slows, and grants an armor aura to nearby enemies
- **Wave 30** — repairs and re-shields itself, but ONLY while left alone

**The Ancient's repair is suppressed by keeping it under fire.** It used to
repair on a pure timer, and combined with the shield rule — a shield eats one
WHOLE hit whatever its size — that was close to unbeatable for reasons that had
nothing to do with its health bar. It restored about one shield per second,
and measured against what a player actually fields at wave 30:

| Tower | Shots/sec | Effect on the Ancient |
|---|---|---|
| Singularity | 0.45 | every shot eaten — **exactly zero damage** |
| Cannon | 0.54 | zero |
| Sniper | 0.90 | ~zero |
| Tesla Coil | 1.65 | below its 2055 HP/s regen, so unkillable |
| Gun Turret | 2.55 | the only tower in the game that worked |

Every heavy hitter a player builds *for* a boss did nothing to this one, and
nothing on screen explained why. Gating the repair on being left alone turns a
flat DPS tax into a mechanic with an answer, and a green ring shows exactly
when it is healing.

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
and ratios drift toward nastier combinations (e.g. a Warchief behind brutes,
shielded escorting swarms). A build that answered wave 8 should not answer
wave 20.

Waves 1–7 are hand-authored so the opening is gentle and teaches. The
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

### Why the late game has to end

The complaint that drove the big re-price was simple: *"after wave 30–40, if
you have some maxed out towers with maxed out XP, you can go to wave 100
easily."* That was true, and it had one cause. By the mid-thirties the board is
at its cap, every tower is level 3, most are Elite — the player's defence is a
**fixed quantity** from then on, while the curve was still tuned against a
board that grows.

Four changes, in the order they mattered:

1. **The output ceiling came down.** A maxed, Elite, comboed tower used to
   reach 4.9× its printed damage; it now reaches 3.6×. A board that is merely
   *finished* is no longer also unbeatable.
2. **Income freezes** at `bountyFreezeWave`. Past the point where the board is
   done, gold buys nothing — it was only ever guaranteeing replacements.
3. **Bosses escalate on leak, not just on HP.** A boss took 8 lives whether it
   was the first or the fifth, so a board that could not kill one could simply
   tank it. The toll now grows 4 per appearance; the wave-50 boss takes 24 of
   your 30 lives, and from the fifth onward "let it through" stops being a
   strategy. The life pool went 20 → 30 to keep that frightening rather than
   binary.
4. **Per-unit HP, not a bigger budget.** This is the one that actually worked,
   and it took three failed attempts to find. Every push on `lateSurgeGrowth`
   drove peak concurrent enemies past 150 and wave length past two minutes
   *without moving the median death wave at all* — the budget was buying bodies,
   which is tedium, not difficulty. Raising `hpQuadratic` moved it immediately,
   at a quarter of the entity count.

Measured, across fifteen seeds: a played-as-designed run used to reach the
probe's wave-60 ceiling on most seeds and ran past 80 when the ceiling was
lifted. It now ends at a **median wave 50, with almost every seed landing
between 45 and 52** — a consistent ending rather than a staircase of boss
walls, and nothing anywhere near 100.

### Four upgrade tiers, and why the last one is a bad deal

A tower's own material, then **silver**, then **gold**, then **emerald**.
Emerald is deliberately a gem rather than a fourth metal: silver and gold read
as "better, then best", and a third metal would have to be brighter than gold,
which on a lit board means whiter, which reads as cheaper. A green stone steps
outside the sequence instead of trying to top it, and it is the only green on
any tower.

Maxing a tower now costs **8.6× its sticker price**, up from 3.5×. Each tier
buys less per gold than the one before, and emerald is the worst gold in the
game by a wide margin — 4.6× the price for +0.75 damage. That is the point:
**it is a gold sink, not a power spike.** It exists because a board reaching
its ceiling was the moment a run stopped having decisions in it, and it is
priced so that maxing a whole board is a project almost nobody completes.

### Why raising the HP curve alone never worked

Worth writing down, because three separate attempts failed the same way.

With threat cost tracking HP, **a wave's total hit points are set by its budget
and almost nothing else.** Unit count is `budget / hp` and per-unit toughness is
`hp`, so the two cancel. Raising `hpQuadratic` therefore moved the median death
wave by nothing at all — it delivered the same wall of HP as fewer, tougher
units. Better pacing, identical difficulty.

Raising the budget alone fails the other way: an exponential budget against a
quadratic HP curve is an exponential number of BODIES, which measured out at
190 concurrent enemies and two-minute waves.

The answer is to grow **both on the same exponential** past the wave where the
board stops improving (`lateHpGrowth` mirroring `lateSurgeGrowth`). Counts stay
flat, total wave HP climbs exponentially, and a finished board gets out-scaled.
Measured: median death wave went from 80 to 41 with peak concurrent enemies
*falling* from 84 to 31.

### Prices, and why they went up tenfold

Middle Age towers start at 1000g and the age costs 10,000; Tech Age towers
start at 10,000g and the age costs 100,000. Maxing a Gun Turret is a ~36,000g
commitment against roughly 2,300g before.

**Kills pay half what they used to, and buildings pay several times more.**
Income is meant to follow from what you chose to invest in, not from what
happened to walk past your towers — so a Gold Mine out-earns a whole wave of
kills, and what brakes stacking them is that every one eats a capped tower
slot and only pays out on a wave you actually survive.

**Payback is about 4.5 waves, and an upgrade is the same bet.** At two waves a
building was in profit on the wave after you bought it, which is not a
decision, it is a button you press. Both the cost and the output rose to
lengthen it: the point is to DELAY the return, not shrink it, so a mine stays
a serious lever once it has paid for itself. Upgrading follows automatically —
an upgrade costs 0.8× base for 0.85× the output, landing on the same clock.

Income rose too — because it had to. **A 100,000 gold age
that cannot be banked before the boss that gates it is not an expensive age, it
is a removed one**, and this exact failure has now happened twice in this
project's history. Net, gold is far tighter than it was: prices moved 10–16×
against income's 3×, so at any given wave you own fewer towers, at lower level,
than you used to. What the player feels is scarcity; what the numbers do is
keep every age reachable.

Two rules survived the re-price and constrain any future one:

- **Each tier must stay more damage-per-gold than the last**, or advancing is a
  strictly worse purchase and the age system is a trap.
- **The first upgrade must beat buying a second tower**, per gold, or the
  anti-dumping rule inverts. The curve is deliberately front-loaded for this;
  level 3 is the premium tier, and what it really buys is output that does not
  consume a capped slot.

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
