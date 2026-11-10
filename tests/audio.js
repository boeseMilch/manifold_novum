// The sound effects (js/audio.js) against a fake WebAudio: every sound ends by itself. The noise buffer is one second
// long, so noise sounds longer than that have to loop it (2026-11-10: they were cut at 1 s), and every source and
// oscillator gets a stop of its own (the charge whine had none: a client that missed its stop event heard it until
// the page reloaded). Run: node tests/audio.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
let now = 0;
const made = [], timers = [];
const param = () => { const p = { value: 0, last: 0, end: 0 };
  for (const k of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime']) p[k] = (v, t) => { if (t >= p.end) { p.end = t; p.last = v; } };
  p.setTargetAtTime = () => {}; p.cancelScheduledValues = () => {};
  return p; };
const node = (kind) => { const o = { kind, loop: false, started: null, stopped: null, out: [] }; made.push(o);
  return new Proxy(o, { get: (o, k) => (k in o ? o[k] : k === 'start' ? (t) => { o.started = t ?? now; } : k === 'stop' ? (t) => { o.stopped = t ?? now; } : k === 'connect' ? (to) => { o.out.push(to); }
    : k === 'disconnect' ? () => {} : (o[k] = param())), set: (o, k, v) => ((o[k] = v), true) }); };
class FakeAC {
  constructor() { this.sampleRate = 8000; this.destination = node('dest'); this.state = 'running'; }
  get currentTime() { return now; }
  resume() {} createGain() { return node('gain'); } createOscillator() { return node('osc'); } createBiquadFilter() { return node('filter'); } createBufferSource() { return node('noise'); }
  createBuffer(ch, len) { return { length: len, getChannelData: () => new Float32Array(len) }; }
}
const sandbox = { window: { AudioContext: FakeAC, addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, navigator: { getAutoplayPolicy: () => 'allowed' },
  setTimeout: (f, ms) => timers.push([now + ms / 1000, f]), Math, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'audio.js'), 'utf8'), sandbox);
const sfx = vm.runInContext('sfx', sandbox);
// Play one effect and its delayed parts (setTimeout); returns the sources it made, each with the time its gain reaches silence.
const play = (name, ...args) => {
  const k0 = made.length; now += 100; const t0 = now;
  const ret = sfx[name](...args);
  for (let i = 0; i < 400; i++) { now += 0.025; for (const t of timers.splice(0)) if (t[0] <= now) t[1](); else timers.push(t); }
  const all = made.slice(k0), gainAfter = (n) => { for (const to of n.out) { const g = to.kind === 'gain' ? to : gainAfter(to); if (g) return g; } return null; };
  return { t0, ret, src: all.filter(n => n.kind === 'noise' || n.kind === 'osc').map(n => ({ n, g: gainAfter(n) })) };
};

// every one-shot effect: each source is stopped, the stop comes after its envelope has faded, and a noise that runs
// for longer than the 1 s buffer loops it
const ONE_SHOT = ['shoot', 'enemyShot', 'spark', 'clank', 'poi', 'hit', 'shieldUp', 'shieldBlock', 'hatch', 'whoosh', 'explosion', 'heavyLaunch', 'spit', 'alienHurt', 'empty', 'spray', 'alarm', 'purr',
  'win', 'jumpOut', 'sputter', 'rumble', 'lurch', 'whale', 'squelch', 'crack', 'creak', 'tear', 'breakup', 'shatter', 'ratchet', 'heartbeat', 'ouch'];
const known = Object.keys(sfx).filter(k => typeof sfx[k] === 'function' && !['onReady', 'toggleMute', 'say', 'hum', 'charge'].includes(k));
check(known.every(k => ONE_SHOT.includes(k)), `every effect is covered here (${known.filter(k => !ONE_SHOT.includes(k)).join(', ') || 'all'})`);
const cut = [], running = [], long = [];
for (const name of ONE_SHOT) {
  const P = play(name);
  for (const { n, g } of P.src) {
    if (n.stopped === null) { running.push(name); continue; }
    if (n.kind !== 'noise') continue;
    const len = n.stopped - n.started;
    if (len > 1) long.push(`${name} ${len.toFixed(2)}`);
    if (len > 1 && !n.loop) cut.push(`${name} ${len.toFixed(2)} s`);
    if (g && g.gain.end > n.stopped + 1e-6) cut.push(`${name}: stopped before its envelope ends`);
  }
}
check(!running.length, `every source of every effect is told to stop (${[...new Set(running)].join(', ') || 'none left running'})`);
check(long.length >= 8, `the long noises are found (${long.join(', ')})`);
check(!cut.length, `a noise longer than the 1 s buffer loops it, and none is stopped before its envelope ends (${cut.join('; ') || 'none cut'})`);

// the charge whine: stopped by its caller, or by itself a few seconds after the charge time
{
  const P = play('charge', 4), oscs = P.src.filter(x => x.n.kind === 'osc');
  check(oscs.length === 2 && oscs.every(x => x.n.stopped !== null && x.n.stopped > P.t0 + 6 && x.n.stopped <= P.t0 + 8),
    `charge(4) never stopped by its caller: it stops by itself (${oscs.map(x => (x.n.stopped === null ? 'never' : (x.n.stopped - P.t0).toFixed(2) + ' s')).join(', ')})`);
  const g = oscs[0].g;
  check(g && g.gain.last === 0 && g.gain.end <= oscs[0].n.stopped, 'faded to silence before that (no click)');
  now += 100; const t0 = now, stop = sfx.charge(4), mine = made.slice(-6).filter(n => n.kind === 'osc');
  now += 2; stop(); stop();
  check(mine.length === 2 && mine.every(n => Math.abs(n.stopped - (t0 + 2.1)) < 1e-6), 'stopped by its caller (the shot fired, the ship destroyed): at once, as before');
}
process.exitCode = failed ? 1 : 0;
