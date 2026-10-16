// Other ships you can walk onto. A docking tube runs from one of our outer airlocks to a small
// three-room ship (airlock, cargo, core); while docked, its rooms are walkable like ours.
//   Pirates     a raider pulls alongside and shoots up our engines; if it isn't driven off in time it
//               docks, and two pirates come over to steal loose items and fuel cells. Board them back:
//               their cargo crate has the loot, and jamming their reactor's overload makes them panic
//               and cast off 15 s later (anyone still aboard ends up floating outside our hull).
//   Derelict    a dark, airless wreck on a tether: a sleeping intruder, a jammed door, a fire, and
//               (depending on the mission) the black box to bring home or an engineer to rescue.
//   Mining      not a ship: a big asteroid parked in front; drill it on a spacewalk for an ore sample.
//   Base        the Red Comet's base (chapter 5): rooms in a row (docking bay, server room, barracks, gun corridor, brig),
//               guards in each, a sentry gun down the corridor, a broken security terminal to repair and hack, a door code someone wrote on
//               the wall, and Dr. Varga in the brig. See "The pirate base" below.
// Everything in `dk` is plain data.

const dk = { dock: null, pirates: [], npc: null, rock: null, defeated: 0, ships: 0, bodies: [] };   // ships: pirate raiders destroyed; bodies: fallen pirates { x, y, face, t } (purely visual)
const DOCK_TIME = 40, DETACH_TIME = 15, PIRATE_HP = 3, PIRATE_SPEED = 2.3, PIRATE_RANGE = 9;
// Pirates stop and aim: a faint laser sight tracks you right up to the shot — after PIRATE_AIM s a very fast shot
// goes down that line, so get behind a wall (out of its sight) when you see it. Then a long cooldown: your window
// to hit back. (No lock-on phase any more: the sight never stops following you.)
const PIRATE_AIM = 1.7, PIRATE_SHOT = 30, PIRATE_COOLDOWN = 5, PIRATE_LOOT = 2, LEAVE_DELAY = 4;
const OVERLOAD_TIME = 3, DRILL_TIME = 6, NPC_SPEED = 2.6;

const MAX_BODIES = 12, FALL_TIME = 0.6;               // fallen pirates kept lying around (oldest go first); how long the fall takes
function resetDock() { Object.assign(dk, { dock: null, pirates: [], npc: null, rock: null, defeated: 0, ships: 0, bodies: [] }); }

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
const DG = () => dk.dock && (dk.dock.kind === 'base' ? baseGeom(dk.dock.side) : dockGeom(dk.dock.side));
function dockRects() {
  const g = DG();
  if (!g) return [];
  return [...(dk.dock.tube === 'detached' ? [] : [g.tube]), ...(g.floor || g.rooms), ...g.doors.filter((d, i) => !dk.dock.doors[i])];
}
const inDock = (x, y) => { const g = DG(); return !!g && [g.tube, ...g.rooms, ...g.doors].some(q => inRect(x, y, q)); };
// A spacewalker can't float through the docked ship's (or the pirate base's) rooms; over the tube is fine.
const dockBlocksEva = (x, y) => { const g = DG(); return !!g && [...g.rooms, ...g.doors].some(q => inRect(x, y, q, CREW_R)); };
const dockRoomsForCamera = () => { const g = DG(); return g ? g.rooms.map(q => ({ rects: [q] })) : []; };
function dockVacuum(x, y) {
  const g = DG();
  if (!g) return false;
  return inRect(x, y, g.tube) || (dk.dock.kind === 'derelict' && [...g.rooms, ...g.doors].some(q => inRect(x, y, q)));
}
const dockName = () => dk.dock ? (dk.dock.kind === 'pirate' ? 'Pirate ship' : dk.dock.kind === 'base' ? 'Pirate base' : 'Derelict') : null;

