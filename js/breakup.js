// The ship under strain and the ship breaking up. Looks and sound only: nothing here changes the game.
// Everything is worked out in each browser from synced state (the broken parts, mission.over, `time`),
// so solo and every multiplayer client show the same thing without anything extra on the network.
// (Not in the server's simulation: game.js / mission.js / lights.js call in here behind typeof checks.)
//
// - Strain: how close the ship is to falling apart, from its life left (MAX_DAMAGE - broken parts; 0: one
//   more broken part and it's lost). Nothing at 3+ left; at 2 a first hairline crack and a rare creak; at 1
//   a few cracks with a faint glow, the odd spurt of sparks, a bit of plating drifting off now and then; at
//   0 (ONE MORE = LOST) cracks all over the hull and floors glowing hot, sparks spitting out of them, plates
//   coming loose, the lights browning out for a moment, the hull groaning with a shudder of the camera.
//   (shipStrain(): eased per browser, so it fades in and out as parts break and get fixed.)
// - Break-up: when the mission is lost because too many parts broke (mission.over.breakup, js/mission.js),
//   BREAKUP_T s of animation before the end screen, on mission.over.at's clock (synced sim time): the camera
//   pulls out to the whole ship and shakes harder and harder; explosions rip along the hull and through the
//   rooms, tearing off hull plates that tumble away into space; air vents in white jets from the holes; a
//   glowing fracture runs across the ship and tears open; then the reactor goes (a blinding bloom) and the
//   end screen comes up out of it. Seeded by mission.over.at: the same break-up in every browser.
// Sprites made at runtime: dyn/brk_plate_<v> (torn hull plates), dyn/brk_platehot_<v> (their glowing torn
// edge), dyn/brk_crack_<v> / dyn/brk_crackglow_<v> (stress cracks, lying flat), dyn/brk_mist (vented air);
// plus fx/explosion_l and the spark / smoke / debris particles of js/hitfx.js. ?classic: all in 2D.

const BREAKUP_FINALE = 3.7, BREAKUP_SHOW = 4.15, BREAKUP_T = 4.75;   // the reactor goes; the end screen shows; fully faded in
const BRK = { k: 0, plates: [], mist: [], flips: [], spr: null, cracks: null, clock: null, plan: null, fired: 0, jolt: 0,
              shudder: 0, creakIn: 6, sparkIn: 0, driftIn: 0, last: null };

// --- strain ------------------------------------------------------------------------------------------
// The life left: how many more parts can break before the ship is lost (Infinity: no mission).
function shipLifeLeft() {
  if (typeof mission === 'undefined' || !mission.active || typeof SYSTEMS === 'undefined') return Infinity;
  return MAX_DAMAGE - SYSTEMS.filter(s => s.broken).length;
}
function strainTarget() {
  if (typeof mission === 'undefined' || !mission.active) return 0;
  if (mission.over) return mission.over.breakup ? 1 : 0;      // jumped out: safe, calm
  const left = shipLifeLeft();
  return left <= 0 ? 1 : left === 1 ? 0.4 : left === 2 ? 0.12 : 0;
}
const shipStrain = () => BRK.k;

// --- the break-up's clock ----------------------------------------------------------------------------
// Seconds since the ship started breaking up (Infinity: it isn't). Smooth in this browser (time is 30 Hz in multiplayer).
function breakupT() {
  const o = typeof mission !== 'undefined' && mission.over;
  if (!o?.breakup || o.at == null) return Infinity;
  return BRK.clock && BRK.clock.at === o.at ? BRK.clock.t : Math.max(0, time - o.at);
}
function breakupClock(dt) {
  const o = mission.over;
  if (!o?.breakup || o.at == null) { BRK.clock = null; BRK.plan = null; return; }
  if (!BRK.clock || BRK.clock.at !== o.at) BRK.clock = { at: o.at, t: Math.max(0, time - o.at) };
  else BRK.clock.t = Math.max(BRK.clock.t + dt, time - o.at - 0.15);
}

// --- geometry ----------------------------------------------------------------------------------------
// A point on the hull's outline (u: 0..1 along its length) and its outward normal.
function hullPoint(u) {
  const segs = HULL.map((p, i) => { const q = HULL[(i + 1) % HULL.length]; return [p, q, Math.hypot(q[0] - p[0], q[1] - p[1])]; });
  let d = u * segs.reduce((s, e) => s + e[2], 0);
  for (const [p, q, l] of segs) {
    if (d <= l || l === 0) { const s = l ? d / l : 0, nx = (q[1] - p[1]) / (l || 1), ny = -(q[0] - p[0]) / (l || 1); return { x: lerp(p[0], q[0], s), y: lerp(p[1], q[1], s), nx, ny }; }
    d -= l;
  }
  const p = HULL[0]; return { x: p[0], y: p[1], nx: 0, ny: -1 };
}
const roomPoint = (r) => { const q = ROOM_RECTS[Math.floor(r() * ROOM_RECTS.length)]; return { x: q.x + 0.8 + r() * Math.max(0.1, q.w - 1.6), y: q.y + 0.8 + r() * Math.max(0.1, q.h - 1.6) }; };
const SHIP_MID = () => [SHIP_W / 2, SHIP_H / 2];

