// Shared helpers and all procedural art. Everything is drawn with canvas paths;
// there are no image assets. Ship parts are drawn in ship-local pixels
// (origin = top-left of the tile grid, +x = towards the nose).

const T = 48;                                 // tile size in ship-local pixels
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

// ---------------------------------------------------------------------------
// Lumpy rocks: asteroids and the "rock" item share one shape language
// ---------------------------------------------------------------------------
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

const ROCK_SHAPES = [101, 202, 303, 404, 505].map(s => lumpShape(s, 7, 0.35));
function drawRockItem(x, y, k = 0, scale = 1, rotation = k * 1.7) {
  shadowEllipse(x + 2 * scale, y + 4 * scale, T * 0.22 * scale, T * 0.12 * scale, 0.35);
  drawLump(ROCK_SHAPES[k % ROCK_SHAPES.length], x, y, T * 0.24 * scale, rotation,
           [C.rockLight, C.rock, C.rockDark], false);
}

const METAL_SHAPES = [11, 22, 33].map(seed => {
  const r = rng(seed);
  return Array.from({ length: 6 }, (_, i) => {
    const a = i / 6 * TAU + (r() - 0.5) * 0.3;
    return [Math.cos(a) * (0.85 + r() * 0.25), Math.sin(a) * (0.62 + r() * 0.2)];
  });
});
// Metal chunk: angular, cool steel tones so it reads apart from warm rock.
function drawMetalItem(x, y, k = 0, scale = 1, rotation = k * 1.3) {
  const rad = T * 0.24 * scale;
  shadowEllipse(x + 2 * scale, y + 4 * scale, rad, rad * 0.55, 0.35);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
  const pts = METAL_SHAPES[k % METAL_SHAPES.length].map(([u, v]) => [u * rad, v * rad]);
  poly(pts);
  const g = ctx.createLinearGradient(-rad, -rad, rad, rad);
  g.addColorStop(0, '#eef4fb'); g.addColorStop(0.45, '#9fb2c8'); g.addColorStop(1, '#4d5b6e');
  ctx.fillStyle = g; ctx.fill();
  poly(pts.map(([u, v]) => [u * 0.45 - rad * 0.15, v * 0.45 - rad * 0.12]));
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
  poly(pts); stroke(2);
  ctx.restore();
}

function drawItem(type, x, y, k = 0, scale = 1, rotation) {
  if (type === 'metal') drawMetalItem(x, y, k, scale, rotation ?? k * 1.3);
  else drawRockItem(x, y, k, scale, rotation ?? k * 1.7);
}

function drawAsteroid(a, t) {
  shadowEllipse(a.x + 6, a.y + 8, a.r * 0.95, a.r * 0.8, 0.25);
  drawLump(a.shape, a.x, a.y, a.r, a.a, [C.asterLight, C.aster, C.asterDark], true);
  if (a.hit > 0) {
    ctx.save(); ctx.globalAlpha = a.hit * 0.6; ctx.globalCompositeOperation = 'lighter';
    drawLump(a.shape, a.x, a.y, a.r, a.a, ['#ffd9a0', '#c08050', '#603020'], false);
    ctx.restore();
  }
}

