// Cargo Run (ch. 1-3, black box): a hauler's swung shuffle in E minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
(() => {
  const K = music.kit;
  const { hz, swing, osc, filt, noiseSrc, pan, route, env, inRange, bassRoot, stepDur, hash, pluck, lead, bass, taiko, kick, snare, clap, hat, tom, LEAD_VEL } = K;
  // The walking bass (Cargo Run): a fingered upright, warm and round. A triangle body, two saws a few cents apart through a
  // lowpass that closes right after the finger's attack (the "thump"), the pitch a few cents sharp as the string is
  // struck and settling. kind: 'note'; 'pull' (the truck pulling out: the note slides up a fourth into the root,
  // growling, with the sub octave under it); 'rev' (the engine revving, sliding up an octave).
  // Every gain starts at 0 (silent0) before anything is scheduled: a new gain is 1 until its first event, and in real
  // time an oscillator starting a fraction of a sample before that event let one sample through at full level (a
  // click on every note; offline renders, on whole samples, never showed it).
  const silent0 = () => { const g = K.ac.createGain(); g.gain.value = 0; return g; };
  function playWalk(m, t, len, vel, kind = 'note', bright = 0) {
    const f = hz(m), g = silent0(), pull = kind === 'pull', rev = kind === 'rev';
    const lp = filt('lowpass', 0, pull || rev ? 3 : 1.6), end = t + len + 0.35;
    const os = [osc('triangle', f, t, end), osc('sawtooth', f, t, end, 4), osc('sawtooth', f, t, end, -4)];
    for (const o of os) {
      if (pull) { o.frequency.setValueAtTime(f * 0.75, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.22); }
      else if (rev) { o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2, t + len); }
      else { o.frequency.setValueAtTime(f * 1.005, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03); }
    }
    os[0].connect(g); os.slice(1).forEach(o => o.connect(lp));
    const top = pull || rev ? 900 + 1800 * bright : 2000 + 600 * bright;
    lp.frequency.setValueAtTime(top, t);
    if (rev) lp.frequency.exponentialRampToValueAtTime(top * 2.5, t + len);
    else lp.frequency.setTargetAtTime(Math.max(300, f * 3), t + 0.006, pull ? 0.25 : 0.07);
    const a = 0.006;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + a);
    g.gain.setTargetAtTime(vel * 0.5, t + a, rev ? 0.5 : 0.17);
    g.gain.setTargetAtTime(0, t + len, 0.035);
    lp.connect(g); route(g, false, false);
    if (pull) {                                          // the sub octave under the pull: the diesel's weight
      const sg = silent0(), so = osc('sine', f / 2, t, end);
      so.frequency.setValueAtTime(f * 0.375, t); so.frequency.exponentialRampToValueAtTime(f / 2, t + 0.22);
      so.connect(sg); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(vel * 0.9, t + 0.02);
      sg.gain.setTargetAtTime(vel * 0.5, t + 0.02, 0.3); sg.gain.setTargetAtTime(0, t + len, 0.05); route(sg, false, false);
    }
  }
  // The shaker: a short burst of band-passed noise (the engine's hat(t, vel, false, 'shaker'), but on a gain that
  // starts at 0: the engine's clicked once per stroke in real time, see silent0).
  function shaker(t, vel) {
    const n = noiseSrc(t, t + 0.2), bp = filt('bandpass', 5200, 1.2), g = silent0();
    n.connect(bp); bp.connect(g); env(g, t, 0.012, vel, 0, 0.03); route(pan(g, -0.3), false, false);
  }
  // The truck's air brakes letting go: a hiss of high noise, in the beat of silence before the drop.
  function airBrake(t, vel) {
    const n = noiseSrc(t, t + 0.9), hp = filt('bandpass', 5200, 0.7), g = silent0();
    hp.frequency.setValueAtTime(6500, t); hp.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
    n.connect(hp); hp.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.012); g.gain.setTargetAtTime(vel * 0.35, t + 0.012, 0.06);
    g.gain.setTargetAtTime(0, t + 0.3, 0.07); route(pan(g, 0.3), true, false);
  }
  // The line, written out (one swung 8th per slot, like the theme): one walking melody over each 8-bar section, in E
  // natural minor (D# only over B), chord tones on beats 1 and 3, moving by step or small chord-tone leaps, every bar
  // stepping into the next (a riff generated per chord sounded like wrong notes and broken bar lines).
  const LINE = {
    A: ['E2 F#2 G2 A2 B2 A2 G2 F#2', 'E2 G2 B2 D3 E3 D3 B2 D3', 'C3 B2 A2 G2 E2 G2 A2 B2', 'C3 E3 G3 E3 C3 B2 A2 G2',      // Em Em C C
        'A2 B2 C3 D3 E3 D3 C3 B2', 'A2 G2 E2 G2 A2 B2 C3 A2', 'B2 D#3 F#3 A3 B3 A3 F#3 D#3', 'B2 A2 F#2 D#2 F#2 G2 A2 B2'],   // Am Am B B
    B: ['C3 B2 A2 G2 E2 G2 C3 E3', 'D3 C3 B2 A2 F#2 A2 G2 F#2', 'E2 F#2 G2 A2 B2 A2 C3 D3', 'E3 D3 B2 G2 E2 F#2 G2 B2',     // C D Em Em
        'C3 D3 E3 G3 E3 D3 C3 E3', 'D3 F#3 A3 F#3 D3 C3 B2 A2', 'B2 D#3 F#3 A3 B3 A3 F#3 D#3', 'B2 A2 F#2 D#2 F#2 A2 F#2 D#2'],  // C D B B
  };
  const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (n) => { const m = /^([A-G])(#?)(\d)$/.exec(n); return 12 * (+m[3] + 1) + PCS[m[1]] + (m[2] ? 1 : 0); };
  const NOTES = { A: LINE.A.map(b => b.split(' ').map(midi)), B: LINE.B.map(b => b.split(' ').map(midi)) };
  let cur = null;                                         // this bar, from hooks.bar (the cadence bar has none)

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
        // the walking bass: the written line in swung 8ths, accents on 1 and 3
        if (has('walk') && !late) {
          const here = cur && cur.b === x.b ? cur : null, v0 = st <= 1 ? 0.08 : 0.066, sd = stepDur();
          const sec = here && !here.spool && here.sec.chords[here.bi].name === c.name ? (here.sec === K.song.A ? 'A' : 'B') : null;
          const root = inRange(c.root, 38), i = s / 2;
          const log = K.song.walkLog, walkBass = (m, t2, len, vel, kind = 'note', br) => {   // (tests/music.js reads walkLog)
            if (log) log.push({ b: x.b, s, c: c.name, m, kind, sec, bi: here && here.bi, t: t2, len });
            playWalk(m, t2, len, vel, kind, br);
          };
          if (here && here.build) {                       // the build bar: the engine revs (root 8ths, swelling), winds up
            if (s % 2 === 0 && s < 12) walkBass(root, t, s === 10 ? sd * 1.65 : sd * 1.1, v0 * (0.75 + s * 0.04), s === 10 ? 'rev' : 'note', s / 10);
            if (s === 10) airBrake(t + sd * 2 - swing(10) + 0.02, 0.08);
          } else if (s % 2 === 0 && !(here && here.drop && s === 2)) {   // (the pull rings through the 2nd 8th)
            const m = sec ? NOTES[sec][here.bi][i] : root + [0, 7, 12, 7][i % 4];   // (the cadence, the spool: root and fifth)
            const pull = here && here.drop && s === 0, acc = s % 8 === 0 ? 1 : s % 4 === 0 ? 0.9 : 0.78;
            walkBass(m, t, pull ? sd * 3.6 : sd * (s % 4 === 0 ? 1.75 : 1.4), v0 * (pull ? 1.25 : acc), pull ? 'pull' : 'note');
          }
        }
        // strummed chords
        if (has('strum') && (s === 0 || s === 6 || s === 10)) voice.forEach((m, i) => pluck(m, t + i * 0.022, 0.04, 0.6, (i - 1.5) * 0.25));
      },
      drums(x) {                                          // a swung backbeat kit with a shaker
        const { s, st, t, has, lv } = x, d = has('drums') ? lv('drums') : -1;
        if (d >= 0 && (d >= 2 ? [0, 6, 8, 10] : d >= 1 ? [0, 8, 10] : [0, 8]).includes(s)) kick(t, 0.5);
        if (d >= 0 && (s === 4 || s === 12)) snare(t, 0.2);
        if (has('hats') && s % 2 === 0) shaker(t, s % 4 === 2 ? 0.07 : 0.045);
        if (has('taiko') && (s === 0 || s === 10)) taiko(t, 0.5, 1);
        if (st >= 6 && s === 15) snare(t, 0.08);
      },
      bar(x) { cur = x; },
      finale({ T, c, v }) {                               // a last strum, the walk's root, the shaker
        v.forEach((m, i) => pluck(m, T + i * 0.025, 0.05, 0.6, (i - 1.5) * 0.25));
        playWalk(inRange(c.root, 38), T, 1.8, 0.08, 'pull'); shaker(T, 0.06);
      },
    },
  });
})();
