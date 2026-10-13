// Mission script, radar, helm diagnosis, security console (door locks + manual override),
// fires, and the win/lose rules. Units: layout units, times in seconds.

let RADAR_RANGE = 45;                                // (ship upgrades: see progress.js)
const MOCK_WINDOW = [3, 8], MAINT_WARNING = 20;
const JUMP_DELAY = 22, JUMP_WINDOW = 15, MAX_DAMAGE = 3;   // the jump comes mid-battle: 22 s after the final fight starts
const COMBAT_KINDS = new Set(['interceptor', 'frigate', 'swarm', 'intruder', 'saboteur', 'pirates', 'stealth', 'tractor', 'grappler', 'leeches', 'mother', 'mines', 'leviathan', 'brig']);
let FIRE_TIME = 15;
const SPRAY_RANGE = 2.8, SPRAY_RATE = 0.8;

const mission = {
  active: true, t: 0, events: [], revealed: new Set(), scanT: -10, lastScan: null,
  maint: null, diagRun: false, jump: null, over: null, banner: 0,
};
const fires = [];
// Luck: petting the cat makes the dice friendlier for LUCK_TIME seconds.
const LUCK_TIME = 60;
const luck = { t: 0, pet: 0 };
const lucky = () => luck.t > 0;
function petCat() {
  luck.t = LUCK_TIME; luck.pet = 2.5; sfx.purr();          // what this does is a secret: no hints in the UI
  if (typeof hz !== 'undefined') hz.stats.pets++;
}
function updateLuck(dt) { luck.t = Math.max(0, luck.t - dt); luck.pet = Math.max(0, luck.pet - dt); }
let ui = { panel: null, hits: [], override: null };   // the acting crew member's panels (see withCrew)   // modal panels: 'security' | 'diagnosis' | 'override'