// ---------------------------------------------------------------------------
// Docking
// ---------------------------------------------------------------------------
function dockShip(kind, side, contents = {}) {
  if (dk.dock) return false;
  if (kind === 'base') return dockBase(side);
  // brig: the Red Comet's prison barge (EVENT_RUNNERS.brig: a pirate dock with a prisoner aboard) — looks, nothing else
  dk.dock = { kind, side, brig: kind === 'pirate' && !!contents.npc, doors: kind === 'derelict' ? [true, false] : [false, false], crate: kind === 'pirate' ? ['fuel', 'fuel'] : [], detachT: null, overloaded: false, fires: [] };
  const g = dockGeom(side);
  if (kind === 'pirate') {
    if (contents.npc) dk.npc = { x: g.npcSpot.x, y: g.npcSpot.y, state: 'down', leader: null, route: [], face: 0, walk: 0 };
    for (let i = 0; i < 2; i++) dk.pirates.push({ uid: newUid(), x: g.entry.x + (side === 'port' ? -1 : 1) * i, y: g.y + (i ? 0.6 : -0.6), face: 0, walk: 0, hp: PIRATE_HP, carry: null, state: 'steal', cd: 1 + i, aim: 0, route: [], stuck: 0, stun: 0, flash: 0 });
    combatBanner('The pirates docked at the ' + (side === 'port' ? 'left' : 'right') + ' airlock — they\'re coming aboard!'); sfx.explosion();
  } else {
    dk.dock.fires.push({ x: g.fire.x, y: g.fire.y, hp: 1, t: 0 });
    if (contents.blackbox) ITEMS.push({ kind: 'blackbox', x: g.boxSpot.x, y: g.boxSpot.y });
    if (contents.npc) dk.npc = { x: g.npcSpot.x, y: g.npcSpot.y, state: 'down', leader: null, route: [], face: 0, walk: 0 };
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
  if (dk.npc && inDock(dk.npc.x, dk.npc.y) && !npcAboard(dk.npc)) dk.npc = null;   // (left behind on their ship)
  dk.bodies = (dk.bodies || []).filter(B => !inDock(B.x, B.y) || roomAt(B.x, B.y));
  dk.dock = null;
  if (d.kind === 'pirate' && d.overloaded) {   // the jammed reactor blows it apart as it pulls away: a raider destroyed
    dk.ships++; combatFlip('fx/explosion_l', g.core.x, g.core.y, 2.2); sfx.explosion();
    combatBanner('The pirate ship cast off in a panic — and its jammed reactor blew it apart!'); sfx.hatch(); return;
  }
  combatBanner(d.kind === 'pirate' ? 'The pirate ship cast off.' : 'The derelict drifts away.'); sfx.hatch();
}

// The pirate raider: an enemy ship until it docks.
ENEMY_TYPES.pirate = {
  ...ENEMY_TYPES.interceptor, name: 'Pirate raider', fire: [2.2, 3.4],
  onHit(e) { if (e.pois.every(q => q.hit)) { dk.defeated++; dk.ships++; } },   // a raider shot to scrap: a pirate defeated and a ship destroyed
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
  const chain = g?.chain || (g ? [g.core, ...g.doors.slice().reverse().map(q => ({ x: q.x + q.w / 2, y: q.y + q.h / 2 })), { x: g.rooms[0].x + g.rooms[0].w / 2, y: g.y }, g.tubeMid, { x: g.hatch.inside[0], y: g.hatch.inside[1] }] : []);
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
  pts.push({ x: tx, y: ty });
  // skip route points behind us: the chain starts at its point nearest to (x, y), which can lie the wrong way
  const clear = (q) => { const n = Math.ceil(Math.hypot(q.x - x, q.y - y) / 0.15); for (let i = 1; i <= n; i++) if (!pirateOk(x + (q.x - x) * i / n, y + (q.y - y) * i / n)) return false; return true; };
  while (pts.length > 1 && clear(pts[1])) pts.shift();
  return pts;
}
// A hit (b: the bolt, if it was one) shows on the pirate it hit: a flash, sparks where the bolt struck (at its
// height), a little shove back along the shot, and the lost HP pip blinking (drawPirate).
function hurtPirate(p, dmg, stun = 0, b = null) {
  p.hp -= dmg; p.flash = 1; p.stun = Math.max(p.stun, stun); p.state = 'fight';
  sfx.alienHurt();
  const sp = b ? Math.hypot(b.vx, b.vy) || 1 : 1, ux = b ? b.vx / sp : 0, uy = b ? b.vy / sp : 0, z = b?.z ?? 0.6;
  for (let i = 0; i < 10; i++) combatFxAt(z, p.x - ux * 0.25, p.y - uy * 0.25, -ux * 2 + (Math.random() - 0.5) * 4, -uy * 2 + (Math.random() - 0.5) * 4, 0.5, i % 3 ? '#e2574c' : '#ffe0d8', 0.1);
  if (b) for (const k of [0.25, 0.15]) if (pirateOk(p.x + ux * k, p.y + uy * k)) { p.x += ux * k; p.y += uy * k; break; }
  if (p.hp <= 0) {
    p.dead = true; dk.defeated++;
    if (p.carry) ITEMS.push({ kind: p.carry, ...dropSpot(p.x, p.y) });
    if (p.drops) ITEMS.push({ kind: p.drops, ...dropSpot(p.x + 0.35, p.y + 0.3) });   // (the base's door guards: their carbine, for whoever storms in next)
    dk.bodies = [...(dk.bodies || []), { x: p.x, y: p.y, face: p.face, t: 0 }].slice(-MAX_BODIES);   // they fall and stay down where they died
    combatBanner('Pirate down!'); sfx.win();
  }
}
// Pirates keep apart (no stacks where you can't tell which one you hit): closer than PIRATE_SEP to each other they
// push apart (softly, half each), and away from the crew, Dr. Varga and intruders (all of it on the pirate). Who
// still makes no headway along their route for a while squeezes past for a moment (p.squeeze: no pushing), so two
// in a door or the tube never deadlock: they pass in single file.
const PIRATE_SEP = 0.8, PIRATE_SEP_OTHERS = 0.65;
function separatePirates(dt) {
  const P = dk.pirates, k = Math.min(1, dt * 10);
  const shove = (p, dx, dy) => { if (pirateOk(p.x + dx, p.y)) p.x += dx; if (pirateOk(p.x, p.y + dy)) p.y += dy; };
  // push p (and o, by the other share) apart along the line between them; on the very same spot: some way (seed)
  const away = (p, o, sep, share, other, seed) => {
    let dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy);
    if (d >= sep) return;
    if (d < 1e-4) { dx = Math.cos(seed * 2.39996); dy = Math.sin(seed * 2.39996); d = 0; } else { dx /= d; dy /= d; }
    const m = (sep - d) * k;
    shove(p, dx * m * share, dy * m * share);
    if (other) shove(o, -dx * m * other, -dy * m * other);
  };
  for (const p of P) p.squeeze = Math.max(0, (p.squeeze || 0) - dt);
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
    if (P[i].squeeze > 0 || P[j].squeeze > 0) continue;
    away(P[i], P[j], PIRATE_SEP, 0.5, 0.5, i * 7 + j);
  }
  const others = [...crew.filter(c => c.mode === 'inside'), ...(dk.npc ? [dk.npc] : []), ...boarding.invaders.filter(a => a.mode === 'inside')];
  for (const [i, p] of P.entries()) if (!(p.squeeze > 0)) for (const o of others) away(p, o, PIRATE_SEP_OTHERS, 1, 0, i);
  for (const p of P) {                                // no headway along the route (pushed back as fast as they walk): squeeze past
    const want = p.route?.length > 0 && p.aim <= 0 && !(p.stun > 0), moved = Math.hypot(p.x - (p.lx ?? p.x), p.y - (p.ly ?? p.y));
    p.jam = want && moved < PIRATE_SPEED * dt * 0.25 ? (p.jam || 0) + dt : 0;
    if (p.jam > 0.8) { p.jam = 0; p.squeeze = 1.5; }
    p.lx = p.x; p.ly = p.y;
  }
}
function updatePirate(p, dt) {
  p.flash = Math.max(0, p.flash - dt * 2.5); p.cd -= dt;
  if (p.stun > 0) { p.stun -= dt; p.aim = 0; return; }
  const g = DG();
  const sees = (c) => c.mode === 'inside' && standing(c) && Math.hypot(c.x - p.x, c.y - p.y) < PIRATE_RANGE && lineOfSight(p.x, p.y, c.x, c.y);
  // aiming: stand still, the laser sight tracks the target until the shot, which goes down the sight's line
  if (p.aim > 0) {
    const c = crew.find(c => c.id === p.target);
    p.aim += dt;
    if (c && sees(c)) { p.face = Math.atan2(c.y - p.y, c.x - p.x); p.lost = 0; }
    else if ((p.lost = (p.lost || 0) + dt) > 0.5) { p.aim = 0; return; }       // lost sight of them: give up the shot
    if (p.aim >= PIRATE_AIM) {
      p.aim = 0; p.cd = PIRATE_COOLDOWN;
      const ux = Math.cos(p.face), uy = Math.sin(p.face);
      boarding.bolts.push({ x: p.x + ux * 0.4, y: p.y + uy * 0.4, z: PIRATE_GUN_Z, vx: ux * PIRATE_SHOT, vy: uy * PIRATE_SHOT, life: 0.5, owner: 'pirate', fast: true }); sfx.heavyLaunch();
    }
    return;
  }
  const leaving = dk.dock && dk.dock.detachT !== null && dk.dock.detachT !== undefined;
  if (p.cd <= 0 && !leaving) {
    const foe = crew.filter(sees).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (foe) { p.target = foe.id; p.aim = dt; p.lost = 0; p.face = Math.atan2(foe.y - p.y, foe.x - p.x); return; }
  }
  if (p.mode) { basePirateMove(p, dt); return; }   // the pirate base's guards and the ones that rush us (below)
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
    const h = DG().hatch; h.open = d.tube === 'detached' ? 0 : 1;
    if (d.detachT !== null && (d.detachT -= dt) <= 0) undock();
    for (const f of d.fires || []) {                  // derelict fire: hurts anyone standing in it
      f.t += dt;
      for (const c of crew) if (c.mode === 'inside' && Math.hypot(c.x - f.x, c.y - f.y) < 0.8 && f.t > 1.5) { f.t = 0; hurtCrew(c); combatBanner(`${c.name} walked into the fire!`); }
    }
    if (d.fires) d.fires = d.fires.filter(f => f.hp > 0);
  }
  for (const p of dk.pirates) updatePirate(p, dt);
  if (typeof mission !== 'undefined' && mission.active && !mission.over) releaseForJump();
  if (dk.dock?.kind === 'pirate' && dk.dock.detachT === null && dk.pirates.length && dk.pirates.every(p => p.home)) {
    dk.dock.detachT = LEAVE_DELAY; combatBanner(`The pirates are leaving with their loot — ${LEAVE_DELAY} s until they cast off!`); sfx.alarm();
  }
  // (our bolts vs pirates: js/invader.js boltHitsBody)
  dk.pirates = dk.pirates.filter(p => !p.dead);
  separatePirates(dt);
  for (const B of dk.bodies || []) B.t = Math.min(B.t + dt, FALL_TIME);   // (bodies: the fall, then they lie still)
  updateSentry(dt);
  updateNpc(dt);
  updateBase(dt);
  for (const c of crew) c.slow = c.inv.item === 'blackbox' ? 0.6 : 1;   // the black box is heavy
}
// The engineer / Dr. Varga, once treated, makes her own way aboard ours: through the doors and the tube on the same
// routes as the pirates (dockRoute), then our nav graph. Safe once she stands in one of our rooms (not just in
// the tube's mouth): then she walks a few steps in, out of the way. A stray shot on the way downs her again.
function npcHome() {
  const g = DG(), h = g ? g.hatch : HATCHES.find(h => h.side === 'port');
  return { x: h.inside[0] - h.dir * 1.6, y: h.inside[1] + 0.9 };     // a little way into our airlock room
}
const npcAboard = (N) => !!roomAt(N.x, N.y) && (!dk.dock || !inDock(N.x, N.y));
function npcStep(N, tx, ty, dt) {
  const dx = tx - N.x, dy = ty - N.y, d = Math.hypot(dx, dy);
  if (d < 0.01) return 0;
  const sp = Math.min(d, NPC_SPEED * dt), vx = dx / d * sp, vy = dy / d * sp;
  let moved = 0;
  if (pirateOk(N.x + vx, N.y)) { N.x += vx; moved += Math.abs(vx); }
  if (pirateOk(N.x, N.y + vy)) { N.y += vy; moved += Math.abs(vy); }
  if (!moved && d < 0.6) { N.x += vx; N.y += vy; moved = sp; }      // (the last bit onto a route point at a wall's edge)
  N.face = Math.atan2(dy, dx); N.walk += moved * 3;
  return moved;
}
function updateNpc(dt) {
  const N = dk.npc;
  if (!N) return;
  if (N.state === 'follow' && sentryLive() && inRect(N.x, N.y, DG().rooms[3])) {   // (the pirate base: not past a live sentry gun)
    N.route = [];
    if (!N.waits) { N.waits = true; combatBanner(`"I'm not walking into that sentry gun! Switch it off — I'll wait here."`); }
  } else if (N.state === 'follow') {
    const goal = npcHome();
    const key = `${goal.x.toFixed(0)},${goal.y.toFixed(0)}`;
    if (!N.route?.length || N.goalKey !== key) { N.route = dockRoute(N.x, N.y, goal.x, goal.y); N.goalKey = key; }
    const n = N.route[0], moved = n ? npcStep(N, n.x, n.y, dt) : 0;
    if (n && Math.hypot(n.x - N.x, n.y - N.y) < 0.2) N.route.shift();
    N.stuck = moved < 0.002 ? (N.stuck || 0) + dt : 0;
    if (N.stuck > 1.5) { N.route = []; N.stuck = 0; }                 // (a door shut on her: look for the way again)
    if (npcAboard(N)) { N.state = 'safe'; N.route = []; N.home = npcHome(); combatBanner(`${cap(npcName())} is safe aboard!`); sfx.win(); }
  } else if (N.state === 'safe') {                                     // a few steps in, clear of the hatch
    const h = N.home || { x: N.x, y: N.y };
    if (Math.hypot(h.x - N.x, h.y - N.y) > 0.2 && !N.settled) { if (npcStep(N, h.x, h.y, dt) < 0.002) N.settled = true; }
    else N.settled = true;
  }
  // a stray shot downs her again while she's still out there (once safe aboard she keeps her head down)
  if (N.state === 'follow') for (const b of boarding.bolts) if (b.owner !== 'crew' && Math.hypot(b.x - N.x, b.y - N.y) < 0.35) { b.dead = true; N.state = 'down'; N.route = []; combatBanner(`${cap(npcName())} got hit — treat them again!`); break; }
}
// No jumping with a ship docked to ours: the jump drive would tear the tube and whoever is in it apart.
// Once the jump is due, docked ships let go on their own: pirates still aboard ours drop everything and run
// home (their ship casts off as soon as they're all back, or at once if none is left alive), and the derelict's
// tether is released after RELEASE_TIME s (whoever is still over there is cast adrift, like with the pirates).
const RELEASE_TIME = 8;
function dockJumpHold() {
  const d = dk.dock;
  if (!d) return null;
  if (d.kind === 'base') return baseJumpHold();
  const when = d.detachT != null ? ` — ${d.kind === 'pirate' ? 'they cast off' : 'tether releases'} in ${Math.max(0, Math.ceil(d.detachT))} s` : '';
  if (d.kind === 'pirate') return dk.pirates.some(p => !inDock(p.x, p.y)) ? 'Jump blocked: the pirate ship is still docked — its crew is aboard ours!' : `Jump blocked: the pirate ship is still docked${when}`;
  return `Jump blocked: the derelict is still tethered to us${when}`;
}
function releaseForJump() {
  const d = dk.dock;
  if (!d || !mission.jump || d.detachT != null || d.kind === 'base') return;   // (the base: we detach ourselves)
  if (d.kind === 'pirate') {
    for (const p of dk.pirates) if (!p.done) { p.done = true; p.route = []; }   // the drive spooling up: they run for it
    if (dk.pirates.length && !dk.pirates.every(p => p.home)) return;            // (the usual: cast off once all are home)
    if (dk.pirates.length) return;
    d.detachT = LEAVE_DELAY; combatBanner(`Nobody left to fly the pirate ship — its clamps let go in ${LEAVE_DELAY} s.`); sfx.alarm();
    return;
  }
  d.detachT = RELEASE_TIME; sfx.alarm();
  combatBanner(`Jump drive spooling — releasing the derelict's tether in ${RELEASE_TIME} s. Get back aboard!`);
}
function sprayDock(a, dt) {                           // the extinguisher works on the derelict's fire
  for (const f of dk.dock?.fires || []) {
    const d = Math.hypot(f.x - player.x, f.y - player.y), off = Math.abs(wrapAngle(Math.atan2(f.y - player.y, f.x - player.x) - a));
    if (d < SPRAY_RANGE && off < 0.45) f.hp -= SPRAY_RATE * dt;
  }
}

