// Other ships you can walk onto. A docking tube runs from one of our outer airlocks to a small
// three-room ship (airlock, cargo, core); while docked, its rooms are walkable like ours.
//   Pirates     a raider pulls alongside and shoots up our engines; if it isn't driven off in time it
//               docks, and two pirates come over to steal loose items and fuel cells. Board them back:
//               their cargo crate has the loot, and jamming their reactor's overload makes them panic
//               and cast off 15 s later (anyone still aboard ends up floating outside our hull).
//   Derelict    a dark, airless wreck on a tether: a sleeping intruder, a jammed door, a fire, and
//               (depending on the mission) the black box to bring home or an engineer to rescue.
//   Mining      not a ship: a big asteroid parked in front; drill it on a spacewalk for an ore sample.
// Everything in `dk` is plain data.

const dk = { dock: null, pirates: [], npc: null, rock: null, defeated: 0 };
const DOCK_TIME = 40, DETACH_TIME = 15, PIRATE_HP = 3, PIRATE_SPEED = 2.3, PIRATE_RANGE = 9;
// Pirates stop and aim: a faint laser sight tracks you, then locks (bright) — after PIRATE_AIM s a very fast shot
// goes down that line, so dive behind a wall when you see it. Then a long cooldown: your window to hit back.
const PIRATE_AIM = 1.7, PIRATE_LOCK = 0.3, PIRATE_SHOT = 30, PIRATE_COOLDOWN = 5, PIRATE_LOOT = 2, LEAVE_DELAY = 4;
const OVERLOAD_TIME = 3, DRILL_TIME = 6, NPC_SPEED = 2.6;

function resetDock() { Object.assign(dk, { dock: null, pirates: [], npc: null, rock: null, defeated: 0 }); }

// ---------------------------------------------------------------------------
// Geometry (world coords; the port layout is mirrored for the starboard side)
// ---------------------------------------------------------------------------
function dockGeom(side) {
  const h = HATCHES.find(h => h.side === side), y = h.y;
  const P = [
    R(-5.6, y - 0.6, 0.7, y + 0.6),               // tube (overlaps our room so you can walk straight in)
    R(-10.2, y - 2.4, -5.6, y + 2.4),             // their airlock
    R(-18.4, y - 4.0, -10.8, y + 4.0),            // cargo
    R(-25.0, y - 2.8, -19.0, y + 2.8),            // core (reactor)
    R(-10.8, y - 0.8, -10.2, y + 0.8),            // door airlock–cargo
    R(-19.0, y - 0.8, -18.4, y + 0.8),            // door cargo–core
  ];
  const M = side === 'port' ? P : P.map(q => R(SHIP_W - q.x - q.w, q.y, SHIP_W - q.x, q.y + q.h));
  const mx = (x) => side === 'port' ? x : SHIP_W - x;
  return {
    tube: M[0], rooms: [M[1], M[2], M[3]], doors: [M[4], M[5]], hatch: h, y,
    crate: { x: mx(-14.6), y: y - 2.6 }, core: { x: mx(-23.6), y }, boxSpot: { x: mx(-22.4), y: y + 1.8 },
    npcSpot: { x: mx(-16.0), y: y + 2.4 }, alienSpot: { x: mx(-21.5), y: y - 1.6 }, fire: { x: mx(-14.6), y: y + 1.4 },
    entry: { x: mx(-7.9), y }, tubeMid: { x: mx(-2.5), y },
  };
}
const dockOn = () => !!dk.dock;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DG = () => dk.dock && dockGeom(dk.dock.side);
function dockRects() {
  const g = DG();
  if (!g) return [];
  return [g.tube, ...g.rooms, ...g.doors.filter((d, i) => !dk.dock.doors[i])];
}
const inDock = (x, y) => { const g = DG(); return !!g && [g.tube, ...g.rooms, ...g.doors].some(q => inRect(x, y, q)); };
const dockRoomsForCamera = () => { const g = DG(); return g ? g.rooms.map(q => ({ rects: [q] })) : []; };
function dockVacuum(x, y) {
  const g = DG();
  if (!g) return false;
  return inRect(x, y, g.tube) || (dk.dock.kind === 'derelict' && [...g.rooms, ...g.doors].some(q => inRect(x, y, q)));
}
const dockName = () => dk.dock ? (dk.dock.kind === 'pirate' ? 'Pirate ship' : 'Derelict') : null;

