// Damage types and small things: hull breaches (blast doors, vacuum, items sucked out, tarp, plate + nails),
// plasma fire and venting, power surges, failed gravity, snack machine, coffee, intercom, scorch marks.
// Run: node tests/hazards.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'hz', 'mission', 'startMission', 'shipHit', 'DOORWAYS', 'ITEMS', 'CAPACITORS', 'BREACH_SPOTS',
  'clickTarget', 'inv', 'fires', 'SYSTEMS', 'igniteSystem', 'spray', 'startVent', 'pressShield', 'combat', 'surgeColumn', 'LINE', 'linePoint',
  'failGravity', 'GRAV_PANELS', 'SNACK', 'COFFEE_MUG', 'hurtCrew', 'vacuumRoom', 'PLATE_CRATES', 'breachRoom', 'updateFires', 'withCrew', 'VENT_PANELS', 'CAP_MAX'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
// hold the left mouse on (x, y) for up to `max` seconds until done() says so
function holdOn(G, x, y, done, max = 30) {
  const m = G.me.input.mouse; m.wx = x; m.wy = y; m.down = true; let t = 0;
  while (!done() && t < max) { G.simTick(DT); t += DT; }
  m.down = false; return t;
}
const fresh = (rules) => { const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false; Object.assign(G.mission.rules, rules); G.combat.enemies.length = 0; return G; };

