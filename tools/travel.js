// Travel times inside the ship, measured by walking a crew member through the real game logic
// (walking speed and acceleration, doorways, deck-airlock cycles), steered with WASD like a player.
//
//   node tools/travel.js                     room-to-room table (middle of room A → middle of room B)
//   node tools/travel.js reactor portGun     one trip, between rooms (ids: portGun bridge starGun portLock reactor starLock)
//   node tools/travel.js "left capacitor" helm   between interactables (part / station names, any case)
//   node tools/travel.js 7,19 "front cannon"  or from / to a point (x,y in layout units)
//   node tools/travel.js reactor portGun --boots --airlocks   with gravity boots / the faster airlock pumps
//   node tools/travel.js --table             rebuild tools/travel-table.json: every pair of SPOTS (the places tools/balance.js
//                                            sends the crew), with and without the kit (~1-2 min, 4 processes). Rebuild it
//                                            after moving rooms, doors or stations, or when balance.js warns about a missing trip
//
// Each trip is walked twice: with every deck airlock open towards you (best) and towards the far side
// (worst: you wait for a full cycle). "enter" is when you step into the target room, "at" when you're
// at the target: within click reach of an interactable, or at the middle of a room.
// From code: const { travel } = require('../tools/travel'); travel('portGun', 'reactor') → { best, worst, ... }
const { loadGame } = require('../tests/harness');
const DT = 1 / 60;
const NAMES = ['tick', 'player', 'ROOMS', 'SYSTEMS', 'STATIONS', 'DECK_LOCKS', 'NAV', 'NAV_SPOTS', 'navPath', 'nearestNav',
  'ROOM_RECTS', 'DOORWAYS', 'roomAt', 'sysRooms', 'sabotageSpot', 'REACH', 'CREW_R', 'SPINE_Y0', 'SPINE_Y1', 'canStand', 'applyShipUpgrades'];

// A target: { name, x, y (where to stand / the middle), room, reach (how close counts as there) }
function resolve(G, spec) {
  if (typeof spec === 'object') return spec;
  const s = String(spec).trim(), low = s.toLowerCase();
  const room = G.ROOMS.find(r => r.id.toLowerCase() === low || r.name.toLowerCase() === low);
  if (room) { const [x, y] = G.NAV_SPOTS[room.id]; return { name: room.name, x, y, room, reach: 0.4 }; }
  const m = s.match(/^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/);
  if (m) { const x = +m[1], y = +m[2]; return { name: `(${x}, ${y})`, x, y, room: G.roomAt(x, y), reach: 0.4 }; }
  const part = [...G.SYSTEMS, ...G.STATIONS].find(p => p.name.toLowerCase() === low) ||
               [...G.SYSTEMS, ...G.STATIONS].find(p => p.name.toLowerCase().includes(low));
  if (!part) throw new Error(`unknown place "${spec}" (a room id/name, a part or station name, or x,y)`);
  const rooms = G.SYSTEMS.includes(part) ? G.sysRooms(part) : [G.roomAt(part.x, part.y + 0.8)].filter(Boolean);
  return { name: part.name, part, rooms, room: rooms[0], x: part.x, y: part.y, reach: G.REACH + (part.r || 0) * 0.6 };
}
// Where you stand when you start at a target: an interactable's standing spot, else the point itself.
function standAt(G, t, otherEnd) {
  if (!t.part) return [t.x, t.y];
  // of the part's rooms, start in the one nearest the other end (a deck airlock is used from either deck)
  const rooms = [...(t.rooms || [t.room])].sort((a, b) => dist(G.NAV_SPOTS[a.id], otherEnd) - dist(G.NAV_SPOTS[b.id], otherEnd));
  for (const r of rooms) { const s = G.sabotageSpot(t.part, r); if (s) return s; }
  return [t.x, t.y + 0.8];
}
const dist = ([x0, y0], [x1, y1]) => Math.hypot(x1 - x0, y1 - y0);

