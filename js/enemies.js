// Enemy ships and asteroids: definitions, behavior and art.
// Enemies fly parallel to us, nose up. Enemy-local frame: -y is the nose, +x is the
// side facing our ship (mirrored for the starboard side), units are layout units.
// world = enemy position + rotate(rot) * (dir * lx, ly), dir = +1 on the port side, -1 on starboard.
//
// Weak parts are real components painted blue. Hits are tested against actual shapes:
// a shell is marched in small steps, and at each step weak parts are checked before hull.

const POI_COLOR = '#5fb4ff';
const BLUE = { base: '#3d8fe0', light: '#8fd0ff', dark: '#1f4f86', glow: 'rgba(110,190,255,' };
const L = (v) => v * T;

function enemyToWorld(e, lx, ly) {
  const [u, v] = rot(e.dir * lx, ly, e.rot);
  return [e.x + u, e.y + v];
}
function enemyToLocal(e, wx, wy) {
  const [u, v] = rot(wx - e.x, wy - e.y, -e.rot);
  return [u * e.dir, v];
}

// ---------------------------------------------------------------------------
// Shapes (local units) for hit tests: { poly }, { line, w } or { circle: [x, y, r] }
// ---------------------------------------------------------------------------
const box = (x0, y0, x1, y1) => ({ poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] });
function segDist(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, k = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - ax - dx * k, y - ay - dy * k);
}
// 0 inside the shape, otherwise the distance to it
function shapeDist(s, x, y) {
  if (s.circle) { const [cx, cy, r] = s.circle; return Math.max(0, Math.hypot(x - cx, y - cy) - r); }
  if (s.line) {
    let d = Infinity;
    for (let i = 1; i < s.line.length; i++) d = Math.min(d, segDist(x, y, ...s.line[i - 1], ...s.line[i]));
    return Math.max(0, d - s.w / 2);
  }
  if (pointInPoly(x, y, s.poly)) return 0;
  let d = Infinity;
  for (let i = 0, j = s.poly.length - 1; i < s.poly.length; j = i++) d = Math.min(d, segDist(x, y, ...s.poly[j], ...s.poly[i]));
  return d;
}
function shapeCenter(s) {
  if (s.circle) return [s.circle[0], s.circle[1]];
  const pts = s.line || s.poly;
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------
const INTERCEPTOR_HULL = [[0, -2.6], [0.45, -1.9], [0.58, -0.6], [1.5, 0.15], [1.5, 1.2], [0.62, 1.45], [0.45, 2.1],
                          [-0.45, 2.1], [-0.62, 1.45], [-1.5, 1.2], [-1.5, 0.15], [-0.58, -0.6], [-0.45, -1.9]];
const FRIGATE_HULL = [[0, -7.2], [1.1, -6.2], [1.9, -4], [2.3, -1], [2.6, 2], [2.6, 5], [2.0, 6.4], [-2.0, 6.4],
                      [-2.6, 5], [-2.6, 2], [-2.3, -1], [-1.9, -4], [-1.1, -6.2]];

const ENEMY_TYPES = {
  interceptor: {
    name: 'Interceptor', dist: 15, size: [2.4, 2.8], amp: [3.4, 4.2], omega: 0.55, wear: 5,
    sprites: (e, t) => interceptorSprites(e, t), flames: (e, t) => interceptorFlames(e, t),   // (the variants inherit these)
    fire: [2.5, 4], shotSpeed: 13, pivot: [1.0, -0.45], barrel: 1.45,
    solids: [{ poly: INTERCEPTOR_HULL }, box(1.42, -0.35, 2.02, 1.9), box(-2.02, -0.35, -1.42, 1.9), { circle: [1.0, -0.45, 0.28] },
             box(2.0, 0.0, 2.3, 1.6)],
    pois: [
      { id: 'cable', name: 'Weapon cable', effect: 'misfires every 2nd shot', shape: { line: [[0.5, -1.25], [0.82, -1.08], [0.98, -0.72]], w: 0.16 } },
      { id: 'cooling', name: 'Engine cooling', effect: 'barely moves', shape: box(2.02, 0.35, 2.3, 1.25) },
      { id: 'crack', name: 'Windshield crack', effect: 'no firing for 10 s', shape: { poly: [[0.12, -1.95], [0.36, -1.85], [0.44, -1.5], [0.4, -1.15], [0.24, -1.05], [0.14, -1.5]] } },
    ],
  },
  frigate: {
    name: 'Frigate', dist: 21, size: [3.6, 7.6], amp: [1.2, 1.7], omega: 0.22, wear: 8,
    sprites: (e, t) => frigateSprites(e, t), flames: (e, t) => frigateFlames(e, t),
    fire: [2.4, 3.4], shotSpeed: 12, pivot: [2.15, -3.65], barrel: 1.25, heavyMuzzle: [5.6, -0.2],
    solids: [{ poly: FRIGATE_HULL }, { circle: [2.15, -3.65, 0.45] }, box(2.5, 1.7, 3.2, 2.1), box(2.5, 3.4, 3.1, 3.8), box(-0.3, 6.3, 0.3, 6.6),
             box(2.2, -1.3, 3.3, 0.9), { circle: [3.55, 1.9, 0.55] }, box(3.0, 3.0, 3.85, 5.2), box(-0.95, 6.4, 0.95, 7.7)],
    pois: [
      { id: 'cable', name: 'Turret power cable', effect: 'turret misfires every 2nd shot', shape: { line: [[1.3, -5.7], [1.85, -5.15], [2.1, -4.2]], w: 0.2 } },
      { id: 'heavy', name: 'Heavy cannon coils', effect: 'no more heavy shots', shape: box(3.35, -0.68, 5.45, 0.28) },
      { id: 'dish', name: 'Shield emitter', effect: 'shield down for good', shape: { circle: [3.98, 1.9, 0.36] } },
      { id: 'aux', name: 'Side engine coolant', effect: 'moves less', shape: box(2.95, 3.85, 3.95, 4.75) },
      { id: 'main', name: 'Main engine coolant', effect: 'moves less', shape: box(-1.1, 6.8, 1.1, 7.3) },
    ],
  },
};
const HEAVY_CHARGE = 4, HEAVY_PERIOD = 18, SHIELD_PERIOD = 7, SHIELD_ON = 2.6, BLIND_TIME = 10;
const TURRET_TURN = 4, TURRET_ARC = 1.35;          // light turrets swing towards their target before firing

function makeEnemy(kind, side) {
  const D = ENEMY_TYPES[kind], dir = side === 'port' ? 1 : -1;
  const r = Math.random;
  const ax = side === 'port' ? -D.dist : SHIP_W + D.dist;
  return {
    uid: newUid(), kind, D, side, dir, ax, ay: 10 + (r() - 0.5) * 2, x: ax, y: 10, rot: 0, t: r() * 10,
    ph: [r() * TAU, r() * TAU, r() * TAU], ampMul: 1, omegaMul: 1, ampGoal: 1, omegaGoal: 1, ampV: 0, omegaV: 0,
    pois: D.pois.map(p => ({ ...p, hit: false, smoke: 0, c: shapeCenter(p.shape) })),
    fireT: 2 + r() * 2, shotCount: 0, blind: 0, phase: 'fighting', burnT: 0, turret: 0, target: null,
    heavyT: kind === 'frigate' ? 7 : Infinity, charge: -1, stopCharge: null,
    shieldT: 0, shieldUp: false, shieldFlash: 0, shieldHits: [], flash: 0, hullHits: 0,
  };
}
const poiHit = (e, id) => e.pois.find(p => p.id === id)?.hit;
const bubble = (e) => [e.D.size[0] + 1.4, e.D.size[1] + 1.2];   // shield bubble radii (local)

// ---------------------------------------------------------------------------
// Behavior
// ---------------------------------------------------------------------------
function updateEnemy(e, dt) {
  const D = e.D;
  // engine damage changes the sway goals; the actual values follow on a critically damped
  // spring, so position and velocity both change smoothly (no teleporting)
  const K = 1.1;
  e.ampV += ((e.ampGoal - e.ampMul) * K * K - 2 * K * e.ampV) * dt; e.ampMul += e.ampV * dt;
  e.omegaV += ((e.omegaGoal - e.omegaMul) * K * K - 2 * K * e.omegaV) * dt; e.omegaMul += e.omegaV * dt;
  e.t += dt * e.omegaMul;
  e.flash = Math.max(0, e.flash - dt * 4);
  e.shieldFlash = Math.max(0, e.shieldFlash - dt * 3);
  for (const h of e.shieldHits) h.t += dt;
  e.shieldHits = e.shieldHits.filter(h => h.t < 0.8);
  for (const p of e.pois) if (p.hit) p.smoke += dt;
  // sway: a loose figure eight around the anchor with random overtones; nose stays up
  const w = D.omega, [p1, p2, p3] = e.ph, A = D.amp[0] * e.ampMul, B = D.amp[1] * e.ampMul;
  const tx = e.ax + A * (0.8 * Math.sin(w * e.t) + 0.3 * Math.sin(2.3 * w * e.t + p1));
  const ty = e.ay + B * (0.75 * Math.sin(2 * w * e.t + p3) + 0.3 * Math.sin(1.37 * w * e.t + p2));
  if (e.phase === 'burning' && D.organic) {        // living things don't burn: they deflate, spewing slime
    e.burnT += dt;
    e.ax -= e.dir * dt * 0.6; e.ay += dt * 1.2;
    e.rot += dt * 0.35 * e.dir * Math.sin(e.burnT * 3);
    const k = Math.max(0, 1 - e.burnT / 3.5);
    if (Math.random() < 0.3 + 1.2 * k) {                  // thin jets of slime out of its torn organs
      const p = e.pois[Math.floor(Math.random() * e.pois.length)], [lx, ly] = p.c;
      const [fx, fy] = enemyToWorld(e, lx, ly), [ox, oy] = enemyToWorld(e, lx + 1, ly + (Math.random() - 0.5) * 0.8);
      const sp = 2 + Math.random() * 4 * k, dx = ox - fx, dy = oy - fy, d = Math.hypot(dx, dy) || 1;
      combatFx(fx, fy, dx / d * sp, dy / d * sp, 0.9 + Math.random() * 0.8, ['#9cff5a', '#6ad13a', '#c8ff6e'][Math.floor(Math.random() * 3)], 0.05 + Math.random() * 0.09);
    }
    if (e.burnT > 5) e.phase = 'gone';
    e.x = tx; e.y = ty;
    return;
  }
  if (e.phase === 'burning') {                     // fall behind on fire
    e.burnT += dt;
    const ease = Math.min(1, e.burnT / 1.5);       // speed up gradually
    e.ax -= e.dir * dt * 1.5 * ease; e.ay += dt * 3.5 * ease;
    e.rot += dt * 0.2 * e.dir;
    for (let i = 0; i < 2; i++) {
      const [fx, fy] = enemyToWorld(e, (Math.random() - 0.5) * D.size[0] * 1.4, (Math.random() - 0.5) * D.size[1] * 1.4);
      combatFx(fx, fy, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, 0.8, Math.random() < 0.5 ? '#ffb347' : '#e2574c', 0.25 + Math.random() * 0.3);
    }
    if (e.burnT > 5) e.phase = 'gone';
    e.x = tx; e.y = ty;
    return;
  }
  e.x = tx; e.y = ty; e.rot = 0.04 * Math.sin(w * e.t * 1.3 + p2);

  e.D.update?.(e, dt);
  if (e.D.noGun) return;
  // light gun: pick a target shortly before firing and swing the turret onto it
  if (e.blind > 0) e.blind -= dt;
  e.fireT -= dt;
  if (enc.flare?.phase === 'rad') e.fireT = Math.max(e.fireT, 0.8);   // solar flare: nobody can fire
  if (!e.target && e.fireT < 0.7 && e.blind <= 0) e.target = pickEnemyTarget(e);
  if (e.target?.atCrew) { const c = crew.find(c => c.id === e.target.crewId); if (c) { e.target.tx = c.x; e.target.ty = c.y; } }
  {
    let want = 0;
    if (e.target) {
      const [lx, ly] = enemyToLocal(e, e.target.tx, e.target.ty);
      want = clamp(Math.atan2(ly - D.pivot[1], lx - D.pivot[0]), -TURRET_ARC, TURRET_ARC);
    }
    e.turret += clamp(wrapAngle(want - e.turret), -TURRET_TURN * dt, TURRET_TURN * dt);
  }
  if (e.fireT <= 0) {
    e.fireT = D.fire[0] + Math.random() * (D.fire[1] - D.fire[0]);
    if (e.blind <= 0 && e.target) {
      e.shotCount++;
      const [mx, my] = enemyToWorld(e, D.pivot[0] + Math.cos(e.turret) * D.barrel, D.pivot[1] + Math.sin(e.turret) * D.barrel);
      if (poiHit(e, 'cable') && e.shotCount % 2 === 0) {        // damaged cable: fizzle
        for (let i = 0; i < 8; i++) combatFx(mx, my, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.3, '#ffe08a', 0.08);
        sfx.spark();
      } else { enemyFire(e, mx, my, false, e.target); e.reveal = Math.max(e.reveal || 0, 0.8); }
    }
    e.target = null;
  }

  if (e.kind === 'frigate') {
    // shield bubble comes up periodically until the emitter is shot
    e.shieldT = (e.shieldT + dt) % SHIELD_PERIOD;
    const was = e.shieldUp;
    e.shieldUp = !poiHit(e, 'dish') && e.shieldT < SHIELD_ON;
    if (e.shieldUp && !was) e.shieldFlash = 1;
    // heavy cannon: long audible charge, then a big shot
    if (!poiHit(e, 'heavy')) {
      if (e.charge < 0) {
        if (enc.flare?.phase !== 'rad') e.heavyT -= dt;
        if (e.heavyT <= 0) { e.charge = 0; e.stopCharge = sfx.charge(HEAVY_CHARGE); }
      } else {
        e.charge += dt;
        if (e.charge >= HEAVY_CHARGE) {
          const [mx, my] = enemyToWorld(e, ...D.heavyMuzzle);
          const ty = clamp(my, 3, 23);              // straight out of the barrel, broadside
          enemyFire(e, mx, my, true, { atCrew: false, tx: hullEdgeX(ty, e.side), ty });
          e.stopCharge?.(); e.charge = -1; e.heavyT = HEAVY_PERIOD;
        }
      }
    }
  }
}

// Would a shell on this segment touch this enemy (no side effects)? Used so ships flying in front of a
// backdrop (the spore mother) always get hit before it.
function shellTouches(e, x0, y0, x1, y1) {
  if (e.phase !== 'fighting') return false;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / SHELL_STEP));
  for (let i = 1; i <= n; i++) {
    const [lx, ly] = enemyToLocal(e, lerp(x0, x1, i / n), lerp(y0, y1, i / n));
    if (e.D.solids.some(s => shapeDist(s, lx, ly) === 0) || e.pois.some(p => shapeDist(p.shape, lx, ly) <= POI_TOLERANCE)) return true;
  }
  return false;
}
// A shell moved from (x0,y0) to (x1,y1). Returns true if this enemy stopped it.
const SHELL_STEP = 0.1, POI_TOLERANCE = 0.04;
function shellHitsEnemy(e, x0, y0, x1, y1) {
  if (e.phase !== 'fighting') return false;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / SHELL_STEP));
  const [bx, by] = bubble(e);
  for (let i = 1; i <= n; i++) {
    const wx = lerp(x0, x1, i / n), wy = lerp(y0, y1, i / n);
    const [lx, ly] = enemyToLocal(e, wx, wy);
    if (e.shieldUp && (lx / bx) ** 2 + (ly / by) ** 2 < 1) {      // the bubble eats it
      e.shieldFlash = 1; e.shieldHits.push({ x: lx, y: ly, t: 0 }); sfx.shieldBlock();
      for (let k = 0; k < 8; k++) combatFx(wx, wy, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.4, '#ff9ad0', 0.08);
      return true;
    }
    for (const p of e.pois) {
      if (!p.hit && !e.D.closed?.(e, p) && shapeDist(p.shape, lx, ly) <= POI_TOLERANCE) { hitPoi(e, p, ...enemyToWorld(e, ...p.c)); return true; }
    }
    if (e.D.solids.some(s => shapeDist(s, lx, ly) === 0) || e.pois.some(p => shapeDist(p.shape, lx, ly) === 0)) {
      for (let k = 0; k < 5; k++) combatFx(wx, wy, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.3, '#ffd28a', 0.08);
      e.flash = 0.6; sfx.clank();
      // enough plain hull hits shake something loose anyway (D.wear hits per broken part)
      if (++e.hullHits % e.D.wear === 0) {
        const left = e.pois.filter(p => !p.hit);
        const p = left[Math.floor(Math.random() * left.length)];
        if (p) { hitPoi(e, p, ...enemyToWorld(e, ...p.c)); combatBanner(`Hull damage knocked out the ${p.name.toLowerCase()}!`); }
      }
      return true;
    }
  }
  return false;
}

