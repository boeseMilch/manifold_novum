// Spores inside the ship (js/spores.js, 2026-10-22): a spore cloud seeps in at the airlock on its side; the spore mother's
// cloud round the hull (a chance per gust, and for sure through an airlock opened in it); spreading only through open doors,
// never into the reactor room; glitching parts, then breakage; venting clears a room (the vent panel works without a fire,
// not while spores are outside), forcing a door from a vented room vents the next; every infestable room can be cleared by
// one crew member; the state reaches the browsers. Run: node tests/spores.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'makeCrew', 'evs', 'hz', 'mission', 'startMission', 'withCrew', 'ui', 'combat', 'combatSpawn', 'spawnSpores',
  'infestRoom', 'sporeGust', 'motherCloud', 'sporeGlitching', 'sporesOutside', 'SYSTEMS', 'CAPACITORS', 'SHIELD_BUTTONS', 'GUNS', 'HATCHES', 'DECK_DOORS', 'DOORWAYS',
  'DOORS', 'doorRooms', 'pressShield', 'useEnergy', 'fireCannon', 'airlockManual', 'VENT_PANELS', 'clickTarget', 'runCommand', 'overrideHit', 'forceDoor',
  'vacuumRoom', 'startVent', 'VENT_TIME', 'netSerialize', 'netApply', 'eventLabel', 'encounterPlates', 'problemSpots', 'WALK_SPEED', 'VACUUM_SPEED',
  'igniteSystem', 'fires', 'SPORE_SEEP', 'SPORE_SPREAD', 'SPORE_CLEAR', 'SPORE_GLITCH_TIME', 'SPORE_BREAK_FIRST', 'SPORE_BREAK_EVERY', 'MOTHER_SEEP_CHANCE', 'MOTHER_GUSTS',
  'CLOUD_HOLD', 'CLOUD_FADE', 'PUFF_EVERY', 'SAC_OPEN', 'roomAt'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const secs = (G, s, each) => tickN(G, Math.round(s * 60), each);
const fresh = () => { const G = loadGame(NAMES); G.startMission('practice'); G.combat.enemies.length = 0; G.me.x = 22.2; G.me.y = 16.6; return G; };
const rooms = (G) => Object.keys(G.hz.spores.rooms).sort().join(',');
const sys = (G, ref) => G.SYSTEMS.find(s => s.ref === ref);
const glitch = (G, ref, room) => { G.hz.spores.glitch.push({ sys: G.SYSTEMS.indexOf(sys(G, ref)), t: G.SPORE_GLITCH_TIME, room }); };
const deck = (G, col) => G.DECK_DOORS[col];
const doorTo = (G, a, b) => G.DOORS.find(d => { const r = G.doorRooms(d).map(r => r.id); return r.includes(a) && r.includes(b); });
function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// --- a spore cloud: visible outside first (banner, radar label, sidebar), then it seeps in at the airlock on its side
for (const side of ['port', 'star']) {
  const G = fresh(), lock = side === 'port' ? 'portLock' : 'starLock', h = G.HATCHES.find(q => q.side === side);
  G.spawnSpores(side);
  check(/airlock/.test(G.combat.banner?.text || '') && G.evs.spores.length === 3, `${side}: three clouds drift in, the banner says they're heading for the airlock ("${G.combat.banner?.text}")`);
  check(G.eventLabel({ kind: 'spores', side }) === `Spore cloud — ${side === 'port' ? 'left' : 'right'} airlock`, `the radar label names the airlock (${G.eventLabel({ kind: 'spores', side })})`);
  check(G.encounterPlates().some(p => p.key === 'spores' && /airlock/.test(p.sub)), 'the sidebar shows the cloud on its way to the airlock');
  let first = null, at = null;
  for (let i = 0; i < 60 * 40 && !rooms(G); i++) { G.simTick(DT); if (first === null && G.evs.spores.some(s => s.seep > 0)) first = i / 60; }
  at = G.mission.t;
  check(rooms(G) === lock, `${side}: it reaches the outer airlock and seeps in: the ${lock} is infested (${rooms(G)})`);
  check(first !== null && first > 6, `it takes a while to get there (at the seals after ${first?.toFixed(1)} s): time to shoot it`);
  check(G.evs.spores.every(s => s.side === side) && G.hz.spores.rooms[lock].from && Math.abs(G.hz.spores.rooms[lock].from[1] - h.y) < 0.1, 'the haze starts at the airlock\'s inner door');
  const card = () => G.encounterPlates().find(p => p.key === 'spores' + lock);
  secs(G, 10);   // (the clouds still drifting in are past the seals: gone)
  check(!G.vacuumRoom(lock) && card()?.title === 'SPORES' && /^(Left|Right) airlock · vent it: airlock panel, PIN on sticky note/.test(card()?.sub), `the sidebar card: ${card()?.title} — ${card()?.sub}`);
  check(G.problemSpots().some(s => s.key === 'spores' + lock && s.what === 'SPORES'), 'and a problem marker on the room');
}
{
  const G = fresh(); G.spawnSpores('front', null, 3, true);
  check(G.evs.spores.length === 3 && ['port', 'star'].includes(G.evs.spores[0].side), `a cloud from the front heads for one of the two airlocks (${G.evs.spores[0].side})`);
  const s = G.evs.spores[0]; G.combat.shells.push({ x: s.x + 0.5, y: s.y, vx: 0, vy: 0, life: 1 }); G.simTick(DT);
  check(!G.evs.spores.includes(s), 'a cannon shell still bursts a cloud on its way in');
}

