// Encounter sidebar (left edge): a steel header with the mission clock and damage lights,
// then one riveted metal plate per encounter / problem. New plates slide up from the bottom
// into their slot and stay until the problem is dealt with; problems that are actually
// happening get a pulsing red light. Screen-space drawing.

const PLATE_W = 236, PLATE_H = 54, PLATE_GAP = 7, SIDEBAR_X = 12;
const sidePlates = new Map();                          // key → { y, x, alpha, age, leaving, data }
const uid = (o) => o.uid || (o.uid = newUid());

// Everything that deserves a plate right now, most urgent first.
function encounterPlates() {
  const out = [];
  const add = (key, d) => out.push({ key, ...d });
  if (mission.active && mission.jump)
    add('jump', { icon: 'jump', title: 'JUMP DRIVE', sub: `${mission.rules?.handle ? `pull the handle at the helm (${Math.floor(mission.jump.pull || 0)}/${JUMP_PULL} s) + ` : 'needs '}1 energy in MID · ${fmt(JUMP_WINDOW * (mission.rules?.handle ? 2 : 1) - mission.jump.t)}`, stripe: '#7af0ff', red: true });
  for (const e of combat.enemies) if (e.phase === 'fighting') {
    const hit = e.pois.filter(p => p.hit).length;
    add('enemy' + uid(e), { icon: { stealth: 'interceptor', tractor: 'interceptor', grappler: 'spore', mother: 'spore', pirate: 'frigate', derelict: 'frigate' }[e.kind] || e.kind, title: e.D.name.toUpperCase(), sub: `${e.side === 'port' ? 'left' : 'right'} side · ${hit}/${e.pois.length} weak spots hit${e.charge >= 0 ? ' · HEAVY SHOT!' : ''}`, stripe: '#e2574c', red: true });
  }
  if (combat.swarm || combat.asteroids.length)
    add('swarm', { icon: 'asteroid', title: 'ASTEROID SWARM', sub: `front · ${combat.asteroids.length} incoming${combat.swarm?.left ? `, ${combat.swarm.left} more` : ''}`, stripe: '#e2574c', red: true });
  for (const a of boarding.invaders) {
    const room = (id) => ROOMS.find(r => r.id === id)?.name.toLowerCase();
    const where = a.state === 'dormant' ? 'asleep on the derelict' : a.state === 'entering' ? `breaking in (${a.hatch.side === 'port' ? 'left' : 'right'} airlock)` : a.state === 'fight' ? 'attacking!'
      : a.state === 'work' ? `wrecking the ${a.task.sys.name.toLowerCase()} · ${Math.ceil(a.task.need - a.task.t)} s`
      : a.state === 'sneak' || a.state === 'cloak' ? `cloaked · somewhere next to the ${room(a.room) || "airlock"}`
      : a.kind === 'saboteur' ? `in the ${room(a.room) || 'ship'}`
      : `hunting · in the ${roomAt(a.x, a.y)?.name.toLowerCase() || 'airlock'}`;
    const sab = a.kind === 'saboteur';
    add('inv' + uid(a), { icon: 'alien', title: sab ? 'SABOTEUR' : 'INTRUDER', sub: `${where} · ${a.hp}/${invaderMaxHp(a)} hp`, stripe: sab ? '#5ae0ff' : '#9cff5a', red: true });
  }
  for (const f of fires) add('fire' + uid(f), { icon: 'fire', title: f.plasma ? 'PLASMA FIRE' : 'FIRE', sub: `${f.sys.name} · ${Math.ceil(fireLeft(f))} s${f.plasma ? ' · vent it at the airlock panel!' : ''}`, stripe: f.plasma ? '#b07aff' : '#ff8a2e', red: true });
  for (const b of hz.breaches) add('breach' + b.room, { icon: 'breach', title: b.tarp ? 'TARPED BREACH' : 'HULL BREACH', sub: `${roomById(b.room).name}${b.tarp ? ' · holds until the next hit' : b.plated ? ' · nail the plate down (repair kit)' : ' · plate + repair kit, outside'}`, stripe: b.tarp ? '#e8c34f' : '#7ab8ff', red: !b.tarp });
  if (hz.vent) add('vent', { icon: 'breach', title: 'VENTING', sub: `${roomById(hz.vent.room).name} · ${Math.ceil(hz.vent.t)} s`, stripe: '#7ab8ff', red: true });
  for (const id of hz.surges) add('surge' + id, { icon: 'surge', title: 'POWER SURGE', sub: `${lineName(LINE[id])} · splice it (repair kit)`, stripe: '#bfe8ff', red: true });
  for (const id of hz.noGrav) add('grav' + id, { icon: 'surge', title: 'NO GRAVITY', sub: `${roomById(id).name} · reset the breaker`, stripe: '#7af0ff', red: true });
  if (mission.active && mission.objective && !mission.over) { const o = objectiveStatus(); add('objective', { icon: 'jump', title: o.done ? 'OBJECTIVE ✔' : 'OBJECTIVE', sub: o.text, stripe: o.done ? '#5fd6a0' : '#ffe08a' }); }
  evaPlates(add);
  shipEventPlates(add);
  organicPlates(add);
  dockPlates(add);
  const svc = mission.active ? serviceTarget() : null;
  if (svc) add('failing', { icon: 'wrench', title: 'FAILING', sub: `${svc.name} · ${diagState(svc).text.replace('FAILING — ', '')}`, stripe: '#ff9a2e', red: true });
  for (const s of SYSTEMS) if (s.broken) add('broken' + s.name, { icon: 'wrench', title: 'BROKEN', sub: s.outside ? `${s.name} · no shield · fix it outside` : s.name, stripe: '#e2574c', red: true });
  if (mission.active && !mission.over) {
    const { known, mocks } = radarList();
    for (const e of known) if (!e.done) add('ev' + e.id, { icon: e.kind === 'swarm' ? 'asteroid' : e.kind === 'intruder' ? 'alien' : e.kind, title: eventLabel(e).split(' — ')[0].toUpperCase(), sub: `${eventLabel(e).split(' — ')[1]} · T-${Math.ceil(e.t - mission.t)}`, stripe: '#e8c34f' });
    for (const e of mocks) add('mock' + e.id, { icon: 'unknown', title: '????', sub: 'T-???  (should have used the radar)', stripe: 'hazard', mock: true });
    if (mission.diagRun) for (const s of SYSTEMS) if (diagState(s)?.col === '#ffd84a') add('irr' + s.name, { icon: 'wrench', title: 'IRREGULAR', sub: s.name, stripe: '#ffd84a' });
  }
  return out;
}

