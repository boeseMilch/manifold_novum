// The walk field (js/walkfield.js): where the crew walk, which drives the hairline floor scratches
// (js/gfx.js FW_PATH). Doorways and deck airlock shafts are strong and lined up with the way through,
// every destination is reachable, crates get box scuffs, and the packing for the shader round-trips.
// Run: node tests/walkfield.js
const { loadGame } = require('./harness');
const G = loadGame(['walkField', 'walkFieldPacked', 'DOORWAYS', 'DECK_LOCKS', 'SPINE_Y0', 'SPINE_Y1', 'CLUTTER', 'GFX', 'drawFloorSprites', 'CAT']);
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const F = G.walkField();
const deg = (a) => ((a * 180 / Math.PI) % 180 + 180) % 180;
const offAxis = (a, want) => { const d = Math.abs(deg(a) - want) % 180; return Math.min(d, 180 - d); };

check(F.dests.length >= 35, `${F.dests.length} destinations, all on free floor`);
check(F.dests.some(d => d.name === 'cat' && d.w >= 1.2), 'the cat is a destination (everyone stops to pet it)');
for (const d of G.DOORWAYS) {                      // doorways: walked through left-right, strongly
  const c = F.cells.get(Math.floor(d.x + d.w / 2) + ',' + Math.floor(d.y + d.h / 2));
  check(c && c.str > 0.4 && offAxis(c.ang, 0) < 20, `doorway at (${d.x}, ${d.y}): strong (${c && c.str.toFixed(2)}), along x (${c && deg(c.ang).toFixed(0)}°)`);
}
for (const L of G.DECK_LOCKS) {                    // deck airlocks: up and down
  const c = F.cells.get(Math.floor(L.x + L.w / 2) + ',' + Math.floor((G.SPINE_Y0 + G.SPINE_Y1) / 2));
  check(c && c.str > 0.5 && offAxis(c.ang, 90) < 20, `deck airlock ${L.col}: strong (${c && c.str.toFixed(2)}), along y (${c && deg(c.ang).toFixed(0)}°)`);
}
const fuel = G.CLUTTER.fuel, fc = F.cells.get(Math.floor(fuel.x + 1.1) + ',' + Math.floor(fuel.y));
check(fc && fc.box > 0.3, 'next to the fuel crate: box scuffs');
let round = true;                                  // packing (6 + 5 + 5 + 4 bits) decodes as the shader does
for (const [k, c] of F.cells) {
  const [gx, gy] = k.split(',').map(Number), v = G.walkFieldPacked(gx, gy);
  if (!Number.isInteger(v) || v < 0 || v >= 2 ** 20) { round = false; break; }
  const a = (v >> 14) / 64 * Math.PI, s = ((v >> 9) & 31) / 31;
  if (Math.abs(s - Math.min(1, c.str)) > 0.02 || (c.str > 0.05 && offAxis(a, deg(c.ang)) > 3)) { round = false; break; }
}
check(round, 'walkFieldPacked() round-trips direction and strength');
check(G.walkFieldPacked(-50, -50) === 0, 'off the floor: 0 (the hairlines stay as they were)');

// the floor tiles pass the field when path scratches are on (opts.floor[5..8]), not when off
const floors = [];
G.GFX.on = true; G.GFX.ready = () => true; G.GFX.sprite = (n, f, x, y, z, o) => { if (o && o.floor) floors.push(o.floor); return true; };
Object.defineProperty(G.GFX, 'pathScratches', { value: false, configurable: true });
G.drawFloorSprites();
check(floors.length > 50 && floors.every(f => f.length === 5), `path scratches off: ${floors.length} floor tiles, wear only`);
floors.length = 0;
Object.defineProperty(G.GFX, 'pathScratches', { value: true, configurable: true });
G.drawFloorSprites();
check(floors.every(f => f.length === 9) && floors.some(f => f.slice(5).some(v => v > 0)), 'path scratches on: + the walk field of the four plate cells');

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
