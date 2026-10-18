// Power lines: reactor → trunk → power lever → one branch per output (feed0..2) → capacitors, the energy
// bolts' way along them, their timing, and that the cables lie on open floor. Run: node tests/cables.js
const { loadGame } = require('./harness');
const G = loadGame(['tick', 'power', 'POWER_LINES', 'POWER_FITTINGS', 'LINE', 'LEVER', 'LEVER_DIAL', 'REACTOR', 'CAPACITORS', 'SYSTEMS',
  'SOLIDS', 'ROOM_RECTS', 'DOORWAYS', 'ENERGY_TIME', 'BOLT_TIME', 'boltPoint', 'boltAtLever', 'leverShownPos', 'linePoint',
  'powerLineLive', 'lineDead', 'lineState', 'nextFeed', 'surgeColumn', 'hz', 'combatClear', 'paceFactor',
  'leverAngle', 'LEVER_NAMES', 'LEVER_HANDLE_STEP', 'LEVER_HANDLE_FRAMES', 'CAT']);
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inRect = (r, x, y, m = 0) => x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m;
const lever = [G.LEVER.x, G.LEVER.y];
const fitsOf = (id) => G.POWER_FITTINGS.filter(f => f.line === id);

// --- topology: one trunk from the reactor into the lever; each feed leaves the lever for its capacitor
const trunk = G.LINE.trunk;
check(!!trunk && trunk.feed && trunk.cap === -1, 'there is a trunk line (a feed, no capacitor)');
const [tIn, tOut] = fitsOf('trunk');
const Rc = G.REACTOR;
check(tIn.kind === 'plug' && Math.abs(tIn.y - (Rc.y + Rc.h / 2)) < 0.01 && tIn.x > Rc.x - Rc.w / 2 && tIn.x < Rc.x + Rc.w / 2,
  `the trunk starts in a plug on the reactor's front face (${tIn.x}, ${tIn.y})`);
check(tOut.kind === 'gland' && Math.abs(dist([tOut.x, tOut.y], lever) - G.LEVER_DIAL) < 0.01, 'the trunk ends in a gland on the lever dial');
for (let i = 0; i < 3; i++) {
  const l = G.LINE['feed' + i], [a, b] = fitsOf('feed' + i), c = G.CAPACITORS[i];
  check(l.cap === i && l.feed, `feed${i} feeds capacitor ${i}`);
  check(a.kind === 'gland' && Math.abs(dist([a.x, a.y], lever) - G.LEVER_DIAL) < 0.01, `feed${i} starts in a gland on the lever dial`);
  check(b.kind === 'plug' && dist([b.x, b.y], [c.x, c.y]) < 1.2, `feed${i} ends in a plug on capacitor ${i}`);
  check(!fitsOf('feed' + i).some(f => Math.abs(f.x - Rc.x) < Rc.w / 2 + 0.05 && Math.abs(f.y - Rc.y) < Rc.h / 2 + 0.05), `feed${i} no longer plugs into the reactor`);
}
const glands = G.POWER_FITTINGS.filter(f => f.kind === 'gland');
check(glands.length === 4 && new Set(glands.map(f => Math.round(f.a * 100))).size === 4, 'four glands on the lever, each facing its own way');
for (let i = 0; i < glands.length; i++) for (let j = i + 1; j < glands.length; j++)
  check(dist([glands[i].x, glands[i].y], [glands[j].x, glands[j].y]) > 0.3, `glands ${glands[i].line} and ${glands[j].line} don't overlap`);

// --- the trunk and the branches lie on open floor (not under machines or crates, not in walls)
const onFloor = (x, y) => [...G.ROOM_RECTS, ...G.DOORWAYS].some(r => inRect(r, x, y));
for (const id of ['trunk', 'feed0', 'feed1', 'feed2']) {
  const l = G.LINE[id]; let bad = null;
  for (let k = 0; k <= 400 && !bad; k++) {
    const [x, y] = G.linePoint(l, k / 400);
    if (!onFloor(x, y)) bad = `off the floor at (${x.toFixed(2)}, ${y.toFixed(2)})`;
    else { const s = G.SOLIDS.find(r => inRect(r, x, y, -0.02)); if (s) bad = `under a solid at (${x.toFixed(2)}, ${y.toFixed(2)})`; }
  }
  check(!bad, `${id} runs over open floor${bad ? ': ' + bad : ''}`);
}
// --- the middle capacitor stands by the cat; its shield line runs visibly all the way, its cannon line only
// leaves the room through a riser right next to the cabinet
const C1 = G.CAPACITORS[1];
check(Math.hypot(C1.x - G.CAT.x, C1.y - G.CAT.y) < 3 && C1.room === 'reactor', `the middle capacitor is next to the cat (${C1.x}, ${C1.y})`);
check(G.LINE.shield_front.runs.length === 1, 'the front shield line is one visible run (no stretch inside the walls)');
const riser = fitsOf('gun_front').find(f => f.kind === 'riser');
check(!!riser && Math.hypot(riser.x - C1.x, riser.y - C1.y) < 2.2 && G.LINE.gun_front.runs.length === 2, 'the front cannon line climbs out through a riser right by the cabinet (one hidden stretch: the spine)');
check(G.POWER_LINES.every(l => l.runs.length <= 2), 'no line hides more than the one deck change');

