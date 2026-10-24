// S-7, "The Culture" (the derelict lab's growth; replaces the sleeping intruder on every derelict).
// Story: S-7 is a tissue cutting from a grappler, kept in Dr. Varga's cryo freezer. When the Red Comet
// pirates boarded her lab they cut the power, the freezer died, the tissue thawed and grew through the lab.
// It is a growth, not a creature: everything lives in dk.dock.s7 (plain data, synced with dk).
//   Tendrils   lie in the lab's three rooms (one across each inner doorway). Come within S7_REACH of one's head
//              and it twitches (S7_TWITCH s: the telegraph), then GRABS: held in place (you can still aim, shoot
//              and spray) and squeezed (hurtCrew every S7_SQUEEZE s). A laser / blaster hit makes it recoil
//              S7_RECOIL_SHOT s, the extinguisher (CO2: cold) S7_RECOIL_SPRAY s; mashing the move / use keys
//              wriggles you free (S7_STRUGGLE_PRESSES presses). Recoiled tendrils don't grab. The lab's fire
//              makes tendrils near it (S7_HEAT_R) recover twice as fast.
//   J1         the lab's dead power junction (in its airlock room): patched in a mini-game (like our patch board),
//              it connects the lab to our tether line.
//   Freezer    Varga's cryo freezer (in the lab). Hold click to switch it on; while it runs it draws 1 energy every
//              S7_DRAW s from OUR capacitor on the docked side (port → left, star → right). Empty (or wrapped, or
//              broken): it stops. The cold spreads room by room (S7_FREEZE s each: lab, then airlock, then core);
//              in a frozen room the growth turns to grey husks (no grabbing). The heart in the core lets go of the
//              black box only when the core is frozen. Freezer off: the rooms thaw (S7_THAW s), the growth stirs.
//   Death      the core freezing kills the heart (s.dead), and S-7 dies with it: for the rest of the mission the heart
//              stays an open husk, every room's growth stays grey husks (s.frozen stays true; only the frost, s.cold,
//              fades), the creep never regrows, the black box stays free. Nothing "stirs again" after that.
//   Creep      from docking, a tendril grows along the tube toward our warm ship (S7_CREEP_TIME s to our airlock
//              room, twice as fast inside it), then wraps our capacitor on that side: no charging, no using it, no
//              freezer. Spraying pushes it back a good chunk, a shot a bit; clearing the wrap takes S7_WRAP_SPRAY s of
//              spray or S7_WRAP_HITS hits. It withers when the core freezes (the heart turns to a husk) and dies
//              when the derelict casts off.
// Drawing: drawS7Floor (the lab's mats, frost, freezer, junction, heart, cocoon) and drawS7Live (tendrils, the creep,
// the wrap, the tether line): each thing tries its sprite first (S7_SPRITES), else a procedural 2D drawing.

const S7_REACH = 1.6, S7_TWITCH = 0.6, S7_SQUEEZE = 3, S7_RECOIL_SHOT = 4, S7_RECOIL_SPRAY = 15, S7_RECOIL_STRUGGLE = 3, S7_SATED = 8;
const S7_GRAB_AT = 1.2, S7_HEAT_R = 3, S7_SPRAY_NEED = 0.25, S7_STRUGGLE_PRESSES = 22, S7_STRUGGLE_DECAY = 0.12;
const S7_ROOMS = ['airlock', 'lab', 'core'], S7_FREEZE = [25, 15, 30], S7_THAW = 40, S7_ALIVE_BELOW = 0.6;
const S7_DRAW = [20, 25, 30], S7_FREEZER_HOLD = 2;
const S7_CREEP_TIME = 60, S7_CREEP_SPRAY = 3, S7_CREEP_SHOT = 1, S7_WRAP_SPRAY = 2, S7_WRAP_HITS = 3, S7_CREEP_HIT_LEN = 3;
const S7_SPRITES = ['dock/s7_mat_airlock', 'dock/s7_mat_lab', 'dock/s7_mat_core', 'dock/s7_mat_airlock_husk', 'dock/s7_mat_lab_husk', 'dock/s7_mat_core_husk',
  'dock/s7_tendril', 'dock/s7_tendril_twitch', 'dock/s7_tendril_grab', 'dock/s7_tendril_recoil', 'dock/s7_tendril_husk', 'dock/s7_heart', 'dock/s7_heart_open',
  'dock/s7_heart_husk', 'dock/s7_creep_seg', 'dock/s7_creep_tip', 'dock/s7_wrap_capacitor', 'dock/s7_wrap_capacitor4', 'dock/s7_tendril_grab_front', 'dock/s7_frost_a', 'dock/s7_frost_b', 'dock/s7_freezer_off', 'dock/s7_freezer_on', 'dock/s7_junction_dead',
  'dock/s7_junction_patched', 'dock/s7_frost', 'dock/s7_cocoon_pirate'];
const s7Easy = () => clamp(typeof mission !== 'undefined' ? mission.easy || 0 : 0, 0, 2);
const s7Solo = () => crewSize() <= 1;
const s7Twitch = () => S7_TWITCH + 0.3 * s7Easy() + (s7Solo() ? 0.3 : 0);           // the telegraph: longer on easier difficulty / solo
const s7SqueezeT = () => S7_SQUEEZE + s7Easy();
const s7CreepTime = () => S7_CREEP_TIME * [1, 1.3, 1.6][s7Easy()] * (s7Solo() ? 1.5 : 1);
const S7 = () => (dk.dock?.kind === 'derelict' && dk.dock.s7) || null;
const s7Side = (side) => (side === 'port' ? 'left' : 'right');

