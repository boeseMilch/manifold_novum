// Multiplayer. The server (server.js) runs the simulation; every browser sends its input
// and draws the snapshots it gets back. This file is loaded both by browsers and inside the
// server's simulation sandbox.
//
//   snapshot = netSerialize()      (server)  →  netApply(snapshot, myId)   (browser)
//   browser input: { keys, pressed, mouse{wx,wy,down,click,right,rightClick,moved} }
//   browser commands (panels, buttons, debug menu): ['lock', i] / ['bonk'] / ['reload'] / ['debug', key] …

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------
const sysIdx = (s) => (s ? SYSTEMS.indexOf(s) : -1);
function netSerialize() {
  return {
    time,
    crew: crew.map(c => ({
      id: c.id, name: c.name, color: c.color, x: c.x, y: c.y, face: c.face, walk: c.walk, mode: c.mode,
      gun: c.gun?.id || null,
      hatch: c.hatch ? HATCHES.indexOf(c.hatch) : -1, hatchT: c.hatchT, hatchDir: c.hatchDir, cover: c.cover,
      repair: c.repair ? { sys: sysIdx(c.repair.sys), t: c.repair.t } : null, inv: c.inv, prompt: c.prompt && { text: c.prompt.text, ok: c.prompt.ok, at: c.prompt.at, screen: c.prompt.screen, e: c.prompt.e },
      health: c.health, hurtT: c.hurtT, treat: c.treat, hold: c.hold, coffeeT: c.coffeeT, snackT: c.snackT, slow: c.slow, kit: c.kit, armor: c.armor, charge: c.charge, aim: c.aim,
      ui: { panel: c.ui.panel, mini: c.ui.mini, override: c.ui.override ? { name: c.ui.override.name, hits: c.ui.override.hits, swing: c.ui.override.swing } : null },
    })),
    systems: SYSTEMS.map(s => (s.broken ? 1 : 0)),
    caps: CAPACITORS.map(c => [c.charge, c.pulse || 0]),
    power: { reactor: power.reactor, reserve: power.reserve, lever: power.lever, bolts: power.bolts, pulses: power.pulses, patch: power.patch, overcharge: power.overcharge },
    doors: DOORWAYS.map(d => [d.open, d.locked, d.blast ? 1 : 0, d.blastHold || 0]),
    locks: DECK_LOCKS.map(L => ({ open: L.open, doors: L.doors, phase: L.phase, t: L.t, target: L.target, entry: L.entry, locked: L.locked })),
    hatches: HATCHES.map(h => [h.open, h.locked]),
    guns: GUNS.map(g => ({ aim: g.aim, flash: g.flash, shots: g.shots, reload: g.reload, cd: g.cd })),
    items: ITEMS,
    fires: fires.map(f => ({ ...f, sys: sysIdx(f.sys) })),
    luck, hz, evs, enc, org, dk,
    mission: {
      ...mission, revealed: [...mission.revealed],
      events: mission.events.map(e => ({ ...e, sys: e.sys ? sysIdx(e.sys) : undefined })),
      maint: mission.maint && { target: sysIdx(mission.maint.target), decoy: sysIdx(mission.maint.decoy), serviced: mission.maint.serviced },
    },
    combat: {
      enemies: combat.enemies.map(({ D, stopCharge, pois, ...e }) => ({ ...e, pois: pois.map(p => [p.hit ? 1 : 0, p.smoke, p.healT || 0]) })),
      asteroids: combat.asteroids.map(({ shape, ...a }) => a),
      shells: combat.shells, shots: combat.shots, fx: combat.fx, decals: combat.decals, hits: combat.hits,
      flashes: combat.flashes, bigFlashes: combat.bigFlashes, shake: combat.shake, shields: combat.shields,
      shieldHits: combat.shieldHits, swarm: combat.swarm, banner: combat.banner,
    },
    boarding: {
      invaders: boarding.invaders.map(({ path, ...a }) => ({ ...a, hatch: HATCHES.indexOf(a.hatch), target: a.target?.id ?? null, task: a.task ? { ...a.task, sys: sysIdx(a.task.sys) } : null })),
      bolts: boarding.bolts,
    },
  };
}

