// Station mini-games: radar dish, oscilloscope, patch board, tape job, cannon crank,
// held shields, the jump handle, heartbeat treatment. Run: node tests/minigames.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'mission', 'startMission', 'withCrew', 'ui', 'inv', 'time', 'runCommand', 'openRadar', 'openScope',
  'power', 'CAPACITORS', 'SYSTEMS', 'GUNS', 'combat', 'reloadCannon', 'SHIELD_BUTTONS', 'JUMP_HANDLE', 'JUMP_PULL', 'hurtCrew', 'netServer', 'evs', 'enc'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const cmd = (G, c) => G.withCrew(G.me, () => G.runCommand(c));

// --- radar dish: only the sector it points at
{
  const G = loadGame(NAMES); G.startMission('intro');
  const ev = G.mission.events.find(e => e.kind === 'interceptor');
  G.mission.t = ev.t - 20;
  G.withCrew(G.me, () => G.openRadar());
  const away = ev.side === 'port' ? 0 : Math.PI;            // point it the wrong way first
  cmd(G, ['mini', 'dish', away]); cmd(G, ['mini', 'ping']);
  check(!G.mission.revealed.has(ev.id), 'pinging the wrong direction finds nothing there');
  cmd(G, ['mini', 'ping']);
  check(G.me.ui.mini.cd > 1.9, 'pings have a 2 s cooldown');
  tickN(G, 130);
  cmd(G, ['mini', 'dish', ev.side === 'port' ? Math.PI : 0]); cmd(G, ['mini', 'ping']);
  check(G.mission.revealed.has(ev.id) && G.me.ui.mini.blips.some(b => b.kind === 'interceptor'), `pointing ${ev.side === 'port' ? 'left' : 'right'} finds the interceptor (an echo blip)`);
}
// --- oscilloscope
{
  const G = loadGame(NAMES); G.startMission('intro');
  G.withCrew(G.me, () => G.openScope());
  const m = G.me.ui.mini;
  check(!m.ok && !G.mission.diagRun, 'the diagnosis needs the scope calibrated first');
  for (let k = 0; k < 2; k++) while (m.dial[k] !== m.ref[k]) cmd(G, ['mini', 'dial', k, Math.sign(m.ref[k] - m.dial[k])]);
  check(m.ok && G.mission.diagRun, 'matching both dials calibrates it and shows the readings');
}
// --- patch board
{
  const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false;
  G.CAPACITORS.forEach(c => { c.charge = 0; }); G.power.lever.pos = 1; G.power.lever.jammed = true; G.power.reactor.t = 19.9;
  G.withCrew(G.me, () => { G.ui.panel = 'mini'; G.ui.mini = { kind: 'patch', pick: null }; });
  cmd(G, ['mini', 'patch', 'out', 1]); cmd(G, ['mini', 'patch', 'cap', 0]);
  tickN(G, 90);
  check(G.CAPACITORS[0].charge === 1 && G.CAPACITORS[1].charge === 0, 'rerouting MID to the left capacitor: the energy goes there');
}
// --- tape job
{
  const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false;
  const s = G.SYSTEMS.find(s => s.kind === 'capacitor'); s.broken = true;
  const me = G.me; me.x = s.x; me.y = s.y - 1; G.withCrew(me, () => { G.inv.weapon = 'repair'; });
  const m = me.input.mouse; m.wx = s.x; m.wy = s.y; m.down = true; tickN(G, 6); m.down = false; tickN(G, 2);
  check(me.ui.mini?.kind === 'tape', 'a quick click with the repair kit on a broken part opens the tape job');
  for (let i = 0; i < 3; i++) cmd(G, ['mini', 'taped', i]);
  check(!s.broken && s.taped, 'taping all three cracks fixes it (marked as taped)');
}
// --- crank
{
  const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false;
  const g = G.GUNS[0], me = G.me; me.mode = 'gun'; me.gun = g; g.shots = 0; G.CAPACITORS[1].charge = 2;
  G.reloadCannon(g);
  let t = 0; while (g.reload > 0 && t < 5) { cmd(G, ['mini', 'crank', 1.2]); tickN(G, 6); t += 0.1; }
  check(g.shots === 3 && t < 1.5, `cranking the breech reloads much faster than 3 s (${t.toFixed(1)} s)`);
}
// --- held shields
{
  const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false;
  const b = G.SHIELD_BUTTONS.find(b => b.side === 'port'), me = G.me; G.CAPACITORS[0].charge = 3;
  me.x = b.x; me.y = b.y + 0.8; tickN(G, 2);
  const m = me.input.mouse; m.wx = b.x; m.wy = b.y; m.click = true; m.down = true;
  let up = 0; tickN(G, 60 * 6, () => { if (G.combat.shields.port.up > 0) up += DT; });
  m.down = false;
  check(up > 3.8 && G.CAPACITORS[0].charge === 1, `holding the button keeps the shield up 2 s longer for 1 more energy (${up.toFixed(1)} s)`);
}
// --- jump handle (harder missions)
{
  const G = loadGame(NAMES); G.startMission('deep'); G.evs.coils.forEach(c => { c.ok = true; });
  G.mission.events.forEach(e => { e.done = true; });
  G.CAPACITORS[1].charge = 2; G.mission.t = G.mission.jumpAt + 0.1; tickN(G, 60 * 3);
  check(!G.mission.over, 'with the handle rule the drive waits for someone to pull the handle');
  const me = G.me; me.x = G.JUMP_HANDLE.x + 0.9; me.y = G.JUMP_HANDLE.y + 0.8; me.health = 'ok';
  const m = me.input.mouse; m.wx = G.JUMP_HANDLE.x; m.wy = G.JUMP_HANDLE.y; m.down = true;
  let t = 0; while (!G.mission.over && t < 10) { G.simTick(DT); t += DT; }
  check(G.mission.over?.won && Math.abs(t - G.JUMP_PULL) < 0.3, `holding the jump handle for ${G.JUMP_PULL} s jumps (${t.toFixed(1)} s)`);
}
// --- heartbeat treatment
{
  const G = loadGame(NAMES); G.netServer.init('intro'); G.mission.active = false;
  G.netServer.addCrew(1, 'A'); G.netServer.addCrew(2, 'B');
  const [A, B] = G.crew; B.x = A.x + 1; B.y = A.y; G.hurtCrew(B); G.hurtCrew(B);
  let t = 0, clicked = 0;
  while (B.health === 'down' && t < 5) {
    const tt = A.treat?.t || 0, onBeat = A.treat && tt > 0.3 && Math.abs(((tt + 0.4) % 0.8) - 0.4) < 0.05 && clicked < 3;
    G.netServer.input(1, { keys: [], pressed: [], mouse: { wx: B.x, wy: B.y, down: true, click: !!onBeat } });
    if (onBeat) clicked++;
    G.simTick(DT); t += DT;
  }
  check(B.health === 'hurt' && t < 1.6, `clicking on the heartbeat treats faster than 2 s (${t.toFixed(2)} s)`);
}
process.exitCode = failed ? 1 : 0;
