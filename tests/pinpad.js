// The airlock vent's PIN pad: the vent panel opens a keypad (not the door-bashing override), the
// admin password is on a sticky note next to it; a wrong code doesn't vent, the right one does.
// On opening, everyone else in the room takes one hit; the operator doesn't. Run: node tests/pinpad.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'tick', 'me', 'crew', 'hz', 'mission', 'startMission', 'clickTarget', 'fires', 'SYSTEMS', 'igniteSystem', 'CAPACITORS',
  'VENT_PANELS', 'withCrew', 'runCommand', 'makeCrew', 'roomAt', 'DOORWAYS', 'netServer', 'netSerialize', 'combat', 'localInput', 'openPinPad'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n) => { for (let i = 0; i < n; i++) G.tick(DT); };
const plasmaFire = (G) => {
  G.CAPACITORS[0].charge = 3;
  G.igniteSystem(G.SYSTEMS.find(s => s.ref === G.CAPACITORS[0]));
  return G.fires.find(f => f.plasma);
};
const fresh = () => { const G = loadGame(NAMES); G.startMission('c1'); G.mission.active = false; G.mission.rules.plasma = true; G.combat.enemies.length = 0; return G; };
const key = (G, code) => { G.listeners.keydown({ code, preventDefault() {} }); G.tick(DT); G.listeners.keyup({ code }); };

// --- solo: open the pad, a wrong code, then the right one
{
  const G = fresh(), me = G.me;
  const f = plasmaFire(G);
  check(!!f, 'a plasma fire burns in the left airlock room');
  const [px, py] = G.VENT_PANELS.portLock;
  me.x = px + 0.9; me.y = py; G.tick(DT);
  const bob = G.makeCrew('Bob', 6, 19), carol = G.makeCrew('Carol', 22.2, 4.5);
  G.crew.push(bob, carol);
  check(G.roomAt(bob.x, bob.y)?.id === 'portLock' && G.roomAt(me.x, me.y)?.id === 'portLock' && G.roomAt(carol.x, carol.y)?.id !== 'portLock',
        'Bob is in the same room as the operator, Carol is elsewhere');
  const t = G.withCrew(me, () => G.clickTarget(px, py));
  check(t?.ok && /code/i.test(t.text) && /anyone else/i.test(t.text), `the vent panel's prompt mentions the code and who gets hurt (anyone else, not you) ("${t?.text}")`);
  G.withCrew(me, () => t.run());
  const m = me.ui.mini;
  check(me.ui.panel === 'mini' && m?.kind === 'pin' && !me.ui.override, 'the vent panel opens the PIN pad, not the door-bashing override');
  check(/^\d{4,6}$/.test(m.pin) && m.typed === '', `the admin password is 4–6 random digits (${m.pin}), nothing typed yet`);

  // a wrong code (typed on the keyboard), Enter
  const wrong = m.pin.split('').map(d => String((+d + 1) % 10)).join('');
  for (const d of wrong) key(G, 'Digit' + d);
  check(me.ui.mini.typed === wrong, `number keys type into the pad (${me.ui.mini.typed})`);
  check(!G.localInput.pressed.size, 'the digits are taken by the pad and don\'t reach the rest of the game');
  key(G, 'Backspace');
  check(me.ui.mini.typed === wrong.slice(0, -1), 'Backspace takes the last digit back');
  key(G, 'Digit' + wrong.slice(-1));
  key(G, 'Enter');
  check(me.ui.mini.flash === 'denied', 'a wrong code: ACCESS DENIED');
  tickN(G, 60);
  check(!G.hz.vent && G.fires.includes(f) && me.ui.panel === 'mini' && me.ui.mini.typed === '' && !me.ui.mini.flash,
        'a wrong code doesn\'t vent; the input clears and the pad stays open');
  check(bob.health === 'ok' && me.health === 'ok', 'nobody hurt by a wrong code');

  // the right one (read off the sticky note, i.e. the panel state), clicking the keys, then OK
  for (const d of me.ui.mini.pin) G.withCrew(me, () => G.runCommand(['mini', 'pin', 'key', +d]));
  G.withCrew(me, () => G.runCommand(['mini', 'pin', 'ok']));
  check(me.ui.mini.flash === 'granted' && !G.hz.vent, 'the right code: ACCESS GRANTED (the vent follows a moment later)');
  tickN(G, 60);
  check(G.hz.vent?.room === 'portLock' && !me.ui.panel && !me.ui.mini, 'then the room vents and the pad closes');
  check(me.health === 'ok', 'the operator (visor down) is not hurt by the vent they opened');
  check(bob.health === 'hurt', `another crew member in the room takes one hit (${bob.health})`);
  check(carol.health === 'ok', 'a crew member in another room is unaffected');
  tickN(G, 120);
  check(bob.health === 'hurt' && me.health === 'ok', 'no extra damage from the vacuum afterwards (still exactly one hit)');
  check(!G.fires.some(x => x.plasma && x.hp > 0), 'the plasma fire is blown out');
}

