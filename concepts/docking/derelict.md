# The Derelict: concept pitches

Ship: Dr. Varga's drifting research lab, "VARGA INSTITUTE LAB 3" (`dk.dock.kind === 'derelict'`, event `derelict`).
Used by The Empty Lab (black box) and the stranded-engineer rescue.
Today it is airless, dark, has a jammed door, a fire, a sleeping intruder, and the tether lets go 8 s after the jump is due.

Images (all in this folder):
- `keyart.png`: Blender key art in the game's style. The lab is lit only by our party lights, Specimen 7 is frozen in the watcher's beam, and the runner is at the core door.
- `layout.png`: annotated layout, with who does what, our ship meanwhile, and a timeline of one run.
- `storyboard.png`: four panels of "the moment" (brownout, then the lights come back on).
- Sources: `tools/blender/models/concepts/derelict.py` (variants `lit` / `brown` / `out`), plus `compose.py` and `layout.py` here.

---

## Lead concept: LIGHTS OUT

**Hook:** The thing in the lab can only move in the dark, and every light over there runs on *our* reactor.

### The fantasy
You board a dead lab with the ship's party lights. These are the string of coloured bulbs from the cat's birthday.
You unspool them room by room into the dark. Specimen 7 ("DO NOT FEED") is a weeping-angel horror: while any light touches it, it cannot move.
When you look away, it is closer. Back home, the gunner's finger hovers over the main cannon, because every shot browns out the lights over there.
The crew shouts **"Can I shoot?" "NOT YET!"**, and that is the line people will remember.

### Moment to moment
The derelict docks as today. It is dark, airless and tethered, and the airlock–lab door is jammed (manual override).

| Who | Where | Does |
|---|---|---|
| **Electrician** (green) | derelict airlock | Takes the **reel** (brought over from our port airlock) and plugs **J1**, which lights the airlock. Pays out the string. Re-tapes it with **duct tape** wherever the fire or Specimen 7 cut it. At the end, cranks the reel back in. The crank is the cannon-reload crank. |
| **Runner** (red) | through the lab into the core | Carries the plug end of the string; the string unspools behind the carrier like a rope and snags on door frames. Lays it around the fire, or puts the fire out first with the extinguisher. Patches **J3** in the core: first scrape off the frost (hold), then a 2-wire patch board. That powers the **cradle**, which unclamps the black box in 6 s. Then carries the box out at 60 % speed, as today. |
| **Watcher** (blue) | lab / core door | Keeps her **suit lamp** (the ion-storm flashlight cone) on Specimen 7. While it is lit, it is frozen. She walks backwards behind the box on the way out. |
| **Gunner** | our bridge | Holds off the mission's usual threats. **Every main-cannon shot causes a 1.5 s brownout** over there: the string goes dark, and the suit lamps are the only light. Side cannons cause a shorter flicker (0.5 s). |
| **Power** | our reactor / port airlock | The string drinks **1 charge from the port airlock's capacitor every 30 s**. Keep fuel cells coming, or the lab goes dark for good. Plugging the optional **J2** (lab ceiling lights) lights the whole lab but doubles the drain. |

**Specimen 7** is the existing intruder with a new temperament:
- In darkness it moves fast and silently. Its eyes glint green, and you only see them.
- In any light (string bulbs, J2's ceiling, the fire's glow, or a suit lamp cone), it freezes mid-pose. It is "stunned", but it still reads as alive.
- If it reaches someone in the dark, it **grabs them and drags them** toward its nest. Any light on it makes it drop them. Someone left in the nest is down, and the heartbeat treatment brings them back.
- It never leaves the derelict. It is the lab's problem, not our ship's. That keeps it clearly distinct from the boarding intruder.

### New mechanics / mini-games
1. **The string**: a rope (about 30 points, verlet) that unspools from the reel as you carry the plug. It has a fixed length of 30 units, so a sloppy route runs short.
   Each bulb lights a small radius. The fire, and Specimen 7's claws when it passes in the dark, cut the string, and everything past the cut goes dark. Duct tape fixes it (the quick tape job).
2. **Junction boxes J1/J2/J3**: frosted. Hold to scrape, then the 2-wire patch board we already have. J3 also powers the black-box cradle.
3. **Light check**: `litAt(x, y)` = within a bulb radius of a live string segment, OR in a suit-lamp cone, OR in a lit room (J2), OR near the fire. Specimen 7 moves only while `!litAt`.
4. **Brownouts**: our cannon and shield events dim `dk.dock.lights` for 0.5–1.5 s. The string is drawn flickering and dying, then the bulbs pop back on one by one.
5. **The reel crank**: cranking the reel back in also pulls the light back toward the tube, room by room. The last one out is walking out of the dark.

### Scaling
- **Crew size.** Solo: the specimen is slow (50 %) and freezes for 2 s after any light touches it. That leaves time to look away, plug in, and look back. 2 crew: as designed, with the watcher and the runner on the derelict and the ship left alone, which is honest pressure. 3–4 crew: **a second specimen** hatches from the nest pod halfway through ("SPECIMEN 8 — ALSO DO NOT FEED").
- **Difficulty.** Very easy: no brownouts, string 40 units, the cradle is mechanical (no J3). Easy: side cannons don't flicker. Hard and up: J1 is dead (the string starts at the reel only), the fire spreads along the paper, and brownouts last 2 s.
- **Rescue variant (stranded engineer).** You can only treat her **in light**, because the heartbeat game needs to see her. So the string must reach her, and she follows its glow home.

