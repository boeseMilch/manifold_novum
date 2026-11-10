// Low frame rates (solo runs a variable step, up to 0.05 s; the multiplayer server always 1/60): what a shot hits and
// where you can walk must not depend on the step. Cannon shells against the grappler's tentacle, leeches, spore clumps
// and mine drones, laser bolts against limpet mines (all used to test only where the shot ended up after the tick, and
// a shell flies 2 units in one at 20 fps), and walking at the thin furniture walls. Run: node tests/lowfps.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'mission', 'startMission', 'combat', 'combatSpawn', 'tentacleBase', 'org', 'evs', 'boarding', 'updateOrganic', 'updateEva',
  'hitGrow', 'SHELL_SPEED', 'BOLT_SPEED', 'HATCHES', 'FURNITURE', 'CREW_R', 'canStand', 'walkRects'];
const DTS = [1 / 60, 1 / 30, 1 / 20], N = 24;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const fresh = () => { const G = loadGame(NAMES); G.startMission('c1'); G.mission.events = []; G.mission.active = false; G.combat.enemies.length = 0; return G; };
const pct = (k) => `${Math.round(100 * k / N)}%`;
// N shots along (ux, uy) through the point (px, py), each starting a different fraction of a step back (so every way the
// steps can fall round the target is tried); `step(G, shot)` runs the game's test for one tick and says whether it hit.
function volley(dt, speed, px, py, ux, uy, setup) {
  let hits = 0;
  const G = fresh();
  for (let i = 0; i < N; i++) {
    G.combat.enemies.length = 0;
    const T = setup(G), back = 3 + (i / N) * speed * dt;
    const s = { x: px - ux * back, y: py - uy * back, vx: ux * speed, vy: uy * speed, life: 1.7 };
    for (let k = 0; k < Math.ceil(7 / (speed * dt)); k++) { s.x += s.vx * dt; s.y += s.vy * dt; if (T.step(s, dt)) { hits++; break; } }
  }
  return hits;
}
// the same hit rate at 60, 30 and 20 fps: every shot through the target's hit circle (`inside`), none past it (`outside`:
// the hit sizes are the ones 60 fps always had, the sweep adds nothing to them)
function sameAtAnyRate(name, speed, inside, outside, setup) {
  const inn = DTS.map(dt => volley(dt, speed, ...inside, setup)), out = DTS.map(dt => volley(dt, speed, ...outside, setup));
  check(inn.every(h => h === N) && out.every(h => h === 0), `${name}: hit at 60 / 30 / 20 fps ${inn.map(pct).join(' / ')}, a near miss ${out.map(pct).join(' / ')}`);
}