// Where a crew member can stand with every door open (doors are waited for, not walked around):
// a 0.2-unit grid over the ship, built once per game from the game's own canStand (walls + furniture).
const CELL = 0.2;
function standGrid(G) {
  if (G._grid) return G._grid;
  const rects = [...G.ROOM_RECTS, ...G.DOORWAYS, ...G.DECK_LOCKS.flatMap(L => [L.chamber, L.doorRect.top, L.doorRect.bottom])];
  const x0 = -1, y0 = -4, W = Math.ceil(48 / CELL), H = Math.ceil(32 / CELL), ok = new Uint8Array(W * H);
  const m = 0.08;                                     // keep the route a little off walls and door frames
  const stand = (x, y) => G.canStand(x, y, rects) && G.canStand(x - m, y, rects) && G.canStand(x + m, y, rects) && G.canStand(x, y - m, rects) && G.canStand(x, y + m, rects);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) ok[j * W + i] = stand(x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL) ? 1 : 0;
  const cell = (x, y) => [Math.floor((x - x0) / CELL), Math.floor((y - y0) / CELL)];
  const free = (x, y) => { const [i, j] = cell(x, y); return i >= 0 && j >= 0 && i < W && j < H && ok[j * W + i] === 1; };
  return (G._grid = { x0, y0, W, H, ok, cell, free, at: (i, j) => [x0 + (i + 0.5) * CELL, y0 + (j + 0.5) * CELL] });
}
// Shortest route on the grid (A*, 8 neighbours, no squeezing diagonally past corners).
function route(G, [sx, sy], [gx, gy]) {
  const g = standGrid(G), { W, H, ok } = g;
  const near = (x, y) => {                              // nearest free cell (a spot may sit right against something)
    const [ci, cj] = g.cell(x, y);
    for (let r = 0; r < 12; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i >= 0 && j >= 0 && i < W && j < H && ok[j * W + i]) return j * W + i;
    }
    return -1;
  };
  const s = near(sx, sy), t = near(gx, gy);
  if (s < 0 || t < 0) return null;
  const cost = new Float64Array(W * H).fill(Infinity), prev = new Int32Array(W * H).fill(-1), open = [[0, s]];
  const h = (k) => { const dx = Math.abs(k % W - t % W), dy = Math.abs(((k / W) | 0) - ((t / W) | 0)); return (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)) * CELL; };
  cost[s] = 0;
  while (open.length) {
    let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
    const [, k] = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (k === t) break;
    const i = k % W, j = (k / W) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj, n = nj * W + ni;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H || !ok[n]) continue;
      if (di && dj && (!ok[j * W + ni] || !ok[nj * W + i])) continue;
      const c = cost[k] + (di && dj ? Math.SQRT2 : 1) * CELL;
      if (c < cost[n]) { cost[n] = c; prev[n] = k; open.push([c + h(n), n]); }
    }
  }
  if (prev[t] < 0 && s !== t) return null;
  const path = [];
  for (let k = t; k >= 0; k = prev[k]) path.unshift(g.at(k % W, (k / W) | 0));
  path.push([gx, gy]);
  return path;
}
// Clear for a crew member's whole width on the grid (three parallel lines)?
function clearLine(G, x0, y0, x1, y1) {
  const g = standGrid(G), d = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / d * 0.15, ny = (x1 - x0) / d * 0.15, n = Math.ceil(d / 0.1);
  for (const k of [0, 1, -1]) for (let i = 1; i <= n; i++) if (!g.free(x0 + (x1 - x0) * i / n + nx * k, y0 + (y1 - y0) * i / n + ny * k)) return false;
  return true;
}

