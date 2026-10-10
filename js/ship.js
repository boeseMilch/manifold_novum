// Ship layout (tile coordinates) and in-ship logistics:
// rear intake -> chest -> belt -> front turret.

const GW = 13, GH = 9;                        // tile grid incl. walls; the nose sticks out past x = 13
const SHIP_C = [7.2 * T, 4.5 * T];            // pivot/center of mass, ship-local px
const FLOOR = { x0: 1, y0: 1, x1: 12, y1: 8 };
const REACTOR = { x: 2, y: 2 };               // 2x2
const CONSOLE = { x: 11, y: 1, h: 3 };
const PILOT_SEAT = { x: 10, y: 2, face: 0 };
const GUN_TILE = { x: 12, y: 4 };             // the belt feeds into this front-wall tile
const GUN_POS = [12.95 * T, 4.5 * T];         // turret pivot, sitting in the nose
const GUNNER_SEAT = { x: 11, y: 5, face: -0.6 };   // faces the turret
const CHEST_TILE = { x: 1, y: 4 };
const INTAKE_TILE = { x: 0, y: 4 };           // rear wall, right behind the chest
const INTAKE_POS = [-0.3 * T, 4.5 * T];       // center of the vacuum field
const AIRLOCK_TILE = { x: 10, y: 8 };
const AMMO_MAX = 5;
const BELT_SPEED = 2.5;                       // tiles per second

const DIR = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
const key = (x, y) => x + ',' + y;
const tileCenter = (p) => [p.x * T + T / 2, p.y * T + T / 2];

const BELTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(x => ({ x, y: 4, d: 'E' }));
const beltAt = new Map(BELTS.map(b => [key(b.x, b.y), b]));
for (const b of BELTS) {
  b.item = null;
  // incoming direction: the direction of a belt that feeds into this tile
  const feeder = BELTS.find(o => o.x + DIR[o.d][0] === b.x && o.y + DIR[o.d][1] === b.y);
  b.din = feeder ? feeder.d : b.d;
}
const FIRST_BELT = beltAt.get(key(CHEST_TILE.x + 1, CHEST_TILE.y));

const blocked = new Set();
for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
  if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) blocked.add(key(x, y));
}
for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) blocked.add(key(REACTOR.x + dx, REACTOR.y + dy));
for (let i = 0; i < CONSOLE.h; i++) blocked.add(key(CONSOLE.x, CONSOLE.y + i));
blocked.add(key(CHEST_TILE.x, CHEST_TILE.y));
const isBlocked = (x, y) => x < 0 || y < 0 || x >= GW || y >= GH || blocked.has(key(x, y));

const gun = { ammo: AMMO_MAX, rel: 0, cd: 0, flash: 0, dry: 0 };
const chest = { count: 2, pop: 0, outCd: 0 };
const intake = { flash: 0 };
const airlock = { open: 0 };

function beltNext(b) {
  const nx = b.x + DIR[b.d][0], ny = b.y + DIR[b.d][1];
  if (nx === GUN_TILE.x && ny === GUN_TILE.y) return 'gun';
  return beltAt.get(key(nx, ny)) || null;
}

// One item per tile. An item may only pass the tile center if the next
// tile (or the gun) can take it, so a blocked line backs up tile by tile.
function updateBelts(dt) {
  for (let i = BELTS.length - 1; i >= 0; i--) {   // downstream first
    const b = BELTS[i], it = b.item;
    if (!it) continue;
    const next = beltNext(b);
    const canLeave = next === 'gun' ? gun.ammo < AMMO_MAX : next && !next.item;
    it.p = Math.min(canLeave ? 1 : 0.5, it.p + BELT_SPEED * dt);
    if (it.p >= 1 && canLeave) {
      if (next === 'gun') gun.ammo++;
      else next.item = { p: it.p - 1, k: it.k };
      b.item = null;
    }
  }
  chest.outCd -= dt;
  if (chest.count > 0 && !FIRST_BELT.item && chest.outCd <= 0) {
    chest.count--; chest.outCd = 0.25;
    FIRST_BELT.item = { p: 0, k: Math.floor(Math.random() * 5) };
  }
  chest.pop = Math.max(0, chest.pop - dt * 2.5);
  intake.flash = Math.max(0, intake.flash - dt * 3);
}

function storeRock(n) {
  chest.count += n; chest.pop = 1; intake.flash = 1;
}

function beltItemPos(b) {
  const p = b.item.p, [cx, cy] = tileCenter(b);
  const din = DIR[b.din], dout = DIR[b.d];
  if (b.din === b.d) return [cx + dout[0] * (p - 0.5) * T, cy + dout[1] * (p - 0.5) * T];
  // quarter circle around the corner pivot
  const px = cx - din[0] * T / 2 + dout[0] * T / 2, py = cy - din[1] * T / 2 + dout[1] * T / 2;
  const a = p * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
  return [px + (-dout[0] * c + din[0] * s) * T / 2, py + (-dout[1] * c + din[1] * s) * T / 2];
}

function drawShipInterior(t, mode) {
  drawFloor(FLOOR);
  drawReactor(REACTOR.x, REACTOR.y, t);
  drawSeat(...tileCenter(PILOT_SEAT), PILOT_SEAT.face);
  drawConsole(CONSOLE.x, CONSOLE.y, CONSOLE.h, t, mode === 'pilot');
  drawSeat(...tileCenter(GUNNER_SEAT), GUNNER_SEAT.face);
  drawAirlock(AIRLOCK_TILE.x, AIRLOCK_TILE.y, airlock.open, t);
  drawIntake(INTAKE_TILE.x, INTAKE_TILE.y, intake.flash, t, Math.PI / 2);
  for (const b of BELTS) drawBelt(b, t, BELT_SPEED);
  drawChest(CHEST_TILE.x, CHEST_TILE.y, chest.count, chest.pop);
  for (const b of BELTS) if (b.item) { const [x, y] = beltItemPos(b); drawRockItem(x, y, b.item.k); }
  drawAmmoPips(13.2 * T, 2.72 * T, gun.ammo, AMMO_MAX, gun.dry);
}
