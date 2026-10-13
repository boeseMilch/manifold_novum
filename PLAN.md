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
  rooms. Outside it follows you, and on a cannon it frames the field of fire. Hold **Tab**
  for an overview of the whole ship.
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
- Controls: WASD or arrow keys to move, E or Space to use, hold Tab for the overview.
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
  - It starts with a fuel cell loaded. A cell holds 5 energy, made at one per 20 s; its
    screen shows the fuel and the progress, and the cell visibly drains.
  - There are 3 spare cells in the crate next to it. Click the crate to take one, then
    click the reactor (once it's empty) to load it.
- **Power lever** (below the reactor): the dial reads left → right LEFT · MID · RIGHT and
  starts on MID.
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
    lever, deck airlocks, outer airlocks.
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
    three damage lights.
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
  - At jump time the drive tries for 15 s and needs 1 energy in the middle capacitor (the
    engine room). Jumping wins, even with enemies still around.
  - Running out the 15 s loses, and so does having more than 3 systems broken at once.
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
- **Shields** grow out of their generator in 0.1 s and shrink back into it in 0.1 s.
- **Power lines:** real cables run from the reactor to the three capacitors and from each
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
- The **cat** hides during breaches and stares at nearby fires. **Emergency lighting** is
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
- **Radar dish:** drag to turn the dish, PING (2 s cooldown). Only the sector it points at (front,
  left, right, ±60°) echoes; blips land closer the sooner the contact arrives. Flares and storms
  echo everywhere. Pinging also lights up stealth fighters on that side. Crooked antenna: junk
  echoes; ion storm: static.
- **Oscilloscope** (helm): match two dials (frequency, amplitude) to the reference wave before
  the diagnosis readings show.
- **Patch board** (next to the lever): reroute which capacitor each lever output feeds (e.g.
  around an arcing feed line).
- **Tape job:** a quick click with the repair kit on a broken part (instead of holding): drag along
  three cracks. Faster, but taped parts are the first to break at the next big hit.
- **Crank:** reloading now takes 3 s on its own; cranking the wheel next to RELOAD (or holding R)
  brings it down to ~1 s. Hurt: slower.
- **Held shields:** keep holding the shield button for +2 s (1 more energy). Shields grow by age now.
- **Jump handle** (rule `handle`): when the drive spools up, someone holds the handle at the helm
  for 6 s (two people: faster); letting go resets it. The jump window doubles.
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
- **Rewards** (`computeRewards`): pay if the ship jumped (full with the objective, plus per pirate);
  XP only if you're inside the ship and standing at the end (half without the objective);
  reputation for finished objectives (+1 the first time). Levels at 100/250/450/… XP.
- **Ship upgrades** (reputation, `SHIP_UPGRADES`): spare cell, coffee machine, fuel inserter (with a
  handle to scooch the cells out of its reach), efficient cannons (4 shots), faster airlocks,
  long-range radar, shield capacitors (3 s), bigger capacitors (4), reinforced hull, sprinklers.
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
  idle, walk, aim, sabotage, stunned, down). **Rendered but not packed yet** (the sandbox lacks
  Pillow and the other chars renders). Until then: in the sprite view a stand-in (the crew suit with
  the visor down, greyed out and half see-through, a glowing visor), in ?classic a 2D figure. To
  pack, where Pillow/scipy and the chars renders are: render alien, pirate, npc and saboteur, then
  `python3 tools/sprites/pack.py chars`. The work's progress ring is round its feet (a ring on a big
  part like the reactor would be hidden under it).
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
- **Per crew size** `MISSIONS[id].crew` (fitted by `node tools/balance.js --calibrate` for ~68 % idle):
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
  without energy, MID has the jump's energy; checked with realistic and with perfect routing.
- **Results** (hit rate 0.6; events / idle for 1/2/3/4/8 players; spec for 1-4):

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
  lights) and screen-space shadows marched through last frame's depth buffer (2nd colour attachment,
  reprojected). Overview at 2560×1600 with ~55 lights, red alert, fires: ~130 fps (shadows off ~140).
- Soft shadows (the hard, dithered edges looked rough): the shadows are computed before the scene in a
  half-resolution pass (the surface each pixel showed last frame, rebuilt from its depth: the view is
  orthographic), one ray per pixel and light aimed at a random point of the light's disc (a penumbra
  that widens away from the caster; `size` on a light, default 0.08), each shadow-casting light in its
  own channel (28 channels in 7 RGBA8 layers; lights whose screen boxes overlap get different ones).
  A depth-aware separable blur turns the noise into smooth edges without bleeding over sprite edges or
  walls, and the lighting reads it back bilinearly where the 4 nearest texels show the same surface
  (else the nearest one that does; only surfaces missing from last frame's buffer still march per
  pixel). The depth buffer is RG32F now (depth + "casts shadows"), so every lit surface gets soft
  shadows, not just the casters. About the same GPU cost as the old per-pixel march (±0.5 ms).
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
  room names on their plaques (backlit, outlined; the lower rooms' plaques moved clear of the deck airlocks),
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
- What the rooms are, for theming decor (not UI labels for now; the plaques still say the game names):
  kitchen = Left Cannon (upper deck, left of the bridge; counter, fridge, table), bedroom = Right Cannon
  (right of the bridge; bunks, lockers), gym = Right Airlock (lower deck right, below the bedroom;
  treadmill), reactor room = Reactor (lower deck middle), bathroom = Left Airlock (left of the reactor room;
  toilet stall).
- The rooms already read as what they are, so only one thing was added (no going over the top): a dumbbell
  rack in the gym's top right corner, against the back wall between the wall beacon (x 40.6) and the right
  cannon's power line (x 42.6): `props/weight_rack` (`tools/blender/models/props/gym.py`; origin = its
  footprint's centre on the floor, (41.5, 15.36), 1.5 × 0.62, 0.8 high so it stays under the room plaque),
  coloured small dumbbells up top, big black ones below with one slot empty and one duct-taped, a towel
  over a post, a "RE-RACK IT" label. Decoration only: not in SOLIDS (gameplay unchanged), sprite view only
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

## Balance

`node tools/balance.js` reads the game's constants and prints, for each encounter, the
shots needed (perfect aim and 50% misses), the reloads and shields that costs in energy,
and the energy that side can have by then (simulated: auto lever, capacitor limits,
refuelling right away). Current result: every encounter is feasible even with 50% misses.
The frigate is the tightest (it needs 5 energy and its side can have 5). The old
6-asteroid swarm needed 11 energy from a capacitor that held 3, which made it impossible.
To get there, capacitors held 4 and the frigate's heavy shot comes every 18 s. With capacitors
back at 3 (8w), the frigate with 50% misses is short again (needs 6, its side can have 4); with
perfect aim it's fine, and the bigger capacitors upgrade restores 4.

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
- `node tests/sway.js`: hitting an engine causes no position jump and no velocity kink.
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
  - Win / lose: jump with energy, lose without, lose with more than 3 broken.
- `node tests/softlock.js`: you can always get out. Covers being trapped in a broken
  airlock, stranded outside by a broken outer airlock, security locking the door you
  stand in, and multiplayer airlock doors.
- `node tests/sidebar.js`: plates for radar contacts (countdown, no red light) and for
  active problems (red light, listed first). New plates slide up from the bottom, and
  dealt-with ones leave. Fires and broken parts get plates.
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