// ---------------------------------------------------------------------------
// Docking
// ---------------------------------------------------------------------------
function dockShip(kind, side, contents = {}) {
  if (dk.dock) return false;
  // brig: the Red Comet's prison barge (EVENT_RUNNERS.brig: a pirate dock with a prisoner aboard) — looks, nothing else
  dk.dock = { kind, side, brig: kind === 'pirate' && !!contents.npc, doors: kind === 'derelict' ? [true, false] : [false, false], crate: kind === 'pirate' ? ['fuel', 'fuel'] : [], detachT: null, overloaded: false, fires: [] };
  const g = dockGeom(side);
  if (kind === 'pirate') {
    if (contents.npc) dk.npc = { x: g.npcSpot.x, y: g.npcSpot.y, state: 'down', leader: null, crumbs: [], face: 0, walk: 0 };
    for (let i = 0; i < 2; i++) dk.pirates.push({ uid: newUid(), x: g.entry.x + (side === 'port' ? -1 : 1) * i, y: g.y + (i ? 0.6 : -0.6), face: 0, walk: 0, hp: PIRATE_HP, carry: null, state: 'steal', cd: 1 + i, aim: 0, route: [], stuck: 0, stun: 0, flash: 0 });
    combatBanner('The pirates docked at the ' + (side === 'port' ? 'left' : 'right') + ' airlock — they\'re coming aboard!'); sfx.explosion();
  } else {
    dk.dock.fires.push({ x: g.fire.x, y: g.fire.y, hp: 1, t: 0 });
    if (contents.blackbox) ITEMS.push({ kind: 'blackbox', x: g.boxSpot.x, y: g.boxSpot.y });
    if (contents.npc) dk.npc = { x: g.npcSpot.x, y: g.npcSpot.y, state: 'down', leader: null, crumbs: [], face: 0, walk: 0 };
    if (contents.alien !== false) {
      boarding.invaders.push({ uid: newUid(), x: g.alienSpot.x, y: g.alienSpot.y, vx: 0, vy: 0, face: 0, walk: 0, mode: 'inside', state: 'dormant', dormantHome: true,
                               hatch: g.hatch, t: 0, hp: ALIEN_HP, path: [], linger: 0, stuck: 0, spitT: 1.5, lockedOut: 0, act: null, dodgeCd: 0, strafe: 1, stun: 0, seen: 0, flash: 0 });
    }
    combatBanner('Tether locked onto the derelict — the tube is open at the ' + (side === 'port' ? 'left' : 'right') + ' airlock.'); sfx.hatch();
  }
  return true;
}
function undock() {
  const d = dk.dock, g = DG();
  if (!d) return;
  const lost = [];
  for (const c of crew) if (c.mode === 'inside' && inDock(c.x, c.y) && !inRect(c.x, c.y, g.tube, -0.75)) {   // still aboard: cast adrift
    c.mode = 'eva'; c.x = g.hatch.outside[0] + (d.side === 'port' ? -1.2 : 1.2); c.y = g.hatch.outside[1] + (Math.random() - 0.5);
    combatBanner(`${c.name} was cast adrift — spacewalk back in!`);
  } else if (c.mode === 'inside' && inDock(c.x, c.y)) [c.x, c.y] = g.hatch.inside;
  for (let i = ITEMS.length - 1; i >= 0; i--) if (inDock(ITEMS[i].x, ITEMS[i].y)) lost.push(ITEMS.splice(i, 1)[0].kind);
  dk.pirates = dk.pirates.filter(p => !inDock(p.x, p.y));
  boarding.invaders = boarding.invaders.filter(a => !inDock(a.x, a.y));
  if (dk.npc && inDock(dk.npc.x, dk.npc.y)) dk.npc = null;
  dk.dock = null;
  combatBanner(d.kind === 'pirate' ? 'The pirate ship cast off in a panic!' : 'The derelict drifts away.'); sfx.hatch();
}

// The pirate raider: an enemy ship until it docks.
ENEMY_TYPES.pirate = {
  ...ENEMY_TYPES.interceptor, name: 'Pirate raider', fire: [2.2, 3.4],
  onHit(e) { if (e.pois.every(q => q.hit)) dk.defeated++; },   // a raider shot to scrap counts as a pirate defeated
  update(e, dt) {
    e.dockT = (e.dockT ?? DOCK_TIME) - dt;
    if (e.dockT <= 0 && !dk.dock && e.phase === 'fighting') { e.phase = 'gone'; dockShip('pirate', e.side); }
  },
  paint: { hull: ['#3a3a42', '#16161c'], stripe: '#e8b42e', pod: ['#4a4038', '#221c18'] },   // black and gold
  draw(e, t) {
    drawInterceptor(e, t);
    for (const [px, py, w, h, a] of [[-0.95, 0.75, 0.42, 0.3, 0.3], [0.2, 1.55, 0.36, 0.26, -0.2]]) {   // welded-on scrap patches
      ctx.save(); ctx.translate(L(px), L(py)); ctx.rotate(a); rr(-L(w) / 2, -L(h) / 2, L(w), L(h), 2); ctx.fillStyle = '#6a5a48'; ctx.fill(); stroke(1.2);
      ctx.fillStyle = '#2b303a'; ctx.fillRect(-L(w) / 2 + 2, -L(h) / 2 + 2, 2, 2); ctx.fillRect(L(w) / 2 - 4, L(h) / 2 - 4, 2, 2); ctx.restore();
    }
    // the skull-and-crossbones flag on a little mast at the stern, fluttering
    ctx.strokeStyle = '#8a8f99'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, L(1.6)); ctx.lineTo(0, L(2.5)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, L(2.5)); for (let i = 0; i <= 6; i++) ctx.lineTo(L(-0.12 * i), L(2.5 - 0.06 * i) + Math.sin(t * 8 + i) * 2.5);
    for (let i = 6; i >= 0; i--) ctx.lineTo(L(-0.12 * i), L(2.0 - 0.06 * i) + Math.sin(t * 8 + i) * 2.5); ctx.closePath();
    ctx.fillStyle = '#14161b'; ctx.fill(); stroke(1);
    ctx.fillStyle = '#e8e4dc'; ctx.beginPath(); ctx.arc(L(-0.36), L(2.08), L(0.09), 0, TAU); ctx.fill();
    ctx.strokeStyle = '#e8e4dc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L(-0.5), L(2.0)); ctx.lineTo(L(-0.22), L(2.32)); ctx.moveTo(L(-0.22), L(2.0)); ctx.lineTo(L(-0.5), L(2.32)); ctx.stroke();
    // the docking claw on the side facing us, ready to bite onto an airlock
    const open = 0.3 + 0.2 * Math.sin(t * 3);
    for (const sd of [-1, 1]) { ctx.save(); ctx.translate(L(-1.95), L(0.85)); ctx.rotate(sd * open + Math.PI); poly([[0, 0], [L(0.45), sd * 3], [L(0.55), sd * L(0.18)], [L(0.1), sd * 5]]); ctx.fillStyle = '#8a8f99'; ctx.fill(); stroke(1.2); ctx.restore(); }
  },
};
EVENT_SIDES.pirates = randSide; EVENT_SIDES.derelict = randSide;
EVENT_RUNNERS.pirates = (ev) => combatSpawn('pirate', ev.side);
EVENT_RUNNERS.derelict = (ev) => dockShip('derelict', ev.side, { blackbox: mission.objective?.kind === 'blackbox', npc: mission.objective?.kind === 'rescue' });
EVENT_RUNNERS.rock = () => { dk.rock = { x: 22.2, y: -7.6, r: 2.2, seed: 4242 }; combatBanner('Ore asteroid ahead — drill it on a spacewalk!'); };
Object.assign(EVENT_LABELS, { pirates: (ev) => `Pirate raider — ${SIDE_NAME[ev.side]}`, derelict: (ev) => `Derelict — ${SIDE_NAME[ev.side]}`, rock: () => 'Ore asteroid — front' });