function hitPoi(e, p, px, py) {
  p.hit = true; e.flash = 1; sfx.poi();
  for (let i = 0; i < 16; i++) combatFx(px, py, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, 0.6, e.D.organic ? (i % 2 ? '#9cff5a' : '#6ad13a') : i % 2 ? '#ffb347' : POI_COLOR, e.D.organic ? 0.08 : 0.12);
  if (!e.D.organic) combatFlip(e.pois.every(q => q.hit) ? 'fx/explosion_l' : 'fx/hit_spark', px, py, e.pois.every(q => q.hit) ? 1 : 1.5);   // (destroyed: a big blast)
  if (p.id === 'crack') { e.blind = BLIND_TIME; e.target = null; }
  if (p.id === 'cable') e.shotCount = -1;           // the very next shot fizzles, then every second one
  if (p.id === 'cooling') { e.ampGoal = 0.25; e.omegaGoal = 0.6; }
  if (p.id === 'aux' || p.id === 'main') { e.ampGoal *= 0.45; e.omegaGoal *= 0.8; }
  if (p.id === 'heavy' && e.charge >= 0) { e.stopCharge?.(); e.charge = -1; }
  if (p.id === 'dish') e.shieldUp = false;
  e.D.onHit?.(e, p);
  if (e.pois.every(q => q.hit)) {
    e.phase = 'burning'; e.stopCharge?.(); e.charge = -1;
    if (e.D.organic) { sfx.squelch?.(); sfx.win(); combatBanner(`${e.D.name} is done for — it deflates, spewing slime`); }
    else { sfx.win(); combatBanner(`${e.D.name} destroyed!`); }
  }
}

