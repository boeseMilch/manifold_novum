// Living enemies. They don't just shoot: weak spots heal, they grab, they chew, they seed.
//   Grappler      a squid that wraps a tentacle around the hull: that side's shield can't go up, and its
//                 acid weakens the hull plate. One cannon hit on the tentacle, or a spacewalker hacking it
//                 off, makes it let go; left alone it rips the plate off (a breach) and swims away with
//                 it, munching. Weak spots: the poison sac (acid pauses while it heals), the eye (no new
//                 tentacle while it heals), the beak (spits at spacewalkers; quiet while it heals). All
//                 three hit at once: it's done for. Cannon and spacewalk work together.
//   Leech swarm   small biters fly in and latch onto the hull, chewing parts in their column.
//                 Shoot them on the way in; a raised shield on that side burns latched ones off.
//   Spore mother  far out, puffs spore clouds (barnacles!); after each puff one of its sacs opens
//                 for a few seconds — that's when you can hit it.
//   Leviathan     too big to kill. For 30 s it brushes along the ship, bumping one room after another
//                 (the sidebar warns which); stay out of the room it's about to hit.
// Grappler and spore mother are enemy kinds (ENEMY_TYPES); leeches and the leviathan live in `org`.

const org = { leeches: [], lev: null };
const HEAL_TIME = 20, TENTACLE_EVERY = 10, TENTACLE_COIL = 2, CUT_TIME = 3, ACID_TIME = 30, BEAK_EVERY = 3.5, BEAK_WIND = 0.7;
const LEECH_CHEW = 20, LEECH_SPEED = 2.4, PUFF_EVERY = 12, SAC_OPEN = 3.5, LEV_TIME = 30, LEV_STEP = 4;
const LEV_ORDER = ['starGun', 'starLock', 'reactor', 'portLock', 'portGun', 'bridge'];

// Organic things die in a burst of green slime.
function slimeBurst(x, y, n = 14, size = 0.1) {
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 1 + Math.random() * 4; combatFx(x, y, Math.cos(a) * sp, Math.sin(a) * sp, 0.8 + Math.random() * 0.6, ['#9cff5a', '#6ad13a', '#c8ff6e'][i % 3], size + Math.random() * size); }
  sfx.squelch?.();
}
function resetOrganic() { org.leeches = []; org.lev = null; }

// ---------------------------------------------------------------------------
// Grappler
// ---------------------------------------------------------------------------
const GRAPPLER_BODY = [[0, -2.8], [1.1, -2.2], [1.5, -0.8], [1.3, 0.8], [0.7, 1.6], [-0.7, 1.6], [-1.3, 0.8], [-1.5, -0.8], [-1.1, -2.2]];
ENEMY_TYPES.grappler = {
  name: 'Grappler', organic: true, dist: 13, size: [2.2, 3.4], amp: [2.0, 2.6], omega: 0.4, wear: 99, noGun: true, shotSpeed: 11,
  solids: [{ poly: GRAPPLER_BODY }],
  pois: [   // on the edge of the body facing us (a shell stops at the first solid thing it touches)
    { id: 'eye', name: 'Eye', effect: 'no new tentacle until it heals', shape: { circle: [1.35, -1.4, 0.32] } },
    { id: 'sac', name: 'Poison sac', effect: 'the acid stops until it heals', shape: { circle: [1.65, 0.2, 0.48] } },
    { id: 'beak', name: 'Beak', effect: 'no spitting until it heals', shape: { circle: [0.8, -2.45, 0.3] } },
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
      const spot = HULL_SPOTS[e.side][Math.floor(Math.random() * 4)];
      Object.assign(T0, { state: 'attached', t: 0, x: spot[0], y: spot[1], acid: T0.acid || 0 });
      combat.shake = Math.max(combat.shake, 0.6); sfx.hit(true);
      combatBanner(`The grappler wrapped a tentacle around the ${SIDE_LABEL[e.side].toLowerCase()} side — no shield there, and its acid is eating the hull!`);
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
      const [bx, by] = enemyToWorld(e, 0.95, -2.5);
      enemyFire(e, bx, by, false, { atCrew: true, crewId: c.id, tx: c.x, ty: c.y });
      combat.shots[combat.shots.length - 1].acid = true; sfx.spit();
    }
  },
  onHit(e, p) { p.healT = 0; },
  draw(e, t) { drawGrappler(e, t); },
  drawExtra(e, t) { drawTentacle(e, t); },
};
const grabbed = (side) => combat.enemies.some(e => e.kind === 'grappler' && e.phase === 'fighting' && e.tent?.state === 'attached' && e.side === side);
function cutTentacle(e, how) {
  e.tent.state = 'idle'; e.tent.t = TENTACLE_EVERY; sfx.alienHurt();
  combatBanner(how === 'eva' ? 'Tentacle hacked off!' : 'Tentacle shot through — it lets go!');
  for (let i = 0; i < 16; i++) combatFx(e.tent.x, e.tent.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.7, '#7a3a8a', 0.14);
}
// Too late: it rips the weakened plate off (a breach, or a big hit on easier missions) and leaves with it.
function ripHull(e) {
  const { x, y } = e.tent;
  if (mission.rules?.breach) { breachRoom(roomNearHull(e.side, y, x)); combat.shake = 1; sfx.explosion(); }
  else shipHit(e.side, x, y, true);
  for (let i = 0; i < 24; i++) combatFx(x, y, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.9, i % 2 ? '#8a93a5' : '#9cff5a', 0.16);
  combatBanner('The grappler ripped a hull plate off — and swims away munching on it!');
  e.tent.state = 'ripped'; e.phase = 'leaving';
}
function tentacleBase(e) { return enemyToWorld(e, 1.2, 0.9); }