const shapeCache = new Map();
function netApply(s, myId) {
  time = s.time;
  // crew (keep objects so the camera and smoothing carry over)
  const byId = new Map(crew.map(c => [c.id, c]));
  const next = s.crew.map(d => {
    let c = byId.get(d.id);
    const fresh = !c;
    if (fresh) { c = makeCrew(d.name); c.id = d.id; }
    const { gun, hatch, repair, inv: dInv, ui: dUi, x, y, face, ...rest } = d;
    const mineNow = d.id === myId, predicted = mineNow && !fresh && canPredict(c) && rest.mode === c.mode;
    Object.assign(c, rest);
    if (!predicted) c.face = face;                    // your own facing comes from your own input
    if (fresh || Math.hypot(c.x - x, c.y - y) > 2.5) { c.x = x; c.y = y; }   // snap on big jumps
    c.nx = x; c.ny = y;                               // where the server has them (others glide there, you get corrected towards it)
    c.gun = GUNS.find(g => g.id === gun) || null; c.hatch = HATCHES[hatch] || null;
    c.repair = repair ? { sys: SYSTEMS[repair.sys], t: repair.t } : null;
    Object.assign(c.inv, dInv);
    c.ui.panel = dUi.panel; c.ui.override = dUi.override;
    if (!(mineNow && dUi.mini && c.ui.mini && dUi.mini.kind === c.ui.mini.kind && dUi.mini.kind === 'radar')) c.ui.mini = dUi.mini;   // your own dish angle stays local while you drag
    else Object.assign(c.ui.mini, { ...dUi.mini, angle: localInput.mouse.down ? c.ui.mini.angle : dUi.mini.angle });
    return c;
  });
  crew.length = 0; crew.push(...next);
  const mine = crew.find(c => c.id === myId);
  if (mine) {
    me = mine; me.input = localInput;
    player = me; inv = me.inv; ui = me.ui; keys = localInput.keys; pressed = localInput.pressed; mouse = localInput.mouse;
  }
  s.systems.forEach((b, i) => { SYSTEMS[i].broken = !!b; });
  s.caps.forEach(([ch, pu], i) => { CAPACITORS[i].charge = ch; CAPACITORS[i].pulse = pu; });
  Object.assign(power.reactor, s.power.reactor); power.reserve = s.power.reserve; Object.assign(power.lever, s.power.lever); power.bolts = s.power.bolts; power.pulses = s.power.pulses || []; power.patch = s.power.patch || [0, 1, 2]; power.overcharge = !!s.power.overcharge;
  s.doors.forEach(([o, l, b, bh], i) => { DOORWAYS[i].open = o; DOORWAYS[i].locked = l; DOORWAYS[i].blast = !!b; DOORWAYS[i].blastHold = bh; });
  s.locks.forEach((d, i) => Object.assign(DECK_LOCKS[i], d));
  s.hatches.forEach(([o, l], i) => { HATCHES[i].open = o; HATCHES[i].locked = l; });
  s.guns.forEach((d, i) => {
    const { aim, ...rest } = d;
    Object.assign(GUNS[i], rest);
    if (!(me.mode === 'gun' && me.gun === GUNS[i])) GUNS[i].aim = aim;   // the cannon you're on aims locally
  });
  ITEMS.length = 0; ITEMS.push(...s.items);
  fires.length = 0; fires.push(...s.fires.map(f => ({ ...f, sys: SYSTEMS[f.sys] })));
  Object.assign(luck, s.luck); Object.assign(hz, s.hz); Object.assign(evs, s.evs); Object.assign(enc, s.enc); Object.assign(org, s.org); Object.assign(dk, s.dk);
  if (JSON.stringify(s.mission.upgrades || {}) !== JSON.stringify(mission.upgrades || {})) applyShipUpgrades(s.mission.upgrades || {});   // (HUD numbers like shots per energy)
  Object.assign(mission, s.mission, {
    revealed: new Set(s.mission.revealed),
    events: s.mission.events.map(e => ({ ...e, sys: e.sys !== undefined ? SYSTEMS[e.sys] : undefined })),
    maint: s.mission.maint && { target: SYSTEMS[s.mission.maint.target], decoy: SYSTEMS[s.mission.maint.decoy], serviced: s.mission.maint.serviced },
  });
  const C2 = s.combat;
  combat.enemies = C2.enemies.map(d => {
    const D = ENEMY_TYPES[d.kind];
    return { ...d, D, pois: D.pois.map((p, i) => ({ ...p, c: shapeCenter(p.shape), hit: !!d.pois[i][0], smoke: d.pois[i][1], healT: d.pois[i][2] })) };
  });
  combat.asteroids = C2.asteroids.map(a => {
    if (!shapeCache.has(a.uid)) shapeCache.set(a.uid, lumpShape(a.shapeSeed, a.big ? 11 : 8, 0.3));
    return { ...a, shape: shapeCache.get(a.uid) };
  });
  for (const k of ['shells', 'shots', 'fx', 'decals', 'hits', 'flashes', 'bigFlashes', 'shake', 'shields', 'shieldHits', 'swarm', 'banner']) combat[k] = C2[k];
  boarding.invaders = s.boarding.invaders.map(a => ({ ...a, path: [], hatch: HATCHES[a.hatch], target: crew.find(c => c.id === a.target) || null,
                                                      task: a.task ? { ...a.task, sys: SYSTEMS[a.task.sys] } : null }));
  boarding.bolts = s.boarding.bolts;
}

