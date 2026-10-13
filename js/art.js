// Shared helpers and all procedural art. Everything is drawn with canvas paths;
// there are no image assets. Ship parts are drawn in ship-local pixels
// (origin = top-left corner of the ship interior, nose points to -y).
// T is only a length unit for art and layout; there is no gameplay grid.

const T = 48;                                 // layout unit in ship-local pixels
const TAU = Math.PI * 2;
const OUT = '#14161b';                        // universal outline color
const C = {
  hull: '#4a5263', hullDark: '#3a414f', hullLight: '#5f6879',
  floorA: '#6c7282', floorB: '#686e7d', grout: '#555b69',
  beltBase: '#30343c', beltFrame: '#1c1f25',
  rock: '#9a8a76', rockLight: '#b8a891', rockDark: '#6f6253',
  aster: '#6e6359', asterLight: '#8d8274', asterDark: '#4c433c',
  crate: '#a48c5c', crateDark: '#6e5a37', crateLight: '#c2aa76',
  suit: '#c4683a', suitDark: '#8e4724', skin: '#e6c19b', hair: '#3a2a21',
  glow: '#5fd6e4', window: '#5fa8c9', hazard: '#d2a62e', collect: '#ffe08a',
};
let ctx;                                      // set by game.js

// ---------------------------------------------------------------------------
// Math and path helpers
// ---------------------------------------------------------------------------
function rng(seed) {                          // mulberry32
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let uidCounter = 1;                                 // stable ids for things that come and go (enemies, fires, …)
const newUid = () => uidCounter++;
const lerp = (a, b, k) => a + (b - a) * k;
function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
function rot(x, y, a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }

function poly(pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.closePath();
}
function stroke(w = 2.5, col = OUT) {
  ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.stroke();
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function shadowEllipse(x, y, rx, ry, a = 0.35) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}
function octagon(x, y, r) {
  poly(Array.from({ length: 8 }, (_, i) => {
    const a = i / 8 * TAU + Math.PI / 8;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r];
  }));
}



function lumpShape(seed, n, jitter) {
  const r = rng(seed), pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (r() - 0.5) * 0.35;
    pts.push([Math.cos(a), Math.sin(a), 1 - jitter + r() * jitter * 1.3]);
  }
  const craters = [];
  for (let i = 0; i < 3; i++) craters.push([(r() - 0.5) * 0.9, (r() - 0.5) * 0.9, 0.12 + r() * 0.14]);
  return { pts, craters };
}

function drawLump(shape, x, y, rad, rotation, pal, withCraters) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
  const pts = shape.pts.map(([cx, cy, m]) => [cx * rad * m, cy * rad * m]);
  poly(pts);
  const g = ctx.createRadialGradient(-rad * 0.4, -rad * 0.45, rad * 0.1, 0, 0, rad * 1.1);
  g.addColorStop(0, pal[0]); g.addColorStop(0.55, pal[1]); g.addColorStop(1, pal[2]);
  ctx.fillStyle = g; ctx.fill();
  if (withCraters) {
    ctx.save(); poly(pts); ctx.clip();
    for (const [cx, cy, cr] of shape.craters) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.ellipse(cx * rad, cy * rad, cr * rad, cr * rad * 0.85, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(cx * rad + 1, cy * rad + 1, cr * rad, cr * rad * 0.85, 0, 0.2, 2.2); ctx.stroke();
    }
    ctx.restore();
  }
  poly(pts); stroke(withCraters ? 3 : 2);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Space background (screen space, parallax against the camera)
// ---------------------------------------------------------------------------
const STAR_LAYERS = [
  { n: 260, f: 0.04, size: [0.6, 1.1], alpha: 0.45 },
  { n: 120, f: 0.10, size: [1.0, 1.6], alpha: 0.7 },
  { n: 45,  f: 0.22, size: [1.4, 2.3], alpha: 0.95 },
].map((L, li) => {
  const r = rng(900 + li);
  L.stars = Array.from({ length: L.n }, () => ({
    x: r(), y: r(), s: L.size[0] + r() * (L.size[1] - L.size[0]),
    tint: r() < 0.15 ? '#ffd9a8' : r() < 0.3 ? '#a8c8ff' : '#ffffff', tw: r() * 6,
  }));
  return L;
});
const NEBULAE = [[0.2, 0.3, 0.45, 'rgba(90,60,140,0.16)'], [0.7, 0.8, 0.4, 'rgba(40,90,120,0.14)'],
                 [0.85, 0.15, 0.3, 'rgba(140,70,60,0.08)']];

