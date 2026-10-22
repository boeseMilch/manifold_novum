// Ship layout: six rooms in two decks of three zones, Space Alert style.
// All coordinates here are in layout units (multiply by T for pixels).
// Movement is continuous: the walkable area is a union of rectangles, and doors
// add or remove rectangles as they open and close.
// The rooms are deliberately not uniform: this ship was built out of whatever was lying around.

const SPINE_Y0 = 11.5, SPINE_Y1 = 14;            // hull between the decks (2.5 thick since the deck doors: 3.5 with the old deck airlocks)
const SPINE = SPINE_Y1 - SPINE_Y0;
const COLS = [{ x: 0.6, w: 13 }, { x: 14.2, w: 16 }, { x: 30.8, w: 13 }];   // zone columns
const SHIP_W = 44.4, SHIP_H = 26.1;              // bounding box of the hull body (excluding guns/engine)

// Space Alert zone colors: red (port), white (center), blue (starboard).
const ZONES = [
  { name: 'red', tint: '#7a5f62', label: '#ff9a8a' },
  { name: 'white', tint: '#6c7282', label: '#e8ecf4' },
  { name: 'blue', tint: '#5f6a80', label: '#9cc4ff' },
];
const zoneAtX = (x) => ZONES[x < COLS[1].x ? 0 : x < COLS[2].x ? 1 : 2];

const R = (x0, y0, x1, y1) => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
// The outer airlocks' chambers (HATCHES below) stand in the outer wall's corner of the bottom side rooms, walled
// off with 0.6 walls like every other wall: OL_BLOCK is a chamber with its walls (a hole in the room's floor), the
// room's floor goes around it (outerLockCarve: the room's rect minus the block, the big piece first).
const OL_Y = { port: 19.2, star: 19.4 }, OL_W = 2.2, OL_H = 2.2, OL_WALL = 0.6;
const OL_BLOCK = {
  port: R(0.6, OL_Y.port - OL_H / 2 - OL_WALL, 0.6 + OL_W + OL_WALL, OL_Y.port + OL_H / 2 + OL_WALL),
  star: R(43.8 - OL_W - OL_WALL, OL_Y.star - OL_H / 2 - OL_WALL, 43.8, OL_Y.star + OL_H / 2 + OL_WALL),
};
function outerLockCarve(r, b) {
  const port = b.x <= r.x + 1e-6, x0 = r.x, x1 = r.x + r.w, y0 = r.y, y1 = r.y + r.h;
  return [port ? R(b.x + b.w, y0, x1, y1) : R(x0, y0, b.x, y1),
          R(b.x, y0, b.x + b.w, b.y), R(b.x, b.y + b.h, b.x + b.w, y1)];
}
const ROOMS = [
  { id: 'portGun', name: 'Left cannon room', col: 0, deck: 'top', rects: [R(0.6, 3.4, 13.6, SPINE_Y0)] },
  { id: 'bridge', name: 'Bridge', col: 1, deck: 'top', rects: [R(14.2, 0.6, 30.2, SPINE_Y0), R(18.2, -2.4, 26.2, 0.6)] },
  { id: 'starGun', name: 'Right cannon room', col: 2, deck: 'top', rects: [R(30.8, 2.6, 43.8, SPINE_Y0)] },
  { id: 'portLock', name: 'Left airlock room', col: 0, deck: 'bottom', rects: outerLockCarve(R(0.6, SPINE_Y1, 13.6, 23.2), OL_BLOCK.port) },
  { id: 'reactor', name: 'Reactor room', col: 1, deck: 'bottom',
    rects: [R(14.2, SPINE_Y1, 30.2, 25.5)] },   // (the engine housing that poked in here is gone: floor to the stern wall)
  { id: 'starLock', name: 'Right airlock room', col: 2, deck: 'bottom', rects: outerLockCarve(R(30.8, SPINE_Y1, 43.8, 23.6), OL_BLOCK.star) },
].map(r => ({ ...r, zone: ZONES[r.col] }));
const ROOM_RECTS = ROOMS.flatMap(r => r.rects);

