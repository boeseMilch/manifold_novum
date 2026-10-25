// Combat: our cannon shells, enemy shots, hits on our ship, side shields, asteroid swarm,
// hit flashes and the combat HUD. Units: layout units (world == ship frame).

const SHELL_SPEED = 45, SHELL_LIFE = 1.7, CANNON_COOLDOWN = 0.45;
let SHIELD_UP_TIME = 15;                             // (ship upgrades: see progress.js)
const SHIELD_COOLDOWN = 5;                           // cooldown starts once the shield drops
const SWARM_SIZE = 2, SWARM_INTERVAL = 6;
const ASTEROID_WEAR = 4;                         // body hits that split a big asteroid even without hitting the crack

const combat = {
  enemies: [], asteroids: [], shells: [], shots: [], fx: [], decals: [],
  hits: { small: 0, large: 0, crew: 0 },
  flashes: { port: 0, star: 0, front: 0 },          // small hit: thin red bar on that screen edge
  bigFlashes: { port: 0, star: 0, front: 0 },       // large hit: wide red flash on that side
  shake: 0,                                         // large hit: the whole ship vibrates
  shields: { port: { up: 0, cd: 0 }, front: { up: 0, cd: 0 }, star: { up: 0, cd: 0 } },
  shieldHits: [],                                    // impacts on our shields {side, x, y, t, heavy}
  swarm: null, banner: null,
};

function segCircle(x0, y0, x1, y1, cx, cy, r) {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1e-9;
  const k = clamp(((cx - x0) * dx + (cy - y0) * dy) / l2, 0, 1);
  return Math.hypot(x0 + dx * k - cx, y0 + dy * k - cy) <= r;
}
// A shot against a body, as the player sees it: the shot flies at height z (drawn GFX.lift(z) up the screen),
// the body stands at (cx, cy) from its feet up to height top and is r wide: on screen a capsule from its
// feet to its head. Swept over the whole step (x0, y0) → (x1, y1), so a fast shot can't skip past it.
// Returns how far along the step (0..1) the shot first touches the body, or -1 for a miss. In the classic
// view (no lift) the capsule is a circle of radius r around the feet.
function segBody(x0, y0, x1, y1, z, cx, cy, r, top) {
  const lz = GFX.lift(z || 0), head = cy - GFX.lift(top), n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.03));
  for (let i = 0; i <= n; i++) {
    const k = i / n, px = x0 + (x1 - x0) * k, py = y0 + (y1 - y0) * k - lz;
    if (Math.hypot(px - cx, py - clamp(py, head, cy)) <= r) return k;
  }
  return -1;
}
const SLIME_COLS =['#9cff5a', '#6ad13a', '#c8ff6e'];   // (slimeBurst, organic deaths: drawn as slime drops with sprites)
function combatFx(x, y, vx, vy, life, col, size) {
  combat.fx.push({ x, y, vx, vy, life, max: life, col, size });
}
// The same burst at height z (the raised front cannon's muzzle, a shot hitting its gunner up there):
// only drawn lifted (GFX.lift), it moves in the ground plane like every other particle.
function combatFxAt(z, ...a) { combatFx(...a); if (z) combat.fx[combat.fx.length - 1].z = z; }
// A flipbook effect sprite (fx/explosion_l/s, fx/hit_spark[_blue]) played once at (x, y), on top of the
// particle burst. It rides along in combat.fx (so it reaches every client in the snapshots); only the
// sprite renderer draws it (drawFlips), the classic view keeps just the particles.
const FLIP_TIME = { 'fx/explosion_l': 12 / 16, 'fx/explosion_s': 8 / 16, 'fx/hit_spark': 6 / 20, 'fx/hit_spark_blue': 6 / 20 };
function combatFlip(name, x, y, scale = 1, z = 0) {
  const life = FLIP_TIME[name] || 0.5;
  combat.fx.push({ x, y, vx: 0, vy: 0, life, max: life, flip: name, size: scale, ...(z ? { z } : {}) });
}
function drawFlip(p) {
  const S = GFX.info(p.flip), n = (S && S.frames) || 1;
  GFX.sprite(p.flip, Math.min(n - 1, Math.floor((1 - p.life / p.max) * n)), p.x, p.y, p.z || 0, { layer: 'top', unlit: true, scale: p.size || 1 });
}
function combatBanner(text) { combat.banner = { text, t: 3 }; }
// Greedy word wrap: the lines of `text` no wider than maxW (measure: the width of a string; a single word wider than
// maxW gets a line of its own).
function wrapText(text, maxW, measure) {
  const lines = [];
  for (const w of String(text).split(' ')) {
    const last = lines.length ? lines[lines.length - 1] + ' ' + w : null;
    if (last != null && measure(last) <= maxW) lines[lines.length - 1] = last; else lines.push(w);
  }
  return lines;
}
// The top banner in `room` px of free width (between the sidebar and the right-hand HUD): one line at 22 px if it fits,
// else two lines (22, then 19, then 16 px), else as many lines as it takes at 16 px. measure(s, px): s's width at px.
const BANNER_SIZES = [22, 19, 16];
function bannerLayout(text, room, measure) {
  if (measure(text, 22) <= room) return { size: 22, lines: [text] };
  for (const size of BANNER_SIZES) {
    const lines = wrapText(text, room, (s) => measure(s, size));
    if (lines.length <= 2 && lines.every(l => measure(l, size) <= room)) return { size, lines };
  }
  return { size: 16, lines: wrapText(text, room, (s) => measure(s, 16)) };
}
// The free band at the top of the screen for banners: right of the sidebar (its header and plates), left of the
// PRACTICE button and the shields list (list: that list's box, x and bottom). On a narrow screen, where that gap is
// too small for a readable banner, it moves down under them instead, as wide as the screen right of the sidebar.
const BANNER_MIN_ROOM = 340;
function bannerBand(list, top) {
  const x0 = SIDEBAR_X + PLATE_W + 14;
  let x1 = Math.min(VW - 14, list.x - 12), y = top + 10, below = list.bottom;
  const pb = typeof document !== 'undefined' && document.getElementById ? document.getElementById('practice-btn') : null;
  if (pb && !pb.hidden && pb.getBoundingClientRect) {
    const r = pb.getBoundingClientRect();
    if (r.width > 0 && r.left > VW / 2) { x1 = Math.min(x1, r.left - 12); below = Math.max(below, r.bottom); }
  }
  if (x1 - x0 - 40 < BANNER_MIN_ROOM) { x1 = VW - 14; y = below + 8; }
  return { x0, x1, y };
}
// The sides of the asteroids a swarm still has to send (a swarm from before sides existed: all front).
const swarmSides = (S) => (S.sides?.length === S.left ? S.sides : Array(S.left).fill(S.side || 'front'));

