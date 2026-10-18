// Balance model: is a mission doable for n players, and how hard is it?
//
//   node tools/balance.js                      every skirmish + campaign mission, 1-4 and 8 players
//   node tools/balance.js intro c3             just these missions
//   node tools/balance.js --hit 0.5 --runs 20  other hit rate / more random builds per mission
//   node tools/balance.js --ship caps,cannons  with ship upgrades (ids from SHIP_UPGRADES)
//   node tools/balance.js --kit none           without the expected kit (gear and ship upgrades a first-time campaign
//                                              run can afford by then, see expectedKit(); the default) — the old model
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
  HIT_RATE: 0.5,          // accuracy: the share of cannon shots that hit the weak spot you aimed at (--hit); 0.5 = half the
                          // shots hit, 1 / 0.5 = 2 shots per weak spot (plus misses on the hull wearing it, HULL_SHARE)
  HULL_SHARE: 0.5,        // of the misses, the share that still hits the enemy hull (D.wear hull hits break a weak spot)
  AIM_TIME: 1.2,          // s per cannon shot at a swaying target (the cannon itself allows one per CANNON_COOLDOWN)
  RELOAD_SPEED: 1,        // cannon reloads take RELOAD_TIME (3 s, by R only) / this; 1.5 = a weapons specialist on every cannon
  CLIMB: 1.0,             // s to climb into a cannon and get the aim on target
  REACT: 4,               // s from an event nobody saw coming to someone heading off (sidebar, ???? plate, shouting);
                          // an event the radar has shown (scan within RADAR_RANGE before it): they set off early and are there when it starts
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
  CREW_HIT_COST: 8,       // crew-seconds lost per hit on the crew (slowed while hurt, patching up when down) …
  HIT_SLOW: 4,            // … of which this is being slowed while hurt (the rest: patching up), …
  HIT_DOWN: 0.4,          // … and this the share of hits that put you down (SELF_TREAT 10 s to get up: 4 + 0.4 × 10 = 8);
                          // in a crew half the downs are treated by a crewmate instead (TREAT_TIME + TREAT_WALK). The kit
                          // (first aid course, stim pack) scales CREW_HIT_COST by the ratio of these
  TREAT_WALK: 4,          // s for a crewmate to come over and treat someone who's down
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
  MINES: 3,               // limpet mines per drone (always 3 since 2026-10-17; was a random 1-3, modelled as 2)
  LEECH_LATCH: 12,        // s until the whole leech swarm has latched on (then they're pried off outside)
  BOARD_WALK: 24,         // units from our outer airlock to the far end of a docked ship (and back)
  DERELICT_EXTRA: 20,     // s inside a derelict: the jammed door, its fire, finding the box / the engineer
  S7_GRABS: 2,            // S-7 (the derelict's growth, js/culture.js): tendril grabs on the way in, before the cold (black box) …
  S7_GRABS_RESCUE: 3,     // … and when fighting through to the engineer without the freezer
  S7_FREE: 3,             // s per grab to get free (a shot, a spray, or wriggling) and step past
  S7_GRAB_HITS: 0.3,      // hits on the crew per grab (squeezed before they're free)
  CAPT_REACH: 70,         // Captain Red Comet (chapter 5's base, js/captain.js): s from docking until the crew walks into his quarters (guards,
                          // the terminal, the sentry, the code) …
  CAPT_BEHIND: 1.2,       // … s of each catch-breath window spent walking round behind him (the rest: shots at the generator) …
  CAPT_SPIN_HITS: 0.3,    // … generator hits per player as it sweeps past in a spin …
  CAPT_DAZE_SHARE: 0.5,   // … share of his dashes that end in a wall or cover (dazed: double damage from any side), the rest end in a spin …
  CAPT_CYCLE_HITS: 0.25,  // … hits on the crew per cycle per player fighting him (buckshot, the spin's bolts, the dash, the fire trail) …
  CAPT_FIGHTERS: 3,       // … at most this many fight him at once (more get in each other's way, or mind the door pirates and Dr. Varga) …
  CAPT_HIT: 0.8,          // … hand-laser hits on his generator (a big target, standing still while he pants) …
  CAPT_SHOT: 0.95,        // … s per shot at it (LASER_COOLDOWN, nothing to dodge in the window)
  S7_PATCH: 8,            // s at junction J1: open it, the patch-board mini-game
  S7_TO_CORE: 8,          // s from switching the freezer on to standing at the core (then waiting for its cold)
  S7_CREEP_WORK: 6,       // s at our airlock spraying S-7's creep back (plus clearing the wrap if it got there)
  S7_CREEP_SHARE: 0.5,    // share of runs where the creep reaches our airlock before the cold kills it (black box: the core freezes)
  BOX_SLOW: 0.7,          // walking speed carrying the black box
  GRAB: 2,                // s to line up on something floating outside and grab it (an ore sample, a nav core)
  NAV_BOARD_HITS: 0.3,    // hits on the crew boarding a docked raider for its nav core (the pirates shoot as usual)
  PANIC_OPEN: 1.5,        // broken parts' worth of problems open at which the crew fixes things before taking on new threats
  JUMP_PREP: 40,          // s before the jump someone pins the lever on MID if the middle capacitor is empty …
  JUMP_PREP_ENERGIES: 2,  // … or this many reactor intervals before it, if that's longer (a slow reactor needs more notice)
  REFUEL: 6,              // s to fetch a fuel cell from the crate and load it, on top of the walk (the inserter upgrade does it itself)
  RADAR_EVERY: 2,         // after a scan that shows nothing, the next one comes RADAR_RANGE × this later (1: nothing on radar ever comes
                          // unannounced, but in quiet stretches that alone keeps one crew member ~27% busy; 2: ~14%, with some surprises)
  RADAR_WORK: 9,          // s per scan at the map table: open it, ping front, turn the dish, ping left, turn, ping right (PING_CD 2 s each), read the echoes
  DIAG_WORK: 6,           // s at the helm for the diagnosis (oscilloscope: match two dials), once per maintenance failure (when its pair turns yellow)
  LEVER_TURN: 1,          // s at the power lever to step it round to the side you want (up to two taps of E), each time it's re-routed;
                          // plus holding E LEVER_E_HOLD (0.5 s) to wedge the wrench in or pull it out, plus the walk there
  SHIELD_GRACE: 1,        // s a shield press may come late (the heavy shot is heard charging) before the shot lands
  ENERGY_DT: 0.1,         // s per tick of the game's energy code in the energy runs
  TARGET_IDLE: 0.56,      // --calibrate: the share of crew time the event counts aim to leave free, solo, on the first mission …
                          // (was 0.70: playtest 2026-10-14, chapter 1 solo felt right at the model's 51%, chapters 3 / 5 at 63% too easy)
  TARGET_IDLE_CREW: 0.68, // … and for 2-8 players (--target sets both)
  TARGET_RAMP: 0.005,     // … minus this per step in PROGRESSION (a difficulty ramp: c8 solo aims at 52%);
                          // a mission can set its own: MISSIONS[id].balance = { soloIdle, crewIdle } (no ramp then)
  // the expected kit (expectedKit): what a first-time campaign run can afford by each chapter
  BOUNTY_PIRATES: 2,      // pirates paid for in a mission with a bounty (rewards.perPirate): modest, the two raiders' worth
  GEAR_ORDER: ['boots', 'firstAid', 'thrusters', 'stim'],   // bought in this order, each as soon as the money allows (general
                          // gear only: the armor vest is weapons-specialist gear since 2026-10-16, and the model ignores professions)
  SHIP_ORDER: ['cannons', 'inserter', 'caps', 'spareCell', 'airlocks', 'shields', 'radar', 'hull', 'sprinklers', 'coffee'],   // (reputation; the
                          // prerequisites first, so a later chapter's needs aren't blocked by something bought before them)
  FUEL_MARGIN: 1,         // --calibrate: fuel cells on top of what the energy runs need
  AMPLE_CELLS: 30,        // --calibrate: 'plenty of fuel' while choosing the event count
  SPEC_IDLE_SLACK: 0.07,  // --calibrate: how far from the idle target a neighbouring event count may be to get the energy in spec
  SPEC_WAIT: 2,
  SPEC_FINALE: 5,         // s before the jump: a wait that starts this late is the finale's, it doesn't count
  REACTOR_STEPS: [0.85, 0.7],          // --calibrate: faster reactors tried (× ENERGY_TIME) before prerequisites …
  REACTOR_STEPS_EARLY: [0.85, 0.7, 0.6, 0.5, 0.4, 0.3],   // … and for the early missions, which have to be in spec on the base ship           // s a cannon may wait for its next energy and still count as in spec
  CAL_RUNS: 8,            // --calibrate: random builds per mission and crew size while searching (= RUNS: what the summary rates)
  OPTIONAL_IDLE: 0.6,     // optional jobs (fuel canister) are only done when the crew is below this load
  // verdicts and score
  TIGHT_LOAD: 0.8, MAX_LOAD: 1.15,           // crew-seconds needed / available
  TIGHT_OPEN: 2,                              // problems open at once (MAX_DAMAGE + 1 broken loses the ship)
  TIGHT_WAIT: 15,                             // s of fights waiting for energy, summed
  BEST_WAIT: 3,                               // s of waiting allowed with perfect routing (an energy takes 0.9 s down the line)
  SCORE: { load: 45, open: 30, energy: 15, late: 10 },   // difficulty score weights (out of 100)
  RUNS: 8,                // random builds per mission and crew size (shuffled timelines, random sides)
  SEED: 12345,
};
const PLAYERS = [1, 2, 3, 4, 8];
const SKIRMISH_ORDER = ['intro', 'rush', 'ore', 'pirates', 'salvage', 'rescue', 'deep', 'nightmare'];
// The progression for the idle targets: chapter n is step n; intro (unlocked from the start, "Start here") is
// step 0; rush (unlocked from the start too, but "more trouble") sits with chapter 2; every other skirmish
// sits with the chapter that comes up when it unlocks (ore / salvage after chapter 3 → step 4, pirate cove
// after 4 → 5, rescue after 5 → 6, deep drift after 6 → 7, nightmare after 7 → 8). See unlockedMissions().
const PROGRESSION = { intro: 0, c1: 1, c2: 2, rush: 2, c3: 3, ore: 4, salvage: 4, c4: 4, pirates: 5, c5: 5, rescue: 6, c6: 6, deep: 7, c7: 7, nightmare: 8, c8: 8 };
// A mission's own target (MISSIONS[id].balance: { soloIdle, crewIdle }) wins: chapters 6-8 solo 37% (the user: 33-40% is
// right solo), challenge missions lower (Nightmare solo 25%).
const targetIdle = (id, n) => {
  const B = game().MISSIONS[id]?.balance || {}, own = n > 1 ? B.crewIdle : B.soloIdle;
  return own ?? (n > 1 ? A.TARGET_IDLE_CREW : A.TARGET_IDLE) - A.TARGET_RAMP * (PROGRESSION[id] ?? 0);
};

