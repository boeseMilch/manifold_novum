// Living enemies. They don't just shoot: weak spots heal, they grab, they chew, they seed.
//   Grappler      a squid that throws a tentacle around the hull: that side's shield can't go up and
//                 the ship slowly turns (cannons drift). Shoot the tentacle or hack it off outside.
//                 Its weak spots heal after 15 s unless all three are hit in time.
//   Leech swarm   small biters fly in and latch onto the hull, chewing parts in their column.
//                 Shoot them on the way in; a raised shield on that side burns latched ones off.
//   Spore mother  far out, puffs spore clouds (barnacles!); after each puff one of its sacs opens
//                 for a few seconds — that's when you can hit it.
//   Leviathan     too big to kill. For 30 s it brushes along the ship, bumping one room after another
//                 (the sidebar warns which); stay out of the room it's about to hit.
// Grappler and spore mother are enemy kinds (ENEMY_TYPES); leeches and the leviathan live in `org`.

const org = { leeches: [], lev: null };
const HEAL_TIME = 15, TENTACLE_HP = 5, TENTACLE_EVERY = 14, TENTACLE_COIL = 2, CUT_TIME = 3;
const LEECH_CHEW = 20, LEECH_SPEED = 2.4, PUFF_EVERY = 12, SAC_OPEN = 3.5, LEV_TIME = 30, LEV_STEP = 4;
const LEV_ORDER = ['starGun', 'starLock', 'reactor', 'portLock', 'portGun', 'bridge'];

function resetOrganic() { org.leeches = []; org.lev = null; }