function drawSpace(t, cam, vw, vh) {
  ctx.fillStyle = '#080b14'; ctx.fillRect(0, 0, vw, vh);
  const D = Math.hypot(vw, vh) + 40;          // wrap box covers the screen at any rotation
  ctx.save(); ctx.translate(vw / 2, vh / 2); ctx.rotate(cam.rot);
  const wrap = (v) => ((v % D) + D) % D - D / 2;
  for (const [fx, fy, fr, col] of NEBULAE) {
    const x = wrap(fx * D - cam.x * 0.015), y = wrap(fy * D - cam.y * 0.015), r = fr * D;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(-D / 2, -D / 2, D, D);
  }
  for (const L of STAR_LAYERS) {
    for (const s of L.stars) {
      ctx.globalAlpha = L.alpha * (0.75 + 0.25 * Math.sin(t * 2 + s.tw));
      ctx.fillStyle = s.tint;
      ctx.fillRect(wrap(s.x * D - cam.x * L.f), wrap(s.y * D - cam.y * L.f), s.s, s.s);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Hull
// ---------------------------------------------------------------------------
function drawEngines(t, throttle, ys, flameOnly = false) {
  for (const ey of ys) {
    const x = 0, y = ey * T;
    if (throttle > 0.02) {                     // no flame at all when idle
      const flick = 1 + 0.12 * Math.sin(t * 31 + ey) + 0.08 * Math.sin(t * 17);
      const len = T * (0.3 + 1.9 * throttle) * flick;
      const g = ctx.createRadialGradient(x - T * 0.4, y, 2, x - T * 0.4, y, len);
      g.addColorStop(0, `rgba(255,240,200,${0.95 * Math.min(1, throttle * 2)})`); g.addColorStop(0.25, 'rgba(255,170,70,0.75)');
      g.addColorStop(0.6, 'rgba(230,80,40,0.25)'); g.addColorStop(1, 'rgba(200,40,40,0)');
      ctx.globalAlpha = Math.min(1, throttle * 1.5); ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x - T * 0.4 - len * 0.45, y, len * 0.6, T * (0.12 + 0.3 * throttle), 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (flameOnly) continue;
    // nozzle bell
    poly([[x + 6, y - T * 0.5], [x - T * 0.55, y - T * 0.44], [x - T * 0.55, y + T * 0.44], [x + 6, y + T * 0.5]]);
    const ng = ctx.createLinearGradient(0, y - T * 0.5, 0, y + T * 0.5);
    ng.addColorStop(0, '#6d7688'); ng.addColorStop(0.5, '#454c5a'); ng.addColorStop(1, '#2c313b');
    ctx.fillStyle = ng; ctx.fill(); stroke(2.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    for (const bx of [-0.18, -0.36]) { ctx.beginPath(); ctx.moveTo(x + bx * T, y - T * 0.46); ctx.lineTo(x + bx * T, y + T * 0.46); ctx.stroke(); }
    rr(x - T * 0.62, y - T * 0.34, 7, T * 0.68, 2);
    // exhaust plate: cold grey at rest, glowing as it heats up
    ctx.fillStyle = `rgb(${42 + 213 * throttle | 0},${46 + 124 * throttle | 0},${54 + 6 * throttle | 0})`; ctx.fill(); stroke(1.5);
  }
}


function drawSeat(cx, cy, face) {
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(face);
  shadowEllipse(3, 4, T * 0.32, T * 0.3, 0.3);
  rr(-T * 0.38, -T * 0.3, T * 0.16, T * 0.6, 6); ctx.fillStyle = '#2f3542'; ctx.fill(); stroke(2);
  rr(-T * 0.27, -T * 0.25, T * 0.46, T * 0.5, 9);
  const g = ctx.createRadialGradient(-T * 0.05, -T * 0.08, 2, 0, 0, T * 0.35);
  g.addColorStop(0, '#6a7489'); g.addColorStop(1, '#3f4757');
  ctx.fillStyle = g; ctx.fill(); stroke(2);
  for (const s of [-1, 1]) { rr(-T * 0.22, s * T * 0.27 - T * 0.05, T * 0.36, T * 0.1, 3); ctx.fillStyle = '#2f3542'; ctx.fill(); stroke(1.5); }
  ctx.restore();
}

function drawGun(cx, cy, ang, flash) {
  shadowEllipse(cx + 4, cy + 6, T * 0.58, T * 0.48, 0.4);
  ctx.beginPath(); ctx.arc(cx, cy, T * 0.56, 0, TAU);
  const bg = ctx.createRadialGradient(cx - 6, cy - 8, 2, cx, cy, T * 0.56);
  bg.addColorStop(0, '#565e6e'); bg.addColorStop(1, '#2b303a');
  ctx.fillStyle = bg; ctx.fill(); stroke(3);
  ctx.beginPath(); ctx.arc(cx, cy, T * 0.43, 0, TAU); ctx.strokeStyle = '#626b7d'; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * T * 0.49, cy + Math.sin(a) * T * 0.49, 1.8, 0, TAU);
    ctx.fillStyle = '#1d2027'; ctx.fill();
  }
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
  const rec = flash * 6;
  rr(T * 0.05 - rec, -T * 0.1, T * 0.92, T * 0.2, 3);
  const brl = ctx.createLinearGradient(0, -T * 0.1, 0, T * 0.1);
  brl.addColorStop(0, '#4a515e'); brl.addColorStop(1, '#1f2329');
  ctx.fillStyle = brl; ctx.fill(); stroke(2.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2;
  for (const bx of [0.45, 0.6]) { ctx.beginPath(); ctx.moveTo(T * bx - rec, -T * 0.08); ctx.lineTo(T * bx - rec, T * 0.08); ctx.stroke(); }
  rr(T * 0.86 - rec, -T * 0.14, T * 0.16, T * 0.28, 3); ctx.fillStyle = '#596274'; ctx.fill(); stroke(2);
  rr(-T * 0.36 - rec * 0.5, -T * 0.3, T * 0.64, T * 0.6, 11);
  const hg = ctx.createLinearGradient(0, -T * 0.3, 0, T * 0.3);
  hg.addColorStop(0, '#9aa4b7'); hg.addColorStop(1, '#5c6577');
  ctx.fillStyle = hg; ctx.fill(); stroke(2.5);
  ctx.fillStyle = C.hazard; ctx.fillRect(-T * 0.26 - rec * 0.5, -T * 0.3, T * 0.08, T * 0.6);
  ctx.beginPath(); ctx.arc(T * 0.02 - rec * 0.5, 0, T * 0.11, 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);
  if (flash > 0) {
    ctx.globalAlpha = flash;
    const g = ctx.createRadialGradient(T * 1.15, 0, 0, T * 1.15, 0, T * 0.5);
    g.addColorStop(0, '#fff6d0'); g.addColorStop(0.4, 'rgba(255,190,80,0.8)'); g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(T * 1.15, 0, T * 0.5, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}


// Top-down crew member, always in a spacesuit. face = heading (0 = +x).
// visor: false = helmet visor up (face visible), true = visor down (outside the ship).
function drawCrew(x, y, face, walk, visor, color = C.suit) {
  ctx.save(); ctx.translate(x, y);
  shadowEllipse(3, 5, T * 0.32, T * 0.27, 0.4);
  ctx.rotate(face);
  rr(-T * 0.36, -T * 0.2, T * 0.17, T * 0.4, 4);                       // life-support pack
  ctx.fillStyle = '#8b93a3'; ctx.fill(); stroke(2);
  ctx.fillStyle = color; ctx.fillRect(-T * 0.33, -T * 0.06, T * 0.1, T * 0.12);
  const swing = Math.sin(walk) * T * 0.07;
  for (const s of [-1, 1]) {                                            // gloves
    ctx.beginPath(); ctx.arc(T * 0.08 + swing * s, s * T * 0.29, T * 0.085, 0, TAU);
    ctx.fillStyle = '#9aa1ad'; ctx.fill(); stroke(2);
  }
  ctx.beginPath(); ctx.ellipse(0, 0, T * 0.19, T * 0.31, 0, 0, TAU);     // bulky suit
  const g = ctx.createLinearGradient(-T * 0.19, 0, T * 0.19, 0);
  g.addColorStop(0, '#b9bfca'); g.addColorStop(1, '#eef0f4');
  ctx.fillStyle = g; ctx.fill(); stroke(2.5);
  for (const s of [-1, 1]) {                                            // orange shoulder bands
    ctx.beginPath(); ctx.ellipse(0, s * T * 0.22, T * 0.12, T * 0.06, 0, 0, TAU); ctx.fillStyle = color; ctx.fill(); stroke(1.5);
  }
  ctx.beginPath(); ctx.arc(T * 0.03, 0, T * 0.17, 0, TAU);               // helmet shell
  ctx.fillStyle = '#e8ebf0'; ctx.fill(); stroke(2.2);
  if (visor) {
    ctx.beginPath(); ctx.arc(T * 0.03, 0, T * 0.14, -1.35, 1.35); ctx.closePath();
    const vg = ctx.createLinearGradient(0, -T * 0.14, T * 0.15, T * 0.14);
    vg.addColorStop(0, '#ffe39a'); vg.addColorStop(0.5, '#d2a62e'); vg.addColorStop(1, '#7a5a12');
    ctx.fillStyle = vg; ctx.fill(); stroke(1.5);
    ctx.beginPath(); ctx.arc(T * 0.05, -T * 0.02, T * 0.09, -1.0, -0.3); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(T * 0.04, 0, T * 0.12, 0, TAU);            // open helmet: face inside
    ctx.fillStyle = C.skin; ctx.fill(); stroke(1.5);
    ctx.beginPath(); ctx.arc(T * 0.04, 0, T * 0.12, Math.PI * 0.55, Math.PI * 1.45); ctx.lineTo(T * 0.01, 0); ctx.closePath();
    ctx.fillStyle = C.hair; ctx.fill();
    ctx.beginPath(); ctx.arc(T * 0.0, 0, T * 0.15, Math.PI * 0.6, Math.PI * 1.4);   // visor folded back
    ctx.strokeStyle = '#d2a62e'; ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Ship structure. Layout data comes in layout units; everything is scaled by T here.
// ---------------------------------------------------------------------------
const px = (pts) => pts.map(([x, y]) => [x * T, y * T]);
function rectPath(r, ccw = false) {                // sub-path, no beginPath
  const x0 = r.x * T, y0 = r.y * T, x1 = (r.x + r.w) * T, y1 = (r.y + r.h) * T;
  if (ccw) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y0); }
  else { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); }
  ctx.closePath();
}

// Lighten (k > 0) or darken (k < 0) a #rrggbb color.
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(clamp(k > 0 ? c + (255 - c) * k : c * (1 + k), 0, 255));
  return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`;
}

// Split a rect into irregular plates (recursive halving at random-ish positions).
const PLATE_CACHE = new Map();
function plates(r, seed, maxSize) {
  const key = `${seed}|${r.x}|${r.y}|${r.w}|${r.h}|${maxSize}`;
  if (!PLATE_CACHE.has(key)) PLATE_CACHE.set(key, makePlates(r, seed, maxSize));
  return PLATE_CACHE.get(key);
}
function makePlates(r, seed, maxSize) {
  const rand = rng(seed), out = [];
  (function split(q, depth) {
    const big = Math.max(q.w, q.h);
    if (big <= maxSize * (0.7 + rand() * 0.6) || depth > 8) { out.push(q); return; }
    const k = 0.3 + rand() * 0.4;
    if (q.w > q.h * (0.8 + rand() * 0.4)) {
      const w = q.w * k;
      split({ x: q.x, y: q.y, w, h: q.h }, depth + 1); split({ x: q.x + w, y: q.y, w: q.w - w, h: q.h }, depth + 1);
    } else {
      const h = q.h * k;
      split({ x: q.x, y: q.y, w: q.w, h }, depth + 1); split({ x: q.x, y: q.y + h, w: q.w, h: q.h - h }, depth + 1);
    }
  })(r, 0);
  return out.map(q => ({ ...q, r: rand() }));
}

function rivets(x, y, w, h, col = 'rgba(0,0,0,0.25)', inset = 5) {
  ctx.fillStyle = col;
  for (const [rx, ry] of [[inset, inset], [w - inset - 2, inset], [inset, h - inset - 2], [w - inset - 2, h - inset - 2]])
    ctx.fillRect(x + rx, y + ry, 2.5, 2.5);
}

const HULL_PLATES = plates({ x: -2, y: -4, w: 49, h: 31 }, 77, 4.5);
function drawShipHull(t, hull, guns, engine) {
  drawEngineBell(t, engine);
  const pts = px(hull);
  ctx.save(); poly(pts); ctx.clip();
  for (const p of HULL_PLATES) {               // mismatched hull plates, a few rusty replacements
    const x = p.x * T, y = p.y * T, w = p.w * T, h = p.h * T;
    ctx.fillStyle = p.r < 0.05 ? shade('#5e5650', (p.r - 0.025) * 3) : shade(C.hull, (p.r - 0.5) * 0.22);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    rivets(x, y, w, h, 'rgba(0,0,0,0.3)', 6);
  }
  const g = ctx.createLinearGradient(0, -4 * T, 0, 27 * T);    // light from the top
  g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g; ctx.fillRect(-3 * T, -5 * T, 52 * T, 33 * T);
  poly(pts); ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 16; ctx.stroke();
  ctx.restore();
  poly(pts); stroke(3.5);
  for (const [lx, ly, col] of [[-1.6, 9.0, '#ff5a4a'], [46, 9.0, '#5aff8a'], [13.2, 25.0, '#ffffff']]) {   // nav lights, steady
    const on = true, x = lx * T, y = ly * T;
    if (on) {
      const lg = ctx.createRadialGradient(x, y, 0, x, y, 16);
      lg.addColorStop(0, col); lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55; ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fillStyle = on ? col : '#3a3f4a'; ctx.fill(); stroke(1.5);
  }
}


// Hull between the decks: conduits and vents, avoiding the shafts.
function drawSpine(y0, y1, x0, x1, holes) {
  const ym = (y0 + y1) / 2 * T;
  for (const [dy, col, w] of [[-0.75, '#3b6f7a', 5], [0.1, '#6a6f7a', 8], [0.8, '#7a5a3b', 5]]) {
    ctx.strokeStyle = OUT; ctx.lineWidth = w + 4;
    ctx.beginPath(); ctx.moveTo(x0 * T, ym + dy * T); ctx.lineTo(x1 * T, ym + dy * T); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  }
  const rand = rng(31);
  for (let x = x0 + 0.8; x < x1 - 0.8; x += 1.3 + rand() * 2.2) {   // pipe clamps
    if (holes.some(h => x > h.x - 0.3 && x < h.x + h.w + 0.3)) continue;
    rr(x * T - 4, ym - 1.0 * T, 8, 2.0 * T, 2); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(1.5);
  }
}

// Floor plates per rect, tinted by zone, with one inner shadow along all walls.
function drawFloors(rects, tintOf) {
  rects.forEach((r, i) => {
    const base = tintOf(r);
    ctx.save(); ctx.beginPath(); rectPath(r); ctx.clip();
    const small = Math.min(r.w, r.h) < 3;
    for (const p of plates(r, 500 + i * 17, small ? 9 : 2.6)) {
      const x = p.x * T, y = p.y * T, w = p.w * T, h = p.h * T;
      const odd = p.r < 0.07, diamond = p.r > 0.93;   // a few replacement plates that don't match
      ctx.fillStyle = small ? shade(base, -0.25) : diamond ? shade('#7f8794', -0.12) : shade(base, (p.r - 0.5) * 0.14 - (odd ? 0.08 : 0));
      ctx.fillRect(x, y, w, h);
      if (odd) { ctx.fillStyle = 'rgba(130,85,40,0.16)'; ctx.fillRect(x, y, w, h); }   // rust bloom
      if (diamond || small) {                      // tread pattern
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
        for (let k = -h; k < w; k += 9) { ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); ctx.stroke(); }
        ctx.restore();
      }
      ctx.strokeStyle = C.grout; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
      rivets(x, y, w, h);
    }
    ctx.restore();
  });
  // inner shadow: fill everything except the floor with a blurred shadow, clipped to the floor
  ctx.save();
  ctx.beginPath(); for (const r of rects) rectPath(r); ctx.clip();
  const bx0 = Math.min(...rects.map(r => r.x)) - 10, by0 = Math.min(...rects.map(r => r.y)) - 10;   // a frame around all of them
  const bx1 = Math.max(...rects.map(r => r.x + r.w)) + 10, by1 = Math.max(...rects.map(r => r.y + r.h)) + 10;
  ctx.beginPath(); ctx.rect(bx0 * T, by0 * T, (bx1 - bx0) * T, (by1 - by0) * T); for (const r of rects) rectPath(r, true);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 22; ctx.fillStyle = '#000'; ctx.fill('nonzero');
  ctx.restore();
}

function drawRoomLabel(r) {
  if (GFX.on && drawRoomPlaque(r)) return;          // a plaque on the back wall (js/interior.js)
  const q = r.rects[0];
  ctx.save();
  ctx.font = `700 ${T * 0.36}px system-ui, sans-serif`; ctx.textBaseline = 'top';
  ctx.letterSpacing = '3px';
  ctx.fillStyle = r.zone.label; ctx.globalAlpha = 0.4;
  ctx.fillText(r.name.toUpperCase(), (q.x + 0.4) * T, (q.y + 0.35) * T);
  ctx.restore();
}

// Status lamp: green = open/ready, red = closed, amber blink = busy.
function lamp(x, y, state, t) {
  const col = state === 'open' ? '#47e07a' : state === 'busy' ? (Math.sin(t * 14) > 0 ? '#ffb347' : '#6b4a20') : '#e2574c';
  ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fillStyle = col; ctx.fill(); stroke(1.3);
}

function hazardStripe(x, y, w, h) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = C.hazard; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#2b2b2b';
  for (let i = -h; i < w + h; i += 14) poly([[x + i, y + h], [x + i + 7, y + h], [x + i + 7 + h, y], [x + i + h, y]]), ctx.fill();
  ctx.restore();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
}

// Sliding double door filling rect r (layout units); open in 0..1.
function drawSlideDoor(r, open) {
  const x = r.x * T, y = r.y * T, w = r.w * T, h = r.h * T;
  const pw = (w / 2) * (1 - open);
  if (pw < 0.5) return;
  for (const side of [0, 1]) {
    const dx = side ? x + w - pw : x;
    ctx.fillStyle = '#7a8396'; ctx.fillRect(dx, y + 2, pw, h - 4);
    ctx.fillStyle = C.hazard; ctx.fillRect(side ? dx : dx + pw - 5, y + 2, 5, h - 4);
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(dx, y + 2, pw, h - 4);
  }
}

function drawDeckLock(L, t) {
  const c = L.chamber, x = c.x * T, y = c.y * T, w = c.w * T, h = c.h * T;
  ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(210,166,46,0.75)'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 6, y + 6, w - 12, h - 12); ctx.restore();
  if (L.phase === 'cycling') {                     // air rushing in/out: pulsing glow + progress ring
    const k = L.t / LOCK_CYCLE;
    ctx.fillStyle = `rgba(150,200,255,${0.12 + 0.1 * Math.sin(t * 18)})`; ctx.fillRect(x, y, w, h);
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, T * 0.32, -Math.PI / 2, -Math.PI / 2 + k * TAU);
    ctx.strokeStyle = 'rgba(20,22,27,0.6)'; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = '#ffd36a'; ctx.lineWidth = 3.5; ctx.stroke();
  }
  for (const s of ['top', 'bottom']) {
    drawSlideDoor(L.doorRect[s], L.doors[s]);
    const busy = L.phase !== 'idle';
    const ly = s === 'top' ? L.doorRect.top.y * T - 7 : (L.doorRect.bottom.y + L.doorRect.bottom.h) * T + 7;
    lamp(x - 9, ly, busy ? 'busy' : L.open === s ? 'open' : 'closed', t);
  }
}


// Capacitor bank: a cabinet of cells, lit cells hold charge.
function drawCapacitor(cap, max, t) {
  const name = broken(cap) ? `systems/cap${max}_broken` : `systems/cap${max}_c${clamp(cap.charge, 0, max)}${cap.pulse > 0 && cap.charge > 0 ? '_pulse' : ''}`;
  if (spr(name, 0, cap.x, cap.y, 0, { emissive: 0.7, pick: [max * 0.3, 1.0] })) {
    worldText(cap.x, cap.y - 0.45, 1.05, `${cap.charge}/${max}`, `700 ${T * 0.22}px system-ui, sans-serif`, broken(cap) ? '#ff8a78' : C.glow, { base: 'bottom', outline: 'rgba(10,12,18,0.7)', sortY: cap.y + 0.01, depthBias: 0.05 });
    return;
  }
  const cw = T * 0.42, gap = 5, w = max * cw + (max - 1) * gap + 14, h = T * 0.9;
  const x = cap.x * T - w / 2, y = cap.y * T - h / 2;
  shadowEllipse(cap.x * T + 4, cap.y * T + 6, w * 0.55, h * 0.5, 0.3);
  rr(x, y, w, h, 6);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#525a6b'); g.addColorStop(1, '#343a47');
  ctx.fillStyle = g; ctx.fill(); stroke(2.5);
  for (let i = 0; i < max; i++) {
    const cx = x + 7 + i * (cw + gap), on = i < cap.charge;
    rr(cx, y + 7, cw, h - 14, 4);
    ctx.fillStyle = on ? '#1d3a44' : '#1c1f25'; ctx.fill(); stroke(1.5);
    if (on) {
      const pulse = 0.75 + 0.25 * Math.sin(t * 3 + i);
      const lg = ctx.createLinearGradient(0, y + 7, 0, y + h - 7);
      lg.addColorStop(0, `rgba(233,253,255,${pulse})`); lg.addColorStop(1, `rgba(95,214,228,${pulse * 0.8})`);
      rr(cx + 3, y + 10, cw - 6, h - 20, 3); ctx.fillStyle = lg; ctx.fill();
    }
  }
  ctx.fillStyle = C.glow; ctx.font = `700 ${T * 0.22}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(`${cap.charge}/${max}`, cap.x * T, y - 3); ctx.textAlign = 'left';
}

// Console desk against a wall at (x, y) with a seat in front; face = operator's view direction.
function drawStation(st, t) {
  {                                                   // sprites: the desk (helm / security), the seat
    const kind = st.name === 'Helm' ? 'helm' : 'security', col = zoneAtX(st.x) === ZONES[0] ? 0 : zoneAtX(st.x) === ZONES[1] ? 1 : 2;
    const off = typeof CAPACITORS !== 'undefined' && (CAPACITORS[col].charge <= 0 || broken(CAPACITORS[col]));
    const [sx, sy] = rot(0, 1.05, st.face + Math.PI / 2);
    if (sprReady(`systems/${kind}`, 'systems/seat')) {
      if (off) spr(`systems/${kind}_off`, 0, st.x, st.y, 0, { emissive: 0.35, pick: [0.8, 1.2] });   // (no power: dark screens; js/lights.js gives it a standby LED)
      else spr(`systems/${kind}`, Math.floor(t * 2 + st.x) % 4, st.x, st.y, 0, { emissive: 0.8, pick: [0.8, 1.2] });
      spr('systems/seat', GFX.frameIndex('systems/seat', st.face), st.x + sx, st.y + sy, 0);
      ctx.save();
      ctx.font = `600 ${T * 0.2}px system-ui, sans-serif`; ctx.fillStyle = 'rgba(232,236,244,0.55)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const [lx, ly] = rot(0, T * 1.75, st.face + Math.PI / 2);
      ctx.fillText(st.name, st.x * T + lx, st.y * T + ly);
      ctx.restore();
      return;
    }
  }
  ctx.save(); ctx.translate(st.x * T, st.y * T); ctx.rotate(st.face + Math.PI / 2);
  // local frame: wall along y = 0, room towards +y
  const w = T * 1.6, d = T * 0.6;
  const lg = ctx.createRadialGradient(0, d, 0, 0, d, T * 1.4);
  lg.addColorStop(0, 'rgba(95,214,228,0.16)'); lg.addColorStop(1, 'rgba(95,214,228,0)');
  ctx.fillStyle = lg; ctx.fillRect(-T * 1.4, 0, T * 2.8, T * 1.8);
  rr(-w / 2, 0, w, d, 6);
  const g = ctx.createLinearGradient(0, 0, 0, d);
  g.addColorStop(0, '#2f3542'); g.addColorStop(1, '#4a5262');
  ctx.fillStyle = g; ctx.fill(); stroke(2.5);
  rr(-w / 2 + 6, 5, w - 12, d - 14, 3); ctx.fillStyle = '#28536e'; ctx.fill(); stroke(1.5);
  ctx.fillStyle = 'rgba(200,255,240,0.75)';
  for (let j = 0; j < 3; j++) ctx.fillRect(-w / 2 + 11, 9 + j * 6, (w - 30) * (0.3 + 0.6 * Math.abs(Math.sin(t * 0.9 + j * 1.7 + st.x))), 2.5);
  for (let j = 0; j < 3; j++) {
    ctx.fillStyle = ['#e2574c', '#e8c34f', '#5fd6a0'][j];
    ctx.beginPath(); ctx.arc(w / 2 - 12 + (j - 1) * 0, 9 + j * 6, 2, 0, TAU); ctx.fill();
  }
  ctx.restore();
  const [sx, sy] = rot(0, T * 1.05, st.face + Math.PI / 2);
  drawSeat(st.x * T + sx, st.y * T + sy, st.face);
  ctx.save();
  ctx.font = `600 ${T * 0.2}px system-ui, sans-serif`; ctx.fillStyle = 'rgba(232,236,244,0.55)';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const vertical = Math.abs(Math.sin(st.face)) > 0.5;   // console on a top/bottom wall
  const [lx, ly] = vertical ? rot(0, T * 1.75, st.face + Math.PI / 2) : [Math.cos(st.face) * -T * 0.3, T * 1.1];
  ctx.fillText(st.name, st.x * T + lx, st.y * T + ly);
  ctx.restore();
}

// Reactor: half pizza oven, half vending machine, wrapped in cables. Front faces +y.
// Has a fuel-cell slot (front middle) for later.
function drawReactor(R, t) {
  {                                                   // sprite: ship/reactor (6-frame core loop) / reactor_off
    const fuel = typeof power !== 'undefined' ? power.reactor.fuel : 1, over = typeof power !== 'undefined' && power.overcharge;
    const dead = !fuel || broken(R);
    if (sprReady('ship/reactor', 'ship/reactor_off')) {
      if (broken(R) && sprReady('ship/reactor_broken'))   // cracked, scorched, sparking; the core flickers now and then (frame 1)
        spr('ship/reactor_broken', hash01(Math.floor(t * 9) + 7) < 0.18 ? 1 : 0, R.x, R.y, 0, { emissive: 0.6, pick: [R.w / 2, 2.2] });
      else if (dead) spr('ship/reactor_off', 0, R.x, R.y, 0, { emissive: 0.4, pick: [R.w / 2, 2.2] });
      else spr('ship/reactor', Math.floor(t * (over ? 14 : 6)) % 6, R.x, R.y, 0, { emissive: over ? 1 : 0.7, pick: [R.w / 2, 2.2] });
      if (over && !dead) labelAt(R.x, R.y - R.h / 2, 2.1, 'OVERCHARGED', `800 ${T * 0.2}px system-ui, sans-serif`, '#ffd28a', 'bottom', 'rgba(10,12,18,0.8)');
      return;
    }
  }
  const w = R.w * T, h = R.h * T, x = R.x * T - w / 2, y = R.y * T - h / 2;
  const top = h * 0.58;                                     // top surface depth; rest is the front face
  shadowEllipse(R.x * T + 6, R.y * T + 10, w * 0.6, h * 0.55, 0.35);
  // cable spaghetti behind the machine
  const rand = rng(808);
  for (let i = 0; i < 9; i++) {
    const sx = x + w * (0.1 + rand() * 0.8), sy = y + 6;
    const ex = x + w * (rand() * 1.6 - 0.3), ey = y - T * (0.6 + rand() * 1.4);
    ctx.beginPath(); ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx + (rand() - 0.5) * T * 2, sy - T * 1.2, ex + (rand() - 0.5) * T, ey + T * 0.8, ex, ey);
    ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = ['#c9662e', '#2e6ec9', '#d2a62e', '#3a9a5a', '#7ad0e0', '#c0392b'][i % 6]; ctx.lineWidth = 3.5; ctx.stroke();
  }
  // body: top surface
  rr(x, y, w, top + 8, 8);
  const g = ctx.createLinearGradient(0, y, 0, y + top);
  g.addColorStop(0, '#a85a3a'); g.addColorStop(1, '#8c4630');
  ctx.fillStyle = g; ctx.fill(); stroke(3);
  // oven dome + chimney on top
  ctx.beginPath(); ctx.ellipse(x + w * 0.3, y + top * 0.5, w * 0.2, top * 0.38, 0, 0, TAU);
  ctx.fillStyle = '#b8a48a'; ctx.fill(); stroke(2);
  ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1.5;          // bricks
  for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + w * 0.1, y + top * (0.5 + i * 0.15)); ctx.lineTo(x + w * 0.5, y + top * (0.5 + i * 0.15)); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(x + w * 0.3, y + top * 0.3, T * 0.2, 0, TAU); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(2);
  ctx.beginPath(); ctx.arc(x + w * 0.3, y + top * 0.3, T * 0.12, 0, TAU); ctx.fillStyle = '#1c1f25'; ctx.fill();
  for (let i = 0; i < 3; i++) {                                       // lazy smoke from the chimney
    const k = (t * 0.25 + i / 3) % 1;
    ctx.beginPath(); ctx.arc(x + w * 0.3 + Math.sin(t + i * 2) * 6, y + top * 0.3 - k * T * 0.9, T * (0.1 + k * 0.2), 0, TAU);
    ctx.fillStyle = `rgba(200,200,205,${0.25 * (1 - k)})`; ctx.fill();
  }
  // vent grille and a sticker on top right
  rr(x + w * 0.58, y + top * 0.18, w * 0.34, top * 0.3, 3); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);
  ctx.strokeStyle = '#5a6272'; ctx.lineWidth = 2;
  for (let i = 1; i < 7; i++) { ctx.beginPath(); ctx.moveTo(x + w * 0.58 + i * w * 0.34 / 7, y + top * 0.22); ctx.lineTo(x + w * 0.58 + i * w * 0.34 / 7, y + top * 0.44); ctx.stroke(); }
  ctx.save(); ctx.translate(x + w * 0.76, y + top * 0.72); ctx.rotate(-0.08);
  ctx.fillStyle = '#f2df6b'; ctx.fillRect(-T * 0.55, -T * 0.13, T * 1.1, T * 0.26);
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.strokeRect(-T * 0.55, -T * 0.13, T * 1.1, T * 0.26);
  ctx.fillStyle = '#2b2b2b'; ctx.font = `800 ${T * 0.15}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('REAKTOMAT 3000', 0, 1); ctx.textAlign = 'left';
  ctx.restore();
  // front face
  const fy = y + top;
  rr(x, fy, w, h - top, 6);
  const fg = ctx.createLinearGradient(0, fy, 0, y + h);
  fg.addColorStop(0, '#6e3624'); fg.addColorStop(1, '#4e2618');
  ctx.fillStyle = fg; ctx.fill(); stroke(3);
  const fh = h - top;
  // oven window (left): warm glow, gentle
  const ow = w * 0.36, ox = x + w * 0.06, oy = fy + fh * 0.18, oh = fh * 0.62;
  rr(ox, oy, ow, oh, 8); ctx.fillStyle = '#1c1210'; ctx.fill(); stroke(2);
  const glow = 0.8 + 0.08 * Math.sin(t * 2.1) + 0.05 * Math.sin(t * 5.3);
  const og = ctx.createRadialGradient(ox + ow / 2, oy + oh * 0.8, 2, ox + ow / 2, oy + oh * 0.6, ow * 0.6);
  og.addColorStop(0, `rgba(255,220,140,${glow})`); og.addColorStop(0.5, `rgba(240,120,40,${glow * 0.8})`); og.addColorStop(1, 'rgba(120,30,10,0)');
  rr(ox + 3, oy + 3, ow - 6, oh - 6, 6); ctx.fillStyle = og; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ox + 8, oy + 6); ctx.lineTo(ox + 20, oy + oh - 8); ctx.stroke();
  rr(ox + ow * 0.2, oy - 7, ow * 0.6, 5, 2); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(1.2);   // handle
  // fuel-cell slot (middle): vending-style hatch with a cell half inserted
  const sx = x + w * 0.47, sw = w * 0.2, sy = fy + fh * 0.15, sh = fh * 0.7;
  rr(sx, sy, sw, sh, 4); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(2);
  rr(sx + sw * 0.2, sy + sh * 0.3, sw * 0.6, sh * 0.5, 3); ctx.fillStyle = '#0f1115'; ctx.fill();
  const fuel = typeof power !== 'undefined' ? power.reactor : { fuel: 1, t: 0 };
  if (fuel.fuel > 0) {                                                            // the loaded cell
    rr(sx + sw * 0.3, sy + sh * 0.12, sw * 0.4, sh * 0.5, 3);
    const cg = ctx.createLinearGradient(sx, 0, sx + sw, 0);
    cg.addColorStop(0, '#3a9a5a'); cg.addColorStop(0.5, '#9af0b0'); cg.addColorStop(1, '#2a7a4a');
    ctx.fillStyle = cg; ctx.fill(); stroke(1.5);
    ctx.fillStyle = 'rgba(10,40,20,0.75)';                                        // drained part of the cell
    ctx.fillRect(sx + sw * 0.3 + 2, sy + sh * 0.12 + 2, sw * 0.4 - 4, (sh * 0.5 - 4) * (1 - (fuel.fuel - fuel.t / ENERGY_TIME) / CELL_ENERGY));
  }
  ctx.fillStyle = '#e9e6dc'; ctx.font = `800 ${T * 0.12}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('FUEL', sx + sw / 2, sy + sh + 2); ctx.textAlign = 'left';
  // keypad + little screen (right)
  const kx = x + w * 0.72, ky = fy + fh * 0.15;
  rr(kx, ky, w * 0.22, fh * 0.26, 3); ctx.fillStyle = fuel.fuel ? '#1d3a2a' : '#3a1d1d'; ctx.fill(); stroke(1.5);
  ctx.fillStyle = fuel.fuel ? '#7af0a0' : '#ff8a7a'; ctx.font = `700 ${T * 0.12}px monospace`; ctx.textBaseline = 'middle';
  ctx.fillText(fuel.fuel ? `FUEL ${fuel.fuel}` : 'EMPTY :(', kx + 4, ky + fh * 0.1);
  if (fuel.fuel) { ctx.fillStyle = '#7af0a0'; ctx.fillRect(kx + 4, ky + fh * 0.19, (w * 0.22 - 8) * fuel.t / ENERGY_TIME, 2.5); }
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    ctx.beginPath(); ctx.arc(kx + 7 + c * w * 0.05, ky + fh * 0.4 + r * 9, 3, 0, TAU);
    ctx.fillStyle = ['#e2574c', '#e8c34f', '#5fd6a0', '#c9ced8'][(r + c) % 4]; ctx.fill(); stroke(1);
  }
  tapeStrip(x + w * 0.95, fy + 4, T * 0.6, 0.9, 812);
  tapeStrip(x + w * 0.04, y + 10, T * 0.5, -0.6, 813);
}

