// No spacewalker is ever stranded (js/dockentry.js, 2026-10-23): in every docking situation (nothing docked, one ship at
// either airlock of every kind, chapter 5's base + raider at both at once) a crew member floating just outside each of
// our pods, or off the far side of the hull (the bow), gets back inside our ship through real inputs: floating with WASD
// to a free airlock, or to the docked ship's way in (the raider's canopy / the derelict's viewport / the base's service
// hatch: E for the manual override's three whacks), in through it, and on foot through that ship and its tube into our
// pod. Plus: what forcing each one does, the tube is no way in from space, cast-off with someone in the opening, the
// multiplayer snapshot. Run: node tests/dockentry.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'HATCHES', 'startMission', 'mission', 'roomAt', 'dk', 'dockShip', 'undock', 'DG', 'startRaid', 'raidGeom',
  'dockEntries', 'evaOk', 'dockBlocksEva', 'pointInPoly', 'HULL', 'ui', 'withCrew', 'airlockTube', 'inRect', 'canStand', 'walkRects', 'dockVacuum',
  'netSerialize', 'netApply', 'combat', 'updateRaid', 'boarding'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

// --- the docking situations
const CASES = [{ name: 'nothing docked' }];
for (const side of ['port', 'star']) for (const kind of ['pirate', 'brig', 'derelict', 'base']) CASES.push({ name: `${kind} at the ${side} airlock`, dock: [kind, side] });
for (const side of ['port', 'star']) CASES.push({ name: `chapter 5: the base at the ${side} airlock + the raider at the other`, dock: ['base', side], raid: side === 'port' ? 'star' : 'port' });
function setup(c) {
  const G = loadGame(NAMES); G.startMission('practice'); G.mission.active = false;
  if (c.dock) G.dockShip(c.dock[0] === 'brig' ? 'pirate' : c.dock[0], c.dock[1], c.dock[0] === 'brig' ? { npc: true } : {});
  if (c.raid) G.startRaid(c.raid);
  G.dk.pirates.length = 0; G.dk.boss = null; G.boarding.invaders.length = 0;   // (nobody shooting: this is about the way in)
  G.combat.enemies.length = 0;
  if (G.dk.raid) G.dk.raid.leaveT = 1e9;           // (with its pirates gone it would cast off at once)
  if (G.dk.dock?.s7) for (const T of G.dk.dock.s7.tendrils) { T.state = 'recoil'; T.t = 999; }   // (S-7 asleep: its grabs are tested in tests/dock.js)
  return G;
}

