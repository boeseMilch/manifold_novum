// Living enemies. They don't just shoot: weak spots heal, they grab, they chew, they seed.
//   Grappler      a squid that wraps a tentacle around the hull: that side's shield can't go up, and its
//                 acid weakens the hull plate. One cannon hit on the tentacle, or a spacewalker hacking it
//                 off, makes it let go; left alone it rips the plate off (a breach) and swims away with
//                 it, munching. Weak spots: the poison sac (acid pauses while it heals), the eye (no new
//                 tentacle while it heals), the beak (spits at spacewalkers; quiet while it heals). All
//                 three hit at once: it's done for. Cannon and spacewalk work together.
//   Leech swarm   small biters fly in and latch onto the hull, chewing parts in their column.
//                 Shoot them on the way in; shields don't stop them; latched ones are pried off on a spacewalk.
//   Spore mother  far out, puffs spore clouds (barnacles!); after each puff one of its sacs opens
//                 for a few seconds — that's when you can hit it.
//   Leviathan     too big to kill. For 30 s it brushes along the ship, bumping one room after another
//                 (the sidebar warns which); stay out of the room it's about to hit.
// Grappler and spore mother are enemy kinds (ENEMY_TYPES); leeches and the leviathan live in `org`.

const org = { leeches: [], lev: null, herd: null, boss: null };   // boss: the infested leviathan (js/leviathan.js)
const HEAL_TIME = 20, TENTACLE_EVERY = 10, TENTACLE_COIL = 2, CUT_TIME = 3, ACID_TIME = 30, BEAK_EVERY = 3.5, BEAK_WIND = 0.7;
const LEECH_CHEW = 20, LEECH_SPEED = 2.4, PUFF_EVERY = 12, SAC_OPEN = 4.5, MOTHER_TOSSES = 2, TOSS_REACH = 0.55, TOSS_FLICK = 0.3, TOSS_REST = 0.25, LEV_TIME = 30, LEV_STEP = 4;
const LEV_ORDER = ['starGun', 'starLock', 'reactor', 'portLock', 'portGun', 'bridge'];

// Organic things die in a burst of green slime.
function slimeBurst(x, y, n = 14, size = 0.1, z = 0) {   // z: up on something (a barnacle on the wall top)
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 1 + Math.random() * 4; combatFxAt(z, x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.8 + Math.random() * 0.6, ['#9cff5a', '#6ad13a', '#c8ff6e'][i % 3], size + Math.random() * size); }
  sfx.squelch?.();
}
function resetOrganic() { org.leeches = []; org.lev = null; org.herd = null; org.boss = null; }

// ---------------------------------------------------------------------------
// Grappler
// ---------------------------------------------------------------------------
const GRAPPLER_BODY = [[0, -2.8], [1.1, -2.2], [1.5, -0.8], [1.3, 0.8], [0.7, 1.6], [-0.7, 1.6], [-1.3, 0.8], [-1.5, -0.8], [-1.1, -2.2]];
ENEMY_TYPES.grappler = {
  name: 'Grappler', organic: true, dist: 13, size: [2.2, 3.4], amp: [2.0, 2.6], omega: 0.4, wear: 99, noGun: true, shotSpeed: 11,
  solids: [{ poly: GRAPPLER_BODY }],
  pois: [   // on the edge of the body facing us (a shell stops at the first solid thing it touches)
    // like a squid: the beak at the base of the arms, the eye just above it, the poison sac up on the mantle's flank
    { id: 'eye', name: 'Eye', effect: 'no new tentacle until it heals', shape: { circle: [1.45, 0.45, 0.32] } },
    { id: 'sac', name: 'Poison sac', effect: 'the acid stops until it heals', shape: { circle: [1.65, -0.85, 0.46] } },
    { id: 'beak', name: 'Beak', effect: 'no spitting until it heals', shape: { circle: [1.05, 1.35, 0.3] } },
  ],
  update(e, dt) {
    const T0 = e.tent || (e.tent = { state: 'idle', t: 6, x: 0, y: 0, acid: 0 });
    if (e.phase === 'leaving') {                         // swimming off with the hull plate, munching
      e.ax += (e.side === 'port' ? -1 : 1) * 4 * dt; e.ay -= 1.5 * dt; e.munch = (e.munch || 0) + dt;
      if (Math.abs(e.ax - SHIP_W / 2) > 60) e.phase = 'gone';
      return;
    }
    // weak spots heal on their own unless all three are hit in time
    for (const p of e.pois) if (p.hit) { p.healT = (p.healT || 0) + dt; if (p.healT >= HEAL_TIME && !e.pois.every(q => q.hit)) { p.hit = false; p.healT = 0; p.smoke = 0; } }
    T0.t -= dt;
    if (T0.state === 'idle' && T0.t <= 0 && !poiHit(e, 'eye')) { T0.state = 'coil'; T0.t = TENTACLE_COIL; }   // (blinded: it can't aim a throw)
    else if (T0.state === 'coil' && T0.t <= 0) {
      const room = e.side === 'port' ? 'portGun' : 'starGun', [hx, hy] = holeAt(room);   // it always grabs the upper room's outer wall
      Object.assign(T0, { state: 'attached', t: 0, x: hx + (e.side === 'port' ? -0.5 : 0.5), y: hy, room, acid: T0.acid || 0 });
      combat.shake = Math.max(combat.shake, 0.6); sfx.hit(true);
      combatBanner(`Tentacle on the ${SIDE_LABEL[e.side].toLowerCase()} side — no shield, acid on the hull!`);
    } else if (T0.state === 'attached') {
      if (!poiHit(e, 'sac')) T0.acid += dt;              // a shot-up poison sac: no acid while it heals
      if (T0.acid >= ACID_TIME) ripHull(e);
    }
    // the beak spits acid at spacewalkers on its side (a short windup: the beak opens)
    const eva = crew.filter(c => c.mode === 'eva' && standing(c) && (e.side === 'port' ? c.x < 2 : c.x > SHIP_W - 2));
    e.spitT = (e.spitT ?? BEAK_EVERY) - dt;
    if (!eva.length || poiHit(e, 'beak')) { e.spitT = Math.max(e.spitT, BEAK_WIND + 0.1); e.wind = 0; return; }
    e.wind = e.spitT < BEAK_WIND ? 1 - e.spitT / BEAK_WIND : 0;
    if (e.spitT <= 0) {
      e.spitT = BEAK_EVERY;
      const c = eva.sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
      const [bx, by] = enemyToWorld(e, 1.2, 1.5);
      enemyFire(e, bx, by, false, { atCrew: true, crewId: c.id, tx: c.x, ty: c.y });
      combat.shots[combat.shots.length - 1].acid = true; sfx.spit();
    }
  },
  onHit(e, p) { p.healT = 0; },
  draw(e, t) { drawGrappler(e, t); },
  drawExtra(e, t) { drawTentacle(e, t); },
  sprites: (e, t) => grapplerSprites(e, t), overlay: (e, t) => grapplerOverlay(e, t),   // (GFX.on: see the end of this file)
  under(e, t) { if (e.tent?.state === 'attached' && e.phase === 'fighting') tapered(tentaclePts(e, t), 10, 4.5, OUT, true, true); },   // the beads' dark outline
};
const grabbed = (side) => combat.enemies.some(e => e.kind === 'grappler' && e.phase === 'fighting' && e.tent?.state === 'attached' && e.side === side);
function cutTentacle(e, how) {
  e.tent.state = 'idle'; e.tent.t = TENTACLE_EVERY; sfx.alienHurt();
  combatBanner(how === 'eva' ? 'Tentacle hacked off!' : 'Tentacle shot through — it lets go!');
  for (let i = 0; i < 16; i++) combatFx(e.tent.x, e.tent.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.7, '#7a3a8a', 0.14);
}
// Too late: it rips the weakened plate off — a hull breach right where it held on — and leaves with it.
function ripHull(e) {
  const { x, y } = e.tent;
  breachRoom(e.tent.room || roomNearHull(e.side, y, x)); combat.shake = 1; sfx.explosion();     // a real hole, right where it held on
  for (let i = 0; i < 24; i++) combatFx(x, y, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.9, i % 2 ? '#8a93a5' : '#9cff5a', 0.16);
  combatBanner('The grappler ripped a hull plate off — and swims away munching on it!');
  e.tent.state = 'ripped'; e.phase = 'leaving';
}
function tentacleBase(e) { return enemyToWorld(e, 0.6, 1.6); }   // the grabbing arm is one of the arms

