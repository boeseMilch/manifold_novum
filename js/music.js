// "Duct Tape Nebula": an original, fully synthesized space track (WebAudio, no files).
// A step sequencer schedules 16th notes slightly ahead of time. The song is ~4.6 min long
// and loops: reverb pads, a delayed arpeggio, a pulsing bass, soft drums and a lead.
// While threats are around, bass and drums play no matter which section the song is in.

const music = (() => {
  const BPM = 90, STEP = 60 / BPM / 4;              // one 16th note in seconds
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Chords: bass root + pad voicing (MIDI). Each lasts two bars.
  const PROG_A = [
    { root: 45, pad: [57, 60, 64, 67, 71] },        // Am9
    { root: 41, pad: [53, 57, 60, 64, 71] },        // Fmaj7#11
    { root: 48, pad: [55, 59, 64, 67, 74] },        // Cmaj7
    { root: 40, pad: [55, 59, 62, 64, 66] },        // Em9
  ];
  const PROG_B = [
    { root: 38, pad: [53, 57, 60, 62, 64] },        // Dm9
    { root: 45, pad: [57, 60, 64, 67, 71] },        // Am9
    { root: 41, pad: [53, 57, 60, 64, 67] },        // Fmaj9
    { root: 43, pad: [55, 57, 60, 62, 67] },        // G6sus
  ];
  // Lead phrases per chord: [16th within the two bars, note, length in 16ths]
  const LEAD_A = [
    [[0, 76, 6], [6, 74, 2], [8, 72, 4], [12, 69, 4], [16, 71, 8], [24, 72, 4], [28, 74, 4]],
    [[0, 76, 8], [8, 77, 4], [12, 76, 4], [16, 72, 12], [28, 69, 4]],
    [[0, 67, 4], [4, 72, 4], [8, 76, 8], [16, 79, 6], [22, 77, 2], [24, 76, 8]],
    [[0, 74, 8], [8, 71, 4], [12, 67, 4], [16, 69, 16]],
  ];
  const LEAD_A2 = [
    [[0, 81, 4], [4, 79, 4], [8, 76, 8], [16, 74, 4], [20, 76, 4], [24, 72, 8]],
    [[0, 77, 6], [6, 76, 2], [8, 72, 8], [16, 76, 8], [24, 81, 8]],
    [[0, 79, 8], [8, 76, 4], [12, 74, 4], [16, 76, 6], [22, 79, 2], [24, 83, 8]],
    [[0, 81, 12], [12, 79, 4], [16, 76, 16]],
  ];
  const LEAD_B = [
    [[0, 77, 16], [16, 76, 16]],
    [[0, 72, 12], [12, 76, 4], [16, 79, 16]],
    [[0, 81, 16], [16, 79, 8], [24, 77, 8]],
    [[0, 74, 24], [24, 72, 8]],
  ];
  // Song form: name, bars, progression, lead, layers
  const SECTIONS = [
    { bars: 8, prog: PROG_A, layers: 'pad' },                          // intro: drifting
    { bars: 16, prog: PROG_A, layers: 'pad arp' },
    { bars: 16, prog: PROG_A, layers: 'pad arp bass hats' },
    { bars: 16, prog: PROG_A, lead: LEAD_A, layers: 'pad arp bass hats kick snare lead' },
    { bars: 8, prog: PROG_B, lead: LEAD_B, layers: 'pad lead' },       // breakdown
    { bars: 16, prog: PROG_B, layers: 'pad arp bass hats kick' },
    { bars: 16, prog: PROG_A, lead: LEAD_A2, layers: 'pad arp bass hats kick snare lead' },
    { bars: 8, prog: PROG_A, layers: 'pad arp' },                      // outro
  ];
  const TOTAL_BARS = SECTIONS.reduce((a, s) => a + s.bars, 0);
  const ARP = [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7, 6, 4, 3, 1];      // indices into the chord over two octaves

  let ac, bus, reverb, delay, noiseBuf, step = 0, next = 0, threat = 0;

  function impulse(seconds) {                       // synthetic reverb tail
    const len = ac.sampleRate * seconds, buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  function start(ctx, out, noise) {
    ac = ctx; noiseBuf = noise;
    bus = ac.createGain(); bus.gain.value = 0.55; bus.connect(out);
    reverb = ac.createConvolver(); reverb.buffer = impulse(3.8);
    const rv = ac.createGain(); rv.gain.value = 0.55; reverb.connect(rv); rv.connect(bus);
    delay = ac.createDelay(1); delay.delayTime.value = STEP * 3;      // dotted-eighth echo
    const fb = ac.createGain(), dl = ac.createBiquadFilter();
    fb.gain.value = 0.38; dl.type = 'lowpass'; dl.frequency.value = 2200;
    delay.connect(dl); dl.connect(fb); fb.connect(delay); dl.connect(bus); dl.connect(reverb);
    next = ac.currentTime + 0.1;
    setInterval(schedule, 25);
  }

  // Route a voice to the dry bus plus reverb / delay sends.
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

  function pad(notes, t, dur) {
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 2;
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.15; lg.gain.value = 500; lfo.connect(lg); lg.connect(f.frequency);
    const g = envGain(t, 1.4, 0.035, dur - 1.4, 2.2);
    f.connect(g); route(g, 0.6, 0.9, 0);
    for (const n of notes) for (const det of [-8, 7]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 2.4);
    }
    lfo.start(t); lfo.stop(t + dur + 2.4);
  }
  function arp(n, t, vel) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter();
    o.type = 'triangle'; o2.type = 'square'; o.frequency.value = o2.frequency.value = mtof(n); o2.detune.value = 5;
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    const g2 = ac.createGain(); g2.gain.value = 0.25;
    const g = envGain(t, 0.004, 0.06 * vel, 0.02, 0.28);
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); route(g, 0.7, 0.35, 0.45);
    o.start(t); o2.start(t); o.stop(t + 0.4); o2.stop(t + 0.4);
  }
  function bass(n, t, dur) {
    const o = ac.createOscillator(), sub = ac.createOscillator(), f = ac.createBiquadFilter();
    o.type = 'sawtooth'; sub.type = 'sine'; o.frequency.value = mtof(n); sub.frequency.value = mtof(n - 12);
    f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g = envGain(t, 0.008, 0.11, dur * 0.5, dur * 0.45);
    const sg = ac.createGain(); sg.gain.value = 0.9;
    o.connect(f); f.connect(g); sub.connect(sg); sg.connect(g); route(g, 1, 0.05, 0);
    o.start(t); sub.start(t); o.stop(t + dur + 0.05); sub.stop(t + dur + 0.05);
  }
  function lead(n, t, dur) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), vib = ac.createOscillator(), vg = ac.createGain();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = mtof(n); o2.frequency.value = mtof(n + 12);
    vib.frequency.value = 5.2; vg.gain.value = 6; vib.connect(vg); vg.connect(o.detune); vg.connect(o2.detune);
    const g = envGain(t, 0.06, 0.07, Math.max(0, dur - 0.1), 0.5), g2 = ac.createGain(); g2.gain.value = 0.18;
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

  function sectionAt(bar) {
    let b = bar % TOTAL_BARS;
    for (const s of SECTIONS) { if (b < s.bars) return [s, b]; b -= s.bars; }
    return [SECTIONS[0], 0];
  }

  function scheduleStep(st, t) {
    const bar = Math.floor(st / 16), s16 = st % 16;
    const [sec, secBar] = sectionAt(bar);
    const on = (layer) => sec.layers.includes(layer) || (threat > 0 && ['bass', 'hats', 'kick'].includes(layer));
    const chordIdx = Math.floor(secBar / 2) % 4, chord = sec.prog[chordIdx], inChord = (secBar % 2) * 16 + s16;
    if (inChord === 0 && on('pad')) pad(chord.pad, t, STEP * 32);
    if (on('arp')) {
      const tones = [...chord.pad, ...chord.pad.map(n => n + 12)];
      arp(tones[ARP[s16] % tones.length], t, s16 % 4 === 0 ? 1 : 0.7);
    }
    if (on('bass') && s16 % 2 === 0) bass(chord.root + (s16 % 8 === 4 ? 12 : 0), t, STEP * 1.8);
    if (on('kick') && (s16 === 0 || s16 === 8 || (s16 === 14 && secBar % 2))) kick(t);
    if (on('snare') && (s16 === 4 || s16 === 12)) noiseHit(t, 'bandpass', 1900, 0.16, 0.18, 0.4);
    if (on('hats') && s16 % 2 === 1) noiseHit(t, 'highpass', 7500, s16 % 4 === 3 ? 0.05 : 0.025, 0.04, 0.1);
    if (sec.lead && on('lead')) {
      for (const [at, n, len] of sec.lead[chordIdx]) if (at === inChord) lead(n, t, len * STEP);
    }
  }

  function schedule() {
    if (!ac) return;
    if (next < ac.currentTime - 0.2) next = ac.currentTime + 0.05;   // tab was in the background: skip ahead
    while (next < ac.currentTime + 0.15) { scheduleStep(step, next); step++; next += STEP; }
  }

  sfx.onReady(start);
  return {
    title: 'Duct Tape Nebula',
    setThreat(on) { threat = on ? 1 : 0; },
  };
})();