// --- floating: a graph of points round our hull and the docked ships, steered to with WASD
const ok = (G, x, y) => G.evaOk(x, y) && !G.dockBlocksEva(x, y);
const clearSeg = (G, a, b) => {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(2, Math.ceil(d / 0.2)), nx = -(b[1] - a[1]) / (d || 1) * 0.3, ny = (b[0] - a[0]) / (d || 1) * 0.3;
  for (let i = 0; i <= n; i++) { const x = a[0] + (b[0] - a[0]) * i / n, y = a[1] + (b[1] - a[1]) * i / n; if (!ok(G, x, y) || !ok(G, x + nx, y + ny) || !ok(G, x - nx, y - ny)) return false; }
  return true;
};
function evaNodes(G, extra) {
  const pts = [...extra];
  const ring = (poly, off) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 1.5));
      for (let k = 0; k < n; k++) {
        const x = a[0] + (b[0] - a[0]) * k / n, y = a[1] + (b[1] - a[1]) * k / n;
        for (const r of [off, off + 1.2]) for (let j = 0; j < 8; j++) { const t = j / 8 * Math.PI * 2; pts.push([x + Math.cos(t) * r, y + Math.sin(t) * r]); }
      }
    }
  };
  ring(G.HULL, 1.1);
  if (G.dk.dock) { const g = G.DG(); for (const q of [...g.rooms]) ring([[q.x, q.y], [q.x + q.w, q.y], [q.x + q.w, q.y + q.h], [q.x, q.y + q.h]], 1.0); }
  if (G.dk.raid) for (const q of G.raidGeom(G.dk.raid).rooms) ring([[q.x, q.y], [q.x + q.w, q.y], [q.x + q.w, q.y + q.h], [q.x, q.y + q.h]], 1.0);
  const out = [...extra];                          // (the start and the goals always stay)
  for (const p of pts.slice(extra.length)) if (ok(G, ...p) && !out.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.6)) out.push(p);
  return out;
}
function planEva(G, from, goals) {
  const nodes = evaNodes(G, [from, ...goals]), N = nodes.length, dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1), done = new Array(N).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1; for (let i = 0; i < N; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break; done[u] = true;
    if (goals.some(g => g === nodes[u])) { const path = []; for (let k = u; k >= 0; k = prev[k]) path.unshift(nodes[k]); return path; }
    for (let v = 0; v < N; v++) {
      if (done[v]) continue;
      const d = Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1]);
      if (d > 4.5 || dist[u] + d >= dist[v] || !clearSeg(G, nodes[u], nodes[v])) continue;
      dist[v] = dist[u] + d; prev[v] = u;
    }
  }
  return null;
}
// Hold the WASD keys pointing at (tx, ty) for one tick (8 directions; a dead zone so it settles)
function steer(G, tx, ty, dz = 0.12) {
  const me = G.me, k = me.input.keys, dx = tx - me.x, dy = ty - me.y;
  k.delete('KeyA'); k.delete('KeyD'); k.delete('KeyW'); k.delete('KeyS');
  if (Math.abs(dx) > dz) k.add(dx > 0 ? 'KeyD' : 'KeyA');
  if (Math.abs(dy) > dz) k.add(dy > 0 ? 'KeyS' : 'KeyW');
}
const release = (G) => G.me.input.keys.clear();
// Follow points (on a spacewalk or on foot) until each is reached (within r); false if it gets stuck
function follow(G, pts, r = 0.45, max = 60, mode = null) {
  let t = 0;
  for (const p of pts) {
    while (Math.hypot(p[0] - G.me.x, p[1] - G.me.y) > r) {
      steer(G, p[0], p[1]); G.simTick(DT); t += DT;
      if (mode && G.me.mode !== mode) { release(G); return true; }
      if (t > max) { release(G); return false; }
    }
  }
  release(G); return true;
}
const aboard = (G) => G.me.mode === 'inside' && ['portLock', 'starLock'].includes(G.roomAt(G.me.x, G.me.y)?.id);
// Back in from (x, y) on a spacewalk: the nearest free pod or way in, by floating there and going through
function getBackIn(G, start) {
  const me = G.me; Object.assign(me, { mode: 'eva', x: start[0], y: start[1], vx: 0, vy: 0, health: 'ok' });
  const free = G.HATCHES.filter(h => !G.airlockTube(h)), entries = G.dockEntries();
  const goals = [...free.map(h => h.outside), ...entries.map(e => e.outside)];
  const path = planEva(G, start, goals);
  if (!path) return { ok: false, why: 'no route' };
  if (!follow(G, path.slice(1), 0.45, 90)) return { ok: false, why: `stuck floating at ${me.x.toFixed(1)},${me.y.toFixed(1)}` };
  const end = path[path.length - 1], h = free.find(h => h.outside === end), e = entries.find(e => e.outside === end);
  let via;
  if (h) {                                         // our own airlock: push in at the hatch, through the chamber, into the room
    via = `the ${h.side} airlock`;
    const inKey = h.dir < 0 ? 'KeyD' : 'KeyA';
    follow(G, [h.outside], 0.15, 8);                  // (line up with the hatch)
    let t = 0;                                     // (push at it, keeping in line with the door: it cycles to you, in, through)
    while (!aboard(G) && t < 15) { if (me.mode === 'eva') steer(G, h.x - h.dir, h.y, 0.08); else steer(G, h.inside[0], h.inside[1], 0.08); G.simTick(DT); t += DT; }
    release(G);
  } else {                                         // the docked ship's way in: force it (E: three whacks), in, through to us
    via = `${e.spec.what}`;
    if (e.ref.entry !== 'open' && !(e.ref.entryT > 0)) {
      me.input.pressed.add('KeyE'); G.simTick(DT);
      for (let i = 0; i < 40 && G.withCrew(me, () => G.ui.panel) === 'override'; i++) { me.input.keys.add('KeyE'); G.simTick(DT); me.input.keys.delete('KeyE'); for (let k = 0; k < 45; k++) G.simTick(DT); }
    }
    const inKey = e.out < 0 ? 'KeyS' : 'KeyW';
    follow(G, [[e.cx, e.face + e.out * 0.45]], 0.2, 8);
    let t = 0; me.input.keys.add(inKey);
    while (me.mode === 'eva' && t < 6) { G.simTick(DT); t += DT; }
    release(G);
    if (me.mode !== 'inside') return { ok: false, why: `couldn't get in through ${via} (${me.x.toFixed(1)},${me.y.toFixed(1)})` };
    const hh = G.HATCHES.find(q => q.side === e.side), c = hh.chamber;
    const way = [e.inside, [e.cx, hh.y], [(hh.x + e.cx) / 2, hh.y], [hh.outer.x + hh.outer.w / 2, hh.y], [c.x + c.w / 2, hh.y], [hh.inner.x + hh.inner.w / 2, hh.y], hh.inside];
    follow(G, way, 0.3, 40);
  }
  return { ok: aboard(G), via, why: aboard(G) ? '' : `ended at ${me.x.toFixed(1)},${me.y.toFixed(1)} (${me.mode})` };
}

