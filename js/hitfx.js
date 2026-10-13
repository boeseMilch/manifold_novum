// Hit effects: what a hit on our hull looks like, and the sparks that show why a part broke or caught
// fire. Drawn only, never simulated: nothing here touches the game state, so it runs the same in solo
// and on every multiplayer client without being sent around. It watches the synced state instead:
//   - hit decals (combat.decals with `hot` = the sim time of the hit, from shipHit): the first time a
//     fresh one shows up, the impact plays here (a white flash + point light, a shower of sparks that
//     arc, bounce and cool from white over yellow and orange to red, glowing embers, smoke puffs,
//     tumbling hull debris, a shock ring; big hits much more, some of it blown inwards through the
//     wall). The decal itself then glows white-orange and cools to dark burned metal over ~12-20 s
//     (drawHitHeat, from drawShipDecals in js/combat.js; by `time`, so every client sees the same).
//   - SYSTEMS breaking and new fires: a burst of sparks out of that part (plus a jet of sparks from the
//     hit that caused it), then arcing spurts for a few seconds, and the odd spurt while it stays broken.
// Sprites: dyn/hitfx_spark_0..4 (soft dots by temperature, stretched into streaks), dyn/hitfx_heat_<v>_<c>
// (the cooling glow, 3 shapes × 4 colours), fx/smoke_*, fx/junk_shard; ?classic draws it all in 2D.
// Called from drawCombatFront (update + draw), drawShipDecals (heat) and gameLighting (hitFxLights).

const HITFX_CAP = 1400;                              // particles at most (the oldest go first)
const HITFX = { parts: [], lights: [], seen: new Set(), sys: null, fires: new Set(), last: null, recent: [], spr: null };
const HEAT_LIFE = { small: 12, big: 20 };            // seconds until a hit spot is cold
const SPARK_COLS = [[255, 255, 236], [255, 226, 130], [255, 160, 60], [235, 80, 30], [130, 34, 16]];

const hfRand = (a, b) => a + Math.random() * (b - a);
// outward normal of the hull side that was hit
const hfOut = (side) => side === 'port' ? [-1, 0] : side === 'star' ? [1, 0] : [0, -1];

// --- sprites made at runtime -------------------------------------------------------------------------
function hitFxSprites() {
  if (HITFX.spr || !GFX.on) return HITFX.spr;
  const spr = { spark: [], heat: [] };
  SPARK_COLS.forEach((c, i) => {                     // a soft dot, 0.1 units across at scale 1
    const D = GFX.canvasSprite('hitfx_spark_' + i, 32, 32, { ppu: 320 }); if (!D) return;
    const g = D.ctx, gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, i < 2 ? 'rgba(255,255,255,1)' : `rgba(${Math.min(255, c[0] + 60)},${Math.min(255, c[1] + 70)},${Math.min(255, c[2] + 60)},1)`);
    gr.addColorStop(0.35, `rgba(${c[0]},${c[1]},${c[2]},0.95)`); gr.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32); D.commit(); spr.spark.push(D.name);
  });
  // the cooling glow of a hit spot: an irregular hot blob with glowing cracks, lying flat (squashed
  // by sin 50°), 2 units across at scale 1; colours white-hot, orange, red, dull red
  const HEATC = [[255, 244, 210], [255, 168, 64], [226, 74, 24], [120, 30, 12]];
  for (let v = 0; v < 3; v++) for (let ci = 0; ci < 4; ci++) {
    const W = 160, H = Math.round(160 * GFX.SIN), D = GFX.canvasSprite(`hitfx_heat_${v}_${ci}`, W, H, { ppu: 80 }); if (!D) continue;
    const g = D.ctx, r = rng(91 + v * 17), c = HEATC[ci];
    g.save(); g.translate(W / 2, H / 2); g.scale(1, GFX.SIN);
    const col = (a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    for (let k = 0; k < 7; k++) {                    // lumpy core
      const a = r() * TAU, d = r() * 18, rr = 22 + r() * 22;
      const gr = g.createRadialGradient(Math.cos(a) * d, Math.sin(a) * d, 0, Math.cos(a) * d, Math.sin(a) * d, rr);
      gr.addColorStop(0, col(0.55)); gr.addColorStop(0.5, col(0.3)); gr.addColorStop(1, col(0));
      g.fillStyle = gr; g.beginPath(); g.arc(Math.cos(a) * d, Math.sin(a) * d, rr, 0, TAU); g.fill();
    }
    g.strokeStyle = col(0.85); g.lineCap = 'round';
    for (let k = 0; k < 6; k++) {                    // cracks radiating out of it
      let a = r() * TAU, x = Math.cos(a) * 10, y = Math.sin(a) * 10, w = 3.2;
      g.beginPath(); g.moveTo(x, y);
      const n = 4 + Math.floor(r() * 4);
      for (let j = 0; j < n; j++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 8; y += Math.sin(a) * 8; g.lineWidth = w; g.lineTo(x, y); w *= 0.8; }
      g.stroke();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 16);   // white-hot middle
    gr.addColorStop(0, col(1)); gr.addColorStop(1, col(0));
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill();
    g.restore(); D.commit(); spr.heat.push(D.name);
  }
  return (HITFX.spr = spr);
}

