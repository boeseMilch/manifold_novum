// What the game draws with the sprite renderer (js/gfx.js), and where. Each draw function here
// replaces an old 2D one when GFX.on; if its sprites aren't loaded yet it returns false and the
// caller draws the old 2D version instead (render() in js/game.js), so nothing ever disappears.
//
// Converted so far: the hull body, floors, walls (built from the room layout in js/ship.js), the
// spine, the deck doors, the doors between rooms, the outer airlock hatches (inside view) and
// the crew. Sprite names and origins: the model scripts' headers in tools/blender/models/<group>/.

// ---------------------------------------------------------------------------------------------
// Walls, from the room layout. The walls are the 0.6 wide gaps around the floor rectangles:
//   back walls  (a room's north edge): full height (1.6), ship/wall_h, origin = left end at the
//               bottom of the front face (the room's edge); the body lies north of it
//   near walls  (a room's south edge): cut down to 0.35 so they don't hide the room, ship/wall_h_low,
//               origin at the south face (edge + 0.6)
//   up-down walls: ship/wall_v tiles (the top strip; origin = north end, wall centre), stepping down
//               (interior/wall_v_step) to ship/wall_v_low ~1.4 before a near wall (the cutaway rule)
//   junctions:  interior/wall_j_[low_]<arms> where walls meet (arms = the directions they continue)
// The spine (between the decks) is its own block (interior/spine_*), with the deck doors' passages through it.
// ---------------------------------------------------------------------------------------------
const WALL_T = 0.6, H_LOW = 0.35, SPINE_HI = 12.549;   // spine: high block from 12.549 (see models/interior/structure.py)
let WALLS = null;
function buildWalls() {
  const floors = FLOOR_RECTS, E = 1e-6;
  const isFloor = (x, y) => floors.some(r => x > r.x + E && x < r.x + r.w - E && y > r.y + E && y < r.y + r.h - E);
  const intervals = (a, b, cuts, test) => {                // parts of [a, b] where test(mid) holds
    const pts = [...new Set([a, b, ...cuts.filter(c => c > a && c < b)])].sort((p, q) => p - q), out = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      if (!test((pts[i] + pts[i + 1]) / 2)) continue;
      if (out.length && Math.abs(out[out.length - 1][1] - pts[i]) < E) out[out.length - 1][1] = pts[i + 1];
      else out.push([pts[i], pts[i + 1]]);
    }
    return out;
  };
  const xs = floors.flatMap(r => [r.x, r.x + r.w]), ys = floors.flatMap(r => [r.y, r.y + r.h]);
  const H = [], V = [];
  // (the outer airlocks' chambers too: walled in like a room, but low on both ends, so you see into them: their
  // north wall is the near wall of the room piece above, the south one their own near wall, not the back wall of
  // the room piece below; the inner door's strip counts too: the south wall runs on under its jamb, 2026-10-22)
  const chambers = HATCHES.flatMap(h => [h.chamber, h.inner]), inBlock = (x, y) => Object.values(OL_BLOCK).some(b => inRect(x, y, b, -E));
  for (const r of [...ROOM_RECTS, ...chambers]) {
    const x0 = r.x, x1 = r.x + r.w, y0 = r.y, y1 = r.y + r.h, chamber = chambers.includes(r);
    if (Math.abs(y0 - SPINE_Y1) > E && !chamber) for (const [a, b] of intervals(x0, x1, xs, x => !isFloor(x, y0 - 0.05) && !inBlock(x, y0 - 0.3)))
      H.push({ kind: 'back', y: y0, x0: isFloor(a - 0.05, y0 + 0.05) ? a : a - WALL_T, x1: isFloor(b + 0.05, y0 + 0.05) ? b : b + WALL_T });
    if (Math.abs(y1 - SPINE_Y0) > E) for (const [a, b] of intervals(x0, x1, xs, x => !isFloor(x, y1 + 0.05)))
      H.push({ kind: 'near', y: y1, x0: isFloor(a - 0.05, y1 - 0.05) ? a : a - WALL_T, x1: isFloor(b + 0.05, y1 - 0.05) ? b : b + WALL_T });
    for (const [ex, out, inside] of [[x0, x0 - 0.05, x0 + 0.05], [x1, x1 + 0.05, x1 - 0.05]]) {
      for (const [a, b] of intervals(y0, y1, ys, y => !isFloor(out, y))) {
        const top = Math.abs(a - SPINE_Y1) < E ? a : isFloor(inside, a - 0.05) ? a : a - WALL_T;
        const bot = Math.abs(b - SPINE_Y0) < E ? SPINE_HI : isFloor(inside, b + 0.05) ? b : b + WALL_T;
        V.push({ x: ex === x0 ? x0 - WALL_T / 2 : x1 + WALL_T / 2, y0: top, y1: bot, toSpine: Math.abs(b - SPINE_Y0) < E });
      }
    }
  }
  // merge runs on the same line
  const merge = (runs, key, a, b) => {
    const out = [];
    for (const r of runs.sort((p, q) => p[key] - q[key] || p[a] - q[a])) {
      const last = out[out.length - 1];
      if (last && Math.abs(last[key] - r[key]) < E && (key !== 'y' || last.kind === r.kind) && r[a] <= last[b] + E) {
        last[b] = Math.max(last[b], r[b]); last.toSpine = last.toSpine || r.toSpine;
      } else out.push({ ...r });
    }
    return out;
  };
  const hRuns = merge(H, 'y', 'x0', 'x1');
  let vRuns = merge(V, 'x', 'y0', 'y1');
  // openings: doors (the frame sprite brings the jamb ends) and the outer airlock hatches
  const cuts = [
    ...DOORWAYS.map(d => ({ x: d.x + d.w / 2, a: d.y - 0.6, b: d.y + d.h + 0.2 })),
    ...HATCHES.map(h => ({ x: h.x - h.dir * 0.3, a: h.y - 0.9 - 0.6, b: h.y + 0.9 + 0.26 })),
    ...HATCHES.map(h => ({ x: h.inner.x + h.inner.w / 2, a: h.inner.y - 0.6, b: h.inner.y + h.inner.h + 0.2 })),   // (their inner doors)
  ];
  for (const c of cuts) vRuns = vRuns.flatMap(r => {
    if (Math.abs(r.x - c.x) > E || c.b <= r.y0 || c.a >= r.y1) return [r];
    return [{ ...r, y1: c.a, cutEnd: true }, { ...r, y0: c.b }].filter(q => q.y1 - q.y0 > 0.05);
  });
  // junctions: where a horizontal run's body crosses an up-down run
  const J = [];
  for (const h of hRuns) for (const v of vRuns) {
    const sx0 = v.x - WALL_T / 2, sx1 = v.x + WALL_T / 2, sy0 = h.kind === 'back' ? h.y - WALL_T : h.y, sy1 = sy0 + WALL_T;
    if (h.x0 > sx0 + E || h.x1 < sx1 - E || v.y0 > sy0 + E || v.y1 < sy1 - E) continue;
    const arms = (v.y0 < sy0 - E ? 'n' : '') + (h.x1 > sx1 + E ? 'e' : '') + (v.y1 > sy1 + E ? 's' : '') + (h.x0 < sx0 - E ? 'w' : '');
    J.push({ x: v.x, y: sy1, low: h.kind === 'near', arms, v });
  }
  // where each up-down run steps down to the low height: at its first near-wall junction, and at
  // the latest 1.4 before a south end that meets a near wall
  for (const v of vRuns) {
    const near = J.filter(j => j.v === v && j.low);
    v.step = Math.min(Infinity, ...near.map(j => j.y - WALL_T), ...near.filter(j => Math.abs(j.y - v.y1) < 1e-6).map(j => j.y - 1.4));
    if (v.toSpine && Math.abs(v.y1 - SPINE_HI) < E) v.step = Infinity;
  }
  return { hRuns, vRuns, J };
}