// --- spreading: only through a door standing open SPORE_SPREAD s, never into the reactor room
const calm = (G) => { for (const r of Object.values(G.hz.spores.rooms)) r.glitchT = 1e9; };   // (no random glitch on the door under test)
{
  const G = fresh(); G.infestRoom('portLock', 'seep'); calm(G);
  secs(G, 30);
  check(rooms(G) === 'portLock', `doors shut: nothing spreads in 30 s (${rooms(G)})`);
  const d = deck(G, 0), me = G.me; me.x = d.x + d.w / 2; me.y = d.y + d.h / 2;   // standing in the left deck door: it opens and stays open
  secs(G, 1.0);
  check(d.open > 0.6 && rooms(G) === 'portLock', 'the deck door opens for a crew member; not over yet');
  let t = 1.0; while (!G.hz.spores.rooms.portGun && t < 5) { G.simTick(DT); t += DT; }
  check(!!G.hz.spores.rooms.portGun && t > G.SPORE_SPREAD, `with it standing open they drift up into the left cannon room (after ${t.toFixed(1)} s)`);
  const r = doorTo(G, 'portLock', 'reactor'); me.x = r.x + r.w / 2; me.y = r.y + r.h / 2;
  secs(G, 12);
  check(r.open > 0.6 && !G.hz.spores.rooms.reactor && G.hz.spores.shrivel[String(G.DOORS.indexOf(r))] === 'reactor', 'the door to the reactor room open for 12 s: they never get in (they shrivel at its door)');
  me.x = 22.2; me.y = 16.6; secs(G, 3);
  const k = String(G.DOORS.indexOf(r));
  check(!G.hz.spores.shrivel[k] && !G.hz.spores.doors[k], 'door shut again: nothing drifting');
}
{
  const G = fresh(); G.infestRoom('portLock', 'seep'); calm(G);
  const d = deck(G, 0), me = G.me; me.x = d.x + d.w / 2; me.y = d.y + d.h / 2;
  secs(G, 1.3); me.x = 7; me.y = 7.6; secs(G, 5);   // (it opens after ~0.75 s, you pass, it lingers DOOR_LINGER s)
  check(!!G.hz.spores.rooms.portGun, 'just walking through is enough: the door opens, lets you by and lingers (the user\'s rule: anyone walking through)');
}

