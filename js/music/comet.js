// Red Comet Gallop (ch. 4, pirate cove): a rowdy pirate jig in 6/8, A minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, inRange, bassRoot, stepDur, hash, pluck, lead, bass, taiko, kick, snare, clap, hat, tom, LEAD_VEL } = K;
  // An accordion pump: the chord on square-wave reed pairs, a few cents apart (the musette beating).
  function accordion(voice, t, len, vel) {
    const lp = filt('lowpass', 2000, 0.7), g = K.ac.createGain(), end = t + len + 0.3;
    for (const m of voice.slice(2)) for (const d of [-11, 11]) osc('square', hz(m), t, end, d).connect(lp);   // (the top two notes)
    env(g, t, 0.02, vel, Math.max(0, len - 0.02), 0.05); lp.connect(g); route(pan(g, 0.2), true, false);
  }

  music.define({ name: 'comet', title: 'Red Comet Gallop', bpm: 126, key: 'A', missions: ['c4', 'pirates'], meter: 12,
    mood: 'a rowdy pirate jig in 6/8: stomps, claps, an accordion, oom-pah bass',
    lead: 'reed', ostInst: 'pluck', drums: 'stomp',
    parts: { drums: 0, accordion: 0, bass: 1, ost: 2, ost16: 4, hats: 2, taiko: 3, pad: 3, theme: 4, snare: 4, brass: 5, stabs: 6, strings: 6 },
    A: { chords: 'Am Am G G F F E E', theme: [
      'A4 _ C5 E5 _ C5', 'A5 _ G5 E5 _ C5', 'D5 _ B4 G4 _ B4', 'D5 _ _ _ _ .',
      'C5 _ A4 F4 _ A4', 'C5 _ F5 A5 _ F5', 'G#5 _ E5 B4 _ G#4', 'E5 _ _ _ _ .'] },
    B: { chords: 'Am F C G Am F E E', theme: [
      'E5 _ _ A5 _ _', 'A5 _ G5 F5 _ C5', 'G5 _ E5 C5 _ E5', 'D5 _ _ B4 _ G4',
      'C5 _ E5 A5 _ G5', 'A5 _ _ C6 _ A5', 'B5 _ G#5 E5 _ B4', 'E5 _ _ _ _ .'] },
    spool: 'F G', end: 'A', ost: '0 . 2 1 1 . 0 . 2 3 1 .',
    hooks: {
      step({ s, t, voice, st, has }) {                    // accordion pumps: on the beats alone, then the "pah" off the bass's "oom"
        if (has('accordion')) {
          const on = has('bass') ? [3, 9] : [0, 6];
          if (on.includes(s)) accordion(voice, t, stepDur() * 2.4, st <= 1 ? 0.04 : 0.06);
        }
      },
      drums({ s, st, t, has, lv }) {                     // 6/8: STOMP . . clap . . STOMP . . clap
        const d = has('drums') ? lv('drums') : -1;
        if (d >= 0 && (s === 0 || s === 6)) taiko(t, d >= 2 ? 0.5 : 0.33, 0.75);
        if (d >= 0 && (s === 3 || s === 9)) clap(t, d >= 2 ? 0.22 : 0.14);
        if (has('hats') && (lv('hats') >= 3 || s % 2 === 0)) hat(t, s % 6 === 0 ? 0.08 : 0.05, false, 'jingle');
        if (has('taiko') && (lv('taiko') >= 2 ? [0, 4, 6, 8, 10] : [0, 6]).includes(s)) taiko(t, s % 6 === 0 ? 0.5 : 0.35, s % 6 === 0 ? 1 : 1.2);
        if (has('snare') && s === 6) snare(t, 0.25);
        if (st >= 6 && s === 11) snare(t, 0.1);
      },
      endFill({ s, t }) { if (s % 3 === 0) clap(t, 0.2); },   // (claps in the fill before the final hit)
      finale({ T, v, sd }) { accordion(v, T, 1.8, 0.05); taiko(T + sd * 6, 0.45, 0.75); clap(T + sd * 6, 0.25); },   // and a last stomp-clap
    },
  });
})();
