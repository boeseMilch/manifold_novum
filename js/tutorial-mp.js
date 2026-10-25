// Crew training (mission `training`): RAIDER basic training for the whole crew at once, side by side. The solo
// tutorial (js/tutorial.js) is a railroad that pauses the game for its messages; this one never pauses and has
// no railroad: every player has their own lesson track, and a scheduler hands out the lessons in parallel.
//
//   - Runs in the simulation (multiplayer: the server; solo: this page, ?mission=training&autostart), 1-8 players.
//     Everything a browser needs is in `train` (synced as `train` in the snapshot: js/net.js); browsers only read
//     it and send ['train', 'next'] (a click on their card: the next page, or fold it away).
//   - Lessons are data: TR_LESSONS[id] = { core, short, title, icon, spawns, plan(P, c), start, tick → true when
//     done, todo, target, marks, stop(why), rearm, outro }. Core (everyone): helm, radar, gun, fuel, lever, fire,
//     repair. Extras (fillers while you wait, and everything once your core is done): asteroids, shields, firstAid,
//     medic, security, override, coffee, eva and the tour stops. Each player walks the core in their own rotation
//     of the order (so a crew spreads out over the ship), taking the next one that's free.
//   - Scheduler (trSchedule, every TR_SCHED s): stations have capacities (TR_RES_CAP: one lever, one reactor, one
//     repair kit, a cannon each, two extinguishers, ...) and the encounters a lesson makes are capped (TR_CAP:
//     at most 2 interceptors, 1 swarm, 2 fires, 2 broken parts, 4 in all, at any crew size). A lesson starts
//     only when its stations are free and its encounters fit; else the player gets a filler, or a waiting card.
//   - No pausing: each player's instruction card (drawTrainingHUD, top centre, only their own) turns its pages
//     by itself (or on a click) while the game runs on; ▶ the one-line goal sits under it. Each player's job is
//     also a task plate with their name (js/claims.js addTaskPlate, claimed for them: their arrows), and the real
//     encounter plates their lessons make (their fire, their interceptor) are claimed for them too.
//   - Lock-ups (see PLAN.md, Crew training): stations reserved for a lesson can't be used by anyone else
//     (trainAllows, asked through game.js tutAllows, also in the browser); someone else finishing your fire /
//     repair / coil / door hands you theirs or credits them and gives you a new one (trCredit); a claim
//     take-over of a training plate is undone (or handed over to an idle player who needs it); leaving cleans up
//     (and keeps your progress for a rejoin under the same name); joining starts a welcome card; hits are
//     harmless; nobody stays down; a stuck lesson (AFK) is dropped and offered again later.
//   - Graduation: when every player aboard has done the core, the jump handle opens (rule `handle`): the jump
//     ends the mission. No pay, no profile entry (js/progress.js creditMission); each browser remembers
//     'mn-tutorial-done' once its player's core is done.
// Nothing here runs unless mission.id is 'training' (every hook in the other files checks this file exists).

const TR_SCHED = 0.25, TR_WELCOME = 10, TR_AFK = 120, TR_AFK_EXTRA = 45, TR_REARM = 3, TR_AWAY = 60, TR_CORE_N = 7;   // (s; an extra nobody touches frees its station sooner)
const TR_CAP = { enemy: 2, swarm: 1, fire: 2, broken: 2, total: 4 };
const TR_RES_CAP = { helm: 2, radar: 2, gun_port: 1, gun_star: 1, gun_front: 1, reactor: 1, lever: 1, kit: 1, ext: 2,
  shield_port: 1, shield_front: 1, shield_star: 1, coil_left: 1, coil_right: 1, coil_rear: 1, security: 1, door: 1 };
const TR_CORE = ['helm', 'radar', 'gun', 'fuel', 'lever', 'fire', 'repair'];
const TR_EXTRAS = ['medic', 'shields', 'eva', 'firstAid', 'security', 'override', 'asteroids', 'coffee', 'tour_laser', 'tour_plates', 'tour_vent', 'tour_patch', 'tour_snack', 'tour_jump'];
const TR_SIDE = { port: 'left', star: 'right', front: 'front' };

// Synced: { on, runId, grad, res: { station: [crewId] }, p: { [crewId]: record } }. A record:
//   { id, name, lesson, title, n ('3/7' | 'extra'), todo, say: { id, pages, i, hide }, note, marks: [{x, y, r}],
//     core: [lesson ids done], extra: [...], state: 'welcome' | 'lesson' | 'waiting' | 'done', wait }
const train = { on: false, runId: null, grad: false, res: {}, p: {} };
const trPriv = new Map();                             // crewId → { d (the lesson's data), t, prog, ph, pageT, idle, cool, skip, ... }
const trByName = new Map();                           // name → { core, extra }: a player who left (back under the same name: restored)
let trSchedT = 0, trSayId = 0, trEvId = 1000, trOffsets = 0;
const trOn = () => !!train.on && mission.active && mission.id === 'training';
const trCrew = (id) => crew.find(c => c.id === id) || null;
const trName = (id) => train.p[id]?.name || trCrew(id)?.name || 'Someone';
const trD = (P) => trPriv.get(P.id)?.d || null;
const lcName = (s) => s.name.charAt(0).toLowerCase() + s.name.slice(1);
const trSys = (name) => SYSTEMS.find(s => s.name === name);
const trDist = (c, x, y) => Math.hypot(c.x - x, c.y - y);

MISSIONS.training = {
  name: 'Crew training', tutorial: true, rules: {}, objective: null,
  blurb: 'RAIDER basic training for the whole crew, side by side: everyone learns every station, nobody waits, nothing pauses.',
  build: () => [],
};

// ---------------------------------------------------------------------------
// Cards: pages, notes (simulation side)
// ---------------------------------------------------------------------------
// Control words, filled in by each browser from its own controls (localStorage 'mn-controls'); plates and
// arrows get the neutral version.
const TR_TOK = {
  use: ['click it', 'press *E* next to it', 'click / E'],
  fire: ['a *left click*', '*Space*', 'click / Space'],
  aim: ['move the mouse', 'hold the *arrow keys* (or *W A S D*)', 'mouse / arrows'],
  cover: ['hold the *right mouse button*', 'hold *Shift*', 'hold right click / Shift'],
  spray: ['hold the *right mouse button* towards it', 'face it and hold *Space*', 'hold right click / Space'],
  kit: ['*hold right click* on it', 'stand next to it and *hold Space*', 'hold right click / Space'],
  hub: ['click the *hub* in the middle of the lever', 'stand at the lever and *hold E*', 'click the hub / hold E'],
  handle: ['click its *handle*', '*tap E* at the lever', 'click the handle / tap E'],
  reload: ['*R* (or click *RELOAD*)', '*R*', 'R'],
  down: ['click *CLIMB DOWN* or press *E*', 'press *E*', 'CLIMB DOWN / E'],
  treat: ['*hold click* on them', 'stand next to them and *hold E*', 'hold click / E on them'],
  getup: ['*hold E* (or click on yourself)', '*hold E*', 'hold E'],
};
let trControls = 'mouse';
function trText(s, neutral = false) {
  const k = neutral ? 2 : trControls === 'keyboard' ? 1 : 0;
  return String(s || '').replace(/\{(\w+)\}/g, (m, w) => (TR_TOK[w] ? TR_TOK[w][k] : m));
}
const trPlain = (s) => trText(s, true).replace(/\*/g, '');
const trPageTime = (s) => Math.max(4, String(s).split(/\s+/).length * 0.33);
// A new set of pages on P's card (what was left of the welcome, or a finished lesson's outro, goes first).
function trSay(P, pages) {
  const pre = P.prefix || []; P.prefix = null;
  P.say = { id: ++trSayId, pages: [...pre, ...pages].map(String), i: 0, hide: false };
  const pv = trPriv.get(P.id); if (pv) pv.pageT = 0;
}
// A short line for one player (another one's job, a steal, a hint), shown over their ▶ goal for a while.
function trNote(P, text, t = 7) { if (!P) return; P.note = String(text); const pv = trPriv.get(P.id); if (pv) pv.noteT = t; }
// A click on your card: the next page; on the last one it folds away (and back).
function trainCommand(arg) {
  const P = train.p[player.id];
  if (!trOn() || !P?.say || arg !== 'next') return;
  if (P.say.i < P.say.pages.length - 1 && !P.say.hide) { P.say.i++; const pv = trPriv.get(P.id); if (pv) { pv.pageT = 0; pv.prog = mission.t; } }
  else P.say.hide = !P.say.hide;
}