// --- spawning ------------------------------------------------------------------------------------------
function hfPush(p) { HITFX.parts.push(p); }
// one spark: from (x, y, z) in direction (dx, dy) at speed sp, up at vz; temp 0..1 how hot it starts
function hfSpark(x, y, z, dx, dy, sp, vz, life, inside, temp = 1, size = 1) {
  hfPush({ k: 0, x, y, z, vx: dx * sp, vy: dy * sp, vz, life, max: life, inside, temp, size, g: 9 });
}
function hfEmber(x, y, z, vx, vy, vz, life, inside) { hfPush({ k: 1, x, y, z, vx, vy, vz, life, max: life, inside, temp: 0.7, size: 1.3, g: 1.5 }); }
function hfSmoke(x, y, z, vx, vy, r, life, inside) { hfPush({ k: 2, x, y, z, vx, vy, vz: hfRand(0.4, 1.2), life, max: life, inside, r, seed: Math.floor(Math.random() * 4) }); }
function hfDebris(x, y, z, vx, vy, vz, inside) {
  hfPush({ k: 3, x, y, z, vx, vy, vz, life: hfRand(1.4, 2.6), max: 2.6, inside, rot: Math.random() * TAU, vr: hfRand(-14, 14), size: hfRand(0.5, 1), g: 12 });
}
function hfFlash(x, y, z, radius, intensity, dur, color = [1, 0.85, 0.6]) { HITFX.lights.push({ x, y, z, radius, intensity, dur, t: dur, color }); }

