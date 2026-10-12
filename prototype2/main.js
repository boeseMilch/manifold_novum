'use strict';
// Manifold Novum — sprite prototype 2: pre-rendered Blender sprites with runtime lighting.
//
// ===================================================================================================
// ASSET MAPPING — the one place to adjust when sprite names in assets/sprites/sprites.json change.
// (Sprites come packed into atlas pages by tools/sprites/pack.py; format in tools/sprites/README.md.)
// Each role lists candidate manifest names (strings: exact; RegExp: first manifest key that matches).
// The first candidate found wins; if none is there, `standIn` is used (scaled by `standInScale`).
//   tile:   world size of one tile in layout units, [along x, along y]; 'auto' infers it from the sprite.
//          Tiles whose origin is pixel (0, 0) are taken as top-left anchored without margin, others as centred.
//   mask:   use the tint mask.    anchor: find the glowing part (light position) in the sprite.
// ===================================================================================================
const ASSETS = {
  crewIdle:      { names: ['crew/idle', 'crew/crew_idle', 'crew/crew', /^crew\/.*idle(?!.*visor)/], mask: true, standIn: 'test/crate', standInScale: 0.55 },
  crewWalk:      { names: ['crew/walk', 'crew/crew_walk', /^crew\/.*walk(?!.*visor)/], mask: true },           // missing: idle is used
  crewIdleVisor: { names: ['crew/idle_visor', 'crew/crew_idle_visor', /^crew\/.*idle.*visor/], mask: true },  // missing: no visor variant
  crewWalkVisor: { names: ['crew/walk_visor', 'crew/crew_walk_visor', /^crew\/.*walk.*visor/], mask: true },
  reactor:       { names: ['ship/reactor', /^ship\/reactor(?!_off)/], anchor: true, standIn: 'test/crate' },
  reactorOff:    { names: ['ship/reactor_off'] },                                                   // missing: reactor frame 0, dimmed
  floor:         { names: ['ship/floor', /^ship\/floor/], tile: 'auto' },              // missing: procedural plate
  // Walls (see tools/blender/models/ship/walls.py): full-height back wall along the room's north edge,
  // low cut-away wall along the south edge, vertical walls on the sides (tiles = top strip, plus an end
  // piece at the south end). Missing: no walls, just the deck's rim.
  wallH:         { names: ['ship/wall_h', /^ship\/wall_?h$/], tile: 'auto' },
  wallHLow:      { names: ['ship/wall_h_low'], tile: 'auto' },                       // missing: wallH
  wallV:         { names: ['ship/wall_v', /^ship\/wall_?v$/], tile: 'auto' },
  wallVLow:      { names: ['ship/wall_v_low'], tile: 'auto' },                       // missing: wallV
  wallVEnd:      { names: ['ship/wall_v_end'] },
  wallVLowEnd:   { names: ['ship/wall_v_low_end'] },
  // Interceptor (tools/blender/models/enemy/interceptor.py): '_port' = the enemy flies on our left and
  // faces right, '_star' = on our right. The scene puts it on whichever side the found hull is for.
  hull:          { names: ['enemy/interceptor_port', 'enemy/interceptor_star', 'enemy/interceptor', /^enemy\/interceptor(_[a-z]+)?$/], anchor: true, standIn: 'test/crate', standInScale: 1.3 },
  turret:        { names: ['enemy/interceptor_turret', /^enemy\/interceptor.*turret/], offset: [1.0, -0.45] },   // pivot, port side (x mirrored on star)
  // Weak spots: every match is one, drawn at the hull's origin (their own ox/oy place them). A laser hit
  // swaps one for its damaged twin: the same name with `hit[0]` replaced by `hit[1]`.
  weakSpots:     { all: /^enemy\/interceptor.*(_ok|weak(?!.*_hit).*)$/, anchor: true, hit: ['_ok', '_hit'] },   // only those named <hull>_... are used
  weakSpotsHit:  { all: /^enemy\/interceptor.*_hit$/ },
  crate:         { names: ['test/crate'] },
};
// Scene layout (layout units; game y grows downwards).
const ROOM = { x0: 0, y0: 0, x1: 10, y1: 8 };
const REACTOR_AT = [5.2, 3.2];
const CRATES = [[0.9, 0.85, 0], [0.9, 0.85, 1], [2.0, 0.8, 0], [9.0, 7.1, 0], [7.9, 7.2, 0], [9.1, 0.85, 0]];   // x, y, stack level
const INTERCEPTOR_GAP = 3.4, INTERCEPTOR_Y = 3.8, INTERCEPTOR_HOVER = 1.0;   // centre this far outside the room's side
const CAM_HOME = [2.45, 4.1];                     // where the camera rests (port-side interceptor; mirrored for star)
const WALK_SPEED = 2.7, STRIDE = 1.15;          // units/s, units per walk cycle
const ZOOMS = [1, 1.5, 2], BASE_PX = 48;         // 1x = the game's 48 css px per unit; 2x = native sprite pixels
// ===================================================================================================

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const errors = [];
function fail(msg) {
  errors.push(String(msg)); console.error(msg);
  document.title = 'ERR ' + errors[0].slice(0, 120);
  const e = $('err'); e.hidden = false; e.textContent = errors.join('\n');
}
window.addEventListener('error', (e) => fail(e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', (e) => fail(e.reason && e.reason.stack || e.reason));

// ---------------------------------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------------------------------
let R, META, SIN, COS, PPU, RAW_PPU, HR, SIDE = 1;
const SPR = {};          // role -> sprite (or array for weakSpots)
const STATUS = {};       // role -> text for the panel
const scratch = document.createElement('canvas'), sctx = scratch.getContext('2d', { willReadFrequently: true });

function loadImage(url) {
  return new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('missing ' + url)); i.src = url; });
}
function pixels(img) {
  scratch.width = img.width; scratch.height = img.height;
  sctx.clearRect(0, 0, img.width, img.height); sctx.drawImage(img, 0, 0);
  return sctx.getImageData(0, 0, img.width, img.height);
}

