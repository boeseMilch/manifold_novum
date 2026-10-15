// The soundtrack (js/music.js): the written score fits together (themes on their chords, every mission
// has a piece), and the engine runs against a fake WebAudio: one sequencer, every piece at every stage,
// the build-up, the jump spool and final hit, clean switching, pausing in hidden tabs.
// Run: node tests/music.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
let now = 0, nodes = 0;
const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const node = () => { nodes++; return new Proxy({}, { get: (t, k) => (k in t ? t[k] : ['connect', 'start', 'stop', 'disconnect'].includes(k) ? () => {} : (t[k] = param())), set: (t, k, v) => ((t[k] = v), true) }); };
class FakeAC {
  constructor() { this.sampleRate = 8000; this.destination = node(); this.state = 'running'; }
  get currentTime() { return now; }
  resume() {} createGain() { return node(); } createOscillator() { return node(); } createBiquadFilter() { return node(); }
  createBufferSource() { return node(); } createConvolver() { return node(); } createDelay() { return node(); }
  createDynamicsCompressor() { return node(); } createStereoPanner() { return node(); }
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
}
const listeners = {}, intervals = [], docListeners = {};
const doc = { hidden: false, addEventListener: (n, f) => { (docListeners[n] ||= []).push(f); } };
const sandbox = { window: { AudioContext: FakeAC, addEventListener: (n, f) => { (listeners[n] ||= []).push(f); } }, document: doc, localStorage: { getItem: () => null, setItem() {} },
  setInterval: (f) => intervals.push(f), setTimeout: () => {}, Math, console, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, k) => a + (b - a) * k };
vm.createContext(sandbox);
for (const f of ['audio', 'music']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), sandbox);
const music = vm.runInContext('music', sandbox);
const run = (sec) => { for (let i = 0; i < sec / 0.025; i++) { now += 0.025; intervals.forEach(f => f()); } };

