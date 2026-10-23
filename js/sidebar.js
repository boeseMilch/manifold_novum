// Encounter sidebar (left edge): a header with the jump clock and damage lights, then one dark,
// high-contrast panel per encounter / problem (all broken parts share one). New panels slide up from the
// bottom into their slot and stay until the problem is dealt with; problems that are actually
// happening get a pulsing red light. Problems somewhere off-screen also get an arrow at the screen's
// edge with the room's name (drawProblemMarkers). Screen-space drawing.

const PLATE_W = 268, PLATE_H = 58, PLATE_GAP = 7, SIDEBAR_X = 12, HEAD_H = 62;
const sidePlates = new Map();                          // key → { y, x, alpha, age, leaving, data }
const uid = (o) => o.uid || (o.uid = newUid());

// Everything that deserves a plate right now, most urgent first.
function encounterPlates() {
  const out = [];
  const add = (key, d) => out.push({ key, ...d });
  // the objective is pinned at the top
  if (mission.active && mission.objective && !mission.over) { const o = objectiveStatus(); add('objective', { icon: 'jump', title: o.done ? 'OBJECTIVE ✔' : 'OBJECTIVE', sub: o.text, stripe: o.done ? '#5fd6a0' : '#ffe08a' }); }
  if (mission.active && mission.jump && !mission.over) {
    const handle = mission.rules?.handle && (mission.jump.pull || 0) < JUMP_PULL ? `pull the handle at the helm (${Math.floor(mission.jump.pull || 0)}/${JUMP_PULL} s)` : '';
    const need = broken(CAPACITORS[1]) ? 'fix the middle capacitor, then 1 energy' : CAPACITORS[1].charge > 0 ? '' : handle ? '1 energy in MID' : 'needs 1 energy in the middle capacitor';
    add('jump', { icon: 'jump', title: 'JUMP DRIVE', sub: [handle, need].filter(Boolean).join(' + '), stripe: need ? '#ff5a4a' : '#7af0ff', red: true, wrap: true });
    if (mission.press?.n > 1 || mission.press?.strain) add('press', { icon: 'surge', title: 'HOT ZONE', sub: 'it only gets worse until you jump', stripe: '#ff8a2e', red: true, wrap: true });
  }
  for (const e of combat.enemies) if (e.phase === 'fighting') {
    const hit = e.pois.filter(p => p.hit).length;
    add('enemy' + uid(e), { icon: { stealth: 'interceptor', tractor: 'interceptor', grappler: 'spore', mother: 'spore', pirate: 'frigate', derelict: 'frigate' }[e.kind] || e.kind, title: e.D.name.toUpperCase(), sub: `${e.side === 'port' ? 'left' : 'right'} side · ${hit}/${e.pois.length} weak spots hit${e.charge >= 0 ? ' · HEAVY SHOT!' : ''}`, stripe: '#e2574c', red: true });
  }
  if (combat.swarm || combat.asteroids.length)
    add('swarm', { icon: 'asteroid', title: 'ASTEROID SWARM', sub: `${swarmWhere()} · ${combat.asteroids.length} incoming${combat.swarm?.left ? `, ${combat.swarm.left} more` : ''}`, stripe: '#e2574c', red: true });
  for (const p of boarding.pods || []) if (p.state === 'stir' && p.t >= 0)   // (chapter 2: a cargo pod about to burst, js/invader.js)
    add('pod' + p.id, { icon: 'alien', title: 'CARGO POD', sub: `something is breaking out · reactor room · ${Math.max(0, Math.ceil(POD_STIR - p.t))} s`, stripe: '#ffb36a', red: true });
  for (const a of boarding.invaders) {
    const room = (id) => ROOMS.find(r => r.id === id)?.name.toLowerCase();
    const where = a.state === 'dormant' ? 'asleep on the derelict' : a.state === 'entering' ? `breaking in (${a.hatch.side === 'port' ? 'left' : 'right'} airlock)` : a.state === 'fight' ? 'attacking!'
      : a.state === 'work' ? `wrecking the ${a.task.sys.name.toLowerCase()} · ${Math.ceil(a.task.need - a.task.t)} s`
      : a.state === 'sneak' || a.state === 'cloak' ? `cloaked · somewhere next to the ${room(a.room) || "airlock"}`
      : a.kind === 'saboteur' ? `in the ${room(a.room) || 'ship'}`
      : DOORS[a.waitDoor] && !a.path?.length ? `waiting at a locked door · in the ${roomAt(a.x, a.y)?.name.toLowerCase() || 'ship'}`   // (it can't open doors)
      : `hunting · in the ${roomAt(a.x, a.y)?.name.toLowerCase() || 'airlock'}`;
    const sab = a.kind === 'saboteur';
    add('inv' + uid(a), { icon: 'alien', title: sab ? 'SABOTEUR' : 'INTRUDER', sub: `${where} · ${a.hp}/${invaderMaxHp(a)} hp`, stripe: sab ? '#5ae0ff' : '#9cff5a', red: true });
  }
  for (const f of fires) add('fire' + uid(f), { icon: 'fire', title: f.plasma ? 'PLASMA FIRE' : 'FIRE', sub: `${f.sys.name} · flares up in ${Math.ceil(fireLeft(f))} s${f.plasma ? ' · vent it at the airlock panel!' : ''}`, stripe: f.plasma ? '#b07aff' : '#ff8a2e', red: true });
  for (const b of hz.breaches) add('breach' + b.room, { icon: 'breach', title: b.tarp ? 'TARPED BREACH' : 'HULL BREACH', sub: `${roomById(b.room).name}${b.tarp ? ' · holds until the next hit' : b.plated ? ' · nail the plate down (repair kit)' : ' · plate + repair kit, outside'}`, stripe: b.tarp ? '#e8c34f' : '#7ab8ff', red: !b.tarp });
  if (hz.vent) add('vent', { icon: 'breach', title: hz.vent.forced ? 'AIRLOCK FORCED · VENTING' : 'VENTING', sub: `${roomById(hz.vent.room).name} · ${Math.ceil(hz.vent.t)} s`, stripe: '#7ab8ff', red: true });
  for (const id of hz.surges) add('surge' + id, { icon: 'surge', title: 'POWER SURGE', sub: `${lineName(LINE[id])} · splice it (repair kit)`, stripe: '#bfe8ff', red: true });
  for (const id of hz.noGrav) add('grav' + id, { icon: 'surge', title: 'NO GRAVITY', sub: `${roomById(id).name} · reset the floor breaker (repair kit)`, stripe: '#7af0ff', red: true });
  evaPlates(add);
  shipEventPlates(add);
  organicPlates(add);
  dockPlates(add);
  for (const svc of serviceTargets()) add('failing' + svc.name, { icon: 'wrench', title: 'FAILING', sub: `${svc.name} · ${diagState(svc).text.replace('FAILING — ', '')}`, stripe: '#ff9a2e', red: true });
  const dead = SYSTEMS.filter(s => s.broken);                // (one panel for all of them: the header counts them too)
  if (dead.length) add('broken', { icon: 'wrench', title: dead.length > 1 ? `BROKEN (${dead.length})` : 'BROKEN', sub: dead.map(s => s.outside ? `${s.name} (outside)` : s.name).join(', '), stripe: '#e2574c', red: true, wrap: true });
  if (mission.active && !mission.over) {
    const { known } = radarList();
    for (const e of known) if (!e.done) add('ev' + e.id, { icon: EVENT_ICONS[e.kind] || e.kind, title: eventLabel(e).split(' — ')[0].toUpperCase(), sub: `${eventLabel(e).split(' — ')[1]} · T-${Math.ceil(e.t - mission.t)}`, stripe: '#e8c34f' });
    // a maintenance pair seen at the helm, not yet orange: one panel per pair (names sorted: it doesn't say which one fails)
    for (const w of maintWarnings()) if (w.ev.seen && !w.orange) add('irr' + w.ev.id, { icon: 'wrench', title: 'IRREGULAR', sub: `${[w.sys, w.decoy].filter(s => s && !s.broken).map(s => s.name).sort().join(' or ')}`, stripe: '#ffd84a' });
  }
  return out;
}