// Sounds happen inside the simulation; on the server they are recorded and sent along.
function netCaptureSfx() {
  const events = []; let chargeId = 0;
  for (const k of Object.keys(sfx)) {
    if (k === 'onReady' || k === 'toggleMute' || k === 'muted' || typeof sfx[k] !== 'function') continue;
    if (k === 'charge') sfx[k] = (dur) => { const id = ++chargeId; events.push(['charge', [dur, id]]); return () => events.push(['chargeStop', [id]]); };
    else sfx[k] = (...a) => { events.push([k, a]); };
  }
  return events;
}
const chargeStops = new Map();
function netPlaySfx(events) {
  for (const [k, a] of events) {
    if (k === 'charge') chargeStops.set(a[1], sfx.charge(a[0]));
    else if (k === 'chargeStop') { chargeStops.get(a[0])?.(); chargeStops.delete(a[0]); }
    else sfx[k]?.(...a);
  }
}

// ---------------------------------------------------------------------------
// Server side (runs inside the server's simulation sandbox)
// ---------------------------------------------------------------------------
const netServer = {
  init(missionId, ship) { crew.length = 0; startMission(missionId, { ship }); },
  addCrew(id, name, kit) {
    const spots = [[22.2, 4.5], [20.2, 8], [24.2, 8], [18.5, 4], [26, 4], [22.2, 9.5], [16.5, 8.5], [28, 8.5]];
    const [x, y] = spots[crew.length % spots.length];
    const c = makeCrew(name, x, y); c.id = id; c.color = CREW_COLORS[(id - 1) % CREW_COLORS.length];
    applyKit(c, kit);
    crew.push(c);
  },
  removeCrew(id) {
    const i = crew.findIndex(c => c.id === id);
    if (i >= 0) { const c = crew[i]; if (c.inv.weapon) ITEMS.push({ kind: c.inv.weapon, x: c.x, y: c.y }); if (c.inv.item) ITEMS.push({ kind: c.inv.item, x: c.x + 0.3, y: c.y }); crew.splice(i, 1); }
  },
  input(id, m) {
    const c = crew.find(c => c.id === id);
    if (!c) return;
    const inp = c.input;
    inp.keys = new Set(m.keys || []);
    for (const k of m.pressed || []) inp.pressed.add(k);
    const mm = m.mouse || {};
    Object.assign(inp.mouse, { wx: mm.wx, wy: mm.wy, down: !!mm.down, right: !!mm.right });
    inp.mouse.click ||= !!mm.click; inp.mouse.rightClick ||= !!mm.rightClick; inp.mouse.moved ||= mm.moved;
  },
  command(id, cmd) { const c = crew.find(c => c.id === id); if (c && Array.isArray(cmd)) withCrew(c, () => runCommand(cmd)); },
  step(dt) { simTick(dt); },
};

// ---------------------------------------------------------------------------
// Browser side: main menu, game lobby, connection
//   menu  → PLAY SOLO (the solo lobby), OPEN A GAME (you host it) or JOIN one from the live list
//   lobby → the host picks the mission and starts; everyone else watches the choice
//   game  → snapshots in, input out; when the mission is over the page reloads straight back
//           into the same game's lobby (sessionStorage 'mn-return' carries the game and seat ticket)
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined' && window.document && document.getElementById('lobby')) netClientMain();

