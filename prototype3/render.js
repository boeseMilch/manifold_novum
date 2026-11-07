// Prototype 3, browser only: drawing the big ship in the main game's style (adapted from js/art.js: dark outlines,
// plated floors with zone tints, drawCrew suits). Everything draws from a SNAPSHOT (sim.snapshot()), so solo and
// network play look the same.
//
// Client extension points (register them in view-*.js, which load after this file):
//   BIG.STATION_VIEWS[kind] = { draw(ctx, snap, me, w, h, t), hint }   full-screen view while seated at a station of
//       that kind (screen px; me = my crew entry in the snapshot); hint: string or fn(snap, me) -> the key hint line
//   BIG.ENCOUNTER_DRAW[kind] = (ctx, enc, snap, t)    draw an encounter in space, ship-local px (multiply units by T)
//   BIG.STATION_ART[kind] = (ctx, st, snap, t)         draw a station's device on the ship plan (ship-local px)
//   BIG.HUD_HOOKS.push((ctx, snap, me, w, h, t) => …)  extra HUD in screen px (drawn after the core HUD)
//   BIG.EVENT_HOOKS.push((ev, snap, me) => …)          one-off events as they arrive (sounds, effects)
// Helpers for them: BIG.art = { T, OUT, stroke, poly, rr, shade, drawCrew, drawShell, label, toScreen }.
(function () {
'use strict';
const B = globalThis.BIG;
B.STATION_VIEWS = B.STATION_VIEWS || {};
B.ENCOUNTER_DRAW = B.ENCOUNTER_DRAW || {};
B.STATION_ART = B.STATION_ART || {};
B.HUD_HOOKS = B.HUD_HOOKS || [];
B.EVENT_HOOKS = B.EVENT_HOOKS || [];

const T = 48, TAU = Math.PI * 2, OUT = '#14161b';
const C = { hull: '#4a5263', grout: '#555b69', skin: '#e6c19b', hair: '#3a2a21', glow: '#5fd6e4', hazard: '#d2a62e', brass: '#d8a84a' };
const clamp = B.clamp;

function poly(ctx, pts) { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); }
function stroke(ctx, w = 2.5, col = OUT) { ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(clamp(k > 0 ? c + (255 - c) * k : c * (1 + k), 0, 255));
  return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`;
}
function makePlates(r, seed, maxSize) {
  const rand = B.rng(seed), out = [];
  (function split(q, depth) {
    const big = Math.max(q.w, q.h);
    if (big <= maxSize * (0.7 + rand() * 0.6) || depth > 8) { out.push(q); return; }
    const k = 0.3 + rand() * 0.4;
    if (q.w > q.h * (0.8 + rand() * 0.4)) { const w = q.w * k; split({ x: q.x, y: q.y, w, h: q.h }, depth + 1); split({ x: q.x + w, y: q.y, w: q.w - w, h: q.h }, depth + 1); }
    else { const h = q.h * k; split({ x: q.x, y: q.y, w: q.w, h }, depth + 1); split({ x: q.x, y: q.y + h, w: q.w, h: q.h - h }, depth + 1); }
  })(r, 0);
  return out.map(q => ({ ...q, r: rand() }));
}
function rivets(ctx, x, y, w, h, col = 'rgba(0,0,0,0.25)', inset = 5) {
  ctx.fillStyle = col;
  for (const [rx, ry] of [[inset, inset], [w - inset - 2, inset], [inset, h - inset - 2], [w - inset - 2, h - inset - 2]]) ctx.fillRect(x + rx, y + ry, 2.5, 2.5);
}
function rectPath(ctx, r, ccw = false) {
  const x0 = r.x * T, y0 = r.y * T, x1 = (r.x + r.w) * T, y1 = (r.y + r.h) * T;
  if (ccw) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.lineTo(x1, y0); }
  else { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); }
  ctx.closePath();
}
function shadowEllipse(ctx, x, y, rx, ry, a = 0.35) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fill(); }

// The crew suit (js/art.js drawCrew), with the crew member's color on the pack and shoulders.
function drawCrew(ctx, x, y, face, walk, color, visor = false) {
  ctx.save(); ctx.translate(x, y);
  shadowEllipse(ctx, 3, 5, T * 0.32, T * 0.27, 0.4);
  ctx.rotate(face);
  rr(ctx, -T * 0.36, -T * 0.2, T * 0.17, T * 0.4, 4); ctx.fillStyle = '#8b93a3'; ctx.fill(); stroke(ctx, 2);
  ctx.fillStyle = color; ctx.fillRect(-T * 0.33, -T * 0.06, T * 0.1, T * 0.12);
  const swing = Math.sin(walk) * T * 0.07;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(T * 0.08 + swing * s, s * T * 0.29, T * 0.085, 0, TAU); ctx.fillStyle = '#9aa1ad'; ctx.fill(); stroke(ctx, 2); }
  ctx.beginPath(); ctx.ellipse(0, 0, T * 0.19, T * 0.31, 0, 0, TAU);
  const g = ctx.createLinearGradient(-T * 0.19, 0, T * 0.19, 0); g.addColorStop(0, '#b9bfca'); g.addColorStop(1, '#eef0f4');
  ctx.fillStyle = g; ctx.fill(); stroke(ctx, 2.5);
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(0, s * T * 0.22, T * 0.12, T * 0.06, 0, 0, TAU); ctx.fillStyle = color; ctx.fill(); stroke(ctx, 1.5); }
  ctx.beginPath(); ctx.arc(T * 0.03, 0, T * 0.17, 0, TAU); ctx.fillStyle = '#e8ebf0'; ctx.fill(); stroke(ctx, 2.2);
  if (visor) {
    ctx.beginPath(); ctx.arc(T * 0.03, 0, T * 0.14, -1.35, 1.35); ctx.closePath(); ctx.fillStyle = '#d2a62e'; ctx.fill(); stroke(ctx, 1.5);
  } else {
    ctx.beginPath(); ctx.arc(T * 0.04, 0, T * 0.12, 0, TAU); ctx.fillStyle = C.skin; ctx.fill(); stroke(ctx, 1.5);
    ctx.beginPath(); ctx.arc(T * 0.04, 0, T * 0.12, Math.PI * 0.55, Math.PI * 1.45); ctx.lineTo(T * 0.01, 0); ctx.closePath(); ctx.fillStyle = C.hair; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, T * 0.15, Math.PI * 0.6, Math.PI * 1.4); ctx.strokeStyle = '#d2a62e'; ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.restore();
}
// An artillery shell lying along angle a (ship-local px), length ~0.7 units.
function drawShell(ctx, x, y, a, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(s, s);
  const L = T * 0.7, W = T * 0.2;
  ctx.beginPath(); ctx.moveTo(-L / 2, -W / 2); ctx.lineTo(L * 0.15, -W / 2); ctx.quadraticCurveTo(L / 2, -W / 2, L / 2, 0); ctx.quadraticCurveTo(L / 2, W / 2, L * 0.15, W / 2); ctx.lineTo(-L / 2, W / 2); ctx.closePath();
  ctx.fillStyle = C.brass; ctx.fill(); stroke(ctx, 2);
  ctx.fillStyle = '#8a8f9a'; ctx.fillRect(L * 0.05, -W / 2 + 1, T * 0.06, W - 2);
  ctx.fillStyle = '#a07a2c'; ctx.fillRect(-L / 2 + 1, -W / 2 + 1, T * 0.06, W - 2);
  ctx.restore();
}
function label(ctx, text, x, y, o = {}) {
  ctx.font = `${o.weight || 600} ${o.size || 13}px system-ui, sans-serif`;
  ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
  if (o.bg) {
    const w = ctx.measureText(text).width + 12, h = (o.size || 13) + 8;
    const bx = o.align === 'left' ? x - 6 : o.align === 'right' ? x - w + 6 : x - w / 2;
    rr(ctx, bx, y - h / 2, w, h, 5); ctx.fillStyle = o.bg; ctx.fill();
  }
  if (o.outline) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(text, x, y); }
  ctx.fillStyle = o.color || '#e8ecf4'; ctx.fillText(text, x, y);
}

// ---------------------------------------------------------------------------
// The static ship (hull, floors, clutter), drawn once into an offscreen canvas.
// ---------------------------------------------------------------------------
const BOX = { x0: -4, y0: -5, x1: 26, y1: 48 }, CACHE_K = 1.5;
let shipCache = null;
function zoneTint(rect) {
  const room = B.ROOMS.find(r => r.rects.includes(rect));
  return B.ZONES[room ? room.zone : 'corridor'].tint;
}
function drawStaticShip(ctx) {
  const hullPts = B.HULL.map(([x, y]) => [x * T, y * T]);
  // engine bells
  for (const e of B.ENGINES) {
    const x = e.x * T, y = e.y * T, w = e.w * T;
    poly(ctx, [[x - w * 0.35, y - 4], [x + w * 0.35, y - 4], [x + w * 0.5, y + T * 1.5], [x - w * 0.5, y + T * 1.5]]);
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, '#3a414f'); g.addColorStop(0.5, '#6a7384'); g.addColorStop(1, '#2e333e');
    ctx.fillStyle = g; ctx.fill(); stroke(ctx, 3);
  }
  // hull plates
  ctx.save(); poly(ctx, hullPts); ctx.clip();
  for (const p of makePlates({ x: -3, y: -4, w: 28, h: 51 }, 77, 4.5)) {
    const x = p.x * T, y = p.y * T, w = p.w * T, h = p.h * T;
    ctx.fillStyle = p.r < 0.05 ? shade('#5e5650', (p.r - 0.025) * 3) : shade(C.hull, (p.r - 0.5) * 0.22);
    ctx.fillRect(x, y, w, h); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    rivets(ctx, x, y, w, h, 'rgba(0,0,0,0.3)', 6);
  }
  const g = ctx.createLinearGradient(0, -4 * T, 0, 47 * T); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g; ctx.fillRect(-4 * T, -5 * T, 32 * T, 54 * T);
  poly(ctx, hullPts); ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 16; ctx.stroke();
  ctx.restore();
  poly(ctx, hullPts); stroke(ctx, 3.5);
  // radiator fins on the right sponson
  for (let k = 0; k < 6; k++) { const y = (20.2 + k * 1.0) * T; rr(ctx, 21.6 * T, y, 2.0 * T, 0.45 * T, 3); ctx.fillStyle = '#7a4a3a'; ctx.fill(); stroke(ctx, 1.5); }
  // floors
  const rects = [...B.ROOM_RECTS, ...B.DOORWAYS];
  rects.forEach((r, i) => {
    const door = B.DOORWAYS.includes(r), base = door ? '#62666f' : zoneTint(r);
    ctx.save(); ctx.beginPath(); rectPath(ctx, r); ctx.clip();
    for (const p of makePlates(r, 500 + i * 17, door ? 9 : 2.6)) {
      const x = p.x * T, y = p.y * T, w = p.w * T, h = p.h * T, odd = p.r < 0.07, diamond = p.r > 0.93;
      ctx.fillStyle = door ? shade(base, -0.25) : diamond ? shade('#7f8794', -0.12) : shade(base, (p.r - 0.5) * 0.14 - (odd ? 0.08 : 0));
      ctx.fillRect(x, y, w, h);
      if (odd) { ctx.fillStyle = 'rgba(130,85,40,0.16)'; ctx.fillRect(x, y, w, h); }
      if (diamond || door) {
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 2;
        for (let k = -h; k < w; k += 9) { ctx.beginPath(); ctx.moveTo(x + k, y + h); ctx.lineTo(x + k + h, y); ctx.stroke(); }
        ctx.restore();
      }
      ctx.strokeStyle = C.grout; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
      rivets(ctx, x, y, w, h);
    }
    ctx.restore();
  });
  ctx.save();                                       // inner shadow along every wall
  ctx.beginPath(); for (const r of rects) rectPath(ctx, r); ctx.clip();
  ctx.beginPath(); ctx.rect(BOX.x0 * T, BOX.y0 * T, (BOX.x1 - BOX.x0) * T, (BOX.y1 - BOX.y0) * T); for (const r of rects) rectPath(ctx, r, true);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 22; ctx.fillStyle = '#000'; ctx.fill('nonzero');
  ctx.restore();
  // doorway frames: hazard lips on both sides of each opening
  for (const d of B.DOORWAYS) {
    ctx.fillStyle = '#2b2f37';
    if (d.w < d.h) { ctx.fillRect(d.x * T - 2, d.y * T - 5, d.w * T + 4, 5); ctx.fillRect(d.x * T - 2, (d.y + d.h) * T, d.w * T + 4, 5); }
    else { ctx.fillRect(d.x * T - 5, d.y * T - 2, 5, d.h * T + 4); ctx.fillRect((d.x + d.w) * T, d.y * T - 2, 5, d.h * T + 4); }
  }
  for (const c of B.CLUTTER) drawClutter(ctx, c);
  // room names, faint, painted on the floor
  for (const room of B.ROOMS) {
    if (room.id === 'spine') continue;
    const r = room.rects[0];
    ctx.save(); ctx.globalAlpha = 0.5;
    label(ctx, room.name.toUpperCase(), (r.x + r.w / 2) * T, (r.y + r.h - 0.45) * T, { size: 15, weight: 800, color: B.ZONES[room.zone].label });
    ctx.restore();
  }
}
function drawClutter(ctx, c) {
  const x = c.x * T, y = c.y * T, w = c.w * T, h = c.h * T;
  const box = (fill, rad = 4) => { rr(ctx, x, y, w, h, rad); ctx.fillStyle = fill; ctx.fill(); stroke(ctx, 2.5); };
  switch (c.kind) {
    case 'bunk': box('#4a515e'); rr(ctx, x + 5, y + 5, w - 10, h - 10, 6); ctx.fillStyle = '#7d8da6'; ctx.fill(); stroke(ctx, 1.5);
      rr(ctx, x + 7, y + 7, w * 0.25, h - 14, 5); ctx.fillStyle = '#e4e0d4'; ctx.fill(); stroke(ctx, 1.2); break;
    case 'locker': box('#59606e', 2); for (let k = 1; k < Math.round(w / 20); k++) { ctx.beginPath(); ctx.moveTo(x + k * 20, y + 2); ctx.lineTo(x + k * 20, y + h - 2); stroke(ctx, 1.5, 'rgba(0,0,0,0.45)'); } break;
    case 'table': box('#8a6f4c', 8); for (const [sx, sy] of [[-0.35, 0.3], [-0.35, 0.7], [1.35, 0.3], [1.35, 0.7]]) { ctx.beginPath(); ctx.arc(x + sx * w * 0.3 + (sx > 0 ? w * 0.6 : 0), y + sy * h, T * 0.2, 0, TAU); ctx.fillStyle = '#5a606c'; ctx.fill(); stroke(ctx, 1.5); }
      ctx.beginPath(); ctx.arc(x + w * 0.4, y + h * 0.45, 7, 0, TAU); ctx.fillStyle = '#e8e4da'; ctx.fill(); stroke(ctx, 1.2); break;
    case 'stove': box('#6a6f7a'); for (const k of [0.3, 0.7]) { ctx.beginPath(); ctx.arc(x + w * k, y + h / 2, h * 0.28, 0, TAU); ctx.fillStyle = '#2a2d33'; ctx.fill(); stroke(ctx, 1.5, '#c4683a'); } break;
    case 'counter': box('#7c818c', 2); ctx.fillStyle = '#4a515e'; ctx.fillRect(x + w * 0.6, y + 4, w * 0.25, h - 8); break;
    case 'crate': box('#a48c5c', 3); ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4); ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4); stroke(ctx, 2, '#6e5a37'); break;
    case 'pipes': for (let k = 0; k < 3; k++) { const yy = y + (k + 0.5) * h / 3; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); stroke(ctx, 6, OUT); ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); stroke(ctx, 3.5, ['#3b6f7a', '#6a6f7a', '#7a5a3b'][k]); } break;
    case 'reactor': {
      const cx = x + w / 2, cy = y + h / 2;
      box('#3a414f', 10);
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * 0.36, 0, TAU); ctx.fillStyle = '#28313e'; ctx.fill(); stroke(ctx, 2.5);
      break;
    }
    case 'chartTable': box('#2f3542', 6); rr(ctx, x + 6, y + 6, w - 12, h - 12, 3); ctx.fillStyle = '#1d4a52'; ctx.fill(); stroke(ctx, 1.5); break;
    case 'console': box('#2f3542', 4); rr(ctx, x + 5, y + 5, w - 10, h - 10, 2); ctx.fillStyle = '#28536e'; ctx.fill(); stroke(ctx, 1.2); break;
    case 'periscope': box('#4a515e', 3); ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, w * 0.35, 0, TAU); ctx.fillStyle = '#1b2a33'; ctx.fill(); stroke(ctx, 1.5); break;
    case 'gunBlock': box('#545b68', 2); break;
    default: box('#5a606c');
  }
}
function shipCanvas() {
  if (shipCache) return shipCache;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil((BOX.x1 - BOX.x0) * T * CACHE_K); cv.height = Math.ceil((BOX.y1 - BOX.y0) * T * CACHE_K);
  const c = cv.getContext('2d');
  c.scale(CACHE_K, CACHE_K); c.translate(-BOX.x0 * T, -BOX.y0 * T);
  drawStaticShip(c);
  return (shipCache = cv);
}

// ---------------------------------------------------------------------------
// Dynamic parts: stations, turret, engines, crew
// ---------------------------------------------------------------------------
const DEFAULT_ART = {
  chart: (ctx, st, snap, t) => {                     // the table's screen glows
    const x = st.x * T, y = st.y * T;
    ctx.save(); ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 2);
    ctx.strokeStyle = '#5fd6e4'; ctx.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x - T * 1.1 + k * T * 0.7, y - T * 0.5); ctx.lineTo(x - T * 0.8 + k * T * 0.6, y + T * 0.5); ctx.stroke(); }
    ctx.restore();
    seat(ctx, st);
  },
  cupola: (ctx, st) => seat(ctx, st),
  rangeWheel: (ctx, st, snap) => {
    const x = st.x * T, y = st.y * T + 4;
    rr(ctx, x - T * 0.45, y - T * 0.25, T * 0.9, T * 0.4, 4); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(ctx, 2);
    const a = snap.turret.range / 6;
    ctx.beginPath(); ctx.arc(x, y + T * 0.15, T * 0.36, 0, TAU); stroke(ctx, 6, OUT); ctx.beginPath(); ctx.arc(x, y + T * 0.15, T * 0.36, 0, TAU); stroke(ctx, 3.5, '#b84a3a');
    for (let k = 0; k < 3; k++) { const b = a + k * TAU / 3; ctx.beginPath(); ctx.moveTo(x, y + T * 0.15); ctx.lineTo(x + Math.cos(b) * T * 0.36, y + T * 0.15 + Math.sin(b) * T * 0.36); stroke(ctx, 2.5, '#8a2f24'); }
    ctx.beginPath(); ctx.arc(x, y + T * 0.15, 4, 0, TAU); ctx.fillStyle = '#ccc'; ctx.fill(); stroke(ctx, 1.2);
  },
  breech: (ctx, st, snap) => {
    const x = (st.x - 0.3) * T, y = (st.y - 0.6) * T, w = T * 0.95, h = T * 1.3;
    rr(ctx, x, y, w, h, 6); ctx.fillStyle = '#6a7180'; ctx.fill(); stroke(ctx, 2.5);
    rr(ctx, x + 6, y + 8, w - 12, h - 16, 4); ctx.fillStyle = snap.breech === 'loaded' ? '#3a2f1c' : snap.breech === 'open' ? '#111' : '#3a3f4a'; ctx.fill(); stroke(ctx, 1.5);
    if (snap.breech === 'loaded') drawShell(ctx, x + w / 2, y + h / 2, Math.PI / 2, 0.8);
    const col = snap.breech === 'loaded' ? '#47e07a' : snap.breech === 'open' ? '#ffb347' : '#e2574c';
    ctx.beginPath(); ctx.arc(x + w - 6, y + 6, 4, 0, TAU); ctx.fillStyle = col; ctx.fill(); stroke(ctx, 1.2);
  },
  readyRack: (ctx, st, snap) => {
    const x = (st.x - 0.75) * T, y = (st.y - 0.05) * T, w = T * 1.5, h = T * 0.3;
    rr(ctx, x, y, w, h, 3); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(ctx, 2);
    for (let k = 0; k < 2; k++) {
      const cx = x + w * (0.27 + k * 0.46), cy = y - T * 0.05;
      if (k < snap.readyRack) drawShell(ctx, cx, cy, -Math.PI / 2, 0.75);
      else { ctx.beginPath(); ctx.arc(cx, cy + T * 0.12, T * 0.1, 0, TAU); ctx.fillStyle = '#23262c'; ctx.fill(); stroke(ctx, 1.2); }
    }
  },
  shellRacks: (ctx, st, snap) => {
    const x = (st.x - 3.4) * T, y = (st.y - 0.3) * T, w = T * 4.2, h = T * 0.55;
    rr(ctx, x, y, w, h, 3); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(ctx, 2);
    for (let k = 0; k < 10; k++) {
      const cx = x + T * 0.25 + k * (w - T * 0.5) / 9, cy = y + h / 2;
      if (k < snap.magazine) drawShell(ctx, cx, cy, Math.PI / 2, 0.62);
      else { ctx.beginPath(); ctx.arc(cx, cy, T * 0.08, 0, TAU); ctx.fillStyle = '#23262c'; ctx.fill(); }
    }
  },
};
function seat(ctx, st) {
  if (st.sx == null) return;
  ctx.save(); ctx.translate(st.sx * T, st.sy * T); ctx.rotate((st.face || 0) + Math.PI / 2);
  rr(ctx, -T * 0.3, -T * 0.05, T * 0.6, T * 0.45, 8); ctx.fillStyle = '#3d4350'; ctx.fill(); stroke(ctx, 2);
  rr(ctx, -T * 0.32, T * 0.32, T * 0.64, T * 0.16, 5); ctx.fillStyle = '#5a6170'; ctx.fill(); stroke(ctx, 1.8);
  ctx.restore();
}
function drawEnergyBank(ctx, snap, t) {             // the bank's cells on the reactor drum: one lit per energy
  const r = B.CLUTTER.find(c => c.kind === 'reactor'), cx = (r.x + r.w / 2) * T, cy = (r.y + r.h / 2) * T, R = Math.min(r.w, r.h) * T * 0.36;
  for (let k = 0; k < 12; k++) {
    const a = -Math.PI / 2 + k * TAU / 12, on = k < snap.energy;
    ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.72, cy + Math.sin(a) * R * 0.72, R * 0.16, 0, TAU);
    ctx.fillStyle = on ? `rgba(95,214,228,${0.75 + 0.25 * Math.sin(t * 3 + k)})` : '#1a1f27'; ctx.fill(); stroke(ctx, 1.2);
  }
  label(ctx, String(snap.energy), cx, cy, { size: 20, weight: 800, color: '#9cf0ff' });
}
function drawTurret(ctx, snap, t) {
  const tu = B.TURRET, x = tu.x * T, y = tu.y * T, r = tu.r * T, a = snap.turret.angle;
  ctx.beginPath(); ctx.arc(x, y, r * 1.12, 0, TAU); ctx.fillStyle = '#2b2f37'; ctx.fill(); stroke(ctx, 3);   // the ring
  ctx.save(); ctx.translate(x, y); ctx.rotate(a);
  // barrel
  const L = tu.barrel * T;
  rr(ctx, r * 0.3, -T * 0.16, L, T * 0.32, 4); ctx.fillStyle = '#5c6474'; ctx.fill(); stroke(ctx, 2.5);
  rr(ctx, r * 0.3 + L - T * 0.5, -T * 0.21, T * 0.5, T * 0.42, 4); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(ctx, 2);
  // turret body
  poly(ctx, [[-r * 0.85, -r * 0.7], [r * 0.55, -r * 0.8], [r * 0.95, -r * 0.3], [r * 0.95, r * 0.3], [r * 0.55, r * 0.8], [-r * 0.85, r * 0.7]]);
  const g = ctx.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#7a8394'); g.addColorStop(1, '#4a5263');
  ctx.fillStyle = g; ctx.fill(); stroke(ctx, 3);
  ctx.beginPath(); ctx.arc(-r * 0.25, -r * 0.3, r * 0.22, 0, TAU); ctx.fillStyle = '#1b2a33'; ctx.fill(); stroke(ctx, 1.5);   // the cupola's lens
  ctx.fillStyle = 'rgba(95,214,228,0.6)'; ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.35, r * 0.08, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawEngineFlames(ctx, t) {
  for (const e of B.ENGINES) {
    const x = e.x * T, y = (e.y + 1.5) * T, w = e.w * T * 0.42, f = 1 + 0.08 * Math.sin(t * 23 + e.x);
    const g = ctx.createLinearGradient(0, y, 0, y + T * 2.6 * f);
    g.addColorStop(0, 'rgba(255,240,200,0.95)'); g.addColorStop(0.35, 'rgba(255,170,90,0.7)'); g.addColorStop(1, 'rgba(255,90,40,0)');
    ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x, y + T * 3.2 * f, x + w, y); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
  }
}
function drawEncounterDefault(ctx, e) {
  ctx.beginPath(); ctx.arc(e.x * T, e.y * T, T * 1.2, 0, TAU); ctx.fillStyle = 'rgba(226,87,76,0.3)'; ctx.fill(); stroke(ctx, 2, '#e2574c');
  label(ctx, e.kind, e.x * T, e.y * T, { size: 16, color: '#ffb0a8' });
}
B.ENCOUNTER_DRAW.gunship = B.ENCOUNTER_DRAW.gunship || ((ctx, e) => {     // placeholders (the artillery replaces them)
  ctx.save(); ctx.translate(e.x * T, e.y * T); ctx.rotate(e.side === 'left' ? Math.PI / 2 : -Math.PI / 2);
  poly(ctx, [[0, -T * 1.6], [T * 1.1, T * 1.2], [0, T * 0.6], [-T * 1.1, T * 1.2]]); ctx.fillStyle = '#7a3b3b'; ctx.fill(); stroke(ctx, 3);
  ctx.restore();
});
B.ENCOUNTER_DRAW.asteroids = B.ENCOUNTER_DRAW.asteroids || ((ctx, e) => {
  ctx.beginPath(); ctx.arc(e.x * T, e.y * T, T * 1.4, 0, TAU); ctx.fillStyle = '#6e6359'; ctx.fill(); stroke(ctx, 3);
});

// ---------------------------------------------------------------------------
// Space: three layers of stars drifting past (the ship flies nose first, so they stream towards +y)
// ---------------------------------------------------------------------------
const STARS = [0.15, 0.35, 0.7].map((par, L) => { const rand = B.rng(11 + L); return { par, speed: 1 + L * 2, pts: Array.from({ length: 70 }, () => [rand(), rand(), 0.4 + rand() * 0.6]) }; });
function drawStars(ctx, cam, w, h, t) {
  const S = 1400;
  for (const L of STARS) {
    const ox = -cam.x * T * cam.zoom * L.par, oy = -cam.y * T * cam.zoom * L.par + t * T * L.speed * 0.6;
    ctx.fillStyle = `rgba(220,230,255,${0.35 + L.par * 0.6})`;
    for (const [sx, sy, b] of L.pts) {
      const x = ((sx * S + ox) % S + S) % S, y = ((sy * S + oy) % S + S) % S;
      for (let tx = x; tx < w; tx += S) for (let ty = y; ty < h; ty += S) ctx.fillRect(tx, ty, 1 + L.par * 2 * b, 1 + L.par * 2 * b + L.par * 4);
    }
  }
}

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------
// cam: { x, y, zoom } in layout units; view: { banners: [{ text, t }], hint, solo }
function drawFrame(ctx, snap, meId, w, h, t, cam, view) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#07090f'; ctx.fillRect(0, 0, w, h);
  const me = snap.crew.find(c => c.id === meId) || null;
  const st = me && me.station ? B.STATIONS[me.station] : null, sv = st ? B.STATION_VIEWS[st.kind] : null;
  if (sv) {
    ctx.save(); sv.draw(ctx, snap, me, w, h, t); ctx.restore();
  } else {
    drawStars(ctx, cam, w, h, t);
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x * T, -cam.y * T);
    for (const e of snap.enc) { ctx.save(); (B.ENCOUNTER_DRAW[e.kind] || drawEncounterDefault)(ctx, e, snap, t); ctx.restore(); }
    drawEngineFlames(ctx, t);
    ctx.drawImage(shipCanvas(), BOX.x0 * T, BOX.y0 * T, (BOX.x1 - BOX.x0) * T, (BOX.y1 - BOX.y0) * T);
    drawEnergyBank(ctx, snap, t);
    for (const id of B.STATION_ORDER) { const s = B.STATIONS[id]; const art = B.STATION_ART[s.kind] || DEFAULT_ART[s.kind]; if (art) { ctx.save(); art(ctx, s, snap, t); ctx.restore(); } }
    if (me && me.focus && !me.station) {             // the station you'd use: a soft ring
      const s = B.STATIONS[me.focus];
      ctx.beginPath(); ctx.arc(s.x * T, s.y * T, T * (0.7 + 0.05 * Math.sin(t * 5)), 0, TAU); stroke(ctx, 2.5, 'rgba(255,224,138,0.75)');
    }
    for (const c of snap.crew) {
      drawCrew(ctx, c.x * T, c.y * T, c.face, c.walk, c.color);
      if (c.carry === 'shell') drawShell(ctx, c.x * T + Math.cos(c.face) * T * 0.32, c.y * T + Math.sin(c.face) * T * 0.32, c.face + Math.PI / 2, 0.8);
    }
    drawTurret(ctx, snap, t);
    for (const c of snap.crew) {                      // names and progress bars on top of everything
      label(ctx, c.name, c.x * T, c.y * T - T * 0.6, { size: 12 / Math.max(0.6, cam.zoom) * 0.9, color: c.id === meId ? '#ffe08a' : '#e8ecf4', outline: true });
      if (c.action) {
        const bw = T * 0.9, bx = c.x * T - bw / 2, by = c.y * T + T * 0.45;
        rr(ctx, bx, by, bw, 7, 3); ctx.fillStyle = '#1a1d23'; ctx.fill(); stroke(ctx, 1.2);
        rr(ctx, bx + 1, by + 1, (bw - 2) * clamp(c.action[1], 0, 1), 5, 2); ctx.fillStyle = '#ffe08a'; ctx.fill();
      }
    }
    ctx.restore();
  }
  drawHud(ctx, snap, me, w, h, t, view, st, sv);
}

function bar(ctx, x, y, w, h, k, col) {
  rr(ctx, x, y, w, h, 4); ctx.fillStyle = '#1a1d23'; ctx.fill(); stroke(ctx, 1.5, '#000');
  if (k > 0) { rr(ctx, x + 2, y + 2, (w - 4) * clamp(k, 0, 1), h - 4, 3); ctx.fillStyle = col; ctx.fill(); }
}
function drawHud(ctx, snap, me, w, h, t, view, st, sv) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // top left: the ship's state
  rr(ctx, 12, 12, 250, 112, 8); ctx.fillStyle = 'rgba(10,12,18,0.72)'; ctx.fill();
  label(ctx, 'HULL', 24, 30, { align: 'left', size: 12, weight: 800, color: '#aab2c0' });
  bar(ctx, 76, 22, 172, 16, snap.hull / 100, snap.hull > 50 ? '#5fd6a0' : snap.hull > 25 ? '#e8c34f' : '#e2574c');
  label(ctx, String(Math.ceil(snap.hull)), 162, 30, { size: 11, weight: 800, color: '#0b0d12' });
  label(ctx, 'ENERGY', 24, 54, { align: 'left', size: 12, weight: 800, color: '#aab2c0' });
  for (let k = 0; k < 12; k++) { rr(ctx, 86 + k * 13.5, 47, 10, 14, 2); ctx.fillStyle = k < snap.energy ? '#5fd6e4' : '#23272f'; ctx.fill(); }
  label(ctx, 'SHELLS', 24, 78, { align: 'left', size: 12, weight: 800, color: '#aab2c0' });
  label(ctx, `magazine ${snap.magazine} · rack ${snap.readyRack}/2`, 86, 78, { align: 'left', size: 13 });
  label(ctx, 'BREECH', 24, 102, { align: 'left', size: 12, weight: 800, color: '#aab2c0' });
  const bc = snap.breech === 'loaded' ? '#47e07a' : snap.breech === 'open' ? '#ffb347' : '#e2574c';
  label(ctx, snap.breech.toUpperCase(), 86, 102, { align: 'left', size: 13, weight: 800, color: bc });
  // top right: who's aboard (and solo: whose body you are)
  let y = 24;
  for (const c of snap.crew) {
    const room = B.roomAt(c.x, c.y), where = c.station ? (B.STATIONS[c.station]?.label || c.station) : room ? room.name : '';
    label(ctx, `${c.name}${c.carry ? ' (shell)' : ''} · ${where}`, w - 16, y, { align: 'right', size: 12, color: c.id === (me && me.id) ? '#ffe08a' : c.color, bg: 'rgba(10,12,18,0.6)' });
    y += 22;
  }
  for (const fn of B.HUD_HOOKS) { ctx.save(); fn(ctx, snap, me, w, h, t); ctx.restore(); }
  // the prompt and the key hint
  if (me && me.prompt && !me.station) label(ctx, me.prompt, w / 2, h - 74, { size: 17, weight: 700, color: '#ffe08a', bg: 'rgba(10,12,18,0.75)' });
  let hint = 'WASD / arrows: move · E / Space: use';
  if (st) hint = sv ? (typeof sv.hint === 'function' ? sv.hint(snap, me) : sv.hint) || st.hint || 'E: leave' : `${st.label || st.id}: ${st.hint || 'E / Space: leave'}`;
  if (view && view.solo) hint += ' · Tab: switch body';
  label(ctx, hint, w / 2, h - 30, { size: 13, color: '#aab2c0', bg: 'rgba(10,12,18,0.6)' });
  // banners
  let by = 150;
  for (const b of (view && view.banners) || []) {
    ctx.save(); ctx.globalAlpha = clamp(b.left, 0, 1);
    label(ctx, b.text, w / 2, by, { size: 20, weight: 800, color: b.color || '#ffe08a', bg: 'rgba(10,12,18,0.75)' });
    ctx.restore(); by += 40;
  }
  if (snap.phase === 'end' && snap.summary) drawEndCard(ctx, snap.summary, w, h);
}
const statName = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
function drawEndCard(ctx, S, w, h) {
  ctx.fillStyle = 'rgba(4,5,9,0.55)'; ctx.fillRect(0, 0, w, h);
  const keys = Object.keys(S.stats || {}), cw = 420, ch = 190 + keys.length * 24, x = w / 2 - cw / 2, y = h / 2 - ch / 2;
  rr(ctx, x, y, cw, ch, 12); ctx.fillStyle = '#141820'; ctx.fill(); stroke(ctx, 3, S.won ? '#47e07a' : '#e2574c');
  label(ctx, S.won ? 'JUMP REACHED' : 'SHIP LOST', w / 2, y + 40, { size: 30, weight: 900, color: S.won ? '#47e07a' : '#e2574c' });
  label(ctx, S.reason, w / 2, y + 76, { size: 15, color: '#e8ecf4' });
  const m = Math.floor(S.time / 60), s = Math.floor(S.time % 60);
  label(ctx, `time ${m}:${String(s).padStart(2, '0')} · hull ${S.hull} · energy ${S.energy} · shells left ${S.magazine}`, w / 2, y + 106, { size: 13, color: '#aab2c0' });
  keys.forEach((k, i) => label(ctx, `${statName(k)}: ${S.stats[k]}`, w / 2, y + 138 + i * 24, { size: 14 }));
  label(ctx, 'R: back to the lobby', w / 2, y + ch - 26, { size: 14, weight: 700, color: '#ffe08a' });
}

// Which zoom shows the room you're in (units on screen): the room's box plus a margin, between 12 x 9 and 24 x 18.
function roomBox(x, y) {
  const room = B.roomAt(x, y);
  if (!room || room.id === 'spine') return { x, y, w: 14, h: 11 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of room.rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0 + 3, h: y1 - y0 + 3 };
}
function cameraTarget(x, y, w, h) {
  const b = roomBox(x, y), bw = clamp(b.w, 17, 28), bh = clamp(b.h, 12, 22);
  const zoom = clamp(Math.min(w / (bw * T), h / (bh * T)), 0.35, 2.2);
  // follow you, but lean towards the room's middle so it fits
  return { x: (x + b.x) / 2, y: (y + b.y) / 2, zoom };
}
const toScreen = (cam, w, h, x, y) => [(x - cam.x) * T * cam.zoom + w / 2, (y - cam.y) * T * cam.zoom + h / 2];

B.art = { T, OUT, C, stroke, poly, rr, shade, drawCrew, drawShell, label, bar, toScreen, makePlates };
B.render = { drawFrame, cameraTarget, shipCanvas };
})();
