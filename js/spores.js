// Spores inside the ship (2026-10-22, the user: "spores move inside the ship"; the hull barnacles are gone).
//   Getting in   A spore cloud (event 'spores', js/eva.js spawnSpores) drifts to the outer airlock on its side and seeps
//                in through its seals (SPORE_SEEP s at the hatch): that airlock room is infested. Shoot the clouds on
//                the way in and nothing gets in. The spore mother's silent scream (js/organic.js) leaves a green cloud
//                round the hull (evs.cloud) for as long as it keeps screaming: each gust of it gets spores into the
//                airlock on its side with MOTHER_SEEP_CHANCE, and opening ANY outer airlock to space while the cloud
//                is there gets them into that airlock's room for sure.
//   Spreading    a door between an infested room and a clean one standing open (anyone walking through) for
//                SPORE_SPREAD s lets them drift over. Never into the reactor room: its heat burns them (they
//                shrivel at its doors). Nothing crosses into or out of a room in vacuum.
//   Effects      now and then a part in an infested room glitches (SPORE_GLITCH_TIME s unresponsive: a shield button
//                doesn't press, a cannon doesn't fire, a capacitor gives no energy, a deck door or an outer airlock
//                sticks); after SPORE_BREAK_FIRST s one breaks for good, then another every SPORE_BREAK_EVERY s.
//   Cure         vacuum: SPORE_CLEAR s of it and the room is clean. The vent panel by each outer airlock vents its room
//                any time (js/hazards.js); a room further in vents when the door to a vented room is forced
//                (js/game.js forceDoor: the forced door is held open as long as the vent runs). Not while spores are
//                outside the ship (the mother's cloud, a cloud drifting in: "airing out only works if there is not a
//                spore cloud outside"): the vent still vents (fires, boarders, whoever's in there), but the spores live
//                on, and the open airlock lets the mother's cloud in (the panel doesn't know: no warning on it).
// Which rooms can be cleared how (tests/spores.js checks every one):
//   portLock / starLock   their own vent panel;
//   portGun / starGun     vent the airlock room below, force the deck door up (it stays open while the vent runs);
//   bridge                as the cannon room, then force the cannon room's door to the bridge (from inside the vented
//                         cannon room). The reactor room is never infested, and never vented (the cat).
// State: hz.spores (rooms, glitching parts, doors spores are drifting through), evs.cloud: plain data, synced with hz /
// evs (js/net.js), drawn in every browser.

const SPORE_SEEP = 2.5;                  // s a drifting cloud works at the airlock's seals before it's in
const SPORE_SPREAD = 1.5;                // s a door between an infested and a clean room must stand open
const SPORE_CLEAR = 2;                   // s of vacuum that kill a room's spores
const SPORE_GLITCH_EVERY = 12;           // s between glitches in an infested room (×0.7–1.3; the first one sooner)
const SPORE_GLITCH_TIME = 4;             // s a glitching part doesn't respond
const SPORE_BREAK_FIRST = 60;            // s of infestation before a part breaks for good ...
const SPORE_BREAK_EVERY = 30;            // ... and then one more every this many s
const SPORE_FILL = 4;                    // s the haze takes to fill a room (drawing only)
const MOTHER_SEEP_CHANCE = 0.15;         // per gust of the mother's scream (MOTHER_GUSTS per scream: ~28 % per scream)
const CLOUD_HOLD = 14;                   // s the mother's cloud hangs on after a scream (PUFF_EVERY 12: it lasts the whole fight)
const CLOUD_GROW = 2, CLOUD_FADE = 4;    // s to billow up, s to thin out once the mother stops screaming
const SPORE_FREE = new Set(['reactor']); // never infested: the reactor's heat
const SPORE_COL = '#b8d070';

