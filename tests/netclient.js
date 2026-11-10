// The browser's side of a connection (js/net.js netClientMain), in a fake page: a document of stand-in elements,
// a WebSocket and a fetch the test plays the server for, a clock and timers it moves by hand.
//   - input messages: sent when due, not with every drawn frame, held back while the socket's queue is not empty,
//     and every key press and click arrives exactly once;
//   - a connection lost mid-mission: the way back is stored ('mn-return'), the page reloads once the server answers
//     again, and the fresh page joins the same game with its seat ticket;
//   - a server that goes silent in a game counts as lost after NET_SILENCE (not while the tab is hidden, not
//     because the page itself hung).
// Run: node tests/netclient.js
const { loadGame, checks } = require('./harness');
const { check, done } = checks('net client');
const flush = async () => { for (let i = 0; i < 6; i++) await null; };

// the server's side, for real snapshots: a mission with the host and "me" (player 2) aboard
const S = loadGame(['netServer', 'netSnapshotText', 'simTick']);
S.netServer.init('c1', {}, 0); S.netServer.addCrew(1, 'Host'); S.netServer.addCrew(2, 'Me');
let snapN = 0;
const stateMsg = () => { S.simTick(1 / 60); return `{"t":"state","n":${++snapN},"you":2,"sfx":[],"s":${S.netSnapshotText()}}`; };

function page(session = new Map()) {
  const noop = new Proxy(function () {}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === Symbol.toPrimitive ? () => '' : noop), apply: () => noop, set: () => true });
  const element = () => new Proxy({ hidden: false, style: {}, value: '', textContent: '', innerHTML: '', dataset: {}, children: [], classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    querySelectorAll: () => [], querySelector: () => null, appendChild(c) { this.children.push(c); return c; }, addEventListener() {}, getContext: () => noop, focus() {}, remove() {} },
    { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : noop), set: (t, k, v) => { t[k] = v; return true; } });
  const els = new Map(), el = (id) => { if (!els.has(id)) els.set(id, element()); return els.get(id); };
  const P = { now: 1e6, timers: [], sockets: [], fetches: [], reloads: 0, serverUp: false, session, hiddenTab: false, body: element() };
  const storage = (m) => ({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } });
  const document = { getElementById: el, createElement: element, body: P.body, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, get hidden() { return P.hiddenTab; } };
  class FakeDate extends Date { static now() { return P.now; } }
  class WebSocket {
    constructor(url) { this.url = url; this.readyState = 0; this.bufferedAmount = 0; this.sent = []; this.closedByPage = false; P.sockets.push(this); }
    send(text) { this.sent.push(JSON.parse(text)); }
    close() { this.closedByPage = true; this.readyState = 3; }
    // the test, as the server:
    open() { this.readyState = 1; this.onopen(); }
    say(m) { this.onmessage({ data: typeof m === 'string' ? m : JSON.stringify(m) }); }
    drop() { this.readyState = 3; this.onclose?.(); }
  }
  const timer = (every) => (fn, ms = 0) => { const t = { at: P.now + ms, fn, every: every ? ms : 0 }; P.timers.push(t); return t; };
  const clear = (t) => { const i = P.timers.indexOf(t); if (i >= 0) P.timers.splice(i, 1); };
  P.advance = async (ms) => {                          // the clock moves on, timers fire in order, promises settle
    for (const end = P.now + ms; ;) {
      const next = P.timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) { P.now = end; break; }
      P.now = Math.max(P.now, next.at);
      if (next.every) next.at = P.now + next.every; else clear(next);   // (an interval that fell behind fires once, as in a browser)
      next.fn(); await flush();
    }
    await flush();
  };
  const window = { addEventListener() {}, innerWidth: 1600, innerHeight: 1000, devicePixelRatio: 1, document };
  P.G = loadGame(['NET', 'localInput', 'me', 'crew', 'mission', 'NET_SEND', 'NET_SILENCE'], {
    window, document, URLSearchParams, WebSocket, Date: FakeDate, localUI: null,   // (localUI: js/local.js, the split-screen roster, is not loaded in tests)
    localStorage: storage(new Map([['mn-name', 'Me']])), sessionStorage: storage(session),
    location: { protocol: 'http:', host: 'ship:8080', search: '', hash: '', pathname: '/', reload() { P.reloads++; } },
    fetch: (url, opts) => { P.fetches.push([url, opts]); return P.serverUp ? Promise.resolve({ ok: true, status: 200 }) : Promise.reject(new Error('unreachable')); },
    setTimeout: timer(false), setInterval: timer(true), clearTimeout: clear, clearInterval: clear, confirm: () => false,
  });
  P.ws = P.sockets[0];
  // into a running mission: the server's welcome, the game joined, its lobby (in a mission), start, a first snapshot
  P.intoGame = () => {
    P.ws.open();
    P.ws.say({ t: 'welcome', id: 2, max: 8 }); P.ws.say({ t: 'joined', game: 7, ticket: 'seat-ticket' });
    P.ws.say({ t: 'lobby', game: 7, phase: 'game', mission: 'c1', easy: 0, host: 1, hostShip: {}, max: 8, players: [{ id: 1, name: 'Host', color: '#c4683a', host: true }, { id: 2, name: 'Me', color: '#3a8fc4' }] });
    P.ws.say({ t: 'start', mission: 'c1', game: 7 }); P.ws.say(stateMsg());
  };
  P.inputs = () => P.ws.sent.filter(m => m.t === 'input');
  return P;
}

