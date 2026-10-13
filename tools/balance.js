// Balance model: is a mission doable for n players, and how hard is it?
//
//   node tools/balance.js                      every skirmish + campaign mission, 1-4 and 8 players
//   node tools/balance.js intro c3             just these missions
//   node tools/balance.js --hit 0.5 --runs 20  other hit rate / more random builds per mission
//   node tools/balance.js --ship caps,cannons  with ship upgrades (ids from SHIP_UPGRADES)
//   node tools/balance.js --detail rush 2      one build, job by job (who does what when)
//   From code: const { balance } = require('../tools/balance'); balance({ missions: ['intro'], players: [1, 2] })
//
// How it works. For each mission and crew size it builds the real timeline with the game itself
// (startMission with n crew aboard, so the game's own crew pacing applies), and reads the real energy
// supply (reactor speed, spare cells, capacitor size) from the game state. Each event becomes jobs for
// the crew (go to the cannon and shoot it down, carry a coolant canister, pry mines off on a spacewalk,
// ...), with walking times measured by tools/travel.js and work times from the game's constants. Enemy
// damage rates and deadlines (when the first asteroid hits, when a mine blows, when the leeches start
// chewing) are measured by running each encounter in the game with nobody fighting back (calibrate()).
//
// A small scheduler then hands the jobs to the n crew members (urgent first, then repairs, then chores).
// Waiting costs damage: every second an enemy is alive it hits the hull at its measured rate, and every
// incident (fire / broken part) becomes a repair job. An energy pass runs the reactor, lever and
// capacitors against the shots and shields the jobs need; a fight that runs out of energy waits (and
// takes more damage). Out come: energy demand vs supply, crew-seconds needed vs available, the most
// problems open at once, a verdict (doable / tight / impossible) and a difficulty score.
//
// It's an expected-value model, not a simulation of players: it says where the pressure is, not
// whether a given crew will make it. Every guess is named below.
const { loadGame } = require('../tests/harness');
const { travel } = require('./travel');

// ===========================================================================
// ASSUMPTIONS — every guess the model makes, in one place
// ===========================================================================
const A = {
  HIT_RATE: 0.6,          // cannon shots that hit the weak spot you aimed at (--hit)
  HULL_SHARE: 0.5,        // of the misses, the share that still hits the enemy hull (D.wear hull hits break a weak spot)
  AIM_TIME: 1.2,          // s per cannon shot at a swaying target (the cannon itself allows one per CANNON_COOLDOWN)
  CRANK_RELOAD: 1.5,      // s per cannon reload when the gunner cranks / holds R (RELOAD_TIME on its own)
  CLIMB: 1.0,             // s to climb into a cannon and get the aim on target
  REACT: 4,               // s from an event to someone heading off (sidebar, radar, shouting)
  HOME: ['bridge', 'reactor'],   // where a free crew member is when a job comes up: trips are averaged from both
  CYCLE: 0.5,             // deck airlocks: 0 = always open towards you (travel best case), 1 = always the other way
  EVA_DETOUR: 1.4,        // a spacewalk path vs the straight line outside
  STEALTH_SEEN: 0.5,      // share of the time a stealth fighter is visible enough to hit (muzzle flashes, radar pings)
  SHIELD_DETOUR: 6,       // s the gunner loses leaving the cannon to raise a shield against a heavy shot (solo)
  LASER_HIT: 0.5,         // hand-laser hits on a dodging boarder
  LASER_SHOT: 1.2,        // s per laser shot in a fight (LASER_COOLDOWN plus dodging and lining up)
  ALIEN_HITS: 0.08,       // hits on the crew per s while fighting the alien (spit / pounce, mostly dodged)
  ALIEN_HARASS: 0.05,     // hits on the crew per s while the alien roams and nobody hunts it (crew busy elsewhere)
  SAB_FIND: 8,            // s to find a cloaked saboteur once you're in its rooms
  SAB_PERIOD_EXTRA: 4,    // s per sabotage cycle on top of the sneak, fade and work (picking a part, walking)
  PIRATE_FIGHT_HITS: 0.6, // hits on the crew per pirate fought aboard
  CREW_HIT_COST: 8,       // crew-seconds lost per hit on the crew (slowed while hurt, patching up when down)
  INCIDENT_WORK: 4,       // s of work per small-hit incident (extinguish a fire ~1.3 s or repair a part 5 s)
  TOOL_FETCH: 4,          // s extra to fetch the extinguisher / repair kit for a repair
  BREAK_PER_LARGE: 1.3,   // parts broken per big hit (damageColumn: 1, 30% 2)
  INCIDENT_PER_SMALL: 0.5,// incidents per small hit (smallHit: half the time nothing)
  OPEN_SMALL: 0.4,        // a small-hit incident counts as this much of a broken part (most are fires; a fire burns its part 40% per FIRE_TIME)
  SUPPRESS: 0.6,          // an enemy's fire once the gunner is shooting at it (the crack blinds it, the cable fizzles), vs ignored
  INCIDENT_CHUNK: 10,     // s: enemy damage is turned into repair jobs in chunks of this much alive time
  BREACH_FIX: 15,         // s to tarp a breach from inside (TARP_TIME), when the breach rule is on
  PLASMA_SHARE: 0.25,     // share of incidents in a plasma mission that are plasma fires (vent: PIN pad + VENT_TIME)
  PIN_TIME: 6,            // s to type the vent PIN
  FLARE_COST: 8,          // crew-seconds per crew member to get off the upper deck and wait out a solar flare
  MINES: 2,               // limpet mines per drone (1-3)
  LEECH_LATCH: 12,        // s until the whole leech swarm has latched on (then one shield burns them all off)
  BOARD_WALK: 24,         // units from our outer airlock to the far end of a docked ship (and back)
  DERELICT_EXTRA: 20,     // s inside a derelict: the jammed door, its fire, finding the box / the engineer
  DERELICT_ALIEN: 0.5,    // chance the sleeping intruder on a derelict wakes up and has to be fought
  BOX_SLOW: 0.7,          // walking speed carrying the black box
  PANIC_OPEN: 1.5,        // broken parts' worth of problems open at which the crew fixes things before taking on new threats
  JUMP_PREP: 40,          // s before the jump someone pins the lever on MID if the middle capacitor is empty
  REFUEL: 6,              // s to fetch a fuel cell and load it (the inserter upgrade: 2 s, nobody needed)
  OPTIONAL_IDLE: 0.6,     // optional jobs (fuel canister) are only done when the crew is below this load
  // verdicts and score
  TIGHT_LOAD: 0.8, MAX_LOAD: 1.15,           // crew-seconds needed / available
  TIGHT_OPEN: 2,                              // problems open at once (MAX_DAMAGE + 1 broken loses the ship)
  TIGHT_WAIT: 15,                             // s of fights waiting for energy, summed
  SCORE: { load: 45, open: 30, energy: 15, late: 10 },   // difficulty score weights (out of 100)
  RUNS: 8,                // random builds per mission and crew size (shuffled timelines, random sides)
  SEED: 12345,
};
const PLAYERS = [1, 2, 3, 4, 8];
const SKIRMISH_ORDER = ['intro', 'rush', 'ore', 'pirates', 'salvage', 'rescue', 'deep', 'nightmare'];

