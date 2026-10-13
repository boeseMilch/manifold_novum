// The power lines in the sprite view (GFX on): lit 3D cables plus the Blender fittings they plug into.
// The routes, fittings and gameplay are in js/systems.js (POWER_LINES, POWER_FITTINGS, linePoint); ?classic
// draws them flat (drawPowerLines there).
//
// Cable: an armoured cable lying on the floor (radius CABLE_R), drawn by the game because the routes are free
// polylines: each visible stretch of a line (l.runs) is rasterized once, in pieces of ~3 units, into canvas
// sprites with a normal and a height map (a tube profile, steel ribs every RIB units, a dark outline and a soft
// contact shadow), so the runtime lights shade it and it casts small shadows. Along its top runs an indicator
// window that shows the line's state: amber (and self-lit) while the line is live, dim amber on the lever's
// branches it isn't on (idle), dark when it has no charge,
// dark red when its capacitor is broken; the flowing dashes and the pulses stay in the 'glow' layer on top of
// it (drawPowerGlow, drawEnergyBolts), so the state reads like before. The canvas is the ground projection (the
// tube is not lifted on screen), so those 2D glows sit exactly on the window. Drawn in the 'decal' layer:
// walls, machines and the crew cover it; the stretches inside walls aren't drawn at all.
// Fittings (tools/blender/models/power/fittings.py): power/plug_* (machine sockets), power/gland_* (on the power
// lever's dial: the trunk from the reactor goes in, the three branches to the capacitors come out), power/box_* and
// power/riser_* (wall boxes), power/jack_* (outside: wall outlet → cannon mount), power/clamp (straps holding
// the cable down every CLAMP_EVERY units). Each has _on (LED / window lit: line live) and _off.

const CABLE_R = 0.095, CABLE_PPU = 96, RIB = 0.075, CLAMP_EVERY = 3.2;
const CABLE_COL = {
  jacket: [61, 67, 82], rib: [125, 134, 150], outline: [20, 22, 27],
  live: [255, 190, 72], idle: [128, 100, 52], off: [74, 63, 44], dead: [96, 38, 32],
};
const CABLES = {};                                   // per piece of a run: { D, x0, y0, img, win, winShade, state } (null: GFX off)
const PIECE_LEN = 3, BUILDS_PER_FRAME = 4;            // runs are rasterized in pieces (small canvases), a few per frame
let cableBuilds = 0;

// 'live' | 'idle' (a lever branch it isn't on: dimmed) | 'off' | 'dead' (js/systems.js lineState)
function cableState(l) { return lineState(l); }

// A run cut into pieces of about PIECE_LEN: [{ i0, i1 }] (segment index ranges, segment i = run[i-1] → run[i]).
function runPieces(run) {
  if (run._pieces) return run._pieces;
  const P = [];
  let i0 = 1, acc = 0;
  for (let i = 1; i < run.length; i++) {
    acc += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
    if (acc >= PIECE_LEN && i < run.length - 1) { P.push({ i0, i1: i }); i0 = i + 1; acc = 0; }
  }
  P.push({ i0, i1: run.length - 1 });
  return (run._pieces = P);
}