// The stress cracks: the same spots in every browser, in the order they appear (alternately on the hull
// (on an outer wall's top where there is one: hitSurface, js/combat.js) and on a room's floor).
function strainCracks() {
  if (BRK.cracks) return BRK.cracks;
  const r = rng(7741), out = [];
  for (let i = 0; i < 16; i++) {
    let x, y, nx = 0, ny = 0, S = null;
    if (i % 2 === 0 && typeof hitSurface === 'function') for (let n = 0; n < 6 && !S; n++) {   // the hull: on an outer wall's top (the plating
      const h = hullPoint(r()); nx = h.nx; ny = h.ny;                                          // outside the walls hardly shows)
      for (const d of [0.3, 0.6, 0.9, 1.2]) { const q = hitSurface(h.x - nx * d, h.y - ny * d); if (q.z > 0) { S = q; x = q.x; y = q.y; break; } }
    }
    if (!S) { ({ x, y } = roomPoint(r)); S = { x, y, z: 0, clip: null }; nx = ny = 0; }
    out.push({ i, x, y, nx, ny, S, v: Math.floor(r() * 3), rot: (r() - 0.5) * 2.4, size: 1.2 + 0.9 * r(), hull: S.z > 0, ph: r() * TAU });
  }
  return (BRK.cracks = out);
}
// How far crack i shows at strain k (0..1): one by one as k rises.
const crackShow = (c, k) => clamp(k * 14 - c.i + 0.4, 0, 1);

// The break-up, planned from its seed: blasts (time, place, outward direction), vents, the fracture line.
function breakupPlan() {
  const o = mission.over;
  if (BRK.plan && BRK.plan.at === o.at) return BRK.plan;
  const r = rng(Math.round(o.at * 1000) + 99), [mx, my] = SHIP_MID();
  const blasts = [];
  const sys = SYSTEMS.filter(s => s.broken && !s.outside);
  const first = sys.length ? sys[Math.floor(r() * sys.length)] : { x: REACTOR.x, y: REACTOR.y };
  blasts.push({ t: 0.05, x: first.x, y: first.y, nx: 0, ny: 0, hull: false });
  const N = 18;
  for (let i = 1; i <= N; i++) {
    const t = 0.3 + 3.25 * Math.pow(i / N, 0.85) + (r() - 0.5) * 0.12;
    if (r() < 0.62) { const h = hullPoint(r()); blasts.push({ t, x: h.x - h.nx * 0.2, y: h.y - h.ny * 0.2, nx: h.nx, ny: h.ny, hull: true }); }
    else { const p = roomPoint(r), d = Math.hypot(p.x - mx, p.y - my) || 1; blasts.push({ t, x: p.x, y: p.y, nx: (p.x - mx) / d, ny: (p.y - my) / d, hull: false }); }
  }
  blasts.sort((a, b) => a.t - b.t);
  const vents = [0.3, 0.8, 1.4, 2.1, 2.7].map(t => ({ t, ...hullPoint(r()), dur: 1.6 + r() * 1.6 }));
  const x0 = 14 + r() * 16, x1 = x0 + (r() - 0.5) * 9, rift = [];   // the fracture: top to bottom across the ship
  for (let j = 0; j <= 16; j++) { const s = j / 16; rift.push([lerp(x0, x1, s) + (j && j < 16 ? (r() - 0.5) * 1.4 : 0), lerp(-4, SHIP_H + 1, s)]); }
  return (BRK.plan = { at: o.at, blasts, vents, rift });
}