// Where everything is (positions for the port side, mirrored for starboard like dockGeom). Rooms: 0 airlock, 1 lab
// (the old "cargo" room), 2 core. Tendrils: root on the floor by a wall, head where it lies (its reach is measured
// from the head); at least one lies across each inner doorway.
function s7Geom(side) {
  const g = dockGeom(side), mx = (x) => dockX(side, x), P = (x, dy) => ({ x: mx(x), y: g.y + dy });
  const h = g.hatch, ci = SIDE_CAP[side], cap = CAPACITORS[ci], hin = { x: h.inside[0], y: h.inside[1] + 0.3 };
  const capAt = { x: cap.x, y: cap.y - 0.15 }, mid = side === 'port' ? { x: (hin.x + capAt.x) / 2, y: (hin.y + capAt.y) / 2 - 0.4 }
    : { x: hin.x - 2.3, y: capAt.y - 0.55 };          // (starboard: the gym's treadmill stands on the straight line: round below it)
  return {
    g, capIdx: ci, cap,
    tendrils: [
      { room: 0, root: P(-8.4, 2.2), head: P(-7.7, 0.5) },     // the airlock: across the way in
      { room: 1, root: P(-12.0, 2.6), head: P(-11.3, 0.4) },   // the lab: across the airlock–lab doorway
      { room: 1, root: P(-11.9, -3.0), head: P(-12.5, -1.2) }, // the lab: in front of the freezer
      { room: 1, root: P(-14.0, 3.6), head: P(-13.6, 1.8) },   // the lab: by the fire (it thrives on the heat)
      { room: 2, root: P(-19.8, -2.3), head: P(-19.3, -0.2) }, // the core: across the lab–core doorway
      { room: 2, root: P(-24.3, -2.3), head: P(-23.2, -0.5) }, // the core: by the heart
    ],
    heart: P(-22.4, 1.8), freezer: P(-12.6, -3.6), j1: P(-6.7, -2.4), extinguisher: P(-6.3, 1.9), cocoon: P(-15.0, -3.6),   // (where the sprites' mats grow thickest: dock/s7.py ROOMS_S7)
    // the creep: from the lab's airlock along the tube into our airlock room, to our capacitor on that side
    creep: [P(-6.6, 0.3), P(-0.2, 0.3), hin, mid, capAt],
    tube: 2,                                          // (index of the point where it enters our airlock room)
  };
}
// A polyline: total length, length up to point i, and the point at distance s.
const s7Len = (pts, upTo = pts.length - 1) => { let s = 0; for (let i = 1; i <= upTo; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return s; };
function s7PointAt(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], l = Math.hypot(b.x - a.x, b.y - a.y);
    if (s <= l || i === pts.length - 1) { const k = l ? clamp(s / l, 0, 1) : 0; return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), a: Math.atan2(b.y - a.y, b.x - a.x) }; }
    s -= l;
  }
  return { ...pts[0], a: 0 };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function s7Make(side) {
  const G = s7Geom(side);
  return {
    tendrils: G.tendrils.map((T0, i) => ({ id: i, room: T0.room, state: 'idle', t: 0, target: null, hold: null, sq: 0, spray: 0, struggle: 0, flash: 0 })),
    cold: [0, 0, 0], frozen: [false, false, false], heartOpen: false, dead: false,   // dead: the heart froze (for good)
    j1: false, freezer: false, drawT: 0,
    creep: { d: 0, inRoom: false, wrapped: false, wrapHp: 1, dead: false, flash: 0 },
    said: {},
  };
}
// The tendril's body: root → (bent) → its head, or the crew member it holds.
function s7Head(s, T0, i) {
  const G = s7Geom(dk.dock.side), base = G.tendrils[i], c = T0.hold != null && crew.find(c => c.id === T0.hold);
  if (c) return { x: c.x, y: c.y };
  if (T0.state === 'twitch') { const v = crew.find(c => c.id === T0.target); if (v) { const k = 0.25 * Math.min(1, T0.t / s7Twitch()); return { x: lerp(base.head.x, v.x, k), y: lerp(base.head.y, v.y, k) }; } }
  if (T0.state === 'recoil') return { x: lerp(base.head.x, base.root.x, 0.45), y: lerp(base.head.y, base.root.y, 0.45) };
  return base.head;
}
function s7Body(T0, i, n = 6) {
  const G = s7Geom(dk.dock.side), r = G.tendrils[i].root, h = s7Head(S7(), T0, i);
  const dx = h.x - r.x, dy = h.y - r.y, bend = 0.25 * (i % 2 ? 1 : -1);         // a curve, bowed to one side
  const cx = (r.x + h.x) / 2 - dy * bend, cy = (r.y + h.y) / 2 + dx * bend, out = [];
  for (let j = 0; j <= n; j++) { const k = j / n, u = 1 - k; out.push({ x: u * u * r.x + 2 * u * k * cx + k * k * h.x, y: u * u * r.y + 2 * u * k * cy + k * k * h.y }); }
  return out;
}
const s7Alive = (T0) => T0.state !== 'husk';
const s7Holding = (c) => { const s = S7(); return !!s && s.tendrils.some(T0 => T0.state === 'grab' && T0.hold === c.id); };
const s7Wrapped = (i) => { const s = S7(); return !!s && s.creep.wrapped && !s.creep.dead && s7Geom(dk.dock.side).capIdx === i; };
const s7BoxHeld = () => { const s = S7(); return !!s && !s.heartOpen; };
function s7Recoil(s, T0, time, why) {
  const held = T0.hold != null ? crew.find(c => c.id === T0.hold) : null;
  T0.t = Math.max(T0.state === 'recoil' ? T0.t : 0, time); T0.state = 'recoil'; T0.hold = null; T0.target = null; T0.sq = 0; T0.spray = 0; T0.struggle = 0; T0.flash = 1;
  if (held) { combatBanner(`${held.name} is free${why ? ` — ${why}` : ''}!`); sfx.alienHurt(); }
}
function s7Say(s, key, text, sound) { if (s.said[key]) return; s.said[key] = true; combatBanner(text); if (sound) sfx[sound](); }

