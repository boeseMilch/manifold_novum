// Spacewalk jobs: limpet mines, spore clouds (shot on the way in), a jammed cannon track, the radar
// antenna, a fuel canister drifting past, and the jump coils. Run: node tests/eva.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'evs', 'hz', 'mission', 'startMission', 'spawnMineDrone', 'spawnSpores', 'jamCannon', 'knockAntenna',
  'spawnCanister', 'withCrew', 'inv', 'combat', 'CAPACITORS', 'GUNS', 'gunArc', 'radarScan', 'ANTENNA', 'power', 'boarding', 'MISSIONS', 'JAM_SPOTS', 'pointInPoly', 'distToPoly',
  'evaOk', 'evaReach', 'EVA_REACH', 'HATCHES', 'HULL', 'dk', 'dockGeom', 'SHIP_W'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
function holdOn(G, x, y, done, max = 20) {
  const m = G.me.input.mouse; m.wx = x; m.wy = y; m.down = true; let t = 0;
  while (!done() && t < max) { G.simTick(DT); t += DT; }
  m.down = false; return t;
}
const outside = (G, x, y) => { const me = G.me; me.mode = 'eva'; me.x = x; me.y = y; me.vx = me.vy = 0; };
const fresh = (rules = {}) => { const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false; Object.assign(G.mission.rules, rules); return G; };

