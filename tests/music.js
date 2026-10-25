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
const MISSION_IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'practice', 'custom'];
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
music.setMission('practice'); music.reset(); music.setIntensity(0); run(3);
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

// Cargo Run's riff (js/music/cargo.js logs every note it plays into walkLog): through a whole mission and after
// seeks, its written line stays strictly in its natural minor (the leading tone only over the major V chord), puts
// chord tones on beats 1 and 3, moves by steps and small leaps (at most a fifth from one 8th to the next) and steps
// across the bar lines (at most a fourth from a bar's last note into the next bar's first), so it sings as one melody.
{
  const p = music.pieces.find(x => x.name === 'cargo'), PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const chord = (n) => { const m = /^([A-G])([#b]?)(m?)$/.exec(n), r = (PCN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12; return [r, (r + (m[3] ? 3 : 4)) % 12, (r + 7) % 12]; };
  const deg = (pc) => (pc - p.tonic + 24) % 12, MINOR = [0, 2, 3, 5, 7, 8, 10];
  const runs = [];
  const take = (f) => { p.walkLog = []; f(); runs.push(p.walkLog); p.walkLog = null; };
  music.setSong('cargo'); music.setJump(false); music.setThreat(false);
  take(() => { music.setIntensity(0); music.reset(); for (let x = 0; x < 300; x += 0.25) { music.setIntensity(Math.pow(x / 300, 1.3)); run(0.25); } });
  const P = music.plan(300);
  for (const at0 of [20.3, P.bars.find(B => B.breakdown).t - 4.7, P.bars.find(B => B.drop).t - 6.1]) take(() => {
    const at = music.seek(at0, 300); for (let x = 0; x < 40; x += 0.25) { music.setIntensity(Math.pow((at + x) / 300, 1.3)); run(0.25); }
  });
  const bad = [], seen = { notes: 0, written: 0, barLines: 0 };
  for (const log of runs) log.forEach((e, i) => {
    const pcs = chord(e.c), pc = ((e.m % 12) + 12) % 12, where = `bar ${e.b} step ${e.s} on ${e.c}: ${e.kind} ${e.m}`;
    seen.notes++; if (e.sec) seen.written++;
    if (!MINOR.includes(deg(pc)) && !(deg(pc) === 11 && chord(e.c)[0] === (p.tonic + 7) % 12 && !/m$/.test(e.c))) bad.push(`${where} is out of the natural minor`);
    if ((e.s % 8 === 0 || e.kind !== 'note') && !pcs.includes(pc)) bad.push(`${where} is not a chord tone on a strong beat`);
    const prev = log[i - 1];
    if (prev && prev.b * 16 + prev.s >= e.b * 16 + e.s - 4) {
      const d = Math.abs(e.m - prev.m);
      if (d > 7) bad.push(`${where}: leaps ${d} semitones from ${prev.m}`);
      if (e.s === 0 && prev.sec && e.sec) { seen.barLines++; if (d > 5) bad.push(`${where}: jumps ${d} semitones across the bar line`); }
    }
  });
  check(!bad.length && seen.written > seen.notes * 0.8 && seen.barLines > 50, `Cargo Run's riff is one melody strictly in ${p.key} minor (${seen.notes} notes, ${seen.written} from the written line, ${seen.barLines} bar lines over ${runs.length} runs; ${bad.length ? bad.length + ' wrong, e.g. ' + [...new Set(bad)].slice(0, 6).join('; ') : 'all fine'})`);
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
  const onBar = Math.abs(bars - Math.round(bars)) < 1e-6, onHalf = Math.abs(bars * 2 - Math.round(bars * 2)) < 1e-6;
  ends.push({ p: p.name, ok: (onBar || (onHalf && Math.abs(lead - 0.5) < 1e-6)) && wait >= 0 && wait * e.barDur <= e.barDur + 0.2 && lead * e.meter >= 2 - 1e-6 && okCad, bars, wait, lead, cad: e.cadence });
  run(wait * e.barDur + 0.5);
  if (!music.ended) ends[ends.length - 1].ok = false;
  music.rearm();
}
const bad = ends.filter(e => !e.ok);
check(!bad.length, `the final hit lands on a bar line (or, jumping in a bar's last 16th, half a bar on), after at least an 8th of cadence, at most ONE bar (plus the scheduler's lookahead) after the jump (${ends.length} endings; ${bad.map(e => `${e.p}: bar ${e.bars.toFixed(3)}, wait ${e.wait.toFixed(2)}, cadence ${e.cad} for ${e.lead.toFixed(2)} bars`).join('; ') || 'all fine'})`);
check(ends.every(e => /^[A-G][#b]?$/.test(e.cad)), `the cadence chord is a major chord (bVII or V) resolving to the home chord in major (${[...new Set(ends.map(e => e.p + ' ' + e.cad))].join(', ')})`);

// The jump at every 16th of a spool bar (two bars, both spool chords): the final hit never comes later than one bar
// after jumped() (playtest: "the very last bit loops too often": no full extra cadence bar any more), on the grid.
{
  const late = [];
  for (const p of music.pieces) {
    const sd = 60 / p.bpm / 4;
    for (let j = 0; j < 2 * p.meter; j++) {
      music.setSong(p.name); music.setJump(false); music.reset(); music.setThreat(false); music.setIntensity(1); run(4);
      music.setJump(true); run(8 + j * sd); music.jumped(); const e = music.ending; music.setJump(false);
      const wait = e.T - e.jumpedAt, half = (e.T - e.startT) / (e.barDur / 2);
      late.push({ p: p.name, j, wait, bd: e.barDur, ok: wait <= e.barDur + 0.2 && Math.abs(half - Math.round(half)) < 1e-6 });
      run(wait + 0.4); if (!music.ended) late[late.length - 1].ok = false;
      music.rearm();
    }
  }
  const worst = music.pieces.map(p => { const w = late.filter(x => x.p === p.name); return `${p.name} ≤ ${Math.max(...w.map(x => x.wait / x.bd)).toFixed(2)} bars`; });
  check(late.every(x => x.ok), `jumping at any 16th of the spool: the final hit within one bar, on the grid (${late.length} jumps; ${worst.join(', ')}${late.some(x => !x.ok) ? '; FAILING ' + late.filter(x => !x.ok).map(x => x.p + '@' + x.j).join(' ') : ''})`);
}

// The spool's waves are 2 bars (crash and riser; rolls growing over 2 bars), in every piece, its own hooks included.
// And over it the Shepard line: through 30 s of spool its pitch classes keep rising (1-4 semitones a note, mostly
// scale steps), never settling into a 2-4 note loop; chord tones (or the consonant 6th) on 1 and 3.
{
  const waves = [], lines = [];
  for (const p of music.pieces) {
    const w = [], cbs = new Set(), line = [], H = p.hooks, keep = { spoolWave: H.spoolWave, spoolPerc: H.spoolPerc, shepard: H.shepard };
    H.spoolWave = (x) => { w.push(x.b); return keep.spoolWave?.(x); };
    H.spoolPerc = (x) => { cbs.add(x.cb); return keep.spoolPerc?.(x); };
    H.shepard = (x) => { for (const n of x.line) line.push({ ...n, c: x.c }); return keep.shepard?.(x); };
    music.setSong(p.name); music.setJump(false); music.reset(); music.setThreat(false); music.setIntensity(1); run(4);
    music.setJump(true); run(32); music.setJump(false); music.reset();
    Object.assign(H, keep); for (const k of Object.keys(keep)) if (!keep[k]) delete H[k];
    const gaps = w.slice(1).map((b, i) => b - w[i]);
    waves.push({ p: p.name, ok: w.length >= 4 && gaps.every(g => g === 2) && [...cbs].sort().join() === '0,1', gaps, n: w.length });
    const tl = line.filter(n => n.t <= line[0].t + 30), pcs = tl.map(n => n.pc), steps = pcs.slice(1).map((pc, i) => (pc - pcs[i] + 12) % 12);
    let loop = 0;                                              // the longest stretch that repeats a 2-4 note figure
    for (let P = 2; P <= 4; P++) { let run = 0; for (let i = P; i < pcs.length; i++) { run = pcs[i] === pcs[i - P] ? run + 1 : 0; loop = Math.max(loop, run); } }
    const strongOff = tl.filter(n => n.strong && !n.c.pcs.includes(n.pc) && (n.pc - n.c.root + 12) % 12 !== 9).length;
    const climb = steps.reduce((a, d) => a + d, 0) / 12;
    lines.push({ p: p.name, ok: tl.length >= 30 && steps.every(d => d >= 1 && d <= 4) && steps.filter(d => d <= 2).length >= steps.length * 0.7 && loop < 3 && !strongOff,
      info: `${p.name}: ${tl.length} notes, climbs ${climb.toFixed(1)} octaves, steps ${[...new Set(steps)].sort().join('/')}, longest repeat ${loop}${strongOff ? ', ' + strongOff + ' clashing strong notes' : ''}` });
  }
  check(waves.every(x => x.ok), `the spool moves in 2-bar waves, never the old 4 (${waves.map(x => `${x.p} ${x.n} waves${x.ok ? '' : ' gaps ' + x.gaps.join('/')}`).join(', ')})`);
  check(lines.every(x => x.ok), `the spool's Shepard line keeps rising and never loops a short figure (${lines.map(x => x.info).join('; ')})`);
}

// The Shepard voices: six partials an octave apart, weighted by the fixed raised-cosine bell over log-frequency
// (C2..C8, centre C5): for every pitch class the weights follow the bell and add up to exactly 1, so the line keeps
// its loudness and brightness while it climbs.
{
  const K = music.kit, S = K.SHEP, bad = [];
  for (let pc = 0; pc < 12; pc++) {
    const P = K.shepPartials(pc), sum = P.reduce((a, q) => a + q.g, 0), cent = P.reduce((a, q) => a + q.g * q.m, 0) / sum;
    if (P.length !== 6 || P.some((q, i) => i && q.m - P[i - 1].m !== 12)) bad.push(pc + ': not 6 octave-spaced partials');
    P.forEach(q => { const x = (q.m - S.bottom) / (12 * S.octaves), want = (1 - Math.cos(2 * Math.PI * x)) / S.octaves; if (Math.abs(q.g - want) > 1e-9 || q.g < 0) bad.push(`${pc}: partial ${q.m} at ${q.g}`); });
    if (Math.abs(sum - 1) > 1e-9) bad.push(`${pc}: sum ${sum}`);
    if (Math.abs(cent - S.centre) > 6) bad.push(`${pc}: weighted centre ${cent.toFixed(1)}`);
  }
  check(!bad.length && S.centre === 72 && S.octaves === 6, `the Shepard partials follow the bell (6 octaves, centre midi ${S.centre} = 523 Hz), their weights add up to 1 for every pitch class (${bad.slice(0, 4).join('; ') || 'all 12'})`);
}

// Switching: one sequencer, the new piece starts on its first step.
music.setMission('practice'); run(3);
const before = music.step; music.setMission('c7');
check(music.step === 0 && before > 0 && music.title === music.songOf('c7'), `a new piece starts from its first step (was at ${before})`);
music.setMission('c7'); check(music.step === 0, 'the same piece again keeps it playing');
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

// Pieces can take over every engine gesture: hooks of the gesture's name run first (true / 'handled' replaces the
// engine's version), the fill hook can skip a stage-change fill outright ('skip' at x.r === -1, with x.from / x.to),
// and engineDrums: false / noEngine switch the engine's own percussion off. (A throwaway test piece.)
{
  const recipe = (name, extra) => Object.assign({ name, title: name, bpm: 120, key: 'A', missions: [], lead: 'saw', drums: 'taiko',
    parts: { pad: 0, ost: 1, drums: 2, bass: 3, hats: 3, snare: 4, theme: 4, brass: 5, stabs: 6, strings: 6 },
    A: { chords: 'Am Am F F C C G G', theme: Array(8).fill('A4 _ _ _ C5 _ _ _') },
    B: { chords: 'F F C C G G E E', theme: Array(8).fill('A4 _ _ _ C5 _ _ _') },
    spool: 'F G', end: 'A', ost: '0 0 2 0 1 0 2 0 0 0 2 0 3 1 2 1' }, extra);
  const mission = (name) => {                                   // a quick mission: ramp, spool, jump
    music.setSong(name); music.setJump(false); music.setThreat(false); music.reset();
    const n0 = nodes;
    for (let x = 0; x < 200; x += 0.5) { music.setIntensity(Math.pow(x / 200, 1.3)); run(0.5); }
    music.setJump(true); run(10); music.jumped(); music.setJump(false); run(6);
    return nodes - n0;
  };
  const seen = {}, fills = [];
  const count = (n) => (x) => { (seen[n] ||= []).push(x); };
  music.define(recipe('hooktest', { hooks: { build: count('build'), buildSweep: count('buildSweep'), dropHit: count('dropHit'), accent: count('accent'),
    spoolWave: count('spoolWave'), spoolPerc: count('spoolPerc'), endFill: count('endFill'), finalHit: count('finalHit'), cadence: count('cadence'),
    pad: count('pad'), endingPlanned: count('endingPlanned'), fill: (x) => { fills.push([x.r, x.from, x.to]); } } }));
  const loud = mission('hooktest');
  const names = ['fill', 'build', 'buildSweep', 'dropHit', 'accent', 'spoolWave', 'spoolPerc', 'endFill', 'finalHit', 'cadence', 'pad', 'endingPlanned'];
  seen.fill = fills;
  check(names.every(n => (seen[n] || []).length), `every gesture hook is called (${names.map(n => n + ' ' + (seen[n] || []).length).join(', ')})`);
  check(fills.some(f => f[0] === -1) && fills.every(f => f[2] > f[1]) && fills.some(f => f[0] >= 0),
    `the fill hook learns the transition: once at the bar start (r = -1), then per step, from → to (${[...new Set(fills.filter(f => f[0] === -1).map(f => f[1] + '→' + f[2]))].join(', ')})`);
  const fillSteps = [];
  music.define(recipe('hooktest3', { hooks: { fill: (x) => { if (x.r === -1) { fillSteps.push(['plan', x.to]); return 'skip'; } fillSteps.push(['step', x.to]); } } }));
  mission('hooktest3');
  check(fillSteps.some(f => f[0] === 'plan') && !fillSteps.some(f => f[0] === 'step'), `'skip' plays that bar as a normal bar: no fill steps follow (${fillSteps.length} fills planned, all skipped)`);
  music.define(recipe('hooktest4', { engineDrums: false, noEngine: ['riser', 'stabs'] }));
  const quiet = mission('hooktest4');
  check(quiet < loud * 0.8, `engineDrums: false switches the engine's percussion off (${loud} → ${quiet} sounds over the mission)`);
  for (const n of ['hooktest', 'hooktest3', 'hooktest4']) music.pieces.splice(music.pieces.findIndex(p => p.name === n), 1);
  music.setSong('held');
}

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
  let curPiece = '';
  const mk = (kind) => {
    const n = { kind, out: [], start: null, stop: null };
    n.connect = (d) => { n.out.push(d); return d; }; n.disconnect = () => {};
    n.start = (t) => { n.start = t; }; n.stop = (t) => { n.stop = t; };
    for (const p of ['gain', 'frequency', 'detune', 'Q', 'pan', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release']) n[p] = mkParam(n, p, p === 'gain' ? 1 : 0);
    n.piece = curPiece; all.push(n); return n;
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
    curPiece = p.name; m2.setSong(p.name); m2.reset();
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
  const peakOf = (P) => Math.max(1, Math.abs(P.init), ...P.ev.map(e => Math.abs(e.v)));   // (levels relative to full scale or the envelope's peak, whichever is bigger)
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
  // A new GainNode plays at 1 until its first scheduled event: every enveloped gain a sound plays through must be
  // created at 0 (K.gain(), or K.env, which zeroes it first), or a real-time click slips through before the envelope.
  const unzeroed = {};
  for (const n of all) {
    if ((n.kind !== 'osc' && n.kind !== 'src') || typeof n.start !== 'number') continue;
    const gs = gainsOf(n); if (!gs) continue;
    for (const P of gs) {                                          // (envelopes starting from silence: the first event sets ~0, at or after the start)
      const first = P.ev.map((e, idx) => ({ ...e, idx })).sort((a, b) => a.t - b.t || a.idx - b.idx)[0];
      if (first && (first.k === 'set' || first.k === 'lin') && Math.abs(first.v) <= 1e-3 && first.t >= n.start - 1e-9 && P.init !== 0) { unzeroed[n.piece] = (unzeroed[n.piece] || 0) + 1; break; }
    }
  }
  check(!Object.keys(unzeroed).length, `every enveloped gain starts at 0 before its envelope (no real-time click before the first event)${Object.keys(unzeroed).length ? ': not yet in ' + Object.entries(unzeroed).map(([k, v]) => `${k} (${v} sounds)`).join(', ') : ''}`);
  check(!clicks.length, `no clicks: ${all.filter(n => n.kind === 'osc' || n.kind === 'src').length} sounds in all pieces start and stop at zero, no envelope jumps (${clicks.length ? Object.entries(kinds).map(([k, v]) => `${v}× ${k}`).join('; ') + '; e.g. ' + clicks.slice(0, 3).join(', ') : 'none'})`);
}

// ---- Last Jump Home's opening (the clock and the music box, stages 0-1) stays exactly as it is.
// Every WebAudio call (node creation, connections, types, values, automation, start/stop) of the engine with
// js/music/home.js is recorded through a scripted 5-minute mission (seeded randomness) and the calls made in
// stages 0-1 are hashed. Changing that opening on purpose (in home.js or in the engine) means updating OPENING.
{
  const OPENING = 'f4941a7d13c0dadc';   // (re-pinned 2026-10-17: the tom fill into stage 1 is gone, the user: off topic for the dubstep piece; clock and music box call-for-call as before; initial-zero gains are not counted)
  const crypto = require('crypto');
  let t3 = 0, mus = null; const log = [];
  const r6 = (v) => (typeof v === 'number' ? +v.toFixed(6) : v);
  const push = (s) => { if (mus && mus.stage < 2) log.push(s); };
  const rec = (kind) => {
    push('new ' + kind);
    return new Proxy({ kind }, { get: (o, k) => {
      if (k in o) return o[k];
      if (k === 'connect') return (d) => { push(`${kind}->${d && d.kind ? d.kind : 'param'}`); return d; };
      if (k === 'disconnect') return () => {};
      if (k === 'setPeriodicWave') return () => push(kind + '.periodicWave');
      if (k === 'start' || k === 'stop') return (...a) => push(`${kind}.${k}(${a.map(r6)})`);
      return (o[k] = new Proxy({ value: 0 }, { get: (p, m) => (m in p ? p[m] : (...a) => push(`${kind}.${String(k)}.${String(m)}(${a.map(r6)})`)),
        set: (p, m, v) => { if (m === 'value' && !(kind === 'gain' && k === 'gain' && v === 0)) push(`${kind}.${String(k)}=${r6(v)}`); p[m] = v; return true; } }));   // (a gain created at 0 is not a change of the sound: see K.gain)
    }, set: (o, k, v) => { if (k === 'type' || k === 'oversample') push(`${kind}.${String(k)}=${v}`); o[k] = v; return true; } });
  };
  class OpenAC { constructor() { this.sampleRate = 22050; this.destination = rec('dest'); this.state = 'running'; }
    get currentTime() { return t3; } resume() {}
    createGain() { return rec('gain'); } createOscillator() { return rec('osc'); } createBiquadFilter() { return rec('filt'); }
    createBufferSource() { return rec('src'); } createConvolver() { return rec('conv'); } createDelay() { return rec('delay'); }
    createDynamicsCompressor() { return rec('comp'); } createStereoPanner() { return rec('pan'); } createWaveShaper() { return rec('shaper'); }
    createPeriodicWave() { return {}; } createBuffer(c, n) { return { getChannelData: () => new Float32Array(n) }; } }
  let seed = 1; const M = Object.create(Math); M.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const L = {}, iv = [];
  const sb = { window: { AudioContext: OpenAC, addEventListener: (n, f) => (L[n] ||= []).push(f) }, localStorage: { getItem: () => null, setItem() {} },
    setInterval: (f) => iv.push(f), setTimeout() {}, Math: M, console };
  vm.createContext(sb);
  for (const f of ['audio', 'music', 'music/home']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), sb);
  mus = vm.runInContext('music', sb);
  mus.setSong('home'); L.mousedown.forEach((f) => f()); seed = 1; log.length = 0; mus.reset();
  let reached = false;
  for (let x = 0; x < 300 && !reached; x += 0.025) { mus.setIntensity(Math.pow(Math.min(1, x / 285), 1.3)); t3 += 0.025; iv[0](); reached = mus.stage >= 2; }
  const hash = crypto.createHash('sha256').update(log.join('\n')).digest('hex').slice(0, 16);
  check(reached && hash === OPENING, `Last Jump Home's opening (clock and music box, stages 0-1) is unchanged, call for call (${log.length} calls, hash ${hash})`);
}

// The menu music: the audio starts as the page loads when the browser allows it, so Held Together plays in the
// menu from the start; when the browser would refuse, it waits for the first input of any kind (not only PLAY).
{
  const boot = (policy) => {
    const L = {}, iv = [];
    const sb = { window: { AudioContext: FakeAC, addEventListener: (n, f) => (L[n] ||= []).push(f) }, document: { hidden: false, addEventListener() {} },
      navigator: { getAutoplayPolicy: () => policy }, localStorage: { getItem: () => null, setItem() {} },
      setInterval: (f) => iv.push(f), setTimeout() {}, Math, console };
    vm.createContext(sb);
    for (const f of SCRIPTS) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), sb);
    return { L, iv, music: vm.runInContext('music', sb) };
  };
  const a = boot('allowed');
  a.music.setMission('menu');
  check(a.iv.length === 1 && a.music.title === 'Held Together', 'autoplay allowed: the menu plays Held Together as the page loads, before any input');
  const d = boot('disallowed');
  check(d.iv.length === 0, 'autoplay refused: no audio context (and no console warning) before the first input');
  d.L.keydown.forEach(f => f());
  check(d.iv.length === 1, 'and any key in the menu (typing a name) starts it');
  check(['pointerdown', 'mousedown', 'click', 'touchend'].every(n => d.L[n]?.length), 'any click or tap on the menu starts it too');
  // calm and steady in the menu: stage 1 for minutes, no drops, never the climax
  a.music.setIntensity(0.15); a.music.setThreat(false); a.music.setJump(false);
  for (let i = 0; i < 10 / 0.025; i++) { now += 0.025; a.iv[0](); }   // (it opens on stage 0, then settles: the page loads before the menu sets its level)
  const stages = new Set();
  for (let i = 0; i < 180 / 0.025; i++) { now += 0.025; a.iv[0](); stages.add(a.music.stage); }
  check(stages.size === 1 && stages.has(1) && !a.music.arc.some(e => e.kind === 'drop'), `the menu stays on one calm early stage for minutes (stages ${[...stages]})`);
  a.music.setMission('menu');                           // navigating the menu screens: the same piece, it doesn't restart
  const st = a.music.step; now += 0.5; a.iv[0]();
  check(a.music.step > st, 'staying in the menus never restarts the piece');
  a.music.setMission('c3'); check(a.music.title === a.music.songOf('c3'), 'a mission switches to its own piece');
  a.music.setMission('menu'); check(a.music.title === 'Held Together' && a.music.step === 0, 'and back in the menu, Held Together starts again from the top');
}

process.exit(failed ? 1 : 0);
