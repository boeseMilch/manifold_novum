// End to end over the network: real server, WebSocket clients (Node's built-in client).
// Lobby → pick mission → start → snapshots with both crew → input moves you → commands work →
// a browser-side copy applies a snapshot and renders it → late join / leave. Run: node tests/network.js
const { spawn } = require('child_process');
const path = require('path');
const { loadGame } = require('./harness');
const PORT = 8000 + Math.floor(Math.random() * 900);
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, name, id: null, lobby: null, state: null, started: false, sfx: 0 };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'welcome') c.id = m.id;
    if (m.t === 'lobby') c.lobby = m;
    if (m.t === 'start') c.started = m.mission;
    if (m.t === 'state') { c.state = m.s; c.you = m.you; c.sfx += m.sfx.length; }
  };
  c.send = (o) => ws.send(JSON.stringify(o));
  c.open = new Promise(r => { ws.onopen = () => { c.send({ t: 'hello', name }); r(); }; });
  return c;
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.on('data', d => { if (String(d).includes('port')) r(); }));
  try {
    const a = client('Alice'), b = client('Bob');
    await Promise.all([a.open, b.open]); await sleep(200);
    check(a.lobby?.players.length === 2 && a.lobby.players.some(p => p.name === 'Bob'), `both land in the lobby (${a.lobby?.players.map(p => p.name)})`);
    a.send({ t: 'mission', id: 'rush' }); await sleep(100);
    check(b.lobby?.mission === 'rush', 'picking a mission shows up for everyone');
    b.send({ t: 'start' }); await sleep(400);
    check(a.started === 'rush' && b.started === 'rush', 'anyone can start: both are in the game');
    check(a.state && a.state.crew.length === 2, `snapshots arrive with both crew members (${a.state?.crew.map(c => c.name)})`);
    check(a.state.mission.id === 'rush' && a.state.mission.events.length === 7, `the rush mission has 7 incidents (${a.state.mission.events.map(e => e.kind).join(', ')})`);
    const x0 = a.state.crew.find(c => c.id === a.id).x;
    for (let i = 0; i < 30; i++) { a.send({ t: 'input', keys: ['KeyD'], pressed: [], mouse: { wx: 0, wy: 0 } }); await sleep(16); }
    a.send({ t: 'input', keys: [], pressed: [], mouse: { wx: 0, wy: 0 } }); await sleep(150);
    const x1 = a.state.crew.find(c => c.id === a.id).x, bx = b.state.crew.find(c => c.id === a.id).x;
    check(x1 > x0 + 1, `holding D moves Alice on the server (${x0.toFixed(1)} → ${x1.toFixed(1)})`);
    check(Math.abs(bx - x1) < 0.5, 'Bob sees Alice where she is');
    b.send({ t: 'cmd', cmd: ['debug', 'e'] }); await sleep(150);
    check(a.state.caps.every(([ch]) => ch === 3), 'commands (debug: fill capacitors) are run by the server for everyone');
    b.send({ t: 'cmd', cmd: ['debug', '1'] }); b.send({ t: 'cmd', cmd: ['debug', 'p'] }); await sleep(300);   // spawn an enemy, raise a shield (makes a sound)
    check(a.state.combat.enemies.length >= 1 && a.sfx > 0, `an enemy spawned and sounds are sent along (${a.sfx} sound events)`);
    // a browser-side copy can apply a real snapshot and draw it
    const G = loadGame(['netApply', 'render', 'crew', 'me', 'combat']);
    G.netApply(a.state, a.id);
    let drew = true; try { G.render(1); } catch (e) { drew = e.message; }
    check(G.crew.length === 2 && G.me.id === a.id && G.combat.enemies.length >= 1 && drew === true, `a browser applies the snapshot and renders it (${drew})`);
    // latency hiding: with no new snapshots arriving, your own crew member still moves on your keys…
    const P = loadGame(['netApply', 'netPredict', 'crew', 'me', 'localInput', 'clientUpdate']);
    P.netApply(a.state, a.id); P.me.x = P.me.nx; P.me.y = P.me.ny;   // start exactly where the server has you
    const px0 = P.me.x;
    P.localInput.keys.add('KeyA');
    for (let i = 0; i < 8; i++) P.netPredict(1 / 60);
    check(P.me.x < px0 - 0.15, `your own movement shows instantly, before the server answers (${px0.toFixed(2)} → ${P.me.x.toFixed(2)} in 0.13 s)`);
    // …and when you stop, you settle onto where the server says you are
    P.localInput.keys.delete('KeyA');
    const snap = JSON.parse(JSON.stringify(a.state)); const mine = snap.crew.find(c => c.id === a.id); mine.x = P.me.x + 0.4;
    P.netApply(snap, a.id);
    for (let i = 0; i < 90; i++) P.netPredict(1 / 60);
    check(Math.abs(P.me.x - mine.x) < 0.05, `standing still, you glide onto the server's position (off by ${Math.abs(P.me.x - mine.x).toFixed(3)})`);
    // a latecomer drops straight into the running game
    const aLobbyBefore = a.lobby;
    const c = client('Carol'); await c.open; await sleep(400);
    check(a.lobby !== aLobbyBefore && a.lobby.phase === 'game', 'lobby updates sent during a game say phase "game" (so players in the game stay in it)');
    check(c.started && c.state?.crew.some(x => x.name === 'Carol'), 'someone joining mid-game drops straight in');
    c.ws.close(); await sleep(300);
    check(!a.state.crew.some(x => x.name === 'Carol'), 'leaving removes them from the ship');
    a.ws.close(); b.ws.close();
  } finally { srv.kill(); }
  process.exitCode = failed ? 1 : 0;
})();
