// Bloom (ch. 6, ore run): something growing; a low choir, popping spores, marimba and hand drums. F# minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, inRange, bassRoot, stepDur, hash, pluck, lead, bass, taiko, kick, snare, clap, hat, tom, LEAD_VEL } = K;
  // A wooden marimba: a sine and its quickly dying 4th partial.
  function marimba(m, t, vel) {
    const f = hz(m), g = K.ac.createGain(), g2 = K.ac.createGain();
    osc('sine', f, t, t + 0.7).connect(g); osc('sine', f * 4, t, t + 0.15).connect(g2); g2.connect(g);
    env(g, t, 0.002, vel, 0, 0.13); env(g2, t, 0.001, 0.5, 0, 0.018); route(g, true, true);
  }
  // Spores popping: a quick upward sine blip.
  function bubble(m, t, vel, p) {
    const f = hz(m), o = osc('sine', f, t, t + 0.2), g = K.ac.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.07);
    o.connect(g); env(g, t, 0.003, vel, 0, 0.035); route(pan(g, p), true, true);
  }

  music.define({ name: 'bloom', title: 'Bloom', bpm: 104, key: 'F#', missions: ['c6', 'ore'],
    mood: 'something growing: a low choir, popping spores, marimba and hand drums, a glassy FM lead',
    lead: 'fm', ostInst: 'marimba', drums: 'hand',
    parts: { choir: 0, bubbles: [0, 3], ost: 1, ost16: 3, drums: 2, bass: 3, hats: 5, theme: 4, brass: 5, taiko: 5, stabs: 6, strings: 6 },
    A: { chords: 'F#m F#m G G F#m F#m E E', theme: [
      'F#4 _ _ _ C#5 _ _ _', 'A4 _ _ _ _ _ F#4 _', 'G4 _ _ _ B4 _ D5 _', 'B4 _ _ _ _ _ . .',
      'C#5 _ _ _ F#5 _ _ _', 'C#5 _ B4 _ A4 _ _ _', 'B4 _ _ _ G#4 _ E4 _', 'G#4 _ _ _ _ _ . .'] },
    B: { chords: 'D E F#m F#m D E C# C#', theme: [
      'F#5 _ _ _ _ _ A5 _', 'G#5 _ _ _ E5 _ B4 _', 'C#5 _ _ F#5 _ _ A5 _', 'F#5 _ _ _ _ _ . .',
      'A5 _ _ _ F#5 _ D5 _', 'B5 _ _ _ G#5 _ E5 _', 'G#5 _ _ _ F5 _ C#5 _', 'C#5 _ _ _ _ _ . .'] },
    spool: 'D E', end: 'F#', ost: '0 . . 2 . . 1 . 0 . . 2 . 3 . 1',
    hooks: {
      ost(m, t, a, st) { marimba(m, t, (st >= 3 ? 0.13 : 0.1) * a); },   // the ostinato on the marimba
      step({ t, voice, has, step }) {
        if (has('bubbles') && hash(step * 3 + 1) < 0.16) bubble(voice[(hash(step) * 4) | 0] + 12 + 12 * (hash(step + 5) < 0.4), t, 0.05, hash(step + 9) - 0.5);
      },
      drums({ s, t, has, lv }) {                         // hand drums, syncopated; taikos join late
        const d = has('drums') ? lv('drums') : -1;
        if (d >= 0) {
          if ((d >= 1 ? [0, 7, 10] : [0, 10]).includes(s)) tom(t, 0.4, 140, true);
          if ((d >= 1 ? [3, 6, 12, 14, 15] : [3, 6, 14]).includes(s)) tom(t, s === 15 ? 0.15 : 0.25, 330, true);
          if (d >= 2 && (s === 4 || s === 12)) snare(t, 0.16);
        }
        if (has('taiko') && [0, 6, 10].includes(s)) taiko(t, 0.5, s === 0 ? 1 : 1.15);
        if (has('hats') && s % 2 === 0) hat(t, s % 4 === 2 ? 0.06 : 0.035);
      },
      finale({ T, v, sd }) {                              // a burst of spores, the marimba rolling up the chord
        for (let i = 0; i < 6; i++) bubble(v[i % 4] + 24, T + 0.05 + i * 0.07, 0.05, (i % 3 - 1) * 0.5);
        v.forEach((m, i) => marimba(m + 12, T + i * sd / 2, 0.12));
      },
    },
  });
})();