// Inner doors (2026-10-21: single sliding doors, no more deck airlocks). Every one is CLOSED by default and
// slides open by itself while a crew member (or a friendly NPC) stands in front of it, then shuts again
// DOOR_LINGER s after nobody is near (never on someone in the doorway; js/game.js updateDoors). It stays shut,
// and needs the manual override, when security locked it, when it's broken (deck doors are parts) or when the
// rooms on its two sides have different pressure (d.blast: a breached / vented room on one side only).
// A door is its passage rect (x, y, w, h: walkable while open) plus axis: 'x' = you walk through it along x
// (the doorways in the up-down walls), 'y' = along y (the deck doors through the spine).
// open: 0..1; locked: security / the AI glitch; blast: pressure difference (set every tick); hold: s it's held
// open after a forced override; jammed: a broken deck door forced open (stays open till repaired);
// pry: pirates forcing it (0..1).
// Doorways between neighboring rooms on the same deck.
const DOORWAYS = [
  R(13.6, 6.2, 14.2, 8.4), R(30.2, 5.8, 30.8, 8.0),
  R(13.6, 18.0, 14.2, 20.2), R(30.2, 18.4, 30.8, 20.6),
].map(d => ({ ...d, axis: 'x', open: 0, locked: false }));
// Deck doors: one per zone column, a passage through the spine with a single sliding door in it (the only way
// up or down). They are breakable parts (SYSTEMS kind 'lock', js/systems.js).
const DECK_DOORS = COLS.map((C0, col) => ({ col, x: C0.x + 2.5, y: SPINE_Y0, w: 2.2, h: SPINE, axis: 'y', open: 0, locked: false }));
const DOORS = [...DOORWAYS, ...DECK_DOORS];
const DOOR_WALK = 0.6;                               // open this far, a door's passage is walkable
const doorCenter = (d) => [d.x + d.w / 2, d.y + d.h / 2];
// The two rooms a door joins (worked out once).
function doorRooms(d) {
  if (!d._rooms) {
    const [cx, cy] = doorCenter(d);
    d._rooms = (d.axis === 'y' ? [roomAt(cx, d.y - 0.3), roomAt(cx, d.y + d.h + 0.3)] : [roomAt(d.x - 0.3, cy), roomAt(d.x + d.w + 0.3, cy)]).filter(Boolean);
  }
  return d._rooms;
}
// Is (x, y) in front of the door: in its passage, or within `reach` of it on either side (and not off to the side)?
function nearDoor(d, x, y, reach = 1.0, side = 0.1) {
  return d.axis === 'y' ? Math.abs(x - (d.x + d.w / 2)) < d.w / 2 + side && y > d.y - reach && y < d.y + d.h + reach
                        : Math.abs(y - (d.y + d.h / 2)) < d.h / 2 + side && x > d.x - reach && x < d.x + d.w + reach;
}
// The door's name in prompts and banners.
const doorName = (d) => d.axis === 'y' ? `${['Left', 'Middle', 'Right'][d.col]} deck door` : `Door ${doorRooms(d).map(r => r.name.replace(/ room$/, '').toLowerCase()).join('–')}`;

// Capacitors: one in every bottom room, each starting at 1 charge.
let CAP_MAX = 3;                                   // (ship upgrades can raise it; see progress.js)
const CAPACITORS = [
  { room: 'portLock', x: 6.6, y: 22.6, charge: 1 },
  { room: 'reactor', x: 27.0, y: 14.65, charge: 1 },   // against the back wall, next to the cat (its lines: js/systems.js POWER_ROUTES)
  { room: 'starLock', x: 37.6, y: 23.0, charge: 1 },
];

// Stations (no function yet beyond being there). (x, y) is on the wall; face: operator's view.
// The cannons themselves are manned from outside the ship (see GUNS).
const STATIONS = [
  { kind: 'console', name: 'Helm', x: 22.2, y: -2.4, face: -Math.PI / 2 },
  { kind: 'console', name: 'Security', x: 8.0, y: 3.4, face: -Math.PI / 2 },
];
// Reactor: a pizza-oven / vending-machine hybrid with a fuel-cell slot. Center + footprint.
const REACTOR = { x: 22.2, y: 19.3, w: 3.8, h: 2.6 };
const CAT = { x: 29.45, y: 14.75 };                // the ship cat's favourite corner (reactor room)
// Engine: only the bell, sticking out of the stern (the housing in the reactor room was removed).
const ENGINE = { x: 22.2, y: 23.9, w: 5.6 };