// ---------------------------------------------------------------------------
// Spawning (debug menu)
// ---------------------------------------------------------------------------
// replace: debug spawns swap out whatever is on that side; mission spawns line up behind it.
function combatSpawn(kind, side, replace = false) {
  if (kind === 'swarm') {                                 // side: 'front' (ahead), 'port' or 'star' (from that flank)
    side = side === 'port' || side === 'star' ? side : 'front';
    const add = Array(SWARM_SIZE).fill(side);              // (sides: the side of each asteroid still to come, in order)
    combat.swarm = combat.swarm ? { ...combat.swarm, sides: [...swarmSides(combat.swarm), ...add], left: combat.swarm.left + SWARM_SIZE }
                                : { left: SWARM_SIZE, t: 0, side, sides: add };
    combatBanner(side === 'front' ? 'Asteroid swarm ahead!' : `Asteroid swarm on the ${SIDE_LABEL[side].toLowerCase()} side!`); return;
  }
  if (replace) {
    combat.enemies.forEach(e => { if (e.side === side) e.stopCharge?.(); });
    combat.enemies = combat.enemies.filter(e => e.side !== side || e.phase === 'gone');
  }
  if (ENEMY_TYPES[kind]?.backdrop && combat.enemies.some(o => o.side === side && o.D.backdrop && o.phase === 'fighting')) side = side === 'port' ? 'star' : 'port';   // one giant per side
  const e = makeEnemy(kind, side);
  placeInLane(e);
  combat.enemies.push(e);
  combatBanner(`${e.D.name} on the ${side === 'port' ? 'left' : 'right'} side!`);
}
// Several enemies on one side queue up: the first at its usual distance, the next behind it (never
// overlapping). Defeat the one in front and the next slowly moves up into its place. Shots at the one
// behind may be blocked by the one in front — then you go through it.
const swayW = (o) => o.D.size[0] + 1.15 * o.D.amp[0];
function queueTargets(side) {
  const q = combat.enemies.filter(o => o.side === side && o.phase === 'fighting' && !o.D.backdrop).sort((a, b) => a.uid - b.uid);   // (a backdrop like the spore mother stays behind everyone)
  const dir = side === 'port' ? -1 : 1, edge = side === 'port' ? 0 : SHIP_W;
  let prev = null;
  for (const o of q) {
    let ax = edge + dir * o.D.dist;
    if (prev) ax = dir < 0 ? Math.min(ax, prev.qx + dir * (swayW(prev) + swayW(o) + 1.5)) : Math.max(ax, prev.qx + dir * (swayW(prev) + swayW(o) + 1.5));
    o.qx = ax; prev = o;
  }
}
function placeInLane(e) {
  if (e.D.backdrop) return;                               // (backdrops keep their own spot, behind the queue)
  combat.enemies.push(e); queueTargets(e.side); combat.enemies.pop(); e.ax = e.x = e.qx;
}
function updateQueues(dt) {
  for (const side of ['port', 'star']) {
    queueTargets(side);
    for (const o of combat.enemies) if (o.side === side && o.phase === 'fighting' && o.qx !== undefined) o.ax += clamp(o.qx - o.ax, -1.5 * dt, 1.5 * dt);   // move up the queue, slowly
  }
}
function combatClear() {
  for (const e of combat.enemies) e.stopCharge?.();
  combat.enemies = []; combat.asteroids = []; combat.shots = []; combat.shells = []; combat.swarm = null;
  combat.decals = []; combat.hits = { small: 0, large: 0, crew: 0 };
}

// ---------------------------------------------------------------------------
// Our cannons
// ---------------------------------------------------------------------------
// A cannon holds SHOTS_PER_ENERGY shots. When it's empty it just clicks; reloading (R or the
// RELOAD button) takes one energy from the cannon's capacitor and refills it after a moment.
const GUN_CAP = { front: 1, port: 0, star: 2 }, RELOAD_TIME = 3;   // s per reload (a weapons specialist gunner: 50% faster)
function reloadCannon(g) {
  if (g.reload > 0 || g.shots >= SHOTS_PER_ENERGY || broken(g)) return false;
  if (!useEnergy(GUN_CAP[g.id], 'gun_' + g.id)) { sfx.empty(); combatBanner(sporeGlitching(CAPACITORS[GUN_CAP[g.id]]) ? `Spores in the ${['left', 'middle', 'right'][GUN_CAP[g.id]]} capacitor — no energy for a moment, no reload` : `${['Left', 'Mid', 'Right'][GUN_CAP[g.id]]} capacitor empty — no reload`); return false; }
  g.reload = RELOAD_TIME; sfx.hatch();
  const gunner = crew.find(c => c.mode === 'gun' && c.gun === g); if (gunner) zap(gunner, 'gun_' + g.id);
  return true;
}
function fireCannon(g) {
  if (g.cd > 0) return;
  if (broken(g)) {                                 // broken cannon: just sparks
    g.cd = 0.5; sfx.spark();
    for (let i = 0; i < 6; i++) combatFx(g.x, g.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.3, '#ffe08a', 0.07);
    return;
  }
  if (sporeGlitching(g)) {                         // spores in its firing circuit (js/spores.js): a fizzle, no shot
    g.cd = 0.5; sfx.empty(); combatBanner(`Spores in the ${g.name.toLowerCase()}'s firing circuit — it won't fire for a moment`);
    for (let i = 0; i < 4; i++) combatFx(g.x, g.y, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.5, '#c8dc90', 0.1);
    return;
  }
  if (!(g.shots > 0) || g.reload > 0) { g.cd = 0.35; sfx.empty(); return; }   // empty: reload first
  if (enc.flare?.phase === 'rad') { g.cd = 0.5; sfx.spark(); combatBanner('Solar flare — the cannon electronics are fried until it passes'); return; }
  g.shots--;
  g.cd = CANNON_COOLDOWN; g.flash = 1;
  const dx = Math.cos(g.aim), dy = Math.sin(g.aim);
  const x = g.x + dx * 1.15, y = g.y + dy * 1.15, z = muzzleZ(g);
  combat.shells.push({ x, y, z, vx: dx * SHELL_SPEED, vy: dy * SHELL_SPEED, life: SHELL_LIFE });
  for (let i = 0; i < 6; i++) combatFxAt(z, x, y, dx * 4 + (Math.random() - 0.5) * 3, dy * 4 + (Math.random() - 0.5) * 3, 0.25, '#ffd28a', 0.1);
  sfx.shoot();
}

// Shells keep to the ground plane for every hit test; z is only for drawing. A shell leaves the muzzle
// (MUZZLE_Z above its cannon's pivot, which is up on the nose's roof for the front cannon: GUN_Z in
// js/sprites.js) and sinks to the ground plane, where the enemies and asteroids are drawn, over its first
// SHELL_DROP units. shellZ(s, back): its height `back` units behind its head (for the tail).
// The front cannon is also drawn GUN_DY south of its pivot (on the nose wall's top): muzzleZ lowers the
// height by what that shift lifts on screen (lift = z cos50 / sin50), so a shell or spark drawn at the
// gameplay point lands on the drawn muzzle and its gunner.
const MUZZLE_Z = 0.4, SHELL_DROP = 7, LIFT_PER_Z = 1 / Math.tan(50 * Math.PI / 180);
function muzzleZ(g) {
  const z = (typeof GUN_Z !== 'undefined' && GUN_Z[g.id]) || 0, dy = (typeof GUN_DY !== 'undefined' && GUN_DY[g.id]) || 0;
  return MUZZLE_Z + z - dy / LIFT_PER_Z;
}
function shellZ(s, back = 0) {
  if (!s.z) return 0;
  const k = clamp(((SHELL_LIFE - s.life) * SHELL_SPEED - back) / SHELL_DROP, 0, 1);
  return s.z * (1 - k * k * (3 - 2 * k));
}
// Enemy shots at a gunner up on the roof climb to his body (tz) along their way (d0 = launch distance).
function gunnerZ(c) { const r = c && c.mode === 'gun' ? muzzleZ(c.gun) - MUZZLE_Z : 0; return r ? r + 0.5 : 0; }
function shotZ(s) { return s.tz ? s.tz * clamp(1 - Math.hypot(s.tx - s.x, s.ty - s.y) / (s.d0 || 1), 0, 1) : 0; }

