# Pirate raider: concept pitches

The ship: the Red Comet raider (`dk.dock.kind === 'pirate'`, event `pirates`, no captive). It shows up in
First Contract, Red Comet Cove, Nightmare and others, so it has to stay fun the fifth time you meet it.

Images (all in this folder):
- `raider_keyart.png`: key art. Blender mock-up of the raider's hold with the new pieces, plus the game's
  own crew and pirate sprites composited on top. Numbered callouts.
- `raider_layout.png`: layout and who-does-what diagram, with the HUD order card and the endings.
- `raider_minigame.png`: the dial mini-game mock-up, plus a four-beat storyboard of one docking.
- Source: `tools/blender/models/concepts/raider.py` (render), `make_keyart.py`, `make_layout.py` and
  `make_minigame.py` (PIL, in this folder).

---

## LEAD: "The Quota"

**Hook:** The Red Comet's raiders work to a quota. Their scale has never been calibrated, and
sandbags cost less than fuel cells.

### The fantasy
These pirates aren't scary masterminds. They're shift workers with a shopping list and a boss.
Each raider docks with a **plunder order**: a few items it has to bring home, which add up to a
**quota** in kilograms. Stolen goods go down a **loot chute** onto a big brass platform scale in their
hold, the **QUOTA-O-MATIC**. When the needle has sat in the green band for 3 seconds, a bell rings,
someone on their side shouts "QUOTA MET!", and the ship casts off with whatever is on the scale.

You could fight them. Or you could sneak into their hold, take your things off the scale and put
their own sandbags, their decorative space anchor and your duck on it instead. Get the needle into
the green without tipping it into the red, and they leave happy with 117 kg of junk. That's **the Con**.

### Moment to moment (see `raider_layout.png`)
- **Docking (as today).** The raider has 40 s to dock unless you shoot it down. When it docks, the HUD
  flips over the **plunder order**: 2 to 4 cards, e.g. `2x FUEL CELL · REPAIR KIT · THE CAT (!!)`, with
  the quota (`120 kg ± 8`). The same order is chalked on a board in their hold.
- **Pirates (red).** They go after the items on the order first, then anything loose (today's AI with
  a target filter). They carry each item home and drop it into the **chute inlet** in their airlock.
  It thunks onto the scale a second later. They still shoot anyone they see.
- **A, the Swapper (raider hold).** Hauls ballast onto the scale and our stuff off it. Sandbags
  (~40 kg) and the anchor (~75 kg) are heavy carries, like the black box (slow, no weapon). Barrels
  (~15) and the duck (2) are light. Heavy items can be **dropped** (instant, but the needle swings
  ±15 kg on its spring) or **lowered gently** (hold click for 2 s, no swing).
- **B, the Dial Reader (raider hold).** Stands at the dial. Up close it opens a panel (like the helm
  oscilloscope) with the exact reading. From across the room you only see grey, green or red. B calls
  out "more... more... STOP!" and keeps an eye on the parrot and the door.
- **C, the Defender (our ship).** The order is on the HUD, so C knows what to protect. C guards those
  items, locks security doors (pirates never bash them) and can carry the cat into the reactor room.
  Anything saved never reaches the scale, so there's less to swap.
- **D, the Ship Runner (our ship).** The mission doesn't pause: the other threats, shields, power and
  cannons still need someone.
- **Meanwhile:** the clock runs and the jump stays blocked while they're docked (as today). The
  pirates keep coming back through the tube with more loot, so the hold is never quiet for long.

### New mechanics
1. **Plunder order deck.** A random draw each docking from real game things: fuel cell, repair kit,
   extinguisher, laser gun, hull plate, coolant, the coffee pot, the duck, and **THE CAT** (a rare card,
   and the "WANTED: ONE SHIP CAT" poster already exists). Quota = the order's total weight.
2. **The scale and the needle.** It reads the sum of the weights on it, plus a spring that overshoots
   and wobbles for about 1 s after a drop. The band is quota ± tolerance.
   - **Grey** (under): the pirates keep stealing.
   - **Green** for 3 s: the bell rings, and they cast off 10 s later.
   - **Red** for more than 1 s: the robo-parrot squawks "SUSPICIOUS!" and one pirate heads back to
     the hold to look at the scale (and at whoever is standing next to it).
3. **The dial mini-game** (`raider_minigame.png`): a close-up panel with the needle, a `~107 KG`
   readout and what's on the scale (ours vs. ballast). Item weights are only approximate (±3 kg), so
   you have to read the dial. Placing heavy ballast uses a hold bar ("lower it gently").
4. **The loot chute.** A pirate drops loot at the inlet in their airlock and it appears on the scale.
   This makes their trip shorter and means the scale fills up while you're busy elsewhere.
5. **Captain's whim** (optional, one modifier card per docking, for variety):
   - "Inspection Day": a ±4 kg band and a twitchy parrot.
   - "Bulk Order": double the quota and a wide band.
   - "Cat Fancier": the cat is always on the list.
   - "Lazy Shift": one pirate stays home and guards the scale.

### Variety on repeat
Every docking has a different order, quota, band and whim, and the ballast is laid out differently.
You have to do the sum fresh each time, so "120 ± 8 with anchor + sandbag + duck" isn't always the
answer. Sometimes the best play is to let them take one low-value card and con the rest.

### Scaling
| | very easy / easy | normal | hard / Nightmare |
|---|---|---|---|
| order cards | 2 | 3 | 4 (+ whim) |
| tolerance band | ±15 kg | ±8 | ±4 |
| needle wobble after a drop | small | ±15 | ±25, settles slower |
| parrot tolerance in red | 3 s | 1 s | instant |

- **Crew size.** +1 pirate per extra crew member (up to 4, like the base guards). Big crews also get
  "Lazy Shift" more often: a guard posted at the scale, so the swap means a fight.