// One big engine: housing in the reactor room, bell sticking out of the stern (+y).
// Sprites: hull/engine_bell_cruise_f0..3 / _spool_f0..3 (the jump drive spooling up) at the stern's middle,
// over the hull; the flame plume stays 2D, under it (the back layer).
function drawEngineBell(t, E) {
  const spool = typeof mission !== 'undefined' && !!mission.jump && !mission.over;
  const bell = GFX.on && GFX.sprite(`hull/engine_bell_${spool ? 'spool' : 'cruise'}_f${Math.floor(t * 8) % 4}`, 0, E.x, SHIP_H, 0, { layer: 'decal', emissive: 0.8 });
  ctx.save(); ctx.translate(E.x * T, (SHIP_H - 0.5) * T); ctx.rotate(-Math.PI / 2); ctx.scale(3.4, 3.4);
  drawEngines(t, 0.45 + 0.04 * Math.sin(t * 1.3), [0], bell);
  ctx.restore();
}
function drawEngineHousing(t, E) {
  const spool = typeof mission !== 'undefined' && !!mission.jump && !mission.over;
  if (spr(spool ? 'hull/engine_housing_spool' : 'hull/engine_housing', Math.floor(t * 8) % 6, E.x, E.y, 0, { emissive: 0.6, sortY: E.y + 0.8 })) return;
  const w = E.w * T, x = E.x * T - w / 2, y = E.y * T, h = (25.5 - E.y) * T + 4;
  rr(x, y, w, h, 6);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#5f6879'); g.addColorStop(1, '#3a414f');
  ctx.fillStyle = g; ctx.fill(); stroke(3);
  hazardStripe(x + 6, y + 5, w - 12, 9);
  // intake ring with a warm, slowly breathing glow
  const cx = E.x * T, cy = y + h * 0.62, r = h * 0.32;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = '#20242b'; ctx.fill(); stroke(2);
  const k = 0.6 + 0.15 * Math.sin(t * 1.3);
  const gg = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
  gg.addColorStop(0, `rgba(255,200,120,${k})`); gg.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 2);                // turbine blades
  ctx.strokeStyle = 'rgba(30,32,38,0.8)'; ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) { ctx.rotate(TAU / 6); ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(r * 0.85, 4); ctx.stroke(); }
  ctx.restore();
  for (const s of [-1, 1]) {                                            // side pipes
    rr(cx + s * w * 0.36 - 8, y + h * 0.3, 16, h * 0.6, 5); ctx.fillStyle = '#7a5a3b'; ctx.fill(); stroke(2);
  }
  ctx.fillStyle = 'rgba(232,236,244,0.5)'; ctx.font = `800 ${T * 0.2}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ENGINE', cx, y + h * 0.26 + 5); ctx.textAlign = 'left';
}

// Outer airlock hatch set into a side wall; h.open 0..1 slides the doors apart.
function drawHatch(h) {
  const x = h.dir < 0 ? h.x * T - 0.4 * T : h.x * T - 0.5 * T, w = 0.9 * T, y = (h.y - 0.9) * T, hh = 1.8 * T;
  rr(x, y, w, hh, 4); ctx.fillStyle = '#23272f'; ctx.fill(); stroke(2);
  hazardStripe(x + 4, y + 4, w - 8, hh - 8);
  ctx.fillStyle = '#080b14'; ctx.fillRect(x + 9, y + 12, w - 18, hh - 24);
  const ph = (hh - 24) / 2 * (1 - h.open);
  for (const s of [0, 1]) {
    const py = s ? y + hh - 12 - ph : y + 12;
    ctx.fillStyle = '#6b7486'; ctx.fillRect(x + 9, py, w - 18, ph);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(x + 9, py, w - 18, ph);
  }
}

// Shield button on the lower deck: a big mushroom button on a pedestal against the wall.
// state: 'ready' | 'up' | 'cooldown'; k: cooldown progress 0..1 (1 = ready again).
function drawShieldButton(b, state, k, t) {
  const x = b.x * T, y = b.y * T;
  const name = broken(b) ? 'systems/shield_broken' : state === 'up' ? 'systems/shield_up' : state === 'ready' ? 'systems/shield_ready' : `systems/shield_cd${clamp(Math.floor(k * 8), 0, 7)}`;
  if (spr(name, 0, b.x, b.y, 0, { emissive: 0.8, pick: [0.42, 1.0] })) {   // (shield up: its glow is a real light, js/lights.js)
    ctx.fillStyle = 'rgba(232,236,244,0.75)'; ctx.font = `800 ${T * 0.15}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('SHIELD', x, y + T * 0.42); ctx.textAlign = 'left';
    return;
  }
  shadowEllipse(x + 3, y + 6, T * 0.42, T * 0.36, 0.3);
  rr(x - T * 0.4, y - T * 0.35, T * 0.8, T * 0.7, 6);
  ctx.fillStyle = '#3f4757'; ctx.fill(); stroke(2.5);
  hazardStripe(x - T * 0.36, y + T * 0.2, T * 0.72, T * 0.11);
  if (state === 'up') {
    const g = ctx.createRadialGradient(x, y, 0, x, y, T * 0.9);
    g.addColorStop(0, 'rgba(120,200,255,0.5)'); g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, T * 0.9, 0, TAU); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(x, y - T * 0.05, T * 0.22, 0, TAU);
  ctx.fillStyle = state === 'ready' ? '#e2574c' : state === 'up' ? '#9cd8ff' : '#7a3a34'; ctx.fill(); stroke(2.5);
  ctx.beginPath(); ctx.arc(x - 4, y - T * 0.1, T * 0.08, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
  if (state === 'cooldown') {
    ctx.beginPath(); ctx.arc(x, y - T * 0.05, T * 0.3, -Math.PI / 2, -Math.PI / 2 + k * TAU);
    ctx.strokeStyle = '#9cd8ff'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.fillStyle = 'rgba(232,236,244,0.75)'; ctx.font = `800 ${T * 0.15}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('SHIELD', x, y + T * 0.38); ctx.textAlign = 'left';
}

// Floor hatch inside the ship with the ladder down the crawlway to a cannon.
function drawGunLadder(g) {
  const [hx, hy] = g.hatch, x = hx * T, y = hy * T, s = T * 0.36;
  const manned = typeof crew !== 'undefined' && crew.some(c => c.mode === 'gun' && c.gun === g);
  const name = broken(g) && sprReady('interior/gun_ladder_broken') ? 'interior/gun_ladder_broken' : manned ? 'interior/gun_ladder_lit' : 'interior/gun_ladder';
  if (spr(name, 0, hx, hy, 0, { emissive: 0.6, pick: [0.4, 1.6] })) {
    ctx.fillStyle = 'rgba(232,236,244,0.6)'; ctx.font = `800 ${T * 0.14}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('CANNON', x, y + s + 3); ctx.textAlign = 'left';
    return;
  }
  rr(x - s, y - s, 2 * s, 2 * s, 5); ctx.fillStyle = '#23272f'; ctx.fill(); stroke(2);
  hazardStripe(x - s + 3, y - s + 3, 2 * s - 6, 5);
  ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 3;
  for (const dx of [-s * 0.45, s * 0.45]) { ctx.beginPath(); ctx.moveTo(x + dx, y - s + 10); ctx.lineTo(x + dx, y + s - 3); ctx.stroke(); }
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { const yy = y - s + 14 + i * (2 * s - 18) / 2.5; ctx.beginPath(); ctx.moveTo(x - s * 0.45, yy); ctx.lineTo(x + s * 0.45, yy); ctx.stroke(); }
  ctx.fillStyle = 'rgba(232,236,244,0.6)'; ctx.font = `800 ${T * 0.14}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('CANNON', x, y + s + 3); ctx.textAlign = 'left';
}

// Cover plate that rises in front of the cannon and its gunner (k: 0 down .. 1 up).
function drawCover(g, k) {
  if (GFX.on) {                                     // hull/cover_k1..3 by progress, fading in below 1/3 (in front of the gun: same depth bias)
    const n = `hull/cover_k${k <= 1 / 3 ? 1 : k <= 2 / 3 ? 2 : 3}`;
    if (GFX.ready(n) && GFX.sprite(n, GFX.frameIndex(n, g.aim), g.x, g.y + gunDY(g), gunZ(g), { layer: 'wall', sortY: g.y + gunDY(g) + 0.02, alpha: Math.min(1, k * 3), depthBias: gunBias(g) })) return;
  }
  const r = T * 1.35, a = g.aim, half = 0.95 * k;
  ctx.save(); ctx.translate(g.x * T, g.y * T);
  ctx.globalAlpha = Math.min(1, k * 1.5);
  ctx.beginPath(); ctx.arc(0, 0, r, a - half, a + half); ctx.arc(0, 0, r - T * 0.22, a + half, a - half, true); ctx.closePath();
  const gr = ctx.createLinearGradient(-r, -r, r, r);
  gr.addColorStop(0, '#a9b2c0'); gr.addColorStop(1, '#5c6577');
  ctx.fillStyle = gr; ctx.fill(); stroke(2.5);
  ctx.beginPath(); ctx.arc(0, 0, r - T * 0.11, a - half * 0.9, a + half * 0.9);
  ctx.setLineDash([7, 6]); ctx.strokeStyle = C.hazard; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let i = -2; i <= 2; i++) { const q = a + i * half * 0.42; ctx.fillRect(Math.cos(q) * (r - T * 0.05) - 1.5, Math.sin(q) * (r - T * 0.05) - 1.5, 3, 3); }
  ctx.restore();
}
