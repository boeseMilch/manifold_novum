// This frame's lighting for the sprite renderer (js/gfx.js): the one place that decides what is lit
// and how. Only used when GFX.on (the classic look keeps drawLights / drawLightPools), except
// alarmState() and drawAlarmHUD(), which work in both looks.
//
// gameLighting(t) returns { ambient, sun, areas, lights, walls, grade } for GFX.lighting():
//   ambient  [r, g, b]  outside every area (space, the hull)
//   sun      { dir: [x, y, z] (towards the light; x right, y down the screen, z up), color, k }
//   areas    [{ x, y, w, h, color: [r, g, b], sun }]  ambient per area; the last one containing a
//            pixel wins (soft edges). Rooms are grown by half a wall so the walls go dark with them.
//   lights   [{ x, y, z, color, radius, intensity, wrap, dir, cone, x2, y2, z2, shadow }]  (layout
//            units; dir + cone: a spot; x2, y2, z2: a strip; shadow: casts screen-space shadows)
//   grade    [r, g, b]  multiplies the final picture (the red alarm's strobe)
//   walls    [[x0, y0, x1, y1], ...]  the cut-down walls as light occluders (lightWalls() below)
// 1 = the sprite as rendered in Blender; the beauty pass already has its key light baked in.
//
// The lighting model:
// - Power (per zone column, CAPACITORS[col] has charge and isn't broken; lightLevel in
//   js/systems.js fades it): powered rooms get warm ceiling lamps high above (LIGHTS in
//   js/interior.js; light from above, pools on the floor, tops lit) over a soft ambient. Without
//   power the lamps die and red emergency strips at the wall bases take over: low, grazing light
//   across the normal maps, sides lit instead of tops, the room centre dark. When power comes back
//   the lamps flicker on. An ion storm kills every lamp and gives the crew flashlights.
// - Outside: a cold distant star from the front right (the same side as the baked key light) over a
//   low blue ambient, so the hull and the enemies read from the cannon views and on spacewalks.
// - Alarms (alarmState() below; the rules live there): yellow for any fire, red in two levels for
//   damage. Rotating beacons on each room's back wall: two real spot beams sweeping across the
//   room (and its normal maps), plus a pulsing wash; red wins over yellow, fires still glow locally.
// - Dynamic lights from the game state: fires, the reactor, screens, muzzle flashes, bolts and
//   blasts, explosions (combat.fx clustered), sparks of broken systems, power surges, energy on the
//   power lines, the engine's flickering blue plume, shields, enemy weak spots and engines, the leviathan, the jump drive spooling up.
//   The crew's helmet lamps (always on: c.lamp): spot beams where they face, with shadows.

// The walls the camera looks over (the near walls along the stern, cut down to 0.35, and the low south ends
// of the up-down walls: js/sprites.js buildWalls) still stop light at their full height (GFX.lighting walls,
// js/gfx.js wallVis): a lamp inside, the helmet lamp above all, doesn't light their tops, their outer faces or
// the hull outside them, and light from outside (a spacewalker's lamp, the engine plume) stays out of the
// rooms. Near walls: a plane just inside their inner face (0.1 in: the steel coping on the top's inner edge
// still catches the room's light, and the engine housing, which reaches 0.08 into the stern wall, stays
// inside); up-down walls: their middle.
const LIGHT_WALL_IN = 0.1;
let lightWallCache = null;
function lightWalls() {
  if (typeof WALLS === 'undefined' || !WALLS) return [];
  if (lightWallCache && lightWallCache.src === WALLS) return lightWallCache.walls;
  const walls = [
    ...WALLS.hRuns.filter(h => h.kind === 'near').map(h => [h.x0, h.y + LIGHT_WALL_IN, h.x1, h.y + LIGHT_WALL_IN]),
    ...WALLS.vRuns.filter(v => v.step < v.y1 - 0.05).map(v => [v.x, Math.max(v.y0, v.step), v.x, v.y1]),
  ];
  lightWallCache = { src: WALLS, walls };
  return walls;
}

const LIGHT_TUNING = {
  outside: [0.36, 0.4, 0.5],                       // hull and space: low, cold
  sun: { dir: [0.5, 0.42, 0.75], color: [0.78, 0.82, 0.95] },   // the distant star (key light outside)
  roomLit: [0.5, 0.49, 0.5],                       // room ambient with power (plus the lamps)
  roomDark: [0.09, 0.065, 0.075],                  // without power: almost nothing but the strips
  spine: [0.55, 0.55, 0.58],                       // the block between the decks (deck airlocks)
  spineDark: [0.2, 0.15, 0.16],                    // ... without power (its top is the hull's roof: never pitch black)
  lamp: { z: 1.82, radius: 7.4, intensity: 0.95, color: [1.0, 0.86, 0.68] },
  wallLamp: { radius: 2.4, intensity: 0.5 },          // the glow round each bulkhead lamp (WALL_LAMPS, js/interior.js)
  strip: { z: 0.2, inset: 0.12, radius: 6.5, intensity: 0.55, color: [1.0, 0.27, 0.1], doorColor: [1.0, 0.55, 0.12] },
  flicker: 1.3,                                    // seconds of lamp flicker when power comes back
  reactor: { z: 1.4, radius: 5.5, intensity: 1.0, color: [0.55, 1.0, 0.4], over: [0.85, 1.0, 0.8] },
  screen: { z: 1.0, radius: 2.6, intensity: 0.45, color: [0.45, 0.8, 1.0] },
  // the exhaust plume: a strip along it, behind the stern. No shadows: from right behind the bell, the
  // screen-space shadows took the bell and the hull's own edge for occluders and blacked it all out
  engine: { out: 1.8, len: 1.6, z: 0.6, radius: 9, intensity: 1.4, color: [0.35, 0.62, 1.0], spool: 1.3, spoolColor: [0.55, 0.8, 1.0], shadow: false },
  fire: { z: 0.55, radius: 4.2, intensity: 2.0, color: [1.0, 0.5, 0.16], plasma: [0.72, 0.38, 1.0] },
  // the helmet lamp (always on, per crew member; drawing only): a cool white spot from the helmet where they
  // face, tilted down a little, plus a faint glow on the helmet itself; where the lights are out it's what you see by
  helmet: { z: 1.32, fwd: 0.28, tilt: -0.4, cone: 0.72, radius: 8.5, intensity: 2.0, color: [0.86, 0.93, 1.0], glow: 0.5,
            // outside there's no floor under you: what the beam can hit is the hull beside and below you (the
            // airlock housings, blisters, cannons), close and low, so it points down more and wraps further
            out: { tilt: -0.6, wrap: 0.3 } },
};