// --- limpet mines
{
  const G = fresh();
  G.spawnMineDrone('port');
  const n = G.evs.drones[0].left;
  tickN(G, 60 * 12);
  check(n === 3 && G.evs.mines.length === n && G.evs.mines.every(m => m.x < 0), `the drone sticks ${n} limpet mines on the left hull (always 3)`);
  const m = G.evs.mines[0];
  outside(G, m.x - 0.7, m.y);
  const t = holdOn(G, m.x, m.y, () => !G.evs.mines.includes(m));
  check(!G.evs.mines.includes(m) && Math.abs(t - 4) < 0.3, `pried off by hand on a spacewalk in 4 s (${t.toFixed(1)} s)`);
  G.withCrew(G.me, () => { G.inv.weapon = 'repair'; });
  if (G.evs.mines.length) {
    const m2 = G.evs.mines[0]; outside(G, m2.x - 0.7, m2.y);
    const t2 = holdOn(G, m2.x, m2.y, () => !G.evs.mines.includes(m2));
    check(Math.abs(t2 - 2) < 0.3, `with the repair kit (its wrench) it takes 2 s (${t2.toFixed(1)} s)`);
  }
}
{
  const G = fresh({ breach: true });
  G.evs.mines.push({ uid: 99, side: 'star', x: 44.95, y: 18.8, t: 0.5 });
  const large0 = G.combat.hits.large;
  tickN(G, 60);
  check(!G.evs.mines.length && G.combat.hits.large === large0 + 1 && G.hz.breaches.some(b => b.room === 'starLock'), 'a mine left alone blows a hull breach');
}
{
  const G = fresh();
  G.evs.mines.push({ uid: 98, side: 'port', x: -0.55, y: 16.8, t: 25 });
  outside(G, -2.6, 16.8); G.withCrew(G.me, () => { G.inv.weapon = 'laser'; });
  const m = G.me.input.mouse; m.wx = -0.55; m.wy = 16.8; m.rightClick = true; tickN(G, 30);
  check(!G.evs.mines.length && G.combat.hits.large === 0, 'shooting a mine with the laser blows it early, as a small hit');
}
// --- spore clouds: they head for the airlock and get inside (tests/spores.js); a cannon shell still bursts one on the way
{
  const G = fresh();
  G.spawnSpores('port'); const s = G.evs.spores[0];
  G.combat.shells.push({ x: s.x + 0.5, y: s.y, vx: 0, vy: 0, life: 1 });
  G.simTick(DT);
  check(!G.evs.spores.includes(s), 'a cannon shell bursts a spore cloud');
}
// --- jammed track, antenna, canister
{
  const G = fresh();
  const g = G.GUNS.find(g => g.id === 'port'), full = G.gunArc(g);
  G.jamCannon('port');
  check(Math.abs(G.gunArc(g) - full / 2) < 1e-9, 'debris in the track halves a cannon\'s arc');
  const [jx, jy] = G.JAM_SPOTS.port; outside(G, jx, jy + 1.2);
  holdOn(G, jx, jy, () => !G.evs.jams.port);
  check(!G.evs.jams.port && G.gunArc(g) === full, 'pulling the debris out on a spacewalk frees it');
}
{
  // every track's debris can be reached on a real spacewalk: steer (WASD) from outside the hull up to it
  const starts = { port: [-1.1, 19.2], star: [46.1, 19.4], front: [24.0, -7.0] };
  for (const id of ['port', 'star', 'front']) {
    const G = fresh(); G.jamCannon(id);
    const [jx, jy] = G.JAM_SPOTS[id], keys = G.me.input.keys;
    outside(G, ...starts[id]);
    for (let i = 0; i < 60 * 20 && Math.hypot(G.me.x - jx, G.me.y - jy) > 0.4; i++) {
      keys.clear();
      if (G.me.x < jx - 0.1) keys.add('KeyD'); else if (G.me.x > jx + 0.1) keys.add('KeyA');
      if (G.me.y < jy - 0.1) keys.add('KeyS'); else if (G.me.y > jy + 0.1) keys.add('KeyW');
      G.simTick(DT);
    }
    keys.clear(); tickN(G, 30);
    holdOn(G, jx, jy, () => !G.evs.jams[id]);
    check(G.me.mode === 'eva' && !G.evs.jams[id], `the ${id} track's debris can be reached and pulled out on a spacewalk (from ${G.me.x.toFixed(1)}, ${G.me.y.toFixed(1)})`);
  }
}
{
  const G = fresh(); G.mission.active = true;
  G.knockAntenna(); G.radarScan();
  check(!G.mission.revealed.size, 'with the antenna crooked, radar scans come back garbled');
  outside(G, G.ANTENNA.x, G.ANTENNA.y - 1.2);
  holdOn(G, G.ANTENNA.x, G.ANTENNA.y, () => G.evs.antenna);
  check(G.evs.antenna, 'straightening it on a spacewalk fixes the radar');
}
{
  const G = fresh();
  G.spawnCanister('port'); tickN(G, 60 * 10);
  const c = G.evs.canister; outside(G, c.x - 0.6, c.y);
  const m = G.me.input.mouse; m.wx = c.x; m.wy = c.y; m.click = true; G.simTick(DT);
  check(G.me.inv.item === 'fuel' && !G.evs.canister, 'the fuel canister drifting past can be grabbed on a spacewalk (a spare fuel cell)');
}
// --- jump coils
{
  const G = fresh(); G.startMission('deep');
  check(G.evs.coils.length === 3 && G.evs.coils.every(c => !c.ok), 'harder missions start with 3 misaligned jump coils');
  const at0 = G.mission.jumpAt; G.mission.t = at0; G.mission.active = true; G.simTick(DT);
  check(Math.abs(G.mission.jumpAt - at0 - 45) < 0.1, `each misaligned coil delays the jump by 15 s (+${(G.mission.jumpAt - at0).toFixed(0)} s)`);
  const G2 = fresh(); G2.startMission('deep'); G2.mission.active = false;
  const c = G2.evs.coils[0]; const me = G2.me; me.mode = 'eva'; me.x = c.x - 0.8; me.y = c.y; me.vx = me.vy = 0;
  const m = me.input.mouse; m.wx = c.x; m.wy = c.y; m.down = true; tickN(G2, 60 * 3.2); m.down = false;
  check(c.ok, 'a spacewalker aligns a coil in 3 s');
  const G3 = fresh(); G3.startMission('intro');
  check(G3.evs.coils.length === 3 && G3.evs.coils.every(c => c.ok), 'the intro run has the jump coils too, all aligned (no coils rule)');
}
// --- how far you may float: no wall near the hull; a soft edge that keeps the ship on screen
{
  // the outside camera (0.75 × the room zoom) shows at least 19/0.75 × 13/0.75 units, whatever the window's shape
  const halfW = 19 / 0.75 / 2, halfH = 13 / 0.75 / 2;
  const nearest = (G, x, y) => {                       // per-axis offset to the hull's nearest point (screen-wise)
    let best = Infinity, off = [0, 0];
    for (let i = 0, j = G.HULL.length - 1; i < G.HULL.length; j = i++) {
      const [ax, ay] = G.HULL[j], [bx, by] = G.HULL[i];
      for (let k = 0; k <= 20; k++) {
        const px = ax + (bx - ax) * k / 20, py = ay + (by - ay) * k / 20, d = Math.max(Math.abs(px - x) / halfW, Math.abs(py - y) / halfH);
        if (d < best) { best = d; off = [Math.abs(px - x), Math.abs(py - y)]; }
      }
    }
    return off;
  };
  for (const [dir, key, x0, y0] of [['left', 'KeyA', -1.1, 19.2], ['right', 'KeyD', 45.5, 19.4], ['up', 'KeyW', 22, -4], ['down', 'KeyS', 22, 27]]) {
    const G = fresh(); outside(G, x0, y0);
    const keys = G.me.input.keys; keys.add(key); tickN(G, 60 * 15);
    const far = G.distToPoly(G.me.x, G.me.y), e = G.evaReach(G.me.x, G.me.y).e, sp = Math.hypot(G.me.vx, G.me.vy);
    const [ox, oy] = nearest(G, G.me.x, G.me.y);
    check(far > 5 && e < 1 && sp < 0.2 && ox < halfW - 1.5 && oy < halfH - 1.5,
      `floating ${dir}: you get ${far.toFixed(1)} units off the hull (was 2.8), then slow to a stop with the hull still well on screen (${ox.toFixed(1)}/${oy.toFixed(1)} of ${halfW.toFixed(1)}/${halfH.toFixed(1)})`);
    keys.clear(); const e1 = e; tickN(G, 60 * 4);
    check(G.evaReach(G.me.x, G.me.y).e < e1 - 0.02, `let go out there (${dir}): you drift gently back towards the ship`);
  }
  const G = fresh();
  check(G.evaOk(-1.1, 19.2) && G.evaOk(-8, 19.2) && G.evaOk(22, -9) && !G.evaOk(-14, 19.2) && !G.evaOk(22, -14) && !G.evaOk(20, 10),
    'evaOk: far wider than before, still not inside the hull nor off past the screen edge');
  // a docked ship's rooms: you can't float through them, and someone it docks onto can float out
  G.dk.dock = { kind: 'pirates', side: 'port', doors: [true, true], tube: 'docked' };
  const g = G.dockGeom('port'), room = g.rooms[0]; outside(G, -3, g.y - 1.5); G.me.input.keys.add('KeyA'); tickN(G, 60 * 6);
  check(G.me.x > room.x + room.w + 0.15, `floating at a docked ship you can't drift into its rooms (stopped at x ${G.me.x.toFixed(2)}, its wall at ${(room.x + room.w).toFixed(1)})`);
  G.me.input.keys.clear(); outside(G, -7, g.y + 1.5); G.me.input.keys.add('KeyD'); tickN(G, 60 * 3);
  check(G.me.x > -5.2, 'caught in its way when it docks: you can float out');
}
process.exitCode = failed ? 1 : 0;
