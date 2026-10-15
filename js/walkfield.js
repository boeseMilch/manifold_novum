// Where the crew walk: a travel-direction field over the floor, for the hairline floor scratches
// (boot scuffs follow the paths people take; js/gfx.js FLOOR_WEAR). Computed once, on first use.
//
// How: the floor (FLOOR_RECTS: rooms, doorways, deck airlock chambers, all doors open) on a fine grid
// (WF_RES), minus everything solid (SOLIDS, grown by a body radius). A list of destinations
// (WALK_DESTS: doorways' rooms, deck airlocks, outer hatches, consoles, the reactor, the cannon ladders,
// the kitchen, the cat, ...), each with a weight for how often someone goes there. Shortest paths between every
// pair (Dijkstra from each destination, 8 neighbours; a step costs more near walls, so people keep
// to the middle of a corridor), weighted by the product of both ends' weights, smoothed (people don't
// walk in grid steps), then laid onto the grid: per fine cell the traffic and the doubled-angle
// direction (scratches are axial: east = west). Blurred a little (no one walks the exact same line).
// Per 1 x 1 plate cell (what the shader uses): its direction, a strength (traffic x how aligned it is:
// a doorway is all one way, a room's middle crossed every which way), and near crates the direction
// they'd be shoved in (box scuffs).
//
// Debug: ?walkfield or the debug menu (G) draws it over the ship (drawWalkFieldDebug).

const WF_RES = 0.2, WF_BODY = 0.25;
// destinations: [x, y, weight, what]; a point in front of the thing (snapped to the nearest free cell)
const WALK_DESTS = () => [
  ...ROOMS.map(r => { const c = typeof NAV_SPOTS !== 'undefined' && NAV_SPOTS[r.id] || roomCenter(r); return [c[0], c[1], 1.0, r.id]; }),
  ...DECK_LOCKS.flatMap(L => [[L.x + L.w / 2, SPINE_Y0 - 0.4, 0.8, 'lock top'], [L.x + L.w / 2, SPINE_Y1 + 0.4, 0.8, 'lock bottom']]),
  ...HATCHES.map(h => [h.inside[0], h.inside[1], 0.8, 'hatch']),
  ...STATIONS.map(s => [s.x, s.y + 0.9, 1.2, s.name]),
  [REACTOR.x, REACTOR.y + REACTOR.h / 2 + 0.5, 1.4, 'reactor front'],
  [CAT.x - 0.6, CAT.y + 0.7, 1.5, 'cat'],                       // (asleep in its corner, never moves: everyone stops by to pet it)
  ...GUNS.map(g => [g.hatch[0], g.hatch[1], 1.0, 'ladder ' + g.id]),
  ...(typeof SHIELD_BUTTONS !== 'undefined' ? SHIELD_BUTTONS.map(b => [b.x, b.y + 0.8, 0.6, 'shield ' + b.side]) : []),
  ...CAPACITORS.map(c => [c.x, c.y + (c.y > 20 ? -0.9 : 0.9), 0.5, 'capacitor ' + c.room]),
  ...(typeof LEVER !== 'undefined' ? [[LEVER.x, LEVER.y - 0.8, 0.7, 'lever']] : []),
  ...(typeof FUEL_CRATE !== 'undefined' ? [[FUEL_CRATE.x + 0.9, FUEL_CRATE.y, 0.6, 'fuel crate']] : []),
  ...(typeof PATCH_BOARD !== 'undefined' ? [[PATCH_BOARD.x, PATCH_BOARD.y - 0.6, 0.4, 'patch board']] : []),
  ...(typeof COFFEE_MUG !== 'undefined' ? [[COFFEE_MUG.x, COFFEE_MUG.y - 0.7, 1.2, 'coffee']] : []),
  ...(typeof SNACK !== 'undefined' ? [[SNACK.x, SNACK.y + 0.8, 0.8, 'snack machine']] : []),
  [FURNITURE.fridge.x + 0.6, FURNITURE.fridge.y - 0.5, 0.5, 'fridge'],
  [FURNITURE.table.x + 0.5, FURNITURE.table.y + 1.6, 0.5, 'table'],
  [FURNITURE.bunks.x + 1.4, FURNITURE.bunks.y + FURNITURE.bunks.h + 0.5, 0.6, 'bunks'],
  [FURNITURE.lockers.x + 0.7, FURNITURE.lockers.y + 1.2, 0.5, 'lockers'],
  [FURNITURE.toilet.x + 0.4, FURNITURE.toilet.y + 1.4, 0.5, 'toilet'],
  [TREADMILL.x + 0.3, TREADMILL.y + TREADMILL.h + 0.4, 0.3, 'treadmill'],
  [FURNITURE.couch.x - 0.5, FURNITURE.couch.y + 1.1, 0.4, 'couch'],
];
// crates and the like that get shoved about: box scuffs around them, along their axes
const WALK_BOXES = () => ['ammoPort', 'blankPort', 'snax', 'ammoStar', 'toolbox', 'misc', 'platesA', 'coolant', 'fuel', 'tape', 'platesB', 'blankStar', 'weightRack']
  .map(k => CLUTTER[k]).filter(Boolean);