// Outer airlocks (2026-10-21: real airlocks, "for the outer airlocks we actually want the double doors"): in each
// bottom side room, a chamber (OL_W x OL_H) against the outer wall with two doors, only ever one of them open: the
// INNER door (in the chamber's 0.6 wall towards the room, as long as the chamber) and the OUTER door (the hatch in
// the hull wall, 1.8 long). Walk up to the inner door and it opens, step in, it shuts behind you, the chamber pumps
// out (LOCK_CYCLE), the outer door opens, step out onto the hull: a spacewalk. Back in the same way. The logic:
// js/airlock.js. x: the hull wall's outer face (the hatch); dir: which way is out (-1 = -x); y: the chamber's middle.
// inside: in front of the inner door (in the room); outside: just off the hatch, on a spacewalk.
// chamber, inner (the inner door's passage), outer (the hatch's passage, through the hull wall), step (the
// doorstep outside the hatch: walkable while the outer door is open, the way out onto the hull).
// doors: openness 0..1; air: the side the chamber is open to ('inner': pressurized like the room, 'outer':
// pumped out); phase 'idle' | 'closing' | 'cycling' | 'opening' (see js/airlock.js), t, target, entry.
const HATCHES = ['port', 'star'].map(side => {
  const dir = side === 'port' ? -1 : 1, x = side === 'port' ? 0 : SHIP_W, y = OL_Y[side], b = OL_BLOCK[side];
  const cx0 = side === 'port' ? b.x : b.x + OL_WALL, cy0 = y - OL_H / 2;
  const chamber = R(cx0, cy0, cx0 + OL_W, cy0 + OL_H);
  const inner = side === 'port' ? R(cx0 + OL_W, cy0, cx0 + OL_W + OL_WALL, cy0 + OL_H) : R(b.x, cy0, b.x + OL_WALL, cy0 + OL_H);
  const outer = side === 'port' ? R(0, y - 0.9, 0.6, y + 0.9) : R(SHIP_W - 0.6, y - 0.9, SHIP_W, y + 0.9);
  const step = side === 'port' ? R(-0.45, y - 0.9, 0, y + 0.9) : R(SHIP_W, y - 0.9, SHIP_W + 0.45, y + 0.9);
  const ix = side === 'port' ? inner.x + inner.w + 0.65 : inner.x - 0.65;
  return { side, x, y, dir, chamber, inner, outer, step, inside: [ix, y], outside: [x + dir * 1.1, y],
           doors: { inner: 0, outer: 0 }, air: 'inner', phase: 'idle', t: 0, target: null, entry: null, locked: false };
});

// Shield buttons: one on each side of the lower deck. Raises that side's shield.
const SHIELD_BUTTONS = [
  { side: 'port', x: 7.0, y: SPINE_Y1 + 0.35 },
  { side: 'star', x: 37.2, y: SPINE_Y1 + 0.35 },
  { side: 'front', x: 22.2, y: SPINE_Y1 + 0.35 },   // reactor room wall, right below the bridge
];
// Shield emitters: the devices on the outside of the hull that actually project each shield (the button
// inside only switches its emitter on). (x, y): where it sits, just off the hull; face: the way its lens
// points (straight out from the hull). A broken one can only be repaired on a spacewalk.
const SHIELD_EMITTERS = [
  { side: 'port', x: -0.75, y: 15.7, face: Math.PI },
  { side: 'star', x: SHIP_W + 0.75, y: 15.7, face: 0 },
  { side: 'front', x: 15.1, y: -2.05, face: Math.atan2(-3.8, -3.2) },   // on the nose's left shoulder
];
const SIDE_CAP = { port: 0, front: 1, star: 2 };    // which capacitor powers that side's shield / cannon
const SIDE_LABEL = { port: 'Left', front: 'Front', star: 'Right' };