// ---- the score
const MISSION_IDS = ['intro', 'rush', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'salvage', 'pirates', 'rescue', 'ore', 'deep', 'nightmare', 'practice'];
const missionSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'mission.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'js', 'progress.js'), 'utf8');
const known = [...missionSrc.matchAll(/^ {2}([a-z][a-z0-9]*): \{\s*$/gm)].map(m => m[1]).filter(id => /name: '/.test(missionSrc.split(new RegExp(`^  ${id}: \\{`, 'm'))[1]?.slice(0, 200) || ''));
const covered = new Set(music.list().flatMap(s => s.missions));
check(MISSION_IDS.every(id => covered.has(id)), 'every mission id has its own entry in the mission → piece table');
check(known.every(id => covered.has(id) || !MISSION_IDS.includes(id)) && known.filter(id => !covered.has(id)).length === 0,
  `every mission in js/mission.js / js/progress.js has a piece (${known.filter(id => !covered.has(id)).join(', ') || 'all'})`);
check(new Set(music.list().map(s => s.title)).size === music.list().length && music.list().every(s => s.title && s.bpm && s.key), 'the player lists every piece with its title, tempo and key');
let clashes = [];
for (const p of music.pieces) for (const sec of ['A', 'B']) p[sec].theme.forEach((notes, bi) => {
  const c = p[sec].chords[bi];
  for (const n of notes) {
    if ((n.slot === 0 || n.slot === p.meter / 4) && !c.pcs.includes(n.midi % 12)) clashes.push(`${p.name} ${sec}${bi + 1} ${c.name}: ${n.midi}`);
    if (n.midi < 57 || n.midi > 86) clashes.push(`${p.name} ${sec}${bi + 1}: ${n.midi} out of the horn's range`);
  }
});
check(!clashes.length, `every theme note on a strong beat is a tone of its chord (${clashes.join('; ') || 'none off'})`);
check(music.pieces.every(p => p.ost.length === p.meter && p.ost.every(k => k >= -1 && k <= 4)), 'every ostinato is one bar long');
// Every piece has its own identity: its own opening, its own lead, its own drums; not one shared recipe.
const openings = music.pieces.map(p => music.layersAt(p.name, 0).join('+'));
check(new Set(openings).size === openings.length && openings.every(o => o), `every piece opens with its own instruments (${openings.join(' | ')})`);
const firstTwo = music.pieces.map(p => [0, 1].map(st => music.layersAt(p.name, st).join('+')).join(' / '));
check(new Set(firstTwo).size === firstTwo.length, 'and builds up its own way');
check(new Set(music.pieces.map(p => p.lead)).size >= 6, `at least 6 different lead sounds (${music.pieces.map(p => p.lead).join(', ')})`);
check(new Set(music.pieces.map(p => p.drums)).size >= 5, `at least 5 different drum styles (${music.pieces.map(p => p.drums).join(', ')})`);
check(music.pieces.some(p => p.meter === 12) && music.pieces.some(p => p.swing > 0), 'one piece in 6/8, one with a swing');
check(music.layersAt('held', 0).join('+') === 'bells+drone+pad' && music.pieces.find(p => p.name === 'held').lead === 'horn',
  'Held Together keeps the first score\'s sound (drone, dark pad and bells; the horn theme)');
check(music.pieces.filter(p => p.name !== 'held').every(p => p.lead !== 'horn' && !music.layersAt(p.name, 0).includes('drone')),
  'and the other pieces sound different from it (no drone opening, no horn lead)');
check(music.pieces.every(p => ['theme', 'strings', 'brass'].every(l => music.layersAt(p.name, 6).includes(l))), 'and every piece still reaches the same epic climax (theme, strings, brass)');

// ---- the engine
check(intervals.length === 0, 'no sequencer before the first click');
listeners.mousedown.forEach(f => f());                    // the first click starts the audio
check(intervals.length === 1, 'the sequencer starts on the first click');
const errors = [];
for (const id of MISSION_IDS) {
  music.setMission(id); check(music.title === music.songOf(id), `${id}: plays "${music.title}"`);
  for (const k of [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1]) {
    music.setIntensity(k); music.setThreat(k > 0.5); music.setJump(k === 1);
    try { run(6); } catch (e) { errors.push(`${id} @${k}: ${e.message}`); }
  }
  music.setJump(false); music.setThreat(false);
}
check(!errors.length, `every piece plays every stage, the spool included (${errors.join('; ') || 'no errors'})`);

// It builds up: more going on near the jump than at the start.
music.setMission('c8'); music.reset(); music.setIntensity(0); run(4);
let n0 = nodes; run(20); const calm = nodes - n0;
check(music.stage === 0, `at the start it's the quiet stage (${music.stage})`);
music.setIntensity(1); run(30); n0 = nodes; run(20); const climax = nodes - n0;
check(music.stage === 6 && climax > calm * 4, `the climax is far busier than the start (${calm} → ${climax} nodes in 20 s, stage ${music.stage})`);
check(climax / 20 < 400, `and still cheap: ${Math.round(climax / 20)} nodes a second at the climax`);

// Stages only move on bar lines, rising after a one-bar fill.
music.setMission('intro'); music.reset(); music.setIntensity(0); run(3);
const bar = 60 / 100 * 4, changes = [];
let st = music.stage; music.setIntensity(0.5);
for (let i = 0; i < 1200; i++) { now += 0.025; intervals[0](); if (music.stage !== st) { changes.push(music.step); st = music.stage; } }
check(changes.length > 0 && changes.every(s => s % 32 < 3), `rising stages land on even bars (steps ${changes.join(', ')})`);
check(music.stage === 4, `and stop at the target stage (${music.stage})`);
music.setThreat(true); run(bar * 4);
check(music.stage === 5, `a threat pushes it up one stage (${music.stage})`);
music.setThreat(false);

// A threat that flickers on and off doesn't flip the arrangement: it holds for a while after it's gone.
music.reset(); music.setIntensity(0.1); music.setThreat(false); run(bar * 3);
const calmStage = music.stage, seen = new Set();
for (let i = 0; i < 16; i++) { music.setThreat(i % 2 === 0); run(1.5); if (i > 4) seen.add(music.stage); }
check(calmStage === 1 && seen.size === 1 && seen.has(3), `a flickering threat holds one stage (${calmStage} → ${[...seen].join(', ')})`);
music.setThreat(false); run(25 + bar * 8);
check(music.stage === calmStage, `and it settles back once the threat is gone for good (${music.stage})`);

// The threat never brings the climax early; the jump spool always does.
music.setIntensity(0.65); music.setThreat(true); run(bar * 6);
check(music.stage === 5, `a threat late in the mission still keeps the climax for the end (${music.stage})`);
music.setJump(true); run(bar * 1.2);
check(music.stage === 7 && music.section === 'spool', `while the jump drive spools: the spool (${music.stage}, ${music.section})`);
run(60);
check(music.stage === 7, 'and it keeps building for as long as the drive needs');

// The jump: the final hit, then quiet until the next mission.
music.jumped(); run(0.1); n0 = nodes; run(10);
check(music.ended && nodes === n0, 'after the final hit it stays quiet (nothing new scheduled)');
music.jumped(); music.setMission('c2'); run(2);
check(nodes === n0, 'the end screen stays quiet, even when the next mission is picked');
music.setJump(false); music.rearm(); n0 = nodes; run(5);
check(!music.ended && nodes > n0, 'rearm() (a new mission) brings the music back');
const s1 = music.step; music.rearm(); run(0.5);
check(music.step > s1, 'rearm() while playing changes nothing (the game calls it every frame)');

// Switching: one sequencer, the new piece starts on its first step.
music.setMission('c1'); run(3);
const before = music.step; music.setMission('c7');
check(music.step === 0 && before > 0 && music.title === music.songOf('c7'), `a new piece starts from its first step (was at ${before})`);
music.setMission('deep'); check(music.step === 0, 'missions sharing a piece keep it playing');
for (let i = 0; i < 20; i++) { music.setMission(MISSION_IDS[i % MISSION_IDS.length]); run(0.05); }
check(intervals.length === 1, 'still exactly one sequencer after many switches');

// Pausing: the player's pause button and hidden tabs.
music.setPaused(true); run(0.5); n0 = nodes; run(5);
check(nodes === n0, 'paused: nothing is scheduled');
music.setPaused(false); run(1); check(nodes > n0, 'unpaused: it plays again');
doc.hidden = true; docListeners.visibilitychange.forEach(f => f()); run(0.5); n0 = nodes; run(5);
check(nodes === n0, 'a hidden tab is silent (two open tabs never play over each other)');
doc.hidden = false; docListeners.visibilitychange.forEach(f => f()); run(1);
check(nodes > n0, 'and plays again when shown');

process.exit(failed ? 1 : 0);
