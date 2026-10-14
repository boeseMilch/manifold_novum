# Manifold Novum — Plan

See `VISION.md` for the direction: a live-action Space Alert. The previous prototype
(asteroid mining, belts, building grid) is archived in `prototype1/` with its own
`PLAN.md`, and it still runs from `prototype1/index.html`.

Tech: unchanged. One HTML page, a canvas, and plain JavaScript with no dependencies. All
art is procedural.

## How to play

See `README.md`. In short: solo, open `index.html`; together, run `node server.js` and
everyone opens the address it prints.

## Approach

Build the ship first, then add the station mini-games one at a time, getting feedback after
each step.

## Step 1 — Ship layout and moving around (built, waiting for feedback)

Open `index.html`. The code is in `js/art.js` (procedural art), `js/ship.js` (layout data,
walkable area, hull geometry), `js/decor.js` (clutter), `js/enemies.js` (enemy ships and
asteroids), `js/combat.js` (shots, hits, shields, combat HUD), `js/audio.js` (synthesized
sounds, mute), `js/music.js` (the soundtrack), `js/systems.js` (energy, breakable parts,
inventory, hand weapons), `js/invader.js` (alien boarder), `js/mission.js` (mission script, radar, diagnosis,
security, fires, win/lose), `js/sidebar.js` (encounter sidebar) and `js/game.js` (loop, movement, airlocks, spacewalks, camera, HUD, debug menu).

- **Camera:** zoomed in so about one room fills the screen. It aims at a blend of nearby
  room centers, weighted by how close you are, and eases slowly, so it glides between
  rooms. Outside it follows you, and on a cannon it frames the field of fire. No whole-ship overview
  in the game (Tab was removed: not knowing what's coming is part of it); only the tutorial's tour and the
  debug menu zoom out.
- **Look:** the ship is old and held together by duct tape. Floors and hull are made of
  irregular plates (no visible grid), with mismatched replacement plates. Rooms have
  different sizes. There's one big engine at the stern. Clutter (purely visual, not
  solid): taped cracks and taped-down cables, crates, stains, scattered junk, a coffee
  mug steaming at the helm, a donut box on the holo map table, a bucket under a leaking
  pipe, a sleeping bag in the right cannon room, a ship cat asleep by the reactor, a
  rubber duck, socks drying, wall panels that spark now and then, a steam leak in the spine,
  and "DO NOT LICK THE REACTOR". Nothing flashes in the calm state.
- **Reactor:** the "REAKTOMAT 3000", half pizza oven and half vending machine, in a nest of
  cables. Its front has a fuel-cell slot with a cell sticking out, for feeding it later,
  and a crate of spare fuel cells sits next to it.
- **Engine:** one big engine. Its housing sticks into the bottom of the reactor room, and
  the bell comes out of the stern.
- **Crew:** always in a spacesuit. The visor is up inside and goes down outside.
- **No grid.** Movement is continuous. The walkable area is a union of rectangles (rooms,
  doorways, airlock chambers), plus open doors. The floor panels
  are purely visual.
- **Six rooms** as in the table in `VISION.md`, with open doorways between neighboring
  rooms on the same deck. Floors are tinted by zone (red / white / blue).
- **Props:** a helm console on the bridge (no function yet), three cannons on the outside
  of the hull (front, left, right; see Step 2), an outer airlock hatch in each lower
  side room, a shield button on each side of the lower deck, and a capacitor (1/3 charge,
  no function yet) in every lower room. The starfield drifts to suggest cruising.
- **Lifts:** removed (Step 6). The deck airlocks are the only way between decks.
- **Deck airlock** (one per zone): only one door is ever open. Walk in through the open
  door and it closes behind you (0.55 s), the chamber cycles (1.3 s), and the far door
  opens (0.55 s). Walking up to the closed side cycles an empty chamber to you first, so
  a worst-case trip takes about 6.5 s. Clicking inside the chamber cycles it by hand.
  Lamps show the door state: green = open, red = closed, blinking amber = busy.
- Starting state: the airlocks of the side zones sit at the upper deck, and the center
  one sits at the lower deck.
- Controls: WASD or arrow keys to move, E or Space to use.
- Debug: `index.html#overview` starts in the overview, and `index.html#x,y` starts the player at x, y.

Tuning constants are at the top of `js/game.js` (walk speed, door and cycle times).

## Step 2 — Combat mini-game (built, waiting for feedback)

Press **`** for the debug menu. It spawns an enemy left or right (interceptor or frigate)
or an asteroid swarm in front, teleports you to a cannon, or clears everything.

- **Cannons sit outside on the hull** and are manned from inside: climb the ladder hatch
  (in the left and right cannon rooms, and in the bridge nose next to the helm) with E.
  You can't man a cannon from a spacewalk; spacewalks are kept for other jobs (coming
  soon). Outer airlocks still take you outside (E at the hatch, about 1.6 s), where you
  float along the hull on a safety line.
- **Manning a cannon:** aim with the mouse (or A/D) and fire with click or Space. The aim
  range is ±75° for the side cannons and ±95° (190°) for the front cannon, which also zooms
  out further so asteroids show up earlier. E climbs back down the ladder. The gunner always sits opposite the
  barrel and swings around with it.
- **Cover:** hold Shift or right mouse to raise a curved metal plate in front of you and
  the cannon. It blocks shots coming at you, but you can't fire while it's up.
- **Enemies** fly parallel to us (nose up) and hold a rough position, swaying in a
  figure eight with random overtones. Their guns sit on the flank facing us.
- **Weak parts are real components painted blue** (glowing coolant fins, a power cable
  with energy flowing through it, cracked blue canopy glass, capacitor coils, a shield
  emitter, engine coolant jackets). They break visibly when hit: scorched, cut and
  sparking, or venting.
- **Hits use the real shapes.** A shell is marched in small steps, and at each step weak
  parts are checked (with a little tolerance) before the hull. A plain hull hit just
  clanks, but every few hull hits (5 for the interceptor, 8 for the frigate) knock out a
  random weak part anyway.
- An enemy only goes away once all its weak parts are broken: it catches fire and falls
  behind.
  - **Interceptor** (small twin-nacelle dart, moves a lot, light shots only):
    - Weapon cable: every second shot fizzles into sparks.
    - Engine cooling: it barely moves after this.
    - Windshield crack: no firing for 20 s. A tag above it shows "DUCT-TAPING WINDSHIELD"
      with a countdown while the strips go on.
  - **Frigate** (long armored hull, slow):
    - Turret power cable: same as the interceptor's cable.
    - Shield emitter: its hexagon shield bubble comes up periodically and eats every
      shell (each impact flares the cells). Hit the emitter while the shield is down to
      turn it off for good.
    - Heavy cannon coils: stops heavy shots.
    - Side engine and main engine: each one hit makes it move less.
  - **Asteroid swarm** (front): two big rotating asteroids drift in, each with a molten,
    orange-glowing fissure. Hitting the fissure splits a big one into two small rocks
    (with hot cracks), and so do 4 plain body hits (dark cracks spread from each impact).
    Any hit turns a small one to dust. Big asteroids that reach the ship are large hits,
    small ones are small hits.
- **Enemy fire:** light shots hit a random spot on that side of the hull, or (40% of
  the time when someone is outside) aim at you. Hits are only recorded for now (small,
  large, crew), and they leave scorch marks on the hull.
- **Heavy shots:** a 4 s charge that everyone hears (a rising whine) and sees (a glow on
  the enemy plus an on-screen warning with a progress bar).
- **Shields:** three big buttons on the lower deck: left, right, and front (reactor
  room wall, under the bridge; middle capacitor). The front shield is a hex arc around the
  nose that eats asteroids.
  Each button: E raises that side's shield
  for 15 s (18 s with the shield capacitors upgrade), then it recharges for 5 s. It costs
  1 energy. (Was 2 s up / 10 s down with a hold-to-extend; too weak, so no extension now.) The shield is a
  curved band of hexagon cells a little outside the hull. Any shot that crosses it while
  it's up (heavy shots included) is consumed right there: the cells around the impact
  flare up and ripple, and the shot shrinks away into the shield.
- **Hit feedback:**
  - Small hit: a thin red bar on the screen edge of the side that was hit (left, right
    or top).
  - Large hit: the whole view shakes, there's an explosion sound, and a wide red flash
    comes from that side.
- The HUD (top right) shows hits taken, the shield states and each enemy's weak points
  with what hitting them did. Arrows on the screen edge point to threats that are off
  screen.
- **Engine hits change how an enemy sways, smoothly:** amplitude and speed follow a
  critically damped spring towards the new pattern, so position and velocity stay
  continuous (no teleporting).
- Debug: `index.html#do=3,8&w=5` runs menu entries 3 and 8 at start and fast-forwards
  5 seconds.

## Step 3 — Energy, breakage, inventory, invader (built, waiting for feedback)

- **Energy:** each capacitor holds 4 and starts with 1.
  - Every cannon starts loaded with 3 shots. Empty, it only clicks. Reload with R or the
    RELOAD button (bottom right while manning it): it takes 1 energy from the capacitor
    on its side (front cannon: the middle one) and refills to 3 after 1.2 s. With that
    capacitor empty, there's no reload.
  - A shield costs 1 energy. With none, nothing happens and no cooldown starts.
- **Reactor** ("REAKTOMAT 3000"):
  - It starts with a fuel cell loaded. A cell holds 5 energy, made at one per 20 s; the cell
    visibly drains. Its fuel bar shows how full the cell still is, smoothly (`fuelFraction()`:
    the energy left minus the progress to the next one, also as "% full" in the HUD line). In
    the sprite look the front screen's five bars go dark from the right: the rendered frames
    only know all-lit and all-dark, so the drained part is `ship/reactor_off` clipped to it and
    drawn just in front (`reactorFuelBars` in js/art.js); the last bar turns red when under one
    energy. In ?classic the keypad's little bar and the cell show the same fraction.
  - There are 3 spare cells in the crate next to it. Click the crate to take one, then
    click the reactor to load it. A reactor that still has fuel can take a fresh cell too
    ("swap in a fresh cell (wastes the N energy left in this one)"): the old cell is thrown out
    with what's left in it. The inserter upgrade still only loads into an empty reactor, and
    the tutorial's gate only allows loading the empty one.
- **Power lever** (below the reactor): the dial reads LEFT · MID · RIGHT and
  starts on MID. (Since 9r each position points at the gland its branch leaves the dial by: LEFT
  west, MID north, RIGHT east, the handle swinging over the top; the trunk from the reactor comes
  in from the NNW.)
  - In auto mode it steps right after every energy and wraps around: mid → right → left →
    mid …
  - Click the dial to turn it by hand.
  - Click the hub for manual override: a wrench gets wedged into the dial right in front
    of the handle, so it physically can't move on. Click the hub again to pull it out.
  - With E (on hub or handle) nothing happens on the press: let go within 0.5 s and the lever
    steps (or nothing, while the wrench is in); hold E 0.5 s and the wrench goes in (or comes
    out) right then, with the yellow progress ring. The prompt says both ("E: turn lever to
    MID · hold E: wedge the wrench in"). `target.eHold` in clickTarget, run by updateInteraction.
  - Classic 2D look: the wedged wrench stands upright right next to the handle, on the side
    it would step to (matching the sprite).
  - Sprite (`systems/lever_wrench_f<pos>`, tools/blender/models/systems/lever.py): a spanner with a
    yellow grip stands upright in the track, ring end rammed into the groove, open jaw up, 0.42 rad past
    the handle on the side it moves next (pos 0 → towards MID, pos 1 → towards RIGHT, pos 2 → back
    towards MID, since RIGHT → LEFT swings back through it), leaning 10° over the handle; the yellow
    hub cap stays. Was a spanner lying flat in the track, which didn't read as blocking anything.
  - Energy sent to a full or broken capacitor is wasted (you see a puff and a banner).
    Each energy visibly flies from the reactor to its capacitor.
- **Lights:** a zone column's rooms go dark when its capacitor is empty or broken.
- **Inventory:** a weapon slot and an item slot (bottom left).
  - Left-click an object to grab it or use what you're holding on it. A tooltip says what
    a click would do, and you have to be within reach.
  - Grabbing into a full slot drops the old item at your feet.
  - Everything you can pick up (items on the floor, and the fuel crate while it has cells)
    glows, has a slowly turning dashed gold ring and bobs gently. Within reach it gets a
    bright ring and a "CLICK TO TAKE" tag.
  - Items: the fuel cell (item slot), the repair kit (the only one, bottom left of the left
    airlock room) and the laser gun (right airlock room).
- **Hand weapons** (right-click):
  - Laser gun: a fast red bolt, 0.3 s cooldown.
  - Repair kit: throws a wrench, an emergency attack with an 8 s cooldown.
  - Bolts stop at walls.
- **Breakage:**
  - Breakable parts: cannons (at their ladder), shield buttons, capacitors, reactor,
    lever, deck airlocks, outer airlocks, and outside the three shield emitters (9i).
  - Hull hits damage parts in the zone column that was hit: a large hit breaks 1 (30%: 2),
    a small hit breaks one 20% of the time.
  - A broken part is scorched and smoking with a loose panel and a "BROKEN" tag, and it
    stops working. A broken cannon only sparks, a broken
    airlock's doors are stuck, and a broken capacitor neither stores nor gives energy.
  - Repair: hold left click on it for 5 s while carrying the repair kit (a progress ring
    shows; letting go restarts).
- **Invader** (debug menu: I = left airlock, O = right airlock). *Updated in Step 4,
  see "Intruder" there.*
  - A violet six-legged alien with glowing spots. It forces an outer airlock open, then
    roams room to room, using the deck airlocks like the crew (waiting for the doors to
    cycle).
  - Shoot at it and it fights: it keeps about 5 units away, strafes, sidesteps incoming
    bolts (with a cooldown) and spits acid (counts as a crew hit).
  - A wrench stuns it. It has 6 HP (laser 1, wrench 3) and leaves goo when it dies.
  - Breaking things in rooms comes later.
- **Enemy ships:** light turrets swing onto their target before firing, so the shot
  leaves along the barrel. The heavy cannon fires straight out of its barrel. Hitting a
  weapon cable makes the very next shot fizzle (then every second one). Duct-taping the
  windshield takes 10 s.
- **Debug menu:** also B (break a random part) and E (fill all capacitors).

## Step 4 — The first scripted mission (built, waiting for feedback)

The mission starts automatically when the page loads (a debug URL with `#` turns it off).
It's paced for solo playtesting: one encounter per minute, each happening once. In order:
interceptor (random side), maintenance failure, frigate (other side), asteroid swarm,
intruder (random airlock). The jump comes 60 s after the last one (about 5:40).

- **Encounter sidebar** (left edge):
  - A steel header plate shows the mission clock, time to jump, the last radar scan and
    MAX_DAMAGE (now 5) damage lights.
  - Below it, one riveted metal plate per encounter or problem (icon, colored stripe,
    title, status). New plates slide up from the bottom into their slot and stay until
    the problem is dealt with, then slide out to the left.
  - Problems that are actually happening get a pulsing red light and a short alarm chirp:
    enemies (with weak spots hit), the asteroid swarm, the intruder (where it is, its HP),
    each fire (which part, seconds left), each broken part, the failing part and the jump
    drive.
  - Radar contacts get a countdown and an amber stripe, unscanned imminent threats a
    hazard-taped "????" plate, and after a diagnosis the irregular parts a yellow plate.
- **Radar** (click the map table on the bridge): reveals every contact in the next 45 s
  as sidebar plates, for everyone. An unscanned threat 3–8 s out shows a mocking
  "???? T-???" plate.
- **Helm diagnosis** (click the helm):
  - From the start two systems read yellow ("irregular readings"); one of them is the
    real failure.
  - It turns orange with a countdown 20 s before it breaks, and red once broken.
  - Servicing it with the repair kit (hold click for 5 s) while it's orange prevents the
    breakdown.
  - The results stay in the mission panel.
- **Security console** (left cannon room, top wall): a ship map where you can lock or
  unlock every door.
  - That covers the 4 doors between rooms (now real sliding doors), the 3 deck airlocks
    and the 2 outer airlocks. It also shows the intruder and you.
  - A locked door never closes on someone standing in it.
- **No softlocks:** broken doors can be forced with the same manual override.
  - A broken deck airlock: the third bonk forces open the closed door nearest you (it
    stays stuck open).
  - A broken outer airlock: forced, so you get in or out (no getting stranded on a
    spacewalk).
  - Locked doors never close on anyone.
  - Dropped items always land on a room floor (never in a doorway).
  - Multiplayer: an airlock door never closes while anyone is in its doorway (it
    reopens and waits). As a safety net, anyone (crew or intruder) who ends up where they
    can't stand is moved to the nearest free spot instead of being frozen.
  - `tests/softlock.js` re-creates each trap.
- **Manual override:** E at a locked door opens a door-handle picture and a "MANUAL
  OVERRIDE" button. Each click is a fire extinguisher bonking the handle; the third opens
  the door.
- **Locks and the intruder:** it's stopped by locked inner doors (it waits, then picks
  another route), and has to bash a locked outer airlock for 8 s.
- **Hits** (odds changed 2026-10-13; luck used to be much stronger):
  - Small hit: 20% a fire on one of the 3 parts nearest to the hit on that side, 10% a
    broken part on that side, 70% nothing. Never both.
  - Large hit: always breaks exactly 1 part and always starts a fire near the hit.