// Layout (game clock): the panels form one column in list order. Each one takes up `grow` (0..1) of a
// slot: a new panel opens its slot (the ones below glide down) while it slides in from the left, a
// panel that's dealt with slides out and closes its slot. Positions are cumulative, so panels never
// overlap, also while they move. What doesn't fit is summed up in a "+n more" line.
let sideOrder = [], sideMore = 0;
function updateSidebar(top, dt) {
  const list = encounterPlates(), keys = new Set(list.map(p => p.key));
  const headH = mission.active ? HEAD_H : 0, y0 = top + 10 + (headH ? headH + PLATE_GAP : 0);
  const fit = Math.max(1, Math.floor((VH - 140 - y0 - 22) / (PLATE_H + PLATE_GAP)));   // (above the energy panel, room for "+n more")
  const shown = list.length > fit + 1 ? list.slice(0, fit) : list;
  sideMore = list.length - shown.length;
  const shownKeys = new Set(shown.map(d => d.key));
  shown.forEach(d => {
    let p = sidePlates.get(d.key);
    if (!p) { p = { y: null, x: -PLATE_W - 40, alpha: 1, age: 0, grow: 0 }; sidePlates.set(d.key, p); if (d.red) sfx.alarm?.(); }
    p.data = d; p.leaving = false; p.absent = 0;
  });
  // the column's order: this tick's list, with leaving panels kept where they were
  const order = shown.map(d => d.key);
  sideOrder.forEach((k, i) => { if (!shownKeys.has(k) && sidePlates.has(k)) order.splice(Math.min(i, order.length), 0, k); });
  for (const k of sidePlates.keys()) if (!order.includes(k)) order.push(k);   // (never lose track of one)
  sideOrder = order;
  let y = y0;
  for (const k of order) {
    const p = sidePlates.get(k);
    if (!shownKeys.has(k) && (p.absent = (p.absent || 0) + dt) > 0.25) p.leaving = true;   // (gone for a moment, e.g. one odd snapshot: it stays put)
    p.age += dt;
    if (p.leaving) {                                 // slide out first, then close the slot
      p.x -= dt * 900; p.alpha = Math.max(0, p.alpha - dt * 4);
      if (p.alpha <= 0) p.grow = Math.max(0, p.grow - dt * 5);
    } else {                                         // open the slot first, then slide in
      p.alpha = 1; p.grow = Math.min(1, p.grow + dt * 5);
      if (p.grow >= 1) { p.x = lerp(p.x, 0, 1 - Math.exp(-12 * dt)); if (Math.abs(p.x) < 0.5) p.x = 0; }
    }
    const ty = y;                                    // its slot: glides up into it, never above it (no overlap)
    p.y = p.y == null ? ty : Math.max(ty, lerp(p.y, ty, 1 - Math.exp(-9 * dt)));
    y = p.y + (PLATE_H + PLATE_GAP) * p.grow;
    if (p.leaving && p.grow <= 0) sidePlates.delete(k);
  }
  sideOrder = sideOrder.filter(k => sidePlates.has(k));
  updateSidebar.bottom = y;
}
function drawSidebar(top) {
  if (mission.active) drawSidebarHeader(top + 10);
  for (const k of sideOrder) { const p = sidePlates.get(k); if (p && p.alpha > 0.01) drawPlate(p); }
  if (sideMore > 0) {
    const y = (updateSidebar.bottom || 0) + 4;
    ctx.font = '700 13px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const t = `+ ${sideMore} more`, w = ctx.measureText(t).width + 20;
    rr(SIDEBAR_X, y, w, 22, 6); ctx.fillStyle = 'rgba(12,14,20,0.9)'; ctx.fill();
    ctx.fillStyle = '#dfe4ec'; ctx.fillText(t, SIDEBAR_X + 10, y + 11);
  }
}

