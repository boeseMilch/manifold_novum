// Red Comet Gallop (ch. 4, pirate cove): a rowdy pirate jig in 6/8, A minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
//
// The jig: stomp on the two big beats (steps 0 and 6 of the 12 16ths), claps and the accordion's "chick-chick" on
// the 8ths between, a tambourine on every 8th. The crew shouts "HEY!" on the drops; a fiddle saws a counter-line
// under the hook (B) and over everything at the climax; the breakdown is the accordion calling and the crew
// answering with stomps and claps; the climax is the boarding party charging: galloping toms and snare, stomps,
// a shout at the end of every half phrase.
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, stepDur, taiko, kick, snare, clap, hat, tom } = K;
  // An accordion pump: the chord on square-wave reed pairs, a few cents apart (the musette beating).
  function accordion(voice, t, len, vel, p = 0.2) {
    const lp = filt('lowpass', 2000, 0.7), g = K.ac.createGain(), end = t + len + 0.3;
    for (const m of voice.slice(2)) for (const d of [-11, 11]) osc('square', hz(m), t, end, d).connect(lp);   // (the top two notes)
    env(g, t, 0.02, vel, Math.max(0, len - 0.02), 0.05); lp.connect(g); route(pan(g, p), true, false);
  }
  // A big crew stomp on the deck boards: a deep skin, a board thud, and a second foot a hair late.
  function stomp(t, vel) {
    taiko(t, vel, 0.75); kick(t + 0.004, vel * 0.35); taiko(t + 0.013, vel * 0.45, 0.95);
  }
  // The crew shouting: a handful of voices, each a glottal saw and a breath of noise through three vowel
  // formants gliding (HEY: e → i; HO: o), a breathy "h" first, the voices a little apart in time, pitch and pan.
  const VOWEL = { hey: [[600, 1900, 2600], [380, 2250, 2950]], ho: [[560, 950, 2450], [470, 820, 2400]] };
  const CREW = [[118, -0.55], [205, 0.5], [142, 0.15], [176, -0.25], [128, 0.75], [230, -0.75]];
  function shout(t, vel, n = 4, vowel = 'hey') {
    const [a, b] = VOWEL[vowel];
    for (let i = 0; i < n; i++) {
      const [f0, p] = CREW[i % CREW.length], t0 = t - 0.03 + i * 0.009 + (i % 2) * 0.006, end = t0 + 0.6;
      const v = osc('sawtooth', f0, t0, end), nz = noiseSrc(t0, end), vg = K.gain(), ng = K.gain(), mix = K.ac.createGain(), g = K.ac.createGain();   // (K.gain: an enveloped gain created at 0)
      v.frequency.setValueAtTime(f0 * 0.92, t0); v.frequency.linearRampToValueAtTime(f0 * 1.1, t0 + 0.08); v.frequency.exponentialRampToValueAtTime(f0 * 0.8, t0 + 0.32);
      vg.gain.setValueAtTime(0, t0); vg.gain.setValueAtTime(0, t0 + 0.025); vg.gain.linearRampToValueAtTime(1.5, t0 + 0.06); vg.gain.setTargetAtTime(0, t0 + 0.2, 0.05);
      ng.gain.setValueAtTime(0, t0); ng.gain.linearRampToValueAtTime(1.2, t0 + 0.01); ng.gain.linearRampToValueAtTime(0.2, t0 + 0.07); ng.gain.setTargetAtTime(0, t0 + 0.2, 0.05);
      v.connect(vg); nz.connect(ng); vg.connect(mix); ng.connect(mix);
      for (let k = 0; k < 3; k++) {                      // the formants, gliding through the vowel
        const bp = filt('bandpass', a[k], [6, 9, 10][k]);
        bp.frequency.setValueAtTime(a[k], t0 + 0.05); bp.frequency.linearRampToValueAtTime(b[k], t0 + 0.24);
        mix.connect(bp); bp.connect(g);
      }
      env(g, t0, 0.005, vel * (i < 2 ? 1 : 0.8), 0.22, 0.06);
      route(pan(g, p), true, false);
    }
  }
  // The fiddle: two saws a few cents apart, a late vibrato, a bowed swell, a bright body.
  function fiddle(m, t, len, vel, p) {
    const f = hz(m), end = t + len + 0.4, lp = filt('lowpass', 4200, 0.9), body = filt('peaking', 2700, 1.5), g = K.ac.createGain();
    body.gain.value = 6;
    const os = [osc('sawtooth', f, t, end, -4), osc('sawtooth', f, t, end, 4)], lfo = osc('sine', 6.2, t, end), lg = K.ac.createGain();
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, len)); lfo.connect(lg);
    for (const o of os) { lg.connect(o.frequency); o.connect(lp); }
    lp.connect(body); body.connect(g);
    env(g, t, 0.025, vel, Math.max(0, len - 0.025), 0.06);
    route(pan(g, p), true, true);
  }
  // The fiddle's counter-lines, one 8th per slot: under the hook (B), sawing below the theme and leaping above it
  // where the theme sinks; at the climax over the verse (A) too, high. Chord tones on the strong 8ths.
  const FID_B = ['A4 B4 C5 E5 D5 C5', 'F4 G4 A4 C5 A4 F4', 'E4 G4 C5 E5 D5 C5', 'G5 A5 B5 D6 B5 G5',
    'A4 E4 A4 C5 B4 A4', 'F4 A4 C5 F5 E5 C5', 'E4 G#4 B4 E5 D5 B4', 'B4 E5 G#5 B5 G#5 E5'];
  const FID_A = ['C6 B5 A5 E5 A5 C6', 'E6 D6 C6 A5 B5 C6', 'B5 A5 G5 D5 G5 B5', 'D6 C6 B5 G5 A5 B5',
    'A5 G5 F5 C5 F5 A5', 'C6 A5 F5 A5 C6 A5', 'B5 A5 G#5 E5 G#5 B5', 'E6 D6 B5 G#5 B5 D6'];
  const PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (s) => { const m = /^([A-G])(#?)(\d)$/.exec(s); return 12 * (+m[3] + 1) + PCN[m[1]] + (m[2] ? 1 : 0); };
  const lines = (a) => a.map(b => b.split(' ').map(midi));
  const FB = lines(FID_B), FA = lines(FID_A);

  let cur = null;                                         // this bar (from the bar hook): the breakdown bar, the stage
  const RESP = [0, 2, 6, 8];                              // the crew's answer: STOMP stomp CLAP, STOMP stomp CLAP

  music.define({ name: 'comet', title: 'Red Comet Gallop', bpm: 126, key: 'A', missions: ['c4', 'pirates'], meter: 12,
    mood: 'a rowdy pirate jig in 6/8: stomps and claps, an accordion, a fiddle, the crew shouting',
    lead: 'reed', ostInst: 'pluck', drums: 'stomp',
    parts: { drums: 0, accordion: 0, bass: 1, ost: 2, ost16: 4, hats: 2, taiko: 3, pad: 3, theme: 4, fiddle: 4, snare: 4, brass: 5, stabs: 6, strings: 6 },
    A: { chords: 'Am Am G G F F E E', theme: [
      'A4 _ C5 E5 _ C5', 'A5 _ G5 E5 _ C5', 'D5 _ B4 G4 _ B4', 'D5 _ _ _ _ .',
      'C5 _ A4 F4 _ A4', 'C5 _ F5 A5 _ F5', 'G#5 _ E5 B4 _ G#4', 'E5 _ _ _ _ .'] },
    B: { chords: 'Am F C G Am F E E', theme: [
      'E5 _ _ A5 _ _', 'A5 _ G5 F5 _ C5', 'G5 _ E5 C5 _ E5', 'D5 _ _ B4 _ G4',
      'C5 _ E5 A5 _ G5', 'A5 _ _ C6 _ A5', 'B5 _ G#5 E5 _ B4', 'E5 _ _ _ _ .'] },
    spool: 'F G', end: 'A', ost: '0 . 2 1 1 . 0 . 2 3 1 .',
    hooks: {
      bar(x) {
        cur = x;
        const { t, st, bi, drop, build, has, e8, spool, bk } = x, B = Math.floor(x.b / 8) % 2 === 1;
        // the crew: HEY! on every drop (twice into the climax), HO! on the build bar before the beat of silence,
        // and at the climax a HEY! closing every half phrase
        if (drop) { shout(t, st >= 6 ? 0.5 : 0.4, st >= 6 ? 6 : 4); if (st >= 6) shout(t + e8 * 3, 0.42, 6); }
        if (build && st >= 3) shout(t + e8 * 3, 0.3, 4, 'ho');
        if (st === 6 && !spool && bk < 0 && (bi === 3 || bi === 7)) shout(t + e8 * 3, 0.36, 5);
        // the fiddle: a counter-line under the hook from the theme's entrance, both sections at the climax
        if (has('fiddle') && !spool && (bk < 0 || bk >= 6) && (B || st >= 6)) {
          const line = B ? FB[bi].map(m => (st >= 6 && bi !== 3 ? m + 12 : m)) : FA[bi];
          line.forEach((m, i) => fiddle(m, t + i * e8, e8 * (i % 3 === 0 ? 1.05 : 0.8), (st >= 6 ? 0.036 : 0.042) * (i % 3 === 0 ? 1 : 0.8), 0.6));
        }
      },
      step({ s, t, voice, st, has }) {
        const bk = cur ? cur.bk : -1, sd = stepDur();
        if (bk >= 0 && bk < 6) {                          // the breakdown: the accordion calls, the crew answers
          const call = bk < 4 ? bk % 2 === 0 : s < 6;     // (bar by bar, then half bar by half bar)
          if (call && has('accordion') && [0, 2, 4, 6, 8, 10].includes(s) && (bk < 4 || s < 6)) accordion(voice, t, sd * (s % 6 === 4 ? 2.5 : 1.4), s % 6 === 0 ? 0.07 : 0.05, s % 4 === 0 ? -0.35 : 0.35);
          if (!call || (bk >= 4 && s >= 6)) {
            if (RESP.includes(s % 12) || (bk >= 4 && s === 8)) stomp(t, s % 6 === 0 ? 0.55 : 0.4);
            if (s === 4 || s === 10) { clap(t, 0.26); clap(t + 0.012, 0.18); }   // (a crowd of claps)
            if (bk === 3 && s === 11) clap(t, 0.2);
          }
          return;
        }
        if (has('accordion')) {                           // pumps: on the beats alone; once the bass is in, the "chick-chick"
          const on = has('bass') ? [2, 4, 8, 10] : [0, 6];
          if (on.includes(s)) accordion(voice, t, sd * (has('bass') ? 1.3 : 2.4), st <= 1 ? 0.04 : st >= 5 ? 0.06 : 0.055, has('bass') ? (s % 6 === 2 ? -0.45 : 0.45) : 0.2);   // (chick left, chick right)
        }
      },
      drums({ s, st, t, has, lv }) {                      // 6/8: STOMP . . . clap . STOMP . . . clap .
        const d = has('drums') ? lv('drums') : -1, charge = st >= 6;
        if (d >= 0 && (s === 0 || s === 6)) { if (d >= 2) stomp(t, charge ? 0.5 : 0.45); else taiko(t, 0.33, 0.75); }
        if (d >= 0 && (s === 4 || s === 10)) clap(t, d >= 2 ? 0.22 : 0.14);
        if (has('hats')) {                               // the tambourine: 8ths, then a shake rolling into every beat
          if (s % 2 === 0) hat(t, s % 6 === 0 ? 0.08 : 0.05, false, 'jingle');
          else if (lv('hats') >= 3 && s % 6 === 5) hat(t, 0.06, true, 'jingle');
        }
        if (has('taiko') && !charge && (lv('taiko') >= 2 ? [0, 4, 6, 10] : [0, 6]).includes(s)) taiko(t, s % 6 === 0 ? 0.42 : 0.3, s % 6 === 0 ? 1 : 1.2);
        if (charge) {                                     // the boarding party charging: galloping toms and a snare
          if (s % 6 === 2 || s % 6 === 3) tom(t, s % 6 === 2 ? 0.3 : 0.24, s < 6 ? 170 : 130, true);   // (ta-ta-DUM)
          if (s % 2 === 0) snare(t, s % 6 === 4 ? 0.2 : 0.05);
          if (s === 11) snare(t, 0.12);
        } else if (has('snare') && s === 6) snare(t, 0.22);
      },
      endFill({ s, t }) { if (s % 2 === 0) clap(t, 0.2); if (s % 6 === 0) stomp(t, 0.4); },   // (claps and stomps in the fill before the final hit)
      finale({ T, v, sd }) { accordion(v, T, 1.8, 0.06); shout(T, 0.5, 6); stomp(T + sd * 6, 0.5); clap(T + sd * 6, 0.25); },   // HEY! and a last stomp-clap
    },
  });
})();