// A hit on the hull at (x, y) from that side.
function hitFxImpact(x, y, side, big) {
  const [ox, oy] = hfOut(side), k = big ? 1 : 0, S = typeof hitSurface === 'function' ? hitSurface(x, y) : { z: 0 }, z0 = S.z;
  hfFlash(x + ox * 0.6, y + oy * 0.6, z0 + 1.0, big ? 10 : 6, big ? 4.5 : 3, big ? 0.35 : 0.18, [1, 0.92, 0.75]);
  hfFlash(x, y, z0 + 0.6, big ? 6 : 3, big ? 3 : 1.6, big ? 1.2 : 0.6, [1, 0.5, 0.18]);   // the orange afterglow
  hfPush({ k: 4, x, y, z: z0 + 0.2, vx: 0, vy: 0, vz: 0, life: big ? 0.45 : 0.28, max: big ? 0.45 : 0.28, r: big ? 3.2 : 1.5 });   // shock ring
  const n = big ? 160 : 60;
  for (let i = 0; i < n; i++) {                      // the spark shower: mostly back out of the hull, fanned wide
    const a = Math.atan2(oy, ox) + (Math.random() - 0.5) * Math.PI * (Math.random() < 0.3 ? 1.6 : 0.9);
    const sp = hfRand(3, big ? 19 : 13) * (Math.random() < 0.15 ? 1.6 : 1);
    hfSpark(x, y, z0 + hfRand(0.15, 0.5), Math.cos(a), Math.sin(a), sp, hfRand(1, big ? 9 : 6), hfRand(0.35, big ? 1.5 : 1.0), false, hfRand(0.8, 1), hfRand(0.7, 1.4));
  }
  for (let i = 0; i < (big ? 24 : 8); i++) {          // embers: slower, glowing longer
    const a = Math.atan2(oy, ox) + (Math.random() - 0.5) * 2.4, sp = hfRand(0.6, 3);
    hfEmber(x, y, z0 + hfRand(0.2, 0.6), Math.cos(a) * sp, Math.sin(a) * sp, hfRand(0.5, 2.5), hfRand(1.2, 3), false);
  }
  for (let i = 0; i < (big ? 12 : 4); i++) {           // smoke billowing out of the hole
    const a = Math.atan2(oy, ox) + (Math.random() - 0.5) * 1.8, sp = hfRand(0.4, big ? 2.2 : 1.2);
    hfSmoke(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, z0 + hfRand(0.1, 0.5), Math.cos(a) * sp, Math.sin(a) * sp, hfRand(0.2, 0.35) * (1 + k * 0.6), hfRand(1.6, big ? 3.4 : 2.4), false);
  }
  for (let i = 0; i < (big ? 12 : 3); i++) {           // torn plating
    const a = Math.atan2(oy, ox) + (Math.random() - 0.5) * 2.2, sp = hfRand(2, big ? 9 : 5);
    hfDebris(x, y, z0 + 0.3, Math.cos(a) * sp, Math.sin(a) * sp, hfRand(2, 6), false);
  }
  if (big) {                                         // blown through the wall into the room behind it
    const ix = x - ox * 0.9, iy = y - oy * 0.9;
    hfFlash(ix - ox, iy - oy, 1.2, 7, 2.6, 0.4, [1, 0.8, 0.55]);
    for (let i = 0; i < 70; i++) {
      const a = Math.atan2(-oy, -ox) + (Math.random() - 0.5) * 1.9;
      hfSpark(ix, iy, hfRand(0.6, 1.4), Math.cos(a), Math.sin(a), hfRand(2.5, 11), hfRand(0, 5), hfRand(0.4, 1.3), true, hfRand(0.75, 1), hfRand(0.7, 1.3));
    }
    for (let i = 0; i < 6; i++) { const a = Math.atan2(-oy, -ox) + (Math.random() - 0.5) * 1.6, sp = hfRand(0.4, 1.4); hfSmoke(ix, iy, hfRand(0.6, 1.2), Math.cos(a) * sp, Math.sin(a) * sp, hfRand(0.2, 0.32), hfRand(1.8, 3.2), true); }
    for (let i = 0; i < 5; i++) { const a = Math.atan2(-oy, -ox) + (Math.random() - 0.5) * 1.6, sp = hfRand(2, 6); hfDebris(ix, iy, 1, Math.cos(a) * sp, Math.sin(a) * sp, hfRand(1, 4), true); }
  }
  HITFX.recent.push({ x, y, side, at: HITFX.now });
}

