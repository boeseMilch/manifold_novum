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
  for 2 s, then it recharges for 10 s (later it will cost 1 energy). The shield is a
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
- **Small hits:**
  - Half the time nothing happens.
  - The other half starts a fire on a part on that side, near the hit. If that side is
    already burning, it damages a part instead of starting a new fire.
  - A fire sitting on a part burns it out, spreads to another part nearby, or (20%) just
    keeps burning when its 15 s are up.
  - Large hits break 1 part (30%: 2).
- **Fires:**
  - Every fire sits on a ship part.
  - Left alone, every 15 s it either burns out exactly that part, or spreads to a
    different part in the same room or an adjacent room (same deck next door, or the room
    across the deck). A ring shows the timer.
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
  - Small hits do nothing 75% of the time instead of 50%.
  - A fire just keeps burning when its timer runs out 50% of the time (normally 20%).
  - A large hit breaks a second part 10% of the time instead of 30%.
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
- **Snack machine** (left cannon room, next to the kitchen): 1 energy from the left capacitor;
  eating it while hurt ends being hurt 10 s sooner.
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

## Balance

`node tools/balance.js` reads the game's constants and prints, for each encounter, the
shots needed (perfect aim and 50% misses), the reloads and shields that costs in energy,
and the energy that side can have by then (simulated: auto lever, capacitor limits,
refuelling right away). Current result: every encounter is feasible even with 50% misses.
The frigate is the tightest (it needs 5 energy and its side can have 5). The old
6-asteroid swarm needed 11 energy from a capacitor that held 3, which made it impossible.
To get there, capacitors now hold 4 and the frigate's heavy shot comes every 18 s.

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