- **Fires:**
  - Every fire sits on a ship part.
  - Left alone, every ~15 s (11-19 s, random per fire) it rolls: 1/3 it spreads to a
    different part in the same room or an adjacent room (same deck next door, or the room
    across the deck); 1/6 it burns out its part and keeps burning; 1/6 it burns out its part
    and goes out with it (scorch mark); 1/3 nothing. A ring shows the timer.
  - Plasma fires (every 6 s): half burn out their part, half spread.
  - A broken part that is burning can't be repaired (or taped) until its fire is out.
  - The vent panels next to the outer airlocks (bathroom, gym) also vent normal fires, not
    only plasma ones (same PIN-pad override, same hurt for anyone left inside).
  - Big hits start their fire after a possible breach, so never in a room that just lost its air.
  - Fire extinguishers (weapon slot) are on the bridge and in the right cannon room.
    Hold right click to spray; a fire goes out in about 1.3 s.
- **Intruder:**
  - Its routine: move to an adjacent room, walk up to a part and sabotage it for 10 s
    (green progress ring; the part breaks), then the next adjacent room, and so on.
  - It engages when you come within 4.5 units in sight. Its moves are telegraphed:
    - Ready stance (crouched, forelegs up) = it will dodge. Shooting then makes it lunge
      sideways, and afterwards it's off balance for a moment (2.2 s dodge cooldown).
    - Spit: it rears back with a swelling green throat sac for 0.7 s, then spits.
    - Pounce, when you're close: it coils (squeezed, rear wiggling, eyes flashing), then
      leaps. A hit is a crew hit plus knockback.
  - The laser gun's cooldown is 0.9 s, so spraying gets punished.
  - Locked doors contain it: it never bashes a door locked by security. If every way out
    is locked, it wrecks the room it's shut in instead.
  - It only bashes broken or jammed doors (no getting stuck), and the sidebar shows what
    it's doing.
- **Cat:** you can pet the cat (reactor room corner): hearts and a purr. It secretly gives
  60 s of luck. The game never says so (no text, no sidebar plate).
  - Every bad fire outcome gets 10% (relative) less likely, nothing else changes:
    small hits start a fire 18% instead of 20% and break a part 9% instead of 10%, large hits
    start a fire 90% instead of always (they still always break one part); a fire
    spreads 30% instead of 33%, burns out its part and keeps burning 15% instead of 16.7%
    (burning out and going out stays 16.7%, the rest is "nothing").
- **Manual override animation:** the extinguisher winds up and slams the handle. Each hit
  brings a clang word, sparks, a screen shake and a new dent; the handle bends, the plate
  cracks, and on the third hit the handle snaps off.
