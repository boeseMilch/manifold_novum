// Practice mode: a free-play ship and a panel that starts any encounter, damage type or mini-game,
// switches the harder rules on, and has handy tools (fill energy, repair all, clear, give items,
// teleport). The panel is the browser's; each button sends ['practice', index], run by the simulation.

const nearestSys = () => SYSTEMS.filter(s => !s.outside).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0];
const roomHere = () => roomAt(player.x, player.y) || ROOMS[0];
const toRoom = (id) => { player.mode = 'inside'; player.gun = null; [player.x, player.y] = NAV_SPOTS[id]; };
const give = (kind) => { grab(kind); };
const toggleRule = (r) => { mission.rules[r] = !mission.rules[r]; combatBanner(`Rule "${r}" ${mission.rules[r] ? 'on' : 'off'}`); };
const PRACTICE = [
  // enemies
  ['Enemies', 'Interceptor (left)', () => combatSpawn('interceptor', 'port', true)],
  ['Enemies', 'Frigate (right)', () => combatSpawn('frigate', 'star', true)],
  ['Enemies', 'Asteroid swarm (front)', () => combatSpawn('swarm')],
  ['Enemies', 'Stealth fighter (left)', () => combatSpawn('stealth', 'port', true)],
  ['Enemies', 'Tractor tug (right)', () => combatSpawn('tractor', 'star', true)],
  ['Enemies', 'Pirate raider (left)', () => combatSpawn('pirate', 'port', true)],
  ['Enemies', 'Intruder (left airlock)', () => spawnInvader('port')],
  ['Enemies', 'Saboteur (left airlock)', () => spawnSaboteur('port')],
  ['Organic', 'Grappler (left)', () => combatSpawn('grappler', 'port', true)],
  ['Organic', 'Spore mother (right)', () => combatSpawn('mother', 'star', true)],
  ['Organic', 'Leech swarm (right)', () => spawnLeeches('star')],
  ['Organic', 'Leviathan', () => startLeviathan()],
  // outside
  ['Spacewalk jobs', 'Mine drone (left)', () => spawnMineDrone('port')],
  ['Spacewalk jobs', 'Spore clouds → barnacles (right)', () => spawnSpores('star')],
  ['Spacewalk jobs', 'Debris in the left cannon track', () => jamCannon('port')],
  ['Spacewalk jobs', 'Knock the radar antenna crooked', () => knockAntenna()],
  ['Spacewalk jobs', 'Fuel canister drifting past (left)', () => spawnCanister('port')],
  ['Spacewalk jobs', 'Misalign the jump coils', () => { evs.coils = COIL_SPOTS.map(c => ({ ...c, ok: false, a: 1 })); }],
  ['Spacewalk jobs', 'Break the left shield emitter (outside)', () => breakSystem(SYSTEMS.find(s => s.ref === SHIELD_EMITTERS[0]))],
  // damage
  ['Damage', 'Hull breach (this room, or the nearest)', () => { mission.rules.breach = true; const r = roomHere(); breachRoom(BREACH_SPOTS[r.id] ? r.id : 'portLock'); }],
  ['Damage', 'Fire at the nearest part', () => igniteSystem(nearestSys())],
  ['Damage', 'Plasma fire (left airlock room)', () => { const s = SYSTEMS.find(s => s.ref === CAPACITORS[0]); if (!burning(s)) igniteSystem(s, true); }],
  ['Damage', 'Power surge (this column)', () => surgeColumn(roomHere().col)],
  ['Damage', 'Gravity failure (this room)', () => failGravity(roomHere().id)],
  ['Damage', 'Break the nearest part', () => breakSystem(nearestSys())],
  // ship-wide
  ['Ship-wide', 'Solar flare', () => startFlare()],
  ['Ship-wide', 'Ion storm', () => startStorm()],
  ['Ship-wide', 'Coolant leak', () => startCoolantLeak()],
  ['Ship-wide', 'AI glitch', () => startGlitch()],
  // ships
  ['Other ships', 'Pirates dock (left)', () => { dk.dock = null; dockShip('pirate', 'port'); }],
  ['Other ships', 'Derelict + black box (right)', () => { dk.dock = null; dockShip('derelict', 'star', { blackbox: true }); }],
  ['Other ships', 'Derelict + engineer (right)', () => { dk.dock = null; dockShip('derelict', 'star', { npc: true, alien: false }); }],
  ['Other ships', 'Cast off the docked ship', () => undock()],
  ['Other ships', 'Ore asteroid + drill', () => { EVENT_RUNNERS.rock(); give('drill'); }],
  // mini-games
  ['Stations', 'Radar scan', () => radarScan()],
  ['Stations', 'Helm diagnosis', () => openDiagnosis()],
  ['Mini-games', 'Patch board (arcs the left feed line)', () => { if (!surging('feed0')) hz.surges.push('feed0'); openPatch(); }],
  ['Mini-games', 'Tape job (breaks the nearest part)', () => { const s = nearestSys(); s.broken = true; inv.weapon = 'repair'; openTape(s); }],
  ['Mini-games', 'Crank a reload (front cannon, empty)', () => { const g = GUNS.find(g => g.id === 'front'); g.shots = 0; CAPACITORS[1].charge = Math.max(1, CAPACITORS[1].charge); player.mode = 'gun'; player.gun = g; reloadCannon(g); }],
  ['Mini-games', 'Jump handle (spool the drive now)', () => { mission.rules.handle = true; mission.jumpAt = mission.t; mission.coilsChecked = true; CAPACITORS[1].charge = Math.max(1, CAPACITORS[1].charge); }],
  ['Mini-games', 'Get hurt (try treating, snacks, coffee)', () => hurtCrew(player)],
  // rules
  ['Rules', 'Toggle hull breaches', () => toggleRule('breach')],
  ['Rules', 'Toggle power surges', () => toggleRule('surge')],
  ['Rules', 'Toggle gravity failures', () => toggleRule('gravity')],
  ['Rules', 'Toggle plasma fires', () => toggleRule('plasma')],
  // tools
  ['Tools', 'Fill all capacitors', () => CAPACITORS.forEach(c => { c.charge = CAP_MAX; })],
  ['Tools', 'Repair everything, put out fires', () => { SYSTEMS.forEach(s => { s.broken = false; }); fires.length = 0; hz.breaches = []; hz.surges = []; hz.noGrav = []; hz.hull = { port: 0, front: 0, star: 0 }; }],
  ['Tools', 'Clear all threats', () => { combatClear(); boarding.invaders = []; boarding.bolts = []; resetEva({}); resetEncounters(); resetOrganic(); dk.pirates = []; dk.rock = null; }],
  ['Tools', 'Heal me', () => { player.health = 'ok'; player.hurtT = 0; }],
  ['Tools', 'Give: repair kit', () => give('repair')],
  ['Tools', 'Give: laser gun', () => give('laser')],
  ['Tools', 'Give: heavy blaster', () => give('heavy')],
  ['Tools', 'Overcharge the reactor', () => { power.overcharge = true; }],
  ['Tools', 'Give: extinguisher', () => give('extinguisher')],
  ['Tools', 'Give: hull plate', () => give('plate')],
  ['Tools', 'Go outside (left airlock)', () => { const h = HATCHES[0]; player.mode = 'eva'; player.gun = null; [player.x, player.y] = h.outside; }],
  ...ROOMS.map(r => ['Teleport', r.name, () => toRoom(r.id)]),
];
function runPractice(i) {
  if (!MISSIONS[mission.id]?.practice) return;     // only in practice mode
  PRACTICE[i]?.[2]();
}

