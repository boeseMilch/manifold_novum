// Pressure Hull (ch. 7): deep and sparse; a sonar ping, a heartbeat, half-time drums, a cello. B minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
//
// The arc of this one: dread that turns into defiance. It opens on the sonar and the heartbeat alone, the hull
// groaning somewhere far off; the build bars squeeze the hull (a rising groan, creaks speeding up, one creak alone in
// the beat of silence); every drop lands on a deep sub hit and a metal impact with the hull groaning down. The
// breakdown strips it back to sonar, heartbeat and cello; at the climax the cello plays the theme in octaves.
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, inRange, stepDur, hash, taiko, snare, hat, LEAD_VEL } = K;
  // A sonar ping: a clean sine with a slight downward glide and a faint glassy partial, into the echo; it moves
  // from side to side (the answer comes from the other side).
  function sonar(m, t, vel, p) {
    const f = hz(m), o = osc('sine', f, t, t + 2.5), o2 = osc('sine', f * 2.01, t, t + 1), g = K.ac.createGain(), g2 = K.ac.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.985, t + 1.5);
    o.connect(g); o2.connect(g2); g2.connect(g); env(g2, t, 0.003, 0.25, 0, 0.12);
    env(g, t, 0.004, vel, 0.05, 0.45); route(pan(g, p), true, true);
  }
  // A heartbeat: lub-dub.
  function heart(t, vel) {
    for (const [d, v] of [[0, 1], [0.2, 0.6]]) {
      const o = osc('sine', 75, t + d, t + d + 0.5), g = K.ac.createGain();
      o.frequency.setValueAtTime(75, t + d); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.14);
      o.connect(g); env(g, t + d, 0.004, vel * v, 0.01, 0.07); route(g, true, false);
    }
  }
  // The hull groaning: noise through two narrow, inharmonic resonances and a moan, all sliding from f0 to f1 (kept
  // above the bass, where the bass and drums already sit: the groan is metal, not boom).
  function groan(t, dur, vel, f0, f1, p) {
    const end = t + dur * 1.3, n = noiseSrc(t, end), m = osc('sawtooth', f0, t, end), g = K.ac.createGain();
    const b1 = filt('bandpass', f0, 9), b2 = filt('bandpass', f0 * 2.3, 12);
    for (const [b, k] of [[b1, 1], [b2, 2.3]]) { b.frequency.setValueAtTime(f0 * k, t); b.frequency.exponentialRampToValueAtTime(f1 * k, t + dur); }
    m.frequency.setValueAtTime(f0, t); m.frequency.exponentialRampToValueAtTime(f1, t + dur);
    n.connect(b1); n.connect(b2); m.connect(b1); b1.connect(g); b2.connect(g);
    env(g, t, dur * 0.35, vel, dur * 0.25, dur * 0.12); route(pan(g, p), true, false);
  }
  // A metal creak: stick-slip, a slow square (the slips speeding up) ringing two narrow metal resonances.
  function creak(t, vel, f, p, dur = 0.35) {
    const o = osc('square', 14, t, t + dur + 0.3), g = K.ac.createGain(), b1 = filt('bandpass', f, 16), b2 = filt('bandpass', f * 1.53, 20);
    o.frequency.setValueAtTime(12 + 6 * hash(Math.round(t * 100)), t); o.frequency.linearRampToValueAtTime(34, t + dur);
    o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g);
    env(g, t, 0.03, vel, dur * 0.6, dur * 0.12); route(pan(g, p), true, false);
  }
  // A clank on the backbeat: a short, struck piece of hull plating.
  function clank(t, vel, p) {
    const n = noiseSrc(t, t + 0.3), g = K.ac.createGain(), b1 = filt('bandpass', 2300, 6), b2 = filt('bandpass', 3650, 8);
    n.connect(b1); n.connect(b2); b1.connect(g); b2.connect(g);
    env(g, t, 0.001, vel, 0.005, 0.045); route(pan(g, p), true, false);
  }
  // The sub hit on a drop: the tonic falling an octave into the deep, with a little edge so small speakers hear it.
  function subHit(t, vel) {
    const f = hz(inRange(K.song.tonic, 31)), end = t + 3, o = osc('sine', f, t, end), e = osc('triangle', f * 2, t, end), lp = filt('lowpass', 260, 1);
    const g = K.ac.createGain(), ge = K.ac.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 1.6);
    e.frequency.setValueAtTime(f * 2, t); e.frequency.exponentialRampToValueAtTime(f, t + 1.6);
    o.connect(g); e.connect(lp); lp.connect(ge); ge.connect(g); env(ge, t, 0.004, 0.5, 0.05, 0.2);
    env(g, t, 0.006, vel, 0.15, 0.45); route(g, false, false);
  }
  // The ostinato: a struck pipe somewhere in the hull (a soft triangle and its inharmonic ring), left and right.
  function pipe(m, t, vel, st, p) {
    const f = hz(m), o = osc('triangle', f, t, t + 0.9), r = osc('sine', f * 2.76, t, t + 0.4), lp = filt('lowpass', 900 + 260 * st, 0.7);
    const g = K.ac.createGain(), gr = K.ac.createGain();
    o.connect(lp); lp.connect(g); r.connect(gr); gr.connect(g); env(gr, t, 0.002, 0.3, 0, 0.05);
    env(g, t, 0.003, vel, 0.02, 0.14); route(pan(g, p), true, true);
  }

  music.define({ name: 'hull', title: 'Pressure Hull', bpm: 84, key: 'B', missions: ['c7'],
    mood: 'deep and sparse: a sonar ping, a heartbeat, the hull groaning, half-time drums, a cello',
    lead: 'cello', ostInst: 'pipe', drums: 'half', bassStyle: 'half',
    parts: { sonar: [0, 4], heart: [0, 2], drone: [1, 4], pad: 2, ost: 2, ost16: 5, drums: 3, bass: 3, hats: 4, theme: 4, brass: 5, stabs: 6, strings: 6 },
    A: { chords: 'Bm Bm G G Em Em F# F#', theme: [
      'B3 _ _ _ _ _ F#4 _', 'D4 _ _ _ _ _ C#4 _', 'B3 _ _ _ D4 _ G4 _', 'G4 _ _ _ D4 _ _ _',
      'E4 _ _ G4 _ _ B4 _', 'B4 _ G4 _ E4 _ _ _', 'F#4 _ _ _ A#4 _ C#5 _', 'A#4 _ _ _ _ _ . .'] },
    B: { chords: 'G A Bm Bm G A F# F#', theme: [
      'D5 _ _ _ B4 _ _ _', 'C#5 _ _ _ E5 _ _ _', 'F#5 _ _ _ _ _ D5 _', 'B4 _ _ _ _ _ . .',
      'G5 _ _ _ D5 _ B4 _', 'A4 _ _ C#5 _ _ E5 _', 'F#5 _ _ _ C#5 _ A#4 _', 'F#4 _ _ _ _ _ . .'] },
    spool: 'G A', end: 'B', ost: '0 . 0 . 1 . 0 . 0 . 0 . 3 . 1 .',
    hooks: {
      bar({ t, b, bi, st, bd, has, drop, build, bk, spool }) {
        const side = bi % 2 ? 0.7 : -0.7;
        if (has('sonar')) sonar(inRange(K.song.tonic, 81) - (bi % 2 ? 5 : 0), t, bi % 2 ? 0.1 : 0.15, side);   // ping (and a fourth lower, its answer)
        if (drop) {                                       // the drop: a sub hit, plating struck, the hull groaning down
          subHit(t, 0.35); clank(t, 0.5, 0); creak(t + 0.05, 0.5, 1500, -0.7, 0.5);
          groan(t, bd * 1.5, 1.5, 900, 260, -0.75); groan(t + bd * 0.1, bd * 1.4, 1.2, 640, 190, 0.75);
        } else if (build) {                               // the build: the pressure rises, the creaks speed up ...
          groan(t, bd * 0.7, 1.4, 220, 1100, 0);
          [0.3, 0.48, 0.6, 0.68].forEach((k, i) => creak(t + bd * k, 0.18 + 0.08 * i, 1300 + 260 * i, i % 2 ? 0.7 : -0.7, 0.22));
          creak(t + bd * 0.84, 0.32, 2100, 0.3, 0.3);     // ... and one creak, alone in the beat of silence
        } else if (bk === 0) groan(t, bd * 2.5, 1.5, 700, 200, -0.5);   // the breakdown opens: a long groan into the deep
        else if (!spool && st <= 3 && bk < 0 && bi % 4 === 2) groan(t, bd * 2, st <= 1 ? 0.8 : 0.9, 520, 290, hash(b) < 0.5 ? -0.8 : 0.8);   // far off
        if (!drop && !build && !spool && (st <= 2 || bk >= 0) && hash(b * 7 + 3) < 0.4) creak(t + bd * (0.4 + 0.3 * hash(b)), 0.12, 1100 + 900 * hash(b + 1), -side, 0.4);
        if (!drop && !build && !spool && st >= 5 && bk < 0 && bi % 2 === 1) creak(t + bd * 0.62, 0.16, 1700 + 500 * hash(b), side, 0.3);
        if (spool && (b % 2 === 1)) groan(t, bd * 0.95, 1.1, 300, 900, -side);   // the spool: the hull strains with the drive
      },
      step({ s, t, st, has }) { if (has('heart') && (s === 0 || (s === 8 && st >= 1))) heart(t, 0.36); },
      ost(m, t, a, st) { pipe(m, t, (st >= 3 ? 0.14 : 0.16) * a, st, hash(Math.round(t * 50)) < 0.5 ? -0.75 : 0.75); },
      theme(x, n, at, len) {                             // the climax: the cello in octaves, defiant
        if (x.st >= 6 && x.bk < 0 && x.has('theme')) x.notes.push(K.lead(n.midi - 12, at, len, LEAD_VEL.cello * 0.75, 'cello'));
      },
      drums({ s, st, t, has, lv }) {                     // half time; full time from stage 5; plating clanks on the backbeat
        const d = has('drums') ? lv('drums') : -1, full = st >= 5;
        if (d >= 0 && (full ? [0, 6, 10] : [0]).includes(s)) taiko(t, 0.6, 0.9);
        if (d >= 0 && (full ? [4, 12] : [8]).includes(s)) { snare(t, full ? 0.25 : 0.3); if (st >= 4) clank(t, full ? 0.16 : 0.12, s === 4 ? -0.35 : 0.35); }
        if (has('hats') && s % (full ? 2 : 4) === 0) hat(t, s % 8 === 4 ? 0.06 : 0.035, s === 12 && !full);
        if (st >= 6 && s === 15) snare(t, 0.08);
        if (st >= 6 && s === 14) clank(t, 0.09, 0.6);
      },
      finale({ T, c, sd }) {                             // a last ping, a last heartbeat, the hull settling
        sonar(inRange(c.root, 81), T + sd * 8, 0.15, 0); heart(T + sd * 16, 0.4); groan(T + sd * 4, sd * 24, 0.8, 420, 260, 0.4);
      },
    },
  });
})();
