// Prototype 3, browser only: the artillery's looks (sim-artillery.js is the mechanics).
//   BIG.STATION_VIEWS.cupola       the periscope / tactical scope: targets, the bearing line, the range mark
//   BIG.STATION_VIEWS.rangeWheel   only a dial with a number (no targets: the spotter has to call it)
//   BIG.STATION_ART.*              the cupola seat, range wheel, breech (steam, shell), ready rack, shell racks
//   BIG.ENCOUNTER_DRAW.gunship / .asteroids   in the main game's style (adapted from js/enemies.js, js/art.js)
//   effects from events (muzzle flash, the shell in flight, splashes, enemy bolts, hull hits, explosions), drawn in the
//   ship view (through a HUD hook with the camera) and in the scope.
// Debug (solo only): ?spawn=gunship-left,gunship-right,asteroids on the URL spawns them at the start; keys 7 / 8 / 9
// spawn a gunship left / right / an asteroid field, 0 ends the encounters.
(function () {
'use strict';
const B = globalThis.BIG;
const A = B.art, T = A.T, OUT = A.OUT, TAU = Math.PI * 2, { stroke, poly, rr, label } = A;
const ART = B.ARTILLERY, TU = B.TURRET;
const clamp = B.clamp;
const now = () => performance.now() / 1000;

// ---------------------------------------------------------------------------
// A view: where ship-local units go on the canvas (p) and how many px one unit is (k). The ship view draws in
// ship-local px (k = T); the scope maps units to its own screen px.
// ---------------------------------------------------------------------------
const SHIP_VIEW = { p: (x, y) => [x * T, y * T], k: T };
const lw = (V, w) => Math.max(0.8, w * Math.min(1.4, V.k / T * 2.2));

// ---------------------------------------------------------------------------
// The gunship (after js/enemies.js drawInterceptor): a stocky pirate hull, two engine pods, a turret aimed at us.
// ---------------------------------------------------------------------------
const GS_HULL = [[0, -2.4], [0.5, -1.8], [0.62, -0.7], [1.55, 0.05], [1.6, 1.25], [0.66, 1.5], [0.48, 2.1], [-0.48, 2.1], [-0.66, 1.5], [-1.6, 1.25], [-1.55, 0.05], [-0.62, -0.7], [-0.5, -1.8]];
function flameDown(ctx, L, x, y, len, w, t) {
  const f = 1 + 0.12 * Math.sin(t * 29 + x * 7);
  const g = ctx.createRadialGradient(L(x), L(y), 1, L(x), L(y), Math.max(2, L(len) * f));
  g.addColorStop(0, 'rgba(255,240,200,0.95)'); g.addColorStop(0.3, 'rgba(255,150,60,0.75)'); g.addColorStop(1, 'rgba(220,60,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(L(x), L(y + len * 0.45), L(w), L(len * 0.55) * f, 0, 0, TAU); ctx.fill();
}
function drawGunship(ctx, V, e, t, scale = 1) {
  const [px, py] = V.p(e.x, e.y), k = V.k * scale, L = (v) => v * k, s = clamp(k / T * 1.5, 0.45, 1);
  const toShip = Math.atan2(TU.y - e.y, TU.x - e.x);
  ctx.save(); ctx.translate(px, py);
  ctx.globalAlpha = clamp((e.age || 9) / 1.2, 0, 1);
  ctx.save(); ctx.rotate(e.side === 'left' ? Math.PI / 2 : -Math.PI / 2);   // nose towards the ship
  for (const x of [-1.15, 1.15]) flameDown(ctx, L, x, 1.75, 1.2, 0.22, t);
  flameDown(ctx, L, 0, 2.15, 0.8, 0.25, t);
  if (scale === 1) { ctx.beginPath(); ctx.ellipse(L(0.25), L(0.35), L(1.7), L(2.3), 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill(); }
  poly(ctx, GS_HULL.map(([x, y]) => [L(x), L(y)]));
  const g = ctx.createLinearGradient(L(-2), L(-2.4), L(2), L(2.1)); g.addColorStop(0, '#8a4a44'); g.addColorStop(1, '#3e2222');
  ctx.fillStyle = e.hitT > 0 ? '#e8b0a0' : g; ctx.fill(); stroke(ctx, 3 * s);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5 * s;
  for (const [ax, ay, bx, by] of [[0, -2.2, 0, 1.9], [-0.6, -0.6, 0.6, -0.6], [-0.62, 0.7, 0.62, 0.7], [0.62, -0.3, 1.5, 0.45], [-0.62, -0.3, -1.5, 0.45]]) { ctx.beginPath(); ctx.moveTo(L(ax), L(ay)); ctx.lineTo(L(bx), L(by)); ctx.stroke(); }
  for (const sx of [-1, 1]) {                       // red wing stripes, engine pods
    poly(ctx, [[L(sx * 0.78), L(-0.2)], [L(sx * 1.5), L(0.32)], [L(sx * 1.5), L(0.52)], [L(sx * 0.78), L(0)]]); ctx.fillStyle = '#c0392b'; ctx.fill();
    rr(ctx, L(sx > 0 ? 1.0 : -1.3), L(0.6), L(0.3), L(1.1), Math.max(1, L(0.12))); ctx.fillStyle = '#4a4f5a'; ctx.fill(); stroke(ctx, 1.8 * s);
  }
  ctx.beginPath(); ctx.ellipse(0, L(-1.35), L(0.36), L(0.62), 0, 0, TAU);              // canopy
  const cg = ctx.createLinearGradient(L(-0.4), L(-2), L(0.4), L(-0.7)); cg.addColorStop(0, '#6a7480'); cg.addColorStop(1, '#262c34');
  ctx.fillStyle = cg; ctx.fill(); stroke(ctx, 2.2 * s);
  ctx.beginPath(); ctx.ellipse(L(-0.1), L(-1.65), L(0.07), L(0.22), 0.3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(L(sx * 1.5), L(0.1), Math.max(1.5, L(0.07)), 0, TAU); ctx.fillStyle = sx > 0 ? '#5aff8a' : '#ff5a4a'; ctx.fill(); }
  ctx.restore();
  // the turret on its back, aimed at us
  ctx.save(); ctx.rotate(toShip);
  rr(ctx, 0, L(-0.11), L(1.3), L(0.22), Math.max(1, L(0.05))); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(ctx, 1.8 * s);
  if (e.flash > 0) {
    const r = L(0.4 + e.flash * 0.6), fg = ctx.createRadialGradient(L(1.4), 0, 0, L(1.4), 0, r);
    fg.addColorStop(0, `rgba(255,250,220,${e.flash})`); fg.addColorStop(0.4, `rgba(255,120,80,${e.flash * 0.8})`); fg.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(L(1.4), 0, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(0, 0, L(0.3), 0, TAU); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(ctx, 1.8 * s);
  ctx.beginPath(); ctx.arc(0, 0, L(0.13), 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill();
  if (e.hp < 2) {                                   // hit once: smoking, sparking
    for (let i = 0; i < 4; i++) {
      const q = (t * 0.7 + i / 4) % 1;
      ctx.beginPath(); ctx.arc(L(0.6) + Math.sin(t * 2 + i) * L(0.3), L(0.3) + q * L(2.2) * (e.side === 'left' ? 1 : 1), L(0.25 + q * 0.5), 0, TAU);
      ctx.fillStyle = `rgba(60,58,62,${0.55 * (1 - q)})`; ctx.fill();
    }
    if (Math.sin(t * 17) > 0.6) { ctx.beginPath(); ctx.arc(L(0.7), L(0.2), L(0.18), 0, TAU); ctx.fillStyle = '#ffd36a'; ctx.fill(); }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Rocks (js/art.js drawLump + js/enemies.js drawAsteroidBody, simplified)
// ---------------------------------------------------------------------------
const shapes = new Map();
function lumpShape(seed) {
  if (shapes.has(seed)) return shapes.get(seed);
  const r = B.rng(seed), pts = [], n = 11;
  for (let i = 0; i < n; i++) { const a = i / n * TAU + (r() - 0.5) * 0.35; pts.push([Math.cos(a), Math.sin(a), 0.7 + r() * 0.42]); }
  const craters = []; for (let i = 0; i < 3; i++) craters.push([(r() - 0.5) * 0.9, (r() - 0.5) * 0.9, 0.12 + r() * 0.14]);
  const cracks = []; for (let i = 0; i < 3; i++) cracks.push(r() * TAU);
  const s = { pts, craters, cracks, spin: (r() - 0.5) * 0.8 };
  shapes.set(seed, s);
  return s;
}
function drawRock(ctx, V, x, y, rad, seed, t, scale = 1) {
  const sh = lumpShape(seed), [px, py] = V.p(x, y), R = Math.max(4, rad * V.k * scale), s = clamp(V.k * scale / T * 1.5, 0.45, 1);
  ctx.save(); ctx.translate(px, py);
  if (scale === 1) { ctx.beginPath(); ctx.ellipse(6, 8, R * 0.95, R * 0.8, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill(); }
  ctx.rotate(seed % 7 + t * sh.spin);
  const pts = sh.pts.map(([cx, cy, m]) => [cx * R * m, cy * R * m]);
  poly(ctx, pts);
  const g = ctx.createRadialGradient(-R * 0.4, -R * 0.45, R * 0.1, 0, 0, R * 1.1);
  g.addColorStop(0, '#9a8e80'); g.addColorStop(0.55, '#776b5f'); g.addColorStop(1, '#544a40');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); poly(ctx, pts); ctx.clip();
  for (const [cx, cy, cr] of sh.craters) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(cx * R, cy * R, cr * R, cr * R * 0.85, 0, 0, TAU); ctx.fill(); }
  ctx.restore();
  const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.1); lg.addColorStop(0, `rgba(255,140,50,${0.3 + 0.1 * Math.sin(t * 2.4 + seed)})`); lg.addColorStop(1, 'rgba(255,140,50,0)');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(0, 0, R * 1.1, 0, TAU); ctx.fill();
  for (const a of sh.cracks) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R * 0.4 + 2, Math.sin(a) * R * 0.4); ctx.lineTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78);
    stroke(ctx, 4 * s, '#1a1614'); ctx.strokeStyle = '#ffb24a'; ctx.lineWidth = 2 * s; ctx.stroke();
  }
  poly(ctx, pts); stroke(ctx, 3 * s);
  ctx.restore();
}

B.ENCOUNTER_DRAW.gunship = (ctx, e, snap, t) => drawGunship(ctx, SHIP_VIEW, e, t);
B.ENCOUNTER_DRAW.asteroids = (ctx, e, snap, t) => { for (const [, x, y, r, seed] of e.rocks || []) drawRock(ctx, SHIP_VIEW, x, y, r, seed, t); };

// ---------------------------------------------------------------------------
// Effects from events: { kind, t0, dur, ... } in ship-local units, drawn into any view.
// ---------------------------------------------------------------------------
let FX = [];
const addFx = (f) => { FX.push(Object.assign({ t0: now() }, f)); if (FX.length > 80) FX.shift(); };
B.EVENT_HOOKS.push((ev) => {
  switch (ev.type) {
    case 'gunFire': addFx({ kind: 'muzzle', a: ev.a, x: ev.x0, y: ev.y0, dur: 0.5 }); addFx({ kind: 'shell', ...ev, dur: ev.dur }); break;
    case 'splash': addFx({ kind: 'splash', x: ev.x, y: ev.y, hit: ev.hit, dur: 1.4 }); break;
    case 'enemyShot': addFx({ kind: 'bolt', ...ev }); break;
    case 'hullHit': addFx({ kind: 'hullHit', x: ev.x, y: ev.y, n: ev.n, dur: 1.2 }); break;
    case 'gunshipHit': addFx({ kind: 'sparks', x: ev.x, y: ev.y, dur: 0.9 }); break;
    case 'gunshipDown': addFx({ kind: 'explosion', x: ev.x, y: ev.y, dur: 2.2, seed: ev.id * 17 }); break;
    case 'gunshipLeaves': addFx({ kind: 'leaving', x: ev.x, y: ev.y, side: ev.side, hp: ev.hp, dur: 3 }); break;
    case 'rockSmash': addFx({ kind: 'rubble', x: ev.x, y: ev.y, r: ev.r, seed: ev.seed, dur: 1.6 }); break;
    case 'rockImpact': addFx({ kind: 'rubble', x: ev.x, y: ev.y, r: ev.r, seed: ev.seed, dur: 1.2, small: true }); break;
    case 'caseEject': addFx({ kind: 'case', x: ev.x, y: ev.y, dur: 3 }); break;
  }
});
function glow(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, r));
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, Math.max(1, r), 0, TAU); ctx.fill();
}
function drawFx(ctx, V, t, scope = false) {
  const tn = now();
  FX = FX.filter(f => tn - f.t0 < f.dur + 0.05);
  for (const f of FX) {
    const q = clamp((tn - f.t0) / f.dur, 0, 1), k = V.k, s = lw(V, 1);
    ctx.save();
    switch (f.kind) {
      case 'muzzle': {
        const [x, y] = V.p(f.x, f.y), r = k * (0.6 + 1.6 * (1 - q)) * (scope ? 2.5 : 1);
        if (q < 0.35) glow(ctx, x, y, r, [[0, 'rgba(255,252,230,1)'], [0.35, 'rgba(255,190,90,0.85)'], [1, 'rgba(255,90,30,0)']]);
        for (let i = 0; i < 4; i++) {                // smoke puffs drifting off the muzzle
          const d = k * (0.4 + q * 1.8) * (1 + i * 0.3), a = f.a + (i - 1.5) * 0.35;
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, k * (0.25 + q * 0.6) * (scope ? 1.5 : 1), 0, TAU);
          ctx.fillStyle = `rgba(150,150,158,${0.45 * (1 - q)})`; ctx.fill();
        }
        break;
      }
      case 'shell': {                               // a brass dot flying out; bigger mid-flight (the arc)
        const ux = f.x0 + (f.x1 - f.x0) * q, uy = f.y0 + (f.y1 - f.y0) * q, [x, y] = V.p(ux, uy);
        const lift = Math.sin(q * Math.PI), r = Math.max(2.5, k * (0.16 + lift * 0.14)) * (scope ? 1.5 : 1);
        const [tx, ty] = V.p(f.x0 + (f.x1 - f.x0) * Math.max(0, q - 0.08), f.y0 + (f.y1 - f.y0) * Math.max(0, q - 0.08));
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.strokeStyle = 'rgba(255,220,150,0.5)'; ctx.lineWidth = r; ctx.lineCap = 'round'; ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = '#ffd88a'; ctx.fill(); stroke(ctx, 1.2 * s);
        if (scope) { const [lx, ly] = V.p(f.x1, f.y1); ctx.beginPath(); ctx.arc(lx, ly, ART.HIT_R * k, 0, TAU); ctx.setLineDash([3, 4]); stroke(ctx, 1.2, 'rgba(255,216,138,0.6)'); ctx.setLineDash([]); }
        break;
      }
      case 'splash': {                              // the shell bursts where it landed
        const [x, y] = V.p(f.x, f.y), R = ART.HIT_R * k;
        if (q < 0.25) glow(ctx, x, y, R * (0.5 + q * 3), [[0, 'rgba(255,250,220,0.95)'], [0.4, 'rgba(255,160,70,0.7)'], [1, 'rgba(255,80,30,0)']]);
        ctx.beginPath(); ctx.arc(x, y, R * (0.3 + q * 1.1), 0, TAU); ctx.strokeStyle = f.hit ? `rgba(255,200,90,${1 - q})` : `rgba(200,220,255,${0.8 * (1 - q)})`; ctx.lineWidth = Math.max(1.5, k * 0.12); ctx.stroke();
        const r = B.rng(Math.round(f.x * 13 + f.y * 7));
        for (let i = 0; i < 10; i++) {
          const a = r() * TAU, d = R * (0.2 + q * (0.6 + r() * 0.8));
          ctx.fillStyle = `rgba(255,${180 + r() * 60 | 0},120,${1 - q})`; ctx.fillRect(x + Math.cos(a) * d - 1.5, y + Math.sin(a) * d - 1.5, 3, 3);
        }
        if (scope) label(ctx, f.hit ? 'HIT' : 'splash', x, y - R - 10, { size: 12, weight: 800, color: f.hit ? '#ffd36a' : '#9cc4ff' });
        break;
      }
      case 'bolt': {                                // the gunship's shot: a hot red slug with a tail
        const ux = f.x0 + (f.x1 - f.x0) * q, uy = f.y0 + (f.y1 - f.y0) * q, [x, y] = V.p(ux, uy);
        const back = V.p(ux - (f.x1 - f.x0) * 0.06, uy - (f.y1 - f.y0) * 0.06);
        ctx.beginPath(); ctx.moveTo(back[0], back[1]); ctx.lineTo(x, y); ctx.strokeStyle = 'rgba(255,90,60,0.6)'; ctx.lineWidth = Math.max(3, k * 0.28) * (scope ? 1.4 : 1); ctx.lineCap = 'round'; ctx.stroke();
        glow(ctx, x, y, Math.max(5, k * 0.5) * (scope ? 1.4 : 1), [[0, 'rgba(255,240,220,1)'], [0.35, 'rgba(255,100,70,0.9)'], [1, 'rgba(255,40,30,0)']]);
        break;
      }
      case 'hullHit': {                             // sparks and smoke where it struck the hull
        const [x, y] = V.p(f.x, f.y), R = k * (0.8 + f.n / 8);
        if (q < 0.3) glow(ctx, x, y, R * (1 + q * 2), [[0, 'rgba(255,250,220,0.95)'], [0.4, 'rgba(255,130,60,0.8)'], [1, 'rgba(255,60,30,0)']]);
        const r = B.rng(Math.round(f.x * 31 + f.y * 17));
        for (let i = 0; i < 12; i++) {
          const a = r() * TAU, d = R * (0.3 + q * (1 + r()));
          ctx.fillStyle = `rgba(255,${200 + r() * 55 | 0},120,${1 - q})`; ctx.fillRect(x + Math.cos(a) * d - 1.5, y + Math.sin(a) * d - 1.5, 3, 3);
        }
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + (i - 1) * k * 0.4, y - q * k * 1.2, k * (0.3 + q * 0.5), 0, TAU); ctx.fillStyle = `rgba(55,55,60,${0.5 * (1 - q)})`; ctx.fill(); }
        break;
      }
      case 'sparks': {
        const [x, y] = V.p(f.x, f.y), r = B.rng(Math.round(f.x * 11 + f.y * 3));
        glow(ctx, x, y, k * 1.5 * (1 - q) * (scope ? 2 : 1), [[0, 'rgba(255,240,200,0.9)'], [1, 'rgba(255,120,40,0)']]);
        for (let i = 0; i < 14; i++) { const a = r() * TAU, d = k * (0.5 + q * 2.5 * r()) * (scope ? 2 : 1); ctx.fillStyle = `rgba(255,220,120,${1 - q})`; ctx.fillRect(x + Math.cos(a) * d - 1.5, y + Math.sin(a) * d - 1.5, 3, 3); }
        break;
      }
      case 'explosion': {                           // a fireball, hull pieces tumbling away, smoke
        const [x, y] = V.p(f.x, f.y), m = scope ? 1.8 : 1, R = k * 3.2 * m, r = B.rng(f.seed || 5);
        if (q < 0.45) glow(ctx, x, y, R * (0.4 + q * 1.6), [[0, 'rgba(255,255,235,1)'], [0.3, 'rgba(255,200,90,0.95)'], [0.65, 'rgba(230,80,30,0.7)'], [1, 'rgba(120,30,20,0)']]);
        for (let i = 0; i < 7; i++) {
          const a = r() * TAU, d = R * (0.2 + q * (0.8 + r())), sz = k * (0.25 + r() * 0.35) * m;
          ctx.save(); ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.rotate(q * 6 * (r() - 0.5) + a);
          ctx.globalAlpha = 1 - q; ctx.fillStyle = r() < 0.5 ? '#6a3a36' : '#4a4f5a'; ctx.fillRect(-sz, -sz * 0.6, sz * 2, sz * 1.2); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(-sz, -sz * 0.6, sz * 2, sz * 1.2);
          ctx.restore();
        }
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.4; ctx.beginPath(); ctx.arc(x + Math.cos(a) * R * q * 0.7, y + Math.sin(a) * R * q * 0.7, R * (0.15 + q * 0.3), 0, TAU); ctx.fillStyle = `rgba(50,48,52,${0.5 * (1 - q)})`; ctx.fill(); }
        if (scope) label(ctx, 'DESTROYED', x, y - R - 6, { size: 14, weight: 900, color: '#ffd36a' });
        break;
      }
      case 'leaving': {                             // a gunship left alive falls behind the ship
        const e = { x: f.x + (f.side === 'left' ? -1 : 1) * q * 4, y: f.y + q * q * 40, side: f.side, hp: f.hp, age: 9, hitT: 0, flash: 0 };
        ctx.globalAlpha = 1 - q; drawGunship(ctx, V, e, t, scope ? 3 : 1);
        break;
      }
      case 'rubble': {
        const [x, y] = V.p(f.x, f.y), r = B.rng(f.seed || 3), R = (f.r || 1) * k * (scope ? 1.6 : 1);
        if (q < 0.3) glow(ctx, x, y, R * 1.6, [[0, 'rgba(255,220,160,0.8)'], [1, 'rgba(255,120,40,0)']]);
        for (let i = 0; i < 8; i++) {
          const a = r() * TAU, d = R * (0.3 + q * (f.small ? 1.2 : 2.4) * (0.5 + r())), sz = R * (0.15 + r() * 0.2);
          ctx.save(); ctx.translate(x + Math.cos(a) * d, y + Math.sin(a) * d); ctx.rotate(q * 4 + i);
          ctx.globalAlpha = 1 - q; poly(ctx, [[-sz, -sz * 0.7], [sz * 0.8, -sz], [sz, sz * 0.6], [-sz * 0.5, sz]]); ctx.fillStyle = '#776b5f'; ctx.fill(); stroke(ctx, 1.5);
          ctx.restore();
        }
        break;
      }
      case 'case': {                                // the spent case drops out of the breech and rolls away
        if (scope) break;
        const [x, y] = V.p(f.x + 0.4 + q * 0.9, f.y + 0.9 + Math.sin(q * 3) * 0.15);
        ctx.globalAlpha = q > 0.8 ? (1 - q) * 5 : 1;
        ctx.save(); ctx.translate(x, y); ctx.rotate(q * 5);
        rr(ctx, -T * 0.18, -T * 0.08, T * 0.36, T * 0.16, 3); ctx.fillStyle = '#c69a45'; ctx.fill(); stroke(ctx, 1.5);
        ctx.restore();
        if (q < 0.5) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + i * 4, y - q * T, T * (0.1 + q * 0.3), 0, TAU); ctx.fillStyle = `rgba(220,225,235,${0.4 * (1 - q * 2)})`; ctx.fill(); }
        break;
      }
    }
    ctx.restore();
  }
}
// The ship view: effects over the ship (the core has no world layer after the turret, so a HUD hook with the camera).
B.HUD_HOOKS.unshift((ctx, snap, me, w, h, t) => {
  if (me && me.station && B.STATION_VIEWS[B.STATIONS[me.station]?.kind]) return;
  const cam = B.client && B.client.cam;
  if (!cam || !FX.length) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.translate(w / 2, h / 2); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x * T, -cam.y * T);
  drawFx(ctx, SHIP_VIEW, t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
});