// Hull outline: a nose for the bridge, blisters for the side guns, a skirt for the engine, a doorstep
// at each outer airlock hatch. It contains every wall (the outer walls are flush with it; the corner
// chamfers start at the walls' corners), so no wall hangs over space.
const HULL = [
  [17.4, -3.2], [27, -3.2], [30.8, 0], [43.4, 1.6], [44.4, 2.0],
  [44.4, 4.6], [46, 5.5], [46, 8.5], [44.4, 9.4],
  [44.4, 17.95], [44.85, 18.25], [44.85, 20.55], [44.4, 20.85],
  [44.4, 24.2], [44.0, 24.6], [31.2, 24.6], [30.8, 26.1], [13.6, 26.1], [13.2, 24.1],
  [0.3, 24.1], [0, 23.8], [0, 20.65], [-0.45, 20.35], [-0.45, 18.05], [0, 17.75],
  [0, 9.6], [-1.6, 8.6], [-1.6, 5.6], [0, 4.6], [0, 2.8],
  [0.4, 2.4], [13.6, 2.4], [13.6, 0],
];
// Cannons on the outside of the hull, manned from inside: hatch is the ladder that leads up
// into the cannon; view: what the camera frames while manning it (center, visible width).
const GUNS = [
  { id: 'front', name: 'Front cannon', x: 22.2, y: -3.6, a: -Math.PI / 2, hatch: [25.1, -1.85], view: [22.2, -18.5, 60], arc: 95 * Math.PI / 180 },
  { id: 'port', name: 'Left cannon', x: -0.9, y: 7.1, a: Math.PI, hatch: [1.25, 8.6], view: [-11.5, 8.5, 38] },
  { id: 'star', name: 'Right cannon', x: 45.3, y: 6.9, a: 0, hatch: [43.15, 8.4], view: [55.9, 8.5, 38] },
].map(g => ({ ...g, aim: g.a, flash: 0, shots: 3, reload: 0 }));   // every cannon starts loaded with 3 shots
const GUN_ARC = 1.3;                              // default max aim deviation from the base direction (g.arc overrides)
const GUNNER_OFFSET = 0.75;                       // the gunner sits this far behind the barrel's pivot

// Static floor pieces (rooms, the doors' passages). They must not overlap; the inner wall shadow relies on that.
const FLOOR_RECTS = [...ROOM_RECTS, ...DOORS, ...HATCHES.flatMap(h => [h.chamber, h.inner])];   // (+ the outer airlocks' chambers and inner doors)

// Furniture: just for living in (see interior.js), but you can't walk through it.
const FURNITURE = {
  counter: R(6.2, 10.7, 11.0, 11.5),               // kitchen (left cannon room)
  fridge: R(11.2, 10.3, 12.4, 11.5),
  table: R(9.05, 7.75, 10.15, 8.85),
  bunks: R(36.9, 2.6, 39.7, 4.9),                  // bunk beds (right cannon room)
  lockers: R(40.1, 2.6, 41.5, 3.4),
  couch: R(29.1, 3.3, 30.2, 5.5),                  // bridge
  stallWall: R(11.3, 14.0, 11.45, 16.0),           // toilet (left airlock room)
  stallFront: R(11.3, 15.85, 11.95, 16.0),
  toilet: R(12.5, 14.0, 13.3, 15.0),
  treadBar: R(39.3, 20.9, 40.3, 21.15),           // treadmill (right airlock room): handlebar and side rails;
  treadRailL: R(39.3, 21.15, 39.51, 22.0),         // you step onto the belt from the back (see TREADMILL)
  treadRailR: R(40.09, 21.15, 40.3, 22.0),
};
// The treadmill's belt: walkable, and it carries you towards the back (+y).
const TREADMILL = R(39.51, 21.15, 40.09, 22.0), BELT_K = 0.5;   // the belt runs at half your walking speed

