# Red Comet Base: "Who's in my chair?"

Concept pitch for chapter 5, *Rescue Dr. Varga* (`dk.dock.kind === 'base'`, event `brig`).
These are additions to your design. The bay → server room → barracks → gun corridor → brig run, the guards, the
door code, the sentry, detach and escape all stay as they are. Each pitch adds one layer on top.

Images (in this folder):
- `keyart.png`: Blender mock-up of the server room as the Security Desk, annotated (`keyart_raw.png` is the same render without labels).
  Script: `tools/blender/models/concepts/base.py`.
- `layout.png`: the base's rooms at game scale (from `baseGeom`) with the new network nodes, the runner route,
  who does what, and a table of what each node does.
- `minigame.png`: mock-up of the desk screen, plus three moments it should produce.

---

## Lead concept: the Security Desk (a network tug-of-war with Captain Red Comet)

**Hook:** Once you've hacked the terminal, someone can sit in Captain Red Comet's own chair and fight him, live,
for control of his base, while everyone else counts on whatever that person manages to hold.

### The fantasy
The heist movie's "person in the van." Today the server room terminal is a single hold-click step (repair, hack,
the barracks door opens) and then the room is empty. In this pitch the terminal becomes the captain's **Security Desk**:
a wall of CCTV feeds, a network map set into the desk, a stolen leather throne with "CAPT." on the back. The captain
never shows up in person. He is a voice on the PA, and he is fighting you for the network from wherever he's hiding.
The crew gets the base's own systems, he keeps trying to take them back, and the person in the chair is the one
shouting "DON'T go in yet, the corridor door is his!"

### Moment-to-moment play
After the existing hack, the terminal prompt says *"Sit down? (the captain will notice)"*. Sitting works like
climbing into a cannon seat (a `mode`, you are "at" the desk) and opens a real-time panel (`ui.panel = 'mini'`,
like the patch board).

**Network nodes** (see `layout.png`): 3 doors (bay–server, server–barracks, barracks–corridor), **LIGHTS** (barracks),
**SENTRY**, **TURRET** (a new flak gun on the base hull beside the bay), **CLAMPS** (the docking clamps) and **CAMS**.
The brig keypad is *not* a node: the code still has to be read off the barracks wall.

- Each node belongs either to us (blue) or to the captain (red). At the start the captain owns everything except the
  barracks door, which today's hack opens.
- **The captain grabs** one node every ~12 s (8 s at alarm 3+). The node gets an amber ring that fills in 3 s, then turns red.
  He prefers whatever hurts most right now, for example the sentry while someone is in the corridor, or a door
  someone is about to walk through.
- **The hacker** holds click on a node for 1.5 s to take it, or to cancel a grab in progress. Doors you hold can be
  opened or shut with a click. That lets you trap a guard behind a door or shut one in front of a pirate rushing the bay.
- **What a node does:**

| Node | Captain holds it | We hold it |
|---|---|---|
| DOOR ×3 | slams shut | open/shut at will |
| LIGHTS | normal | barracks goes dark: its guards fire blind until close (the ion-storm flashlight look) |
| SENTRY | today's behaviour: shoots the crew | IFF flipped: it hoses pirates, Varga walks past |
| TURRET | shells our ship's docked side every ~15 s | silent (or one volley at the patrol) |
| CLAMPS | our airlock can't detach | detach as today |
| CAMS | the hacker's wall screens go to static | guards show as red dots on everyone's HUD |

- **Alarm meter** (5 pips): rises on shots fired in the base, the sentry firing, and nodes we take. Higher alarm means
  faster grabs and grumpier PA lines. It drains slowly while nobody fights.

**What each crew member does** (crew of 3):
- **Hacker (H):** in the chair, watching feeds and calling out guards, keeping the runners' next door and the sentry
  blue. Can't hold everything, so they have to triage. Very exposed: the chair faces the wall, and a guard who
  gets through the bay door shoots them in the back.