// ===========================================================================
// The game: constants and a seeded random (so results repeat)
// ===========================================================================
const NAMES = ['MISSIONS', 'EVENT_SIDES', 'CAMPAIGN', 'SKIRMISH', 'startMission', 'crew', 'makeCrew', 'mission', 'power', 'CAPACITORS', 'CAP_MAX', 'SHOTS_PER_ENERGY',
  'ENERGY_TIME', 'CELL_ENERGY', 'RELOAD_TIME', 'REPAIR_TIME', 'MAX_DAMAGE', 'JUMP_DELAY', 'PRESS_FIRST', 'ENEMY_TYPES', 'HEAVY_PERIOD', 'HEAVY_CHARGE',
  'SHIELD_PERIOD', 'SHIELD_ON', 'SWARM_SIZE', 'SWARM_INTERVAL', 'DOCK_TIME', 'PIRATE_HP', 'ALIEN_HP', 'SAB_HP', 'SAB_SNEAK', 'SAB_FADE',
  'SAB_WORK_SOLO', 'SAB_WORK_TEAM', 'MAINT_WARNING', 'MAINT_YELLOW', 'MINE_TIME', 'PRY_TIME', 'PRY_BARE', 'SCRAPE_TIME', 'CLEAR_TIME', 'ALIGN_TIME', 'COIL_DELAY',
  'BARNACLE_GROW', 'BARNACLE_DRAIN', 'FLARE_WARN', 'FLARE_TIME', 'STORM_TIME', 'STORM_ARC', 'COOLANT_RISE', 'COOLANT_FIX', 'SCRAM_TIME',
  'HEAL_TIME', 'TENTACLE_COIL', 'ACID_TIME', 'LEECH_CHEW', 'PUFF_EVERY', 'SAC_OPEN', 'MOTHER_TOSSES', 'LEV_TIME', 'LEV_STEP', 'TREAT_TIME',
  'DRILL_TIME', 'NPC_SPEED', 'WALK_SPEED', 'EVA_SPEED', 'HATCH_TIME', 'HULL_SPOTS', 'JAM_SPOTS', 'ANTENNA', 'COIL_SPOTS', 'HATCHES', 'JUMP_PULL',
  'JUMP_PULL_TWO', 'VENT_TIME', 'SPLICE_TIME', 'GRAV_TIME', 'applyShipUpgrades', 'reactorSpeed', 'simTick', 'runEvent', 'makeEvent',
  'combat', 'SYSTEMS', 'me', 'boarding', 'roomAt', 'enc', 'evs', 'dk', 'hz', 'shuffledTimeline', 'evAt', 'randSide', 'paceFactor', 'RADAR_RANGE', 'PING_CD', 'SHIP_UPGRADES', 'OVERCHARGE_FIRE', 'MISSION_LENGTH', 'LEVER_E_HOLD', 'STEALTH_RADAR',
  'S7_FREEZE', 'S7_DRAW', 'S7_FREEZER_HOLD', 'S7_CREEP_TIME', 'S7_WRAP_SPRAY', 'NAVCORE_LIFE', 'NAVCORE_PULL', 'ROCK_REACH', 'ROCK_SPEED', 'ROCK_FROM', 'ROCK_Y', 'ROCK_R', 'GEAR', 'SKIRMISH_TWIN', 'SELF_TREAT', 'TREAT_TIME', 'FIRE_TIME', 'TIDE_WARN', 'TIDE_TIME', 'TIDE_EVERY',
  'LEVB_FIN_HP', 'LEVB_ZONE_HP', 'LEVB_GAS_WARN', 'LEVB_GAS', 'LEVB_WINDOW', 'LEVB_FLICK', 'LEVB_WAVE', 'LEVB_NEED', 'LEVB_OVERRIDE',
  'captMaxHp', 'CAPT_TEL', 'CAPT_RECOVER', 'CAPT_PLANT', 'CAPT_SPIN_TURNS', 'CAPT_SPIN_W', 'CAPT_BREATH', 'CAPT_DASH_TEL', 'CAPT_DAZE', 'CAPT_TRANSITION', 'CAPT_WHISTLE', 'CAPT_TRICKLE', 'CAPT_RAID_DELAY', 'podHatchAt'];
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
// (with the kit's gravity boots / faster airlock pumps measured that way: KIT, set by runOne)
const tripCache = new Map();
function T(from, to) {                            // seconds from one place to another (airlocks blended by CYCLE)
  if (from === to) return 0;
  const opts = { boots: !!KIT?.boots, airlocks: !!KIT?.airlocks }, k = from + '→' + to + (opts.boots ? '|boots' : '') + (opts.airlocks ? '|airlocks' : '');
  if (!tripCache.has(k)) {
    const r = travel(from, to, opts), b = r.best.at ?? r.best.enter ?? 15, w = r.worst.at ?? r.worst.enter ?? b + 3;
    tripCache.set(k, b + (w - b) * A.CYCLE);
  }
  return tripCache.get(k);
}
const H = (to) => A.HOME.reduce((s, h) => s + T(h, to), 0) / A.HOME.length;   // from where a free crew member waits
const L = (side) => (side === 'port' ? 'Left' : 'Right');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const gunOf = (side) => (side === 'front' ? 'Front cannon' : `${L(side)} cannon`);
const lockRoom = (side) => (side === 'port' ? 'portLock' : 'starLock');
// A spacewalk: to the outer airlock, out, along the hull to (x, y), the job, and back in.
function evaTrip(side, pts) {
  const g = game(), h = g.HATCHES.find(h => h.side === side) || g.HATCHES[0];
  let d = 0, [x, y] = h.outside;
  for (const [px, py] of pts) { d += Math.hypot(px - x, py - y); [x, y] = [px, py]; }
  d += Math.hypot(h.outside[0] - x, h.outside[1] - y);
  return { legs: H(`${L(h.side)} outer airlock`), extra: 2 * g.HATCH_TIME + d * A.EVA_DETOUR / (g.EVA_SPEED * evaMul()) };
}
const nearSide = (x) => (x < 22.2 ? 'port' : 'star');

// ===========================================================================
// The expected kit: what a first-time campaign run can afford by then (the user: the model must assume it)
// ===========================================================================
// Money / reputation from the chapters before (rewards: money + perPirate × A.BOUNTY_PIRATES, rep + 1 for
// the first clear), spent after each chapter: gear in A.GEAR_ORDER as soon as the money allows, ship upgrades
// in A.SHIP_ORDER as soon as the reputation does (each in order: saving up for the next rather than skipping it). Plus the mission's prerequisites (needs: the lobby recommends them; overcharge is
// the only profession perk counted, professions are mixed in a crew). Every player is assumed to have it.
// Skirmish twins (SKIRMISH_TWIN) get their chapter's kit; intro / rush / practice none.
// Modelled: boots (walking ×1.15: trips measured in the game with them, tools/travel.js; deck airlock cycles
// unchanged), suit thrusters (spacewalks ×1.3), first aid course / stim pack (getting up 6 s / 3 s instead of 10 s,
// treating 1.2 s instead of 2 s: CREW_HIT_COST scaled), armor vest (one crew hit fewer per player; not in the expected kit: weapons specialists only), and the ship:
// cannons (4 shots per energy: the energy runs and the fights' reloads), inserter, spare cell, caps, shields, radar
// (the energy runs / the radar range, from the game), airlocks (0.7 s cycles: trips measured with them), hull (6
// broken parts to lose), sprinklers (fires burn their part a third slower: a fire counts less as an open problem).
// Not modelled: the coffee machine; the boots' walking where gravity fails.
let KIT = null;                                   // the effects of the kit of the build being run (kitEffects), or null
const evaMul = () => (KIT?.thrusters ? 1.3 : 1);
const walkMul = () => (KIT?.boots ? 1.15 : 1);    // (walking inside a docked ship / the derelict: not measured, scaled)
const kitCache = new Map();
function expectedKit(id) {
  if (kitCache.has(id)) return kitCache.get(id);
  const g = game(), ch = g.CAMPAIGN.includes(id) ? id : g.SKIRMISH_TWIN[id];
  let kit = null;
  if (ch) {
    let money = 0, rep = 0, earned = 0, repEarned = 0;
    const gear = [], ship = [];
    for (const c of g.CAMPAIGN.slice(0, g.CAMPAIGN.indexOf(ch))) {
      const R = g.MISSIONS[c].rewards || {}, m = (R.money || 0) + (R.perPirate || 0) * A.BOUNTY_PIRATES;
      money += m; earned += m; rep += (R.rep || 0) + 1; repEarned += (R.rep || 0) + 1;
      for (const gid of A.GEAR_ORDER) {
        if (gear.includes(gid)) continue;
        const G1 = g.GEAR.find(x => x.id === gid);
        if (money < G1.cost) break;
        money -= G1.cost; gear.push(gid);
      }
      for (const u of A.SHIP_ORDER) {
        if (ship.includes(u)) continue;
        const cost = g.SHIP_UPGRADES.find(x => x.id === u).rep;
        if (rep < cost) break;
        rep -= cost; ship.push(u);
      }
    }
    const N = g.MISSIONS[id].needs || {}, needs = (N.ship || []).filter(u => !ship.includes(u));
    kit = { chapter: ch, earned, money, repEarned, rep, gear, ship: [...ship, ...needs], bought: ship, needs, overcharge: !!N.overcharge };
  }
  kitCache.set(id, kit);
  return kit;
}
// The kit as numbers the model uses (null: no kit — the old model, exactly).
function kitEffects(kit, ship = {}) {
  if (!kit) return null;
  const g = game(), has = (x) => kit.gear.includes(x);
  return { boots: has('boots'), thrusters: has('thrusters'), armor: has('armor'),
           selfPatch: has('stim') ? 3 : has('firstAid') ? 6 : g.SELF_TREAT, treat: has('firstAid') ? 1.2 : g.TREAT_TIME,
           spe: ship.cannons ? 4 : 3, airlocks: !!ship.airlocks, maxDamage: ship.hull ? 6 : 5, fireSlow: ship.sprinklers ? 15 / 22 : 1 };
}
// Crew-seconds per hit on the crew (A.CREW_HIT_COST, scaled by the kit's patching up)
function hitCost(n) {
  if (!KIT) return A.CREW_HIT_COST;
  const g = game(), patch = (self, treat) => (n > 1 ? (self + treat + A.TREAT_WALK) / 2 : self);
  return A.CREW_HIT_COST * (A.HIT_SLOW + A.HIT_DOWN * patch(KIT.selfPatch, KIT.treat)) / (A.HIT_SLOW + A.HIT_DOWN * patch(g.SELF_TREAT, g.TREAT_TIME));
}
const GEAR_SHORT = { boots: 'boots', firstAid: 'first aid', thrusters: 'thrusters', armor: 'armor vest', stim: 'stim pack' };
function kitText(id) {
  const k = expectedKit(id);
  if (!k) return 'no kit';
  const done = game().CAMPAIGN.indexOf(k.chapter);
  return `${done > 1 ? `after chapters 1-${done}` : done ? 'after chapter 1' : 'first chapter, nothing yet'}: $${k.earned} earned ($${k.money} left), ★${k.repEarned} (${k.rep} left)`
    + ` → gear: ${k.gear.map(x => GEAR_SHORT[x]).join(', ') || 'none'}; ship: ${k.bought.join(', ') || 'none'}${k.needs.length ? ` + needs ${k.needs.join(', ')}` : ''}${k.overcharge ? '; overcharge (needs)' : ''}`;
}

