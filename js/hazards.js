// Hazards and the small stuff of ship life.
//   Small things: snack machine, coffee, intercoms, ship voice, rattling hull panels, duct tape,
//   lasting scorch marks, the end-of-mission report.
//   Damage types (switched on per mission in mission.rules): hull breaches with blast doors and
//   vacuum, plasma fires and venting a room, power lines that arc (surges), failed gravity plating.
// Everything in `hz` is plain data (no object references), so the server can send it as is.

const hz = {
  hull: { port: 0, front: 0, star: 0 },   // big hits per side since the last weld: panels rattle, the next big hit breaches
  breaches: [],                            // { room, tarp, plated, leak, repress }
  patches: [],                             // nailed-on repairs that stay visible { room, seed }
  floating: [],                            // items blown out into space: { uid, kind, x, y, t }
  vent: null,                              // { room, t } a room being vented
  surges: [],                              // ids of power lines that arc
  noGrav: [],                              // room ids whose gravity plating failed
  spores: { rooms: {}, glitch: [], doors: {}, shrivel: {} },   // spores inside the ship (js/spores.js)
  tape: 3, plates: 4,                      // duct tape rolls, hull plates left
  coffee: 1,                               // the kitchen mug: 1 = full; refills itself (someone makes more)
  stats: { fires: 0, firesOut: 0, breaches: 0, repairs: 0, pets: 0, treated: {} },
};
const BREACH_TIME = 8, TARP_TIME = 15, WELD_TIME = 6, LEAK_TIME = 20, REPRESS_TIME = 2, VENT_TIME = 10;
const SPLICE_TIME = 5, GRAV_TIME = 4, VACUUM_SPEED = 0.7, COFFEE_TIME = 15, COFFEE_SPEED = 1.15;
let COFFEE_REFILL = 60;
const SNACK_COOLDOWN = 60;
const PLASMA_TIME = 6;

// Where each room can be holed: a spot on its outer wall (inside), and where to weld it from outside.
const BREACH_SPOTS = {
  portGun: { x: 0.9, y: 10.4, out: [-0.8, 10.4], side: 'port' },
  portLock: { x: 0.9, y: 21.9, out: [-0.8, 21.9], side: 'port' },   // (below the outer airlock's pod: y 21.3 → 21.9, 2026-10-23)
  bridge: { x: 20.2, y: -2.0, out: [20.2, -3.9], side: 'front' },
  starGun: { x: 43.5, y: 10.6, out: [45.2, 10.6], side: 'star' },
  starLock: { x: 43.5, y: 21.9, out: [45.2, 21.9], side: 'star' },
};
// Hull seams (2026-10-20, the user: a hull breach as one of the random ship failures): one per room that can breach,
// at its hole's inside spot. Only failing parts use them (never broken, burnt or counted as a broken part): a seam
// that fails gives way into a breach (failSeam); serviced with the repair kit while it's orange, it holds. A mission
// lets them fail with MISSIONS[id].failing.seam, a custom skirmish when they're ticked (js/mission.js failPool).
const HULL_SEAMS = Object.entries(BREACH_SPOTS).map(([room, s]) => ({
  kind: 'seam', room, name: `Hull seam (${ROOMS.find(r => r.id === room).name.toLowerCase()})`, x: s.x, y: s.y, r: 0.8, outside: false,
  get broken() { return !!breachAt(room); }, set broken(v) { /* (a seam is "broken" while its room is breached) */ },
}));
function failSeam(s) { if (breachRoom(s.room)) combatBanner(`The hull seam gave way — HULL BREACH in the ${roomById(s.room).name.toLowerCase()}!`); }
// Every part a failing-part event can name, by index (js/net.js sends events, repairs and fires as indices into it)
const ALL_PARTS = [...SYSTEMS, ...HULL_SEAMS];
// Emergency vent valves (one per room) and the gravity breaker panels (under a floor plate).
// Plasma fires only happen in the lower side rooms; the panel next to that room's outer airlock vents it.
const VENT_PANELS = { portLock: [0.85, 16.9], starLock: [43.55, 17.1] };   // (on the outer wall, just above the outer airlock's chamber)
const PLASMA_ROOMS = new Set(Object.keys(VENT_PANELS));
const GRAV_PANELS = { portGun: [6.0, 9.6], bridge: [19.0, 8.6], starGun: [36.0, 9.2], portLock: [9.6, 19.6], reactor: [26.6, 21.2], starLock: [35.4, 18.0] };
// The repair kit's jobs here (Space / right click: js/systems.js repairPick): arcing lines, gravity breakers inside,
// plated breaches outside
KIT_SPOTS.push(() => player.mode === 'eva' ? hz.breaches.filter(b => b.plated).map(b => BREACH_SPOTS[b.room].out)
  : [...hz.surges.map(id => linePoint(LINE[id], 0.5)), ...hz.noGrav.map(id => GRAV_PANELS[id])]);
const SNACK = { x: 10.5, y: 3.85 };
const PLATE_CRATES = [{ x: 12.6, y: 22.4 }, { x: 33.1, y: 22.8 }];
const COFFEE_MUG = { x: 7.52, y: 10.92 };              // on the kitchen counter, between the sink and the stove

const roomById = (id) => ROOMS.find(r => r.id === id);
// Where the hole shows on the outside of the hull (on the wall itself), and where a patched one stays.
const holeAt = (roomId) => { const s = BREACH_SPOTS[roomId]; return s.side === 'port' ? [0.55, s.y] : s.side === 'star' ? [SHIP_W - 0.55, s.y] : [s.x, -2.45]; };   // straddling the wall's inner edge: one hole, seen from both sides
const breachAt = (roomId) => hz.breaches.find(b => b.room === roomId);
// Vacuum: a breached room (not tarped, not repressurizing) or one being vented ...
function sealedVacuum(roomId) {
  const b = breachAt(roomId);
  return (b && !b.tarp && !(b.repress > 0)) || hz.vent?.room === roomId;
}
// ... and every room joined to one by open doors (a door forced open across a pressure difference vents the
// room behind it too, until it shuts again; js/game.js forceDoor). A closed door between them: a pressure
// difference (d.blast), and that door won't open by itself.
function vacuumRoom(roomId) {
  if (!roomId) return false;
  if (sealedVacuum(roomId)) return true;
  const seen = new Set([roomId]), q = [roomId];
  while (q.length) {
    const id = q.shift();
    for (const d of DOORS) {
      if (d.open < 0.1) continue;
      const rs = doorRooms(d);
      if (!rs.some(r => r.id === id)) continue;
      for (const r of rs) if (!seen.has(r.id)) { if (sealedVacuum(r.id)) return true; seen.add(r.id); q.push(r.id); }
    }
  }
  return false;
}
function inVacuum(x, y) { const r = roomAt(x, y); return (!!r && vacuumRoom(r.id)) || dockVacuum(x, y); }
// (Blast doors: every inner door with a pressure difference across it stays shut, d.blast: js/game.js updateDoors.)

// Speed multiplier for walking crew (vacuum, coffee).
function crewSpeedMul(c) {
  let k = 1;
  if (c.mode === 'inside' && inVacuum(c.x, c.y)) k *= VACUUM_SPEED;
  if (c.coffeeT > 0) k *= COFFEE_SPEED;
  return k;
}
function noGravAt(x, y) { const r = roomAt(x, y); return !!r && hz.noGrav.includes(r.id); }

