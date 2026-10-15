// Last Jump Home (ch. 8, nightmare): a ticking clock and the theme on a music box; then a wobble bass and half-time drums. C minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, inRange, bassRoot, stepDur, hash, pluck, lead, bass, taiko, kick, snare, clap, hat, tom, LEAD_VEL } = K;
  // A music-box tine: pure and high, with a bright octave click at the start.
  function tine(m, t, vel, p) {
    const f = hz(m), g = K.ac.createGain(), g2 = K.ac.createGain();
    osc('sine', f, t, t + 2.6).connect(g); osc('sine', f * 2, t, t + 0.3).connect(g2); g2.connect(g);
    env(g, t, 0.002, vel, 0, 0.55); env(g2, t, 0.001, 0.6, 0, 0.03); route(pan(g, p), true, false);
    return { g, at: t };
  }
  // A clock: tick (high) and tock (low), dry little clicks.
  function tick2(t, vel, hi) {
    const o = osc('square', hi ? 2600 : 1700, t, t + 0.05), bp = filt('bandpass', hi ? 3200 : 2000, 2), g = K.ac.createGain();
    o.connect(bp); bp.connect(g); env(g, t, 0.001, vel, 0, 0.008); route(pan(g, hi ? 0.2 : -0.2), true, false);
  }
  // The wobble bass (Last Jump Home): two saws and a square an octave down through a resonant lowpass whose
  // cutoff an LFO sweeps in time with the beat (rate: wobbles per second), with a sine sub underneath. The LFO
  // starts closed (a -cos wave), so every bar's wobble begins on the beat.
  function wobble(c, t, len, rate, vel, att) {
    const f = hz(bassRoot(c) + 12), end = t + len + 0.3, lp = filt('lowpass', 1250, 7), g = K.ac.createGain();
    for (const d of [-8, 8]) osc('sawtooth', f, t, end, d).connect(lp);
    osc('square', f / 2, t, end).connect(lp);
    const lfo = K.ac.createOscillator(), lg = K.ac.createGain();
    if (K.ac.createPeriodicWave) lfo.setPeriodicWave(K.ac.createPeriodicWave(new Float32Array([0, -1]), new Float32Array([0, 0])));
    else lfo.type = 'sine';
    lfo.frequency.value = rate; lg.gain.value = 1100; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); lfo.stop(end);
    const sub = osc('sine', f / 2, t, end), sg = K.ac.createGain(); sg.gain.value = 1.1; sub.connect(sg); sg.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + att);
    g.gain.setValueAtTime(vel, t + Math.max(att, len - 0.03)); g.gain.linearRampToValueAtTime(0, t + len);
    lp.connect(g); route(g, false, false);
  }

  music.define({ name: 'home', title: 'Last Jump Home', bpm: 112, key: 'C', missions: ['c8', 'nightmare'],
    mood: 'a ticking clock and the theme on a music box; then a slow wobble bass creeps in, and the drop: half-time drums, a heavy snare on 3',
    lead: 'saw', ostInst: 'pluck', drums: 'dub',
    parts: { tick: [0, 3], tines: [0, 3], pad: 1, wobble: 2, drums: 3, hats: 3, snare: 4, theme: 4, choir: 5, brass: 5, stabs: 6, strings: 6 },
    A: { chords: 'Cm Cm Ab Ab Fm Fm G G', theme: [
      'C5 _ _ G4 _ _ C5 _', 'Eb5 _ _ _ C5 _ D5 _', 'Eb5 _ _ _ _ _ C5 _', 'Ab4 _ _ _ _ _ Bb4 _',
      'C5 _ _ F5 _ _ Ab5 _', 'Ab5 _ G5 _ F5 _ C5 _', 'D5 _ _ _ B4 _ G4 _', 'B4 _ _ _ D5 _ _ _'] },
    B: { chords: 'Ab Bb Cm Cm Ab Bb G G', theme: [
      'Eb5 _ _ _ Ab5 _ _ _', 'F5 _ _ _ Bb5 _ _ _', 'G5 _ _ _ _ _ Eb5 _', 'C5 _ _ _ _ _ . .',
      'C5 _ _ Eb5 _ _ Ab5 _', 'Bb5 _ _ _ F5 _ D5 _', 'D5 _ _ _ G5 _ _ _', 'G5 _ _ _ D5 _ F5 _'] },
    spool: 'Ab Bb', end: 'C', ost: '0 0 1 0 2 0 1 0 0 0 1 0 3 2 1 0',
    groove: ['wobble'],                                   // (comes back early in the breakdown's rebuild)
    hooks: {
      bar({ t, bi, c, st, has, bd, spool, build, first }) {   // the wobble: slow at first, faster and broken up after the drop
        if (!has('wobble')) return;
        const cyc = st >= 6 ? [3, 4, 2, 4] : st >= 4 ? [2, 3, 2, 4] : st === 3 ? [2, 2, 2, 2] : [1, 1, 1, 1];
        wobble(c, t, (build ? bd * 0.75 : bd) - 0.01, K.song.bpm / 60 * (spool ? 4 : cyc[bi % 4]), st <= 2 ? 0.05 : 0.075, first('wobble') ? bd * 0.9 : 0.01);
      },
      theme(x, n, at, len) {                              // the music box plays the theme (stages 0-3, and in the breakdown)
        if (!x.has('tines')) return;
        const m = n.midi + 12 > 91 ? n.midi : n.midi + 12;
        x.notes.push(tine(m, at, 0.12, 0.15)); if (n.len >= 3) x.notes.push(tine(m, at + 2 * x.e8, 0.06, -0.15));
      },
      step({ s, t, has }) { if (has('tick') && s % 4 === 0) tick2(t, s === 0 ? 0.16 : 0.1, s % 8 === 0); },
      drums({ s, st, t, has, lv }) {                     // half time: kick on the 1, a heavy snare on the 3 (from the drop)
        const d = has('drums') ? lv('drums') : -1;
        if (d >= 0 && (s === 0 || (st >= 5 && s === 10) || (st >= 6 && s === 7))) kick(t, 0.65);
        if (has('snare') && s === 8) { snare(t, 0.4); clap(t, 0.16); taiko(t, 0.3, 1.4); }
        if (has('hats')) { if (lv('hats') >= 2) hat(t, s % 4 === 2 ? 0.07 : 0.03); else if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.06 : 0.03); }
        if (st >= 6 && s === 15) snare(t, 0.1);
      },
      finale({ T, v, sd }) {                              // the music box rolls up the chord; the clock ticks once more
        v.forEach((m, i) => tine(m + 24 > 91 ? m + 12 : m + 24, T + sd * (2 + 2 * i), 0.1, (i - 1.5) * 0.3)); tick2(T + sd * 16, 0.14, true);
      },
    },
  });
})();