// --- in an infested room: parts glitch now and then (unresponsive), then one breaks for good
{
  const G = fresh(); G.infestRoom('portLock', 'seep');
  let g = null, t = 0;
  while (!g && t < 20) { G.simTick(DT); t += DT; g = G.hz.spores.glitch[0]; }
  const s = g && G.SYSTEMS[g.sys];
  check(!!s && ['shield', 'capacitor', 'hatch', 'lock'].includes(s.kind) && /not responding/.test(G.combat.banner?.text || ''), `a part glitches within ${t.toFixed(1)} s: the ${s?.name} ("${G.combat.banner?.text}")`);
  const left = g.t; secs(G, left + 0.1);
  check(!G.hz.spores.glitch.some(q => q.sys === g.sys) && !s.broken, `after ${G.SPORE_GLITCH_TIME} s it works again`);
  G.hz.spores.rooms.portLock.glitchT = 1e9;   // (no more glitches: the breakage alone)
  secs(G, G.SPORE_BREAK_FIRST - left - t - 1);
  check(!G.SYSTEMS.some(q => q.broken), `nothing broken before ${G.SPORE_BREAK_FIRST} s`);
  secs(G, 1.2);
  const b1 = G.SYSTEMS.filter(q => q.broken);
  check(b1.length === 1 && ['shield', 'capacitor', 'hatch', 'lock'].includes(b1[0].kind), `after ${G.SPORE_BREAK_FIRST} s of spores one part in the room breaks for good (${b1.map(q => q.name)})`);
  secs(G, G.SPORE_BREAK_EVERY);
  check(G.SYSTEMS.filter(q => q.broken).length === 2, `${G.SPORE_BREAK_EVERY} s later another (${G.SYSTEMS.filter(q => q.broken).map(q => q.name).join(', ')})`);
  check(!G.SYSTEMS.some(q => q.broken && q.kind !== 'lock' && !['portLock'].includes(G.roomAt(q.x, q.y)?.id) && q.kind !== 'hatch'), 'only parts in that room');
}
{ // what a glitch does: a shield button that doesn't press, a capacitor that gives no energy, a cannon that doesn't fire, a deck door and an outer airlock that stick
  const G = fresh(), me = G.me; G.infestRoom('portLock', 'seep'); G.infestRoom('portGun', 'door'); G.hz.spores.rooms.portLock.glitchT = G.hz.spores.rooms.portGun.glitchT = 1e9;
  G.CAPACITORS[0].charge = 3;
  const btn = G.SHIELD_BUTTONS.find(b => b.side === 'port');
  glitch(G, btn, 'portLock');
  const r = G.withCrew(me, () => G.pressShield('port'));
  check(r === 'spores' && G.CAPACITORS[0].charge === 3 && !(G.combat.shields.port.up > 0) && /shield button/.test(G.combat.banner.text), `a glitching shield button doesn't press, no energy used ("${G.combat.banner.text}")`);
  me.x = btn.x; me.y = btn.y + 0.9; G.simTick(DT);
  check(/spores/i.test(me.prompt?.text || '') && !me.prompt.run, `its prompt says why ("${me.prompt?.text}")`);
  G.hz.spores.glitch = [];
  glitch(G, G.CAPACITORS[0], 'portLock');
  check(!G.useEnergy(0) && G.CAPACITORS[0].charge === 3, 'a glitching capacitor gives no energy');
  const r2 = G.withCrew(me, () => G.pressShield('port'));
  check(r2 === 'noenergy' && /capacitor/.test(G.combat.banner.text), `so its shield doesn't go up either ("${G.combat.banner.text}")`);
  G.hz.spores.glitch = [];
  const gun = G.GUNS.find(g => g.id === 'port'); gun.shots = 3; gun.cd = 0; glitch(G, gun, 'portGun');
  G.fireCannon(gun);
  check(gun.shots === 3 && !G.combat.shells.length && /firing circuit/.test(G.combat.banner.text), 'a glitching cannon doesn\'t fire');
  G.hz.spores.glitch = [];
  const d = deck(G, 0); glitch(G, d, 'portLock'); me.x = d.x + d.w / 2; me.y = d.y + d.h + 0.7;
  secs(G, 2);
  check(d.open === 0 && /spores/i.test(me.prompt?.text || '') && !me.prompt.run, `a glitching deck door sticks shut ("${me.prompt?.text}")`);
  secs(G, G.SPORE_GLITCH_TIME);
  check(d.open > 0.6, 'and opens again once the glitch is over');
  G.hz.spores.glitch = [];
  const h = G.HATCHES[0]; glitch(G, h, 'portLock'); me.x = h.inside[0]; me.y = h.inside[1];
  secs(G, 2);
  check(h.doors.inner === 0 && /spores/i.test(me.prompt?.text || ''), `a glitching outer airlock doesn't open ("${me.prompt?.text}")`);
}