// Tiles a sprite along x from x0 to x1 (period `per`, origin at each tile's left end), clipped at both ends:
// adds [name, x, y, options] to `out`.
function tileX(out, name, x0, x1, y, per, o) {
  for (let x = x0; x < x1 - 1e-4; x += per) out.push([name, x, y, { layer: 'wall', ...o, clip: [x0, null, x1, null] }]);
}
// The pieces set into a wall run (junction squares, the step down to the low height, door and hatch frames
// with their panels) overlap the run's wall tiles at the same height: with equal depths the depth test picked
// per pixel, and which one won flipped with the camera's sub-pixel position and zoom (z-fighting: a dark band
// under the hull's corner posts, the pipes under the outer airlocks, blinking as you moved past). PIECE_BIAS
// (depth units, a cm or two: well under the gap to anything in front of a wall): the piece always wins.
const PIECE_BIAS = 0.02;
// The walls don't change: their pieces ([name, x, y, sprite options], in drawing order) are worked out once.
let wallPieces = null;
function drawWallSprites() {
  if (!WALLS) WALLS = buildWalls();
  if (!wallPieces) wallPieces = buildWallPieces();
  for (const [name, x, y, o] of wallPieces) GFX.sprite(name, 0, x, y, 0, o);
}
function buildWallPieces() {
  const out = [];
  const hInfo = GFX.info('ship/wall_h'), hLowInfo = GFX.info('ship/wall_h_low'), vInfo = GFX.info('ship/wall_v');
  const PV = (vInfo && vInfo.pitch) || 1.00625;
  for (const h of WALLS.hRuns) {
    const back = h.kind === 'back', y = back ? h.y : h.y + WALL_T, name = back ? 'ship/wall_h' : 'ship/wall_h_low';
    const per = ((back ? hInfo : hLowInfo)?.tile || [1])[0] || 1;
    tileX(out, name, h.x0, h.x1, y, per, { layer: 'wall', sortY: back ? h.y - 0.3 : h.y + 0.3 });
  }
  for (const v of WALLS.vRuns) {
    const step = clamp(v.step, v.y0, v.y1);
    // full height north of the step, low south of it; tiles are the top strip, clipped at the ends
    for (const [name, a, b, hz] of [['ship/wall_v', v.y0, step, 1.6], ['ship/wall_v_low', step, v.y1, H_LOW]]) {
      for (let y = a; y < b - 1e-4; y += PV) out.push([name, v.x, y, { layer: 'wall', clip: [null, y, null, Math.min(y + PV, b), hz], sortY: y + PV / 2 }]);
    }
    if (v.step > v.y0 + 0.05 && v.step < v.y1 - 0.05) out.push(['interior/wall_v_step', v.x, v.step, { layer: 'wall', sortY: v.step + 0.01, depthBias: PIECE_BIAS }]);
  }
  // (the junction square is also covered by the wall tiles running through it: PIECE_BIAS)
  for (const j of WALLS.J) {
    const name = `interior/wall_j_${j.low ? 'low_' : ''}${j.arms}`;
    if (j.arms && GFX.has(name)) out.push([name, j.x, j.y, { layer: 'wall', sortY: j.y - 0.3 + 0.002, depthBias: PIECE_BIAS }]);
  }
  return out;
}

