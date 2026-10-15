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
const SCRIPTS = ['audio', 'music', ...fs.readdirSync(path.join(__dirname, '..', 'js', 'music')).filter(f => f.endsWith('.js')).sort().map(f => 'music/' + f.slice(0, -3))];   // (the engine, then every piece)
for (const f of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), sandbox);
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
music.jumped(); const E = music.ending;
check(!!E && !music.ended, 'jumped() plans the ending on the grid instead of cutting the music');
run(E.T - now + 0.3); n0 = nodes; run(10);
check(music.ended && nodes === n0, 'after the final hit it stays quiet (nothing new scheduled)');
music.jumped(); music.setMission('c2'); run(2);
check(nodes === n0, 'the end screen stays quiet, even when the next mission is picked');
music.setJump(false); music.rearm(); n0 = nodes; run(5);
check(!music.ended && nodes > n0, 'rearm() (a new mission) brings the music back');
const s1 = music.step; music.rearm(); run(0.5);
check(music.step > s1, 'rearm() while playing changes nothing (the game calls it every frame)');

// Real dynamics, not a ramp: over a 5-minute mission every piece (but Held Together, the first score's smooth
// build) drops into its theme and into its climax at phrase starts, each after a build bar ending in a beat of
// silence, and breaks down once in between (stripped to a few layers, then rebuilt into a bigger drop).
const arcs = [];
for (const p of music.pieces) {
  music.setSong(p.name); music.setJump(false); music.setThreat(false); music.setIntensity(0); music.reset();
  const bars = []; let lastB = -1, n0 = nodes;
  for (let x = 0; x < 300; x += 0.25) {
    music.setIntensity(Math.pow(x / 300, 1.3)); run(0.25); const B = music.bar;
    if (B && B.b !== lastB) { if (bars.length) bars[bars.length - 1].nodes = nodes - n0; n0 = nodes; bars.push(B); lastB = B.b; }
  }
  const log = music.arc, drops = log.filter(e => e.kind === 'drop'), bd = log.find(e => e.kind === 'breakdown');
  const climax = bars.find(B => B.st === 6), avg = (a) => a.reduce((x, B) => x + B.nodes, 0) / (a.length || 1);
  const maxBefore = bd ? Math.round(avg(bars.filter(B => B.b >= bd.bar - 8 && B.b < bd.bar))) : 0;      // sounds a bar in the phrase before
  const bdLayers = bd ? Math.round(avg(bars.filter(B => B.b >= bd.bar && B.b < bd.bar + 4))) : 0;      // and in the stripped half
  arcs.push({ p: p.name, classic: !!p.classic, drops, bd, climax, bdLayers, maxBefore,
    ok: p.classic ? !log.length : drops.length >= 2 && drops.every(e => e.bar % 8 === 0 && log.some(x => x.kind === 'build' && x.bar === e.bar - 1))
      && !!bd && bd.bar % 8 === 0 && !!climax && bd.bar < climax.b && bdLayers <= maxBefore * 0.6 && drops.some(e => e.bar > bd.bar) });
}
const arcBad = arcs.filter(a => !a.ok);
check(!arcBad.length, `every piece breathes: a drop into the theme, a breakdown, a bigger drop into the climax, all on phrase starts (${arcs.filter(a => !a.classic).map(a => `${a.p}: drops at bars ${a.drops.map(e => e.bar + '→' + e.stage).join(', ')}, breakdown at ${a.bd?.bar} (${a.bdLayers} sounds a bar, down from ${a.maxBefore}), climax from ${a.climax?.b}`).join('; ')}${arcBad.length ? ' — FAILING: ' + arcBad.map(a => a.p).join(', ') : ''})`);
check(arcs.find(a => a.p === 'held').ok, 'Held Together keeps its smooth build (no drops or breakdowns)');

