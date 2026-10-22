// Being hurt is impossible to miss (js/game.js updateInjuryFx / injuryStatus): the badge's text for hurt /
// down / out, the hit flash and jolt for this browser's own player (not for a crewmate's hit), a blood trail
// while hurt and walking (capped, fading), a pool under the downed, droplets on a spacewalk.
// Run: node tests/injuryfx.js
const { loadGame } = require('./harness');
const NAMES = ['crew', 'me', 'hurtCrew', 'updateInjuryFx', 'injuryStatus', 'INJ', 'BLOOD_MAX', 'BLOOD_LIFE', 'BLOOD_STEP', 'makeCrew', 'HURT_TIME'];
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const DT = 1 / 60;
const fresh = () => { const G = loadGame(NAMES); G.updateInjuryFx(DT, 0); return G; };
const floorDrops = (G) => G.INJ.blood.filter(b => !b.air && !b.pool);

{ // the badge's text
  const G = fresh(), me = G.me;
  check(G.injuryStatus(me) === null, 'fine: no badge');
  G.hurtCrew(me);
  let st = G.injuryStatus(me), txt = st && st.lines.join(' | ');
  check(st && st.title === 'HURT', `hurt: "${st && st.title}"`);
  check(/one more hit/i.test(txt) && /DOWN/.test(txt), `hurt: says one more hit puts you down (${txt})`);
  check(new RegExp(`in ${G.HURT_TIME} s`).test(txt), 'hurt: says when it heals');
  check(/snack/i.test(txt), 'hurt: a snack helps');
  check(/coffee/i.test(txt), 'hurt, alone: coffee (no crewmate to patch you up)');
  me.snackT = 42; st = G.injuryStatus(me);
  check(/42 s/.test(st.lines.join(' ')), 'just had a snack: when the next one is');
  const B = G.makeCrew('Bo', me.x + 3, me.y); G.crew.push(B);
  st = G.injuryStatus(me);
  check(/crewmate/i.test(st.lines.join(' ')), 'hurt, with a crewmate standing: they can patch you up');
  G.crew.pop();
  G.hurtCrew(me); st = G.injuryStatus(me); txt = st.lines.join(' | ');
  check(st.title === 'DOWN' && /can't move/i.test(txt) && /get up \(10 s\)/.test(txt), `down: can't move, how to get up (${txt})`);
  G.hurtCrew(me); st = G.injuryStatus(me); txt = st.lines.join(' | ');
  check(st.title === 'OUT COLD' && /crawl back up/.test(txt), `out cold, alone: crawl back up (${txt})`);
  G.crew.push(B); st = G.injuryStatus(me);
  check(/crewmate has to treat you/.test(st.lines.join(' ')), 'out cold, a crewmate standing: they have to treat you');
}
{ // the hit flash and jolt: yours only, stronger going down; the vest's soaked hit a small one
  const G = fresh(), me = G.me;
  check(G.INJ.flash === 0 && G.INJ.shake === 0, 'no hit: no flash');
  G.hurtCrew(me); G.updateInjuryFx(DT, 0.1);
  const hurtFlash = G.INJ.flash;
  check(hurtFlash > 0.9 && G.INJ.shake > 0 && !G.INJ.flashDown, `hit: a red flash (${hurtFlash.toFixed(2)}) and a jolt`);
  for (let i = 0; i < 120; i++) G.updateInjuryFx(DT, 0.1 + i * DT);
  check(G.INJ.flash === 0 && G.INJ.shake === 0, 'the flash and the jolt pass within 2 s');
  G.hurtCrew(me); G.updateInjuryFx(DT, 3);
  check(G.INJ.flash > hurtFlash && G.INJ.flashDown, `going down: a stronger flash (${G.INJ.flash.toFixed(2)})`);
  const H = fresh(), B = H.makeCrew('Bo', H.me.x + 3, H.me.y); H.crew.push(B); H.updateInjuryFx(DT, 0);
  H.hurtCrew(B); H.updateInjuryFx(DT, 0.1);
  check(H.INJ.flash === 0 && H.INJ.shake === 0, 'a crewmate hit: no flash on your screen');
  const V = fresh(); V.me.armor = 1; V.updateInjuryFx(DT, 0); V.hurtCrew(V.me); V.updateInjuryFx(DT, 0.1);
  check(V.me.health === 'ok' && V.INJ.flash > 0 && V.INJ.flash < 1, `the vest took it: a small flash (${V.INJ.flash.toFixed(2)})`);
}
{ // the blood trail: while hurt and walking, capped, fading
  const G = fresh(), me = G.me;
  for (let i = 0; i < 60; i++) { me.x += 0.05; G.updateInjuryFx(DT, i * DT); }
  check(floorDrops(G).length === 0, 'fine and walking: no trail');
  G.hurtCrew(me); G.updateInjuryFx(DT, 1);
  const splash = G.INJ.blood.length;
  check(splash > 0, `the hit: a splash on the floor (${splash} drops)`);
  for (let i = 0; i < 60; i++) { me.x += 0.05; G.updateInjuryFx(DT, 1 + i * DT); }   // 3 tiles
  const n = G.INJ.blood.length - splash, want = Math.floor(3 / G.BLOOD_STEP);
  check(Math.abs(n - want) <= 1, `hurt, walking 3 tiles: ${n} drops (about ${want})`);
  const before = G.INJ.blood.length;
  for (let i = 0; i < 4; i++) { me.x += 0.5; G.updateInjuryFx(0.1, 2 + i * 0.1); }      // a slow frame: still a trail along the way
  check(G.INJ.blood.length - before >= 4, `slow frames (0.5 tiles each): the trail keeps up (${G.INJ.blood.length - before} drops)`);
  const b2 = G.INJ.blood.length; me.x += 20; G.updateInjuryFx(DT, 3);
  check(G.INJ.blood.length === b2, 'a teleport: no trail across');
  for (let i = 0; i < 3000; i++) { me.x += i % 400 < 200 ? 0.1 : -0.1; me.hurtT = G.HURT_TIME; G.updateInjuryFx(DT, 3 + i * DT); }
  check(G.INJ.blood.length <= G.BLOOD_MAX, `a long walk: at most ${G.BLOOD_MAX} drops (${G.INJ.blood.length})`);
  me.health = 'ok';
  for (let i = 0; i < (G.BLOOD_LIFE + 1) * 10; i++) G.updateInjuryFx(0.1, 60 + i * 0.1);
  check(G.INJ.blood.length === 0, `healed: the trail is gone after ${G.BLOOD_LIFE} s`);
}
{ // standing still while hurt: a drop now and then; down: a pool; a spacewalk: droplets in the air, none on the floor
  const G = fresh(), me = G.me;
  G.hurtCrew(me); G.updateInjuryFx(DT, 0); const s0 = G.INJ.blood.length;
  for (let i = 0; i < 300; i++) G.updateInjuryFx(DT, i * DT);
  check(G.INJ.blood.length > s0, 'hurt, standing still: it still drips');
  G.hurtCrew(me); for (let i = 0; i < 60; i++) G.updateInjuryFx(DT, 6 + i * DT);
  const pools = G.INJ.blood.filter(b => b.pool);
  check(pools.length === 1 && pools[0].grow > 0, 'down: a pool spreads under them');
  const E = fresh(); E.me.mode = 'eva'; E.hurtCrew(E.me); E.updateInjuryFx(DT, 0);
  for (let i = 0; i < 120; i++) { E.me.x += 0.05; E.updateInjuryFx(DT, i * DT); }
  check(floorDrops(E).length === 0 && E.INJ.blood.some(b => b.air), 'a spacewalk: droplets drift off, no trail on the floor');
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('all ok');
