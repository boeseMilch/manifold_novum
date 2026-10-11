// Progression: the campaign (story, briefings, objectives, rewards), ship upgrades bought with
// reputation, personal gear bought with money, professions (from level 2), and each player's saved
// profile (a cookie in their own browser).
//
//   Simulation side (browser and server): definitions, applyShipUpgrades(), applyKit(), perk(),
//   missionResults().
//   Browser side: the profile (load/save/migrate), rewards after a mission, the lobby UI, the
//   locker and the shipyard.
//
// PROFILES ARE SAVED IN PLAYERS' BROWSERS: keep loadProfile() able to read every older version
// (bump PROFILE_VERSION and add a migration step; never rename or drop fields without one).

const PROFILE_VERSION = 1;
const XP_LEVELS = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000];
const levelOf = (xp) => { let l = 1; while (l < XP_LEVELS.length && xp >= XP_LEVELS[l]) l++; return l; };

// ---------------------------------------------------------------------------
// Ship upgrades (reputation) — one for (nearly) every system
// ---------------------------------------------------------------------------
const SHIP_UPGRADES = [
  { id: 'spareCell', name: 'Spare fuel cell', rep: 2, desc: 'One more spare fuel cell in the crate.' },
  { id: 'coffee', name: 'Proper coffee machine', rep: 2, desc: 'The helm mug refills in 20 s instead of a minute.' },
  { id: 'inserter', name: 'Reactor fuel inserter', rep: 3, desc: 'Loads the next fuel cell into an empty reactor by itself. Scooch the cells left (click the crate\'s handle) to stop it.' },
  { id: 'cannons', name: 'Efficient cannons', rep: 3, desc: '4 shots per energy instead of 3.' },
  { id: 'kit2', name: 'Second repair kit', rep: 3, desc: 'A second repair kit in the right airlock room.' },
  { id: 'airlocks', name: 'Faster airlock pumps', rep: 3, desc: 'Deck airlocks cycle in 0.7 s instead of 1.3 s.' },
  { id: 'radar', name: 'Long-range radar', rep: 4, desc: 'The radar sees 60 s ahead instead of 45 s.' },
  { id: 'shields', name: 'Shield capacitors', rep: 4, desc: 'Shields stay up 3 s instead of 2 s.' },
  { id: 'caps', name: 'Bigger capacitors', rep: 5, desc: 'Capacitors hold 5 energy instead of 4.' },
  { id: 'hull', name: 'Reinforced hull', rep: 5, desc: 'A side has to take two big hits before the next one breaches it.' },
  { id: 'sprinklers', name: 'Fire sprinklers', rep: 5, desc: 'Fires spread every 22 s instead of 15 s.' },
  { id: 'autodoc', name: 'Auto-doc', rep: 6, desc: 'Treating a crewmate takes 1.2 s instead of 2 s.' },
];
// ---------------------------------------------------------------------------
// Personal gear (money) and professions (level 2+)
// ---------------------------------------------------------------------------
const GEAR = [
  { id: 'paint', name: 'Custom suit paint', cost: 50, level: 1, desc: 'Pick your own suit color.' },
  { id: 'boots', name: 'Gravity boots', cost: 150, level: 1, desc: 'Walk 15% faster, and walk normally where the gravity has failed.' },
  { id: 'thrusters', name: 'Suit thrusters', cost: 180, level: 2, desc: 'Spacewalk 30% faster.' },
  { id: 'armor', name: 'Armor vest', cost: 220, level: 3, desc: 'Shrugs off the first hit you take each mission.' },
  { id: 'stim', name: 'Stim pack', cost: 250, level: 4, desc: 'Down? Patch yourself up in 5 s instead of 10 s.' },
  { id: 'toolbelt', name: 'Toolbelt', cost: 300, level: 5, desc: 'Repairs and other hold-click jobs go 30% faster.' },
];
const PROFESSIONS = [
  { id: 'engineer', name: 'Engineer', desc: 'Starts with a repair kit of their own. Repairs 20% faster.' },
  { id: 'gunner', name: 'Gunner', desc: 'Cranks cannon reloads 50% faster.' },
  { id: 'medic', name: 'Medic', desc: 'Treats crewmates in 1 s. Patches themselves up in 6 s.' },
  { id: 'security', name: 'Security', desc: 'Starts with a laser gun of their own, and fires it faster.' },
];
const PAINTS = ['#c4683a', '#3a8fc4', '#5fb04a', '#c43a8f', '#c4b03a', '#8a5ac4', '#3ac4b0', '#e8e4dc', '#2b303a', '#ff7ab0'];