// A part that just broke (or caught fire) at (x, y): a burst out of it, a jet from the hit that did it,
// then arcing spurts for `arc` seconds.
function hitFxPart(x, y, fire) {
  hfFlash(x, y, 0.9, fire ? 5 : 4.5, fire ? 3.2 : 2.8, 0.35, fire ? [1, 0.62, 0.25] : [1, 0.9, 0.7]);
  for (let i = 0; i < (fire ? 45 : 55); i++) {
    const a = Math.random() * TAU;
    hfSpark(x, y, hfRand(0.3, 0.9), Math.cos(a), Math.sin(a), hfRand(1.5, 7), hfRand(2, 7), hfRand(0.35, 1.1), true, hfRand(0.75, 1), hfRand(0.6, 1.2));
  }
  for (let i = 0; i < (fire ? 10 : 4); i++) hfEmber(x, y, hfRand(0.3, 0.8), hfRand(-1, 1), hfRand(-1, 1), hfRand(1, 3), hfRand(1, 2.5), true);
  for (let i = 0; i < 4; i++) hfSmoke(x + hfRand(-0.3, 0.3), y + hfRand(-0.2, 0.2), hfRand(0.4, 0.9), hfRand(-0.4, 0.4), hfRand(-0.4, 0.2), hfRand(0.18, 0.3), hfRand(1.5, 2.8), true);
  // the hit that did it: a jet of sparks racing from the hull spot to the part
  const h = HITFX.recent.filter(r => HITFX.now - r.at < 1).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
  if (h) {
    const d = Math.hypot(x - h.x, y - h.y) || 1;
    if (d < 16) for (let i = 0; i < 18; i++) {
      const sp = hfRand(14, 22), j = (Math.random() - 0.5) * 0.15;
      const dx = (x - h.x) / d, dy = (y - h.y) / d;
      hfPush({ k: 0, x: h.x, y: h.y, z: hfRand(0.6, 1.0), vx: (dx - dy * j) * sp, vy: (dy + dx * j) * sp, vz: 0.3, life: d / sp * hfRand(0.9, 1.05), max: d / sp, inside: true, temp: 1, size: 1.2, g: 0, drag: 0 });
    }
  }
}

// --- watching the synced state for things to show ------------------------------------------------------
function hitFxWatch() {
  const now = typeof time === 'number' ? time : 0;
  if (!combat.decals.length) HITFX.seen.clear();
  for (const d of combat.decals) {
    if (d.hot == null) continue;
    const key = d.hot.toFixed(3) + ':' + d.seed;
    if (HITFX.seen.has(key)) continue;
    HITFX.seen.add(key);
    if (now - d.hot < 0.6 && now >= d.hot - 0.1) hitFxImpact(d.x, d.y, d.side || 'front', d.r > 0.8);
  }
  // parts breaking (not on the first look: a fresh mission, or joining one already under way)
  const state = SYSTEMS.map(s => !!s.broken);
  if (HITFX.sys && HITFX.sys.length === state.length) {
    SYSTEMS.forEach((s, i) => {
      if (state[i] && !HITFX.sys[i]) { hitFxPart(s.x, s.y, false); s.hfArc = HITFX.now + 4; }
    });
  }
  HITFX.sys = state;
  const ids = new Set();
  for (const f of fires) {
    if (f.uid == null) continue;
    ids.add(f.uid);
    if (!HITFX.fires.has(f.uid) && (f.t || 0) < 0.6 && HITFX.firesInit) hitFxPart(f.x, f.y, true);
  }
  HITFX.fires = ids; HITFX.firesInit = true;
}

// broken parts keep arcing: dense spurts for a few seconds after they broke, then now and then
function hitFxArcs(dt) {
  for (const s of SYSTEMS) {
    if (!s.broken) { s.hfArc = 0; continue; }
    const fresh = (s.hfArc || 0) > HITFX.now, rate = fresh ? 9 : 0.5;
    if (Math.random() < dt * rate) {
      const n = fresh ? 4 + Math.floor(Math.random() * 6) : 6 + Math.floor(Math.random() * 8);
      const a0 = Math.random() * TAU, z = hfRand(0.35, 0.8);
      for (let i = 0; i < n; i++) {
        const a = a0 + (Math.random() - 0.5) * 1.4;
        hfSpark(s.x + Math.cos(a0) * 0.25, s.y + Math.sin(a0) * 0.2, z, Math.cos(a), Math.sin(a), hfRand(1.5, 5), hfRand(1, 4), hfRand(0.25, 0.7), true, hfRand(0.8, 1), hfRand(0.5, 1));
      }
      hfFlash(s.x, s.y, 0.7, 3, fresh ? 2.2 : 1.6, 0.08, [0.85, 0.9, 1]);
    }
  }
}