// The spine between the decks (interior/spine_a/b, 2 units per tile, origin at y = SPINE_Y1), with
// the deck doors cut out (their sprites bring the spine ends next to the passage); the deck stencils on top.
let spinePieces = null;                               // (worked out once, like the walls')
function drawSpineSprites() {
  if (!spinePieces) spinePieces = buildSpinePieces();
  for (const [name, x, y, o] of spinePieces) GFX.sprite(name, 0, x, y, 0, o);
}
function buildSpinePieces() {
  const out = [];
  const gaps = DECK_DOORS.map(d => [d.x - 0.6, d.x + d.w + 0.6]).sort((a, b) => a[0] - b[0]);
  let x = 0;
  const segs = [];
  for (const [a, b] of gaps) { segs.push([x, a]); x = b; }
  segs.push([x, SHIP_W]);
  for (const [a, b] of segs) {
    for (let t = Math.floor(a / 2) * 2; t < b - 1e-4; t += 2) {
      const name = hash2(t, 7) < 0.5 ? 'interior/spine_a' : 'interior/spine_b';
      out.push([name, t, SPINE_Y1, { layer: 'wall', clip: [Math.max(a, t), null, Math.min(b, t + 2), null], sortY: SPINE_Y1 - 0.3 }]);
    }
    // one DECK 2 stencil on the top per segment (interior/spine_label), mid-segment and clear of the wall
    // lamps and the toilet sign below its front edge (never cut by a deck door's gap)
    if (b - a < 3) continue;
    const busy = [...WALL_LAMPS.filter(([, wy]) => wy === SPINE_Y1).map(([lx]) => [lx, 0.8]), [12.45, 1.5]];
    const mid = (a + b) / 2, lx = [0, -1, 1, -2, 2, -3, 3].map(d => mid + d).find(x => x > a + 0.8 && x < b - 0.8 && busy.every(([bx, r]) => Math.abs(x - bx) >= r));
    if (lx != null) out.push(['interior/spine_label', lx, SPINE_Y1, { layer: 'wall', sortY: SPINE_Y1 - 0.3 + 0.001, depthBias: 0.02 }]);
  }
  return out;
}

