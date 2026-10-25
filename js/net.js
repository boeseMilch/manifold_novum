// Multiplayer. The server (server.js) runs the simulation; every browser sends its input
// and draws the snapshots it gets back. This file is loaded both by browsers and inside the
// server's simulation sandbox.
//
//   snapshot = netSerialize()      (server)  →  netApply(snapshot, myId)   (browser)
//   browser input: { keys, pressed, mouse{wx,wy,down,click,right,rightClick,moved,look} }
//   browser commands (panels, buttons, debug menu): ['lock', i] / ['bonk'] / ['reload'] / ['debug', key] …

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------
const sysIdx = (s) => (s ? ALL_PARTS.indexOf(s) : -1);   // (ALL_PARTS: SYSTEMS, then the hull seams: js/hazards.js)
function netSerialize() {
  return {
    time,
    crew: crew.map(c => ({
      id: c.id, name: c.name, color: c.color, x: c.x, y: c.y, seq: c.input.seq, face: c.face, walk: c.walk, mode: c.mode, lamp: !!c.lamp,
      gun: c.gun?.id || null,
      cover: c.cover,
      repair: c.repair ? { sys: sysIdx(c.repair.sys), t: c.repair.t } : null, inv: c.inv, prompt: c.prompt && { text: c.prompt.text, ok: c.prompt.ok, at: c.prompt.at, screen: c.prompt.screen, e: c.prompt.e, eAct: c.prompt.eAct, quiet: c.prompt.quiet, rep: c.prompt.rep },
      health: c.health, hurtT: c.hurtT, treat: c.treat, heal: c.heal ?? null, hold: c.hold, coffeeT: c.coffeeT, snackT: c.snackT, slow: c.slow, kit: c.kit, armor: c.armor, charge: c.charge, aim: c.aim,
      ui: { panel: c.ui.panel, mini: c.ui.mini, override: c.ui.override ? { name: c.ui.override.name, hits: c.ui.override.hits, swing: c.ui.override.swing } : null },
    })),
    systems: SYSTEMS.map(s => (s.broken ? 1 : 0)),
    caps: CAPACITORS.map(c => [c.charge, c.pulse || 0]),
    power: { reactor: power.reactor, reserve: power.reserve, lever: power.lever, bolts: power.bolts, pulses: power.pulses, patch: power.patch, overcharge: power.overcharge },
    doors: DOORS.map(d => [d.open, d.locked, d.blast ? 1 : 0, d.hold || 0, d.jammed ? 1 : 0, d.pry || 0, d.stay || 0, d.bolt ?? 1]),   // (the doorways, then the deck doors)
    hatches: HATCHES.map(h => [h.doors.inner, h.doors.outer, h.air, h.phase, h.t, h.target, h.locked, h.forced || 0]),   // (the outer airlocks: js/airlock.js)
    guns: GUNS.map(g => ({ aim: g.aim, flash: g.flash, shots: g.shots, reload: g.reload, cd: g.cd })),
    items: ITEMS,
    fires: fires.map(f => ({ ...f, sys: sysIdx(f.sys) })),
    luck, hz, evs, enc, org, dk,
    tasks: { claims: crewTasks.claims, custom: crewTasks.custom },   // who took on which plate, task plates (js/claims.js)
    mission: {
      ...mission, revealed: [...mission.revealed],
      events: mission.events.map(e => ({ ...e, sys: e.sys ? sysIdx(e.sys) : undefined, decoy: e.decoy ? sysIdx(e.decoy) : undefined })),   // (maintenance: its pair)
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
      pods: boarding.pods,                            // (chapter 2's cargo pods: sealed / stirring / burst open)
    },
  };
}

