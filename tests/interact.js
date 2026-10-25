// Every interaction works with E (next to it) and with a left click on it: the outer airlocks
// (inside and on a spacewalk, also with the mouse resting on the airlock / yourself), hold jobs
// (prying a limpet mine off, treating) by holding E or the mouse, and the manual-override panel.
// Run: node tests/interact.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'me', 'HATCHES', 'evs', 'startMission', 'mission', 'withCrew', 'inv', 'ui', 'DOORWAYS', 'hurtCrew', 'crew', 'makeCrew', 'PRY_BARE', 'roomAt'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const fresh = () => { const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false; return G; };
const mouseAt = (G, x, y) => { const m = G.me.input.mouse; m.wx = x; m.wy = y; m.x = -999; m.y = -999; };
const pressE = (G) => { const i = G.me.input; i.keys.add('KeyE'); i.pressed.add('KeyE'); G.simTick(DT); i.keys.delete('KeyE'); };
const click = (G, x, y) => { mouseAt(G, x, y); const m = G.me.input.mouse; m.click = true; m.down = true; G.simTick(DT); m.down = false; };
const place = (G, mode, x, y) => { const me = G.me; me.mode = mode; me.x = x; me.y = y; me.vx = me.vy = 0; };
// hold E or the mouse until done() (or max s); returns the time it took
function hold(G, how, done, max = 10) {
  const i = G.me.input; let t = 0;
  if (how === 'E') { i.keys.add('KeyE'); i.pressed.add('KeyE'); } else i.mouse.down = i.mouse.click = true;
  while (!done() && t < max) { G.simTick(DT); t += DT; }
  i.keys.delete('KeyE'); i.mouse.down = false; return t;
}

// --- the outer airlock (js/airlock.js): walked through; in its chamber E (mouse anywhere) or a click on it cycles it by hand
for (const [how, mouse] of [['E', 'far away'], ['E', 'on the airlock'], ['E', 'on yourself'], ['click', 'on the airlock']]) {
  const G = fresh(), h = G.HATCHES[0], me = G.me, c = h.chamber, mid = [c.x + c.w / 2, c.y + c.h / 2];
  place(G, 'inside', ...mid);
  mouseAt(G, ...(mouse === 'far away' ? [h.x + 8, h.y - 8] : mouse === 'on yourself' ? mid : mid));
  tickN(G, 2);
  check(/cycle the airlock/.test(me.prompt?.text || ''), `in the chamber the prompt offers the cycle ("${me.prompt?.text}")`);
  if (how === 'E') pressE(G); else click(G, ...mid);
  tickN(G, 150);
  check(h.air === 'outer' && h.doors.outer === 1 && h.doors.inner === 0, `chamber: ${how} (mouse ${mouse}) cycles it: pumped out, the outer door open, the inner one shut`);
}
{
  const G = fresh(), h = G.HATCHES[0], me = G.me;
  place(G, 'eva', ...h.outside);
  me.input.keys.add('KeyD'); tickN(G, 60 * 5); me.input.keys.delete('KeyD');
  check(me.mode === 'inside' && G.roomAt(me.x, me.y)?.id === 'portLock', `spacewalk: floating at the outer airlock (D) cycles it to you and takes you back in (mode ${me.mode})`);
}

// --- a limpet mine: hold E next to one, or hold the mouse on it (no repair kit: PRY_BARE s)
// (the hull barnacles that were tested here are gone since 2026-10-22: spores get inside now, js/spores.js)
for (const [how, side] of [['E', 'left'], ['E', 'below'], ['mouse', 'left'], ['mouse', 'below'], ['mouse', 'above']]) {
  const G = fresh(), b = { uid: 900, side: 'port', x: -0.55, y: 12.6, t: 60 };
  G.evs.mines.push(b);
  const [dx, dy] = { left: [-0.6, 0], below: [0, 0.6], above: [0, -0.6] }[side];
  place(G, 'eva', b.x + dx, b.y + dy);
  if (how === 'E') mouseAt(G, b.x + 8, b.y - 8); else mouseAt(G, b.x, b.y);
  tickN(G, 2);
  const t = hold(G, how, () => !G.evs.mines.includes(b));
  check(!G.evs.mines.includes(b) && Math.abs(t - G.PRY_BARE) < 0.3, `limpet mine pried off by holding ${how} (you ${side === 'left' ? 'left of' : side} it) in ${t.toFixed(1)} s`);
}
{ // a quick tap of E or a click doesn't pry it off
  const G = fresh(), b = { uid: 901, side: 'port', x: -0.55, y: 12.6, t: 60 };
  G.evs.mines.push(b); place(G, 'eva', b.x - 0.6, b.y); mouseAt(G, b.x + 8, b.y - 8); tickN(G, 2);
  pressE(G); click(G, b.x, b.y); tickN(G, 60);
  check(G.evs.mines.includes(b), 'a tap of E or a single click doesn\'t pry a mine off (it is a hold job)');
}

// --- treating a crewmate: hold E or hold the mouse on them
for (const how of ['E', 'mouse']) {
  const G = fresh(), mate = G.makeCrew('Mate', 22.2, 4.5); G.crew.push(mate);
  const me = G.me; place(G, 'inside', 21.6, 4.5);
  G.hurtCrew(mate); G.hurtCrew(mate);
  if (how === 'E') mouseAt(G, me.x - 6, me.y + 6); else mouseAt(G, mate.x, mate.y);
  tickN(G, 2);
  const t = hold(G, how, () => mate.health !== 'down');
  check(mate.health === 'hurt', `treating a downed crewmate by holding ${how} (${t.toFixed(1)} s)`);
}

// --- manual override (a locked door): opened with E or a click, then E or the button hits
for (const how of ['E', 'click']) {
  const G = fresh(), me = G.me, d = G.DOORWAYS.find(d => !d.blast);
  d.locked = true; const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
  place(G, 'inside', cx, cy); mouseAt(G, cx + 8, cy - 8); tickN(G, 2);
  if (how === 'E') pressE(G); else click(G, cx, cy);
  check(G.withCrew(me, () => G.ui.panel) === 'override', `${how} on a locked door opens the manual override`);
  if (how === 'E') {
    tickN(G, 2);
    for (let i = 0; i < 3; i++) { pressE(G); tickN(G, 40); }
    tickN(G, 90);
    check(!d.locked && !G.withCrew(me, () => G.ui.panel), 'three E presses hit the override home and the door opens');
  }
}
{ // holding E keeps swinging; Esc still closes the panel
  const G = fresh(), me = G.me, d = G.DOORWAYS.find(d => !d.blast);
  d.locked = true; const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
  place(G, 'inside', cx, cy); mouseAt(G, cx + 8, cy - 8); tickN(G, 2);
  pressE(G); tickN(G, 2);
  const i = me.input; i.keys.add('KeyE'); i.pressed.add('KeyE'); tickN(G, 60 * 3); i.keys.delete('KeyE');
  check(!d.locked, 'holding E swings again after each hit until the door gives');
  d.locked = true; tickN(G, 2); pressE(G); tickN(G, 2);
  i.pressed.add('Escape'); G.simTick(DT);
  check(!G.withCrew(me, () => G.ui.panel) && d.locked, 'Esc closes the override panel');
}

console.log(failed ? `\n${failed} FAILED` : '\nall interaction tests passed');
process.exit(failed ? 1 : 0);