let WALK_FIELD = null;
function walkField() {
  if (WALK_FIELD) return WALK_FIELD;
  const rects = FLOOR_RECTS;
  const X0 = Math.floor(Math.min(...rects.map(r => r.x))), Y0 = Math.floor(Math.min(...rects.map(r => r.y)));
  const X1 = Math.ceil(Math.max(...rects.map(r => r.x + r.w))), Y1 = Math.ceil(Math.max(...rects.map(r => r.y + r.h)));
  const W = Math.round((X1 - X0) / WF_RES), H = Math.round((Y1 - Y0) / WF_RES), N = W * H;
  const cx = (i) => X0 + (i + 0.5) * WF_RES, cy = (j) => Y0 + (j + 0.5) * WF_RES;
  const inR = (x, y, r) => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
  const onR = (x, y, r) => x >= r.x - 1e-6 && x <= r.x + r.w + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.h + 1e-6;   // (floor pieces touch: a cell on the seam is floor)
  // clearance: distance to the nearest non-floor or solid (chamfer distance transform)
  const clear = new Float32Array(N);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = cx(i), y = cy(j);
    clear[j * W + i] = rects.some(r => onR(x, y, r)) && !SOLIDS.some(r => inR(x, y, r)) ? 1e9 : 0;
  }
  const D1 = WF_RES, D2 = WF_RES * Math.SQRT2;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i; let v = clear[k];
    if (i > 0) v = Math.min(v, clear[k - 1] + D1);
    if (j > 0) { v = Math.min(v, clear[k - W] + D1); if (i > 0) v = Math.min(v, clear[k - W - 1] + D2); if (i < W - 1) v = Math.min(v, clear[k - W + 1] + D2); }
    if (i === 0 || j === 0 || i === W - 1 || j === H - 1) v = Math.min(v, D1 / 2);
    clear[k] = v;
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i; let v = clear[k];
    if (i < W - 1) v = Math.min(v, clear[k + 1] + D1);
    if (j < H - 1) { v = Math.min(v, clear[k + W] + D1); if (i < W - 1) v = Math.min(v, clear[k + W + 1] + D2); if (i > 0) v = Math.min(v, clear[k + W - 1] + D2); }
    clear[k] = v;
  }
  const free = (k) => clear[k] >= WF_BODY;
  const stepCost = new Float32Array(N);              // per unit length: dearer near walls and furniture
  for (let k = 0; k < N; k++) stepCost[k] = 1 + 1.5 * Math.exp(-(clear[k] - WF_BODY) / 0.35);
  // destinations, snapped to the nearest free cell
  const snap = (x, y) => {
    let best = -1, bd = Infinity;
    const i0 = Math.floor((x - X0) / WF_RES), j0 = Math.floor((y - Y0) / WF_RES);
    for (let j = Math.max(0, j0 - 12); j <= Math.min(H - 1, j0 + 12); j++) for (let i = Math.max(0, i0 - 12); i <= Math.min(W - 1, i0 + 12); i++) {
      const k = j * W + i; if (!free(k)) continue;
      const d = (cx(i) - x) ** 2 + (cy(j) - y) ** 2; if (d < bd) { bd = d; best = k; }
    }
    return best;
  };
  const dests = WALK_DESTS().map(([x, y, w, name]) => ({ x, y, w, name, k: snap(x, y) })).filter(d => d.k >= 0);
  // Dijkstra from each destination (binary heap)
  const dist = new Float32Array(N), prev = new Int32Array(N);
  const heapK = new Int32Array(N * 8), heapD = new Float32Array(N * 8);
  const traffic = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
  const sight = (ka, kb) => {                         // straight line ka -> kb keeps its distance from walls and furniture
    const ia = ka % W, ja = (ka - ia) / W, ib = kb % W, jb = (kb - ib) / W, m = Math.ceil(Math.hypot(ib - ia, jb - ja) * 2);
    for (let q = 1; q < m; q++) { const k = Math.round(ja + (jb - ja) * q / m) * W + Math.round(ia + (ib - ia) * q / m); if (clear[k] < WF_BODY + 0.15) return false; }
    return true;
  };
  const PX = new Float32Array(N * 4), PY = new Float32Array(N * 4), QX = new Float32Array(N * 4), QY = new Float32Array(N * 4);
  const lay = (n, w) => {                            // a path (PX, PY: n points) smoothed, then onto the grid
    let ax = PX, ay = PY, bx = QX, by = QY, t;
    const R = 6;
    for (let pass = 0; pass < 3; pass++) {          // moving average over 2R + 1 points (a running sum), the ends held
      let sx = 0, sy = 0;
      for (let o = -R; o <= R; o++) { const q = o < 0 ? 0 : o > n - 1 ? n - 1 : o; sx += ax[q]; sy += ay[q]; }
      for (let i = 0; i < n; i++) {
        bx[i] = sx / (2 * R + 1); by[i] = sy / (2 * R + 1);
        const qo = i - R < 0 ? 0 : i - R, qi = i + R + 1 > n - 1 ? n - 1 : i + R + 1;
        sx += ax[qi] - ax[qo]; sy += ay[qi] - ay[qo];
      }
      bx[0] = ax[0]; by[0] = ay[0]; bx[n - 1] = ax[n - 1]; by[n - 1] = ay[n - 1];
      t = ax; ax = bx; bx = t; t = ay; ay = by; by = t;
    }
    for (let i = 0; i + 1 < n; i++) {
      const dx = ax[i + 1] - ax[i], dy = ay[i + 1] - ay[i], L2 = dx * dx + dy * dy;
      if (L2 < 1e-12) continue;
      const L = Math.sqrt(L2), c = (dx * dx - dy * dy) / L2, s = 2 * dx * dy / L2;   // doubled angle
      const ii = Math.floor(((ax[i] + ax[i + 1]) / 2 - X0) / WF_RES), jj = Math.floor(((ay[i] + ay[i + 1]) / 2 - Y0) / WF_RES);
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const k = jj * W + ii, a = w * L;
      traffic[k] += a; vx[k] += a * c; vy[k] += a * s;
    }
  };
  const FREE = new Uint8Array(N);
  for (let k = 0; k < N; k++) FREE[k] = free(k) ? 1 : 0;
  const NO = [1, -1, W, -W, W + 1, -W + 1, W - 1, -W - 1], NL = [D1, D1, D1, D1, D2, D2, D2, D2];
  const CA = [0, 0, 0, 0, 1, 1, -1, -1], CB = [0, 0, 0, 0, W, -W, W, -W];
  for (let si = 0; si < dests.length; si++) {
    dist.fill(Infinity); prev.fill(-1);
    let hn = 0;
    const push = (k, d) => { let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (heapD[p] <= d) break; heapK[i] = heapK[p]; heapD[i] = heapD[p]; i = p; } heapK[i] = k; heapD[i] = d; };
    const pop = () => {
      const k = heapK[0], lk = heapK[--hn], ld = heapD[hn]; let i = 0;
      for (;;) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && heapD[c + 1] < heapD[c]) c++; if (heapD[c] >= ld) break; heapK[i] = heapK[c]; heapD[i] = heapD[c]; i = c; }
      heapK[i] = lk; heapD[i] = ld; return k;
    };
    const s = dests[si].k; dist[s] = 0; push(s, 0);
    while (hn > 0) {
      const d0 = heapD[0], k = pop();
      if (d0 > dist[k]) continue;
      const i = k % W, j = (k - i) / W;
      if (i === 0 || j === 0 || i === W - 1 || j === H - 1) continue;   // (the border is never floor)
      const ck = stepCost[k];
      for (let m = 0; m < 8; m++) {
        const nk = k + NO[m];
        if (!FREE[nk] || (m >= 4 && (!FREE[k + CA[m]] || !FREE[k + CB[m]]))) continue;   // (no cutting corners)
        const nd = d0 + NL[m] * (ck + stepCost[nk]) / 2;
        if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = k; push(nk, nd); }
      }
    }
    for (let ti = si + 1; ti < dests.length; ti++) {
      let k = dests[ti].k; if (!isFinite(dist[k])) continue;
      const path = [];
      while (k >= 0) { path.push(k); k = prev[k]; }
      if (path.length < 2) continue;
      // straighten: from each corner, on to the farthest path cell still in plain sight (people walk
      // straight at where they're going, not in grid steps), then resample every WF_RES / 2
      const vs = [path[0]];
      for (let a = 0; a < path.length - 1;) {
        let b = a + 1, st = 1;                       // (gallop, then halve: the farthest one in sight, near enough)
        while (b + st < path.length && sight(path[a], path[b + st])) { b += st; st *= 2; }
        for (st >>= 1; st > 0; st >>= 1) if (b + st < path.length && sight(path[a], path[b + st])) b += st;
        vs.push(path[b]); a = b;
      }
      let n = 0;
      for (let v = 0; v + 1 < vs.length; v++) {
        const ia = vs[v] % W, ib = vs[v + 1] % W, ax = cx(ia), ay = cy((vs[v] - ia) / W), bx = cx(ib), by = cy((vs[v + 1] - ib) / W);
        const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (WF_RES / 2)));
        for (let q = 0; q < m; q++) { PX[n] = ax + (bx - ax) * q / m; PY[n] = ay + (by - ay) * q / m; n++; }
      }
      const il = vs[vs.length - 1] % W; PX[n] = cx(il); PY[n] = cy((vs[vs.length - 1] - il) / W); n++;
      lay(n, dests[si].w * dests[ti].w);
    }
  }
  // blur (separable gaussian, sigma 0.3): nobody walks the exact same line
  const blur = (a) => {
    const R = 4, sg = 0.3 / WF_RES, ker = []; let ks = 0;
    for (let o = -R; o <= R; o++) { const v = Math.exp(-o * o / (2 * sg * sg)); ker.push(v); ks += v; }
    const t = new Float32Array(N);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let v = 0; for (let o = -R; o <= R; o++) { const ii = i + o; if (ii >= 0 && ii < W) v += a[j * W + ii] * ker[o + R]; } t[j * W + i] = v / ks; }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let v = 0; for (let o = -R; o <= R; o++) { const jj = j + o; if (jj >= 0 && jj < H) v += t[jj * W + i] * ker[o + R]; } a[j * W + i] = free(j * W + i) || clear[j * W + i] > 0 ? v / ks : 0; }
  };
  blur(traffic); blur(vx); blur(vy);
  // per 1 x 1 plate cell: direction, strength; box scuffs
  const cells = new Map(), boxes = WALK_BOXES();
  const tv = [...traffic].filter(v => v > 0).sort((a, b) => a - b), tRef = tv.length ? tv[Math.floor(tv.length * 0.9)] : 1;
  for (let gy = Y0; gy < Y1; gy++) for (let gx = X0; gx < X1; gx++) {
    let t = 0, x = 0, y = 0;
    const n = Math.round(1 / WF_RES), i0 = Math.round((gx - X0) / WF_RES), j0 = Math.round((gy - Y0) / WF_RES);
    for (let j = j0; j < j0 + n; j++) for (let i = i0; i < i0 + n; i++) if (i < W && j < H) { const k = j * W + i; t += traffic[k]; x += vx[k]; y += vy[k]; }
    t /= n * n; x /= n * n; y /= n * n;
    const coh = t > 0 ? Math.hypot(x, y) / t : 0, busy = Math.min(1, t / tRef);
    let box = 0, boxAng = 0;
    for (const b of boxes) {                         // nearest crate: shoved along whichever of its axes faces this cell
      const px = gx + 0.5 - b.x, py = gy + 0.5 - b.y, ca = Math.cos(b.a), sa = Math.sin(b.a);
      const u = px * ca + py * sa, v = -px * sa + py * ca;
      const du = Math.max(0, Math.abs(u) - b.w / 2), dv = Math.max(0, Math.abs(v) - b.h / 2), d = Math.hypot(du, dv);
      const k = Math.exp(-d * d / 0.5);
      if (k > box) { box = k; boxAng = du > dv ? b.a : b.a + Math.PI / 2; }
    }
    if (t > 0 || box > 0.05) cells.set(gx + ',' + gy, { ang: Math.atan2(y, x) / 2, str: coh * Math.sqrt(busy), coh, busy, box, boxAng: ((boxAng % Math.PI) + Math.PI) % Math.PI });
  }
  return WALK_FIELD = { X0, Y0, W, H, res: WF_RES, traffic, vx, vy, tRef, cells, dests, free };
}

