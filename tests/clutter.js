// Clutter collision: everything standing on the floor (crates, toolbox, plant, snack machine, weight
// rack, ...) is solid, nothing solid traps anyone, and what you can click stays in reach.
// Run: node tests/clutter.js
const { loadGame } = require('./harness');
const NAMES = ['GFX', 'SOLIDS', 'CLUTTER', 'clutterRect', 'ROOMS', 'ROOM_RECTS', 'DOORWAYS', 'DECK_LOCKS', 'canStand', 'walkRects', 'inRect', 'roomAt',
  'drawPropDecor', 'drawFloorDecor', 'drawInterior', 'drawHazardProps', 'drawEncounterProps', 'drawMinigameProps', 'mission', 'hz',
  'NAV', 'CREW_R', 'REACH', 'ITEMS', 'dropSpot', 'PLATE_CRATES', 'COOLANT_CRATE', 'FUEL_CRATE', 'SNACK', 'PATCH_BOARD', 'GUNS', 'HATCHES',
  'BREACH_SPOTS', 'GRAV_PANELS', 'SHIELD_BUTTONS', 'CAPACITORS', 'CAT', 'LEVER'];
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const G = loadGame(NAMES);

// 1. Every sprite drawn standing on a room's floor (not flat decals, not wall signs, not on a table)
//    has a solid under its origin, or is on the walk-through list.
const WALK_THROUGH = [
  /^props\/duck_/, /^props\/cat_/, /^props\/stool$/,     // tiny / the cat (you can pet it) / the kitchen stools
  /^props\/socks$/,                                     // the washing line itself (its two stands are solid)
  /^props\/plunger$/, /^props\/cable_engine_/,           // a plunger, floor cables
  /^systems\/mug_/,                                     // drawn from the floor, lands on the helm desk (solid anyway)
  /^systems\/vent_/, /^systems\/grav_/,                 // the vent valve on the wall, the gravity breaker floor plate
  /^systems\/jump_/,                                    // the jump handle (a pull lever, like the power lever)
  /^props\/toilet_stall$/, /^systems\/treadmill$/,       // origin on the floor inside them: their walls / rails are FURNITURE
];
const drawn = [];
G.GFX.on = true; G.GFX.ready = () => true; G.GFX.has = () => true; G.GFX.layer2d = () => null;
G.GFX.sprite = (name, f, x, y, z = 0, o = {}) => { drawn.push({ name, x, y, z, layer: o.layer || 'main' }); return true; };
G.mission.rules = { ...(G.mission.rules || {}), handle: true };
for (const fn of ['drawPropDecor', 'drawFloorDecor', 'drawInterior', 'drawHazardProps', 'drawEncounterProps', 'drawMinigameProps']) {
  try { G[fn](0); } catch (e) { /* a 2D fallback needing a real canvas: the sprites before it are recorded */ }
}
G.GFX.on = false;
const floor = drawn.filter(d => d.layer === 'main' && !d.z && G.roomAt(d.x, d.y));
const bare = floor.filter(d => !WALK_THROUGH.some(re => re.test(d.name)) && !G.SOLIDS.some(S => G.inRect(d.x, d.y, S, 0.02)));
check(floor.length >= 20, `found ${floor.length} sprites standing on the floor`);
check(!bare.length, `every one of them is solid or meant to be walked through${bare.length ? ': missing ' + bare.map(d => `${d.name} (${d.x}, ${d.y})`).join(', ') : ''}`);
for (const n of ['props/crate_ammo_star', 'props/crate_misc', 'props/toolbox', 'props/sleeping_bag', 'props/crate_tape', 'props/crate_blank_star', 'props/weight_rack', 'systems/coolant'])
  check(floor.some(d => d.name === n || d.name.startsWith(n)), `${n} is drawn on the floor (and so covered by the check above)`);
check(floor.some(d => /^systems\/plates_a_/.test(d.name)) && floor.some(d => /^systems\/plates_b_/.test(d.name)), 'both hull plate crates are drawn (and checked)');

// 2. Clutter boxes stay inside their room and clear of doorways, deck airlock doors and each other's gaps
//    small enough to get stuck in (a gap is either < 2 CREW_R, so nobody fits, or ≥ 2 CREW_R + a bit).
const boxes = Object.entries(G.CLUTTER).map(([k, c]) => ({ k, r: G.clutterRect(c) }));
for (const { k, r } of boxes) {
  const inside = G.ROOM_RECTS.some(q => r.x >= q.x - 1e-6 && r.y >= q.y - 1e-6 && r.x + r.w <= q.x + q.w + 1e-6 && r.y + r.h <= q.y + q.h + 1e-6);
  const doorClear = G.DOORWAYS.every(d => !G.inRect(d.x + d.w / 2, d.y + d.h / 2, { x: r.x - 1.2, y: r.y - 0.6, w: r.w + 2.4, h: r.h + 1.2 }));
  const lockClear = G.DECK_LOCKS.every(L => ['top', 'bottom'].every(s => { const q = L.doorRect[s]; return r.x > q.x + q.w + 0.5 || r.x + r.w < q.x - 0.5 || r.y > q.y + q.h + 0.8 || r.y + r.h < q.y - 0.8; }));
  check(inside && doorClear && lockClear, `${k}: inside its room, clear of doorways and deck airlock doors`);
}

