# Tractor tug: when it docks

Today the tractor tug (`ENEMY_TYPES.tractor` in `js/encounters.js`) is a yellow interceptor that freezes the
jump countdown until someone shoots its emitter. It already grabs us, so it is the natural next ship to dock.
Below is one lead concept and two shorter alternatives.

Images (all in this folder):

| file | what it shows |
|---|---|
| `1_keyart.png` | Key art, rendered in Blender with the dock kit: the repo tug docked at our left airlock, crew and cat composited in |
| `1b_keyart_closeup.png` | The same render, close-up on the winch hall and customer service |
| `2_layout.png` | Annotated layout: rooms, routes, who does what, a HUD mock-up |
| `3_minigames.png` | Mock-ups of the three new mini-games |

Sources: `tools/blender/models/concepts/tug.py` (the Blender scene), and `compose_keyart.py`, `diagram.py` and
`minigames.py` here.

---

## Lead concept: FINAL NOTICE

**Hook:** A repo tug has a court order for your ship, and it is reeling you in one clank at a time.

### The fantasy

Lien & Done Recovery Co. has sent Tug 7, "Big Bertha", to collect on a debt. The ship is a work-yard
yellow tugboat in space: tyre fenders, a cable drum the size of a room, and a polite robot clerk at the front
desk. Nobody on board wants to hurt you. They just want your ship. The crew has to get loose by brute force,
by paying, or by proving it's the wrong ship. Meanwhile little yellow drones come over and put wheel clamps on
our cannons.

It is the only boarding encounter where:
- **the danger is a meter, not people.** The tow cable reels us towards the tug's hold, and that meter is the
  clock to beat. No guards and no shooting aboard.
- **there are three ways to win, and the crew has to pick:**
  - **fight:** overload the beam generator
  - **pay:** settle the bill out of the mission's pay
  - **argue:** fetch our registration plate from outside our own hull and show it to the clerk
- **the enemy comes to us without fighting.** Repo drones clamp our stations, so the crew at home is busy too.

### How it starts (phase 1 is today's encounter)

1. The tractor tug shows up as it does now: the beam freezes the jump clock and its emitter is a weak spot.
   **If the cannons hit the emitter within 40 s, it never docks.** This is the same rule as the pirate raider,
   so good gunners can skip the whole boarding.
2. If they miss, it fires a magnet clamp on a tow cable into our hull beside the left (or right) airlock, and
   a tube clamps on. Ship voice: *"We are being... towed. I did not authorise this."*

### Moment to moment (crew of four, see `2_layout.png`)

**The tow meter** (HUD: `TOW 62%  distance to the hold`) fills while the winch runs. It takes about 100 s
to fill at normal difficulty. The jump clock stays frozen while the beam holds us, as it does today.

| who | where | what |
|---|---|---|
| **Helm** (stays home) | Bridge | **FULL ASTERN**, a new mini-game. Push the throttle into the green band. Every winch *clank* knocks it back down; too high and the engines overheat. Pushing slows the reel to about 30% and drains a capacitor, so the reactor needs feeding too. |
| **Winch boarder** | Tug: winch hall | **SPANNER IN THE WORKS**, a new timing mini-game: drop a loose item into the gear's open gap as it passes. Hit: *CRUNCH*, the reel stops for 15 to 25 s (depends on the item) until the gear chews through it. Our loose items become ammunition (hull plates are counted!). Or **tape the brake lever** with the tape-job mini-game we already have: the reel stops until the tape gives. |
| **Counter** | Tug: customer service | **TAKE A NUMBER**, a new panel. Pull a ticket (07; now serving 03). The queue moves only while someone stands behind the line. Then: **Dispute** (needs the plate), **Pay $180**, or **Ask for a manager** (back of the queue, ticket 31). |
| **Runner** | Outside our hull | The **registration plate** (`MN-0451`) is bolted to our stern. Our docked airlock is busy, so the runner spacewalks out the *other* airlock, unscrews it (hold click, 4 screws), walks it back through our ship and the tube, and hands it over. |
| **Anyone at home** | Our rooms | **Repo drones**: every ~20 s a small yellow drone rolls over through the tube and wheel-clamps a station (cannon seat, helm, shield, fuel slot). A clamped station doesn't work until the clamp is pried off (hold click 3 s, 1.5 s with the repair kit). Shoot drones in the tube before they get there. |

