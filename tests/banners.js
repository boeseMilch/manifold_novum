// The top banner: one shows at a time, the newest at once. Banners raised in the same tick as the one they replace
// used to wipe it out unread ("the nav core was flung clear … grab it within 60 s!" under "Pirate raider destroyed!");
// now the ones pushed aside wait and show afterwards (js/combat.js combatBanner). Run: node tests/banners.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'startMission', 'mission', 'combat', 'combatBanner', 'combatSpawn', 'hitPoi', 'hz', 'withCrew', 'netServer', 'netSerialize'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
// every banner shown over the next s seconds, in order, with how long each was up
function watch(G, s) {
  const seen = [];
  for (let i = 0; i < s * 60; i++) {
    const b = G.combat.banner;
    if (b && seen[seen.length - 1]?.text !== b.text) seen.push({ text: b.text, who: b.who, t: 0 });
    if (b) seen[seen.length - 1].t += DT;
    G.simTick(DT);
  }
  return seen;
}
const quiet = () => { const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false; G.simTick(DT); G.combat.banner = null; return G; };

{ // three in one tick: the last one shows at once (as it always did), the other two follow, each for its full time
  const G = quiet();
  G.combatBanner('A: an instruction'); G.combatBanner('B: grab it!'); G.combatBanner('C: flavour');
  check(G.combat.banner.text === 'C: flavour', `the newest shows at once ("${G.combat.banner.text}")`);
  const seen = watch(G, 12);
  check(seen.map(b => b.text[0]).join('') === 'CBA', `the ones it pushed aside follow, the latest first (${seen.map(b => b.text[0]).join(' ')})`);
  check(seen.every(b => Math.abs(b.t - 3) < 0.1), `each shows for 3 s (${seen.map(b => b.t.toFixed(1)).join(', ')})`);
  check(!G.combat.banner && !G.combat.bannerQueue.length, 'and then the banner is gone');
}
{ // a banner raised later replaces what's showing straight away: news is never late; nothing queues up over time
  const G = quiet();
  G.combatBanner('first'); G.simTick(DT); G.combatBanner('second');
  check(G.combat.banner.text === 'second' && !G.combat.bannerQueue.length, 'a later banner replaces the one showing, as before (nothing waits)');
  G.simTick(DT);
  for (let i = 0; i < 300; i++) { G.combatBanner(`countdown ${i}`); G.simTick(DT); }
  check(G.combat.bannerQueue.length === 0, 'a banner raised every tick never piles up');
  G.combatBanner('same'); G.combatBanner('same'); G.combatBanner('same');
  check(G.combat.banner.text === 'same' && !G.combat.bannerQueue.length, 'the same text three times in one tick is one banner');
}
{ // waiting banners still give way to a new one, then carry on; code that writes combat.banner directly still works
  const G = quiet();
  G.combatBanner('A'); G.combatBanner('B');
  for (let i = 0; i < 60; i++) G.simTick(DT);
  G.combatBanner('news');
  check(G.combat.banner.text === 'news', 'a waiting banner does not hold up a new one');
  const seen = watch(G, 8).map(b => b.text);
  check(seen.join(',') === 'news,A', `the waiting one shows after it (${seen})`);
  G.combatBanner('X'); G.combatBanner('Y'); G.combat.banner = { text: 'Jump blocked', t: 1.5 };
  const seen2 = watch(G, 8).map(b => b.text);
  check(seen2.join(',') === 'Jump blocked,X', `a banner set directly shows, the waiting one after it (${seen2})`);
}
{ // chapter 4: the raider blows up, its nav core is flung clear: both lines get read
  const G = loadGame(NAMES); G.startMission('c4');
  for (const e of G.mission.events) e.done = true;
  G.combatSpawn('pirate', 'star');
  const e = G.combat.enemies.find(e => e.kind === 'pirate'); e.phase = 'fighting';
  G.simTick(DT);
  for (const p of e.pois) G.hitPoi(e, p, e.x || 50, e.y || 10);
  const seen = watch(G, 8).map(b => b.text);
  check(seen.some(t => /nav core was flung clear/.test(t)) && seen.some(t => /Pirate raider destroyed/.test(t)), `"${seen.join('" → "')}"`);
}
{ // multiplayer: the snapshot carries the banner that shows, with who raised it (split screen: their view), also for one that waited
  const G = loadGame(NAMES);
  G.netServer.init('c1'); G.mission.active = false;
  G.netServer.addCrew(1, 'Alice'); G.netServer.addCrew(2, 'Bob');
  const [A, B] = G.crew;
  G.simTick(DT); G.combat.banner = null;
  G.withCrew(A, () => G.combatBanner('Alice\'s radar result')); G.withCrew(B, () => G.combatBanner('Bob wedged the lever'));
  const snap = () => JSON.parse(JSON.stringify(G.netSerialize())).combat.banner;
  let s = snap();
  check(s.text === 'Bob wedged the lever' && s.who === B.id, `the snapshot's banner is the one showing, with its owner (${s.text}, who ${s.who})`);
  for (let i = 0; i < 60 * 3 + 5; i++) G.simTick(DT);
  s = snap();
  check(s && s.text === 'Alice\'s radar result' && s.who === A.id, `then the one that waited, still its owner's (${s?.text}, who ${s?.who})`);
}
{ // split screen: a view has no plates column, so its banner band starts at the view's left edge (not 280 px in)
  let split = false;
  const G = loadGame([...NAMES, 'bannerBand', 'SIDEBAR_X', 'PLATE_W', 'VW'], { localSplit: () => split });
  const list = { x: G.VW - 200, bottom: 120 };
  const one = G.bannerBand(list, 36); split = true; const two = G.bannerBand(list, 36);
  check(one.x0 === G.SIDEBAR_X + G.PLATE_W + 14 && two.x0 === 14 && two.x1 === one.x1 && two.y === one.y, `the band starts at x ${one.x0} beside the plates, at x ${two.x0} in a split view (${two.x1 - two.x0} px instead of ${one.x1 - one.x0})`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall banner tests passed');
process.exitCode = failed ? 1 : 0;