// --- sprites made at runtime ---------------------------------------------------------------------------
function breakupSprites() {
  if (BRK.spr || !GFX.on) return BRK.spr;
  const spr = { plate: [], hot: [], crack: [], glow: [], mist: null };
  for (let v = 0; v < 3; v++) {                       // torn hull plates, ~1.3 x 1 units at scale 1 (lying flat)
    const W = 72, H = 56, D = GFX.canvasSprite('brk_plate_' + v, W, H, { ppu: 54 }), E = GFX.canvasSprite('brk_platehot_' + v, W, H, { ppu: 54 });
    if (!D || !E) return null;
    const r = rng(311 + v * 7), pts = [];
    const n = 9;
    for (let i = 0; i < n; i++) {                     // a rough rectangle with one torn, jagged side
      const a = i / n * TAU, torn = Math.cos(a - v) > 0.3, rad = (torn ? 0.62 + 0.3 * r() : 0.95);
      const cx = Math.cos(a), cy = Math.sin(a), m = Math.max(Math.abs(cx), Math.abs(cy) * 1.3);
      pts.push([W / 2 + cx / m * rad * W * 0.46, H / 2 + cy / m * rad * H * 0.46 * 0.75]);
    }
    const path = (g) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
    const g = D.ctx, gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#76808f'); gr.addColorStop(0.6, '#4c5462'); gr.addColorStop(1, '#30353f');
    path(g); g.fillStyle = gr; g.fill();
    g.save(); path(g); g.clip();
    g.strokeStyle = 'rgba(30,34,42,0.7)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(W * 0.5, 0); g.lineTo(W * 0.5, H); g.moveTo(0, H * 0.5); g.lineTo(W, H * 0.5); g.stroke();   // panel seams
    g.fillStyle = 'rgba(25,28,34,0.8)';
    for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(W * (0.15 + 0.7 * (i % 4) / 3), H * (i < 4 ? 0.2 : 0.8), 1.4, 0, TAU); g.fill(); }   // rivets
    if (v === 1) { g.fillStyle = 'rgba(214,170,40,0.75)'; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(i * 16, H); g.lineTo(i * 16 + 8, H); g.lineTo(i * 16 + 22, H * 0.7); g.lineTo(i * 16 + 14, H * 0.7); g.fill(); } }   // hazard paint
    g.fillStyle = 'rgba(20,14,10,0.55)'; g.beginPath(); g.arc(W * 0.7, H * 0.4, 12, 0, TAU); g.fill();   // scorch
    g.restore();
    path(g); g.strokeStyle = '#2a2e36'; g.lineWidth = 2; g.stroke();
    D.commit();
    const e = E.ctx;                                   // the torn edge glowing
    path(e); e.strokeStyle = 'rgba(255,140,50,0.8)'; e.lineWidth = 3; e.stroke();
    path(e); e.strokeStyle = 'rgba(255,235,190,0.85)'; e.lineWidth = 1.2; e.stroke();
    E.commit();
    spr.plate.push(D.name); spr.hot.push(E.name);
  }
  for (let v = 0; v < 3; v++) {                       // stress cracks, 2 x 1.5 units, squashed to lie flat
    const W = 128, H = Math.round(96 * GFX.SIN), D = GFX.canvasSprite('brk_crack_' + v, W, H, { ppu: 64 }), E = GFX.canvasSprite('brk_crackglow_' + v, W, H, { ppu: 64 });
    if (!D || !E) return null;
    const r = rng(53 + v * 19), lines = [];
    const grow = (x, y, a0, len, w, depth) => {        // jagged: each step strays from the crack's direction, no wandering
      const pts = [[x, y]];
      for (let j = 0; j < len; j++) { const a = a0 + (r() - 0.5) * 1.5, st = 4 + r() * 5; x += Math.cos(a) * st; y += Math.sin(a) * st; pts.push([x, y]); if (depth < 2 && r() < 0.2) grow(x, y, a0 + (r() < 0.5 ? 0.8 : -0.8), Math.floor(len * 0.45), w * 0.6, depth + 1); }
      lines.push({ pts, w });
    };
    grow(0, 0, r() * TAU, 8, 3.2, 0); grow(0, 0, r() * TAU, 7, 2.8, 0); grow(0, 0, r() * TAU, 5, 2.2, 0);
    const draw = (g, col, wk) => {
      g.save(); g.translate(W / 2, H / 2); g.scale(1, GFX.SIN); g.lineCap = 'round'; g.lineJoin = 'round';
      for (const l of lines) { g.beginPath(); l.pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = col; g.lineWidth = l.w * wk; g.stroke(); }
      g.restore();
    };
    draw(D.ctx, 'rgba(22,20,22,0.38)', 5.5); draw(D.ctx, 'rgba(4,4,6,1)', 2.3); D.commit();     // soot round a dark split
    draw(E.ctx, 'rgba(255,100,30,0.3)', 2.6); draw(E.ctx, 'rgba(255,205,140,0.95)', 0.65); E.commit();   // the hot seam deep in it
    spr.crack.push(D.name); spr.glow.push(E.name);
  }
  const M = GFX.canvasSprite('brk_mist', 32, 32, { ppu: 64 });   // a soft white puff, 0.5 units across
  if (!M) return null;
  const mg = M.ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  mg.addColorStop(0, 'rgba(235,242,255,0.9)'); mg.addColorStop(0.5, 'rgba(210,222,240,0.45)'); mg.addColorStop(1, 'rgba(200,215,235,0)');
  M.ctx.fillStyle = mg; M.ctx.fillRect(0, 0, 32, 32); M.commit(); spr.mist = M.name;
  return (BRK.spr = spr);
}