// ---------------------------------------------------------------------------
// Station art on the ship plan
// ---------------------------------------------------------------------------
function seat(ctx, st, occupied) {
  ctx.save(); ctx.translate(st.sx * T, st.sy * T); ctx.rotate((st.face || 0) + Math.PI / 2);
  rr(ctx, -T * 0.3, -T * 0.05, T * 0.6, T * 0.45, 8); ctx.fillStyle = occupied ? '#4a3d40' : '#3d4350'; ctx.fill(); stroke(ctx, 2);
  rr(ctx, -T * 0.32, T * 0.32, T * 0.64, T * 0.16, 5); ctx.fillStyle = '#5a6170'; ctx.fill(); stroke(ctx, 1.8);
  ctx.restore();
}
B.STATION_ART.cupola = (ctx, st, snap, t) => {
  const on = snap.crew.some(c => c.station === st.id);
  seat(ctx, st, on);
  // the periscope's eyepiece on its column, two handles for the traverse
  const x = (st.x + 0.15) * T, y = st.y * T;
  ctx.save(); ctx.translate(x, y); ctx.rotate(snap.turret.angle);
  for (const s of [-1, 1]) { rr(ctx, -T * 0.08, s * T * 0.22 - T * 0.06, T * 0.34, T * 0.12, 3); ctx.fillStyle = '#2b2f37'; ctx.fill(); stroke(ctx, 1.5); }
  ctx.restore();
  ctx.beginPath(); ctx.arc(x, y, T * 0.24, 0, TAU); ctx.fillStyle = '#545b68'; ctx.fill(); stroke(ctx, 2);
  ctx.beginPath(); ctx.arc(x, y, T * 0.13, 0, TAU); ctx.fillStyle = on ? `rgba(95,214,228,${0.7 + 0.3 * Math.sin(t * 4)})` : '#1b2a33'; ctx.fill(); stroke(ctx, 1.5);
  // the firing lamp: green when loaded
  const col = snap.breech === 'loaded' ? '#47e07a' : '#5a2a26';
  ctx.beginPath(); ctx.arc((st.x + 0.15) * T, (st.y - 0.75) * T, 5, 0, TAU); ctx.fillStyle = col; ctx.fill(); stroke(ctx, 1.2);
};
B.STATION_ART.rangeWheel = (ctx, st, snap) => {
  const x = st.x * T, y = st.y * T + 4, on = snap.crew.some(c => c.station === st.id);
  seat(ctx, st, on);
  rr(ctx, x - T * 0.55, y - T * 0.32, T * 1.1, T * 0.42, 4); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(ctx, 2);
  // the little dial on the stand
  rr(ctx, x + T * 0.12, y - T * 0.27, T * 0.38, T * 0.24, 3); ctx.fillStyle = '#e8e0c8'; ctx.fill(); stroke(ctx, 1.2);
  label(ctx, String(Math.round(snap.turret.range)), x + T * 0.31, y - T * 0.15, { size: 10, weight: 800, color: '#2a1d10' });
  const a = snap.turret.range / 4, cy = y + T * 0.12, R = T * 0.34;
  ctx.beginPath(); ctx.arc(x - T * 0.12, cy, R, 0, TAU); stroke(ctx, 6.5, OUT);
  ctx.beginPath(); ctx.arc(x - T * 0.12, cy, R, 0, TAU); stroke(ctx, 4, '#b84a3a');
  for (let k = 0; k < 4; k++) { const b = a + k * TAU / 4; ctx.beginPath(); ctx.moveTo(x - T * 0.12, cy); ctx.lineTo(x - T * 0.12 + Math.cos(b) * R, cy + Math.sin(b) * R); stroke(ctx, 2.5, '#8a2f24'); }
  const hb = a;                                       // the handle knob on the rim
  ctx.beginPath(); ctx.arc(x - T * 0.12 + Math.cos(hb) * R, cy + Math.sin(hb) * R, 4, 0, TAU); ctx.fillStyle = '#d8a84a'; ctx.fill(); stroke(ctx, 1.2);
  ctx.beginPath(); ctx.arc(x - T * 0.12, cy, 4, 0, TAU); ctx.fillStyle = '#ccc'; ctx.fill(); stroke(ctx, 1.2);
};
B.STATION_ART.breech = (ctx, st, snap, t) => {
  const x = (st.x - 0.3) * T, y = (st.y - 0.65) * T, w = T * 0.95, h = T * 1.4, br = snap.breech;
  // the gun's breech block: a heavy steel body with the chamber; its door swings open to the right
  rr(ctx, x, y, w, h, 6);
  const g = ctx.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#7a8292'); g.addColorStop(1, '#4e5564');
  ctx.fillStyle = g; ctx.fill(); stroke(ctx, 2.5);
  for (const [rx, ry] of [[5, 5], [w - 8, 5], [5, h - 8], [w - 8, h - 8]]) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + rx, y + ry, 3, 3); }
  const cx = x + w * 0.5, cy = y + h * 0.5;
  ctx.beginPath(); ctx.arc(cx, cy, T * 0.27, 0, TAU); ctx.fillStyle = br === 'open' ? '#0b0c0f' : '#2b2f37'; ctx.fill(); stroke(ctx, 2);
  if (br === 'loaded') {                                // the shell's base in the chamber, behind the closed door
    ctx.beginPath(); ctx.arc(cx, cy, T * 0.2, 0, TAU); ctx.fillStyle = '#c69a45'; ctx.fill(); stroke(ctx, 1.5);
    ctx.beginPath(); ctx.arc(cx, cy, T * 0.07, 0, TAU); ctx.fillStyle = '#8a6a2c'; ctx.fill();
  }
  // the door: closed over the chamber, or swung out
  const opening = snap.crew.find(c => c.action && c.action[0] === 'Opening');
  const swing = br === 'open' ? 1 : opening ? opening.action[1] : 0;
  ctx.save(); ctx.translate(x + w, cy - T * 0.3); ctx.rotate(swing * 1.5);
  rr(ctx, -w * 0.82 * (1 - swing * 0.15), 0, w * 0.82, T * 0.6, 5);
  ctx.fillStyle = br === 'loaded' ? 'rgba(90,98,112,0.85)' : '#5a6272'; ctx.fill(); stroke(ctx, 2);
  rr(ctx, -w * 0.5, T * 0.22, w * 0.4, T * 0.16, 3); ctx.fillStyle = '#2b2f37'; ctx.fill(); stroke(ctx, 1.2);    // handle
  ctx.restore();
  // ramming: the shell slides in
  const ram = snap.crew.find(c => c.action && c.action[0] === 'Ramming');
  if (ram) A.drawShell(ctx, cx + T * (0.7 - ram.action[1] * 0.6), cy, Math.PI, 0.85);
  // status lamp + word
  const col = br === 'loaded' ? '#47e07a' : br === 'open' ? '#ffb347' : '#e2574c';
  ctx.beginPath(); ctx.arc(x + w - 7, y + 7, 4.5, 0, TAU); ctx.fillStyle = col; ctx.fill(); stroke(ctx, 1.2);
  label(ctx, br === 'loaded' ? 'LOADED' : br === 'open' ? 'OPEN' : 'EMPTY', cx + T * 0.15, y + h + 9, { size: 10, weight: 900, color: col, outline: true });
  // steam after a shot
  const steam = snap.art ? snap.art.steam : 0;
  if (steam > 0) for (let i = 0; i < 6; i++) {
    const q = ((t * 1.3 + i / 6) % 1), k = steam / ART.STEAM_TIME;
    ctx.beginPath(); ctx.arc(cx + Math.sin(i * 2.3 + t) * T * 0.3 + q * T * 0.6, cy - q * T * 0.9, T * (0.12 + q * 0.35), 0, TAU);
    ctx.fillStyle = `rgba(225,230,238,${0.55 * k * (1 - q)})`; ctx.fill();
  }
};
B.STATION_ART.readyRack = (ctx, st, snap) => {
  const x = (st.x - 0.8) * T, y = (st.y - 0.2) * T, w = T * 1.6, h = T * 0.42;
  rr(ctx, x, y, w, h, 3); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(ctx, 2);
  ctx.fillStyle = '#d2a62e'; for (let k = 0; k < 6; k++) ctx.fillRect(x + 4 + k * (w - 8) / 6, y + h - 5, (w - 8) / 12, 3);   // hazard lip
  for (let k = 0; k < ART.RACK_SLOTS; k++) {
    const cx = x + w * (0.28 + k * 0.44), cy = y + h * 0.42;
    rr(ctx, cx - T * 0.38, cy - T * 0.13, T * 0.76, T * 0.26, 6); ctx.fillStyle = '#23262c'; ctx.fill(); stroke(ctx, 1.2);
    if (k < snap.readyRack) A.drawShell(ctx, cx, cy, 0, 0.95);
  }
};
B.STATION_ART.shellRacks = (ctx, st, snap) => {
  const n = 10, x = (st.x - 3.4) * T, y = (st.y - 0.3) * T, w = T * 4.2, h = T * 0.6;
  rr(ctx, x, y, w, h, 3); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(ctx, 2);
  for (let k = 0; k < n; k++) {
    const cx = x + T * 0.25 + k * (w - T * 0.5) / (n - 1), cy = y + h / 2;
    ctx.beginPath(); ctx.arc(cx, cy, T * 0.12, 0, TAU); ctx.fillStyle = '#23262c'; ctx.fill(); stroke(ctx, 1);
    if (k < Math.min(n, snap.magazine)) A.drawShell(ctx, cx, cy, Math.PI / 2, 0.66);
  }
  label(ctx, `${snap.magazine} SHELLS`, x + w / 2, y + h + 10, { size: 11, weight: 900, color: snap.magazine ? '#d8e0b0' : '#e2574c', outline: true });
};