// --- the cure: vacuum. The vent panel works without a fire; the PIN pad; the room is clean after SPORE_CLEAR s
function ventAtPanel(G, lock, who = G.me) {
  const [px, py] = G.VENT_PANELS[lock]; who.x = px + (lock === 'portLock' ? 0.9 : -0.9); who.y = py; G.simTick(DT);
  const t = G.withCrew(who, () => G.clickTarget(px, py));
  if (!t?.ok) return t;
  G.withCrew(who, () => t.run());
  for (const dg of who.ui.mini.pin) G.withCrew(who, () => G.runCommand(['mini', 'pin', 'key', +dg]));
  G.withCrew(who, () => G.runCommand(['mini', 'pin', 'ok']));
  secs(G, 1);
  return t;
}
{
  const G = fresh(); G.infestRoom('starLock', 'seep');
  const t = ventAtPanel(G, 'starLock');
  check(t?.ok && /spores/.test(t.text) && G.hz.vent?.room === 'starLock', `no fire anywhere: the vent panel vents the room ("${t?.text}")`);
  let c = 0; while (G.hz.spores.rooms.starLock && c < 10) { G.simTick(DT); c += DT; }
  check(!G.hz.spores.rooms.starLock && c >= G.SPORE_CLEAR - 1.1 && /aired out/.test(G.combat.banner.text), `${(c + 0.2).toFixed(1)} s of vacuum later the room is clean ("${G.combat.banner.text}")`);
  secs(G, G.VENT_TIME);
  check(!G.vacuumRoom('starLock') && !rooms(G), 'the vent closes, air comes back, no spores');
}
// --- forcing the door from a vented room vents (and clears) the room behind it
{
  const G = fresh(), me = G.me; G.infestRoom('portGun', 'door');
  ventAtPanel(G, 'portLock');
  const d = deck(G, 0); me.x = d.x + d.w / 2; me.y = d.y + d.h + 0.7; G.simTick(DT);
  check(/manual override/.test(me.prompt?.text || '') && /left cannon room/.test(me.prompt.text), `at the deck door up, in the vented room: "${me.prompt?.text}"`);
  G.withCrew(me, () => me.prompt.run());
  for (let k = 0; k < 3; k++) { G.withCrew(me, () => G.overrideHit()); tickN(G, 40); }
  secs(G, 1.2);
  check(d.hold > 0 && G.vacuumRoom('portGun'), 'forced: the left cannon room vents through it');
  secs(G, G.SPORE_CLEAR + 0.2);
  check(!G.hz.spores.rooms.portGun, 'and its spores are dead');
  check(!G.vacuumRoom('reactor'), 'the reactor room keeps its air');
}

// --- every room that can get spores can be cleared by one crew member alone (walking at vacuum speed, the PIN, real overrides)
const walk = (G, x, y, len) => { const me = G.me, d = len ?? Math.hypot(x - me.x, y - me.y) * 1.25; secs(G, d / (G.WALK_SPEED * G.VACUUM_SPEED)); me.x = x; me.y = y; me.vx = me.vy = 0; };
function forceAt(G, d, stand) {
  const me = G.me; me.x = stand[0]; me.y = stand[1]; G.simTick(DT);
  if (!/manual override/.test(me.prompt?.text || '')) return `no override offered ("${me.prompt?.text}")`;
  G.withCrew(me, () => me.prompt.run());
  for (let k = 0; k < 3; k++) { G.withCrew(me, () => G.overrideHit()); tickN(G, 40); }
  secs(G, 1.1);
  return d.hold > 0 ? null : 'not forced';
}
const PATHS = {
  portLock: { lock: 'portLock', steps: [] },
  starLock: { lock: 'starLock', steps: [] },
  portGun: { lock: 'portLock', steps: [[0, null, [4.2, 14.7]]] },
  starGun: { lock: 'starLock', steps: [[2, null, [34.4, 14.7]]] },
  bridge: { lock: 'portLock', steps: [[0, null, [4.2, 14.7]], [null, ['portGun', 'bridge'], [13.0, 7.3]]] },
  'bridge (from the right)': { room: 'bridge', lock: 'starLock', steps: [[2, null, [34.4, 14.7]], [null, ['starGun', 'bridge'], [31.4, 6.9]]] },
};
for (const [name, P] of Object.entries(PATHS)) {
  const G = fresh(), room = P.room || name; G.infestRoom(room, 'seep');
  for (const r of Object.values(G.hz.spores.rooms)) r.glitchT = 1e9;   // (no glitching deck doors in the way here)
  let reactorAir = true, why = null;
  const watch = () => { if (G.vacuumRoom('reactor')) reactorAir = false; };
  ventAtPanel(G, P.lock);
  for (const [col, pair, stand] of P.steps) {
    const d = col !== null ? deck(G, col) : doorTo(G, ...pair);
    walk(G, ...stand);
    why = why || forceAt(G, d, stand);
  }
  for (let i = 0; i < 60 * 6 && G.hz.spores.rooms[room]; i++) { watch(); G.simTick(DT); }
  secs(G, 1, watch);
  check(!G.hz.spores.rooms[room] && reactorAir && !why, `${name}: cleared solo — vent ${P.lock}${P.steps.map(([c, p]) => c !== null ? ', force the deck door up' : `, force the ${p[0]}–${p[1]} door`).join('')} (the reactor room keeps its air)${why ? ' — ' + why : ''}`);
}

