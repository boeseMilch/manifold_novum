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
//   7 the jump drive spools (setJump): the bVI-bVII spool chords, a rising line, snare rolls and a riser
//     in 4-bar waves, for as long as it takes. jumped(): everything cuts, and 1.5 s later (with the
//     jump's boom) the final hit lands on the home chord in MAJOR, then it rings out and stays quiet.
// Stages only move on bar lines: up after a one-bar drum fill, down only at a phrase start.
// Exactly one sequencer exists; switching pieces fades the old one out (tails included) and starts the
// new one on its first step. The music pauses while the browser tab is hidden (two open tabs never play
// over each other; the game itself keeps running).
//   music.setMission(id)  setIntensity(0..1)  setThreat(bool)  setJump(bool)  jumped()  rearm()
//   music.title  songOf(id)  list()  setSong(name)  setPaused(bool)  reset()  level  stage  section  step
// music.html is a little player for the pieces; tests/music.js checks the composition and the engine.

const music = (() => {
  // ---------------------------------------------------------------- the score
  // Themes: one string per bar, one slot per 8th note (8 in 4/4, 6 in 6/8): a note name starts a note,
  // '_' holds it, '.' rests. Ostinato: one step per 16th, chord tones 0 root, 1 fifth, 2 octave, 3 tenth
  // (third + octave), 4 fifth + octave, '.' rest.
  // parts: layer → [first stage, last stage] (a number: from that stage on).
  const PIECES = [
    { name: 'held', title: 'Held Together', bpm: 100, key: 'D', missions: ['intro', 'rush', 'practice'],
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
    { name: 'cargo', title: 'Cargo Run', bpm: 96, key: 'E', missions: ['c1', 'c2', 'c3', 'salvage'],
      mood: 'a hauler\'s shuffle: a walking boogie bass and a shaker, strummed chords, a whistled tune',
      lead: 'flute', ostInst: 'pluck', drums: 'kit', swing: 0.3, keepRegister: true,   // (its other tracks were liked as they are)
      parts: { walk: 0, hats: 0, strum: [1, 4], drums: 2, pad: 3, ost: 3, ost16: 5, theme: 4, brass: 5, taiko: 5, stabs: 6, strings: 6 },
      A: { chords: 'Em Em C C Am Am B B', theme: [
        'E4 _ G4 _ B4 _ _ _', 'B4 _ A4 _ G4 _ F#4 _', 'G4 _ _ _ E4 _ C5 _', 'C5 _ _ _ G4 _ _ _',
        'A4 _ _ C5 _ _ E5 _', 'E5 _ D5 _ C5 _ A4 _', 'B4 _ _ _ D#5 _ F#5 _', 'F#5 _ _ _ D#5 _ _ _'] },
      B: { chords: 'C D Em Em C D B B', theme: [
        'G5 _ _ _ E5 _ _ _', 'F#5 _ _ _ A5 _ _ _', 'G5 _ _ _ _ _ B5 _', 'E5 _ _ _ _ _ . .',
        'C5 _ _ E5 _ _ G5 _', 'F#5 _ _ _ D5 _ A4 _', 'B4 _ _ _ D#5 _ F#5 _', 'D#5 _ _ _ _ _ . .'] },
      spool: 'C D', end: 'E', ost: '0 0 1 0 2 0 1 0 0 0 1 0 3 0 1 0' },
    { name: 'comet', title: 'Red Comet Gallop', bpm: 126, key: 'A', missions: ['c4', 'pirates'], meter: 12,
      mood: 'a rowdy pirate jig in 6/8: stomps, claps, an accordion, oom-pah bass',
      lead: 'reed', ostInst: 'pluck', drums: 'stomp',
      parts: { drums: 0, accordion: 0, bass: 1, ost: 2, ost16: 4, hats: 2, taiko: 3, pad: 3, theme: 4, snare: 4, brass: 5, stabs: 6, strings: 6 },
      A: { chords: 'Am Am G G F F E E', theme: [
        'A4 _ C5 E5 _ C5', 'A5 _ G5 E5 _ C5', 'D5 _ B4 G4 _ B4', 'D5 _ _ _ _ .',
        'C5 _ A4 F4 _ A4', 'C5 _ F5 A5 _ F5', 'G#5 _ E5 B4 _ G#4', 'E5 _ _ _ _ .'] },
      B: { chords: 'Am F C G Am F E E', theme: [
        'E5 _ _ A5 _ _', 'A5 _ G5 F5 _ C5', 'G5 _ E5 C5 _ E5', 'D5 _ _ B4 _ G4',
        'C5 _ E5 A5 _ G5', 'A5 _ _ C6 _ A5', 'B5 _ G#5 E5 _ B4', 'E5 _ _ _ _ .'] },
      spool: 'F G', end: 'A', ost: '0 . 2 1 1 . 0 . 2 3 1 .' },
    { name: 'signal', title: 'A Signal in the Dark', bpm: 92, key: 'C', missions: ['c5', 'rescue'],
      mood: 'radio static and the theme on a distant radio horn, until a solo voice answers',
      lead: 'voice', ostInst: 'pluck', drums: 'taiko',
      parts: { radio: [0, 3], static: [0, 2], pad: 1, bells: [2, 4], ost: 3, ost16: 5, drums: 3, bass: 3, hats: 4, snare: 4, theme: 4, brass: 5, stabs: 6, strings: 6 },
      A: { chords: 'Ab Ab Eb Eb Bb Bb Cm Cm', theme: [
        'C5 _ _ _ Eb5 _ _ _', 'Ab4 _ _ _ _ _ Bb4 _', 'G4 _ _ _ Bb4 _ Eb5 _', 'G5 _ F5 _ Eb5 _ _ _',
        'D5 _ _ _ F5 _ _ _', 'Bb4 _ _ _ D5 _ C5 _', 'Eb5 _ _ _ _ _ D5 _', 'C5 _ _ _ _ _ . .'] },
      B: { chords: 'Fm Fm Ab Bb Eb Bb Cm Cm', theme: [
        'C5 _ _ F5 _ _ Ab5 _', 'Ab5 _ _ _ F5 _ C5 _', 'Eb5 _ _ _ C5 _ Eb5 _', 'F5 _ _ _ D5 _ F5 _',
        'G5 _ _ _ _ _ Bb5 _', 'Bb5 _ _ _ F5 _ D5 _', 'Eb5 _ _ _ G5 _ _ _', 'C5 _ _ _ _ _ . .'] },
      spool: 'Ab Bb', end: 'C', ost: '0 2 1 2 3 2 1 2 0 2 1 2 3 2 1 2' },
    { name: 'bloom', title: 'Bloom', bpm: 104, key: 'F#', missions: ['c6', 'ore'],
      mood: 'something growing: a low choir, popping spores, marimba and hand drums, a glassy FM lead',
      lead: 'fm', ostInst: 'marimba', drums: 'hand',
      parts: { choir: 0, bubbles: [0, 3], ost: 1, ost16: 3, drums: 2, bass: 3, hats: 5, theme: 4, brass: 5, taiko: 5, stabs: 6, strings: 6 },
      A: { chords: 'F#m F#m G G F#m F#m E E', theme: [
        'F#4 _ _ _ C#5 _ _ _', 'A4 _ _ _ _ _ F#4 _', 'G4 _ _ _ B4 _ D5 _', 'B4 _ _ _ _ _ . .',
        'C#5 _ _ _ F#5 _ _ _', 'C#5 _ B4 _ A4 _ _ _', 'B4 _ _ _ G#4 _ E4 _', 'G#4 _ _ _ _ _ . .'] },
      B: { chords: 'D E F#m F#m D E C# C#', theme: [
        'F#5 _ _ _ _ _ A5 _', 'G#5 _ _ _ E5 _ B4 _', 'C#5 _ _ F#5 _ _ A5 _', 'F#5 _ _ _ _ _ . .',
        'A5 _ _ _ F#5 _ D5 _', 'B5 _ _ _ G#5 _ E5 _', 'G#5 _ _ _ F5 _ C#5 _', 'C#5 _ _ _ _ _ . .'] },
      spool: 'D E', end: 'F#', ost: '0 . . 2 . . 1 . 0 . . 2 . 3 . 1' },
    { name: 'hull', title: 'Pressure Hull', bpm: 84, key: 'B', missions: ['c7', 'deep'],
      mood: 'deep and sparse: a sonar ping, a heartbeat, half-time drums, a cello',
      lead: 'cello', ostInst: 'pluck', drums: 'half', bassStyle: 'half',
      parts: { sonar: [0, 4], heart: [0, 2], drone: [1, 4], pad: 2, ost: 2, ost16: 5, drums: 3, bass: 3, hats: 4, theme: 4, brass: 5, stabs: 6, strings: 6 },
      A: { chords: 'Bm Bm G G Em Em F# F#', theme: [
        'B3 _ _ _ _ _ F#4 _', 'D4 _ _ _ _ _ C#4 _', 'B3 _ _ _ D4 _ G4 _', 'G4 _ _ _ D4 _ _ _',
        'E4 _ _ G4 _ _ B4 _', 'B4 _ G4 _ E4 _ _ _', 'F#4 _ _ _ A#4 _ C#5 _', 'A#4 _ _ _ _ _ . .'] },
      B: { chords: 'G A Bm Bm G A F# F#', theme: [
        'D5 _ _ _ B4 _ _ _', 'C#5 _ _ _ E5 _ _ _', 'F#5 _ _ _ _ _ D5 _', 'B4 _ _ _ _ _ . .',
        'G5 _ _ _ D5 _ B4 _', 'A4 _ _ C#5 _ _ E5 _', 'F#5 _ _ _ C#5 _ A#4 _', 'F#4 _ _ _ _ _ . .'] },
      spool: 'G A', end: 'B', ost: '0 . 0 . 1 . 0 . 0 . 0 . 3 . 1 .' },
    { name: 'home', title: 'Last Jump Home', bpm: 112, key: 'C', missions: ['c8', 'nightmare'],
      mood: 'a ticking clock and the theme on a music box; then a slow wobble bass creeps in, and the drop: half-time drums, a heavy snare on 3',
      lead: 'saw', ostInst: 'pluck', drums: 'dub',
      parts: { tick: [0, 3], tines: [0, 3], pad: 1, wobble: 2, drums: 3, hats: 3, snare: 4, theme: 4, choir: 5, brass: 5, stabs: 6, strings: 6 },
      A: { chords: 'Cm Cm Ab Ab Fm Fm G G', theme: [
        'C5 _ _ G4 _ _ C5 _', 'Eb5 _ _ _ C5 _ D5 _', 'Eb5 _ _ _ _ _ C5 _', 'Ab4 _ _ _ _ _ Bb4 _',
        'C5 _ _ F5 _ _ Ab5 _', 'Ab5 _ G5 _ F5 _ C5 _', 'D5 _ _ _ B4 _ G4 _', 'B4 _ _ _ D5 _ _ _'] },
      B: { chords: 'Ab Bb Cm Cm Ab Bb G G', theme: [
        'Eb5 _ _ _ Ab5 _ _ _', 'F5 _ _ _ Bb5 _ _ _', 'G5 _ _ _ _ _ Eb5 _', 'C5 _ _ _ _ _ . .',
        'C5 _ _ Eb5 _ _ Ab5 _', 'Bb5 _ _ _ F5 _ D5 _', 'D5 _ _ _ G5 _ _ _', 'G5 _ _ _ D5 _ F5 _'] },
      spool: 'Ab Bb', end: 'C', ost: '0 0 1 0 2 0 1 0 0 0 1 0 3 2 1 0' },
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
  const SONGS = PIECES.map(p => {
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
      ost, tonic: chordOf(p.key).root };
  });
  const BY_MISSION = {};
  for (const s of SONGS) for (const id of s.missions) BY_MISSION[id] = s;
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
  let ending = null;
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
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold); g.gain.setTargetAtTime(0, t + a + hold, tc);
  };
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
    const f = hz(m), end = t + 0.4, lp = filt('lowpass', 0, 4), g = ac.createGain();
    lp.frequency.setValueAtTime(500 + 2800 * bright, t); lp.frequency.exponentialRampToValueAtTime(160 + f, t + 0.16);
    osc('sawtooth', f, t, end).connect(lp); osc('square', f, t, end, 8).connect(lp);
    env(g, t, 0.004, vel, 0.01, 0.07); lp.connect(g); route(p ? pan(g, p) : g, false, true);
  }
  // A wooden marimba: a sine and its quickly dying 4th partial.
  function marimba(m, t, vel) {
    const f = hz(m), g = ac.createGain(), g2 = ac.createGain();
    osc('sine', f, t, t + 0.7).connect(g); osc('sine', f * 4, t, t + 0.15).connect(g2); g2.connect(g);
    env(g, t, 0.002, vel, 0, 0.13); env(g2, t, 0.001, 0.5, 0, 0.018); route(g, true, true);
  }
  // A held pad: the 4-note voicing on two detuned saw layers, panned apart. Returns its release.
  function pad(voice, t, vel, bright) {
    const parts = [];
    for (const side of [-1, 1]) {
      const lp = filt('lowpass', 0, 0.8), g = ac.createGain();
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
    const g = ac.createGain(), f1 = filt('bandpass', 380, 3), f2 = filt('bandpass', 900, 4);
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 4.7; lg.gain.value = 8; lfo.connect(lg); lfo.start(t);
    const os = voice.map((m, i) => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m - (i < 2 ? 12 : 0)); o.detune.value = (i - 1.5) * 6; lg.connect(o.detune); o.start(t); o.connect(f1); o.connect(f2); return o; });
    f1.connect(g); f2.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 1.2); route(pan(g, -0.15), true, false);
    return holder([...os, lfo], g, vel, 0.4);
  }
  // The low drone: a sine root and a filtered saw. Returns its release.
  function drone(m, t, vel) {
    const g = ac.createGain(), lp = filt('lowpass', 220, 1), a = ac.createOscillator(), b = ac.createOscillator();
    a.type = 'sine'; a.frequency.value = hz(m); b.type = 'sawtooth'; b.frequency.value = hz(m) * 1.002;
    a.connect(g); b.connect(lp); lp.connect(g); a.start(t); b.start(t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 2.5); route(g, true, false);
    return holder([a, b], g, vel, 0.8, 5, true);
  }
  // Radio static: short band-limited crackles and a brief "tuning" burst now and then, fading out as the music builds.
  function crackle(t, vel) {
    const n = noiseSrc(t, t + 0.06), bp = filt('bandpass', 1600 + 1600 * Math.random(), 2.5), g = ac.createGain();
    n.connect(bp); bp.connect(g); env(g, t, 0.002, vel, 0, 0.008); route(pan(g, 0.35), false, false);
  }
  function tuning(t, len, vel) {
    const n = noiseSrc(t, t + len + 0.4), bp = filt('bandpass', 1400, 3), g = ac.createGain();
    bp.frequency.setValueAtTime(1100, t); bp.frequency.linearRampToValueAtTime(1900, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.08); g.gain.setTargetAtTime(0, t + len, 0.05);
    n.connect(bp); bp.connect(g); route(pan(g, 0.35), true, false);
  }
  // A small bell (glockenspiel-ish): a sine and an inharmonic overtone that dies first.
  function bell(m, t, vel, p) {
    const f = hz(m), g = ac.createGain(), g2 = ac.createGain();
    osc('sine', f, t, t + 2).connect(g); osc('sine', f * 2.76, t, t + 0.6).connect(g2); g2.connect(g);
    env(g, t, 0.003, vel, 0, 0.45); env(g2, t, 0.002, 0.35, 0, 0.08);
    route(pan(g, p), true, true);
  }
  // A music-box tine: pure and high, with a bright octave click at the start.
  function tine(m, t, vel, p) {
    const f = hz(m), g = ac.createGain(), g2 = ac.createGain();
    osc('sine', f, t, t + 2.6).connect(g); osc('sine', f * 2, t, t + 0.3).connect(g2); g2.connect(g);
    env(g, t, 0.002, vel, 0, 0.55); env(g2, t, 0.001, 0.6, 0, 0.03); route(pan(g, p), true, false);
    return { g, at: t };
  }
  // A sonar ping: a clean sine with a slight downward glide, into the echo.
  function sonar(m, t, vel) {
    const f = hz(m), o = osc('sine', f, t, t + 2.5), g = ac.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.985, t + 1.5);
    o.connect(g); env(g, t, 0.004, vel, 0.05, 0.45); route(pan(g, -0.3), true, true);
  }
  // A heartbeat: lub-dub.
  function heart(t, vel) {
    for (const [d, v] of [[0, 1], [0.2, 0.6]]) {
      const o = osc('sine', 75, t + d, t + d + 0.5), g = ac.createGain();
      o.frequency.setValueAtTime(75, t + d); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.14);
      o.connect(g); env(g, t + d, 0.004, vel * v, 0.01, 0.07); route(g, true, false);
    }
  }
  // A clock: tick (high) and tock (low), dry little clicks.
  function tick2(t, vel, hi) {
    const o = osc('square', hi ? 2600 : 1700, t, t + 0.05), bp = filt('bandpass', hi ? 3200 : 2000, 2), g = ac.createGain();
    o.connect(bp); bp.connect(g); env(g, t, 0.001, vel, 0, 0.008); route(pan(g, hi ? 0.2 : -0.2), true, false);
  }
  // Spores popping: a quick upward sine blip.
  function bubble(m, t, vel, p) {
    const f = hz(m), o = osc('sine', f, t, t + 0.2), g = ac.createGain();
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.07);
    o.connect(g); env(g, t, 0.003, vel, 0, 0.035); route(pan(g, p), true, true);
  }
  // An accordion pump: the chord on square-wave reed pairs, a few cents apart (the musette beating).
  function accordion(voice, t, len, vel) {
    const lp = filt('lowpass', 2000, 0.7), g = ac.createGain(), end = t + len + 0.3;
    for (const m of voice.slice(1)) for (const d of [-11, 11]) osc('square', hz(m), t, end, d).connect(lp);
    env(g, t, 0.02, vel, Math.max(0, len - 0.02), 0.05); lp.connect(g); route(pan(g, 0.2), true, false);
  }
  function bass(m, t, len, vel) {
    if (!song.classic) vel *= 0.55;                       // (the new pieces: less low-mid weight, see the analysis)
    const f = hz(m), end = t + len + 0.3, lp = filt('lowpass', 0, 2), g = ac.createGain();
    lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(260, t + 0.12);
    osc('sawtooth', f, t, end).connect(lp); osc('sine', f, t, end).connect(g);
    lp.connect(g); env(g, t, 0.006, vel, Math.max(0, len - 0.05), 0.04); route(g, false, false);
  }
  // The wobble bass (Last Jump Home): two saws and a square an octave down through a resonant lowpass whose
  // cutoff an LFO sweeps in time with the beat (rate: wobbles per second), with a sine sub underneath. The LFO
  // starts closed (a -cos wave), so every bar's wobble begins on the beat.
  function wobble(c, t, len, rate, vel, att) {
    const f = hz(bassRoot(c) + 12), end = t + len + 0.3, lp = filt('lowpass', 1250, 7), g = ac.createGain();
    for (const d of [-8, 8]) osc('sawtooth', f, t, end, d).connect(lp);
    osc('square', f / 2, t, end).connect(lp);
    const lfo = ac.createOscillator(), lg = ac.createGain();
    if (ac.createPeriodicWave) lfo.setPeriodicWave(ac.createPeriodicWave(new Float32Array([0, -1]), new Float32Array([0, 0])));
    else lfo.type = 'sine';
    lfo.frequency.value = rate; lg.gain.value = 1100; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t); lfo.stop(end);
    const sub = osc('sine', f / 2, t, end), sg = ac.createGain(); sg.gain.value = 1.1; sub.connect(sg); sg.connect(g);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + att);
    g.gain.setValueAtTime(vel, t + Math.max(att, len - 0.03)); g.gain.linearRampToValueAtTime(0, t + len);
    lp.connect(g); route(g, false, false);
  }
  // The walking bass (Cargo Run): round and woody, a triangle and a sine through a soft filter, each note
  // plucked (quick swell, decaying) and released before it stops.
  function walkBass(m, t, len, vel) {
    const f = hz(m), lp = filt('lowpass', 0, 0.7), g = ac.createGain(), end = t + len + 0.4;
    lp.frequency.setValueAtTime(1300, t); lp.frequency.setTargetAtTime(550, t + 0.008, 0.08);
    osc('triangle', f, t, end).connect(lp); osc('sine', f, t, end).connect(lp);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.008); g.gain.setTargetAtTime(vel * 0.55, t + 0.008, 0.12);
    g.gain.setTargetAtTime(0, t + len, 0.04);
    lp.connect(g); route(g, false, false);
  }
  // The theme. Timbres: horn (two saws, vibrato, a breathy filter swell), strings (the climax double),
  // saw (a bright detuned synth lead), flute (a whistle: sine, a breath of noise), reed (accordion),
  // fm (glassy FM bell lead), cello (dark, slow bow), radio (a horn on a far-away radio).
  function lead(m, t, len, vel, type) {
    const f = hz(m), end = t + len + 0.8, g = ac.createGain();
    const V = { horn: [5.0, 0.005, 0.05, 0.1], strings: [5.6, 0.007, 0.16, 0.18], saw: [5.5, 0.004, 0.02, 0.09], flute: [5.2, 0.009, 0.07, 0.08],
      reed: [6.3, 0.004, 0.03, 0.05], fm: [0, 0, 0.005, 0.25], cello: [5.0, 0.008, 0.15, 0.2], radio: [5.0, 0.004, 0.05, 0.1], voice: [5.4, 0.01, 0.12, 0.2] }[type];
    const [rate, depth, att, rel] = V;
    const vib = [];
    let src;
    if (type === 'fm') {                                   // carrier + modulator at 3.5×, the index dying away
      const car = osc('sine', f, t, end), mod = osc('sine', f * 3.5, t, end), mg = ac.createGain();
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
      const lfo = osc('sine', rate, t, end), lg = ac.createGain();
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
    const r = bassRoot(c) + (song.classic || song.keepRegister ? 12 : 24), end = t + len + 0.6, lp = filt('lowpass', 0, 1.2), g = ac.createGain();   // (the new pieces: horns an octave up, brighter)
    for (const m of [r, r + 7, r + 12, r + 12 + c.third]) osc('sawtooth', hz(m), t, end, (m % 3 - 1) * 6).connect(lp);
    lp.frequency.setValueAtTime(220, t);
    if (stab) { lp.frequency.linearRampToValueAtTime(2400, t + 0.03); lp.frequency.setTargetAtTime(500, t + 0.05, 0.08); }
    else { lp.frequency.linearRampToValueAtTime(2200, t + Math.min(0.5, len * 0.4)); lp.frequency.setTargetAtTime(900, t + Math.min(0.5, len * 0.4), len * 0.4); }
    env(g, t, stab ? 0.01 : Math.min(0.25, len * 0.2), vel, stab ? 0.08 : len * 0.6, stab ? 0.06 : 0.2);
    lp.connect(g); route(g, true, false);
  }
  // Drums.
  function taiko(t, vel, p = 1) {
    const g = ac.createGain(), o = osc('sine', 130 * p, t, t + 0.9), skin = song.classic ? 0 : 1;   // (the new pieces: less boom, more skin)
    o.frequency.setValueAtTime(130 * p, t); o.frequency.exponentialRampToValueAtTime(46 * p, t + 0.28);
    const og = skin ? ac.createGain() : null; if (og) { og.gain.value = 0.7; o.connect(og); og.connect(g); } else o.connect(g);
    env(g, t, 0.003, vel, 0.02, 0.17);
    const n = noiseSrc(t, t + (skin ? 0.35 : 0.12)), lp = filt(skin ? 'bandpass' : 'lowpass', skin ? 700 : 900, skin ? 0.8 : 0), ng = ac.createGain();
    n.connect(lp); lp.connect(ng); env(ng, t, 0.002, vel * (skin ? 1.1 : 0.5), 0, skin ? 0.045 : 0.03); ng.connect(g);
    route(g, true, false);
  }
  function kick(t, vel) {
    const o = osc('sine', 120, t, t + 0.4), g = ac.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.09);
    o.connect(g); env(g, t, 0.002, vel, 0.01, 0.08); route(g, false, false);
  }
  function snare(t, vel) {
    const n = noiseSrc(t, t + 0.35), bp = filt('bandpass', 1900, 0.7), g = ac.createGain();
    n.connect(bp); bp.connect(g); env(g, t, 0.002, vel, 0, 0.065);
    const o = osc('triangle', 200, t, t + 0.2), og = ac.createGain();
    o.frequency.exponentialRampToValueAtTime(150, t + 0.08); o.connect(og); env(og, t, 0.002, vel * 0.7, 0, 0.04); og.connect(g);
    route(g, true, false);
  }
  function clap(t, vel) {                                  // three quick slaps
    const n = noiseSrc(t, t + 0.4), bp = filt('bandpass', 1200, 0.9), sum = ac.createGain();
    n.connect(bp);
    for (const d of [0, 0.011, 0.023]) {                   // (each slap its own envelope: no ramp after a decay, which can jump)
      const g = ac.createGain(); env(g, t + d, 0.003, vel, 0, d < 0.02 ? 0.003 : 0.05); bp.connect(g); g.connect(sum);
    }
    route(pan(sum, -0.2), true, false);
  }
  function hat(t, vel, open, kind) {                      // kind: 'shaker', 'jingle' (tambourine), or a hi-hat
    const n = noiseSrc(t, t + (open ? 0.6 : kind ? 0.15 : 0.12)), hp = filt(kind ? 'bandpass' : 'highpass', kind === 'shaker' ? 5200 : kind ? 7000 : 7200, kind ? 1.2 : 0), g = ac.createGain();
    n.connect(hp); hp.connect(g); env(g, t, kind === 'shaker' ? 0.012 : kind ? 0.003 : 0.001, vel, 0, open ? 0.12 : kind === 'jingle' ? 0.05 : kind ? 0.03 : 0.022);
    route(pan(g, kind === 'shaker' ? -0.3 : 0.3), false, false);
  }
  function crash(t, vel) {
    const n = noiseSrc(t, t + 4), hp = filt('highpass', 3800), g = ac.createGain();
    n.connect(hp); hp.connect(g); env(g, t, 0.003, vel, 0, 0.8); route(g, true, false);
  }
  function tom(t, vel, f, short, classic) {
    const o = osc('sine', f, t, t + 0.6), g = ac.createGain();
    if (!classic) o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * (short ? 0.8 : 0.55), t + 0.3);
    o.connect(g); env(g, t, 0.003, vel, 0, short ? 0.05 : 0.14); route(g, true, false);
  }
  function boom(t, vel) {
    const o = osc('sine', 58, t, t + 3), g = ac.createGain();
    o.frequency.exponentialRampToValueAtTime(29, t + 1.4); o.connect(g); env(g, t, 0.005, vel, 0.05, 0.6); route(g, false, false);
  }
  // A swell into a downbeat: filtered noise opening up.
  function riser(t, dur, vel, from, to) {
    const n = noiseSrc(t, t + dur + 0.05), bp = filt('bandpass', from, 1.6), g = ac.createGain();
    bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vel, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    n.connect(bp); bp.connect(g); route(g, true, false);
  }

  // ---------------------------------------------------------------- the sequencer
  function releaseHeld(t, tag) {
    for (const r of held) if (!tag || r.tag === tag) r(t);
    held = tag ? held.filter(r => r.tag !== tag) : [];
  }
  function hold(tag, r) { r.tag = tag; held.push(r); }
  function begin(s) {                      // start a piece from its first step (one sequencer, always)
    song = s; step = 0; ended = false; ending = null; arc = { dropped: 0, broke: false, mode: null, next: null, log: [] }; pending = null; bar = null; threatT = null;
    stage = jumpOn ? 7 : target(); spoolBar = 0;
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
  // ahead): a cadence on the piece's bVII (the spool's last chord) or its V, then the final hit on a downbeat.
  //  - already on the cadence chord: resolve on the next downbeat;
  //  - in the first half of another chord: the cadence chord takes over from the half bar;
  //  - later than that: one full cadence bar, then the hit.
  function planEnding() {
    const bd = stepDur() * song.meter, cad = song.spool[song.spool.length - 1];
    const dom = bar.c.name === cad.name || (bar.c.root === (song.tonic + 7) % 12 && bar.c.third === 4);
    const T1 = bar.t + bd, mid = bar.t + bd / 2;
    if (dom) ending = { T: T1, from: bar.t, cad: bar.c };
    else if (mid >= nextT + 0.005) ending = { T: T1, from: mid, cad };
    else ending = { T: T1 + bd, from: T1, cad };
    ending.jumpedAt = now(); ending.bd = bd;
  }
  // The cadence chord from the half bar: everything held (and melody notes still to come) gives way to it.
  function cadenceAt(tm) {
    const cad = ending.cad, has = (p) => plays(song, p, bar.st);
    hush(tm);
    bar.c = cad; bar.voice = padVoicing(cad); bar.notes = [];
    cadenceVoices(tm, ending.T - tm, has);
  }
  function hush(tm) {                               // everything held, and melody notes still sounding or to come, stops
    releaseHeld(tm);
    for (const n of bar.notes) {
      if (n.at >= tm - 1e-6) { n.g.gain.cancelScheduledValues(0); n.g.gain.value = 0; }
      else { n.g.gain.cancelScheduledValues(tm); n.g.gain.setTargetAtTime(0, tm, 0.04); }
    }
  }
  function cadenceVoices(t, len, has) {             // the cadence chord, swelling into the final downbeat
    const cad = ending.cad, voice = padVoicing(cad), m = inRange((cad.root + cad.third) % 12, 69);
    if (has('pad') || !has('choir')) hold('pad', pad(voice, t, 0.05, Math.max(0.5, BRIGHT[bar.st])));
    if (has('choir')) hold('choir', choir(voice, t, 0.25));
    brass(cad, t, len * 0.95, 0.05, false);
    bar.notes.push(lead(m, t, len * 0.97, song.classic ? 0.08 : LEAD_VEL[song.lead], song.lead), lead(m + 12, t, len * 0.97, 0.045, 'strings'));
    riser(t, len, 0.12, 400, 7000);
  }

  function barStart(b, t) {
    const want = target(), ph = b % 8;
    let drop = false;
    if (jumpOn) { if (stage !== 7) { stage = 7; spoolBar = b; pending = null; arc.mode = null; arc.next = null; } }
    else if (song.classic) {                                       // (Held Together: the first score's smooth build)
      if (stage === 7) stage = Math.min(6, want);
      if (pending !== null && b % 2 === 0) { stage = pending; pending = null; }
      if (b % 2 === 1 && want > stage) pending = want;            // up: a one-bar fill, then the new stage
      else if (b % 8 === 0 && want < stage) stage = want;          // down: only at a phrase start
    } else {
      // The arc: small steps up after a one-bar fill; the big ones (the theme's entrance, the climax) only at a
      // phrase start, after a build bar that ends in a beat of silence: the drop. Once the theme has dropped and
      // the mission is half way, one breakdown phrase strips it to the piece's signature, the pad and the
      // theme, rebuilds it bar by bar, and ends in a bigger drop.
      if (stage === 7) stage = Math.min(6, want);
      if (ph === 0 && arc.next !== null) {
        stage = arc.next; arc.next = null; pending = null; drop = true; arc.mode = null; arc.dropped++;
        arc.log.push({ bar: b, kind: 'drop', stage });
      } else if (ph === 0 && arc.mode === null && !arc.broke && arc.dropped && b - arc.log.filter(e => e.kind === 'drop').pop().bar >= 16 && want < 6 && stage >= 4) {
        arc.mode = 'breakdown'; arc.broke = true; arc.log.push({ bar: b, kind: 'breakdown', stage });
      }
      if (arc.mode === null) {
        if (pending !== null && b % 2 === 0) { stage = pending; pending = null; }
        const big = (stage < 4 && want >= 4) || (stage < 6 && want >= 6);
        if (big) { pending = null; if (ph === 7) arc.next = want; }
        else if (b % 2 === 1 && want > stage) pending = want;
        else if (ph === 0 && want < stage && !drop) stage = want;
      } else if (ph === 7) arc.next = Math.min(6, Math.max(want, stage + 1, 5));
      if (ph === 7 && arc.next !== null) arc.log.push({ bar: b, kind: 'build', stage: arc.next });
    }
    const st = stage, spool = st === 7, bi = b % 8, B = Math.floor(b / 8) % 2 === 1;
    const bk = arc.mode === 'breakdown' ? ph : -1, build = !song.classic && !spool && ph === 7 && arc.next !== null;
    const sig = (p) => !!song.parts[p] && song.parts[p][0] === 0;
    const has = bk < 0 ? (p) => plays(song, p, st)                 // in the breakdown: the signature, pad and theme; then layers return
      : (p) => (['pad', 'choir'].includes(p) || (p === 'theme' && !sig('tines') && !sig('radio')) || sig(p) || (bk >= 4 && ['ost', 'ost16', 'bass', 'walk', 'wobble'].includes(p)) || (bk >= 6 && ['drums', 'hats'].includes(p)))
        && (plays(song, p, st) || sig(p));
    const sec = B ? song.B : song.A;
    const cadBar = !!ending && t >= ending.from - 1e-6;           // a full cadence bar before the final hit
    const c = cadBar ? ending.cad : spool ? song.spool[(b - spoolBar) % song.spool.length] : sec.chords[bi];
    const N = song.meter, bd = stepDur() * N, e8 = stepDur() * 2, prev = bar;
    bar = { b, t, c, st, fill: cadBar || build ? null : pending, voice: padVoicing(c, song.classic || song.keepRegister ? 62 : 66), spool, sec, notes: [], has, bk, build, drop };
    if (cadBar) {
      if (prev && prev.c.name === c.name && ending.from < t - 1e-6) return;   // (already swelling on it)
      releaseHeld(t); cadenceVoices(t, ending.T - t, has); return;
    }
    const changed = repad || !prev || prev.c.name !== c.name || prev.spool !== spool || (song.classic ? Math.abs(prev.st - st) >= 2 : prev.st !== st || prev.bk !== bk) || bi === 0;
    if (changed) {                                               // held harmony: pad, choir (and the brass swell)
      repad = false;
      releaseHeld(t, 'pad'); releaseHeld(t, 'choir');
      if (has('pad')) hold('pad', pad(bar.voice, t, [0.03, 0.04, 0.045, 0.045, 0.045, 0.045, 0.05, 0.055][st], BRIGHT[st]));
      if (has('choir')) hold('choir', choir(bar.voice, t, st <= 2 ? 0.2 : 0.25));
      if (!song.classic && st >= 4 && bk < 0 && has('pad')) hold('pad', pad(bar.voice.map(m => m + 12), t, 0.032, 1));   // air: the pad an octave up, wide
      let run = 1; while (!spool && bi + run < 8 && sec.chords[bi + run].name === c.name) run++;   // (never into the next chord)
      if (has('brass')) brass(c, t, bd * (spool ? 0.9 : Math.min(2, run) * 0.9), spool ? 0.05 : 0.04, false);
    }
    if (bi === 0 || spool || (!has('drone') && !song.classic)) releaseHeld(t, 'drone');
    if (bi === 0 && has('drone')) hold('drone', drone(inRange(song.tonic, 36), t, song.classic ? (st <= 2 ? 0.09 : 0.06) : 0.08));
    if (has('static') && bi % 2 === 1) tuning(t + bd * 0.75, bd * 0.2, 0.02 / (1 + st));
    if (!song.classic && (bi === 0 || drop)) {                     // the hook (B) breathes out above the verse (A) once the theme is in
      const lift = spool || bk >= 0 || st < 4 || B ? 1 : 0.78;
      pb.fader.gain.setTargetAtTime(lift, t, drop ? 0.01 : bd * 0.3);
    }
    if (drop) { boom(t, 0.6); crash(t, 0.3); taiko(t, 0.6, 0.8); }   // the drop
    else if (build) riser(t, bd * 0.75, 0.15, 300, 8000);          // the build, up to the beat of silence
    if (bi === 0 && !spool && !drop && bk < 0) {
      if (st >= 6) { boom(t, 0.55); crash(t, 0.22); }
      else if (st >= 4) crash(t, 0.13);
    } else if (st === 6 && bi === 4 && !drop) crash(t, 0.12);
    if (has('wobble')) {                                           // the wobble: slow at first, faster and broken up after the drop
      const first = !prev || !prev.has('wobble'), cyc = st >= 6 ? [3, 4, 2, 4] : st >= 4 ? [2, 3, 2, 4] : st === 3 ? [2, 2, 2, 2] : [1, 1, 1, 1];
      wobble(c, t, (build ? bd * 0.75 : bd) - 0.01, song.bpm / 60 * (spool ? 4 : cyc[bi % 4]), st <= 2 ? 0.05 : 0.075, first ? bd * 0.9 : 0.01);
    }
    // melodies: the theme (from stage 4, strings an octave up at the climax), or its early disguises
    if (!spool) for (const n of sec.theme[bi]) {
      const at = t + n.slot * e8 + swing(n.slot * 2), len = n.len * e8 * 0.96;
      const ns = bar.notes;
      const call = !song.classic && st === 5 && bk < 0, mine = !call || ph % 4 < 2;   // stage 5: the lead calls, the strings answer
      if (has('theme') && mine) ns.push(lead(n.midi, at, len, song.classic ? (st >= 6 ? 0.075 : 0.085) : LEAD_VEL[song.lead] * (st >= 6 ? 0.9 : 1), song.lead));
      if (has('strings') || (call && !mine && has('theme'))) ns.push(lead(n.midi + 12, at, len, call ? 0.06 : 0.045, 'strings'));
      if (has('radio')) ns.push(lead(n.midi, at, len, LEAD_VEL.radio * (st >= 2 ? 1 : 0.8), 'radio'));
      if (has('tines')) { const m = n.midi + 12 > 91 ? n.midi : n.midi + 12; ns.push(tine(m, at, 0.12, 0.15)); if (n.len >= 3) ns.push(tine(m, at + 2 * e8, 0.06, -0.15)); }
    }
    if (spool) {                                                 // the spool: a rising line and waves of tension
      const cb = (b - spoolBar) % 4, m = inRange((c.root + c.third) % 12, 69);
      bar.notes.push(lead(m, t, bd * 0.97, song.classic ? 0.08 : LEAD_VEL[song.lead], song.lead), lead(m + 12, t, bd * 0.97, 0.05, 'strings'));
      if (cb === 0) { crash(t, 0.2); riser(t, bd * 4, 0.12, 300, 6000); }
    }
    if (has('sonar')) sonar(inRange(song.tonic, 81) - (bi % 2 ? 5 : 0), t, bi % 2 ? 0.1 : 0.15);   // ping (and a fourth lower, its answer)
  }

  const TAIKO = [[0], [0, 10], [0, 6, 10], [0, 3, 6, 10, 12], [0, 3, 6, 8, 10, 12, 14]];
  const TOMS = { 8: 230, 10: 210, 11: 190, 12: 165, 13: 140, 14: 120, 15: 100 };   // (the first score's fill)
  function playStep(t0) {
    const N = song.meter, s = step % N, b = Math.floor(step / N);
    if (s === 0) barStart(b, t0);
    if (ending && s === N / 2 && Math.abs(t0 - ending.from) < 1e-6) cadenceAt(t0);
    const { c, st, voice, spool, has } = bar, t = t0 + swing(s);
    if (bar.build && s >= N * 3 / 4) { if (s === N * 3 / 4) { hush(t0); repad = true; } return; }   // the beat of silence before the drop
    const fill = bar.fill !== null && s >= N / 2, big = fill && bar.fill >= 5, late = fill && s >= N * 3 / 4;
    const lv = (p) => st - song.parts[p][0];                     // how many stages a layer has been playing
    // ostinato (pluck or marimba), 8ths at first, 16ths later
    const k = song.ost[s];
    if (has('ost') && k >= 0 && (has('ost16') || s % 2 === 0) && !(late && big)) {
      const r = bassRoot(c) + (song.classic || song.keepRegister ? 12 : 24), tones = [r, r + 7, r + 12, r + 12 + c.third, r + 19], a = s % 4 === 0 ? 1 : 0.72;
      if (song.ostInst === 'marimba') marimba(tones[k], t, (st >= 3 ? 0.13 : 0.1) * a);
      else pluck(tones[k], t, (st >= 3 ? 0.085 : song.classic ? 0.06 : 0.1) * a, BRIGHT[st], song.classic ? 0 : s % 4 < 2 ? -0.5 : 0.5);
      if (st >= 6) pluck(tones[k] + 12, t, 0.04 * a, 0.9);
    }
    // the walking boogie bass (Cargo Run): root, third, fifth, sixth, seventh and back, in swung 8ths
    if (has('walk') && s % 2 === 0 && !late) {
      const ok = (iv) => c.pcs.includes((c.root + iv) % 12) || [0, 2, 3, 5, 7, 8, 10].includes((c.root + iv - song.tonic + 24) % 12);
      const six = ok(9) ? 9 : 8, sev = ok(10) ? 10 : 11;       // (passing notes stay in the key)
      const WALK = [0, c.third, 7, six, sev, six, 7, c.third];
      walkBass(bassRoot(c) + 12 + WALK[s / 2], t, stepDur() * 1.7, st <= 1 ? 0.085 : 0.075);
    }
    // strummed chords (Cargo Run)
    if (has('strum') && (s === 0 || s === 6 || s === 10)) voice.forEach((m, i) => pluck(m, t + i * 0.022, 0.04, 0.6, (i - 1.5) * 0.25));
    // accordion pumps: on the beats alone, then the "pah" off the bass's "oom"
    if (has('accordion')) {
      const on = has('bass') ? [3, 9] : [0, 6];
      if (on.includes(s)) accordion(voice, t, stepDur() * 2.4, st <= 1 ? 0.03 : 0.045);
    }
    // bells
    if (has('bells') && song.classic) {                         // (the first score's bells: sparse, then an arpeggio, then quarters)
      const on = st === 0 ? s % 8 === 0 : st === 1 ? s % 4 === 0 : st <= 3 ? s % 2 === 0 : s % 4 === 0;
      if (on) { const ARP = [0, 1, 2, 3, 2, 1, 3, 2], i = st <= 1 ? ARP[(s / 4 + b * 2) % 8] : ARP[s / 2]; bell(voice[i] + 12, t, st === 4 ? 0.035 : 0.05, (i - 1.5) * 0.3); }
    } else if (has('bells')) {
      const lb = lv('bells'), on = lb === 0 ? s % 4 === 0 : s % 2 === 0;
      if (on) { const ARP = [0, 1, 2, 3, 2, 1, 3, 2], i = ARP[(s / 2 + (lb === 0 ? b : 0)) % 8 | 0]; bell(voice[i] + 12, t, 0.05, (i - 1.5) * 0.3); }
    }
    // texture: radio crackles, spores, a heartbeat, a clock
    if (has('static') && hash(step) < 0.12 / (1 + st)) crackle(t + hash(step + 7) * stepDur(), (0.02 + 0.03 * hash(step + 3)) / (1 + st * 0.5));
    if (has('bubbles') && hash(step * 3 + 1) < 0.16) bubble(voice[(hash(step) * 4) | 0] + 12 + 12 * (hash(step + 5) < 0.4), t, 0.05, hash(step + 9) - 0.5);
    if (has('heart') && (s === 0 || (s === 8 && st >= 1))) heart(t, 0.45);
    if (has('tick') && s % 4 === 0) tick2(t, s === 0 ? 0.16 : 0.1, s % 8 === 0);
    // bass
    if (has('bass') && !(late && !spool)) {
      if (song.bassStyle === 'half') { if (s === 0 || s === 8 || (st >= 5 && s % 4 === 0)) bass(bassRoot(c), t, stepDur() * (st >= 5 ? 3.5 : 7), 0.22); }
      else if (N === 12) { if (s === 0 || s === 6 || (st >= 5 && (s === 4 || s === 10))) bass(bassRoot(c) + (s === 6 ? 7 : 0), t, stepDur() * 1.8, 0.22); }
      else if (s % 2 === 0) bass(bassRoot(c) + (st >= 5 && (s === 6 || s === 14) ? 12 : 0), t, stepDur() * 1.6, 0.2);
    }
    // drums: into the final downbeat, a fill that grows (snare roll, toms, taikos)
    if (ending && t0 >= ending.T - stepDur() * N / 2 - 1e-6) {
      const k3 = 1 - (ending.T - t0) / (stepDur() * N / 2);
      snare(t, 0.08 + 0.25 * k3); if (s % 2 === 0) taiko(t, 0.3 + 0.35 * k3, 1.25 - 0.4 * k3);
      if (song.drums === 'stomp' && s % 3 === 0) clap(t, 0.2);
      return;
    }
    if (bar.build) {                                               // the build: a snare roll and taikos swelling
      const k4 = s / (N * 3 / 4);
      snare(t, 0.05 + 0.25 * k4); if (s % 2 === 0) taiko(t, 0.25 + 0.35 * k4, 1.3 - 0.3 * k4);
      return;
    }
    if (bar.bk >= 0 && bar.bk < 6) return;                          // the breakdown: no drums yet
    if (spool) {
      const cb = (b - spoolBar) % 4, k2 = (cb * N + s) / (4 * N);
      if (s % 2 === 0) taiko(t, 0.42 + 0.25 * k2, s % 4 === 0 ? 1 : 1.2);
      if (cb < 2 ? s % 2 === 0 : true) snare(t, 0.06 + 0.22 * k2);
      hat(t, s % 4 === 2 ? 0.07 : 0.04);
      if (s % 4 === 0) brass(c, t, stepDur() * 1.5, 0.035, true);
      return;
    }
    if (fill) {
      const r = s - N / 2;
      if (song.classic) { if (s in TOMS) tom(t, big ? 0.5 : 0.36, TOMS[s], false, true); }
      else if (r !== 1) tom(t, big ? 0.5 : 0.36, 230 - r * 18);
      if (big) snare(t, 0.06 + r * 0.03);
      if (r === 0) riser(t, stepDur() * N / 2, big ? 0.14 : 0.08, 1500, 9000);
      return;
    }
    drums(s, st, t, has, lv);
    if (has('stabs') && (N === 12 ? [0, 6] : [0, 3, 6]).includes(s)) brass(c, t, stepDur() * 1.5, 0.03, true);
  }

  function drums(s, st, t, has, lv) {
    const style = song.drums, d = has('drums') ? lv('drums') : -1;
    if (style === 'taiko' || style === 'drive') {
      if (d >= 0 && TAIKO[Math.min(d, 4)].includes(s)) taiko(t, s === 0 ? 0.6 : 0.42, s === 0 ? 1 : 1.15);
      if (has('snare') && (s === 4 || s === 12)) snare(t, 0.25);
      if (style === 'drive' && has('snare') && st >= 5 && s % 2 === 1) snare(t, 0.035);   // driving ghost notes
      if (style === 'drive' && d >= 0 && (s === 14 || s === 15)) tom(t, 0.25, s === 14 ? 180 : 140);
      if (st >= 6 && s === 15) snare(t, 0.08);
      if (has('hats')) { const lh = lv('hats'); if (lh >= 2) hat(t, s % 4 === 2 ? 0.08 : s % 2 ? 0.03 : 0.045, s === 14); else if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.07 : 0.035); }
    } else if (style === 'kit') {                          // a swung backbeat kit with a shaker
      if (d >= 0 && (d >= 2 ? [0, 6, 8, 10] : d >= 1 ? [0, 8, 10] : [0, 8]).includes(s)) kick(t, 0.5);
      if (d >= 0 && (s === 4 || s === 12)) snare(t, 0.2);
      if (has('hats') && s % 2 === 0) hat(t, s % 4 === 2 ? 0.07 : 0.045, false, 'shaker');
      if (has('taiko') && (s === 0 || s === 10)) taiko(t, 0.5, 1);
      if (st >= 6 && s === 15) snare(t, 0.08);
    } else if (style === 'stomp') {                        // 6/8: STOMP . . clap . . STOMP . . clap
      if (d >= 0 && (s === 0 || s === 6)) taiko(t, d >= 2 ? 0.5 : 0.33, 0.75);
      if (d >= 0 && (s === 3 || s === 9)) clap(t, d >= 2 ? 0.22 : 0.14);
      if (has('hats') && (lv('hats') >= 3 || s % 2 === 0)) hat(t, s % 6 === 0 ? 0.08 : 0.05, false, 'jingle');
      if (has('taiko') && (lv('taiko') >= 2 ? [0, 4, 6, 8, 10] : [0, 6]).includes(s)) taiko(t, s % 6 === 0 ? 0.5 : 0.35, s % 6 === 0 ? 1 : 1.2);
      if (has('snare') && s === 6) snare(t, 0.25);
      if (st >= 6 && s === 11) snare(t, 0.1);
    } else if (style === 'hand') {                         // hand drums, syncopated; taikos join late
      if (d >= 0) {
        if ((d >= 1 ? [0, 7, 10] : [0, 10]).includes(s)) tom(t, 0.4, 140, true);
        if ((d >= 1 ? [3, 6, 12, 14, 15] : [3, 6, 14]).includes(s)) tom(t, s === 15 ? 0.15 : 0.25, 330, true);
        if (d >= 2 && (s === 4 || s === 12)) snare(t, 0.16);
      }
      if (has('taiko') && [0, 6, 10].includes(s)) taiko(t, 0.5, s === 0 ? 1 : 1.15);
      if (has('hats') && s % 2 === 0) hat(t, s % 4 === 2 ? 0.06 : 0.035);
    } else if (style === 'dub') {                          // half time: kick on the 1, a heavy snare on the 3 (from the drop)
      if (d >= 0 && (s === 0 || (st >= 5 && s === 10) || (st >= 6 && s === 7))) kick(t, 0.65);
      if (has('snare') && s === 8) { snare(t, 0.4); clap(t, 0.16); taiko(t, 0.3, 1.4); }
      if (has('hats')) { if (lv('hats') >= 2) hat(t, s % 4 === 2 ? 0.07 : 0.03); else if (s % 2 === 0) hat(t, s % 4 === 2 ? 0.06 : 0.03); }
      if (st >= 6 && s === 15) snare(t, 0.1);
    } else if (style === 'half') {                         // half time; full time from stage 5
      const full = st >= 5;
      if (d >= 0 && (full ? [0, 6, 10] : [0]).includes(s)) taiko(t, 0.6, 0.9);
      if (d >= 0 && (full ? [4, 12] : [8]).includes(s)) snare(t, full ? 0.25 : 0.3);
      if (has('hats') && s % (full ? 2 : 4) === 0) hat(t, s % 8 === 4 ? 0.06 : 0.035, s === 12 && !full);
      if (st >= 6 && s === 15) snare(t, 0.08);
    }
  }

  // The final hit, on the downbeat after the cadence: the home chord in major, on the piece's own instruments,
  // ringing out. Each piece adds its own last word (a stomp, a sonar ping, the music box, ...).
  function finale(T) {
    const c = { ...song.end, third: 4, pcs: [song.end.root, (song.end.root + 4) % 12, (song.end.root + 7) % 12] }, P = song.parts;
    releaseHeld(T);
    boom(T, 0.5); crash(T, 0.3); taiko(T, 0.55, 1); taiko(T, 0.4, 0.7);
    brass(c, T, 3.2, 0.09, false);
    const v = padVoicing(c), rel = pad(v, T, 0.08, 0.9), rel2 = pad(v.map(m => m + 12), T, 0.05, 1);
    rel(T + 2.6); rel2(T + 2.6);
    const third = inRange(c.pcs[1], 69);
    lead(third, T, 2.6, song.classic ? 0.08 : LEAD_VEL[song.lead], song.lead); lead(third + 12, T, 2.6, 0.05, 'strings');
    bass(bassRoot(c), T, 2.5, 0.25);
    const sd = stepDur();
    if (song.classic || P.bells) v.forEach((m, i) => bell(m + 24, T + 0.08 * i, 0.05, (i - 1.5) * 0.4));
    if (P.walk) { voiceStrum(v, T, 0.05); walkBass(bassRoot(c) + 12, T, 1.6, 0.09); hat(T, 0.06, false, 'shaker'); }
    if (P.accordion) { accordion(v, T, 1.8, 0.05); taiko(T + sd * 6, 0.45, 0.75); clap(T + sd * 6, 0.25); }   // and a last stomp-clap
    if (P.radio) lead(inRange(c.root, 72), T + sd * 4, 1.6, LEAD_VEL.radio * 0.7, 'radio');               // the radio answers once more
    if (P.choir) { const r = choir(v, T, 0.3); r(T + 2.8); }
    if (P.bubbles) for (let i = 0; i < 6; i++) bubble(v[i % 4] + 24, T + 0.05 + i * 0.07, 0.05, (i % 3 - 1) * 0.5);
    if (P.ostInst === 'marimba' || song.ostInst === 'marimba') v.forEach((m, i) => marimba(m + 12, T + i * sd / 2, 0.12));
    if (P.sonar) { sonar(inRange(c.root, 81), T + sd * 8, 0.15); heart(T + sd * 16, 0.4); }              // a last ping, a last heartbeat
    if (P.tines) { v.forEach((m, i) => tine(m + 24 > 91 ? m + 12 : m + 24, T + sd * (2 + 2 * i), 0.1, (i - 1.5) * 0.3)); tick2(T + sd * 16, 0.14, true); }
  }
  function voiceStrum(v, t, vel) { v.forEach((m, i) => pluck(m, t + i * 0.025, vel, 0.6, (i - 1.5) * 0.25)); }

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

  const info = (s) => ({ name: s.name, title: s.title, bpm: s.bpm, key: s.key + ' minor' /* (every piece is in minor and ends in major) */,
    meter: s.meter === 12 ? '6/8' : s.swing ? '4/4 swing' : '4/4', lead: s.lead, mood: s.mood, missions: s.missions.slice() });
  return {
    get title() { return song.title; },
    get level() { return stage / 7; },
    get stage() { return stage; },
    get section() { return bar ? (bar.spool ? 'spool' : Math.floor(bar.b / 8) % 2 ? 'B' : 'A') : 'A'; },
    get step() { return step; },
    get ended() { return ended; },
    get arc() { return arc.log.slice(); },                // drops, builds and the breakdown of this run (tests, music.html)
    get bar() { return bar && { b: bar.b, st: bar.st, bk: bar.bk, build: bar.build, drop: bar.drop, layers: Object.keys(song.parts).filter(bar.has).length }; },
    // The planned ending (after jumped()): the final downbeat T, the cadence start, its chord, and the grid.
    get ending() { return ending && { T: ending.T, from: ending.from, cadence: ending.cad.name, jumpedAt: ending.jumpedAt, barDur: ending.bd, startT, bpm: song.bpm, meter: song.meter }; },
    songOf(id) { return songFor(id).title; },
    list() { return SONGS.map(info); },
    pieces: SONGS,                                       // (the compiled score, for tests/music.js)
    layersAt(name, st) { const s = SONGS.find(x => x.name === name); return Object.keys(s.parts).filter(p => plays(s, p, st)).sort(); },
    setMission(id) { switchTo(songFor(id)); },
    setSong(name) { const s = SONGS.find(x => x.name === name); if (s) switchTo(s); },
    reset() { begin(song); },
    setIntensity(k) { intensity = Math.max(0, Math.min(1, +k || 0)); },
    setThreat(v) { if (threat && !v && ac) threatT = now(); threat = !!v; },
    setJump(v) { jumpOn = !!v; },
    jumped() { if (ended || ending) return; if (ac && bar && !silent()) planEnding(); else ended = true; },
    rearm() { if (ended || ending) { jumpOn = false; begin(song); } },
    setPaused(v) { if (paused === !!v) return; paused = !!v; setSilent(); },
    // Offline rendering (music.html's level check): attach to an OfflineAudioContext, then pump(t) to schedule up to t.
    offline: {
      attach(ctx, dest, noise) { attach(ctx, dest, noise, true); vnow = 0; },
      pump(until) { while (vnow + 0.05 < until) { vnow = Math.min(until, vnow + 0.05); tick(); } },
    },
  };
})();
