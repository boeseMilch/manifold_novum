// The ship is a tile mask. Mask tiles touching the outside are walls; the rest is the
// floor grid that every interior entity lives on. Stair steps in an outline are drawn
// as diagonals, and floor tiles cut by a diagonal can't be built on.

const SHIP_ROWS = [[1, 13], [0, 14], [0, 15], [0, 16], [0, 17], [0, 17], [0, 16], [0, 15], [0, 14], [1, 13]]; // [x0, x1) per row
const GH = SHIP_ROWS.length;
const SHIP_C = [8 * T, 5 * T];                // pivot/center of mass, ship-local px
const AIRLOCK_TILE = { x: 10, y: 9 };          // in the bottom wall
const INTAKE_TILE = { x: 0, y: 4 };            // in the rear wall
const INTAKE_POS = [-0.3 * T, 4.5 * T];        // center of the vacuum field
const ENGINE_YS = [2.5, 7.5];
const RETRO_PTS = [[11.4, 0.05, -1], [11.4, 9.95, 1]];   // forward-firing braking jets [x, y, side]
const VENTS = [[4, 0.28], [7, 0.28], [4, 9.28], [7, 9.28]];
const NAV_LIGHTS = [[2.6, 0.4, '#ff4a3d'], [2.6, 9.6, '#47e07a'], [16.6, 5, '#ffffff']];
const CHEST_CAP = 50, AMMO_MAX = 5, BELT_COST = 1;
const BELT_SPEED = 2.5;                        // tiles per second
const DISPENSE_CD = 0.25;

const DIR = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
const DIRS = ['E', 'S', 'W', 'N'];             // clockwise on screen
const OPP = { E: 'W', W: 'E', N: 'S', S: 'N' };
const key = (x, y) => x + ',' + y;

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------
const inMask = (x, y) => y >= 0 && y < GH && x >= SHIP_ROWS[y][0] && x < SHIP_ROWS[y][1];
const isFloorTile = (x, y) => inMask(x, y) && inMask(x - 1, y) && inMask(x + 1, y) && inMask(x, y - 1) && inMask(x, y + 1);

// Outline of a tile set as a polygon (tile units, clockwise on screen). Convex corners of
// 1-tile stair steps are cut so a staircase becomes one straight diagonal.
function outlinePoly(test) {
  const edges = new Map();
  for (let y = -1; y <= GH; y++) for (let x = -1; x <= 32; x++) {
    if (!test(x, y)) continue;
    if (!test(x, y - 1)) edges.set(key(x, y), [x + 1, y]);
    if (!test(x + 1, y)) edges.set(key(x + 1, y), [x + 1, y + 1]);
    if (!test(x, y + 1)) edges.set(key(x + 1, y + 1), [x, y + 1]);
    if (!test(x - 1, y)) edges.set(key(x, y + 1), [x, y]);
  }
  let [cx, cy] = edges.keys().next().value.split(',').map(Number);
  const loop = [];
  do { loop.push([cx, cy]); [cx, cy] = edges.get(key(cx, cy)); } while (cx !== loop[0][0] || cy !== loop[0][1]);
  const cross = (p, c, q) => (c[0] - p[0]) * (q[1] - c[1]) - (c[1] - p[1]) * (q[0] - c[0]);
  const at = (arr, i) => arr[(i + arr.length) % arr.length];
  const v = loop.filter((c, i) => cross(at(loop, i - 1), c, at(loop, i + 1)) !== 0);
  const out = [];
  v.forEach((c, i) => {
    const p = at(v, i - 1), q = at(v, i + 1);
    const a = Math.hypot(c[0] - p[0], c[1] - p[1]), b = Math.hypot(q[0] - c[0], q[1] - c[1]);
    if (cross(p, c, q) <= 0 || (a !== 1 && b !== 1)) out.push(c);
    else if (a === 1 && b !== 1) out.push([c[0] + (q[0] - c[0]) / b, c[1] + (q[1] - c[1]) / b]);
    else if (b === 1 && a !== 1) out.push([c[0] - (c[0] - p[0]) / a, c[1] - (c[1] - p[1]) / a]);
    // a === b === 1: drop the corner entirely
  });
  return out.filter((c, i) => c[0] !== at(out, i + 1)[0] || c[1] !== at(out, i + 1)[1]);
}