// ---------------------------------------------------------------------------
// Asteroids (front): big ones have a glowing blue crack to hit and split in two;
// small ones are veined with blue and turn to dust on any hit.
// ---------------------------------------------------------------------------
function makeAsteroid(x, y, big, vx, vy) {
  const r = big ? 2.2 : 1.0, shapeSeed = 1000 + Math.floor(Math.random() * 9999);
  return {
    uid: newUid(), x, y, vx, vy, r, big, rot: Math.random() * TAU, vr: (Math.random() < 0.5 ? -1 : 1) * (big ? 0.55 + Math.random() * 0.4 : 0.8 + Math.random() * 0.8),   // always turning, so the crack comes around
    shapeSeed, shape: lumpShape(shapeSeed, big ? 11 : 8, 0.3),
    crackA: Math.random() * TAU, flash: 0, seed: Math.floor(Math.random() * 1000), damage: [],
  };
}
function spawnSwarmAsteroid() {
  const x = 6 + Math.random() * 32, tx = clamp(x + (Math.random() - 0.5) * 10, 8, 36);
  const y = -44, d = Math.hypot(tx - x, 0 - y), sp = 1.5 + Math.random() * 0.5;
  return makeAsteroid(x, y, true, (tx - x) / d * sp, -y / d * sp);
}
const crackPos = (a) => [a.x + Math.cos(a.rot + a.crackA) * a.r * 0.72, a.y + Math.sin(a.rot + a.crackA) * a.r * 0.72];

