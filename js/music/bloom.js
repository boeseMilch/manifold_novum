// Bloom (ch. 6): something growing, alive and a little wrong. F# minor with a Phrygian G, 104 BPM.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
//
// The voices: a low choir (its own, `vox`) split into two half-choirs left and right, each through three vowel
// formants that drift slowly from vowel to vowel (mm, oo, oh at first; ah, eh later), the halves a quarter bar
// apart, with a whisper of breath under it at the start. Spores pop in little runs up the chord's own tones, each one
// gliding into the next chord tone. A low rosewood marimba walks three notes a bar against the four beats (3:4),
// cycling through the chord over eight bars. Hand drums (doum, tek, ghost slaps, an udu's rising "bloop"),
// taikos late. The breakdown: the choir breathes (a filter and the vowel opening on the in-breath, closing on the
// out-breath, quicker as the layers return); spores swarm in the build bars. The climax: the bloom. The choir
// swells open (oo → ah → ee) with a high choir over it on the chord plus its 9th, a cloud of spores bursts up
// three octaves and FM-glass petals unfold upward over two bars, slowing as they open.
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, inRange, stepDur, hash, holder, taiko, snare, hat, tom } = K;

  // ---------------------------------------------------------------- harmony helpers
  const tonesIn = (c, lo, hi, pcs = c.pcs) => { const r = []; for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) r.push(m); return r; };
  const nextAbove = (c, m, pcs = c.pcs) => { let x = m + 1; while (!pcs.includes(x % 12)) x++; return x; };
  const add9 = (c) => [...c.pcs, (c.root + 2) % 12];                 // the chord with its 9th (the bloom's colour)
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------------------------------------------------------------- instruments
  // A wooden marimba: a sine and its quickly dying 4th partial (the low "rosewood" one: the 3rd partial, softer).
  function marimba(m, t, vel, p = 0, wood) {
    const f = hz(m), g = K.ac.createGain(), g2 = K.ac.createGain();
    osc('sine', f, t, t + (wood ? 1.1 : 0.7)).connect(g); osc('sine', f * (wood ? 3 : 4), t, t + 0.15).connect(g2); g2.connect(g);
    env(g, t, 0.002, vel, 0, wood ? 0.2 : 0.13); env(g2, t, 0.001, wood ? 0.3 : 0.5, 0, 0.018); route(p ? pan(g, p) : g, true, true);
  }
  // A spore popping: a sine blip gliding up into the next chord tone (or up a 9th).
  function bubble(m, t, vel, p, to) {
    const f = hz(m), o = osc('sine', f, t, t + 0.2), g = K.ac.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(to ? hz(to) : f * 1.9, t + 0.06);
    o.connect(g); env(g, t, 0.003, vel, 0, 0.035); route(pan(g, p), true, true);
  }
  // A petal: a soft FM-glass bell (modulator at 2×, its index dying away), ringing long.
  function petal(m, t, vel, p) {
    const f = hz(m), end = t + 2.6, car = osc('sine', f, t, end), mod = osc('sine', f * 2, t, end), mg = K.ac.createGain(), g = K.ac.createGain();
    mg.gain.setValueAtTime(f * 1.6, t); mg.gain.setTargetAtTime(f * 0.08, t, 0.25); mod.connect(mg); mg.connect(car.frequency);
    car.connect(g); env(g, t, 0.004, vel, 0, 0.45); route(pan(g, p), true, true);
  }
  // An udu: a clay pot drum, its pitch bending UP ("bloop").
  function udu(t, vel) {
    const o = osc('sine', 170, t, t + 0.5), g = K.ac.createGain();
    o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(265, t + 0.11);
    o.connect(g); env(g, t, 0.006, vel, 0, 0.08); route(pan(g, 0.4), true, false);
  }
  // A halo over the glass lead's long notes: a sine an octave up, a hair sharp, swelling in an 8th late.
  function halo(m, t, len, vel, p) {
    const g = K.gain(), end = t + len + 1.3;   // (K.gain: an enveloped gain created at 0)
    osc('sine', hz(m), t, end, 6).connect(g);
    g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(vel, t, 0.18); g.gain.setTargetAtTime(0, t + len, 0.2);
    route(pan(g, p), true, true);
  }

  // ---------------------------------------------------------------- the choir
  // Vowel formants (F1, F2, F3) of a low choir.
  const VOW = { M: [260, 520, 2250], U: [320, 680, 2300], O: [450, 830, 2500], A: [700, 1150, 2600], E: [480, 1750, 2500], I: [300, 2050, 2850] };
  const POOL = (st) => (st <= 1 ? 'MUOU' : st <= 3 ? 'UOAO' : st <= 5 ? 'OAEA' : 'AEOA');
  // The formants' path: a vowel every half bar from the piece's slow walk (from `off` on), or a set path.
  function vowels(bps, t, bd, seed, pool, off, path) {
    const seq = path || [];
    for (let k = seq.length; k < 20; k++) seq.push(pool[(hash(seed * 31 + k * 7) * pool.length) | 0]);
    bps.forEach((bp, j) => {
      bp.frequency.setValueAtTime(VOW[seq[0]][j], t);
      for (let k = 1; k < seq.length; k++) bp.frequency.linearRampToValueAtTime(VOW[seq[k]][j], t + off + k * bd / 2);
    });
  }
  // The breakdown's breathing: per breath the filter opens and the vowel goes oo → ah on the in-breath, back on the out.
  function breathe(lp, bps, g, t, bd, bk, vel) {
    const n = bk < 4 ? 1 : 2, len = bd / n, lo = 360, hi = 1300 + 260 * bk;
    lp.frequency.setValueAtTime(lo, t);
    bps.forEach((bp, j) => bp.frequency.setValueAtTime(VOW.U[j], t));
    for (let i = 0; i < n * 2; i++) {                    // (two bars' worth, in case the bar line comes late)
      const a = t + i * len, mid = a + len * 0.45, z = a + len;
      lp.frequency.exponentialRampToValueAtTime(hi, mid); lp.frequency.exponentialRampToValueAtTime(lo, z);
      bps.forEach((bp, j) => { bp.frequency.linearRampToValueAtTime(VOW.A[j], mid); bp.frequency.linearRampToValueAtTime(VOW.U[j], z); });
      if (g) { g.gain.setTargetAtTime(vel, a, len * 0.15); g.gain.setTargetAtTime(vel * 0.4, mid, len * 0.22); }
    }
  }
  // The choir: two half-choirs (low and high note each) left and right, saws through three gliding formants; the
  // high choir (the climax) on the chord's upper notes and its 9th. Returns its release.
  function makeVox(voice, c, t, o) {
    const ac = K.ac, bd = o.bd, os = [], g = K.gain(), vel = o.vel;   // (K.gain: created at 0)
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 4.2 + hash(o.b + 3) * 0.9; lg.gain.value = o.st >= 6 ? 12 : 7; lfo.connect(lg); lfo.start(t); os.push(lfo);
    const voiceOsc = (m, d, into) => { const x = ac.createOscillator(); x.type = 'sawtooth'; x.frequency.value = hz(m); x.detune.value = d; lg.connect(x.detune); x.start(t); into.forEach(b => x.connect(b)); os.push(x); };
    const bank = () => [filt('bandpass', 0, 5), filt('bandpass', 0, 7), filt('bandpass', 0, 9)];
    g.gain.setValueAtTime(0, t);
    if (o.bk >= 0) g.gain.setTargetAtTime(vel * 0.4, t, 0.3);
    else g.gain.setTargetAtTime(vel, t, o.swell ? bd / 3 : 0.35);
    const pool = POOL(o.st);
    [[0, 2, -0.7], [1, 3, 0.7]].forEach(([lo, hi, p], side) => {      // the half-choirs
      const bps = bank(), lp = filt('lowpass', 5200, 1.4);
      voiceOsc(voice[lo] - 12, side ? 5 : -5, bps); voiceOsc(voice[hi], side ? -9 : 9, bps);
      bps.forEach(b => b.connect(lp)); pan(lp, p).connect(g);
      if (o.bk >= 0) breathe(lp, bps, side ? null : g, t, bd, o.bk, vel);
      else vowels(bps, t, bd, o.b * 2 + side, pool, side * bd / 4, o.swell ? ['U', 'U', 'O', 'A'] : null);
      if (o.whisper && side === 0) {                   // a breath of air through the same formants (dies by itself)
        const n = noiseSrc(t, t + bd * 2), ng = K.gain();
        ng.gain.setValueAtTime(0, t); ng.gain.setTargetAtTime(0.5, t, 0.6); ng.gain.setTargetAtTime(0, t + bd * 1.5, 0.12);
        n.connect(ng); bps.forEach(b => ng.connect(b));
      }
    });
    if (o.seraph) {                                       // the high choir: "ah" → "ee", wide
      const ninth = inRange((c.root + 2) % 12, voice[2] + 7);
      [[voice[1] + 12, ninth, -0.45], [voice[3] + 12, voice[2] + 12, 0.45]].forEach(([m1, m2, p], side) => {
        const bps = bank(), sg = ac.createGain(); sg.gain.value = 0.55;
        voiceOsc(m1, side ? 8 : -8, bps); voiceOsc(m2, side ? -6 : 6, bps);
        bps.forEach(b => b.connect(sg)); pan(sg, p).connect(g);
        vowels(bps, t, bd, o.b * 2 + 7 + side, 'AIEI', side * bd / 4, o.swell ? ['U', 'O', 'A', 'A', 'I'] : null);
      });
    }
    route(g, true, false);
    return holder(os, g, vel, 0.4, 2.8, true);
  }
  let vox = null;                                         // the choir now sounding (the engine releases it with the choir's tag)
  function startVox(x, swell) {
    const o = { vel: x.st <= 2 ? 0.3 : x.st >= 6 ? 0.3 : 0.33, st: x.spool ? 6 : x.st, bk: x.bk, bd: x.bd, b: x.b, swell,
      seraph: (x.st >= 6 || x.spool) && x.bk < 0, whisper: x.st <= 1 && x.bk < 0 };
    const inner = makeVox(x.voice, x.c, x.t, o), me = (r) => { if (vox === me) vox = null; inner(r); };
    vox = me; K.hold('choir', me);
  }

  // ---------------------------------------------------------------- the bloom (the climax)
  let cur = null, bloom = null, queue = [];
  // The bar's notes are planned on the bar line but built step by step (the step hook drains the queue), so the
  // bloom's many voices are not all created in one go.
  const later = (at, f) => { if (queue) queue.push({ at, f }); else f(at); };
  function drain(t0) {
    const end = t0 + stepDur() - 1e-6;
    while (queue.length && queue[0].at < end) { const e = queue.shift(); e.f(e.at); }
  }
  // A cloud of spores bursting up three octaves through the chord in two beats, spreading out to both sides.
  function sporeCloud(c, t, n, vel) {
    let m = inRange(c.root, 64);
    for (let i = 0; i < n; i++) { const to = nextAbove(c, m), from = m, p = (i % 2 ? 1 : -1) * Math.min(0.95, 0.15 + i / n); later(t + i * stepDur() * 7 / n, (at) => bubble(from, at, vel, p, to)); m = to; }
  }
  // Petals unfolding over two bars: chord tones (and the 9th) climbing, fast at first, slowing as they open.
  function petals(x) {
    const N = bloom.big ? 16 : 11, span = 2 * x.bd;
    for (let i = 0; i < N; i++) {
      const at = bloom.T + x.bd * 0.4 + (span - x.bd * 0.4) * Math.pow(i / N, 1.3);   // (after the spore cloud)
      if (at < x.t - 1e-6 || at >= x.t + x.bd - 1e-6) continue;          // (each bar plays its own petals on its own chord)
      const pcs = add9(x.c);
      bloom.m = bloom.m === null ? inRange(x.c.root, 62) : nextAbove(x.c, bloom.m, pcs);
      if (bloom.m > 98) bloom.m -= 24;
      const m = bloom.m, vel = (bloom.big ? 0.04 : 0.032) * (1 - 0.3 * i / N), p = (i % 2 ? 1 : -1) * (0.2 + 0.7 * i / N);
      later(at, (a) => petal(m, a, vel, p));
    }
  }

  music.define({ name: 'bloom', title: 'Bloom', bpm: 104, key: 'F#', missions: ['c6'],
    mood: 'something growing: a breathing low choir, spores, a 3-against-4 marimba, hand drums, a glassy FM lead; the climax blooms',
    lead: 'fm', ostInst: 'marimba', drums: 'hand',
    parts: { vox: 0, bubbles: [0, 3], ost: 1, poly: 2, drums: 2, ost16: 3, bass: 4, theme: 4, hats: 5, brass: 5, taiko: 5, stabs: 6, strings: 6 },
    groove: ['poly'],                                     // (back in the breakdown's second half with the ostinato)
    A: { chords: 'F#m F#m G G F#m F#m E E', theme: [
      'F#4 _ _ _ C#5 _ _ _', 'A4 _ _ _ _ _ F#4 _', 'G4 _ _ _ B4 _ D5 _', 'B4 _ _ _ _ _ . .',
      'C#5 _ _ _ F#5 _ _ _', 'C#5 _ B4 _ A4 _ _ _', 'B4 _ _ _ G#4 _ E4 _', 'G#4 _ _ _ _ _ . .'] },
    B: { chords: 'D E F#m F#m D E C# C#', theme: [
      'F#5 _ _ _ _ _ A5 _', 'G#5 _ _ _ E5 _ B4 _', 'C#5 _ _ F#5 _ _ A5 _', 'F#5 _ _ _ _ _ . .',
      'A5 _ _ _ F#5 _ D5 _', 'B5 _ _ _ G#5 _ E5 _', 'G#5 _ _ _ F5 _ C#5 _', 'C#5 _ _ _ _ _ . .'] },
    spool: 'D E', end: 'F#', ost: '0 . . 2 . . 1 . 0 . . 2 . 3 . 1',
    hooks: {
      ost(m, t, a, st) { if (m < 60) m += 12; marimba(m, t, (st >= 3 ? 0.12 : 0.1) * a, clamp((m - 64) / 14, -0.6, 0.6)); },   // (lifted out of the low mids; spread by register)
      bar(x) {
        cur = x; queue = [];                              // (what a cut-short bar left over is dropped)
        const climax = x.st === 6 && !x.spool && x.bk < 0;
        if (climax && x.ph === 0) bloom = { b: x.b, T: x.t, big: x.drop, m: null };
        const blooming = bloom && !x.spool && x.b - bloom.b <= 1 && x.b >= bloom.b;
        if (x.has('vox') && !vox) startVox(x, blooming && x.b === bloom.b);
        if (blooming) {
          if (x.b === bloom.b) sporeCloud(x.c, x.t + 0.02, bloom.big ? 12 : 8, bloom.big ? 0.05 : 0.04);
          petals(x);
        } else if (climax && x.ph === 4) sporeCloud(x.c, x.t + 0.02, 6, 0.035);
        if (x.has('poly') && !x.spool) {                  // three notes a bar against the four beats
          const tones = tonesIn(x.c, 60, 76), P = [0, 2, 1, 3, 2, 0, 3, 1];
          for (let k = 0; k < 3; k++) { const i = x.b * 3 + k; later(x.t + k * x.bd / 3, (at) => marimba(tones[P[i % 8] % tones.length], at, 0.11, ((i % 4) - 1.5) * 0.4, true)); }
        }
      },
      step({ s, b, t, c, st, has, step }) {               // spores: little runs up the chord, thicker in the build bars
        queue.sort((p, q) => p.at - q.at); drain(t);
        const build = cur && cur.b === b && cur.build;
        if (!has('bubbles') && !build) return;
        const dens = build ? 0.15 + 0.6 * s / 12 : st === 0 ? 0.09 : 0.12;
        if (hash(step * 3 + 1) >= dens) return;
        const tones = tonesIn(c, 70, 88), n = build ? 2 : 1 + ((hash(step + 11) * 3) | 0), dir = hash(step + 9) < 0.5 ? -1 : 1;
        let m = tones[(hash(step) * tones.length) | 0];
        for (let k = 0; k < n; k++) { const to = nextAbove(c, m); bubble(m, t + k * stepDur() * 0.5, 0.045 * (1 - 0.15 * k), dir * (0.3 + 0.2 * k + 0.3 * hash(step + 5)), to); m = to; }
      },
      theme(x, n, at, len) {                               // a halo over the long notes, once the climax nears
        if (x.st >= 5 && x.bk < 0 && n.len >= 4 && x.has('theme')) halo(n.midi + 12, at + x.e8, len - x.e8, 0.016, n.midi % 2 ? 0.5 : -0.5);
      },
      drums({ s, b, t, has, lv, step }) {                  // hand drums, syncopated and never quite the same; taikos join late
        const d = has('drums') ? lv('drums') : -1, hum = 0.85 + 0.3 * hash(step * 7 + 3);
        if (d >= 0) {
          if ((d >= 1 ? [0, 7, 10] : [0, 10]).includes(s)) tom(t, 0.27 * hum, 165, true);
          else if ((d >= 1 ? [3, 6, 12, 14, 15] : [3, 6, 14]).includes(s)) tom(t, (s === 15 ? 0.15 : 0.24) * hum, 330, true);
          else if (d >= 1 && s % 2 === 1 && hash(step * 5 + 2) < 0.25) tom(t, 0.05 + 0.05 * hash(step), 370, true);   // ghost slaps
          if (s === 13 && hash(b * 13 + 1) < 0.5) udu(t, 0.2);
          if (d >= 2 && (s === 4 || s === 12)) snare(t, 0.15);
        }
        if (has('taiko') && [0, 6, 10].includes(s)) taiko(t, 0.5, s === 0 ? 1 : 1.15);
        if (has('hats') && s % 2 === 0) hat(t, s % 4 === 2 ? 0.06 : 0.035, false, s % 4 === 2 ? 'shaker' : undefined);
      },
      finale({ T, c, v, sd }) {                           // the last bloom: the choir opening on the major chord, spores, petals
        const rel = makeVox(v, c, T, { vel: 0.3, st: 6, bk: -1, bd: sd * 16, b: 1, swell: false, seraph: true }); rel(T + 2.8);
        queue = null; sporeCloud(c, T + 0.05, 10, 0.045); queue = [];   // (no steps after the final hit: play it all now)
        v.forEach((m, i) => marimba(m + 12, T + i * sd / 2, 0.12, (i - 1.5) * 0.3));
        let m = inRange(c.root, 66);
        for (let i = 0; i < 9; i++) { petal(m, T + 0.1 + 1.6 * Math.pow(i / 9, 1.4), 0.035, (i % 2 ? 1 : -1) * (0.2 + i / 12)); m = nextAbove(c, m, add9(c)); }
      },
    },
  });
})();