// ---------------------------------------------------------------------------
// Hull breaches
// ---------------------------------------------------------------------------
// A big hit on a side whose hull is already damaged holes a room on that side.
function onBigHit(side, x, y) {
  for (const b of hz.breaches) if (b.tarp && BREACH_SPOTS[b.room].side === side) { b.tarp = false; b.torn = true; combatBanner('The tarp tore — vacuum again!'); }
  if (!mission.rules?.breach) { hz.hull[side] = Math.min(hz.hull[side] + 1, 3); return; }
  if (hz.hull[side] >= 1) {
    const rooms = Object.entries(BREACH_SPOTS).filter(([id, s]) => s.side === side && !breachAt(id));
    if (rooms.length) {
      rooms.sort((a, b) => Math.abs(a[1].y - y) - Math.abs(b[1].y - y));
      breachRoom(rooms[0][0]);
    }
  }
  hz.hull[side] = Math.min(hz.hull[side] + 1, 3);
  if (mission.rules?.surge && Math.random() < 0.35) surgeColumn(colOfSide(side));
  if (mission.rules?.gravity && Math.random() < 0.25) {
    const pool = ROOMS.filter(r => r.col === colOfSide(side) && !hz.noGrav.includes(r.id));
    const r = pool.sort((a, b) => Math.abs(roomCenter(a)[1] - y) - Math.abs(roomCenter(b)[1] - y))[0];
    if (r) failGravity(r.id);
  }
  if (Math.random() < 0.5) hz.coffee = 0;            // the mug always tips over
}
function breachRoom(roomId) {
  if (breachAt(roomId) || !BREACH_SPOTS[roomId]) return false;
  hz.breaches.push({ room: roomId, tarp: false, plated: false, leak: 0, repress: 0 });
  hz.stats.breaches++;
  const name = roomById(roomId).name;
  combatBanner(`HULL BREACH — ${name}! Blast doors down.`);
  sfx.explosion(); sfx.say?.(`Hull breach. ${name}. Please hold on.`);
  for (const f of fires) if (sysRooms(f.sys).some(r => r.id === roomId)) { f.hp = 0; scorch(f.x, f.y); }   // vacuum: no more fire
  const s = BREACH_SPOTS[roomId];
  for (let i = 0; i < 24; i++) combatFx(s.x, s.y, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.8, i % 2 ? '#c9ced8' : '#ffb347', 0.14);
  combatFlip('fx/explosion_s', ...holeAt(roomId));
  return true;
}
function sealBreach(roomId, how) {
  const b = breachAt(roomId);
  if (!b) return;
  if (how === 'weld') {
    hz.breaches.splice(hz.breaches.indexOf(b), 1);
    hz.hull[BREACH_SPOTS[roomId].side] = 0;
    hz.patches = (hz.patches || []).filter(p => p.room !== roomId); hz.patches.push({ room: roomId, seed: Math.floor(Math.random() * 999) });
    combatBanner(`${roomById(roomId).name}: hull plate nailed on — repressurizing`);
  } else { b.tarp = true; b.torn = false; b.repress = REPRESS_TIME; combatBanner(`${roomById(roomId).name}: tarp taped over the hole — holds until the next hit`); }
  hz.repress = { room: roomId, t: REPRESS_TIME };
  hz.stats.repairs++; sfx.hatch(); sfx.win();
}
// Where a loose item heads for the hole: straight at it, or round the corner of the outer airlock's chamber when
// that's in the way (the hole sits on the outer wall beside it: js/ship.js OL_BLOCK).
function suckVia(roomId, it, spot) {
  const B = roomId === 'portLock' ? OL_BLOCK.port : roomId === 'starLock' ? OL_BLOCK.star : null;
  if (!B) return [spot.x, spot.y];
  const hit = [0.2, 0.4, 0.6, 0.8].some(k => inRect(it.x + (spot.x - it.x) * k, it.y + (spot.y - it.y) * k, B, 0.15));
  if (!hit) return [spot.x, spot.y];
  const port = B.x < 1, x = port ? B.x + B.w + 0.2 : B.x - 0.2, y = spot.y > B.y + B.h / 2 ? B.y + B.h + 0.35 : B.y - 0.35;
  return [x, y];
}
function updateBreaches(dt) {
  if (hz.repress && (hz.repress.t -= dt) <= 0) hz.repress = null;
  for (const b of hz.breaches) {
    b.repress = Math.max(0, (b.repress || 0) - dt);
    if (!vacuumRoom(b.room)) continue;
    const spot = BREACH_SPOTS[b.room], room = roomById(b.room);
    // loose items get sucked towards the hole and out
    for (const it of [...ITEMS]) {
      if (roomAt(it.x, it.y) !== room) continue;
      it.suck = (it.suck || 0) + dt;
      const [gx, gy] = suckVia(b.room, it, spot);
      const dx = gx - it.x, dy = gy - it.y, d = Math.hypot(dx, dy) || 1, sp = Math.max(0.6, Math.hypot(spot.x - it.x, spot.y - it.y) / Math.max(0.5, BREACH_TIME - it.suck));
      it.x += dx / d * Math.min(d, sp * dt); it.y += dy / d * Math.min(d, sp * dt);
      if (d < 0.35 || it.suck >= BREACH_TIME) {
        ITEMS.splice(ITEMS.indexOf(it), 1);
        const j = (Math.random() - 0.5) * 2.4, front = spot.side === 'front';              // drifts along the hull, just outside
        hz.floating.push({ uid: newUid(), kind: it.kind, x: spot.out[0] + (front ? j : 0), y: spot.out[1] + (front ? 0 : j), t: Math.random() * 10 });
        combatBanner(`The ${ITEM_NAMES[it.kind]} got sucked out into space!`);
      }
    }
    // the room's capacitor leaks
    const cap = CAPACITORS.find(c => c.room === b.room);
    if (cap && (b.leak += dt) >= LEAK_TIME) { b.leak = 0; if (cap.charge > 0) { cap.charge--; combatBanner(`${room.name}: the capacitor leaks charge through the hole`); } }
    // crew that's hurt doesn't recover in vacuum
    for (const c of crew) if (c.health === 'hurt' && c.mode === 'inside' && roomAt(c.x, c.y) === room) c.hurtT += dt;
  }
  for (const f of hz.floating) {
    f.t += dt;
    if (f.vx || f.vy) { f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt; }   // (a drifting one: a raider's nav core, js/dock.js)
    if (f.life !== undefined && (f.life -= dt) <= 0) { f.lost = true; if (typeof navcoreLost === 'function' && f.kind === 'navcore') navcoreLost(f); }
  }
  if (hz.floating.some(f => f.lost)) hz.floating = hz.floating.filter(f => !f.lost);
  for (const it of ITEMS) if (it.suck && !vacuumRoom(roomAt(it.x, it.y)?.id)) it.suck = 0;
}