// ---------------------------------------------------------------------------
// Spore mother
// ---------------------------------------------------------------------------
// Huge: it fills the whole side and you only ever see its near flank. Local +x faces our ship.
const MOTHER_RX = 12, MOTHER_RY = 17;
const MOTHER_BODY = Array.from({ length: 40 }, (_, i) => { const a = i / 40 * TAU, w = 1 + 0.03 * Math.sin(i * 2.7) + 0.02 * Math.sin(i * 5.3); return [Math.cos(a) * MOTHER_RX * w, Math.sin(a) * MOTHER_RY * w]; });
const MOTHER_MOUTHS = [-6.5, 0, 6.5].map(y => [MOTHER_RX * Math.sqrt(1 - (y / MOTHER_RY) ** 2), y]);   // on the near flank
ENEMY_TYPES.mother = {
  name: 'Spore mother', organic: true, backdrop: true, dist: 31, size: [MOTHER_RX, MOTHER_RY], amp: [0.25, 0.35], omega: 0.1, wear: 99, noGun: true,
  solids: [{ poly: MOTHER_BODY }],
  // the weak spots: a blue tongue in each mouth, only out (and hittable) right after it flings spores
  pois: MOTHER_MOUTHS.map(([x, y], i) => ({ id: 'tongue' + i, name: ['Upper', 'Middle', 'Lower'][i] + ' tongue', effect: 'torn out', shape: { circle: [x + 0.8, y, 0.7] } })),
  update(e, dt) {
    e.puffT = (e.puffT ?? 6) - dt; e.open = Math.max(0, (e.open || 0) - dt); e.lash = Math.max(0, (e.lash || 0) - dt);
    if (e.puffT <= 0) {
      e.puffT = PUFF_EVERY;
      const shut = e.pois.map((p, i) => i).filter(i => !e.pois[i].hit);
      e.openSac = shut[(e.puffs = (e.puffs || 0) + 1) % shut.length]; e.open = SAC_OPEN;
      e.toss = { n: MOTHER_TOSSES, t: 0, out: false };
      combatBanner('The spore mother opens a mouth — its tongue is tossing spores, hit it!');
    }
    // the tongue reaches back into the throat, comes out with a spore and flicks it at us; then the next one
    const T1 = e.toss;
    if (T1 && e.open > 0) {
      T1.t += dt;
      if (!T1.out && T1.t >= TOSS_REACH + TOSS_FLICK * 0.6) {
        T1.out = true; const [mx, my] = MOTHER_MOUTHS[e.openSac];
        spawnSpores(e.side, enemyToWorld(e, mx + 2.6, my), 1, true); sfx.spit();
      }
      if (T1.t >= TOSS_REACH + TOSS_FLICK + TOSS_REST) { T1.t = 0; T1.out = false; if (--T1.n <= 0) e.toss = null; }
    } else if (T1) e.toss = null;
  },
  closed: (e, p) => !(e.open > 0 && e.pois.indexOf(p) === e.openSac),
  draw(e, t) { drawMother(e, t); },
  sprites: (e, t) => motherSprites(e, t), flames: (e, t) => drawCilia(e, t), overlay: (e, t) => motherOverlay(e, t),
};

// ---------------------------------------------------------------------------
// Leeches and the leviathan
// ---------------------------------------------------------------------------
function spawnLeeches(side) {
  for (let i = 0; i < 6; i++) {
    const [tx, ty] = HULL_SPOTS[side][i % HULL_SPOTS[side].length];
    org.leeches.push({ uid: newUid(), side, x: (side === 'port' ? -16 : SHIP_W + 16) - (side === 'port' ? 1 : -1) * i * 2.2, y: ty + (Math.random() - 0.5) * 8,
                       tx: tx + (side === 'port' ? -0.15 : 0.15), ty: ty + (Math.random() - 0.5) * 0.6, state: 'fly', chew: 0, t: Math.random() * 10 });
  }
  combatBanner(`Leech swarm on the ${SIDE_LABEL[side].toLowerCase()} side! Shoot them on the way in — shields don't stop them!`);
}
function startLeviathan() {
  const start = Math.floor(Math.random() * LEV_ORDER.length), dir = Math.random() < 0.5 ? 1 : -1;
  const order = Array.from({ length: 7 }, (_, i) => LEV_ORDER[(start + i * dir + LEV_ORDER.length * 7) % LEV_ORDER.length]);
  org.lev = { t: LEV_TIME, step: LEV_STEP, order, i: 0, x: 0 };
  combatBanner('LEVIATHAN — keep out of the rooms it\'s about to bump!'); sfx.say?.('Unidentified. Very large. Object.');
}
// The herd: two organic encounters at once, from one side, announced by a deep call through the hull
// (event kind `herd`: { kinds: [a, b], side }; makeEvent('herd') draws a pair). org.herd is the call
// (HERD_CALL s: the banner, the sidebar plate, a dark teal swell at that side of the screen).
const HERD_KINDS = ['grappler', 'leeches', 'mother', 'spores'], HERD_CALL = 8;
const HERD_NAMES = { grappler: 'grappler', leeches: 'leech swarm', mother: 'spore mother', spores: 'spore clouds' };
function herdPair() {
  const a = HERD_KINDS[Math.floor(Math.random() * HERD_KINDS.length)], rest = HERD_KINDS.filter(k => k !== a);
  return [a, rest[Math.floor(Math.random() * rest.length)]];
}
function startHerd(kinds = herdPair(), side = randSide()) {
  kinds = kinds.filter(k => HERD_KINDS.includes(k));
  for (const k of kinds) runEvent({ t: mission.t, kind: k, side, herd: true });   // (each one's own banner first…)
  org.herd = { side, kinds, t: HERD_CALL };
  combatBanner(`Something calls from the deep… they're coming together, ${SIDE_LABEL[side].toUpperCase()} side!`);   // (…then the call)
  sfx.whale?.(); combat.shake = Math.max(combat.shake, 0.4);
}
function updateOrganic(dt) {
  if (org.herd && (org.herd.t -= dt) <= 0) org.herd = null;
  // grappler tentacles: one cannon hit cuts them
  for (const e of combat.enemies) {
    if (e.kind !== 'grappler' || e.tent?.state !== 'attached') continue;
    if (e.phase !== 'fighting') { e.tent.state = 'idle'; continue; }
    const [bx, by] = tentacleBase(e);
    for (const s of combat.shells) if (!s.dead && segDist(s.x, s.y, bx, by, e.tent.x, e.tent.y) < 0.35) {
      s.dead = true;
      for (let i = 0; i < 6; i++) combatFx(s.x, s.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.5, '#7a3a8a', 0.1);
      cutTentacle(e); break;
    }
  }
  combat.shells = combat.shells.filter(s => !s.dead);
  // leeches fly in, latch on, chew
  for (const l of org.leeches) {
    l.t += dt;
    if (l.state === 'fly') {
      const dx = l.tx - l.x, dy = l.ty - l.y, d = Math.hypot(dx, dy);
      if (d < 0.15) { l.state = 'latched'; sfx.spit(); continue; }
      l.x += dx / d * Math.min(d, LEECH_SPEED * dt); l.y += dy / d * Math.min(d, LEECH_SPEED * dt) + Math.sin(l.t * 5) * dt * 0.6;
      for (const s of combat.shells) if (!s.dead && Math.hypot(s.x - l.x, s.y - l.y) < 0.85) { s.dead = true; l.dead = true; sfx.crack(); }
    } else if ((l.chew += dt) >= LEECH_CHEW) {
      l.chew = 0;
      const pool = SYSTEMS.filter(s => s.col === sideCol(l.side) && !s.broken);
      if (pool.length) { const s = pool[Math.floor(Math.random() * pool.length)]; breakSystem(s); combatBanner(`Leeches chewed through the ${s.name.toLowerCase()}!`); }
    }
    // (shields don't stop them: like spores and mines they slip through. The user, 2026-10-16. Shoot them on the way in, or pry them off outside.)
    if (l.dead) slimeBurst(l.x, l.y, 10);
  }
  combat.shells = combat.shells.filter(s => !s.dead);
  org.leeches = org.leeches.filter(l => !l.dead);
  // the leviathan
  const V = org.lev;
  if (V) {
    V.t -= dt; V.step -= dt; V.x += dt;
    if (V.step <= 0 && V.i < V.order.length) {
      V.step = LEV_STEP;
      const room = roomById(V.order[V.i++]);
      combat.shake = 1; sfx.explosion();
      combatBanner(`The leviathan bumped the ${room.name.toLowerCase()}!`);
      for (const c of crew) if (c.mode === 'inside' && roomAt(c.x, c.y) === room) hurtCrew(c);
      const [cx, cy] = roomCenter(room);
      smallHit(room.col === 0 ? 'port' : room.col === 2 ? 'star' : 'front', cx, cy);
    }
    if (V.t <= 0) { org.lev = null; combatBanner('The leviathan swims off into the dark'); }
  }
  if (typeof updateLevBoss === 'function') updateLevBoss(dt);   // chapter 8's infested leviathan (js/leviathan.js)
}