// ---------------------------------------------------------------------------
// Spore mother
// ---------------------------------------------------------------------------
const MOTHER_BODY = Array.from({ length: 14 }, (_, i) => { const a = i / 14 * TAU, r = 2.6 + 0.4 * Math.sin(i * 2.3); return [Math.cos(a) * r * 0.9, Math.sin(a) * r * 1.2]; });
ENEMY_TYPES.mother = {
  name: 'Spore mother', organic: true, dist: 22, size: [2.6, 3.2], amp: [0.8, 1.0], omega: 0.15, wear: 99, noGun: true,
  solids: [{ poly: MOTHER_BODY }],
  pois: [
    { id: 'sac0', name: 'Upper sac', effect: 'burst', shape: { circle: [1.9, -1.6, 0.45] } },
    { id: 'sac1', name: 'Middle sac', effect: 'burst', shape: { circle: [2.25, 0.2, 0.45] } },
    { id: 'sac2', name: 'Lower sac', effect: 'burst', shape: { circle: [1.9, 1.9, 0.45] } },
  ],
  update(e, dt) {
    e.puffT = (e.puffT ?? 6) - dt; e.open = Math.max(0, (e.open || 0) - dt);
    if (e.puffT <= 0) {
      e.puffT = PUFF_EVERY; spawnSpores(e.side);
      const shut = e.pois.map((p, i) => i).filter(i => !e.pois[i].hit);
      e.openSac = shut[(e.puffs = (e.puffs || 0) + 1) % shut.length]; e.open = SAC_OPEN;
      combatBanner('The spore mother puffed — one of its sacs is open, hit it now!');
    }
  },
  closed: (e, p) => !(e.open > 0 && e.pois.indexOf(p) === e.openSac),
  draw(e, t) { drawMother(e, t); },
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
  combatBanner(`Leech swarm on the ${SIDE_LABEL[side].toLowerCase()} side! Shoot them — or burn them off with the shield.`);
}
function startLeviathan() {
  const start = Math.floor(Math.random() * LEV_ORDER.length), dir = Math.random() < 0.5 ? 1 : -1;
  const order = Array.from({ length: 7 }, (_, i) => LEV_ORDER[(start + i * dir + LEV_ORDER.length * 7) % LEV_ORDER.length]);
  org.lev = { t: LEV_TIME, step: LEV_STEP, order, i: 0, x: 0 };
  combatBanner('LEVIATHAN — something enormous is brushing past. Stay out of the rooms it\'s about to bump!'); sfx.say?.('Unidentified. Very large. Object.');
}
function updateOrganic(dt) {
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
      for (const s of combat.shells) if (!s.dead && Math.hypot(s.x - l.x, s.y - l.y) < 0.55) { s.dead = true; l.dead = true; sfx.crack(); }
    } else if ((l.chew += dt) >= LEECH_CHEW) {
      l.chew = 0;
      const pool = SYSTEMS.filter(s => s.col === sideCol(l.side) && !s.broken);
      if (pool.length) { const s = pool[Math.floor(Math.random() * pool.length)]; breakSystem(s); combatBanner(`Leeches chewed through the ${s.name.toLowerCase()}!`); }
    }
    if (combat.shields[l.side]?.up > 0 && (l.state === 'latched' || Math.abs(l.x - shieldX(l.side, l.y)) < 0.8)) {   // the shield burns them off
      l.dead = true;
      for (let i = 0; i < 8; i++) combatFx(l.x, l.y, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.5, '#9cd8ff', 0.08);
    }
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
    if (l.state !== 'latched' || Math.hypot(mx - l.x, my - l.y) > 0.5) continue;
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
Object.assign(EVENT_LABELS, {
  grappler: (ev) => `Grappler — ${SIDE_NAME[ev.side]}`, leeches: (ev) => `Leech swarm — ${SIDE_NAME[ev.side]}`,
  mother: (ev) => `Spore mother — ${SIDE_NAME[ev.side]}`, leviathan: () => 'Leviathan — front',
});

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// The grappler: a violet head-first squid. Beak and eye up front, a poison sac on its flank, a soft
// mantle with fins and glowing spots, six trailing arms. Its weak organs have the usual blue glow.
function tapered(pts, w0, w1, col, rim = true) {        // a smooth tapering limb along points (pixel coords)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = rim ? 0 : 1; pass < 2; pass++) for (let i = 1; i < pts.length; i++) {
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
    for (let j = 0; j <= 16; j++) { const u = j / 16, a = -0.6 + u * (2.2 + coil * 2.6); pts.push([L(1.1 + Math.cos(a) * (0.5 + u * 0.9) * k + u * 0.3), L(0.8 - Math.sin(a) * (0.5 + u * 0.9) * k)]); }
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
      ctx.fillStyle = 'rgba(20,50,10,0.9)'; ctx.font = `900 ${R0 * 1.15}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('☠', 0, R0 * 0.25); ctx.textAlign = 'left';
      ctx.beginPath(); ctx.ellipse(-R0 * 0.35, -R0 * 0.55, R0 * 0.25, R0 * 0.12, -0.5, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();   // shine
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
  ctx.rotate(-0.5);                                      // pointing forward-out, towards the ship
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
function drawTentacle(e, t) {
  if (e.tent?.state !== 'attached' || e.phase !== 'fighting') return;
  const [bx, by] = tentacleBase(e), { x, y } = e.tent, pts = [];
  const mx = (bx + x) / 2, my = (by + y) / 2 + Math.sin(t * 2) * 0.8;
  for (let i = 0; i <= 24; i++) {
    const u = i / 24, qx = (1 - u) * (1 - u) * bx + 2 * (1 - u) * u * mx + u * u * x, qy = (1 - u) * (1 - u) * by + 2 * (1 - u) * u * my + u * u * y;
    pts.push([L(qx), L(qy) + Math.sin(t * 6 + u * 12) * 2 * u]);
  }
  tapered(pts, 10, 4.5, '#9a5aaa');
  for (let i = 2; i < 23; i += 2) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1] + 3, 2, 0, TAU); ctx.fillStyle = 'rgba(255,220,250,0.7)'; ctx.fill(); }   // suckers
  for (let i = 0; i < 3; i++) {                            // the tip coils around the hull
    ctx.beginPath(); ctx.arc(L(x), L(y + (i - 1) * 0.45), L(0.32), 0, TAU); ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = '#9a5aaa'; ctx.lineWidth = 5; ctx.stroke();
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
function drawMother(e, t) {
  const pulse = 1 + 0.05 * Math.sin(t * 1.5) + (e.puffT > PUFF_EVERY - 0.6 ? 0.12 : 0);
  ctx.save(); ctx.scale(pulse, pulse);
  poly(LP(MOTHER_BODY));
  const g = ctx.createRadialGradient(L(-0.5), L(-0.8), L(0.3), 0, 0, L(3.2));
  g.addColorStop(0, '#d8c890'); g.addColorStop(0.6, '#8a7a4a'); g.addColorStop(1, '#3a3020');
  ctx.fillStyle = g; ctx.fill(); stroke(3);
  for (let i = 0; i < 12; i++) { const a = i * 2.1, r = 1.2 + (i % 4) * 0.35; ctx.beginPath(); ctx.arc(L(Math.cos(a) * r * 0.9), L(Math.sin(a) * r * 1.1), L(0.14), 0, TAU); ctx.fillStyle = '#5a4a30'; ctx.fill(); }
  e.pois.forEach((p, i) => {
    const [cx, cy, r] = p.shape.circle, open = e.open > 0 && e.openSac === i && !p.hit;
    ctx.beginPath(); ctx.arc(L(cx), L(cy), L(r), 0, TAU);
    if (p.hit) { ctx.fillStyle = '#2a2018'; ctx.fill(); stroke(2); return; }
    if (open) { blueGlow(cx, cy, r * 2.4, t); ctx.fillStyle = bluePaint(cx - r, cy - r, cx + r, cy + r, t, false); ctx.fill(); stroke(2.5); }
    else { ctx.fillStyle = '#6a5a3a'; ctx.fill(); stroke(2); ctx.beginPath(); ctx.moveTo(L(cx - r * 0.7), L(cy)); ctx.lineTo(L(cx + r * 0.7), L(cy)); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.stroke(); }   // shut: a closed slit
  });
  ctx.restore();
}
function drawOrganicWorld(t) {
  for (const l of org.leeches) {                       // leeches: segmented, wriggling
    ctx.save(); ctx.translate(L(l.x), L(l.y)); ctx.rotate(l.state === 'fly' ? Math.atan2(l.ty - l.y, l.tx - l.x) : (l.side === 'port' ? 0 : Math.PI));
    for (let i = 3; i >= 0; i--) {
      ctx.beginPath(); ctx.ellipse(-i * 7 + Math.sin(l.t * 8 + i) * (l.state === 'latched' ? 1 : 2), Math.sin(l.t * 6 + i) * 2, 6 - i, 5 - i * 0.6, 0, 0, TAU);
      ctx.fillStyle = i === 0 ? '#a83a4a' : '#7a2a3a'; ctx.fill(); stroke(1.5);
    }
    ctx.restore();
    if (l.state === 'latched') {
      ctx.beginPath(); ctx.arc(L(l.x), L(l.y), 13, -Math.PI / 2, -Math.PI / 2 + l.chew / LEECH_CHEW * TAU); ctx.strokeStyle = '#ff6a7a'; ctx.lineWidth = 2.5; ctx.stroke();
      if (me.mode === 'eva') jobMarker(l.x, l.y, t, Math.hypot(me.x - l.x, me.y - l.y) <= REACH + 1, '#ff6a7a');
    }
  }
  const V = org.lev;
  if (V) {                                             // the leviathan: a vast dark flank sliding past, an eye the size of a room
    const side = V.order[V.i]?.startsWith('port') ? -1 : 1, x = side < 0 ? -9 : SHIP_W + 9, y = -20 + (LEV_TIME - V.t) * 2.2;
    ctx.save(); ctx.translate(L(x), L(y));
    ctx.beginPath(); ctx.ellipse(0, 0, L(6), L(26), 0, 0, TAU);
    const g = ctx.createLinearGradient(-L(6), 0, L(6), 0); g.addColorStop(0, '#0e1a24'); g.addColorStop(0.5, '#1e3446'); g.addColorStop(1, '#0e1a24');
    ctx.fillStyle = g; ctx.fill(); stroke(4);
    for (let i = 0; i < 12; i++) { ctx.beginPath(); ctx.arc(L(-3 + (i % 3) * 3), L(-20 + i * 3.6), L(0.25), 0, TAU); ctx.fillStyle = `rgba(122,240,255,${0.3 + 0.3 * Math.sin(t * 2 + i)})`; ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(-side * L(2.5), L(-16), L(1.6), L(1.1), 0, 0, TAU); ctx.fillStyle = '#e8c34f'; ctx.fill(); stroke(3);
    ctx.beginPath(); ctx.ellipse(-side * L(2.5), L(-16), L(0.3), L(0.9), 0, 0, TAU); ctx.fillStyle = OUT; ctx.fill();
    ctx.restore();
  }
}
// The room the leviathan will bump next: a red warning wash on its floor.
function drawLeviathanWarning(t) {
  const V = org.lev;
  if (!V || V.i >= V.order.length) return;
  const r = roomById(V.order[V.i]), k = 0.12 + 0.12 * (1 - V.step / LEV_STEP) * (0.6 + 0.4 * Math.sin(t * 10));
  ctx.fillStyle = `rgba(255,40,30,${k})`;
  for (const q of r.rects) ctx.fillRect(L(q.x), L(q.y), L(q.w), L(q.h));
}
function organicPlates(add) {
  const latched = org.leeches.filter(l => l.state === 'latched').length;
  if (org.leeches.length) add('leeches', { icon: 'spore', title: 'LEECH SWARM', sub: `${org.leeches.length - latched} incoming, ${latched} chewing · shield burns them off`, stripe: '#ff6a7a', red: true });
  for (const e of combat.enemies) if (e.kind === 'grappler' && e.tent?.state === 'attached' && e.phase === 'fighting')
    add('tent' + uid(e), { icon: 'spore', title: 'TENTACLE', sub: `${SIDE_LABEL[e.side].toLowerCase()} · acid ${Math.round(e.tent.acid / ACID_TIME * 100)}%${poiHit(e, 'sac') ? ' (paused)' : ''} · shoot it or hack it off`, stripe: '#c08aff', red: true });
  const V = org.lev;
  if (V) add('lev', { icon: 'unknown', title: 'LEVIATHAN', sub: `next: ${V.order.slice(V.i, V.i + 3).map(id => roomById(id).name.toLowerCase()).join(' → ')}`, stripe: '#7af0ff', red: true });
}