function netClientMain() {
  const $ = (id) => document.getElementById(id);
  const lobby = $('lobby');
  if (lobby.hidden) return;                          // a debug URL skipped the menu
  let ws = null, myId = null, chosen = 'intro', phase = 'menu', solo = false, myGame = null, ticket = null, isHost = false;
  let netState = 'none', games = [], lastLobby = null, maxPlayers = 8;
  const store = (k, v) => { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } };
  const nameBox = $('lobby-name');
  try { nameBox.value = localStorage.getItem('mn-name') || ''; } catch (e) { /* no storage */ }
  if (!nameBox.value) nameBox.value = ['Ripley', 'Spock', 'Zoe', 'Bender', 'Kaylee', 'Chewie', 'Marvin', 'Data'][Math.floor(Math.random() * 8)];
  const saveName = () => { try { localStorage.setItem('mn-name', nameBox.value); } catch (e) { /* no storage */ } };
  const online = () => ws && ws.readyState === 1;
  const sendWs = (o) => online() && ws.send(JSON.stringify(o));
  const missionName = (id) => MISSIONS[id]?.name || id;

  // profile, mission cards, briefing, locker and shipyard (progress.js)
  const hello = () => sendWs({ t: 'hello', name: nameBox.value, kit: profileKit(), ship: profile.ship, unlocked: [...unlockedMissions()], level: levelOf(profile.xp) });
  const pick = (id) => { if (!solo && !isHost) return; chosen = id; if (!solo) sendWs({ t: 'mission', id }); };
  lobbyUI.init(pick, hello);
  $('room-locker').onclick = () => lobbyUI.shop('locker');
  $('room-shipyard').onclick = () => lobbyUI.shop('shipyard');
  const markChosen = () => { lobbyUI.tab = CAMPAIGN.includes(chosen) ? 'campaign' : chosen === 'practice' ? 'practice' : 'skirmish'; lobbyUI.render(chosen); };
  chosen = CAMPAIGN.find(id => unlockedMissions().has(id) && !profile.done[id]) || 'c1';
  const q = new URLSearchParams(location.search);    // dev: ?mission=rush&autostart
  if (q.get('mission') && MISSIONS[q.get('mission')]) chosen = q.get('mission');
  markChosen();

  // ----- screens
  function show(view) {
    phase = view;
    $('menu').hidden = view !== 'menu'; $('room').hidden = view !== 'room';
    if (view === 'menu') { solo = false; myGame = null; isHost = false; lobbyUI.union = null; renderMenu(); }
    else renderRoom();
  }
  function renderMenu() {
    const box = $('menu-games'), status = $('menu-net');
    $('menu-open').disabled = netState !== 'online';
    status.className = 'net ' + netState;
    status.textContent = { none: 'offline', connecting: 'connecting…', online: 'server online', lost: 'connection lost' }[netState];
    if (netState !== 'online') {
      box.innerHTML = `<li class="empty">${netState === 'connecting' ? 'Looking for the server…'
        : 'No server here, so there is no multiplayer. To play together, run <code>node server.js</code> and open its <code>http://…</code> address. Solo works as always.'}</li>`;
      return;
    }
    if (!games.length) { box.innerHTML = '<li class="empty">No open games yet. Open one, and everyone on this server sees it here.</li>'; return; }
    box.innerHTML = games.map(g => `<li class="game${g.full ? ' full' : ''}">
        <i class="dot" style="background:${g.color}"></i>
        <span class="who"><b>${escapeHtml(g.host)}'s game</b><small>${escapeHtml(missionName(g.mission))}</small></span>
        <span class="tag ${g.phase === 'game' ? 'busy' : ''}">${g.phase === 'game' ? 'in mission' : 'in lobby'}</span>
        <span class="count">${g.players}/${g.max || maxPlayers}</span>
        ${g.full ? '<span class="join-full">FULL</span>' : `<button class="join" data-game="${g.id}">JOIN</button>`}
      </li>`).join('');
    box.querySelectorAll('[data-game]').forEach(b => b.onclick = () => { saveName(); hello(); sendWs({ t: 'join', game: +b.dataset.game }); });
  }
  function renderRoom() {
    const room = $('room'), L = lastLobby;
    const canPick = solo || isHost;
    room.classList.toggle('guest', !canPick);
    const host = L && L.players.find(p => p.host);
    $('room-title').textContent = solo ? 'SOLO MISSION' : host ? `${host.name.toUpperCase()}'S GAME` : 'GAME';
    $('room-host').textContent = solo ? 'Just you and the ship.' : !L ? 'Joining…' : isHost ? 'You are the host: you pick the mission and start it.'
      : `${host ? host.name : 'The host'} is the host: they pick the mission and start it.`;
    $('lobby-players').innerHTML = solo || !L ? `<li style="color:${profile.paint || '#c4683a'}">${escapeHtml(nameBox.value || 'You')} <small>(you)</small></li>`
      : L.players.map(p => `<li style="color:${p.color}"${p.away ? ' class="away"' : ''}>${p.host ? '<span class="crown" title="host">HOST</span> ' : ''}${escapeHtml(p.name)} <small>lv ${p.level || 1}${p.id === myId ? ' · you' : ''}${p.away ? ' · coming back…' : ''}</small></li>`).join('');
    $('room-count').textContent = solo ? '' : L ? `${L.players.length}/${L.max || maxPlayers}` : '';
    const start = $('lobby-start');
    start.disabled = !canPick || (!solo && L?.phase === 'game');
    start.textContent = solo ? 'START MISSION' : L?.phase === 'game' ? 'MISSION RUNNING…' : isHost ? 'START MISSION' : `WAITING FOR ${host ? host.name.toUpperCase() : 'THE HOST'}…`;
    $('room-back').textContent = solo ? '‹ MENU' : '‹ LEAVE GAME';
  }

  // ----- buttons
  const startSolo = () => { saveName(); me.name = nameBox.value || 'You'; lobby.hidden = true; applyKit(me, profileKit()); startMission(chosen, { ship: profile.ship }); };
  $('menu-solo').onclick = () => { saveName(); solo = true; lastLobby = null; show('room'); markChosen(); };
  $('menu-open').onclick = () => { saveName(); hello(); sendWs({ t: 'open', mission: chosen }); };
  $('room-back').onclick = () => { if (!solo) sendWs({ t: 'leave' }); lastLobby = null; show('menu'); };
  $('lobby-start').onclick = () => { saveName(); if (solo) startSolo(); else if (isHost) sendWs({ t: 'start' }); };
  nameBox.onchange = () => { saveName(); hello(); };
  backToLobby = () => { store('mn-return', 'solo'); location.reload(); };   // solo: after a mission, back to the solo lobby

  const ret = store('mn-return'); store('mn-return', null);              // coming back from a mission?
  let rejoin = null;
  try { rejoin = ret && ret !== 'solo' ? JSON.parse(ret) : null; } catch (e) { rejoin = null; }
  if (ret === 'solo' && !q.has('autostart')) { solo = true; show('room'); } else show('menu');

  if (!location.protocol.startsWith('http')) { if (q.has('autostart')) startSolo(); return; }
  try { ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); } catch (e) { ws = null; }
  if (!ws) { if (q.has('autostart')) startSolo(); return; }
  netState = 'connecting'; if (phase === 'menu') renderMenu();
  if (rejoin) { $('room-host').textContent = 'Back to the lobby…'; show('room'); }
  const fail = setTimeout(() => {
    if (ws.readyState === 1) return;
    ws.onclose = null; ws.close(); ws = null; netState = 'none';
    if (q.has('autostart')) return startSolo();
    lastLobby = null; show(phase === 'room' && solo ? 'room' : 'menu');
  }, 2000);
  let autostart = q.has('autostart');
  ws.onopen = () => {
    clearTimeout(fail); netState = 'online'; hello();
    if (rejoin) sendWs({ t: 'join', game: rejoin.game, ticket: rejoin.ticket });
    else if (autostart) sendWs({ t: 'open', mission: chosen });           // dev: open a game and start it right away
    if (phase === 'menu') renderMenu();
  };
  ws.onclose = () => {
    netState = netState === 'online' ? 'lost' : 'none';
    if (phase === 'game') { setTimeout(() => location.reload(), 1500); return; }
    if (!solo) { lastLobby = null; show('menu'); }
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'welcome') { myId = m.id; maxPlayers = m.max || 8; }
    else if (m.t === 'games') { games = m.games; maxPlayers = m.max || maxPlayers; if (phase === 'menu') renderMenu(); }
    else if (m.t === 'joined') { myGame = m.game; ticket = m.ticket; solo = false; lastLobby = null; if (phase !== 'game') show('room'); }
    else if (m.t === 'full' || m.t === 'gone') {
      if (phase === 'room' && !solo) show('menu');
      $('menu-msg').textContent = m.t === 'full' ? `That game is full (${m.max} players). Open a new one!` : 'That game has closed.';
      setTimeout(() => { $('menu-msg').textContent = ''; }, 5000);
    } else if (m.t === 'lobby') {
      if (m.game !== myGame) return;
      if (phase === 'game') {                                             // mission over: fresh page, back into this game's lobby
        if (m.phase === 'lobby') { store('mn-return', JSON.stringify({ game: myGame, ticket })); location.reload(); }
        return;
      }
      lastLobby = m; isHost = m.host === myId;
      chosen = m.mission; lobbyUI.union = m.unlocked || null; markChosen();
      renderRoom();
      if (autostart && isHost && m.phase === 'lobby') { autostart = false; sendWs({ t: 'start' }); }
    } else if (m.t === 'start') {
      phase = 'game'; lobby.hidden = true;
      NET.on = true; NET.frame = netFrame;
      sendCommand = (cmd) => ws.send(JSON.stringify({ t: 'cmd', cmd }));
      backToLobby = () => ws.send(JSON.stringify({ t: 'lobby' }));
    } else if (m.t === 'state') {
      netApply(m.s, m.you);
      if (m.sfx?.length) netPlaySfx(m.sfx);
    }
  };

  // every frame while in a game: predict yourself, smooth the others, browser-side update, send input
  function netFrame(dt) {
    netPredict(dt);
    clientUpdate(dt);
    const m = localInput.mouse;
    if (ws.readyState === 1) ws.send(JSON.stringify({
      t: 'input', keys: debugOpen ? [] : [...localInput.keys], pressed: [...localInput.pressed],
      mouse: { wx: m.wx, wy: m.wy, down: m.down && !m.suppress, right: m.right, click: m.click, rightClick: m.rightClick, moved: m.moved },
    }));
    localInput.pressed.clear(); m.click = false; m.rightClick = false; m.moved = 0;
  }
}
// ---------------------------------------------------------------------------
// Latency hiding (simplest form): your own crew member moves right away on your keys, using the
// same movement code as the server; the server's position only corrects you when you've stopped
// or drifted off. The cannon you're manning aims from your mouse locally. Everyone else glides
// towards their latest server position. Hatches and teleports come from the server.
// ---------------------------------------------------------------------------
const canPredict = (c) => (c.mode === 'inside' || c.mode === 'eva') && (c.health || 'ok') !== 'down' && c.health !== 'out';
const PREDICT_SNAP = 1.5, PREDICT_DRIFT = 0.6;
function netPredict(dt) {
  const k = 1 - Math.exp(-25 * dt);
  for (const c of crew) {
    if (c.nx === undefined) continue;
    if (c !== me || !canPredict(c)) { c.x = lerp(c.x, c.nx, k); c.y = lerp(c.y, c.ny, k); continue; }
    const blocked = debugOpen || !!me.ui.panel || !!mission.over;
    const ik = localInput.keys, has = (...codes) => !blocked && codes.some(x => ik.has(x));
    const ix = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0), iy = (has('KeyS') ? 1 : 0) - (has('KeyW') ? 1 : 0);
    const ax = (has('ArrowRight') ? 1 : 0) - (has('ArrowLeft') ? 1 : 0), ay = (has('ArrowDown') ? 1 : 0) - (has('ArrowUp') ? 1 : 0);
    c.aim = ax || ay ? Math.atan2(ay, ax) : null;
    updateCrew(me, dt, ix, iy);                        // move now, don't wait for the server
    const err = Math.hypot(c.nx - c.x, c.ny - c.y);
    if (err > PREDICT_SNAP) { c.x = c.nx; c.y = c.ny; }                       // way off (pushed, teleported): snap
    else if (!(ix || iy) || err > PREDICT_DRIFT) {                            // resting or drifting: glide back
      const kc = 1 - Math.exp(-8 * dt); c.x = lerp(c.x, c.nx, kc); c.y = lerp(c.y, c.ny, kc);
    }
  }
  if (me.mode === 'gun' && me.gun && !debugOpen && !me.ui.panel) {   // aim the cannon you're on locally, same rule as the server
    const g = me.gun, m = localInput.mouse, arc = gunArc(g), ik = localInput.keys;
    if (m.moved) g.aim = Math.atan2(m.wy - g.y, m.wx - g.x);
    g.aim += ((ik.has('KeyD') || ik.has('ArrowRight') ? 1 : 0) - (ik.has('KeyA') || ik.has('ArrowLeft') ? 1 : 0)) * GUN_TURN * dt;
    g.aim = g.a + clamp(wrapAngle(g.aim - g.a), -arc, arc);
    me.face = g.aim;
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