// Floating rock chunk that can be collected: rock plus a pulsing dashed border.
function drawPickup(p, t) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 5 + p.k);
  const rad = T * 0.42;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 1.3);
  g.addColorStop(0, `rgba(255,224,138,${0.18 + 0.12 * pulse})`); g.addColorStop(1, 'rgba(255,224,138,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rad * 1.3, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(t * 0.8);
  ctx.setLineDash([7, 5]);
  ctx.beginPath(); ctx.arc(0, 0, rad, 0, TAU);
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,22,27,0.6)'; ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = p.type === 'metal' ? `rgba(185,225,255,${0.65 + 0.35 * pulse})` : `rgba(255,224,138,${0.65 + 0.35 * pulse})`; ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  drawItem(p.type, p.x, p.y, p.k, 1.15, p.a);
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
function drawEngines(t, throttle, ys) {
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

// Small forward-firing braking jets near the nose; side = -1 top wall, +1 bottom wall.
function drawRetros(t, level, pts) {
  for (const [rx, ry, side] of pts) {
    const x = rx * T, y = ry * T;
    if (level > 0.02) {
      const len = T * (0.2 + 0.9 * level) * (1 + 0.15 * Math.sin(t * 37 + rx));
      const g = ctx.createRadialGradient(x + 6, y, 1, x + 6, y, len);
      g.addColorStop(0, 'rgba(220,240,255,0.95)'); g.addColorStop(0.35, 'rgba(120,190,255,0.6)'); g.addColorStop(1, 'rgba(80,140,255,0)');
      ctx.globalAlpha = Math.min(1, level * 1.5); ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x + 6 + len * 0.45, y + side * 2, len * 0.55, T * (0.06 + 0.1 * level), 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    rr(x - 7, y - 5, 14, 10, 3); ctx.fillStyle = '#3a404c'; ctx.fill(); stroke(1.5);
    ctx.fillStyle = level > 0.02 ? '#bfe3ff' : '#22262e'; ctx.fillRect(x + 4, y - 3, 3, 6);
  }
}

// Hull plate for an arbitrary outline (ship-local px). vents/navs are in tile units.
function drawHull(t, pts, vents, navs) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  poly(pts);
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, C.hullLight); g.addColorStop(0.5, C.hull); g.addColorStop(1, C.hullDark);
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); poly(pts); ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1.5;                 // panel seams
  for (let x = 2 * T; x < x1; x += 2 * T) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
  poly(pts); ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 16; ctx.stroke();   // bevel
  for (const [vx, vy] of vents) {
    rr(vx * T, vy * T, T * 1.1, T * 0.44, 4); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);
    ctx.strokeStyle = '#4b5263'; ctx.lineWidth = 2;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(vx * T + i * T * 0.18, vy * T + 5); ctx.lineTo(vx * T + i * T * 0.18, vy * T + T * 0.44 - 5); ctx.stroke(); }
  }
  ctx.restore();
  poly(pts); stroke(3.5);
  // navigation lights; white ones blink
  const blink = (t % 1.6) < 0.18;
  for (const [lx, ly, col] of navs) {
    const x = lx * T, y = ly * T, on = col !== '#ffffff' || blink;
    if (on) {
      const lg = ctx.createRadialGradient(x, y, 0, x, y, 16);
      lg.addColorStop(0, col); lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55; ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fillStyle = on ? col : '#3a3f4a'; ctx.fill(); stroke(1.5);
  }
}

// Floor tiles clipped to the floor outline (diagonals cut tiles), with wall shadow and lip.
function drawFloor(pts, tiles) {
  ctx.save(); poly(pts); ctx.clip();
  for (const [x, y] of tiles) {
    ctx.fillStyle = (x + y) % 2 ? C.floorA : C.floorB;
    ctx.fillRect(x * T, y * T, T, T);
    ctx.strokeStyle = C.grout; ctx.lineWidth = 1;
    ctx.strokeRect(x * T + 0.5, y * T + 0.5, T - 1, T - 1);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (const [rx, ry] of [[5, 5], [T - 7, 5], [5, T - 7], [T - 7, T - 7]]) ctx.fillRect(x * T + rx, y * T + ry, 2, 2);
  }
  poly(pts); ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 28; ctx.stroke();   // shadow cast by the walls
  poly(pts); ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 12; ctx.stroke();
  ctx.restore();
  poly(pts); ctx.strokeStyle = C.hullLight; ctx.lineWidth = 5; ctx.stroke();
  poly(pts); stroke(2);
}

