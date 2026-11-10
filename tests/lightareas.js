// The lighting's ambient areas (js/lights.js gameLighting → js/gfx.js): the shader takes GFX.MAX_AREAS of them and
// whatever is over the limit is lit as open space (2026-11-10: the pirate base needs 30, the limit was 24, so our
// outer airlocks and two base doorways ignored the power-out all mission). Every docked layout has to fit, and
// should a frame ever overflow, the areas off screen go first and the cut is announced.
// Run: node tests/lightareas.js
const { loadGame } = require('./harness');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const NAMES = ['startMission', 'mission', 'MISSIONS', 'combat', 'dockShip', 'gameLighting', 'simTick', 'GFX'];

const G0 = loadGame(NAMES), MAX = G0.GFX.MAX_AREAS, ids = Object.keys(G0.MISSIONS);
check(MAX >= 32 && MAX * 2 + 16 + 40 <= 224, `the shader's limit is ${MAX} areas: two uniform vectors each, with the walls and the rest inside the 224 WebGL2 guarantees`);
check(ids.length >= 8, `every mission is tried (${ids.join(', ')})`);
const counts = {}; let worst = 0;
for (const id of ids) for (const kind of [null, 'pirate', 'derelict', 'base']) for (const side of kind ? ['port', 'star'] : ['-']) {
  const G = loadGame(NAMES); G.startMission(id); G.mission.active = false; G.combat.enemies.length = 0;
  if (kind) G.dockShip(kind, side);
  for (let i = 0; i < 10; i++) G.simTick(1 / 60);
  const n = G.gameLighting(1).areas.length;
  counts[kind || 'alone'] = Math.max(counts[kind || 'alone'] || 0, n); worst = Math.max(worst, n);
}
check(counts.base > counts.alone && counts.pirate > counts.alone, `a docked ship adds its rooms (${Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(', ')})`);
check(worst <= MAX, `no mission's layout, alone or docked on either side, needs more than ${MAX} areas (the most: ${worst})`);
check(worst <= MAX - 4, `with room to spare for the next few (${MAX - worst} free)`);

// fitAreas: untouched while it fits; over the limit the off-screen areas go first, in order; then a cut, announced once
{
  const warns = [], G = loadGame(['GFX'], { console: { ...console, warn: (...a) => warns.push(a.join(' ')) } }), fit = G.GFX.fitAreas;
  const row = (n, y) => Array.from({ length: n }, (_, i) => ({ x: i * 2, y, w: 2, h: 2, id: `${y}/${i}` }));
  const few = row(5, 0);
  check(fit(few, { x0: 100, y0: 100, x1: 110, y1: 110 }, 8) === few, 'within the limit: the list is passed on as it is, whatever the view');
  const many = [...row(6, 0), ...row(6, 50)], view = { x0: -1, y0: 40, x1: 100, y1: 60 };
  const seen = fit(many, view, 8);
  check(seen.length === 6 && seen.every((a, i) => a.id === `50/${i}`) && !warns.length, 'over the limit: the areas the screen can\'t show are left out, the rest keep their order, no warning');
  const cut = fit(many, { x0: -1, y0: -1, x1: 100, y1: 60 }, 8); fit(many, null, 8);
  check(cut.length === 8 && cut.every((a, i) => a === many[i]) && warns.length === 1 && /light areas/.test(warns[0]), `still too many on screen: cut to the limit with one console warning (${warns.length}: ${warns[0] || '-'})`);
}
process.exitCode = failed ? 1 : 0;
