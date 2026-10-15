// A Signal in the Dark (ch. 5, the rescue of Dr. Varga from the pirate base): the theme on a far-away radio horn,
// a solo voice ("ah") answers. C minor.
// One piece of the soundtrack: its recipe (see the format at the top of js/music.js), its own instruments and its
// hooks into the engine (music.define / music.kit in js/music.js). The engine owns the arc (stages, drops, the
// breakdown), the ending, the mix and the shared instruments; everything that makes this piece itself lives here.
// Loaded after js/music.js (index.html, music.html, tests/music.js, tests/harness.js).
//
// The arc of this one: a call into the dark that gets answered. It opens on the radio horn alone, with only a faint,
// band-passed crackle around it (gone by stage 2); a warm string pad comes in under it, and in the last two bars of
// each phrase a distant voice starts answering. Storming the base (stages 3-5): bowed spiccato 8ths, then 16ths,
// taikos with pickup toms, a half-time snare that turns into a driving backbeat with ghost notes. Each build bar
// leaves the radio's call alone in the beat of silence. The breakdown is a dialogue: the radio calls (even bars),
// the voice answers (odd bars), over the strings. The climax lifts: the hook (B) turns to Eb major and climbs to
// C6, a second voice sings the harmony under it, the strings open an octave up and little bells glitter on top.
(() => {
  const K = music.kit;
  const { hz, osc, filt, noiseSrc, pan, route, env, inRange, stepDur, hash, lead, bell, taiko, snare, clap, hat, tom, LEAD_VEL } = K;

  // The radio horn: a horn (two saws, a filter swell) squeezed into a small radio's band, with a slow vibrato and a
  // flutter in its level, far off to the right and deep in the room.
  function radio(m, t, len, vel, p = 0.45) {
    const f = hz(m), end = t + len + 0.6, lp = filt('lowpass', 0, 1.3), bp = filt('bandpass', 1350, 1.1), g = K.ac.createGain(), am = K.ac.createGain();
    const os = [-6, 6].map(d => { const o = osc('sawtooth', f, t, end, d); o.connect(lp); return o; });
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.1); lp.frequency.setTargetAtTime(1600, t + 0.1, 0.3);
    const vib = osc('sine', 5.2, t, end), vg = K.ac.createGain(); vg.gain.value = f * 0.005; vib.connect(vg); os.forEach(o => vg.connect(o.frequency));
    const fl = osc('sine', 6.7, t, end), fg = K.ac.createGain(); fg.gain.value = 0.18; am.gain.value = 0.82; fl.connect(fg); fg.connect(am.gain);
    lp.connect(bp); bp.connect(g); env(g, t, 0.05, vel, Math.max(0, len - 0.05), 0.09); g.connect(am);
    route(pan(am, p), true, true);
    return { g, at: t };
  }
  // Radio static, kept faint: a rare, narrow-band crackle, and now and then a soft "tuning" whistle.
  function crackle(t, vel) {
    const n = noiseSrc(t, t + 0.05), bp = filt('bandpass', 2000 + 700 * hash(Math.round(t * 1000)), 4.5), g = K.ac.createGain();
    n.connect(bp); bp.connect(g); env(g, t, 0.002, vel, 0, 0.007); route(pan(g, 0.45), false, false);
  }
  function tuning(t, len, vel) {
    const n = noiseSrc(t, t + len + 0.4), bp = filt('bandpass', 1300, 6), g = K.ac.createGain();
    bp.frequency.setValueAtTime(1150, t); bp.frequency.linearRampToValueAtTime(1750, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.12); g.gain.setTargetAtTime(0, t + len, 0.06);
    n.connect(bp); bp.connect(g); route(pan(g, 0.45), true, false);
  }
  // The warm string pad: the chord on soft saws through a dark, slowly opening lowpass, bowed in (slow attack) and
  // with a gentle vibrato; the low side carries the root an octave down (the cellos). up: an octave higher (climax).
  // Held like the engine's pad (tag 'pad': the engine releases it on the bar lines where it would renew its own).
  function strings(voice, t, vel, bright, up) {
    for (const side of [-1, 1]) {
      const notes = (side < 0 ? [voice[0] - 12, voice[1], voice[3]] : [voice[0], voice[2], voice[3]]).map(m => m + (up ? 12 : 0));
      const lp = filt('lowpass', 0, 0.6), g = K.ac.createGain(), vib = K.ac.createOscillator(), vg = K.ac.createGain();
      lp.frequency.setValueAtTime(600 + 700 * bright, t); lp.frequency.linearRampToValueAtTime(900 + 1500 * bright, t + 3);
      vib.frequency.value = 4.8 + side * 0.4; vg.gain.value = 7; vib.connect(vg); vib.start(t);
      const os = notes.map((m, i) => { const o = K.ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = side * 6 + (i - 1) * 3; vg.connect(o.detune); o.connect(lp); o.start(t); return o; });
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.7);
      lp.connect(g); route(pan(g, side * 0.7), true, false);
      K.hold('pad', K.holder([...os, vib], g, vel, 0.35, 2.5));
    }
  }
  // Spiccato strings for the ostinato: one short bowed saw, its filter snapping shut, alternating sides.
  function spiccato(m, t, vel, bright, p) {
    const f = hz(m), lp = filt('lowpass', 0, 1.6), g = K.ac.createGain();
    lp.frequency.setValueAtTime(900 + 1600 * bright, t); lp.frequency.setTargetAtTime(350 + f, t + 0.02, 0.06);
    osc('sawtooth', f, t, t + 0.35).connect(lp); env(g, t, 0.006, vel, 0.03, 0.045); lp.connect(g); route(pan(g, p), true, false);
  }

  let bkNow = -1;                                     // (the breakdown bar, for the step hook)

  music.define({ name: 'signal', title: 'A Signal in the Dark', bpm: 92, key: 'C', missions: ['c5', 'rescue'],
    mood: 'a faint crackle and the theme on a far-away radio horn; a solo voice answers; strings, spiccato and taikos storm the base; the voice and the radio talk in the breakdown; the hook lifts to Eb major',
    lead: 'voice', ostInst: 'spiccato', drums: 'taiko',
    parts: { radio: [0, 3], static: [0, 1], warm: 1, answer: [2, 3], bells: [2, 3], ost: 3, ost16: 4, drums: 3, bass: 3, hats: 3, snare: 4, theme: 4, brass: 5, stabs: 6, strings: 6, glitter: 6 },
    A: { chords: 'Ab Ab Eb Eb Bb Bb Cm Cm', theme: [
      'C5 _ _ _ Eb5 _ _ _', 'Ab4 _ _ _ _ _ Bb4 _', 'G4 _ _ _ Bb4 _ Eb5 _', 'G5 _ F5 _ Eb5 _ _ _',
      'D5 _ _ _ F5 _ _ _', 'Bb4 _ _ _ D5 _ C5 _', 'Eb5 _ _ _ _ _ D5 _', 'C5 _ _ _ _ _ . .'] },
    B: { chords: 'Fm Fm Ab Bb Eb Eb Ab Bb', theme: [                 // the hook: from F minor up into Eb major, the peak on C6
      'C5 _ _ F5 _ _ Ab5 _', 'Ab5 _ _ _ F5 _ C5 _', 'Eb5 _ _ _ C5 _ Eb5 _', 'F5 _ _ _ D5 _ F5 _',
      'G5 _ _ _ _ _ Bb5 _', 'Bb5 _ _ _ G5 _ Eb5 _', 'C6 _ _ _ Ab5 _ Eb5 _', 'D5 _ _ _ F5 _ _ _'] },
    spool: 'Ab Bb', end: 'C', ost: '0 2 1 2 3 2 1 2 0 2 1 2 4 2 1 2',
    hooks: {
      bar(x) {
        const { t, bi, c, st, has, bd, spool, build, bk, prev, notes, voice } = x;
        bkNow = bk;
        // the static: a soft tuning whistle every fourth bar at the very start, and once as the breakdown begins
        if (has('static') && (bk === 0 || (bk < 0 && st === 0 && bi % 4 === 3))) tuning(t + bd * 0.6, bd * 0.25, 0.007);
        // the build: the radio's call alone in the beat of silence (not in the notes, so the hush leaves it)
        if (build) radio(72, t + bd * 0.75 + 0.02, bd * 0.2, LEAD_VEL.radio * 0.4);
        // the warm strings, one bowed chord per chord (they also carry the breakdown and the spool), renewed exactly
        // where the engine would renew its pad (so its release of the 'pad' voices meets them)
        const fresh = !prev || prev.c.name !== c.name || prev.spool !== spool || prev.st !== st || prev.bk !== bk || bi === 0 || prev.build;
        if ((has('warm') || bk >= 0 || spool) && fresh) {
          strings(voice, t, bk >= 0 ? 0.03 : [0.026, 0.03, 0.032, 0.034, 0.036, 0.038, 0.04, 0.04][st], Math.min(1, K.BRIGHT[st] + 0.1), false);
          if (st >= 6 && bk < 0) strings(voice, t, 0.022, 1, true);   // the lift: the strings open an octave up
        }
        // the lift: a second voice sings the harmony (the chord's third) under the theme at the climax
        if (has('glitter') && bk < 0 && !spool) notes.push(lead(inRange((c.root + c.third) % 12, 63), t, bd * 0.96, LEAD_VEL.voice * 0.4, 'voice'));
      },
      theme(x, n, at, len) {
        const { bk, bi, st, has, notes } = x;
        if (bk >= 0) {                                    // the breakdown: the radio calls, the voice answers
          if (bi % 2 === 0) notes.push(radio(n.midi, at, len, LEAD_VEL.radio * 0.9));
          else notes.push(lead(n.midi, at, len, LEAD_VEL.voice * (bk >= 4 ? 0.95 : 0.8), 'voice'));
          return;
        }
        if (!has('radio')) return;
        if (has('answer') && bi >= 6) notes.push(lead(n.midi, at, len, LEAD_VEL.voice * (st >= 3 ? 0.7 : 0.55), 'voice'));   // someone answers
        else notes.push(radio(n.midi, at, len, LEAD_VEL.radio * (st >= 2 ? 1 : 0.85)));
      },
      ost(m, t, a, st) { spiccato(m, t, (st >= 5 ? 0.075 : 0.065) * a, Math.min(1, K.BRIGHT[st] + 0.15), (m % 2 ? 0.45 : -0.45)); },
      step({ s, t, st, has, step, voice, spool }) {
        if (has('static') && bkNow < 2 && hash(step) < 0.05 / (1 + st)) crackle(t + hash(step + 7) * stepDur(), 0.008 + 0.008 * hash(step + 3));
        if (has('glitter') && !spool && bkNow < 0 && s % 4 === 0) {   // little bells glittering up the chord
          const i = [0, 1, 2, 3][s / 4]; bell(voice[i] + 24, t, 0.022, (i - 1.5) * 0.4);
        }
      },
      drums({ s, st, t, has, lv }) {                     // taikos and toms storming the base; the snare from half time to a drive
        const d = has('drums') ? lv('drums') : -1;
        const TK = [[0, 6, 10], [0, 6, 10], [0, 3, 6, 10, 12], [0, 3, 6, 8, 10, 12, 14]];
        if (d >= 0 && TK[Math.min(d, 3)].includes(s)) taiko(t, s === 0 ? 0.6 : 0.4, s === 0 ? 1 : 1.15);
        if (d >= 2 && (s === 13 || s === 15)) tom(t, 0.24, s === 13 ? 170 : 130);
        if (has('snare')) {
          if (st === 4) { if (s === 8) { snare(t, 0.3); clap(t, 0.1); } }
          else if (s === 4 || s === 12) snare(t, 0.26);
          else if (st === 5 && s % 2 === 1 && s !== 13 && s !== 15) snare(t, 0.028);
          if (st >= 6 && s === 14) snare(t, 0.12);
        }
        if (has('hats')) { if (lv('hats') >= 2) hat(t, s % 4 === 2 ? 0.07 : 0.03, s === 14); else if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.06 : lv('hats') ? 0.03 : 0.02); }
      },
      finale({ T, c, sd }) {                              // the radio answers once more, and the voice with it
        radio(inRange(c.root, 72), T + sd * 4, 1.6, LEAD_VEL.radio * 0.7);
        lead(inRange(c.pcs[1], 76), T + sd * 8, 1.8, LEAD_VEL.voice * 0.5, 'voice');
      },
    },
  });
})();