// ---------------------------------------------------------------------------
// Plasma fire and venting
// ---------------------------------------------------------------------------
const inPlasmaRoom = (s) => sysRooms(s).some(r => PLASMA_ROOMS.has(r.id));
const plasmaPart = (s) => inPlasmaRoom(s) && s.kind === 'capacitor' && s.ref.charge >= 3;   // a well charged capacitor in a lower side room
const plasmaIn = (roomId) => fires.some(f => f.plasma && f.hp > 0 && sysRooms(f.sys).some(r => r.id === roomId));
const fireIn = (roomId) => fires.some(f => f.hp > 0 && sysRooms(f.sys).some(r => r.id === roomId));   // any fire: venting works on normal fires too
// The vent panel works any time (2026-10-22: it clears spores, js/spores.js); it lights up when there's a reason to use
// it: a fire in its room, spores in it, in the cannon room above or on the bridge (vented on through forced doors).
const ventWanted = (roomId) => fireIn(roomId) || infested(roomId) || infested(roomId === 'portLock' ? 'portGun' : 'starGun') || infested('bridge');
// operator: whoever typed the vent code — their visor is already down, so they're not hurt.
// Everyone else in the room takes one hit the moment it opens (the vacuum afterwards only slows you).
// Hostiles in there (boarders, the saboteur, pirates) take one solid hit each and are stunned (VENT_HIT:
// the alien loses half its health, a saboteur goes down), then the rushing air drags them towards the
// open outer airlock: whoever reaches it is blown out into space (a kill, counted like any other).
const VENT_HIT = { alien: 3, saboteur: 3, pirate: 2 }, VENT_STUN = 2.5, VENT_PULL = 2.2, VENT_OUT = 0.6;
const ventHatch = (roomId) => HATCHES.find(h => h.side === (roomId === 'portLock' ? 'port' : 'star'));
// In the vented room, or in its outer airlock's chamber (both doors stand open: js/airlock.js).
const inVented = (x, y, room) => roomAt(x, y) === room || (!!ventHatch(room.id) && airlockAt(x, y) === ventHatch(room.id));
function ventFoes(room) {
  return [
    ...boarding.invaders.filter(a => !a.dead && a.mode === 'inside' && inVented(a.x, a.y, room))
      .map(a => ({ o: a, dmg: VENT_HIT[a.kind] ?? 3, hurt: (d, s) => hurtInvader(a, d, s), ok: (x, y) => canStand(x, y, walkRects()), name: a.kind === 'saboteur' ? 'The saboteur' : 'The intruder' })),
    ...dk.pirates.filter(p => !p.dead && inVented(p.x, p.y, room))
      .map(p => ({ o: p, dmg: VENT_HIT.pirate, hurt: (d, s) => hurtPirate(p, d, s), ok: pirateOk, name: 'A pirate' })),
  ];
}
// One hit each for hostiles in the vented room (the first time they're caught in it), then the pull.
function ventHostiles(dt) {
  const v = hz.vent, room = roomById(v.room), h = ventHatch(v.room);
  if (!h) return;
  const pull = VENT_PULL * ((VENT_TIME - v.t) < 3 ? 1 : 0.5);
  for (const f of ventFoes(room)) {
    const a = f.o;
    if (!v.hit.includes(a.uid)) { v.hit.push(a.uid); f.hurt(f.dmg, VENT_STUN); if (a.dead) continue; }
    // dragged to the airlock's inner door, then through the chamber to the hatch (both doors stand open: js/airlock.js)
    const through = (airlockDepth(h, a.x) < airlockDepth(h, h.inside[0]) + VENT_OUT && Math.abs(a.y - h.y) < OL_H / 2) || Math.hypot(h.inside[0] - a.x, h.inside[1] - a.y) < VENT_OUT;
    const [gx, gy] = through ? [h.x, h.y] : h.inside, dx = gx - a.x, dy = gy - a.y, d = Math.hypot(dx, dy);
    if (through && d < VENT_OUT + 0.6) {               // at the open hatch: out it goes
      combatBanner(`${f.name} got blown out of the airlock!`);
      for (let i = 0; i < 12; i++) combatFx(h.x, h.y, h.dir * (2 + Math.random() * 4), (Math.random() - 0.5) * 3, 0.8, '#dfe8f0', 0.15);
      f.hurt(a.hp, 0);
      continue;
    }
    if (dt <= 0) continue;
    const sp = Math.min(d, pull * dt), nx = a.x + dx / d * sp, ny = a.y + dy / d * sp;
    if (f.ok(nx, a.y)) a.x = nx;
    if (f.ok(a.x, ny)) a.y = ny;
  }
}
function startVent(roomId, operator = null, forced = false) {
  if (hz.vent && hz.vent.room !== roomId) hz.repress = { room: hz.vent.room, t: REPRESS_TIME };   // (one vent at a time: the other one closes)
  hz.vent = { room: roomId, t: VENT_TIME, hit: [], forced };
  const room = roomById(roomId);
  combatBanner(forced ? `Outer airlock forced — ${room.name} vents to space! Blast doors down.`
                      : `${room.name} vented to space — everything in there gets blown around!`);
  sfx.explosion(); sfx.hatch(); sfx.whoosh?.(); sfx.say?.(`Venting ${room.name}.`);
  for (const c of crew) if (c !== operator && c.mode === 'inside' && inVented(c.x, c.y, room)) { hurtCrew(c); combatFx(c.x, c.y, 0, -3, 0.6, '#c9ced8', 0.2); }
  for (const f of fires) if (sysRooms(f.sys).includes(room)) { f.hp = 0; scorch(f.x, f.y); }
  ventHostiles(0);                                   // (both doors of the outer airlock stand open meanwhile: js/airlock.js)
}
// Forcing an outer airlock by manual override (broken or locked) opens both its doors at once: the
// airlock room vents to space exactly like the vent panel does (anyone else in there gets hurt,
// hostiles get blown out, blast doors seal it off from the reactor room), and repressurizes once the
// hatch swings shut again after VENT_TIME. The one who forced it has their visor down: unhurt.
// Forcing it again while it's still venting just keeps it open for the full time.
const hatchRoom = (h) => h.side === 'port' ? 'portLock' : 'starLock';
function forceHatchVent(h, operator = null) {
  const id = hatchRoom(h);
  if (hz.vent?.room === id) { hz.vent.t = VENT_TIME; hz.vent.forced = true; return; }
  startVent(id, operator, true);
}
function updateVent(dt) {
  if (!hz.vent) return;
  const room = roomById(hz.vent.room), [vx, vy] = VENT_PANELS[hz.vent.room] || roomCenter(room);
  hz.vent.hit ||= [];
  if (Math.random() < dt * 20) combatFx(vx + (Math.random() - 0.5), vy + (Math.random() - 0.5), (Math.random() - 0.5) * 2, -2 - Math.random() * 3, 0.7, '#dfe8f0', 0.2);
  ventHostiles(dt);
  if ((hz.vent.t -= dt) <= 0) {
    const forced = hz.vent.forced; hz.vent = null; hz.repress = { room: room.id, t: REPRESS_TIME };
    combatBanner(`${room.name}: ${forced ? 'the forced airlock swung shut' : 'vent closed'}, repressurizing`);
  }
}

// ---------------------------------------------------------------------------
// Power surges: a power line arcs. Using what's on it zaps you; deliveries over it are lost.
// ---------------------------------------------------------------------------
const surging = (id) => hz.surges.includes(id);
function surgeColumn(col) {
  const pool = POWER_LINES.filter(l => l.cap === col && !surging(l.id));
  const l = pool[Math.floor(Math.random() * pool.length)];
  if (!l) return;
  hz.surges.push(l.id);
  combatBanner(`Power surge — a ${lineName(l)} is arcing! Splice it with the repair kit.`); sfx.spark();
}
function lineName(l) {
  const side = ['left', 'middle', 'right'][l.cap];
  return l.feed ? `${side} feed line` : l.id.startsWith('shield') ? `${SIDE_LABEL[l.id.split('_')[1]].toLowerCase()} shield line` : `${SIDE_LABEL[l.id.split('_')[1]].toLowerCase()} cannon line`;
}
function zap(c, l) {
  if (!c || !surging(l)) return false;
  hurtCrew(c); sfx.spark(); sfx.hit(false);
  combatBanner(`Zapped! The ${lineName(LINE[l])} is arcing.`);
  for (let i = 0; i < 12; i++) combatFx(c.x, c.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.4, '#bfe8ff', 0.08);
  combatFlip('fx/hit_spark_blue', c.x, c.y);
  return true;
}