// --- update -------------------------------------------------------------------------------------------
function hitFxUpdate() {
  const wall = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
  const dt = HITFX.last == null ? 0 : clamp(wall - HITFX.last, 0, 0.05);
  HITFX.last = wall; HITFX.now = wall;
  hitFxWatch();
  hitFxArcs(dt);
  for (const p of HITFX.parts) {
    p.life -= dt;
    const drag = p.drag ?? (p.k === 2 ? 1.6 : p.k === 1 ? 1.2 : 0.9);
    const f = Math.exp(-drag * dt);
    p.vx *= f; p.vy *= f;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.k === 2) { p.z += p.vz * dt; p.r += dt * 0.35; continue; }
    if (p.k === 4) continue;
    p.vz -= (p.g || 0) * dt; p.z += p.vz * dt;
    if (p.z < 0.03 && p.vz < 0) {                   // bounce off the deck / the hull plating
      p.z = 0.03; p.vz = -p.vz * 0.35; p.vx *= 0.6; p.vy *= 0.6;
      if (p.k === 0) p.life = Math.min(p.life, p.max * 0.5);
      if (p.k === 3) p.vr *= 0.5;
    }
    if (p.k === 3) p.rot += p.vr * dt;
  }
  for (const l of HITFX.lights) l.t -= dt;
  HITFX.lights = HITFX.lights.filter(l => l.t > 0);
  HITFX.parts = HITFX.parts.filter(p => p.life > 0);
  if (HITFX.parts.length > HITFX_CAP) HITFX.parts.splice(0, HITFX.parts.length - HITFX_CAP);
  HITFX.recent = HITFX.recent.filter(r => HITFX.now - r.at < 2);
}

// how hot a spark is (0 cold .. 1 white) and its colour index into SPARK_COLS
const hfTemp = (p) => clamp(p.temp * (p.k === 1 ? 0.55 + 0.45 * p.life / p.max : Math.pow(p.life / p.max, 0.7)), 0, 1);
const hfCol = (h) => h > 0.8 ? 0 : h > 0.6 ? 1 : h > 0.38 ? 2 : h > 0.15 ? 3 : 4;