// ---------------------------------------------------------------------------
// Clicking: the loot crate, the overload, the engineer, the jammed door (prompt), drilling
// ---------------------------------------------------------------------------
function dockClickTarget(mx, my) {
  const d = dk.dock, g = DG(), at = (p, r) => Math.hypot(mx - p.x, my - p.y) <= r;
  const N = dk.npc;
  if (d?.kind === 'base') { const st = baseClickTarget(mx, my); if (st) return st; }
  if (N && N.state === 'down' && at(N, 0.55)) {
    if (!near(N.x, N.y)) return { text: `${cap(npcName())} — get closer`, ok: false, x: N.x, y: N.y, r: 0.55 };
    return holdTarget('npc', TREAT_TIME, `Hold click: treat ${npcName()} (${TREAT_TIME} s) — then they head for our ship`, N.x, N.y, 0.55,
                      () => { N.state = 'follow'; N.leader = player.id; N.route = []; combatBanner('"Thanks! I\'ll make a run for your ship — cover me!"'); sfx.poi(); });
  }
  if (!d || d.kind === 'base') return null;
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
  if (d.kind === 'base') return baseAct();
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
  if (g && dk.dock.kind === 'base') out.push(...baseSpots(g));
  else if (g) {
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
  if (!GFX.on || d.kind === 'base') return false;   // (the base: drawn in 2D, drawBase)
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
  if (d?.kind === 'base') drawBase(d, g, t);
  else if (d) {
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
    drawDockDecor(d, g, t);
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
// ---------------------------------------------------------------------------
// Clutter and jokes on the other ships (purely visual, like js/decor.js): the props are our own clutter
// sprites (props/*, or their 2D drawings in the classic view), the signs are plaques drawn at runtime
// (GFX.canvasSprite, upright on the back wall), the floor text is stencilled. Positions are for a ship
// docked at the port airlock (x < 0); mx() mirrors them for the starboard side. Kept clear of the walking
// line along g.y, the crate, the reactor, the fire and the objective spots.
// ---------------------------------------------------------------------------
const DOCK_SIGNS = {};
function dockSign(key, x, wallY, z, w, lines, bg, fg) {
  if (GFX.on) {
    let name = DOCK_SIGNS[key];
    if (!name) {
      const ppu = 120, h = 0.14 + lines.reduce((a, l) => a + l[1] * 1.25, 0), D = GFX.canvasSprite('docksign_' + key, w * ppu, h * ppu, { ppu, ox: w * ppu / 2, oy: h * ppu / 2 });
      if (!D) return;
      const g = D.ctx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, D.w, D.h);
      g.fillStyle = bg; g.fillRect(0, 0, D.w, D.h); g.strokeStyle = 'rgba(10,12,18,0.9)'; g.lineWidth = 4; g.strokeRect(2, 2, D.w - 4, D.h - 4);
      g.fillStyle = 'rgba(10,12,18,0.6)'; for (const [bx, by] of [[8, 8], [D.w - 12, 8], [8, D.h - 12], [D.w - 12, D.h - 12]]) g.fillRect(bx, by, 4, 4);   // the bolts
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
      let y = 0.07 * ppu;
      for (const [text, size, weight = 800] of lines) { g.font = `${weight} ${size * ppu}px system-ui, sans-serif`; g.fillText(text, D.w / 2, y + size * ppu * 0.62); y += size * ppu * 1.25; }
      D.commit(); name = DOCK_SIGNS[key] = D.name;
    }
    GFX.sprite(name, 0, x, wallY, z, { billboard: true, layer: 'wall', sortY: wallY + 0.02, depthBias: 0.05, emissive: 0.25 });
    return;
  }
  plaque(L(x), L(wallY) - 6, L(w), L(0.14 + lines.reduce((a, l) => a + l[1] * 1.25, 0)), lines, bg, fg);
}
const DOCK_DECOR = {
  // the Red Comet's raider: pizza, soda, a duck that joined the crew, and a wanted poster for OUR cat
  pirate: {
    props: [['props/pizza', pizza, -12.2, 3.0, 0.4], ['props/soda_can', (x, y, a) => sodaCan(x, y, a, '#c0392b'), -11.6, 2.2, 1.2], ['props/soda_can', (x, y, a) => sodaCan(x, y, a, '#e8c34f'), -17.4, 3.1, -0.6],
            ['props/stool', null, -17.3, -3.0, 0], ['props/magazine', null, -12.0, -3.2, 0.3, true], ['props/duck', duck, -24.2, -2.0, 2.4], ['props/wrench', wrench, -20.0, 2.2, 0.9],
            ['props/wrapper', (x, y, a) => wrapper(x, y, a, '#e2574c', 3), -8.6, 1.8, 0.2, true], ['props/tape_roll', tapeRoll, -9.6, -1.9, 0]],
    signs: [[1, -14.6 + 2.0, 'wanted', 1.5, [['WANTED', 0.16], ['ONE SHIP CAT', 0.11], ['10,000 CR · ALIVE', 0.085, 700]], '#e8dcb8', '#3a2418'],
            [2, -22.0, 'mutiny', 1.5, [['DAYS WITHOUT', 0.12], ['A MUTINY:  3', 0.15]], '#2b303a', '#ffcf6b'],
            [0, -7.9, 'refunds', 1.4, [['NO REFUNDS', 0.14], ['NO RETURNS · NO MERCY', 0.075, 700]], '#7a1f1a', '#ffe0d0']],
    stencils: [[-14.6, 3.4, 'PLUNDER RESPONSIBLY', 0.18], [-22.0, 2.1, 'LICK IT. WE DARE YOU.', 0.15], [-7.9, 1.4, 'WIPE YOUR BOOTS', 0.15]],
  },
  // the prison barge: the hold where they keep Dr. Varga
  brig: {
    props: [['props/bucket', bucket, -17.6, 3.2, 0], ['props/papers_bridge', (x, y) => papers(x, y, 71), -14.2, 3.1, 0, true], ['props/sleeping_bag', sleepingBag, -12.4, 2.9, 0],
            ['props/soda_can', (x, y, a) => sodaCan(x, y, a, '#2e7dc9'), -20.2, -2.0, 0.7], ['props/stool', null, -9.0, -1.8, 0], ['props/duck', duck, -24.2, -2.0, 2.4]],
    signs: [[1, -12.4, 'visiting', 1.5, [['VISITING HOURS:', 0.11], ['NEVER', 0.17]], '#2b303a', '#ff9a8a', 1.0],
            [2, -22.0, 'mutiny', 1.5, [['DAYS WITHOUT', 0.12], ['A MUTINY:  3', 0.15]], '#2b303a', '#ffcf6b'],
            [0, -7.9, 'refunds', 1.4, [['NO REFUNDS', 0.14], ['NO RETURNS · NO MERCY', 0.075, 700]], '#7a1f1a', '#ffe0d0']],
    stencils: [[-14.6, -1.3, 'THE BRIG IS NOT A HOTEL', 0.16], [-18.0, 2.2, '|||| |||| ||', 0.16, 'rgba(232,236,244,0.35)'], [-22.0, 2.1, 'LICK IT. WE DARE YOU.', 0.15]],
  },
  // the Red Comet's base (positions for the port side, like all of these; rooms: bay, server room, barracks, brig, gun corridor)
  base: {
    props: [['props/soda_can', (x, y, a) => sodaCan(x, y, a, '#c0392b'), -7.0, 2.4, 1.2], ['props/wrapper', (x, y, a) => wrapper(x, y, a, '#e2574c', 5), -10.2, -2.2, 0.2, true],
            ['props/pizza', pizza, -14.0, 3.2, 0.4], ['props/stool', null, -19.4, -2.2, 0], ['props/papers_bridge', (x, y) => papers(x, y, 73), -19.4, 3.2, 0, true],
            ['props/sleeping_bag', sleepingBag, -13.2, -11.4, 0], ['props/sleeping_bag', sleepingBag, -20.6, -11.4, 0], ['props/magazine', null, -12.6, -5.4, 0.3, true], ['props/soda_can', (x, y, a) => sodaCan(x, y, a, '#e8c34f'), -21.6, -5.4, -0.6],
            ['props/bucket', bucket, -37.2, -17.6, 0], ['props/duck', duck, -30.8, -11.4, 2.4], ['props/stool', null, -31.2, -17.6, 0]],
    signs: [[0, -9.0, 'base_welcome', 1.8, [['RED COMET BASE', 0.13], ['NO VISITORS · NO REFUNDS', 0.075, 700]], '#7a1f1a', '#ffe0d0'],
            [1, -15.0, 'server', 1.6, [['SERVER ROOM', 0.12], ['DO NOT FEED THE HAMSTER', 0.07, 700]], '#2b303a', '#9cd8ff'],
            [2, -19.4, 'chores', 1.6, [['CHORE WHEEL', 0.12], ['DISHES: NOBODY', 0.08, 700], ['MUTINY: TUESDAY', 0.08, 700]], '#e8dcb8', '#3a2418'],
            [3, -32.6, 'brig_rules', 1.6, [['BRIG RULES', 0.12], ['1. NO ESCAPING', 0.08, 700], ['2. SEE RULE 1', 0.08, 700]], '#2b303a', '#ff9a8a']],
    stencils: [[-9.0, 2.6, 'WIPE YOUR BOOTS', 0.15], [-17.2, 3.4, 'AUTHORIZED PIRATES ONLY', 0.14], [-14.0, -5.2, 'LIGHTS OUT AT NEVER', 0.14], [-32.6, -16.6, 'THE BRIG IS NOT A HOTEL', 0.14]],
  },
  // Dr. Varga's lab module: left in a hurry
  derelict: {
    props: [['props/papers_bridge', (x, y) => papers(x, y, 81), -12.0, -3.0, 0, true], ['props/papers_maptable', (x, y) => papers(x, y, 82), -17.2, 3.2, 0, true], ['props/plant', plant, -11.4, 3.2, 0],
            ['props/coffee_empty', coffee, -17.6, -3.1, 0], ['props/sticky_yellow', stickyNote, -12.6, 2.4, 0.3], ['props/duck', duck, -20.0, 2.3, 0.6], ['props/extinguisher', extinguisher, -9.4, -1.8, 0.4]],
    signs: [[1, -11.7, 'todo', 1.6, [['TO DO', 0.13], ['1. CURE IT', 0.09, 700], ['2. NAME IT', 0.09, 700], ['3. DON\'T GET EATEN', 0.09, 700]], '#e8ecf0', '#2a2d35'],
            [2, -20.6, 'specimen', 1.5, [['SPECIMEN 7', 0.15], ['DO NOT FEED', 0.11, 700]], '#e8c34f', '#2a2d35'],
            [0, -7.9, 'lab', 1.6, [['VARGA LAB', 0.14], ['PLEASE WIPE YOUR SPORES', 0.075, 700]], '#2d5f82', '#e8f4ff']],
    stencils: [[-14.6, -1.4, 'DAYS SINCE LAST INCIDENT: ?', 0.15], [-7.9, 1.5, 'DECON →', 0.16]],
  },
};
function drawDockDecor(d, g, t) {
  const set = DOCK_DECOR[d.kind === 'derelict' ? 'derelict' : d.kind === 'base' ? 'base' : d.brig ? 'brig' : 'pirate'], mx = (x) => d.side === 'port' ? x : SHIP_W - x;
  for (const [x, y, text, size, col] of set.stencils) stencil(L(mx(x)), L(g.y + y), text, 0, size, col || 'rgba(210,166,46,0.5)');
  for (const [name, draw, x, y, a, flat] of set.props) {
    const wx = mx(x), wy = g.y + y;
    if (GFX.on ? spr(name, 0, wx, wy, 0, flat ? { layer: 'decal' } : undefined) : false) continue;
    if (draw && !GFX.on) draw(L(wx), L(wy), d.side === 'port' ? a : Math.PI - a);
  }
  for (const [room, x, key, w, lines, bg, fg, out = 0] of set.signs) dockSign(key, mx(x), g.rooms[room].y + 0.02 + out, WALL_SIGN_Z + 0.15 - out * 0.3, w, lines, bg, fg);   // (out: hung in front of the cell bars)
}
// A fallen pirate: crumples (dazed for a moment), then lies there for good. Purely visual (dk.bodies).
function drawBody(B) {
  const fallen = B.t >= FALL_TIME;
  if (GFX.on) {
    const name = fallen ? 'chars/pirate/down' : 'chars/pirate/stunned';
    if (GFX.sprite(name, GFX.frameIndex(name, B.face, fallen ? 0 : 1), B.x, B.y, 0, { emissive: 0.1 })) return;
  }
  ctx.save(); ctx.translate(L(B.x), L(B.y)); ctx.rotate(Math.PI / 2 * Math.min(1, B.t / FALL_TIME)); ctx.globalAlpha = 0.9;
  drawCrew(0, 0, 0, 0, false, '#7a2a26'); ctx.restore();
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
  for (const B of dk.bodies || []) drawBody(B);
  if (dk.dock?.kind === 'base') drawSentryFx(dk.dock, DG(), t);
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
  if (p.aim > 0) {                                    // laser sight: tracks you right up to the shot (a bit stronger as it comes)
    const k = clamp(p.aim / PIRATE_AIM, 0, 1);
    let len = 0; while (len < PIRATE_RANGE && freeAt(p.x + Math.cos(p.face) * len, p.y + Math.sin(p.face) * len)) len += 0.1;   // up to the first wall
    const ex = L(p.x + Math.cos(p.face) * len), ey = L(p.y + Math.sin(p.face) * len - lz);
    ctx.beginPath(); ctx.moveTo(L(p.x + Math.cos(p.face) * m0), L(p.y + Math.sin(p.face) * m0 - lz)); ctx.lineTo(ex, ey);
    ctx.strokeStyle = `rgba(255,90,90,${0.3 + 0.25 * k})`; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, TAU); ctx.fillStyle = `rgba(255,90,90,${0.4 + 0.3 * k})`; ctx.fill();
  }
  if (sprited) {
    const view = camera();
    if (p.flash > 0) {                                // hit: the whole body flashes
      ctx.fillStyle = `rgba(255,${Math.round(150 + 105 * p.flash)},${Math.round(130 + 125 * p.flash)},${p.flash * 0.7})`;
      ctx.beginPath(); ctx.ellipse(L(p.x), L(p.y - GFX.lift(0.6)), L(0.36), L(0.62), 0, 0, TAU); ctx.fill();
    }
    if (p.carry) upright(view, p.x, p.y, 1.0, () => drawItemIcon(p.carry, L(0.5), 0, 0.7));
    upright(view, p.x, p.y, 1.4, () => {
      ctx.font = `800 ${T * 0.22}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText('PIRATE', 0, 0); ctx.fillStyle = '#ff7a6a'; ctx.fillText('PIRATE', 0, 0); ctx.textAlign = 'left';
      pirateHpPips(p, 0, 2);
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
  if (p.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${p.flash * 0.7})`; ctx.beginPath(); ctx.arc(L(p.x), L(p.y), L(0.38), 0, TAU); ctx.fill(); }
  pirateHpPips(p, L(p.x), L(p.y) - L(0.6));
}
// HP pips under the name tag: the one just lost blinks white while the hit flash lasts.
function pirateHpPips(p, x, y) {
  for (let i = 0; i < PIRATE_HP; i++) {
    const lost = i >= p.hp, fresh = i === p.hp && p.flash > 0;
    ctx.fillStyle = 'rgba(10,12,18,0.85)'; ctx.fillRect(x - 11 + i * 8, y - 1, 8, 6);
    ctx.fillStyle = !lost ? '#e2574c' : fresh && Math.sin(p.flash * 40) > 0 ? '#ffffff' : '#2b303a'; ctx.fillRect(x - 10 + i * 8, y, 6, 4);
  }
}
function dockPlates(add) {
  if (dk.dock?.kind === 'base') basePlates(add);
  else if (dk.pirates.length) add('pirates', { icon: 'frigate', title: 'PIRATES ABOARD', sub: `${dk.pirates.length} · stealing: ${dk.pirates.filter(p => p.carry).map(p => ITEM_NAMES[p.carry]).join(', ') || 'looking for loot'}`, stripe: '#e2574c', red: true });
  for (const e of combat.enemies) if (e.kind === 'pirate' && e.phase === 'fighting') add('dockT' + uid(e), { icon: 'frigate', title: 'PIRATES DOCKING', sub: `in ${Math.ceil(e.dockT ?? DOCK_TIME)} s unless driven off`, stripe: '#e2574c', red: true });
  if (dk.dock?.kind === 'pirate') add('pship', { icon: 'frigate', title: dk.dock.overloaded ? 'PIRATES CASTING OFF' : 'PIRATE SHIP DOCKED', sub: dk.dock.overloaded ? `in ${Math.ceil(dk.dock.detachT)} s — get off their ship!` : `${SIDE_LABEL[dk.dock.side].toLowerCase()} airlock · loot crate · jam their reactor`, stripe: '#e8c34f', red: !!dk.dock.overloaded });
  if (dk.dock?.kind === 'derelict') add('derelict', { icon: 'frigate', title: 'DERELICT', sub: `tethered at the ${SIDE_LABEL[dk.dock.side].toLowerCase()} airlock · no air inside`, stripe: '#7a8396' });
  if (dk.npc && dk.npc.state !== 'safe') add('npc', { icon: 'ping', title: npcName().replace(/^the /, '').toUpperCase(), sub: dk.npc.state === 'down' ? 'hurt — treat them (hold click)' : dk.npc.waits && sentryLive() ? 'waiting in the brig — switch off the sentry gun' : 'on the way to our ship — cover them', stripe: '#ffe08a', red: dk.npc.state === 'down' });
  if (dk.rock) add('rock', { icon: 'asteroid', title: 'ORE ASTEROID', sub: 'front · drill it on a spacewalk', stripe: '#7af0ff' });
}

// ---------------------------------------------------------------------------
// The pirate base (chapter 5, "Hold On, Dr. Varga"; event kind 'brig'). It docks to one of our outer
// airlocks; rooms in a row: docking bay → server room → barracks → gun corridor → brig (the gun corridor: a sentry
// gun at its far end beside the brig door, stacks of crates as cover along it; see updateSentry). Two pirates rush out of
// the bay as soon as we dock (they drop their carbines when they fall: pick-up laser guns for whoever
// storms in); guards hold each room (more for a bigger crew, fewer on easy: baseGuards). A repair kit
// lies in the bay. The server room's security terminal is broken: repair it, then hack it (hold click)
// to open the barracks door. The brig door wants a 4-digit code, written on the barracks wall. Dr. Varga
// lies in the brig: treated, she runs for our ship on her own (updateNpc) once the sentry gun is off (until then
// she waits in the brig); shot, she goes down again.
// While we're docked, or while anyone is still over there, the engine stays off (no jump:
// baseJumpHold). Once she's aboard our airlock can detach: the tube pulls in, the base stays right
// there. Anyone left behind (or the crew aboard) can dock again: the bay's docking control or our airlock.
// Once detached with her aboard and nobody left over there, the jump drive spools up (ESCAPE_SPOOL s).
// ---------------------------------------------------------------------------
const HACK_TIME = 5, ESCAPE_SPOOL = 15;
const BASE_GEOM = {};
function baseGeom(side) {
  if (BASE_GEOM[side]) return BASE_GEOM[side];
  const h = HATCHES.find(h => h.side === side), y = h.y;
  const P = [
    R(-5.6, y - 0.6, 0.7, y + 0.6),               // tube
    R(-12.4, y - 3.0, -5.6, y + 3.0),             // docking bay
    R(-21.4, y - 4.0, -13.0, y + 4.0),            // server room
    R(-22.4, y - 12.4, -11.6, y - 4.6),           // barracks
    R(-38.0, y - 18.5, -30.0, y - 10.7),          // brig (off the gun corridor's far end)
    R(-35.0, y - 10.1, -23.0, y - 6.9),           // the gun corridor (the sentry gun at its far end)
    R(-13.0, y - 0.8, -12.4, y + 0.8),            // door bay–server room
    R(-18.0, y - 4.6, -16.4, y - 4.0),            // door server room–barracks (the hacked one)
    R(-34.6, y - 10.7, -33.0, y - 10.1),          // door gun corridor–brig (the code)
    R(-23.0, y - 9.3, -22.4, y - 7.7),            // door barracks–gun corridor (open)
  ];
  // the gun corridor's cover (shelves and crates, alternately against either wall) and the sentry gun's base:
  // holes in its floor (no walking through them; shots and sight lines stop at them: js/invader.js freeAt)
  const H = [R(-25.4, y - 8.3, -24.4, y - 6.9), R(-28.4, y - 10.1, -27.4, y - 8.7), R(-31.2, y - 8.3, -30.2, y - 6.9), R(-35.0, y - 9.1, -34.0, y - 7.9)];
  const mr = (q) => side === 'port' ? q : R(SHIP_W - q.x - q.w, q.y, SHIP_W - q.x, q.y + q.h);
  const M = P.map(mr), holes = H.map(mr);
  const pt = (x, dy) => ({ x: side === 'port' ? x : SHIP_W - x, y: y + dy });
  const rooms = M.slice(1, 6);
  return (BASE_GEOM[side] = {
    tube: M[0], rooms, doors: M.slice(6, 10), hatch: h, y,
    floor: [...rooms.slice(0, 4), ...floorMinus(rooms[4], holes)],   // (walkable: the corridor without its cover)
    cover: holes.slice(0, 3), sentry: { ...pt(-34.5, -8.5), base: holes[3], dir: side === 'port' ? 0 : Math.PI, muzzle: pt(-33.75, -8.5) },
    entry: pt(-7.6, 0), tubeMid: pt(-2.5, 0),
    console: pt(-6.3, -2.4), toolbox: pt(-11.6, 2.3), terminal: pt(-20.4, -3.2), keypad: pt(-32.4, -9.85), note: pt(-14.2, 0),
    npcSpot: pt(-36.9, -14.6), cellX: pt(-35.6, 0).x, cellGap: [y - 15.5, y - 13.7],
    spew: [pt(-9.6, -1.0), pt(-8.6, 1.0)],
    // guard posts per group [bay, server room, barracks, the gun's end]; room: the one they hold (default: the group's)
    posts: [[], [pt(-19.6, 2.6), pt(-14.4, -2.6), pt(-15.2, 2.8)], [pt(-13.6, -10.6), pt(-20.2, -6.2), pt(-16.0, -11.0), pt(-12.8, -6.0)],
            [{ ...pt(-32.7, -7.5), room: 4 }, { ...pt(-32.4, -14.2), room: 3 }]],
    // the walking line, brig → our airlock (dockRoute): the rooms are in a row, so a chain does (zig-zagging past the cover)
    chain: [pt(-35.0, -14.6), pt(-33.8, -11.8), pt(-33.8, -10.4), pt(-33.3, -9.6), pt(-30.7, -9.4), pt(-27.9, -7.6), pt(-24.9, -9.4), pt(-22.7, -8.5),
            pt(-17.2, -8.5), pt(-17.2, -4.3), pt(-17.2, 0), pt(-12.7, 0), pt(-9.0, 0), pt(-2.5, 0), { x: h.inside[0], y: h.inside[1] }],
  });
}
// A room's floor with holes cut out, as rects (slabs between the holes' x edges, split around them).
function floorMinus(q, holes) {
  const xs = [...new Set([q.x, q.x + q.w, ...holes.flatMap(o => [o.x, o.x + o.w]).filter(x => x > q.x && x < q.x + q.w)])].sort((a, b) => a - b), out = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i], x1 = xs[i + 1], cut = holes.filter(o => o.x < x1 - 1e-6 && o.x + o.w > x0 + 1e-6).sort((a, b) => a.y - b.y);
    let y0 = q.y;
    for (const o of cut) { if (o.y > y0 + 1e-6) out.push(R(x0, y0, x1, o.y)); y0 = Math.max(y0, o.y + o.h); }
    if (q.y + q.h > y0 + 1e-6) out.push(R(x0, y0, x1, q.y + q.h));
  }
  return out;
}
// Guards per room [bay, server room, barracks, the gun's end (and the brig)]: solo 0/2/2/1; each extra crew member (up to 4) one more,
// each easier difficulty step one fewer (barracks first, never below one a room).
function baseGuards(n, easy = 0) {
  const k = [0, 2, 2, 1];
  [2, 1, 3, 2].slice(0, Math.max(0, Math.min(4, n - 1))).forEach(i => k[i]++);
  [2, 1].slice(0, Math.max(0, easy)).forEach(i => { k[i] = Math.max(1, k[i] - 1); });
  return k;
}
function dockBase(side) {
  const g = baseGeom(side), n = typeof crewSize === 'function' ? crewSize() : 1;
  dk.dock = { kind: 'base', side, doors: [false, true, true, false], crate: [], detachT: null, overloaded: false, fires: [], tube: 'docked',
              terminal: 'broken', code: String(1000 + Math.floor(Math.random() * 9000)), sentry: { state: 'idle', t: 0, shotT: 0, shots: 0 } };
  dk.npc = { x: g.npcSpot.x, y: g.npcSpot.y, state: 'down', leader: null, route: [], face: 0, walk: 0 };
  ITEMS.push({ kind: 'repair', x: g.toolbox.x, y: g.toolbox.y });
  const pirate = (p, more) => ({ uid: newUid(), x: p.x, y: p.y, face: side === 'port' ? 0 : Math.PI, walk: 0, hp: PIRATE_HP, carry: null, state: 'guard', cd: 1, aim: 0, route: [], stuck: 0, stun: 0, flash: 0, post: { x: p.x, y: p.y }, ...more });
  g.spew.forEach((p, i) => dk.pirates.push(pirate(p, { mode: 'hunt', room: 0, drops: 'laser', cd: 1.5 + i })));
  baseGuards(n, mission.easy || 0).forEach((k, r) => g.posts[r].slice(0, k).forEach(p => dk.pirates.push(pirate({ x: p.x, y: p.y }, { mode: 'guard', room: p.room ?? r, cd: 0.5 }))));
  combatBanner(`Docked to the pirate base at the ${side === 'port' ? 'left' : 'right'} airlock — two pirates are rushing out!`); sfx.explosion();
  return true;
}
const BASE_ROOMS = ['Docking bay', 'Server room', 'Barracks', 'Brig', 'Gun corridor'];
const inBase = (x, y) => { const g = dk.dock?.kind === 'base' && DG(); return !!g && [...g.rooms, ...g.doors].some(q => inRect(x, y, q)); };
const baseCrew = () => crew.filter(c => (c.mode === 'inside' || c.mode === 'hatch') && inBase(c.x, c.y));
// The base's walls stop shots (projectile space outside our hull is otherwise free: js/invader.js freeAt).
const dockSolid = (x, y) => dk.dock?.kind === 'base' && [...DG().rooms, ...DG().doors].some(q => inRect(x, y, q, 0.7));
// Guards hold their post and come at whoever walks into their room; the two from the bay hunt the nearest
// of us, onto our ship if need be. (Aiming and shooting: updatePirate, like every pirate.)
function basePirateMove(p, dt) {
  const g = DG();
  if (!g) return;
  const dist = (c) => Math.hypot(c.x - p.x, c.y - p.y);
  const foes = crew.filter(c => c.mode === 'inside' && standing(c) && (p.mode === 'hunt' || inRect(c.x, c.y, g.rooms[p.room]))).sort((a, b) => dist(a) - dist(b));
  const f = foes[0], goal = f || p.post, close = f ? (lineOfSight(p.x, p.y, f.x, f.y) ? (p.mode === 'hunt' ? 4 : 5) : 0.6) : 0.25;
  if (Math.hypot(goal.x - p.x, goal.y - p.y) <= close) { if (f) p.face = Math.atan2(f.y - p.y, f.x - p.x); p.route = []; return; }
  const key = `${goal.x.toFixed(0)},${goal.y.toFixed(0)}`;
  if (!p.route.length || p.goalKey !== key) { p.route = dockRoute(p.x, p.y, goal.x, goal.y); p.goalKey = key; }
  const n = p.route[0], moved = n ? pirateStep(p, n.x, n.y, dt) : 0;
  if (n && Math.hypot(n.x - p.x, n.y - p.y) < 0.2) p.route.shift();
  p.stuck = moved < 0.002 ? p.stuck + dt : 0;
  if (p.stuck > 2) { p.route = []; p.stuck = 0; }                    // (a door in the way, or the tube pulled in: look again)
}
function updateBase(dt) {
  const d = dk.dock;
  if (d?.kind !== 'base' || typeof mission === 'undefined' || !mission.active || mission.over || mission.jump || !isFinite(mission.jumpAt)) return;
  if (d.tube === 'detached' && dk.npc?.state === 'safe' && !baseCrew().length && mission.jumpAt > mission.t + ESCAPE_SPOOL) {
    mission.jumpAt = mission.t + ESCAPE_SPOOL; combatBanner(`Clear of the base with ${npcName().replace(/^the /, '')} aboard — the jump drive spools up in ${ESCAPE_SPOOL} s!`); sfx.alarm();
  }
}
// The sentry gun at the gun corridor's far end: bolted down, facing down the corridor (it never turns). Anyone
// standing in its field of fire with a clear line to its muzzle (the cover blocks it) makes it spool up (a rising
// whine, the barrel glowing: SENTRY_SPOOL s), then it sprays bolts down the corridor for SENTRY_BURST s whether
// it still sees anyone or not, then cools down (SENTRY_COOL s: run to the next bit of cover). Its shots hurt the
// crew like a pirate's (and Dr. Varga: she waits in the brig until it's off). Right beside it you're out of its
// fan: hold click on it there to switch it off for good (quicker with the repair kit). Easier difficulty: a
// longer spool-up and fewer shots a second. dk.dock.sentry: { state: idle|spool|fire|cool|off, t, shotT, shots }.
const SENTRY_SPOOL = [1.3, 1.9, 2.5], SENTRY_RATE = [7, 4.5, 3], SENTRY_BURST = 5, SENTRY_COOL = 3;
const SENTRY_SPREAD = 0.3, SENTRY_CONE = 0.36, SENTRY_RANGE = 13, SENTRY_SHOT = 16, SENTRY_Z = 0.75;
const SENTRY_OFF_HAND = 4, SENTRY_OFF_KIT = 2;
const sentryLive = () => dk.dock?.kind === 'base' && !!dk.dock.sentry && dk.dock.sentry.state !== 'off';
function sentrySees(x, y) {
  const S = DG().sentry, m = S.muzzle, dx = x - m.x, dy = y - m.y, d = Math.hypot(dx, dy);
  return d < SENTRY_RANGE && Math.abs(wrapAngle(Math.atan2(dy, dx) - S.dir)) < SENTRY_CONE && lineOfSight(m.x, m.y, x, y);
}
function updateSentry(dt) {
  const S = dk.dock?.sentry;
  if (!S || S.state === 'off' || dk.dock.kind !== 'base') return;
  const G = DG().sentry, easy = clamp(typeof mission !== 'undefined' ? mission.easy || 0 : 0, 0, 2);
  S.t += dt;
  if (S.state === 'idle') {
    if (crew.some(c => c.mode === 'inside' && standing(c) && sentrySees(c.x, c.y))) { S.state = 'spool'; S.t = 0; }
  } else if (S.state === 'spool') {
    if (S.t >= SENTRY_SPOOL[easy]) { S.state = 'fire'; S.t = 0; S.shotT = 0; }
  } else if (S.state === 'fire') {
    for (S.shotT -= dt; S.shotT <= 0; S.shotT += 1 / SENTRY_RATE[easy]) {
      const a = G.dir + (Math.random() * 2 - 1) * SENTRY_SPREAD, m = G.muzzle;
      boarding.bolts.push({ x: m.x, y: m.y, z: SENTRY_Z, ox: m.x, oy: m.y, vx: Math.cos(a) * SENTRY_SHOT, vy: Math.sin(a) * SENTRY_SHOT, life: SENTRY_RANGE / SENTRY_SHOT, owner: 'sentry' });
      S.shots++;
    }
    if (S.t >= SENTRY_BURST) { S.state = 'cool'; S.t = 0; }
  } else if (S.state === 'cool' && S.t >= SENTRY_COOL) { S.state = 'idle'; S.t = 0; }
}
function sentryClickTarget(mx, my) {
  const S = dk.dock.sentry, G = DG().sentry, t = { x: G.x, y: G.y, r: 0.75 };
  if (!S || Math.hypot(mx - G.x, my - G.y) > t.r) return null;
  if (S.state === 'off') return { ...t, text: 'Sentry gun — switched off', ok: false };
  if (!near(G.x, G.y, REACH)) return { ...t, text: 'Sentry gun — get right beside it (it can\'t turn) to switch it off', ok: false };
  const kit = inv.weapon === 'repair', time = kit ? SENTRY_OFF_KIT : SENTRY_OFF_HAND;
  return holdTarget('sentryOff', time, `Hold click: ${kit ? 'unscrew the sentry gun\'s power cell' : 'rip out the sentry gun\'s cables'} (${time} s${kit ? '' : '; quicker with the repair kit'})`, t.x, t.y, t.r,
                    () => { S.state = 'off'; S.t = 0; sfx.spark(); sfx.empty(); combatBanner(`Sentry gun switched off!${dk.npc && dk.npc.state !== 'safe' ? ` ${cap(npcName())} can get out now.` : ''}`); });
}
function baseJumpHold() {
  if (dk.dock.tube !== 'detached') return `Jump blocked: the engine is off while we're docked to the pirate base${dk.npc?.state === 'safe' ? ' — detach at our airlock' : ''}`;
  const left = baseCrew();
  return left.length ? `Jump blocked: ${left.map(c => c.name).join(', ')} still in the pirate base — dock again to pick them up` : null;
}
// Detach: the tube pulls in (whoever and whatever is in it ends up on our side), the base stays close by.
function baseDetach() {
  const d = dk.dock, g = DG(), [hx, hy] = g.hatch.inside, inTube = (o) => inRect(o.x, o.y, g.tube) && !roomAt(o.x, o.y);
  for (const c of crew) if (c.mode === 'inside' && inTube(c)) { c.x = hx; c.y = hy; }
  if (dk.npc && inTube(dk.npc)) Object.assign(dk.npc, npcHome(), { route: [] });
  for (const p of dk.pirates) if (inTube(p)) { p.x = g.entry.x; p.y = g.entry.y; p.route = []; }
  for (const it of ITEMS) if (inTube(it)) { it.x = hx; it.y = hy; }
  d.tube = 'detached'; sfx.hatch();
  const left = baseCrew();
  combatBanner(left.length ? `Detached — but ${left.map(c => c.name).join(', ')} ${left.length > 1 ? 'are' : 'is'} still over there! Dock again to pick them up.` : 'Detached from the pirate base — the engine is free.');
}
function baseRedock() { dk.dock.tube = 'docked'; sfx.hatch(); combatBanner('Docked to the pirate base again — the tube is open.'); }
function openBasePad() { ui.panel = 'mini'; ui.mini = { kind: 'pin', door: true, pin: dk.dock.code, typed: '', flash: null, flashT: 0 }; }
function baseCodeOk() {                            // (js/minigames.js: ACCESS GRANTED on the brig door's keypad)
  const d = dk.dock;
  if (d?.kind !== 'base' || !d.doors[2]) return;
  d.doors[2] = false; sfx.hatch(); combatBanner('ACCESS GRANTED — the brig door slides open.');
}
// Clicking: the security terminal (repair kit, then a hack).
function baseClickTarget(mx, my) {
  const d = dk.dock, g = DG(), q = g.terminal, t = { x: q.x, y: q.y, r: 0.8 }, gun = sentryClickTarget(mx, my);
  if (gun) return gun;
  if (Math.hypot(mx - q.x, my - q.y) > t.r) return null;
  if (d.terminal === 'hacked') return { ...t, text: 'Security terminal — hacked, the barracks door is open', ok: false };
  if (!near(t.x, t.y, REACH + 0.3)) return { ...t, text: `Security terminal (${d.terminal === 'broken' ? 'broken' : 'locked'}) — get closer`, ok: false };
  if (d.terminal === 'broken') {
    if (inv.weapon !== 'repair') return { ...t, text: 'Security terminal is broken — needs the repair kit (there\'s one in the docking bay)', ok: false };
    return holdTarget('baseFix', REPAIR_TIME, `Hold click: repair the security terminal (${REPAIR_TIME} s)`, t.x, t.y, t.r,
                      () => { d.terminal = 'fixed'; sfx.poi(); combatBanner('Security terminal repaired — now hack it!'); });
  }
  return holdTarget('baseHack', HACK_TIME, `Hold click: hack the security terminal (${HACK_TIME} s) — opens the barracks door`, t.x, t.y, t.r,
                    () => { d.terminal = 'hacked'; d.doors[1] = false; sfx.hatch(); combatBanner('Hacked! The barracks door slides open.'); });
}
// Prompts: detach / dock again at our airlock, the bay's docking control, the locked doors.
function baseAct() {
  const d = dk.dock, g = DG(), h = g.hatch, close = (p, r) => Math.hypot(player.x - p.x, player.y - p.y) < r;
  if (close({ x: h.inside[0], y: h.inside[1] }, 1.3) && !inBase(player.x, player.y)) {
    const at = { x: h.x - h.dir * 0.2, y: h.y, r: 1.1 }, safe = dk.npc?.state === 'safe';
    if (d.tube === 'detached') { act({ text: 'Click: dock to the pirate base again', at, run: baseRedock }); return true; }
    if (safe || mission.jump) { act({ text: `Click: detach from the pirate base (it stays close by)${safe ? '' : ` — ${npcName().replace(/^the /, '')} isn't aboard!`}`, at, run: baseDetach }); return true; }
    return false;
  }
  if (close(g.console, 1.2)) {
    const at = { ...g.console, r: 0.8 };
    act(d.tube === 'detached' ? { text: 'Click: signal our ship to dock again', at, run: baseRedock } : { text: 'Docking control — our ship is docked', at });
    return true;
  }
  for (let i = 1; i < 3; i++) {
    if (!d.doors[i]) continue;
    const q = g.doors[i], c = { x: q.x + q.w / 2, y: q.y + q.h / 2 };
    if (!close(c, 1.5)) continue;
    if (i === 1) act({ text: 'Locked security door — repair and hack the security terminal in this room', at: { ...c, r: 1.2 } });
    else act({ text: 'Click: type the brig door code (keypad)', at: { ...c, r: 1.2 }, run: openBasePad });
    return true;
  }
  return false;
}
function baseSpots(g) {
  const d = dk.dock, out = [];
  if (d.terminal !== 'hacked') out.push({ x: g.terminal.x, y: g.terminal.y, r: 0.6 });
  if (d.doors[2]) out.push({ x: g.keypad.x, y: g.keypad.y, r: 0.45 });
  if (d.sentry && d.sentry.state !== 'off') out.push({ x: g.sentry.x, y: g.sentry.y, r: 0.55 });
  if (d.tube === 'detached') out.push({ x: g.console.x, y: g.console.y, r: 0.5 });
  return out;
}
function basePlates(add) {
  const d = dk.dock, inside = dk.pirates.filter(p => inBase(p.x, p.y)).length, out = dk.pirates.length - inside, left = baseCrew();
  if (out) add('pirates', { icon: 'frigate', title: 'PIRATES ABOARD', sub: `${out} · rushed out of the base — fight them off`, stripe: '#e2574c', red: true });
  const sub = d.tube === 'detached' ? (left.length ? `detached · ${left.map(c => c.name).join(', ')} still inside — dock again!` : 'detached · engine free')
    : `${SIDE_LABEL[d.side].toLowerCase()} airlock · ${inside} pirate${inside === 1 ? '' : 's'} inside · engine off while docked`;
  add('base', { icon: 'frigate', title: 'PIRATE BASE', sub, stripe: '#e8c34f', red: !!left.length && d.tube === 'detached' });
  const S = d.sentry;
  if (S && S.state !== 'off' && !d.doors[1]) add('sentry', { icon: 'frigate', title: 'SENTRY GUN', sub: S.state === 'spool' ? 'spooling up — take cover!' : S.state === 'fire' ? 'firing down the corridor — stay behind cover' : 'gun corridor · get beside it and switch it off', stripe: '#e2574c', red: S.state === 'spool' || S.state === 'fire' });
}
// Drawing (2D, also under the sprites): a blocky, patched hull around each room, the tube (or its two
// stubs once detached), floors, the locked doors, the terminal, the keypad, the cell bars and the code.
function drawBase(d, g, t) {
  const docked = d.tube !== 'detached', port = d.side === 'port', mx = (x) => port ? x : SHIP_W - x;
  for (const q of g.rooms) { rr(L(q.x - 0.7), L(q.y - 0.7), L(q.w + 1.4), L(q.h + 1.4), 16); ctx.fillStyle = '#41383c'; ctx.fill(); stroke(4); }
  for (const q of g.doors) { ctx.fillStyle = '#41383c'; ctx.fillRect(L(q.x - 0.2), L(q.y - 0.2), L(q.w + 0.4), L(q.h + 0.4)); }
  for (const q of g.rooms) { rr(L(q.x - 0.4), L(q.y - 0.4), L(q.w + 0.8), L(q.h + 0.8), 12); ctx.strokeStyle = '#a83a3a'; ctx.lineWidth = 3; ctx.stroke(); }
  const tq = g.tube;                                   // the tube, or (detached) a stub on each side
  const parts = docked ? [[tq.x, tq.w]] : port ? [[tq.x, 0.9], [tq.x + tq.w - 1.3, 1.3]] : [[tq.x, 1.3], [tq.x + tq.w - 0.9, 0.9]];
  for (const [x, w] of parts) {
    rr(L(x), L(tq.y) - 6, L(w), L(tq.h) + 12, 10); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(3);
    for (let xx = x + 0.3; xx < x + w; xx += 0.45) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(L(xx), L(tq.y) - 6, 4, L(tq.h) + 12); }
  }
  const tints = ['#6a5a5e', '#5a6070', '#665c58', '#5e5a52', '#5c5a60'];
  drawFloors([...g.rooms, ...g.doors.filter((q, i) => !d.doors[i])], (r) => tints[g.rooms.indexOf(r)] || '#5e5658');
  if (docked) { ctx.fillStyle = 'rgba(30,34,42,0.5)'; ctx.fillRect(L(tq.x), L(tq.y), L(tq.w), L(tq.h)); }
  d.doors.forEach((locked, i) => {                    // locked doors: hazard stripes and a red lamp
    if (!locked) return;
    const q = g.doors[i]; hazardStripe(L(q.x), L(q.y), L(q.w), L(q.h)); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.strokeRect(L(q.x), L(q.y), L(q.w), L(q.h));
    ctx.fillStyle = Math.sin(t * 4 + i) > 0 ? '#ff5a4a' : '#8e2f22'; ctx.beginPath(); ctx.arc(L(q.x + q.w / 2), L(q.y + q.h / 2), 4, 0, TAU); ctx.fill();
  });
  drawDockDecor(d, g, t);
  drawGunCorridor(d, g, t);
  // the brig's cells: bars along the back of the room (Dr. Varga's door hangs open once she's out)
  const B = g.rooms[3], cellX = g.cellX;
  ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 3;
  for (let y = B.y + 0.15; y < B.y + B.h - 0.1; y += 0.32) { if (y > g.cellGap[0] && y < g.cellGap[1]) continue; ctx.beginPath(); ctx.moveTo(L(cellX) - 3, L(y)); ctx.lineTo(L(cellX) + 3, L(y)); ctx.stroke(); }
  ctx.fillStyle = '#6b7486'; ctx.fillRect(L(cellX) - 4, L(B.y), 8, L(B.h));
  ctx.fillStyle = '#3a404d'; ctx.fillRect(L(cellX) - 3, L(B.y), 6, L(B.h)); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(L(cellX) - 4, L(B.y), 8, L(B.h));
  // the security terminal: sparking (broken), LOCKED (repaired), OPEN (hacked)
  const q = g.terminal, tx = L(q.x), ty = L(q.y);
  rr(tx - L(0.55), ty - L(0.4), L(1.1), L(0.75), 6); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(2.5);
  const scr = d.terminal === 'broken' ? (Math.random() < 0.3 ? '#3a404d' : '#14161b') : d.terminal === 'fixed' ? '#1d3a5a' : '#1d4a36';
  ctx.fillStyle = scr; ctx.fillRect(tx - L(0.42), ty - L(0.3), L(0.84), L(0.4));
  ctx.font = `800 ${T * 0.1}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = d.terminal === 'broken' ? '#ff8a7a' : d.terminal === 'fixed' ? '#9cd8ff' : '#5fd6a0';
  ctx.fillText(d.terminal === 'broken' ? 'ERR 0x0BAD' : d.terminal === 'fixed' ? 'LOCKED' : 'OPEN', tx, ty - L(0.1));
  ctx.fillStyle = 'rgba(232,236,244,0.7)'; ctx.font = `800 ${T * 0.08}px system-ui, sans-serif`; ctx.fillText('SECURITY', tx, ty + L(0.24));
  if (d.terminal === 'broken' && Math.sin(t * 13) > 0.6) for (let i = 0; i < 4; i++) { ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(tx + (Math.random() - 0.5) * L(0.9), ty - L(0.4) + Math.random() * L(0.3), 2, 0, TAU); ctx.fill(); }
  // the brig door's keypad, and the bay's docking control
  const k = g.keypad;
  rr(L(k.x) - 9, L(k.y) - 12, 18, 24, 3); ctx.fillStyle = '#3a404d'; ctx.fill(); stroke(2);
  for (let i = 0; i < 9; i++) { ctx.fillStyle = '#c9ced8'; ctx.fillRect(L(k.x) - 6 + (i % 3) * 5, L(k.y) - 4 + Math.floor(i / 3) * 5, 3, 3); }
  ctx.fillStyle = d.doors[2] ? '#ff5a4a' : '#5fd6a0'; ctx.fillRect(L(k.x) - 6, L(k.y) - 9, 12, 3);
  const C = g.console;
  rr(L(C.x) - 14, L(C.y) - 10, 28, 20, 4); ctx.fillStyle = '#3a404d'; ctx.fill(); stroke(2);
  ctx.fillStyle = docked ? '#5fd6a0' : (Math.sin(t * 6) > 0 ? '#ffd84a' : '#8a7a2a'); ctx.fillRect(L(C.x) - 10, L(C.y) - 6, 20, 6);
  ctx.fillStyle = 'rgba(232,236,244,0.75)'; ctx.font = `800 ${T * 0.08}px system-ui, sans-serif`; ctx.fillText('DOCK', L(C.x), L(C.y) + 5);
  ctx.textAlign = 'left';
  // the door code: on a sticky note on the barracks' back wall, of course
  dockSign('code' + d.code, g.note.x, g.rooms[2].y + 0.02, WALL_SIGN_Z + 0.15, 1.3, [['BRIG DOOR CODE', 0.1], [d.code, 0.22], ['(DO NOT WRITE DOWN)', 0.07, 700]], '#ffe95c', '#26324f');
}

// The gun corridor (drawn with the base): the stacks of crates (cover) and the sentry gun on its pedestal. With
// sprites: our crate props stacked up and a small copy of our own hull cannon (hull/gun) bolted to the pedestal.
// Its field of fire shows on the floor (a red fan) while it spools up and fires.
function drawGunCorridor(d, g, t) {
  const S = d.sentry || { state: 'off' }, G = g.sentry, C = g.rooms[4];
  if (S.state === 'spool' || S.state === 'fire') glowLayer(() => {
    const k = S.state === 'fire' ? 0.22 + 0.06 * Math.sin(t * 30) : 0.06 + 0.14 * clamp(S.t / SENTRY_SPOOL[clamp(mission.easy || 0, 0, 2)], 0, 1);
    ctx.save(); ctx.beginPath(); ctx.rect(L(C.x), L(C.y), L(C.w), L(C.h)); ctx.clip();
    const m = G.muzzle, gr = ctx.createRadialGradient(L(m.x), L(m.y), 0, L(m.x), L(m.y), L(SENTRY_RANGE));
    gr.addColorStop(0, `rgba(255,70,50,${k})`); gr.addColorStop(1, 'rgba(255,70,50,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(L(m.x), L(m.y)); ctx.arc(L(m.x), L(m.y), L(SENTRY_RANGE), G.dir - SENTRY_SPREAD, G.dir + SENTRY_SPREAD); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
  stencil(L(C.x + C.w / 2), L(C.y + C.h - 0.35), 'KEEP OUT OF THE LINE OF FIRE', 0, 0.14, 'rgba(232,90,70,0.45)');
  g.cover.forEach((q, i) => {                          // the cover: crates stacked two deep, one more on top
    const cx = q.x + q.w / 2, ys = [q.y + 0.38, q.y + q.h - 0.38], names = ['props/crate_misc', 'props/crate_tape', 'props/crate_blank_port', 'props/crate_snax'];
    if (GFX.on && ys.every((y, j) => spr(names[(i + j) % 4], 0, cx, y, 0)) && spr(names[(i + 2) % 4], 0, cx, (ys[0] + ys[1]) / 2, 0.72)) return;
    for (const [j, y] of ys.entries()) crate(L(cx), L(y), L(q.w), L(q.h / 2 - 0.04), 0, j ? '#7a6248' : '#8a6a4a', j ? '' : 'COVER');
  });
  // the pedestal
  const b = G.base;
  rr(L(b.x - 0.05), L(b.y - 0.05), L(b.w + 0.1), L(b.h + 0.1), 6); ctx.fillStyle = '#2b2e36'; ctx.fill(); stroke(3);
  hazardStripe(L(b.x + 0.08), L(b.y + b.h - 0.22), L(b.w - 0.16), L(0.14));
  if (GFX.on && GFX.ready(S.state === 'off' ? 'hull/gun_broken' : 'hull/gun')) {
    const name = S.state === 'off' ? 'hull/gun_broken' : 'hull/gun', kick = S.state === 'fire' && Math.sin(t * 60) > 0 ? 0.05 : 0;
    GFX.sprite(name, GFX.frameIndex(name, G.dir), G.x - Math.cos(G.dir) * kick, G.y, 0.3, { scale: 0.8, sortY: G.y + 0.4, emissive: 0.3 });
    return;
  }
  GFX.preload?.(['hull']);
  // 2D: a squat turret, its twin barrels down the corridor
  ctx.save(); ctx.translate(L(G.x), L(G.y)); ctx.rotate(G.dir);
  const heat = S.state === 'fire' ? 1 : S.state === 'spool' ? clamp(S.t / SENTRY_SPOOL[clamp(mission.easy || 0, 0, 2)], 0, 1) : 0;
  for (const sy of [-0.12, 0.12]) { rr(0, L(sy) - 4, L(0.95), 8, 3); ctx.fillStyle = S.state === 'off' ? '#4a4d55' : `rgb(${Math.round(80 + 175 * heat)},${Math.round(84 + 40 * heat)},${Math.round(92 - 40 * heat)})`; ctx.fill(); stroke(2); }
  ctx.beginPath(); ctx.arc(0, 0, L(0.38), 0, TAU); ctx.fillStyle = S.state === 'off' ? '#3a3d45' : '#5a3a36'; ctx.fill(); stroke(3);
  ctx.beginPath(); ctx.arc(0, 0, L(0.16), 0, TAU); ctx.fillStyle = S.state === 'off' ? '#1a1c22' : S.state === 'idle' ? (Math.sin(t * 3) > 0 ? '#ffb84a' : '#7a5a2a') : '#ff4a3a'; ctx.fill();
  ctx.restore();
}
// Drawn with the crew (on top of the sprites): the barrel glowing as it spools, the muzzle flashes, sparks once
// it's off, and its name tag with what it's doing. Also its sounds (in every browser, from the synced state): the
// whine as it spools up, the rattle of its shots.
const sentryHeard = { state: null, shots: 0, stop: null };
function drawSentryFx(d, g, t) {
  const S = d.sentry;
  if (!S) return;
  const G = g.sentry, easy = clamp(typeof mission !== 'undefined' ? mission.easy || 0 : 0, 0, 2), m = G.muzzle, mz = GFX.on ? 0.62 : 0;
  if (S.state !== sentryHeard.state) {
    if (sentryHeard.stop) { sentryHeard.stop(); sentryHeard.stop = null; }
    if (S.state === 'spool') sentryHeard.stop = sfx.charge(Math.max(0.3, SENTRY_SPOOL[easy] - S.t));
    sentryHeard.state = S.state;
  }
  if (S.shots > sentryHeard.shots && S.shots % 2 === 0) sfx.enemyShot();
  sentryHeard.shots = S.shots;
  const mx = L(m.x + Math.cos(G.dir) * 0.15), my = L(m.y - GFX.lift(mz));
  const heat = S.state === 'fire' ? 1 : S.state === 'spool' ? clamp(S.t / SENTRY_SPOOL[easy], 0, 1) : S.state === 'cool' ? Math.max(0, 1 - S.t / SENTRY_COOL) : 0;
  if (heat > 0) {                                      // the barrel glowing: red-orange, white-hot while it fires
    const r = L(0.25 + 0.35 * heat) * (S.state === 'spool' ? 1 + 0.15 * Math.sin(t * (10 + 30 * heat)) : 1);
    const gr = ctx.createRadialGradient(mx, my, 0, mx, my, r);
    gr.addColorStop(0, S.state === 'fire' ? 'rgba(255,240,200,0.95)' : `rgba(255,170,90,${0.5 + 0.4 * heat})`); gr.addColorStop(0.5, `rgba(255,80,40,${0.5 * heat})`); gr.addColorStop(1, 'rgba(255,60,30,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.fill();
  }
  if (S.state === 'fire' && Math.sin(t * 50) > 0.3) {  // muzzle flash
    ctx.fillStyle = 'rgba(255,230,160,0.9)'; ctx.beginPath(); ctx.ellipse(mx + Math.cos(G.dir) * 8, my, 10, 5, G.dir, 0, TAU); ctx.fill();
  }
  if (S.state === 'off' && Math.sin(t * 7 + 1) > 0.85) for (let i = 0; i < 3; i++) { ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(L(G.x) + (Math.random() - 0.5) * L(0.6), L(G.y - GFX.lift(0.5)) + (Math.random() - 0.5) * L(0.4), 2, 0, TAU); ctx.fill(); }
  const label = S.state === 'off' ? 'SENTRY — OFF' : S.state === 'spool' ? 'SENTRY — SPOOLING UP!' : S.state === 'fire' ? 'SENTRY — FIRING' : S.state === 'cool' ? 'SENTRY — COOLING' : 'SENTRY GUN';
  const col = S.state === 'off' ? '#9aa3b5' : S.state === 'idle' ? '#ffb84a' : S.state === 'cool' ? '#ffd08a' : Math.sin(t * 16) > 0 ? '#ff5a4a' : '#ffe0d8';
  const tag = () => { ctx.font = `800 ${T * 0.2}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText(label, 0, 0); ctx.fillStyle = col; ctx.fillText(label, 0, 0); ctx.textAlign = 'left'; };
  if (GFX.on) upright(camera(), G.x, G.y - 0.2, 1.35, tag); else { ctx.save(); ctx.translate(L(G.x), L(G.y) - L(0.6)); tag(); ctx.restore(); }
}
