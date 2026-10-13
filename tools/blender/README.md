# Sprite pipeline (Blender → tilted top-down sprites)

Every game object gets a Blender model, written as a Python script in `models/<group>/<name>.py`
that builds the scene with the helpers in `mn.py` and renders sprites into `build/renders/` (not in git).
No `.blend` files: the scripts are the source and can be re-run any time.

The game doesn't load the raw renders: `python3 tools/sprites/pack.py [group ...]` trims, scales,
delta-crops and packs them into WebP atlas pages in `assets/sprites/<group>/` plus
`assets/sprites/sprites.json` (format: `tools/sprites/README.md`). Re-pack a group after re-rendering it.

    blender -b --factory-startup --python tools/blender/models/<group>/<name>.py

(The `cattrs` / `EXTENSIONS_OT_repo_sync` tracebacks at startup are harmless Blender noise.)

## View

Orthographic, tilted top-down: the camera looks down at 50° above the horizon, towards game "up"
(Blender +Y), and is *not* turned around Z. Rooms stay rectangles on screen; you see the tops of
things and their fronts (the side facing game "down"). 1 Blender unit = 1 game layout unit
(`js/ship.js`; a crew member is ~0.6 wide, rooms 6–9 across). Game x → +X, game y → −Y, up → +Z.
96 px per unit.

## Passes

Each sprite is rendered as `name.png` (beauty), `name.n.png` (world normals), `name.h.png`
(height) and optionally `name.m.png` (tint mask), plus an entry in `build/renders/manifest.json`
with the canvas size and the pixel where the model's ground origin lands (`ox`, `oy`). The normal
and height passes let the game light sprites at runtime (alarm red, reactor glow, muzzle flashes).

## Style

The current game is flat-ish cartoon art with dark outlines (see `js/art.js`, `js/decor.js`). The
models should read as the *same* things, finished: a chunky, slightly toy-like, used-spaceship look
(think a well-made indie game, not photoreal).

- Silhouettes first: the thing must read at 48–96 px per unit. Exaggerate key features.
- Bevel everything (`bevel=` on primitives); no razor edges.
- Palette from `mn.PALETTE` (the game's colors). Saturated accents only where they mean something
  (blue = weak spot / energy, yellow-black = hazard / interactive, red = danger, green = OK).
- Wear: small dents, panel lines, rivets, decals, a bit of grime. Duct tape is the ship's running
  joke. Detail must stay readable, not noisy.
- Emissive parts (screens, lights, energy) use `emit=` so they glow in the beauty pass. Keep the
  strength around 0.5–1.5: above that, colours wash out to white under AgX.
- The key light comes from the front right (shadows fall up and to the left). The prototypes were
  rendered with it; whether to move it to the upper left (like the old art's blob shadows) is open.
- Outlines: 0.012–0.014 for props, ~0.02 for big ships, 0.008 for floor seams.
- `mn.outline(objs)` last: the dark contour that matches the game's outlines.
- Don't change the light rig or camera in your model script; if they don't work for your object,
  say so in your report instead.

## Directions and animation

`mn.render(name, root=..., dirs=8)` renders every facing (dir i faces game angle i·45°, 0 = right,
90° = down/towards the camera). Use `frames=[...]` for animation (keyframe the scene, pass the
frames). All directions and frames share one canvas and origin.

When keyframing: call `scene.frame_set(f)` *before* posing and inserting keys, or the existing keys
overwrite the pose you just set.

## Prototypes so far

- `models/crew/crew.py`: the crew member (16 dirs; idle, forward / backward / sideways gait cycles with IK
  legs and a `stride` for the game, a settle into idle; visor up/down, tint mask, worn-gear overlays).
- `models/ship/`: reactor (6-frame pulse + off), floor tiles, wall kit (`shiplib.py`: pipes, labels,
  exact-window renders for tiles).
- `models/enemy/interceptor.py`: hull per side and paint job, 32-direction turret, weak spots per
  state rendered with the hull as holdout so they line up with the game's hit shapes.
- `prototype2/index.html` (via `node server.js`): WebGL viewer with runtime lighting from the
  normal and height passes.