// ===========================================================================
// The game: constants and a seeded random (so results repeat)
// ===========================================================================
const NAMES = ['MISSIONS', 'CAMPAIGN', 'SKIRMISH', 'startMission', 'crew', 'makeCrew', 'mission', 'power', 'CAPACITORS', 'CAP_MAX', 'SHOTS_PER_ENERGY',
  'ENERGY_TIME', 'CELL_ENERGY', 'RELOAD_TIME', 'REPAIR_TIME', 'MAX_DAMAGE', 'JUMP_DELAY', 'JUMP_WINDOW', 'ENEMY_TYPES', 'HEAVY_PERIOD', 'HEAVY_CHARGE',
  'SHIELD_PERIOD', 'SHIELD_ON', 'SWARM_SIZE', 'SWARM_INTERVAL', 'DOCK_TIME', 'PIRATE_HP', 'ALIEN_HP', 'SAB_HP', 'SAB_SNEAK', 'SAB_FADE',
  'SAB_WORK_SOLO', 'SAB_WORK_TEAM', 'MAINT_WARNING', 'MINE_TIME', 'PRY_TIME', 'PRY_BARE', 'SCRAPE_TIME', 'CLEAR_TIME', 'ALIGN_TIME', 'COIL_DELAY',
  'BARNACLE_GROW', 'BARNACLE_DRAIN', 'FLARE_WARN', 'FLARE_TIME', 'STORM_TIME', 'STORM_ARC', 'COOLANT_RISE', 'COOLANT_FIX', 'SCRAM_TIME',
  'HEAL_TIME', 'TENTACLE_COIL', 'ACID_TIME', 'LEECH_CHEW', 'PUFF_EVERY', 'SAC_OPEN', 'MOTHER_TOSSES', 'LEV_TIME', 'LEV_STEP', 'TREAT_TIME',
  'DRILL_TIME', 'NPC_SPEED', 'WALK_SPEED', 'EVA_SPEED', 'HATCH_TIME', 'HULL_SPOTS', 'JAM_SPOTS', 'ANTENNA', 'COIL_SPOTS', 'HATCHES', 'JUMP_PULL',
  'JUMP_PULL_TWO', 'VENT_TIME', 'SPLICE_TIME', 'GRAV_TIME', 'applyShipUpgrades', 'reactorSpeed', 'crewPace', 'simTick', 'runEvent', 'makeEvent',
  'combat', 'SYSTEMS', 'me', 'boarding', 'roomAt', 'enc', 'evs', 'dk', 'hz', 'shuffledTimeline', 'evAt', 'randSide'];
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function seeded(seed, fn) {                       // the sandbox shares the host's Math, so this seeds the game too
  const keep = Math.random; Math.random = mulberry(seed);
  try { return fn(); } finally { Math.random = keep; }
}
let G0 = null;
const game = () => G0 || (G0 = loadGame(NAMES));

// ===========================================================================
// Walking (tools/travel.js, cached)
// ===========================================================================
const tripCache = new Map();
function T(from, to) {                            // seconds from one place to another (airlocks blended by CYCLE)
  if (from === to) return 0;
  const k = from + '→' + to;
  if (!tripCache.has(k)) {
    const r = travel(from, to), b = r.best.at ?? r.best.enter ?? 15, w = r.worst.at ?? r.worst.enter ?? b + 3;
    tripCache.set(k, b + (w - b) * A.CYCLE);
  }
  return tripCache.get(k);
}
const H = (to) => A.HOME.reduce((s, h) => s + T(h, to), 0) / A.HOME.length;   // from where a free crew member waits
const L = (side) => (side === 'port' ? 'Left' : 'Right');
const gunOf = (side) => (side === 'front' ? 'Front cannon' : `${L(side)} cannon`);
const lockRoom = (side) => (side === 'port' ? 'portLock' : 'starLock');
// A spacewalk: to the outer airlock, out, along the hull to (x, y), the job, and back in.
function evaTrip(side, pts) {
  const g = game(), h = g.HATCHES.find(h => h.side === side) || g.HATCHES[0];
  let d = 0, [x, y] = h.outside;
  for (const [px, py] of pts) { d += Math.hypot(px - x, py - y); [x, y] = [px, py]; }
  d += Math.hypot(h.outside[0] - x, h.outside[1] - y);
  return { legs: H(`${L(h.side)} outer airlock`), extra: 2 * g.HATCH_TIME + d * A.EVA_DETOUR / g.EVA_SPEED };
}
const nearSide = (x) => (x < 22.2 ? 'port' : 'star');

// ===========================================================================
// Calibration: each encounter in the real game, nobody fighting back
// ===========================================================================
const calCache = new Map();
function calibrate(kind, W = 60, seeds = [1, 2, 3]) {
  if (calCache.has(kind)) return calCache.get(kind);
  const sum = { small: 0, large: 0, crewHits: 0, broken: 0 }, first = {};
  for (const seed of seeds) seeded(seed * 7919, () => {
    const G = loadGame(NAMES);
    G.startMission('intro'); G.mission.events = []; G.mission.jumpAt = 1e9;
    Object.assign(G.me, { x: 22.2, y: 16.6 });           // the crew member waits in the middle of the reactor room
    G.runEvent(G.makeEvent(kind, 0, G.SYSTEMS[0]));
    let last = 'ok', f = {};
    const mark = (k, t) => { if (f[k] === undefined) f[k] = t; };
    for (let i = 0; i < 60 * W; i++) {
      const t = i / 60; G.simTick(1 / 60);
      if (G.combat.hits.small) mark('small', t); if (G.combat.hits.large) mark('large', t);
      if (G.SYSTEMS.some(s => s.broken)) mark('broken', t);
      if (G.evs.barnacles.length) mark('barnacle', t);
      if (G.enc.scram > 0) mark('scram', t); if (G.hz.breaches.length) mark('breach', t);
      if (G.me.health !== last) { if (G.me.health !== 'ok') { sum.crewHits++; mark('crew', t); } last = G.me.health; if (G.me.health !== 'ok' && G.me.health !== 'hurt') { G.me.health = 'ok'; last = 'ok'; } }
    }
    sum.small += G.combat.hits.small; sum.large += G.combat.hits.large; sum.broken += G.SYSTEMS.filter(s => s.broken).length;
    for (const k in f) (first[k] = first[k] || []).push(f[k]);
  });
  const n = seeds.length, avg = (a) => a && a.reduce((s, v) => s + v, 0) / a.length;
  const firstAt = {}; for (const k in first) firstAt[k] = avg(first[k]);
  const from = firstAt.small ?? 3, alive = Math.max(1, W - from);
  const out = { kind, W, small: sum.small / n, large: sum.large / n, crewHits: sum.crewHits / n, broken: sum.broken / n, first: firstAt,
                smallRate: sum.small / n / alive, largeRate: sum.large / n / alive };
  calCache.set(kind, out);
  return out;
}