// ---------------------------------------------------------------------------
// Grappler
// ---------------------------------------------------------------------------
const GRAPPLER_BODY = [[0, -2.8], [1.1, -2.2], [1.5, -0.8], [1.3, 0.8], [0.7, 1.6], [-0.7, 1.6], [-1.3, 0.8], [-1.5, -0.8], [-1.1, -2.2]];
ENEMY_TYPES.grappler = {
  name: 'Grappler', dist: 13, size: [2.2, 3.4], amp: [2.0, 2.6], omega: 0.4, wear: 99, noGun: true,
  solids: [{ poly: GRAPPLER_BODY }],
  pois: [
    // on the edge of the body facing us (a shell stops at the first solid thing it touches)
    { id: 'eye', name: 'Eye', effect: 'heals in 15 s', shape: { circle: [1.35, -1.4, 0.32] } },
    { id: 'sac', name: 'Ink sac', effect: 'heals in 15 s', shape: { circle: [1.45, 0.15, 0.36] } },
    { id: 'beak', name: 'Beak', effect: 'heals in 15 s', shape: { circle: [0.8, -2.45, 0.3] } },
  ],
  update(e, dt) {
    // weak spots heal unless all of them are hit within HEAL_TIME
    for (const p of e.pois) if (p.hit) { p.healT = (p.healT || 0) + dt; if (p.healT >= HEAL_TIME && !e.pois.every(q => q.hit)) { p.hit = false; p.healT = 0; p.smoke = 0; } }
    const T0 = e.tent || (e.tent = { state: 'idle', t: TENTACLE_EVERY * 0.5, hp: TENTACLE_HP, x: 0, y: 0 });
    T0.t -= dt;
    if (T0.state === 'idle' && T0.t <= 0) { T0.state = 'coil'; T0.t = TENTACLE_COIL; }
    else if (T0.state === 'coil' && T0.t <= 0) {
      const spot = HULL_SPOTS[e.side][Math.floor(Math.random() * 4)];
      Object.assign(T0, { state: 'attached', t: 0, hp: TENTACLE_HP, x: spot[0], y: spot[1] });
      combat.shake = Math.max(combat.shake, 0.6); sfx.hit(true);
      combatBanner(`The grappler wrapped a tentacle around the ${SIDE_LABEL[e.side].toLowerCase()} side — no shield there, and we're turning!`);
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
function tentacleBase(e) { return enemyToWorld(e, 1.2, 0.9); }

// ---------------------------------------------------------------------------
// Spore mother
// ---------------------------------------------------------------------------
const MOTHER_BODY = Array.from({ length: 14 }, (_, i) => { const a = i / 14 * TAU, r = 2.6 + 0.4 * Math.sin(i * 2.3); return [Math.cos(a) * r * 0.9, Math.sin(a) * r * 1.2]; });
ENEMY_TYPES.mother = {
  name: 'Spore mother', dist: 22, size: [2.6, 3.2], amp: [0.8, 1.0], omega: 0.15, wear: 99, noGun: true,
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
  // grappler tentacles: cannon shells cut them, while attached the cannons drift
  for (const e of combat.enemies) {
    if (e.kind !== 'grappler' || e.tent?.state !== 'attached') continue;
    if (e.phase !== 'fighting') { e.tent.state = 'idle'; continue; }
    const [bx, by] = tentacleBase(e);
    for (const s of combat.shells) if (!s.dead && segDist(s.x, s.y, bx, by, e.tent.x, e.tent.y) < 0.35) {
      s.dead = true; sfx.alienHurt();
      for (let i = 0; i < 6; i++) combatFx(s.x, s.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.5, '#7a3a8a', 0.1);
      if (--e.tent.hp <= 0) { cutTentacle(e); break; }
    }
    for (const c of crew) if (c.mode === 'gun') c.gun.aim += 0.22 * dt * (e.side === 'port' ? -1 : 1);   // the ship turns under you
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
    if (l.dead) for (let i = 0; i < 6; i++) combatFx(l.x, l.y, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.5, '#7a2a3a', 0.08);
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
    return holdTarget('leech' + l.uid, 1.5, 'Hold click: pry the leech off (1.5 s)', l.x, l.y, 0.5, () => { l.dead = true; org.leeches = org.leeches.filter(q => !q.dead); sfx.spit(); });
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
function drawGrappler(e, t) {
  const coil = e.tent?.state === 'coil' ? 1 - e.tent.t / TENTACLE_COIL : 0;
  // trailing tentacles
  for (let i = 0; i < 6; i++) {
    const x0 = -0.9 + i * 0.36, sw = Math.sin(t * 2.2 + i) * 0.4;
    ctx.beginPath(); ctx.moveTo(L(x0), L(1.4));
    ctx.bezierCurveTo(L(x0 + sw), L(2.4), L(x0 - sw), L(3.2), L(x0 + sw * 1.4), L(4.0 + (i % 2) * 0.4));
    ctx.strokeStyle = OUT; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = '#8a4a9a'; ctx.lineWidth = 7; ctx.stroke();
  }
  // the grabbing arm, coiled up before a throw
  if (e.tent?.state !== 'attached') {
    const k = 0.5 + coil * 0.5;
    ctx.beginPath(); ctx.moveTo(L(1.2), L(0.9)); ctx.bezierCurveTo(L(2.4 * k + 1), L(0.4), L(2.2 * k + 1), L(-1.2 * k), L(1.4 + coil * 0.4), L(-0.6 - coil));
    ctx.strokeStyle = OUT; ctx.lineWidth = 15; ctx.stroke(); ctx.strokeStyle = coil ? '#c06ad0' : '#9a5aaa'; ctx.lineWidth = 10; ctx.stroke();
  }
  // mantle
  poly(LP(GRAPPLER_BODY));
  const g = ctx.createRadialGradient(L(-0.3), L(-1), L(0.3), 0, 0, L(2.8));
  g.addColorStop(0, '#c07ad0'); g.addColorStop(0.6, '#7a3a8a'); g.addColorStop(1, '#3a1448');
  ctx.fillStyle = g; ctx.fill(); stroke(3);
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(L(-0.8 + (i % 3) * 0.5), L(-1.8 + i * 0.45), L(0.08 + (i % 2) * 0.05), 0, TAU); ctx.fillStyle = 'rgba(255,200,240,0.35)'; ctx.fill(); }
  // weak spots: blue-glowing organs (heal back when left alone)
  for (const p of e.pois) {
    const [cx, cy, r] = p.shape.circle;
    if (!p.hit) blueGlow(cx, cy, r * 2, t);
    ctx.beginPath(); ctx.arc(L(cx), L(cy), L(r), 0, TAU); ctx.fillStyle = p.hit ? '#3a1a2a' : bluePaint(cx - r, cy - r, cx + r, cy + r, t, false); ctx.fill(); stroke(2);
    if (p.hit) {                                      // healing: a closing ring
      ctx.beginPath(); ctx.arc(L(cx), L(cy), L(r) + 4, -Math.PI / 2, -Math.PI / 2 + (p.healT || 0) / HEAL_TIME * TAU); ctx.strokeStyle = '#9cff5a'; ctx.lineWidth = 3; ctx.stroke();
    }
  }
  const [ex, ey] = e.pois[0].shape.circle;
  if (!e.pois[0].hit) { ctx.beginPath(); ctx.ellipse(L(ex), L(ey), 3, 8, 0, 0, TAU); ctx.fillStyle = OUT; ctx.fill(); }   // slit pupil
}
function drawTentacle(e, t) {
  if (e.tent?.state !== 'attached' || e.phase !== 'fighting') return;
  const [bx, by] = tentacleBase(e), { x, y } = e.tent, mx = (bx + x) / 2, my = (by + y) / 2 + Math.sin(t * 2) * 0.8;
  ctx.beginPath(); ctx.moveTo(L(bx), L(by)); ctx.quadraticCurveTo(L(mx), L(my), L(x), L(y));
  ctx.strokeStyle = OUT; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = '#9a5aaa'; ctx.lineWidth = 11; ctx.stroke();
  ctx.setLineDash([3, 9]); ctx.strokeStyle = '#e0b0f0'; ctx.lineWidth = 4; ctx.stroke(); ctx.setLineDash([]);   // suckers
  for (let i = 0; i < 3; i++) {                        // the end wraps around the hull
    ctx.beginPath(); ctx.arc(L(x), L(y + (i - 1) * 0.5), L(0.35), 0, TAU); ctx.strokeStyle = '#9a5aaa'; ctx.lineWidth = 6; ctx.stroke();
  }
  ctx.fillStyle = '#ffd0f0'; ctx.font = `800 ${T * 0.2}px system-ui, sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('♥'.repeat(Math.max(0, e.tent.hp)), L(mx), L(my) - 14); ctx.textAlign = 'left';
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
    add('tent' + uid(e), { icon: 'spore', title: 'TENTACLE', sub: `${SIDE_LABEL[e.side].toLowerCase()} side · no shield · shoot it or hack it off`, stripe: '#c08aff', red: true });
  const V = org.lev;
  if (V) add('lev', { icon: 'unknown', title: 'LEVIATHAN', sub: `next: ${V.order.slice(V.i, V.i + 3).map(id => roomById(id).name.toLowerCase()).join(' → ')}`, stripe: '#7af0ff', red: true });
}
