// Progression: the campaign (story, briefings, objectives, rewards), ship upgrades bought with
// reputation, personal gear bought with money, professions (after chapter 1), and each player's saved
// profile (a cookie in their own browser).
//
//   Simulation side (browser and server): definitions, applyShipUpgrades(), applyKit(), perk(),
//   missionResults().
//   Browser side: the profile (load/save/migrate), rewards after a mission, the lobby UI, the
//   locker and the shipyard.
//
// PROFILES ARE SAVED IN PLAYERS' BROWSERS: keep loadProfile() able to read every older version
// (bump PROFILE_VERSION and add a migration step; never rename or drop fields without one).

const PROFILE_VERSION = 4;

// ---------------------------------------------------------------------------
// Ship upgrades (reputation) — one for (nearly) every system
// ---------------------------------------------------------------------------
const SHIP_UPGRADES = [
  { id: 'spareCell', name: 'Spare fuel cell', rep: 2, desc: 'One more spare fuel cell in the crate.' },
  { id: 'coffee', name: 'Proper coffee machine', rep: 2, desc: 'The kitchen coffee mug refills in 20 s instead of a minute.' },
  { id: 'inserter', name: 'Reactor fuel inserter', rep: 3, desc: 'Loads a fresh fuel cell into an empty reactor by itself (switch it off at the crate\'s handle).' },
  { id: 'cannons', name: 'Efficient cannons', rep: 3, desc: '4 shots per energy instead of 3.' },
  { id: 'airlocks', name: 'Faster airlock pumps', rep: 3, desc: 'The outer airlocks pump in 0.7 s instead of 1.3 s: quicker out on a spacewalk and back.' },   // (2026-10-21: was the deck airlocks, gone now; same id: it's in saves)
  { id: 'radar', name: 'Long-range radar', rep: 4, desc: 'The radar sees 60 s ahead instead of 45 s.' },
  { id: 'shields', name: 'Longer shields', rep: 4, desc: 'Shields stay up 18 s instead of 15 s.' },
  { id: 'caps', name: 'Bigger capacitors', rep: 5, desc: 'Capacitors hold 4 energy instead of 3.' },
  { id: 'hull', name: 'Reinforced hull', rep: 5, desc: 'The ship holds together with one more broken part (6 instead of 5).' },
  { id: 'sprinklers', name: 'Fire sprinklers', rep: 5, desc: 'Fires spread and burn parts out a third slower (22 s instead of 15 s).' },
  { id: 'doors', name: 'Fast door actuators', rep: 3, desc: 'The inner doors unbolt and slide open 40% faster: 0.6 s instead of 1 s until you can pass.' },   // (2026-10-24)
];
// A mission's prerequisites (MISSIONS[id].needs: { ship: [upgrade ids], overcharge }), as warning lines for
// the lobby: without them the energy isn't enough (tools/balance.js --calibrate). Not a hard block.
// With `ship` (the upgrades of the ship that will fly: the host's in multiplayer) each is marked ✔ or ✘.
function missionRequirements(id, ship = null) {
  const N = MISSIONS[id]?.needs, out = [];
  if (!N) return out;
  const names = (N.ship || []).filter(u => SHIP_UPGRADES.some(x => x.id === u))
    .map(u => SHIP_UPGRADES.find(x => x.id === u).name + (ship ? (ship[u] ? ' ✔' : ' ✘') : ''));
  if (names.length) out.push(`Recommended: ${names.join(', ')}`);
  if (N.overcharge) out.push('Recommended: an engineer with reactor overcharge');
  return out;
}
// ---------------------------------------------------------------------------
// Personal gear (money only; XP and levels are gone since 2026-10-17): general gear for anyone, and a
// track of gear per profession (a profession opens after chapter 1;
// only usable in that profession). One profession per profile, for good (Start over to choose again):
// with money tight (rewards) you specialize.
// ---------------------------------------------------------------------------
const GEAR = [
  { id: 'boots', name: 'Gravity boots', cost: 150, desc: 'Walk 15% faster, and keep walking where gravity fails.' },
  { id: 'thrusters', name: 'Suit thrusters', cost: 180, desc: 'Spacewalk 30% faster.' },
  { id: 'firstAid', name: 'First aid course', cost: 150, desc: 'Treat crewmates in 1.2 s instead of 2 s. Down yourself? A little faster: 8 s instead of 10 s (out cold: 16 s instead of 20 s). (A stim pack beats it.)' },
  { id: 'stim', name: 'Stim pack', cost: 250, desc: 'Down? Patch yourself up in 3 s (out cold: 6 s instead of 20 s).' },
  { id: 'ownKit', prof: 'engineer', name: 'Own repair kit', cost: 100, desc: 'Start every mission with your own repair kit (on top of the ship\'s).' },
  { id: 'toolbelt', prof: 'engineer', name: 'Toolbelt', cost: 200, desc: 'Repairs go another 25% faster.' },
  { id: 'overcharge', prof: 'engineer', name: 'Reactor overcharge', cost: 300, desc: 'Overcharge the reactor (at the reactor): double speed, 10% fire risk per energy.' },
  { id: 'ownLaser', prof: 'weapons', name: 'Own laser gun', cost: 120, desc: 'Start every mission with your own laser gun (on top of the ship\'s).' },
  { id: 'armor', prof: 'weapons', name: 'Armor vest', cost: 220, desc: 'Shrugs off the first hit you take each mission.' },   // (general gear before v4)
  { id: 'heavy', prof: 'weapons', name: 'Heavy blaster', cost: 300, desc: 'Start with a heavy blaster: harder hits, slower fire. Hold to charge a blast that hits like a cannon. Heavy: slows you down, a lot while charging.' },
];
const PROFESSIONS = [
  { id: 'engineer', name: 'Engineer', desc: 'Repairs 20% faster.' },
  { id: 'weapons', name: 'Weapons specialist', desc: 'Fires the laser gun and the heavy blaster 35% faster. Reloads cannons 50% faster.' },
];
const PAINTS = ['#c4683a', '#3a8fc4', '#5fb04a', '#c43a8f', '#c4b03a', '#8a5ac4', '#3ac4b0', '#e8e4dc', '#2b303a', '#ff7ab0'];
const PAINT_NAMES = ['Rust', 'Blue', 'Green', 'Magenta', 'Mustard', 'Purple', 'Teal', 'White', 'Black', 'Pink'];
// The halo round the chosen suit lamp in the menu: its own colour; black (no light of its own) gets a cool white one
const paintGlow = (c) => { const v = [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16) / 255); return 0.3 * v[0] + 0.55 * v[1] + 0.15 * v[2] > 0.25 ? c : '#c4d0ff'; };