// ---------------------------------------------------------------------------
// Pirates on board
// ---------------------------------------------------------------------------
const pirateOk = (x, y) => canStand(x, y, walkRects());
function pirateStep(p, tx, ty, dt) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  if (d < 0.01) return 0;
  const sp = Math.min(d, PIRATE_SPEED * dt), vx = dx / d * sp, vy = dy / d * sp;
  let moved = 0;
  if (pirateOk(p.x + vx, p.y)) { p.x += vx; moved += Math.abs(vx); }
  if (pirateOk(p.x, p.y + vy)) { p.y += vy; moved += Math.abs(vy); }
  p.face = Math.atan2(dy, dx); p.walk += moved * 3;
  return moved;
}
// A route of points from (x, y) to (tx, ty) across both ships.
function dockRoute(x, y, tx, ty) {
  const g = DG();
  const chain = g ? [g.core, ...g.doors.slice().reverse().map(q => ({ x: q.x + q.w / 2, y: q.y + q.h / 2 })), { x: g.rooms[0].x + g.rooms[0].w / 2, y: g.y }, g.tubeMid, { x: g.hatch.inside[0], y: g.hatch.inside[1] }] : [];
  // chain order: core → door(cargo–core) → door(airlock–cargo) → airlock → tube → our side
  const nearIdx = (px, py) => chain.reduce((b, q, i) => Math.hypot(q.x - px, q.y - py) < Math.hypot(chain[b].x - px, chain[b].y - py) ? i : b, 0);
  const navPts = (ax, ay, bx, by) => navPath(nearestNav(ax, ay), nearestNav(bx, by)).map(n => ({ x: NAV.nodes[n].x, y: NAV.nodes[n].y }));
  const a = g && inDock(x, y), b = g && inDock(tx, ty), end = chain.length - 1;
  const span = (i, j) => i <= j ? chain.slice(i, j + 1) : chain.slice(j, i + 1).reverse();
  let pts;
  if (a && b) pts = span(nearIdx(x, y), nearIdx(tx, ty));
  else if (a) pts = [...span(nearIdx(x, y), end), ...navPts(chain[end].x, chain[end].y, tx, ty)];
  else if (b) pts = [...navPts(x, y, chain[end].x, chain[end].y), ...span(end, nearIdx(tx, ty))];
  else pts = navPts(x, y, tx, ty);
  return [...pts, { x: tx, y: ty }];
}
function hurtPirate(p, dmg, stun = 0) {
  p.hp -= dmg; p.flash = 1; p.stun = Math.max(p.stun, stun); p.state = 'fight';
  sfx.alienHurt();
  for (let i = 0; i < 8; i++) combatFx(p.x, p.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.5, '#e2574c', 0.1);
  if (p.hp <= 0) {
    p.dead = true; dk.defeated++;
    if (p.carry) ITEMS.push({ kind: p.carry, ...dropSpot(p.x, p.y) });
    combatBanner('Pirate down!'); sfx.win();
  }
}
function updatePirate(p, dt) {
  p.flash = Math.max(0, p.flash - dt * 4); p.cd -= dt;
  if (p.stun > 0) { p.stun -= dt; p.aim = 0; return; }
  const g = DG();
  const sees = (c) => c.mode === 'inside' && standing(c) && Math.hypot(c.x - p.x, c.y - p.y) < PIRATE_RANGE && lineOfSight(p.x, p.y, c.x, c.y);
  // aiming: stand still, the laser sight tracks the target, then locks; the shot follows the locked line
  if (p.aim > 0) {
    const c = crew.find(c => c.id === p.target);
    p.aim += dt;
    if (p.aim < PIRATE_AIM - PIRATE_LOCK) {
      if (c && sees(c)) { p.face = Math.atan2(c.y - p.y, c.x - p.x); p.lost = 0; }
      else if ((p.lost = (p.lost || 0) + dt) > 0.5) { p.aim = 0; return; }     // lost sight of them: give up the shot
    }
    if (p.aim >= PIRATE_AIM) {
      p.aim = 0; p.cd = PIRATE_COOLDOWN;
      const ux = Math.cos(p.face), uy = Math.sin(p.face);
      boarding.bolts.push({ x: p.x + ux * 0.4, y: p.y + uy * 0.4, vx: ux * PIRATE_SHOT, vy: uy * PIRATE_SHOT, life: 0.5, owner: 'pirate', fast: true }); sfx.heavyLaunch();
    }
    return;
  }
  const leaving = dk.dock && dk.dock.detachT !== null && dk.dock.detachT !== undefined;
  if (p.cd <= 0 && !leaving) {
    const foe = crew.filter(sees).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (foe) { p.target = foe.id; p.aim = dt; p.lost = 0; p.face = Math.atan2(foe.y - p.y, foe.x - p.x); return; }
  }
  // looting: grab something, carry it to their crate, PIRATE_LOOT times; then head home and stay there
  let goal = null;
  const loot = ITEMS.filter(it => !inDock(it.x, it.y) && it.kind !== 'blackbox');
  if (power.reserve > 0) loot.push({ x: FUEL_CRATE.x + 0.8, y: FUEL_CRATE.y, crate: true });
  if (!p.carry && !p.done && (p.loots >= PIRATE_LOOT || !loot.length)) { p.done = true; combatBanner('A pirate is done looting and heads back to their ship'); }
  if (leaving || p.carry || p.done) { if (g) goal = { x: g.crate.x + 1, y: g.crate.y + 1.2, home: true }; }
  else goal = loot.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] || null;
  if (!goal) return;
  if (!p.route.length || p.goalKey !== `${goal.x.toFixed(1)},${goal.y.toFixed(1)}`) { p.route = dockRoute(p.x, p.y, goal.x, goal.y); p.goalKey = `${goal.x.toFixed(1)},${goal.y.toFixed(1)}`; }
  const n = p.route[0];
  const moved = n ? pirateStep(p, n.x, n.y, dt) : 0;
  if (n && Math.hypot(n.x - p.x, n.y - p.y) < 0.2) p.route.shift();
  p.stuck = moved < 0.002 && Math.hypot(goal.x - p.x, goal.y - p.y) > 0.5 ? p.stuck + dt : 0;
  if (p.stuck > 3) { p.route = []; p.stuck = 0; }    // a locked door: try again (they never bash doors)
  if (Math.hypot(goal.x - p.x, goal.y - p.y) < 0.5) {
    if (goal.home) { if (p.carry) { dk.dock.crate.push(p.carry); p.carry = null; p.loots = (p.loots || 0) + 1; sfx.clank(); } else if (p.done) p.home = true; }
    else if (goal.crate) { power.reserve--; p.carry = 'fuel'; sfx.clank(); combatBanner('A pirate grabbed a fuel cell!'); p.route = []; }
    else { const i = ITEMS.indexOf(goal); if (i >= 0) { ITEMS.splice(i, 1); p.carry = goal.kind; sfx.clank(); combatBanner(`A pirate grabbed the ${ITEM_NAMES[goal.kind]}!`); p.route = []; } }
  }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function updateDock(dt) {
  const d = dk.dock;
  if (d) {
    const h = DG().hatch; h.open = 1;
    if (d.detachT !== null && (d.detachT -= dt) <= 0) undock();
    for (const f of d.fires || []) {                  // derelict fire: hurts anyone standing in it
      f.t += dt;
      for (const c of crew) if (c.mode === 'inside' && Math.hypot(c.x - f.x, c.y - f.y) < 0.8 && f.t > 1.5) { f.t = 0; hurtCrew(c); combatBanner(`${c.name} walked into the fire!`); }
    }
    if (d.fires) d.fires = d.fires.filter(f => f.hp > 0);
  }
  for (const p of dk.pirates) updatePirate(p, dt);
  if (dk.dock?.kind === 'pirate' && dk.dock.detachT === null && dk.pirates.length && dk.pirates.every(p => p.home)) {
    dk.dock.detachT = LEAVE_DELAY; combatBanner(`The pirates are leaving with their loot — ${LEAVE_DELAY} s until they cast off!`); sfx.alarm();
  }
  for (const b of boarding.bolts) {                   // our bolts vs pirates
    if (b.owner !== 'crew') continue;
    const p = dk.pirates.find(p => !p.dead && Math.hypot(b.x - p.x, b.y - p.y) < 0.42);
    if (p) { b.dead = true; hurtPirate(p, boltDamage(b), boltStun(b)); }
  }
  boarding.bolts = boarding.bolts.filter(b => !b.dead);
  dk.pirates = dk.pirates.filter(p => !p.dead);
  // the engineer follows whoever treated them, along their footsteps
  const N = dk.npc;
  if (N && N.state === 'follow') {
    const lead = crew.find(c => c.id === N.leader);
    if (lead && lead.mode === 'inside') {
      const last = N.crumbs[N.crumbs.length - 1];
      if (!last || Math.hypot(last.x - lead.x, last.y - lead.y) > 0.35) N.crumbs.push({ x: lead.x, y: lead.y });
    }
    const c0 = N.crumbs[0];
    if (c0 && (!lead || Math.hypot(lead.x - N.x, lead.y - N.y) > 1.1)) {
      const dx = c0.x - N.x, dy = c0.y - N.y, dd = Math.hypot(dx, dy), sp = Math.min(dd, NPC_SPEED * dt);
      if (dd > 0.01) { N.x += dx / dd * sp; N.y += dy / dd * sp; N.face = Math.atan2(dy, dx); N.walk += sp * 3; }
      if (dd < 0.15) N.crumbs.shift();
    }
    if (roomAt(N.x, N.y)) { N.state = 'safe'; N.crumbs = []; combatBanner(`${cap(npcName())} is safe aboard!`); sfx.win(); }
  }
  if (N && N.state !== 'down') for (const b of boarding.bolts) if (b.owner !== 'crew' && Math.hypot(b.x - N.x, b.y - N.y) < 0.35) { b.dead = true; N.state = 'down'; N.crumbs = []; combatBanner(`${cap(npcName())} got hit — treat them again!`); }
  for (const c of crew) c.slow = c.inv.item === 'blackbox' ? 0.6 : 1;   // the black box is heavy
}
function sprayDock(a, dt) {                           // the extinguisher works on the derelict's fire
  for (const f of dk.dock?.fires || []) {
    const d = Math.hypot(f.x - player.x, f.y - player.y), off = Math.abs(wrapAngle(Math.atan2(f.y - player.y, f.x - player.x) - a));
    if (d < SPRAY_RANGE && off < 0.45) { f.hp -= SPRAY_RATE * dt; if (f.hp <= 0) combatBanner('Fire out'); }
  }
}

