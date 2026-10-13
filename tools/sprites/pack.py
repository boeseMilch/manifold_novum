#!/usr/bin/env python3
"""Pack the raw Blender renders (build/renders/) into game-ready atlas pages (assets/sprites/).

    python3 tools/sprites/pack.py                 # every group
    python3 tools/sprites/pack.py organic hull    # only these groups (the others stay untouched)
    python3 tools/sprites/pack.py --jobs 8 ...    # worker processes (default: all cores)

Per sprite set: scale to the group's pixels per unit, trim to the alpha bounding box, store frames that
share pixels with an earlier frame as a small patch on it ("delta crop"), pack everything of a group
into <=4096^2 pages and encode them as WebP. Writes assets/sprites/<group>/page<N>.webp (beauty),
.n.webp (normals), .h.webp (height), .m.webp (tint mask, only if the group has masks) and
assets/sprites/sprites.json. Format: tools/sprites/README.md.

Needs python3 with Pillow (WebP support), numpy and scipy.
"""
import argparse, hashlib, json, math, os, re, sys, time
from multiprocessing import Pool
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RAW = os.path.join(ROOT, 'build', 'renders')          # tools/blender/mn.py OUT_DIR
OUT = os.path.join(ROOT, 'assets', 'sprites')
RAW_PPU = 96                                          # mn.PPU: what the renders are made at

# ----------------------------------------------------------------------------------------------------
# Settings (change here)
# ----------------------------------------------------------------------------------------------------
# Pixels per game unit of the packed beauty (and mask) images, first matching rule wins (regex on the
# sprite name). The game renders at 2048x1280 internally: ~96 px/unit inside the ship, ~72 on a
# spacewalk, 35-53 from a cannon. None = keep the canvas as rendered (HUD icons, 128x128).
PPU_RULES = [
    (r'^items/icon_', None),           # item/gear icons (HUD): as rendered (also any entry with icon: true)
    (r'^hull/body', 96),               # hull body tiles
    (r'^hull/', 72),                   # hull exterior parts: guns, cover, hatches, antenna, coils, engine bell, breaches, patches, decals
    (r'^(enemy|organic)/', 72),
    (r'', 96),                         # interior, ship, systems, props, crew, chars, fx, dock, items (world), test
]
MAP_SCALE = 0.5            # normal and height maps: this fraction of the beauty resolution (mask: same as beauty)
PAGE_MAX = 4096            # atlas page size limit
PAD = 4                    # beauty px of edge extrusion around every rect (PAD/2 in the half-size maps)
ALPHA_MIN = 2              # trimming: pixels with alpha below this (0..255) count as empty
# Delta crop: a frame is stored as a patch on an earlier frame of the same set when the pixels that
# differ (beyond these tolerances; renders have denoiser noise) fit in a box this much smaller.
TOL_RGBA = 6               # max channel difference (beauty, straight RGBA) that still counts as equal
TOL_ALPHA_EQ = 6           # both pixels at most this opaque: equal, whatever their colour
TOL_NORMAL = 12            # normals / height / mask, only where the beauty is visible
TOL_HEIGHT = 3
TOL_MASK = 8
DELTA_MAX_FRACTION = 0.6   # patch area must be <= this fraction of the frame's own trimmed area
DELTA_GROW = 2             # grow each patch box by this many px (filtering seam safety)
FILL_DIST = 8              # data maps: grow content this many px into transparent areas (rest: flat default)
WEBP = {
    'b': dict(quality=88, method=6, exact=True),       # beauty: lossy RGB + lossless alpha (libwebp default)
    # normals: lossless after rounding to multiples of QUANT['n'] (6 bits; mean error < 1 deg). Lossy WebP
    # (quality=90) is ~2x smaller, but its 4:2:0 chroma smears the normals of small sprites (crew: ~9 deg
    # mean error, edge highlights gone); switch back here if size matters more.
    'n': dict(lossless=True, quality=100, method=6),
    'h': dict(lossless=True, quality=60, method=4),    # height: lossless grey
    'm': dict(lossless=True, quality=60, method=4),    # tint mask: lossless grey
}
QUANT = {'n': 4}           # round these maps to multiples of this before (lossless) encoding
FLAT_NORMAL = (128, 128, 255)