function pointInPoly(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [x1, y1] = pts[j], [x2, y2] = pts[i];
    if ((y2 > py) !== (y1 > py) && px < (x1 - x2) * (py - y2) / (y1 - y2) + x2) inside = !inside;
  }
  return inside;
}

const HULL_POLY = outlinePoly(inMask), FLOOR_POLY = outlinePoly(isFloorTile);
const HULL_PTS = HULL_POLY.map(([x, y]) => [x * T, y * T]);
const FLOOR_PTS = FLOOR_POLY.map(([x, y]) => [x * T, y * T]);
const FLOOR_TILES = [], buildable = new Set();
for (let y = 0; y < GH; y++) for (let x = 0; x < 32; x++) {
  if (!isFloorTile(x, y)) continue;
  FLOOR_TILES.push([x, y]);
  if ([[0.02, 0.02], [0.98, 0.02], [0.02, 0.98], [0.98, 0.98]].every(([u, v]) => pointInPoly(x + u, y + v, FLOOR_POLY))) buildable.add(key(x, y));
}

// ---------------------------------------------------------------------------
// Entities. Footprints and part positions are given facing E ("canonical") and
// rotated with the entity's direction d.
// ---------------------------------------------------------------------------
const FOOT = { belt: [1, 1], chest: [1, 1], dispenser: [1, 1], reactor: [2, 2], helm: [2, 1], turret: [2, 2] };
const SOLID = {                                // canonical cells that block walking
  belt: () => false, chest: () => true, dispenser: () => true, reactor: () => true,
  helm: (u) => u === 1,                        // seat | console
  turret: (u, v) => !(u === 0 && v === 1),     // hopper, gun / seat, gun
};
const DEFAULTS = {
  belt: () => ({ item: null }),
  chest: () => ({ store: { rock: 0, metal: 0 }, pop: 0 }),
  dispenser: () => ({ mode: 'rock', cd: 0, busy: 0 }),
  turret: () => ({ ammo: [], rel: 0, cd: 0, flash: 0, dry: 0 }),
  reactor: () => ({}), helm: () => ({}),
};
let entities = [], beltOrder = [];
const occ = new Map();                          // "x,y" -> entity

function footprint(type, d) { const [w, h] = FOOT[type]; return d === 'N' || d === 'S' ? [h, w] : [w, h]; }
function cellsAt(type, x, y, d) {
  const [fw, fh] = footprint(type, d), cells = [];
  for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) cells.push([x + i, y + j]);
  return cells;
}
// canonical point (u, v in tiles) -> ship-local px
function entPoint(e, u, v) {
  const [w, h] = FOOT[e.type], [fw, fh] = footprint(e.type, e.d);
  const [rx, ry] = rot(u - w / 2, v - h / 2, DIR_ANGLE[e.d]);
  return [(e.x + fw / 2 + rx) * T, (e.y + fh / 2 + ry) * T];
}
// ship cell -> canonical cell of entity e
function entCell(e, cx, cy) {
  const [w, h] = FOOT[e.type], [fw, fh] = footprint(e.type, e.d);
  const [u, v] = rot(cx + 0.5 - e.x - fw / 2, cy + 0.5 - e.y - fh / 2, -DIR_ANGLE[e.d]);
  return [Math.round(u + w / 2 - 0.5), Math.round(v + h / 2 - 0.5)];
}

function canPlace(type, x, y, d) {
  return cellsAt(type, x, y, d).every(([cx, cy]) => buildable.has(key(cx, cy)) && !occ.has(key(cx, cy)));
}
function addEntity(type, x, y, d = 'E', props = {}) {
  const e = { type, x, y, d, ...DEFAULTS[type](), ...props };
  for (const [cx, cy] of cellsAt(type, x, y, d)) occ.set(key(cx, cy), e);
  entities.push(e);
  if (e.type === 'turret') e.rel = DIR_ANGLE[d];
  gridChanged();
  return e;
}
function removeEntity(e) {
  for (const [cx, cy] of cellsAt(e.type, e.x, e.y, e.d)) occ.delete(key(cx, cy));
  entities.splice(entities.indexOf(e), 1);
  gridChanged();
}

function isBlocked(x, y) {
  if (!buildable.has(key(x, y))) return true;
  const e = occ.get(key(x, y));
  return !!e && SOLID[e.type](...entCell(e, x, y));
}

