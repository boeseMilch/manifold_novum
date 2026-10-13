// Shield emitters: the devices outside on the hull that make the shields. Hits on their side break
// them (never by fire: vacuum), a broken one blocks its shield (and drops it if it was up), it can't
// be repaired from inside, only on a spacewalk with the repair kit, and its state reaches the browsers.
// Run: node tests/emitter.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'mission', 'startMission', 'withCrew', 'inv', 'combat', 'CAPACITORS', 'SYSTEMS', 'SHIELD_EMITTERS',
  'SHIELD_BUTTONS', 'pressShield', 'shipHit', 'fires', 'igniteSystem', 'sysRooms', 'evaOk', 'clickTarget', 'player', 'breakSystem',
  'netSerialize', 'netApply', 'REPAIR_TIME', 'spawnFire', 'evs', 'diagState'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n) => { for (let i = 0; i < n; i++) G.simTick(DT); };
const fresh = () => { const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false; return G; };
const emitter = (G, side) => G.SYSTEMS.find(s => s.kind === 'emitter' && s.ref.side === side);
const fixAll = (G) => { G.fires.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; }); };
function holdOn(G, x, y, max = 20) {
  const m = G.me.input.mouse; m.wx = x; m.wy = y; m.down = true; let t = 0;
  const s = G.SYSTEMS.find(s => s.x === x && s.y === y);
  while (s.broken && t < max) { G.simTick(DT); t += DT; }
  m.down = false; return t;
}