// --- hull breach
{
  const G = fresh({ breach: true });
  G.shipHit('port', 0, 20, true);
  check(G.hz.hull.port === 1 && !G.hz.breaches.length, 'first big hit on a side: no breach yet, but the panels rattle (hull damage 1)');
  G.ITEMS.push({ kind: 'drill', x: 8, y: 19 });
  G.shipHit('port', 0, 20, true);
  check(G.hz.breaches.length === 1 && G.hz.breaches[0].room === 'portLock', `the next big hit on that side breaches the nearest room (${G.hz.breaches[0]?.room})`);
  tickN(G, 30);
  const d = G.DOORWAYS[2];
  check(d.blast && d.open < 0.1, 'blast doors drop on that room\'s doorway');
  const me = G.me; me.x = 8; me.y = 18; me.mode = 'inside'; me.vx = me.vy = 0;
  const x0 = me.x; me.input.keys.add('KeyD'); tickN(G, 30); me.input.keys.delete('KeyD');
  const vacDist = me.x - x0; me.x = 16; me.y = 16.5; me.vx = me.vy = 0; const x1 = me.x; me.input.keys.add('KeyD'); tickN(G, 30); me.input.keys.delete('KeyD');
  check(vacDist < (me.x - x1) * 0.85, `in vacuum you move slower (${vacDist.toFixed(2)} vs ${(me.x - x1).toFixed(2)})`);
  tickN(G, 60 * 9);
  check(!G.ITEMS.some(i => i.kind === 'drill') && G.hz.floating.some(f => f.kind === 'drill'), 'loose items get sucked out through the hole within ~8 s');
  tickN(G, 60 * 12);
  check(G.CAPACITORS[0].charge === 0, 'the room\'s capacitor leaks its charge (1 every 20 s)');
  G.igniteSystem(G.SYSTEMS.find(s => s.kind === 'capacitor' && s.ref === G.CAPACITORS[0]));
  check(!G.fires.length, 'no fire can start in vacuum');
  // tarp from inside
  const s = G.BREACH_SPOTS.portLock; me.x = 1.6; me.y = s.y;
  const tape0 = G.hz.tape, t = holdOn(G, s.x, s.y, () => G.hz.breaches[0].tarp);
  check(G.hz.breaches[0].tarp && G.hz.tape === tape0 - 1 && Math.abs(t - 15) < 0.3, `holding click on the hole tapes a tarp over it in 15 s, using a roll of tape (${t.toFixed(1)} s)`);
  tickN(G, 60 * 3);
  check(!G.vacuumRoom('portLock') && G.DOORWAYS[2].open > 0.9, 'tarped: air comes back and the blast doors lift');
  G.shipHit('port', 0, 20, true);
  check(!G.hz.breaches[0].tarp && G.vacuumRoom('portLock'), 'the next hit on that side tears the tarp');
  // weld from outside
  me.mode = 'eva'; me.x = s.out[0] - 0.5; me.y = s.out[1]; me.vx = me.vy = 0; G.withCrew(me, () => { G.inv.item = 'plate'; });
  const welded = () => !G.hz.breaches.some(b => b.room === 'portLock');
  const br = G.hz.breaches.find(b => b.room === 'portLock');
  holdOn(G, s.out[0], s.out[1], () => false, 1);
  check(!welded() && !br.plated, 'with only a plate and no repair kit you can\'t fix it yet… (it needs a click to place first)');
  { const m = me.input.mouse; m.wx = s.out[0]; m.wy = s.out[1]; m.click = true; G.simTick(DT); }
  check(br.plated && !me.inv.item && G.vacuumRoom('portLock'), 'step 1: click to hold the hull plate over the hole (still leaking)');
  G.withCrew(me, () => { G.inv.weapon = 'repair'; });
  const tw = holdOn(G, s.out[0], s.out[1], welded);
  check(welded() && G.hz.hull.port === 0 && Math.abs(tw - 6) < 0.3 && G.hz.patches.some(p => p.room === 'portLock'), `step 2: hold click with the repair kit to nail it down (${tw.toFixed(1)} s); the patch stays visible`);
  // the laser floats out there: grab it
  const f = G.hz.floating.find(f => f.kind === 'drill'); me.x = f.x - 0.4; me.y = f.y; me.vx = me.vy = 0;
  G.hz.floating.splice(0, G.hz.floating.length, f);                       // (the repair kit may be floating right next to it)
  G.withCrew(me, () => { G.inv.weapon = null; });
  const m = me.input.mouse; m.wx = f.x + Math.sin(f.t * 0.7) * 0.3; m.wy = f.y + Math.cos(f.t * 0.5) * 0.3; m.click = true; G.simTick(DT);
  check(me.inv.weapon === 'drill', 'on a spacewalk you can grab what got sucked out');
}
{
  const G = fresh({});
  G.shipHit('port', 0, 20, true); G.shipHit('port', 0, 20, true); G.shipHit('port', 0, 20, true);
  check(!G.hz.breaches.length, 'missions without the breach rule never breach (easy missions)');
}
{
  const G = fresh({ breach: true }); G.breachRoom('portGun'); tickN(G, 30);
  const me = G.me, d = G.DOORWAYS[0]; me.x = d.x + d.w + 0.5; me.y = d.y + d.h / 2; G.simTick(DT);
  check(/force it up/.test(me.prompt?.text || ''), `next to a blast door (not to the reactor room) you can force it ("${me.prompt?.text}")`);
}
// --- plasma fire and venting (only in the lower side rooms)
{
  const G = fresh({ plasma: true });
  G.igniteSystem(G.SYSTEMS.find(s => s.kind === 'reactor'));
  check(G.fires[0] && !G.fires[0].plasma, 'the reactor room never gets a plasma fire (the cat lives there)');
  G.fires.length = 0; G.CAPACITORS[0].charge = 3;
  G.igniteSystem(G.SYSTEMS.find(s => s.ref === G.CAPACITORS[0]));
  const f = G.fires[0];
  check(f?.plasma, 'a fire on a well charged capacitor in a lower side room is a plasma fire');
  const me = G.me; me.x = f.x + 1.5; me.y = f.y; G.withCrew(me, () => { G.inv.weapon = 'extinguisher'; for (let i = 0; i < 600; i++) G.spray(f.x, f.y, DT); });
  check(f.hp >= 0.6, `the extinguisher can't put it out (hp ${f.hp.toFixed(2)})`);
  const [px, py] = G.VENT_PANELS.portLock; me.x = px + 0.9; me.y = py; G.simTick(DT);
  const t = G.withCrew(me, () => G.clickTarget(px, py));
  check(t?.ok && /vent/i.test(t.text), 'the panel next to the outer airlock lights up: vent the room (manual override)');
  me.x = 6; me.y = 19;
  G.startVent('portLock');
  check(me.health === 'hurt', 'venting hurts anyone still in the room');
  G.updateFires(DT);
  check(!G.fires.length && G.vacuumRoom('portLock'), 'venting blows the plasma fire out; the room is in vacuum for a while');
  me.x = 13; me.y = 19; me.health = 'ok'; tickN(G, 30);
  check(/sealed/.test(me.prompt?.text || '') && !me.prompt.run, 'the blast door to the reactor room is sealed for real (no override)');
  tickN(G, 60 * 13);
  check(!G.vacuumRoom('portLock'), 'after 10 s the airlock closes again');
  check(G.combat.decals.some(d => d.scorch), 'the fire leaves a scorch mark');
}
{
  const G = fresh({}); const me = G.me; const [px, py] = G.VENT_PANELS.starLock; me.x = px - 0.9; me.y = py;
  const t = G.withCrew(me, () => G.clickTarget(px, py));
  check(t && !t.ok, 'without a plasma fire the vent panel does nothing');
}
// --- surges
{
  const G = fresh({ surge: true }); G.CAPACITORS[0].charge = 3;
  G.hz.surges.push('shield_port');
  const me = G.me; G.withCrew(me, () => G.pressShield('port'));
  check(me.health === 'hurt', 'pressing a shield button on an arcing line zaps you');
  const [x, y] = G.linePoint(G.LINE.shield_port, 0.5); me.x = x + 0.8; me.y = y; me.health = 'ok';
  const none = G.withCrew(me, () => G.clickTarget(x, y));
  check(none && !none.ok, 'splicing needs the repair kit');
  G.withCrew(me, () => { G.inv.weapon = 'repair'; });
  const t = holdOn(G, x, y, () => !G.hz.surges.length);
  check(!G.hz.surges.length && Math.abs(t - 5) < 0.3, `holding click with the repair kit splices it in 5 s (${t.toFixed(1)} s)`);
}
// --- gravity
{
  const G = fresh({ gravity: true }); G.failGravity('bridge');
  const me = G.me; me.x = 22.2; me.y = 4.5;
  me.input.keys.add('KeyD'); tickN(G, 30); me.input.keys.delete('KeyD');
  const v = me.vx; tickN(G, 20);
  check(v < 2.5 && me.vx > v * 0.5, `without gravity you speed up slowly and keep drifting (v ${v.toFixed(2)} → ${me.vx.toFixed(2)})`);
  const [gx, gy] = G.GRAV_PANELS.bridge; me.x = gx + 0.8; me.y = gy; me.vx = me.vy = 0;
  G.withCrew(me, () => { G.inv.weapon = 'repair'; });
  const t = holdOn(G, gx, gy, () => !G.hz.noGrav.length);
  check(!G.hz.noGrav.length && t < 4.5, `the breaker under the floor plate resets it (${t.toFixed(1)} s)`);
}
// --- small things
{
  const G = fresh({}); const me = G.me; G.CAPACITORS[0].charge = 2;
  G.hurtCrew(me); const h0 = me.hurtT;
  me.x = G.SNACK.x; me.y = G.SNACK.y + 1.0; const m = me.input.mouse; m.wx = G.SNACK.x; m.wy = G.SNACK.y; m.click = true; G.simTick(DT);
  check(me.hurtT < h0 - 9 && G.CAPACITORS[0].charge === 1, 'a snack (1 energy) makes being hurt end 10 s sooner');
  me.x = G.COFFEE_MUG.x; me.y = G.COFFEE_MUG.y + 1.2; m.wx = G.COFFEE_MUG.x; m.wy = G.COFFEE_MUG.y; m.click = true; G.simTick(DT);
  check(me.coffeeT > 14 && G.hz.coffee < 0.01, 'coffee: a speed boost for 15 s, and the mug is empty');
  const pc = G.PLATE_CRATES[0]; me.x = pc.x; me.y = pc.y - 1; m.wx = pc.x; m.wy = pc.y; m.click = true; G.simTick(DT);
  check(me.inv.item === 'plate' && G.hz.plates === 3, 'hull plates come from the crates in the airlock rooms');
}
process.exitCode = failed ? 1 : 0;
// --- fires spread on their own (slightly random) clocks, not all in step
{
  const G = loadGame(['fires', 'SYSTEMS', 'igniteSystem', 'mission', 'startMission']); G.startMission('intro'); G.mission.active = false;
  for (const s of G.SYSTEMS.slice(0, 6)) G.igniteSystem(s);
  const periods = G.fires.map(f => f.period);
  check(new Set(periods.map(p => p.toFixed(2))).size >= 5 && periods.every(p => p >= 15 * 0.75 && p <= 15 * 1.25), `each fire gets its own spread time (${periods.map(p => p.toFixed(1)).join(', ')} s)`);
}
process.exitCode = failed ? 1 : 0;
