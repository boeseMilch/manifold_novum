// Prototype 3 (the big ship): headless tests of the helm (prototype3/sim-helm.js): the route map over many seeds
// (every node reachable, 1-3 forward edges, exactly one encounter each, STEPS encounters on every path, the danger
// side rule), charting at the table (only connected nodes, take back), following the course vs drifting, the win.
// Run: node tests/bigship-helm.js
const B = require('../prototype3/sim.js');
const H = B.helm;
const DT = 1 / 30;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
// the helm's tests don't care about the artillery's damage: the hull holds
const noDamage = (sim) => { sim.damageHull = () => {}; return sim; };
const press = (sim, c, key) => { sim.setInput(c.id, { pressed: [key] }); sim.tick(DT); };

check(H.LANES === 4 && H.STEPS === 7 && H.STEP_TIME >= 35 && H.STEP_TIME <= 45, `LANES ${H.LANES}, STEPS ${H.STEPS}, STEP_TIME ${H.STEP_TIME} s`);
check(H.START_TIME >= 20 && H.START_TIME <= 30, `step 0 gives ${H.START_TIME} s to chart`);
check(Math.abs(H.START_TIME + H.STEPS * H.STEP_TIME - 300) <= 30, `a run lasts about 5 min (${H.START_TIME + H.STEPS * H.STEP_TIME} s)`);

// --- the map, over many seeds
{
  const SEEDS = 500;
  let bad = { reach: 0, edges: 0, enc: 0, paths: 0, side: 0, start: 0, cross: 0, markerCover: 0 };
  let maxPaths = 0;
  for (let s = 0; s < SEEDS; s++) {
    const m = H.generate(B.rng(s * 7919 + 1));
    const L = m.lanes, S = m.steps;
    if (m.start !== 1 && m.start !== 2 || m.present[0].length !== 1 || m.present[0][0] !== m.start) bad.start++;
    // reachability: forward flood from the start
    const seen = [new Set([m.start])];
    for (let k = 0; k < S; k++) {
      seen.push(new Set());
      for (const a of seen[k]) for (const b of m.edges[k][a]) seen[k + 1].add(b);
    }
    for (let k = 0; k <= S; k++) for (const l of m.present[k]) if (!seen[k].has(l)) bad.reach++;
    // forward edges: 1..3, only to lane-1 / lane / lane+1, only to nodes that exist; no crossing diagonals
    for (let k = 0; k < S; k++) for (let l = 0; l < L; l++) {
      const e = m.edges[k][l];
      if (!m.present[k].includes(l)) { if (e) bad.edges++; continue; }
      if (!e || e.length < 1 || e.length > 3 || new Set(e).size !== e.length || e.some(b => Math.abs(b - l) > 1 || !m.present[k + 1].includes(b))) bad.edges++;
      if (l + 1 < L && e && e.includes(l + 1) && m.edges[k][l + 1] && m.edges[k][l + 1].includes(l)) bad.cross++;
    }
    // exactly one encounter on every node at steps 1..S, none at step 0; each marker covers its nodes
    if (m.enc[0].some(e => e)) bad.enc++;
    for (let k = 1; k <= S; k++) {
      for (let l = 0; l < L; l++) {
        const e = m.enc[k][l];
        if (m.present[k].includes(l) !== !!e) bad.enc++;
        if (e && !m.markers[k][e.m]) bad.enc++;
      }
      const covered = [];
      for (const [i, mk] of m.markers[k].entries()) {
        const lanes = mk.type === 'danger' ? mk.lanes : [mk.lane];
        if (mk.type === 'danger' && lanes[1] !== lanes[0] + 1) bad.markerCover++;
        if (mk.type === 'edge' && !((mk.lane === 0 && mk.side === 'left') || (mk.lane === L - 1 && mk.side === 'right'))) bad.markerCover++;
        for (const l of lanes) { covered.push(l); if (!m.enc[k][l] || m.enc[k][l].m !== i) bad.markerCover++; }
        // the side rule
        if (mk.type === 'danger' && !(m.enc[k][lanes[0]].kind === 'gunship' && m.enc[k][lanes[0]].side === 'right' && m.enc[k][lanes[1]].kind === 'gunship' && m.enc[k][lanes[1]].side === 'left')) bad.side++;
        if (mk.type === 'edge' && !(m.enc[k][mk.lane].kind === 'gunship' && m.enc[k][mk.lane].side === mk.side)) bad.side++;
        if (mk.type === 'obstacle' && m.enc[k][mk.lane].kind !== 'asteroids') bad.side++;
      }
      if (covered.length !== m.present[k].length || new Set(covered).size !== covered.length) bad.markerCover++;
    }
    // every path from the start to the end: count the encounters on it
    let paths = 0;
    (function walk(k, l, n) {
      if (k === S) { paths++; if (n !== S) bad.paths++; return; }
      for (const b of m.edges[k][l]) walk(k + 1, b, n + (m.enc[k + 1][b] ? 1 : 0));
    })(0, m.start, 0);
    maxPaths = Math.max(maxPaths, paths);
  }
  check(!bad.start, `${SEEDS} maps: the ship starts at step 0 in a middle lane`);
  check(!bad.reach, `${SEEDS} maps: every node can be reached (${bad.reach} unreachable)`);
  check(!bad.edges, `${SEEDS} maps: every node has 1-3 forward edges to lane-1 / lane / lane+1 (${bad.edges} bad)`);
  check(!bad.cross, `${SEEDS} maps: no two diagonals cross (${bad.cross})`);
  check(!bad.enc, `${SEEDS} maps: every node at steps 1..${H.STEPS} has exactly one encounter, step 0 none (${bad.enc} bad)`);
  check(!bad.markerCover, `${SEEDS} maps: a danger covers exactly the two lanes beside it, edge dangers sit outside lane 1 / ${H.LANES}, every node is one marker's (${bad.markerCover})`);
  check(!bad.side, `${SEEDS} maps: danger in the left lane of the pair -> from the RIGHT, right lane -> from the LEFT; edge -> that side; obstacle -> asteroids (${bad.side})`);
  check(!bad.paths && maxPaths > 1, `${SEEDS} maps: every path meets exactly ${H.STEPS} encounters (up to ${maxPaths} paths in a map)`);
  // variety: all three kinds of marker show up, and the maps differ
  const kinds = new Set(), shapes = new Set();
  for (let s = 0; s < 100; s++) { const m = H.generate(B.rng(s)); m.markers.flat().forEach(mk => kinds.add(mk.type)); shapes.add(JSON.stringify(m.edges)); }
  check(kinds.size === 3 && shapes.size > 90, `maps vary (${shapes.size}/100 different, marker types: ${[...kinds].join(', ')})`);
  const a = JSON.stringify(H.generate(B.rng(42))), b = JSON.stringify(H.generate(B.rng(42)));
  check(a === b, 'the same seed gives the same map');
}