// ===========================================================================
// What each event asks of the crew
// ===========================================================================
// A job: { label, rel (s after the event), trip (s walking), work (s), prio (0 urgent, 1 normal, 2 repair,
//   3 optional), deadline (s after the event, or null), alive: { small, large, crew } per s while not done,
//   energy: [{ cap, shots | units, shield }], late(job, done) → extra damage / jobs, objective, crew (people) }
const CAP = { port: 0, front: 1, star: 2 };
function shotsFor(pois, wear) {                   // expected shots to knock out `pois` weak spots
  const p = A.HIT_RATE, viaHull = (1 - p) * A.HULL_SHARE / (wear || 99);
  return pois / (p + viaHull);
}
const fightTime = (shots, g) => shots * A.AIM_TIME + Math.max(0, Math.ceil(shots / g.SHOTS_PER_ENERGY) - 1) * A.CRANK_RELOAD;
const rate = (kind) => { const c = calibrate(kind); return { small: c.smallRate, large: c.largeRate, from: c.first.small ?? 3 }; };

function jobsFor(ev, ctx) {
  const g = game(), { n, rules } = ctx, k = ev.kind, side = ev.side || 'front', J = [];
  const job = (o) => J.push({ rel: 0, prio: 0, work: 0, trip: 0, energy: [], deadline: null, crew: 1, ...o });
  const shipFight = (kind, extraTime = 1, label = kind) => {
    const D = g.ENEMY_TYPES[kind], shots = shotsFor(D.pois.length, D.wear), r = rate(kind === 'pirate' ? 'pirates' : kind);
    return { label, trip: H(gunOf(side)), work: A.CLIMB + fightTime(shots, g) / extraTime, energy: [{ cap: CAP[side], shots, gun: side }],
             alive: { small: r.small, large: r.large, from: r.from } };
  };
  if (k === 'interceptor' || k === 'tractor') job(shipFight(k));
  else if (k === 'stealth') job(shipFight('stealth', A.STEALTH_SEEN));
  else if (k === 'pirates') {
    const f = shipFight('pirate', 1, 'pirate raider');
    if (ev.letDock) job({ label: 'pirates aboard', rel: g.DOCK_TIME, ...boarders(2, side), objective: { pirates: 2 },
                          fixed: { small: f.alive.small * (g.DOCK_TIME - f.alive.from), span: [f.alive.from - g.DOCK_TIME, 0] } });   // (the raider shoots until it docks)
    else job({ ...f, deadline: g.DOCK_TIME, objective: { pirates: 1 }, late: (j) => ({ jobs: [{ label: 'pirates aboard (docked)', rel: g.DOCK_TIME, ...boarders(2, side), objective: { pirates: 2 } }], cancelAt: g.DOCK_TIME }) });
  } else if (k === 'frigate') {
    const D = g.ENEMY_TYPES.frigate, p = A.HIT_RATE, block = g.SHIELD_ON / g.SHIELD_PERIOD;
    const shots = shotsFor(D.pois.length, D.wear), dish = 1 / p, coil = 1 / p;
    const work = A.CLIMB + dish * A.AIM_TIME / (1 - block) + fightTime(shots - dish, g);
    const coilAt = A.CLIMB + (dish / (1 - block) + coil) * A.AIM_TIME;          // shoot the shield emitter, then the heavy coils
    const r = rate('frigate');
    job({ label: 'frigate', trip: H(gunOf(side)), work, energy: [{ cap: CAP[side], shots, gun: side }],
          alive: { small: r.small, large: 0, from: r.from },
          heavies: (startToGun) => {                   // heavy shots before the coils are hit: first after 7 + HEAVY_CHARGE, then every PERIOD + CHARGE
            const until = startToGun + coilAt, out = [];
            for (let t = 7 + g.HEAVY_CHARGE; t < until; t += g.HEAVY_PERIOD + g.HEAVY_CHARGE) out.push(t);
            return out;
          } });
  } else if (k === 'swarm') {
    const per = 3 / A.HIT_RATE, shots = g.SWARM_SIZE * per, hitAt = calibrate('swarm').first.large ?? 24;
    job({ label: 'asteroid swarm', trip: H('Front cannon'), work: A.CLIMB + fightTime(shots, g), energy: [{ cap: 1, shots, gun: 'front' }],
          swarm: { per: per * A.AIM_TIME, hitAt } });
  } else if (k === 'intruder') {
    const fight = g.ALIEN_HP / A.LASER_HIT * A.LASER_SHOT;
    job({ label: 'alien', trip: H('starLock'), work: fight, crewHits: fight * A.ALIEN_HITS, alive: { crew: A.ALIEN_HARASS, from: 2 }, objective: { intruder: 1 } });
  } else if (k === 'saboteur') {
    const work = n > 1 ? g.SAB_WORK_TEAM : g.SAB_WORK_SOLO, period = (g.SAB_SNEAK[0] + g.SAB_SNEAK[1]) / 2 + 2 * g.SAB_FADE + work + A.SAB_PERIOD_EXTRA;
    const first = calibrate('saboteur').first.broken ?? period;
    job({ label: 'saboteur', trip: H('starLock') + T('starLock', lockRoom(side)), work: A.SAB_FIND + g.SAB_HP / A.LASER_HIT * A.LASER_SHOT,
          crewHits: 0.3, alive: { breaks: 1 / period, from: Math.min(first, period) } });
  } else if (k === 'maintenance') {
    job({ label: 'maintenance failure', rel: -g.MAINT_WARNING, prio: 1, trip: H('portLock') + T('portLock', 'Reactor'), work: g.REPAIR_TIME,   // (the helm shows it orange; the kit's in the left airlock room)
          deadline: g.MAINT_WARNING, late: () => ({ breaks: 1 }) });
  } else if (k === 'mines') {
    const at = calibrate('mines').first.large ?? g.MINE_TIME, spots = g.HULL_SPOTS[side].slice(0, A.MINES), e = evaTrip(side, spots);
    job({ label: 'limpet mines', trip: e.legs, work: e.extra + A.MINES * g.PRY_BARE, deadline: at, late: () => ({ large: A.MINES, breach: rules.breach ? A.MINES : 0 }) });
  } else if (k === 'spores' || k === 'mother') {
    if (k === 'spores') {
      const at = calibrate('spores').first.barnacle ?? 10, shots = 3 / A.HIT_RATE;
      job({ label: 'spore clouds', trip: H(gunOf(side)), work: A.CLIMB + fightTime(shots, g), energy: [{ cap: CAP[side], shots, gun: side }],
            deadline: at - A.CLIMB - shots * A.AIM_TIME / 2, late: () => ({ jobs: [scrape(side, 3, at)] }) });
    } else {
      const p = A.HIT_RATE, per = Math.max(1, Math.floor(g.SAC_OPEN / A.AIM_TIME)), pWin = 1 - (1 - p) ** per, wins = 3 / pWin;
      const tongueShots = wins * Math.min(per, 1 / p), sporeShots = Math.ceil(wins) * g.MOTHER_TOSSES / p;
      job({ label: 'spore mother', trip: H(gunOf(side)), work: 0, energy: [{ cap: CAP[side], shots: tongueShots + sporeShots, gun: side }],
            mother: { first: 6, every: g.PUFF_EVERY, open: g.SAC_OPEN, wins }, prio: 0 });
    }
  } else if (k === 'debris') {
    const s = ev.gun || 'port', [x, y] = g.JAM_SPOTS[s], e = evaTrip(s === 'front' ? 'port' : s, [[x, y]]);
    job({ label: 'debris in a cannon', prio: 3, optional: true, trip: e.legs, work: e.extra + g.CLEAR_TIME });   // (half the cannon's arc until then: a chore)
  } else if (k === 'antenna') {
    const e = evaTrip('star', [[g.ANTENNA.x, g.ANTENNA.y]]);
    job({ label: 'antenna', prio: 3, optional: true, trip: e.legs, work: e.extra + 2 });                         // (only the radar suffers: a chore)
  } else if (k === 'canister') {
    const e = evaTrip(side, [[side === 'port' ? -1.9 : 46.3, 12]]);
    job({ label: 'fuel canister (optional)', prio: 3, trip: e.legs, work: e.extra + A.REFUEL, deadline: 40, optional: true });
  } else if (k === 'flare') {
    for (let i = 0; i < n; i++) job({ label: 'solar flare: shelter', work: A.FLARE_COST, deadline: g.FLARE_WARN, late: () => ({ crewHits: 2 }) });
  } else if (k === 'storm') {
    job({ label: 'ion storm', work: 0, prio: 3, storm: { arcs: Math.floor(g.STORM_TIME / g.STORM_ARC) + 1, every: g.STORM_ARC } });
  } else if (k === 'coolant') {
    const at = calibrate('coolant').first.scram ?? g.COOLANT_RISE;
    job({ label: 'coolant leak', prio: 0, trip: H('portLock') + T('portLock', 'Reactor'), work: g.COOLANT_FIX, deadline: at,
          late: (j, done) => ({ scram: [at, Math.max(at + g.SCRAM_TIME, done)] }) });
  } else if (k === 'glitch') {
    job({ label: 'AI glitch', prio: 1, trip: H('Helm') + T('Helm', 'Security'), work: 4 });
  } else if (k === 'grappler') {
    const shots = 3 / A.HIT_RATE + 1 / A.HIT_RATE, rip = calibrate('grappler').first.breach ?? 6 + g.TENTACLE_COIL + g.ACID_TIME;   // (measured: it rips the plate off at ~38 s)
    job({ label: 'grappler', trip: H(gunOf(side)), work: A.CLIMB + fightTime(shots, g), energy: [{ cap: CAP[side], shots, gun: side }],
          deadline: rip, late: () => ({ breach: 1 }) });
  } else if (k === 'leeches') {
    const chew = calibrate('leeches').first.broken ?? A.LEECH_LATCH + g.LEECH_CHEW;
    job({ label: 'leech swarm (shield)', trip: H(`${L(side)} shield button`), work: 1, notBefore: A.LEECH_LATCH, energy: [{ cap: CAP[side], units: 1, shield: true }],
          deadline: chew, late: (j, done) => ({ breaks: 6 * Math.max(0, done - chew) / g.LEECH_CHEW + 1 }) });
  } else if (k === 'leviathan') {
    const bumps = Math.floor(g.LEV_TIME / g.LEV_STEP);
    job({ label: 'leviathan', work: 0, prio: 3, fixed: { small: bumps, span: [0, g.LEV_TIME], crewHits: 0.5 } });
  } else if (k === 'derelict') {
    const walk = 2 * A.BOARD_WALK / g.WALK_SPEED, obj = ctx.objective?.kind;
    let work = walk + A.DERELICT_EXTRA + g.HATCH_TIME * 2;
    if (obj === 'blackbox') work += A.BOARD_WALK / g.WALK_SPEED * (1 / A.BOX_SLOW - 1);
    if (obj === 'rescue') work += g.TREAT_TIME + A.BOARD_WALK / g.NPC_SPEED - A.BOARD_WALK / g.WALK_SPEED;
    work += A.DERELICT_ALIEN * g.ALIEN_HP / A.LASER_HIT * A.LASER_SHOT;
    job({ label: `derelict (${obj || 'explore'})`, prio: 1, trip: H(`${L(side)} outer airlock`), work, crewHits: A.DERELICT_ALIEN * 1, objective: obj ? { [obj]: 1 } : null });
  } else if (k === 'rock') {
    const e = evaTrip('port', [[22.2, -7.6]]);
    job({ label: 'drill the ore asteroid', prio: 1, trip: H('portLock') + T('portLock', 'Left outer airlock'), work: e.extra + g.DRILL_TIME + 2, objective: { ore: 1 } });
  } else if (k === 'brig') {
    const b = boarders(2, side);
    job({ label: 'prison barge (rescue)', prio: 1, ...b, work: b.work + g.TREAT_TIME + A.BOARD_WALK / g.NPC_SPEED, objective: { rescue: 1 } });
  }
  for (const j of J) j.ev = ev;
  return J;
}
function boarders(count, side) {                  // fight `count` pirates aboard with the laser
  const g = game(), fight = count * g.PIRATE_HP / A.LASER_HIT * A.LASER_SHOT;
  return { trip: H('starLock') + T('starLock', lockRoom(side)), work: fight + 2 * A.BOARD_WALK / g.WALK_SPEED / 2, crewHits: count * A.PIRATE_FIGHT_HITS, prio: 0 };
}
function scrape(side, count, rel) {               // barnacles: scrape them off outside before they grow (then they drain power)
  const g = game(), e = evaTrip(side, game().HULL_SPOTS[side].slice(1, 1 + count));
  return { label: `barnacles ×${count}`, rel, prio: 1, trip: e.legs, work: e.extra + count * g.SCRAPE_TIME, deadline: g.BARNACLE_GROW,
           late: (j, done) => ({ drain: { cap: CAP[side], from: j.release + g.BARNACLE_GROW, until: j.release + done, per: count / g.BARNACLE_DRAIN } }) };
}

