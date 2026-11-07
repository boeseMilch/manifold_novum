// Prototype 3, the big ship: the whole simulation (core). Plain JS, no DOM.
//
// LOAD ORDER (the same in Node and the browser):
//   1. prototype3/sim.js            this file: layout, movement, crew, stations, encounters, registries
//   2. the files in BIG.SIM_MODULES  (in that order): the mechanics that plug into the core
// Node:    const BIG = require('./prototype3/sim.js')   (sim.js requires the modules itself)
// Browser: index.html loads sim.js, then its loader adds BIG.SIM_MODULES and BIG.CLIENT_MODULES as
//          <script async=false> tags, in order. So adding a module = one entry in a list below.
// Every file shares one namespace object, BIG (globalThis.BIG; module.exports in Node).
//
// Units: 1 layout unit = 48 px at zoom 1 (T in render.js). The nose points up (-y). Angles are canvas
// angles in ship coordinates: 0 = to the right (+x), -PI/2 = towards the nose.
//
// Extension points (see the bottom of DESIGN.md, "Core API"):
//   BIG.defineStation(def)           add a station or replace the fields of an existing one (same id)
//   BIG.TICK_HOOKS.push(fn)          fn(sim, dt) every tick while the run is on
//   BIG.INIT_HOOKS.push(fn)          fn(sim) when a sim is created (put module state on sim.<name>)
//   BIG.SNAPSHOT_HOOKS.push(fn)      fn(sim, snap): add module state to the snapshot
//   BIG.ENCOUNTER_KINDS[kind] = { spawn(sim, opts) -> fields, tick(sim, enc, dt), end(sim, enc) }
//   BIG.CARRY_SPEED[item] = k        walking speed factor while carrying that item
(function () {
'use strict';
const B = (typeof globalThis !== 'undefined' ? globalThis : this).BIG = (globalThis.BIG || {});

B.SIM_MODULES = ['sim-artillery.js', 'sim-helm.js'];             // loaded after sim.js, in this order
B.CLIENT_MODULES = ['render.js', 'view-artillery.js', 'view-helm.js', 'client.js'];   // browser only, after the sim modules

const TAU = Math.PI * 2;
const MIN_CREW = 3;
const WALK_SPEED = 4.2, WALK_ACCEL = 30;     // units/s, units/s² (like the main game)
const CREW_R = 0.2;                          // half-size of the crew collision box
const USE_REACH = 1.3;                       // how close (to a station's x, y) E works
const CARRY_SPEED = { shell: 0.55 };
const COLORS = ['#c4683a', '#3a8fc4', '#5aa04a', '#c4a23a', '#9a5ac4', '#c43a6a', '#3ac4b0', '#8a8f9a'];

// ---------------------------------------------------------------------------
// Layout (layout units). Long ship, nose up; the spine corridor runs down the middle with rooms on both
// sides; walls are the 0.6 gaps between the floor rects, doorways are rects that bridge a gap.
// ---------------------------------------------------------------------------
const R = (x0, y0, x1, y1) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
const SHIP = { w: 22, h: 46, cx: 11, cy: 22 };   // the hull's bounding box (without the nose / engines): x 0..22
const SPINE = R(9.6, 8.6, 12.4, 38.0);
const ZONES = {
  bridge: { tint: '#6c7282', label: '#e8ecf4' },
  gun: { tint: '#7a5f62', label: '#ff9a8a' },
  power: { tint: '#5f6a80', label: '#9cc4ff' },
  living: { tint: '#6f6a5f', label: '#e8d8b0' },
  store: { tint: '#686b62', label: '#d8e0b0' },
  corridor: { tint: '#62666f', label: '#c8ccd4' },
};
const ROOMS = [
  { id: 'bridge', name: 'Bridge', zone: 'bridge', rects: [R(3.0, 0.6, 19.0, 8.0), R(7.0, -2.4, 15.0, 0.6)] },
  { id: 'quarters', name: 'Quarters', zone: 'living', rects: [R(1.0, 8.6, 9.0, 16.4)] },
  { id: 'galley', name: 'Galley', zone: 'living', rects: [R(13.0, 8.6, 21.0, 16.4)] },
  { id: 'fireControl', name: 'Fire control', zone: 'gun', rects: [R(1.0, 17.0, 9.0, 23.4)] },
  { id: 'gunRoom', name: 'Gun room', zone: 'gun', rects: [R(1.0, 24.0, 9.0, 31.4)] },
  { id: 'reactor', name: 'Energy bank', zone: 'power', rects: [R(13.0, 17.0, 21.0, 29.0)] },
  { id: 'locker', name: 'Locker', zone: 'store', rects: [R(1.0, 32.0, 9.0, 38.0)] },
  { id: 'bunks', name: 'Bunk room', zone: 'living', rects: [R(13.0, 29.6, 21.0, 38.0)] },
  { id: 'magazine', name: 'Magazine', zone: 'store', rects: [R(1.0, 38.6, 21.0, 45.0)] },
  { id: 'spine', name: 'Spine', zone: 'corridor', rects: [SPINE] },
];
const DOORWAYS = [
  R(9.6, 8.0, 12.4, 8.6),            // bridge - spine
  R(9.0, 12.0, 9.6, 13.8),           // quarters
  R(12.4, 12.0, 13.0, 13.8),         // galley
  R(9.0, 19.2, 9.6, 21.0),           // fire control
  R(9.0, 28.6, 9.6, 30.4),           // gun room (fire control and the gun room: a wall between, no door)
  R(12.4, 22.2, 13.0, 24.0),         // energy bank
  R(9.0, 34.0, 9.6, 35.8),           // locker
  R(12.4, 33.0, 13.0, 34.8),         // bunks
  R(9.6, 38.0, 12.4, 38.6),          // spine - magazine
];
const ROOM_RECTS = ROOMS.flatMap(r => r.rects);
const WALK = [...ROOM_RECTS, ...DOORWAYS];
// Hull outline (clockwise from the nose): contains every wall. The left sponson carries the gun turret,
// the right one the energy bank's radiators.
const HULL = [[6.6, -3.0], [15.4, -3.0], [19.4, 0.2], [19.4, 4.2], [21.4, 8.2], [21.4, 18.6], [23.8, 19.8], [23.8, 26.2], [21.4, 27.4],
  [21.4, 44.6], [20.6, 45.4], [1.4, 45.4], [0.6, 44.6], [0.6, 27.6], [-2.4, 26.4], [-2.4, 21.0], [0.6, 19.8], [0.6, 8.2], [2.6, 4.2], [2.6, 0.2]];
// The artillery turret on the hull's back, over the wall between fire control and the gun room.
const TURRET = { x: -0.55, y: 23.7, r: 1.3, barrel: 3.2 };
const ENGINES = [{ x: 6.0, y: 45.4, w: 3.6 }, { x: 16.0, y: 45.4, w: 3.6 }];
// Clutter. solid: crew can't walk through it. kind: how render.js draws it.
const CLUTTER = [
  { kind: 'chartTable', ...R(9.6, 2.6, 12.4, 4.2), solid: true },
  { kind: 'console', ...R(7.4, -2.4, 9.4, -1.6), solid: true }, { kind: 'console', ...R(12.6, -2.4, 14.6, -1.6), solid: true },
  { kind: 'bunk', ...R(1.0, 8.6, 3.2, 10.6), solid: true }, { kind: 'bunk', ...R(1.0, 11.4, 3.2, 13.4), solid: true },
  { kind: 'bunk', ...R(1.0, 14.2, 3.2, 16.2), solid: true }, { kind: 'locker', ...R(5.4, 8.6, 8.6, 9.4), solid: true },
  { kind: 'table', ...R(15.4, 11.0, 18.6, 13.0), solid: true }, { kind: 'stove', ...R(18.4, 8.6, 21.0, 9.6), solid: true },
  { kind: 'counter', ...R(13.0, 8.6, 17.0, 9.4), solid: true },
  { kind: 'reactor', ...R(16.0, 21.4, 19.6, 25.0), solid: true },
  { kind: 'periscope', ...R(1.0, 21.0, 1.7, 23.4), solid: true },
  { kind: 'gunBlock', ...R(1.0, 24.0, 1.4, 27.0), solid: true },
  { kind: 'crate', ...R(1.0, 32.0, 2.8, 33.6), solid: true }, { kind: 'crate', ...R(1.0, 36.0, 3.4, 38.0), solid: true },
  { kind: 'locker', ...R(4.4, 37.2, 8.6, 38.0), solid: true },
  { kind: 'bunk', ...R(18.8, 29.6, 21.0, 31.6), solid: true }, { kind: 'bunk', ...R(18.8, 32.6, 21.0, 34.6), solid: true },
  { kind: 'bunk', ...R(18.8, 35.6, 21.0, 37.6), solid: true },
  { kind: 'crate', ...R(14.6, 42.6, 17.4, 45.0), solid: true }, { kind: 'crate', ...R(17.6, 43.4, 19.4, 45.0), solid: true },
  { kind: 'crate', ...R(19.6, 38.6, 21.0, 40.4), solid: true }, { kind: 'pipes', ...R(13.0, 38.6, 15.6, 39.2), solid: true },
];
const SOLIDS = CLUTTER.filter(c => c.solid);

// Stations (placeholders; the mechanics replace them with defineStation). x, y: the device; for a seat,
// sx, sy, face: where the operator sits and looks. kind: picks the client's STATION_VIEWS / art.
const STATIONS = {};
const STATION_ORDER = [];
function defineStation(def) {
  if (!def || !def.id) throw new Error('defineStation: needs an id');
  const old = STATIONS[def.id];
  if (old) Object.assign(old, def);
  else { STATIONS[def.id] = Object.assign({ room: roomAt(def.x, def.y)?.id || null, seat: false, claims: [] }, def); STATION_ORDER.push(def.id); }
  return STATIONS[def.id];
}
const placeholder = (label) => ({
  label,
  prompt: (sim, c) => `${label} (not built yet)`,
  use: (sim, c) => sim.banner(`${label}: not built yet`, c.id),
  drive: () => {},
  hint: 'not built yet · E / Space: leave',
});
defineStation({ id: 'chart', kind: 'chart', room: 'bridge', x: 11.0, y: 3.4, sx: 11.0, sy: 4.75, face: -Math.PI / 2, seat: true, ...placeholder('Chart table') });
defineStation({ id: 'cupola', kind: 'cupola', room: 'fireControl', x: 1.35, y: 22.2, sx: 2.3, sy: 22.2, face: Math.PI, seat: true, ...placeholder('Cupola seat') });
defineStation({ id: 'rangeWheel', kind: 'rangeWheel', room: 'gunRoom', x: 4.4, y: 24.25, sx: 4.4, sy: 25.0, face: -Math.PI / 2, seat: true, ...placeholder('Range wheel') });
defineStation({ id: 'breech', kind: 'breech', room: 'gunRoom', x: 1.7, y: 25.5, seat: false, ...placeholder('Breech') });
defineStation({ id: 'readyRack', kind: 'readyRack', room: 'gunRoom', x: 7.4, y: 31.1, seat: false, ...placeholder('Ready rack') });
defineStation({ id: 'shellRacks', kind: 'shellRacks', room: 'magazine', x: 7.4, y: 38.9, seat: false, ...placeholder('Shell racks') });

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------
function inRect(x, y, r, pad = 0) { return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad; }
function roomAt(x, y) { return ROOMS.find(r => r.rects.some(q => inRect(x, y, q))) || null; }
const hitsSolid = (x, y, r) => SOLIDS.some(S => x + r > S.x && x - r < S.x + S.w && y + r > S.y && y - r < S.y + S.h);
function canStand(x, y) {
  const r = CREW_R;
  return [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]].every(([cx, cy]) => WALK.some(q => inRect(cx, cy, q)))
    && !hitsSolid(x, y, r);
}
function nearestFree(x, y) {
  if (canStand(x, y)) return [x, y];
  for (let r = 0.05; r <= 4; r += 0.05)
    for (let k = 0; k < 24; k++) {
      const px = x + Math.cos(k / 24 * TAU) * r, py = y + Math.sin(k / 24 * TAU) * r;
      if (canStand(px, py)) return [px, py];
    }
  return [x, y];
}
function rng(seed) {                          // mulberry32
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = (v) => Math.round(v * 100) / 100;
// Where on the hull something from that side hits (for damageHull).
const HULL_POINTS = { left: [0.6, 24], right: [21.4, 24], ahead: [11, -3], front: [11, -3], behind: [11, 45.4], stern: [11, 45.4] };

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------
const TICK_HOOKS = [], INIT_HOOKS = [], SNAPSHOT_HOOKS = [];
const ENCOUNTER_KINDS = {
  // Placeholders (the artillery fills in their behaviour): they just sit out there.
  gunship: {
    spawn: (sim, opts = {}) => { const side = opts.side === 'right' ? 'right' : 'left'; return { side, x: SHIP.cx + (side === 'left' ? -38 : 38), y: TURRET.y, y0: TURRET.y, hp: 2 }; },
    tick: (sim, e, dt) => { e.y = e.y0 + Math.sin(e.age * 0.4) * 4; },
    end: () => {},
  },
  asteroids: {
    spawn: (sim, opts = {}) => ({ x: SHIP.cx, y: -40 }),
    tick: (sim, e, dt) => { e.y += dt * 0.5; },
    end: () => {},
  },
};
const EMPTY_INPUT = () => ({ up: false, down: false, left: false, right: false, use: false, fire: false, back: false });
const KEYS = ['up', 'down', 'left', 'right', 'use', 'fire', 'back'];

// ---------------------------------------------------------------------------
// The sim
// ---------------------------------------------------------------------------
function createSim(opts = {}) {
  const seed = opts.seed != null ? opts.seed : (Math.random() * 2 ** 31) | 0;
  const sim = {
    seed, rand: rng(seed), time: 0,
    phase: 'run',                 // 'run' | 'end'
    lost: false, won: false, summary: null,
    hull: 100, energy: 12, magazine: 10, readyRack: 0, breech: 'empty',   // shared state (DESIGN.md)
    turret: { angle: -Math.PI / 2, range: 30 },    // the barrel's traverse (drawn on the hull) and the range setting
    crew: [], encounters: [], events: [],
    stats: { hullLost: 0 },        // modules add counters; the end card lists them all
    nextId: 1,
  };
  Object.assign(sim, methods);
  for (const fn of INIT_HOOKS) fn(sim);
  return sim;
}
const methods = {
  // --- crew
  addCrew(id, name, color) {
    if (this.crew.some(c => c.id === id)) return this.crew.find(c => c.id === id);
    const i = this.crew.length;
    const spots = [[11, 6.2], [9.0, 6.2], [13.0, 6.2], [11, 14], [11, 20], [11, 26], [7, 6.2], [15, 6.2]];
    const [x, y] = nearestFree(...spots[i % spots.length]);
    const c = { id, name: String(name || 'Crew').slice(0, 16), color: color || COLORS[i % COLORS.length], x, y, vx: 0, vy: 0, face: -Math.PI / 2, walk: 0,
      carry: null, station: null, focus: null, prompt: null, action: null, input: EMPTY_INPUT(), pressed: new Set() };
    this.crew.push(c);
    return c;
  },
  removeCrew(id) {
    const c = this.crew.find(c => c.id === id);
    if (!c) return;
    if (c.station) this.leaveStation(c);
    this.crew.splice(this.crew.indexOf(c), 1);
  },
  getCrew(id) { return this.crew.find(c => c.id === id) || null; },
  // Input: { up, down, left, right, use, fire, back } held, plus pressed: ['use', ...] since the last call.
  setInput(id, inp) {
    const c = this.getCrew(id);
    if (!c || !inp) return;
    for (const k of KEYS) if (k in inp) c.input[k] = !!inp[k];
    for (const k of inp.pressed || []) if (KEYS.includes(k)) c.pressed.add(k);
  },
  // --- stations
  stationAt(c) { return c.station ? STATIONS[c.station] : null; },
  occupant(stId) { return this.crew.find(c => c.station === stId) || null; },
  sit(c, st) {
    c.station = st.id; c.vx = c.vy = 0;
    c.x = st.sx ?? st.x; c.y = st.sy ?? st.y; if (st.face != null) c.face = st.face;
    st.sit?.(this, c);
  },
  leaveStation(c) {
    const st = STATIONS[c.station];
    c.station = null;
    if (st) st.leave?.(this, c);
    [c.x, c.y] = nearestFree(c.x, c.y);
  },
  // A timed action (opening the breech, ramming a shell): the crew member can't move meanwhile; with
  // { hold: true } it's cancelled when E is let go. done(sim, crew) runs at the end. Shown as a progress bar.
  startAction(c, secs, label, done, o = {}) { c.action = { label, t: 0, dur: Math.max(0.01, secs), done, hold: !!o.hold, cancel: o.cancel || null }; },
  cancelAction(c) { const a = c.action; c.action = null; if (a && a.cancel) a.cancel(this, c); },
  // --- encounters
  spawnEncounter(kind, opts = {}) {
    const K = ENCOUNTER_KINDS[kind];
    if (!K) throw new Error('unknown encounter kind ' + kind);
    const enc = Object.assign({ x: 0, y: 0 }, K.spawn(this, opts) || {}, { id: this.nextId++, kind, age: 0, dead: false });
    this.encounters.push(enc);
    this.events.push({ type: 'encounter', kind, id: enc.id, side: enc.side || null });
    return enc;
  },
  removeEncounter(enc) { const i = this.encounters.indexOf(enc); if (i >= 0) this.encounters.splice(i, 1); },
  endEncounters() {
    for (const enc of this.encounters.slice()) ENCOUNTER_KINDS[enc.kind]?.end?.(this, enc);
    this.encounters.length = 0;
  },
  // --- damage, events, the end
  damageHull(n, where) {
    if (this.phase !== 'run' || n <= 0) return;
    const p = typeof where === 'string' ? HULL_POINTS[where] || [SHIP.cx, SHIP.cy] : where && Number.isFinite(where.x) ? [where.x, where.y] : [SHIP.cx, SHIP.cy];
    const was = this.hull;
    this.hull = Math.max(0, this.hull - n);
    this.stats.hullLost += was - this.hull;
    this.events.push({ type: 'hullHit', n, x: r2(p[0]), y: r2(p[1]) });
    if (this.hull <= 0) this.end(false, 'The hull gave way.');
  },
  banner(text, to = null) { this.events.push({ type: 'banner', text, to }); },
  event(e) { this.events.push(e); },
  takeEvents() { const e = this.events; this.events = []; return e; },
  end(won, reason) {
    if (this.phase === 'end') return;
    this.phase = 'end'; this.won = !!won; this.lost = !won;
    for (const c of this.crew) { if (c.station) this.leaveStation(c); c.action = null; }
    this.summary = { won: !!won, reason: reason || (won ? 'You made the jump.' : 'The ship is lost.'), time: r2(this.time), hull: Math.round(this.hull),
      energy: this.energy, magazine: this.magazine, stats: { ...this.stats } };
    this.events.push({ type: 'end', won: !!won });
  },
  // --- the tick
  tick(dt) {
    if (this.phase === 'run') {
      this.time += dt;
      for (const c of this.crew) this.crewTick(c, dt);
      for (const enc of this.encounters.slice()) {
        enc.age += dt;
        ENCOUNTER_KINDS[enc.kind]?.tick?.(this, enc, dt);
        if (enc.dead) this.removeEncounter(enc);
      }
      for (const fn of TICK_HOOKS) { if (this.phase !== 'run') break; fn(this, dt); }
    }
    for (const c of this.crew) c.pressed.clear();
  },
  crewTick(c, dt) {
    const inp = c.input, pr = c.pressed;
    let ax = (inp.right ? 1 : 0) - (inp.left ? 1 : 0), ay = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
    c.prompt = null; c.focus = null;
    if (c.action) {                                       // busy: no walking
      const a = c.action;
      if (a.hold && !inp.use) this.cancelAction(c);
      else if ((a.t += dt) >= a.dur) { c.action = null; a.done?.(this, c); }
      ax = ay = 0;
      if (!c.station) { this.move(c, 0, 0, dt); return; }
    }
    if (c.station) {                                     // seated: the station gets the keys
      const st = STATIONS[c.station];
      if (!st) { c.station = null; return; }
      const claims = st.claims || [];
      if ((pr.has('use') && !claims.includes('use')) || (pr.has('fire') && !claims.includes('fire'))) { this.leaveStation(c); return; }
      if (!c.action) st.drive?.(this, c, { ax, ay, up: inp.up, down: inp.down, left: inp.left, right: inp.right, use: inp.use, fire: inp.fire, back: inp.back, pressed: pr }, dt);
      return;
    }
    this.move(c, ax, ay, dt);
    // what's in reach: the nearest station that offers something
    let best = null, bd = USE_REACH;
    for (const id of STATION_ORDER) {
      const st = STATIONS[id], d = Math.hypot(c.x - st.x, c.y - st.y);
      if (d >= bd) continue;
      const occ = st.seat ? this.occupant(id) : null;
      const p = occ ? `${st.label || id}: ${occ.name} is on it` : st.prompt ? st.prompt(this, c) : st.label;
      if (p == null) continue;
      best = { st, p, occ }; bd = d;
    }
    if (!best) return;
    c.focus = best.st.id; c.prompt = best.occ ? best.p : 'E: ' + best.p;
    if (best.occ) return;
    if (pr.has('use') || pr.has('fire')) {
      if (best.st.seat) this.sit(c, best.st);
      else best.st.use?.(this, c);
    } else if (inp.use && best.st.hold) best.st.hold(this, c, dt);
  },
  move(c, ix, iy, dt) {
    const len = Math.hypot(ix, iy), speed = WALK_SPEED * (c.carry ? CARRY_SPEED[c.carry] ?? 1 : 1);
    const tx = len ? ix / len * speed : 0, ty = len ? iy / len * speed : 0;
    const k = Math.min(1, WALK_ACCEL * dt / speed);
    c.vx = lerp(c.vx, tx, k); c.vy = lerp(c.vy, ty, k);
    if (!canStand(c.x, c.y)) { [c.x, c.y] = nearestFree(c.x, c.y); c.vx = c.vy = 0; }
    const nx = c.x + c.vx * dt;
    if (canStand(nx, c.y)) c.x = nx; else c.vx = 0;
    const ny = c.y + c.vy * dt;
    if (canStand(c.x, ny)) c.y = ny; else c.vy = 0;
    const sp = Math.hypot(c.vx, c.vy);
    if (len && sp > 0.3) c.face = Math.atan2(c.vy, c.vx);
    c.walk += sp * dt * 3.2;
  },
  // --- the snapshot: plain JSON, small. Fields of encounters starting with '_' stay on the server.
  snapshot() {
    const snap = {
      t: r2(this.time), phase: this.phase, hull: Math.round(this.hull * 10) / 10, energy: this.energy, magazine: this.magazine,
      readyRack: this.readyRack, breech: this.breech, turret: { angle: Math.round(this.turret.angle * 1000) / 1000, range: r2(this.turret.range) },
      crew: this.crew.map(c => ({ id: c.id, name: c.name, color: c.color, x: r2(c.x), y: r2(c.y), face: Math.round(c.face * 100) / 100, walk: r2(c.walk % 100),
        carry: c.carry, station: c.station, focus: c.focus, prompt: c.prompt, action: c.action ? [c.action.label, r2(c.action.t / c.action.dur)] : null })),
      enc: this.encounters.map(e => {
        const o = {};
        for (const k in e) if (k[0] !== '_') o[k] = typeof e[k] === 'number' ? r2(e[k]) : e[k];
        return o;
      }),
      summary: this.summary,
    };
    for (const fn of SNAPSHOT_HOOKS) fn(this, snap);
    return snap;
  },
};

Object.assign(B, {
  MIN_CREW, WALK_SPEED, WALK_ACCEL, CREW_R, USE_REACH, CARRY_SPEED, COLORS, TAU,
  R, SHIP, SPINE, ZONES, ROOMS, DOORWAYS, ROOM_RECTS, WALK, HULL, TURRET, ENGINES, CLUTTER, SOLIDS, HULL_POINTS,
  STATIONS, STATION_ORDER, defineStation, TICK_HOOKS, INIT_HOOKS, SNAPSHOT_HOOKS, ENCOUNTER_KINDS,
  inRect, roomAt, canStand, nearestFree, rng, lerp, clamp, createSim, EMPTY_INPUT, KEYS,
});

if (typeof module === 'object' && module.exports) {
  module.exports = B;
  const path = require('path'), fs = require('fs');
  for (const f of B.SIM_MODULES) if (fs.existsSync(path.join(__dirname, f))) require('./' + f);
}
})();