- **Win / lose:**
  - At jump time the drive needs 1 energy in the middle capacitor (the engine room). Jumping wins,
    even with enemies still around.
  - Having more than MAX_DAMAGE (5; was 3) systems broken at once loses. (There used to be a 15 s
    jump window, "stranded" when it ran out; now there's no time limit, see "Stalled jump, hot zone".)
  - R restarts.
- **Solo tuning:** the interceptor fires every 2.5–4 s.
- **Debug menu:** also M (restart the mission), N (free play), F (start a fire next to you).

## Step 5 — Multiplayer, lobby, two missions (built, waiting for feedback)

- **Lobby** (steel-plate screen): your name (remembered), the mission cards, the crew in
  the lobby, START.
  - Solo, START just plays.
  - Over the network, anyone can pick the mission or start, and everyone in the lobby
    joins that game. People who connect mid-game drop straight in, and leaving drops your
    gear on the floor.
  - After a mission, anyone presses R and everybody goes back to the lobby.
- **Missions:**
  - **Intro run:** the one you playtested. One of each incident, about a minute apart.
  - **Rush hour:** 7 incidents in random order, about 40 s apart, so two more in the same
    time. It's the five from the intro plus two extras drawn from interceptor, asteroid
    swarm and intruder, with random sides, and it never opens with the frigate. A second
    enemy on a busy side lines up further out instead of replacing the first.
- **How it works:**
  - `server.js` serves the files and runs the one shared simulation: a fresh sandbox per
    game with the same game scripts, at 60 ticks/s. It sends snapshots 30 times a second,
    plus the sounds that happened.
  - Browsers send their input (keys, mouse world point, clicks) every frame, plus
    commands for UI actions: security locks, override bonks, the reload button, the debug
    menu. They draw the latest snapshot, smoothing crew movement.
  - In the code, everything per-player now lives on each crew member (input, inventory,
    panels, prompt). The simulation updates crew members one at a time ("acting crew",
    see `withCrew`), so most of the code still just says `player`.
  - Enemies and their shots target any crew member outside, the intruder goes after the
    nearest crew member it can see, and spit and pounces hit whoever they hit.
- **Latency hiding (the simplest form, client-side prediction):**
  - Your own crew member moves the moment you press a key: the browser runs the same
    `updateCrew` as the server.
  - The server's position corrects you only when you've stopped (you glide onto it),
    drifted more than 0.6 units (glide), or are more than 1.5 units off (snap).
  - Hatches and teleports aren't predicted; you follow the server there.
  - The cannon you're manning aims from your mouse locally, by the same rule as the server.
  - Everyone else glides towards their latest server position.
  - There's no input replay or reconciliation yet; that would be the next step if it ever
    feels off.
- Every crew member has a suit color, and the others show name tags.
- Dev: `?mission=rush&autostart` skips the lobby (solo or networked).

## Step 6 — Clean controls, injuries, power lines (built, waiting for feedback)

- **One rule for input:** left click interacts with whatever you point at (airlocks,
  ladders, hatches, shield buttons, consoles, items, treating people), right click uses
  your weapon. Every prompt starts with "Click: …", pointing at its spot shows it, and E
  stays as an unadvertised shortcut. In a cannon: left click fires, hold right click for
  cover, a CLIMB DOWN button leaves.
- **Lifts removed.** Only the deck airlocks connect the decks.
- **Injuries** (`hurtCrew`, `updateInjury`, `updateTreat` in `js/systems.js`):
  - First hit: hurt for 30 s (tunnel vision, 60% speed).
  - Second hit: down (can't move or use anything). Hold click on yourself for 10 s to get
    back to hurt.
  - Hit while down: out. Someone else holds click on you for 2 s. Alone, you can still
    crawl back in 20 s (no softlock).
  - Treating anyone takes 2 s. Enemies and the intruder ignore downed crew.
  - Down in a cannon: you slump in the seat (see 9g).
- **Shields** grow out of their generator in 0.1 s and shrink back into it in 0.1 s.
- **Power lines:** real cables run from the reactor to the three capacitors (since 9r: one trunk into the
  power lever, a branch per output from there) and from each
  capacitor to its shield button and cannon. They glow amber while the capacitor has
  charge, and every spent unit of energy runs down the cable as a pulse. The random
  decorative cables that looked like wiring are gone.
- `node tests/controls.js` covers clicking, injuries, treating and the power pulses.

## Step 7 — A lived-in ship (built, waiting for feedback)

- **Green corner brackets** mark everything you can click (consoles, radar, cat, ladders,
  shield buttons, airlocks, the reactor, lever and fuel crate, locked doors). They're faint
  when you're in the room and bright and pulsing within reach. Decoration never gets them,
  so brackets always mean "usable". Pickups keep their glowing halo.
- **Furniture** (`js/interior.js`, art only; `FURNITURE` in `js/ship.js` makes it solid):
  - Kitchen in the left cannon room: a counter with a sink of dirty dishes, a stove with a
    pot of stew, a microwave stuck at 12:00, a fridge ("WHO ATE MY PUDDING??"), and a
    round table with the pizza and two stools.
  - Bunk beds and lockers in the right cannon room (and a sleeping bag for bunk five).
  - A toilet stall in the left airlock room, lid up, air spiralling into it, under a sign:
    "PLEASE CLOSE THE LID — OR THE AIR RUNS OUT".
  - A couch on the bridge, an exercise bike ("PEDAL FOR BONE DENSITY") in the right airlock
    room, "DAYS SINCE LAST INCIDENT: 0" and "HANG IN THERE" signs.
- **Warm ceiling light** pools on the floors.

## Step 8 — Building IDEAS.md, easiest first

Every new encounter and damage type is switched on per mission (`mission.rules`, and each
mission's own encounter list), so the easy missions stay as they were and the harder ones
get the rest.

### 8a. Small things (`js/hazards.js`, all missions)
- **Snack machine** (left cannon room, next to the kitchen): free, one snack per minute each, and only
  when you're hurt: being hurt ends 10 s sooner.
- **Coffee** at the helm: 15 s of slightly faster walking. Big hits may tip the mug over; it
  refills itself after a minute.
- **Intercoms** in every room: call for help (a "HELP!" plate on everyone's sidebar, 15 s).
- **Ship voice** (speech synthesis, respects mute) for breaches, plasma fires and venting.
- **Rattling panels:** every big hit on a side loosens wall panels there (a warning: the next
  big hit on that side breaches, on missions with breaches).
- **Duct tape** (3 rolls) and **hull plates** (4, crates in both airlock rooms) are counted.
- The **cat** flattens into a fur pancake for ~4 s after every big hit on the ship (the bang
  scares it; read from the synced `combat.decals` large-hit `hot` time, so it works on every client;
  it used to hide during breaches, but the reactor room never breaches) and stares at nearby fires.
  Its sprites (`tools/blender/models/props/cat.py`) were redone as a believable curled-up orange
  tabby: swept body along the curled spine with a haunch, tabby bands driven by mesh attributes so
  they curve with the body (spine stripe, tapering flank bands, ringed tail with a dark tip), a proper
  head (cheek ruffs, cream muzzle, nose, M on the forehead, pink ears with tufts), cream paws under
  the chin; same states, frame counts and origins as before. Its back half then read as a lizard
  (a smooth egg of a thigh stuck onto a tapering rump, a thin whip of a ringed tail, crisp bands,
  shiny skin): the body is now one soft mass (tube + big round haunch + a filler in the curl, voxel
  remeshed and smoothed, no seams or pinch), with fur clumps in the geometry (so the normal map shows
  fur, not skin), matte fur (rough, low specular, a combed-fur bump), frayed soft stripe edges, bands
  arcing round the thigh, and a thick bushy tail with a rounded tip tucked in under the haunch. The
  front half (head, paws, bib) is unchanged. **Emergency lighting** is
  dim red. **Scorch marks** stay where fires burned. The end screen has a **mission report**
  (fires, breaches, repairs, medic of the day, cat pets).

### 8b. Damage types (`mission.rules`)
- **Hull breach** (`breach`): a big hit on a side that's already damaged holes the nearest
  outer room. Blast doors drop on its doorways (deck airlock still works; a manual override
  forces a blast door up for 5 s). Vacuum: visor down, 70% speed, no healing, fires go out
  and can't start, loose items drift to the hole and get sucked out within 8 s (they float
  outside, grab them on a spacewalk), the room's capacitor leaks 1 charge per 20 s.
  Fix: weld a hull plate on from outside (6 s), or tape a tarp over it from inside (15 s,
  1 duct tape; tears at the next hit on that side).
- **Plasma fire** (`plasma`): fires on the reactor or a capacitor with 3+ charge. Violet,
  spreads every 6 s, the extinguisher only pushes it back. Every room has an **emergency
  vent** valve (manual override): 10 s of vacuum blows every fire out, and hurts anyone still
  inside.
- **Power surges** (`surge`, 35% on big hits): a power line arcs. Using its shield button or
  reloading its cannon zaps you (a hit); energy over an arcing feed line is lost. Splice it
  with the repair kit (hold 5 s on the sparks).
- **Gravity failure** (`gravity`, 25% on big hits): a room's floor goes floaty (slow to start,
  slow to stop). Reset the breaker under its floor plate with the repair kit (4 s).
- Generic "hold click" jobs (`target.hold`, `updateHold`) power tarps, welds, splices etc.
- `node tests/hazards.js` covers all of the above.

### 8c. Spacewalk jobs (`js/eva.js`)
- **Limpet mines** (event `mines`): a drone flies in and sticks 1–3 mines on the hull (shoot the
  drone with a cannon first if you can). 30 s each, blinking faster. Pry off on a spacewalk
  (4 s by hand, 2 s with the repair kit), or shoot with the laser (blows early, as a small hit).
  Left alone: a big hit, and a breach on missions with breaches.
- **Spore clouds / barnacles** (event `spores`): shoot the clouds with a cannon; the ones that
  reach the hull seed barnacles. Full grown after 40 s, they drain that side's capacitor
  (1 per 10 s); at 75 s they drill through (breach, or a broken part). Scrape off outside (3 s)
  or burn off with two laser hits.
  They grow ON the hull (playtest: "the barnacles are still next to the ship"): `onHullPlating` puts
  them on the outer wall's top over that stretch (x 0.15 / SHIP_W − 0.15 on the sides, y −2.85 on the
  nose, clear of its corner posts), straddling the outer edge; the sprite is drawn at that wall top's
  height (`hullTopZ`: 1.6, or 0.35 on the low cutaway parts; before, the front ones were hidden behind
  the nose wall and the side ones floated 0.55 out in space). The sprite's `pick` and the targets'
  `hullTop` flag keep clicks, the hover ring and the job marker up there with it. Laser bolts from a
  spacewalk count from just outside the hull (0.75), bolts from inside still never reach them.
  Latched leeches in ?classic now put their mouth on the hull's edge too (the sprites already did).
- **Debris** (event `debris`): a cannon's track is jammed, half its arc, until a spacewalker pulls
  it out (3 s).
- **Antenna** (event `antenna`): radar scans come back garbled until it's straightened outside (2 s).
- **Fuel canister** (event `canister`): drifts past one side for ~45 s; grab it for a spare cell.
- **Jump coils** (rule `coils`): three misaligned coils outside (left, right, stern), 3 s each to
  align. Each one still off when the jump drive spools up adds 15 s.
- Spacewalk jobs get a pulsing dashed ring (brighter in reach). Large prompt zones (airlocks)
  no longer swallow clicks on something more specific under the mouse.
- First version of the hard mission **Deep drift** (all damage rules + coils).
- `node tests/eva.js`.
- `node tests/interact.js`: E and left click both work (airlocks, barnacles, treating, the override).

### 8d. Ship-wide encounters (`js/encounters.js`)
- **Solar flare** (event `flare`): 10 s warning (orange glare), then 8 s of radiation: anyone on
  the upper deck, on a spacewalk or in a cannon is hurt (twice if they stay). Nobody can fire
  meanwhile, us or them.
- **Ion storm** (`storm`): 30 s of darkness (a flashlight cone around you), radar and security
  console show static, and full capacitors arc (lose 1) at the start and every 10 s.
- **Coolant leak** (`coolant`): a heat gauge on the reactor climbs; at 100% the reactor scrams
  (no energy for 30 s). Fix: a coolant canister from the crate in the left airlock room, screwed
  into the reactor (hold 3 s).
- **AI glitch** (`glitch`): every 3 s a door or deck airlock locks/unlocks itself (never the outer
  airlocks). The security console turns into three reboot switches; the right order is shown on
  the helm. Wrong order starts over. Rebooting unlocks what it locked.
- **Stealth fighter** (`stealth`): an interceptor that's nearly invisible; a radar ping lights it
  up for a few seconds, firing gives it away briefly.
- **Tractor tug** (`tractor`): its beam freezes the jump countdown until its emitter (a 4th weak
  spot on a mast) is shot.
- Enemy kinds can now bring their own `draw` / `update` / `drawExtra` (registry in
  `ENEMY_TYPES`), and event kinds their own runner and label (`EVENT_RUNNERS`, `EVENT_LABELS`).
- `node tests/encounters.js`.

### 8e. Station mini-games (`js/minigames.js`)
Per-player state in `ui.mini`; actions are commands `['mini', action, …]` (same solo and online).
- **Radar and helm: no mini-games any more** (removed 2026-10-13, the user found them tedious).
  One click on the map table scans every direction (`radarScan`, mission.js: reveals what comes in
  the next RADAR_RANGE s, lights up stealth fighters; crooked antenna or ion storm: no result).
  One click on the helm shows the diagnosis readings (`openDiagnosis`). (Before: a radar dish you
  dragged to one sector and pinged, and an oscilloscope to calibrate first.)
- **Patch board** (next to the lever): reroute which capacitor each lever output feeds (e.g.
  around an arcing feed line).
- **Tape job:** a quick click with the repair kit on a broken part (instead of holding): drag along
  three cracks. Faster, but taped parts are the first to break at the next big hit.
- **Crank (removed later):** reloading takes 3 s; the crank wheel and holding R used to speed it up. Removed
  ("Just R to reload, and if you want to reload faster there is an upgrade in the weapon specialist track"):
  R (or RELOAD) only, and a weapons specialist in the seat reloads 50% faster (2 s).
- **Held shields:** keep holding the shield button for +2 s (1 more energy). Shields grow by age now.
- **Jump handle** (rule `handle`): when the drive spools up, someone holds the handle at the helm
  for 6 s (two people: faster); letting go resets it. (It used to double the jump window; there is no
  window any more.)
- **Heartbeat:** while treating, a click right on the pulse ring adds 0.5 s.
- `node tests/minigames.js`.

### 8f. Organic enemies (`js/organic.js`)
- **Grappler** (event `grappler`): a squid that throws a tentacle around the hull every ~16 s (2 s
  coil telegraph). While attached: that side's shield can't go up, manned cannons drift (the ship
  turns). 5 cannon hits on the tentacle, or hack it off on a spacewalk (3 s, faster with the
  repair kit). Weak spots (eye, ink sac, beak) heal 15 s after being hit unless all three are hit
  in time.
- **Leech swarm** (`leeches`): 6 leeches fly in and latch on; each latched one breaks a part on
  its side every 20 s. Shells pop them on the way in; a raised shield on that side burns them
  off; spacewalkers can pry them off (1.5 s).
- **Spore mother** (`mother`): puffs spore clouds (barnacles) every 12 s; after each puff one of
  its three sacs opens for 3.5 s — the only time it can be hit.
- **Leviathan** (`leviathan`): 30 s; every 4 s it bumps the next room in a sweep (red warning on
  that room's floor, the sidebar lists the next ones): crew inside get hurt, plus a small hit there.
- Enemy weak spots can be `closed` and react `onHit`; enemy kinds marked `special` are left out of
  the reachability test. `node tests/organic.js`.

### 8g. Other ships (`js/dock.js`)
- **Docking:** a ribbed tube from one of our outer airlocks to a three-room ship (airlock, cargo,
  core). While docked its rooms are part of `walkRects()`, the camera and HUD know them, and the
  outer airlock on that side stays open (no spacewalk prompt there). The tube is airless.
- **Pirates** (event `pirates`): a pirate raider (interceptor with a jolly roger) docks if it
  isn't destroyed within 40 s. Two pirates come aboard: they take loose items and fuel cells to
  their loot crate, and stop to shoot anyone in sight (a red laser sight first). 3 HP; they never
  bash doors, so security locks keep them out. Board them back: their crate has 2 fuel cells plus
  whatever they stole; jamming their reactor's overload with the repair kit (3 s) makes them cast
  off 15 s later — anyone still aboard is cast adrift outside our hull.
- **Derelict** (event `derelict`): airless and dark. A jammed door (manual override), a fire that
  hurts (the extinguisher works), an intruder asleep in the core that wakes when you come close
  (and goes back to sleep there), plus the mission's objective.
- **Objectives** (`mission.objective`, `objectiveStatus()`): `blackbox` (heavy: 60% speed, no
  weapon while carrying it), `rescue` (treat the engineer, they follow your footsteps, safe once
  aboard; a hit downs them again), `ore` (a big asteroid parks in front; drill it on a spacewalk
  with the mining drill, 6 s, bring the sample in), `pirates` (defeat N). Jumping without the
  objective done: survived, but the mission failed.
- New missions: Pirate cove, Black box, Stranded engineer, Ore run, Nightmare (everything);
  Deep drift gets the organic and ship-wide encounters. (Reworked into a campaign next.)
- `node tests/dock.js`.

### 8h. Campaign and progression (`js/progress.js`)
- **Campaign** (`c1`–`c8`), each with a briefing, objective and pay: First Contract (defeat pirates,
  $40 each, no intruder) → Strange Cargo (the intruder appears) → The Empty Lab (black box from
  Dr. Varga's drifting lab) → Red Comet Cove (pirates took her) → Rescue Dr. Varga (pirate prison
  barge) → Spore Season (living rock sample) → The Deep (coils + jump handle) → The Mother of All
  (the leviathan). Each finished chapter unlocks the next.
- **Success** (`missionSuccess`): the ship jumped out AND the objective is done (missions without
  one: the jump is enough). Only a success earns reputation (+1 the first time), counts as finished
  (`profile.done`, the ✔ in the lobby) and unlocks the next chapter.
- **Rewards** (`computeRewards`): if the ship jumped, the crew gets paid (base pay plus per pirate),
  objective or not; XP (full, objective or not) only if you're inside the ship and standing at the
  end. Jumped without the objective: the end screen says "objective failed", shows the pay and
  that the next chapter stays locked. (Before: no base pay and half XP without the objective.)
  `profile.done` always meant "completed with the objective", so no save migration. Each browser
  credits its own player from the synced `mission.over.results` (`creditMission`), so multiplayer
  follows the same rule. Levels at 100/250/450/… XP.
- **Ship upgrades** (reputation, `SHIP_UPGRADES`): spare cell, coffee machine, fuel inserter (with a
  handle to scooch the cells out of its reach), efficient cannons (4 shots), faster airlocks,
  long-range radar, longer shields (3 s; shown as "Longer shields", id `shields`), bigger capacitors (4),
  reinforced hull (MAX_DAMAGE 5 → 6: the ship survives one more broken part; set per mission in
  `applyShipUpgrades`, so it reaches clients and doesn't leak into the next mission), sprinklers.
  Multiplayer: the union of everyone's upgrades.
- **Gear** (money, `GEAR`) and **professions** (level 2+): general gear for anyone (gravity boots,
  thrusters, first aid course, armor vest, stim pack); engineer and weapons specialist, each with a
  gear track (see 8w, 8x). Suit
  color is free, in the lobby. Sent to the server with `hello`.
- **Profile:** versioned, cookie + localStorage, `migrateProfile()` reads any older version (see
  CLAUDE.md). Each browser credits its own player once per run (`mission.runId`).
- **Lobby:** profile bar, Campaign / Skirmish / Practice tabs, briefing, Locker and Shipyard.
- **Practice** (`js/practice.js`): free play with a panel of ~60 buttons for every encounter, damage,
  mini-game, rule and tool. `tests/progress.js` runs every button.
- Changes from feedback: no vent valves or intercoms. Plasma fires only happen in the two lower side
  rooms (well charged capacitors), never spread out of the room, and are vented with a manual
  override on the panel next to that room's outer airlock (it only lights up then). While such a room
  has no pressure, its blast door to the reactor room is sealed for real (the cat lives there). The
  patch board only works when a feed line arcs or a capacitor is broken.
- Fixed: the first frame could tick with a negative dt; the diagnosis crashed in missions without a
  maintenance failure.

### 8i. Music per mission, jump mid-battle, visual pass
- **Music** (`js/music.js`): one synthesized piece per mission (11: the intro, rush hour, each
  campaign chapter, practice; skirmishes reuse their chapter's), each with its own tempo, key,
  progressions, sounds and a seeded melody. The arrangement follows the mission instead of a fixed
  form: pads → arpeggio → bass + hats → drums + lead → in the last stretch a second lead an octave
  up, double-time hats, crashes, opening filters. Threats push it up; a riser and snare roll while
  the jump drive spools. `node tests/music.js` runs every piece against a fake WebAudio.
- **Jump mid-battle:** the last event of every mission is a fight, and the jump comes 22 s after it
  starts (was 60 s after the last event). Jumping out plays a warp-streak effect before the results.
- **Visual pass:** removed decor that wasn't clearly anything (tape and patches on the outer hull,
  soda cans, wrappers, tape scraps, stains, loose wrenches, tape rolls, stray cables, the bucket);
  the toilet is clearly a toilet, spare suits stand in labelled wall racks, the bike is a
  treadmill, the coolant crate is labelled.

### 8j. A working treadmill
- The treadmill in the right airlock room works: step on from the back (handlebar and side rails
  block the other ways), and the belt carries you back — walk to stay on, stand
  still and it drops you off the back. The belt runs at half the walker's own speed. `canStand` now also checks the middle of the crew box
  against solids, so thin things (the rails) block.

### 8k. Music player and the final hit
- `music.html` (♪ MUSIC in the lobby): pick any of the 11 pieces and play it along a simulated
  mission (3/5/7 min, ×1/×4/×10 speed), with an enemies-on-screen toggle, a JUMP NOW button and a
  manual intensity slider.
- The jump now ends the music: on the next downbeat a crash, a low boom and the home chord, then
  quiet (`music.jumped()`). Because the arrangement follows the time left until the jump, each
  piece fits any mission length, including delays (tractor beams, misaligned coils).

### 8l. No accidental shot when climbing into a cannon
- The click on the ladder used to fire the cannon right away (the button was still held). Now the
  cannon only fires after the button has been released once since climbing in (`player.gunReady`,
  tracked in the simulation, so it works online too).

### 8m. Every weak spot is hittable
- The grappler's eye and ink sac sat fully inside its body outline, so a shell always stopped on the
  body first: it could not be killed. All three weak spots now sit on the edge facing the ship.
- `tests/reachability.js` now covers every enemy kind (the grappler with its tentacle free to get
  in the way, the spore mother at whichever sac is open): each weak spot is hit by aimed cannon fire
  within 10 s over random sway patterns (all 49 within 2.3 s). The `special` exclusion is gone.

### 8n. Enemies queue up on a side; the grappler reworked
- **Queues:** several enemies on one side line up one behind the other (spaced by how far each
  sways, so they never overlap). Defeat the one in front and the next slowly moves up into its
  place. Shots at the one behind may be blocked by the one in front. `tests/queue.js` checks every
  pair of kinds on both sides: no overlap, the front one fully hittable, and after it's down the next
  one moves up and is fully hittable.
- **Grappler:** the tentacle takes one hit (was 5 — a minute of reactor time). While attached it
  blocks that side's shield and its acid eats the hull plate (30 s; shown as a ring at the grip).
  Too late: it rips the plate off (a breach, or a big hit without the breach rule) and swims away
  munching on it — the end of that encounter. Weak spots now each switch something off while they
  heal (20 s): the poison sac pauses the acid, the eye stops new throws, the beak stops it spitting
  acid at spacewalkers on its side. All three at once still kills it. No more cannon drift.
- New art: smooth tapering arms with suckers, fins, a slit-pupil eye that shuts when hit, a sloshing
  poison sac, hooked jaws that open before spitting, an acid stain and bubbles at the grip.

### 8o. Organic deaths, a readable poison sac
- Organic enemies (`D.organic`: grappler, spore mother) don't burn when they die: they deflate,
  wobbling and sagging, while slime jets out of their torn organs, with a wet squelch
  (`sfx.squelch`). Their weak-spot hits splash green instead of sparking, and hit organs don't smoke.
  Leeches and barnacles pop in green slime (`slimeBurst`).
- The grappler's poison sac is now a big round bulb on a fleshy stalk: toxic green sloshing with
  bubbles, veins, a skull mark and a drop forming underneath (shrivelled and leaking when hit). Its
  beak is a pale, hooked chitin beak.

### 8p. Hull holes you patch on a spacewalk; a squid-shaped grappler
- A hull breach is a visible, torn hole in the hull wall (one hole across the wall's inner edge,
  seen from inside and outside). Fixing it from outside takes two steps: click to hold a hull plate
  over the hole, then hold click with the repair kit to nail it down (6 s). The patch stays visible
  for the rest of the mission: a scuffed plate with a few nails (one or two bent).
- The grappler always grabs the upper room on its side (left / right cannon room), right where that
  room's hole is; if it rips the plate off it's always a real breach there (any mission).
- Its anatomy is a squid's now: the beak at the base of the arms, the eye just above it, the poison
  sac up on the mantle's flank (a veined translucent bladder with glands, no symbols); the grabbing
  arm comes out from among the arms.

### 8q. Fires on their own clocks
- Every fire rolls its own time until it next spreads or burns its part out: 75–125% of the usual
  15 s (plasma: of 6 s), re-rolled each time. So a spreading fire and the one it started no longer
  tick in step. The ring under each fire and its sidebar countdown show its own time.

### 8r. The spore mother, huge
- It's a backdrop now (`D.backdrop`): a vast creature filling its side (12 × 17 units, far out), so
  you only ever see its near flank; it barely sways. Other enemies on that side stay in their queue
  in front of it, and it gets no off-screen arrow.
- Three mouths that are recesses in the body: shut, a creased seam; open, the flesh parts into a deep
  red gullet framed by puffy lips of its own hide. After each puff one opens and its blue tongue tosses
  the spores one at a time: it reaches back into the gullet, comes out with a spore on its tip and
  flicks it at us — twice — then hangs out. The tongue is the weak spot while the mouth is open
  (4.5 s). A torn-out tongue leaves the gullet bleeding slime.
- Decoration only: cilia waving in travelling waves all along its edge, mottling and pores, veins
  running to the mouths, and eyes that blink and look towards the ship.
- Only one giant per side (a second spore mother goes to the other side). Ships flying in front of
  it always get hit first: a shell only stops on the backdrop if no other enemy is just ahead of it.
- Fixed while at it: placing a backdrop in a side's queue gave it no position (NaN).

### 8s. Visible pirates, free snacks
- Pirates (and the rescued engineer) were drawn together with the docked ship, before our floors, so
  on our ship the floor covered them: they turned invisible as soon as they came aboard. They're
  drawn with the crew now (`drawDockActors`), in a brighter red suit with a red halo and a PIRATE tag.
- The snack machine is free: one snack per minute each, only when you're hurt (ends it 10 s sooner).

### 8t. Pirates aim, loot and leave; enemies on the security map
- Pirates fight like gunslingers now: they stop and aim, a faint laser sight tracking you, which then
  locks (bright, flickering) for the last 0.6 s; after 2 s a very fast shot (30 units/s) goes down the
  locked line. Dive behind a wall (or just out of the line) when you see it. If they lose sight of you
  while tracking, they give up the shot. Then a 5 s cooldown — your window to hit them.
- They loot two things each (or fewer if nothing's left), carry them to their crate, then head home.
  Once every pirate is back aboard, their ship casts off with the loot 4 s later.
- Security console: red blips for enemies (intruders, pirates), blue for friends (crew, the engineer).
  `tests/dock.js` covers aim → shot timing, dodging by diving out of the line, the cooldown, leaving.

### 8u. The other newer threats: defeatability checked, art polished
- `tests/threats.js`: a simulated gunner that only aims at what a player could see kills the stealth
  fighter (aiming at where it was last seen) within ~15 s, shoots the whole leech swarm on its way in,
  downs the mine drone before it plants its mines, and pops the spore clouds before they stick — on
  both sides. The leviathan (unkillable on purpose) warns at least 3 s before every bump.
- Art: the interceptor drawing takes a paint job (`D.paint`). Pirate raider: black and gold, welded
  scrap patches, a fluttering skull flag and a docking claw. Tractor tug: work-yard yellow with hazard
  stripes. Stealth fighter: matte black-blue with a heat shimmer that's just about visible even when
  it's cloaked. Leeches: fat ringed worms with round toothy mouths and slime trails (bigger, hit area
  to match). Limpet mines: spiked, with a hazard band and a red glow when they blink. Spore clouds: a
  clump of glowing pods with hair-thin feelers (bigger). Leviathan: a whale of the deep with flippers,
  a fluke, throat grooves, barnacle crusts, rows of glowing spots and a huge eye, gliding just outside
  the hull.

### 8v. No more spare suits on the map
- Removed the spare-suit wall racks from both airlock rooms: the "SUIT" labels were odd and the
  suits looked too much like crew members.

### 8w. Profession tracks, keyboard controls, simpler reactor
- **Removed:** the auto-doc and second repair kit ship upgrades (they fit better as personal
  upgrades, and the professions already give starting gear), the paid suit paint (the suit color is
  now a free pick in the lobby, also shown in the multiplayer crew list), and the fuel-seating
  mini-game (clicking the empty reactor with a fuel cell loads it).
- **Professions with gear tracks** (track gear only works in its profession; `perk()` checks):
  - Engineer: repairs 20% faster. Own repair kit (first track upgrade, level 2): start with one, on
    top of the ship's. Toolbelt: another 25% (was 30% on every hold job
    for anyone). Reactor overcharge: click the reactor to run it at double speed; each energy has a
    10% chance to set it on fire. Anyone can switch it back off there.
  - Combat medic: treats crewmates in 1.2 s (was 1 s; the auto-doc's number), self in 6 s. Trauma
    kit: 0.7 s. Stim pack: self in 3 s. Painkillers: hurt slows you to 80% instead of 60%, and wears
    off in 15 s instead of 30 s.
  - Weapons specialist (was Security): fires 35% faster. Own laser gun (first track upgrade, level
    2): start with one, on top of the ship's. Heavy blaster (starts you with it instead): 1-2 damage at 66%
    of the laser's fire rate; hold to charge (1.5 s) a 3-damage blast, which on a spacewalk also flies
    on as a cannon shell (hits ships, asteroids, drones, leeches like the ship cannon). 85% walking
    speed while carrying it, 30% while charging.
  - Gunner: unchanged.
- **Gravity boots:** where the gravity failed you still walk (not float), at 80% speed.
- **Capacitors** hold 3 (the bigger capacitors upgrade: 4).
- **Keyboard:** WASD walks; the arrow keys aim in 8 directions while held (else you face the way you
  walk); Space fires the weapon that way (also sprays the extinguisher, charges the heavy blaster).
  E does what a click would on what's highlighted: under the mouse, or else the nearest thing in
  reach, found by probing `clickTarget()` around you (hold E for repairs, treating and hold jobs, tap
  E for a tape job). The prompt shows "E: …" and the target gets the dashed ring.
- (8x below changes the medic and gunner again.)
- Profile v2: drops the old paint gear, auto-doc and second kit, renames Security to Weapons
  specialist.
- **Fuel vs. mission length** (normal speed: a cell = 5 energy = 100 s; 4 cells = 400 s): missions
  jump at 247-312 s, so 1-1.5 cells are left over. Always overcharged, the 4 cells last 200 s, short
  of every mission. Fuel left as it is for now.

### 8x. Two professions: engineer and weapons specialist
- **Gunner removed:** it had no track. Its faster cannon cranking (50%) now belongs to the weapons
  specialist, whose first track upgrade starts you with your own laser gun (then the heavy blaster).
- **Medic is gear now:** there weren't enough medic upgrades for a track. The general gear (the
  locker's "General" section) has the **first aid course** (was the combat medic: treat crewmates in
  1.2 s, patch yourself up in 6 s) and the **stim pack** (patch yourself up in 3 s). The trauma kit
  and painkillers are gone.
- Profile v3: Gunner → Weapons specialist, Medic → no profession plus the first aid course; trauma
  kit and painkillers dropped.

### 8y. The saboteur (stealth) and the alien (fight)
- **Two boarders with their own jobs** (`js/invader.js`, `boarding.invaders`, `kind` 'alien' / 'saboteur'):
  the alien is the fighter, the saboteur the sneak.
- **Alien:** no more sabotage. It hunts: it heads for the room of the nearest crew member aboard
  (re-planned when they change rooms) and attacks whoever it sees within 8 units; it keeps hunting
  after losing you for 3 s. Nobody aboard (all on a spacewalk): it prowls room to room. Doors locked by
  security still contain it: it gives up on that way for a while and paces about (it breaks nothing).
- **Saboteur** (event `saboteur`, practice button "Saboteur (left airlock)"): forces the outer
  airlock (picks a locked one in 6 s), steps in and cloaks (0.8 s fade, still hittable), sneaks unseen
  for 3.5-5 s and decloaks next to a random intact part in one of the two rooms next to that airlock
  (you know the airlock, not the room). Then it works on the part: **12 s solo** (just enough to run
  over from the other room), **2 s with 2+ players** (only someone already in that room gets there), plus
  the 0.8 s decloak. Done: the part breaks, it cloaks and pops up next door to where it was.
- Caught at it (anyone within 5 units in view, a hit or a near miss): it stops and fights, weakly:
  backs off to 5-7 units, edges sideways, and every 3.5-5 s aims a laser sight for 1 s (cyan, then
  flickering red) and fires a slow (4.5 u/s), fat cyan plasma ball: a step aside dodges it. 3 hp; at
  1 hp it tries to cloak away. Out of sight for 3 s: it cloaks and moves on.
- **Security decides where it can go:** it never goes through a door or deck airlock locked by
  security. Lock one way out of the airlock room and you know where it will turn up; lock both and it
  sabotages the airlock room itself. Locked while it sneaks over: it's stuck in the room it left.
- Shown: sidebar plate (cloaked / wrecking X · n s / attacking), a progress ring on the part, no blip
  on the security map while cloaked, a body where it died. Events: rush hour, deep drift, stranded
  engineer, nightmare and campaign chapters 7 and 8 can roll it; chapter 2's briefing now says the
  alien hunts you.
- Art: `tools/blender/models/chars/saboteur.py` (slate stealth suit, egg helmet with a glowing visor
  slit, cloak emitter on the back, light strips through the tint mask: cyan calm, red fighting;
  idle, walk, aim, sabotage, stunned, down), **packed into the chars atlas** (29 sprites, 4.7 MB;
  the alien, pirate and Dr. Varga entries are unchanged). Its raw renders were merged into the
  laptop's build/renders/ (as of dbf51f4; the manifests had no overlap). If its sprites are missing
  (still loading), the sprite view falls back to a stand-in (a greyed, half see-through crew suit with
  a glowing visor); ?classic draws a 2D figure. The work's progress ring is round its feet (a ring on a
  big part like the reactor would be hidden under it).
- Debug menu: "Saboteur through the left / right airlock" (click the row; `I` / `P` clash with the
  key codes of i / p). Practice: "Saboteur (left airlock)".
- **Travel times** (`tools/travel.js`): walks a crew member through the real game (walking speed,
  furniture, doorways, deck-airlock cycles) on an A* route, steering with WASD like a player. Between
  rooms, parts / stations or points; best case (airlocks open towards you) and worst (wait a cycle).
  Room middle to middle: next door 3.7-5.4 s (7.5 s when the airlock has to cycle), the far corner
  11-13 s. tests/saboteur.js checks the saboteur's timers against these numbers.

### 8z. Airlock vent PIN pad; at most 8 players
- **Vent PIN pad** (js/minigames.js, js/hazards.js). The vent panel next to a lower side room's outer
  airlock no longer uses the door-bashing manual override (all other overrides still do). It opens a
  keypad with a little green terminal display ("MANUAL OVERRIDE — OPEN AIRLOCK / ADMIN PASSWORD: ****"),
  and stuck crookedly next to it is a yellow sticky note with the admin password: a fresh random 4-6
  digit code each time. The joke is that the password is right there; the mini-game is just typing it
  in, with the on-screen keys or the number keys (Backspace / CLR correct, Enter / OK confirm). A wrong
  code flashes ACCESS DENIED and clears; the right one shows ACCESS GRANTED, then both airlock doors
  open. The operator's visor is down, so they're not hurt; everyone else still in the room takes one
  hit the moment it opens (no extra damage from the vacuum afterwards). Like the other mini-games it
  lives in ui.mini and every key press is a ['mini', 'pin', …] command, so it works the same solo and
  on the server; while the pad is open, the digit keys go only to the pad. Tests: tests/pinpad.js.
- **At most 8 players** (server.js MAX_PLAYERS: 8 spawn spots, 8 crew colours). A 9th browser is told
  the server is full and plays solo; once someone leaves there's room again (tests/network.js).

### 8z2. Main menu and several games per server
- Opening the page shows a **main menu** over the darkened ship: the MANIFOLD NOVUM title, a "Your crew
  member" plate (name, level / XP / money / reputation, suit colour, Locker, Shipyard, Music) and a
  "Play" plate with **PLAY SOLO**, **OPEN A GAME** and a live list of the server's games (colour dot,
  "‹host›'s game", mission, in lobby / in mission, players n/8, JOIN or FULL at 8/8). Without a server
  the list says so (and how to start server.js) and solo works as before. Side by side on wide
  screens, stacked in a narrow window.