// The screen rects (CSS px) the left-hand panels cover right now: the sidebar's header, its plates (where they are,
// sliding ones too), the "+n more" line and the energy panel at the bottom left. The in-world prompt keeps out from
// under them (js/game.js, keepOffPanels).
function leftPanelRects(top) {
  const out = [];
  if (mission.active) out.push({ x: SIDEBAR_X, y: top + 10, w: PLATE_W, h: HEAD_H });
  for (const k of sideOrder) { const p = sidePlates.get(k); if (p && p.alpha > 0.01 && p.y != null) out.push({ x: SIDEBAR_X + p.x, y: p.y, w: PLATE_W, h: PLATE_H }); }
  if (sideMore > 0) out.push({ x: SIDEBAR_X, y: (updateSidebar.bottom || 0) + 4, w: 140, h: 22 });
  if (typeof powerPanelRect === 'function') out.push(powerPanelRect());
  if (typeof invSlots === 'function' && me.mode !== 'gun') for (const b of invSlots()) out.push({ x: b.x, y: b.y, w: b.w, h: b.h });
  return out;
}
// Where a screen box (x, y, w, h) has to move so it's under none of the `avoid` rects and stays on a W x H screen
// (pad px clear of both): {dx, dy}, the smallest shift right of / below / above them (or none: {0, 0} when it's
// clear already, or when nothing fits). Pure: tests/sidebar.js.
function keepOffPanels(box, avoid, W, H, pad = 8) {
  const hits = (dx, dy) => avoid.some(r => box.x + dx < r.x + r.w + pad && box.x + box.w + dx > r.x - pad && box.y + dy < r.y + r.h + pad && box.y + box.h + dy > r.y - pad);
  if (!hits(0, 0)) return { dx: 0, dy: 0 };
  const xs = [0, ...avoid.map(r => r.x + r.w + pad - box.x)];
  const ys = [0, ...avoid.flatMap(r => [r.y + r.h + pad - box.y, r.y - pad - box.y - box.h])];
  const onScreen = (dx, dy) => (box.x + dx >= pad || dx <= 0) && box.x + box.w + dx <= W - pad && box.y + dy >= pad && box.y + box.h + dy <= H - pad;
  let best = null;
  for (const dx of xs) for (const dy of ys) {
    if (!onScreen(dx, dy) || hits(dx, dy)) continue;
    const cost = Math.abs(dx) + Math.abs(dy);
    if (!best || cost < best.cost) best = { dx, dy, cost };
  }
  return best ? { dx: best.dx, dy: best.dy } : { dx: 0, dy: 0 };
}

