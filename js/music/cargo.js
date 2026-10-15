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
  // struck and settling. kind: 'note'; 'pop' (the slapped octave on the 4: brighter, snappier, a hair sharper);
  // 'ghost' (a dead note: a pitchless thump of muted strings); 'pull' (the truck pulling out: the note slides up a
  // fourth into the root, growling, with the sub octave under it); 'rev' (the engine revving, sliding up an octave).
  function playWalk(m, t, len, vel, kind = 'note', bright = 0) {
    if (kind === 'ghost') {                              // the dead note: the fingers slapping muted strings (no pitch)
      const n = noiseSrc(t, t + 0.2), lp = filt('lowpass', 260, 1.2), g = K.ac.createGain();
      n.connect(lp); lp.connect(g); env(g, t, 0.003, vel * 2.2, 0.005, 0.018); route(g, false, false); return;
    }
    const f = hz(m), g = K.ac.createGain(), pop = kind === 'pop', ghost = kind === 'ghost', pull = kind === 'pull', rev = kind === 'rev';
    const lp = filt('lowpass', 0, pop ? 2.4 : pull || rev ? 3 : 1.6), end = t + len + 0.35, os = [osc('triangle', f, t, end), osc('sawtooth', f, t, end, 4)];
    if (!ghost) os.push(osc('sawtooth', f, t, end, -4));
    for (const o of os) {
      if (pull) { o.frequency.setValueAtTime(f * 0.75, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.22); }
      else if (rev) { o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 2, t + len); }
      else { o.frequency.setValueAtTime(f * (pop ? 1.012 : 1.005), t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03); }
    }
    os[0].connect(g); os.slice(1).forEach(o => o.connect(lp));
    const top = ghost ? 380 : pop ? 3400 : pull || rev ? 900 + 1800 * bright : 2000 + 600 * bright;
    lp.frequency.setValueAtTime(top, t);
    if (rev) lp.frequency.exponentialRampToValueAtTime(top * 2.5, t + len);
    else lp.frequency.setTargetAtTime(Math.max(300, f * (pop ? 3.5 : 3)), t + 0.006, ghost ? 0.02 : pop ? 0.05 : pull ? 0.25 : 0.07);
    const a = ghost ? 0.003 : 0.006;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + a);
    g.gain.setTargetAtTime(vel * (ghost ? 0 : 0.5), t + a, ghost ? 0.03 : pop ? 0.09 : rev ? 0.5 : 0.17);
    g.gain.setTargetAtTime(0, t + len, ghost ? 0.02 : 0.035);
    lp.connect(g); route(g, false, false);
    if (pull) {                                          // the sub octave under the pull: the diesel's weight
      const sg = K.ac.createGain(), so = osc('sine', f / 2, t, end);
      so.frequency.setValueAtTime(f * 0.375, t); so.frequency.exponentialRampToValueAtTime(f / 2, t + 0.22);
      so.connect(sg); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(vel * 0.9, t + 0.02);
      sg.gain.setTargetAtTime(vel * 0.5, t + 0.02, 0.3); sg.gain.setTargetAtTime(0, t + len, 0.05); route(sg, false, false);
    }
  }
  // The truck's air brakes letting go: a hiss of high noise, in the beat of silence before the drop.
  function airBrake(t, vel) {
    const n = noiseSrc(t, t + 0.9), hp = filt('bandpass', 5200, 0.7), g = K.ac.createGain();
    hp.frequency.setValueAtTime(6500, t); hp.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
    n.connect(hp); hp.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.012); g.gain.setTargetAtTime(vel * 0.35, t + 0.012, 0.06);
    g.gain.setTargetAtTime(0, t + 0.3, 0.07); route(pan(g, 0.3), true, false);
  }
  const inKey = (pc) => [0, 2, 3, 5, 7, 8, 10, 11].includes((pc - K.song.tonic + 24) % 12);   // (natural minor and its leading tone)
  let cur = null;                                         // this bar, from hooks.bar (the cadence bar has none)
  const roots = {};                                       // bar → the root note the walk planned to land on there
  const nextChord = (x, c) => x.spool ? K.song.spool.find(ch => ch.name !== c.name) : x.bi < 7 ? x.sec.chords[x.bi + 1] : (x.sec === K.song.A ? K.song.B : K.song.A).chords[0];
  // The next bar's root: the octave of its chord's root nearest to where this bar's riff ends (its fifth), between C2
  // and E3 and leaning low, so the riff steps into the next chord (B2 → C3, G2 → A2, ...) instead of jumping.
  const nearRoot = (pc, from) => { const lo = inRange(pc, 36); return lo + 12 < 53 && Math.abs(lo + 12 - from) + 3 < Math.abs(lo - from) ? lo + 12 : lo; };
  // The riff, the same in every bar (a boogie repeats; a line that changes from bar to bar sounded like wrong notes):
  // in 8ths over the root, root, third, fifth, sixth, seventh, sixth, the octave slapped on the 4, the fifth; a dead
  // note on the swung 16th before the slap. Where the minor seventh is out of the key (on C) it rocks 5-6 instead.
  function walkLine(c, next) {
    const sev = inKey(c.root + 10) ? 10 : 7;
    return { iv: [0, c.third, 7, 9, sev, 9, 12, 7], pop: 6, ghost: 11, to: next && next.name };
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
        // the walking boogie bass: swung 8ths, accents on 1 and 3, the octave slapped on the 4, a dead note before it
        if (has('walk') && !late) {
          const here = cur && cur.b === x.b ? cur : null, v0 = st <= 1 ? 0.08 : 0.066, sd = stepDur();
          const base = roots[x.b] !== undefined && roots[x.b] % 12 === c.root ? roots[x.b] : inRange(c.root, 38);
          const next = here && nextChord(here, c), nb = next ? nearRoot(next.root, base + 7) : null;
          if (next && s === 0) { roots[x.b + 1] = nb; delete roots[x.b - 4]; }
          const log = K.song.walkLog, walkBass = (m, t2, len, vel, kind = 'note', br) => {   // (tests/music.js reads walkLog)
            if (log) log.push({ b: x.b, s, c: c.name, m, kind, to: L && L.to, t: t2, len });
            playWalk(m, t2, len, vel, kind, br);
          };
          let L = null;
          if (here && here.build) {                       // the build bar: the engine revs (root 8ths, swelling), winds up
            if (s % 2 === 0 && s < 12) walkBass(base, t, s === 10 ? sd * 1.65 : sd * 1.1, v0 * (0.75 + s * 0.04), s === 10 ? 'rev' : 'note', s / 10);
            if (s === 10) airBrake(t + sd * 2 - swing(10) + 0.02, 0.08);
          } else {
            L = walkLine(c, next);
            if (s % 2 === 0 && !(here && here.drop && s === 2)) {   // (the pull rings through the 2nd 8th)
              const i = s / 2, pop = i === L.pop, pull = here && here.drop && s === 0, acc = s % 8 === 0 ? 1 : s % 4 === 0 ? 0.9 : 0.78;
              const len = sd * (s + 1 === L.ghost ? 0.9 : s % 4 === 0 ? 1.75 : 1.4);
              walkBass(base + L.iv[i], t, pull ? sd * 3.6 : len, v0 * (pull ? 1.25 : pop ? 1.05 : acc), pull ? 'pull' : pop ? 'pop' : 'note');
            } else if (s === L.ghost) walkBass(base, t, sd * 0.4, v0 * 0.45, 'ghost');
          }
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
      bar(x) { cur = x; },
      finale({ T, c, v }) {                               // a last strum, the walk's root, the shaker
        v.forEach((m, i) => pluck(m, T + i * 0.025, 0.05, 0.6, (i - 1.5) * 0.25));
        playWalk(inRange(c.root, 38), T, 1.8, 0.08, 'pull'); hat(T, 0.06, false, 'shaker');
      },
    },
  });
})();
