// Spacewalk jobs: limpet mines, spore clouds and barnacles, a jammed cannon track, the radar
// antenna, a fuel canister drifting past, and the jump coils. Run: node tests/eva.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'evs', 'hz', 'mission', 'startMission', 'spawnMineDrone', 'spawnSpores', 'jamCannon', 'knockAntenna',
  'spawnCanister', 'withCrew', 'inv', 'combat', 'CAPACITORS', 'GUNS', 'gunArc', 'radarScan', 'ANTENNA', 'power', 'boarding', 'BARNACLE_GROW', 'MISSIONS', 'JAM_SPOTS'];
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
  check(G.evs.mines.length === n && G.evs.mines.every(m => m.x < 0), `the drone sticks ${n} limpet mine(s) on the left hull`);
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
// --- spores and barnacles
{
  const G = fresh();
  G.spawnSpores('star');
  tickN(G, 60 * 30);
  check(G.evs.barnacles.length >= 1, `spore clouds that reach the hull seed barnacles (${G.evs.barnacles.length})`);
  const b = G.evs.barnacles[0]; b.age = G.BARNACLE_GROW; G.CAPACITORS[2].charge = 3; G.power.reactor.fuel = 0;
  tickN(G, 60 * 11);
  check(G.CAPACITORS[2].charge < 3, 'full grown barnacles drain the capacitor on their side');
  outside(G, b.x + 0.7, b.y);
  const t = holdOn(G, b.x, b.y, () => !G.evs.barnacles.includes(b));
  check(!G.evs.barnacles.includes(b) && Math.abs(t - 3) < 0.3, `scraped off on a spacewalk in 3 s (${t.toFixed(1)} s)`);
}
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
  check(!G3.evs.coils.length, 'the intro run has no jump coils');
}
process.exitCode = failed ? 1 : 0;