// ---------------------------------------------------------------------------
// Update (from updateDock)
// ---------------------------------------------------------------------------
function updateS7(dt) {
  const s = S7();
  if (!s) return;
  const d = dk.dock, G = s7Geom(d.side), side = s7Side(d.side);
  // the freezer: one energy from our capacitor every S7_DRAW s while it runs
  if (s.freezer) {
    s.drawT -= dt;
    if (s.drawT <= 0) {
      if (useEnergy(G.capIdx, null)) { s.drawT += S7_DRAW[s7Easy()]; combatFx(G.freezer.x, G.freezer.y, 0, -1, 0.6, '#bfe8ff', 0.1); }
      else {
        s.freezer = false; s.drawT = 0; sfx.empty();
        const why = s7Wrapped(G.capIdx) ? 'S-7 is wrapped round it' : capBroken(G.capIdx) ? 'it\'s broken' : 'it\'s empty';
        combatBanner(`The freezer stopped — our ${side} capacitor: ${why}. The cold will slowly retreat.`);
      }
    }
  }
  // the cold, room by room
  for (let i = 0; i < 3; i++) {
    s.cold[i] = s.freezer ? Math.min(1, s.cold[i] + dt / S7_FREEZE[i]) : Math.max(0, s.cold[i] - dt / S7_THAW);
    if (!s.frozen[i] && s.cold[i] >= 1) {
      s.frozen[i] = true; sfx.crack();
      combatBanner(`${['The lab\'s airlock', 'The lab', 'The core'][i]} is frozen — S-7 shrivels to grey husks there.`);
    } else if (s.frozen[i] && !s.dead && s.cold[i] < S7_ALIVE_BELOW) {   // (a dead culture stays husks: only its frost fades)
      s.frozen[i] = false; combatBanner(`${['The lab\'s airlock', 'The lab', 'The core'][i]} is thawing — S-7 stirs again!`); sfx.alienHurt();
    }
  }
  // the heart lets go of the black box when the core is frozen — and dies: S-7 dies with it, for good (s.dead)
  if (s.frozen[2] && !s.dead) {
    s.dead = true; s.heartOpen = true; s.frozen = [true, true, true];   // (the whole growth: grey husks from now on)
    combatBanner(ITEMS.some(it => it.kind === 'blackbox') ? 'The heart froze to death — it let go of the black box. Grab it!' : 'S-7\'s heart froze to death — the growth dies with it.'); sfx.win();
  }
  if (s.dead) s.heartOpen = true;
  // tendrils
  const fires = (d.fires || []).filter(f => f.hp > 0);
  s.tendrils.forEach((T0, i) => {
    T0.flash = Math.max(0, T0.flash - dt * 3);
    if (s.frozen[T0.room]) { if (T0.state !== 'husk') { if (T0.hold != null) s7Recoil(s, T0, 0, 'the tendril froze'); T0.state = 'husk'; T0.t = 0; } return; }
    if (T0.state === 'husk') { T0.state = 'idle'; T0.t = 0; }
    const head = G.tendrils[i].head, hot = fires.some(f => Math.hypot(f.x - head.x, f.y - head.y) < S7_HEAT_R) ? 2 : 1;   // (the fire: twice as fast)
    T0.spray = Math.max(0, T0.spray - dt * 0.5);
    if (T0.state === 'recoil') { T0.t -= dt * hot; if (T0.t <= 0) { T0.state = 'idle'; T0.t = 0; } return; }
    const free = (c) => c.mode === 'inside' && standing(c) && !s.tendrils.some(o => o !== T0 && (o.hold === c.id || (o.state === 'twitch' && o.target === c.id)));
    if (T0.state === 'idle') {
      const c = crew.filter(c => free(c) && Math.hypot(c.x - head.x, c.y - head.y) < S7_REACH && lineOfSight(head.x, head.y, c.x, c.y))
                    .sort((a, b) => Math.hypot(a.x - head.x, a.y - head.y) - Math.hypot(b.x - head.x, b.y - head.y))[0];
      if (c) { T0.state = 'twitch'; T0.t = 0; T0.target = c.id; }
    } else if (T0.state === 'twitch') {
      T0.t += dt;
      const c = crew.find(c => c.id === T0.target);
      if (!c || c.mode !== 'inside' || !standing(c) || Math.hypot(c.x - head.x, c.y - head.y) > S7_REACH * 1.15) { T0.state = 'idle'; T0.target = null; T0.t = 0; }
      else if (T0.t >= s7Twitch()) {
        T0.state = 'grab'; T0.hold = c.id; T0.target = null; T0.t = 0; T0.sq = 0; T0.struggle = 0; c.vx = c.vy = 0; sfx.alienHurt();
        { const r = G.tendrils[i].root, dx = c.x - r.x, dy = c.y - r.y, l = Math.hypot(dx, dy) || 1, nx = r.x + dx / l * S7_GRAB_AT, ny = r.y + dy / l * S7_GRAB_AT;
          if (canStand(nx, ny, walkRects())) { c.x = nx; c.y = ny; } }   // (pulled in to where the coils wrap: the sprite's grab pose)
        const nm = c.name === 'You' ? 'you' : c.name;
        if (!s.said.grab) s7Say(s, 'grab', `S-7 has ${nm}! Shoot or spray the tendril — or wriggle free (mash WASD)`);
        else combatBanner(`S-7 grabbed ${nm}!`);
      }
    } else if (T0.state === 'grab') {
      const c = crew.find(c => c.id === T0.hold);
      if (!c || c.mode !== 'inside' || !standing(c)) { T0.hold = null; T0.state = 'recoil'; T0.t = S7_SATED; return; }   // (down: it drops them for a while)
      c.vx = c.vy = 0;
      T0.struggle = Math.max(0, T0.struggle - dt * S7_STRUGGLE_DECAY);
      if ((T0.sq += dt) >= s7SqueezeT()) { T0.sq = 0; hurtCrew(c); combatBanner(`S-7 squeezes ${c.name === 'You' ? 'you' : c.name}!`); }
    }
  });
  // the creep toward our ship
  const C = s.creep, len = s7Len(G.creep), tubeLen = s7Len(G.creep, G.tube);
  C.flash = Math.max(0, C.flash - dt * 3);
  if (s.frozen[2] && !C.dead) {
    C.dead = true; C.wrapped = false;
    if (C.d > 0.5) { combatBanner('The heart froze — S-7\'s creep in the tube withers!'); sfx.crack(); }
  }   // (dead with the heart: it never grows again)
  if (!C.dead && !C.wrapped) {
    const speed = tubeLen / s7CreepTime();
    C.d = Math.min(len, C.d + speed * (C.d >= tubeLen ? 2 : 1) * dt);   // (inside our warm ship: twice as fast)
    if (C.d >= tubeLen && !C.inRoom) { C.inRoom = true; combatBanner(`S-7 is creeping into our ${side} airlock room — push it back (extinguisher, laser)!`); sfx.alarm(); }
    if (C.d < tubeLen - 1) C.inRoom = false;
    if (C.d >= len) { C.wrapped = true; C.wrapHp = 1; combatBanner(`S-7 wrapped our ${side} capacitor — it can't be charged or used! Spray it off (2 s) or shoot it.`); sfx.alarm(); }
  }
}

// Wriggling free: every press of a move / use key while held (called per crew member with their fresh presses).
const S7_STRUGGLE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'Space']);
function s7Struggle(c, pressedKeys) {
  const s = S7();
  if (!s) return;
  const T0 = s.tendrils.find(T0 => T0.state === 'grab' && T0.hold === c.id);
  if (!T0) return;
  const n = [...pressedKeys].filter(k => S7_STRUGGLE_KEYS.has(k)).length;
  if (!n) return;
  T0.struggle += n / S7_STRUGGLE_PRESSES;
  if (T0.struggle >= 1) s7Recoil(s, T0, S7_RECOIL_STRUGGLE, 'wriggled out of its grip');
}