// ---------------------------------------------------------------------------
// The cupola: a periscope scope centred on the turret
// ---------------------------------------------------------------------------
const SCOPE_RANGE = 66;                    // units from the turret to the scope's rim
const bearingDeg = (a) => Math.round(((a + Math.PI / 2) * 180 / Math.PI % 360 + 360) % 360);
const HULL_PATH = B.HULL;
function drawScope(ctx, snap, me, w, h, t) {
  const cx = w / 2, cy = h / 2 + 10, R = Math.min(w * 0.42, h * 0.44), k = R / SCOPE_RANGE;
  const V = { p: (x, y) => [cx + (x - TU.x) * k, cy + (y - TU.y) * k], k };
  // the housing
  ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, w, h);
  ctx.beginPath(); ctx.arc(cx, cy, R + 26, 0, TAU); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(ctx, 4);
  ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, TAU); ctx.fillStyle = '#23262c'; ctx.fill(); stroke(ctx, 3);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (R + 19), cy + Math.sin(a) * (R + 19), 3, 0, TAU); ctx.fillStyle = '#6a7180'; ctx.fill(); }
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.clip();
  const bg = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R); bg.addColorStop(0, '#0f2a2e'); bg.addColorStop(1, '#061214');
  ctx.fillStyle = bg; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  // stars streaming past (the ship flies nose first)
  const sr = B.rng(5);
  ctx.fillStyle = 'rgba(200,240,240,0.5)';
  for (let i = 0; i < 90; i++) { const sx = cx - R + sr() * R * 2, sy = cy - R + ((sr() * R * 2 + t * (8 + sr() * 20)) % (R * 2)); ctx.fillRect(sx, sy, 1.5, 1.5 + sr() * 2); }
  // range rings 10..60 and the bearing ticks
  ctx.font = '700 11px system-ui, sans-serif';
  for (let r = 10; r <= 60; r += 10) {
    ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, TAU); ctx.strokeStyle = r === 60 ? 'rgba(95,214,228,0.45)' : 'rgba(95,214,228,0.18)'; ctx.lineWidth = r === 60 ? 2 : 1; ctx.stroke();
    const la = -Math.PI / 2 + 0.26;                   // the ring's number, a little right of AHEAD
    label(ctx, String(r), cx + Math.cos(la) * r * k, cy + Math.sin(la) * r * k, { size: 10, weight: 700, color: 'rgba(95,214,228,0.7)', bg: 'rgba(6,18,20,0.8)' });
  }
  for (let d = 0; d < 360; d += 10) {
    const a = d * Math.PI / 180 - Math.PI / 2, l = d % 30 ? 8 : 16;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.lineTo(cx + Math.cos(a) * (R - l), cy + Math.sin(a) * (R - l)); ctx.strokeStyle = 'rgba(95,214,228,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (d % 30 === 0) label(ctx, d === 0 ? 'AHEAD' : d === 180 ? 'ASTERN' : String(d), cx + Math.cos(a) * (R - 30), cy + Math.sin(a) * (R - 30), { size: 11, weight: 800, color: 'rgba(95,214,228,0.8)' });
  }
  // our ship's silhouette
  poly(ctx, HULL_PATH.map(([x, y]) => V.p(x, y))); ctx.fillStyle = '#1d3a40'; ctx.fill(); stroke(ctx, 2, '#5fd6e4');
  // targets
  for (const e of snap.enc) {
    if (e.kind === 'gunship') {
      const [x, y] = V.p(e.x, e.y), b = 3.2 * k * 2.6;
      glow(ctx, x, y, b * 1.2, [[0, 'rgba(255,90,60,0.35)'], [1, 'rgba(255,90,60,0)']]);
      drawGunship(ctx, V, e, t, 3.0);
      ctx.strokeStyle = '#ff6a5a'; ctx.lineWidth = 2;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.beginPath(); ctx.moveTo(x + sx * b, y + sy * b * 0.6); ctx.lineTo(x + sx * b, y + sy * b); ctx.lineTo(x + sx * b * 0.6, y + sy * b); ctx.stroke(); }
      const d = Math.hypot(e.x - TU.x, e.y - TU.y);
      label(ctx, `GUNSHIP · ${'■'.repeat(e.hp)}${'□'.repeat(Math.max(0, 2 - e.hp))} · ${Math.round(d)}`, x, y + b + 12, { size: 11, weight: 800, color: '#ff9a8a' });
    } else if (e.kind === 'asteroids') {
      for (const [, x, y, r, seed] of e.rocks || []) {
        drawRock(ctx, V, x, y, r, seed, t, 2.2);
        const [px, py] = V.p(x, y);
        ctx.beginPath(); ctx.arc(px, py, Math.max(8, r * k * 2.2 + 5), 0, TAU); ctx.setLineDash([4, 4]); stroke(ctx, 1.2, 'rgba(232,200,150,0.7)'); ctx.setLineDash([]);
      }
    } else {
      const [x, y] = V.p(e.x, e.y); ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); stroke(ctx, 2, '#e2574c');
    }
  }
  // the bearing line and the range mark (where a shell fired now would land: the hit circle)
  const a = snap.turret.angle, rng = snap.turret.range, [tx, ty] = V.p(TU.x, TU.y);
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(a) * 64 * k, ty + Math.sin(a) * 64 * k);
  ctx.setLineDash([10, 6]); ctx.strokeStyle = 'rgba(255,179,71,0.75)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  for (let r = 10; r <= 60; r += 10) { const px = tx + Math.cos(a) * r * k, py = ty + Math.sin(a) * r * k; ctx.beginPath(); ctx.moveTo(px - Math.sin(a) * 5, py + Math.cos(a) * 5); ctx.lineTo(px + Math.sin(a) * 5, py - Math.cos(a) * 5); ctx.strokeStyle = 'rgba(255,179,71,0.8)'; ctx.lineWidth = 2; ctx.stroke(); }
  const mx = tx + Math.cos(a) * rng * k, my = ty + Math.sin(a) * rng * k, mr = ART.HIT_R * k;
  ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fillStyle = 'rgba(255,179,71,0.12)'; ctx.fill(); stroke(ctx, 2.5, '#ffb347');
  ctx.beginPath(); ctx.moveTo(mx - mr - 6, my); ctx.lineTo(mx - mr * 0.4, my); ctx.moveTo(mx + mr * 0.4, my); ctx.lineTo(mx + mr + 6, my);
  ctx.moveTo(mx, my - mr - 6); ctx.lineTo(mx, my - mr * 0.4); ctx.moveTo(mx, my + mr * 0.4); ctx.lineTo(mx, my + mr + 6); stroke(ctx, 2, '#ffb347');
  // the turret with its barrel
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(a);
  rr(ctx, 0, -3, ART.MUZZLE * k, 6, 2); ctx.fillStyle = '#9aa1ad'; ctx.fill(); stroke(ctx, 1.5);
  ctx.restore();
  ctx.beginPath(); ctx.arc(tx, ty, Math.max(5, TU.r * k), 0, TAU); ctx.fillStyle = '#5c6474'; ctx.fill(); stroke(ctx, 2);
  drawFx(ctx, V, t, true);
  // the glass: scanlines, a vignette, a reflection
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let y = cy - R; y < cy + R; y += 3) ctx.fillRect(cx - R, y, R * 2, 1);
  const vg = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.beginPath(); ctx.ellipse(cx - R * 0.35, cy - R * 0.45, R * 0.35, R * 0.12, -0.6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
  ctx.restore();
  // the readout beside the scope (left, below the core HUD)
  const px = 16, py = 140, ready = snap.breech === 'loaded' && snap.energy >= ART.SHOT_COST;
  rr(ctx, px, py, 196, 176, 8); ctx.fillStyle = 'rgba(10,12,18,0.8)'; ctx.fill(); stroke(ctx, 2, '#2b3a40');
  label(ctx, 'FIRE CONTROL', px + 12, py + 18, { align: 'left', size: 12, weight: 900, color: '#5fd6e4' });
  label(ctx, `BEARING ${String(bearingDeg(a)).padStart(3, '0')}°`, px + 12, py + 44, { align: 'left', size: 15, weight: 800, color: '#ffb347' });
  const bc = snap.breech === 'loaded' ? '#47e07a' : snap.breech === 'open' ? '#ffb347' : '#e2574c';
  label(ctx, 'BREECH', px + 12, py + 72, { align: 'left', size: 12, weight: 800, color: '#aab2c0' });
  label(ctx, snap.breech.toUpperCase(), px + 80, py + 72, { align: 'left', size: 15, weight: 900, color: bc });
  label(ctx, 'ENERGY', px + 12, py + 98, { align: 'left', size: 12, weight: 800, color: '#aab2c0' });
  label(ctx, String(snap.energy), px + 80, py + 98, { align: 'left', size: 15, weight: 900, color: snap.energy ? '#9cf0ff' : '#e2574c' });
  const flying = snap.art ? snap.art.shells.length : 0;
  label(ctx, flying ? `shell in the air (${flying})` : 'no shell in the air', px + 12, py + 124, { align: 'left', size: 12, color: flying ? '#ffd88a' : '#6a7280' });
  if (ready) { if (Math.sin(t * 6) > -0.3) label(ctx, 'READY · SPACE: FIRE', px + 98, py + 154, { size: 14, weight: 900, color: '#0b0d12', bg: '#47e07a' }); }
  else label(ctx, snap.breech !== 'loaded' ? 'waiting for the loader' : 'NO ENERGY', px + 98, py + 154, { size: 12, weight: 800, color: '#e2574c' });
}
B.STATION_VIEWS.cupola = { draw: drawScope, hint: 'A / D: traverse · Space: fire · E: leave · call the range to the gun room!' };

