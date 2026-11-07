// Prototype 3, browser only: the helm's chart-table view (seated, full screen), the chart table's holo map on the
// ship plan, and the "next jump" readout on everyone's HUD. Reads snap.helm (sim-helm.js's snapshot hook):
//   { lanes, steps, start, present[k], edges[k][lane], markers[k], enc[k][lane] = [g|a, side, m], step, lane, path,
//     course, cursors{id: {step, lane}}, timer, stepTime }
(function () {
'use strict';
const B = globalThis.BIG;
const A = B.art, T = A.T, TAU = Math.PI * 2, OUT = A.OUT;
const COL = { holo: '#5fd6e4', dim: 'rgba(95,214,228,0.28)', course: '#7ff6ff', path: '#ffd36a', ship: '#ffe08a',
  danger: '#ff5a4c', rock: '#c8a27a', ok: '#47e07a', panel: '#0d1a20' };

const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const encOf = (H, k, l) => (H.enc[k] || [])[l] || null;
const sideWord = (e) => !e ? '' : e[0] === 'g' ? `gunship from the ${e[1].toUpperCase()}` : 'asteroids from AHEAD';
const courseEnd = (H) => ({ step: H.step + H.course.length, lane: H.course.length ? H.course[H.course.length - 1] : H.lane });
const connects = (H, k, a, b) => !!(H.edges[k] && H.edges[k][a] && H.edges[k][a].includes(b));
// The node the ship goes to next (null: drifting, or the jump point).
function nextNode(H) {
  if (H.step >= H.steps) return { jump: true };
  if (H.course.length && connects(H, H.step, H.lane, H.course[0])) return { step: H.step + 1, lane: H.course[0] };
  return null;
}
function readout(H) {
  const n = nextNode(H), t = fmt(H.timer);
  if (n && n.jump) return { text: `jump point in ${t}`, color: COL.ok };
  if (!n) return { text: `next jump in ${t} → drifting: unknown`, color: '#ffb347' };
  const e = encOf(H, n.step, n.lane);
  return { text: `next jump in ${t} → lane ${n.lane + 1}, ${sideWord(e)}`, color: e && e[0] === 'g' ? '#ff9a8a' : '#e8d8b0' };
}

// ---------------------------------------------------------------------------
// Map geometry: lane / step -> px inside a box. Step 0 at the bottom, the jump point (steps + 1) at the top.
// ---------------------------------------------------------------------------
function grid(H, x, y, w, h) {
  const cols = H.lanes + 1.6, rows = H.steps + 1;                // lanes plus room for edge markers; rows 0..steps + jump
  const dx = w / cols, dy = h / (rows + 0.6);
  return { X: (l) => x + (l + 1.3) * dx, Y: (k) => y + h - (k + 0.6) * dy, dx, dy };
}

// Icons
function gunshipIcon(ctx, x, y, s, side, col = COL.danger) {
  // a small arrowhead hull pointing towards where it attacks (into the lanes)
  ctx.save(); ctx.translate(x, y);
  A.poly(ctx, [[0, -s], [s * 0.95, 0], [0, s], [-s * 0.95, 0]]); ctx.fillStyle = 'rgba(80,16,14,0.85)'; ctx.fill(); A.stroke(ctx, Math.max(1.2, s * 0.14), col);
  ctx.rotate(side === 'left' ? 0 : side === 'right' ? Math.PI : -Math.PI / 2);   // side: where it sits (it points inwards)
  A.poly(ctx, [[s * 0.55, 0], [-s * 0.35, -s * 0.38], [-s * 0.15, 0], [-s * 0.35, s * 0.38]]); ctx.fillStyle = col; ctx.fill();
  ctx.restore();
}
function rockIcon(ctx, x, y, s, col = COL.rock) {
  for (const [ox, oy, r] of [[-0.3, 0.1, 0.42], [0.32, -0.12, 0.34], [0.12, 0.36, 0.24]]) {
    ctx.beginPath();
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, rr = s * r * (0.8 + 0.3 * ((k * 37 + ox * 10) % 3) / 3); ctx[k ? 'lineTo' : 'moveTo'](x + ox * s + Math.cos(a) * rr, y + oy * s + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); A.stroke(ctx, Math.max(1, s * 0.08), 'rgba(20,14,8,0.9)');
  }
}
function shipIcon(ctx, x, y, s, col = COL.ship) {
  ctx.save(); ctx.translate(x, y);
  A.poly(ctx, [[0, -s], [s * 0.62, s * 0.7], [0, s * 0.38], [-s * 0.62, s * 0.7]]); ctx.fillStyle = col; ctx.fill(); A.stroke(ctx, Math.max(1.2, s * 0.16));
  ctx.restore();
}
function arrowAlong(ctx, x0, y0, x1, y1, s, col) {
  const a = Math.atan2(y1 - y0, x1 - x0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  ctx.save(); ctx.translate(mx, my); ctx.rotate(a);
  A.poly(ctx, [[s, 0], [-s * 0.7, -s * 0.7], [-s * 0.7, s * 0.7]]); ctx.fillStyle = col; ctx.fill();
  ctx.restore();
}

// The map itself (used by the full view and, small, by the holo table). o: { me, small, t, crew }
function drawMap(ctx, H, x, y, w, h, o) {
  const G = grid(H, x, y, w, h), small = !!o.small, t = o.t || 0;
  const nr = small ? Math.max(2, G.dx * 0.13) : Math.min(G.dx, G.dy) * 0.2;
  const lw = small ? 1.2 : Math.max(2, nr * 0.16);
  // rows: past steps dim; the current step a band
  if (!small) {
    for (let k = 0; k <= H.steps + 1; k++) {
      if (k === H.step) { ctx.fillStyle = 'rgba(255,224,138,0.07)'; ctx.fillRect(x, G.Y(k) - G.dy / 2, w, G.dy); }
      A.label(ctx, k === H.steps + 1 ? 'JUMP' : k === 0 ? 'START' : String(k), x + 6, G.Y(k), { align: 'left', size: Math.max(11, nr * 0.55), weight: 800, color: k <= H.step ? 'rgba(170,178,192,0.5)' : '#8fc8d0' });
    }
    for (let l = 0; l < H.lanes; l++) A.label(ctx, `lane ${l + 1}`, G.X(l), y + h + 4, { size: Math.max(11, nr * 0.5), weight: 700, color: '#8fc8d0', base: 'top' });
  }
  // the jump point
  const jy = G.Y(H.steps + 1), jx = (G.X(0) + G.X(H.lanes - 1)) / 2;
  ctx.beginPath(); ctx.ellipse(jx, jy, (G.X(H.lanes - 1) - G.X(0)) / 2 + nr, nr * 1.1, 0, 0, TAU);
  ctx.fillStyle = `rgba(71,224,122,${0.12 + 0.06 * Math.sin(t * 2)})`; ctx.fill(); A.stroke(ctx, lw, 'rgba(71,224,122,0.7)');
  if (!small) A.label(ctx, 'JUMP POINT', jx, jy, { size: Math.max(12, nr * 0.6), weight: 900, color: '#8af0a8' });
  for (let l = 0; l < H.lanes; l++) { ctx.beginPath(); ctx.moveTo(G.X(l), G.Y(H.steps)); ctx.lineTo(G.X(l), jy + nr); ctx.setLineDash([lw * 2, lw * 2]); A.stroke(ctx, lw * 0.7, 'rgba(71,224,122,0.35)'); ctx.setLineDash([]); }
  // edges
  for (let k = 0; k < H.steps; k++) for (let a = 0; a < H.lanes; a++) for (const b of (H.edges[k][a] || [])) {
    ctx.beginPath(); ctx.moveTo(G.X(a), G.Y(k)); ctx.lineTo(G.X(b), G.Y(k + 1)); A.stroke(ctx, lw, k < H.step ? 'rgba(95,214,228,0.12)' : COL.dim);
  }
  // the flown path (gold) and the course (bright, with arrows)
  ctx.beginPath(); H.path.forEach((l, k) => k ? ctx.lineTo(G.X(l), G.Y(k)) : ctx.moveTo(G.X(l), G.Y(k))); A.stroke(ctx, lw * 2, COL.path);
  if (H.course.length) {
    let pl = H.lane, pk = H.step;
    ctx.beginPath(); ctx.moveTo(G.X(pl), G.Y(pk)); H.course.forEach((l, i) => ctx.lineTo(G.X(l), G.Y(pk + 1 + i)));
    A.stroke(ctx, lw * 4, 'rgba(127,246,255,0.18)'); ctx.stroke(); A.stroke(ctx, lw * 2.2, COL.course);
    if (!small) H.course.forEach((l, i) => { arrowAlong(ctx, G.X(pl), G.Y(pk + i), G.X(l), G.Y(pk + 1 + i), lw * 2.6, COL.course); pl = l; });
  }
  // where the next pick can go
  const end = courseEnd(H);
  if (!small && end.step < H.steps) for (const b of H.edges[end.step][end.lane] || []) {
    ctx.beginPath(); ctx.moveTo(G.X(end.lane), G.Y(end.step)); ctx.lineTo(G.X(b), G.Y(end.step + 1));
    ctx.setLineDash([lw * 3, lw * 3]); ctx.lineDashOffset = -t * 20; A.stroke(ctx, lw * 1.4, 'rgba(71,224,122,0.8)'); ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  // nodes and their encounters
  for (let k = 0; k <= H.steps; k++) for (const l of H.present[k]) {
    const nx = G.X(l), ny = G.Y(k), past = k < H.step, e = encOf(H, k, l);
    ctx.save(); if (past) ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.arc(nx, ny, nr, 0, TAU); ctx.fillStyle = COL.panel; ctx.fill();
    const onCourse = (k > H.step && H.course[k - H.step - 1] === l) || H.path[k] === l;
    A.stroke(ctx, lw * (onCourse ? 1.6 : 1), onCourse ? (k <= H.step ? COL.path : COL.course) : COL.holo);
    if (e && e[0] === 'a') { if (small) { ctx.beginPath(); ctx.arc(nx, ny, nr * 0.8, 0, TAU); ctx.fillStyle = COL.rock; ctx.fill(); } else rockIcon(ctx, nx, ny, nr * 0.85); }
    else if (e && e[0] === 'g' && !small) {
      // a red tick on the side the gunship comes from
      const sx = e[1] === 'left' ? -1 : 1;
      ctx.beginPath(); ctx.arc(nx, ny, nr * 0.72, sx < 0 ? Math.PI * 0.7 : -Math.PI * 0.3, sx < 0 ? Math.PI * 1.3 : Math.PI * 0.3); A.stroke(ctx, lw * 1.8, COL.danger);
    }
    ctx.restore();
  }
  // danger markers: between two lanes, or outside the edge
  for (let k = 1; k <= H.steps; k++) for (const m of H.markers[k]) {
    if (m.type === 'obstacle') continue;
    const mx = m.type === 'danger' ? (G.X(m.lanes[0]) + G.X(m.lanes[1])) / 2 : G.X(m.lane) + (m.side === 'left' ? -1 : 1) * G.dx * 0.62;
    ctx.save(); if (k < H.step) ctx.globalAlpha = 0.3;
    gunshipIcon(ctx, mx, G.Y(k), small ? Math.max(2.5, nr * 1.05) : nr * 0.78, m.type === 'danger' ? null : m.side);
    ctx.restore();
  }
  // the ship
  const sx = G.X(H.lane), sy = G.Y(H.step);
  ctx.beginPath(); ctx.arc(sx, sy, nr * (1.25 + 0.12 * Math.sin(t * 4)), 0, TAU); A.stroke(ctx, lw, 'rgba(255,224,138,0.7)');
  shipIcon(ctx, sx, sy, nr * 0.75);
  // cursors (everyone at the table)
  if (!small) for (const id in H.cursors) {
    const c = H.cursors[id], who = (o.crew || []).find(p => String(p.id) === id), mine = o.me && String(o.me.id) === id;
    const cx = G.X(c.lane), cy = G.Y(c.step), ok = c.step === end.step + 1 && connects(H, end.step, end.lane, c.lane);
    const leave = c.step === H.step && c.lane === H.lane;
    ctx.beginPath(); ctx.arc(cx, cy, nr * (mine ? 1.5 : 1.35), 0, TAU);
    if (!ok && !leave) ctx.setLineDash([lw * 2, lw * 1.6]);
    A.stroke(ctx, lw * (mine ? 2.2 : 1.5), who ? who.color : '#fff'); ctx.setLineDash([]);
    if (mine) {
      const tip = leave ? 'E: leave the table' : ok ? 'E: pick' : c.step <= end.step ? 'charted' : 'not connected';
      A.label(ctx, tip, cx, cy + nr * 2.2, { size: Math.max(12, nr * 0.55), weight: 800, color: leave ? '#ffe08a' : ok ? COL.ok : '#aab2c0', bg: 'rgba(5,12,16,0.8)' });
    } else if (who) A.label(ctx, who.name, cx, cy - nr * 2.0, { size: Math.max(11, nr * 0.5), color: who.color, bg: 'rgba(5,12,16,0.7)' });
  }
  return G;
}

// ---------------------------------------------------------------------------
// The seated view: a holo table seen from above, the map, a side panel
// ---------------------------------------------------------------------------
function drawChartView(ctx, snap, me, w, h, t) {
  const H = snap.helm;
  ctx.fillStyle = '#0b0e13'; ctx.fillRect(0, 0, w, h);
  if (!H) { A.label(ctx, 'chart table: no route', w / 2, h / 2, { size: 20 }); return; }
  // the table's frame
  const m = 18, fx = m, fy = 60, fw = w - m * 2, fh = h - fy - 70;
  A.rr(ctx, fx, fy, fw, fh, 18); ctx.fillStyle = '#2f3542'; ctx.fill(); A.stroke(ctx, 4);
  for (const [rx, ry] of [[fx + 12, fy + 12], [fx + fw - 16, fy + 12], [fx + 12, fy + fh - 16], [fx + fw - 16, fy + fh - 16]]) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(rx, ry, 4, 4); }
  const gx = fx + 26, gy = fy + 26, gw = fw - 52, gh = fh - 52;
  A.rr(ctx, gx, gy, gw, gh, 10);
  const g = ctx.createRadialGradient(gx + gw / 2, gy + gh / 2, 10, gx + gw / 2, gy + gh / 2, Math.max(gw, gh) * 0.7);
  g.addColorStop(0, '#173b44'); g.addColorStop(1, '#0a1a20'); ctx.fillStyle = g; ctx.fill(); A.stroke(ctx, 2.5);
  ctx.save(); A.rr(ctx, gx, gy, gw, gh, 10); ctx.clip();
  ctx.strokeStyle = 'rgba(95,214,228,0.06)'; ctx.lineWidth = 1;
  for (let x = gx; x < gx + gw; x += 28) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy + gh); ctx.stroke(); }
  for (let y = gy + ((t * 12) % 28); y < gy + gh; y += 28) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + gw, y); ctx.stroke(); }
  ctx.restore();
  // side panel (right, or below when narrow)
  const wide = gw > 760, pw = wide ? Math.min(330, gw * 0.32) : 0;
  const mapY = Math.max(gy + 24, 136), mapX = gx + 20, mapW = gw - pw - 40, mapH = gy + gh - 40 - mapY;   // (below the core HUD's panel)
  ctx.save(); drawMap(ctx, H, mapX, mapY, mapW, mapH, { me, t, crew: snap.crew }); ctx.restore();
  const R = readout(H);
  A.label(ctx, 'CHART TABLE', w / 2, 30, { size: 20, weight: 900, color: COL.holo });
  if (wide) {
    const px = gx + gw - pw - 6, py = gy + 16;
    A.rr(ctx, px, py, pw - 10, gh - 32, 10); ctx.fillStyle = 'rgba(5,12,16,0.72)'; ctx.fill(); A.stroke(ctx, 2, 'rgba(95,214,228,0.4)');
    let y = py + 30; const lx = px + 16, L = (txt, o = {}) => { A.label(ctx, txt, lx, y, { align: 'left', size: 14, ...o }); y += (o.size || 14) + 10; };
    L(H.step >= H.steps ? 'LAST STEP' : `STEP ${H.step} / ${H.steps}`, { size: 13, weight: 800, color: '#8fc8d0' });
    L(H.step >= H.steps ? `jump point in ${fmt(H.timer)}` : `next jump in ${fmt(H.timer)}`, { size: 26, weight: 900, color: COL.ship });
    A.bar(ctx, lx, y - 8, pw - 42, 10, H.timer / (H.step === 0 ? Math.max(H.timer, 1) : H.stepTime), COL.ship); y += 14;
    const n = nextNode(H);
    L(n && n.jump ? 'then: the jump' : n ? `then: lane ${n.lane + 1}` : 'then: drifting (no course)', { size: 15, weight: 700, color: n ? COL.course : '#ffb347' });
    if (n && !n.jump) L(sideWord(encOf(H, n.step, n.lane)), { size: 15, weight: 700, color: R.color });
    const here = encOf(H, H.step, H.lane);
    L(`now: lane ${H.lane + 1}${here ? ', ' + sideWord(here) : ''}`, { size: 13, color: '#aab2c0' });
    L(`course: ${H.course.length} of ${H.steps - H.step} steps charted`, { size: 13, color: '#aab2c0' });
    y += 8; L('LEGEND', { size: 12, weight: 800, color: '#8fc8d0' });
    const leg = (draw, txt) => { draw(lx + 10, y); A.label(ctx, txt, lx + 30, y, { align: 'left', size: 13, color: '#d8e0e8' }); y += 30; };
    leg((x, y) => gunshipIcon(ctx, x, y, 10, null), 'gunship between two lanes:');
    A.label(ctx, 'left lane: from the RIGHT, right lane: from the LEFT', lx + 30, y - 12, { align: 'left', size: 11, color: '#aab2c0' }); y += 10;
    leg((x, y) => gunshipIcon(ctx, x, y, 10, 'left'), 'gunship off the edge (from that side)');
    leg((x, y) => rockIcon(ctx, x, y, 11), 'asteroids (from ahead)');
    leg((x, y) => shipIcon(ctx, x, y, 9), 'the ship');
    leg((x, y) => { ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); A.stroke(ctx, 4, COL.course); }, 'the charted course');
    leg((x, y) => { ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); A.stroke(ctx, 4, COL.path); }, 'the way flown');
  } else {
    A.label(ctx, `step ${H.step}/${H.steps} · ${R.text}`, w / 2, gy + gh - 16, { size: 14, weight: 800, color: R.color, bg: 'rgba(5,12,16,0.8)' });
  }
}
function chartHint(snap, me) {
  const H = snap.helm;
  const back = H && H.course.length ? 'Q / Backspace: take back the last pick' : 'Q / Backspace: leave';
  return `arrows / WASD: cursor · E / Space: pick the next node (on the ship: leave) · ${back}`;
}
B.STATION_VIEWS.chart = { draw: drawChartView, hint: chartHint };

