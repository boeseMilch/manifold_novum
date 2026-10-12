# Brief for model agents (read this first)

You are one of several agents turning *everything* in Manifold Novum into finished-looking Blender
models, rendered as sprites for a tilted top-down view. Each agent owns one category. Integration
into the game comes later (by the main agent), so your job is great-looking, correct, consistently
named sprites plus a manifest entry and notes on how each one maps onto the game.

## Reference look

The user loved two prototypes. Match them:
- `models/ship/reactor.py` (+ `models/ship/shiplib.py`): the REAKTOMAT reactor.
- `models/enemy/interceptor.py`: the interceptor (hull, turret, weak spots).
Look at their renders in `assets/sprites/ship/` and `assets/sprites/enemy/` (Read tool on PNGs) and
read their scripts before you start. Chunky, toy-like, used-spaceship industrial; bevels; worn paint
with grime and scratches (not camo-like edge wear); decals and stencils; duct tape as the running
joke; glowing parts kept at emission strength 0.5–1.5; dark inverted-hull outlines (0.012–0.014 for
props, ~0.02 for big ships, 0.008 for fine seams); palette colours brightened ~1.35× like the
interceptor does, because AgX darkens lit surfaces.

The astronaut (`models/crew/crew.py`) is being reworked right now by another agent: don't touch it.

## Rules

- Read `tools/blender/README.md` (conventions: camera 50°, 96 px/unit, passes, manifest, origins,
  directions) and `tools/blender/mn.py`.
- Your scripts go in `tools/blender/models/<your group>/`, your renders in
  `assets/sprites/<your group>/`. Only touch those (and `assets/sprites/manifest.json`, which
  `mn.render` updates under a lock). Never edit `mn.py`, `README.md`, `BRIEF.md`, other groups'
  files, `js/`, `tests/`, `prototype2/`. You may *import* helpers from `models/ship/shiplib.py` or
  copy helpers from other scripts into your own files.
- Don't commit or push; the main agent does that.
- Sizes and positions must match the game: read the game code that draws and uses each object
  (positions, sizes, hit shapes, states, animations) and keep footprints/hit areas the same.
  Gameplay must not change.
- States: render every visual state the game shows (on/off, broken, open/closed, charge levels,
  damaged, ...) as separate sprites or frames. Things that rotate or aim get directions. Things that
  animate get a short loop. Recolourable parts (per-player or per-variant colours) get `mn.tint` and
  a mask pass. If something is better left procedural in the game (particles, beams, text), say so
  instead of forcing a sprite.
- Huge objects (the ship hull) can be split into pieces or tiles; explain the split.
- Several agents render on one GPU at the same time. Iterate with low samples
  (`mn.SAMPLES = 16` in your script while working) and do the final renders at the default. If the
  GPU runs out of memory, retry, or fall back to CPU (24 cores).
- Check your own work with contact sheets (PIL is installed for python3) and the Read tool on
  images, at sprite scale and at game scale (48 px/unit). For anything with a game shape (hit
  areas, footprints), overlay the game's shape on the render to verify it lines up.

## Report back

Keep it short: what you built (a list of sprite names with what each is and its states), how each
maps onto the game object (origin, which game coordinates, which function/state picks which
sprite), anything you left procedural and why, render time, the path of a contact sheet in /tmp,
and anything that didn't work.