const sporeState = () => (hz.spores ||= { rooms: {}, glitch: [], doors: {}, shrivel: {} });
const sporeRoom = (id) => sporeState().rooms[id] || null;
const infested = (id) => !!sporeRoom(id);
const cloudOutside = () => !!evs.cloud;                                 // the mother's cloud round the hull
const sporesOutside = () => !!evs.cloud || evs.spores.length > 0;       // any spores out there (a cloud drifting in too)
const sporeLockRoom = (side) => side === 'port' ? 'portLock' : side === 'star' ? 'starLock' : (Math.random() < 0.5 ? 'portLock' : 'starLock');
// The parts in a room that spores get into (outside ones never: vacuum): an outer airlock belongs to its airlock room,
// a deck door to both rooms it joins.
const sporeParts = (roomId) => SYSTEMS.filter(s => !s.outside && (s.kind === 'hatch' ? airlockRoomId(s.ref) === roomId : sysRooms(s).some(r => r.id === roomId)));
const sporeGlitchOf = (ref) => { const i = SYSTEMS.findIndex(s => s.ref === ref); return i < 0 ? null : sporeState().glitch.find(g => g.sys === i) || null; };
const sporeGlitching = (ref) => !!sporeGlitchOf(ref);
const sporeGlitchText = (ref, what = 'not responding') => { const g = sporeGlitchOf(ref); return g ? `spores in it — ${what} (${Math.ceil(g.t)} s)` : ''; };
// How to clear that room (sidebar, banners).
function sporeHow(id) {
  if (id === 'portLock' || id === 'starLock') return 'vent it: airlock panel, PIN on sticky note';
  if (id === 'portGun' || id === 'starGun') return 'vent the airlock below, force the deck door';
  return 'vent an airlock, force the doors up here';
}

// A room gets the spores. how: 'seep' (a cloud at the airlock's seals), 'gust' (the mother's cloud), 'airlock' (an outer
// airlock opened in the cloud), 'door' (drifted over through an open door). from: where they come in (drawing).
function infestRoom(id, how = 'door', from = null) {
  if (!id || SPORE_FREE.has(id) || infested(id) || !roomById(id)) return false;
  const name = roomById(id).name.toLowerCase();
  sporeState().rooms[id] = { t: 0, glitchT: SPORE_GLITCH_EVERY * (0.4 + Math.random() * 0.3), breakT: SPORE_BREAK_FIRST, vac: 0, from };
  combatBanner(how === 'door' ? `Spores drifted through the door into the ${name}!`
    : how === 'airlock' ? `The airlock opened into the spore cloud — spores in the ${name}! ${sporeHow(id)}`
    : `Spores seeped in through the outer airlock — the ${name} is infested! ${sporeHow(id)}`);
  sfx.squelch?.();
  hz.stats.spores = (hz.stats.spores || 0) + 1;
  return true;
}
function clearRoom(id, quiet = false) {
  const S = sporeState();
  if (!S.rooms[id]) return;
  delete S.rooms[id];
  S.glitch = S.glitch.filter(g => g.room !== id);
  if (!quiet) combatBanner(`${roomById(id).name} aired out — the spores are dead`);
}

// The spore mother's scream (js/organic.js): the cloud billows out of the mouth and hangs round the hull.
function motherCloud(e) {
  const side = e.side === 'port' || e.side === 'star' ? e.side : (evs.cloud?.side || 'star');
  if (!evs.cloud) {
    evs.cloud = { side, k: 0, hold: CLOUD_HOLD, t: 0, blow: 0, from: null, gust: null };
    combatBanner('Spore cloud around the hull — don\'t use the airlocks!'); sfx.alarm?.();
  }
  const C = evs.cloud, [mx, my] = MOTHER_MOUTHS[e.openSac] || [MOTHER_RX, 0];
  C.hold = CLOUD_HOLD; C.side = side; C.blow = 0.3; C.from = enemyToWorld(e, mx + 0.6, my);
}
// One gust of the scream reaching the ship: maybe into the airlock on its side.
function sporeGust(e) {
  const C = evs.cloud, side = C?.side || (e.side === 'port' ? 'port' : 'star');
  if (C) C.gust = { side, t: 0 };
  if (Math.random() < MOTHER_SEEP_CHANCE) {
    const h = HATCHES.find(q => q.side === side);
    infestRoom(sporeLockRoom(side), 'gust', h ? [h.inner.x + h.inner.w / 2, h.y] : null);
  }
}