// ---------------------------------------------------------------------------
// Enemy fire and damage to us
// ---------------------------------------------------------------------------
// Where an enemy's light gun aims next: the crew member outside (sometimes) or a hull spot.
function pickEnemyTarget(e) {
  const outside = crew.filter(c => isOutside(c) && standing(c));
  if (outside.length && Math.random() < 0.4) { const c = outside[Math.floor(Math.random() * outside.length)]; return { atCrew: true, crewId: c.id, tx: c.x, ty: c.y }; }
  const ty = 4 + Math.random() * 18;
  return { atCrew: false, tx: hullEdgeX(ty, e.side), ty };
}
function enemyFire(e, mx, my, heavy, target) {
  if (mission.over?.survived) return;                // jumping out: nothing to shoot at any more
  const { atCrew, tx, ty } = target;
  const d = Math.hypot(tx - mx, ty - my) || 1, sp = heavy ? 30 : e.D.shotSpeed;
  const tc = atCrew && crew.find(c => c.id === target.crewId), tz = gunnerZ(tc);
  combat.shots.push({ x: mx, y: my, vx: (tx - mx) / d * sp, vy: (ty - my) / d * sp, heavy, side: e.side,
                      atCrew, crewId: target.crewId, tx, ty, life: d / sp + 1.5, ...(tz ? { tz, d0: d } : {}) });
  if (heavy) { sfx.heavyLaunch(); for (let i = 0; i < 16; i++) combatFx(mx, my, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 0.5, '#ff8ac0', 0.2); }
  else sfx.enemyShot();
}

// Our side shields are a curved curtain a little outside the hull.
const SIDE_SHIELD_Y0 = -0.5, SIDE_SHIELD_Y1 = 25.5;   // the side curtains' span (drawn there too)
function shieldX(side, y) {
  const u = clamp((y + 0.5) / 26, 0, 1), bulge = 2.2 + 1.6 * 4 * u * (1 - u);
  return side === 'port' ? -bulge : SHIP_W + bulge;
}
// The front shield arcs around the nose (only exists between FRONT_SHIELD_X0 and _X1).
// It covers the whole span the asteroid swarm aims at (x 8..36, js/enemies.js spawnSwarmAsteroid): the nose's arc,
// and out over the deck on both wings, 1.8 units off the hull (playtest 2026-10-16: "shields should help against
// asteroids"; with the old 10.4..34 arc, rocks aimed at the wings slipped past it: 40% of them hit with it up).
const FRONT_SHIELD_X0 = 6.5, FRONT_SHIELD_X1 = 38, FRONT_SHIELD_GAP = 1.8;
function hullTopY(x) {                               // the hull outline's topmost y at x
  let top = Infinity;
  for (let i = 0; i < HULL.length; i++) {
    const [x0, y0] = HULL[i], [x1, y1] = HULL[(i + 1) % HULL.length];
    if ((x0 - x) * (x1 - x) > 0 || x0 === x1) continue;
    top = Math.min(top, y0 + (y1 - y0) * (x - x0) / (x1 - x0));
  }
  return top;
}
function shieldYFront(x) { const u = (x - 22.2) / 11.8; return Math.min(-5.8 + 7.6 * u * u, hullTopY(x) - FRONT_SHIELD_GAP); }
function shieldAbsorb(s, side, x, y) {
  combat.shieldHits.push({ side, x, y, t: 0, heavy: s.heavy, vx: s.vx, vy: s.vy });
  sfx.shieldBlock(); if (s.heavy) sfx.shieldUp();
  for (let i = 0; i < (s.heavy ? 24 : 10); i++) {   // the shot's energy spreads along the shield
    const k = (Math.random() - 0.5) * 2;
    combatFx(x, y, k * 0.6, (Math.random() - 0.5) * (s.heavy ? 9 : 5), 0.6, i % 2 ? '#9cd8ff' : '#ffffff', s.heavy ? 0.14 : 0.08);
  }
  combatFlip('fx/hit_spark_blue', x, y, s.heavy ? 1.6 : 1);
}

function shipHit(side, x, y, large) {
  if (mission.over?.survived) return;                // (shots still in flight as the ship jumps away)
  if ((typeof tutorialHit === 'function' && tutorialHit('ship', side)) || (typeof trainHit === 'function' && trainHit('ship', side))) {   // tutorial / crew training: enemy hits are for show only (js/tutorial.js, js/tutorial-mp.js)
    combat.flashes[side] = 1; sfx.hit(false); combatFlip('fx/explosion_s', x, y, 0.7, hitSurface(x, y).z); return;
  }
  combat.hits[large ? 'large' : 'small']++;
  if (large) { damageColumn(side, true); onBigHit(side, x, y); bigHitFire(side, x, y); }   // (the fire after a breach: no fire in vacuum)   // small hits: see smallHit (fire / damage)
  // hot: when it hit (sim time), side: from where. js/hitfx.js plays the impact (sparks, smoke, debris,
  // flash) on every client when it first sees this decal, and lets the spot glow and cool from `hot`.
  combat.decals.push({ x, y, r: large ? 1.1 : 0.5, seed: Math.random() * 1000, hot: time, side });
  if (large) { combat.bigFlashes[side] = 1; combat.shake = 1; sfx.explosion(); }
  else { combat.flashes[side] = 1; sfx.hit(false); smallHit(side, x, y); }
  combatFlip(large ? 'fx/explosion_l' : 'fx/explosion_s', x, y, large ? 0.8 : 0.7, hitSurface(x, y).z);
}
function crewHit(side, c) {
  if ((typeof tutorialHit === 'function' && tutorialHit('crew', side, c)) || (typeof trainHit === 'function' && trainHit('crew', side, c))) {   // tutorial / crew training: for show only
    combat.flashes[side] = 1; sfx.hit(false); combatFlip('fx/hit_spark', c.x, c.y, 1, gunnerZ(c)); return;
  }
  combat.hits.crew++; combat.flashes[side] = 1; sfx.hit(false); hurtCrew(c, 3);   // a ship's gun: one hit in the body and you're out
  const z = gunnerZ(c);                            // the front gunner is up on the roof
  for (let i = 0; i < 10; i++) combatFxAt(z, c.x, c.y, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.5, '#e2574c', 0.12);
  combatFlip('fx/hit_spark', c.x, c.y, 1, z);
}