// ---------------------------------------------------------------------------
// Mission timeline: everything happens once, about one thing per minute (solo pacing).
// ---------------------------------------------------------------------------
const SIDE_NAME = { port: 'left', star: 'right' };
function eventLabel(ev) {
  if (ev.kind === 'interceptor') return `Interceptor — ${SIDE_NAME[ev.side]}`;
  if (ev.kind === 'frigate') return `Frigate — ${SIDE_NAME[ev.side]}`;
  if (ev.kind === 'swarm') return 'Asteroid swarm — front';
  if (ev.kind === 'intruder') return `Intruder — ${ev.side === 'port' ? 'left' : 'right'} airlock`;
  if (ev.kind === 'saboteur') return `Saboteur — ${ev.side === 'port' ? 'left' : 'right'} airlock`;
  if (ev.kind === 'mines') return `Mine drone — ${SIDE_NAME[ev.side]}`;
  if (ev.kind === 'spores') return `Spore cloud — ${SIDE_NAME[ev.side]}`;
  if (ev.kind === 'canister') return `Fuel canister — ${SIDE_NAME[ev.side]}`;
  return EVENT_LABELS[ev.kind]?.(ev) || ev.kind;
}
// Labels for event kinds defined further on (filled in by the files that add them).
const EVENT_LABELS = {
  debris: (ev) => `Debris — ${GUNS.find(g => g.id === ev.gun)?.name.toLowerCase()}`,
  antenna: () => 'Antenna strike — top',
};
const EVENT_RUNNERS = {};                              // event kinds added by other files: kind → run(ev)
// Missions: each builds a timeline. The lobby picks one.
const randSide = () => (Math.random() < 0.5 ? 'port' : 'star');
const MISSIONS = {
  intro: {
    name: 'Intro run', blurb: 'One of everything, well spaced out. The one you know.',
    crew: {events: [2, 5, 6, 11, 11, 16, 16, 21], cells: [2, 4, 4, 6, 6, 9, 9, 14], reactor: [1, 1, 1, 1, 1, 1, 1, 0.7]},   // --calibrate: 72% 66% 73% 67% 74% 68% 73% 71% idle for 1-8 players
    build(target) {
      const s1 = randSide();
      return [
        { t: 40, kind: 'interceptor', side: s1 },
        { t: 100, kind: 'maintenance', sys: target, radar: false },
        { t: 160, kind: 'frigate', side: s1 === 'port' ? 'star' : 'port' },
        { t: 220, kind: 'swarm' },
        { t: 280, kind: 'intruder', side: randSide() },
      ];
    },
  },
  rush: {
    name: 'Rush hour', blurb: '7 incidents in random order. More trouble.',
    crew: {events: [2, 4, 8, 9, 10, 13, 15, 18], cells: [2, 4, 6, 8, 8, 10, 11, 11], reactor: [1, 1, 1, 1, 1, 0.7, 1, 1], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate: 61% 65% 62% 68% 70% 70% 70% 69% idle for 1-8 players
    needs: {ship: [], overcharge: true},
    rules: { breach: true, surge: true },
    build(target) {
      const kinds = ['interceptor', 'frigate', 'swarm', 'intruder', 'maintenance'];
      const extras = ['interceptor', 'swarm', 'intruder', 'saboteur'];
      for (let i = 0; i < 2; i++) kinds.push(extras[Math.floor(Math.random() * extras.length)]);
      for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
      if (kinds[0] === 'frigate') kinds.push(kinds.shift());          // don't open with the big one
      return kinds.map((kind, i) => ({ t: 30 + i * 40, kind, side: kind === 'swarm' || kind === 'maintenance' ? undefined : randSide(),
                                       sys: kind === 'maintenance' ? target : undefined, radar: kind !== 'maintenance' }));
    },
  },
  deep: {
    name: 'Deep drift', tier: 3, blurb: 'Hard. Hull breaches, plasma fires, failing gravity, things on the hull — and the jump coils need aligning outside.',
    crew: {events: [1, 1, 1, 1, 3, 3, 7, 19], cells: [2, 2, 2, 2, 2, 2, 3, 4]},   // --calibrate: 65% 78% 85% 89% 65% 65% 68% 67% idle for 1-8 players
    rules: { breach: true, surge: true, gravity: true, plasma: true, coils: true, handle: true },
    build(target) {
      return shuffledTimeline(['interceptor', 'frigate', 'swarm', 'intruder', 'saboteur', 'maintenance', 'mines', 'spores', 'debris', 'antenna', 'canister', 'flare', 'storm', 'coolant', 'stealth', 'grappler', 'leeches'], target, 20, 17);
    },
  },
  pirates: {
    name: 'Pirate cove', tier: 2, blurb: 'Defeat the pirates. If their raider docks, they come aboard to steal — board them back.',
    crew: {events: [2, 4, 8, 12, 16, 19, 22, 23], cells: [2, 2, 4, 5, 6, 8, 8, 9]},   // --calibrate: 58% 69% 66% 68% 68% 67% 72% 74% idle for 1-8 players
    needs: {ship: ['cannons'], overcharge: false},
    essential: ['pirates'],                   // never dropped for a small crew (objective / story)
    rules: { breach: true, surge: true }, objective: { kind: 'pirates', count: 2 },
    build(target) { return [makeEvent('pirates', 25, target), ...shuffledTimeline(['interceptor', 'swarm', 'mines', 'maintenance', 'glitch'], target, 70, 40)]; },
  },
  salvage: {
    name: 'Black box', tier: 3, blurb: 'Tether to a derelict, find its black box and bring it home. Something is asleep over there.',
    crew: {events: [2, 5, 8, 11, 15, 18, 22, 23], cells: [2, 2, 2, 5, 5, 7, 8, 8]},   // --calibrate: 62% 71% 71% 68% 69% 68% 68% 69% idle for 1-8 players
    needs: {ship: ['cannons'], overcharge: false},
    rules: { breach: true, surge: true, plasma: true }, objective: { kind: 'blackbox' },
    build(target) { return [makeEvent('derelict', 15, target), ...shuffledTimeline(['interceptor', 'swarm', 'maintenance', 'flare', 'mines', 'coolant'], target, 60, 38)]; },
  },
  rescue: {
    name: 'Stranded engineer', tier: 3, blurb: 'An engineer is hurt aboard a derelict. Treat them and lead them back — they\'re slow.',
    crew: {events: [2, 4, 7, 10, 12, 16, 18, 24], cells: [2, 2, 2, 3, 4, 6, 6, 8], reactor: [1, 1, 1, 0.85, 1, 1, 1, 1]},   // --calibrate: 61% 65% 68% 70% 68% 69% 68% 69% idle for 1-8 players
    rules: { breach: true, surge: true, gravity: true }, objective: { kind: 'rescue' },
    build(target) { return [makeEvent('derelict', 15, target), ...shuffledTimeline(['interceptor', 'stealth', 'maintenance', 'leeches', 'storm', 'intruder', 'saboteur'], target, 60, 34)]; },
  },
  ore: {
    name: 'Ore run', tier: 2, blurb: 'Drill an ore sample out of a big asteroid on a spacewalk while the front cannon keeps the small ones off.',
    crew: {events: [2, 5, 8, 12, 16, 19, 23, 23], cells: [2, 5, 3, 7, 7, 11, 10, 10], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate: 63% 69% 70% 68% 67% 68% 72% 75% idle for 1-8 players
    needs: {ship: ['cannons', 'inserter'], overcharge: true},
    rules: { breach: true }, objective: { kind: 'ore' },
    build(target) { return [makeEvent('rock', 8, target), ...shuffledTimeline(['swarm', 'swarm', 'interceptor', 'maintenance', 'canister', 'debris'], target, 35, 38)]; },
  },
  nightmare: {
    name: 'Nightmare', tier: 4, blurb: 'Everything. All of it. The leviathan too. Good luck.',
    crew: {events: [1, 2, 3, 3, 8, 10, 10, 15], cells: [2, 2, 2, 2, 3, 4, 4, 5], reactor: [1, 1, 1, 0.7, 0.7, 1, 1, 1], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate: 65% 73% 74% 84% 76% 68% 70% 68% idle for 1-8 players
    needs: {ship: ['cannons', 'inserter', 'caps'], overcharge: true},
    rules: { breach: true, surge: true, gravity: true, plasma: true, coils: true, handle: true },
    build(target) {
      return [...shuffledTimeline(['interceptor', 'frigate', 'frigate', 'swarm', 'intruder', 'intruder', 'saboteur', 'maintenance', 'mines', 'spores', 'debris', 'antenna', 'flare', 'storm', 'coolant', 'glitch',
                                   'stealth', 'tractor', 'grappler', 'leeches', 'mother', 'pirates'], target, 15, 13), makeEvent('leviathan', 150, target)];
    },
  },
};
// Build a shuffled timeline from a pool of event kinds, `gap` seconds apart from `start`.
function shuffledTimeline(kinds, target, start, gap) {
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  return kinds.map((kind, i) => makeEvent(kind, start + i * gap, target));
}
function makeEvent(kind, t, target) {
  const ev = { t, kind };
  if (['interceptor', 'frigate', 'intruder', 'saboteur', 'mines', 'spores', 'canister'].includes(kind) || EVENT_SIDES[kind]) ev.side = EVENT_SIDES[kind]?.() || randSide();
  if (kind === 'maintenance') { ev.sys = target; ev.radar = false; }
  if (kind === 'debris') ev.gun = ['port', 'front', 'star'][Math.floor(Math.random() * 3)];
  if (kind === 'antenna' || kind === 'coolant' || kind === 'glitch') ev.radar = false;
  return ev;
}
const EVENT_SIDES = {};                                // event kinds with their own side rule (front-only etc.)

// ---------------------------------------------------------------------------
// Pacing: every mission lasts about MISSION_LENGTH (time to the jump) for any crew; a smaller crew gets
// fewer encounters instead of longer gaps. Per mission and crew size, MISSIONS[id].crew says how many
// events (crew.events[n - 1]) and fuel cells (crew.cells[n - 1]) — fitted by `node tools/balance.js
// --calibrate` for a crew that's ~68% idle. Which events go: never the mission's essential ones
// (MISSIONS[id].essential, plus ESSENTIAL_KINDS), then optional ones in DROP_ORDER (first dropped first),
// so a solo run of a chapter always has the same kind of content. More events than written: repeats
// of the mission's most important optional kinds.
//   The kept events stay in their written order and are spread evenly from the first event's written
// time to MISSION_LENGTH - JUMP_DELAY. The reactor follows the gaps: ENERGY_TIME × gap / the written gap
// (paceFactor), so the energy made per gap is what the mission was written for.
//   Crew joining / leaving: while nobody has seen an encounter yet (the lead-in), the timeline is rebuilt
// for the new crew size (that's also how the server's start works: crew are added right after
// startMission). After that the encounters and their times stay; only the fuel crate gets the new
// size's extra cells if it needs more.
// ---------------------------------------------------------------------------
const MISSION_LENGTH = 360;
const ESSENTIAL_KINDS = new Set(['derelict', 'rock', 'brig', 'leviathan']);
const DROP_ORDER = ['canister', 'antenna', 'debris', 'glitch', 'storm', 'coolant', 'maintenance', 'flare', 'spores', 'mines', 'leeches', 'grappler',
                    'tractor', 'stealth', 'saboteur', 'mother', 'intruder', 'swarm', 'frigate', 'interceptor', 'pirates'];
const crewSize = () => Math.max(1, crew.length);
const missionCrew = (id, n) => { const C = MISSIONS[id]?.crew, i = Math.min(8, Math.max(1, n)) - 1; return { events: C?.events?.[i], cells: C?.cells?.[i] ?? 4, reactor: C?.reactor?.[i] ?? 1, overcharge: !!C?.overcharge?.[i] }; };
// The reactor's ENERGY_TIME multiplier: the gap / the written gap, × the crew size's reactor tuning (crew.reactor,
// < 1 where the energy needs a faster reactor to be in spec).
const paceFactor = () => (mission.gap && mission.writtenGap ? mission.gap / mission.writtenGap * (mission.reactor || 1) : 1);
// The events for a crew of n, from the written list (times as written): essential first, then by DROP_ORDER.
function selectEvents(id, written, n, target) {
  const M = MISSIONS[id] || {}, ess = new Set([...ESSENTIAL_KINDS, ...(M.essential || [])]);
  const want = missionCrew(id, n).events ?? written.length;
  const rank = (e) => (ess.has(e.kind) ? Infinity : DROP_ORDER.indexOf(e.kind) < 0 ? 999 : DROP_ORDER.indexOf(e.kind));
  const order = written.map((e, i) => ({ e, i })).sort((a, b) => rank(b.e) - rank(a.e) || a.i - b.i);   // most important first; ties: the earlier one
  const keep = order.slice(0, Math.max(order.filter(o => rank(o.e) === Infinity).length, Math.min(want, written.length))).map(o => o.e);
  // the finale (the last fight) shouldn't be an objective's event (it needs more than the 22 s before the jump)
  const objective = new Set(M.essential || []), optionalFight = order.find(o => rank(o.e) !== Infinity && COMBAT_KINDS.has(o.e.kind) && !keep.includes(o.e));
  if (objective.size && optionalFight && keep.filter(e => COMBAT_KINDS.has(e.kind)).every(e => objective.has(e.kind))) keep.push(optionalFight.e);
  const extra = [...new Set(order.filter(o => rank(o.e) !== Infinity).map(o => o.e.kind))];   // repeats: most important optional kinds, in turn
  for (let i = 0; keep.length < want && extra.length; i++) keep.push({ ...makeEvent(extra[i % extra.length], Infinity, target), repeat: true });
  return written.filter(e => keep.includes(e)).concat(keep.filter(e => e.repeat));
}
function layoutMission(id, n) {
  const M = MISSIONS[id] || MISSIONS.intro, written = mission.written;
  const evs = selectEvents(id, written, n, mission.maint?.target).map((e, i) => ({ ...e, id: i, done: false, radar: e.radar !== false,
    sys: e.kind === 'maintenance' ? mission.maint?.target : e.sys }));
  if (!evs.length) { Object.assign(mission, { events: [], lead: Infinity, gap: null, writtenGap: null, paceN: n, jumpAt: M.practice ? Infinity : JUMP_DELAY, overcharge: false }); return; }
  const lead = Math.min(...written.map(e => e.t)), end = (M.length || MISSION_LENGTH) - JUMP_DELAY;
  const gap = evs.length > 1 ? (end - lead) / (evs.length - 1) : end - lead;
  evs.forEach((e, i) => { e.t1 = e.repeat ? null : e.t; e.t = evs.length > 1 ? lead + i * gap : end; });   // (t1: the time as written; a lone event is the finale)
  // the finale: the last event is a fight, and the jump comes while it's still going
  // (and not an objective's event: it needs more than the 22 s before the jump)
  const sorted = () => [...evs].sort((a, b) => a.t - b.t), objective = new Set(M.essential || []);
  let last = sorted().pop();
  if (last && (!COMBAT_KINDS.has(last.kind) || objective.has(last.kind))) {
    const fight = sorted().filter(e => e !== last && COMBAT_KINDS.has(e.kind) && !objective.has(e.kind)).pop();
    if (fight) [fight.t, last.t] = [last.t, fight.t];
  }
  const wl = written.length > 1 ? (Math.max(...written.map(e => e.t)) - lead) / (written.length - 1) : gap;
  Object.assign(mission, { events: evs, lead, gap, writtenGap: wl || gap, paceN: n, jumpAt: M.practice ? Infinity : Math.max(0, ...evs.map(e => e.t)) + JUMP_DELAY });
  mission.overcharge = missionCrew(id, n).overcharge; mission.reactor = missionCrew(id, n).reactor;
}
// Fuel: the cells this crew size needs (the reactor's own cell plus the crate), on top of what's been
// given already (never taken back).
function crewFuel(n) {
  const want = missionCrew(mission.id, n).cells - 1;
  if (want > (mission.crewCells ?? -1)) { power.reserve += want - Math.max(0, mission.crewCells ?? 0); mission.crewCells = want; }
}
// Someone joined or left: in the lead-in the timeline is rebuilt for the new crew size; after that the
// encounters and their times stay (the mission keeps its length; a late joiner just makes it easier),
// and the crate gets the new size's extra fuel cells if it needs more.
function crewChanged(n) {
  if (!mission.events.some(e => e.done) && mission.t < mission.lead) layoutMission(mission.id, n);
  mission.paceN = n;
  crewFuel(n);
}
function startMission(id = 'intro', opts = {}) {
  applyShipUpgrades(opts.ship || {});
  const candidates = SYSTEMS.filter(s => !s.broken);
  const pick = () => candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
  const target = pick(), decoy = pick();
  resetHazards(); resetEncounters(); resetOrganic(); resetDock(); resetEva((MISSIONS[id] || MISSIONS.intro).rules || {});
  Object.assign(mission, {
    rules: { ...((MISSIONS[id] || MISSIONS.intro).rules || {}) }, objective: (MISSIONS[id] || MISSIONS.intro).objective || null,
    id, active: true, coilsChecked: false, t: 0, revealed: new Set(), scanT: -10, lastScan: null, diagRun: false, jump: null, over: null,
    maint: { target, decoy, serviced: false }, crewCells: undefined,
  });
  mission.written = (MISSIONS[id] || MISSIONS.intro).build(target).map(({ sys, ...e }) => e);   // the timeline as written (no part refs: it's sent to browsers)
  layoutMission(id, crewSize());
  if (mission.objective?.kind === 'ore' && !ITEMS.some(i => i.kind === 'drill')) ITEMS.push({ kind: 'drill', x: 4.2, y: 21.8 });   // the mining drill, left airlock room
  power.reserve = 0; crewFuel(crewSize());              // (the crew's cells, then the ship's spare cell on top)
  shipStartExtras(opts.ship || {});
  mission.upgrades = { ...(opts.ship || {}) }; mission.runId = `${Date.now().toString(36)}-${newUid()}`; mission.kills = 0;
  for (const c of crew) applyKit(c, c.kit);
  combatBanner('Jumped into the hot zone. Survive until the jump drive is ready!');
}

function runEvent(ev) {
  ev.done = true;
  if (ev.kind === 'interceptor' || ev.kind === 'frigate') combatSpawn(ev.kind, ev.side);
  else if (ev.kind === 'swarm') combatSpawn('swarm');
  else if (ev.kind === 'intruder') spawnInvader(ev.side);
  else if (ev.kind === 'saboteur') spawnSaboteur(ev.side);
  else if (ev.kind === 'maintenance' && !mission.maint.serviced && !ev.sys.broken) breakSystem(ev.sys);
  else if (ev.kind === 'mines') spawnMineDrone(ev.side);
  else if (ev.kind === 'spores') spawnSpores(ev.side);
  else if (ev.kind === 'debris') jamCannon(ev.gun);
  else if (ev.kind === 'antenna') knockAntenna();
  else if (ev.kind === 'canister') spawnCanister(ev.side);
  else EVENT_RUNNERS[ev.kind]?.(ev);
}

function updateMission(dt) {
  if (!mission.active || mission.over) return;
  mission.t += dt;
  if (crewSize() !== mission.paceN) crewChanged(crewSize());            // someone joined or left
  for (const ev of mission.events) if (!ev.done && mission.t >= ev.t) runEvent(ev);
  // jump: after the last encounter the drive tries for JUMP_WINDOW seconds; it needs energy in the engine room
  if (mission.t >= mission.jumpAt && !mission.jump && !mission.coilsChecked) {          // misaligned jump coils: the drive takes longer
    mission.coilsChecked = true;
    const extra = coilDelay();
    if (extra) { mission.jumpAt += extra; combatBanner(`Jump coils misaligned — the jump drive needs ${extra} s longer!`); }
  }
  if (mission.t >= mission.jumpAt && !mission.jump) { mission.jump = { t: 0 }; combatBanner('Jump drive spooling up — it needs energy in the middle capacitor!'); sfx.say?.('Jump drive spooling up.'); }
  if (mission.jump) {
    mission.jump.t += dt;
    const pulled = !mission.rules?.handle || (mission.jump.pull || 0) >= JUMP_PULL;      // harder missions: someone has to pull the handle
    if (pulled && !broken(CAPACITORS[1]) && CAPACITORS[1].charge > 0) {
      CAPACITORS[1].charge--;
      const obj = objectiveStatus();
      if (obj.done) endMission(true, 'Jumped out safely.'); else endMission(false, `Jumped out safely — but ${obj.fail}. Mission failed.`, true);
      return;
    }
    if (mission.jump.t >= JUMP_WINDOW * (mission.rules?.handle ? 2 : 1)) { endMission(false, 'The jump drive never got energy — stranded in the hot zone.'); return; }
  }
  const dmg = SYSTEMS.filter(s => s.broken).length;
  if (dmg > MAX_DAMAGE) endMission(false, `The ship fell apart (${dmg} systems broken at once).`);
}
// The mission's objective (beyond surviving): { done, fail (what's missing), text }.
function objectiveStatus() {
  const o = mission.objective;
  if (!o) return { done: true };
  if (o.kind === 'blackbox') return { done: objectiveAboard('blackbox'), fail: 'without the black box', text: 'Bring the black box from the derelict aboard' };
  if (o.kind === 'rescue') return { done: dk.npc?.state === 'safe', fail: `without ${npcName()}`, text: `Rescue ${npcName()}` };
  if (o.kind === 'ore') return { done: objectiveAboard('ore'), fail: 'without an ore sample', text: 'Drill an ore sample and bring it aboard' };
  if (o.kind === 'intruder') return { done: (mission.kills || 0) >= o.count, fail: 'with the intruder still alive', text: 'Kill the intruder' };
  if (o.kind === 'pirates') return { done: dk.defeated >= o.count, fail: `with only ${dk.defeated}/${o.count} pirates defeated`, text: `Defeat ${o.count} pirates (${dk.defeated} so far)` };
  return { done: true };
}
function endMission(won, reason, survived = won) {
  mission.over = { won, reason, t: mission.t, survived, results: missionResults(!!survived) };
  for (const e of combat.enemies) e.stopCharge?.();
  if (won) sfx.win(); else sfx.explosion();
}

// Radar: reveals everything coming in the next RADAR_RANGE seconds, for the whole crew.
function radarScan() {
  mission.scanT = mission.t; mission.lastScan = mission.t;
  if (!evs.antenna) { sfx.empty(); combatBanner('Radar: garbled echoes — the antenna outside is knocked crooked'); return; }
  if (enc.storm) { sfx.empty(); combatBanner('Radar: nothing but static — ion storm'); return; }
  for (const e of combat.enemies) if (e.D.stealth) e.reveal = 3;           // the ping lights up cloaked ships for a moment
  let n = 0;
  for (const ev of mission.events) if (ev.radar && !ev.done && ev.t - mission.t <= RADAR_RANGE && !mission.revealed.has(ev.id)) { mission.revealed.add(ev.id); n++; }
  sfx.poi();
  combatBanner(n ? `Radar: ${n} contact${n > 1 ? 's' : ''} in the next ${RADAR_RANGE} s` : `Radar: nothing in the next ${RADAR_RANGE} s`);
}

// Helm diagnosis: two systems look shaky from the start; one really fails.
function diagState(s) {
  if (s.broken) return { col: '#ff5a4a', text: 'BROKEN' };
  const m = mission.maint;
  if (!mission.active || !m || m.serviced) return null;
  const ev = mission.events.find(e => e.kind === 'maintenance');
  if (!ev) return null;                              // no maintenance failure in this mission
  if (s === m.target && !ev.done && ev.t - mission.t <= MAINT_WARNING) return { col: '#ff9a2e', text: `FAILING — breaks in ${Math.ceil(ev.t - mission.t)} s`, orange: true };
  if ((s === m.target && !ev.done) || s === m.decoy) return { col: '#ffd84a', text: 'irregular readings' };
  return null;
}
// The repair kit can service the failing system while it's orange; then it doesn't break.
function serviceTarget() {
  const m = mission.maint;
  return m && !m.serviced && diagState(m.target)?.orange ? m.target : null;
}

// ---------------------------------------------------------------------------
// Fires: every fire sits on a ship part. Small hits: 20% a fire, 10% a broken part, else nothing.
// Big hits: always exactly one broken part (systems.js damageColumn) and a fire. Luck (the cat)
// makes the fire chances and the small-hit break chance 10% smaller (relative). Every FIRE_TIME (roughly) an ignored fire
// spreads to a part in the same or an adjacent room (1/3), burns out its part (1/3; half of those
// it goes out with it) or just keeps burning (1/3). Luck makes spreading and burning-out-but-
// still-burning 10% less likely.
// ---------------------------------------------------------------------------
const colOfSide = (side) => side === 'port' ? 0 : side === 'star' ? 2 : 1;
// Rooms a part belongs to (parts between the decks belong to the rooms above and below).
function sysRooms(s) {
  const r = roomAt(s.x, s.y);
  if (r) return [r];
  return [roomAt(s.x, SPINE_Y0 - 1), roomAt(s.x, SPINE_Y1 + 1)].filter(Boolean);
}
function adjacentRooms(room) {
  return ROOMS.filter(r => r !== room && (r.col === room.col || (r.deck === room.deck && Math.abs(r.col - room.col) === 1)));
}
const burning = (s) => fires.some(f => f.sys === s && f.hp > 0);
// Each fire's next spread comes after its own, slightly random time (so fires don't all spread in step).
const firePeriod = (plasma) => (plasma ? PLASMA_TIME : FIRE_TIME) * (0.75 + Math.random() * 0.5);
const fireLeft = (f) => (f.period || (f.plasma ? PLASMA_TIME : FIRE_TIME)) - f.t;
function igniteSystem(s, plasma = false) {
  if (!s || burning(s)) return false;
  if (sysRooms(s).some(r => vacuumRoom(r.id))) return false;            // no air, no fire
  plasma = (plasma || (!!mission.rules?.plasma && plasmaPart(s))) && inPlasmaRoom(s);   // plasma fires only in the lower side rooms
  fires.push({ uid: newUid(), sys: s, x: s.x + 0.35, y: s.y + 0.45, hp: 1, t: 0, seed: Math.random() * 100, plasma, period: firePeriod(plasma) });
  hz.stats.fires++;
  if (plasma) { combatBanner(`PLASMA FIRE at the ${s.name.toLowerCase()}! Extinguishers won't do — vent the room at its airlock panel.`); sfx.say?.('Plasma fire. Vent the room.'); }
  else combatBanner(`Fire at the ${s.name.toLowerCase()}! Grab a fire extinguisher.`);
  return true;
}
const HIT_FIRE = 0.2, HIT_BREAK = 0.1, LUCK_CUT = 0.9;   // small hits: fire / broken part (exclusive); luck: x0.9 on both
// A fire on one of the 3 parts on that side nearest to the hit (intact ones first).
function fireNear(side, x, y) {
  const col = colOfSide(side), free = SYSTEMS.filter(s => s.col === col && !burning(s));
  const near = (l) => l.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, 3);
  const intact = free.filter(s => !s.broken), pool = near(intact.length ? intact : free);
  return igniteSystem(pool[Math.floor(Math.random() * pool.length)]);
}
function smallHit(side, x, y) {
  const k = lucky() ? LUCK_CUT : 1, r = Math.random(), pFire = HIT_FIRE * k;
  if (r < pFire) fireNear(side, x, y);
  else if (r < pFire + HIT_BREAK * k) {
    const intact = SYSTEMS.filter(s => s.col === colOfSide(side) && !s.broken);
    if (intact.length) breakSystem(intact[Math.floor(Math.random() * intact.length)]);
  }
}
// Big hits: the broken parts come from damageColumn; this adds the fire.
function bigHitFire(side, x, y) {
  if (Math.random() < (lucky() ? LUCK_CUT : 1)) fireNear(side, x, y);
}
// Debug: start a fire on the part nearest to (x, y).
function spawnFire(x, y) {
  const s = SYSTEMS.filter(s => !burning(s)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
  igniteSystem(s);
}
function updateFires(dt) {
  for (const f of [...fires]) {
    f.t += dt;
    if (fireLeft(f) > 0) continue;
    f.t = 0; f.period = firePeriod(f.plasma);
    if (!f.plasma) {                               // 1/3 spread, 1/6 burn out the part and keep burning, 1/6 burn it out and go out, 1/3 nothing
      const r = Math.random(), k = lucky() ? LUCK_CUT : 1, pSpread = k / 3, pBurn = k / 6;
      if (r < pSpread) { /* spreads: below */ }
      else if (r < pSpread + pBurn) { if (!f.sys.broken) breakSystem(f.sys); continue; }
      else if (r < pSpread + pBurn + 1 / 6) { if (!f.sys.broken) breakSystem(f.sys); scorch(f.x, f.y); fires.splice(fires.indexOf(f), 1); continue; }
      else continue;
    } else if (!f.sys.broken && Math.random() < 0.5) { breakSystem(f.sys); continue; }   // plasma: burns out its part or spreads
    const rooms = sysRooms(f.sys), near = new Set([...rooms, ...rooms.flatMap(adjacentRooms)]);
    const pool = SYSTEMS.filter(s => s !== f.sys && !burning(s) && sysRooms(s).some(r => near.has(r)));
    const intact = pool.filter(s => !s.broken);
    const to = (intact.length ? intact : pool)[Math.floor(Math.random() * (intact.length || pool.length))];
    if (to) igniteSystem(to, f.plasma && sysRooms(to).some(r => sysRooms(f.sys).includes(r))); else if (!f.sys.broken) breakSystem(f.sys);   // (plasma stays in its room)
  }
  for (let i = fires.length - 1; i >= 0; i--) if (fires[i].hp <= 0) { scorch(fires[i].x, fires[i].y); hz.stats.firesOut++; fires.splice(i, 1); }
}
// Spraying the extinguisher (right mouse held): a cone of foam towards the mouse.
function spray(mx, my, dt) {
  const a = Math.atan2(my - player.y, mx - player.x);
  player.face = a;
  sprayDock(a, dt);
  for (let i = 0; i < 3; i++) {
    const q = a + (Math.random() - 0.5) * 0.7, sp = 5 + Math.random() * 3;
    combatFx(player.x + Math.cos(a) * 0.4, player.y + Math.sin(a) * 0.4, Math.cos(q) * sp, Math.sin(q) * sp, 0.45, Math.random() < 0.5 ? '#ffffff' : '#dfe8f0', 0.09 + Math.random() * 0.06);
  }
  for (const f of fires) {
    const d = Math.hypot(f.x - player.x, f.y - player.y), off = Math.abs(wrapAngle(Math.atan2(f.y - player.y, f.x - player.x) - a));
    if (d >= SPRAY_RANGE || off >= 0.45) continue;
    if (f.plasma) { f.hp = Math.max(0.6, f.hp - SPRAY_RATE * dt); f.t = Math.max(0, f.t - dt * 2); continue; }   // only pushes it back
    f.hp -= SPRAY_RATE * dt; if (f.hp <= 0) combatBanner('Fire out');
  }
  if (Math.random() < dt * 6) sfx.spray();
}

// ---------------------------------------------------------------------------
// Door locks (security console) and manual override
// ---------------------------------------------------------------------------
const lockables = () => [
  ...DOORWAYS.map((d, i) => ({ ref: d, kind: 'door', name: `Door ${['left–bridge', 'bridge–right', 'left–reactor', 'reactor–right'][i]}`, x: d.x + d.w / 2, y: d.y + d.h / 2 })),
  ...DECK_LOCKS.map(Lk => ({ ref: Lk, kind: 'lock', name: `${['Left', 'Middle', 'Right'][Lk.col]} deck airlock`, x: Lk.x + Lk.w / 2, y: (SPINE_Y0 + SPINE_Y1) / 2 })),
  ...HATCHES.map(h => ({ ref: h, kind: 'hatch', name: `${h.side === 'port' ? 'Left' : 'Right'} outer airlock`, x: h.x, y: h.y })),
];
// onDone: what the third bonk does (default: unlock). Broken doors use it to force themselves open.
function startOverride(ref, name, onDone) { ui.panel = 'override'; ui.override = { ref, name, hits: 0, swing: 0, onDone }; }
// Broken deck airlock: force open the closed door nearest to you (it stays stuck open).
function forceDeckLock(Lk) {
  const mid = (SPINE_Y0 + SPINE_Y1) / 2, inside = player.y > SPINE_Y0 && player.y < SPINE_Y1;
  let side = player.y < mid ? 'top' : 'bottom';
  if (inside && Lk.doors[side] > 0.95) side = side === 'top' ? 'bottom' : 'top';   // that one's already open: the other
  Lk.doors[side] = 1; Lk.open = side; Lk.phase = 'idle'; Lk.locked = false;
}
const OVERRIDE_SWING = 0.55, OVERRIDE_IMPACT = 0.62;
let ovFx = null;                                     // this browser's sparks / dents for the override panel   // swing length; the slam lands at 62% of it
function overrideHit() {
  const o = ui.override;
  if (o.swing > 0 || o.hits >= 3) return;
  o.hits++; o.swing = OVERRIDE_SWING;
  if (o.hits >= 3) o.doneT = 1.0;                  // let the last hit play out, then the door gives
}
// Per crew member, every tick: swing timer and the door giving way after the third hit.
function updateOverride(dt) {
  const o = ui.override;
  if (!o) return;
  o.swing = Math.max(0, o.swing - dt);
  if (o.doneT !== undefined && (o.doneT -= dt) <= 0) {
    if (o.onDone) o.onDone(); else o.ref.locked = false;
    combatBanner(`${o.name}: forced open`); ui.panel = null; ui.override = null;
  }
}

// ---------------------------------------------------------------------------
// Clickable mission stations: radar (map table), helm (diagnosis), security console
// ---------------------------------------------------------------------------
const SECURITY = STATIONS.find(s => s.name === 'Security');
const HELM = STATIONS.find(s => s.name === 'Helm');
// Consoles and the like you click (also marked with brackets, see interior.js).
function stationSpots() {
  return [
    { x: CAT.x, y: CAT.y, r: 0.55, name: 'The cat', text: 'Click: pet the cat', run: petCat },
    { x: 22.2, y: 6.4, r: 1.2, name: 'Radar', text: 'Click: use the radar dish (point it, ping, see what comes in the next 45 s)', run: openRadar },
    { x: HELM.x, y: HELM.y + 0.5, r: 0.9, name: 'Helm', text: 'Click: run systems diagnosis (calibrate the scope first)', run: openScope },
    { x: SECURITY.x, y: SECURITY.y + 0.5, r: 0.9, name: 'Security console', text: 'Click: open the security console (lock doors)', run: () => { ui.panel = 'security'; } },
  ];
}
function missionClickTarget(mx, my) {
  const svc = serviceTarget();
  if (svc && Math.hypot(mx - svc.x, my - svc.y) <= svc.r) {
    if (inv.weapon !== 'repair') return { text: `${svc.name} is failing — service it with the repair kit`, ok: false, x: svc.x, y: svc.y, r: svc.r };
    if (!near(svc.x, svc.y, REACH + svc.r * 0.6)) return { text: `${svc.name} — get closer`, ok: false, x: svc.x, y: svc.y, r: svc.r };
    return { text: `Hold click: service the ${svc.name.toLowerCase()} before it breaks`, ok: true, repair: svc, service: true, x: svc.x, y: svc.y, r: svc.r };
  }
  for (const s of stationSpots()) {
    if (Math.hypot(mx - s.x, my - s.y) > s.r) continue;
    if (!near(s.x, s.y, REACH + 0.6)) return { text: `${s.name} — get closer`, ok: false, x: s.x, y: s.y, r: s.r };
    return { text: s.text, ok: true, x: s.x, y: s.y, r: s.r, run: s.run };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// Fire sprites (tools/blender/models/fx/fire.py): fx/fire_s/m/l rendered at s = 0.95 / 1.24 / 1.6,
// plasma_m/l at 1.31 / 1.6; the nearest one, scaled to the fire's s. 8-frame loop at ~12 fps (each
// fire starts at its own frame), unlit (flames are light), depth-tested but not writing depth (so
// crew in front or behind sort right through the soft edges). Smoke: fx/smoke_* puffs rising above.
const FIRE_SPRITES = [['fx/fire_s', 0.95], ['fx/fire_m', 1.24], ['fx/fire_l', 1.6]], PLASMA_SPRITES = [['fx/plasma_m', 1.31], ['fx/plasma_l', 1.6]];
function drawFireSprite(f, s, t) {
  const [name, s0] = (f.plasma ? PLASMA_SPRITES : FIRE_SPRITES).reduce((a, b) => (Math.abs(b[1] - s) < Math.abs(a[1] - s) ? b : a));
  if (!GFX.sprite(name, Math.floor(t * 12 + f.seed * 7) % 8, f.x, f.y, 0, { scale: s / s0, unlit: true, depthWrite: false })) return false;
  for (let i = 0; i < 3; i++) {
    const q = (t * 0.5 + i / 3 + f.seed) % 1;
    fxSmoke(f.x + Math.sin(t + i) * 0.12, f.y + 0.02, (0.9 + q * 1.4) * s, (0.18 + q * 0.35) * s, 0.55 * (1 - q) * Math.min(1, q * 6), i + Math.floor(f.seed));
  }
  return true;
}
function drawFires(t) {
  for (const f of fires) {
    const x = L(f.x), y = L(f.y), s = (0.55 + 0.45 * f.hp) * 1.6;
    if (!GFX.on) {                                   // (sprites: the fire is a real light, js/lights.js)
      const g = ctx.createRadialGradient(x, y, 0, x, y, L(1.6) * s);
      g.addColorStop(0, `rgba(255,150,50,${0.35 + 0.05 * Math.sin(t * 7 + f.seed)})`); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, L(1.6) * s, 0, TAU); ctx.fill();
    }
    const sprited = GFX.on && drawFireSprite(f, s, t);
    // a cluster of teardrop flames, each in three layers (red → orange → yellow-white core)
    if (!sprited) {
      const tongues = [[-0.3, 0.75, 0], [0.25, 0.9, 1.7], [0, 1.15, 3.1], [-0.12, 0.6, 4.4], [0.38, 0.55, 5.6]];
      for (const [layer, col, k] of f.plasma ? [[1, '#7a3ad8', 1.15], [0.72, '#c08aff', 0.85], [0.42, '#ffffff', 0.6]] : [[1, '#d8401c', 1], [0.72, '#ff9a2e', 0.78], [0.42, '#fff0a8', 0.55]]) {
        for (const [ox, hgt, ph] of tongues) {
          const flick = 0.85 + 0.15 * Math.sin(t * 11 + ph + f.seed) + 0.08 * Math.sin(t * 23 + ph * 2);
          const h = L(hgt) * s * k * flick, w = L(0.22) * s * layer, bx = x + L(ox) * s * 0.9, by = y + L(0.15) * s;
          const tipX = bx + Math.sin(t * 5 + ph) * w * 0.8;
          ctx.beginPath(); ctx.moveTo(bx - w, by);
          ctx.bezierCurveTo(bx - w * 1.1, by - h * 0.45, tipX - w * 0.3, by - h * 0.8, tipX, by - h);
          ctx.bezierCurveTo(tipX + w * 0.3, by - h * 0.8, bx + w * 1.1, by - h * 0.45, bx + w, by);
          ctx.quadraticCurveTo(bx, by + w * 0.6, bx - w, by);
          ctx.fillStyle = col; ctx.fill();
          if (layer === 1) { ctx.strokeStyle = 'rgba(60,15,5,0.5)'; ctx.lineWidth = 1.5; ctx.stroke(); }
        }
      }
    }
    for (let i = 0; i < 4; i++) {                    // embers (rising: lifted in the tilted view)
      const q = (t * 0.9 + i / 4 + f.seed) % 1;
      ctx.fillStyle = `rgba(255,200,90,${1 - q})`;
      ctx.fillRect(x + Math.sin(i * 3 + f.seed + t) * L(0.4) * s, y - (sprited ? L(GFX.lift(0.4 + q * 1.6)) : q * L(1.4)) * s, 2.5, 2.5);
    }
    if (!sprited) for (let i = 0; i < 3; i++) {      // smoke
      const q = (t * 0.5 + i / 3 + f.seed) % 1;
      ctx.beginPath(); ctx.arc(x + Math.sin(t + i) * 6, y - L(0.6) - q * L(1.4), L(0.18 + q * 0.35) * s, 0, TAU);
      ctx.fillStyle = `rgba(60,60,64,${0.4 * (1 - q)})`; ctx.fill();
    }
    // time until it spreads / breaks something (in the tilted view: in front of the flames' base)
    ctx.beginPath(); ctx.arc(x, y + L(sprited ? 0.75 : 0.45), 7, -Math.PI / 2, -Math.PI / 2 + (f.t / (f.period || (f.plasma ? PLASMA_TIME : FIRE_TIME))) * TAU);
    ctx.strokeStyle = 'rgba(255,90,60,0.9)'; ctx.lineWidth = 3; ctx.stroke();
  }
}

// Vertical sliding door in a doorway (between rooms); red bar when locked.
function drawDoorways() {
  for (const d of DOORWAYS) {
    const x = L(d.x), y = L(d.y), w = L(d.w), h = L(d.h), ph = (h / 2) * (1 - d.open);
    if (ph > 0.5) for (const s of [0, 1]) {
      const py = s ? y + h - ph : y;
      if (d.blast) { hazardStripe(x, py, w, ph); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.strokeRect(x, py, w, ph); continue; }   // heavy blast shutter
      ctx.fillStyle = '#7a8396'; ctx.fillRect(x + 2, py, w - 4, ph);
      ctx.fillStyle = d.locked ? '#e2574c' : C.hazard; ctx.fillRect(x + 2, s ? py : py + ph - 5, w - 4, 5);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(x + 2, py, w - 4, ph);
    }
    if (d.locked) { ctx.beginPath(); ctx.arc(x + w / 2, y - 8, 4, 0, TAU); ctx.fillStyle = '#e2574c'; ctx.fill(); stroke(1.2); }
  }
}

// What the radar list shows: revealed contacts, plus a mocking "????" for anything
// unrevealed that's about to arrive.
function radarList() {
  const known = mission.events.filter(e => mission.revealed.has(e.id) && (!e.done || mission.t - e.t < 3));
  const mocks = mission.events.filter(e => {
    const dt = e.t - mission.t;
    return e.radar && !e.done && !mission.revealed.has(e.id) && dt <= MOCK_WINDOW[1] && dt >= MOCK_WINDOW[0];
  });
  return { known, mocks };
}

function fmt(t) { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

// Modal panels (security map, diagnosis, manual override) and the end screen.
function drawPanels(t) {
  ui.hits = [];
  if (ui.panel === 'security') drawSecurityPanel();
  else if (ui.panel === 'diagnosis') drawDiagnosisPanel();
  else if (ui.panel === 'override') drawOverridePanel(t);
  else if (ui.panel === 'mini') drawMiniPanel(t);
  if (mission.over) drawEndScreen();
}
function panelFrame(w, h, title) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, VW, VH);
  const x = VW / 2 - w / 2, y = VH / 2 - h / 2;
  rr(x, y, w, h, 12); ctx.fillStyle = 'rgba(14,17,24,0.96)'; ctx.fill(); stroke(2, '#5fd6a0');
  ctx.fillStyle = '#e8ecf4'; ctx.font = '700 16px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(title, x + 18, y + 24);
  ctx.fillStyle = '#9aa3b5'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('E / Esc to close', x + w - 18, y + 24); ctx.textAlign = 'left';
  return [x, y];
}
function drawSecurityPanel() {
  if (enc.glitch) return drawRebootPanel();
  if (enc.storm) {                                   // ion storm: just static
    const w = 520, h = 300, [x, y] = panelFrame(w, h, 'SECURITY — no signal (ion storm)');
    for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(200,210,220,${Math.random() * 0.5})`; ctx.fillRect(x + 20 + Math.random() * (w - 40), y + 50 + Math.random() * (h - 80), 2, 2); }
    return;
  }
  const w = Math.min(860, VW - 40), h = Math.min(560, VH - 40), [x, y] = panelFrame(w, h, 'SECURITY — click a door or airlock to lock / unlock it');
  const s = Math.min((w - 60) / (SHIP_W + 4), (h - 90) / (SHIP_H + 6)), ox = x + w / 2 - (SHIP_W / 2) * s, oy = y + 60 + 3.5 * s;
  const P = (px, py) => [ox + px * s, oy + py * s];
  poly(HULL.map(([a, b]) => P(a, b))); ctx.fillStyle = '#262b35'; ctx.fill(); stroke(1.5, '#4b5263');
  for (const r of ROOMS) for (const q of r.rects) {
    const [a, b] = P(q.x, q.y); ctx.fillStyle = 'rgba(95,214,160,0.12)'; ctx.fillRect(a, b, q.w * s, q.h * s);
    ctx.strokeStyle = 'rgba(95,214,160,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(a, b, q.w * s, q.h * s);
  }
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const r of ROOMS) { const [cx, cy] = P(...roomCenter(r)); ctx.fillStyle = 'rgba(200,220,210,0.45)'; ctx.fillText(r.name.toUpperCase(), cx, cy - 18); }
  const blip = (x, y, col, big) => {                    // red blips for enemies, blue for friends
    const [bx, by] = P(x, y), k = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.beginPath(); ctx.arc(bx, by, (big ? 9 : 7) + k * 5, 0, TAU); ctx.fillStyle = col.replace('1)', `${0.25 * (1 - k)})`); ctx.fill();
    ctx.beginPath(); ctx.arc(bx, by, big ? 6 : 5, 0, TAU); ctx.fillStyle = col; ctx.fill(); stroke(1.5);
  };
  for (const c of crew) if (c.mode === 'inside' || c.mode === 'hatch') blip(c.x, c.y, 'rgba(90,170,255,1)', c === player);
  if (dk.npc) blip(dk.npc.x, dk.npc.y, 'rgba(90,170,255,1)', false);
  for (const a of boarding.invaders) if (a.state !== 'dormant' && a.mode !== 'cloaked') blip(a.x, a.y, 'rgba(255,70,60,1)', true);
  for (const p of dk.pirates) blip(p.x, p.y, 'rgba(255,70,60,1)', true);
  for (const [li, l] of lockables().entries()) {
    const [cx, cy] = P(l.x, l.y), hover = Math.hypot(mouse.x - cx, mouse.y - cy) < 15;
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, TAU); ctx.fillStyle = l.ref.locked ? '#7a2420' : '#1d4a36'; ctx.fill(); stroke(hover ? 3 : 1.5, l.ref.locked ? '#ff6a5a' : '#5fd6a0');
    ctx.fillStyle = '#ffffff'; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(l.ref.locked ? '🔒' : { door: 'D', lock: 'A', hatch: 'H' }[l.kind], cx, cy + 1);
    ui.hits.push({ x: cx, y: cy, r: 15, cmd: ['lock', li] });
    if (hover) { ctx.fillStyle = '#e8ecf4'; ctx.fillText(`${l.name}: ${l.ref.locked ? 'locked' : 'open'}`, cx, cy + 24); }
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9aa3b5'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('D door · A deck airlock · H outer airlock — locked doors can still be forced with a manual override. Red: enemies · blue: crew.', x + 18, y + h - 18);
}
// During an AI glitch the console only shows the reboot switches (the order is on the helm).
function drawRebootPanel() {
  const w = 520, h = 300, [x, y] = panelFrame(w, h, 'SECURITY — AI REBOOT (order is shown on the helm)');
  const g = enc.glitch;
  ['A', 'B', 'C'].forEach((name, i) => {
    const cx = x + w / 2 + (i - 1) * 140, cy = y + 150, hover = Math.hypot(mouse.x - cx, mouse.y - cy) < 45;
    rr(cx - 40, cy - 60, 80, 120, 10); ctx.fillStyle = '#262b35'; ctx.fill(); stroke(2, hover ? '#5fd6a0' : '#4b5263');
    const done = g.order.indexOf(i) < g.step;
    rr(cx - 12, done ? cy - 40 : cy, 24, 40, 6); ctx.fillStyle = done ? '#5fd6a0' : '#c9ced8'; ctx.fill(); stroke(2);
    ctx.fillStyle = '#e8ecf4'; ctx.font = '800 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, cx, cy + 78);
    ui.hits.push({ x: cx, y: cy, w: 80, h: 120, cmd: ['reboot', i] });
  });
  ctx.textAlign = 'left';
}
function drawDiagnosisPanel() {
  const scope = ui.mini?.kind === 'scope', w = 560, rows = SYSTEMS.length, h = scope && !ui.mini.ok ? 230 : Math.min(VH - 40, 80 + rows * 19 + (scope ? 160 : 0)), [x, y] = panelFrame(w, h, enc.glitch ? `HELM — AI REBOOT ORDER: ${enc.glitch.order.map(i => 'ABC'[i]).join(' → ')}` : 'HELM — systems diagnosis');
  let top = 50;
  if (ui.mini?.kind === 'scope') { top += drawScope(ui.mini, x, y + 40, w); if (!ui.mini.ok) return; }
  ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'top';
  SYSTEMS.forEach((s, i) => {
    const st = diagState(s), yy = y + top + i * 19;
    if (yy > y + h - 24) return;
    ctx.fillStyle = st ? st.col : '#5fd6a0'; ctx.beginPath(); ctx.arc(x + 26, yy + 7, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8ecf4'; ctx.fillText(s.name, x + 40, yy);
    ctx.fillStyle = st ? st.col : '#6b7486'; ctx.textAlign = 'right'; ctx.fillText(st ? st.text : 'ok', x + w - 20, yy); ctx.textAlign = 'left';
  });
}
function drawOverridePanel(t) {
  const o = ui.override;
  if (!ovFx || ovFx.name !== o.name || o.hits < ovFx.seen) ovFx = { name: o.name, sparks: [], dents: [], shake: 0, seen: 0 };
  const fx = ovFx;                                   // purely visual, lives in this browser only
  fx.shake = Math.max(0, fx.shake - 1 / 60);
  const sx = (Math.random() - 0.5) * 14 * fx.shake / 0.3, sy = (Math.random() - 0.5) * 14 * fx.shake / 0.3;
  ctx.save(); ctx.translate(sx, sy);
  const w = 440, h = 340, [x, y] = panelFrame(w, h, `${o.name} — ${o.hits >= 3 ? 'it gives!' : 'locked'}`);
  const cx = x + w / 2 - 20, cy = y + 150;
  // swing: wind up, then slam into the handle, then recoil
  const prog = o.swing > 0 ? 1 - o.swing / OVERRIDE_SWING : 0;
  let reach;                                         // 0 = resting / wound up, 1 = on the handle
  if (prog <= 0) reach = 0;
  else if (prog < 0.45) reach = -0.35 * Math.sin(prog / 0.45 * Math.PI / 2);          // pull back
  else if (prog < OVERRIDE_IMPACT) reach = -0.35 + 1.35 * ((prog - 0.45) / (OVERRIDE_IMPACT - 0.45)) ** 2;   // SLAM
  else reach = 1 - 0.6 * (prog - OVERRIDE_IMPACT) / (1 - OVERRIDE_IMPACT);          // bounce back
  if (prog >= OVERRIDE_IMPACT && fx.seen < o.hits) {  // impact: sparks, a dent, a shake, a noise
    fx.seen = o.hits; fx.shake = 0.3;
    sfx.clank(); sfx.hit(o.hits >= 3); sfx.spark();
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * 0.2 + (Math.random() - 0.5) * 2.6, sp = 3 + Math.random() * 7;
      fx.sparks.push({ x: cx + 30, y: cy - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 0.4 + Math.random() * 0.4 });
    }
    fx.dents.push({ x: (Math.random() - 0.5) * 70, y: (Math.random() - 0.5) * 70, r: 7 + Math.random() * 6 });
    fx.word = ['CLANG!', 'KRRNK!', 'BONK!!'][Math.min(o.hits, 3) - 1]; fx.wordT = 0.6;
  }
  // door plate with dents and cracks
  rr(cx - 80, cy - 80, 160, 160, 10);
  const pg = ctx.createLinearGradient(cx - 80, cy - 80, cx + 80, cy + 80);
  pg.addColorStop(0, '#7a8396'); pg.addColorStop(1, '#4a515e');
  ctx.fillStyle = pg; ctx.fill(); stroke(3);
  for (const [rx, ry] of [[-68, -68], [68, -68], [-68, 68], [68, 68]]) { ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 3.5, 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill(); }
  for (const d of fx.dents) {
    const g = ctx.createRadialGradient(cx + d.x - 2, cy + d.y - 2, 0, cx + d.x, cy + d.y, d.r);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.7, 'rgba(0,0,0,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0.12)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx + d.x, cy + d.y, d.r, 0, TAU); ctx.fill();
  }
  if (o.hits >= 2) {                                 // cracks spreading from the handle
    ctx.strokeStyle = 'rgba(20,22,27,0.8)'; ctx.lineWidth = 2;
    for (const [ax, ay] of [[1, -0.6], [-0.7, 0.9], [0.9, 0.8]].slice(0, fx.seen)) {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + ax * 25, cy + ay * 18); ctx.lineTo(cx + ax * 45, cy + ay * 40); ctx.lineTo(cx + ax * 62, cy + ay * 52); ctx.stroke();
    }
  }
  // the handle: bends more with every hit, snaps off on the last one
  const broke = o.hits >= 3 && fx.seen >= 3;
  ctx.save(); ctx.translate(cx, cy);
  rr(-14, -14, 28, 28, 6); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(2);         // rose
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill();
  if (!broke) {
    const bend = Math.min(fx.seen, 2) * 0.45 + fx.shake;
    ctx.rotate(bend);
    rr(-4, -9, 66, 18, 9); ctx.fillStyle = '#e8ebf0'; ctx.fill(); stroke(2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(4, -6, 50, 3);
  }
  ctx.restore();
  if (broke) {                                       // flying handle
    fx.flyT = (fx.flyT || 0) + 1 / 60;
    ctx.save(); ctx.translate(cx + 40 + fx.flyT * 260, cy - 20 - fx.flyT * 180 + fx.flyT * fx.flyT * 400); ctx.rotate(fx.flyT * 14);
    rr(-30, -9, 60, 18, 9); ctx.fillStyle = '#e8ebf0'; ctx.fill(); stroke(2); ctx.restore();
  }
  // the fire extinguisher, swung by its handle
  ctx.save();
  ctx.translate(cx + 150 - reach * 105, cy - 60 + reach * 50); ctx.rotate(-1.0 + reach * 1.25); ctx.scale(2.6, 2.6);
  extinguisher(0, 0, 0); ctx.restore();
  // sparks
  for (const p of fx.sparks) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.life -= 1 / 60;
    if (p.life <= 0) continue;
    ctx.strokeStyle = `rgba(255,${180 + Math.random() * 60 | 0},80,${Math.min(1, p.life * 2)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5); ctx.stroke();
  }
  fx.sparks = fx.sparks.filter(p => p.life > 0);
  if (fx.wordT > 0) {                                // comic onomatopoeia
    fx.wordT -= 1 / 60;
    ctx.save(); ctx.translate(cx + 60, cy - 95); ctx.rotate(-0.2); ctx.scale(1 + (0.6 - fx.wordT) * 0.6, 1 + (0.6 - fx.wordT) * 0.6);
    ctx.font = '900 30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = OUT; ctx.strokeText(fx.word, 0, 0); ctx.fillStyle = '#ffe08a'; ctx.fillText(fx.word, 0, 0);
    ctx.restore();
  }
  ctx.restore();
  // button (outside the shake so it stays clickable)
  const bx = x + w / 2 - 120, by = y + h - 64, bw = 240, bh = 44, hover = mouse.x > bx && mouse.x < bx + bw && mouse.y > by && mouse.y < by + bh;
  rr(bx, by, bw, bh, 8); ctx.fillStyle = o.swing > 0 ? '#5a2a22' : hover ? '#b8402e' : '#8e2f22'; ctx.fill(); stroke(2, '#ff8a7a');
  ctx.fillStyle = '#fff'; ctx.font = '800 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(o.hits >= 3 ? 'OPEN!' : `MANUAL OVERRIDE (${o.hits}/3)`, bx + bw / 2, by + bh / 2); ctx.textAlign = 'left';
  ui.hits.push({ x: bx + bw / 2, y: by + bh / 2, w: bw, h: bh, cmd: ['bonk'] });
}
// Jumping out: the stars stretch into streaks and the screen flashes before the results show.
let warpFx = null;
function drawWarp(k) {
  ctx.fillStyle = `rgba(4,6,14,${0.4 + 0.5 * k})`; ctx.fillRect(0, 0, VW, VH);
  const r = rng(7), cx = VW / 2, cy = VH / 2;
  for (let i = 0; i < 160; i++) {
    const a = r() * TAU, d0 = r() * Math.hypot(VW, VH) * 0.5, len = 40 + 900 * k * k * r();
    ctx.strokeStyle = `rgba(${200 + r() * 55 | 0},${220 + r() * 35 | 0},255,${0.5 + 0.5 * r()})`; ctx.lineWidth = 1 + 2 * r();
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0); ctx.lineTo(cx + Math.cos(a) * (d0 + len), cy + Math.sin(a) * (d0 + len)); ctx.stroke();
  }
  if (k > 0.8) { ctx.fillStyle = `rgba(255,255,255,${(k - 0.8) * 5})`; ctx.fillRect(0, 0, VW, VH); }
}
function drawEndScreen() {
  const o = mission.over;
  if (o.survived) {                                     // the jump itself first (1.8 s)
    if (!warpFx || warpFx.run !== mission.runId) warpFx = { run: mission.runId, t0: performance.now() };
    const k = (performance.now() - warpFx.t0) / 1800;
    if (k < 1) { drawWarp(k); return; }
  }
  ctx.fillStyle = o.won ? 'rgba(10,30,20,0.75)' : 'rgba(40,8,8,0.78)'; ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = o.won ? '#7af0b0' : '#ff7a6a'; ctx.font = '800 48px system-ui, sans-serif';
  ctx.fillText(o.won ? 'JUMP SUCCESSFUL' : o.survived ? 'JUMPED — OBJECTIVE FAILED' : 'MISSION FAILED', VW / 2, VH / 2 - 40);
  ctx.fillStyle = '#e8ecf4'; ctx.font = '18px system-ui, sans-serif'; ctx.fillText(o.reason, VW / 2, VH / 2 + 10);
  ctx.fillStyle = '#9aa3b5'; ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(`Time ${fmt(o.t)} · hits taken: ${combat.hits.small} small, ${combat.hits.large} large, ${combat.hits.crew} crew · press R to play again`, VW / 2, VH / 2 + 46);
  // the mission report
  const S = hz.stats, medics = Object.entries(S.treated).sort((a, b) => b[1] - a[1]);
  const lines = [
    `Fires: ${S.fires} started, ${S.firesOut} put out · hull breaches: ${S.breaches} · repairs: ${S.repairs}`,
    medics.length ? `Medic of the day: ${medics[0][0]} (treated ${medics[0][1]}×)` : 'Nobody had to be treated. Suspicious.',
    `The cat was petted ${S.pets} time${S.pets === 1 ? '' : 's'}.`,
  ];
  ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#c9ced8';
  lines.forEach((l, i) => ctx.fillText(l, VW / 2, VH / 2 + 80 + i * 20));
  ctx.textAlign = 'left';
  drawRewards(VW / 2, VH / 2 + 160);
}
// Click handling for panels (screen coords). Returns true if the click was used.
function panelClick(mx, my) {
  for (const h of ui.hits) {
    const inside = h.w ? Math.abs(mx - h.x) < h.w / 2 && Math.abs(my - h.y) < h.h / 2 : Math.hypot(mx - h.x, my - h.y) < h.r;
    if (inside) { sendCommand(h.cmd); return true; }
  }
  return false;
}
