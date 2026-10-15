// Clutter: the ship is old, overloaded and held together by duct tape.
// The crates and other clutter standing on the floor are solid (CLUTTER in js/ship.js); the rest is
// purely visual. Coordinates in layout units.

// ---------------------------------------------------------------------------
// Sprites (js/gfx.js) for the ship's machinery, furniture and clutter. Every old 2D drawing of a
// world object first tries its pre-rendered sprite: spr() is true when it was drawn (then the 2D
// version is skipped), false with GFX off (?classic, tests, the server) or while its atlas page loads.
// Raised things go in the sorted 'main' layer (y-sorted with the crew); flat things in 'decal'.
// ---------------------------------------------------------------------------
function spr(name, frame, x, y, z = 0, o) { return GFX.on && GFX.sprite(name, frame, x, y, z, o); }
const sprReady = (...names) => GFX.on && names.every(n => GFX.ready(n));
// Labels in the world. With GFX on there are two kinds:
// - worldText(): text that belongs to the world (capacitor readouts, a VENT tag, the cat's
//   z z z): a small upright sprite (GFX.text, billboard), depth-tested, so whoever walks in front hides it.
// - labelAt() / later(): text that must stay readable over everything (TAKE, OVERCHARGED,
//   BROKEN): drawn later on the top canvas (render() flushes it via drawInteriorWalls), upright and lifted
//   by z; it fades while a crew member stands in front of it, so it never sits on someone's face.
// Classic: both are drawn at once, flat, like before.
const LATER = [];
function later(fn) { if (GFX.on) LATER.push(fn); else fn(); }
function flushLater() { for (const f of LATER.splice(0)) f(); }
// Is the screen point of world (x, y, z) covered by a crew member standing in front of it (closer to the camera)?
function crewInFront(x, y, z) {
  if (!GFX.on || typeof crew === 'undefined') return false;
  const sy = y - GFX.lift(z);
  return crew.some(c => c.mode === 'inside' && c.y > y + 0.05 && Math.abs(c.x - x) < 0.5 && sy > c.y - GFX.lift(standing(c) ? 1.75 : 0.6) - 0.15 && sy < c.y + 0.25);
}
function labelAt(x, y, z, text, font, fill, base = 'middle', outline = null) {   // x, y in layout units
  later(() => {
    ctx.save(); ctx.translate(x * T, (y - GFX.lift(z)) * T); if (GFX.on) ctx.scale(1, 1 / GFX.SIN);
    if (crewInFront(x, y, z)) ctx.globalAlpha = 0.3;
    ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = base;
    if (outline) { ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = outline; ctx.strokeText(text, 0, 0); }
    ctx.fillStyle = fill; ctx.fillText(text, 0, 0); ctx.restore();
  });
}
// o: { outline, base, layer ('main'), sortY (y), depthBias, alpha, lit (false: glows like a display) }
function worldText(x, y, z, text, font, fill, o = {}) {
  if (GFX.on) {
    const name = GFX.text(text, font, fill, { outline: o.outline, base: o.base, spacing: o.spacing });
    if (name && GFX.sprite(name, 0, x, y, z, { billboard: true, unlit: !o.lit, emissive: o.lit ? 0.6 : 0, layer: o.layer || 'main', sortY: o.sortY != null ? o.sortY : y,
      depthBias: o.depthBias || 0, depthWrite: false, alpha: o.alpha })) return;
  }
  ctx.save(); ctx.translate(x * T, (y - GFX.lift(z)) * T);
  ctx.font = font; ctx.letterSpacing = (o.spacing || 0) + 'px'; ctx.textAlign = 'center'; ctx.textBaseline = o.base || 'middle';
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  if (o.outline) { ctx.lineWidth = 3; ctx.strokeStyle = o.outline; ctx.strokeText(text, 0, 0); }
  ctx.fillStyle = fill; ctx.fillText(text, 0, 0); ctx.restore();
}
// Steam: soft particles (one radial-gradient puff, PUFF, drawn scaled and faded), each a pure function of the
// time (its own lane and phase, a fresh random start every loop: nothing stored, nothing allocated per frame).
// A particle leaves the source thin and fast, slows, widens and fades; sideways it follows a wave travelling
// up the plume (shared by all particles at that height, so they line up into one curling wisp) plus a slow
// drift and a little turbulence of its own. STEAM_KINDS: mug (a calm thin wisp, rising slowly: life 9.6 s), pot (more, wider, rising in
// puffs as the stew bubbles), leak (a jet sideways out of a pipe, drifting up as it slows). World px (T = 48).
const STEAM_KINDS = {
  mug:  { n: 30, life: 9.6, d: 56, jx: 0, jy: -1, rise: 0, w0: 1.4, r0: 1.6, r1: 10, a: 0.34, sway: 6, tk: 0.4, w: 64, h: 76 },   // (slow: a lazy curl)
  pot:  { n: 36, life: 2.6, d: 70, jx: 0, jy: -1, rise: 0, w0: 7, r0: 2.5, r1: 16, a: 0.36, sway: 9, burst: true, w: 96, h: 96 },
  leak: { n: 26, life: 1.4, d: 50, jx: 1, jy: 0, rise: 18, w0: 1, r0: 1.5, r1: 15, a: 0.4, sway: 5, w: 0, h: 0 },
};
let PUFF = null;
function steamPuffImage() {
  if (PUFF || typeof document === 'undefined' || typeof document.createElement !== 'function') return PUFF;
  const c = document.createElement('canvas'); if (!c || !c.getContext) return null; c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(238,242,247,1)'); gr.addColorStop(0.35, 'rgba(232,238,245,0.7)'); gr.addColorStop(0.7, 'rgba(225,232,242,0.22)'); gr.addColorStop(1, 'rgba(220,228,240,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return (PUFF = c);
}
const steamHash = (i, c) => { const v = Math.sin(i * 12.9898 + c * 78.233) * 43758.5453; return v - Math.floor(v); };
// Draws one source's steam into g with its origin at (ox, oy), scaled by s (canvas px per world px).
function steamPlume(g, ox, oy, s, t, P, k0 = 1) {
  const img = steamPuffImage(); if (!img) return;
  const a0 = g.globalAlpha, px = -P.jy, py = P.jx, tw = t * (P.tk || 1);   // (px, py: sideways to the jet; tw: the sway's clock)
  for (let i = 0; i < P.n; i++) {
    const u = t / P.life + i / P.n + steamHash(i, 0) * 0.31, cyc = Math.floor(u), k = u - cyc;
    const h1 = steamHash(i, cyc), h2 = steamHash(i + 57, cyc);
    let f = 0.6 + 0.8 * h2;                                  // this puff's strength
    if (P.burst) { const tb = (cyc - i / P.n) * P.life; f *= 0.45 + 0.9 * Math.max(0, Math.sin(tb * 2.9) * Math.sin(tb * 1.3 + 1)); }   // born in a bubble's burst
    const e = 1 - (1 - k) * (1 - k), d = P.d * k0 * (0.8 + 0.4 * h1) * e;   // along the jet: fast out, slowing
    const lat = (h1 - 0.5) * 2 * P.w0 * (1 + k)                                    // where on the source it left
      + P.sway * k0 * Math.pow(k, 1.2) * (Math.sin(d * 0.11 / k0 - tw * 1.4) + 0.6 * Math.sin(tw * 0.37 + 1.3))   // the curling wisp, its slow drift
      + P.sway * 0.4 * k * Math.sin(tw * 2.3 + i * 1.7 + h2 * 6);                   // its own turbulence
    const x = ox + (P.jx * d + px * lat) * s, y = oy + (P.jy * d + py * lat - P.rise * k * k) * s;
    const r = (P.r0 + (P.r1 - P.r0) * Math.pow(k, 0.8)) * (0.75 + 0.5 * h2) * k0 * s, st = 1 + 0.7 * (1 - k);   // stretched along its way while young
    const al = P.a * f * Math.min(1, k / 0.12) * Math.pow(1 - k, 1.6);
    if (al < 0.004) continue;
    g.globalAlpha = Math.min(1, al);
    if (P.jy) g.drawImage(img, x - r, y - r * st, 2 * r, 2 * r * st); else g.drawImage(img, x - r * st, y - r, 2 * r * st, 2 * r);
  }
  g.globalAlpha = a0;
}
// Steam rising from (x, y, z) (a mug, a pot; kind: a STEAM_KINDS key): with GFX on an upright canvas sprite
// redrawn every frame (one per source), so it sits in the world, lit like it; classic: straight on the canvas.
function steamWisps(kind, x, y, z, t, k = 1, sortY = y + 0.05) {
  const P = STEAM_KINDS[kind];
  if (GFX.on) {
    const S = 2, W = P.w * k * S, H = P.h * k * S, D = GFX.canvasSprite('steam_' + kind, W, H, { ppu: T * S, ox: W / 2, oy: H - 2 * S });
    if (D) {
      D.ctx.setTransform(1, 0, 0, 1, 0, 0); D.ctx.clearRect(0, 0, D.w, D.h);
      steamPlume(D.ctx, W / 2, H - 2 * S, S, t, P, k); D.commit();
      GFX.sprite(D.name, 0, x, y, z, { billboard: true, emissive: 0.8, sortY, depthWrite: false });
      return;
    }
  }
  steamPlume(ctx, x * T, (y - GFX.lift(z)) * T, 1, t, P, k);
}
// Item / gear / upgrade icons (items/icon_*, 128 x 128) on the 2D canvas (HUD, panels): straight
// from the atlas page. size = the icon canvas' size in CSS px. False until the page has loaded.
const ICON_PAGES = {};
function drawSpriteIcon(name, cx, cy, size) {
  const S = GFX.on && GFX.info(name), fr = S && S.f && S.f[0];
  if (!fr || fr.length > 7) return false;
  const file = `assets/sprites/${S.group}/page${fr[0]}.webp`;
  let img = ICON_PAGES[file];
  if (!img) { img = ICON_PAGES[file] = new Image(); img.src = file; }
  if (!img.complete || !img.naturalWidth) return false;
  const k = size / 128;
  ctx.drawImage(img, fr[1], fr[2], fr[3], fr[4], cx - fr[5] * k, cy - fr[6] * k, fr[3] * k, fr[4] * k);
  return true;
}

// ---------------------------------------------------------------------------
// Small drawing pieces (pixel coordinates unless noted)
// ---------------------------------------------------------------------------
function tapeStrip(x, y, len, a, seed = 1) {
  const r = rng(seed), w = T * 0.2;
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath();                                  // torn, zig-zag ends
  ctx.moveTo(-len / 2, -w / 2);
  ctx.lineTo(len / 2, -w / 2);
  for (let i = 1; i <= 4; i++) ctx.lineTo(len / 2 + (i % 2 ? 3 : -1) * r(), -w / 2 + i * w / 4);
  ctx.lineTo(-len / 2, w / 2);
  for (let i = 3; i >= 0; i--) ctx.lineTo(-len / 2 + (i % 2 ? -3 : 1) * r(), -w / 2 + i * w / 4);
  ctx.closePath();
  ctx.fillStyle = 'rgba(178,184,192,0.95)'; ctx.fill();
  ctx.strokeStyle = 'rgba(20,22,27,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(-len / 2 + 2, -w / 2 + 2, len - 4, w * 0.25);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;             // fabric weave
  for (let i = -len / 2 + 4; i < len / 2; i += 4) { ctx.beginPath(); ctx.moveTo(i, -w / 2); ctx.lineTo(i, w / 2); ctx.stroke(); }
  ctx.restore();
}
const tapeX = (x, y, s = T * 0.55, seed = 1) => { tapeStrip(x, y, s, 0.75, seed); tapeStrip(x, y, s, -0.75, seed + 1); };

function crack(x, y, len, a, seed) {
  const r = rng(seed);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(-len / 2, 0);
  for (let i = 1; i <= 6; i++) ctx.lineTo(-len / 2 + i * len / 6, (r() - 0.5) * T * 0.25);
  ctx.strokeStyle = 'rgba(15,17,22,0.75)'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-len * 0.1, 0); ctx.lineTo(-len * 0.05, T * 0.22); ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

function stain(x, y, rad, col, seed) {
  const r = rng(seed);
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * TAU, m = 0.7 + r() * 0.5;
    i ? ctx.lineTo(x + Math.cos(a) * rad * m, y + Math.sin(a) * rad * m * 0.8) : ctx.moveTo(x + Math.cos(a) * rad * m, y + Math.sin(a) * rad * m * 0.8);
  }
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 3; i++) {                     // splatter drops
    ctx.beginPath(); ctx.arc(x + (r() - 0.5) * rad * 3, y + (r() - 0.5) * rad * 2.4, 1.5 + r() * 3, 0, TAU); ctx.fill();
  }
}