// ---------------------------------------------------------------------------
// Stations and encounters
// ---------------------------------------------------------------------------
const trHolders = (k) => train.res[k] || [];
const trCap = (k) => (k === 'ext' ? Math.min(TR_RES_CAP.ext, trCount('extinguisher')) : TR_RES_CAP[k] ?? 1);
const trFree = (k, id) => trHolders(k).filter(x => x !== id).length < trCap(k);
const trCount = (kind) => ITEMS.filter(i => i.kind === kind).length + crew.filter(c => c.inv.weapon === kind || c.inv.item === kind).length + (hz.floating || []).filter(f => f.kind === kind).length;
const gunFree = (side, id) => trFree('gun_' + side, id) && !crew.some(c => c.id !== id && c.mode === 'gun' && c.gun?.id === side);
// Encounters on the ship now: each kind the larger of what's there and what the running lessons are making.
function trEncounters() {
  const planned = { enemy: 0, swarm: 0, fire: 0, broken: 0 };
  for (const P of Object.values(train.p)) { const s = P.lesson && TR_LESSONS[P.lesson].spawns; if (s) for (const k in s) planned[k] += s[k]; }
  const real = { enemy: combat.enemies.filter(e => e.phase === 'fighting').length, swarm: combat.swarm || combat.asteroids.length ? 1 : 0, fire: fires.length, broken: SYSTEMS.filter(s => s.broken).length };
  const used = {}; for (const k in planned) used[k] = Math.max(planned[k], real[k]);
  return used;
}
function trFits(spawns) {
  if (!spawns) return true;
  const u = trEncounters(); let total = Object.values(u).reduce((a, b) => a + b, 0);
  for (const k in spawns) { if (u[k] + spawns[k] > TR_CAP[k]) return false; total += spawns[k]; }
  return total <= TR_CAP.total;
}
// Which reserved station a target belongs to (an interaction target, a prompt: { text, x, y, hold, ... }).
function trStationOf(t) {
  if (!t) return null;
  if (t.x === LEVER.x && t.y === LEVER.y) return 'lever';
  const s = t.text || '';
  if (/load the fuel cell|swap in a fresh cell/.test(s)) return 'reactor';
  let m = /climb into the (left|right|front) cannon/.exec(s);
  if (m) return 'gun_' + { left: 'port', right: 'star', front: 'front' }[m[1]];
  m = /raise the (left|front|right) shield/.exec(s);
  if (m) return 'shield_' + { left: 'port', right: 'star', front: 'front' }[m[1]];
  if (/open the security console/.test(s)) return 'security';
  if (/take the repair kit/.test(s)) return 'kit';
  if (/^coil/.test(t.hold?.id || '')) return 'coil_' + t.hold.id.slice(4);
  return null;
}
// The gate (game.js tutAllows): someone else's reserved station is closed to you. Reads only train.res and the
// crew id, so a browser (netLocalPrompt, hover) agrees with the server. The debug menu is off in training.
function trainAllows(c, what, t) {
  if (!train.on || !c || mission.id !== 'training') return true;
  if (what === 'debug') return false;
  if (what !== 'target') return true;
  const k = trStationOf(t);
  if (!k) return true;
  const who = trHolders(k);
  return !who.length || who.includes(c.id);
}
function trainDenyText(c, t) {
  if (trainAllows(c, 'target', t)) return null;
  const id = trHolders(trStationOf(t)).find(x => x !== c.id), L = TR_LESSONS[train.p[id]?.lesson];
  return `Reserved: ${trName(id)}'s ${L ? L.title.toLowerCase() : ''} training — try again in a moment`.replace('  ', ' ');
}
// Enemy hits are for show (combat.js shipHit / crewHit). In the block lesson a hit on that side means it got through.
function trainHit(kind, side, c) {
  if (!trOn()) return false;
  for (const P of Object.values(train.p)) {
    const d = trD(P);
    if (P.lesson === 'gun' && d?.ph === 'block' && d.sub === 'flying' && d.side === side) d.hit = true;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Helpers for the lessons
// ---------------------------------------------------------------------------
const trSay1 = (P, d, key, pages) => { if (!d.said?.[key]) { (d.said ||= {})[key] = true; trSay(P, pages); } };
// "Training stock": an empty capacitor a learner needs gets one energy after a short wait.
function trStock(d, i, dt, wait = 2) {
  const c = CAPACITORS[i];
  if (broken(c) || c.charge > 0) { d.stockT = 0; return; }
  if ((d.stockT = (d.stockT || 0) + dt) >= wait) { c.charge = 1; c.pulse = 1; d.stockT = 0; }
}
const itemSpot = (kind) => nearestTo({ x: 22, y: 12 }, ITEMS.filter(i => i.kind === kind));
// The arrow's next stop for a job that needs a tool: the tool first (or whoever has it), then the job.
const trToolFirst = (c, kind, what, step) => (c.inv.weapon === kind ? step : fetchStep(c, kind, what) || step);
const trPoiAt = (e, id) => { const p = e?.pois.find(p => p.id === id); if (!p) return null; const [x, y] = enemyToWorld(e, ...p.c); return { x, y, r: 0.5 }; };
const trInGun = (c, side) => c.mode === 'gun' && c.gun?.id === side;
const trHatch = (side) => { const g = GUNS.find(g => g.id === side); return { x: g.hatch[0], y: g.hatch[1] }; };
// Parts the lessons may set on fire / break: never the cannons, capacitors, reactor, lever or doors.
const trSafeParts = (kinds = ['shield']) => SYSTEMS.filter(s => kinds.includes(s.kind) && !s.broken && !burning(s) && !(s.kind === 'shield' && trHolders('shield_' + s.ref.side).length));
const TR_FIRE_PARTS = ['shield', 'hatch'];
function trHoldFire(e) { e.fireT = Math.max(e.fireT, 3); e.target = null; }
function trRemoveEnemy(e) { if (!e) return; e.stopCharge?.(); combat.enemies = combat.enemies.filter(x => x !== e); combat.shots = combat.shots.filter(s => s.side !== e.side || combat.enemies.some(x => x.side === e.side)); }

// ---------------------------------------------------------------------------
// The lessons
// ---------------------------------------------------------------------------
const TR_LESSONS = {
  // ----- core -----
  helm: {
    core: true, short: true, title: 'HELM', icon: 'ping',
    plan: (P) => (trFree('helm', P.id) ? { res: ['helm'] } : null),
    start(P, c, d) { d.ph = 'go'; trSay(P, ['The *helm*, at the front of the bridge: the ship\'s *systems diagnosis* lives there. Walk up to it and {use}.']); },
    tick(P, c, d) {
      if (d.ph === 'go' && c.ui.panel === 'diagnosis') {
        d.ph = 'read'; d.t0 = mission.t;
        const w = maintWarnings()[0];
        trSay(P, [
          'This is the *systems diagnosis*: every part of the ship and how it\'s doing. Green means fine.',
          w ? `Two lines are *yellow*: "irregular readings" on the *${lcName(w.sys)}* and the *${lcName(w.decoy)}*. RAIDER engineering calls that "character".` : 'A *yellow* line means "irregular readings". RAIDER engineering calls that "character".',
          'On a real mission one of a yellow pair *fails* later. Before it does, its line turns *orange* and counts down: service it with the *repair kit* then and it won\'t break. The other one is just being dramatic.',
          'Close the panel with *E* or *Esc* when you\'ve read it.',
        ]);
      }
      return d.ph === 'read' && c.ui.panel !== 'diagnosis' && mission.t - d.t0 > 3;
    },
    todo: (P, c, d) => (d.ph === 'go' ? 'Walk to the helm (front of the bridge) and {use}' : c.ui.panel ? 'Read the diagnosis, then close it: E or Esc' : 'Diagnosis read'),
    target: (P, c, d) => (d.ph === 'go' ? [{ x: HELM.x, y: HELM.y + 0.5, hint: 'Click the helm (or E): run the diagnosis' }] : []),
    outro: ['That\'s the helm. Pop back any time to see what\'s about to break.'],
  },
  radar: {
    core: true, short: true, title: 'RADAR', icon: 'ping',
    plan: (P) => (trFree('radar', P.id) ? { res: ['radar'] } : null),
    start(P, c, d) {
      d.ph = 'scan'; d.t0 = mission.t; d.side = Math.random() < 0.5 ? 'port' : 'star';
      d.ev = { id: trEvId++, kind: 'interceptor', side: d.side, t: mission.t + 30, t1: mission.t + 30, radar: true, done: false, train: P.id };
      mission.events.push(d.ev);
      trSay(P, ['The *radar*: the big map table in the middle of the bridge. Walk up to it and {use} to scan.']);
    },
    tick(P, c, d) {
      if (!d.ev.done) d.ev.t = d.ev.t1 = mission.t + 30;                    // (a contact that never arrives)
      if (d.ph === 'scan' && mission.lastScanBy === P.id && mission.lastScan >= d.t0) {
        d.ph = 'seen'; d.t1 = mission.t;
        trSay(P, [
          `The radar shows everything that comes at us in the next ${RADAR_RANGE} seconds. What it finds goes into the *list on the left*, with the time until it arrives.`,
          `That *interceptor* on the *${TR_SIDE[d.side]}*? A training pirate, parked out there for whoever does gunnery. RAIDER thinks of everything.`,
        ]);
      }
      return d.ph === 'seen' && mission.t - d.t1 > 6;
    },
    stop(P, c, d) { mission.events = mission.events.filter(e => e !== d.ev); mission.revealed?.delete(d.ev.id); },
    todo: (P, c, d) => (d.ph === 'scan' ? 'Scan with the radar: the map table in the middle of the bridge ({use})' : 'Look at the radar contact in the list on the left'),
    target: (P, c, d) => (d.ph === 'scan' ? [{ x: 22.2, y: 6.4, hint: 'Click the radar table (or E): scan' }] : []),
  },
  gun: {
    core: true, short: false, title: 'CANNON', icon: 'interceptor', spawns: { enemy: 1 },
    plan(P) {
      const side = ['port', 'star'].find(s => gunFree(s, P.id) && !combat.enemies.some(e => e.side === s && e.phase !== 'gone'));
      return side ? { res: ['gun_' + side], side } : null;
    },
    start(P, c, d) {
      d.ph = 'climb'; d.fails = 0;
      trSay(P, [`Gunnery. Climb into the *${TR_SIDE[d.side]} cannon* at its ladder in the ${TR_SIDE[d.side]} cannon room ({use}). A training pirate is waiting outside.`]);
    },
    tick(P, c, d, dt) {
      const g = GUNS.find(g => g.id === d.side), e = d.e, inIt = trInGun(c, d.side);
      if (d.ph === 'climb') {
        if (!inIt) return false;
        combatSpawn('interceptor', d.side);
        d.e = combat.enemies.filter(x => x.side === d.side && x.phase === 'fighting').pop();
        if (!d.e) return false;
        d.e.ampMul = d.e.ampGoal = 0.7; d.e.train = P.id;            // (a bit calmer than usual: it's training)
        g.shots = 1; g.reload = 0; d.ph = 'crack'; d.away = 0;
        claimEncounter('enemy' + uid(d.e), P.id);
        trSay(P, [
          `You're in the ${TR_SIDE[d.side]} cannon. Aim: {aim}. Bottom right: your *shots*, and the energy in the capacitor that feeds this cannon.`,
          'That *interceptor* has *glowing blue bits*: its *weak spots*. Hull hits mostly scratch the paint; a weak spot breaks something that matters.',
          'Shoot its *windshield*: the blue crack at the front of the cockpit (marked). Fire with {fire}. You have *one shot*, so take your time. It isn\'t shooting back. Yet.',
        ]);
        return false;
      }
      if (!e || !combat.enemies.includes(e) || e.phase !== 'fighting') { d.ph = 'kill'; return mission.t - (d.deadT ??= mission.t) > 1.5; }   // (destroyed, whenever)
      if (!inIt) {                          // climbed down mid-lesson: it waits for you
        trHoldFire(e); d.away += dt;
        if (d.away > TR_AWAY) d.drop = true;
        return false;
      }
      d.away = 0;
      if (d.ph === 'crack') {
        trHoldFire(e); e.hullHits = 0; e.ampGoal = 0.7; e.omegaGoal = 1;
        for (const p of e.pois) if (p.id !== 'crack' && p.hit) { p.hit = false; p.smoke = 0; d.other = p.name; }   // only the windshield counts here
        if (e.pois.find(p => p.id === 'crack').hit) {
          if ((d.hitT ??= mission.t) && mission.t - d.hitT > 0.9) {
            d.ph = 'reload';
            const fx = e.D.pois.map(p => `*${p.name.toLowerCase()}*: ${p.effect.charAt(0).toLowerCase() + p.effect.slice(1)}`).join(' · ');
            trSay(P, [
              'Bullseye! They\'re *duct-taping the windshield* now, and while they do, they can\'t see to shoot.',
              `That's the deal with weak spots: *every hit on one gives you an advantage*. On an interceptor: ${fx}. Hit them all and it's done for.`,
              `Cannon empty: *reload* with {reload}. A reload costs *one energy* from this side's capacitor and gives *${SHOTS_PER_ENERGY} shots*.`,
            ]);
          }
          return false;
        }
        if (g.shots > 0 || g.reload > 0) { d.emptyT = null; return false; }
        if (mission.t - (d.emptyT ??= mission.t) < 1.5) return false;   // (the shell is still on its way)
        d.emptyT = null; g.shots = 1;
        trNote(P, `Missed${d.other ? ` (you hit its ${d.other.toLowerCase()}: nice, but we said windshield)` : ''}! Here's another shot, on RAIDER. Tip: fire when it slows down at the end of a swing.`);
        d.other = null;
        return false;
      }
      if (d.ph === 'reload') {
        trHoldFire(e); e.blind = Math.max(e.blind, 3);
        if (g.shots < SHOTS_PER_ENERGY && !g.reload) trStock(d, GUN_CAP[d.side], dt, 0.5);
        if (g.shots >= SHOTS_PER_ENERGY && !g.reload) {
          d.ph = 'block'; d.sub = 'wait'; d.t0 = mission.t;
          trSay(P, ['They\'ve nearly finished taping. When they shoot, raise the *cover plate*: {cover}, and *keep holding* until the shot hits it. You can\'t fire while it\'s up.']);
        }
        return false;
      }
      if (d.ph === 'block') {
        if (d.sub === 'wait') {
          trHoldFire(e); e.blind = 0;
          if (mission.t - d.t0 > 4) { e.target = { atCrew: true, crewId: c.id, tx: c.x, ty: c.y }; e.fireT = 0.7; d.sub = 'aim'; d.hit = false; d.t0 = mission.t; }
        } else if (d.sub === 'aim') {
          e.blind = 0; if (!e.target) e.target = { atCrew: true, crewId: c.id, tx: c.x, ty: c.y };
          const s = combat.shots.find(s => s.atCrew && s.crewId === c.id && s.side === d.side);
          if (s) { s.vx *= 0.5; s.vy *= 0.5; s.life *= 2; d.shot = s; d.sub = 'flying'; }
          else if (mission.t - d.t0 > 4) { d.sub = 'wait'; d.t0 = mission.t; }   // (it fizzled somehow: again)
        } else if (d.sub === 'flying') {
          trHoldFire(e);
          if (!combat.shots.includes(d.shot)) { d.sub = 'after'; d.t0 = mission.t; }
        } else if (d.sub === 'after' && mission.t - d.t0 > 0.6) {
          c.health = 'ok'; c.hurtT = 0;
          if (d.hit && ++d.fails < 3) {
            trNote(P, 'That one got through: you let go too early (a training round: no harm done). Again! Keep the cannon pointed at them and hold the cover until the shot hits it.', 8);
            d.sub = 'wait'; d.t0 = mission.t - 1.5;
          } else {
            d.ph = 'kill';
            trSay(P, [d.hit ? 'Let\'s leave the cover for the real thing: {cover} when a shot comes, and keep holding until it hits.' : '*CLANG.* Blocked! Raise the cover when a shot comes, then get back to shooting.',
              'Now finish it: hit its *other blue spots*. Its shots can\'t hurt anyone in training.']);
          }
        } else trHoldFire(e);
        return false;
      }
      if (d.ph === 'kill') {
        if (g.shots === 0 && !g.reload) trStock(d, GUN_CAP[d.side], dt);
      }
      return false;
    },
    stop(P, c, d) { if (d.e && combat.enemies.includes(d.e)) trRemoveEnemy(d.e); },
    todo(P, c, d) {
      const side = TR_SIDE[d.side];
      if (d.ph === 'climb' || (!trInGun(c, d.side) && d.e?.phase === 'fighting')) return `${d.ph === 'climb' ? 'Climb' : 'Back'} into the ${side} cannon: its ladder in the ${side} cannon room ({use})`;
      if (d.ph === 'crack') return 'Shoot the windshield crack ({fire}) · aim: {aim}';
      if (d.ph === 'reload') return 'Reload: {reload}';
      if (d.ph === 'block') return d.sub === 'wait' ? `Incoming in ${Math.max(1, Math.ceil(4 - (mission.t - d.t0)))}… get ready: {cover}` : 'Cover up NOW: {cover}, keep holding!';
      return d.e?.phase === 'fighting' ? 'Hit its other blue spots ({fire}) · reload: {reload}' : 'Destroyed!';
    },
    target: (P, c, d) => (d.ph === 'climb' ? [{ ...trHatch(d.side), hint: `Climb into the ${TR_SIDE[d.side]} cannon (click the ladder)` }] : []),
    marks(P, c, d) {
      if (d.ph === 'crack') return [trPoiAt(d.e, 'crack')];
      if (d.ph === 'block' && d.shot && combat.shots.includes(d.shot)) return [{ x: d.shot.x, y: d.shot.y, r: 0.6 }];
      if (d.ph === 'kill' && d.e) { const p = d.e.pois.find(p => !p.hit); return p ? [trPoiAt(d.e, p.id)] : []; }
      return [];
    },
    outro: ['Interceptor *destroyed*! Not bad for a clone on their first day. (Out of the cannon: {down}.)'],
  },
  fuel: {
    core: true, short: true, title: 'FUEL CELL', icon: 'jump',
    plan: (P) => (trFree('reactor', P.id) ? { res: ['reactor'] } : null),
    start(P, c, d) {
      power.reactor.fuel = 0; power.reactor.t = 0; power.reserve = Math.max(2, power.reserve);
      d.had = c.inv.item === 'fuel';
      trSay(P, [
        'The *reactor room* (lower deck, middle). That big pizza oven is the *reactor*: it burns fuel cells and turns them into energy. We emptied its cell, specially for you.',
        'Take a spare cell from the *fuel crate* (marked) and load it into the reactor ({use} at the crate, then at the reactor).',
      ]);
    },
    tick(P, c, d) {
      const had = d.had; d.had = c.inv.item === 'fuel';
      if (power.reactor.fuel > 0 && power.reactor.fuel < CELL_ENERGY && !had) power.reactor.fuel = 0;   // (someone else's reactor tick: still empty for this lesson)
      return had && c.inv.item !== 'fuel' && power.reactor.fuel === CELL_ENERGY;
    },
    stop(P, c, d, why) { if (why !== 'done' && !(power.reactor.fuel > 0)) { power.reactor.fuel = CELL_ENERGY; power.reactor.t = 0; } },
    todo: (P, c) => (c.inv.item === 'fuel' ? 'Load the fuel cell into the reactor ({use})' : 'Take a fuel cell from the fuel crate ({use})'),
    target(P, c) {
      if (c.inv.item === 'fuel') return [{ x: REACTOR.x, y: REACTOR.y + 1.4, hint: 'Click the reactor (or E): load the cell' }];
      const dropped = nearestTo(c, ITEMS.filter(i => i.kind === 'fuel'));
      return [dropped ? { x: dropped.x, y: dropped.y, hint: 'Pick up the fuel cell' } : { ...FUEL_CRATE, hint: 'Take a fuel cell (click the crate or E)' }];
    },
    marks: (P, c) => [c.inv.item === 'fuel' ? { x: REACTOR.x, y: REACTOR.y, r: 1.4 } : { ...FUEL_CRATE, r: 0.8 }],
    outro: ['Fuel\'s in. Every 20 seconds the reactor makes *one energy* (a cell is good for 5). Each energy flies along the power lines, through the *power lever*, into one of three *capacitors*.'],
  },
  lever: {
    core: true, short: true, title: 'POWER LEVER', icon: 'surge',
    plan: (P) => (trFree('lever', P.id) && !broken(LEVER) ? { res: ['lever'] } : null),
    start(P, c, d) {
      power.lever.jammed = true; d.ph = 'wrench';
      trSay(P, [
        'The *power lever* (reactor room). Every energy from the reactor goes through it to a capacitor: LEFT, MID or RIGHT. Normally it steps on after every energy, so everyone gets a share.',
        `The *left* capacitor feeds the left cannon and shield, the *right* one the right side, the *middle* one the front cannon, the front shield and the *jump drive*. A capacitor holds up to ${CAP_MAX}; one energy is one reload or one shield.`,
        'See the *wrench* stuck in it? It locks the lever. Pull it out: {hub}.',
      ]);
    },
    tick(P, c, d, dt) {
      const lv = power.lever;
      if (d.ph === 'wrench' && !lv.jammed) { d.ph = 'watch'; d.n = 0; d.pos = lv.pos; d.k = 0.6; trSay(P, ['Wrench out. Now watch the lever: training sends a few energies through it, quickly, so you can see it step.']); }
      else if (d.ph === 'watch') {
        if (lv.pos !== d.pos) { d.pos = lv.pos; d.n++; }
        if (d.n < 3) { if (!lv.jammed && (d.k -= dt) <= 0) { d.k = 1.2; deliverEnergy(); } }
        else if (!power.bolts.some(b => !b.done)) {
          d.ph = 'lock';
          trSay(P, ['See? It steps after every energy. When one side needs everything (a big fight on the left, say), turn the lever there and wedge the wrench in.',
            'Try it: turn the lever to *LEFT* ({handle}), then wedge the wrench back in ({hub}).']);
        }
      } else if (d.ph === 'lock' && lv.pos === 0 && lv.jammed) {
        d.ph = 'unjam';
        trSay(P, ['Locked on LEFT: every energy now goes to the left. Now pull the wrench out again ({hub}), or the other two capacitors starve. That\'s how your predecessor got recycled.']);
      } else if (d.ph === 'unjam' && !lv.jammed) return true;
      return false;
    },
    stop() { power.lever.jammed = false; },
    todo(P, c, d) {
      const lv = power.lever;
      if (d.ph === 'wrench') return 'Pull the wrench out of the lever ({hub})';
      if (d.ph === 'watch') return lv.jammed ? 'Pull the wrench out ({hub}) to watch the lever' : `Watch the lever step: now on ${LEVER_NAMES[lv.pos]}`;
      if (d.ph === 'lock') return lv.pos !== 0 ? (lv.jammed ? 'Pull the wrench out first ({hub})' : `Turn the lever to LEFT ({handle}) · now ${LEVER_NAMES[lv.pos]}`) : 'Wedge the wrench in ({hub})';
      return 'Pull the wrench out again ({hub})';
    },
    target: (P, c, d) => (d.ph === 'watch' ? [] : [{ x: LEVER.x, y: LEVER.y + 0.9, hint: 'The power lever' }]),
    marks: () => [{ x: LEVER.x, y: LEVER.y, r: 0.7 }],
    outro: ['Lever free again: MID, RIGHT, LEFT… fair for everyone.'],
  },
  fire: {
    core: true, short: true, title: 'FIRE', icon: 'fire', spawns: { fire: 1 },
    plan: (P) => (trFree('ext', P.id) && trSafeParts(TR_FIRE_PARTS).length ? { res: ['ext'] } : null),
    start(P, c, d) {
      if (!this.rearm(P, c, d)) { d.drop = true; return; }
      trSay(P, [
        `*Fire!* The *${lcName(d.f.sys)}* is burning. A training fire: it won't spread, and it's *yours*.`,
        'Left alone, a real fire *spreads* or *burns its part out*. Grab a *fire extinguisher* ({use}), walk up to the fire and spray: {spray}.',
      ]);
    },
    rearm(P, c, d) {
      const pool = trSafeParts(TR_FIRE_PARTS).sort((a, b) => trDist(c, a.x, a.y) - trDist(c, b.x, b.y));
      for (const s of pool) {
        if (!igniteSystem(s)) continue;
        d.f = fires.find(f => f.sys === s); d.f.tame = true; d.f.train = P.id;
        claimEncounter('fire' + uid(d.f), P.id);
        return true;
      }
      return false;
    },
    tick(P, c, d) {
      if (!d.f || fires.includes(d.f)) return false;
      const sp = d.f.spray || {}, doer = Object.keys(sp).sort((a, b) => sp[b] - sp[a])[0];
      if (doer == null || +doer === P.id) return true;
      trCredit(P, +doer, d);
      return false;
    },
    stop(P, c, d) { if (d.f && fires.includes(d.f)) fires.splice(fires.indexOf(d.f), 1); },
    todo: (P, c, d) => (!d.f ? 'Wait for your next fire…' : c.inv.weapon === 'extinguisher' ? `Put out the fire at the ${lcName(d.f.sys)}: {spray}` : 'Get a fire extinguisher ({use})'),
    target: () => [],                                  // (the fire's own plate is claimed for you: extinguisher first, then the fire)
    marks: (P, c, d) => (d.f && fires.includes(d.f) ? [{ x: d.f.x, y: d.f.y, r: 0.7 }] : []),
    outro: ['Fire\'s out. RAIDER fire safety thanks you.'],
  },
  repair: {
    core: true, short: true, title: 'REPAIR', icon: 'wrench', spawns: { broken: 1 },
    plan: (P, c) => (trSafeParts().length && (c.inv.weapon === 'repair' || trFree('kit', P.id)) ? { res: c.inv.weapon === 'repair' ? [] : ['kit'] } : null),
    start(P, c, d) {
      if (!this.rearm(P, c, d)) { d.drop = true; return; }
      d.ph = 'see';
      trSay(P, [`Hear that? The *${lcName(d.s)}* just broke (RAIDER's training gremlins). A broken part *does nothing* until it's repaired. Walk up to it and see for yourself (marked).`]);
    },
    rearm(P, c, d) {
      const s = trSafeParts().sort((a, b) => trDist(c, a.x, a.y) - trDist(c, b.x, b.y))[0];
      if (!s) return false;
      breakSystem(s); d.s = s; d.last = null; d.ph = 'see'; d.seenT = 0;
      return true;
    },
    tick(P, c, d, dt) {
      const s = d.s;
      if (!s) return false;
      for (const o of crew) if (o.repair?.sys === s) d.last = o.id;
      if (!s.broken) {
        if (d.last == null || d.last === P.id) return true;
        trCredit(P, d.last, d);
        return false;
      }
      if (d.ph === 'see') {
        if (trDist(c, s.x, s.y + 0.7) < 1.6 && c.mode === 'inside') d.seenT = (d.seenT || 0) + dt; else d.seenT = 0;
        if (d.seenT > 1) {
          d.ph = 'fix';
          trSay(P, ['See? Broken: it doesn\'t press. Same everywhere: broken cannons only spark, broken capacitors hold nothing.',
            `Fix it with the *repair kit* (the ship's one is in the left airlock room): take it, then {kit} for ${REPAIR_TIME} seconds.`]);
        }
      }
      return false;
    },
    stop(P, c, d) { if (d.s) d.s.broken = false; },
    todo(P, c, d) {
      if (!d.s) return 'Wait for your next broken part…';
      if (d.ph === 'see') return `Walk up to the ${lcName(d.s)} (marked)`;
      return c.inv.weapon === 'repair' ? `Repair the ${lcName(d.s)}: {kit} (${REPAIR_TIME} s)` : 'Get the repair kit ({use})';
    },
    target(P, c, d) {
      if (!d.s) return [];
      const at = { x: d.s.x, y: d.s.y + 0.6, hint: d.ph === 'see' ? `The ${lcName(d.s)}: walk up to it` : `Repair it: hold right click / Space` };
      return [d.ph === 'see' ? at : trToolFirst(c, 'repair', 'repair kit', at)];
    },
    marks: (P, c, d) => (d.s ? [{ x: d.s.x, y: d.s.y, r: 0.8 }] : []),
    outro: ['Repaired. Honestly, that\'s most of the job: things break, you fix them. Repeat until the jump.'],
  },

  // ----- extras -----
  asteroids: {
    short: true, title: 'ASTEROIDS', icon: 'asteroid', spawns: { swarm: 1 },
    plan: (P) => (gunFree('front', P.id) ? { res: ['gun_front'] } : null),
    start(P, c, d) { d.ph = 'climb'; trSay(P, ['Extra: the *front cannon* (its ladder is on the bridge, by the helm). Rocks come from ahead sometimes; climb in and we\'ll send you a few.']); },
    tick(P, c, d, dt) {
      const g = GUNS.find(g => g.id === 'front'), inIt = trInGun(c, 'front');
      if (d.ph === 'climb') {
        if (!inIt) return false;
        combatSpawn('swarm', 'front'); claimEncounter('swarm', P.id); d.ph = 'shoot'; d.away = 0;
        trSay(P, ['*Asteroid swarm!* Small rocks crumble at one hit. Big ones have a glowing *blue crack*: hit that and they split, else they take a beating first. Their hits don\'t hurt in training.']);
        return false;
      }
      if (!inIt) { if ((d.away += dt) > TR_AWAY) d.drop = true; } else d.away = 0;
      if (g.shots === 0 && !g.reload) trStock(d, GUN_CAP.front, dt);
      return !combat.swarm && !combat.asteroids.length;
    },
    stop(P, c, d, why) { if (why !== 'done' && d.ph !== 'climb') { combat.swarm = null; combat.asteroids = []; } },
    todo: (P, c, d) => (d.ph === 'climb' ? 'Climb into the front cannon: its ladder on the bridge, right of the helm ({use})' : 'Shoot the rocks before they hit ({fire}) · reload: {reload}'),
    target: (P, c, d) => (d.ph === 'climb' ? [{ ...trHatch('front'), hint: 'Climb into the front cannon (click the ladder)' }] : []),
    outro: ['Swarm cleared. The front cannon also covers the nose; the side cannons can\'t reach that far round.'],
  },
  shields: {
    short: true, title: 'SHIELDS', icon: 'ping',
    plan(P) {
      const side = ['front', 'port', 'star'].find(s => trFree('shield_' + s, P.id) && !broken(SHIELD_BUTTONS.find(b => b.side === s)) && !broken(emitterOf(s)) && combat.shields[s].cd <= 0);
      return side ? { res: ['shield_' + side], side } : null;
    },
    start(P, c, d) {
      d.ph = 'press';
      trSay(P, [`Extra: the *shields*. Three buttons on the lower deck (left, front, right). The *${TR_SIDE[d.side]}* one is yours: walk up to it and {use}.`]);
    },
    tick(P, c, d, dt) {
      const s = combat.shields[d.side];
      if (d.ph === 'press') {
        trStock(d, SIDE_CAP[d.side], dt, 0.5);
        if (s.up > 0) {
          d.ph = 'read'; d.t0 = mission.t;
          trSay(P, [`Shield up! One energy from that side's capacitor buys ${SHIELD_UP_TIME} s of shield, then it needs ${SHIELD_COOLDOWN} s to recharge. It eats everything that hits it: shots, rocks, even heavy shots.`,
            'So save it: when a frigate charges a *heavy shot* (the enemy list says so), that\'s when you press. The shield itself is an *emitter outside* on the hull: if that breaks, it\'s a spacewalk.']);
        }
        return false;
      }
      return mission.t - d.t0 > 8;
    },
    todo: (P, c, d) => (d.ph === 'press' ? `Raise the ${TR_SIDE[d.side]} shield: its button on the lower deck ({use})` : 'Watch the shield'),
    target: (P, c, d) => { const b = SHIELD_BUTTONS.find(b => b.side === d.side); return d.ph === 'press' ? [{ x: b.x, y: b.y + 0.7, hint: `Press the ${TR_SIDE[d.side]} shield button` }] : []; },
  },
  firstAid: {
    short: true, title: 'FIRST AID', icon: 'ping',
    plan: (P, c) => (c.mode === 'inside' && c.health === 'ok' ? {} : null),
    start(P, c, d) {
      c.health = 'down'; c.hurtT = HURT_TIME; c.treat = null; c.heal = null;
      trSay(P, [
        'Extra: a *knock-down drill*. You\'re *down* (pretend you were hit twice). Down, you can\'t walk or use anything: get yourself up with {getup} for 10 seconds.',
        'Hits work like this: the first leaves you *hurt* (slower, tunnel vision, 30 s), a second puts you *down*, a third and you\'re *out cold* — then only a crewmate can get you up. A crewmate treating you is faster, too.',
      ]);
    },
    tick(P, c) { return standing(c); },
    stop(P, c) { if (c && !standing(c)) { c.health = 'ok'; c.heal = null; } else if (c && c.health === 'hurt') { c.health = 'ok'; c.hurtT = 0; } },
    todo: () => 'Get back up: {getup} (10 s) — or wait for a crewmate',
    target: () => [],
    outro: ['Back on your feet. (In training you skip the "hurt" part. Lucky you.)'],
  },
  medic: {
    short: true, title: 'MEDIC', icon: 'ping',
    plan(P, c) {
      if (!standing(c) || c.mode !== 'inside') return null;
      const who = crew.find(o => o !== c && train.p[o.id]?.lesson === 'firstAid' && !standing(o) && !Object.values(train.p).some(Q => Q.lesson === 'medic' && trD(Q)?.who === o.id));
      return who ? { who: who.id } : null;
    },
    start(P, c, d) { trSay(P, [`Extra: *${trName(d.who)} is down* (a drill). Walk over and treat them: {treat} for 2 s. Tip: click in time with the heartbeat and it goes faster.`]); },
    tick(P, c, d) {
      const o = trCrew(d.who);
      if (!o) { d.drop = true; return false; }
      if (c.treat?.id === o.id) d.treated = true;
      if (standing(o)) { if (!d.treated) d.drop = true; return !!d.treated; }
      return false;
    },
    todo: (P, c, d) => `Treat ${trName(d.who)}: {treat} (2 s)`,
    target: (P, c, d) => { const o = trCrew(d.who); return o ? [{ x: o.x, y: o.y, hint: `Treat ${o.name}: hold click / E on them` }] : []; },
    outro: ['Patient back on their feet. That counts as a medic shift.'],
  },
  security: {
    short: true, title: 'SECURITY', icon: 'ping',
    plan: (P) => (trFree('security', P.id) ? { res: ['security'] } : null),
    start(P, c, d) { d.ph = 'open'; trSay(P, ['Extra: the *security console* in the left cannon room. It locks and unlocks doors and airlocks, and shows where everyone is. Walk up to it and {use}.']); },
    tick(P, c, d) {
      const L = lockables();
      if (d.ph === 'open' && c.ui.panel === 'security') {
        d.ph = 'lock'; d.was = L.map(l => !!l.ref.locked);
        trSay(P, ['Lock a door: click one in the panel. Intruders can\'t open doors anyway, but pirates can: a locked one holds them longer. Locked doors stop your crewmates too, so…']);
      } else if (d.ph === 'lock') {
        const i = L.findIndex((l, k) => l.ref.locked && !d.was[k]);
        if (i >= 0) { d.ph = 'unlock'; d.door = i; trSay(P, [`…unlock it again (click it once more), before ${crew.length > 1 ? 'someone walks into it' : 'you forget'}.`]); }
      } else if (d.ph === 'unlock') return !L[d.door]?.ref.locked;
      return false;
    },
    stop(P, c, d) { const l = d.door != null && lockables()[d.door]; if (l) l.ref.locked = false; if (c?.ui.panel === 'security') c.ui.panel = null; },
    todo: (P, c, d) => (d.ph === 'open' ? 'Open the security console: left cannon room ({use})' : d.ph === 'lock' ? 'Lock a door: click it in the panel' : 'Unlock it again: click it in the panel'),
    target: (P, c, d) => (d.ph === 'open' ? [{ x: SECURITY.x, y: SECURITY.y + 0.5, hint: 'Open the security console' }] : []),
    outro: ['Doors back as they were. (Close the panel: E or Esc.)'],
  },
  override: {
    short: true, title: 'MANUAL OVERRIDE', icon: 'ping',
    plan(P, c) {
      if (!trFree('door', P.id)) return null;
      const d = DOORWAYS.filter(x => !x.locked && !doorVents(x)).sort((a, b) => trDist(c, a.x + a.w / 2, a.y + a.h / 2) - trDist(c, b.x + b.w / 2, b.y + b.h / 2))[0];
      return d ? { res: ['door'], door: DOORWAYS.indexOf(d) } : null;
    },
    start(P, c, d) { this.rearm(P, c, d); trSay(P, ['Extra: the *manual override*. A door that\'s locked, broken or has vacuum behind it won\'t open by itself. We just locked the one marked: walk up to it, {use}, then whack the handle three times (click or E).', 'Careful with doors that have *vacuum* behind them: forcing one vents your side too.']); },
    rearm(P, c, d) { if (d.door == null) return false; DOORWAYS[d.door].locked = true; d.mine = false; d.other = null; return true; },
    tick(P, c, d) {
      const dr = DOORWAYS[d.door];
      if (!dr) { d.drop = true; return false; }
      if (c.ui.override?.ref === dr) d.mine = true;
      for (const o of crew) if (o !== c && o.ui.override?.ref === dr) d.other = o.id;
      if (dr.locked) return false;
      if (d.mine || d.other == null) return true;
      trCredit(P, d.other, d);
      return false;
    },
    stop(P, c, d) { if (DOORWAYS[d.door]) DOORWAYS[d.door].locked = false; },
    todo: () => 'Force the locked door (marked): {use}, then three whacks',
    target: (P, c, d) => { const dr = DOORWAYS[d.door]; return dr ? [{ x: dr.x + dr.w / 2, y: dr.y + dr.h / 2, hint: 'Locked: manual override (click / E)' }] : []; },
    marks: (P, c, d) => { const dr = DOORWAYS[d.door]; return dr ? [{ x: dr.x + dr.w / 2, y: dr.y + dr.h / 2, r: 1.2 }] : []; },
    outro: ['Forced. A forced door stays unlocked; a broken one stays jammed open until someone repairs it.'],
  },
  eva: {
    short: false, title: 'SPACEWALK', icon: 'jump',
    plan(P) {
      const coil = evs.coils.find(k => k.ok && trFree('coil_' + k.name, P.id));
      return coil ? { res: ['coil_' + coil.name], coil: coil.name } : null;
    },
    start(P, c, d) {
      this.rearm(P, c, d); d.ph = 'out';
      trSay(P, [
        'Extra: a *spacewalk*. The *outer airlocks* (left and right airlock rooms, lower deck) take you outside. Walk into the chamber: it pumps the air out and opens to space.',
        `Out there: the *jump coils*. One is *misaligned* (we did that): turn it until it's green, hold click for ${ALIGN_TIME} s. Misaligned coils make the jump drive take longer.`,
        'Also out there on real missions: the *shield emitters*, mines on the hull, jammed cannon tracks, the radar antenna. Your safety line keeps you close.',
      ]);
    },
    rearm(P, c, d) { const k = evs.coils.find(k => k.name === d.coil); if (k) { k.ok = false; k.a = 0.9; } d.who = null; return true; },
    tick(P, c, d) {
      const k = evs.coils.find(k => k.name === d.coil);
      if (!k) { d.drop = true; return false; }
      for (const o of crew) if (o.hold?.id === 'coil' + d.coil) d.who = o.id;
      if (d.ph === 'out' && k.ok) {
        if (d.who != null && d.who !== P.id) { trCredit(P, d.who, d); return false; }
        d.ph = 'back'; trSay(P, ['Aligned. Now *back inside* through an airlock: walk into the chamber from outside, it pumps the air back in.']);
      }
      return d.ph === 'back' && c.mode === 'inside';
    },
    stop(P, c, d) { const k = evs.coils.find(k => k.name === d.coil); if (k) k.ok = true; },
    todo: (P, c, d) => (d.ph === 'out' ? (c.mode === 'eva' ? `Align the ${d.coil} jump coil: hold click on it (${ALIGN_TIME} s)` : 'Go outside: into an outer airlock (left or right airlock room)') : 'Back inside through an outer airlock'),
    target(P, c, d) {
      const k = evs.coils.find(k => k.name === d.coil);
      if (d.ph === 'out' && k) return [{ x: k.x, y: k.y, hint: `Align the ${d.coil} jump coil (hold click)` }];
      return HATCHES.map(h => ({ x: h.inside[0], y: h.inside[1], hint: 'Back inside' }));
    },
    outro: ['Welcome back aboard. Spacewalks are where the odd jobs are: emitters, mines, jammed tracks, the antenna.'],
  },
  coffee: {
    short: true, title: 'COFFEE', icon: 'ping',
    plan: () => ({}),
    start(P, c, d) { trSay(P, ['Extra, and the most important lesson: the *coffee* on the kitchen counter (left cannon room). Drink it ({use}) and you walk faster for 15 s. Empty? Someone is always making more.']); },
    tick(P, c, d, dt) {
      if (c.coffeeT > 0) return true;
      if (trDist(c, COFFEE_MUG.x, COFFEE_MUG.y) < 2) d.nearT = (d.nearT || 0) + dt;
      return d.nearT > 5;
    },
    todo: () => 'Drink the coffee: kitchen counter, left cannon room ({use})',
    target: () => [{ x: COFFEE_MUG.x, y: COFFEE_MUG.y + 0.6, hint: 'The coffee' }],
  },
};
// The tour stops: walk there, read, done a few seconds after you arrive (and the pages are read).
function trTour(id, title, at, pages) {
  TR_LESSONS[id] = {
    short: true, title, icon: 'ping', plan: () => ({}),
    start(P, c, d) { d.ph = 'go'; trSay(P, [`Extra, a tour stop: walk to the ${title.toLowerCase()} (marked).`]); },
    tick(P, c, d) {
      const p = at(c);
      if (d.ph === 'go' && trDist(c, p.x, p.y) < 2.2) { d.ph = 'read'; d.t0 = mission.t; trSay(P, pages); }
      return d.ph === 'read' && mission.t - d.t0 > Math.max(5, pages.reduce((s, x) => s + trPageTime(x), 0) * 0.8);
    },
    todo: (P, c, d) => (d.ph === 'go' ? `Walk to the ${title.toLowerCase()} (marked)` : `The ${title.toLowerCase()}: read your card`),
    target: (P, c, d) => (d.ph === 'go' ? [{ ...at(c), hint: `The ${title.toLowerCase()}` }] : []),
    marks: (P, c) => [{ ...at(c), r: 0.8 }],
  };
}
trTour('tour_laser', 'LASER GUN', () => itemSpot('laser') || { x: 42.4, y: 22.4 }, ['The *laser gun*: just in case an intruder walks onto the ship. Unheard of, of course. Pick it up and shoot with the weapon keys ({fire} works in cannons; with a hand weapon it\'s right click or Space).']);
trTour('tour_plates', 'HULL PLATES', (c) => nearestTo(c, PLATE_CRATES), ['*Hull plates* (a crate in each airlock room) seal holes in the hull: hold one over the hole, then nail it down with the repair kit. Later in your career, big hits tear holes.']);
trTour('tour_vent', 'VENT PANEL', () => { const [x, y] = VENT_PANELS.portLock; return { x: x + 1, y }; }, ['Next to each outer airlock: a *vent panel*. It blows the room\'s air into space, fires and all. You\'re fine (visor), but anyone else in there gets hurt. Not today, thanks.']);
trTour('tour_patch', 'PATCH BOARD', () => ({ x: PATCH_BOARD.x, y: PATCH_BOARD.y + 0.6 }), ['The *patch board* by the power lever reroutes the lever\'s outputs when a power line breaks: which output feeds which capacitor.']);
trTour('tour_snack', 'SNACK MACHINE', () => ({ x: SNACK.x, y: SNACK.y + 0.7 }), ['The *snack machine* (left cannon room) helps when you\'re hurt. Top left of the screen: *DAMAGE*. Every broken part counts, and at too many at once the ship falls apart, so fix things.']);
trTour('tour_jump', 'JUMP DRIVE', () => ({ x: CAPACITORS[1].x, y: CAPACITORS[1].y + 0.8 }), ['The *middle capacitor* powers the *jump*. At the end of every mission the jump drive spools up and needs *one energy in MID*. Keep some there: no energy, no jump, and the trouble keeps coming faster until you go.']);

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
function trRecord(c) {
  const old = trByName.get(c.name); trByName.delete(c.name);
  const P = { id: c.id, name: c.name, lesson: null, title: '', n: '', todo: '', say: null, note: '', marks: [], core: old ? old.core : [], extra: old ? old.extra : [], state: 'welcome', wait: '', off: (trOffsets++ * 3) % TR_CORE_N };
  train.p[c.id] = P;
  trPriv.set(c.id, { d: null, t: 0, prog: mission.t, ph: null, pageT: 0, noteT: 0, idle: 0, cool: 0, skip: null, w: 0 });
  trSay(P, old ? [`Welcome back, ${c.name}! Your training progress is still here (${old.core.length}/${TR_CORE_N}). Next job in a moment.`] : [
    'Welcome to *RAIDER* crew training: the *Rapid Assistance & Interplanetary Defense Enterprise Resources* corporation. We help people in need. Today the people in need are you.',
    'Everyone trains *side by side*. This card is *yours*: only you see it, and nothing ever pauses. It turns its pages by itself (or click it). Walk with *W A S D*; the label above your head says what you can do.',
    'Your job right now is always the plate with *your name* on the left, and the big *arrows* in your colour show the way.',
  ]);
  return P;
}
function trStart(P, id, plan) {
  const L = TR_LESSONS[id], c = trCrew(P.id), pv = trPriv.get(P.id);
  const d = { ...plan, said: {} };
  if (P.say && P.state === 'welcome') P.prefix = P.say.pages.slice(P.say.i);   // (what's left of the welcome comes first)
  P.lesson = id; P.state = 'lesson'; P.title = L.title; P.wait = '';
  P.n = L.core ? `${P.core.length + 1}/${TR_CORE_N}` : 'extra';
  pv.d = d; pv.t = 0; pv.prog = mission.t; pv.ph = null; pv.idle = 0;
  for (const k of plan.res || []) (train.res[k] ||= []).push(P.id);
  L.start(P, c, d);
  if (d.drop) { trStop(P, 'nothing'); return false; }
  addTaskPlate({ key: 'tr-' + P.id, title: `${P.name.toUpperCase()} · ${L.title}`, sub: trPlain(L.todo(P, c, d)), icon: L.icon, stripe: c.color || '#ffe08a', owner: P.id, targets: L.target?.(P, c, d) || [] });
  return true;
}
function trRelease(P) {
  for (const k of Object.keys(train.res)) { train.res[k] = train.res[k].filter(x => x !== P.id); if (!train.res[k].length) delete train.res[k]; }
  removeTaskPlate('tr-' + P.id);
  for (const k of claimsOf(P.id)) if (!k.startsWith('tr-')) releaseEncounter(k);
}
// Done (credited) or stopped (why: 'left', 'afk', 'nothing', 'handover', ...): the lesson cleans up after itself.
function trEnd(P, why) {
  const L = TR_LESSONS[P.lesson], c = trCrew(P.id), pv = trPriv.get(P.id), d = pv?.d;
  if (!L) return;
  try { L.stop?.(P, c, d || {}, why); } catch (e) { /* a lesson's own cleanup must never stop the training */ }
  for (const it of ITEMS.filter(i => i.train === P.id)) ITEMS.splice(ITEMS.indexOf(it), 1);   // (a training kit / extinguisher lying about)
  trRelease(P);
  if (why === 'done') {
    const list = L.core ? P.core : P.extra;
    if (!list.includes(P.lesson)) list.push(P.lesson);
    if (L.outro) P.prefix = L.outro.slice();
    if (c) sfxFor(c, 'poi');
  } else if (why === 'afk') { pv.cool = 20; pv.skip = P.lesson; trNote(P, `Let's do the ${L.title.toLowerCase()} later. Something else first.`); }
  else if (why === 'nothing' && pv) { pv.cool = 1; pv.skip = P.lesson; }
  P.lesson = null; P.state = 'waiting'; P.marks = []; P.n = '';
  if (pv) { pv.d = null; pv.idle = 0; }
}
const trFinish = (P) => trEnd(P, 'done');
const trStop = (P, why) => trEnd(P, why);
// Someone else (doer) finished P's training job (put out P's fire, repaired P's part, aligned P's coil, forced P's door).
//   doer is on the same lesson with their own job → they're credited, and their job is P's now;
//   doer is free (or on a short extra) and still needs this lesson → it counts for them; P gets a new one shortly;
//   else → P gets a new one shortly. "A new one": the lesson's rearm, after TR_REARM s, when the caps allow.
function trCredit(P, doerId, d) {
  const Q = train.p[doerId], L = TR_LESSONS[P.lesson], what = L.title.toLowerCase();
  const qd = Q && trD(Q);
  if (Q && Q.lesson === P.lesson && qd && Q !== P) {
    for (const k of ['f', 's', 'coil', 'door']) if (qd[k] !== undefined) d[k] = qd[k];
    if (d.f) { d.f.train = P.id; claimEncounter('fire' + uid(d.f), P.id); }
    if (qd.f) qd.f = null;                            // (so Q's stop doesn't put it out)
    if (P.lesson === 'repair') { qd.s = null; d.ph = 'see'; d.last = null; d.seenT = 0; }
    if (P.lesson === 'eva') { qd.coil = '__none'; d.who = null; }
    if (P.lesson === 'override') { qd.door = null; d.mine = false; d.other = null; }
    trNote(P, `${Q.name} did yours, so theirs is yours now: the ${what} on your plate.`);
    trNote(Q, `That was ${P.name}'s ${what} job — it counts for you anyway. ${P.name} takes over yours.`);
    trFinish(Q);
    return;
  }
  const qList = Q && (L.core ? Q.core : Q.extra);
  if (Q && Q !== P && !qList.includes(P.lesson) && (!Q.lesson || (TR_LESSONS[Q.lesson].short && !TR_LESSONS[Q.lesson].core))) {
    qList.push(P.lesson);
    trNote(Q, `That was ${P.name}'s training job — it counts as your ${what} training too.`);
  }
  if (Q) trNote(P, `${Q.name} beat you to it. Here's another one, all yours, in a moment.`);
  d.rearmT = TR_REARM; if (P.lesson === 'fire') d.f = null; if (P.lesson === 'repair') d.s = null;
  trPriv.get(P.id).prog = mission.t;
}
// The welcome, a lesson's tick, the card's pages, the plate.
function trTickPlayer(P, c, dt) {
  const pv = trPriv.get(P.id);
  if (P.say && P.say.i < P.say.pages.length - 1 && (pv.pageT += dt) >= trPageTime(P.say.pages[P.say.i])) { P.say.i++; pv.pageT = 0; }
  if (P.note && (pv.noteT -= dt) <= 0) P.note = '';
  if (P.state === 'welcome') {
    if ((pv.w += dt) >= TR_WELCOME || (P.say.i >= P.say.pages.length - 1 && pv.w > 5)) P.state = 'waiting';
    return;
  }
  if (!P.lesson) { pv.idle += dt; pv.cool = Math.max(0, pv.cool - dt); return; }
  const L = TR_LESSONS[P.lesson], d = pv.d;
  pv.t += dt;
  if (d.rearmT != null) {                              // waiting to hand out a fresh job after a steal
    if ((d.rearmT -= dt) <= 0 && trFits(L.spawns)) { d.rearmT = null; if (!L.rearm(P, c, d)) d.rearmT = 1; else pv.prog = mission.t; }
  }
  let done = false;
  try { done = d.rearmT == null && L.tick(P, c, d, dt); } catch (e) { console.error('training lesson', P.lesson, e); d.drop = true; }
  if (d.drop) { trStop(P, 'nothing'); return; }
  if (d.ph !== pv.ph) { pv.ph = d.ph; pv.prog = mission.t; }
  if (done) { trFinish(P); return; }
  if (mission.t - pv.prog > (L.core ? TR_AFK : TR_AFK_EXTRA)) { trStop(P, 'afk'); return; }
  P.todo = L.todo(P, c, d);
  P.marks = (L.marks?.(P, c, d) || []).filter(m => m && Number.isFinite(m.x) && Number.isFinite(m.y)).map(m => ({ x: m.x, y: m.y, r: m.r || 0.7 }));
  // the plate: no arrows of its own while a real encounter plate (your fire, your interceptor, your swarm) is claimed for you
  const real = claimsOf(P.id).some(k => !k.startsWith('tr-'));
  updateTaskPlate('tr-' + P.id, { sub: trPlain(P.todo), targets: real ? [] : L.target?.(P, c, d) || [] });
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------
const trCoreLeft = (P) => TR_CORE.filter(id => !P.core.includes(id));
function trOrder(P) {                                 // the player's own rotation of the core, the one they dropped last
  const rot = [...TR_CORE.slice(P.off), ...TR_CORE.slice(0, P.off)].filter(id => !P.core.includes(id));
  const sk = trPriv.get(P.id)?.skip;
  return sk && rot.includes(sk) && rot.length > 1 ? [...rot.filter(x => x !== sk), sk] : rot;
}
function trTry(P, c, id) {
  const L = TR_LESSONS[id];
  if (!L || !trFits(L.spawns)) return false;
  const plan = L.plan(P, c);
  return !!plan && trStart(P, id, plan);
}
function trSchedule() {
  const ready = crew.map(c => [c, train.p[c.id]]).filter(([c, P]) => P && !P.lesson && P.state !== 'welcome' && !(trPriv.get(P.id).cool > 0) && !mission.over)
    .sort(([, a], [, b]) => a.core.length - b.core.length || trPriv.get(b.id).idle - trPriv.get(a.id).idle);
  for (const [c, P] of ready) {
    const left = trOrder(P);
    if (trTry(P, c, 'medic')) continue;                // (a crewmate down in the drill: help first)
    if (left.some(id => trTry(P, c, id))) continue;
    const extras = TR_EXTRAS.filter(id => !P.extra.includes(id) && id !== 'medic' && (!left.length || TR_LESSONS[id].short));
    if (extras.some(id => trTry(P, c, id))) continue;
    // nothing free: a waiting card that says who's on the station you need next
    if (left.length) {
      const id = left[0], L = TR_LESSONS[id];
      const res = { helm: ['helm'], radar: ['radar'], gun: ['gun_port', 'gun_star'], fuel: ['reactor'], lever: ['lever'], fire: ['ext'], repair: ['kit'] }[id] || [];
      const who = [...new Set(res.flatMap(trHolders))].map(trName);
      P.state = 'waiting'; P.title = 'STAND BY';
      P.wait = `${L.title.charAt(0) + L.title.slice(1).toLowerCase()}: ${who.length ? `${who.join(' and ')} ${who.length > 1 ? 'are' : 'is'} on it` : 'too much going on at once'} — you're up next. Look around meanwhile!`;
    } else { P.state = 'done'; P.title = 'TRAINED'; P.wait = ''; }
  }
}

// ---------------------------------------------------------------------------
// Upkeep, every simulation tick (after the world: game.js simTick)
// ---------------------------------------------------------------------------
function trInit() {
  Object.assign(train, { on: true, runId: mission.runId, grad: false, res: {}, p: {} });
  trPriv.clear(); trByName.clear(); trSchedT = 0; trOffsets = 0;
  mission.jumpAt = Infinity; mission.lead = 0;        // (lead 0: a join doesn't lay the mission out again: crewChanged)
  const target = trSys('Left outer airlock'), decoy = trSys('Right capacitor');
  mission.events = [{ id: 0, kind: 'maintenance', t: 1e9, t1: 1e9, sys: target, decoy, serviced: false, warnFrom: 0, radar: false, done: false }];   // the helm lesson's yellow pair (never fails)
  power.reserve = Math.max(2, power.reserve); power.reactor.fuel = CELL_ENERGY; power.lever.jammed = false;
  combat.banner = { text: 'Crew training — follow your card (top) and the plate with your name', t: 6 };
}
function updateTraining(dt) {
  if (mission.id !== 'training' || !mission.active) { if (train.on) train.on = false; return; }
  if (train.runId !== mission.runId) trInit();
  if (mission.over) return;
  // a calm sandbox: no jump until graduation, no hot zone, never falls apart, fuel in the crate
  if (!train.grad) { mission.jumpAt = Infinity; mission.jump = null; }
  else { mission.coilsChecked = true; if (!broken(CAPACITORS[1]) && CAPACITORS[1].charge < 1) CAPACITORS[1].charge = 1; }
  mission.press = null;
  if (mission.events.some(e => e.press)) mission.events = mission.events.filter(e => !e.press);
  for (const e of mission.events) if (e.kind === 'maintenance') { e.seen = false; e.t = e.t1 = 1e9; }
  const dead = SYSTEMS.filter(s => s.broken);
  if (dead.length >= MAX_DAMAGE) (dead.find(s => !Object.values(train.p).some(P => trD(P)?.s === s)) || dead[0]).broken = false;
  power.reserve = Math.max(2, power.reserve);
  if (!(power.reactor.fuel > 0) && !Object.values(train.p).some(P => P.lesson === 'fuel')) { if ((train.fuelT = (train.fuelT || 0) + dt) > 5) { power.reactor.fuel = CELL_ENERGY; train.fuelT = 0; } } else train.fuelT = 0;
  // who's aboard: new faces get a record (a returning name its progress back); the ones who left are cleaned up
  for (const c of crew) if (!train.p[c.id]) trRecord(c);
  for (const P of Object.values(train.p)) {
    const c = trCrew(P.id);
    if (c) { if (c.name !== P.name) P.name = c.name; continue; }
    if (P.lesson) trStop(P, 'left');
    trByName.set(P.name, { core: P.core, extra: P.extra });
    delete train.p[P.id]; trPriv.delete(P.id);
  }
  for (const c of crew) {
    const P = train.p[c.id];
    trTickPlayer(P, c, dt);
    // nobody stays down or out for long in training (unless it's the drill)
    if (P.lesson !== 'firstAid') {
      const pv = trPriv.get(c.id);
      if (c.health === 'down' || c.health === 'out') pv.downT = (pv.downT || 0) + dt; else pv.downT = 0;
      if (c.health === 'out' && pv.downT > 20) { c.health = 'down'; pv.downT = 0; }
      else if (c.health === 'down' && pv.downT > 60) { c.health = 'hurt'; c.hurtT = 5; pv.downT = 0; }
    }
  }
  trGuardClaims();
  trHogs(dt);
  if ((trSchedT += dt) >= TR_SCHED) { trSchedT = 0; trSchedule(); }
  trGraduation();
}
// Claim take-overs: a click on someone's training plate (or their fire, their interceptor) takes it over (js/claims.js:
// the last click wins). A free player who still needs that lesson gets it handed over; anyone else is told, and the
// plate goes back to its owner. Letting go of your own plate: it comes back to you (it's your job).
function trGuardClaims() {
  for (const P of Object.values(train.p)) {
    if (!P.lesson) continue;
    const d = trD(P), keys = ['tr-' + P.id];
    if (d?.f && fires.includes(d.f)) keys.push('fire' + uid(d.f));
    if (d?.e && combat.enemies.includes(d.e) && d.e.phase === 'fighting') keys.push('enemy' + uid(d.e));
    if (P.lesson === 'asteroids' && d?.ph === 'shoot' && (combat.swarm || combat.asteroids.length)) keys.push('swarm');
    for (const k of keys) {
      const who = claimOf(k);
      if (who === P.id) continue;
      const Q = who != null && train.p[who];
      const qFree = Q && (!Q.lesson || (!TR_LESSONS[Q.lesson].core && TR_LESSONS[Q.lesson].short)) && Q.state !== 'welcome';   // (free, or on a filler)
      if (qFree && k.startsWith('tr-') && !(TR_LESSONS[P.lesson].core ? Q.core : Q.extra).includes(P.lesson)) {
        const id = P.lesson, c = trCrew(Q.id);
        if (Q.lesson) trStop(Q, 'handover');
        trStop(P, 'handover');
        trNote(P, `${Q.name} took over your ${TR_LESSONS[id].title.toLowerCase()} training. Something else for you in a moment.`);
        const plan = TR_LESSONS[id].plan(Q, c);
        if (!(plan && trFits(TR_LESSONS[id].spawns) && trStart(Q, id, plan))) trNote(Q, 'Can\'t hand that one over right now. Your own job comes in a moment.');
        break;
      }
      if (Q) trNote(Q, `That's ${P.name}'s training job; yours is the plate with your name.`);
      claimEncounter(k, P.id);
    }
  }
}
// Someone else sitting on the repair kit (or the extinguishers) a learner needs: tell them; after a while a spare one turns up.
function trHogs(dt) {
  for (const P of Object.values(train.p)) {
    const need = P.lesson === 'repair' && trD(P)?.ph === 'fix' ? 'repair' : P.lesson === 'fire' && trD(P)?.f ? 'extinguisher' : null;
    const c = trCrew(P.id), pv = trPriv.get(P.id);
    if (!need || !c || c.inv.weapon === need || ITEMS.some(i => i.kind === need) || (hz.floating || []).some(f => f.kind === need)) { pv.hogT = 0; continue; }
    const holders = crew.filter(o => o !== c && o.inv.weapon === need && !(train.p[o.id]?.lesson === P.lesson));
    if (!holders.length) { pv.hogT = 0; continue; }
    pv.hogT = (pv.hogT || 0) + dt;
    if (pv.hogT >= 20 && pv.hogT - dt < 20) for (const o of holders) trNote(train.p[o.id], `${P.name} needs the ${ITEM_NAMES[need]} for training: drop it (click its slot at the bottom), please.`, 10);
    if (pv.hogT >= 40) {
      const spot = need === 'repair' ? { x: 1.6, y: 22.35 } : { x: 15.3, y: 2.2 };
      ITEMS.push({ kind: need, ...dropSpot(spot.x, spot.y), train: P.id });
      trNote(P, `RAIDER found a spare ${ITEM_NAMES[need]} for you.`); pv.hogT = 0;
    }
  }
  if (trCount('extinguisher') < 2) { if ((train.extT = (train.extT || 0) + dt) > 15) { ITEMS.push({ kind: 'extinguisher', x: 15.3, y: 2.2 }); train.extT = 0; } } else train.extT = 0;
}
// Everyone aboard has the core: the graduation jump opens (someone holds the jump handle at the helm). A newcomer
// before the jump closes it again until they're through.
function trGraduation() {
  const all = crew.length > 0 && crew.every(c => train.p[c.id] && trCoreLeft(train.p[c.id]).length === 0);
  if (all && !train.grad) {
    train.grad = true; mission.rules.handle = true; mission.jumpAt = mission.t; mission.coilsChecked = true; mission.autoPull = null;
    combatBanner('Training complete! Graduation jump: hold the jump handle at the helm');
    for (const P of Object.values(train.p)) trNote(P, 'Everyone\'s through basic training! *Graduation jump*: someone holds the jump handle at the helm (front of the bridge) when you\'re all ready. Extras keep going till then.', 14);
  } else if (!all && train.grad) {
    train.grad = false; mission.rules.handle = false; mission.jumpAt = Infinity; mission.jump = null;
    combatBanner('A new crewmate! The graduation jump waits until they\'re trained');
  }
}
const trainSnap = () => ({ on: train.on, runId: train.runId, grad: train.grad, res: train.res, p: train.p });

// ---------------------------------------------------------------------------
// Browser: the card (top centre, yours only), the marks, a click on the card
// ---------------------------------------------------------------------------
let trCardBox = null, trLastSay = null;
try { trControls = (typeof localStorage !== 'undefined' && localStorage.getItem('mn-controls')) || 'mouse'; } catch (e) { /* no storage */ }
// Rich text (*bold*) wrapped to w px: lines of [{ t, b }].
function trRich(text, w, size) {
  const words = []; let bold = false;
  for (const part of String(text).split('*')) { for (const t of part.split(/(\s+)/)) if (t) words.push({ t, b: bold }); bold = !bold; }
  const font = (b) => `${b ? 700 : 400} ${size}px system-ui, sans-serif`, meas = (s, b) => { ctx.font = font(b); return ctx.measureText(s).width; };
  const lines = [[]]; let x = 0;
  for (const wd of words) {
    const ww = meas(wd.t, wd.b);
    if (/^\s+$/.test(wd.t)) { if (x > 0) { lines[lines.length - 1].push(wd); x += ww; } continue; }
    if (x + ww > w && x > 0) { const l = lines[lines.length - 1]; while (l.length && /^\s+$/.test(l[l.length - 1].t)) l.pop(); lines.push([]); x = 0; }
    lines[lines.length - 1].push(wd); x += ww;
  }
  return { lines, font };
}
function trDrawRich(r, x, y, lh, col, boldCol) {
  r.lines.forEach((l, i) => { let xx = x; for (const wd of l) { ctx.font = r.font(wd.b); ctx.fillStyle = wd.b ? boldCol : col; ctx.fillText(wd.t, xx, y + i * lh); xx += ctx.measureText(wd.t).width; } });
}
function drawTrainingHUD() {
  trCardBox = null;
  if (!train.on || !me || !mission.active || mission.over || mission.id !== 'training') return;
  const P = train.p[me.id];
  if (!P) return;
  if (P.say && P.say.id !== trLastSay) { if (trLastSay !== null) sfx.poi?.(); trLastSay = P.say.id; }
  if (P.core.length >= TR_CORE_N && !drawTrainingHUD.saved) { drawTrainingHUD.saved = true; try { localStorage.setItem('mn-tutorial-done', '1'); } catch (e) { /* no storage */ } }
  const x0 = SIDEBAR_X + PLATE_W + 24, x1 = VW - 230, w = Math.max(320, Math.min(620, x1 - x0)), x = clamp((VW - w) / 2, 8, VW - w - 8), pad = 14;
  let y = HUD_H + 62;
  const col = me.color || '#ffe08a';
  const page = P.say && !P.say.hide ? trText(P.say.pages[P.say.i]) : '';
  const goal = P.state === 'lesson' ? trText(P.todo) : P.state === 'waiting' ? P.wait || 'Next job in a moment…' : P.state === 'done' ? (train.grad ? 'Graduation jump: hold the jump handle at the helm when you\'re all ready' : 'All your training done — the others are nearly there') : '';
  const body = page ? trRich(page, w - 2 * pad, 15) : null, gl = goal ? trRich('▶ ' + goal, w - 2 * pad, 15) : null, nl = P.note ? trRich(trText(P.note), w - 2 * pad, 14) : null;
  const h = 30 + (body ? body.lines.length * 20 + 8 : 0) + (P.say?.pages.length > 1 && !P.say.hide ? 14 : 0) + (nl ? nl.lines.length * 18 + 8 : 0) + (gl ? gl.lines.length * 20 + 6 : 0) + 8;
  rr(x, y, w, h, 10); ctx.fillStyle = 'rgba(14,16,24,0.9)'; ctx.fill(); stroke(2, col);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.font = '800 12px system-ui, sans-serif'; ctx.fillStyle = col; ctx.fillText(`RAIDER TRAINING · ${P.title || 'WELCOME'}`, x + pad, y + 9);
  ctx.textAlign = 'right'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5';
  ctx.fillText(`${P.n === 'extra' ? 'extra · ' : P.n ? `lesson ${P.n} · ` : ''}${P.core.length}/${TR_CORE_N} done${P.say ? (P.say.hide ? ' · click: show' : P.say.i < P.say.pages.length - 1 ? ' · click: next' : ' · click: fold') : ''}`, x + w - pad, y + 9);
  ctx.textAlign = 'left';
  let yy = y + 30;
  if (body) { trDrawRich(body, x + pad, yy, 20, '#e8ecf4', '#ffffff'); yy += body.lines.length * 20 + 4; }
  if (body && P.say.pages.length > 1) {
    for (let i = 0; i < P.say.pages.length; i++) { ctx.beginPath(); ctx.arc(x + pad + 4 + i * 12, yy + 5, 3.2, 0, TAU); ctx.fillStyle = i === P.say.i ? col : '#4b5263'; ctx.fill(); }
    yy += 14;
  }
  if (body) yy += 4;
  if (nl) { trDrawRich(nl, x + pad, yy, 18, '#ffc48a', '#ffd9a8'); yy += nl.lines.length * 18 + 8; }
  if (gl) trDrawRich(gl, x + pad, yy, 20, '#ffe9a0', '#ffffff');
  trCardBox = { x, y, w, h };
}
const inTrainCard = (mx, my) => !!trCardBox && mx >= trCardBox.x && mx <= trCardBox.x + trCardBox.w && my >= trCardBox.y && my <= trCardBox.y + trCardBox.h;
// Your marks in the world (rings, like the solo tutorial's), world transform set.
function drawTrainingWorld(view, t) {
  if (!train.on || !me || mission.over) return;
  const P = train.p[me.id];
  for (const p of P?.marks || []) {
    const k = 0.5 + 0.5 * Math.sin(t * 5), r = (p.r || 0.7) + 0.15 * k;
    ctx.beginPath(); ctx.arc(p.x * T, p.y * T, r * T, 0, TAU);
    ctx.strokeStyle = `rgba(255,224,110,${0.55 + 0.4 * k})`; ctx.lineWidth = 4; ctx.stroke();
  }
}