The rest of the mission's encounters keep coming, so the crew at home is still fighting.

### The three ways out

1. **Dispute (the clever win).** Plate to the clerk: *"MN-0451? Our order is for MN-0415. Our apologies.
   Please accept this voucher."* The tug lets go and pays **+$20** (a "clerical error voucher" line in the
   mission report).
2. **Pay (the quick win).** At the kiosk: the tug lets go politely. The bill is about 60% of the mission's
   base pay, listed in the results as `Repo settlement −$120`. That's a real choice when the ship is on fire.
3. **Overload the generator (the violent win).** Repair kit on the beam room's overload panel (3 s, same rule
   as the pirate reactor). The beam drops, the cable snaps, and the tug spins off 15 s later. Anyone still
   aboard is cast adrift, as with the pirates. This also unfreezes the jump clock at once.

### Fail state

When the tow meter is full we are **in the hold**: the tug's clamp jaws close on that side. Every 10 s that
side's rooms take a hit, and a second drone comes over per cycle. It's not an instant loss: the crew can still
dispute, pay or overload, but now the hull is being crushed. If the ship breaks while in the hold, the end
screen says **REPOSSESSED** instead of the usual defeat line.

**Leaving people behind:** we never jump while docked (existing `dockJumpHold`). If someone is still over
there when the tug lets go, they are cast adrift (existing rules). Jumping with nobody aboard fails the
mission, as now.

### Mini-games (see `3_minigames.png`)

- **FULL ASTERN (helm):** a vertical lever that the winch pulls down in jerks.
- **SPANNER IN THE WORKS (winch):** a sweeping marker and a green wedge over the gear. Click while carrying
  an item.
- **TAKE A NUMBER (clerk):** a ticket, a queue and three choices, built in the style of the existing PIN pad
  (`ui.mini.door`).

All three are hold-click or timing interactions, the same input language as the existing station games.

### Scaling

| | very easy | easy | normal | hard |
|---|---|---|---|---|
| time to the hold | 150 s | 120 s | 100 s | 75 s |
| drone interval | 35 s | 28 s | 20 s | 14 s |
| plate screws | 2 | 3 | 4 | 6 |
| your ticket | now+1 | now+2 | now+4 | now+6 |
| bill (share of base pay) | 30% | 45% | 60% | 80% |

Crew size:
- **Solo:** no drones for the first 45 s. When nobody is at the helm, a lever left pushed holds weakly for
  a while ("it's taped"). The queue is one number.
- **Two crew:** one boards and one runs the helm. The plate is usually too far away for two, so pay or
  overload.
- **Each crew member past four:** one more drone per wave and one more number in the queue.

The plate dispute is the reward for a crew that splits well.

### Jokes, plaques, decor (most are in the render)

- **Signs and stencils:** "WE BRAKE FOR NOBODY", "MAX LOAD: YES", "KEEP CLEAR OF DRUM", "PLEASE WAIT
  BEHIND THE LINE", "NO HANDS" (by the gear), "DO NOT STARE INTO BEAM WITH REMAINING EYE", "DO NOT OVERLOAD".
- **The clerk:** an EMPLOYEE OF THE MONTH frame (always CLERK-9000), and a NOW SERVING display that skips
  your number if you step away.
- **The clerk's lines:** *"Your ship is important to us."*, *"This repossession may be recorded for training
  purposes."*, *"Please hold."* (and hold music, a lift-music cover of the mission theme).
- **The cat:** the drones try to tag it with a `LOT 47` collar tag and carry it to the impound cage
  ("RELEASE FORM 12-B"). It hisses at drones and stares at the clerk.
- **Duct tape:**
  - The brake fix is literally duct tape.
  - A jar of "CONFISCATED DUCT TAPE" sits on the counter, and breaking it gives you 2 tape.
  - Clamped stations get a "PROPERTY OF LIEN & DONE" sticker.
- **Paperwork:** the kiosk receipt says "THANK YOU FOR BEING REPOSSESSED WITH US".

### Build cost (honest)