// On a spacewalk: hack a tentacle off, pry a leech off.
function organicEvaTarget(mx, my) {
  for (const e of combat.enemies) {
    if (e.kind !== 'grappler' || e.tent?.state !== 'attached') continue;
    const { x, y } = e.tent;
    if (Math.hypot(mx - x, my - y) > 0.8) continue;
    if (!near(x, y)) return { text: 'Tentacle — get closer', ok: false, x, y, r: 0.8 };
    const time = inv.weapon === 'repair' ? CUT_TIME * 0.6 : CUT_TIME;
    return holdTarget('cut' + e.uid, time, `Hold click: hack the tentacle off (${time.toFixed(1)} s)`, x, y, 0.8, () => cutTentacle(e, 'eva'));
  }
  for (const l of org.leeches) {
    if (l.state !== 'latched' || Math.hypot(mx - l.x, my - l.y) > 0.75) continue;
    if (!near(l.x, l.y)) return { text: 'Leech — get closer', ok: false, x: l.x, y: l.y, r: 0.5 };
    return holdTarget('leech' + l.uid, 1.5, 'Hold click: pry the leech off (1.5 s)', l.x, l.y, 0.5, () => { l.dead = true; slimeBurst(l.x, l.y, 10); org.leeches = org.leeches.filter(q => !q.dead); });
  }
  return null;
}