// --- spawning ------------------------------------------------------------------------------------------
// A hull plate torn off at (x, y), thrown out along (nx, ny) at speed sp, tumbling; drifts on (space: no drag).
function brkPlate(x, y, nx, ny, sp, size, hot, life = 9) {
  const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.1;
  BRK.plates.push({ x, y, z: 0.4 + Math.random() * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: (Math.random() - 0.3) * 1.2, rot: Math.random() * TAU,
                    vr: (Math.random() - 0.5) * (2 + sp * 1.2), size, hot, v: Math.floor(Math.random() * 3), life, max: life });
}
function brkMist(x, y, nx, ny, sp, life = 1.2) {
  const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 0.5;
  BRK.mist.push({ x, y, z: 0.5 + Math.random() * 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 0.25 + Math.random() * 0.2, life, max: life });
}
// One blast of the break-up: an explosion, sparks, smoke and plating (js/hitfx.js), hull plates torn off.
function brkBlast(b, big) {
  const H = typeof hfSpark === 'function';
  BRK.flips.push({ x: b.x, y: b.y, z: 0.6, t: 0, dur: 12 / 16, scale: big ? 2.4 : 1.3 + Math.random() * 0.6 });
  if (H) {
    hfFlash(b.x, b.y, 1.2, big ? 14 : 9, big ? 5 : 3.6, big ? 0.6 : 0.4, [1, 0.75, 0.4]);
    const a0 = b.nx || b.ny ? Math.atan2(b.ny, b.nx) : 0, fan = b.nx || b.ny ? 2.2 : TAU;
    for (let i = 0; i < (big ? 120 : 70); i++) {
      const a = a0 + (Math.random() - 0.5) * fan;
      hfSpark(b.x, b.y, hfRand(0.2, 1), Math.cos(a), Math.sin(a), hfRand(3, 18), hfRand(1, 8), hfRand(0.4, 1.4), !b.hull, hfRand(0.8, 1), hfRand(0.8, 1.5));
    }
    for (let i = 0; i < 8; i++) { const a = a0 + (Math.random() - 0.5) * fan, sp = hfRand(0.5, 2.5); hfSmoke(b.x, b.y, hfRand(0.2, 0.8), Math.cos(a) * sp, Math.sin(a) * sp, hfRand(0.25, 0.45), hfRand(2, 3.5), !b.hull); }
    for (let i = 0; i < 6; i++) { const a = a0 + (Math.random() - 0.5) * fan, sp = hfRand(2, 8); hfDebris(b.x, b.y, 0.4, Math.cos(a) * sp, Math.sin(a) * sp, hfRand(2, 6), !b.hull); }
  }
  const n = b.hull ? 2 + Math.floor(Math.random() * 3) : 1;
  const [mx, my] = SHIP_MID(), d = Math.hypot(b.x - mx, b.y - my) || 1, nx = b.nx || (b.x - mx) / d, ny = b.ny || (b.y - my) / d;
  for (let i = 0; i < n; i++) brkPlate(b.x, b.y, nx, ny, hfRandB(2.5, 8), hfRandB(0.7, 1.5), true);
  BRK.jolt = Math.min(1, BRK.jolt + (big ? 1 : 0.55));
}
const hfRandB = (a, b) => a + Math.random() * (b - a);