// ---------------------------------------------------------------------------
// The campaign
// ---------------------------------------------------------------------------
const evAt = (kind, t, more = {}) => ({ t, kind, ...more });
const CAMPAIGN = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];
Object.assign(MISSIONS, {
  c1: {
    name: '1 · First Contract', tier: 1, campaign: 1, rewards: { money: 100, perPirate: 40, rep: 1, xp: 80 },
    objective: { kind: 'pirates', count: 2 }, rules: {},
    blurb: 'Clear pirate raiders out of the trade lanes. $40 per pirate.',
    briefing: 'Congratulations on your new (used) ship! The Manifold Novum is held together by duct tape, optimism and one very large cat.\n\nFirst job, from the Tollgate Trade Guild: pirate raiders are robbing freighters in the Kessler lanes. The Guild pays $40 for every pirate you put down — a raider shot to scrap counts, and so does every boarder. If a raider docks, its crew comes over to steal. Make them regret it.\n\nTip: shoot the glowing blue bits.',
    build: () => [evAt('pirates', 30, { side: randSide() }), evAt('interceptor', 85, { side: randSide() }), evAt('pirates', 145, { side: randSide() }), evAt('swarm', 205), evAt('maintenance', 255, { radar: false })],
  },
  c2: {
    name: '2 · Strange Cargo', tier: 1, campaign: 2, rewards: { money: 150, rep: 1, xp: 100 },
    objective: { kind: 'intruder', count: 1 }, rules: {},
    blurb: 'Something crawled out of the bonus salvage pod. Kill it.',
    briefing: 'The Guild paid up — and threw in a sealed salvage pod as a bonus. Halfway through the next jump, the pod\'s seal hissed open.\n\nSomething with too many legs is loose on the ship. It forces its way around, room by room, and wrecks whatever it finds. Lock it in with the security console, get a weapon, and kill it. The Xenobiology Institute will pay for the remains.',
    build: () => [evAt('interceptor', 30, { side: randSide() }), evAt('intruder', 75, { side: randSide() }), evAt('frigate', 140, { side: randSide() }), evAt('swarm', 200), evAt('maintenance', 250, { radar: false })],
  },
  c3: {
    name: '3 · The Empty Lab', tier: 2, campaign: 3, rewards: { money: 200, rep: 2, xp: 140 },
    objective: { kind: 'blackbox' }, rules: { breach: true },
    blurb: 'Dr. Varga\'s lab went quiet. Bring back its black box.',
    briefing: 'The Institute wants to talk to the only expert on those things: Dr. Ilse Varga. Her research station went quiet a week ago.\n\nWhen you arrive, the lab module is drifting — dark, airless, its door jammed. We\'ll tether to it. Get inside, find the station\'s black box and carry it home (it\'s heavy). Watch the hull: big hits can tear holes in it now.\n\nAnd something is asleep in there. Don\'t wake it.',
    build: () => [evAt('derelict', 15, { side: randSide() }), evAt('interceptor', 60, { side: randSide() }), evAt('swarm', 100), evAt('mines', 140, { side: randSide() }), evAt('flare', 185), evAt('maintenance', 230, { radar: false })],
  },
  c4: {
    name: '4 · Red Comet Cove', tier: 2, campaign: 4, rewards: { money: 200, perPirate: 50, rep: 2, xp: 160 },
    objective: { kind: 'pirates', count: 3 }, rules: { breach: true, surge: true },
    blurb: 'Pirates took Dr. Varga. Hunt the Red Comet gang.',
    briefing: 'The black box recording is clear: pirates of the Red Comet gang boarded the lab and dragged Dr. Varga away.\n\nTheir raiders patrol the Cove. Take them on — defeat at least three pirates. If they dock, board them back: their loot crate is full, and jamming their reactor sends them running. Power lines can arc now; splice them with the repair kit.',
    build: () => [evAt('pirates', 25, { side: 'port' }), evAt('interceptor', 70, { side: 'star' }), evAt('pirates', 115, { side: randSide() }), evAt('mines', 160, { side: randSide() }), evAt('glitch', 200, { radar: false }), evAt('swarm', 240)],
  },
  c5: {
    name: '5 · Rescue Dr. Varga', tier: 3, campaign: 5, rewards: { money: 300, rep: 3, xp: 200 },
    objective: { kind: 'rescue', npc: 'Dr. Varga' }, rules: { breach: true, surge: true, gravity: true },
    blurb: 'Dock with the pirates\' prison barge and bring Dr. Varga home.',
    briefing: 'We tracked the Red Comet\'s prison barge. Dr. Varga is aboard — hurt, by the sound of her distress ping.\n\nWhen the barge docks, get past the guards, find her in the cargo hold, patch her up (hold click on her) and lead her back. She\'ll follow your footsteps, slowly. Don\'t let the barge cast off with her still on it.',
    build: () => [evAt('brig', 20, { side: randSide() }), evAt('interceptor', 65, { side: randSide() }), evAt('stealth', 110, { side: randSide() }), evAt('maintenance', 150, { radar: false }), evAt('storm', 190), evAt('swarm', 230)],
  },
  c6: {
    name: '6 · Spore Season', tier: 3, campaign: 6, rewards: { money: 300, rep: 3, xp: 220 },
    objective: { kind: 'ore' }, rules: { breach: true, surge: true, plasma: true },
    blurb: 'Drill a sample of the living rock in the Mire Nebula.',
    briefing: 'Dr. Varga is grateful — and terrified. The intruder\'s DNA matches the spore fields of the Mire Nebula, where those creatures nest.\n\nShe needs a sample of the living rock they grow on. It will park right in front of us: take the mining drill (left airlock room), spacewalk out and drill a sample, then bring it inside. The nebula will notice. Expect spores, barnacles and leeches.',
    build: () => [evAt('rock', 8), evAt('spores', 35, { side: randSide() }), evAt('leeches', 80, { side: randSide() }), evAt('mother', 120, { side: randSide() }), evAt('swarm', 170), evAt('coolant', 210, { radar: false }), evAt('grappler', 245, { side: randSide() })],
  },
  c7: {
    name: '7 · The Deep', tier: 3, campaign: 7, rewards: { money: 350, rep: 3, xp: 260 },
    objective: null, rules: { breach: true, surge: true, gravity: true, plasma: true, coils: true, handle: true },
    blurb: 'Fly into the deep beyond the Mire and get out alive.',
    briefing: 'The sample proves it: the spores are being herded. Something big lives in the deep beyond the Mire.\n\nFly in, take readings, survive. Out there the jump drive is fussy: the three jump coils on the hull have to be aligned on a spacewalk, and when it spools up someone has to pull and hold the jump handle at the helm.',
    build: (target) => shuffledTimeline(['interceptor', 'frigate', 'swarm', 'intruder', 'mines', 'spores', 'antenna', 'flare', 'storm', 'stealth', 'tractor', 'grappler', 'leeches'], target, 20, 19),
  },
  c8: {
    name: '8 · The Mother of All', tier: 4, campaign: 8, rewards: { money: 500, rep: 5, xp: 400 },
    objective: null, rules: { breach: true, surge: true, gravity: true, plasma: true, coils: true, handle: true },
    blurb: 'Sit next to the leviathan for five minutes. Survive.',
    briefing: 'Varga\'s theory: the swarms answer to one creature. To prove it, someone has to sit right next to it for five minutes and survive.\n\nThat someone is you. Everything out there will come for the ship at once. Good luck — and bring the cat.',
    build: (target) => [...shuffledTimeline(['interceptor', 'frigate', 'swarm', 'intruder', 'maintenance', 'mines', 'spores', 'debris', 'flare', 'storm', 'coolant', 'glitch', 'stealth', 'tractor', 'grappler', 'leeches', 'mother', 'pirates'], target, 15, 14), evAt('leviathan', 150)],
  },
  practice: {
    name: 'Practice', tier: 0, practice: true, rules: {}, objective: null,
    blurb: 'Free play: start any encounter, damage or mini-game from the practice panel.',
    briefing: 'No timeline, no jump: the ship is yours. Open the PRACTICE panel (button at the top right, or the P key) to start any encounter, damage type or mini-game, switch the harder rules on, fill the capacitors or clear everything.',
    build: () => [],
  },
});
const SKIRMISH = ['intro', 'rush', 'ore', 'pirates', 'salvage', 'rescue', 'deep', 'nightmare'];
EVENT_SIDES.brig = randSide;
EVENT_RUNNERS.brig = (ev) => dockShip('pirate', ev.side, { npc: true });
EVENT_LABELS.brig = (ev) => `Prison barge — ${SIDE_NAME[ev.side]}`;
const npcName = () => mission.objective?.npc || 'the engineer';

