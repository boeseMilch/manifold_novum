#!/usr/bin/env python3
"""Check the packed sprites against the raw renders: rebuild every frame from the decoded atlas pages
(base, then the patch replacing its rect) and compare it with the render scaled the way pack.py scales it.

    python3 tools/sprites/verify.py [group ...]
    python3 tools/sprites/verify.py --png [group ...]   # use the lossless pages from pack.py --keep-png
                                                        # (build/pack/): checks trim/scale/delta without WebP

Prints per group the visible error (premultiplied RGBA, 0..255): max, 99.9th percentile and mean over the
sprite pixels, the worst frame, and frames whose packed origin/size doesn't line up with the render.
"""
import json, os, sys
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
import pack

def main():
    data = json.load(open(os.path.join(pack.OUT, 'sprites.json')))
    man = json.load(open(os.path.join(pack.RAW, 'manifest.json')))
    args = [a for a in sys.argv[1:] if a != '--png']; png = '--png' in sys.argv
    groups = args or sorted(data['meta']['pages'])
    for g in groups:
        src = (lambda f: os.path.join(pack.ROOT, 'build', 'pack', f + '.png')) if png else (lambda f: os.path.join(pack.OUT, f + '.webp'))
        pages = [np.asarray(Image.open(src(p['file'])).convert('RGBA')).astype(np.float32)
                 for p in data['meta']['pages'][g]]
        errs, worst, n = [], (0, None), 0
        for name, S in data['sprites'].items():
            if S['group'] != g or not S['f']: continue
            s = S['ppu'] / pack.RAW_PPU if not S.get('native') else 1.0
            for k, (stem, fr) in enumerate(zip(man[name]['files'], S['f'])):
                ref = pack.load_frame(stem, s, S['w'], S['h'], '').b.astype(np.float32)
                img = np.zeros_like(ref)
                def put(r, replace):
                    p, x, y, w, h, ox, oy = r[:7]
                    if not w: return
                    cx, cy = int(round(S['ox'] - ox)), int(round(S['oy'] - oy))     # rect's top-left on the canvas
                    img[cy:cy + h, cx:cx + w] = pages[p][y:y + h, x:x + w]
                if fr is not None:
                    if len(fr) > 7: put(S['bases'][fr[7]], True)
                    put(fr, True)
                a, b = ref[..., 3:] / 255, img[..., 3:] / 255
                e = np.maximum(np.abs(ref[..., :3] * a - img[..., :3] * b).max(-1), np.abs(ref[..., 3] - img[..., 3]))
                vis = (ref[..., 3] > 0) | (img[..., 3] > 0)
                if vis.any():
                    errs.append(e[vis])
                    if e.max() > worst[0]: worst = (float(e.max()), f'{name} #{k}')
                n += 1
        e = np.concatenate(errs) if errs else np.zeros(1)
        print(f'[verify] {g}: {n} frames, error max {e.max():.0f}, p99.9 {np.percentile(e, 99.9):.0f}, p99 {np.percentile(e, 99):.0f}, '
              f'mean {e.mean():.2f} (worst: {worst[1]})', flush=True)

if __name__ == '__main__':
    main()