// Hatched overlay for floor that can't be built on (cut by a diagonal).
function drawNoBuild(x, y) {
  ctx.save(); ctx.beginPath(); ctx.rect(x * T, y * T, T, T); ctx.clip();
  ctx.strokeStyle = 'rgba(20,22,27,0.25)'; ctx.lineWidth = 3;
  for (let i = -T; i < T; i += 10) { ctx.beginPath(); ctx.moveTo(x * T + i, y * T + T); ctx.lineTo(x * T + i + T, y * T); ctx.stroke(); }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Transport belts. Canonical straight = moving east; canonical corner = enter
// moving east, leave moving north, pivot at the tile's top-left corner.
// ---------------------------------------------------------------------------
const DIR_ANGLE = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };

function beltRail(y, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#f2c950'); g.addColorStop(1, '#a27a18');
  ctx.fillStyle = g; ctx.fillRect(0, y, T, h);
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.strokeRect(0, y, T, h);
  ctx.fillStyle = '#5b4410';
  for (const bx of [0.25, 0.75]) { ctx.beginPath(); ctx.arc(bx * T, y + h / 2, 1.6, 0, TAU); ctx.fill(); }
}

function chevron(x, y, s) {
  ctx.beginPath(); ctx.moveTo(x - s * 0.5, y - s * 1.3); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x - s * 0.5, y + s * 1.3);
  ctx.stroke();
}