// ---------------------------------------------------------------------------
// Simulation side: upgrades, kits, perks, results
// ---------------------------------------------------------------------------
function applyShipUpgrades(ship = {}) {
  const has = (id) => !!ship[id];
  SHOTS_PER_ENERGY = has('cannons') ? 4 : 3;
  SHIELD_UP_TIME = has('shields') ? 3 : 2;
  CAP_MAX = has('caps') ? 5 : 4;
  FIRE_TIME = has('sprinklers') ? 22 : 15;
  RADAR_RANGE = has('radar') ? 60 : 45;
  LOCK_CYCLE = has('airlocks') ? 0.7 : 1.3;
  COFFEE_REFILL = has('coffee') ? 20 : 60;
  TREAT_TIME = has('autodoc') ? 1.2 : 2;
}
// At mission start: the ship's one-off extras.
function shipStartExtras(ship = {}) {
  if (ship.spareCell) power.reserve += 1;
  power.inserter = ship.inserter ? { on: true, t: 0 } : null;
  if (ship.kit2 && ITEMS.filter(i => i.kind === 'repair').length < 2) ITEMS.push({ kind: 'repair', x: 34.6, y: 21.2 });
  hz.hullTough = !!ship.hull;
}
const perk = (c, id) => !!(c?.kit?.gear?.[id]) || c?.kit?.profession === id;
// A player's kit (gear, profession, paint) on their crew member; starting items from the profession.
function applyKit(c, kit) {
  c.kit = kit ? { gear: { ...(kit.gear || {}) }, profession: kit.profession || null, paint: kit.paint || null } : { gear: {}, profession: null };
  if (c.kit.gear.paint && c.kit.paint) c.color = c.kit.paint;
  c.armor = c.kit.gear.armor ? 1 : 0;
  if (c.kit.profession === 'engineer' && !c.inv.weapon) c.inv.weapon = 'repair';
  if (c.kit.profession === 'security' && !c.inv.weapon) c.inv.weapon = 'laser';
}
// Speed multiplier from gear (used by updateCrew).
function gearSpeed(c) {
  if (c.mode === 'eva') return perk(c, 'thrusters') ? 1.3 : 1;
  return perk(c, 'boots') ? 1.15 : 1;
}
// Hold-click jobs (repairs etc.): speed multiplier for this crew member.
const holdSpeed = (c) => (perk(c, 'toolbelt') ? 1.3 : 1) * (c?.kit?.profession === 'engineer' ? 1.2 : 1);
// The inserter: an empty reactor gets the next cell from the crate, unless the cells are scooched away.
function updateInserter(dt) {
  const I = power.inserter;
  if (!I) return;
  if (!I.on || power.reactor.fuel > 0 || power.reserve <= 0 || broken(REACTOR)) { I.t = 0; return; }
  if ((I.t += dt) >= 2) { I.t = 0; power.reserve--; power.reactor.fuel = CELL_ENERGY; power.reactor.t = 0; sfx.hatch(); combatBanner('The inserter loaded a fuel cell'); }
}
// What happened, for the rewards (each browser credits its own player).
function missionResults(jumped) {
  const obj = objectiveStatus();
  return {
    jumped, objective: !!obj.done && !!mission.objective, pirates: dk.defeated, kills: mission.kills || 0,
    crew: crew.map(c => ({ id: c.id, survived: jumped && c.mode === 'inside' && !inDock(c.x, c.y) && standing(c) })),
  };
}
// Rewards for one player from a mission's results.
function computeRewards(id, results, survived, firstClear) {
  const M = MISSIONS[id] || {}, R = M.rewards || { money: 40, rep: 0, xp: 50 };
  if (!results.jumped) return { xp: 0, money: 0, rep: 0 };
  const objOk = results.objective || !M.objective;
  const money = (objOk ? R.money : 0) + (R.perPirate || 0) * (results.pirates || 0);
  const rep = objOk ? (R.rep || 0) + (firstClear ? 1 : 0) : 0;
  const xp = survived ? Math.round((R.xp || 50) * (objOk ? 1 : 0.5)) : 0;
  return { xp, money, rep };
}