// 3. Walkable area: a flood fill (crew-sized steps, all doors open) from the bridge reaches every free
//    spot on board (no closed-off pockets behind the clutter) and every room.
for (const d of G.DOORWAYS) d.open = 1;
for (const L of G.DECK_LOCKS) { L.doors.top = 1; L.doors.bottom = 1; }
const rects = G.walkRects(), STEP = 0.1;
const key = (i, j) => i * 10000 + j, X0 = -1, Y0 = -4;
const ok = (i, j) => G.canStand(X0 + i * STEP, Y0 + j * STEP, rects);
const seen = new Set(), q = [[Math.round((22.2 - X0) / STEP), Math.round((4.5 - Y0) / STEP)]];
seen.add(key(...q[0]));
while (q.length) {
  const [i, j] = q.pop();
  for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) if (!seen.has(key(a, b)) && ok(a, b)) { seen.add(key(a, b)); q.push([a, b]); }
}
const reach = [...seen].map(k => [X0 + Math.floor(k / 10000) * STEP, Y0 + (k % 10000) * STEP]);
let pockets = [];
for (let i = 0; i < 480; i++) for (let j = 0; j < 320; j++) if (ok(i, j) && !seen.has(key(i, j))) pockets.push([+(X0 + i * STEP).toFixed(1), +(Y0 + j * STEP).toFixed(1)]);
check(!pockets.length, `no free floor is cut off from the rest of the ship${pockets.length ? ` (${pockets.length} spots, e.g. ${pockets.slice(0, 4).join(' / ')})` : ''}`);
for (const r of G.ROOMS) check(reach.some(([x, y]) => r.rects.some(q => G.inRect(x, y, q))), `${r.name} can be walked into`);
// everything you click or work on can be reached from free floor
const reachable = (x, y, r = G.REACH) => reach.some(([px, py]) => Math.hypot(px - x, py - y) <= r);
const targets = [
  ...G.PLATE_CRATES.map((p, i) => [`hull plate crate ${i + 1}`, p.x, p.y]),
  ['coolant crate', G.COOLANT_CRATE.x, G.COOLANT_CRATE.y], ['fuel crate', G.FUEL_CRATE.x, G.FUEL_CRATE.y],
  ['snack machine', G.SNACK.x, G.SNACK.y], ['patch board', G.PATCH_BOARD.x, G.PATCH_BOARD.y], ['the cat', G.CAT.x, G.CAT.y],
  ['power lever', G.LEVER.x, G.LEVER.y],
  ...G.GUNS.map(g => [`${g.name} ladder`, ...g.hatch]),
  ...G.HATCHES.map(h => [`${h.side} outer airlock`, ...h.inside]),
  ...Object.entries(G.BREACH_SPOTS).map(([k, b]) => [`breach spot ${k}`, b.x, b.y]),
  ...Object.entries(G.GRAV_PANELS).map(([k, p]) => [`gravity breaker ${k}`, ...p]),
  ...G.SHIELD_BUTTONS.map(b => [`${b.side} shield button`, b.x, b.y]),
  ...G.CAPACITORS.map((c, i) => [`capacitor ${i}`, c.x, c.y]),
  ...G.ITEMS.map(it => [`the ${it.kind} (start)`, it.x, it.y]),
];
const far = targets.filter(([, x, y]) => !reachable(x, y));
check(!far.length, `all ${targets.length} things to click are within reach of free floor${far.length ? ': not ' + far.map(t => t[0]).join(', ') : ''}`);
check(G.ITEMS.every(it => G.canStand(it.x, it.y, rects)), 'the items start on free floor (pirates and crew can step onto them)');

// 4. The intruder's / pirates' room-to-door routes (NAV edges) are straight lines: none may run through a solid.
const blocked = [];
for (let a = 0; a < G.NAV.nodes.length; a++) for (const b of G.NAV.nb[a]) {
  if (b < a) continue;
  const A = G.NAV.nodes[a], B = G.NAV.nodes[b], n = Math.ceil(Math.hypot(B.x - A.x, B.y - A.y) / 0.05);
  for (let k = 0; k <= n; k++) {
    const x = A.x + (B.x - A.x) * k / n, y = A.y + (B.y - A.y) * k / n;
    if (G.SOLIDS.some(S => G.inRect(x, y, S, G.CREW_R + 0.02))) { blocked.push(`(${A.x.toFixed(1)}, ${A.y.toFixed(1)}) → (${B.x.toFixed(1)}, ${B.y.toFixed(1)})`); break; }
  }
}
check(!blocked.length, `no intruder / pirate route runs through a solid${blocked.length ? ': ' + blocked.join(', ') : ''}`);

// 5. Items dropped on (or next to) a crate land on free floor next to it, never inside.
for (const { k, r } of boxes) {
  const p = G.dropSpot(r.x + r.w / 2, r.y + r.h / 2);
  const free = !G.SOLIDS.some(S => G.inRect(p.x, p.y, S, G.CREW_R)) && G.canStand(p.x, p.y, rects);
  check(free && Math.hypot(p.x - r.x - r.w / 2, p.y - r.y - r.h / 2) < 1.6, `dropped on the ${k}: lands on free floor next to it (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
}

console.log(failed ? `\n${failed} FAILED` : '\nall clutter checks passed');
process.exit(failed ? 1 : 0);