// --- spores outside (the mother's cloud, a cloud drifting in): the vent panel still vents (a panel isn't smart; it puts out a
// plasma fire, it's the players' mistake to make), but the spores survive it; afterwards venting clears them
{
  const G = fresh(); G.infestRoom('portLock', 'seep'); G.hz.spores.rooms.portLock.glitchT = 1e9;
  G.mission.rules.plasma = true; G.CAPACITORS[0].charge = 3; G.igniteSystem(G.SYSTEMS.find(s => s.ref === G.CAPACITORS[0]));
  check(G.fires.some(f => f.plasma && f.hp > 0), 'a plasma fire in the infested left airlock room');
  G.evs.cloud = { side: 'star', k: 1, hold: 6, t: 0, blow: 0, from: null, gust: null };
  const [px, py] = G.VENT_PANELS.portLock, me = G.me; me.x = px + 0.9; me.y = py; G.simTick(DT);
  const t0 = G.withCrew(me, () => G.clickTarget(px, py));
  check(t0?.ok && !/cloud/i.test(t0.text), `the vent panel works with the cloud outside, and doesn't warn (a panel isn't smart: "${t0?.text}")`);
  check(G.encounterPlates().some(p => p.key === 'sporecloud') && /survive venting/.test(G.encounterPlates().find(p => p.key === 'sporesportLock')?.sub || ''), 'the sidebar (the crew\'s knowledge): SPORE CLOUD OUTSIDE, spores survive venting meanwhile');
  ventAtPanel(G, 'portLock'); secs(G, 3);
  check(G.hz.vent?.room === 'portLock' && G.vacuumRoom('portLock') && !G.fires.some(f => f.plasma && f.hp > 0), 'it vents: the plasma fire is blown out, the room is in vacuum');
  check(!!G.hz.spores.rooms.portLock && /blew right back in/.test(G.combat.banner.text), `but the spores live on ("${G.combat.banner.text}")`);
  secs(G, G.VENT_TIME);
  check(!G.evs.cloud && !G.sporesOutside() && !!G.hz.spores.rooms.portLock, 'the vent closes; the cloud has thinned out meanwhile; the spores are still there');
  const t2 = ventAtPanel(G, 'portLock'); secs(G, G.SPORE_CLEAR + 0.3);
  check(t2?.ok && !G.hz.spores.rooms.portLock, 'venting again, now the cloud is gone: the vacuum kills them');
}
{
  const G = fresh(); G.evs.cloud = { side: 'port', k: 1, hold: 30, t: 0, blow: 0, from: null, gust: null };
  ventAtPanel(G, 'starLock'); secs(G, 1);
  check(G.hz.vent?.room === 'starLock' && !!G.hz.spores.rooms.starLock, 'venting a clean airlock room in the cloud: its outer airlock opens to the cloud, and the room gets the spores');
}
{
  const G = fresh(); G.infestRoom('starLock', 'seep'); G.spawnSpores('port', null, 1, true);
  ventAtPanel(G, 'starLock'); secs(G, G.SPORE_CLEAR + 1);
  check(G.hz.vent?.room === 'starLock' && !!G.hz.spores.rooms.starLock, 'a spore cloud still drifting in counts too: vented, but the spores live on');
}