// --- drawing ------------------------------------------------------------------------------------------
function drawHitFx() {
  hitFxUpdate();
  if (GFX.on && hitFxSprites()) drawHitFxGL(); else drawHitFx2D();
}
function drawHitFxGL() {
  const S = HITFX.spr, SIN = GFX.SIN, COS = GFX.COS;
  for (const p of HITFX.parts) {
    const o = p.inside ? { sortY: p.y + 0.3, depthWrite: false } : { layer: 'top' };
    if (p.k === 2) {                                 // smoke
      const q = 1 - p.life / p.max, a = 0.55 * Math.min(1, q * 8) * (1 - q);
      GFX.sprite(`fx/smoke_${p.seed}`, 0, p.x, p.y, p.z, { ...o, scale: p.r / 0.25, alpha: a });
      continue;
    }
    if (p.k === 3) {                                 // a bit of plating, glowing at first
      const hot = clamp(p.life / p.max * 1.4 - 0.4, 0, 1);
      GFX.sprite('fx/junk_shard', 0, p.x, p.y, p.z, { ...o, scale: 0.35 * p.size, rot: p.rot, alpha: clamp(p.life * 2, 0, 1) });
      if (hot > 0.05) GFX.sprite(S.spark[2], 0, p.x, p.y, p.z, { ...o, unlit: true, scale: 1.4 * p.size, alpha: hot * 0.8 });
      continue;
    }
    if (p.k === 4) {                                 // shock ring: a flat bright ring growing fast
      const q = 1 - p.life / p.max, n = 18, R = p.r * (0.25 + 0.75 * Math.sqrt(q));
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU;
        GFX.sprite(S.spark[q < 0.4 ? 0 : 1], 0, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R, 0.2, { layer: 'top', unlit: true, scale: 1.6, sx: 3, rot: Math.atan2(Math.cos(a) * SIN, -Math.sin(a)), alpha: (1 - q) * 0.8 });
      }
      continue;
    }
    // sparks and embers: a dot stretched along its motion on screen
    const h = hfTemp(p), sx = p.vx, sy = p.vy * SIN - p.vz * COS, sl = Math.hypot(sx, sy);
    const trail = p.k === 0 ? 0.05 : 0.025, len = sl * trail;
    const alpha = clamp(p.life / p.max * 3, 0, 1) * (p.k === 1 ? 0.6 + 0.4 * Math.sin(p.life * 23 + p.x) : 1);
    GFX.sprite(S.spark[hfCol(h)], 0, p.x - p.vx * trail * 0.5, p.y - p.vy * trail * 0.5, p.z - p.vz * trail * 0.5,
      { ...o, unlit: true, scale: p.size * (p.k === 1 ? 1.1 : 0.95), sx: Math.max(1, len / (0.095 * p.size) + 1), rot: Math.atan2(sy, sx), alpha });
  }
}
function drawHitFx2D() {
  const lift = (z) => GFX.lift(z);
  ctx.save(); ctx.lineCap = 'round';
  for (const p of HITFX.parts) {
    const X = L(p.x), Y = L(p.y - lift(p.z || 0));
    if (p.k === 2) {
      const q = 1 - p.life / p.max;
      ctx.globalAlpha = 0.45 * Math.min(1, q * 8) * (1 - q); ctx.fillStyle = '#4a4a50';
      ctx.beginPath(); ctx.arc(X, Y, L(p.r), 0, TAU); ctx.fill(); continue;
    }
    if (p.k === 3) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1); ctx.fillStyle = p.life / p.max > 0.6 ? '#c8662a' : '#3a3d44';
      ctx.save(); ctx.translate(X, Y); ctx.rotate(p.rot); ctx.fillRect(-L(0.07) * p.size, -L(0.04) * p.size, L(0.14) * p.size, L(0.08) * p.size); ctx.restore(); continue;
    }
    if (p.k === 4) {
      const q = 1 - p.life / p.max;
      ctx.globalAlpha = (1 - q) * 0.8; ctx.strokeStyle = '#fff2c8'; ctx.lineWidth = 3 * (1 - q) + 1;
      ctx.beginPath(); ctx.arc(X, Y, L(p.r * (0.25 + 0.75 * Math.sqrt(q))), 0, TAU); ctx.stroke(); continue;
    }
    const c = SPARK_COLS[hfCol(hfTemp(p))], trail = p.k === 0 ? 0.035 : 0.02;
    ctx.globalAlpha = clamp(p.life / p.max * 3, 0, 1);
    ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`; ctx.lineWidth = (p.k === 1 ? 3 : 2) * p.size;
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(L(p.x - p.vx * trail), L(p.y - p.vy * trail - lift((p.z || 0) - p.vz * trail))); ctx.stroke();
  }
  ctx.restore();
}

// --- hit spots cooling down (from drawShipDecals, after the burned decal itself) ------------------------
function hitHeat(d) {
  if (d.hot == null || typeof time !== 'number') return 0;
  const age = time - d.hot, life = d.r > 0.8 ? HEAT_LIFE.big : HEAT_LIFE.small;
  if (age < 0 || age > life) return 0;
  return Math.pow(1 - age / life, 1.6);
}
function drawHitHeat(d, S = { x: d.x, y: d.y, z: 0 }, o = { layer: 'decal' }) {
  const h = hitHeat(d); if (h <= 0) return;
  const big = d.r > 0.8, fl = 0.9 + 0.1 * noise1((typeof time === 'number' ? time : 0) * 6 + d.seed);
  const st = (1 - h) * 3, i = Math.min(2, Math.floor(st)), f = st - i;   // colour stage: white → orange → red → dull red
  const scale = d.r * (big ? 1.25 : 1.6) * (0.65 + 0.35 * h), v = Math.floor(d.seed || 0) % 3;
  if (GFX.on && hitFxSprites()) {
    const H = HITFX.spr.heat;
    if (o.clip) {                                    // on a wall top: the glow may spill outwards (into space), not inwards
      const [x0, y0, x1, y1, cz] = o.clip, side = d.side || 'front';
      o = { ...o, clip: side === 'port' ? [null, y0, x1, y1, cz] : side === 'star' ? [x0, y0, null, y1, cz] : [x0, null, x1, y1, cz] };
    }
    GFX.sprite(H[v * 4 + i], 0, S.x, S.y, S.z + 0.02, { ...o, unlit: true, scale, alpha: (1 - f) * fl * Math.min(1, h * 3) });
    GFX.sprite(H[v * 4 + i + 1], 0, S.x, S.y, S.z + 0.02, { ...o, unlit: true, scale, alpha: f * fl * Math.min(1, h * 3) });
    return;
  }
  const C = [[255, 244, 210], [255, 168, 64], [226, 74, 24], [120, 30, 12]], a = C[i], b = C[i + 1];
  const c = [0, 1, 2].map(j => Math.round(lerp(a[j], b[j], f))), R = L(scale * 0.7);
  const g = ctx.createRadialGradient(L(d.x), L(d.y), 0, L(d.x), L(d.y), R);
  g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.9 * fl * Math.min(1, h * 3)})`); g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(d.x), L(d.y), R, 0, TAU); ctx.fill();
}