// Deck doors (tools/blender/models/interior/deckdoor.py): the passage through the spine (base: its floor, the spine
// ends, the roof over the passage with the header, the lamps and the beacons by state) and the sliding door, set in
// the spine's front face (local y -0.22) under the header, its leaves as tall as the wall.
function drawDeckDoorSprite(d, t) {
  const b = doorBroken(d), k = clamp(d.open, 0, 1);
  const base = b ? `interior/deckdoor_broken_f${Math.floor(t * 6) % 2}` : d.blast ? `interior/deckdoor_blast_f${Math.floor(t * 4) % 4}`
    : d.locked ? 'interior/deckdoor_locked' : k > 0.05 ? 'interior/deckdoor_open' : 'interior/deckdoor_closed';
  if (!GFX.ready(base)) return false;
  GFX.sprite(base, 0, d.x, SPINE_Y1, 0, { layer: 'wall', sortY: SPINE_Y0, emissive: 0.6 });
  const door = b && d.jammed && k > 0.95 ? 'interior/deckdoor_door_forced' : k < 0.05 && d.blast ? 'interior/deckdoor_door_blast'
    : k < 0.05 && d.locked ? 'interior/deckdoor_door_locked' : `interior/deckdoor_door_f${Math.round(k * 5)}`;
  GFX.sprite(door, 0, d.x, SPINE_Y1, 0, { layer: 'wall', sortY: SPINE_Y1 - 0.22, emissive: 0.4 });
  return true;
}

// Doors between rooms (in up-down walls): frame (lamp by state) + the sliding panels.
function drawDoorSprites(t) {
  if (!GFX.ready('interior/door_v_frame')) return false;
  for (const d of DOORWAYS) {
    const x = d.x + d.w / 2, k = Math.round(clamp(d.open, 0, 1) * 5);
    const frame = d.blast ? `interior/door_v_frame_blast_f${Math.floor(t * 4) % 4}` : d.locked ? 'interior/door_v_frame_locked' : 'interior/door_v_frame';
    const panels = d.blast ? `interior/door_v_blast_f${k}` : d.locked ? `interior/door_v_locked_f${k}` : `interior/door_v_f${k}`;
    GFX.sprite(frame, 0, x, d.y, 0, { layer: 'wall', sortY: d.y + d.h / 2, emissive: 0.6, depthBias: PIECE_BIAS });
    GFX.sprite(panels, 0, x, d.y, 0, { layer: 'wall', sortY: d.y + d.h / 2 + 0.01, depthBias: PIECE_BIAS });
  }
  return true;
}

// (The outer airlocks, chamber, doors and all: js/airlock.js drawAirlockSprites.)