{
  const G = fresh();
  const em = G.SYSTEMS.filter(s => s.kind === 'emitter');
  check(em.length === 3 && em.every(s => s.outside && G.evaOk(s.x, s.y)), 'three shield emitters (left, right, front), outside on the hull where a spacewalker can float');
  check(['port', 'front', 'star'].every(side => emitter(G, side).col === { port: 0, front: 1, star: 2 }[side]), 'each one sits in its side\'s damage column');
  check(em.every(s => G.sysRooms(s).length === 0) && em.every(s => !G.igniteSystem(s)), 'they are in no room and can\'t catch fire (vacuum)');
}
// --- hits break them, fires never sit on them
{
  const G = fresh(); let broke = 0, other = 0, fireOn = 0;
  for (let i = 0; i < 400; i++) {
    fixAll(G); G.shipHit('port', -0.2, 15, i % 2 === 0);
    if (emitter(G, 'port').broken) broke++;
    if (emitter(G, 'star').broken || emitter(G, 'front').broken) other++;
    if (G.fires.some(f => f.sys.outside)) fireOn++;
  }
  check(broke > 20 && other === 0 && fireOn === 0, `hits on the left side break the left emitter now and then (${broke}/400), never the others (${other}), never a fire on it (${fireOn})`);
  fixAll(G); G.spawnFire(-0.75, 15.7);
  check(!G.fires[0]?.sys.outside, 'a fire started next to an emitter goes on the nearest part inside');
}
// --- a broken emitter blocks its shield; breaking it drops a raised shield
{
  const G = fresh(); fixAll(G);
  G.CAPACITORS[0].charge = 3; G.combat.shields.port = { up: 0, cd: 0 };
  G.breakSystem(emitter(G, 'port'));
  const r = G.withCrew(G.me, () => G.pressShield('port'));
  check(r === 'emitter' && G.combat.shields.port.up === 0 && G.CAPACITORS[0].charge === 3, 'with the left emitter broken the left shield button does nothing (no shield, no energy spent)');
  const b = G.SHIELD_BUTTONS.find(b => b.side === 'port'); G.me.mode = 'inside'; G.me.x = b.x; G.me.y = b.y + 0.7; G.simTick(DT);
  check(/emitter outside is broken/.test(G.me.prompt?.text || ''), `the button's prompt says so ("${G.me.prompt?.text}")`);
  check(G.diagState(emitter(G, 'port'))?.text.includes('spacewalk'), 'the helm diagnosis lists it as broken (fix it on a spacewalk)');
  const r2 = G.withCrew(G.me, () => G.pressShield('star'));
  check(r2 === true && G.combat.shields.star.up > 0, 'the other shields still work');
  G.breakSystem(emitter(G, 'star')); G.simTick(DT);
  check(G.combat.shields.star.up === 0 && G.combat.shields.star.cd <= 5, 'an emitter knocked out while its shield is up drops the shield (then the usual 5 s recharge)');
}
// --- repair: not from inside, on a spacewalk with the repair kit
{
  const G = fresh(); fixAll(G);
  const s = emitter(G, 'port'); G.breakSystem(s);
  G.withCrew(G.me, () => { G.inv.weapon = 'repair'; });
  G.me.mode = 'inside'; G.me.x = 1.2; G.me.y = 16.0; G.me.vx = G.me.vy = 0;
  const t0 = G.withCrew(G.me, () => G.clickTarget(s.x, s.y));
  check(t0 && !t0.ok && !t0.repair && /spacewalk/.test(t0.text), `from inside it can't be repaired ("${t0?.text}")`);
  const m = G.me.input.mouse; m.wx = s.x; m.wy = s.y; m.down = true; tickN(G, 60 * 7); m.down = false;
  check(s.broken, 'holding click on it from inside does nothing');
  G.me.mode = 'eva'; G.me.x = s.x - 0.9; G.me.y = s.y; G.withCrew(G.me, () => { G.inv.weapon = null; });
  const t1 = G.withCrew(G.me, () => G.clickTarget(s.x, s.y));
  check(t1 && !t1.ok && /repair kit/.test(t1.text), 'outside without the repair kit: "needs the repair kit"');
  G.withCrew(G.me, () => { G.inv.weapon = 'repair'; });
  const t = holdOn(G, s.x, s.y);
  check(!s.broken && Math.abs(t - G.REPAIR_TIME) < 0.3, `on a spacewalk with the repair kit: hold click, repaired in ${t.toFixed(1)} s`);
  G.CAPACITORS[0].charge = 2;
  check(G.withCrew(G.me, () => G.pressShield('port')) === true, 'and the left shield goes up again');
}
// --- every emitter can be reached and repaired on a spacewalk
{
  for (const side of ['port', 'star', 'front']) {
    const G = fresh(); fixAll(G);
    const s = emitter(G, side); G.breakSystem(s);
    G.withCrew(G.me, () => { G.inv.weapon = 'repair'; });
    let spot = null;                                     // a free spot in reach of it, just off the hull
    for (let r = 0.8; r < 1.6 && !spot; r += 0.1) for (let a = 0; a < Math.PI * 2 && !spot; a += 0.2) {
      const x = s.x + Math.cos(a) * r, y = s.y + Math.sin(a) * r; if (G.evaOk(x, y)) spot = [x, y];
    }
    G.me.mode = 'eva'; [G.me.x, G.me.y] = spot; G.me.vx = G.me.vy = 0;
    holdOn(G, s.x, s.y);
    check(!s.broken, `the ${side} emitter can be reached and repaired on a spacewalk (from ${spot.map(v => v.toFixed(1)).join(', ')})`);
  }
}
// --- the maintenance failure stays inside
{
  let outside = 0;
  for (let i = 0; i < 60; i++) { const G = loadGame(NAMES); G.startMission('intro'); if (G.mission.maint.target.outside || G.mission.maint.decoy.outside) outside++; }
  check(outside === 0, 'the maintenance failure never picks an emitter (it\'s serviced inside)');
}
// --- multiplayer: the browsers see it break and get repaired
{
  const G = fresh(); fixAll(G);
  const B = loadGame(NAMES);
  G.breakSystem(emitter(G, 'front'));
  B.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(emitter(B, 'front').broken && !emitter(B, 'port').broken, 'a broken emitter reaches the browsers in the snapshot');
  emitter(G, 'front').broken = false;
  B.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(!emitter(B, 'front').broken, 'and so does its repair');
}
process.exitCode = failed ? 1 : 0;
