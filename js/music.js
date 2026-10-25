// The soundtrack: an original, fully synthesized cinematic score (WebAudio, no files, no dependencies).
//
// Seven hand-written pieces, shared by the missions (PIECES below). Each one is ONE piece of music: one
// tempo, one key, one grid (4/4 in 16ths, or 6/8 in 12 steps), two 8-bar sections (A: the verse, B: the
// hook) with their chord progressions and a composed theme, a spool progression for the jump and the
// chord it lands on. Every part takes its notes from the same bar's chord, so nothing plays against
// anything else.
//
// Each piece has its own identity: its own opening (a solo plucked line; a pulsing synth bass with a
// shaker; a stomp-and-clap with an accordion; radio static with the theme on a distant radio horn; a low
// choir with popping spores; a sonar ping and a heartbeat; a ticking clock with a music box), its own
// lead (detuned saw, whistle-flute, accordion reed, horn, FM glass, cello), its own drums and feel
// (taikos, a swung kit, a 6/8 stomp, hand drums, half time, driving 16ths) and its own build order: the
// `parts` table says from which stage to which stage each layer plays.
//
// Stages (0..6) follow the mission progress (setIntensity, the time towards the jump); a threat pushes
// it up one stage (held for a while after it's gone). Every piece reaches its climax at stage 6: the
// theme doubled by strings an octave up, brass swells and stabs, full drums.
//   7 the jump drive spools (setJump): the bVI-bVII spool chords (one a bar), snare rolls and a crash in
//     2-bar waves, for as long as it takes. Over them an endless rise instead of a loop: a Shepard scale
//     (shepard(): six octave-spaced sines under a fixed bell, C2..C8, centre C5) stepping up through the
//     piece's natural minor, one note a beat (an 8th in 6/8), chord tones on 1 and 3, never resetting; under
//     it a Shepard-Risset glissando (the same bell, six sines sliding up an octave every 2 bars, or 4 when
//     2 bars are shorter than 4 s) in place of the noise riser. jumped(): the cadence chord takes over on
//     the grid and the final hit lands within one bar on the home chord in MAJOR, then it rings out and
//     stays quiet.
// Stages only move on bar lines: up after a one-bar drum fill, down only at a phrase start.
// Exactly one sequencer exists; switching pieces fades the old one out (tails included) and starts the
// new one on its first step. The music pauses while the browser tab is hidden (two open tabs never play
// over each other; the game itself keeps running).
//   music.setMission(id)  setIntensity(0..1)  setThreat(bool)  setJump(bool)  jumped()  rearm()
//   music.title  songOf(id)  list()  setSong(name)  setPaused(bool)  reset()  level  stage  section  step
// music.html is a little player for the pieces; tests/music.js checks the composition and the engine.
//
// Pieces in js/music/<name>.js: music.define(recipe) with the score (see below) and, optionally:
//   hooks.bar(x) / hooks.step(x)    the piece's own layers per bar / per 16th (x: stage st, has(layer), chord c,
//                                   voice, t, bar b, ..., build, bk (breakdown bar or -1), drop, ending)
//   hooks.theme(x, note, at, len)   its own voices for the theme;  hooks.ost(m, t, a, st)  its ostinato instrument
//   hooks.drums(x)                  its kit (replaces the engine's taiko kit);  hooks.finale(x)  its last word
//   hooks.endingPlanned(x)          called when jumped() plans the ending (x.T, x.from, x.cad, x.notes, x.hush)
// The engine's percussion and transition gestures: hooks.<name>(x) runs first; returning true / 'handled'
// replaces the engine's version, noEngine: ['<name>'] switches it off:
//   fill        the one-bar fill before a stage change: called once at the bar start with x.r === -1, x.from,
//               x.to (return 'skip' there: no fill into that stage, a normal bar), then per step (x.r, x.big)
//   build       the build bar's roll before the beat of silence (per step, x.k 0..1); buildSweep: its riser
//   dropHit     the drop's boom, crash, taiko;   accent: the phrase-start crashes / booms
//   spoolWave   the spool's crash and riser (every 2 bars, x.cb 0..1; the engine's riser is the Shepard glissando);
//               spoolPerc: the spool's rolls (per step, x.cb, x.k 0..1 over the 2-bar wave)
//   shepard     the spool's endless Shepard line (per bar; x.line: [{ s, t, pc, len, strong }] the notes it would play)
//   endFill     the fill into the final hit (per step, x.k);   finalHit: the final hit's boom, crash, taikos
//   cadence     the cadence voices into the final hit;   pad: the pad / choir renewal (hold your own with
//               K.hold('pad', release) and the engine renews it)
// Recipe switches: noEngine: [...] also takes 'shepard' (no Shepard line or glissando: the noise riser instead),
// shepRate: steps per Shepard note (default 4 in 4/4, 2 in 6/8), 'drums' (the engine kit), 'stabs', and single engine instruments
// inside the gestures ('taiko', 'kick', 'snare', 'clap', 'hat', 'crash', 'tom', 'boom', 'riser');
// engineDrums: false = all engine drums off (risers stay); breakdownSkip: [...] keeps layers out of breakdowns;
// groove: [...] comes back first in a breakdown's rebuild. The arc (beat of silence, drops, breakdowns) stays here.
// music.kit: the engine's clock, buses and shared instruments for piece files (K.hold, K.releaseHeld, K.hush, K.ending).