function updateSpores(dt) {
  const S = sporeState();
  // the mother's cloud: billows up, hangs on while she screams, thins out after
  const C = evs.cloud;
  if (C) {
    C.t += dt; C.hold -= dt; C.blow = Math.max(0, (C.blow || 0) - dt);
    if (C.gust && (C.gust.t += dt) > 2) C.gust = null;
    C.k = C.hold > 0 ? Math.min(1, C.k + dt / CLOUD_GROW) : C.k - dt / CLOUD_FADE;
    if (C.k <= 0) { evs.cloud = null; combatBanner('The spore cloud has thinned out — the airlocks are safe again'); }
  }
  // an outer airlock opened to space in the cloud: that room gets the spores (a docked ship's tube isn't space)
  if (evs.cloud) for (const h of HATCHES) if (h.doors.outer > 0.05 && !airlockTube(h)) infestRoom(airlockRoomId(h), 'airlock', [h.inner.x + h.inner.w / 2, h.y]);
  // a vent with spores outside: it vents, but the spores live on (said once, a moment into it, after the vent's own banner)
  const V = hz.vent;
  if (V && !V.sporeSaid && VENT_TIME - V.t > 1.5 && sporesOutside() && Object.keys(S.rooms).some(id => vacuumRoom(id))) {
    V.sporeSaid = true; combatBanner(`The ${roomById(V.room).name.toLowerCase()} vented — but the spore cloud outside blew right back in!`);
  }
  // the infested rooms: vacuum kills them (unless there are spores outside to pull back in); otherwise glitches, then breakage
  const outside = sporesOutside();
  for (const [id, r] of Object.entries(S.rooms)) {
    r.t += dt;
    const vac = vacuumRoom(id);
    if (vac && !outside) { if ((r.vac += dt) >= SPORE_CLEAR) { clearRoom(id); continue; } }
    else r.vac = 0;
    if (vac) continue;                                   // (in vacuum they lie low: no glitches, no eating)
    if ((r.glitchT -= dt) <= 0) { r.glitchT = SPORE_GLITCH_EVERY * (0.7 + Math.random() * 0.6); glitchPart(id); }
    if ((r.breakT -= dt) <= 0) { r.breakT = SPORE_BREAK_EVERY; breakPart(id); }
  }
  S.glitch = S.glitch.filter(g => (g.t -= dt) > 0 && !SYSTEMS[g.sys]?.broken);
  // spreading through open doors (never into the reactor room: they shrivel at its door)
  for (let i = 0; i < DOORS.length; i++) {
    const d = DOORS[i], rs = doorRooms(d), key = String(i);
    const a = rs[0], b = rs[1], ia = a && infested(a.id), ib = b && infested(b.id);
    if (rs.length < 2 || ia === ib || d.open < DOOR_WALK || vacuumRoom(a.id) || vacuumRoom(b.id)) { delete S.doors[key]; delete S.shrivel[key]; continue; }
    const to = ia ? b : a;
    if (SPORE_FREE.has(to.id)) { S.shrivel[key] = to.id; continue; }
    S.doors[key] = (S.doors[key] || 0) + dt;
    if (S.doors[key] >= SPORE_SPREAD) { delete S.doors[key]; infestRoom(to.id, 'door', doorCenter(d)); }
  }
}
function glitchPart(id) {
  const S = sporeState(), pool = sporeParts(id).filter(s => !s.broken && !S.glitch.some(g => SYSTEMS[g.sys] === s));
  if (!pool.length) return null;
  const s = pool[Math.floor(Math.random() * pool.length)];
  S.glitch.push({ sys: SYSTEMS.indexOf(s), t: SPORE_GLITCH_TIME, room: id });
  combatBanner(`Spores in the ${s.name.toLowerCase()} — it's not responding for a few seconds`); sfx.sputter?.();
  return s;
}
function breakPart(id) {
  const pool = sporeParts(id).filter(s => !s.broken);
  if (!pool.length) return null;
  const s = pool[Math.floor(Math.random() * pool.length)];
  breakSystem(s);
  combatBanner(`Spores ate into the ${s.name.toLowerCase()} — broken! ${sporeHow(id)}`);
  return s;
}
function resetSpores() { hz.spores = { rooms: {}, glitch: [], doors: {}, shrivel: {} }; evs.cloud = null; }