// Positions update with the game clock (plates slide up into their slots, leavers slide out).
function updateSidebar(top, dt) {
  const list = encounterPlates(), keys = new Set(list.map(p => p.key));
  const headH = mission.active ? 66 : 0, y0 = top + 10 + (headH ? headH + PLATE_GAP : 0);
  const avail = VH - 120 - y0, step = Math.min(PLATE_H + PLATE_GAP, list.length > 1 ? (avail - PLATE_H) / (list.length - 1) : PLATE_H);
  list.forEach((d, i) => {
    let p = sidePlates.get(d.key);
    if (!p || p.leaving) { p = { y: VH + 30 + i * 20, x: 0, alpha: 1, age: 0 }; sidePlates.set(d.key, p); if (d.red) sfx.alarm?.(); }
    p.data = d; p.target = y0 + i * step; p.leaving = false;
  });
  for (const [k, p] of sidePlates) {
    if (!keys.has(k)) p.leaving = true;
    p.age += dt;
    if (p.leaving) { p.x -= dt * 600; p.alpha -= dt * 3; if (p.alpha <= 0) sidePlates.delete(k); }
    else p.y = lerp(p.y, p.target, 1 - Math.exp(-7 * dt));
  }
}
function drawSidebar(top) {
  if (mission.active) drawSidebarHeader(top + 10);
  // draw back to front so the upper plates sit on top when squeezed
  [...sidePlates.values()].sort((a, b) => b.y - a.y).forEach(p => drawPlate(p));
}

function plateBody(x, y, w, h) {
  rr(x, y, w, h, 7);
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#7d8697'); g.addColorStop(0.5, '#5a6272'); g.addColorStop(1, '#3f4757');
  ctx.fillStyle = g; ctx.fill(); stroke(2.5);
  rr(x + 3, y + 3, w - 6, h - 6, 5); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.12)';                // brushed metal streaks
  for (let i = 0; i < 4; i++) ctx.fillRect(x + 6, y + 8 + i * (h - 16) / 3, w - 12, 1);
  for (const [rx, ry] of [[7, 7], [w - 7, 7], [7, h - 7], [w - 7, h - 7]]) {   // rivets
    ctx.beginPath(); ctx.arc(x + rx, y + ry, 2.4, 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + rx - 0.6, y + ry - 0.6, 1, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill();
  }
}