function plateBody(x, y, w, h) {
  rr(x, y, w, h, 8); ctx.fillStyle = 'rgba(12,14,20,0.9)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#4b5263'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 6, y + 2, w - 12, 1.5);   // a thin top highlight
}

// A plate's second line in the current font (500 13px) and `room` px: two lines if it wraps and that fits,
// else one, cut off with '…'. Remembered per text (it was ~a dozen measureTexts per plate, every frame).
// (measure: the text's width; tests pass their own)
const plateLineCache = new Map();
function plateLines(text, room, wrap, measure = (s) => ctx.measureText(s).width) {
  const key = room + '|' + (wrap ? 1 : 0) + '|' + text;
  let out = plateLineCache.get(key);
  if (out) return out;
  const fits = (s) => measure(s) <= room;
  const words = text.split(' '), cut = words.findIndex((_, i) => !fits(words.slice(0, i + 1).join(' ')));
  if (wrap && cut > 0 && fits(words.slice(cut).join(' '))) out = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];   // (wrap: two lines instead of cutting it off)
  else {
    let sub = text; while (!fits(sub) && sub.length > 4) sub = sub.slice(0, -2);
    if (sub !== text) sub = sub.slice(0, -1) + '…';
    out = [sub];
  }
  if (plateLineCache.size > 400) plateLineCache.clear();      // (texts with timers in them: keep it small)
  plateLineCache.set(key, out);
  return out;
}