const emitterOf = (side) => SHIELD_EMITTERS.find(e => e.side === side);
// Costs one energy from that side's capacitor; with none, nothing happens (no cooldown either).
// The button only switches the emitter outside on: a broken emitter means no shield on that side.
function pressShield(side) {
  const s = combat.shields[side];
  if (broken(SHIELD_BUTTONS.find(b => b.side === side))) return 'broken';
  if (sporeGlitching(SHIELD_BUTTONS.find(b => b.side === side))) { sfx.empty(); combatBanner(`Spores in the ${SIDE_LABEL[side].toLowerCase()} shield button's contacts — it doesn't press for a moment`); return 'spores'; }
  if (broken(emitterOf(side))) { sfx.empty(); combatBanner(`${SIDE_LABEL[side]} shield emitter (outside) is broken — fix it on a spacewalk`); return 'emitter'; }
  if (grabbed(side)) { sfx.empty(); combatBanner('A tentacle is wrapped around that side — the shield can\'t go up'); return 'grabbed'; }
  if (s.up > 0 || s.cd > 0) return false;
  if (!useEnergy(SIDE_CAP[side], 'shield_' + side)) { sfx.empty(); if (sporeGlitching(CAPACITORS[SIDE_CAP[side]])) combatBanner('Spores in the capacitor — no energy for a moment'); return 'noenergy'; }
  s.up = SHIELD_UP_TIME; s.cd = SHIELD_UP_TIME + SHIELD_COOLDOWN; s.age = 0; sfx.shieldUp();
  if (player && player.mode === 'inside') zap(player, 'shield_' + side);
  return true;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function updateCombat(dt) {
  for (const g of GUNS) {
    g.cd = Math.max(0, (g.cd || 0) - dt); g.flash = Math.max(0, g.flash - dt * 6);
    const fast = crew.some(c => c.mode === 'gun' && c.gun === g && perk(c, 'weapons')) ? 1.5 : 1;   // (the weapons specialist's perk)
    if (g.reload > 0 && (g.reload -= dt * fast) <= 0) { g.reload = 0; g.shots = SHOTS_PER_ENERGY; sfx.clank(); }
  }
  for (const side in combat.shields) {             // its emitter got knocked out: the shield collapses (and recharges as usual)
    const s = combat.shields[side];
    if (s.up > 0 && broken(emitterOf(side))) { s.up = 0; s.cd = Math.min(s.cd, SHIELD_COOLDOWN); }
  }
  for (const s of Object.values(combat.shields)) { s.up = Math.max(0, s.up - dt); s.cd = Math.max(0, s.cd - dt); s.age = s.up > 0 ? (s.age || 0) + dt : 0; }
  for (const h of combat.shieldHits) h.t += dt;
  combat.shieldHits = combat.shieldHits.filter(h => h.t < 0.8);
  for (const k in combat.flashes) combat.flashes[k] = Math.max(0, combat.flashes[k] - dt * 1.3);
  for (const k in combat.bigFlashes) combat.bigFlashes[k] = Math.max(0, combat.bigFlashes[k] - dt * 0.8);
  combat.shake = Math.max(0, combat.shake - dt * 1.1);
  if (combat.banner && (combat.banner.t -= dt) <= 0) combat.banner = null;

  updateQueues(dt);
  for (const e of combat.enemies) updateEnemy(e, dt);
  combat.enemies = combat.enemies.filter(e => e.phase !== 'gone');

  // asteroid swarm
  if (combat.swarm) {
    const S = combat.swarm;
    S.t -= dt;
    if (S.left > 0 && S.t <= 0) {
      const sides = swarmSides(S), side = sides.shift();
      combat.asteroids.push(spawnSwarmAsteroid(side)); S.left--; S.sides = sides; S.side = sides[0] || side; S.t = SWARM_INTERVAL;
    }
    if (S.left === 0 && !combat.asteroids.length) { combat.swarm = null; sfx.win(); combatBanner('Asteroid swarm cleared!'); }
  }
  for (const a of combat.asteroids) {
    a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.vr * dt; a.flash = Math.max(0, a.flash - dt * 4);
    // a raised front shield eats asteroids that run into it
    if (combat.shields.front.up > 0 && a.x > FRONT_SHIELD_X0 && a.x < FRONT_SHIELD_X1 && a.y + a.r * 0.6 >= shieldYFront(a.x) && a.y - a.vy * dt + a.r * 0.6 < shieldYFront(a.x - a.vx * dt)) {
      a.dead = true; dust(a); shieldAbsorb({ heavy: a.big, vx: a.vx, vy: a.vy }, 'front', a.x, shieldYFront(a.x));
      continue;
    }
    // a raised side shield eats the asteroids that cross its curtain (within its span, like enemy shots)
    let eaten = false;
    for (const sd of ['port', 'star']) {
      if (eaten || !(combat.shields[sd].up > 0) || a.y < SIDE_SHIELD_Y0 || a.y > SIDE_SHIELD_Y1) continue;
      const sgn = sd === 'port' ? 1 : -1, lead = sgn * a.r * 0.6;   // (its leading edge)
      const before = sgn * (a.x - a.vx * dt + lead - shieldX(sd, a.y - a.vy * dt)), after = sgn * (a.x + lead - shieldX(sd, a.y));
      if (before < 0 && after >= 0) { eaten = true; a.dead = true; dust(a); shieldAbsorb({ heavy: a.big, vx: a.vx, vy: a.vy }, sd, shieldX(sd, a.y), a.y); }
    }
    if (eaten) continue;
    if (pointInPoly(a.x, a.y) || distToPoly(a.x, a.y) < a.r * 0.75) {
      const side = a.side || 'front', off = a.r * 0.5;   // (the impact: the rock's hull-facing edge)
      if (side === 'front') shipHit('front', a.x, a.y + off, a.big);
      else shipHit(side, a.x + (side === 'port' ? off : -off), a.y, a.big);
      a.dead = true; dust(a);
    }
    if (a.y > SHIP_H + 10 || a.y < -60 || a.x < -60 || a.x > SHIP_W + 60) a.dead = true;   // (flown past)
  }

  // our shells
  for (const s of combat.shells) {
    const x0 = s.x, y0 = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    for (const e of combat.enemies) if (!e.D.backdrop && !s.dead && shellHitsEnemy(e, x0, y0, s.x, s.y)) s.dead = true;
    if (!s.dead) {                                       // a backdrop is behind everything: a ship just ahead gets the shot first
      const ax = s.x + s.vx / SHELL_SPEED * 3, ay = s.y + s.vy / SHELL_SPEED * 3;
      const ahead = combat.enemies.some(e => !e.D.backdrop && shellTouches(e, s.x, s.y, ax, ay));
      if (!ahead) for (const e of combat.enemies) if (e.D.backdrop && !s.dead && shellHitsEnemy(e, x0, y0, s.x, s.y)) s.dead = true;
    }
    for (const a of combat.asteroids) {
      if (s.dead || a.dead) continue;
      if (a.big) {
        const [cx, cy] = crackPos(a);
        if (segCircle(x0, y0, s.x, s.y, cx, cy, 0.4)) { s.dead = true; splitAsteroid(a); }
        else if (segCircle(x0, y0, s.x, s.y, a.x, a.y, a.r * 0.9)) {
          s.dead = true; a.flash = 0.7; sfx.clank();
          for (let i = 0; i < 6; i++) combatFx(s.x, s.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.4, i % 2 ? '#ffd28a' : '#8d8274', 0.1);
          combatFlip('fx/hit_spark', s.x, s.y);
          // remember where it got hit (asteroid-local angle) so damage cracks show up there
          a.damage.push(Math.atan2(s.y - a.y, s.x - a.x) - a.rot); (a.damageRot ||= []).push(a.rot);   // (and how it was turned then: the sprite view draws the crack turning with the rock)
          if (a.damage.length >= ASTEROID_WEAR) splitAsteroid(a);
        }
      } else if (segCircle(x0, y0, s.x, s.y, a.x, a.y, a.r * 1.05)) { s.dead = true; a.dead = true; dust(a); sfx.crack(); }
    }
  }
  combat.shells = combat.shells.filter(s => !s.dead && s.life > 0);
  combat.asteroids = combat.asteroids.filter(a => !a.dead);

  // enemy shots
  for (const s of combat.shots) {
    const x0 = s.x, y0 = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.side !== 'front' && combat.shields[s.side].up > 0) {     // crossing a raised shield: consumed
      const sgn = s.side === 'port' ? 1 : -1;
      const before = sgn * (x0 - shieldX(s.side, y0)), after = sgn * (s.x - shieldX(s.side, s.y));
      if (before < 0 && after >= 0) { s.dead = true; shieldAbsorb(s, s.side, shieldX(s.side, s.y), s.y); continue; }
    }
    // raised cover plates in front of manned cannons
    const covered = crew.find(c => {
      if (c.mode !== 'gun' || c.cover <= 0.8) return false;
      const g = c.gun, facing = s.vx * Math.cos(g.aim) + s.vy * Math.sin(g.aim) < 0;
      return facing && segCircle(x0, y0, s.x, s.y, g.x + Math.cos(g.aim) * 0.6, g.y + Math.sin(g.aim) * 0.6, 1.0);
    });
    if (covered) {
      s.dead = true; sfx.clank();
      const z = muzzleZ(covered.gun);                  // the plate is up with the front cannon on the roof
      for (let i = 0; i < 10; i++) combatFxAt(z, s.x, s.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.4, '#ffd28a', 0.09);
      combatFlip('fx/hit_spark', s.x, s.y, 1, z);
      continue;
    }
    const tc = s.atCrew && crew.find(c => c.id === s.crewId);
    const slumped = tc && tc.mode === 'gun' && !standing(tc);         // down in a cannon's seat: below the rim, the shot flies over
    if (tc && isOutside(tc) && !slumped && segCircle(x0, y0, s.x, s.y, tc.x, tc.y, 0.5)) { s.dead = true; crewHit(s.side, tc); continue; }
    // someone on a spacewalk in its way catches it with their body (shots fly at hull height, so not the roof gunner)
    const blocker = crew.find(c => c !== tc && c.mode === 'eva' && standing(c) && segCircle(x0, y0, s.x, s.y, c.x, c.y, 0.4));
    if (blocker) { s.dead = true; crewHit(s.side, blocker); continue; }
    // shots at the crew fly past the hull edge until they pass their target (the gunner sits on it)
    const passed = (s.tx - s.x) * s.vx + (s.ty - s.y) * s.vy < 0;
    const reached = !s.atCrew && Math.hypot(s.tx - s.x, s.ty - s.y) <= Math.hypot(s.vx, s.vy) * dt + 0.05;
    if (reached || ((!s.atCrew || passed) && pointInPoly(s.x, s.y))) { s.dead = true; shipHit(s.side, s.x, s.y, s.heavy); }
  }
  combat.shots = combat.shots.filter(s => !s.dead && s.life > 0);

  for (const p of combat.fx) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.life -= dt; }
  combat.fx = combat.fx.filter(p => p.life > 0);
}

