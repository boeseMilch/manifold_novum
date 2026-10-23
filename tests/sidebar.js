// Encounter sidebar: plates appear for upcoming contacts and active problems, slide up from
// the bottom, carry a red light only for problems that are happening, and leave once dealt
// with. Run: node tests/sidebar.js
const { loadGame } = require('./harness');
const G = loadGame(['tick', 'render', 'mission', 'startMission', 'radarScan', 'encounterPlates', 'sidePlates', 'combat', 'combatSpawn',
  'combatClear', 'SYSTEMS', 'fires', 'spawnFire', 'VH', 'VW', 'power', 'window', 'HUD_H', 'plateLines', 'bannerLayout', 'wrapText', 'keepOffPanels', 'leftPanelRects']);
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const step = (n) => { for (let i = 0; i < n; i++) { G.combat.shots.length = 0; G.tick(DT); G.render(i * DT); } };

G.startMission(); G.power.reactor.fuel = 0;
step(60 * 2); G.radarScan(); step(2);   // (the first encounter comes at 15 s)
let list = G.encounterPlates();
const up = list.find(p => p.key.startsWith('ev'));
check(up && !up.red && /T-\d+/.test(up.sub), `a radar contact gets a plate with a countdown and no red light ("${up?.title}: ${up?.sub}")`);
const fresh = G.sidePlates.get(up.key);
check(fresh && fresh.x < -100, 'a new plate starts off to the left (it slides in)');
step(90);
check(G.sidePlates.get(up.key).x === 0 && G.sidePlates.get(up.key).y < 400, `…and sits in its slot (y=${Math.round(G.sidePlates.get(up.key).y)})`);
step(60 * 22);                                      // the interceptor arrives at T+40
list = G.encounterPlates();
const enemy = list.find(p => p.key.startsWith('enemy'));
check(enemy && enemy.red && !list.some(p => p.key === up.key), 'once the interceptor is here, its plate has a red light (the countdown plate is gone)');
const rest = list.filter(p => p.key !== 'objective');
check(rest[0] === enemy || rest[0].red, 'active problems are listed first (after the pinned objective)');
check(!G.mission.objective || list[0].key === 'objective', 'the objective is pinned at the top');
G.combatClear(); step(60);
check(!G.encounterPlates().some(p => p.key.startsWith('enemy')) && !G.sidePlates.has(enemy.key), 'dealt with: the plate slides away');
G.spawnFire(5, 8); step(2);
check(G.encounterPlates().some(p => p.key.startsWith('fire') && p.red), 'a fire gets a red plate');
G.SYSTEMS[0].broken = true; step(2);
check(G.encounterPlates().some(p => p.title === 'BROKEN' && p.sub === G.SYSTEMS[0].name), 'a broken part gets a plate until it is repaired');
// panels never overlap, also while they slide in / out and the list changes
G.SYSTEMS[3].broken = true; G.spawnFire(30, 8); G.combatSpawn('interceptor', 'port');
let overlap = 0;
for (let i = 0; i < 240; i++) {
  if (i === 60) G.SYSTEMS[0].broken = false;
  if (i === 120) G.combatClear();
  step(1);
  const ys = [...G.sidePlates.values()].filter(p => p.alpha > 0.01 && p.x > -268).map(p => p.y).sort((a, b) => a - b);
  for (let j = 1; j < ys.length; j++) if (ys[j] - ys[j - 1] < 58 - 0.01) overlap++;
}
check(!overlap, `no two visible panels overlap while the list changes (${overlap} overlapping frames)`);