# ----------------------------------------------------------------------------------------------------
def ppu_for(name, entry):
    if entry.get('icon'): return None
    for rx, p in PPU_RULES:
        if re.search(rx, name): return p
    return RAW_PPU

def group_of(name): return name.split('/', 1)[0]

def family_key(name, e, ppu):
    """Entries that share a canvas and a name stem (all but the last _token) are delta-cropped together."""
    short = name.split('/', 1)[1]
    stem = short.rsplit('_', 1)[0] if '_' in short else short
    return (group_of(name), stem, e['w'], e['h'], e['ox'], e['oy'], ppu)

def rgba(path):
    im = Image.open(path)
    if im.mode != 'RGBA': im = im.convert('RGBA')
    return np.asarray(im)

def resize_premult(a, s, W, H):
    """a: float32 HxWxC (last channel = alpha, 0..1, others straight). Lanczos at scale s with premultiplied
    alpha -> (straight colour channels, alpha), output W x H covering raw [0, W/s] x [0, H/s]."""
    h, w, c = a.shape
    padw, padh = max(0, int(math.ceil(W / s)) + 4 - w), max(0, int(math.ceil(H / s)) + 4 - h)
    if padw or padh: a = np.pad(a, ((0, padh), (0, padw), (0, 0)))
    al = a[..., -1]
    out = []
    for ch in range(c):
        v = a[..., ch] * al if ch < c - 1 else al
        im = Image.fromarray(np.ascontiguousarray(v, dtype=np.float32), 'F')
        out.append(np.asarray(im.resize((W, H), Image.LANCZOS, box=(0, 0, W / s, H / s))))
    out = np.clip(np.stack(out, -1), 0, None)
    alpha = np.clip(out[..., -1], 0, 1)
    col = out[..., :-1] / np.maximum(alpha, 1e-6)[..., None]
    col[alpha < 1e-4] = 0
    return np.clip(col, 0, 1), alpha

def fill_nearest(arr, valid, default, maxdist=FILL_DIST):
    """Replace invalid pixels by the nearest valid one (within maxdist), the rest by default."""
    if valid.all(): return arr
    out = arr.copy()
    if not valid.any():
        out[...] = default; return out
    dist, idx = ndimage.distance_transform_edt(~valid, return_indices=True)
    out = arr[idx[0], idx[1]]
    if default is not None: out[dist > maxdist] = default
    return out

class Frame:
    """One rendered image at the target scale on the (scaled, common) canvas."""
    __slots__ = ('b', 'n', 'h', 'm', 'bbox')

def load_frame(stem, s, W, H, maps):
    f = Frame(); base = os.path.join(RAW, stem)
    b = rgba(base + '.png')
    if s != 1:
        col, al = resize_premult(b.astype(np.float32) / 255, s, W, H)
        b = np.concatenate([col, al[..., None]], -1)
        b = np.round(b * 255).astype(np.uint8)
    else:
        b = b[:H, :W]
        if b.shape[:2] != (H, W): b = np.pad(b, ((0, H - b.shape[0]), (0, W - b.shape[1]), (0, 0)))
    # colour bleed under transparent pixels, so bilinear filtering doesn't pull in black
    vis = b[..., 3] > 0
    if vis.any() and not vis.all():
        b = b.copy(); b[..., :3] = fill_nearest(b[..., :3], vis, 0, maxdist=4)
    f.b = np.ascontiguousarray(b)
    for k in 'nhm':
        if k not in maps: setattr(f, k, None); continue
        p = base + '.' + k + '.png'
        if not os.path.exists(p):
            d = np.zeros((H, W, 3) if k == 'n' else (H, W), np.uint8)
            if k == 'n': d[...] = FLAT_NORMAL
            setattr(f, k, d); continue
        d = rgba(p)
        ch = slice(0, 3) if k == 'n' else slice(0, 1)
        if s != 1:
            col, al = resize_premult(np.concatenate([d[..., ch], d[..., 3:]], -1).astype(np.float32) / 255, s, W, H)
            val = np.round(col * 255).astype(np.uint8); valid = al > 0.5
        else:
            d = d[:H, :W]
            if d.shape[:2] != (H, W): d = np.pad(d, ((0, H - d.shape[0]), (0, W - d.shape[1]), (0, 0)))
            val = d[..., ch]; valid = d[..., 3] >= 128
        if k == 'm':
            v = val[..., 0].copy(); v[~valid] = 0          # straight coverage of the tinted parts
        else:
            v = fill_nearest(val, valid, FLAT_NORMAL if k == 'n' else 0)
            if k == 'h': v = v[..., 0]
        setattr(f, k, np.ascontiguousarray(v))
    a = f.b[..., 3] >= ALPHA_MIN
    ys, xs = np.nonzero(a.any(1))[0], np.nonzero(a.any(0))[0]
    f.bbox = (int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1) if len(xs) else None
    return f