// ---------------------------------------------------------------------------
// Gravity plating
// ---------------------------------------------------------------------------
function failGravity(roomId) {
  if (hz.noGrav.includes(roomId)) return;
  hz.noGrav.push(roomId);
  combatBanner(`${roomById(roomId).name}: gravity plating failed — fix the breaker under the floor (repair kit)`); sfx.spark();
}

// ---------------------------------------------------------------------------
// Small things
// ---------------------------------------------------------------------------
function scorch(x, y) { combat.decals.push({ x, y, r: 0.75, scorch: true, seed: Math.floor(Math.random() * 999) }); }
function updateHazards(dt) {
  updateBreaches(dt);
  updateVent(dt);
  if (hz.coffee < 1) hz.coffee = Math.min(1, hz.coffee + dt / COFFEE_REFILL);
  for (const c of crew) { c.coffeeT = Math.max(0, (c.coffeeT || 0) - dt); c.snackT = Math.max(0, (c.snackT || 0) - dt); }
}
function resetHazards() {
  Object.assign(hz, { hull: { port: 0, front: 0, star: 0 }, breaches: [], patches: [], floating: [], vent: null, surges: [], noGrav: [], spores: { rooms: {}, glitch: [], doors: {}, shrivel: {} }, tape: 3, plates: 4, coffee: 1, repress: null,
                      stats: { fires: 0, firesOut: 0, breaches: 0, repairs: 0, pets: 0, treated: {} } });
}

// ---------------------------------------------------------------------------
// Clicking: what these add to clickTarget (inside) and what you can do on a spacewalk.
// ---------------------------------------------------------------------------
const holdTarget = (id, time, text, x, y, r, done) => ({ text, ok: true, x, y, r, hold: { id, time, done } });
function hazardClickTarget(mx, my) {
  const at = (x, y, r) => Math.hypot(mx - x, my - y) <= r;
  // breaches: tape a tarp over the hole from inside
  for (const b of hz.breaches) {
    const s = BREACH_SPOTS[b.room];
    if (b.tarp || !at(s.x, s.y, 0.8)) continue;
    if (!near(s.x, s.y)) return { text: 'Hull breach — get closer', ok: false, x: s.x, y: s.y, r: 0.8 };
    if (!hz.tape) return { text: 'Hull breach — out of duct tape. Nail a hull plate on from outside.', ok: false, x: s.x, y: s.y, r: 0.8 };
    return holdTarget('tarp' + b.room, TARP_TIME, `Hold click: tape a tarp over the hole (${TARP_TIME} s, 1 of ${hz.tape} duct tape)`, s.x, s.y, 0.8,
                      () => { hz.tape--; sealBreach(b.room, 'tarp'); });
  }
  // arcing power lines: splice them
  for (const id of hz.surges) {
    const [x, y] = linePoint(LINE[id], 0.5);
    if (!at(x, y, 0.8)) continue;
    if (!near(x, y)) return { text: `Arcing ${lineName(LINE[id])} — get closer`, ok: false, x, y, r: 0.8 };
    if (inv.weapon !== 'repair') return { text: `Arcing ${lineName(LINE[id])} — splice it with the repair kit`, ok: false, x, y, r: 0.8 };
    return kitJob(holdTarget('splice' + id, SPLICE_TIME, `Hold Space / right click: cut and splice the ${lineName(LINE[id])} (${SPLICE_TIME} s)`, x, y, 0.8,
                      () => { hz.surges = hz.surges.filter(s => s !== id); hz.stats.repairs++; sfx.win(); }));
  }
  // failed gravity: the breaker under the floor
  for (const id of hz.noGrav) {
    const [x, y] = GRAV_PANELS[id];
    if (!at(x, y, 0.7)) continue;
    if (!near(x, y)) return { text: 'Gravity breaker — get closer', ok: false, x, y, r: 0.7 };
    if (inv.weapon !== 'repair') return { text: 'Gravity breaker — pry the floor plate up with the repair kit', ok: false, x, y, r: 0.7 };
    return kitJob(holdTarget('grav' + id, GRAV_TIME, `Hold Space / right click: reset the gravity breaker (${GRAV_TIME} s)`, x, y, 0.7,
                      () => { hz.noGrav = hz.noGrav.filter(r => r !== id); hz.stats.repairs++; combatBanner(`${roomById(id).name}: gravity back on`); sfx.win(); }));
  }
  // the panel next to each outer airlock vents its room, any time (vent code: a PIN pad, with the admin password on a
  // sticky note right next to it — js/minigames.js). Also with a spore cloud outside (2026-10-22, the user: "it could still
  // be useful against plasma fires, we should allow the player to make mistakes, a panel is not smart"): the spores just
  // survive it then, and the cloud gets in through the open airlock (js/spores.js)
  for (const [id, [x, y]] of Object.entries(VENT_PANELS)) {
    if (!at(x, y, 0.5)) continue;
    if (!near(x, y)) return { text: 'Airlock vent panel — get closer', ok: false, x, y, r: 0.5 };
    if (hz.vent) return { text: 'The room is already being vented', ok: false, x, y, r: 0.5 };
    return { text: 'Click: vent the room (code on the sticky note) — kills spores, puts out fires, hurts anyone else inside, blows boarders out', ok: true, x, y, r: 0.5,
             run: () => openPinPad(id) };
  }
  // snack machine: free, one snack per minute each, and only worth it when you're hurt (ends it 10 s sooner)
  if (at(SNACK.x, SNACK.y, 0.6)) {
    const t = { x: SNACK.x, y: SNACK.y, r: 0.6 };
    if (!near(t.x, t.y)) return { ...t, text: 'Snack machine — get closer', ok: false };
    if (player.health !== 'hurt') return { ...t, text: 'Snack machine (a snack helps when you\'re hurt)', ok: false };
    if (player.snackT > 0) return { ...t, text: `You just had a snack (next one in ${Math.ceil(player.snackT)} s)`, ok: false };
    return { ...t, ok: true, text: 'Click: grab a snack — being hurt ends 10 s sooner',
             run: () => { player.snackT = SNACK_COOLDOWN; player.hurtT = Math.max(0.1, player.hurtT - 10); sfx.clank(); } };
  }
  // coffee in the kitchen
  if (at(COFFEE_MUG.x, COFFEE_MUG.y, 0.35)) {
    const t = { x: COFFEE_MUG.x, y: COFFEE_MUG.y, r: 0.35, z: COUNTER_Z };   // (z: on the counter, for the ring)
    if (!near(t.x, t.y, REACH + 0.6)) return { ...t, text: 'Coffee — get closer', ok: false };
    if (hz.coffee < 1) return { ...t, text: `The mug is empty (someone is making more: ${Math.ceil((1 - hz.coffee) * COFFEE_REFILL)} s)`, ok: false };
    return { ...t, ok: true, text: 'Click: drink the coffee (a bit faster for 15 s)', run: () => { hz.coffee = 0; player.coffeeT = COFFEE_TIME; sfx.poi(); } };
  }
  // hull plates
  for (const pc of PLATE_CRATES) {
    if (!at(pc.x, pc.y, 0.6)) continue;
    const t = { x: pc.x, y: pc.y, r: 0.6 };
    if (!hz.plates) return { ...t, text: 'Hull plate crate is empty', ok: false };
    if (!near(t.x, t.y)) return { ...t, text: 'Hull plates — get closer', ok: false };
    return { ...t, ok: true, text: `Click: take a hull plate (${hz.plates} left; for breaches, from outside${inv.item ? `; drops your ${ITEM_NAMES[inv.item]}` : ''})`,
             run: () => { hz.plates--; grab('plate'); } };
  }
  return null;
}
// On a spacewalk: weld breaches, grab things that got blown out.
function hazardEvaTarget(mx, my) {
  const at = (x, y, r) => Math.hypot(mx - x, my - y) <= r;
  for (const b of hz.breaches) {
    const [x, y] = BREACH_SPOTS[b.room].out;
    if (!at(x, y, 0.9)) continue;
    if (!near(x, y)) return { text: 'Hull breach — get closer', ok: false, x, y, r: 0.9 };
    if (!b.plated) {                                     // step 1: put a hull plate over the hole
      if (inv.item !== 'plate') return { text: 'Hull breach — bring a hull plate (crates in the airlock rooms) and the repair kit', ok: false, x, y, r: 0.9 };
      return { text: 'Click: hold the hull plate over the hole', ok: true, x, y, r: 0.9, run: () => { inv.item = null; b.plated = true; sfx.clank(); combatBanner('Plate in place — now nail it down with the repair kit'); } };
    }
    if (inv.weapon !== 'repair') return { text: 'The plate is loose over the hole — nail it down with the repair kit', ok: false, x, y, r: 0.9 };
    return kitJob(holdTarget('weld' + b.room, WELD_TIME, `Hold Space / right click: nail the plate down (${WELD_TIME} s)`, x, y, 0.9,   // step 2: the repair kit
                      () => sealBreach(b.room, 'weld')));
  }
  for (const f of hz.floating) {
    const [x, y] = floatPos(f);
    if (!at(x, y, 0.5)) continue;
    if (!near(x, y)) return { text: `${ITEM_NAMES[f.kind]} — get closer`, ok: false, x, y, r: 0.5 };
    return { text: `Click: grab the ${ITEM_NAMES[f.kind]}`, ok: true, x, y, r: 0.5,
             run: () => { hz.floating = hz.floating.filter(q => q !== f); grab(f.kind); } };
  }
  return null;
}
const floatPos = (f) => [f.x + Math.sin(f.t * 0.7) * 0.3, f.y + Math.cos(f.t * 0.5) * 0.3];

