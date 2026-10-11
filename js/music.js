// Original, fully synthesized music (WebAudio, no files): one piece per mission.
// Every piece is a recipe (tempo, key, chord progressions, sounds, a seeded melody), played by the
// same step sequencer. Instead of a fixed song form, the arrangement follows the mission: it starts
// with drifting pads and adds arpeggio, bass, drums and the lead as the mission goes on, and in the
// last stretch it swells to a crescendo (a second lead an octave up, double-time hats, crashes, the
// filters opening). Threats on screen push it up; while the jump drive spools there's a riser.
//   music.setMission(id)   music.setIntensity(0..1)   music.setThreat(bool)   music.setJump(bool)

const music = (() => {
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Chord progressions (two bars per chord): bass root + pad voicing, in A before transposing.
  const P = {
    dream: [[45, [57, 60, 64, 67, 71]], [41, [53, 57, 60, 64, 71]], [48, [55, 59, 64, 67, 74]], [40, [55, 59, 62, 64, 66]]],   // Am9 Fmaj7#11 Cmaj7 Em9
    lift: [[38, [53, 57, 60, 62, 64]], [45, [57, 60, 64, 67, 71]], [41, [53, 57, 60, 64, 67]], [43, [55, 57, 60, 62, 67]]],     // Dm9 Am9 Fmaj9 G6sus
    drive: [[45, [57, 60, 64, 69]], [43, [55, 59, 62, 67]], [41, [53, 57, 60, 65]], [43, [55, 59, 62, 66]]],                  // Am G F G(#)
    dark: [[45, [57, 60, 63, 67]], [46, [58, 62, 65, 69]], [44, [56, 60, 63, 67]], [43, [55, 58, 62, 65]]],                   // Am(b3) Bb Ab Gm — Phrygian dread
    hero: [[41, [57, 60, 65, 69]], [43, [59, 62, 67, 71]], [45, [60, 64, 69, 72]], [40, [56, 59, 64, 68]]],                   // F G Am E — epic minor
    float: [[48, [60, 64, 67, 71]], [45, [57, 60, 64, 67]], [41, [57, 60, 64, 65]], [43, [55, 59, 62, 67]]],                  // Cmaj7 Am7 Fmaj7 G
    pulse: [[45, [57, 60, 64]], [45, [57, 60, 65]], [45, [57, 62, 65]], [44, [56, 59, 64]]],                                 // pedal on A, tense
    void: [[40, [52, 55, 59, 62]], [41, [53, 57, 60, 64]], [40, [52, 55, 58, 62]], [38, [50, 53, 57, 60]]],                   // Em7 Fmaj7 Em7b5 Dm7
  };
  // The pieces. bpm, key (semitones from A), progressions for the calm and the hot half, sounds.
  const SONGS = {
    nebula: { title: 'Duct Tape Nebula', bpm: 90, key: 0, a: 'dream', b: 'lift', pad: 'sawtooth', lead: 'sine', arp: [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 4, 3, 1], seed: 1 },
    rush: { title: 'Rush Hour in the Kessler Lanes', bpm: 112, key: 2, a: 'drive', b: 'hero', pad: 'sawtooth', lead: 'square', arp: [0, 1, 2, 3, 0, 1, 2, 3, 4, 3, 2, 1, 4, 3, 2, 1], seed: 2 },
    contract: { title: 'First Contract', bpm: 100, key: -2, a: 'float', b: 'drive', pad: 'triangle', lead: 'triangle', arp: [0, 2, 4, 2, 1, 3, 5, 3, 0, 2, 4, 6, 4, 2, 1, 3], seed: 11 },
    cargo: { title: 'Something in the Cargo', bpm: 84, key: 1, a: 'pulse', b: 'dark', pad: 'sawtooth', lead: 'sine', arp: [0, 0, 3, 0, 2, 0, 4, 0, 0, 0, 3, 0, 5, 0, 4, 2], seed: 12 },
    lab: { title: 'The Empty Lab', bpm: 78, key: -3, a: 'void', b: 'dream', pad: 'sine', lead: 'triangle', arp: [0, 3, 6, 3, 1, 4, 7, 4, 2, 5, 8, 5, 1, 4, 7, 4], seed: 13 },
    comet: { title: 'Red Comet Cove', bpm: 118, key: 3, a: 'drive', b: 'dark', pad: 'sawtooth', lead: 'square', arp: [0, 1, 2, 0, 1, 2, 3, 1, 2, 3, 4, 2, 3, 4, 5, 3], seed: 14 },
    rescue: { title: 'Hold On, Dr. Varga', bpm: 96, key: -5, a: 'lift', b: 'hero', pad: 'sawtooth', lead: 'sine', arp: [0, 2, 1, 3, 2, 4, 3, 5, 6, 4, 5, 3, 4, 2, 3, 1], seed: 15 },
    spores: { title: 'Spore Season', bpm: 88, key: 5, a: 'float', b: 'void', pad: 'triangle', lead: 'sine', arp: [0, 4, 1, 5, 2, 6, 3, 7, 0, 4, 1, 5, 2, 6, 3, 7], seed: 16 },
    deep: { title: 'The Deep', bpm: 72, key: -7, a: 'void', b: 'pulse', pad: 'sawtooth', lead: 'triangle', arp: [0, 0, 2, 0, 0, 3, 0, 0, 4, 0, 0, 2, 0, 3, 0, 1], seed: 17 },
    mother: { title: 'The Mother of All', bpm: 124, key: -1, a: 'dark', b: 'hero', pad: 'sawtooth', lead: 'square', arp: [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 6, 4, 2, 0, 1], seed: 18 },
    practice: { title: 'Free Play in the Hangar', bpm: 80, key: 4, a: 'float', b: 'dream', pad: 'triangle', lead: 'sine', arp: [0, 2, 4, 6, 4, 2, 1, 3, 5, 7, 5, 3, 2, 4, 6, 4], seed: 19 },
  };
  const MISSION_SONG = { intro: 'nebula', rush: 'rush', c1: 'contract', c2: 'cargo', c3: 'lab', salvage: 'lab', c4: 'comet', pirates: 'comet', c5: 'rescue', rescue: 'rescue',
                         c6: 'spores', ore: 'spores', c7: 'deep', deep: 'deep', c8: 'mother', nightmare: 'mother', practice: 'practice' };

  // A seeded melody per chord: chord tones on strong beats, passing notes in between.
  function rngOf(seed) { let a = seed * 9301 + 49297; return () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648); }
  function makeLead(prog, seed, busy) {
    const r = rngOf(seed);
    return prog.map(([, pad]) => {
      const tones = [...pad, ...pad.map(n => n + 12)].filter(n => n >= 64 && n <= 86), out = [];
      let at = 0;
      while (at < 32) {
        const len = [2, 4, 4, 6, 8, 8][Math.floor(r() * (busy ? 4 : 6))];
        out.push([at, tones[Math.floor(r() * tones.length)], Math.min(len, 32 - at)]);
        at += len + (r() < 0.2 ? 2 : 0);
      }
      return out;
    });
  }
  function build(name) {
    const S = SONGS[name] || SONGS.nebula, tr = (n) => n + S.key;
    const prog = (id) => P[id].map(([root, pad]) => ({ root: tr(root), pad: pad.map(tr) }));
    const a = prog(S.a), b = prog(S.b);
    return { ...S, STEP: 60 / S.bpm / 4, progA: a, progB: b, leadA: makeLead(P[S.a].map(([r, p]) => [tr(r), p.map(tr)]), S.seed, false), leadB: makeLead(P[S.b].map(([r, p]) => [tr(r), p.map(tr)]), S.seed + 100, true) };
  }

  let song = build('nebula');
  let ac, bus, reverb, delay, noiseBuf, step = 0, next = 0, threat = 0, intensity = 0.15, jumping = false, level = 0.15;

  function impulse(seconds) {
    const len = ac.sampleRate * seconds, buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    return buf;
  }
  function start(ctx, out, noise) {
    ac = ctx; noiseBuf = noise;
    bus = ac.createGain(); bus.gain.value = 0.55; bus.connect(out);
    reverb = ac.createConvolver(); reverb.buffer = impulse(3.8);
    const rv = ac.createGain(); rv.gain.value = 0.55; reverb.connect(rv); rv.connect(bus);
    delay = ac.createDelay(1); delay.delayTime.value = song.STEP * 3;
    const fb = ac.createGain(), dl = ac.createBiquadFilter();
    fb.gain.value = 0.38; dl.type = 'lowpass'; dl.frequency.value = 2200;
    delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(bus); dl.connect(reverb);
    next = ac.currentTime + 0.1;
    setInterval(schedule, 25);
  }
  function route(node, dry, rev, dly) {
    const d = ac.createGain(); d.gain.value = dry; node.connect(d); d.connect(bus);
    if (rev) { const r = ac.createGain(); r.gain.value = rev; node.connect(r); r.connect(reverb); }
    if (dly) { const e = ac.createGain(); e.gain.value = dly; node.connect(e); e.connect(delay); }
  }
  function envGain(t, a, peak, hold, rel) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold); g.gain.linearRampToValueAtTime(0, t + a + hold + rel);
    return g;
  }
  function pad(notes, t, dur, bright) {
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700 + 1800 * bright; f.Q.value = 2;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.15; lg.gain.value = 500; lfo.connect(lg); lg.connect(f.frequency);
    const g = envGain(t, 1.4, 0.035, dur - 1.4, 2.2);
    f.connect(g); route(g, 0.6, 0.9, 0);
    for (const n of notes) for (const det of [-8, 7]) {
      const o = ac.createOscillator(); o.type = song.pad; o.frequency.value = mtof(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 2.4);
    }
    lfo.start(t); lfo.stop(t + dur + 2.4);
  }
  function arp(n, t, vel) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'square'; o.frequency.value = o2.frequency.value = mtof(n); o2.detune.value = 5;
    f.type = 'lowpass'; f.frequency.setValueAtTime(2400 + 2400 * level, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    const g2 = ac.createGain(); g2.gain.value = 0.25;
    const g = envGain(t, 0.004, 0.06 * vel, 0.02, 0.28);
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); route(g, 0.7, 0.35, 0.45);
    o.start(t); o2.start(t); o.stop(t + 0.4); o2.stop(t + 0.4);
  }
  function bass(n, t, dur) {
    const o = ac.createOscillator(), sub = ac.createOscillator(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; sub.type = 'sine'; o.frequency.value = mtof(n); sub.frequency.value = mtof(n - 12);
    f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(700 + 600 * level, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = envGain(t, 0.008, 0.11, dur * 0.5, dur * 0.45), sg = ac.createGain(); sg.gain.value = 0.9;
    o.connect(f); f.connect(g); sub.connect(sg); sg.connect(g); route(g, 1, 0.05, 0);
    o.start(t); sub.start(t); o.stop(t + dur + 0.05); sub.stop(t + dur + 0.05);
  }
  function lead(n, t, dur, vol = 0.07) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), vib = ac.createOscillator(), vg = ac.createGain();
    o.type = song.lead; o2.type = 'triangle'; o.frequency.value = mtof(n); o2.frequency.value = mtof(n + 12);
    vib.frequency.value = 5.2; vg.gain.value = 6; vib.connect(vg); vg.connect(o.detune); vg.connect(o2.detune);
    const g = envGain(t, 0.06, song.lead === 'square' ? vol * 0.45 : vol, Math.max(0, dur - 0.1), 0.5), g2 = ac.createGain(); g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2); g2.connect(g); route(g, 0.6, 0.8, 0.35);
    for (const x of [o, o2, vib]) { x.start(t); x.stop(t + dur + 0.6); }
  }
  function kick(t) {
    const o = ac.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.3);
    const g = envGain(t, 0.002, 0.42, 0.04, 0.3); o.connect(g); route(g, 1, 0, 0);
    o.start(t); o.stop(t + 0.4);
  }
  function noiseHit(t, type, freq, peak, len, rev) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
    const g = envGain(t, 0.002, peak, 0.005, len); s.connect(f); f.connect(g); route(g, 1, rev, 0);
    s.start(t, Math.random() * 0.5); s.stop(t + len + 0.05);
  }
  function riser(t, dur) {                               // the jump drive spooling: a noise sweep upwards
    const s = ac.createBufferSource(), f = ac.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.Q.value = 4;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.1);
    s.connect(f); f.connect(g); route(g, 1, 0.5, 0); s.start(t); s.stop(t + dur + 0.2);
  }

  // What plays at a given level of intensity (0 calm … 1 the very end).
  const layersAt = (k) => ({
    pad: true, arp: k > 0.18, bass: k > 0.35, hats: k > 0.35, kick: k > 0.5, snare: k > 0.62, lead: k > 0.62,
    lead2: k > 0.82, hats16: k > 0.82, crash: k > 0.82, hot: k > 0.5,
  });
  function scheduleStep(st, t) {
    const bar = Math.floor(st / 16), s16 = st % 16, k = level, L0 = layersAt(k);
    const prog = L0.hot ? song.progB : song.progA, leadSet = L0.hot ? song.leadB : song.leadA;
    const chordIdx = Math.floor(bar / 2) % 4, chord = prog[chordIdx], inChord = (bar % 2) * 16 + s16;
    if (inChord === 0) pad(chord.pad, t, song.STEP * 32, k);
    if (L0.arp) { const tones = [...chord.pad, ...chord.pad.map(n => n + 12)]; arp(tones[song.arp[s16] % tones.length] + (L0.lead2 && s16 % 2 ? 12 : 0), t, s16 % 4 === 0 ? 1 : 0.7); }
    if (L0.bass && s16 % 2 === 0) bass(chord.root + (s16 % 8 === 4 ? 12 : 0), t, song.STEP * 1.8);
    if (L0.kick && (s16 === 0 || s16 === 8 || (s16 === 14 && bar % 2) || (L0.lead2 && s16 === 4))) kick(t);
    if (L0.snare && (s16 === 4 || s16 === 12)) noiseHit(t, 'bandpass', 1900, 0.16, 0.18, 0.4);
    if (L0.snare && bar % 8 === 7 && s16 >= 12) noiseHit(t, 'bandpass', 1700 + s16 * 60, 0.12, 0.1, 0.3);   // fill into the next phrase
    if (L0.hats && (L0.hats16 || s16 % 2 === 1)) noiseHit(t, 'highpass', 7500, s16 % 4 === 3 ? 0.05 : 0.025, 0.04, 0.1);
    if (L0.crash && bar % 8 === 0 && s16 === 0) noiseHit(t, 'highpass', 4000, 0.12, 1.4, 0.6);
    if (L0.lead) for (const [at, n, len] of leadSet[chordIdx]) if (at === inChord) { lead(n, t, len * song.STEP); if (L0.lead2) lead(n + 12, t, len * song.STEP, 0.035); }
    if (jumping && st % 32 === 0) riser(t, song.STEP * 32);
    if (jumping && s16 % 2 === 0) noiseHit(t, 'bandpass', 2200, 0.08 + 0.004 * s16, 0.06, 0.2);              // snare roll
  }
  function schedule() {
    if (!ac) return;
    if (next < ac.currentTime - 0.2) next = ac.currentTime + 0.05;   // tab was in the background: skip ahead
    level = lerp(level, clamp(intensity + threat * 0.15 + (jumping ? 0.2 : 0), 0, 1), 0.02);   // ease towards the target
    while (next < ac.currentTime + 0.15) { scheduleStep(step, next); step++; next += song.STEP; }
  }

  sfx.onReady(start);
  return {
    get title() { return song.title; },
    setMission(id) { const n = MISSION_SONG[id] || 'nebula'; if (song.name === n) return; song = { ...build(n), name: n }; if (delay) delay.delayTime.value = song.STEP * 3; },
    setIntensity(k) { intensity = clamp(k, 0, 1); },
    setThreat(on) { threat = on ? 1 : 0; },
    setJump(on) { jumping = !!on; },
    songOf: (id) => (SONGS[MISSION_SONG[id] || 'nebula'] || SONGS.nebula).title,
  };
})();