def diff_mask(f, g):
    """Pixels where frames f and g differ visibly (beauty or, where visible, the data maps)."""
    fb, gb = f.b.astype(np.int16), g.b.astype(np.int16)
    d = np.abs(fb - gb).max(-1) > TOL_RGBA
    d &= ~((fb[..., 3] <= TOL_ALPHA_EQ) & (gb[..., 3] <= TOL_ALPHA_EQ))
    vis = (fb[..., 3] > TOL_ALPHA_EQ) | (gb[..., 3] > TOL_ALPHA_EQ)
    if f.n is not None: d |= vis & (np.abs(f.n.astype(np.int16) - g.n).max(-1) > TOL_NORMAL)
    if f.h is not None: d |= vis & (np.abs(f.h.astype(np.int16) - g.h) > TOL_HEIGHT)
    if f.m is not None: d |= vis & (np.abs(f.m.astype(np.int16) - g.m) > TOL_MASK)
    return d

def bbox_of(mask, grow=0):
    ys, xs = np.nonzero(mask.any(1))[0], np.nonzero(mask.any(0))[0]
    if not len(xs): return None
    H, W = mask.shape
    return (max(0, int(xs[0]) - grow), max(0, int(ys[0]) - grow), min(W, int(xs[-1]) + 1 + grow), min(H, int(ys[-1]) + 1 + grow))

def area(bb): return 0 if bb is None else (bb[2] - bb[0]) * (bb[3] - bb[1])

def half(block, default):
    """Exact 2x reduction (box filter); odd sizes are padded by repeating the last row/column."""
    h, w = block.shape[:2]
    pw, ph = w % 2, h % 2
    if pw or ph:
        pad = ((0, ph), (0, pw)) + (((0, 0),) if block.ndim == 3 else ())
        block = np.pad(block, pad, mode='edge')
    b = block.astype(np.float32)
    b = (b[0::2, 0::2] + b[1::2, 0::2] + b[0::2, 1::2] + b[1::2, 1::2]) / 4
    return np.round(b).astype(np.uint8)

def crop(f, bb, maps):
    x0, y0, x1, y1 = bb
    item = {'b': f.b[y0:y1, x0:x1]}
    for k in maps:
        a = getattr(f, k)[y0:y1, x0:x1]
        item[k] = half(a, None) if k in 'nh' else np.ascontiguousarray(a)
    return item

def recon_error(base, patch_bb, frame):
    """Max visible error of 'base with patch_bb replaced by the frame' vs the frame (premultiplied, 0..255)."""
    r = base.b.astype(np.float32).copy()
    if patch_bb:
        x0, y0, x1, y1 = patch_bb; r[y0:y1, x0:x1] = frame.b[y0:y1, x0:x1]
    fb = frame.b.astype(np.float32)
    pa, fa = r[..., 3:] / 255, fb[..., 3:] / 255
    e = np.abs(r[..., :3] * pa - fb[..., :3] * fa).max(-1)
    e = np.maximum(e, np.abs(r[..., 3] - fb[..., 3]))
    return float(e.max())