function drawPlate(p) {
  const d = p.data, x = SIDEBAR_X + p.x, y = p.y, w = PLATE_W, h = PLATE_H, t = time;
  ctx.save(); ctx.globalAlpha = clamp(p.alpha, 0, 1);
  plateBody(x, y, w, h);
  rr(x + 1, y + 1, 7, h - 2, 4); ctx.fillStyle = d.stripe; ctx.fill();          // coloured edge
  ctx.beginPath(); ctx.arc(x + 32, y + h / 2, 17, 0, TAU); ctx.fillStyle = '#232833'; ctx.fill();
  plateIcon(d.icon, x + 32, y + h / 2, t);
  ctx.textBaseline = 'middle';
  ctx.font = '800 16px system-ui, sans-serif'; ctx.fillStyle = '#ffffff';
  ctx.fillText(d.title, x + 58, y + 18);
  ctx.font = '500 13px system-ui, sans-serif'; ctx.fillStyle = '#dfe4ec';
  const lines = plateLines(d.sub, w - 66 - (d.red ? 14 : 0), d.wrap);
  if (lines.length > 1) { ctx.fillText(lines[0], x + 58, y + 35); ctx.fillText(lines[1], x + 58, y + 49); }
  else ctx.fillText(lines[0], x + 58, y + 39);
  if (d.red) {                                       // red light: a problem that is happening right now
    const k = 0.55 + 0.45 * Math.sin(t * 6);
    ctx.beginPath(); ctx.arc(x + w - 14, y + 15, 5, 0, TAU); ctx.fillStyle = `rgb(255,${50 + 60 * k | 0},40)`; ctx.fill();
  }
  if (p.age < 0.6) {                                // fresh: brief flash
    ctx.globalAlpha = (1 - p.age / 0.6) * 0.35 * clamp(p.alpha, 0, 1);
    rr(x, y, w, h, 8); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  ctx.restore();
}

function drawSidebarHeader(y) {
  const x = SIDEBAR_X, w = PLATE_W, h = HEAD_H;
  plateBody(x, y, w, h);
  ctx.textBaseline = 'middle';
  const jumpIn = mission.jumpAt - mission.t;
  const stalled = typeof jumpStall === 'function' && jumpStall();
  ctx.font = '800 22px system-ui, sans-serif'; ctx.fillStyle = stalled ? (Math.sin(time * 8) > 0 ? '#ff5a4a' : '#ffb0a4') : mission.jump ? '#ffe08a' : '#ffffff';
  ctx.fillText(stalled ? 'JUMP STALLED' : mission.jump ? 'JUMPING…' : isFinite(jumpIn) ? `JUMP IN ${fmt(jumpIn)}` : MISSIONS[mission.id]?.tutorial ? 'TRAINING' : 'PRACTICE', x + 14, y + 22);
  ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#c9ced8';
  ctx.fillText(mission.lastScan === null ? 'radar: not scanned yet' : `radar: ${Math.floor(mission.t - mission.lastScan)} s ago`, x + 14, y + 46);
  // damage lights: one per broken system; more than MAX_DAMAGE loses the ship
  const dmg = SYSTEMS.filter(s => s.broken).length;
  const gap = MAX_DAMAGE > 5 ? 13 : 15, cx = x + w - 12 - (MAX_DAMAGE - 1) * gap / 2 - 7;
  ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = '#dfe4ec'; ctx.textAlign = 'center';
  ctx.fillText(dmg >= MAX_DAMAGE ? 'ONE MORE = LOST' : `DAMAGE ${dmg}/${MAX_DAMAGE}`, cx, y + 17);
  for (let i = 0; i < MAX_DAMAGE; i++) {
    const bx = cx + (i - (MAX_DAMAGE - 1) / 2) * gap, by = y + 39, on = i < dmg;
    ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.fillStyle = on ? '#ff4a3a' : '#2b303a'; ctx.fill(); stroke(1.5, on ? '#ffb0a4' : '#5a6272');
  }
  ctx.textAlign = 'left';
}

// Where the asteroids come from (the rocks in flight, then the ones still to come): 'front', 'left', 'left + front' ...
function swarmWhere() {
  const all = [...combat.asteroids.map(a => a.side || 'front'), ...(combat.swarm ? swarmSides(combat.swarm) : [])];
  return [...new Set(all)].map(s => SIDE_LABEL[s].toLowerCase()).join(' + ') || 'front';
}
// The radar contact plates' icon per event kind (default: the kind itself).
const EVENT_ICONS = { swarm: 'asteroid', intruder: 'alien', mines: 'mine', herd: 'spore', grappler: 'spore', leeches: 'spore', mother: 'spore', spores: 'spore' };
// Little glyphs for the plates (drawn around cx, cy, ~14 px).
function plateIcon(kind, cx, cy, t) {
  ctx.save(); ctx.translate(cx, cy);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (kind === 'interceptor') {
    poly([[0, -11], [3, -4], [9, 4], [9, 8], [2, 6], [0, 9], [-2, 6], [-9, 8], [-9, 4], [-3, -4]]);
    ctx.fillStyle = '#c0574c'; ctx.fill(); stroke(1.5);
    ctx.beginPath(); ctx.ellipse(0, -5, 1.8, 3, 0, 0, TAU); ctx.fillStyle = '#8fd0ff'; ctx.fill();
  } else if (kind === 'frigate') {
    poly([[0, -12], [4, -7], [5, 9], [-5, 9], [-4, -7]]); ctx.fillStyle = '#9a6c74'; ctx.fill(); stroke(1.5);
    ctx.fillStyle = '#ffd38a'; ctx.fillRect(-2, -4, 4, 2); ctx.fillStyle = '#3d8fe0'; ctx.fillRect(4, -1, 4, 3);
  } else if (kind === 'asteroid') {
    poly(Array.from({ length: 8 }, (_, i) => [Math.cos(i / 8 * TAU) * (9 + (i % 3) * 1.5), Math.sin(i / 8 * TAU) * (9 + (i % 2) * 1.5)]));
    ctx.fillStyle = '#8d8274'; ctx.fill(); stroke(1.5);
    ctx.strokeStyle = '#ff8a2e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-3, -2); ctx.lineTo(0, 1); ctx.lineTo(3, -1); ctx.lineTo(6, 2); ctx.stroke();
  } else if (kind === 'alien') {
    ctx.beginPath(); ctx.ellipse(0, 2, 7, 8, 0, 0, TAU); ctx.fillStyle = '#6a3a7c'; ctx.fill(); stroke(1.5);
    for (const [ex, ey] of [[-3, -1], [3, -1], [0, -4]]) { ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, TAU); ctx.fillStyle = '#c8ff6e'; ctx.fill(); }
    ctx.strokeStyle = '#6a3a7c'; ctx.lineWidth = 2;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 6, 4); ctx.lineTo(s * 11, 9); ctx.stroke(); }
  } else if (kind === 'fire') {
    for (const [c, k] of [['#d8401c', 1], ['#ff9a2e', 0.7], ['#fff0a8', 0.4]]) {
      const h = 12 * k * (0.9 + 0.1 * Math.sin(t * 10)), w = 7 * k;
      ctx.beginPath(); ctx.moveTo(-w, 7); ctx.bezierCurveTo(-w, 0, 0, -h * 0.5, 0, -h); ctx.bezierCurveTo(0, -h * 0.5, w, 0, w, 7); ctx.closePath();
      ctx.fillStyle = c; ctx.fill();
    }
  } else if (kind === 'wrench') {
    ctx.rotate(-0.7); ctx.fillStyle = '#c9ced8';
    ctx.fillRect(-8, -2, 13, 4);
    ctx.beginPath(); ctx.arc(7, 0, 5, 0.8, TAU - 0.8); ctx.lineTo(7, 0); ctx.closePath(); ctx.fill(); stroke(1.2);
    ctx.beginPath(); ctx.arc(-8, 0, 3.5, 0, TAU); ctx.fill(); stroke(1.2);
  } else if (kind === 'clover') {
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 2 + 0.3);
      ctx.beginPath(); ctx.ellipse(0, -5, 4.5, 5.5, 0, 0, TAU); ctx.fillStyle = '#4caf6a'; ctx.fill(); stroke(1.2);
      ctx.restore();
    }
    ctx.strokeStyle = '#2e7a44'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(3, 7, 2, 11); ctx.stroke();
  } else if (kind === 'flare') {
    ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fillStyle = '#ffd38a'; ctx.fill(); stroke(1.5);
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + t; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 8, Math.sin(a) * 8); ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.stroke(); }
  } else if (kind === 'mine') {
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(1.5);
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fillStyle = Math.sin(t * 8) > 0 ? '#ff4a3a' : '#5a1a14'; ctx.fill();
  } else if (kind === 'spore') {
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * 5, Math.sin(a) * 5, 4.5, 0, TAU); ctx.fillStyle = '#a89a7a'; ctx.fill(); stroke(1); }
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fillStyle = '#3a2a48'; ctx.fill();
  } else if (kind === 'breach') {
    poly(Array.from({ length: 10 }, (_, i) => { const a = i / 10 * TAU, r = i % 2 ? 6 : 11; return [Math.cos(a) * r, Math.sin(a) * r]; }));
    ctx.fillStyle = '#05070c'; ctx.fill(); stroke(2, '#7ab8ff');
    ctx.fillStyle = '#fff'; ctx.fillRect(-2, -1, 1.5, 1.5); ctx.fillRect(3, 2, 1.5, 1.5);
  } else if (kind === 'surge') {
    poly([[2, -12], [-6, 1], [0, 1], [-3, 12], [7, -2], [1, -2]]); ctx.fillStyle = '#bfe8ff'; ctx.fill(); stroke(1.5);
  } else if (kind === 'ping') {
    rr(-8, -6, 16, 12, 3); ctx.fillStyle = '#4b5263'; ctx.fill(); stroke(1.5);
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2; for (const r of [10, 14]) { ctx.beginPath(); ctx.arc(0, 0, r, -0.5, 0.5); ctx.stroke(); }
  } else if (kind === 'tide') {                       // a gravity tide: three waves
    ctx.strokeStyle = '#c8a8ff'; ctx.lineWidth = 2.5;
    for (const dy of [-6, 0, 6]) { ctx.beginPath(); for (let x = -9; x <= 9; x++) { const y = dy + Math.sin(x * 0.6 + t * 4) * 2.2; x === -9 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
  } else if (kind === 'jump') {
    ctx.strokeStyle = '#7af0ff'; ctx.lineWidth = 3;
    for (const dy of [4, -2, -8]) { ctx.beginPath(); ctx.moveTo(-7, dy + 5); ctx.lineTo(0, dy); ctx.lineTo(7, dy + 5); ctx.stroke(); }
  } else {                                           // unknown
    ctx.fillStyle = '#ff4a3a'; ctx.font = '900 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 1);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Where things happen: every active problem with a place in the ship (fires, broken parts, hull
// breaches, intruders, arcing lines, dead gravity, a crewmate down). Off-screen ones get an arrow at
// the edge of the view with what and where ("FIRE · Bridge"); new ones on screen get a short ping.
// ---------------------------------------------------------------------------
const problemSeen = new Map();                      // key → time first seen (for the ping)
function problemSpots() {
  const out = [], where = (x, y, fallback) => roomAt(x, y)?.name || (typeof inDock === 'function' && inDock(x, y) ? dockName() : fallback);
  for (const f of fires) if (f.hp > 0) out.push({ key: 'fire' + uid(f), x: f.x, y: f.y, icon: 'fire', what: f.plasma ? 'PLASMA FIRE' : 'FIRE', room: where(f.x, f.y, f.sys.name), col: '#ff8a2e' });
  for (const s of SYSTEMS) if (s.broken) out.push({ key: 'sys' + s.name, x: s.x, y: s.y, icon: 'wrench', what: 'BROKEN', room: s.name + (s.outside ? ' (outside)' : ''), col: '#ff6a5a' });
  for (const s of serviceTargets()) if (s.kind === 'seam' || s.outside)   // (no part to recognize there: a hull seam, or an emitter outside)
    out.push({ key: 'failing' + s.name, x: s.x, y: s.y, icon: s.kind === 'seam' ? 'breach' : 'wrench', what: 'FAILING', room: s.kind === 'seam' ? s.name : `${s.name} (outside)`, col: '#ff9a2e' });
  for (const b of hz.breaches) if (!b.tarp) { const p = BREACH_SPOTS[b.room]; if (p) out.push({ key: 'breach' + b.room, x: p.x, y: p.y, icon: 'breach', what: 'BREACH', room: roomById(b.room).name, col: '#7ab8ff' }); }
  for (const a of boarding.invaders) if (!['dormant', 'sneak', 'cloak'].includes(a.state))
    out.push({ key: 'inv' + uid(a), x: a.x, y: a.y, icon: 'alien', what: a.kind === 'saboteur' ? 'SABOTEUR' : 'INTRUDER', room: where(a.x, a.y, 'airlock'), col: '#c8ff6e' });
  for (const id of hz.surges) { const l = LINE[id]; if (l) { const [x, y] = linePoint(l, 0.5); out.push({ key: 'surge' + id, x, y, icon: 'surge', what: 'SURGE', room: where(x, y, lineName(l)), col: '#bfe8ff' }); } }
  for (const id of hz.noGrav) { const [x, y] = roomCenter(roomById(id)); out.push({ key: 'grav' + id, x, y, icon: 'surge', what: 'NO GRAVITY', room: roomById(id).name, col: '#7af0ff' }); }
  out.push(...sporeSpots());                          // infested rooms (js/spores.js)
  // on a spacewalk with a ship's tube over one of our airlocks: where that ship lets you in (js/dockentry.js)
  if (me?.mode === 'eva' && typeof dockEntries === 'function' && HATCHES.some(h => airlockTube(h)))
    for (const e of dockEntries()) out.push({ key: 'wayin' + e.ship, x: e.cx, y: e.face, icon: 'wrench', what: 'WAY IN', room: e.spec.what.replace(/^the /, ''), col: '#9cd8ff' });
  for (const c of crew) if (c !== me && !standing(c) && c.mode !== 'gun') out.push({ key: 'down' + c.id, x: c.x, y: c.y, icon: 'alien', what: `${c.name.toUpperCase()} DOWN`, room: where(c.x, c.y, ''), col: '#ff9ab0' });
  return out;
}
function drawProblemMarkers(view) {
  if (!mission.active || mission.over || !me) return;
  const spots = problemSpots(), keys = new Set(spots.map(s => s.key));
  for (const k of problemSeen.keys()) if (!keys.has(k)) problemSeen.delete(k);
  const box = { x0: SIDEBAR_X + PLATE_W + 20, y0: HUD_H + 56, x1: VW - 20, y1: invSlots()[0].y - 12 };   // (clear of the sidebar, banner and bottom HUD)
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const groups = new Map();                          // off-screen ones: one arrow per what + where
  for (const s of spots) {
    if (!problemSeen.has(s.key)) problemSeen.set(s.key, time);
    const sx = view.ox + s.x * T * view.zoom, sy = view.oy + s.y * T * view.zoom * view.sy;
    if (sx > box.x0 - 20 && sx < box.x1 + 20 && sy > box.y0 - 20 && sy < box.y1 + 20) {
      const age = time - problemSeen.get(s.key);   // on screen: a ping when it's new
      if (age < 2) for (const off of [0, 0.5]) {
        const q = (age + off) % 1;
        ctx.beginPath(); ctx.arc(sx, sy, 14 + q * 60, 0, TAU); ctx.strokeStyle = s.col; ctx.globalAlpha = (1 - q) * 0.9; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1;
      }
      continue;
    }
    const g = groups.get(s.what + s.room);
    if (g) g.n++; else groups.set(s.what + s.room, { ...s, sx, sy, n: 1 });
  }
  const placed = [];
  for (const g of [...groups.values()].slice(0, 6)) {
    const dx = g.sx - cx, dy = g.sy - cy, a = Math.atan2(dy, dx);
    const kx = dx ? (dx > 0 ? box.x1 - cx : box.x0 - cx) / dx : Infinity, ky = dy ? (dy > 0 ? box.y1 - cy : box.y0 - cy) / dy : Infinity;
    const k = Math.min(kx, ky);
    let px = cx + dx * k, py = cy + dy * k;
    const text = `${g.what}${g.n > 1 ? ` ×${g.n}` : ''}${g.room ? ' · ' + g.room : ''}`;
    ctx.font = '700 13px system-ui, sans-serif';
    const tw = ctx.measureText(text).width, w = tw + 46, h = 30;
    px = clamp(px, box.x0 + w / 2 + 14, box.x1 - w / 2 - 14);   // (the pill sits just inside the edge, the arrow points out)
    py = clamp(py, box.y0 + h / 2 + 14, box.y1 - h / 2 - 14);
    for (const q of placed) if (Math.abs(q.x - px) < (q.w + w) / 2 && Math.abs(q.y - py) < h + 4) py = q.y + (py >= q.y ? h + 6 : -h - 6);   // (don't stack on top of each other)
    placed.push({ x: px, y: py, w });
    const pulse = 0.75 + 0.25 * Math.sin(time * 5);
    // the arrow head, on the side the problem is
    const reach = Math.min(Math.abs(w / 2 / (Math.cos(a) || 1e-6)), Math.abs(h / 2 / (Math.sin(a) || 1e-6))) + 5;
    const ex = px + Math.cos(a) * reach, ey = py + Math.sin(a) * reach;
    ctx.save(); ctx.globalAlpha = pulse;
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
    poly([[10, 0], [-4, -9], [-4, 9]]); ctx.fillStyle = g.col; ctx.fill(); stroke(1.5, 'rgba(10,12,18,0.9)');
    ctx.restore();
    rr(px - w / 2, py - h / 2, w, h, h / 2); ctx.fillStyle = 'rgba(12,14,20,0.9)'; ctx.fill(); stroke(2, g.col);
    ctx.save(); ctx.translate(px - w / 2 + 17, py); ctx.scale(0.75, 0.75); plateIcon(g.icon, 0, 0, time); ctx.restore();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, px - w / 2 + 34, py + 0.5);
    ctx.restore();
  }
}
