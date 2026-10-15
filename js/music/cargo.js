// Cargo Run (ch. 1-3, black box): a hauler's swung shuffle in E minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, inRange, bassRoot, stepDur, hash, pluck, lead, bass, taiko, kick, snare, clap, hat, tom, LEAD_VEL } = K;
  // The walking bass (Cargo Run): round and woody, a triangle and a sine through a soft filter, each note
  // plucked (quick swell, decaying) and released before it stops.
  function walkBass(m, t, len, vel) {
    const f = hz(m), lp = filt('lowpass', 0, 0.7), g = K.ac.createGain(), end = t + len + 0.4;
    lp.frequency.setValueAtTime(1300, t); lp.frequency.setTargetAtTime(550, t + 0.008, 0.08);
    osc('triangle', f, t, end).connect(lp); osc('sine', f, t, end).connect(lp);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.008); g.gain.setTargetAtTime(vel * 0.55, t + 0.008, 0.12);
    g.gain.setTargetAtTime(0, t + len, 0.04);
    lp.connect(g); route(g, false, false);
  }

  music.define({ name: 'cargo', title: 'Cargo Run', bpm: 96, key: 'E', missions: ['c1', 'c2', 'c3', 'salvage'],
    mood: 'a hauler\'s shuffle: a walking boogie bass and a shaker, strummed chords, a whistled tune',
    lead: 'flute', ostInst: 'pluck', drums: 'kit', swing: 0.3, keepRegister: true,   // (its other tracks were liked as they are)
    parts: { walk: 0, hats: 0, strum: [1, 4], drums: 2, pad: 3, ost: 3, ost16: 5, theme: 4, brass: 5, taiko: 5, stabs: 6, strings: 6 },
    A: { chords: 'Em Em C C Am Am B B', theme: [
      'E4 _ G4 _ B4 _ _ _', 'B4 _ A4 _ G4 _ F#4 _', 'G4 _ _ _ E4 _ C5 _', 'C5 _ _ _ G4 _ _ _',
      'A4 _ _ C5 _ _ E5 _', 'E5 _ D5 _ C5 _ A4 _', 'B4 _ _ _ D#5 _ F#5 _', 'F#5 _ _ _ D#5 _ _ _'] },
    B: { chords: 'C D Em Em C D B B', theme: [
      'G5 _ _ _ E5 _ _ _', 'F#5 _ _ _ A5 _ _ _', 'G5 _ _ _ _ _ B5 _', 'E5 _ _ _ _ _ . .',
      'C5 _ _ E5 _ _ G5 _', 'F#5 _ _ _ D5 _ A4 _', 'B4 _ _ _ D#5 _ F#5 _', 'D#5 _ _ _ _ _ . .'] },
    spool: 'C D', end: 'E', ost: '0 0 1 0 2 0 1 0 0 0 1 0 3 0 1 0',
    groove: ['walk'],                                     // (comes back early in the breakdown's rebuild)
    hooks: {
      step(x) {
        const { s, t, c, voice, st, has, late } = x;
        // the walking boogie bass: root, third, fifth, sixth, seventh and back, in swung 8ths
        if (has('walk') && s % 2 === 0 && !late) {
          const ok = (iv) => c.pcs.includes((c.root + iv) % 12) || [0, 2, 3, 5, 7, 8, 10].includes((c.root + iv - K.song.tonic + 24) % 12);
          const six = ok(9) ? 9 : 8, sev = ok(10) ? 10 : 11;       // (passing notes stay in the key)
          const WALK = [0, c.third, 7, six, sev, six, 7, c.third];
          walkBass(bassRoot(c) + 12 + WALK[s / 2], t, stepDur() * 1.7, st <= 1 ? 0.085 : 0.075);
        }
        // strummed chords
        if (has('strum') && (s === 0 || s === 6 || s === 10)) voice.forEach((m, i) => pluck(m, t + i * 0.022, 0.04, 0.6, (i - 1.5) * 0.25));
      },
      drums(x) {                                          // a swung backbeat kit with a shaker
        const { s, st, t, has, lv } = x, d = has('drums') ? lv('drums') : -1;
        if (d >= 0 && (d >= 2 ? [0, 6, 8, 10] : d >= 1 ? [0, 8, 10] : [0, 8]).includes(s)) kick(t, 0.5);
        if (d >= 0 && (s === 4 || s === 12)) snare(t, 0.2);
        if (has('hats') && s % 2 === 0) hat(t, s % 4 === 2 ? 0.07 : 0.045, false, 'shaker');
        if (has('taiko') && (s === 0 || s === 10)) taiko(t, 0.5, 1);
        if (st >= 6 && s === 15) snare(t, 0.08);
      },
      finale({ T, c, v }) {                               // a last strum, the walk's root, the shaker
        v.forEach((m, i) => pluck(m, T + i * 0.025, 0.05, 0.6, (i - 1.5) * 0.25));
        walkBass(bassRoot(c) + 12, T, 1.6, 0.09); hat(T, 0.06, false, 'shaker');
      },
    },
  });
})();
