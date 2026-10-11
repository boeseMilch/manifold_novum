// Mission script, radar, helm diagnosis, security console (door locks + manual override),
// fires, and the win/lose rules. Units: layout units, times in seconds.

const RADAR_RANGE = 45, MOCK_WINDOW = [3, 8], MAINT_WARNING = 20;
const JUMP_DELAY = 60, JUMP_WINDOW = 15, MAX_DAMAGE = 3;
const FIRE_TIME = 15, SPRAY_RANGE = 2.8, SPRAY_RATE = 0.8;

const mission = {
  active: true, t: 0, events: [], revealed: new Set(), scanT: -10, lastScan: null,
  maint: null, diagRun: false, jump: null, over: null, banner: 0,
};
const fires = [];
// Luck: petting the cat makes the dice friendlier for LUCK_TIME seconds.
const LUCK_TIME = 60;
const luck = { t: 0, pet: 0 };
const lucky = () => luck.t > 0;
function petCat() {
  luck.t = LUCK_TIME; luck.pet = 2.5; sfx.purr();          // what this does is a secret: no hints in the UI
  if (typeof hz !== 'undefined') hz.stats.pets++;
}
function updateLuck(dt) { luck.t = Math.max(0, luck.t - dt); luck.pet = Math.max(0, luck.pet - dt); }
let ui = { panel: null, hits: [], override: null };   // the acting crew member's panels (see withCrew)   // modal panels: 'security' | 'diagnosis' | 'override'

// ---------------------------------------------------------------------------
// Mission timeline: everything happens once, about one thing per minute (solo pacing).
// ---------------------------------------------------------------------------
const SIDE_NAME = { port: 'left', star: 'right' };
function eventLabel(ev) {
  if (ev.kind === 'interceptor') return `Interceptor — ${SIDE_NAME[ev.side]}`;
  if (ev.kind === 'frigate') return `Frigate — ${SIDE_NAME[ev.side]}`;
  if (ev.kind === 'swarm') return 'Asteroid swarm — front';
  if (ev.kind === 'intruder') return `Intruder — ${ev.side === 'port' ? 'left' : 'right'} airlock`;
  return ev.kind;
}
// Missions: each builds a timeline. The lobby picks one.
const randSide = () => (Math.random() < 0.5 ? 'port' : 'star');
const MISSIONS = {
  intro: {
    name: 'Intro run', blurb: 'One of everything, about a minute apart. The one you know.',
    build(target) {
      const s1 = randSide();
      return [
        { t: 40, kind: 'interceptor', side: s1 },
        { t: 100, kind: 'maintenance', sys: target, radar: false },
        { t: 160, kind: 'frigate', side: s1 === 'port' ? 'star' : 'port' },
        { t: 220, kind: 'swarm' },
        { t: 280, kind: 'intruder', side: randSide() },
      ];
    },
  },
  rush: {
    name: 'Rush hour', blurb: '7 incidents in random order, about 40 s apart. Same time, more trouble.',
    rules: { breach: true, surge: true },
    build(target) {
      const kinds = ['interceptor', 'frigate', 'swarm', 'intruder', 'maintenance'];
      const extras = ['interceptor', 'swarm', 'intruder'];
      for (let i = 0; i < 2; i++) kinds.push(extras[Math.floor(Math.random() * extras.length)]);
      for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
      if (kinds[0] === 'frigate') kinds.push(kinds.shift());          // don't open with the big one
      return kinds.map((kind, i) => ({ t: 30 + i * 40, kind, side: kind === 'swarm' || kind === 'maintenance' ? undefined : randSide(),
                                       sys: kind === 'maintenance' ? target : undefined, radar: kind !== 'maintenance' }));
    },
  },
};
function startMission(id = 'intro') {
  const candidates = SYSTEMS.filter(s => !s.broken);
  const pick = () => candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
  const target = pick(), decoy = pick();
  resetHazards();
  Object.assign(mission, {
    rules: { ...((MISSIONS[id] || MISSIONS.intro).rules || {}) },
    id, active: true, t: 0, revealed: new Set(), scanT: -10, lastScan: null, diagRun: false, jump: null, over: null,
    events: (MISSIONS[id] || MISSIONS.intro).build(target).map((e, i) => ({ ...e, id: i, done: false, radar: e.radar !== false })),
    maint: { target, decoy, serviced: false },
  });
  mission.jumpAt = Math.max(...mission.events.map(e => e.t)) + JUMP_DELAY;
  combatBanner('Jumped into the hot zone. Survive until the jump drive is ready!');
}