// Rasterize segments i0..i1 of a run (a polyline in layout units) into a canvas sprite: beauty, normals, height.
// Distances are taken to every segment of the run, and a pixel is drawn only by the piece that owns its
// nearest segment (ties: the lower one), so the pieces meet seamlessly.
function buildCable(key, run, i0, i1) {
  const SIN = GFX.SIN, P = CABLE_PPU, R = CABLE_R, SH = 0.07;      // SH: contact shadow width
  const m = R + SH + 0.02;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = i0 - 1; i <= i1; i++) { const [x, y] = run[i]; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 -= m; y0 -= m; x1 += m; y1 += m;
  const w = Math.ceil((x1 - x0) * P), h = Math.ceil((y1 - y0) * SIN * P);
  const D = GFX.canvasSprite('cable_' + key, w, h, { ppu: P, ox: 0, oy: 0, maps: true });
  if (!D) return null;
  const n = w * h, dist = new Float32Array(n).fill(Infinity), seg = new Int16Array(n).fill(-1);
  const U = new Float32Array(n), PX = new Float32Array(n), PY = new Float32Array(n), TX = new Float32Array(n), TY = new Float32Array(n);
  let u0 = 0;
  for (let i = 1; i < run.length; i++) {
    const [ax, ay] = run[i - 1], [bx, by] = run[i], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    if (L < 1e-6) continue;
    const tx = dx / L, ty = dy / L;
    const px0 = Math.max(0, Math.floor((Math.min(ax, bx) - m - x0) * P)), px1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx) + m - x0) * P));
    const py0 = Math.max(0, Math.floor((Math.min(ay, by) - m - y0) * SIN * P)), py1 = Math.min(h - 1, Math.ceil((Math.max(ay, by) + m - y0) * SIN * P));
    for (let py = py0; py <= py1; py++) {
      const wy = y0 + (py + 0.5) / (SIN * P);
      for (let px = px0; px <= px1; px++) {
        const wx = x0 + (px + 0.5) / P, rx = wx - ax, ry = wy - ay;
        const t = Math.max(0, Math.min(L, rx * tx + ry * ty)), ox = rx - tx * t, oy = ry - ty * t, d = Math.hypot(ox, oy);
        const k = py * w + px;
        if (d < dist[k]) { dist[k] = d; seg[k] = i; U[k] = u0 + t; PX[k] = ox; PY[k] = oy; TX[k] = tx; TY[k] = ty; }
      }
    }
    u0 += L;
  }
  const C = CABLE_COL, HK = 255 / (GFX.heightRange || 4), img = D.ctx.createImageData(w, h), o = img.data, win = [], winShade = [];
  const nm = D.nmap, hm = D.hmap, key3 = [0.35, 0.45, 0.82], kl = Math.hypot(...key3);   // baked key light: front right, high (like the Blender rig)
  for (let k = 0; k < n; k++) {
    const d = dist[k], j = k * 4;
    nm[j] = 128; nm[j + 1] = 128; nm[j + 2] = 255; nm[j + 3] = 255; hm[j + 3] = 255;
    if (!(d < R + SH) || seg[k] < i0 || seg[k] > i1) continue;
    if (d >= R - 0.5 / P) {                                      // the floor around it: soft contact shadow (and the AA edge)
      const a = Math.min(1, Math.max(0, (R + 0.5 / P - d) * P));   // cable coverage at the very edge
      const sh = 0.5 * Math.pow(Math.max(0, 1 - (d - R) / SH), 2);
      o[j] = o[j + 1] = o[j + 2] = C.outline[0] * a; o[j + 3] = 255 * Math.max(sh, a);
      continue;
    }
    const s = Math.min(1, d / R), nz = Math.sqrt(Math.max(0, 1 - s * s));
    const qx = d > 1e-6 ? PX[k] / d : 0, qy = d > 1e-6 ? PY[k] / d : 0;
    // ribs: a ring every RIB units, the normal tilting along the cable over each ring
    const ph = (U[k] / RIB) % 1, ring = 0.5 + 0.5 * Math.cos(ph * 2 * Math.PI), tilt = -0.45 * Math.sin(ph * 2 * Math.PI) * (1 - 0.6 * s);
    const isWin = s < 0.26, frame = !isWin && s < 0.36;          // the indicator window along the top and its rim
    let Nx = qx * s, Ny = qy * s, Nz = nz;
    if (!isWin) { Nx += TX[k] * tilt; Ny += TY[k] * tilt; }
    const nl = Math.hypot(Nx, Ny, Nz); Nx /= nl; Ny /= nl; Nz /= nl;
    nm[j] = Math.round((Nx * 0.5 + 0.5) * 255); nm[j + 1] = Math.round((-Ny * 0.5 + 0.5) * 255); nm[j + 2] = Math.round((Nz * 0.5 + 0.5) * 255);
    const z = R + R * nz + (isWin ? -0.006 : 0.01 * ring);
    hm[j] = hm[j + 1] = hm[j + 2] = Math.min(255, Math.round(z * HK));
    // baked shading (the runtime lighting multiplies this): key light, darker towards the floor
    const lam = Math.max(0, (Nx * key3[0] + Ny * key3[1] + Nz * key3[2]) / kl);
    const shade = (0.62 + 0.5 * lam) * (0.62 + 0.38 * nz), spec = Math.pow(lam, 24) * 0.5;
    const edge = Math.max(0, (s - 0.86) / 0.14);                 // dark outline at the silhouette
    let c;
    if (isWin) { win.push(j); winShade.push(shade); c = C.off; }
    else if (frame) c = C.outline.map(v => v * 1.6);
    else { const rk = ring * ring * ring; c = [0, 1, 2].map(i => (C.jacket[i] + (C.rib[i] - C.jacket[i]) * rk) * shade + 255 * spec); }
    o[j] = c[0] + (C.outline[0] - c[0]) * edge; o[j + 1] = c[1] + (C.outline[1] - c[1]) * edge; o[j + 2] = c[2] + (C.outline[2] - c[2]) * edge; o[j + 3] = 255;
  }
  D.mapsDirty = true;
  return { D, x0, y0, img, win: Int32Array.from(win), winShade: Float32Array.from(winShade), state: null };
}