// ---------------------------------------------------------------------------
// Hexagon energy shields (shared by enemy bubbles and our side shields)
// ---------------------------------------------------------------------------
function hexPath(cx, cy, r) {
  ctx.moveTo(cx + r, cy);
  for (let i = 1; i < 6; i++) ctx.lineTo(cx + Math.cos(i * Math.PI / 3) * r, cy + Math.sin(i * Math.PI / 3) * r);
  ctx.closePath();
}
// Draws hex cells (layout units, current transform) wherever inside(x, y) gives 0..1.
// hits: [{x, y, t}] impact points that light up nearby cells and ripple outward.
function drawHexField(x0, y0, x1, y1, size, inside, rgb, alpha, hits) {
  const w = size * 1.5, h = size * Math.sqrt(3);
  for (let col = 0, x = x0; x <= x1; col++, x += w) {
    for (let y = y0 + (col % 2 ? h / 2 : 0); y <= y1; y += h) {
      const k = inside(x, y);
      if (k <= 0) continue;
      let boost = 0;
      for (const ht of hits) {
        const d = Math.hypot(x - ht.x, y - ht.y), ring = Math.abs(d - ht.t * 4);
        boost += Math.max(0, 1 - d / 2.2) * (1 - ht.t / 0.8) * 1.6 + Math.max(0, 1 - ring / 0.5) * (1 - ht.t / 0.8) * 0.8;
      }
      const a = clamp(alpha * k + boost * 0.6, 0, 1);
      ctx.beginPath(); hexPath(L(x), L(y), L(size) * 0.9);
      ctx.fillStyle = `rgba(${rgb},${a * 0.25})`; ctx.fill();
      ctx.strokeStyle = `rgba(${rgb},${Math.min(1, a * 1.1)})`; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
// Art helpers (local units → px via L)
// ---------------------------------------------------------------------------
const LP = (pts) => pts.map(([x, y]) => [L(x), L(y)]);
function drawSmoke(px, py, k, t) {
  for (let i = 0; i < 3; i++) {
    const q = (t * 0.6 + i / 3) % 1;
    ctx.beginPath(); ctx.arc(px + Math.sin(t + i) * 4, py - q * L(1.2), L(0.15 + q * 0.3), 0, TAU);
    ctx.fillStyle = `rgba(60,60,66,${0.45 * (1 - q)})`; ctx.fill();
  }
}
function hullFill(pts, c0, c1) {
  poly(LP(pts));
  const ys = pts.map(p => p[1]);
  const g = ctx.createLinearGradient(L(-3), L(Math.min(...ys)), L(3), L(Math.max(...ys)));
  g.addColorStop(0, c0); g.addColorStop(1, c1);
  ctx.fillStyle = g; ctx.fill(); stroke(3);
}
function flameDown(x, y, len, w, t) {            // exhaust pointing +y (backwards)
  const f = 1 + 0.12 * Math.sin(t * 29 + x * 7);
  const g = ctx.createRadialGradient(L(x), L(y), 1, L(x), L(y), L(len) * f);
  g.addColorStop(0, 'rgba(255,240,200,0.95)'); g.addColorStop(0.3, 'rgba(255,150,60,0.75)'); g.addColorStop(1, 'rgba(220,60,40,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(L(x), L(y + len * 0.45), L(w), L(len * 0.55) * f, 0, 0, TAU); ctx.fill();
}
function panelLines(lines, a = 0.28) {
  ctx.strokeStyle = `rgba(0,0,0,${a})`; ctx.lineWidth = 1.5;
  for (const [ax, ay, bx, by] of lines) { ctx.beginPath(); ctx.moveTo(L(ax), L(ay)); ctx.lineTo(L(bx), L(by)); ctx.stroke(); }
}
function rivetsAt(pts) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (const [x, y] of pts) ctx.fillRect(L(x) - 1.2, L(y) - 1.2, 2.4, 2.4); }
function navLight(x, y, col, t) {
  ctx.beginPath(); ctx.arc(L(x), L(y), 3, 0, TAU); ctx.fillStyle = col; ctx.fill(); stroke(1);
  const g = ctx.createRadialGradient(L(x), L(y), 0, L(x), L(y), 10);
  g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.4; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(x), L(y), 10, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
}
// Blue "weak part" paint: gradient + soft pulsing glow, or scorched when broken.
function bluePaint(x0, y0, x1, y1, t, broken) {
  if (broken) return '#2a2a2e';
  const g = ctx.createLinearGradient(L(x0), L(y0), L(x1), L(y1));
  g.addColorStop(0, BLUE.light); g.addColorStop(0.5, BLUE.base); g.addColorStop(1, BLUE.dark);
  return g;
}
function blueGlow(x, y, r, t) {
  const a = 0.25 + 0.12 * Math.sin(t * 2.4 + x);
  const g = ctx.createRadialGradient(L(x), L(y), 0, L(x), L(y), L(r));
  g.addColorStop(0, BLUE.glow + a + ')'); g.addColorStop(1, BLUE.glow + '0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(x), L(y), L(r), 0, TAU); ctx.fill();
}
function lavaGlow(x, y, r, t) {                  // warm glow for hot asteroid cracks
  const a = 0.35 + 0.12 * Math.sin(t * 2.4 + x);
  const g = ctx.createRadialGradient(L(x), L(y), 0, L(x), L(y), L(r));
  g.addColorStop(0, `rgba(255,140,50,${a})`); g.addColorStop(1, 'rgba(255,140,50,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(x), L(y), L(r), 0, TAU); ctx.fill();
}
function sparkBurst(x, y, t, seed) {
  const r = rng(seed + Math.floor(t * 7));
  if (r() > 0.3) return;
  ctx.strokeStyle = 'rgba(255,220,120,0.9)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const a = r() * TAU, l = 4 + r() * 8;
    ctx.beginPath(); ctx.moveTo(L(x), L(y)); ctx.lineTo(L(x) + Math.cos(a) * l, L(y) + Math.sin(a) * l); ctx.stroke();
  }
}
// Thick cable along a local polyline; blue and braided when intact, cut and sparking when broken.
function blueCable(pts, w, t, broken, seed) {
  const path = () => { ctx.beginPath(); ctx.moveTo(L(pts[0][0]), L(pts[0][1])); for (let i = 1; i < pts.length; i++) ctx.lineTo(L(pts[i][0]), L(pts[i][1])); };
  if (!broken) { blueGlow(...shapeCenter({ line: pts }), w * 3, t); }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  path(); ctx.strokeStyle = OUT; ctx.lineWidth = L(w) + 4; ctx.stroke();
  if (broken) {                                   // two loose ends
    const m = Math.floor(pts.length / 2);
    for (const part of [pts.slice(0, m + 1), pts.slice(m)]) {
      const q = part === pts ? pts : part;
      ctx.beginPath(); ctx.moveTo(L(q[0][0]), L(q[0][1])); for (let i = 1; i < q.length; i++) ctx.lineTo(L(q[i][0]), L(q[i][1]));
      ctx.strokeStyle = '#3a3a40'; ctx.lineWidth = L(w); ctx.stroke();
    }
    sparkBurst(pts[m][0], pts[m][1], t, seed);
    return;
  }
  path(); ctx.strokeStyle = BLUE.base; ctx.lineWidth = L(w); ctx.stroke();
  ctx.setLineDash([4, 5]); ctx.lineDashOffset = -t * 12;               // energy flowing through
  path(); ctx.strokeStyle = BLUE.light; ctx.lineWidth = L(w) * 0.35; ctx.stroke(); ctx.setLineDash([]);
  for (const p of [pts[0], pts[pts.length - 1]]) {                     // connectors
    rr(L(p[0]) - 5, L(p[1]) - 5, 10, 10, 2); ctx.fillStyle = '#9aa3b5'; ctx.fill(); stroke(1.5);
  }
}

// ---------------------------------------------------------------------------
// Interceptor: small twin-nacelle dart. Near side (+x) carries the gun, its blue power
// cable and the blue coolant radiator on the engine nacelle. Canopy glass is blue-tinted.
// ---------------------------------------------------------------------------
function drawInterceptor(e, t) {
  interceptorFlames(e, t);
  // wings + fuselage
  const P0 = e.D.paint || { hull: ['#8a4a44', '#4a2626'], stripe: '#c0392b', pod: ['#6a6f7a', '#3a3f4a'] };   // (variants repaint it)
  hullFill(INTERCEPTOR_HULL, ...P0.hull);
  panelLines([[0, -2.4, 0, 2.0], [-0.58, -0.6, 0.58, -0.6], [-0.6, 0.6, 0.6, 0.6], [0.58, -0.3, 1.45, 0.4], [-0.58, -0.3, -1.45, 0.4], [-0.6, 1.4, 0.6, 1.4]]);
  for (const s of [-1, 1]) {                       // red wing stripes
    poly(LP([[s * 0.75, -0.25], [s * 1.45, 0.3], [s * 1.45, 0.5], [s * 0.75, -0.05]])); ctx.fillStyle = P0.stripe; ctx.fill();
  }
  for (const x of [-0.3, -0.15, 0.15, 0.3]) { rr(L(x) - 1.5, L(0.8), 3, L(0.5), 1); ctx.fillStyle = '#1c1f25'; ctx.fill(); }   // vents
  rivetsAt([[0.3, -0.3], [-0.3, -0.3], [0.4, 1.2], [-0.4, 1.2], [1.1, 0.7], [-1.1, 0.7]]);
  // nacelles
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? 1.42 : -2.02;
    rr(L(x0), L(-0.35), L(0.6), L(2.25), 10);
    const g = ctx.createLinearGradient(L(x0), 0, L(x0 + 0.6), 0);
    g.addColorStop(0, P0.pod[0]); g.addColorStop(1, P0.pod[1]);
    ctx.fillStyle = g; ctx.fill(); stroke(2.5);
    ctx.beginPath(); ctx.arc(L(x0 + 0.3), L(-0.15), L(0.2), 0, TAU); ctx.fillStyle = '#14161b'; ctx.fill(); stroke(1.5);   // intake
    panelLines([[x0, 0.5, x0 + 0.6, 0.5], [x0, 1.2, x0 + 0.6, 1.2]]);
    navLight(x0 + 0.3, -0.45, s > 0 ? '#5aff8a' : '#ff5a4a', t);
  }
  // coolant radiator on the near nacelle (weak part)
  const cool = poiHit(e, 'cooling');
  rr(L(2.0), L(0.0), L(0.3), L(1.6), 4); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(2);          // radiator housing
  if (!cool) blueGlow(2.16, 0.8, 0.8, t);
  rr(L(2.02), L(0.35), L(0.28), L(0.9), 3); ctx.fillStyle = bluePaint(2.02, 0.35, 2.3, 1.25, t, cool); ctx.fill(); stroke(1.5);
  ctx.strokeStyle = cool ? 'rgba(0,0,0,0.5)' : 'rgba(10,30,60,0.6)'; ctx.lineWidth = 1.5;
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(L(2.04), L(0.35 + i * 0.15)); ctx.lineTo(L(2.28), L(0.35 + i * 0.15)); ctx.stroke(); }
  if (cool) {                                      // venting coolant
    for (let i = 0; i < 3; i++) {
      const q = (t * 1.2 + i / 3) % 1;
      ctx.beginPath(); ctx.arc(L(2.4 + q * 1.2), L(0.8 + Math.sin(i * 3) * 0.4), L(0.1 + q * 0.25), 0, TAU);
      ctx.fillStyle = `rgba(200,230,255,${0.5 * (1 - q)})`; ctx.fill();
    }
  } else {
    ctx.strokeStyle = BLUE.light; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(L(2.16), L(0.4)); ctx.lineTo(L(2.16), L(0.4 + 0.8 * ((t * 0.5) % 1))); ctx.stroke();
  }
  // gun turret on the near wing, barrel pointing at us
  ctx.save(); ctx.translate(L(1.0), L(-0.45)); ctx.rotate(e.turret);
  rr(0, L(-0.1), L(1.4), L(0.2), 3); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(2);
  rr(L(1.25), L(-0.15), L(0.18), L(0.3), 2); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(1.5);
  ctx.restore();
  ctx.beginPath(); ctx.arc(L(1.0), L(-0.45), L(0.28), 0, TAU); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(2);
  ctx.beginPath(); ctx.arc(L(1.0), L(-0.45), L(0.12), 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill();
  // weapon power cable (weak part)
  blueCable(e.D.pois[0].shape.line, 0.14, t, poiHit(e, 'cable'), 41);
  // canopy (weak part: blue glass with a crack)
  if (poiHit(e, 'crack')) drawWindshieldRepair(e, t);
  else {
    ctx.beginPath(); ctx.ellipse(0, L(-1.5), L(0.44), L(0.72), 0, 0, TAU);            // dark tinted canopy glass
    const g = ctx.createLinearGradient(L(-0.4), L(-2.2), L(0.4), L(-0.8));
    g.addColorStop(0, '#6a7480'); g.addColorStop(1, '#262c34');
    ctx.fillStyle = g; ctx.fill(); stroke(2.5);
    blueGlow(0.28, -1.5, 0.55, t);                 // the cracked patch, glowing blue
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, L(-1.5), L(0.44), L(0.72), 0, 0, TAU); ctx.clip();
    poly(LP(e.D.pois[2].shape.poly)); ctx.fillStyle = 'rgba(80,160,255,0.55)'; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(L(-0.44), L(-1.5)); ctx.lineTo(L(0.44), L(-1.5)); ctx.strokeStyle = 'rgba(20,22,27,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(L(-0.12), L(-1.85), L(0.08), L(0.25), 0.3, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
    ctx.beginPath();                               // the crack, on the side facing us
    ctx.moveTo(L(0.1), L(-1.95)); ctx.lineTo(L(0.22), L(-1.7)); ctx.lineTo(L(0.15), L(-1.5)); ctx.lineTo(L(0.34), L(-1.3)); ctx.lineTo(L(0.28), L(-1.1));
    ctx.moveTo(L(0.22), L(-1.7)); ctx.lineTo(L(0.4), L(-1.75));
    ctx.strokeStyle = BLUE.light; ctx.lineWidth = 2.5; ctx.stroke();
  }
}

// Shot-out canopy: a jagged hole venting air while the pilot duct-tapes it shut,
// strip by strip, over BLIND_TIME seconds (no firing meanwhile).
const TAPE_STRIPS = [[0.1, 0.4, 1], [0.3, -0.5, 2], [0.5, 1.57, 3], [0.7, 0.9, 4], [0.88, -1.0, 5]];
function drawWindshieldRepair(e, t, glass = true) {   // glass = false: only the tape and the air (over the sprite's hole)
  const hx = L(0.15), hy = L(-1.5), k = clamp(1 - e.blind / BLIND_TIME, 0, 1);
  if (glass) {
    ctx.beginPath(); ctx.ellipse(0, L(-1.5), L(0.44), L(0.72), 0, 0, TAU);
    ctx.fillStyle = '#2d5f82'; ctx.fill(); stroke(2.5);
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, L(-1.5), L(0.44), L(0.72), 0, 0, TAU); ctx.clip();
    poly(Array.from({ length: 9 }, (_, i) => {                       // jagged hole
      const a = i / 9 * TAU, r = L(0.3) * (i % 2 ? 0.6 : 1);
      return [hx + Math.cos(a) * r * 0.8, hy + Math.sin(a) * r];
    }));
    ctx.fillStyle = '#080b14'; ctx.fill(); stroke(1.5, 'rgba(255,255,255,0.7)');
    ctx.restore();
  }
  if (k < 1) {                                                       // air whooshing out
    for (let i = 0; i < 4; i++) {
      const q = (t * 1.8 + i / 4) % 1, a = -0.3 + Math.sin(i * 2.3) * 0.5;
      ctx.beginPath(); ctx.arc(hx + Math.cos(a) * q * L(1.6), hy + Math.sin(a) * q * L(1.6), L(0.08 + q * 0.18), 0, TAU);
      ctx.fillStyle = `rgba(230,240,250,${0.55 * (1 - q) * (1 - k)})`; ctx.fill();
    }
  }
  ctx.save(); ctx.translate(hx, hy); ctx.scale(1.2, 1.2);
  for (const [at, a, seed] of TAPE_STRIPS) if (k >= at) tapeStrip(0, 0, L(0.6), a, 900 + seed);
  ctx.restore();
  if (k < 1) {                                                       // tape roll sweeping across
    const sw = Math.sin(t * 5) * L(0.25);
    const [ux, uy] = [Math.cos(0.4 + k * 3) * sw, Math.sin(0.4 + k * 3) * sw];
    ctx.beginPath(); ctx.arc(hx + ux, hy + uy, 7, 0, TAU); ctx.fillStyle = '#b2b8c0'; ctx.fill(); stroke(1.8);
    ctx.beginPath(); ctx.arc(hx + ux, hy + uy, 3, 0, TAU); ctx.fillStyle = '#c9a46a'; ctx.fill();
  }
}

// Status tag above an enemy (not mirrored): currently the windshield repair countdown.
function drawEnemyTag(e) {
  if (e.kind !== 'interceptor' || !poiHit(e, 'crack') || e.blind <= 0) return;
  const x = L(e.x), y = L(e.y - e.D.size[1] - 1.0), k = 1 - e.blind / BLIND_TIME;
  const text = `DUCT-TAPING WINDSHIELD — ${Math.ceil(e.blind)} s`;
  ctx.font = `800 ${T * 0.34}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 24;
  rr(x - w / 2, y - 16, w, 40, 8); ctx.fillStyle = 'rgba(12,14,20,0.8)'; ctx.fill(); stroke(1.5, '#b2b8c0');
  ctx.fillStyle = '#e8ecf4'; ctx.fillText(text, x, y - 2);
  rr(x - w / 2 + 10, y + 13, w - 20, 6, 3); ctx.fillStyle = '#2b303a'; ctx.fill();
  rr(x - w / 2 + 10, y + 13, (w - 20) * k, 6, 3); ctx.fillStyle = '#b2b8c0'; ctx.fill();
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Frigate: long armored hull. Near side (+x): light turret with its blue power cable,
// broadside heavy cannon with blue capacitor coils, blue shield emitter on a pylon,
// side engine with blue coolant jacket; the main engine at the stern has one too.
// ---------------------------------------------------------------------------
function drawFrigate(e, t) {
  frigateFlames(e, t);
  hullFill(FRIGATE_HULL, '#7a5c64', '#3a2a30');
  ctx.save(); poly(LP(FRIGATE_HULL)); ctx.clip();
  // armor plates
  panelLines([[-3, -4, 3, -4], [-3, -1, 3, -1], [-3, 2, 3, 2], [-3, 5, 3, 5], [0, -7, 0, -4.6], [0, -2.6, 0, 6.4],
              [-1.4, -1, -1.4, 6.4], [1.4, -1, 1.4, 6.4]], 0.3);
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(L(-1.4), L(2), L(2.8), L(3));
  for (const s of [-1, 1]) {                       // red edge stripes
    ctx.fillStyle = '#a8342a'; poly(LP([[s * 2.05, -1], [s * 2.35, -1], [s * 2.6, 2], [s * 2.3, 2]])); ctx.fill();
  }
  ctx.restore();
  // far-side hangar door and decorative turrets
  rr(L(-2.2), L(2.5), L(1.0), L(2.0), 3); ctx.fillStyle = '#2b2226'; ctx.fill(); stroke(2);
  hazardStripe(L(-2.15), L(2.55), L(0.9), L(0.16));
  for (const y of [-2.2, 0.6]) {
    ctx.beginPath(); ctx.arc(L(-1.75), L(y), L(0.3), 0, TAU); ctx.fillStyle = '#5a5054'; ctx.fill(); stroke(1.8);
    rr(L(-2.6), L(y - 0.07), L(0.85), L(0.14), 2); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(1.2);
  }
  // vents
  for (let i = 0; i < 5; i++) { rr(L(-0.9 + i * 0.4), L(5.4), L(0.22), L(0.6), 2); ctx.fillStyle = '#1c1f25'; ctx.fill(); }
  // bridge tower with lit windows, antenna at the nose
  rr(L(-0.95), L(-4.7), L(1.9), L(2.2), 6); ctx.fillStyle = '#8a6c74'; ctx.fill(); stroke(2.5);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { rr(L(-0.75 + c * 0.42), L(-4.4 + r * 0.45), L(0.26), L(0.2), 2); ctx.fillStyle = '#ffd38a'; ctx.fill(); stroke(1); }
  ctx.beginPath(); ctx.arc(L(0), L(-3.1), L(0.3), 0, TAU); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(1.5);   // radar
  ctx.beginPath(); ctx.moveTo(0, L(-3.1)); ctx.lineTo(L(Math.cos(t) * 0.3), L(-3.1 + Math.sin(t) * 0.3)); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, L(-7.2)); ctx.lineTo(0, L(-8.0)); ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.stroke();
  navLight(0, -8.0, '#ff5a4a', t);
  rivetsAt([[0.6, -6], [-0.6, -6], [1.2, -3.4], [-1.2, -3.4], [1.8, 0.4], [-1.8, 0.4], [2.2, 4], [-2.2, 4], [1, 6], [-1, 6]]);

  // light turret (near front) + its power cable (weak part)
  ctx.save(); ctx.translate(L(2.15), L(-3.65)); ctx.rotate(e.turret);
  rr(0, L(-0.1), L(1.25), L(0.2), 3); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.8);
  ctx.restore();
  ctx.beginPath(); ctx.arc(L(2.15), L(-3.65), L(0.45), 0, TAU); ctx.fillStyle = '#6a6f7a'; ctx.fill(); stroke(2.2);
  ctx.beginPath(); ctx.arc(L(2.15), L(-3.65), L(0.2), 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill();
  blueCable(e.D.pois[0].shape.line, 0.18, t, poiHit(e, 'cable'), 51);

  // heavy broadside cannon (weak part: blue capacitor coils)
  const hv = poiHit(e, 'heavy');
  if (!hv) blueGlow(4.3, -0.2, 1.3, t);
  rr(L(2.2), L(-1.3), L(1.1), L(2.2), 6); ctx.fillStyle = hv ? '#2a2a2e' : '#4a515e'; ctx.fill(); stroke(3);
  rr(L(3.3), L(-0.55), L(2.1), L(0.7), 4); ctx.fillStyle = hv ? '#2a2a2e' : '#3a3f4a'; ctx.fill(); stroke(2.5);
  for (let i = 0; i < 5; i++) {                    // capacitor coils wrapped along the whole barrel
    rr(L(3.42 + i * 0.42), L(-0.68), L(0.24), L(0.96), 3);
    ctx.fillStyle = bluePaint(0, -0.7, 0, 0.3, t, hv); ctx.fill(); stroke(1.8);
  }
  rr(L(2.35), L(-1.15), L(0.8), L(1.9), 4); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(1.8);     // breech, armored
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(L(2.4), L(-1.15 + i * 0.32)); ctx.lineTo(L(3.1), L(-1.15 + i * 0.32)); ctx.stroke(); }
  if (hv) { sparkBurst(3.0, -0.2, t, 61); }
  if (e.charge >= 0) {                             // charge builds up at the muzzle
    const k = e.charge / HEAVY_CHARGE, r = L(0.3 + k * 1.1);
    const g = ctx.createRadialGradient(L(5.6), L(-0.2), 0, L(5.6), L(-0.2), r);
    g.addColorStop(0, `rgba(255,255,240,${0.6 + 0.4 * k})`); g.addColorStop(0.4, `rgba(255,120,200,${0.5 + 0.3 * k})`); g.addColorStop(1, 'rgba(255,60,160,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(5.6), L(-0.2), r, 0, TAU); ctx.fill();
    for (let i = 0; i < 5; i++) {                  // energy crawling along the coils
      ctx.fillStyle = `rgba(255,170,230,${k})`; ctx.fillRect(L(3.42 + i * 0.42), L(-0.68), L(0.24), L(0.96) * ((t * 3 + i * 0.25) % 1));
    }
  }

  // shield emitter on a pylon (weak part)
  const sd = poiHit(e, 'dish');
  rr(L(2.5), L(1.7), L(0.8), L(0.4), 2); ctx.fillStyle = '#5a5054'; ctx.fill(); stroke(2);
  ctx.beginPath(); ctx.arc(L(3.55), L(1.9), L(0.55), 0, TAU); ctx.fillStyle = '#9aa3b5'; ctx.fill(); stroke(2.5);   // dish frame
  ctx.beginPath(); ctx.arc(L(3.55), L(1.9), L(0.4), 0, TAU); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5; ctx.stroke();
  if (!sd) blueGlow(3.98, 1.9, 0.8 + (e.shieldUp ? 0.5 : 0), t);
  ctx.beginPath(); ctx.arc(L(3.98), L(1.9), L(0.36), 0, TAU); ctx.fillStyle = bluePaint(3.65, 1.55, 4.3, 2.25, t, sd); ctx.fill(); stroke(2);
  for (const r of [0.24, 0.12]) { ctx.beginPath(); ctx.arc(L(3.98), L(1.9), L(r), 0, TAU); ctx.strokeStyle = sd ? 'rgba(0,0,0,0.4)' : 'rgba(10,30,60,0.55)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(L(3.98), L(1.9), 4, 0, TAU); ctx.fillStyle = sd ? '#444' : (e.shieldUp ? '#ffffff' : BLUE.light); ctx.fill();
  if (sd) sparkBurst(3.98, 1.9, t, 71);

  // side engine on a pylon (weak part: blue coolant jacket)
  const ax = poiHit(e, 'aux');
  rr(L(2.5), L(3.4), L(0.6), L(0.4), 2); ctx.fillStyle = '#5a5054'; ctx.fill(); stroke(2);
  rr(L(3.0), L(3.0), L(0.85), L(2.2), 10);
  const ng = ctx.createLinearGradient(L(3.0), 0, L(3.85), 0); ng.addColorStop(0, '#6a6f7a'); ng.addColorStop(1, '#3a3f4a');
  ctx.fillStyle = ng; ctx.fill(); stroke(2.5);
  ctx.beginPath(); ctx.arc(L(3.42), L(3.25), L(0.22), 0, TAU); ctx.fillStyle = '#14161b'; ctx.fill(); stroke(1.5);
  if (!ax) blueGlow(3.42, 4.3, 0.9, t);
  rr(L(2.95), L(3.85), L(1.0), L(0.9), 3); ctx.fillStyle = bluePaint(2.95, 3.85, 3.95, 4.75, t, ax); ctx.fill(); stroke(2);   // coolant jacket
  ctx.strokeStyle = ax ? 'rgba(0,0,0,0.4)' : 'rgba(10,30,60,0.55)'; ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(L(3.02), L(3.85 + i * 0.225)); ctx.lineTo(L(3.83), L(3.85 + i * 0.225)); ctx.stroke(); }
  if (ax) sparkBurst(3.42, 4.3, t, 75);

  // main engine at the stern (weak part: blue coolant ring)
  const mn = poiHit(e, 'main');
  rr(L(-0.95), L(6.4), L(1.9), L(1.3), 8); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(2.5);
  if (!mn) blueGlow(0, 7.02, 1.0, t);
  rr(L(-1.1), L(6.8), L(2.2), L(0.5), 3); ctx.fillStyle = bluePaint(-1.1, 6.8, 1.1, 7.3, t, mn); ctx.fill(); stroke(2);   // coolant ring
  rr(L(-0.6), L(6.55), L(1.2), L(0.2), 3); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.2);
  if (mn) sparkBurst(0, 7.0, t, 81);
}

// Enemy shield bubble: hex cells on an elliptical shell, impacts flare and ripple.
function drawEnemyShield(e) {
  if (!e.shieldUp && e.shieldFlash <= 0) return;
  const [bx, by] = bubble(e), a = e.shieldUp ? 0.35 + 0.4 * e.shieldFlash : 0.5 * e.shieldFlash;
  ctx.beginPath(); ctx.ellipse(0, 0, L(bx), L(by), 0, 0, TAU);
  ctx.fillStyle = `rgba(255,120,200,${a * 0.12})`; ctx.fill();
  drawHexField(-bx, -by, bx, by, 0.5, (x, y) => {
    const r = Math.sqrt((x / bx) ** 2 + (y / by) ** 2);
    return r > 1 ? 0 : clamp((r - 0.55) / 0.45, 0, 1);
  }, '255,140,210', a, e.shieldHits);
  ctx.beginPath(); ctx.ellipse(0, 0, L(bx), L(by), 0, 0, TAU);
  ctx.strokeStyle = `rgba(255,170,225,${Math.min(1, a * 1.6)})`; ctx.lineWidth = 3; ctx.stroke();
}

function drawEnemy(e, t) {
  if (GFX.on && drawEnemySprite(e, t)) return;      // (its overlays come later, on top: drawEnemyOverlay)
  ctx.save();
  if (e.phase === 'burning') ctx.globalAlpha = clamp(1 - (e.burnT - 3) / 2, 0, 1);
  if (e.D.stealth) ctx.globalAlpha *= stealthAlpha(e);                // cloaked: only shows after a radar ping or when it fires
  ctx.translate(L(e.x), L(e.y)); ctx.rotate(e.rot); ctx.scale(e.dir, 1);
  if (e.phase === 'burning' && e.D.organic) {           // deflating: it shrinks and sags, wobbling
    const k = Math.min(1, e.burnT / 3.5), w = Math.sin(e.burnT * 9) * 0.06 * (1 - k);
    ctx.scale(1 - 0.45 * k + w, 1 - 0.3 * k - w);
  }
  shadowEllipse(L(0.5), L(0.7), L(e.D.size[0]), L(e.D.size[1]), 0.22);
  if (e.D.draw) e.D.draw(e, t); else if (e.kind === 'interceptor') drawInterceptor(e, t); else drawFrigate(e, t);
  if (e.flash > 0) {                              // hit flash
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,200,150,${e.flash * 0.2})`;
    ctx.beginPath(); ctx.ellipse(0, 0, L(e.D.size[0]), L(e.D.size[1]), 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  for (const p of e.pois) if (p.hit && p.id !== 'crack' && !e.D.organic) drawSmoke(L(p.c[0]), L(p.c[1]), p.smoke, t + p.c[0]);
  drawEnemyShield(e);
  ctx.restore();
  if (e.phase === 'fighting' && (!e.D.stealth || stealthAlpha(e) > 0.3)) drawEnemyTag(e);
  e.D.drawExtra?.(e, t);
}

function drawAsteroidBody(a, t) {
  if (GFX.on && drawAsteroidSprite(a, t)) return;
  shadowEllipse(L(a.x) + 6, L(a.y) + 8, L(a.r) * 0.95, L(a.r) * 0.8, 0.25);
  drawLump(a.shape, L(a.x), L(a.y), L(a.r), a.rot, a.big ? ['#8d8274', '#6e6359', '#4c433c'] : ['#9a8e80', '#776b5f', '#544a40'], true);
  ctx.save(); ctx.translate(L(a.x), L(a.y)); ctx.rotate(a.rot);
  // damage cracks from plain hits, growing from where the shells landed
  a.damage.forEach((ang, i) => {
    const r = rng(a.seed + i * 13);
    ctx.beginPath(); ctx.moveTo(L(Math.cos(ang) * a.r * 0.85), L(Math.sin(ang) * a.r * 0.85));
    let x = Math.cos(ang) * a.r * 0.85, y = Math.sin(ang) * a.r * 0.85;
    for (let k = 0; k < 4; k++) {
      const q = ang + Math.PI + (r() - 0.5) * 1.2, l = a.r * (0.15 + r() * 0.15);
      x += Math.cos(q) * l; y += Math.sin(q) * l; ctx.lineTo(L(x), L(y));
    }
    ctx.strokeStyle = '#1a1614'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,60,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
  });
  if (a.big) {                                    // one molten, glowing fissure: hit it to split the rock
    ctx.rotate(a.crackA);
    const cx = a.r * 0.72;
    lavaGlow(cx, 0, 0.9, t);
    ctx.beginPath(); ctx.moveTo(L(cx - 0.55), L(-0.1)); ctx.lineTo(L(cx - 0.2), L(0.12)); ctx.lineTo(L(cx), L(-0.15)); ctx.lineTo(L(cx + 0.25), L(0.1)); ctx.lineTo(L(cx + 0.5), L(-0.05));
    ctx.strokeStyle = '#1a1614'; ctx.lineWidth = 13; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = '#e8601c'; ctx.lineWidth = 8; ctx.stroke();
    ctx.strokeStyle = `rgba(255,${210 + 30 * Math.sin(t * 3) | 0},120,1)`; ctx.lineWidth = 3; ctx.stroke();
  } else {                                        // small rocks: shot through with hot cracks
    const r = rng(a.seed);
    lavaGlow(0, 0, a.r * 1.2, t);
    for (let i = 0; i < 3; i++) {
      const ang = r() * TAU, l = a.r * 0.8;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(L(Math.cos(ang) * l * 0.5 + 0.1), L(Math.sin(ang) * l * 0.5)); ctx.lineTo(L(Math.cos(ang) * l), L(Math.sin(ang) * l));
      ctx.strokeStyle = '#1a1614'; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = '#ffb24a'; ctx.lineWidth = 2; ctx.stroke();
    }
  }
  ctx.restore();
  if (a.flash > 0) {
    ctx.save(); ctx.globalAlpha = a.flash * 0.6; ctx.globalCompositeOperation = 'lighter';
    drawLump(a.shape, L(a.x), L(a.y), L(a.r), a.rot, ['#ffd9a0', '#c08050', '#603020'], false);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Sprites (GFX.on; tools/blender/models/enemy/*.py and organic/*.py document them). An enemy is its hull
// sprite, one sprite per weak spot (ok / hit / ...) and its turret, all on the enemy's origin: D.sprites(e, t)
// lists them as { n: name, f: frame, at: [lx, ly] (own origin, enemy-local) | x, y (world), scale, rot, sx,
// alpha, emissive }. The weak spots were rendered so they project exactly onto the game's shapes at z = 0, so
// what you see is what the flat hit tests hit. Layer 'under': below the hull, which only ever overlaps the
// asteroids (they come from ahead: behind the hull in the tilted view). Flames stay 2D in the back layer
// (under the sprites); everything that was painted over the ship (shield bubble, hit flash, smoke, sparks,
// tags, D.overlay, D.drawExtra: the tractor beam, the tentacle) comes later on top: drawEnemyOverlays(),
// from drawCombatFront. The sprites don't turn with the gentle sway (e.rot ≤ 0.04); burning ones do.
// ---------------------------------------------------------------------------
const spritedEnemies = new Set(), spritedAsteroids = new Set();   // drawn as sprites this frame (overlays to come)
const sideName = (e) => e.side === 'port' ? 'port' : 'star';
const turretAngle = (e) => Math.atan2(Math.sin(e.turret), e.dir * Math.cos(e.turret)) + e.rot;   // local aim → game angle
function interceptorSprites(e, t) {
  const sd = sideName(e), paint = { stealth: 'stealth', tractor: 'tractor', pirate: 'pirate' }[e.kind] || 'interceptor', out = [{ n: `enemy/${paint}_${sd}` }];
  if (e.kind === 'pirate') out.push({ n: `enemy/pirate_${sd}_claw`, f: clamp(Math.round((0.3 + 0.2 * Math.sin(t * 3) - 0.1) / 0.1), 0, 4) });
  for (const p of e.pois) out.push({ n: p.id === 'emitter' ? `enemy/tractor_${sd}_emitter_${p.hit ? 'hit' : 'ok'}` : `enemy/interceptor_${sd}_${p.id}_${p.hit ? 'hit' : 'ok'}`, emissive: p.hit ? 0.2 : 0.7 });
  if (e.kind === 'pirate') out.push({ n: `enemy/pirate_${sd}_flag`, f: Math.floor(t * 8 / TAU * 6) });
  out.push({ n: 'enemy/interceptor_turret', f: GFX.frameIndex('enemy/interceptor_turret', turretAngle(e)), at: e.D.pivot });
  return out;
}
function frigateSprites(e, t) {
  const sd = sideName(e), out = [{ n: `enemy/frigate_${sd}` }];
  for (const p of e.pois) {
    let st = p.hit ? 'hit' : 'ok', f = 0;
    if (!p.hit && p.id === 'dish' && e.shieldUp) st = 'up';
    if (!p.hit && p.id === 'heavy' && e.charge >= 0) { st = 'charge'; f = Math.floor(t * 8); }
    out.push({ n: `enemy/frigate_${sd}_${p.id}_${st}`, f, emissive: p.hit ? 0.2 : 0.7 });
  }
  out.push({ n: 'enemy/frigate_radar', f: GFX.frameIndex('enemy/frigate_radar', e.dir > 0 ? t : Math.PI - t) });
  out.push({ n: 'enemy/frigate_turret', f: GFX.frameIndex('enemy/frigate_turret', turretAngle(e)), at: e.D.pivot });
  return out;
}
function interceptorFlames(e, t) {
  const moving = e.ampGoal > 0.5;
  for (const s of [-1, 1]) flameDown(s * 1.72, 1.95, moving ? 1.5 : 0.7, 0.2, t);
  flameDown(0, 2.15, moving ? 1.1 : 0.5, 0.25, t);
}
function frigateFlames(e, t) {
  const moving = e.ampGoal > 0.3;
  if (!poiHit(e, 'main')) flameDown(0, 7.7, moving ? 2.6 : 1.3, 0.7, t);
  if (!poiHit(e, 'aux')) flameDown(3.42, 5.2, moving ? 1.8 : 0.9, 0.35, t);
  for (const x of [-1.5, 1.5]) flameDown(x, 6.45, 0.6, 0.18, t);      // small trim thrusters
}
// What drawInterceptor / drawFrigate painted on top of the parts that are now sprites (enemy-local, mirrored).
function interceptorOverlay(e, t) {
  if (poiHit(e, 'cooling')) for (let i = 0; i < 3; i++) {             // venting coolant
    const q = (t * 1.2 + i / 3) % 1;
    ctx.beginPath(); ctx.arc(L(2.4 + q * 1.2), L(0.8 + Math.sin(i * 3) * 0.4), L(0.1 + q * 0.25), 0, TAU);
    ctx.fillStyle = `rgba(200,230,255,${0.5 * (1 - q)})`; ctx.fill();
  }
  if (poiHit(e, 'crack') && e.blind > 0) drawWindshieldRepair(e, t, false);   // the pilot taping the hole shut
}
function frigateOverlay(e, t) {
  if (e.charge < 0) return;                                           // the heavy shot's charge at the muzzle
  const k = e.charge / HEAVY_CHARGE, r = L(0.3 + k * 1.1);
  const g = ctx.createRadialGradient(L(5.6), L(-0.2), 0, L(5.6), L(-0.2), r);
  g.addColorStop(0, `rgba(255,255,240,${0.6 + 0.4 * k})`); g.addColorStop(0.4, `rgba(255,120,200,${0.5 + 0.3 * k})`); g.addColorStop(1, 'rgba(255,60,160,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(5.6), L(-0.2), r, 0, TAU); ctx.fill();
}
ENEMY_TYPES.interceptor.overlay = interceptorOverlay;    // (before encounters.js / dock.js copy the interceptor for its variants)
ENEMY_TYPES.frigate.overlay = frigateOverlay;
const enemyAlpha = (e) => (e.phase === 'burning' ? clamp(1 - (e.burnT - 3) / 2, 0, 1) : 1) * (e.D.stealth ? stealthAlpha(e) : 1);
function drawEnemySprite(e, t) {
  const list = e.D.sprites?.(e, t);
  if (!list || !list.every(s => GFX.ready(s.n))) return false;
  const alpha = enemyAlpha(e), rot = e.phase === 'burning' ? e.rot : 0;
  const scale = e.phase === 'burning' && e.D.organic ? 1 - 0.4 * Math.min(1, e.burnT / 3.5) : 1;   // living things deflate
  if (e.D.flames) { ctx.save(); ctx.globalAlpha = alpha; ctx.translate(L(e.x), L(e.y)); ctx.rotate(e.rot); ctx.scale(e.dir, 1); e.D.flames(e, t); ctx.restore(); }
  e.D.under?.(e, t);                                // (world space, still in the back layer)
  for (const s of list) {
    const [x, y] = s.at ? enemyToWorld(e, ...s.at) : s.x != null ? [s.x, s.y] : [e.x, e.y];
    GFX.sprite(s.n, s.f || 0, x, y, s.z || 0, { layer: 'under', alpha: alpha * (s.alpha ?? 1), scale: scale * (s.scale || 1), rot: rot + (s.rot || 0), sx: s.sx, emissive: s.emissive ?? 0.3 });
  }
  spritedEnemies.add(e);
  return true;
}
// On top of everything (the 2D canvas `c`, after the crew): what goes over a sprite enemy.
function drawEnemyOverlays(t) {
  for (const e of spritedEnemies) {
    if (!combat.enemies.includes(e)) continue;
    ctx.save();
    ctx.globalAlpha = enemyAlpha(e);
    ctx.translate(L(e.x), L(e.y)); ctx.rotate(e.rot); ctx.scale(e.dir, 1);
    if (e.phase === 'burning' && e.D.organic) { const k = Math.min(1, e.burnT / 3.5); ctx.scale(1 - 0.4 * k, 1 - 0.4 * k); }
    e.D.overlay?.(e, t);
    if (e.flash > 0) {                              // hit flash
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,200,150,${e.flash * 0.2})`;
      ctx.beginPath(); ctx.ellipse(0, 0, L(e.D.size[0]), L(e.D.size[1]), 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!e.D.organic) e.pois.forEach((p, i) => {
      if (!p.hit || p.id === 'crack') return;
      if (p.id !== 'cooling') sparkBurst(p.c[0], p.c[1], t, 41 + i * 10);
      drawSmoke(L(p.c[0]), L(p.c[1]), p.smoke, t + p.c[0]);
    });
    drawEnemyShield(e);
    ctx.restore();
    if (e.phase === 'fighting' && (!e.D.stealth || stealthAlpha(e) > 0.3)) drawEnemyTag(e);
    e.D.drawExtra?.(e, t);
  }
  spritedEnemies.clear();
}

// Asteroids: asteroid_big<k> (+ _crack, the weak spot: both picked by the crack's angle rot + crackA, 48
// steps) and asteroid_small<k> (32 steps), k from the shape seed. Neighbouring steps are crossfaded so the
// rock turns smoothly. The damage cracks and the hit flash stay 2D, on top (drawAsteroidOverlays).
function drawAsteroidSprite(a, t) {
  const k = a.shapeSeed % 3, n = a.big ? `enemy/asteroid_big${k}` : `enemy/asteroid_small${k}`, c = n + '_crack';
  if (!GFX.ready(n) || (a.big && !GFX.ready(c))) return false;
  const steps = a.big ? 48 : 32, u = (a.big ? a.rot + a.crackA : a.rot) / (TAU / steps), i0 = Math.floor(u), w = u - i0;
  for (const [i, al] of [[i0, 1], [i0 + 1, w]]) {
    if (al < 0.03) continue;
    const f = ((i % steps) + steps) % steps;
    GFX.sprite(n, f, a.x, a.y, 0, { layer: 'under', alpha: al, emissive: 0.5 });
    if (a.big) GFX.sprite(c, f, a.x, a.y, 0, { layer: 'under', alpha: al, emissive: 0.9 });
  }
  spritedAsteroids.add(a);
  return true;
}
function drawAsteroidOverlays(t) {
  for (const a of spritedAsteroids) {
    if (!combat.asteroids.includes(a)) continue;
    // damage cracks from plain hits, on the rock's upper surface (lifted to where the sphere is)
    const P = (lx, ly) => { const d = Math.hypot(lx, ly), z = Math.sqrt(Math.max(0, a.r * a.r - d * d)) * 0.9, [u, v] = rot(lx, ly, a.rot); return [L(a.x + u), L(a.y + v - GFX.lift(z))]; };
    a.damage.forEach((ang, i) => {
      const r = rng(a.seed + i * 13);
      let x = Math.cos(ang) * a.r * 0.85, y = Math.sin(ang) * a.r * 0.85;
      ctx.beginPath(); ctx.moveTo(...P(x, y));
      for (let k = 0; k < 4; k++) {
        const q = ang + Math.PI + (r() - 0.5) * 1.2, l = a.r * (0.15 + r() * 0.15);
        x += Math.cos(q) * l; y += Math.sin(q) * l; ctx.lineTo(...P(x, y));
      }
      ctx.strokeStyle = '#1a1614'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,150,60,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    });
    if (a.flash > 0) {                               // the rock's screen disc (a circle of radius r on screen)
      ctx.save(); ctx.globalAlpha = a.flash * 0.45; ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.ellipse(L(a.x), L(a.y), L(a.r) * 0.9, L(a.r) * 0.9 / GFX.SIN, 0, 0, TAU); ctx.fillStyle = '#ffd9a0'; ctx.fill();
      ctx.restore();
    }
  }
  spritedAsteroids.clear();
}
