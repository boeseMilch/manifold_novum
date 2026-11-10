// Station mini-games: radar and helm (just a click now), patch board, cannon reload,
// shields (holding the button adds nothing), the jump handle, heartbeat treatment, panels of the downed. Run: node tests/minigames.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'crew', 'mission', 'startMission', 'withCrew', 'ui', 'inv', 'time', 'runCommand', 'clickTarget',
  'power', 'CAPACITORS', 'SYSTEMS', 'GUNS', 'combat', 'reloadCannon', 'SHIELD_BUTTONS', 'JUMP_HANDLE', 'JUMP_PULL', 'workProgress', 'hurtCrew', 'netServer', 'evs', 'enc', 'STATIONS'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const cmd = (G, c) => G.withCrew(G.me, () => G.runCommand(c));

// --- radar and helm: one click, no mini-game
{
  const G = loadGame(NAMES); G.startMission('c1');
  const ev = G.mission.events.find(e => e.kind === 'interceptor');
  G.mission.t = ev.t - 20;
  const me = G.me; me.x = 22.2; me.y = 7.4; G.simTick(DT);
  const r = G.withCrew(me, () => G.clickTarget(22.2, 6.4));
  check(r?.ok && /radar/i.test(r.text), `the radar is a plain click ("${r?.text}")`);
  G.withCrew(me, () => r.run());
  check(G.mission.revealed.has(ev.id) && !me.ui.panel && !me.ui.mini, 'one click scans every direction (the interceptor shows up), no panel opens');
  const H = G.STATIONS.find(s => s.name === 'Helm'); me.x = H.x; me.y = H.y + 1.3; G.simTick(DT);
  const h = G.withCrew(me, () => G.clickTarget(H.x, H.y + 0.5));
  G.withCrew(me, () => h.run());
  check(me.ui.panel === 'diagnosis' && !me.ui.mini && G.mission.diagRun, 'one click on the helm shows the diagnosis readings right away');
}
// --- patch board
{
  const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false;
  G.CAPACITORS.forEach(c => { c.charge = 0; }); G.power.lever.pos = 1; G.power.lever.jammed = true; G.power.reactor.t = 19.9;
  G.withCrew(G.me, () => { G.ui.panel = 'mini'; G.ui.mini = { kind: 'patch', pick: null }; });
  cmd(G, ['mini', 'patch', 'out', 1]); cmd(G, ['mini', 'patch', 'cap', 0]);
  tickN(G, 90);
  check(G.CAPACITORS[0].charge === 1 && G.CAPACITORS[1].charge === 0, 'rerouting MID to the left capacitor: the energy goes there');
}
// --- no tape job: a quick click with the repair kit on a broken part opens nothing and doesn't fix it
{
  const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false;
  const s = G.SYSTEMS.find(s => s.kind === 'capacitor'); s.broken = true;
  const me = G.me; me.x = s.x; me.y = s.y - 1; G.withCrew(me, () => { G.inv.weapon = 'repair'; });
  const m = me.input.mouse; m.wx = s.x; m.wy = s.y; m.down = true; tickN(G, 6); m.down = false; tickN(G, 2);
  check(!me.ui.mini && s.broken, 'a quick click with the repair kit opens no tape job and leaves the part broken (only the full repair fixes it)');
}
// --- reload: R only (holding R or cranking doesn't speed it up); a weapons specialist reloads 50% faster
{
  const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false;
  const g = G.GUNS[0], me = G.me; me.mode = 'gun'; me.gun = g; g.shots = 0; G.CAPACITORS[1].charge = 2;
  G.reloadCannon(g);
  let t = 0; while (g.reload > 0 && t < 5) { me.input.keys.add('KeyR'); tickN(G, 6); t += 0.1; }
  me.input.keys.delete('KeyR');
  check(g.shots === 3 && t > 2.8 && t < 3.3, `holding R doesn't speed the reload up: ${t.toFixed(1)} s`);
  g.shots = 0; me.kit = { ...(me.kit || {}), profession: 'weapons' }; G.reloadCannon(g);
  t = 0; while (g.reload > 0 && t < 5) { tickN(G, 6); t += 0.1; }
  check(g.shots === 3 && t > 1.8 && t < 2.2, `a weapons specialist in the seat reloads 50% faster: ${t.toFixed(1)} s`);
}
// --- shields: up 15 s for 1 energy (holding the button doesn't extend it), then 5 s recharge
{
  const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false;
  const b = G.SHIELD_BUTTONS.find(b => b.side === 'port'), me = G.me; G.CAPACITORS[0].charge = 3;
  me.x = b.x; me.y = b.y + 0.8; tickN(G, 2);
  const m = me.input.mouse; m.wx = b.x; m.wy = b.y; m.click = true; m.down = true;
  let up = 0, down = 0; tickN(G, 60 * 22, () => { const s = G.combat.shields.port; if (s.up > 0) up += DT; else if (s.cd > 0) down += DT; });
  m.down = false;
  check(Math.abs(up - 15) < 0.2 && Math.abs(down - 5) < 0.2 && G.CAPACITORS[0].charge === 2, `shield up 15 s, recharging 5 s, 1 energy (${up.toFixed(1)} s / ${down.toFixed(1)} s)`);
}
// --- jump handle (harder missions)
{
  const G = loadGame(NAMES); G.startMission('c7'); G.evs.coils.forEach(c => { c.ok = true; });
  G.mission.events.forEach(e => { e.done = true; });
  G.CAPACITORS[1].charge = 2; G.mission.t = G.mission.jumpAt + 0.1; tickN(G, 60 * 3);
  check(!G.mission.over, 'with the handle rule the drive waits for someone to pull the handle');
  const me = G.me; me.x = G.JUMP_HANDLE.x + 0.9; me.y = G.JUMP_HANDLE.y + 0.8; me.health = 'ok';
  const m = me.input.mouse; m.wx = G.JUMP_HANDLE.x; m.wy = G.JUMP_HANDLE.y; m.down = true;
  let t = 0, mid = null; while (!G.mission.over && t < 10) { G.simTick(DT); t += DT; if (mid === null && t >= G.JUMP_PULL / 2) mid = G.workProgress(me); }
  check(mid && Math.abs(mid.k - 0.5) < 0.1, `the work bar fills while you pull the handle (${mid ? Math.round(mid.k * 100) : '?'}% halfway)`);
  check(G.mission.over?.won && Math.abs(t - G.JUMP_PULL) < 0.3, `holding the jump handle for ${G.JUMP_PULL} s jumps (${t.toFixed(1)} s)`);
}
// --- heartbeat treatment
{
  const G = loadGame(NAMES); G.netServer.init('c1'); G.mission.active = false;
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
// --- down or out: the open panel falls shut and its commands do nothing (2026-11-10: someone out cold kept typing the
// vent's PIN and vented the room; ['lock', i] worked from the floor, and without the security console open)
{
  const G = loadGame([...NAMES, 'VENT_PANELS', 'hz', 'lockables']);
  G.netServer.init('c7'); G.netServer.addCrew(1, 'A'); G.netServer.addCrew(2, 'B');
  G.mission.events.forEach(e => { e.done = true; });
  const [A, B] = G.crew, [px, py] = G.VENT_PANELS.portLock;
  A.mode = 'inside'; A.x = px + 0.6; A.y = py - 0.8; tickN(G, 5);
  G.withCrew(A, () => G.clickTarget(px, py).run());
  const pin = A.ui.mini.pin;
  G.netServer.command(1, ['mini', 'pin', 'key', +pin[0]]);
  check(A.ui.panel === 'mini' && A.ui.mini.typed === pin[0], 'on your feet the vent\'s PIN pad takes keys');
  G.hurtCrew(A, 3);
  for (const d of pin.slice(1)) G.netServer.command(1, ['mini', 'pin', 'key', +d]);
  G.netServer.command(1, ['mini', 'pin', 'ok']);
  check(A.ui.mini.typed === pin[0] && !A.ui.mini.flash, 'out cold: the keys and OK do nothing');
  tickN(G, 90);
  check(!A.ui.panel && !A.ui.mini && !G.hz.vent, `…the pad falls shut and the room is not vented (panel ${A.ui.panel}, vent ${!!G.hz.vent})`);
  // the security console: B locks a door at it; not without the console open, not from the floor
  const locked = () => G.lockables().map(l => l.ref.locked ? 1 : 0).join('');
  const was = locked();
  G.netServer.command(2, ['lock', 0]);
  check(locked() === was, '[\'lock\'] without the security console open does nothing');
  B.ui.panel = 'security'; G.netServer.command(2, ['lock', 0]);
  const now = locked();
  check(now !== was, 'at the open console it locks the door');
  B.health = 'down'; G.netServer.command(2, ['lock', 0]);
  check(locked() === now, 'down: the console\'s buttons do nothing');
  tickN(G, 2);
  check(!B.ui.panel, '…and the console closes');
  // the patch board the same
  B.health = 'ok'; B.ui.panel = 'mini'; B.ui.mini = { kind: 'patch', pick: null }; B.health = 'out';
  G.netServer.command(2, ['mini', 'patch', 'out', 1]); G.netServer.command(2, ['mini', 'patch', 'cap', 0]);
  check(G.power.patch.join('') === '012', `out cold at the patch board: nothing is rerouted (${G.power.patch.join('')})`);
}
process.exitCode = failed ? 1 : 0;