- **Runner (B):** today's route: code off the barracks wall, cover to cover, the sentry (now: "H, FLIP IT!"),
  treat Dr. Varga, escort her home.
- **Home (C):** our ship, which now has its own clock. While the captain holds TURRET, flak hits our docked side
  (rattling panels, then a breach on the docked side's lower room: the existing damage path), the opener patrol,
  plus the mission's 2 events. Every few minutes C begs H to "take the turret back for ten seconds, I'm out of tape".

So the parallel pressure isn't three separate jobs: what the hacker spends time on directly changes how hard the
other two have it, and everyone can hear it.

### New mechanic / mini-game
A **real-time tug-of-war on a node graph** (see `minigame.png`): one screen, eight nodes, an amber timer ring for
his grabs and a blue progress ring for yours. A strip of camera feeds below, the PA ticker at the bottom. It's a
hold-click like the station jobs, but the skill is deciding what to hold, and saying it out loud.

### Scaling
- **Difficulty:** grab interval (very easy 20 s / easy 16 s / normal 12 s / hard 9 s), how long his grab takes (4 / 3.5 /
  3 / 2.5 s), and on easy the captain never grabs SENTRY while someone is in its fan (no cheap deaths).
- **Crew size:** solo, nobody can sit and run at the same time. So the desk only ever **helps**: with nobody in the
  chair, the captain slowly takes everything back, which is exactly today's base (doors shut, sentry hostile). Solo
  can still sit down for 20 s before the run, flip the sentry and take the cams, then go, knowing they'll be
  red again before long. At 3–4 crew the captain gets a **second cursor** (two grabs at once) and the turret fires
  more often, so the home crew stays busy (today big crews only get more guards).
- **The alarm:** the escalation is in the players' hands. A quiet crew gets a slow captain.

### Fail states and how it ends
- Nothing new is a hard fail. The worst case is today's base.
- **The hacker is shot at the desk:** they slump in the chair and every node turns red over the next few seconds.
  Someone has to treat them (existing heartbeat treatment) or take the seat.
- **Captain holds CLAMPS at the end:** detaching is blocked ("CLAMPS LOCKED"). That isn't a softlock: the bay's docking
  control gets a manual clamp release (hold 4 s with the repair kit), which is a last dash for someone.
  `baseJumpHold` keeps working as now.
- **End:** once Dr. Varga is aboard, the captain's last PA line ("Fine. FINE. Keep the chair. Not the cat.") and
  every node goes dark. Detach and the escape spool as today.

### Jokes, plaques, decor (most are in `keyart.png`)
- "CAPT." in gold on the chair back, under a skull. A floor stencil: **AUTHORISED PIRATES ONLY (THAT MEANS YOU, WHISKERS)**.
- **Admiral Whiskers**, the base's cat (black, an eye patch). Once a mission he strolls across the desk and flips two
  random nodes, one each way so it's fair-ish. PA: "WHISKERS. NO." Pet him to make him leave (our cat's pet animation).
- The captain's webcam on top of the CCTV wall, duct-taped over in an X. A sticky note on the desk: "PW: password1".
- The server room's guard, duct-taped to a spare office chair, with an "ON BREAK" stencil on the floor.
  (Optional: a fallen guard in this room gets taped up instead of lying there.)
- A "GROG" machine by the bay door (a pirate cousin of our snack machine).
- Plaque: **NETWORK RULES: 1. MY NETWORK 2. SEE RULE 1** (matching "BRIG RULES").
- Door frames have a lit strip in the owner's colour, so a runner can see from the floor who holds a door without
  asking.
- PA lines: "Whoever's in my chair: I can see your boots." / "That's MY coffee." / "I'm docking you a week's
  pay. All of you. Even the ones who don't work for me." / (sentry flipped) "...traitor."

### Build cost (honest)
**What already exists and gets reused:**
- The terminal itself (`baseClickTarget` / `baseAct`, the repair+hack holds), the seat-like `mode` pattern (cannons),
  the `ui.panel = 'mini'` framework with `miniCommand` for net actions (the patch board is the closest relative), and
  `holdTarget`.
