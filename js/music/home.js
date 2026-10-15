// Last Jump Home (ch. 8, nightmare: the last jump of the campaign). A ticking clock and the theme on a music box;
// then a dubstep growl creeps in under it, muffled, and the first drop opens it: half-time drums, a heavy snare on 3,
// a talking wobble bass over a clean sine sub. The breakdown brings the music box and the clock back; the climax
// puts the music box on top of everything. C minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
// (The opening, stages 0-1: clock and music box, plays exactly as before the dubstep rework, call for call.)
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, inRange, bassRoot, stepDur, hash, pluck, lead, bass, taiko, kick, snare, clap, hat, tom, crash, brass, LEAD_VEL } = K;
  // A music-box tine: pure and high, with a bright octave click at the start.
  function tine(m, t, vel, p) {
    const f = hz(m), g = K.ac.createGain(), g2 = K.ac.createGain();
    osc('sine', f, t, t + 2.6).connect(g); osc('sine', f * 2, t, t + 0.3).connect(g2); g2.connect(g);
    env(g, t, 0.002, vel, 0, 0.55); env(g2, t, 0.001, 0.6, 0, 0.03); route(pan(g, p), true, false);
    return { g, at: t };
  }
  // A clock: tick (high) and tock (low), dry little clicks.
  function tick2(t, vel, hi) {
    const o = osc('square', hi ? 2600 : 1700, t, t + 0.05), bp = filt('bandpass', hi ? 3200 : 2000, 2), g = K.ac.createGain();
    o.connect(bp); bp.connect(g); env(g, t, 0.001, vel, 0, 0.008); route(pan(g, hi ? 0.2 : -0.2), true, false);
  }

  // ---------------------------------------------------------------- the growl
  // A dubstep bass that talks: two detuned saws (FM'd by a sine at their pitch: the growl) and a square an octave
  // down, saturated, through a resonant lowpass and two vowel formants (left and right) that sweep together, from a
  // closed vowel to an open one, in time with the beat; a clean sine sub underneath, out of the filters. No LFO: every
  // wobble is written as automation on the grid, so each one starts closed on its beat and any rate or shape can follow
  // any other. Wobble patterns: one bar in 8 slots (8ths): a letter starts a segment, '-' holds it, '.' rests.
  //   q 1/4  e 1/8  t 1/8 triplet  s 1/16  x 1/16 triplet  z 1/32 stutter (chopped)  W one slow "waaah" opening  H one "yowww"
  //   prefix v: dives in from an octave up; suffix ^ an octave up, 5 the fifth.
  const DIV = { q: 1, e: 2, t: 3, s: 4, x: 6, z: 8, W: 0, H: 0 };
  const VOW = { oo: [300, 780], oh: [460, 880], uh: [560, 1040], ah: [780, 1250], ae: [660, 1720], ee: [360, 2150] };
  const VPAIRS = [['oo', 'ah'], ['oh', 'ee'], ['uh', 'ae'], ['oo', 'ee'], ['oh', 'ah']];
  const parsePat = (str) => {
    const out = []; let cur = null;
    str.trim().split(/\s+/).forEach((tok, i) => {
      if (tok === '-') { if (cur) cur.len++; return; }
      cur = null; if (tok === '.') return;
      const m = /^(v?)([qetsxzWH])([\^5]?)$/.exec(tok); if (!m) throw new Error('home: bad wobble ' + tok);
      cur = { slot: i, len: 1, glide: !!m[1], kind: m[2], off: m[3] === '^' ? 12 : m[3] === '5' ? 7 : 0 }; out.push(cur);
    });
    return out;
  };
  const P = (rows) => rows.map(parsePat);
  const PAT = {
    creep: P(['q - - - - - - -']),                                            // stage 2: slow, muffled, creeping in
    rise: P(['e - - - - - - -', 'e - - - q - - -', 'e - - - - - - -', 't - - - s - - -']),   // stage 3: 8ths, still under a blanket
    // stage 4, from the first drop: half time, the snare's beat left open, every bar its own figure
    drop: P(['vW - - - . e - -', 'e - s - . t - -', 'q5 - e - . s - .', 't - - - . z - z^',
      'H - - - . e - -', 's - e^ - . t - -', 'e - t - . s - z', 'z - s - x - - -']),
    // stage 5, after the breakdown: busier, faster, octave jumps
    five: P(['vW - - - . s - -', 'e - x - . t^ - -', 's5 - e - . z - -', 't - s - . x - z^',
      'vH - - - . e - s', 'x - e - . t5 - -', 's - t - . s^ - z', 'z - x - s - z^ -']),
    // stage 6, the climax: everything at once
    six: P(['vW - - - . x - -', 's - x^ - . t - z', 'x5 - s - . z - -', 't - x - . s^ - z^',
      'vW - - - . s - x', 'x - s^ - . t - z', 's - t5 - . x - -', 'z - x - z^ - x -']),
    spool: P(['e - - - - - - -', 's - - - s^ - - -', 'x - - - x^ - - -', 'z - - - z^ - - -']),   // accelerating in 4-bar waves
    dist: P(['q - - - - - - -', 'q - - - - - - -', 'e - - - . e - -']),         // the breakdown: far away, coming back
  };
  // stage → [level, how far the filter opens, FM growl, formant width, sub level]
  const LOOK = { 2: [0.036, 0.16, 0.15, 0.35, 0.05], 3: [0.042, 0.28, 0.3, 0.55, 0.06], 4: [0.18, 0.85, 0.75, 1, 0.11],
    5: [0.18, 0.95, 0.9, 1, 0.11], 6: [0.186, 1, 1, 1, 0.115], 7: [0.18, 0.8, 0.9, 1, 0.11] };
  const zg = () => { const g = K.ac.createGain(); g.gain.value = 0; return g; };   // (an enveloped gain starts silent: no click before its first event)
  let curve = null;
  function shaper() {                                    // saturation (where the browser has it), a little lopsided: 2nd and 3rd harmonics
    if (!K.ac.createWaveShaper) return null;
    if (!curve) { curve = new Float32Array(1025); const b = Math.tanh(0.6), n = Math.max(Math.tanh(3.6) - b, b - Math.tanh(-2.4)); for (let i = 0; i < 1025; i++) curve[i] = (Math.tanh((i / 512 - 1) * 3 + 0.6) - b) / n; }
    const s = K.ac.createWaveShaper(); s.curve = curve; s.oversample = '2x'; return s;
  }
  // segs: [{ at, dur, kind, off, glide, open?, att?, rel? }] in time order; o: { vel, open, fm, wide, sub, vow }
  function growl(c, segs, o) {
    if (!segs.length) return null;
    const t = segs[0].at, last = segs[segs.length - 1], stop = last.at + last.dur + 0.05, m0 = bassRoot(c) + 12, beat = 4 * stepDur();
    const saws = [osc('sawtooth', hz(m0), t, stop, -9), osc('sawtooth', hz(m0), t, stop, 9)], sq = osc('square', hz(m0) / 2, t, stop);
    const mod = osc('sine', hz(m0), t, stop), mg = zg(), pre = K.ac.createGain();
    mod.connect(mg); saws.forEach(s => { mg.connect(s.frequency); s.connect(pre); }); sq.connect(pre);
    pre.gain.value = 0.5;
    const sh = shaper(), lp = filt('lowpass', 200, 5), hp = filt('highpass', 150, 0.7), f1 = filt('bandpass', 400, 6), f2 = filt('bandpass', 1000, 8);
    if (sh) { pre.connect(sh); sh.connect(lp); } else pre.connect(lp);
    const g = zg(), b1 = K.ac.createGain(), b2 = K.ac.createGain(), kg = K.ac.createGain();
    b1.gain.value = 4.3; b2.gain.value = 4;                  // (the formants, against the body through the highpass)
    lp.connect(hp); hp.connect(g); lp.connect(f1); f1.connect(b1); lp.connect(f2); f2.connect(b2);
    pan(b1, -0.7 * o.wide).connect(g); pan(b2, 0.7 * o.wide).connect(g);
    // the deep body: the saturated saws and square (with their low overtones) through a gentle lowpass, below the
    // formants' highpass, centred; and a detuned unison pair, left and right, for width in the low mids
    const low = filt('lowpass', 300, 0.9), bl = K.ac.createGain(); bl.gain.value = 1.3;
    (sh || pre).connect(low); low.connect(bl); bl.connect(g);
    const gu = zg(), uni = [-23, 23].map(d => { const u = osc('sawtooth', hz(m0), t, stop, d), ul = filt('lowpass', 300, 2); mg.connect(u.frequency); u.connect(ul); pan(ul, d < 0 ? -0.6 : 0.6).connect(gu); return [u, ul]; });
    const sub = osc('sine', hz(bassRoot(c)), t, stop), sg = zg();
    sub.connect(sg); sg.connect(kg); g.connect(kg); gu.connect(kg); route(kg, false, false);
    const [v0, v1] = o.vow.map(v => VOW[v]);
    for (const S of segs) {
      const f = hz(m0 + S.off), end = rt(S.at + S.dur), op = o.open * (S.open || 1), hi = 170 + 3400 * op;
      for (const [p, ff] of [[saws[0].frequency, f], [saws[1].frequency, f], [sq.frequency, f / 2], [mod.frequency, f], [uni[0][0].frequency, f], [uni[1][0].frequency, f], [sub.frequency, hz(bassRoot(c) + (S.off === 7 ? 7 : 0))]]) {
        if (S.glide) { p.setValueAtTime(ff * 2, S.at); p.exponentialRampToValueAtTime(ff, S.at + Math.min(0.3, S.dur * 0.5)); }
        else p.setValueAtTime(ff, S.at);
      }
      // the gate (the sub plays the segment through, smooth; the growl is chopped on z)
      const att = S.att || 0.006, rel = S.rel || 0.018;
      sg.gain.setValueAtTime(0, S.at); sg.gain.linearRampToValueAtTime(o.sub, S.at + Math.max(att, 0.01)); sg.gain.linearRampToValueAtTime(o.sub, end - Math.max(rel, 0.03)); sg.gain.linearRampToValueAtTime(0, end);
      const n = DIV[S.kind] ? Math.max(1, Math.round(S.dur / (beat / DIV[S.kind]))) : 1, C = S.dur / n, cyc = (i) => (i >= n ? end : rt(S.at + i * C));   // (times on a 1 µs grid: a segment ends exactly where the next begins)
      for (const [P, v] of [[g.gain, o.vel * 1.45], [gu.gain, o.vel * 0.65]]) {   // (1.45: makes up for the lopsided curve's lower output)
        if (S.kind === 'z') for (let i = 0; i < n; i++) {
          const c0 = cyc(i); P.setValueAtTime(0, c0); P.linearRampToValueAtTime(v, c0 + 0.003); P.linearRampToValueAtTime(v, c0 + C * 0.5); P.linearRampToValueAtTime(0, c0 + C * 0.75);
        } else { P.setValueAtTime(0, S.at); P.linearRampToValueAtTime(v, S.at + att); P.linearRampToValueAtTime(v, end - rel); P.linearRampToValueAtTime(0, end); }
      }
      // the wobble: filter, both formants and the growl's FM depth, one cycle per wobble (k: where it is most open)
      const k = S.kind === 'W' ? 0.8 : S.kind === 'H' ? 0.12 : S.kind === 'z' ? 0.05 : S.kind === 's' || S.kind === 'x' ? 0.35 : 0.45;
      const sweeps = [[lp.frequency, 200 + 450 * op, hi, false], [low.frequency, 180, 180 + 380 * op, false],
        ...uni.map(([, ul]) => [ul.frequency, 200 + 300 * op, 300 + 1500 * op, false]), [f1.frequency, v0[0], v0[0] + (v1[0] - v0[0]) * op, false], [f2.frequency, v0[1], v0[1] + (v1[1] - v0[1]) * op, false], [mg.gain, 0, f * 1.1 * o.fm, true]];
      for (const [p, lo, top, lin] of sweeps) {
        const ramp = lin ? 'linearRampToValueAtTime' : 'exponentialRampToValueAtTime';
        p.setValueAtTime(lo, S.at);
        for (let i = 0; i < n; i++) { const c0 = cyc(i); p[ramp](top, c0 + C * k); p[ramp](lo, S.kind === 'z' ? c0 + C * 0.9 : cyc(i + 1)); }
      }
    }
    return { kg, killed: false };
  }
  function kill(v, t) { if (!v || v.killed) return; v.killed = true; v.kg.gain.setValueAtTime(1, t); v.kg.gain.linearRampToValueAtTime(0, t + 0.03); }
  // A bar's pattern as timed segments.
  const rt = (x) => Math.round(x * 1e6) / 1e6;
  const segsOf = (pat, t, e8, extra) => pat.map(n => ({ at: rt(t + n.slot * e8), dur: rt(t + (n.slot + n.len) * e8) - rt(t + n.slot * e8), kind: n.kind, off: n.off, glide: n.glide, ...extra }));
  // The sub hit on a drop: an 808-ish sine diving from an octave up onto the root, ringing (a soft-ish front: the
  // drop's boom and taiko take the first hit).
  function subHit(c, t, vel, len) {
    const f = hz(bassRoot(c)), o = osc('sine', f * 2, t, t + len + 0.2), g = zg();
    o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.14);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.03); g.gain.linearRampToValueAtTime(vel * 0.85, t + len * 0.5); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g); route(g, false, false);
  }
  // The impact after the silence: a noise burst falling from bright to dark.
  function impact(t, len, vel) {
    const n = noiseSrc(t, t + len + 0.05), lp = filt('lowpass', 9000, 1.2), g = zg();
    lp.frequency.setValueAtTime(9000, t); lp.frequency.exponentialRampToValueAtTime(250, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.005); g.gain.linearRampToValueAtTime(0, t + len);
    n.connect(lp); lp.connect(g); route(pan(g, 0), true, false);
  }

  let cur = null, buildBar = -1, spoolAt = 0, dropBar = -1;   // this bar's growl, the last build bar, the spool's first bar, this bar if it drops

  music.define({ name: 'home', title: 'Last Jump Home', bpm: 112, key: 'C', missions: ['c8', 'nightmare'],
    mood: 'a ticking clock and the theme on a music box; then a muffled growl creeps in, a build, a beat of silence, and the drop: a talking wobble bass, half-time drums, a heavy snare on 3',
    lead: 'saw', ostInst: 'pluck', drums: 'dub',
    engineDrums: false,                                   // (the engine's rolls, fills, drop hits and spool percussion are off: the growl carries the rhythm, over a sparse kit of its own)
    parts: { tick: [0, 3], tines: [0, 3], pad: 1, wobble: 2, drums: 3, hats: 3, snare: 4, theme: 4, choir: 5, brass: 5, stabs: 6, strings: 6 },
    A: { chords: 'Cm Cm Ab Ab Fm Fm G G', theme: [
      'C5 _ _ G4 _ _ C5 _', 'Eb5 _ _ _ C5 _ D5 _', 'Eb5 _ _ _ _ _ C5 _', 'Ab4 _ _ _ _ _ Bb4 _',
      'C5 _ _ F5 _ _ Ab5 _', 'Ab5 _ G5 _ F5 _ C5 _', 'D5 _ _ _ B4 _ G4 _', 'B4 _ _ _ D5 _ _ _'] },
    B: { chords: 'Ab Bb Cm Cm Ab Bb G G', theme: [
      'Eb5 _ _ _ Ab5 _ _ _', 'F5 _ _ _ Bb5 _ _ _', 'G5 _ _ _ _ _ Eb5 _', 'C5 _ _ _ _ _ . .',
      'C5 _ _ Eb5 _ _ Ab5 _', 'Bb5 _ _ _ F5 _ D5 _', 'D5 _ _ _ G5 _ _ _', 'G5 _ _ _ D5 _ F5 _'] },
    spool: 'Ab Bb', end: 'C', ost: '0 0 1 0 2 0 1 0 0 0 1 0 3 2 1 0',
    groove: ['wobble'],                                   // (comes back early in the breakdown's rebuild)
    hooks: {
      bar(x) {
        const { t, b, bi, c, st, has, bd, e8, spool, build, drop, bk, first } = x;
        if (build) buildBar = b; cur = null; dropBar = drop ? b : -1;
        if (spool && !(x.prev && x.prev.spool)) spoolAt = b;
        if (drop) {                                       // the drop: everything at once, the sub first (it stands in for the kick)
          subHit(c, t, st >= 6 ? 0.45 : 0.5, bd * 1.1); impact(t, bd * 0.9, st >= 6 ? 0.2 : 0.18);   // (the sub hit stands in for the engine's boom)
          brass(c, t, stepDur() * 2, 0.07, true); crash(t + 0.01, 0.14);
          if (st >= 6) subHit(c, t + bd / 2, 0.12, bd * 0.5);
        }
        if (!has('wobble') && !build) return;
        const L = LOOK[Math.min(7, Math.max(2, spool ? 7 : st))], vow = VPAIRS[(b + (st >= 5 ? 2 : 0)) % VPAIRS.length];
        let o = { vel: L[0], open: L[1], fm: L[2], wide: L[3], sub: L[4], vow }, segs;
        if (build) {                                      // the build: the growl speeds up and climbs, then stops dead for the silence
          const sd = stepDur();
          segs = [['e', 0, 4, 0, 0.4], ['t', 4, 8, 7, 0.6], ['s', 8, 10, 12, 0.8], ['z', 10, 11.98, 12, 1]]
            .map(([kind, a, z, off, open]) => ({ at: rt(t + a * sd), dur: rt(t + z * sd) - rt(t + a * sd), kind, off, open }));
          o = { ...o, vel: 0.095, open: 1, fm: 0.8, wide: 1, sub: 0.06, vow: ['oo', 'ee'] };
        } else if (bk >= 0) {                               // the breakdown: far away under the music box, then closer
          segs = segsOf(PAT.dist[bk >= 6 ? 2 : bi % 2], t, e8);
          o = { ...o, vel: bk >= 6 ? 0.048 : 0.036, open: bk >= 6 ? 0.3 : 0.14, fm: 0.2, wide: 0.5, sub: 0.06 };
        } else if (spool) {
          const cb = (b - spoolAt) % 4;
          segs = segsOf(PAT.spool[cb], t, e8, { open: 0.6 + 0.13 * cb });
        } else {
          const pat = st >= 6 ? PAT.six[bi] : st === 5 ? PAT.five[bi] : st === 4 ? PAT.drop[bi] : st === 3 ? PAT.rise[bi % 4] : PAT.creep[0];
          segs = segsOf(pat, t, e8);
          if (first('wobble') && st <= 3) segs[0].att = bd * 0.9;   // (its first bar: fading in)
          if (drop) segs[0].att = 0.05;                   // (a drop's first growl swells in a hair late: the sub and boom take the hit)
        }
        cur = growl(c, segs, o);
      },
      theme(x, n, at, len) {                              // the music box plays the theme (stages 0-3, the breakdown, and on top of the climax)
        const m = n.midi + 12 > 91 ? n.midi : n.midi + 12;
        if (x.has('tines')) {
          x.notes.push(tine(m, at, 0.12, 0.15)); if (n.len >= 3) x.notes.push(tine(m, at + 2 * x.e8, 0.06, -0.15));
          if (x.bk >= 0 && n.slot === 0) x.notes.push(tine(m - 12, at, 0.06, -0.35));   // (the breakdown: a low tine under each bar)
        } else if (x.st === 6 && x.bk < 0) x.notes.push(tine(m, at, 0.09, n.slot % 4 < 2 ? 0.35 : -0.35));
      },
      step({ s, b, t, t0, N, has }) {
        if (b === buildBar) { if (s < 12) tick2(t, 0.06 + 0.1 * s / 12, s % 2 === 0); }   // the build: the clock races into the silence
        else if (has('tick') && s % 4 === 0) tick2(t, s === 0 ? 0.16 : 0.1, s % 8 === 0);
        const E = music.ending, bd = stepDur() * N;      // the cadence or the final fill takes over mid-bar: this bar's growl stops
        if (E && cur && s === N / 2 && (Math.abs(E.from - t0) < 1e-6 || Math.abs(E.T - bd / 2 - t0) < 1e-6)) kill(cur, t0);
      },
      // The kit: sparse half time. Kick on the 1 (not on a drop's 1: the sub hit is there), from the drop a snare and clap
      // on the 3; hats on the off-beats, 8ths from the drop, 16ths at the climax, whose last 2 bars of a phrase go double time.
      drums({ s, b, st, t, has, lv }) {
        const d = has('drums') ? lv('drums') : -1, bi = b % 8;
        if (st >= 6 && bi >= 6) {
          if (d >= 0 && [0, 6, 8, 10].includes(s)) kick(t, 0.65);
          if (s === 4 || s === 12) { snare(t, 0.36); clap(t, 0.14); }
          if (bi === 7 && s >= 13) snare(t, 0.12 + 0.06 * (s - 13));
          if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.08 : 0.035);
          return;
        }
        if (d >= 0 && s === 0 && b !== dropBar) kick(t, 0.65);
        if (has('snare') && s === 8) { snare(t, 0.4); clap(t, 0.16); }
        if (has('hats')) { if (st >= 6) hat(t, s % 4 === 2 ? 0.07 : 0.03); else if (st >= 4 ? s % 2 === 0 : s % 4 === 2) hat(t, s % 4 === 2 ? 0.06 : 0.03); }
      },
      fill(x) {                                          // no drum fill into the growl's stages: it fades in, stages just change on the bar line
        if (x.r === -1) return x.to >= 2 ? 'skip' : undefined;
        if (x.r !== 1) tom(x.t, x.big ? 0.5 : 0.36, 230 - x.r * 18);   // (into stage 1: the opening's own little tom fill, as it always was)
        if (x.big) snare(x.t, 0.06 + x.r * 0.03);
      },
      build({ s, t, k }) {                                // the build: kicks on 1 and 3, snare 8ths tightening to 16ths into the silence (the growl climbs over it)
        if (s === 0 || s === 8) kick(t, 0.55);
        if (s >= 8 || s % 2 === 0) snare(t, 0.06 + 0.3 * k * k);
        return true;
      },
      dropHit() { return true; },                          // (the drop is the bar hook's: sub dive, impact, brass stab, one low crash)
      spoolPerc({ s, t, cb }) {                            // the spool: the growl's waves carry it; a skeleton under them
        if (s === 0) kick(t, 0.6);
        if (s === 8) { snare(t, 0.36); clap(t, 0.14); }
        if (s % 4 === 2) hat(t, 0.05);
        if (cb === 3 && s >= 12) snare(t, 0.08 + 0.05 * (s - 12));   // into the next wave
        return true;
      },
      endFill({ s, t, c, N }) {                           // into the final hit: the growl climbs and speeds up, one snare flam at the end
        const sd = stepDur();
        if (s === N / 2) growl(c, [{ at: rt(t), dur: rt(t + 4 * sd) - rt(t), kind: 's', off: 0, open: 0.7 }, { at: rt(t + 4 * sd), dur: rt(t + 7.98 * sd) - rt(t + 4 * sd), kind: 'z', off: 12, open: 1 }],
          { vel: 0.09, open: 1, fm: 0.9, wide: 1, sub: 0.07, vow: ['oh', 'ee'] });
        if (s === N - 1) { snare(t, 0.2); snare(t + 0.025, 0.32); }
        return true;
      },
      finalHit({ T }) { crash(T, 0.24); taiko(T, 0.45, 0.8); return true; },   // (with the finale's sub and growl)
      finale({ T, c, v, sd }) {                           // the music box rolls up the chord; the clock ticks once more
        v.forEach((m, i) => tine(m + 24 > 91 ? m + 12 : m + 24, T + sd * (2 + 2 * i), 0.1, (i - 1.5) * 0.3)); tick2(T + sd * 16, 0.14, true);
        subHit(c, T, 0.32, 2.4);                          // and under the hit: the sub, and one last slow "yowww" dying away
        growl(c, [{ at: T, dur: 2.6, kind: 'H', off: 0, rel: 1.6 }], { vel: 0.084, open: 1, fm: 0.7, wide: 1, sub: 0.0001, vow: ['oo', 'ah'] });
      },
    },
  });
})();