// The piece's sprite in the line's current state (the window recoloured when it changes); null: not built yet.
function cablePiece(l, j, q) {
  const key = l.id + '_' + j + '_' + q;
  let c = CABLES[key];
  if (c === undefined) {
    if (cableBuilds >= BUILDS_PER_FRAME) return null;
    cableBuilds++;
    const pc = runPieces(l.runs[j])[q];
    c = CABLES[key] = buildCable(key, l.runs[j], pc.i0, pc.i1);
  }
  if (!c) return null;
  const st = cableState(l);
  if (c.state !== st) {
    const o = c.img.data, col = CABLE_COL[st], lit = st === 'live';
    for (let i = 0; i < c.win.length; i++) { const j = c.win[i], g = lit ? 1 : c.winShade[i] * 1.1; o[j] = col[0] * g; o[j + 1] = col[1] * g; o[j + 2] = col[2] * g; }
    c.D.ctx.putImageData(c.img, 0, 0); c.D.commit(); c.state = st;
  }
  return c;
}

// Every frame (GFX on): the cables, their clamps and fittings. false: not drawn (GFX off).
function drawCables3d(t) {
  if (!GFX.on) return false;
  cableBuilds = 0;
  for (const l of POWER_LINES) {
    const st = cableState(l), on = st === 'live';
    l.runs.forEach((run, j) => {
      runPieces(run).forEach((_, q) => {
        const c = cablePiece(l, j, q);
        if (c) GFX.sprite(c.D.name, 0, c.x0, c.y0, 0, { layer: 'decal', emissive: on ? 1 : 0 });
      });
      // clamps, evenly along the run (not right at its ends: the fittings are there)
      let len = 0; for (let i = 1; i < run.length; i++) len += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
      const nClamps = Math.floor((len - 1.2) / CLAMP_EVERY);
      for (let q = 1; q <= nClamps; q++) {
        const [x, y, a] = runPoint(run, (len / (nClamps + 1)) * q);
        GFX.sprite('power/clamp', GFX.frameIndex('power/clamp', a), x, y, 0, { sortY: y - 0.3 });
      }
    });
  }
  for (const f of POWER_FITTINGS) {
    const on = cableState(LINE[f.line]) === 'live';
    const name = `power/${f.kind}_${on ? 'on' : 'off'}`;
    const k = f.kind === 'riser' ? 0 : GFX.frameIndex(name, f.a);
    // wall boxes stand just in front of their wall; plugs sort with the machine they're on
    const sortY = f.kind === 'plug' ? f.y : f.y + (Math.sin(f.a) > 0.5 ? 0.3 : 0);
    GFX.sprite(name, k, f.x, f.y, 0, { sortY, emissive: on ? 0.9 : 0.3 });
  }
  for (const g of GUNS) {                                       // outside: wall outlet → the cannon's mount
    const on = cableState(LINE['gun_' + g.id]) === 'live', name = `power/jack_${g.id}_${on ? 'on' : 'off'}`;
    if (g.id === 'front') GFX.sprite(name, 0, g.x, g.y + gunDY(g), gunZ(g), { layer: 'wall', sortY: g.y + gunDY(g) - 0.01, depthBias: 0.2, emissive: on ? 0.9 : 0.3 });
    else GFX.sprite(name, 0, g.x, g.y, 0, { layer: 'wall', sortY: g.y - 0.01, emissive: on ? 0.9 : 0.3 });
  }
  return true;
}
// Point at distance d along a polyline, with the direction there.
function runPoint(run, d) {
  for (let i = 1; i < run.length; i++) {
    const [ax, ay] = run[i - 1], [bx, by] = run[i], L = Math.hypot(bx - ax, by - ay);
    if (d <= L || i === run.length - 1) { const q = L ? Math.min(1, d / L) : 0; return [ax + (bx - ax) * q, ay + (by - ay) * q, Math.atan2(by - ay, bx - ax)]; }
    d -= L;
  }
  return [run[0][0], run[0][1], 0];
}