// ---------------------------------------------------------------------------------------------
// Alarms: the rules, in one place.
//   yellow   any fire burning on our ship (fires[], plasma fires too; not the docked derelict's)
//   red 1    the ship is getting hurt: MAX_DAMAGE - 1 systems broken, or a hull breach (even taped),
//            or a hull side close to breaching (two or more big hits since its last weld)
//   red 2    critical: MAX_DAMAGE systems broken — one more and the ship is lost (js/mission.js)
// Red wins over yellow (the fires still glow on their own). Beacons on emergency power: they
// sweep even in rooms without power.
// ---------------------------------------------------------------------------------------------
const ALARM_TUNING = {
  yellow: [1.0, 0.6, 0.1], red: [1.0, 0.07, 0.04],
  // rotation (rad/s), beam intensity, wash (ambient pulse), strobe (whole-picture pulse)
  // dim: the ceiling lamps go down to this (red alert lighting, so the beams stand out)
  levels: { yellow: { spin: 2.6, beam: 1.6, wash: 0.05, dim: 1 }, red1: { spin: 3.4, beam: 2.1, wash: 0.08, dim: 0.8 },
            red2: { spin: 6.2, beam: 2.8, wash: 0.12, dim: 0.62, strobe: 0.08 } },
  z: 1.3, cone: 0.34, radius: 11, tilt: -0.2,    // beacon height, beam half-angle, reach, beam tilt (down)
  burning: 1.6,                                   // yellow: the burning room's beacons this much stronger
  // the beams start this far out from the wall (into the room): from right at the wall, the
  // screen-space shadows took the wall (and what hangs on it) for an occluder of its own beacon
  // and cut the beams into big straight-edged wedges
  out: 0.45,
};
// Beacons (on each room's back wall, clear of the consoles and doors; all walls face +y).
const BEACONS = { portGun: [[4.0, 3.55]], bridge: [[16.2, 0.75], [28.2, 0.75]], starGun: [[33.4, 2.75]],
                  portLock: [[9.4, SPINE_Y1 + 0.15]], reactor: [[20.6, SPINE_Y1 + 0.15], [27.6, SPINE_Y1 + 0.15]], starLock: [[40.6, SPINE_Y1 + 0.15]] };

function alarmState() {
  const dmg = typeof SYSTEMS !== 'undefined' ? SYSTEMS.filter(s => s.broken).length : 0;
  const maxDmg = typeof MAX_DAMAGE !== 'undefined' ? MAX_DAMAGE : 5;
  const H = typeof hz !== 'undefined' ? hz : null;
  const breach = !!(H && H.breaches && H.breaches.length);
  const hullHits = H && H.hull ? Math.max(0, ...Object.values(H.hull)) : 0;
  const burning = (typeof fires !== 'undefined' ? fires : []).filter(f => f.hp > 0);
  const fireRooms = new Set();
  for (const f of burning) { const r = typeof roomAt === 'function' ? roomAt(f.x, f.y) : null; if (r) fireRooms.add(r.id); }
  const red = dmg >= maxDmg ? 2 : (dmg >= Math.max(1, maxDmg - 1) || breach || hullHits >= 2) ? 1 : 0;
  const yellow = burning.length > 0;
  const why = red === 2 ? `${dmg} parts broken — one more and the ship is lost`
    : red ? [dmg >= maxDmg - 1 && `${dmg} parts broken`, breach && 'hull breach', hullHits >= 2 && 'hull close to breaching'].filter(Boolean).join(' · ')
    : yellow ? `fire${burning.length > 1 ? 's' : ''} on board` : '';
  return { red, yellow, level: red ? 'red' + red : yellow ? 'yellow' : null, fireRooms, dmg, why };
}

// The top bar's alarm indicator (drawn by drawHUD in js/game.js; screen space, its right end at
// xRight). Returns its width (0: no alarm).
function drawAlarmHUD(xRight, y, t) {
  const A = alarmState();
  if (!A.level) return 0;
  const red = A.red > 0, on = Math.sin(t * (A.red === 2 ? 9 : red ? 6 : 4.5)) > -0.2;
  const text = A.red === 2 ? 'RED ALERT — CRITICAL' : red ? 'RED ALERT' : 'FIRE ALARM';
  ctx.save();
  ctx.font = '800 12px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const w = ctx.measureText(text).width + 30, x = xRight - w;
  rr(x, y - 11, w, 22, 11); ctx.fillStyle = red ? (on ? '#b3201a' : '#5a1210') : (on ? '#b8860b' : '#5a4208'); ctx.fill();
  ctx.beginPath(); ctx.arc(x + 12, y, 4.5, 0, TAU); ctx.fillStyle = on ? (red ? '#ffd0c8' : '#fff0b0') : 'rgba(255,255,255,0.25)'; ctx.fill();
  ctx.fillStyle = '#fff6ee'; ctx.fillText(text, x + 22, y + 0.5);
  ctx.restore();
  return w;
}

