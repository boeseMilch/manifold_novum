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
  mug steaming on the kitchen counter, a donut box on the holo map table, a bucket under a leaking
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
  float along the hull on a safety line. No invisible wall 2.8 units off the hull any more: you
  may drift as far as keeps the ship on screen (`EVA_REACH` 9.5 sideways / 6.5 up-down from the hull's
  nearest point, from the outside camera's smallest view, 25.3 × 17.3 units, minus HUD/sidebar margin).
  The edge is soft (`evaDrift`): past 60% of the way out your outward drift fades to a stop, and when you
  stop pushing outwards you drift gently back. A docked ship's or the pirate base's rooms can't be floated
  into (`dockBlocksEva`; anyone caught there when it docks can float out).
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
    - **From the side** (2026-10-16, "asteroids from the side" for variety): a swarm event has a side,
      `front` / `port` / `star` (`EVENT_SIDES.swarm`: random; written swarms without a side get one at the mission
      start, `fillSides`). A side swarm's rocks start 42 units out on that flank (about as long to the hull as from
      ahead, ~23 s) and fly roughly sideways at it (y 3..18: the cannon room and the top of the airlock room, the band
      the side cannon's view frames), same speeds; they hit that side (`shipHit(side, …)`), that side's shield eats
      them (a crossing test on `shieldX` within y -0.5..25.5: 0/120 big rocks hit with it up), and that side's cannon
      shoots them (tests/asteroids.js: 6/6 swarms cleared aiming only at what its view shows). Radar / sidebar /
      banner say the side ("Asteroid swarm — left"); practice has left / right entries. Chapters 1, 2, 3 and 5 are
      approved as built: their swarms say `side: 'front'`, and `MISSIONS[id].sides = { swarm: 'front' }` keeps their
      repeats and hot-zone swarms ahead too (no extra random draws: their builds and ratings are unchanged).
      Everything else draws. Balance model: the same job on that side's cannon and capacitor (the encounter
      calibration still measures a front swarm).
- **Enemy fire:** light shots hit a random spot on that side of the hull, or (40% of
  the time when someone is outside) aim at you. Hits are only recorded for now (small,
  large, crew), and they leave scorch marks on the hull.
- **Heavy shots:** a 4 s charge that everyone hears (a rising whine) and sees (a glow on
  the enemy plus an on-screen warning with a progress bar).
- **Shields:** three big buttons on the lower deck: left, right, and front (reactor
  room wall, under the bridge; middle capacitor). The front shield is a hex arc around the
  nose that eats asteroids; the side shields eat the side swarms' asteroids.
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
- **Inventory:** a weapon slot and an item slot (bottom centre since the HUD pass; click one to drop it).
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
  - A wrench stuns it. It has 6 HP (laser 1, wrench 1 + stun) and leaves goo when it dies.
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
  - A mission can hold several maintenance failures (a written list or the bigger crews'
    repeats). Each has its own pair of parts (`ev.sys` breaks, `ev.decoy` is just shaky; all
    different, inside, not broken; `pickMaintPairs` in `layoutMission`, the first pair drawn up front
    as before so the balance model's seeded builds stay the same). A pair reads yellow ("irregular
    readings") from `MAINT_YELLOW` = 3 min before its break (`ev.warnFrom` overrides: the tutorial's
    from the start); with several pairs yellow at once each line names its partner. A part of a pair
    broken before its warning starts is swapped for a working one (`armMaintPairs`).
  - The real one turns orange with a countdown 20 s before it breaks, and red once broken; the decoy
    goes back to normal.
  - Servicing it with the repair kit (hold click for 5 s) while it's orange prevents that
    breakdown (`ev.serviced`). The sidebar has a FAILING plate per orange part and, once the helm
    was looked at during its warning (`ev.seen`), an IRREGULAR plate per pair ("A or B").
    `maintWarnings()` lists the pairs warning right now (for markers). `mission.maint` is gone: the
    state lives on the events (and in the snapshot with them); the balance model looks at the helm
    once per failure, when its pair turns yellow.
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
- **Hits** (odds changed 2026-10-13; luck used to be much stronger; 2026-10-14: 24% / 6%, was 20% / 10%):
  - Small hit: 24% a fire on one of the 3 parts nearest to the hit on that side, 6% a
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