// --- debug overlay (?walkfield, or the debug menu) --------------------------------------------------
let walkFieldShow = typeof location !== 'undefined' && /[?&]walkfield\b/.test(location.search || '');
function drawWalkFieldDebug() {
  if (!walkFieldShow || typeof ctx === 'undefined') return;
  const F = walkField(), s = T;
  ctx.save();
  for (let j = 0; j < F.H; j++) for (let i = 0; i < F.W; i++) {   // traffic heat
    const k = j * F.W + i, v = Math.min(1, F.traffic[k] / F.tRef);
    if (v < 0.02) continue;
    ctx.fillStyle = `hsla(${240 - 240 * v}, 90%, 50%, ${0.15 + 0.4 * v})`;
    ctx.fillRect((F.X0 + i * F.res) * s, (F.Y0 + j * F.res) * s, F.res * s + 0.5, F.res * s + 0.5);
  }
  ctx.lineCap = 'round';
  for (const [key, c] of F.cells) {                 // per plate cell: the direction (axial), long and bright = strong
    const [gx, gy] = key.split(',').map(Number), mx = (gx + 0.5) * s, my = (gy + 0.5) * s;
    if (c.str > 0.03) {
      const L = (0.1 + 0.38 * c.str) * s, dx = Math.cos(c.ang) * L, dy = Math.sin(c.ang) * L;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.65 * c.str})`; ctx.lineWidth = 1.5 + 2.5 * c.str;
      ctx.beginPath(); ctx.moveTo(mx - dx, my - dy); ctx.lineTo(mx + dx, my + dy); ctx.stroke();
    }
    if (c.box > 0.15) {                               // box scuffs: magenta, across
      const L = 0.3 * c.box * s, dx = Math.cos(c.boxAng) * L, dy = Math.sin(c.boxAng) * L;
      ctx.strokeStyle = `rgba(255,80,255,${0.4 + 0.6 * c.box})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(mx - dx, my - dy); ctx.lineTo(mx + dx, my + dy); ctx.stroke();
    }
  }
  ctx.font = `600 ${s * 0.22}px system-ui, sans-serif`; ctx.textAlign = 'center';
  for (const d of F.dests) {                         // the destinations (size = weight)
    const i = d.k % F.W, x = (F.X0 + (i + 0.5) * F.res) * s, y = (F.Y0 + ((d.k - i) / F.W + 0.5) * F.res) * s;
    ctx.beginPath(); ctx.arc(x, y, s * 0.08 * (1 + d.w), 0, Math.PI * 2); ctx.fillStyle = '#ffd34a'; ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffe9a0'; ctx.fillText(d.name, x, y - s * 0.2);
  }
  ctx.restore();
}