// The extinguisher (CO2: cold) on tendrils, the creep and the wrap. a: the spray's direction from player.
function s7Spray(a, dt) {
  const s = S7();
  if (!s) return;
  const G = s7Geom(dk.dock.side);
  const hits = (p) => { const d = Math.hypot(p.x - player.x, p.y - player.y); return d < 0.6 || (d < SPRAY_RANGE && Math.abs(wrapAngle(Math.atan2(p.y - player.y, p.x - player.x) - a)) < 0.45); };
  s.tendrils.forEach((T0, i) => {
    if (!s7Alive(T0)) return;
    const body = s7Body(T0, i, 6), mine = T0.hold === player.id;
    if (!(mine ? body.slice(0, 5) : body).some(hits)) return;   // (held: aim at it, not just at your own feet)
    T0.spray += dt * 1.5;
    if (T0.spray >= S7_SPRAY_NEED) s7Recoil(s, T0, S7_RECOIL_SPRAY, 'the cold made it let go');
  });
  const C = s.creep;
  if (C.dead) return;
  if (C.wrapped) {
    if (hits(G.creep[G.creep.length - 1]) || hits(G.cap)) {
      C.wrapHp -= dt / S7_WRAP_SPRAY; C.flash = 1;
      if (C.wrapHp <= 0) s7Unwrap(s, G);
    }
    return;
  }
  if (s7CreepPts(G, C.d).some(hits)) { C.d = Math.max(0, C.d - S7_CREEP_SPRAY * dt); C.flash = 1; }
}
function s7Unwrap(s, G) {
  const C = s.creep;
  C.wrapped = false; C.wrapHp = 1; C.d = Math.max(0, s7Len(G.creep) - 3); C.flash = 1;
  combatBanner(`Our ${s7Side(dk.dock.side)} capacitor is free of S-7 — keep it back!`); sfx.win();
}
// The creep's last S7_CREEP_HIT_LEN units (where a spray or a shot does something), sampled.
function s7CreepPts(G, d) {
  const out = [];
  for (let k = Math.max(0, d - S7_CREEP_HIT_LEN); k <= d + 1e-6; k += 0.25) out.push(s7PointAt(G.creep, k));
  return out;
}
// One of our bolts (from x0, y0 to b.x, b.y this step) against S-7: true if it hit (the bolt is spent).
function s7BoltHit(b, x0, y0) {
  const s = S7();
  if (!s) return false;
  const G = s7Geom(dk.dock.side);
  const segD = (p) => { const vx = b.x - x0, vy = b.y - y0, l2 = vx * vx + vy * vy || 1e-9, k = clamp(((p.x - x0) * vx + (p.y - y0) * vy) / l2, 0, 1); return Math.hypot(x0 + vx * k - p.x, y0 + vy * k - p.y); };
  const gore = (p) => { for (let i = 0; i < 8; i++) combatFx(p.x, p.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.45, i % 2 ? '#c46ad8' : '#9cff5a', 0.08); };
  for (const [i, T0] of s.tendrils.entries()) {
    if (!s7Alive(T0)) continue;
    const p = s7Body(T0, i, 8).find(p => segD(p) < 0.35);
    if (!p) continue;
    s7Recoil(s, T0, S7_RECOIL_SHOT, 'shot loose'); gore(p);
    return true;
  }
  const C = s.creep;
  if (C.dead) return false;
  if (C.wrapped) {
    const w = G.creep[G.creep.length - 1], cap = SOLIDS.find(S => inRect(w.x, w.y, S, 0.3));   // (wrapped round the capacitor: a shot stopped by the capacitor hits the wrap)
    if (segD(w) < 0.55 || (cap && inRect(b.x, b.y, cap, 0.1))) { C.wrapHp -= 1 / S7_WRAP_HITS + 1e-6; C.flash = 1; gore(w); sfx.alienHurt(); if (C.wrapHp <= 0) s7Unwrap(s, G); return true; }
    return false;
  }
  const p = s7CreepPts(G, C.d).find(p => segD(p) < 0.3);
  if (p) { C.d = Math.max(0, C.d - S7_CREEP_SHOT); C.flash = 1; gore(p); sfx.alienHurt(); return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Clicking: J1, the freezer, the heart (and the black box it holds), our wrapped capacitor
// ---------------------------------------------------------------------------
function s7ClickTarget(mx, my) {
  const s = S7();
  if (!s) return null;
  const G = s7Geom(dk.dock.side), at = (p, r) => Math.hypot(mx - p.x, my - p.y) <= r, side = s7Side(dk.dock.side);
  const box = ITEMS.find(it => it.kind === 'blackbox' && Math.hypot(mx - it.x, my - it.y) <= 0.45);
  if (box && !s.heartOpen && Math.hypot(box.x - G.heart.x, box.y - G.heart.y) < 1.5)
    return { text: 'Black box — S-7\'s heart is wrapped round it, warm. It lets go once the core is frozen (Varga\'s freezer)', ok: false, x: box.x, y: box.y, r: 0.45 };
  if (box) return null;                               // (let go: the item's own click takes it)
  if (at(G.heart, 0.7)) return { text: s.dead ? 'S-7\'s heart — frozen to death, a grey husk (the growth died with it)' : `S-7's heart — it lets go when the core is frozen (core cold ${Math.round(s.cold[2] * 100)}%)`, ok: false, x: G.heart.x, y: G.heart.y, r: 0.7 };
  if (at(G.j1, 0.55)) {
    const t = { x: G.j1.x, y: G.j1.y, r: 0.55 };
    if (s.j1) return { ...t, text: 'Junction J1 — patched: our tether line feeds Varga\'s freezer', ok: false };
    if (!near(t.x, t.y)) return { ...t, text: 'Junction J1 (dead) — get closer', ok: false };
    return { ...t, ok: true, text: 'Click: open junction J1 (patch the lab to our tether line)', run: openJ1 };
  }
  if (at(G.freezer, 0.75)) {
    const t = { x: G.freezer.x, y: G.freezer.y, r: 0.75 };
    if (!s.j1) return { ...t, text: 'Varga\'s freezer "S-7 · KEEP FROZEN" — dead, no power. Patch junction J1 (lab airlock) first', ok: false };
    if (s.freezer) return { ...t, ok: true, text: `Click: switch the freezer off (it draws from our ${side} capacitor)`, run: () => { s.freezer = false; sfx.clank(); combatBanner('Freezer off — the cold will slowly retreat.'); } };
    if (s.dead) return { ...t, text: 'Varga\'s freezer — S-7 is dead, no need to freeze it any more', ok: false };
    if (!near(t.x, t.y)) return { ...t, text: 'Varga\'s freezer — get closer', ok: false };
    if (s7Wrapped(G.capIdx)) return { ...t, text: `Freezer — S-7 is wrapped round our ${side} capacitor: clear it first`, ok: false };
    if (capBroken(G.capIdx)) return { ...t, text: `Freezer — our ${side} capacitor is broken: repair it first`, ok: false };
    if (G.cap.charge <= 0) return { ...t, text: `Freezer — our ${side} capacitor is empty: charge it first (power lever → ${LEVER_NAMES[G.capIdx]})`, ok: false };
    return holdTarget('s7freezer', S7_FREEZER_HOLD, `Hold click: switch Varga's freezer on (${S7_FREEZER_HOLD} s) — 1 energy every ${S7_DRAW[s7Easy()]} s from our ${side} capacitor`, t.x, t.y, t.r,
                      () => { s.freezer = true; s.drawT = 0; sfx.hatch(); combatBanner(`Freezer on — drawing from our ${side} capacitor. The cold spreads: lab, airlock, then the core.`); });
  }
  if (s.creep.wrapped && !s.creep.dead && at(G.cap, 0.8)) return { text: `S-7 is wrapped round our ${side} capacitor — spray it off (${S7_WRAP_SPRAY} s) or shoot it (${S7_WRAP_HITS} hits)`, ok: false, x: G.cap.x, y: G.cap.y, r: 0.8 };
  return null;
}
function s7Spots() {
  const s = S7();
  if (!s) return [];
  const G = s7Geom(dk.dock.side), out = [];
  if (!s.j1) out.push({ x: G.j1.x, y: G.j1.y, r: 0.45 });
  if (s.j1 && !s.freezer && !s.dead) out.push({ x: G.freezer.x, y: G.freezer.y, r: 0.6 });
  return out;
}
// Docking: the state, Varga's own extinguisher on the airlock wall (no need to strip ours).
function s7Dock(side) {
  const G = s7Geom(side);
  if (!ITEMS.some(it => it.kind === 'extinguisher' && Math.hypot(it.x - G.extinguisher.x, it.y - G.extinguisher.y) < 0.5)) ITEMS.push({ kind: 'extinguisher', x: G.extinguisher.x, y: G.extinguisher.y });
  return s7Make(side);
}

// ---------------------------------------------------------------------------
// The J1 mini-game (the patch board's flow: click our tether line, then the lab circuit it should feed)
// ---------------------------------------------------------------------------
const J1_CIRCUITS = [['C1 · LIGHTS', 'lights'], ['C2 · DOOR MOTORS', 'doors'], ['C3 · COLD STORE (S-7)', 'freezer']];
function openJ1() { ui.panel = 'mini'; ui.mini = { kind: 'j1', pick: false, plug: null, wrong: null }; }
function s7J1Command(m, a, b) {
  const s = S7();
  if (!s) { ui.panel = null; ui.mini = null; return; }
  if (a === 'src') m.pick = true;
  else if (a === 'to' && m.pick) {
    const i = clamp(b | 0, 0, J1_CIRCUITS.length - 1);
    m.plug = i; m.pick = false;
    if (J1_CIRCUITS[i][1] === 'freezer') {
      s.j1 = true; ui.panel = null; ui.mini = null; sfx.poi(); sfx.clank();
      combatBanner(`J1 patched — our tether line reaches Varga's freezer. Switch it on (it draws from our ${s7Side(dk.dock.side)} capacitor)!`);
    } else { m.wrong = i; sfx.spark(); combatBanner(i === 0 ? 'The lab lights flicker on... and die. Not that one — the freezer is on C3.' : 'A door motor groans and stalls. Not that one — the freezer is on C3.'); }
  }
}
function drawJ1Panel(m, t) {
  const w = 560, h = 320, [x, y] = panelFrame(w, h, 'JUNCTION J1 — patch our tether line into the lab');
  const srcX = x + 100, dstX = x + w - 110, srcY = y + 154, row = (i) => y + 90 + i * 64;
  if (m.plug !== null) {                                  // the cable, plugged in
    ctx.beginPath(); ctx.moveTo(srcX + 20, srcY); ctx.bezierCurveTo(srcX + 130, srcY, dstX - 130, row(m.plug), dstX - 20, row(m.plug));
    ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = POWER_COL; ctx.lineWidth = 5; ctx.stroke();
  } else if (m.pick) {                                    // dangling off the mouse
    ctx.beginPath(); ctx.moveTo(srcX + 20, srcY); ctx.quadraticCurveTo((srcX + mouse.x) / 2, Math.max(srcY, mouse.y) + 40, mouse.x, mouse.y);
    ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = POWER_COL; ctx.lineWidth = 5; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(srcX, srcY, 20, 0, TAU); ctx.fillStyle = m.pick ? '#2f8a5f' : '#262b35'; ctx.fill(); stroke(2, POWER_COL);
  ctx.fillStyle = '#e8ecf4'; ctx.font = '700 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('OURS', srcX, srcY); ctx.fillText('tether line', srcX, srcY + 34); ctx.fillText(`(${s7Side(dk.dock?.side || 'port')} capacitor)`, srcX, srcY + 48);
  ui.hits.push({ x: srcX, y: srcY, r: 22, cmd: ['mini', 'j1', 'src'] });
  J1_CIRCUITS.forEach(([label], i) => {
    const bad = m.wrong === i && m.plug === i;
    ctx.beginPath(); ctx.arc(dstX, row(i), 18, 0, TAU); ctx.fillStyle = bad && Math.sin(t * 20) > 0 ? '#5a2a22' : '#262b35'; ctx.fill(); stroke(2, bad ? '#ff8a7a' : '#7a8396');
    ctx.fillStyle = '#e8ecf4'; ctx.textAlign = 'center'; ctx.fillText(`C${i + 1}`, dstX, row(i));
    ctx.textAlign = 'left'; ctx.fillStyle = i === 2 ? '#bfe8ff' : '#c9ced8'; ctx.fillText(label.replace(/^C\d · /, ''), dstX + 26, row(i));
    ui.hits.push({ x: dstX, y: row(i), r: 20, cmd: ['mini', 'j1', 'to', i] });
  });
  ctx.textAlign = 'left'; ctx.fillStyle = '#9aa3b5'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(m.pick ? 'Now click the lab circuit it should feed.' : 'Click our tether line, then the lab circuit it should feed. (Scrawled on the lid: "FREEZER = C3!!")', x + 18, y + h - 22);
}

// ---------------------------------------------------------------------------
// Drawing. Every piece tries its sprite first (S7_SPRITES; tools/blender: rendered by another pass), else
// it is drawn procedurally in 2D. Placement: mats and frost at their room's centre; tendrils at their root,
// facing their head (or the one they hold); the heart at G.heart; the creep's segments every 1 unit (the sprite's length) along
// its path (facing along it) with the tip at its end; the wrap at our capacitor; the props at their spots.
// ---------------------------------------------------------------------------
const s7Spr = (name, frame, x, y, z, o) => GFX.on && !!GFX.info(name) && GFX.sprite(name, frame, x, y, z, o);
const s7Frame = (name, a, f = 0) => GFX.frameIndex(name, a, f);
// The lab's floor: the mats (husks where frozen), frost, the freezer, J1, the heart, the cocooned pirate. (In drawDock.)
function drawS7Floor(d, g, t) {
  const s = d.s7;
  if (!s) return;
  const G = s7Geom(d.side), fl = d.side !== 'port';   // (the sprites are rendered for the port layout: mirrored on the starboard side)
  // floor growth: in the 'wall' layer just above the derelict's own sprite (it carries the floor; 'decal' would be under it)
  const fy = Math.min(...[...g.rooms, ...g.doors].map(q => q.y)) - 0.99, floor = (k) => ({ layer: 'wall', sortY: fy + k * 0.001, flip: fl });
  g.rooms.forEach((q, i) => {
    const cx = q.x + q.w / 2, cy = q.y + q.h / 2, husk = s.frozen[i], name = `dock/s7_mat_${S7_ROOMS[i]}${husk ? '_husk' : ''}`;
    if (!s7Spr(name, 0, cx, cy, 0, { ...floor(i), emissive: husk ? 0.05 : 0.45 })) s7MatDraw(q, i, husk, t);   // (live: the nodules glow in the dark)
  });
  s7VinesDraw(d, g, s, G, t, floor(3));
  s7FrostField(g, s, G, floor);
  // the freezer, J1, the cocoon
  const fz = s.freezer ? 'dock/s7_freezer_on' : 'dock/s7_freezer_off';
  if (!s7Spr(fz, s.freezer ? Math.floor(t * 8) : 0, G.freezer.x, G.freezer.y, 0, { layer: 'wall', sortY: G.freezer.y, flip: fl, emissive: s.freezer ? 0.8 : 0.2 })) s7FreezerDraw(G.freezer, s, t);
  const jn = s.j1 ? 'dock/s7_junction_patched' : 'dock/s7_junction_dead';
  if (!s7Spr(jn, 0, G.j1.x, G.j1.y, 0, { layer: 'wall', sortY: G.j1.y, flip: fl, emissive: s.j1 ? 0.7 : 0.1 })) s7JunctionDraw(G.j1, s, t);
  if (!s7Spr('dock/s7_cocoon_pirate', 0, G.cocoon.x, G.cocoon.y, 0, { layer: 'wall', sortY: G.cocoon.y, flip: fl, emissive: 0.2 })) s7CocoonDraw(G.cocoon, s.frozen[1], t);
  // the heart (wrapped round the black box: pulsing; frozen with the box still in it: open; else a husk)
  const boxIn = ITEMS.some(it => it.kind === 'blackbox' && Math.hypot(it.x - G.heart.x, it.y - G.heart.y) < 1.5);
  const hn = !s.heartOpen ? 'dock/s7_heart' : boxIn ? 'dock/s7_heart_open' : 'dock/s7_heart_husk';
  if (!s7Spr(hn, s.heartOpen ? 0 : Math.floor(t * 10), G.heart.x, G.heart.y, 0, { layer: 'main', sortY: G.heart.y + 0.3, flip: fl, emissive: s.heartOpen ? 0.05 : 0.6 })) s7HeartDraw(G.heart, s, t);
}
// The long floor tendrils (decor: the grabbing ones are s.tendrils): S7_VINES as chains of the creep's segment sprite, a
// tip at the end, grey husks where the room is frozen. Port layout (y off g.y), mirrored for starboard.
const S7_VINES = [
  [[-21.6, 0.9], [-20.2, 0.2], [-18.7, 0.35], [-17.0, 0.95], [-15.3, 0.45], [-13.3, -0.25], [-11.5, 0.15], [-10.5, -0.2], [-9.4, -0.75], [-8.3, -0.45]],   // heart → lab → airlock
  [[-16.9, 0.85], [-16.4, -0.6], [-16.2, -2.0], [-15.5, -3.1]],                                   // up to the cocooned pirate
  [[-24.6, -1.7], [-24.5, 0.4], [-23.5, 1.5]],                                                    // the core's back corner round to the heart
  [[-18.3, 1.95], [-16.9, 1.6], [-15.7, 1.9]],                                                  // along the lab's front, to the fire's warmth
  [[-6.3, -1.9], [-7.6, -1.35], [-9.8, -1.15], [-10.4, -0.5]],                                    // the airlock: from J1's corner to the lab door
];
function s7VinesDraw(d, g, s, G, t, band) {
  const mx = (x) => dockX(d.side, x);
  const roomOf = (x, y) => { let best = 0, bd = Infinity; g.rooms.forEach((q, i) => { const dd = Math.hypot(Math.max(q.x - x, 0, x - q.x - q.w), Math.max(q.y - y, 0, y - q.y - q.h)); if (dd < bd) { bd = dd; best = i; } }); return best; };
  S7_VINES.forEach((path, v) => {
    const pts = s7Smooth(path.map(([x, y]) => ({ x: mx(x), y: g.y + y })));
    s7Chain(pts, s7Len(pts), 1.25, (p, tip) => { const husk = s.frozen[roomOf(p.x, p.y)];
      return { ...band, frame: tip && !husk ? Math.floor(t * 6 + v * 2) : 0, desat: husk ? 1 : 0, alpha: husk ? 0.75 : 1, emissive: husk ? 0 : tip ? 0.45 : 0.4 }; });
  });
}
// Catmull-Rom through the points (8 steps per span).
function s7Smooth(P) {
  const pts = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    for (let k = 0; k < 8; k++) { const u = k / 8, u2 = u * u, u3 = u2 * u;
      const f = (a, b, c, e) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - e) * u2 + (-a + 3 * b - 3 * c + e) * u3);
      pts.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) }); }
  }
  pts.push(P[P.length - 1]);
  return pts;
}
// A tendril lying on the floor along the polyline pts, from its start to distance e: the creep's segment sprite tiled
// end to end (fixed in place, so the body doesn't crawl while it grows), the tip sprite on the last `u` units (it slides
// with the growth; a "neck" tile right behind it closes the gap to the last whole tile). Every tile is the seamless
// east-facing view (dir 0; flipped when the path heads left) turned on screen to the chord's on-screen direction and
// stretched to its on-screen length (y foreshortened by the 50° view): the 8 baked directions can't be chained along a
// slanted path (each is a separate arched piece, and the path's angle snaps to 45°), this keeps one continuous body.
// opt(p, isTip) gives each tile's sprite options (+ `frame` for the tip's animation). False if a sprite isn't loaded.
function s7Chain(pts, e, u, opt) {
  const SEG = 'dock/s7_creep_seg', TIP = 'dock/s7_creep_tip';
  if (!GFX.on || !GFX.info(SEG) || !GFX.info(TIP)) return false;
  const L = s7Len(pts);
  e = Math.min(e, L);
  const at = (s) => {                                   // (before the start: straight on backwards, the root lies under the tile)
    if (s >= 0) return s7PointAt(pts, s);
    const a = s7PointAt(pts, 0);
    return { x: pts[0].x + Math.cos(a.a) * s, y: pts[0].y + Math.sin(a.a) * s };
  };
  let ok = true, lastSort = -Infinity;
  const tile = (name, s0, s1, tip) => {
    const A = at(s0), B = at(s1), vx = B.x - A.x, vy = (B.y - A.y) * GFX.SIN, l = Math.hypot(vx, vy);
    if (l < 1e-4) return;
    const m = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, left = vx < 0, { frame = 0, ...o } = opt(m, tip);
    if (o.sortY == null) o.sortY = m.y - 0.5;
    if (tip) o.sortY = Math.max(o.sortY, lastSort + 0.001);
    lastSort = Math.max(lastSort, o.sortY);
    ok = s7Spr(name, tip ? frame % 4 : 0, m.x, m.y, 0, { ...o, scale: u, flip: left, rot: left ? Math.atan2(-vy, -vx) : Math.atan2(vy, vx), sx: l / u * 1.05 }) && ok;
  };
  const tip0 = e - u;                                   // where the tip begins
  let s = 0;
  for (; s + u <= tip0 + 1e-6; s += u) tile(SEG, s, s + u, false);
  if (tip0 > s - 1e-6 && tip0 > 0) tile(SEG, Math.max(0, tip0 - u), tip0, false);
  tile(TIP, tip0, e, true);
  return ok;
}
// The cold, as frost spreading over the floor from the freezer's side of each room (storyboard 3): many frost blots,
// each fading in once the room's cold has reached it. 2D: a wash per room.
function s7FrostField(g, s, G, floor) {
  const NAMES = ['dock/s7_frost_a', 'dock/s7_frost_b', 'dock/lab_frost_a', 'dock/lab_frost_c', 'dock/lab_frost_b'];
  g.rooms.forEach((q, i) => {
    const k = s.cold[i];
    if (k <= 0.02) return;
    if (!GFX.on || !GFX.info(NAMES[0])) { s7FrostDraw(q, i, k); return; }
    const n = Math.round(q.w * q.h / 1.8), spots = [];
    for (let j = 0; j < n; j++) {
      const h = (m) => { const v = Math.sin((i * 97 + j * 13.7 + m * 5.1) * 12.9898) * 43758.5453; return v - Math.floor(v); };
      spots.push({ x: q.x + q.w * (0.08 + 0.84 * h(1)), y: q.y + q.h * (0.1 + 0.82 * h(2)), name: NAMES[j % NAMES.length], sc: 1.4 + 0.8 * h(3) });
    }
    const dist = (p) => Math.hypot(p.x - G.freezer.x, p.y - G.freezer.y), d0 = Math.min(...spots.map(dist)), d1 = Math.max(...spots.map(dist));
    spots.forEach((p, j) => {
      const a = clamp(k * 2.5 - 1.3 * (dist(p) - d0) / Math.max(1, d1 - d0), 0, 1);
      if (a > 0.02) s7Spr(p.name, 0, p.x, p.y, 0, { ...floor(5 + j * 0.05), alpha: a * 0.9, scale: p.sc, emissive: 0.15, depthBias: 0.12 });
    });
    if (k > 0.3) for (const [fx, fy2] of [[0.3, 0.35], [0.7, 0.65]]) s7Spr(i % 2 ? 'dock/s7_frost_b' : 'dock/s7_frost_a', 0, q.x + q.w * fx, q.y + q.h * fy2, 0, { ...floor(8), alpha: 0.8 * k, scale: q.w / 2.2, depthBias: 0.12 });   // (a frosty haze over it all)
  });
}
// Tendrils, the creep, the wrap and the tether line (drawn with the actors: on our ship too). (In drawDockActors.)
function drawS7Live(t) {
  const s = S7();
  if (!s) return;
  const d = dk.dock, G = s7Geom(d.side);
  if (s.j1) s7TetherDraw(G, s, t);
  s.tendrils.forEach((T0, i) => {
    const root = G.tendrils[i].root, head = s7Head(s, T0, i), a = Math.atan2(head.y - root.y, head.x - root.x);
    const name = { idle: 'dock/s7_tendril', twitch: 'dock/s7_tendril_twitch', grab: 'dock/s7_tendril_grab', recoil: 'dock/s7_tendril_recoil', husk: 'dock/s7_tendril_husk' }[T0.state];
    const f = T0.state === 'husk' ? 0 : Math.floor(t * (T0.state === 'twitch' ? 20 : 8) + i * 3);
    const grab = T0.state === 'grab', sy = grab ? head.y - 0.02 : Math.max(root.y, head.y);   // grab: the coils' back half under the held crew member, the front half over them
    if (!s7Spr(name, s7Frame(name, a, f), root.x, root.y, 0, { sortY: sy, emissive: T0.state === 'husk' ? 0 : 0.35 })) s7TendrilDraw(T0, i, t);
    else if (grab) s7Spr('dock/s7_tendril_grab_front', s7Frame('dock/s7_tendril_grab_front', a, f), root.x, root.y, 0, { sortY: head.y + 0.02, emissive: 0.35 });
    if (T0.state === 'grab' && T0.struggle > 0.02) s7StruggleBar(head, T0.struggle);
  });
  const C = s.creep, len = s7Len(G.creep);
  if (C.d > 0.05) {
    // (drawn from the end of the long floor vine in the lab's airlock, S7_VINES[0], so it grows out of the growth there)
    const mx = (x) => dockX(d.side, x), v0 = S7_VINES[0], root = v0.slice(-2).map(([x, y]) => ({ x: mx(x), y: G.g.y + y }));
    const d0 = C.wrapped ? len : C.d, pts = s7Smooth([...root, ...G.creep]), r0 = s7Len(pts, 16);   // (pts[16] = G.creep[0]: 8 steps per span)
    const ok = s7Chain(pts, r0 + d0 / len * (s7Len(pts) - r0), 1, (p, tip) => ({ layer: 'wall', frame: Math.floor(t * 8), desat: C.dead ? 1 : 0, alpha: C.dead ? 0.6 : 1,
      emissive: C.dead ? 0 : tip ? 0.4 : 0.3 }));
    if (!ok) s7CreepDraw(G, C, d0, t);
  }
  if (C.wrapped && !C.dead && !s7Spr(CAP_MAX > 3 ? 'dock/s7_wrap_capacitor4' : 'dock/s7_wrap_capacitor', 0, G.cap.x, G.cap.y, 0, { sortY: G.cap.y + 0.05, emissive: 0.4, flip: d.side !== 'port' })) s7WrapDraw(G.cap, C, t);
}