- **Solo.** Standing on the scale platform shows the dial on the HUD, so one player can be A and B.

### How it ends
- **Shot down before docking:** as today (counts as a pirate defeated).
- **The Con:** the band is reached with ballast only. They cast off and we keep everything. Report
  line "Conned the Red Comet" plus a small pay bonus. The parrot: "PLEASURE DOING BUSINESS!"
- **Partial con:** they leave with whatever of ours is still on the scale. Those items are gone for
  this mission.
- **Quota met fair and square:** they leave with the loot, and the crew gets mocked in the report.
- **Panic (kept from today):** jam their reactor with the repair kit (3 s). They cast off in 15 s and
  take whatever is on the scale, plus anyone still aboard (cast adrift as today). It's the brute-force
  option and fights well with the Con.
- **Jump due:** as today, pirates aboard ours run home and the ship lets go.
- **Their crate:** their 2 fuel cells move into a "petty cash" box beside the scale. You can still
  loot it, but every cell taken out of the box makes the needle drop 30 kg.

### Jokes, plaques, decor
- Dial: "QUOTA-O-MATIC", with a sticker: "CALIBRATED: NEVER". There's duct tape on the brass rim.
- Floor stencil: "QUOTA OR KEELHAUL". On the scale: "MAX 500 KG · NO THUMBS".
- The parrot's perch: "EMPLOYEE OF THE MONTH". It has an eye patch, an antenna and a red LED eye.
- The anchor: "SPACE ANCHOR (DECORATIVE)". Sandbags stencilled "40 KG".
- The chute label: "LOOT ↓". Order board: "TODAY'S PLUNDER".
- Kept from today: "WANTED: ONE SHIP CAT", "DAYS WITHOUT A MUTINY: 3", "NO REFUNDS".
- Ship voice when the cat card comes up: "Advisory: the cat is not on the menu."
- If the cat ends up on the scale it sits in a carrier marked MEOW, and its eyes glow.

### Build cost (honest)
**Reuses:**
- `dockGeom` (no geometry change: the scale sits where the crate is now)
- the pirate steal AI (add a target filter)
- `grab` / drop, the heavy carry (black box rules), `holdTarget`
- banners, sfx, `DOCK_DECOR` signs and stencils
- the overload / cast-off / cast-adrift code, `dockJumpHold`
- the oscilloscope-style mini-game panel pattern
- the `dk` snapshot for multiplayer (the new state lives in `dk.dock`)

**New:**
- the order deck and HUD card
- a weight table per item kind
- `dk.dock.scale` (a list of `{kind, kg}`, replacing `crate`) and needle physics (a damped spring)
- the band timer and outcomes
- the parrot "inspect" pirate state
- 3 ballast item kinds (`sandbag`, `anchor`, `barrel`; new ids only)
- a carryable cat (the cat is a prop today: this is the biggest new piece, and it can ship later as
  just a card)
- the chute (a delayed move from the inlet to the scale)
- the dial panel UI
- sprites: the scale with its dial (needle and bands drawn at runtime), chute and hopper, parrot (2
  frames), ballast items, order board (text at runtime)
- tests: the needle, band timing and the outcomes in `tests/dock.js`

**Rough size:** about 2 days of code plus about 1 day of sprites.

**Save compatibility:** no profile change is needed. The Con bonus is just pay. If a "times conned"
stat is wanted later, it's a new field defaulting to 0 (bump `PROFILE_VERSION` plus a migration
step). No existing ids change. The mission objective `pirates` (defeat N) still works. A new objective
id `con` could be added for a chapter built around it.

**Risks:**
- Players who only see the dial from far away may not get it. The colour band on the in-world dial
  and the HUD card should be enough, but this needs a playtest.
- The swing on drops has to feel fair, not random.

---

## ALT 1: "Under New Management" (hijack the raider)
Their core room gets a pilot seat and a turret yoke. Board them, clear the core, and one of us can sit
down and **fly the raider while it's still clamped on**. Their turret becomes a fourth cannon for our
side (it aims like ours, with its own crank reload), and their engines can nudge both ships, so the
helm's dodging gets a co-pilot. The pirates want their ship back: every 20 s a pirate tries to retake
the seat, and anyone who's left in their airlock throws the "manual release" lever to cut us loose
(hold to stop them). The pressure is the crew split: the best gun in the fight is on the other ship,
and whoever sits in it is away from our own stations. Variety comes from what the raider is carrying
(a heavy blaster, a stealth module, a spare shield cell) and from which pirate role is aboard. It
reuses the cannon and shield mini-games, the boarding AI and the docking code. New: a seat on a
foreign ship, a second turret owned by us, and a retake AI. It's bigger than the Quota and leans
towards action more than comedy.

## ALT 2: "Operation Whiskers" (the catnapping)
This raider wants exactly one thing: **the cat** (the WANTED poster finally pays off). Two pirates
board with a **laser pointer** and a **cat carrier**. The cat chases the red dot, so the pirates herd
it towards the tube while we try to keep it aboard: shut doors in its path, rattle the treat tin
(hold click, it comes running), grab it (it squirms out after 4 s), or blind the pointer pirate. Their
hold is a "petting zoo" of earlier catnappings: a cage with a hamster, a goldfish in a helmet and an
angry space goose. Unlocking the cage (a lockpick mini-game) gives a bonus and causes chaos, because
the goose attacks everyone. Lose the cat and it's in their hold: go and get it back before they cast
off, or the mission report says "Cat: missing (presumed spoiled)". It's very memorable and very
on-brand, but it's one note: the fifth catnapping is less funny than the first. It could work as a
rare "whim" inside the Quota instead (the "Cat Fancier" card) rather than as a whole encounter.