// ---------------------------------------------------------------------------
// The chart table on the ship plan: a holo map floating over the table (ship-local px)
// ---------------------------------------------------------------------------
B.STATION_ART.chart = (ctx, st, snap, t) => {
  const H = snap.helm, tb = B.CLUTTER.find(c => c.kind === 'chartTable');
  if (!tb) return;
  const x = tb.x * T, y = tb.y * T, w = tb.w * T, h = tb.h * T;
  // the emitter in the table top
  A.rr(ctx, x + 6, y + 6, w - 12, h - 12, 3); ctx.fillStyle = '#123a42'; ctx.fill(); A.stroke(ctx, 1.5);
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w * 0.3, h * 0.22, 0, 0, TAU); ctx.fillStyle = `rgba(95,214,228,${0.35 + 0.1 * Math.sin(t * 3)})`; ctx.fill();
  if (!H) return;
  // the projection: a pane above the table, wider than it
  const px = (tb.x - 0.5) * T, py = (tb.y - 2.1) * T, pw = (tb.w + 1.0) * T, ph = (tb.h + 2.0) * T;
  ctx.save();
  ctx.globalAlpha = 0.92;
  A.rr(ctx, px, py, pw, ph, 8);
  const g = ctx.createLinearGradient(0, py, 0, py + ph); g.addColorStop(0, 'rgba(40,130,150,0.38)'); g.addColorStop(1, 'rgba(60,190,210,0.5)');
  ctx.fillStyle = g; ctx.fill(); A.stroke(ctx, 2, 'rgba(127,246,255,0.75)');
  ctx.beginPath(); ctx.moveTo(px + pw * 0.15, py + ph); ctx.lineTo(x + w * 0.3, y + h * 0.5); ctx.lineTo(x + w * 0.7, y + h * 0.5); ctx.lineTo(px + pw * 0.85, py + ph); ctx.closePath();
  ctx.fillStyle = 'rgba(95,214,228,0.12)'; ctx.fill();
  drawMap(ctx, H, px + 2, py + 16, pw - 4, ph - 22, { small: true, t });
  A.label(ctx, fmt(H.timer), px + pw / 2, py + 9, { size: 11, weight: 900, color: H.timer < 6 ? '#ff9a8a' : COL.ship, outline: true });
  ctx.restore();
};

// ---------------------------------------------------------------------------
// Everyone's HUD: the next jump and what waits there (top middle). Not while at the chart (it says it bigger).
// ---------------------------------------------------------------------------
B.HUD_HOOKS.push((ctx, snap, me, w, h, t) => {
  const H = snap.helm;
  if (!H || snap.phase !== 'run' || (me && me.station === 'chart')) return;
  const R = readout(H);
  const x = w / 2, y = 26;
  A.label(ctx, R.text, x, y, { size: 16, weight: 800, color: R.color, bg: 'rgba(10,12,18,0.78)' });
  const here = encOf(H, H.step, H.lane);
  A.label(ctx, `step ${H.step}/${H.steps} · lane ${H.lane + 1}${here ? ' · now: ' + sideWord(here) : ''} · course ${H.course.length} charted`, x, y + 26, { size: 12, color: '#aab2c0', bg: 'rgba(10,12,18,0.6)' });
  if (H.timer < 5 && Math.sin(t * 10) > 0) { ctx.beginPath(); ctx.arc(x - ctx.measureText(R.text).width / 2 - 28, y, 5, 0, TAU); ctx.fillStyle = R.color; ctx.fill(); }
});
B.helmView = { drawMap, readout, nextNode };
})();