// Floors: every floor rect tiled with the 2 x 2 tiles of its zone (variants mixed by a hash of the
// tile's place on one ship-wide grid, so the seams line up), clipped to the rect. Doorways get tread.
// The tiles are clean renders: scratches, gouges and duct tape are drawn on them per pixel by
// js/gfx.js (FLOOR_WEAR), seeded by the world position, so no two tiles look alike. Each tile passes
// its layout (which plate cells are tread / grille) and the wear field at its four corners: a base per
// room (busy rooms more, doorways most) plus more where people walk (doorways, deck airlocks, outer
// hatches, consoles, the reactor). floor: [layout, wear top-left, top-right, bottom-left, bottom-right].
// With path scratches on (GFX.pathScratches), also the walk field of its four plate cells (same order).
const hash2 = (a, b) => { let h = Math.imul(Math.round(a * 10) | 0, 374761393) ^ Math.imul(Math.round(b * 10) | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const FLOOR_ROOM_WEAR = { bridge: 1.25, reactor: 1.2, portGun: 1.0, starGun: 1.0, portLock: 1.05, starLock: 1.05 };
const FLOOR_LAYOUT = { 'ship/floor': 1, 'ship/floor_b': 2, 'interior/floor_tread': 3 };
let floorWearSpots = null;
function floorWear(base, x, y) {
  if (!floorWearSpots) floorWearSpots = [
    ...DOORWAYS.map(d => [d.x + d.w / 2, d.y + d.h / 2, 1.1, 5]),
    ...DECK_DOORS.flatMap(d => [[d.x + d.w / 2, SPINE_Y0, 0.9, 4], [d.x + d.w / 2, SPINE_Y1, 0.9, 4]]),
    ...HATCHES.map(h => [h.inside[0], h.inside[1], 0.8, 4]),
    ...HATCHES.map(h => [h.chamber.x + h.chamber.w / 2, h.y, 0.9, 2]),   // (the outer airlocks' chambers)
    ...STATIONS.map(s => [s.x, s.y + 1, 0.9, 3]),
    [REACTOR.x, REACTOR.y + REACTOR.h / 2 + 0.6, 0.6, 5],
  ];
  let w = base;
  for (const [sx, sy, k, r2] of floorWearSpots) { const dx = x - sx, dy = y - sy; w += k * Math.exp(-(dx * dx + dy * dy) / r2); }
  return Math.min(w, 2.6);
}
const floorCache = new Map();
// Each floor rect's plates, worked out once (the rects don't change): [name, tx, ty, sprite options] each.
function floorTiles(r) {
  let tiles = floorCache.get(r);
  if (tiles) return tiles;
  const small = Math.min(r.w, r.h) < 3 && !ROOM_RECTS.includes(r), zone = zoneAtX(r.x + 0.01).name;   // (doorways get tread; a room's narrow corner beside an outer airlock doesn't)
  const room = ROOMS.find(R => R.rects.includes(r)), base = room ? FLOOR_ROOM_WEAR[room.id] || 1 : 1.5;
  floorCache.set(r, tiles = []);
  for (let ty = Math.floor(r.y / 2) * 2; ty < r.y + r.h - 1e-4; ty += 2) for (let tx = Math.floor(r.x / 2) * 2; tx < r.x + r.w - 1e-4; tx += 2) {
    const h = hash2(tx, ty);
    const name = small ? 'interior/floor_tread' : h < 0.08 ? (h < 0.04 ? 'ship/floor' : 'ship/floor_b') : h < 0.54 ? `interior/floor_${zone}_a` : `interior/floor_${zone}_b`;
    const floor = [FLOOR_LAYOUT[name] || (name.endsWith('_b') ? 2 : 1), floorWear(base, tx, ty), floorWear(base, tx + 2, ty), floorWear(base, tx, ty + 2), floorWear(base, tx + 2, ty + 2)];
    tiles.push([name, tx, ty, { layer: 'ground', floor, clip: [Math.max(r.x, tx), Math.max(r.y, ty), Math.min(r.x + r.w, tx + 2), Math.min(r.y + r.h, ty + 2)] }]);
  }
  return tiles;
}
function drawFloorSprites() {
  if (!GFX.ready('interior/floor_white_a')) return false;
  const walk = GFX.pathScratches && typeof walkFieldPacked === 'function';
  const lockFloor = GFX.ready('interior/outerlock_port_floor_air');   // (the outer airlocks' chambers have a floor plate of their own: js/airlock.js)
  for (const rs of [ROOM_RECTS, DOORWAYS, HATCHES.flatMap(h => lockFloor ? [h.inner] : [h.chamber, h.inner])]) for (const r of rs) {
    if (!GFX.onScreen(r.x + r.w / 2, r.y + r.h / 2, 0, Math.hypot(r.w, r.h) / 2 + 3)) continue;   // (the whole rect off screen)
    for (const [name, tx, ty, o] of floorTiles(r)) {
      const floor = o.floor;
      if (floor.length === 5 && walk) floor.push(walkFieldPacked(tx, ty), walkFieldPacked(tx + 1, ty), walkFieldPacked(tx, ty + 1), walkFieldPacked(tx + 1, ty + 1));   // + where the crew walk (js/walkfield.js)
      GFX.sprite(name, 0, tx, ty, 0, o);
    }
  }
  return true;
}

// The hull body: screen tiles that all go at ship-local (0, 0) (each brings its own offset).
function drawHullSprites() {
  const idx = GFX.info('hull/body');
  if (!idx || !idx.tiles || !idx.tiles.every(n => !GFX.has(n) || GFX.ready(n))) return false;
  for (const n of idx.tiles) GFX.sprite(n, 0, 0, 0, 0, { layer: 'ground' });
  return true;
}

// The structure of the ship in sprites (called by render() before the 2D layers). Returns which
// parts it drew, so render() draws the old 2D version of the rest.
function drawShipSprites(t) {
  const done = { hull: drawHullSprites(), floors: drawFloorSprites(), walls: false, locks: false, doors: false, hatches: false };
  if (GFX.ready('ship/wall_h') && GFX.ready('interior/spine_a')) { drawWallSprites(); drawSpineSprites(); done.walls = true; }
  done.locks = GFX.ready('interior/deckdoor_closed') && DECK_DOORS.map(d => drawDeckDoorSprite(d, t)).every(Boolean);
  done.doors = drawDoorSprites(t);
  done.hatches = drawAirlockSprites(t);              // (the outer airlocks: js/airlock.js)
  return done;
}

// ---------------------------------------------------------------------------------------------
// Crew (tools/blender/models/crew/crew.py): 16 facings from c.face; the suit colour through the tint
// mask. Visor down (vacuum): crew/visor (the gold visor alone, per facing) over the frame at its
// `head` offset (the head keeps its orientation in every standing pose); lying down: crew/down_visor.
//   crew/idle                 standing, feet together
//   crew/run, back, strafe    gait cycles relative to the facing: forward, backwards, sideways to the
//                             left (played in reverse: to the right). Each entry's `stride` is how far
//                             one cycle carries you, so the legs keep pace with the ground.
//   crew/settle               stopping: from the passing pose (phase 0 / 0.5) to idle, `per` frames each
//   crew/visor                the visor overlay (see above)
//   crew/down                 down / out (out = greyed and faded)
// The animation is worked out here, per crew member, from what every client has: c.walk advancing
// (it's in every snapshot; on the treadmill it advances while you stay put) says whether the legs go
// and how fast, the drawn position's change says which way. When they stop, the cycle runs on to the
// next passing pose and settles into idle, so no mid-stride frame sticks. Worn gear
// (crew/gear_<id>_<set>, from c.kit via perk(); the vest only while c.armor > 0) goes over the body
// with the same frame, far pieces first (`depth`).
// ---------------------------------------------------------------------------------------------
const crewAnim = new Map();
const CREW_GEAR = ['boots', 'thrusters', 'armor', 'toolbelt', 'firstAid', 'stim'];
const WALK_PER_UNIT = 3.2;                          // c.walk per unit walked (js/game.js updateCrew)
const GAIT_REL = { run: 0, back: Math.PI, strafeL: -Math.PI / 2, strafeR: Math.PI / 2 };   // walking direction - facing
const SETTLE_STEP = 0.05;                           // s per settle frame
function crewGait(cur, rel) {
  const off = (g) => Math.abs(wrapAngle(rel - GAIT_REL[g]));
  if (cur && off(cur) < Math.PI / 4 + 0.2) return cur;     // (hysteresis: no flicker on the diagonals)
  return Object.keys(GAIT_REL).reduce((b, g) => (off(g) < off(b) ? g : b), 'run');
}
// What to draw for crew member c this frame: { set: 'idle' | 'run' | 'back' | 'strafe' | 'settle', f }.
function crewPose(c, t) {
  let a = crewAnim.get(c.id);
  if (!a) crewAnim.set(c.id, a = { t, src: c.walk, srcT: t, rate: 0, peak: 0, x: c.x, y: c.y, vx: 0, vy: 0, rx: 0, ry: 0, p: 0, prate: 0, gait: 'run', mode: 'idle', settle: 0, side: 0 });
  const dt = clamp(t - a.t, 0, 0.1); a.t = t;
  if (c.walk !== a.src) {                           // walk rate (smoothed: remote crew update at the snapshot rate)
    const gap = t - a.srcT, r = gap > 1e-3 && gap < 0.3 ? Math.max(0, c.walk - a.src) / gap : a.rate;
    a.rate = lerp(a.rate, r, 0.5); a.src = c.walk; a.srcT = t;
  } else if (t - a.srcT > 0.12) a.rate = 0;
  if (dt > 0) {                                     // which way the drawn crew member moves
    const k = 1 - Math.exp(-15 * dt), jump = Math.hypot(c.x - a.x, c.y - a.y) > 1.5;
    if (!jump) { a.rx = (c.x - a.x) / dt; a.ry = (c.y - a.y) / dt; a.vx = lerp(a.vx, a.rx, k); a.vy = lerp(a.vy, a.ry, k); }
    a.x = c.x; a.y = c.y;
  }
  const info = (g) => GFX.info('crew/' + (g.startsWith('strafe') ? 'strafe' : g));
  a.peak = Math.max(a.rate, a.peak * Math.exp(-dt));                // stopping: the rate falls well below its recent peak
  const moving = a.rate > (a.mode === 'move' ? Math.max(0.9, 0.35 * a.peak) : Math.max(1.3, 0.6 * a.peak));   // walk/s (not the long tail of slowing down)
  if (moving) {
    if (a.mode !== 'move') { a.p = a.mode === 'stop' ? a.p : a.mode === 'settle' ? a.side * 0.5 : 0; a.mode = 'move'; }
    const [vx, vy] = Math.hypot(a.vx, a.vy) > 0.3 ? [a.vx, a.vy] : [a.rx, a.ry];   // (just starting: the raw velocity)
    if (Math.hypot(vx, vy) > 0.05) a.gait = crewGait(a.gait, wrapAngle(Math.atan2(vy, vx) - c.face));
    a.prate = a.rate / WALK_PER_UNIT / (info(a.gait)?.stride || 1.2);  // cycles per second: the feet keep pace with the floor
    a.p = (a.p + a.prate * dt) % 1;
  } else if (a.mode === 'move' || a.mode === 'stop') {                  // run on to the next passing pose, then settle
    const next = a.p < 0.5 ? 0.5 : 1, np = a.p + Math.max(a.prate, 2.2) * dt;
    if (a.mode === 'move' && a.p % 0.5 < 0.1) { a.side = a.p < 0.5 ? 0 : 1; a.p = a.side * 0.5; a.mode = 'settle'; a.settle = 0; }   // just past one: settle from there
    else if (np >= next) { a.side = next === 0.5 ? 1 : 0; a.p = next % 1; a.mode = 'settle'; a.settle = 0; }
    else { a.p = np; a.mode = 'stop'; }
  } else if (a.mode === 'settle') {
    a.settle += dt;
    if (a.settle >= SETTLE_STEP * (GFX.info('crew/settle')?.per || 3)) a.mode = 'idle';
  }
  if (a.mode === 'move' || a.mode === 'stop') {
    const set = a.gait.startsWith('strafe') ? 'strafe' : a.gait, n = info(a.gait)?.frames || 1;
    const p = a.gait === 'strafeR' ? 1 - a.p : a.p;              // strafe right: the left cycle backwards
    return { set, f: Math.round(p * n) % n };
  }
  if (a.mode === 'settle') {
    const per = GFX.info('crew/settle')?.per || 3;
    return { set: 'settle', f: a.side * per + Math.min(per - 1, Math.floor(a.settle / SETTLE_STEP)) };
  }
  return { set: 'idle', f: 0 };
}
// The suit trim's tint. White paint on the white suit would look untinted: brighter than white instead,
// so the trim shines (and the sprite's emissive makes it glow a little).
const suitTint = (col) => {
  if (typeof col !== 'string' || !/^#[0-9a-f]{6}$/i.test(col)) return col;
  const v = [1, 3, 5].map(i => parseInt(col.substr(i, 2), 16) / 255);
  return 0.3 * v[0] + 0.55 * v[1] + 0.15 * v[2] > 0.8 ? [1.55, 1.55, 1.6] : col;
};
function drawCrewSprite(c, visor, t) {
  const down = c.health === 'down' || c.health === 'out';
  if (down && !GFX.has('crew/down')) return false;
  if (!GFX.ready('crew/idle')) return false;
  const tint = down && c.health === 'out' ? '#7a7f8a' : suitTint(c.color), V = visor ? '_visor' : '';
  let pose, f = 0;
  if (down) pose = 'down';
  else ({ set: pose, f } = crewPose(c, t));
  let name = `crew/${pose}${V}`;
  if (!GFX.has(name)) name = `crew/${pose}`;
  if (!GFX.has(name)) { name = `crew/idle${V}`; pose = 'idle'; f = 0; }
  const out = c.health === 'out', k = GFX.frameIndex(name, c.face, f), gz = c.mode === 'gun' ? gunZ(c.gun) : 0, [gx, gy] = c.mode === 'gun' ? gunnerAt(c) : [c.x, c.y], bias = c.mode === 'gun' ? gunBias(c.gun) : 0, alpha = out ? 0.85 : 1;
  const desat = out ? 0.75 : 0;                     // out cold: suit, visor and worn gear all greyed
  if (!GFX.sprite(name, k, gx, gy, gz, { tint, emissive: out ? 0.15 : 0.4, pick: down ? [0.6, 0.7] : [0.32, 1.25], alpha, depthBias: bias, desat })) return false;
  const head = visor && !down && name === `crew/${pose}` && GFX.info(name).head;
  if (head && GFX.has('crew/visor')) {               // the gold visor where this frame's head is
    const S = GFX.info(name), dirs = S.dirs || 1, n = S.frames || 1, a = Math.round(c.face / (TAU / dirs)) * (TAU / dirs);
    const [mx, my, mz] = head[((Math.floor(f) % n) + n) % n] || [0, 0, 0];
    const dx = mx * Math.cos(a) + my * Math.sin(a), dy = mx * Math.sin(a) - my * Math.cos(a);   // (model y = the character's left)
    GFX.sprite('crew/visor', GFX.frameIndex('crew/visor', c.face, 0), gx + dx, gy + dy, gz + mz, { sortY: gy, emissive: 0.4, alpha, depthBias: bias + 0.01, desat });
  }
  const gear = CREW_GEAR.filter(id => (id === 'armor' ? c.armor > 0 : perk(c, id)) && GFX.has(`crew/gear_${id}_${pose}`)).map(id => {
    const g = `crew/gear_${id}_${pose}`, gk = GFX.frameIndex(g, c.face, f);
    return { g, gk, d: GFX.info(g).depth?.[gk] ?? 0 };
  }).sort((p, q) => q.d - p.d);
  for (const { g, gk } of gear) GFX.sprite(g, gk, gx, gy, gz, { tint: out ? '#7a7f8a' : undefined, emissive: out ? 0.1 : 0.3, alpha, depthBias: bias + 0.02, desat });
  if (!down && c.mode !== 'gun') drawHeldItem(c, name, f, gx, gy, gz, alpha);
  return true;
}
// The hand weapon (c.inv.weapon) in the right hand: items/held_<kind> (16 dirs, origin = the point in the
// glove) at this frame's `hand` (the right glove, [x fwd, y left, z] from the ground origin), turned like
// the body sprite's direction. Its muzzle (the shots' start, js/systems.js muzzleAt) comes with it.
function drawHeldItem(c, body, f, gx, gy, gz, alpha) {
  const it = 'items/held_' + c.inv?.weapon, S = GFX.info(body), hands = S?.hand;
  if (!c.inv?.weapon || !hands || !GFX.has(it)) return;
  const dirs = S.dirs || 1, n = S.frames || 1, a = Math.round(c.face / (TAU / dirs)) * (TAU / dirs);
  const [hx, hy, hz] = hands[((Math.floor(f) % n) + n) % n] || HAND_REST;
  const dx = hx * Math.cos(a) + hy * Math.sin(a), dy = hx * Math.sin(a) - hy * Math.cos(a);   // (model y = the character's left)
  GFX.sprite(it, GFX.frameIndex(it, c.face, 0), gx + dx, gy + dy, gz + hz, { sortY: gy, emissive: 0.3, alpha, depthBias: 0.015 });
}

// ---------------------------------------------------------------------------------------------
// Cannons: the turret (hull/gun, 48 aim directions, origin = the pivot; the mount is in the hull
// body), recoiling with g.flash; the muzzle flash stays a 2D glow on top (drawMuzzleFlash).
// ---------------------------------------------------------------------------------------------
// The front cannon stands on the nose's roof (z = GUN_Z, the walls' height): at floor level just north of
// the 1.6 high nose wall it would hide behind it (and behind the helm) in the tilted view; up there it
// reads as a roof turret, its gunner up in the hatch with it. Its pivot (g.x, g.y = -3.6, gameplay: aim,
// shells, hits) is north of the wall, where there is no roof: it is *drawn* GUN_DY further south, on the
// wall top (y -2.8, the wall spans -3.0..-2.4; drawing only, like GUN_Z). The side cannons stand beside the hull and are drawn in
// front of what's next to them (depth bias). The gunner, the cover plate and the muzzle flash follow their
// cannon (gunZ / gunDY / gunBias; the shells' start height: muzzleZ in js/combat.js).
const GUN_Z = { front: 1.6 }, GUN_DY = { front: 0.8 }, GUN_SEAT = { front: 0.5 }, GUN_DEPTH_BIAS = 3;
const gunZ = (g) => (GFX.on && g && GUN_Z[g.id]) || 0, gunBias = (g) => (g && GUN_Z[g.id] ? 0.3 : GUN_DEPTH_BIAS);
const gunDY = (g) => (GFX.on && g && GUN_DY[g.id]) || 0;
// Where a gunner (c.mode 'gun', GUNNER_OFFSET behind the pivot) is drawn: up on the roof the front gunner
// sits closer in (GUN_SEAT), in the turret's hatch, so he stays on the wall top.
function gunnerAt(c) {
  const g = c.gun, k = GFX.on && GUN_SEAT[g.id] ? GUN_SEAT[g.id] / GUNNER_OFFSET : 1;
  return [g.x + (c.x - g.x) * k, g.y + gunDY(g) + (c.y - g.y) * k];
}
function drawGunSprite(g) {
  const name = broken(g) ? 'hull/gun_broken' : 'hull/gun';
  if (!GFX.ready(name)) return false;
  const rec = g.flash * 6 / T;                      // the barrel kicks back like drawGun's
  // depthBias: the front cannon stands on the bridge's 1.6 high nose wall; drawn a little in front of it
  const y = g.y + gunDY(g);
  return GFX.sprite(name, GFX.frameIndex(name, g.aim), g.x - Math.cos(g.aim) * rec, y - Math.sin(g.aim) * rec, gunZ(g), { layer: 'wall', sortY: y, emissive: 0.3, depthBias: gunBias(g) });
}
function drawMuzzleFlash(g) {
  if (!(g.flash > 0)) return;
  const x = (g.x + Math.cos(g.aim) * 1.15) * T, y = (g.y + gunDY(g) + Math.sin(g.aim) * 1.15 - GFX.lift(0.4 + gunZ(g))) * T, r = T * 0.5;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.4, 'rgba(255,190,80,0.8)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.globalAlpha = g.flash; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
}