// ---------------------------------------------------------------------------
// Clicking: the loot crate, the overload, the engineer, the jammed door (prompt), drilling
// ---------------------------------------------------------------------------
function dockClickTarget(mx, my) {
  const d = dk.dock, g = DG(), at = (p, r) => Math.hypot(mx - p.x, my - p.y) <= r;
  const N = dk.npc;
  if (N && N.state === 'down' && at(N, 0.55)) {
    if (!near(N.x, N.y)) return { text: `${cap(npcName())} — get closer`, ok: false, x: N.x, y: N.y, r: 0.55 };
    return holdTarget('npc', TREAT_TIME, `Hold click: treat ${npcName()} (${TREAT_TIME} s) — then they follow you`, N.x, N.y, 0.55,
                      () => { N.state = 'follow'; N.leader = player.id; N.crumbs = []; combatBanner('"Thanks! Lead the way — I\'m right behind you."'); sfx.poi(); });
  }
  if (!d) return null;
  if (at(g.crate, 0.7)) {
    const t = { x: g.crate.x, y: g.crate.y, r: 0.7 };
    if (!near(t.x, t.y)) return { ...t, text: 'Cargo crate — get closer', ok: false };
    if (!d.crate.length) return { ...t, text: 'The cargo crate is empty', ok: false };
    const k = d.crate[d.crate.length - 1];
    return { ...t, ok: true, text: `Click: take the ${ITEM_NAMES[k]} from their crate (${d.crate.length} inside)`, run: () => { d.crate.pop(); grab(k); } };
  }
  if (d.kind === 'pirate' && at(g.core, 1.0)) {
    const t = { x: g.core.x, y: g.core.y, r: 1.0 };
    if (d.overloaded) return { ...t, text: `Overloading — they cast off in ${Math.ceil(d.detachT)} s. Get out!`, ok: false };
    if (!near(t.x, t.y, REACH + 0.5)) return { ...t, text: 'Pirate reactor — get closer', ok: false };
    if (inv.weapon !== 'repair') return { ...t, text: 'Pirate reactor — bring the repair kit to jam it', ok: false };
    return holdTarget('overload', OVERLOAD_TIME, `Hold click: jam their reactor into overload (${OVERLOAD_TIME} s)`, t.x, t.y, 1.0,
                      () => { d.overloaded = true; d.detachT = DETACH_TIME; sfx.alarm(); combatBanner(`Their reactor is overloading — they'll cast off in ${DETACH_TIME} s! Get back aboard!`); });
  }
  return null;
}
// Jammed derelict door: a prompt like ours (manual override).
function dockAct() {
  const d = dk.dock, g = DG();
  if (!d) return false;
  for (let i = 0; i < 2; i++) {
    if (!d.doors[i]) continue;
    const q = g.doors[i], cx = q.x + q.w / 2, cy = q.y + q.h / 2;
    if (Math.hypot(player.x - cx, player.y - cy) > 1.4) continue;
    act({ text: 'Click: force the jammed door (manual override)', at: { x: cx, y: cy, r: 1.2 }, run: () => startOverride({ dockDoor: i }, 'Jammed door', () => { d.doors[i] = false; }) });
    return true;
  }
  return false;
}
function dockEvaTarget(mx, my) {
  const r = dk.rock;
  if (!r) return null;
  const d = Math.hypot(mx - r.x, my - r.y);
  if (d > r.r + 0.3) return null;
  const ex = r.x + (player.x - r.x) / (Math.hypot(player.x - r.x, player.y - r.y) || 1) * r.r, ey = r.y + (player.y - r.y) / (Math.hypot(player.x - r.x, player.y - r.y) || 1) * r.r;
  if (!near(ex, ey)) return { text: 'Ore asteroid — get closer', ok: false, x: r.x, y: r.y, r: r.r };
  if (inv.weapon !== 'drill') return { text: 'Ore asteroid — bring the mining drill (left airlock room)', ok: false, x: r.x, y: r.y, r: r.r };
  return holdTarget('drill', DRILL_TIME, `Hold click: drill out an ore sample (${DRILL_TIME} s)`, r.x, r.y, r.r,
                    () => { hz.floating.push({ uid: newUid(), kind: 'ore', x: player.x, y: player.y - 0.3, t: 0 }); combatBanner('Ore sample drilled out — grab it and bring it inside!'); sfx.crack(); });
}
function dockSpots() {
  const g = DG(), out = [];
  if (g) {
    if (dk.dock.crate.length) out.push({ ...g.crate, r: 0.6 });
    if (dk.dock.kind === 'pirate' && !dk.dock.overloaded) out.push({ ...g.core, r: 0.9 });
    dk.dock.doors.forEach((locked, i) => { if (locked) { const q = g.doors[i]; out.push({ x: q.x + q.w / 2, y: q.y + q.h / 2, w: q.w + 0.3, h: q.h }); } });
  }
  if (dk.npc?.state === 'down') out.push({ x: dk.npc.x, y: dk.npc.y, r: 0.5 });
  return out;
}
const objectiveAboard = (kind) => crew.some(c => c.inv.item === kind && (roomAt(c.x, c.y) || (c.mode === 'inside' && !inDock(c.x, c.y)))) || ITEMS.some(i => i.kind === kind && roomAt(i.x, i.y));