- The **game lobby** is its own screen: one scrolling mission list on the left (Campaign, Skirmish,
  Practice sections; **only unlocked missions**, for you or anyone in the game, so later chapters
  don't spoil the story: a quiet "More chapters unlock as you go." instead); briefing, crew (HOST
  badge), Locker / Shipyard and START on the right; "‹ LEAVE GAME" (or "‹ MENU" solo).
- **server.js** keeps a `games` map; each game has its members (join order), phase, mission, own
  simulation and 60 Hz timer, capped at MAX_PLAYERS = 8. Messages in: `open {mission}`,
  `join {game, ticket?}`, `leave`; out: `games`, `joined {game, ticket}`, `full`, `gone`; `lobby`
  carries `game`, `host` and per-player `host` / `away`.
- **Host:** the earliest member still in the game; only the host picks the mission and starts. If the
  host leaves, the next member takes over. A game closes when its last player leaves. Late join and
  leaving mid-mission work as before (reloading mid-mission leaves the game).
- **After a mission** everyone comes back into the same game's lobby: the page reloads for fresh state,
  with `{game, ticket}` in sessionStorage `mn-return`; the server keeps a reloading player's seat (and
  host role) for 15 s after a mission ends. `?mission=X&autostart` opens a game with X and starts it
  (solo without a server). No profile format change.
- Note: tests/encounters.js fails about 1 run in 10 ("doors lock themselves"): it's random (the AI
  glitch), not new; worth making deterministic.

### 8z4. Menus in the ship's metal (`js/menugl.js`, `assets/ui/`, `tools/blender/models/ui/ui.py`)
- **Pieces** modelled in Blender in the ship's materials (worn blue-grey paint, grime, scratches, dark
  steel lips, hex bolts, rivets), rendered at 70° (slightly from above) so side walls, bevels and the
  plate's thickness show: a chunky 9-slice plate with a chamfered rim and raised worn lip, a panel fill
  tile, brushed-silver raised buttons (big / small, each with a pushed-in `_down` render), the red START
  button with a hazard-striped collar, deep recessed wells (lists, briefing, inputs, XP bar), suit-colour
  swatches (tint mask), LEDs, a strip of duct tape and brass name plates (CREW 07, FLIGHT OPS, BRIEFING,
  STORES). Files: `<name>.png` (beauty), `.nh.png` (normal x/y, height, coverage), `.m.png` masks and
  `ui.json` (sizes, slices, heights); 1.1 MB. Re-render: `blender -b --factory-startup --python
  tools/blender/models/ui/ui.py [-- quick] [-- piece …]` (~15 s on the CPU); Blender's numpy writes the
  game files straight into `assets/ui/` (no pack.py step).
- **Renderer:** a small WebGL2 renderer per menu layer (lobby, shop), separate from js/gfx.js (flat
  screen-space pieces that only redraw on change). Pieces are drawn from the DOM's bounding boxes (the
  DOM stays the source of truth: real buttons, inputs, crisp text, keyboard focus), clipped to scrolling
  ancestors; a G-buffer pass, then lighting: ambient with contact shading, a key light with soft cast
  shadows marched through the height buffer, ambient occlusion, up to 8 point lights and specular.
- **Lighting and states:** a warm hand lamp follows the mouse (dim over the plate, bright on a hovered
  button, moving highlights on bevels and bolts); pressing (pointer or Space / Enter) sinks the button
  (lower, darker, shadow gone, label 1 px down); chosen missions / gear are latched in with a lit LED and
  a small green glow; disabled buttons are dimmed metal with greyed labels; the chosen suit colour is
  pushed in with a ring. **Colour only where it means something:** every button face is silver except
  START MISSION (red); status colours stay (server dot, LEDs, HOST badge, swatches, warnings).
- **Layout:** an 8 px grid; plates with a 28 px frame + 18 px padding; primary buttons 68 px, secondary
  56 px, START 64 px; the crew plate's stats on three lines; panelling fitted per plate (at most 540 px
  per panel, so the menu plates are seamless at 1280 px); the briefing scrolls in its own well so START
  stays on screen at 1280×800; narrow (400 px): one column, two buttons per row.
- **When it draws:** on DOM changes, resize, scroll, hover / press easing and mouse moves, coalesced and
  throttled by measured cost; nothing while a mission runs.
- **Fallback:** `html.metal-css` (no WebGL2, `?classic`, `file://`, while loading, `?nometal`): the same
  textures as CSS border-images / backgrounds with :hover / :active states.
- The page's server-connection timeout is 4 s now (was 2 s): a busy headless page missed it.
- Nits left: shadow dither on the LEDs' bezels; one seam behind the game list on tall Play plates; the
  lobby's two columns end at different heights; scrolled shop text can touch the plate frame.

### 8z3. Fixed-length missions: the crew size sets the encounters; energy in spec; prerequisites
- History: first the gaps between encounters scaled with 1/√players (and the reactor with them); the
  model then showed busy time falling 68 % → 25 % from 1 to 4 players, and calibrating gaps alone to
  68 % idle made solo missions 18-35 min long. So now the length is fixed and the event count varies.
- **Length:** every mission jumps at `MISSION_LENGTH` = 360 s (or `MISSIONS[id].length`), for any crew.
- **Per crew size** `MISSIONS[id].crew` (fitted by `node tools/balance.js --calibrate`; first for ~68 % idle, now for
  the ramped targets in the Balance section below):
  `events` (how many encounters), `cells` (fuel cells, counting the one in the reactor), optional
  `reactor` (an ENERGY_TIME multiplier < 1 where the energy needs it) and `overcharge` (the model plans
  with an overcharging engineer; the game never overcharges by itself). Arrays for 1-8 players.
- **Which events go:** never the essential ones (`MISSIONS[id].essential`: pirates in c1 / c4 / Pirate
  cove, the intruder in c2, spores and leeches in c6; plus `ESSENTIAL_KINDS`: derelict, rock, prison
  barge, leviathan), then optional ones in a fixed `DROP_ORDER` (canister, antenna, debris, glitch, storm,
  coolant, maintenance, flare, spores, mines, leeches, grappler, tractor, stealth, saboteur, mother,
  intruder, swarm, frigate, interceptor, pirates): a solo run of a chapter always has the same kinds, and
  a smaller crew's events are a subset of a bigger crew's. Above the written count: repeats of the most
  important optional kinds.
- **Layout:** the kept events stay in written order, spaced evenly from the first event's written time
  to 338 s; the finale is a fight that isn't an objective's. Reactor: ENERGY_TIME × gap / the written gap
  × `crew.reactor` (`paceFactor()`). Fuel: `crew.cells` (the spare-cell upgrade adds one on top).
- **Join / leave:** during the lead-in the timeline is rebuilt for the new crew size (that's also how the
  server's start works); after the first encounter events and the jump stay, the crate only gets more
  cells if the new size needs them.
- **Prerequisites:** `MISSIONS[id].needs = { ship: [upgrade ids], overcharge }`; `missionRequirements(id)`
  shows them in the lobby briefing ("⚠ Needs: Efficient cannons", "⚠ Needs an engineer with reactor
  overcharge"). A warning, never a block. Early missions (intro, practice, c1, c2) must be in spec on the
  base ship.
- **The model** (`node tools/balance.js`, ~3 min; `--calibrate` ~15 min, `--base`, `--detail <mission> <n>`,
  `--hit`, `--target`): builds the timelines through the game; crew jobs = walks (tools/travel.js) + work,
  now including the radar (a 9 s scan at the map table; the next is due when a seen contact arrives, else
  90 s later), the helm diagnosis, every lever re-route (walk + step + hold E 0.5 s), fetching fuel cells
  and overcharge fires. **Energy runs on the game's own code** (reactor, lever, capacitors, reloadCannon,
  pressShield with the 15 s shields, the jump drive, storms, barnacles), checked against a direct game run.
  **In spec** = on every random build: no cannon waits > 2 s for energy before the jump, no shield pressed
  without energy, MID has the jump's energy within 30 s; checked with realistic and with perfect routing.
- **Results** (as of this calibration, hit rate 0.6, 68 % for every mission: superseded, see the Balance section
  below for the current targets and numbers; events / idle for 1/2/3/4/8 players; spec for 1-4):

  | Mission | Events | Idle % | Spec 1-4 | Prerequisites |
  |---|---|---|---|---|
  | Intro | 2/5/6/11/21 | 72/66/73/67/71 | in | none |
  | Rush hour | 2/4/8/9/18 | 66/66/60/67/70 | out at every size | overcharge |
  | Ore run | 2/5/8/12/23 | 63/70/70/68/75 | in | cannons + inserter + overcharge |
  | Pirate cove | 2/4/8/12/23 | 57/69/66/68/74 | in (×3: 1 of 6 builds short) | cannons |
  | Black box | 2/5/8/11/23 | 62/71/70/68/69 | in | cannons |
  | Stranded engineer | 2/4/7/10/24 | 61/65/68/69/69 | in (×3 borderline) | none |
  | Deep drift | 1/1/1/1/19 | 65/78/85/89/65 | in | none |
  | Nightmare | 1/2/3/3/15 | 65/73/71/80/66 | out at ×3/×4 | all three + overcharge |
  | c1 | 3/4/8/12/21 | 54/75/71/67/73 | in (reactor ×0.5-0.85) | none |
  | c2 | 2/2/7/8/20 | 70/83/68/74/70 | in (reactor ×0.7-0.85) | none |
  | c3 | 2/5/8/11/22 | 62/71/67/69/69 | in | none |
  | c4 | 3/4/7/11/23 | 41/68/70/68/72 | in | cannons |
  | c5 | 2/5/9/13/22 | 65/66/68/68/79 | in | cannons + inserter |
  | c6 | 4/5/9/11/23 | 42/68/67/73/74 | in (×2: 1 of 6 short) | all three + overcharge |
  | c7 | 1/2/3/4/19 | 64/72/66/69/68 | out at ×2-×4 | all three + overcharge |
  | c8 | 1/3/3/4/21 | 65/61/69/59/68 | out at ×2-×4 | all three + overcharge |

  ("all three" = efficient cannons, fuel inserter, bigger capacitors; checked against the rep the
  campaign has paid out by then.) Playtest anchor: intro, 2 players, old pacing → 60 % idle (the user:
  "good for two, but 3 attempts"); the 68 % target is a bit easier. At hit rate 0.5: idle 68 → 65 %,
  energy in spec 29 of 48 cases instead of 48 of 64 (the energy spec is the sensitive part).
- **Open:** solo crews get very few encounters (1-4); Pirate cove, c4 and c6 solo can't reach 68 % (their
  essentials alone keep the crew busier); Rush hour is unlocked at 0 rep but needs overcharge and is
  still short solo / 2; The Deep, The Mother of All and Nightmare overrun the energy even with 3-4
  encounters (fewer energy-hungry kinds needed). With idle levelled, chapters differ only by content:
  give tiers lower idle targets (`--target`) to make later chapters harder again. Not modelled yet:
  raising the 15 s shields against light fire; the energy chain itself breaking.

### 9. Prototype: Blender sprites in a tilted top-down view (not in the game yet)
- Goal: replace the hand-drawn canvas art with pre-rendered Blender models that look finished.
  View: orthographic, 50° above the horizon, not rotated (rooms stay rectangles, WASD stays
  screen-aligned). Decided against true 45° isometric.
- Pipeline: `tools/blender/mn.py` + `README.md`. Each model is a Python script (no .blend files)
  that renders beauty, world normals, height and (for recolourable parts) a tint mask into
  `build/renders/` (not in git), with `manifest.json` giving sizes and ground origins. 96 px per unit.
- Packing (`tools/sprites/pack.py`, format in `tools/sprites/README.md`): the raw renders (~485 MB of
  PNG) become WebP atlas pages per group in `assets/sprites/<group>/` plus `assets/sprites/sprites.json`
  (~25 MB): scaled per group (96 px/unit inside the ship, 72 for the hull exterior, enemies and organic;
  normal/height maps at half that), trimmed, frames that share pixels stored as small patches on a
  base frame, beauty lossy q88, normals lossless 6-bit (lossy smeared them), height/mask lossless.
  `pack.py <group>` repacks one group; `verify.py` rebuilds every frame from the pages and diffs it
  against the renders. `prototype2/` now loads the packed atlases.