### Fail states / ending
- Grabbed and dragged into the nest, then left there: down, until someone treats you. If nobody comes, you are left aboard when the tether lets go, and you are cast adrift (existing rule).
- The string runs out of power (capacitor at 0): permanent dark, and Specimen 7 roams freely. You can still finish with suit lamps alone. That is hard and scary, but possible.
- The jump is due: the tether releases in 8 s, as today. If the string is still plugged in, **the reel spins and the plug rips out with sparks**. The string is lost, and the mission report says "Party lights: 0 (again)".
- Objective: the box aboard ours, as today. Nothing else changes about success or failure.

### Jokes, plaques, decor
- The reel: "PARTY LIGHTS 30 m — PROPERTY OF OUR SHIP — BRING IT BACK". In the report: "Party lights returned: yes / no (that's three this month)".
- The cat stares down the tube the whole time and hisses at the dark.
- Painted on the core floor in red: "IT ONLY MOVES IN THE DARK". The existing "SPECIMEN 7 — DO NOT FEED" plaque gets a sticky note underneath: "ALSO DO NOT LOOK AWAY".
- Varga's notes, taped with duct tape: "Day 41: it only moves when the lights go out. Ordered more bulbs." "Day 42: bulbs did not arrive." "Day 43: ".
- **Gerald**, the dead plant, has a name tag. If a bulb lights him, a single green leaf. (No mechanic.)
- The cold coffee mug: "WORLD'S OKAYEST SCIENTIST".
- Ship voice on a brownout: "Power fluctuation in the docking tube. That is probably fine."

### Honest build cost
**Reused:**
- dock geometry, tether, door override, fire and extinguisher, heavy black-box carry, `dockJumpHold` / release (all in `js/dock.js`)
- the darkness and ion-storm flashlight cones (`js/lights.js`, `js/encounters.js`)
- the intruder AI: dormant, stunned, grab (`js/invader.js`)
- the patch board, the crank and tape mini-games (`js/minigames.js`)
- capacitor charges, cannon-fire events, `DOCK_DECOR` plaques
- the derelict sprite (my key art builds on it unchanged)

**New, roughly 500–700 lines of JS plus tests:**
- the string rope (plain data in `dk.dock.string`, so it syncs through the snapshot)
- junction state `dk.dock.junctions`
- `litAt()`
- the Specimen 7 "frozen while lit / drag" behaviour (a new intruder flag, not a new kind)
- the brownout hook on our cannon fire
- the capacitor drain
- the reel prop and its crank
- cases in `tests/dock.js` (lit/dark freeze, the drag released by light, the cut string, the brownout on the main cannon, the plug ripping out at release)

**Sprites (new ids only):**
- `dock/reel`
- `dock/junction_off|on`
- `dock/cradle_locked|open`
- a bulb sprite (or procedural glow dots)
- the stencil
- frozen eyes (procedural)

**Saves:** no profile change. If "longer party lights" becomes a Shipyard upgrade later, it gets a **new** upgrade id. No migration needed.

**Risk:** the rope is the only physics-y new thing. A fallback is a polyline of the carrier's footsteps with a length cap, which is cheap and deterministic.

---

## Alternative A: HUSH (it hunts by sound)

Specimen 7 is blind and hunts noise. Everything on the derelict makes a visible **noise ring** on the floor: running (walking is quiet), the door override's clank, the extinguisher's hiss, dropping the black box, and our own cannons thumping through the tether. It goes for the loudest recent noise. The black box's locator beacon pings every 5 s, so you **duct-tape a sock over it** before carrying it out.
The home crew helps by making noise *elsewhere*. Someone bangs a wrench on the far hull (a hold-click at the starboard airlock) or rings Varga's desk phone from our bridge comms, which pulls the specimen away from the boarders.
It plays as tense creeping on the derelict and deliberate decoys at home. It is cheaper than Lights Out (no rope, no light check; a noise list and one AI target), but it is less visual and harder to read for new players.

## Alternative B: TUMBLE (keep station or the lab tips over)

The lab is spinning slowly on its tether. Someone has to sit at our helm and **match its spin**. This is a variant of the oscilloscope game: two sine waves, match frequency and phase.
While the match is off, gravity on the derelict tilts. Floor, papers, Gerald, the black box and the crew all slide toward the low wall, and the jammed door swings open and shut with the tilt. The tube creaks on a strain meter, and if it snaps, it's a spacewalk back.
The boarders time their dashes to the "level" moments the helmsman calls out. Specimen 7 sleeps, but it wakes if something slides into it.
It makes the pilot a hero for once, and it is very physical comedy. It needs a sloped-floor force on crew and items in the dock rooms plus a helm mini-game variant. It costs about the same as Lights Out, and it has the least eeriness of the three.
