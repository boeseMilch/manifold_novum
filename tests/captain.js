// Captain Red Comet, the pirate base's boss (js/captain.js): his cycle and timings, the front shield vs the generator on
// his back, ALL HANDS at 75 % (pirates through the blast door, by crew size, at most 3 alive), the 50 % transition
// (invulnerable, coat off), the dash (into cover: dazed, double damage from the front; in the open: a 3-armed spin), the
// escape at 0 (the brig door unlocks; never with the code before), solo start to end, the raider twist (2+ players only),
// the snapshot.
// Run: node tests/captain.js
const { loadGame } = require('./harness');
const NAMES = ['dk', 'DG', 'simTick', 'crew', 'me', 'makeCrew', 'mission', 'startMission', 'boarding', 'captainPractice', 'captGen', 'baseCodeOk', 'openBasePad', 'miniCommand',
  'power', 'netSerialize', 'netApply', 'CAPT_BREATH', 'CAPT_TEL', 'CAPT_DAZE', 'captMaxHp', 'withCrew', 'walkRects', 'canStand', 'ITEMS', 'combat', 'roomAt', 'inBase', 'HATCHES', 'FUEL_CRATE', 'inRect'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const B = (G) => G.dk.boss;
function fresh(n = 1, phase = 1, easy = 0) {
  const G = loadGame(NAMES);
  while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
  G.startMission('practice'); G.mission.easy = easy;
  G.withCrew(G.me, () => G.captainPractice(phase));
  const Q = G.DG().rooms[5];
  G.crew.forEach((c, i) => Object.assign(c, i ? { mode: 'inside', x: 20 + i, y: 6 } : { x: Q.x + 6 + i * 0.6, y: Q.y + Q.h - 1.5 }));
  return G;
}
const keepSafe = (G) => { for (const c of G.crew) c.health = 'ok'; };
const tick = (G, s, each) => { for (let i = 0; i < Math.round(s * 60); i++) { each?.(); G.simTick(DT); keepSafe(G); } };
const until = (G, cond, max = 30, each) => { let t = 0; while (!cond() && t < max) { each?.(); G.simTick(DT); keepSafe(G); t += DT; } return t; };
// A crew bolt from (fx, fy) straight at (tx, ty).
function shoot(G, fx, fy, tx, ty, dmg) {
  const a = Math.atan2(ty - fy, tx - fx);
  G.boarding.bolts.push({ x: fx, y: fy, z: 0.9, ox: fx, oy: fy, vx: Math.cos(a) * 26, vy: Math.sin(a) * 26, life: 0.9, owner: 'crew', ...(dmg ? { dmg } : {}) });
  for (let i = 0; i < 12; i++) G.simTick(DT);
}
const behind = (G, k = 2.2) => { const b = B(G); return { x: b.x - Math.cos(b.face) * k, y: b.y - Math.sin(b.face) * k }; };
const front = (G, k = 2.2) => { const b = B(G); return { x: b.x + Math.cos(b.face) * k, y: b.y + Math.sin(b.face) * k }; };
const doorPirates = (G) => G.dk.pirates.filter(p => p.door).length;

// --- waiting on his throne; the fight starts when someone walks in; phase 1's cycle and timings
{
  const G = fresh(1), me = G.me, Dq = G.DG().doors[2];
  me.x = Dq.x + Dq.w / 2; me.y = Dq.y + Dq.h + 0.6; tick(G, 1);
  check(B(G).state === 'wait' && !B(G).met, 'he waits on his throne while nobody is in his quarters');
  me.y = Dq.y - 1.2; G.simTick(DT);
  check(B(G).state === 'buckshot' && /Who let you in here/.test(G.combat.banner?.text || ''), `someone walks in: the fight starts ("${G.combat.banner?.text}")`);
  const log = []; let last = null, pellets = 0, bolts = 0, t = 0;
  tick(G, 22, () => {
    t += DT; const k = B(G).state + (B(G).state === 'buckshot' ? ':' + B(G).sub : '');
    if (k !== last) { log.push([k, t]); last = k; }
    for (const b of G.boarding.bolts) if (b.owner === 'captain' && !b.seen) { b.seen = true; b.kind === 'pellet' ? pellets++ : bolts++; }
  });
  const states = log.map(l => l[0].split(':')[0]).filter((s, i, a) => s !== a[i - 1]);
  check(states.slice(0, 4).join() === 'buckshot,spin,breath,buckshot', `the cycle: ${states.slice(0, 5).join(' → ')}`);
  const aims = log.filter(l => l[0] === 'buckshot:aim'), recov = log.filter(l => l[0] === 'buckshot:recover');
  check(Math.abs(recov[0][1] - aims[0][1] - G.CAPT_TEL[0]) < 0.05, `the laser-sight telegraph lasts ${G.CAPT_TEL[0]} s before the blast`);
  check(pellets >= 21 && aims.filter(a => a[1] < log.find(l => l[0] === 'spin')[1]).length === 3, `buckshot ×3 (7 pellets each: ${pellets} pellets so far), then the spin (${bolts} bolts)`);
  const br = log.find(l => l[0] === 'breath'), next = log.find(l => l[1] > br[1] && l[0] !== 'breath');
  check(Math.abs(next[1] - br[1] - G.CAPT_BREATH[0]) < 0.6, `he catches his breath ~${G.CAPT_BREATH[0]} s (${(next[1] - br[1]).toFixed(2)} s incl. a step off the wall)`);
  const E = fresh(1, 1, 2), m2 = E.me; m2.y = E.DG().doors[2].y - 1.2; E.simTick(DT);
  const t0 = until(E, () => B(E).sub === 'aim'), t1 = until(E, () => B(E).sub === 'recover');
  check(Math.abs(t1 - G.CAPT_TEL[0] * 1.7) < 0.05, `very easy: a slower telegraph (${t1.toFixed(2)} s)`);
}
// --- the front shield ripples shots off; only the generator on his back can be hurt
{
  const G = fresh(1); tick(G, 0.1);
  const b = B(G); b.state = 'breath'; b.sub = 'pant'; b.t = -99;
  const hp = b.hp, f = front(G), k = behind(G);
  shoot(G, f.x, f.y, b.x, b.y);
  check(B(G).hp === hp && B(G).clock - B(G).ripT < 0.5, 'a shot from the front ripples off his shield');
  const G2 = G.captGen(B(G)); shoot(G, k.x, k.y, G2.x, G2.y);
  check(B(G).hp === hp - 1, `a shot from behind into the generator hurts (${hp} → ${B(G).hp} of ${B(G).max})`);
  check(G.captMaxHp(1) === 18 && G.captMaxHp(2) === 24 && G.captMaxHp(3) === 36 && G.captMaxHp(4) === 48 && G.captMaxHp(8) === 96 && G.captMaxHp(9) === 96, 'HP scales with the crew (18 solo, 24 with two, then +12 each, up to 8)');
}
// --- 75 %: ALL HANDS through the blast door (1 solo, 2 for two, 3 for more; at most 3 alive, solo 2)
for (const [n, want] of [[1, 1], [2, 2], [4, 3]]) {
  const G = fresh(n); tick(G, 0.1);
  const b = B(G); b.hp = b.max * 0.75 + 0.5; b.state = 'breath'; b.sub = 'pant'; b.t = 0;
  const g = G.captGen(b), k = behind(G); shoot(G, k.x, k.y, g.x, g.y);
  check(b.s75 && b.whistleDue, `${n} crew: 75 %: the whistle is due`);
  until(G, () => B(G).state === 'whistle', 10);
  check(B(G).state === 'whistle' && G.dk.dock.blast === 'alarm', `${n} crew: he whistles, the blast door's alarm`);
  until(G, () => doorPirates(G) >= want && !B(G).door, 10);
  check(doorPirates(G) === want && G.dk.dock.blast === 'closed', `${n} crew: ${doorPirates(G)} pirate(s) came through the blast door, it shut again`);
  if (n === 4) {
    b.door = null; G.dk.dock.blast = 'closed'; const S = G.DG().rooms[5];
    // three already alive: the phase-2 trickle adds none
    b.phase = 2; b.trickle = 29.9; tick(G, 4);
    check(doorPirates(G) === 3, 'never more than 3 of his door pirates alive');
  }
  if (n === 1) {                                       // solo: at most 2 alive (2026-10-20, the user: one less for solo)
    b.door = null; G.dk.dock.blast = 'closed'; b.phase = 2;
    for (let i = 0; i < 4; i++) { b.trickle = 29.9; tick(G, 4); }
    check(doorPirates(G) === 2, `solo: the phase-2 trickle stops at 2 door pirates alive (${doorPirates(G)})`);
  }
}
// --- 50 %: the bubble (invulnerable), coat off, red lights, a pirate wave; then comet mode
{
  const G = fresh(1); tick(G, 0.1);
  const b = B(G); b.hp = b.max * 0.5 + 0.5; b.s75 = true; b.state = 'breath'; b.sub = 'pant'; b.t = 0;
  let g = G.captGen(b), k = behind(G); shoot(G, k.x, k.y, g.x, g.y);
  check(b.state === 'transition' && b.hp === b.max * 0.5 && b.red, 'at 50 %: the transition (the shield bubble), red lights');
  g = G.captGen(b); k = behind(G); shoot(G, k.x, k.y, g.x, g.y);
  check(b.hp === b.max * 0.5, 'invulnerable in the bubble (a generator shot ripples off)');
  until(G, () => B(G).coat, 3);
  check(!!b.coat && b.state === 'transition' && b.t >= 1.25, `he throws off his coat (on the floor at ${b.t.toFixed(1)} s)`);
  until(G, () => B(G).phase === 2, 3);
  check(b.phase === 2 && b.state === 'buckshot', 'then comet mode: phase 2 starts with buckshot');
  tick(G, 2);
  check(doorPirates(G) === 1, 'a pirate wave came through the blast door (1 solo)');
}
// --- phase 2: the dash. Into cover → dazed, double damage from the front; in the open → a 3-armed spin
{
  const G = fresh(1, 2); tick(G, 0.1);
  const Q = G.DG().rooms[5], me = G.me, b = B(G), cov = G.DG().qcover.pillar;
  // me just below the pillar (it's behind me as he sees it), him further down the room
  Object.assign(me, { x: cov.x, y: cov.y + cov.h + 0.9 });            // (its left edge: clear of the chest below it)
  Object.assign(b, { x: me.x, y: Q.y + Q.h - 0.8, state: 'buckshot', sub: 'recover', shots: 0, t: 0, step: 0 });
  until(G, () => B(G).state === 'dash' && B(G).dash, 3);
  check(b.state === 'dash' && b.sub === 'tele' && b.dash?.hit && b.dash.len > 3, `DASH: the glowing line, aimed through me into the pillar behind (${b.dash?.len.toFixed(1)} units)`);
  let hp0 = me.health; me.x += 1.5;                             // sidestep out of the line
  until(G, () => B(G).state !== 'dash', 4, () => { G.me.health = 'ok'; });
  check(b.state === 'dazed' && b.trail.length > 3, `he slams into the pillar: DAZED (fire trail: ${b.trail.length} patches; ${b.state})`);
  const hp = b.hp, f = front(G, 1.8); shoot(G, f.x, f.y, b.x, b.y - 0.1);
  check(hp - b.hp === 2, `dazed: a shot from the front does double damage (${hp} → ${b.hp})`);
  const t = until(G, () => B(G).state !== 'dazed', 6);
  check(Math.abs(t + 0.2 - G.CAPT_DAZE) < 0.3 && b.state === 'breath', `dazed ~${G.CAPT_DAZE} s, then he catches his breath`);
  // in the open: no wall within reach past me → he stops short and spins (3 arms)
  const H = fresh(1, 2); tick(H, 0.1);
  const Q2 = H.DG().rooms[5], m2 = H.me, b2 = B(H);
  Object.assign(b2, { x: Q2.x + 2.2, y: Q2.y + 5.6, face: 0, state: 'buckshot', sub: 'recover', shots: 0, t: 0, step: 0 });
  Object.assign(m2, { x: Q2.x + 4.4, y: Q2.y + 5.6 });
  until(H, () => B(H).state === 'dash' && B(H).dash, 3);
  check(b2.dash && !b2.dash.hit, `aimed into the open (stops ${b2.dash.len.toFixed(1)} units on, short of anything)`);
  let struck = false; until(H, () => B(H).state !== 'dash', 4, () => { if (H.me.health !== 'ok') struck = true; });
  check(b2.state === 'spin' && b2.arms === 3, 'a miss: straight into a faster 3-armed spin');
  check(b2.dash === null, '(the dash is over)');
  // standing in the dash path: a hit, knocked aside
  const K = fresh(1, 2); tick(K, 0.1); const Q3 = K.DG().rooms[5], m3 = K.me, b3 = B(K);
  Object.assign(b3, { x: Q3.x + 2.2, y: Q3.y + 5.6, face: 0, state: 'dash', sub: 'tele', t: 0, dash: null, step: 1 });
  Object.assign(m3, { x: Q3.x + 5, y: Q3.y + 5.6 });
  K.simTick(DT); const y0 = m3.y; let hit = false;
  for (let i = 0; i < 120 && !hit; i++) { K.simTick(DT); if (m3.health !== 'ok') hit = true; }
  check(hit && Math.abs(m3.y - y0) > 1, `standing in his path: a hit and knocked aside (${(m3.y - y0).toFixed(1)} units)`);
}
// --- the end: at 0 the generator bursts, he runs to his escape pod, it launches, the brig door unlocks (never the code before)
{
  const G = fresh(1, 2), d = G.dk.dock; tick(G, 0.1);
  G.baseCodeOk(4);
  check(d.doors[4], 'the brig door doesn\'t open with the code while the captain is around');
  const b = B(G); b.hp = 1; b.state = 'breath'; b.sub = 'pant'; b.t = 0;
  const g = G.captGen(b), k = behind(G); shoot(G, k.x, k.y, g.x, g.y);
  check(b.state === 'flee' && b.hp === 0, 'at 0: the generator bursts, he staggers off');
  until(G, () => B(G).state === 'gone', 20);
  check(b.state === 'gone' && b.fled && b.pod === 'launched' && b.hidden && !d.doors[4], 'into his escape pod ("THIS ISN\'T OVER!"), it launches, the brig door unlocks');
}
// --- he walks back to his throne when nobody's left in his quarters (no healing)
{
  const G = fresh(1); tick(G, 2);
  const b = B(G); b.hp -= 5; const hp = b.hp; G.me.y = G.DG().rooms[4].y + 1.5; G.me.x = G.DG().rooms[4].x + 9;
  until(G, () => B(G).state === 'wait', 20);
  check(b.state === 'wait' && b.hp === hp, 'nobody in his quarters: he walks back to his throne and waits (no healing)');
}
// --- solo, start to end: dodge nothing (kept on our feet), shoot the generator from behind whenever he catches his breath or is dazed
{
  const G = fresh(1); const me = G.me, Q = G.DG().rooms[5];
  let t = 0, shots = 0, cd = 0;
  while (B(G).state !== 'gone' && t < 600) {
    const b = B(G);
    if ((b.state === 'breath' && b.sub === 'pant') || b.state === 'dazed' || (b.state === 'spin' && b.sub === 'spin')) {
      const k = behind(G, 2.0);
      if (G.canStand(k.x, k.y, G.walkRects()) && G.inRect(k.x, k.y, Q)) { me.x = k.x; me.y = k.y; }
      if ((cd -= DT) <= 0) { cd = 0.9; const g = G.captGen(b); G.boarding.bolts.push({ x: me.x, y: me.y, z: 0.9, ox: me.x, oy: me.y, vx: (g.x - me.x) * 12, vy: (g.y - me.y) * 12, life: 0.4, owner: 'crew' }); shots++; }
    } else if (b.state !== 'flee') { me.x = Q.x + 6; me.y = Q.y + Q.h - 1.2; }
    G.simTick(DT); keepSafe(G); t += DT;
  }
  check(B(G).state === 'gone' && !G.dk.dock.doors[4], `solo: beaten in ${t.toFixed(0)} s (${shots} shots at the generator), the brig door open`);
  check(!G.dk.raid, 'solo: no raider at our other airlock, ever');
}
// --- the twist (2+ players): a raider docks at our other airlock while we're in the base; its pirates go for our fuel
{
  const G = fresh(2); const other = G.crew[1]; other.x = 20; other.y = 6;
  G.power.reserve = 3; tick(G, 13);
  check(!G.dk.raid, 'not yet (13 s into the fight)');
  tick(G, 3);
  const R = G.dk.raid, side = G.dk.dock.side === 'port' ? 'star' : 'port';
  check(R?.state === 'docked' && R.side === side && G.dk.pirates.filter(p => p.raid).length === 2, `2 players: a raider docked at our other (${side}) airlock ${R ? '' : 'NOT '}15 s into the fight, two pirates aboard`);
  check(G.walkRects().some(q => q === G.DG && false) || G.canStand(side === 'star' ? G.HATCHES[1].x + 2 : G.HATCHES[0].x - 2, G.HATCHES.find(h => h.side === side).y, G.walkRects()), 'its tube is walkable');
  const r0 = G.power.reserve; other.x = 2; other.y = 2;           // nobody stops them
  until(G, () => G.dk.raid.state === 'gone', 120);
  check(G.dk.raid.state === 'gone' && G.power.reserve < r0 && G.dk.raid.stolen.length >= 1, `they took ${G.dk.raid.stolen.length} fuel cell(s) and cast off`);
  const H = fresh(3); H.power.reserve = 3; tick(H, 16.5);
  const p = H.dk.pirates.filter(p => p.raid);
  for (const q of p) q.hp = 0, q.dead = true;
  H.dk.pirates = H.dk.pirates.filter(q => !q.dead); tick(H, 2);
  check(H.dk.raid?.state === 'gone' && !H.dk.raid.stolen.length, 'both raiders down: it casts off empty-handed');
}
// --- the snapshot carries the fight (dk.boss, dk.raid)
{
  const G = fresh(2); tick(G, 8);
  const H = loadGame(NAMES); H.startMission('practice');
  H.netApply(JSON.parse(JSON.stringify(G.netSerialize())), G.me.id);
  check(JSON.stringify(H.dk.boss) === JSON.stringify(G.dk.boss) && JSON.stringify(H.dk.raid) === JSON.stringify(G.dk.raid) && H.dk.boss.met, 'the fight\'s state reaches every browser in the snapshot');
}
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