- The sentry (`updateSentry`): add `S.iff = 'us'` plus a target-pick that aims at pirates instead of crew. That's the
  biggest change to existing code. Sight and cover logic stay the same.
- Doors are already `dk.dock.doors[]` booleans. LIGHTS reuses the ion-storm darkness / flashlights per room
  (`js/lights.js`). TURRET damage goes through the existing hit/rattle/breach path on the docked side.
- Everything lives in `dk.dock` (a `net: { node: 'us'|'cap', grab: {node, t} }`, `alarm`), so the snapshot
  carries it for multiplayer for free.
- PA lines go through `combatBanner`, or a small PA ticker.

**New:**
- The desk panel (draw + clicks, roughly the size of the PIN pad panel), the captain's grab AI (a few dozen lines:
  pick a node by a weight table, timers), the alarm meter, the turret (2D first; a sprite later), the clamp release,
  the Whiskers event, door LED strips, decor entries in `DOCK_DECOR.base`. Tests: a `tests/dock.js` case for grab →
  take → sentry IFF, and one for clamps blocking detach and the manual release.
- Estimate: medium, about one solid session plus a playtest round. The art (desk, chair, throne, CCTV wall) can stay 2D
  like the rest of the base until the base gets sprites.

**Save compatibility:** no profile changes needed. If you later want a reward ("Hacker's dongle": faster takes),
it would be a **new** gear id. Nothing gets renamed.

---

## Alternative A: Shift Change (a heist on a timetable)
The base runs on Captain Red Comet's **duty roster**, posted on the barracks wall next to the chore wheel.
Every 60 s a klaxon plays "SHIFT CHANGE", and for ~10 s the base reshuffles: guards leave their posts and walk the
corridors to swap rooms, the sentry drops into an 8 s **maintenance cycle** (its barrel visibly retracts), and
the barracks lights go to "night shift" red. The crew can read the roster (a small panel: who is where, when the
next change is) and plan around it. Rush the gun corridor during maintenance, or ambush guards in transit
instead of fighting them dug in. Missing the window means waiting a minute while our own ship takes its normal
pressure. The home crew becomes the **clock-caller** ("change in 10… go!"). Joke: the roster has "WHISKERS:
SENTRY DUTY", and the cat sleeps on the sentry during maintenance (pet him off or the gun won't restart, in your
favour). Build cost: low to medium. Guard path-walking already exists (`basePirateMove`, routes), the sentry already has
states, plus a timer and a roster panel. It makes the base feel like a place that runs without you.

## Alternative B: Scuttle Protocol (the base comes apart behind you)
The moment Dr. Varga's cell opens, the captain triggers the base's **scuttle**: "If I can't have her, NOBODY gets
my base." The base decompresses room by room from the brig outwards (brig → corridor → barracks → server → bay),
each room on a visible countdown, with blast doors that drop when it goes. That's the existing hull-breach / vacuum
/ items-sucked-out code, run on the base's rooms. The escape becomes a chase: carry or escort Varga (she's slower
when hurt), the sentry's cover crates start sliding toward the breach, and loose carbines fly past. Meanwhile
the home crew has to **keep the tube and our airlock clear** and hold the detach until the last runner is through, while
the base's death throes knock our docked side around. Mistime it and you detach with someone still out there
(the existing "dock again" rescue). Joke: the self-destruct panel needs the captain's own 4-digit code, and it's the
same one as the brig door ("DO NOT WRITE DOWN"). Build cost: medium. Breach and vacuum logic exist for our ship,
and would need to be generalised to `dk` rooms. It gives the campaign's set piece a proper finale on the way out,
where today it ends quietly once she's aboard.

---

**My recommendation:** the lead (Security Desk). It's the only one of the three that turns the base's one quiet
room into a station, gives a bigger crew a real job instead of more guards, and links the boarding party and the
ship at home through a single decision ("which node do I hold?"). Scuttle Protocol would fit well as an *ending*
on top of it later.
