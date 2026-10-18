// Sounds only one crew member hears (sfxFor: their own action at a console, e.g. the radar's ping, 2026-10-17
// playtest "they should not get a sound from you checking the radar"): solo it plays, on the server it is tagged
// for that crew member and only their browser plays it. Run: node tests/sfxfor.js
const { loadGame } = require('./harness');
const G = loadGame(['sfx', 'sfxFor', 'netCaptureSfx', 'netPlaySfx', 'radarScan', 'startMission', 'player', 'me']);
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

G.startMission('c1');
const played = []; G.sfx.poi = () => played.push('poi');
G.sfxFor({ id: 1 }, 'poi');
check(played.length === 1, 'solo: sfxFor just plays the sound');

const events = G.netCaptureSfx();                     // the server: every sound is recorded and sent along
G.player.id = 7; G.radarScan();
const ping = events.find(e => e[0] === 'poi');
check(ping && ping[2] === 7, `the server tags the radar's ping for the crew member who scanned (${JSON.stringify(ping)})`);
G.sfx.poi = () => played.push('poi'); G.sfx.forCrew = undefined;   // (back to a browser)
played.length = 0; G.me.id = 3; G.netPlaySfx([['poi', [], 7]]);
check(played.length === 0, 'another browser doesn\'t play it');
G.me.id = 7; G.netPlaySfx([['poi', [], 7]]);
check(played.length === 1, 'the scanner\'s browser does');
process.exitCode = failed ? 1 : 0;
