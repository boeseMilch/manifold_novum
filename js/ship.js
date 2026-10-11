// Ship layout: six rooms in two decks of three zones, Space Alert style.
// All coordinates here are in layout units (multiply by T for pixels).
// Movement is continuous: the walkable area is a union of rectangles, and doors
// add or remove rectangles as they open and close.
// The rooms are deliberately not uniform: this ship was built out of whatever was lying around.

const SPINE_Y0 = 11.5, SPINE_Y1 = 15;            // hull between the decks
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
const ROOMS = [
  { id: 'portGun', name: 'Left Cannon', col: 0, deck: 'top', rects: [R(0.6, 3.4, 13.6, SPINE_Y0)] },
  { id: 'bridge', name: 'Bridge', col: 1, deck: 'top', rects: [R(14.2, 0.6, 30.2, SPINE_Y0), R(18.2, -2.4, 26.2, 0.6)] },
  { id: 'starGun', name: 'Right Cannon', col: 2, deck: 'top', rects: [R(30.8, 2.6, 43.8, SPINE_Y0)] },
  { id: 'portLock', name: 'Left Airlock', col: 0, deck: 'bottom', rects: [R(0.6, SPINE_Y1, 13.6, 23.2)] },
  // the engine housing pokes into the bottom of the reactor room
  { id: 'reactor', name: 'Reactor', col: 1, deck: 'bottom',
    rects: [R(14.2, SPINE_Y1, 30.2, 23.9), R(14.2, 23.9, 19.4, 25.5), R(25.0, 23.9, 30.2, 25.5)] },
  { id: 'starLock', name: 'Right Airlock', col: 2, deck: 'bottom', rects: [R(30.8, SPINE_Y1, 43.8, 23.6)] },
].map(r => ({ ...r, zone: ZONES[r.col] }));
const ROOM_RECTS = ROOMS.flatMap(r => r.rects);

// Open doorways between neighboring rooms on the same deck.
const DOORWAYS = [
  R(13.6, 6.2, 14.2, 8.4), R(30.2, 5.8, 30.8, 8.0),
  R(13.6, 18.0, 14.2, 20.2), R(30.2, 18.4, 30.8, 20.6),
].map(d => ({ ...d, open: 1, locked: false }));        // sliding doors, normally open; security can lock them

// Each zone has a deck airlock between the decks (the only way up or down).
// Deck airlock: chamber with a door at each end; only one door is ever open.
const LOCK_DOOR = 0.5;
const DECK_LOCKS = COLS.map((C0, col) => {
  const x = C0.x + 2.5, w = 2.2;
  const start = col === 1 ? 'bottom' : 'top';
  return {
    col, x, w,
    chamber: R(x, SPINE_Y0 + LOCK_DOOR, x + w, SPINE_Y1 - LOCK_DOOR),
    doorRect: { top: R(x, SPINE_Y0, x + w, SPINE_Y0 + LOCK_DOOR), bottom: R(x, SPINE_Y1 - LOCK_DOOR, x + w, SPINE_Y1) },
    open: start, doors: { top: +(start === 'top'), bottom: +(start === 'bottom') },   // openness 0..1
    phase: 'idle', target: null, t: 0, entry: null,
  };
});


