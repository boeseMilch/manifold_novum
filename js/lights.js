// This frame's lighting for the sprite renderer (js/gfx.js): the one place that decides what is lit
// and how. Only used when GFX.on (the classic look keeps drawLights / drawLightPools).
//
// gameLighting(t) returns { ambient, sun, areas, lights } for GFX.lighting():
//   ambient  [r, g, b]  outside every area (space, the hull)
//   sun      { dir: [x, y, z] (towards the light; x right, y down the screen, z up), color, k }
//   areas    [{ x, y, w, h, color: [r, g, b], sun }]  ambient per area; the last one containing a
//            pixel wins (soft edges). Rooms are grown by half a wall so the walls go dark with them.
//   lights   [{ x, y, z, color: [r, g, b], radius, intensity }]  point lights (layout units)
// 1 = the sprite as rendered in Blender; the beauty pass already has its key light baked in.
//
// Default (to be refined by the lighting pass): a room column is lit while its capacitor holds
// charge and isn't broken (lightLevel in js/systems.js fades it), with the warm ceiling lamps
// (LIGHTS in js/interior.js) at 2.0 above the floor; dark columns get a dim red emergency ambient.
// The reactor glows green while it runs.

const LIGHT_TUNING = {
  outside: [0.92, 0.94, 1.0],                     // hull and space
  sun: { dir: [0.55, 0.45, 0.75], color: [0.18, 0.17, 0.15] },
  roomLit: [0.66, 0.66, 0.7],                     // room ambient with power
  roomDark: [0.2, 0.08, 0.09],                    // emergency lighting
  spine: [0.62, 0.62, 0.66],                      // the block between the decks (deck airlocks)
  lamp: { z: 2.0, radius: 6.2, intensity: 0.75, color: [1.0, 0.82, 0.62] },
  reactor: { z: 1.4, radius: 5.0, intensity: 0.9, color: [0.55, 1.0, 0.4] },
};

function roomColumnLight(col) {
  return typeof lightLevel !== 'undefined' ? clamp(lightLevel[col], 0, 1) : 1;
}

function gameLighting(t) {
  const Lt = LIGHT_TUNING, areas = [], lights = [];
  const mix3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  for (const r of ROOMS) {
    const k = roomColumnLight(r.col), color = mix3(Lt.roomDark, Lt.roomLit, k);
    for (const q of r.rects) areas.push({ x: q.x - 0.3, y: q.y - 0.3, w: q.w + 0.6, h: q.h + 0.6, color, sun: 0 });
  }
  for (const L of DECK_LOCKS) {
    const k = roomColumnLight(L.col);
    areas.push({ x: L.x - 0.6, y: SPINE_Y0, w: L.w + 1.2, h: SPINE, color: mix3(Lt.roomDark, Lt.spine, k), sun: 0 });
  }
  for (const [x, y] of LIGHTS) {
    const col = x < COLS[1].x ? 0 : x < COLS[2].x ? 1 : 2, k = roomColumnLight(col);
    if (k > 0.02) lights.push({ x, y, z: Lt.lamp.z, color: Lt.lamp.color, radius: Lt.lamp.radius, intensity: Lt.lamp.intensity * k });
  }
  const R = typeof power !== 'undefined' && power.reactor;
  if (R && R.fuel > 0 && !broken(REACTOR) && !(typeof enc !== 'undefined' && enc.scram > 0)) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1);
    lights.push({ x: REACTOR.x, y: REACTOR.y + 0.4, z: Lt.reactor.z, color: Lt.reactor.color, radius: Lt.reactor.radius, intensity: Lt.reactor.intensity * (0.75 + 0.5 * pulse) });
  }
  for (const g of GUNS) if (g.flash > 0)            // muzzle flashes
    lights.push({ x: g.x + Math.cos(g.aim) * 1.2, y: g.y + Math.sin(g.aim) * 1.2, z: 0.6, color: [1.0, 0.75, 0.45], radius: 4.5, intensity: 2.2 * g.flash });
  return { ambient: Lt.outside, sun: { dir: Lt.sun.dir, color: Lt.sun.color, k: 1 }, areas, lights };
}
