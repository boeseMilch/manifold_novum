// Prototype 3: the helm. The route map (seeded), charting a course at the chart table (shared by everyone at it),
// the step timer, following the course or drifting, and spawning each node's encounter. Loaded after sim-artillery.js
// (BIG.SIM_MODULES); the artillery owns how gunships and asteroid fields behave, this file only spawns and ends them.
//
// The map: LANES lanes side by side, steps 0..STEPS (the nose of the chart is the jump point after step STEPS).
// The ship starts at step 0 in a middle lane; step 0 has no encounter and gives the crew START_TIME to chart.
// Every STEP_TIME the ship moves one step: along the charted course, or a random connection ("drifting").
// Every node at steps 1..STEPS carries exactly one encounter (markers per step):
//   { type: 'danger', lanes: [a, a + 1] }   a gunship between two lanes: lane a has it on its RIGHT, lane a+1 on its LEFT
//   { type: 'edge', lane, side }            a gunship outside lane 0 ('left') or lane LANES-1 ('right')
//   { type: 'obstacle', lane }              an asteroid field on that node (rocks from ahead)
// Debug: a shorter step for testing: ?step=8 in the page (solo), BIG_STEP=8 in the server's environment.
(function () {
'use strict';
const B = globalThis.BIG;

const LANES = 4, STEPS = 7;
const STEP_TIME = 40;              // seconds per step (one encounter)
const START_TIME = 25;             // step 0: time to chart before the first jump
const PAIR_CHANCE = 0.4;           // how often two neighbouring lanes share a danger
const EDGE_CHANCE = 0.4;           // an unpaired outer lane: an edge danger (else an obstacle)
const STRAIGHT_CHANCE = 0.55;       // map generation: a node connects straight ahead
const DIAG_CHANCE = 0.42;          // ... and each pair of neighbouring lanes gets a \ or a / (each this likely)

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------
// present[k]: the lanes that exist at step k (step 0: only the start; step 1: the start's neighbours; then all).
// edges[k][lane]: the lanes at step k+1 that (k, lane) connects to (sorted), or null when that node doesn't exist.
// markers[k]: the encounter markers at step k; enc[k][lane]: { kind, side, m (marker index) } of that node.
function generate(rand, opts = {}) {
  const L = opts.lanes || LANES, S = opts.steps || STEPS;
  const start = opts.start != null ? opts.start : Math.floor((L - 1) / 2) + (L % 2 === 0 && rand() < 0.5 ? 1 : 0);   // a middle lane
  const present = [[start]];
  const lanesNear = (l) => [l - 1, l, l + 1].filter(x => x >= 0 && x < L);
  present.push(lanesNear(start));
  for (let k = 2; k <= S; k++) present.push(Array.from({ length: L }, (_, i) => i));
  const edges = [];
  for (let k = 0; k < S; k++) {
    const row = Array(L).fill(null), next = present[k + 1];
    for (const l of present[k]) row[l] = [];
    const has = (a, b) => row[a] && row[a].includes(b);
    // no crossing diagonals: a -> a+1 and a+1 -> a can't both exist
    const crosses = (a, b) => b !== a && has(b, a);
    if (k === 0) row[start] = next.slice();
    else {
      // straight ahead mostly; between each two neighbouring lanes at most one diagonal (\ or /, so none cross)
      for (const l of present[k]) if (next.includes(l) && rand() < STRAIGHT_CHANCE) row[l].push(l);
      for (let a = 0; a + 1 < L; a++) {
        const r = rand();
        if (r < DIAG_CHANCE && row[a] && next.includes(a + 1)) row[a].push(a + 1);
        else if (r < DIAG_CHANCE * 2 && row[a + 1] && next.includes(a)) row[a + 1].push(a);
      }
      for (const l of present[k]) if (!row[l].length) {
        const ok = lanesNear(l).filter(b => next.includes(b) && !crosses(l, b));
        row[l].push(ok.includes(l) ? l : ok[Math.floor(rand() * ok.length)]);
      }
      // everyone at k+1 must be reachable: add a straight edge (never crosses) or a diagonal that doesn't cross
      for (const b of next) {
        if (present[k].some(a => has(a, b))) continue;
        if (row[b]) { row[b].push(b); continue; }
        const a = [b - 1, b + 1].find(a => row[a] && row[a].length < 3 && !crosses(a, b));
        if (a != null) row[a].push(b); else { const a2 = [b - 1, b + 1].find(a => row[a]); row[a2].push(b); }
      }
    }
    for (const l of present[k]) row[l].sort((a, b) => a - b);
    edges.push(row);
  }
  // encounters
  const markers = [[]], enc = [Array(L).fill(null)];
  for (let k = 1; k <= S; k++) {
    const ls = present[k], ms = [], row = Array(L).fill(null);
    for (let i = 0; i < ls.length; i++) {
      const l = ls[i];
      if (i + 1 < ls.length && rand() < PAIR_CHANCE) {
        const m = ms.push({ type: 'danger', lanes: [l, l + 1] }) - 1;
        row[l] = { kind: 'gunship', side: 'right', m };
        row[l + 1] = { kind: 'gunship', side: 'left', m };
        i++;
      } else if ((l === 0 || l === L - 1) && rand() < EDGE_CHANCE) {
        const side = l === 0 ? 'left' : 'right';
        const m = ms.push({ type: 'edge', lane: l, side }) - 1;
        row[l] = { kind: 'gunship', side, m };
      } else {
        const m = ms.push({ type: 'obstacle', lane: l }) - 1;
        row[l] = { kind: 'asteroids', side: 'ahead', m };
      }
    }
    markers.push(ms); enc.push(row);
  }
  return { lanes: L, steps: S, start, present, edges, markers, enc };
}
const connects = (map, k, a, b) => !!(map.edges[k] && map.edges[k][a] && map.edges[k][a].includes(b));

// ---------------------------------------------------------------------------
// The helm's state on the sim: sim.helm
// ---------------------------------------------------------------------------
function debugStep() {
  let v = null;
  if (typeof location !== 'undefined' && location.search) { const m = /[?&]step=(\d+(?:\.\d+)?)/.exec(location.search); if (m) v = +m[1]; }
  else if (typeof process !== 'undefined' && process.env && process.env.BIG_STEP) v = +process.env.BIG_STEP;
  return v > 0 ? v : null;
}
B.INIT_HOOKS.push((sim) => {
  const dbg = B.HELM_STEP_TIME || debugStep();     // (B.HELM_STEP_TIME: for tests)
  const map = generate(sim.rand);
  sim.helm = {
    map,
    step: 0, lane: map.start,
    path: [map.start],              // the lanes flown so far (index = step)
    course: [],                     // the charted lanes for steps step+1, step+2, ...
    stepTime: dbg || STEP_TIME,
    timer: dbg ? Math.min(START_TIME, dbg) : START_TIME,   // seconds left in this step
    cursors: {},                    // crew id -> { step, lane } (each one at the table has their own)
    drifted: 0,
  };
  sim.stats.drifted = 0;
});

// Course editing (also used by the station's keys)
function courseEnd(sim) { const H = sim.helm; return { step: H.step + H.course.length, lane: H.course.length ? H.course[H.course.length - 1] : H.lane }; }
function canPick(sim, step, lane) { const e = courseEnd(sim); return step === e.step + 1 && step <= sim.helm.map.steps && connects(sim.helm.map, e.step, e.lane, lane); }
function pick(sim, step, lane) { if (!canPick(sim, step, lane)) return false; sim.helm.course.push(lane); return true; }
function undo(sim) { return sim.helm.course.length ? (sim.helm.course.pop(), true) : false; }

// What the ship will meet at a node
function encAt(sim, step, lane) { const r = sim.helm.map.enc[step]; return r ? r[lane] : null; }
function describe(e) { return !e ? 'nothing' : e.kind === 'gunship' ? `gunship from the ${e.side.toUpperCase()}` : 'asteroids from AHEAD'; }

// The jump to the next step
function advance(sim) {
  const H = sim.helm, map = H.map;
  sim.endEncounters();
  if (H.step >= map.steps) { sim.end(true, 'You made the jump.'); return; }
  let lane, drift = false;
  if (H.course.length && connects(map, H.step, H.lane, H.course[0])) lane = H.course.shift();
  else {
    const opts = map.edges[H.step][H.lane];
    lane = opts[Math.floor(sim.rand() * opts.length)];
    drift = true; H.course.length = 0; H.drifted++; sim.stats.drifted++;
  }
  H.step++; H.lane = lane; H.path.push(lane); H.timer = H.stepTime;
  for (const id in H.cursors) { const c = H.cursors[id]; if (c.step <= H.step) H.cursors[id] = { step: Math.min(map.steps, H.step + 1), lane: c.lane }; }
  const e = encAt(sim, H.step, lane);
  if (drift) sim.event({ type: 'banner', text: 'No course charted, drifting', color: '#ffb347' });
  sim.event({ type: 'banner', text: `Step ${H.step}/${map.steps} · lane ${lane + 1}: ${describe(e)}`, color: e && e.kind === 'gunship' ? '#ff9a8a' : '#d8c8a8' });
  sim.event({ type: 'jump', step: H.step, lane, drift });
  if (e) sim.spawnEncounter(e.kind, e.kind === 'gunship' ? { side: e.side } : {});
}
B.TICK_HOOKS.push((sim, dt) => {
  const H = sim.helm;
  if (!H) return;
  H.timer -= dt;
  if (H.timer <= 0) advance(sim);
});

// ---------------------------------------------------------------------------
// The chart table (a seat): movement keys move your cursor, E / Space picks, Backspace / Q takes back
// ---------------------------------------------------------------------------
function placeCursor(sim, c) {
  const H = sim.helm, e = courseEnd(sim), step = Math.min(H.map.steps, e.step + 1);
  const opts = e.step < H.map.steps ? H.map.edges[e.step][e.lane] : [e.lane];
  H.cursors[c.id] = { step, lane: opts.includes(e.lane) ? e.lane : opts[0] };
}
function moveCursor(sim, c, dl, ds) {
  const H = sim.helm, cur = H.cursors[c.id]; if (!cur) return;
  const s = B.clamp(cur.step + ds, H.step, H.map.steps);
  let l = B.clamp(cur.lane + dl, 0, H.map.lanes - 1);
  const pres = H.map.present[s];
  if (!pres.includes(l)) l = pres.reduce((a, b) => Math.abs(b - l) < Math.abs(a - l) ? b : a, pres[0]);
  H.cursors[c.id] = { step: s, lane: l };
}
B.defineStation({
  id: 'chart', label: 'Chart table', seat: true, claims: ['use', 'fire'],
  prompt: () => 'Chart the course',
  hint: 'arrows: cursor · E / Space: pick · Q / Backspace: take back',
  sit: (sim, c) => placeCursor(sim, c),
  leave: (sim, c) => { if (sim.helm) delete sim.helm.cursors[c.id]; },
  drive(sim, c, inp) {
    const H = sim.helm, pr = inp.pressed;
    if (!H.cursors[c.id]) placeCursor(sim, c);
    if (pr.has('left')) moveCursor(sim, c, -1, 0);
    if (pr.has('right')) moveCursor(sim, c, 1, 0);
    if (pr.has('up')) moveCursor(sim, c, 0, 1);         // the chart's top is ahead (the jump point)
    if (pr.has('down')) moveCursor(sim, c, 0, -1);
    if (pr.has('use') || pr.has('fire')) {
      const k = H.cursors[c.id];
      if (k.step === H.step && k.lane === H.lane) { sim.leaveStation(c); return; }   // E on the ship: leave the table
      if (pick(sim, k.step, k.lane)) {
        sim.event({ type: 'chartPick', by: c.id, step: k.step, lane: k.lane });
        placeCursor(sim, c);
      } else sim.banner(k.step <= courseEnd(sim).step ? 'Already charted: Q takes picks back' : 'Not connected to the end of the course', c.id);
    }
    if (pr.has('back')) {
      if (undo(sim)) placeCursor(sim, c);
      else sim.leaveStation(c);                           // nothing to take back: leave the table
    }
  },
});

// ---------------------------------------------------------------------------
// Snapshot: the map (small, static) and the state
// ---------------------------------------------------------------------------
B.SNAPSHOT_HOOKS.push((sim, snap) => {
  const H = sim.helm; if (!H) return;
  const m = H.map;
  snap.helm = {
    lanes: m.lanes, steps: m.steps, start: m.start, present: m.present, edges: m.edges, markers: m.markers,
    enc: m.enc.map(r => r.map(e => e ? [e.kind === 'gunship' ? 'g' : 'a', e.side, e.m] : null)),
    step: H.step, lane: H.lane, path: H.path, course: H.course, cursors: H.cursors,
    timer: Math.round(Math.max(0, H.timer) * 10) / 10, stepTime: H.stepTime,
  };
});

B.helm = { LANES, STEPS, STEP_TIME, START_TIME, generate, connects, courseEnd, canPick, pick, undo, advance, encAt, describe };
})();