const music = (() => {
  // ---------------------------------------------------------------- the score
  // Themes: one string per bar, one slot per 8th note (8 in 4/4, 6 in 6/8): a note name starts a note,
  // '_' holds it, '.' rests. Ostinato: one step per 16th, chord tones 0 root, 1 fifth, 2 octave, 3 tenth
  // (third + octave), 4 fifth + octave, '.' rest.
  // parts: layer → [first stage, last stage] (a number: from that stage on).
  const PIECES = [
    { name: 'held', title: 'Held Together', bpm: 100, key: 'D', missions: ['menu', 'practice', 'custom'],
      mood: 'the crew\'s theme (kept from the first score): a drone, a dark pad and bells, then taikos and the horn',
      lead: 'horn', ostInst: 'pluck', drums: 'taiko', classic: true,       // classic: plays exactly as in the first score
      parts: { drone: [0, 4], pad: 0, bells: [0, 4], ost: 2, ost16: 3, drums: 2, bass: 3, hats: 3, snare: 4, theme: 4, brass: 5, stabs: 6, strings: 6 },
      A: { chords: 'Dm Dm Bb Bb F F C C', theme: [
        'D4 _ _ A4 _ _ D5 _', 'F5 _ _ _ D5 _ E5 _', 'D5 _ _ _ _ _ C5 _', 'Bb4 _ _ _ F4 _ _ _',
        'A4 _ _ C5 _ _ F5 _', 'F5 _ _ _ C5 _ E5 _', 'E5 _ _ _ G5 _ C5 _', 'G4 _ _ _ _ _ . .'] },
      B: { chords: 'Gm Gm Bb C Dm Dm C A', theme: [
        'D5 _ _ G5 _ _ A5 _', 'Bb5 _ _ _ G5 _ _ _', 'F5 _ _ _ _ _ D5 _', 'E5 _ _ _ G5 _ _ _',
        'A5 _ _ _ _ _ F5 _', 'D5 _ _ _ A4 _ F5 _', 'G5 _ _ _ E5 _ C5 _', 'C#5 _ _ _ E5 _ _ _'] },
      spool: 'Bb C', end: 'D', ost: '0 0 2 0 1 0 2 0 0 0 2 0 3 1 2 1' },
  ];

  // ---------------------------------------------------------------- notes and chords
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = (s) => (s === '#' ? 1 : s === 'b' ? -1 : 0);
  const midiOf = (s) => { const m = /^([A-G])([#b]?)(\d)$/.exec(s); if (!m) throw new Error('bad note ' + s); return 12 * (+m[3] + 1) + PC[m[1]] + acc(m[2]); };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const chordOf = (s) => {
    const m = /^([A-G])([#b]?)(m?)$/.exec(s); if (!m) throw new Error('bad chord ' + s);
    const root = (PC[m[1]] + acc(m[2]) + 12) % 12, third = m[3] ? 3 : 4;
    return { name: s, root, third, pcs: [root, (root + third) % 12, (root + 7) % 12] };
  };
  const parseBar = (s, slots) => {
    const out = [], toks = s.trim().split(/\s+/);
    if (toks.length !== slots) throw new Error(`a theme bar needs ${slots} slots: ${s}`);
    let open = null;
    toks.forEach((x, i) => {
      if (x === '_') { if (open) open.len++; } else if (x === '.') open = null;
      else { open = { slot: i, len: 1, midi: midiOf(x) }; out.push(open); }
    });
    return out;
  };
  const compile = (p) => {
    const meter = p.meter || 16;
    const sec = (s) => {
      const chords = s.chords.split(/\s+/).map(chordOf);
      if (chords.length !== 8 || s.theme.length !== 8) throw new Error(p.name + ': a section is 8 bars');
      return { chords, theme: s.theme.map(b => parseBar(b, meter / 2)) };
    };
    const ost = p.ost.split(/\s+/).map(x => (x === '.' ? -1 : +x));
    if (ost.length !== meter) throw new Error(p.name + ': the ostinato is one bar');
    const parts = {};
    for (const [k, v] of Object.entries(p.parts)) parts[k] = Array.isArray(v) ? v : [v, 6];
    return { ...p, meter, swing: p.swing || 0, parts, A: sec(p.A), B: sec(p.B), spool: p.spool.split(/\s+/).map(chordOf), end: chordOf(p.end),
      ost, tonic: chordOf(p.key).root, hooks: p.hooks || {}, groove: p.groove || [],
      noEngine: new Set(p.noEngine || []), engineDrums: p.engineDrums !== false, breakdownSkip: p.breakdownSkip || [] };
  };
  const SONGS = PIECES.map(compile), BY_MISSION = {};
  for (const s of SONGS) for (const id of s.missions) BY_MISSION[id] = s;
  // music.define(recipe): a piece from js/music/<name>.js joins the score (see the recipe format above; hooks below).
  function define(p) {
    const s = compile(p), old = SONGS.findIndex(x => x.name === s.name);
    if (old >= 0) SONGS[old] = s; else SONGS.push(s);
    for (const id of s.missions) BY_MISSION[id] = s;
    return s;
  }
  const songFor = (id) => BY_MISSION[id] || SONGS[0];
  const inRange = (pc, lo) => lo + ((pc - lo % 12 + 24) % 12);           // the pitch class in [lo, lo + 12)
  const bassRoot = (c) => inRange(c.root, 31);                            // G1 .. F#2
  function padVoicing(c, centre = 62) {                                   // 4 chord tones centred near D4: smooth voice leading
    const cand = []; for (let m = 50; m <= 81; m++) if (c.pcs.includes(m % 12)) cand.push(m);
    let best = null, bd = 1e9;
    for (let i = 0; i + 4 <= cand.length; i++) { const w = cand.slice(i, i + 4), d = Math.abs(w[0] + w[1] + w[2] + w[3] - 4 * centre); if (d < bd) { bd = d; best = w; } }
    return best;
  }
  // Which layers a piece plays at a stage (the spool, stage 7, plays the stage-6 band minus the melodic ones).
  const SPOOL_SKIP = ['theme', 'tines', 'radio', 'static', 'bubbles', 'sonar', 'heart', 'tick', 'strum', 'bells', 'drone'];
  const plays = (s, part, st) => {
    const r = s.parts[part]; if (!r) return false;
    if (st === 7) return !SPOOL_SKIP.includes(part) && r[1] >= 6;
    return st >= r[0] && st <= r[1];
  };

  // ---------------------------------------------------------------- state
  const LOOK = 0.15;                       // seconds scheduled ahead of the clock
  const TH = [0.04, 0.16, 0.27, 0.4, 0.58, 0.78];   // intensity → stage 1..6
  const BRIGHT = [0.08, 0.18, 0.3, 0.42, 0.55, 0.7, 0.85, 0.92];
  const VOL = 0.25;                        // the music's level (sound effects run at 0.25 next to it)
  let ac = null, out = null, noiseBuf = null, bus = null, irBuf = null, timer = null;
  let song = SONGS[0], pb = null;          // pb: this piece's own buses {dry, wet, echo}, faded out on a switch
  let step = 0, nextT = 0, startT = 0, stage = 0, pending = null, spoolBar = 0, bar = null, repad = false;
  let ending = null, shepDeg = -1, gliss = null;   // the Shepard line's scale degree (it never resets in a spool), the glissando
  let arc = { dropped: 0, broke: false, mode: null, next: null, log: [] };   // the dynamic arc (drops, breakdown) of this run                       // the planned ending after jumped(): { T (the final downbeat), from (the cadence starts), cad }
  let intensity = 0, threat = false, threatT = null, jumpOn = false, ended = false, paused = false, hidden = false;
  let held = [];                           // sustained voices (pads, drone, choir, static): released on changes and switches
  let vnow = null;                         // offline rendering: the virtual clock
  const now = () => (vnow !== null ? vnow : ac.currentTime);
  const stepDur = () => 60 / song.bpm / 4;
  const silent = () => paused || hidden;
  const hash = (n) => (((n * 2654435761) >>> 0) % 1000) / 1000;        // deterministic "random" per step
  // Swing: the off-beat 8ths (and the 16ths in between) come a little late.
  const swing = (s) => (song.swing ? (s % 4 === 2 ? song.swing : s % 2 ? song.swing * 0.5 : 0) * stepDur() : 0);

  // A threat counts until THREAT_HOLD s after it's gone, so fights that flicker on and off don't flip the arrangement.
  const THREAT_HOLD = 20;
  const threatOn = () => threat || (ac && threatT !== null && now() - threatT < THREAT_HOLD);
  function target() {
    let s = 0; for (const t of TH) if (intensity >= t) s++;
    if (threatOn()) s = Math.max(s, Math.min(5, Math.max(3, s + 1)));    // enemies: drums in, but the climax waits for the jump
    return s;
  }

  // ---------------------------------------------------------------- audio graph
  // Each piece has its own buses, reverb and echo behind one fader: switching pieces (or the final hit) fades
  // all of it, tails included, so nothing of the old piece rings on under the new one.
  function makeBuses() {
    const b = { fader: ac.createGain(), dry: ac.createGain(), wet: ac.createGain(), echo: ac.createGain() };
    b.dry.gain.value = 1; b.wet.gain.value = song.classic ? 0.33 : 0.55; b.echo.gain.value = 0.35;   // (more room for the new pieces: see PLAN.md, the reference analysis)
    b.fader.connect(bus); b.dry.connect(b.fader);
    const verb = ac.createConvolver(), vlp = filt('lowpass', 5200);
    verb.buffer = irBuf; b.wet.connect(verb); verb.connect(vlp); vlp.connect(b.fader);
    const dly = ac.createDelay(2), fb = ac.createGain(), dlp = filt('lowpass', 2600);       // a dotted-8th echo, darker every repeat
    dly.delayTime.value = stepDur() * 3; fb.gain.value = 0.38;
    b.echo.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly); dlp.connect(b.fader); dlp.connect(b.wet);
    b.all = [b.fader, b.dry, b.wet, b.echo, verb, vlp, dly, fb, dlp];
    return b;
  }
  function fadeBuses(b, t, tc = 0.15) {
    if (!b) return;
    b.fader.gain.cancelScheduledValues(t); b.fader.gain.setTargetAtTime(0, t, tc);
    if (vnow === null) setTimeout(() => { for (const n of b.all) try { n.disconnect(); } catch (e) { /* gone */ } }, 3000);   // (not offline: wall-clock time)
  }
  function attach(ctx, dest, noise, offline) {
    ac = ctx; out = dest; noiseBuf = noise;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.25;
    bus = ac.createGain(); bus.gain.value = silent() ? 0 : VOL;
    bus.connect(comp); comp.connect(out);
    const len = Math.floor(ac.sampleRate * 2.8);                   // the reverb: a generated stereo hall tail (~2.8 s)
    irBuf = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = irBuf.getChannelData(ch);
      for (let i = 0; i < len; i++) { const k = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.6) * (i < 400 ? i / 400 : 1); }
    }
    begin(song);
    if (!offline) timer = setInterval(tick, 25);
  }

  // ---------------------------------------------------------------- instruments
  const env = (g, t, a, peak, hold, tc) => {               // attack, hold, exponential-ish release
    g.gain.value = 0;                                      // (a new gain is at 1 until its first event: silent from the start, no click)
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold); g.gain.setTargetAtTime(0, t + a + hold, tc);
  };
  // A gain for an envelope: created at 0. (A new GainNode plays at 1 until its first scheduled event, so a source
  // starting a hair before it lets a full-level sample through: a click in real time that offline renders never show.)
  function vca() { const g = ac.createGain(); g.gain.value = 0; return g; }
  function osc(type, f, t, end, detune) {
    const o = ac.createOscillator(); o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune;
    o.start(t); o.stop(end); return o;
  }
  function filt(type, f, q) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
  function noiseSrc(t, end) { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random() * 0.8); s.stop(end); return s; }
  function pan(node, p) {
    if (!ac.createStereoPanner) return node;
    const n = ac.createStereoPanner(); n.pan.value = p; node.connect(n); return n;
  }
  function route(node, wet, echo) { node.connect(pb.dry); if (wet) node.connect(pb.wet); if (echo) node.connect(pb.echo); }
  // A held voice: oscillators running until release(r) fades the gain and stops them.
  function holder(os, g, vel, tc, stopAfter = tc * 7, glide) {
    return (r) => { g.gain.cancelScheduledValues(r); if (!glide) g.gain.setValueAtTime(vel, r); g.gain.setTargetAtTime(0, r, tc); os.forEach(o => o.stop(r + stopAfter)); };
  }

  // A plucked, slightly out-of-tune string: saw + square a few cents apart, a snappy filter.
  function pluck(m, t, vel, bright, p = 0) {
    const f = hz(m), end = t + 0.4, lp = filt('lowpass', 0, 4), g = vca();
    lp.frequency.setValueAtTime(500 + 2800 * bright, t); lp.frequency.exponentialRampToValueAtTime(160 + f, t + 0.16);
    osc('sawtooth', f, t, end).connect(lp); osc('square', f, t, end, 8).connect(lp);
    env(g, t, 0.004, vel, 0.01, 0.07); lp.connect(g); route(p ? pan(g, p) : g, false, true);
  }
  // A held pad: the 4-note voicing on two detuned saw layers, panned apart. Returns its release.
  function pad(voice, t, vel, bright, sides = [-1, 1]) {
    const parts = [];
    for (const side of sides) {
      const lp = filt('lowpass', 0, 0.8), g = vca();
      const br = song.classic ? 1 : 1.5;
      lp.frequency.setValueAtTime((350 + 1800 * bright) * br, t); lp.frequency.linearRampToValueAtTime((500 + 2600 * bright) * br, t + 3);
      const os = voice.map(m => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = side * 9; o.start(t); o.connect(lp); return o; });
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.5);
      lp.connect(g); route(pan(g, side * (song.classic ? 0.55 : 0.85)), true, false);
      parts.push(holder(os, g, vel, 0.25, 1.6));
    }
    return (r) => parts.forEach(p => p(r));
  }
  // A low choir ("ooh"): the voicing an octave down on saws through two vowel formants, slow vibrato.
  function choir(voice, t, vel) {
    const g = vca(), f1 = filt('bandpass', 380, 3), f2 = filt('bandpass', 900, 4);
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 4.7; lg.gain.value = 8; lfo.connect(lg); lfo.start(t);
    const os = voice.map((m, i) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m - (i < 2 ? 12 : 0)); o.detune.value = (i - 1.5) * 6; lg.connect(o.detune); o.start(t); o.connect(f1); o.connect(f2); return o; });
    f1.connect(g); f2.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 1.2); route(pan(g, -0.15), true, false);
    return holder([...os, lfo], g, vel, 0.4);
  }
  // The low drone: a sine root and a filtered saw. Returns its release.
  function drone(m, t, vel) {
    const g = vca(), lp = filt('lowpass', 220, 1), a = ac.createOscillator(), b = ac.createOscillator();
    a.type = 'sine'; a.frequency.value = hz(m); b.type = 'sawtooth'; b.frequency.value = hz(m) * 1.002;
    a.connect(g); b.connect(lp); lp.connect(g); a.start(t); b.start(t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 2.5); route(g, true, false);
    return holder([a, b], g, vel, 0.8, 5, true);
  }
  // A small bell (glockenspiel-ish): a sine and an inharmonic overtone that dies first.
  function bell(m, t, vel, p) {
    const f = hz(m), g = vca(), g2 = vca();
    osc('sine', f, t, t + (song.classic ? 2 : 3.2)).connect(g); osc('sine', f * 2.76, t, t + 0.6).connect(g2); g2.connect(g);   // (stops once the tail is silent; Held Together as it was)
    env(g, t, 0.003, vel, 0, 0.45); env(g2, t, 0.002, 0.35, 0, 0.08);
    route(pan(g, p), true, true);
  }
  function bass(m, t, len, vel) {
    if (!song.classic) vel *= 0.55;                       // (the new pieces: less low-mid weight, see the analysis)
    const f = hz(m), end = t + len + 0.3, lp = filt('lowpass', 0, 2), g = vca();
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.12);
    osc('sawtooth', f, t, end).connect(lp); osc('sine', f, t, end).connect(g);
    lp.connect(g); env(g, t, 0.006, vel, Math.max(0, len - 0.05), 0.04); route(g, false, false);
  }
  // The theme. Timbres: horn (two saws, vibrato, a breathy filter swell), strings (the climax double),
  // saw (a bright detuned synth lead), flute (a whistle: sine, a breath of noise), reed (accordion),
  // fm (glassy FM bell lead), cello (dark, slow bow), radio (a horn on a far-away radio).
  function lead(m, t, len, vel, type) {
    const f = hz(m), g = vca();
    const V = { horn: [5.0, 0.005, 0.05, 0.1], strings: [5.6, 0.007, 0.16, 0.18], saw: [5.5, 0.004, 0.02, 0.09], flute: [5.2, 0.009, 0.07, 0.08],
      reed: [6.3, 0.004, 0.03, 0.05], fm: [0, 0, 0.005, 0.25], cello: [5.0, 0.008, 0.15, 0.2], radio: [5.0, 0.004, 0.05, 0.1], voice: [5.4, 0.01, 0.12, 0.2] }[type];
    const [rate, depth, att, rel] = V, end = t + len + (song.classic ? 0.8 : Math.max(0.8, rel * 7));   // (stops once the release is silent)
    const vib = [];
    let src;
    if (type === 'fm') {                                   // carrier + modulator at 3.5×, the index dying away
      const car = osc('sine', f, t, end), mod = osc('sine', f * 3.5, t, end), mg = vca();
      mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.25, t, 0.25);
      mod.connect(mg); mg.connect(car.frequency); src = car;
    } else if (type === 'voice') {                         // a solo vocalise ("ah"): saws through two vowel formants
      const f1 = filt('bandpass', 750, 5), f2 = filt('bandpass', 1200, 6), mix = ac.createGain();
      for (const d of [-5, 5]) { const o = osc('sawtooth', f, t, end, d); o.connect(f1); o.connect(f2); vib.push(o); }
      f1.connect(mix); f2.connect(mix); src = mix;
    } else {
      const lp = filt(type === 'radio' ? 'bandpass' : 'lowpass', 0, type === 'radio' ? 2.2 : type === 'horn' ? 1.6 : type === 'strings' ? 0.7 : 1);
      const kinds = { horn: ['sawtooth', [-7, 7]], strings: ['sawtooth', [-7, 7]], saw: ['sawtooth', [-14, 0, 14]], flute: ['sine', [0]],
        reed: ['square', [-10, 10]], cello: ['sawtooth', [-5, 5]], radio: ['square', [-4, 4]] }[type];
      for (const d of kinds[1]) { const o = osc(kinds[0], f, t, end, d); o.connect(lp); vib.push(o); }
      if (type === 'flute') {                              // the breath
        const n = noiseSrc(t, end), bp = filt('bandpass', f * 2, 4), ng = ac.createGain();
        ng.gain.value = 0.35; n.connect(bp); bp.connect(ng); ng.connect(lp);
        osc('triangle', f * 2, t, end).connect(ng);
      }
      if (type === 'horn') { lp.frequency.setValueAtTime(450, t); lp.frequency.linearRampToValueAtTime(2600, t + 0.09); lp.frequency.setTargetAtTime(1500, t + 0.09, 0.25); }
      else if (type === 'saw') { lp.frequency.setValueAtTime(4200, t); lp.frequency.setTargetAtTime(2200, t + 0.03, 0.2); }
      else if (type === 'cello') { lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(1500, t + 0.3); }
      else if (type === 'radio') lp.frequency.setValueAtTime(1300, t);
      else lp.frequency.setValueAtTime(type === 'strings' ? 3800 : type === 'reed' ? 2600 : 3000, t);
      src = lp;
    }
    if (rate) {
      const lfo = osc('sine', rate, t, end), lg = vca();
      lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * depth, t + Math.min(0.5, len));
      lfo.connect(lg); vib.forEach(o => lg.connect(o.frequency));
    }
    env(g, t, att, vel, Math.max(0, len - att), rel);
    src.connect(g);
    const p = ({ strings: 0.25, radio: 0.4, flute: 0.15, reed: -0.15, horn: -0.1, voice: 0.1 }[type] || -0.05) * (song.classic ? 1 : 1.8);
    route(pan(g, p), true, type !== 'cello');
    return { g, at: t };
  }
  const LEAD_VEL = { horn: 0.085, saw: 0.06, flute: 0.11, reed: 0.06, fm: 0.09, cello: 0.09, radio: 0.3, voice: 0.3 };
  // Brass: root, fifth, octave and tenth swelling open ("bwaaam"), or a short stab.
  function brass(c, t, len, vel, stab) {
    const r = bassRoot(c) + (song.classic || song.keepRegister ? 12 : 24), end = t + len + 0.6, lp = filt('lowpass', 0, 1.2), g = vca();   // (the new pieces: horns an octave up, brighter)
    for (const m of [r, r + 7, r + 12, r + 12 + c.third]) osc('sawtooth', hz(m), t, end, (m % 3 - 1) * 6).connect(lp);
    lp.frequency.setValueAtTime(220, t);
    if (stab) { lp.frequency.linearRampToValueAtTime(2400, t + 0.03); lp.frequency.setTargetAtTime(500, t + 0.05, 0.08); }
    else { lp.frequency.linearRampToValueAtTime(2200, t + Math.min(0.5, len * 0.4)); lp.frequency.setTargetAtTime(900, t + Math.min(0.5, len * 0.4), len * 0.4); }
    env(g, t, stab ? 0.01 : Math.min(0.25, len * 0.2), vel, stab ? 0.08 : len * 0.6, stab ? 0.06 : 0.2);
    lp.connect(g); route(g, true, false);
  }
  // Drums.
  function taiko(t, vel, p = 1) {
    const g = vca(), o = osc('sine', 130 * p, t, t + 0.9), skin = song.classic ? 0 : 1;   // (the new pieces: less boom, more skin)
    o.frequency.setValueAtTime(130 * p, t); o.frequency.exponentialRampToValueAtTime(46 * p, t + 0.28);
    const og = skin ? ac.createGain() : null; if (og) { og.gain.value = 0.7; o.connect(og); og.connect(g); } else o.connect(g);
    env(g, t, 0.003, vel, 0.02, 0.17);
    const n = noiseSrc(t, t + (skin ? 0.35 : 0.12)), lp = filt(skin ? 'bandpass' : 'lowpass', skin ? 700 : 900, skin ? 0.8 : 0), ng = vca();
    n.connect(lp); lp.connect(ng); env(ng, t, 0.002, vel * (skin ? 1.1 : 0.5), 0, skin ? 0.045 : 0.03); ng.connect(g);
    route(g, true, false);
  }
  function kick(t, vel) {
    const o = osc('sine', 120, t, t + 0.4), g = vca();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    o.connect(g); env(g, t, 0.002, vel, 0.01, 0.08); route(g, false, false);
  }
  function snare(t, vel) {
    const n = noiseSrc(t, t + 0.35), bp = filt('bandpass', 1900, 0.7), g = vca();
    n.connect(bp); bp.connect(g); env(g, t, 0.002, vel, 0, 0.065);
    const o = osc('triangle', 200, t, t + 0.2), og = vca();
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08); o.connect(og); env(og, t, 0.002, vel * 0.7, 0, 0.04); og.connect(g);
    route(g, true, false);
  }
  function clap(t, vel) {                                  // three quick slaps
    const n = noiseSrc(t, t + 0.4), bp = filt('bandpass', 1200, 0.9), sum = ac.createGain();
    n.connect(bp);
    for (const d of [0, 0.011, 0.023]) {                   // (each slap its own envelope: no ramp after a decay, which can jump)
      const g = vca(); env(g, t + d, 0.003, vel, 0, d < 0.02 ? 0.003 : 0.05); bp.connect(g); g.connect(sum);
    }
    route(pan(sum, -0.2), true, false);
  }
  function hat(t, vel, open, kind) {                      // kind: 'shaker', 'jingle' (tambourine), or a hi-hat
    const stop = song.classic ? (open ? 0.6 : kind ? 0.15 : 0.12) : (open ? 0.85 : kind === 'jingle' ? 0.36 : kind ? 0.23 : 0.16);   // (stops once the tail is silent)
    const n = noiseSrc(t, t + stop), hp = filt(kind ? 'bandpass' : 'highpass', kind === 'shaker' ? 5200 : kind ? 7000 : 7200, kind ? 1.2 : 0), g = vca();
    n.connect(hp); hp.connect(g); env(g, t, kind === 'shaker' ? 0.012 : kind ? 0.003 : 0.001, vel, 0, open ? 0.12 : kind === 'jingle' ? 0.05 : kind ? 0.03 : 0.022);
    route(pan(g, kind === 'shaker' ? -0.3 : 0.3), false, false);
  }
  function crash(t, vel) {
    const n = noiseSrc(t, t + 4), hp = filt('highpass', 3800), g = vca();
    n.connect(hp); hp.connect(g); env(g, t, 0.003, vel, 0, 0.8); route(g, true, false);
  }
  function tom(t, vel, f, short, classic) {
    const o = osc('sine', f, t, t + (song.classic ? 0.6 : short ? 0.36 : 1)), g = vca();   // (stops once the tail is silent; Held Together as it was)
    if (!classic) o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * (short ? 0.8 : 0.55), t + 0.3);
    o.connect(g); env(g, t, 0.003, vel, 0, short ? 0.05 : 0.14); route(g, true, false);
  }
  function boom(t, vel) {
    const o = osc('sine', 58, t, t + 3), g = vca();
    o.frequency.exponentialRampToValueAtTime(29, t + 1.4); o.connect(g); env(g, t, 0.005, vel, 0.05, 0.6); route(g, false, false);
  }
  // A swell into a downbeat: filtered noise opening up.
  function riser(t, dur, vel, from, to) {
    const n = noiseSrc(t, t + dur + 0.05), bp = filt('bandpass', from, 1.6), g = vca();
    bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    n.connect(bp); bp.connect(g); route(g, true, false);
  }
  // The Shepard voices (the spool's endless rise). Six sines an octave apart, from C2 up to C8, weighted by a fixed
  // raised-cosine bell over log-frequency (centre C5 = 523 Hz, 6 octaves wide, zero at both edges). The six weights
  // of any pitch class always add up to exactly 1 (cosines at six equally spaced phases cancel), so loudness and
  // brightness stay put while the pitch class keeps climbing: each step up fades in a new partial at the bottom
  // and lets one go at the top, and the ear hears a scale that rises forever.
  const SHEP = { lo: 36, oct: 6 };                         // bottom: midi 36 (C2); 6 octaves; centre midi 72 (C5)
  const shepW = (m) => { const x = (m - SHEP.lo) / (12 * SHEP.oct); return x <= 0 || x >= 1 ? 0 : (1 - Math.cos(2 * Math.PI * x)) / SHEP.oct; };
  const shepPartials = (pc) => Array.from({ length: SHEP.oct }, (_, k) => { const m = SHEP.lo + ((pc % 12) + 12) % 12 + 12 * k; return { m, f: hz(m), g: shepW(m) }; });
  let shepWaves = null;                                    // one PeriodicWave per pitch class (per audio context): one oscillator a note
  function shepard(pc, t, len, vel, p = 0) {
    const P = shepPartials(pc), g = vca(), end = t + len + 0.8;
    if (ac.createPeriodicWave) {
      if (!shepWaves || shepWaves.ac !== ac) shepWaves = { ac, w: [] };
      const i = ((pc % 12) + 12) % 12;
      if (!shepWaves.w[i]) {                               // harmonics 1, 2, 4, ... 32 of the bottom partial, at the bell's weights
        const n = 2 ** (SHEP.oct - 1) + 1, re = new Float32Array(n), im = new Float32Array(n);
        P.forEach((q, k) => { im[2 ** k] = q.g; });
        shepWaves.w[i] = ac.createPeriodicWave(re, im, { disableNormalization: true });
      }
      const o = osc('sine', P[0].f, t, end); o.setPeriodicWave(shepWaves.w[i]); o.connect(g);
    } else for (const q of P) if (q.g > 1e-4) { const pg = ac.createGain(); pg.gain.value = q.g; osc('sine', q.f, t, end).connect(pg); pg.connect(g); }
    env(g, t, 0.03, vel, Math.max(0, len - 0.03), 0.09);
    route(p ? pan(g, p) : g, true, false);
    return { g, at: t };
  }
  // The Shepard-Risset glissando (the spool's riser): the same bell, its six sines sliding up one octave every P
  // seconds. Each sine enters silent at the bottom, climbs the six octaves and leaves silent at the top; a new one
  // enters every P, so six always sound. A held voice (tag 'gliss'): released with everything else.
  function glissVoice(t0, x0) {
    const P = gliss.P, dur = (SHEP.oct - x0) * P, f0 = hz(SHEP.lo), o = ac.createOscillator(), g = vca();
    o.type = 'sine'; o.frequency.setValueAtTime(f0 * 2 ** x0, t0); o.frequency.exponentialRampToValueAtTime(f0 * 2 ** SHEP.oct, t0 + dur);
    const w = (x) => shepW(SHEP.lo + 12 * x);
    g.gain.setValueAtTime(w(x0), t0);
    for (let i = Math.floor(x0 * 8) + 1; i <= SHEP.oct * 8; i++) g.gain.linearRampToValueAtTime(w(i / 8), t0 + (i / 8 - x0) * P);
    o.connect(g); g.connect(gliss.g); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function glissKeep(t, until, P, vel) {                   // start it (fading in), then a new voice at the bottom every P
    if (!gliss) {
      const g = vca(); g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(vel, t, P / 6); route(g, true, false);
      gliss = { g, P, next: t };
      for (let x0 = 1; x0 < SHEP.oct; x0++) glissVoice(t, x0);
      const me = gliss;
      hold('gliss', (r) => { g.gain.cancelScheduledValues(r); g.gain.setTargetAtTime(0, r, 0.15); if (gliss === me) gliss = null; });
    }
    while (gliss.next < until - 1e-6) { glissVoice(gliss.next, 0); gliss.next += gliss.P; }
  }
  const MINOR = [0, 2, 3, 5, 7, 8, 10];                    // (every piece is in minor: the spool's bVI-bVII live in its natural minor)
  const scalePc = (d) => (song.tonic + MINOR[((d % 7) + 7) % 7]) % 12;

  // ---------------------------------------------------------------- the engine's gestures (overridable per piece)
  // Every percussion / transition gesture the engine plays goes through gesture(name, x, play): the piece's hook of
  // that name runs first and returning true replaces the engine's version; noEngine: [name] switches it off. Inside
  // the gestures the engine's percussion goes through E (switch single instruments off with noEngine: ['taiko', ...],
  // or all of them with engineDrums: false). A piece calling music.kit instruments itself is never gated.
  const ENGINE_DRUMS = new Set(['taiko', 'kick', 'snare', 'clap', 'hat', 'crash', 'tom', 'boom']);
  const engineOff = (name) => song.noEngine.has(name) || (!song.engineDrums && ENGINE_DRUMS.has(name));
  const E = {};
  for (const [n, f] of Object.entries({ taiko: (...a) => taiko(...a), kick: (...a) => kick(...a), snare: (...a) => snare(...a), clap: (...a) => clap(...a),
    hat: (...a) => hat(...a), crash: (...a) => crash(...a), tom: (...a) => tom(...a), boom: (...a) => boom(...a), riser: (...a) => riser(...a) })) E[n] = (...a) => (engineOff(n) ? undefined : f(...a));
  function gesture(name, x, play) {
    const r = song.hooks[name]?.(x);
    if (r === true || r === 'handled' || r === 'skip' || song.noEngine.has(name)) return false;
    play(); return true;
  }

  // ---------------------------------------------------------------- the sequencer
  function releaseHeld(t, tag) {
    for (const r of held) if (!tag || r.tag === tag) r(t);
    held = tag ? held.filter(r => r.tag !== tag) : [];
  }
  function hold(tag, r) { r.tag = tag; held.push(r); }
  function begin(s) {                      // start a piece from its first step (one sequencer, always)
    song = s; step = 0; ended = false; ending = null; arc = { dropped: 0, broke: false, mode: null, next: null, log: [] }; pending = null; bar = null; threatT = null;
    stage = jumpOn ? 7 : target(); spoolBar = 0; shepDeg = -1; gliss = null;
    if (!ac) return;
    const t = now();
    releaseHeld(t); fadeBuses(pb, t); pb = makeBuses();
    nextT = startT = t + 0.08;
  }
  function switchTo(s) {                 // after the final hit it stays quiet: the new piece waits for rearm()
    if (s === song) return;
    if (ended || ending) song = s; else begin(s);
  }
  function tick() {
    if (rec && ac && vnow === null) { recTick(); return; }   // a recording plays instead (js/music.js "recordings")
    if (!ac || ended || silent()) return;
    const t = now();
    if (nextT < t - 0.05) shift(t + 0.03 - nextT);     // fell behind (throttled timer): pick up from now
    while (nextT < t + LOOK) {
      if (ending && nextT >= ending.T - 1e-6) { finale(ending.T); ended = true; return; }   // the last downbeat
      playStep(nextT); nextT += stepDur(); step++;
    }
  }
  function shift(d) { nextT += d; startT += d; if (ending) { ending.T += d; ending.from += d; } }   // (the grid moves along)

  // The ending, planned on the grid when the ship jumps (the jump comes at game time, so it can't be known
  // ahead): a cadence on the piece's bVII (the spool's last chord) or its V, then the final hit, never more than
  // one bar after the jump (playtest: "the very last bit loops too often", a whole extra bar hurt):
  //  - already on the cadence chord: resolve on the next downbeat;
  //  - in the first half of another chord: the cadence chord takes over from the half bar, the hit on the downbeat;
  //  - later: the cadence chord from the next 8th still to come (at least an 8th before the downbeat), hit on the downbeat;
  //  - in the bar's last 16th: the cadence chord from the downbeat, the hit half a bar later (on the half-bar grid).
  function planEnding() {
    const sd = stepDur(), N = song.meter, bd = sd * N, cad = song.spool[song.spool.length - 1];
    const dom = bar.c.name === cad.name || (bar.c.root === (song.tonic + 7) % 12 && bar.c.third === 4);
    const T1 = bar.t + bd, j0 = Math.max(0, Math.round((nextT - bar.t) / sd));   // (the first step of this bar not yet scheduled)
    const j = j0 <= N / 2 ? N / 2 : j0 + (j0 % 2);
    if (dom) ending = { T: T1, from: bar.t, cad: bar.c };
    else if (j <= N - 2) ending = { T: T1, from: bar.t + j * sd, cad };
    else ending = { T: T1 + bd / 2, from: T1, cad };
    ending.jumpedAt = now(); ending.bd = bd;
    song.hooks.endingPlanned?.({ T: ending.T, from: ending.from, cad: ending.cad, bd, notes: bar.notes, hush: (tm) => hush(tm) });   // (e.g. cut the piece's own queued notes)
  }
  // The cadence chord from the half bar: everything held (and melody notes still to come) gives way to it.
  function cadenceAt(tm) {
    const cad = ending.cad, has = (p) => plays(song, p, bar.st);
    hush(tm);
    bar.c = cad; bar.voice = padVoicing(cad); bar.notes = [];
    cadenceVoices(tm, ending.T - tm, has);
  }
  function endingInfo() { return ending && { T: ending.T, from: ending.from, cad: ending.cad }; }   // (x.ending: the planned ending, or null)
  function hush(tm) {                               // everything held, and melody notes still sounding or to come, stops
    releaseHeld(tm);
    for (const n of bar.notes) {
      if (n.at >= tm - 1e-6) { n.g.gain.cancelScheduledValues(0); n.g.gain.value = 0; }
      else { n.g.gain.cancelScheduledValues(tm); n.g.gain.setTargetAtTime(0, tm, 0.04); }
    }
  }
  function cadenceVoices(t, len, has) {             // the cadence chord, swelling into the final downbeat
    const cad = ending.cad, voice = padVoicing(cad), m = inRange((cad.root + cad.third) % 12, 69);
    gesture('cadence', { t, len, cad, voice, has, st: bar.st, notes: bar.notes, T: ending.T }, () => {
      if (has('pad') || !has('choir')) hold('pad', pad(voice, t, 0.05, Math.max(0.5, BRIGHT[bar.st])));
      if (has('choir')) hold('choir', choir(voice, t, 0.25));
      brass(cad, t, len * 0.95, 0.05, false);
      bar.notes.push(lead(m, t, len * 0.97, song.classic ? 0.08 : LEAD_VEL[song.lead], song.lead), lead(m + 12, t, len * 0.97, 0.045, 'strings'));
      E.riser(t, len, 0.12, 400, 7000);
    });
  }

  // The stage machine for one bar line (pure, so music.plan can run it ahead): S = { stage, pending, arc }.
  // Held Together (classic): the first score's smooth build. The others: the arc. Small steps up after a one-bar
  // fill; the big ones (the theme's entrance, the climax) only at a phrase start, after a build bar that ends in a
  // beat of silence: the drop. Two phrases after the first drop, one breakdown phrase strips it to the piece's
  // signature, the pad and the theme, rebuilds it bar by bar, and ends in a bigger drop. Returns: a drop here?
  function arcStep(S, b, want, classic) {
    const ph = b % 8, arc = S.arc;
    let drop = false;
    if (classic) {
      if (S.stage === 7) S.stage = Math.min(6, want);
      if (S.pending !== null && b % 2 === 0) { S.stage = S.pending; S.pending = null; }
      if (b % 2 === 1 && want > S.stage) S.pending = want;          // up: a one-bar fill, then the new stage
      else if (b % 8 === 0 && want < S.stage) S.stage = want;        // down: only at a phrase start
      return false;
    }
    if (S.stage === 7) S.stage = Math.min(6, want);
    if (ph === 0 && arc.next !== null) {
      S.stage = arc.next; arc.next = null; S.pending = null; drop = true; arc.mode = null; arc.dropped++;
      arc.log.push({ bar: b, kind: 'drop', stage: S.stage });
    } else if (ph === 0 && arc.mode === null && !arc.broke && arc.dropped && b - arc.log.filter(e => e.kind === 'drop').pop().bar >= 16 && want < 6 && S.stage >= 4) {
      arc.mode = 'breakdown'; arc.broke = true; arc.log.push({ bar: b, kind: 'breakdown', stage: S.stage });
    }
    if (arc.mode === null) {
      if (S.pending !== null && b % 2 === 0) { S.stage = S.pending; S.pending = null; }
      const big = (S.stage < 4 && want >= 4) || (S.stage < 6 && want >= 6);
      if (big) { S.pending = null; if (ph === 7) arc.next = want; }
      else if (b % 2 === 1 && want > S.stage) S.pending = want;
      else if (ph === 0 && want < S.stage && !drop) S.stage = want;
    } else if (ph === 7) arc.next = Math.min(6, Math.max(want, S.stage + 1, 5));
    if (ph === 7 && arc.next !== null) arc.log.push({ bar: b, kind: 'build', stage: arc.next });
    return drop;
  }
  const newArc = () => ({ dropped: 0, broke: false, mode: null, next: null, log: [] });
  const stageFor = (k) => { let s = 0; for (const t of TH) if (k >= t) s++; return s; };
  // Run a mission of L seconds ahead (no threats, no jump): the stage of every bar and its state, for the player's
  // markers and for seeking. Intensity follows the game's curve: (t / L)^1.3.
  function plan(s, L) {
    const bd = 60 / s.bpm / 4 * s.meter, S = { stage: stageFor(0), pending: null, arc: newArc() }, bars = [];
    for (let b = 0; b * bd < L; b++) {
      const k = Math.pow(Math.min(1, b * bd / L), 1.3);
      const state = { stage: S.stage, pending: S.pending, arc: JSON.parse(JSON.stringify(S.arc)) };   // (the state before this bar line)
      const drop = arcStep(S, b, stageFor(k), !!s.classic);
      bars.push({ b, t: b * bd, k, stage: S.stage, drop, breakdown: S.arc.mode === 'breakdown', build: b % 8 === 7 && S.arc.next !== null, before: state });
    }
    return { barDur: bd, bars };
  }
  // Jump to second t of an L-second mission: the arrangement is set to the state it would have there and starts
  // cleanly on that bar line (the old sound fades out). Returns the bar's time in the mission.
  function seek(t, L) {
    const P = plan(song, L), B = P.bars[Math.min(P.bars.length - 1, Math.ceil(t / P.barDur - 1e-6))];
    if (!B) return 0;
    intensity = B.k; threatT = null;
    begin(song);                                                  // fade the old sound out, fresh buses
    stage = B.before.stage; pending = B.before.pending; arc = B.before.arc;
    step = B.b * song.meter; startT = nextT - B.t;
    return B.t;
  }

  function barStart(b, t) {
    const want = target(), ph = b % 8;
    let drop = false;
    if (jumpOn) { if (stage !== 7) { stage = 7; spoolBar = b; pending = null; arc.mode = null; arc.next = null; shepDeg = -1; } }
    else { const S = { stage, pending, arc }; drop = arcStep(S, b, want, song.classic); stage = S.stage; pending = S.pending; }
    const st = stage, spool = st === 7, bi = b % 8, B = Math.floor(b / 8) % 2 === 1;
    const bk = arc.mode === 'breakdown' ? ph : -1, build = !song.classic && !spool && ph === 7 && arc.next !== null;
    const sig = (p) => !!song.parts[p] && song.parts[p][0] === 0;
    const has = bk < 0 ? (p) => plays(song, p, st)                 // in the breakdown: the signature, pad and theme; then layers return
      : (p) => (['pad', 'choir'].includes(p) || (p === 'theme' && !sig('tines') && !sig('radio')) || sig(p) || (bk >= 4 && ['ost', 'ost16', 'bass', ...song.groove].includes(p)) || (bk >= 6 && ['drums', 'hats'].includes(p)))
        && (plays(song, p, st) || sig(p)) && !song.breakdownSkip.includes(p);
    const sec = B ? song.B : song.A;
    const cadBar = !!ending && t >= ending.from - 1e-6;           // a full cadence bar before the final hit
    const c = cadBar ? ending.cad : spool ? song.spool[(b - spoolBar) % song.spool.length] : sec.chords[bi];
    const N = song.meter, bd = stepDur() * N, e8 = stepDur() * 2, prev = bar;
    bar = { b, t, c, st, fill: cadBar || build ? null : pending, voice: padVoicing(c, song.classic || song.keepRegister ? 62 : 66), spool, sec, notes: [], has, bk, build, drop };
    if (bar.fill !== null && song.hooks.fill?.({ t, b, bi, c, st, has, r: -1, from: st, to: bar.fill }) === 'skip') bar.fill = null;   // (no fill into this stage: a normal bar)
    if (cadBar) {
      if (prev && prev.c.name === c.name && ending.from < t - 1e-6) return;   // (already swelling on it)
      releaseHeld(t); cadenceVoices(t, ending.T - t, has); return;
    }
    if (!spool && gliss) releaseHeld(t, 'gliss');                // (the spool called off without a jump)
    const changed = repad || !prev || prev.c.name !== c.name || prev.spool !== spool || (song.classic ? Math.abs(prev.st - st) >= 2 : prev.st !== st || prev.bk !== bk) || bi === 0;
    if (changed) {                                               // held harmony: pad, choir (and the brass swell)
      repad = false;
      releaseHeld(t, 'pad'); releaseHeld(t, 'choir');
      gesture('pad', { t, b, bi, c, st, has, bk, spool, voice: bar.voice, bd }, () => {   // (a piece's own pad: hold it with K.hold('pad', release) and the engine renews it)
        if (has('pad')) hold('pad', pad(bar.voice, t, [0.03, 0.04, 0.045, 0.045, 0.045, 0.045, 0.05, 0.055][st], BRIGHT[st]));
        if (has('choir')) hold('choir', choir(bar.voice, t, st <= 2 ? 0.2 : 0.25));
        if (!song.classic && st >= 4 && bk < 0 && has('pad')) hold('pad', pad(bar.voice.map(m => m + 12), t, 0.045, 1, [bi % 2 ? 1 : -1]));   // air: the pad an octave up, wide (one layer, alternating sides: half the cost)
      });
      let run = 1; while (!spool && bi + run < 8 && sec.chords[bi + run].name === c.name) run++;   // (never into the next chord)
      if (has('brass')) brass(c, t, bd * (spool ? 0.9 : Math.min(2, run) * 0.9), spool ? 0.05 : 0.04, false);
    }
    if (bi === 0 || spool || (!has('drone') && !song.classic)) releaseHeld(t, 'drone');
    if (bi === 0 && has('drone')) hold('drone', drone(inRange(song.tonic, 36), t, song.classic ? (st <= 2 ? 0.09 : 0.06) : 0.08));
    if (!song.classic && (bi === 0 || drop)) {                     // the hook (B) breathes out above the verse (A) once the theme is in
      const lift = spool || bk >= 0 || st < 2 || B ? 1 : st < 4 ? 0.86 : 0.78;
      pb.fader.gain.setTargetAtTime(lift, t, drop ? 0.01 : bd * 0.3);
    }
    const x = { t, b, bi, ph, c, st, has, prev, bd, e8, spool, build, bk, drop, sec, voice: bar.voice, notes: bar.notes, first: (p) => !prev || !prev.has(p), ending: endingInfo() };
    if (drop) gesture('dropHit', x, () => { E.boom(t, 0.6); E.crash(t, 0.3); E.taiko(t, 0.6, 0.8); });   // the drop
    else if (build) gesture('buildSweep', x, () => E.riser(t, bd * 0.75, 0.15, 300, 8000));           // the build, up to the beat of silence
    if (bi === 0 && !spool && !drop && bk < 0) {
      if (st >= 4) gesture('accent', x, () => { if (st >= 6) { E.boom(t, 0.55); E.crash(t, 0.22); } else E.crash(t, 0.13); });   // phrase starts
    } else if (st === 6 && bi === 4 && !drop) gesture('accent', x, () => E.crash(t, 0.12));
    song.hooks.bar?.(x);                                          // the piece's own per-bar layers (js/music/<name>.js)
    // melodies: the theme (from stage 4, strings an octave up at the climax), or its early disguises
    if (!spool) for (const n of sec.theme[bi]) {
      const at = t + n.slot * e8 + swing(n.slot * 2), len = n.len * e8 * 0.96;
      const ns = bar.notes;
      const call = !song.classic && st === 5 && bk < 0, mine = !call || ph % 4 < 2;   // stage 5: the lead calls, the strings answer
      if (has('theme') && mine) ns.push(lead(n.midi, at, len, song.classic ? (st >= 6 ? 0.075 : 0.085) : LEAD_VEL[song.lead] * (st >= 6 ? 0.9 : 1), song.lead));
      if (has('strings') || (call && !mine && has('theme'))) ns.push(lead(n.midi + 12, at, len, call ? 0.06 : 0.045, 'strings'));
      song.hooks.theme?.(x, n, at, len);                          // the piece's own voices for the theme (a radio horn, a music box)
    }
    if (spool) {                                                 // the spool: an endless Shepard rise and 2-bar waves of tension
      const cb = (b - spoolBar) % 2, sd = stepDur(), shep = !song.noEngine.has('shepard');
      const P = 2 * bd < 4 ? 4 * bd : 2 * bd;                    // the glissando: an octave every 2 bars (4 when 2 bars are short)
      if (cb === 0) {
        const eng = gesture('spoolWave', { ...x, cb }, () => {   // a wave every 2 bars: a crash, and the glissando (or the noise riser)
          E.crash(t, 0.2);
          if (!shep) E.riser(t, bd * 2, 0.12, 300, 6000);
          else if (!engineOff('riser')) glissKeep(t, t + bd, P, 0.12);
        });
        if (!eng && gliss) releaseHeld(t, 'gliss');
      } else if (gliss) glissKeep(t, t + bd, P, 0.12);
      // The Shepard line: up the natural minor one note a beat (an 8th in 6/8), never resetting; on 1 and 3 (1 and 4 in
      // 6/8) a chord tone when the next step or the one after is one (else the consonant 6th), passing tones between.
      const r = song.shepRate || (N === 12 ? 2 : 4), line = [];
      for (let s = 0; s < N; s += r) {
        const strong = s % (N / 2) === 0;
        shepDeg++;
        if (strong && !c.pcs.includes(scalePc(shepDeg)) && c.pcs.includes(scalePc(shepDeg + 1))) shepDeg++;
        line.push({ s, t: t + s * sd + swing(s), pc: scalePc(shepDeg), len: r * sd * 0.92, strong });
      }
      gesture('shepard', { ...x, cb, line }, () => {
        for (const n of line) bar.notes.push(shepard(n.pc, n.t, n.len, n.strong ? 0.16 : 0.13, n.s % (2 * r) ? 0.2 : -0.2));
      });
    }
  }

  const TAIKO = [[0], [0, 10], [0, 6, 10], [0, 3, 6, 10, 12], [0, 3, 6, 8, 10, 12, 14]];
  const TOMS = { 8: 230, 10: 210, 11: 190, 12: 165, 13: 140, 14: 120, 15: 100 };   // (the first score's fill)
  function playStep(t0) {
    const N = song.meter, s = step % N, b = Math.floor(step / N);
    if (s === 0) barStart(b, t0);
    if (ending && s > 0 && Math.abs(t0 - ending.from) < 1e-6) cadenceAt(t0);
    const { c, st, voice, spool, has } = bar, t = t0 + swing(s);
    if (bar.build && s >= N * 3 / 4) { if (s === N * 3 / 4) { hush(t0); repad = true; } return; }   // the beat of silence before the drop
    const fill = bar.fill !== null && s >= N / 2, big = fill && bar.fill >= 5, late = fill && s >= N * 3 / 4;
    const lv = (p) => st - song.parts[p][0];                     // how many stages a layer has been playing
    // ostinato (pluck or marimba), 8ths at first, 16ths later
    const k = song.ost[s];
    if (has('ost') && k >= 0 && (has('ost16') || s % 2 === 0) && !(late && big)) {
      const r = bassRoot(c) + (song.classic || song.keepRegister ? 12 : 24), tones = [r, r + 7, r + 12, r + 12 + c.third, r + 19], a = s % 4 === 0 ? 1 : 0.72;
      if (song.hooks.ost) song.hooks.ost(tones[k], t, a, st);     // the piece's own ostinato instrument
      else pluck(tones[k], t, (st >= 3 ? 0.085 : song.classic ? 0.06 : 0.1) * a, BRIGHT[st], song.classic ? 0 : s % 4 < 2 ? -0.5 : 0.5);
      if (st >= 6) pluck(tones[k] + 12, t, 0.04 * a, 0.9);
    }
    // bells
    if (has('bells') && song.classic) {                         // (the first score's bells: sparse, then an arpeggio, then quarters)
      const on = st === 0 ? s % 8 === 0 : st === 1 ? s % 4 === 0 : st <= 3 ? s % 2 === 0 : s % 4 === 0;
      if (on) { const ARP = [0, 1, 2, 3, 2, 1, 3, 2], i = st <= 1 ? ARP[(s / 4 + b * 2) % 8] : ARP[s / 2]; bell(voice[i] + 12, t, st === 4 ? 0.035 : 0.05, (i - 1.5) * 0.3); }
    } else if (has('bells')) {
      const lb = lv('bells'), on = lb === 0 ? s % 4 === 0 : s % 2 === 0;
      if (on) { const ARP = [0, 1, 2, 3, 2, 1, 3, 2], i = ARP[(s / 2 + (lb === 0 ? b : 0)) % 8 | 0]; bell(voice[i] + 12, t, 0.05, (i - 1.5) * 0.3); }
    }
    const x = { s, b, t, t0, c, voice, st, has, lv, late, N, spool, step, build: bar.build, bk: bar.bk, drop: bar.drop, ending: endingInfo() };
    song.hooks.step?.(x);                                         // the piece's own per-step layers (js/music/<name>.js)
    // bass
    if (has('bass') && !(late && !spool)) {
      if (song.bassStyle === 'half') { if (s === 0 || s === 8 || (st >= 5 && s % 4 === 0)) bass(bassRoot(c), t, stepDur() * (st >= 5 ? 3.5 : 7), 0.22); }
      else if (N === 12) { if (s === 0 || s === 6 || (st >= 5 && (s === 4 || s === 10))) bass(bassRoot(c) + (s === 6 ? 7 : 0), t, stepDur() * 1.8, 0.22); }
      else if (s % 2 === 0) bass(bassRoot(c) + (st >= 5 && (s === 6 || s === 14) ? 12 : 0), t, stepDur() * 1.6, 0.2);
    }
    // drums: into the final downbeat, a fill that grows (snare roll, toms, taikos)
    if (ending && t0 >= ending.T - stepDur() * N / 2 - 1e-6) {
      const k3 = 1 - (ending.T - t0) / (stepDur() * N / 2);         // into the final downbeat: a fill that grows
      gesture('endFill', { ...x, k: k3 }, () => { E.snare(t, 0.08 + 0.25 * k3); if (s % 2 === 0) E.taiko(t, 0.3 + 0.35 * k3, 1.25 - 0.4 * k3); });
      return;
    }
    if (bar.build) {                                               // the build: a snare roll and taikos swelling
      const k4 = s / (N * 3 / 4);
      gesture('build', { ...x, k: k4 }, () => { E.snare(t, 0.05 + 0.25 * k4); if (s % 2 === 0) E.taiko(t, 0.25 + 0.35 * k4, 1.3 - 0.3 * k4); });
      return;
    }
    if (bar.bk >= 0 && bar.bk < 6) return;                          // the breakdown: no drums yet
    if (spool) {                                                   // the spool: rolls growing in 2-bar waves
      const cb = (b - spoolBar) % 2, k2 = (cb * N + s) / (2 * N);
      gesture('spoolPerc', { ...x, cb, k: k2 }, () => {
        if (s % 2 === 0) E.taiko(t, 0.42 + 0.25 * k2, s % 4 === 0 ? 1 : 1.2);
        if (cb < 1 ? s % 2 === 0 : true) E.snare(t, 0.06 + 0.22 * k2);
        E.hat(t, s % 4 === 2 ? 0.07 : 0.04);
        if (s % 4 === 0 && !song.noEngine.has('stabs')) brass(c, t, stepDur() * 1.5, 0.035, true);
      });
      return;
    }
    if (fill) {                                                    // the one-bar fill before a stage change
      const r = s - N / 2;
      gesture('fill', { ...x, r, big, from: st, to: bar.fill }, () => {
        if (song.classic) { if (s in TOMS) E.tom(t, big ? 0.5 : 0.36, TOMS[s], false, true); }
        else if (r !== 1) E.tom(t, big ? 0.5 : 0.36, 230 - r * 18);
        if (big) E.snare(t, 0.06 + r * 0.03);
        if (r === 0) E.riser(t, stepDur() * N / 2, big ? 0.14 : 0.08, 1500, 9000);
      });
      return;
    }
    if (song.hooks.drums) song.hooks.drums(x); else if (!song.noEngine.has('drums')) drums(s, st, t, has, lv);
    if (has('stabs') && !song.noEngine.has('stabs') && (N === 12 ? [0, 6] : [0, 3, 6]).includes(s)) brass(c, t, stepDur() * 1.5, 0.03, true);
  }

  function drums(s, st, t, has, lv) {
    const style = song.drums, d = has('drums') ? lv('drums') : -1;   // (the engine's own kit: taikos; other pieces bring theirs as hooks.drums)
    if (style === 'taiko' || style === 'drive') {
      if (d >= 0 && TAIKO[Math.min(d, 4)].includes(s)) E.taiko(t, s === 0 ? 0.6 : 0.42, s === 0 ? 1 : 1.15);
      if (has('snare') && (s === 4 || s === 12)) E.snare(t, 0.25);
      if (style === 'drive' && has('snare') && st >= 5 && s % 2 === 1) E.snare(t, 0.035);   // driving ghost notes
      if (style === 'drive' && d >= 0 && (s === 14 || s === 15)) E.tom(t, 0.25, s === 14 ? 180 : 140);
      if (st >= 6 && s === 15) E.snare(t, 0.08);
      if (has('hats')) { const lh = lv('hats'); if (lh >= 2) E.hat(t, s % 4 === 2 ? 0.08 : s % 2 ? 0.03 : 0.045, s === 14); else if (s % 2 === 0) E.hat(t, s % 4 === 2 ? 0.07 : 0.035); }
    }
  }

  // The final hit, on the downbeat after the cadence: the home chord in major, on the piece's own instruments,
  // ringing out. Each piece adds its own last word (a stomp, a sonar ping, the music box, ...).
  function finale(T) {
    const c = { ...song.end, third: 4, pcs: [song.end.root, (song.end.root + 4) % 12, (song.end.root + 7) % 12] }, P = song.parts;
    releaseHeld(T);
    const sd = stepDur();
    gesture('finalHit', { T, c, sd }, () => { E.boom(T, 0.5); E.crash(T, 0.3); E.taiko(T, 0.55, 1); E.taiko(T, 0.4, 0.7); });   // the hit's percussion
    brass(c, T, 3.2, 0.09, false);
    const v = padVoicing(c), rel = pad(v, T, 0.08, 0.9), rel2 = pad(v.map(m => m + 12), T, 0.05, 1);
    rel(T + 2.6); rel2(T + 2.6);
    const third = inRange(c.pcs[1], 69);
    lead(third, T, 2.6, song.classic ? 0.08 : LEAD_VEL[song.lead], song.lead); lead(third + 12, T, 2.6, 0.05, 'strings');
    bass(bassRoot(c), T, 2.5, 0.25);
    if (song.classic || P.bells) v.forEach((m, i) => bell(m + 24, T + 0.08 * i, 0.05, (i - 1.5) * 0.4));
    if (P.choir) { const r = choir(v, T, 0.3); r(T + 2.8); }
    song.hooks.finale?.({ T, c, v, sd });                         // the piece's own last word
  }

  // ---------------------------------------------------------------- recordings
  // A recorded piece (a Suno song arranged by tools/arrange-music.py; its data in js/music/recorded-<name>.js, its
  // files in assets/music/<name>/) plays in place of the synthesized piece for its missions (2026-10-25: Pressure
  // Hull for c7). The synthesized piece stays the fallback (the file can't load or play) and stays in music.html.
  //   main.mp3 is laid out on the mission clock (setClock: mission.t, which doesn't run exactly at wall-clock speed):
  //   a small drift is caught up by playing up to 4% faster or slower (same pitch); more than REC_DRIFT s off (a
  //   pause, joining mid-mission) it's seeked there; past its end (a late jump) its last section loops, wrapped on
  //   its bar line. jumped(): ending.mp3 (preroll s of silence before its first downbeat) from the first bar line of
  //   main at least REC_AHEAD s ahead (so at most a bar + 1.6 s after the jump), main fading out under it.
  // Over http(s) both go through the music bus (mute, level, the tab-hidden pause as for the synth). Opened as a file
  // the page can't route a local file through WebAudio (Chrome hands it over as silence: another origin), so there the
  // audio elements play directly: their volume follows the bus level and the mute by hand (stepped per tick).
  const REC_DRIFT = 1, REC_AHEAD = 1.6, REC_XF = 0.03;   // (REC_XF: main's fade-out at the ending)
  const RECS = {}, REC_BY_MISSION = {};
  let rec = null, clock = null;          // rec: the playing recording { R, ending: { at, startAt } | null, ended }; clock: mission s or null
  // Where main.mp3 is at mission time t (the loop folds late times back into the last section).
  function recPos(R, t) {
    const [a, b] = R.loop;
    return t < b ? Math.max(0, t) : a + (t - a) % (b - a);
  }
  // Seconds from position p of main to its first bar line at least `ahead` s on (past the loop's end: in the loop again).
  function recNextBar(R, p, ahead = REC_AHEAD) {
    const q = p + ahead, b = R.bars.find(x => x >= q && x <= R.loop[1]);
    if (b !== undefined) return b - p;
    const w = R.loop[0] + (q - R.loop[1]);
    return R.loop[1] - p + R.bars.find(x => x >= w) - R.loop[0];
  }
  const direct = () => typeof location !== 'undefined' && location.protocol === 'file:';
  const recUsable = (R) => R && !R.failed && typeof Audio !== 'undefined' && vnow === null;
  // A voice: an audio element and its level (through the bus, or the element's own volume, stepped towards `want`).
  function recVoice(R, src) {
    const el = new Audio(src), v = { el, want: 0, g: null };
    el.preload = 'auto'; el.preservesPitch = true;
    el.addEventListener('error', () => recFail(R));
    el.addEventListener('playing', () => {         // (it starts after loading: on the clock from there, not from where it was asked to)
      if (rec && rec.R === R && R.main && el === R.main.el && !rec.ending && clock !== null && Math.abs(el.currentTime - recPos(R, clock)) > 0.15) el.currentTime = recPos(R, clock);
    });
    if (!direct() && ac) { v.g = ac.createGain(); v.g.gain.value = 0; ac.createMediaElementSource(el).connect(v.g); v.g.connect(bus); }
    else el.volume = 0;
    return v;
  }
  function recLevel(v, x, at = 0, tc = 0.04) {     // the voice's level (1: the recording's own level), from `at` s on
    v.want = x;
    if (v.g) { const t = ac.currentTime + at; v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(x * v.R.gain, t, tc); }
  }
  function recStep(v) {                           // (direct: the element's volume towards want × the bus level, unless muted)
    if (v.g) return;
    const goal = typeof sfx !== 'undefined' && sfx.muted ? 0 : Math.min(1, v.want * v.R.gain * VOL);
    v.el.volume = Math.abs(goal - v.el.volume) < 0.02 ? goal : v.el.volume + (goal - v.el.volume) * 0.5;
  }
  function recPlay(v) { const p = v.el.play(); if (p && p.catch) p.catch(e => { if (e && (e.name === 'NotAllowedError' || e.name === 'NotSupportedError')) recFail(v.R); }); }   // (AbortError: a pause came first, fine)
  function recStart(R) {
    recStop();
    if (!recUsable(R) || !ac) return false;
    try {
      if (!R.main || R.mainAc !== ac) { R.main = recVoice(R, R.src.main); R.end = recVoice(R, R.src.ending); R.main.R = R.end.R = R; R.mainAc = ac; }
    } catch (e) { R.failed = true; return false; }
    rec = { R, ending: null, ended: false };
    R.main.el.currentTime = recPos(R, clock ?? 0); R.end.el.pause(); R.end.el.currentTime = 0;
    recLevel(R.main, 1, 0, 0.02); recLevel(R.end, 0, 0, 0.01);
    return true;
  }
  function recStop(tc = 0.15) {
    if (!rec) return;
    const R = rec.R; rec = null;
    for (const v of [R.main, R.end]) { recLevel(v, 0, 0, tc); if (!v.g) v.el.volume = 0; setTimeout(() => { if (!rec || rec.R !== R) v.el.pause(); }, tc * 6000); }
  }
  function recFail(R) {                           // the synthesized piece takes over from here
    R.failed = true;
    if (rec && rec.R === R) { const was = rec; recStop(0.05); if (!was.ended && !was.ending) begin(song); else ended = true; }
  }
  function recTick() {
    const R = rec.R, m = R.main, e = R.end, el = m.el;
    if (silent()) { el.pause(); e.el.pause(); return; }
    recStep(m); recStep(e);
    if (rec.ended) return;
    if (el.currentTime >= R.loop[1] - 0.012 || el.ended) el.currentTime = R.loop[0] + (el.currentTime - R.loop[1]);   // the loop, on its bar line
    if (rec.ending) { recEnding(); return; }
    if (clock !== null) {
      const d = recPos(R, clock) - el.currentTime;   // (smoothed: a slow frame advances the mission clock in bursts)
      rec.drift = Math.abs(d) > 3 * REC_DRIFT ? d : (rec.drift || 0) * 0.97 + d * 0.03;
      if (Math.abs(rec.drift) > REC_DRIFT) { el.currentTime = recPos(R, clock); el.playbackRate = 1; rec.drift = 0; }
      else el.playbackRate = Math.abs(rec.drift) < 0.1 ? 1 : 1 + Math.max(-0.04, Math.min(0.04, rec.drift * 0.1));   // (catch up gently, same pitch)
    }
    if (el.paused) recPlay(m);
  }
  // The ending on main's bar line. An audio element starts 0.1-0.3 s after play(), unpredictably, so the ending (its
  // first preroll s are silence) starts muted as early as that allows (at least REC_AHEAD s ahead) and is steered
  // onto main's own position by its playback rate (it's silent, the pitch doesn't matter), settled 0.3 s before the
  // bar line; on the bar line it comes up and main fades out.
  function recEnding() {
    const R = rec.R, m = R.main, e = R.end, E = rec.ending, L = R.loop[1] - R.loop[0];
    let rem = E.bar - m.el.currentTime;                 // s to the bar line (across the loop's wrap)
    if (rem < -L / 2) rem += L;
    if (!E.on) {
      if (m.el.paused) recPlay(m);
      if (!E.started && rem <= R.preroll) { E.started = true; e.el.currentTime = Math.max(0, R.preroll - rem); recLevel(e, 0, 0, 0.005); recPlay(e); }
      if (E.started && rem > 0.03) {
        const err = e.el.currentTime - (R.preroll - rem);
        e.el.playbackRate = Math.max(0.8, Math.min(1.25, 1 - err / Math.max(0.25, rem - 0.3)));   // (never sharper: a rate change takes a moment to apply)
        if (e.el.paused) recPlay(e);
      } else if (E.started) {                          // the bar line (a tick early: the ending's own fade-in is in the file)
        E.on = true; e.el.playbackRate = 1; recLevel(e, 1, 0, 0.005); recLevel(m, 0, Math.max(0, rem), REC_XF);
        setTimeout(() => { if (rec && rec.ending === E) m.el.pause(); }, 500);
      }
      return;
    }
    if (e.el.ended || e.el.currentTime >= e.el.duration - 0.05) { rec.ended = true; ended = true; }
    else if (e.el.paused) recPlay(e);                   // (back from a hidden tab)
  }
  function recJump() {                            // the ending, from main's next bar line at least REC_AHEAD s on
    const R = rec.R, p = R.main.el.currentTime, d = recNextBar(R, p);
    R.main.el.playbackRate = 1;                   // (no catching up on the mission clock any more)
    rec.ending = { bar: recPos(R, p + d), jumpedAt: performance.now() / 1000 };
  }
  // The recording for a mission (null: the synthesized piece plays).
  const recFor = (id) => (recUsable(REC_BY_MISSION[id]) ? REC_BY_MISSION[id] : null);
  function useRec(R) {                            // play this recording (null: none) from here on
    if ((rec && rec.R) === R) return;
    if (!R) { recStop(); return; }
    if (recStart(R)) { const s = SONGS.find(x => x.name === R.name); if (s) switchTo(s); }
  }
  const recOn = () => !!rec && vnow === null;

  // ---------------------------------------------------------------- public
  function setSilent() {
    if (!ac) return;
    const t = now();
    bus.gain.cancelScheduledValues(t); bus.gain.setTargetAtTime(silent() ? 0 : VOL, t, 0.12);
    if (silent()) { releaseHeld(t + 0.6); repad = true; }    // (held voices come back on the next bar)
    else if (nextT < t + 0.05) shift(t + 0.05 - nextT);
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => { hidden = !!document.hidden; setSilent(); });
    hidden = !!document.hidden;
  }
  if (typeof sfx !== 'undefined') sfx.onReady((ctx, dest, noise) => attach(ctx, dest, noise, false));

  // The kit for piece files: the engine's clock, buses and shared instruments (they all play on the current piece's buses).
  const kit = { get ac() { return ac; }, get song() { return song; }, get noise() { return noiseBuf; },
    get ending() { return endingInfo(); },
    gain: vca, hz, inRange, bassRoot, padVoicing, osc, filt, noiseSrc, pan, route, env, holder, hold, releaseHeld, hush: (tm) => hush(tm), hash, stepDur, swing, now,
    pluck, pad, choir, drone, bell, bass, lead, brass, taiko, kick, snare, clap, hat, crash, tom, boom, riser, shepard, shepPartials, scalePc, LEAD_VEL, BRIGHT,
    gliss: (t, until, P, vel) => glissKeep(t, until, P, vel),   // (the Shepard glissando from t, voices scheduled up to until: a piece's own riser)
    SHEP: { bottom: SHEP.lo, octaves: SHEP.oct, centre: SHEP.lo + 6 * SHEP.oct } };

  const info = (s) => ({ name: s.name, title: s.title, bpm: s.bpm, key: s.key + ' minor' /* (every piece is in minor and ends in major) */,
    meter: s.meter === 12 ? '6/8' : s.swing ? '4/4 swing' : '4/4', lead: s.lead, mood: s.mood, missions: s.missions.slice() });
  return {
    get title() { return rec ? rec.R.title : song.title; },
    get level() { return stage / 7; },
    get stage() { return stage; },
    get section() { return bar ? (bar.spool ? 'spool' : Math.floor(bar.b / 8) % 2 ? 'B' : 'A') : 'A'; },
    get step() { return step; },
    get ended() { return rec ? rec.ended : ended; },
    get arc() { return arc.log.slice(); },                // drops, builds and the breakdown of this run (tests, music.html)
    get bar() { return bar && { b: bar.b, st: bar.st, bk: bar.bk, build: bar.build, drop: bar.drop, layers: Object.keys(song.parts).filter(bar.has).length }; },
    // The planned ending (after jumped()): the final downbeat T, the cadence start, its chord, and the grid.
    get ending() { return ending && { T: ending.T, from: ending.from, cadence: ending.cad.name, jumpedAt: ending.jumpedAt, barDur: ending.bd, startT, bpm: song.bpm, meter: song.meter }; },
    songOf(id) { return (recFor(id) || songFor(id)).title; },
    list() { return SONGS.map(info); },
    pieces: SONGS,                                       // (the compiled score, for tests/music.js)
    define, kit,
    layersAt(name, st) { const s = SONGS.find(x => x.name === name); return Object.keys(s.parts).filter(p => plays(s, p, st)).sort(); },
    setMission(id) { const R = recFor(id); if (R && ac) useRec(R); else { useRec(null); switchTo(songFor(id)); } },
    setSong(name) { useRec(null); const s = SONGS.find(x => x.name === name); if (s) switchTo(s); },   // (a synthesized piece)
    reset() { if (rec) recStart(rec.R); else begin(song); },
    // Recordings (js/music/recorded-<name>.js): register one; list them; play one (music.html); the mission clock.
    record(r) { const R = { ...r, src: { main: r.main, ending: r.ending } }; delete R.main; delete R.ending; RECS[R.name] = R; for (const id of R.missions) REC_BY_MISSION[id] = R; return R; },
    recordings() { return Object.values(RECS).map(R => ({ name: R.name, title: R.title, missions: R.missions.slice(), length: R.length, sections: R.sections.slice() })); },
    playRecording(name) { const R = RECS[name]; if (recUsable(R) && ac) useRec(R); return !!rec; },
    setClock(t) { clock = t === null || t === undefined || !isFinite(t) ? null : +t; },
    // The playing recording (null: a synthesized piece): its position in main.mp3, the section there, the ending.
    get recording() {
      if (!rec) return null;
      const R = rec.R, p = R.main ? R.main.el.currentTime : 0, sec = [...R.sections].reverse().find(x => x.t <= p);
      return { name: R.name, title: R.title, pos: p, section: sec ? sec.label : '', ending: !!rec.ending, ended: rec.ended };
    },
    recMath: { pos: recPos, nextBar: recNextBar },        // (pure: tests/music.js)
    // The player (music.html): the arc of a whole mission ahead, and seeking into it.
    plan(L = 300) { const P = plan(song, L); return { barDur: P.barDur, bars: P.bars.map(({ before, ...x }) => x) }; },
    seek(t, L = 300) { return seek(t, L); },
    setIntensity(k) { intensity = Math.max(0, Math.min(1, +k || 0)); },
    setThreat(v) { if (threat && !v && ac) threatT = now(); threat = !!v; },
    setJump(v) { jumpOn = !!v; },
    jumped() {
      if (rec) { if (!rec.ending && !rec.ended) { if (silent()) { rec.ended = ended = true; } else recJump(); } return; }
      if (ended || ending) return; if (ac && bar && !silent()) planEnding(); else ended = true;
    },
    rearm() { if (rec) { if (rec.ending || rec.ended) { jumpOn = false; ended = false; recStart(rec.R); } return; } if (ended || ending) { jumpOn = false; begin(song); } },
    setPaused(v) { if (paused === !!v) return; paused = !!v; setSilent(); },
    // Offline rendering (music.html's level check): attach to an OfflineAudioContext, then pump(t) to schedule up to t.
    offline: {
      attach(ctx, dest, noise) { attach(ctx, dest, noise, true); vnow = 0; },
      pump(until) { while (vnow + 0.05 < until) { vnow = Math.min(until, vnow + 0.05); tick(); } },
    },
  };
})();