// ===========================================================================
// Calibration: each encounter in the real game, nobody fighting back
// ===========================================================================
const calCache = new Map();
function calibrate(kind, W = 60, seeds = [1, 2, 3]) {
  if (calCache.has(kind)) return calCache.get(kind);
  const sum = { small: 0, large: 0, crewHits: 0, broken: 0 }, first = {};
  for (const seed of seeds) seeded(seed * 7919, () => {
    const G = loadGame(NAMES);
    const side = G.EVENT_SIDES.swarm; G.EVENT_SIDES.swarm = () => 'front';   // (intro's swarm draws no side here: the measurements stay as before sides)
    G.startMission('intro'); G.mission.events = []; G.mission.jumpAt = 1e9; G.EVENT_SIDES.swarm = side;
    Object.assign(G.me, { x: 22.2, y: 16.6 });           // the crew member waits in the middle of the reactor room
    G.runEvent(kind === 'swarm' ? { t: 0, kind, side: 'front' } : G.makeEvent(kind, 0, G.SYSTEMS[0]));   // (the swarm: measured from ahead, as before sides; no draw)
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
const reloadTime = () => game().RELOAD_TIME / A.RELOAD_SPEED;
const fightTime = (shots, g) => shots * A.AIM_TIME + Math.max(0, Math.ceil(shots / (KIT?.spe || g.SHOTS_PER_ENERGY)) - 1) * reloadTime();   // (the kit's efficient cannons: fewer reloads)
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
    if (ctx.objective?.kind === 'navcore') {
      // the nav core (chapter 4): shot to scrap, its core floats beside the hull for NAVCORE_LIFE s (a spacewalk fetch);
      // docked, someone boards it (as well as fighting the boarders) and pulls it from the nav console. The first raider's
      // core does it; the second raider's only if the first one's got lost.
      const ws = g.WALK_SPEED * walkMul(), core = [side === 'port' ? -4.6 : 49.0, 9], e = evaTrip(side, [core]);
      const fetch = { label: 'nav core (spacewalk fetch)', prio: 1, trip: e.legs, work: e.extra + A.GRAB, deadline: g.NAVCORE_LIFE - e.extra / 2,
                      late: () => ({ lost: true, cancelAt: g.NAVCORE_LIFE }), objective: { navcore: 1 } };
      const pull = { label: 'nav core (board the raider, pull it)', rel: g.DOCK_TIME + 6, prio: 1, trip: H(lockRoom(side)), crewHits: A.NAV_BOARD_HITS,
                     work: 2 * A.BOARD_WALK / ws + g.NAVCORE_PULL, objective: { navcore: 1 } };
      job({ ...f, deadline: g.DOCK_TIME, objective: { pirates: 1 }, after: (j, fin, late) => (late || ctx.got.navcore ? [] : [fetch]),
            late: (j) => ({ jobs: [{ label: 'pirates aboard (docked)', rel: g.DOCK_TIME, ...boarders(2, side), objective: { pirates: 2 } }, ...(ctx.got.navcore ? [] : [pull])], cancelAt: g.DOCK_TIME }) });
    } else if (ev.letDock) job({ label: 'pirates aboard', rel: g.DOCK_TIME, ...boarders(2, side), objective: { pirates: 2 },
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
    // (from a side, 2026-10-16: the same job on that side's cannon and capacitor; its rocks take as long to the hull as from ahead)
    job({ label: 'asteroid swarm', trip: H(gunOf(side)), work: A.CLIMB + fightTime(shots, g), energy: [{ cap: CAP[side], shots, gun: side }],
          swarm: { per: per * A.AIM_TIME, hitAt, side } });
  } else if (k === 'intruder') {
    const fight = g.ALIEN_HP / A.LASER_HIT * A.LASER_SHOT;
    // (several: one per deck, each its own fight; chapter 2's hatch out of the cargo pods in the reactor room, in turn: js/invader.js podHatchAt)
    for (let i = 0; i < (ev.count || 1); i++)
      job({ label: 'alien', ...(ev.pods ? { rel: g.podHatchAt(i), trip: H('reactor') } : { trip: H(i % 2 ? 'portLock' : 'starLock') }), work: fight, crewHits: fight * A.ALIEN_HITS, alive: { crew: A.ALIEN_HARASS, from: 2 }, objective: { intruder: 1 } });
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
    // shields don't stop them (2026-10-16): shoot the six on the way in; any that latch are pried off on a spacewalk (1.5 s each)
    const chew = calibrate('leeches').first.broken ?? A.LEECH_LATCH + g.LEECH_CHEW, shots = 6 / A.HIT_RATE;
    const pry = () => { const e = evaTrip(side, g.HULL_SPOTS[side].slice(0, 3)); return { label: 'pry leeches off', prio: 1, trip: e.legs, work: e.extra + 3 * 1.5,
      deadline: chew, late: (j, done) => ({ breaks: 6 * Math.max(0, done - chew) / g.LEECH_CHEW + 1 }) }; };
    job({ label: 'leech swarm', trip: H(gunOf(side)), work: A.CLIMB + fightTime(shots, g), energy: [{ cap: CAP[side], shots, gun: side }],
          deadline: A.LEECH_LATCH, late: () => ({ jobs: [pry()] }) });
  } else if (k === 'herd') {
    // the herd: its two encounters at once, from one side (each with its own jobs)
    for (const kind of ev.kinds || []) for (const j of jobsFor({ ...ev, kind }, ctx)) J.push({ ...j, label: `herd: ${j.label}` });
  } else if (k === 'tide') {
    // a gravity tide (an event, or the `tides` rule's one tide): everyone holds on through the lurch (TIDE_WARN s after the
    // warning), and with the coils rule it knocks one coil out: a spacewalk to turn it back (or the jump takes COIL_DELAY longer)
    for (let i = 0; i < n; i++) job({ label: 'gravity tide: hold on', rel: g.TIDE_WARN, work: g.TIDE_TIME });
    if (rules.coils) {
      const c = g.COIL_SPOTS[(ctx.tides = (ctx.tides || 0) + 1) % g.COIL_SPOTS.length], e = evaTrip(nearSide(c.x), [[c.x, c.y]]);
      job({ label: `jump coil (${c.name}, re-align)`, rel: g.TIDE_WARN + g.TIDE_TIME, prio: 3, coil: true, trip: e.legs, work: e.extra + g.ALIGN_TIME });
    }
  } else if (k === 'leviathan') {
    const bumps = Math.floor(g.LEV_TIME / g.LEV_STEP);
    job({ label: 'leviathan', work: 0, prio: 3, fixed: { small: bumps, span: [0, g.LEV_TIME], crewHits: 0.5 } });
  } else if (k === 'leviathan_boss') {
    // chapter 8's infested leviathan (js/leviathan.js), roughly, as jobs on its own clock (rel: s after it arrives; the
    // swims between its stations are the gaps). 1 the pass: the fin (front cannon), the left zones (left cannon), the right
    // zones (right cannon), LEVB_ZONE_HP hits each; tail flicks (small hits) all along phases 1 and 3. 2 the gas: everyone
    // in (like a flare). 3 the sides: eye + 2 zones in the window, each side with its cannon (late: a punishment, again).
    // 4 behind: brood waves (laser fights) while someone gets MID to LEVB_NEED (a 'fight' on MID that uses LEVB_NEED
    // energies: it waits for them like a cannon does) and holds the override at the stern; then it sinks (LEVB_SINK).
    const nz = n >= 3 ? 3 : 2, zoneShots = shotsFor(nz * g.LEVB_ZONE_HP, 99), finShots = shotsFor(g.LEVB_FIN_HP, 99), sideShots = shotsFor(3, 99);
    const gun = (sd, rel, shots, label, extra = {}) => job({ label: `leviathan: ${label}`, rel, trip: H(gunOf(sd)), work: A.CLIMB + fightTime(shots, g), energy: [{ cap: CAP[sd], shots, gun: sd }], ...extra });
    gun('front', 8, finShots, 'fin');
    gun('port', 30, zoneShots, 'left zones');
    gun('star', 62, zoneShots, 'right zones');
    const gasAt = 62 + A.CLIMB + fightTime(zoneShots, g) + 4;
    for (let i = 0; i < n; i++) job({ label: 'leviathan: toxic gas, get inside', rel: gasAt, work: A.FLARE_COST, deadline: g.LEVB_GAS_WARN, late: () => ({ crewHits: 2 }) });
    const p3 = gasAt + g.LEVB_GAS_WARN + g.LEVB_GAS + 8, win = g.LEVB_WINDOW[0];
    ['port', 'star'].forEach((sd, i) => gun(sd, p3 + i * 28, sideShots, `${sd === 'port' ? 'left' : 'right'} eye + zones`,   // (a window missed: a punishment)
      A.CLIMB + fightTime(sideShots, g) > win ? { fixed: { small: 0, span: [0, 1], crewHits: 0.5 } } : {}));
    const fixedFlicks = Math.floor((gasAt + 60) / g.LEVB_FLICK);
    job({ label: 'leviathan: tail flicks', work: 0, prio: 3, fixed: { small: fixedFlicks, span: [0, p3 + 60], crewHits: 0.3 * fixedFlicks } });
    const p4 = p3 + 60, waves = 3, per = Math.min(6, 3 + n - 1), spe = KIT?.spe || g.SHOTS_PER_ENERGY;
    for (let w = 0; w < waves; w++) job({ label: `leviathan: brood wave ${w + 1}`, rel: p4 + 5 + w * g.LEVB_WAVE, trip: H('reactor'), work: per / A.LASER_HIT * A.LASER_SHOT, crewHits: 0.15 * per });
    job({ label: 'leviathan: MID to 3 + engine override', rel: p4, trip: H('reactor'), work: g.LEVB_OVERRIDE + A.LEVER_TURN, energy: [{ cap: 1, shots: g.LEVB_NEED * spe, gun: 'front' }] });
  } else if (k === 'derelict') {
    const ws = g.WALK_SPEED * walkMul(), walk = 2 * A.BOARD_WALK / ws, obj = ctx.objective?.kind;
    let work = walk + A.DERELICT_EXTRA + g.HATCH_TIME * 2;
    if (obj === 'blackbox') work += A.BOARD_WALK / ws * (1 / A.BOX_SLOW - 1);
    if (obj === 'rescue') work += g.TREAT_TIME + A.BOARD_WALK / g.NPC_SPEED - A.BOARD_WALK / ws;
    // S-7: tendrils grab on the way in (freed by a shot, a spray or wriggling); the black box needs J1 patched, the
    // freezer on (drawing from our capacitor on that side every S7_DRAW s until the crew is back) and the core frozen;
    // the engineer is fought through to without it. Meanwhile the creep grows toward our airlock (its own job).
    const box = obj !== 'rescue', grabs = box ? A.S7_GRABS : A.S7_GRABS_RESCUE;
    work += grabs * A.S7_FREE;
    if (box) work += A.S7_PATCH + g.S7_FREEZER_HOLD + Math.max(0, g.S7_FREEZE[2] - A.S7_TO_CORE);
    const freezerAt = A.BOARD_WALK * 0.6 / ws + g.HATCH_TIME + A.S7_PATCH + grabs * A.S7_FREE / 2;   // (s after arriving at our airlock)
    job({ label: `derelict (${obj || 'explore'})`, prio: 1, trip: H(`${L(side)} outer airlock`), work, crewHits: grabs * A.S7_GRAB_HITS, objective: obj ? { [obj]: 1 } : null,
          freezer: box ? { cap: CAP[side], at: freezerAt, every: g.S7_DRAW[0] } : null });
    const reach = g.S7_CREEP_TIME * (n > 1 ? 1 : 1.5), lock = H(lockRoom(side));
    job({ label: 'S-7 creep (push it back)', rel: reach, prio: 1, trip: lock, work: A.S7_CREEP_WORK * A.S7_CREEP_SHARE, deadline: reach * 0.4,
          late: () => ({ jobs: [{ label: 'S-7 wrap (clear our capacitor)', rel: reach * 1.4, prio: 1, trip: lock, work: (g.S7_WRAP_SPRAY + A.TOOL_FETCH) * A.S7_CREEP_SHARE }] }) });
  } else if (k === 'rock') {
    // the ore asteroid drifts past (js/dock.js updateRock): in reach from `from` to `until` s after the event. A drill trip
    // per sample (the objective's count): out the hatch nearer the rock where it is then, drill, grab, back in (stowed).
    // The first fetches the drill from the left airlock room; each next one is released when the last one is done.
    const dir = ev.side === 'star' ? -1 : 1, v = g.ROCK_SPEED, x0 = dir > 0 ? g.ROCK_REACH[0] - g.ROCK_FROM : g.ROCK_REACH[1] + g.ROCK_FROM;
    const from = g.ROCK_FROM / v, until = (g.ROCK_FROM + g.ROCK_REACH[1] - g.ROCK_REACH[0]) / v, need = ctx.objective?.kind === 'ore' ? ctx.objective.count || 1 : 1;
    const xAt = (rel) => clamp(x0 + dir * v * rel, g.ROCK_REACH[0], g.ROCK_REACH[1]);
    const trip = (i, rel, first) => {                  // rel: s after the event the trip starts (estimated: the rock's x then, + ~15 s out)
      const x = xAt(rel + 15), hs = x < 22.2 ? 'port' : 'star', e = evaTrip(hs, [[x, g.ROCK_Y + g.ROCK_R]]);
      const t = first ? H('portLock') + T('portLock', `${L(hs)} outer airlock`) : e.legs, work = e.extra + g.DRILL_TIME + A.GRAB;
      return { label: `drill ore sample ${i}`, prio: 1, trip: t, work, objective: { ore: 1 }, deadline: until - rel - e.extra / 2, late: () => ({ lost: true, cancelAt: until - rel }),
               after: (j, fin, late) => (i < need && !late ? [{ ...trip(i + 1, fin - ev.t, false) }] : []) };
    };
    job({ ...trip(1, from, true), rel: from });
  } else if (k === 'brig') {
    const b = boarders(2, side);
    job({ label: 'prison barge (rescue)', prio: 1, ...b, work: b.work + g.TREAT_TIME + A.BOARD_WALK / g.NPC_SPEED, objective: { rescue: 1 } });
    // Captain Red Comet in the base's quarters (js/captain.js), roughly: his HP is shared by up to CAPT_FIGHTERS crew, who hit the
    // generator in his catch-breath windows (and, phase 2, his daze); a cycle's length and hits from his own constants. His door
    // pirates (75 %, 50 %, one every CAPT_TRICKLE s in phase 2) are fought too; 2+ players: his raider at our other airlock.
    const nf = Math.min(n, A.CAPT_FIGHTERS), hp = g.captMaxHp(n), wave = Math.min(3, n), shot = A.CAPT_SHOT, hit = A.CAPT_HIT, fight = boarders(0, side);
    const buck = (ph, k) => k * (0.4 + g.CAPT_TEL[ph] + g.CAPT_RECOVER[ph]), spin = (ph) => g.CAPT_PLANT[ph] + g.CAPT_SPIN_TURNS * 2 * Math.PI / g.CAPT_SPIN_W[ph];
    const c1 = buck(0, 3) + spin(0) + g.CAPT_BREATH[0], h1 = Math.max(0, g.CAPT_BREATH[0] - A.CAPT_BEHIND) / shot * hit + A.CAPT_SPIN_HITS;
    const dz = A.CAPT_DAZE_SHARE, c2 = buck(1, 2) + g.CAPT_DASH_TEL + 0.6 + dz * g.CAPT_DAZE + (1 - dz) * spin(1) + g.CAPT_BREATH[1];
    const h2 = Math.max(0, g.CAPT_BREATH[1] - A.CAPT_BEHIND) / shot * hit + dz * 2 * g.CAPT_DAZE / shot * hit + (1 - dz) * A.CAPT_SPIN_HITS;
    const n1 = hp / 2 / (h1 * nf), n2 = hp / 2 / (h2 * nf), t1 = n1 * c1, t2 = n2 * c2 + g.CAPT_TRANSITION;
    for (let i = 0; i < nf; i++) {
      job({ label: 'captain red comet: phase 1', prio: 1, rel: A.CAPT_REACH, trip: fight.trip, work: t1 + g.CAPT_WHISTLE, crewHits: n1 * A.CAPT_CYCLE_HITS });
      job({ label: 'captain red comet: comet mode', prio: 1, rel: A.CAPT_REACH + t1, trip: 0, work: t2, crewHits: n2 * A.CAPT_CYCLE_HITS });
    }
    const pf = g.PIRATE_HP / A.LASER_HIT * A.LASER_SHOT;
    for (const [rel, cnt, label] of [[A.CAPT_REACH + t1 * 0.5, wave, 'all hands'], [A.CAPT_REACH + t1, wave, 'the 50 % wave'], ...Array.from({ length: Math.floor(t2 / g.CAPT_TRICKLE) }, (_, i) => [A.CAPT_REACH + t1 + (i + 1) * g.CAPT_TRICKLE, 1, 'another door pirate'])])
      job({ label: `captain's door pirates: ${label}`, prio: 0, rel, trip: 0, work: cnt * pf, crewHits: cnt * A.PIRATE_FIGHT_HITS });
    if (n >= 2) {                                    // his raider at our other airlock (never solo)
      const r = boarders(2, side === 'port' ? 'star' : 'port');
      job({ label: 'captain\'s raider (2 boarders after our fuel)', ...r, rel: A.CAPT_REACH + g.CAPT_RAID_DELAY, deadline: 25, late: () => ({}) });
    }
  }
  for (const j of J) j.ev = ev;
  return J;
}
function boarders(count, side) {                  // fight `count` pirates aboard with the laser
  const g = game(), fight = count * g.PIRATE_HP / A.LASER_HIT * A.LASER_SHOT;
  return { trip: H('starLock') + T('starLock', lockRoom(side)), work: fight + 2 * A.BOARD_WALK / (g.WALK_SPEED * walkMul()) / 2, crewHits: count * A.PIRATE_FIGHT_HITS, prio: 0 };
}
function scrape(side, count, rel) {               // barnacles: scrape them off outside before they grow (then they drain power)
  const g = game(), e = evaTrip(side, game().HULL_SPOTS[side].slice(1, 1 + count));
  return { label: `barnacles ×${count}`, rel, prio: 1, trip: e.legs, work: e.extra + count * g.SCRAPE_TIME, deadline: g.BARNACLE_GROW,
           late: (j, done) => ({ drain: { cap: CAP[side], from: j.release + g.BARNACLE_GROW, until: j.release + done, per: count / g.BARNACLE_DRAIN } }) };
}

// ===========================================================================
// One mission build, one crew size
// ===========================================================================
// The timeline exactly as the game lays it out for n crew (startMission with n crew aboard), cached.
// `over` tries other per-crew-size settings: { events, cells, overcharge } (calibration, what-ifs).
const buildCache = new Map();
function setup(id, n, ship, seed, over = {}, patch) {
  const key = patch ? null : JSON.stringify([id, n, ship, seed, over]);
  if (key && buildCache.has(key)) return buildCache.get(key);
  const b = seeded(seed, () => {
    const G = loadGame(NAMES);
    if (patch) patch(G);                           // try a change (proposals): patch(G) can replace MISSIONS[id].build etc.
    const M = G.MISSIONS[id], C = M.crew = JSON.parse(JSON.stringify(M.crew || {})), i = Math.min(8, n) - 1;
    for (const k of ['events', 'cells', 'overcharge', 'reactor']) if (over[k] !== undefined) { C[k] = C[k] || []; C[k][i] = over[k]; }
    G.crew.length = 0; for (let j = 0; j < n; j++) G.crew.push(G.makeCrew('P' + j));
    G.startMission(id, { ship });
    return {
      id, n, ship, events: G.mission.events.map(e => ({ ...e, sys: undefined })), jumpAt: G.mission.jumpAt, lead: G.mission.lead,
      rules: { ...(G.mission.rules || {}) }, objective: G.mission.objective, factor: G.paceFactor(), overcharge: !!G.mission.overcharge, gap: G.mission.gap,
      energy: { interval: G.ENERGY_TIME / G.reactorSpeed(), cells: 1 + G.power.reserve, perCell: G.CELL_ENERGY, capMax: G.CAP_MAX, spe: G.SHOTS_PER_ENERGY, inserter: !!ship.inserter },
      radarRange: G.RADAR_RANGE, g: patch ? G : game(),        // (the shared constants: a sandbox per cached build would fill the memory)
    };
  });
  if (key) { if (buildCache.size > 4000) buildCache.clear(); buildCache.set(key, b); }
  return b;
}

// The crew's day: schedule the jobs, then run the energy on the game's own code with what they planned,
// feed the waits for energy back into the fights, and schedule again.
function simulate(build) {
  const s1 = schedule(build, {});
  const e1 = energySim(build, s1.plan, 'real');
  const s2 = schedule(build, e1.waitByKey);
  const real = energySim(build, s2.plan, 'real'), best = energySim(build, s2.plan, 'best');
  return finish(build, s2, real, best);
}
function schedule(build, waitByKey) {
  const { n, events, jumpAt, rules, objective } = build, g = build.g;
  const end = jumpAt + 2, got = {}, ctx = { n, rules, objective, got };   // (got: objectives reached so far, in schedule order: the nav core's / ore's follow-up jobs look)
  // pirate objective: let raiders dock when shooting them all down can't reach the count (2 pirates come aboard)
  if (objective?.kind === 'pirates') {
    let need = Math.max(0, objective.count - events.filter(e => e.kind === 'pirates').length);
    for (const r of events.filter(e => e.kind === 'pirates').sort((a, b) => a.t - b.t)) { r.letDock = need > 0; if (need > 0) need--; }
  }
  let queue = [];
  const push = (j, release, ev) => {
    const job = { rel: 0, prio: 0, work: 0, trip: 0, energy: [], deadline: null, ...j, release, ev: ev || j.ev };
    // a repair joins one that's still waiting in the same place (one trip fixes both)
    const same = job.prio === 2 && queue.find(q => q.prio === 2 && q.label === job.label && q.where === job.where && Math.abs(q.release - release) <= A.INCIDENT_CHUNK * 1.5);
    if (same) { same.work += job.work; same.weight = (same.weight || 0) + (job.weight || 0); return; }
    queue.push(job);
  };
  // the `tides` rule: one tide, rules.tides s in (js/encounters.js updateTide; it recurred until 2026-10-17)
  const tideEvs = [];
  if (rules.tides) { const at = rules.tides === true ? g.TIDE_EVERY : +rules.tides || g.TIDE_EVERY; if (at < jumpAt) tideEvs.push({ id: 'tide0', t: at, kind: 'tide', radar: false }); }
  for (const ev of [...events, ...tideEvs]) for (const j of jobsFor(ev, ctx)) {
    j.key = `${ev.id}|${j.label}`;
    if (waitByKey[j.key]) j.work += waitByKey[j.key];              // (pass 2: the fight waited this long for energy)
    j.radarable = ev.radar !== false && j.rel >= 0 && j.prio <= 1;  // the radar can tell what's coming
    push(j, ev.t + j.rel, ev);
  }
  // routine work: the radar and the helm diagnosis (a look when each failing pair turns yellow). Radar: scan; if it
  // shows a contact, nothing can come before it, so the next scan is due when that contact arrives;
  // if it shows nothing, scan again RADAR_RANGE × A.RADAR_EVERY later.
  const scanJob = (t) => push({ label: 'radar scan', radar: true, prio: 1, trip: H('bridge'), work: A.RADAR_WORK }, t, { kind: 'radar', t });
  const nextScan = (f) => {
    const next = Math.min(Infinity, ...events.filter(e => e.radar !== false && e.t > f).map(e => e.t));
    const at = next - f <= build.radarRange ? next : f + build.radarRange * A.RADAR_EVERY;
    if (at < end) scanJob(at);
  };
  scanJob(0);
  for (const e of events.filter(e => e.kind === 'maintenance')) {   // (each failure's pair shows MAINT_YELLOW s ahead: a look at the helm then)
    const at = Math.max(0, e.t - g.MAINT_YELLOW);
    push({ label: 'helm diagnosis', prio: 1, trip: H('Helm'), work: A.DIAG_WORK }, at, { kind: 'diag', t: at });
  }
  // the jump: coils aligned outside before it, the handle pulled at it
  if (rules.coils) for (const c of g.COIL_SPOTS) {
    const e = evaTrip(nearSide(c.x), [[c.x, c.y]]);
    push({ label: `jump coil (${c.name})`, prio: 3, optional: true, coil: true, trip: e.legs, work: e.extra + g.ALIGN_TIME }, 0, { kind: 'coil', t: 0 });   // (skipped: the jump takes COIL_DELAY longer)
  }
  if (rules.handle) push({ label: 'jump handle', trip: H('Helm'), work: n > 1 ? g.JUMP_PULL_TWO : g.JUMP_PULL }, jumpAt - H('Helm'), { kind: 'handle', t: jumpAt });

  const free = Array(n).fill(0), done = [], open = [], scrams = [], drains = [], storms = [], lateList = [], scans = [];
  const plan = { fights: [], shields: [], freezers: [], jumpAt, window: g.PRESS_FIRST, scrams, drains, storms, end };
  let crewHits = 0, bonusCells = 0, jumpDelay = 0, busy = 0, coilsDone = 0, radarBusy = 0;
  const roomOf = (side) => (side === 'front' ? 'bridge' : side === 'port' ? 'portGun' : 'starGun');
  const sideOf = (j) => j.ev?.side || 'front';
  // damage → repair jobs: small hits (A.INCIDENT_PER_SMALL incidents each), big hits (parts broken, plus the rules' extras)
  const repairs = (small, large, at, side, ev) => {
    const inc = small * A.INCIDENT_PER_SMALL, brk = large * A.BREAK_PER_LARGE;
    if (inc > 0) {
      const pl = rules.plasma ? A.PLASMA_SHARE : 0, work = (1 - pl) * A.INCIDENT_WORK + pl * (A.PIN_TIME + g.VENT_TIME);
      push({ label: 'fire / damage', where: side, prio: 2, trip: H(roomOf(side)) + A.TOOL_FETCH, work: work * inc, weight: inc * A.OPEN_SMALL * (KIT?.fireSlow ?? 1) }, at, ev);
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
  // an event the radar has shown: someone sets off early and is there when it starts; else they react
  const reach = (ev) => (ev.kind === 'stealth' ? Math.min(build.radarRange, g.STEALTH_RADAR) : build.radarRange);   // (a stealth fighter shows up late)
  const known = (j, now) => j.radarable && scans.some(s => s <= now && s <= j.ev.t && j.ev.t - s <= reach(j.ev));
  const releaseOf = (j, now) => (j.radarable && known(j, now) ? j.release - j.trip : j.release + (j.radarable || (j.prio <= 1 && j.rel >= 0) ? A.REACT : 0));

  // the scheduler: whoever is free next takes the most urgent job that's come up
  const cur = Array(n).fill(null);
  let forced = null;
  for (let guard = 0; queue.length && guard < 8000; guard++) {
    // an encounter comes up while everyone is busy: whoever is on a repair or a scan drops it (the rest waits)
    const minFree = Math.min(...free), urgent = queue.filter(q => q.prio === 0 && q.release < end && q.release + A.REACT < minFree).sort((a, b) => a.release - b.release)[0];
    if (urgent) {
      const tc = urgent.release + A.REACT, c = cur.findIndex(e => e && (e.prio === 2 || e.radar) && e.finish > tc && e.start < tc);
      if (c >= 0) {
        const e = cur[c], left = (e.finish - Math.max(tc, e.atJob)) / Math.max(1e-9, e.finish - e.atJob);
        busy -= e.finish - tc; if (e.radar) radarBusy -= e.finish - tc; e.finish = tc; cur[c] = null; free[c] = tc;
        if (e.openRef) e.openRef.b = Infinity;
        if (!e.radar) queue.push({ ...e, work: e.work * Math.min(1, left), release: tc, openRef: e.openRef, weight: 0, label: e.label.replace(/( \(resumed\))?$/, ' (resumed)') });
        else { scans.pop(); scanJob(tc); }                      // (the scan wasn't finished: it's still due)
        forced = { who: c, job: urgent };
      }
    }
    const who = free.indexOf(Math.min(...free)), now = free[who];
    const load = busy / Math.max(1, n * now);
    const ready = queue.filter(j => releaseOf(j, now) <= now && j.release < end && !(j.optional && load > A.OPTIONAL_IDLE));
    if (!ready.length) {
      const next = Math.min(...queue.filter(j => j.release < end).map(j => releaseOf(j, now)).filter(t => t > now));
      if (!Number.isFinite(next)) break;
      free[who] = next; continue;
    }
    // close to losing (A.PANIC_OPEN broken parts' worth open): repairs come before chores
    const openNow = queue.filter(q => q.weight && q.release <= now).reduce((s, q) => s + q.weight, 0) + open.filter(o => o.a <= now && o.b > now).reduce((s, o) => s + o.w, 0);
    const pr = (q) => (q.prio === 2 && openNow >= A.PANIC_OPEN ? 0.5 : q.prio);   // (still after anything that's shooting at us)
    ready.sort((a, b) => pr(a) - pr(b) || a.release - b.release);
    const j = forced && forced.who === who && queue.includes(forced.job) ? forced.job : ready[0]; queue = queue.filter(q => q !== j);
    forced = null;
    const start = Math.max(now, releaseOf(j, now)), atJob = start + j.trip, since = atJob - j.release;
    let finish = atJob + j.work;
    if (j.notBefore) finish = Math.max(finish, j.release + j.notBefore + j.work);
    if (j.mother) {                                           // a tongue can only be hit while it's out
      const M = j.mother;
      let w = j.release + M.first; while (w + M.open < atJob + A.CLIMB) w += M.every;
      finish = w + (M.wins - 1) * M.every + M.open / 2 + (waitByKey[j.key] || 0);
      const missed = Math.round((w - j.release - M.first) / M.every);   // puffs before anyone was at the cannon: barnacles
      if (missed > 0) push(scrape(sideOf(j), Math.min(6, missed * g.MOTHER_TOSSES), 0), w, j.ev);
    }
    if (j.swarm) {                                            // each big asteroid: shot in time, or a big hit
      let c = since + A.CLIMB, hits = 0;
      for (let i = 0; i < g.SWARM_SIZE; i++) { c = Math.max(c, i * g.SWARM_INTERVAL) + j.swarm.per; if (c > j.swarm.hitAt + i * g.SWARM_INTERVAL) hits++; }
      if (hits) { repairs(0, hits, j.release + j.swarm.hitAt, j.swarm.side || 'front', j.ev); lateList.push(j.label); }
    }
    let wasLate = false, lost = false;
    if (j.late && j.deadline !== null && since > j.deadline) {
      const res = j.late(j, finish - j.release), at = j.release + j.deadline;
      lateList.push(j.label); wasLate = true; lost = !!res.lost;   // (lost: the objective it was for slipped away, e.g. the nav core drifted off)
      if (res.cancelAt !== undefined) finish = Math.max(start, Math.min(finish, j.release + res.cancelAt));   // (gone before anyone got there: no time spent)
      for (const nj of res.jobs || []) push({ ...nj, key: `${j.ev?.id}|${nj.label}` }, j.release + (nj.rel || 0), j.ev);
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
      plan.shields.push({ t: j.release + h - 1, side: sideOf(j), key: j.key, heavy: true });
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
    // what it asks of the energy (run on the game's code afterwards)
    for (const e of j.energy) {
      if (e.shots !== undefined) plan.fights.push({ key: j.key, gun: e.gun, t0: atJob + A.CLIMB, shots: Math.max(1, Math.round(e.shots)), span: Math.max(1, finish - atJob - A.CLIMB - (waitByKey[j.key] || 0)) });
      else if (e.shield) plan.shields.push({ t: j.notBefore ? Math.max(atJob, j.release + j.notBefore) : atJob, side: sideOf(j), key: j.key });
    }
    if (j.freezer) plan.freezers.push({ key: j.key, cap: j.freezer.cap, t0: atJob + j.freezer.at, t1: finish, every: j.freezer.every });   // (S-7: Varga's freezer on our capacitor)
    if (j.storm) storms.push(j.release);
    if (j.radar) { scans.push(finish); radarBusy += finish - start; nextScan(finish); }
    if (j.objective && finish < end && !lost) for (const k in j.objective) got[k] = (got[k] || 0) + j.objective[k];
    if (j.after) for (const nj of j.after(j, finish, wasLate)) push({ ...nj, key: `${j.ev?.id}|${nj.label}` }, finish + (nj.rel || 0), j.ev);   // (a follow-up: released when this one is done)
    free[who] = finish; busy += Math.max(0, Math.min(finish, end) - start);
    const entry = { ...j, start, atJob, finish, who };
    done.push(entry); cur[who] = entry;
    if (j.openRef) { j.openRef.b = finish; entry.openRef = j.openRef; }
    else if (j.weight) open.push(entry.openRef = { a: j.release, b: finish, w: j.weight });
  }
  const coilJobs = done.filter(j => j.coil).length + queue.filter(j => j.coil && j.release < end).length;   // (the first alignment + one per tide)
  if (rules.coils) jumpDelay += clamp(coilJobs - coilsDone, 0, g.COIL_SPOTS.length) * g.COIL_DELAY;   // (not modelled further: more time under fire)
  plan.bonusCells = bonusCells;
  return { done, queue, open, plan, crewHits, busy, radarBusy, lateList, got, jumpDelay, end, overTime };
}
function finish(build, s, real, best) {
  const { n, objective } = build, g = build.g, end = s.end;
  // the energy's crew work: lever trips (pin / re-pin / unpin with the wrench) and fetching fuel cells
  const leverTime = real.leverTrips * (H('Power lever') + A.LEVER_TURN + g.LEVER_E_HOLD), fuelTime = real.refuels * (H('reactor') + A.REFUEL);
  const extra = s.queue.filter(j => j.prio === 2 && j.release < end).reduce((sum, j) => sum + j.trip + j.work, 0);   // repairs left at the jump
  for (const j of s.queue.filter(j => j.weight && j.release < end)) s.open.push({ a: j.release, b: j.release + j.trip + j.work + 10, w: j.weight });
  // problems open at once (fires, broken parts): from when they happen until they're fixed
  const marks = s.open.flatMap(({ a, b, w }) => [[a, w], [Math.max(a, Math.min(b, end)), -w]]).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let level = 0, peak = 0; for (const [, d] of marks) { level += d; peak = Math.max(peak, level); }
  peak += real.unmet.length > 0 ? A.BREAK_PER_LARGE * Math.min(1, real.unmet.length) : 0;      // a heavy shot that hit for want of a shield
  const ocTime = real.ocFires * (H('reactor') + A.TOOL_FETCH + A.INCIDENT_WORK);   // putting out the overcharged reactor's fires
  const crewHits = KIT?.armor ? Math.max(0, s.crewHits - n) : s.crewHits;   // (the armor vest: each player's first hit shrugged off)
  const crewNeed = s.busy + extra + leverTime + fuelTime + ocTime + crewHits * hitCost(n) + real.unmet.length * A.BREAK_PER_LARGE * (g.REPAIR_TIME + A.TOOL_FETCH + 6);
  const crewHave = n * end;
  return { id: build.id, n, end, events: build.events.length, crewNeed, crewHave, load: crewNeed / crewHave, idle: 1 - crewNeed / crewHave,
           radarShare: s.radarBusy / crewHave, leverShare: leverTime / crewHave, fuelShare: fuelTime / crewHave,
           peak, late: s.lateList.length, lateList: s.lateList, crewHits, energy: real, best, objOk: objectiveMet(objective, s.got),
           got: s.got, jumpDelay: s.jumpDelay, done: s.done, factor: build.factor };
}
function objectiveMet(o, got) {
  if (!o) return true;
  if (o.kind === 'ore') return (got.ore || 0) >= (o.count || 1);
  if (o.kind === 'pirates' || o.kind === 'intruder') return (got[o.kind] || 0) >= o.count;
  if (o.kind === 'raiders') return (got.pirates || 0) >= o.count;   // (a raider per pirates event)
  return (got[o.kind] || 0) >= 1;
}

// ===========================================================================
// Energy, on the game's own code
// ===========================================================================
// One sandbox, reset for every run: the real reactor (reactorSpeed with the mission's pace and crew, fuel
// cells, refuelling, scrams), the real lever (auto stepping, pinned with the wrench), the real capacitors
// (CAP_MAX, upgrades), the real cannons (shots per energy, reloadCannon) and shields
// (pressShield: its capacitor, up time, cooldown), barnacles draining (updateEva) and the ion storm
// arcing (updateEncounters). The crew's plan drives it: when which cannon fires, which shield goes up,
// when the jump wants MID. Mode 'real': the lever is re-routed by someone walking over (a trip each
// time), fuel cells are fetched by someone. Mode 'best': perfect routing (the lever always points where
// energy is needed next) and instant refuelling — if energy still runs short then, no crew can fix it.
// Mode 'auto': nobody touches the lever (it steps on its own; for tests against a direct game run).
const E_NAMES = ['crew', 'makeCrew', 'mission', 'power', 'CAPACITORS', 'CAP_MAX', 'GUNS', 'combat', 'combatClear', 'reloadCannon', 'fireCannon', 'pressShield',
  'useEnergy', 'resetEncounters', 'resetEva', 'startStorm', 'enc', 'evs', 'updatePower', 'updateCombat', 'updateEncounters', 'updateEva', 'applyShipUpgrades',
  'SHOTS_PER_ENERGY', 'CELL_ENERGY', 'ENERGY_TIME', 'HULL_SPOTS', 'BARNACLE_GROW', 'BARNACLE_DRILL', 'SYSTEMS', 'reactorSpeed', 'MISSIONS', 'player', 'newUid', 'fires', 'OVERCHARGE_FIRE', 'LEVER_E_HOLD'];
let GE = null;
const energyGame = () => GE || (GE = loadGame(E_NAMES));
const CAPI = { port: 0, front: 1, star: 2 };
function energySim(build, plan, mode = 'real', dt = A.ENERGY_DT) {
  const G = energyGame(), P = G.power;
  // reset to a mission start: this build's ship, pace and crew
  G.applyShipUpgrades(build.ship || {});
  G.crew.length = 0; for (let i = 0; i < build.n; i++) G.crew.push(G.makeCrew('P' + i));
  G.mission.gap = build.factor; G.mission.writtenGap = 1;        // (so reactorSpeed() = 1 / factor, the game's own formula)
  G.fires.length = 0;
  G.combatClear(); G.resetEncounters(); G.resetEva({});
  for (const s of G.SYSTEMS) s.broken = false;
  Object.assign(P, { reactor: { fuel: G.CELL_ENERGY, t: 0 }, reserve: build.energy.cells - 1, lever: { pos: 1, jammed: false, angle: 0 }, bolts: [], pulses: [], patch: [0, 1, 2],
                     overcharge: !!build.overcharge, inserter: build.ship?.inserter ? { on: true, t: 0 } : null });
  P.reserve += plan.bonusCells || 0;                               // (a fuel canister grabbed outside)
  for (const c of G.CAPACITORS) { c.charge = 1; c.pulse = 0; }
  for (const g of G.GUNS) { g.shots = G.SHOTS_PER_ENERGY; g.reload = 0; g.cd = 0; }
  for (const k in G.combat.shields) Object.assign(G.combat.shields[k], { up: 0, cd: 0 });
  const gun = (id) => G.GUNS.find(g => g.id === id);
  const fights = plan.fights.filter(f => f.t0 < plan.end).map(f => ({ ...f, left: f.shots, next: f.t0, waitFrom: null, waited: 0 })).sort((a, b) => a.t0 - b.t0);
  const shields = plan.shields.filter(s => s.t < plan.end).map(s => ({ ...s, done: false })).sort((a, b) => a.t - b.t);
  const jump = { t: plan.jumpAt, done: null }, horizon = Number.isFinite(plan.jumpAt) ? plan.jumpAt + plan.window : plan.end;
  const used = [0, 0, 0], got = [0, 0, 0], lost = [0, 0, 0], unmet = [], waits = [];
  let leverTrips = 0, refuels = 0, leverJob = null, emptyAt = null, prep = false;
  const trip = H('Power lever') + A.LEVER_TURN + G.LEVER_E_HOLD, refuelDelay = H('reactor') + A.REFUEL;
  const interval = G.ENERGY_TIME * build.factor / (build.overcharge ? 2 : 1), prepFor = Math.max(A.JUMP_PREP, A.JUMP_PREP_ENERGIES * interval);
  const scrams = [...plan.scrams].sort((a, b) => a[0] - b[0]), storms = [...plan.storms].sort((a, b) => a - b);
  const drains = plan.drains.map(d => ({ ...d, on: false, uids: [] }));
  const fzWaits = [], freezers = (plan.freezers || []).filter(f => f.t0 < plan.end).map(f => ({ ...f, next: f.t0 }));   // (S-7: the derelict's freezer draws from our capacitor)
  // where energy is wanted now: fights waiting at their cannon's capacitor, the jump at MID, the freezer's capacitor running dry
  const wanted = (t) => {
    if (jump.t <= t && !jump.done) return 1;
    const w = fights.find(f => f.waitFrom !== null);
    if (w) return CAPI[w.gun];
    const fz = freezers.find(f => f.next < f.t1 && t >= f.t0 - 5 && G.CAPACITORS[f.cap].charge < 1);
    if (fz) return fz.cap;
    if (Number.isFinite(jump.t) && t >= jump.t - prepFor && (prep || G.CAPACITORS[1].charge < 1)) { prep = true; return 1; }   // MID ready for the jump (then it stays there)
    return null;
  };
  const nextNeed = (cap, t) => {                                    // (best case) when this capacitor is drawn on next
    let at = Infinity;
    for (const f of fights) if (f.left > 0 && CAPI[f.gun] === cap) { at = Math.min(at, Math.max(t, f.next)); break; }
    for (const s of shields) if (!s.done && CAPI[s.side] === cap) { at = Math.min(at, s.t); break; }
    if (cap === 1 && !jump.done) at = Math.min(at, jump.t);
    for (const f of freezers) if (f.cap === cap && f.next < f.t1) at = Math.min(at, Math.max(t, f.next));
    return at;
  };
  for (let t = 0; t <= horizon + dt; t += dt) {
    // the lever
    const want = wanted(t);
    if (mode === 'best') {
      let to = want;
      if (to === null) { let bestAt = Infinity; for (const c of [0, 1, 2]) if (G.CAPACITORS[c].charge < build.energy.capMax) { const a = nextNeed(c, t); if (a < bestAt) { bestAt = a; to = c; } } }
      if (to !== null) { P.lever.pos = to; P.lever.jammed = true; } else P.lever.jammed = false;
    } else if (mode === 'real' && !jump.done) {
      const pinned = P.lever.jammed ? P.lever.pos : null, goal = want;
      if (leverJob && t >= leverJob.at) { if (leverJob.to === null) P.lever.jammed = false; else { P.lever.pos = leverJob.to; P.lever.jammed = true; } leverJob = null; }
      else if (!leverJob && goal !== pinned && (goal !== null || pinned !== null)) { leverJob = { at: t + trip, to: goal }; leverTrips++; }
      else if (leverJob && leverJob.to !== goal && goal !== null) leverJob.to = goal;   // (on the way: change of plan)
    }
    // fuel: someone fetches the next cell (instantly in the best case; the inserter does it by itself)
    if (P.reactor.fuel <= 0 && P.reserve > 0 && !P.inserter) {
      if (emptyAt === null) emptyAt = t;
      if (mode === 'best' || t >= emptyAt + refuelDelay) { P.reserve--; P.reactor.fuel = G.CELL_ENERGY; P.reactor.t = 0; refuels++; emptyAt = null; }
    }
    // scrams (a late coolant fix), the ion storm, barnacles draining a capacitor
    while (scrams.length && scrams[0][0] <= t) { const [a, b] = scrams.shift(); G.enc.scram = Math.max(G.enc.scram, b - a); }
    while (storms.length && storms[0] <= t) { storms.shift(); G.startStorm(); }
    for (const d of drains) {
      if (!d.on && t >= d.from && t < d.until) {
        d.on = true;
        for (let i = 0; i < d.count; i++) { const [x, y] = G.HULL_SPOTS[d.side][(i + 1) % G.HULL_SPOTS[d.side].length], uid = G.newUid(); d.uids.push(uid); G.evs.barnacles.push({ uid, side: d.side, x, y, age: G.BARNACLE_GROW, drain: 0, hp: 2 }); }
      }
      if (d.on && t >= d.until) { d.on = false; G.evs.barnacles = G.evs.barnacles.filter(b => !d.uids.includes(b.uid)); }
    }
    for (const b of G.evs.barnacles) b.age = Math.min(b.age, G.BARNACLE_DRILL - 1);   // (they'd drill through: the repair side of it is the scheduler's)
    // the crew's plan: cannon fights (one at a time per cannon), shields, the jump
    for (const id of ['port', 'front', 'star']) {
      const f = fights.find(q => q.gun === id && q.left > 0 && q.t0 <= t);
      if (!f || t < f.next) continue;
      const g = gun(id), cap = CAPI[id];
      if (g.reload > 0) continue;                                    // reloading
      if (g.shots > 0) {
        if (f.waitFrom !== null) { f.waited += t - f.waitFrom; waits.push({ key: f.key, side: id, t: f.waitFrom, wait: t - f.waitFrom }); f.waitFrom = null; }
        if (g.cd > 0) continue;
        G.fireCannon(g); f.left--; f.next = t + f.span / f.shots;
      } else if (!(cap === 1 && Number.isFinite(jump.t) && !jump.done && t >= jump.t - prepFor && G.CAPACITORS[1].charge <= 1) && G.reloadCannon(g)) { used[cap]++; g.reload = Math.min(g.reload, reloadTime()); }   // (the last energy in MID is kept for the jump)
      else if (f.waitFrom === null) f.waitFrom = t;                    // no energy at its capacitor: the fight waits
    }
    for (const s of shields) {
      if (s.done || t < s.t) continue;
      const c = G.CAPACITORS[CAPI[s.side]].charge, r = G.pressShield(s.side);
      if (r === true) { used[CAPI[s.side]]++; s.done = true; }
      else if (r === false && G.combat.shields[s.side].up > 0) s.done = true;   // already up
      else if (t > s.t + A.SHIELD_GRACE) { s.done = true; unmet.push({ side: s.side, t: s.t, why: r === false ? 'cooldown' : r }); }
    }
    if (!jump.done && t >= jump.t && G.CAPACITORS[1].charge > 0) { G.useEnergy(1); used[1]++; jump.done = t; }
    for (const f of freezers) while (f.next <= t && f.next < f.t1) {   // the freezer's draws; empty: it stops, the cold retreats (the job waits)
      if (G.useEnergy(f.cap)) used[f.cap]++; else fzWaits.push({ key: f.key, wait: f.every / 2 });   // (the derelict job takes longer; not a cannon's wait)
      f.next += f.every;
    }
    // the game ticks (charges: what arrives, what the storm / barnacles take)
    const c0 = G.CAPACITORS.map(c => c.charge), f0 = P.reactor.fuel;
    G.updatePower(dt);
    const c1 = G.CAPACITORS.map(c => c.charge);
    if (P.reactor.fuel < f0 && c1.every((v, i) => v === c0[i])) { /* (in flight: counted when it lands) */ }
    for (let i = 0; i < 3; i++) if (c1[i] > c0[i]) got[i] += c1[i] - c0[i];
    G.updateCombat(dt);
    const c2 = G.CAPACITORS.map(c => c.charge);
    G.updateEncounters(dt); G.updateEva(dt);
    for (let i = 0; i < 3; i++) lost[i] += Math.max(0, c2[i] - G.CAPACITORS[i].charge);
  }
  for (const f of fights) if (f.waitFrom !== null) waits.push({ key: f.key, side: f.gun, t: f.waitFrom, wait: horizon - f.waitFrom, never: true });
  const waitByKey = {}; for (const w of [...waits, ...fzWaits]) waitByKey[w.key] = (waitByKey[w.key] || 0) + w.wait;
  const produced = got.reduce((s, v) => s + v, 0), demand = used.reduce((s, v) => s + v, 0) + unmet.length + (jump.done === null && Number.isFinite(jump.t) ? 1 : 0);
  const worst = waits.reduce((a, w) => (w.wait > (a?.wait || 0) ? w : a), null);
  const jumpOk = !Number.isFinite(jump.t) || (jump.done !== null && jump.done - jump.t <= plan.window);
  const stuck = [0, 0, 0]; for (const f of fights) if (f.waitFrom !== null) stuck[CAPI[f.gun]]++;   // (a fight still waiting at the end wanted one more)
  const perSide = ['port', 'mid', 'star'].map((name, i) => ({ name, need: used[i] + stuck[i] + unmet.filter(u => CAPI[u.side] === i).length + (i === 1 && jump.done === null && Number.isFinite(jump.t) ? 1 : 0), have: 1 + got[i], lost: lost[i] }));
  const ocFires = build.overcharge ? produced * G.OVERCHARGE_FIRE : 0;     // an overcharged reactor catches fire now and then
  return { mode, demand, supply: 3 + produced, produced, ocFires, jumpAt: plan.jumpAt, perSide, waits, waited: waits.reduce((s, w) => s + w.wait, 0), never: waits.filter(w => w.never).length,
           unmet, unmetShields: unmet.length, jumpOk, jumpWait: jump.done === null ? Infinity : jump.done - jump.t, worst, waitByKey, leverTrips, refuels,
           interval: G.ENERGY_TIME / G.reactorSpeed(), cells: build.energy.cells + (plan.bonusCells || 0) };
}
function verdictOf(r) {
  const why = [], maxD = r.maxDamage || game().MAX_DAMAGE;
  if (r.peak > maxD) why.push(`~${r.peak.toFixed(1)} problems open at once (more than ${maxD} broken loses)`);
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
// Energy with perfect routing and instant refuelling: if it still runs short, no crew can fix it.
function bestOf(r) {
  const b = r.best;
  if (!b.jumpOk) return 'impossible';
  if (b.unmet.length || b.waited > A.BEST_WAIT) return 'short';
  return 'ok';
}
function scoreOf(r) {
  const S = A.SCORE, maxD = r.maxDamage || game().MAX_DAMAGE;
  const energy = Math.min(1.5, r.energy.demand / Math.max(1, r.energy.supply)) + Math.min(0.5, r.energy.waited / 60);
  return Math.round(S.load * Math.min(1.5, r.load) + S.open * Math.min(1.5, r.peak / maxD) + S.energy * energy + S.late * Math.min(1.5, r.late / Math.max(1, r.events)));
}

// In spec: the energy run (game code) has no shortfall — every reload, shield and the jump got its energy
// on the right side in time (waits up to A.SPEC_WAIT: an energy takes 0.9 s down the line).
function specOf(e) {
  const waits = e.waits.filter(w => w.t < e.jumpAt - A.SPEC_FINALE && Math.min(w.wait, e.jumpAt - w.t) > A.SPEC_WAIT);   // (after the jump nothing matters)
  const ok = !waits.length && !e.unmet.length && e.jumpOk;
  const first = [...waits.map(w => ({ t: w.t, text: `${w.side} cannon waits ${w.wait.toFixed(0)} s at ${w.t.toFixed(0)} s${w.never ? ' (never served)' : ''}` })),
                 ...e.unmet.map(u => ({ t: u.t, text: `${u.side} shield without energy at ${u.t.toFixed(0)} s` })),
                 ...(e.jumpOk ? [] : [{ t: Infinity, text: 'no energy in MID for the jump' }])].sort((a, b) => a.t - b.t)[0];
  return { ok, why: first?.text || '' };
}

// ===========================================================================
// Running it
// ===========================================================================
// opts.kit: undefined = the expected kit (expectedKit), null = none (the old model); opts.kitShip false: not its upgrades
const kitOf = (id, opts) => (opts.kit === undefined ? expectedKit(id) : opts.kit);
const shipOf = (id, opts) => {
  const kit = kitOf(id, opts), ids = [...(opts.prereq !== false ? game().MISSIONS[id].needs?.ship || [] : []), ...(kit && opts.kitShip !== false ? kit.ship : [])];
  return { ...Object.fromEntries(ids.map(u => [u, true])), ...(opts.ship || {}) };
};
function runOne(id, n, k, opts = {}) {
  const over = opts.over ? opts.over(id, n) : {};
  const b = setup(id, n, shipOf(id, opts), A.SEED + k * 101 + n, over, opts.patch);
  const keep = KIT; KIT = kitEffects(kitOf(id, opts), b.ship);
  let r;
  try { r = seeded(A.SEED + k, () => simulate(b)); r.maxDamage = KIT?.maxDamage; } finally { KIT = keep; }
  Object.assign(r, verdictOf(r)); r.score = scoreOf(r); r.bestVerdict = bestOf(r);
  r.spec = specOf(r.energy); r.bestSpec = specOf(r.best); r.events = b.events.length; r.cells = b.energy.cells; r.overcharge = b.overcharge; r.ship = b.ship;
  return r;
}
function balance(opts = {}) {
  if (opts.hit) A.HIT_RATE = opts.hit;
  const g = game();
  const ids = opts.missions || [...SKIRMISH_ORDER.filter(id => g.MISSIONS[id]), ...g.CAMPAIGN];
  const players = opts.players || PLAYERS, runs = opts.runs || A.RUNS;
  const out = [];
  for (const id of ids) for (const n of players) {
    const rs = []; for (let k = 0; k < runs; k++) rs.push(runOne(id, n, k, opts));
    out.push(summarize(id, n, rs));
  }
  return out;
}
function summarize(id, n, rs) {
  const g = game(), order = ['doable', 'tight', 'impossible'], med = (f) => { const v = rs.map(f).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const mean = (f) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
  const counts = Object.fromEntries(order.map(v => [v, rs.filter(r => r.verdict === v).length]));
  const verdict = order[rs.map(r => order.indexOf(r.verdict)).sort((a, b) => a - b)[Math.floor(rs.length / 2)]];
  const worst = order[Math.max(...rs.map(r => order.indexOf(r.verdict)))];
  const bests = ['ok', 'short', 'impossible'], best = bests[Math.max(...rs.map(r => bests.indexOf(r.bestVerdict)))];
  const whyMap = {}; for (const r of rs) for (const w of r.why) { const key = w.replace(/[\d.~]+/g, '#'); whyMap[key] = whyMap[key] || w; }
  const worstWait = rs.map(r => r.energy.worst).filter(Boolean).sort((a, b) => b.wait - a.wait)[0] || null;
  const side = (i) => ({ need: mean(r => r.energy.perSide[i].need), have: mean(r => r.energy.perSide[i].have) });
  const specFail = rs.find(r => !r.spec.ok), bestFail = rs.find(r => !r.bestSpec.ok);
  return { id, n, aim: targetIdle(id, n), name: g.MISSIONS[id].name, campaign: g.MISSIONS[id].campaign || 0, tier: g.MISSIONS[id].tier || 0, runs: rs.length, verdict, worst, counts, best,
           score: med(r => r.score), length: med(r => r.end), load: mean(r => r.load), idle: mean(r => r.idle), peak: med(r => r.peak), late: med(r => r.late),
           radar: mean(r => r.radarShare), lever: mean(r => r.leverShare), fuel: mean(r => r.fuelShare),
           energyNeed: med(r => r.energy.demand), energySupply: med(r => r.energy.supply), waited: med(r => r.energy.waited), bestWaited: med(r => r.best.waited),
           sides: [side(0), side(1), side(2)], worstWait, unmet: mean(r => r.energy.unmetShields), factor: rs[0].factor, events: rs[0].events, cells: rs[0].cells,
           overcharge: rs[0].overcharge, ship: rs[0].ship, inSpec: !specFail, specWhy: specFail?.spec.why || '', bestInSpec: !bestFail, bestWhy: bestFail?.bestSpec.why || '',
           interval: rs[0].energy.interval, why: Object.values(whyMap).slice(0, 3), sample: rs[0] };
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

// ===========================================================================
// --calibrate: per mission and crew size, the number of encounters (for targetIdle(id, n) idle crew time in
// a mission of MISSION_LENGTH) and the fuel cells (exactly what the energy needs, + A.FUEL_MARGIN); then
// the prerequisites if the energy isn't in spec: energy ship upgrades the player can have by then (the
// rep the campaign has paid before that mission), and only then reactor overcharge.
// ===========================================================================
const ENERGY_UPGRADES = ['cannons', 'inserter', 'caps'];         // (the spare cell doesn't help: the fuel follows the need)
const EARLY = ['intro', 'practice', 'c1', 'c2'];                 // must be in spec on the base ship, no gear
// Rep a player has when a mission unlocks: what the campaign paid before it (rewards.rep + 1 for the first clear).
function repBy(id) {
  const g = game(), unlockAfter = { salvage: 'c3', ore: 'c3', pirates: 'c4', rescue: 'c5', deep: 'c6', nightmare: 'c7' };
  const upTo = g.MISSIONS[id].campaign ? g.MISSIONS[id].campaign - 1 : unlockAfter[id] ? g.CAMPAIGN.indexOf(unlockAfter[id]) + 1 : 0;
  return g.CAMPAIGN.slice(0, upTo).reduce((s, c) => s + (g.MISSIONS[c].rewards?.rep || 0) + 1, 0);
}
function upgradeSets(id) {                                       // cheapest first, within the rep the player has by then
  const g = game(), cost = (u) => g.SHIP_UPGRADES.find(x => x.id === u).rep, budget = repBy(id), sets = [[]];
  for (const u of ENERGY_UPGRADES) for (const s0 of [...sets]) sets.push([...s0, u]);
  return sets.map(set => ({ set, rep: set.reduce((s, u) => s + cost(u), 0) })).filter(x => x.rep <= budget).sort((a, b) => a.rep - b.rep || a.set.length - b.set.length);
}
let FIT_KIT = null;                               // the kit fitMission calibrates with (its ship upgrades come in `ship`)
const evalAt = (id, n, over, ship, runs) => { const rs = []; for (let k = 0; k < runs; k++) rs.push(runOne(id, n, k, { over: () => over, ship, prereq: false, kit: FIT_KIT, kitShip: false })); return rs; };
const meanIdle = (rs) => rs.reduce((s, r) => s + r.idle, 0) / rs.length;
// The event count for ~target idle (idle falls as events are added): binary search between the
// essential minimum and twice the written list.
function fitEvents(id, n, ship, oc, runs, minK = 1) {
  const aim = targetIdle(id, n), g = game(), M = g.MISSIONS[id], wrote = M.build(null).length, ess = new Set(['derelict', 'rock', 'brig', 'leviathan', 'leviathan_boss', ...(M.essential || []), ...(M.always || [])]);
  const min = Math.max(minK, 1, M.build(null).filter(e => ess.has(e.kind) || e.opener).length), max = Math.max(2 * wrote, wrote + 16);
  const at = (k) => meanIdle(evalAt(id, n, { events: k, cells: A.AMPLE_CELLS, overcharge: oc, reactor: 1 }, ship, runs));
  let lo = min, hi = max, vLo = at(lo);
  if (vLo <= aim) return { events: lo, idle: vLo, short: true };   // even the essentials keep the crew busier than that
  let vHi = at(hi);
  if (vHi >= aim) return { events: hi, idle: vHi, long: true };
  while (hi - lo > 1) { const m = (lo + hi) >> 1, v = at(m); if (v >= aim) { lo = m; vLo = v; } else { hi = m; vHi = v; } }
  return Math.abs(vLo - aim) <= Math.abs(vHi - aim) ? { events: lo, idle: vLo } : { events: hi, idle: vHi };
}
// Fuel cells: the fewest that do as well as plenty (same waits, shields, jump), plus A.FUEL_MARGIN.
function fitCells(id, n, ship, oc, events, runs, reactor = 1) {
  const ample = evalAt(id, n, { events, cells: A.AMPLE_CELLS, overcharge: oc, reactor }, ship, runs);
  const score = (rs) => rs.map(r => [r.energy.waited, r.energy.unmet.length, r.energy.jumpOk]);
  const target = score(ample);
  const lo = Math.max(1, Math.ceil(Math.min(...ample.map(r => r.energy.produced)) / game().CELL_ENERGY) - 1);
  for (let c = lo; c < A.AMPLE_CELLS; c++) {
    const rs = evalAt(id, n, { events, cells: c, overcharge: oc, reactor }, ship, runs);
    if (score(rs).every(([w, u, j], i) => w <= target[i][0] + 0.5 && u <= target[i][1] && (j || !target[i][2]))) return c + A.FUEL_MARGIN;
  }
  return A.AMPLE_CELLS;
}
function fitMission(id, opts = {}) {
  const keep = FIT_KIT; FIT_KIT = kitOf(id, opts);
  try { return FIT_KIT ? fitWithKit(id, opts) : fitBase(id, opts); } finally { FIT_KIT = keep; }
}
// The event counts and cells per crew size for one ship / overcharge setting (see fitBase / fitWithKit).
function fitAllFor(id, ship, oc, runs, log) {
  const ns = [1, 2, 3, 4, 5, 6, 7, 8], per = {};
  for (const n of ns) {
    const minK = per[n - 1]?.events || 1;                         // (a bigger crew never gets fewer events)
    const ev = fitEvents(id, n, ship, oc, runs, minK), aim = targetIdle(id, n);
    let pick = null;
    const tried = [];
    const tryIt = (k, reactor) => {
      const cells = fitCells(id, n, ship, oc, k, runs, reactor), rs = evalAt(id, n, { events: k, cells, overcharge: oc, reactor }, ship, runs);
      return { events: k, cells, reactor, idle: meanIdle(rs), spec: rs.every(r => r.spec.ok), bestSpec: rs.every(r => r.bestSpec.ok), why: rs.find(r => !r.spec.ok)?.spec.why || '' };
    };
    for (const d of [0, -1, 1, -2, 2]) {
      const k = ev.events + d;
      if (k < minK) continue;
      const p = tryIt(k, 1);
      tried.push(p);
      if (!pick) pick = p;
      if (p.spec && Math.abs(p.idle - aim) <= A.SPEC_IDLE_SLACK) { pick = p; break; }
    }
    if (!pick.spec) {
      const ks = EARLY.includes(id) ? [0, -1, 1, -2, 2].map(d => ev.events + d).filter(k => k >= minK) : [ev.events];
      let best = null;
      for (const r of EARLY.includes(id) ? A.REACTOR_STEPS_EARLY : A.REACTOR_STEPS) {
        for (const k of ks) { const p = tryIt(k, r); if (p.spec && (!best || Math.abs(p.idle - aim) < Math.abs(best.idle - aim))) best = p; }
        if (best && Math.abs(best.idle - aim) <= A.SPEC_IDLE_SLACK) break;
      }
      if (best) pick = best;
    }
    // out of spec and more than A.SPEC_IDLE_SLACK off the aim too: a neighbouring count in spec, however far off, beats it
    // (solo, one encounter more or less is 15-40 points: c7 / Deep drift solo, 2 encounters 26 % / 18 % and out of spec, 1: 63 %)
    if (!pick.spec && Math.abs(pick.idle - aim) > A.SPEC_IDLE_SLACK) { const ok = tried.filter(p => p.spec).sort((a, b) => Math.abs(a.idle - aim) - Math.abs(b.idle - aim))[0]; if (ok) pick = ok; }
    per[n] = { ...pick, aim };
    log(`  ${id} ×${n}: ${per[n].events} events, ${per[n].cells} cells,${per[n].reactor !== 1 ? ` reactor ×${per[n].reactor},` : ''} idle ${Math.round(per[n].idle * 100)}%, ${per[n].spec ? 'in spec' : 'out of spec: ' + per[n].why}${oc ? ' (overcharged)' : ''}${Object.keys(ship).length ? ' [' + Object.keys(ship).join(', ') + ']' : ''}`);
  }
  return per;
}
// With the expected kit: fitted on the kit's ship (without the spare cell: the cells written must do without it)
// and its overcharge (the mission's needs); out of spec for 1-4: more energy upgrades (cheapest first, within the
// reputation by then) on top, then overcharge. The needs stay what they were plus what that adds.
function fitWithKit(id, opts) {
  const runs = opts.runs || A.CAL_RUNS, log = opts.log || (() => {}), kit = FIT_KIT, N = game().MISSIONS[id].needs || {};
  const shipObj = (set) => Object.fromEntries(set.map(u => [u, true])), main = [1, 2, 3, 4], inSpec = (per) => main.every(n => per[n].spec);
  const base = kit.ship.filter(u => u !== 'spareCell');
  log(`  ${id}: kit ${kitText(id)}`);
  let oc = kit.overcharge, ship = base, per = fitAllFor(id, shipObj(ship), oc, runs, log);
  const why = main.filter(n => !per[n].spec).map(n => `×${n}: ${per[n].why}`).join('; ');
  let added = [];
  if (!inSpec(per) && !EARLY.includes(id)) {
    let found = null;
    for (const { set } of upgradeSets(id).filter(x => x.set.some(u => !base.includes(u)))) {
      const s2 = shipObj([...base, ...set]);
      const ok = main.every(n => { const ev = per[n]; return evalAt(id, n, { events: ev.events, cells: ev.cells, overcharge: oc, reactor: ev.reactor }, s2, runs).every(r => r.spec.ok); });
      log(`  ${id}: with ${set.join(' + ')} on top of the kit: ${ok ? 'in spec' : 'still short'}`);
      if (ok) { found = set.filter(u => !base.includes(u)); break; }
    }
    if (found) { added = found; ship = [...base, ...found]; per = fitAllFor(id, shipObj(ship), oc, runs, log); }
    else if (!oc) {
      const best = upgradeSets(id).reduce((a, x) => (x.set.length > a.length ? x.set : a), []);
      added = best.filter(u => !base.includes(u)); ship = [...base, ...added]; oc = true;
      per = fitAllFor(id, shipObj(ship), oc, runs, log);
    }
    if (!inSpec(per)) log(`  ${id}: still out of spec with the kit${added.length ? ' + ' + added.join(' + ') : ''}${oc ? ' + overcharge' : ''}`);
  }
  const needs = { ship: [...new Set([...(N.ship || []), ...added])], overcharge: !!(N.overcharge || oc) };
  return { id, per, needs, baseWhy: why ? `kit before new prerequisites: ${why}` : '', added, kit: kitText(id) };
}
function fitBase(id, opts = {}) {
  const runs = opts.runs || A.CAL_RUNS, ns = [1, 2, 3, 4, 5, 6, 7, 8], log = opts.log || (() => {});
  const fitAll = (ship, oc) => {
    const per = {};
    for (const n of ns) {
      const minK = per[n - 1]?.events || 1;                       // (a bigger crew never gets fewer events)
      const ev = fitEvents(id, n, ship, oc, runs, minK), aim = targetIdle(id, n);
      // out of spec at that count: a neighbouring count that is in spec (within A.SPEC_IDLE_SLACK idle) is better
      let pick = null;
      const tryIt = (k, reactor) => {
        const cells = fitCells(id, n, ship, oc, k, runs, reactor), rs = evalAt(id, n, { events: k, cells, overcharge: oc, reactor }, ship, runs);
        return { events: k, cells, reactor, idle: meanIdle(rs), spec: rs.every(r => r.spec.ok), bestSpec: rs.every(r => r.bestSpec.ok), why: rs.find(r => !r.spec.ok)?.spec.why || '' };
      };
      for (const d of [0, -1, 1, -2, 2]) {
        const k = ev.events + d;
        if (k < minK) continue;
        const p = tryIt(k, 1);
        if (!pick) pick = p;
        if (p.spec && Math.abs(p.idle - aim) <= A.SPEC_IDLE_SLACK) { pick = p; break; }
      }
      // still short: a faster reactor (within reason; further, and at the neighbouring counts too, for the early missions)
      if (!pick.spec) {
        const ks = EARLY.includes(id) ? [0, -1, 1, -2, 2].map(d => ev.events + d).filter(k => k >= minK) : [ev.events];
        let best = null;
        for (const r of EARLY.includes(id) ? A.REACTOR_STEPS_EARLY : A.REACTOR_STEPS) {   // (the mildest step that gets near the aim; else the nearest of all)
          for (const k of ks) { const p = tryIt(k, r); if (p.spec && (!best || Math.abs(p.idle - aim) < Math.abs(best.idle - aim))) best = p; }
          if (best && Math.abs(best.idle - aim) <= A.SPEC_IDLE_SLACK) break;
        }
        if (best) pick = best;
      }
      per[n] = { ...pick, aim };
      log(`  ${id} ×${n}: ${per[n].events} events, ${per[n].cells} cells,${per[n].reactor !== 1 ? ` reactor ×${per[n].reactor},` : ''} idle ${Math.round(per[n].idle * 100)}%, ${per[n].spec ? 'in spec' : 'out of spec: ' + per[n].why}${oc ? ' (overcharged)' : ''}${Object.keys(ship).length ? ' [' + Object.keys(ship).join(', ') + ']' : ''}`);
    }
    return per;
  };
  const shipObj = (set) => Object.fromEntries(set.map(u => [u, true]));
  const main = [1, 2, 3, 4], inSpec = (per) => main.every(n => per[n].spec);
  let per = fitAll([], false), needs = { ship: [], overcharge: false }, why = main.filter(n => !per[n].spec).map(n => `×${n}: ${per[n].why}`).join('; ');
  if (!inSpec(per) && !EARLY.includes(id)) {
    let found = null;
    for (const { set } of upgradeSets(id).filter(x => x.set.length)) {
      const ok = main.every(n => { const ev = per[n]; const rs = evalAt(id, n, { events: ev.events, cells: ev.cells, overcharge: false, reactor: ev.reactor }, shipObj(set), runs); return rs.every(r => r.spec.ok); });
      log(`  ${id}: with ${set.join(' + ')}: ${ok ? 'in spec' : 'still short'}`);
      if (ok) { found = set; break; }
    }
    if (found) { needs.ship = found; per = fitAll(shipObj(found), false); }
    else {
      const all = upgradeSets(id).slice(-1)[0]?.set || [];
      const best = upgradeSets(id).reduce((a, x) => (x.set.length > a.length ? x.set : a), []);
      const ship = shipObj(best);
      per = fitAll(ship, true); needs = { ship: best, overcharge: true };
      if (!inSpec(per)) log(`  ${id}: still out of spec with ${[...best, 'overcharge'].join(' + ')}`);
    }
  }
  return { id, per, needs, baseWhy: why ? 'base ship: ' + why : '' };
}
function calibrateAll(opts = {}) {
  const g = game(), ids = opts.missions || [...SKIRMISH_ORDER.filter(id => g.MISSIONS[id]), ...g.CAMPAIGN];
  return ids.map(id => fitMission(id, opts));
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
    else if (args[i] === '--calibrate') opts.fit = true;
    else if (args[i] === '--target') A.TARGET_IDLE = A.TARGET_IDLE_CREW = +args[++i];
    else if (args[i] === '--base') opts.prereq = false;          // ignore the missions' prerequisites (base ship)
    else if (args[i] === '--kit') { if (args[++i] === 'none') opts.kit = null; }   // --kit none: no gear / bought upgrades (the old model)
    else ids.push(args[i]);
  }
  if (opts.hit) A.HIT_RATE = opts.hit;
  const g = game();
  if (ids.length) opts.missions = ids;
  if (opts.detail) {
    const [id, n] = opts.detail, r = runOne(id, n, 0, opts), b = setup(id, n, shipOf(id, opts), A.SEED + n);
    console.log(`kit: ${opts.kit === null ? 'none (--kit none)' : kitText(id)}`);
    console.log(`${g.MISSIONS[id].name}, ${n} player(s): ${b.events.length} events every ${b.gap?.toFixed(0)} s, jump at ${b.jumpAt.toFixed(0)} s; energy every ${r.energy.interval.toFixed(1)} s, ${r.cells} cells${b.overcharge ? ', reactor overcharged' : ''}${Object.keys(b.ship).length ? `, ship: ${Object.keys(b.ship).join(', ')}` : ''}`);
    console.log('events: ' + b.events.map(e => `${e.kind}@${e.t.toFixed(0)}`).join(', '));
    for (const j of r.done.sort((a, b) => a.start - b.start)) console.log(`  P${j.who + 1} ${j.start.toFixed(0).padStart(4)}–${j.finish.toFixed(0).padStart(4)} s  ${j.label}${j.release !== undefined ? ` (from ${j.release.toFixed(0)})` : ''}`);
    const E = r.energy;
    console.log(`energy (game code): ${E.perSide.map(s => `${s.name} ${s.need}/${s.have}`).join(', ')} needed/delivered; lever re-routed ${E.leverTrips}×, ${E.refuels} cells fetched; waits ${E.waits.map(w => `${w.side} ${w.t.toFixed(0)} s +${w.wait.toFixed(1)} s`).join(', ') || 'none'}; shields without energy ${E.unmet.map(u => `${u.side} ${u.t.toFixed(0)} s`).join(', ') || 'none'}; jump ${E.jumpOk ? 'ok' : 'NO ENERGY'} → ${r.spec.ok ? 'in spec' : 'out of spec: ' + r.spec.why}`);
    console.log(`perfect routing: ${r.bestSpec.ok ? 'in spec' : 'out of spec: ' + r.bestSpec.why}`);
    console.log(`crew ${Math.round(r.load * 100)}% busy (radar ${Math.round(r.radarShare * 100)}%, lever ${Math.round(r.leverShare * 100)}%, fuel ${Math.round(r.fuelShare * 100)}%), peak ${r.peak.toFixed(1)} open → ${r.verdict} (${r.score}) ${r.why.join('; ')}`);
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
  if (opts.fit) {
    console.log(`Calibrating: events and fuel cells per crew size for ${(A.TARGET_IDLE * 100).toFixed(1)}% idle solo / ${(A.TARGET_IDLE_CREW * 100).toFixed(1)}% for 2-8 on the first mission, −${(A.TARGET_RAMP * 100).toFixed(1)} points per step in the progression, in ${g.MISSION_LENGTH} s, then the energy prerequisites (hit rate ${A.HIT_RATE}, ${A.CAL_RUNS} builds each)...`);
    console.log(opts.kit === null ? 'Without the kit (--kit none): the base ship plus prerequisites, no gear.' : 'With the expected kit (expectedKit: what a first-time campaign run affords by then; --kit none: without).');
    const fits = calibrateAll({ ...opts, log: (s) => console.log(s) });
    console.log('\nPaste into the mission definitions (MISSIONS[id].crew / .needs):');
    for (const f of fits) {
      const ns = [1, 2, 3, 4, 5, 6, 7, 8], P = f.per;
      const crew = { events: ns.map(n => P[n].events), cells: ns.map(n => P[n].cells) };
      if (ns.some(n => P[n].reactor !== 1)) crew.reactor = ns.map(n => P[n].reactor);
      if (f.needs.overcharge) crew.overcharge = ns.map(() => true);
      const needs = f.needs.ship.length || f.needs.overcharge ? `, needs: ${JSON.stringify(f.needs).replace(/"(\w+)":/g, '$1: ').replace(/"/g, "'")}` : '';
      console.log(`  ${f.id}: crew: ${JSON.stringify(crew).replace(/"(\w+)":/g, '$1: ')}${needs}   // --calibrate${f.kit ? ' (expected kit)' : ''}: ${ns.map(n => `${Math.round(P[n].idle * 100)}%`).join(' ')} idle for 1-8 players (aim ${(P[1].aim * 100).toFixed(1)}% solo, ${(P[2].aim * 100).toFixed(1)}% for 2-8)${[1, 2, 3, 4].some(n => !P[n].spec) ? '; OUT OF SPEC: ' + [1, 2, 3, 4].filter(n => !P[n].spec).map(n => `×${n} ${P[n].why}`).join('; ') : ''}${f.baseWhy ? '; ' + f.baseWhy : ''}`);
    }
    return;
  }
  console.log(`Assumptions: hit rate ${A.HIT_RATE}, ${A.AIM_TIME} s per shot, reaction ${A.REACT} s, ${opts.runs || A.RUNS} random builds each (top of tools/balance.js).`);
  console.log(`Missions last ${g.MISSION_LENGTH} s to the jump; the crew size sets the number of encounters; the reactor follows the gaps; capacitors hold ${g.CAP_MAX}, ${g.SHOTS_PER_ENERGY} shots per energy (base ship).\n`);
  const rows = balance(opts);
  if (opts.kit === null) console.log('Kit: none (--kit none): the base ship plus each mission\'s prerequisites, no gear.\n');
  else {
    console.log('Kit (the default; --kit none: without): what a first-time campaign run can afford by then (expectedKit), every player:');
    for (const id of [...new Set(rows.map(r => r.id))]) console.log(`  ${g.MISSIONS[id].name.padEnd(22)} ${kitText(id)}`);
    console.log('');
  }
  printRows(rows);
  for (const n of [...new Set(rows.map(r => r.n))]) {
    const rank = rows.filter(r => r.n === n).sort((a, b) => a.score - b.score);
    console.log(`\nRanking, ${n} player(s), easiest first: ` + rank.map(r => `${r.name} ${r.score}`).join(' < '));
    const flags = campaignCheck(rows, n);
    if (flags.length) console.log('  campaign: ' + flags.join('; '));
  }
}
function printRows(rows) {
  const pad = (s, w) => String(s).padEnd(w), num = (v, w, d = 0) => (typeof v === 'number' ? v.toFixed(d) : v).padStart(w);
  console.log(pad('mission', 22) + pad('n', 3) + num('ev', 4) + num('jump', 6) + num('e/s', 6) + num('cells', 6) + num('idle', 6) + num('aim', 6) + '  ' + pad('energy L / M / R need/have', 27) + pad('spec (real/perfect)', 21) + num('open', 5) + '  ' + pad('verdict', 11) + num('score', 6) + '  first shortfall / why');
  for (const r of rows) console.log(pad(r.name, 22) + pad(r.n, 3) + num(r.events, 4) + num(r.length, 6) + num(r.interval, 6, 1) + num(r.cells, 6) + num(`${Math.round(r.idle * 100)}%`, 6) + num(`${(r.aim * 100).toFixed(1)}`, 6) + '  '
    + pad(r.sides.map(s => `${s.need.toFixed(1)}/${s.have.toFixed(1)}`).join('  '), 27) + pad(`${r.inSpec ? 'in' : 'OUT'} / ${r.bestInSpec ? 'in' : 'OUT'}${r.overcharge ? ' OC' : ''}`, 21) + num(r.peak, 5, 1) + '  ' + pad(r.verdict + (r.worst !== r.verdict ? '*' : ''), 11) + num(r.score, 6) + '  ' + [r.specWhy, ...r.why].filter(Boolean).join('; '));
}
if (require.main === module) main();

module.exports = { balance, runOne, expectedKit, kitEffects, kitText, hitCost, summarize, printRows, calibrateAll, fitMission, fitEvents, fitCells, specOf, repBy, upgradeSets, bestOf, campaignCheck, calibrate, simulate, schedule, energySim, setup, verdictOf, scoreOf, targetIdle, reloadTime, A, PLAYERS, PROGRESSION, H, T };