// ---------------------------------------------------------------------------
// The panel (browser only): a column of buttons on the right; P or the button toggles it.
// ---------------------------------------------------------------------------
const practiceUI = { built: false, open: false };
function practiceClient() {
  if (typeof document === 'undefined' || !document.body || !MISSIONS[mission.id]?.practice || !mission.active) return;
  if (!practiceUI.built) {
    practiceUI.built = true;
    const btn = document.createElement('button'); btn.id = 'practice-btn'; btn.textContent = 'PRACTICE (P)';
    const panel = document.createElement('div'); panel.id = 'practice'; panel.hidden = true;
    let html = '', group = '';
    PRACTICE.forEach(([g, label], i) => { if (g !== group) { html += `${group ? '</div>' : ''}<h4>${g}</h4><div class="grp">`; group = g; } html += `<button data-i="${i}">${label}</button>`; });
    panel.innerHTML = html + '</div>';
    document.body.append(btn, panel);
    btn.onclick = () => { practiceUI.open = !practiceUI.open; panel.hidden = !practiceUI.open; };
    panel.querySelectorAll('button').forEach(b => b.onclick = () => sendCommand(['practice', +b.dataset.i]));
    btn.addEventListener('mousedown', e => e.stopPropagation()); panel.addEventListener('mousedown', e => e.stopPropagation());
    practiceUI.panel = panel;
  }
  if (localInput.pressed.has('KeyP')) { practiceUI.open = !practiceUI.open; practiceUI.panel.hidden = !practiceUI.open; }
}