// Cable along a polyline (pixel points), sagging slightly, taped down at every other joint.
function cable(pts, col, width, seed) {
  ctx.beginPath(); ctx.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    ctx.quadraticCurveTo((ax + bx) / 2 + (by - ay) * 0.12, (ay + by) / 2 - (bx - ax) * 0.12, bx, by);
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = width + 5; ctx.save(); ctx.translate(2, 3); ctx.stroke(); ctx.restore();
  ctx.strokeStyle = OUT; ctx.lineWidth = width + 3; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = width; ctx.stroke();
  for (let i = 1; i < pts.length - 1; i += 2) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1];
    tapeStrip(pts[i][0], pts[i][1], T * 0.5, Math.atan2(by - ay, bx - ax) + Math.PI / 2, seed + i);
  }
}

function crate(x, y, w, h, a, col, label) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  shadowEllipse(4, 6, w * 0.55, h * 0.55, 0.3);
  rr(-w / 2, -h / 2, w, h, 3);
  const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, shade(col, 0.15)); g.addColorStop(1, shade(col, -0.25));
  ctx.fillStyle = g; ctx.fill(); stroke(2.5);
  rr(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, 2); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-w / 2 + 5, -h / 2 + 5); ctx.lineTo(w / 2 - 5, h / 2 - 5); ctx.stroke();
  if (label) {
    ctx.fillStyle = 'rgba(20,22,27,0.6)'; ctx.font = `700 ${T * 0.16}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 0); ctx.textAlign = 'left';
  }
  ctx.restore();
}

function coffee(x, y, t) {
  shadowEllipse(x + 2, y + 3, 8, 6, 0.35);
  ctx.beginPath(); ctx.arc(x + 9, y, 4.5, -1.2, 1.2); ctx.strokeStyle = OUT; ctx.lineWidth = 4; ctx.stroke();   // handle
  ctx.strokeStyle = '#e8e4dc'; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fillStyle = '#e8e4dc'; ctx.fill(); stroke(2);
  ctx.beginPath(); ctx.arc(x, y, 5.5, 0, TAU); ctx.fillStyle = '#4a2c1a'; ctx.fill();
  ctx.beginPath(); ctx.arc(x - 1.5, y - 1.5, 1.8, 0, TAU); ctx.fillStyle = 'rgba(255,230,200,0.4)'; ctx.fill();
  steamPlume(ctx, x, y - 3, 1, t, STEAM_KINDS.mug);   // steam drifting up
}

// Round map table with a flickering holographic star chart, plus breakfast.
const TABLE_Z = 0.78, DESK_Z = 0.72, COUNTER_Z = 0.8;   // map table / console desk / kitchen counter top heights (models/systems/consoles.py, props/interior.py)
function mapTable(x, y, t) {
  const r = T * 1.1;
  const off = typeof CAPACITORS !== 'undefined' && (CAPACITORS[1].charge <= 0 || broken(CAPACITORS[1]));
  if (spr(off ? 'systems/maptable_off' : 'systems/maptable', 0, x / T, y / T, 0, { emissive: off ? 0 : 0.8, pick: [1.1, 1.3] })) {
    const D = !off && GFX.canvasSprite('map_sweep', 112, 112 * GFX.SIN, { ppu: 96 });
    if (D) {                                         // the radar sweep, lying on the table's screen (a flat sprite at its height)
      const g = D.ctx, a = t * 0.6, R = 0.72 * 1.1 * 48;
      g.setTransform(1, 0, 0, GFX.SIN, D.w / 2, D.h / 2); g.clearRect(-D.w, -D.h / GFX.SIN, 2 * D.w, 2 * D.h / GFX.SIN);
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
      gr.addColorStop(0, 'rgba(95,214,228,0.05)'); gr.addColorStop(1, 'rgba(120,230,240,0.32)');
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, a, a + 0.5); g.closePath(); g.fillStyle = gr; g.fill();
      D.commit();
      GFX.sprite(D.name, 0, x / T, y / T, TABLE_Z, { unlit: true, sortY: y / T + 0.01, depthBias: 0.03, depthWrite: false });
    }
    return;
  }
  shadowEllipse(x + 6, y + 9, r * 1.05, r * 0.9, 0.35);
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 2, x, y, r);
  g.addColorStop(0, '#5a6274'); g.addColorStop(1, '#343a47');
  ctx.fillStyle = g; ctx.fill(); stroke(3);
  ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, TAU); ctx.fillStyle = '#16222c'; ctx.fill(); stroke(1.5);
  {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r * 0.72, 0, TAU); ctx.clip();
    ctx.strokeStyle = 'rgba(95,214,228,0.35)'; ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.arc(x, y, r * 0.22 * i, 0, TAU); ctx.stroke(); }
    const sr = rng(5);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = 'rgba(200,250,255,0.85)';
      ctx.fillRect(x + (sr() - 0.5) * r * 1.3, y + (sr() - 0.5) * r * 1.3, 2, 2);
    }
    const a = t * 0.6;                                                  // sweep
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 0.72, a, a + 0.5); ctx.closePath();
    ctx.fillStyle = 'rgba(95,214,228,0.18)'; ctx.fill();
    ctx.restore();
  }
}
function donutBox(x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = '#f2c6d8'; ctx.fillRect(-T * 0.4, -T * 0.28, T * 0.8, T * 0.56);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(-T * 0.4, -T * 0.28, T * 0.8, T * 0.56);
  for (const [dx, dy, c] of [[-0.2, -0.1, '#c0587a'], [0.2, 0.12, '#7a4a2a']]) {      // two left
    ctx.beginPath(); ctx.arc(dx * T, dy * T, T * 0.11, 0, TAU); ctx.fillStyle = c; ctx.fill(); stroke(1.2);
    ctx.beginPath(); ctx.arc(dx * T, dy * T, T * 0.035, 0, TAU); ctx.fillStyle = '#f2c6d8'; ctx.fill();
  }
  ctx.restore();
}

function stickyNote(x, y, a, col = '#f2df6b') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.fillStyle = col; ctx.fillRect(-6, -6, 12, 12);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(-6, -6, 12, 12);
  ctx.fillStyle = 'rgba(40,40,80,0.6)'; ctx.fillRect(-4, -3, 7, 1); ctx.fillRect(-4, 0, 5, 1); ctx.fillRect(-4, 3, 6, 1);
  ctx.restore();
}

function papers(x, y, seed) {
  const r = rng(seed);
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.translate(x + (r() - 0.5) * T * 0.8, y + (r() - 0.5) * T * 0.6); ctx.rotate((r() - 0.5) * 1.6);
    ctx.fillStyle = '#e9e6dc'; ctx.fillRect(-9, -12, 18, 24);
    ctx.strokeStyle = 'rgba(20,22,27,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(-9, -12, 18, 24);
    ctx.fillStyle = 'rgba(60,70,90,0.45)'; for (let l = 0; l < 5; l++) ctx.fillRect(-6, -8 + l * 4, 8 + r() * 4, 1.2);
    ctx.restore();
  }
}

function wrench(x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  shadowEllipse(3, 4, T * 0.35, 5, 0.3);
  rr(-T * 0.3, -3, T * 0.5, 6, 3); ctx.fillStyle = '#a9b2c0'; ctx.fill(); stroke(1.5);
  ctx.beginPath(); ctx.arc(T * 0.24, 0, 7, 0.6, TAU - 0.6); ctx.lineTo(T * 0.24, 0); ctx.closePath();
  ctx.fillStyle = '#a9b2c0'; ctx.fill(); stroke(1.5);
  ctx.beginPath(); ctx.arc(-T * 0.3, 0, 5, 0, TAU); ctx.fill(); stroke(1.5);
  ctx.restore();
}

function toolbox(x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  shadowEllipse(4, 6, T * 0.45, T * 0.3, 0.35);
  rr(-T * 0.42, -T * 0.24, T * 0.84, T * 0.48, 4); ctx.fillStyle = '#b8402e'; ctx.fill(); stroke(2);
  rr(-T * 0.36, -T * 0.18, T * 0.72, T * 0.36, 2); ctx.fillStyle = '#5a1f17'; ctx.fill();
  ctx.fillStyle = '#c9ced8'; ctx.fillRect(-T * 0.3, -T * 0.12, T * 0.3, 4);      // tools inside
  ctx.fillStyle = '#e8c34f'; ctx.fillRect(-T * 0.05, 0, T * 0.32, 4);
  ctx.fillStyle = '#5fd6a0'; ctx.fillRect(-T * 0.25, T * 0.06, T * 0.18, 5);
  ctx.restore();
}

function plant(x, y, t) {
  shadowEllipse(x + 3, y + 5, T * 0.32, T * 0.24, 0.35);
  ctx.beginPath(); ctx.arc(x, y, T * 0.25, 0, TAU); ctx.fillStyle = '#9a5a3a'; ctx.fill(); stroke(2);
  ctx.beginPath(); ctx.arc(x, y, T * 0.19, 0, TAU); ctx.fillStyle = '#3e2a1e'; ctx.fill();
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * TAU + Math.sin(t * 0.8 + i) * 0.06, l = T * (0.35 + (i % 3) * 0.08);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.beginPath(); ctx.ellipse(l * 0.55, 0, l * 0.55, T * 0.08, 0, 0, TAU);
    ctx.fillStyle = i % 2 ? '#5f9a4a' : '#4c8240'; ctx.fill(); stroke(1.5);
    ctx.restore();
  }
}

function duck(x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  shadowEllipse(2, 3, 9, 7, 0.3);
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 7, 0, 0, TAU); ctx.fillStyle = '#f4cf3a'; ctx.fill(); stroke(1.8);
  ctx.beginPath(); ctx.arc(6, 0, 5, 0, TAU); ctx.fill(); stroke(1.8);
  ctx.beginPath(); ctx.ellipse(11.5, 0, 3, 2, 0, 0, TAU); ctx.fillStyle = '#ef8a2a'; ctx.fill(); stroke(1.2);
  ctx.fillStyle = OUT; ctx.fillRect(6.5, -2.5, 1.6, 1.6); ctx.fillRect(6.5, 1, 1.6, 1.6);
  ctx.restore();
}

// Ship cat, asleep on the warm floor. Breathes.
const catScared = () => typeof combat !== 'undefined' && typeof time === 'number' && combat.decals.some(d => d.r > 0.8 && d.hot != null && time - d.hot >= 0 && time - d.hot < 4);
function catSprite(x, y, t) {                       // props/cat_*: origin CAT on the floor
  if (!sprReady('props/cat_sleep', 'props/cat_hide', 'props/cat_stare', 'props/cat_pet', 'props/cat_flick')) return false;
  const o = { pick: [0.45, 0.6] };
  // a big hit on the ship (the bang): it flattens into a fur pancake for ~4 s. combat.decals and time are
  // synced to every client; large hits are the r 1.1 decals, `hot` = when they hit (js/combat.js shipHit)
  if (catScared()) { spr('props/cat_hide', 0, CAT.x, CAT.y + 0.125, 0, o); return true; }
  if (typeof fires !== 'undefined' && fires.some(f => Math.hypot(f.x - CAT.x, f.y - CAT.y) < 7)) { spr('props/cat_stare', 0, CAT.x, CAT.y, 0, o); return true; }
  const petted = typeof luck !== 'undefined' && luck.pet > 0, fl = (t % 9) / 0.9;   // now and then a tail flick (0.9 s every 9 s)
  if (petted) spr('props/cat_pet', Math.floor(t * 8) % 6, CAT.x, CAT.y, 0, o);
  else if (fl < 1) spr('props/cat_flick', Math.floor(fl * 6), CAT.x, CAT.y, 0, o);
  else spr('props/cat_sleep', Math.floor(t / 3.93 * 8) % 8, CAT.x, CAT.y, 0, o);
  const k = (t * 0.5) % 1, up = (px) => px / T / GFX.COS;   // hearts / z z z rising over the cat (world px up → height)
  if (petted) {
    for (let i = 0; i < 3; i++) {
      const q = (t * 0.8 + i / 3) % 1;
      worldText(CAT.x + Math.sin(i * 2 + t * 2) * 10 / T, CAT.y, 0.45 + up(q * 30), '♥', `700 ${T * 0.3}px system-ui, sans-serif`, '#ff6e96', { alpha: 1 - q, sortY: CAT.y + 0.02 });
    }
  } else worldText(CAT.x + 0.3 + k * 10 / T, CAT.y, 0.45 + up(k * 22), 'z', `700 ${T * 0.3}px system-ui, sans-serif`, '#e8ecf4', { alpha: 0.7 * (1 - k), sortY: CAT.y + 0.02 });
  return true;
}
function cat(x, y, t) {
  if (catSprite(x, y, t)) return;
  // hull breach somewhere: it hides (only a pair of eyes under a blanket of fur)
  if (catScared()) {                                // (a big hit just now: see catSprite)
    ctx.save(); ctx.translate(x, y + 6);
    ctx.beginPath(); ctx.ellipse(0, 0, T * 0.26, T * 0.14, 0, 0, TAU); ctx.fillStyle = '#c98a3c'; ctx.fill(); stroke(2);
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 5, -2, 3, 0, TAU); ctx.fillStyle = '#ffe08a'; ctx.fill(); ctx.beginPath(); ctx.arc(s * 5, -2, 1.2, 0, TAU); ctx.fillStyle = OUT; ctx.fill(); }
    ctx.restore(); return;
  }
  const staring = typeof fires !== 'undefined' && fires.some(f => Math.hypot(f.x - CAT.x, f.y - CAT.y) < 7);   // a fire nearby: wide awake, staring
  const b = 1 + 0.04 * Math.sin(t * 1.6);
  shadowEllipse(x + 3, y + 5, T * 0.36, T * 0.28, 0.35);
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, T * 0.4, 0.3, TAU - 0.9);                     // tail curled around
  ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.stroke();
  ctx.strokeStyle = '#d98a3c'; ctx.lineWidth = 5.5; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, T * 0.3 * b, T * 0.24 * b, 0, 0, TAU);
  ctx.fillStyle = '#e39a4a'; ctx.fill(); stroke(2);
  ctx.strokeStyle = 'rgba(140,70,20,0.6)'; ctx.lineWidth = 2.5;                // tabby stripes
  for (const k of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.arc(-T * 0.05, 0, T * 0.2, k - 0.25 + Math.PI, k + 0.25 + Math.PI); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(T * 0.2, -T * 0.1, T * 0.14, 0, TAU); ctx.fillStyle = '#e8a456'; ctx.fill(); stroke(2);
  for (const s of [-1, 1]) {                         // ears
    poly([[T * 0.22 + s * 5, -T * 0.2], [T * 0.22 + s * 9, -T * 0.32], [T * 0.22 + s * 1, -T * 0.25]]);
    ctx.fillStyle = '#e8a456'; ctx.fill(); stroke(1.5);
  }
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5;        // closed eyes (or wide open, staring at a fire)
  for (const s of [-1, 1]) {
    if (staring) { ctx.beginPath(); ctx.arc(T * 0.2 + s * 4, -T * 0.08, 2.6, 0, TAU); ctx.fillStyle = '#ffe08a'; ctx.fill(); stroke(1); ctx.fillStyle = OUT; ctx.fillRect(T * 0.2 + s * 4 - 0.6, -T * 0.08 - 2, 1.2, 4); }
    else { ctx.beginPath(); ctx.arc(T * 0.2 + s * 4, -T * 0.08, 2.5, 0.2, Math.PI - 0.2); ctx.stroke(); }
  }
  ctx.restore();
  if (staring) return;
  const k = (t * 0.5) % 1;
  if (typeof luck !== 'undefined' && luck.pet > 0) {  // just petted: hearts
    for (let i = 0; i < 3; i++) {
      const q = (t * 0.8 + i / 3) % 1, hx = x + Math.sin(i * 2 + t * 2) * 10, hy = y - T * 0.3 - q * 30;
      ctx.fillStyle = `rgba(255,110,150,${1 - q})`; ctx.beginPath();
      ctx.moveTo(hx, hy + 4); ctx.bezierCurveTo(hx - 7, hy - 2, hx - 3, hy - 7, hx, hy - 3); ctx.bezierCurveTo(hx + 3, hy - 7, hx + 7, hy - 2, hx, hy + 4); ctx.fill();
    }
  } else {                                            // z z z
    ctx.fillStyle = `rgba(232,236,244,${0.7 * (1 - k)})`; ctx.font = `700 ${10 + k * 8}px system-ui, sans-serif`;
    ctx.fillText('z', x + T * 0.3 + k * 10, y - T * 0.35 - k * 22);
  }
}

function pizza(x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  shadowEllipse(4, 6, T * 0.5, T * 0.45, 0.3);
  ctx.fillStyle = '#c9a46a'; ctx.fillRect(-T * 0.45, -T * 0.45, T * 0.9, T * 0.9);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(-T * 0.45, -T * 0.45, T * 0.9, T * 0.9);
  ctx.fillStyle = '#b08850'; ctx.fillRect(-T * 0.45, -T * 0.75, T * 0.9, T * 0.3); ctx.strokeRect(-T * 0.45, -T * 0.75, T * 0.9, T * 0.3); // open lid
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, T * 0.36, 0.6, TAU - 1.0); ctx.closePath();   // two slices gone
  ctx.fillStyle = '#e8b04a'; ctx.fill(); stroke(1.5);
  ctx.fillStyle = '#c0392b';
  for (const [px, py] of [[-8, -6], [6, -10], [-4, 8], [-12, 4], [2, 2]]) { ctx.beginPath(); ctx.arc(px, py, 3, 0, TAU); ctx.fill(); }
  ctx.restore();
}

// Fire extinguisher lying on its side.
function extinguisher(x, y, a = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  shadowEllipse(3, 5, T * 0.36, T * 0.16, 0.35);
  rr(-T * 0.32, -T * 0.13, T * 0.56, T * 0.26, T * 0.13);
  const g = ctx.createLinearGradient(0, -T * 0.13, 0, T * 0.13);
  g.addColorStop(0, '#f06a55'); g.addColorStop(1, '#a8261c');
  ctx.fillStyle = g; ctx.fill(); stroke(2);
  ctx.fillStyle = '#e9e6dc'; ctx.fillRect(-T * 0.12, -T * 0.1, T * 0.14, T * 0.2);          // label
  rr(T * 0.22, -T * 0.06, T * 0.12, T * 0.12, 2); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);   // valve
  ctx.beginPath(); ctx.moveTo(T * 0.34, 0); ctx.quadraticCurveTo(T * 0.5, T * 0.2, T * 0.1, T * 0.22);
  ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();                                    // hose
  ctx.restore();
}

// Bucket under a leaking pipe; drops fall into it.
function bucket(x, y, t) {
  shadowEllipse(x + 3, y + 4, 13, 11, 0.35);
  ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fillStyle = '#4a7ab8'; ctx.fill(); stroke(2);
  ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fillStyle = '#5a8a9a'; ctx.fill(); stroke(1.2);
  const k = (t * 1.1) % 1;
  if (k > 0.8) {                                      // ripple on impact
    ctx.beginPath(); ctx.arc(x, y, 2 + (k - 0.8) * 30, 0, TAU);
    ctx.strokeStyle = `rgba(200,235,255,${1 - (k - 0.8) * 5})`; ctx.lineWidth = 1.5; ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(x, y - (0.8 - k) * 30, 2.5, 0, TAU); ctx.fillStyle = 'rgba(170,220,255,0.9)'; ctx.fill();
  }
}

function sleepingBag(x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  shadowEllipse(4, 6, T * 0.9, T * 0.4, 0.3);
  rr(-T * 0.9, -T * 0.35, T * 1.8, T * 0.7, T * 0.3); ctx.fillStyle = '#3f7a5a'; ctx.fill(); stroke(2);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  for (let i = -2; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * T * 0.3, -T * 0.3); ctx.lineTo(i * T * 0.3, T * 0.3); ctx.stroke(); }
  rr(T * 0.45, -T * 0.28, T * 0.42, T * 0.56, 8); ctx.fillStyle = '#e9e6dc'; ctx.fill(); stroke(1.5);   // pillow
  ctx.restore();
}

function socks(x0, x1, y, t) {
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + x1) / 2, y + 12, x1, y);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
  const cols = ['#e2574c', '#e8e4dc', '#5f9ad6', '#e8c34f', '#e2574c'];
  for (let i = 0; i < 5; i++) {
    const k = (i + 1) / 6, sx = lerp(x0, x1, k), sy = y + 12 * 4 * k * (1 - k) * 0.5;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(((i * 7) % 5 - 2) * 0.03);   // a little askew, but still
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-4, 14); ctx.quadraticCurveTo(-4, 20, 4, 20); ctx.lineTo(7, 20); ctx.lineTo(7, 14); ctx.lineTo(4, 14); ctx.lineTo(4, 0); ctx.closePath();
    ctx.fillStyle = cols[i]; ctx.fill(); stroke(1.3);
    ctx.restore();
  }
}

// Wall panel hanging open with sparking wires.
function sparks(x, y, t, seed) {
  rr(x - 10, y - 8, 20, 16, 2); ctx.fillStyle = '#1b1e24'; ctx.fill(); stroke(1.5);
  for (const [c, o] of [['#e2574c', -4], ['#e8c34f', 0], ['#5f9ad6', 4]]) {
    ctx.beginPath(); ctx.moveTo(x + o, y); ctx.quadraticCurveTo(x + o * 3, y + 14, x + o * 2 + 4, y + 18);
    ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
  }
  const r = rng(seed + Math.floor(t * 6));
  if (r() < 0.06) {                                   // the odd small spark, no flashing
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU, l = 4 + r() * 7;
      ctx.beginPath(); ctx.moveTo(x + 8, y + 18); ctx.lineTo(x + 8 + Math.cos(a) * l, y + 18 + Math.sin(a) * l);
      ctx.strokeStyle = 'rgba(255,220,120,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}

// A hiss of steam out of a leaky pipe (x, y in world px): a jet to the right, slowing and drifting up.
function steamPuff(x, y, t) { steamPlume(ctx, x, y, 1, t, STEAM_KINDS.leak); }

function stencil(x, y, text, a = 0, size = 0.3, col = 'rgba(210,166,46,0.55)') {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  ctx.font = `800 ${T * size}px system-ui, sans-serif`; ctx.letterSpacing = '2px';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = col; ctx.fillText(text, 0, 0);
  ctx.restore();
}

function tapeRoll(x, y) {
  shadowEllipse(x + 2, y + 4, 11, 9, 0.3);
  ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fillStyle = '#b2b8c0'; ctx.fill(); stroke(2);
  ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.fillStyle = '#c9a46a'; ctx.fill(); stroke(1.5);
  ctx.beginPath(); ctx.moveTo(x + 9, y + 3); ctx.lineTo(x + 20, y + 9); ctx.lineTo(x + 16, y + 13); ctx.lineTo(x + 7, y + 6);
  ctx.fillStyle = '#b2b8c0'; ctx.fill(); stroke(1.2);
}

function hullPatch(x, y, w, h, a, seed) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  rr(-w / 2, -h / 2, w, h, 3); ctx.fillStyle = shade('#5d636e', -0.1); ctx.fill(); stroke(2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let i = 0; i < 6; i++) {
    const k = i / 5;
    ctx.fillRect(-w / 2 + 3 + k * (w - 8), -h / 2 + 3, 2.5, 2.5); ctx.fillRect(-w / 2 + 3 + k * (w - 8), h / 2 - 5, 2.5, 2.5);
  }
  ctx.restore();
  tapeStrip(x + w * 0.3, y, h * 1.3, a + Math.PI / 2 + 0.2, seed);
}

// ---------------------------------------------------------------------------
// Where the clutter goes (layout units). Drawn in two passes: floor-level and on-top.
// ---------------------------------------------------------------------------
const U = (v) => v * T;
function drawHullDecor(t) {
  // windows on the bridge nose
  for (const wx of [18.9, 25.5]) {
    rr(U(wx) - U(0.45), U(-3.05), U(0.9), U(0.5), 5);
    const g = ctx.createLinearGradient(0, U(-3.05), 0, U(-2.55));
    g.addColorStop(0, '#9fd2ee'); g.addColorStop(1, '#2d5f82');
    ctx.fillStyle = g; ctx.fill(); stroke(2);
  }
  crack(U(25.5), U(-2.8), U(0.6), 0.4, 20);
  tapeStrip(U(25.55), U(-2.8), U(0.55), -1.1, 21);
}

function drawSpineDecor(t) {
  steamPuff(U(22.0), U(13.2), t);                      // a leaky pipe between the decks
}

function drawFloorDecor(t) {
  const flat = (name, x, y) => spr(name, 0, x, y, 0, { layer: 'decal' });   // sprites, or false (then the 2D drawing)
  const solid = (name, x, y, o) => spr(name, (o && o.f) || 0, x, y, 0, o);
  // --- Left cannon room
  if (!flat('props/crack_portgun', 4.6, 6.6)) { crack(U(4.6), U(6.6), U(1.6), 0.3, 41); tapeX(U(4.6), U(6.6), U(0.6), 42); }
  stencil(U(5.2), U(8.6), '← LADDER TO THE CANNON', 0, 0.24);
  // --- Bridge
  stain(U(21.6), U(-0.9), U(0.35), 'rgba(80,45,20,0.45)', 50);          // spilled coffee
  if (!flat('props/papers_bridge', 17.0, 6.0)) papers(U(17.0), U(6.0), 53);
  if (!solid('props/plant', 14.95, 10.75, { f: 0 })) plant(U(14.95), U(10.75), 0);   // (still: a swaying plant looked fake)
  if (!flat('props/crack_bridge', 25.0, 8.0)) { crack(U(25.0), U(8.0), U(2.0), -0.5, 54); tapeStrip(U(25.0), U(8.0), U(0.6), 1.0, 55); tapeStrip(U(25.6), U(7.7), U(0.6), 1.2, 56); }
  stencil(U(22.2), U(10.4), 'NO RUNNING ON THE BRIDGE', 0, 0.26, 'rgba(232,236,244,0.25)');
  // --- Right cannon room
  const K = CLUTTER;                                                    // (crates and co.: positions and footprints in js/ship.js)
  if (!solid('props/sleeping_bag', K.sleepingBag.x, K.sleepingBag.y)) sleepingBag(U(K.sleepingBag.x), U(K.sleepingBag.y), K.sleepingBag.a);   // bunk five
  if (!solid('props/toolbox', K.toolbox.x, K.toolbox.y)) toolbox(U(K.toolbox.x), U(K.toolbox.y), K.toolbox.a);
  if (!flat('props/crack_stargun', 34.0, 8.4)) { crack(U(34.0), U(8.4), U(1.4), 1.0, 61); tapeX(U(34.0), U(8.4), U(0.6), 62); }
  // --- Left airlock room
  stencil(U(1.45), U(19.2), 'EVA', -Math.PI / 2, 0.45);                 // (by the hatch, clear of the power line to the cannon)
  // --- Reactor
  ctx.save(); ctx.setLineDash([12, 8]);
  ctx.strokeStyle = 'rgba(210,166,46,0.55)'; ctx.lineWidth = 5;
  ctx.strokeRect(U(REACTOR.x - REACTOR.w / 2 - 0.6), U(REACTOR.y - REACTOR.h / 2 - 0.5), U(REACTOR.w + 1.2), U(REACTOR.h + 1.3));
  ctx.restore();
  stencil(U(22.3), U(21.1), 'DO NOT LICK THE REACTOR', 0, 0.15);
  // (the two orange cables from the reactor to the engine, props/cable_engine_l/r, are gone: the power lever's
  // branches had to cross them)
  // --- Right airlock room
  stencil(U(42.95), U(19.4), 'EVA', Math.PI / 2, 0.45);
  if (!flat('props/crack_starlock', 39.2, 17.6)) { crack(U(39.2), U(17.6), U(1.4), 0.2, 91); tapeX(U(39.2), U(17.6), U(0.6), 92); }
}

function drawPropDecor(t) {
  // sprites where they're loaded (props/*, systems/*; origin = the 2D drawing's x, y), else the old 2D
  const S = (name, x, y, z = 0, o) => spr(name, (o && o.f) || 0, x, y, z, o);
  const onTop = (z, sortY) => ({ sortY, depthBias: 0.03 });           // things on a desk / table: lifted by its height
  const plates = typeof hz === 'undefined' || hz.plates > 0 ? 'full' : 'empty';
  mapTable(U(22.2), U(6.4), t);
  if (!S('props/donut_box', 22.6, 6.65, TABLE_Z, onTop(TABLE_Z, 6.45))) donutBox(U(23.0), U(6.9), 0.3);   // (sprite: on the table top, not over its edge)
  if (!S('props/papers_maptable', 21.6, 6.0, TABLE_Z, onTop(TABLE_Z, 6.41))) papers(U(21.6), U(6.0), 57);
  // Kitchen: the crew runs on coffee (the mug: systems/mug_*, origin on the floor at COFFEE_MUG, modelled
  // at desk height; the counter top is COUNTER_Z, so it's lifted by the difference)
  const full = typeof hz === 'undefined' || hz.coffee >= 1, MUG = typeof COFFEE_MUG === 'undefined' ? { x: 7.52, y: 10.92 } : COFFEE_MUG;
  if (S(full ? 'systems/mug_full' : 'systems/mug_empty', MUG.x, MUG.y, COUNTER_Z - DESK_Z, { sortY: 10.69, depthBias: 0.03, pick: [0.15, 1.0] })) {
    if (full) steamWisps('mug', MUG.x, MUG.y, COUNTER_Z + 0.2, t, 1, 10.69);   // steam over the mug, at counter height
  }                                                                       // (no sprite: js/interior.js kitchenMug, over the counter)
  if (!S('props/sticky_yellow', 21.65, -2.1, DESK_Z, onTop(DESK_Z, -1.76))) stickyNote(U(21.65), U(-2.1), 0.2);
  if (!S('props/sticky_pink', 21.95, -1.95, DESK_Z, onTop(DESK_Z, -1.76))) stickyNote(U(21.95), U(-1.95), -0.3, '#f29bc4');
  if (!S('props/duck_star', 42.6, 6.4)) duck(U(42.6), U(6.4), Math.PI);
  // Left cannon room: ammo crates (positions and footprints: CLUTTER in js/ship.js, solid like furniture)
  const K = CLUTTER, box = (name, k, col, label) => { const c = K[k]; if (!S(name, c.x, c.y)) crate(U(c.x), U(c.y), U(c.w), U(c.h), c.a, col, label); };
  box('props/crate_ammo_port', 'ammoPort', '#8a7a4a', 'AMMO');
  box('props/crate_blank_port', 'blankPort', '#8a7a4a');
  box('props/crate_snax', 'snax', '#7a8a5a', 'SNAX');
  // Right cannon room (along the walls, out of the way)
  box('props/crate_ammo_star', 'ammoStar', '#8a7a4a', 'AMMO');
  box('props/crate_misc', 'misc', '#6a6f7a', 'MISC');
  // Left airlock room: supply crates (the hull plates: PLATE_CRATES, the coolant: COOLANT_CRATE)
  if (!S(`systems/plates_a_${plates}`, K.platesA.x, K.platesA.y, 0, { pick: [0.5, 0.8] })) crate(U(K.platesA.x), U(K.platesA.y), U(1.0), U(0.9), 0.1, '#6a6f7a', 'PLATES');
  if (!S('systems/coolant', K.coolant.x, K.coolant.y, 0, { pick: [0.4, 0.7] })) crate(U(K.coolant.x), U(K.coolant.y), U(0.8), U(0.7), -0.2, '#4a8aa0', 'COOLANT');
  // Reactor
  if (!S('props/duck_reactor', 18.4, 23.1)) duck(U(18.4), U(23.1), 0.5);
  cat(U(CAT.x), U(CAT.y), t);
  const pl = K.sockPoleL, pr = K.sockPoleR;            // (the washing line: solid stands, CLUTTER in js/ship.js)
  if (!S('props/socks', (pl.x + pr.x) / 2, pl.y, 0, { f: 0 })) socks(U(pl.x), U(pr.x), U(pl.y), t);   // (still: the swaying was distracting)
  fuelCrate(U(17.4), U(19.6), 0.08);
  // Right airlock room
  box('props/crate_tape', 'tape', '#6a6f7a', 'TAPE');
  if (!S(`systems/plates_b_${plates}`, K.platesB.x, K.platesB.y, 0, { pick: [0.45, 0.8] })) crate(U(K.platesB.x), U(K.platesB.y), U(0.9), U(0.8), -0.1, '#6a6f7a', 'PLATES');
  box('props/crate_blank_star', 'blankStar', '#7a8a5a');
  // (the gym: a dumbbell rack against the back wall, top right corner, between the wall beacon and the
  // cannon's power line; solid (CLUTTER.weightRack); models/props/gym.py. The classic view skips it.)
  S('props/weight_rack', K.weightRack.x, K.weightRack.y);
}

// Small junk scattered on every floor: nuts, soda cans, wrappers, tape scraps.
function nut(x, y, a) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  poly(Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * TAU) * 4.5, Math.sin(i / 6 * TAU) * 4.5]));
  ctx.fillStyle = '#9aa3b5'; ctx.fill(); stroke(1.2);
  ctx.beginPath(); ctx.arc(0, 0, 1.8, 0, TAU); ctx.fillStyle = '#3a3f4a'; ctx.fill();
  ctx.restore();
}
function sodaCan(x, y, a, col) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  shadowEllipse(2, 3, 11, 6, 0.3);
  rr(-10, -5.5, 20, 11, 5); ctx.fillStyle = col; ctx.fill(); stroke(1.5);   // lying on its side, dented
  ctx.fillStyle = '#c9ced8'; ctx.fillRect(7, -4.5, 3, 9);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-8, -4, 14, 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(0, 5); ctx.stroke();
  ctx.restore();
}
function wrapper(x, y, a, col, seed) {
  const r = rng(seed);
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  poly(Array.from({ length: 7 }, (_, i) => { const q = i / 7 * TAU; const m = 5 + r() * 6; return [Math.cos(q) * m * 1.3, Math.sin(q) * m * 0.8]; }));
  ctx.fillStyle = col; ctx.fill(); stroke(1.2);
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-4, -2, 6, 2);
  ctx.restore();
}
const JUNK = (() => {
  const r = rng(4242), out = [];
  const cans = ['#c0392b', '#2e7dc9', '#3a9a5a', '#e8c34f'], wraps = ['#e2574c', '#9b59b6', '#e8c34f', '#5fd6a0'];
  for (const room of ROOMS) {
    const q = room.rects[0];
    for (let i = 0; i < 14; i++) {
      const x = q.x + 0.4 + r() * (q.w - 0.8), y = q.y + 0.4 + r() * (q.h - 0.8), k = r();
      if (Math.hypot(x - 22.8, y - 22.75) < 1.6) continue;          // keep the power lever clear
      if (SOLIDS.some(S => inRect(x, y, S, 0.25))) continue;          // nothing under the furniture
      if (k > 0.45) continue;                                         // just nuts and bolts (the rest only looked like blobs)
      out.push({ kind: 'nut', x, y, a: r() * TAU,
                 col: k < 0.6 ? cans[i % 4] : wraps[i % 4], seed: 7000 + out.length });
    }
  }
  return out;
})();
function drawJunk() {
  for (const j of JUNK) {
    const x = j.x * T, y = j.y * T;
    if (j.kind === 'nut') { if (!spr(`props/nut_r${Math.round((((j.a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3)) / (Math.PI / 12)) % 4}`, 0, j.x, j.y, 0, { layer: 'decal' })) nut(x, y, j.a); }
    else if (j.kind === 'can') sodaCan(x, y, j.a, j.col);
    else if (j.kind === 'wrapper') wrapper(x, y, j.a, j.col, j.seed);
    else tapeStrip(x, y, T * 0.35, j.a, j.seed);
  }
}

// Crate of spare fuel cells for the reactor.
function fuelCrate(x, y, a) {
  const cells = typeof power !== 'undefined' ? power.reserve : 3;
  if (spr(`systems/fuel_crate_c${clamp(cells, 0, 4)}`, 0, x / T, y / T, 0, { emissive: 0.5, pick: [0.7, 0.8], recolor: POWER_COL })) {
    if (cells > 4) {                                 // a bigger crew gets more spare cells than the crate shows
      ctx.fillStyle = 'rgba(200,255,216,0.9)'; ctx.font = `800 ${T * 0.16}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(`×${cells}`, x, y + T * 0.5); ctx.textAlign = 'left';
    }
    return;
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  const w = T * 1.3, h = T * 0.9;
  shadowEllipse(4, 6, w * 0.55, h * 0.55, 0.3);
  rr(-w / 2, -h / 2, w, h, 4); ctx.fillStyle = '#3f4757'; ctx.fill(); stroke(2.5);
  const left = typeof power !== 'undefined' ? power.reserve : 3;
  for (let i = 0; i < 3; i++) {                     // three slots, filled with the spare cells left
    const cx = -w / 2 + 12 + i * (w - 24) / 2, cy = 0;
    if (i >= left) { ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fillStyle = '#14161b'; ctx.fill(); continue; }
    ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU);
    const g = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, 7);
    g.addColorStop(0, '#c8ffd8'); g.addColorStop(1, '#2a7a4a');
    ctx.fillStyle = g; ctx.fill(); stroke(1.5);
  }
  ctx.fillStyle = 'rgba(232,236,244,0.7)'; ctx.font = `800 ${T * 0.13}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(left > 3 ? `FUEL CELLS ×${left}` : 'FUEL CELLS', 0, h / 2 + 3); ctx.textAlign = 'left';
  ctx.restore();
}