function dust(a) {
  for (let i = 0; i < (a.big ? 30 : 16); i++)
    combatFx(a.x + (Math.random() - 0.5) * a.r, a.y + (Math.random() - 0.5) * a.r, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 1.0, Math.random() < 0.5 ? '#8d8274' : '#6e6359', 0.2);
}
function splitAsteroid(a) {
  a.dead = true; sfx.crack();
  for (let i = 0; i < 10; i++) combatFx(a.x, a.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.7, '#8d8274', 0.25);
  const nx = -a.vy, ny = a.vx, n = Math.hypot(nx, ny) || 1;
  for (const s of [-1, 1]) {
    const k = 1.3;
    const b = makeAsteroid(a.x + s * nx / n * 1.2, a.y + s * ny / n * 1.2, false, a.vx * 1.25 + s * nx / n * k, a.vy * 1.25 + s * ny / n * k);
    if (a.side) b.side = a.side;                          // (the pieces hit the flank their rock came from)
    combat.asteroids.push(b);
  }
}

// ---------------------------------------------------------------------------
// Drawing (world space, pixels = layout units * T)
// ---------------------------------------------------------------------------
function drawCombatBack(t) {
  for (const e of combat.enemies) if (e.D.backdrop) drawEnemy(e, t);   // huge things behind everything else
  for (const e of combat.enemies) if (!e.D.backdrop) drawEnemy(e, t);
  if (typeof drawLevBossBack === 'function') drawLevBossBack(t);   // chapter 8's infested leviathan and its gas (js/leviathan.js)
  for (const a of combat.asteroids) drawAsteroidBody(a, t);
}