// Capacitors: one in every bottom room, each starting at 1 charge.
const CAP_MAX = 4;
const CAPACITORS = [
  { room: 'portLock', x: 6.6, y: 22.6, charge: 1 },
  { room: 'reactor', x: 27.0, y: 24.9, charge: 1 },
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
const CAT = { x: 29.45, y: 15.75 };                // the ship cat's favourite corner (reactor room)
// Engine: the housing sits in the reactor room, the bell sticks out of the stern.
const ENGINE = { x: 22.2, y: 23.9, w: 5.6 };

// Outer airlocks (hatches) in the side walls of the bottom side rooms. Going through
// one takes you outside onto the hull (EVA).
const HATCHES = [
  { side: 'port', x: 0, y: 19.2, dir: -1, inside: [1.2, 19.2], outside: [-1.1, 19.2], open: 0 },
  { side: 'star', x: SHIP_W, y: 19.4, dir: 1, inside: [SHIP_W - 1.2, 19.4], outside: [SHIP_W + 1.1, 19.4], open: 0 },
];

// Shield buttons: one on each side of the lower deck. Raises that side's shield.
const SHIELD_BUTTONS = [
  { side: 'port', x: 7.0, y: SPINE_Y1 + 0.35 },
  { side: 'star', x: 37.2, y: SPINE_Y1 + 0.35 },
  { side: 'front', x: 22.2, y: SPINE_Y1 + 0.35 },   // reactor room wall, right below the bridge
];
const SIDE_CAP = { port: 0, front: 1, star: 2 };    // which capacitor powers that side's shield / cannon
const SIDE_LABEL = { port: 'Left', front: 'Front', star: 'Right' };

// Hull outline: a nose for the bridge, blisters for the side guns, a skirt for the engine.
const HULL = [
  [17.4, -3.2], [27, -3.2], [30.8, 0], [43.4, 1.6], [44.4, 2.6],
  [44.4, 4.6], [46, 5.5], [46, 8.5], [44.4, 9.4],
  [44.4, 23.4], [43.4, 24.6], [31.2, 24.6], [30.8, 26.1], [13.6, 26.1], [13.2, 24.1],
  [1.2, 24.1], [0, 22.9], [0, 9.6], [-1.6, 8.6], [-1.6, 5.6], [0, 4.6], [0, 3.4],
  [1.4, 2.4], [13.8, 2.4], [13.8, 0],
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

// Static floor pieces (rooms, doorways, lock chambers incl. door slots). They must not
// overlap; the inner wall shadow relies on that.
const FLOOR_RECTS = [
  ...ROOM_RECTS, ...DOORWAYS,
  ...DECK_LOCKS.flatMap(L => [L.doorRect.top, L.chamber, L.doorRect.bottom]),
];

// Furniture: just for living in (see interior.js), but you can't walk through it.
const FURNITURE = {
  counter: R(6.2, 10.7, 11.0, 11.5),               // kitchen (left cannon room)
  fridge: R(11.2, 10.3, 12.4, 11.5),
  table: R(9.05, 7.75, 10.15, 8.85),
  bunks: R(36.9, 2.6, 39.7, 4.9),                  // bunk beds (right cannon room)
  lockers: R(40.1, 2.6, 41.5, 3.4),
  couch: R(29.1, 3.3, 30.2, 5.5),                  // bridge
  stallWall: R(11.3, 15.0, 11.45, 17.0),           // toilet (left airlock room)
  stallFront: R(11.3, 16.85, 11.95, 17.0),
  toilet: R(12.5, 15.0, 13.3, 16.0),
  bike: R(39.4, 20.9, 40.2, 22.0),                 // exercise bike (right airlock room)
};
// Things you can't walk through.
const SOLIDS = [
  R(REACTOR.x - REACTOR.w / 2, REACTOR.y - REACTOR.h / 2, REACTOR.x + REACTOR.w / 2, REACTOR.y + REACTOR.h / 2),
  R(21.3, 5.5, 23.1, 7.3),                        // map table
  R(21.4, -2.4, 23.0, -1.8),                      // helm desk
  R(7.2, 3.4, 8.8, 4.0),                          // security desk
  ...CAPACITORS.map(c => R(c.x - 0.8, c.y - 0.45, c.x + 0.8, c.y + 0.45)),
  ...SHIELD_BUTTONS.map(b => R(b.x - 0.4, b.y - 0.35, b.x + 0.4, b.y + 0.35)),
  ...Object.values(FURNITURE),
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
const EVA_RANGE = 2.8;                            // how far from the hull you may float
const evaOk = (x, y) => !pointInPoly(x, y) && distToPoly(x, y) <= EVA_RANGE;
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
  const out = [...ROOM_RECTS, ...DOORWAYS.filter(d => d.open > 0.95)];
  for (const L of DECK_LOCKS) {
    out.push(L.chamber);
    for (const s of ['top', 'bottom']) if (L.doors[s] > 0.95) out.push(L.doorRect[s]);
  }
  return out;
}