def over_ok(base, bb, frame):
    """True if alpha-blending the patch over the base (no cut-out) reproduces the frame in bb."""
    x0, y0, x1, y1 = bb
    B = base.b[y0:y1, x0:x1].astype(np.float32) / 255; P = frame.b[y0:y1, x0:x1].astype(np.float32) / 255
    pa, ba = P[..., 3:], B[..., 3:]
    out_a = pa + ba * (1 - pa)
    out_c = P[..., :3] * pa + B[..., :3] * ba * (1 - pa)
    e = np.maximum(np.abs(out_c - P[..., :3] * pa).max(-1), np.abs(out_a - pa)[..., 0]) * 255
    return bool(e.max() <= TOL_RGBA)

def process_family(job):
    """Load, scale, trim and delta-crop one family (one or more manifest entries sharing a canvas)."""
    t0 = time.time()
    names, entries, ppu = job['names'], job['entries'], job['ppu']
    e0 = entries[0]
    s = 1.0 if ppu is None else ppu / RAW_PPU
    W, H = max(1, int(math.ceil(e0['w'] * s - 1e-6))), max(1, int(math.ceil(e0['h'] * s - 1e-6)))
    maps = job['maps']
    frames, owner = [], []
    for ni, (n, e) in enumerate(zip(names, entries)):
        for fi, stem in enumerate(e['files']):
            frames.append(load_frame(stem, s, W, H, maps)); owner.append((ni, fi))
    t1 = time.time()
    items, specs, maxerr = [], [None] * len(frames), 0.0
    standalone = []          # frame indices stored whole (candidates for bases)
    whole = set()
    first = [0]              # index of each entry's first frame
    for e in entries: first.append(first[-1] + len(e['files']))
    hashes = {}
    delta_n = 0
    for i, f in enumerate(frames):
        if f.bbox is None:
            specs[i] = ('empty',); continue
        hsh = hashlib.sha1(f.b.tobytes() + b''.join(getattr(f, k).tobytes() for k in maps)).hexdigest()
        if hsh in hashes:                                            # exact duplicate of an earlier frame
            specs[i] = specs[hashes[hsh]]; continue
        own = area(f.bbox); best = None
        if len(frames) > 1:
            # the recent whole frames, and the same frame of earlier variants with as many frames
            # (crew/run_visor frame k on crew/run frame k: only the helmet differs)
            ni, fi = owner[i]
            sib = [first[nj] + fi for nj in range(ni) if first[nj + 1] - first[nj] == first[ni + 1] - first[ni]]
            recent = standalone[-24:]
            for j in recent + [j for j in sib if j in whole and j not in recent]:
                bb = bbox_of(diff_mask(f, frames[j]), DELTA_GROW)
                if area(bb) <= DELTA_MAX_FRACTION * own and (best is None or area(bb) < area(best[1])):
                    best = (j, bb)
        if best:
            j, bb = best
            maxerr = max(maxerr, recon_error(frames[j], bb, f))
            if bb is None: specs[i] = ('patch', j, None, False)
            else:
                items.append(crop(f, bb, maps)); specs[i] = ('patch', j, (len(items) - 1, bb), over_ok(frames[j], bb, f))
            delta_n += 1
        else:
            items.append(crop(f, f.bbox, maps)); specs[i] = ('whole', (len(items) - 1, f.bbox)); standalone.append(i); whole.add(i)
        hashes[hsh] = i
    raw_px = sum(area(f.bbox) for f in frames if f.bbox)
    return {'names': names, 'ppu': ppu, 'scale': s, 'W': W, 'H': H, 'specs': specs, 'owner': owner, 'items': items,
            'maxerr': maxerr, 'delta': delta_n, 'nframes': len(frames), 'trim_px': raw_px,
            'stored_px': sum(it['b'].shape[0] * it['b'].shape[1] for it in items),
            'empty': [owner[i] for i, f in enumerate(frames) if f.bbox is None],
            't_load': t1 - t0, 't_delta': time.time() - t1}