// ---------------------------------------------------------------------------------------------
// State that lives across frames: when each column's power came back (for the flicker).
// ---------------------------------------------------------------------------------------------
const lightFx = { dark: [false, false, false], back: [-99, -99, -99], lamp: [1, 1, 1] };   // lamp: this frame's lamp level per column (flicker included; the lamp sprites follow it)

function roomColumnLight(col) {
  return typeof lightLevel !== 'undefined' ? clamp(lightLevel[col], 0, 1) : 1;
}
const colAtX = (x) => (x < COLS[1].x ? 0 : x < COLS[2].x ? 1 : 2);
const hash01 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const noise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash01(i), hash01(i + 1), u); };
const hexRgb = (h) => { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

// Lamp factor for a column: the faded light level, with a flicker for a moment after power returns.
function lampFactor(col, t) {
  const k = roomColumnLight(col);
  const since = t - lightFx.back[col];
  if (since < LIGHT_TUNING.flicker && since >= 0) {
    const q = since / LIGHT_TUNING.flicker, on = hash01(Math.floor(since * 17) + col * 31) < 0.3 + 0.7 * q;
    return on ? Math.max(k, 0.5 + 0.5 * q) : 0.04;
  }
  return k;
}

// The emergency strips: one along each inner wall base of every room rect (not where two rects of
// the same room meet), a little in from the wall, near the floor.
let EMERGENCY_STRIPS = null;
function emergencyStrips() {
  if (EMERGENCY_STRIPS) return EMERGENCY_STRIPS;
  const S = LIGHT_TUNING.strip, out = [], e = S.inset;
  const inside = (r, x, y) => r.rects.some(q => x > q.x && x < q.x + q.w && y > q.y && y < q.y + q.h);
  for (const r of ROOMS) for (const q of r.rects) {
    const edges = [
      [q.x + 0.3, q.y + e, q.x + q.w - 0.3, q.y + e, 0, -1], [q.x + 0.3, q.y + q.h - e, q.x + q.w - 0.3, q.y + q.h - e, 0, 1],
      [q.x + e, q.y + 0.3, q.x + e, q.y + q.h - 0.3, -1, 0], [q.x + q.w - e, q.y + 0.3, q.x + q.w - e, q.y + q.h - 0.3, 1, 0],
    ];
    for (const [x0, y0, x1, y1, nx, ny] of edges) {
      const mx = (x0 + x1) / 2 + nx * 0.3, my = (y0 + y1) / 2 + ny * 0.3;
      if (inside(r, mx, my)) continue;                 // an edge shared with another rect of this room
      out.push({ col: r.col, x: x0, y: y0, x2: x1, y2: y1 });
    }
  }
  return (EMERGENCY_STRIPS = out);
}

// Where the leviathan is (the same placement as its drawing in js/organic.js) → world point of a
// local point on it, or null.
function leviathanPoint(lx, ly) {
  const V = typeof org !== 'undefined' && org.lev;
  if (!V) return null;
  const side = V.order[V.i]?.startsWith('port') ? -1 : 1, x = side < 0 ? -14.5 : SHIP_W + 14.5, y = -36 + (LEV_TIME - V.t) * 2.6;
  return [x - side * lx, y + ly];
}

function gameLighting(t) {
  const Lt = LIGHT_TUNING, areas = [], lights = [];
  const add = (l) => { lights.push(l); return l; };
  const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const addTo = (c, d, k) => [c[0] + d[0] * k, c[1] + d[1] * k, c[2] + d[2] * k];
  const storm = typeof enc !== 'undefined' && enc.storm;
  const flare = typeof enc !== 'undefined' && enc.flare;
  // power per column (+ remember when it came back, for the flicker)
  const lamp = [0, 1, 2].map(col => {
    const dark = CAPACITORS[col].charge <= 0 || capBroken(col);
    if (lightFx.dark[col] && !dark) lightFx.back[col] = t;
    lightFx.dark[col] = dark;
    return (lightFx.lamp[col] = lampFactor(col, t) * (storm ? 0.08 : 1));
  });
  const A = alarmState(), AT = ALARM_TUNING, lvl = A.level ? AT.levels[A.level] : null;
  const dim = lvl ? lvl.dim : 1;
  const alarmCol = A.red ? AT.red : AT.yellow;
  const pulse = lvl ? 0.5 + 0.5 * Math.sin(t * (A.red === 2 ? 5.5 : 3.2)) : 0;

  // --- ambient per room (and the spine), fading with power; the alarm's wash on top ---------------
  for (const r of ROOMS) {
    const k = lamp[r.col];
    let color = mix3(Lt.roomDark, Lt.roomLit, k * (0.6 + 0.4 * dim));
    if (lvl) color = addTo(color, alarmCol, lvl.wash * pulse * (A.red || A.fireRooms.has(r.id) ? 1 : 0.4));
    for (const q of r.rects) areas.push({ x: q.x - 0.3, y: q.y - 0.3, w: q.w + 0.6, h: q.h + 0.6, color, sun: 0 });
  }
  COLS.forEach((C, col) => {                        // the spine between the decks, per column (with its deck door)
    areas.push({ x: col ? C.x - 0.3 : -0.2, y: SPINE_Y0, w: C.w + (col ? 0.6 : 1.1) + (col === 2 ? 0.6 : 0), h: SPINE, color: mix3(Lt.spineDark, Lt.spine, lamp[col]), sun: 0.25 * lamp[col] });
  });
  // the docked ship: a dead derelict is dark inside but for its (dying) emergency strips; the
  // pirates keep their ship lit, warm and reddish. The tube between takes after ours.
  if (typeof dk !== 'undefined' && dk.dock && typeof DG === 'function') {
    const g = DG(), pir = dk.dock.kind !== 'derelict', S = Lt.strip;   // (the pirate base: lit like their ship)
    if (dk.dock.tube !== 'detached') areas.push({ x: g.tube.x, y: g.tube.y - 0.3, w: g.tube.w, h: g.tube.h + 0.6, color: pir ? [0.4, 0.34, 0.32] : [0.18, 0.18, 0.2], sun: 0 });
    const s7c = !pir && dk.dock.s7 ? dk.dock.s7.cold : null;   // the derelict: a cool, grey dimness (the clutter and S-7 still read), bluer as the cold spreads
    [...g.rooms, ...g.doors].forEach((q, i) => {
      const c = s7c && i < 3 ? s7c[i] : 0;
      areas.push({ x: q.x - 0.3, y: q.y - 0.3, w: q.w + 0.6, h: q.h + 0.6, color: pir ? [0.36, 0.26, 0.25] : [0.3 + 0.06 * c, 0.33 + 0.1 * c, 0.4 + 0.18 * c], sun: 0 });
    });
    g.rooms.forEach((q, i) => {
      if (pir) {                                      // (the pirate base's bigger rooms: a lamp per ~6 units)
        const nx = Math.max(1, Math.round(q.w / 6)), ny = Math.max(1, Math.round(q.h / 6));
        const red = q === g.rooms[5] && dk.boss?.red;   // (Captain Red Comet's quarters in comet mode: red alert, js/captain.js)
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) add({ x: q.x + q.w * (i + 0.5) / nx, y: q.y + q.h * (j + 0.5) / ny, z: 1.8, color: red ? [1.0, 0.16 + 0.06 * Math.sin(t * 3), 0.1] : [1.0, 0.62, 0.45], radius: 6, intensity: red ? 1.1 : 0.9, shadow: true });
        return;
      }
      const dying = hash01(Math.floor(t * 7) + i * 13) < 0.08 ? 0.15 : 1;   // a strip on its last legs (red accents, no longer the room's only light)
      for (const y of [q.y + 0.12, q.y + q.h - 0.12])
        add({ x: q.x + 0.3, y, z: S.z, x2: q.x + q.w - 0.3, y2: y, z2: S.z, color: S.color, radius: 3.2, intensity: 0.35 * dying, wrap: 0.05, shadow: true });
      // a cold grey fill from above (a dying ceiling panel), tinted by S-7's violet glow while it lives, icy once frozen
      const c = s7c ? s7c[i] : 0, live = s7c ? 1 - c : 0, flick = hash01(Math.floor(t * 5) + i * 31) < 0.03 ? 0.6 : 1;
      add({ x: q.x + q.w / 2, y: q.y + q.h * 0.45, z: 2.6, color: [0.62 + 0.25 * live - 0.1 * c, 0.68 - 0.08 * live + 0.12 * c, 0.9 + 0.1 * c], radius: Math.max(q.w, q.h) * 0.85, intensity: 0.55 * flick, wrap: 0.3, shadow: true });
    });
    const s7 = dk.dock.s7;                            // S-7 (js/culture.js): the heart's pink pulse, the running freezer's cold blue
    if (s7 && typeof s7Geom === 'function') {
      const G = s7Geom(dk.dock.side);
      if (!s7.heartOpen) add({ x: G.heart.x, y: G.heart.y, z: 0.6, color: [1.0, 0.35, 0.85], radius: 3.2, intensity: 0.5 + 0.3 * Math.sin(t * 4) });
      if (s7.freezer) add({ x: G.freezer.x, y: G.freezer.y + 0.6, z: 1.0, color: [0.6, 0.85, 1.0], radius: 4 + 5 * s7.cold[1], intensity: 0.7 + 0.3 * s7.cold[1] });   // (the cold spreads with it)
      g.rooms.forEach((q, i) => { if (s7.cold[i] > 0.05) add({ x: q.x + q.w / 2, y: q.y + q.h / 2, z: 0.4, color: [0.55, 0.8, 1.0], radius: Math.max(q.w, q.h) * 0.7, intensity: 0.45 * s7.cold[i], wrap: 0.4 }); });
    }
    if (!pir) {                                       // the lab's own battery-backed glows: the sample rack on the airlock bench, the monitor on the core bench (js/dock.js DOCK_DECOR.derelict)
      const mx = (x) => dk.dock.side === 'port' ? x : SHIP_W - x;
      add({ x: mx(-9.4), y: g.y - 1.6, z: 1.1, color: [0.45, 1.0, 0.7], radius: 2.6, intensity: 0.45 + 0.05 * Math.sin(t * 3) });
      add({ x: mx(-21.6), y: g.y - 1.9, z: 1.2, color: [0.5, 0.75, 1.0], radius: 2.6, intensity: 0.4 * (hash01(Math.floor(t * 9)) < 0.05 ? 0.3 : 1) });
    }
  }

  // --- ceiling lights (with power; no visible fixture in the cutaway) and the bulkhead lamps on the back walls
  for (const [x, y] of LIGHTS) {
    const k = lamp[colAtX(x)];
    if (k > 0.02) add({ x, y, z: Lt.lamp.z, color: Lt.lamp.color, radius: Lt.lamp.radius, intensity: Lt.lamp.intensity * k * dim, shadow: true });
  }
  if (typeof WALL_LAMPS !== 'undefined') for (const [x, wy] of WALL_LAMPS) {
    const k = lamp[colAtX(x)], W = Lt.wallLamp;
    if (k > 0.02) add({ x, y: wy + 0.2, z: WALL_LAMP_Z, color: Lt.lamp.color, radius: W.radius, intensity: W.intensity * k * dim, wrap: 0.3 });
  }
  // --- emergency strips (without power): low along the wall bases ----------------------------------
  for (const s of emergencyStrips()) {
    const k = clamp(1 - roomColumnLight(s.col) * (storm ? 0.1 : 1), 0, 1);
    if (k < 0.03) continue;
    const S = Lt.strip, hum = 0.94 + 0.06 * Math.sin(t * 2.1 + s.x);
    add({ x: s.x, y: s.y, z: S.z, x2: s.x2, y2: s.y2, z2: S.z, color: S.color, radius: S.radius, intensity: S.intensity * k * k * hum, wrap: 0.05, shadow: true });
  }
  if (lamp.some(k => k < 0.97)) for (const d of DOORWAYS) {        // amber markers at the doors
    const k = 1 - Math.min(lamp[colAtX(d.x - 0.1)], lamp[colAtX(d.x + d.w + 0.1)]);
    if (k > 0.03) add({ x: d.x + d.w / 2, y: d.y + d.h + 0.1, z: 1.9, color: Lt.strip.doorColor, radius: 2.4, intensity: 0.6 * k, wrap: 0.1 });
  }
  // in the dark, the crew's suit lamps: a faint light around each of them (so you can see them)
  if (typeof crew !== 'undefined') for (const c of crew) if (c.mode === 'inside') {
    const k = 1 - lamp[colAtX(c.x)];
    if (k > 0.05) add({ x: c.x, y: c.y + 0.15, z: 1.45, color: [0.75, 0.85, 1.0], radius: 2.6, intensity: 0.4 * k, wrap: 0.3 });
  }
  // helmet lamps (always on): inside, on spacewalks, in the hatch; the shadows keep the beam
  // off what's behind a wall (or under the hull, from outside)
  if (typeof crew !== 'undefined') for (const c of crew) if (c.lamp && standing(c) && c.mode !== 'gun') {
    const H = Lt.helmet, cx = Math.cos(c.face), cy = Math.sin(c.face), out = c.mode === 'eva';
    add({ x: c.x + cx * H.fwd, y: c.y + cy * H.fwd, z: H.z, dir: [cx, cy, out ? H.out.tilt : H.tilt], cone: H.cone, color: H.color, radius: H.radius, intensity: H.intensity, wrap: out ? H.out.wrap : 0.08, shadow: true });
    add({ x: c.x + cx * 0.45, y: c.y + cy * 0.45, z: H.z, color: H.color, radius: 0.9, intensity: H.glow, wrap: 0.4 });
  }
  // flashlights in an ion storm: a spot from each crew member inside, where they face (unless their helmet lamp is on)
  if (storm && typeof crew !== 'undefined') for (const c of crew) if (c.mode === 'inside' && standing(c) && !c.lamp)
    add({ x: c.x + Math.cos(c.face) * 0.3, y: c.y + Math.sin(c.face) * 0.3, z: 1.1, dir: [Math.cos(c.face), Math.sin(c.face), -0.28], cone: 0.42, color: [0.85, 0.92, 1.0], radius: 7, intensity: 1.6, wrap: 0.1, shadow: true });

  // --- alarm beacons: two opposite beams turning on each room's back wall ----------------------------
  if (lvl) for (const r of ROOMS) for (const [bx, by] of BEACONS[r.id] || []) {
    const hot = !A.red && A.fireRooms.has(r.id) ? AT.burning : 1;
    const a = t * lvl.spin + bx * 0.37, I = lvl.beam * hot;
    for (const off of [0, Math.PI]) {
      const c = Math.cos(a + off), s = Math.sin(a + off);
      if (s < -0.35) continue;                         // pointing into the wall it hangs on: hidden by the housing
      add({ x: bx, y: by + AT.out, z: AT.z, dir: [c, s, AT.tilt], cone: AT.cone, color: alarmCol, radius: AT.radius, intensity: I, wrap: 0.05, shadow: true });
    }
    const face = Math.max(Math.sin(a), Math.sin(a + Math.PI));   // the housing glows brightest when a beam faces the camera
    add({ x: bx, y: by + 0.25, z: AT.z, color: alarmCol, radius: 1.6, intensity: (0.5 + 0.9 * face) * hot });
  }

  // --- fires -----------------------------------------------------------------------------------------
  const F = Lt.fire;
  const fireLight = (f, seed) => {
    // (flicker, swell and smothering in step with the flames: js/mission.js fireLook)
    const hp = clamp(f.hp, 0, 1), lk = typeof fireLook === 'function' ? fireLook(f, t) : null;
    const fl = lk ? lk.fl * (0.85 + 0.15 * lk.grow) * (1 - 0.35 * lk.foam) : 0.72 + 0.28 * noise1(t * 11 + seed) + 0.1 * Math.sin(t * 23 + seed);
    add({ x: f.x + 0.08 * Math.sin(t * 7 + seed), y: f.y + 0.06 * Math.cos(t * 9 + seed), z: F.z + 0.12 * noise1(t * 6 + seed * 2),
          color: f.plasma ? F.plasma : F.color, radius: F.radius * (0.7 + 0.3 * hp), intensity: F.intensity * (0.45 + 0.55 * hp) * fl, shadow: true });
  };
  if (typeof fires !== 'undefined') for (const f of fires) if (f.hp > 0) fireLight(f, f.seed || f.x * 3.1);
  if (typeof dk !== 'undefined' && dk.dock) for (const f of dk.dock.fires || []) if (f.hp > 0) fireLight(f, f.x * 2.3 + f.y);

  // --- the reactor: a slow green pulse; overcharged brighter and whiter; broken: sparking -------------
  const R = typeof power !== 'undefined' && power.reactor, Rt = Lt.reactor;
  const rx = REACTOR.x, ry = REACTOR.y + 0.4;
  if (broken(REACTOR)) {
    const rnd = rng(Math.floor(t * 9) + 77);
    if (rnd() < 0.35) add({ x: rx + (rnd() - 0.5) * 2, y: ry + (rnd() - 0.5) * 1.2, z: 1.0 + rnd(), color: [0.75, 0.9, 1.0], radius: 4, intensity: 1.4 + rnd() * 1.6 });
    add({ x: rx, y: ry, z: Rt.z, color: Rt.color, radius: 3, intensity: 0.15 });
  } else if (R && R.fuel > 0 && !(typeof enc !== 'undefined' && enc.scram > 0)) {
    const over = !!power.overcharge, sp = over ? 2.2 : 1;
    const p = 0.5 + 0.5 * Math.sin(t * 2.3 * sp) * Math.sin(t * 0.9 * sp + 1);
    add({ x: rx, y: ry, z: Rt.z, color: over ? Rt.over : Rt.color, radius: Rt.radius * (over ? 1.25 : 1), intensity: Rt.intensity * (over ? 1.7 : 1) * (0.75 + 0.5 * p), shadow: true });
  }

  // --- screens and consoles, capacitors, shield buttons ------------------------------------------------
  for (const s of STATIONS) {                         // the consoles run on their column's power: off (systems/*_off) without it,
    const col = colAtX(s.x), S = Lt.screen;           // just an amber standby LED, so they can still be found in the dark
    if (!lightFx.dark[col]) add({ x: s.x, y: s.y + 0.5, z: S.z, color: S.color, radius: S.radius, intensity: S.intensity * lamp[col] * (0.92 + 0.08 * Math.sin(t * 3 + s.x)) });
    else add({ x: s.x, y: s.y + 0.45, z: 0.85, color: [1.0, 0.6, 0.2], radius: 1.4, intensity: 0.35 * (0.6 + 0.4 * (Math.sin(t * 1.6 + s.x) > 0)) });
  }
  CAPACITORS.forEach((c, i) => {
    if (capBroken(i) || c.charge <= 0) return;
    add({ x: c.x, y: c.y - 0.3, z: 0.9, color: [0.55, 0.85, 1.0], radius: 2.2, intensity: 0.25 + 0.35 * c.charge / (CAP_MAX || 3) + 0.8 * (c.pulse || 0) });
  });
  if (typeof combat !== 'undefined') for (const b of SHIELD_BUTTONS) if (combat.shields[b.side].up > 0)
    add({ x: b.x, y: b.y + 0.3, z: 0.8, color: [0.5, 0.8, 1.0], radius: 2.4, intensity: 0.9 });
  if (typeof combat !== 'undefined' && typeof SHIELD_EMITTERS !== 'undefined') for (const e of SHIELD_EMITTERS) if (combat.shields[e.side].up > 0)   // the emitter outside, projecting
    add({ x: e.x + Math.cos(e.face) * 0.3, y: e.y + Math.sin(e.face) * 0.3, z: 0.5, color: [0.5, 0.82, 1.0], radius: 3.2, intensity: 1.3 + 0.2 * Math.sin(t * 9) });

  // chapter 2's cargo pods (js/invader.js): a faint warm glow from under the membrane, throbbing harder while one stirs;
  // a burst one only glows a little green from its goo
  if (typeof boarding !== 'undefined' && boarding.pods) for (const p of boarding.pods) {
    const stir = p.state === 'stir' && p.t >= 0 ? clamp(p.t / POD_STIR, 0, 1) : 0;
    if (p.state === 'open') add({ x: p.x, y: p.y, z: 0.4, color: [0.55, 1.0, 0.35], radius: 1.8, intensity: 0.3 });
    else add({ x: p.x, y: p.y, z: 0.7, color: [1.0, 0.62, 0.3], radius: 2 + stir, intensity: 0.35 + 0.08 * Math.sin(t * 1.3 + p.id * 2) + stir * (0.5 + 0.5 * Math.sin(t * (8 + 10 * stir))) });
  }

  // --- muzzle flashes, bolts and blasts in flight ------------------------------------------------------
  for (const g of GUNS) if (g.flash > 0)
    add({ x: g.x + Math.cos(g.aim) * 1.2, y: g.y + gunDY(g) + Math.sin(g.aim) * 1.2, z: 0.6 + gunZ(g), color: [1.0, 0.75, 0.45], radius: 5, intensity: 2.6 * g.flash });
  if (typeof boarding !== 'undefined') for (const b of boarding.bolts) {
    if (b.wrench) continue;
    const col = b.owner === 'alien' ? [0.6, 1.0, 0.35] : b.owner === 'saboteur' ? [0.35, 0.88, 1.0] : b.heavy ? [0.6, 0.85, 1.0] : [1.0, 0.32, 0.22];
    add({ x: b.x, y: b.y, z: b.z || 0.9, color: col, radius: b.heavy ? 3.4 : 2.4, intensity: b.heavy ? 2.2 : 1.3 });
  }
  if (typeof crew !== 'undefined') for (const c of crew) if (c.charge != null && typeof BLASTER_CHARGE !== 'undefined') {   // heavy blaster charging
    const k = clamp(c.charge / BLASTER_CHARGE, 0, 1), m = muzzleAt(c);
    add({ x: m.x, y: m.y, z: m.z + 0.1, color: k >= 1 ? [0.6, 0.85, 1.0] : [1.0, 0.7, 0.45], radius: 1.5 + 1.5 * k, intensity: 0.4 + 1.2 * k });
  }
  if (typeof combat !== 'undefined') {
    for (const s of combat.shells) add({ x: s.x, y: s.y, z: Math.max(0.8, 0.3 + shellZ(s)), color: [1.0, 0.85, 0.5], radius: 2.6, intensity: 1.1 });
    for (const s of combat.shots) add({ x: s.x, y: s.y, z: 0.8 + shotZ(s), color: s.heavy ? [1.0, 0.45, 0.78] : [1.0, 0.35, 0.25], radius: s.heavy ? 4.5 : 2.4, intensity: s.heavy ? 2.4 : 1.1 });
    for (const h of combat.shieldHits) { const q = clamp(1 - h.t / 0.8, 0, 1); if (q > 0) add({ x: h.x, y: h.y, z: 0.8, color: [0.7, 0.88, 1.0], radius: h.heavy ? 5 : 3.5, intensity: 2.2 * q }); }
    if (typeof hitFxLights === 'function') hitFxLights(add);   // hull hits: flash, hot spots, spark clouds (js/hitfx.js)
    // explosions and debris: the particles, clustered on a coarse grid
    const cells = new Map();
    for (const p of combat.fx) {
      if (p.life <= 0 || p.foam) continue;           // (extinguisher foam glows only where it's lit: white lights from it lit up whole rooms)
      const w = (p.size || 0.1) * (p.life / (p.max || 1)), key = Math.floor(p.x / 2) * 1000 + Math.floor(p.y / 2);
      let c = cells.get(key);
      if (!c) cells.set(key, c = { x: 0, y: 0, w: 0, r: 0, g: 0, b: 0 });
      const rgb = p.col && p.col[0] === '#' ? hexRgb(p.col) : [1, 0.8, 0.5];
      c.x += p.x * w; c.y += p.y * w; c.w += w; c.r += rgb[0] * w; c.g += rgb[1] * w; c.b += rgb[2] * w;
    }
    [...cells.values()].filter(c => c.w > 0.04).sort((a, b) => b.w - a.w).slice(0, 24).forEach(c => {
      const m = Math.max(c.r, c.g, c.b) || 1;
      add({ x: c.x / c.w, y: c.y / c.w, z: 0.7, color: [c.r / m, c.g / m, c.b / m], radius: Math.min(7, 2.4 + c.w * 3), intensity: Math.min(3.2, c.w * 5) });
    });
    // shields: a soft blue strip along each curtain that's up
    for (const side of ['port', 'front', 'star']) {
      const s = combat.shields[side];
      if (!(s.up > 0)) continue;
      const pts = side === 'front' ? [12, 17, 22.2, 27.4, 32].map(x => [x, shieldYFront(x)]) : [-0.5, 6, 12.5, 19, 25.5].map(y => [shieldX(side, y), y]);
      for (let i = 1; i < pts.length; i++) add({ x: pts[i - 1][0], y: pts[i - 1][1], z: 0.8, x2: pts[i][0], y2: pts[i][1], z2: 0.8, color: [0.45, 0.75, 1.0], radius: 3.2, intensity: 0.6 });
    }
    // enemies: blue weak spots (still whole), engine glow, burning wrecks
    for (const e of combat.enemies) {
      if (e.phase === 'gone') continue;
      if (e.D.stealth && typeof stealthAlpha === 'function' && stealthAlpha(e) < 0.3) continue;
      if (e.phase === 'burning') {
        const [x, y] = [e.x, e.y], fl = 0.7 + 0.3 * noise1(t * 9 + e.x);
        add({ x, y, z: 1.2, color: [1.0, 0.5, 0.2], radius: 3 + (e.D.size?.[1] || 2) * 1.2, intensity: 2.2 * fl * clamp(1 - (e.burnT - 3) / 2, 0, 1) });
        continue;
      }
      for (const p of e.pois) if (!p.hit) {
        const [x, y] = enemyToWorld(e, p.c[0], p.c[1]);
        add({ x, y, z: 0.9, color: [0.35, 0.65, 1.0], radius: 2.4, intensity: 0.7 + 0.25 * Math.sin(t * 3 + p.c[0]) });
      }
      if (e.D.size && !e.D.organic) {
        const [x, y] = enemyToWorld(e, 0, e.D.size[1] + 0.6);
        add({ x, y, z: 0.6, color: [1.0, 0.6, 0.3], radius: 2.5 + e.D.size[0], intensity: 1.0 + 0.2 * noise1(t * 14 + e.x) });
      }
    }
  }
  // the leviathan: glowing spots pulsing down its body, its eye
  if (leviathanPoint(0, 0)) {
    for (let k = 1; k < 16; k += 4) {
      const p = leviathanPoint(-2.5, -26 + k * 3.3), a = 0.35 + 0.45 * Math.max(0, Math.sin(t * 2.5 - k * 0.5));
      add({ x: p[0], y: p[1], z: 1.5, color: [0.48, 0.94, 1.0], radius: 6, intensity: 1.4 * a });
    }
    const eye = leviathanPoint(6.2, 18);
    add({ x: eye[0], y: eye[1], z: 1.5, color: [0.95, 0.78, 0.32], radius: 4, intensity: 1.0 });
  }

  // --- broken systems spark (in step with the 2D sparks of drawBroken), power surges arc -------------
  for (const s of SYSTEMS) if (s.broken) {
    const rnd = rng(Math.floor(t * 5) + s.x * 7);
    if (rnd() < 0.15) add({ x: s.x, y: s.y, z: 0.6, color: [1.0, 0.85, 0.55], radius: 2.8, intensity: 2.2 });
  }
  if (typeof hz !== 'undefined') {
    for (const id of hz.surges || []) {
      const l = LINE[id]; if (!l) continue;
      const rnd = rng(Math.floor(t * 12) + id.length * 31), [ax, ay] = linePoint(l, rnd()), [mx, my] = linePoint(l, 0.5);
      add({ x: ax, y: ay, z: 0.4, color: [0.75, 0.92, 1.0], radius: 3, intensity: 1.2 + 1.2 * hash01(Math.floor(t * 30)) });
      add({ x: mx, y: my, z: 0.4, color: [0.75, 0.92, 1.0], radius: 2.4, intensity: 0.8 + 0.3 * Math.sin(t * 20) });
    }
    if (typeof GRAV_PANELS !== 'undefined') for (const id of hz.noGrav || []) if (Math.sin(t * 6) > 0) {
      const [gx, gy] = GRAV_PANELS[id];
      add({ x: gx, y: gy, z: 0.3, color: [0.48, 0.94, 1.0], radius: 1.8, intensity: 0.8 });
    }
  }
  // energy travelling along the power lines
  if (typeof power !== 'undefined') {
    for (const b of power.bolts) if (b.t < 1 && LINE['feed' + b.to]) { const [x, y] = boltPoint(b); add({ x, y, z: 0.3, color: [1.0, 0.85, 0.45], radius: 2, intensity: 0.9 }); }
    for (const p of power.pulses) if (LINE[p.line]) { const [x, y] = linePoint(LINE[p.line], p.t); add({ x, y, z: 0.3, color: [1.0, 0.85, 0.45], radius: 2, intensity: 0.9 }); }
  }
  // the jump drive spooling up: blue, faster and brighter towards the jump
  // (jumpCharge, js/mission.js: builds over the last seconds of the countdown and while the drive spools;
  // 1 while the ship jumps out), plus a faint blue throb on the floors through the whole ship
  const jc = typeof jumpCharge === 'function' ? jumpCharge() : 0;
  if (jc > 0.02) {
    const k = jc, w = 0.8 + 0.2 * Math.sin(t * (6 + 16 * k));
    add({ x: ENGINE.x, y: 24.6, z: 1.0, color: [0.45, 0.78, 1.0], radius: 4 + 4 * k, intensity: (0.7 + 1.6 * k) * w });
    if (typeof COIL_SPOTS !== 'undefined') for (const c of COIL_SPOTS) add({ x: c.x, y: c.y, z: 0.8, color: [0.45, 0.78, 1.0], radius: 3 + 2 * k, intensity: (0.5 + 1.2 * k) * w });
    for (const r of ROOM_RECTS) add({ x: r.x + r.w / 2, y: r.y + r.h / 2, z: 1.6, color: [0.35, 0.6, 1.0], radius: Math.max(r.w, r.h) * 0.7, intensity: 0.6 * k * k * w, shadow: false });
  }
  // the jump stalled (no energy in MID): a red warning light pulsing at the middle capacitor
  const st = typeof jumpStall === 'function' ? jumpStall() : null;
  if (st) {
    const c = CAPACITORS[1], q = 0.5 + 0.5 * Math.sin(t * (st.phase === 'sputter' ? 22 : 6));
    add({ x: c.x, y: c.y, z: 1.2, color: [1.0, 0.22, 0.12], radius: 3.2, intensity: 0.8 + 1.2 * q, shadow: false });
  }
  // the engine's blue plume: a flickering light behind the stern (the plume frame's brightness, js/art.js
  // engineFlame), out in the plume rather than in the bell: it lights the bell, the stern hull and
  // whoever is out there; brighter and longer while the jump drive spools
  if (typeof engineFlame === 'function') {
    const F = Lt.engine, fl = engineFlame(t), sp = (fl.spool ? F.spool : 1) * (1 + 0.8 * (fl.charge || 0));
    add({ x: ENGINE.x, y: SHIP_H + F.out, z: F.z, x2: ENGINE.x, y2: SHIP_H + F.out + F.len * sp, z2: F.z - 0.2, color: fl.spool ? F.spoolColor : F.color,
          radius: F.radius * (0.9 + 0.1 * sp), intensity: F.intensity * fl.k * sp, wrap: 0.1, shadow: F.shadow });
  }
  // navigation lights on the hull: red left, green right, a white strobe on the nose
  add({ x: -1.6, y: 7.0, z: 0.6, color: [1.0, 0.15, 0.1], radius: 2.2, intensity: 0.5 + 0.4 * (Math.sin(t * 2) > 0) });
  add({ x: 46.0, y: 7.0, z: 0.6, color: [0.2, 1.0, 0.35], radius: 2.2, intensity: 0.5 + 0.4 * (Math.sin(t * 2) > 0) });
  if ((t % 1.6) < 0.08) add({ x: 22.2, y: -3.2, z: 0.6, color: [1, 1, 1], radius: 3.5, intensity: 2.0 });

  if (typeof useLights === 'function') for (const l of useLights()) add(l);   // what E would act on: lit a little (js/systems.js)
  if (typeof airlockLighting === 'function') {      // the outer airlocks: the chamber's state light, lamps in the room's corners beside it (js/airlock.js)
    const L = airlockLighting(t, lamp);
    for (const q of L.areas) areas.push({ ...q, color: mix3(Lt.roomDark, Lt.roomLit, q.k * (0.6 + 0.4 * dim)), sun: 0 });
    for (const l of L.lights) add(l);
  }

  // --- outside: the distant star (a solar flare makes it glare) ---------------------------------------
  let sunCol = Lt.sun.color, outside = Lt.outside;
  if (flare?.phase === 'rad') { sunCol = [1.6, 1.4, 1.1]; outside = [0.6, 0.55, 0.5]; }
  else if (flare?.phase === 'warn') sunCol = addTo(sunCol, [0.4, 0.2, 0.0], 0.5 + 0.5 * Math.sin(t * 6));
  const strobe = lvl && lvl.strobe ? lvl.strobe * Math.max(0, Math.sin(t * 2.2)) ** 4 : 0;
  return { ambient: outside, sun: { dir: Lt.sun.dir, color: sunCol, k: 1 }, areas, lights, walls: lightWalls(),
           grade: strobe ? [1 + strobe, 1 - strobe * 0.6, 1 - strobe * 0.6] : null };
}
