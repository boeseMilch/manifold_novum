# Sprite packing (raw renders → game atlases)

The Blender scripts (`tools/blender/`) write raw renders to `build/renders/` (not in git, ~480 MB of
PNG). `pack.py` turns them into what the game loads, in `assets/sprites/` (~25 MB):

    python3 tools/sprites/pack.py                  # every group
    python3 tools/sprites/pack.py organic          # one group; the other groups' pages and entries stay as they are
    python3 tools/sprites/pack.py --keep-png ...   # also keep the pages before encoding (build/pack/) for checks
    python3 tools/sprites/verify.py [--png] [group ...]   # rebuild every frame from the pages, diff against the renders

Needs python3 with Pillow (WebP), numpy and scipy. A full run takes ~2.5 min on 24 cores
(slowest steps: WebP encoding, then loading/scaling the PNGs, then the delta search).

## What it does, per sprite set

1. **Scale** to the group's pixels per unit (`PPU_RULES` at the top of `pack.py`): 96 for the
   interior, ship, systems, props, crew, chars, fx, dock, items and the hull body tiles; 72 for the hull
   exterior parts, enemies and organic; item icons (`icon: true`) keep their 128×128 canvas. Lanczos on
   premultiplied alpha. Normal and height maps are stored at half that resolution, masks at full.
2. **Trim** every image to its alpha bounding box; the origin moves with it.
3. **Delta crop**: frames of one entry, and entries that share a canvas, origin and name stem (the name
   without its last `_token`, e.g. `interior/door_v_frame_blast_f0..f3`), are compared with the last 24
   frames stored whole before them, and with the same frame of earlier variants that have as many frames
   (`crew/run_visor` frame k with `crew/run` frame k). When the pixels that differ (beyond the tolerances in `pack.py`) fit in a box
   at most 60% of the frame's own area, the frame is stored as that box only: a *patch* on a *base*.
   Exact duplicates are stored once. Rotating things differ everywhere and stay whole.
4. **Pack** each group into its own pages (MaxRects, ≤ 4096²; one roughly square page when it fits), with
   4 px of edge extrusion around every rect (2 px in the half-size maps), rects at even positions.