# ----------------------------------------------------------------------------------------------------
# Packing (MaxRects, best short side fit)
# ----------------------------------------------------------------------------------------------------
class MaxRects:
    def __init__(self, W, H):
        self.W, self.H = W, H; self.free = [(0, 0, W, H)]; self.used_w = 0; self.used_h = 0

    def find(self, w, h):
        best, bs = None, None
        for fx, fy, fw, fh in self.free:
            if w <= fw and h <= fh:
                score = (min(fw - w, fh - h), max(fw - w, fh - h), fy, fx)
                if bs is None or score < bs: bs, best = score, (fx, fy)
        return best

    def place(self, x, y, w, h):
        nf = []
        for f in self.free:
            fx, fy, fw, fh = f
            if x >= fx + fw or x + w <= fx or y >= fy + fh or y + h <= fy: nf.append(f); continue
            if x > fx: nf.append((fx, fy, x - fx, fh))
            if x + w < fx + fw: nf.append((x + w, fy, fx + fw - x - w, fh))
            if y > fy: nf.append((fx, fy, fw, y - fy))
            if y + h < fy + fh: nf.append((fx, y + h, fw, fy + fh - y - h))
        # prune contained rects
        nf.sort(key=lambda r: -r[2] * r[3]); keep = []
        for r in nf:
            if not any(r[0] >= k[0] and r[1] >= k[1] and r[0] + r[2] <= k[0] + k[2] and r[1] + r[3] <= k[1] + k[3] for k in keep):
                keep.append(r)
        self.free = keep
        self.used_w = max(self.used_w, x + w); self.used_h = max(self.used_h, y + h)

    def insert_all(self, sizes):
        """Place every (w, h) or none (rollback). Returns positions or None."""
        saved = (list(self.free), self.used_w, self.used_h); out = []
        for w, h in sizes:
            p = self.find(w, h)
            if p is None:
                self.free, self.used_w, self.used_h = saved; return None
            self.place(p[0], p[1], w, h); out.append(p)
        return out

def even(v): return v + (v & 1)

def pack_group(fams):
    """fams: family results. Assigns each item a (page, x, y). Returns list of pages (MaxRects).
    A group that fits on one page gets the smallest roughly square page it fits on; otherwise PAGE_MAX pages."""
    total = sum((even(it['b'].shape[1]) + 2 * PAD) * (even(it['b'].shape[0]) + 2 * PAD) for F in fams for it in F['items'])
    side = int(math.sqrt(total * 1.05)) + 2
    while side < PAGE_MAX:
        try: return _pack(fams, side)
        except OverflowError: side = int(side * 1.06) + 2
    return _pack(fams, PAGE_MAX, many=True)

def _pack(fams, side, many=False):
    pages = []
    order = sorted(range(len(fams)), key=lambda i: -max([0] + [it['b'].shape[0] * it['b'].shape[1] for it in fams[i]['items']]))
    for fi in order:
        F = fams[fi]
        if not F['items']: continue
        idx = sorted(range(len(F['items'])), key=lambda k: -F['items'][k]['b'].shape[0])
        sizes = [(even(F['items'][k]['b'].shape[1]) + 2 * PAD, even(F['items'][k]['b'].shape[0]) + 2 * PAD) for k in idx]
        pos = None
        for pi, pg in enumerate(pages):
            pos = pg.insert_all(sizes)
            if pos: break
        if pos is None:
            if pages and not many: raise OverflowError
            pg = MaxRects(side, side); pos = pg.insert_all(sizes)
            if pos is None and not many: raise OverflowError
            if pos is None: raise SystemExit(f'{F["names"]}: does not fit on one {PAGE_MAX} page')
            pages.append(pg); pi = len(pages) - 1
        for k, (x, y) in zip(idx, pos): F['items'][k]['at'] = (pi, x + PAD, y + PAD)
    return pages

def blit(page, block, x, y, pad):
    blk = np.pad(block, ((pad, pad), (pad, pad)) + (((0, 0),) if block.ndim == 3 else ()), mode='edge')
    page[y - pad:y - pad + blk.shape[0], x - pad:x - pad + blk.shape[1]] = blk