// One walk: returns { enter, at } in seconds (null if it never got there within `limit`).
function walk(G, from, to, lockSide, limit = 90) {
  for (const L of G.DECK_LOCKS) { L.open = lockSide(L); L.doors.top = +(L.open === 'top'); L.doors.bottom = +(L.open === 'bottom'); L.phase = 'idle'; L.target = null; L.entry = null; L.locked = false; }
  const [sx, sy] = standAt(G, from, [to.x, to.y]);
  const P = G.player;
  Object.assign(P, { x: sx, y: sy, vx: 0, vy: 0, mode: 'inside', health: 'ok' });
  P.lockSide = {};
  const goal = to.part ? standAt(G, to, [sx, sy]) : [to.x, to.y];
  const path = route(G, [sx, sy], goal);
  if (!path) return { enter: null, at: null };
  const keys = new Set();
  const setKeys = (want) => {
    for (const k of keys) if (!want.has(k)) { G.listeners.keyup({ code: k }); keys.delete(k); }
    for (const k of want) if (!keys.has(k)) { G.listeners.keydown({ code: k, preventDefault() {} }); keys.add(k); }
  };
  const targetRooms = to.rooms || (to.room ? [to.room] : []);
  let enter = null, at = null, t = 0, idx = 0, still = 0, px = P.x, py = P.y;
  for (; t < limit && at === null; t += DT) {
    // like a player: head for the farthest point of the route that's in clear view
    let best = idx, bd = Infinity;
    for (let j = idx; j < Math.min(path.length, idx + 30); j++) { const d = Math.hypot(path[j][0] - P.x, path[j][1] - P.y); if (d < bd) { bd = d; best = j; } }
    idx = best;
    let aim = Math.min(idx + 1, path.length - 1);
    for (let j = Math.min(path.length - 1, idx + 60); j > idx; j--) if (clearLine(G, P.x, P.y, path[j][0], path[j][1])) { aim = j; break; }
    // pressed against a frame (a door that's open but we're a hair off): step along the route itself
    still = Math.hypot(P.x - px, P.y - py) < 0.005 ? still + DT : 0; px = P.x; py = P.y;
    if (still > 0.3 && still % 1 < 0.5) aim = Math.min(idx + 2, path.length - 1);
    const [wx, wy] = path[aim];
    // WASD towards it: the minor axis only when it's more than ~22° off (as close as 8 directions get)
    const dx = wx - P.x, dy = wy - P.y, want = new Set(), ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > 0.08 && ax > ay * 0.41) want.add(dx > 0 ? 'KeyD' : 'KeyA');
    if (ay > 0.08 && ay > ax * 0.41) want.add(dy > 0 ? 'KeyS' : 'KeyW');
    setKeys(want);
    G.tick(DT);
    const r = G.roomAt(P.x, P.y);
    if (enter === null && r && targetRooms.includes(r)) enter = t + DT;
    if (Math.hypot(to.x - P.x, to.y - P.y) <= to.reach) at = t + DT;
  }
  setKeys(new Set());
  return { enter: enter ?? at, at };
}

// Best and worst case for one trip (fresh game each time, so nothing carries over).
// opts: { boots } walks with gravity boots (the game's gearSpeed), { airlocks } with the faster airlock pumps.
function travel(fromSpec, toSpec, opts = {}) {
  const out = {};
  for (const [k, side] of [['best', 'toward'], ['worst', 'away']]) {
    const G = loadGame(NAMES);
    if (opts.airlocks) G.applyShipUpgrades({ airlocks: true });
    if (opts.boots) G.player.kit = { gear: { boots: true }, profession: null };
    const from = resolve(G, fromSpec), to = resolve(G, toSpec);
    const [sx, sy] = standAt(G, from, [to.x, to.y]);
    const startDeck = sy < G.SPINE_Y0 ? 'top' : 'bottom';
    const lockSide = () => (side === 'toward') === (startDeck === 'top') ? 'top' : 'bottom';
    out[k] = walk(G, from, to, lockSide);
    out.from = from.name; out.to = to.name;
  }
  return out;
}

// The travel table: every trip between the places the balance model uses, measured once and saved
// (tools/travel-table.json), so a balance run doesn't walk them again. Per variant (kit) and pair: [best, worst]
// seconds to be there (deck airlocks open towards you / the other way; 'at', or 'enter' if never in reach).
const SPOTS = ['bridge', 'reactor', 'portGun', 'starGun', 'portLock', 'starLock', 'Reactor', 'Helm', 'Security', 'Power lever',
  'Front cannon', 'Left cannon', 'Right cannon', 'Left shield button', 'Right shield button', 'Left outer airlock', 'Right outer airlock'];
