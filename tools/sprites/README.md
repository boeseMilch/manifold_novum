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
   without its last `_token`, e.g. `interior/door_v_frame_blast_f0..f3`), are compared with the frames
   stored whole before them. When the pixels that differ (beyond the tolerances in `pack.py`) fit in a box
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
