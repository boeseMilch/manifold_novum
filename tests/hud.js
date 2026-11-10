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

// --- the top safe margin: wherever you stand inside, you and the prompt over your head are below the banners / the
// tutorial's objective strip (TOP_SAFE px under the top bar): at the bridge's nose (the helm, the tutorial's first
// stop) the player stood behind the strip (2026-11-10). At several window sizes; a split-screen view is laid out as a
// window of at least SPLIT_MIN (760 × 760, js/game.js resize), so that size stands for the smallest one.
{
  const K = loadGame(['tick', 'me', 'startMission', 'mission', 'camera', 'HUD_H', 'TOP_SAFE', 'PROMPT_BOX', 'promptLift', 'T', 'VW', 'VH', 'window', 'ROOMS', 'invSlots', 'STATIONS']);
  K.startMission('c1'); K.mission.active = false;
  const k = K.me, helm = K.STATIONS.find(q => q.name === 'Helm');
  const settle = (x, y) => { Object.assign(k, { mode: 'inside', x, y, vx: 0, vy: 0 }); for (let i = 0; i < 60 * 4; i++) { k.x = x; k.y = y; K.tick(DT); } return K.camera(); };
  for (const [W, Hh] of [[1600, 1000], [1280, 720], [760, 760], [640, 760], [1024, 600], [1920, 1080]]) {
    K.window.innerWidth = W; K.window.innerHeight = Hh; K.listeners.resize?.();
    const spots = [['at the helm', helm.x, helm.y + 1.0], ['in the bridge\'s nose', 20.6, -1.6],
      ...K.ROOMS.map(r => { const q = r.rects[0]; return [`at the north wall of the ${r.name.toLowerCase()}`, q.x + q.w / 2, q.y + 0.35]; })];
    const bad = [];
    for (const [name, x, y] of spots) {
      const v = settle(x, y), feet = v.oy + y * K.T * v.zoom * v.sy, top = feet - (K.promptLift() + K.PROMPT_BOX) * K.T * v.zoom;
      if (top < K.HUD_H + K.TOP_SAFE - 1 || feet > K.invSlots()[0].y) bad.push(`${name}: prompt top at y ${Math.round(top)}, feet at ${Math.round(feet)}`);
    }
    check(K.VW === W && !bad.length, `${W}×${Hh}: standing anywhere at a room's north wall, the prompt over your head stays under the top ${K.HUD_H + K.TOP_SAFE} px and you above the inventory${bad.length ? ' — ' + bad.join('; ') : ''}`);
  }
  // …and the middle of a room is framed as before (the margin only acts near the top)
  K.window.innerWidth = 1600; K.window.innerHeight = 1000; K.listeners.resize?.();
  const v = settle(22.2, 6.4), feet = v.oy + 6.4 * K.T * v.zoom * v.sy;
  check(Math.abs(feet - (K.HUD_H + (K.invSlots()[0].y - K.HUD_H) / 2)) < 0.2 * K.VH, `in the middle of the bridge you are near the middle of the view (y ${Math.round(feet)} of ${K.VH})`);
}

// --- the debug menu's "Restart the mission" restarts the one you're in, on the ship you have (it started chapter 1 on a
// stock ship); and patching yourself up counts for the end screen's report ("Nobody had to be treated" after being down)
{
  const R = loadGame(['simTick', 'me', 'startMission', 'mission', 'withCrew', 'runCommand', 'hz', 'hurtCrew', 'SHOTS_PER_ENERGY']);
  R.startMission('c3', { ship: { cannons: true }, easy: 1 });
  const shots = R.SHOTS_PER_ENERGY;
  for (let i = 0; i < 120; i++) R.simTick(DT);
  const run0 = R.mission.runId;
  R.withCrew(R.me, () => R.runCommand(['debug', 'm']));
  check(R.mission.id === 'c3' && R.mission.t < 1 && R.mission.easy === 1 && R.mission.upgrades.cannons === true && R.SHOTS_PER_ENERGY === shots && R.mission.runId !== run0,
    `restart: chapter ${R.mission.id} again from 0 s, the same difficulty and ship upgrades (${JSON.stringify(R.mission.upgrades)})`);
  check(!R.mission.rerun, 'restarted mid-mission (nothing paid yet): not a rerun, it pays at its end');
  R.mission.over = { won: true, results: { jumped: true, crew: [{ id: R.me.id }] } };
  R.withCrew(R.me, () => R.runCommand(['debug', 'm']));
  check(R.mission.rerun === true && !R.mission.over, 'restarted after its end (already paid): marked as a rerun, which pays nothing (solo too)');
  R.mission.active = false; R.hurtCrew(R.me, 2);
  R.me.input.keys.add('KeyE');
  for (let i = 0; i < 60 * 25 && R.me.health === 'down'; i++) R.simTick(DT);
  R.me.input.keys.delete('KeyE');
  check(R.me.health === 'hurt' && R.hz.stats.selfTreated === 1 && !Object.keys(R.hz.stats.treated).length, `down, patched yourself up: counted (${R.hz.stats.selfTreated}) for the report, and nobody is "medic of the day"`);
}
process.exitCode = failed ? 1 : 0;