// ---------------------------------------------------------------------------
// Logistics: chest -> dispenser -> belts -> turret hopper (or any accepting entity)
// ---------------------------------------------------------------------------
const pointsAt = (e, x, y) => !!e && (e.type === 'belt' || e.type === 'dispenser') && e.x + DIR[e.d][0] === x && e.y + DIR[e.d][1] === y;

function gridChanged() {
  const belts = entities.filter(e => e.type === 'belt');
  for (const b of belts) {                     // incoming direction decides straight vs corner
    const [dx, dy] = DIR[b.d];
    if (pointsAt(occ.get(key(b.x - dx, b.y - dy)), b.x, b.y)) { b.din = b.d; continue; }
    const side = [[-dy, dx], [dy, -dx]].map(([sx, sy]) => occ.get(key(b.x + sx, b.y + sy))).filter(e => pointsAt(e, b.x, b.y));
    b.din = side.length === 1 ? side[0].d : b.d;
  }
  // move items on downstream belts first so a full line advances in one step
  const depth = (b) => {
    let n = 0, cur = b; const seen = new Set();
    while (cur && cur.type === 'belt' && !seen.has(cur)) { seen.add(cur); cur = occ.get(key(cur.x + DIR[cur.d][0], cur.y + DIR[cur.d][1])); n++; }
    return n;
  };
  beltOrder = belts.map(b => [depth(b), b]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
}

const chestTotal = (c) => c.store.rock + c.store.metal;
function canAccept(e, type) {
  if (e.type === 'chest') return chestTotal(e) < CHEST_CAP;
  if (e.type === 'turret') return e.ammo.length < AMMO_MAX;
  return false;
}
function accept(e, type) {
  if (e.type === 'chest') { e.store[type]++; e.pop = 1; } else if (e.type === 'turret') e.ammo.push(type);
}
// entity at (x, y) that can take an item arriving while moving in direction d
function pushTarget(x, y, d, type) {
  const t = occ.get(key(x, y));
  if (!t) return null;
  if (t.type === 'belt') return !t.item && t.d !== OPP[d] ? t : null;
  return canAccept(t, type) ? t : null;
}
function give(t, item, d, p) {
  if (t.type === 'belt') t.item = { type: item.type, k: item.k, p: t.din === d ? p : 0.5 };   // side-loads land mid-tile
  else accept(t, item.type);
}

function updateLogistics(dt) {
  for (const b of beltOrder) {
    const it = b.item;
    if (!it) continue;
    const target = pushTarget(b.x + DIR[b.d][0], b.y + DIR[b.d][1], b.d, it.type);
    // an item may only pass the tile center if the next tile can take it
    it.p = target ? Math.min(1, it.p + BELT_SPEED * dt) : Math.max(it.p, Math.min(0.5, it.p + BELT_SPEED * dt));
    if (it.p >= 1 && target) { b.item = null; give(target, it, b.d, it.p - 1); }
  }
  for (const e of entities) {
    if (e.type === 'chest') e.pop = Math.max(0, e.pop - dt * 2.5);
    if (e.type !== 'dispenser') continue;
    e.cd -= dt; e.busy = Math.max(0, e.busy - dt * 6);
    if (e.cd > 0) continue;
    const src = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => occ.get(key(e.x + dx, e.y + dy)))
      .find(c => c && c.type === 'chest' && c.store[e.mode] > 0);
    if (!src) continue;
    const target = pushTarget(e.x + DIR[e.d][0], e.y + DIR[e.d][1], e.d, e.mode);
    if (!target || target === src) continue;
    src.store[e.mode]--; e.cd = DISPENSE_CD; e.busy = 1;
    give(target, { type: e.mode, k: Math.floor(Math.random() * 5) }, e.d, 0);
  }
  intake.flash = Math.max(0, intake.flash - dt * 3);
}

function beltItemPos(b) {
  const p = b.item.p, cx = b.x * T + T / 2, cy = b.y * T + T / 2;
  const din = DIR[b.din], dout = DIR[b.d];
  if (b.din === b.d) return [cx + dout[0] * (p - 0.5) * T, cy + dout[1] * (p - 0.5) * T];
  // quarter circle around the corner pivot
  const px = cx - din[0] * T / 2 + dout[0] * T / 2, py = cy - din[1] * T / 2 + dout[1] * T / 2;
  const a = p * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
  return [px + (-dout[0] * c + din[0] * s) * T / 2, py + (-dout[1] * c + din[1] * s) * T / 2];
}