// ---------------------------------------------------------------------------
// The campaign
// ---------------------------------------------------------------------------
const evAt = (kind, t, more = {}) => ({ t, kind, ...more });
const CAMPAIGN = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
Object.assign(MISSIONS, {
  c1: {
    name: '1 · First Contract', tier: 1, campaign: 1, rewards: { money: 120, perPirate: 16, rep: 1 },
    sides: { swarm: 'front' },               // (approved as built: its swarms, written and repeated, come from ahead)
    crew: {events: [3, 7, 10, 13, 16, 19, 22, 22], extra: {interceptor: [1, 0, 0, 0, 0, 0, 0, 0]}, cells: [4, 9, 14, 17, 22, 24, 27, 27], reactor: [0.7, 0.4, 0.3, 0.3, 0.2, 0.2, 0.2, 0.2]},   // --calibrate 2026-10-25 (crews: the solo idle + 5 points a player, each size idler than the one below): 18% 38% 43% 46% 49% 51% 53% 58% idle for 1-8 players
    // 2026-10-24 (solo playtest: one more encounter): solo a second pirate interceptor, crew.extra (a repeat on top of the 3 asked /
    // 4 played; 4 asked would play the same 4: the interceptor was already added as the finale fight, 5 would have been the asteroid
    // swarm, not the pirates' lanes): 5 played (×2 plays 6, two interceptors too). Cells / reactor refitted like --calibrate: ×0.85
    // left the port cannon waiting 6 s, so ×0.7 (the mildest in spec) and 4 cells (was 3): ~18% idle solo (was 32%), in spec
    essential: ['pirates'],                   // never dropped for a small crew (objective / story)
    always: ['maintenance'],                  // a part fails at every crew size, solo too (2026-10-16: the first chapters too easy solo)
    objective: { kind: 'raiders', count: 2 }, rules: {},
    blurb: 'Destroy two pirate raiders in the trade lanes. $16 per pirate.',
    briefing: 'Congratulations on your new (used) ship! The Manifold Novum is held together by duct tape, optimism and one very large cat.\n\nFirst job, from the Tollgate Trade Guild: pirate raiders are robbing freighters in the Kessler lanes. The job: destroy two raiders. Shoot them to scrap before they dock, or, if one docks, board it and jam its reactor: it blows up as it runs. The Guild pays $16 per pirate on top: raiders shot to scrap and boarders both count. A docked raider\'s crew comes over to steal. Make them regret it.\n\nTip: shoot the glowing blue bits.',
    build: () => [evAt('pirates', 30, { side: randSide() }), evAt('interceptor', 85, { side: randSide() }), evAt('pirates', 145, { side: randSide() }), evAt('swarm', 205, { side: 'front' }), evAt('maintenance', 255, { radar: false })],
  },
  c2: {
    name: '2 · Strange Cargo', tier: 1, campaign: 2, rewards: { money: 60, rep: 1 },
    sides: { swarm: 'front' },               // (approved as built: its swarms, written and repeated, come from ahead)
    // events set by hand (the user's playtest: two aliens + opener + frigate, clearly harder than the model's aim); cells and
    // reactor fitted for them like --calibrate does (fewest cells / mildest reactor in spec): ~36% 61% 66% 74% idle for 1-4 players.
    // 2026-10-16: + a failing part solo and for 2 (always; 4 / 5 events), the reactor for 2 back in spec at ×0.4 (was 0.3):
    // ~34% 59% 67% 75% idle for 1-4 players with the expected kit (boots); solo without them 2 of 8 builds wait at the finale
    crew: {events: [5, 8, 10, 13, 16, 19, 22, 25], cells: [3, 4, 5, 6, 6, 13, 7, 13], reactor: [0.3, 1, 1, 1, 1, 0.3, 1, 0.4]},   // --calibrate 2026-10-25 (crews: the solo idle + 5 points a player, each size idler than the one below): 16% 21% 33% 41% 50% 52% 56% 57% idle for 1-8 players
    // 2026-10-20 (solo playtest: one more encounter): solo 5 asked, 5 played (+ the mine drone; 4 asked would still play the same 4: the frigate
    // was already added as the finale fight), cells / reactor refitted like --calibrate and unchanged (3, ×0.3: the fewest in spec): ~10% idle solo (was 20%)
    essential: ['intruder'],
    always: ['maintenance'],                  // a part fails at every crew size, solo too (2026-10-16)
    finaleLead: 70,                           // the frigate finale comes 70 s before the jump (not 22): time for its heavy shots to matter
    // cover: what the objective reads (lobby, HUD) until the aliens show up, so it doesn't give them away (mission.js objectiveStatus).
    // 2026-10-17 (the user: "they should hatch out of the pods"): a delivery job of two sealed cargo pods (in the reactor room,
    // js/invader.js CARGO_PODS); the intruder event hatches them (pods: true) instead of bringing them in through the airlocks
    objective: { kind: 'intruder', count: 2, cover: 'Deliver the cargo pods to the Xenobiology Institute' }, rules: {},
    blurb: 'A delivery job: two sealed salvage pods for the Xenobiology Institute. Good money. Don\'t ask what\'s inside.',
    briefing: 'The Guild paid up — and has a delivery for us on top: two sealed salvage pods, picked up drifting at the edge of the Mire, for the Xenobiology Institute. Good money for a cargo run.\n\nThey\'re strapped down in the reactor room. Get them through the hot zone in one piece. They\'re warmer than cargo should be, and the manifest says only: DO NOT OPEN. If anything goes wrong back there: the security console locks doors, and the laser gun is in the right airlock room.',
    // solo: the opener (an asteroid swarm; 2026-10-16: no more interceptor half the time, no pirates on this run), the two
    // aliens (the objective: they hatch from the cargo pods, inside the ship: no radar contact), the frigate (the finale); bigger crews add the mine drone, the maintenance failure, a jammed
    // cannon and the antenna (DROP_ORDER), then repeats
    // 2026-10-24 (solo playtest: "make aliens break out later"): the pods burst at ~160 s (pin: the written time, ±10 s, js/mission.js
    // layoutMission; the shaped timeline had put them second, at ~75 s solo and 28 s with a crew), the rest shaped around them;
    // cells / reactor refitted like --calibrate and unchanged (solo 3, ×0.3): ~16% idle solo (was 14%), ×2 56% (55%), ×3 64%, ×4 47% (50%)
    build: () => [evAt('swarm', 50, { side: 'front', opener: true }), evAt('mines', 90, { side: randSide() }),
                  evAt('debris', 130, { gun: ['port', 'front', 'star'][Math.floor(Math.random() * 3)] }), evAt('intruder', 160, { side: randSide(), count: 2, pods: true, radar: false, pin: true }),
                  evAt('maintenance', 190, { radar: false }), evAt('antenna', 220, { radar: false }), evAt('frigate', 250, { side: randSide() })],
  },
  c3: {
    name: '3 · The Empty Lab', tier: 2, campaign: 3, rewards: { money: 80, rep: 2 },
    sides: { swarm: 'front' },               // (approved as built: its swarms, written and repeated, come from ahead)
    crew: {events: [5, 9, 13, 17, 20, 23, 24, 24], cells: [2, 7, 9, 11, 14, 15, 15, 15], reactor: [1, 1, 1, 1, 0.85, 0.85, 0.85, 0.85], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate 2026-10-25 (crews: the solo idle + 5 points a player, each size idler than the one below): 9% 28% 32% 35% 40% 42% 46% 50% idle for 1-8 players
    // 2026-10-20 (solo playtest: one more encounter): solo 5 asked, 5 played (+ the written second mine drone; 3 asked played 4: the swarm was
    // added as the finale fight, so 4 would change nothing), cells / reactor refitted like --calibrate and unchanged (2, ×1, overcharged): ~9% idle solo (was 15%)
    // and ×2 to 5 as well (it played 4: a smaller crew mustn't get more than a bigger one), still 3 cells, ~49% idle (model)
    needs: {ship: ['cannons'], overcharge: true},
    always: ['maintenance'],                  // a part fails at every crew size, solo too (2026-10-16)
    objective: { kind: 'blackbox' }, rules: { breach: true },
    blurb: 'Dr. Varga\'s lab went quiet. Bring back its black box.',
    briefing: 'The Institute wants to talk to the only expert on those things: Dr. Ilse Varga. Her research station went quiet a week ago.\n\nWhen you arrive, the lab module is drifting — dark, airless, its door jammed. We\'ll tether to it. Get inside, find the station\'s black box and carry it home (it\'s heavy). Watch the hull: big hits can tear holes in it now.\n\nAnd something in there is still alive. The station\'s freezer log has one line: KEEP S-7 FROZEN.',
    // a calm half minute, a mine drone the pirates left at the station (the opener; was an interceptor until 2026-10-16),
    // then the lab, then trouble on the way out
    build: () => [evAt('mines', 30, { side: randSide(), opener: true }), evAt('derelict', 70, { side: randSide() }), evAt('mines', 110, { side: randSide() }), evAt('swarm', 150, { side: 'front' }),
                  evAt('maintenance', 190, { radar: false }), evAt('flare', 230)],
  },
  c4: {
    name: '4 · Red Comet Cove', tier: 2, campaign: 4, rewards: { money: 80, perPirate: 20, rep: 2 },
    // (2026-10-16, asteroid swarms from the side + leeches past the shields: ×3 back in spec with cells / reactor only, the event counts kept)
    // (2026-10-17, 7 min instead of 6 by mistake (the 7 min were meant for chapter 5), then 5 min at the user's word: refitted with
    //  --calibrate (expected kit, 3 mines a drone) at 300 s; the same 5 encounters solo / ×2 (the least: the scout, two raiders, the
    //  failing part, the finale), ×3-6 fewer (with the counts kept they sat at 57% idle, 9 points under the aim), ×7-8 the same)
    crew: {events: [4, 9, 13, 17, 21, 25, 27, 29], extra: {maintenance: [1, 0, 0, 0, 0, 0, 0, 0]}, cells: [5, 16, 11, 13, 16, 18, 20, 21], reactor: [1, 0.4, 0.85, 1, 1, 1, 1, 1], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate 2026-10-25 (crews: the solo idle + 5 points a player, each size idler than the one below): 5% 38% 48% 52% 55% 57% 60% 63% idle for 1-8 players
    // 2026-10-20 (solo playtest: one more encounter, an easy one): solo a second failing part, crew.extra (a repeat on top of the
    // 4 asked / 5 played; one more asked would have been the mine drone): 6 played; cells refitted like --calibrate and unchanged
    // (5, overcharged): ~-5% idle solo (was ~0%); the model rates it impossible (~6 problems open at once), the playtest says not
    needs: {ship: ['cannons', 'inserter'], overcharge: true},
    essential: ['pirates'],
    always: ['maintenance'],                  // a part fails at every crew size, solo too (2026-10-16: more self-breaking parts from chapter 4 on)
    objective: { kind: 'navcore' }, rules: { breach: true, surge: true },   // (was 'raiders' ×2 like chapter 1; 2026-10-16: no mission twice)
    length: 300,                              // 5 min to the jump (2026-10-17, the user: "mission 4 should go back to 5"; was 420 that day, 360 before): the nav core is two chances, a fight + a fetch (or a boarding) + the install each
    blurb: 'Pirates took Dr. Varga. Find the Red Comet\'s hideout: get a raider\'s nav core and install it in our helm.',
    briefing: 'The black box recording is clear: pirates of the Red Comet gang boarded the lab and dragged Dr. Varga away. Where to? Nobody knows where their hideout is — but every one of their raiders does: it\'s in its nav computer.\n\nTheir raiders patrol the Cove. Get us a nav core. Let one dock and board it: the nav console sits beside its reactor, pull the core out (hold click) and carry it home. Or shoot one to scrap: its nav core gets flung clear — spacewalk out and fish it in before it drifts off (about a minute). Either way, plug it into our helm on the bridge (hold click) so we can read their charts. The Guild\'s bounty still stands: $20 a pirate. Power lines can arc now; splice them with the repair kit.',
    // a calm half minute, a Red Comet scout (the opener), then the raiders; a part fails in between (bigger crews)
    build: () => [evAt('interceptor', 30, { side: 'star', opener: true }), evAt('pirates', 70, { side: 'port' }), evAt('maintenance', 110, { radar: false }), evAt('pirates', 150, { side: randSide() }),
                  evAt('mines', 190, { side: randSide() }), evAt('glitch', 230, { radar: false }), evAt('swarm', 270)],
  },
  c5: {
    spacing: 'written',                       // every encounter at its written time (js/mission.js layoutMission; 'even' until 2026-10-25)
    name: '5 · Rescue Dr. Varga', tier: 3, campaign: 5, rewards: { money: 120, rep: 3 },
    sides: { swarm: 'front' },               // (approved as built: its swarms, written and repeated, come from ahead)
    // set by hand: the whole mission is the pirate base. A patrol interceptor (the opener), then we dock (once it's
    // gone: EVENT_RUNNERS.brig); the jump is due 360 s later (finaleLead), sooner once she's aboard and we've
    // detached (js/dock.js ESCAPE_SPOOL). A bigger crew gets more guards in the base (stationGuards) and, while we're
    // docked (2026-10-25, the user: one more from 3 players, two from 5, three from 7), the gang outside: the patrol
    // coming back (150 s), a mine drone (230 s), a failing part (300 s) — someone has to stay aboard. Easy / very easy
    // take those out (and guards, as always; half a cat of luck a step where nothing is left to drop).
    crew: {events: [2, 2, 3, 3, 4, 4, 5, 5], cells: [3, 3, 4, 4, 5, 5, 6, 6], overcharge: [true, true, true, true, true, true, true, true]},
    needs: {ship: ['cannons', 'inserter'], overcharge: true},
    length: 420, finaleLead: 360,             // 7 min (2026-10-17 playtest: "mission time is probably good at 7min"; was 300 / 240)
    objective: { kind: 'rescue', npc: 'Dr. Varga' }, rules: { breach: true, surge: true, gravity: true },
    blurb: 'Storm the Red Comet\'s base, room by room, and get Dr. Varga out.',
    briefing: 'We found the Red Comet\'s hideout: a rusty base out in the Cove. Dr. Varga is locked up somewhere inside — hurt, by the sound of her distress ping.\n\nDeal with their patrol, then we dock. Grab a weapon first: they\'ll rush out the moment the tube opens (and drop their guns when they fall). Fight through the base room by room: a busted security terminal (repair it, then hack it) and a door code somebody surely wrote down.\n\nPatch her up (hold click or E on her) and she runs for our ship on her own. Cover her: if she\'s hit, she goes down again. The engine stays off while we\'re docked or anyone is still over there: once she\'s aboard, detach at our airlock and jump.',
    build: () => [evAt('interceptor', 25, { side: randSide(), opener: true }), evAt('brig', 60, { side: randSide() }),
                  evAt('interceptor', 150, { side: randSide() }), evAt('mines', 230, { side: randSide() }), evAt('maintenance', 300, { radar: false })],
  },
  c6: {
    name: '6 · Spore Season', tier: 3, campaign: 6, rewards: { money: 120, rep: 3 },
    balance: { soloIdle: 0.37 }, // the idle share tools/balance.js --calibrate aims for solo (the user: 33-40% is right solo) (crews since 2026-10-25: its solo idle + 5 points a player, tools/balance.js targetIdle)
    // (2026-10-16, asteroid swarms from the side + leeches past the shields: ×1, ×2, ×4 back in spec with cells / reactor only, the event counts kept)
    crew: {events: [6, 11, 15, 19, 23, 26, 28, 29], cells: [6, 9, 15, 14, 19, 19, 19, 20], reactor: [0.7, 0.85, 0.7, 1, 0.85, 1, 1, 1], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate 2026-10-25 (crews: the solo idle + 5 points a player, each size idler than the one below): 11% 16% 26% 31% 36% 42% 48% 52% idle for 1-8 players
    // 2026-10-24 (solo playtest: one more encounter, a spore mother): solo 6 asked, 6 played (+ the written mother; 5 asked would play the
    // same 5: the swarm was already added as the finale fight), and ×2 to 6 as well (it played 5: a smaller crew mustn't get more
    // than a bigger one). Cells / reactor refitted like --calibrate: solo ×0.5 / 3 cells went out of spec (the port cannon waits for
    // the last fight), so ×0.7 (the mildest in spec) and 6 cells: ~11% idle solo (was 31%); ×2 kept (×0.5, 3 cells: in spec, ~46% idle, was 57%)
    needs: {ship: ['cannons', 'inserter', 'caps'], overcharge: true},
    essential: ['spores'],                    // (and the leeches: the opener, never dropped)
    always: ['maintenance'],                  // a part fails at every crew size, solo too (2026-10-16)
    objective: { kind: 'ore', perPlayer: true }, rules: { breach: true, surge: true, plasma: true },   // (a sample per player: oreNeeded; was 2)
    blurb: 'Drill samples of the living rock in the Mire Nebula, one for each of you, before it drifts past.',
    briefing: 'Dr. Varga is grateful — and terrified. The intruders\' DNA matches the spore fields of the Mire Nebula, where those creatures nest.\n\nShe needs samples of the living rock they grow on, one for each of us. One will drift right past in front of us, and it won\'t wait: take the mining drill (left airlock room), spacewalk out, drill a sample, bring it inside, and go back for the next before the rock is out of reach. The nebula will notice. Expect leeches, and spore clouds: they drift to an airlock and seep in. Spores inside jam whatever they settle on and eat it in the end; vent the room (the panel by the outer airlock, the PIN is on the sticky note).',
    // a calm half minute, a leech swarm (the opener: the Mire's own; was an interceptor until 2026-10-16), then the rock
    // drifts in (and past); a part fails on the way (every crew size)
    build: () => [evAt('leeches', 30, { side: randSide(), opener: true }), evAt('rock', 60, { side: randSide() }), evAt('spores', 95, { side: randSide() }), evAt('leeches', 135, { side: randSide() }), evAt('mother', 175, { side: randSide() }),
                  evAt('swarm', 215), evAt('maintenance', 235, { radar: false }), evAt('coolant', 255, { radar: false }), evAt('grappler', 290, { side: randSide() })],
  },
  c7: {
    name: '7 · The Deep', tier: 3, campaign: 7, rewards: { money: 140, rep: 3 },
    balance: { soloIdle: 0.37 }, // the idle share tools/balance.js --calibrate aims for solo (the user: 33-40% is right solo) (crews since 2026-10-25: its solo idle + 5 points a player, tools/balance.js targetIdle)
    crew: {events: [5, 7, 9, 11, 12, 14, 16, 17], extra: {mother: [1, 0, 0, 0, 0, 0, 0, 0]}, cells: [3, 9, 6, 7, 17, 16, 18, 16], reactor: [0.5, 0.4, 1, 1, 0.3, 0.4, 0.4, 0.5], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate 2026-10-25 (crews: the solo idle + 5 points a player, each size idler than the one below): -11% 22% 23% 35% 52% 59% 62% 64% idle for 1-8 players
    // 2026-10-20 (solo playtest: one more encounter, a spore mother): crew.extra adds a mother solo (5 + 1); the solo reactor
    // ×0.5 (was 0.7) keeps its energy in spec (the right cannon waited 21 s for the mother; an extra cell didn't help)
    needs: {ship: ['cannons', 'inserter', 'caps'], overcharge: true},
    always: ['maintenance', 'intruder'],      // two parts fail at every crew size, solo too (2026-10-16: more self-breaking parts from chapter 4 on); the alien
                                              // boards at every crew size (2026-10-17, "too chill"; written before the first herd, so a small crew's herd stays the finale)
    objective: null, rules: { breach: true, surge: true, gravity: true, plasma: true, coils: true, handle: true, tides: 70 },
    blurb: 'Fly into the deep beyond the Mire, where the tides pull and the creatures hunt together. Get out alive.',
    briefing: 'The sample proves it: the spores are being herded. Something big lives in the deep beyond the Mire.\n\nFly in and survive. No pirates out there, nobody at all — only what lives there. On the way a gravity tide rolls through: the ship lurches, loose things slide, anyone outside gets thrown off the hull, and it knocks a jump coil out of line. Spacewalk out to turn the coils back (green), or the jump takes longer. There is no nav fix out there either: when the drive spools up, someone holds the jump handle at the helm.\n\nAnd the creatures don\'t come one by one any more. They come in pairs, from one side, as if something were steering them. Listen for the call.',
    // 2026-10-16 (the user: "far too easy", "not enough new things"): no interceptors (no pirates beyond the Mire); the tides
    // (rule) knock the coils out (since 2026-10-17 just one tide, 70 s in); the creatures come as herds; two parts fail. A spore cloud first, then the herds.
    // 2026-10-17: the alien (was at 190 s) comes second, kept at every crew size (`always`)
    // 2026-10-26: the 130 s herd is the mother + grappler (was + spore clouds: the user, those two are no herd; herdOk, js/organic.js;
    // the grappler keeps the balance model's crew idle shares rising, + leeches didn't)
    build: () => [evAt('spores', 30, { side: randSide(), opener: true }), evAt('intruder', 50, { side: randSide() }), evAt('herd', 70, { kinds: ['grappler', 'leeches'], side: randSide() }), evAt('maintenance', 100, { radar: false }),
                  evAt('herd', 130, { kinds: ['mother', 'grappler'], side: randSide() }), evAt('swarm', 150), evAt('maintenance', 170, { radar: false }),
                  evAt('leeches', 210, { side: randSide() }), evAt('storm', 230), evAt('herd', 250, { kinds: herdPair(), side: randSide() }), evAt('grappler', 270, { side: randSide() }),
                  evAt('coolant', 285, { radar: false }), evAt('mother', 300, { side: randSide() }), evAt('herd', 315, { kinds: herdPair(), side: randSide() })],
  },
  c8: {
    spacing: 'even',                          // a boss mission: its encounters evenly spaced as before (js/mission.js layoutMission; 2026-10-18)
    name: '8 · The Mother of All', tier: 4, campaign: 8, rewards: { money: 200, rep: 5 },
    balance: { soloIdle: 0.37 }, // the idle share tools/balance.js --calibrate aims for solo (the user: 33-40% is right solo) (crews since 2026-10-25: its solo idle + 5 points a player, tools/balance.js targetIdle)
    // (2026-10-16, asteroid swarms from the side + leeches past the shields: ×4 back in spec with cells / reactor only, the event counts kept)
    // (2026-10-16, the infested leviathan's ~4 min fight: ×3 / ×4 need 7 / 9 cells (were 4 / 5) to stay in spec; counts kept.
    //  Model with the boss: 1% 35% 57% 58% idle for 1-4)
    crew: {events: [5, 8, 10, 11, 13, 15, 17, 18], cells: [4, 18, 25, 19, 25, 22, 27, 24], reactor: [0.35, 0.2, 0.2, 0.3, 0.3, 0.4, 0.4, 0.5], overcharge: [true, true, true, true, true, true, true, true]},   // --calibrate 2026-10-25 (crews: the solo idle + 5 points a player, each size idler than the one below): 2% 22% 34% 49% 55% 60% 63% 67% idle for 1-8 players
    needs: {ship: ['cannons', 'inserter', 'caps'], overcharge: true},
    // at every crew size, solo too: the spore clouds, the spore mother, the grappler, a failing part and the leviathan
    // (2026-10-20, the user: one encounter less, the fight keeps its ~4 min, the mission shorter by that: every crew size -1,
    //  the second failing part is `optional` (dropped first); the leviathan at 270 s (was 330), length 560 → 500)
    // (an essential kind); more players get herds and leeches on top (the one tide: the rule, every crew size)
    always: ['spores', 'mother', 'grappler', 'maintenance'],
    // the infested leviathan (js/leviathan.js) is the finale: the other events keep their spread (to 330 s, as with the old
    // leviathan's finaleLead 30); the jump is due LEVB's fight later (length − finaleLead: an estimate, ~4 min) and never comes
    // before the fight is over (it holds the drive; once it's freed a short cutscene, and LEVB_OUTRO s later the ship jumps by
    // itself: mission.autoJump, 2026-10-24)
    length: 500, finaleLead: 230,
    // (2026-10-24: no `coils` / `handle` rules any more: the ship jumps by itself once the leviathan is free, so neither the
    //  jump handle at the helm nor the jump coils' alignment would do anything)
    objective: null, rules: { breach: true, surge: true, gravity: true, plasma: true, tides: 80 },
    blurb: 'Meet the spore mother, the grappler and the leviathan itself. Find out what drives the swarms mad.',
    briefing: 'Varga\'s theory: the swarms answer to one creature, out in the deepest dark. To prove it, someone has to fly to it, sit right next to it, and survive.\n\nThat someone is you. First the spores, then their mother: a huge thing whose silent scream fills space round the hull with spores (shoot the tongue in its open mouth; don\'t open an airlock while the cloud is out there, and vent the spores out once it\'s gone). Then the grappler, a squid that grabs the hull and rips plates off, while the ship itself starts to give way. A tide pulls at the ship like in the deep, and the creatures hunt in herds. At the end the great creature itself comes: the leviathan, bigger than the ship. If Varga is right, it\'s not hunting us: it\'s sick. Blast what\'s eating it off its hide, cannon by cannon, keep inside when it breathes out, and when it\'s out of the cannons\' reach, the engine is the biggest gun we have: its manual override is in the reactor room.\n\nGood luck — and bring the cat.',
    // 2026-10-16 (the user: "boring", never saw the spore mother): a fixed, escalating timeline instead of the shuffle,
    // no interceptors: spores, the mother, the grappler while a part breaks, then herds and tides, the leviathan last
    // (2026-10-17, one gravity tide per mission: the rule's, 80 s in, at every crew size. The two written tides at 140 / 225 s are
    //  never picked any more (selectEvents' oneTide); they stay written so the written spread, and with it the reactor's pace, is unchanged)
    // (the mother on one side, the spores and the grappler on the other: one capacitor can't feed both big fights)
    // (2026-10-26: the 210 s herd is the mother + leeches, was + spore clouds: those two are no herd; herdOk, js/organic.js)
    build: () => { const s = randSide(), o = s === 'port' ? 'star' : 'port'; return [evAt('spores', 30, { side: o, opener: true }), evAt('mother', 60, { side: s }), 
                  evAt('grappler', 100, { side: o }), evAt('maintenance', 120, { radar: false }), evAt('herd', 130, { kinds: ['leeches', 'spores'], side: randSide() }), evAt('tide', 140), evAt('herd', 150, { kinds: ['grappler', 'leeches'], side: randSide() }),
                  evAt('leeches', 170, { side: randSide() }), evAt('maintenance', 190, { radar: false, optional: true }), evAt('herd', 210, { kinds: ['mother', 'leeches'], side: randSide() }),
                  evAt('tide', 225), evAt('herd', 240, { kinds: herdPair(), side: randSide() }), evAt('leviathan_boss', 270, { finale: true })]; },
  },
  practice: {
    name: 'Practice', tier: 0, practice: true, rules: {}, objective: null,
    blurb: 'Free play: start any encounter, damage or mini-game from the practice panel.',
    briefing: 'No timeline, no jump: the ship is yours. The PRACTICE panel (top right, or P) starts anything, toggles the harder rules and clears up after you.',
    build: () => [],
  },
});
// The skirmish builder (2026-10-19, the user: replaces every preset skirmish, Intro run too; the presets were deleted
// 2026-10-25, old saves may still list them in done.*): the lobby's Skirmish tab picks how many difficulty points
// (2026-10-28, the user: "a skirmish difficulty slider based on points instead of number of encounters"; it was a count n),
// which kinds may come (all listed from the start: no spoiler filtering; no boss / story kinds) and which ship parts
// may fail. A fifth to a third of the points go to failing parts (maintenance on a ticked part), the rest to kinds drawn
// from the ticked ones. No pay. The config is the host's (lobby message 'skirmish'), passed to startMission as opts.custom.
// Each kind's points (1 to 3.5 in halves): the balance model's difficulty score for one of it alone, solo, / 10 (the user,
// 2026-10-28; `node tools/balance.js --encounters`, its first column: gravity tide 10 → 1 … frigate 36 → 3.5).
const CUSTOM_KINDS = [
  ['interceptor', 'Interceptor', 2], ['frigate', 'Frigate', 3.5], ['swarm', 'Asteroid swarm', 2], ['stealth', 'Stealth fighter', 2.5],
  ['tractor', 'Tractor tug', 2.5], ['pirates', 'Pirate raider', 2], ['intruder', 'Intruder', 1.5], ['saboteur', 'Saboteur', 2],
  ['grappler', 'Grappler', 1.5], ['mother', 'Spore mother', 1.5], ['leeches', 'Leech swarm', 2], ['herd', 'Herd (two creatures)', 3],
  ['mines', 'Mine drone', 1.5], ['spores', 'Spore clouds (get inside)', 2.5], ['debris', 'Debris in a cannon', 1.5], ['antenna', 'Antenna strike', 1.5],
  ['canister', 'Fuel canister', 1.5], ['flare', 'Solar flare', 1], ['storm', 'Ion storm', 1], ['coolant', 'Coolant leak', 1],
  ['glitch', 'AI glitch', 1], ['tide', 'Gravity tide', 1],
];
const CUSTOM_FAIL_POINTS = 1.5;                       // a failing part (maintenance: 13 alone, solo)
const customPoints = (kind) => (kind === 'maintenance' ? CUSTOM_FAIL_POINTS : CUSTOM_KINDS.find(k => k[0] === kind)?.[2] || 1);
const CUSTOM_PARTS = () => ALL_PARTS.map(s => s.name);   // (by name: they're unique, and readable in the lobby; the parts inside, the shield emitters outside, the hull seams)
const CUSTOM_MAX = 30;                                // encounters at most, whatever the points
const CUSTOM_POINTS = [1, 60], CUSTOM_PER_OLD = 1.8;  // the slider's range; an old config's count n → n × 1.8 points (the average kind)
// Any config (a guest's lobby state, localStorage, an old host with a count n) → a valid one; nothing given: everything
// ticked, 15 points (about the old default, 8 encounters).
function customConfig(c) {
  const list = (a, ok) => (Array.isArray(a) ? [...new Set(a.filter(x => ok.includes(x)))] : ok.slice());
  const p = Math.round(+c?.points * 2) / 2 || Math.round(Math.round(+c?.n) * CUSTOM_PER_OLD) || 15;   // (in halves, like the kinds' points)
  return { points: Math.min(CUSTOM_POINTS[1], Math.max(CUSTOM_POINTS[0], p)), kinds: list(c?.kinds, CUSTOM_KINDS.map(k => k[0])), parts: list(c?.parts, CUSTOM_PARTS()) };
}
const customFailures = (points) => [Math.round(points / 5 / CUSTOM_FAIL_POINTS), Math.round(points / 3 / CUSTOM_FAIL_POINTS)];   // failing parts: from..to
// The fuel cells: 2 + one per 4 points (it was 2 + one per 2 encounters, and an encounter is ~1.8 points)
const customCells = (points) => 2 + Math.ceil(points / 4);
MISSIONS.custom = {
  name: 'Skirmish', tier: 0, custom: true, rules: {}, objective: null,
  spacing: 'spread',                          // its encounters evenly spread, jittered (js/mission.js shapedTimes; 2026-10-26: they bunched up)
  blurb: 'Your own mix of encounters.',
  briefing: 'No story and no pay: just the trouble you picked, spread over five minutes. Hold out until the jump.',
  build() {
    const C = customConfig(mission.custom), [lo, hi] = customFailures(C.points);
    const fails = !C.parts.length ? 0 : !C.kinds.length ? Math.max(1, Math.floor(C.points / CUSTOM_FAIL_POINTS)) : lo + Math.floor(Math.random() * (hi - lo + 1));
    const kinds = C.kinds.slice(), out = [];
    for (let i = 0; i < Math.min(CUSTOM_MAX, fails); i++) out.push('maintenance');
    // the rest of the points: kinds drawn from the ticked ones that still fit (at least one encounter in all)
    let left = C.points - out.length * CUSTOM_FAIL_POINTS;
    while (out.length < CUSTOM_MAX && kinds.length) {
      const fit = kinds.filter(k => customPoints(k) <= left + 1e-9);
      if (!fit.length) { if (!out.length) out.push(kinds.sort((a, b) => customPoints(a) - customPoints(b))[0]); break; }
      const kind = fit[Math.floor(Math.random() * fit.length)];
      if (kind === 'tide') kinds.splice(kinds.indexOf('tide'), 1);      // (one gravity tide per mission: oneTide)
      out.push(kind); left -= customPoints(kind);
    }
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out.map((kind, i) => makeEvent(kind, 30 + i * 30, null));   // (written 30 s apart: the reactor's pace, paceFactor)
  },
};
EVENT_SIDES.brig = randSide;
// The pirate base (js/dock.js dockStation): we dock once the patrol is gone (checked again every 2 s).
EVENT_RUNNERS.brig = (ev) => {
  if (combat.enemies.some(e => e.phase !== 'gone' && e.phase !== 'burning') || dk.dock) {
    if (!ev.waiting) combatBanner('The pirate base is in sight — deal with their patrol, then we dock.');
    Object.assign(ev, { done: false, t: mission.t + 2, waiting: true });
    return;
  }
  dockShip('base', ev.side);
};
EVENT_LABELS.brig = (ev) => `Pirate base — ${SIDE_NAME[ev.side]}`;
const npcName = () => mission.objective?.npc || 'the engineer';

// ---------------------------------------------------------------------------
// Simulation side: upgrades, kits, perks, results
// ---------------------------------------------------------------------------
function applyShipUpgrades(ship = {}) {
  const has = (id) => !!ship[id];
  SHOTS_PER_ENERGY = has('cannons') ? 4 : 3;
  SHIELD_UP_TIME = has('shields') ? 18 : 15;
  CAP_MAX = has('caps') ? 4 : 3;
  FIRE_TIME = has('sprinklers') ? 22 : 15;
  RADAR_RANGE = has('radar') ? 60 : 45;
  LOCK_CYCLE = has('airlocks') ? LOCK_CYCLES.fast : LOCK_CYCLES.base;   // (the outer airlocks' pump: js/airlock.js)
  COFFEE_REFILL = has('coffee') ? 20 : 60;
  MAX_DAMAGE = has('hull') ? 6 : 5;
  ({ slide: DOOR_TIME, delay: DOOR_DELAY } = has('doors') ? DOOR_TIMES.fast : DOOR_TIMES.base);   // (the inner doors: js/game.js updateDoors)
}
// At mission start: the ship's one-off extras.
function shipStartExtras(ship = {}) {
  if (ship.spareCell) power.reserve += 1;
  power.inserter = ship.inserter ? { on: true, t: 0 } : null;
  for (const g of GUNS) { g.shots = SHOTS_PER_ENERGY; g.reload = 0; }   // every cannon starts loaded: 4 shots with the efficient cannons (and a fresh load each mission)
}
// perk(c, id): a profession id, or a piece of gear (profession gear only counts in its profession).
const perk = (c, id) => {
  if (c?.kit?.profession === id) return true;
  if (!c?.kit?.gear?.[id]) return false;
  const g = GEAR.find(g => g.id === id);
  return !g?.prof || g.prof === c.kit.profession;
};
const isPaint = (p) => typeof p === 'string' && /^#[0-9a-f]{6}$/i.test(p);
// A player's kit (gear, profession, paint) on their crew member; starting items from the profession.
function applyKit(c, kit) {
  c.kit = kit ? { gear: { ...(kit.gear || {}) }, profession: kit.profession || null, paint: isPaint(kit.paint) ? kit.paint : null } : { gear: {}, profession: null };
  if (c.kit.paint) c.color = c.kit.paint;
  c.armor = perk(c, 'armor') ? 1 : 0;                                                 // (weapons specialists only, since v4)
  if (perk(c, 'ownKit') && !c.inv.weapon) c.inv.weapon = 'repair';                     // (on top of the ship's own items)
  if (perk(c, 'heavy') && (!c.inv.weapon || c.inv.weapon === 'laser')) c.inv.weapon = 'heavy';
  else if (perk(c, 'ownLaser') && !c.inv.weapon) c.inv.weapon = 'laser';
}
// Speed multiplier from gear and what you carry (used by updateCrew).
function gearSpeed(c) {
  const carry = c.inv?.weapon === 'heavy' ? (c.charge > BLASTER_SLOW_AFTER ? BLASTER_CHARGE_SPEED : BLASTER_CARRY_SPEED) : 1;
  if (c.mode === 'eva') return (perk(c, 'thrusters') ? 1.3 : 1) * carry;
  if (c.mode === 'inside' && noGravAt(c.x, c.y) && perk(c, 'boots')) return 0.8 * carry;   // boots: still walking, a bit slower
  return (perk(c, 'boots') ? 1.15 : 1) * carry;
}
// Repairs: speed multiplier for this crew member.
const repairSpeed = (c) => (perk(c, 'engineer') ? 1.2 : 1) * (perk(c, 'toolbelt') ? 1.25 : 1);
// The inserter: an empty reactor gets the next cell from the crate, unless the cells are scooched away.
function updateInserter(dt) {
  const I = power.inserter;
  if (!I) return;
  if (!I.on || power.reactor.fuel > 0 || power.reserve <= 0 || broken(REACTOR)) { I.t = 0; return; }
  if ((I.t += dt) >= 2) { I.t = 0; power.reserve--; power.reactor.fuel = CELL_ENERGY; power.reactor.t = 0; sfx.hatch(); }
}
// What happened, for the rewards (each browser credits its own player).
function missionResults(jumped) {
  const obj = objectiveStatus();
  return {
    jumped, objective: !!obj.done && !!mission.objective, pirates: dk.defeated, kills: mission.kills || 0,
    damage: SYSTEMS.filter(s => s.broken).length, maxDamage: MAX_DAMAGE,   // (the ship's state at the jump: the clean-ship bonus)
    crew: crew.map(c => ({ id: c.id, survived: jumped && (c.mode === 'gun' || c.mode === 'inside' && !inDock(c.x, c.y)) && standing(c) })),
  };
}
// A mission counts as a success (finished, unlocks the next chapter, earns reputation) only if the ship
// jumped out with the objective done; missions without an objective just need the jump.
const missionSuccess = (id, results) => !!results?.jumped && (!!results.objective || !MISSIONS[id]?.objective);
// Rewards for one player from a mission's results. Jumped out = the crew gets paid (base + per pirate),
// objective or not; reputation only for a success. (No XP since 2026-10-17: `survived` is unused.)
// Plus up to CLEAN_BONUS for bringing the ship back in one piece: all of it with nothing broken at the jump,
// nothing at MAX_DAMAGE broken parts (5/5), in between in proportion (2026-10-17 playtest).
const CLEAN_BONUS = 25;
const cleanBonus = (results) => (results.maxDamage ? Math.max(0, Math.round(CLEAN_BONUS * (1 - (results.damage || 0) / results.maxDamage))) : 0);
function computeRewards(id, results, survived, firstClear) {
  const M = MISSIONS[id] || {}, R = M.rewards || { money: 16, rep: 0 };   // (money: 2026-10-16 ×0.4 everywhere but chapter 1, so you have to choose)
  if (!results.jumped) return { money: 0, rep: 0, clean: 0 };
  const clean = cleanBonus(results), money = (R.money || 0) + (R.perPirate || 0) * (results.pirates || 0) + clean;
  const rep = missionSuccess(id, results) ? (R.rep || 0) + (firstClear ? 1 : 0) : 0;
  return { money, rep, clean };
}

// The inserter: an arm from the fuel crate to the reactor's slot (and a handle to scooch the cells).
function drawInserter(t) {
  const I = power.inserter;
  if (!I) return;
  if (sprReady('systems/inserter_arm', 'systems/inserter_handle')) {   // sprites (js/decor.js spr), both with their origin at FUEL_CRATE
    spr('systems/inserter_arm', I.t > 0 ? clamp(Math.floor(I.t / 2 * 6), 0, 5) : 0, FUEL_CRATE.x, FUEL_CRATE.y, 0, { sortY: FUEL_CRATE.y - 0.3 });
    spr('systems/inserter_handle', I.on ? 0 : 1, FUEL_CRATE.x, FUEL_CRATE.y, 0, { sortY: FUEL_CRATE.y, emissive: 0.6 });
    ctx.fillStyle = 'rgba(232,236,244,0.8)'; ctx.font = `800 ${T * 0.09}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(I.on ? 'AUTO' : 'OFF', L(FUEL_CRATE.x - 0.8), L(FUEL_CRATE.y) + 12); ctx.textAlign = 'left';
    return;
  }
  const x0 = L(FUEL_CRATE.x + 0.4), y0 = L(FUEL_CRATE.y - 0.4), x1 = L(REACTOR.x - REACTOR.w / 2 + 0.3), y1 = L(REACTOR.y + 0.2), k = I.t / 2;
  const ex = lerp(x0, x1, 0.5 + 0.5 * Math.sin(k * Math.PI)), ey = lerp(y0, y1, 0.5) - L(0.6);
  ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(ex, ey); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = '#e8c34f'; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); ctx.arc(ex, ey, 6, 0, TAU); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(1.5);
  const hx = L(FUEL_CRATE.x - 0.8), hy = L(FUEL_CRATE.y);          // the scooch handle
  rr(hx - 7, hy - 10, 14, 20, 4); ctx.fillStyle = I.on ? '#5fd6a0' : '#e2574c'; ctx.fill(); stroke(1.5);
  ctx.fillStyle = 'rgba(232,236,244,0.8)'; ctx.font = `800 ${T * 0.09}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(I.on ? 'AUTO' : 'OFF', hx, hy + 12); ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Browser side: the profile
// ---------------------------------------------------------------------------
const PROFILE_KEY = 'mn-profile';
function defaultProfile() {   // (xp: no longer earned or shown since 2026-10-17; kept for old saves, see professionOpen)
  return { v: PROFILE_VERSION, xp: 0, money: 0, rep: 0, done: {}, ship: {}, gear: {}, profession: null, paint: null, lastRun: null };
}
// Reads any older version; unknown fields are kept, missing ones get defaults.
function migrateProfile(p) {
  if (!p || typeof p !== 'object') return defaultProfile();
  const out = { ...defaultProfile(), ...p };
  for (const k of ['done', 'ship', 'gear']) out[k] = { ...(p[k] && typeof p[k] === 'object' ? p[k] : {}) };
  out.xp = +out.xp || 0; out.money = +out.money || 0; out.rep = +out.rep || 0;
  if (!(p.v >= 2)) {                       // v2: suit paint is free (lobby), auto-doc and second kit are gone, Security → Weapons specialist
    delete out.gear.paint; delete out.ship.autodoc; delete out.ship.kit2;
    if (out.profession === 'security') out.profession = 'weapons';
  }
  if (!(p.v >= 3)) {                       // v3: Gunner merged into Weapons specialist; the medic is gear now (first aid course)
    if (out.profession === 'gunner') out.profession = 'weapons';
    if (out.profession === 'medic') { out.profession = null; out.gear.firstAid = true; }
    delete out.gear.trauma; delete out.gear.painkillers;
  }
  if (!(p.v >= 4)) {                       // v4: the armor vest is weapons-specialist gear: anyone else gets its $220 back
    if (out.gear.armor && out.profession !== 'weapons') { delete out.gear.armor; out.money += 220; }
  }
  out.v = PROFILE_VERSION;
  return out;
}
function readCookie(name) {
  try { const m = document.cookie.split('; ').find(s => s.startsWith(name + '=')); return m ? decodeURIComponent(m.slice(name.length + 1)) : null; } catch (e) { return null; }
}
function loadProfile() {
  let raw = readCookie(PROFILE_KEY);
  if (!raw) { try { raw = localStorage.getItem(PROFILE_KEY); } catch (e) { /* none */ } }   // (file:// pages can't keep cookies)
  try { return migrateProfile(raw ? JSON.parse(raw) : null); } catch (e) { return defaultProfile(); }
}
function saveProfile(p) {
  const s = JSON.stringify(p);
  try { document.cookie = `${PROFILE_KEY}=${encodeURIComponent(s)}; max-age=${60 * 60 * 24 * 3650}; path=/; SameSite=Lax`; } catch (e) { /* none */ }
  try { localStorage.setItem(PROFILE_KEY, s); } catch (e) { /* none */ }
}
let profile = typeof document !== 'undefined' && document.cookie !== undefined ? loadProfile() : defaultProfile();
const profileKit = () => ({ gear: profile.gear, profession: profile.profession, paint: profile.paint });
const unlockedMissions = (p = profile) => {
  const out = new Set(['practice', 'c1']);
  CAMPAIGN.forEach((id, i) => { if (p.done[id]) { out.add(id); if (CAMPAIGN[i + 1]) out.add(CAMPAIGN[i + 1]); } });
  return out;
};

// After a mission (once per run): credit this player.
let lastReward = null;
function creditMission() {
  const o = mission.over;
  if (!o || !o.results || !mission.runId || profile.lastRun === mission.runId || mission.id === 'practice' || MISSIONS[mission.id]?.custom || MISSIONS[mission.id]?.tutorial) return;   // (a custom skirmish, crew training: no pay, no entry)
  const mine = o.results.crew.find(c => c.id === me.id);
  const ok = missionSuccess(mission.id, o.results), first = ok && !profile.done[mission.id];
  // In multiplayer the crew flies the host's ship (mission.shipOf, set by the server): only its upgrades count, but
  // every player earns their own pay and reputation (2026-10-19, the user; before, the reputation went to the host).
  const r = computeRewards(mission.id, o.results, !!mine?.survived, first);
  profile.money += r.money; profile.rep += r.rep;
  if (ok) profile.done[mission.id] = (profile.done[mission.id] || 0) + 1;     // done = completed (objective included)
  profile.lastRun = mission.runId;
  saveProfile(profile);
  const next = CAMPAIGN[CAMPAIGN.indexOf(mission.id) + 1], nextName = next && CAMPAIGN.includes(mission.id) ? MISSIONS[next].name : null;
  lastReward = { ...r, damage: o.results.damage || 0, maxDamage: o.results.maxDamage || MAX_DAMAGE, profession: first && mission.id === 'c1' && !profile.profession, unlocked: first ? nextName : null,
    objFailed: !!o.results.jumped && !ok, locked: !ok && !profile.done[mission.id] && nextName && !unlockedMissions().has(next) ? nextName : null };
}
// The rewards block on the end screen.
function drawRewards(cx, y) {
  if (!lastReward || mission.id === 'practice' || MISSIONS[mission.id]?.custom || MISSIONS[mission.id]?.tutorial) return;
  const r = lastReward;
  ctx.textAlign = 'center'; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillStyle = '#ffe08a';
  ctx.fillText(r.objFailed ? `Paid $${r.money}  ·  no reputation` : `+$${r.money}  ·  +${r.rep} reputation`, cx, y);
  let dy = 26;
  if (r.money) { ctx.fillStyle = '#c8cfdc'; ctx.font = '600 13px system-ui, sans-serif'; ctx.fillText(r.clean ? `incl. $${r.clean} for bringing the ship back in one piece (${r.damage}/${r.maxDamage} damage)` : `no bonus for the ship: ${r.damage}/${r.maxDamage} damage`, cx, y + dy - 4); dy += 18; }
  if (r.profession) { ctx.fillStyle = '#7af0b0'; ctx.font = '800 18px system-ui, sans-serif'; ctx.fillText('Professions are open: pick one in the locker.', cx, y + dy); dy += 24; }
  if (r.unlocked) { ctx.fillStyle = '#9cd8ff'; ctx.font = '600 14px system-ui, sans-serif'; ctx.fillText(`Unlocked: ${r.unlocked}`, cx, y + dy); }
  else if (r.objFailed) { ctx.fillStyle = '#ffb0a0'; ctx.font = '600 14px system-ui, sans-serif'; ctx.fillText(r.locked ? `Not completed: ${r.locked} stays locked until you complete the objective.` : 'Objective failed: this run doesn\'t count as completed.', cx, y + dy); }
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Browser side: lobby, locker, shipyard (DOM)
// ---------------------------------------------------------------------------
// One Locker / Shipyard choice, in one of three states that read at a glance: owned (latched in, green
// LED, "OWNED"), available (price on a bright tag) or locked (dark, padlock, and why: what unlocks it).
const shopItem = (data, name, desc, { own, ownTag = 'OWNED', price = '', why = '' }) => {
  const state = own ? 'chosen' : why ? 'locked' : 'avail';
  const tag = own ? `<em class="tag own">✔ ${ownTag}</em>` : price ? `<em class="tag price">${price}</em>` : '';
  return `<button class="item ${state}" ${data} ${own || why ? 'disabled' : ''}${why ? ` title="Locked: ${escapeHtml(why)}"` : ''}>`
    + `<b>${name}${tag}</b><span>${desc}</span>${why ? `<i class="why"><i class="padlock" aria-hidden="true"></i>${escapeHtml(why)}</i>` : ''}</button>`;
};
const aAn = (name) => (/^[aeiou]/i.test(name) ? 'an ' : 'a ') + name;
// One profession per profile, for good: open once chapter 1 is finished (before 2026-10-17: level 2, i.e.
// 100 XP; saves that got there keep it), why profession x is closed to profile p ('' = open), and picking
// one (only while you have none; Start over in the lobby gives a fresh profile).
const professionOpen = (p) => !!p.done?.c1 || p.xp >= 100;
const professionWhy = (p, x) => {
  const mine = PROFESSIONS.find(y => y.id === p.profession);
  return mine ? (mine.id === x.id ? '' : `You're ${aAn(mine.name)} — Start over to choose again`) : professionOpen(p) ? '' : 'Unlocks after chapter 1';
};
function pickProfession(p, id) {
  if (p.profession || !professionOpen(p) || !PROFESSIONS.some(x => x.id === id)) return false;
  p.profession = id;
  return true;
}
const lobbyUI = {
  union: null, askProf: null, onPick: null, onProfile: null,
  // Whose ship flies (net.js, from the server's lobby): null solo (and in the menu), { host: true } when you
  // host a game, { name, ship } as a guest in someone else's game: their ship and its upgrades.
  flight: null,
  flownShip() { return this.flight && !this.flight.host ? this.flight.ship || {} : profile.ship; },
  el: (id) => document.getElementById(id),
  init(onPick, onProfile) {
    this.onPick = onPick; this.onProfile = onProfile;
    this.el('lobby-locker').onclick = () => this.shop('locker');
    this.el('lobby-shipyard').onclick = () => this.shop('shipyard');
    this.el('shop-close').onclick = () => { this.el('shop').hidden = true; this.askProf = null; };
  },
  available() { const u = unlockedMissions(); if (this.union) for (const id of this.union) u.add(id); return u; },
  render(chosen) {
    if (chosen) this.chosen = chosen;
    const p = profile;
    this.el('lobby-profile').innerHTML = `<b>${PROFESSIONS.find(x => x.id === p.profession)?.name || 'No profession yet'}</b>
      <span>$${p.money}</span><span>★ ${p.rep} reputation</span>`;
    const paint = this.el('lobby-paint');                    // suit color: free, saved in the profile
    if (paint) {
      paint.innerHTML = PAINTS.map(c => `<button class="paint${p.paint === c ? ' chosen' : ''}" data-paint="${c}" style="background:${c}; --c:${paintGlow(c)}" title="${PAINT_NAMES[PAINTS.indexOf(c)] || 'Suit'} suit"></button>`).join('');
      paint.querySelectorAll('[data-paint]').forEach(b => b.onclick = () => { p.paint = p.paint === b.dataset.paint ? null : b.dataset.paint; saveProfile(p); this.render(); this.onProfile?.(); });
    }
    // Two tabs: the campaign (only what's unlocked, for you or anyone in the game, so future chapters don't spoil
    // the story) and the skirmish builder. The tab follows the chosen mission (a guest sees the host's).
    const tab = this.chosen === 'custom' || this.chosen === 'practice' ? 'skirmish' : 'campaign';
    if (tab === 'campaign' && CAMPAIGN.includes(this.chosen)) this.lastCampaign = this.chosen;
    this.el('lobby-tabs').querySelectorAll('[data-tab]').forEach(b => {
      b.classList.toggle('chosen', b.dataset.tab === tab);
      b.onclick = () => { if (b.dataset.tab !== tab) this.pick(b.dataset.tab === 'skirmish' ? (this.practice ? 'practice' : 'custom') : this.lastCampaign || CAMPAIGN.find(id => this.available().has(id) && !p.done[id]) || 'c1'); };
    });
    const list = this.el('lobby-missions'), builder = this.el('lobby-builder');
    list.hidden = tab !== 'campaign'; builder.hidden = tab !== 'skirmish';
    if (tab === 'skirmish') this.renderBuilder();
    else this.renderCampaign();
    const m = MISSIONS[this.chosen];
    if (m) {
      const R = m.rewards, obj = m.objective;
      const objText = !obj ? 'Survive until the jump.' : obj.kind === 'pirates' ? `Defeat ${obj.count} pirates.` : obj.kind === 'raiders' ? `Destroy ${obj.count} pirate ships.` : obj.kind === 'intruder' ? (obj.cover ? `${obj.cover}.` : obj.count === 2 ? 'Kill both intruders.' : obj.count > 1 ? `Kill all ${obj.count} intruders.` : 'Kill the intruder.') : obj.kind === 'blackbox' ? 'Bring the black box aboard.' : obj.kind === 'rescue' ? `Rescue ${obj.npc || 'the engineer'}.` : obj.kind === 'ore' ? (obj.perPlayer ? 'Drill an ore sample for each crew member and bring them all aboard.' : (obj.count || 1) > 1 ? `Drill ${obj.count} ore samples and bring them aboard.` : 'Drill an ore sample and bring it aboard.') : obj.kind === 'navcore' ? 'Get a Red Comet nav core and install it in our helm.' : '';
      this.el('lobby-brief').innerHTML = `<h3>${m.name}</h3>${(m.briefing || m.blurb).split('\n\n').map(s => `<p>${escapeHtml(s)}</p>`).join('')}
        ${m.custom ? `<p class="obj">${escapeHtml(this.customSummary())}</p>` : ''}
        <p class="note">♪ ${music.songOf(this.chosen)}</p>
        ${m.tutorial ? '<p class="obj">Training only: no pay, no reputation, nothing to lose.</p>' : ''}
        ${this.flight && !m.tutorial ? `<p class="obj">${this.flight.host ? 'Flying your ship: the crew gets your upgrades. Everyone earns their own pay and reputation.' : `Flying ${escapeHtml(this.flight.name || 'the host')}'s ship: only their upgrades count. You earn your own pay and reputation.`}</p>` : ''}
        ${missionRequirements(this.chosen, this.flownShip()).map(t => `<p class="obj">⚠ ${escapeHtml(t)}</p>`).join('')}
        ${m.practice || m.custom || m.tutorial ? '' : `<p class="obj"><b>Objective:</b> ${objText}${R ? ` <b>Pay:</b> $${R.money}${R.perPirate ? ` + $${R.perPirate} per pirate` : ''} · ★${R.rep}${obj ? ' (only with the objective)' : ''}` : ''}</p>`}`;
    }
  },
  pick(id) { this.chosen = id; this.onPick(id); this.render(); },
  // The custom skirmish (lobbyUI.custom: customConfig's shape; practice: the Practice tick, the browser's own)
  custom: null, practice: false, onCustom: null,
  ready() { if (this.chosen !== 'custom') return true; const C = customConfig(this.custom); return C.kinds.length + C.parts.length > 0; },
  customSummary() {
    const C = customConfig(this.custom), [lo, hi] = customFailures(C.points);
    if (!C.kinds.length && !C.parts.length) return 'Tick at least one encounter or ship part.';
    const fails = !C.parts.length ? 'no failing parts' : !C.kinds.length ? 'all of them failing parts' : hi === 0 ? 'no failing parts' : lo === hi ? `${lo} failing part${lo > 1 ? 's' : ''}` : `${lo}–${hi} failing parts`;
    // about how many encounters: the points over the ticked kinds' average (failing parts at theirs)
    const avg = C.kinds.length ? C.kinds.reduce((s, k) => s + customPoints(k), 0) / C.kinds.length : CUSTOM_FAIL_POINTS;
    const about = Math.max(1, Math.min(CUSTOM_MAX, Math.round(C.parts.length && C.kinds.length ? (lo + hi) / 2 + (C.points - (lo + hi) / 2 * CUSTOM_FAIL_POINTS) / avg : C.points / avg)));
    return `${C.points} points: about ${about} encounter${about > 1 ? 's' : ''}, ${fails}. ${customCells(C.points)} fuel cells. No pay.`;
  },
  renderCampaign() {
    const p = profile, avail = this.available(), list = this.el('lobby-missions'), scroll = list.scrollTop;
    list.innerHTML = '';
    // in a game (this.flight: multiplayer): crew training (js/tutorial-mp.js) first, always open
    for (const [title, ids] of [...(this.flight && MISSIONS.training ? [['Training', ['training']]] : []), ['Campaign', CAMPAIGN]]) {
      const open = ids.filter(id => MISSIONS[id] && (avail.has(id) || MISSIONS[id].tutorial));
      if (!open.length) continue;
      const h = document.createElement('div'); h.className = 'mission-group'; h.textContent = title; list.appendChild(h);
      for (const id of open) {
        const m = MISSIONS[id], b = document.createElement('button');
        b.className = 'mission' + (id === this.chosen ? ' chosen' : ''); b.dataset.id = id;
        b.innerHTML = `<b>${m.name}${m.tier ? ` <em>${'★'.repeat(m.tier)}</em>` : ''}${p.done[id] ? ' <em class="done">✔</em>' : ''}</b><span>${m.blurb}</span>`;
        b.onclick = () => this.pick(id);
        list.appendChild(b);
      }
      if (open.length < ids.length && ids === CAMPAIGN) { const n = document.createElement('div'); n.className = 'mission-more'; n.textContent = 'More chapters unlock as you go.'; list.appendChild(n); }
    }
    list.scrollTop = scroll;
    list.querySelector('.mission.chosen')?.scrollIntoView?.({ block: 'nearest' });
  },
  // The builder is built once and then only synced (re-rendering it would break a slider drag: the host's own
  // change comes back in the server's lobby state).
  renderBuilder() {
    const box = this.el('lobby-builder'), C = customConfig(this.custom), practice = this.chosen === 'practice';
    if (!box.dataset.built) {
      box.dataset.built = 1;
      const ticks = (group, items) => `<div class="sk-grid">${items.map(([id, name, pts]) => `<label class="sk-tick"><input type="checkbox" data-${group}="${escapeHtml(id)}"><span>${escapeHtml(name)}${pts ? ` <em class="sk-pts" title="difficulty points">${pts}</em>` : ''}</span></label>`).join('')}</div>`;
      box.innerHTML = `<label class="sk-tick sk-practice"><input type="checkbox" id="sk-practice"><span><b>Practice</b> no timer, no encounters: spawn anything from the practice panel</span></label>
        <div class="sk-body">
          <div class="list-head"><label for="sk-n">DIFFICULTY POINTS</label><span id="sk-count"></span></div>
          <input type="range" id="sk-n" min="${CUSTOM_POINTS[0]}" max="${CUSTOM_POINTS[1]}" step="1" aria-label="Difficulty points">
          <div class="mission-group">Encounters <span class="sk-all"><button data-all="kind">all</button><button data-none="kind">none</button></span></div>
          ${ticks('kind', CUSTOM_KINDS)}
          <div class="mission-group">Ship parts that may fail (${CUSTOM_FAIL_POINTS} each) <span class="sk-all"><button data-all="part">all</button><button data-none="part">none</button></span></div>
          ${ticks('part', CUSTOM_PARTS().map(n => [n, n]))}
        </div>`;
      const changed = (cfg) => { this.custom = cfg; this.onCustom?.(cfg); this.render(); };
      const read = () => ({ points: +box.querySelector('#sk-n').value,
        kinds: [...box.querySelectorAll('[data-kind]:checked')].map(x => x.dataset.kind), parts: [...box.querySelectorAll('[data-part]:checked')].map(x => x.dataset.part) });
      box.querySelector('#sk-n').oninput = () => changed(read());
      box.querySelectorAll('[data-kind], [data-part]').forEach(x => x.onchange = () => changed(read()));
      box.querySelectorAll('[data-all], [data-none]').forEach(b => b.onclick = () => {
        const g = b.dataset.all || b.dataset.none;
        box.querySelectorAll(`[data-${g}]`).forEach(x => { x.checked = !!b.dataset.all; });
        changed(read());
      });
      box.querySelector('#sk-practice').onchange = (e) => { this.practice = e.target.checked; this.onCustom?.(this.custom); this.pick(this.practice ? 'practice' : 'custom'); };
    }
    box.querySelector('#sk-practice').checked = practice;
    box.querySelector('.sk-body').classList.toggle('off', practice);
    box.querySelectorAll('.sk-body input, .sk-body button').forEach(x => { x.disabled = practice; });
    box.querySelector('#sk-n').value = C.points;
    box.querySelector('#sk-count').textContent = C.points;
    box.querySelectorAll('[data-kind]').forEach(x => { x.checked = C.kinds.includes(x.dataset.kind); });
    box.querySelectorAll('[data-part]').forEach(x => { x.checked = C.parts.includes(x.dataset.part); });
  },
  shop(kind) {
    const p = profile, open = professionOpen(p), box = this.el('shop-body');
    // A guest in a LAN game only looks: the host's ship (it's the one that flies), its upgrades and unspent reputation
    const F = this.flight, guest = kind === 'shipyard' && F && !F.host;
    this.el('shop-title').textContent = kind === 'locker' ? `LOCKER — $${p.money}` : guest ? `SHIPYARD — ${F.name || 'the host'}'s ship · ★ ${F.rep ?? '?'} unspent` : `SHIPYARD — ★ ${p.rep} reputation`;
    let html = '';
    if (kind === 'locker') {
      // One profession, for good: once picked the others are closed (Start over in the lobby resets the profile).
      const mine = PROFESSIONS.find(x => x.id === p.profession), ask = !mine && open && PROFESSIONS.find(x => x.id === this.askProf);
      html += `<h4>Profession${!open ? ' (after chapter 1)' : mine ? '' : ' (choose one: for good)'}</h4><div class="grid">` + PROFESSIONS.map(x => shopItem(`data-prof="${x.id}"`, x.name, x.desc,
        { own: p.profession === x.id, ownTag: 'YOURS', why: professionWhy(p, x) })).join('') + '</div>';
      if (ask) html += `<div class="confirm" id="prof-confirm"><p><b>Become ${aAn(ask.name)}?</b> You can't switch later (only Start over in the lobby lets you choose again).</p>`
        + `<div class="row"><button data-prof-yes="${ask.id}">Yes, become ${aAn(ask.name)}</button><button data-prof-no>Not yet</button></div></div>`;
      const gearButtons = (list) => '<div class="grid">' + list.map(g => {
        const pr = g.prof && PROFESSIONS.find(x => x.id === g.prof);
        const why = pr && p.profession !== g.prof ? `${pr.name}s only${!open ? ' · professions open after chapter 1' : p.profession ? '' : ' · pick the profession above'}`
          : p.money < g.cost ? `Need $${g.cost - p.money} more` : '';
        return shopItem(`data-gear="${g.id}"`, g.name, g.desc, { own: p.gear[g.id], price: `$${g.cost}`, why }); }).join('') + '</div>';
      html += '<h4>General</h4>' + gearButtons(GEAR.filter(g => !g.prof));
      for (const x of PROFESSIONS) {
        const track = GEAR.filter(g => g.prof === x.id);
        if (track.length) html += `<h4>${x.name} track${p.profession === x.id ? '' : ' (only as ' + x.name.toLowerCase() + ')'}</h4>` + gearButtons(track);
      }
    } else {
      const ship = guest ? F.ship || {} : p.ship, host = escapeHtml(F?.name || 'the host');
      html += '<div class="grid">' + SHIP_UPGRADES.map(u => shopItem(guest ? '' : `data-ship="${u.id}"`, u.name, u.desc,
        guest ? { own: ship[u.id], ownTag: 'INSTALLED', why: ship[u.id] ? '' : `Only ${F.name || 'the host'} can upgrade their ship` }
          : { own: ship[u.id], price: `★${u.rep}`, why: p.rep < u.rep ? `Need ★${u.rep - p.rep} more reputation (missions)` : '' })).join('') + '</div>';
      html += `<p class="note">${guest ? `In this game you fly ${host}'s ship: this is its loadout, and only ${host} can buy upgrades for it. Your own ship (★ ${p.rep} reputation) waits for when you play solo or host a game; the reputation you earn here is yours.`
        : F ? 'You are the host: the crew flies your ship, with these upgrades. Everyone earns their own reputation.'
        : 'This is your own ship: its upgrades count when you play solo or host a game. In someone else\'s game you fly the host\'s ship.'}</p>`;
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-prof]').forEach(b => b.onclick = () => { if (!p.profession) { this.askProf = b.dataset.prof; this.shop(kind); } });
    box.querySelectorAll('[data-prof-yes]').forEach(b => b.onclick = () => { pickProfession(p, b.dataset.profYes); this.askProf = null; this.saved(kind); });
    box.querySelectorAll('[data-prof-no]').forEach(b => b.onclick = () => { this.askProf = null; this.shop(kind); });
    box.querySelectorAll('[data-gear]').forEach(b => b.onclick = () => { const g = GEAR.find(x => x.id === b.dataset.gear); if (p.money >= g.cost) { p.money -= g.cost; p.gear[g.id] = true; this.saved(kind); } });
    box.querySelectorAll('[data-ship]').forEach(b => b.onclick = () => { const u = SHIP_UPGRADES.find(x => x.id === b.dataset.ship); if (p.rep >= u.rep) { p.rep -= u.rep; p.ship[u.id] = true; this.saved(kind); } });
    this.el('shop').hidden = false;
  },
  saved(kind) { saveProfile(profile); this.shop(kind); this.render(); this.onProfile?.(); },
};