// --- no two power lines cross or touch anywhere on the ship (visible stretches: closer than a cable's width
// counts as touching)
const segs = (l) => l.runs.flatMap(r => r.slice(1).map((p, i) => [r[i], p]));
const cross = (a, b, c, d) => {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
const ptSeg = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
  const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - dx * k, p[1] - a[1] - dy * k);
};
const segDist = (a, b, c, d) => (cross(a, b, c, d) ? 0 : Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b)));
const CABLE_W = 0.19;
for (let i = 0; i < G.POWER_LINES.length; i++) for (let j = i + 1; j < G.POWER_LINES.length; j++) {
  const A = G.POWER_LINES[i], B = G.POWER_LINES[j];
  let d = Infinity;
  for (const [a, b] of segs(A)) for (const [c, e] of segs(B)) d = Math.min(d, segDist(a, b, c, e));
  check(d > CABLE_W, `${A.id} and ${B.id} don't cross or touch (closest ${d.toFixed(2)})`);
}

// --- the lever's positions point exactly at their branches' glands; the trunk comes in where none points
const angOf = (f) => Math.atan2(f.y - G.LEVER.y, f.x - G.LEVER.x);
const angDiff = (a, b) => Math.abs(((a - b) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
for (let i = 0; i < 3; i++) {
  const g = fitsOf('feed' + i)[0];
  check(angDiff(angOf(g), G.leverAngle(i)) < 1e-6 && angDiff(g.a, G.leverAngle(i)) < 1e-6, `${G.LEVER_NAMES[i]} points exactly at feed${i}'s gland`);
}
const tA = angOf(tOut);
check([0, 1, 2].every(i => angDiff(tA, G.leverAngle(i)) > 0.5), 'the trunk comes in away from every lever position');
const L0 = G.leverAngle(0), L1 = G.leverAngle(1), L2 = G.leverAngle(2), dir = Math.sign(L2 - L0);
check((L1 - L0) * dir > 0 && (L2 - L1) * dir > 0 && Math.abs(L2 - L0) < 2 * Math.PI, 'the positions run one way round the dial');
check(angDiff(L0, Math.PI) < 1e-6 && angDiff(L1, -Math.PI / 2) < 1e-6 && angDiff(L2, 0) < 1e-6, 'LEFT out of the left side, MID out of the top, RIGHT out of the right side');
check(tA < -Math.PI / 2 && tA > -Math.PI, `the trunk comes in from the north-west quarter, between LEFT and MID (${(tA * 180 / Math.PI).toFixed(0)} degrees)`);
// the handle sprite has a frame exactly at each position
for (let i = 0; i < 3; i++) {
  const k = (G.leverAngle(i) - L0) * dir / G.LEVER_HANDLE_STEP;
  check(Math.abs(k - Math.round(k)) < 1e-6 && Math.round(k) >= 0 && Math.round(k) < G.LEVER_HANDLE_FRAMES, `${G.LEVER_NAMES[i]} has its own handle frame (${Math.round(k)})`);
}
check(Math.round(2 * Math.PI / G.LEVER_HANDLE_STEP) === G.LEVER_HANDLE_FRAMES, 'the handle frames make one full turn (LEFT → RIGHT over the top, back round the bottom)');

// --- a bolt's way: reactor → trunk → the lever's hub → its branch → its capacitor, without jumps
for (let i = 0; i < 3; i++) {
  const b = { to: i, out: i, t: 0 }, F = G.LINE['feed' + i];
  const p0 = G.boltPoint(b, 0), pL = G.boltPoint(b, G.boltAtLever(b)), p1 = G.boltPoint(b, 1);
  check(dist(p0, trunk.pts[0]) < 1e-6, `bolt to ${i} starts at the reactor end of the trunk`);
  check(dist(pL, lever) < 0.02, `bolt to ${i} passes through the lever's hub (${dist(pL, lever).toFixed(3)} off)`);
  check(dist(p1, F.pts[F.pts.length - 1]) < 1e-6, `bolt to ${i} ends at capacitor ${i}'s plug`);
  let maxStep = 0, prev = p0;
  for (let k = 1; k <= 1000; k++) {
    const p = G.boltPoint(b, k / 1000); maxStep = Math.max(maxStep, dist(p, prev)); prev = p;
  }
  check(maxStep < 0.12, `bolt to ${i} moves smoothly (largest step per 1/1000: ${maxStep.toFixed(3)})`);
}

// --- timing (gameplay unchanged): the energy arrives BOLT_TIME (0.9 s) after the reactor makes it
G.combatClear(); G.SYSTEMS.forEach(s => { s.broken = false; });
const P = G.power;
check(G.BOLT_TIME === 0.9, 'a delivery still takes 0.9 s');
const deliverAndTime = (pos, patch = [0, 1, 2]) => {
  P.patch = patch; P.lever.pos = pos; P.lever.jammed = false; P.bolts.length = 0;
  G.CAPACITORS.forEach(c => { c.charge = 0; });
  P.reactor.fuel = 5; P.reactor.t = G.ENERGY_TIME - 1e-6;
  G.tick(DT);
  const b = P.bolts[0], shown = [];
  let t = 0;
  while (b && !b.done && t < 3) { shown.push([b.t, G.leverShownPos()]); G.tick(DT); t += DT; }
  return { b, t, shown };
};
let r = deliverAndTime(0);
check(r.b && r.b.to === 0 && r.b.out === 0, 'a delivery on LEFT sends a bolt down the LEFT branch');
check(Math.abs(r.t - 0.9) < 2.5 * DT, `it reaches the capacitor after 0.9 s (${r.t.toFixed(3)} s)`);
check(G.CAPACITORS[0].charge === 1, 'and charges it');
check(P.lever.pos === 1, 'the lever steps on at once in the game state (as before)');
check(r.shown.length > 0 && r.shown.every(([, s]) => s === 0), 'while the bolt is on its way the lever still shows LEFT (the lit path it runs along)');
check(G.leverShownPos() === 1, 'once it has arrived, the lever shows the next output (MID)');
// the patch board reroutes: lever on LEFT, patched to the right capacitor → down the RIGHT branch
r = deliverAndTime(0, [2, 1, 0]);
check(r.b && r.b.to === 2 && r.b.out === 0 && G.CAPACITORS[2].charge === 1, 'patched LEFT → right capacitor: the bolt takes the right branch and charges it');
check(Math.abs(r.t - 0.9) < 2.5 * DT, `same 0.9 s on the longer way (${r.t.toFixed(3)} s)`);
P.patch = [0, 1, 2];

// --- surges: only the branches (and the shield / cannon lines) arc, never the trunk; an arcing branch loses the energy
G.hz.surges.length = 0;
for (let k = 0; k < 60; k++) { G.surgeColumn(k % 3); if (G.hz.surges.length > 6) G.hz.surges.length = 0; }
check(!G.hz.surges.includes('trunk'), 'the trunk never arcs');
G.hz.surges.length = 0; G.hz.surges.push('feed1');
P.lever.pos = 1; P.bolts.length = 0; G.CAPACITORS[1].charge = 0; P.reactor.fuel = 5; P.reactor.t = G.ENERGY_TIME - 1e-6;
G.tick(DT);
check(P.bolts.length === 0 && G.CAPACITORS[1].charge === 0, 'an arcing MID branch: the energy is lost on the way');
G.hz.surges.length = 0;

// --- the trunk's stripe: live while the reactor runs, dark red when it's broken
P.reactor.fuel = 3;
check(G.powerLineLive(trunk) && !G.lineDead(trunk), 'trunk live while the reactor has fuel');
const rs = G.SYSTEMS.find(s => s.ref === G.REACTOR); rs.broken = true;
check(G.lineDead(trunk) && !G.powerLineLive(trunk), 'trunk dead (red) when the reactor is broken');
rs.broken = false;
P.reactor.fuel = 0;
check(!G.powerLineLive(trunk) && !G.lineDead(trunk), 'trunk dark when the reactor is out of fuel');

// --- the lit path: the trunk and the branch the lever is on (through the patch board) are live, the other
// branches idle (dimmed); no fuel: all off
P.reactor.fuel = 3; P.bolts.length = 0;
for (const patch of [[0, 1, 2], [2, 0, 1]]) for (let pos = 0; pos < 3; pos++) {
  P.patch = patch; P.lever.pos = pos;
  const st = [0, 1, 2].map(i => G.lineState(G.LINE['feed' + i]));
  check(G.nextFeed() === patch[pos] && st.every((s, i) => s === (i === patch[pos] ? 'live' : 'idle')) && G.lineState(trunk) === 'live',
    `lever on ${G.LEVER_NAMES[pos]}, patch ${patch.join('')}: feed${patch[pos]} lit, the others idle (${st.join(' ')})`);
}
P.patch = [0, 1, 2];
P.reactor.fuel = 0;
check(['trunk', 'feed0', 'feed1', 'feed2'].every(id => G.lineState(G.LINE[id]) === 'off'), 'no fuel: the trunk and every branch are off');
P.reactor.fuel = 3; G.CAPACITORS[1].charge = 0;
check(G.lineState(G.LINE.shield_front) === 'off', 'an empty capacitor\'s lines are off');
G.SYSTEMS.find(s => s.ref === G.CAPACITORS[1]).broken = true;
check(G.lineState(G.LINE.feed1) === 'dead' && G.lineState(G.LINE.gun_front) === 'dead', 'a broken capacitor: its branch and lines dead');
G.SYSTEMS.forEach(s => { s.broken = false; });

process.exitCode = failed ? 1 : 0;