- **Green corner brackets** (since the HUD pass: a soft yellow glow) mark everything you can click (consoles, radar, cat, ladders,
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
- **Coffee** on the kitchen counter (between the sink and the stove; it used to stand by the helm,
  where nobody noticed it): 15 s of slightly faster walking. Big hits may tip the mug over; it
  refills itself after a minute. The tutorial's ship tour has its own page for it and marks the mug.
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
- **Forcing an outer airlock** (any mission): the manual override on a broken or locked outer
  airlock opens both its doors at once, so it is the same 10 s vent of that airlock room
  (`forceHatchVent` → `startVent(room, you, forced)`): air rushes out, anyone else inside is
  hurt, hostiles get hit and blown out, blast doors seal it off from the reactor room. The one
  who forced it is fine (visor down) and still goes out / comes back in. Then the hatch swings
  shut and the room repressurizes. The prompt warns first ("… vents this room!"); banner and
  sidebar ("AIRLOCK FORCED · VENTING"); `hz.vent.forced` is in the snapshot. Crew caught in the
  room leave by the deck airlock; one vent at a time (forcing the other side ends the first).
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
  its side every 20 s. Shells pop them on the way in; spacewalkers can pry them off (1.5 s). Shields don't
  stop them (2026-10-16, the user: like spores and mines they slip through; they used to burn them off).
- **Spore mother** (`mother`): puffs spore clouds (barnacles) every 12 s; after each puff one of
  its three sacs opens for 3.5 s — the only time it can be hit.
- **Leviathan** (`leviathan`): 30 s; every 4 s it bumps the next room in a sweep (red warning on
  that room's floor, the sidebar lists the next ones): crew inside get hurt, plus a small hit there. (Nightmare only now;
  chapter 8 has the boss fight `leviathan_boss`, js/leviathan.js: see "The infested leviathan" below.)
- Enemy weak spots can be `closed` and react `onHit`; enemy kinds marked `special` are left out of
  the reachability test. `node tests/organic.js`.

- **The whale rework (2026-10-17, the user: 'make it nicer, the head looks like it's falling off'):** the model now follows the
  concept's whale profile (a blunt head, widest ~28 behind the nose, a long taper, a crescent fluke, broad pectorals), modelled once and
  cut into windows so skin detail runs across the joints (pieces levb_head, levb_seg_0..5, levb_seg_tail, levb_fluke; all at scale 1;
  joints in the manifest). The chain is laid out from the head back with a bend limit per joint (LEVB_BEND: 14° at the neck), so the
  head stays on. Checked in the cannon views players actually see. Fixed: after the first eye phase it parked on the side it had just
  finished (stale P.side).

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
  hurts (the extinguisher works), S-7 (below; it replaced the intruder asleep in the core), plus the
  mission's objective.
- **S-7, "The Culture"** (2026-10-16, the user's pick of the docking concepts; `js/culture.js`, state in `dk.dock.s7`,
  synced with `dk`): Dr. Varga's lab is overgrown by S-7, a grappler tissue cutting that thawed when the Red Comet
  pirates cut the power to her cryo freezer. A growth, not a creature; on every derelict (Varga's lab, Black box, the
  stranded engineer). Story text: c3's briefing ends "And something in there is still alive. The station's freezer log
  has one line: KEEP S-7 FROZEN."; the Black box blurb likewise.
  - **Tendrils** (6: 1 in the lab's airlock, 3 in the lab, 2 in the core, one across each inner doorway; `s7Geom`).
    Within 1.6 units of a tendril's head (line of sight) it twitches (0.6 s; +0.3 s per easier difficulty step,
    +0.3 s solo), then GRABS: held in place (no walking; aiming, shooting and spraying still work), squeezed with
    `hurtCrew` every 3 s (+1 s per easier step); someone who goes down is dropped (the tendril recoils 8 s). A laser /
    blaster / wrench hit on the tendril (its body, root to head) frees them, recoil 4 s; the extinguisher's spray
    (cold CO2) 15 s; mashing move / use keys (22 presses, ~4 s) wriggles free, 3 s (`s7Struggle`, from simTick).
    Recoiled tendrils don't grab. The lab's fire makes tendrils within 3 units recover twice as fast.
  - **J1 and the freezer**: junction J1 in the lab's airlock opens a patch-board-style panel (`ui.mini.kind 'j1'`:
    click our tether line, then the lab circuit; only C3 "COLD STORE (S-7)" works, the others flicker). Then hold
    click 2 s on Varga's freezer (in the lab): it draws 1 energy every 20 s (25 / 30 on easy / very easy) from OUR
    capacitor on the docked side (left for port, right for starboard); empty, broken or wrapped: it stops ("The
    freezer stopped …"). Click it to switch it off. Varga's own extinguisher hangs by the tube (an item, `s7Dock`).
  - **The cold**: while it runs each room's cold rises (lab frozen after 15 s, the airlock 25 s, the core 30 s);
    frozen rooms turn the growth into grey husks (they release whoever they hold and don't grab). Off: −1/40 per s,
    alive again below 60% (~16 s). The HEART in the core is wrapped round the black box: the box can't be taken
    (the prompt says why) until the core is frozen; then "The heart let go of the black box".
  - **The creep**: from docking a tendril grows along the tube toward our warm ship: 60 s to our airlock room (×1.3 /
    1.6 easy / very easy, ×1.5 solo), twice as fast inside it, then it wraps that room's capacitor: no charging
    (energy wasted, banner), no using it (`capWrapped` in `useEnergy`), so no freezer either. Spraying pushes it back
    3 units/s, a shot 1 unit; the wrap takes 2 s of spray or 3 hits (then it's pushed 3 units back). It withers when
    the core freezes (the heart turns to a husk) and dies when the derelict casts off.
  - Banners: the first grab ("S-7 has …! Shoot or spray the tendril — or wriggle free"), squeezes, J1 patched, the
    freezer on / stopped, each room freezing / thawing, the heart letting go, the creep reaching our airlock, the
    capacitor wrapped / freed, the tether cut. Sidebar: a FREEZER plate ("drawing from the left capacitor · cold %")
    and an S-7 plate (box held / free, creep %, who it has). Decor: "S-7: KEEP FROZEN. I MEAN IT. — I.V.", "SPECIMEN 7 —
    DO NOT FEED (IT FEEDS ITSELF)", "IF GRABBED: WIGGLE", "DAYS SINCE LAST INCIDENT: 0", "WARM IN HERE, ISN'T IT", a
    cocooned pirate on the lab wall. Lights: the heart's pink pulse, the running freezer's cold blue.
  - Drawing: `drawS7Floor` (in drawDock: mats, frost, freezer, J1, cocoon, heart) and `drawS7Live` (in
    drawDockActors: tendrils, the creep, the wrap, the tether line). Every piece tries its sprite first (`s7Spr`:
    `GFX.on && GFX.info(name)`; names in `S7_SPRITES`: dock/s7_mat_{airlock,lab,core}[_husk] at the room centre,
    dock/s7_tendril[_twitch|_grab|_recoil|_husk] at the root facing the head (frameIndex by angle, frame by time),
    dock/s7_heart / _open (frozen, box still in it) / _husk, dock/s7_creep_seg every 0.5 units along the path + dock/s7_creep_tip,
    dock/s7_wrap_capacitor at our capacitor, dock/s7_freezer_off/_on, dock/s7_junction_dead/_patched, dock/s7_frost (alpha =
    the room's cold), dock/s7_cocoon_pirate), else a procedural 2D drawing (fleshy purple mats with glowing green
    nodules, thick curved tendrils that wobble / twitch / coil round whoever they hold, the pulsing heart, pale frost
    with crystals, grey husks).
  - Practice: "Derelict: S-7's creep at our airlock", "Derelict: J1 patched, freezer on". The derelict's sleeping
    intruder is gone (`contents.alien` too).
  - Balance model (tools/balance.js): the derelict job counts grabs (2, rescue 3; 3 s each, 0.3 crew hits each), J1
    (8 s), the freezer hold and the wait for the core's cold (black box), the freezer's draws on our capacitor (the
    energy runs: `plan.freezers`; a draw on an empty capacitor delays the job, the lever is routed there), and the creep
    as its own job at our airlock (late: clear the wrap). DERELICT_ALIEN is gone. Re-calibrated (`--calibrate`):
    c3 events 2/2/6/8/11/13/15/17, cells 2/2/2/6/9/9/11/11 (was 2/4/7/10/12/15/17/19; solo 34% idle with only the opener
    and the lab: tests/scaling.js lists c3 with the essentials-only missions, SHORT); Black box events 2/2/7/11/14/17/20/23,
    cells 2/2/3/8/8/12/12/17, now overcharged and recommending the inserter (solo 46%); Stranded engineer events
    3/4/8/11/13/17/19/24, cells 2/2/3/4/5/6/7/8 (solo 50%).
  - Tests: tests/dock.js (grab after the twitch, held, squeezed; self-free by shot, spray, wriggling; a crewmate's shot;
    J1 + freezer drain our capacitor; rooms freeze in order, husks don't grab; the heart and the box; the creep reaches,
    wraps, is sprayed / shot back; cast-off and the frozen core kill it; the snapshot carries S-7; no intruder).
- **Objectives** (`mission.objective`, `objectiveStatus()`): `blackbox` (heavy: 60% speed, no
  weapon while carrying it), `rescue` (treat the engineer, they follow your footsteps, safe once
  aboard; a hit downs them again), `ore` (a big asteroid drifts past in front; drill it on a spacewalk
  with the mining drill, 6 s per sample, bring the samples in: see below), `pirates` (defeat N). Jumping without the
  objective done: survived, but the mission failed.
- **No jumping while docked** (playtest 2026-10-14, `dockJumpHold()` / `releaseForJump()`): the jump waits with
  "Jump blocked: …" while a ship is docked. Once the jump is due, docked ships let go: pirates aboard ours drop
  everything and run home (their ship casts off when they're all back, at once if none is left alive); the
  derelict's tether releases after 8 s. Whoever is still over there is cast adrift as before.
- **Destroy two pirate ships** (2026-10-16, user request; objective kind `raiders`, `dk.ships`, synced with `dk`): First
  Contract, Red Comet Cove and its twin Pirate cove now want 2 raiders destroyed (chapter 4 and Pirate cove: a nav core instead since, below) (was 2 / 3 pirates defeated). A raider
  shot to scrap counts, and so does a docked one whose reactor we jammed: it blows apart as it casts off (big blast,
  banner). $40 / $50 per pirate is still paid as before. Pirate cove's interceptor became its second raider, re-calibrated
  (now needs cannons + inserter and the overcharge, like Red Comet Cove). `tools/balance.js` counts a raider per
  `pirates` event.
- **Chapter 4: the nav core** (2026-10-16, user: "we should not give the same mission twice"; objective kind `navcore`, item
  `navcore`, both new ids; 'raiders' stays for chapter 1): Red Comet Cove and its twin Pirate cove want "a Red Comet nav core
  aboard" (the step before chapter 5's "We found the Red Comet's hideout"). Two ways, two raiders (essential at every crew size):
  - **Board it:** a docked raider's core room has a nav console beside the reactor (`g.nav`, `dk.dock.navcore`): hold click
    `NAVCORE_PULL` 4 s → the nav core in your item slot (light). The pirates shoot as usual. The brig barge has none.
  - **Fish it out:** a raider shot to scrap (while no core is aboard yet, `flingNavcore`) flings its core clear: `hz.floating`
    with a drift (`vx` 0.03 outwards, `vy` 0.08 along the hull) and a `life` of `NAVCORE_LIFE` 60 s, ~4.6 units out beside the
    hull at the wreck's height (inside the spacewalk's reach); a countdown over it and a NAV CORE ADRIFT plate; then it's lost
    ("Another raider's will do"). js/hazards.js moves / expires any floating thing with `vx`/`vy`/`life`.
  - Done when a core is aboard our ship (`objectiveAboard`). Pirates don't loot it. $50 per pirate as before. Briefing / blurb
    rewritten (the black box: the Red Comet took Varga; their hideout is in every raider's nav computer), lobby objective
    "Bring a Red Comet nav core aboard.". Drawn in 2D (a console with a star-map screen and the core's glowing slot; a hex data
    core with a red comet); sprites can come later as `dock/raider_navconsole` (frame 0 core in, 1 pulled, +2 starboard) and
    `items/navcore` (spin frames), used as soon as `GFX.info` knows them.
- **The ore asteroid drifts past; two samples** (2026-10-16; chapter 6 and Ore run, `objective { kind: 'ore', count: 2 }`, the
  count defaults to 1): `EVENT_RUNNERS.rock` (the event now has a side) sends it in from that side at `ROCK_Y` −7.6, across the
  front and out the other side at `ROCK_SPEED` 0.25 units/s (×0.8 easy, ×0.65 very easy). Drillable while its centre is in
  `ROCK_REACH` x 6–45 (its near side within the spacewalk's reach; tests/dock.js checks the ends): ~20 s after it shows up, for
  156 s (195 s easy, 240 s very easy), then it drifts off. Banner "Ore asteroid drifting past: N s left in reach", a plate
  with the seconds left and the samples aboard. Each sample: drill 6 s (the drill spot follows the rock), grab it, carry it in:
  inside our ship it's stowed (`dk.ore`, hands free for the next trip). Objective text "Bring 2 ore samples aboard (1/2)".
- **Balance model:** the scheduler got follow-up jobs (`after(job, finish, late)`, released when a job is done) and lost
  objectives (`late` → `{ lost }`). Nav core: the first raider shot down → a spacewalk fetch (deadline the core's life);
  docked → boarding it for the console (4 s + the walk, 0.3 crew hits) besides the boarders; the second raider's core only
  if none is in yet. Ore: one drill trip per sample (from the hatch nearer the rock where it will be), each released when the
  last is done, lost once the rock is out of reach. Re-calibrated: see "The expected kit" below (nav core / drifting rock).
- **Fallen pirates stay down** (`dk.bodies`, purely visual, synced with `dk`, at most 12): a short dazed
  stagger, then they lie where they died (`chars/pirate/down`). Nothing to pick up.
- **Dr. Varga / the engineer walks properly** (`updateNpc`): once treated she makes her own way to our ship
  on the pirates' routes (doors, tube, our nav graph); no more following footsteps. A stray shot on the way
  downs her again. Safe only once she's in one of our rooms (not in the tube's mouth, where casting off used
  to take her along); then she steps clear of the hatch. Routes skip chain points behind you.
- **Clutter and jokes aboard** (`DOCK_DECOR`): our clutter sprites, runtime plaques and floor stencils. Raider:
  pizza, soda, a duck by the reactor, "WANTED: ONE SHIP CAT · 10,000 CR", "NO REFUNDS", "DAYS WITHOUT A
  MUTINY: 3", "LICK IT. WE DARE YOU.", "PLUNDER RESPONSIBLY". Prison barge: "VISITING HOURS: NEVER", "THE BRIG
  IS NOT A HOTEL", tally marks by Varga, bucket and bedroll. Varga's lab: papers, a dead plant, cold coffee,
  "TO DO: 1. CURE IT 2. NAME IT 3. DON'T GET EATEN", "SPECIMEN 7 — DO NOT FEED", "DAYS SINCE LAST INCIDENT: ?".
  - **Story-telling sprite clutter** (2026-10-17; `DOCK_DECOR[*].sprites`, drawn by `drawDockClutter`, GFX only: the
    classic view keeps its 2D props), after the concept art (culture / derelict / raider key art). Varga's lab tells
    the fight: the Red Comet's boarding claw bitten into the roof over the lab (`dock/lab_claw`), the defenders'
    barricade at the core door with the carbine they dropped, scorch blots and laser burns, drag marks and one of
    Varga's clogs on the way to the airlock (they took her), S-7's smashed tank, a tank knocked over ("OOPS"), a
    tipped chair, a bench with the sample rack in the airlock and one with a monitor in the core, Varga's red-string
    notes board, Gerald the dead plant, mugs, papers and sticky notes ("ALSO DO NOT LOOK AWAY", "DO NOT FEED",
    "BACK IN 5 MIN"). The two benches glow (js/lights.js), and the derelict's ambient went up a little so the clutter
    reads in the dark. Raider: the robot parrot on its perch (idle loop) under "TODAY'S PLUNDER", the stuffed parrot's
    cage, the space anchor (decorative), sandbags, "QUOTA OR KEELHAUL", the ship's-wheel card table with rum, oil /
    not-rum drums and the spares hook (eyepatch, hat, hook) in the airlock, the treasure map by the nav console, a
    hammock in the reactor room, and the sprite "DAYS WITHOUT A MUTINY" board in place of the canvas plaque (`replaces`).
    The barge reuses the card table, rum, drums, hook, mutiny board and a skull stencil. Flat pieces go in the 'wall'
    layer just over the ship sprite and under S-7's mats (`dockFloorBand`: 'decal' would be under the ship's floor).
    Port layout, mirrored for starboard (`flip` for pieces with no writing, `_l`/`_r` drag marks). Not used: the lab's
    broken freezer and frost (S-7's freezer is the real one), the shelf, the other tank variants, the blank plunder
    board, the mutiny board on 0. tests/clutter.js checks the standing pieces keep out of the walking line and off the
    crate, reactor, nav console, fire, engineer and S-7's freezer, J1, cocoon, heart, extinguisher and tendrils.
  - **The lab's look, closer to the concept** (2026-10-17): S-7's mats are emissive (the green nodules glow); long
    decorative floor tendrils (`S7_VINES` in js/culture.js, chains of `dock/s7_creep_seg` with a tip) run from the heart
    through the doorways across the lab to the airlock, up to the cocooned pirate, round the core and from J1's corner,
    grey husks where a room is frozen. The cold shows as a frost field (`s7FrostField`: many frost blots fading in from
    the freezer's side as each room's cold rises, then a haze). Light (js/lights.js): a cool grey ambient, bluer with
    each room's cold, a dim flickering grey-violet fill per room (icy once frozen), the red emergency strips cut to
    accents, the running freezer's blue light growing with the lab's cold and a cold glow per chilled room.
- **The pirate base** (chapter 5, the user's design, 2026-10-14; `dockBase` and "The pirate base" in js/dock.js, event
  kind still `brig`): the whole mission is the base. A patrol interceptor (the opener, 25 s), then at 60 s we dock
  (waits until the patrol is gone). Rooms in a row (`baseGeom`, port layout mirrored): docking bay → server
  room → barracks → gun corridor → brig, walked on a chain like the other ships (`dockRoute` takes `g.chain`). Two pirates rush out
  of the bay at once and hunt the nearest of us (onto our ship); they drop their carbines (pick-up laser guns) and
  their bodies. Guards hold each room (`baseGuards`: solo 2/2/1, +1 per extra crew member up to 4, −1 per easier
  difficulty step, never below one) and come at whoever enters their room. A repair kit lies in the bay. The server
  room's security terminal is broken: repair it (kit, 5 s), then hack it (5 s) → the barracks door opens. The brig
  door's keypad (the PIN pad, `ui.mini.door`) wants a random 4-digit code, stuck on the barracks' back wall ("DO NOT
  WRITE DOWN"). Dr. Varga lies in the brig: treated, she runs home on her own; shot, she goes down again. Shots stop
  at the base's walls (`dockSolid` in `freeAt`). Drawn in 2D at first (now sprites, below; hull, floors, terminal, keypad, cell bars, plaques:
  "RED COMET BASE", "CHORE WHEEL", "BRIG RULES"), lit warm like the raider.
  - **The gun corridor** (2026-10-14, user feedback): 12 units between the barracks and the brig (the brig moved
    off its far end; the code door is now in the corridor's wall right beside the gun). A sentry gun (`updateSentry`,
    `dk.dock.sentry`, synced with `dk`) sits on a pedestal at the far end, fixed facing down the corridor. Anyone in
    its field of fire (±0.36 rad, 13 units, clear line: the cover blocks it) makes it spool up (`SENTRY_SPOOL` 1.3 s;
    a rising whine `sfx.charge`, the barrel glowing, a red fan on the floor, "SPOOLING UP!" tag), then it sprays
    bolts (±0.3 rad, 7/s, 16 units/s, owner `sentry`: they hurt the crew like a pirate's, stop at walls and cover)
    for 5 s whatever it sees, then cools 3 s (time to run to the next cover). Three stacks of crates against
    alternate walls are the cover: holes in the corridor's walkable floor (`g.floor`, `floorMinus`), so nobody
    walks through them and shots and sight lines stop at them. Right beside the gun you're out of its fan: hold
    click on it there to switch it off (4 s by hand, 2 s with the repair kit). A guard posts at its end. Dr. Varga,
    treated, waits in the brig while it's live ("I'm not walking into that sentry gun!"), so the gun is part of
    the rescue. Easy / very easy: spool 1.9 / 2.5 s, 4.5 / 3 shots a second. Drawn in 2D (sprites: our crate props
    stacked, and a small copy of our hull cannon on the pedestal). Guard counts unchanged (the brig's guard now
    stands at the gun's end, a second one for big crews in the brig).
  - **Engine off while docked or while anyone is over there** (`baseJumpHold`). Once she's aboard our airlock offers
    **detach** (also once the jump is due, as a way out): the tube pulls in (whoever is in it lands on our side), the
    base stays right there. Stranded? The bay's docking control (or our airlock) docks again: no softlock; nobody
    can be left over there for the jump. Detached with her aboard and nobody left over there: the jump drive spools
    up in 15 s (`ESCAPE_SPOOL`); otherwise the jump is due at 300 s (`length: 300, finaleLead: 240`) with the usual
    hot-zone pressure. A bigger crew gets more guards, not more encounters (`crew.events` 2 for all).
  - All of it lives in `dk` (tube, terminal, door code, guards), so the snapshot carries it.
  - **The captain's quarters** (2026-10-17, from the boss concept; the boss fight itself comes later): a 12 x 10 room
    between the gun corridor and the brig (`baseGeom`: rooms are now [bay, server room, barracks, brig, gun corridor,
    quarters], port coords relative to the hatch y: quarters R(-40, -20.7, -28, -10.7), brig moved to R(-37, -29.1, -29,
    -21.3), npcSpot (-35.9, -25.2), cell bars at x -34.6). Doors: [0 bay–server, 1 server–barracks (hacked), 2 gun
    corridor–quarters (the old code door, keypad `g.keypad`), 3 barracks–corridor, 4 quarters–brig R(-33.4, -21.3,
    -31.8, -20.7) (its keypad `g.brigPad` (-31.2, -20.6), on the quarters' back wall)]; `d.doors` starts [F, T, T, F, T].
    The barracks code opens door 2; door 4 takes the same code for now (`openBasePad(i)`, `baseCodeOk(i)`, `ui.mini.door`
    = 2 | 4) so chapter 5 stays winnable until the boss step locks it. The pirates' blast door `g.blast` R(-28, -19.3,
    -27.3, -17.3) in the quarters' side wall: not a door rect, never walkable, bolted ("CREW ONLY · REST OF BASE", a
    prompt without an action); `d.blast` 'closed' (the sprites also have 'alarm' / 'open' for the reinforcements later).
    Cover in the quarters (`g.qcover`, floor holes like the corridor's crates, shots stop at them): the overturned desk
    R(-38.6, -14.2, -36.2, -13.4), the chest R(-31.3, -13.35, -29.9, -12.45), a pillar R(-31.8, -17.85, -30.9, -16.95).
    For a big crew the second guard of the gun group holds the quarters (room 5) instead of the brig. The chain runs
    brig → brig door → quarters → corridor door.
  - **Drawn with its Blender sprites** (2026-10-17, `drawBaseSprites`; group `base`, packed by `tools/sprites/pack.py base`,
    preloaded at docking): floors, open doorway floors, hull and walls (screen tiles at the hatch), the doors (locked /
    sliding open, client-side frames), the brig door with its keypad, the blast door and its floor decal, terminal (3
    states, animated), keypad, docking control, cell bars (closed until the brig door opens, then the cell door hangs
    open), the corridor's cover stacks and the sentry pedestal (+ our hull gun on top), the code note with the code in
    note_digits, plaques (`DOCK_DECOR.base.spriteSigns`), and the furniture and clutter in `BASE_PROPS` (CCTV wall, rack
    bank and rack, cables, GROG machine, captain's chair, taped chair, bunks, lockers, card table, bedrolls, dartboard,
    pizza, bottles, escape pod, throne, cat bed, grog barrel, wanted poster, portrait, trophies, map table, loot piles,
    desk / chest / pillar, stencils, bucket, tally marks, casings, doormat). The rug is part of the quarters' floor render
    (base/rug and base/desk upright are unused). Still 2D on top: the "SERVER ROOM" plaque (canvas sign), the floor
    stencils of `DOCK_DECOR.base`, the sentry's fan and tag, the tube stubs once detached; and everything in the classic
    view or while the pages load (2D quarters: crates for the cover, a hazard-striped blast door, the brig keypad).
  - **The boss: Captain Red Comet** (2026-10-17, the user's approved design; js/captain.js, tests/captain.js). He waits on his
    throne in the quarters (`dk.boss`, synced with `dk`) and starts when someone walks in ("Who let you in here?!"); with nobody
    standing in there for 3 s he walks back to his throne (no healing). ~1.4x a pirate (chars/captain, 0.9 footprint, never
    leaves the quarters). A shield generator on his back projects a FRONT shield: our bolts (`captainBoltTest` in
    `boltHitsBody`) hit either the generator (0.55 behind his centre, r 0.42, at its height) or his body; the body from the
    front ripples off (fx/boss_shield_hit), from behind it clanks off his armour. HP 24 solo, +12 per extra crew member (up to 4).
    - Phase 1 (100-50 %), repeating: BUCKSHOT x3 (turns to his target, the last one who hit him or the nearest; a laser-sight
      cone for 0.6 s, then 7 pellets in a ±0.5 rad spread, 12 u/s; cover stops them) → SPIN (0.45 s planted, a ring on the
      floor; 1.5 turns at 5 rad/s, a 2-armed spiral of bolts from the cannon 33° right of his facing, on 0.34 s / off 0.16 s
      gaps; his generator sweeps past) → CATCH BREATH 3.5 s (facing a wall closely, he steps back off it first).
      At 75 %: ALL HANDS (he whistles; the blast door 'alarm' → 'open' → 'closed'; 1 / 2 / 3 pirates by crew size, minus the
      difficulty step, never below 1; at most 3 door pirates alive; they're room-5 guards).
    - At 50 %: the transition, 2.4 s: the full bubble (invulnerable), "ROAAAR!", p1_coat_off (coat_floor dropped at 1.3 s),
      the quarters' lights go red (js/lights.js), a pirate wave. Then COMET MODE.
    - Phase 2, repeating: BUCKSHOT x2 (0.45 s telegraph) → DASH (fx/boss_dash_line from him through his target to 2.5 units
      past them, max 11, cut at the first wall / cover; 0.8 s of rising whine, then 15 u/s along it, fire patches every 0.7
      units that burn 5 s and hurt (every 1.5 s per person; the extinguisher puts them out: a new one in the barracks);
      anyone in the path takes a hit and is knocked 1.2 units aside). Line ended at a wall or cover → DAZED 2.5 s (no shield,
      double damage from any side); in the open → straight into a 3-armed spin at 6.5 rad/s → CATCH BREATH 2.5 s. One more
      door pirate every 30 s (max 3 alive).
    - At 0: the generator bursts (fx/boss_gen_burst), he staggers (p2_defeated_stagger) to his escape pod (base/pod_open,
      closed, launched; `BASE_PROPS` draws `dk.boss.pod`), "THIS ISN'T OVER!", it launches; the brig door's LOCKDOWN lifts
      (door 4 opens; before that no code opens it: `baseBrigLockdown`). He never dies.
    - Easy / very easy: telegraphs x1.35 / x1.7, breath +1 / +2 s, daze +0.7 / +1.5 s.
    - Drawn: his sprites (both phases, 8 dirs), the shield in a back and a front half around him, the bubble, the muzzle blast,
      pellets and spin bolts (`drawCaptainBolt`), the dash line, the fire trail, the dazed stars, the coat; the buckshot cone
      and the spin ring on the floor; name tag + state; a health bar on screen while the fight is on (75 % and 50 % ticks);
      a sidebar plate with his cycle state. 2D fallback: a bigger red crew figure, a blue shield arc, a blue generator box.
    - **The raider twist** (2+ players only, never solo): 6 s after the fight first starts (or 150 s after docking with someone
      in the base) a Red Comet raider docks at our OTHER airlock (`dk.raid`: only its tube is walkable, `raidRects` in
      `dockRects`; its ship, reactor and loot crate drawn like a docked raider's). Its two pirates (`p.raid`,
      `raidPirateMove`) take fuel cells from our crate (twice each), shoot whoever they see, and cast off once both are home
      (or down: empty-handed), or when the jump comes. Whoever stayed aboard has to stop them.
    - Practice: "Captain Red Comet (phase 1 / phase 2)" (the base docked, the rooms cleared, the sentry off, at his door).
    - Balance model (tools/balance.js, the 'brig' event): the fight as jobs for up to 3 crew (hits on the generator in the
      breath windows and, phase 2, half the dashes' dazes; 0.8 hits per 0.95 s shot), his door pirates, the raider for 2+.
      c5's idle, solo / 2 / 3 / 4 / 8: 54 / 75 / 83 / 87 / 94 % before → 5 / 33 / 46 / 55 / 77 % with him (solo "tight": the
      model's horizon is the 300 s jump, which in the game waits while we're docked). Encounter counts unchanged.
- **Nobody aboard at the jump = failed** (every mission, `crewAboard` in js/mission.js): the ship jumps out empty
  (everyone on a spacewalk or over on a docked ship): mission failed, no pay. A cannon seat or an airlock counts as
  aboard; down or out too (they're carried along).
- New missions: Pirate cove, Black box, Stranded engineer, Ore run, Nightmare (everything);
  Deep drift gets the organic and ship-wide encounters. (Reworked into a campaign next.)
- `node tests/dock.js`.

### 8h. Campaign and progression (`js/progress.js`)
- **Campaign** (`c1`–`c8`), each with a briefing, objective and pay: First Contract (defeat pirates,
  $16 each, no intruder) → Strange Cargo (the intruder appears) → The Empty Lab (black box from
  Dr. Varga's drifting lab) → Red Comet Cove (pirates took her) → Rescue Dr. Varga (storm the
  pirate base) → Spore Season (living rock sample) → The Deep (gravity tides, coils, jump handle, herds) → The Mother of All
  (spores, the spore mother, the grappler, herds, the leviathan; a fixed escalating timeline since 2026-10-16). Each finished chapter unlocks the next.
- **Success** (`missionSuccess`): the ship jumped out AND the objective is done (missions without
  one: the jump is enough). Only a success earns reputation (+1 the first time), counts as finished
  (`profile.done`, the ✔ in the lobby) and unlocks the next chapter.
- **Rewards** (`computeRewards`): if the ship jumped, the crew gets paid (base pay plus per pirate),
  objective or not. (XP and levels are gone since 2026-10-17: see "No more XP" at the end.) Jumped without the objective: the end screen says "objective failed", shows the pay and
  that the next chapter stays locked. (Before: no base pay and half XP without the objective.)
  `profile.done` always meant "completed with the objective", so no save migration. Each browser
  credits its own player from the synced `mission.over.results` (`creditMission`), so multiplayer
  follows the same rule.
- **Ship upgrades** (reputation, `SHIP_UPGRADES`): spare cell, coffee machine, fuel inserter (with a
  handle to scooch the cells out of its reach), efficient cannons (4 shots), faster airlocks,
  long-range radar, longer shields (3 s; shown as "Longer shields", id `shields`), bigger capacitors (4),
  reinforced hull (MAX_DAMAGE 5 → 6: the ship survives one more broken part; set per mission in
  `applyShipUpgrades`, so it reaches clients and doesn't leak into the next mission), sprinklers.
  Multiplayer: the host's ship (its upgrades only; see "One ship: the host's" below).
- **Gear** (money only, `GEAR`) and **professions** (once chapter 1 is finished, one for good: see "Specialize" below):
  general gear for anyone (gravity boots, thrusters, first aid course, stim pack); engineer and
  weapons specialist, each with a gear track (see 8w, 8x; the armor vest is weapons gear). Suit
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
  (Replaced on 2026-10-14 by a new score: see "New soundtrack".)
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
- Pirates fight like gunslingers now: they stop and aim, a faint laser sight tracking you right up to the
  shot (no lock-on phase any more, 2026-10-14: it was 0.6, then 0.3, then 0.1 s of a bright locked sight; now
  `PIRATE_LOCK` is gone); after 1.7 s a very fast shot (30 units/s) goes down the sight's line. Get behind a wall
  (out of its sight) when you see it. If they lose sight of you for 0.5 s they give up the shot. Then a 5 s
  cooldown — your window to hit them. Their shots fly (and are drawn) at the carbine's height, along the sight.
- **Hits as you see them** (2026-10-14, "sometimes I don't hit them though I feel I should"): our bolts used to be
  point-tested against a 0.42 circle round the pirate's feet once a frame (after the bolt moved, so a fast one
  could skip through, and one that reached a wall that frame never got tested). Now `boltHitsBody` (js/invader.js)
  tests the bolt's whole step, before the wall check, against the body as drawn (`segBody`, js/combat.js): the
  bolt at its muzzle height `b.z` (drawn `GFX.lift(z)` up the screen) vs a capsule from the feet to the head
  (r 0.4, top 1.05 for pirates and the saboteur; aliens r 0.42, top 0.45). In the classic view it's the old
  circle, swept. The first body along the path takes it. A hit shows on that pirate: a stronger, longer flash,
  sparks at the bolt's height, a small shove back along the shot, the lost HP pip blinking (bigger pips).
- **Pirates keep apart** (`separatePirates`): closer than 0.8 to each other they push apart (half each), and
  0.65 from the crew, Dr. Varga and intruders; a pirate making no headway along its route for 0.8 s squeezes
  past for 1.5 s (no pushing), so two meeting in a door or the tube pass in single file instead of deadlocking.
- They loot two things each (or fewer if nothing's left), carry them to their crate, then head home.
  Once every pirate is back aboard, their ship casts off with the loot 4 s later.
- Security console: red blips for enemies (intruders, pirates), blue for friends (crew, the engineer).
  `tests/dock.js` covers aim → shot timing, the sight tracking you to the shot (stepping aside within it
  doesn't dodge, getting out of sight does), the cooldown, leaving, grazing / very fast / sprite-view hits,
  separation and two pirates passing head-on in the tube.

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
  **Skirmish shows only Intro run and Rush hour** (playtest: "why two buttons for one thing?"): the
  skirmishes that are a campaign chapter's twin (`SKIRMISH_TWIN` in js/progress.js: Black box → c3,
  Pirate cove → c4, Stranded engineer → c5, Ore run → c6, Deep drift → c7, Nightmare → c8) are hidden;
  finished chapters stay in the campaign list (✔) and replay from there. The twins stay defined
  (`SKIRMISH`, MISSIONS, unlocks, old saves' `done.*`, `?mission=`, an older host's pick, which then
  still shows in the list); they never gave anything a chapter doesn't.
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
- **Lighting and states:** the hovered (or keyboard-focused) button lights up itself: brighter, with a
  warm glowing rim (playtest: the earlier hand lamp following the mouse was confusing, so it is gone);
  pressing (pointer or Space / Enter) sinks the button
  (lower, darker, shadow gone, label 1 px down); chosen missions / gear are latched in with a lit LED and
  a small green glow; disabled buttons are dimmed metal with greyed labels; the chosen suit colour's lamp
  is pushed in and glows in its colour (emissive, a coloured light on the plate, a CSS halo); black,
  having no light, keeps a glossy black core with a cool white glowing ring and halo; dark paint is
  glossier, so the unchosen black lamp reads as black, not as a missing one. Tooltips name the colours
  (`PAINT_NAMES`: Rust, Blue, Green, Magenta, Mustard, Purple, Teal, White, Black, Pink).
  In game: a white suit's trim is tinted brighter than white (`suitTint()` in js/sprites.js), so it
  shines and doesn't look untinted; black (dark) name tags get a light outline (`labelIsDark()` in js/game.js).
  **Locker / Shipyard** (`shopItem()` in `js/progress.js`, playtest: "make locked choices more
  apparent"): three states at a glance. Owned: latched, LED, "✔ OWNED" (profession: "✔ YOURS"), not
  dimmed. Available: normal metal with a green price tag. Locked: much darker grey metal, struck-through
  price, an amber padlock where the LED would be, and an amber line saying why / what unlocks it
  ("Unlocks at level 4 (you: 3)", "Need $20 more", "Engineers only · pick the profession above",
  "Need ★1 more reputation (missions)"). **Colour only where it means something:** every button face is silver except
  START MISSION (red); status colours stay (server dot, LEDs, HOST badge, swatches, warnings).
- **Layout:** an 8 px grid; plates with a 28 px frame + 18 px padding; primary buttons 68 px, secondary
  56 px, START 64 px; the crew plate's stats on three lines; panelling fitted per plate (at most 540 px
  per panel, so the menu plates are seamless at 1280 px); the briefing scrolls in its own well so START
  stays on screen at 1280×800; narrow (400 px): one column, two buttons per row.
- **When it draws:** on DOM changes, resize, scroll and hover / press easing, coalesced and
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
  The pieces set into a wall run (junction squares, the step down to the low height, door and hatch
  frames and their panels) get a small depth bias (`PIECE_BIAS`): the run's wall tiles overlap them at the
  same height, and the depth test flipped between the two with the camera's sub-pixel position and zoom
  (z-fighting: a dark band under the hull's corner posts, the pipes under the outer airlocks, blinking on
  spacewalks). A frozen-time sweep over the ship (zoom and sub-pixel scans) found no other z-fighting.
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
  the left shield button and the right capacitor as "irregular readings" (its maintenance event's pair,
  `warnFrom: 0`; the event is pushed to t = 10⁹, so it never fires). No jump. Enemy hits never do real damage (combat.js
  `shipHit` / `crewHit` ask `tutorialHit`: just the flash and sparks).
- Steps (data in `TUT_STEPS`, each `{ objective, marker, allow, enter, tick }`, `tutGo(id)` moves on):
  welcome (RAIDER intro, you, a tour of the decks) → helm (the two yellow readings, orange = service it) →
  radar (the first scan finds an interceptor on the left; since 2026-10-17, before: nothing, "always scan twice", which read as a rule for real missions) → climb into the left cannon
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
  the jump) → "more training modules coming soon" → free roam (below).
- Free roam after the training (request: "let the player roam freely, a button back to the menu, don't kick
  them out"): the end step saves `mn-tutorial-done` the moment it starts, then step `roam` opens every gate
  (but the debug menu) and keeps the ship a calm sandbox: no enemies, no jump (`jumpAt` stays Infinity, no
  hot zone), the training reactor never runs dry, and it never falls apart (a part is mended before
  MAX_DAMAGE). Nothing ends it: only BACK TO MENU (a small button top right) or Esc → "Back to the main
  menu? Your training is saved." (Enter goes, Esc stays; Esc still just closes an open panel first). Not the
  practice panel: that one spawns threats, and this is meant to be calm.
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
- **Path scratches** (request: "make only part of the scratches random and the other scratches come from paths a human
  would take through the ship ... suggesting they come from boots. Maybe a few orthogonal scratches from shifting boxes";
  then "obviously people walk to the cat a bunch too"). Only the fine hairlines change; gouges, scuff clusters, swirls,
  drags and tape are untouched.
  - The walk field (js/walkfield.js `walkField()`, once, on the first floor draw): the floor on a 0.2 grid minus the
    solids (grown by a body radius); 39 weighted destinations (`WALK_DESTS`: rooms, deck airlocks, outer hatches,
    consoles, reactor front, cannon ladders, shield buttons, capacitors, lever, fuel crate, patch board, coffee, snack
    machine, fridge, table, bunks, lockers, toilet, treadmill, couch, the cat 1.5); weighted shortest paths between every
    pair (Dijkstra, dearer near walls), straightened to what's in plain sight and rounded, laid on the grid as traffic
    plus a doubled-angle direction, blurred. Per 1 x 1 plate cell: direction, strength (alignment x traffic), and near
    the crates (`WALK_BOXES`) their axis and nearness. `?walkfield` or debug key G draws it.
  - Shader (FW_PATH block in `fwScratches()`, js/gfx.js): per hairline, with chance 0.85 x strength a boot scuff along
    the field (±13°, a bit shorter, most bunched round two spots per cell); with chance 0.25 x crate nearness a longer scrape
    along the crate's axis; the rest random as before. Its own random stream, so with the field at 0 every hairline is
    what it was. Data: one more instance vec4 (`iPath`, the tile's four plate cells packed by `walkFieldPacked()`;
    `INST` 11 → 12 vec4s), passed as `opts.floor[5..8]` by js/sprites.js.
  - Off switch: `?nopathscratch` or `GFX.setPathScratches(false)` (remembered): pixel-identical to before (checked
    against a copy of the tree without the change, same frame, fixed time and random seed). To remove it entirely,
    revert its commit.
  - Cost: one extra hash per hairline on a walked cell; bridge view, half resolution, SwiftShader (machine under load):
    median frame 400–417 ms on vs 400–450 ms off, i.e. lost in the noise. The field: ~0.2 s once on the first floor draw
    (only with path scratches on). tests/walkfield.js checks the field and the floor data.

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

### HUD pass (2026-10-14 playtest: "UI is not intuitive")

- **Hold jobs show a progress bar** (repairing, welding, splicing, treating, …): over the worker's
  head in screen space (`drawWorkBar`, js/game.js; numbers from `workProgress`, js/systems.js), yours
  an opaque panel on top of everything with a caption ("Repairing the reactor") and a big white bar
  with an outline and the percentage, the others' a small bar. It replaces the ring round
  the target; treating keeps its heartbeat ring (the click-on-the-beat bonus).
- **Where things happen** (`drawProblemMarkers`, js/sidebar.js): fires, broken parts, open breaches,
  visible boarders, arcing lines, dead gravity and downed crewmates off-screen get an arrow pill at the
  view's edge ("FIRE · Bridge", "BROKEN · Reactor"); new ones on screen get a short ping.
- **Sidebar, simpler:** dark high-contrast panels with bigger text (16 / 13 px), the header just the
  jump clock, radar age and damage lights; all broken parts share one panel; the mocking "????" plates
  are gone.
  The objective is pinned at the top. Panels form one column (cumulative layout): a new one opens its
  slot and then slides in from the left, a finished one slides out and then closes its slot, so they
  never overlap, also mid-animation; what doesn't fit is a "+n more" line. A panel whose problem is missing for
  under 0.25 s (one odd snapshot on a client) stays put instead of starting to slide out.
- **Fewer messages:** no banner for things you just did yourself and can see (fuel cell loaded,
  overcharge off, a snack, fire out, line spliced, the inserter, energy into a full capacitor); the
  airlock "cycling…" / "doors moving…" texts only as the mouse tooltip (`prompt.quiet`).
- **Inventory bottom centre**, big slots (184 px, still one weapon and one item, labelled WEAPON /
  ITEM, clear of the energy panel); click a slot to drop what's in it (command `drop`; not during the
  tutorial). The screen prompt, the work bar and the edge markers keep above it.
- **Energy left** (bottom left, `shipEnergy`): one big number (reactor cell + capacitors + every spare
  cell × 5), the reactor and capacitors as pips, tape and plates.
- **One power colour** (`POWER_COL`, yellow): the capacitors (sprites via the new `recolor` sprite
  option in js/gfx.js, which turns the saturated cyan / green pixels to a colour), their readouts, the
  fuel crate, fuel cells and the drifting canister, the cannon HUD's energy, the patch board.
- **One "usable" look, in white** (yellow means energy only; `drawUseMarks`, `useRing`, `USE_COL`): every
  usable thing in your room (stations, items, the lever, the mug, docked-ship crates, spacewalk jobs)
  always has a thin dashed white ring, faint, brighter in reach with a soft white haze; the one thing E
  would act on gets a thick solid white ring, a haze and a small white light on it (`useLights`, so the
  sprite itself brightens); what the mouse points at, if it's something else, a thin solid ring; things
  you can't use yet a dim grey dashed one. All drawn after the world (over furniture, counters and the
  dark; things on a counter get lifted by their `z`). It replaces the green corner brackets, the dashed
  item halos, TAKE tags and spacewalk job rings. Prompts, tooltips and the work bar are white/neutral.
- **E goes by where you stand, not the mouse:** E acts on your prompt's spot or else the nearest usable
  thing in reach, weighted a little towards the way you face (`nearbyTarget`); the mouse only matters for
  clicks (`prompt.eAct` marks the spot E would use, also over the network).
- Tests: tests/hud.js (slot size and place, drop by click, total energy, progress numbers, problem
  markers, E's target independent of the mouse); tests/sidebar.js (pinned objective, no overlaps).

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

- **Targets (2026-10-13; solo lowered 2026-10-14, see "Openers, a calm start, busier solo missions" below):** solo
  play leaves the crew **56 % idle on the first mission** (was 70 %), and every later step of the progression
  **0.5 points less** (a difficulty ramp, c8 solo: 52 %); 2-8 players 68 % minus the same ramp. (The table below is
  the 2026-10-13 state.)
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

### The expected kit; new targets for chapters 3-8 (2026-10-16)

The user: "the model must assume the kit players can afford by then" (players buy upgrades; the gravity boots are
very popular). `node tools/balance.js` and `--calibrate` now run with it by default; `--kit none` is the old model
exactly (same numbers as before for every mission).
- **The kit** (`expectedKit(id)`, printed above the table, in `--calibrate` and `--detail`): a first-time campaign run,
  chapter by chapter: money = `rewards.money` + `perPirate` × 2 (`A.BOUNTY_PIRATES`, a modest bounty), reputation =
  `rewards.rep` + 1 (first clear), XP = `rewards.xp` → level. After each chapter it buys gear in `A.GEAR_ORDER` (boots,
  first aid, thrusters, stim pack; the armor vest was in the list until it became weapons gear) as soon as money and level allow, and ship upgrades in `A.SHIP_ORDER`
  (cannons, inserter, caps, spare cell, airlocks, shields, radar, hull, sprinklers, coffee: the prerequisites first, so
  a later chapter's needs aren't blocked), each in order (saving up rather than skipping). Plus the mission's `needs`
  (overcharge is the only profession perk counted: crews are mixed). Every player has it. Skirmish twins get their
  chapter's kit; intro / rush / practice none.

  (The gear column below is from before the 40 % pay; the kit now: see "Specialize" below.)

  | Chapter | Earned before | Level | Gear | Ship (reputation) |
  |---|---|---|---|---|
  | 1 | — | 1 | — | — |
  | 2 | $180, ★2 | 1 | boots | — |
  | 3 | $330, ★4 | 2 | + first aid | cannons |
  | 4 | $530, ★7 | 3 | + thrusters | + inserter |
  | 5 | $830, ★10 | 4 | + armor vest | (saving for caps) |
  | 6 | $1130, ★14 | 4 | + stim pack | + caps, spare cell |
  | 7 | $1430, ★18 | 5 | (all general gear) | + airlocks |
  | 8 | $1780, ★22 | 6 | | + shields |
- **Modelled:** boots (walking ×1.15: every trip measured in the game with them, `tools/travel.js --boots`; deck airlock
  cycles unchanged; walks inside a docked ship / the derelict scaled), suit thrusters (spacewalks ×1.3), first aid /
  stim pack (getting up 6 s / 3 s instead of 10 s, treating 1.2 s instead of 2 s: `CREW_HIT_COST` 8 = 4 s slowed + 0.4
  downs × the time to get up, solo yourself, in a crew half by a crewmate: scaled by that ratio), armor vest (one crew
  hit fewer per player), efficient cannons (fewer reloads in each fight, besides the energy runs), inserter / spare
  cell / caps / shields / radar (the game's energy and radar code, as before), airlocks (trips measured with 0.7 s
  cycles), reinforced hull (6 broken parts to lose), sprinklers (a fire counts 15/22 as much as an open problem).
  **Not modelled:** the coffee machine, the boots in failing gravity. The kit barely moves the model: 1-4 points of
  idle (the boots save ~7 % of a trip, most of it is doors and airlocks).
- **Targets:** chapters 1, 2, 5 and their twins untouched (approved). Chapter 3 (and Black box) and chapter 4 (objective
  now two raiders; and Pirate cove) re-fitted with the kit to their old ramped targets. **Chapters 6-8 solo 37 %** (the
  user: 33-40 % is right solo; Ore run / Deep drift too), **Nightmare solo 25 %** (a challenge mission), 2-8 players
  unchanged. A mission's own target: `MISSIONS[id].balance = { soloIdle, crewIdle }` (read by `targetIdle`, no ramp),
  so later challenge missions can opt in.
- **Calibration rule added:** a count that is out of spec and more than `SPEC_IDLE_SLACK` off its aim loses to a
  neighbouring count in spec (c7 / Deep drift solo: 2 encounters would be 26 % / 18 % and out of spec, so 1 stays: 67 %).
  The kit's spare cell is left out while fitting cells (the written cells must do without it).
- **A failing part in chapters 1-3 at every crew size** (2026-10-16, "the first three missions are still too easy
  solo"): `MISSIONS[id].always = ['maintenance']` (js/mission.js `selectEvents`: never dropped, also on easy, but not
  an objective, and still repeated for big crews as before); the event count +1 where it was dropped (c1 solo, c2 / c3
  solo and ×2), so it comes on top. c2 ×2's reactor ×0.3 → ×0.4 to stay in spec; c2 solo is in spec with the boots
  (without them 2 of 8 builds wait at the finale).
- **Results** (8 builds, with the kit; idle % for 1 / 2 / 3 / 4 / 8, * = energy out of spec; `--kit none` in brackets):

  | Mission | Aim solo / 2+ | Encounters before → after | Idle with kit | (no kit) |
  |---|---|---|---|---|
  | c1 | 55.5 / 67.5 | 3/5/8/11/20 → 4/5/8/11/20 | 49 66 67 68 68 | (49 66 67 68 68) |
  | c2 | 55 / 67 | 3/4/7/7/19 → 4/5/7/7/19 | 34 59 67 75 70* | (30* 58 66 74 70) |
  | c3 | 54.5 / 66.5 | 3/3/6/8/17 → 4/4/6/9/18 | 23 65 71 67 67 | (22 64 70 66 66) |
  | c4 | 54 / 66 | 4/4/7/13/23 → 4/6/11/15/24 | 51 67 67 66 76 | (49 66 65 64 74) |
  | c5 | (by hand) | 2 everywhere | 56 77 84 88 94 | (52 74 83 87 94) |
  | c6 | 37 / 65 | 5/5/9/11/24 → 5/5/9/12/24 | 43 70 67 66* 71 | (40 68 66 64 69) |
  | c7 | 37 / 64.5 | 1/1/2/8/23 → 1/1/5/9/25 | 67 79 64* 65* 66 | (63 77 60 60 61) |
  | c8 | 37 / 64 | 2/2/3/3/14 → 3/3/4/6/23 | 40 61* 54* 69* 65* | (36 57 51 65 62) |
  | Black box | 54 / 66 | 2/2/7/11/23 → 2/3/8/11/23 | 47 64 65 66 68 | (46 63 63 65 66) |
  | Pirate cove | 53.5 / 65.5 | 3/6/11/15/23 → 4/6/11/16/22 | 53 69 66 65 78 | (51 68 65 63 77) |
  | Ore run | 37 / 66 | 3/5/8/12/23 → 4/7/11/12/24 | 40 62 63 68 73 | (37 59 60 66 70) |
  | Deep drift | 37 / 64.5 | 1/1/2/2/23 → 1/1/5/8/27 | 67 79 66* 65* 65* | (63 77 61 61 60) |
  | Nightmare | 25 / 64 | 2/2/3/4/13 → 3/3/3/4/16 | 28* 57* 72* 51* 65* | (25 54 70 49 61) |
  | Stranded engineer, intro, rush | unchanged | unchanged | rescue 54 69 70 68 71 | (50 65 65 63 67) |
- **Can't hit the target:** c7 / Deep drift solo (1 encounter 67 %, 2 out of spec and below 30 %); c3 solo is now 23 %
  (the lab's S-7 work + the failing part; was 34 %), c1 solo 49 % (its essentials); c2 solo stays deliberately busier.
  Out of spec with everything by then: c8 ×2-4 (×2 new: 3 encounters, as the solo target needs), Nightmare ×1-4 (solo /
  ×2 new: 3 encounters for 25 %), c6 ×4 (a 5 s wait 12 s before the jump), c7 / Deep drift ×3-4 (now 5 encounters, waits
  7-26 s instead of 136-147 s), Rush hour ×2-4.
- **Nav core and the drifting rock** (2026-10-16, re-calibrated with the kit to the same targets; table counts are the
  written `crew.events`, the game may add the finale's fight on top): idle % for 1 / 2 / 3 / 4 / 8 (`--kit none` in brackets)

  | Mission | Encounters before → after | Idle with kit | (no kit) |
  |---|---|---|---|
  | c4 (nav core) | 3/6/11/15/23 → 3/5/11/14/24 | 46 66 65 67 75 | (44 64 63 65 74) |
  | Pirate cove (nav core) | 4/6/11/16/22 → 2/6/11/15/24 | 50 67 65 66 76 | (48 65 63 64 74) |
  | c6 (2 samples, drifting rock) | 5/5/9/12/24 → 4/5/8/11/24 | 33 65 65 66 70 | (25 63 63 64 68) |
  | Ore run (2 samples) | 4/7/11/12/24 → 4/4/8/12/23 | 31 67 67 66 72 | (34 63 65 63 70) |

  c4 solo can't reach 54 %: the two raiders, the opener, a finale fight and the nav core's fetch are the least a solo
  run gets (4 encounters, 46 %): tests/scaling.js lists it with c1 (SHORT). c6 ×3 is now the out-of-spec one (a 16 s wait
  at 257 s), ×4 is back in spec.
- tests/scaling.js: the own targets, the new out-of-spec list, SHORT = c1, HARD = c2 / c3 (solo > 20 % idle), the failing
  part at every crew size in chapters 1-3 (exactly one for 1-2 players, also on very easy), c2's solo timeline with it.

### Specialize: one profession, armor vest to the weapons track, 40 % pay (2026-10-16)

The user: "The engineer track is far superior to the weapon specialist track. Make the 'tank one extra shot' also part
of the weapons specialist's track. Then make sure you can choose only one. Also give less gold per mission (40%?) so
that you have to make a choice. [...] most missions should unlock about 0.6 things so that you have to specialize."
- **Armor vest** (id `armor`, $220, level 3) is weapons-specialist gear now (`prof: 'weapons'`; `applyKit` sets
  `c.armor` through `perk()`). Weapons track: own laser gun $120 → armor vest $220 → heavy blaster $300. Engineer
  track: own repair kit $100 → toolbelt $200 → overcharge $300. General: boots $150, first aid $150 (now level 1),
  thrusters $180, stim pack $250.
- **One profession, for good** (`pickProfession`, `professionWhy`): picking one asks first, inside the locker ("Become
  a Weapons specialist? You can't switch later", Yes / Not yet; no browser `confirm()`); after that the other is locked
  ("You're a Weapons specialist — Start over to choose again"). Start over (lobby) gives a fresh profile and a new choice.
- **Pay ×0.4** everywhere except chapter 1: c1 $120 + $16 per pirate (a first run with the two raiders: $152, so one
  $150 item, boots or first aid); c2 $60, c3 $80, c4 $80 + $20 per pirate, c5 $120, c6 $120, c7 $140, c8 $200;
  skirmishes without their own rewards $16 (was $40). Reputation and XP unchanged.

  | After chapter | Money earned (2 bounty pirates) | Level | What one player can own (e.g.) |
  |---|---|---|---|
  | 1 | $152 | 1 | boots *or* first aid |
  | 2 | $212 | 2 | + own laser gun or own repair kit (profession from level 2) |
  | 3 | $292 | 3 | (saving) |
  | 4 | $412 | 4 | + one more track item or general item |
  | 5 | $532 | 4 | + one more |
  | 6 | $652 | 4 | + one more |
  | 7 | $792 | 5 | + one more |
  | 8 | $992 | 6 | 5-6 items of the 10 open to one profession ($1330-1370 for all) |

  After chapter 1 that's $840 over 7 chapters, at ~$190 an item about 0.6 items per chapter.
- **Profile v4** (`migrateProfile`): a profile that owns the armor vest but isn't a weapons specialist gets the $220
  back and loses the vest (it would be dead weight); everything else kept. `tests/progress.js`: engineer / no
  profession / weapons specialist / v2 gunner with the vest, twice-migrated, the profession lock, c1 pay, ×0.4.
- **Balance model** (`expectedKit`): follows the new pay; no armor vest (the model ignores professions). The kit now:
  c2-c4 boots, c5 + first aid, c6-c7 + thrusters, c8 + stim pack. `tests/scaling.js` still passes with it (no
  re-calibration needed).

### Difficulty slider

Request: "a difficulty slider, just in case not everything is balanced perfectly … very easy, easy, normal".
- In the mission lobby, under the crew list: a slider Very easy · Easy · Normal (`#lobby-easy`). Normal is the
  balance above. Solo: your choice, remembered in this browser (localStorage `mn-difficulty`, not the profile:
  no save change). Multiplayer: the host's choice (`{t: 'difficulty'}`, kept on the server's game as `g.easy`
  and sent in the lobby state; guests see it greyed out).
- `startMission(id, {easy})` → `mission.easy` (0 normal, 1 easy, 2 very easy). `selectEvents` asks for `easy`
  fewer encounters than the crew table: the ones dropped are optional (DROP_ORDER, repeats first), never an
  essential one, and at least one is always left (the finale), so solo missions with 1-2 encounters may have
  nothing left to drop. The rest are spread evenly from the first event to the jump as usual; the jump time
  and the reactor's pace stay at normal's (`mission.gap` is normal's gap, `mission.eventGap` the real one), so
  the crew has the same energy for fewer encounters. The hot zone is unchanged. Pay and XP are the same.
- **Nothing left to drop:** for every easier step that couldn't take an encounter out (solo missions with 1-2
  encounters), the crew gets half a cat's worth of luck for the whole mission instead: the bad dice (small
  hits: fire / broken part; big-hit fires; fire spreading / burning a part) are multiplied by
  `LUCK_CUT ** (cat + mission.extraLuck)` (`luckCut()`; cat = 1 while the petted cat's luck lasts, extraLuck =
  ½ per such step).
- The start banner says "(easy)" / "(very easy)". tests/mission.js checks the counts, the essentials, the even
  spacing, the reactor pace and the jump for intro / c3 solo and intro / c4 / pirates with all their encounters.

### After the jump; the end screen; quicker pirate shots (2026-10-14 playtest)
- "The ship can literally still fall apart after you won": once the ship has jumped (`mission.over.survived`),
  `simTick` only advances the clock (the jump-out animation runs on it) and clears the crew's key presses;
  fires, enemies, parts, injuries all stay as they were. A lost mission (the ship blew up) is unchanged.
- "There is no button that sends you back to the menu": on the end screen any key (except M, mute) or click
  goes back to the lobby (was R only), from 1 s after the report shows (`END_GRACE`), so a click meant for the
  fight doesn't skip it.
- "The pirates are a bit easy": a boarding pirate's laser sight now locks 0.3 s before the shot (was 0.6;
  `PIRATE_LOCK`), the tracking before it unchanged (aim 2 → 1.7 s in all). (Later removed entirely: 8t.)
- Tests: tests/mission.js (frozen after the jump; the end screen's keys), tests/dock.js (the aim time).

### Chapter 2 harder: two aliens, a fuller timeline, a finale that matters (2026-10-14 playtest)
- The playtest: chapter 2 was far too easy. Solo it had two encounters (the intruder at 0:30, the finale
  interceptor at ~5:38); the alien died in about a minute, uncoordinated, and then nothing happened for minutes.
  And the finale came 22 s before the jump, so you jumped before its shots or their fires could hurt.
- **The alien** (js/invader.js): acid spit 9 → 11.5 units/s (`SPIT_SPEED`; its reach stays 14.4 units,
  `SPIT_RANGE`; windup + 4 units of flight still take over a second, so it's dodgeable). Contact hurts: a pounce
  that connects, or touching it at any time (`ALIEN_TOUCH_R` 0.55), is one hit and a shove away, then nothing
  from that alien for `ALIEN_TOUCH_COOLDOWN` (1.5 s; pounce and touch share it, so they never double up). Not while
  it's asleep, stunned or still coming through the airlock. Health 6 → 4 (`ALIEN_HP`; the vent's 3 now leaves it
  on 1; every mission's intruder and the derelict's sleeper get this).
- **Two aliens** (`count: 2` on an intruder event, `spawnIntruders`): one per side airlock, each keeping to its own
  deck (`zone`: the first the upper, the second the lower). While another alien is alive it only hunts crew on its
  deck and prowls its deck's rooms otherwise (it still fights anyone it runs into anywhere). The last one left
  hunts the whole ship. Events without a count (every other mission, the hot zone's extra encounters) stay one
  alien that hunts anywhere. The objective is `{ kind: 'intruder', count: 2 }`: "Kill both intruders (1/2 dead)"
  in the sidebar, "Kill both intruders." in the lobby, "2 intruders — both airlocks" on the radar. Briefing and
  blurb now speak of two.
- **The timeline** (MISSIONS.c2.build): the opener, at random the asteroid swarm or an interceptor (50 s), the two
  aliens (90 s, essential), the mine drone, a jammed cannon, the maintenance failure, the antenna, the frigate
  (250 s). Solo gets opener → aliens → frigate (3 encounters, was 2), 2 players add the mine drone (4, was 3),
  3-4 players get all seven (7, as before; written out so no repeats put two frigates on one side), 5+ as before.
  The frigate stays the finale (the aliens are the objective, never the finale), also on easy / very easy.
- **The finale 70 s before the jump** (`MISSIONS.c2.finaleLead`, `finaleLead(id)` in js/mission.js; every other
  mission keeps `JUMP_DELAY` 22 s, chapter 1 is unchanged): the events spread evenly from the first to
  length − finaleLead, the jump stays at the mission length, so the frigate gets its heavy shots off.
- Cells and reactor for these counts fitted like `--calibrate` does (fewest cells, mildest reactor in spec), the
  event counts set by hand (the playtest overrides the model's 69% idle aim). tools/balance.js (counts each
  alien as its own fight), before → after: solo 70% idle / score 24 → 36% / 46, 2 players 74% / 22 → 61% / 33,
  3 players 65% / 38 → 66% / 31, 4 players 74% / 26 → 74% / 27; all in spec. tests/scaling.js lists c2 as
  deliberately harder (solo well below the target, above 30% idle).
- Tests: tests/intruder.js (spit speed and reach, contact damage and its cooldown, pounce + touch = one hit, the
  two aliens: different airlocks and decks, staying apart, the lower one staying below until it's the last, the
  objective), tests/scaling.js (c2's solo order and times, easy levels, finaleLead vs. c1), tests/progress.js
  (objective needs both), tests/hazards.js / tests/systems.js (4 hp).

### Openers, a calm start, busier solo missions (2026-10-14 playtest)
- **The designer's rule:** if a mission's point is X, X doesn't happen in the first 15 s. You jump in, get a calm
  moment to look around, work through something else, then X, then things on the way out that make you want to jump.
  A written event can carry `opener: true` (MISSIONS[id].build): `selectEvents` never drops it (like an essential,
  also on easy / very easy: those give luck instead) and it is never the finale (`layoutMission` doesn't swap it to
  the end; if the opener and the objective are the only fights, an optional fight is added as the finale). Its
  written time is the mission's lead-in (`mission.lead`): **30 s of calm** (c2 keeps its 50 s).
- **The timelines** (`*` opener; solo / 2 / 4 players, m:ss):
  - c2 (unchanged, the swarm or interceptor opener now flagged): solo `opener* 0:50, 2 aliens 2:50, frigate 4:50`.
  - c3 The Empty Lab ("too easy, no suspense when you start with the lab"): written `interceptor* 30, derelict,
    mines, swarm, maintenance, flare` (was `derelict 15, …`). Solo `interceptor* 0:30, lab 3:04, swarm 5:38`
    (3 encounters, was 2: lab 0:15 + a lone finale); 2: `+ mines`; 4: 10 encounters. Now recommends Efficient
    cannons + overcharge (the base ship is ~16 s short on energy at 3-4 players).
  - c4 Red Comet Cove ("needs one more encounter"): written `interceptor* 30 (scout), pirates, maintenance, pirates,
    mines, glitch, swarm` (was `pirates 25, …`). Solo / 2: `interceptor* 0:30, raider 2:13, raider 3:55, swarm 5:38`
    (4, was 3); 4: 13 encounters incl. the failing part. A frigate finale and the failing part as an essential were
    tried: the model put solo at 14-18 % idle, so solo gets just the one extra encounter.
  - c6 Spore Season (same rule): `interceptor* 0:30, rock 1:47, spores 3:04, leeches 4:21, swarm 5:38` solo (rock was
    at 0:08).
  - c5 is left alone (being redesigned separately). c1 is unchanged (its point, the raiders, comes at 0:30 and the
    playtest liked it). c7 / c8 start at 30 s (were 20 / 15 s). Skirmishes keep their timelines.
- **Stealth fighter on the radar:** it only shows `STEALTH_RADAR` (12 s) before it arrives (js/mission.js
  `radarReach`; everything else RADAR_RANGE, 45 / 60 s). The balance model knows (it reacts later to it).
- **Idle time:** the playtest found chapter 1 solo right — the model rates it **51 % idle** — while c3 / c5 solo
  (62-63 %) were too easy. So the approach is kept and the solo aim lowered to match c1: `A.TARGET_IDLE` 0.70 → 0.56
  (2-8 players unchanged at 68 %: no feedback there). Refitted with `--calibrate`: c3, c4, c6 (all crew sizes); solo
  only for Intro (2 → 3 encounters), Ore run (2 → 3), Black box (2 → 3), Pirate cove (1 → 2), Stranded engineer
  (2 → 3), Nightmare (1 → 2), c8 (1 → 2). Solo idle now (model): intro 51, c1 51, c2 36, c3 49, c4 34, c6 40, c8 52,
  ore 54, black box 51, pirate cove 58, stranded 53, nightmare 47. Still one encounter (two are out of spec or far
  too busy): Rush hour 76, Deep drift 63, c7 63. c5 63 (pending its redesign).
  The model still rates pirate raiders as heavy (c4 solo 34 %) while the playtest found c4 too easy; worth a look
  when c4 is played again.
- Tests: tests/mission.js (stealth radar reach; openers for c3 / c4 / c6 at every difficulty: calm 30 s, the opener,
  then the main encounter, a fight as the finale; the difficulty test counts openers as never dropped),
  tests/scaling.js (the new targets; c2's opener kept on easy; COARSE / PENDING lists).

### Start over
- "There should be a button to reset it so you can have the progression again with your friends": START OVER in
  the main menu (under the crew member; asks first). A fresh `defaultProfile()`, keeping the suit color (the name
  is its own key, `mn-name`); the old profile goes to localStorage `mn-profile-backup` in case of a misclick.
  Progress stays per browser (the server never stores it), so everyone presses it on their own machine.


### New soundtrack (2026-10-14 playtest: "sounds like two music pieces at once")
- Composed again from scratch (nothing kept from the old score), after looking at the game: a scrappy,
  duct-taped crew, so a heroic underdog sound: a slightly out-of-tune plucked ostinato and little bells over
  cinematic taikos, brass swells and a horn theme.
- **Seven pieces**, each written as ONE piece: one tempo, key and 16th grid, A (verse) and B (hook) sections of
  8 bars with their chords and a composed theme; every part takes its notes from the same bar's chord.
  `tests/music.js` checks that each theme note on a strong beat is a tone of its chord.
- **The build-up** follows `setIntensity` (time towards the jump), so the climax lands on the jump for any
  mission length. Held Together's order: 0 drone and dark pad → 1 bell arpeggio → 2 ostinato, a taiko → 3 bass, 16ths, hats →
  4 the theme on the horn, snare → 5 brass swells, busier drums → 6 climax (strings double the theme an octave
  up, brass stabs, full taikos). Stages only change on bar lines, up after a one-bar tom fill, down only at a
  phrase start. A threat adds one stage (at least 3, at most 5: the climax is saved for the end), and counts for
  20 s after it's gone, so flickering fights don't flip the arrangement. The other pieces build their own way (below).
- **The jump:** while the drive spools (`setJump`), the spool chords (bVI-bVII) with a rising line, snare rolls
  and a riser in 2-bar waves (were 4: see "the endless spool" below), for as long as the drive needs. `jumped()`
  plans the cadence on the grid and lands on the home chord in major within one bar; then quiet until `rearm()`.
- **One piece at a time:** one sequencer (one timer); switching fades the old piece's buses out and starts the
  new one on its first step; after the final hit a mission switch waits for `rearm()`. The music pauses while
  the browser tab is hidden, so two open tabs never play over each other (the game keeps running).
- **Levels:** `music.html?check` renders every piece offline (OfflineAudioContext): about -31 dB RMS at the
  quiet start, -20 dB at the climax and in the spool, peaks at -4 dB or lower, no silence or NaN. A soft
  compressor on the music bus. About 160 new nodes a second at the climax.
- `music.html` lists the pieces (tempo, key, missions) and shows the stage and section while it plays.
- **Every piece its own identity** (playtest: "every soundtrack is very similar, they all begin with humm and
  bells"). The score keeps one engine, but each piece has a `parts` table (which layer plays from which stage to
  which), its own lead sound, drum style and feel:

  | piece | opens with | lead | drums, feel |
  |---|---|---|---|
  | Held Together | drone, dark pad, bells (the first score, unchanged) | horn | taikos |
  | Cargo Run | a twangy baritone-guitar riff (written out, G minor) + shaker, then strummed chords | whistle-flute | rock backbeat kit, light swing |
  | Red Comet Gallop | stomp-and-clap + accordion, then oom-pah bass | accordion reed, a fiddle | 6/8 jig, tambourine, crew shouts |
  | A Signal in the Dark | the theme on a far-away radio horn, a faint crackle | solo voice ("ah") answering the radio | soft taikos, spiccato strings |
  | Bloom | a breathing vowel choir + spore runs | glassy FM | 3:4 marimba, hand drums, taikos late |
  | Pressure Hull | sonar ping + heartbeat, hull groans and creaks | cello (octaves at the climax) | half time, full time at stage 5 |
  | Last Jump Home | ticking clock + the theme on a music box | detuned saw | a talking growl bass, half-time dubstep drums (heavy snare on 3) |

  All of them still meet at the same climax (theme doubled by strings, brass swells and stabs, full drums), the
  spool and the final hit. *Held Together* plays exactly as in the first score: checked by recording every
  WebAudio call of both versions through a scripted mission (47,707 identical events). The first score is kept
  outside the repo as `music-v1.js` (reconstructed from the session) in case a piece should come back.
- Levels per stage (offline, dB RMS): the openings sit at -28..-39, the climaxes at -19..-23, peaks -3.4 dB or lower.
  `music.html?check` also prints each opening's layers, brightness and onsets a second.
- **The ending lands in time and in phrase** (playtest: "it all ends in a harmony, but not in phrase"). The jump
  comes at game time (MID energy, the handle; a jump can even end the mission in the frame the drive starts, before
  `setJump` is seen), so it can't be known ahead; `jumped()` plans the ending on the music's own grid instead of
  cutting: already on the cadence chord (the spool's bVII, or a V) → the hit on the next downbeat; in the first half
  of another chord → the cadence chord takes over from the half bar; later → one full cadence bar. A growing fill
  (snare roll, taikos) leads in; the hit is the home chord in major on the piece's own instruments with its own
  last word (the jig's stomp-clap, the last sonar ping and heartbeat, the music box, the radio answering, spores, a
  strum), ringing out naturally. Tested: the hit is on a bar line, after ≥ half a bar of cadence, at most ~1.5 bars
  after the jump; rendered at several jump timings per piece (hits 0.2-3.7 s after the jump, all on bar lines).
- **Clicks** (playtest: Cargo Run's synth "is clicking and sounds weird"): its opening line is redone as a walking
  boogie bass (root, third, fifth, sixth, seventh and back in swung 8ths, passing notes kept in the key; a round
  triangle + sine). `tests/music.js` records every WebAudio call in a fake context, replays the gain automation
  and checks that every one of ~17,000 sounds starts and stops at zero gain, that no envelope jumps, and that no
  ramp directly follows a `setTargetAtTime` (browsers start such a ramp from the wrong value: the old claps did
  this). Offline renders are also scanned for isolated spikes in quiet passages (none).
- **A Signal in the Dark: less noise** ("too much white noise"): no constant hiss any more; short band-passed
  crackles and a brief "tuning" sweep every other bar, fading out as the music builds.
- **Real dynamics** (playtest: "a truly epic buildup is not just a continuous ramp"). Every piece but Held Together
  now has an arc on phrase boundaries: small steps after a one-bar fill; the big ones (the theme's entrance, the
  climax) only at a phrase start, after a build bar (snare roll, taikos, a riser) that ends in a beat of silence:
  the drop (boom, crash, taiko). Once the theme has had two phrases and the mission is past half way, a breakdown
  phrase strips it to the piece's signature, the pad and the theme (4 bars), brings bass and ostinato back, then
  the drums, then a build bar, and a bigger drop. At stage 5 the lead calls and the strings answer (every 2 bars).
  So: build → drop → breakdown → bigger build → bigger drop → climax → spool → ending. Tested (drops on phrase
  starts after a build bar, a breakdown with < 60 % of the sounds of the phrase before, before the climax).
- **Last Jump Home: a talking growl bass** ("the synth is too fast and drops too fast"; replaced the first
  LFO wobble bass): two FM'd saws and a square an octave down, saturated, through a resonant lowpass and two vowel
  formants, a clean sine sub under it. No LFO: every wobble is written on the grid (one bar = 8 slots: 1/4, 1/8,
  triplets, 1/16, 1/32 stutters, slow "waaah" / "yowww", dives from an octave up), so each starts closed on its
  beat. It creeps in muffled, climbs and speeds up in the build, stops dead for the silence; the drop: an 808 sub
  diving onto the root (in place of the kick on that 1), a bright-to-dark impact, a brass stab, a crash. The music
  box comes back over the climax. The music-box opening is untouched: `tests/music.js` hashes every WebAudio call
  of stages 0-1 (7,950 calls). Peaks: the first drop ~-3.5 dB (the growl's first note there swells in over 50 ms).
- **Per-piece reworks (2026-10-14, one agent per song), each piece checked against references by offline renders:**
  - *Cargo Run:* recomposed from scratch (2026-10-14, late): G minor, 102 bpm, light swing. A baritone-guitar
    riff written out bar by bar as one line per 8-bar section (chord tones on 1 and 3, steps and small leaps, each
    phrase ending D-C-A-F# into G), doubled by a sine sub from the kit on; shaker; strummed chords from stage 1; its
    own rock kit, fills (snare pickup, tom run), build (snare tightening, a pick scrape into the silence), drop (kick,
    crash, power chord, stab) and spool (four on the floor) with engineDrums off. A | Gm Gm Eb F | Gm Gm Eb D |,
    B | Cm Cm Gm Gm | Eb F Gm D |; the flute theme from the first drop. `tests/music.js` checks the riff stays in key.
  - *Red Comet Gallop:* a real 6/8 jig grid; the crew stomps and shouts "HEY!" on the drops; a fiddle counter-line;
    the breakdown is call and response (accordion calls, stomps and claps answer); the climax is the boarding
    party charging (galloping toms and snare).
  - *A Signal in the Dark:* minimal static (a rare narrow crackle, gone by stage 2); the radio horn calls and a
    distant voice answers, a dialogue in the breakdown; a warm string pad; spiccato strings drive the middle; at the
    climax the hook lifts to Eb major.
  - *Bloom:* its own choir, two half-choirs through drifting vowel formants (mm, oo, oh → ah, eh); spore runs up
    the chord's tones; a rosewood marimba in 3 against 4; the breakdown breathes (the vowel opening and closing);
    the climax blooms (choir swell oo → ah → ee, a high choir on the 9th, a spore burst, glass petals).
  - *Pressure Hull:* the hull groans and metal creaks through the quiet stages and squeezes in the builds; every
    drop lands on a falling sub hit and a plating clank; a struck-pipe ostinato; the cello plays the theme in
    octaves at the climax.
  - *Last Jump Home:* the growl bass above.
- **Mix, from a reference analysis.** The two "epic" reference tracks (epic.mp3, FoxieEpic.OGG; not in the repo,
  analysed with ffmpeg + numpy) against full 5-minute renders of ours: spectral centroid 500-545 Hz vs our 165-280 Hz,
  low-mid (60-250 Hz) share 23-28 % vs our 62-78 %, stereo width (side/mid) 0.54-0.74 vs our 0.13-0.15, and their
  loudness moving in 7-11 dB dips and drops where ours sat on a flat plateau (±1 dB for 3.5 minutes). So for the new
  pieces: less bass, brighter and wider pads (±0.85), an "air" pad an octave up from stage 4, leads and strings
  panned wider, the ostinato alternating left/right, more reverb; plus the arc above. Held Together keeps the first
  score's mix and smooth build (only its ending is new); it is still checked identical to the first score, call
  for call, up to the jump.
- **One file per piece** (so each piece can be worked on on its own): `js/music.js` is the engine (sequencer,
  stages and the arc, drops and breakdowns, the ending in phrase, buses and mix, the shared instruments: pad,
  pluck, bell, choir, drone, bass, brass, the lead timbres, the drums) and keeps Held Together, frozen. The six
  other pieces live in `js/music/<name>.js` (cargo, comet, signal, bloom, hull, home): each one calls
  `music.define(recipe)` with its score (key, tempo, chords, themes, parts table, ...), its own instruments (built
  from `music.kit`) and hooks into the engine: `bar(x)` and `step(x)` for its own layers, `theme(x, note)` for its
  own voices of the theme, `ost(m, t, a, st)` for its ostinato instrument, `drums(x)` for its kit, `endFill(x)`
  and `finale(x)` for its ending, `groove` for what comes back first after a breakdown. Loaded after
  `js/music.js` by index.html, music.html, tests/music.js and tests/harness.js (the server's simulation plays no
  music and needs none of them). The split changed nothing: every piece's audio calls, connections included, were
  recorded before and after and are identical.
- **Every engine gesture can be the piece's own** (playtest: "it still uses the vanilla drum rolls ... especially
  Last Jump Home, where the wobble bass does the job of the drums"). Each percussion / transition gesture the
  engine plays runs through one gate: the piece's hook of the same name first (returning true / 'handled' replaces
  the engine's version), `noEngine: ['<name>']` switches it off. Gestures: `fill` (the one-bar fill before a stage
  change: asked once at the bar start with `x.from` / `x.to`, 'skip' there plays a normal bar instead, then per
  step), `build` and `buildSweep` (the roll and riser before the beat of silence), `dropHit`, `accent` (the
  phrase-start crashes), `spoolWave` / `spoolPerc`, `endFill`, `finalHit`, `cadence`, `pad`. Inside them the
  engine's own percussion can be switched off by instrument (`noEngine: ['taiko', 'crash', ...]`) or all at once
  (`engineDrums: false`, risers stay); `'drums'` and `'stabs'` switch off the engine kit and the brass stabs.
  The arc's structure (the beat of silence, drops on phrase starts, breakdowns) stays the engine's. Also for the
  song agents: `build`, `bk`, `drop` and `ending` on the step hook's x, `breakdownSkip: [...]`,
  `hooks.endingPlanned(x)`, `K.releaseHeld(t, tag)`, `K.hush(t)`, `K.ending`. With no overrides every piece is
  call-for-call identical to before (recorded through a scripted mission with threats, breakdown, spool, jump).
- **Real-time clicks before envelopes**: a new GainNode plays at 1 until its first scheduled event, so a sound
  starting a hair before its envelope let one full-level sample through (heard in real time, invisible offline).
  Every engine envelope now starts from a gain created at 0 (`vca()`, offered to pieces as `K.gain()`; `env()`
  zeroes the gain first too). Only initial values changed: the scheduled automation is identical. `tests/music.js`
  now requires every envelope that starts from silence to sit on a gain created at 0 (the piece files' own
  hand-made envelopes in Bloom, Comet, Signal and Home still need `K.gain()`); the click check's levels are
  relative to full scale or the envelope's peak, whichever is bigger (as before, now explicit).
- **music.html: jump to any part.** The mission bar is clickable (and draggable): it seeks there. `music.plan(L)`
  runs the arc of an L-second mission ahead (the stage machine is a pure function now), marks the drops, the
  breakdown, the climax and the spool on the bar, and `music.seek(t, L)` puts the arrangement into the state it
  would have at that point (stage, breakdown, pending drops) and starts it cleanly on the next bar line, the old
  sound faded. Buttons: play/pause, restart, spool, JUMP NOW (the ending, on the grid), plus the threat toggle,
  the mission length and speed; the status shows stage, section and bar. The player's intensity now follows the
  game's curve (towards the spool, not the end of the mission).
- **Menu music** (playtest: "Held Together only starts once I click PLAY SOLO, but then keeps playing when I go
  back to the menu"): the audio context only started on the first click, and PLAY SOLO usually is the first one.
  `js/audio.js` now makes it as the page loads (unless `navigator.getAutoplayPolicy` says it would be refused),
  so where the browser allows it (coming back from a mission, a site it already lets play) Held Together plays
  from the first frame of the menu; otherwise the context waits suspended and the first key, click or tap
  anywhere (`keydown`, `mousedown`, `pointerdown`, `touchend`, `click`) starts it. Everything inside `#lobby`
  (main menu, solo / game lobby, locker, shipyard) plays the `menu` piece = Held Together at intensity 0.15, no
  threat, no spool: one calm stage (stage 1, Held Together has no drops), and it never restarts between menu
  screens. The lobby check in `clientUpdate` now looks at `#lobby` itself: it looked at `#menu` / `#room`, which
  keep `hidden = false` under the hidden `#lobby` during a mission, so the jump's final hit never fired in a
  real game. M in the menus toggled mute every frame (keys were never cleared there): now cleared after each
  menu frame, and M also works while a tutorial message is open. `tests/music.js` checks the start on load,
  the start on any input, the calm menu stage and the switch to a mission's piece and back.
- **The endless spool** (playtest: "the very last bit before the jump loops too often ... especially painful when
  you actually do the jump"). The spool's waves (crash + riser, the rolls growing, Cargo Run's and Last Jump Home's
  own spool hooks) are 2 bars instead of 4 (`x.cb` 0..1, `x.k` over 2 bars). `planEnding()` never adds a full
  cadence bar: on the cadence chord → the next downbeat; first half of another bar → the cadence from the half bar;
  later → the cadence from the next 8th still to come, the hit on the downbeat; in the bar's last 16th → the cadence
  from the downbeat, the hit half a bar later. Tested at every 16th of two spool bars for every piece (216 jumps):
  the hit comes at most one bar (plus the 0.15 s lookahead) after `jumped()`; the level check's hits now come
  0.5-2.1 s after the jump (were up to 3.8 s). For a drive that keeps us waiting, the old 2-note "rising line" (the
  chord's third on the lead) is replaced by a **Shepard scale**: the engine instrument `shepard(pc, t, len, vel)`
  is six sines an octave apart (C2..C8) under a fixed raised-cosine bell over log-frequency, centre C5 (523 Hz),
  6 octaves wide (one PeriodicWave per pitch class, so one oscillator a note); the six weights add up to exactly 1
  for every pitch class. The line steps up the piece's natural minor (where the bVI-bVII live), one note a beat
  in 4/4 (Held, Cargo, Signal, Bloom, Hull, Home: 1.4-1.9 notes a second), an 8th in 6/8 (Red Comet: 4.2 a
  second), never resetting; on 1 and 3 a chord tone when the next step or the one after is one (else the
  consonant 6th), passing tones between. Under it a **Shepard-Risset glissando** replaces the engine's noise riser:
  the same bell, six sines sliding up an octave every 2 bars (4 bars where 2 are shorter than 4 s: Red Comet,
  Pressure Hull), each entering silent at the bottom and leaving silent at the top (Cargo Run keeps its own riser
  and scrape). Both sit ~13-17 dB under the spool's mix (line ~-35 dB, glissando ~-36 dB RMS against the spool's
  -19..-24 dB; spool levels within 0.8 dB of before, peaks -3.1 dB or lower). `noEngine: ['shepard']` opts a
  piece out (the noise riser comes back), `hooks.shepard(x)` gets the bar's notes (`x.line`) to play them itself,
  `shepRate` sets the steps per note; the kit offers `K.shepard`, `K.gliss`, `K.shepPartials`. Verified by
  offline renders in the browser (40 s per piece, isolated line and glissando, 4096-point FFTs): the strongest
  pitch class of every line note is the written one (all 7 pieces, 513/513 notes) while its log-spectral centroid
  stays at 507-529 Hz (±16-33 Hz); the glissando's chroma turns steadily upward at the expected rate (2.1-2.8
  semitones a second, not one of 921 frames falling) while its centroid stays at 524 Hz ±12-19 and its RMS within
  0.1 dB. `tests/music.js` checks the 2-bar waves, the one-bar ending at every 16th, the line rising 1-4 semitones
  a note (mostly scale steps) without ever repeating a 2-4 note figure over 30 s, and the bell (weights, sum 1).
- **Open (soundtrack):** Red Comet Gallop's climax makes ~268 new nodes a second (budget ~150) and has no
  full-mission render against the references yet. Engine requests from the song reworks: build/breakdown/drop
  flags on the `step` and `drums` hooks; a pad hook (replace the engine pad, keep its renewal rule); a cadence hook
  (or cadence-voices override) so a piece's own voices swell into the final hit, plus a tagged
  `K.releaseHeld(t, tag)` for them and a signal when an ending is planned (so queued late-in-bar notes don't sound
  over the cadence chord); a flag to keep the theme out of a piece's breakdown; a recipe field to drop the pad from
  a breakdown (`breakdownSkip: ['pad']`); more stereo spread on pad / reverb / drone, or a quieter half-time bass
  (Pressure Hull's width 0.29); Bloom's climax still bass-heavy (60-250 Hz at 0.50-0.65: shared bass, taikos,
  drop booms).

### Weapons in hand, lethal ship shots, foam, smooth asteroids (2026-10-14 playtest)
- **The hand weapon is in the hand** (sprite view): `items/held_<kind>` (laser, heavy, drill, repair kit carried
  by its handle, extinguisher by its handle; 16 dirs, `tools/blender/models/items/items.py` HELD, origin = the
  point in the glove) drawn at the right glove of the crew sprite's frame (`hand` per frame on every standing crew
  set: `MN_HANDS_ONLY=1` in `crew.py` writes them without rendering), turned like the body (`drawHeldItem`).
- **Shots leave the muzzle:** `muzzleAt(c, a)` = the idle hand + the item's `muzzle` (from items.py, mirrored in
  `HELD_MUZZLE`). Bolts, the thrown wrench, the blast's sparks, the charge orb and the extinguisher's foam start
  there; bolts carry `z` (the muzzle's height) and are drawn lifted to it (were drawn on the floor, ahead of your
  feet), the streak never reaching back past the muzzle (`ox, oy`). Aiming with the mouse, the shot flies from the
  muzzle straight at the point (`aimFromMuzzle`; closer than 1.2: straight ahead).
- **Wrench:** 1 damage (was 3), still the 1.5 s stun.
- **An enemy ship's shot in the body** (a gunner, someone on a spacewalk): straight out (`hurtCrew(c, 3)`; an armor
  vest still soaks one step: down). Someone on a spacewalk in the line of a shot at the hull now catches it.
- **XP:** a gunner in a cannon at the jump counts as aboard.
- **Power lever:** the hub (wedge / pull the wrench) is picked where it's drawn, up on the dial (`pick` on the
  base sprite); the click spot was the ground point, below the visible hub.
- **Extinguisher foam** made light: its white particles went into the clustered particle lights (up to radius 7,
  intensity 3.2), lighting whole rooms white, worst in the dark with the helmet lamp. Foam (`p.foam`) is no light
  source now; only lit where a light falls on it.
- **Asteroids turn smoothly** (redone 2026-10-16; the stepped version still jumped, ghosted in the crossfade and
  re-laid the fissure every step): a rock now spins about the camera's view axis, so ONE picture per rock, turned
  on screen, is the exact rotation at any angle. The beauty pass is lit only by a light from the camera (+ the
  world), which that turn leaves unchanged; the directional light is the game's runtime sun / lamps on the normal
  map, and `GFX.sprite`'s `rot` now turns normals (and heights) about the view axis, not world z, so the light
  stays put (fixes the lighting of every screen-turned sprite). A big rock's fissure sits at screen angle 0 in its
  sprite and the rock is turned to point it at where the hit circle `crackPos()` projects (`asteroidSpin`; within
  0.19 of it), so hits are unchanged. Damage cracks are laid as the rock was turned when hit (`a.damageRot`) and
  turn with it. Enemy atlas 6.7 MB / 2 pages -> 1.2 MB / 1 page (384 asteroid frames -> 9).
- `tests/handweapons.js`: muzzle, wrench damage, lethal ship shots, the spacewalker blocking a shot.

### Thrown wrench sprite; steam, foam and fire redone (2026-10-14 playtest)
- **Thrown wrench** (sprite view): `items/wrench` (16 spin angles) lying flat at its flight height `b.z`, lit,
  the nearest angle turned on screen by the rest of `b.spin` so it spins smoothly (`drawWrenchSprite`,
  js/invader.js); ?classic keeps the 2D `wrench()`.
- **Steam** (was a few rising stroke "sausages"): soft particles, one radial-gradient puff drawn scaled and
  faded (`steamPlume` / `STEAM_KINDS` in js/decor.js), each a pure function of the time (no state, no per-frame
  allocation). They leave the source thin, slow down, widen and fade; sideways they follow a wave travelling up
  the plume (so they line up into one curling wisp), a slow drift and some turbulence. Mug: a thin, slow wisp
  (life 9.6 s: rises at a third of the first try's speed, same height and density); pot: wider, denser, rising in
  puffs as the stew bubbles; the spine's leaky pipe: a jet sideways that slows and drifts up. Sprite view: one
  upright canvas sprite per source, lit by the room (emissive 0.8); ?classic the same on the 2D canvas.
- **Extinguisher foam** (was white dots): each `p.foam` particle is a billowy puff (`dyn/foam_0..2`, a few soft
  lumps) that leaves the nozzle small, swells as it slows, churns sideways and sinks to the floor, so the jet reads
  as one dense cone; lit by the scene's lights only. Where it comes down it leaves a foam blanket on the floor
  (`foamDecals`, a ring of 72, this browser only, fades over 3.5 s). Gameplay (`spray()`, range, rate) unchanged.
- **Fire** (was the cartoon `fx/fire_*` / `fx/plasma_*` flipbooks, now unused): soft particle flames
  (`drawFlames`, js/mission.js), 22 tongues per fire rising from a glowing bed, narrowing and passing from the
  yellow-white core over orange to deep red (plasma: white, pale blue, violet, indigo), plus a white-hot core;
  unlit, depth-biased out of the part they sit on. `fireLook(f, t)` is shared with the fire's light
  (js/lights.js): the flicker, the swell as the fire nears flaring up / spreading (`f.t / f.period`: taller
  flames, more embers and smoke) and the foam smothering it (`foamOn`: flames shrink, the light dims, white steam
  bursts off). Smoke: the lit `fx/smoke_*` puffs, above the flames. ?classic: the same flames on the 2D canvas.

### The jump drive in every mission; gravity tides; the herd (2026-10-16, feedback on "The Deep")

The user: the coils are fixed in a minute and then nothing happens; coils and the jump handle only exist in
that mission, so they're unintuitive, and they do nothing visible at the jump.
- **Jump coils on every ship** (js/eva.js): the three coils (left, right, rear) are always on the hull, aligned
  (green) unless the mission has the `coils` rule. `coilFx(c)` says what one shows: while the drive spools
  (`jumpCharge`) aligned coils glow blue, their dials spin up (`spin`, up to ~24 rad/s), energy rings run out
  of them and near full charge a beam reaches the engine bell; a misaligned one sputters red with sparks; at the
  jump they flare (white-blue burst, `flare` 1 → 0 over 0.9 s). Drawing: `drawCoilEnergy` (js/mission.js, glow
  layer). Each coil misaligned when the drive spools still adds 15 s.
- **Jump handle at the helm in every mission** (js/minigames.js): without the `handle` rule the autopilot pulls
  it AUTO_LEAD = 3 s before the drive spools (`mission.autoPull`, the handle moves over AUTO_PULL = 1.2 s, banner
  "Autopilot: jump handle engaged"; the jump's timing is unchanged). With the rule (The Deep, The Mother of All)
  it can't: "No nav fix out here — someone pull the jump handle!", and a person holds it (6 s, as before).
  `handlePull()` is what the handle shows.
- **Gravity tides** (js/encounters.js, event kind `tide`, `{ dir: 'port' | 'star' }` optional): a 5 s warning
  (rumble `sfx.rumble`, a growing shake, a violet screen edge, banner "Gravity tide in 5 s", sidebar plate), then
  a 1.6 s lurch (`sfx.lurch`, full screen shake, a wave across the screen): loose items on the floor slide up to
  1.2 units towards that side (within their room, clear of furniture), spacewalkers are pushed away from the
  hull (4.5 u/s², they can steer back), and with the `coils` rule one aligned coil is knocked off (red, sparks).
  Rule `tides: <s>` (true: 60): a tide every ~that many seconds (×0.8–1.2).
- **The herd** (js/organic.js, event kind `herd`, `{ kinds: [a, b], side }`; `makeEvent('herd')` draws two
  different kinds of grappler / leeches / mother / spores): both encounters at once on one side, then a deep,
  whale-like call (`sfx.whale`), banner "Something calls from the deep… they're coming together, LEFT side!",
  a teal swell at that screen edge and a THE HERD plate for 8 s. Radar label "Herd: grappler + leech swarm — left".
  It counts as a fight (COMBAT_KINDS) and as a hot-zone kind (PRESS_KINDS).
- Practice: gravity tide, two herds, jump spool with the autopilot / pulling the handle yourself, a coils rule
  toggle. Radar plates got icons for organic kinds and mine drones (EVENT_ICONS, js/sidebar.js).
- Sprites: none new (hull/coil_*, hull/coil_dial, systems/jump_*); rings, beams, flares and the tide's wave are 2D.
- Test: tests/jumpdrive.js.

### The Deep and The Mother of All rebuilt; interceptors only where the pirates are (2026-10-16)

The user: The Deep "far too easy and unclear" (coils fixed in a minute, then nothing; "not enough new things"); The
Mother of All "boring" (survive + a random draw; the spore mother never showed up).
- **The Deep (c7):** a fixed list instead of the shuffle, no pirate ships at all: a spore cloud (opener), then herds
  (grappler + leeches, spore mother + spore clouds, then random pairs), two failing parts (`always: ['maintenance']`, two
  written), asteroids, an alien, leeches, an ion storm, the grappler, a coolant leak, the mother. Rule `tides: 70`: a
  tide every ~70 s that knocks an aligned coil out, so the coils are a spacewalk job all mission long. Solo: spores, 2
  failing parts, a herd (the finale). Briefing says what's out there (tides that pull at the ship and the coils,
  creatures that come in pairs as if steered, no nav fix → the handle). Deep drift (its twin): the same rules, a shuffled
  pool without interceptor / frigate / stealth fighter / saboteur, with 3 herds and 2 failing parts (`always`).
- **The Mother of All (c8):** a fixed escalating timeline, no pirates: spore clouds (opener, on the far side from the
  mother) → the spore mother → the grappler (the mother's other side: one capacitor can't feed both) → a failing part →
  herds and explicit tides → leeches → another failing part → more herds → the leviathan (`finale: true`, always last:
  `selectEvents` puts repeats before a written finale; `finaleLead` 30 so its whole 30 s pass comes before the jump).
  `always: ['spores', 'mother', 'grappler', 'maintenance']` + the leviathan (essential): solo and every crew size get
  those six; 4+ players get herds, tides, leeches on top. Rule `tides: 80`. Briefing names the spore mother, the
  grappler and the leviathan. Nightmare (its twin) keeps "everything" (pirates included; herd and tide added to its pool).
- **Interceptors only where the story has pirates:** c1, c4 (the Red Comet scout), c5 (the base's patrol). c2 opens
  with the asteroid swarm always (was swarm or interceptor), c3 with a mine drone the pirates left at the lab, c6 with a
  leech swarm (the Mire; leeches no longer `essential` there: the opener is never dropped). Skirmishes not tied to the
  story keep theirs: intro, Rush hour, Nightmare, Ore run (a mining run in the lanes), Black box, Stranded engineer.
- **More failing parts:** `always: ['maintenance']` in c4 / Pirate cove, c6 (+ a written one) / Ore run, c7 / Deep drift
  and c8 (two written). DROP_ORDER gained `tide` (after flare) and `herd` (after swarm: kept before other optional fights).
- **Balance model:** a herd = its two encounters' jobs at once (same side); a tide (event or the `tides` rule's clock,
  every `rules.tides` s) = everyone holds on through the 1.6 s lurch + with the coils rule one coil re-alignment spacewalk
  (prio 3, not optional); misaligned coils at the jump = coil jobs − done (≤ 3) × COIL_DELAY.
- **Calibration** (8 builds, expected kit; idle % for 1 / 2 / 3 / 4 / 8, * = energy out of spec):

  | Mission | Encounters | Idle | Aim solo / 2+ |
  |---|---|---|---|
  | c2 (opener swap only) | unchanged | 35 59 66 75 70 | 55 / 67 (in spec, approved numbers kept) |
  | c3 (opener swap only) | unchanged | 27 66 72 68 67 | 54.5 / 66.5 (in spec, kept) |
  | c4 | 3/5/11/14/24 → 4/5/11/14/23 | 28 68 65 66 76 | 54 / 66 |
  | Pirate cove | 2/6/11/15/24 → 3/6/11/15/24 | 47 67 64 66 76 | 53.5 / 65.5 |
  | c6 | 4/5/8/11/24 → 4/5/7/12/25 | 35 65 65* 65 70 | 37 / 65 |
  | Ore run | unchanged | 37 68 67 66 73 | 37 / 66 |
  | c7 | 1/1/5/9/25 → 3/3/4/5/15 | 29 55 69 71* 63* | 37 / 64.5 |
  | Deep drift | 1/1/5/8/27 → 2/2/3/4/12 | 33 63 70 66* 63 | 37 / 64.5 |
  | c8 (by hand, reactor ×0.35 for 1-6) | 3/3/4/6/23 → 6/6/6/7/16 | 7 44 64 64 65* | 37 / 64 |
  | Nightmare | 3/3/3/4/16 → 3/3/3/4/11 | 25* 56* 72* 52* 65* | 25 / 64 |
- **Misses:** c8 solo 7 % / ×2 44 % (the fixed six are more than a small crew's target; tests/scaling.js `FIXED`; in spec
  and doable only with a ×0.35 reactor); c4 solo 28 % (5 encounters: opener, two raiders, the failing part, a finale
  fight; the extra event tightens the gaps 103 → 77 s); c7 solo 29 % (4 is the least: opener, 2 parts, the herd finale).

### The infested leviathan: chapter 8's final boss (2026-10-16, `js/leviathan.js`)

The user's design: the leviathan isn't evil, it's sick. Leeches burrowed into its hide ("infested zones") and the pain drove
the Mire's swarms mad. The crew blasts the infestation off; freed, it sinks away. It replaces c8's old 30 s leviathan pass
(new event kind `leviathan_boss`, still the written finale; Nightmare keeps the old `leviathan`).
- **The body:** ~125 units, a chain of pieces (head, 7 segments at scale 0.9^k, tail and fluke at 0.9^7; dorsal + pectoral fins, zones,
  the nest, the eyes attached) hung back from its nose along a closed swim loop round the ship (`levLoop`: across the bow
  heading left, down the left flank, behind, up the right: the ship always on its left). Behind ~70 units the body curls
  outward (`levSpiral`), so it never wraps round the ship. The chain is laid out in screen space (x, y·sin50) as the
  sprites are modelled (`levChain`); targets and shell tests use the same chain. It parks at stations found by search
  (`levStation`: the step's targets where that cannon's view is).
- **1 The pass:** it crosses the bow: the dorsal FIN takes 2 front-cannon hits; then down the LEFT flank: its zones there
  (2 solo / 2 for two / 3 for 3+) take 2 left-cannon hits each; then round behind to the RIGHT flank, the same with the right
  cannon. It moves on when the side it shows is clean. Shells that miss splat on its back. Every 25 s a tail flick bumps a
  room on its side (4 s red warning on the floor, crew there hurt, a small hit).
- **2 Toxic gas:** T-10 (a big HUD number, banner, "Toxic gas in ten seconds. Everyone inside."), then 15 s of gas round the
  hull: anyone outside (spacewalk or cannon seat) when it comes, or who goes out during it, goes down where they are (armor
  doesn't help); treated as usual afterwards.
- **3 The side:** it parks on the left, then the right (since 2026-10-17; was a random side first), its EYE opens and two zones regrow on its head, glowing: 12 s (easy 16, very
  easy 20) to hit the eye and both zones once with that side's cannon (a big countdown on screen). Too slow: a leech swarm on
  that side, next time a tail slam (3 s warning, room bump + a big hit), alternating, then a new window. In time: it flinches
  and swims to the other side. Both done → 4. The swarm scales with the crew (2026-10-17, the user: solo it was unwinnable
  once the leeches came): 2 leeches solo, 3 with two, 4 with three, 6 with four or more (`LEVB_LEECHES`; the regular swarm
  event stays at 6), and never a second swarm while leeches are still on the hull (that miss is a tail slam instead).
- **4 Behind:** out of every cannon's reach. Its brood crawls in through two engine vents in the reactor room (24.8, 24.5) and
  (28.6, 24.3): a wave every 20 s (3 crawlers solo, +1 per extra player, at most 6), one laser / blaster / wrench hit each,
  slow; they head for the MID capacitor (drain 1 energy there) and bite crew in their way (one hurt step, 2 s cooldown).
  Someone charges MID to 3 (fixed, also with bigger capacitors) and holds the ENGINE OVERRIDE panel on the stern wall
  (26.6, 25.25) for 4 s (E or click; refused below 3 with the reason). The ENGINE BLAST (3 s) uses the 3 charges and burns
  the nest on its back → FREED: the brood dies, its teal glow comes back, it sinks (8 s), banner "It's free.", then the jump
  drive spools (c8's handle rule: someone pulls the handle; MID needs 1 energy again).
- **The jump waits for it:** c8 has `length: 560, finaleLead: 230` (the other events keep their old spread to 330 s; the jump
  is due ~4 min after the boss arrives, an estimate) and the fight holds the drive (`jumpAt ≥ t + 30` while it's alive); freed
  sets it to `t + LEVB_SINK`, like the pirate base's ESCAPE_SPOOL.
- **HUD:** a sidebar plate per phase ("Hit its FIN with the front cannon (1/2)", "LEFT flank: 2 infested zones left · left
  cannon", "T-7: get inside!", "Eye + zones in 9 s", "Brood in the reactor room! · MID 2/3 · engine override at the stern"),
  pulsing rings and hit pips on the current targets, banners at every step.
- **Hooks:** `org.boss` (plain data, synced in the snapshot with `org`); updateOrganic → updateLevBoss; drawCombatBack →
  drawLevBossBack (body, gas); drawOutsideOverlays → drawLevBossTop (rings, missing details, the blast); drawOrganicWorld →
  drawLevShip (vents, panel, brood); drawLeviathanWarning → drawLevWarning; drawEncounterOverlay → drawLevBossScreen;
  clickTarget → levClickTarget; invader.js boltHitsBody → the brood (BROOD_HIT); organicPlates → levBossPlates.
- **Drawing:** sprite names first, procedural 2D when missing (whole body: `drawLevBodyFallback`; each detail on its own):
  organic/levb_head, levb_seg_a/b, levb_seg_tail, levb_fluke, levb_eye_closed|open|hit (frame 0 left, 1 right),
  levb_fin_dorsal_ok|_hit1|_hit2 (segment 0, local x −1), levb_fin_pec (head-local (2, −7.2); the right one flipped, +π),
  levb_zone / _zone_glow / _zone_hit1 / levb_scar, levb_nest / _nest_burnt (zones and nest drawn ×1.75: LEVB_ZONE_SCALE), levb_brood (8 dirs × 4) / _brood_dead,
  levb_gas_a|b|c (unlit), systems/engine_vent_closed|open, systems/engine_override_off|ready|active, fx/engine_blast
  (origin at the bell, unlit). Placement constants in one place at the top of js/leviathan.js (LEVB_GEO, LEVB_SPOTS,
  LEVB_PEC, LEVB_FIN_SEG, LEVB_VENTS, LEVB_PANEL). Not yet: lights for the blast, sounds of its own.
- **Practice:** "Leviathan boss (from phase 1 / 2: toxic gas / 3 / 4)".
- **Balance model** (tools/balance.js `leviathan_boss`): jobs on its own clock: the fin (front cannon), left zones, right
  zones (their cannons and energy), the gas shelter (everyone, like a flare), two side windows (eye + 2 zones), tail flicks
  (small hits), three brood waves (laser fights), MID to 3 (a 'fight' on MID that uses 3 energies, so it waits for them) +
  the override. c8's encounter counts kept; ×3 / ×4 needed more fuel (cells 4 → 7, 5 → 9) to stay in spec over the longer
  mission. Idle (expected kit): 1 % / 35 % / 57 % / 58 % for 1-4 players, 63 % for 8 (5-8 out of spec as before, waits
  before the boss). Solo is far below its 37 % aim: the fixed six encounters plus the whole fight for one person (FIXED in
  tests/scaling.js; the model says "tight", not impossible).
- Test: tests/leviathan.js (each phase with simulated cannon hits, the gas, windows and punishments, the brood, the
  override, freed → jump, the drive held during the fight, laser vs brood, snapshot sync, a solo run start to end).

## Sound

- **Soundtrack:** original and fully synthesized (`js/music.js`), seven cinematic pieces shared by the
  missions, each with its own opening, lead, drums and feel: *Held Together* (intro, rush hour, practice; the
  first score's piece, unchanged), *Cargo Run* (ch. 1-3, black box; swing), *Red Comet Gallop* (ch. 4, pirate cove;
  6/8), *A Signal in the Dark* (ch. 5, stranded engineer), *Bloom* (ch. 6, ore run), *Pressure Hull* (ch. 7, deep
  drift), *Last Jump Home* (ch. 8, nightmare). Each builds in stages with the time towards the jump (threats push
  it up one stage), spools while the drive charges and ends on a big major-chord hit with the jump's boom. Pauses
  while the tab is hidden. Details: "New soundtrack".
- **Mute:** the speaker button at the top left, or M. It mutes music and effects, and is
  remembered in the browser.

## Tests

Headless Node tests (no browser needed; `tests/harness.js` loads the game scripts with a
dummy canvas):

- `node tests/balancemodel.js`: the balance model's travel table covers every pair of its spots in every variant and
  still matches a fresh walk; fire spreading (tools/balance.js `spread()`) grows with the wait and stays within reach.
- `node tests/reachability.js`: every weak spot of every enemy, on both sides, plus the
  asteroid crack, can be hit from its cannon within 10 s with good aim (with lead, within
  the cannon's arc). Each case runs 6 random sway patterns. Hull wear is off, so only
  direct hits count.
- `node tests/tutorial.js`: the tutorial's step machine, both branches (mouse with a failed block and the
  lock-LEFT detour; keyboard with the interceptor dead in the first fight): gates, the shot back on a miss, the
  block loop doing no damage, out of energy → reactor, the lever demo, the fire on climbing out (never spreads),
  the repair and the overview; then the free roam (saved at the end, every gate open, 10 minutes of walking
  about end nothing, Esc asks, BACK TO MENU leaves).
- `node tests/sway.js`: hitting an engine causes no position jump and no velocity kink.
- `node tests/cables.js`: the power lines' topology (reactor → trunk → lever → branches → capacitors), the energy
  bolts' way and timing, see 9r.
- `node tests/systems.js`: 25 checks covering the cannon and shield energy, the reactor
  timing and lever order, wasted energy, the wrench override, fuel crate → reactor,
  dropping items, the 5 s repair, broken capacitors, dimming lights, hull hits breaking
  parts in the right column, turret shots leaving along the barrel, the cable fizzle,
  and the invader (gets in, roams both decks, fights back, dodges, dies after 4 hits).
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

### No more XP: the locker asks for money only (2026-10-17)

The user: "missions still give XP, but I don't think there is anything that you can do with it?" XP only
gated gear (levels 1-4) and the profession (level 2), and money already limited every purchase (the balance
model's expected kit is the same with and without the levels). So XP is gone:
- Missions give money and reputation only (`computeRewards` returns `{ money, rep }`; `rewards.xp` and
  `XP_LEVELS` / `levelOf` removed). The end screen shows the pay and the reputation; finishing chapter 1 the
  first time adds "Professions are open: pick one in the locker".
- Gear has no level (`GEAR[].level` removed): buy it when you can afford it.
- A profession opens once chapter 1 is finished (`professionOpen`: `done.c1`, or a save that already had
  100 XP, i.e. level 2, so nobody loses access).
- The lobby plate shows the profession (or "No profession yet"), money and reputation, no level or XP bar;
  the multiplayer lobby no longer shows "lv N" (the server ignores an old client's `level`). Start over no
  longer says "level 1".
- Saves: `xp` stays in the profile (kept and number-fixed as before, never increased), so no version bump.

### Last Jump Home (deep): a variant to compare, music.html only (2026-10-17)

The user: "the wobble bass could have way more in terms of really deep notes … add the new one as another song in
music.html without actually putting it in". js/music/home.js is now `music.homePiece(V)` (called once with no
options: Last Jump Home, call for call as before, the opening hash unchanged); js/music/homedeep.js calls it with
`deep: true` as "Last Jump Home (deep)" (`homedeep`, no missions). Only music.html loads it (the game doesn't).
The deep growl: octave-down wobbles (suffix `_`, the sub too, down to ~33 Hz in C), a half-bar dive `D` (pitch and
sub fall an octave) closing every 4-bar phrase in stages 4-6, a louder sub (0.11 → 0.16), the body's highpass at
90 Hz (was 150), the deep-body layer louder and sweeping lower, and the drop's sub hit falling on an octave under
the root. Offline (music.html?check): climax RMS -18.8 dB (original -21.6), peaks -5.4 dB (original -6.1).
tests/music.js's "own opening / own build-up" checks skip pieces without missions (variants).
- Also (same day): music.html's spool is 2 bars of the chosen piece (was the last 15 s, ~5-7 bars): the player
  counts the spool's bars and jumps after the second, then the cadence and final hit (in the game the spool runs as
  long as the jump is delayed, as before). Last Jump Home (both versions) plays no drum fill at all now: the tom
  fill into stage 1 is gone (the user: off topic for the dubstep piece); tests/music.js's opening hash re-pinned.
- Deep v2 (the user: the drop's low hit had more bass than the wobble, louder overall, still not enough to move a
  subwoofer): the drop's sub hit at 60 %; a second sub an octave under the first (24-46 Hz), both subs through a
  soft tanh saturation (harmonics for small speakers); the first sub back down (0.16 → 0.12, the second at 1.3× it);
  the growl at 72 % and its deep body at the original's level. Measured on the climax (offline, mono FFT): below
  40 Hz +14.5 dB over the original, 40-60 +4.2, 60-120 +2.6, 120 Hz and up at or under it; K-weighted loudness
  +0.9 dB (v1: RMS +2.6 dB), peaks -4.7 dB.
- The deep version replaced the original (the user: "it is very good now. We can replace the old version"):
  js/music/home.js is Last Jump Home with the deep growl built in (no factory, no switch), js/music/homedeep.js and its
  music.html entry are gone, and tests/music.js's "own opening" checks are strict again. The game (c8, Nightmare)
  plays it.

## One ship: the host's (2026-10-17)

The user: "In multiplayer both people can upgrade the ship, which one counts? It seems broken because there is only
one ship. I guess only the host should be able to get rep and upgrade." Before, the server flew the union of everyone's
upgrades and everyone earned reputation for them. Now a multiplayer game flies the host's ship:
- server.js `startGame` passes only the host's `ship` (from their hello) to `netServer.init`, plus `{ id, name }` of
  the host, which `init` stores as `mission.shipOf` (synced in the snapshot). The lobby message carries `hostShip`.
- `creditMission`: with `mission.shipOf` set and not you, you are a guest: your reputation is 0 (first-clear bonus
  too); money, the finished chapter and its unlocks are as before (they never depended on reputation). The end
  screen says "the reputation goes to <host> (it's their ship)". Solo is unchanged (no `shipOf`). If the host leaves
  mid-mission, the reputation of that run goes to nobody (it was their ship).
- Lobby (`lobbyUI.flight`, set by net.js from the lobby message): the briefing says "Flying <host>'s ship" (or "Flying
  your ship" for the host), the recommended upgrades are marked ✔/✘ against the ship that will fly
  (`missionRequirements(id, ship)`: the host's for a guest, your own otherwise), and the Shipyard says it upgrades your
  own ship, used when you play solo or host. No save format change: guests keep their own `ship` and `rep`.
- Tests: tests/network.js (guest's upgrades don't fly, host's do, `shipOf`, `hostShip`), tests/progress.js (rep only
  to the host, money and the chapter to the guest).

### No spoilers in Strange Cargo, no "Jump drive spooling up." voice (2026-10-17)
- Chapter 2's objective said "Kill both intruders." in the lobby and the HUD before anything had happened, and its blurb and
  briefing told the whole story. Now the objective carries a `cover` ("Get the salvage pod to the Xenobiology Institute"):
  the lobby shows it, and `objectiveStatus()` shows it until the aliens show up (the intruder event ran, the radar saw it, one
  is aboard or dead); then "Kill both intruders (0/2 dead)" as before. The objective's logic (and the fail text, shown after the
  fact) is unchanged. Blurb and briefing now only hint (a warm sealed pod that scratches; the security console and a weapon
  if anything gets loose). tests/intruder.js checks the cover text, the switch, and that blurb/briefing don't name them.
- The ship voice no longer says "Jump drive spooling up." (it came when the mission is basically over); the banner stays, as
  does "No navigation fix. Manual jump required." (that one asks you to act).

### The nav core has to be installed in our helm (2026-10-17)
- User: "When the nav core is adrift it is solved just by picking it up — that is kinda weird. You should need to mount or
  insert it somewhere." Chapter 4 / Pirate cove (objective `navcore`) now count only once a core is **installed in our helm**
  (bridge): carry it there (from the raider's nav console or fished out of space; every way ends the same) and hold click
  `NAVCORE_INSTALL` 3 s on the helm (`helmNavcoreTarget` in js/dock.js, checked before the helm's diagnosis click and only
  while you hold a core and none is in yet). That sets `dk.helmCore` (in `dk`, so it's in the snapshot; reset with the dock):
  the core leaves your hands and stands in the helm desk's right end, glowing (`drawHelmNavcore`: the core's 2D drawing as an
  upright canvas sprite on the desk top; classic: on the canvas). No new id stored in saves; no timings of the pull / drift
  changed. A raider shot down after that flings no core (as with one aboard).
- Objective text: "Get a Red Comet nav core and install it in our helm" → with one aboard "Install the nav core in our helm
  (bridge)" (jumping then: "with the nav core not installed") → "Red Comet nav core installed in our helm". A NAV CORE plate
  says who has it and where it goes. Blurbs / briefing say so; practice has "Nav core adrift (left; install it in the helm)".
- tools/balance.js doesn't model the walk to the helm and the 3 s install yet (the calibration of c4 / Pirate cove is from
  before this): left as is, no numbers re-tuned.
- tests/dock.js: carried aboard (both ways) isn't done; installing at the helm is; the snapshot carries `dk.helmCore`.

### Treating adds up; E alone gets you up (2026-10-17)
- User: "patching yourself up and someone else patching you up should be additive." The treatment's progress used to live
  in each treater's own hold (`player.treat.t`), so a crewmate helping you while you patched yourself up raced you instead
  of helping. It now lives on the patient: `c.heal` (0..1, in the crew snapshot: js/net.js adds the one field). Everyone
  holding on them adds `dt / their own time` (self 10 s / 6 s first aid / 3 s stim, crewmate 2 s / 1.2 s first aid; the
  heartbeat bonus adds 0.5 s of their own time), so self + crewmate fills at 1/10 + 1/2 per s (1.67 s), and it ends for
  everyone at 100 % (every crewmate who helped counts as a medic). `player.treat` only keeps your own hold (the heartbeat's
  phase, the 0.4 s grace). Interruptions as before: letting go briefly keeps it, and while anyone is still on it the progress
  stays; once nobody is (`updateInjury`), it starts over. A new hit also starts it over. No time itself changed.
- `workProgress`: treaters and the self-treating patient all show the patient's shared progress; a patient who isn't helping
  (out cold) gets a bar too ("X is treating you").
- User: "patching myself up needs me to hover over me with the mouse and press E". Down / out, holding E now patches you up
  directly in `updateInteraction` (no nearby-target scan, wherever the mouse is, even with the mouse button held elsewhere);
  holding click on yourself still works. Down, that is the only thing you can do, so nothing else competes for E. Prompts:
  "Down — hold E (or click on yourself) to get up (10 s)"; the tutorial's injury page says the same in mouse mode.
- tests/treat.js: self alone, crewmate alone, both (1/(1/a+1/b)), own gear each, one stops / all stop / hit again, the
  snapshot giving both browsers the same bar, E with the mouse anywhere, clicking yourself, E on a downed crewmate.

### Multiplayer over the internet: no rubber-band walk, smooth in-between, compressed snapshots, the lever (2026-10-17)
- User (2 players, one hosting `node server.js`, the other joining, possibly over a cloudflared tunnel): "ui is weird in
  multiplayer - it seems laggy. Also the lever is weird." Reproduced with the server sim and a browser copy with every
  message delayed (60 ms each way + 30 ms jitter; also two headless browsers, the guest's WebSocket through a delaying proxy).
  What it concretely was:
  - **Your own walk lagged a round trip.** The browser predicted your movement but pulled you back towards the server's
    position whenever it was more than 0.6 m off, and while walking the server is always a round trip of walking behind
    (4.2 m/s × ~150 ms ≈ 0.6 m): at tunnel latencies the prediction was undone, you saw yourself where the server had you
    (start late, slide on after letting go, snap back on a jitter spike).
  - **Your prompt and E ring lagged too**: the "E: …" prompt over your head and the white E ring come from the server, from
    where it has you, so walking past things they showed up late and stayed behind.
  - **Everything else moved at 30 Hz with jitter**: shells (45 m/s: 1.5 m jumps per snapshot), shots, bolts, sparks,
    asteroids, energy bolts on the cables, the intruders, the lever's handle, and the sim clock (`time`) itself only changed
    when a snapshot arrived, and over a tunnel two often arrive together.
  - **The snapshots are big**: ~10 KB of JSON (peaks 20 KB), 30 a second, uncompressed: 2.5–5 Mbit/s per guest from the
    host's uplink, and the server queued them without limit when a connection couldn't keep up (lag that only grows).
  - **The lever**: a tap on E showed a "Wedging the wrench in" bar while you held the key (also solo), then the lever turned
    (a round trip later), the prompt kept saying "turn lever to RIGHT" for another 0.15 s (the cached E target kept its old
    text), and the handle swung in 30 Hz steps. A handle that had sat on RIGHT for over a minute (angle exactly 0) snapped
    instead of swinging (`angle || target`).
- **Reconciliation** (js/net.js): every input carries a number (`seq`); the server keeps the last one per crew member
  (`input.seq`) and sends it in the crew snapshot. The browser keeps where it had you per input (`netHist`, ~4 s) and compares
  the server's position with that, not with where you are now (`netReconcile`); only a real difference (a door, a push, a
  move only the server made) glides away (or snaps over 1.5 m), shifting the history along. Same walk as with no lag, at
  60+30 ms and at 150+80 ms each way.
- **Your E prompt from your screen** (`netLocalPrompt`, `ePromptOf` in js/game.js): the "E: …" suggestion and its ring are
  worked out in the browser from where you see yourself (only that one; what you stand next to — ladders, buttons,
  airlocks — and screen prompts stay the server's).
- **In between snapshots** (`netBetween`, every frame): the sim clock runs on smoothly (never backwards; `netClockSync`),
  shells / shots / bolts / sparks / asteroids fly on with their own velocity for up to 0.12 s, the energy bolts on the
  cables move on, the intruders and pirates glide to their server position (like the other crew), and the lever's handle
  swings in the browser (`animateLever`, js/systems.js, shared with the server's `updatePower`).
- **Compression and back-pressure** (server.js): permessage-deflate (RFC 7692; every browser offers it), the server's side
  with the context kept between messages: a snapshot is 0.5–3 KB on the wire instead of 10 KB (~25–90 kB/s per player).
  The browser's own messages may come compressed too (each on its own). All text goes through `sendText` (in order). A
  connection that is behind (a compressed message waiting, or 64 KB unsent) skips snapshots (each is the whole state) and
  gets the skipped sounds with the next one. When the server catches up several ticks at once it sends one snapshot.
- **The lever**: no hold bar during a tap (`LEVER_E_BAR`: the bar shows once you've held E 0.15 s; a tap turns, a hold of
  0.5 s wedges, as before); `nearbyTarget` remembers *where* its target is and asks that spot again between rescans, so the
  text is fresh right after a turn (solo too); `angle ?? target` and the handle starts on MID.
- No gameplay rule or number changed; no save change.
- `tests/latency.js` (new): the server sim and a guest browser with delayed messages: the walk matches a lag-free one, a
  server-only move reaches the screen, E tap turns the lever once with no bar, the prompt follows within a frame, the handle
  moves every frame, holding E still wedges, shells fly on between snapshots, the clock never stops or goes back.
  `tests/network.js`: a raw client offering permessage-deflate gets compressed snapshots (4 KB on the wire for 98 KB of
  JSON) and can send compressed messages (opens and starts a game with them).

### Red Comet Cove runs 7 minutes (2026-10-17)
- Playtest (2 players): "we need some more time for the red pirate cove"; then "mission time is probably good at 7 min".
  c4 now has `length: 420` (was the default `MISSION_LENGTH` 360): the same events per crew size, spread evenly from the
  30 s opener to 398 s (the swarm finale), the jump 22 s later. Nothing else is c4-specific: `layoutMission` already
  spaced the events to `M.length − finaleLead`, and the reactor follows the gaps (`paceFactor`), so the energy per gap
  is what it was written for.
- What the time is for: each raider is one chance at the core. Shot down: the fight (~20 s), a spacewalk to fish the core
  in (~20-30 s, it drifts off after `NAVCORE_LIFE` 60 s), back through the airlock and up to the helm (~10 s) and the
  install (`NAVCORE_INSTALL` 3 s). Docked: it docks after `DOCK_TIME` 40 s, two pirates to fight, into the raider, the pull
  (4 s), back and up to the helm, the install: ~90-100 s after it shows up for a crew that knows the way, more for a new one.
  Solo / 2 players: raiders at 2:02 and 5:06 (were 1:47 / 4:21), 1:54 from the second raider to the jump (was 1:39), and
  4:58 from the first (was 4:13). 3+ players get the raiders early anyway (×3 1:07 / 2:20, ×4 0:58 / 1:55).
- Music: the stage follows `t / jumpAt`, so the piece stretches; Red Comet Gallop's climax (stage 6) now starts at 354 s,
  66 s before the spool (at 360 s: 309 s, 51 s before), drops 217 / 251 / 354 s, breakdown 240 s (music.plan(420)).
- Balance (`node tools/balance.js c4`, expected kit): at 420 s with the old cells / reactor ×3 and ×4 went out of spec (star
  cannon waits 128 s at 322 s / 8 s at 256 s). The user's rule from the swarm change (counts kept, energy fixed with cells /
  reactor only) over `--calibrate`, which with the longer gaps wanted more encounters (4/6/12/17/21/23/23/23) and Bigger
  capacitors as a new prerequisite: refitted by hand like `--calibrate` (fitCells with the kit, mildest reactor in spec):
  cells 2/2/12/11 → 4/4/12/10 for 1-4 players, reactor ×3 0.5 → 0.6, ×4 1 → 0.85; 5-8 unchanged.
  Idle 1-8 players: 28 68 65 66 66 68 73 76 % (360 s) → 45 72 70 70 71 70 74 78 % (420 s), all in spec; solo "tight" (fights
  wait 18 s for energy) → doable. The model still leaves out the walk to the helm and the 3 s install (see the nav core
  install above): a few seconds per run, not enough to move the fit.
- tests/scaling.js: c4 in the timeline check (its counts, jump at its own length, even spacing); a c4 check (jump at 420 s,
  both raiders, at least 110 s from the last one to the jump at every crew size).

### Performance, round 2: skip what's off screen (2026-10-17)
Request: "can you optimize". Measured first (headless Chromium on the real GPU, 1920×1080, dpr 1, per-frame timers round
`simTick` / `clientUpdate` / `netApply` / `render` plus the CPU profiler; then the same in headless Firefox over WebDriver
BiDi), in four busy scenes: practice with interceptor + frigate + swarm + intruder + fires + breach + surge + storm +
coolant + grappler + leeches (on the bridge), the pirate base docked (in the left airlock room), the leviathan boss
(phase 2, from the front cannon) and 2-player multiplayer (practice, 8 encounters). The simulation is cheap
(0.05-0.35 ms a frame, the browser-side update 0.1-0.2 ms, `netApply` ~0.1 ms); the frame is the render.
- Where it went: the ship is drawn whole every frame and the camera shows about a room of it. The 2D layers' dirty
  tracking (`trackDirty`) re-read half a dozen context properties for every piece of every stroke (the power glow's long
  dashed cables), stencils and labels round the whole ship were measured and rasterized off screen, the sidebar plates
  measured their second line word by word (~a dozen `measureText` a plate a frame), the steam and the map table's radar
  sweep were redrawn and uploaded off screen, enemy shields' hex cells were built off screen, and every floor / wall /
  spine tile rebuilt its options (strings, arrays, objects) each frame.
- Changes (no visual change; nothing in the simulation):
  - js/gfx.js `trackDirty`: the margin (`pad`: compositing, filter, line width, miter, shadow) is read once per call, not
    per path piece; `rectBox` without temporary arrays; the text box's font size parsed once per font. A drawing call
    whose box lies entirely off the canvas is skipped (fill, stroke, fillRect, strokeRect, fillText, strokeText,
    drawImage): it can't change a pixel. Text far off is skipped before `measureText` (a bound of 2 em a character plus
    the letter spacing). `arcTo` adds its corner to the path box (still marks the whole layer).
  - `GFX.onScreen(x, y, z, r)`: can anything within r of a point show this frame. Used by `steamWisps` and the map
    table's sweep (no redraw / upload off screen), `drawEnemyOverlays` (overlay, smoke, shield; the tag and the tentacle
    still draw) and `drawFloorSprites` (a whole floor rect off screen).
  - Sprites: a sprite's pages, once loaded, are remembered on it (`S._ready`, `pageOf`); floor tiles, wall pieces and
    spine pieces are worked out once (js/sprites.js `floorTiles`, `buildWallPieces`, `buildSpinePieces`); `end()` sorts
    the queue into its layers in one pass.
  - js/sidebar.js `plateLines`: a plate's wrapped / cut second line is remembered per text.
- Checked: deterministic frames (seeded `Math.random`, a fake clock, rAF frozen, 40 frames stepped by hand) in 7 scenes
  (the four above plus walking with the camera moving, a side cannon with a grappler, a spacewalk) are pixel-identical
  before / after (21 screenshots, 0 differing pixels); `?classic` runs clean.
- Results (ms of main thread a frame, avg / p95, before → after; 3 alternating runs each, a busy machine):
  Chromium render: busy 3.51/4.73 → 2.72/3.83, docked 2.63/3.63 → 2.11/2.90, leviathan 2.37/3.07 → 2.01/2.83, multiplayer
  4.66/6.13 → 3.67/4.93 (host) and 4.67/6.17 → 4.05/5.13 (guest). Firefox (software 2D canvases, like the user's laptop):
  busy 9.95/11.57 → 9.45/11.20, docked 7.07/9.65 → 6.24/7.94, leviathan 5.59/7.26 → 5.16/6.68.
- Left (bigger, or not mine to change): in Firefox most of the rest is rasterizing what is on screen on the full-size
  HUD canvas (use rings ~0.9 ms, sidebar plates ~0.75, the storm's darkness ~0.7 as a full-screen evenodd fill) and the
  2D layers' readback + upload (~1.3 ms busy: ~320 k pixels a frame of 'mid' and 'glow', static decor re-uploaded every
  frame; caching static layer content across frames would need to know what's static). Multiplayer guests parse a JSON
  snapshot per message (`ws.onmessage`, ~1% of a frame; net.js).

### Captain Red Comet's HP by crew size (2026-10-17)

The user (2 players: too much; it "should scale almost linearly with the amount of people"; then "do 18/24/... and
then near linear"): `captMaxHp` is 18 solo, 24 with two (70 % of the old 36), then +12 a player up to 8 (36, 48 …
96); was 24 + 12 a player, capped at 4. The balance model keeps chapter 5 in spec at every crew size (solo tight
42, ×2 doable 30). The phase thresholds are fractions of the bar, so they follow.

## Lever handle sprite restored (2026-10-17)

The handle twitched and never reached RIGHT: the leviathan commit had re-packed the `systems` atlas from
stale renders (13 handle frames at 15°, an older wrench), while js/systems.js steps through 19 frames at 10°,
so frames past 12 wrapped around. Re-rendered the leviathan's own systems sprites (engine vents, override
panel) here and re-packed `systems` from the current renders: only `lever_handle` (19 frames),
`lever_wrench` and the until-now missing `lever_bus` change. tests/systems.js checks that the packed sheet
has a frame for every step the code uses.
Then the handle was made to turn clockwise only: lever.py renders a full turn (36 frames, 10° apart; RIGHT → LEFT
carries on round the bottom), and `animateLever` keeps the angle within one turn past LEFT and always aims at the
next target in the turning direction. tests/systems.js checks it never steps back or jumps.

## Playtest 2026-10-17 (2)

- **OUT and crawling:** an OUT crew member may crawl back up only while nobody else stands; when a crewmate got up
  elsewhere, the crawl was cancelled and its progress lost. Now a crawl (or a treatment) already going on you keeps
  going (`treatInfo`: `who.heal != null`), and a crewmate treating you adds to the same bar. tests/treat.js.
- **Sounds only you hear:** `sfxFor(c, kind)` (js/audio.js): solo it plays; on the server `sfx.forCrew` tags the
  event with c's id and only that browser plays it (js/net.js netPlaySfx). The radar's ping/garble and the
  heartbeat click while treating use it. tests/sfxfor.js.
- **Clean-ship bonus:** up to $25 (`CLEAN_BONUS`) for bringing the ship back in one piece: $25 × (1 − broken parts
  at the jump / MAX_DAMAGE), so 0/5 = $25, 5/5 = $0. `missionResults` records `damage` / `maxDamage`; the end screen
  shows it. tests/progress.js.
- **Chapter 5 (Rescue Dr. Varga) is 7 minutes:** `length 420, finaleLead 360` (the jump is due 360 s after the
  docking at 60 s instead of 240). The 7 minutes asked for in the first playtest were meant for this mission (the
  captain's), not chapter 4; chapter 4 keeps its 420 s for now.
- **The captain's raid comes after the fight starts:** `CAPT_RAID_DELAY` 15 s after the captain's fight first starts
  (was 6), and the `CAPT_RAID_LATE` fallback (150 s after docking) is gone: it mostly came first, while the crew was
  still clearing rooms, so the stab in the back came before the thing to focus on. tests/captain.js.
- **E repairs / services from anywhere next to the part:** with the repair kit in hand, a broken or failing part in
  reach wins E over a door, hatch, shield button or console you stand next to (`repairInReach` sets `noE` on those
  proximity prompts in js/game.js `act`; `nearbyTarget` ranks repair targets first). Before, from some sides of the
  cannons, the middle capacitor, the reactor and the deck airlocks, E pressed the button / forced the door instead.
  tests/controls.js tries every inside part from 8 sides.
- **The Deep: one encounter more ("deep space … too chill"):** the alien (`intruder`, was written at 190 s and only in
  4+ player runs' later half) now comes second, 50 s (before the first herd), and is kept at every crew size
  (`MISSIONS.c7.always: ['maintenance', 'intruder']`). `crew.events` 3/3/4/5/6/7/9/15 → 5/5/5/6/7/8/10/16, set by hand:
  solo-3 used to get 4 (the opener, two failing parts and the finale herd the game adds), now 5 (+ the alien), 4+ one
  more as well. Written before the herd so a small crew's herd stays the finale: a second herd mid-mission (what the
  count alone would add, by DROP_ORDER) put 1-3 players out of spec (one side cannon for both creatures; "impossible"
  solo / ×2, and no cells / reactor fixed it). Easy / very easy now drop the herd before the alien for small crews.
  Cells refitted like `--calibrate` (fewest that do as well as plenty + 1, reactor 1 where no faster one gets in spec;
  solo keeps its ×0.7): 3/3/3/3/4/5/6/9 → 3/3/3/4/5/5/6/9. Balance model (expected kit, 8 builds; the one-tide rule and
  3 mines in place), idle % for 1-8 players, before → after: 39 67 77 70* 63 63 64 62 → 40 63 74 72* 65 64 62 57
  (* out of spec: ×4 "star cannon waits 37 s" → 9 s, energy waits ×4 100 → 48 s). Solo ~unchanged by the model (the
  shorter gaps speed the reactor up: the finale herd no longer waits for energy), 2-3 players busier. With one tide
  per mission (same day) c7 solo moved above its 37 % target, so it left tests/scaling.js's BELOW list (within the fit).
  tests/scaling.js checks the alien (once, before the herds) and the event count at 1 / 2 / 4 / 8 players.

### Leviathan: one way round, no extra laps; zones count as they swim into view (2026-10-17, js/leviathan.js)

Playtest: "Isn't it supposed to go front → left → right → back? It constantly swims left and right and you cannot
even hit all the spots from the right." Found (headless sim of a scripted win, the head's side logged over time):
- **Extra laps:** it only swims forward round its loop (front → left → behind → right → front), and every stop is a
  fixed loop position. Phase 3's first side was random, and the stops came out of order: after phase 1's right stop
  (its head across the bow) a random RIGHT meant a whole lap (front, left, behind) to come back to the same side, and
  phase 4's stop behind (s 216) lay just *before* phase 3's right stop (227), so from the right it swam one more full
  lap past the front and the left to get behind. A scripted win swam 2.9 laps, passing each flank 4-5 times.
- **"Can't hit them from the right":** every weak spot at every stop *is* hittable by its cannon (a real-cannon sim: aim
  within the arc, fire, 12 tries each, 1 and 3 players: all hits, no splats on its back). But targets only counted once
  it had parked, and parking comes at the end of a long, slowing glide: on the right flank the zones swim up into the
  right cannon's view and every shot at them splatted for several seconds; during the extra laps the zones and old scars
  passed both flanks again and again, never hittable.
Fixed (no numbers changed; the fight's steps, HP, windows and timings are the same):
- Phase 3 goes LEFT first, then RIGHT (the way it swims on from phase 1's right stop): `levStartSide(B, 'port')`.
- The nest sits on segment 3 (was 2, `LEVB_SPOTS.nest`), so the stop behind (the nest in the engine's exhaust) comes
  2 units after phase 3's right stop: from the right it settles behind with a short glide. Order now: front → left →
  right → gas → left → right → behind, each move less than a lap; a scripted win swims ~2 laps (was 2.9) and is ~25 s
  shorter.
- Phase 1's fin / zones count as soon as they're out on their side and inside that cannon's view, also while it's still
  swimming into place (`levTargets(B, ch)`, rings drawn from then on); the eye windows still open only once parked.
- tests/leviathan.js: the side order over a scripted win (and every move < 1 lap, the last glide < 15 units), every
  weak spot at every stop hit by its side's cannon for real (1 and 3 players), zones counting while swimming up.
Open (story, the user: "why do we need to shoot its eye? I thought we're trying to heal it?"): the eye (and the dorsal
fin, phase 1) are targets that hurt the creature; see the report's options (leech over the eye / a third regrown
zone instead of the eye; a leech clump on the fin).

### One gravity tide per mission (2026-10-17, js/encounters.js, js/mission.js)

Playtest: "the gravity coils: there is no point if they go out of alignment _all_ the time. Just do one gravity wave
per mission." The repeats came from the `tides: <s>` rule (c7 / The Deep 70, Deep drift 70, c8 / The Mother of All 80):
`updateTide` started a tide every ~that many s (×0.8-1.2 each time) until the jump, ~4 a mission, each knocking a coil
off. c8 also had two written tide events (140, 225 s, picked for 7-8 players) on top of its rule.
- The rule now means ONE tide at that many s (where the first came before: 70 / 70 / 80 s), then never again
  (`enc.tideDone`, a JSON-safe flag in the snapshot).
- `selectEvents` picks at most one written tide (`oneTide`): none when the rule brings one (so c8's two written tides
  are never picked; they stay in the build so the written spread, and with it the reactor's pace, is unchanged), else the
  first written one; `tide` is never a repeat kind for big crews (`ONE_OFF_KINDS`). Nightmare's one pool tide is as before.
- Briefings / blurbs: "a gravity tide rolls through" instead of "every minute or so".
- tools/balance.js models the rule's one tide (was one every rules.tides s up to the jump).
- tests/jumpdrive.js: the rule's tide comes once and never again (2 more minutes), the flag survives a snapshot, and at
  most one tide (written + rule) in every mission at 1-8 players and every difficulty (c7, c8, Deep drift keep theirs).
No numbers changed, so the missions got calmer: in the model Deep drift solo went from 33 % to 51 % idle (target 37 %)
and 63 / 69 % → 75 / 78 % for 2 / 3 players (target 64.5 %): tests/scaling.js flags it OFF until it is re-calibrated.
c7 ×1 27 → ~39 %, c8 ×1-4 1 / 35 / 57 / 58 % → 16 / 51 / 65 / 67 %. c8 at 8 players gets two repeats (leeches, spores)
in place of its two written tides (same event count).

### Red Comet Cove back to 5 minutes (2026-10-17, js/progress.js)

The user: "mission 4 should go back to 5" (the 7 minutes from the playtest were meant for chapter 5, see above).
c4 `length: 300` (was 420 that morning, 360, the default, before). `layoutMission` spreads the same written timeline from
the 30 s scout to 278 s (`end = length − finaleLead`, JUMP_DELAY 22), the jump at 300 s; the reactor follows the gaps.
- The nav core (solo / 2 players: scout 30, raiders 1:32 and 3:36, failing part 2:34, swarm finale 4:38): the first
  raider leaves 208 s to get its core (360 s: 253 s, 420 s: 298 s), the last one 84 s (99 s / 114 s). In the model a
  2-player crew has the first raider's core aboard at ~137 s (fight 17 s, the fetch 20 s; + the walk to the helm and the
  3 s install, not modelled: ~150 s). The second chance still fits by shooting the raider and fishing the core in
  (~50-60 s with the install), no longer by letting it dock and boarding it (docks 40 s after it shows up, then ~50-60 s
  more: past the jump), and it overlaps the finale swarm. 3+ players get both raiders in the first 2:20.
- Balance (`node tools/balance.js --calibrate c4`, expected kit, mines drones always 3): with the counts kept and cells /
  reactor refitted (5/4/11/10/14/17/17/17, reactor ×3 0.7) ×3-6 sat at 56-61 % idle, 6-10 points under the aim (the same
  encounters in 5/6 of the time; tests/scaling.js flagged 2-4 players OFF). So the --calibrate fit, counts included:
  events 4/5/11/14/18/23/23/23 → 4/5/8/11/14/19/23/23, cells 4/4/12/10/14/17/17/17 → 5/4/8/9/11/14/17/17, reactor 1
  everywhere (was ×3 0.6, ×4 0.85). Idle 1-8 players: 45 72 70 70 71 70 74 78 % (420 s) → 19 59 66 67 66 67 66 70 %
  (300 s), all in spec. Solo / 2 players can't get fewer than their 5 encounters (scout, two raiders, the failing part,
  the finale): solo is "tight" (busy 81 %, below the 25 % floor tests/scaling.js wants for the essentials-only missions),
  2 players 59 % (aim 66).
- Music: 300 s is the length the pieces are planned for (music.plan's default): Red Comet Gallop's drops at 160 / 194 /
  251 s, the breakdown at 183 s, the climax from 251 s (49 s before the spool).
- tests/scaling.js: the c4 check now wants the jump at 300 s, the first raider before 100 s and at least 80 s from the
  last raider to the jump at every crew size.

### Strange Cargo: the aliens hatch out of the cargo pods (2026-10-18, js/invader.js, js/progress.js, models/cargo/pod.py)

The user: "they should hatch out of the pods. Your mission is to carry the pods but then they hatch." Chapter 2 is now a
delivery job: two sealed salvage pods for the Xenobiology Institute, strapped down in the reactor room, and its intruder
event hatches them instead of bringing two aliens in through the airlocks.
- The pods (`boarding.pods`, js/invader.js `CARGO_PODS`): at (28.15, 23.3) and (29.55, 23.3), right of the engine below the
  power line to the right airlock room, 1.2 × 0.72 each, solid (`podRect` in SOLIDS, re-synced by `syncPodSolids` at the
  mission start and on every snapshot). `startMission` sets up as many as the mission's written intruder events with
  `pods: true` ask for (only c2: 2); every other mission has none. tests/intruder.js: they shut off no floor.
- The event (`evAt('intruder', 90, { count: 2, pods: true, radar: false })`): pod i starts to stir `i × POD_GAP` (10 s)
  after it, with a banner ("Something is moving in the cargo pod!"), thumps, a stronger amber throb and a sidebar plate
  with a countdown, and bursts `POD_STIR` (6 s) later (`podHatchAt(i)`: 6 / 16 s): goo and shell shards, its alien crawls
  out in front of it, keeping to its deck while the other lives (the first the upper, the second the lower, as the airlock
  pair did). The shell stays, burst open. More aliens than sealed pods: the rest through the airlocks as before.
- Not a radar contact (`radar: false`): it happens inside the ship. So the objective keeps its cover ("Deliver the cargo
  pods to the Xenobiology Institute") until the first pod stirs (the event ran), then "Kill both intruders (k/2)".
- Multiplayer: `boarding.pods` is in the snapshot (js/net.js).
- Sprites (group `cargo`, `tools/blender/models/cargo/pod.py`): `cargo/pod_0|1` (frames: at rest, left bulge, right bulge,
  big bulge with the pod rocking; the two differ in the stencilled number and the tape) and `cargo/pod_0|1_open` (petals
  peeled back, slimed cavity, goo drooling into a puddle, a strap snapped, shards). Sealed, a pod twitches now and then
  (looks only); stirring, it cycles the bulges ever faster and shudders. A warm light per pod (js/lights.js), green once
  open. 2D fallback for ?classic.
- Story: new blurb / briefing (a cargo run, "warmer than cargo should be", the manifest says DO NOT OPEN).
- Balance (no numbers changed): tools/balance.js models the pod variant (`ev.pods`: each alien released at
  `podHatchAt(i)`, the crew walking to the reactor room instead of the airlock rooms; no radar warning any more). c2 score
  1-4 / 8 players 41 / 34 / 31 / 27 / 34 → 48 / 31 / 25 / 21 / 34, idle 35 / 58 / 66 / 74 / 69 % → 34 / 60 / 69 / 77 / 70 %:
  solo a little harder (no warning from the radar), bigger crews a little easier (the fight is in the middle of the ship).

### Balance model: a travel table, fires that spread, 10 builds (2026-10-18)
- The user asked whether the idle time counts reloads, time between shots and enemy shots getting through. It did
  (1.2 s per shot vs the 0.45 s cooldown, a 3 s reload per 3 shots, damage while the enemy lives → repair jobs), but
  a fire cost the same whether it was reached at once or 40 s later. Solo, fires wait behind the next encounter.
- **Fires spread** (tools/balance.js `spread()` / `fireWork()`): the game's rules from js/mission.js updateFires. Every
  FIRE_TIME (22 s with sprinklers) a fire spreads (1/3), burns its part out and keeps burning (1/6), burns it out and goes
  out (1/6); plasma fires every PLASMA_TIME burn their part (1/2) or spread. The fire job's work is settled when someone
  gets there: fires × `FIRE_WORK` (3 s) + burnt-out parts × (REPAIR_TIME + `PART_WORK`) (+ the repair kit's fetch). Worked
  out for one whole fire and scaled by the expected count, limited to `FIRE_REACH` (8) / `PLASMA_REACH` (4) parts.
  Incidents per hit are now the game's: HIT_FIRE (0.24) fires and HIT_BREAK (0.06) broken parts per small hit, a fire
  with every big hit (was 0.5 'incidents' per small hit at 4 s each). The overcharged reactor's fires spread too.
  `--detail` shows each fire job's growth ("0.4 → 0.6 fires, 0.3 parts burnt out").
- **Travel table** (tools/travel-table.json, `node tools/travel.js --table`, 84 s in 4 processes): every pair of the 17
  places the model sends the crew (`SPOTS` in tools/travel.js), plain / boots / faster airlocks / both, [airlocks open
  towards you, the other way]. balance.js reads it and only walks a trip that's missing (with a warning to add it to
  SPOTS). Rebuild after moving rooms, doors or stations (tests/balancemodel.js re-walks two trips to notice).
- **10 builds** per mission and crew size (`A.RUNS`, `A.CAL_RUNS`; were 8).
- Speed: one mission 9.4 → ~2 s, everything (16 missions × 5 crew sizes × 10 builds) ~56 s. What's left is the energy
  check: the game's power and combat code at 0.1 s steps, three runs per build (~2/3 of the time); a 0.25 s step was
  tried, but it flips some in-spec verdicts.
- Solo idle, hit rate 0.5 (before → after; 2 players in brackets): intro 48 → 42 (72 → 70), rush 76 → 76 (61 → 56),
  pirate cove 47 → 41, c1 49 → 43 (66 → 62), c2 34 → 34, c3 26 → 26, c4 19 → 9 (59 → 55), c5 38 → 36, c6 27 → 26,
  c7 40 → 40, c8 16 → 15 (51 → 45), nightmare 27 → 21 (59 → 48). The 60 % hit rate changes these by 0-1 points
  (aiming is ~6 s of a ~30 s encounter: getting there, the reload and the cleanup are the rest).
- Not retuned (c1 / c2 / c5 are approved as they are): tests/scaling.js fails on the solo targets (pirate cove, deep,
  c4 below 25 %), the 2-4 player targets, and one energy check (Stranded engineer ×3 in the new 10th build). The first
  three failed before this change too.

### Shaped encounter timelines, 5-minute missions, new idle targets (2026-10-18)
- **Missions are 5 minutes again** (`MISSION_LENGTH` 360 → 300). The 2026-10-13 fixed-length change had made them 6 min
  without the user asking; only the boss missions are longer (c5 7 min, c8 ~9:20; c4 already had `length: 300`).
- **Encounters are no longer evenly spaced** (the user: "one encounter _always_ in the first 5-30 s, otherwise there is
  nothing to do; even 2 with 2 people; then a hot time around 3:30 and another encounter on your way out at 4:30"):
  js/mission.js `shapedTimes()`. The first at 15 s (with 2+ crew and 3+ events: two, at 10 and 28 s), the finale at
  90% of the length (4:30; the jump at 5:00 comes while it's on), the rest from an encounter density (the user's
  design): `DENSITY` 0.5 at the start, 1.3 at 7%, 0.5 at 20%, 1.5 at 70% (first hot time, 3:30), 1.7 at 90% (second,
  4:30), 1.0 at the jump. Its integral, scaled to 1, compresses time: events are spaced evenly in that space, jittered
  ±10 s (at most 0.45 of a step: the order stays), and mapped back. Missions with `spacing: 'even'` keep the old even
  layout: c5 and c8 (boss missions: docked / fighting the boss most of the time). A mission's own `finaleLead` still
  pulls the finale earlier (c2: the frigate 70 s before the jump, at 3:50). The reactor still follows the average
  gap (normal difficulty's first-to-last spread). The old 30 s calm start is gone.
- **Idle targets** (tools/balance.js): solo `A.TARGET_IDLE` 0.296 (the model's solo average of chapters 1-5 with fire
  spreading, before this recalibration), 2-8 players `A.TARGET_IDLE_CREW` 0.45 (was 0.68; the user picked "in between"
  rather than solo + 2 points, which would have doubled crews' encounters), no ramp (`A.TARGET_RAMP` 0, was 0.005 per
  step). Chapters 6-8, Ore run, Deep drift and Nightmare keep their own targets until more playtesting: `balance` now
  also pins their old crew aim (`crewIdle` 0.64-0.66); they weren't recalibrated (but they're 5 minutes now too).
- **Recalibrated** (`--calibrate`, the shaped timeline at 5 min): intro, rush, pirate cove, black box, stranded engineer,
  c1-c4 (events / cells / reactor per crew size; the new counts are in the mission definitions with their idle %). c5
  (boss mission) unchanged. Not applied: the calibration's new prerequisite for Stranded engineer (bigger capacitors,
  for ×3's energy), a shop-progression change. Solo where the essentials alone are busier than the target: c4 0% (two
  raiders + opener + failing part + finale in 5 min), c3 15%, c2 20%, c1 22%.
- tools/balance.js: a memory leak fixed (each cached build kept its game sandbox alive through the maintenance event's
  parts and the objective; --calibrate ran out of memory with more encounters).
- tests/scaling.js: the new targets, the shaped layout, c4's raiders (first before 2:00, the last ≥ 70 s before the
  jump: ~78 s solo), c1-c4 solo as essentials-only (must stay doable), rush coarse at 2 encounters, intro / c2 ×4 accepted
  slightly out of energy spec (8-12 s waits). Still failing, on purpose: the missions not retuned (Ore run, c6, c7, Deep
  drift: squeezed by the 5-minute length; c7 solo rated impossible) and c2 ×3 (62% idle: 8 encounters is out of spec).
  tests/jumpfx.js: the stalled-jump case also empties the reactor (the intro's faster solo reactor landed an energy in MID).
- Tests: tests/mission.js (the shaped timeline: first within 5-30 s, two early with 2+ crew, closer together in the hot
  times, jitter keeps the order; difficulty and openers against the new layout; the late-failure test mission keeps
  even spacing and 7 min), tests/sidebar.js (the first contact at 15 s).

### Balance model: fast energy check, saved damage rates (2026-10-18)
- **tools/balance.js is ~45-60× faster, same results.** One mission (5 crew sizes × 10 builds) 6 s → 0.2 s, every
  mission 56 s → 1.3 s, `--calibrate c1` ~6 min (and out of memory in a copy of the old code) → 6 s, all 16 missions
  ~30 s. The full run (16 missions × 1/2/3/4/8 players) and tests/scaling.js give exactly the same output as before.
- **The energy as plain numbers** (`energyFast`, the default): the same run as before, tick for tick (0.1 s) and in the
  same order, but on a handful of numbers from the game's constants (charges, reactor fuel and timer, energies in
  flight, the lever, reserve cells, cannon shots / reloads / cooldowns, shields, scrams, the ion storm's arcs) instead
  of the game's `updatePower` / `updateCombat` / `updateEncounters` / `updateEva`. Timers are tick counts, so only the
  ticks where something happens are run. The old run on the game's code stays as `energySimGame` (`--energy game`);
  tests/balancemodel.js checks both give identical results on real plans and 40 random ones (6000+ runs checked while
  building it, no difference). Found on the way, not changed: the barnacle drains in a plan never reach the energy run
  (`drain` entries have no `count` / `side`), in either version.
- **One sandbox for every build's layout** (was a fresh `loadGame` per build): the missions' crew tables are reset
  between builds; the layout (events, times, jump) is cached per event count, and the cells / reactor tuning /
  overcharge are read from the game's own `missionCrew` / `crewFuel` / `shipStartExtras` / `paceFactor`. Checked
  against a fresh sandbox + full `startMission` (tests/balancemodel.js).
- **Damage rates saved** in tools/damage-rates.json (each enemy kind 60 s in the game, nobody fighting back, 3 seeds);
  `node tools/balance.js --rates` rebuilds it after changing an enemy, a hazard or the hull. A kind missing from it is
  measured with a warning. tests/balancemodel.js re-measures two kinds and flags a stale file.
- `--calibrate` also skips work it never looks at: perfect routing ('best') runs only when a result asks for it, the
  schedules are shared between the fuel counts it tries on one layout, and the second pass is skipped when the first
  had no waits for energy (it would be the same).

### The skirmish builder (2026-10-19, js/progress.js, js/net.js, server.js, index.html)
The user: one Skirmish tab with a builder instead of preset skirmishes.
- The lobby has two tabs, **Campaign | Skirmish**. Campaign lists the chapters (only unlocked ones). Skirmish holds only
  the builder: a slider for how many encounters (1-30), a tick box for every encounter kind (`CUSTOM_KINDS`: all listed
  from the start, no spoiler filtering; no boss / story / objective kinds: leviathan, leviathan_boss, brig, derelict,
  rock), a tick box for every inside ship part that may fail (`CUSTOM_PARTS`, by name), all / none buttons, and a
  **Practice** tick (today's practice mission: no timer, the practice panel). The tab follows the chosen mission, so a
  guest sees the host's tab and settings (greyed out).
- **Every preset skirmish left the menu, Intro run too**: new players start with chapter 1 (the lobby's and the
  server's default is now `c1`). Their MISSIONS ids stay (old saves' `done.*`, `?mission=`, tools/balance.js, tests);
  an older host's preset or a `?mission=` link shows under "Other" in the Campaign tab.
- The run is mission `custom` (`MISSIONS.custom`): round(n/5)..round(n/3) of the n encounters are failing parts
  (maintenance with its target among the ticked parts; the decoy, only shaky, may be any part; with few ticked parts a
  part is reused, preferably with warnings that don't overlap: `customTarget` in js/mission.js), the rest drawn from the
  ticked kinds (at most one gravity tide: one per mission), shuffled, then laid out like every mission (shapedTimes, 5
  minutes). No calibration for custom counts: 2 + ceil(n/2) fuel cells at any crew size (`customCrew`), the reactor at
  the written pace (30 s per encounter). Difficulty still drops encounters. No rules (breaches, surges, ...) switched on.
- **No pay**: creditMission skips it (nothing for `done`, no money, no reputation).
- The settings are this browser's (localStorage `mn-skirmish`, not the profile: no save-format change). The host's
  travel to the server like the difficulty: `open {custom}`, a new lobby message `skirmish {custom}`, `custom` in the
  lobby state, and `netServer.init(..., custom)` → `startMission(id, { custom })`. The sim cleans any config
  (`customConfig`: n 1-30, only known kinds / parts).
- Tests: tests/progress.js (the config, the failure count and parts, no pay, the server's init).

### Everyone earns reputation; a guest's shipyard only looks (2026-10-19, js/progress.js, js/net.js, server.js)
The user: instead of the guests' reputation going to the host, each player gets their own; only the host's upgrades
count, and a guest's shipyard in a LAN game can't buy anything: it shows the host's loadout and unspent reputation.
- creditMission no longer zeroes a guest's reputation (`guestOf` is gone; the end screen says "+$x · +n reputation"
  for everyone). The lobby brief and the host's shipyard note say so.
- `hello` now also sends the player's unspent `rep`; the lobby state carries `hostRep` next to `hostShip`
  (lobbyUI.flight.rep). In a guest's room the SHIPYARD is titled "‹host›'s ship · ★ n unspent", the host's upgrades
  show as INSTALLED, the rest locked ("Only ‹host› can upgrade their ship"); the note names the guest's own reputation.
  From the main menu the shipyard is your own ship as before. No save-format change.

### Repairs on Space / right click; the wrench only when there's nothing to repair (2026-10-20, js/systems.js, js/game.js)
The user: take the wrench throw away and repair with Space / right click instead, so a part's repair spot can be the same
spot as the thing you use there; later: "you can still throw the wrench if there is nothing selected to repair".
- With the repair kit in hand, **hold Space or right click** repairs the broken part in reach (or services a failing one),
  inside and on a spacewalk (the shield emitters). Right click picks the part nearest the mouse, Space the one you face
  (or the one under the mouse); the part you're working on stays picked (`repairPick`, `repairables` in js/systems.js).
- **Click and E no longer repair**: they always do the thing that's there (climb into the cannon at its ladder, press the
  shield button, open the door). The 2026-10-17 workarounds that made E prefer a repair (`repairInReach`, nearbyTarget's
  repair bonus) are gone. Clicking a broken part just tells you how ("hold Space / right click to repair").
- The prompt names both: "Click: climb into the front cannon · hold Space / right click: repair the front cannon (5 s)"
  (multiplayer: the server's hint travels as `prompt.rep`, and the browser's own E prompt keeps it: netLocalPrompt).
- With nothing to repair in reach, Space / right click throws the wrench as before.
- Later the same day (the user: "ALL repair should use right-click/spacebar now"; jobs that don't need the kit stay on click /
  E): every job that needs the repair kit is Space / right click too: splicing an arcing line, resetting a gravity
  breaker, nailing a hull plate down (spacewalk), jamming the pirate reactor, repairing the base's security terminal.
  They're hold targets marked `kitJob` (actionable() leaves them out, so click / E ignore them); `KIT_SPOTS` (filled by
  js/hazards.js and js/dock.js) lists where one may be, repairPick asks clickTarget there. Bare-handed jobs stay on click /
  E: taping a tarp, prying a mine off, cutting tendrils, the sentry gun (the kit only makes those faster), hacking the
  terminal once it's fixed.
- Tutorial: the repair step says hold right click / hold Space. Tests: tests/controls.js (Space repairs from every side,
  E doesn't, the wrench only with nothing in reach), emitter / hazards / mission / systems moved to repairPick.

### Hull seams and the shield emitters as failing parts (2026-10-20, js/hazards.js, js/mission.js, js/sidebar.js)
The user: a hull breach as one of the random ship failures, and the outside shield emitters too.
- **Hull seams** (`HULL_SEAMS`, js/hazards.js): one per room that can breach, at its hole's inside spot. They're not in
  SYSTEMS (nothing breaks, burns or counts them as a broken part); `ALL_PARTS` = SYSTEMS + seams is what js/net.js indexes
  events and repairs by. A failing seam goes yellow / orange at the helm like any part (its row shows where seams can
  fail, or once one has), can be serviced with the repair kit (Space / right click at the spot) while orange, and if not,
  gives way: a normal breach of that room (`failSeam`), BREACHED at the helm.
- **Shield emitters** can now be the failing part too: serviced (or, once broken, fixed) on a spacewalk with the kit.
- Failing seams and emitters get a problem marker (FAILING, with the off-screen arrow): there's no part to recognize there.
- Where: `failPool()` (js/mission.js) = the inside parts as before, plus emitters / seams where the mission allows them
  (`MISSIONS[id].failing: { emitter, seam }`) or in a custom skirmish (the builder's part list now has the emitters and
  seams; maintAllowed narrows to the ticked ones). **No campaign mission or preset uses them yet** (the balance model
  times a failing part as a walk to an inside part, and chapters 1, 2 and 5 are approved): their draws are unchanged.
- Tests: tests/mission.js (seam → breach unless serviced, emitter serviced only on a spacewalk, multiplayer index, the
  other missions untouched).

### The Empty Lab: a dead heart stays dead; cast off once the box is aboard (2026-10-20, js/culture.js, js/dock.js)
The user's playtest of chapter 3: once the heart is frozen it should stay frozen, and with the black box in hand we
should be allowed to detach.
- **S-7 dies with its heart** (`s.dead`, plain synced data): the first time the core freezes, the heart opens for good
  and the whole growth turns to husks (`s.frozen` stays true in every room). Freezer off / out of energy / wrapped /
  broken: only the frost (`s.cold`) fades; no "stirs again", the heart never closes, the creep never regrows, the
  tendrils never grab again. The freezer says it isn't needed any more; the sidebar reads S-7: DEAD. A living culture
  (core never frozen) still thaws and stirs as before.
- **Casting off the derelict** (`derelictAct` / `derelictCastOff`): once the black box is aboard our ship
  (`objectiveAboard('blackbox')`, i.e. the objective is met: on our floor or carried by someone standing in our ship),
  our airlock offers "Click: cast off the derelict", warning "— X is still over there!". It starts the jump's tether
  countdown (RELEASE_TIME s, the same `detachT` / `undock()`): whoever is still over there is cast adrift and spacewalks
  back, as at the jump. A derelict without a black box (the engineer rescue) is unchanged. `undock()` no longer loses
  items lying on our side of the tube's overlap (in one of our rooms).
- Tests: tests/dock.js (dead heart after the thaw, a living culture still stirs, the cast-off prompt only once the box
  is aboard, the countdown, B cast adrift, the rescue derelict).

### Solo: one more encounter in chapters 2, 3 and 4 (2026-10-20, js/progress.js, js/mission.js)
The user's solo playtest: "mission 2 needs one more encounter. Mission 3 as well", and chapter 4 one more easy one,
ideally a failing part. Solo column only; the 2-8 player tables are unchanged.
- **c2 / c3**: `crew.events[0]` 3 → 5. (3 asked already played 4: selectEvents adds an optional fight as the finale when
  the kept fights are all the objective's or the opener; 4 asked would have played the same 4.) Solo now plays
  c2: swarm (opener), the two aliens, **the mine drone**, the failing part, the frigate; c3: mine drone (opener), the lab,
  **the second written mine drone**, the failing part, the asteroid swarm.
- **c4**: a new per-crew-size table `crew.extra` ({ kind: count per crew size }, js/mission.js selectEvents): repeats of
  that kind on top of `crew.events`, the first thing easy / very easy take out. c4 `extra: {maintenance: [1, 0, …]}`:
  solo plays the scout, a raider, a failing part, a raider, **a second failing part**, the swarm (raising the count
  instead would have added the mine drone, next in DROP_ORDER).
- Energy (tools/balance.js, refitted like --calibrate for the solo column only, expected kit): the fewest cells / mildest
  reactor in spec are unchanged (c2 3 cells ×0.3, c3 2 overcharged, c4 5 overcharged). Model idle solo: c2 20% → ~10%,
  c3 15% → ~9%, c4 ~0% → ~-5% (rated impossible by the model: ~6 problems open at once; the playtest says otherwise).
- Open: c3 ×2 (3 asked, 4 played) now has fewer encounters than solo, so tests/scaling.js's "a smaller crew's events
  a subset of a bigger one's" fails for c3; at 5 asked ×2 would be in spec with its 3 cells at ~49% idle.
- Tests (tests/scaling.js): the c2 solo order (+ mines) and its easy / very easy cases (easy drops the mine drone,
  very easy then half a cat of luck), the per-crew count check counts crew.extra, a new c4 solo / easy / ×2 check.

### Captain Red Comet: one door pirate less solo (2026-10-20, js/captain.js)
The user: the pirates bursting out of the blast door during the boss fight could be one less solo. The waves were already
1 solo (whistle at 75 %, the wave at 50 %); what changes is the cap: solo at most 2 door pirates alive at once (was 3), so
phase 2's trickle (one every 30 s) stops at 2 (`captDoorMax`). 2+ players unchanged (waves 2 / 3, at most 3 alive).

### Ore samples: one per player; drops on a spacewalk float (2026-10-20, js/dock.js, js/systems.js)
The user: the number of ore samples should scale with the players (1 solo, 2 for two, …), and they mustn't stack: grabbing
a second sample with one in hand counted the first as aboard. Ore run and chapter 6 now have `objective: { kind: 'ore',
perPlayer: true }` (was count 2 at every crew size): `oreNeeded()` = the crew size (texts / briefing say "one for each of
you"). The drop bug: `grab()` drops what you hold onto the nearest ship floor (dropSpot), so on a spacewalk the first
sample landed inside a room and was stowed; on a spacewalk the dropped item now floats where you are (hz.floating), for
every item. tools/balance.js counts the samples per player too. Tests: tests/dock.js.

### Out cold: the stim pack and first aid count too (2026-10-20, js/systems.js)
The user had a stim pack and still waited 20 s to patch up: that was out cold (hit again while down), whose solo crawl was
a flat SOLO_TREAT 20 s whatever the gear. Now 6 s with a stim pack, 12 s with the first aid course, 20 s without (the
Locker texts say so). Tests: tests/progress.js.

### S-7's creep: one continuous tentacle (2026-10-20, js/culture.js, drawing only)
The user's chapter 3 playtest: "the tentacle growth looks weird." In our airlock room the creep fell apart into separate
little arched worm pieces with gaps and a stepped course: it chained `dock/s7_creep_seg` every 1.0 along a slanted path
using the 8 baked directions, so every tile's angle snapped to 45° (and the diagonal views don't tile), and the tip
(centred on the growth point, another layer) floated up to 0.4 units off the last segment. The lab's floor vines
(S7_VINES, the same tiles at 0.8 spacing) had the same kinks. Now `s7Chain()` draws both: only the seamless east-facing
tile (flipped when heading left), turned on screen (`rot`) to each 1-unit chord's on-screen direction and stretched
(`sx`) to its foreshortened length, along a Catmull-Rom smoothing of the path (`s7Smooth()`); tiles stay fixed while it
grows, a neck tile closes the gap to the tip, which sits on the last unit. The creep starts at the end of the airlock's
floor vine (so it grows out of the growth instead of an open stump) and is drawn in the 'wall' layer throughout.
On starboard its path ran straight through the gym's treadmill: the waypoint between our hatch and the capacitor now
goes round below it (`s7Geom`, starboard only; the in-room path is ~0.4 longer).

### Cannons aimed with the keys, with a laser sight (2026-10-20, js/game.js, js/net.js, js/combat.js)
The user's playtest: "the key-only control of the cannons is not working." Keys only added A/D / left/right turn speed on
top of the mouse aim, and `mouse.moved` (set by every mousemove, never cleared in solo, sticky on the server) re-aimed the
barrel at the resting mouse every tick, so the keys lost; up/down did nothing. Now WASD / the arrows steer the barrel
towards the screen direction you press (`gunKeyTurn()`: at GUN_TURN, the short way inside the arc, stopping at the
arc's edge; straight behind, e.g. down on the front cannon, does nothing) and put the cannon in key mode
(`player.gunKeys`): the mouse is ignored until it really moves again (`mouse.look`, only set by a mousemove event and
cleared each tick; the camera sliding the world point under a resting mouse doesn't count). The gunner's browser runs
the same rule in `netPredict` from its own keys / mousemoves. In key mode the gunner (own view only; not in snapshots)
sees a thin, fading red laser sight from the muzzle along the shell's path (`drawLaserSight()` in drawCombatFront,
hidden while the cover is up). Tutorial / README texts say "arrows or WASD". Tests: tests/gunner.js (solo and server:
all three cannons, no snap back, mouse takes over, arc clamp, Space / R / Shift / E), tests/latency.js (prediction
over a laggy link agrees with the server).

### The Deep: a spore mother more solo (2026-10-20, js/progress.js)
The user: The Deep could use one more encounter (a spore mother). Solo gets `crew.extra: { mother: 1 }` on top of its 5
(spores, the alien, two failing parts, a herd): the mother comes last (the finale fight), the herd moves to ~155 s. The
model still rates c7 solo 'impossible' (~25 problems open at once; it already did, ~21, and the playtest says otherwise);
the solo reactor goes ×0.7 → ×0.5 so the right cannon doesn't wait for energy (cells unchanged). 2+ players unchanged.

### The Mother of All: one encounter less, the mission a minute shorter (2026-10-20, js/progress.js, js/mission.js)
The user: c8 can lose one encounter; the leviathan's fight keeps its ~4 min, so the whole mission gets shorter by that.
Every crew size gets one event less (5 solo / ×2, was 6): the second failing part is written `optional: true` (a new flag:
an event of an `always` kind that may still be dropped, selectEvents), so solo keeps one breakdown (the user's solo
minimum: spores, the mother, the grappler, a breakdown, the leviathan). The leviathan comes at 270 s (was 330), finaleLead
stays 230, length 560 → 500. tests/scaling.js: c8 solo marked PLAYTESTED (the model reads it busier than it likes).

### The leviathan's phase 4 can always be won (2026-10-20, js/leviathan.js, js/game.js, js/interior.js, js/organic.js)
The user's playtest of c8: "there was no menu to charge the engine … it was impossible to complete." Played through in the
sim (tests/leviathan.js `playPhase4`: real WASD / E / clicks from the right cannon) and the browser, the causes were:
1. **The brood outran the reactor.** Waves of 3 crawlers (+1 per player) every 20 s forever, each eating 1 MID energy; the
   reactor makes 1 per ~21 s. Without the laser (a solo player usually carries the repair kit) MID never got past 0–1,
   even with the lever wedged on MID and the reactor fed (checked on the old code: stuck for 800 s).
2. **Nothing said what to do.** The panel had no use ring, and below MID 3 its "needs 3 energy" text only showed on exact
   mouse hover (E's prompt skips what it can't do); "lever on MID" didn't say the lever steps on after every energy.
3. **Classic view drew the vents, panel and crawlers under the floor** (drawLevShip ran before drawFloors).
4. **A hold could be cut short** by a crawler draining MID mid-hold, and **the fuel could run out** for good (the
   override takes 3, the jump 1 more, all through a drained MID).
Fixes: the nest holds `LEVB_BROOD_WAVES` (3) waves, then "the vents go quiet" (the balance model already counted 3);
starting the override hold draws MID's 3 energy into the engine (`B.charged`, synced in org.boss): the brood can't take it
and a broken-off hold is picked up again without recharging; out of fuel everywhere (reactor, crate, a cell lying about or
carried) while MID can't reach what's still needed, the engine's emergency cell drops into the crate (`levEmergencyCell`,
p4 → freed, repeatable, never a softlock). Shown: a HUD line under the banner in phase 4 ("ENGINE OVERRIDE · MID 1/3" +
the next step: lever to MID / hold E to wedge it / load a fuel cell / shoot the brood / hold E at the panel), an info prompt
when standing at the panel (`levAct`), its use ring (`levUseSpots`), the sidebar plate "engine charged"; drawLevShip now
runs after the floors. The override stays on click / E (not a repair-kit job). tools/travel.js exports `route` /
`clearLine` (the test walks with them).

### The leviathan's brood: dog-sized, and gravity boots stomp it (2026-10-20, js/leviathan.js, js/invader.js, js/progress.js)
(Later the same day, the user: no gravity boots needed: anyone standing who walks into a crawler stomps it; the texts say
"shoot or stomp", the boots' Locker text is back to what it was.)
Playtest: "how are you supposed to defeat the brood? They look so small that you could just defeat them by walking over
them." Both answers, to playtest: (1) the crawlers are drawn LEVB_BROOD_SCALE = 2× the modelled larva (~0.55 → ~1.1 long,
dog-sized next to a crew member; the sprite scaled with GFX `scale`, still sharp at 96 ppu; the procedural fallback and the
dead splat the same). What depends on their size follows from it: the bolt hit body LEVB_BROOD_HIT (r 0.34 → 0.5, top 0.3 →
0.34; was BROOD_HIT in invader.js), the bite reach LEVB_BROOD_REACH (0.55 → 0.75), a spacing LEVB_BROOD_GAP 0.9 (new:
pairs pushed apart, a wave is a pack, not a pile), the slime burst (more, bigger drops). Speed (0.9) and bite cooldown (2 s)
stay: the balance model's brood jobs are unchanged. (2) A crew member in gravity boots (perk 'boots', from c.kit: works for
every crew member on the server) who is inside, standing (not down / out) and walking (≥ LEVB_STOMP_SPEED 1 u/s) within the
bite reach squashes a crawler (levStomps, checked before its bite, so also mid-bite): levHurtBrood(w, 1, by): a squelch,
a bigger burst, a flattened splat (dead.stomp), a banner, the stomper's step loses 70 % of its speed (the tiny pause).
Standing still in boots, or no boots: it bites as before. Told: the boots' Locker text ("…and stomp the leviathan's brood"),
the phase-4 HUD line ("shoot the brood — or stomp it in your gravity boots", for whoever has boots) and the wave banner
(", or stomp them in gravity boots" when anyone on board has them). tests/leviathan.js: sizes, a booted walk-in kills, no
boots / down / standing still don't, the HUD line, multiplayer (netServer.addCrew with a booted kit), a bolt 0.4 off centre
hits, the spacing.

### Being hurt is impossible to miss (2026-10-21, js/game.js, js/audio.js)
Playtest: people played an hour without noticing they had "2 hp" (the hurt state was a faint dark tunnel and a small
line of text). Now, all drawn in each browser from the synced crew state (health, armor, position: no extra network
traffic; updateInjuryFx, once a frame from render()): your own screen while hurt gets a red haze at the border beating
with a lub-dub heart (heartPulse; the middle stays clear, weaker as the 30 s run out) and blood splatter in the corners
(SCREEN_SPLATS); down: a dark red tunnel + more splatter; the moment you're hit (your health steps up a rank) a red
flash and a camera jolt (injuryShake, in updateCamera), stronger going down; the armour vest soaking a hit: a small one;
sounds sfx.ouch / sfx.heartbeat (audio.js, through the mute). A badge above the energy panel (drawInjuryBadge,
injuryStatus): HURT / DOWN / OUT COLD, "one more hit and you're down", heals in N s, what helps (snack machine or when
the next snack is, a crewmate patching you up, coffee alone), how to get up. In the world for everyone: a hurt crew member
drips blood as they walk (BLOOD_STEP 0.38 tiles a drop, interpolated on slow frames, one every 2.2 s standing still; a
splash on the hit), drops fade after BLOOD_LIFE 14 s, at most BLOOD_MAX 140; the downed lie in a growing pool (fades 25 s
after they get up); on a spacewalk droplets drift off instead; a hurt crewmate's name tag gets a beating red cross. Blood
is drawn after the floor decor (classic: over the floors; sprites: the lit 'mid' layer, under walls and crew). No limp
(the sprite's walk cycle is left alone). tests/injuryfx.js.

### Inner doors: single doors that open in front of you (2026-10-21)
The user: "the inner doors all are single doors, not airlocks, but only open once you're in front of them (unless they're
locked or there is a pressure difference between the rooms, in which case one needs to use the manual override). If doors
are closed alien intruders cannot open them at all, but pirates still can (very slowly). Take away a little from the inner
wall so it doesn't look weird." (The outer airlocks became double-door chambers in the same change, by another agent:
js/airlock.js.)
- **The doors** (js/ship.js): DOORS = the four DOORWAYS (`axis: 'x'`) + three DECK_DOORS (`axis: 'y'`, replacing DECK_LOCKS:
  one per zone column at the same x, a passage through the whole spine). Each is its passage rect + open 0..1, locked, blast
  (pressure difference, set every tick), hold (s held open after a forced override), jammed (a broken deck door forced
  open), pry (pirates forcing it). Walkable while open > DOOR_WALK 0.6. doorRooms / nearDoor / doorName helpers.
- **Behaviour** (js/game.js updateDoors): CLOSED by default; opens (DOOR_TIME 0.3 s) while a standing crew member or a friendly
  NPC (Dr. Varga aboard our ship) is within DOOR_SENSE 1 unit of the passage (either side, not off to the side), shuts
  DOOR_LINGER 1 s after nobody is; never on anyone in the doorway (crew, downed crew, intruders, pirates, NPCs). No
  auto-open when locked (security / AI glitch), broken (deck doors; stuck shut) or with a pressure difference. Then the
  prompt in front of it says why and offers the manual override (doorAct: "Middle deck door: locked. Click / E: manual
  override"); forceDoor: unlocks; a broken deck door is jammed open until repaired; a pressure door is held open DOOR_HOLD
  5 s ("— vents the bridge!" in the prompt, a banner when it gives). Doors into the reactor room with a pressure difference
  can't be forced from either side (the cat).
- **Vacuum spreads through open doors** (js/hazards.js): sealedVacuum (breach / vent) + vacuumRoom = any room joined to a
  sealed-vacuum room by doors open > 0.1. So a forced pressure door vents the room behind it until it shuts again; then
  that room has air at once. Both sides in vacuum = no pressure difference = a normal door. updateBlastDoors is gone (blast
  is set in updateDoors).
- **Intruders can't open doors** (js/invader.js): NAV door nodes (n.door) pass only while that door is open (navPath's ok,
  alienDoorOk). Shut out, the alien waits 1.4 out from the door towards its prey, facing it (a.waitDoor: a DOORS index, the
  sync sends invaders as plain data), and goes the moment it opens; with nobody aboard it prowls into rooms behind open
  doors, else about its own room (roomWanderSpot); a zoned pod alien off its deck waits by the deck door up. No more door
  bashing (bashDoor / blockingDoor / lockAround gone). Also: nearestNav prefers nodes in the point's own room (routes to a
  spot by a door no longer lead through that door first), nearestNavSeen, and alienMove edges sideways round solids (the
  reactor) instead of jittering; legs / walkTo give up after 8-10 s. The saboteur (a human sneak in a suit) still slips
  through shut doors unless they're locked or a blast door (roomLinkOpen).
- **Pirates force doors** (js/game.js pryDoor, from js/dock.js pirateStep, so every pirate: looters, base rushers, the
  captain's raiders): up against a shut door they stand at it DOOR_PRY_TIME 3 s (locked or broken: DOOR_PRY_LOCKED 8 s;
  several together faster), with clanks and sparks, a banner, the tag "PIRATE · FORCING THE DOOR" and the aim pose, and an
  orange progress ring on the door (drawDoorPry, both views). Then the lock is broken / a broken one jammed / an ordinary one
  held open 2 s. A door with vacuum behind it they leave alone (they wait). The fuel crate's loot spot moved to x + 0.95
  (x + 0.8 was inside the crate's footprint: reachable only from the side).
- **The spine** got 1 unit thinner: SPINE_Y1 15 → 14 (2.5 thick; the bottom rooms gain a unit at their top). Moved with
  it: the reactor capacitor (14.65), the cat (14.75), the toilet stall / toilet / plunger / magazine / WC stencil, the
  dumbbell rack, the power lines' points by that wall and the risers (POWER_ROUTES), wall beacons (lights.js), the steam
  puff; shield buttons, wall lamps and the toilet sign follow SPINE_Y1.
- **Removed**: the deck-airlock cycle (phases, CYCLE button, entry/target, forceDeckLock, updateDoorways, LOCK_DOOR_TIME).
  LOCK_CYCLE stays as a variable the 'airlocks' ship upgrade sets (now the outer airlocks'). SYSTEMS keep kind 'lock'
  ("Left / Middle / Right deck door"). Security console: ↕ marks the deck doors. Tutorial, sidebar ("waiting at a shut
  door"), HUD ("Deck door" / "Doorway" as the place name), practice ("Lock every inner door"), multiplayer (doors: one
  array for all seven doors: open, locked, blast, hold, jammed, pry, stay).
- **Art**: tools/blender/models/interior/deckdoor.py (new; decklock.py deleted): interior/deckdoor_closed / open / locked /
  blast_f0..3 / broken_f0..1 (the passage floor, spine ends, lintel, lamps, beacons, light strips) and deckdoor_door_f0..5 /
  _locked / _blast / _forced (one sliding double-leaf door across the middle of the spine's high block). structure.py: the
  spine re-rendered 2.5 deep (its conduits, clamps, plates and the DECK 2 stencil moved into the narrower top; PIPES shared
  with deckdoor.py). Classic view: drawDeckDoor (js/art.js), drawSpine's pipes closer together. hulllib.py's SPINE_Y1 too
  (no hull re-render needed: the outline didn't change).
- **Balance**: trips got shorter (no cycle wait, a thinner spine): tools/travel-table.json rebuilt, on average 1.6 s
  shorter than the old best/worst mean (best = worst now; the table keeps both). The saboteur's crew work time
  SAB_WORK_TEAM 2 → 1.8 s (the quickest room-to-room trip is 3.2 s now, was 3.7). tests/scaling.js: idle shares rose
  (solo -7.5 → -1.6 points off target on average; crews mostly 5-10 points over 45 %): to retune.
- Tests: tests/doors.js (new: auto-open / linger / never on someone / locked / broken / pressure + venting + the cat /
  aliens wait and come through when you open it, prowl through open doors only / pirates force closed and locked doors,
  leave vacuum doors alone / the saboteur / multiplayer sync); softlock, controls, mission, hazards, intruder (room-to-room
  hunting with the doors held open; the pod aliens with shut doors), systems, saboteur, clutter, walkfield, pinpad,
  leviathan updated.

## Outer airlocks: real airlocks with two doors (2026-10-21)
The user: "for the outer airlocks we actually want the double doors" (while the inner deck airlocks became single doors).
- **The chamber** (js/ship.js HATCHES, OL_BLOCK; logic js/airlock.js): in each bottom side room, a 2.2 x 2.2 chamber against
  the hull wall, centred on the old hatch (port y 19.2, star y 19.4), walled off with 0.6 walls like every wall (the room's
  floor goes round it: the room is three rects now, outerLockCarve, the big piece first). INNER door: in the chamber's
  room-side wall (a doorway's sliding door, 2.2 long); OUTER door: the old hatch in the hull wall (1.8). Only one is ever
  open; the chamber is pressurized or pumped out (h.air). No scripted 'hatch' mode any more: you walk through.
- **Use** (all automatic, like the old deck airlocks): walk up to the inner door, it opens; step in, it shuts behind you, the
  pump runs (LOCK_CYCLE 1.3 s; 0.7 s with the 'airlocks' upgrade, "Faster airlock pumps": same id, now about these), the outer
  door opens as the pump finishes; step past the hull's face onto the doorstep = spacewalk (airlockThreshold). Back: float up
  to the hatch, an empty chamber cycles to you, push in. In the chamber E / click cycles it by hand (turning back). Visor down
  in a pumped-out chamber. Timing (tests/airlock.js, real WASD): in front of the inner door → on the hull 2.3 s (1.7 s with
  the upgrade), just off the hatch → in front of the inner door 2.6 s; the old scripted hatch was 1.6 s + the walk to it.
- **Docked ships**: their tube ends at our hull (was: 0.7 into the room). Pirate ship / pirate base / the chapter-5 raider:
  air on both sides, a plain passage (each door opens for whoever comes, no pumping; it works even broken or locked, like the
  old hatch stood open while docked). Pirates and Dr. Varga route through it (airlockWay). The derelict's tube is airless:
  the chamber cycles, its outer door opens into the tube. Cast off with the outer door open: it shuts.
- **Broken / locked / venting**: broken: doors stay as they are; locked: both shut; the manual override (from the room, the
  chamber or outside) vents the airlock room: both doors stand open during any vent (also the vent panel's), then both shut
  and the chamber has air again. Vented hostiles are dragged to the inner door, then through the chamber out of the hatch;
  crew in the chamber get hurt like those in the room. Items sucked to a breach go round the chamber (suckVia).
- **Intruders** come in through the chamber (outer door, pump, inner door: INTRUDER_ENTER_TIME 2.4 s, enterHatch) and never
  step into a chamber afterwards (alienStep). The saboteur the same way.
- **Moved**: the vent panels (above the chamber, on the hull wall), the cannon power lines (round the chamber, up the room
  side of its wall), the dumbbell rack (x 41.5 → 40.25: clear of the chamber block), the airlock part's spot (at the inner
  door), the derelict / base detach prompts (at the inner door).
- **Art**: tools/blender/models/interior/outerlock.py: interior/outerlock_<side>_floor_* (grated floor plate, hazard
  thresholds, light strips: air green / pumped out red / pumping amber pulse / doors moving amber blink / locked / broken
  flicker) and _panel_* (the control box on the inner door's jamb: status dome, CYCLE button, pressure gauge; + venting).
  The inner door reuses interior/door_v_*, the outer one interior/hatch_<side>_*, the walls the wall kit (buildWalls: the
  chamber's north and south walls are low near walls so you see in). Lighting: the chamber glows in its state's colour, a
  lamp in each corner beside it (airlockLighting). Classic view: drawAirlock2D (dashed chamber, two sliding doors, lamp,
  pump ring).
- **Multiplayer**: the snapshot carries each airlock's doors, air, phase, pump time, target, lock, forced; mode changes at
  the threshold happen on the server only (a client waits for it).
- **Balance**: tools/balance.js counts airlockPass() per pass (door + pump + the walk through) instead of HATCH_TIME: twice per
  spacewalk and per derelict visit.
- Tests: tests/airlock.js (new: out and back through real inputs per side, only one door at a time, the upgrade, the pass
  time vs a real walk, the manual cycle, a docked pirate ship, the derelict, broken + override, locked, the vent, intruders,
  multiplayer); hazards, controls, interact, softlock, clutter, dock updated.

### Doors open for anyone; only a locked one needs a human (2026-10-21, js/game.js, js/invader.js)
The user corrected the revamp: every door opens for anyone by default, aliens and pirates included; only a locked one
(security console, or a pressure loss on either side) stays shut, and only humans can override that: the crew (manual
override), pirates (they force it, DOOR_PRY_LOCKED 8 s); aliens wait at it. doorFriends now includes intruders and
pirates inside; alienDoorOk passes any door that isn't stuck; pryDoor only for stuck doors (DOOR_PRY_TIME gone).
tests/doors.js rewritten for the rule.

### Doors: a noticeable delay (2026-10-22, js/game.js)
The user: an unlocked door should still open with a delay the player notices (it opened in ~0.2 s: you walked straight
through). Now a door reacts DOOR_DELAY 0.4 s after someone steps up (a hiss for the crew member who did: sfxFor) and slides
open in DOOR_TIME 0.6 s (was 0.3): ~0.75 s until you can pass. An already open door stays open for whoever follows (no new
delay). tools/travel-table.json rebuilt; tests updated to the timing (tests/doors.js checks the delay).

### Leeches drink energy instead of chewing parts (2026-10-22, js/organic.js)
The user: "The leeches will not damage the ship but steal energy … one of those energy balls gradually travelling to the
hull and then towards a leech. The speed is proportional to the amount of leeches. Then after they consumed one they go
after the next and so forth." Latched leeches never break a part now (LEECH_CHEW gone). They drink the capacitor on their
side (SIDE_CAP: left → LEFT, right → RIGHT, front → MID) one energy at a time: updateLeechSuck keeps one ball per side in
org.suck (plain data: side, the leech it's for, its spot, k 0..1, back). The capacitor gives the energy up as the ball sets
off (its pips drop at once, like any use); the ball creeps along the cannon cable's first stretch (LINE.gun_<side>.runs[0],
to where it climbs into the spine), out through the hull wall, along the outside of the hull to the leech's height and on
to the leech, at n / LEECH_SUCK_ONE of the way per s with n latched on that side (LEECH_SUCK_ONE 24 s × the reactor's
pace: one leech eats a bit less than the whole reactor makes, more than its side gets with the lever stepping round; six:
a unit every 4 s, a full capacitor in 12 s). On arrival the leech swells (l.fed, a golden ring pulse; drank counts) and the
next ball sets off for the next leech in turn (by uid, round robin). Empty: they wait and take the reactor's next energy as
it lands. Broken or S-7-wrapped capacitor: they can't get at it, they wait. Its leech shot / pried off: the ball heads for
another one on that side; none left: it rolls back (LEECH_BACK 1.2 s) and the energy goes back into the capacitor (killing
them fast pays). Drawn like the power-line pulses (the same orb, a short trail): inside in the glow layer clipped to the
floors, outside on top of the leech sprites (drawLeechSuck 'inside' / 'outside'; classic: all at once); a golden progress
ring on the leech it's for (drawLeechDrink, was drawLeechChew). HUD: the capacitor's label throbs leech-red while they
drink (leechCapSucked); sidebar "N latched, sucking the right capacitor"; banner "they suck our energy!". Everywhere
leeches come from follows the rule (the event, herds, practice, chapter 8's phase-3 swarm: its banner now says they'll drink
that cannon's capacitor dry). Removing them is unchanged (shoot on the way in, pry off outside).
- **Balance**: tools/balance.js models the drain: the pry job carries `suck` (A.LEECH_LATCHED 3 leeches on that side from
  LEECH_LATCH until pried off) into plan.sucks; energySimGame runs the game's own leeches (updateOrganic), energyFast the
  same ball tick for tick (tests/balancemodel.js compares them, random plans now include leeches). tools/damage-rates.json
  rebuilt (leeches: no parts broken). Only chapter 7 solo moves (it was 'impossible' on ~16 parts chewed open at once; now
  'tight', 82, idle 0 → -10 %, the right cannon starved: never served); c6, c8, Deep drift, Nightmare unchanged (their
  leeches are shot before they latch in the model).
- Tests: tests/organic.js (no parts broken; one unit per LEECH_SUCK_ONE / n s; the ball travels and arrives; the next one;
  three leeches in turn; empty → waits, takes the reactor's next energy; a lone leech; the card; multiplayer sync; prying
  the last one off returns the ball's energy; broken capacitor; shields; a shell; a herd), tests/leviathan.js (phase 3's
  swarm drinks that side's capacitor).

### Spores get inside the ship (2026-10-22, js/spores.js)
The user: mines, spores and leeches should feel different; mines stay the hull spacewalk job, leeches drink energy, and
SPORES MOVE INSIDE. The hull barnacles are gone (evs.barnacles, BARNACLE_*, SCRAPE_TIME, the scrape job, the drain).
- **Getting in.** A spore cloud (event 'spores', js/eva.js spawnSpores: three clumps, the ids unchanged) now heads for the
  outer airlock on its side (from the front: one of the two), sits at the hatch's seals for SPORE_SEEP 2.5 s (shrinking,
  wisps sucked in) and seeps in: that airlock room is infested (~10-14 s after the banner "it's heading for the airlock!
  Shoot it down"; radar label "Spore cloud — left airlock"; cannon shells still pop clumps on the way). The spore mother
  (js/organic.js) no longer flicks spore pods (they got in the way of the shots): every PUFF_EVERY s one mouth opens in a
  SILENT SCREAM for SAC_OPEN s (its tongue rises in it: the weak spot), and a green cloud billows out of it and hangs round
  the hull (evs.cloud: k density, hold CLOUD_HOLD 14 s after each scream so it lasts the fight, then CLOUD_FADE 4 s).
  Each scream has MOTHER_GUSTS 2 gusts, each with MOTHER_SEEP_CHANCE 15 % of getting into the airlock on her side (~28 %
  per scream; a ~45 s fight ≈ one infestation, like the old one barnacle per pod). Opening ANY outer airlock to space while
  the cloud is there (cycling out or in, a forced airlock, the vent panel; not a docked ship's tube) infests that airlock's
  room for sure. Banner "Spore cloud around the hull — don't use the airlocks!", a SPORES OUTSIDE card ("keep the airlocks shut till the cloud clears"), "SPORES
  OUTSIDE" over both airlocks' control panels and a warning on the airlock prompts; "thinned out — safe again" after.
- **The scream (drawing).** motherScream(e, i): the mouth opens wide in 0.35 s (lips peeled back, gum line, the throat
  pit visible), holds trembling, closes over the last 0.6 s; the blue tongue rises out of the throat and quivers (still
  the weak spot, pois tongue0..2 unchanged), a faint green haze breathes out (motherHaze). Sprites: mother.py's new g4
  mouth patches (scream) and tongue poses r1..r3 (the old straight tongue is gone), the whole organic group re-rendered
  (the veins moved back off the mouths) and re-packed; classic: drawMother / drawTongue redrawn. No spore pods.
- **Spreading.** A door between an infested and a clean room standing passable for SPORE_SPREAD 1.5 s (anyone walking
  through: it opens after 0.75 s and lingers 1 s) lets them over (puffs drift through the doorway). Never into the reactor
  room: they shrivel at its doors (browning puffs, embers). Nothing crosses into or out of a room in vacuum.
- **Effects.** Every SPORE_GLITCH_EVERY 12 s (×0.7-1.3, the first sooner) one part in an infested room glitches for
  SPORE_GLITCH_TIME 4 s (sporeGlitching): a shield button doesn't press, a capacitor gives no energy (useEnergy), a
  cannon doesn't fire, a deck door sticks where it is, an outer airlock's doors stay as they are. Spore fuzz on the part
  with "SPORES · n s", a banner and the prompt say why. After SPORE_BREAK_FIRST 60 s one part in the room breaks for good
  (breakSystem), then one every SPORE_BREAK_EVERY 30 s. (An outer airlock belongs to its airlock room; a deck door to both
  rooms it joins; outside parts never.)
- **Cure: vacuum.** SPORE_CLEAR 2 s of vacuum and the room is clean ("aired out"). The vent panel by each outer airlock
  now works ANY time (it lights up for a fire or spores: ventWanted), PIN pad as before; venting still hurts others
  inside, blows boarders out, puts out fires. Not while spores are outside (evs.cloud or a cloud drifting in; the user:
  "airing out only works if there is not a spore cloud outside"): the vent still vents (the panel isn't smart: no
  warning, the user's "allow mistakes"), the spores live on ("…but the spore cloud outside blew right back in!"); the
  card says "spores survive venting while the cloud is outside". Rooms further in: force the door from the vented room
  (the existing override across a pressure difference). **Fix to make every room clearable solo:** with the vent panel's
  vent running, a forced door is held open as long as the vent runs, and forcing one keeps the vent open at least
  VENT_TIME more (js/game.js forceDoor; "a whole room more to pump out"). Before, the deck door's 5 s hold ran out before a
  lone crew member could cross the cannon room and force the bridge door (t ≈ 10 s vs the hold ending at 9 s), so the
  bridge needed two people. Paths (tests/spores.js walks each one at vacuum speed with real overrides): airlock rooms:
  their panel; cannon rooms: vent the airlock room below, force the deck door up; bridge: then force the cannon room's door
  to the bridge (from either side). The reactor room is never infested and never vented (doors into it can't be forced
  across a pressure difference: the cat).
- **Sync / drawing.** hz.spores (rooms, glitch, doors, shrivel) and evs.cloud are plain data in the snapshot. Procedural
  in both views (drawSporesInside after the vacuum tint: a green-grey tint, drifting clumps filling in from where they came
  in, motes; puffs through doors; shrivelling at the reactor's; fuzz on glitching parts; drawSporeCloud: the cloud round
  the hull, the billow from the screaming mouth, gusts at the airlock). Sidebar: "SPORES — Left airlock · vent it:
  airlock panel, PIN on sticky note" (or how to reach it), problem markers per room. Practice: "Spore clouds → the
  right airlock", "Spores inside: …", "Spore cloud round the hull". Skirmish kind label "Spore clouds (get inside)".
  Chapter 6 and 8 briefings rewritten. Event kinds and ids unchanged (saves untouched).
- **Balance model** (tools/balance.js): the spore-cloud job is unchanged (shoot them), late → `sporeVent` (walk to the
  outer airlock's panel, A.PIN_TIME 6 s, SPORE_CLEAR, A.SPORE_GLITCH_COST 3 s; past A.SPORE_SPREAD_AT 25 s also a
  "force the deck door" job; past SPORE_BREAK_FIRST broken parts). The mother: no spore-pod shots any more; the chance her
  screams infested the room over the fight (≥ 50 %: a vent job once her cloud is gone, aged from her expected first lucky
  scream). Barnacle drains removed from both energy runs. tools/damage-rates.json rebuilt (spores/mother: first.infest
  13.7 s / 32.3 s instead of first.barnacle). Moves: c6 solo score 51 → 39 (idle 28 → 32 %), ×3 41 → 32; c7 solo
  impossible 114 → tight* 83 (idle 0 → -12 %, 16 → 2 open); c8 solo 74 → 89 (idle 12 → -3 %: the mother's infestation
  waits for her cloud, a part breaks; tests/scaling.js's c8 fixed-minimum check now fails on idle > 0), c8 ×2-8 roughly
  ±3; Deep drift / Nightmare ×3-8 slightly easier (no pods to shoot). Not retuned (the user: leave balance for now).
- Tests: tests/spores.js (new), tests/eva.js / interact.js (barnacle hold tests → a limpet mine), threats.js (clouds
  popped before they reach the airlock), organic.js (the scream: a cloud, no pods), hazards.js (the panel works without
  a fire).

## Inner doors read as airtight bulkheads (2026-10-22)

The user: "The walls still aren't the same height as the new doors, making them look like salon doors. The doors
should be airtight, so this should visually be clear."
- Cause: the doorway / airlock-inner leaves (doors.py, interior/door_v_*) were 0.3 thick and 1.5 tall in a 0.6 x 1.6
  wall, so you saw the floor beside them and their tops sat below the wall caps; the deck door (deckdoor.py) stood in
  the middle of an open-topped slot through the spine, 1.48 tall under a thin lintel, its face hanging between the
  spine top and the wall face: a low door in a gap.
- Doorways, the airlocks' inner doors and the outer hatches (interior/door_v_*, hatch_*): the leaves are as thick as the
  wall (rubber gaskets down both sides) and as tall (tops flush with the wall caps), with bolted pressure rims, a rubber
  seal on the meeting edge (a striped edge plate on it), all states (locked / blast / forced / broken); the north
  collar's pocket shows the retracted leaf's sealed edge; collars a bit wider (lamp and keypad beside the pocket, where
  a shut leaf doesn't hide them), gaskets along their tops.
- Deck doors: the door moved into the spine's front face (the bottom deck's back wall, local y -0.22) under a heavy
  bolted header flush with the spine top; the leaves run up into the header; gasket channels at the jambs and under the
  header; the passage through the spine's high block is roofed over (spine top plates, the conduits run straight on),
  so the spine reads as one sealed wall with a door in it (crew in the roofed part are hidden, like behind any back
  wall). Top lamp on the roof's back edge. js/sprites.js: the door's sortY follows it (SPINE_Y1 - 0.22).
- Classic view: drawSealedDoor (js/art.js) for doorways, deck doors (also moved to the front face) and both airlock
  doors: wall-wide leaves, gaskets, bolts, frame blocks at the ends.
- Re-rendered doors.py and deckdoor.py, re-packed interior (sprites.json: 1189 entries before and after, 229 interior).
- Follow-up (the user: no roof, it makes the passage unreadable; "the ship also has a roof: cut it just below the door's
  roof"): the deck door's passage is open from above again (the cutaway view; crew in it stay visible all the way
  through; the spine conduits end in elbows at the passage again, hazard rims on the cut). No header or roof: the
  door stays in the spine's front face, its leaves go up to the wall top and are cut off there like the walls (a dark
  cut section with the skins and the rubber core, flush with the spine top). The rest of the ship's walls are unchanged.
  Re-rendered deckdoor.py, re-packed interior (sprites.json still 1189 entries).

### Deck doors as thick as the wall; the spine thinner (2026-10-23, js/ship.js, deckdoor.py, structure.py)
The user: "The door needs to be as thick as the wall too. Make the wall thinner and the door thicker." SPINE_Y1 14 → 13.3
(SPINE_Y0 11.5 and the top deck stay). What you see of the spine is its tall block (SPINE_HI 12.549 .. SPINE_Y1): now
0.75 deep (was 1.45); the 1.05 low lip in front of it (11.5 .. 12.549) stays, because it is what keeps the top deck's
south strip as visible as behind any near wall (a tall block reaching to 11.5 would hide the kitchen counter and crew
standing there) and it never shows (the tall top hides it). The deck door's leaves fill the tall block face to face
(DOOR_T 0.73, centred at SPINE_HI..SPINE_Y1; they were 0.26 thick in the front face): the door is the wall where it stands,
its top still the cut section (skins, rubber core, two stiffener webs), no roof. The spine's top: two conduits at the
back (teal, grey) with clamps, the DECK 2 stencil's strip, a thin copper line on the front edge (the vent grilles and
access plates had no room); the deck door's spine ends bring the conduits down further out (x ∓0.5), smaller beacons.
Everything on that wall now hangs off SPINE_Y1 (moved 0.7 up with it): the reactor capacitor (SPINE_Y1 + 0.65), the cat
(+0.75), the toilet stall / toilet / plunger / magazine / WC stencil, the dumbbell rack, the power lines' points and
plugs by that wall (POWER_ROUTES); shield buttons, wall lamps, beacons, the deck doors' NAV approaches and walk-field
spots already did. Classic view: drawDeckDoor's door fills SPINE_HI..SPINE_Y1, drawSpine's pipes closer. hulllib.py,
mock_bridge.py follow. Re-rendered structure.py (spine_a/b/label) and deckdoor.py, interior group packed (1189 sprites,
229 interior). tools/travel-table.json rebuilt (trips change by -0.29 .. +0.17 s, mean -0.03 s). tests/spores.js: its
stand spots in front of the deck doors follow (y 14.7 → 14.0).

### Outer airlocks: a sealed module half out of the hull (2026-10-23)
The user: "The airlock still looks like it is maybe missing some walls? An airlock needs to be able to lock in some air. …
Maybe make it half protruding to the outside." (The sprite view showed the chamber's north side as a black hole and a low
south wall: an open pit.)
- **Geometry** (js/ship.js OL_BLOCK / OL_MID / HATCHES): the 2.2 x 2.2 chamber is centred on the hull's side wall (x 0.3 /
  44.1), with 0.6 walls on ALL FOUR sides: the module is 3.4 x 3.4, half in the airlock room, half outside as a pod.
  Port: chamber x -0.8..1.4, inner door 1.4..2.0, outer door (hatch) -1.4..-0.8, h.x = -1.4 (the module's outer face);
  star: chamber 43.0..45.2, inner 42.4..43.0, hatch 45.2..45.8, h.x = 45.8. The room gets back 1.4 units (its floor goes
  round the module's inner half: a corner above and below it, 1.4 wide). Everything relative to h.x is unchanged, so
  js/airlock.js works as before (depths, doors, the doorstep, EVA in / out).
- **HULL**: the 0.45 doorsteps became pods round the modules (flush with their walls, chamfered corners, a 0.45 doorstep
  in front of the hatch): port x to -1.85 (y 17.2..21.2), star to 46.25 (y 17.4..21.4). Hull art re-rendered:
  models/hull/hulllib.py (HULL, OL_BLOCK, HATCHES at the module's outer face), body.py (greebles kept off the pods and the
  module walls), fixtures.py (hull/hatch_* at the new hatch), emitter.py (its hull holdout); hull group re-packed
  (sprites.json 1189 entries before and after, 85 hull).
- **Walls** (js/sprites.js buildWalls): the module is walled like a room of its own: a full-height back (north) wall from the
  hatch's wall to the inner door, a low near (south) wall (the cutaway rule: you see in), the end walls with the doors
  (inner: the doorways' bulkhead door interior/door_v_*; outer: the hatch interior/hatch_<side>_*, both wall-thick and
  full height). The room's walls stop at the module (the corner pieces' near / back walls and the hull wall's runs don't
  reach into it); the hull wall south of a module is low all along (it would stand full height right in front of the
  chamber). Classic view: the module's walls are hull like every wall (the pod is in HULL), the doors drawSealedDoor.
- **Docked ships** sit off the new hatch: js/ship.js dockX / dockR (port layout, x relative to our hatch, mirrored for
  starboard) replace the absolute `port ? x : SHIP_W - x` in js/dock.js (dockGeom, baseGeom, decor), js/captain.js and
  js/culture.js: the docked ship, the base, the tube and everything aboard moved 1.4 out with the hatch (sprites already
  drew at h.x).
- **Moved**: the airlock rooms' breach spots below the pods (y 21.3 → 21.9, both sides; their seams too), the EVA floor
  stencils to in front of the inner doors, the corner lamps beside the module.
- Timing unchanged: in front of the inner door → on the hull 2.27 s, just off the hatch → in front of the inner door 2.63 s
  (1.7 s out with the 'airlocks' upgrade).
- tools/damage-rates.json rebuilt (shots hit the pods: first small hit 3.55 → 3.49 s; spores reach the hatch sooner:
  13.7 → 12.8 s; intruder / saboteur numbers shift a little); tools/travel-table.json rebuilt (no trip changed).
- Tests: tests/eva.js (evaOk's spot just off the hatch). All suites pass; tests/scaling.js has its 6 known balance lines.

### Docked ships have a way in from space: no spacewalker is ever stranded (2026-10-23, js/dockentry.js)
A docked ship's tube covers our pod's hatch, so a spacewalker couldn't come back in at that airlock; with both taken
(chapter 5: the base and the raider) they were stranded. The user: "Maybe make an airlock on most ships that dock? … Or
some other way to enter through that ship so you can't get deadlocked if both airlocks are occupied." and "I.e. hit the
windshield or something to get into the other ship." Every ship that docks now has a way in, forced from a spacewalk
with the manual override (three good whacks / heaves, E or click), the kind that fits it:
- **The Red Comet raider** (docked pirates, the brig barge, chapter 5's raider at our other airlock): SMASH ITS CANOPY
  (the glass cockpit on its beak beside the tube). It stays smashed: the raider vents (dockVacuum; its crew aboard take a
  hit and are stunned), the tube is airless, so our pod cycles like to space (airlockTube 'vacuum'; pirates still use
  it). In through the cockpit (crawling under the beak's roof: you're hidden for a moment) and down into the tube.
- **The derelict lab** (airless and dead already): PRY ITS CRACKED VIEWPORT, in the hull's roof over its airlock room.
  Stays open, nothing to vent.
- **The pirate base**: CRANK ITS SERVICE HATCH, in the docking bay's low south wall: a cramped hand-cranked lock, so the
  bay keeps its air; open ENTRY_HATCH_OPEN 4 s (held while someone's in it), then it shuts. From inside the bay the same
  crank lets you out.
- Mechanics: DOCK_ENTRY_SPEC (port layout, relative to the hatch: js/ship.js dockX / dockR); state in dk.dock / dk.raid
  (entry, entryT: plain data, in the snapshot). In / out at the opening like at our hatch (dockEntryThreshold: push in on a
  spacewalk, step out past its face). The opening is walkable while open (walkRects). Cast-off / detach with someone in it:
  cast adrift (undock: inDock includes it; the raid's leaving: updateRaid). Spacewalk reach counts a docked ship as hull
  (evaReach: dockReachPolys), so you can float round it to its way in; you can't float through the raider at our other
  airlock (dockBlocksEva). The tube itself is no way in from space.
- Prompts: at a blocked pod "A ship is docked here — get in through the raider's canopy (or the other airlock)"; at the
  entry the override prompt (what it does); a WAY IN problem marker on each entry while you're out and an airlock is taken;
  a job marker ring on it.
- Art: tools/blender/models/dock/entries.py (new): dock/canopy_smashed_<side>, dock/viewport_<side>_shut / _open,
  base/service_hatch_<side>_shut / _open (drawn over the ship at our hatch like it); classic: drawDockEntries draws the
  canopy (glass / smashed), the viewport, the hatch. dock + base groups packed (sprites.json 1189 → 1199).
- Tests: tests/dockentry.js (new): the deadlock matrix (nothing docked; pirate / brig / derelict / base at either airlock;
  chapter 5's base + raider both ways round) × (from just outside each pod, from off the bow): planned floating with WASD,
  E for the override, on foot through the ship into our room, all 33 pass. Plus: the tube is no way in, the hint, venting,
  the base hatch shutting, cast adrift from the cockpit, the snapshot. Travel table / damage rates: unchanged (no room,
  door, hull or hazard moved).

#### Polish: docked-ship entries (2026-10-23)
- Art (tools/blender/models/dock/entries.py, re-rendered, dock + base packed: sprites.json 1199 → 1207): the derelict's
  viewport is an old science vessel's (rounded off-white frame, teal band, bolts, VIEW 2): crazed glass (spokes and rings
  of cracks from an impact, frost spots), pried open: glass teeth left in the frame, the outer edge bent up in bare
  steel, the pry bar lying across it, ice bits; the smashed canopy got the raider's gold trim; the base's service hatch
  is a heavy bolted lid with a spoked crank wheel (and a smaller one on the bay side), base/service_hatch_<side>_crank_f0..3
  turning while someone heaves at it (e.ref.crankT, in the snapshot). Classic view: the same (frame, crazed / pried
  glass, the wheel turning).
- Never hidden: a crew member at, in or right outside an entry is drawn in front of the ship (dockEntryReveal → a depth
  bias in drawCrewSprite): the spacewalker smashing the canopy and anyone crawling under the beak stay visible.
- Feedback: per whack a crack (sfx.crack) and glass sparkle / a ratchet (sfx.ratchet, new) on the hatch; the smash:
  sfx.shatter (new), a whoosh, a screen shake (0.45), glass shards flung off that drift for ~3 s and the raider's air
  puffing out of the hole for 3 s (ventT); the viewport: shatter + clank, a small shake, ice bits; the hatch: the
  ratchet running out, the lid's clang, again when it swings shut. Prompts: "Click / E: smash the canopy (vents their
  ship)", "Click / E: pry the cracked viewport open", "Click / E: crank the service hatch open (it shuts behind you)".
- In-world: the brig barge's canopy smashed: "Dr. Varga's cell is sealed: she's safe" (banner, once). Pirates aboard a
  vented ship are thrown about (a hit, stunned 2.5 s), then carry on in their masks (no change in behaviour: their
  ship's airless now, they don't care).
- Tests: tests/dockentry.js + the prompt, the reveal (outside and in the cockpit), the smash's shake and air, the brig
  cell banner, the crank turning, a guest smashing in on the server with the host's browser seeing it.

### Polish: leech drink ring, spores inside, the override prompt, airlock module walls, banners (2026-10-23)
- **Leeches** (js/organic.js drawLeechDrink): the drink's progress ring was drawn before the leech sprites were
  composited, so it hid under them. Sprite view: queued (leechDrinkLater) and drawn from drawOutsideOverlays, over the
  sprites. Both views: a ring round the whole worm (its body lies outward of the mouth), a dark track, the golden drink
  with a glow and a bright head, the "satisfied" pulse after a drink.
- **Spores inside** (js/spores.js): an infested room gets a haze clinging to its walls (sporeEdgeHaze: dense at the edges,
  the middle stays readable), greener puffs and floating spores (sporeMote: fuzzy balls with a halo; browned and sinking
  while vacuum kills them). Through an open door: 14 puffs plus a stream of spores; at the reactor room's doors they brown,
  crumble into embers and a heat shimmer glows there.
- **Leviathan phase 4**: the override panel's own prompt is short (levOverrideStatus(true): "Override needs MID 1/3: power
  lever to MID, wedge it · refuel the reactor"; the HUD line keeps the long form); the HUD's ENGINE OVERRIDE lines sit
  right of the sidebar and wrap to fit. The in-world prompt over your head (js/game.js) and the mouse tooltip wrap when
  wider than the screen and stay on it.
- **Outer airlock modules** (sprite view, js/airlock.js): the module's low near wall and the hull's low wall running on
  south of it read as walls, not a dark band: a steel sheen and catch-light edges on their caps (drawAirlockWallTops, the
  'mid' layer); the room's ambient light covers the whole module (its walls too) and that low hull wall.
- **Banners** (js/combat.js): combatBanner fits the free gap between the sidebar and the PRACTICE button / shields list:
  one line if it fits, else two (22, 19, 16 px: bannerLayout, wrapText), on a narrow screen under the right-hand HUD;
  short ones stay in the middle; heavy-shot warnings move down under a two-line banner. tests/sidebar.js checks the layout.
- **HUD bar**: the controls line starts after the title (it ran into "MANIFOLD NOVUM") and drops its last items when the
  room name / music / alarm on the right need the space.

### Fixes: the hull wall under the airlock modules, the in-world prompt off the panels (2026-10-23)
- **Airlock module corner** (sprite view, js/sprites.js buildWalls / buildWallPieces): the room's outer hull wall south of
  each module was low all along (a narrow grey strip that made a "T" with the module's low near wall). Now it's the wall
  kit's full-height wall with its pipes, like north of the module: low only where a tall top would stand in front of the
  chamber (v.rise = the chamber's south edge + the 1.6 top's lift, H_FULL_LIFT; that low bit hides behind the tall top),
  then the usual cutaway step down before the room's near wall. drawAirlockWallTops no longer paints that strip; the
  module's cap keeps its sheen except in front of the hull wall (only the sliver north of its top). Classic: unchanged.
  No walkable rect moved (travel table unchanged).
- **In-world prompt** (js/game.js): never under the panels drawn over the world: the sidebar's header and plates, "+n
  more", the energy panel and the inventory slots (js/sidebar.js leftPanelRects; systems.js powerPanelRect). It moves the
  least it can, right of / below / above them, staying on screen (keepOffPanels, pure). tests/sidebar.js: the layout and
  a sweep at 760 / 1024 / 1400 / 1920 px.