// --- numpad works too, and each opening has a fresh password
{
  const G = fresh(), me = G.me;
  G.withCrew(me, () => G.openPinPad('starLock'));
  key(G, 'Numpad7'); key(G, 'Numpad0');
  check(me.ui.mini.typed === '70', 'the numpad types too');
  G.withCrew(me, () => G.runCommand(['mini', 'pin', 'clr']));
  check(me.ui.mini.typed === '', 'CLR clears the input');
  key(G, 'Escape');
  check(!me.ui.panel && !me.ui.mini, 'Escape closes the pad');
  const pins = new Set();
  for (let i = 0; i < 30; i++) { G.withCrew(me, () => G.openPinPad('starLock')); pins.add(me.ui.mini.pin); }
  check(pins.size > 20 && [...pins].every(p => /^\d{4,6}$/.test(p)), `a fresh random password each time (${pins.size} different out of 30)`);
}

// --- multiplayer: everything goes through the server (input + commands)
{
  const G = loadGame(NAMES);
  G.netServer.init('c1'); G.mission.active = false; G.mission.rules.plasma = true; G.combat.enemies.length = 0;
  G.netServer.addCrew(1, 'Alice'); G.netServer.addCrew(2, 'Bob'); G.netServer.addCrew(3, 'Carol');
  const [A, B, C] = G.crew;
  plasmaFire(G);
  const [px, py] = G.VENT_PANELS.portLock;
  A.x = px + 0.9; A.y = py; B.x = 6; B.y = 19;
  const step = (n) => { for (let i = 0; i < n; i++) G.simTick(DT); };
  G.netServer.input(1, { keys: [], pressed: [], mouse: { wx: px, wy: py, click: true } });
  step(2);
  check(A.ui.panel === 'mini' && A.ui.mini?.kind === 'pin' && !B.ui.panel, 'Alice clicks the vent panel: her PIN pad opens, Bob\'s screen is unaffected');
  const snap = JSON.parse(JSON.stringify(G.netSerialize()));
  check(snap.crew[0].ui.mini?.kind === 'pin' && snap.crew[0].ui.mini.pin === A.ui.mini.pin, 'the pad (and the sticky note\'s password) are in the snapshot');
  G.netServer.command(2, ['mini', 'pin', 'key', 1]);
  check(A.ui.mini.typed === '', 'Bob\'s commands don\'t type on Alice\'s pad');
  for (const d of A.ui.mini.pin) G.netServer.command(1, ['mini', 'pin', 'key', +d]);
  G.netServer.command(1, ['mini', 'pin', 'ok']);
  step(60);
  check(G.hz.vent?.room === 'portLock', 'Alice\'s right code vents the room');
  check(A.health === 'ok' && B.health === 'hurt' && C.health === 'ok', `Alice (operator) unhurt, Bob in the room hurt once, Carol elsewhere fine (${A.health}, ${B.health}, ${C.health})`);
}

// --- the other manual overrides still use the bashing mini-game
{
  const G = fresh(), me = G.me, d = G.DOORWAYS[0];
  d.locked = true; me.x = d.x + d.w / 2; me.y = d.y + d.h / 2 + 1; me.input.mouse.wx = -50; me.input.mouse.wy = -50;
  G.tick(DT);
  check(/manual override/.test(me.prompt?.text || ''), `next to a locked door: manual override ("${me.prompt?.text}")`);
  G.listeners.keydown({ code: 'KeyE', preventDefault() {} }); G.tick(DT); G.listeners.keyup({ code: 'KeyE' });
  check(me.ui.panel === 'override' && /^Door/.test(me.ui.override?.name || '') && !me.ui.mini, 'a locked door still opens the bashing override');
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall pin pad checks passed');
process.exit(failed ? 1 : 0);