// --- update (clientUpdate, every frame in every browser) ---------------------------------------------------
function breakupUpdate(dt) {
  if (typeof mission === 'undefined') return;
  breakupClock(dt);
  const target = strainTarget();
  BRK.k += (target - BRK.k) * (1 - Math.exp(-dt * (target > BRK.k ? 1.2 : 2.5)));   // fades in over a second or two
  const k = BRK.k;
  BRK.jolt *= Math.exp(-dt * 5); BRK.shudder *= Math.exp(-dt * 3);
  const u = breakupT();
  // the strain: sparks spitting out of the cracks, plating drifting off, the hull groaning
  if (k > 0.05 && !isFinite(u)) {
    const cracks = strainCracks().filter(c => crackShow(c, k) > 0.5);
    BRK.sparkIn -= dt * 2.2 * k * k;
    if (BRK.sparkIn <= 0 && cracks.length && typeof hfSpark === 'function') {
      BRK.sparkIn = 0.4 + Math.random();
      const c = cracks[Math.floor(Math.random() * cracks.length)], z = c.S.z + 0.15, n = 6 + Math.floor(Math.random() * 10 * k);
      const a0 = c.hull ? Math.atan2(c.ny, c.nx) : Math.random() * TAU;
      for (let i = 0; i < n; i++) { const a = a0 + (Math.random() - 0.5) * 1.6; hfSpark(c.S.x, c.S.y, z, Math.cos(a), Math.sin(a), hfRand(1.5, 5), hfRand(1, 4), hfRand(0.3, 0.8), !c.hull, hfRand(0.8, 1), hfRand(0.5, 1)); }
      hfFlash(c.S.x, c.S.y, z + 0.5, 3, 1.4 * k, 0.1, [1, 0.75, 0.45]);
      if (k > 0.7 && Math.random() < 0.4) hfSmoke(c.S.x, c.S.y, z, hfRand(-0.3, 0.3), hfRand(-0.3, 0.3), hfRand(0.15, 0.25), hfRand(1.5, 2.5), !c.hull);
    }
    BRK.smokeIn = (BRK.smokeIn || 0) - dt * 3 * k * k;
    if (BRK.smokeIn <= 0 && cracks.length && typeof hfSmoke === 'function') {   // the hot cracks smoulder
      BRK.smokeIn = 0.5 + Math.random();
      const c = cracks[Math.floor(Math.random() * cracks.length)];
      hfSmoke(c.S.x + hfRand(-0.3, 0.3), c.S.y + hfRand(-0.2, 0.2), c.S.z + 0.1, hfRand(-0.15, 0.15), hfRand(-0.15, 0.15), hfRand(0.12, 0.2), hfRand(2, 3.2), !c.hull);
    }
    BRK.driftIn -= dt * 0.9 * Math.pow(k, 1.5);
    if (BRK.driftIn <= 0) {                            // a bit of plating comes loose and drifts off
      BRK.driftIn = 0.5 + Math.random();
      const h = hullPoint(Math.random());
      brkPlate(h.x, h.y, h.nx, h.ny, hfRandB(0.3, 0.9), hfRandB(0.25, 0.5), false, 10);
    }
    BRK.creakIn -= dt * k;
    if (BRK.creakIn <= 0) {
      BRK.creakIn = 4 + Math.random() * 4;
      try { sfx.creak?.(k); } catch (e) { /* no audio */ }
      if (k > 0.7) BRK.shudder = 1;
    }
  } else if (k <= 0.05) BRK.creakIn = Math.min(BRK.creakIn, 3);
  // the break-up: its blasts, vents and sounds as their time comes (late, e.g. joining: skipped)
  if (u < BREAKUP_T) {
    const P = breakupPlan();
    while (BRK.fired < P.blasts.length && P.blasts[BRK.fired].t <= u) {
      const b = P.blasts[BRK.fired++];
      if (u - b.t > 0.5) continue;
      brkBlast(b, BRK.fired === 1);
      try { if (BRK.fired % 3 === 1) sfx.explosion(); else sfx.hit(true); } catch (e) { /* no audio */ }
    }
    for (const v of P.vents) {
      const s = u - v.t;
      if (s < 0 || s > v.dur) continue;
      const rate = 60 * (1 - s / v.dur * 0.6);
      for (let i = 0; i < Math.round(rate * dt + Math.random() * 0.5); i++) brkMist(v.x, v.y, v.nx, v.ny, hfRandB(4, 9));
      if (s < dt * 1.5 && typeof hfFlash === 'function') hfFlash(v.x, v.y, 0.8, 4, 1.5, 0.2, [0.8, 0.9, 1]);
    }
    const cue = (at, f) => { if (BRK.last != null && BRK.last < at && u >= at) try { f(); } catch (e) { /* no audio */ } };
    cue(0.2, () => sfx.tear?.()); cue(0.35, () => sfx.whoosh()); cue(2.55, () => sfx.tear?.());
    cue(BREAKUP_FINALE, () => { sfx.breakup?.(); finaleBlast(); });
    if (u > 2.6 && u < BREAKUP_FINALE) {               // the rift tearing open spits plates and sparks
      const P2 = P.rift, j = Math.floor(Math.random() * P2.length), [rx, ry] = P2[j];
      if (Math.random() < dt * 10) brkPlate(rx, ry, Math.random() < 0.5 ? -1 : 1, (Math.random() - 0.5) * 0.4, hfRandB(1.5, 4), hfRandB(0.5, 1.1), true);
      if (typeof hfSpark === 'function') for (let i = 0; i < 3; i++) { const a = Math.random() * TAU; hfSpark(rx, ry, hfRand(0.2, 0.8), Math.cos(a), Math.sin(a), hfRand(2, 7), hfRand(1, 5), hfRand(0.3, 0.9), true, 1, hfRand(0.6, 1.2)); }
    }
    BRK.last = u;
  } else { BRK.fired = 0; BRK.last = null; }
  // particles
  for (const p of BRK.plates) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt; if (p.z < 0.1) { p.z = 0.1; p.vz = Math.abs(p.vz) * 0.3; } }
  for (const p of BRK.mist) { p.life -= dt; const f = Math.exp(-1.2 * dt); p.vx *= f; p.vy *= f; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 0.9; }
  for (const f of BRK.flips) f.t += dt;
  BRK.plates = BRK.plates.filter(p => p.life > 0).slice(-160);
  BRK.mist = BRK.mist.filter(p => p.life > 0).slice(-500);
  BRK.flips = BRK.flips.filter(f => f.t < f.dur);
}
// The reactor going: one huge blast in the middle, plates thrown out all round.
function finaleBlast() {
  const x = REACTOR.x, y = REACTOR.y;
  BRK.flips.push({ x, y, z: 0.8, t: 0, dur: 12 / 14, scale: 6 });
  if (typeof hfFlash === 'function') { hfFlash(x, y, 2, 40, 9, 1.2, [1, 0.9, 0.75]); for (let i = 0; i < 260; i++) { const a = Math.random() * TAU; hfSpark(x, y, hfRand(0.3, 1.5), Math.cos(a), Math.sin(a), hfRand(6, 30), hfRand(1, 10), hfRand(0.5, 1.6), false, 1, hfRand(1, 2)); } }
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; brkPlate(x + Math.cos(a) * 3, y + Math.sin(a) * 2, Math.cos(a), Math.sin(a), hfRandB(6, 16), hfRandB(0.8, 1.8), true); }
  BRK.jolt = 1.5;
}