// Interactable spots this module adds to the green brackets.
function hazardSpots() {
  return [
    ...hz.breaches.filter(b => !b.tarp).map(b => ({ x: BREACH_SPOTS[b.room].x, y: BREACH_SPOTS[b.room].y, r: 0.6 })),
    ...hz.surges.map(id => { const [x, y] = linePoint(LINE[id], 0.5); return { x, y, r: 0.5 }; }),
    ...hz.noGrav.map(id => ({ x: GRAV_PANELS[id][0], y: GRAV_PANELS[id][1], r: 0.5 })),
    ...Object.entries(VENT_PANELS).filter(([id]) => ventWanted(id)).map(([, [x, y]]) => ({ x, y, r: 0.4 })),
    { x: SNACK.x, y: SNACK.y, r: 0.6 }, { x: COFFEE_MUG.x, y: COFFEE_MUG.y, r: 0.3, z: COUNTER_Z },
    ...PLATE_CRATES.filter(() => hz.plates > 0).map(p => ({ x: p.x, y: p.y, r: 0.6 })),
  ];
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// Effect sprites (fx group: tools/blender/models/fx/*.py headers). Each returns false while GFX is off
// or the sprite's page is still loading, so the caller draws its old 2D version instead.
// - floor decals (scorch, goo, puddles, frost): layer 'decal', lit like the floor, under everything
// - smoke puffs: lit, in the 'main' layer at their height, depth-tested but not writing depth
// - breach hole / tarp / patch: on the hull edge where the hole straddles the wall, so they are drawn
//   over the wall top (depthBias), without writing depth (crew still walk in front of them)
function fxDecal(name, x, y, scale = 1, alpha = 1) { return GFX.sprite(name, 0, x, y, 0, { layer: 'decal', scale, alpha }); }
function fxSmoke(x, y, z, r, alpha, k, depthBias = 0) { return GFX.sprite(`fx/smoke_${((k | 0) % 4 + 4) % 4}`, 0, x, y, z, { scale: r / 0.25, alpha, sortY: y + 0.02, depthWrite: false, depthBias }); }
const HOLE_BIAS = 2.6;                               // > the 1.6 high wall top's depth over the floor point it hides
function fxHole(name, frame, x, y, sortK = 0) { return GFX.sprite(name, frame, x, y, 0, { layer: 'wall', sortY: y + 2 + sortK, depthBias: HOLE_BIAS, depthWrite: false }); }
const frostK = {};                                   // per room: frost fading in while in vacuum (drawing only)
let frostT = 0;

// The hole, frost on the walls and air rushing out (inside); a jagged hole in the hull (outside).
function drawBreaches(t) {
  const dt = clamp(t - frostT, 0, 0.1); frostT = t;
  for (const id of Object.keys(frostK)) if (!breachAt(id)) delete frostK[id];
  for (const b of hz.breaches) {
    const s = BREACH_SPOTS[b.room], [hx, hy] = holeAt(b.room), x = L(hx), y = L(hy), vac = vacuumRoom(b.room);
    frostK[b.room] = clamp((frostK[b.room] || 0) + (vac ? dt / 6 : -dt / 3), 0, 1);
    if (GFX.on && GFX.ready('fx/breach_hole') && GFX.ready('fx/frost')) {
      const sx = s.side === 'port' ? 0.75 : s.side === 'star' ? -0.75 : 0, sy = s.side === 'front' ? 0.75 : 0;   // frost: on the floor next to the hole
      if (frostK[b.room] > 0) fxDecal('fx/frost', hx + sx, hy + sy, 1.05, frostK[b.room]);
      fxHole('fx/breach_hole', 0, hx, hy);
      if (b.tarp) { fxHole('fx/breach_tarp', 0, hx, hy, 0.01); continue; }
      if (b.torn) fxHole('fx/breach_tarp_torn', Math.floor(t * 10) % 4, hx, hy, 0.01);
      if (vac) drawAirStreaks(x, y, t);
      continue;
    }
    ctx.save(); ctx.translate(x, y);
    poly(Array.from({ length: 9 }, (_, i) => { const a = i / 9 * TAU, r = (i % 2 ? 0.28 : 0.42) * T; return [Math.cos(a) * r, Math.sin(a) * r]; }));
    ctx.fillStyle = '#05070c'; ctx.fill(); stroke(2.5, '#c96a3a');
    for (let i = 0; i < 4; i++) { const sx = Math.sin(i * 7.3) * 9, sy = Math.cos(i * 3.1) * 9; ctx.fillStyle = '#fff'; ctx.fillRect(sx, sy, 1.5, 1.5); }   // stars through it
    if (b.tarp) {                                    // the tarp, taped down
      rr(-T * 0.5, -T * 0.5, T, T, 6); ctx.fillStyle = 'rgba(60,110,170,0.92)'; ctx.fill(); stroke(1.5);
      tapeStrip(0, -T * 0.42, T * 0.9, 0, 301); tapeStrip(0, T * 0.42, T * 0.9, 0, 302); tapeStrip(-T * 0.42, 0, T * 0.9, Math.PI / 2, 303); tapeStrip(T * 0.42, 0, T * 0.9, Math.PI / 2, 304);
      ctx.restore(); continue;
    }
    ctx.restore();
    if (vac) {
      drawAirStreaks(x, y, t);
      const g = ctx.createRadialGradient(x, y, 0, x, y, L(2.5));      // frost
      g.addColorStop(0, 'rgba(200,230,255,0.25)'); g.addColorStop(1, 'rgba(200,230,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, L(2.5), 0, TAU); ctx.fill();
    }
  }
}
// Air rushing out: streaks pulled into the hole (at ground level; in the tilted view that's the floor).
function drawAirStreaks(x, y, t) {
  for (let i = 0; i < 10; i++) {
    const k = (t * 1.4 + i / 10) % 1, a = i * 2.39, r = L(4) * (1 - k);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    ctx.strokeStyle = `rgba(220,235,250,${0.5 * k})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (x - px) * 0.15, py + (y - py) * 0.15); ctx.stroke();
  }
}
// A room being vented (hz.vent, from the snapshot, so every client sees the same): drawn only, never
// simulated. Air streaks race across the room into the open outer airlock, papers and nuts tumble along
// and out through the hatch, and a burst of mist blows out into space; strongest in the first seconds.
// Each particle is a pure function of the time (its own lane, speed and phase; a fresh start spot every
// loop), so it costs nothing to keep. Sprites: dyn/vent_air (a soft white dot, stretched into streaks
// and blown up into mist), dyn/vent_paper, fx/junk_bolt / _shard / _can; ?classic draws it all in 2D.
let VENT_SPR = null;
function ventSprites() {
  if (VENT_SPR || !GFX.on) return VENT_SPR;
  const A = GFX.canvasSprite('vent_air', 32, 32, { ppu: 320 }), P = GFX.canvasSprite('vent_paper', 20, 26, { ppu: 160 });
  if (!A || !P) return null;
  const gr = A.ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(225,238,255,0.8)'); gr.addColorStop(1, 'rgba(210,228,255,0)');
  A.ctx.fillStyle = gr; A.ctx.fillRect(0, 0, 32, 32); A.commit();
  const g = P.ctx; g.fillStyle = '#f2f0e8'; g.fillRect(1, 1, 18, 24); g.fillStyle = '#9aa6b8';
  for (let i = 0; i < 5; i++) g.fillRect(4, 5 + i * 4, i === 4 ? 7 : 12, 1.5);   // a few lines of text
  P.commit();
  return (VENT_SPR = { air: A.name, paper: P.name });
}
const VENT_JUNK = ['paper', 'bolt', 'paper', 'shard', 'paper', 'can', 'bolt', 'paper'];
function drawVentRush(t) {
  const v = hz.vent, room = v && roomById(v.room), h = v && ventHatch(v.room);
  if (!room || !h) return;
  const q = room.rects[0], e = VENT_TIME - v.t;
  const I = clamp(0.3 + 0.5 * v.t / VENT_TIME + 0.9 * Math.exp(-e / 1.6), 0, 1.4) * clamp(e * 4, 0, 1) * clamp(v.t * 2, 0, 1);
  const ex = h.x + h.dir * 0.15, ey = h.y;                        // the open hatch: where everything goes
  const S = GFX.on ? ventSprites() : null, junkOk = S && GFX.ready('fx/junk_bolt');
  const at = (r) => [q.x + 0.5 + r() * (q.w - 1), q.y + 0.4 + r() * (q.h - 0.8)];
  const mx = h.inner.x + h.inner.w / 2, my = h.y;                 // (in through the airlock's open inner door, out of the hatch)
  const path = (sx, sy, k, bend) => {                              // from (sx, sy) to the hatch, speeding up, a slight curve
    if (k > 0.8) { const o = (k - 0.8) / 0.2; return [mx + (ex - mx) * o, my + (ey - my) * o]; }
    const u = (k / 0.8) ** 1.7, side = Math.sin(Math.PI * u) * bend;
    const dx = mx - sx, dy = my - sy;
    return [sx + dx * u - dy * side * 0.15, sy + dy * u + dx * side * 0.15];
  };
  ctx.save(); ctx.lineCap = 'round';
  // streaks of air
  const nS = Math.round(34 * Math.min(1, I));
  for (let i = 0; i < nS; i++) {
    const sp = 0.8 + (i * 0.37 % 1) * 0.9, c = t * sp + i * 0.618, k = c % 1, r = rng(i * 7919 + Math.floor(c) * 104729 + (v.room.length << 3));
    const [sx, sy] = at(r), bend = (r() - 0.5) * 2;
    const [x0, y0] = path(sx, sy, Math.max(0, k - 0.12), bend), [x1, y1] = path(sx, sy, k, bend);
    const a = Math.sin(Math.PI * k) * 0.8 * Math.min(1, I), len = Math.hypot(x1 - x0, y1 - y0);
    if (S) {
      const ang = Math.atan2((y1 - y0) * GFX.SIN, x1 - x0);
      GFX.sprite(S.air, 0, (x0 + x1) / 2, (y0 + y1) / 2, 0.25 + r() * 0.5, { sortY: y1 + 0.3, depthWrite: false, unlit: true, scale: 1.1, sx: Math.max(1, len / 0.11), rot: ang, alpha: a });
    } else {
      ctx.strokeStyle = `rgba(225,238,252,${a})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(L(x0), L(y0)); ctx.lineTo(L(x1), L(y1)); ctx.stroke();
    }
  }
  // papers, nuts and bits, tumbling along and out of the hatch into space
  const nJ = Math.round(10 * Math.min(1, I));
  for (let i = 0; i < nJ; i++) {
    const sp = 0.35 + (i * 0.53 % 1) * 0.3, c = t * sp + i * 0.381, k = c % 1, r = rng(i * 6007 + Math.floor(c) * 15485863 + 11);
    const [sx, sy] = at(r), bend = (r() - 0.5) * 2, kind = VENT_JUNK[i % VENT_JUNK.length], spin = (r() < 0.5 ? -1 : 1) * (4 + r() * 6);
    let x, y;
    if (k < 0.8) [x, y] = path(sx, sy, k / 0.8, bend);
    else { const o = (k - 0.8) / 0.2; x = ex + h.dir * o * 4; y = ey + (r() - 0.5) * o * 2.5; }
    const z = 0.15 + 0.5 * Math.abs(Math.sin(t * 3 + i)) * (1 - k), a = Math.min(1, k * 8) * (k > 0.8 ? 1 - (k - 0.8) / 0.2 : 1);
    if (S && (kind === 'paper' || junkOk)) {
      const o = k < 0.8 ? { sortY: y + 0.2, depthWrite: false } : { layer: 'top' };
      if (kind === 'paper') GFX.sprite(S.paper, 0, x, y, z, { ...o, unlit: true, scale: 1.7, rot: t * spin, sx: 0.4 + 0.6 * Math.abs(Math.cos(t * spin * 0.7)), alpha: a * 0.95 });
      else GFX.sprite(`fx/junk_${kind}`, Math.floor(t * spin * 2.4) & 7, x, y, z, { ...o, scale: 1.1, alpha: a });
      continue;
    }
    ctx.save(); ctx.globalAlpha = a; ctx.translate(L(x), L(y - GFX.lift(z))); ctx.rotate(t * spin);
    if (kind === 'paper') { ctx.scale(0.4 + 0.6 * Math.abs(Math.cos(t * spin * 0.7)), 1); ctx.fillStyle = '#f2f0e8'; ctx.fillRect(-4, -5, 8, 10); ctx.fillStyle = '#9aa6b8'; ctx.fillRect(-2.5, -3, 5, 1); ctx.fillRect(-2.5, 0, 5, 1); }
    else { ctx.fillStyle = kind === 'can' ? '#b8402e' : '#8a93a5'; ctx.fillRect(-2.5, -2.5, 5, 5); ctx.strokeStyle = '#2b303a'; ctx.lineWidth = 1; ctx.strokeRect(-2.5, -2.5, 5, 5); }
    ctx.restore();
  }
  // mist bursting out of the hatch into space
  const nM = Math.round(12 * Math.min(1, I));
  for (let i = 0; i < nM; i++) {
    const sp = 0.9 + (i * 0.29 % 1) * 0.6, c = t * sp + i * 0.4142, k = c % 1, r = rng(i * 3571 + Math.floor(c) * 7727 + 5);
    const x = h.x + h.dir * (0.2 + k * (2.5 + r() * 2.5)), y = h.y + (r() - 0.5) * k * 3.2, R = 0.25 + k * (0.8 + r() * 0.8);
    const a = (1 - k) * Math.min(1, k * 6) * 0.5 * Math.min(1.2, I);
    if (S) { GFX.sprite(S.air, 0, x, y, 0.4, { layer: 'top', unlit: true, scale: R / 0.05, alpha: a * 0.6 }); continue; }
    const X = L(x), Y = L(y), g = ctx.createRadialGradient(X, Y, 0, X, Y, L(R));
    g.addColorStop(0, `rgba(228,238,250,${a})`); g.addColorStop(1, 'rgba(228,238,250,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, L(R), 0, TAU); ctx.fill();
  }
  // the whoosh: a pale sheen sweeping over the room towards the hatch (first seconds only)
  const w = clamp(1 - e / 2.5, 0, 1);
  if (w > 0) {
    const X0 = L(q.x), X1 = L(q.x + q.w), up = GFX.lift(1.6), g = ctx.createLinearGradient(h.dir < 0 ? X1 : X0, 0, L(ex), 0), m = (e * 1.3) % 1;
    g.addColorStop(0, 'rgba(220,235,255,0)'); g.addColorStop(clamp(m, 0.01, 0.98), `rgba(220,235,255,${0.16 * w})`); g.addColorStop(1, 'rgba(220,235,255,0)');
    ctx.fillStyle = g; ctx.fillRect(X0, L(q.y - up), X1 - X0, L(q.h + up));
  }
  ctx.restore();
}
function drawBreachesOutside(t) {                      // on the hull: the hole, a loose plate, or the nailed-on patch
  for (const p of hz.patches || []) if (!breachAt(p.room)) drawPatch(...holeAt(p.room), p.seed, true);
  for (const b of hz.breaches) {
    const [ox, oy] = BREACH_SPOTS[b.room].out, [hx, hy] = holeAt(b.room);
    if (GFX.on && GFX.ready('fx/breach_hole')) {      // the sprite hole (drawBreaches) is seen from both sides
      if (b.plated) drawPatch(hx, hy, 7, false);
      else if (!b.tarp && Math.random() < 0.5) combatFxLocal(L(ox), L(oy), t);
      continue;
    }
    ctx.save(); ctx.translate(L(hx), L(hy));
    poly(Array.from({ length: 12 }, (_, i) => { const a = i / 12 * TAU, r = (i % 2 ? 0.28 : 0.48 + 0.08 * Math.sin(i * 3.1)) * T; return [Math.cos(a) * r, Math.sin(a) * r * 1.15]; }));
    ctx.fillStyle = '#05070c'; ctx.fill(); stroke(3, '#c96a3a');
    ctx.strokeStyle = 'rgba(255,170,90,0.7)'; ctx.lineWidth = 1.5;                         // torn metal curling out
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; ctx.beginPath(); ctx.moveTo(Math.cos(a) * T * 0.45, Math.sin(a) * T * 0.5); ctx.lineTo(Math.cos(a + 0.2) * T * 0.62, Math.sin(a + 0.2) * T * 0.7); ctx.stroke(); }
    ctx.fillStyle = '#fff'; ctx.fillRect(-3, -2, 1.5, 1.5); ctx.fillRect(4, 5, 1.5, 1.5);   // stars through it
    ctx.restore();
    if (b.plated) drawPatch(hx, hy, 7, false);
    else if (!b.tarp && Math.random() < 0.5) combatFxLocal(L(ox), L(oy), t);
  }
  for (const f of hz.floating) {                       // things that got sucked out, tumbling
    const [x, y] = floatPos(f);
    pickupHalo(L(x), L(y), T * 0.45, t, me.mode === 'eva' && Math.hypot(me.x - x, me.y - y) <= REACH, f.uid);
    if (f.kind === 'navcore' && typeof drawNavcoreFloating === 'function') { drawNavcoreFloating(f, x, y, t); continue; }   // (js/dock.js: glow, sprite, countdown)
    ctx.save(); ctx.translate(L(x), L(y)); ctx.rotate(f.t * 0.8); drawItemIcon(f.kind, 0, 0, 1.1); ctx.restore();
  }
}
// An improvised patch: a scuffed plate over the hole, a few nails hammered through (or still loose).
// Sprites: fx/breach_patch_a/b/c for the seed's tilt (rendered at -0.18, +0.02, +0.2 rad), _loose.
function drawPatch(hx, hy, seed, nailed) {
  if (GFX.on) {
    const tilt = (rng(seed)() - 0.5) * 0.5, v = tilt < -0.08 ? 'a' : tilt < 0.11 ? 'b' : 'c';
    if (fxHole(nailed ? `fx/breach_patch_${v}` : 'fx/breach_patch_loose', 0, hx, hy, 0.02)) return;
  }
  const r = rng(seed);
  ctx.save(); ctx.translate(L(hx), L(hy)); ctx.rotate((r() - 0.5) * 0.5 + (nailed ? 0 : 0.25));
  rr(-T * 0.55, -T * 0.6, T * 1.1, T * 1.2, 3); ctx.fillStyle = '#8a93a5'; ctx.fill(); stroke(2.2);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;                              // scuffs
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo((r() - 0.5) * T, (r() - 0.5) * T); ctx.lineTo((r() - 0.5) * T, (r() - 0.5) * T); ctx.stroke(); }
  if (nailed) for (const [nx, ny] of [[-0.42, -0.45], [0.4, -0.5], [-0.45, 0.48], [0.38, 0.42], [0.05, -0.52]].slice(0, 4 + Math.floor(r() * 2))) {
    const x = T * (nx + (r() - 0.5) * 0.08), y = T * (ny + (r() - 0.5) * 0.08);
    ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(1);
    if (r() < 0.35) { ctx.strokeStyle = '#c9ced8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 5, y - 3); ctx.stroke(); }   // a bent one
  }
  ctx.restore();
}
function combatFxLocal(x, y, t) {                      // a puff of escaping air (drawn only, not simulated)
  const k = (t * 2) % 1;
  ctx.beginPath(); ctx.arc(x + Math.sin(t * 9) * 6, y + Math.cos(t * 7) * 6, 4 + k * 10, 0, TAU);
  ctx.fillStyle = `rgba(220,235,250,${0.35 * (1 - k)})`; ctx.fill();
}
function drawHazardProps(t) {
  // the vent panels next to the outer airlocks: dark until there's a reason to vent (a fire, spores: ventWanted)
  for (const [id, [vx, vy]] of Object.entries(VENT_PANELS)) {
    const x = L(vx), y = L(vy), live = ventWanted(id), on = hz.vent?.room === id;
    const side = id === 'portLock' ? 'port' : 'star';
    if (spr(`systems/vent_${side}_${on ? 'venting' : live ? `alarm_f${Math.sin(t * 8) > 0 ? 0 : 1}` : 'idle'}`, 0, vx, vy, 0, { emissive: 0.9, pick: [0.25, 0.8] })) {
      if (live) worldText(vx, vy + 0.27, 0, 'VENT', `800 ${T * 0.1}px system-ui, sans-serif`, 'rgba(255,170,150,0.9)', { base: 'top' });
      continue;
    }
    rr(x - 9, y - 12, 18, 24, 3); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(1.5);
    hazardStripe(x - 7, y - 10, 14, 5);
    ctx.beginPath(); ctx.arc(x, y + 3, 4.5, 0, TAU); ctx.fillStyle = on ? '#7ab8ff' : live ? (Math.sin(t * 8) > 0 ? '#ff4a3a' : '#7a1a14') : '#2b303a'; ctx.fill(); stroke(1);
    if (live) { ctx.fillStyle = 'rgba(255,170,150,0.9)'; ctx.font = `800 ${T * 0.1}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText('VENT', x, y + 13); ctx.textAlign = 'left'; }
  }
  // snack machine
  if (!spr('systems/snack', 0, SNACK.x, SNACK.y, 0, { emissive: 0.5, pick: [0.55, 1.5] })) {
    const x = L(SNACK.x), y = L(SNACK.y), w = L(1.1), h = L(0.8);
    shadowEllipse(x + 4, y + 6, w * 0.55, h * 0.5, 0.3);
    rr(x - w / 2, y - h / 2, w, h, 4); ctx.fillStyle = '#b8402e'; ctx.fill(); stroke(2.5);
    rr(x - w / 2 + 4, y - h / 2 + 4, w * 0.62, h - 8, 3); ctx.fillStyle = '#1c2633'; ctx.fill(); stroke(1.2);
    const cols = ['#e8c34f', '#5fd6a0', '#e2574c', '#9b59b6', '#2e7dc9', '#e8c34f'];
    for (let i = 0; i < 6; i++) { ctx.fillStyle = cols[i]; ctx.fillRect(x - w / 2 + 8 + (i % 3) * 10, y - h / 2 + 8 + Math.floor(i / 3) * 12, 7, 8); }
    ctx.fillStyle = '#ffd38a'; ctx.font = `800 ${T * 0.11}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SNAX', x + w * 0.3, y - h * 0.2); ctx.fillStyle = '#c9ced8'; ctx.fillRect(x + w * 0.22, y + 2, 10, 4);
    ctx.textAlign = 'left';
  }
  // gravity breakers that need resetting: a floor plate with a flashing light
  for (const id of hz.noGrav) {
    const [gx, gy] = GRAV_PANELS[id], x = L(gx), y = L(gy);
    if (GFX.on) drawFloatingJunk(id, t);
    if (spr(Math.sin(t * 6) > 0 ? 'systems/grav_on' : 'systems/grav_off', 0, gx, gy, 0, { emissive: 0.9 })) { stencil(x, y + 18, 'NO GRAVITY', 0, 0.16, 'rgba(122,240,255,0.7)'); continue; }
    rr(x - 14, y - 10, 28, 20, 3); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(1.5);
    ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fillStyle = Math.sin(t * 6) > 0 ? '#7af0ff' : '#2a5060'; ctx.fill();
    stencil(x, y + 18, 'NO GRAVITY', 0, 0.16, 'rgba(122,240,255,0.7)');
  }
  // arcing power lines
  for (const id of hz.surges) {
    const l = LINE[id], rnd = rng(Math.floor(t * 12) + id.length * 31);
    for (let i = 0; i < 3; i++) {
      const [x, y] = linePoint(l, rnd()), a = rnd() * TAU, len = 8 + rnd() * 10;
      ctx.strokeStyle = 'rgba(190,235,255,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(L(x), L(y)); ctx.lineTo(L(x) + Math.cos(a) * len * 0.5 + rnd() * 4, L(y) + Math.sin(a) * len * 0.5); ctx.lineTo(L(x) + Math.cos(a) * len, L(y) + Math.sin(a) * len); ctx.stroke();
    }
    const [mx, my] = linePoint(l, 0.5);
    ctx.beginPath(); ctx.arc(L(mx), L(my), 9 + Math.sin(t * 20) * 2, 0, TAU); ctx.strokeStyle = 'rgba(190,235,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  }
  // rattling loose panels on damaged sides
  for (const side of ['port', 'front', 'star']) {
    const n = hz.hull[side];
    if (!n) continue;
    const spots = side === 'port' ? [[0.75, 6.0], [0.75, 17.6], [0.75, 13.0]] : side === 'star' ? [[43.6, 5.6], [43.6, 19.8], [43.6, 13.4]] : [[18.6, -2.2], [25.8, -2.2], [22.2, 0.9]];
    for (const [px, py] of spots.slice(0, n + 1)) {
      const j = Math.sin(t * 37 + px) * 2 + Math.sin(t * 23) * 1.5;
      ctx.save(); ctx.translate(L(px) + j, L(py)); ctx.rotate(0.1 * Math.sin(t * 29 + py));
      rr(-9, -12, 18, 24, 2); ctx.fillStyle = '#6b7486'; ctx.fill(); stroke(1.5);
      ctx.fillStyle = '#2b303a'; ctx.fillRect(-6, -9, 2, 2); ctx.fillRect(4, 7, 2, 2);
      ctx.restore();
    }
  }
}
// Loose bits floating around a room without gravity (fx/junk_*: 8 frames = one turn). Drawing only:
// the same few pieces per room (from its id), drifting and bobbing, tumbling at their own speed.
const JUNK_KINDS = ['bolt', 'wrench', 'shard', 'can', 'cable'];
function drawFloatingJunk(id, t) {
  const room = roomById(id); if (!room) return;
  const r = rng([...id].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) % 9973);
  const area = room.rects.reduce((a, q) => a + q.w * q.h, 0), n = Math.min(7, 2 + Math.floor(area / 12));
  for (let i = 0; i < n; i++) {
    const q = room.rects[Math.floor(r() * room.rects.length)], ph = r() * TAU, spin = (0.4 + r() * 0.8) * (r() < 0.5 ? -1 : 1);
    const x = q.x + 0.6 + r() * Math.max(0, q.w - 1.2) + Math.sin(t * 0.23 + ph) * 0.5, y = q.y + 0.6 + r() * Math.max(0, q.h - 1.2) + Math.cos(t * 0.17 + ph) * 0.4;
    const z = 0.6 + 0.35 * Math.sin(t * 0.7 + ph);
    if (!GFX.sprite(`fx/junk_${JUNK_KINDS[(i + Math.floor(r() * 2)) % JUNK_KINDS.length]}`, Math.floor(t * spin * 2.4 + ph * 4), x, y, z, { scale: 1.4 })) continue;
    ctx.fillStyle = `rgba(0,0,0,${0.32 - z * 0.18})`;   // its shadow on the floor: it floats
    ctx.beginPath(); ctx.ellipse(L(x), L(y), L(0.2), L(0.12), 0, 0, TAU); ctx.fill();
  }
}
// Rooms in vacuum get a cold blue tint; repressurizing ones fog over (tilted view: the back wall's
// face, which rises above the floor rect on screen, too).
function drawVacuumTint() {
  for (const r of ROOMS) {
    const vac = vacuumRoom(r.id), rep = hz.repress?.room === r.id;
    if (!vac && !rep) continue;
    ctx.fillStyle = vac ? 'rgba(80,140,220,0.13)' : `rgba(230,236,244,${0.25 * hz.repress.t / REPRESS_TIME})`;
    const up = GFX.lift(1.6);
    ctx.beginPath(); for (const q of r.rects) ctx.rect(L(q.x), L(q.y - up), L(q.w), L(q.h + up)); ctx.fill();   // (one path: no double tint where rects overlap)
  }
}
