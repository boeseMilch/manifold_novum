// Encounter sidebar: plates appear for upcoming contacts and active problems, slide up from
// the bottom, carry a red light only for problems that are happening, and leave once dealt
// with. Run: node tests/sidebar.js
const { loadGame } = require('./harness');
const G = loadGame(['tick', 'render', 'mission', 'startMission', 'radarScan', 'encounterPlates', 'sidePlates', 'combat', 'combatSpawn',
  'combatClear', 'SYSTEMS', 'fires', 'spawnFire', 'VH', 'power']);
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const step = (n) => { for (let i = 0; i < n; i++) { G.combat.shots.length = 0; G.tick(DT); G.render(i * DT); } };

G.startMission(); G.power.reactor.fuel = 0;
step(60 * 20); G.radarScan(); step(2);
let list = G.encounterPlates();
const up = list.find(p => p.key.startsWith('ev'));
check(up && !up.red && /T-\d+/.test(up.sub), `a radar contact gets a plate with a countdown and no red light ("${up?.title}: ${up?.sub}")`);
const fresh = G.sidePlates.get(up.key);
check(fresh && fresh.y > G.VH * 0.5, 'a new plate starts low (it slides up from the bottom)');
step(90);
check(G.sidePlates.get(up.key).y < 200, `…and rises into its slot (y=${Math.round(G.sidePlates.get(up.key).y)})`);
step(60 * 22);                                      // the interceptor arrives at T+40
list = G.encounterPlates();
const enemy = list.find(p => p.key.startsWith('enemy'));
check(enemy && enemy.red && !list.some(p => p.key === up.key), 'once the interceptor is here, its plate has a red light (the countdown plate is gone)');
check(list[0] === enemy || list[0].red, 'active problems are listed first');
G.combatClear(); step(60);
check(!G.encounterPlates().some(p => p.key.startsWith('enemy')) && !G.sidePlates.has(enemy.key), 'dealt with: the plate slides away');
G.spawnFire(5, 8); step(2);
check(G.encounterPlates().some(p => p.key.startsWith('fire') && p.red), 'a fire gets a red plate');
G.SYSTEMS[0].broken = true; step(2);
check(G.encounterPlates().some(p => p.title === 'BROKEN' && p.sub === G.SYSTEMS[0].name), 'a broken part gets a plate until it is repaired');
process.exitCode = failed ? 1 : 0;