// --- camera (updateCamera, js/game.js): offset in tiles ------------------------------------------------------
function breakupCamera(t) {
  const u = breakupT();
  let a = 0.06 * BRK.shudder * BRK.k;                 // the hull groaning: a short shudder
  if (u < BREAKUP_T) a += 0.06 + 0.22 * Math.pow(clamp(u / BREAKUP_FINALE, 0, 1), 1.5) * (u < BREAKUP_FINALE ? 1 : Math.max(0, 1 - (u - BREAKUP_FINALE) * 1.5));
  a += 0.35 * BRK.jolt;
  if (a < 0.001) return { x: 0, y: 0 };
  return { x: a * (Math.sin(t * 71) + 0.5 * Math.sin(t * 113)), y: a * (Math.cos(t * 57) + 0.5 * Math.sin(t * 97)) };
}
// Whether the camera should frame the whole ship (the break-up).
const breakupOverview = () => isFinite(breakupT());

// --- lights (gameLighting, js/lights.js) --------------------------------------------------------------------
// A column's ceiling lamps browning out for a moment under strain (and dying during the break-up): a factor 0..1.
function strainFlicker(col, t) {
  const u = breakupT(), k = BRK.k;
  if (u < Infinity) { const slot = Math.floor(t * 14) + col * 17; return clamp(1 - u / BREAKUP_FINALE, 0.1, 1) * (hash01(slot) < 0.35 ? 0.3 : 1); }
  if (k < 0.3) return 1;
  const slot = Math.floor(t * 11) + col * 29;
  return hash01(slot) < 0.06 * k * k ? 0.5 : hash01(slot * 0.37 + 5) < 0.04 * k ? 0.8 : 1;
}
function breakupLights(add) {
  const t = typeof time === 'number' ? time : 0;
  for (const c of strainCracks()) {                  // hot cracks glow a little
    const s = crackShow(c, BRK.k), g = clamp((BRK.k - 0.25) / 0.75, 0, 1) * s;
    if (g > 0.05) add({ x: c.S.x, y: c.S.y, z: c.S.z + 0.4, color: [1, 0.45, 0.15], radius: 1.8 * c.size, intensity: 0.6 * g * (0.7 + 0.3 * Math.sin(t * 3 + c.ph)) });
  }
  const u = breakupT();
  if (isFinite(u)) {
    const p = riftOpen(u);
    if (p.glow > 0.05) breakupPlan().rift.filter((_, j) => j % 3 === 1).forEach(([x, y]) => add({ x, y, z: 0.8, color: [1, 0.5, 0.2], radius: 4, intensity: 2.2 * p.glow }));
  }
}