// --- the 2D drawings
const S7_FLESH = ['#5a2a6a', '#7a3a8a', '#9a4aa8'], S7_HUSK = ['#5a5d63', '#74777e', '#8e9198'];
function s7MatDraw(q, i, husk, t) {
  const r = rng(700 + i * 31), pal = husk ? S7_HUSK : S7_FLESH;
  ctx.save(); ctx.beginPath(); ctx.rect(L(q.x), L(q.y), L(q.w), L(q.h)); ctx.clip();
  const n = Math.round(q.w * q.h / 2.2), nod = [];
  for (let k = 0; k < n; k++) {
    const x = q.x + r() * q.w, y = q.y + r() * q.h, rad = 0.35 + r() * 0.7, c = pal[k % 3];
    ctx.globalAlpha = husk ? 0.55 : 0.7; ctx.fillStyle = c; ctx.beginPath();
    for (let j = 0; j <= 10; j++) { const a = j / 10 * TAU, w = rad * (0.8 + 0.25 * Math.sin(a * 3 + k)); ctx.lineTo(L(x + Math.cos(a) * w), L(y + Math.sin(a) * w)); }
    ctx.fill();
    if (r() < 0.6) nod.push([x + (r() - 0.5) * rad, y + (r() - 0.5) * rad, 0.06 + r() * 0.06, r() * 6]);
  }
  ctx.globalAlpha = 1; ctx.restore();
  glowLayer(() => {                                     // the green nodules (dead grey once frozen)
    for (const [x, y, rr0, ph] of nod) {
      const k = husk ? 0.35 : 0.55 + 0.45 * Math.sin(t * 2 + ph);
      ctx.fillStyle = husk ? `rgba(190,196,204,${0.5})` : `rgba(156,255,90,${0.45 + 0.4 * k})`;
      ctx.beginPath(); ctx.arc(L(x), L(y), L(rr0), 0, TAU); ctx.fill();
    }
  });
}
function s7FrostDraw(q, i, k) {
  ctx.fillStyle = `rgba(214,236,255,${0.42 * k})`; ctx.fillRect(L(q.x), L(q.y), L(q.w), L(q.h));
  const r = rng(900 + i * 17);
  ctx.strokeStyle = `rgba(240,250,255,${0.7 * k})`; ctx.lineWidth = 1.5;
  for (let j = 0; j < Math.round(q.w * q.h / 3 * k); j++) {     // frost crystals: little stars
    const x = L(q.x + r() * q.w), y = L(q.y + r() * q.h), s = 3 + r() * 5;
    ctx.beginPath(); for (let a = 0; a < 3; a++) { const u = a * Math.PI / 3; ctx.moveTo(x - Math.cos(u) * s, y - Math.sin(u) * s); ctx.lineTo(x + Math.cos(u) * s, y + Math.sin(u) * s); } ctx.stroke();
  }
}
function s7TendrilDraw(T0, i, t) {
  const body = s7Body(T0, i, 12), husk = T0.state === 'husk', grab = T0.state === 'grab', tw = T0.state === 'twitch';
  const wob = husk ? 0 : tw ? 0.08 : grab ? 0.04 : 0.03, sp = tw ? 30 : 4;
  const pts = body.map((p, j) => { const k = j / (body.length - 1), w = Math.sin(t * sp + j * 0.9 + i) * wob * Math.sin(k * Math.PI); return [L(p.x + w), L(p.y - w)]; });
  const width = (husk ? 9 : 12) * (T0.state === 'recoil' ? 0.8 : 1);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = (wd, col) => { ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.lineWidth = wd; ctx.strokeStyle = col; ctx.stroke(); };
  line(width + 4, OUT);
  line(width, husk ? '#7a7d84' : tw ? (Math.sin(t * 30) > 0 ? '#c25ad8' : '#8a3a9a') : T0.flash > 0 ? '#e8b0f0' : '#8a3a9a');
  line(width * 0.4, husk ? '#9a9da4' : '#b06ac0');
  if (grab) {                                          // coiled round the one it holds
    const [hx, hy] = pts[pts.length - 1];
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(hx, hy - k * 6, 13 - k, 6, 0, 0, TAU); ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = '#9a4aa8'; ctx.lineWidth = 4; ctx.stroke(); }
  }
  if (!husk) {                                         // nodules along it
    for (let j = 2; j < pts.length; j += 3) { ctx.fillStyle = `rgba(156,255,90,${0.6 + 0.3 * Math.sin(t * 3 + j)})`; ctx.beginPath(); ctx.arc(pts[j][0], pts[j][1], 2.5, 0, TAU); ctx.fill(); }
  }
  if (tw) { const [hx, hy] = pts[pts.length - 1]; ctx.strokeStyle = `rgba(255,120,200,${0.5 + 0.5 * Math.sin(t * 30)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, L(0.35), 0, TAU); ctx.stroke(); }
}
function s7StruggleBar(p, k) {
  const x = L(p.x), y = L(p.y) - L(GFX.on ? GFX.lift(1.7) + 0.2 : 0.8);
  ctx.fillStyle = 'rgba(10,12,18,0.85)'; ctx.fillRect(x - 24, y - 4, 48, 8);
  ctx.fillStyle = '#ffe08a'; ctx.fillRect(x - 23, y - 3, 46 * clamp(k, 0, 1), 6);
}
function s7HeartDraw(p, s, t) {
  const x = L(p.x), y = L(p.y), k = s.heartOpen ? 0 : 0.5 + 0.5 * Math.sin(t * 4), r = L(0.65) * (1 + 0.08 * k);
  if (!s.heartOpen) glowLayer(() => { const gg = ctx.createRadialGradient(x, y, 0, x, y, L(1.4)); gg.addColorStop(0, `rgba(255,90,200,${0.35 + 0.25 * k})`); gg.addColorStop(1, 'rgba(255,90,200,0)'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, L(1.4), 0, TAU); ctx.fill(); });
  ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, TAU); ctx.fillStyle = s.heartOpen ? '#74777e' : '#b03a9a'; ctx.fill(); stroke(3);
  for (let j = 0; j < 5; j++) {                         // the lobes / arms wrapped round the box
    const a = j / 5 * TAU + 0.3, open = s.heartOpen ? 0.5 : 0;
    ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.4); ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * r * (1.3 + open), y + Math.sin(a + 0.6) * r * (1.1 + open), x + Math.cos(a + 1.1) * r * (0.9 + open), y + Math.sin(a + 1.1) * r * (0.8 + open));
    ctx.strokeStyle = OUT; ctx.lineWidth = 8; ctx.stroke(); ctx.strokeStyle = s.heartOpen ? '#8e9198' : '#d05ab8'; ctx.lineWidth = 5; ctx.stroke();
  }
  if (!s.heartOpen) { ctx.fillStyle = `rgba(255,200,240,${0.4 + 0.4 * k})`; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, TAU); ctx.fill(); }
}
function s7FreezerDraw(p, s, t) {
  const x = L(p.x), y = L(p.y);
  rr(x - L(0.55), y - L(0.4), L(1.1), L(0.8), 6); ctx.fillStyle = s.freezer ? '#dfeaf4' : '#9aa3b5'; ctx.fill(); stroke(3);
  ctx.fillStyle = s.freezer ? '#2d5f82' : '#3a3f4a'; ctx.fillRect(x - L(0.4), y - L(0.28), L(0.8), L(0.22));
  ctx.font = `800 ${T * 0.11}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = s.freezer ? '#bfe8ff' : '#6b7486'; ctx.fillText(s.freezer ? '−80°C' : 'OFF', x, y - L(0.17));
  ctx.fillStyle = '#2a2d35'; ctx.font = `800 ${T * 0.09}px system-ui, sans-serif`; ctx.fillText('S-7 · KEEP FROZEN', x, y + L(0.18)); ctx.textAlign = 'left';
  if (s.freezer) glowLayer(() => { for (let j = 0; j < 4; j++) { const q = (t * 0.6 + j / 4) % 1; ctx.fillStyle = `rgba(214,236,255,${0.5 * (1 - q)})`; ctx.beginPath(); ctx.arc(x + Math.sin(j * 2.1) * L(0.4), y + L(0.4 + q * 0.8), L(0.12 + q * 0.25), 0, TAU); ctx.fill(); } });
}
function s7JunctionDraw(p, s, t) {
  const x = L(p.x), y = L(p.y);
  rr(x - L(0.3), y - L(0.22), L(0.6), L(0.44), 4); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(2);
  ctx.fillStyle = s.j1 ? POWER_COL : Math.sin(t * 3) > 0.7 ? '#ff5a4a' : '#5a2a22'; ctx.beginPath(); ctx.arc(x + L(0.17), y - L(0.08), 3, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(232,236,244,0.8)'; ctx.font = `800 ${T * 0.11}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('J1', x - L(0.08), y); ctx.textAlign = 'left';
}
function s7CocoonDraw(p, husk, t) {
  const x = L(p.x), y = L(p.y);
  ctx.beginPath(); ctx.ellipse(x, y, L(0.3), L(0.5), 0, 0, TAU); ctx.fillStyle = husk ? '#74777e' : '#7a3a8a'; ctx.fill(); stroke(3);
  ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(x, y - L(0.28), 5, Math.PI, TAU); ctx.fill();          // a red bandana peeking out
  ctx.strokeStyle = husk ? '#9a9da4' : '#b06ac0'; ctx.lineWidth = 2;
  for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(x, y + k * L(0.13), L(0.3), 3, 0, 0, Math.PI); ctx.stroke(); }
}
function s7CreepDraw(G, C, d0, t) {
  const pts = []; for (let k = 0; k <= d0; k += 0.2) pts.push(s7PointAt(G.creep, k)); pts.push(s7PointAt(G.creep, d0));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = (wd, col) => { ctx.beginPath(); pts.forEach((p, j) => { const w = C.dead ? 0 : Math.sin(t * 3 + j * 0.7) * 0.03; return j ? ctx.lineTo(L(p.x + w), L(p.y + w)) : ctx.moveTo(L(p.x), L(p.y)); }); ctx.lineWidth = wd; ctx.strokeStyle = col; ctx.stroke(); };
  line(14, OUT); line(10, C.dead ? '#74777e' : C.flash > 0 ? '#e8b0f0' : '#8a3a9a'); line(4, C.dead ? '#8e9198' : '#b06ac0');
  if (!C.dead) { const tp = pts[pts.length - 1]; ctx.fillStyle = `rgba(156,255,90,${0.6 + 0.4 * Math.sin(t * 5)})`; ctx.beginPath(); ctx.arc(L(tp.x), L(tp.y), 4, 0, TAU); ctx.fill(); }
}
function s7WrapDraw(cap, C, t) {
  const x = L(cap.x), y = L(cap.y);
  for (let k = 0; k < 4; k++) {
    ctx.beginPath(); ctx.ellipse(x, y - L(0.15 + k * 0.18), L(0.75), L(0.16), Math.sin(t + k) * 0.08, 0, TAU);
    ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = C.flash > 0 ? '#e8b0f0' : '#8a3a9a'; ctx.lineWidth = 6; ctx.stroke();
  }
  ctx.fillStyle = 'rgba(10,12,18,0.85)'; ctx.fillRect(x - 24, y - L(1.05), 48, 7);
  ctx.fillStyle = '#c46ad8'; ctx.fillRect(x - 23, y - L(1.05) + 1, 46 * clamp(C.wrapHp, 0, 1), 5);
}
function s7TetherDraw(G, s, t) {                        // our tether line, from J1 along the tube to our capacitor
  const pts = [G.j1, { x: G.creep[0].x, y: G.creep[0].y - 0.55 }, { x: G.creep[1].x, y: G.creep[1].y - 0.55 }, { x: G.creep[2].x, y: G.creep[2].y - 0.6 }, { x: G.cap.x, y: G.cap.y - 0.4 }];
  ctx.setLineDash([6, 5]); ctx.lineDashOffset = s.freezer ? -t * 30 : 0;
  ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(L(p.x), L(p.y)) : ctx.moveTo(L(p.x), L(p.y))));
  ctx.lineWidth = 3; ctx.strokeStyle = s.freezer ? POWER_COL : 'rgba(255,216,74,0.45)'; ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
}