// --- charting at the table
function sitAtChart(sim, c) {
  const st = B.STATIONS.chart;
  [c.x, c.y] = [st.x, 4.45]; sim.tick(DT);
  press(sim, c, 'use');
  return c.station === 'chart';
}
{
  const sim = B.createSim({ seed: 11 }), c = sim.addCrew(1, 'Nav');
  const st = B.STATIONS.chart;
  check(st.room === 'bridge' && st.seat && st.claims.includes('use') && st.claims.includes('fire'), 'the chart table is a seat on the bridge; E and Space go to it');
  [c.x, c.y] = [st.x, 4.45]; sim.tick(DT);
  check(c.prompt === 'E: Chart the course', `the prompt (${c.prompt})`);
  check(sitAtChart(sim, c), 'E sits you at the chart table');
  const Hm = sim.helm, m = Hm.map;
  check(!!Hm.cursors[1] && Hm.cursors[1].step === 1, 'your cursor starts on the next step');
  // try every lane at step 1: only the connected ones are accepted
  const ok = m.edges[0][m.start];
  let accepted = 0, refused = 0;
  for (let l = 0; l < m.lanes; l++) { if (H.canPick(sim, 1, l)) accepted++; else refused++; }
  check(accepted === ok.length, `only lanes connected to the ship's node can be picked (${accepted} of ${m.lanes})`);
  check(!H.pick(sim, 2, ok[0]), 'a node two steps ahead can\'t be picked before the one between');
  // pick via keys: move the cursor to a lane that isn't connected (if any) and press E: refused
  const notOk = [0, 1, 2, 3].find(l => !ok.includes(l));
  if (notOk != null) {
    Hm.cursors[1] = { step: 1, lane: notOk }; sim.takeEvents(); press(sim, c, 'use');
    check(Hm.course.length === 0 && c.station === 'chart' && sim.takeEvents().some(e => e.type === 'banner' && e.to === 1), 'E on an unconnected node: refused (a banner), you stay seated');
  }
  // chart the whole way with the keys: cursor moves among the connected nodes
  for (let k = 1; k <= m.steps; k++) {
    const end = H.courseEnd(sim), want = m.edges[end.step][end.lane][0];
    const cur = Hm.cursors[1];
    // drive the cursor with left / right / up to (k, want)
    for (let g = 0; g < 10 && (cur !== Hm.cursors[1] || true); g++) {
      const q = Hm.cursors[1];
      if (q.step < k) press(sim, c, 'up'); else if (q.step > k) press(sim, c, 'down');
      else if (q.lane < want) press(sim, c, 'right'); else if (q.lane > want) press(sim, c, 'left'); else break;
    }
    press(sim, c, 'fire');
  }
  check(Hm.course.length === m.steps && Hm.course.every((l, i) => B.helm.connects(m, i, i ? Hm.course[i - 1] : m.start, l)), `charted all ${m.steps} steps with the cursor keys, each pick connected`);
  press(sim, c, 'use');
  check(Hm.course.length === m.steps && c.station === 'chart', 'E past the last step adds nothing');
  press(sim, c, 'back'); press(sim, c, 'back');
  check(Hm.course.length === m.steps - 2 && c.station === 'chart', 'Q / Backspace takes back the last pick (twice: two)');
  while (Hm.course.length) press(sim, c, 'back');
  check(c.station === 'chart', 'taking back every pick');
  press(sim, c, 'back');
  check(c.station === null && !Hm.cursors[1], 'Q with nothing to take back leaves the table');
  // E on the ship's own node leaves too
  sitAtChart(sim, c); Hm.cursors[1] = { step: Hm.step, lane: Hm.lane }; press(sim, c, 'use');
  check(c.station === null, 'E with the cursor on the ship leaves the table');
  // shared: two at the table edit one course
  const d = sim.addCrew(2, 'Two');
  sitAtChart(sim, c); H.pick(sim, 1, ok[0]);
  check(Hm.course.length === 1, 'one pick by the first navigator');
  check(H.canPick(sim, 2, m.edges[1][ok[0]][0]) && H.pick(sim, 2, m.edges[1][ok[0]][0]), 'anyone continues from the course\'s end');
  void d;
  const snap = JSON.parse(JSON.stringify(sim.snapshot()));
  check(snap.helm && snap.helm.course.length === 2 && snap.helm.cursors['1'] && snap.helm.edges.length === m.steps && snap.helm.enc[1].length === m.lanes, 'the snapshot carries the map, the course and the cursors (JSON-safe)');
}