// The inserter: an arm from the fuel crate to the reactor's slot (and a handle to scooch the cells).
function drawInserter(t) {
  const I = power.inserter;
  if (!I) return;
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
function defaultProfile() {
  return { v: PROFILE_VERSION, xp: 0, money: 0, rep: 0, done: {}, ship: {}, gear: {}, profession: null, paint: null, lastRun: null };
}
// Reads any older version; unknown fields are kept, missing ones get defaults.
function migrateProfile(p) {
  if (!p || typeof p !== 'object') return defaultProfile();
  const out = { ...defaultProfile(), ...p };
  for (const k of ['done', 'ship', 'gear']) out[k] = { ...(p[k] && typeof p[k] === 'object' ? p[k] : {}) };
  out.xp = +out.xp || 0; out.money = +out.money || 0; out.rep = +out.rep || 0;
  // (future: if (p.v < 2) { …convert… })
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
  const out = new Set(['practice', 'intro', 'rush', 'c1']);
  CAMPAIGN.forEach((id, i) => { if (p.done[id]) { out.add(id); if (CAMPAIGN[i + 1]) out.add(CAMPAIGN[i + 1]); } });
  if (p.done.c3) ['salvage', 'ore'].forEach(id => out.add(id));
  if (p.done.c4) out.add('pirates');
  if (p.done.c5) out.add('rescue');
  if (p.done.c6) out.add('deep');
  if (p.done.c7) out.add('nightmare');
  return out;
};

// After a mission (once per run): credit this player.
let lastReward = null;
function creditMission() {
  const o = mission.over;
  if (!o || !o.results || !mission.runId || profile.lastRun === mission.runId || mission.id === 'practice') return;
  const mine = o.results.crew.find(c => c.id === me.id);
  const first = !profile.done[mission.id] && o.results.objective;
  const r = computeRewards(mission.id, o.results, !!mine?.survived, first);
  const lv0 = levelOf(profile.xp);
  profile.xp += r.xp; profile.money += r.money; profile.rep += r.rep;
  if (o.results.jumped && (o.results.objective || !MISSIONS[mission.id]?.objective)) profile.done[mission.id] = (profile.done[mission.id] || 0) + 1;
  profile.lastRun = mission.runId;
  saveProfile(profile);
  lastReward = { ...r, survived: !!mine?.survived, levelUp: levelOf(profile.xp) > lv0 ? levelOf(profile.xp) : 0, unlocked: CAMPAIGN[CAMPAIGN.indexOf(mission.id) + 1] && first ? MISSIONS[CAMPAIGN[CAMPAIGN.indexOf(mission.id) + 1]].name : null };
}
// The rewards block on the end screen.
function drawRewards(cx, y) {
  if (!lastReward || mission.id === 'practice') return;
  const r = lastReward;
  ctx.textAlign = 'center'; ctx.font = '700 16px system-ui, sans-serif'; ctx.fillStyle = '#ffe08a';
  ctx.fillText(`+${r.xp} XP${r.survived ? '' : ' (you didn\'t make it back aboard on your feet)'}  ·  +$${r.money}  ·  +${r.rep} reputation`, cx, y);
  if (r.levelUp) { ctx.fillStyle = '#7af0b0'; ctx.font = '800 18px system-ui, sans-serif'; ctx.fillText(`LEVEL UP — level ${r.levelUp}!${r.levelUp === 2 ? ' Pick a profession in the locker.' : ''}`, cx, y + 26); }
  if (r.unlocked) { ctx.fillStyle = '#9cd8ff'; ctx.font = '600 14px system-ui, sans-serif'; ctx.fillText(`Unlocked: ${r.unlocked}`, cx, y + (r.levelUp ? 50 : 26)); }
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Browser side: lobby, locker, shipyard (DOM)
// ---------------------------------------------------------------------------
const lobbyUI = {
  tab: 'campaign', union: null, onPick: null, onProfile: null,
  el: (id) => document.getElementById(id),
  init(onPick, onProfile) {
    this.onPick = onPick; this.onProfile = onProfile;
    for (const b of document.querySelectorAll('#lobby-tabs button')) b.onclick = () => { this.tab = b.dataset.tab; this.render(); };
    this.el('lobby-locker').onclick = () => this.shop('locker');
    this.el('lobby-shipyard').onclick = () => this.shop('shipyard');
    this.el('shop-close').onclick = () => { this.el('shop').hidden = true; };
  },
  available() { const u = unlockedMissions(); if (this.union) for (const id of this.union) u.add(id); return u; },
  render(chosen) {
    if (chosen) this.chosen = chosen;
    const p = profile, lv = levelOf(p.xp), next = XP_LEVELS[lv] ?? null, prev = XP_LEVELS[lv - 1] || 0;
    this.el('lobby-profile').innerHTML = `<b>Level ${lv}</b>${p.profession ? ` · ${PROFESSIONS.find(x => x.id === p.profession)?.name}` : ''}
      <span class="bar"><i style="width:${next ? Math.round((p.xp - prev) / (next - prev) * 100) : 100}%"></i></span>
      <span>${p.xp} XP</span><span>$${p.money}</span><span>★ ${p.rep} reputation</span>`;
    for (const b of document.querySelectorAll('#lobby-tabs button')) b.classList.toggle('chosen', b.dataset.tab === this.tab);
    const ids = this.tab === 'campaign' ? CAMPAIGN : this.tab === 'skirmish' ? SKIRMISH : ['practice'];
    const avail = this.available(), list = this.el('lobby-missions');
    list.innerHTML = '';
    for (const id of ids) {
      const m = MISSIONS[id]; if (!m) continue;
      const open = avail.has(id), b = document.createElement('button');
      b.className = 'mission' + (id === this.chosen ? ' chosen' : '') + (open ? '' : ' locked'); b.dataset.id = id;
      b.innerHTML = `<b>${open ? '' : '🔒 '}${m.name}${m.tier ? ` <em>${'★'.repeat(m.tier)}</em>` : ''}${p.done[id] ? ' <em class="done">✔</em>' : ''}</b><span>${m.blurb}</span>`;
      b.onclick = () => { if (!open) return; this.chosen = id; this.onPick(id); this.render(); };
      list.appendChild(b);
    }
    const m = MISSIONS[this.chosen];
    if (m) {
      const R = m.rewards, obj = m.objective;
      const objText = !obj ? 'Survive until the jump.' : obj.kind === 'pirates' ? `Defeat ${obj.count} pirates.` : obj.kind === 'intruder' ? 'Kill the intruder.' : obj.kind === 'blackbox' ? 'Bring the black box aboard.' : obj.kind === 'rescue' ? `Rescue ${obj.npc || 'the engineer'}.` : obj.kind === 'ore' ? 'Drill an ore sample and bring it aboard.' : '';
      this.el('lobby-brief').innerHTML = `<h3>${m.name}</h3>${(m.briefing || m.blurb).split('\n\n').map(s => `<p>${escapeHtml(s)}</p>`).join('')}
        ${m.practice ? '' : `<p class="obj"><b>Objective:</b> ${objText}${R ? ` <b>Pay:</b> $${R.money}${R.perPirate ? ` + $${R.perPirate} per pirate` : ''} · ★${R.rep} · ${R.xp} XP (if you make it back aboard on your feet)` : ''}</p>`}`;
    }
  },
  shop(kind) {
    const p = profile, lv = levelOf(p.xp), box = this.el('shop-body');
    this.el('shop-title').textContent = kind === 'locker' ? `LOCKER — $${p.money} · level ${lv}` : `SHIPYARD — ★ ${p.rep} reputation`;
    let html = '';
    if (kind === 'locker') {
      html += `<h4>Profession ${lv < 2 ? '(from level 2)' : ''}</h4><div class="grid">` + PROFESSIONS.map(x => `<button class="item${p.profession === x.id ? ' chosen' : ''}" data-prof="${x.id}" ${lv < 2 ? 'disabled' : ''}><b>${x.name}</b><span>${x.desc}</span></button>`).join('') + '</div>';
      html += '<h4>Gear</h4><div class="grid">' + GEAR.map(g => { const own = p.gear[g.id], ok = !own && p.money >= g.cost && lv >= g.level;
        return `<button class="item${own ? ' chosen' : ''}" data-gear="${g.id}" ${ok ? '' : 'disabled'}><b>${g.name} ${own ? '✔' : `· $${g.cost}${lv < g.level ? ` · level ${g.level}` : ''}`}</b><span>${g.desc}</span></button>`; }).join('') + '</div>';
      if (p.gear.paint) html += '<h4>Suit color</h4><div class="paints">' + PAINTS.map(c => `<button class="paint${p.paint === c ? ' chosen' : ''}" data-paint="${c}" style="background:${c}"></button>`).join('') + '</div>';
    } else {
      html += '<div class="grid">' + SHIP_UPGRADES.map(u => { const own = p.ship[u.id], ok = !own && p.rep >= u.rep;
        return `<button class="item${own ? ' chosen' : ''}" data-ship="${u.id}" ${ok ? '' : 'disabled'}><b>${u.name} ${own ? '✔' : `· ★${u.rep}`}</b><span>${u.desc}</span></button>`; }).join('') + '</div>';
      html += '<p class="note">In multiplayer, the ship gets every upgrade anyone in the crew has bought.</p>';
    }
    box.innerHTML = html;
    box.querySelectorAll('[data-prof]').forEach(b => b.onclick = () => { p.profession = b.dataset.prof; this.saved(kind); });
    box.querySelectorAll('[data-gear]').forEach(b => b.onclick = () => { const g = GEAR.find(x => x.id === b.dataset.gear); if (p.money >= g.cost) { p.money -= g.cost; p.gear[g.id] = true; this.saved(kind); } });
    box.querySelectorAll('[data-paint]').forEach(b => b.onclick = () => { p.paint = b.dataset.paint; this.saved(kind); });
    box.querySelectorAll('[data-ship]').forEach(b => b.onclick = () => { const u = SHIP_UPGRADES.find(x => x.id === b.dataset.ship); if (p.rep >= u.rep) { p.rep -= u.rep; p.ship[u.id] = true; this.saved(kind); } });
    this.el('shop').hidden = false;
  },
  saved(kind) { saveProfile(profile); this.shop(kind); this.render(); this.onProfile?.(); },
};