// Sidebar plates and problem markers.
function sporePlates(add) {
  const S = sporeState();
  if (evs.cloud) add('sporecloud', { icon: 'spore', title: 'SPORES OUTSIDE', sub: 'keep the airlocks shut till the cloud clears', stripe: SPORE_COL, red: true, wrap: true });
  for (const [id, r] of Object.entries(S.rooms)) {
    const brk = Math.ceil(r.breakT), how = sporesOutside() ? 'spores survive venting while the cloud is outside' : sporeHow(id);
    add('spores' + id, { icon: 'spore', title: 'SPORES', sub: `${roomById(id).name.replace(/ room$/, '')} · ${how}${brk <= 20 ? ` · a part breaks in ${brk} s` : ''}`, stripe: SPORE_COL, red: true, wrap: true });
  }
}
function sporeSpots() {
  return Object.keys(sporeState().rooms).map(id => { const [x, y] = roomCenter(roomById(id)); return { key: 'spores' + id, x, y, icon: 'spore', what: 'SPORES', room: roomById(id).name, col: SPORE_COL }; });
}

// ---------------------------------------------------------------------------
// Drawing (both views: procedural, over the world like the vacuum tint). Every particle is a pure function of the
// time and its index (nothing to keep), so each browser draws the same from the synced state.
// ---------------------------------------------------------------------------
const SPORE_BLOBS = {};
function sporeBlob(kind = 'live') {
  if (SPORE_BLOBS[kind] !== undefined) return SPORE_BLOBS[kind];
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return (SPORE_BLOBS[kind] = null);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const [a, b, e] = kind === 'dead' ? ['rgba(150,120,80,1)', 'rgba(120,96,64,0.5)', 'rgba(100,80,60,0)']
    : kind === 'cloud' ? ['rgba(170,215,120,1)', 'rgba(130,180,95,0.5)', 'rgba(110,150,90,0)']
    : ['rgba(196,222,128,1)', 'rgba(150,186,92,0.5)', 'rgba(120,160,80,0)'];
  gr.addColorStop(0, a); gr.addColorStop(0.5, b); gr.addColorStop(1, e);
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (SPORE_BLOBS[kind] = c);
}
// One floating spore (a fuzzy ball with a halo, lit from the top left): 'mote' alive, 'mote_dead' browned by vacuum.
function sporeMoteImg(dead) {
  const key = dead ? 'mote_dead' : 'mote';
  if (SPORE_BLOBS[key] !== undefined) return SPORE_BLOBS[key];
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return (SPORE_BLOBS[key] = null);
  const c = document.createElement('canvas'); c.width = c.height = 48;
  const g = c.getContext('2d'), halo = g.createRadialGradient(24, 24, 0, 24, 24, 24);
  halo.addColorStop(0, dead ? 'rgba(170,130,80,0.45)' : 'rgba(220,250,140,0.5)'); halo.addColorStop(1, 'rgba(200,240,120,0)');
  g.fillStyle = halo; g.fillRect(0, 0, 48, 48);
  g.strokeStyle = dead ? 'rgba(110,80,50,0.9)' : 'rgba(150,200,80,0.9)'; g.lineWidth = 1.5;   // its hairs
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.moveTo(24 + Math.cos(a) * 7, 24 + Math.sin(a) * 7); g.lineTo(24 + Math.cos(a) * 11, 24 + Math.sin(a) * 11); g.stroke(); }
  const core = g.createRadialGradient(21, 21, 0, 24, 24, 8);
  core.addColorStop(0, dead ? '#d8b888' : '#f4ffd0'); core.addColorStop(0.55, dead ? '#9a7448' : '#b8dc68'); core.addColorStop(1, dead ? '#4e3a22' : '#3e6a1c');
  g.fillStyle = core; g.beginPath(); g.arc(24, 24, 8, 0, Math.PI * 2); g.fill();
  return (SPORE_BLOBS[key] = c);
}
function sporeMote(x, y, r, a, dead) {                   // r: the ball's radius, world units
  if (!(a > 0.01)) return;
  const B = sporeMoteImg(dead), R = r * 3;
  if (B) { ctx.globalAlpha = Math.min(1, a); ctx.drawImage(B, L(x - R), L(y - R), L(2 * R), L(2 * R)); ctx.globalAlpha = 1; return; }
  ctx.fillStyle = dead ? `rgba(160,120,70,${a})` : `rgba(220,245,150,${a})`; ctx.beginPath(); ctx.arc(L(x), L(y), L(r), 0, TAU); ctx.fill();
}
// The haze clinging to a room's walls (denser at the edges, the middle stays readable).
function sporeEdgeHaze(q, up, a, dead) {
  const x0 = L(q.x), y0 = L(q.y - up), w = L(q.w), h = L(q.h + up), d = Math.min(L(2.4), w / 3, h / 3);
  const col = dead ? '140,112,72' : '140,178,86';
  for (const [gx0, gy0, gx1, gy1, rx, ry, rw, rh] of [[x0, 0, x0 + d, 0, x0, y0, d, h], [x0 + w, 0, x0 + w - d, 0, x0 + w - d, y0, d, h],
    [0, y0, 0, y0 + d, x0, y0, w, d], [0, y0 + h, 0, y0 + h - d, x0, y0 + h - d, w, d]]) {
    const g = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
    g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
  }
}
function sporePuff(x, y, r, a, kind) {                    // a soft blob, world units
  if (!(a > 0.004) || !(r > 0)) return;
  const B = sporeBlob(kind);
  if (B) { ctx.globalAlpha = Math.min(1, a); ctx.drawImage(B, L(x - r), L(y - r), L(2 * r), L(2 * r)); ctx.globalAlpha = 1; return; }
  ctx.fillStyle = kind === 'dead' ? `rgba(140,110,70,${a * 0.6})` : `rgba(170,200,120,${a * 0.6})`; ctx.beginPath(); ctx.arc(L(x), L(y), L(r), 0, TAU); ctx.fill();
}
const fract = (v) => v - Math.floor(v);
// The haze in every infested room, the puffs through open doors, the spores shrivelling at the reactor's doors, the
// fuzz on glitching parts (js/game.js render: right after the vacuum tint).
function drawSporesInside(t) {
  const S = hz.spores;
  if (!S) return;
  const up = GFX.lift(1.4);
  for (const [id, r] of Object.entries(S.rooms)) {
    const room = roomById(id); if (!room) continue;
    const vac = vacuumRoom(id), k = clamp(r.t / SPORE_FILL, 0, 1), dying = vac ? 1 - clamp(r.vac / SPORE_CLEAR, 0, 1) : 1;
    ctx.fillStyle = vac ? `rgba(130,110,80,${0.12 * k * dying})` : `rgba(120,150,80,${(0.2 + 0.03 * Math.sin(t * 1.3)) * k})`;
    ctx.beginPath(); for (const q of room.rects) ctx.rect(L(q.x), L(q.y - up), L(q.w), L(q.h + up)); ctx.fill();
    for (const q of room.rects) sporeEdgeHaze(q, up, (vac ? 0.16 : 0.2 + 0.04 * Math.sin(t * 0.9)) * k * dying, vac);   // thick along the walls
    const from = r.from || roomCenter(room), reach = 2 + k * 18;   // (filling in: from where they came in)
    room.rects.forEach((q, qi) => {
      const nm = Math.max(3, Math.round(q.w * (q.h + up) / 2.2));
      for (let i = 0; i < nm; i++) {                      // floating spores: slow, bobbing (browned and sinking in vacuum)
        const s1 = fract(Math.sin((i + 7) * 39.346 + qi * 11.135 + id.length * 5.7) * 24634.6), s2 = fract(s1 * 67.1 + 0.53), s3 = fract(s2 * 37.9 + 0.29);
        const x = q.x + 0.3 + fract(s1 + t * (0.006 + 0.012 * s3) * (s2 < 0.5 ? 1 : -1) + Math.sin(t * 0.5 + i) * 0.01) * (q.w - 0.6);
        const fall = vac ? (1 - dying) * (0.6 + s3) * 2 : 0;
        const y = q.y - up + 0.3 + fract(s2 + t * 0.01 * (s3 - 0.5)) * (q.h + up - 0.6) + Math.sin(t * (0.8 + s3) + i * 1.7) * 0.18 + fall;
        const near = clamp((reach - Math.hypot(x - from[0], y - from[1])) / 2, 0, 1);
        sporeMote(x, y, 0.05 + 0.04 * s3, (0.55 + 0.35 * s1) * near * dying * (0.8 + 0.2 * Math.sin(t * 2 + i)), vac);
      }
      const n = Math.max(2, Math.round(q.w * (q.h + up) / 5));
      for (let i = 0; i < n; i++) {
        const s1 = fract(Math.sin((i + 1) * 12.9898 + qi * 78.233 + id.length * 3.1) * 43758.5), s2 = fract(s1 * 91.7 + 0.37), s3 = fract(s2 * 53.3 + 0.11);
        const x = q.x + fract(s1 + t * (0.012 + 0.02 * s3) * (s2 < 0.5 ? 1 : -1)) * q.w;
        const y = q.y - up + fract(s2 + t * 0.008 * (s3 - 0.5)) * (q.h + up) + Math.sin(t * 0.7 + i) * 0.25;
        const near = clamp((reach - Math.hypot(x - from[0], y - from[1])) / 2, 0, 1);
        sporePuff(x, y, 0.9 + 0.8 * s3 + 0.15 * Math.sin(t * 1.1 + i), (0.36 + 0.16 * s1) * near * dying, vac ? 'dead' : 'live');
        if (i % 2 === 0 && !vac) {                        // motes
          const mx = x + Math.sin(t * 1.7 + i * 2.1) * 0.6, my = y + Math.cos(t * 1.3 + i) * 0.5;
          ctx.fillStyle = `rgba(225,240,170,${0.55 * near})`; ctx.beginPath(); ctx.arc(L(mx), L(my), L(0.045), 0, TAU); ctx.fill();
        }
      }
    });
  }
  // puffs drifting through an open door (towards the clean side), and shrivelling at the reactor room's doors
  const through = (key, k, dead) => {
    const d = DOORS[+key]; if (!d) return;
    const rs = doorRooms(d), src = rs.find(r => infested(r.id)); if (!src || rs.length < 2) return;
    const [cx, cy] = doorCenter(d), sgn = d.axis === 'x' ? Math.sign(cx - roomCenter(src)[0]) : Math.sign(cy - roomCenter(src)[1]);
    const span = d.axis === 'x' ? d.h : d.w;
    for (let i = 0; i < 14; i++) {                         // the cloud pushing through
      const q = fract(t * 0.55 + i / 14), along = -1.4 + q * (dead ? 2.6 : 3.8), off = (fract(i * 0.618) - 0.5) * span * 0.8;
      const x = d.axis === 'x' ? cx + sgn * along : cx + off, y = (d.axis === 'x' ? cy + off : cy + sgn * along) - GFX.lift(0.5);
      const fade = dead ? clamp(1.3 - q * 1.4, 0, 1) : Math.min(1, q * 3) * (1 - q * 0.7) * (0.6 + 0.6 * k);
      sporePuff(x, y, dead ? 0.8 * (1 - q) + 0.2 : 0.65 + q * 0.7, Math.min(1, 1.1 * fade), dead && q > 0.35 ? 'dead' : 'live');
      if (dead && q > 0.45 && i % 2) {                    // the heat crisps them: little embers rising
        ctx.fillStyle = `rgba(255,${150 + 60 * Math.sin(t * 9 + i)},70,${(1 - q)})`; ctx.beginPath(); ctx.arc(L(x + Math.sin(i * 3.1) * 0.2), L(y - 0.6 * q), L(0.09), 0, TAU); ctx.fill();
      }
    }
    for (let i = 0; i < 12; i++) {                         // the spores themselves, streaming over (browning and crumbling at the reactor's heat)
      const q = fract(t * 0.42 + i / 12 + 0.03 * i), along = -1.6 + q * (dead ? 2.4 : 4.2), off = (fract(i * 0.382 + 0.2) - 0.5) * span * 0.9 + Math.sin(t * 2 + i) * 0.12;
      const x = d.axis === 'x' ? cx + sgn * along : cx + off, y = (d.axis === 'x' ? cy + off : cy + sgn * along) - GFX.lift(0.5);
      const a = dead ? clamp(1.2 - q * 1.3, 0, 1) : Math.min(1, q * 4) * Math.min(1, (1 - q) * 3) * (0.7 + 0.3 * k);
      sporeMote(x, y, dead ? 0.07 * (1 - q * 0.6) : 0.07, a, dead && q > 0.4);
    }
    if (dead) {                                            // the heat shimmer at that door, where they die
      const g = ctx.createRadialGradient(L(cx), L(cy - GFX.lift(0.5)), 0, L(cx), L(cy - GFX.lift(0.5)), L(1.3));
      g.addColorStop(0, `rgba(255,140,60,${0.18 + 0.06 * Math.sin(t * 7)})`); g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(cx), L(cy - GFX.lift(0.5)), L(1.3), 0, TAU); ctx.fill();
    }
  };
  for (const [key, v] of Object.entries(S.doors)) through(key, clamp(v / SPORE_SPREAD, 0, 1), false);
  for (const key of Object.keys(S.shrivel)) through(key, 1, true);
  // a glitching part: spore fuzz on it, and why it doesn't work
  for (const g of S.glitch) {
    const s = SYSTEMS[g.sys]; if (!s) continue;
    const x = s.x, y = s.y - GFX.lift(0.6), pulse = 0.75 + 0.25 * Math.sin(t * 6);
    for (let i = 0; i < 6; i++) sporePuff(x + Math.cos(i * 1.9 + t * 0.6) * 0.35, y + Math.sin(i * 2.3 + t * 0.5) * 0.25, 0.45, 0.4 * pulse, 'live');
    ctx.strokeStyle = 'rgba(214,232,160,0.75)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {                        // the hairs of the fuzz
      const a = i / 14 * TAU + Math.sin(t * 2 + i) * 0.2, r0 = L(0.25), r1 = L(0.42 + 0.08 * Math.sin(t * 3 + i * 1.7));
      ctx.beginPath(); ctx.moveTo(L(x) + Math.cos(a) * r0, L(y) + Math.sin(a) * r0 * 0.7); ctx.lineTo(L(x) + Math.cos(a) * r1, L(y) + Math.sin(a) * r1 * 0.7); ctx.stroke();
    }
    ctx.save(); ctx.translate(L(x), L(y - 0.55)); ctx.scale(1, 1 / viewSy());
    ctx.font = `800 ${T * 0.15}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const txt = `SPORES · ${Math.ceil(g.t)} s`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,20,10,0.8)'; ctx.strokeText(txt, 0, 0);
    ctx.fillStyle = 'rgba(214,240,150,0.95)'; ctx.fillText(txt, 0, 0); ctx.restore(); ctx.textAlign = 'left';
  }
  // the cloud's warning at the airlocks' panels: don't use them now
  if (evs.cloud) for (const h of HATCHES) {
    const P = airlockPanelAt(h), blink = Math.sin(t * 6) > 0;
    ctx.save(); ctx.translate(L(P.x + (h.side === 'port' ? 0.9 : -0.9)), L(P.y - GFX.lift(1.2))); ctx.scale(1, 1 / viewSy());
    ctx.font = `800 ${T * 0.14}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(16,20,10,0.85)'; ctx.strokeText('SPORES OUTSIDE', 0, 0);
    ctx.fillStyle = blink ? '#d6f096' : '#9ab860'; ctx.fillText('SPORES OUTSIDE', 0, 0); ctx.restore(); ctx.textAlign = 'left';
  }
}
// Outside: the mother's cloud hanging round the hull (denser on her side), the billow from her screaming mouth, a gust
// surging to the airlock on her side (js/game.js render, after the crew: over the hull's edge).
let HULL_RIM = null;
function hullRim() {                                     // points round the hull, 1.6 units out (with the way out)
  if (HULL_RIM) return HULL_RIM;
  const out = [], n = HULL.length;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = HULL[i], [bx, by] = HULL[(i + 1) % n], len = Math.hypot(bx - ax, by - ay), steps = Math.max(1, Math.round(len / 2.2));
    for (let k = 0; k < steps; k++) {
      const x = ax + (bx - ax) * k / steps, y = ay + (by - ay) * k / steps;
      let nx = (by - ay) / len, ny = -(bx - ax) / len;
      if (pointInPoly(x + nx * 0.3, y + ny * 0.3)) { nx = -nx; ny = -ny; }
      out.push([x + nx * 1.6, y + ny * 1.6, nx, ny]);
    }
  }
  return (HULL_RIM = out);
}
function drawSporeCloud(t) {
  const C = evs.cloud;
  if (!C) return;
  const k = clamp(C.k, 0, 1), rim = hullRim();
  rim.forEach(([x, y, nx, ny], i) => {
    const mine = C.side === 'port' ? x < SHIP_W / 2 : x > SHIP_W / 2, w = Math.sin(t * 0.6 + i * 1.7);
    for (let j = 0; j < 2; j++) {
      const o = 0.4 + j * 1.3 + w * 0.4;
      sporePuff(x + nx * o + Math.cos(t * 0.3 + i) * 0.3, y + ny * o + Math.sin(t * 0.4 + i * 0.7) * 0.3, 1.6 + j * 0.6, (mine ? 0.42 : 0.26) * k * (1 - j * 0.3), 'cloud');
    }
  });
  if (C.blow > 0 && C.from) {                             // the billow out of the screaming mouth, rolling towards us
    const [fx, fy] = C.from, tx = C.side === 'port' ? -1.8 : SHIP_W + 1.8, ty = 13;
    for (let i = 0; i < 16; i++) {
      const q = fract(t * 0.35 + i / 16), x = fx + (tx - fx) * q + Math.sin(i * 2.7 + t) * (1 + q * 2), y = fy + (ty - fy) * q + Math.cos(i * 1.9 + t * 0.8) * (1 + q * 3);
      sporePuff(x, y, 1.0 + q * 1.8, 0.45 * Math.min(1, q * 4) * (1 - q * 0.5), 'cloud');
    }
  }
  if (C.gust) {                                           // a gust surging at the airlock
    const h = HATCHES.find(q => q.side === C.gust.side), g = C.gust.t / 2;
    if (h) for (let i = 0; i < 8; i++) {
      const q = clamp(g * 1.4 - i * 0.06, 0, 1), sx = h.x + h.dir * 6, sy = h.y + (i - 3.5) * 0.9;
      sporePuff(sx + (h.x + h.dir * 0.6 - sx) * q, sy + (h.y - sy) * q, 1.3 - q * 0.6, 0.55 * (1 - g), 'cloud');
    }
  }
}
