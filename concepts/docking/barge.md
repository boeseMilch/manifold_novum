# The Prison Barge: concept pitches

The ship: Red Comet Prison Barge 9 (`dk.dock.kind === 'pirate'` with `brig: true`, so the raider with a captive `dk.npc`).
Right now it is the raider's three rooms with two cells, a bedroll and "VISITING HOURS: NEVER". Note: as far as I
can see no mission or practice button spawns it today (`dockShip('pirate', side, { npc: true })` is never called;
chapter 5 uses the pirate base and the practice "engineer" setup uses the derelict). So it is free to become its own
encounter without breaking anything that already runs.

What the other ships already own, so this one stays out of their way:
- **Raider**: pirates board us and steal, we board back, jam the reactor.
- **Pirate base**: a linear jailbreak (guards room by room, terminal hack, door code, sentry gun).
- **Derelict**: dark, airless, a jammed door, fire, a sleeping intruder, a heavy black box.

The barge should be about **finding the right prisoner**, not about fighting through to one.

Images (all in this folder):
- `barge_keyart.png`: key art. Blender render of the barge in the game's style, with the game's own character
  sprites placed at game coordinates.
- `barge_layout.png`: annotated layout: rooms, the drum, who does what, routes, who is in the drum.
- `barge_minigame.png`: mock-ups of the crank and gate-key overlays, plus a one-minute storyboard.
- Sources: `tools/blender/models/concepts/barge.py` (render), and `compose_keyart.py`, `diagram.py` and `minigame.py` here.

---

## Lead concept: THE CELL-O-MATIC

**Hook:** The prisoners sit on a giant revolving lazy Susan with only one gate. One of you spins it, one of you
watches the gate, and every wrong stop lets something out onto our ship.

### The fantasy
The Red Comet saved money on prison doors: there are six cells on a turntable inside a fixed bar cage, and the
cage has one gate. A crank wheel in the next room turns the drum. The dial there only shows a cell number, the
mugshot camera is broken, and the roster on the guard-post wall is wrong. You have one working gate, one doctor
to find, and five things you shouldn't let out: a convict, a goat, a cat that isn't ours, a tunnel, and a pile of
confiscated duct tape. Think of a bank-vault heist run by people shouting through a doorway.

### Moment-to-moment play
The barge docks the same way the raider does: tube, airlock, three rooms. Then:

- **A, the cranker (core room).** Plays the crank overlay: hold and drag in circles to spin the drum up. Each
  cell that passes the gate makes a CLACK. Let go and it coasts; the brake lever stops it. A cannot see the gate.
  The reel shows numbers and the mugshot camera shows static, so A goes by ear and by what B shouts.
  If the drum stops between two cells, the gate jams ("NOT ALIGNED") until it is nudged into place.
- **B, the gate watcher (hold).** Looks through the bars at whichever cell is at the gate and shouts:
  "Big guy. Orange. Not her. Two more!" The gate key is a hold-click of 2 s (`holdTarget`) to open and again to
  close. The drum will not turn while the gate is open, so B and A have to take turns. When it's the right cell,
  B treats Dr. Varga (the existing heartbeat mini-game) and she walks home on her own with the existing NPC code.
- **C and the rest (our ship).** The mission clock and its timeline keep running (flares, interceptors,
  breaches). At docking, two **transfer officers** come aboard. They use the raider's pirates' AI, but instead of
  stealing they go after a crew member. Then the escapees arrive (see below) and have to be dealt with
  on our own decks.
- **The tension between ships.** Every mistake at the gate shows up on our ship. Big Lou heads for our snack
  machine and then the fuel cells. The goat eats duct tape, so every taped repair it reaches breaks again. That
  ties the barge straight into the ship's running joke and its damage system. People at home have to stop what
  they are doing to deal with it, which is the parallel pressure the game is built on.