function resolve(role) {
  const a = ASSETS[role], keys = Object.keys(MANIFEST).filter(k => MANIFEST[k].f && MANIFEST[k].f.length);
  if (a.all) return keys.filter(k => a.all.test(k)).sort();
  for (const c of a.names || []) {
    if (typeof c === 'string') { if (keys.includes(c)) return c; }
    else { const k = keys.find(k => c.test(k)); if (k) return k; }
  }
  return null;
}

let MANIFEST = {};       // sprites.json "sprites"
const PAGES = {};        // 'group/index' -> promise of { w, h, img: {b, n, h, m}, tex: {b, n, h, m} }
function loadPage(group, i) {
  const key = group + '/' + i;
  if (!PAGES[key]) PAGES[key] = (async () => {
    const p = META.pages[group][i], base = '../assets/sprites/' + p.file;
    const kinds = ['b', ...p.maps.split('')];
    const imgs = await Promise.all(kinds.map(k => loadImage(base + (k === 'b' ? '' : '.' + k) + '.webp').catch(() => null)));
    const P = { w: p.w, h: p.h, img: {}, tex: {} };
    kinds.forEach((k, j) => { if (!imgs[j]) return; P.img[k] = imgs[j]; P.tex[k] = R.texture(imgs[j], { mips: k === 'b' }); });
    return P;
  })();
  return PAGES[key];
}

// A frame as canvas rects (sprite px at the sprite's ppu): the base (or whole frame) and an optional patch.
function frameRects(spr, idx) {
  const f = spr.f[idx] !== undefined ? spr.f[idx] : spr.f[0];
  if (!f) return null;
  const rect = (r) => ({ page: r[0], px: r[1], py: r[2], w: r[3], h: r[4], cx: spr.ox - r[5], cy: spr.oy - r[6] });
  if (f.length > 7) {
    const patch = f[3] > 0 ? rect(f) : null;
    return { base: rect(spr.bases[f[7]]), patch };
  }
  return { base: rect(f), patch: null };
}

async function loadSprite(name, { mask = false, anchor = false } = {}) {
  const e = MANIFEST[name];
  const S = { name, w: e.w, h: e.h, ox: e.ox, oy: e.oy, ppu: e.ppu, dirs: e.dirs || 1, frames: e.frames || 1, f: e.f, bases: e.bases || [],
    maps: e.maps, group: e.group, pageTex: [], anchors: [], maxH: 0, tintRef: 0.45, scale: 1, useMask: mask && e.maps.includes('m') };
  const used = [...new Set([...e.f.filter(Boolean).map(f => f[0]), ...S.bases.map(b => b[0])])];
  await Promise.all(used.map(i => loadPage(e.group, i).then(P => { S.pageTex[i] = P; })));
  const hp = framePixels(S, 0, 'h');
  if (hp) { let mx = 0; for (let i = 0; i < hp.data.length; i += 4) if (hp.data[i + 3]) mx = Math.max(mx, hp.data[i]); S.maxH = mx / 255 * HR; }
  if (anchor) for (let idx = 0; idx < S.f.length; idx++) {
    const bp = framePixels(S, idx, 'b');
    S.anchors[idx] = bp ? findAnchor(bp, framePixels(S, idx, 'h'), S) : null;
  }
  if (S.useMask) { const bp = framePixels(S, 0, 'b'), mp = framePixels(S, 0, 'm'); if (bp && mp) S.tintRef = tintRef(bp, mp); }
  return S;
}
// A frame rebuilt on its canvas (beauty-size pixels) from the pages, for measuring (anchors, height, tint).
function framePixels(S, idx, kind) {
  const fr = frameRects(S, idx); if (!fr) return null;
  const P = S.pageTex[fr.base.page]; if (!P || !P.img[kind]) return null;
  const k = P.img[kind].width / P.w;           // map pages are smaller
  scratch.width = S.w; scratch.height = S.h; sctx.clearRect(0, 0, S.w, S.h);
  const put = (r) => { sctx.clearRect(r.cx, r.cy, r.w, r.h); sctx.drawImage(P.img[kind], r.px * k, r.py * k, r.w * k, r.h * k, r.cx, r.cy, r.w, r.h); };
  put(fr.base); if (fr.patch) put(fr.patch);
  return sctx.getImageData(0, 0, S.w, S.h);
}
// Where the glowing bits are, as an offset from the ground origin (for placing lights on reactors, weak spots).
function findAnchor(bp, hp, S) {
  const d = bp.data, w = bp.width; let sx = 0, sy = 0, sz = 0, sw = 0, ax = 0, ay = 0, az = 0, aw = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const px = (i / 4) % w, py = Math.floor(i / 4 / w);
    const z = hp ? hp.data[i] / 255 * HR : 0;
    const x = (px - S.ox) / S.ppu, y = ((py - S.oy) / S.ppu + z * COS) / SIN;
    const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
    const glow = Math.max(0, mx - 170) * (mx - mn > 40 || mx > 235 ? 1 : 0.2);
    if (glow > 0) { sx += x * glow; sy += y * glow; sz += z * glow; sw += glow; }
    ax += x; ay += y; az += z; aw++;
  }
  if (sw > 0) return [sx / sw, sy / sw, sz / sw + 0.15];
  return aw ? [ax / aw, ay / aw, S.maxH * 0.8 + 0.2] : [0, 0, 1];
}
function tintRef(bp, mp) {
  let s = 0, n = 0;
  for (let i = 0; i < bp.data.length; i += 4) if (mp.data[i] > 160 && bp.data[i + 3] > 200) {
    s += (0.2126 * bp.data[i] + 0.7152 * bp.data[i + 1] + 0.0722 * bp.data[i + 2]) / 255; n++;
  }
  return n > 20 ? Math.max(0.12, s / n * 1.1) : 0.45;
}

