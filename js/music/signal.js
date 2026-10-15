// A Signal in the Dark (ch. 5, stranded engineer): radio static and a far-away radio horn, a solo voice answers. C minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, inRange, bassRoot, stepDur, hash, pluck, lead, bass, taiko, kick, snare, clap, hat, tom, LEAD_VEL } = K;
  // Radio static: short band-limited crackles and a brief "tuning" burst now and then, fading out as the music builds.
  function crackle(t, vel) {
    const n = noiseSrc(t, t + 0.06), bp = filt('bandpass', 1600 + 1600 * Math.random(), 2.5), g = K.ac.createGain();
    n.connect(bp); bp.connect(g); env(g, t, 0.002, vel, 0, 0.008); route(pan(g, 0.35), false, false);
  }
  function tuning(t, len, vel) {
    const n = noiseSrc(t, t + len + 0.4), bp = filt('bandpass', 1400, 3), g = K.ac.createGain();
    bp.frequency.setValueAtTime(1100, t); bp.frequency.linearRampToValueAtTime(1900, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.08); g.gain.setTargetAtTime(0, t + len, 0.05);
    n.connect(bp); bp.connect(g); route(pan(g, 0.35), true, false);
  }

  music.define({ name: 'signal', title: 'A Signal in the Dark', bpm: 92, key: 'C', missions: ['c5', 'rescue'],
    mood: 'radio static and the theme on a distant radio horn, until a solo voice answers',
    lead: 'voice', ostInst: 'pluck', drums: 'taiko',
    parts: { radio: [0, 3], static: [0, 2], pad: 1, bells: [2, 4], ost: 3, ost16: 5, drums: 3, bass: 3, hats: 4, snare: 4, theme: 4, brass: 5, stabs: 6, strings: 6 },
    A: { chords: 'Ab Ab Eb Eb Bb Bb Cm Cm', theme: [
      'C5 _ _ _ Eb5 _ _ _', 'Ab4 _ _ _ _ _ Bb4 _', 'G4 _ _ _ Bb4 _ Eb5 _', 'G5 _ F5 _ Eb5 _ _ _',
      'D5 _ _ _ F5 _ _ _', 'Bb4 _ _ _ D5 _ C5 _', 'Eb5 _ _ _ _ _ D5 _', 'C5 _ _ _ _ _ . .'] },
    B: { chords: 'Fm Fm Ab Bb Eb Bb Cm Cm', theme: [
      'C5 _ _ F5 _ _ Ab5 _', 'Ab5 _ _ _ F5 _ C5 _', 'Eb5 _ _ _ C5 _ Eb5 _', 'F5 _ _ _ D5 _ F5 _',
      'G5 _ _ _ _ _ Bb5 _', 'Bb5 _ _ _ F5 _ D5 _', 'Eb5 _ _ _ G5 _ _ _', 'C5 _ _ _ _ _ . .'] },
    spool: 'Ab Bb', end: 'C', ost: '0 2 1 2 3 2 1 2 0 2 1 2 3 2 1 2',
    hooks: {
      bar({ t, bi, st, has, bd }) { if (has('static') && bi % 2 === 1) tuning(t + bd * 0.75, bd * 0.2, 0.02 / (1 + st)); },
      theme(x, n, at, len) { if (x.has('radio')) x.notes.push(lead(n.midi, at, len, LEAD_VEL.radio * (x.st >= 2 ? 1 : 0.8), 'radio')); },
      step({ t, st, has, step }) {
        if (has('static') && hash(step) < 0.12 / (1 + st)) crackle(t + hash(step + 7) * stepDur(), (0.02 + 0.03 * hash(step + 3)) / (1 + st * 0.5));
      },
      finale({ T, c, sd }) { lead(inRange(c.root, 72), T + sd * 4, 1.6, LEAD_VEL.radio * 0.7, 'radio'); },   // the radio answers once more
    },
  });
})();