### Who is in the drum (shuffled every run)
| Cell occupant | Riot | What happens if you open it |
|---|---|---|
| Dr. Varga / the engineer | – | The objective. Treat her; she walks home. |
| Big Lou (convict) | +1 | Fists, 4 HP. Steals like a raider pirate (snacks first, then fuel cells). Pirate sprite in an orange jumpsuit. |
| The goat | +1 | Wanders our ship, eats duct tape (untapes repairs), can't be hurt, only shooed into an airlock. |
| A cat (not ours) | 0 | Optional bonus: pays the raider's "WANTED: ONE SHIP CAT" bounty (10,000 CR… after fees, 100). Our cat sulks. |
| The tunnel | 0 | Empty: a hole, a spoon, "WORKING ON IT". A note gives a clue: "VARGA = THE ONE WHO HUMS"; her cell blinks on the dial for 5 s. |
| Confiscated tape | 0 | +6 duct tape. They confiscated our running joke. |

The **riot meter** is three lamps on top of the hub. Each convict or goat let out lights one. With all three lit
it's a **RIOT**: every cell pops at once, the drum free-spins for 15 s, and the warden panics and casts off early
(the existing `undock()`, whoever is still aboard is cast adrift). Varga can still be reached in a riot, but you
are now racing a cast-off timer while a goat is loose on the bridge.

### New mechanics / mini-games
1. **The drum.** State: angle, speed and gate open/closed, synced in `dk`. The cage is a solid circle in the hold's
   walk geometry, with one gap at the gate, built like the base's cover holes (`floorMinus`). Occupants spawn at
   the gate when it opens.
2. **The crank overlay.** A new `ui.mini` kind next to the patch board and PIN pad: a circle-drag gesture with
   momentum, the number reel with an alignment notch, a speed gauge, the brake, the static mugshot camera and the
   riot lamps (see `barge_minigame.png`). It is the first momentum-based mini-game: overshooting is the skill.
3. **Escapees on our ship.** Big Lou is the raider pirate's steal AI with a melee hit and no gun. The goat is a new,
   small, unkillable wanderer whose target is "nearest taped repair". It reverts that repair (the tape count stays
   used) and can be pushed out of an airlock.
4. **Transfer officers (harder difficulties).** A pirate whose action is "cuff": the target is stunned and dragged
   toward the tube. Break free by mashing, or a teammate frees them with the repair kit (3 s). Someone dragged all
   the way is locked in an empty cell, which then has to be found on the drum like everyone else.

### Scaling
- **Very easy / easy:** 4 cells, the mugshot camera works (it shows the occupant once aligned), the riot needs 4
  lamps, no momentum (the drum stops dead when you let go), and no cuffing (officers just fight).
- **Normal:** 6 cells, camera static, the gate jams on misalignment, officers fight.
- **Hard:** the drum's pawl is broken, so unless someone holds the brake it creeps one cell every ~8 s. Officers
  cuff. Two convicts instead of the cat.
- **Solo:** possible but slow. You crank, walk the ~8 units to the gate, look, and walk back. The camera always
  works solo (slow, not blind), there are no officers, and our ship's timeline is lighter, as with `baseGuards`.
- **2 players:** one cranks and one watches the gate; our ship runs on autopilot plus luck. Real tension.
- **3–4:** the intended setup (A, B, plus 1–2 at home handling escapees and the timeline).
- **5–8:** +1 officer per extra crew member (as `baseGuards` scales), an 8-cell drum, and a second goat.

### Fail states and how it ends
- **Win:** Varga is aboard our ship and the jump fires. The barge lets go at the jump (the existing
  `dockJumpHold` / `releaseForJump`); the jump is blocked while docked, as now.
- **Mission failed:** the barge casts off (riot, or the jump comes due) with Varga still in her cell. You survive
  but fail, as with any unmet objective.