// ===========================================================================
// One mission build, one crew size
// ===========================================================================
function setup(id, n, ship, seed, patch) {
  return seeded(seed, () => {
    const G = loadGame(NAMES);
    if (patch) patch(G);                           // try a change (proposals): patch(G) can replace MISSIONS[id].build etc.
    G.crew.length = 0; for (let i = 0; i < n; i++) G.crew.push(G.makeCrew('P' + i));
    G.startMission(id, { ship });
    const evs = G.mission.events.map(e => ({ ...e, sys: undefined }));
    return {
      id, n, events: evs, jumpAt: G.mission.jumpAt, rules: { ...(G.mission.rules || {}) }, objective: G.mission.objective,
      energy: { interval: G.ENERGY_TIME / G.reactorSpeed(), cells: 1 + G.power.reserve, perCell: G.CELL_ENERGY, capMax: G.CAP_MAX,
                start: G.CAPACITORS.map(c => c.charge), spe: G.SHOTS_PER_ENERGY, inserter: !!ship.inserter },
      g: G,
    };
  });
}
function simulate(build) {
  const { n, events, jumpAt, rules, objective } = build, g = build.g, E = build.energy;
  const end = jumpAt + 2, ctx = { n, rules, objective };
  // pirate objective: let raiders dock when shooting them all down can't reach the count (2 pirates come aboard)
  if (objective?.kind === 'pirates') {
    let need = Math.max(0, objective.count - events.filter(e => e.kind === 'pirates').length);
    for (const r of events.filter(e => e.kind === 'pirates').sort((a, b) => a.t - b.t)) if (need > 0) { r.letDock = true; need--; }
  }
  let queue = [];
  const push = (j, release, ev) => {
    const job = { rel: 0, prio: 0, work: 0, trip: 0, energy: [], deadline: null, ...j, release, ev: ev || j.ev };
    // a repair joins one that's still waiting in the same place (one trip fixes both)
    const same = job.prio === 2 && queue.find(q => q.prio === 2 && q.label === job.label && q.where === job.where && Math.abs(q.release - release) <= A.INCIDENT_CHUNK * 1.5);
    if (same) { same.work += job.work; same.weight = (same.weight || 0) + (job.weight || 0); return; }
    queue.push(job);
  };
  for (const ev of events) for (const j of jobsFor(ev, ctx)) push(j, ev.t + j.rel, ev);
  // the jump: coils aligned outside before it, the handle pulled at it
  if (rules.coils) for (const c of g.COIL_SPOTS) {
    const e = evaTrip(nearSide(c.x), [[c.x, c.y]]);
    push({ label: `jump coil (${c.name})`, prio: 3, optional: true, coil: true, trip: e.legs, work: e.extra + g.ALIGN_TIME }, 0, { kind: 'coil', t: 0 });   // (skipped: the jump takes COIL_DELAY longer)
  }
  if (rules.handle) push({ label: 'jump handle', trip: H('Helm'), work: n > 1 ? g.JUMP_PULL_TWO : g.JUMP_PULL }, jumpAt - H('Helm'), { kind: 'handle', t: jumpAt });
  // refuelling: the next cell every perCell energies (the inserter does it by itself)
  if (!E.inserter) for (let c = 1; c < E.cells; c++) { const t = c * E.perCell * E.interval; if (t < end) push({ label: 'refuel', trip: H('reactor'), work: A.REFUEL }, t, { kind: 'fuel', t }); }

  const free = Array(n).fill(0), done = [], open = [], draws = [], scrams = [], drains = [], storms = [], got = {}, lateList = [];
  let crewHits = 0, bonusCells = 0, jumpDelay = 0, busy = 0, coilsDone = 0;
  const roomOf = (side) => (side === 'front' ? 'bridge' : side === 'port' ? 'portGun' : 'starGun');
  const sideOf = (j) => j.ev?.side || 'front';
  // damage → repair jobs: small hits (A.INCIDENT_PER_SMALL incidents each), big hits (parts broken, plus the rules' extras)
  const repairs = (small, large, at, side, ev) => {
    const inc = small * A.INCIDENT_PER_SMALL, brk = large * A.BREAK_PER_LARGE;
    if (inc > 0) {
      const pl = rules.plasma ? A.PLASMA_SHARE : 0, work = (1 - pl) * A.INCIDENT_WORK + pl * (A.PIN_TIME + g.VENT_TIME);
      push({ label: 'fire / damage', where: side, prio: 2, trip: H(roomOf(side)) + A.TOOL_FETCH, work: work * inc, weight: inc * A.OPEN_SMALL }, at, ev);
    }
    if (brk > 0) push({ label: 'repair', where: side, prio: 2, trip: H(roomOf(side)) + A.TOOL_FETCH, work: g.REPAIR_TIME * brk, weight: brk }, at, ev);
    if (large > 0 && rules.breach) breach(0.7 * large, at, side, ev);     // (the first big hit on a side only dents it)
    if (large > 0 && rules.surge) push({ label: 'arcing line', prio: 2, trip: H('reactor'), work: g.SPLICE_TIME * 0.35 * large }, at, ev);
    if (large > 0 && rules.gravity) push({ label: 'gravity', prio: 2, trip: H('reactor'), work: g.GRAV_TIME * 0.25 * large }, at, ev);
  };
  const breach = (k, at, side, ev) => push({ label: 'hull breach', prio: 2, trip: H(side === 'front' ? 'bridge' : lockRoom(side)), work: A.BREACH_FIX * k }, at, ev);   // (a breach isn't a broken part)
  const overTime = (small, large, t0, t1, side, ev) => {             // damage spread over [t0, t1], in chunks
    if (!(small > 0 || large > 0) || t1 <= t0) return;
    const chunks = Math.max(1, Math.ceil((t1 - t0) / A.INCIDENT_CHUNK));
    for (let i = 0; i < chunks; i++) repairs(small / chunks, large / chunks, t0 + (t1 - t0) * (i + 0.5) / chunks, side, ev);
  };

  // the scheduler: whoever is free next takes the most urgent job that's come up
  const cur = Array(n).fill(null);
  let forced = null;
  for (let guard = 0; queue.length && guard < 5000; guard++) {
    // an encounter comes up while everyone is busy: whoever is on a repair drops it (the rest waits in the queue)
    const minFree = Math.min(...free), urgent = queue.filter(q => q.prio === 0 && q.release < end && q.release + A.REACT < minFree).sort((a, b) => a.release - b.release)[0];
    if (urgent) {
      const tc = urgent.release + A.REACT, c = cur.findIndex(e => e && e.prio === 2 && e.finish > tc && e.start < tc);
      if (c >= 0) {
        const e = cur[c], left = (e.finish - Math.max(tc, e.atJob)) / Math.max(1e-9, e.finish - e.atJob);
        busy -= e.finish - tc; e.finish = tc; cur[c] = null; free[c] = tc;
        if (e.openRef) e.openRef.b = Infinity;
        queue.push({ ...e, work: e.work * Math.min(1, left), release: tc, openRef: e.openRef, weight: 0, label: e.label.replace(/( \(resumed\))?$/, ' (resumed)') });
        forced = { who: c, job: urgent };
      }
    }
    const who = free.indexOf(Math.min(...free)), now = free[who];
    const load = busy / Math.max(1, n * now);
    const ready = queue.filter(j => j.release <= now && j.release < end && !(j.optional && load > A.OPTIONAL_IDLE));
    if (!ready.length) {
      const next = Math.min(...queue.filter(j => j.release < end && j.release > now).map(j => j.release));
      if (!Number.isFinite(next)) break;
      free[who] = next; continue;
    }
    // close to losing (A.PANIC_OPEN broken parts' worth open): repairs come first
    const openNow = queue.filter(q => q.weight && q.release <= now).reduce((s, q) => s + q.weight, 0) + open.filter(o => o.a <= now && o.b > now).reduce((s, o) => s + o.w, 0);
    const pr = (q) => (q.prio === 2 && openNow >= A.PANIC_OPEN ? 0.5 : q.prio);   // (still after anything that's shooting at us)
    ready.sort((a, b) => pr(a) - pr(b) || a.release - b.release);
    const j = forced && forced.who === who && queue.includes(forced.job) ? forced.job : ready[0]; queue = queue.filter(q => q !== j);
    forced = null;
    const react = j.prio <= 1 && j.rel >= 0 && j.ev?.kind !== 'fuel' ? A.REACT : 0;
    const start = Math.max(now, j.release + react), atJob = start + j.trip, since = atJob - j.release;
    let finish = atJob + j.work;
    if (j.notBefore) finish = Math.max(finish, j.release + j.notBefore + j.work);
    if (j.mother) {                                           // a tongue can only be hit while it's out
      const M = j.mother;
      let w = j.release + M.first; while (w + M.open < atJob + A.CLIMB) w += M.every;
      finish = w + (M.wins - 1) * M.every + M.open / 2;
      const missed = Math.round((w - j.release - M.first) / M.every);   // puffs before anyone was at the cannon: barnacles
      if (missed > 0) push(scrape(sideOf(j), Math.min(6, missed * g.MOTHER_TOSSES), 0), w, j.ev);
    }
    if (j.swarm) {                                            // each big asteroid: shot in time, or a big hit
      let c = since + A.CLIMB, hits = 0;
      for (let i = 0; i < g.SWARM_SIZE; i++) { c = Math.max(c, i * g.SWARM_INTERVAL) + j.swarm.per; if (c > j.swarm.hitAt + i * g.SWARM_INTERVAL) hits++; }
      if (hits) { repairs(0, hits, j.release + j.swarm.hitAt, 'front', j.ev); lateList.push(j.label); }
    }
    if (j.late && j.deadline !== null && since > j.deadline) {
      const res = j.late(j, finish - j.release), at = j.release + j.deadline;
      lateList.push(j.label);
      if (res.cancelAt !== undefined) finish = Math.max(start, Math.min(finish, j.release + res.cancelAt));   // (gone before anyone got there: no time spent)
      for (const nj of res.jobs || []) push(nj, j.release + (nj.rel || 0), j.ev);
      if (res.breaks) repairs(0, res.breaks / A.BREAK_PER_LARGE, at, sideOf(j), j.ev);
      if (res.large) repairs(0, res.large, at, sideOf(j), j.ev);
      if (res.breach) breach(res.breach, at, sideOf(j), j.ev);
      if (res.crewHits) crewHits += res.crewHits;
      if (res.scram) scrams.push([j.release + res.scram[0], j.release + res.scram[1]]);
      if (res.drain) drains.push(res.drain);
      if (res.jumpDelay) jumpDelay += res.jumpDelay;
    }
    if (j.optional && j.deadline !== null && since + j.work <= j.deadline && /canister/.test(j.label)) bonusCells++;
    if (j.coil && finish < end) coilsDone++;
    // heavy shots while the frigate's coils are intact: a shield each (solo the gunner nips out; else a crewmate)
    if (j.heavies) for (const h of j.heavies(since)) {
      draws.push({ t: j.release + h, cap: CAP[sideOf(j)], units: 1, shield: true, job: j });
      if (n === 1) finish += A.SHIELD_DETOUR;
      else push({ label: 'shield against a heavy shot', trip: H(`${L(sideOf(j))} shield button`), work: 1.5 }, j.release + h - H(`${L(sideOf(j))} shield button`) - 2, j.ev);
    }
    // the enemy keeps shooting until the job is done
    if (j.alive) {
      const t0 = j.release + (j.alive.from || 0), t1 = finish, tg = Math.min(t1, Math.max(t0, atJob + A.CLIMB));   // ignored until tg, fought after
      const k = (tg - t0) + A.SUPPRESS * (t1 - tg);
      if (t1 > t0) {
        overTime((j.alive.small || 0) * k, (j.alive.large || 0) * k, t0, t1, sideOf(j), j.ev);
        if (j.alive.breaks) repairs(0, j.alive.breaks * (t1 - t0) / A.BREAK_PER_LARGE, (t0 + t1) / 2, sideOf(j), j.ev);
        if (j.alive.crew) crewHits += j.alive.crew * (t1 - t0);
      }
    }
    if (j.fixed) { overTime(j.fixed.small || 0, 0, j.release + j.fixed.span[0], j.release + j.fixed.span[1], sideOf(j), j.ev); crewHits += j.fixed.crewHits || 0; }
    if (j.crewHits) crewHits += j.crewHits;
    for (const e of j.energy) draws.push({ t: atJob + A.CLIMB, span: Math.max(1, finish - atJob - A.CLIMB), ...e, job: j });
    if (j.storm) storms.push({ t: j.release, arcs: j.storm.arcs, every: j.storm.every });
    if (j.objective && finish < end) for (const k in j.objective) got[k] = (got[k] || 0) + j.objective[k];
    free[who] = finish; busy += Math.max(0, Math.min(finish, end) - start);
    const entry = { ...j, start, atJob, finish, who };
    done.push(entry); cur[who] = entry;
    if (j.openRef) { j.openRef.b = finish; entry.openRef = j.openRef; }
    else if (j.weight) open.push(entry.openRef = { a: j.release, b: finish, w: j.weight });
  }
  if (rules.coils) jumpDelay += (g.COIL_SPOTS.length - coilsDone) * g.COIL_DELAY;   // (not modelled further: more time under fire)
  // the energy pass; fights that wait for energy take more fire
  const en = energyPass(build, draws, scrams, drains, storms, bonusCells, end);
  for (const w of en.waits) if (w.wait > 0 && w.job.alive) overTime((w.job.alive.small || 0) * w.wait * A.SUPPRESS, (w.job.alive.large || 0) * w.wait * A.SUPPRESS, w.t, w.t + w.wait, sideOf(w.job), w.job.ev);
  const extra = queue.filter(j => j.prio === 2 && j.release < end).reduce((s, j) => s + j.trip + j.work, 0);   // repairs that came from those waits
  for (const j of queue.filter(j => j.weight && j.release < end)) open.push({ a: j.release, b: j.release + j.trip + j.work + 10, w: j.weight });
  // problems open at once (fires, broken parts): from when they happen until they're fixed
  const marks = open.flatMap(({ a, b, w }) => [[a, w], [Math.max(a, Math.min(b, end)), -w]]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let level = 0, peak = 0; for (const [, d] of marks) { level += d; peak = Math.max(peak, level); }
  peak += en.unmetShields > 0 ? A.BREAK_PER_LARGE * Math.min(1, en.unmetShields) : 0;
  const crewNeed = busy + extra + crewHits * A.CREW_HIT_COST + en.unmetShields * A.BREAK_PER_LARGE * (g.REPAIR_TIME + A.TOOL_FETCH + 6);
  const crewHave = n * end;
  return { id: build.id, n, end, events: events.length, crewNeed, crewHave, load: crewNeed / crewHave, peak, late: lateList.length, lateList, crewHits,
           energy: en, objOk: objectiveMet(objective, got), got, jumpDelay, done };
}
function objectiveMet(o, got) {
  if (!o) return true;
  if (o.kind === 'pirates' || o.kind === 'intruder') return (got[o.kind] || 0) >= o.count;
  return (got[o.kind] || 0) >= 1;
}
// Reactor → lever → capacitors, against the demand. The lever steps mid → right → left on its own; while
// a fight waits for energy, it's pinned on that side (a wrench in the lever).
function energyPass(build, draws, scrams, drains, storms, bonusCells, end) {
  const E = build.energy, g = build.g, caps = [...E.start], shots = { port: E.spe, front: E.spe, star: E.spe };
  const prod = [];                                             // when the reactor delivers (fuel, refuelling, scrams)
  let t = 0, made = 0;
  const fuel = (E.cells + bonusCells) * E.perCell, paused = (x) => scrams.some(([a, b]) => x >= a && x < b);
  while (made < fuel && t < end + 60) {
    t += E.interval;
    if (made && made % E.perCell === 0) t += E.inserter ? 2 : A.REFUEL;   // loading the next cell
    while (paused(t)) t += 1;
    prod.push(t); made++;
  }
  const need = [];                                             // what's drawn, in energy units
  for (const d of [...draws].sort((a, b) => a.t - b.t)) {
    if (d.shots !== undefined) {                               // a cannon starts full; each reload is one energy
      let s = d.shots - shots[d.gun], units = 0;
      while (s > 1e-9) { units++; s -= E.spe; }
      shots[d.gun] = -s;
      for (let i = 0; i < units; i++) need.push({ t: d.t + d.span * (i + 0.5) / units, cap: d.cap, job: d.job });   // reloads spread over the fight
    } else for (let i = 0; i < d.units; i++) need.push({ t: d.t, cap: d.cap, job: d.job, shield: d.shield });
  }
  const window = g.JUMP_WINDOW * (build.rules.handle ? 2 : 1);
  need.push({ t: build.jumpAt, cap: 1, jump: true });
  for (const dr of drains) for (let x = dr.from; x < Math.min(dr.until, end); x += 1 / dr.per) need.push({ t: x, cap: dr.cap, drain: true });
  for (const s of storms) for (let i = 0; i < s.arcs; i++) need.push({ t: s.t + i * s.every, arc: true });
  need.sort((a, b) => a.t - b.t);
  // one timeline: demands as they come, a delivery at each production time
  const timeline = [...need.map(d => ({ t: d.t, d })), ...prod.map(p => ({ t: p, p: true }))].sort((a, b) => a.t - b.t || (a.p ? 1 : -1));
  let pos = 1, wasted = 0, arced = 0, unmetShields = 0, drained = 0, jumpOk = true;
  const pending = [], waits = [];
  const serve = (at) => {                                      // waiting demands take what's there: the jump first, then oldest first
    pending.sort((a, b) => (b.jump ? 1 : 0) - (a.jump ? 1 : 0) || a.t - b.t);
    for (const q of [...pending]) if (caps[q.cap] > 0) { caps[q.cap]--; q.done = at; pending.splice(pending.indexOf(q), 1); }
  };
  for (const ev of timeline) {
    if (ev.p) {
      const at = ev.t, first = pending.find(q => q.jump) || pending[0];
      const prep = !first && at >= build.jumpAt - A.JUMP_PREP && caps[1] < 1;   // before the jump: the lever goes to MID
      const to = first ? first.cap : prep ? 1 : pos;           // a fight waiting for energy: the lever is pinned on its side (wrench)
      if (!first && !prep) pos = (pos + 1) % 3;
      if (caps[to] < E.capMax) caps[to]++; else wasted++;
      serve(at);
      continue;
    }
    const d = ev.d;
    if (d.arc) { caps.forEach((c, i) => { if (c >= E.capMax) { caps[i]--; arced++; } }); continue; }   // ion storm: full capacitors arc
    if (d.drain) { if (caps[d.cap] > 0) { caps[d.cap]--; drained++; } continue; }
    if (caps[d.cap] > 0) { caps[d.cap]--; d.done = d.t; continue; }
    if (d.shield) { unmetShields++; continue; }               // no energy for the shield: the hit lands
    pending.push(d);
  }
  for (const d of need) {
    if (d.jump) { if (d.done === undefined || d.done - d.t > window) jumpOk = false; }
    else if (d.job && !d.shield && d.t < end) waits.push({ t: d.t, wait: Math.max(0, Math.min(d.done ?? end, end) - d.t), job: d.job, never: d.done === undefined || d.done > end });
  }
  const used = need.filter(d => !d.drain && !d.jump && !d.arc).length;
  return { demand: used + 1, supply: E.start.reduce((s, v) => s + v, 0) + prod.filter(x => x < end).length, produced: prod.filter(x => x < end).length,
           wasted, arced, unmetShields, drained, jumpOk, waits: waits.filter(w => w.wait > 0), waited: waits.reduce((s, w) => s + w.wait, 0),
           never: waits.filter(w => w.never).length, interval: E.interval, cells: E.cells + bonusCells };
}
function verdictOf(r) {
  const why = [];
  if (r.peak > game().MAX_DAMAGE) why.push(`~${r.peak.toFixed(1)} problems open at once (more than ${game().MAX_DAMAGE} broken loses)`);
  if (!r.energy.jumpOk) why.push('no energy for the jump');
  if (!r.objOk) why.push('objective out of reach');
  if (r.load > A.MAX_LOAD) why.push(`crew needed ${Math.round(r.load * 100)}% of the time they have`);
  if (why.length) return { verdict: 'impossible', why };
  if (r.peak >= A.TIGHT_OPEN) why.push(`~${r.peak.toFixed(1)} problems open at once`);
  if (r.load > A.TIGHT_LOAD) why.push(`crew busy ${Math.round(r.load * 100)}%`);
  if (r.energy.waited > A.TIGHT_WAIT || r.energy.never) why.push(`fights wait ${Math.round(r.energy.waited)} s for energy`);
  if (r.energy.unmetShields) why.push(`${r.energy.unmetShields} shield(s) without energy`);
  return { verdict: why.length ? 'tight' : 'doable', why };
}
function scoreOf(r) {
  const S = A.SCORE, g = game();
  const energy = Math.min(1.5, r.energy.demand / Math.max(1, r.energy.supply)) + Math.min(0.5, r.energy.waited / 60);
  return Math.round(S.load * Math.min(1.5, r.load) + S.open * Math.min(1.5, r.peak / g.MAX_DAMAGE) + S.energy * energy + S.late * Math.min(1.5, r.late / Math.max(1, r.events)));
}

// ===========================================================================
// Running it
// ===========================================================================
function balance(opts = {}) {
  if (opts.hit) A.HIT_RATE = opts.hit;
  const g = game();
  const ids = opts.missions || [...SKIRMISH_ORDER.filter(id => g.MISSIONS[id]), ...g.CAMPAIGN];
  const players = opts.players || PLAYERS, runs = opts.runs || A.RUNS, ship = opts.ship || {};
  const out = [];
  for (const id of ids) for (const n of players) {
    const rs = [];
    for (let k = 0; k < runs; k++) {
      const b = setup(id, n, ship, A.SEED + k * 101 + n, opts.patch);
      if (opts.energy) opts.energy(b.energy, n);       // try other energy rules (e.g. the solo reactor speed for everyone)
      const r = seeded(A.SEED + k, () => simulate(b));
      Object.assign(r, verdictOf(r)); r.score = scoreOf(r); rs.push(r);
    }
    const order = ['doable', 'tight', 'impossible'], med = (f) => { const v = rs.map(f).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
    const counts = Object.fromEntries(order.map(v => [v, rs.filter(r => r.verdict === v).length]));
    const verdict = order[Math.max(...rs.map(r => order.indexOf(r.verdict)).sort((a, b) => a - b).slice(Math.floor(rs.length / 2), Math.floor(rs.length / 2) + 1))];
    const worst = order[Math.max(...rs.map(r => order.indexOf(r.verdict)))];
    const whyMap = {}; for (const r of rs) for (const w of r.why) { const key = w.replace(/[\d.~]+/g, '#'); whyMap[key] = whyMap[key] || w; }
    out.push({ id, n, name: g.MISSIONS[id].name, campaign: g.MISSIONS[id].campaign || 0, runs, verdict, worst, counts, score: med(r => r.score),
               length: med(r => r.end), load: med(r => r.load), peak: med(r => r.peak), late: med(r => r.late),
               energyNeed: med(r => r.energy.demand), energySupply: med(r => r.energy.supply), waited: med(r => r.energy.waited),
               crewNeed: med(r => r.crewNeed), crewHave: med(r => r.crewHave), interval: rs[0].energy.interval, cells: rs[0].energy.cells,
               why: Object.values(whyMap).slice(0, 3), sample: rs[0] });
  }
  return out;
}
// Campaign check: each chapter should be at least as hard as the one before, without a big jump.
function campaignCheck(rows, n, jump = 20) {
  const ch = rows.filter(r => r.campaign && r.n === n).sort((a, b) => a.campaign - b.campaign), flags = [];
  for (let i = 1; i < ch.length; i++) {
    const d = ch[i].score - ch[i - 1].score;
    if (d < 0) flags.push(`${ch[i].name} is easier than ${ch[i - 1].name} (${ch[i].score} < ${ch[i - 1].score})`);
    else if (d > jump) flags.push(`big jump from ${ch[i - 1].name} to ${ch[i].name} (+${d})`);
  }
  return flags;
}

function main() {
  const args = process.argv.slice(2), opts = {}, ids = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--hit') opts.hit = +args[++i];
    else if (args[i] === '--runs') opts.runs = +args[++i];
    else if (args[i] === '--ship') opts.ship = Object.fromEntries(args[++i].split(',').map(s => [s, true]));
    else if (args[i] === '--players') opts.players = args[++i].split(',').map(Number);
    else if (args[i] === '--detail') opts.detail = [args[++i], +args[++i] || 1];
    else if (args[i] === '--calibration') opts.cal = true;
    else ids.push(args[i]);
  }
  const g = game();
  if (opts.detail) {
    const [id, n] = opts.detail, b = setup(id, n, opts.ship || {}, A.SEED + n), r = seeded(A.SEED, () => simulate(b));
    Object.assign(r, verdictOf(r)); r.score = scoreOf(r);
    console.log(`${g.MISSIONS[id].name}, ${n} player(s): jump at ${b.jumpAt.toFixed(0)} s; energy every ${b.energy.interval.toFixed(1)} s, ${b.energy.cells} cells`);
    console.log('events: ' + b.events.map(e => `${e.kind}@${e.t.toFixed(0)}`).join(', '));
    for (const j of r.done.sort((a, b) => a.start - b.start)) console.log(`  P${j.who + 1} ${j.start.toFixed(0).padStart(4)}–${j.finish.toFixed(0).padStart(4)} s  ${j.label}${j.release !== undefined ? ` (from ${j.release.toFixed(0)})` : ''}`);
    console.log(`crew ${Math.round(r.load * 100)}% busy, peak ${r.peak.toFixed(1)} open, energy ${r.energy.demand}/${r.energy.supply}, waited ${r.energy.waited.toFixed(0)} s → ${r.verdict} (${r.score}) ${r.why.join('; ')}`);
    return;
  }
  if (opts.cal) {
    console.log('Each encounter in the game for 60 s with nobody fighting back (3 seeds; the crew member waits in the reactor room):');
    for (const k of ['interceptor', 'frigate', 'stealth', 'tractor', 'pirates', 'swarm', 'intruder', 'saboteur', 'mines', 'spores', 'leeches', 'grappler', 'mother', 'leviathan', 'coolant']) {
      const c = calibrate(k), f = Object.entries(c.first).map(([a, v]) => `${a} ${v.toFixed(1)} s`).join(', ');
      console.log(`  ${k.padEnd(12)} small hits ${c.small.toFixed(1).padStart(5)}  big hits ${c.large.toFixed(1).padStart(4)}  crew hits ${c.crewHits.toFixed(1).padStart(4)}  broken ${c.broken.toFixed(1).padStart(4)}   first: ${f || '-'}`);
    }
    return;
  }
  if (ids.length) opts.missions = ids;
  console.log(`Assumptions: hit rate ${A.HIT_RATE}, ${A.AIM_TIME} s per shot, reaction ${A.REACT} s, ${opts.runs || A.RUNS} random builds each (top of tools/balance.js).`);
  console.log(`Energy: ${g.CELL_ENERGY} per cell, 1 every ${g.ENERGY_TIME} s solo (÷ crewPace), capacitors hold ${g.CAP_MAX}, ${g.SHOTS_PER_ENERGY} shots per energy.\n`);
  const rows = balance(opts);
  const pad = (s, w) => String(s).padEnd(w), num = (v, w, d = 0) => (typeof v === 'number' ? v.toFixed(d) : v).padStart(w);
  console.log(pad('mission', 24) + pad('n', 3) + num('jump', 6) + num('e/s', 6) + num('cells', 6) + num('energy', 10) + num('crew', 7) + num('open', 6) + num('late', 5) + '  ' + pad('verdict', 11) + num('score', 6) + '  why');
  for (const r of rows) console.log(pad(r.name, 24) + pad(r.n, 3) + num(r.length, 6) + num(r.interval, 6, 1) + num(r.cells, 6) + num(`${r.energyNeed}/${r.energySupply}`, 10) + num(`${Math.round(r.load * 100)}%`, 7) + num(r.peak, 6, 1) + num(r.late, 5) + '  ' + pad(r.verdict + (r.worst !== r.verdict ? '*' : ''), 11) + num(r.score, 6) + '  ' + r.why.join('; '));
  console.log('\n* the worst of the random builds is worse: ' + rows.filter(r => r.worst !== r.verdict).map(r => `${r.name} ×${r.n} (${r.worst} in ${r.counts[r.worst]}/${r.runs})`).join(', '));
  console.log('\nFuel: what the reactor would make until the jump vs the fuel aboard (median over the missions):');
  for (const n of [...new Set(rows.map(r => r.n))]) {
    const rs = rows.filter(r => r.n === n), med = (v) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
    const want = med(rs.map(r => r.length / r.interval)), most = Math.max(...rs.map(r => r.length / r.interval)), base = (rs[0].cells - (n - 1)) * g.CELL_ENERGY, have = rs[0].cells * g.CELL_ENERGY;
    const gap = med(rs.map(r => r.interval)), perGap = 60 / gap;
    console.log(`  ${String(n).padStart(2)} player(s): an energy every ${gap.toFixed(1)} s; until the jump ${want.toFixed(0)} (at most ${most.toFixed(0)}) vs ${have} in ${rs[0].cells} cells (${base} without the crew's extra cells)`);
  }
  for (const n of [...new Set(rows.map(r => r.n))]) {
    const rank = rows.filter(r => r.n === n).sort((a, b) => a.score - b.score);
    console.log(`\nRanking, ${n} player(s), easiest first: ` + rank.map(r => `${r.name} ${r.score}`).join(' < '));
    const flags = campaignCheck(rows, n);
    if (flags.length) console.log('  campaign: ' + flags.join('; '));
  }
}
if (require.main === module) main();

module.exports = { balance, campaignCheck, calibrate, simulate, setup, verdictOf, scoreOf, A, PLAYERS };