// --- the spore mother: her scream leaves a cloud round the hull; a chance per gust; an airlock opened in the cloud gets them
{
  const G = fresh(); G.combatSpawn('mother', 'star'); const e = G.combat.enemies[0];
  e.puffT = 0; G.simTick(DT);
  check(e.open > 0 && !!G.evs.cloud && G.evs.cloud.side === 'star' && /don't use the airlocks/.test(G.combat.banner.text), `she screams: the cloud forms round the hull ("${G.combat.banner.text}")`);
  secs(G, G.SAC_OPEN);
  check(e.gusts === G.MOTHER_GUSTS && !G.evs.spores.length, `${G.MOTHER_GUSTS} gusts per scream, no spore pods flying at us`);
  G.combat.enemies.length = 0;                       // (she's gone: no more screams)
  secs(G, G.CLOUD_HOLD - 0.5);
  check(!!G.evs.cloud, `the cloud hangs on ${G.CLOUD_HOLD} s after her last scream …`);
  secs(G, G.CLOUD_FADE + 1);
  check(!G.evs.cloud, `… then thins out over ${G.CLOUD_FADE} s and is gone`);
}
{ // the chance per gust, with a seeded random
  const G = fresh(); G.combatSpawn('mother', 'port'); const e = G.combat.enemies[0];
  const keep = Math.random; Math.random = seeded(4242);
  let n = 0; const N = 400;
  for (let i = 0; i < N; i++) { G.hz.spores.rooms = {}; G.sporeGust(e); if (G.hz.spores.rooms.portLock) n++; if (G.hz.spores.rooms.starLock) n = -1e9; }
  Math.random = keep;
  check(Math.abs(n / N - G.MOTHER_SEEP_CHANCE) < 0.04, `each gust gets spores into the airlock on her side with ${G.MOTHER_SEEP_CHANCE * 100} % (seeded: ${n}/${N}), never the other one`);
  Math.random = () => 0.99; G.hz.spores.rooms = {}; G.sporeGust(e); Math.random = keep;
  check(!rooms(G), 'an unlucky gust: nothing gets in');
}
for (const [label, cloudOn] of [['in the cloud', true], ['after the cloud is gone', false]]) {
  const G = fresh(), h = G.HATCHES[1], me = G.me, c = h.chamber;
  if (cloudOn) G.evs.cloud = { side: 'port', k: 1, hold: 30, t: 0, blow: 0, from: null, gust: null };   // (her cloud, on the OTHER side: any airlock counts)
  me.x = h.inside[0]; me.y = h.inside[1]; G.simTick(DT);
  if (cloudOn) check(/SPORE CLOUD OUTSIDE/.test(me.prompt?.text || ''), `the airlock's prompt warns ("${me.prompt?.text}")`);
  me.x = c.x + c.w / 2; me.y = c.y + c.h / 2; secs(G, 0.5);
  G.withCrew(me, () => G.airlockManual(h)); secs(G, 3);
  check(h.doors.outer > 0.5, `${label}: the right airlock cycled out (outer door open)`);
  check(cloudOn ? G.hz.spores.rooms.starLock && /spores in the right airlock room/.test(G.combat.banner.text) : !rooms(G),
        cloudOn ? `using an airlock in the cloud gets spores into its room, for sure ("${G.combat.banner.text}")` : 'using it once the cloud is gone: no spores');
}
// --- multiplayer: the infestation, glitches and the cloud are plain data in the snapshot; a browser draws from them
{
  const G = fresh(); G.infestRoom('portLock', 'seep'); G.infestRoom('bridge', 'door'); glitch(G, G.CAPACITORS[0], 'portLock');
  G.evs.cloud = { side: 'star', k: 0.7, hold: 5, t: 1, blow: 0.2, from: [60, 12], gust: { side: 'star', t: 0.5 } };
  G.hz.spores.doors['2'] = 0.8; G.hz.spores.shrivel['3'] = 'reactor';
  const snap = JSON.parse(JSON.stringify(G.netSerialize()));
  const H = fresh(); H.netApply(snap, G.me.id);
  check(JSON.stringify(H.hz.spores) === JSON.stringify(G.hz.spores) && JSON.stringify(H.evs.cloud) === JSON.stringify(G.evs.cloud), 'the snapshot carries hz.spores and evs.cloud as they are');
  check(H.sporeGlitching(H.CAPACITORS[0]) && !H.useEnergy(0) && H.encounterPlates().some(p => p.key === 'sporesbridge') && H.problemSpots().some(s => s.key === 'sporesportLock'),
        'the client knows the glitch, shows the cards and the markers');
}

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