const shapeCache = new Map();
function netApply(s, myId) {
  netClockSync(s.time);
  // crew (keep objects so the camera and smoothing carry over)
  const byId = new Map(crew.map(c => [c.id, c]));
  const next = s.crew.map(d => {
    let c = byId.get(d.id);
    const fresh = !c;
    if (fresh) { c = makeCrew(d.name); c.id = d.id; }
    const { gun, repair, inv: dInv, ui: dUi, x, y, face, walk, seq, ...rest } = d;
    const mineNow = d.id === myId, predicted = mineNow && !fresh && canPredict(c) && rest.mode === c.mode;
    Object.assign(c, rest);
    if (!predicted) { c.face = face; c.walk = walk; } // your own facing and stride come from your own input
    if (mineNow && !predicted) netForget();
    if (predicted && netReconcile(x, y, seq)) { /* yours: compared with where you were when you sent that input (netPredict) */ }
    else if (fresh || Math.hypot(c.x - x, c.y - y) > 2.5) { c.x = x; c.y = y; }   // snap on big jumps
    c.nx = x; c.ny = y;                               // where the server has them (others glide there, you get corrected towards it)
    c.gun = GUNS.find(g => g.id === gun) || null;
    c.repair = repair ? { sys: ALL_PARTS[repair.sys], t: repair.t } : null;
    Object.assign(c.inv, dInv);
    c.ui.panel = dUi.panel; c.ui.override = dUi.override;
    c.ui.mini = dUi.mini;
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
  const leverAt = power.lever.angle;                 // (the handle swings in this browser, every frame: netFrame)
  Object.assign(power.reactor, s.power.reactor); power.reserve = s.power.reserve; Object.assign(power.lever, s.power.lever); if (netLive && Number.isFinite(leverAt)) power.lever.angle = leverAt; power.bolts = s.power.bolts; power.pulses = s.power.pulses || []; power.patch = s.power.patch || [0, 1, 2]; power.overcharge = !!s.power.overcharge;
  s.doors.forEach(([o, l, b, h, j, p, st, bo], i) => { const d = DOORS[i]; if (!d) return; d.open = o; d.locked = l; d.blast = !!b; d.hold = h; d.jammed = !!j; d.pry = p; d.stay = st || 0; d.bolt = bo ?? 1; });
  s.hatches.forEach(([di, dout, air, phase, t, target, l, f], i) => { Object.assign(HATCHES[i], { air, phase, t, target, locked: l, forced: f }); HATCHES[i].doors.inner = di; HATCHES[i].doors.outer = dout; });
  s.guns.forEach((d, i) => {
    const { aim, ...rest } = d;
    Object.assign(GUNS[i], rest);
    if (!(me.mode === 'gun' && me.gun === GUNS[i] && standing(me))) GUNS[i].aim = aim;   // the cannon you're on aims locally
  });
  ITEMS.length = 0; ITEMS.push(...s.items);
  fires.length = 0; fires.push(...s.fires.map(f => ({ ...f, sys: SYSTEMS[f.sys] })));
  if (s.tasks) { crewTasks.claims = s.tasks.claims || {}; crewTasks.custom = s.tasks.custom || []; }
  Object.assign(luck, s.luck); Object.assign(hz, s.hz); Object.assign(evs, s.evs); Object.assign(enc, s.enc); Object.assign(org, s.org); Object.assign(dk, s.dk);
  if (JSON.stringify(s.mission.upgrades || {}) !== JSON.stringify(mission.upgrades || {})) applyShipUpgrades(s.mission.upgrades || {});   // (HUD numbers like shots per energy)
  Object.assign(mission, s.mission, {
    revealed: new Set(s.mission.revealed),
    events: s.mission.events.map(e => ({ ...e, sys: e.sys !== undefined ? ALL_PARTS[e.sys] : undefined, decoy: e.decoy !== undefined ? ALL_PARTS[e.decoy] : undefined })),
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
  boarding.pods = s.boarding.pods || []; syncPodSolids();   // (their footprints are solid: your own walking is predicted here)
  netGlideFrom(boarding.invaders); netGlideFrom(dk.pirates || []);
  netLive = true;
}

// Sounds happen inside the simulation; on the server they are recorded and sent along.
function netCaptureSfx() {
  const events = []; let chargeId = 0;
  for (const k of Object.keys(sfx)) {
    if (k === 'onReady' || k === 'toggleMute' || k === 'muted' || typeof sfx[k] !== 'function') continue;
    if (k === 'charge') sfx[k] = (dur) => { const id = ++chargeId; events.push(['charge', [dur, id]]); return () => events.push(['chargeStop', [id]]); };
    else sfx[k] = (...a) => { events.push([k, a]); };
  }
  sfx.forCrew = (id, k, a) => events.push([k, a, id]);   // (sfxFor: only that crew member's browser plays it)
  return events;
}
const chargeStops = new Map();
function netPlaySfx(events) {
  for (const [k, a, to] of events) {
    if (to !== undefined && to !== me?.id) continue;  // (someone else's own sound: sfxFor)
    if (k === 'charge') chargeStops.set(a[1], sfx.charge(a[0]));
    else if (k === 'chargeStop') { chargeStops.get(a[0])?.(); chargeStops.delete(a[0]); }
    else sfx[k]?.(...a);
  }
}

// ---------------------------------------------------------------------------
// Server side (runs inside the server's simulation sandbox)
// ---------------------------------------------------------------------------
const netServer = {
  init(missionId, ship, easy = 0, host = null, custom = null) { crew.length = 0; startMission(missionId, { ship, easy, custom }); mission.shipOf = host; },   // (host: { id, name }: whose ship flies; its upgrades count, everyone earns their own reputation)
  addCrew(id, name, kit) {
    const spots = [[22.2, 4.5], [20.2, 8], [24.2, 8], [18.5, 4], [26, 4], [22.2, 9.5], [16.5, 8.5], [28, 8.5]];
    const [x, y] = spots[crew.length % spots.length];
    const c = makeCrew(name, x, y); c.id = id; c.color = CREW_COLORS[(id - 1) % CREW_COLORS.length];
    applyKit(c, kit);
    crew.push(c);
  },
  removeCrew(id) {
    const i = crew.findIndex(c => c.id === id);
    if (i >= 0) { const c = crew[i]; if (c.inv.weapon) ITEMS.push({ kind: c.inv.weapon, ...dropSpot(c.x, c.y) }); if (c.inv.item) ITEMS.push({ kind: c.inv.item, ...dropSpot(c.x + 0.3, c.y) }); crew.splice(i, 1); releaseCrewClaims(id); }
  },
  input(id, m) {
    const c = crew.find(c => c.id === id);
    if (!c) return;
    const inp = c.input;
    inp.keys = new Set(m.keys || []);
    for (const k of m.pressed || []) inp.pressed.add(k);
    const mm = m.mouse || {};
    Object.assign(inp.mouse, { wx: mm.wx, wy: mm.wy, down: !!mm.down, right: !!mm.right });
    if (Number.isFinite(m.seq)) inp.seq = m.seq;     // (the last input this crew member's browser sent: it reconciles its own walk with it)
    inp.mouse.click ||= !!mm.click; inp.mouse.rightClick ||= !!mm.rightClick; inp.mouse.moved ||= mm.moved; inp.mouse.look ||= mm.look;
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
  let ws = null, myId = null, chosen = 'c1', phase = 'menu', solo = false, myGame = null, ticket = null, isHost = false;
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
  const hello = () => sendWs({ t: 'hello', name: nameBox.value, kit: profileKit(), ship: profile.ship, rep: profile.rep, unlocked: [...unlockedMissions()] });
  const pick = (id) => { if (!solo && !isHost) return; chosen = id; if (!solo) sendWs({ t: 'mission', id }); };
  lobbyUI.init(pick, hello);
  // The skirmish builder's settings: this browser's (localStorage, not the profile); the host's travel to the server
  try { const c = JSON.parse(localStorage.getItem('mn-skirmish')); lobbyUI.custom = customConfig(c); lobbyUI.practice = !!c?.practice; } catch (e) { lobbyUI.custom = customConfig(null); }
  lobbyUI.onCustom = (cfg) => {
    try { localStorage.setItem('mn-skirmish', JSON.stringify({ ...cfg, practice: lobbyUI.practice })); } catch (e) { /* no storage */ }
    if (!solo && isHost) sendWs({ t: 'skirmish', custom: cfg });
    renderRoom();
  };
  $('room-locker').onclick = () => lobbyUI.shop('locker');
  // Start over (e.g. to play the progression again with friends): a fresh profile, keeping the name and suit
  // color; the old one is kept in localStorage 'mn-profile-backup' in case it was a misclick.
  $('lobby-reset').onclick = () => {
    if (!confirm('Start over?\n\nThis resets your money, reputation, gear, profession, ship upgrades and finished chapters. Your name and suit color stay.')) return;
    try { localStorage.setItem('mn-profile-backup', JSON.stringify(profile)); } catch (e) { /* no storage */ }
    profile = Object.assign(defaultProfile(), { paint: profile.paint });
    saveProfile(profile);
    chosen = CAMPAIGN.find(id => unlockedMissions().has(id)) || 'c1';
    markChosen(); hello();
  };
  $('room-shipyard').onclick = () => lobbyUI.shop('shipyard');
  const markChosen = () => lobbyUI.render(chosen);
  // Difficulty slider (0 normal, 1 easy, 2 very easy; the slider runs very easy → normal): the host's choice,
  // remembered in this browser.
  const storedEasy = () => { try { return Math.min(2, Math.max(0, Math.floor(+localStorage.getItem('mn-difficulty')) || 0)); } catch (e) { return 0; } };
  let easy = storedEasy();
  const easyBox = $('lobby-easy'), easyName = $('lobby-easy-name');
  const showEasy = () => { easyBox.value = 2 - easy; easyName.textContent = DIFFICULTIES[easy].toUpperCase(); easyName.classList.toggle('easier', easy > 0); };
  easyBox.oninput = () => {
    if (!solo && !isHost) return showEasy();
    easy = 2 - +easyBox.value; showEasy();
    try { localStorage.setItem('mn-difficulty', easy); } catch (e) { /* no storage */ }
    if (!solo) sendWs({ t: 'difficulty', easy });
  };
  showEasy();
  chosen = CAMPAIGN.find(id => unlockedMissions().has(id) && !profile.done[id]) || 'c1';
  const q = new URLSearchParams(location.search);    // dev: ?mission=rush&autostart
  if (q.get('mission') && MISSIONS[q.get('mission')]) chosen = q.get('mission');
  markChosen();

  // ----- screens
  function show(view) {
    phase = view;
    $('menu').hidden = view !== 'menu'; $('room').hidden = view !== 'room';
    if (view === 'menu') { solo = false; myGame = null; isHost = false; lobbyUI.union = null; lobbyUI.flight = null; renderMenu(); }
    else renderRoom();
  }
  function renderMenu() {
    const box = $('menu-games'), status = $('menu-net');
    $('menu-open').disabled = netState !== 'online';
    status.className = 'net ' + netState;
    status.textContent = { none: 'offline', connecting: 'connecting…', online: 'server online', lost: 'connection lost' }[netState];
    if (netState !== 'online') {
      box.innerHTML = `<li class="empty">${netState === 'connecting' ? 'Looking for the server…'
        : 'No server, so solo only. To play together, run <code>node server.js</code> and open the <code>http://…</code> address it prints.'}</li>`;
      return;
    }
    if (!games.length) { box.innerHTML = '<li class="empty">No games yet. Open one and it shows up here for everyone.</li>'; return; }
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
    $('lobby-easy').disabled = !canPick;
    const host = L && L.players.find(p => p.host);
    $('room-title').textContent = solo ? 'SOLO MISSION' : host ? `${host.name.toUpperCase()}'S GAME` : 'GAME';
    $('room-host').textContent = solo ? 'Just you and the ship.' : !L ? 'Joining…' : isHost ? 'You are the host: you pick the mission and start it.'
      : `${host ? host.name : 'The host'} is the host: they pick the mission and start it.`;
    $('lobby-players').innerHTML = solo || !L ? `<li style="color:${profile.paint || '#c4683a'}">${escapeHtml(nameBox.value || 'You')} <small>(you)</small></li>`
      : L.players.map(p => `<li style="color:${p.color}"${p.away ? ' class="away"' : ''}>${p.host ? '<span class="crown" title="host">HOST</span> ' : ''}${escapeHtml(p.name)}${p.id === myId || p.away ? ` <small>${[p.id === myId && 'you', p.away && 'coming back…'].filter(Boolean).join(' · ')}</small>` : ''}</li>`).join('');
    $('room-count').textContent = solo ? '' : L ? `${L.players.length}/${L.max || maxPlayers}` : '';
    const start = $('lobby-start');
    start.disabled = !canPick || (!solo && L?.phase === 'game') || !lobbyUI.ready();
    start.textContent = solo ? 'START MISSION' : L?.phase === 'game' ? 'MISSION RUNNING…' : isHost ? 'START MISSION' : `WAITING FOR ${host ? host.name.toUpperCase() : 'THE HOST'}…`;
    $('room-back').textContent = solo ? '‹ MENU' : '‹ LEAVE GAME';
  }

  // ----- buttons
  const startSolo = () => { saveName(); me.name = nameBox.value || 'You'; lobby.hidden = true; applyKit(me, profileKit()); startMission(chosen, { ship: profile.ship, easy, custom: lobbyUI.custom }); };
  $('menu-solo').onclick = () => { saveName(); solo = true; easy = storedEasy(); showEasy(); lastLobby = null; show('room'); markChosen(); };
  $('menu-open').onclick = () => { saveName(); hello(); easy = storedEasy(); sendWs({ t: 'open', mission: chosen, easy, custom: lobbyUI.custom }); };
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
  }, 4000);                                                           // (generous: a busy page — software WebGL — handles the open event late)
  let autostart = q.has('autostart');
  ws.onopen = () => {
    clearTimeout(fail); netState = 'online'; hello();
    if (rejoin) sendWs({ t: 'join', game: rejoin.game, ticket: rejoin.ticket });
    else if (autostart) sendWs({ t: 'open', mission: chosen, easy, custom: lobbyUI.custom });           // dev: open a game and start it right away
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
      const h = m.players?.find(p => p.host);                             // the host's ship flies (their upgrades; a guest's shipyard shows it, with their unspent reputation)
      lobbyUI.flight = isHost ? { host: true } : { name: h ? h.name : 'The host', ship: m.hostShip || {}, rep: m.hostRep };
      if (m.custom) lobbyUI.custom = customConfig(m.custom);
      chosen = m.mission; lobbyUI.union = m.unlocked || null; markChosen();
      easy = m.easy || 0; showEasy();
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

  // every frame while in a game: predict yourself, smooth the rest, browser-side update, send input
  function netFrame(dt) {
    netBetween(dt);
    clientUpdate(dt);
    netLocalPrompt();
    const m = localInput.mouse, seq = netRemember();
    if (ws.readyState === 1) ws.send(JSON.stringify({
      t: 'input', seq, keys: debugOpen ? [] : [...localInput.keys], pressed: [...localInput.pressed],
      mouse: { wx: m.wx, wy: m.wy, down: m.down && !m.suppress, right: m.right, click: m.click, rightClick: m.rightClick, moved: m.moved, look: m.look },
    }));
    localInput.pressed.clear(); m.click = false; m.rightClick = false; m.moved = 0; m.look = 0;
  }
}
// ---------------------------------------------------------------------------
// Latency hiding. Your own crew member moves right away on your keys, using the same movement code as
// the server. Every input carries a number (seq) and the server sends back the last one it used, so your
// browser compares the server's position with where it had you when it sent that input (netHist), not
// with where you are now: a round trip of walking (half a metre and more over the internet) is no error,
// only a real difference is (a door, a push, a teleport), and that one glides away (or snaps, if big).
// The cannon you're manning aims from your mouse locally, and your "E: …" prompt comes from where you
// see yourself (netLocalPrompt). Everyone else, intruders and pirates glide towards their latest server
// position; shells, shots, bolts, sparks and asteroids fly on between snapshots (30 a second) on their
// own velocity, the sim clock runs on smoothly, and the power lever's handle swings here, every frame.
// ---------------------------------------------------------------------------
const canPredict = (c) => (c.mode === 'inside' || c.mode === 'eva') && (c.health || 'ok') !== 'down' && c.health !== 'out';
const PREDICT_SNAP = 1.5, PREDICT_DRIFT = 0.6, NET_COAST = 0.12;   // (coast: how long things fly on without news)
let netSeq = 0, netHist = [], netErr = null, netLive = false, netSrvTime = 0, netSince = 0;
// your positions per input sent (the last ~4 s), and what the server still sees differently
function netRemember() {
  const seq = ++netSeq;
  if (canPredict(me) && me.nx !== undefined) { netHist.push({ seq, x: me.x, y: me.y }); if (netHist.length > 240) netHist.shift(); }
  else netForget();
  return seq;
}
function netForget() { netHist.length = 0; netErr = null; }
function netReconcile(x, y, seq) {
  if (seq == null) return false;
  while (netHist.length && netHist[0].seq < seq) netHist.shift();
  const h = netHist[0];
  if (!h || h.seq !== seq) { netErr = null; return false; }    // (no record of that input: the plain glide in netPredict)
  netErr = [x - h.x, y - h.y];
  return true;
}
// the sim clock: the server's time from each snapshot, running on smoothly in between
function netClockSync(t) {
  if (!(Math.abs(time - t) < 0.3)) time = t;          // (the first snapshot, or way off: jump)
  netSrvTime = t; netSince = 0;
}
function netBetween(dt) {
  netSince += dt;
  const target = netSrvTime + Math.min(netSince, NET_COAST);
  time += Math.max(0, dt + (target - time) * Math.min(1, 6 * dt));
  if (netSince <= NET_COAST) {                         // fly on until the next snapshot (each one starts them over)
    for (const s of combat.shells) { s.x += s.vx * dt; s.y += s.vy * dt; }
    for (const s of combat.shots) { s.x += s.vx * dt; s.y += s.vy * dt; }
    for (const b of boarding.bolts) { if (b.vx) { b.x += b.vx * dt; b.y += b.vy * dt; } }
    for (const a of combat.asteroids) { a.x += a.vx * dt; a.y += a.vy * dt; a.rot += (a.vr || 0) * dt; }
    for (const p of combat.fx) { if (p.vx) { p.x += p.vx * dt; p.y += p.vy * dt; } p.life = Math.max(0, p.life - dt); }
    for (const b of power.bolts) b.t += dt / BOLT_TIME;
  }
  animateLever(dt);
  netPredict(dt);
  netGlide(dt, boarding.invaders); netGlide(dt, dk.pirates || []);
}
// intruders and pirates: shown where they were last frame, gliding to where the server has them
const netGlideAt = new Map();                          // uid → [x, y] last shown
function netGlideFrom(list) {
  for (const a of list) {
    a.nx = a.x; a.ny = a.y;
    const p = a.uid != null && netGlideAt.get(a.uid);
    if (p && Math.hypot(p[0] - a.x, p[1] - a.y) < 1.5) { a.x = p[0]; a.y = p[1]; }
  }
}
function netGlide(dt, list) {
  const k = 1 - Math.exp(-25 * dt);
  for (const a of list) {
    if (a.nx === undefined) continue;
    a.x = lerp(a.x, a.nx, k); a.y = lerp(a.y, a.ny, k);
    if (a.uid != null) netGlideAt.set(a.uid, [a.x, a.y]);
  }
  if (netGlideAt.size > 64) netGlideAt.clear();
}
// Your own "E: …" prompt and E ring from where this screen has you (the server works it out from where it
// has you, which lags while you walk). Only that suggestion: what you stand next to (ladders, buttons,
// airlocks) and the screen prompts stay the server's.
function netLocalPrompt() {
  const p = me.prompt;
  if (!canPredict(me) || me.ui.panel || mission.over || localInput.mouse.down || debugOpen || (p && !p.e)) return;
  const e = withCrew(me, () => nearbyTarget(localInput.keys.has('KeyE')));
  me.prompt = e ? ePromptOf(e) : null;
  if (p?.rep) me.prompt = me.prompt ? { ...me.prompt, text: `${me.prompt.text}  ·  ${p.rep}`, rep: p.rep } : p;   // (the server's repair hint: Space / right click)
}
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
    const m = localInput.mouse;                       // look at the mouse after moving it / firing with it (as updatePlayer)
    if (!blocked && (m.look || ((m.right || m.rightClick) && me.inv.weapon))) me.lookT = LOOK_TIME;
    updateCrew(me, dt, ix, iy);                        // move now, don't wait for the server
    if (netErr) {                                      // the server's word on an input you sent: glide off the difference
      const e = Math.hypot(netErr[0], netErr[1]), kc = e > PREDICT_SNAP ? 1 : e > 0.02 ? 1 - Math.exp(-10 * dt) : 0;
      const sx = netErr[0] * kc, sy = netErr[1] * kc;
      c.x += sx; c.y += sy; netErr[0] -= sx; netErr[1] -= sy;
      for (const h of netHist) { h.x += sx; h.y += sy; }
      continue;
    }
    const err = Math.hypot(c.nx - c.x, c.ny - c.y);
    if (err > PREDICT_SNAP) { c.x = c.nx; c.y = c.ny; }                       // way off (pushed, teleported): snap
    else if (!(ix || iy) || err > PREDICT_DRIFT) {                            // resting or drifting: glide back
      const kc = 1 - Math.exp(-8 * dt); c.x = lerp(c.x, c.nx, kc); c.y = lerp(c.y, c.ny, kc);
    }
  }
  if (me.mode === 'gun' && me.gun && standing(me) && !debugOpen && !me.ui.panel) {   // aim the cannon you're on locally, same rule as the server
    const g = me.gun, m = localInput.mouse, ik = localInput.keys, k = (...codes) => (codes.some(x => ik.has(x)) ? 1 : 0);
    const kx = clamp(k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft'), -1, 1), ky = clamp(k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp'), -1, 1);
    if (m.look) me.gunKeys = false;                  // key mode until the mouse really moves (as updatePlayer)
    if (kx || ky) me.gunKeys = true;
    if (m.moved && !me.gunKeys) g.aim = Math.atan2(m.wy - g.y, m.wx - g.x);
    g.aim = gunKeyTurn(g, kx, ky, dt);
    me.face = g.aim;
  } else if (me.mode !== 'gun') me.gunKeys = false;  // (climbed in again: back to the mouse)
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
