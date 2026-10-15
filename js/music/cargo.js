// Cargo Run (ch. 1-3, the black box: the first contracts of a scrappy hauler crew). A twangy baritone-guitar riff
// with a shaker opens it alone; strummed chords join, then a swaggering rock kit, and at the first drop the
// whistle-flute sings the theme over it. G minor, 102 bpm, a light swing.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
//
// The riff is written out bar by bar (RIFF below) as one line through each 8-bar section: chord tones on beats 1
// and 3, steps and small leaps, every bar leading into the next (each phrase ends on F#, the leading tone, that
// resolves to G). The breakdown strips it back to the riff, the shaker and the flute; the build bars end in a pick
// scrape and a beat of silence, the drops land on a kick, a crash and a power chord. Its own drums and transitions
// throughout (engineDrums: false); every note it plays is logged into walkLog when that is set (tests/music.js).
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, inRange, stepDur, kick, snare, clap, hat, tom, taiko, crash, boom, riser, brass } = K;

  // ---------------------------------------------------------------- the score: the riff, one string per bar, 8ths
  // (a note starts, '_' holds it, '.' rests), on the same chords as the theme.
  const RIFF = {
    A: ['G2 _ . G2 Bb2 _ C3 _', 'D3 _ . C3 Bb2 _ G2 _', 'Eb2 _ . Eb2 G2 _ Bb2 _', 'C3 _ . A2 F2 _ G2 A2',
      'G2 _ . G2 Bb2 _ C3 _', 'D3 _ . F3 D3 _ C3 Bb2', 'G2 _ . Bb2 Eb3 _ D3 C3', 'D3 _ . C3 A2 _ F#2 _'],
    B: ['G2 _ . C3 Eb3 _ D3 C3', 'C3 _ . Bb2 G2 _ Eb2 _', 'D2 _ . F2 G2 _ Bb2 _', 'D3 _ . C3 Bb2 _ A2 _',
      'G2 _ . Bb2 Eb3 _ Bb2 _', 'A2 _ . C3 F3 _ C3 _', 'Bb2 _ . D3 G3 _ F3 D3', 'D3 _ . C3 A2 _ F#2 _'],
    spool: { Eb: 'Bb2 G2 Eb2 G2 Bb2 G2 Eb2 G2', F: 'A2 F2 A2 C3 A2 F2 A2 C3' },          // the drive: straight 8ths
    cadence: { F: 'C3 _ . A2 F2 _ G2 A2', D: 'D3 _ . C3 A2 _ F#2 _', Eb: 'G2 _ . Bb2 Eb3 _ D3 C3' },   // into the final G
  };
  const PCN = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midi = (s) => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); return 12 * (+m[3] + 1) + PCN[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
  const parse = (str) => {
    const out = []; let open = null;
    str.trim().split(/\s+/).forEach((x, i) => {
      if (x === '_') { if (open) open.len++; } else if (x === '.') open = null;
      else { open = { slot: i, len: 1, m: midi(x) }; out.push(open); }
    });
    if (str.trim().split(/\s+/).length !== 8) throw new Error('cargo: a riff bar is 8 slots: ' + str);
    return out;
  };
  const R = { A: RIFF.A.map(parse), B: RIFF.B.map(parse), spool: {}, cadence: {} };
  for (const k of ['spool', 'cadence']) for (const [c, s] of Object.entries(RIFF[k])) R[k][c] = parse(s);

  // ---------------------------------------------------------------- instruments
  // The baritone twang: a saw and a sine through a lowpass that closes after the pick, each note scooping up into
  // its pitch from a few cents flat; a sine sub an octave down for weight. Every gain starts at 0.
  function twang(m, t, len, vel, sub, echo) {
    const f = hz(m), r = t + len, end = r + 0.4, lp = filt('lowpass', 0, 1.1), g = K.gain();
    for (const type of ['sawtooth', 'sine']) {
      const o = osc(type, f, t, end); o.frequency.setValueAtTime(f * 0.988, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.05); o.connect(lp);
    }
    lp.frequency.setValueAtTime(Math.min(4200, f * 20), t); lp.frequency.exponentialRampToValueAtTime(f * 3, t + 0.22);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.setTargetAtTime(vel * 0.45, t + 0.004, 0.2); g.gain.setTargetAtTime(0, r, 0.035);
    lp.connect(g); route(g, true, echo);
    if (sub) {
      const so = osc('sine', f / 2, t, end), sg = K.gain();
      sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(sub, t + 0.012); sg.gain.setTargetAtTime(sub * 0.75, t + 0.012, 0.3); sg.gain.setTargetAtTime(0, r, 0.04);
      so.connect(sg); route(sg, false, false);
    }
    return { g, at: t };
  }
  // A strummed guitar chord: the top five strings of a G-shape-ish voicing, one after another (down) or the top
  // four back (up), each its own pluck into one shared lowpass.
  function strum(c, t, vel, up, bright) {
    const r = inRange(c.root, 38);
    let v = [r + 7, r + 12, r + 12 + c.third, r + 19, r + 24];
    if (up) v = v.slice(1).reverse();
    const lp = filt('lowpass', 0, 0.8);
    lp.frequency.setValueAtTime(1300 + 2200 * bright, t); lp.frequency.exponentialRampToValueAtTime(800 + 500 * bright, t + 0.45);
    v.forEach((m, i) => {
      const at = t + i * (up ? 0.009 : 0.014), o = osc('sawtooth', hz(m), at, at + 1.7, i % 2 ? 4 : -4), g = K.gain();
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel, at + 0.003); g.gain.setTargetAtTime(0, at + 0.003, up ? 0.13 : 0.21);
      o.connect(g); g.connect(lp);
    });
    route(pan(lp, up ? 0.4 : -0.4), true, false);
  }
  // A pick scraped down the wound strings: band-passed noise falling, swelling.
  function scrape(t, dur, vel) {
    const n = noiseSrc(t, t + dur + 0.1), bp = filt('bandpass', 5000, 5), g = K.gain();
    bp.frequency.setValueAtTime(5000, t); bp.frequency.exponentialRampToValueAtTime(500, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(bp); bp.connect(g); route(pan(g, 0.2), true, false);
  }
  // The power chord on a drop or the final hit: root and fifth on the twang, the sub under it.
  function power(root, t, len, vel) {
    [0, 7].forEach((d, i) => twang(root + d, t + i * 0.012, len, vel * (i ? 0.75 : 1), i ? 0 : vel * 0.9, false));
  }

  // ---------------------------------------------------------------- the riff, step by step
  let me = null, spoolAt = 0;
  const lvl = (st, bk) => (bk >= 0 || st <= 1 ? [0.1, 0.035] : st === 2 ? [0.11, 0.07] : [0.11, 0.085]);   // [twang, sub]
  function riffBar(x) {
    const E = x.ending;
    if (E && x.t0 >= E.from - 1e-6 && R.cadence[E.cad.name]) return { notes: R.cadence[E.cad.name], c: E.cad };
    if (x.spool) return { notes: R.spool[x.c.name] || R.spool.Eb, c: x.c };
    return { notes: (Math.floor(x.b / 8) % 2 ? R.B : R.A)[x.b % 8], c: x.c };
  }

  me = music.define({ name: 'cargo', title: 'Cargo Run', bpm: 102, key: 'G', missions: ['c1', 'c2', 'c3', 'salvage'],
    mood: 'a scrappy hauler crew on its first contracts: a twangy guitar riff and a shaker, strummed chords, a swaggering rock kit, the whistle-flute theme',
    lead: 'flute', ostInst: 'twang', drums: 'kit', swing: 0.12,
    engineDrums: false,                                   // (its own kit, fills, builds, drops and spool)
    parts: { riff: 0, shaker: 0, strum: 1, drums: 2, hats: 3, pad: 3, theme: 4, brass: 5, taiko: 5, stabs: 6, strings: 6 },
    groove: ['strum'],
    A: { chords: 'Gm Gm Eb F Gm Gm Eb D', theme: [
      'G4 _ _ Bb4 _ _ D5 _', 'G5 _ _ F5 D5 _ _ _', 'Bb4 _ _ C5 Eb5 _ D5 C5', 'C5 _ _ _ A4 _ _ _',
      'G4 _ _ Bb4 _ _ D5 _', 'G5 _ _ A5 Bb5 _ _ _', 'G5 _ _ F5 Eb5 _ _ _', 'D5 _ _ _ A4 _ _ _'] },
    B: { chords: 'Cm Cm Gm Gm Eb F Gm D', theme: [
      'C5 _ _ Eb5 _ _ G5 _', 'G5 _ _ F5 Eb5 _ _ _', 'D5 _ _ Eb5 D5 _ Bb4 _', 'G4 _ _ _ _ _ Bb4 C5',
      'Eb5 _ _ _ G5 _ _ _', 'F5 _ _ _ A5 _ _ _', 'Bb5 _ _ A5 G5 _ _ _', 'A5 _ _ _ F#5 _ D5 _'] },
    spool: 'Eb F', end: 'G', ost: '0 . 0 . 1 . 0 . 0 . 0 . 1 . 2 .',
    hooks: {
      bar(x) {
        if (x.spool && !(x.prev && x.prev.spool)) spoolAt = x.b;
        if (x.drop) {                                     // the drop: kick, crash, a power chord on the root, the sub boom, a stab
          const root = inRange(x.c.root, 43);
          kick(x.t, 0.7); crash(x.t, x.st >= 6 ? 0.24 : 0.2); boom(x.t, 0.32); power(root, x.t, x.bd * 0.45, 0.1);
          brass(x.c, x.t, stepDur() * 2, 0.06, true);
        }
      },
      step(x) {
        const { s, b, t, st, has, bk } = x, sd = stepDur();
        // the riff
        if (has('riff') && s % 2 === 0) {
          const { notes, c } = riffBar(x), n = notes.find(q => q.slot === s / 2);
          if (n) {
            const [v, sub] = lvl(st, bk), cb = x.spool ? (b - spoolAt) % 4 : 0, len = n.len * 2 * sd * (x.spool ? 0.7 : 0.9);
            twang(n.m, t, len, x.spool ? 0.11 + 0.01 * cb : v, x.spool ? 0.09 : sub, st <= 1 || bk >= 0);
            if (me.walkLog) me.walkLog.push({ t, m: n.m, len, b, s, c: c.name, kind: 'note', sec: true });
            if (me.noteLog) me.noteLog.push({ t, m: n.m, len, b, c: c.name, kind: 'riff' });
          }
        }
        // the shaker: swung 8ths, 16ths from the kit's hats on
        if (has('shaker')) {
          const sixteen = (st === 3 || st === 4) && bk < 0;   // (then the kit's hats take the 16ths' place)
          if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.075 : 0.045, false, 'shaker');
          else if (sixteen) hat(t, 0.025, false, 'shaker');
        }
        // the strummed chords: down on 1, a push up on the & of 2, down on 3, up on the & of 4 (busier from the theme on)
        if (has('strum') && !x.spool) {
          const P = st === 4 ? { 0: [1, 0], 6: [0.55, 1], 8: [0.8, 0], 10: [0.45, 1], 14: [0.55, 1] } : { 0: [1, 0], 6: [0.55, 1], 8: [0.8, 0], 14: [0.5, 1] };
          if (P[s] && !(x.late && st >= 3)) strum(x.c, t, (st <= 2 ? 0.026 : 0.022) * P[s][0], !!P[s][1], st <= 2 ? 0.35 : 0.6);
        }
      },
      // The kit: a rock backbeat with a push. Stage 2 just kick and a rim; then the full beat; from the theme ghost notes
      // and a clap; the climax adds floor-tom taikos on 1 and 3 and an open hat every other bar.
      drums({ s, b, st, t, has, lv }) {
        const d = has('drums') ? lv('drums') : -1, bi = b % 8;
        if (d < 0) return;
        const K1 = st <= 2 ? [0, 10] : st === 3 ? [0, 8, 10] : [0, 3, 8, 10];
        if (K1.includes(s)) kick(t, s === 0 ? 0.62 : 0.5);
        if (st >= 6 && bi % 2 === 1 && s === 14) kick(t, 0.45);
        if (s === 4 || s === 12) { snare(t, st <= 2 ? 0.1 : 0.3); if (st >= 5) clap(t, 0.1); }
        if (st >= 4 && st <= 5 && (s === 7 || s === 15)) snare(t, 0.04);
        if (has('hats')) {
          if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.065 : 0.035, s === 14 && (st >= 6 ? bi % 2 === 1 : bi === 7));
        }
        if (has('taiko') && (s === 0 || (st >= 6 && s === 8))) taiko(t, 0.38, 0.85);
      },
      fill(x) {                                          // into the strum: no fill; into the kit: a snare pickup; else a tom run
        if (x.r === -1) return x.to <= 1 ? 'skip' : undefined;
        const { r, t, big, to } = x;
        if (to === 2 || x.st < 2) { if (r >= 5) snare(t, 0.07 + 0.05 * (r - 5)); return true; }
        const TT = [0, 0, 230, 230, 175, 175, 125, 110];
        if (r < 2) snare(t, 0.22 + 0.06 * r); else tom(t, big ? 0.45 : 0.36, TT[r], r % 2 === 1);
        if (r % 2 === 0) kick(t, 0.4);
        if (big && r >= 4) snare(t, 0.1 + 0.04 * r);
        return true;
      },
      build({ s, t, k }) {                                // the build: kick on the beats, snare 8ths tightening to 16ths
        if (s % 4 === 0) kick(t, 0.5 + 0.2 * k);
        if (s >= 8 || s % 2 === 0) snare(t, 0.06 + 0.3 * k * k);
        return true;
      },
      buildSweep({ t, bd }) { riser(t, bd * 0.75, 0.09, 400, 6000); scrape(t + bd * 0.5, bd * 0.24, 0.16); return true; },
      dropHit() { return true; },                         // (the bar hook plays the drop)
      accent({ t, st, bi }) { if (bi === 0) crash(t, st >= 6 ? 0.18 : 0.12); else crash(t, 0.1); if (st >= 6 && bi === 0) boom(t, 0.35); return true; },
      spoolWave({ t, bd }) { crash(t, 0.2); riser(t, bd * 4, 0.1, 300, 6000); scrape(t + bd * 3.7, bd * 0.3, 0.12); return true; },
      spoolPerc({ s, t, cb, k, c }) {                     // the spool: four on the floor, backbeat, rolls into each wave
        if (s % 4 === 0) kick(t, 0.6);
        if (s === 4 || s === 12) { snare(t, 0.3); clap(t, 0.1); }
        if (cb === 3 && s >= 8) snare(t, 0.08 + 0.04 * (s - 8));
        if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.07 : 0.04);
        if (s === 0 || s === 6) brass(c, t, stepDur() * 1.5, 0.03 + 0.01 * k, true);
        return true;
      },
      endFill({ s, t, k }) {                              // into the final hit: a snare roll and toms tumbling down
        snare(t, 0.08 + 0.25 * k);
        if (s % 2 === 0) tom(t, 0.3 + 0.2 * k, 230 - 100 * k, true);
        return true;
      },
      finalHit({ T }) { kick(T, 0.7); crash(T, 0.28); boom(T, 0.34); taiko(T, 0.4, 0.8); return true; },
      theme(x, n, at, len) { if (me.noteLog && x.has('theme')) me.noteLog.push({ t: at, m: n.midi, len, b: x.b, c: x.c.name, kind: 'theme' }); },   // (for the analysis tools)
      finale({ T, c, sd }) {                             // the last word: the power chord rings, a rolled G major on the guitar, one shake
        power(inRange(c.root, 43), T, 2.2, 0.12);
        strum(c, T + sd * 4, 0.03, false, 0.5);
        hat(T + sd * 8, 0.08, false, 'shaker');
      },
    },
  });
})();