// The player can seek: the plan of a mission marks the drops, the breakdown and the climax, and seeking lands on a
// bar line in exactly the state the arrangement would have there (the breakdown plays as a breakdown).
const seeks = [];
for (const p of music.pieces.filter(p => !p.classic)) {
  music.setSong(p.name); music.setJump(false); music.setThreat(false); music.reset();
  const P = music.plan(300), bd = P.bars.find(B => B.breakdown), dr = P.bars.filter(B => B.drop), cl = P.bars.find(B => B.stage === 6);
  const at = music.seek(bd.t + 0.3, 300);                  // (a little after the bar line: lands on the next one)
  music.setIntensity(Math.pow(at / 300, 1.3)); run(P.barDur * 0.5);
  const B = music.bar, nb = P.bars.find(x => x.t === at);
  seeks.push({ p: p.name, ok: !!bd && dr.length >= 2 && !!cl && Math.abs(at - (bd.b + 1) * P.barDur) < 1e-6 && B.b === nb.b && B.bk === 1 && B.st === nb.stage, info: `${p.name}: breakdown at bar ${bd.b}, drops ${dr.map(x => x.b).join('/')}, climax ${cl?.b}; seek → bar ${B.b} (breakdown bar ${B.bk + 1}, stage ${B.st})` });
}
check(seeks.every(x => x.ok), `seeking: the plan marks drops, breakdown and climax; a seek lands on the next bar line inside the breakdown (${seeks.map(x => x.info).join('; ')})`);