// --- drawing -------------------------------------------------------------------------------------------------
// The fracture at u s: how far it has run (0..1), how hot it glows, how wide it has torn open (units).
function riftOpen(u) {
  if (!isFinite(u)) return { run: 0, glow: 0, w: 0 };   // (after the break-up it stays torn open, behind the end screen)
  return { run: clamp((u - 1.3) / 1.1, 0, 1), glow: clamp((u - 1.3) / 0.6, 0, 1) * (1 - 0.55 * clamp((u - BREAKUP_FINALE) / 1.5, 0, 1)), w: 1.8 * Math.pow(clamp((u - 2.6) / (BREAKUP_FINALE - 2.6), 0, 1), 1.6) };
}
// The cracks (in the world, with the floor decals): GL sprites, or 2D lines in ?classic.
function drawStrainCracks(t) {
  const k = BRK.k;
  if (k < 0.02) return;
  const glowK = clamp((k - 0.25) / 0.75, 0, 1), S = GFX.on && breakupSprites();
  for (const c of strainCracks()) {
    const s = crackShow(c, k); if (s <= 0) continue;
    const P = c.S, pulse = 0.6 + 0.4 * Math.sin(t * (2 + 3 * k) + c.ph), g = 0.8 * glowK * s * pulse;
    if (S) {
      const o = P.z ? { layer: 'main', sortY: P.y + 0.7, depthBias: 0.08, depthWrite: false, clip: P.clip } : { layer: 'decal' };
      GFX.sprite(S.crack[c.v], 0, P.x, P.y, P.z + 0.02, { ...o, rot: c.rot, scale: c.size, alpha: s });
      if (g > 0.02) GFX.sprite(S.glow[c.v], 0, P.x, P.y, P.z + 0.025, { ...o, rot: c.rot, scale: c.size, alpha: g, unlit: true });
      continue;
    }
    const r = rng(c.i * 31 + 5), X = P.x * T, Y = (P.y - GFX.lift(P.z)) * T;
    ctx.save(); ctx.translate(X, Y); ctx.rotate(c.rot); ctx.lineCap = 'round';
    for (let b = 0; b < 3; b++) {
      let x = 0, y = 0, a = r() * TAU; ctx.beginPath(); ctx.moveTo(0, 0);
      for (let j = 0; j < 6; j++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * T * 0.14 * c.size; y += Math.sin(a) * T * 0.14 * c.size; ctx.lineTo(x, y); }
      ctx.strokeStyle = `rgba(10,10,12,${0.85 * s})`; ctx.lineWidth = 2.2; ctx.stroke();
      if (g > 0.02) { ctx.strokeStyle = `rgba(255,170,90,${g})`; ctx.lineWidth = 0.9; ctx.stroke(); }
    }
    ctx.restore();
  }
}
// The glow layer (under the crew): the fracture running across the ship and tearing open.
function drawBreakupRift(t) {
  const u = breakupT();
  if (!isFinite(u)) return;
  const R = riftOpen(u), pts = breakupPlan().rift;
  if (R.run <= 0) return;
  const n = (pts.length - 1) * R.run, mid = (pts.length - 1) / 2, run = [];   // runs out from the middle both ways
  for (let j = 0; j < pts.length; j++) if (Math.abs(j - mid) <= n / 2 + 0.01) run.push(pts[j]);
  if (run.length < 2) return;
  const path = () => { ctx.beginPath(); run.forEach(([x, y], j) => (j ? ctx.lineTo(x * T, y * T) : ctx.moveTo(x * T, y * T))); };
  const fl = 0.85 + 0.15 * Math.sin(t * 37);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  path(); ctx.strokeStyle = `rgba(255,90,30,${0.35 * R.glow * fl})`; ctx.lineWidth = T * (0.6 + R.w * 1.6); ctx.stroke();
  path(); ctx.strokeStyle = `rgba(255,170,80,${0.85 * R.glow})`; ctx.lineWidth = T * (0.16 + R.w * 1.15); ctx.stroke();
  if (R.w > 0.02) { path(); ctx.strokeStyle = 'rgba(3,4,10,0.97)'; ctx.lineWidth = T * R.w; ctx.stroke(); }   // open to space
  else { path(); ctx.strokeStyle = `rgba(255,245,220,${R.glow})`; ctx.lineWidth = T * 0.06; ctx.stroke(); }
  ctx.restore();
}
// Over everything in the world (after drawCombatFront): the plates, the vented air, the explosions.
function drawBreakupFront(t) {
  if (!BRK.plates.length && !BRK.mist.length && !BRK.flips.length) return;
  const S = GFX.on && breakupSprites();
  for (const p of BRK.mist) {
    const q = 1 - p.life / p.max, a = 0.5 * Math.min(1, q * 6) * (1 - q);
    if (S) { GFX.sprite(S.mist, 0, p.x, p.y, p.z, { layer: 'top', unlit: true, scale: p.r / 0.25, alpha: a }); continue; }
    ctx.fillStyle = `rgba(220,230,245,${a * 0.7})`; ctx.beginPath(); ctx.arc(p.x * T, (p.y - GFX.lift(p.z)) * T, p.r * T, 0, TAU); ctx.fill();
  }
  for (const p of BRK.plates) {
    const a = clamp(p.life / Math.min(2, p.max * 0.3), 0, 1), hot = p.hot ? clamp(1 - (p.max - p.life) / 2.5, 0, 1) : 0;
    if (S) {
      GFX.sprite(S.plate[p.v], 0, p.x, p.y, p.z, { layer: 'top', scale: p.size, rot: p.rot, alpha: a, unlit: true });
      if (hot > 0.02) GFX.sprite(S.hot[p.v], 0, p.x, p.y, p.z, { layer: 'top', scale: p.size, rot: p.rot, alpha: a * hot, unlit: true });
      continue;
    }
    ctx.save(); ctx.translate(p.x * T, (p.y - GFX.lift(p.z)) * T); ctx.rotate(p.rot); ctx.globalAlpha = a;
    const w = T * 0.62 * p.size, h = T * 0.42 * p.size;
    ctx.fillStyle = '#6a7280'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.strokeStyle = hot > 0.05 ? `rgba(255,150,60,${hot})` : '#2a2e36'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
  for (const f of BRK.flips) {
    const q = f.t / f.dur;
    if (GFX.on && GFX.sprite('fx/explosion_l', Math.min(11, Math.floor(q * 12)), f.x, f.y, f.z, { layer: 'top', unlit: true, scale: f.scale })) continue;
    const R = T * f.scale * (0.4 + 1.2 * q), X = f.x * T, Y = (f.y - GFX.lift(f.z)) * T, g = ctx.createRadialGradient(X, Y, 0, X, Y, R);
    g.addColorStop(0, `rgba(255,250,220,${1 - q})`); g.addColorStop(0.4, `rgba(255,150,50,${0.8 * (1 - q)})`); g.addColorStop(1, 'rgba(160,40,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, R, 0, TAU); ctx.fill();
  }
}
// Screen space, the break-up before the end screen (u < BREAKUP_SHOW): a red pulse at the edges, the warning,
// the reactor's bloom swelling into a full flash.
function drawBreakupScreen(u, view = typeof camera === 'function' ? camera() : null) {
  const R = Math.hypot(VW, VH) / 2, p = clamp(u / BREAKUP_FINALE, 0, 1), beat = 0.5 + 0.5 * Math.sin(u * 14);
  screenGradient(VW / 2, VH / 2, R * (0.6 - 0.25 * p), R, [[0, [255, 60, 30], 0], [1, [255, 70, 30], 0.25 + 0.35 * p * beat + 0.3 * BRK.jolt]]);
  if (u < BREAKUP_FINALE && Math.sin(u * 16) > -0.3) {
    ctx.save(); ctx.font = '900 30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(20,6,6,0.9)'; ctx.strokeText('HULL FAILURE — THE SHIP IS BREAKING UP', VW / 2, 112);
    ctx.fillStyle = '#ff5a4a'; ctx.fillText('HULL FAILURE — THE SHIP IS BREAKING UP', VW / 2, 112); ctx.restore();
  }
  const b = clamp((u - BREAKUP_FINALE) / (BREAKUP_SHOW - BREAKUP_FINALE), 0, 1);
  if (b > 0) {                                        // the reactor's bloom, then everything white-hot
    let cx = VW / 2, cy = VH / 2;
    if (view) { cx = view.ox + REACTOR.x * T * view.zoom; cy = view.oy + REACTOR.y * T * view.zoom * view.sy; }
    const rb = R * 2.2 * (0.05 + b * b), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rb);
    g.addColorStop(0, `rgba(255,255,245,${Math.min(1, 0.7 + b)})`); g.addColorStop(0.35, `rgba(255,200,120,${0.9 * Math.min(1, b * 2)})`); g.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    if (b > 0.7) { ctx.fillStyle = `rgba(255,236,210,${(b - 0.7) / 0.3})`; ctx.fillRect(0, 0, VW, VH); }
  }
}
// Over the end screen while it fades in out of the flash.
function drawBreakupFade(u) {
  const f = 1 - clamp((u - BREAKUP_SHOW) / (BREAKUP_T - BREAKUP_SHOW), 0, 1);
  if (f > 0) { ctx.fillStyle = `rgba(255,236,210,${f})`; ctx.fillRect(0, 0, VW, VH); }
}
