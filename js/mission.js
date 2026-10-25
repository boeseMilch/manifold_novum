// Mission script, radar, helm diagnosis, security console (door locks + manual override),
// fires, and the win/lose rules. Units: layout units, times in seconds.

let RADAR_RANGE = 45;                                // (ship upgrades: see progress.js)
const STEALTH_RADAR = 12;                            // a stealth fighter only shows on the radar this close (s) to arriving
const radarReach = (ev) => (ev.kind === 'stealth' ? Math.min(RADAR_RANGE, STEALTH_RADAR) : RADAR_RANGE);
const MOCK_WINDOW = [3, 8], MAINT_WARNING = 20;
// Maintenance failures: each one has its own pair of parts (the one that breaks + a decoy) that show
// "irregular readings" at the helm MAINT_YELLOW s before the break; the real one turns orange MAINT_WARNING s ahead.
const MAINT_YELLOW = 180;
const JUMP_DELAY = 22;                      // the jump comes mid-battle: 22 s after the final fight starts
// ... or MISSIONS[id].finaleLead s after it, where the finale needs longer to matter (c2's frigate: its heavy shots)
const finaleLead = (id) => MISSIONS[id]?.finaleLead ?? JUMP_DELAY;
// No time limit on the jump, but staying gets worse and worse (updatePressure): once the jump is due, an extra
// encounter PRESS_FIRST s later, then each gap PRESS_SHRINK × the last, down to PRESS_FLOOR s; and a part
// gives out STRAIN_FIRST s after it's due, then each gap × PRESS_SHRINK, down to STRAIN_FLOOR s.
const PRESS_FIRST = 30, PRESS_SHRINK = 0.8, PRESS_FLOOR = 6, STRAIN_FIRST = 40, STRAIN_FLOOR = 10;
const PRESS_KINDS = new Set(['interceptor', 'frigate', 'swarm', 'intruder', 'saboteur', 'mines', 'spores', 'debris', 'leeches', 'grappler', 'stealth', 'herd']);
const PRESS_BASE = ['interceptor', 'swarm', 'intruder', 'mines'];   // always in the pool (plus the mission's own kinds above)
// The stalled jump (no energy in MID): the drive charges for STALL_RISE s, sputters out for STALL_SPUTTER s,
// lies dead until STALL_CYCLE s, and tries again. Every sputter is a failed attempt (a banner and a cough).
const STALL_RISE = 2.6, STALL_SPUTTER = 0.8, STALL_CYCLE = 4.5, STALL_PEAK = 0.78;
let MAX_DAMAGE = 5;                         // broken parts at once the ship survives (6 with the reinforced hull: applyShipUpgrades, js/progress.js)
const COMBAT_KINDS = new Set(['interceptor', 'frigate', 'swarm', 'intruder', 'saboteur', 'pirates', 'stealth', 'tractor', 'grappler', 'leeches', 'mother', 'mines', 'leviathan', 'brig', 'herd']);
let FIRE_TIME = 15;
const SPRAY_RANGE = 2.8, SPRAY_RATE = 0.8;

const mission = {
  active: true, t: 0, events: [], revealed: new Set(), scanT: -10, lastScan: null,
  diagRun: false, jump: null, over: null, banner: 0,
};
const fires = [];
// Luck: petting the cat makes the dice friendlier for LUCK_TIME seconds.
const LUCK_TIME = 60;
const luck = { t: 0, pet: 0 };
const lucky = () => luck.t > 0;
// The multiplier on the bad dice (fires, broken parts): LUCK_CUT per cat, to the power of the cat's luck (1 while it
// lasts) plus half a cat for every easier difficulty step that had no encounter left to drop (mission.extraLuck).
const luckCut = () => LUCK_CUT ** ((lucky() ? 1 : 0) + (mission.extraLuck || 0));
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
  if (ev.kind === 'swarm') return `Asteroid swarm — ${SIDE_NAME[ev.side] || 'front'}`;
  if (ev.kind === 'intruder' && ev.pods) return ev.count > 1 ? `${ev.count} intruders — the cargo pods` : 'Intruder — the cargo pod';
  if (ev.kind === 'intruder') return ev.count > 1 ? `${ev.count} intruders — both airlocks` : `Intruder — ${ev.side === 'port' ? 'left' : 'right'} airlock`;
  if (ev.kind === 'saboteur') return `Saboteur — ${ev.side === 'port' ? 'left' : 'right'} airlock`;
  if (ev.kind === 'mines') return `Mine drone — ${SIDE_NAME[ev.side]}`;
  if (ev.kind === 'spores') return `Spore cloud — ${SIDE_NAME[ev.side] || 'one'} airlock`;   // (it seeps in there: js/spores.js)
  if (ev.kind === 'canister') return `Fuel canister — ${SIDE_NAME[ev.side]}`;
  return EVENT_LABELS[ev.kind]?.(ev) || ev.kind;
}
// Labels for event kinds defined further on (filled in by the files that add them).
const EVENT_LABELS = {
  debris: (ev) => `Debris — ${GUNS.find(g => g.id === ev.gun)?.name.toLowerCase()}`,
  antenna: () => 'Antenna strike — top',
};
const EVENT_RUNNERS = {};                              // event kinds added by other files: kind → run(ev)
// The sprite pages each event kind shows (js/gfx.js GFX.stream: 'group' or 'group/page'). A mission streams those of its
// timeline in the background from the start, in order, so a big arrival (the pirate base: ~5 maps of 4096²) doesn't
// load all at once when it shows up. A kind not listed loads its sprites when first drawn, as before.
const EVENT_GFX = {
  interceptor: ['enemy'], frigate: ['enemy'], stealth: ['enemy'], tractor: ['enemy'], swarm: ['enemy'], mines: ['enemy'], canister: ['enemy'],
  rock: ['enemy'], debris: ['enemy'], pirates: ['enemy', 'dock', 'chars'], derelict: ['dock', 'chars'], brig: ['dock', 'base', 'chars', 'fx'],
  intruder: ['chars'], saboteur: ['chars'], grappler: ['organic'], mother: ['organic'], leeches: ['organic'], leviathan: ['organic'],
  leviathan_boss: ['organic'], herd: ['organic'],
};
const ALWAYS_GFX = ['fx/0', 'items', 'props', 'systems', 'power', 'cargo'];   // (fires, breaches, the loose kit: any mission)
let streamedRun = null;
function streamMission() {                            // (every browser, from render: the timeline comes with the snapshot)
  const key = mission.runId && `${mission.runId}:${mission.events?.length}`;   // (a crew joining mid-run can add events)
  if (!GFX.on || !mission.active || !key || streamedRun === key) return;
  streamedRun = key;
  const evs = [...(mission.events || [])].sort((a, b) => a.t - b.t);
  GFX.stream([...ALWAYS_GFX, ...evs.flatMap(e => EVENT_GFX[e.kind] || [])]);
}
// Missions: each builds a timeline. The lobby picks one.
const randSide = () => (Math.random() < 0.5 ? 'port' : 'star');
const MISSIONS = {};                                   // (the chapters, practice and the skirmish builder: js/progress.js)
// sides: a mission's fixed side per kind ({ swarm: 'front' }: chapters 1-3 keep their repeats' swarms ahead, no draw)
function makeEvent(kind, t, target, sides) {
  const ev = { t, kind };
  if (sides?.[kind]) ev.side = sides[kind];
  else if (['interceptor', 'frigate', 'intruder', 'saboteur', 'mines', 'spores', 'canister'].includes(kind) || EVENT_SIDES[kind]) ev.side = EVENT_SIDES[kind]?.() || randSide();
  if (kind === 'maintenance') { ev.sys = target; ev.radar = false; }
  if (kind === 'debris') ev.gun = ['port', 'front', 'star'][Math.floor(Math.random() * 3)];
  if (kind === 'antenna' || kind === 'coolant' || kind === 'glitch') ev.radar = false;
  if (kind === 'herd') ev.kinds = herdPair();          // (two organic kinds, js/organic.js; a mission may write its own: kinds: [a, b])
  return ev;
}
const EVENT_SIDES = {};                                // event kinds with their own side rule (front-only etc.)
// An asteroid swarm comes from ahead or from either flank (2026-10-16: "asteroids from the side"). A written swarm
// without a side gets one at the mission start (fillSides); the approved chapters (1-3, 5) write side: 'front'.
const SWARM_SIDES = ['front', 'port', 'star'];
EVENT_SIDES.swarm = () => SWARM_SIDES[Math.floor(Math.random() * 3)];
// Written events of these kinds that don't say their side get one (drawn after the build, so a mission that writes
// every side draws nothing extra).
function fillSides(written) { for (const e of written) if (e.kind === 'swarm' && !e.side) e.side = EVENT_SIDES.swarm(); return written; }

// ---------------------------------------------------------------------------
// Pacing: every mission lasts about MISSION_LENGTH (time to the jump) for any crew; a smaller crew gets
// fewer encounters instead of longer gaps. Per mission and crew size, MISSIONS[id].crew says how many
// events (crew.events[n - 1]) and fuel cells (crew.cells[n - 1]) — fitted by `node tools/balance.js
// --calibrate` for a crew that's ~68% idle. Which events go: never the mission's essential ones
// (MISSIONS[id].essential, plus ESSENTIAL_KINDS), nor the kinds in MISSIONS[id].always (kept at every crew size
// but not an objective: they may be the finale's neighbour and still come back as repeats, like chapters 1-3's
// failing part), then optional ones in DROP_ORDER (first dropped first),
// so a solo run of a chapter always has the same kind of content. More events than written: repeats
// of the mission's most important optional kinds. MISSIONS[id].crew.extra ({ kind: count per crew size }) adds repeats
// by hand, on top of crew.events (c4 solo: a second failing part).
//   A written event with finale: true (the last one, never dropped: c8's leviathan) stays the finale: repeats go before it.
//   The opener (a written event with opener: true, the first one) is never dropped either, and never the finale:
// a mission jumps in, gives the crew a calm half minute (the first written time), then something else
// happens before the mission's main encounter (the designer's rule: if the point is X, X never comes first).
//   The kept events stay in their written order. Their times (2026-10-18, the user: "one encounter always in the
// first 5-30 s, otherwise there is nothing to do; even 2 with 2 people; then a hot time around 3:30 and another
// encounter on your way out at 4:30", for a 5-minute mission, scaled to the mission's length): shapedTimes. The
// first at 15 s (with 2+ crew and 3+ events: two, at 10 and 28 s), the last (the finale) at 90% of the length, the
// rest following the encounter density (DENSITY: hot times at 70% and 90%) with a little jitter; the jump at the
// mission's length. Missions with spacing: 'even' (the boss missions, c5 / c8: docked or fighting the
// boss most of the time) keep the old layout: evenly from the first event's written time to the length −
// finaleLead(id) (JUMP_DELAY unless the mission says), the jump finaleLead after the last. spacing: 'written' (c5
// since 2026-10-25: the patrol, the base, and what a bigger crew gets while docked) keeps every event's written time,
// the jump at the mission's length, the reactor at its written pace.
//   The reactor follows the average gap: ENERGY_TIME × gap / the written gap (paceFactor), so the energy made per gap
// is what the mission was written for.
//   Crew joining / leaving: while nobody has seen an encounter yet (the lead-in), the timeline is rebuilt
// for the new crew size (that's also how the server's start works: crew are added right after
// startMission). After that the encounters and their times stay; only the fuel crate gets the new
// size's extra cells if it needs more.
// ---------------------------------------------------------------------------
const MISSION_LENGTH = 300;                         // s to the jump (5 min; 360 from 2026-10-13 until 2026-10-18 by mistake: the user wants 5 min, longer only for the boss missions c5 / c8)
const ESSENTIAL_KINDS = new Set(['derelict', 'rock', 'brig', 'leviathan']);
const ONE_OFF_KINDS = new Set(['tide']);              // never repeated for a bigger crew (one gravity tide per mission, 2026-10-17)
// One gravity tide per mission (2026-10-17, the user: "no point if they go out of alignment all the time"): with the
// `tides` rule (its one tide, js/encounters.js) no written tide event is picked; without it only the first written one.
// (Picking only: layoutMission's written spread, and so the reactor's pace, still counts every written event.)
function oneTide(M, written) {
  const first = M?.rules?.tides ? null : written.find(e => e.kind === 'tide');
  return written.filter(e => e.kind !== 'tide' || e === first);
}
const DROP_ORDER = ['canister', 'antenna', 'debris', 'glitch', 'storm', 'coolant', 'maintenance', 'flare', 'tide', 'spores', 'mines', 'leeches', 'grappler',
                    'tractor', 'stealth', 'saboteur', 'mother', 'intruder', 'swarm', 'herd', 'frigate', 'interceptor', 'pirates'];