// Clutter standing on the floor (crates, the toolbox, the snack machine...; drawn in js/decor.js and
// friends at (x, y)): footprint w × h, turned by a (radians, as drawn). Solid too: the box around the
// turned footprint, trimmed halfway back to the unturned one (the corners of a turned crate's bounding
// box are empty floor). Flat or tiny things (papers, cracks, nuts, ducks, the cat, the kitchen stools)
// stay walk-through; tests/clutter.js checks that every floor sprite is one or the other.
const CLUTTER = {
  ammoPort: { x: 11.6, y: 3.88, w: 1.0, h: 0.9, a: 0.05 },    // kitchen (left cannon room): crates by the snack machine,
  blankPort: { x: 12.8, y: 3.83, w: 0.8, h: 0.8, a: -0.1 },   //   pushed back against the wall (no gap to get stuck in)
  snax: { x: 12.3, y: 5.6, w: 0.9, h: 0.8, a: 0.25 },
  snack: { x: 10.5, y: 3.85, w: 1.1, h: 0.8, a: 0 },          // the snack machine (SNACK, js/hazards.js)
  plant: { x: 14.95, y: 10.75, w: 0.5, h: 0.5, a: 0 },        // bridge: Steve, in his pot
  ammoStar: { x: 43.25, y: 3.2, w: 1.0, h: 0.9, a: -0.05 },  // bedroom (right cannon room): along the back wall,
  toolbox: { x: 42.1, y: 3.08, w: 0.84, h: 0.48, a: -0.3 },  //   right of the lockers, into the corner
  sleepingBag: { x: 35.0, y: 3.06, w: 1.8, h: 0.7, a: 0.12 }, //   bunk five, left of the bunks
  misc: { x: 41.6, y: 10.97, w: 0.9, h: 0.9, a: 0.15 },       //   against the front wall, clear of the cannon's power line
  platesA: { x: 12.6, y: 22.4, w: 1.0, h: 0.9, a: 0.1 },      // bathroom (left airlock): hull plates (PLATE_CRATES[0])
  coolant: { x: 11.4, y: 22.6, w: 0.8, h: 0.7, a: -0.2 },     //   coolant canisters (COOLANT_CRATE)
  fuel: { x: 17.4, y: 19.6, w: 1.3, h: 0.9, a: 0.08 },        // reactor room: spare fuel cells (FUEL_CRATE)
  patch: { x: 20.0, y: 23.0, w: 0.67, h: 0.5, a: 0 },         //   the patch board (PATCH_BOARD, js/minigames.js)
  sockPoleL: { x: 15.15, y: 24.6, w: 0.28, h: 0.28, a: 0 },   //   the washing line's two stands (props/socks, drawn between them;
  sockPoleR: { x: 19.15, y: 24.6, w: 0.28, h: 0.28, a: 0 },   //   the right one close to the wall: no gap to get stuck in)
  tape: { x: 32.0, y: 22.6, w: 1.0, h: 0.9, a: 0.2 },         // gym (right airlock): supply crates, bottom left
  platesB: { x: 33.1, y: 22.8, w: 0.9, h: 0.8, a: -0.1 },     //   hull plates (PLATE_CRATES[1])
  blankStar: { x: 32.4, y: 21.6, w: 0.7, h: 0.7, a: 0.5 },
  weightRack: { x: 40.25, y: 14.36, w: 1.5, h: 0.62, a: 0 },   //   the dumbbell rack against the back wall (left of the outer airlock: x 41.5 → 40.25, 2026-10-21)
};
function clutterRect(c) {
  const C = Math.abs(Math.cos(c.a)), S = Math.abs(Math.sin(c.a));
  const hw = ((c.w * C + c.h * S) / 2 + c.w / 2) / 2, hh = ((c.w * S + c.h * C) / 2 + c.h / 2) / 2;
  return R(c.x - hw, c.y - hh, c.x + hw, c.y + hh);
}

// Things you can't walk through.
const SOLIDS = [
  R(REACTOR.x - REACTOR.w / 2, REACTOR.y - REACTOR.h / 2, REACTOR.x + REACTOR.w / 2, REACTOR.y + REACTOR.h / 2),
  R(21.3, 5.5, 23.1, 7.3),                        // map table
  R(21.4, -2.4, 23.0, -1.8),                      // helm desk
  R(7.2, 3.4, 8.8, 4.0),                          // security desk
  ...CAPACITORS.map(c => R(c.x - 0.8, c.y - 0.45, c.x + 0.8, c.y + 0.45)),
  ...SHIELD_BUTTONS.map(b => R(b.x - 0.4, b.y - 0.35, b.x + 0.4, b.y + 0.35)),
  ...Object.values(FURNITURE),
  ...Object.values(CLUTTER).map(clutterRect),
];

