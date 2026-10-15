// Pressure Hull (ch. 7, deep drift): deep and sparse; a sonar ping, a heartbeat, half-time drums, a cello. B minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, inRange, bassRoot, stepDur, hash, pluck, lead, bass, taiko, kick, snare, clap, hat, tom, LEAD_VEL } = K;
  // A sonar ping: a clean sine with a slight downward glide, into the echo.
  function sonar(m, t, vel) {
    const f = hz(m), o = osc('sine', f, t, t + 2.5), g = K.ac.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.985, t + 1.5);
    o.connect(g); env(g, t, 0.004, vel, 0.05, 0.45); route(pan(g, -0.3), true, true);
  }
  // A heartbeat: lub-dub.
  function heart(t, vel) {
    for (const [d, v] of [[0, 1], [0.2, 0.6]]) {
      const o = osc('sine', 75, t + d, t + d + 0.5), g = K.ac.createGain();
      o.frequency.setValueAtTime(75, t + d); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.14);
      o.connect(g); env(g, t + d, 0.004, vel * v, 0.01, 0.07); route(g, true, false);
    }
  }

  music.define({ name: 'hull', title: 'Pressure Hull', bpm: 84, key: 'B', missions: ['c7', 'deep'],
    mood: 'deep and sparse: a sonar ping, a heartbeat, half-time drums, a cello',
    lead: 'cello', ostInst: 'pluck', drums: 'half', bassStyle: 'half',
    parts: { sonar: [0, 4], heart: [0, 2], drone: [1, 4], pad: 2, ost: 2, ost16: 5, drums: 3, bass: 3, hats: 4, theme: 4, brass: 5, stabs: 6, strings: 6 },
    A: { chords: 'Bm Bm G G Em Em F# F#', theme: [
      'B3 _ _ _ _ _ F#4 _', 'D4 _ _ _ _ _ C#4 _', 'B3 _ _ _ D4 _ G4 _', 'G4 _ _ _ D4 _ _ _',
      'E4 _ _ G4 _ _ B4 _', 'B4 _ G4 _ E4 _ _ _', 'F#4 _ _ _ A#4 _ C#5 _', 'A#4 _ _ _ _ _ . .'] },
    B: { chords: 'G A Bm Bm G A F# F#', theme: [
      'D5 _ _ _ B4 _ _ _', 'C#5 _ _ _ E5 _ _ _', 'F#5 _ _ _ _ _ D5 _', 'B4 _ _ _ _ _ . .',
      'G5 _ _ _ D5 _ B4 _', 'A4 _ _ C#5 _ _ E5 _', 'F#5 _ _ _ C#5 _ A#4 _', 'F#4 _ _ _ _ _ . .'] },
    spool: 'G A', end: 'B', ost: '0 . 0 . 1 . 0 . 0 . 0 . 3 . 1 .',
    hooks: {
      bar({ t, bi, has }) { if (has('sonar')) sonar(inRange(K.song.tonic, 81) - (bi % 2 ? 5 : 0), t, bi % 2 ? 0.1 : 0.15); },   // ping (and a fourth lower, its answer)
      step({ s, t, st, has }) { if (has('heart') && (s === 0 || (s === 8 && st >= 1))) heart(t, 0.45); },
      drums({ s, st, t, has, lv }) {                     // half time; full time from stage 5
        const d = has('drums') ? lv('drums') : -1, full = st >= 5;
        if (d >= 0 && (full ? [0, 6, 10] : [0]).includes(s)) taiko(t, 0.6, 0.9);
        if (d >= 0 && (full ? [4, 12] : [8]).includes(s)) snare(t, full ? 0.25 : 0.3);
        if (has('hats') && s % (full ? 2 : 4) === 0) hat(t, s % 8 === 4 ? 0.06 : 0.035, s === 12 && !full);
        if (st >= 6 && s === 15) snare(t, 0.08);
      },
      finale({ T, c, sd }) { sonar(inRange(c.root, 81), T + sd * 8, 0.15); heart(T + sd * 16, 0.4); },   // a last ping, a last heartbeat
    },
  });
})();