const crewSize = () => Math.max(1, crew.length);
// (a custom skirmish has no calibration: 2 + n/2 fuel cells, rounded up, for any crew size)
const customCrew = () => { const c = 2 + Math.ceil(customConfig(mission.custom).n / 2); return { cells: Array(8).fill(c) }; };
const missionCrew = (id, n) => { const C = MISSIONS[id]?.custom ? customCrew() : MISSIONS[id]?.crew, i = Math.min(8, Math.max(1, n)) - 1; return { events: C?.events?.[i], cells: C?.cells?.[i] ?? 4, reactor: C?.reactor?.[i] ?? 1, overcharge: !!C?.overcharge?.[i],
  extra: Object.entries(C?.extra || {}).flatMap(([k, ns]) => Array(ns[i] || 0).fill(k)) }; };
// The reactor's ENERGY_TIME multiplier: the gap / the written gap, × the crew size's reactor tuning (crew.reactor,
// < 1 where the energy needs a faster reactor to be in spec).
const paceFactor = () => (mission.gap && mission.writtenGap ? mission.gap / mission.writtenGap * (mission.reactor || 1) : 1);
// Difficulty (the lobby's slider, host's choice): 0 normal, 1 easy, 2 very easy. Each step takes one optional
// encounter out (never an essential one, and never the last one; where none is left to drop, half a cat's
// luck instead: luckCut); the rest spread evenly over the same mission time, and the reactor
// keeps normal's pace, so the crew has the same energy for fewer encounters.
const DIFFICULTIES = ['Normal', 'Easy', 'Very easy'];
// The events for a crew of n, from the written list (times as written): essential first, then by DROP_ORDER.
function selectEvents(id, written, n, target, easy = 0) {
  written = oneTide(MISSIONS[id], written);
  const M = MISSIONS[id] || {}, ess = new Set([...ESSENTIAL_KINDS, ...(M.essential || [])]), always = new Set(M.always || []);
  // crew.extra (kind: count per crew size): repeats of that kind on top of the count (2026-10-20, c4 solo: a second failing
  // part; one more in the count would have been the mine drone); easy / very easy take these out first
  const C = missionCrew(id, n), forced = C.extra.slice(0, Math.max(0, C.extra.length - easy)), easyLeft = easy - (C.extra.length - forced.length);
  const base = C.events ?? written.length, wantW = Math.min(base, Math.max(1, base - easyLeft));   // (at least one: the finale)
  const dropRank = (e) => (DROP_ORDER.indexOf(e.kind) < 0 ? 999 : DROP_ORDER.indexOf(e.kind));
  const rank = (e) => (ess.has(e.kind) || e.opener || (always.has(e.kind) && !e.optional) ? Infinity : dropRank(e));   // (optional: a written one of an `always` kind that may still go)
  const order = written.map((e, i) => ({ e, i })).sort((a, b) => rank(b.e) - rank(a.e) || a.i - b.i);   // most important first; ties: the earlier one
  const keep = order.slice(0, Math.max(order.filter(o => rank(o.e) === Infinity).length, Math.min(wantW, written.length))).map(o => o.e);
  // the finale (the last fight) shouldn't be an objective's event (it needs more than the 22 s before the jump), nor the opener
  const objective = new Set(M.essential || []), optionalFight = order.find(o => rank(o.e) !== Infinity && COMBAT_KINDS.has(o.e.kind) && !keep.includes(o.e));
  if ((objective.size || keep.some(e => e.opener)) && optionalFight && keep.filter(e => COMBAT_KINDS.has(e.kind)).every(e => objective.has(e.kind) || e.opener)) keep.push(optionalFight.e);
  const extra = [...new Set(written.map((e, i) => ({ e, i })).filter(o => !ess.has(o.e.kind) && !o.e.opener && !ONE_OFF_KINDS.has(o.e.kind))   // repeats: most important optional kinds
    .sort((a, b) => dropRank(b.e) - dropRank(a.e) || a.i - b.i).map(o => o.e.kind))];                            // (and `always` ones), in turn
  for (let i = 0; keep.length < wantW && extra.length; i++) keep.push({ ...makeEvent(extra[i % extra.length], Infinity, target, M.sides), repeat: true });
  for (const k of forced) keep.push({ ...makeEvent(k, Infinity, target, M.sides), repeat: true });
  const kept = written.filter(e => keep.includes(e)), reps = keep.filter(e => e.repeat);
  if (kept.length && kept[kept.length - 1].finale) return kept.slice(0, -1).concat(reps, kept.slice(-1));   // (a written finale: finale: true, stays last)
  return kept.concat(reps);
}
// Encounter density over the mission (x: the share of its length; piecewise linear between the knots; the user's
// design, 2026-10-18): a bump at the start, calm, ramping up to the first hot time (70%: 3:30 of a 5-minute
// mission), more in the second (90%: 4:30, on the way out), easing off to the jump. Its integral, scaled to 1, is
// the compression F: the encounters are spaced evenly (with ±SHAPE.jitter s) in F's space and mapped back, so they
// bunch where the density is high.
const DENSITY = [[0, 0.5], [0.07, 1.3], [0.2, 0.5], [0.7, 1.5], [0.9, 1.7], [1, 1.0]];
const SHAPE = { open: [15], openCrew: [10, 28], out: 0.9, jitter: 10 };
const densityArea = (x) => {                         // ∫₀ˣ density (unscaled)
  let a = 0;
  for (let i = 1; i < DENSITY.length; i++) {
    const [x0, y0] = DENSITY[i - 1], [x1, y1] = DENSITY[i];
    if (x <= x0) break;
    const xe = Math.min(x, x1), ye = y0 + (y1 - y0) * (xe - x0) / (x1 - x0);
    a += (xe - x0) * (y0 + ye) / 2;
  }
  return a;
};
const densityCdf = (x) => densityArea(Math.max(0, Math.min(1, x))) / densityArea(1);
function densityInv(u) {                             // F⁻¹ (bisection; F rises everywhere)
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (densityCdf(mid) < u) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
// The times for `count` events (in order) in a mission of length L s with n crew: the opener at 15 s (with 2+ crew and
// 3+ events two, at 10 and 28 s: always something to do from the start), the finale at 90%, or finaleLead fl s before
// the end if that's earlier (no jitter: the jump at L
// comes while it's on), the rest evenly in F's space between, each jittered by up to ±SHAPE.jitter s of that even
// timeline (at most 0.45 of a step, so the order stays) when `rnd` is given.
function shapedTimes(count, n, L, rnd = null, fl = 0) {
  if (count <= 0) return [];
  const out = Math.min(SHAPE.out * L, L - fl);      // (a mission's own finaleLead may want the finale earlier: c2's frigate 70 s before the jump)
  if (count === 1) return [out];
  const open = (n > 1 && count >= 3 ? SHAPE.openCrew : SHAPE.open).slice(0, count - 1), t = [...open];
  const from = open[open.length - 1], m = count - open.length;    // the rest; the last of them is the finale
  const F0 = densityCdf(from / L), F1 = densityCdf(out / L), jit = rnd ? Math.min(SHAPE.jitter / (out - from), 0.45 / m) : 0;
  for (let i = 1; i < m; i++) t.push(densityInv(F0 + (i / m + (rnd ? (rnd() * 2 - 1) * jit : 0)) * (F1 - F0)) * L);
  t.push(out);
  return t;
}
function layoutMission(id, n) {
  const M = MISSIONS[id] || MISSIONS.c1, written = mission.written;
  const evs = selectEvents(id, written, n, null, mission.easy || 0).map((e, i) => ({ ...e, id: i, done: false, radar: e.radar !== false,
    sys: e.kind === 'maintenance' ? null : e.sys }));
  if (!evs.length) { Object.assign(mission, { events: [], lead: Infinity, gap: null, writtenGap: null, paceN: n, jumpAt: M.practice ? Infinity : JUMP_DELAY, overcharge: false }); return; }
  const L = M.length || MISSION_LENGTH, asWritten = M.spacing === 'written', shaped = M.spacing !== 'even' && !asWritten && !M.practice, fl = finaleLead(id);
  // pin: true (a written event): it keeps its written time (scaled to the mission's length, ±SHAPE.jitter s) instead of a
  // slot in the shaped timeline; the others are shaped around it (2026-10-24, c2: the aliens break out of the cargo pods late)
  const pinned = (e) => shaped && e.pin && !e.repeat, free = evs.filter(e => !pinned(e));
  const pin = free.length ? pinned : () => false, slots = free.length ? free : evs;
  const times = shaped ? shapedTimes(slots.length, n, L, Math.random, M.finaleLead || 0) : null;
  const lead = shaped ? times[0] : Math.min(...written.map(e => e.t)), end = shaped ? times[times.length - 1] : asWritten ? Math.max(...evs.map(e => e.t)) : L - fl;
  const gap = evs.length > 1 ? (end - lead) / (evs.length - 1) : end - lead;
  evs.forEach((e, i) => { e.t1 = e.repeat ? null : e.t; e.t = asWritten ? e.t : pin(e) ? Math.min(end - 5, e.t * L / MISSION_LENGTH + (Math.random() * 2 - 1) * SHAPE.jitter)
    : shaped ? times[slots.indexOf(e)] : evs.length > 1 ? lead + i * gap : end; });   // (t1: the time as written; a lone event is the finale)
  // the finale: the last event is a fight, and the jump comes while it's still going
  // (and not an objective's event: it needs more than the 22 s before the jump)
  const sorted = () => [...evs].sort((a, b) => a.t - b.t), objective = new Set(M.essential || []);
  let last = sorted().pop();
  if (last && (!COMBAT_KINDS.has(last.kind) || objective.has(last.kind) || last.opener)) {
    const fight = sorted().filter(e => e !== last && COMBAT_KINDS.has(e.kind) && !objective.has(e.kind) && !e.opener && !pin(e)).pop();
    if (fight) [fight.t, last.t] = [last.t, fight.t];
  }
  const wLead = Math.min(...written.map(e => e.t));                     // (the written timeline's own spread)
  const wl = written.length > 1 ? (Math.max(...written.map(e => e.t)) - wLead) / (written.length - 1) : gap;
  const normal = mission.easy ? selectEvents(id, written, n, null).length : evs.length;   // the reactor's pace: normal's gap
  const nt = shaped ? shapedTimes(normal, n, L, null, M.finaleLead || 0) : null;                  // (shaped: normal's own first and last times)
  const paceGap = asWritten ? (wl || gap) : shaped ? (normal > 1 ? (nt[nt.length - 1] - nt[0]) / (normal - 1) : nt[0] - SHAPE.open[0]) : normal > 1 ? (end - lead) / (normal - 1) : end - lead;
  mission.extraLuck = ((mission.easy || 0) - (normal - evs.length)) / 2;   // easier steps with nothing left to drop: half a cat each
  Object.assign(mission, { events: evs, lead, gap: paceGap, eventGap: gap, writtenGap: wl || paceGap, paceN: n, jumpAt: M.practice ? Infinity : shaped || asWritten ? L : Math.max(0, ...evs.map(e => e.t)) + fl });
  mission.overcharge = missionCrew(id, n).overcharge; mission.reactor = missionCrew(id, n).reactor;
  pickMaintPairs(evs, maintPrev);
}
// Each maintenance failure gets its own target (breaks) + decoy (just shaky): all different parts, inside
// (it's serviced with the repair kit: no hull parts), not broken already. A relayout (crew joined in the
// lead-in) keeps the pairs it had, in time order, so the helm doesn't shuffle. Only when the ship runs out
// of parts may a pair reuse one whose warning doesn't overlap.
let maintPrev = [];                                  // (the last layout's pairs: [{ sys, decoy }], in time order)
// A custom skirmish's failing parts are the ticked ones (the decoy, only shaky, may be any)
const maintAllowed = (s) => !MISSIONS[mission.id]?.custom || customConfig(mission.custom).parts.includes(s.name);
// What a failing part can be: the parts inside (every mission), plus where the mission allows it (MISSIONS[id].failing:
// { emitter, seam }, or a custom skirmish: then maintAllowed narrows it to the ticked ones) the shield emitters outside
// (serviced or fixed on a spacewalk) and the hull seams (HULL_SEAMS, js/hazards.js: one that fails is a breach).
// (Missions without them draw from exactly the list they always had: the balance model's seeded builds stay the same.)
function failPool() {
  const M = MISSIONS[mission.id] || {}, on = (k) => !!M.custom || !!M.failing?.[k];
  return [...SYSTEMS.filter(s => !s.outside), ...(on('emitter') ? SYSTEMS.filter(s => s.kind === 'emitter') : []), ...(on('seam') ? HULL_SEAMS : [])];
}
// (its target: a ticked part no pair uses, else one whose warning doesn't overlap, else any ticked one; null: not custom,
// or every ticked part is broken)
function customTarget(ev, used) {
  if (!MISSIONS[mission.id]?.custom) return null;
  const A = failPool().filter(s => !s.broken && maintAllowed(s));
  const t1 = A.filter(s => !used.some(u => u.s === s)), t2 = A.filter(s => !used.some(u => u.s === s && Math.abs(u.t - ev.t) < MAINT_YELLOW));
  const pool = t1.length ? t1 : t2.length ? t2 : A;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
function pickMaintPairs(evs, prev = []) {
  const ms = evs.filter(e => e.kind === 'maintenance').sort((a, b) => a.t - b.t), used = [];
  const free = (ev) => {
    const pool = failPool().filter(s => !s.broken);
    const ok = pool.filter(s => !used.some(u => u.s === s));
    const apart = pool.filter(s => !used.some(u => u.s === s && Math.abs(u.t - ev.t) < MAINT_YELLOW));
    return ok.length >= 2 ? ok : apart.length >= 2 ? apart : pool;   // (last resort: any)
  };
  ms.forEach((ev, i) => {
    let p = prev[i];
    if (!p || used.some(u => u.s === p.sys || u.s === p.decoy) || !p.sys || p.sys.broken || p.decoy?.broken || !maintAllowed(p.sys)) {
      const c = free(ev), take = () => c.splice(Math.floor(Math.random() * c.length), 1)[0], own = customTarget(ev, used);
      if (own && c.includes(own)) c.splice(c.indexOf(own), 1);
      p = own ? { sys: own, decoy: take() } : { sys: take(), decoy: take() };
    }
    Object.assign(ev, { sys: p.sys, decoy: p.decoy || null, serviced: false, seen: !!p.seen });
    used.push({ s: p.sys, t: ev.t }, { s: p.decoy, t: ev.t });
  });
  maintPrev = ms.map(e => ({ sys: e.sys, decoy: e.decoy, seen: e.seen }));
}
// When a pair's warning starts (MAINT_YELLOW s ahead): if one of its parts got broken meanwhile (a hit, a fire),
// it takes a working part instead, one no other warning pair uses.
function armMaintPairs() {
  for (const ev of mission.events) {
    if (ev.kind !== 'maintenance' || ev.armed || ev.done || mission.t < (ev.warnFrom ?? ev.t - MAINT_YELLOW)) continue;
    ev.armed = true;
    if (!ev.sys?.broken && !ev.decoy?.broken) continue;
    const busy = new Set(maintWarnings().filter(w => w.ev !== ev).flatMap(w => [w.sys, w.decoy]));
    const c = failPool().filter(s => !s.broken && !busy.has(s) && s !== ev.sys && s !== ev.decoy);
    const take = (ok = () => true) => { const k = c.filter(ok), x = k.length ? k : c; return c.splice(c.indexOf(x[Math.floor(Math.random() * x.length)]), 1)[0]; };
    if (ev.sys?.broken && c.length) ev.sys = take(maintAllowed);
    if (ev.decoy?.broken && c.length) ev.decoy = take();
  }
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
function startMission(id = 'c1', opts = {}) {
  applyShipUpgrades(opts.ship || {});
  // the first failure's pair is drawn up front (as it always was: the random draws, and with them the balance
  // model's seeded builds, stay the same for a mission with one); more failures draw theirs in the layout
  const candidates = SYSTEMS.filter(s => !s.broken && !s.outside);   // (the maintenance failure is fixed inside: no hull parts)
  const pick = () => candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
  const sys = pick(), decoy = pick();
  maintPrev = [{ sys, decoy }];
  if (typeof resetCrewTasks === 'function') resetCrewTasks();   // no claims, no task plates (js/claims.js)
  resetHazards(); resetEncounters(); resetOrganic(); resetDock(); resetEva((MISSIONS[id] || MISSIONS.c1).rules || {});
  Object.assign(mission, {
    rules: { ...((MISSIONS[id] || MISSIONS.c1).rules || {}) }, objective: (MISSIONS[id] || MISSIONS.c1).objective || null,
    id, active: true, coilsChecked: false, autoPull: null, autoJump: false, t: 0, revealed: new Set(), scanT: -10, lastScan: null, diagRun: false, jump: null, over: null, press: null,
    crewCells: undefined, extraLuck: 0, easy: Math.min(2, Math.max(0, Math.floor(+opts.easy) || 0)),
    custom: (MISSIONS[id] || {}).custom ? customConfig(opts.custom) : null,
  });
  mission.written = fillSides((MISSIONS[id] || MISSIONS.c1).build(null).map(({ sys, ...e }) => e));   // the timeline as written (no part refs: it's sent to browsers)
  layoutMission(id, crewSize());
  setupCargoPods(mission.written.filter(e => e.kind === 'intruder' && e.pods).reduce((n, e) => n + (e.count || 1), 0));   // (chapter 2's cargo: js/invader.js)
  if (mission.objective?.kind === 'ore' && !ITEMS.some(i => i.kind === 'drill')) ITEMS.push({ kind: 'drill', x: 4.2, y: 21.8 });   // the mining drill, left airlock room
  power.reserve = 0; crewFuel(crewSize());              // (the crew's cells, then the ship's spare cell on top)
  shipStartExtras(opts.ship || {});
  mission.upgrades = { ...(opts.ship || {}) }; mission.runId = `${Date.now().toString(36)}-${newUid()}`; mission.kills = 0;
  for (const c of crew) applyKit(c, c.kit);
  const mDef = MISSIONS[mission.id] || {};
  combatBanner(mDef.practice ? 'Practice — the ship is yours' : mDef.tutorial ? 'Training — welcome aboard' : `Jumped into the hot zone. Hold out until the jump!${mission.easy ? ` (${DIFFICULTIES[mission.easy].toLowerCase()})` : ''}`);
}

function runEvent(ev) {
  ev.done = true;
  if (ev.kind === 'interceptor' || ev.kind === 'frigate') combatSpawn(ev.kind, ev.side);
  else if (ev.kind === 'swarm') combatSpawn('swarm', ev.side || 'front');
  else if (ev.kind === 'intruder') spawnIntruders(ev);
  else if (ev.kind === 'saboteur') spawnSaboteur(ev.side);
  else if (ev.kind === 'maintenance') { if (!ev.serviced && ev.sys && !ev.sys.broken) (ev.sys.kind === 'seam' ? failSeam : breakSystem)(ev.sys); }
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
  armMaintPairs();
  for (const ev of mission.events) if (!ev.done && mission.t >= ev.t) runEvent(ev);
  // a jump of its own (autoJump: the finale's beaten, its cutscene plays: the leviathan freed, js/leviathan.js levFree): the
  // drive winds up (jumpCharge) and jumps at jumpAt with no handle, nav fix, coils or MID energy, everyone aboard carried along
  if (mission.autoJump && !mission.jump) {
    if (mission.t < mission.jumpAt) return;
    const obj = objectiveStatus();
    if (obj.done) endMission(true, 'Jumped out safely.'); else endMission(false, `Jumped out ${obj.fail}: objective failed.`, true);
    return;
  }
  // jump: after the last encounter the drive spools up; it jumps as soon as MID has energy (and the handle is
  // pulled, rule handle). There's no time limit, but every second it doesn't, things get worse (updatePressure).
  if (mission.t >= mission.jumpAt && !mission.jump && !mission.coilsChecked) {          // misaligned jump coils: the drive takes longer
    mission.coilsChecked = true;
    const extra = coilDelay();
    if (extra) { mission.jumpAt += extra; combatBanner(`Jump coils misaligned — the jump drive needs ${extra} s longer!`); }
  }
  // the jump handle at the helm: without the `handle` rule the autopilot pulls it, AUTO_LEAD s before the drive
  // spools (you see it move; the jump's timing is unchanged). With the rule it can't: a person has to (minigames.js).
  if (!mission.rules?.handle && mission.autoPull == null && (mission.jump || mission.t >= jumpDueAt() - AUTO_LEAD)) {
    mission.autoPull = mission.t; combatBanner('Autopilot: jump handle engaged'); sfx.clank();
  }
  if (mission.t >= mission.jumpAt && !mission.jump) {
    mission.jump = { t: 0, st: 0, fails: 0 };
    mission.press = MISSIONS[mission.id]?.practice ? null : { n: 0, strain: 0, strainAt: mission.t + STRAIN_FIRST };   // (practice's jump handle: no hot zone)
    if (mission.rules?.handle) { combatBanner('No nav fix out here — someone pull the jump handle!'); sfx.say?.('No navigation fix. Manual jump required.'); }
    else if (!midReady()) combatBanner(broken(CAPACITORS[1]) ? 'Jump drive spooling up — fix the middle capacitor, then 1 energy!' : 'Jump drive spooling up — needs 1 energy in MID!');
    else combatBanner('Jump drive spooling up!');   // (MID has energy: no "needs energy" hint, it jumps right away)
  }
  if (mission.jump) {
    const j = mission.jump;
    j.t += dt;
    const pulled = !mission.rules?.handle || (j.pull || 0) >= JUMP_PULL;      // harder missions: someone has to pull the handle
    const held = pulled && midReady() && typeof dockJumpHold === 'function' && dockJumpHold();   // a ship docked to ours (js/dock.js)
    if (held) { if (!/^Jump blocked/.test(combat.banner?.text || '') || combat.banner.t < 0.5) combat.banner = { text: held, t: 1.5 }; }
    else if (pulled && midReady()) {
      CAPACITORS[1].charge--;
      if (/^Jump failed/.test(combat.banner?.text || '')) combat.banner = null;
      const obj = objectiveStatus();
      if (!crewAboard()) { endMission(false, 'The ship jumped with nobody aboard — the crew was left behind.', true); mission.over.results = missionResults(false); return; }   // (no pay either)
      if (obj.done) endMission(true, 'Jumped out safely.'); else endMission(false, `Jumped out ${obj.fail}: objective failed.`, true);
      return;
    }
    if (midReady() && /^Jump (failed|drive spooling up —)/.test(combat.banner?.text || '')) combat.banner = null;   // energy's in: drop the "no energy" hint
    if (!midReady()) {                                   // stalled: the drive charges, sputters out, tries again (jumpStall)
      j.st = (j.st || 0) + dt;
      if (j.st >= STALL_RISE + (j.fails || 0) * STALL_CYCLE) {
        j.fails = (j.fails || 0) + 1;
        combat.banner = { text: broken(CAPACITORS[1]) ? 'Jump failed — fix the middle capacitor!' : 'Jump failed — no energy in MID!', t: 2 };
        sfx.sputter?.();
        if (j.fails === 1) sfx.say?.('Jump failed. No energy.');
      }
    }
    updatePressure();
  }
  const dmg = SYSTEMS.filter(s => s.broken).length;
  if (dmg > MAX_DAMAGE) {
    endMission(false, mission.press ? `The ship fell apart waiting for the jump (${dmg} parts broken).` : `The ship fell apart (${dmg} parts broken at once).`);
    mission.over.breakup = true;                       // (every browser plays the ship breaking up before the end screen: js/breakup.js)
  }
}
// When the drive will spool up (mission time): jumpAt, plus the misaligned coils' delay while it isn't added yet.
const jumpDueAt = () => mission.jumpAt + (!mission.coilsChecked && typeof coilDelay === 'function' ? coilDelay() : 0);
// The autopilot engages the jump handle this long before the drive spools (and takes AUTO_PULL s to pull it).
const AUTO_LEAD = 3, AUTO_PULL = 1.2;
// How far the jump handle is pulled, 0..1 (what the helm's handle shows): the autopilot's pull, or the crew's.
function handlePull() {
  if (!mission.rules?.handle) return mission.autoPull == null ? 0 : clamp((mission.t - mission.autoPull) / AUTO_PULL, 0, 1);
  return mission.jump ? clamp((mission.jump.pull || 0) / JUMP_PULL, 0, 1) : 0;
}
// Somebody is aboard for the jump (every mission): in a room, an airlock chamber or a cannon seat — not outside, not
// over on a docked ship. (Down or out still counts: they're carried along.) Nobody aboard: the mission fails.
const crewAboard = () => !crew.length || crew.some(c => c.mode === 'gun' || (c.mode === 'inside' && (!!roomAt(c.x, c.y) || !(typeof inDock === 'function' && inDock(c.x, c.y)))));
// MID can power the jump: intact, with energy in it.
const midReady = () => !broken(CAPACITORS[1]) && CAPACITORS[1].charge > 0;
// Not jumping yet (the jump is due): extra encounters at ever shorter gaps (one queued at a time, on the radar
// like any other contact) and parts giving out more and more often. Runs on the simulation (server / solo).
const pressGap = (n) => Math.max(PRESS_FLOOR, PRESS_FIRST * PRESS_SHRINK ** n);
const strainGap = (n) => Math.max(STRAIN_FLOOR, STRAIN_FIRST * PRESS_SHRINK ** n);
function pressKind() {
  const own = (mission.written || []).map(e => e.kind).filter(k => PRESS_KINDS.has(k));
  const pool = [...new Set([...PRESS_BASE, ...own])];
  return pool[Math.floor(Math.random() * pool.length)];
}
function updatePressure() {
  const p = mission.press;
  if (!p) return;
  if (!mission.events.some(e => e.press && !e.done)) {   // queue the next extra encounter
    const last = mission.events.filter(e => e.press).pop();
    const t = last ? last.t + pressGap(p.n) : mission.t + PRESS_FIRST;
    const ev = makeEvent(pressKind(), t, null, MISSIONS[mission.id]?.sides);   // (chapters 1-3, 5: swarms from ahead here too)
    mission.events.push({ ...ev, id: Math.max(-1, ...mission.events.map(e => e.id)) + 1, done: false, radar: ev.radar !== false, press: true });
    p.n++;
  }
  if (mission.t >= p.strainAt) {                         // a part gives out (not the reactor → lever → MID chain the jump needs)
    const pool = SYSTEMS.filter(s => !s.broken && !s.outside && s.kind !== 'reactor' && s.kind !== 'lever' && s.ref !== CAPACITORS[1]);
    const s = pool[Math.floor(Math.random() * pool.length)];
    if (s) { breakSystem(s); combatBanner(`${s.name} gave out — jump before it all falls apart!`); }
    p.strain++; p.strainAt += strainGap(p.strain);
  }
}
// The mission's objective (beyond surviving): { done, fail (what's missing), text }.
function objectiveStatus() {
  const o = mission.objective;
  if (!o) return { done: true };
  if (o.kind === 'blackbox') return { done: objectiveAboard('blackbox'), fail: 'without the black box', text: 'Bring the black box from the derelict aboard' };
  if (o.kind === 'rescue') return { done: dk.npc?.state === 'safe', fail: `without ${npcName()}`, text: `Rescue ${npcName()}` };
  if (o.kind === 'ore') {                                // samples carried inside are stowed (dk.ore, js/dock.js stowOre); count: how many (default 1)
    const need = oreNeeded(), n = Math.min(need, (dk.ore || 0) + (objectiveAboard('ore') ? 1 : 0));
    if (need === 1) return { done: n >= 1, fail: 'without an ore sample', text: 'Drill an ore sample and bring it aboard' };
    return { done: n >= need, fail: `with only ${n}/${need} ore samples`, text: `Bring ${need} ore samples aboard (${n}/${need})` };
  }
  if (o.kind === 'navcore') {                            // (it counts once installed in our helm, dk.helmCore: carrying it aboard isn't enough; js/dock.js)
    if (dk.helmCore) return { done: true, text: 'Red Comet nav core installed in our helm' };
    if (objectiveAboard('navcore')) return { done: false, fail: 'with the nav core not installed', text: 'Install the nav core in our helm (bridge)' };
    return { done: false, fail: 'without a nav core', text: 'Get a Red Comet nav core and install it in our helm' };
  }
  if (o.kind === 'intruder') {
    const k = Math.min(o.count, mission.kills || 0), left = o.count - k;
    // until they show up (the event ran, the radar saw it, or one's aboard / dead) a cover objective: no spoiler (chapter 2)
    const seen = k > 0 || mission.events.some(e => e.kind === 'intruder' && (e.done || mission.revealed?.has(e.id))) || boarding.invaders.some(a => a.kind !== 'saboteur' && a.state !== 'dormant');
    if (o.cover && !seen) return { done: false, fail: `with ${left === 1 ? 'an intruder' : `${left} intruders`} still alive`, text: o.cover };
    if (!(o.count > 1)) return { done: k >= 1, fail: 'with the intruder still alive', text: 'Kill the intruder' };
    return { done: left <= 0, fail: `with ${left === 1 ? 'an intruder' : `${left} intruders`} still alive`, text: `Kill ${o.count === 2 ? 'both' : `all ${o.count}`} intruders (${k}/${o.count} dead)` };
  }
  if (o.kind === 'raiders') { const n = dk.ships || 0; return { done: n >= o.count, fail: `with only ${n}/${o.count} pirate ships destroyed`, text: `Destroy ${o.count} pirate ships (${n} so far)` }; }
  if (o.kind === 'pirates') return { done: dk.defeated >= o.count, fail: `with only ${dk.defeated}/${o.count} pirates defeated`, text: `Defeat ${o.count} pirates (${dk.defeated} so far)` };
  return { done: true };
}
function endMission(won, reason, survived = won) {
  // at: the sim time it ended (synced): the jump-out animation's clock (see jumpOutT)
  mission.over = { won, reason, t: mission.t, survived, results: missionResults(!!survived), at: time };
  for (const e of combat.enemies) e.stopCharge?.();
  if (survived) { sfx.jumpOut(); if (won) sfx.win(JUMP_FLASH + 0.15); } else sfx.explosion();
}

// Radar: reveals everything coming in the next RADAR_RANGE seconds, for the whole crew.
function radarScan() {
  mission.scanT = mission.t; mission.lastScan = mission.t; mission.lastScanBy = player?.id ?? null;   // (who: crew training credits the right player)
  if (!evs.antenna) { sfxFor(player, 'empty'); combatBanner('Radar: garbled echoes — the antenna outside is knocked crooked'); return; }
  if (enc.storm) { sfxFor(player, 'empty'); combatBanner('Radar: nothing but static — ion storm'); return; }
  for (const e of combat.enemies) if (e.D.stealth) e.reveal = 3;           // the ping lights up cloaked ships for a moment
  let n = 0;
  for (const ev of mission.events) if (ev.radar && !ev.done && ev.t - mission.t <= radarReach(ev) && !mission.revealed.has(ev.id)) { mission.revealed.add(ev.id); n++; }
  sfxFor(player, 'poi');                              // (only the one at the radar hears it: the banner tells everyone)
  combatBanner(n ? `Radar: ${n} contact${n > 1 ? 's' : ''} in the next ${RADAR_RANGE} s` : `Radar: nothing in the next ${RADAR_RANGE} s`);
}

// Helm diagnosis: MAINT_YELLOW s before a maintenance failure, two parts look shaky (its pair); one really
// fails, the other goes back to normal. Several failures can overlap: each pair is its own.
// The pairs warning right now (not done, not serviced, in their window): [{ ev, sys, decoy, orange, left }].
// (ev.warnFrom: an explicit start of the yellow, the tutorial's.)
function maintWarnings() {
  if (!mission.active) return [];
  return mission.events.filter(e => e.kind === 'maintenance' && e.sys && !e.done && !e.serviced && mission.t >= (e.warnFrom ?? e.t - MAINT_YELLOW))
    .sort((a, b) => a.t - b.t)
    .map(ev => ({ ev, sys: ev.sys, decoy: ev.decoy, left: ev.t - mission.t, orange: ev.t - mission.t <= MAINT_WARNING }));
}
function diagState(s) {
  if (s.broken) return { col: '#ff5a4a', text: s.kind === 'seam' ? 'BREACHED' : s.outside ? 'BROKEN — outside, fix it on a spacewalk' : 'BROKEN' };
  const ws = maintWarnings(), pair = ws.length > 1;  // (several pairs at once: each line names its partner)
  const w = ws.find(w => w.sys === s && w.orange);
  if (w) return { col: '#ff9a2e', text: `FAILING — breaks in ${Math.ceil(w.left)} s`, orange: true, ev: w.ev };
  const y = ws.find(w => w.sys === s || w.decoy === s);
  if (y) {
    const other = y.sys === s ? y.decoy : y.sys, partner = other && pair ? ` · pairs with the ${other.name.charAt(0).toLowerCase() + other.name.slice(1)}` : '';
    return { col: '#ffd84a', text: `irregular readings${partner}`, ev: y.ev, other };
  }
  return null;
}
// The repair kit can service a failing system while it's orange; then it doesn't break.
const serviceTargets = () => maintWarnings().filter(w => w.orange && !w.sys.broken).map(w => w.sys);
function serviceTarget() { return serviceTargets()[0] || null; }
// The service is done: that part's maintenance failure won't happen.
function serviceDone(s) {
  const w = maintWarnings().find(w => w.sys === s && w.orange);
  if (w) w.ev.serviced = true;
  return !!w;
}

// ---------------------------------------------------------------------------
// Fires: every fire sits on a ship part. Small hits: 24% a fire, 6% a broken part, else nothing.
// Big hits: always exactly one broken part (systems.js damageColumn) and a fire. Luck (the cat)
// makes the fire chances and the small-hit break chance 10% smaller (relative). Every FIRE_TIME (roughly) an ignored fire
// spreads to a part in the same or an adjacent room (1/3), burns out its part (1/3; half of those
// it goes out with it) or just keeps burning (1/3). Luck makes spreading and burning-out-but-
// still-burning 10% less likely.
// ---------------------------------------------------------------------------
const colOfSide = (side) => side === 'port' ? 0 : side === 'star' ? 2 : 1;
// Rooms a part belongs to (parts between the decks belong to the rooms above and below).
function sysRooms(s) {
  if (s.outside) return [];                        // outside on the hull: in no room
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
  if (!s || burning(s) || s.outside) return false;                       // (vacuum outside: nothing burns there)
  if (sysRooms(s).some(r => vacuumRoom(r.id))) return false;            // no air, no fire
  plasma = (plasma || (!!mission.rules?.plasma && plasmaPart(s))) && inPlasmaRoom(s);   // plasma fires only in the lower side rooms
  fires.push({ uid: newUid(), sys: s, x: s.x + 0.35, y: s.y + 0.45, hp: 1, t: 0, seed: Math.random() * 100, plasma, period: firePeriod(plasma) });
  hz.stats.fires++;
  if (plasma) { combatBanner(`PLASMA FIRE at the ${s.name.toLowerCase()} — vent the room!`); sfx.say?.('Plasma fire. Vent the room.'); }
  else combatBanner(`Fire at the ${s.name.toLowerCase()}! Grab a fire extinguisher.`);
  return true;
}
const HIT_FIRE = 0.24, HIT_BREAK = 0.06, LUCK_CUT = 0.9;   // small hits: fire / broken part (exclusive); luck: x0.9 on both
// A fire on one of the 3 parts on that side nearest to the hit (intact ones first).
function fireNear(side, x, y) {
  const col = colOfSide(side), free = SYSTEMS.filter(s => s.col === col && !s.outside && !burning(s));
  const near = (l) => l.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, 3);
  const intact = free.filter(s => !s.broken), pool = near(intact.length ? intact : free);
  return igniteSystem(pool[Math.floor(Math.random() * pool.length)]);
}
function smallHit(side, x, y) {
  const k = luckCut(), r = Math.random(), pFire = HIT_FIRE * k;
  if (r < pFire) fireNear(side, x, y);
  else if (r < pFire + HIT_BREAK * k) {
    const intact = SYSTEMS.filter(s => s.col === colOfSide(side) && !s.broken);
    if (intact.length) breakSystem(intact[Math.floor(Math.random() * intact.length)]);
  }
}
// Big hits: the broken parts come from damageColumn; this adds the fire.
function bigHitFire(side, x, y) {
  if (Math.random() < luckCut()) fireNear(side, x, y);
}
// Debug: start a fire on the part nearest to (x, y).
function spawnFire(x, y) {
  const s = SYSTEMS.filter(s => !burning(s) && !s.outside).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
  igniteSystem(s);
}
function updateFires(dt) {
  for (const f of [...fires]) {
    if (f.tame) continue;                          // (the tutorial's fire: never spreads, burns out or goes out on its own)
    f.t += dt;
    if (fireLeft(f) > 0) continue;
    f.t = 0; f.period = firePeriod(f.plasma);
    if (!f.plasma) {                               // 1/3 spread, 1/6 burn out the part and keep burning, 1/6 burn it out and go out, 1/3 nothing
      const r = Math.random(), k = luckCut(), pSpread = k / 3, pBurn = k / 6;
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
  const n = muzzleAt(player, a);                     // out of the hose's nozzle
  sprayDock(a, dt);
  for (let i = 0; i < 3; i++) {
    const q = a + (Math.random() - 0.5) * 0.7, sp = 5 + Math.random() * 3;
    combatFx(n.x, n.y, Math.cos(q) * sp, Math.sin(q) * sp, 0.45, Math.random() < 0.5 ? '#ffffff' : '#dfe8f0', 0.09 + Math.random() * 0.06);
    const p = combat.fx[combat.fx.length - 1]; p.z = n.z; p.foam = true;   // foam: lit, but no light of its own (js/lights.js)
  }
  for (const f of fires) {
    const d = Math.hypot(f.x - player.x, f.y - player.y), off = Math.abs(wrapAngle(Math.atan2(f.y - player.y, f.x - player.x) - a));
    if (d >= SPRAY_RANGE || off >= 0.45) continue;
    if (f.plasma) { f.hp = Math.max(0.6, f.hp - SPRAY_RATE * dt); f.t = Math.max(0, f.t - dt * 2); continue; }   // only pushes it back
    f.hp -= SPRAY_RATE * dt;
    (f.spray ||= {})[player.id] = (f.spray[player.id] || 0) + SPRAY_RATE * dt;   // who did how much (crew training: whose fire it was that went out)
  }
  if (Math.random() < dt * 6) sfx.spray();
}

// ---------------------------------------------------------------------------
// Door locks (security console) and manual override
// ---------------------------------------------------------------------------
const lockables = () => [
  ...DOORWAYS.map((d, i) => ({ ref: d, kind: 'door', name: `Door ${['left–bridge', 'bridge–right', 'left–reactor', 'reactor–right'][i]}`, x: d.x + d.w / 2, y: d.y + d.h / 2 })),
  ...DECK_DOORS.map(d => ({ ref: d, kind: 'lock', name: doorName(d), x: d.x + d.w / 2, y: d.y + d.h / 2 })),
  ...HATCHES.map(h => ({ ref: h, kind: 'hatch', name: `${h.side === 'port' ? 'Left' : 'Right'} outer airlock`, x: h.chamber.x + h.chamber.w / 2, y: h.y })),
];
// onDone: what the third bonk does (default: unlock). Doors use forceDoor (js/game.js).
function startOverride(ref, name, onDone) { ui.panel = 'override'; ui.override = { ref, name, hits: 0, swing: 0, onDone }; }
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
    combatBanner(`${o.name}: forced open`);          // (first: onDone may put up a more urgent banner, e.g. a forced outer airlock venting)
    if (o.onDone) o.onDone(); else o.ref.locked = false;
    ui.panel = null; ui.override = null;
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
    { x: 22.2, y: 6.4, r: 1.2, name: 'Radar', text: `Click: radar scan (shows what comes in the next ${RADAR_RANGE} s)`, run: radarScan },
    { x: HELM.x, y: HELM.y + 0.5, r: 0.9, name: 'Helm', text: 'Click: run systems diagnosis', run: openDiagnosis },
    { x: SECURITY.x, y: SECURITY.y + 0.5, r: 0.9, name: 'Security console', text: 'Click: open the security console (lock doors)', run: () => { ui.panel = 'security'; } },
  ];
}
function missionClickTarget(mx, my) {
  for (const svc of serviceTargets()) {
    if (Math.hypot(mx - svc.x, my - svc.y) > svc.r) continue;
    if (svc.outside) return { text: `${svc.name} is failing — service it on a spacewalk (repair kit)`, ok: false, x: svc.x, y: svc.y, r: svc.r };
    if (inv.weapon !== 'repair') return { text: `${svc.name} is failing — service it with the repair kit`, ok: false, x: svc.x, y: svc.y, r: svc.r };
    if (!near(svc.x, svc.y, REACH + svc.r * 0.6)) return { text: `${svc.name} — get closer`, ok: false, x: svc.x, y: svc.y, r: svc.r };
    return { text: `${svc.name} is failing — hold Space / right click to service it`, ok: false, x: svc.x, y: svc.y, r: svc.r };   // (repairPick, js/systems.js)
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
// Extinguisher foam (drawing only; the spray's particles are p.foam in combat.fx, the gameplay is spray()).
// Each particle is a billowy puff (FOAM_PUFF: a few overlapping soft lumps, three variants) that leaves the
// nozzle small and fast, slows, swells, churns sideways and sinks to the floor, so the jet reads as one
// dense cone of foam rather than dots. Where they come down they leave a foam blanket on the floor
// (foamDecals: a bounded ring, this browser only) that spreads a little and fades over FOAM_DECAL_LIFE s.
// Sprites: dyn/foam_0..2 (upright, lit by the scene's lights only: foam has no light of its own) and
// dyn/foam_floor (the same lumps squashed flat); ?classic: the same canvases straight on the 2D canvas.
const FOAM_DECAL_LIFE = 3.5, FOAM_DECALS_MAX = 72;
const foamDecals = [];
let foamDecalAt = 0, FOAM_PUFF = null;
const foamHash = (v) => { const s = Math.sin(v * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function foamPuffs() {
  if (FOAM_PUFF || typeof document === 'undefined' || typeof document.createElement !== 'function') return FOAM_PUFF;
  const lumps = (g, n, sy, seed) => {                // soft white lumps round the middle of a 64 x 64 * sy canvas
    for (let i = 0; i < n; i++) {
      const a = i * 2.4 + seed, d = i ? 9 + 5 * foamHash(seed + i) : 0, r = (i ? 12 + 5 * foamHash(seed * 3 + i) : 17);
      const x = 32 + Math.cos(a) * d, y = (32 + Math.sin(a) * d) * sy;
      g.save(); g.translate(x, y); g.scale(1, sy);
      const gr = g.createRadialGradient(0, -r * 0.2, 0, 0, 0, r);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.5, 'rgba(244,247,250,0.7)'); gr.addColorStop(0.8, 'rgba(225,232,240,0.25)'); gr.addColorStop(1, 'rgba(215,224,235,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.restore();
    }
  };
  const canvas = (sy, seed, n) => { const c = document.createElement('canvas'); c.width = 64; c.height = Math.ceil(64 * sy); lumps(c.getContext('2d'), n, sy, seed); return c; };
  FOAM_PUFF = { img: [canvas(1, 1, 6), canvas(1, 7, 5), canvas(1, 13, 7)], floor: canvas(GFX.SIN || 0.77, 21, 9), spr: null };
  if (GFX.on) {                                      // the same pictures as sprites (0.5 across at scale 1)
    const up = (key, c) => { const D = GFX.canvasSprite(key, c.width, c.height, { ppu: 128 }); if (!D) return null; D.ctx.drawImage(c, 0, 0); D.commit(); return D.name; };
    FOAM_PUFF.spr = { img: FOAM_PUFF.img.map((c, i) => up('foam_' + i, c)), floor: up('foam_floor', FOAM_PUFF.floor) };
    if (FOAM_PUFF.spr.img.some(n => !n) || !FOAM_PUFF.spr.floor) FOAM_PUFF.spr = null;
  }
  return FOAM_PUFF;
}
// One puff of the jet (from drawCombatFront). t: the drawing clock (for the floor blanket's fade).
function drawFoamParticle(p, t) {
  const P = foamPuffs(); if (!P) return;
  const a = clamp(1 - p.life / p.max, 0, 1), h = foamHash(p.size * 977.3 + p.max * 13.1), v = Math.floor(h * 3);
  const sp = Math.hypot(p.vx, p.vy) || 1, nx = -p.vy / sp, ny = p.vx / sp;
  const wob = 0.14 * Math.pow(a, 1.3) * Math.sin(a * 8 + h * TAU);   // churning sideways as it slows
  const x = p.x + nx * wob, y = p.y + ny * wob, z = (p.z || 0) * (1 - a * a) + 0.05 * (1 - a);   // sinking to the floor
  const r = p.size * (0.45 + 2.4 * Math.pow(a, 0.65)), al = 0.92 * Math.min(1, (1 - a) * 2.5);
  if (a > 0.72 && !p.dec && h < 0.6) {               // coming down: a dab of foam stays on the floor
    p.dec = true;
    foamDecals[foamDecalAt] = { x: p.x, y: p.y, r: r * (1.1 + 0.6 * h), t0: t, v }; foamDecalAt = (foamDecalAt + 1) % FOAM_DECALS_MAX;
  }
  if (P.spr) { GFX.sprite(P.spr.img[v], 0, x, y, z, { billboard: true, scale: r / 0.25, alpha: al, rot: h * TAU, sortY: y + 0.05, depthWrite: false }); return; }
  ctx.globalAlpha = al; const R = L(r) * 1.0;
  ctx.drawImage(P.img[v], L(x) - R, L(y - GFX.lift(z)) - R, 2 * R, 2 * R);
  ctx.globalAlpha = 1;
}
// The foam blanket on the floor (before the jet; GFX: flat on the floor, lit).
function drawFoamDecals(t) {
  const P = foamDecals.length && foamPuffs(); if (!P) return;
  for (const d of foamDecals) {
    const e = t - d.t0;
    if (!(e >= 0 && e < FOAM_DECAL_LIFE)) continue;
    const k = e / FOAM_DECAL_LIFE, r = d.r * (0.6 + 0.4 * Math.min(1, e / 0.25) + 0.25 * k), al = 0.7 * Math.pow(1 - k, 1.4) * Math.min(1, e / 0.08);
    if (P.spr) { GFX.sprite(P.spr.floor, 0, d.x, d.y, 0.01, { layer: 'decal', scale: r / 0.25, alpha: al, depthWrite: false }); continue; }
    ctx.globalAlpha = al; const R = L(r);
    ctx.drawImage(P.floor, L(d.x) - R, L(d.y) - R * P.floor.height / 64, 2 * R, 2 * R * P.floor.height / 64);
  }
  ctx.globalAlpha = 1;
}
// How much foam is landing on a fire right now (0..1): the jet's puffs near it. Drawing only.
function foamOn(f) {
  let n = 0;
  for (const p of combat.fx) if (p.foam && Math.abs(p.x - f.x) < 0.7 && Math.abs(p.y - f.y) < 0.7) n++;
  return Math.min(1, n / 5);
}
// Fire: soft particle flames. Each tongue is a soft teardrop (FLAME: a radial gradient, stretched upwards)
// born at the base, rising and narrowing as it goes, passing from the white-yellow core over orange to a
// deep red tip (plasma: white over pale blue and violet to deep indigo) as it fades: the two nearest colour
// stages crossfaded, so the colour flows. Each is a pure function of the time (own lane, phase, and a fresh
// random start every loop): nothing stored. Upright (billboard) in the tilted view, unlit (flames are light),
// depth-tested (biased towards the camera: out of the part it sits on) but not writing depth. fireLook() holds what the flames and the fire's light (js/lights.js)
// share: the flicker, the swell towards flaring up / spreading (f.t / f.period), the foam smothering it.
// Smoke: the lit fx/smoke_* puffs rising above, more as it swells; foam on it: white steam bursting off.
// ?classic: the same flames on the 2D canvas, added up ('lighter'), with soft smoke puffs.
// (The Blender flame flipbooks fx/fire_* / fx/plasma_* are no longer used.)
const FLAME_COLS = {
  fire:   [[255, 228, 140], [255, 160, 40], [240, 88, 22], [176, 34, 10]],
  plasma: [[248, 244, 255], [150, 204, 255], [176, 108, 255], [104, 44, 220]],
};
const FLAME_N = 22;                                 // tongues per fire
let FLAME = null;
function flameImgs() {
  if (FLAME || typeof document === 'undefined' || typeof document.createElement !== 'function') return FLAME;
  const mk = ([r, g, b], dark) => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 56;
    const x = c.getContext('2d'); x.translate(16, 38); x.scale(dark ? 1 : 0.8, dark ? 1 : 2.1);
    const gr = x.createRadialGradient(0, 0, 0, 0, 0, 15);
    gr.addColorStop(0, `rgba(${r},${g},${b},${dark ? 0.8 : 1})`); gr.addColorStop(0.4, `rgba(${r},${g},${b},${dark ? 0.55 : 0.75})`);
    gr.addColorStop(0.75, `rgba(${r},${g},${b},0.18)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.beginPath(); x.arc(0, 0, 15, 0, TAU); x.fill();
    return c;
  };
  FLAME = { fire: FLAME_COLS.fire.map(c => mk(c)), plasma: FLAME_COLS.plasma.map(c => mk(c)), smoke: mk([46, 44, 46], true), spr: null };
  if (GFX.on) {                                      // the same as sprites: origin = the blob's middle, 1/3 unit across at scale 1
    const up = (key, c) => { const D = GFX.canvasSprite(key, 32, 56, { ppu: 96, ox: 16, oy: 36 }); if (!D) return null; D.ctx.drawImage(c, 0, 0); D.commit(); return D.name; };
    const spr = { fire: FLAME.fire.map((c, i) => up('flame_fire_' + i, c)), plasma: FLAME.plasma.map((c, i) => up('flame_plasma_' + i, c)) };
    if (![...spr.fire, ...spr.plasma].some(n => !n)) FLAME.spr = spr;
  }
  return FLAME;
}
const fireHash = (a, b) => { const v = Math.sin(a * 91.7 + b * 47.3 + 3.1) * 43758.5453; return v - Math.floor(v); };
// What the flames and the fire's light share this frame (f: a fire, or a docked derelict's { x, y, hp }).
function fireLook(f, t) {
  const seed = f.seed != null ? f.seed : f.x * 2.3 + f.y;
  const n = typeof noise1 === 'function' ? noise1(t * 11 + seed) : 0.5 + 0.5 * Math.sin(t * 11 + seed);
  const fl = 0.72 + 0.28 * n + 0.1 * Math.sin(t * 23 + seed);          // ~0.62 .. 1.1
  const prog = f.period ? clamp(f.t / f.period, 0, 1) : 0;                // towards flaring up / spreading
  const foam = typeof foamOn === 'function' && typeof combat !== 'undefined' ? foamOn(f) : 0;
  return { seed, fl, prog, grow: 1 + 0.5 * prog * prog * prog, foam, smother: 1 - 0.5 * foam };
}
// The flames of one fire of size s at (f.x, f.y): sprites (GFX on) or the 2D canvas. False: nothing to draw with.
function drawFlames(f, s, t, look) {
  const P = flameImgs(); if (!P) return false;
  const kind = f.plasma ? 'plasma' : 'fire', S = GFX.on && P.spr ? P.spr[kind] : null, imgs = P[kind];
  const H = 1.25 * s * look.grow * look.smother * (0.72 + 0.3 * look.fl), W = 0.2 * s * (0.85 + 0.15 * look.grow), seed = look.seed;
  const put = (j, x, y, z, r, a) => {
    if (a < 0.01) return;
    if (S) { GFX.sprite(S[j], 0, x, y, z, { billboard: true, unlit: true, scale: r / 0.167, alpha: Math.min(1, a * (j ? 0.95 : 0.6)),   // (the hot stage less: bloom)
       sortY: f.y + 0.03, depthWrite: false, depthBias: 1.5 }); return; }
    const R = L(r), cx = L(x), cy = L(y) - L(z) * 0.85;
    ctx.globalAlpha = Math.min(1, a); ctx.drawImage(imgs[j], cx - R, cy - R * 36 / 16, 2 * R, 2 * R * 56 / 32);
  };
  if (!S) ctx.save();
  put(1, f.x, f.y + 0.02, 0.12 * s, 0.32 * s * look.smother, 0.55 * look.fl);          // the glowing bed at the base
  for (let i = 0; i < FLAME_N; i++) {
    const h0 = fireHash(i, seed), life = (0.5 + 0.3 * h0) * (f.plasma ? 0.8 : 1), u = t / life + h0 * 3, cyc = Math.floor(u), k = u - cyc;
    const h1 = fireHash(i + 17, cyc + seed), h2 = fireHash(i + 41, cyc - seed);
    const x = f.x + (h1 - 0.5) * 2 * W * (1 - 0.6 * k) + 0.1 * s * k * Math.sin(t * 7 + i * 2.3 + h1 * 6);
    const y = f.y + (h2 - 0.5) * 0.22 * s + 0.02, z = 0.05 + k * H * (0.5 + 0.6 * h2);
    const r = 0.22 * s * (0.75 + 0.5 * h1) * (1 - 0.7 * k) * look.smother;
    const a = Math.min(1, k * 10) * Math.pow(1 - k, 0.6) * (0.6 + 0.25 * look.fl), c = Math.min(2.999, k * 2.8), c0 = Math.floor(c), w = c - c0;
    put(c0, x, y, z, r, a); put(c0 + 1, x, y, z, r, a * w);   // (the next stage fading in over it)
  }
  if (!S) ctx.globalCompositeOperation = 'lighter';
  put(0, f.x, f.y + 0.03, 0.2 * s, 0.17 * s * look.smother, (S ? 0.3 : 0.45) * look.fl);           // the white-hot core (2D: added on)
  if (!S) ctx.restore(); else ctx.globalAlpha = 1;
  return true;
}
// Smoke rising off the top (dark, heavier as the fire swells) and, while foam lands on it, white steam bursts.
function drawFireSmoke(f, s, t, look) {
  const n = 3 + Math.round(2 * look.prog), top = 1.0 * s * look.grow * look.smother, P = flameImgs();
  for (let i = 0; i < n; i++) {
    const q = (t * 0.45 + i / n + look.seed) % 1, sx = 0.14 * Math.sin(t * 0.9 + i * 2.1) + 0.25 * q * Math.sin(look.seed + i);
    const z = top * 1.05 + q * 1.5 * s, r = (0.16 + q * 0.38) * s, a = 0.5 * (1 - q) * Math.min(1, q * 4);   // (above the flames, not over them)
    if (GFX.on && GFX.ready('fx/smoke_0')) { fxSmoke(f.x + sx, f.y + 0.02, z, r, a, i + Math.floor(look.seed), 1.5); continue; }
    if (!P) continue;
    ctx.globalAlpha = a * 0.8; const R = L(r) * 1.4;
    ctx.drawImage(P.smoke, L(f.x + sx) - R, L(f.y) - L(z) * 0.85 - R * 36 / 16, 2 * R, 2 * R * 56 / 32);
  }
  ctx.globalAlpha = 1;
  if (look.foam > 0.05) {                            // steam bursting off where the foam hits the flames
    const F = typeof foamPuffs === 'function' ? foamPuffs() : null;
    for (let i = 0; i < 5; i++) {
      const q = (t * 1.3 + i / 5 + look.seed * 0.37) % 1, x = f.x + 0.3 * s * Math.sin(i * 2.4 + t * 2) * (0.3 + q), z = 0.2 * s + q * 1.6 * s;
      const r = (0.14 + 0.4 * q) * s, a = 0.6 * look.foam * (1 - q) * Math.min(1, q * 5);
      if (F && F.spr && GFX.on) GFX.sprite(F.spr.img[i % 3], 0, x, f.y + 0.03, z, { billboard: true, scale: r / 0.25, alpha: a, rot: i + t, sortY: f.y + 0.04, depthWrite: false, depthBias: 1.5 });
      else if (F) { ctx.globalAlpha = a; const R = L(r); ctx.drawImage(F.img[i % 3], L(x) - R, L(f.y) - L(z) * 0.85 - R, 2 * R, 2 * R); }
    }
    ctx.globalAlpha = 1;
  }
}
// A fire (or a docked derelict's) in sprite mode: flames and smoke. False when GFX can't draw it.
function drawFireSprite(f, s, t, look = fireLook(f, t)) {
  if (!GFX.on || !drawFlames(f, s, t, look)) return false;
  drawFireSmoke(f, s, t, look);
  return true;
}
function drawFires(t) {
  for (const f of fires) {
    const x = L(f.x), y = L(f.y), s = (0.55 + 0.45 * f.hp) * 1.6, look = fireLook(f, t);
    if (!GFX.on) {                                   // (sprites: the fire is a real light, js/lights.js)
      const R = L(1.6) * s * (0.8 + 0.2 * look.grow);
      const g = ctx.createRadialGradient(x, y, 0, x, y, R), c = f.plasma ? '170,110,255' : '255,140,50';
      g.addColorStop(0, `rgba(${c},${0.3 * look.fl * look.smother})`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    }
    const sprited = GFX.on && drawFireSprite(f, s, t, look);
    if (!sprited && drawFlames(f, s, t, look)) drawFireSmoke(f, s, t, look);
    const ne = 4 + Math.round(6 * look.prog * look.prog);   // embers / sparks (more as it swells)
    for (let i = 0; i < ne; i++) {
      const q = (t * (0.8 + 0.35 * fireHash(i, 3)) + i / ne + f.seed) % 1, e = 1 - q;
      ctx.fillStyle = f.plasma ? `rgba(200,170,255,${e})` : `rgba(255,${170 + 60 * e | 0},90,${e})`;
      ctx.fillRect(x + Math.sin(i * 3 + f.seed + t * (1 + i * 0.1)) * L(0.4) * s * (0.5 + q), y - (sprited ? L(GFX.lift(0.4 + q * 1.8)) : q * L(1.5)) * s, 2.5, 2.5);
    }
    // time until it spreads / breaks something (in the tilted view: in front of the flames' base)
    ctx.beginPath(); ctx.arc(x, y + L(sprited ? 0.75 : 0.45), 7, -Math.PI / 2, -Math.PI / 2 + (f.t / (f.period || (f.plasma ? PLASMA_TIME : FIRE_TIME))) * TAU);
    ctx.strokeStyle = 'rgba(255,90,60,0.9)'; ctx.lineWidth = 3; ctx.stroke();
  }
}

// Vertical sliding door in a doorway (between rooms); red bar when locked, a hazard shutter with a pressure
// difference, sparks / a progress ring while pirates force it (drawDoorPry, also for the deck doors).
function drawDoorways() {
  for (const d of DOORWAYS) {
    const x = L(d.x), y = L(d.y), w = L(d.w), h = L(d.h);
    drawSealedDoor(x, y, w, h, d.open, { blast: d.blast, edge: d.locked ? '#e2574c' : C.hazard });
    if (d.locked) { ctx.beginPath(); ctx.arc(x + w / 2, y - 8, 4, 0, TAU); ctx.fillStyle = '#e2574c'; ctx.fill(); stroke(1.2); }
  }
}
// Pirates forcing a door: a ring filling up round its middle (both views; the pirates' sparks are combatFx).
function drawDoorPry() {
  for (const d of DOORS) {
    if (!(d.pry > 0)) continue;
    const [cx, cy] = doorCenter(d);
    ctx.beginPath(); ctx.arc(L(cx), L(cy), L(0.42), -Math.PI / 2, -Math.PI / 2 + Math.min(1, d.pry) * TAU);
    ctx.strokeStyle = 'rgba(20,22,27,0.6)'; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = '#ff8a3a'; ctx.lineWidth = 3.5; ctx.stroke();
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
function panelFrame(w, h, title, hint = 'E / Esc to close') {
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, VW, VH);
  const x = VW / 2 - w / 2, y = VH / 2 - h / 2;
  rr(x, y, w, h, 12); ctx.fillStyle = 'rgba(14,17,24,0.96)'; ctx.fill(); stroke(2, '#5fd6a0');
  ctx.fillStyle = '#e8ecf4'; ctx.font = '700 16px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(title, x + 18, y + 24);
  ctx.fillStyle = '#9aa3b5'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText(hint, x + w - 18, y + 24); ctx.textAlign = 'left';
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
  for (const c of crew) if (c.mode === 'inside') blip(c.x, c.y, 'rgba(90,170,255,1)', c === player);
  if (dk.npc) blip(dk.npc.x, dk.npc.y, 'rgba(90,170,255,1)', false);
  for (const a of boarding.invaders) if (a.state !== 'dormant' && a.mode !== 'cloaked') blip(a.x, a.y, 'rgba(255,70,60,1)', true);
  for (const p of dk.pirates) blip(p.x, p.y, 'rgba(255,70,60,1)', true);
  for (const [li, l] of lockables().entries()) {
    const [cx, cy] = P(l.x, l.y), hover = Math.hypot(mouse.x - cx, mouse.y - cy) < 15;
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, TAU); ctx.fillStyle = l.ref.locked ? '#7a2420' : '#1d4a36'; ctx.fill(); stroke(hover ? 3 : 1.5, l.ref.locked ? '#ff6a5a' : '#5fd6a0');
    ctx.fillStyle = '#ffffff'; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(l.ref.locked ? '🔒' : { door: 'D', lock: '↕', hatch: 'H' }[l.kind], cx, cy + 1);
    ui.hits.push({ x: cx, y: cy, r: 15, cmd: ['lock', li] });
    if (hover) { ctx.fillStyle = '#e8ecf4'; ctx.fillText(`${l.name}: ${l.ref.locked ? 'locked' : 'open'}`, cx, cy + 24); }
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9aa3b5'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('D door · ↕ deck door · H outer airlock · red: enemies · blue: crew. Locked doors stay shut (they can still be forced).', x + 18, y + h - 18);
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
  const list = [...SYSTEMS, ...HULL_SEAMS.filter(s => failPool().includes(s) || diagState(s))];   // (seams: where they can fail, or when they do)
  const w = 560, rows = list.length, h = Math.min(VH - 40, 80 + rows * 19), [x, y] = panelFrame(w, h, enc.glitch ? `HELM — AI REBOOT ORDER: ${enc.glitch.order.map(i => 'ABC'[i]).join(' → ')}` : 'HELM — ship diagnosis');
  const top = 50;
  ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'top';
  list.forEach((s, i) => {
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
  const w = 440, h = 340, [x, y] = panelFrame(w, h, `${o.name} — ${o.hits >= 3 ? 'it gives!' : 'whack the handle'}`, 'E / click: hit · Esc to close');
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
// ---------------------------------------------------------------------------
// The jump, seen and heard (looks and sound only: nothing here changes the game).
// - Wind-up: jumpCharge() 0..1 builds over the last JUMP_PRESPOOL s of the countdown (to 0.6) and while the
//   drive spools (on to 1). It drives the engine bell and plume (js/art.js engineFlame / drawEngineBell),
//   the blue lights (js/lights.js), blue crackle along the power lines and the hull (drawJumpCrackle),
//   streaking stars (jumpSpace → drawSpace), a pulsing blue screen edge (drawJumpVignette), a faint
//   rumble (jumpCamera) and a rising hum (sfx.hum, from clientUpdate).
// - The jump: when the ship jumps out (mission.over.survived), JUMP_OUT s of animation before the end
//   screen: the ship pulls back, then lurches forward and away (the camera pulls out to the whole ship),
//   the stars stretch into lines, a tunnel of light, a white flash (JUMP_FLASH), then the end screen
//   fades in from white. Its clock starts at mission.over.at (synced sim time), so every client plays it
//   at the same moment; R (back to the lobby) only works once it's done. Not on a loss.
// ---------------------------------------------------------------------------
const JUMP_PRESPOOL = 8, JUMP_FLASH = 1.6, JUMP_OUT = 2.3;
let jumpClock = null;                                // this browser's smooth clock for the jump-out (time is 30 Hz in multiplayer)
function jumpFxUpdate(dt) {                          // (clientUpdate)
  const o = mission.over;
  if (!o?.survived || o.at == null) { jumpClock = null; return; }
  if (!jumpClock || jumpClock.at !== o.at) jumpClock = { at: o.at, t: Math.max(0, time - o.at) };
  else jumpClock.t = Math.max(jumpClock.t + dt, time - o.at - 0.15);
}
// Seconds since the ship jumped out (Infinity: it didn't, or long ago).
function jumpOutT() {
  const o = mission.over;
  if (!o?.survived || o.at == null) return Infinity;
  return jumpClock && jumpClock.at === o.at ? jumpClock.t : Math.max(0, time - o.at);
}
// The end screen (results) shows: the mission is over and the jump animation (if any) has played.
const endScreenReady = () => !!mission.over && jumpOutT() >= JUMP_OUT && !(typeof breakupT === 'function' && breakupT() < BREAKUP_T);   // (and the break-up, js/breakup.js)
// The stalled jump (due, but MID is empty or broken): null, or { phase: 'charge' | 'sputter' | 'dead', p: 0..1
// through that phase, k: the charge it shows, n: the attempt }. The loop runs on mission.jump.st (synced), so
// every browser sees the same attempt; it charges to STALL_PEAK, sputters out, lies dead, and tries again.
function jumpStall() {
  const j = mission.jump;
  if (!mission.active || mission.over || !j || midReady()) return null;
  const st = j.st || 0, n = Math.floor(st / STALL_CYCLE), u = st - n * STALL_CYCLE, base = n ? 0.4 : 0.6;
  if (u < STALL_RISE) { const p = u / STALL_RISE; return { phase: 'charge', p, n, k: base + (STALL_PEAK - base) * p * (2 - p) }; }
  if (u < STALL_RISE + STALL_SPUTTER) { const p = (u - STALL_RISE) / STALL_SPUTTER; return { phase: 'sputter', p, n, k: STALL_PEAK - (STALL_PEAK - 0.15) * Math.sqrt(p) }; }
  const p = (u - STALL_RISE - STALL_SPUTTER) / (STALL_CYCLE - STALL_RISE - STALL_SPUTTER);
  return { phase: 'dead', p, n, k: 0.15 + 0.25 * p * p };
}
// Sputtering: the charge coughs (drops out for a frame or two at random, the same in every browser).
function stallCough() {
  const s = jumpStall();
  if (s?.phase !== 'sputter') return 1;
  const r = Math.sin(Math.floor(time * 16) * 127.1 + 3.7) * 43758.5453, h = r - Math.floor(r);
  return h < 0.35 ? 0.15 : h < 0.6 ? 0.55 : 1;
}
function jumpCharge() {
  if (!mission.active) return 0;
  if (mission.over) return jumpOutT() < JUMP_OUT ? 1 : 0;
  if (mission.jump) {
    const s = jumpStall();
    if (s) return s.k * stallCough();
    return 0.6 + 0.35 * clamp(mission.jump.t / 6, 0, 1);    // (energy there, waiting for the handle)
  }
  if (!isFinite(mission.jumpAt)) return 0;
  const at = jumpDueAt();
  return 0.6 * Math.pow(clamp(1 - (at - mission.t) / JUMP_PRESPOOL, 0, 1), 1.5);
}
// The starfield: { streak: px (the nearest stars), drift: extra px travelled }.
function jumpSpace() {
  const u = jumpOutT();
  if (u < JUMP_FLASH) { const s = Math.max(0, u - 0.35); return { streak: 30 + 2600 * s * s, drift: 2400 * s * s * s }; }
  const k = jumpCharge();
  return { streak: k > 0 ? 3 + 30 * k * k : 0, drift: 0 };
}
// Camera offset in tiles: a rumble while charging; jumping: the ship pulls back, then is thrown forward (up the screen) and away.
function jumpCamera(t) {
  const u = jumpOutT(), k = jumpCharge();
  const sh = u < JUMP_FLASH ? 0.12 * (1 - u / JUMP_FLASH) + 0.05 : k > 0.5 ? 0.03 * (k - 0.5) / 0.5 : 0;
  let y = 0;
  if (u < 0.45) y = -0.7 * Math.sin(u / 0.45 * Math.PI / 2);
  else if (isFinite(u)) y = -0.7 + 16 * Math.pow(u - 0.45, 2.2);
  if (u >= JUMP_FLASH && isFinite(u)) y = 400;          // gone: only the new stars behind the results
  return { x: sh * Math.sin(t * 73), y: y + sh * Math.cos(t * 59) };   // (+y: the camera moves on, so the ship moves up the screen)
}
// Blue energy crackling along the power lines and the hull (world transform; the unlit glow layer with sprites).
function drawJumpCrackle(t) {
  const k = jumpCharge();
  if (k < 0.05 || jumpOutT() >= JUMP_FLASH && mission.over) return;
  const sputter = jumpStall()?.phase === 'sputter';
  const r = rng(Math.floor(t * 15) * 7 + 3), arcs = Math.round(2 + 24 * k), a = 0.45 + 0.55 * k;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 0; i < arcs; i++) {
    const pts = [];
    const where = r();
    if (where < 0.4 && typeof POWER_LINES !== 'undefined') {           // along a power line
      const l = POWER_LINES[Math.floor(r() * POWER_LINES.length)], u0 = r(), du = (1.2 + 2 * r()) / Math.max(1, l.len);
      for (let j = 0; j <= 6; j++) pts.push(linePoint(l, u0 + du * j / 6));
    } else {                                                            // along the hull, or a room's walls (inside)
      const room = where < 0.75 && ROOM_RECTS[Math.floor(r() * ROOM_RECTS.length)];
      const poly = room ? [[room.x, room.y], [room.x + room.w, room.y], [room.x + room.w, room.y + room.h], [room.x, room.y + room.h]] : HULL;
      const i0 = Math.floor(r() * poly.length), p = poly[i0], q = poly[(i0 + 1) % poly.length], el = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      const len = Math.min(el, 1.5 + 2 * r()), s0 = r() * (el - len);
      for (let j = 0; j <= 6; j++) { const s = (s0 + len * j / 6) / el; pts.push([lerp(p[0], q[0], s), lerp(p[1], q[1], s)]); }
    }
    for (let j = 1; j < pts.length - 1; j++) { pts[j][0] += (r() - 0.5) * 0.45; pts[j][1] += (r() - 0.5) * 0.45; }
    const path = () => { ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x * T, y * T) : ctx.moveTo(x * T, y * T))); };
    const hot = sputter && r() < 0.6;                                   // sputtering: the arcs die red
    path(); ctx.strokeStyle = hot ? `rgba(255,70,40,${0.3 * a})` : `rgba(80,160,255,${0.3 * a})`; ctx.lineWidth = 7; ctx.stroke();
    ctx.strokeStyle = hot ? `rgba(255,140,100,${0.7 * a})` : `rgba(150,215,255,${0.7 * a})`; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = hot ? `rgba(255,225,200,${a})` : `rgba(240,250,255,${a})`; ctx.lineWidth = 1.2; ctx.stroke();
  }
  drawCoilEnergy(t, k);                                  // the jump coils on the hull come alive
  ctx.restore();
}
// The jump coils while the drive charges (glow layer, world px): aligned ones glow blue with energy rings
// running out of them (faster and bigger with the charge) and, near full charge, beams to the engine bell;
// a misaligned one flickers red and spits sparks. At the jump itself they flare (coilFx(c).flare): a white-blue
// burst and a beam each to the engine. Looks only.
function drawCoilEnergy(t, k) {
  const coils = typeof evs !== 'undefined' && evs.coils?.length ? evs.coils : (typeof COIL_SPOTS !== 'undefined' ? COIL_SPOTS.map(c => ({ ...c, ok: true })) : []);
  const ex = ENGINE.x * T, ey = (ENGINE.y + 1.4) * T;
  for (const c of coils) {
    const fx = typeof coilFx === 'function' ? coilFx(c) : { k, sputter: false, flare: 0 }, cx = c.x * T, cy = c.y * T;
    if (fx.sputter) {                                   // misaligned: a red, coughing glow and stray sparks
      const f = Math.sin(t * 31 + c.x) > 0.2 ? 1 : 0.35, rr0 = T * (0.45 + 0.25 * k);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr0);
      g.addColorStop(0, `rgba(255,200,170,${0.7 * k * f})`); g.addColorStop(0.4, `rgba(255,70,40,${0.45 * k * f})`); g.addColorStop(1, 'rgba(255,40,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rr0, 0, TAU); ctx.fill();
      const r = rng(Math.floor(t * 12) * 13 + Math.round(c.x));
      ctx.strokeStyle = `rgba(255,190,120,${0.8 * k})`; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const a = r() * TAU, d0 = T * 0.2, d1 = T * (0.4 + 0.4 * r()); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * d0, cy + Math.sin(a) * d0); ctx.lineTo(cx + Math.cos(a + 0.3) * d1, cy + Math.sin(a + 0.3) * d1); ctx.stroke(); }
      continue;
    }
    const rr0 = T * (0.5 + 0.5 * k) * (1 + 0.2 * Math.sin(t * (6 + 18 * k))), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr0);
    g.addColorStop(0, `rgba(230,245,255,${0.8 * k})`); g.addColorStop(0.35, `rgba(110,190,255,${0.5 * k})`); g.addColorStop(1, 'rgba(80,150,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rr0, 0, TAU); ctx.fill();
    for (let i = 0; i < 3; i++) {                       // energy rings running out of the coil
      const q = (t * (0.6 + 2.4 * k) + i / 3) % 1, r = T * (0.3 + (0.7 + 0.8 * k) * q);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.strokeStyle = `rgba(150,215,255,${0.7 * k * (1 - q)})`; ctx.lineWidth = 1 + 2.5 * k * (1 - q); ctx.stroke();
    }
    const beam = Math.max(fx.flare, k > 0.8 ? (k - 0.8) / 0.2 * 0.5 * (0.6 + 0.4 * Math.sin(t * 40 + c.y)) : 0);
    if (beam > 0.02) {                                  // near full charge (and at the flare): a beam to the engine bell
      const r = rng(Math.floor(t * 20) + Math.round(c.x * 3)), pts = [];
      for (let j = 0; j <= 8; j++) { const s = j / 8, w = j && j < 8 ? (r() - 0.5) * T * 0.5 : 0; pts.push([lerp(cx, ex, s) + w, lerp(cy, ey, s) + w]); }
      ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.strokeStyle = `rgba(110,190,255,${0.35 * beam})`; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = `rgba(235,248,255,${0.9 * beam})`; ctx.lineWidth = 2; ctx.stroke();
    }
    if (fx.flare > 0) {                                 // the jump: the coil bursts
      const R = T * (0.8 + 2.6 * (1 - fx.flare)), fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      fg.addColorStop(0, `rgba(255,255,255,${fx.flare})`); fg.addColorStop(0.3, `rgba(170,225,255,${0.8 * fx.flare})`); fg.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    }
  }
}
// World: while the jump is stalled, a pulsing red ring and NO ENERGY over the middle capacitor (where the energy has to go).
function drawJumpStallMark(view, t) {
  const st = jumpStall();
  if (!st) return;
  const c = CAPACITORS[1], fail = st.phase === 'sputter', q = 0.5 + 0.5 * Math.sin(t * (fail ? 22 : 6)), r = 0.95 + 0.25 * q;
  ctx.save();
  ctx.beginPath(); ctx.arc(c.x * T, c.y * T, r * T, 0, TAU); ctx.strokeStyle = `rgba(255,70,50,${0.5 + 0.45 * q})`; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); ctx.arc(c.x * T, c.y * T, (r + 0.35) * T, 0, TAU); ctx.strokeStyle = `rgba(255,90,70,${0.25 * q})`; ctx.lineWidth = 3; ctx.stroke();
  upright(view, c.x, c.y, 1.6 + 0.15 * q, () => {
    const text = broken(c) ? 'BROKEN — FIX ME' : 'NO ENERGY';
    ctx.font = `900 ${T * 0.34}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const w = ctx.measureText(text).width + T * 0.4;
    rr(-w / 2, -T * 0.46, w, T * 0.48, 6); ctx.fillStyle = `rgba(40,6,6,${0.75 + 0.2 * q})`; ctx.fill(); stroke(2, fail && q > 0.5 ? '#ffd0c8' : '#ff5a4a');
    ctx.fillStyle = fail && q > 0.5 ? '#ffffff' : '#ff6a5a'; ctx.fillText(text, 0, -T * 0.05);
  });
  ctx.restore();
}
// Screen space: a blue glow pulsing at the screen's edges while the drive charges (the middle stays clear).
function drawJumpVignette(t) {
  const k = jumpCharge(), st = jumpStall();
  if (st && st.phase !== 'charge') {                  // the attempt failed: a red flicker at the edges and NO ENERGY
    const f = st.phase === 'sputter' ? (stallCough() < 1 ? 1 : 0.55) : 0.35 * (1 - st.p), R = Math.hypot(VW, VH) / 2;
    screenGradient(VW / 2, VH / 2, R * 0.6, R, [[0, [255, 40, 30], 0], [1, [255, 50, 35], 0.5 * f]]);
    if (st.phase === 'sputter' || Math.sin(t * 18) > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, 0.4 + f); ctx.font = '900 26px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(20,6,6,0.9)'; ctx.strokeText('JUMP DRIVE: NO ENERGY', VW / 2, VH - 96);
      ctx.fillStyle = '#ff5a4a'; ctx.fillText('JUMP DRIVE: NO ENERGY', VW / 2, VH - 96); ctx.restore();
    }
  }
  if (k < 0.05 || mission.over) return;
  const w = 0.75 + 0.25 * Math.sin(t * (4 + 14 * k)), R = Math.hypot(VW, VH) / 2;
  screenGradient(VW / 2, VH / 2, R * 0.55, R, [[0, [60, 140, 255], 0], [1, [70, 150, 255], 0.45 * k * w]]);   // (art.js: in GL with the sprites)
}
// Screen space, the jump itself (u: seconds since it started, < JUMP_FLASH): the edge glow flares, a tunnel
// of light streaks out of the middle, a white bloom swells into a full flash.
function drawJumpOut(u) {
  const p = clamp(u / JUMP_FLASH, 0, 1), cx = VW / 2, cy = VH / 2, R = Math.hypot(VW, VH) / 2;
  screenGradient(cx, cy, R * (0.5 - 0.3 * p), R, [[0, [60, 140, 255], 0], [1, [90, 170, 255], 0.4 + 0.4 * p]]);
  const q = clamp((p - 0.3) / 0.7, 0, 1);
  if (q > 0) {                                        // the tunnel
    screenTint([4, 8, 22], 0.55 * q);
    const r = rng(7); ctx.lineCap = 'round';
    for (let i = 0; i < 180; i++) {
      const a = r() * TAU, sp = 0.4 + r(), d0 = R * (((r() + u * sp * 1.6) % 1) * 1.1), len = 30 + R * 1.2 * q * q * sp;
      const d1 = Math.max(4, d0 - len * 0.2), hue = r();
      ctx.strokeStyle = `rgba(${170 + hue * 85 | 0},${210 + hue * 45 | 0},255,${(0.35 + 0.6 * r()) * q})`; ctx.lineWidth = 1 + 2.5 * r() * q;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * d1, cy + Math.sin(a) * d1); ctx.lineTo(cx + Math.cos(a) * (d0 + len), cy + Math.sin(a) * (d0 + len)); ctx.stroke();
    }
  }
  const b = clamp((p - 0.55) / 0.45, 0, 1);
  if (b > 0) {                                        // the bloom, then everything white
    const rb = R * (0.05 + 1.4 * b * b), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rb);
    g.addColorStop(0, `rgba(255,255,255,${Math.min(1, 0.6 + b)})`); g.addColorStop(0.4, `rgba(200,230,255,${0.8 * b})`); g.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - rb, cy - rb, 2 * rb, 2 * rb);   // (transparent beyond rb)
    if (b > 0.75) { ctx.fillStyle = `rgba(255,255,255,${(b - 0.75) * 4})`; ctx.fillRect(0, 0, VW, VH); }
  }
}
function drawEndScreen() {
  const o = mission.over;
  const u = jumpOutT();                                  // jumped out: the jump itself first (JUMP_OUT s)
  if (u < JUMP_FLASH) { drawJumpOut(u); return; }
  const bu = typeof breakupT === 'function' ? breakupT() : Infinity;   // broken up: the ship breaking apart first (js/breakup.js)
  if (bu < BREAKUP_SHOW) { drawBreakupScreen(bu); return; }
  ctx.fillStyle = o.won ? 'rgba(10,30,20,0.75)' : 'rgba(40,8,8,0.78)'; ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = o.won ? '#7af0b0' : '#ff7a6a'; ctx.font = '800 48px system-ui, sans-serif';
  ctx.fillText(o.won ? 'JUMP SUCCESSFUL' : o.survived ? 'JUMPED — OBJECTIVE FAILED' : 'MISSION FAILED', VW / 2, VH / 2 - 40);
  ctx.fillStyle = '#e8ecf4'; ctx.font = '18px system-ui, sans-serif'; ctx.fillText(o.reason, VW / 2, VH / 2 + 10);
  ctx.fillStyle = '#9aa3b5'; ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(`Time ${fmt(o.t)} · hits taken: ${combat.hits.small} small, ${combat.hits.large} large, ${combat.hits.crew} crew · any key or click: back to the lobby`, VW / 2, VH / 2 + 46);
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
  if (u < JUMP_OUT) { ctx.fillStyle = `rgba(255,255,255,${1 - (u - JUMP_FLASH) / (JUMP_OUT - JUMP_FLASH)})`; ctx.fillRect(0, 0, VW, VH); }   // fading in from the flash
  if (bu < BREAKUP_T) drawBreakupFade(bu);               // (out of the reactor's flash)
}
// Click handling for panels (screen coords). Returns true if the click was used.
function panelClick(mx, my) {
  for (const h of ui.hits) {
    const inside = h.w ? Math.abs(mx - h.x) < h.w / 2 && Math.abs(my - h.y) < h.h / 2 : Math.hypot(mx - h.x, my - h.y) < h.r;
    if (inside) { sendCommand(h.cmd); return true; }
  }
  return false;
}