- Three prototypes, each built by its own sub-agent: the crew member, the reactor room (reactor,
  floor, walls; near walls cut down to 0.35 so they don't hide the room), and the interceptor
  (weak spots line up with the game's hit shapes). A fourth built `prototype2/`: a WebGL viewer
  that lights the sprites at runtime from the normal/height maps (reactor glow, red alert, muzzle
  flashes, blue weak spots), with depth from the height map.
- Open: whether to go this way for the whole game, the key light direction, how the ~18 MB of
  renders (and many more for the full game) should be stored.
- **Status 2026-10-12 (paused overnight):** the user loved the reactor and interceptor and asked for
  everything in that style. Ten sub-agents (one per group, shared rules in `tools/blender/BRIEF.md`)
  modelled the whole game. All their scripts are committed. Sprites committed: crew, ship, items, fx,
  systems, dock, props, interior. Rendered but NOT committed yet (size, ~200 MB as PNG): enemy, hull,
  chars. Organic (grappler, spore mother, leviathan, leeches, spores, barnacles, goo) was stopped
  mid-way: its scripts are committed as work in progress, the renders are partial.
- Next: finish organic (then `pack.py organic`), add the crew's down pose and worn gear, then
  integrate the sprites into the game (camera at 50°, y-sorted drawing, runtime lights from the
  normal/height maps, click areas for raised objects). Each agent's report notes are summarised in its
  model scripts' headers and the manifest `note` fields.

### 9a. The sprites in the game (first part)
- `js/gfx.js`: WebGL2 renderer under the 2D canvas (instanced quads per atlas page, lazy page loading,
  per-pixel lighting and depth from the normal/height maps, bloom; API in its header and in
  `tools/sprites/README.md`). `js/lights.js`: this frame's lights (room ambient per zone column from the
  capacitors, ceiling lamps, reactor glow, muzzle flashes; to be refined). `js/sprites.js`: what is drawn
  with sprites: hull body, floors (zone tiles mixed by a hash), walls built from the room layout (back
  walls full height, near walls cut down, up-down walls stepping down before a near wall, junction
  pieces), the spine, deck airlocks, doors, outer hatches (inside), cannons and the crew.
- The camera is tilted (screen y = ground y × sin 50°) whenever the sprites are on; mouse picking maps
  onto the ground plane, and the crew can be clicked on their body (`GFX.pickAt`). Everything not
  converted is still drawn by its old 2D function, into a 2D layer at ground level (see render() in
  `js/game.js`): before the crew → composited under the crew and over the walls; after → on top.
- `?classic` keeps the old look; it's also the fallback without WebGL2 / from `file://`, and what the
  tests and the server use. Overview with ~560 sprites: ~6 ms a frame at 2560×1600 (classic 2D: ~20 ms).
- (The front cannon and its gunner now stand on the nose's roof: see 9c.)

### 9b. Lighting from the game state (`js/lights.js`, shading in `js/gfx.js`)
- Power per zone column: with charge, warm ceiling lights (LIGHTS; no visible fixture in the cutaway, see
  9c) light from above, plus bulkhead lamps on the back walls (WALL_LAMPS); without, they die and red emergency strips along every wall base light the rooms low and
  grazing (lit sides, dark centre), with amber markers at the doors and faint suit lamps on the crew.
  Lamps flicker back on when power returns (the wall lamp sprites follow). Ion storm: lamps out, flashlights.
  Consoles run on their column's power: without it their screens are off (`systems/*_off`) with an amber
  standby LED, so they can still be found.
- Outside: low cold ambient + a distant star from the front right (the baked key's side); a solar flare
  makes it glare.
- Alarms (rules in `alarmState()`): yellow for any fire on board; red 1 at MAX_DAMAGE - 1 broken
  systems, a hull breach or a hull side with 2+ big hits; red 2 at MAX_DAMAGE broken (one from losing
  the ship). Rotating beacons on each room's back wall (two real spot beams with shadows), an ambient
  pulse, lamps dimmed under red (rooms stay readable), a slow red strobe at red 2; a pill in the top bar.
- Dynamic lights: fires (flicker, plasma violet), reactor (pulse, overcharged whiter, broken sparks),
  screens, capacitors, shields, muzzle flashes, bolts, shells, enemy shots, explosions (fx particles
  clustered), sparks of broken systems, surges, power-line energy, enemy weak spots and engines, the
  leviathan's spots and eye, the jump drive spool, nav lights. Docked derelict: dark with dying strips;
  pirate ship: warm lamps (the old 2D derelict darkening and fire floor glow are classic-only now).
- Renderer: tiled forward lighting (up to 255 lights on screen, 31 per 64-px tile; point, spot and strip
  lights) and screen-space shadows marched through a depth buffer (first last frame's, reprojected; now
  this frame's, see below). Overview at 2560×1600 with ~55 lights, red alert, fires: ~130 fps (shadows off ~140).
- Soft shadows (the hard, dithered edges looked rough): the shadows are computed before the scene in a
  half-resolution pass (the surface each pixel showed last frame, rebuilt from its depth: the view is
  orthographic), one ray per pixel and light aimed at a random point of the light's disc (a penumbra
  that widens away from the caster; `size` on a light, default 0.08), each shadow-casting light in its
  own channel (28 channels in 7 RGBA8 layers; lights whose screen boxes overlap get different ones).
  A depth-aware separable blur turns the noise into smooth edges without bleeding over sprite edges or
  walls, and the lighting reads it back bilinearly where the 4 nearest texels show the same surface
  (else the nearest one that does; only surfaces missing from that buffer still march per pixel). The depth buffer is RG32F now (depth + "casts shadows"), so every lit surface gets soft
  shadows, not just the casters. About the same GPU cost as the old per-pixel march (±0.5 ms).
- Shadows stick to whoever moves (playtest: "the shadow is still rendered at the old position while the
  character is already at the new one"): the shadows read last frame's depth, reprojected only for the
  camera, so every moving caster (the walking player, crew, intruders, enemies) dragged its shadow one
  frame behind, worse at low fps. Now a depth pre-pass draws this frame's sprites first (same order,
  depth test and blending; a cheap shader variant without lighting) into the shadow depth buffer, then
  the soft-shadow pass and the lighting use it. No ping-pong or reprojection any more; the instance
  buffer is uploaded once for both passes. Measured by stepping the game by hand and comparing each
  frame with a re-render of the same state: before, 35-8300 wrong pixels around a walking player or an
  intruder (worst at 20 fps); after, 0. GPU time per frame unchanged within the noise (~3.5-5 ms at
  2048×1280, timer queries).
- Alarm beacons: their spot beams now start `ALARM_TUNING.out` (0.45) out from the back wall instead
  of 0.15. Right at the wall, the screen-space shadows took the wall (and what hangs on it) for an
  occluder of the beacon's own light and cut the beams into big straight-edged wedges, or hid them.

### 9c. Coherence pass: one look inside the ship
- Lamps: the pendant ceiling lamps read as floor lamps in the tilted view; they're gone. The ceiling lights
  stay (invisible, the camera looks through the ceiling) and every room has bulkhead lamps on its back
  wall (`interior/lamp_wall_on/off`, WALL_LAMPS in js/interior.js) with a small warm glow of their own:
  chunky caged lamps ~1 unit wide (readable at room zoom), a glowing lens when on, a dark one when off;
  the bridge's nose lamp moved left, clear of the front cannon's ladder.
- Labels: text that belongs to the world is a sprite now (GFX.text, an upright billboard, depth-tested):
  capacitor readouts, the VENT tag, the cat's z z z / hearts, the limpet mines' countdown; whoever walks in
  front hides them. Labels that must stay readable (CLICK TO TAKE, BROKEN, OVERCHARGED) stay on top but
  fade while a crew member stands in front of them. Steam (helm mug, kitchen stove) and the map table's
  radar sweep are canvas sprites in the world too (GFX.canvasSprite).
- Broken machines: the scorch and the loose panel lie in front of the machine where they can be seen;
  sparks glow. The reactor and the cannon ladders have broken sprites of their own: `ship/reactor_broken`
  (cracked core window, scorched housing, an access panel hanging off, sparking cables, a snapped cage
  bar; 2 frames, the dead core flickers now and then) and `interior/gun_ladder_broken` (bent / missing
  rungs, scorched hatch ring, smashed beacon, sparking cable); the old burn mark only while they load.
- Cannon ladders go DOWN now: `interior/gun_ladder*` is an open floor hatch (hazard ring flush with the
  floor, lid swung up, grab rails and the top rungs over a well seen only through the hole; a holdout
  floor hides the rest, its height clamps to 0 so the hole counts as floor). _lit: light glowing up out of
  the well; _broken: scorched ring, bent rail and rungs, sparks. Wording: 'Click: climb into the …',
  'LADDER TO THE CANNON', 'CANNON'. Click area unchanged.
- Deck airlocks: the top door is a full-height door like the bottom one (same panels), its panels slide
  into two full-height jambs in the spine's low lip next to the shaft; the decklock canvas grew north to
  y 11.5 to hold them (all decklock sprites re-rendered).
- Power lines lie on the floor, clipped to the floors (they run under the walls and the spine instead of
  over them), with a clamp where they disappear under a machine; their energy and the pulses glow in a
  new unlit 2D layer ('glow', between the floor drawings and the crew), with the interaction brackets,
  pickup halos, click rings, job markers and the pirates' halos (all readable in the dark, under the crew).
- The front cannon stands on the nose's roof (z 1.6) with its gunner up in the hatch, instead of being
  drawn through the nose wall and the helm (depth bias). Crew who are out: suit and gear greyed.
  Shells leave the raised muzzle: each carries a height z (muzzleZ: 0.4 above its cannon's pivot,
  +1.6 for the front one) and is drawn lifted while it sinks to the ground plane over its first 7 units
  (shellZ; the enemies and asteroids are drawn there). Enemy shots aimed at the front gunner climb to
  his body on the roof (shotZ), and his hit splash and the cover plate's sparks are drawn up there too.
  Only the drawing is lifted: every hit test stays in the flat ground plane; nothing changes in ?classic.
- 2D leftovers converted: the ore asteroid (`enemy/ore_rock` + pulsing glow), slime drops
  (`organic/slime_drop_*`), the derelict's fires (the fire sprites). The alien corpse no longer gets a
  second goo puddle under its own. The storm darkness and flare glare go under the prompts. The spine
  never goes pitch black without power. Favicon (no more 404 on every page load).
- Hull outside: HULL (js/ship.js, copied in tools/blender/models/hull/hulllib.py) now contains every wall:
  the corner chamfers start at the walls' outer corners (NW (0, 2.8), NE (44.4, 2.0), SW (0, 23.8),
  SE (44.4, 24.2)), the bridge's shoulder edge moved to x 13.6, and each outer airlock hatch has a doorstep
  (a 0.45-deep bump in HULL, 2.9 long). Nothing else used those points (spacewalk area, hit tests and
  hatches keep working; the EVA spots, coils and jam spots stay outside it). The outer hatch
  (`hull/hatch_<side>*`) is a door frame standing on the side wall's outer face (jamb posts and lintel up
  to the wall top, flush with the inner frame `interior/hatch_*`; light spills onto the doorstep as it
  opens), drawn in the wall layer. The hull body only puts decor where the game shows it (`visible()` in
  body.py warns otherwise): blister hazard stripes along the diagonal edges, grille and sensor box in the
  nose triangles, duct tape on the blisters, the nose and the stern faces; the top-side name/registration
  stencils, the CANNON ARC stencils and the bridge's nose windows (all under or behind walls) are gone.
- Placement fixes: the front cannon (pivot y -3.6, gameplay) is drawn 0.8 further south on the nose wall's
  top (GUN_DY, js/sprites.js), its gunner closer in (GUN_SEAT 0.5, in the turret's hatch); cover plate,
  flash and light follow, and muzzleZ (js/combat.js) lowers the shells' start height by what that shift
  lifts on screen, so shells and sparks leave the drawn muzzle. Cannon-track debris (JAM_SPOTS) lies on the
  blisters behind the side cannons ((-0.8, 8.35), (45.2, 8.2)); the front one is drawn on the nose wall's
  top beside the turret (JAM_ROOF), its spot (24.0, -4.1) is where that shows on screen (tests/eva.js walks
  a spacewalker to all three). The spine tiles have no baked DECK 2 any more (the deck airlock gaps cut it
  into an orphan "2"): `interior/spine_label` goes mid-segment, clear of the lamps. No more diagonal tape
  strip on 3+-way wall junctions. The EVA stencils sit by the hatches clear of the power lines, DO NOT
  LICK THE REACTOR fits between the engine cables, WC clears the stall door, the lever's LEFT/MID/RIGHT
  and AUTO stand as billboards over the lever, the donut box is on the map table, and the two wall signs
  draw nothing in the sprite view until their sprites load (the 2D fallback went over the crew).
- Engine plume (playtest: "the flame is boring, flat and looks drawn underneath"): a blue exhaust plume
  rendered in Blender (`hull/engine_flame_cruise` / `_spool`, 8 frames each, tools/blender/models/hull/engine.py
  render_flame): an emissive volume coming out of the bell's mouth, white-hot core → cyan/blue → violet edge,
  shock diamonds, noise turbulence; the jump drive's spool plume is longer, brighter and whiter. Rendered on
  black with the bell and hull as black occluders, then alpha = brightness (glowify), so it's drawn unlit
  right after the bell ('decal' layer) and only adds light; bloom picks up its core. The frame is picked at
  random ~14×/s (engineFlame, js/art.js), and a blue strip light along the plume (LIGHT_TUNING.engine,
  js/lights.js) flickers with the frame's brightness: it lights the bell, the stern hull and spacewalkers
  (no shadows: right behind the bell the screen-space shadows blacked it out). The cruise bell's inner rings
  glow blue-white now (its rim stays hot orange). The 2D gradient plume is blue too (classic / fallback).

### 9d. The crew's animation (playtest: choppy walk, mid-stride stops, shooting with your back)
- The astronaut (`tools/blender/models/crew/crew.py`) has 16 facings (22.5°) and gait cycles relative to
  the facing: `crew/run` (forward jog, 12 frames: weight shift, pelvis/shoulder counter-twist, arms
  pumping, bob with a short flight phase), `crew/back` (backpedal, 8), `crew/strafe` (sidestep to the left,
  8; played backwards it's the strafe to the right), `crew/settle` (passing pose → feet together, 2 + 2
  frames), `crew/idle`; every gear overlay (`crew/gear_<id>_<set>`, with `depth`) for all of them. The visor
  (vacuum) is one overlay per facing (`crew/visor`), drawn at each frame's `head` offset: the head keeps its
  orientation in every standing pose, so the standing sets need no `_visor` copies (`crew/down_visor` stays).
  Packed crew: 1.1 MB → 6.9 MB (body ~45%, gear overlays ~55%; 16 facings × 29 standing frames).
  The legs are IK-solved from foot paths on the floor (ankle pivots added, boots stay flat, toe-off / heel
  strike), so a planted foot moves back under the body at exactly the body's speed; each gait entry
  carries its `stride` (units per cycle) and the game plays the cycle at walked distance / stride — no
  foot sliding, at any speed (hurt, boots, the treadmill, slowing down).
- `js/sprites.js` crewPose(): per crew member, from what every client has (c.walk's rate, smoothed so
  remote crew at the 30 Hz snapshot rate animate smoothly; the drawn position's change for the
  direction). The gait is picked from the angle between the walking direction and c.face (nearest of
  forward / back / left / right, with hysteresis). Stopping: as soon as the walk rate falls well below its
  recent peak (the old code kept showing a mid-stride frame through the long tail of slowing down), the
  cycle runs on to the next passing pose and plays `settle` into idle. The old `crew/walk` sets are gone.
- Mouse look (`js/game.js` updateCrew/updatePlayer, `js/net.js`): moving the mouse (mouse.look, new in the
  input messages) or firing with the right button makes you face the mouse for 1.75 s (LOOK_TIME); arrow
  keys still win, otherwise you face the way you walk. Server-authoritative; your own client predicts the
  same (netPredict), and your own c.walk now stays local too (no stride jitter from snapshots).
  Space fires the way you face, so right after moving the mouse that's towards the mouse.
- `tools/sprites/pack.py`: the delta crop also tries the same frame of earlier variants with as many frames
  (`crew/run_visor` frame k on `crew/run` frame k: only the helmet differs).

### 9e. Room names (unofficial) and a weight rack in the gym
- What the rooms are, for theming decor (not UI labels for now; the room-name plaques are gone, see 9k):
  kitchen = Left Cannon (upper deck, left of the bridge; counter, fridge, table), bedroom = Right Cannon
  (right of the bridge; bunks, lockers), gym = Right Airlock (lower deck right, below the bedroom;
  treadmill), reactor room = Reactor (lower deck middle), bathroom = Left Airlock (left of the reactor room;
  toilet stall).
- The rooms already read as what they are, so only one thing was added (no going over the top): a dumbbell
  rack in the gym's top right corner, against the back wall between the wall beacon (x 40.6) and the right
  cannon's power line (x 42.6): `props/weight_rack` (`tools/blender/models/props/gym.py`; origin = its
  footprint's centre on the floor, (41.5, 15.36), 1.5 × 0.62, 0.8 high),
  coloured small dumbbells up top, big black ones below with one slot empty and one duct-taped, a towel
  over a post, a "RE-RACK IT" label. Solid since 9k (CLUTTER.weightRack); sprite view only
  (the classic 2D view skips it). Drawn in `drawPropDecor()` (js/decor.js), y-sorted with the crew.

### 9f. Helm and security consoles with depth
- The old desks (`systems/helm*`, `systems/security*`) read flat: a dark box whose screen bank sloped at
  ~60°, almost square to the 50° camera, so it showed as one flat dark rectangle with no sides or tops.
- Remodelled in `tools/blender/models/systems/consoles.py` (same 1.6 × 0.6 footprint, origin, desk top
  height 0.72, states f0..f3 / off / broken, so js/art.js drawStation is unchanged; emissive 0.8 only
  lights the brightest pixels, so it wasn't the cause): two pedestal cabinets with a knee recess, an
  overhanging top with a rubber bumper, a riser at the back with status lamps, and upright chunky CRT
  monitors (bezel lip, tube housing behind, vents on top) whose tops and sides show in the tilted view.
  Helm (blue-grey): a big nav screen on a neck, two wing monitors on arms turned to the pilot, a flight
  yoke, a throttle quadrant, cables, tape. Security (olive): a stacked bank of six beige CCTV sets (the
  camera grid; feeds drop out per frame, REC dot blinks), a door-lock panel (door list screen, keypad,
  door lamps), PA gooseneck mic, camera joystick, a LOCKDOWN button under a flip cover. The mug and
  sticky notes still land on the desk top.

### 9g. Going down in a cannon (playtest: "might be difficult to get out")
- **Before:** a gunner who went down was dropped onto the ladder hatch inside, so in-flight shots and
  the cannon were fine, but: anyone could climb into a cannon someone was already manning (two gunners
  stacked in one seat); the downed one lay right on the ladder spot, where E climbed into the cannon
  instead of treating them; and you never got to stay at your post.
- **Now** (`hurtCrew`, `pullOutOfCannon` in `js/systems.js`; `updatePlayer` / `updateInteraction` in
  `js/game.js`): a gunner who goes down (or out) slumps prone in the seat, drawn with the lying-down
  sprite and the red cross at the seat (`crewDrawAt`). Below the rim, enemy shots aimed at them fly over
  (they hit the hull behind) and enemies don't pick them; no aiming, no firing, no reload / crank /
  CLIMB DOWN (the cannon HUD is hidden). They patch themselves up the usual way (hold click anywhere, or
  E; 10 s, 20 s out and alone) and are back in the seat, hurt; the held click doesn't fire.
- A crewmate at that cannon's ladder hatch gets "Click: pull X out of the cannon" (click / E): the
  downed one is placed next to the hatch inside (a free spot, not on the puller), still down, to be
  treated as usual; the cannon is free again. While a downed crewmate lies right there, E treats them
  (the prompt says "Hold E: treat X"); clicking the ladder still climbs in.
- A manned cannon is taken: the ladder says "X is manning the cannon" (one gunner per cannon).
- No softlocks: alone, down or out in a cannon, you still patch yourself up; a disconnect removes the
  crew member, so the cannon is free. Being down, the bottom prompt is now drawn above the dark injury
  vignette, so it stays readable.
- `tests/gunner.js` covers all of this, solo and multiplayer (via `netServer.input`), for all three cannons.

### 9h. Hits look violent and hot (`js/hitfx.js`; playtest: "the shots mostly look cute")
- Drawn only, local on every client: hit decals now carry `hot` (sim time) and `side` (shipHit); the
  first time a client sees a fresh one it plays the impact: a white flash + point lights, 60 / 160
  sparks (streaks that arc, bounce and cool white → yellow → orange → red), embers, smoke puffs
  (fx/smoke_*), tumbling plating (fx/junk_shard), a shock ring; big hits also blow 70 sparks, smoke
  and debris into the room behind the wall. The old synced orange/red dots are gone (less snapshot
  traffic); the cartoon explosion flipbook stays, a bit smaller.
- The spot glows white-orange and cools to dull red over 12 s (small) / 20 s (big), by `time` so every
  client agrees (dyn/hitfx_heat_* canvas sprites, unlit, + a light on the hull), over a lasting soot
  stain (fx/scorch_*) and the hole decal. Most hits land on a room's outer wall: `hitSurface()` (combat.js)
  puts those marks on the wall top (z 1.6, clipped to the wall; the glow may spill outwards into space).
- A part that breaks or catches fire bursts sparks (plus a jet of sparks racing from the hit that did
  it), then arcs for 4 s, then spurts now and then while broken. Particles capped at 1400. ?classic: 2D.
- Gameplay, saves and snapshots unchanged otherwise (two more fields per hit decal).

### 9i. Shield emitters outside (playtest: "the shield gets generated by a button, which seems weird")
- Each shield now has a device that makes it: a shield emitter on the outside of the hull (`SHIELD_EMITTERS`
  in js/ship.js): left and right on the side walls level with the airlock rooms (y 15.7), the front one on
  the nose's left shoulder. A projector pylon on a bracket: drum with fins, copper coils with energy rings,
  a tilted hexagonal lens array (`tools/blender/models/hull/emitter.py`, sprites `hull/emitter_<side>_<idle |
  cd | up (4-frame loop) | broken>`, drawn in eva.js `drawShieldEmitters`, a 2D version for ?classic). The
  shield bubble grows out of the emitter now (combat.js `drawShields`), and it lights the hull while up.
- The button inside stays the control ("Click: raise the left shield"). Its label reads EMITTER DOWN
  (blinking red) and its prompt says so while the emitter outside is broken.
- The emitters are breakable parts (SYSTEMS kind `emitter`, `outside: true`, in their side's damage
  column; appended at the end, so the other parts keep their indices): hits on that side break them like
  any part (big hits, small hits' 10%, barnacles, leeches). Never fires (vacuum: `igniteSystem` refuses,
  `fireNear` skips them), never the maintenance failure, no room (`sysRooms` = []: the saboteur and fire
  spread leave them alone), no inside repair or tape job. A broken emitter blocks its shield (no energy
  spent) and drops it if it was up (then the usual 5 s recharge).
- Repair: on a spacewalk, hold click on it with the repair kit for 5 s (`outsideRepairTarget`, the generic
  hold job). Listed on the sidebar ("no shield · fix it outside"), the helm diagnosis and the combat HUD.
  Practice panel: "Break the left shield emitter (outside)". Saves unchanged; its broken state goes out
  in the snapshot's `systems` like every part. `tests/emitter.js`.
- Balance note: each side column has one more breakable part, so a hit there sometimes takes out the
  emitter instead of something inside (harder to fix: a spacewalk).

### 9j. Shield domes in 3D (playtest: "a nice 3D render of a sphere with hexagons instead of planar hexagons")
- With the sprites on, each raised shield is a hexagon-tiled energy dome instead of the flat hex band:
  the upper half of an ellipsoid standing off that side (`SHIELD_DOMES` in js/combat.js: port / star
  centred 8 units inside the hull, radii 11.8 × 24 × 6.5; front centred over the bridge, 12.7 × 12 × 6.5).
  Its base on the deck plane follows the curtain the shots stop at (`shieldX` / `shieldYFront`, within
  ~0.7 units at the ends); its crown leans over the rooms on that side (kitchen and bathroom, bedroom and
  gym, the bridge) and fades out there, so it shows faintly over the outer part of those rooms.
- Drawn by `GFX.dome()` (js/gfx.js, FS_DOME): no mesh, each pixel of the dome's screen box casts its
  (orthographic) view ray against the ellipsoid; two draws, the near and the far wall (the far one at
  45 %), each depth-tested against the walls and the crew; unlit and additive, after all sprites and
  before the bloom. Cells: around the dome's long axis (from the rim up over the crown) × world units along
  it, ~0.95 units across, a slow shimmer per cell. Faint where you look onto it (lines ~7 %), bright
  where it's seen edge-on (fresnel) and along its base line.
- Kept: the build-up (the dome appears within a sphere growing out of the emitter in SHIELD_GROW, with a
  bright front, and shrinks back into it), impacts (whole cells flare around the hit, measured from each
  cell's centre, and a ring ripples outward; the shot's draining orb is still the 2D one), the front
  dome's asteroid role. New: in its last 2.5 s (`SHIELD_WARN`) the dome flickers (about to drop). Hit tests
  are unchanged (drawing only; the state was already synced). `?classic` keeps the flat hexes.
- Cost: the box is clipped to the dome's outer half; no measurable change in the overview at 2560×1600.

### 9k. No room-name plaques; the clutter is solid (playtest: "the labels don't add up with what we call the rooms")
- The room names on the walls are gone: the plaques with LEFT CANNON / BRIDGE / RIGHT AIRLOCK ... in the
  sprite view (`drawRoomPlaque`, js/interior.js) and the faint names on the floor in `?classic`
  (`drawRoomLabel`, js/art.js). Functional labels stay (CANNON, SHIELD, EVA, console names, signs), and so
  do room names in UI text (sidebar, banners, the security panel's map). The `interior/plaque_*` sprites
  are unused now (still in the atlas).
- Everything standing on the floor blocks you now, like the furniture: `CLUTTER` in js/ship.js lists each
  crate / box with its footprint (w × h turned by a, as drawn) and SOLIDS gets the box around it (trimmed
  halfway back to the unturned footprint). js/decor.js draws the crates at those positions. Newly solid:
  the kitchen crates (AMMO, blank, SNAX) and the snack machine, Steve the plant (bridge), the bedroom's
  AMMO and MISC crates, toolbox and sleeping bag, the bathroom's hull plate and coolant crates, the fuel
  cell crate, the patch board and the washing line's two stands (reactor room), the gym's TAPE, plate
  and blank crates and the weight rack. Still walk-through on purpose: flat things (papers, cracks, nuts,
  the magazine), the ducks, the cat (you pet it), the kitchen stools (the intruder's route past the table
  runs between them), the plunger, the floor cables, the power lever and the jump handle.
- Moved out of the way first: the bedroom's AMMO crate and the toolbox now sit along the back wall right
  of the lockers (into the corner), the sleeping bag along the back wall left of the bunks, the MISC crate
  against the front wall (clear of the cannon's power line); the kitchen's AMMO and blank crates are pushed
  back against the wall and the washing line 0.15 to the right, so no gap is left to get stuck in. The
  sprites are position-independent, so nothing was re-rendered (the Blender scripts' position notes updated).
- Interactive crates (plates, coolant, fuel cells, snack machine, patch board) keep their click spots and
  stay in reach. Dropped items (`dropSpot`, also a leaving player's gear) never land inside a solid: they go
  to the nearest free floor. Saves unchanged.
- `tests/clutter.js`: every sprite standing on a room's floor is solid or on the walk-through list; the
  clutter boxes stay inside their rooms and clear of doors and deck airlocks; a flood fill from the bridge
  reaches all free floor (no closed-off pockets) and every click target is in reach; no intruder / pirate
  route (NAV edges) runs through a solid; items dropped on a crate land next to it.

### 9l. Helmet lamp (request: "a helmet light (directional), mostly so I can test where the normals work"; later: "the headlamps should just always be on" ... "I guess the light is already soft enough")
- Always on for every crew member (`c.lamp` defaults to true; the L key is gone, the debug menu's `-` entry
  still toggles it for testing). Still carried in every snapshot's crew entry and the command `['lamp']`
  still exists. Drawing only, no gameplay.
- `LIGHT_TUNING.helmet` (js/lights.js): a cool white spot from the helmet (z 1.32, 0.28 ahead) where you
  face (with mouse-look it follows the cursor), tilted 22° down, half-angle 0.72 rad with the renderer's soft
  cone edge (full brightness within ~31°, gone at ~41°), reach 8.5, intensity 2, with shadows; plus a small
  point light on the helmet and a pale blue glow dot on the brim when you face the camera (drawHelmetGlow).
  Inside, on spacewalks and in the hatch; not in a cannon. It replaces the ion storm flashlight while on.
- Outside the beam points further down (tilt -0.6, more wrap): there's no floor out there, what it can hit
  is the hull beside and below you (airlock housings, blisters). The screen-space shadows keep it off the
  rooms behind the hull walls (without shadows it does light the interior floor through the wall).
- Budget: 2 lights per lamp (16 for 8 crew), one shadow channel each (of 28).
- `tests/multiplayer.js`: the toggle runs for whoever sent it, travels in the snapshot, another browser
  applies it and lights exactly one helmet beam.

### 9m. Power lines in 3D, with real fittings (request: "the energy system is still looking 2D ... the cables to the cannon should go through some thing in the wall, then connect to it")
- Cables (`js/cables.js`, sprite view only): thick armoured cables lying on the floor, drawn by the game since the
  routes are free polylines. Each visible stretch is rasterized once (in ~3-unit pieces, a few per frame) into
  canvas sprites with a normal and a height map: a tube profile, steel ribs, a dark outline and a soft contact
  shadow, so the room lights shade them and they cast small shadows ('decal' layer: walls, machines and crew
  cover them). `GFX.canvasSprite(..., { maps: true })` (js/gfx.js) gives a canvas sprite its own normal/height
  maps for this. Readability kept: an indicator window along the cable's top is amber and self-lit while the
  line is live, dark when it has no charge, dark red when its capacitor is broken (only the window is recoloured
  when the state changes); the flowing dashes, pulses and surge arcs stay in the 2D glow layer on top of it.
  Steel strap clamps (`power/clamp`) every ~3 units.
- Fittings (`tools/blender/models/power/fittings.py`, group `power`, each `_on` / `_off` with an amber LED):
  `plug` (a socket bolted to a machine's face, heavy plug with a yellow latch and a ribbed boot, PWR tag; on the
  capacitors' side faces, the reactor's sides and the shield buttons' sides), `box` (a teal conduit box on a wall
  where the cable goes in, 4 facings), `riser` (the same on a lower-deck back wall with an armoured conduit
  climbing into the spine), `jack_port/star/front` (outside: an outlet on the hull wall, a short armoured cable
  and a connector clamped onto the cannon's mount; the front one on the nose wall's top to the roof turret).
- Routes (`POWER_ROUTES` in js/systems.js) start and end in a fitting (`POWER_FITTINGS`; the cable starts its
  REACH out of it, with a short straight lead and rounded bends). The cannon lines no longer end at the ladder
  hatches: they climb into the spine through a riser on the lower deck's back wall, come out of a box on the
  upper deck's near wall, run to a box on the room wall next to their cannon, and the jack outside carries them
  to the cannon (the front one: a box under the nose's wall lamp, then along the wall top). The capacitors'
  plugs moved to the cabinets' side faces (on the back they were hidden behind the cells); routes were adjusted
  so cables don't cross where they can avoid it (feed 2 still crosses the two lines that climb out of the
  reactor room, as before).
- 'hide' stretches (inside the walls / spine) have no length: `linePoint(l, k)` runs over the visible
  stretches only, so a pulse jumps through the wall and `linePoint(l, 0.5)` (the surge splice spot) is always on
  the floor. Gameplay, saves and snapshots unchanged (the lines' ids, capacitors and timings are the same).
- ?classic: the same routes as flat strokes, with a small box at each fitting.

### 9n. Tutorial: RAIDER basic training (`js/tutorial.js`; request: "a tutorial that explains the game in great detail")

- Entry: a TUTORIAL button on the main menu (glowing until you've finished it once; `localStorage`
  `mn-tutorial-done`). Solo only: the server doesn't load the file, and every hook in the other files checks
  that it exists. First it asks "mouse or keyboard?" (remembered in `localStorage` `mn-controls`, not in the
  profile: no save-format change); every instruction then names only the matching controls (both keep working).
- Messages: a parchment box in Patrick Hand at the bottom, click-through (NEXT, a click on the box, Enter or
  Space). While one is open the simulation is paused (`frame()` runs `tutorialClient`: only the camera moves);
  keys are held back from the game (a capture listener), and the key that turned the page stays swallowed
  until it's let go, so a held Space never fires the cannon. Pages can mark things in the world and zoom out
  to the whole ship (the only place outside the debug menu that shows it).
- Railroading: `tutorialAllows(what, arg)`, asked at the central places in js/game.js (`tutAllows`):
  interaction targets (hover, E's nearest target, `act` prompts), cannon fire / reload / cover / climb down
  (also the RELOAD and CLIMB DOWN buttons), closing panels, hand weapons, the debug menu. Each step allows only
  its own action. A pulsing ring with an arrow marks where to go or what to hit, and an objective line sits
  under the HUD; walking to the other deck points at the nearest deck airlock first.
- The run: a stock ship (no upgrades: 3 shots per energy, capacitors of 3), the reactor's cell empty, the
  lever wedged on MID, the left capacitor with exactly 1 energy, the left cannon with 1 shot. The helm shows
  the left shield button and the right capacitor as "irregular readings" (`mission.maint`; its maintenance
  event is pushed to t = 10⁹, so it never fires). No jump. Enemy hits never do real damage (combat.js
  `shipHit` / `crewHit` ask `tutorialHit`: just the flash and sparks).
- Steps (data in `TUT_STEPS`, each `{ objective, marker, allow, enter, tick }`, `tutGo(id)` moves on):
  welcome (RAIDER intro, you, a tour of the decks) → helm (the two yellow readings, orange = service it) →
  radar (nothing: a safe part of space; scan again: an interceptor on the left) → climb into the left cannon
  (spawns it; it holds its fire) → shoot the windshield (a miss gives the shot back; any other weak spot or hull
  wear is fixed at once) → advantages (the interceptor's weak spots and effects from `ENEMY_TYPES`, frigate
  examples, hull wear) → reload (the last energy) → block (one scripted shot; paused mid-air until you hold
  the cover; a shot that gets through is explained (crew injuries, fires, broken parts, holes), costs nothing
  and repeats) → kill (the cable and the cooling with 3 shots). Dead: climb down. Out of shots: "out of
  energy, check the reactor" → reactor (take a cell from the crate, load it; energy, bolts, lever, capacitors,
  the wrench) → pull the wrench → lever demo (the reactor runs fast for 4 energies: MID, RIGHT, LEFT, MID) →
  if the interceptor lives: lock the lever on LEFT (turn it, wedge the wrench), back into the cannon (the
  reactor runs ×4 while locked LEFT) and kill it. The reactor always comes first: the fire starts when you
  climb out after the second fight, or (interceptor already dead in the first fight: climbing out starts
  nothing) right after the lever demo. Presented as "it got a hit in after all": a boom on the left hull and a
  fire at the left cannon's mount (a `tame` fire: `updateFires` skips its spreading / burning out / going out
  entirely) → fetch the bridge's extinguisher (the nearest) and put it out →
  the left shield button breaks (the irregular one from the helm): walk up to it, it does nothing; the repair
  kit, hold to repair (a tape job counts too) → overview pages (laser gun for intruders, spacewalks, manual
  override, vent panels, security console, shields, treating crewmates, hull plates / patch board / snacks,
  the jump) → "more training modules coming soon" and BACK TO THE LOBBY.
- `tests/tutorial.js` drives both branches headlessly.

### 9o. E and left click do the same everywhere (playtest: "the EVA airlocks only work by clicking, barnacles only with E")

- Rule: anything you can use works with E (next to it: the thing under the mouse if that's usable, else the
  nearest) and with a left click on it in reach; hold jobs (repair, scrape, pry, weld, treat, …) by holding E or
  the left button.
- Airlock + E: with the mouse resting on the airlock's spot (on a spacewalk that's usually yourself, the camera
  centres on you) the hover was the prompt's own tooltip, which swallowed E. Now only something with an action
  (`actionable()` in game.js: run / repair / treat / hold) takes E away from the prompt.
- Barnacle + click: the mouse picks raised sprites (`GFX.pickAt`), and standing in front of a barnacle your own
  sprite covered it, so the click landed on your feet. A pick now loses to the ground point when only the ground
  point has something to use (`clientUpdate`).
- Treating with E: letting go of E for a moment keeps the progress (as with the mouse), and pressing E again on the
  heartbeat speeds it up like a click.
- Manual override panel: E hits like the button (holding E swings again after each hit); Esc closes it (E closed it
  before). Other panels (security, diagnosis, mini-games) stay click-only on their buttons, E / Esc close.
- Left click means something else only in a cannon (fire; E climbs down). Hand weapons use the right button / Space,
  so the left click stays free for interacting.
- `tests/interact.js`: airlocks (inside and out, E with the mouse anywhere, click), barnacles (hold E / hold mouse
  from every side), treating (hold E / mouse), the override (E opens, E hits, held E, Esc).

### 9p. Procedural floor scratches and tape (playtest: "the same tape all over" on the left, "still not procedurally generated" on the right)

- The floor tiles were Blender renders with baked marks: boot scuffs on `floor_blue_a`, a strip of duct tape on
  `floor_red_b`, so every tile of that variant showed the same marks. Those are gone from
  `tools/blender/models/interior/floors.py` (re-rendered, interior group repacked); all tiles are clean now.
- The marks are drawn per pixel by the sprite shader (`FLOOR_WEAR` in js/gfx.js, ported from
  `tools/sprites/scratch_proto.html`), seeded by the world position, so every 1 × 1 plate cell and 2 × 2 tile is different:
  - mostly fine hairlines, in the normals only (a box-filtered V-groove: a scratch thinner than a pixel is a faint light/dark
    line, not noise) plus a glint in `lighting()` (`gGlintK` / `gGlintT`): a groove flashes when a light's half vector is
    perpendicular to it, so scratches catch the ceiling lights and the helmet lamp as you move
  - sometimes a cluster of parallel scuffs (a dragged crate) or a swirl (a chair), rarely a deep gouge (bare steel, dark burr rim)
  - long drags across the seams, faded in and out by the wear so they never stop at a tile edge
  - occasional duct tape (about 1 tile in 10): a strip across or along a seam, an X, an L round a corner, overlapping
    strips; mostly silver, some black gaffer, rarely hazard tape (broad, filtered bands: no longer busy); soft crumples
    instead of the prototype's crinkle and weave stripes (which looked stripy close up); tape bridges the seams and the tread
- Wear (js/sprites.js `floorWear()`): a base per room (bridge and reactor busiest) plus more around the doorways, the deck
  airlock doors, the outer hatches, the consoles and the reactor front. Each tile passes the wear at its four corners
  (`opts.floor`), so it's continuous across tiles.
- Cost: the tape was the expensive part at first (nine inlined copies of the strip code); now each taped tile lays out its
  strips and one loop draws those near the pixel. Measured in SwiftShader (software GL, so only relative): bridge view,
  half resolution, median frame 667 ms off → 767 ms on.
- Off switch: `?noscratch` or `GFX.setScratches(false)` (remembered). `?classic` has none.

### 9q. Floor nuts with a real normal map (request: "the littered nuts on the ground still need a normal map")

- Cause: not the crop or the decal layer (decals are lit with their normal map like any sprite; the map rects lined up).
  The nut model was a flat hex prism with a 0.008 bevel (under a pixel at 96 px/unit) and a raised, smooth-shaded disc
  for the hole, so its normals were a flat top with a vague dome; stored at half size (`mapScale` 0.5) that was ~12 × 10
  px of blocks. Its height map is near black on purpose (0.06 high in a 4-unit range).
- Fix: `hex_nut()` in `tools/blender/models/props/clutter.py` (own job `nuts`) builds a flat-shaded mesh with a flat top
  ring, a 35° chamfer cutting the six corners, and a countersunk bore going through (the floor shows in the middle);
  lighter steel so it catches the lamps. And `tools/sprites/pack.py` stores the `props` group's normal/height maps at full
  resolution (`MAP_SCALE_GROUPS`, per page `mapScale: 1` in sprites.json; +0.25 MB): all small floor clutter (nuts,
  tape, magazine, papers) was losing its shading to half-size maps. The game samples maps by uv, so no JS change.

### 9r. Reactor → lever → three branches (request: "it's not readable how the energy flows because the energy lever is totally removed from the reactor. you should have the reactor have a cable going into the lever, then from there the three sections branch off"; then: "the lever position for mid is where the reactor goes in ... the mid-lever position is exactly where the mid cable comes out ... the yellow lines should connect", "make sure the wires don't cross", "highlight the direction the energy goes next a little more than the inactive lines", then: "put the mid section's accumulator next to the cat ... the mid section's cable can come out of the top of the lever, the right from the right, and the left out of the left. The reactor cable can come in from NNW")
- Topology (`POWER_ROUTES`, js/systems.js): a **trunk** (`id 'trunk'`, cap -1) runs from a plug on the reactor's front
  face (21.5, 20.6) down into the lever's dial from the NNW (-125°). From the lever, one branch per output, each out of a
  gland on the dial's rim: `feed0` (LEFT) out of the west side to the left capacitor, `feed1` (MID) out of the top, right
  along under the reactor and up past its right side to the middle capacitor, `feed2` (RIGHT) out of the east side over
  to the right airlock's capacitor.
- **The middle capacitor moved** from the bottom right corner to the reactor room's back wall next to the cat
  (`CAPACITORS[1]` 27.0, 15.65; everything else reads its position). Its lines are visible all the way: the front
  shield's straight along the back wall to the button's plug, the front cannon's a short hop into a riser right
  beside the cabinet (up through the spine; out of the same box on the upper deck as before). Only that deck change is
  hidden. The bottom right corner is empty now.
- **Lever positions = glands.** `LEVER_ANGLES` = LEFT -180° (west), MID -90° (north), RIGHT 0° (east), game angles
  with y down: the handle points exactly at the gland its branch leaves by (`leverPort(leverAngle(i))`). It swings over
  the top, past the trunk's NNW inlet, but no position points at it. The dial was re-rendered
  (tools/blender/models/systems/lever.py, `systems` group repacked): lamps and track on the new angles, 19 handle frames
  10° apart (`LEVER_HANDLE_STEP`, `LEVER_HANDLE_FRAMES`, `LEVER_HANDLE_DIR`; each position has its own frame), the
  wrench beside the positions, the bus inlet at -125°. LEFT / MID / RIGHT billboards sit just past their glands, AUTO /
  MANUAL in front of the dial.
- **The lit path.** `lineState(l)`: the trunk and the branch the next energy takes (`nextFeed()` = the patch board's
  choice for the lever's shown output) are `live` (amber, self-lit window, flowing dashes); the other two branches
  are `idle` (dim amber window, no dashes, LEDs off): still cables, clearly not connected. Through the dial: a lit bus
  bar (`systems/lever_bus`, frame = the branch fed; classic: an amber line) from the trunk's inlet to the hub and on
  to that branch's gland, under the handle. The live feed path also gets a soft, slower pulse over its dashes
  (`feedPulse`), so where the next energy goes stands out a little from the shield / cannon lines. Patched (e.g. LEFT
  → right capacitor): the handle points LEFT, the bus and the lit branch go RIGHT, the patch board's lamps are lit.
  `off` (no fuel / empty capacitor) and `dead` (broken capacitor; the trunk: broken reactor) keep their looks, and
  surges their arcs.
- **Energy bolts:** `boltPoint(b)` runs down the trunk, through the hub (under the lever sprite) and out along
  `feed<to>`, in the same 0.9 s (`BOLT_TIME`, eased as before): arrival times and charging unchanged, also on longer,
  patched routes. Bolts remember the output they left by (`b.out`; extra field, old snapshots fine). The lever still
  steps on at once in the game state, but what it shows (`leverShownPos()`: handle, lamp, bus, lit branch) waits until
  the energy has arrived, so the bolt always runs along the lit path the handle points at; then the next path lights.
- **No crossings.** No two power lines cross or touch anywhere on the ship (tested). The two orange decor cables from the
  reactor to the engine (`props/cable_engine_l/r`) are gone: the branches had to cross them.
- New fitting `power/gland_on/off` (`gland()` in tools/blender/models/power/fittings.py, 8 dirs, REACH 0.22): a steel
  saddle clamped to the dial's foot with a hex cable gland, a ribbed boot and an amber LED; `leverPort(a)` puts one on
  the rim at angle a.
- Surges and splicing unchanged: the feeds keep their ids, capacitors and `linePoint(l, 0.5)` splice spot; the trunk
  never arcs (no capacitor). ?classic draws all of it flat (idle branches in a dim brown, the bus as an amber line).
- `tests/cables.js`: topology (trunk from the reactor into a lever gland, every feed from a lever gland to its
  capacitor), the lines over open floor, no two lines anywhere crossing or touching, the middle capacitor by the cat
  with its shield line fully visible and its cannon line hidden only through the riser beside it, each lever position
  exactly at its gland (W / N / E) with its own handle frame, the trunk NNW and away from all of them, the bolt's way
  (continuous, through the hub), the 0.9 s arrival also when patched, the lever showing the bolt's output until it
  arrives, live / idle / off / dead per lever position and patch, surges never on the trunk.

### 9s. The stern wall reads as a wall, and the helmet lamp stays inside (playtest: "the wall in front of the engine looks like it is a floor", "you can light it up with your helmet light which is just wrong because it should be on the outside")
- In front of the engine housing there was no wall at all: the walls are built from the room rects, and the
  housing's footprint (19.4..25.0 x 23.9..25.5) isn't one, so the hull's flat deck plating showed there. Now
  `ENGINE_BAY` (js/sprites.js) counts as room for the walls: the stern's near wall runs unbroken from 13.6 to 30.8
  and the wall stubs that hid under the housing are gone. The low near wall (`ship/wall_h_low`, walls.py) is
  re-rendered: a near-black cut top (a section, not plating), a bright steel coping along its inner edge where
  it meets the floor, a thin lip on the outer edge, and a dark face with vertical ribs every half unit (all
  near walls, so the airlock rooms' south walls match).
- Light through cut-down walls: the near walls are only 0.35 high and the screen-space shadows only know what's
  drawn, so every light inside (the helmet lamp, ceiling lamps, alarms) lit their tops, their outer faces and
  the hull outside them (the airlock rooms' too). `GFX.lighting({ walls })` (js/gfx.js `wallVis`) takes vertical
  planes that block any light below 1.6 when the line from the lit point to the light crosses them;
  `lightWalls()` (js/lights.js) gives the near walls (0.1 inside the room's edge, so the coping still catches
  the room's light and the housing stays inside) and the low ends of the up-down walls. Light from outside (a
  spacewalker's lamp, the engine plume) still lights the hull and stays out of the rooms. ?classic unchanged.

### 9t. Venting blows the boarders out (request: "also damage any hostiles in the room when you manually override the airlock, and make some animation where you can see the air rushing out")
- `js/hazards.js`: when a room is vented, every boarder inside (intruders and saboteurs in `boarding.invaders`,
  boarded pirates in `dk.pirates`; not cloaked saboteurs) takes one hit (intruder 3 of 6, saboteur 3 = dead,
  pirate 2 of 3) and is stunned 2.5 s; `hz.vent.hit` keeps anyone from being hit twice. Then the air drags them
  to the open outer hatch (2.2 units/s for 3 s, then half; walls and clutter still stop them); reaching it
  blows them out into space, a kill (through `hurtInvader` / `hurtPirate`, so objectives count it).
- `drawVentRush(t)`: drawing only, from the synced `hz.vent`: air streaks, tumbling papers / nuts / cans,
  a mist plume out of the hatch, a sheen over the room, strongest at first and easing off over the 10 s.
  ?classic draws lines and puffs. `sfx.whoosh()` at the start. Tests in tests/hazards.js.

### 9u. Text pass (request: a review of all player-facing text, 108 suggestions, "apply all of them")

Rules adopted for every text in the game:
- **Banners** are on screen for 3 s: what happened plus at most one short instruction, about 8 words.
  The details live on the sidebar plates.
- **Separators:** " — " between the thing and what to do, " · " between list items, at most one pair
  of parentheses per string. Units with a space: "3.2 s", "22%".
- **"Manual override"** only means forcing a locked / broken / jammed door or airlock (three whacks).
  The power lever has "the wrench" (wedged / auto, sign WEDGED / AUTO); the airlock vent has a
  "vent code" (panel title EMERGENCY VENT).
- **Room names** (display only, ids unchanged): Left cannon room, Bridge, Right cannon room, Left
  airlock room, Reactor room, Right airlock room. Gun names stay "Left cannon" etc.
- **Prompts name both mouse and key** where both work ("hold click or E", "click / Space: fire",
  "R or RELOAD"); "parts", not "systems", for what breaks; weak-spot effects in lower case.
- Also: the down / out-cold screen prompt is assembled per case (down vs out cold, alone vs not),
  the tutorial tour now explains injuries and the DAMAGE counter for everyone, practice has its own
  start banner, the end screen says R goes back to the lobby, and the duplicate HUD lines (bottom-left
  controls hint, "Broken:" list, live hits tally) are gone. The reinforced hull upgrade, which did
  nothing, now raises MAX_DAMAGE to 6.

### Jump animation (wind-up and jump-out)

Before, the jump was hard to see: the bell's spool sprite only showed while `mission.jump` ran, and
with energy in MID that lasts one tick, so there was no wind-up. The end screen opened with a 1.8 s
streak overlay on its own browser clock. Now (js/mission.js, "The jump, seen and heard"; looks and
sound only, the game rules and timing are unchanged):
- **Wind-up**: `jumpCharge()` 0..1 rises over the last 8 s of the countdown (to 0.6, counting the
  coils' delay), then to 1 while the drive spools and waits for energy or the handle. It drives the
  engine bell and plume (spool sprites, faster flicker and bell frames, a bigger, throbbing plume with a
  second translucent copy; classic: a higher throttle), the blue spool and coil lights, a faint blue
  throb on the floors of every room, the engine light (js/lights.js), blue crackle on power lines, room
  walls and the hull (`drawJumpCrackle`, glow layer) with glowing jump coils, stars that start to
  streak (`jumpSpace` → `drawSpace`), a blue pulse at the screen edges (the middle stays clear), a
  small rumble, and a rising hum (`sfx.hum`, a synth whose pitch, filter, level and throb follow the
  charge).
- **The jump** (only when the ship jumps out: `mission.over.survived`, also with a failed objective):
  2.3 s before the end screen. The camera pulls out to the whole ship, the ship pulls back and is
  thrown forward up the screen, the stars stretch into long lines, a tunnel of light streaks out of the
  middle, a white bloom becomes a full flash at 1.6 s, and the end screen fades in from white.
  `sfx.jumpOut` winds up and booms on the flash, and the win jingle comes with the results. Enemies
  stop shooting and shots still in flight do nothing (`enemyFire` / `shipHit`). R only goes back to
  the lobby once the end screen is up (`endScreenReady`). A loss has no animation.
- **Multiplayer**: the clock is `mission.over.at` (the synced sim `time` at the end), smoothed per
  browser (`jumpFxUpdate`, since `time` arrives at 30 Hz), so every client plays it together. The
  server's end flow is unchanged: it still waits for someone's R.
- **Robustness**: rewards are credited early in `clientUpdate`, a drawing error can no longer stop the
  game loop (`frame` catches it), and `GFX.end` skips a frame when its render targets can't be made
  (context lost, 0-sized canvas) instead of using a null framebuffer.
- Test: tests/jumpfx.js (wind-up builds; animation, then the end screen, result unchanged; no shots;
  the stall loop; no animation on a loss).

### Stalled jump, hot zone (request: "play the first part of the jump animation, but making it somehow visibly clear that energy is missing ... I don't want there to be a time-limit to the missions, but instead if you don't jump you'll face more and more enemies and part-failures faster and faster")

- **No time limit.** The 15 s jump window (JUMP_WINDOW, 30 s with the handle) and the "stranded" loss
  are gone. A mission ends by jumping out or by the ship falling apart (more than MAX_DAMAGE parts broken;
  the end screen then says "fell apart waiting for the jump" if it was in the hot zone).
- **The rule** (js/mission.js updateMission): the drive spools at `mission.jumpAt` (after the coils'
  delay) and jumps on the first tick MID is intact with energy in it (and, rule `handle`, the handle is
  pulled). Energy arriving mid-stall jumps right away (the normal jump-out sequence).
- **The stall loop** (no energy in MID, or MID broken): `mission.jump.st` counts the stalled seconds
  (synced, so every browser sees the same attempt). `jumpStall()` turns it into a 4.5 s cycle: 2.6 s
  charging (from 0.6 the first time, 0.4 after, up to 0.78), 0.8 s sputtering out (down to 0.15, the
  charge coughing: random drop-outs, `stallCough`), 1.1 s dead, then the next try. `jumpCharge()` follows
  it, so the plume, bell, blue lights, crackle, star streaks, screen edge and the hum (pitch and level
  drop) all charge and die with it. On top: the crackle arcs turn red while it sputters, a red flicker at
  the screen edges and "JUMP DRIVE: NO ENERGY" above the bottom prompt, a pulsing red ring and a NO
  ENERGY sign over the middle capacitor (BROKEN — FIX ME if it is broken) with a red warning light
  (js/lights.js), the sidebar header says JUMP STALLED (flashing red) and the jump plate "needs 1 energy
  in the middle capacitor" (plates can now wrap a long line onto two). Every sputter is a failed attempt:
  a 2 s banner "Jump failed — no energy in MID!" and `sfx.sputter` (a dying whine with coughs); the first
  one also has the ship's voice. With energy there and only the handle missing, the drive holds a steady
  high charge instead.
- **Hot zone** (`updatePressure`, simulation only, so the server runs it in multiplayer): from the moment
  the jump is due and not done:
  - extra encounters: the first 30 s after, then each gap ×0.8 (30, 24, 19, 15, 12, 10, 8, 6.3) down to a
    6 s floor. One is queued at a time as a normal timeline event (`press: true`), so the radar and the
    contact plates show it like any other. Kinds: interceptor, swarm, intruder, mine drone, plus the
    mission's own repeatable kinds (frigate, saboteur, spores, debris, leeches, grappler, stealth);
  - parts giving out: the first 40 s after, then ×0.8 (40, 32, 26, 20, 16, 13) down to a 10 s floor; a
    random intact inside part, never the reactor, the lever or the middle capacitor (the jump's chain);
  - a HOT ZONE plate ("it only gets worse until you jump") once it has started, and the music's threat
    stays up.
  - Tuning: a crew that does nothing at all loses the ship 65-100 s after the jump is due (enemy fire
    plus failures); one that repairs but doesn't fight lasts ~90-130 s; fighting and repairing buys
    more, but at a new encounter every 6 s and a failure every 10 s it falls apart within 2-3 min. Getting
    one energy into MID takes 10-30 s, inside the 30 s before anything new arrives.
  - Practice (its jump-handle button starts the drive) and the tutorial (no jump) have no hot zone.
- **Balance model:** the jump is in spec when MID has its energy within PRESS_FIRST (30 s, before the
  hot zone's first encounter) instead of the old 15 s window.
- **Texts:** the tutorial tour's jump page ("No energy, no jump: the drive stalls, and the trouble keeps
  coming faster until you jump"), the README intro, the end screen reason.
- Tests: tests/mission.js (the stall loops without ending, energy completes the jump, shrinking gaps for
  encounters and failures, the pool, a passive crew loses, the snapshot carries it all, practice and the
  tutorial untouched), tests/jumpfx.js (the loop's phases and charge range, the jump-out after a stall).

## Performance

Request: "Can we simplify the shadows and light work? I want it to be fast", then "60 Hz should work smoothly on
my laptop". The laptop: RTX 3070 Ti, X11, Firefox at devicePixelRatio 1, a 3840×2160 monitor (60 Hz) and the
2560×1600 panel; Firefox's accelerated 2D canvas is blocklisted there, so every 2D canvas is drawn in software.
- Measured in Firefox itself (headless, WebDriver BiDi; per-function timers, timer queries): the GPU passes were
  never the problem (~5 ms, the shadows ~1.2 ms of it). The main thread was: 26-39 ms a frame, all in the 2D
  canvases. Every frame missed 60 Hz. The fixes, cheapest first, each measured (4K, bridge, ms of main thread a frame):
  1. Space in GL (`GFX.backdrop`, js/art.js drawSpaceGL): drawSpace filled the 'back' layer with three
     full-screen radial gradients (the nebulae) and 425 stars every frame: ~10 ms. Now a full-screen shader
     (the same gradients) and instanced rects (the same stars and jump streaks). 27 → 17.
  2. The 2D layers ('back', 'mid', 'glow') only clear, upload and composite what was drawn (js/gfx.js
     trackDirty): each layer context's drawing calls are wrapped on the instance to mark the 64×64 tiles their
     bounds touch (path pieces through a copy of the transform, line width, shadow blur; Path2D, putImageData,
     arcTo or a compositing mode that clears outside the shape mark it all). Firefox copies the WHOLE canvas
     for every upload from it, however small (5 ms at 2048×1152), so there the layers are CPU canvases and the
     changed tiles are read back with getImageData; other browsers upload the changed box from the canvas.
     Three full uploads (~9.5 ms) → ~2.5 ms. 17 → 8.5.
  3. Full-screen gradient effects in GL (`GFX.overlay`, art.js screenGradient / screenTint), composited over
     the picture and under the 2D canvas: the jump drive's edge glow and stall flicker, the jump-out vignette
     and tunnel, injury tunnel vision, the flare's glare. Each was ~12 ms on the 4K 2D canvas. Jump wind-up 23 → 9.
- No visual trade-off (before / after screenshots differ only in HUD state), so no quality setting; the
  shadows and lights are unchanged. A ghost check (no drawn pixel outside the tiles marked that frame, over
  10 scenes while walking) is clean.
- After, Firefox 4K: main thread 7.5-11.8 ms mean (p95 8.3-13.5); GPU 4.6-6.9 ms. Headless Firefox's frame
  interval is 13-21 ms, but that includes a copy of the GL picture that only headless does (hiding the GL
  canvas makes interval = main thread). Chrome unchanged: 3.5-5.8 ms at dpr 1, 9-11 ms at dpr 2 (the 4K HUD canvas).
- Left, if it isn't smooth yet: the vacuum tint (~2 ms on the HUD canvas in a breached room), the 'glow'
  layer's upload (~1.8 ms), capping the HUD canvas at dpr 1.5 for HiDPI screens, a lower render scale.

## Balance

`node tools/balance.js` (~1 min) rates every mission for 1-4 and 8 players: it builds each timeline through the
game, turns every encounter into crew jobs (walks measured by tools/travel.js, work from the game's constants),
schedules them, and runs the energy (reactor, lever, capacitors, reloads, shields, the jump) on the game's own
code. `--calibrate` (~25 min, or one process per mission: `node tools/balance.js --calibrate c3`) fits each
mission's `crew` table (encounters, fuel cells, reactor speed, overcharge per crew size) and its prerequisites.
History and the scheduler's details: 8z3.

- **Targets (2026-10-13):** solo play leaves the crew **70 % idle on the first mission**, and every later step of
  the progression **0.5 points less** (a difficulty ramp, c8 solo: 66 %); 2-8 players 68 % minus the same ramp.
  `A.TARGET_IDLE` / `TARGET_IDLE_CREW` / `TARGET_RAMP`, `--target` sets both bases.
- **The progression** (`PROGRESSION` in tools/balance.js): chapter n is step n; intro (open from the start, "Start
  here") step 0; Rush hour (open from the start, "more trouble") with chapter 2; every other skirmish with the chapter
  that comes up when it unlocks (`unlockedMissions()`): Ore run / Black box after c3 → 4, Pirate cove → 5,
  Stranded engineer → 6, Deep drift → 7, Nightmare → 8.
- **Accuracy:** 50 % (`A.HIT_RATE` 0.5, was 0.6): half the cannon shots hit the weak spot aimed at, so 2 shots per
  weak spot, a little less where misses on the hull wear a weak spot out (`HULL_SHARE`).
- **Current rules in the model:** reload 3 s by R only (`RELOAD_TIME`, read from the game; `A.RELOAD_SPEED` 1.5 would
  model a weapons specialist on every cannon, the calibration assumes none); MAX_DAMAGE 5 (+1 reinforced hull) from the
  game; shields 15 s up / 5 s cooldown through `pressShield`; no tape job (repairs are REPAIR_TIME); the jump is in
  spec when MID has its energy within PRESS_FIRST (30 s, before the hot zone's first encounter); a mission only counts
  with its objective (verdict "objective out of reach"); walking times from the current layout (middle capacitor).
- **Method changes:** the calibration now uses the summary's 8 random builds (`CAL_RUNS` 8, was 3: with 3, c1 / c2 at
  2-3 players were in spec on the fitted builds but not on the others); the encounter count is searched at the base
  reactor (it used to inherit the old table's `reactor`); a faster reactor is only taken further than the first step
  that gets in spec when that brings the idle closer to the target.
- **Results** (`node tools/balance.js`, 8 builds; idle % for 1 / 2 / 3 / 4 players, * = energy out of spec even with
  the prerequisites; encounters 1/2/3/4):

  | Mission | Step | Aim solo / 2+ | Idle after | Encounters | Before (hit 0.6, old tables) | Prerequisites |
  |---|---|---|---|---|---|---|
  | Intro | 0 | 70 / 68 | 71 / 74 / 70 / 73 | 2/3/6/7 | 71 / 65 / 71 / 65 | none |
  | c1 | 1 | 69.5 / 67.5 | 51 / 66 / 68 / 70 | 3/5/8/11 | 52 / 74 / 68 / 65 | none (reactor ×0.5-0.85) |
  | c2 | 2 | 69 / 67 | 70 / 74 / 65 / 74 | 2/3/7/7 | 70 / 83 / 66 / 72 | none (reactor ×0.7 from 3 players) |
  | Rush hour | 2 | 69 / 67 | 76 / 70* / 65* / 67* | 1/3/5/8 | 66* / 64* / 58* / 65* | overcharge |
  | c3 | 3 | 68.5 / 66.5 | 62 / 73 / 65 / 68 | 2/3/8/10 | 62 / 70 / 66 / 68 | none |
  | Ore run | 4 | 68 / 66 | 63 / 68 / 68 / 66 | 2/5/8/12 | 63 / 69 / 69 / 67 | cannons + inserter + overcharge |
  | Black box | 4 | 68 / 66 | 62 / 64 / 69 / 66 | 2/6/8/12 | 62 / 70 / 69 / 67 | cannons |
  | c4 | 4 | 68 / 66 | 40 / 66 / 64 / 68 | 3/4/8/11 | 40 / 66 / 69 / 67 | cannons + inserter + overcharge (was cannons) |
  | Pirate cove | 5 | 67.5 / 65.5 | 58 / 67 / 64 / 67 | 2/4/8/12 | 58 / 68 / 65* / 67 | cannons + caps (was cannons) |
  | c5 | 5 | 67.5 / 65.5 | 63 / 67 / 66 / 66 | 2/4/8/12 | 65 / 64 / 65 / 66 | cannons + inserter + overcharge (no OC before) |
  | Stranded engineer | 6 | 67 / 65 | 61 / 65 / 66 / 58 | 2/4/8/12 | 61 / 65 / 67* / 68 | none |
  | c6 | 6 | 67 / 65 | 40 / 72 / 64 / 66 | 4/4/9/12 | 41 / 67* / 66 / 72 | all three + overcharge |
  | Deep drift | 7 | 66.5 / 64.5 | 63 / 77 / 66* / 63* | 1/1/2/2 | 63 / 78 / 85 / 88 | all three + overcharge (was none) |
  | c7 | 7 | 66.5 / 64.5 | 63 / 77 / 57* / 63* | 1/1/2/8 | 63 / 72* / 66* / 71* | all three + overcharge |
  | Nightmare | 8 | 66 / 64 | 65 / 73 / 70* / 49* | 1/2/3/4 | 65 / 73 / 70* / 80* | all three + overcharge |
  | c8 | 8 | 66 / 64 | 65 / 73 / 70* / 76* | 1/2/3/3 | 65 / 56* / 70* / 60* | all three + overcharge |

- **Solo can't follow a 0.5-point ramp with the encounter count alone:** a solo crew gets 1-4 encounters, and one
  more or less moves its idle by ~13-15 points (1 vs 2: ~76 % vs ~62 %; a frigate alone costs ~45). The calibration
  picks the nearest count, so solo missions land within 8 points of their targets (on average 2.4 below). Four can't
  get near at all: their essentials (+ the finale fight) alone keep a solo crew busier: c1 51 %, Pirate cove 58 %
  (two pirate raiders, the objective), c4 40 % (two raiders), c6 40 % (rock, spores, leeches + the swarm).
  A finer solo knob would need a game change, e.g. a per-crew-size mission length, an objective count per crew size
  (one raider solo), or a lighter finale solo.
- **Still out of spec** with every prerequisite the player can have by then: Rush hour ×2-4, Deep drift / c7 /
  Nightmare / c8 ×3-4 (the frigate and the leviathan overrun one side's capacitor).
- tests/scaling.js checks the targets (intro solo within 3 points of 70 %; other solo missions within 8 of their
  ramped target and within 4 on average, the four above listed as essentials-only; 2-4 players within 15 points, a
  mission's mean within 7), the early missions in spec on the base ship, and the out-of-spec list.

## Sound

- **Soundtrack "Duct Tape Nebula":** original and fully synthesized (`js/music.js`). It's
  about 4.6 min long and loops: reverb pads, a delayed arpeggio, a pulsing bass, soft
  drums and a lead. It runs at 90 BPM in A minor, in sections: intro → arp → groove →
  lead → breakdown → groove → lead → outro. While there are threats, bass and drums play
  in every section.
- **Mute:** the speaker button at the top left, or M. It mutes music and effects, and is
  remembered in the browser.

## Tests

Headless Node tests (no browser needed; `tests/harness.js` loads the game scripts with a
dummy canvas):

- `node tests/reachability.js`: every weak spot of every enemy, on both sides, plus the
  asteroid crack, can be hit from its cannon within 10 s with good aim (with lead, within
  the cannon's arc). Each case runs 6 random sway patterns. Hull wear is off, so only
  direct hits count.
- `node tests/tutorial.js`: the tutorial's step machine, both branches (mouse with a failed block and the
  lock-LEFT detour; keyboard with the interceptor dead in the first fight): gates, the shot back on a miss, the
  block loop doing no damage, out of energy → reactor, the lever demo, the fire on climbing out (never spreads),
  the repair and the overview.
- `node tests/sway.js`: hitting an engine causes no position jump and no velocity kink.
- `node tests/cables.js`: the power lines' topology (reactor → trunk → lever → branches → capacitors), the energy
  bolts' way and timing, see 9r.
- `node tests/systems.js`: 25 checks covering the cannon and shield energy, the reactor
  timing and lever order, wasted energy, the wrench override, fuel crate → reactor,
  dropping items, the 5 s repair, broken capacitors, dimming lights, hull hits breaking
  parts in the right column, turret shots leaving along the barrel, the cable fizzle,
  and the invader (gets in, roams both decks, fights back, dodges, dies after 6 hits).
- `node tests/mission.js`: 23 checks.
  - The timeline: one of each encounter, about a minute apart, on schedule.
  - The radar: 45 s range, the "????" for unscanned imminent threats, scanning replaces it.
  - Diagnosis: two yellow, orange countdown, red when broken; servicing prevents the
    breakdown.
  - Locks: door closing, never on someone, 3 bonks to force; locked airlock; the
    intruder bashing a locked outer airlock for 8 s.
  - Fires: start rate, spreading or breaking, the extinguisher.
  - Win / lose: jump with energy; without, the stall loops and the hot zone escalates until the ship
    falls apart; lose with more than MAX_DAMAGE (5) broken.
- `node tests/softlock.js`: you can always get out. Covers being trapped in a broken
  airlock, stranded outside by a broken outer airlock, security locking the door you
  stand in, and multiplayer airlock doors.
- `node tests/sidebar.js`: plates for radar contacts (countdown, no red light) and for
  active problems (red light, listed first). New plates slide up from the bottom, and
  dealt-with ones leave. Fires and broken parts get plates.
- `node tests/clutter.js`: floor clutter is solid (or listed as walk-through), leaves no closed-off
  pockets, keeps click targets in reach and the intruder's routes free; dropped items land on free floor.
- `node tests/emitter.js`: shield emitters break on hits on their side (never by fire), block / drop their
  shield, can't be fixed from inside, are repaired on a spacewalk (all three reachable), and sync to browsers.
- `node tests/intruder.js`: 14 checks.
  - The routine: adjacent rooms only, sabotage after 10 s.
  - Engaging and strafing, the spit windup (0.7 s), pounce damage, the opening after a
    lunge.
  - Luck from the cat, and the front shield absorbing asteroids.
- `node tests/multiplayer.js`: several crew in one simulation, each with separate
  movement, inventory, panels and commands. Enemy fire aims at whoever is outside, the
  intruder picks the nearest crew member, and leaving drops your gear.
- `node tests/network.js`: the real server with WebSocket clients. Covers the lobby,
  mission choice, start, snapshots with both crew, input moving you, commands, sounds, a
  browser applying and rendering a snapshot, late join and leave, and prediction (your
  movement shows before the server answers, and you settle onto the server's position
  once you stop).
- `node tests/asteroids.js`: the front cannon swings exactly ±95°, and 4 body hits split a
  big asteroid.

## Third-party assets

- `assets/fonts/PatrickHand-Regular.ttf`: the Patrick Hand handwriting font (Patrick Wagesreiter,
  SIL Open Font License 1.1, unmodified, license text next to it, see `assets/fonts/README.md`).
  Declared as `'Patrick Hand'` in `index.html` for handwritten notes (e.g. the PIN pad's sticky note).

## Next (after feedback)

- Mission frame: jump in, a mission timer (about 5 min, maybe tied to the length of a
  music track), jump out. There are placeholder tracks in
  `~/Documents/deprecated_playground/godot/assets/open_game_music/` (not very space-themed).
- Consequences for hits (things break), shields costing energy, feeding fuel cells to
  the reactor.
- The first station mini-game (for example a cannon or power transfer).
- Capacitors and reactor: moving charge around, maybe through circuit-network-style wiring.
- Threats that arrive per zone.

## Open questions

- Capacitor capacity: 3 for now everywhere. Should the reactor's be bigger?
- Should the airlock open automatically as now, or only on E?
