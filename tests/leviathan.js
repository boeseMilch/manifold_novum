// Chapter 8's final boss, the infested leviathan (js/leviathan.js): the pass (fin, left zones, right zones), the toxic
// gas, the side windows (eye + glowing zones, punishments), behind (brood, MID, the engine override), freed → the jump.
// Run: node tests/leviathan.js
const { loadGame } = require('./harness');
const NAMES = ['org', 'startLevBoss', 'levChain', 'levSpotAt', 'levTargets', 'levStationFor', 'levClickTarget', 'combat', 'simTick', 'crew', 'me', 'makeCrew', 'CAPACITORS',
  'mission', 'startMission', 'withCrew', 'boarding', 'GUNS', 'hz', 'SYSTEMS', 'power', 'LEVB_PANEL', 'LEVB_NEED', 'LEVB_WINDOW', 'LEVB_SINK', 'LEVB_VENTS', 'LEVB_LEECHES', 'netSerialize', 'netApply',
  'MISSIONS', 'GFX', 'clickTarget', 'roomAt', 'combatClear', 'enc', 'evs', 'dk', 'fireCannon', 'gunArc', 'SHELL_SPEED', 'LEVB_LOOP', 'SHIP_W'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const B = (G) => G.org.boss;
// A calm game: practice (no timeline, no jump), the reactor off, the crew safe inside on the bridge.
function fresh(n = 1, id = 'practice') {
  const G = loadGame(NAMES);
  while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
  G.startMission(id); G.power.reactor.fuel = 0; G.power.reserve = 0;
  G.crew.forEach((c, i) => Object.assign(c, { mode: 'inside', x: 20 + i, y: 6, vx: 0, vy: 0 }));
  return G;
}
const tick = (G, s, each) => { for (let i = 0; i < Math.round(s * 60); i++) { each?.(); G.simTick(DT); } };
const keepSafe = (G) => { for (const c of G.crew) if (c.mode === 'inside') c.health = 'ok'; G.SYSTEMS.forEach(s => { s.broken = false; }); G.hz.breaches = []; };
function parked(G, max = 60) { let s = 0; while (B(G) && !B(G).parked && s < max) { G.simTick(DT); keepSafe(G); s += DT; } return s; }
// A cannon shell right through a target (where the creature shows it now).
function shoot(G, id) {
  const p = G.levSpotAt(G.levChain(B(G)), id);
  G.combat.shells.push({ x: p.wx - 0.2, y: p.wy, z: 0, vx: 12, vy: 0, life: 1 }); G.simTick(DT);
}
const inView = (G, gun, id) => {           // the target is inside that cannon's camera frame
  const p = G.levSpotAt(G.levChain(B(G)), id), g = G.GUNS.find(q => q.id === gun), [cx, cy, w] = g.view;
  return Math.abs(p.wx - cx) < w / 2 && Math.abs(p.wy - cy) < w * 0.62 / 2;
};

// --- phase 1: the fin (front cannon), the left zones (left cannon), the right zones; it moves on when a side is clean
{
  const G = fresh(1); G.startLevBoss(1);
  parked(G);
  check(B(G).step === 'fin' && G.levTargets(B(G)).join() === 'fin' && inView(G, 'front', 'fin'), 'it crosses the bow and parks with its fin in the front cannon\'s view');
  const s0 = B(G).s; shoot(G, 'fin');
  check(B(G).fin === 1 && B(G).s === s0, 'one hit on the fin: it stays (1/2)');
  shoot(G, 'fin');
  check(B(G).step === 'left' && !B(G).parked, 'two hits: it swims on, down the left flank');
  parked(G);
  const L = G.levTargets(B(G));
  check(L.length === 2 && L.every(id => id[0] === 'L' && inView(G, 'port', id)), `solo: 2 infested zones on the left, in the left cannon's view (${L.join(', ')})`);
  for (const id of L) { shoot(G, id); shoot(G, id); }
  check(B(G).step === 'right', 'left flank clean (2 hits each): round to the right');
  parked(G);
  const R = G.levTargets(B(G));
  check(R.length === 2 && R.every(id => id[0] === 'R' && inView(G, 'star', id)), `the right flank's zones, in the right cannon's view (${R.join(', ')})`);
  shoot(G, R[0]);
  check(B(G).zones.find(z => z.id === R[0]).hp === 1 && B(G).step === 'right', 'a zone takes two hits');
  for (const id of R) while (B(G).zones.find(z => z.id === id).hp > 0) shoot(G, id);
  check(B(G).phase === 'gas' && B(G).gas.warn > 9, 'right flank clean: TOXIC GAS in 10 s');
  const G3 = fresh(3); G3.startLevBoss(1);
  check(B(G3).zones.filter(z => z.side === 'port').length === 3, '3 players: 3 zones per side');
}
// --- the order round the ship (2026-10-17, the user: "it constantly swims left and right"): front → left → right, the gas,
// left → right, behind, each stop reached by swimming on round the loop less than once (no extra laps on the way)
{
  const G = fresh(1); G.startLevBoss(1);
  const stops = [], P = G.LEVB_LOOP.P; let swims = [], from = B(G).s, t = 0;
  while (B(G) && B(G).phase !== 'blast' && t < 400) {
    keepSafe(G); G.org.leeches = [];
    const b = B(G);
    if (b.parked && (stops.at(-1)?.s !== b.s || stops.at(-1)?.phase !== b.phase)) {
      stops.push({ s: b.s, phase: b.phase, where: b.phase === 'p3' ? b.p3.side : b.where }); swims.push(b.s - from); from = b.s;
      if (b.phase === 'p4') break;
      for (const id of G.levTargets(b)) while (B(G).phase === b.phase && G.levTargets(B(G)).includes(id)) shoot(G, id);
    }
    G.simTick(DT); t += DT;
  }
  const seq = stops.map(q => `${q.phase === 'gas' ? 'gas' : q.where}`).join(' → ');
  check(seq === 'front → port → star → gas → port → star → behind', `a scripted win goes front → left → right, the gas, left → right, behind (${seq})`);
  check(swims.every(d => d < P), `each move is less than one lap round the ship (${swims.map(d => d.toFixed(0)).join(', ')} of ${P.toFixed(0)})`);
  check(swims.at(-1) < 15, `from the right side (phase 3) it settles behind with a short glide, not another lap (${swims.at(-1).toFixed(1)})`);
}
// --- every weak spot, at every stop, can be hit by that side's cannon: aimed at it (within the cannon's arc), fired for real,
// several times while it sways; a shell that splats on its back first doesn't count
for (const n of [1, 3]) {
  const G = fresh(n); G.startLevBoss(1);
  const gunFor = { fin: 'front', left: 'port', right: 'star', port: 'port', star: 'star' }, bad = [], seen = [];
  const state = () => JSON.stringify([B(G).fin, B(G).zones.map(z => z.hp), B(G).p3?.eye, B(G).p3?.glow]);
  for (let guard = 0; guard < 12 && B(G) && B(G).phase !== 'p4'; guard++) {
    parked(G, 90);
    const b = B(G);
    if (b.phase === 'gas') { while (B(G).phase === 'gas') G.simTick(DT); continue; }
    const step = b.phase === 'p3' ? b.p3.side : b.step, g = G.GUNS.find(q => q.id === gunFor[step]);
    for (const id of G.levTargets(b)) {
      seen.push(`${step}:${id}`);
      for (let k = 0; k < 4; k++) {
        tick(G, 0.4, () => keepSafe(G));
        if (b.p3?.state === 'open') b.p3.win = 10;
        const save = JSON.parse(JSON.stringify({ fin: b.fin, zones: b.zones, p3: b.p3, phase: b.phase, step: b.step, sTo: b.sTo, parked: b.parked, gas: b.gas }));
        const p = G.levSpotAt(G.levChain(b), id), want = Math.atan2(p.wy - g.y, p.wx - g.x), d = Math.atan2(Math.sin(want - g.a), Math.cos(want - g.a)), arc = G.gunArc(g);
        g.aim = g.a + Math.max(-arc, Math.min(arc, d)); g.cd = 0; g.shots = 3; g.reload = 0;
        const s0 = state(); G.fireCannon(g); let hit = false;
        for (let i = 0; i < 100 && G.combat.shells.length; i++) { G.simTick(DT); if (state() !== s0) { hit = true; break; } }
        G.combat.shells = []; Object.assign(b, save);
        if (!hit || Math.abs(d) > arc) { bad.push(`${step}:${id}`); break; }
      }
    }
    for (const id of G.levTargets(B(G))) while (G.levTargets(B(G)).includes(id)) shoot(G, id);
  }
  check(!bad.length && seen.length === 1 + 2 * B(G).nz + 6, `${n} player(s): all ${seen.length} weak spots hit by their side's cannon, aimed and fired (${bad.length ? 'missed: ' + bad.join(', ') : seen.join(' ')})`);
}
// --- phase 1's zones count as soon as they're out on their side, while it's still swimming into place
{
  const G = fresh(1); G.startLevBoss(2); B(G).phase = 'p1'; B(G).gas = null; B(G).step = 'right'; B(G).parked = false;
  for (const z of B(G).zones) if (z.side === 'star') z.hp = 2;
  B(G).s = 140; B(G).sTo = G.levStationFor(B(G), 'right') + G.LEVB_LOOP.P; B(G).out = 0; B(G).arrive = false;
  let early = null; for (let i = 0; i < 60 * 20 && !early; i++) { G.simTick(DT); keepSafe(G); if (!B(G).parked && G.levTargets(B(G)).length) early = G.levTargets(B(G))[0]; }
  check(early && G.levSpotAt(G.levChain(B(G)), early).wx > G.SHIP_W && inView(G, 'star', early), `swimming up the right flank: its zones count once they're off the right side, in the right cannon's view (${early})`);
  if (early) { shoot(G, early); check(B(G).zones.find(z => z.id === early).hp === 1 && !B(G).parked, 'a hit there counts before it has parked'); }
  check(G.levTargets({ ...B(G), s: 150, parked: false }).length === 0, 'but not while they\'re still behind the ship');
}
// --- tail flicks while it passes: a warning on a room's floor, then a bump
{
  const G = fresh(1); G.startLevBoss(1); parked(G);
  let warned = 0, hits0 = G.combat.hits.small; tick(G, 26, () => { if (B(G).flick.room) warned++; });
  check(warned >= 60 * 3.5 && G.combat.shake >= 0 && G.combat.hits.small + G.combat.hits.large >= hits0, `a tail flick every ~25 s, warned ${(warned / 60).toFixed(1)} s ahead on that room's floor`);
}
// --- phase 2: the gas downs whoever is outside (spacewalk, cannon seat), not inside; downed crew are treated as usual after
{
  const G = fresh(3); G.startLevBoss(3); B(G).phase = 'gas'; B(G).gas = { warn: 10, t: 15 }; B(G).p3 = null;
  const [a, b, c] = G.crew;
  Object.assign(a, { mode: 'eva', x: -2, y: 12 }); Object.assign(b, { mode: 'gun', gun: G.GUNS[1], x: G.GUNS[1].x, y: G.GUNS[1].y }); Object.assign(c, { mode: 'inside', x: 22, y: 6 });
  tick(G, 9);
  check(a.health === 'ok' && b.health === 'ok', 'T-10: nobody is hurt during the countdown');
  tick(G, 1.5);
  check(a.health === 'down' && b.health === 'down' && c.health === 'ok' && b.mode === 'gun' && a.mode === 'eva', 'the gas arrives: the spacewalker and the gunner go down where they are, the one inside is fine');
  Object.assign(c, { mode: 'eva', x: -2, y: 14 }); tick(G, 0.2);
  check(c.health === 'down', 'going outside during the gas: down too');
  tick(G, 15);
  check(B(G).phase === 'p3', 'after 15 s the gas clears: phase 3');
}
// --- phase 3: the window; too slow → leeches, then a tail slam (alternating); in time → the other side; both → behind
{
  const G = fresh(1); G.startLevBoss(3); const side = B(G).p3.side;
  parked(G);
  const T0 = G.levTargets(B(G));
  check(B(G).p3.state === 'open' && T0.includes('eye') && T0.length === 3 && T0.every(id => inView(G, side === 'port' ? 'port' : 'star', id)) && Math.abs(B(G).p3.win - G.LEVB_WINDOW[0]) < 0.1,
        `it parks on the ${side} side, its eye opens: the eye + 2 glowing zones in that cannon's view, ${G.LEVB_WINDOW[0]} s`);
  tick(G, G.LEVB_WINDOW[0] + 0.1, () => keepSafe(G));
  check(B(G).p3.state === 'punish' && G.org.leeches.length === G.LEVB_LEECHES[0] && G.org.leeches[0].side === side, `too slow: a leech swarm on that side (${G.LEVB_LEECHES[0]} solo)`);
  tick(G, 6.2, () => keepSafe(G)); G.org.leeches = [];
  check(B(G).p3.state === 'open', 'then a new window');
  const large0 = G.combat.hits.large; tick(G, G.LEVB_WINDOW[0] + 3.5, () => keepSafe(G));
  check(G.combat.hits.large > large0, 'too slow again: a tail slam (a big hit on that side)');
  tick(G, 4, () => keepSafe(G));
  for (const id of G.levTargets(B(G))) shoot(G, id);
  const other = side === 'port' ? 'star' : 'port';
  check(B(G).p3.side === other && B(G).p3.state === 'swim' && B(G).p3.done.includes(side), 'eye + zones in time: it flinches and swims to the other side');
  parked(G);
  check(G.levTargets(B(G)).every(id => inView(G, other, id)), `it parks on the ${other} side: the eye + zones in the ${other === 'port' ? 'left' : 'right'} cannon's view`);
  for (const id of G.levTargets(B(G))) shoot(G, id);
  check(B(G).phase === 'p4', 'both sides done: it heads behind us');
  // the swarm grows with the crew; a swarm still on the hull: the next miss is a slam, never a second swarm
  const F = fresh(4); F.startLevBoss(3); parked(F);
  tick(F, F.LEVB_WINDOW[0] + 0.1, () => keepSafe(F));
  check(F.org.leeches.length === F.LEVB_LEECHES[3], `4 players: ${F.LEVB_LEECHES[3]} leeches`);
  B(F).p3.fails = 2; const n0 = F.org.leeches.length, l0 = F.combat.hits.large;
  tick(F, 6.2 + F.LEVB_WINDOW[0] + 3.5, () => keepSafe(F));
  check(F.org.leeches.length <= n0 && F.combat.hits.large > l0, 'leeches still on the hull: the next miss is a tail slam, not another swarm');
  const E = fresh(1); E.mission.easy = 2; E.startLevBoss(3); parked(E);
  check(Math.abs(B(E).p3.win - 20) < 0.1, 'very easy: a 20 s window');
}
// --- phase 4: the brood drains MID; the override is refused below 3, works at 3; freed → it sinks, the jump spools
{
  const G = fresh(1, 'c8'); G.mission.events = []; G.combatClear();
  G.startLevBoss(4); parked(G, 90);
  check(B(G).phase === 'p4' && B(G).parked && B(G).where === 'behind', 'phase 4: it settles behind the ship');
  const cap = G.CAPACITORS[1]; cap.charge = 2;
  tick(G, 6);
  check(B(G).brood.length >= 2, `a wave of brood crawls in through the vents (${B(G).brood.length} so far)`);
  let drained = false; for (let i = 0; i < 60 * 25 && !drained; i++) { G.simTick(DT); keepSafe(G); if (cap.charge < 2) drained = true; }
  check(drained, 'a crawler that reaches the middle capacitor drains it');
  // the override panel
  const me = G.me; Object.assign(me, { mode: 'inside', x: G.LEVB_PANEL.x, y: G.LEVB_PANEL.y - 0.8, health: 'ok' });
  cap.charge = 2;
  const no = G.withCrew(me, () => G.clickTarget(G.LEVB_PANEL.x, G.LEVB_PANEL.y));
  check(no && !no.ok && /needs 3 energy in MID/.test(no.text), `below 3 in MID the override is refused, and says why ("${no && no.text}")`);
  cap.charge = 3;
  const yes = G.withCrew(me, () => G.clickTarget(G.LEVB_PANEL.x, G.LEVB_PANEL.y));
  check(yes && yes.ok && yes.hold?.time === 4, 'at 3 it\'s a 4 s hold');
  B(G).brood = []; B(G).wave.next = 99;
  const m = me.input.mouse; m.wx = G.LEVB_PANEL.x; m.wy = G.LEVB_PANEL.y; m.down = true; tick(G, 4.3); m.down = false;
  check(B(G).phase === 'blast' && cap.charge === 0, 'holding it 4 s: the ENGINE BLAST, the 3 charges used');
  const jump0 = G.mission.jumpAt;
  tick(G, 3.2);
  check(B(G)?.phase === 'freed' && Math.abs(G.mission.jumpAt - (G.mission.t + G.LEVB_SINK - 0.2)) < 0.3, `it's free: it sinks, and the jump drive spools in ${G.LEVB_SINK} s (was due at ${jump0.toFixed(0)} s)`);
  (G.evs.coils || []).forEach(c => { c.ok = true; });   // (c8's coils rule: aligned, so no extra spool time)
  tick(G, G.LEVB_SINK + 0.5);
  check(!B(G) && G.mission.jump, 'it\'s gone; the drive spools (c8: someone pulls the handle)');
}
// --- the jump never comes before the fight is over
{
  const G = fresh(1, 'c8'); G.mission.events = []; G.combatClear(); G.startLevBoss(1);
  G.mission.jumpAt = G.mission.t + 5; tick(G, 10, () => keepSafe(G));
  check(!G.mission.jump && G.mission.jumpAt > G.mission.t + 20, 'while it fights, the jump drive holds');
  const lb = G.MISSIONS.c8; const c8 = fresh(1, 'c8');
  check(c8.mission.written.at(-1).kind === 'leviathan_boss' && c8.mission.written.at(-1).finale && c8.mission.events.some(e => e.kind === 'leviathan_boss'), 'c8: the boss is the finale');
}
// --- hand lasers kill a crawler; snapshot sync
{
  const G = fresh(1); G.startLevBoss(4); parked(G, 90); tick(G, 6);
  const w = B(G).brood[0], n0 = B(G).brood.length;
  G.boarding.bolts.push({ x: w.x - 1.2, y: w.y, z: 0.3, vx: 26, vy: 0, life: 1, owner: 'crew' }); tick(G, 0.1);
  check(B(G).brood.length < n0 && !B(G).brood.includes(w), 'one laser bolt kills a brood crawler');
  const H = fresh(1); const snap = JSON.parse(JSON.stringify(G.netSerialize()));
  H.netApply(snap, G.me.id);
  check(JSON.stringify(H.org.boss) === JSON.stringify(G.org.boss) && H.org.boss.phase === 'p4', 'the fight\'s state reaches every browser in the snapshot (org.boss)');
}
// --- solo, start to end: the crew does everything by the book (simulated cannon hits; MID charged for the override)
{
  const G = fresh(1, 'c8'); G.mission.events = []; G.combatClear(); G.startLevBoss(1);
  let s = 0; const steps = [];
  while (B(G) && B(G).phase !== 'freed' && s < 600) {
    keepSafe(G); G.org.leeches = [];
    const b = B(G);
    if (b.parked && b.phase !== 'p4') for (const id of G.levTargets(b)) shoot(G, id);
    if (b.phase === 'p4' && b.parked) {
      for (const w of b.brood) w.hp = 0;
      G.CAPACITORS[1].charge = 3; Object.assign(G.me, { mode: 'inside', x: G.LEVB_PANEL.x, y: G.LEVB_PANEL.y - 0.8 });
      const m = G.me.input.mouse; m.wx = G.LEVB_PANEL.x; m.wy = G.LEVB_PANEL.y; m.down = true;
    }
    if (steps.at(-1) !== b.phase) steps.push(b.phase);
    G.simTick(DT); s += DT;
  }
  G.me.input.mouse.down = false;
  check(B(G)?.phase === 'freed', `solo, by the book it's freed in ${s.toFixed(0)} s (${steps.join(' → ')})`);
}
process.exitCode = failed ? 1 : 0;