function drawBelt(b, t, speed) {
  const corner = b.din !== b.d;
  ctx.save(); ctx.translate(b.x * T + T / 2, b.y * T + T / 2);
  if (corner) {
    ctx.rotate(DIR_ANGLE[b.din]);
    if (wrapAngle(DIR_ANGLE[b.d] - DIR_ANGLE[b.din]) > 0) ctx.scale(1, -1);   // right turn = mirrored
  } else ctx.rotate(DIR_ANGLE[b.d]);
  ctx.translate(-T / 2, -T / 2);
  const ph6 = (t * speed * 6) % 1, ph2 = (t * speed * 2) % 1;
  ctx.strokeStyle = '#5a606c'; ctx.lineWidth = 3.5;

  if (!corner) {
    ctx.fillStyle = C.beltFrame; ctx.fillRect(0, T * 0.05, T, T * 0.9);
    ctx.fillStyle = C.beltBase; ctx.fillRect(0, T * 0.16, T, T * 0.68);
    ctx.save(); ctx.beginPath(); ctx.rect(0, T * 0.16, T, T * 0.68); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
    for (let i = -1; i < 7; i++) {
      const x = (i + ph6) * T / 6;
      ctx.beginPath(); ctx.moveTo(x, T * 0.16); ctx.lineTo(x, T * 0.84); ctx.stroke();
    }
    ctx.strokeStyle = '#5a606c'; ctx.lineWidth = 3.5;
    for (let i = -1; i < 2; i++) chevron((i + ph2) * T / 2 + T * 0.2, T / 2, T * 0.13);
    const g = ctx.createLinearGradient(0, T * 0.16, 0, T * 0.28);
    g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, T * 0.16, T, T * 0.12);
    ctx.restore();
    beltRail(T * 0.05, T * 0.11); beltRail(T * 0.84, T * 0.11);
  } else {
    const ring = (r0, r1) => { ctx.beginPath(); ctx.arc(0, 0, r1 * T, 0, Math.PI / 2); ctx.arc(0, 0, r0 * T, Math.PI / 2, 0, true); ctx.closePath(); };
    ring(0.05, 0.95); ctx.fillStyle = C.beltFrame; ctx.fill();
    ring(0.16, 0.84); ctx.fillStyle = C.beltBase; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
    for (let i = -1; i < 6; i++) {
      const a = Math.PI / 2 - (i + ph6) * (Math.PI / 2) / 5;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * T * 0.16, Math.sin(a) * T * 0.16); ctx.lineTo(Math.cos(a) * T * 0.84, Math.sin(a) * T * 0.84); ctx.stroke();
    }
    ctx.strokeStyle = '#5a606c'; ctx.lineWidth = 3.5;
    for (let i = -1; i < 3; i++) {
      const a = Math.PI / 2 - (i + ph2) * 1.0;   // 1 rad of arc at r=0.5T ≈ half a tile
      ctx.save(); ctx.rotate(a); ctx.translate(T / 2, 0); ctx.rotate(-Math.PI / 2);
      chevron(0, 0, T * 0.13); ctx.restore();
    }
    ctx.restore();
    for (const [r0, r1] of [[0.05, 0.16], [0.84, 0.95]]) {
      ring(r0, r1);
      const g = ctx.createRadialGradient(0, 0, r0 * T, 0, 0, r1 * T);
      g.addColorStop(0, '#f2c950'); g.addColorStop(1, '#a27a18');
      ctx.fillStyle = g; ctx.fill(); stroke(1.2);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
function drawChest(tx, ty, store, cap, pop) {
  const x = tx * T + 4, y = ty * T + 5, w = T - 8, h = T - 10;
  const total = store.rock + store.metal;
  shadowEllipse(x + w / 2 + 3, y + h - 1, w * 0.55, 7);
  rr(x, y, w, h, 6);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, C.crateLight); g.addColorStop(1, C.crateDark);
  ctx.fillStyle = g; ctx.fill(); stroke(2.5);
  rr(x + 5, y + 5, w - 10, h - 10, 3); ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x + 5, y + h * 0.42); ctx.lineTo(x + w - 5, y + h * 0.42); ctx.stroke();
  ctx.fillStyle = '#4d3f26';
  for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.fillRect(cx + (sx < 0 ? -9 : 1), cy + (sy < 0 ? -4 : 1), 8, 3);
    ctx.fillRect(cx + (sx < 0 ? -4 : 1), cy + (sy < 0 ? -9 : 1), 3, 8);
  }
  rr(x + w / 2 - 12, y + h * 0.26, 24, 13, 3); ctx.fillStyle = '#1f2a26'; ctx.fill(); stroke(1.2);
  ctx.fillStyle = total >= cap ? '#ff8a7a' : '#9ef0c2'; ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(total), x + w / 2, y + h * 0.26 + 7);
  // fill bar: rock portion warm, metal portion cool
  const bx = x + 6, by = y + h - 9, bw = w - 12;
  ctx.fillStyle = '#1b1e24'; ctx.fillRect(bx, by, bw, 4);
  ctx.fillStyle = C.rockLight; ctx.fillRect(bx, by, bw * store.rock / cap, 4);
  ctx.fillStyle = '#b9d3ee'; ctx.fillRect(bx + bw * store.rock / cap, by, bw * store.metal / cap, 4);
  if (pop > 0) {
    const e = 1 - pop;
    ctx.strokeStyle = `rgba(255,230,160,${0.8 * pop})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, 10 + e * 26, 0, TAU); ctx.stroke();
  }
}

// Dispenser (1x1, facing +x, centered on 0,0): pulls the selected item out of an adjacent chest.
function drawDispenser(mode, t, busy) {
  const s = T / 2 - 4;
  shadowEllipse(3, 5, s, s * 0.8, 0.3);
  poly([[s - 2, -s * 0.55], [s + 5, -s * 0.42], [s + 5, s * 0.42], [s - 2, s * 0.55]]);
  ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(2);
  rr(-s, -s, 2 * s, 2 * s, 6);
  const g = ctx.createLinearGradient(0, -s, 0, s);
  g.addColorStop(0, '#6a7385'); g.addColorStop(1, '#3a404c');
  ctx.fillStyle = g; ctx.fill(); stroke(2.5);
  ctx.strokeStyle = C.hazard; ctx.lineWidth = 3;
  chevron(s * 0.55 + busy * 4, 0, 5);
  ctx.beginPath(); ctx.arc(-s * 0.25, 0, s * 0.6, 0, TAU); ctx.fillStyle = '#1b1e24'; ctx.fill();
  stroke(2.5, mode === 'metal' ? '#9fc3e6' : C.crateLight);
  drawItem(mode, -s * 0.25, 0, 0, 0.6, t * 0.6);
}

// Turret mount (2x2, facing +x, centered on 0,0): plate, ammo hopper (back-top), seat (back-bottom).
// The gun itself is drawn separately on top, centered on the front column.
function drawTurretBase(ammo, max, dry) {
  rr(-T + 3, -T + 3, 2 * T - 6, 2 * T - 6, 8);
  const g = ctx.createLinearGradient(0, -T, 0, T);
  g.addColorStop(0, '#4a515e'); g.addColorStop(1, '#2f343e');
  ctx.fillStyle = g; ctx.fill(); stroke(2.5);
  ctx.setLineDash([9, 6]); rr(-T + 8, -T + 8, 2 * T - 16, 2 * T - 16, 5);
  ctx.strokeStyle = 'rgba(210,166,46,0.75)'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
  rr(-T + 9, -T + 9, T - 16, T - 16, 5); ctx.fillStyle = '#23272f'; ctx.fill(); stroke(2);
  rr(-T + 15, -T + 13, T - 28, T - 30, 3); ctx.fillStyle = '#14161b'; ctx.fill();
  drawAmmoPips(-T + 13, -15, ammo, max, dry, 4);
  drawSeat(-T / 2, T / 2, 0);
}

function drawReactor(tx, ty, t) {
  const cx = tx * T + T, cy = ty * T + T;
  shadowEllipse(cx + 4, cy + 8, T * 0.85, T * 0.6);
  octagon(cx, cy, T * 0.9);
  const bg = ctx.createLinearGradient(0, cy - T, 0, cy + T);
  bg.addColorStop(0, '#525a6b'); bg.addColorStop(1, '#343a47');
  ctx.fillStyle = bg; ctx.fill(); stroke(3);
  ctx.beginPath(); ctx.arc(cx, cy, T * 0.6, 0, TAU);
  ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(2);
  const pulse = 0.75 + 0.25 * Math.sin(t * 3);
  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, T * 0.5);
  g.addColorStop(0, '#e9fdff'); g.addColorStop(0.35, C.glow); g.addColorStop(1, 'rgba(40,140,170,0)');
  ctx.globalAlpha = pulse; ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, T * 0.5, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * T * 0.75, cy + Math.sin(a) * T * 0.75, 5, 0, TAU);
    ctx.fillStyle = '#8a93a5'; ctx.fill(); stroke(1.5);
  }
}

function drawConsole(tx, ty, h, t, active) {
  const x = tx * T + 6, y = ty * T + 4, w = T - 12, hh = h * T - 8;
  const lg = ctx.createRadialGradient(x, y + hh / 2, 0, x, y + hh / 2, T * 1.6);
  lg.addColorStop(0, `rgba(95,214,228,${active ? 0.22 : 0.1})`); lg.addColorStop(1, 'rgba(95,214,228,0)');
  ctx.fillStyle = lg; ctx.fillRect(x - T * 1.6, y - T * 0.3, T * 1.6, hh + T * 0.6);
  shadowEllipse(x + w / 2 + 3, y + hh / 2 + 4, w * 0.7, hh * 0.52, 0.3);
  rr(x, y, w, hh, 6);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#4a5262'); g.addColorStop(1, '#2f3542');
  ctx.fillStyle = g; ctx.fill(); stroke(2.5);
  for (let i = 0; i < h; i++) {
    const sy = y + 6 + i * (hh - 6) / h, sh = (hh - 6) / h - 6;
    rr(x + 5, sy, w - 13, sh, 3);
    ctx.fillStyle = i === 1 ? '#2a7d63' : '#28536e'; ctx.fill(); stroke(1.5);
    ctx.fillStyle = 'rgba(200,255,240,0.75)';
    for (let j = 0; j < 3; j++) {
      const bw = (w - 22) * (0.3 + 0.6 * Math.abs(Math.sin(t * (active ? 2.6 : 0.9) + i * 2 + j)));
      ctx.fillRect(x + 9, sy + 7 + j * 9, bw, 3);
    }
    // button column
    for (let j = 0; j < 3; j++) {
      ctx.fillStyle = ['#e2574c', '#e8c34f', '#5fd6a0'][j];
      ctx.beginPath(); ctx.arc(x + w - 4, sy + 8 + j * 9, 2, 0, TAU); ctx.fill();
    }
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

// ammo: array of item types, oldest first
function drawAmmoPips(x, y, ammo, max, dry, size = 10) {
  const step = size + 3, pad = Math.ceil(size / 2);
  rr(x - pad, y - pad, max * step - 3 + pad * 2, size + pad * 2, 4);
  ctx.fillStyle = dry > 0 ? `rgba(200,60,50,${0.4 + 0.5 * dry})` : '#262a33'; ctx.fill(); stroke(1.5);
  for (let i = 0; i < max; i++) {
    rr(x + i * step, y, size, size, 2);
    ctx.fillStyle = i < ammo.length ? (ammo[i] === 'metal' ? '#b9d3ee' : C.rockLight) : '#3a3f4a'; ctx.fill(); stroke(1.2);
  }
}

function drawAirlock(tx, ty, open, t) {
  const x = tx * T, y = ty * T;
  // hazard floor marking on the inside tile
  ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(210,166,46,0.7)'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 4, y - T + 4, T - 8, T - 8); ctx.restore();
  rr(x + 2, y + 2, T - 4, T - 4, 4); ctx.fillStyle = '#23272f'; ctx.fill(); stroke(2);
  ctx.save(); rr(x + 2, y + 2, T - 4, T - 4, 4); ctx.clip();
  ctx.fillStyle = C.hazard; ctx.fillRect(x, y, T, T);
  ctx.fillStyle = '#2b2b2b';
  for (let i = -3; i < 6; i++) poly([[x + i * 12, y], [x + i * 12 + 6, y], [x + i * 12 + 6 + T, y + T], [x + i * 12 + T, y + T]]), ctx.fill();
  // view of space through the open door
  ctx.fillStyle = '#080b14'; ctx.fillRect(x + 7, y + 7, T - 14, T - 14);
  const pw = (T - 14) / 2 * (1 - open);
  for (const side of [0, 1]) {
    const px = side ? x + T - 7 - pw : x + 7;
    ctx.fillStyle = '#6b7486'; ctx.fillRect(px, y + 7, pw, T - 14);
    ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(px, y + 7, pw, T - 14);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + (side ? 2 : pw - 5), y + 12, 3, T - 24);
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(x + T / 2, y + 4, 3, 0, TAU);
  ctx.fillStyle = open > 0.05 ? (Math.sin(t * 12) > 0 ? '#ffb347' : '#6b4a20') : '#47e07a'; ctx.fill(); stroke(1.2);
}

// Vacuum intake in a wall tile. rotation 0 = bottom wall (outside is +y).
function drawIntake(tx, ty, flash, t, rotation = 0) {
  ctx.save(); ctx.translate(tx * T + T / 2, ty * T + T / 2); ctx.rotate(rotation);
  const x = -T / 2, y = -T / 2;
  rr(x + 3, y + 6, T - 6, T - 12, 6); ctx.fillStyle = '#1b1e24'; ctx.fill(); stroke(2);
  if (flash > 0) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, T * 0.8);
    g.addColorStop(0, `rgba(95,214,228,${0.6 * flash})`); g.addColorStop(1, 'rgba(95,214,228,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, T * 0.8, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = '#4b5263'; ctx.lineWidth = 3;
  for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + 3 + i * (T - 6) / 5, y + 9); ctx.lineTo(x + 3 + i * (T - 6) / 5, y + T - 9); ctx.stroke(); }
  // inward chevrons on the hull skin, pulsing
  const k = (t * 1.5) % 1;
  ctx.strokeStyle = `rgba(95,214,228,${0.5 + 0.4 * Math.sin(t * 4)})`; ctx.lineWidth = 2.5;
  for (const off of [0, 0.5]) {
    const yy = y + T + 4 - ((k + off) % 1) * 8;
    ctx.beginPath(); ctx.moveTo(x + T * 0.3, yy + 5); ctx.lineTo(x + T * 0.5, yy); ctx.lineTo(x + T * 0.7, yy + 5); ctx.stroke();
  }
  ctx.restore();
}

// Range of the intake's vacuum: faint boundary plus rings drifting inward.
function drawVacuum(cx, cy, r, t, active) {
  ctx.save();
  ctx.setLineDash([10, 12]); ctx.lineDashOffset = -t * 20;
  ctx.strokeStyle = `rgba(95,214,228,${active ? 0.3 : 0.12})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 3; i++) {
    const k = 1 - ((t * 0.5 + i / 3) % 1);
    ctx.strokeStyle = `rgba(95,214,228,${(active ? 0.22 : 0.08) * (1 - k)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, TAU); ctx.stroke();
  }
  ctx.restore();
}

// Cable between two points; bows sideways by the amount of slack in a rope of length len.
function drawTether(x0, y0, x1, y1, len) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  const sag = 0.5 * Math.sqrt(Math.max(0, len * len - d * d));
  const mx = (x0 + x1) / 2 - dy / d * sag, my = (y0 + y1) / 2 + dx / d * sag;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.strokeStyle = 'rgba(20,22,27,0.7)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = 'rgba(95,214,228,0.75)'; ctx.lineWidth = 1.8; ctx.stroke();
}

// Top-down crew member. face = heading in radians (0 = +x).
function drawCrew(x, y, face, walk, eva) {
  ctx.save(); ctx.translate(x, y);
  shadowEllipse(3, 5, T * 0.3, T * 0.25, 0.4);
  ctx.rotate(face);
  if (eva) {                                   // jetpack
    rr(-T * 0.4, -T * 0.2, T * 0.17, T * 0.4, 4); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(2);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(-T * 0.41, s * T * 0.11, 3.5, 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.2); }
  }
  const swing = Math.sin(walk) * T * 0.07;
  for (const s of [-1, 1]) {                  // hands
    ctx.beginPath(); ctx.arc(T * 0.08 + swing * s, s * T * 0.27, T * 0.075, 0, TAU);
    ctx.fillStyle = eva ? '#d9dde4' : C.skin; ctx.fill(); stroke(2);
  }
  ctx.beginPath(); ctx.ellipse(0, 0, T * 0.17, T * 0.29, 0, 0, TAU);   // shoulders
  const g = ctx.createLinearGradient(-T * 0.17, 0, T * 0.17, 0);
  g.addColorStop(0, eva ? '#a9b0bd' : C.suitDark); g.addColorStop(1, eva ? '#e5e8ee' : C.suit);
  ctx.fillStyle = g; ctx.fill(); stroke(2.5);
  if (!eva) { ctx.fillStyle = '#e9d27a'; ctx.fillRect(-T * 0.02, -T * 0.25, T * 0.05, T * 0.08); }
  ctx.beginPath(); ctx.arc(T * 0.03, 0, T * 0.15, 0, TAU);              // head
  ctx.fillStyle = C.skin; ctx.fill(); stroke(2.2);
  ctx.beginPath(); ctx.arc(T * 0.03, 0, T * 0.15, Math.PI * 0.55, Math.PI * 1.45); // hair, back of head
  ctx.lineTo(T * 0.0, 0); ctx.closePath(); ctx.fillStyle = C.hair; ctx.fill();
  if (eva) {
    ctx.beginPath(); ctx.arc(T * 0.03, 0, T * 0.21, 0, TAU);
    ctx.fillStyle = 'rgba(160,210,240,0.28)'; ctx.fill(); stroke(2, '#cfe6f5');
    ctx.beginPath(); ctx.arc(T * 0.03, 0, T * 0.16, -1.2, -0.3); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}