def encode(args):
    arr, path, kind = args
    t = time.time()
    mode = {2: 'L', 3: 'RGB', 4: 'RGBA'}[arr.shape[2] if arr.ndim == 3 else 2]
    orig = arr
    if kind in QUANT:
        q = QUANT[kind]; arr = np.clip(np.round(arr.astype(np.float32) / q) * q, 0, 255).astype(np.uint8)
    im = Image.fromarray(arr, mode)
    if mode == 'L': im = im.convert('RGB')
    im.save(path, 'WEBP', **WEBP[kind])
    # encoding error over the visible pixels (beauty) / everything (maps)
    dec = np.asarray(Image.open(path).convert(im.mode)).astype(np.int16)
    src = orig.astype(np.int16)
    if src.ndim == 2: src = np.repeat(src[..., None], 3, -1)
    if kind == 'b':
        vis = src[..., 3] > 0
        a = src[..., 3:] / 255; da = dec[..., 3:] / 255
        e = np.abs(src[..., :3] * a - dec[..., :3] * da).max(-1)[vis] if vis.any() else np.zeros(1)
    else:
        e = np.abs(src - dec).max(-1).ravel()
    return path, kind, os.path.getsize(path), float(e.max()), float(np.percentile(e, 99.9)), float(e.mean()), time.time() - t