// --- the matrix
for (const c of CASES) {
  for (const [label, at] of [['outside the left pod', (G) => G.HATCHES[0].outside], ['outside the right pod', (G) => G.HATCHES[1].outside], ['off the bow', () => [22.2, -6.2]]]) {
    const G = setup(c), start = at(G);
    if (!G.evaOk(...start)) { const r = { ok: false, why: 'start spot not floatable' }; check(r.ok, `${c.name}, from ${label}: ${r.why}`); continue; }
    const r = getBackIn(G, start);
    check(r.ok, `${c.name}, from ${label}: back aboard through ${r.via || '?'}${r.ok ? '' : ` — ${r.why}`}`);
  }
}

// --- the tube is no way in from space
{
  const G = setup(CASES.find(c => c.dock?.[0] === 'pirate' && c.dock[1] === 'port')), h = G.HATCHES[0], me = G.me;
  Object.assign(me, { mode: 'eva', x: h.x - 2.5, y: h.y - 1.0, vx: 0, vy: 0 });
  me.input.keys.add('KeyS'); for (let i = 0; i < 120; i++) G.simTick(DT); me.input.keys.clear();
  Object.assign(me, { x: h.outside[0], y: h.outside[1], vx: 0, vy: 0 });
  me.input.keys.add('KeyD'); for (let i = 0; i < 120; i++) G.simTick(DT); me.input.keys.clear();
  check(me.mode === 'eva', 'over a docked ship\'s tube, pushing at it or at our hatch under it: still on the spacewalk (no way in there)');
  G.simTick(DT);
  check(/canopy/.test(me.prompt?.text || ''), `the prompt at our blocked airlock says where to get in ("${me.prompt?.text}")`);
}

// --- what forcing each does
{
  const G = setup(CASES.find(c => c.dock?.[0] === 'pirate' && c.dock[1] === 'port')), e = G.dockEntries()[0], h = G.HATCHES[0];
  G.dk.pirates.push({ uid: 777, x: G.DG().rooms[1].x + 2, y: G.DG().y, face: 0, walk: 0, hp: 3, carry: null, state: 'steal', cd: 9, aim: 0, route: [], stuck: 0, stun: 0, flash: 0 });
  check(G.airlockTube(h) === 'air', 'a docked raider: its tube has air (our pod is a plain passage)');
  const r = getBackIn(G, e.outside);
  const p = G.dk.pirates.find(p => p.uid === 777);
  check(r.ok && G.dk.dock.entry === 'open' && G.airlockTube(h) === 'vacuum' && G.dockVacuum(G.DG().rooms[0].x + 1, G.DG().y), 'smashing its canopy vents the raider: airless inside and in the tube (our pod cycles now)');
  check(!p || p.hp < 3, 'its crew aboard get thrown about (a hit, stunned)');
}
{
  const G = setup(CASES.find(c => c.dock?.[0] === 'base' && c.dock[1] === 'port')), e = G.dockEntries()[0];
  const r = getBackIn(G, e.outside);
  check(r.ok && G.airlockTube(G.HATCHES[0]) === 'air', 'the base\'s service hatch: cranked open, through, and the base keeps its air');
  for (let i = 0; i < 60 * 8; i++) G.simTick(DT);
  check(!(e.ref.entryT > 0), 'the service hatch swings shut again behind you');
}
// --- cast off with someone in the smashed cockpit: cast adrift
{
  const G = setup(CASES.find(c => c.dock?.[0] === 'pirate' && c.dock[1] === 'star')), e = G.dockEntries()[0], me = G.me;
  e.ref.entry = 'open';
  Object.assign(me, { mode: 'inside', x: e.cx, y: (e.slot.y + e.slot.h / 2), vx: 0, vy: 0 });
  G.undock(); G.simTick(DT);
  check(me.mode === 'eva', 'the raider casts off with you in its cockpit: you\'re cast adrift (spacewalk back in)');
}
// --- multiplayer: the opened way in is in the snapshot
{
  const G = setup(CASES.find(c => c.dock?.[0] === 'derelict' && c.dock[1] === 'port'));
  G.dk.dock.entry = 'open';
  const H = loadGame(NAMES); H.startMission('practice');
  H.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(H.dk.dock.entry === 'open' && H.walkRects().some(q => q === H.dockEntries()[0].slot || (Math.abs(q.x - H.dockEntries()[0].slot.x) < 1e-6 && Math.abs(q.y - H.dockEntries()[0].slot.y) < 1e-6)), 'a client sees the derelict\'s viewport open (and can walk through it)');
}

console.log(failed ? `\n${failed} FAILED` : '\nall dock-entry checks passed');
process.exit(failed ? 1 : 0);
