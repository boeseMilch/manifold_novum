// Several crew in one simulation (what the server runs): separate input, inventories, panels,
// prompts; enemies and the intruder pick between crew members. Run: node tests/multiplayer.js
const { loadGame } = require('./harness');
const G = loadGame(['simTick', 'netServer', 'crew', 'ITEMS', 'withCrew', 'clickTarget', 'combat', 'combatSpawn', 'pickEnemyTarget',
  'boarding', 'spawnInvader', 'mission', 'SECURITY', 'netSerialize', 'gameLighting']);
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const step = (n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };

G.netServer.init('intro'); G.mission.active = false;
G.netServer.addCrew(1, 'Alice'); G.netServer.addCrew(2, 'Bob');
const [A, B] = G.crew;
check(G.crew.length === 2 && A.color !== B.color, `two crew members with their own colors (${A.color}, ${B.color})`);

// separate movement
const bx0 = B.x, by0 = B.y, ax0 = A.x;
step(60, () => G.netServer.input(1, { keys: ['KeyA'], pressed: [], mouse: { wx: 0, wy: 0 } }));
G.netServer.input(1, { keys: [], pressed: [], mouse: {} });
check(A.x < ax0 - 2 && B.x === bx0 && B.y === by0, `Alice walks on her own input, Bob stays put (${ax0.toFixed(1)} → ${A.x.toFixed(1)})`);

// separate inventories: Alice picks up the laser, Bob has nothing
const laser = G.ITEMS.find(i => i.kind === 'laser');
A.x = laser.x - 0.8; A.y = laser.y; A.mode = 'inside';
G.netServer.input(1, { keys: [], pressed: [], mouse: { wx: laser.x, wy: laser.y, click: true } });
step(2);
check(A.inv.weapon === 'laser' && !B.inv.weapon, 'Alice picks up the laser into her own slot; Bob\'s stays empty');

// separate panels: Bob opens the security console
B.x = G.SECURITY.x; B.y = G.SECURITY.y + 1.2;
G.netServer.input(2, { keys: [], pressed: [], mouse: { wx: G.SECURITY.x, wy: G.SECURITY.y + 0.5, click: true } });
step(2);
check(B.ui.panel === 'security' && !A.ui.panel, 'Bob opens the security console; Alice\'s screen is unaffected');
G.netServer.command(2, ['closePanel']); step(1);
check(!B.ui.panel, 'commands run for the crew member who sent them (Bob closes his panel)');

// enemies pick a crew member who is outside
A.mode = 'eva'; A.x = -2.5; A.y = 10; B.mode = 'inside';
G.combatSpawn('interceptor', 'port');
const e = G.combat.enemies[0];
let atA = 0, atB = 0;
for (let i = 0; i < 300; i++) { const t = G.pickEnemyTarget(e); if (t.atCrew && t.crewId === 1) atA++; if (t.atCrew && t.crewId === 2) atB++; }
check(atA > 50 && atB === 0, `enemy guns aim at whoever is outside (Alice ${atA}×, Bob inside ${atB}×)`);

// the intruder goes for the nearest crew member it can see
A.mode = 'inside'; A.x = 6; A.y = 19; B.mode = 'inside'; B.x = 37; B.y = 19;
G.spawnInvader('port');
const a = G.boarding.invaders[0];
step(60 * 4);
check(a.state === 'fight' && a.target === A, `the intruder engages the nearest crew member (${a.target?.name})`);

// the helmet lamp: always on for everyone, in the snapshot, applied in another browser, lit; the command
// (debug menu) still switches one off, for everyone
B.mode = 'inside'; B.x = 22; B.y = 5; B.health = 'ok';
step(1);
const snap = JSON.parse(JSON.stringify(G.netSerialize()));
const C2 = loadGame(['netApply', 'crew', 'gameLighting']);
C2.netApply(snap, 1);
const spots = (g) => g.gameLighting(0).lights.filter(l => l.cone && Math.abs(l.z - 1.32) < 0.01);
const lit0 = spots(C2).length;
check(B.lamp && A.lamp && snap.crew.every(c => c.lamp === true) && C2.crew.find(c => c.id === 2)?.lamp === true && lit0 >= 1,
  `helmet lamps are on for everyone from the start, and another browser lights them (${lit0} beams)`);
G.netServer.command(2, ['lamp']); step(1);
C2.netApply(JSON.parse(JSON.stringify(G.netSerialize())), 1);
check(!B.lamp && C2.crew.find(c => c.id === 2)?.lamp === false && spots(C2).length === lit0 - 1, 'the lamp command switches Bob\'s off, for everyone');

// leaving drops your gear on the floor
G.netServer.removeCrew(1);
check(G.crew.length === 1 && G.ITEMS.some(i => i.kind === 'laser'), 'leaving the game drops your gear where you stood');
process.exitCode = failed ? 1 : 0;