// Hits on the hull: hull/decal_small_v0..2 (r 0.5) / decal_large_v0..1 (r 1.1) when GFX.on, variant by seed,
// over a wider soot stain (fx/scorch_*) and under the cooling glow (drawHitHeat, js/hitfx.js). Most hits land
// where the hull is a room's outer wall: those marks are drawn on the wall's top (hitSurface), clipped to it.
function drawShipDecals() {
  for (const d of combat.decals) {
    if (d.goo || d.scorch || d.body) continue;
    const S = hitSurface(d.x, d.y);
    const o = S.z ? { layer: 'main', sortY: S.y + 0.7, depthBias: 0.08, depthWrite: false, clip: S.clip } : { layer: 'decal' };
    const heat = () => { if (typeof drawHitHeat === 'function') drawHitHeat(d, S, o); };   // glowing hot, cooling down
    if (GFX.on) {
      const big = d.r > 0.8, n = `hull/decal_${big ? 'large' : 'small'}_v${Math.floor(d.seed || 0) % (big ? 2 : 3)}`;
      if (GFX.ready(n)) {                            // soot blown round the hole (lasting), the hole, its heat
        GFX.sprite(`fx/scorch_${Math.floor(d.seed || 0) % 3}`, 0, S.x, S.y, S.z, { ...o, scale: d.r * (big ? 2.0 : 2.4) / 0.75, alpha: 0.9 });
        GFX.sprite(n, 0, S.x, S.y, S.z, { ...o, scale: d.r / (big ? 1.1 : 0.5) });
        heat(); continue;
      }
    }
    const g = ctx.createRadialGradient(L(d.x), L(d.y), 0, L(d.x), L(d.y), L(d.r));
    g.addColorStop(0, 'rgba(15,12,10,0.85)'); g.addColorStop(0.6, 'rgba(40,28,20,0.5)'); g.addColorStop(1, 'rgba(40,28,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(d.x), L(d.y), L(d.r), 0, TAU); ctx.fill();
    heat();
  }
}
// Where a hull hit at (x, y) shows in the tilted view: on open hull plating (blisters, the nose's corners)
// it lies on the ground (z 0); where the hull is a room's (or the spine's) outer wall, on that wall's top
// (z HIT_WALL_Z), moved into the wall's band and clipped to it: { x, y, z, clip }. Drawing only.
const HIT_WALL_T = 0.6, HIT_WALL_Z = 1.6;
function hitSurface(x, y) {
  const rects = [...ROOM_RECTS, { x: 0.6, y: SPINE_Y0, w: SHIP_W - 1.2, h: SPINE_Y1 - SPINE_Y0 }], e = HIT_WALL_T, tol = 0.3;
  for (const r of rects) {
    const inY = y >= r.y - e - tol && y <= r.y + r.h + e, inX = x >= r.x - e - tol && x <= r.x + r.w + e + tol;
    if (inY && x < r.x && x >= r.x - e - tol) return { x: clamp(x, r.x - e + 0.05, r.x - 0.05), y, z: HIT_WALL_Z, clip: [r.x - e, r.y - e, r.x, r.y + r.h + e, HIT_WALL_Z] };
    if (inY && x > r.x + r.w && x <= r.x + r.w + e + tol) return { x: clamp(x, r.x + r.w + 0.05, r.x + r.w + e - 0.05), y, z: HIT_WALL_Z, clip: [r.x + r.w, r.y - e, r.x + r.w + e, r.y + r.h + e, HIT_WALL_Z] };
    if (inX && y < r.y && y >= r.y - e - tol) return { x, y: clamp(y, r.y - e + 0.05, r.y - 0.05), z: HIT_WALL_Z, clip: [r.x - e, r.y - e, r.x + r.w + e, r.y, HIT_WALL_Z] };
  }
  return { x, y, z: 0, clip: null };
}

// Alien goo where an intruder died (drawn on the floor).
// Sprites: fx/scorch_0..2 (rendered at r 0.75, variant by seed), organic/goo_0..3 (~0.8 across; variant
// by place), floor decals under everything else.
function drawGoo() {
  for (const d of combat.decals) {
    if (d.scorch) {                                  // where a fire burned
      if (!(GFX.on && fxDecal(`fx/scorch_${(d.seed | 0) % 3}`, d.x, d.y, d.r / 0.75, 0.9))) stain(L(d.x), L(d.y), L(d.r), 'rgba(18,14,10,0.5)', d.seed);
      continue;
    }
    if (!d.goo) continue;
    if (GFX.on && GFX.ready('chars/alien/dead')) continue;   // the corpse sprite (drawAlienCorpses) lies in its own puddle
    const k = Math.floor(d.x * 13);
    if (GFX.on && fxDecal(`organic/goo_${((k % 4) + 4) % 4}`, d.x, d.y, d.r / 0.6, 0.95)) continue;
    stain(L(d.x), L(d.y), L(d.r), 'rgba(120,220,70,0.45)', Math.floor(d.x * 13));
  }
}

// Shield curtain along one side of the hull while it is up: a band of hexagon cells.
// Impacts flare up the cells around them and ripple outward; the shot itself is
// shown being drained into the shield.
const SHIELD_GROW = 0.1;                             // shields grow out of / shrink back into their generator
// With the sprites (GFX.on) each shield is a 3D dome instead (GFX.dome, js/gfx.js): the upper half of an
// ellipsoid standing off that side of the hull, its base on the deck plane along the curtain the shots
// stop at (shieldX / shieldYFront: the hit tests don't look at the dome), its crown leaning over the
// rooms on that side and fading out there. Faint where you look onto it, bright where it's seen edge-on.
// c: centre, r: radii (x, y, z), out: the side it stands on; fade: from q·out = fade[0] (gone, over the
// crown) to fade[1] (full).
const SHIELD_DOMES = {
  port: { c: [8, 12.5, 0], r: [11.8, 24, 6.5], out: [-1, 0], fade: [-0.1, 0.5] },
  star: { c: [SHIP_W - 8, 12.5, 0], r: [11.8, 24, 6.5], out: [1, 0], fade: [-0.1, 0.5] },
  front: { c: [22.2, 6.2, 0], r: [16.6, 12, 6.5], out: [0, -1], fade: [-0.1, 0.5] },   // (wide: over the wings too, like shieldYFront)
};
const SHIELD_WARN = 2.5;                             // its last seconds: it flickers (about to drop)
function domePoint(D, x, y, z) {                     // (x, y, z) pushed out (or in) onto the dome's surface
  const q = [(x - D.c[0]) / D.r[0], (y - D.c[1]) / D.r[1], (z - D.c[2]) / D.r[2]], n = Math.hypot(...q) || 1;
  return { x: D.c[0] + D.r[0] * q[0] / n, y: D.c[1] + D.r[1] * q[1] / n, z: D.c[2] + D.r[2] * q[2] / n };
}
function drawShieldDome(side, s, gen, grow, hits, t) {
  const D = SHIELD_DOMES[side];
  const warn = s.up < SHIELD_WARN ? 0.55 + 0.45 * (Math.sin(t * 38) > -0.3 ? 1 : 0) * (0.6 + 0.4 * Math.sin(t * 9)) : 1;
  GFX.dome({
    ...D, color: s.up < SHIELD_WARN ? [0.62, 0.78, 1.0] : [0.5, 0.8, 1.0], strength: warn, time: t, cell: 0.95,
    grow: [gen.x, gen.y, 0.6, grow < 1 ? 40 * grow : 1e4],
    hits: hits.map(h => ({ ...domePoint(D, h.x, h.y, 0.7), age: h.t / 0.8, heavy: h.heavy })),
  });
}
function drawShields(t) {
  for (const side of ['port', 'front', 'star']) {
    const s = combat.shields[side], hits = combat.shieldHits.filter(h => h.side === side);
    if (s.up <= 0 && !hits.length) continue;
    // reveal: a growing (then shrinking) circle around the shield generator (its emitter on the hull)
    const gen = emitterOf(side);
    const grow = s.up > 0 ? Math.min(1, (s.age || 0) / SHIELD_GROW, s.up / SHIELD_GROW) : 0;
    if (GFX.on) { if (grow > 0) drawShieldDome(side, s, gen, grow, hits, t); continue; }
    const R = 24 * grow;
    const near = (x, y) => clamp((R - Math.hypot(x - gen.x, y - gen.y)) / 2.5, 0, 1);
    if (side === 'front') {
      drawHexField(FRONT_SHIELD_X0, -6.8, FRONT_SHIELD_X1, 2.4, 0.45,
        (x, y) => (x < FRONT_SHIELD_X0 + 0.3 || x > FRONT_SHIELD_X1 - 0.3) ? 0 : clamp(1.15 - Math.abs(y - shieldYFront(x)) / 0.8, 0, 1) * near(x, y),
        '140,210,255', 0.8 * (grow > 0 ? 1 : 0), hits);
    } else {
      const x0 = side === 'port' ? -4.6 : SHIP_W + 1.4, x1 = x0 + 3.2;
      drawHexField(x0, -0.8, x1, 25.8, 0.45, (x, y) => clamp(1.15 - Math.abs(x - shieldX(side, y)) / 0.8, 0, 1) * near(x, y), '140,210,255', 0.8 * (grow > 0 ? 1 : 0), hits);
    }
    if (grow <= 0) continue;
    // the curtain's edge line, only as far as it has grown
    const pts = side === 'front'
      ? Array.from({ length: 48 }, (_, i) => { const x = FRONT_SHIELD_X0 + 0.3 + i * (FRONT_SHIELD_X1 - FRONT_SHIELD_X0 - 0.6) / 47; return [x, shieldYFront(x)]; })
      : Array.from({ length: 53 }, (_, i) => { const y = -0.5 + i * 0.5; return [shieldX(side, y), y]; });
    ctx.strokeStyle = 'rgba(200,240,255,0.7)'; ctx.lineWidth = 2.5;
    for (let i = 1; i < pts.length; i++) {
      if (near(...pts[i]) <= 0 || near(...pts[i - 1]) <= 0) continue;
      ctx.beginPath(); ctx.moveTo(L(pts[i - 1][0]), L(pts[i - 1][1])); ctx.lineTo(L(pts[i][0]), L(pts[i][1])); ctx.stroke();
    }
    if (grow < 1) {                                   // energy streaking out of the generator to the curtain
      const tgt = pts.reduce((a, p) => Math.hypot(p[0] - gen.x, p[1] - gen.y) < Math.hypot(a[0] - gen.x, a[1] - gen.y) ? p : a);
      const g = ctx.createLinearGradient(L(gen.x), L(gen.y), L(tgt[0]), L(tgt[1]));
      g.addColorStop(0, 'rgba(230,250,255,0.9)'); g.addColorStop(1, 'rgba(140,210,255,0.2)');
      ctx.strokeStyle = g; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(L(gen.x), L(gen.y)); ctx.lineTo(L(tgt[0]), L(tgt[1])); ctx.stroke();
    }
  }
  for (const h of combat.shieldHits) {             // shot being drained: shrinking orb + inward streaks
    const q = h.t / 0.8, r = (h.heavy ? 0.6 : 0.3) * (1 - q);
    if (r <= 0) continue;
    const g = ctx.createRadialGradient(L(h.x), L(h.y), 0, L(h.x), L(h.y), L(r) * 2.4);
    g.addColorStop(0, `rgba(255,255,255,${1 - q})`); g.addColorStop(0.4, h.heavy ? `rgba(255,140,200,${1 - q})` : `rgba(255,120,90,${1 - q})`); g.addColorStop(1, 'rgba(140,210,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(h.x), L(h.y), L(r) * 2.4, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(200,240,255,${0.8 * (1 - q)})`; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU + h.t * 3, d0 = L(0.9 * (1 - q) + 0.2), d1 = d0 * 0.4;
      ctx.beginPath(); ctx.moveTo(L(h.x) + Math.cos(a) * d0, L(h.y) + Math.sin(a) * d0); ctx.lineTo(L(h.x) + Math.cos(a) * d1, L(h.y) + Math.sin(a) * d1); ctx.stroke();
    }
  }
}

// The laser sight: while you aim your cannon with the keys (me.gunKeys: js/game.js gunKeyTurn), a thin red
// line runs from the muzzle the way a shell would fly (sinking from the muzzle like shellZ), fading out.
// Only in the gunner's own view; hidden while the cover is up.
const LASER_LEN = 34;
function drawLaserSight(t) {
  const g = me.mode === 'gun' && me.gunKeys && standing(me) && !(me.cover > 0.5) ? me.gun : null;
  if (!g) return;
  const dx = Math.cos(g.aim), dy = Math.sin(g.aim), z0 = muzzleZ(g), N = 24;
  const at = (d) => { const k = clamp(d / SHELL_DROP, 0, 1); return [L(g.x + dx * (1.15 + d)), L(g.y + dy * (1.15 + d) - GFX.lift(z0 * (1 - k * k * (3 - 2 * k))))]; };
  const flick = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < N; i++) {                       // (segments: each one fainter, so it fades into space)
    const d0 = LASER_LEN * i / N, d1 = LASER_LEN * (i + 1) / N, a = (1 - i / N) ** 1.6 * flick;
    const [x0, y0] = at(d0), [x1, y1] = at(d1);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.strokeStyle = `rgba(255,40,40,${0.2 * a})`; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = `rgba(255,90,80,${0.9 * a})`; ctx.lineWidth = 1.6; ctx.stroke();
  }
  const [mx, my] = at(0);                              // a small red dot on the muzzle
  ctx.fillStyle = `rgba(255,70,60,${0.9 * flick})`; ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, TAU); ctx.fill();
  ctx.restore();
}