function runEvent(ev) {
  ev.done = true;
  if (ev.kind === 'interceptor' || ev.kind === 'frigate') combatSpawn(ev.kind, ev.side);
  else if (ev.kind === 'swarm') combatSpawn('swarm');
  else if (ev.kind === 'intruder') spawnInvader(ev.side);
  else if (ev.kind === 'maintenance' && !mission.maint.serviced && !ev.sys.broken) breakSystem(ev.sys);
}

function updateMission(dt) {
  if (!mission.active || mission.over) return;
  mission.t += dt;
  for (const ev of mission.events) if (!ev.done && mission.t >= ev.t) runEvent(ev);
  // jump: after the last encounter the drive tries for JUMP_WINDOW seconds; it needs energy in the engine room
  if (mission.t >= mission.jumpAt && !mission.jump) { mission.jump = { t: 0 }; combatBanner('Jump drive spooling up — it needs energy in the middle capacitor!'); }
  if (mission.jump) {
    mission.jump.t += dt;
    if (!broken(CAPACITORS[1]) && CAPACITORS[1].charge > 0) { CAPACITORS[1].charge--; endMission(true, 'Jumped out safely.'); return; }
    if (mission.jump.t >= JUMP_WINDOW) { endMission(false, 'The jump drive never got energy — stranded in the hot zone.'); return; }
  }
  const dmg = SYSTEMS.filter(s => s.broken).length;
  if (dmg > MAX_DAMAGE) endMission(false, `The ship fell apart (${dmg} systems broken at once).`);
}
function endMission(won, reason) {
  mission.over = { won, reason, t: mission.t };
  for (const e of combat.enemies) e.stopCharge?.();
  if (won) sfx.win(); else sfx.explosion();
}

// Radar: reveals everything coming in the next RADAR_RANGE seconds, for the whole crew.
function radarScan() {
  mission.scanT = mission.t; mission.lastScan = mission.t;
  let n = 0;
  for (const ev of mission.events) if (ev.radar && !ev.done && ev.t - mission.t <= RADAR_RANGE && !mission.revealed.has(ev.id)) { mission.revealed.add(ev.id); n++; }
  sfx.poi();
  combatBanner(n ? `Radar: ${n} contact${n > 1 ? 's' : ''} in the next ${RADAR_RANGE} s` : `Radar: nothing in the next ${RADAR_RANGE} s`);
}

// Helm diagnosis: two systems look shaky from the start; one really fails.
function diagState(s) {
  if (s.broken) return { col: '#ff5a4a', text: 'BROKEN' };
  const m = mission.maint;
  if (!mission.active || !m || m.serviced) return null;
  const ev = mission.events.find(e => e.kind === 'maintenance');
  if (s === m.target && !ev.done && ev.t - mission.t <= MAINT_WARNING) return { col: '#ff9a2e', text: `FAILING — breaks in ${Math.ceil(ev.t - mission.t)} s`, orange: true };
  if ((s === m.target && !ev.done) || s === m.decoy) return { col: '#ffd84a', text: 'irregular readings' };
  return null;
}
// The repair kit can service the failing system while it's orange; then it doesn't break.
function serviceTarget() {
  const m = mission.maint;
  return m && !m.serviced && diagState(m.target)?.orange ? m.target : null;
}