- **Soft fails** (they hurt, but don't end the run): lost fuel cells and snacks, untaped repairs breaking again,
  a crew member cuffed into a cell, someone cast adrift when it casts off.
- **Results screen jokes:** "Prisoners released: 3 (1 intended)". "Goats acquired: 1". The goat stays aboard
  for the rest of the mission if not pushed out ("the ship goat").

### Jokes, plaques, decor (for `DOCK_DECOR.brig`)
- Hub plaque: "CELL-O-MATIC 3000 · PATENT PENDING · PATENT DENIED". Floor stencil: "KEEP HANDS INSIDE THE CELL".
- Crank room: "SPIN RESPONSIBLY", "THE WHEEL IS NOT A STEERING WHEEL", a tape-patched brake lever.
- Guard post: "ROSTER" with six mugshots, one crossed out in red; "VISITING HOURS: NEVER" stays.
- Gate: "ONE AT A TIME. PLEASE. PLEASE." Tally marks stay in Varga's cell. "THE BRIG IS NOT A HOTEL" stays.
- The tunnel cell's sign: "WORKING ON IT". The tape cell's sticker: "CONFISCATED".
- Ship voice when the goat reaches the bridge: "There is a goat on the bridge." (no further comment).

### Honest build cost
**Reused:** `dockShip` / `dockGeom` (same three-room shell, so it keeps the `pirate` + `brig` flag, or gets a new
kind `barge` that falls back to the same geometry); docking, the tube, `undock`, `dockJumpHold` / `releaseForJump`;
the raider pirates' AI (officers, Big Lou); the NPC treat / walk-home / downed-on-hit code; `holdTarget` (gate
key); the `ui.mini` overlay framework and its net command path; `DOCK_DECOR` plaques; `floorMinus` for the
solid cage; `models/dock/ships.py` and the existing brig materials for the sprite.

**New:**
- Drum state and sync, and a walk-geometry circle with one gap.
- The crank overlay with momentum, about 150–200 lines.
- Gate open/close with occupant spawning; the riot meter and riot state.
- Goat AI (small) and the untape action (touches the tape / repair bookkeeping: check it against how a taped part
  currently remembers being taped).
- Cuffing (stun + drag + break free). This is the biggest new piece and could ship later as the hard-mode add-on.
- **Sprites:** the drum cage (static), the turntable + walls (as a rotation sheet: the drum is 6-fold symmetric,
  so ~10 frames over 60° with numbers drawn at runtime), the crank wheel (a few frames), the goat (8 dirs), and a
  convict skin (the pirate with an orange tint mask).
- An event `barge` (or reuse `pirates` with a flag), and a mission or skirmish that uses it (it fits a ★★★
  "Stranded engineer" slot, or a chapter-5 alternate).

**Rough size:** 500–700 lines of JS, plus one new Blender script and a goat. With cuffing deferred: about 400.

**Save compatibility:** no profile format change. Only new ids: the event `barge`, maybe a mission id such as
`barge` and its `done.barge`, and an optional rewards field for the cat bounty (a one-off money payout in the
results, nothing stored per profile). Don't rename the existing `brig` sprite or decor keys; add new ones.

---

## Alternative 1: LIGHTS OUT (stealth, coupled to our ship's power)

The barge's hold is swept by two searchlights on the guard towers (they are already on the barge's roof). If a
light touches you: **LOCKDOWN**. Blast doors slam, the tube hatch seals for 20 s, and the guards wake up. The way
in is to cut the barge's power from **our** side. The barge draws power through the docking umbilical, so someone
at home overloads that feed from our patch board (the existing mini-game), which gives a 6–8 s blackout. During
the blackout the boarders, flashlights off (ion-storm darkness code), dash from cover to cover toward Varga's cell.
Each blackout costs us a capacitor charge, so the people at home trade our own ship's energy for the boarders'
safety while the timeline runs. Varga has to be walked out in two or three dashes because she is slow. The
encounter is about the radio call ("NOW!"), and it has no fighting at all unless someone is spotted. It reuses
darkness, the patch board, capacitors and the NPC walk. New: the searchlight cones (like the sentry's fan), the
lockdown state, and the umbilical feed.

## Alternative 2: THE CAT SWAP (a hostage exchange that goes wrong)

The barge doesn't dock to fight. It docks to **trade**. The warden comes on the comms: "Your doctor for the cat."
(See the raider's WANTED poster.) The exchange happens in the tube: two pirates with laser sights on one end,
Varga in cuffs on the other. Nobody is giving up the cat, so the crew builds a **decoy cat** at the workbench out
of the mop, duct tape and the rubber duck (a short tape mini-game: the more tape, the more convincing and the
heavier). Someone walks it slowly down the tube. The warden "scans" it with a slowly filling bar. Meanwhile, a
second crew member spacewalks along the barge's hull to the brig porthole and cuts it open (drill / weld, the EVA
code). If the scan finishes before the porthole is open, the decoy's tail falls off and the shooting starts. It
is a calm, tense, comic stand-off and different from every other dock. It reuses the tube, EVA, the drill, laser
sights and the NPC. New: the trade state, the decoy item, the scan bar, and a breachable porthole.