// Hull polygon geometry (used for spacewalks and for hits).
function pointInPoly(x, y, pts = HULL) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distToPoly(x, y, pts = HULL) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, k = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * k, y - ay - dy * k));
  }
  return best;
}
// How far a spacewalker may float: as far as keeps some of the hull on screen. Outside, the camera follows you at
// 0.75 × the room zoom (js/game.js cameraTarget), which shows at least 25.3 × 17.3 units of space whatever the
// window's shape (19 × 13 room units / 0.75); minus a margin for the HUD, the sidebar and the camera's lag, that
// leaves EVA_REACH: the hull's nearest point may be up to that far off sideways / up-down (an ellipse). No wall:
// from EVA_SOFT of the way out your outward drift fades (you stop short of the ellipse) and, when you stop pushing,
// you drift gently back (js/game.js evaDrift); the ellipse itself is only the safety net.
const EVA_REACH = { x: 9.5, y: 6.5 }, EVA_SOFT = 0.6;
// e: how far out you are (0 on the hull, 1 at the edge); nx, ny: the way out (unit vector, world coords).
function evaReach(x, y) {
  const sx = EVA_REACH.x, sy = EVA_REACH.y;
  let best = Infinity, bx = 0, by = 0;
  for (let i = 0, j = HULL.length - 1; i < HULL.length; j = i++) {
    const ax = HULL[j][0] / sx, ay = HULL[j][1] / sy, dx = HULL[i][0] / sx - ax, dy = HULL[i][1] / sy - ay;
    const k = clamp(((x / sx - ax) * dx + (y / sy - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    const ex = x / sx - ax - dx * k, ey = y / sy - ay - dy * k, d = Math.hypot(ex, ey);
    if (d < best) { best = d; bx = ex; by = ey; }
  }
  const gx = bx / sx, gy = by / sy, g = Math.hypot(gx, gy) || 1;   // (the gradient of e: scaled back to world coords)
  return { e: best, nx: gx / g, ny: gy / g };
}
const evaOk = (x, y) => !pointInPoly(x, y) && evaReach(x, y).e <= 1;
// x where a horizontal line at height y first meets the hull from the given side.
function hullEdgeX(y, side) {
  if (side === 'port') { for (let x = -3; x < 10; x += 0.1) if (pointInPoly(x, y)) return x; }
  else { for (let x = SHIP_W + 3; x > SHIP_W - 10; x -= 0.1) if (pointInPoly(x, y)) return x; }
  return side === 'port' ? 0 : SHIP_W;
}

const inRect = (x, y, r, e = 1e-6) => x >= r.x - e && x <= r.x + r.w + e && y >= r.y - e && y <= r.y + r.h + e;
function roomAt(x, y) {
  return ROOMS.find(r => r.rects.some(q => inRect(x, y, q))) || null;
}
const roomCenter = (room) => {                   // center of the room's bounding box
  const x0 = Math.min(...room.rects.map(q => q.x)), x1 = Math.max(...room.rects.map(q => q.x + q.w));
  const y0 = Math.min(...room.rects.map(q => q.y)), y1 = Math.max(...room.rects.map(q => q.y + q.h));
  return [(x0 + x1) / 2, (y0 + y1) / 2];
};

// Rectangles a crew member may stand in right now.
function walkRects() {
  return [...ROOM_RECTS, ...DOORS.filter(d => d.open > DOOR_WALK), ...(typeof dockRects === 'function' ? dockRects() : []), ...airlockRects()];
}
// The outer airlocks: the chamber, and each door's passage while it's open (the outer one with the doorstep outside).
function airlockRects() {
  const out = [];
  for (const h of HATCHES) {
    out.push(h.chamber);
    if (h.doors.inner > DOOR_WALK) out.push(h.inner);
    if (h.doors.outer > DOOR_WALK) out.push(h.outer, h.step);
  }
  return out;
}