(async () => {
  // ----- 1. input messages
  {
    const P = page(), G = P.G;
    check(P.sockets.length === 1 && /^ws:\/\/ship:8080\/ws$/.test(P.ws.url), `the page connects to its server (${P.ws?.url})`);
    P.intoGame();
    check(G.NET.on && typeof G.NET.frame === 'function' && G.me.id === 2 && G.crew.length === 2 && P.ws.sent[0]?.t === 'hello', 'start and a snapshot: in the game as crew member 2');
    const run = (frames, fps, each) => { const n0 = P.inputs().length; for (let i = 0; i < frames; i++) { each?.(i); G.NET.frame(1 / fps); if (i % Math.round(fps / 30) === 0) P.ws.say(stateMsg()); } return P.inputs().slice(n0); };
    const at60 = run(120, 60);
    check(at60.length === 120, `a 60 Hz screen sends one input per frame, as it did (${at60.length} in 120 frames)`);
    const at144 = run(288, 144);
    check(at144.length >= 110 && at144.length <= 125, `a 144 Hz screen sends about 60 a second, not 144 (${at144.length} in 2 s)`);
    check(at144.every((m, i) => i === 0 || m.seq > at144[i - 1].seq) && Number.isFinite(at144[0].ack), 'each carries the latest frame\'s number and acknowledges the latest snapshot');
    // every press and click exactly once, whatever the frame it happens in
    const L = G.localInput, pressAt = { 3: 'KeyE', 4: 'Space', 10: 'Space', 11: 'KeyR', 100: 'Space', 101: 'Space', 203: 'KeyE' }, clickAt = new Set([5, 50, 51, 140]), rightAt = new Set([6, 141]);
    const edgy = run(288, 144, (i) => { if (pressAt[i]) L.pressed.add(pressAt[i]); if (clickAt.has(i)) L.mouse.click = true; if (rightAt.has(i)) L.mouse.rightClick = true; });
    const count = (f) => edgy.reduce((n, m) => n + f(m), 0);
    const got = { Space: count(m => m.pressed.filter(k => k === 'Space').length), KeyE: count(m => m.pressed.filter(k => k === 'KeyE').length), KeyR: count(m => m.pressed.filter(k => k === 'KeyR').length), click: count(m => +!!m.mouse.click), right: count(m => +!!m.mouse.rightClick) };
    check(JSON.stringify(got) === JSON.stringify({ Space: 4, KeyE: 2, KeyR: 1, click: 4, right: 2 }), `at 144 Hz every key press and click arrives exactly once (${JSON.stringify(got)})`);
    check(L.pressed.size === 0 && !L.mouse.click, 'and is gone from the page after its frame (a key counts once here too)');
    // a held key going down or coming up goes out in its own frame
    run(1, 144); const n1 = P.inputs().length; L.keys.add('KeyD'); G.NET.frame(1 / 144); const down = P.inputs().length - n1; L.keys.delete('KeyD'); G.NET.frame(1 / 144); const up = P.inputs().length - n1 - down;
    check(down === 1 && up === 1 && P.inputs().at(-2).keys.join() === 'KeyD' && P.inputs().at(-1).keys.length === 0, 'a held key going down or up is sent in its own frame');
    // the socket's queue isn't empty (a thin or stalled uplink): nothing is added to it, except what happened once
    P.ws.bufferedAmount = 400;
    const stalled = run(288, 144, (i) => { if (i === 30) L.pressed.add('Space'); if (i === 31) L.mouse.click = true; if (i === 200) L.mouse.moved = L.mouse.look = 1; });
    check(stalled.length === 2 && stalled[0].pressed.join() === 'Space' && stalled[1].mouse.click === true, `while its earlier messages wait in the socket, the page sends only a key press and a click (${stalled.length} messages in 2 s)`);
    P.ws.bufferedAmount = 0;
    const drained = run(3, 144);
    check(drained.length >= 1 && drained[0].mouse.moved === 1 && drained[0].mouse.look === 1 && drained[0].pressed.length === 0, 'the queue drained: the next one goes at once, with the mouse having moved meanwhile, the key press not again');
  }

  // ----- 2. the connection is lost mid-mission
  let session;
  {
    const P = page(); session = P.session;
    P.intoGame();
    P.ws.drop();
    const ret = JSON.parse(session.get('mn-return') || 'null');
    check(ret && ret.game === 7 && ret.ticket === 'seat-ticket' && ret.mid === true, `the way back into the game is stored (${session.get('mn-return')})`);
    check(P.body.children.some(c => /Reconnecting/.test(c.textContent)), 'the player is told: "Connection lost. Reconnecting…"');
    await P.advance(5000);
    check(P.reloads === 0 && P.fetches.length >= 2, `while the server doesn't answer, the page stays (asked ${P.fetches.length} times in 5 s, no reload into an error page)`);
    P.serverUp = true; await P.advance(2000);
    check(P.reloads === 1, 'the server answers again: the page reloads, once');
    await P.advance(5000);
    check(P.reloads === 1, '…and only once');
  }
  {
    const P = page(session);                           // the fresh page, same tab (same sessionStorage)
    P.ws.open();
    const join = P.ws.sent.find(m => m.t === 'join');
    check(join && join.game === 7 && join.ticket === 'seat-ticket' && P.ws.sent[0].t === 'hello' && !session.has('mn-return'), `the fresh page joins that game with its seat ticket (${JSON.stringify(join)})`);
    P.ws.say({ t: 'welcome', id: 9, max: 8 }); P.ws.say({ t: 'joined', game: 7, ticket: 'seat-ticket-2' }); P.ws.say({ t: 'welcome', id: 2, max: 8 });   // (the server hands the old crew member back)
    P.ws.say({ t: 'start', mission: 'c1', game: 7 }); P.ws.say(stateMsg());
    check(P.G.NET.on && P.G.me.id === 2, 'and is back in the mission as the same crew member');
    // back in the lobby after the mission: that reload is no lost connection
    P.ws.say({ t: 'lobby', game: 7, phase: 'lobby', mission: 'c1', easy: 0, host: 1, hostShip: {}, max: 8, players: [] });
    P.ws.drop();
    const ret = JSON.parse(session.get('mn-return') || 'null');
    check(P.reloads === 1 && ret && !ret.mid && ret.ticket === 'seat-ticket-2' && P.body.children.length === 0, 'the mission over, back to the lobby: the usual reload, no "connection lost"');
  }
  {
    const P = page();                                  // not in a game: a lost connection is the main menu, as before
    P.ws.open(); P.ws.say({ t: 'welcome', id: 2, max: 8 }); P.ws.drop();
    await P.advance(5000);
    check(!P.session.has('mn-return') && P.reloads === 0 && P.fetches.length === 0, 'in the menu a lost connection stores nothing and reloads nothing');
  }

  // ----- 3. the server goes silent in a game
  {
    const P = page(), ms = P.G.NET_SILENCE * 1000;
    P.intoGame();
    for (let i = 0; i < 20; i++) { await P.advance(1000); P.ws.say(stateMsg()); }
    check(!P.ws.closedByPage && !P.session.has('mn-return'), 'snapshots keep coming (even one a second): connected');
    P.hiddenTab = true; await P.advance(ms * 3);
    check(!P.ws.closedByPage, 'a hidden tab does not judge the silence (its timers and mail are held back)');
    P.hiddenTab = false; await P.advance(ms - 1500);
    check(!P.ws.closedByPage, '…nor right after it comes back to the front');
    P.ws.say(stateMsg()); await P.advance(ms - 1500);
    check(!P.ws.closedByPage, `${(ms - 1500) / 1000} s of silence: still waiting`);
    await P.advance(3000);
    const P2 = page(); P2.intoGame(); P2.now += 60000; await P2.advance(1000); await P2.advance(1000);
    check(!P2.ws.closedByPage, 'a page that hung for a minute is not a silent server (its mail is still waiting behind the timer)');
    check(P.ws.closedByPage && JSON.parse(P.session.get('mn-return') || 'null')?.mid === true, `${ms / 1000} s without a word from the server in a game: the connection counts as lost, the way back is stored`);
    P.serverUp = true; await P.advance(2000);
    check(P.reloads === 1, 'and the page comes back the same way');
  }
  done();
})();