// Cargo Run's walking bass (js/music/cargo.js logs every note it plays into walkLog): through a whole mission and
// after seeks, the downbeat and the slapped octave are tones of the chord in force, every other note is in the key or
// the boogie's sixth; the line plans the chord that actually comes next, plays the same riff in every bar (a line
// changing from bar to bar sounded like wrong notes), and never leaps more than an octave from one 8th to the next.
{
  const p = music.pieces.find(x => x.name === 'cargo'), PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const chord = (n) => { const m = /^([A-G])([#b]?)(m?)$/.exec(n), r = (PCN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12; return [r, (r + (m[3] ? 3 : 4)) % 12, (r + 7) % 12]; };
  const inKey = (pc) => [0, 2, 3, 5, 7, 8, 10, 11].includes((pc - p.tonic + 24) % 12);
  const runs = [];
  const take = (f) => { p.walkLog = []; f(); runs.push(p.walkLog); p.walkLog = null; };
  music.setSong('cargo'); music.setJump(false); music.setThreat(false);
  take(() => { music.setIntensity(0); music.reset(); for (let x = 0; x < 300; x += 0.25) { music.setIntensity(Math.pow(x / 300, 1.3)); run(0.25); } });
  const P = music.plan(300);
  for (const at0 of [20.3, P.bars.find(B => B.breakdown).t - 4.7, P.bars.find(B => B.drop).t - 6.1]) take(() => {
    const at = music.seek(at0, 300); for (let x = 0; x < 40; x += 0.25) { music.setIntensity(Math.pow((at + x) / 300, 1.3)); run(0.25); }
  });
  const bad = [], seen = { notes: 0, changes: 0, riffs: {} };
  for (const log of runs) {
    const ns = log.filter(e => e.kind !== 'ghost');
    log.forEach((e, i) => {
      const pcs = chord(e.c), pc = ((e.m % 12) + 12) % 12, where = `bar ${e.b} step ${e.s} on ${e.c}: ${e.kind} ${e.m}`;
      seen.notes++;
      if (log.some(o => o.b === e.b && o.c !== e.c)) bad.push(`${where} (two chords in one bar)`);
      if ((e.s === 0 || e.kind === 'pop' || e.kind === 'pull' || e.kind === 'rev') && !pcs.includes(pc)) bad.push(`${where} is not a chord tone on a strong note`);
      else if (!pcs.includes(pc) && !inKey(pc) && pc !== (pcs[0] + 9) % 12) bad.push(`${where} is out of the key`);
      const next = log.find(o => o.b === e.b + 1 && o.kind !== 'ghost');
      if (e.to && next && next.c !== e.to) bad.push(`${where} walks towards ${e.to}, but ${next.c} comes`);
      if (e.s === 14 && e.kind !== 'ghost' && next && next.c !== e.c) seen.changes++;
      const riff = log.filter(o => o.b === e.b && o.kind !== 'ghost').map(o => o.s + ':' + (o.m - log.find(q => q.b === e.b && q.s === 0)?.m)).join(' ');
      if (e.s === 0 && e.kind === 'note' && log.filter(o => o.b === e.b).length >= 9) (seen.riffs[riff] = (seen.riffs[riff] || 0) + 1);
      const j = ns.indexOf(e), prev = j > 0 ? ns[j - 1] : null;
      if (prev && e.kind !== 'ghost' && (prev.b * 16 + prev.s) >= e.b * 16 + e.s - 4 && Math.abs(e.m - prev.m) > 12) bad.push(`${where}: leaps ${Math.abs(e.m - prev.m)} semitones from ${prev.m}`);
    });
  }
  const riffs = Object.keys(seen.riffs).length;   // (one riff: over minor chords, over major ones, and on C its 5-6 rock)
  check(!bad.length && seen.changes > 10 && riffs <= 3, `Cargo Run's walking bass fits its chords, walks into the chord that comes and plays one riff (${seen.notes} notes, ${seen.changes} chord changes over ${runs.length} runs, ${riffs} riff shapes: ${Object.keys(seen.riffs).join(' | ')}; ${bad.length ? bad.length + ' wrong, e.g. ' + [...new Set(bad)].slice(0, 6).join('; ') : 'all fine'})`);
}

// The ending lands in time and in phrase: whenever the ship jumps (any piece, during the spool or straight
// from the music without one), the final hit is on a bar line of the piece's grid, after a cadence on its bVII
// (or V), and never long after the jump.
const ends = [];
for (const p of music.pieces) for (const [spoolFor, k] of [[7.3, 1], [9.9, 1], [0, 0.5], [3.37, 1], [12.61, 1]]) {
  music.setSong(p.name); music.setJump(false); music.reset(); music.setThreat(false); music.setIntensity(k); run(20 + spoolFor % 3);
  if (spoolFor) { music.setJump(true); run(spoolFor); }
  music.jumped(); const e = music.ending; music.setJump(false);
  const bars = (e.T - e.startT) / e.barDur, wait = (e.T - e.jumpedAt) / e.barDur, lead = (e.T - e.from) / e.barDur;
  const cad = p.spool[p.spool.length - 1].name, okCad = e.cadence === cad || /^[A-G][#b]?$/.test(e.cadence);   // (bVII, or the V it was already on)
  ends.push({ p: p.name, ok: Math.abs(bars - Math.round(bars)) < 1e-6 && wait >= 0 && wait * e.barDur <= 1.5 * e.barDur + 0.25 && lead >= 0.5 - 1e-6 && okCad, bars, wait, lead, cad: e.cadence });
  run(wait * e.barDur + 0.5);
  if (!music.ended) ends[ends.length - 1].ok = false;
  music.rearm();
}
const bad = ends.filter(e => !e.ok);
check(!bad.length, `the final hit lands on a bar line after at least half a bar of cadence, at most 1.5 bars (plus the scheduler's lookahead) after the jump (${ends.length} endings; ${bad.map(e => `${e.p}: bar ${e.bars.toFixed(3)}, wait ${e.wait.toFixed(2)}, cadence ${e.cad} for ${e.lead.toFixed(2)} bars`).join('; ') || 'all fine'})`);
check(ends.every(e => /^[A-G][#b]?$/.test(e.cad)), `the cadence chord is a major chord (bVII or V) resolving to the home chord in major (${[...new Set(ends.map(e => e.p + ' ' + e.cad))].join(', ')})`);

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

// ---- clicks: every sound starts and stops at (near) zero gain, and no envelope jumps.
// A second fake WebAudio records each node's connections, each source's start/stop and each gain's automation,
// then replays the automation (setValue, linear/exponential ramps, setTarget, cancel) to check, for every
// oscillator / noise source: the gains it plays through are ~0 when it starts and when it stops, and no
// setValueAtTime lands away from the value the gain had just before it (a step = a click).
{
  let t2 = 0;
  const all = [];
  const mkParam = (owner, name, init) => {
    const P = { isParam: true, owner, name, init, value: init, ev: [] };
    const add = (e) => P.ev.push(e);
    P.setValueAtTime = (v, t) => add({ k: 'set', v, t });
    P.linearRampToValueAtTime = (v, t) => add({ k: 'lin', v, t });
    P.exponentialRampToValueAtTime = (v, t) => add({ k: 'exp', v, t });
    P.setTargetAtTime = (v, t, tc) => add({ k: 'tgt', v, t, tc });
    P.cancelScheduledValues = (t) => { P.ev = P.ev.filter(e => e.t < t); };
    return new Proxy(P, { set: (o, k, v) => { o[k] = v; if (k === 'value' && !o.ev.length) o.init = v; return true; } });
  };
  const mk = (kind) => {
    const n = { kind, out: [], start: null, stop: null };
    n.connect = (d) => { n.out.push(d); return d; }; n.disconnect = () => {};
    n.start = (t) => { n.start = t; }; n.stop = (t) => { n.stop = t; };
    for (const p of ['gain', 'frequency', 'detune', 'Q', 'pan', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release']) n[p] = mkParam(n, p, p === 'gain' ? 1 : 0);
    all.push(n); return n;
  };
  class RecAC { constructor() { this.sampleRate = 8000; this.destination = mk('dest'); this.state = 'running'; } get currentTime() { return t2; } resume() {}
    createGain() { return mk('gain'); } createOscillator() { return mk('osc'); } createBiquadFilter() { return mk('filt'); } createBufferSource() { return mk('src'); }
    createConvolver() { return mk('conv'); } createDelay() { return mk('delay'); } createDynamicsCompressor() { return mk('comp'); } createStereoPanner() { return mk('pan'); }
    createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; } }
  const L2 = {}, iv2 = [];
  const sb2 = { window: { AudioContext: RecAC, addEventListener: (n, f) => { (L2[n] ||= []).push(f); } }, localStorage: { getItem: () => null, setItem() {} },
    setInterval: (f) => iv2.push(f), setTimeout: () => {}, Math, console };
  vm.createContext(sb2);
  for (const f of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), sb2);
  const m2 = vm.runInContext('music', sb2);
  L2.mousedown.forEach(f => f());
  const run2 = (sec) => { for (let i = 0; i < sec / 0.025; i++) { t2 += 0.025; iv2[0](); } };
  for (const p of music.pieces) {
    m2.setSong(p.name); m2.reset();
    for (const k of [0, 0.2, 0.33, 0.5, 0.68, 0.9]) { m2.setIntensity(k); run2(12); }
    m2.setThreat(true); run2(6); m2.setThreat(false); m2.setJump(true); run2(9); m2.jumped(); run2(8); m2.setJump(false); m2.rearm();
  }
  // replay a gain's automation at time x
  const valueAt = (P, x) => {
    const ev = P.ev.map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
    let v = P.init, t0 = 0, tgt = null;
    const cur = (t) => (tgt ? tgt.v + (tgt.v0 - tgt.v) * Math.exp(-(t - tgt.t) / tgt.tc) : v);
    for (const e of ev) {
      if (e.k === 'lin' || e.k === 'exp') {
        const vs = cur(t0);
        if (e.t > x) { const k = (x - t0) / (e.t - t0 || 1); return e.k === 'lin' || vs <= 0 || e.v <= 0 ? vs + (e.v - vs) * k : vs * Math.pow(e.v / vs, k); }
        v = e.v; tgt = null; t0 = e.t; continue;
      }
      if (e.t > x) break;
      if (e.k === 'set') { v = e.v; tgt = null; }
      else { tgt = { v: e.v, v0: cur(e.t), t: e.t, tc: e.tc }; }
      t0 = e.t;
    }
    return cur(x);
  };
  const peakOf = (P) => Math.max(Math.abs(P.init), ...P.ev.map(e => Math.abs(e.v)));
  const gainsOf = (n, depth = 0, acc = []) => {                     // the enveloped gains a source plays through (to an audible output)
    for (const d of n.out) {
      if (d.isParam) return null;                                    // a modulator (LFO, FM): not heard directly
      if (d.kind === 'gain' && (d.gain.ev.length || d.gain.init === 0)) acc.push(d.gain);   // (a gain set to 0: silenced)
      if (depth < 3) { const r = gainsOf(d, depth + 1, acc); if (r === null) return null; }
    }
    return acc;
  };
  const clicks = [];
  for (const n of all) {
    if ((n.kind !== 'osc' && n.kind !== 'src') || typeof n.start !== 'number') continue;
    const gs = gainsOf(n); if (gs === null) continue;
    if (!gs.length) { clicks.push(`${n.kind} without an envelope`); continue; }
    const level = (x) => gs.reduce((a, P) => a * Math.abs(valueAt(P, x)) / (peakOf(P) || 1), 1);
    if (level(n.start) > 0.01) clicks.push(`${n.kind}${n.out[0] ? '→' + n.out[0].kind + '(' + (n.out[0].type || '') + ',' + Math.round(n.out[0].frequency?.init || 0) + ')' : ''} starts at ${(level(n.start) * 100).toFixed(1)}% (t=${n.start.toFixed(2)})`);
    if (typeof n.stop === 'number' && level(n.stop) > 0.01) clicks.push(`${n.kind} stops at ${(level(n.stop) * 100).toFixed(1)}% (t=${n.stop.toFixed(2)})`);
  }
  for (const n of all) if (n.kind === 'gain' && n.gain.ev.length) {
    const P = n.gain, pk = peakOf(P) || 1;
    const sorted = P.ev.map((e, i) => ({ ...e, i })).sort((a, b) => a.t - b.t || a.i - b.i);
    sorted.forEach((e, i) => { if ((e.k === 'lin' || e.k === 'exp') && sorted[i - 1]?.k === 'tgt') clicks.push(`a ramp right after a setTarget (browsers start it from the wrong value) at t=${e.t.toFixed(2)}`); });
    P.ev.forEach((e, i) => {
      if (e.k !== 'set') return;
      const before = P.ev.filter((x, j) => j !== i && (x.t < e.t || (x.t === e.t && j < i)));
      if (!before.length) return;                                  // (the first value, before any sound)
      const jump = Math.abs(valueAt({ ...P, ev: before }, e.t) - e.v) / pk;
      if (jump > 0.05) clicks.push(`a gain (${P.owner.out[0]?.kind}, peak ${pk.toFixed(3)}, ${P.ev.length} events) jumps by ${(jump * 100).toFixed(0)}% at t=${e.t.toFixed(2)}`);
    });
  }
  const kinds = {}; for (const c of clicks) { const k = c.replace(/[\d.]+%|\(t=[\d.]+\)|t=[\d.]+/g, '').trim(); kinds[k] = (kinds[k] || 0) + 1; }
  check(!clicks.length, `no clicks: ${all.filter(n => n.kind === 'osc' || n.kind === 'src').length} sounds in all pieces start and stop at zero, no envelope jumps (${clicks.length ? Object.entries(kinds).map(([k, v]) => `${v}× ${k}`).join('; ') + '; e.g. ' + clicks.slice(0, 3).join(', ') : 'none'})`);
}

process.exit(failed ? 1 : 0);