// --- lights (js/lights.js gameLighting) -----------------------------------------------------------------
function hitFxLights(add) {
  for (const l of HITFX.lights) {
    const q = clamp(l.t / l.dur, 0, 1);
    add({ x: l.x, y: l.y, z: l.z, color: l.color, radius: l.radius * (0.7 + 0.3 * q), intensity: l.intensity * q * q });
  }
  // the hot hit spots light the hull round them, from white-orange down to a dull red
  const hot = combat.decals.filter(d => hitHeat(d) > 0.05).slice(-10);
  for (const d of hot) {
    const h = hitHeat(d), fl = 0.85 + 0.15 * noise1(time * 7 + d.seed), S = hitSurface(d.x, d.y);
    add({ x: S.x, y: S.y, z: S.z + 0.5, color: [1, 0.35 + 0.5 * h, 0.12 + 0.5 * h * h], radius: (d.r > 0.8 ? 4 : 2.4) * (0.6 + 0.4 * h), intensity: 1.8 * h * fl });
  }
  // the spark cloud: one light per busy cell
  const cells = new Map();
  for (const p of HITFX.parts) {
    if (p.k > 1) continue;
    const w = hfTemp(p), key = Math.floor(p.x / 2.5) * 1000 + Math.floor(p.y / 2.5);
    let c = cells.get(key); if (!c) cells.set(key, c = { x: 0, y: 0, z: 0, w: 0 });
    c.x += p.x * w; c.y += p.y * w; c.z += p.z * w; c.w += w;
  }
  [...cells.values()].filter(c => c.w > 1.5).sort((a, b) => b.w - a.w).slice(0, 8).forEach(c => {
    add({ x: c.x / c.w, y: c.y / c.w, z: Math.max(0.4, c.z / c.w), color: [1, 0.7, 0.35], radius: Math.min(5, 1.8 + c.w * 0.08), intensity: Math.min(2.2, c.w * 0.05) });
  });
}