// ---------------------------------------------------------------------------
// The sidebar plate
// ---------------------------------------------------------------------------
function s7Plates(add) {
  const s = S7();
  if (!s) return;
  const side = s7Side(dk.dock.side), cold = Math.round(Math.max(...s.cold) * 100);
  const fz = s.freezer ? `drawing from the ${side} capacitor · cold ${cold}%` : s.j1 ? `switch it on (lab) · cold ${cold}%` : 'no power: patch junction J1 (lab airlock)';
  add('s7freezer', { icon: 'surge', title: s.freezer ? 'FREEZER: ON' : 'FREEZER: OFF', sub: fz, stripe: '#bfe8ff', wrap: true });
  const boxThere = ITEMS.some(it => it.kind === 'blackbox' && inDock(it.x, it.y));
  const C = s.creep, creep = C.dead ? 'creep withered' : C.wrapped ? `WRAPPED our ${side} capacitor!` : `creep ${Math.round(C.d / s7Len(s7Geom(dk.dock.side).creep) * 100)}%`;
  const held = crew.filter(c => s7Holding(c)).map(c => c.name);
  add('s7', { icon: 'spore', title: held.length ? `S-7 HAS ${held.join(', ').toUpperCase()}` : s.dead ? 'S-7: DEAD' : 'S-7 GROWTH', sub: `${boxThere ? `box ${s.heartOpen ? 'FREE' : 'held by the heart'} · ` : ''}${creep}`, stripe: '#c46ad8', red: held.length > 0 || C.wrapped, wrap: true });
}
