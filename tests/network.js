// End to end over the network: real server, WebSocket clients (Node's built-in client).
// Main menu (live list of games) → open a game (host) / join one → host-only mission pick and
// start → snapshots with both crew → input moves you → commands work → a browser-side copy
// applies a snapshot and renders it → late join / leave → 8 players per game → two games side by
// side → host hand-over → mission over: back to that game's lobby (and a reload keeps your seat)
// → a game closes when its last player leaves. Run: node tests/network.js
const { spawn } = require('child_process');
const path = require('path');
const { loadGame } = require('./harness');
const PORT = 8000 + Math.floor(Math.random() * 900);
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function client(name) {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
  const c = { ws, name, id: null, lobby: null, state: null, started: false, sfx: 0, games: null, game: null };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'welcome') c.id = m.id;
    if (m.t === 'games') c.games = m.games;
    if (m.t === 'joined') { c.game = m.game; c.ticket = m.ticket; c.full = null; }
    if (m.t === 'full') c.full = m.max;
    if (m.t === 'gone') c.gone = m.game;
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
    check(Array.isArray(a.games) && a.games.length === 0 && !a.lobby, 'connecting lands you in the main menu with the (empty) list of games');
    a.send({ t: 'open', mission: 'intro' }); await sleep(150);
    const g1 = a.game;
    check(g1 && a.lobby?.game === g1 && a.lobby.host === a.id && a.lobby.players.length === 1, `opening a game makes you its host (game ${g1})`);
    check(b.games?.length === 1 && b.games[0].id === g1 && b.games[0].host === 'Alice' && b.games[0].players === 1 && b.games[0].mission === 'intro' && b.games[0].phase === 'lobby',
      `the menu list updates live: host, mission, players (${JSON.stringify(b.games?.[0])})`);
    b.send({ t: 'join', game: g1 }); await sleep(150);
    check(a.lobby?.players.length === 2 && a.lobby.players.some(p => p.name === 'Bob') && b.lobby?.host === a.id, `joining puts both in the game's lobby (${a.lobby?.players.map(p => p.name)})`);
    b.send({ t: 'mission', id: 'deep' }); b.send({ t: 'start' }); await sleep(200);
    check(a.lobby.mission === 'intro' && !a.started && !b.started, 'only the host can pick the mission or start');
    a.send({ t: 'mission', id: 'rush' }); await sleep(100);
    check(b.lobby?.mission === 'rush', "the host's pick shows up for everyone");
    a.send({ t: 'start' }); await sleep(400);
    check(a.started === 'rush' && b.started === 'rush', 'the host starts: both are in the game');
    check(a.state && a.state.crew.length === 2, `snapshots arrive with both crew members (${a.state?.crew.map(c => c.name)})`);
    const want = require('./harness').loadGame(['missionCrew']).missionCrew('rush', 2).events;   // (the number of encounters follows the crew size)
    check(a.state.mission.id === 'rush' && a.state.mission.events.length === want, `the rush mission has ${want} incidents for 2 players (${a.state.mission.events.map(e => e.kind).join(', ')})`);
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

    // a second game on the same server, played independently
    const d = client('Dana'), e = client('Eve'); await Promise.all([d.open, e.open]); await sleep(150);
    const listed = d.games?.find(g => g.id === g1);
    check(listed && listed.phase === 'game' && listed.players === 2 && listed.mission === 'rush', `the list shows a running game as "in mission" (${JSON.stringify(listed)})`);
    d.send({ t: 'open', mission: 'intro' }); await sleep(150);
    const g2 = d.game;
    e.send({ t: 'join', game: g2 }); await sleep(150);
    check(g2 && g2 !== g1 && e.lobby?.game === g2 && e.lobby.players.map(p => p.name).join() === 'Dana,Eve' && a.lobby.players.length === 2,
      `a second game has its own lobby (game ${g2}: ${e.lobby?.players.map(p => p.name)})`);
    check(e.lobby.phase === 'lobby' && !d.started && a.state.crew.length === 2, "the second game is still in its lobby while the first one plays");
    d.send({ t: 'start' }); await sleep(400);
    check(d.started === 'intro' && d.state?.mission.id === 'intro' && d.state.crew.length === 2 && d.state.crew.every(c => c.name === 'Dana' || c.name === 'Eve'),
      `the second game runs its own mission with its own crew (${d.state?.mission.id}: ${d.state?.crew.map(c => c.name)})`);
    check(a.state.mission.id === 'rush' && a.state.crew.every(c => c.name === 'Alice' || c.name === 'Bob'), "the first game doesn't see the second game's crew");
    const ex0 = d.state.crew.find(c => c.id === e.id).x, ax0 = a.state.crew.find(c => c.id === a.id).x;
    for (let i = 0; i < 30; i++) { e.send({ t: 'input', keys: ['KeyA'], pressed: [], mouse: { wx: 0, wy: 0 } }); await sleep(16); }
    e.send({ t: 'input', keys: [], pressed: [], mouse: { wx: 0, wy: 0 } }); await sleep(150);
    check(d.state.crew.find(c => c.id === e.id).x < ex0 - 1 && Math.abs(a.state.crew.find(c => c.id === a.id).x - ax0) < 0.01, "input moves Eve in her game only");

    // a latecomer drops straight into the running game
    const aLobbyBefore = a.lobby;
    const c = client('Carol'); await c.open; await sleep(100);
    c.send({ t: 'join', game: g1 }); await sleep(400);
    check(a.lobby !== aLobbyBefore && a.lobby.phase === 'game', 'lobby updates sent during a game say phase "game" (so players in the game stay in it)');
    check(c.started && c.state?.crew.some(x => x.name === 'Carol') && !d.state.crew.some(x => x.name === 'Carol'), 'joining a running game drops you straight in');
    c.ws.close(); await sleep(300);
    check(!a.state.crew.some(x => x.name === 'Carol') && a.lobby.players.length === 2, 'leaving removes them from the ship');
    // at most 8 players per game: a 9th is told the game is full; opening a new game works
    const more = [3, 4, 5, 6, 7, 8].map(i => client('P' + i)); await Promise.all(more.map(m => m.open)); await sleep(100);
    for (const m of more) m.send({ t: 'join', game: g1 });
    await sleep(400);
    const ninth = client('Nine'); await ninth.open; await sleep(100);
    check(ninth.games.find(g => g.id === g1)?.full === true && ninth.games.find(g => g.id === g1)?.players === 8, 'the list shows a game at 8/8 as full');
    ninth.send({ t: 'join', game: g1 }); await sleep(300);
    check(a.state.crew.length === 8 && ninth.full === 8 && !ninth.started && !ninth.game && !a.state.crew.some(x => x.name === 'Nine'), `8 players fit; the 9th is told the game is full (${a.state.crew.length} aboard, full=${ninth.full})`);
    ninth.send({ t: 'open', mission: 'intro' }); await sleep(150);
    check(ninth.game && ninth.game !== g1 && ninth.game !== g2 && ninth.lobby?.host === ninth.id, 'a player turned away can open a new game instead');
    const g3 = ninth.game; ninth.send({ t: 'leave' }); await sleep(150);
    check(!ninth.games.some(g => g.id === g3) && ninth.games.some(g => g.id === g1), 'leaving a game you are alone in closes it (back in the menu, the list no longer has it)');
    more[0].ws.close(); await sleep(300);
    const again = client('Nine again'); await again.open; again.send({ t: 'join', game: g1 }); await sleep(400);
    check(again.started && !again.full && a.state.crew.length === 8, 'once someone leaves, there is room again');
    for (const m of [...more, again, ninth]) m.ws.close();
    await sleep(300);

    // the host leaves: the next player (earliest joined) takes over
    d.send({ t: 'leave' }); await sleep(200);
    check(e.lobby.host === e.id && e.lobby.players.length === 1 && e.lobby.players[0].host , `when the host leaves, the next player becomes host (${e.lobby.players.map(p => p.name + (p.host ? '*' : ''))})`);
    check(d.games?.some(g => g.id === g2 && g.host === 'Eve'), 'whoever leaves is back in the menu and sees the new host in the list');

    // mission over: everyone goes back to that game's lobby (not the menu), and the host can start again
    for (let i = 0; i < 6; i++) a.send({ t: 'cmd', cmd: ['debug', 'b'] });     // break everything: the ship falls apart
    await sleep(400);
    check(!!a.state.mission.over, `the mission ends (${a.state.mission.over?.reason})`);
    b.send({ t: 'lobby' }); await sleep(200);
    check(a.lobby.phase === 'lobby' && b.lobby.phase === 'lobby' && a.lobby.game === g1 && a.lobby.players.length === 2 && a.lobby.host === a.id,
      "after the mission everyone is back in that game's lobby, same host");
    check(e.lobby.phase === 'game' && e.lobby.game === g2, 'the other game keeps playing');
    // the browser reloads the page and rejoins with its seat ticket: same seat, still host
    const oldTicket = a.ticket; a.ws.close(); await sleep(200);
    check(b.lobby.players.length === 2 && b.lobby.host === a.id && b.lobby.players.find(p => p.id === a.id)?.away, 'a page reload right after a mission keeps your seat for a moment');
    const a2 = client('Alice'); await a2.open; a2.send({ t: 'join', game: g1, ticket: oldTicket }); await sleep(200);
    check(a2.game === g1 && a2.lobby?.host === a2.id && a2.lobby.players.map(p => p.name).join() === 'Alice,Bob', `coming back with the ticket takes the old seat, host included (${a2.lobby?.players.map(p => p.name + (p.host ? '*' : ''))})`);
    a2.send({ t: 'mission', id: 'intro' }); a2.send({ t: 'start' }); await sleep(300);
    check(a2.started === 'intro' && b.state?.mission.id === 'intro' && b.state.crew.length === 2, 'the host can start the next mission');
    // the last players leave: the game is gone
    const watcher = client('Watcher'); await watcher.open; await sleep(100);
    check(watcher.games.some(g => g.id === g1), 'the first game is listed while people are in it');
    a2.ws.close(); b.ws.close(); await sleep(300);
    check(!watcher.games.some(g => g.id === g1), 'a game vanishes when its last player leaves');
    watcher.send({ t: 'join', game: g1 }); await sleep(150);
    check(watcher.gone === g1 && !watcher.game, 'joining a closed game says it is gone');
    for (const m of [d, e, watcher]) m.ws.close();

    // permessage-deflate (what browsers offer): the snapshots come compressed, with the context kept from one
    // to the next (a fraction of the JSON), and the browser's own messages may come compressed too (Chrome does)
    {
      const net = require('net'), zlib = require('zlib'), crypto = require('crypto');
      const sock = net.connect(PORT, '127.0.0.1'), inf = zlib.createInflateRaw(), got = [];
      let buf = Buffer.alloc(0), shook = null, wire = 0, plain = 0, allZ = true, chain = Promise.resolve();
      const outs = []; inf.on('data', d => outs.push(d));
      sock.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        if (shook === null) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; shook = buf.subarray(0, i).toString(); buf = buf.subarray(i + 4); }
        for (;;) {
          if (buf.length < 2) return;
          let len = buf[1] & 0x7f, off = 2;
          if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
          if (buf.length < off + len) return;
          const z = !!(buf[0] & 0x40), payload = buf.subarray(off, off + len); buf = buf.subarray(off + len);
          allZ &&= z;
          chain = chain.then(() => new Promise(r => {
            if (!z) { got.push(payload.toString()); return r(); }
            inf.write(Buffer.concat([payload, Buffer.from([0, 0, 0xff, 0xff])]));
            inf.flush(zlib.constants.Z_SYNC_FLUSH, () => { const t = Buffer.concat(outs.splice(0)).toString(); got.push(t); if (t.startsWith('{"t":"state"')) { wire += len; plain += t.length; } r(); });
          }));
        }
      });
      const sendZ = (o) => {                           // a masked text frame, compressed on its own (client_no_context_takeover)
        let p = zlib.deflateRawSync(JSON.stringify(o), { finishFlush: zlib.constants.Z_SYNC_FLUSH }); p = p.subarray(0, p.length - 4);
        const mask = crypto.randomBytes(4), m = Buffer.from(p.map((b, i) => b ^ mask[i & 3]));
        sock.write(Buffer.concat([Buffer.from([0xC1, 0x80 | p.length]), mask, m]));
      };
      sock.write(`GET /ws HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${crypto.randomBytes(16).toString('base64')}\r\nSec-WebSocket-Extensions: permessage-deflate; client_max_window_bits\r\n\r\n`);
      await sleep(200);
      sendZ({ t: 'hello', name: 'Zed' }); sendZ({ t: 'open', mission: 'intro' }); await sleep(150); sendZ({ t: 'start' }); await sleep(900); await chain;
      const kinds = got.map(t => { try { return JSON.parse(t).t; } catch (e) { return 'bad'; } });
      check(/permessage-deflate/.test(shook || ''), 'the server agrees to permessage-deflate when the browser offers it');
      check(kinds.includes('joined') && kinds.includes('start') && kinds.filter(k => k === 'state').length >= 10 && !kinds.includes('bad'),
        `compressed messages from the browser work (it opened and started a game), compressed snapshots decode (${kinds.filter(k => k === 'state').length} snapshots)`);
      check(allZ && wire < plain * 0.4, `every message comes compressed: the snapshots take ${Math.round(wire / 1024)} KB on the wire for ${Math.round(plain / 1024)} KB of JSON`);
      sock.destroy();
    }

    // one ship: the host's. Its upgrades fly (not the guest's), the lobby shows it, and the server tells
    // every browser whose ship it is (only the host gets the reputation; see tests/progress.js)
    const h = client('Hana'), q = client('Quinn');
    await Promise.all([h.open, q.open]);
    h.send({ t: 'hello', name: 'Hana', ship: { cannons: true } }); q.send({ t: 'hello', name: 'Quinn', ship: { caps: true, inserter: true } });
    h.send({ t: 'open', mission: 'rush' }); await sleep(150);
    q.send({ t: 'join', game: h.game }); await sleep(150);
    check(q.lobby?.hostShip?.cannons && !q.lobby.hostShip.caps, `the lobby sends the host's ship upgrades (${JSON.stringify(q.lobby?.hostShip)})`);
    h.send({ t: 'start' }); await sleep(400);
    const M = q.state?.mission;
    check(M && M.upgrades.cannons && !M.upgrades.caps && !M.upgrades.inserter, `in the game only the host's upgrades apply, not the guest's (${JSON.stringify(M?.upgrades)})`);
    check(M && M.shipOf?.id === h.id && M.shipOf.name === 'Hana', `every browser knows whose ship flies (${JSON.stringify(M?.shipOf)})`);
    for (const m of [h, q]) m.ws.close();
  } finally { srv.kill(); }
  process.exitCode = failed ? 1 : 0;
})();