// ---------------------------------------------------------------------------
// The range wheel: a dial with a number, nothing else
// ---------------------------------------------------------------------------
function drawRangeDial(ctx, snap, me, w, h, t) {
  const cx = w / 2, cy = h * 0.47, R = Math.min(w * 0.3, h * 0.3), rng = snap.turret.range;
  const bg = ctx.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#2a2f38'); bg.addColorStop(1, '#14171c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  // riveted plate
  rr(ctx, cx - R * 1.35, cy - R * 1.25, R * 2.7, R * 2.45, 18); ctx.fillStyle = '#4a5263'; ctx.fill(); stroke(ctx, 4);
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(cx + sx * R * 1.22, cy + sy * R * 1.1, 6, 0, TAU); ctx.fillStyle = '#6a7180'; ctx.fill(); stroke(ctx, 1.5); }
  // the dial face: 10..60 over 270°
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = '#e8e0c8'; ctx.fill(); stroke(ctx, 5);
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.94, 0, TAU); stroke(ctx, 2, '#8a7a5a');
  const A0 = Math.PI * 0.75, SPAN = Math.PI * 1.5, ang = (v) => A0 + (v - ART.RANGE_MIN) / (ART.RANGE_MAX - ART.RANGE_MIN) * SPAN;
  for (let v = ART.RANGE_MIN; v <= ART.RANGE_MAX; v += 1) {
    const a = ang(v), big = v % 10 === 0, mid = v % 5 === 0, l = big ? 0.16 : mid ? 0.1 : 0.05;
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9); ctx.lineTo(cx + Math.cos(a) * R * (0.9 - l), cy + Math.sin(a) * R * (0.9 - l));
    ctx.strokeStyle = '#2a1d10'; ctx.lineWidth = big ? 3 : 1.5; ctx.stroke();
    if (big) label(ctx, String(v), cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, { size: Math.round(R * 0.11), weight: 900, color: '#2a1d10' });
  }
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.9, ang(50), ang(60)); ctx.strokeStyle = 'rgba(184,74,58,0.7)'; ctx.lineWidth = 6; ctx.stroke();
  label(ctx, 'RANGE · UNITS', cx, cy + R * 0.38, { size: Math.round(R * 0.07), weight: 800, color: '#6a5a3a' });
  // the number window
  rr(ctx, cx - R * 0.26, cy + R * 0.5, R * 0.52, R * 0.24, 6); ctx.fillStyle = '#14161b'; ctx.fill(); stroke(ctx, 2);
  label(ctx, String(Math.round(rng)), cx, cy + R * 0.62, { size: Math.round(R * 0.18), weight: 900, color: '#ffd36a' });
  // the needle
  const na = ang(rng);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(na);
  poly(ctx, [[-R * 0.12, -5], [R * 0.86, -1.5], [R * 0.86, 1.5], [-R * 0.12, 5]]); ctx.fillStyle = '#b84a3a'; ctx.fill(); stroke(ctx, 2);
  ctx.restore();
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.07, 0, TAU); ctx.fillStyle = '#d8a84a'; ctx.fill(); stroke(ctx, 2);
  ctx.beginPath(); ctx.arc(cx - R * 0.15, cy - R * 0.4, R * 0.5, Math.PI * 1.1, Math.PI * 1.6); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 8; ctx.stroke();
  // the hand wheel below, turning with the range
  const wy = cy + R * 1.05, wr = R * 0.32, wa = rng / 3;
  ctx.save(); ctx.beginPath(); ctx.rect(0, wy - wr * 0.25, w, h); ctx.clip();
  ctx.beginPath(); ctx.arc(cx, wy + wr * 0.6, wr, 0, TAU); stroke(ctx, 12, OUT); ctx.beginPath(); ctx.arc(cx, wy + wr * 0.6, wr, 0, TAU); stroke(ctx, 8, '#b84a3a');
  for (let i = 0; i < 5; i++) { const b = wa + i * TAU / 5; ctx.beginPath(); ctx.moveTo(cx, wy + wr * 0.6); ctx.lineTo(cx + Math.cos(b) * wr, wy + wr * 0.6 + Math.sin(b) * wr); stroke(ctx, 5, '#8a2f24'); }
  ctx.restore();
  // the breech lamp beside you (you're next to it), and the order of the day
  const bc = snap.breech === 'loaded' ? '#47e07a' : snap.breech === 'open' ? '#ffb347' : '#e2574c';
  ctx.beginPath(); ctx.arc(cx + R * 1.1, cy - R * 0.95, 9, 0, TAU); ctx.fillStyle = bc; ctx.fill(); stroke(ctx, 2);
  label(ctx, `breech ${snap.breech}`, cx + R * 1.1 - 16, cy - R * 0.95, { size: 12, weight: 800, align: 'right', color: '#e8ecf4' });
  label(ctx, 'You can\'t see out from here: the cupola calls the range.', cx, cy - R * 1.12, { size: 14, weight: 700, color: '#aab2c0' });
}
B.STATION_VIEWS.rangeWheel = { draw: drawRangeDial, hint: 'W / S (or A / D): range further / nearer · E / Space: leave' };