const VARIANTS = { plain: {}, boots: { boots: true }, airlocks: { airlocks: true }, both: { boots: true, airlocks: true } };
const TABLE_FILE = require('path').join(__dirname, 'travel-table.json');
const variantOf = (opts) => (opts.boots ? (opts.airlocks ? 'both' : 'boots') : opts.airlocks ? 'airlocks' : 'plain');
function measure(from, to, opts) {                  // one pair as the table stores it
  const r = travel(from, to, opts), b = r.best.at ?? r.best.enter ?? 15, w = r.worst.at ?? r.worst.enter ?? b + 3;
  return [Math.round(b * 100) / 100, Math.round(w * 100) / 100];
}
function tableVariant(v) {
  const out = {};
  for (const a of SPOTS) { out[a] = {}; for (const b of SPOTS) if (a !== b) out[a][b] = measure(a, b, VARIANTS[v]); }
  return out;
}
let tableCache;
const loadTable = () => {
  if (tableCache === undefined) { try { tableCache = JSON.parse(require('fs').readFileSync(TABLE_FILE, 'utf8')); } catch { tableCache = null; } }
  return tableCache;
};
// A trip from the table: [best, worst] seconds, or null if it isn't in there.
const tableTrip = (from, to, opts = {}) => loadTable()?.trips?.[variantOf(opts)]?.[from]?.[to] || null;

const fmt = (v) => (v == null ? '  —  ' : v.toFixed(1).padStart(5));
if (require.main === module) {
  const all = process.argv.slice(2), args = all.filter(a => !a.startsWith('--'));
  const opts = { boots: all.includes('--boots'), airlocks: all.includes('--airlocks') };
  if (all[0] === '--table-variant') process.stdout.write(JSON.stringify(tableVariant(all[1])));
  else if (all[0] === '--table') {
    const { spawn } = require('child_process'), t0 = Date.now();
    Promise.all(Object.keys(VARIANTS).map(v => new Promise((res, rej) => {
      const p = spawn(process.execPath, [__filename, '--table-variant', v]); let out = '';
      p.stdout.on('data', d => (out += d)); p.stderr.pipe(process.stderr);
      p.on('close', c => (c ? rej(new Error(`variant ${v} failed`)) : res([v, JSON.parse(out)])));
    }))).then(rs => {
      const trips = Object.fromEntries(rs);
      require('fs').writeFileSync(TABLE_FILE, JSON.stringify({ about: 'travel times in s, [deck airlocks open towards you, the other way]; node tools/travel.js --table', spots: SPOTS, trips }, null, 0).replace(/\],"/g, '],\n"') + '\n');
      console.log(`${TABLE_FILE}: ${SPOTS.length} spots, ${Object.keys(VARIANTS).length} variants, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    });
  } else if (args.length === 2) {
    const r = travel(args[0], args[1], opts);
    console.log(`${r.from} → ${r.to}`);
    console.log(`  deck airlocks open towards you:   enter ${fmt(r.best.enter)} s   there ${fmt(r.best.at)} s`);
    console.log(`  deck airlocks open the other way: enter ${fmt(r.worst.enter)} s   there ${fmt(r.worst.at)} s`);
  } else if (!args.length) {
    const G = loadGame(NAMES), ids = G.ROOMS.map(r => r.id);
    console.log('Room middle → room middle, seconds (deck airlocks open towards you / the other way):\n');
    console.log(''.padEnd(10) + ids.map(id => id.padStart(13)).join(''));
    for (const a of ids) {
      const cells = ids.map(b => { if (a === b) return '—'.padStart(13); const r = travel(a, b); return `${r.best.at.toFixed(1)} / ${r.worst.at.toFixed(1)}`.padStart(13); });
      console.log(a.padEnd(10) + cells.join(''));
    }
  } else { console.log('usage: node tools/travel.js [from to]'); process.exitCode = 1; }
}

module.exports = { travel, tableTrip, SPOTS, VARIANTS, TABLE_FILE, route, clearLine };