// settled panels sit fully on screen: at several window sizes, after resizes, and when a panel's
// problem blinks out for single ticks (a multiplayer client between snapshots)
const settled = (p) => !p.leaving && p.age > 2;   // (a problem that just popped up may still be sliding in)
const onScreen = () => [...G.sidePlates.values()].filter(settled).every(p => p.x === 0 && p.alpha === 1 && p.y >= G.HUD_H && p.y + 58 <= G.VH);
for (const [w, h] of [[1600, 1000], [1024, 700], [800, 600], [1920, 1080]]) {
  G.window.innerWidth = w; G.window.innerHeight = h; G.listeners.resize?.();
  step(240);
  const ps = [...G.sidePlates.values()].filter(settled);
  check(G.VW === w && ps.length && onScreen(), `${w}×${h}: every settled panel is fully on screen (${ps.map(p => `x ${p.x.toFixed(1)} y ${Math.round(p.y)}`).join(', ')})`);
}
const keep = G.mission.objective || { kind: "intruder", count: 1 };
let worst = 0;
for (let i = 0; i < 180; i++) {
  G.mission.objective = i % 2 ? null : keep;         // (blinks every other tick)
  step(1);
  if (i > 90) worst = Math.min(worst, G.sidePlates.get('objective')?.x ?? -999);
}
G.mission.objective = keep; step(60);
check(worst === 0 && onScreen(), `a panel whose problem blinks out for single ticks stays put (worst x ${worst})`);
// a plate's second line: wrapped onto two lines when that fits, else cut off with '…'; worked out once per text
let measured = 0;
const w7 = (s) => { measured++; return s.length * 7; };     // (7 px a character)
const two = G.plateLines('rushed out of the base - five pirates', 150, true, w7);
check(two.length === 2 && two.every(l => l.length * 7 <= 150) && two.join(' ') === 'rushed out of the base - five pirates', `a long line wraps onto two ("${two.join(' / ')}")`);
const cut = G.plateLines('reactor heat 21% · canister in the left airlock room', 150, false, w7);
check(cut.length === 1 && cut[0].endsWith('…') && cut[0].length * 7 <= 157, `without wrapping it's cut off with an ellipsis ("${cut[0]}")`);
measured = 0;
check(G.plateLines('rushed out of the base - five pirates', 150, true, w7) === two && measured === 0, 'the same text again comes from the cache (no measuring)');
// the top banner fits the free gap between the sidebar and the right-hand HUD: short ones as they were, long ones on two
// lines (smaller if need be), never wider than the gap
const wpx = (s, px) => s.length * px * 0.55;              // (a character: 0.55 of the font size)
const shortB = G.bannerLayout('Shields up!', 600, wpx);
check(shortB.size === 22 && shortB.lines.length === 1, `a short banner stays one line at 22 px (${shortB.size} px)`);
const LONG = 'Canopy smashed — the pirate ship vents! Its crew are thrown about, then put their masks on.';
for (const room of [700, 520, 430]) {
  const b = G.bannerLayout(LONG, room, wpx);
  check(b.lines.length === 2 && b.lines.every(l => wpx(l, b.size) <= room) && b.lines.join(' ') === LONG,
    `a long banner in ${room} px: two lines at ${b.size} px, none wider ("${b.lines.join(' / ')}")`);
}
const tight = G.bannerLayout(LONG, 260, wpx);
check(tight.size === 16 && tight.lines.length >= 3 && tight.lines.every(l => wpx(l, 16) <= 260), `very little room: more lines at 16 px (${tight.lines.length})`);
check(G.wrapText('one two three', 1000, (s) => s.length).length === 1 && G.wrapText('one two three', 7, (s) => s.length).join('|') === 'one two|three', 'wrapText wraps on words');
// the in-world prompt keeps out from under the left-hand panels (and the inventory slots), at every screen width
const over = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const moved = (b, o) => ({ x: b.x + o.dx, y: b.y + o.dy, w: b.w, h: b.h });
const side = [{ x: 12, y: 46, w: 268, h: 62 }, { x: 12, y: 115, w: 268, h: 58 }, { x: 14, y: 782, w: 262, h: 104 }];
const clear = { x: 400, y: 300, w: 200, h: 30 };
check(JSON.stringify(G.keepOffPanels(clear, side, 760, 900)) === '{"dx":0,"dy":0}', 'a prompt clear of the panels stays where it is');
const under = { x: 60, y: 120, w: 330, h: 30 }, o1 = G.keepOffPanels(under, side, 760, 900), b1 = moved(under, o1);
check(!side.some(r => over(b1, r)) && b1.x + b1.w <= 760 && (o1.dx > 0 || o1.dy > 0), `under a plate on a 760 px screen: moved off it (dx ${o1.dx}, dy ${o1.dy})`);
const wide = { x: 30, y: 120, w: 600, h: 30 }, o2 = G.keepOffPanels(wide, side, 760, 900), b2 = moved(wide, o2);
check(!side.some(r => over(b2, r)) && o2.dx === 0 && b2.y >= 173, `too wide to go right of them: moved below the plates (y ${b2.y})`);
const low = { x: 40, y: 800, w: 300, h: 30 }, o3 = G.keepOffPanels(low, side, 760, 900), b3 = moved(low, o3);
check(!side.some(r => over(b3, r)) && b3.y + b3.h <= 900 - 8, `over the energy panel: moved off it, still on screen (dx ${o3.dx}, dy ${o3.dy})`);
for (const W of [760, 1024, 1400, 1920]) {
  G.window.innerWidth = W; G.window.innerHeight = 900; G.listeners.resize?.(); step(30);
  const rects = G.leftPanelRects(G.HUD_H);
  let bad = 0;
  for (let x = 0; x < W - 200; x += 37) for (let y = 40; y < 860; y += 29) {
    const b = { x, y, w: 200, h: 30 }, m = moved(b, G.keepOffPanels(b, rects, W, 900));
    if (rects.some(r => over(m, r)) || m.x + m.w > W) bad++;
  }
  check(G.VW === W && rects.length >= 2 && !bad, `${W} px wide: a prompt anywhere ends up under none of the ${rects.length} panels (${bad} bad)`);
}
process.exitCode = failed ? 1 : 0;