// ---------------------------------------------------------------------------
// Fires: every fire sits on a ship part. Small hits: half the time nothing, half the time a
// fire, or (if that side is already burning) damage to a part instead. Left alone
// for FIRE_TIME a fire either burns out its part or spreads to another part in the same or an
// adjacent room.
// ---------------------------------------------------------------------------
const colOfSide = (side) => side === 'port' ? 0 : side === 'star' ? 2 : 1;
// Rooms a part belongs to (parts between the decks belong to the rooms above and below).
function sysRooms(s) {
  const r = roomAt(s.x, s.y);
  if (r) return [r];
  return [roomAt(s.x, SPINE_Y0 - 1), roomAt(s.x, SPINE_Y1 + 1)].filter(Boolean);
}
function adjacentRooms(room) {
  return ROOMS.filter(r => r !== room && (r.col === room.col || (r.deck === room.deck && Math.abs(r.col - room.col) === 1)));
}
const burning = (s) => fires.some(f => f.sys === s && f.hp > 0);
function igniteSystem(s, plasma = false) {
  if (!s || burning(s)) return false;
  if (sysRooms(s).some(r => vacuumRoom(r.id))) return false;            // no air, no fire
  plasma = plasma || (!!mission.rules?.plasma && plasmaPart(s));
  fires.push({ uid: newUid(), sys: s, x: s.x + 0.35, y: s.y + 0.45, hp: 1, t: 0, seed: Math.random() * 100, plasma });
  hz.stats.fires++;
  if (plasma) { combatBanner(`PLASMA FIRE at the ${s.name.toLowerCase()}! Extinguishers won't do — vent the room.`); sfx.say?.('Plasma fire. Vent the room.'); }
  else combatBanner(`Fire at the ${s.name.toLowerCase()}! Grab a fire extinguisher.`);
  return true;
}
function smallHit(side, x, y) {
  const col = colOfSide(side);
  const inCol = SYSTEMS.filter(s => s.col === col);
  if (Math.random() < (lucky() ? 0.75 : 0.5)) return;   // half the time nothing (with luck: three quarters)
  if (fires.some(f => f.sys.col === col)) {        // that side is already burning: damage instead of a new fire
    const intact = inCol.filter(s => !s.broken);
    if (intact.length) breakSystem(intact[Math.floor(Math.random() * intact.length)]);
  } else {                                          // a fire on a part on that side, near the hit
    const pool = inCol.filter(s => !s.broken && !burning(s)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, 3);
    igniteSystem(pool[Math.floor(Math.random() * pool.length)]);
  }
}
// Debug: start a fire on the part nearest to (x, y).
function spawnFire(x, y) {
  const s = SYSTEMS.filter(s => !burning(s)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
  igniteSystem(s);
}
function updateFires(dt) {
  for (const f of [...fires]) {
    f.t += dt;
    if (f.t < (f.plasma ? PLASMA_TIME : FIRE_TIME)) continue;
    f.t = 0;
    if (!f.plasma && Math.random() < (lucky() ? 0.5 : 0.2)) continue;            // sometimes it just keeps burning
    if (!f.sys.broken && Math.random() < 0.5) { breakSystem(f.sys); continue; }   // burns out its part
    const rooms = sysRooms(f.sys), near = new Set([...rooms, ...rooms.flatMap(adjacentRooms)]);
    const pool = SYSTEMS.filter(s => s !== f.sys && !burning(s) && sysRooms(s).some(r => near.has(r)));
    const intact = pool.filter(s => !s.broken);
    const to = (intact.length ? intact : pool)[Math.floor(Math.random() * (intact.length || pool.length))];
    if (to) igniteSystem(to, f.plasma); else if (!f.sys.broken) breakSystem(f.sys);
  }
  for (let i = fires.length - 1; i >= 0; i--) if (fires[i].hp <= 0) { scorch(fires[i].x, fires[i].y); hz.stats.firesOut++; fires.splice(i, 1); }
}
// Spraying the extinguisher (right mouse held): a cone of foam towards the mouse.
function spray(mx, my, dt) {
  const a = Math.atan2(my - player.y, mx - player.x);
  player.face = a;
  for (let i = 0; i < 3; i++) {
    const q = a + (Math.random() - 0.5) * 0.7, sp = 5 + Math.random() * 3;
    combatFx(player.x + Math.cos(a) * 0.4, player.y + Math.sin(a) * 0.4, Math.cos(q) * sp, Math.sin(q) * sp, 0.45, Math.random() < 0.5 ? '#ffffff' : '#dfe8f0', 0.09 + Math.random() * 0.06);
  }
  for (const f of fires) {
    const d = Math.hypot(f.x - player.x, f.y - player.y), off = Math.abs(wrapAngle(Math.atan2(f.y - player.y, f.x - player.x) - a));
    if (d >= SPRAY_RANGE || off >= 0.45) continue;
    if (f.plasma) { f.hp = Math.max(0.6, f.hp - SPRAY_RATE * dt); f.t = Math.max(0, f.t - dt * 2); continue; }   // only pushes it back
    f.hp -= SPRAY_RATE * dt; if (f.hp <= 0) combatBanner('Fire out');
  }
  if (Math.random() < dt * 6) sfx.spray();
}

// ---------------------------------------------------------------------------
// Door locks (security console) and manual override
// ---------------------------------------------------------------------------
const lockables = () => [
  ...DOORWAYS.map((d, i) => ({ ref: d, kind: 'door', name: `Door ${['left–bridge', 'bridge–right', 'left–reactor', 'reactor–right'][i]}`, x: d.x + d.w / 2, y: d.y + d.h / 2 })),
  ...DECK_LOCKS.map(Lk => ({ ref: Lk, kind: 'lock', name: `${['Left', 'Middle', 'Right'][Lk.col]} deck airlock`, x: Lk.x + Lk.w / 2, y: (SPINE_Y0 + SPINE_Y1) / 2 })),
  ...HATCHES.map(h => ({ ref: h, kind: 'hatch', name: `${h.side === 'port' ? 'Left' : 'Right'} outer airlock`, x: h.x, y: h.y })),
];
// onDone: what the third bonk does (default: unlock). Broken doors use it to force themselves open.
function startOverride(ref, name, onDone) { ui.panel = 'override'; ui.override = { ref, name, hits: 0, swing: 0, onDone }; }
// Broken deck airlock: force open the closed door nearest to you (it stays stuck open).
function forceDeckLock(Lk) {
  const mid = (SPINE_Y0 + SPINE_Y1) / 2, inside = player.y > SPINE_Y0 && player.y < SPINE_Y1;
  let side = player.y < mid ? 'top' : 'bottom';
  if (inside && Lk.doors[side] > 0.95) side = side === 'top' ? 'bottom' : 'top';   // that one's already open: the other
  Lk.doors[side] = 1; Lk.open = side; Lk.phase = 'idle'; Lk.locked = false;
}
const OVERRIDE_SWING = 0.55, OVERRIDE_IMPACT = 0.62;
let ovFx = null;                                     // this browser's sparks / dents for the override panel   // swing length; the slam lands at 62% of it
function overrideHit() {
  const o = ui.override;
  if (o.swing > 0 || o.hits >= 3) return;
  o.hits++; o.swing = OVERRIDE_SWING;
  if (o.hits >= 3) o.doneT = 1.0;                  // let the last hit play out, then the door gives
}
// Per crew member, every tick: swing timer and the door giving way after the third hit.
function updateOverride(dt) {
  const o = ui.override;
  if (!o) return;
  o.swing = Math.max(0, o.swing - dt);
  if (o.doneT !== undefined && (o.doneT -= dt) <= 0) {
    if (o.onDone) o.onDone(); else o.ref.locked = false;
    combatBanner(`${o.name}: forced open`); ui.panel = null; ui.override = null;
  }
}

// ---------------------------------------------------------------------------
// Clickable mission stations: radar (map table), helm (diagnosis), security console
// ---------------------------------------------------------------------------
const SECURITY = STATIONS.find(s => s.name === 'Security');
const HELM = STATIONS.find(s => s.name === 'Helm');
// Consoles and the like you click (also marked with brackets, see interior.js).
function stationSpots() {
  return [
    { x: CAT.x, y: CAT.y, r: 0.55, name: 'The cat', text: 'Click: pet the cat', run: petCat },
    { x: 22.2, y: 6.4, r: 1.2, name: 'Radar', text: 'Click: radar scan (shows the next 45 s for everyone)', run: radarScan },
    { x: HELM.x, y: HELM.y + 0.5, r: 0.9, name: 'Helm', text: 'Click: run systems diagnosis', run: () => { ui.panel = 'diagnosis'; mission.diagRun = true; } },
    { x: SECURITY.x, y: SECURITY.y + 0.5, r: 0.9, name: 'Security console', text: 'Click: open the security console (lock doors)', run: () => { ui.panel = 'security'; } },
  ];
}
function missionClickTarget(mx, my) {
  const svc = serviceTarget();
  if (svc && Math.hypot(mx - svc.x, my - svc.y) <= svc.r) {
    if (inv.weapon !== 'repair') return { text: `${svc.name} is failing — service it with the repair kit`, ok: false, x: svc.x, y: svc.y, r: svc.r };
    if (!near(svc.x, svc.y, REACH + svc.r * 0.6)) return { text: `${svc.name} — get closer`, ok: false, x: svc.x, y: svc.y, r: svc.r };
    return { text: `Hold click: service the ${svc.name.toLowerCase()} before it breaks`, ok: true, repair: svc, service: true, x: svc.x, y: svc.y, r: svc.r };
  }
  for (const s of stationSpots()) {
    if (Math.hypot(mx - s.x, my - s.y) > s.r) continue;
    if (!near(s.x, s.y, REACH + 0.6)) return { text: `${s.name} — get closer`, ok: false, x: s.x, y: s.y, r: s.r };
    return { text: s.text, ok: true, x: s.x, y: s.y, r: s.r, run: s.run };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function drawFires(t) {
  for (const f of fires) {
    const x = L(f.x), y = L(f.y), s = (0.55 + 0.45 * f.hp) * 1.6;
    const g = ctx.createRadialGradient(x, y, 0, x, y, L(1.6) * s);
    g.addColorStop(0, `rgba(255,150,50,${0.35 + 0.05 * Math.sin(t * 7 + f.seed)})`); g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, L(1.6) * s, 0, TAU); ctx.fill();
    // a cluster of teardrop flames, each in three layers (red → orange → yellow-white core)
    const tongues = [[-0.3, 0.75, 0], [0.25, 0.9, 1.7], [0, 1.15, 3.1], [-0.12, 0.6, 4.4], [0.38, 0.55, 5.6]];
    for (const [layer, col, k] of f.plasma ? [[1, '#7a3ad8', 1.15], [0.72, '#c08aff', 0.85], [0.42, '#ffffff', 0.6]] : [[1, '#d8401c', 1], [0.72, '#ff9a2e', 0.78], [0.42, '#fff0a8', 0.55]]) {
      for (const [ox, hgt, ph] of tongues) {
        const flick = 0.85 + 0.15 * Math.sin(t * 11 + ph + f.seed) + 0.08 * Math.sin(t * 23 + ph * 2);
        const h = L(hgt) * s * k * flick, w = L(0.22) * s * layer, bx = x + L(ox) * s * 0.9, by = y + L(0.15) * s;
        const tipX = bx + Math.sin(t * 5 + ph) * w * 0.8;
        ctx.beginPath(); ctx.moveTo(bx - w, by);
        ctx.bezierCurveTo(bx - w * 1.1, by - h * 0.45, tipX - w * 0.3, by - h * 0.8, tipX, by - h);
        ctx.bezierCurveTo(tipX + w * 0.3, by - h * 0.8, bx + w * 1.1, by - h * 0.45, bx + w, by);
        ctx.quadraticCurveTo(bx, by + w * 0.6, bx - w, by);
        ctx.fillStyle = col; ctx.fill();
        if (layer === 1) { ctx.strokeStyle = 'rgba(60,15,5,0.5)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      }
    }
    for (let i = 0; i < 4; i++) {                    // embers
      const q = (t * 0.9 + i / 4 + f.seed) % 1;
      ctx.fillStyle = `rgba(255,200,90,${1 - q})`;
      ctx.fillRect(x + Math.sin(i * 3 + f.seed + t) * L(0.4) * s, y - q * L(1.4) * s, 2.5, 2.5);
    }
    for (let i = 0; i < 3; i++) {                    // smoke
      const q = (t * 0.5 + i / 3 + f.seed) % 1;
      ctx.beginPath(); ctx.arc(x + Math.sin(t + i) * 6, y - L(0.6) - q * L(1.4), L(0.18 + q * 0.35) * s, 0, TAU);
      ctx.fillStyle = `rgba(60,60,64,${0.4 * (1 - q)})`; ctx.fill();
    }
    // time until it spreads / breaks something
    ctx.beginPath(); ctx.arc(x, y + L(0.45), 7, -Math.PI / 2, -Math.PI / 2 + (f.t / (f.plasma ? PLASMA_TIME : FIRE_TIME)) * TAU);
    ctx.strokeStyle = 'rgba(255,90,60,0.9)'; ctx.lineWidth = 3; ctx.stroke();
  }
}

// Vertical sliding door in a doorway (between rooms); red bar when locked.
function drawDoorways() {
  for (const d of DOORWAYS) {
    const x = L(d.x), y = L(d.y), w = L(d.w), h = L(d.h), ph = (h / 2) * (1 - d.open);
    if (ph > 0.5) for (const s of [0, 1]) {
      const py = s ? y + h - ph : y;
      if (d.blast) { hazardStripe(x, py, w, ph); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.strokeRect(x, py, w, ph); continue; }   // heavy blast shutter
      ctx.fillStyle = '#7a8396'; ctx.fillRect(x + 2, py, w - 4, ph);
      ctx.fillStyle = d.locked ? '#e2574c' : C.hazard; ctx.fillRect(x + 2, s ? py : py + ph - 5, w - 4, 5);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(x + 2, py, w - 4, ph);
    }
    if (d.locked) { ctx.beginPath(); ctx.arc(x + w / 2, y - 8, 4, 0, TAU); ctx.fillStyle = '#e2574c'; ctx.fill(); stroke(1.2); }
  }
}

// What the radar list shows: revealed contacts, plus a mocking "????" for anything
// unrevealed that's about to arrive.
function radarList() {
  const known = mission.events.filter(e => mission.revealed.has(e.id) && (!e.done || mission.t - e.t < 3));
  const mocks = mission.events.filter(e => {
    const dt = e.t - mission.t;
    return e.radar && !e.done && !mission.revealed.has(e.id) && dt <= MOCK_WINDOW[1] && dt >= MOCK_WINDOW[0];
  });
  return { known, mocks };
}

function fmt(t) { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

// Modal panels (security map, diagnosis, manual override) and the end screen.
function drawPanels(t) {
  ui.hits = [];
  if (ui.panel === 'security') drawSecurityPanel();
  else if (ui.panel === 'diagnosis') drawDiagnosisPanel();
  else if (ui.panel === 'override') drawOverridePanel(t);
  if (mission.over) drawEndScreen();
}
function panelFrame(w, h, title) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, 0, VW, VH);
  const x = VW / 2 - w / 2, y = VH / 2 - h / 2;
  rr(x, y, w, h, 12); ctx.fillStyle = 'rgba(14,17,24,0.96)'; ctx.fill(); stroke(2, '#5fd6a0');
  ctx.fillStyle = '#e8ecf4'; ctx.font = '700 16px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillText(title, x + 18, y + 24);
  ctx.fillStyle = '#9aa3b5'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.fillText('E / Esc to close', x + w - 18, y + 24); ctx.textAlign = 'left';
  return [x, y];
}
function drawSecurityPanel() {
  const w = Math.min(860, VW - 40), h = Math.min(560, VH - 40), [x, y] = panelFrame(w, h, 'SECURITY — click a door or airlock to lock / unlock it');
  const s = Math.min((w - 60) / (SHIP_W + 4), (h - 90) / (SHIP_H + 6)), ox = x + w / 2 - (SHIP_W / 2) * s, oy = y + 60 + 3.5 * s;
  const P = (px, py) => [ox + px * s, oy + py * s];
  poly(HULL.map(([a, b]) => P(a, b))); ctx.fillStyle = '#262b35'; ctx.fill(); stroke(1.5, '#4b5263');
  for (const r of ROOMS) for (const q of r.rects) {
    const [a, b] = P(q.x, q.y); ctx.fillStyle = 'rgba(95,214,160,0.12)'; ctx.fillRect(a, b, q.w * s, q.h * s);
    ctx.strokeStyle = 'rgba(95,214,160,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(a, b, q.w * s, q.h * s);
  }
  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const r of ROOMS) { const [cx, cy] = P(...roomCenter(r)); ctx.fillStyle = 'rgba(200,220,210,0.45)'; ctx.fillText(r.name.toUpperCase(), cx, cy - 18); }
  for (const a of boarding.invaders) { const [ax, ay] = P(a.x, a.y); ctx.beginPath(); ctx.arc(ax, ay, 5, 0, TAU); ctx.fillStyle = '#9cff5a'; ctx.fill(); }   // intruders show up on the security map
  for (const c of crew) { const [px, py] = P(c.x, c.y); ctx.beginPath(); ctx.arc(px, py, c === player ? 5 : 4, 0, TAU); ctx.fillStyle = c.color; ctx.fill(); stroke(c === player ? 2 : 1); }
  for (const [li, l] of lockables().entries()) {
    const [cx, cy] = P(l.x, l.y), hover = Math.hypot(mouse.x - cx, mouse.y - cy) < 15;
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, TAU); ctx.fillStyle = l.ref.locked ? '#7a2420' : '#1d4a36'; ctx.fill(); stroke(hover ? 3 : 1.5, l.ref.locked ? '#ff6a5a' : '#5fd6a0');
    ctx.fillStyle = '#ffffff'; ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(l.ref.locked ? '🔒' : { door: 'D', lock: 'A', hatch: 'H' }[l.kind], cx, cy + 1);
    ui.hits.push({ x: cx, y: cy, r: 15, cmd: ['lock', li] });
    if (hover) { ctx.fillStyle = '#e8ecf4'; ctx.fillText(`${l.name}: ${l.ref.locked ? 'locked' : 'open'}`, cx, cy + 24); }
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9aa3b5'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('D door · A deck airlock · H outer airlock — locked doors can still be forced with a manual override. Green dot: intruder.', x + 18, y + h - 18);
}
function drawDiagnosisPanel() {
  const w = 520, rows = SYSTEMS.length, h = Math.min(VH - 40, 80 + rows * 19), [x, y] = panelFrame(w, h, 'HELM — systems diagnosis');
  ctx.font = '12px system-ui, sans-serif'; ctx.textBaseline = 'top';
  SYSTEMS.forEach((s, i) => {
    const st = diagState(s), yy = y + 50 + i * 19;
    if (yy > y + h - 24) return;
    ctx.fillStyle = st ? st.col : '#5fd6a0'; ctx.beginPath(); ctx.arc(x + 26, yy + 7, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8ecf4'; ctx.fillText(s.name, x + 40, yy);
    ctx.fillStyle = st ? st.col : '#6b7486'; ctx.textAlign = 'right'; ctx.fillText(st ? st.text : 'ok', x + w - 20, yy); ctx.textAlign = 'left';
  });
}
function drawOverridePanel(t) {
  const o = ui.override;
  if (!ovFx || ovFx.name !== o.name || o.hits < ovFx.seen) ovFx = { name: o.name, sparks: [], dents: [], shake: 0, seen: 0 };
  const fx = ovFx;                                   // purely visual, lives in this browser only
  fx.shake = Math.max(0, fx.shake - 1 / 60);
  const sx = (Math.random() - 0.5) * 14 * fx.shake / 0.3, sy = (Math.random() - 0.5) * 14 * fx.shake / 0.3;
  ctx.save(); ctx.translate(sx, sy);
  const w = 440, h = 340, [x, y] = panelFrame(w, h, `${o.name} — ${o.hits >= 3 ? 'it gives!' : 'locked'}`);
  const cx = x + w / 2 - 20, cy = y + 150;
  // swing: wind up, then slam into the handle, then recoil
  const prog = o.swing > 0 ? 1 - o.swing / OVERRIDE_SWING : 0;
  let reach;                                         // 0 = resting / wound up, 1 = on the handle
  if (prog <= 0) reach = 0;
  else if (prog < 0.45) reach = -0.35 * Math.sin(prog / 0.45 * Math.PI / 2);          // pull back
  else if (prog < OVERRIDE_IMPACT) reach = -0.35 + 1.35 * ((prog - 0.45) / (OVERRIDE_IMPACT - 0.45)) ** 2;   // SLAM
  else reach = 1 - 0.6 * (prog - OVERRIDE_IMPACT) / (1 - OVERRIDE_IMPACT);          // bounce back
  if (prog >= OVERRIDE_IMPACT && fx.seen < o.hits) {  // impact: sparks, a dent, a shake, a noise
    fx.seen = o.hits; fx.shake = 0.3;
    sfx.clank(); sfx.hit(o.hits >= 3); sfx.spark();
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI * 0.2 + (Math.random() - 0.5) * 2.6, sp = 3 + Math.random() * 7;
      fx.sparks.push({ x: cx + 30, y: cy - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2, life: 0.4 + Math.random() * 0.4 });
    }
    fx.dents.push({ x: (Math.random() - 0.5) * 70, y: (Math.random() - 0.5) * 70, r: 7 + Math.random() * 6 });
    fx.word = ['CLANG!', 'KRRNK!', 'BONK!!'][Math.min(o.hits, 3) - 1]; fx.wordT = 0.6;
  }
  // door plate with dents and cracks
  rr(cx - 80, cy - 80, 160, 160, 10);
  const pg = ctx.createLinearGradient(cx - 80, cy - 80, cx + 80, cy + 80);
  pg.addColorStop(0, '#7a8396'); pg.addColorStop(1, '#4a515e');
  ctx.fillStyle = pg; ctx.fill(); stroke(3);
  for (const [rx, ry] of [[-68, -68], [68, -68], [-68, 68], [68, 68]]) { ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 3.5, 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill(); }
  for (const d of fx.dents) {
    const g = ctx.createRadialGradient(cx + d.x - 2, cy + d.y - 2, 0, cx + d.x, cy + d.y, d.r);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.7, 'rgba(0,0,0,0.15)'); g.addColorStop(1, 'rgba(255,255,255,0.12)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx + d.x, cy + d.y, d.r, 0, TAU); ctx.fill();
  }
  if (o.hits >= 2) {                                 // cracks spreading from the handle
    ctx.strokeStyle = 'rgba(20,22,27,0.8)'; ctx.lineWidth = 2;
    for (const [ax, ay] of [[1, -0.6], [-0.7, 0.9], [0.9, 0.8]].slice(0, fx.seen)) {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + ax * 25, cy + ay * 18); ctx.lineTo(cx + ax * 45, cy + ay * 40); ctx.lineTo(cx + ax * 62, cy + ay * 52); ctx.stroke();
    }
  }
  // the handle: bends more with every hit, snaps off on the last one
  const broke = o.hits >= 3 && fx.seen >= 3;
  ctx.save(); ctx.translate(cx, cy);
  rr(-14, -14, 28, 28, 6); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(2);         // rose
  ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fillStyle = '#2b303a'; ctx.fill();
  if (!broke) {
    const bend = Math.min(fx.seen, 2) * 0.45 + fx.shake;
    ctx.rotate(bend);
    rr(-4, -9, 66, 18, 9); ctx.fillStyle = '#e8ebf0'; ctx.fill(); stroke(2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(4, -6, 50, 3);
  }
  ctx.restore();
  if (broke) {                                       // flying handle
    fx.flyT = (fx.flyT || 0) + 1 / 60;
    ctx.save(); ctx.translate(cx + 40 + fx.flyT * 260, cy - 20 - fx.flyT * 180 + fx.flyT * fx.flyT * 400); ctx.rotate(fx.flyT * 14);
    rr(-30, -9, 60, 18, 9); ctx.fillStyle = '#e8ebf0'; ctx.fill(); stroke(2); ctx.restore();
  }
  // the fire extinguisher, swung by its handle
  ctx.save();
  ctx.translate(cx + 150 - reach * 105, cy - 60 + reach * 50); ctx.rotate(-1.0 + reach * 1.25); ctx.scale(2.6, 2.6);
  extinguisher(0, 0, 0); ctx.restore();
  // sparks
  for (const p of fx.sparks) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.35; p.life -= 1 / 60;
    if (p.life <= 0) continue;
    ctx.strokeStyle = `rgba(255,${180 + Math.random() * 60 | 0},80,${Math.min(1, p.life * 2)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5); ctx.stroke();
  }
  fx.sparks = fx.sparks.filter(p => p.life > 0);
  if (fx.wordT > 0) {                                // comic onomatopoeia
    fx.wordT -= 1 / 60;
    ctx.save(); ctx.translate(cx + 60, cy - 95); ctx.rotate(-0.2); ctx.scale(1 + (0.6 - fx.wordT) * 0.6, 1 + (0.6 - fx.wordT) * 0.6);
    ctx.font = '900 30px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = OUT; ctx.strokeText(fx.word, 0, 0); ctx.fillStyle = '#ffe08a'; ctx.fillText(fx.word, 0, 0);
    ctx.restore();
  }
  ctx.restore();
  // button (outside the shake so it stays clickable)
  const bx = x + w / 2 - 120, by = y + h - 64, bw = 240, bh = 44, hover = mouse.x > bx && mouse.x < bx + bw && mouse.y > by && mouse.y < by + bh;
  rr(bx, by, bw, bh, 8); ctx.fillStyle = o.swing > 0 ? '#5a2a22' : hover ? '#b8402e' : '#8e2f22'; ctx.fill(); stroke(2, '#ff8a7a');
  ctx.fillStyle = '#fff'; ctx.font = '800 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(o.hits >= 3 ? 'OPEN!' : `MANUAL OVERRIDE (${o.hits}/3)`, bx + bw / 2, by + bh / 2); ctx.textAlign = 'left';
  ui.hits.push({ x: bx + bw / 2, y: by + bh / 2, w: bw, h: bh, cmd: ['bonk'] });
}
function drawEndScreen() {
  const o = mission.over;
  ctx.fillStyle = o.won ? 'rgba(10,30,20,0.75)' : 'rgba(40,8,8,0.78)'; ctx.fillRect(0, 0, VW, VH);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = o.won ? '#7af0b0' : '#ff7a6a'; ctx.font = '800 48px system-ui, sans-serif';
  ctx.fillText(o.won ? 'JUMP SUCCESSFUL' : 'MISSION FAILED', VW / 2, VH / 2 - 40);
  ctx.fillStyle = '#e8ecf4'; ctx.font = '18px system-ui, sans-serif'; ctx.fillText(o.reason, VW / 2, VH / 2 + 10);
  ctx.fillStyle = '#9aa3b5'; ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(`Time ${fmt(o.t)} · hits taken: ${combat.hits.small} small, ${combat.hits.large} large, ${combat.hits.crew} crew · press R to play again`, VW / 2, VH / 2 + 46);
  // the mission report
  const S = hz.stats, medics = Object.entries(S.treated).sort((a, b) => b[1] - a[1]);
  const lines = [
    `Fires: ${S.fires} started, ${S.firesOut} put out · hull breaches: ${S.breaches} · repairs: ${S.repairs}`,
    medics.length ? `Medic of the day: ${medics[0][0]} (treated ${medics[0][1]}×)` : 'Nobody had to be treated. Suspicious.',
    `The cat was petted ${S.pets} time${S.pets === 1 ? '' : 's'}.`,
  ];
  ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#c9ced8';
  lines.forEach((l, i) => ctx.fillText(l, VW / 2, VH / 2 + 80 + i * 20));
  ctx.textAlign = 'left';
}
// Click handling for panels (screen coords). Returns true if the click was used.
function panelClick(mx, my) {
  for (const h of ui.hits) {
    const inside = h.w ? Math.abs(mx - h.x) < h.w / 2 && Math.abs(my - h.y) < h.h / 2 : Math.hypot(mx - h.x, my - h.y) < h.r;
    if (inside) { sendCommand(h.cmd); return true; }
  }
  return false;
}
