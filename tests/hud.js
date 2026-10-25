// The in-game HUD: the inventory (bottom centre; a click on a slot drops what's in it), the
// progress bar's numbers for hold jobs (workProgress), the ship's total energy, and the
// "where is it" markers for problems (problemSpots). Run: node tests/hud.js
const { loadGame } = require('./harness');
const NAMES = ['tick', 'render', 'me', 'startMission', 'mission', 'ITEMS', 'invSlots', 'invSlotAt', 'shipEnergy', 'power', 'CAPACITORS',
  'CELL_ENERGY', 'workProgress', 'SYSTEMS', 'REPAIR_TIME', 'problemSpots', 'spawnFire', 'breachRoom', 'VW', 'VH', 'workLabel', 'drawProblemMarkers', 'eTargetOf', 'simTick'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const G = loadGame(NAMES), me = G.me;
G.startMission('c1');
const step = (n, each) => { for (let i = 0; i < n; i++) { each?.(); G.tick(DT); G.render(i * DT); } };
step(2);

// --- inventory: bottom centre, two slots; clicking one drops it at your feet
const [w, it] = G.invSlots();
check(w.slot === 'weapon' && it.slot === 'item' && w.x < G.VW / 2 && it.x + it.w > G.VW / 2 && w.y + w.h > G.VH - 30, 'the two inventory slots sit at the bottom centre');
check(w.w >= 180 && w.h >= 180 && it.w === w.w && G.invSlots().length === 2, `…big (${w.w} px), and still just two (one weapon, one item)`);
check(w.x > 14 + 262, 'they stay clear of the energy panel (bottom left)');
me.inv.weapon = 'repair'; me.inv.item = 'fuel';
const n0 = G.ITEMS.length, m = me.input.mouse;
m.x = it.x + it.w / 2; m.y = it.y + it.h / 2; m.click = true; m.down = true;
step(1); m.down = false; step(1);
check(me.inv.item === null && G.ITEMS.length === n0 + 1 && G.ITEMS.some(i => i.kind === 'fuel' && Math.hypot(i.x - me.x, i.y - me.y) < 1.5), 'clicking the item slot drops the fuel cell next to you');
check(me.inv.weapon === 'repair', '…and leaves the weapon slot alone');
m.x = w.x + 5; m.y = w.y + 5; m.click = true; m.down = true;
step(1); m.down = false; step(1);
check(me.inv.weapon === null && G.ITEMS.some(i => i.kind === 'repair'), 'clicking the weapon slot drops the repair kit');
check(!G.invSlotAt(G.VW / 2, 100), 'a click up in the world is not an inventory click');

// --- total energy: reactor cell + capacitors + spare cells
G.power.reactor.fuel = 3; G.CAPACITORS.forEach(c => { c.charge = 1; }); G.power.reserve = 2;
const E = G.shipEnergy(), loose = G.ITEMS.filter(i => i.kind === 'fuel').length;
check(E.total === 3 + 3 + (2 + loose) * G.CELL_ENERGY, `total energy counts the reactor, the capacitors and every spare cell (${E.total})`);

// --- progress of a hold job: a 0..1 fraction with a caption
const s = G.SYSTEMS.find(q => !q.outside);
me.repair = { sys: s, t: G.REPAIR_TIME / 2 };
const p = G.workProgress(me);
check(p && Math.abs(p.k - 0.5) < 1e-6 && p.label.includes(s.name.toLowerCase()), `repairing: half way → k 0.5 ("${p?.label}")`);
me.repair = null;
check(G.workLabel('Hold click: weld the plate on (4 s)') === 'Weld the plate on', 'hold jobs get a short caption from their prompt');

// --- where things happen
s.broken = true; G.spawnFire(5, 8); G.breachRoom('portLock');
const spots = G.problemSpots();
check(spots.some(q => q.what === 'BROKEN' && q.room.startsWith(s.name)), 'a broken part gets a marker with its name');
check(spots.some(q => q.what === 'FIRE' && q.room), 'a fire gets a marker with the room it is in');
check(spots.some(q => q.what === 'BREACH' && q.room === 'Left airlock room'), 'a hull breach gets a marker with the room');
let threw = null;
try { step(5); } catch (e) { threw = e; }
check(!threw, `the markers draw without errors${threw ? ': ' + threw.message : ''}`);

// --- E acts on what's next to you, not on what the mouse points at; that spot gets the solid ring
{
  const H = loadGame(NAMES), me2 = H.me;
  H.startMission('c1'); H.mission.active = false;
  for (let i = 0; i < 5; i++) H.simTick(DT);
  me2.mode = 'inside'; me2.inv.weapon = null; me2.inv.item = null;
  const [x0, y0] = [me2.x, me2.y];
  H.ITEMS.length = 0;
  H.ITEMS.push({ kind: 'laser', x: x0 + 0.5, y: y0 }, { kind: 'repair', x: x0 - 1.4, y: y0 });
  const m2 = me2.input.mouse; m2.wx = x0 - 1.4; m2.wy = y0; m2.x = m2.y = -999;   // the mouse on the far one
  for (let i = 0; i < 12; i++) H.simTick(DT);
  const eT = H.eTargetOf(me2);
  check(eT && Math.abs(eT.x - (x0 + 0.5)) < 0.01, `the E target is the item next to you, not the one under the mouse (${eT && eT.x.toFixed(2)})`);
  check(me2.hover?.ok && Math.abs(me2.hover.x - (x0 - 1.4)) < 0.01, '…while the mouse still has its own target');
  me2.input.keys.add('KeyE'); me2.input.pressed.add('KeyE'); H.simTick(DT); me2.input.keys.delete('KeyE'); H.simTick(DT);
  check(me2.inv.weapon === 'laser', `E takes the near one (${me2.inv.weapon})`);
  m2.wx = x0 + 30; m2.wy = y0 + 30;                  // mouse far away: E still has a target
  H.ITEMS.push({ kind: 'extinguisher', x: x0, y: y0 + 0.6 });
  for (let i = 0; i < 12; i++) H.simTick(DT);
  check(!!H.eTargetOf(me2), 'with the mouse far away, the thing next to you is still E\'s target');
}
process.exitCode = failed ? 1 : 0;