EVENT_SIDES.grappler = randSide; EVENT_SIDES.leeches = randSide; EVENT_SIDES.mother = randSide;
EVENT_RUNNERS.grappler = (ev) => combatSpawn('grappler', ev.side);
EVENT_RUNNERS.mother = (ev) => combatSpawn('mother', ev.side);
EVENT_RUNNERS.leeches = (ev) => spawnLeeches(ev.side);
EVENT_RUNNERS.leviathan = () => startLeviathan();
EVENT_SIDES.herd = randSide;
EVENT_RUNNERS.herd = (ev) => startHerd(ev.kinds?.length ? ev.kinds : herdPair(), ev.side || randSide());
Object.assign(EVENT_LABELS, {
  grappler: (ev) => `Grappler — ${SIDE_NAME[ev.side]}`, leeches: (ev) => `Leech swarm — ${SIDE_NAME[ev.side]}`,
  mother: (ev) => `Spore mother — ${SIDE_NAME[ev.side]}`, leviathan: () => 'Leviathan — front',
  herd: (ev) => `Herd: ${(ev.kinds || []).map(k => HERD_NAMES[k] || k).join(' + ') || 'organics'} — ${SIDE_NAME[ev.side]}`,
});

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// The grappler: a violet head-first squid. Beak and eye up front, a poison sac on its flank, a soft
// mantle with fins and glowing spots, six trailing arms. Its weak organs have the usual blue glow.
function tapered(pts, w0, w1, col, rim = true, rimOnly = false) {   // a smooth tapering limb along points (pixel coords)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = rim ? 0 : 1; pass < (rimOnly ? 1 : 2); pass++) for (let i = 1; i < pts.length; i++) {
    const k = (i - 0.5) / (pts.length - 1), w = lerp(w0, w1, k) * 2 + (pass ? 0 : 5);
    ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = pass ? col : OUT; ctx.lineWidth = w; ctx.stroke();
  }
  ctx.lineCap = 'butt';
}
function drawGrappler(e, t) {
  const coil = e.tent?.state === 'coil' ? 1 - e.tent.t / TENTACLE_COIL : 0, leaving = e.phase === 'leaving';
  // six trailing arms, rippling, with a row of pale suckers
  for (let i = 0; i < 6; i++) {
    const x0 = -0.95 + i * 0.38, pts = [];
    for (let k = 0; k <= 14; k++) { const u = k / 14; pts.push([L(x0 + Math.sin(t * 2.4 + i + u * 4) * 0.35 * u + (i - 2.5) * 0.12 * u), L(1.3 + u * (2.6 + (i % 2) * 0.5))]); }
    tapered(pts, 6.5, 1.8, i % 2 ? '#8a4a9a' : '#9a5aaa');
    for (let k = 2; k < 13; k += 2) { ctx.beginPath(); ctx.arc(pts[k][0] + 2, pts[k][1], 1.6, 0, TAU); ctx.fillStyle = 'rgba(255,220,250,0.6)'; ctx.fill(); }
  }
  // the grabbing arm: thick, coiling up before a throw (and holding the hull plate when leaving)
  if (e.tent?.state !== 'attached') {
    const k = 0.5 + coil * 0.5, pts = [];
    for (let j = 0; j <= 16; j++) { const u = j / 16, a = -1.2 + u * (2.0 + coil * 2.6); pts.push([L(0.6 + Math.cos(a) * (0.4 + u * 1.0) * k + u * 0.4), L(1.6 - Math.sin(a) * (0.4 + u * 1.0) * k + u * 0.6)]); }
    tapered(pts, 9, 3, coil ? '#c06ad0' : '#a55ab5');
  }
  // fins at the back of the mantle
  for (const sd of [-1, 1]) { poly(LP([[sd * 1.2, 0.2], [sd * 2.0, 0.9], [sd * 1.0, 1.4]])); ctx.fillStyle = '#7a3a8a'; ctx.fill(); stroke(2); }
  // the mantle: a soft, rounded shape through the body outline
  const B = LP(GRAPPLER_BODY);
  ctx.beginPath();
  for (let i = 0; i < B.length; i++) {
    const a = B[i], b = B[(i + 1) % B.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (i === 0) ctx.moveTo((B[B.length - 1][0] + a[0]) / 2, (B[B.length - 1][1] + a[1]) / 2);
    ctx.quadraticCurveTo(a[0], a[1], m[0], m[1]);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(L(0.4), L(-1.2), L(0.2), 0, L(-0.3), L(3));
  g.addColorStop(0, '#d79ae6'); g.addColorStop(0.55, '#8a44a0'); g.addColorStop(1, '#3e1650');
  ctx.fillStyle = g; ctx.fill(); stroke(3);
  ctx.save(); ctx.clip();
  ctx.fillStyle = 'rgba(40,10,55,0.35)'; ctx.fillRect(L(-0.25), L(-3), L(0.5), L(5));           // dorsal stripe
  for (let i = 0; i < 9; i++) {                                                           // glowing spots, twinkling
    const sx = -1.0 + (i * 0.73) % 2, sy = -2.0 + i * 0.4, a = 0.3 + 0.35 * Math.sin(t * 3 + i * 1.7);
    ctx.beginPath(); ctx.arc(L(sx), L(sy), L(0.07 + (i % 3) * 0.03), 0, TAU); ctx.fillStyle = `rgba(190,255,240,${a})`; ctx.fill();
  }
  ctx.restore();
  // weak organs (blue glow when intact), with a green ring while a hit one heals
  const [ex, ey, er] = e.pois[0].shape.circle, [sx, sy, sr] = e.pois[1].shape.circle, [bx, by, br] = e.pois[2].shape.circle;
  const eyeHit = poiHit(e, 'eye'), sacHit = poiHit(e, 'sac'), beakHit = poiHit(e, 'beak');
  for (const p of e.pois) if (!p.hit) { const [cx, cy, r] = p.shape.circle; blueGlow(cx, cy, r * 2.1, t); }
  // poison sac: a veined teardrop pouch bulging out of its flank, full of sloshing toxic green with
  // bubbles, a drop forming at its tip and a skull mark (shrivelled and leaking when hit)
  {
    const R0 = L(sr), puff = sacHit ? 0.7 : 1 + 0.05 * Math.sin(t * 4);
    ctx.save(); ctx.translate(L(sx), L(sy)); ctx.scale(puff, puff);
    const pouch = () => { ctx.beginPath(); ctx.arc(0, R0 * 0.08, R0, 0, TAU); };                    // a round bulb…
    ctx.beginPath(); ctx.moveTo(-R0 * 1.25, -R0 * 0.35); ctx.quadraticCurveTo(-R0 * 0.8, -R0 * 0.1, -R0 * 0.6, -R0 * 0.55); ctx.lineTo(-R0 * 0.75, R0 * 0.45); ctx.quadraticCurveTo(-R0 * 1.0, R0 * 0.25, -R0 * 1.3, R0 * 0.35); ctx.closePath();
    ctx.fillStyle = sacHit ? '#4a2a4a' : '#8a44a0'; ctx.fill(); stroke(1.8);                  // …on a fleshy stalk out of its flank
    pouch(); ctx.fillStyle = sacHit ? '#4a3d2a' : 'rgba(210,255,170,0.55)'; ctx.fill();
    if (!sacHit) {
      ctx.save(); pouch(); ctx.clip();
      const lvl = -R0 * 0.25 + Math.sin(t * 3) * 2;                                      // the poison, sloshing
      ctx.fillStyle = '#5fd12a'; ctx.fillRect(-R0 * 2, lvl, R0 * 4, R0 * 3);
      ctx.fillStyle = 'rgba(200,255,120,0.8)'; ctx.fillRect(-R0 * 2, lvl, R0 * 4, 2.5);
      for (let i = 0; i < 4; i++) { const q = (t * 0.9 + i / 4) % 1; ctx.beginPath(); ctx.arc(-R0 * 0.4 + i * R0 * 0.45, R0 * 0.9 - q * R0 * 1.1, 1.6 + i % 2, 0, TAU); ctx.strokeStyle = `rgba(230,255,200,${1 - q})`; ctx.lineWidth = 1.2; ctx.stroke(); }
      ctx.restore();
    }
    pouch(); stroke(2.2, sacHit ? OUT : '#3d8fe0');
    ctx.strokeStyle = sacHit ? 'rgba(20,10,10,0.5)' : 'rgba(90,30,110,0.55)'; ctx.lineWidth = 1.3;   // veins
    for (const [a, b, c2] of [[[-R0 * 0.85, -R0 * 0.6], [0, -R0 * 0.3], [R0 * 0.6, -R0 * 0.55]], [[-R0 * 0.9, -R0 * 0.1], [0, R0 * 0.2], [R0 * 0.9, R0 * 0.1]], [[-R0 * 0.6, R0 * 0.6], [0, R0 * 0.55], [R0 * 0.3, R0 * 1.0]]]) {
      ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo(...b, ...c2); ctx.stroke();
    }
    if (!sacHit) {
      for (const [gx, gy, gr] of [[-0.35, 0.35, 0.22], [0.3, 0.5, 0.18], [0.1, -0.05, 0.15]]) {   // glands floating in it
        ctx.beginPath(); ctx.arc(R0 * gx, R0 * gy, R0 * gr * (1 + 0.1 * Math.sin(t * 5 + gx * 9)), 0, TAU); ctx.fillStyle = 'rgba(40,120,20,0.55)'; ctx.fill();
      }
      ctx.beginPath(); ctx.ellipse(-R0 * 0.35, -R0 * 0.55, R0 * 0.25, R0 * 0.12, -0.5, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();   // wet shine
    }
    const q = (t * (sacHit ? 1.2 : 0.5)) % 1;                                              // a drop forming at the tip, falling
    ctx.beginPath(); ctx.ellipse(R0 * 0.1, R0 * 1.15 + q * (sacHit ? 16 : 6), 2 + q * 1.5, 2.5 + q * 2, 0, 0, TAU); ctx.fillStyle = `rgba(140,240,70,${1 - q * 0.7})`; ctx.fill();
    ctx.restore();
  }
  // eye: yellow iris with a slit pupil looking at the ship; shut and bleeding when hit
  ctx.beginPath(); ctx.ellipse(L(ex), L(ey), L(er), L(er) * 0.85, 0, 0, TAU); ctx.fillStyle = eyeHit ? '#5a2a4a' : '#f2eedf'; ctx.fill(); stroke(2.2, eyeHit ? OUT : '#3d8fe0');
  if (!eyeHit) {
    ctx.beginPath(); ctx.arc(L(ex) + 2, L(ey), L(er) * 0.62, 0, TAU); ctx.fillStyle = '#e8b02e'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(L(ex) + 4, L(ey), 2.2, L(er) * 0.5, 0, 0, TAU); ctx.fillStyle = OUT; ctx.fill();
    ctx.beginPath(); ctx.arc(L(ex) - 2, L(ey) - 4, 2, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
  } else {
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(L(ex - er * 0.8), L(ey)); ctx.quadraticCurveTo(L(ex), L(ey + er * 0.5), L(ex + er * 0.8), L(ey)); ctx.stroke();
    ctx.beginPath(); ctx.arc(L(ex) + 2, L(ey) + L(er) * 0.7 + ((t * 10) % 8), 1.8, 0, TAU); ctx.fillStyle = '#9cff5a'; ctx.fill();
  }
  // beak: two dark hooked jaws that open before it spits (and munch the hull plate when leaving)
  const open = beakHit ? 0 : leaving ? 0.5 + 0.5 * Math.sin((e.munch || 0) * 12) : (e.wind || 0);
  ctx.save(); ctx.translate(L(bx), L(by));
  if (!beakHit) { ctx.beginPath(); ctx.arc(0, 0, L(br), 0, TAU); ctx.strokeStyle = '#3d8fe0'; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.rotate(0.7);                                       // pointing out and down, from between the arms
  for (const sd of [-1, 1]) {                            // upper and lower jaw: curved, hooked, pale chitin
    const R0 = L(br) * 1.5;
    ctx.save(); ctx.rotate(sd * (0.15 + open * 0.55));
    ctx.beginPath(); ctx.moveTo(-R0 * 0.35, 0); ctx.quadraticCurveTo(-R0 * 0.2, sd * R0 * 0.75, R0 * 0.55, sd * R0 * 0.45);
    ctx.quadraticCurveTo(R0 * 1.05, sd * R0 * 0.3, R0 * 1.0, -sd * R0 * 0.05);           // the hook
    ctx.quadraticCurveTo(R0 * 0.55, sd * R0 * 0.05, -R0 * 0.35, 0); ctx.closePath();
    ctx.fillStyle = beakHit ? '#6a5a48' : sd < 0 ? '#e0cfa2' : '#cdb987'; ctx.fill(); stroke(1.8);
    ctx.strokeStyle = 'rgba(80,60,30,0.45)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-R0 * 0.1, sd * R0 * 0.25); ctx.quadraticCurveTo(R0 * 0.3, sd * R0 * 0.35, R0 * 0.7, sd * R0 * 0.25); ctx.stroke();
    ctx.restore();
  }
  if (beakHit) { ctx.strokeStyle = '#c9b38a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(2, 0); ctx.lineTo(-1, 5); ctx.stroke(); }   // cracked
  if (open > 0.3 && !leaving) { ctx.beginPath(); ctx.arc(L(br), 0, 3 + open * 3, 0, TAU); ctx.fillStyle = `rgba(156,255,90,${open})`; ctx.fill(); }      // acid welling up
  ctx.restore();
  if (leaving) {                                           // the hull plate in its jaws, with bites taken out
    ctx.save(); ctx.translate(L(bx + 0.5), L(by - 0.3)); ctx.rotate(0.4 + Math.sin((e.munch || 0) * 12) * 0.08);
    rr(-12, -9, 24, 18, 2); ctx.fillStyle = '#8a93a5'; ctx.fill(); stroke(2);
    ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(12, -3, 6, 0, TAU); ctx.arc(8, 8, 5, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2b303a'; ctx.fillRect(-8, -6, 3, 3); ctx.fillRect(-8, 3, 3, 3);
    ctx.restore();
  }
  for (const p of e.pois) if (p.hit && !leaving) {         // healing rings
    const [cx, cy, r] = p.shape.circle;
    ctx.beginPath(); ctx.arc(L(cx), L(cy), L(r) + 5, -Math.PI / 2, -Math.PI / 2 + (p.healT || 0) / HEAL_TIME * TAU); ctx.strokeStyle = '#9cff5a'; ctx.lineWidth = 3; ctx.stroke();
  }
}
function tentaclePts(e, t) {                             // the arm's curve (world px)
  const [bx, by] = tentacleBase(e), { x, y } = e.tent, pts = [];
  const mx = (bx + x) / 2, my = (by + y) / 2 + Math.sin(t * 2) * 0.8;
  for (let i = 0; i <= 24; i++) {
    const u = i / 24, qx = (1 - u) * (1 - u) * bx + 2 * (1 - u) * u * mx + u * u * x, qy = (1 - u) * (1 - u) * by + 2 * (1 - u) * u * my + u * u * y;
    pts.push([L(qx), L(qy) + Math.sin(t * 6 + u * 12) * 2 * u]);
  }
  return pts;
}
function drawTentacle(e, t) {
  if (e.tent?.state !== 'attached' || e.phase !== 'fighting') return;
  const { x, y } = e.tent, pts = tentaclePts(e, t);
  if (!(GFX.on && drawTentacleSprites(e, pts))) {
    tapered(pts, 10, 4.5, '#9a5aaa');
    for (let i = 2; i < 23; i += 2) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1] + 3, 2, 0, TAU); ctx.fillStyle = 'rgba(255,220,250,0.7)'; ctx.fill(); }   // suckers
    for (let i = 0; i < 3; i++) {                            // the tip coils around the hull
      ctx.beginPath(); ctx.arc(L(x), L(y + (i - 1) * 0.45), L(0.32), 0, TAU); ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = '#9a5aaa'; ctx.lineWidth = 5; ctx.stroke();
    }
  }
  // the acid at work: a spreading green stain, bubbles, and a ring showing how far it's eaten through
  const k = e.tent.acid / ACID_TIME, paused = poiHit(e, 'sac');
  const g = ctx.createRadialGradient(L(x), L(y), 0, L(x), L(y), L(0.5 + k * 1.2));
  g.addColorStop(0, `rgba(156,255,90,${0.5 + 0.3 * k})`); g.addColorStop(1, 'rgba(156,255,90,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(x), L(y), L(0.5 + k * 1.2), 0, TAU); ctx.fill();
  if (!paused) for (let i = 0; i < 4; i++) { const q = (t * 1.3 + i / 4) % 1; ctx.beginPath(); ctx.arc(L(x) + Math.sin(i * 2.3) * 10, L(y) + Math.cos(i * 1.7) * 10 - q * 10, 2 + q * 2, 0, TAU); ctx.strokeStyle = `rgba(200,255,150,${1 - q})`; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.beginPath(); ctx.arc(L(x), L(y), L(0.85), -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.strokeStyle = paused ? '#6b7486' : (k > 0.75 && Math.sin(t * 12) > 0 ? '#ff6a4a' : '#c8ff6e'); ctx.lineWidth = 4; ctx.stroke();
  if (me.mode === 'eva') jobMarker(x, y, t, Math.hypot(me.x - x, me.y - y) <= REACH + 1, '#c08aff');
}
// The spore mother: a vast, mottled mass. Three lipped mouths on its flank (a blue tongue lashes out of
// the open one), cilia waving along its edge, and a scatter of eyes that blink and follow the ship.
function drawMother(e, t) {
  const R = L(MOTHER_RX), RY = L(MOTHER_RY), breathe = 1 + 0.012 * Math.sin(t * 0.9);
  ctx.save(); ctx.scale(breathe, breathe);
  drawCilia(e, t, true);
  // the body: mottled, with a darker rim
  poly(LP(MOTHER_BODY));
  const g = ctx.createRadialGradient(R * 0.55, -RY * 0.1, R * 0.1, 0, 0, R * 1.05);
  g.addColorStop(0, '#d6c48c'); g.addColorStop(0.55, '#9c8752'); g.addColorStop(0.9, '#5e4c2c'); g.addColorStop(1, '#3a2e1a');
  ctx.fillStyle = g; ctx.fill(); stroke(4);
  ctx.save(); poly(LP(MOTHER_BODY)); ctx.clip();
  const r0 = rng(31);
  for (let i = 0; i < 70; i++) {                         // blotches and pores
    const x = (r0() * 2 - 1) * R, y = (r0() * 2 - 1) * RY, rad = 4 + r0() * 14;
    ctx.beginPath(); ctx.ellipse(x, y, rad, rad * (0.6 + r0() * 0.5), r0() * 3, 0, TAU); ctx.fillStyle = r0() < 0.5 ? 'rgba(90,70,35,0.35)' : 'rgba(230,214,160,0.25)'; ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,40,60,0.35)'; ctx.lineWidth = 2;   // veins running to the mouths
  for (const [mx, my] of MOTHER_MOUTHS) for (let k = 0; k < 3; k++) {
    ctx.beginPath(); ctx.moveTo(L(mx), L(my)); ctx.bezierCurveTo(L(mx - 2), L(my + (k - 1) * 2), L(mx - 4), L(my + (k - 1) * 3.5), L(mx - 6 - k), L(my + (k - 1) * 5)); ctx.stroke();
  }
  ctx.restore();
  // eyes, just for looks: they blink now and then and look towards our ship
  const r1 = rng(77);
  for (let i = 0; i < 9; i++) {
    const y = (r1() * 1.7 - 0.85) * MOTHER_RY, edge = MOTHER_RX * Math.sqrt(Math.max(0, 1 - (y / MOTHER_RY) ** 2)), x = edge - 1.2 - r1() * 3, rad = L(0.25 + r1() * 0.35);
    if (MOTHER_MOUTHS.some(([mx, my]) => Math.hypot(mx - x, my - y) < 2.2)) continue;
    const blink = Math.sin(t * 0.7 + i * 2.3) > 0.97 ? 0.15 : 1;
    ctx.beginPath(); ctx.ellipse(L(x), L(y), rad * 1.3, rad * blink, 0, 0, TAU); ctx.fillStyle = '#f0ead2'; ctx.fill(); stroke(2);
    if (blink > 0.5) { ctx.beginPath(); ctx.arc(L(x) + rad * 0.45, L(y), rad * 0.55, 0, TAU); ctx.fillStyle = '#7a3a2a'; ctx.fill(); ctx.beginPath(); ctx.arc(L(x) + rad * 0.55, L(y), rad * 0.25, 0, TAU); ctx.fillStyle = OUT; ctx.fill(); }
  }
  // the three mouths: recesses in the body itself. Shut: a puckered, creased seam. Open: the flesh parts
  // into a deep red gullet framed by puffy lips of its own hide, and the blue tongue works inside it.
  e.pois.forEach((p, i) => {
    const [mx, my] = MOTHER_MOUTHS[i], openNow = e.open > 0 && e.openSac === i && !p.hit;
    const gape = p.hit ? 0.45 : openNow ? Math.min(1, (SAC_OPEN - e.open) * 5, e.open * 2.5) : 0;
    ctx.save(); ctx.translate(L(mx), L(my));
    const H = L(1.6), D = L(1.7);                        // half height of the mouth, depth of the recess into the body
    const cavity = (k) => {                              // the opening: a lens shape, cut in from the body's edge
      ctx.beginPath(); ctx.moveTo(L(0.05), -H * k);                                   // (its outer side follows the body's edge)
      ctx.bezierCurveTo(-D * 0.35, -H * k * 1.05, -D, -H * k * 0.55, -D, 0);
      ctx.bezierCurveTo(-D, H * k * 0.55, -D * 0.35, H * k * 1.05, L(0.05), H * k);
      ctx.quadraticCurveTo(L(0.15), 0, L(0.05), -H * k); ctx.closePath();
    };
    // puffy lips: swellings of the hide all around the opening (always there; they part when it opens)
    if (gape > 0.05) for (const sd of [-1, 1]) {           // (shut: no lips, just the crease)
      ctx.beginPath(); ctx.ellipse(-D * 0.5, sd * H * (0.22 + 0.78 * gape), D * 0.52, L(0.36) * (0.6 + 0.4 * gape), sd * 0.15, 0, TAU);   // (inside the flank, not sticking out)
      const lg = ctx.createLinearGradient(0, sd * H * gape - L(0.4), 0, sd * H * gape + L(0.4));
      lg.addColorStop(0, '#b39c62'); lg.addColorStop(1, '#7a6438'); ctx.fillStyle = lg; ctx.fill();
      ctx.strokeStyle = 'rgba(40,30,15,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    if (gape > 0.02) {
      cavity(gape);
      const cg = ctx.createRadialGradient(-D * 0.6, 0, 2, -D * 0.3, 0, D);
      cg.addColorStop(0, '#1a0408'); cg.addColorStop(0.6, '#5a141e'); cg.addColorStop(1, '#a03a44');
      ctx.fillStyle = cg; ctx.fill(); stroke(2.5);
      ctx.save(); cavity(gape); ctx.clip();               // ridges of the gullet
      ctx.strokeStyle = 'rgba(200,90,100,0.35)'; ctx.lineWidth = 2;
      for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.ellipse(-D * 0.15 * k, 0, L(0.2), H * gape * (1 - k * 0.18), 0, 0, TAU); ctx.stroke(); }
      ctx.restore();
    } else {                                             // shut: a creased seam with puckered wrinkles around it
      ctx.strokeStyle = 'rgba(40,25,10,0.8)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(L(0.2), -L(0.35)); ctx.quadraticCurveTo(-D * 0.5, 0, L(0.2), L(0.35)); ctx.stroke();   // an inward crease
      ctx.strokeStyle = 'rgba(40,25,10,0.3)'; ctx.lineWidth = 1.3;
      for (let k = -2; k <= 2; k++) { if (!k) continue; ctx.beginPath(); ctx.moveTo(-D * 0.3, k * L(0.12)); ctx.quadraticCurveTo(-D * 0.55, k * L(0.25), -D * 0.8, k * L(0.32)); ctx.stroke(); }
    }
    if (openNow) {                                       // the tongue lives in the gullet: its root vanishes into the dark throat
      ctx.save(); cavity(gape); ctx.clip(); drawTongue(e, t, D, H * gape);           // inside the gullet…
      const tg = ctx.createRadialGradient(-D, 0, 0, -D, 0, D * 0.7); tg.addColorStop(0, 'rgba(20,4,8,0.95)'); tg.addColorStop(1, 'rgba(20,4,8,0)');
      ctx.fillStyle = tg; ctx.fillRect(-D * 1.2, -H, D, H * 2);
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(-L(0.15), -L(6), L(8), L(12)); ctx.clip(); drawTongue(e, t, D, H * gape, true); ctx.restore();   // …and out in space
    }
    else if (p.hit) for (let k = 0; k < 2; k++) {        // a torn-out tongue: the gullet bleeds slime
      const q = (t * 0.7 + k / 2) % 1; ctx.beginPath(); ctx.arc(L(0.3) + q * 12, (k - 0.5) * 8 + q * 6, 3, 0, TAU); ctx.fillStyle = `rgba(156,255,90,${1 - q})`; ctx.fill();
    }
    ctx.restore();
  });
  ctx.restore();
}
// Cilia all along the edge, waving in slow travelling waves (under the body: the sprite's back layer too).
function drawCilia(e, t, scaled = false) {
  const R = L(MOTHER_RX), RY = L(MOTHER_RY), breathe = 1 + 0.012 * Math.sin(t * 0.9);
  ctx.save(); if (!scaled) ctx.scale(breathe, breathe);
  ctx.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const a = i / 160 * TAU, cx = Math.cos(a) * R, cy = Math.sin(a) * RY, nx = Math.cos(a) / MOTHER_RX, ny = Math.sin(a) / MOTHER_RY, nl = Math.hypot(nx, ny);
    const len = 20 + 8 * Math.sin(i * 1.7), w = Math.sin(t * 2.2 - i * 0.35) * 0.6;
    const ux = nx / nl, uy = ny / nl, tx = cx + (ux * Math.cos(w) - uy * Math.sin(w)) * len, ty = cy + (uy * Math.cos(w) + ux * Math.sin(w)) * len;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + ux * len * 0.6, cy + uy * len * 0.6, tx, ty);
    ctx.strokeStyle = OUT; ctx.lineWidth = 4.5; ctx.stroke(); ctx.strokeStyle = scaled ? '#d8c48e' : '#9c8752'; ctx.lineWidth = 2.5; ctx.stroke();
  }
  ctx.restore();
}
// The tongue, in mouth-local pixels (x out of the body). While tossing: it curls back deep into the
// gullet, comes out with a spore stuck to its tip and flicks it out; then it hangs out, wagging.
function tonguePose(e, t, D) {                           // where its tip is (mouth-local px), and whether it carries a spore
  const T1 = e.toss;
  let reach, carry = false;                              // reach: where the tip is (px, + = out of the mouth)
  if (T1) {
    const u = T1.t;
    if (u < TOSS_REACH) { reach = lerp(L(0.6), -D * 0.85, Math.sin(u / TOSS_REACH * Math.PI / 2)); carry = u > TOSS_REACH * 0.6; }
    else if (u < TOSS_REACH + TOSS_FLICK) { const k = (u - TOSS_REACH) / TOSS_FLICK; reach = lerp(-D * 0.85, L(3.4), k * k); carry = !T1.out; }
    else reach = lerp(L(3.4), L(1.6), (u - TOSS_REACH - TOSS_FLICK) / TOSS_REST);
  } else reach = L(1.6) + Math.sin(t * 2) * 4;            // hanging out
  return { tipX: reach, tipY: Math.sin(t * 5) * 6 * (reach > 0 ? 1 : 0.3), carry };
}
function drawTongue(e, t, D, H, outside = false) {
  const { tipX, tipY, carry } = tonguePose(e, t, D), base = -D * 0.95, w0 = Math.min(L(0.55), H * 0.8 + 3);
  if (outside) blueGlow(0.9, 0, 1.3, t);
  ctx.beginPath(); ctx.moveTo(base, -w0);
  ctx.bezierCurveTo(lerp(base, tipX, 0.4), -w0 * 1.1, lerp(base, tipX, 0.85), -w0 * 0.7 + tipY, tipX, tipY);
  ctx.bezierCurveTo(lerp(base, tipX, 0.85), w0 * 0.7 + tipY, lerp(base, tipX, 0.4), w0 * 1.1, base, w0); ctx.closePath();
  ctx.fillStyle = bluePaint(0, -0.5, 1.5, 0.5, t, false); ctx.fill(); stroke(2);
  ctx.strokeStyle = 'rgba(10,40,90,0.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(base * 0.7, 0); ctx.lineTo(tipX * 0.9, tipY * 0.9); ctx.stroke();   // the groove
  if (carry) {                                           // the spore, stuck to the tip
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + t * 2; ctx.beginPath(); ctx.arc(tipX + Math.cos(a) * 5, tipY + Math.sin(a) * 5, 6, 0, TAU); ctx.fillStyle = 'rgba(220,240,170,0.8)'; ctx.fill(); }
    ctx.beginPath(); ctx.arc(tipX, tipY, 5, 0, TAU); ctx.fillStyle = '#c8b0e0'; ctx.fill(); stroke(1);
  }
}
function drawOrganicWorld(t) {
  if (typeof drawLevShip === 'function') drawLevShip(t);   // the boss fight's vents, override panel and brood (js/leviathan.js)
  for (const l of org.leeches) {                       // leeches: segmented, wriggling
    const ang = l.state === 'fly' ? Math.atan2(l.ty - l.y, l.tx - l.x) : (l.side === 'port' ? 0 : Math.PI);
    if (l.state === 'fly') for (let k = 1; k < 5; k++) {   // a glistening slime trail
      ctx.beginPath(); ctx.arc(L(l.x) - Math.cos(ang) * (k + 3) * 13, L(l.y) - Math.sin(ang) * (k + 3) * 13 + Math.sin(l.t * 6 + k) * 3, 6 - k, 0, TAU); ctx.fillStyle = `rgba(200,255,150,${0.35 - k * 0.07})`; ctx.fill();
    }
    if (GFX.on && drawLeechSprite(l, ang)) { drawLeechChew(l, t); continue; }
    const bite = l.state === 'latched' ? (l.side === 'port' ? 1 : -1) * L(0.25) : 0;   // latched: the mouth on the hull's edge (as the sprite)
    ctx.save(); ctx.translate(L(l.x) + bite, L(l.y)); ctx.rotate(ang); ctx.scale(1.7, 1.7);   // big enough to see from a cannon
    const squirm = l.state === 'latched' ? 1.5 : 3, pulse = l.state === 'latched' ? 1 + 0.12 * Math.sin(l.t * 9) : 1;
    for (let i = 4; i >= 0; i--) {                         // a fat, ringed worm-body, wriggling
      const cx = -i * 9 + Math.sin(l.t * 8 + i) * squirm, cy = Math.sin(l.t * 6 + i * 1.2) * 3, rx = (11 - i * 1.6) * pulse, ry = (9 - i * 1.3) * pulse;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      const g = ctx.createRadialGradient(cx - 2, cy - 3, 1, cx, cy, rx); g.addColorStop(0, '#d0606e'); g.addColorStop(1, '#6a1e2e');
      ctx.fillStyle = g; ctx.fill(); stroke(1.8);
      ctx.strokeStyle = 'rgba(40,5,15,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.35, ry * 0.85, 0, 0, TAU); ctx.stroke();   // ring
    }
    ctx.beginPath(); ctx.arc(6, 0, 6, 0, TAU); ctx.fillStyle = '#2a0810'; ctx.fill(); stroke(1.5);   // the round mouth, full of little teeth
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + l.t * 2; ctx.beginPath(); ctx.moveTo(6 + Math.cos(a) * 6, Math.sin(a) * 6); ctx.lineTo(6 + Math.cos(a + 0.2) * 2.5, Math.sin(a + 0.2) * 2.5); ctx.lineTo(6 + Math.cos(a + 0.4) * 6, Math.sin(a + 0.4) * 6); ctx.fillStyle = '#f0e8d0'; ctx.fill(); }
    ctx.restore();
    drawLeechChew(l, t);
  }
  const V = org.lev;
  if (V && !(GFX.on && drawLeviathanSprites(V, t))) {                                             // the leviathan: a vast dark flank sliding past, an eye the size of a room
    // a whale of the deep: a vast, tapering body gliding past along one side, flippers, a tail fluke,
    // glowing stripes and an eye bigger than a room; it rolls slightly as it swims
    const side = V.order[V.i]?.startsWith('port') ? -1 : 1, x = side < 0 ? -14.5 : SHIP_W + 14.5, y = -36 + (LEV_TIME - V.t) * 2.6;
    ctx.save(); ctx.translate(L(x), L(y)); ctx.scale(-side, 1); ctx.rotate(Math.sin(t * 0.4) * 0.03);
    const body = (k = 1) => {                              // head (front, +y) to tail
      ctx.beginPath(); ctx.moveTo(0, L(30) * k);
      ctx.bezierCurveTo(L(9) * k, L(26) * k, L(9.5) * k, L(5) * k, L(6) * k, -L(14) * k);
      ctx.bezierCurveTo(L(4) * k, -L(24) * k, L(1.5) * k, -L(30) * k, 0, -L(34) * k);
      ctx.bezierCurveTo(-L(1.5) * k, -L(30) * k, -L(4) * k, -L(24) * k, -L(6) * k, -L(14) * k);
      ctx.bezierCurveTo(-L(9.5) * k, L(5) * k, -L(9) * k, L(26) * k, 0, L(30) * k); ctx.closePath();
    };
    const sw = Math.sin(t * 1.2);
    for (const sd of [-1, 1]) {                            // the tail fluke
      ctx.beginPath(); ctx.moveTo(0, -L(33)); ctx.quadraticCurveTo(sd * L(5), -L(36) + sw * L(1.2), sd * L(8), -L(40) + sw * L(2)); ctx.quadraticCurveTo(sd * L(3), -L(36), 0, -L(34));
      ctx.fillStyle = '#16283a'; ctx.fill(); stroke(3);
    }
    for (const sd of [-1, 1]) {                            // flippers
      ctx.save(); ctx.translate(sd * L(8), L(10)); ctx.rotate(sd * (0.6 + 0.15 * Math.sin(t * 0.8 + sd)));
      ctx.beginPath(); ctx.ellipse(sd * L(3), 0, L(5), L(1.5), 0, 0, TAU); ctx.fillStyle = '#1a2e42'; ctx.fill(); stroke(3); ctx.restore();
    }
    body();
    const g = ctx.createLinearGradient(-L(9), 0, L(9), 0); g.addColorStop(0, '#0a1420'); g.addColorStop(0.45, '#1f3a52'); g.addColorStop(0.7, '#2a4a62'); g.addColorStop(1, '#0e1a26');
    ctx.fillStyle = g; ctx.fill(); stroke(4);
    ctx.save(); body(); ctx.clip();
    ctx.fillStyle = 'rgba(200,215,225,0.18)'; ctx.beginPath(); ctx.ellipse(L(5), L(8), L(3), L(18), 0, 0, TAU); ctx.fill();   // pale belly
    ctx.strokeStyle = 'rgba(10,20,30,0.45)'; ctx.lineWidth = 3;                             // throat grooves
    for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(L(2 + k * 0.9), L(28)); ctx.quadraticCurveTo(L(4 + k), L(18), L(3 + k * 0.8), L(8)); ctx.stroke(); }
    const r2 = rng(5);                                     // barnacle crusts and scars
    for (let k = 0; k < 18; k++) { ctx.beginPath(); ctx.arc(L(-6 + r2() * 12), L(-20 + r2() * 44), L(0.2 + r2() * 0.35), 0, TAU); ctx.fillStyle = 'rgba(160,170,150,0.35)'; ctx.fill(); }
    for (let k = 0; k < 16; k++) {                          // two rows of glowing spots, pulsing down the body
      const yy = -26 + k * 3.3, a = 0.35 + 0.45 * Math.max(0, Math.sin(t * 2.5 - k * 0.5));
      for (const xx of [-3.5, -1.5]) { ctx.beginPath(); ctx.arc(L(xx + Math.sin(k) * 0.4), L(yy), L(0.32), 0, TAU); ctx.fillStyle = `rgba(122,240,255,${a})`; ctx.fill(); }
    }
    ctx.restore();
    const blink = Math.sin(t * 0.5) > 0.985 ? 0.1 : 1;     // the eye, near the head, looking at the ship
    ctx.beginPath(); ctx.ellipse(L(6.2), L(18), L(1.8), L(1.3) * blink, 0.2, 0, TAU); ctx.fillStyle = '#e8c34f'; ctx.fill(); stroke(3);
    if (blink > 0.5) { ctx.beginPath(); ctx.ellipse(L(6.8), L(18), L(0.35), L(1.0), 0.2, 0, TAU); ctx.fillStyle = OUT; ctx.fill(); ctx.beginPath(); ctx.arc(L(5.9), L(17.5), L(0.25), 0, TAU); ctx.fillStyle = '#fff8d0'; ctx.fill(); }
    ctx.restore();
  }
}
function drawLeechChew(l, t) {                         // latched: how far it has chewed, and the spacewalk job
  if (l.state !== 'latched') return;
  ctx.beginPath(); ctx.arc(L(l.x), L(l.y), 13, -Math.PI / 2, -Math.PI / 2 + l.chew / LEECH_CHEW * TAU); ctx.strokeStyle = '#ff6a7a'; ctx.lineWidth = 2.5; ctx.stroke();
  if (me.mode === 'eva') jobMarker(l.x, l.y, t, Math.hypot(me.x - l.x, me.y - l.y) <= REACH + 1, '#ff6a7a');
}
// The room the leviathan will bump next: a red warning wash on its floor.
function drawLeviathanWarning(t) {
  if (typeof drawLevWarning === 'function') drawLevWarning(t);   // (the boss's tail flicks: js/leviathan.js)
  const V = org.lev;
  if (!V || V.i >= V.order.length) return;
  const r = roomById(V.order[V.i]), k = 0.12 + 0.12 * (1 - V.step / LEV_STEP) * (0.6 + 0.4 * Math.sin(t * 10));
  ctx.fillStyle = `rgba(255,40,30,${k})`;
  for (const q of r.rects) ctx.fillRect(L(q.x), L(q.y), L(q.w), L(q.h));
}
function organicPlates(add) {
  const latched = org.leeches.filter(l => l.state === 'latched').length;
  if (org.leeches.length) add('leeches', { icon: 'spore', title: 'LEECH SWARM', sub: `${org.leeches.length - latched} incoming, ${latched} chewing · shoot them / pry them off outside`, stripe: '#ff6a7a', red: true });
  for (const e of combat.enemies) if (e.kind === 'grappler' && e.tent?.state === 'attached' && e.phase === 'fighting')
    add('tent' + uid(e), { icon: 'spore', title: 'TENTACLE', sub: `${SIDE_LABEL[e.side].toLowerCase()} · acid ${Math.round(e.tent.acid / ACID_TIME * 100)}%${poiHit(e, 'sac') ? ' (paused)' : ''} · shoot it or hack it off`, stripe: '#c08aff', red: true });
  if (org.herd) add('herd', { icon: 'spore', title: 'THE HERD', sub: `${org.herd.kinds.map(k => HERD_NAMES[k] || k).join(' + ')} · together, ${SIDE_LABEL[org.herd.side].toLowerCase()} side`, stripe: '#4ad0b0', red: true });
  const V = org.lev;
  if (typeof levBossPlates === 'function') levBossPlates(add);
  if (V) add('lev', { icon: 'unknown', title: 'LEVIATHAN', sub: `next: ${V.order.slice(V.i, V.i + 3).map(id => roomById(id).name.toLowerCase()).join(' → ')}`, stripe: '#7af0ff', red: true });
}

// ---------------------------------------------------------------------------
// Sprites (GFX.on): tools/blender/models/organic/*.py. The grappler and the spore mother are listed like
// the other enemies (D.sprites, drawn by drawEnemySprite in js/enemies.js, 'under' the hull); the
// leviathan goes there too. Leeches, the tentacle, spores and barnacles are on or at the hull: 'main'.
// Weak organs project onto the game's POI circles at z = 0 (so the flat hit tests match what you see).
// ---------------------------------------------------------------------------
function grapplerSprites(e, t) {
  const sd = sideName(e), leaving = e.phase === 'leaving', hit = (id) => poiHit(e, id);
  const coil = e.tent?.state === 'coil' ? 1 - e.tent.t / TENTACLE_COIL : 0;
  const out = [{ n: `organic/grappler_${sd}`, f: Math.floor(t / 2.6 * 8) }];
  if (e.tent?.state !== 'attached') out.push({ n: `organic/grappler_${sd}_grab_c${clamp(Math.round(coil * 4), 0, 4)}` });
  out.push({ n: `organic/grappler_${sd}_eye_${hit('eye') ? 'hit' : 'ok'}`, emissive: 0.6 });
  out.push(hit('sac') ? { n: `organic/grappler_${sd}_sac_hit` } : { n: `organic/grappler_${sd}_sac_ok`, f: Math.floor(t * 4), emissive: 0.6 });
  const open = leaving ? 0.5 + 0.5 * Math.sin((e.munch || 0) * 12) : (e.wind || 0);
  out.push(hit('beak') ? { n: `organic/grappler_${sd}_beak_hit` } : { n: `organic/grappler_${sd}_beak_ok`, f: clamp(Math.round(open * 3), 0, 3), emissive: 0.6 });
  if (leaving) { const [bx, by] = e.pois[2].shape.circle; out.push({ n: 'organic/grappler_plate', at: [bx + 0.5, by - 0.3], rot: e.dir * (0.4 + Math.sin((e.munch || 0) * 12) * 0.08) }); }
  return out;
}
function grapplerOverlay(e, t) {                         // healing rings (enemy-local, mirrored)
  if (e.phase === 'leaving') return;
  for (const p of e.pois) if (p.hit) {
    const [cx, cy, r] = p.shape.circle;
    ctx.beginPath(); ctx.arc(L(cx), L(cy), L(r) + 5, -Math.PI / 2, -Math.PI / 2 + (p.healT || 0) / HEAL_TIME * TAU); ctx.strokeStyle = '#9cff5a'; ctx.lineWidth = 3; ctx.stroke();
  }
}
// The tentacle holding the hull: beads (organic/tentacle_seg_<side>, 16 directions) chained along the
// drawn curve every 0.13 units, tapering from the squid to the hull, then the coil round the plate.
// pts: the curve in world px (drawTentacle's).
function drawTentacleSprites(e, pts) {
  const sd = sideName(e), seg = `organic/tentacle_seg_${sd}`, coil = `organic/tentacle_coil_${sd}`;
  if (!GFX.ready(seg) || !GFX.ready(coil)) return false;
  const P = pts.map(([x, y]) => [x / T, y / T]), len = [0];
  for (let i = 1; i < P.length; i++) len.push(len[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const total = len[len.length - 1], sortY = e.tent.y + 0.6;
  for (let d = 0, i = 1; d <= total; d += 0.13) {
    while (i < P.length - 1 && len[i] < d) i++;
    const k = (d - len[i - 1]) / (len[i] - len[i - 1] || 1), [ax, ay] = P[i - 1], [bx, by] = P[i];
    GFX.sprite(seg, GFX.frameIndex(seg, Math.atan2(by - ay, bx - ax)), lerp(ax, bx, k), lerp(ay, by, k), 0, { layer: 'main', sortY, scale: lerp(1, 0.45, d / total), depthBias: 1 });
  }
  GFX.sprite(coil, 0, e.tent.x, e.tent.y, 0, { layer: 'main', sortY, depthBias: 1 });   // (in front of the outer wall it wraps round)
  return true;
}
// The spore mother: body + mouth patches (g1..g3 by the gape, hit), the tongue stretched and turned to
// where the game has its tip (with the spore it carries), the nine eyes blinking. Breathing scales it all.
function motherSprites(e, t) {
  const sd = sideName(e), b = 1 + 0.012 * Math.sin(t * 0.9), out = [{ n: `organic/mother_${sd}`, scale: b }];
  const at = (lx, ly) => [lx * b, ly * b];
  e.pois.forEach((p, i) => {
    const openNow = e.open > 0 && e.openSac === i && !p.hit;
    const gape = p.hit ? 0.45 : openNow ? Math.min(1, (SAC_OPEN - e.open) * 5, e.open * 2.5) : 0;
    if (p.hit) out.push({ n: `organic/mother_${sd}_m${i}_hit`, scale: b });
    else if (gape > 0.17) out.push({ n: `organic/mother_${sd}_m${i}_g${gape < 0.525 ? 1 : gape < 0.85 ? 2 : 3}`, scale: b });
    if (openNow) {
      const [mx, my] = MOTHER_MOUTHS[i], { tipX, tipY, carry } = tonguePose(e, t, L(1.7)), base = -1.7 * 0.95;
      const tx = tipX / T, ty = tipY / T, len = tx - base;
      if (len > 0.4) out.push({ n: `organic/mother_${sd}_tongue`, at: at(mx + base, my), sx: len / 4, rot: e.dir * Math.atan2(ty * GFX.SIN, len), emissive: 0.6 });
      if (carry) out.push({ n: 'organic/spore_pod', at: at(mx + tx, my + ty), emissive: 0.5 });
    }
  });
  const r1 = rng(77);                                    // the eyes (the same places as drawMother's), on the dome
  for (let i = 0; i < 9; i++) {
    const y = (r1() * 1.7 - 0.85) * MOTHER_RY, edge = MOTHER_RX * Math.sqrt(Math.max(0, 1 - (y / MOTHER_RY) ** 2)), x = edge - 1.2 - r1() * 3, rad = 0.25 + r1() * 0.35;
    if (MOTHER_MOUTHS.some(([mx, my]) => Math.hypot(mx - x, my - y) < 2.2)) continue;
    const s = Math.sin(t * 0.7 + i * 2.3), q = Math.hypot(x / MOTHER_RX, y / MOTHER_RY), z = 3 * Math.max(0, 1 - q * q) ** 0.62 * (1 - 0.12 * (1 - q) ** 2);
    out.push({ n: `organic/mother_${sd}_eye_${s > 0.97 ? 'shut' : s > 0.94 ? 'half' : 'open'}`, at: at(x, y), z: z * b, scale: rad / 0.5 * b });
  }
  return out;
}
function motherOverlay(e, t) {                           // torn-out tongues: the gullet bleeds slime
  e.pois.forEach((p, i) => {
    if (!p.hit) return;
    const [mx, my] = MOTHER_MOUTHS[i];
    for (let k = 0; k < 2; k++) { const q = (t * 0.7 + k / 2) % 1; ctx.beginPath(); ctx.arc(L(mx + 0.3) + q * 12, L(my) + (k - 0.5) * 8 + q * 6, 3, 0, TAU); ctx.fillStyle = `rgba(156,255,90,${1 - q})`; ctx.fill(); }
  });
}
// Leeches: organic/leech_fly (16 headings x 6 wriggle frames) / leech_latched (d0 facing right, d1 left).
function drawLeechSprite(l, ang) {
  if (l.state === 'fly') return GFX.ready('organic/leech_fly') && GFX.sprite('organic/leech_fly', GFX.frameIndex('organic/leech_fly', ang, l.t / 0.8 * 6), l.x, l.y, 0, { layer: 'main', emissive: 0.4 });
  return GFX.ready('organic/leech_latched') && GFX.sprite('organic/leech_latched', (l.side === 'port' ? 0 : 6) + Math.floor(l.t / 0.7 * 6) % 6, l.x, l.y, 0, { layer: 'main', emissive: 0.4 });
}
// The leviathan, in pieces on one origin: fluke (nearest pose), flippers (turned around their roots),
// four body bands, the blink patch. Its slow roll turns the whole stack; the spots' pulse is drawn on top.
function drawLeviathanSprites(V, t) {
  const sd = V.order[V.i]?.startsWith('port') ? 'port' : 'star', mir = sd === 'port' ? 1 : -1, pre = `organic/leviathan_${sd}_`;
  const parts = ['fluke', 'flipper0', 'flipper1', 'body0', 'body1', 'body2', 'body3', 'eye'];
  if (!parts.every(n => GFX.ready(pre + n))) return false;
  const x = sd === 'port' ? -14.5 : SHIP_W + 14.5, y = -36 + (LEV_TIME - V.t) * 2.6, roll = mir * Math.sin(t * 0.4) * 0.03, o = { layer: 'under', rot: roll, emissive: 0.5 };
  GFX.sprite(pre + 'fluke', clamp(Math.round((Math.sin(t * 1.2) + 1) * 2), 0, 4), x, y, 0, o);
  for (const j of [0, 1]) {                              // rotate around the root: shift the origin so the pivot stays put
    const s = j ? 1 : -1, a = roll + mir * s * 0.15 * Math.sin(t * 0.8 + s), [px, py] = GFX.info(pre + 'flipper' + j).pivot.map(v => v / 96);
    const [rx, ry] = rot(px, py, roll), [ax, ay] = rot(px, py, a);
    GFX.sprite(pre + 'flipper' + j, 0, x + rx - ax, y + (ry - ay) / GFX.SIN, 0, { ...o, rot: a });
  }
  for (let k = 0; k < 4; k++) GFX.sprite(pre + 'body' + k, 0, x, y, 0, o);
  const b = Math.sin(t * 0.5);
  if (b > 0.97) GFX.sprite(pre + 'eye', b > 0.985 ? 1 : 0, x, y, 0, o);
  levSpots = { x, y, roll, spots: GFX.info(pre + 'body3').spots };
  return true;
}
let levSpots = null;
// On top (from drawCombatFront): the leviathan's glowing spots, pulsing down its body.
// Screen space: the herd's call, a dark teal swell rolling in at that side of the screen (drawEncounterOverlay).
function drawHerdCall(t) {
  const H = org.herd;
  if (!H) return;
  const u = HERD_CALL - H.t, k = Math.min(1, u / 0.8) * Math.min(1, H.t / 3), w = 0.6 + 0.4 * Math.sin(u * 2.2), left = H.side === 'port';
  const g = ctx.createLinearGradient(left ? 0 : VW, 0, left ? VW * 0.45 : VW * 0.55, 0);
  g.addColorStop(0, `rgba(40,170,150,${0.42 * k * w})`); g.addColorStop(1, 'rgba(40,170,150,0)');
  ctx.fillStyle = g; ctx.fillRect(left ? 0 : VW * 0.55, 0, VW * 0.45, VH);
}
function drawOutsideOverlays(t) {
  if (typeof drawLevBossTop === 'function') drawLevBossTop(t);   // the boss's target rings, missing details, the engine blast
  const S = levSpots; levSpots = null;
  if (!S || !org.lev) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  S.spots.forEach((p, j) => {
    if (!p) return;
    const a = 0.35 + 0.45 * Math.max(0, Math.sin(t * 2.5 - Math.floor(j / 2) * 0.5)), [sx, sy] = rot(p[0] / 96, p[1] / 96, S.roll);
    const cx = L(S.x + sx), cy = L(S.y + sy / GFX.SIN), r = L(0.55);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 1 / GFX.SIN);      // round on screen
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(122,240,255,${a * 0.8})`); g.addColorStop(1, 'rgba(122,240,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.restore();
  });
  ctx.restore();
}