// ---------------------------------------------------------------------------
// Intake chest, building
// ---------------------------------------------------------------------------
const intake = { flash: 0 };
const airlock = { open: 0 };
const mainChest = () => occ.get(key(INTAKE_TILE.x + 1, INTAKE_TILE.y));   // the chest the intake feeds
const chestRoom = () => { const c = mainChest(); return c && c.type === 'chest' ? CHEST_CAP - chestTotal(c) : 0; };
function storeItem(type) {
  if (chestRoom() <= 0) return false;
  accept(mainChest(), type); intake.flash = 1;
  return true;
}

function placeBelt(x, y, d) {
  const old = occ.get(key(x, y));
  if (old && old.type === 'belt') {            // building over a belt just re-points it: free, keeps its item
    if (old.d !== d) { old.d = d; gridChanged(); }
    return old;
  }
  if (!canPlace('belt', x, y, d)) return 'blocked';
  const c = mainChest();
  if (!c || c.store.metal < BELT_COST) return 'no metal';
  c.store.metal -= BELT_COST;
  return addEntity('belt', x, y, d);
}
// returns the removed belt, or null; refunds its metal and any item it carried
function deconstructAt(x, y) {
  const e = occ.get(key(x, y));
  if (!e || e.type !== 'belt') return null;
  removeEntity(e);
  for (let i = 0; i < BELT_COST; i++) storeItem('metal');
  if (e.item) storeItem(e.item.type);
  return e;
}
function rotateAt(x, y) {
  const e = occ.get(key(x, y));
  if (!e || (e.type !== 'belt' && e.type !== 'dispenser')) return null;
  e.d = DIRS[(DIRS.indexOf(e.d) + 1) % 4];
  gridChanged();
  return e;
}

// ---------------------------------------------------------------------------
// Starting layout
// ---------------------------------------------------------------------------
addEntity('chest', 1, 4, 'E', { store: { rock: 5, metal: 8 } });
addEntity('dispenser', 2, 4, 'E');
for (let x = 3; x <= 12; x++) addEntity('belt', x, 4, 'E');
addEntity('turret', 13, 4, 'E', { ammo: Array(AMMO_MAX).fill('rock') });
addEntity('helm', 11, 2, 'E');
addEntity('reactor', 3, 6, 'E');

// ---------------------------------------------------------------------------
// Drawing (ship-local px)
// ---------------------------------------------------------------------------
function drawEntity(e, t, mode) {
  const [fw, fh] = footprint(e.type, e.d);
  ctx.save(); ctx.translate((e.x + fw / 2) * T, (e.y + fh / 2) * T); ctx.rotate(DIR_ANGLE[e.d]);
  if (e.type === 'chest') drawChest(-0.5, -0.5, e.store, CHEST_CAP, e.pop);
  else if (e.type === 'dispenser') drawDispenser(e.mode, t, e.busy);
  else if (e.type === 'reactor') drawReactor(-1, -1, t);
  else if (e.type === 'helm') { drawSeat(-T / 2, 0, 0); drawConsole(0, -0.5, 1, t, mode === 'pilot'); }
  else if (e.type === 'turret') drawTurretBase(e.ammo, AMMO_MAX, e.dry);
  ctx.restore();
}

function drawShipInterior(t, mode) {
  drawFloor(FLOOR_PTS, FLOOR_TILES);
  for (const [x, y] of FLOOR_TILES) if (!buildable.has(key(x, y))) drawNoBuild(x, y);
  drawAirlock(AIRLOCK_TILE.x, AIRLOCK_TILE.y, airlock.open, t);
  drawIntake(INTAKE_TILE.x, INTAKE_TILE.y, intake.flash, t, Math.PI / 2);
  const belts = entities.filter(e => e.type === 'belt');
  for (const b of belts) drawBelt(b, t, BELT_SPEED);
  for (const b of belts) if (b.item) { const [x, y] = beltItemPos(b); drawItem(b.item.type, x, y, b.item.k); }
  for (const e of entities) if (e.type !== 'belt') drawEntity(e, t, mode);
}