// ---------------------------------------------------------------------------
// Debug (solo): spawn encounters without the helm
// ---------------------------------------------------------------------------
function debugSpawn(what) {
  const sim = B.client && B.client.solo && B.client.solo.sim;
  if (!sim) return false;
  if (what === 'end') { sim.endEncounters(); return true; }
  const [kind, side] = what.split('-');
  if (!B.ENCOUNTER_KINDS[kind]) return false;
  sim.spawnEncounter(kind, side ? { side } : {});
  B.client.banner(`(debug) ${what}`, '#9cc4ff');
  return true;
}
if (typeof location !== 'undefined') {
  const m = /[?&]spawn=([\w,-]+)/.exec(location.search);
  if (m) {
    const list = m[1].split(',');
    const tryIt = () => { if (!(B.client && B.client.solo)) return setTimeout(tryIt, 100); for (const w of list) debugSpawn(w); };
    setTimeout(tryIt, 100);
  }
  addEventListener('keydown', (e) => {
    if (!B.client || B.client.mode !== 'solo' || (document.activeElement && document.activeElement.tagName === 'INPUT')) return;
    const w = { Digit7: 'gunship-left', Digit8: 'gunship-right', Digit9: 'asteroids', Digit0: 'end' }[e.code];
    if (w) debugSpawn(w);
  });
}
B.artilleryView = { drawGunship, drawRock, drawFx, FX: () => FX };
})();