// A flat deck plate drawn in code, for when ship/floor isn't rendered yet.
function proceduralFloor() {
  const tw = PPU, th = Math.round(PPU * SIN), mk = () => { const c = document.createElement('canvas'); c.width = tw; c.height = th; return c; };
  const cb = mk(), cn = mk(), ch = mk(), b = cb.getContext('2d'), n = cn.getContext('2d'), h = ch.getContext('2d');
  b.fillStyle = '#434b5c'; b.fillRect(0, 0, tw, th);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) { b.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.025 + rnd() * 0.03})`; b.fillRect(rnd() * tw, rnd() * th, 1 + rnd() * 5, 1 + rnd() * 3); }
  const bev = 4;
  b.fillStyle = 'rgba(255,255,255,0.12)'; b.fillRect(0, 0, tw, bev); b.fillRect(0, 0, bev, th);
  b.fillStyle = 'rgba(0,0,0,0.28)'; b.fillRect(0, th - bev, tw, bev); b.fillRect(tw - bev, 0, bev, th);
  b.fillStyle = '#20242d'; b.fillRect(0, th - 1, tw, 1); b.fillRect(tw - 1, 0, 1, th);
  for (const [x, y] of [[9, 7], [tw - 9, 7], [9, th - 7], [tw - 9, th - 7]]) {
    b.fillStyle = '#2c313c'; b.beginPath(); b.ellipse(x, y, 3, 2.4, 0, 0, 7); b.fill();
    b.fillStyle = '#7a8394'; b.beginPath(); b.ellipse(x - 0.6, y - 0.6, 1.6, 1.2, 0, 0, 7); b.fill();
  }
  b.strokeStyle = 'rgba(232,195,79,0.55)'; b.lineWidth = 3; b.setLineDash([7, 7]);
  n.fillStyle = 'rgb(128,128,255)'; n.fillRect(0, 0, tw, th);
  n.fillStyle = 'rgb(128,190,230)'; n.fillRect(0, 0, tw, bev);        // far edge leans away
  n.fillStyle = 'rgb(66,128,230)'; n.fillRect(0, 0, bev, th);
  n.fillStyle = 'rgb(128,66,230)'; n.fillRect(0, th - bev, tw, bev);
  n.fillStyle = 'rgb(190,128,230)'; n.fillRect(tw - bev, 0, bev, th);
  h.fillStyle = '#000'; h.fillRect(0, 0, tw, th);
  return { name: '(procedural floor)', w: tw, h: th, ox: tw / 2, oy: th / 2, ppu: PPU, dirs: 1, frames: 1, maxH: 0, scale: 1, tileW: 1, tileD: 1,
    f: [[0, 0, 0, tw, th, tw / 2, th / 2]], bases: [], anchors: [],
    pageTex: [{ w: tw, h: th, tex: { b: R.texture(cb, { mips: true }), n: R.texture(cn), h: R.texture(ch) } }] };
}
function tileSize(S, role) {
  const a = ASSETS[role];
  if (Array.isArray(a.tile)) return a.tile;
  const mt = MANIFEST[S.name] && MANIFEST[S.name].tile;
  if (Array.isArray(mt)) return mt;
  const q = (v) => Math.max(0.25, Math.round(v * 4) / 4), m = S.ox === 0 && S.oy === 0 ? 0 : 6 * S.ppu / RAW_PPU;
  return [q((S.w - 2 * m) / S.ppu), q(((S.h - 2 * m) / S.ppu - S.maxH * COS) / SIN)];
}

async function load() {
  const data = await (await fetch('../assets/sprites/sprites.json', { cache: 'no-store' })).json();
  MANIFEST = data.sprites; META = data.meta;
  const elev = (META.elevation || 50) * Math.PI / 180;
  SIN = Math.sin(elev); COS = Math.cos(elev); RAW_PPU = META.rawPpu || 96; PPU = RAW_PPU; HR = META.heightRange || 4;
  const jobs = [];
  for (const role of Object.keys(ASSETS)) {
    const a = ASSETS[role], r = resolve(role);
    if (a.all) {
      SPR[role] = [];
      jobs.push(Promise.all(r.map(n => loadSprite(n, a))).then(list => { SPR[role] = list; STATUS[role] = list.length ? list.map(s => s.name).join(', ') : '—'; }));
    } else if (r) {
      jobs.push(loadSprite(r, a).then(s => { SPR[role] = s; STATUS[role] = r; }).catch(e => { STATUS[role] = 'failed: ' + e.message; }));
    } else STATUS[role] = null;
  }
  await Promise.all(jobs);
  for (const role of Object.keys(ASSETS)) {
    const a = ASSETS[role];
    if (!SPR[role] && a.standIn && SPR.crate) {
      SPR[role] = Object.assign(Object.create(SPR.crate), { scale: a.standInScale || 1, standIn: true });
      STATUS[role] = 'stand-in: ' + a.standIn;
    }
  }
  if (!SPR.floor) { SPR.floor = proceduralFloor(); STATUS.floor = 'stand-in: procedural plate'; }
  else [SPR.floor.tileW, SPR.floor.tileD] = tileSize(SPR.floor, 'floor');
  if (!SPR.wallHLow && SPR.wallH) SPR.wallHLow = SPR.wallH;
  if (!SPR.wallVLow && SPR.wallV) SPR.wallVLow = SPR.wallV;
  for (const k of ['wallH', 'wallHLow']) if (SPR[k]) SPR[k].tileW = tileSize(SPR[k], k)[0] || 1;
  for (const k of ['wallV', 'wallVLow']) if (SPR[k]) SPR[k].tileD = MANIFEST[SPR[k].name].pitch || tileSize(SPR[k], k)[1] || 1;
  const hn = SPR.hull && SPR.hull.name || '';
  SIDE = /_star/.test(hn) ? -1 : 1;
  if (SPR.weakSpots && !SPR.hull.standIn) SPR.weakSpots = SPR.weakSpots.filter(w => w.name.startsWith(hn + '_'));
}

// ---------------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------------
const st = {
  mode: +(Q.get('mode') ?? 1), emergency: Q.has('emergency'), visor: Q.has('visor'), zoom: +(Q.get('zoom') || 1.5),
  suit: Q.get('suit') ? '#' + Q.get('suit') : '#c4683a', compare: Q.has('compare'), reactorOn: !Q.has('reactoroff'),
  lights: { warm: true, cool: true, reactor: true, weak: true, mouse: Q.has('mouselight'), engine: true },
};
const crew = { x: 3.4, y: 5.6, dir: 2, moving: false, walkT: 0, idleT: 0, aim: null };
const keys = new Set();
const flashes = [], bolts = [];
const mouse = { x: -1, y: -1, wx: 6, wy: 3, inside: false };
const cam = { x: CAM_HOME[0], y: CAM_HOME[1], snap: true };
let W = 0, H = 0, S = 72, DPR = 1, time = 0, VX = 0;   // VX: screen x of the view centre (left of the panel)
if (Q.get('crew')) { const [x, y] = Q.get('crew').split(',').map(Number); crew.x = x; crew.y = y; }
if (Q.get('dir')) crew.dir = +Q.get('dir');

function rgb(hex) { const v = parseInt(hex.slice(1), 16); return [(v >> 16 & 255) / 255, (v >> 8 & 255) / 255, (v & 255) / 255]; }

// ---------------------------------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------------------------------
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'color') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (ARROWS[k] || k === ' ') e.preventDefault();
  if (e.repeat) { keys.add(k); return; }
  keys.add(k);
  if (k === ' ') shoot();
  else if (k === '1' || k === '2' || k === '3' || k === '4') setMode(+k - 1);
  else if (k === 'r') toggle('emergency');
  else if (k === 'v') toggle('visor');
  else if (k === 'z') setZoom(ZOOMS[(ZOOMS.indexOf(st.zoom) + 1) % ZOOMS.length]);
  else if (k === 'o') toggle('compare');
  else if (k === 'm') { st.lights.mouse = !st.lights.mouse; syncUI(); }
  else if (k === 'f') popFlash(mouse.wx, mouse.wy, 0.6, [1.0, 0.9, 0.7], 5.5, 0.18);
  else if (k === 'e') { if (Math.hypot(crew.x - REACTOR_AT[0], crew.y - REACTOR_AT[1]) < 2.2) { st.reactorOn = !st.reactorOn; syncUI(); } }
});
addEventListener('keyup', (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
addEventListener('blur', () => keys.clear());

function aimVector() {
  let ax = 0, ay = 0;
  for (const k in ARROWS) if (keys.has(k)) { ax += ARROWS[k][0]; ay += ARROWS[k][1]; }
  return ax || ay ? [ax, ay] : null;
}
function shoot() {
  const a = aimVector() || dirVec(crew.dir), l = Math.hypot(a[0], a[1]), dx = a[0] / l, dy = a[1] / l;
  const mx = crew.x + dx * 0.5, my = crew.y + dy * 0.5;
  popFlash(mx, my, 0.75, [1.0, 0.78, 0.45], 4.5, 0.11, 3.2);
  bolts.push({ x: mx, y: my, z: 0.75, vx: dx * 15, vy: dy * 15, life: 1.4 });
  if (aimVector()) crew.dir = dirIndex(dx, dy);
}
function popFlash(x, y, z, c, r, dur, k = 2.6) { flashes.push({ x, y, z, c, r, dur, t: 0, k }); }
function dirIndex(dx, dy, n = 8) { return ((Math.round(Math.atan2(dy, dx) / (2 * Math.PI / n)) % n) + n) % n; }
function dirVec(i, n = 8) { const a = i * 2 * Math.PI / n; return [Math.cos(a), Math.sin(a)]; }

// ---------------------------------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------------------------------
// Half width and half depth of a sprite's ground footprint, read off the sprite: its width, and how far
// below the origin its bottom edge is (the front of the object at z = 0). Assumes a roughly symmetric base.
function footprint(spr, scale = 1) {
  const m = spr.ox === 0 && spr.oy === 0 ? 0 : 6 * spr.ppu / RAW_PPU, sc = (spr.scale || 1) * scale;
  return [(spr.w - 2 * m) / 2 / spr.ppu * sc, Math.max(0.15, (spr.h - m - spr.oy) / spr.ppu / SIN * sc)];
}
function solids() {
  const out = [];
  if (SPR.reactor) { const [hw, hd] = footprint(SPR.reactor); out.push([REACTOR_AT[0], REACTOR_AT[1], hw * 0.9, hd * 0.85]); }
  if (SPR.crate) for (const c of CRATES) if (!c[2]) { const [hw, hd] = footprint(SPR.crate); out.push([c[0], c[1], hw, hd]); }
  return out;
}
const weakHit = {};      // weak spot name -> time until which it shows as damaged
function update(dt) {
  time += dt;
  let mx = 0, my = 0;
  if (keys.has('a')) mx--; if (keys.has('d')) mx++; if (keys.has('w')) my--; if (keys.has('s')) my++;
  if (Q.has('demo')) { const a = time * 0.7; mx = -Math.sin(a); my = Math.cos(a) * 0.8; }
  crew.moving = !!(mx || my);
  if (crew.moving) {
    const l = Math.hypot(mx, my); mx /= l; my /= l;
    let nx = crew.x + mx * WALK_SPEED * dt, ny = crew.y + my * WALK_SPEED * dt;
    nx = Math.min(ROOM.x1 - 0.45, Math.max(ROOM.x0 + 0.45, nx)); ny = Math.min(ROOM.y1 - 0.35, Math.max(ROOM.y0 + 0.55, ny));
    const cr = 0.28;
    for (const [sx, sy, hw, hd] of solids()) {
      const cx = Math.min(sx + hw, Math.max(sx - hw, nx)), cy = Math.min(sy + hd, Math.max(sy - hd, ny));
      const dx = nx - cx, dy = ny - cy, d = Math.hypot(dx, dy);
      if (d < cr) {
        if (d > 1e-5) { nx = cx + dx / d * cr; ny = cy + dy / d * cr; }
        else { nx = crew.x; ny = crew.y; }          // started inside (spawned there): just don't move further in
      }
    }
    crew.x = nx; crew.y = ny;
    crew.walkT += dt * WALK_SPEED / STRIDE;
  } else crew.walkT = 0;
  crew.idleT += dt;
  const aim = aimVector();
  if (aim) crew.dir = dirIndex(aim[0], aim[1]);
  else if (crew.moving) crew.dir = dirIndex(mx, my);

  for (const f of flashes) f.t += dt;
  for (let i = flashes.length - 1; i >= 0; i--) if (flashes[i].t > flashes[i].dur) flashes.splice(i, 1);
  const ic = interceptorPos();
  for (const b of bolts) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    const [hw, hd] = SPR.hull ? footprint(SPR.hull) : [1, 1];
    if (Math.abs(b.x - ic[0]) < hw * 0.8 && Math.abs(b.y - ic[1]) < hd * 0.8) {
      b.life = 0; popFlash(b.x, b.y, ic[2] + 0.6, [1.0, 0.7, 0.4], 3.5, 0.22, 3.4);
      let best = null, bd = 1.3;                     // a hit near a weak spot breaks it for a while
      for (const w of SPR.weakSpots) {
        const [x, y] = anchorOf(w, 0, ic[0], ic[1], ic[2]), d = Math.hypot(x - b.x, y - b.y);
        if (d < bd) { bd = d; best = w; }
      }
      if (best) { weakHit[best.name] = time + 6; popFlash(b.x, b.y, ic[2] + 0.6, [0.5, 0.75, 1.0], 4, 0.4, 4); }
    }
  }
  for (let i = bolts.length - 1; i >= 0; i--) if (bolts[i].life <= 0) bolts.splice(i, 1);
  if (Q.has('demo') && Math.floor(time / 0.9) !== Math.floor((time - dt) / 0.9)) shoot();

  // camera: keep the room and the interceptor framed; at higher zoom follow the crew more
  const follow = st.zoom <= 1 ? 0.15 : st.zoom < 2 ? 0.45 : 0.85;
  const home = st.compare ? [REACTOR_AT[0], REACTOR_AT[1] + 1.2]           // side by side: frame the room like the screenshot
    : [SIDE > 0 ? CAM_HOME[0] : ROOM.x1 + ROOM.x0 - CAM_HOME[0], CAM_HOME[1]];
  let tx = home[0] + (crew.x - home[0]) * follow, ty = home[1] + (crew.y - home[1]) * follow;
  if (Q.get('cam')) [tx, ty] = Q.get('cam').split(',').map(Number);          // for screenshots
  const k = cam.snap ? 1 : 1 - Math.exp(-dt * 4); cam.snap = false;
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
}
function interceptorPos() {
  const x = SIDE > 0 ? ROOM.x0 - INTERCEPTOR_GAP : ROOM.x1 + INTERCEPTOR_GAP;
  return [x + Math.sin(time * 0.37) * 0.25, INTERCEPTOR_Y + Math.sin(time * 0.53) * 0.18, INTERCEPTOR_HOVER + Math.sin(time * 1.1) * 0.08];
}

// ---------------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------------
function toScreen(x, y, z) { return [(x - cam.x) * S + VX, ((y - cam.y) * SIN - z * COS) * S + H / 2]; }
function fromScreen(sx, sy) { return [cam.x + (sx - VX) / S, cam.y + (sy - H / 2) / S / SIN]; }

function frameIndex(spr, dir, f) {
  const d = spr.dirs > 1 ? ((Math.round(dir * spr.dirs / 8) % spr.dirs) + spr.dirs) % spr.dirs : 0;
  return d * spr.frames + (((f % spr.frames) + spr.frames) % spr.frames);
}
function drawSprite(spr, idx, gx, gy, gz, o = {}) {
  const fr = frameRects(spr, idx); if (!fr) return;
  const P = spr.pageTex[fr.base.page]; if (!P) return;
  const sc = (spr.scale || 1) * (o.scale || 1), k = S / spr.ppu * sc;
  const [sx, sy] = toScreen(gx, gy, gz);
  const b = fr.base, p = fr.patch;
  // the quad: the base rect (a patch always lies inside the canvas; grow the quad to cover it too)
  const qx0 = Math.min(b.cx, p ? p.cx : b.cx), qy0 = Math.min(b.cy, p ? p.cy : b.cy);
  const qx1 = Math.max(b.cx + b.w, p ? p.cx + p.w : 0), qy1 = Math.max(b.cy + b.h, p ? p.cy + p.h : 0);
  const tex = { b: P.tex.b, n: P.tex.n, h: P.tex.h, m: spr.useMask ? P.tex.m : null };
  R.sprite({ x: sx + (qx0 - spr.ox) * k, y: sy + (qy0 - spr.oy) * k, w: (qx1 - qx0) * k, h: (qy1 - qy0) * k, tex,
    size: [spr.w, spr.h, spr.ox, spr.oy], quad: [qx0, qy0, qx1 - qx0, qy1 - qy0], base: [b.cx, b.cy, b.w, b.h],
    patch: p ? [p.cx, p.cy, p.w, p.h] : null, off: [b.px - b.cx, b.py - b.cy, p ? p.px - p.cx : 0, p ? p.py - p.cy : 0],
    page: [P.w, P.h], ppu: spr.ppu, ground: [gx, gy, gz],
    tint: o.tint, tintRef: spr.tintRef, emissive: o.emissive, alpha: o.alpha, cutout: o.cutout, depthBias: o.depthBias, scale: sc });
}
function anchorOf(spr, idx, gx, gy, gz) {
  const a = (spr.anchors && (spr.anchors[idx] || spr.anchors[0])) || [0, 0, (spr.maxH || 1) * 0.8];
  const sc = spr.scale || 1;
  return [gx + a[0] * sc, gy + a[1] * sc, gz + a[2] * sc];
}

function crewSprite() {
  const walk = crew.moving && (st.visor && SPR.crewWalkVisor || SPR.crewWalk);
  const idle = st.visor && SPR.crewIdleVisor || SPR.crewIdle;
  return walk ? [walk, Math.floor(crew.walkT * walk.frames)] : [idle, Math.floor(crew.idleT * 6)];
}

function collectLights() {
  const L = [], pulse = 0.5 + 0.5 * Math.sin(time * 2.3) * Math.sin(time * 0.9 + 1);
  const room = !st.emergency;
  if (room && st.lights.warm) L.push({ x: 2.0, y: 2.2, z: 2.4, r: 6.0, c: [1.0, 0.78, 0.55].map(v => v * 1.2), halo: 0.08 });
  if (room && st.lights.cool) L.push({ x: 8.2, y: 5.6, z: 2.4, r: 6.0, c: [0.58, 0.74, 1.0].map(v => v * 1.1), halo: 0.08 });
  if (st.emergency) {
    const beacons = [[0.55, 0.55], [8.45, 0.55], [4.5, 5.6]];
    beacons.forEach(([x, y], i) => {
      const a = time * 3.2 + i * 2.1, s = Math.pow(Math.max(0, Math.sin(a)), 2);
      L.push({ x: x + Math.cos(a) * 0.6, y: y + Math.sin(a) * 0.6, z: 1.8, r: 7.5, c: [1.6 * (0.25 + s), 0.12 * (0.25 + s), 0.1 * (0.25 + s)], halo: 0.25 });
    });
  }
  if (st.reactorOn && st.lights.reactor && SPR.reactor) {
    const [rx, ry, rz] = anchorOf(SPR.reactor, 0, REACTOR_AT[0], REACTOR_AT[1], 0);
    const i = 1.0 + 0.75 * pulse;
    L.push({ x: rx, y: ry + 0.2, z: rz + 0.9, r: 6.0, c: [0.72 * i, 1.0 * i, 0.32 * i], halo: 0.35 });
  }
  const [ix, iy, iz] = interceptorPos();
  if (st.lights.weak) {
    const hull = SPR.hull, hidx = hullIndex();
    if (SPR.weakSpots.length) for (const w of SPR.weakSpots) {
      const [x, y, z] = anchorOf(w, frameIndex(w, hullDir(), 0), ix, iy, iz);
      if (weakHit[w.name] > time) L.push({ x, y, z, r: 1.6, c: [1.2, 0.45, 0.12].map(v => v * (0.5 + 0.5 * Math.random())), halo: 0.35 });
      else L.push({ x, y, z: z + 0.3, r: 2.6, c: [0.25, 0.55, 1.3].map(v => v * (0.7 + 0.3 * Math.sin(time * 4 + x))), halo: 0.22 });
    } else if (hull && !hull.standIn) {
      const [x, y, z] = anchorOf(hull, hidx, ix, iy, iz);
      L.push({ x, y, z, r: 2.8, c: [0.3, 0.62, 1.4].map(v => v * (0.8 + 0.4 * Math.sin(time * 4))), halo: 0.6 });
    } else {
      for (const s of [-1, 1]) L.push({ x: ix + s * 0.55, y: iy + 0.45, z: iz + 0.5, r: 2.6, c: [0.3, 0.62, 1.4].map(v => v * (0.8 + 0.4 * Math.sin(time * 4 + s))), halo: 0.6 });
    }
  }
  const eng = SPR.hull && !SPR.hull.standIn ? anchorOf(SPR.hull, hullIndex(), ix, iy, iz) : [ix + 1.15, iy, iz + 0.35];
  if (st.lights.engine) L.push({ x: eng[0], y: eng[1] + 0.3, z: eng[2], r: 2.6, c: [1.3, 0.55, 0.2].map(v => v * (0.8 + 0.2 * Math.sin(time * 37) * Math.sin(time * 23))), halo: 0.45 });
  if (st.lights.mouse && mouse.inside) L.push({ x: mouse.wx, y: mouse.wy, z: 1.1, r: 4.0, c: [1.1, 1.05, 0.95], halo: 0.25 });
  for (const f of flashes) {
    const a = 1 - f.t / f.dur;
    L.push({ x: f.x, y: f.y, z: f.z, r: f.r, c: f.c.map(v => v * f.k * a * a), halo: 0.55 * a, flash: true });
  }
  for (const b of bolts) L.push({ x: b.x, y: b.y, z: b.z, r: 2.4, c: [1.4, 0.38, 0.25], halo: 0 });
  return L;
}
function hullDir() { return SPR.hull && SPR.hull.dirs > 1 ? Math.round(4 * SPR.hull.dirs / 8) % SPR.hull.dirs * 8 / SPR.hull.dirs : 0; }   // facing the ship (left)
function hullIndex() { return SPR.hull ? frameIndex(SPR.hull, hullDir(), Math.floor(time * 10)) : 0; }

function render() {
  const lights = collectLights();
  const ambient = st.emergency ? [0.13, 0.06, 0.08] : [0.36, 0.39, 0.48];
  R.begin({ w: W, h: H, mode: st.mode, ambient: st.mode === 1 ? ambient : [1, 1, 1], lights: st.mode === 1 ? lights : [],
    proj: { sin: SIN, cos: COS, ppu: PPU, hr: HR }, depthScale: 1 / 80 });
  R.stars([cam.x, cam.y * SIN], S, time);
  const lit = st.mode === 1;

  // the deck's slab under the walls, and the hull's front face below the near wall
  const pad = SPR.wallH ? 0.6 : 0.4, [ax, ay] = toScreen(ROOM.x0 - pad, ROOM.y0 - pad, 0), [bx, by] = toScreen(ROOM.x1 + pad, ROOM.y1 + pad, 0), [, cy] = toScreen(0, ROOM.y1 + pad, -0.55);
  const dark = st.emergency && lit ? [0.1, 0.06, 0.07] : [0.13, 0.145, 0.18];
  R.blob('rect', (ax + bx) / 2, (ay + by) / 2, (bx - ax) / 2, (by - ay) / 2, [...dark, 1]);
  R.blob('rect', (ax + bx) / 2, (by + cy) / 2, (bx - ax) / 2, (cy - by) / 2, [dark[0] * 0.6, dark[1] * 0.6, dark[2] * 0.65, 1]);
  R.blob('rect', (ax + bx) / 2, by + 0.5, (bx - ax) / 2, 0.5, [0.45, 0.5, 0.6, 0.5]);

  // floor
  const F = SPR.floor, tw = F.tileW || 1, td = F.tileD || 1, fc = !(F.ox === 0 && F.oy === 0);
  for (let y = ROOM.y0; y < ROOM.y1 - 1e-6; y += td) for (let x = ROOM.x0; x < ROOM.x1 - 1e-6; x += tw)
    drawSprite(F, 0, fc ? x + tw / 2 : x, fc ? y + td / 2 : y, 0);

  // contact shadows (under everything that stands on the deck)
  const shadow = (x, y, rx, ry, a) => { const [sx, sy] = toScreen(x, y, 0); R.blob('shadow', sx, sy, rx * S, ry * S * SIN, [0, 0, 0], a, 2.2); };
  shadow(crew.x, crew.y + 0.04, 0.42, 0.34, 0.55);
  if (SPR.reactor) { const [hw, hd] = footprint(SPR.reactor); shadow(REACTOR_AT[0], REACTOR_AT[1] + 0.1, hw * 1.12, hd * 1.25, 0.55); }
  if (SPR.crate) { const [hw, hd] = footprint(SPR.crate); for (const [x, y, lvl] of CRATES) if (!lvl) shadow(x, y + 0.06, hw * 1.35, hd * 1.5, 0.45); }

  // everything that stands up, in painter's order by ground y; the depth buffer sorts out overlaps per pixel
  const items = [];
  const [csx, csy] = toScreen(crew.x, crew.y, 0.55);
  const crewDepth = crew.y * COS + 0.55 * SIN;
  const cutout = [csx, csy, 1.25 * S, crewDepth];
  // walls: 0.6 thick, outside the floor. wall_h origin = left end at the bottom of its front face (body north
  // of it); wall_v origin = north end of a segment, centred on the wall; the end piece sits at the south end.
  const T = 0.6;
  if (SPR.wallH) {
    const back = SPR.wallH, near = SPR.wallHLow;
    for (let x = ROOM.x0 - T; x < ROOM.x1 + T - 1e-6; x += back.tileW) items.push({ y: ROOM.y0 - T / 2, f: () => drawSprite(back, 0, x, ROOM.y0, 0) });
    for (let x = ROOM.x0 - T; x < ROOM.x1 + T - 1e-6; x += near.tileW) items.push({ y: ROOM.y1 + T / 2, f: () => drawSprite(near, 0, x, ROOM.y1 + T, 0, { cutout }) });
  }
  if (SPR.wallV) {
    // full height, then (if there's a low variant) a step down to the near wall's height over the last
    // stretch: full tiles | full end piece (front face) | low tiles | low end piece.
    const full = SPR.wallV, low = SPR.wallVLow, P = full.tileD, yEnd = ROOM.y1 + T;
    const stepped = low !== full && SPR.wallVEnd && SPR.wallVLowEnd, yStep = stepped ? yEnd - 0.4 - P : yEnd;
    for (const x of [ROOM.x0 - T / 2, ROOM.x1 + T / 2]) {
      const segs = [];
      for (let y = yStep - 0.4 - P; y + P > ROOM.y0 - T; y -= P) segs.push(y);
      items.push({ y: yStep - 0.2, f: () => {
        if (SPR.wallVEnd) drawSprite(SPR.wallVEnd, 0, x, yStep, 0);
        for (const y of segs) drawSprite(full, 0, x, y, 0);
      } });
      if (stepped) items.push({ y: yEnd - 0.2, f: () => { drawSprite(SPR.wallVLowEnd, 0, x, yEnd, 0); drawSprite(low, 0, x, yStep, 0); } });
    }
  }
  const crateH = SPR.crate ? SPR.crate.maxH || 0.9 : 0.9;
  if (SPR.crate) for (const [x, y, lvl] of CRATES) items.push({ y: y + lvl * 0.001, f: () => drawSprite(SPR.crate, 0, x, y, lvl * crateH, { scale: lvl ? 0.8 : 1 }) });
  if (SPR.reactor) items.push({ y: REACTOR_AT[1], f: () => {
    const R0 = SPR.reactor;
    if (st.reactorOn) drawSprite(R0, frameIndex(R0, 0, Math.floor(time * 12)), REACTOR_AT[0], REACTOR_AT[1], 0, { emissive: 1 });
    else if (SPR.reactorOff) drawSprite(SPR.reactorOff, 0, REACTOR_AT[0], REACTOR_AT[1], 0, { emissive: 0.6 });
    else drawSprite(R0, 0, REACTOR_AT[0], REACTOR_AT[1], 0, { emissive: 0 });
  } });
  items.push({ y: crew.y, f: () => { const [spr, f] = crewSprite(); drawSprite(spr, frameIndex(spr, crew.dir, f), crew.x, crew.y, 0, { tint: rgb(st.suit), emissive: 0.4 }); } });
  const [ix, iy, iz] = interceptorPos();
  items.push({ y: iy, f: () => {
    const hull = SPR.hull; if (!hull) return;
    const hidx = hullIndex();
    drawSprite(hull, hidx, ix, iy, iz, { emissive: 1 });
    const off = ASSETS.turret.offset || [0, 0], px = ix + off[0] * SIDE, py = iy + off[1];
    const aimDir = Math.atan2(crew.y - py, crew.x - px) / (Math.PI / 4);
    if (!SPR.turret && hull.standIn && SPR.crate) drawSprite(SPR.crate, 0, ix, iy, iz + crateH * hull.scale, { scale: 0.45, depthBias: 0.01 });
    for (const w of SPR.weakSpots) {
      const a = ASSETS.weakSpots.hit, twin = weakHit[w.name] > time && a && SPR.weakSpotsHit.find(h => h.name === w.name.replace(a[0], a[1]));
      const spr = twin || w;
      drawSprite(spr, frameIndex(spr, hullDir(), Math.floor(time * 10)), ix, iy, iz, { emissive: twin ? 0.4 : 0.6, depthBias: 0.02 });
    }
    if (SPR.turret) drawSprite(SPR.turret, frameIndex(SPR.turret, aimDir, 0), px, py, iz, { emissive: 1, depthBias: 0.03 });
  } });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.f();

  // light: halos around the sources, laser bolts
  if (lit || st.mode === 0) {
    for (const l of lights) {
      if (!l.halo) continue;
      const [sx, sy] = toScreen(l.x, l.y, l.z);
      const c = l.c, m = Math.max(c[0], c[1], c[2]);
      const rad = (l.flash ? 0.8 : 0.9) * S;
      R.blob('glow', sx, sy, rad, rad, [c[0] / m, c[1] / m, c[2] / m], l.halo * (lit ? 1 : 0.5), 3.5);
    }
    for (const b of bolts) {
      const [sx, sy] = toScreen(b.x, b.y, b.z), ang = Math.atan2(b.vy * SIN, b.vx), len = 0.55 * S;
      R.blob('glow', sx, sy, len, 0.09 * S, [1.0, 0.45, 0.3], 1.4, 2.5, ang);
      R.blob('glow', sx, sy, len * 0.7, 0.035 * S, [1.0, 0.95, 0.85], 1.6, 2.5, ang);
    }
  }
  const alarm = st.emergency && lit ? 0.92 + 0.08 * Math.sin(time * 6.4) : 1;
  R.end({ bloom: lit ? 0.85 : st.mode === 0 ? 0.5 : 0, threshold: 0.8, grade: [alarm, alarm * 0.97, alarm * 0.97] });
}

// ---------------------------------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------------------------------
const canvas = $('view');
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  W = Math.max(1, Math.round(r.width * DPR)); H = Math.max(1, Math.round(r.height * DPR));
  if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
}
function setMode(m) { st.mode = m; syncUI(); }
function setZoom(z) { st.zoom = z; syncUI(); }
function toggle(k) { st[k] = !st[k]; syncUI(); if (k === 'compare') requestAnimationFrame(resize); }
function syncUI() {
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', +b.dataset.mode === st.mode));
  document.querySelectorAll('[data-zoom]').forEach(b => b.classList.toggle('on', +b.dataset.zoom === st.zoom));
  $('emergency').classList.toggle('on', st.emergency);
  $('visor').classList.toggle('on', st.visor); $('visor').textContent = st.visor ? 'Visor down' : 'Visor up';
  $('compare').classList.toggle('on', st.compare);
  $('reactor').classList.toggle('on', st.reactorOn); $('reactor').textContent = st.reactorOn ? 'Reactor on' : 'Reactor off';
  document.body.classList.toggle('compare', st.compare);
  document.body.classList.toggle('alarm', st.emergency);
  for (const k in st.lights) { const c = $('l-' + k); if (c) c.checked = st.lights[k]; }
  $('suit').value = st.suit;
}
function buildUI() {
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(+b.dataset.mode));
  document.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => setZoom(+b.dataset.zoom));
  $('emergency').onclick = () => toggle('emergency');
  $('visor').onclick = () => toggle('visor');
  $('compare').onclick = () => toggle('compare');
  $('reactor').onclick = () => { st.reactorOn = !st.reactorOn; syncUI(); };
  for (const k in st.lights) { const c = $('l-' + k); if (c) c.onchange = () => { st.lights[k] = c.checked; }; }
  $('suit').oninput = (e) => { st.suit = e.target.value; };
  document.querySelectorAll('[data-suit]').forEach(b => { b.style.background = b.dataset.suit; b.onclick = () => { st.suit = b.dataset.suit; syncUI(); }; });
  document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) b.blur(); });
  $('hide').onclick = () => document.body.classList.toggle('nopanel');
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * DPR; mouse.y = (e.clientY - r.top) * DPR; mouse.inside = true;
  });
  canvas.addEventListener('mouseleave', () => { mouse.inside = false; });
  canvas.addEventListener('mousedown', (e) => { e.preventDefault(); popFlash(mouse.wx, mouse.wy, 0.6, [1.0, 0.9, 0.7], 5.5, 0.18); });
  addEventListener('resize', resize);
  syncUI();
  // what's loaded
  const rows = Object.keys(ASSETS).map(k => {
    const s = STATUS[k], cls = !s ? 'miss' : s.startsWith('stand-in') || s.startsWith('failed') ? 'stand' : 'ok';
    return `<div class="${cls}"><b>${k}</b> ${s || 'not rendered yet'}</div>`;
  });
  $('assets').innerHTML = rows.join('');
  $('gfx').textContent = `${R.isGL2 ? 'WebGL2' : 'WebGL1'} · ${R.hdr ? 'HDR' : '8-bit'} · depth ${R.hasFragDepth ? 'per pixel' : 'painter only'}`;
}

let last = 0, fpsAcc = 0, fpsN = 0;
function loop(ts) {
  const dt = Math.min(0.05, last ? (ts - last) / 1000 : 0.016); last = ts;
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { $('fps').textContent = (fpsN / fpsAcc).toFixed(0) + ' fps'; fpsAcc = 0; fpsN = 0; }
  resize();
  S = BASE_PX * st.zoom * DPR;
  const pw = !st.compare && !document.body.classList.contains('nopanel') ? ($('panel').offsetWidth + 14) * DPR : 0;
  VX = (W - pw) / 2;
  if (mouse.x >= 0) [mouse.wx, mouse.wy] = fromScreen(mouse.x, mouse.y);
  update(dt);
  try { render(); } catch (e) { fail(e.stack || e); return; }
  requestAnimationFrame(loop);
}

(async function main() {
  try {
    R = createRenderer(canvas);
    await load();
    buildUI();
    $('loading').hidden = true;
    if (Q.get('mouse')) { const [x, y] = Q.get('mouse').split(',').map(Number); mouse.wx = x; mouse.wy = y; mouse.inside = true; }
    if (Q.get('bolt')) { const [x, y, dx, dy] = Q.get('bolt').split(',').map(Number); bolts.push({ x, y, z: 0.75, vx: dx * 1e-6, vy: dy * 1e-6, life: 1e9 }); }   // for screenshots
    if (Q.get('flash')) { const [x, y] = Q.get('flash').split(',').map(Number); popFlash(x, y, 0.6, [1.0, 0.9, 0.7], 5.5, 1e9); }
    requestAnimationFrame(loop);
    if (!errors.length) document.title = 'Manifold Novum · Sprite prototype';
  } catch (e) { fail(e.stack || e); }
})();