// --- the steps: follow the course, drift without one, spawn and end encounters, win after STEPS
function runSteps(sim, n) { for (let i = 0; i < n; i++) { const t = sim.helm.timer; for (let s = 0; s < Math.ceil(t / DT) + 1 && sim.phase === 'run'; s++) sim.tick(DT); } }
{
  // capture spawns
  const sim = noDamage(B.createSim({ seed: 21 })), m = sim.helm.map;
  const spawned = []; const orig = sim.spawnEncounter.bind(sim); let ended = 0; const origEnd = sim.endEncounters.bind(sim);
  sim.spawnEncounter = (k, o) => { spawned.push([k, o]); return orig(k, o); };
  sim.endEncounters = () => { ended++; origEnd(); };
  check(sim.helm.step === 0 && sim.helm.timer === H.START_TIME && sim.encounters.length === 0, 'the run starts at step 0, no encounter, START_TIME on the clock');
  // chart a course: always the rightmost connection
  let l = m.start; const plan = [];
  for (let k = 0; k < m.steps; k++) { l = m.edges[k][l][m.edges[k][l].length - 1]; plan.push(l); H.pick(sim, k + 1, l); }
  sim.takeEvents();
  runSteps(sim, 1);
  const ev = sim.takeEvents();
  check(sim.helm.step === 1 && sim.helm.lane === plan[0] && sim.helm.course.length === m.steps - 1, `after step 0 the ship follows the course (lane ${plan[0] + 1})`);
  check(!ev.some(e => e.type === 'banner' && /drifting/.test(e.text)), 'following a course: no "drifting" banner');
  const e1 = m.enc[1][plan[0]];
  check(spawned.length === 1 && spawned[0][0] === e1.kind && (e1.kind !== 'gunship' || spawned[0][1].side === e1.side), `the node's encounter spawns (${e1.kind}${e1.kind === 'gunship' ? ' from the ' + e1.side : ''})`);
  check(sim.encounters.length >= 1 || e1.kind === 'asteroids', 'it is in sim.encounters');
  check(Math.abs(sim.helm.timer - H.STEP_TIME) < 0.1, 'the next step gets STEP_TIME');
  runSteps(sim, 2);
  check(ended >= 3 && sim.helm.path.slice(1).join() === plan.slice(0, 3).join(), 'each step ends the encounters and moves on along the course');
  check(sim.encounters.every(e => e.age < H.STEP_TIME + 0.5), 'the previous step\'s encounters are gone');
  runSteps(sim, m.steps - 3);
  check(sim.phase === 'run' && sim.helm.step === m.steps, `at step ${m.steps}, still flying`);
  check(spawned.length === m.steps && spawned.every(([k], i) => k === m.enc[i + 1][plan[i]].kind), `${m.steps} encounters met, each the node's`);
  runSteps(sim, 1);
  check(sim.phase === 'end' && sim.won && /jump/.test(sim.summary.reason) && sim.encounters.length === 0, `after step ${m.steps} the run is won (${sim.summary && sim.summary.reason})`);
  check(Math.abs(sim.time - (H.START_TIME + m.steps * H.STEP_TIME)) < 0.5, `the run took ${sim.time.toFixed(1)} s`);
  check(sim.summary.stats.drifted === 0, 'no drift on a charted run');
}
{
  // no course: drift along a random connection, with a banner
  const lanesSeen = new Set();
  let ok = true, banners = true, ends = 0;
  for (let s = 0; s < 40; s++) {
    const sim = noDamage(B.createSim({ seed: 100 + s })), m = sim.helm.map;
    let prev = sim.helm.lane;
    for (let k = 0; k < m.steps; k++) {
      sim.takeEvents(); runSteps(sim, 1);
      const ev = sim.takeEvents();
      if (!B.helm.connects(m, k, prev, sim.helm.lane)) ok = false;
      if (!ev.some(e => e.type === 'banner' && e.text === 'No course charted, drifting')) banners = false;
      prev = sim.helm.lane;
      if (k === 0) lanesSeen.add(sim.helm.lane - m.start);
    }
    runSteps(sim, 1); if (sim.won) ends++;
    if (sim.summary.stats.drifted !== m.steps) ok = false;
  }
  check(ok, 'without a course the ship takes a connection of its node (drift is counted)');
  check(banners, 'every drift shows "No course charted, drifting"');
  check(lanesSeen.size >= 2, `the drift is random (first moves seen: ${[...lanesSeen].join(', ')})`);
  check(ends === 40, 'a drifting run is won too, after the last step');
}
{
  // a course that runs out part way: follow it, then drift
  const sim = noDamage(B.createSim({ seed: 7 })), m = sim.helm.map;
  const l1 = m.edges[0][m.start][0]; H.pick(sim, 1, l1);
  sim.takeEvents(); runSteps(sim, 1);
  const a = sim.takeEvents().some(e => e.type === 'banner' && /drifting/.test(e.text));
  runSteps(sim, 1);
  const b = sim.takeEvents().some(e => e.type === 'banner' && /drifting/.test(e.text));
  check(!a && b && sim.helm.path[1] === l1 && sim.helm.drifted === 1, 'a short course: followed, then drifting');
}
{
  // hull 0 ends the run (lost) and the helm stops
  const sim = B.createSim({ seed: 3 });
  runSteps(sim, 1); sim.damageHull(200, 'left');
  const step = sim.helm.step; runSteps(sim, 2);
  check(sim.phase === 'end' && !sim.won && sim.helm.step === step, 'a lost run stops the clock');
}
{
  // debug: a shorter step
  B.HELM_STEP_TIME = 8;
  const sim = noDamage(B.createSim({ seed: 5 }));
  delete B.HELM_STEP_TIME;
  check(sim.helm.stepTime === 8 && sim.helm.timer === 8, 'debug step time (?step=8 / BIG_STEP=8)');
  runSteps(sim, sim.helm.map.steps + 1);
  check(sim.won && sim.time < 8 * 9, `with 8 s steps a run is ${sim.time.toFixed(0)} s`);
  check(B.createSim({ seed: 5 }).helm.stepTime === H.STEP_TIME, 'off by default');
}

process.exitCode = failed ? 1 : 0;