# ----------------------------------------------------------------------------------------------------
def r2(v): return round(float(v), 2)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('groups', nargs='*'); ap.add_argument('--jobs', type=int, default=os.cpu_count())
    ap.add_argument('--keep-png', action='store_true', help='also save the pages before encoding as PNG in build/pack/ (to check the encoding)')
    args = ap.parse_args()
    manifest = json.load(open(os.path.join(RAW, 'manifest.json')))
    meta = manifest.get('_meta', {})
    all_groups = sorted({group_of(k) for k in manifest if k != '_meta'})
    groups = args.groups or all_groups
    for g in groups:
        if g not in all_groups: raise SystemExit(f'unknown group {g!r} (have: {", ".join(all_groups)})')
    out_json = os.path.join(OUT, 'sprites.json')
    data = json.load(open(out_json)) if os.path.exists(out_json) else {}
    data.setdefault('meta', {}); data.setdefault('sprites', {})
    data['meta'].update({'version': 1, 'elevation': meta.get('elevation', 50.0), 'heightRange': meta.get('heightRange', 4.0),
                         'rawPpu': RAW_PPU, 'mapScale': MAP_SCALE, 'pad': PAD})
    data['meta'].setdefault('pages', {})
    if not args.groups:                                  # full run: forget groups that are gone
        data['meta']['pages'] = {g: v for g, v in data['meta']['pages'].items() if g in all_groups}
        data['sprites'] = {k: v for k, v in data['sprites'].items() if v.get('group') in all_groups}
    T = {'load+scale': 0, 'delta': 0, 'pack': 0, 'compose': 0, 'encode': 0}
    report, warnings = [], []
    pool = Pool(args.jobs)
    for g in groups:
        t_g = time.time()
        names = sorted(k for k in manifest if k != '_meta' and group_of(k) == g)
        fams, passthrough = {}, []
        for n in names:
            e = manifest[n]
            if not e.get('files'): passthrough.append(n); continue
            miss = [f for f in e['files'] if not os.path.exists(os.path.join(RAW, f + '.png'))]
            if miss: warnings.append(f'{n}: {len(miss)} missing file(s), e.g. {miss[0]}.png: skipped'); continue
            ppu = ppu_for(n, e)
            fams.setdefault(family_key(n, e, ppu), []).append(n)
        jobs = []
        for key, ns in fams.items():
            ents = [manifest[n] for n in ns]
            maps = ''.join(k for k in 'nhm' if any(os.path.exists(os.path.join(RAW, f + '.' + k + '.png')) for e in ents for f in e['files']))
            jobs.append({'names': ns, 'entries': ents, 'ppu': key[-1], 'maps': maps})
        jobs.sort(key=lambda j: -sum(len(e['files']) * e['w'] * e['h'] for e in j['entries']))
        res = []
        for r in pool.imap_unordered(process_family, jobs):
            r['maps'] = next(j['maps'] for j in jobs if j['names'] == r['names']); res.append(r)
            T['load+scale'] += r['t_load']; T['delta'] += r['t_delta']
        res.sort(key=lambda r: r['names'][0])
        t = time.time(); pages = pack_group(res); T['pack'] += time.time() - t
        # compose pages
        t = time.time()
        gmaps = ''.join(k for k in 'nhm' if any(k in r['maps'] for r in res))
        pdims = [(even(pg.used_w), even(pg.used_h)) for pg in pages]
        P = []
        for (w, h) in pdims:
            d = {'b': np.zeros((h, w, 4), np.uint8)}
            if 'n' in gmaps: d['n'] = np.empty((h // 2, w // 2, 3), np.uint8); d['n'][...] = FLAT_NORMAL
            if 'h' in gmaps: d['h'] = np.zeros((h // 2, w // 2), np.uint8)
            if 'm' in gmaps: d['m'] = np.zeros((h, w), np.uint8)
            P.append(d)
        for r in res:
            for it in r['items']:
                pi, x, y = it['at']
                blit(P[pi]['b'], it['b'], x, y, PAD)
                for k in gmaps:
                    if k in it: blit(P[pi][k], it[k], x // 2 if k in 'nh' else x, y // 2 if k in 'nh' else y, PAD // 2 if k in 'nh' else PAD)
        T['compose'] += time.time() - t
        # old pages of this group go
        gdir = os.path.join(OUT, g); os.makedirs(gdir, exist_ok=True)
        for fn in os.listdir(gdir):
            if re.match(r'page\d+\.([nhm]\.)?webp$', fn): os.remove(os.path.join(gdir, fn))
        enc_jobs = []
        for pi, d in enumerate(P):
            for k, arr in d.items():
                enc_jobs.append((arr, os.path.join(gdir, f'page{pi}' + ('' if k == 'b' else '.' + k) + '.webp'), k))
        if args.keep_png:
            kdir = os.path.join(ROOT, 'build', 'pack', g); os.makedirs(kdir, exist_ok=True)
            for arr, path, k in enc_jobs: Image.fromarray(arr).save(os.path.join(kdir, os.path.basename(path)[:-5] + '.png'))
        t = time.time()
        enc = pool.map(encode, sorted(enc_jobs, key=lambda j: -j[0].size))
        T['encode'] += time.time() - t
        # sprites.json entries
        data['sprites'] = {k: v for k, v in data['sprites'].items() if v.get('group') != g}
        data['meta']['pages'][g] = [{'file': f'{g}/page{pi}', 'w': w, 'h': h, 'maps': gmaps} for pi, (w, h) in enumerate(pdims)]
        maxerr = 0.0; nframes = ndelta = 0; trim_px = stored_px = 0
        for r in res:
            maxerr = max(maxerr, r['maxerr']); nframes += r['nframes']; ndelta += r['delta']; trim_px += r['trim_px']; stored_px += r['stored_px']
            for (ni, fi) in r['empty']: warnings.append(f'{r["names"][ni]} frame {fi}: empty image')
            s, W, H = r['scale'], r['W'], r['H']
            def rect(item_bb):
                k, (x0, y0, x1, y1) = item_bb
                pi, x, y = r['items'][k]['at']
                e0 = manifest[r['names'][0]]
                return [pi, x, y, x1 - x0, y1 - y0, r2(e0['ox'] * s - x0), r2(e0['oy'] * s - y0)]
            ent = {}
            for ni, n in enumerate(r['names']):
                e = manifest[n]
                ent[n] = {'group': g, 'ppu': r['ppu'] if r['ppu'] else RAW_PPU, 'w': W, 'h': H, 'ox': r2(e['ox'] * s), 'oy': r2(e['oy'] * s),
                          'dirs': e.get('dirs', 1), 'frames': e.get('frames', 1), 'maps': r['maps'], 'f': [], 'bases': []}
                if r['ppu'] is None: ent[n]['native'] = True
                for k, v in e.items():
                    if k not in ('w', 'h', 'ox', 'oy', 'dirs', 'frames', 'files'): ent[n][k] = v
            for i, sp in enumerate(r['specs']):
                ni, fi = r['owner'][i]; E = ent[r['names'][ni]]
                if sp[0] == 'empty': E['f'].append(None); continue
                if sp[0] == 'whole': E['f'].append(rect(sp[1])); continue
                _, j, item_bb, over = sp
                brect = rect(r['specs'][j][1])
                if brect not in E['bases']: E['bases'].append(brect)
                bi = E['bases'].index(brect)
                if item_bb is None: E['f'].append([brect[0], 0, 0, 0, 0, 0, 0, bi, 1])
                else: E['f'].append(rect(item_bb) + [bi, 1 if over else 0])
            for n, v in ent.items():
                if not v['bases']: del v['bases']
                data['sprites'][n] = v
        for n in passthrough:
            e = manifest[n]
            data['sprites'][n] = {'group': g, **{k: v for k, v in e.items() if k != 'files'}, 'f': []}
        raw_bytes = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(os.path.join(RAW, g)) for fn in fns if fn.endswith('.png'))
        out_bytes = sum(x[2] for x in enc)
        report.append({'group': g, 'sprites': len(names), 'frames': nframes, 'delta': ndelta, 'pages': len(pages),
                       'page_dims': pdims, 'raw_mb': raw_bytes / 1e6, 'out_mb': out_bytes / 1e6, 'maxerr': maxerr,
                       'trim_px': trim_px, 'stored_px': stored_px,
                       'enc': {k: (max(x[3] for x in enc if x[1] == k), max(x[4] for x in enc if x[1] == k)) for k in {x[1] for x in enc}},
                       'bytes': {k: sum(x[2] for x in enc if x[1] == k) / 1e6 for k in {x[1] for x in enc}},
                       'secs': time.time() - t_g})
        print(f'[pack] {g}: {len(names)} sprites, {nframes} frames ({ndelta} as patches), {len(pages)} page(s) {pdims}, '
              f'{raw_bytes / 1e6:.1f} MB -> {out_bytes / 1e6:.2f} MB, delta max error {maxerr:.1f}/255, {time.time() - t_g:.1f}s', flush=True)
    pool.close()
    # Several packs may run at once (one group each): under a lock, re-read sprites.json and replace only
    # the groups packed here, so a parallel run's groups aren't lost.
    import fcntl
    os.makedirs(OUT, exist_ok=True)
    with open(out_json + '.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        cur = json.load(open(out_json)) if os.path.exists(out_json) else {}
        cur.setdefault('meta', {}); cur.setdefault('sprites', {}); cur['meta'].setdefault('pages', {})
        cur['meta'].update({k: v for k, v in data['meta'].items() if k != 'pages'})
        cur['sprites'] = {k: v for k, v in cur['sprites'].items() if v.get('group') not in groups}
        cur['sprites'].update({k: v for k, v in data['sprites'].items() if v.get('group') in groups})
        for g in groups: cur['meta']['pages'][g] = data['meta']['pages'][g]
        cur['sprites'] = dict(sorted(cur['sprites'].items()))
        cur['meta']['pages'] = dict(sorted(cur['meta']['pages'].items()))
        tmp = out_json + '.tmp'
        with open(tmp, 'w') as f: json.dump(cur, f, separators=(',', ':'))
        os.replace(tmp, out_json)
    with open(os.path.join(RAW, 'pack_report.json'), 'w') as f: json.dump({'groups': report, 'times': T, 'warnings': warnings}, f, indent=1)
    for w in warnings: print('[pack] warning:', w)
    print('[pack] time per step (summed over workers):', ', '.join(f'{k} {v:.1f}s' for k, v in T.items()))
    print(f'[pack] wrote {out_json} ({os.path.getsize(out_json) / 1e3:.0f} kB)')

if __name__ == '__main__':
    main()
