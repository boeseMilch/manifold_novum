// Tiny synthesized sound effects (WebAudio, no files). The audio context is made as the page loads, so
// the menu music (Held Together) plays from the start where the browser allows it (e.g. coming back from
// a mission, or a site the browser already lets play); otherwise it waits suspended and starts on the
// first key press, click or tap anywhere, because browsers block sound before user input.
// Everything (effects and music) goes through one output gain, which the mute button sets.

const sfx = (() => {
  let ac = null, master = null, out = null, noiseBuf = null, hum = null;
  let muted = false;
  try { muted = localStorage.getItem('mn-muted') === '1'; } catch (e) { /* storage unavailable */ }
  // Test browsers (automation, headless, ?mute) start silent, so test runs never play over the real game.
  const silent = typeof navigator !== 'undefined' && (navigator.webdriver || /Headless/.test(navigator.userAgent || '')
    || (typeof location !== 'undefined' && /[?&]mute\b/.test(location.search)));
  if (silent) muted = true;
  const ready = [];                                 // callbacks run once the context exists
  function ensure() {
    if (ac) { if (ac.state !== 'running' && ac.state !== 'closed') ac.resume()?.catch?.(() => {}); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    out = ac.createGain(); out.gain.value = muted ? 0 : 1; out.connect(ac.destination);
    master = ac.createGain(); master.gain.value = 0.25; master.connect(out);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const f of ready) f(ac, out, noiseBuf);
    return true;
  }
  for (const ev of ['keydown', 'mousedown', 'pointerdown', 'touchend', 'click']) window.addEventListener(ev, ensure);
  // Right away, unless the browser says it would refuse (then the first input makes it: no console warning).
  try { if (navigator.getAutoplayPolicy?.('audiocontext') !== 'disallowed') ensure(); } catch (e) { /* no audio */ }

  function env(g, t0, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function tone(type, f0, f1, dur, peak = 0.5, delay = 0, attack = 0.01) {
    if (!ac) return;
    const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, attack, peak, dur); o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, freq, peak = 0.5, q = 1) {
    if (!ac) return;
    const t0 = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    env(g, t0, 0.005, peak, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.05);
  }

  return {
    onReady(f) { ready.push(f); if (ac) f(ac, out, noiseBuf); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('mn-muted', muted ? '1' : '0'); } catch (e) { /* storage unavailable */ }
      if (out) out.gain.setTargetAtTime(muted ? 0 : 1, ac.currentTime, 0.03);
    },
    shoot() { noise(0.18, 900, 0.6); tone('triangle', 160, 50, 0.2, 0.6); },
    enemyShot() { tone('square', 900, 220, 0.16, 0.15); },
    spark() { noise(0.12, 4000, 0.3, 3); noise(0.08, 2500, 0.2, 3); },
    clank() { tone('square', 420, 300, 0.08, 0.12); noise(0.05, 3000, 0.15, 2); },
    poi() { tone('sine', 660, 660, 0.12, 0.35); tone('sine', 990, 990, 0.18, 0.3, 0.08); },
    hit(large) { noise(large ? 0.7 : 0.3, large ? 180 : 500, large ? 0.9 : 0.5); tone('sine', large ? 90 : 160, 40, large ? 0.6 : 0.25, 0.7); },
    shieldUp() { tone('sine', 300, 900, 0.3, 0.25); tone('triangle', 450, 1350, 0.3, 0.12); },
    shieldBlock() { tone('sine', 1200, 600, 0.25, 0.3); noise(0.2, 2000, 0.2, 4); },
    hatch() { noise(0.6, 600, 0.25, 0.7); },
    // Air rushing out of a vented room: a long, falling roar with a hiss on top.
    whoosh() { noise(2.8, 350, 0.55, 0.5); noise(1.8, 1400, 0.3, 0.7); for (let i = 1; i < 4; i++) setTimeout(() => noise(0.9, 900 - i * 180, 0.25 / i, 0.6), i * 500); },
    // Big hit on the ship: deep boom, rumble and debris rattle.
    explosion() {
      noise(1.4, 120, 1.0, 0.6); noise(0.5, 900, 0.5, 0.8);
      tone('sine', 70, 28, 1.2, 0.9); tone('triangle', 140, 40, 0.5, 0.4);
      for (let i = 0; i < 4; i++) setTimeout(() => noise(0.12, 2500 + Math.random() * 2000, 0.15, 3), 250 + i * 130);
    },
    heavyLaunch() { tone('sawtooth', 900, 90, 0.45, 0.35); noise(0.4, 400, 0.5, 0.7); },
    spit() { noise(0.18, 1200, 0.35, 2); tone('sine', 300, 120, 0.15, 0.2); },
    alienHurt() { tone('sawtooth', 700, 300, 0.18, 0.18); noise(0.1, 2500, 0.2, 2); },
    empty() { tone('square', 220, 200, 0.05, 0.12); tone('square', 180, 170, 0.05, 0.1, 0.07); },
    spray() { noise(0.2, 3000, 0.12, 0.6); },
    alarm() { tone('square', 880, 880, 0.07, 0.08); tone('square', 660, 660, 0.07, 0.08, 0.09); },
    purr() { for (let i = 0; i < 6; i++) tone('sawtooth', 48, 44, 0.22, 0.1, i * 0.25); },
    win(delay = 0) { [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.25, 0.3, delay + i * 0.11)); },
    // Jumping out (js/mission.js drawJumpOut): a whine winding up for ~1.5 s, then the deep boom of the jump.
    jumpOut() {
      tone('sawtooth', 110, 1600, 1.55, 0.18, 0, 1.4); tone('sine', 55, 220, 1.55, 0.4, 0, 1.4);
      setTimeout(() => { noise(1.8, 160, 1.0, 0.5); noise(0.9, 2400, 0.35, 0.6); tone('sine', 110, 28, 1.6, 0.9); tone('triangle', 220, 50, 0.8, 0.35); }, 1500);
    },
    // The jump drive failing for lack of energy: a whine that dies away, with a few dry coughs.
    sputter() {
      tone('sawtooth', 300, 45, 0.9, 0.16, 0, 0.02); tone('sine', 110, 30, 0.8, 0.25);
      for (let i = 0; i < 3; i++) setTimeout(() => noise(0.08, 900 - i * 200, 0.4, 2), 120 + i * 190);
    },
    // The jump drive's hum while it charges: call every frame with the charge 0..1 (0: silent). Pitch,
    // brightness, loudness and the throb all rise with it.
    hum(k) {
      if (!ac || (!hum && !(k > 0))) return;
      const t = ac.currentTime;
      if (!hum) {
        const o1 = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), f = ac.createBiquadFilter(), g = ac.createGain();
        o1.type = 'sawtooth'; o2.type = 'sine'; lfo.type = 'sine'; f.type = 'lowpass'; f.Q.value = 3; g.gain.value = 0; lg.gain.value = 0;
        o1.connect(f); o2.connect(g); f.connect(g); lfo.connect(lg); lg.connect(g.gain); g.connect(master);
        o1.start(t); o2.start(t); lfo.start(t);
        hum = { o1, o2, lfo, lg, f, g };
      }
      k = Math.max(0, Math.min(1, k || 0));
      hum.o1.frequency.setTargetAtTime(55 + 165 * k, t, 0.15); hum.o2.frequency.setTargetAtTime(27.5 + 82 * k, t, 0.15);
      hum.lfo.frequency.setTargetAtTime(2 + 14 * k, t, 0.15); hum.f.frequency.setTargetAtTime(200 + 2200 * k * k, t, 0.15);
      hum.g.gain.setTargetAtTime(0.1 * k, t, 0.1); hum.lg.gain.setTargetAtTime(0.04 * k, t, 0.1);
    },
    // The ship's voice: an old, polite computer (speech synthesis; respects mute; never more than one at a time).
    say(text) {
      if (muted || typeof speechSynthesis === 'undefined' || speechSynthesis.speaking) return;
      try { const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; u.pitch = 0.6; u.volume = 0.8; speechSynthesis.speak(u); } catch (e) { /* no voice */ }
    },
    // A gravity tide building (js/encounters.js): a low rumble swelling over dur s, groaning hull plates on top.
    rumble(dur = 5) {
      if (!ac) return;
      const t0 = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(90, t0); f.frequency.linearRampToValueAtTime(220, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.7, t0 + dur * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.4);
      s.connect(f); f.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.5);
      tone('sine', 38, 52, dur, 0.35, 0, dur * 0.8);
      for (let i = 1; i < 4; i++) tone('sawtooth', 70 + i * 13, 55 + i * 9, 0.7, 0.05 * i, dur * i / 4, 0.25);   // groaning plates
    },
    // The tide hits: a heavy lurch, the hull creaking, loose things rattling.
    lurch() {
      noise(1.1, 110, 0.9, 0.6); tone('sine', 60, 30, 1.0, 0.8); tone('sawtooth', 95, 60, 0.9, 0.08, 0.15, 0.2);
      for (let i = 0; i < 5; i++) setTimeout(() => noise(0.09, 1800 + Math.random() * 2500, 0.18, 3), 200 + i * 110);
    },
    // A herd's call from the deep (js/organic.js): a long, low, whale-like moan sliding up and down, echoing.
    whale() {
      for (const [d, a] of [[0, 0.5], [0.9, 0.22], [1.8, 0.1]]) {
        tone('sine', 70, 115, 1.3, a, d, 0.5); tone('sine', 115, 58, 1.6, a * 0.9, d + 1.2, 0.3);
        tone('triangle', 140, 230, 1.3, a * 0.25, d, 0.5); tone('triangle', 230, 116, 1.6, a * 0.2, d + 1.2, 0.3);
      }
      noise(3.5, 90, 0.25, 0.4);
    },
    // A wet, deflating squelch (organic things dying).
    squelch() { noise(0.35, 400, 0.45, 1.5); tone('sine', 220, 60, 0.45, 0.35); tone('triangle', 140, 50, 0.3, 0.2, 0.1); },
    crack() { noise(0.25, 300, 0.6); tone('triangle', 120, 60, 0.3, 0.4); },
    // Heavy shot charging: a rising whine everyone on board can hear. Returns a stop function.
    charge(dur) {
      if (!ac) return () => {};
      const t0 = ac.currentTime, o = ac.createOscillator(), lfo = ac.createOscillator(), lg = ac.createGain(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t0 + dur);
      lfo.frequency.setValueAtTime(4, t0); lfo.frequency.linearRampToValueAtTime(16, t0 + dur);
      lg.gain.value = 0.06; lfo.connect(lg); lg.connect(g.gain);
      g.gain.setValueAtTime(0.02, t0); g.gain.linearRampToValueAtTime(0.14, t0 + dur);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
      o.connect(f); f.connect(g); g.connect(master); o.start(t0); lfo.start(t0);
      let stopped = false;
      return () => {
        if (stopped) return; stopped = true;
        const t = ac.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.05); o.stop(t + 0.1); lfo.stop(t + 0.1);
      };
    },
  };
})();