function drawPlate(p) {
  const d = p.data, x = SIDEBAR_X + p.x, y = p.y, w = PLATE_W, h = PLATE_H, t = time;
  ctx.save(); ctx.globalAlpha = clamp(p.alpha, 0, 1);
  shadowEllipse(x + w / 2 + 3, y + h - 2, w * 0.48, 6, 0.35);
  plateBody(x, y, w, h);
  // colored edge stripe (hazard tape for the mocking ones)
  if (d.stripe === 'hazard') hazardStripe(x + 4, y + 4, 9, h - 8);
  else { rr(x + 4, y + 4, 9, h - 8, 3); ctx.fillStyle = d.stripe; ctx.fill(); stroke(1.2); }
  // recessed icon
  ctx.beginPath(); ctx.arc(x + 38, y + h / 2, 17, 0, TAU); ctx.fillStyle = '#1c2028'; ctx.fill(); stroke(2);
  plateIcon(d.icon, x + 38, y + h / 2, t);
  // text
  ctx.textBaseline = 'middle';
  ctx.font = '800 14px system-ui, sans-serif'; ctx.fillStyle = d.mock ? '#ff4a3a' : '#f2f4f8';
  ctx.fillText(d.title, x + 62, y + 19);
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = d.mock ? '#ffb0a0' : '#dfe4ec';
  let sub = d.sub; while (ctx.measureText(sub).width > w - 76 && sub.length > 4) sub = sub.slice(0, -2);
  if (sub !== d.sub) sub = sub.slice(0, -1) + '…';
  ctx.fillText(sub, x + 62, y + 37);
  // red light for problems that are actually happening
  if (d.red) {
    const k = 0.55 + 0.45 * Math.sin(t * 6);
    const g = ctx.createRadialGradient(x + w - 16, y + 15, 0, x + w - 16, y + 15, 12);
    g.addColorStop(0, `rgba(255,60,40,${0.7 * k})`); g.addColorStop(1, 'rgba(255,60,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + w - 16, y + 15, 12, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 16, y + 15, 4.5, 0, TAU); ctx.fillStyle = `rgb(255,${60 + 60 * k | 0},40)`; ctx.fill(); stroke(1.2);
  }
  if (p.age < 0.6) {                                // fresh plate: brief shine
    ctx.globalAlpha = (1 - p.age / 0.6) * 0.5 * clamp(p.alpha, 0, 1);
    rr(x, y, w, h, 7); ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  ctx.restore();
}

function drawSidebarHeader(y) {
  const x = SIDEBAR_X, w = PLATE_W, h = 66;
  plateBody(x, y, w, h);
  ctx.textBaseline = 'middle';
  ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = '#dfe4ec';
  ctx.fillText(`MISSION T+${fmt(mission.t)}`, x + 14, y + 15);
  const jumpIn = mission.jumpAt - mission.t;
  ctx.font = '800 18px system-ui, sans-serif'; ctx.fillStyle = mission.jump ? '#ffe08a' : '#f2f4f8';
  ctx.fillText(mission.jump ? 'JUMPING…' : isFinite(jumpIn) ? `JUMP IN ${fmt(jumpIn)}` : MISSIONS[mission.id]?.tutorial ? 'TRAINING' : 'PRACTICE', x + 14, y + 35);
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = '#c9ced8';
  ctx.fillText(mission.lastScan === null ? 'radar: not scanned (map table)' : `radar: scanned ${Math.floor(mission.t - mission.lastScan)} s ago`, x + 14, y + 54);
  // damage lights: one per broken system; more than MAX_DAMAGE loses the ship
  const dmg = SYSTEMS.filter(s => s.broken).length;
  ctx.font = '700 9px system-ui, sans-serif'; ctx.fillStyle = '#dfe4ec'; ctx.textAlign = 'center';
  ctx.fillText('DAMAGE', x + w - 46, y + 15);
  for (let i = 0; i < MAX_DAMAGE; i++) {
    const bx = x + w - 46 + (i - (MAX_DAMAGE - 1) / 2) * 17, by = y + 36, on = i < dmg;   // (centred under DAMAGE)
    ctx.beginPath(); ctx.arc(bx, by, 7, 0, TAU); ctx.fillStyle = on ? '#ff4a3a' : '#2b303a'; ctx.fill(); stroke(1.5);
    if (on) { ctx.beginPath(); ctx.arc(bx - 2, by - 2, 2.5, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill(); }
  }
  ctx.fillStyle = dmg >= MAX_DAMAGE ? '#ff8a7a' : '#c9ced8'; ctx.fillText(dmg >= MAX_DAMAGE ? 'one more = lost' : `${dmg}/${MAX_DAMAGE}`, x + w - 46, y + 54);
  ctx.textAlign = 'left';
}

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
  } else if (kind === 'jump') {
    ctx.strokeStyle = '#7af0ff'; ctx.lineWidth = 3;
    for (const dy of [4, -2, -8]) { ctx.beginPath(); ctx.moveTo(-7, dy + 5); ctx.lineTo(0, dy); ctx.lineTo(7, dy + 5); ctx.stroke(); }
  } else {                                           // unknown
    ctx.fillStyle = '#ff4a3a'; ctx.font = '900 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', 0, 1);
  }
  ctx.restore();
}