**Reused from the existing code:**
- **Docking:** the dock template (`dockGeom` three-room layout, `dockShip` / `undock`, the tube, walk rects,
  camera, `DOCK_DECOR` plaques). Phase 1 is `ENEMY_TYPES.tractor` unchanged, including its emitter weak spot
  and the `mission.jumpAt` freeze.
- **The overload exit:** the pirate reactor rule (`OVERLOAD_TIME`, `detachT`, cast-adrift rules), plus
  `dockJumpHold` / `releaseForJump`.
- **Mini-games and interactions:** the tape-job mini-game (the brake), hold-click interactions (the sentry
  switch-off pattern) for clamps and screws, and the item carry rules (the plate is a new item like the
  black box, but not heavy).
- **Spacewalk:** EVA hull spots for the plate, like the antenna and debris jobs.
- **Drone movement:** `dockRoute` and `pirateStep` (they walk the same chain as pirates, never shoot,
  1 HP).
- **Pay:** `computeRewards` gets one more line.

**New:**
- **Encounter state:** the event kind (`repo`, new id) and dock kind `tug`, plus a tow meter in `dk` (synced
  in the snapshot like the rest of `dk`) and the in-the-hold crush phase.
- **Three mini-game UIs:** throttle, gear timing and the clerk panel.
- **Drones and clamps:** the repo drone actor, plus a `clamped` flag on stations (cannon seats, helm,
  shields, fuel slot) that every "can I use this" check has to respect. This touches the most code.
- **The cat:** cat-snatch moves the cat out of `CAT` into the impound cage and back.
- **Settlement and voucher** lines in the results.
- **Sprites:** `dock/tug_port` / `_star`, an animated gear and drum, generator states, the drone (8 dirs),
  a clamp overlay, the clerk (idle and talking) and the kiosk.

**Size:** about the size of the pirate base (chapter 5). Suggested phasing:
- **v1:** tow meter, gear jam, brake tape, overload, pay.
- **v2:** drones and clamps, plate dispute, the cat.

**Save compatibility:** no profile fields change. Everything new is a new id: the event kind `repo`, a new
mission id if it gets a chapter or skirmish, new sprite names. Settlements and vouchers only change the pay
of that one run, which is already credited per run (`creditMission`). No migration needed.

**Open question for you:** should the jump clock stay **frozen** while docked (today's tractor rule, so the
mission runs long), or **run but be blocked** like the other docked ships ("Jump blocked: under tow")? The
second fits the fixed-clock pillar better; the first is what the tractor means today. The mock-ups show
"frozen".

---

## Alternative A: JUMP START (a friendly tug)

The tug "Old Maggie" has a dead drive and a driver who hasn't seen a soul in months. Its beam grabbed us
because towing a passing ship is the only way it gets home. On the radio: *"Sorry, love. Take me with you?"*
The encounter is about laying a physical **jumper cable** from one of our capacitors, through our ship and the
tube, to the tug's drive:
- The cable trails behind whoever carries it.
- Doors can pinch it and the cat chews it, so the crew has to keep the route clear.
- Over there, someone keeps the ancient drive alive by banging it with a wrench in rhythm.

Do it before our jump and the tug comes along: a reward plus a free spare part, and Maggie turns up in later
briefings. Or shoot the emitter and leave her: no penalty except her voice on the radio. It is cooperative
rather than hostile, and the only encounter where our power physically crosses into another ship. A cable
running through doors is a new, very visible way to split the crew.

## Alternative B: GRAB THE WHEEL (hijack the beam)

A pirate tug latches on. The boarding team storms its beam room, a short fight with two tug hands, and takes
the **tractor control chair**. Then *we* own the beam:
- **Steering:** a two-player job. One steers the beam on a radar-like screen; the other keeps the overheating
  emitter fed.
- **Using it:** yank mines, debris, the fuel canister or even an interceptor out of their paths, and fling
  them into each other.
- **The tug's crew** keeps trying to retake the chair, so someone guards the door.
- **At the jump:** let go, or tow the tug home as a prize for bonus pay (it gets sold to Lien & Done, of
  course).

It turns the threat into a weapon for the rest of the mission, and it is the only boarding where what you do
over there changes the fight outside.