5. **Encode**: beauty WebP lossy q88 with lossless alpha (RGB under transparent pixels is bled from the
   neighbours, so filtering doesn't pull in black); normals lossless after rounding to 6 bits (lossy WebP
   smeared small sprites' normals: ~9° mean error on the crew); height and mask lossless grey.
   Data maps are pre-dilated (content grown 8 px into the transparent area, flat elsewhere), so the
   renderer doesn't need to.

## Files

    assets/sprites/sprites.json
    assets/sprites/<group>/page<N>.webp     beauty, RGBA (straight alpha)
    assets/sprites/<group>/page<N>.n.webp   world normals, rgb = n * 0.5 + 0.5 (x right, y up-screen/away, z up); half size
    assets/sprites/<group>/page<N>.h.webp   height above the ground, grey = z / heightRange; half size
    assets/sprites/<group>/page<N>.m.webp   tint mask, grey (only groups that have masks); full size

The `.n` / `.h` pages have exactly half the beauty page's size and the same layout: the same UVs
(rect / page size) address the same sprite in all of them.

## sprites.json

    {
      "meta": {
        "version": 1, "elevation": 50, "heightRange": 4, "rawPpu": 96, "mapScale": 0.5, "pad": 4,
        "pages": { "crew": [ { "file": "crew/page0", "w": 1036, "h": 1036, "maps": "nhm" } ], ... }
      },
      "sprites": {
        "crew/idle_visor": {
          "group": "crew", "ppu": 96,
          "w": 102, "h": 160, "ox": 51.0, "oy": 119.18,     // canvas size and ground origin at `ppu`
          "dirs": 8, "frames": 1, "maps": "nhm",
          "f": [ [page, x, y, w, h, ox, oy],                 // a frame stored whole
                 [page, x, y, w, h, ox, oy, base, over],     // a patch on bases[base]
                 null, ... ],                                // empty image (nothing to draw)
          "bases": [ [page, x, y, w, h, ox, oy], ... ],      // only if some frame is a patch
          ...                                                // every other field of the raw manifest entry
        }                                                    //   (note, tile, pitch, open, origin, icon, spots, ...)
      }
    }

- `f[k]` is frame k in the raw manifest's `files` order: for `mn.render` sets k = dir * frames + frame.
- `page` indexes `meta.pages[group]`; `x, y, w, h` is the rect on that page in beauty pixels; `ox, oy` is
  where the sprite's ground origin lies relative to the rect's top-left (it can be outside the rect).
- `ppu` = pixels per game unit of this sprite's beauty rects. A world point at screen position
  (sx, sy) with the camera at S screen px per unit: draw the rect at
  `(sx - ox * S / ppu, sy - oy * S / ppu)`, size `(w * S / ppu, h * S / ppu)`.
  A pixel (px, py) of the rect is `(px - ox) / ppu` units right of the origin and `(py - oy) / ppu`
  screen-units below it (the tilted-view projection is in `tools/blender/mn.py`).
- Maps: the same rect in a `.n` / `.h` page is `(x, y, w, h) * mapScale`.
- `native: true` (icons): the canvas is kept as rendered; `ppu` is then nominal.
- Fields copied from the raw manifest are as written by the model scripts: pixel values in them
  (`spots`, `tile_px`, ...) are at `rawPpu` (96), so multiply by `ppu / rawPpu`.
- Entries without images (`hull/body`, the tile index) have `"f": []` and only the passed-through fields.

### Drawing a frame

    fr = S.f[k]
    if fr == null: draw nothing
    elif fr.length == 7: draw rect fr
    else:
        b = S.bases[fr[7]]
        draw rect b, but not inside fr's area (the patch rect, placed by its own ox/oy)
        draw rect fr (if its w > 0; w = 0 means the frame equals the base)

The patch *replaces* the base inside its rect (doors that open remove pixels). When `over` (fr[8]) is 1,
simply drawing the patch on top of the full base gives the same picture, so the cut-out can be skipped.
Canvas 2D: clip with an even-odd path (base rect + patch rect), draw the base, restore, draw the patch.
WebGL: one quad over the base rect; the shader samples the patch where the pixel is inside the patch
rect, the base elsewhere (see `prototype2/gl.js`).
The rebuilt frame matches the render within the tolerances (max 6/255 per channel before WebP).

## Changing things

Settings are the table at the top of `pack.py` (pixels per unit, padding, tolerances, WebP settings).
The format is read by `prototype2/` (and later the game): change both together and bump
`meta.version` if a field changes meaning.

## In the game (`js/gfx.js`, `js/sprites.js`, `js/lights.js`)

`js/gfx.js` is the WebGL2 renderer (its header documents the whole API). It draws on its own canvas
under the 2D canvas `c`, which stays on top for the HUD, panels, prompts and effects. Without WebGL2,
with `?classic`, opened as a `file://`, or in Node (tests, the server's simulation) `GFX.on` is false
and the game draws its old top-down look.

    GFX.sprite(name, frame, x, y, z, { layer, sortY, alpha, tint, emissive, unlit, scale, flip, rot, sx, clip, depthBias, depthWrite, pick, billboard, desat })
    GFX.canvasSprite(key, w, h, { ppu, ox, oy })   // a sprite the game draws itself: { name, ctx, commit() }
    GFX.text(text, font, fill, { outline, base, spacing })   // a text label sprite (name); draw it with { billboard: true }
    GFX.frameIndex(name, angle, f)      // dir * frames + f, dir from an angle (0 = right, y down)
    GFX.lighting({ ambient, sun, areas, lights, grade })   // built each frame by gameLighting() in js/lights.js
    GFX.setShadows(on)                 // screen-space shadows (default on; ?noshadows)
    GFX.layer2d('back' | 'mid' | 'glow')   // 2D canvases composited into the GL picture (old drawings; glow: unlit markers)
    GFX.has(name), GFX.ready(name), GFX.info(name), GFX.toScreen(x, y, z), GFX.lift(z), GFX.pickAt(x, y)

- Pages load lazily per group (hull, interior, ship and crew are preloaded); `GFX.sprite` returns false
  until a sprite's pages are there, so callers draw their old 2D version meanwhile.
- Layers, in drawing order: 2D `back` (space, things behind the ship, unlit) → `under` (lit, no depth: enemies,
  asteroids, the leviathan — below the hull) → `ground` / `decal`
  (no depth, submission order: hull tiles, floors) → `wall` (sorted by `sortY`, per-pixel depth from the
  height map: walls, doors, airlocks, cannons) → 2D `mid` (every old drawing the game used to draw
  before the crew, lit like the floor) → `main` (sorted, depth-tested against the walls: crew and other
  things that move) → `top` → bloom and tone shoulder. The 2D `glow` layer (unlit: interaction brackets, pickup
  halos, the energy on the power lines, job markers) goes between `mid` and `main`. The 2D canvas `c` (after-crew drawings, HUD) is on top.
- Per pixel: world position from the sprite's place, ppu and height map → light = area ambient + sun ×
  area factor + the lights binned into its screen tile (points, spots, strips; N·L from the normal map;
  shadows marched through last frame's depth buffer) → depth `y·cos50 + z·sin50`.
- `emissive` (0..1) keeps a sprite's brightest pixels lit in the dark: set it on screens, LEDs, lamps.
- Tint: the mask recolours relative to the untinted mask area's mean luminance (measured from frame 0).
- Internal resolution: min(1, 2048 / physical width); `?gfxscale=0.75` sets (and remembers) another.