// ---------------------------------------------------------------------------
// Drawing. With the sprite renderer (GFX.on) the docked ship, the tube and the props inside are
// sprites (tools/blender/models/dock/: origin of the ship and tube = our hatch on the ground; the props
// sit at g.core, g.crate and the door rects' centres), and so are the pirates and the engineer /
// Dr. Varga (models/chars/pirate.py, npc.py). While a sprite's page loads, the old 2D drawing stays.
// Procedural on top: fire, the crate's pickup halo, the overload countdown, the pirates' red halo,
// laser sight, name tag, HP pips and hurt flash. The derelict's darkness: drawDockDarkness.
// ---------------------------------------------------------------------------
const dockShipSprite = (d) => `dock/${d.kind === 'derelict' ? 'derelict' : d.brig ? 'brig' : 'pirate'}_${d.side}`;
function dockPropSprites(d) {
  const pir = d.kind === 'pirate', n = d.crate.length;
  return {
    core: pir ? (d.overloaded ? 'dock/pirate_reactor_overload' : 'dock/pirate_reactor') : 'dock/derelict_core',
    crate: pir ? (n >= 2 ? 'dock/crate_loot_full' : n === 1 ? 'dock/crate_loot_one' : 'dock/crate_loot_empty') : 'dock/crate_cargo',
  };
}
// The docked ship in sprites: all or nothing (false → the 2D version), so the parts never mix.
function drawDockSprites(d, g, t) {
  if (!GFX.on) return false;
  const ship = dockShipSprite(d), tube = `dock/tube_${d.side}`, P = dockPropSprites(d);
  if (![ship, tube, P.core, P.crate, 'dock/door_jammed', 'dock/door_open'].every(n => GFX.ready(n))) { GFX.preload(['dock']); return false; }
  const h = g.hatch, all = [...g.rooms, ...g.doors], y0 = Math.min(...all.map(q => q.y));
  GFX.sprite(ship, 0, h.x, h.y, 0, { layer: 'wall', sortY: y0 - 1, emissive: d.kind === 'derelict' ? 0.5 : 0.35 });
  GFX.sprite(tube, 0, h.x, h.y, 0, { layer: 'wall', sortY: g.tube.y, emissive: 0.3 });
  const pir = d.kind === 'pirate';
  const coreF = pir ? Math.floor(t * (d.overloaded ? 14 : 3)) % 6 : 0;
  GFX.sprite(P.core, coreF, g.core.x, g.core.y, 0, { layer: 'wall', sortY: g.core.y, emissive: pir ? (d.overloaded ? 0.9 : 0.6) : 0.1 });
  GFX.sprite(P.crate, 0, g.crate.x, g.crate.y, 0, { layer: 'wall', sortY: g.crate.y, emissive: 0.2 });
  d.doors.forEach((jammed, i) => {                    // the derelict's doors: jammed, or pried back after the override
    if (!jammed && pir) return;
    const q = g.doors[i];
    GFX.sprite(jammed ? 'dock/door_jammed' : 'dock/door_open', 0, q.x + q.w / 2, q.y + q.h / 2, 0, { layer: 'wall', sortY: q.y + q.h / 2, emissive: 0.4 });
  });
  return true;
}
function drawDock(t) {
  const d = dk.dock, g = DG();
  if (d) {
    const pir = d.kind === 'pirate', all = [...g.rooms, ...g.doors], sprited = drawDockSprites(d, g, t);
    if (!sprited) {
      const x0 = Math.min(...all.map(q => q.x)) - 0.7, x1 = Math.max(...all.map(q => q.x + q.w)) + 0.7, y0 = Math.min(...all.map(q => q.y)) - 0.7, y1 = Math.max(...all.map(q => q.y + q.h)) + 0.7;
      // hull (rough and patched for the derelict, red trimmed for the pirates)
      rr(L(x0), L(y0), L(x1 - x0), L(y1 - y0), 18); ctx.fillStyle = pir ? '#4a3a40' : '#3a3f46'; ctx.fill(); stroke(4);
      rr(L(x0) + 6, L(y0) + 6, L(x1 - x0) - 12, L(y1 - y0) - 12, 14); ctx.strokeStyle = pir ? '#a83a3a' : '#5a5040'; ctx.lineWidth = 3; ctx.stroke();
      if (!pir) for (let i = 0; i < 6; i++) { const q = rng(77 + i); ctx.fillStyle = 'rgba(20,16,12,0.5)'; ctx.beginPath(); ctx.arc(L(x0 + q() * (x1 - x0)), L(y0 + q() * (y1 - y0)), L(0.4 + q() * 0.6), 0, TAU); ctx.fill(); }
      // the tube: ribbed and flexible
      const tq = g.tube;
      rr(L(tq.x), L(tq.y) - 6, L(tq.w), L(tq.h) + 12, 10); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(3);
      for (let x = tq.x + 0.3; x < tq.x + tq.w; x += 0.45) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(L(x), L(tq.y) - 6, 4, L(tq.h) + 12); }
      drawFloors(all, () => pir ? '#6a5a5e' : '#5a5e66');
      ctx.fillStyle = 'rgba(30,34,42,0.5)'; ctx.fillRect(L(tq.x), L(tq.y), L(tq.w), L(tq.h));
      // jammed doors
      d.doors.forEach((locked, i) => { if (!locked) return; const q = g.doors[i]; hazardStripe(L(q.x), L(q.y), L(q.w), L(q.h)); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.strokeRect(L(q.x), L(q.y), L(q.w), L(q.h)); });
      // cargo crate
      crate(L(g.crate.x), L(g.crate.y), L(1.3), L(1.0), 0.05, pir ? '#8a5a3a' : '#6a6f7a', pir ? 'LOOT' : 'CARGO');
    }
    if (d.crate.length) glowLayer(() => pickupHalo(L(g.crate.x), L(g.crate.y), T * 0.8, t, me.mode === 'inside' && Math.hypot(me.x - g.crate.x, me.y - g.crate.y) <= REACH, 2.2));
    // core: a pirate reactor (red, overloading?) or a dead one
    const cx = L(g.core.x), cy = L(g.core.y);
    if (!sprited) {
      rr(cx - L(0.9), cy - L(1.1), L(1.8), L(2.2), 8); ctx.fillStyle = pir ? '#6a2a24' : '#2b2e34'; ctx.fill(); stroke(3);
      const glow = pir ? (d.overloaded ? 0.6 + 0.4 * Math.sin(t * 20) : 0.5 + 0.2 * Math.sin(t * 2)) : 0.05;
      const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, L(1.4)); gg.addColorStop(0, `rgba(255,90,60,${glow})`); gg.addColorStop(1, 'rgba(255,90,60,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, cy, L(1.4), 0, TAU); ctx.fill();
      if (pir) { ctx.fillStyle = d.overloaded ? '#ffe08a' : '#c9ced8'; ctx.fillRect(cx - 4, cy - L(0.6), 8, L(0.5)); ctx.fillStyle = '#ffd0c8'; ctx.font = `800 ${T * 0.13}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(d.overloaded ? `OVERLOAD ${Math.ceil(d.detachT)}` : 'REACTOR', cx, cy + L(0.75)); ctx.textAlign = 'left'; }
    } else if (pir && d.overloaded) upright(camera(), g.core.x, g.core.y + 1.15, 0, () => {   // the countdown, on the reactor's front
      ctx.font = `800 ${T * 0.2}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText(`OVERLOAD ${Math.ceil(d.detachT)}`, 0, 0);
      ctx.fillStyle = Math.sin(t * 20) > 0 ? '#ffe08a' : '#ff7a6a'; ctx.fillText(`OVERLOAD ${Math.ceil(d.detachT)}`, 0, 0); ctx.textAlign = 'left';
    });
    for (const f of d.fires || []) {                   // derelict fire (the fire sprites like ours; else simple flames)
      if (GFX.on && drawFireSprite({ x: f.x, y: f.y, seed: f.x * 2.3 + f.y }, (0.55 + 0.45 * f.hp) * 1.6, t)) continue;
      for (let i = 0; i < 4; i++) { const h = L(0.6 + 0.3 * Math.sin(t * 9 + i)) * f.hp; ctx.beginPath(); ctx.ellipse(L(f.x) + (i - 1.5) * 8, L(f.y) - h / 2, 6, h / 2, 0, 0, TAU); ctx.fillStyle = i % 2 ? '#ff9a2e' : '#d8401c'; ctx.fill(); }
    }
  }
  if (GFX.on) glowLayer(() => { for (const p of dk.pirates) pirateHalo(p); });   // (on the floor, under the sprites; unlit so they read in the dark)
  const R = dk.rock;                                    // the ore asteroid: enemy/ore_rock (modelled at r 2.2), its crystals' glow pulsing on top
  if (R && GFX.on && GFX.ready('enemy/ore_rock') && GFX.ready('enemy/ore_rock_glow')) {
    GFX.sprite('enemy/ore_rock', 0, R.x, R.y, 0, { layer: 'under', scale: R.r / 2.2 });
    GFX.sprite('enemy/ore_rock_glow', 0, R.x, R.y, 0, { layer: 'under', scale: R.r / 2.2, emissive: 1, alpha: 0.6 + 0.3 * Math.sin(t * 2) });
  } else if (dk.rock) { drawLump(lumpShape(dk.rock.seed, 11, 0.3), L(dk.rock.x), L(dk.rock.y), L(dk.rock.r), 0.3, ['#8d8274', '#6e6359', '#4c433c'], true); for (let i = 0; i < 5; i++) { ctx.fillStyle = `rgba(122,240,255,${0.5 + 0.3 * Math.sin(t * 2 + i)})`; ctx.beginPath(); ctx.arc(L(dk.rock.x + Math.cos(i * 1.3) * 1.2), L(dk.rock.y + Math.sin(i * 1.3) * 1.1), 4, 0, TAU); ctx.fill(); } }
}
// Walking, for sprites: is this actor's walk counter advancing? (works on snapshots too)
const actorAnim = new Map();
function actorMoving(key, walk) {
  let a = actorAnim.get(key);
  if (!a) actorAnim.set(key, a = { walk, moving: 0 });
  a.moving = Math.abs(walk - a.walk) > 1e-4 ? 0.12 : Math.max(0, a.moving - 1 / 60);
  a.walk = walk;
  return a.moving > 0;
}
// The engineer / Dr. Varga: down (lying, visor down), following (walk), safe (idle).
function drawNpcSprite(N) {
  if (!GFX.on) return false;
  const visor = inVacuum(N.x, N.y) || inDock(N.x, N.y), V = visor ? '_visor' : '';
  const moving = actorMoving('npc', N.walk);
  let name = N.state === 'down' ? 'chars/varga/down_visor' : moving ? `chars/varga/walk${V}` : `chars/varga/idle${V}`;
  const f = moving ? Math.floor((N.walk / TAU) * 8) : 0;
  return GFX.sprite(name, GFX.frameIndex(name, N.face, f), N.x, N.y, 0, { emissive: 0.35, pick: N.state === 'down' ? [0.6, 0.7] : [0.3, 1.2] });
}
// Pirates and the engineer: drawn with the crew (after the floors), so they're visible on our ship too.
function drawDockActors(t) {
  for (const p of dk.pirates) drawPirate(p, t);
  const N = dk.npc;
  if (N) {
    const sprited = drawNpcSprite(N);
    if (sprited) { /* the sprite */ }
    else if (N.state === 'down') { ctx.save(); ctx.translate(L(N.x), L(N.y)); ctx.rotate(Math.PI / 2); drawCrew(0, 0, 0, 0, true, '#e8e4dc'); ctx.restore(); }
    else drawCrew(L(N.x), L(N.y), N.face, N.walk, inVacuum(N.x, N.y) || inDock(N.x, N.y), '#e8e4dc');
    const nm = npcName().replace(/^the /, '').toUpperCase(), label = N.state === 'down' ? `${nm} (hurt)` : N.state === 'safe' ? `${nm} — safe` : nm;
    const tag = () => { ctx.fillStyle = '#ffe08a'; ctx.font = `700 ${T * 0.22}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(label, 0, 0); ctx.textAlign = 'left'; };
    if (sprited) upright(camera(), N.x, N.y, N.state === 'down' ? 0.8 : 1.4, () => { ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,18,0.8)'; ctx.font = `700 ${T * 0.22}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.strokeText(label, 0, 0); tag(); });
    else { ctx.save(); ctx.translate(L(N.x), L(N.y) - L(0.5)); tag(); ctx.restore(); }
  }
}
// The derelict is dark: everything but a small circle around you is dim.
function drawDockDarkness() {
  const d = dk.dock, g = DG();
  if (!d || d.kind !== 'derelict' || GFX.on) return;     // (sprites: js/lights.js lights it dark, with emergency strips)
  for (const q of [...g.rooms, ...g.doors]) { ctx.fillStyle = 'rgba(4,6,12,0.55)'; ctx.fillRect(L(q.x), L(q.y), L(q.w), L(q.h)); }
}
function pirateHalo(p) {                              // a red halo so they read on any floor
  const glow = ctx.createRadialGradient(L(p.x), L(p.y), 0, L(p.x), L(p.y), L(0.75));
  glow.addColorStop(0, 'rgba(255,60,40,0.35)'); glow.addColorStop(1, 'rgba(255,60,40,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(L(p.x), L(p.y), L(0.75), 0, TAU); ctx.fill();
}
// Pirate sprite: stunned (2 frames) > aiming > carrying loot (walk cycle, frame 0 standing) > walking > idle.
function drawPirateSprite(p, t) {
  if (!GFX.on) return false;
  const moving = actorMoving(p.uid, p.walk), wf = Math.floor((p.walk / TAU) * 8);
  const [name, f] = p.stun > 0 ? ['chars/pirate/stunned', Math.floor(t * 2.5)] : p.aim > 0 ? ['chars/pirate/aim', 0]
    : p.carry ? ['chars/pirate/carry', moving ? wf : 0] : moving ? ['chars/pirate/walk', wf] : ['chars/pirate/idle', 0];
  return GFX.sprite(name, GFX.frameIndex(name, p.face, f), p.x, p.y, 0, { emissive: 0.3, pick: [0.32, 1.25] });
}
const PIRATE_GUN_Z = 1.05;                            // the levelled carbine's height (chars/pirate/aim)
function drawPirate(p, t) {
  const sprited = drawPirateSprite(p, t), lz = sprited ? GFX.lift(PIRATE_GUN_Z) : 0, m0 = sprited ? 0.45 : 0;
  if (p.aim > 0) {                                    // laser sight: faint while tracking, bright and flickering once locked
    const locked = p.aim >= PIRATE_AIM - PIRATE_LOCK;
    let len = 0; while (len < PIRATE_RANGE && freeAt(p.x + Math.cos(p.face) * len, p.y + Math.sin(p.face) * len)) len += 0.1;   // up to the first wall
    const ex = L(p.x + Math.cos(p.face) * len), ey = L(p.y + Math.sin(p.face) * len - lz);
    ctx.beginPath(); ctx.moveTo(L(p.x + Math.cos(p.face) * m0), L(p.y + Math.sin(p.face) * m0 - lz)); ctx.lineTo(ex, ey);
    ctx.strokeStyle = locked ? `rgba(255,${Math.sin(t * 40) > 0 ? 60 : 160},60,0.95)` : 'rgba(255,90,90,0.35)'; ctx.lineWidth = locked ? 3 : 1.2; ctx.stroke();
    if (locked) { ctx.beginPath(); ctx.arc(ex, ey, 5, 0, TAU); ctx.fillStyle = 'rgba(255,80,60,0.9)'; ctx.fill(); }
  }
  if (sprited) {
    const view = camera();
    if (p.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${p.flash * 0.4})`; ctx.beginPath(); ctx.ellipse(L(p.x), L(p.y - GFX.lift(0.65)), L(0.32), L(0.6), 0, 0, TAU); ctx.fill(); }
    if (p.carry) upright(view, p.x, p.y, 1.0, () => drawItemIcon(p.carry, L(0.5), 0, 0.7));
    upright(view, p.x, p.y, 1.4, () => {
      ctx.font = `800 ${T * 0.22}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText('PIRATE', 0, 0); ctx.fillStyle = '#ff7a6a'; ctx.fillText('PIRATE', 0, 0); ctx.textAlign = 'left';
      for (let i = 0; i < PIRATE_HP; i++) { ctx.fillStyle = i < p.hp ? '#e2574c' : '#2b303a'; ctx.fillRect(-8 + i * 6, 2, 5, 3); }
    });
    if (p.stun > 0) for (let i = 0; i < 3; i++) {     // dazed stars
      const q = t * 4 + i * TAU / 3;
      ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(L(p.x) + Math.cos(q) * 12, L(p.y - GFX.lift(1.3)) + Math.sin(q) * 4, 2.5, 0, TAU); ctx.fill();
    }
    return;
  }
  if (!GFX.on) pirateHalo(p);
  drawCrew(L(p.x), L(p.y), p.face, p.walk, false, '#b0302a');
  ctx.save(); ctx.translate(L(p.x), L(p.y)); ctx.rotate(p.face);              // blaster + bandana
  ctx.fillStyle = '#2b303a'; ctx.fillRect(L(0.15), 4, L(0.35), 5); ctx.restore();
  ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(L(p.x), L(p.y) - 2, 6, Math.PI, TAU); ctx.fill();
  ctx.font = `800 ${T * 0.22}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText('PIRATE', L(p.x), L(p.y) - L(0.62)); ctx.fillStyle = '#ff7a6a'; ctx.fillText('PIRATE', L(p.x), L(p.y) - L(0.62)); ctx.textAlign = 'left';
  if (p.carry) drawItemIcon(p.carry, L(p.x) + L(0.45), L(p.y) - L(0.3), 0.7);
  if (p.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${p.flash * 0.4})`; ctx.beginPath(); ctx.arc(L(p.x), L(p.y), L(0.35), 0, TAU); ctx.fill(); }
  for (let i = 0; i < PIRATE_HP; i++) { ctx.fillStyle = i < p.hp ? '#e2574c' : '#2b303a'; ctx.fillRect(L(p.x) - 8 + i * 6, L(p.y) - L(0.6), 5, 3); }
}
function dockPlates(add) {
  if (dk.pirates.length) add('pirates', { icon: 'frigate', title: 'PIRATES ABOARD', sub: `${dk.pirates.length} · stealing: ${dk.pirates.filter(p => p.carry).map(p => ITEM_NAMES[p.carry]).join(', ') || 'looking for loot'}`, stripe: '#e2574c', red: true });
  for (const e of combat.enemies) if (e.kind === 'pirate' && e.phase === 'fighting') add('dockT' + uid(e), { icon: 'frigate', title: 'PIRATES DOCKING', sub: `in ${Math.ceil(e.dockT ?? DOCK_TIME)} s unless driven off`, stripe: '#e2574c', red: true });
  if (dk.dock?.kind === 'pirate') add('pship', { icon: 'frigate', title: dk.dock.overloaded ? 'PIRATES CASTING OFF' : 'PIRATE SHIP DOCKED', sub: dk.dock.overloaded ? `in ${Math.ceil(dk.dock.detachT)} s — get off their ship!` : `${SIDE_LABEL[dk.dock.side].toLowerCase()} airlock · loot crate · jam their reactor`, stripe: '#e8c34f', red: !!dk.dock.overloaded });
  if (dk.dock?.kind === 'derelict') add('derelict', { icon: 'frigate', title: 'DERELICT', sub: `tethered at the ${SIDE_LABEL[dk.dock.side].toLowerCase()} airlock · no air inside`, stripe: '#7a8396' });
  if (dk.npc && dk.npc.state !== 'safe') add('npc', { icon: 'ping', title: npcName().replace(/^the /, '').toUpperCase(), sub: dk.npc.state === 'down' ? 'hurt — treat them (hold click)' : 'following — lead them aboard', stripe: '#ffe08a', red: dk.npc.state === 'down' });
  if (dk.rock) add('rock', { icon: 'asteroid', title: 'ORE ASTEROID', sub: 'front · drill it on a spacewalk', stripe: '#7af0ff' });
}
