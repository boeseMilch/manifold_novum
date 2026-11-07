# Prototype 3 — the big ship (2026-11-07)

The user: "make a prototype for a larger ship. I want interactables that you can and must play with
multiple people." It's a standalone prototype like `prototype1/` and `prototype2/`. It doesn't touch the main
game's code: the main ship's six-room layout is hard-wired through every file in `js/`. It runs on the normal
`node server.js` and is opened at `http://<host>:8080/prototype3/`.

## Ground rules

- **Minimum crew: 3** (`MIN_CREW` in `sim.js`). The lobby's START button only works with at least that many
  players connected. For testing alone: `?solo` (or the lobby's "test alone" button) spawns 3 crew bodies in the
  browser (no server) and **Tab** switches which one you control. The others stand still.
- **Server-authoritative.** `prototype3/sim.js` is the whole simulation: plain JS, no DOM, loadable by Node
  (`module.exports`) and by the browser (a global). The server ticks it at 30 Hz and sends snapshots at 15–20 Hz.
  Clients send their input state (movement keys, use, the station's own keys). Solo mode runs the same sim in the
  page.
- One game per server for the prototype: everyone who opens the page joins the one crew. A lobby lists the names
  and has START. When the run ends, anyone presses R to go back to the lobby.
- Look: top-down, procedural canvas 2D in the main game's style (`js/art.js`: dark outlines, plated floors, zone
  tints, `drawCrew` suits). Copying or adapting drawing code from `js/` into `prototype3/` is fine. Don't change
  `js/`.
- Units like the main game: 1 layout unit = 48 px at zoom 1, walk speed 4.2 units/s. The ship's nose points up (−y).
- Controls: WASD or arrows to move, E or Space to use / leave a station. At a station the movement keys drive it.
  A small hint line says what the keys do.

## The ship

About twice as long as the main ship, with a long central corridor (the spine) and rooms on both sides. Doors are
open doorways (no door logic needed). From the nose to the stern:

1. **Bridge** (nose): the **chart table** (helm).
2. **Fire control** (upper middle): the **cupola seat**: the gun's eye and trigger.
3. **Gun room** (middle, next to fire control but *not* in sight of it: separate rooms, a wall in between): the
   **range wheel**, the **breech** and a **ready rack** (holds 2 shells).
4. **Energy bank / reactor room**: shows the ship's energy.
5. **Magazine** (stern): the **shell racks** (the run's whole supply). It's a long walk from the gun on purpose
   (about 8–10 s carrying a shell).
6. Some living space and clutter so it reads as a ship (quarters, galley); purely visual.

The artillery turret sits on the hull's back above fire control / the gun room and is drawn from above, with its barrel
pointing where it's traversed.

## Shared state (in sim.js)

- `hull` (0..100); the run is lost at 0.
- `energy` (starts at 12): every shot costs 1. No recharge in the prototype ("limited shots").
- `magazine` (starts at 10 shells), `readyRack` (0..2), `breech`: `'empty' | 'open' | 'loaded'` (see below).
- crew: `{ id, name, color, x, y, face, carry: null | 'shell', station: null | stationId }`. Carrying a shell:
  walk at 55 % speed.
- Encounters (spawned by the helm's route, see below) and `events` (a list of one-off things for the client to
  show: shots, splashes, hits, banners).

## Interactable 1: the artillery (needs 2–3 people)

Split across stations so that whoever can see can't load or set the range, and the other way round:

- **Cupola seat** (fire control): the only place that **sees** outside. The view switches to a periscope /
  tactical view round the ship: the targets, the gun's bearing line and where the current range puts the shell
  (a range mark on the line). A/D (or ←/→) **traverses** the turret (slow motor, about 20°/s, full 360°).
  Space **fires**. Firing needs a loaded, closed breech and 1 energy. The shell is in the air for a while
  (range / 18 units/s, so 1.5–3.5 s) and lands where the gun pointed *when it fired*. Moving targets need a lead.
  The splash shows where it landed. Within 2.5 units of a target it's a hit.
- **Range wheel** (gun room): W/S (or A/D) turns the **elevation**, i.e. how far the shell flies: 10..60 units,
  about 8 units/s. Its operator sees only a dial with a number, **not** the targets. So the spotter has to call it:
  "further… further… stop".
- **Breech** (gun room): the loader. E at the empty breech **opens** it (0.6 s). E again with a shell in hand (from
  the ready rack or straight from the magazine) **rams** it in (a short hold, about 1 s). It then closes and shows
  LOADED. After a shot the breech is empty again and steams for a second; the case drops out.
- **Ready rack** (gun room, 2 slots): E puts a carried shell in or takes one out. It lets a third crew member haul
  shells while the loader keeps loading.
- **Shell racks** (magazine): E takes one shell (if any are left). You carry one at a time.

So with 3 players: one in the cupola, one on the range wheel and the breech (next to each other), one hauling from
the magazine (and charting at the helm in the quiet moments).

## Interactable 2: the chart table / helm (course plotting)

The run follows a **route map**: `LANES = 4` lanes side by side, `STEPS = 7` steps from the start to the jump
point. The ship is always on one node (step, lane). It starts at step 0 in a middle lane. Every `STEP_TIME` (about
40 s) it moves on to the next step. A step is the time one encounter takes, so a run is about 5 minutes.

- **Connections:** from (k, lane) the map has edges to (k+1, lane−1 / lane / lane+1). Not all of them: each node has
  1–3 forward edges and every node can be reached. Drawn as lines on the chart.
- **Every path has the same number of encounters.** Every node at steps 1..STEPS carries exactly one encounter,
  so whatever you choose, you meet STEPS encounters. The choice is *which* ones, and from where:
  - **Danger** marker *between* two neighbouring lanes at a step: an enemy gunship sits between those lanes. If you
    fly the left one of the two lanes, it attacks from your **right**; in the right lane, from your **left**.
    So the chart tells you in advance which side to traverse the gun to. A danger covers exactly the two nodes beside
    it.
  - **Obstacle** marker *on* a node: an asteroid field. Rocks come from **ahead**.
  - **Danger at the edge** (a marker outside lane 0 or lane LANES−1): a gunship from that outer side.
  - The generator pairs neighbouring lanes at each step (a danger between them) and gives the unpaired lanes an
    obstacle or an edge danger. That way every node has exactly one encounter.
- **Charting:** at the chart table you see the whole map, your ship's node and the course so far. Move a cursor
  with the movement keys and E/Space to pick the next node of the course (only nodes that connect to the course's
  last node), or Backspace / Q to take the last pick back. The course is drawn on the chart.
- **No course, random flight:** when the ship reaches the end of a step and the course doesn't say where to go next,
  it takes a **random** connection. A banner says "No course charted, drifting".
- The chart's plan is shared state: anyone at the table sees and edits the same course.
- A small "next jump in 0:23 → lane 2, gunship from the RIGHT" readout sits on the HUD for everyone, so the gunner
  can pre-traverse even without going to the bridge. (Whether to keep that is a balance question; the prototype
  shows it.)

## Encounters (enough to make the two stations matter)

- **Gunship** (from a danger): appears 30–45 units off that side, drifts slowly up and down (so it needs a lead),
  and fires a shot at the hull every 5–7 s (−6 hull each). Takes 2 shell hits; then it's destroyed (explosion).
  If it's still alive when the step ends, it falls behind and is gone.
- **Asteroid field** (from an obstacle): 4–6 rocks drift in from ahead over the step. Each one that reaches the hull
  does −8. A shell hit (2.5 units) smashes one. It's a range-and-bearing exercise too.
- Running out of shells or energy is part of it: 10 shells / 12 energy aren't enough to shoot everything, so the
  course choice (fewer gunships, avoid both sides at once) matters.
- Win: reach the jump point after step STEPS with hull > 0. Lose: hull 0. An end card shows what happened.

## Files

- `prototype3/index.html`: the page (canvas, lobby overlay, HUD).
- `prototype3/sim.js`: the simulation (layout, crew movement, stations, the artillery, the route, encounters).
  It can be split up (`sim-artillery.js`, `sim-route.js`, ...) as long as Node and the browser load it the same way.
- `prototype3/client.js` (+ `render*.js`): input, net, drawing.
- `prototype3/netserver.js`: the server side: its own WebSocket path `/ws-big`, hooked into the root `server.js`
  with a few lines. It runs `sim.js` at 30 Hz.
- `tests/bigship.js`: headless tests of the sim (run with the other tests).

## How to run

- Crew game: `node server.js` (port 8080, or `node server.js 8081`), everyone opens `http://<host>:8080/prototype3/`,
  types a name, "Join the crew"; START works once at least `MIN_CREW` (3) are in. Joining mid-run spawns you in;
  R after the end sends everyone back to the lobby.
- Alone: the lobby's "Test alone" button, or `/prototype3/?solo` (3 bodies, Tab switches). Add `#overview` (and
  reload) to see the whole ship.
- Tests: `node tests/bigship.js`.

## Core API (what the artillery and helm files plug into)

Files and load order (identical in Node and the browser): `sim.js` (the core), then `BIG.SIM_MODULES`
(`sim-artillery.js`, `sim-helm.js`), then in the browser only `BIG.CLIENT_MODULES` (`render.js`, `view-artillery.js`,
`view-helm.js`, `client.js`). Every file shares the namespace `BIG` (`globalThis.BIG`; `require('./sim.js')` in
Node). `netserver.js` is the `/ws-big` server side, hooked into the root `server.js`.

Sim side (`sim.js`):
- `BIG.defineStation({ id, kind, room, x, y, label, prompt(sim, c), use(sim, c), hold(sim, c, dt), drive(sim, c, inp, dt),
  seat, sx, sy, face, claims, hint, sit(sim, c), leave(sim, c) })`: an existing id keeps its fields (position) and gets
  the new ones. E (or Space) near a station (within `USE_REACH` of x, y; the nearest one whose `prompt` isn't null):
  a seat sits you at (sx, sy), otherwise `use`; `hold` runs every tick while E is held. Seated, `drive` gets
  `inp = { ax, ay, up, down, left, right, use, fire, back, pressed: Set }` every tick; E or Space leaves unless the
  station lists that key in `claims` (`claims: ['fire']`: Space goes to the station, E leaves).
- `sim.startAction(c, secs, label, done(sim, c), { hold })`: a timed action with a progress bar (no walking meanwhile).
- `BIG.TICK_HOOKS.push(fn(sim, dt))`, `BIG.INIT_HOOKS.push(fn(sim))`, `BIG.SNAPSHOT_HOOKS.push(fn(sim, snap))`.
- `BIG.ENCOUNTER_KINDS[kind] = { spawn(sim, opts) -> fields, tick(sim, enc, dt), end(sim, enc) }`;
  `sim.spawnEncounter(kind, opts)`, `sim.endEncounters()`, `enc.dead = true` removes one. Fields starting with `_`
  stay out of the snapshot.
- Shared state: `sim.hull, energy, magazine, readyRack, breech, turret: { angle, range }, crew[], encounters[], stats{}`;
  `sim.damageHull(n, where)`, `sim.banner(text, toCrewId?)`, `sim.event({ type, ... })`, `sim.end(won, reason)`,
  `sim.rand()` (seeded).

Client side (`render.js`): `BIG.STATION_VIEWS[kind] = { draw(ctx, snap, me, w, h, t), hint }`,
`BIG.ENCOUNTER_DRAW[kind] = (ctx, enc, snap, t)` (ship-local px, units * `BIG.art.T`),
`BIG.STATION_ART[kind] = (ctx, st, snap, t)`, `BIG.HUD_HOOKS.push(fn(ctx, snap, me, w, h, t))`,
`BIG.EVENT_HOOKS.push(fn(ev, snap, me))`; helpers in `BIG.art`.
