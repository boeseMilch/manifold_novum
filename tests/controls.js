// Clean controls: left click does everything in the world (hatches, ladders, shield buttons,
// airlocks, consoles, items, treating people); right click uses your weapon. Injuries:
// hurt → down → out, treating. Power lines carry pulses. Run: node tests/controls.js
const { loadGame } = require('./harness');
const NAMES = ['tick', 'me', 'crew', 'HATCHES', 'GUNS', 'SHIELD_BUTTONS', 'DECK_LOCKS', 'combat', 'CAPACITORS', 'hurtCrew',
  'netServer', 'simTick', 'power', 'useEnergy', 'standing', 'SPINE_Y0', 'SPINE_Y1', 'mission', 'ITEMS', 'SYSTEMS', 'boarding', 'startMission', 'REPAIR_TIME'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const clickAt = (G, x, y) => { const m = G.me.input.mouse; m.wx = x; m.wy = y; m.x = -999; m.y = -999; m.click = true; G.simTick(DT); };
const tickN = (G, n) => { for (let i = 0; i < n; i++) G.simTick(DT); };

// --- left click on things you're next to
{
  const G = loadGame(NAMES); const h = G.HATCHES[0], me = G.me;
  me.x = h.inside[0]; me.y = h.inside[1]; G.simTick(DT);
  check(/^Click: go outside/.test(me.prompt?.text || ''), `prompts say what clicking does ("${me.prompt?.text}")`);
  clickAt(G, h.x, h.y); tickN(G, 120);
  check(me.mode === 'eva', 'clicking the outer airlock takes you outside');
  const g = G.GUNS.find(g => g.id === 'port'); me.mode = 'inside'; me.x = g.hatch[0]; me.y = g.hatch[1] - 0.3; G.simTick(DT);
  clickAt(G, g.hatch[0], g.hatch[1]);
  check(me.mode === 'gun' && me.gun === g, 'clicking a ladder climbs into the cannon');
  { const m = me.input.mouse; m.down = true; const shots = g.shots; for (let i = 0; i < 40; i++) G.simTick(DT);
    check(g.shots === shots, 'holding the button from the click that got you in doesn\'t fire');
    m.down = false; G.simTick(DT);
    check(g.shots === shots, '…and neither does letting go');
    m.down = true; G.simTick(DT); m.down = false;
    check(g.shots === shots - 1, 'a fresh click fires'); }
  me.mode = 'inside'; me.gun = null;
  const b = G.SHIELD_BUTTONS[0]; G.CAPACITORS[0].charge = 2; me.x = b.x; me.y = b.y + 0.8; G.simTick(DT);
  clickAt(G, b.x, b.y);
  check(G.combat.shields.port.up > 0, 'clicking a shield button raises the shield');
  const L = G.DECK_LOCKS[0]; me.x = L.x + L.w / 2; me.y = (G.SPINE_Y0 + G.SPINE_Y1) / 2; tickN(G, 120);
  const open0 = L.open; clickAt(G, L.x + L.w / 2, (G.SPINE_Y0 + G.SPINE_Y1) / 2);
  check(L.phase !== 'idle' || L.open !== open0, 'clicking the airlock you stand in cycles it');
  me.x = 22.2; me.y = 4.5; G.simTick(DT);
  const far = G.HATCHES[0]; const wasMode = me.mode; clickAt(G, far.x, far.y);
  check(me.mode === wasMode, 'clicking something far away does nothing');
}
// --- injuries
{
  const G = loadGame(NAMES); const me = G.me;
  G.hurtCrew(me);
  check(me.health === 'hurt', 'first hit: hurt');
  const x0 = me.x; me.input.keys.add('KeyA'); tickN(G, 60); me.input.keys.delete('KeyA');
  const hurtDist = x0 - me.x; me.health = 'ok'; const x1 = me.x; me.input.keys.add('KeyD'); tickN(G, 60); me.input.keys.delete('KeyD');
  check(hurtDist < (me.x - x1) * 0.75, `hurt, you move slower (${hurtDist.toFixed(2)} vs ${(me.x - x1).toFixed(2)} units in 1 s)`);
  me.health = 'hurt'; me.hurtT = 30; tickN(G, 60 * 31);
  check(me.health === 'ok', 'after 30 s you are fine again');
  G.hurtCrew(me); G.hurtCrew(me);
  check(me.health === 'down', 'hit while hurt: down');
  const xd = me.x; me.input.keys.add('KeyD'); tickN(G, 30); me.input.keys.delete('KeyD');
  check(me.x === xd, 'down, you cannot move');
  let t = 0; const m = me.input.mouse; m.wx = me.x; m.wy = me.y; m.down = true;
  while (me.health === 'down' && t < 15) { G.simTick(DT); t += DT; }
  m.down = false;
  check(me.health === 'hurt' && Math.abs(t - 10) < 0.2, `holding click on yourself patches you up in 10 s (${t.toFixed(1)} s) → hurt`);
  G.hurtCrew(me); G.hurtCrew(me);
  check(me.health === 'out', 'hit again while down: out');
}
{
  const G = loadGame(NAMES); G.netServer.init('intro'); G.mission.active = false;
  G.netServer.addCrew(1, 'A'); G.netServer.addCrew(2, 'B');
  const [A, B] = G.crew; B.x = A.x + 1; B.y = A.y;
  G.hurtCrew(B); G.hurtCrew(B); G.hurtCrew(B);
  check(B.health === 'out', 'B is out cold');
  G.netServer.input(2, { keys: [], pressed: [], mouse: { wx: B.x, wy: B.y, down: true } }); tickN(G, 60 * 5);
  check(B.health === 'out', 'out with a crewmate around: you cannot treat yourself');
  G.netServer.input(2, { keys: [], pressed: [], mouse: {} });
  let t = 0;
  while (B.health === 'out' && t < 5) { G.netServer.input(1, { keys: [], pressed: [], mouse: { wx: B.x, wy: B.y, down: true } }); G.simTick(DT); t += DT; }
  check(B.health === 'hurt' && Math.abs(t - 2) < 0.15, `a crewmate treats you by holding click on you for 2 s (${t.toFixed(1)} s)`);
}
{
  const G = loadGame(NAMES); const me = G.me;
  G.hurtCrew(me); G.hurtCrew(me); G.hurtCrew(me);
  let t = 0; const m = me.input.mouse; m.wx = me.x; m.wy = me.y; m.down = true;
  while (me.health === 'out' && t < 30) { G.simTick(DT); t += DT; }
  check(me.health === 'hurt' && t < 25, `alone on the ship, out cold is not a softlock: you crawl back in ${t.toFixed(0)} s`);
}
// --- power lines carry the energy
{
  const G = loadGame(NAMES); G.CAPACITORS[2].charge = 1;
  G.useEnergy(2, 'shield_star');
  check(G.power.pulses.some(p => p.line === 'shield_star'), 'using energy sends a pulse down the power line to what used it');
  G.simTick(1);
  check(!G.power.pulses.length, 'the pulse arrives and is gone');
}
// --- keyboard: arrows aim, Space shoots, E does what a click would
{
  const G = loadGame(NAMES); G.startMission('practice'); const me = G.me, k = me.input.keys, p = me.input.pressed;
  me.x = 22.2; me.y = 4.5; const x0 = me.x, y0 = me.y;
  k.add('ArrowUp'); tickN(G, 30);
  check(Math.hypot(me.x - x0, me.y - y0) < 0.01 && Math.abs(me.face + Math.PI / 2) < 1e-6, 'arrow keys only aim (up), they don\'t walk');
  k.add('ArrowRight'); tickN(G, 2);
  check(Math.abs(me.face + Math.PI / 4) < 1e-6, 'two arrows: diagonal (8 directions)');
  k.add('KeyA'); tickN(G, 30);
  check(me.x < x0 - 0.5 && Math.abs(me.face + Math.PI / 4) < 1e-6, 'walking left while aiming up-right keeps facing up-right');
  k.delete('ArrowUp'); k.delete('ArrowRight'); tickN(G, 5);
  check(Math.abs(Math.abs(me.face) - Math.PI) < 0.1, 'let go of the arrows: you face the way you walk');
  k.delete('KeyA'); tickN(G, 30);
  me.inv.weapon = 'laser'; me.inv.cd = 0; G.boarding.bolts.length = 0; me.face = Math.PI / 2;
  p.add('Space'); G.simTick(DT);
  const b = G.boarding.bolts.find(b => b.owner === 'crew');
  check(b && b.vy > 0 && Math.abs(b.vx) < 1e-6, 'Space fires the weapon the way you face');
  // E picks up the item next to you (the mouse is somewhere else)
  me.inv.weapon = null; G.ITEMS.length = 0; G.ITEMS.push({ kind: 'laser', x: me.x + 1, y: me.y });
  me.input.mouse.wx = me.x - 8; me.input.mouse.wy = me.y; tickN(G, 12);
  check(/^E: take the laser gun/.test(me.prompt?.text || ''), `the prompt says what E does ("${me.prompt?.text}")`);
  p.add('KeyE'); k.add('KeyE'); G.simTick(DT); k.delete('KeyE'); G.simTick(DT);
  check(me.inv.weapon === 'laser' && !G.ITEMS.length, 'E picks up the item next to you');
  // hold E to repair
  const s = G.SYSTEMS.find(s => s.kind === 'capacitor'); s.broken = true; me.inv.weapon = 'repair'; me.x = s.x; me.y = s.y - 0.9;
  G.simTick(DT); p.add('KeyE'); k.add('KeyE');
  tickN(G, Math.ceil(G.REPAIR_TIME / DT) + 5); k.delete('KeyE'); G.simTick(DT);
  check(!s.broken, 'holding E on a broken part repairs it');
}
process.exitCode = failed ? 1 : 0;
// --- the treadmill
{
  const G = loadGame(['simTick', 'me', 'mission', 'TREADMILL']);
  const me = G.me, B = G.TREADMILL, cx = B.x + B.w / 2;
  me.x = cx; me.y = B.y + B.h + 0.6;                      // behind it
  me.input.keys.add('KeyW'); for (let i = 0; i < 40; i++) G.simTick(1 / 60);
  check(me.y < B.y + B.h, 'you can step onto the treadmill from the back');
  for (let i = 0; i < 120; i++) G.simTick(1 / 60);
  check(me.y > B.y, 'walking forward on it you stay on the belt (it pushes you back)');
  { const yKeep = me.y; me.y = B.y + B.h * 0.7; me.vy = -4.2; const y1 = me.y; G.simTick(1 / 60); const v = (y1 - me.y) * 60; me.y = yKeep; check(v > 0 && Math.abs(v - 4.2 * 0.5) < 0.3, `walking on it you go forward at half your walking speed (${v.toFixed(2)} units/s)`); }
  me.input.keys.delete('KeyW'); const y0 = me.y; for (let i = 0; i < 30; i++) G.simTick(1 / 60);
  check(me.y > y0 + 0.3, 'standing still, the belt carries you off the back');
  me.x = B.x - 0.6; me.y = B.y + B.h / 2; me.input.keys.add('KeyD'); for (let i = 0; i < 60; i++) G.simTick(1 / 60); me.input.keys.delete('KeyD');
  check(me.x < B.x, 'the side rails keep you from stepping on sideways');
}
// --- keyboard: arrows aim, Space shoots, E does what a click would
{
  const G = loadGame(NAMES); G.startMission('practice'); const me = G.me, k = me.input.keys, p = me.input.pressed;
  me.x = 22.2; me.y = 4.5; const x0 = me.x, y0 = me.y;
  k.add('ArrowUp'); tickN(G, 30);
  check(Math.hypot(me.x - x0, me.y - y0) < 0.01 && Math.abs(me.face + Math.PI / 2) < 1e-6, 'arrow keys only aim (up), they don\'t walk');
  k.add('ArrowRight'); tickN(G, 2);
  check(Math.abs(me.face + Math.PI / 4) < 1e-6, 'two arrows: diagonal (8 directions)');
  k.add('KeyA'); tickN(G, 30);
  check(me.x < x0 - 0.5 && Math.abs(me.face + Math.PI / 4) < 1e-6, 'walking left while aiming up-right keeps facing up-right');
  k.delete('ArrowUp'); k.delete('ArrowRight'); tickN(G, 5);
  check(Math.abs(Math.abs(me.face) - Math.PI) < 0.1, 'let go of the arrows: you face the way you walk');
  k.delete('KeyA'); tickN(G, 30);
  me.inv.weapon = 'laser'; me.inv.cd = 0; G.boarding.bolts.length = 0; me.face = Math.PI / 2;
  p.add('Space'); G.simTick(DT);
  const b = G.boarding.bolts.find(b => b.owner === 'crew');
  check(b && b.vy > 0 && Math.abs(b.vx) < 1e-6, 'Space fires the weapon the way you face');
  // E picks up the item next to you (the mouse is somewhere else)
  me.inv.weapon = null; G.ITEMS.length = 0; G.ITEMS.push({ kind: 'laser', x: me.x + 1, y: me.y });
  me.input.mouse.wx = me.x - 8; me.input.mouse.wy = me.y; tickN(G, 12);
  check(/^E: take the laser gun/.test(me.prompt?.text || ''), `the prompt says what E does ("${me.prompt?.text}")`);
  p.add('KeyE'); k.add('KeyE'); G.simTick(DT); k.delete('KeyE'); G.simTick(DT);
  check(me.inv.weapon === 'laser' && !G.ITEMS.length, 'E picks up the item next to you');
  // hold E to repair
  const s = G.SYSTEMS.find(s => s.kind === 'capacitor'); s.broken = true; me.inv.weapon = 'repair'; me.x = s.x; me.y = s.y - 0.9;
  G.simTick(DT); p.add('KeyE'); k.add('KeyE');
  tickN(G, Math.ceil(G.REPAIR_TIME / DT) + 5); k.delete('KeyE'); G.simTick(DT);
  check(!s.broken, 'holding E on a broken part repairs it');
}
process.exitCode = failed ? 1 : 0;