// --- the grappler's tentacle (0.35 either side, × the shot's hitGrow): across it, and alongside just in / just out of reach
{
  const setup = (G) => {
    G.combatSpawn('grappler', 'port'); const e = G.combat.enemies[0];
    e.tent = { state: 'attached', t: 0, x: 0.05, y: 10.4, room: 'portGun', acid: 0 };
    return { e, step: (s, dt) => { G.combat.shells = [s]; G.updateOrganic(dt); return e.tent.state !== 'attached'; } };
  };
  const G0 = fresh(), { e } = setup(G0), [bx, by] = G0.tentacleBase(e), mx = (bx + e.tent.x) / 2, my = (by + e.tent.y) / 2;
  const L = Math.hypot(e.tent.x - bx, e.tent.y - by), tx = (e.tent.x - bx) / L, ty = (e.tent.y - by) / L, w = 0.35 * G0.hitGrow({});
  const across = DTS.map(dt => volley(dt, G0.SHELL_SPEED, mx, my, -ty, tx, setup));
  check(across.every(h => h === N), `a shell across the grappler's tentacle cuts it at 60 / 30 / 20 fps: ${across.map(pct).join(' / ')}`);
  // (alongside: through a point beside its middle, flying parallel to it)
  sameAtAnyRate('a shell flying along the tentacle, 0.9 / 1.1 of its width away', G0.SHELL_SPEED, [mx - ty * w * 0.9, my + tx * w * 0.9, tx, ty], [mx - ty * w * 1.1, my + tx * w * 1.1, tx, ty], setup);
}
// --- a leech on its way in (0.85)
{
  const r = 0.85 * 1.1, at = [-8, 10];
  const setup = (G) => {                               // (it flies the shell's way, so how far the shell passes from it stays put)
    const l = { uid: 1, side: 'port', x: at[0], y: at[1], tx: at[0] - 60, ty: at[1], state: 'fly', fed: 0, t: 0 }; G.org.leeches = [l];
    return { step: (s, dt) => { l.x = at[0]; l.y = at[1]; l.t = 0; G.combat.shells = [s]; G.updateOrganic(dt); return !G.org.leeches.length; } };
  };
  sameAtAnyRate('a shell past a flying leech, 0.9 / 1.1 of its size away', 45, [at[0], at[1] + r * 0.9, -1, 0], [at[0], at[1] + r * 1.1, -1, 0], setup);
}
// --- a spore clump (1.5) and a mine drone (0.8)
{
  const sporeAt = [-12, 6];
  const spore = (G) => {
    const h = G.HATCHES.find(q => q.side === 'port'), s0 = { uid: 1, side: 'port', x: sporeAt[0], y: sporeAt[1], sp: 1.5, vx: 0, vy: 0, t: 0, seep: 0 }; G.evs.spores = [s0];
    return { h, step: (s, dt) => { s0.x = sporeAt[0]; s0.y = sporeAt[1]; G.combat.shells = [s]; G.updateEva(dt); return !G.evs.spores.length; } };
  };
  // (the clump drifts towards the airlock: the shell flies along that line, so its distance from the shell's path stays put)
  const G0 = fresh(), h = spore(G0).h, dx = h.x + h.dir * 0.9 - sporeAt[0], dy = h.y - sporeAt[1], d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d, rs = 1.5 * 1.1;
  sameAtAnyRate('a shell past a spore clump, 0.9 / 1.1 of its size away', 45, [sporeAt[0] - uy * rs * 0.9, sporeAt[1] + ux * rs * 0.9, ux, uy], [sporeAt[0] - uy * rs * 1.1, sporeAt[1] + ux * rs * 1.1, ux, uy], spore);
  const droneAt = [-14, 8], rd = 0.8 * 1.1;
  const drone = (G) => {                               // (leaving: it flies straight out along x, like the shell)
    const d0 = { uid: 1, side: 'port', x: droneAt[0], y: droneAt[1], left: 0, spot: null, t: 0, leaving: true }; G.evs.drones = [d0];
    return { step: (s, dt) => { d0.x = droneAt[0]; d0.y = droneAt[1]; G.combat.shells = [s]; G.updateEva(dt); return !G.evs.drones.length; } };
  };
  sameAtAnyRate('a shell past a mine drone, 0.9 / 1.1 of its size away', 45, [droneAt[0], droneAt[1] + rd * 0.9, -1, 0], [droneAt[0], droneAt[1] + rd * 1.1, -1, 0], drone);
}
// --- a laser bolt at a limpet mine (0.4)
{
  const at = [-0.55, 14.6], r = 0.4 * 1.1;
  const mine = (G) => {
    G.evs.mines = [{ uid: 1, side: 'port', x: at[0], y: at[1], t: 30 }];
    return { step: (b, dt) => { b.owner = 'crew'; G.boarding.bolts = [b]; G.updateEva(dt); return !G.evs.mines.length; } };
  };
  sameAtAnyRate('a laser bolt past a limpet mine, 0.9 / 1.1 of its size away', fresh().BOLT_SPEED, [at[0] - r * 0.9, at[1], 0, 1], [at[0] - r * 1.1, at[1], 0, 1], mine);
}

// --- walking: nobody gets through a thin wall at a low frame rate (the toilet stall's are 0.15 thick, a step at 20 fps
// is 0.21 and the body is tested at its corners and middle: one long step put them either side of the wall)
{
  const G0 = fresh(), thin = Object.entries(G0.FURNITURE).filter(([, q]) => Math.min(q.w, q.h) < 2 * G0.CREW_R);
  const through = [], G = fresh(), me = G.me, rects = G.walkRects();
  let walks = 0;
  for (const dt of [1 / 60, 1 / 30, 0.04, 0.045, 0.05]) for (const [name, q] of thin) {
    const alongX = q.w < q.h;                          // (thin in x: walk at it along x)
    for (const dir of [1, -1]) for (let i = 0; i < 40; i++) {
      const start = -dir * (0.25 + G.CREW_R + i * 0.011);   // (a little further back each time: every way the steps can fall)
      const mid = alongX ? [q.x + (dir > 0 ? 0 : q.w) + start, q.y + q.h / 2] : [q.x + q.w / 2, q.y + (dir > 0 ? 0 : q.h) + start];
      if (!G.canStand(mid[0], mid[1], rects)) continue;      // (something else stands there: no run-up from this side)
      Object.assign(me, { mode: 'inside', x: mid[0], y: mid[1], vx: (alongX ? dir : 0) * 4.2, vy: (alongX ? 0 : dir) * 4.2 });   // (already at full speed)
      me.input.keys.clear(); me.input.keys.add(alongX ? (dir > 0 ? 'KeyD' : 'KeyA') : (dir > 0 ? 'KeyS' : 'KeyW'));
      for (let k = 0; k < Math.round(0.5 / dt); k++) G.simTick(dt);
      walks++;
      const far = alongX ? (dir > 0 ? me.x > q.x + q.w : me.x < q.x) : (dir > 0 ? me.y > q.y + q.h : me.y < q.y);
      if (far) through.push(`${name} at ${Math.round(1 / dt)} fps`);
    }
  }
  check(thin.length >= 2 && walks > 200 && !through.length, `walking straight at the ${thin.length} thin furniture walls (${thin.map(([n]) => n).join(', ')}) at 60-20 fps, ${walks} run-ups: nobody gets through${through.length ? ` (through: ${[...new Set(through)].join(', ')}, ${through.length}×)` : ''}`);
}
process.exitCode = failed ? 1 : 0;
