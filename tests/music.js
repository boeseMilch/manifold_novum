// The music engine against a fake WebAudio: every mission's piece schedules at every intensity
// (calm → crescendo → jump riser) without errors. Run: node tests/music.js
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
  createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
}
const listeners = {}, intervals = [];
const sandbox = { window: { AudioContext: FakeAC, addEventListener: (n, f) => { (listeners[n] ||= []).push(f); } }, localStorage: { getItem: () => null, setItem() {} },
  setInterval: (f) => intervals.push(f), setTimeout: () => {}, Math, console, clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, k) => a + (b - a) * k };
vm.createContext(sandbox);
for (const f of ['audio', 'music']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), sandbox);
const music = vm.runInContext('music', sandbox);
listeners.mousedown.forEach(f => f());                    // the first click starts the audio
check(intervals.length === 1, 'the sequencer starts on the first click');
const titles = new Set(), errors = [];
for (const id of ['intro', 'rush', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'practice']) {
  music.setMission(id); titles.add(music.title);
  for (const k of [0, 0.3, 0.6, 0.9, 1]) {
    music.setIntensity(k); music.setJump(k === 1); music.setThreat(k > 0.5);
    try { for (let i = 0; i < 400; i++) { now += 0.025; intervals[0](); } } catch (e) { errors.push(`${id} @ ${k}: ${e.message}`); }
  }
}
check(!errors.length, `every piece plays from calm to crescendo to the jump riser${errors.length ? ': ' + errors.join('; ') : ''}`);
check(titles.size === 11, `each campaign chapter, rush hour, the intro and practice have their own piece (${titles.size} titles)`);
const n0 = nodes; music.setMission('c8'); music.setIntensity(0); music.setJump(false); music.setThreat(false);
for (let i = 0; i < 800; i++) { now += 0.025; intervals[0](); }
const calm = nodes - n0, n1 = nodes; music.setIntensity(1); music.setThreat(true);
for (let i = 0; i < 800; i++) { now += 0.025; intervals[0](); }
check(nodes - n1 > calm * 2, `the crescendo is much busier than the calm start (${calm} → ${nodes - n1} sound nodes in 20 s)`);
music.jumped(); const n2 = nodes; for (let i = 0; i < 100; i++) { now += 0.025; intervals[0](); }
const hit = nodes - n2, n3 = nodes; for (let i = 0; i < 400; i++) { now += 0.025; intervals[0](); }
check(hit > 0 && nodes === n3, `jumping out plays the final hit on the next downbeat, then it's quiet (${hit} nodes, then ${nodes - n3})`);
check(music.list().length === 11 && music.list().every(s => s.title && s.bpm), 'the player lists every piece');
process.exitCode = failed ? 1 : 0;