function drawCombatFront(t) {
  if (GFX.on) { drawAsteroidOverlays(t); drawEnemyOverlays(t); drawOutsideOverlays(t); }   // over the sprite enemies (js/enemies.js, js/organic.js)
  drawShields(t);
  drawLaserSight(t);
  for (const s of combat.shells) {                 // lifted while they sink from the muzzle (shellZ; 0 in ?classic)
    const dx = s.vx / SHELL_SPEED, dy = s.vy / SHELL_SPEED;
    ctx.beginPath(); ctx.moveTo(L(s.x), L(s.y - GFX.lift(shellZ(s)))); ctx.lineTo(L(s.x - dx * 0.9), L(s.y - dy * 0.9 - GFX.lift(shellZ(s, 0.9))));
    ctx.strokeStyle = 'rgba(255,210,120,0.5)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
    ctx.strokeStyle = '#fff2c0'; ctx.lineWidth = 2.5; ctx.stroke();
  }
  for (const s of combat.shots) {
    const r = s.heavy ? 0.45 : 0.18, y = s.y - GFX.lift(shotZ(s));
    const g = ctx.createRadialGradient(L(s.x), L(y), 0, L(s.x), L(y), L(r) * 2.2);
    g.addColorStop(0, '#fff'); g.addColorStop(0.3, s.acid ? '#9cff5a' : s.heavy ? '#ff8ac0' : '#ff6a4a'); g.addColorStop(1, s.acid ? 'rgba(120,255,60,0)' : 'rgba(255,60,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(s.x), L(y), L(r) * 2.2, 0, TAU); ctx.fill();
  }
  if (typeof drawFoamDecals === 'function') drawFoamDecals(t);   // the extinguisher's foam (js/mission.js)
  for (const p of combat.fx) {
    if (p.flip) { if (GFX.on) drawFlip(p); continue; }
    if (p.foam && typeof drawFoamParticle === 'function') { drawFoamParticle(p, t); continue; }
    const slime = GFX.on ? SLIME_COLS.indexOf(p.col) : -1;   // organic slime: the drop sprites (organic/slime_drop_*, ~0.12 across)
    if (slime >= 0 && GFX.sprite(`organic/slime_drop_${slime}`, 0, p.x, p.y, 0, { layer: 'top', scale: p.size / 0.12, alpha: clamp(p.life / p.max, 0, 1), emissive: 0.4 })) continue;
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(L(p.x), L(p.y - GFX.lift(p.z || 0)), L(p.size), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (typeof drawHitFx === 'function') drawHitFx();   // hull hits, breaking parts: sparks, smoke, debris (js/hitfx.js)
}

// Screen-space overlays: hit bars on the screen edges, heavy-shot warning, tallies.
function drawCombatHUD(view, top) {
  const bar = (k, x, y, w, h, horiz) => {
    if (k <= 0) return;
    const g = horiz ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0);
    const a = 0.75 * k;
    if (horiz) { g.addColorStop(0, `rgba(230,50,40,${a})`); g.addColorStop(1, 'rgba(230,50,40,0)'); }
    else if (x === 0) { g.addColorStop(0, `rgba(230,50,40,${a})`); g.addColorStop(1, 'rgba(230,50,40,0)'); }
    else { g.addColorStop(0, 'rgba(230,50,40,0)'); g.addColorStop(1, `rgba(230,50,40,${a})`); }
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  };
  bar(combat.flashes.port, 0, top, 18, VH - top, false);
  bar(combat.flashes.star, VW - 18, top, 18, VH - top, false);
  bar(combat.flashes.front, 0, top, VW, 18, true);
  const bk = (k) => Math.min(1, k * 1.4);          // big hits: a wide flash from that side
  bar(bk(combat.bigFlashes.port), 0, top, VW * 0.35, VH - top, false);
  bar(bk(combat.bigFlashes.star), VW * 0.65, top, VW * 0.35, VH - top, false);
  bar(bk(combat.bigFlashes.front), 0, top, VW, (VH - top) * 0.35, true);

  // shields + enemy weak points (the hits-taken tally is on the end screen)
  const lines = [];
  for (const side of ['port', 'front', 'star']) {
    const s = combat.shields[side];
    const dead = broken(emitterOf(side)), st = dead ? 'EMITTER BROKEN' : s.up > 0 ? 'UP' : s.cd > 0 ? `recharging ${s.cd.toFixed(1)} s` : 'ready';
    lines.push({ text: `${SIDE_LABEL[side]} shield: ${st}`, col: dead ? '#ff8a7a' : s.up > 0 ? '#9cd8ff' : s.cd > 0 ? '#9aa3b5' : '#5fd6a0' });
  }
  for (const e of combat.enemies) {
    if (e.phase !== 'fighting') continue;
    lines.push({ text: `${e.D.name} (${e.side === 'port' ? 'left' : 'right'})${e.shieldUp ? ' — shield up' : ''}`, col: '#ffb0a0' });
    for (const p of e.pois) {
      const effect = p.id === 'crack' && e.blind > 0 ? `being duct-taped, can't fire for ${Math.ceil(e.blind)} s` : p.id === 'crack' ? 'taped up again' : p.effect;
      lines.push({ text: `  ${p.hit ? '✔' : '◯'} ${p.name}${p.hit ? ' — ' + effect : ''}`, col: p.hit ? '#5fd6a0' : POI_COLOR });
    }
  }
  if (combat.swarm || combat.asteroids.length)
    lines.push({ text: `Asteroids: ${combat.asteroids.length} incoming, ${combat.swarm ? combat.swarm.left : 0} more to come`, col: '#d8c8b0' });
  ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'top';
  const w = Math.max(...lines.map(l => ctx.measureText(l.text).width)) + 20, h = lines.length * 17 + 12;
  rr(VW - w - 14, top + 10, w, h, 6); ctx.fillStyle = 'rgba(10,12,18,0.7)'; ctx.fill();
  lines.forEach((l, i) => { ctx.fillStyle = l.col; ctx.fillText(l.text, VW - w - 4, top + 17 + i * 17); });

  let bannerBottom = 0;
  if (combat.banner) {                               // (after the shields list: it fits between that, the PRACTICE button and the sidebar)
    const text = combat.banner.text, { x0, x1, y: by } = bannerBand({ x: VW - w - 14, bottom: top + 10 + h }, top), room = x1 - x0 - 40;
    const lay = bannerLayout(text, room, (s, px) => { ctx.font = `800 ${px}px system-ui, sans-serif`; return ctx.measureText(s).width; });
    ctx.font = `800 ${lay.size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const bw = Math.max(...lay.lines.map(l => ctx.measureText(l).width)) + 40, lh = Math.round(lay.size * 1.25), bh = lay.lines.length * lh + 36 - lh;
    const cx = Math.abs(VW / 2 - (x0 + x1) / 2) + bw / 2 <= (x1 - x0) / 2 ? VW / 2 : (x0 + x1) / 2;   // short ones stay in the middle
    ctx.globalAlpha = clamp(combat.banner.t, 0, 1);
    ctx.fillStyle = 'rgba(10,12,18,0.7)'; rr(cx - bw / 2, by, bw, bh, 8); ctx.fill();
    ctx.fillStyle = '#ffe08a'; lay.lines.forEach((l, i) => ctx.fillText(l, cx, by + 18 + i * lh));
    ctx.textAlign = 'left'; ctx.globalAlpha = 1; bannerBottom = by + bh;
  }
  // heavy shot warnings: everyone sees and hears these
  let wy = Math.max(top + 54, bannerBottom + 8);   // (under a two-line banner)
  for (const e of combat.enemies) {
    if (e.charge < 0) continue;
    const text = `⚠ HEAVY SHOT CHARGING — ${e.side === 'port' ? 'LEFT' : 'RIGHT'} — RAISE SHIELD`;
    ctx.font = '700 14px system-ui, sans-serif';
    const k = e.charge / HEAVY_CHARGE, w = ctx.measureText(text).width + 40, x = VW / 2 - w / 2;
    rr(x, wy, w, 44, 8); ctx.fillStyle = 'rgba(40,10,25,0.85)'; ctx.fill(); stroke(2, '#ff8ac0');
    ctx.fillStyle = '#ffd0e6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, VW / 2, wy + 14);
    rr(x + 12, wy + 27, w - 24, 8, 4); ctx.fillStyle = '#2a1020'; ctx.fill();
    rr(x + 12, wy + 27, (w - 24) * k, 8, 4); ctx.fillStyle = '#ff8ac0'; ctx.fill();
    ctx.textAlign = 'left'; wy += 52;
  }

  // edge arrows towards threats that are off screen
  const threats = [...combat.enemies.filter(e => e.phase === 'fighting' && !e.D.backdrop && (!e.D.stealth || stealthAlpha(e) > 0.3)), ...combat.asteroids];
  for (const th of threats) {
    const sx = view.ox + L(th.x) * view.zoom, sy = view.oy + L(th.y) * view.zoom * (view.sy || 1);
    if (sx > 0 && sx < VW && sy > top && sy < VH) continue;
    const cx = VW / 2, cy = (VH + top) / 2, a = Math.atan2(sy - cy, sx - cx);
    const m = 30, kx = (VW / 2 - m) / Math.abs(Math.cos(a) || 1e-6), ky = ((VH - top) / 2 - m) / Math.abs(Math.sin(a) || 1e-6);
    const d = Math.min(kx, ky), px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    poly([[12, 0], [-8, -9], [-4, 0], [-8, 9]]); ctx.fillStyle = th.D ? '#ff6a4a' : '#d8c8b0'; ctx.fill(); stroke(2);
    ctx.restore();
  }
}
