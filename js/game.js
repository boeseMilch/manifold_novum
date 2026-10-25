// Main loop, input, crew movement, inner doors, spacewalks, cannons,
// shield buttons, debug menu, camera and HUD.
// Simulation runs in layout units (see ship.js); rendering scales by T.

const canvas = document.getElementById('c');
ctx = canvas.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
function resize() {
  DPR = window.devicePixelRatio || 1;
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = VW * DPR; canvas.height = VH * DPR;
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
}
window.addEventListener('resize', resize); resize();

// Input. Every crew member has an input object { keys, pressed, mouse }; this browser's
// keyboard and mouse fill `localInput`, which belongs to the local crew member (`me`).
// mouse.x/y are screen pixels (local only); mouse.wx/wy is the world point under it.
// mouse.look: the mouse moved since the last tick (the crew member turns to look at it for a while).
const makeInput = () => ({ keys: new Set(), pressed: new Set(), mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false, click: false, right: false, rightClick: false, moved: 0, look: 0 } });
const localInput = makeInput();
window.addEventListener('keydown', e => {
  if (e.target?.tagName === 'INPUT') return;                 // typing in the lobby
  if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (!localInput.keys.has(e.code)) localInput.pressed.add(e.code); localInput.keys.add(e.code);
});
window.addEventListener('keyup', e => localInput.keys.delete(e.code));
window.addEventListener('blur', () => { localInput.keys.clear(); localInput.mouse.down = false; });
canvas.addEventListener('mousemove', e => { localInput.mouse.x = e.clientX; localInput.mouse.y = e.clientY; localInput.mouse.moved = 1; localInput.mouse.look = 1; });
const MUTE_BTN = { x: 8, y: 6, w: 26, h: 24 };
const inMuteBtn = (x, y) => x >= MUTE_BTN.x && x <= MUTE_BTN.x + MUTE_BTN.w && y >= MUTE_BTN.y && y <= MUTE_BTN.y + MUTE_BTN.h;
canvas.addEventListener('mousedown', e => {
  const m = localInput.mouse;
  if (e.button === 0 && inMuteBtn(e.clientX, e.clientY)) { sfx.toggleMute(); return; }
  if (e.button === 0 && inGuideBtn(e.clientX, e.clientY)) { setGuideArrows(!guideArrows); return; }   // guide arrows on / off (js/claims.js)
  if (e.button === 0) { m.down = true; m.click = true; } if (e.button === 2) { m.right = true; m.rightClick = true; }
});
window.addEventListener('mouseup', e => { if (e.button === 0) localInput.mouse.down = false; if (e.button === 2) localInput.mouse.right = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
const WALK_SPEED = 4.2, WALK_ACCEL = 30;     // units/s, units/s²
const EVA_SPEED = 3.4, EVA_ACCEL = 7;        // floaty on the outside
const CREW_R = 0.2;                          // half-size of the crew collision box
let LOCK_CYCLE = 1.3;                        // airlock pump time, set by the 'airlocks' ship upgrade (js/progress.js; the deck airlocks are gone: inner doors are single doors since 2026-10-21)
const HURT_SPEED = 0.6;                       // walking speed while hurt
const LOOK_TIME = 1.75;                      // s a crew member keeps looking at the mouse after it moved or they fired with it
const MUSIC_TAIL = 30;                       // s the music's arc runs past the jump (it's laid out for a mission that much longer)
const GUN_TURN = 1.6;                        // rad/s when aiming a cannon with the keys (gunKeyTurn)
const COVER_SPEED = 6;                       // raising / lowering the cover plate (1/s)
const CRUISE_SPEED = 260;                    // px/s of starfield drift
const HUD_H = 36;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
// mode: 'inside' | 'eva' (a spacewalk: out through an outer airlock, js/airlock.js) | 'gun'
// The simulation updates crew members one at a time; while it does, the globals below point at
// that crew member ("acting crew"): player, keys, pressed, mouse, inv, ui, prompt, hover.
const CREW_COLORS = ['#c4683a', '#3a8fc4', '#5fb04a', '#c43a8f', '#c4b03a', '#8a5ac4', '#3ac4b0', '#c43a3a'];
// A name tag in this colour needs a light outline instead of the dark one (black and other dark suits on the dark floor)
const labelIsDark = (col) => { const m = /^#([0-9a-f]{6})$/i.exec(col || ''); if (!m) return false; const n = parseInt(m[1], 16); return 0.3 * (n >> 16) + 0.55 * (n >> 8 & 255) + 0.15 * (n & 255) < 0.3 * 255; };
let crewIdCounter = 1;
function makeCrew(name = 'Crew', x = 22.2, y = 4.5) {
  const id = crewIdCounter++;
  return { id, name, color: CREW_COLORS[(id - 1) % CREW_COLORS.length], x, y, vx: 0, vy: 0, face: -Math.PI / 2, walk: 0, mode: 'inside', cover: 0, health: 'ok', hurtT: 0, treat: null, lamp: true,
           input: makeInput(), inv: { weapon: null, item: null, cd: 0 }, ui: { panel: null, override: null, hits: [] }, prompt: null, hover: null };
}
const crew = [makeCrew('You')];
let me = crew[0];                                  // the crew member this browser plays (solo: the only one)
me.input = localInput; me.inv = inv; me.ui = ui;
let player = me, keys = me.input.keys, pressed = me.input.pressed, mouse = me.input.mouse;
const held = (...codes) => codes.some(c => keys.has(c));
// Run fn with crew member c as the acting crew (restores the previous one afterwards).
function withCrew(c, fn) {
  const saved = [player, keys, pressed, mouse, inv, ui, prompt, hover];
  player = c; keys = c.input.keys; pressed = c.input.pressed; mouse = c.input.mouse; inv = c.inv; ui = c.ui; prompt = c.prompt; hover = c.hover;
  try { return fn(); } finally { c.prompt = prompt; c.hover = hover; [player, keys, pressed, mouse, inv, ui, prompt, hover] = saved; }
}
const isOutside = (c) => c.mode === 'eva' || c.mode === 'gun';
// Debug: index.html#overview shows the whole ship, index.html#x,y starts the player there.
const DEBUG_OVERVIEW = location.hash === '#overview' || /[&#]ov(&|$)/.test(location.hash);
{ const m = location.hash.match(/^#([\d.]+),([\d.]+)$/); if (m) { player.x = +m[1]; player.y = +m[2]; } }
let prompt = null, time = 0, debugOpen = false, hover = null;
// Debug: index.html#do=3,6 runs debug-menu entries 3 and 6 on start (see DEBUG_ITEMS);
// adding &w=4 fast-forwards the simulation by 4 seconds first (handy for screenshots).
const DEBUG_DO = (location.hash.match(/^#do=([\da-zA-Z,-]+)/) || [])[1]?.split(',') || [];
const DEBUG_WARP = +(location.hash.match(/&w=([\d.]+)/) || [])[1] || 0;
const playerOutside = () => isOutside(player);

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------
function canStand(x, y, rects) {
  const r = CREW_R;
  return [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]]
    .every(([cx, cy]) => rects.some(R => inRect(cx, cy, R)) && !SOLIDS.some(S => inRect(cx, cy, S, 0)))
    && !SOLIDS.some(S => inRect(x, y, S, 0));                        // (the middle too, so thin things like the treadmill rails block)
}

// Safety net: if someone ends up where they can't stand (a door or car moved out from under
// them), move them to the nearest spot where they can, instead of freezing them in place.
function nearestFree(x, y, ok) {
  if (ok(x, y)) return null;
  for (let r = 0.05; r <= 3; r += 0.05)
    for (let k = 0; k < 24; k++) {
      const px = x + Math.cos(k / 24 * TAU) * r, py = y + Math.sin(k / 24 * TAU) * r;
      if (ok(px, py)) return [px, py];
    }
  return null;
}
function unstick(c, ok) { const p = nearestFree(c.x, c.y, ok); if (p) { [c.x, c.y] = p; c.vx = c.vy = 0; } }

// The soft edge of a spacewalk (see EVA_REACH, js/ship.js): past EVA_SOFT of the way out, the most you can drift
// outwards fades away towards the edge, so holding a key away from the ship slows you to a stop; while you don't
// push outwards you drift gently back in (EVA_PULL at the very edge, nothing at EVA_SOFT). Along or back in: free.
const EVA_PULL = 0.9;
function evaDrift(c, tx, ty) {
  const r = evaReach(c.x, c.y);
  if (r.e <= EVA_SOFT) return;
  const f = Math.min(1, (r.e - EVA_SOFT) / (1 - EVA_SOFT)), out = c.vx * r.nx + c.vy * r.ny;
  const most = tx * r.nx + ty * r.ny > 0.1 ? EVA_SPEED * (1 - f) * (1 - f) : -EVA_PULL * f;
  if (out > most) { c.vx += (most - out) * r.nx; c.vy += (most - out) * r.ny; }
}

function updateCrew(c, dt, ix, iy) {
  if (c.health === 'down' || c.health === 'out') { ix = iy = 0; }          // can't move while down
  if (typeof s7Holding === 'function' && s7Holding(c)) { ix = iy = 0; c.vx = c.vy = 0; }   // held by one of S-7's tendrils (js/culture.js): aim and shoot, but no walking
  const eva = c.mode === 'eva', floaty = eva || (c.mode === 'inside' && noGravAt(c.x, c.y) && !perk(c, 'boots'));
  const len = Math.hypot(ix, iy), speed = (eva ? EVA_SPEED : WALK_SPEED) * (c.health === 'hurt' ? HURT_SPEED : 1) * crewSpeedMul(c) * (c.slow || 1) * gearSpeed(c);
  const tx = len ? ix / len * speed : 0, ty = len ? iy / len * speed : 0;
  const k = Math.min(1, (floaty ? EVA_ACCEL * (eva ? 1 : 0.5) : WALK_ACCEL) * dt / speed);
  c.vx = lerp(c.vx, tx, k); c.vy = lerp(c.vy, ty, k);
  if (eva) evaDrift(c, tx, ty);
  const ok = eva ? (x, y) => evaOk(x, y) : (() => { const rects = walkRects(); return (x, y) => canStand(x, y, rects); })();
  unstick(c, ok);
  // (a docked ship's rooms: no floating in; anyone the ship docked onto may float out)
  const go = eva && typeof dockBlocksEva === 'function' && !dockBlocksEva(c.x, c.y) ? (x, y) => ok(x, y) && !dockBlocksEva(x, y) : ok;
  const nx = c.x + c.vx * dt;
  if (go(nx, c.y)) c.x = nx; else c.vx = 0;
  const ny = c.y + c.vy * dt;
  if (go(c.x, ny)) c.y = ny; else c.vy = 0;
  airlockThreshold(c, tx, ty);                        // stepping out of / floating into an open outer airlock (js/airlock.js)
  if (c.mode === 'inside' && inRect(c.x, c.y, TREADMILL)) {          // on the treadmill: the belt carries you back
    const belt = speed * BELT_K, by = c.y + belt * dt;                // (half of this crew member's own walking speed)
    if (ok(c.x, by)) c.y = by;
    if (len) c.walk += belt * dt * 3.2;                       // (and your legs keep going)
  }
  const sp = Math.hypot(c.vx, c.vy), m = c.input && c.input.mouse;
  const look = c.lookT > 0 && m && Number.isFinite(m.wx) && Number.isFinite(m.wy) && Math.hypot(m.wx - c.x, m.wy - c.y) > 0.25;
  if (c.aim != null && standing(c)) c.face = c.aim;               // arrow keys: point that way
  else if (look && standing(c)) c.face = Math.atan2(m.wy - c.y, m.wx - c.x);   // the mouse moved / you fired at it: look there
  else if (len && sp > 0.3) c.face = Math.atan2(c.vy, c.vx);       // otherwise: the way you walk
  if (c.lookT > 0) c.lookT = Math.max(0, c.lookT - dt);
  c.walk += sp * dt * (eva ? 1.2 : 3.2);
}

// ---------------------------------------------------------------------------
// Inner doors (DOORS in js/ship.js: the doorways and the deck doors). Closed until a crew member (or a
// friendly NPC) is in front of one; shut again DOOR_LINGER s after nobody is; never on anyone in the doorway.
// Locked, broken or with a pressure difference across it, a door doesn't open by itself: the manual override
// (forceDoor). Every door opens for anyone, intruders and pirates too; a locked one only humans override: pirates force it,
// slowly (pryDoor); intruders wait.
// ---------------------------------------------------------------------------
const DOOR_SENSE = 1.0, DOOR_LINGER = 1.0;          // reach of the sensor; s it stays open after
// (2026-10-22, the user: a noticeable delay at a shut door: it reacts DOOR_DELAY s after someone steps up (a hiss), then
// slides open in DOOR_TIME s: ~0.75 s until you can pass. An open door stays open for whoever follows.)
// (2026-10-24: the delay is the lock: its bolts slide back (d.bolt 1 -> 0) before the leaves move, and shoot home again
// once they're shut. The 'doors' ship upgrade (js/progress.js applyShipUpgrades) makes both 40% quicker: DOOR_TIMES.fast.)
const DOOR_TIMES = { base: { slide: 0.6, delay: 0.4 }, fast: { slide: 0.36, delay: 0.24 } };
let DOOR_TIME = DOOR_TIMES.base.slide, DOOR_DELAY = DOOR_TIMES.base.delay;   // s to slide open / shut; s to unbolt first
const DOOR_HOLD = 5;                                // s a forced pressure door stays open (the rooms equalize meanwhile)
const DOOR_PRY_LOCKED = 8;                 // s pirates need to force a locked or broken door (an unlocked one opens for them)

// Who the door sensors open for: crew aboard on their feet, and a friendly NPC walking through our ship.
// (2026-10-21, the user: every door opens for anyone, aliens and pirates too; only a locked one (security, a pressure loss)
// stays shut, and only humans can override that: the crew, pirates (pryDoor); aliens wait)
const doorFriends = () => [...crew.filter(c => c.mode === 'inside' && standing(c)),
  ...(typeof dk !== 'undefined' && dk.npc && dk.npc.state !== 'down' && roomAt(dk.npc.x, dk.npc.y) ? [dk.npc] : []),
  ...boarding.invaders.filter(a => a.mode === 'inside' && roomAt(a.x, a.y)), ...(typeof dk !== 'undefined' ? dk.pirates.filter(p => roomAt(p.x, p.y)) : [])];
// Everyone a door must not shut on (anything with a body inside the ship).
const actors = () => [...crew.filter(c => c.mode === 'inside'), ...boarding.invaders.filter(a => a.mode === 'inside'),
  ...(typeof dk !== 'undefined' ? [...dk.pirates, ...(dk.npc ? [dk.npc] : [])] : [])];
const doorBroken = (d) => d.axis === 'y' && broken(d);
// Pressure difference across it: vacuum (a breach, a vent, or let in through an open door) on one side only.
function doorPressure(d) {
  const rs = doorRooms(d);
  return rs.length === 2 && vacuumRoom(rs[0].id) !== vacuumRoom(rs[1].id);
}
// Why it won't open by itself (null: it works).
const doorStuck = (d) => doorBroken(d) && !d.jammed ? 'broken' : d.locked ? 'locked' : d.blast ? 'blast' : d.axis === 'y' && sporeGlitching(d) ? 'spores' : null;
function updateDoors(dt) {
  const friends = doorFriends(), bodies = actors();
  for (const d of DOORS) {
    if (!doorBroken(d)) d.jammed = false;            // (repaired: works again)
    d.hold = Math.max(0, (d.hold || 0) - dt);
    d.blast = doorPressure(d);
    if (d.pry > 0 && !(d.pryAt > time - 0.25)) d.pry = Math.max(0, d.pry - dt * 0.1);   // (nobody forcing it any more: slowly back)
    if (d.axis === 'y' && sporeGlitching(d) && !d.hold && !d.jammed) continue;   // spores in its motor (js/spores.js): it sticks where it is
    const auto = !doorStuck(d), at = auto ? friends.find(c => nearDoor(d, c.x, c.y, DOOR_SENSE)) : null;
    const before = d.sense || 0;
    d.sense = at ? Math.min(DOOR_DELAY, before + dt) : d.open > 0 ? DOOR_DELAY : 0;   // (the sensor's reaction; an open door: at once)
    if (at && before < DOOR_DELAY && d.sense >= DOOR_DELAY && d.open === 0 && crew.includes(at)) sfxFor(at, 'hatch');
    d.stay = at && d.sense >= DOOR_DELAY ? DOOR_LINGER : Math.max(0, (d.stay || 0) - dt);
    const inIt = d.open > 0.25 && bodies.some(c => inRect(c.x, c.y, d, CREW_R));
    const want = d.hold > 0 || d.jammed || inIt || (auto && d.stay > 0);
    d.open = clamp(d.open + (want ? dt : -dt) / DOOR_TIME, 0, 1);
    // the lock (drawing only, js/art.js drawDoorLock): bolted while shut; someone at it: the bolts slide back as the
    // sensor reacts (gone exactly when the leaves start to move); shut again: they shoot home in DOOR_DELAY s
    d.bolt = d.open > 0 ? 0 : at ? Math.min(clamp((d.bolt ?? 1) + dt / DOOR_DELAY, 0, 1), 1 - d.sense / DOOR_DELAY) : clamp((d.bolt ?? 1) + dt / DOOR_DELAY, 0, 1);
  }
}
// The pressurized room a forced door would vent (null: none, both sides alike).
function doorVents(d) {
  if (!d.blast) return null;
  return doorRooms(d).find(r => !vacuumRoom(r.id)) || null;
}
// The manual override's last whack: unlocks it, forces a broken deck door open for good (until it's repaired),
// and holds a pressure door open for DOOR_HOLD s (the pressurized side vents through it meanwhile).
// With an airlock room venting (hz.vent: the vent panel), the rushing air holds it open as long as the vent runs, and
// the vent stays open at least VENT_TIME more (there's a whole room more to pump out): so one crew member can vent on
// through the ship, room after room (2026-10-22: spores further in, js/spores.js; e.g. the left airlock room, the deck
// door up to the left cannon room, then its door to the bridge). Every door held open by the vent is held as long too.
function forceDoor(d) {
  const vents = doorVents(d);
  d.locked = false;
  if (doorBroken(d)) d.jammed = true;
  if (vents) {
    d.hold = DOOR_HOLD;
    if (hz.vent) { hz.vent.t = Math.max(hz.vent.t, VENT_TIME); for (const q of DOORS) if (q.hold > 0) q.hold = Math.max(q.hold, hz.vent.t); }
    combatBanner(`${doorName(d)} forced — the ${vents.name.toLowerCase()} vents!`); sfx.whoosh?.();
  }
  else if (doorBroken(d)) d.hold = 0.5;
}
// Pirates (js/dock.js pirateStep): a door opens for them like for anyone; a locked or broken one they force (humans can do a
// manual override): standing at it for DOOR_PRY_LOCKED s (several pirates together are quicker). A door with vacuum behind it they
// leave alone (they wait: it would blow them about too). True while it's at it. tx, ty: where it's heading.
function pryDoor(p, dt, tx, ty) {
  const d = DOORS.find(d => d.open < DOOR_WALK && doorStuck(d) && nearDoor(d, p.x, p.y, 1.2, 0.3) && !d.blast && !(d.hold > 0) &&
    ((tx - p.x) * (d.x + d.w / 2 - p.x) + (ty - p.y) * (d.y + d.h / 2 - p.y) > 0 || nearDoor(d, tx, ty, 0.3, 0.3)));
  if (!d) { p.pry = -1; return false; }
  const need = DOOR_PRY_LOCKED, before = d.pry || 0;
  d.pry = before + dt / need; d.pryAt = time; p.pry = DOORS.indexOf(d);
  p.face = Math.atan2(d.y + d.h / 2 - p.y, d.x + d.w / 2 - p.x);
  if (!before) combatBanner(`A pirate is forcing the ${doorName(d).replace(/^Door/, 'door')}!`);
  if (Math.floor(d.pry * need / 0.6) !== Math.floor(before * need / 0.6)) {
    sfx.clank();
    for (let i = 0; i < 4; i++) combatFx(p.x + Math.cos(p.face) * 0.45, p.y + Math.sin(p.face) * 0.45, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.3, '#ffd28a', 0.07);
  }
  if (d.pry >= 1) {
    d.pry = 0; d.locked = false;
    if (doorBroken(d)) d.jammed = true; else d.hold = 2;
    combatBanner(`Pirates forced the ${doorName(d).replace(/^Door/, 'door')} open!`); sfx.clank();
  }
  return true;
}

// (Outer airlocks: walked through since 2026-10-21, a chamber with two doors: js/airlock.js.)

// ---------------------------------------------------------------------------
// Player input and interaction
// ---------------------------------------------------------------------------
// World point under the acting crew member's mouse (each browser computes it from its camera).
function mouseWorld() { return [mouse.wx, mouse.wy]; }
// (the ground plane, z = 0: in the tilted sprite view the screen's y is the ground's y × sin 50°)
function screenToWorld(sx, sy) { const v = camera(); return [(sx - v.ox) / (v.zoom * T), (sy - v.oy) / (v.zoom * T * v.sy)]; }

// A cannon aimed with the keys: kx / ky (-1..1, screen directions: up is -y) is where the barrel turns
// towards, at GUN_TURN, the short way inside its arc (pressing past the arc's edge stops at the edge;
// straight behind the cannon, e.g. down on the front cannon, does nothing). Returns the new aim, clamped
// to the arc either way. Used by the server's sim (updatePlayer) and the gunner's own browser (netPredict).
function gunKeyTurn(g, kx, ky, dt) {
  const arc = gunArc(g), d0 = wrapAngle(g.aim - g.a), d = clamp(d0, -arc, arc);
  let want = d;
  if (kx || ky) { const w = wrapAngle(Math.atan2(ky, kx) - g.a); if (Math.abs(w) < Math.PI - 0.05) want = clamp(w, -arc, arc); }
  if (want === d0) return g.aim;                     // (resting inside the arc: exactly as it was, no rounding creep)
  return g.a + d + clamp(want - d, -GUN_TURN * dt, GUN_TURN * dt);
}

function updatePlayer(dt) {
  const block = (debugOpen && player === me) || !!ui.panel || !!mission.over;
  if (ui.override && !mission.over && keys.has('KeyE') && !player.eUsed && !pressed.has('Escape')) { pressed.delete('KeyE'); overrideHit(); }   // E hits, like the button (held: again after each swing)
  if (!ui.panel && pressed.has('Escape') && typeof levSkip === 'function' && levSkip()) pressed.delete('Escape');   // skips the leviathan's ending (js/leviathan.js)
  if (ui.panel && (pressed.has('KeyE') || pressed.has('Escape')) && tutAllows('closePanel')) { ui.panel = null; ui.override = null; ui.mini = null; pressed.delete('KeyE'); player.eUsed = true; }
  if (!keys.has('KeyE')) player.eUsed = false;           // (E that did something stays used until it's let go)
  const ix = block ? 0 : (held('KeyD') ? 1 : 0) - (held('KeyA') ? 1 : 0);   // WASD walks, the arrow keys aim
  const iy = block ? 0 : (held('KeyS') ? 1 : 0) - (held('KeyW') ? 1 : 0);
  const ax = block ? 0 : (held('ArrowRight') ? 1 : 0) - (held('ArrowLeft') ? 1 : 0), ay = block ? 0 : (held('ArrowDown') ? 1 : 0) - (held('ArrowUp') ? 1 : 0);
  player.aim = ax || ay ? Math.atan2(ay, ax) : null;
  if (!block && (mouse.look || ((mouse.right || mouse.rightClick) && inv.weapon))) player.lookT = LOOK_TIME;   // (js/net.js netPredict: the same)
  const use = !block && pressed.has('KeyE');   // (only the cannon still reads E directly: climbing down)
  prompt = null;

  if (player.health === 'down' || player.health === 'out') {     // can't do anything but get patched up
    const self = treatInfo(player);
    if (player.mode === 'gun') {                                // slumped in the cannon's seat: no aiming, no firing (updateInteraction: patching)
      const where = player.gun.name.toLowerCase();
      prompt = { text: self ? `${player.health === 'out' ? 'Out cold' : 'Down'} in the ${where} — hold E (or click) to ${self.label} (${self.time} s)` : `Out cold in the ${where} — a crewmate has to pull you out at its ladder`, screen: true };
      return;
    }
    updateCrew(player, dt, 0, 0);
    prompt = { text: self ? `${player.health === 'out' ? 'Out cold' : 'Down'} — hold E (or click on yourself) to ${self.label} (${self.time} s)` : 'Out cold — a crewmate has to treat you (hold click or E on you, 2 s)', screen: true };
    return;
  }

  if (player.mode === 'gun') {
    const g = player.gun;
    // aim: WASD / the arrows steer the barrel towards that screen direction (gunKeyTurn) and put the
    // cannon in key mode (player.gunKeys: the mouse is ignored and a laser sight shows) until the mouse
    // really moves again (mouse.look: a mousemove event, not the camera sliding the world under it)
    const kx = clamp(ix + ax, -1, 1), ky = clamp(iy + ay, -1, 1);   // (js/net.js netPredict: the same)
    if (mouse.look) player.gunKeys = false;
    if (kx || ky) player.gunKeys = true;
    if (mouse.moved && !player.gunKeys) {
      const [wx, wy] = mouseWorld();
      g.aim = Math.atan2(wy - g.y, wx - g.x);
    }
    g.aim = gunKeyTurn(g, kx, ky, dt);
    // cover: a metal plate that rises in front of you and the cannon; no firing while it's up
    const covering = !block && tutAllows('cover') && (held('ShiftLeft', 'ShiftRight') || mouse.right);
    player.cover = clamp(player.cover + (covering ? dt : -dt) * COVER_SPEED, 0, 1);
    // reload: R (the on-screen RELOAD button is handled by the browser and sent as a command)
    if (!block && pressed.has('KeyR') && tutAllows('reload')) reloadCannon(g);
    if (!mouse.down) player.gunReady = true;            // the click that got you in doesn't fire: let go first
    if (!block && player.cover < 0.3 && tutAllows('fire') && ((mouse.down && !mouse.suppress && player.gunReady) || held('Space'))) fireCannon(g);
    // the gunner always sits opposite the barrel
    player.x = g.x - Math.cos(g.aim) * GUNNER_OFFSET; player.y = g.y - Math.sin(g.aim) * GUNNER_OFFSET; player.face = g.aim;
    prompt = { text: player.cover > 0.5 ? 'Cover up — let go to fire again'
                                        : broken(g) ? `${g.name} is BROKEN — repair it at its ladder`
                                        : g.shots ? `${g.name} · click / Space: fire · hold right click / Shift: cover`
                                        : `${g.name} is empty — R or RELOAD (1 energy)`, screen: true };
    if (use && tutAllows('climbDown')) climbDown();
    return;
  }

  updateCrew(player, dt, ix, iy);

  if (player.mode === 'eva') {                        // (cannons are only manned from inside, via their ladders; spacewalks are for other jobs)
    dockEntryAct() || airlockAct();                    // back in: a docked ship's way in (js/dockentry.js), the outer airlock (js/airlock.js)
    return;
  }

  // inside: whatever you're standing next to
  const button = SHIELD_BUTTONS.find(b => Math.hypot(player.x - b.x, player.y - (b.y + 0.7)) < 1.1);
  const ladder = GUNS.find(g => Math.hypot(player.x - g.hatch[0], player.y - g.hatch[1]) < 0.9);
  const door = DOORS.filter(d => doorStuck(d) || d.jammed).find(d => nearDoor(d, player.x, player.y, DOOR_SENSE + 0.3, 0.3));   // one that won't open by itself
  if (ladder) {
    const at = { x: ladder.hatch[0], y: ladder.hatch[1], r: 0.7 }, inIt = crew.find(c => c !== player && c.mode === 'gun' && c.gun === ladder);
    if (inIt && !standing(inIt)) act({ text: `Click: pull ${inIt.name} out of the ${ladder.name.toLowerCase()}`, at, run: () => pullOutOfCannon(inIt, ladder) });
    else if (inIt) act({ text: `${inIt.name} is manning the ${ladder.name.toLowerCase()}`, at });
    else act({ text: `Click: climb into the ${ladder.name.toLowerCase()}`, at, noE: crew.some(c => c !== player && c.mode === 'inside' && !standing(c) && near(c.x, c.y)),   // (someone down right here, e.g. just pulled out: E treats them first)
               run: () => { player.mode = 'gun'; player.gun = ladder; player.vx = player.vy = 0; mouse.moved = 0; player.gunReady = false; player.gunKeys = false; } });
  } else if (button) {
    const s = combat.shields[button.side], cap = CAPACITORS[SIDE_CAP[button.side]], at = { x: button.x, y: button.y, r: 0.7 };
    if (broken(button)) act({ text: 'Shield button is broken', at });
    else if (sporeGlitching(button)) act({ text: `Shield button: ${sporeGlitchText(button, 'it doesn\'t press')}`, at });
    else if (sporeGlitching(cap) && s.up <= 0 && s.cd <= 0) act({ text: `${['Left', 'Middle', 'Right'][SIDE_CAP[button.side]]} capacitor: ${sporeGlitchText(cap, 'no energy for the shield')}`, at });
    else if (broken(emitterOf(button.side))) act({ text: `${SIDE_LABEL[button.side]} shield emitter (outside) is broken — fix it on a spacewalk`, at });
    else if (s.up > 0) act({ text: `Shield is up! (${Math.ceil(s.up)} s)`, at, ok: true });
    else if (s.cd > 0) act({ text: `Shield recharging (${s.cd.toFixed(1)} s)`, at });
    else if (cap.charge <= 0 || broken(cap)) act({ text: broken(cap) ? 'Capacitor broken — no shield' : 'No energy for the shield (capacitor empty)', at });
    else act({ text: `Click: raise the ${SIDE_LABEL[button.side].toLowerCase()} shield (${SHIELD_UP_TIME} s, 1 energy)`, at, run: () => pressShield(button.side) });
  } else if (dockAct()) {
  } else if (airlockAct()) {                         // the outer airlocks (js/airlock.js)
  } else if (dockEntryAct()) {                       // the base's service hatch from inside (js/dockentry.js)
  } else if (typeof levAct === 'function' && levAct()) {   // the boss fight's engine override, not ready yet: why (js/leviathan.js)
  } else if (door) doorAct(door);
}
// In front of a door that won't open by itself: why, and the manual override (E / click).
function doorAct(d) {
  const [cx, cy] = doorCenter(d), at = { x: cx, y: cy, r: d.axis === 'y' ? 1.6 : 1.2 }, name = doorName(d), why = doorStuck(d);
  const vents = doorVents(d), here = roomAt(player.x, player.y);
  const warn = vents ? ` — vents the ${vents.name.toLowerCase()}!` : '';
  if (!why) { act({ text: `${name} is broken — forced open (repair it with the kit)`, at }); return; }
  if (why === 'spores') { act({ text: `${name}: ${sporeGlitchText(d, 'its motor sticks')}`, at }); return; }
  if (vents && vents.id === 'reactor') {             // (never: the cat lives there)
    act({ text: here?.id === 'reactor' ? `${name}: vacuum behind it, and the cat lives here. Go around.` : `${name}: sealed — vacuum on this side, and the cat lives in the reactor room. Go around.`, at });
    return;
  }
  const reason = why === 'broken' ? 'broken, stuck shut' : why === 'locked' ? 'locked' : 'pressure difference (vacuum on one side)';
  act({ text: `${name}: ${reason}. Click / E: manual override${warn}`, at,
        run: () => startOverride(d, why === 'blast' ? `${name} (vacuum)` : name, () => forceDoor(d)) });
}

// What the mouse is on: a specific click target wins over the (larger) spot of the current prompt.
function pickHover(c, mx, my) {
  const p = promptHover(c, mx, my), t = clickTarget(mx, my);
  return t && (t.ok || !p) ? t : p || t;
}
// Pointing at the spot of your current prompt shows it as the hover tooltip.
function promptHover(c, mx, my) {
  const p = c.prompt;
  if (!p?.at || !standing(c) || Math.hypot(mx - p.at.x, my - p.at.y) > p.at.r) return null;
  return { text: p.text, ok: p.ok, x: p.at.x, y: p.at.y, r: p.at.r };
}

// What you can do with the thing you're next to: shown as a prompt; clicking it (or E) does it.
// p: { text, at: {x, y, r} (where to click), run?, ok? }
// (Repairs are Space / right click with the repair kit since 2026-10-20: E and click always do the thing that's there.)
function act(p) {
  prompt = { ok: !!p.run || !!p.ok, ...p };
  if (!p.run) return;
  if (!tutAllows('target', p)) { prompt.ok = false; const no = typeof trainDenyText === 'function' && trainDenyText(player, p); if (no) prompt.text = no; return; }   // tutorial: not what this step asks for (crew training: someone else's station)
  if (!p.noE) prompt.eAct = true;                    // (E does this: its spot gets the solid ring)
  if ((debugOpen && player === me) || ui.panel || mission.over) return;
  const m = mouseWorld(), onIt = p.at && Math.hypot(m[0] - p.at.x, m[1] - p.at.y) <= p.at.r && !clickTarget(m[0], m[1])?.ok;   // something more specific under the mouse wins
  const eForMe = pressed.has('KeyE') && !ui.panel && !p.noE;   // (E goes by where you stand, never by the mouse; noE: E goes to something more urgent nearby)
  if ((mouse.click && onIt) || eForMe) { mouse.click = false; if (eForMe) player.eUsed = true; pressed.delete('KeyE'); p.run(); }
}

// Mouse in the world: left click grabs / uses / repairs (hold), right click attacks.
// E does the same as a click on whatever is highlighted: under the mouse, or else the nearest thing
// in reach (hold E for hold jobs). Space fires the weapon the way you face.
function updateInteraction(dt) {
  hover = null;
  if (mission.over || ui.panel) { player.repair = null; player.treat = null; player.hold = null; player.charge = null; return; }
  if (player.mode === 'gun' && !standing(player)) {               // down in a cannon: hold click (or E) to patch yourself up
    const info = treatInfo(player);
    player.repair = null; player.hold = null; player.charge = null;
    updateTreat(dt, info && { treat: player, time: info.time }, mouse.down || keys.has('KeyE'));
    return;
  }
  if (player.mode === 'gun') { player.repair = null; player.treat = null; player.hold = null; player.charge = null; return; }
  const [mx, my] = mouseWorld();
  hover = player === me && invSlotAt(mouse.x, mouse.y) ? null : pickHover(player, mx, my);   // (on the inventory: that's a HUD click)
  if (hover?.ok && !tutAllows('target', hover)) hover = { text: (typeof trainDenyText === 'function' && trainDenyText(player, hover)) || hover.text, ok: false, x: hover.x, y: hover.y, r: hover.r };   // tutorial: only what the step asks for
  let target = hover, holding = mouse.down && !mouse.suppress, click = mouse.click;
  const eDown = keys.has('KeyE') && !player.eUsed, eTap = pressed.has('KeyE') && !player.eUsed;
  if (!standing(player)) {                         // down / out: holding E alone patches you up, wherever the mouse is (or hold click on yourself)
    const self = treatInfo(player), onMe = hover?.treat === player;   // (down, that is all you can do: nothing else to take E's priority)
    target = self && { treat: player, time: self.time, ok: true, x: player.x, y: player.y, r: 0.55 };
    holding = keys.has('KeyE') || (onMe && holding); click = pressed.has('KeyE') || (onMe && click);
  } else if (!mouse.down) {
    const e = nearbyTarget(eDown || eTap);          // E: what's nearest (and in front of you), wherever the mouse is
    if (e && (!prompt?.run || prompt.noE) && !prompt?.screen)            // show what E would do
      prompt = ePromptOf(e);
    const eLetGo = player.eHeld && !keys.has('KeyE');
    const treating = e?.treat && player.treat?.id === e.treat.id && !mouse.down;   // (letting go of E for a moment keeps a treatment going, as with the mouse)
    if (eDown || eTap || eLetGo || treating) { target = e; holding = eDown; click = eTap; }   // (letting go of E counts too: quick taps)
    if ((eDown || eTap || eLetGo) && e?.eHold) {                // E on a tap-or-hold thing (the power lever): nothing on the press,
      const eh = e.eHold;                          // a tap on letting go, the hold action once held long enough
      if ((eLetGo && player.hold?.id === 'eHold') || (eTap && !eDown)) eh.tap();
      target = { ...e, run: null, hold: { id: 'eHold', time: eh.time, exact: true, label: eh.label, done: () => { eh.hold(); player.eUsed = true; } } };
      click = false;
    }
  }
  player.eHeld = eDown;
  if (target?.kit) target = null;                   // (the repair kit's jobs are Space / right click, below)
  if (target?.run && click) { target.run(); mouse.click = false; player.eUsed = true; }
  // the repair kit: hold Space / right click repairs the part (or does the kit job) in reach: the one at the mouse with
  // right click, else the one you face, or the one under the mouse; shown next to whatever E / click would do there
  const up = standing(player), rHeld = up && (mouse.right || keys.has('Space'));
  let rp = up ? repairPick(mx, my, mouse.right || (!keys.has('Space') && overKitTarget(mx, my))) : null;
  if (rp && !tutAllows('target', rp)) rp = null;
  const kitHold = rHeld && !!rp?.hold;
  updateHold(dt, kitHold ? rp : target, kitHold || holding);
  updateTreat(dt, target, holding, click);
  if (!up) { player.charge = null; player.repair = null; return; }      // down: no weapons, no repairs
  if (rp && !prompt?.screen) {
    const how = player.repair || (kitHold && player.hold) ? `${repairText(rp).replace(/\s*\([^)]*\)$/, '')}…` : `hold Space / right click: ${repairText(rp)}`;
    prompt = prompt?.text ? { ...prompt, text: `${prompt.text}  ·  ${how}`, rep: how } : { text: how[0].toUpperCase() + how.slice(1), ok: true, rep: how, at: { x: rp.x, y: rp.y, r: rp.r } };
  }
  updateRepair(dt, rp?.repair ? rp : null, rHeld && !!rp?.repair);
  if (tutAllows('weapon')) updateWeapon(dt, mx, my, !!rp);
}
// The prompt that says what E does with target e (also worked out in the browser in multiplayer: js/net.js netLocalPrompt).
const ePromptOf = (e) => ({ text: e.eHold?.text || e.text.replace(/^Hold click:/, 'Hold E:').replace(/^Click:/, 'E:').replace('quick click:', 'tap E:'), ok: true, e: true, eAct: true, at: { x: e.x, y: e.y, r: e.r, z: e.z, hullTop: e.hullTop } });
// Something a click (or E) does something with; a prompt's spot (promptHover) is only its tooltip: act() runs it.
const actionable = (t) => !!t?.ok && !t.kit && !!(t.run || t.repair || t.treat || t.hold);   // (kit jobs: Space / right click)
// The nearest thing in reach that a click would do something with (for E). Rescanned every tick
// while E is down, otherwise a few times a second (it's only shown as a prompt then); in between, the
// same spot is asked again, so its text stays fresh (the lever's "turn to …" changes with every turn).
function nearbyTarget(now) {
  const memo = player.eScan;
  if (!now && memo && time - memo.t < 0.15 && time >= memo.t) {
    const t = memo.at && clickTarget(memo.at[0], memo.at[1]);
    return actionable(t) && tutAllows('target', t) ? t : null;
  }
  let best = null, bd = Infinity, at = null;
  if (player.mode === 'inside' || player.mode === 'eva')
    for (let gx = -REACH; gx <= REACH; gx += 0.3) for (let gy = -REACH; gy <= REACH; gy += 0.3) {
      if (gx * gx + gy * gy > REACH * REACH) continue;
      const t = clickTarget(player.x + gx, player.y + gy);
      if (!actionable(t) || !tutAllows('target', t)) continue;
      const d = Math.hypot(t.x - player.x, t.y - player.y), f = player.face ?? 0;   // (the way you face counts a little)
      const sc = d * (1.2 - 0.2 * Math.cos(Math.atan2(t.y - player.y, t.x - player.x) - f));
      if (sc < bd) { bd = sc; best = t; at = [player.x + gx, player.y + gy]; }
    }
  player.eScan = { t: time, target: best, at };
  return best;
}

function climbDown() {
  if (player.mode !== 'gun' || !standing(player)) return;        // (down in the seat: someone has to pull you out)
  const g = player.gun;
  player.cover = 0; player.vx = player.vy = 0;
  player.mode = 'inside'; [player.x, player.y] = g.hatch;
  player.gun = null;
}

// Commands: actions that come from a browser's own UI (panels, buttons, debug menu) instead of
// raw input. Run in the acting crew member's context: directly when solo, on the server in multiplayer.
function runCommand(cmd) {
  const [kind, arg] = cmd;
  if (kind === 'lock') { const l = lockables()[arg]; if (l) { l.ref.locked = !l.ref.locked; sfx.clank(); } }
  else if (kind === 'bonk') { if (ui.override) overrideHit(); }
  else if (kind === 'closePanel') { ui.panel = null; ui.override = null; ui.mini = null; }
  else if (kind === 'mini') miniCommand(arg, cmd[2], cmd[3]);
  else if (kind === 'reload') { if (player.mode === 'gun' && standing(player) && tutAllows('reload')) reloadCannon(player.gun); }
  else if (kind === 'climbDown') { if (tutAllows('climbDown')) climbDown(); }
  else if (kind === 'reboot') rebootSwitch(arg);
  else if (kind === 'practice') runPractice(arg);
  else if (kind === 'debug') DEBUG_ITEMS.find(it => it.key === arg)?.run();
  else if (kind === 'drop') { if (tutAllows('drop') && (arg === 'weapon' || arg === 'item')) dropSlot(arg); }   // (a click on an inventory slot)
  else if (kind === 'claim') claimCommand(arg);       // a click on a sidebar plate: this one's mine (js/claims.js)
  else if (kind === 'train') { if (typeof trainCommand === 'function') trainCommand(arg); }   // a click on your crew training card (js/tutorial-mp.js)
  else if (kind === 'lamp') player.lamp = !player.lamp;   // the helmet lamp (L): drawing only, see js/lights.js
}
// Tutorial gate (js/tutorial.js): while the tutorial runs, only what its current step asks for works
// (interaction targets, cannon fire / reload / cover, climbing down, closing panels, hand weapons).
// Crew training (js/tutorial-mp.js): a station reserved for someone else's lesson is closed to the acting crew member.
const tutAllows = (what, arg) => (typeof tutorialAllows !== 'function' || tutorialAllows(what, arg)) && (typeof trainAllows !== 'function' || trainAllows(player, what, arg));
let sendCommand = (cmd) => withCrew(me, () => runCommand(cmd));   // multiplayer replaces this


// ---------------------------------------------------------------------------
// Debug menu (` key)
// ---------------------------------------------------------------------------
function teleportToGun(id) {
  const g = GUNS.find(g => g.id === id);
  player.mode = 'gun'; player.gun = g; mouse.moved = 0; player.gunReady = false; player.gunKeys = false;
}
const DEBUG_ITEMS = [
  { key: '1', label: 'Enemy left: Interceptor', run: () => combatSpawn('interceptor', 'port', true) },
  { key: '2', label: 'Enemy right: Interceptor', run: () => combatSpawn('interceptor', 'star', true) },
  { key: '3', label: 'Enemy left: Frigate', run: () => combatSpawn('frigate', 'port', true) },
  { key: '4', label: 'Enemy right: Frigate', run: () => combatSpawn('frigate', 'star', true) },
  { key: '5', label: 'Asteroid swarm (front)', run: () => combatSpawn('swarm') },
  { key: '6', label: 'Teleport: left cannon', run: () => teleportToGun('port') },
  { key: '7', label: 'Teleport: front cannon', run: () => teleportToGun('front') },
  { key: '8', label: 'Teleport: right cannon', run: () => teleportToGun('star') },
  { key: '9', label: 'Teleport: bridge', run: () => { player.mode = 'inside'; player.gun = null; player.x = 22.2; player.y = 4.5; } },
  { key: 'i', label: 'Intruder through the left airlock', run: () => spawnInvader('port') },
  { key: 'o', label: 'Intruder through the right airlock', run: () => spawnInvader('star') },
  { key: 'I', label: 'Saboteur through the left airlock', run: () => spawnSaboteur('port') },
  { key: 'P', label: 'Saboteur through the right airlock', run: () => spawnSaboteur('star') },
  { key: '0', label: 'Clear threats and reset hit counts', run: () => { combatClear(); boarding.invaders = []; boarding.bolts = []; } },
  { key: 'm', label: 'Restart the mission', run: () => { combatClear(); boarding.invaders = []; fires.length = 0; startMission(); } },
  { key: 'n', label: 'Stop the mission (free play)', run: () => { mission.active = false; } },
  { key: 'f', label: 'Start a fire next to you', run: () => spawnFire(player.x + 1, player.y) },
  { key: 'b', label: 'Break a random system', run: () => { const s = SYSTEMS.filter(s => !s.broken); if (s.length) breakSystem(s[Math.floor(Math.random() * s.length)]); } },
  { key: 'e', label: 'Fill all capacitors', run: () => CAPACITORS.forEach(c => { c.charge = CAP_MAX; }) },
  { key: 'h', label: 'Hull breach in this room (or the nearest)', run: () => { const r = roomAt(player.x, player.y); breachRoom(r && BREACH_SPOTS[r.id] ? r.id : 'portLock'); } },
  { key: 'j', label: 'Surge, no gravity, plasma fire (here)', run: () => { const r = roomAt(player.x, player.y) || ROOMS[0]; surgeColumn(r.col); failGravity(r.id); const s = SYSTEMS.filter(s => !burning(s)).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0]; igniteSystem(s, true); } },
  { key: 'k', label: 'Spacewalk jobs: mines, spores, debris, antenna, canister', run: () => { spawnMineDrone('port'); spawnSpores('star'); jamCannon('port'); knockAntenna(); spawnCanister('port'); } },
  { key: '-', code: 'Minus', label: 'Helmet lamp on / off (debug)', run: () => { player.lamp = !player.lamp; } },
  { key: 'l', label: 'Ship-wide: flare, storm, coolant leak, AI glitch', run: () => { startFlare(); startStorm(); startCoolantLeak(); startGlitch(); } },
  { key: 'z', label: 'Stealth fighter left, tractor tug right', run: () => { combatSpawn('stealth', 'port', true); combatSpawn('tractor', 'star', true); } },
  { key: 'c', label: 'Organic: grappler left, leeches + spore mother right, leviathan', run: () => { combatSpawn('grappler', 'port', true); combatSpawn('mother', 'star', true); spawnLeeches('star'); startLeviathan(); } },
  { key: 'd', label: 'Pirates dock left · derelict (box + engineer) right', run: () => { dockShip('pirate', 'port'); } },
  { key: 'r', label: 'Derelict with black box + engineer on the right', run: () => { dockShip('derelict', 'star', { blackbox: true, npc: true }); } },
  { key: 'G', label: 'Walk field overlay (floor scratches) on / off', run: () => { walkFieldShow = !walkFieldShow; } },
  { key: 'a', label: '', hidden: true, run: () => combatSpawn('grappler', 'port', true) },   // debug only
  { key: 't', label: '', hidden: true, run: () => { for (const e of combat.enemies) if (e.D.organic) for (const p of e.pois) hitPoi(e, p, e.x, e.y); } },   // debug only: finish off organic enemies
  { key: 's', label: '', hidden: true, run: () => combatSpawn('mother', 'star', true) },   // debug only
  { key: 'R', label: '', hidden: true, run: () => combatSpawn('pirate', 'port', true) },     // debug only (screenshots): one threat each
  { key: 'L', label: '', hidden: true, run: () => spawnLeeches('port') },
  { key: 'V', label: '', hidden: true, run: () => startLeviathan() },
  { key: 'M', label: '', hidden: true, run: () => spawnMineDrone('port') },
  { key: 'S', label: '', hidden: true, run: () => spawnSpores('port') },
  { key: 'T', label: '', hidden: true, run: () => combatSpawn('tractor', 'port', true) },
  { key: 'Z', label: '', hidden: true, run: () => { combatSpawn('stealth', 'port', true); combat.enemies.forEach(e => { e.reveal = 3; }); } },
  { key: 'O', label: '', hidden: true, run: () => { const h = HATCHES[0]; player.mode = 'eva'; player.gun = null; [player.x, player.y] = h.outside; } },   // debug only: step outside (screenshots)
  { key: 'p', label: '', hidden: true, run: () => pressShield('port') },          // debug only
  { key: 'y', label: '', hidden: true, run: () => radarScan() },
  { key: 'w', label: '', hidden: true, run: () => { power.lever.jammed = true; } },
  { key: 'u', label: '', hidden: true, run: () => { ui.panel = 'security'; DOORWAYS[2].locked = true; DECK_DOORS[1].locked = true; } },
  { key: 'g', label: '', hidden: true, run: () => openDiagnosis() },
  { key: 'v', label: '', hidden: true, run: () => { startOverride(DOORWAYS[0], 'Door'); ui.override.hits = 2; } },
  { key: 'q', label: '', hidden: true, run: () => pressShield('star') },          // debug only
  { key: 'x', label: '', hidden: true, run: () => {            // debug only: shoot the windshield crack
    const e = combat.enemies.find(e => e.kind === 'interceptor'); const p = e?.pois.find(p => p.id === 'crack');
    if (p) hitPoi(e, p, ...enemyToWorld(e, p.x, p.y));
  } },
];
function menuLayout() {
  const w = 380, rowH = 30, h = DEBUG_ITEMS.filter(it => !it.hidden).length * rowH + 64;
  return { x: VW / 2 - w / 2, y: (VH - h) / 2, w, h, rowH };
}
function updateDebug() {
  if (pressed.has('Backquote')) debugOpen = !debugOpen;
  if (!debugOpen) return;
  if (pressed.has('Escape')) { debugOpen = false; return; }
  const m = menuLayout();
  for (const [i, it] of DEBUG_ITEMS.filter(it => !it.hidden).entries()) {
    const hitRow = mouse.click && mouse.x > m.x && mouse.x < m.x + m.w && mouse.y > m.y + 44 + i * m.rowH && mouse.y < m.y + 44 + (i + 1) * m.rowH;
    if (pressed.has(it.code || (/\d/.test(it.key) ? 'Digit' + it.key : 'Key' + it.key.toUpperCase())) || hitRow) { sendCommand(['debug', it.key]); debugOpen = false; mouse.click = false; mouse.down = false; return; }
  }
}
function drawDebugMenu() {
  if (!debugOpen) return;
  const m = menuLayout();
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, VW, VH);
  rr(m.x, m.y, m.w, m.h, 10); ctx.fillStyle = 'rgba(14,17,24,0.95)'; ctx.fill(); stroke(2, '#5fd6a0');
  ctx.font = '700 15px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#e8ecf4';
  ctx.fillText('DEBUG MENU', m.x + 16, m.y + 22);
  ctx.font = '12px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5'; ctx.textAlign = 'right';
  ctx.fillText('number key or click · ` / Esc to close', m.x + m.w - 16, m.y + 22); ctx.textAlign = 'left';
  DEBUG_ITEMS.filter(it => !it.hidden).forEach((it, i) => {
    const y = m.y + 44 + i * m.rowH;
    const hover = mouse.x > m.x && mouse.x < m.x + m.w && mouse.y > y && mouse.y < y + m.rowH;
    if (hover) { ctx.fillStyle = 'rgba(95,214,160,0.12)'; ctx.fillRect(m.x + 6, y, m.w - 12, m.rowH); }
    rr(m.x + 16, y + 5, 22, 20, 4); ctx.fillStyle = '#262a33'; ctx.fill(); stroke(1.2, '#4b5263');
    ctx.fillStyle = '#5fd6a0'; ctx.font = '700 13px monospace'; ctx.textAlign = 'center'; ctx.fillText(it.key, m.x + 27, y + 15);
    ctx.textAlign = 'left'; ctx.fillStyle = '#e8ecf4'; ctx.font = '14px system-ui, sans-serif'; ctx.fillText(it.label, m.x + 50, y + 15);
  });
}

// ---------------------------------------------------------------------------
// Camera. Inside: about one room fills the screen, aimed at a blend of nearby room
// centers (weighted by how close you are), so moving between rooms glides. Outside it
// follows you; on a cannon it frames the cannon's field of fire. The whole ship only in the tutorial's tour
// and the debug menu (no Tab overview in the game: not knowing what's coming is part of it).
// Projection: with the sprite renderer (GFX.on) the view is tilted, 50° above the horizon:
// screen y = (y·sin50° − z·cos50°) × zoom·T (VIEW_SY = sin50°); the classic view is straight down.
// ---------------------------------------------------------------------------
const VIEW_ROOM = { w: 19, h: 13 };                 // layout units visible when zoomed in
const VIEW_SHIP = { x0: -3, y0: -5, x1: SHIP_W + 3, y1: SHIP_H + 6 };
const viewSy = () => (GFX.on ? GFX.SIN : 1);
const cam = { x: player.x, y: player.y, zoom: 0, overview: DEBUG_OVERVIEW ? 1 : 0, sx: 0, sy: 0 };
function roomDist(room, x, y) {
  return Math.min(...room.rects.map(q => Math.hypot(Math.max(q.x - x, 0, x - q.x - q.w), Math.max(q.y - y, 0, y - q.y - q.h))));
}
function cameraTarget() {
  const vh = VH - HUD_H - INV_RESERVE, vsy = viewSy(), zRoom =   // (the room fits between the top bar and the inventory)
    Math.min(VW / (VIEW_ROOM.w * T), vh / (VIEW_ROOM.h * T * vsy));
  if (player.mode === 'gun') {
    const [cx, cy, w] = player.gun.view;
    return [cx, cy, Math.min(VW / (w * T), vh / (w * 0.62 * T * vsy))];
  }
  if (player.mode === 'eva')
    return [player.x, player.y, zRoom * 0.75];
  let sw = 0, sx = 0, sy = 0;
  for (const room of [...ROOMS, ...dockRoomsForCamera()]) {
    const w = Math.exp(-((roomDist(room, player.x, player.y) / 1.6) ** 2));
    const [cx, cy] = roomCenter(room);
    sw += w; sx += w * cx; sy += w * cy;
  }
  if (sw < 0.05) return [player.x, player.y, zRoom];
  return [lerp(sx / sw, player.x, 0.3), lerp(sy / sw, player.y, 0.3), zRoom];
}
function updateCamera(dt) {
  const [tx, ty, tz] = cameraTarget();
  const tutView = typeof tutorialOverview === 'function' && tutorialOverview();   // (the tutorial's ship tour)
  const jumping = !!mission.over?.survived && isFinite(jumpOutT())                 // (jumping out: the whole ship in view)
    || (typeof breakupOverview === 'function' && breakupOverview());                 // (breaking up, js/breakup.js: the same)
  cam.overview = clamp(cam.overview + (DEBUG_OVERVIEW || tutView || jumping ? dt : -dt) * 4, 0, 1);
  const o = cam.overview * cam.overview * (3 - 2 * cam.overview);
  const vh = VH - HUD_H;
  const zShip = Math.min(VW / ((VIEW_SHIP.x1 - VIEW_SHIP.x0) * T), vh / ((VIEW_SHIP.y1 - VIEW_SHIP.y0) * T * viewSy()));
  const k = cam.zoom ? 1 - Math.exp(-2.6 * dt) : 1;
  cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k);
  cam.baseZoom = lerp(cam.baseZoom || tz, tz, k);
  cam.zoom = cam.baseZoom * Math.pow(zShip / cam.baseZoom, o);
  cam.ox = lerp(0, (VIEW_SHIP.x0 + VIEW_SHIP.x1) / 2 - cam.x, o);
  cam.oy = lerp(0, (VIEW_SHIP.y0 + VIEW_SHIP.y1) / 2 - cam.y, o);
  // a cutscene's frame (the leviathan's engine blast and farewell, js/leviathan.js levCinema): [x0, y0, x1, y1], glided to
  // and back from; it makes way for the jump's whole-ship view (levCinema is null once the mission's over)
  const C = typeof levCinema === 'function' ? levCinema() : null;
  if (C) cam.cineBox = cam.cineBox && cam.cine > 0 ? cam.cineBox.map((v, i) => lerp(v, C[i], 1 - Math.exp(-3 * dt))) : C;
  cam.cine = clamp((cam.cine || 0) + (C ? dt : -dt) * 1.4, 0, 1);
  if (cam.cine > 0 && cam.cineBox) {
    const c = cam.cine * cam.cine * (3 - 2 * cam.cine), [x0, y0, x1, y1] = cam.cineBox;
    const zC = Math.min(VW / ((x1 - x0) * T), (vh - INV_RESERVE * (1 - cam.overview)) / ((y1 - y0) * T * viewSy()));   // (above the inventory: camera())
    cam.zoom *= Math.pow(zC / cam.zoom, c);
    cam.ox = lerp(cam.ox, (x0 + x1) / 2 - cam.x, c); cam.oy = lerp(cam.oy, (y0 + y1) / 2 - cam.y, c);
  }
  const s = combat.shake * combat.shake * 0.35;        // big hits rattle the whole ship
  cam.sx = s * (Math.sin(time * 61) + 0.5 * Math.sin(time * 97)); cam.sy = s * (Math.cos(time * 53) + 0.5 * Math.sin(time * 89));
  const J = jumpCamera(time); cam.sx += J.x; cam.sy += J.y;          // the jump drive's rumble, the jump's lurch (js/mission.js)
  if (typeof breakupCamera === 'function') { const B = breakupCamera(time); cam.sx += B.x; cam.sy += B.y; }   // the hull groaning, the ship breaking up (js/breakup.js)
  const [ix, iy] = injuryShake(time); cam.sx += ix; cam.sy += iy;    // a hit on you: the camera jolts (updateInjuryFx)
}
// Screen (CSS px) = (ox + x·T·zoom, oy + y·T·zoom·sy) for a point on the ground.
function camera() {
  const x = cam.x + cam.ox + cam.sx, y = cam.y + cam.oy + cam.sy, sy = viewSy();
  const below = INV_RESERVE * (1 - (cam.overview || 0));   // (centred above the inventory; the whole-ship overview uses the full height)
  return { zoom: cam.zoom, sy, ox: VW / 2 - x * T * cam.zoom, oy: HUD_H + (VH - HUD_H - below) / 2 - y * T * cam.zoom * sy };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
// Down / out: lying flat with a pulsing red cross above (out = greyed and limp).
function drawCrewDown(c, t) {
  ctx.save(); ctx.translate(c.x * T, c.y * T);
  if (c.health === 'out') ctx.globalAlpha = 0.75;
  ctx.rotate(c.face + Math.PI / 2); ctx.scale(1, 0.85);
  drawCrew(0, 0, 0, 0, c.mode === 'eva', c.health === 'out' ? '#7a7f8a' : c.color);
  ctx.restore();
  drawDownCross(c, t);
}
// Where a crew member is drawn on the ground plane (a gunner: in the cannon's seat, up on the roof for the front one).
function crewDrawAt(c) {
  if (c.mode !== 'gun' || !c.gun) return [c.x, c.y];
  const [gx, gy] = gunnerAt(c);
  return [gx, gy - GFX.lift(gunZ(c.gun))];
}
function drawDownCross(c, t) {
  const [cx, cy] = crewDrawAt(c), k = 0.6 + 0.4 * Math.sin(t * 5), x = cx * T, y = (cy - 0.6 - GFX.lift(0.4)) * T;
  ctx.fillStyle = `rgba(226,60,50,${k})`; ctx.fillRect(x - 3, y - 9, 6, 18); ctx.fillRect(x - 9, y - 3, 18, 6);
  ctx.strokeStyle = 'rgba(20,22,27,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 3, y - 9, 6, 18); ctx.strokeRect(x - 9, y - 3, 18, 6);
}
// ---------------------------------------------------------------------------
// Injury feedback (drawing only: every browser works it out from the synced crew state, no extra
// network traffic). Playtesters played for an hour without noticing they were hurt (2026-10-21), so:
// - your own screen: a red haze at the border beating with your heart, blood splatter in the corners,
//   a red flash + a jolt of the camera the moment you're hit (stronger going down), a heartbeat sound;
// - a status badge above the energy panel (injuryStatus: what it means, how long, what helps);
// - in the world, for everyone: a hurt crew member drips blood on the floor as they walk (drops that fade
//   after BLOOD_LIFE s, at most BLOOD_MAX), a pool under the downed, droplets drifting off on a spacewalk,
//   and a red cross beside their name tag.
// ---------------------------------------------------------------------------
const INJURY_RANK = { ok: 0, hurt: 1, down: 2, out: 3 };
const BLOOD_MAX = 140, BLOOD_LIFE = 14, POOL_LIFE = 25, BLOOD_STEP = 0.38;   // drops: at most, s on the floor; a pool's s after getting up; tiles walked per drop
const INJ = { seen: new Map(), blood: [], flash: 0, flashDown: false, shake: 0, beat: -1, t: null, missionT: 0 };
const injuryRank = (c) => INJURY_RANK[c.health || 'ok'] || 0;
// The heart's lub-dub (0..1) at time t: faster while hurt, slow and heavy while down.
function heartPulse(t, period) {
  const p = (((t % period) + period) % period) / period;
  return Math.max(Math.exp(-(((p - 0.03) * 20) ** 2)), 0.7 * Math.exp(-(((p - 0.25) * 20) ** 2)));
}
const heartPeriod = (h) => h === 'down' ? 1.25 : 0.85;
function addBlood(b) {
  const d = { age: 0, seed: Math.random() * 1000, ...b };
  INJ.blood.push(d);
  if (INJ.blood.length > BLOOD_MAX) INJ.blood.splice(0, INJ.blood.length - BLOOD_MAX);   // (the oldest go first)
  return d;
}
// Once a frame from render(): hits on this browser's own player (flash, shake, sound), blood for everyone.
function updateInjuryFx(dt, t = time) {
  if (typeof mission !== 'undefined' && mission.t < INJ.missionT - 1) { INJ.blood.length = 0; INJ.seen.clear(); }   // a new mission
  INJ.missionT = typeof mission !== 'undefined' ? mission.t : 0;
  const ids = new Set();
  for (const c of crew) {
    ids.add(c.id);
    const r = injuryRank(c), armor = c.armor || 0;
    let s = INJ.seen.get(c.id);
    if (!s) INJ.seen.set(c.id, s = { rank: r, armor, x: c.x, y: c.y, walked: 0, drip: 0, pool: null });
    const inside = c.mode === 'inside' || c.mode === 'hatch', moved = Math.hypot(c.x - s.x, c.y - s.y);
    if (r > s.rank) {                                          // hit
      if (c === me) { INJ.flash = r >= 2 ? 1.5 : 1; INJ.flashDown = r >= 2; INJ.shake = r >= 2 ? 0.5 : 0.28; sfx.ouch(r >= 2); }
      if (inside) for (let i = 0; i < 5; i++) { const a = Math.random() * TAU, d = 0.15 + Math.random() * 0.45; addBlood({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d * 0.8 + 0.15, r: 0.05 + Math.random() * 0.06, life: BLOOD_LIFE }); }
    } else if (c === me && armor < s.armor) { INJ.flash = 0.45; INJ.flashDown = false; INJ.shake = 0.15; }   // the vest took it: a small jolt
    if (moved > 4) s.walked = 0;                               // (a teleport, a warp: no trail across)
    else if (r === 1 && inside) {                              // hurt: drips as they walk (along the way, even on a slow frame), a drop now and then standing still
      s.walked += moved; s.drip += dt;
      const drop = (k) => addBlood({ x: lerp(s.x, c.x, k) + (Math.random() - 0.5) * 0.22, y: lerp(s.y, c.y, k) + 0.12 + (Math.random() - 0.5) * 0.1, r: 0.035 + Math.random() * 0.035, life: BLOOD_LIFE });
      for (let n = 0; s.walked > BLOOD_STEP && n < 10; n++) { s.walked -= BLOOD_STEP; drop(moved > 0 ? clamp(1 - s.walked / moved, 0, 1) : 1); s.drip = 0; }
      if (s.drip > 2.2) { drop(1); s.drip = 0; }
    } else if (r === 1 && c.mode === 'eva' && (s.drip += dt) > 0.45) {   // a spacewalk: droplets drift off from the suit's tear
      s.drip = 0; const a = Math.random() * TAU;
      addBlood({ air: true, x: c.x, y: c.y, vx: Math.cos(a) * 0.35, vy: Math.sin(a) * 0.35, r: 0.04, life: 2.5 });
    }
    if (r >= 2 && inside) {                                    // down: a pool spreads under them
      if (!s.pool || !INJ.blood.includes(s.pool) || Math.hypot(s.pool.x - c.x, s.pool.y - c.y) > 0.5) s.pool = addBlood({ pool: true, x: c.x, y: c.y + 0.1, grow: 0, life: POOL_LIFE });
      s.pool.grow = Math.min(1, s.pool.grow + dt / 6); s.pool.age = 0;   // (stays fresh while they're lying in it)
    } else s.pool = null;
    Object.assign(s, { rank: r, armor, x: c.x, y: c.y });
  }
  for (const id of INJ.seen.keys()) if (!ids.has(id)) INJ.seen.delete(id);
  for (const b of INJ.blood) { b.age += dt; if (b.air) { b.x += b.vx * dt; b.y += b.vy * dt; } }
  INJ.blood = INJ.blood.filter(b => b.age < b.life);
  INJ.flash = Math.max(0, INJ.flash - dt * (INJ.flashDown ? 1.1 : 2.2));
  INJ.shake = Math.max(0, INJ.shake - dt * 1.2);
  const h = me.health || 'ok';                                 // your heartbeat, heard
  if (h === 'hurt' || h === 'down') {
    const n = Math.floor(t / heartPeriod(h));
    if (n !== INJ.beat && INJ.beat >= 0) sfx.heartbeat(h === 'down' ? 0.9 : 0.4 + 0.5 * clamp((me.hurtT || 0) / HURT_TIME, 0, 1));
    INJ.beat = n;
  } else INJ.beat = -1;
}
// The camera's jolt from a hit on you (updateCamera adds it).
const injuryShake = (t) => INJ.shake > 0 ? [INJ.shake ** 2 * 1.6 * Math.sin(t * 71), INJ.shake ** 2 * 1.6 * Math.cos(t * 59)] : [0, 0];
// Blood on the floor (drawn with the floor decals: under the crew and the walls; lit like the floor).
function drawBlood() {
  for (const b of INJ.blood) {
    if (b.air) continue;
    const fade = clamp((b.life - b.age) / (b.life * 0.35), 0, 1), x = b.x * T, y = b.y * T;
    if (b.pool) {
      const R = T * (0.15 + 0.4 * Math.sqrt(b.grow)), rnd = rng(b.seed | 0);
      ctx.fillStyle = `rgba(105,8,12,${0.8 * fade})`;
      ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.8, 0, 0, TAU); ctx.fill();
      for (let i = 0; i < 4; i++) { const a = rnd() * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * R * 0.75, y + Math.sin(a) * R * 0.6, R * (0.3 + rnd() * 0.25), 0, TAU); ctx.fill(); }
      ctx.fillStyle = `rgba(190,40,40,${0.35 * fade})`; ctx.beginPath(); ctx.ellipse(x - R * 0.25, y - R * 0.2, R * 0.3, R * 0.15, -0.4, 0, TAU); ctx.fill();   // a wet sheen
      continue;
    }
    const R = T * b.r, rnd = rng(b.seed | 0);
    ctx.fillStyle = `rgba(150,14,18,${0.9 * fade})`;
    ctx.beginPath(); ctx.ellipse(x, y, R * (1 + rnd() * 0.4), R, rnd() * 3, 0, TAU); ctx.fill();
    const a = rnd() * TAU; ctx.beginPath(); ctx.arc(x + Math.cos(a) * R * 1.7, y + Math.sin(a) * R * 1.7, R * 0.35, 0, TAU); ctx.fill();   // a fleck
  }
}
// Droplets drifting off a hurt spacewalker (drawn on top: they're out in space).
function drawBloodAir() {
  for (const b of INJ.blood) {
    if (!b.air) continue;
    ctx.fillStyle = `rgba(200,30,36,${clamp(1 - b.age / b.life, 0, 1)})`;
    ctx.beginPath(); ctx.arc(b.x * T, b.y * T, T * b.r * (1 - 0.4 * b.age / b.life), 0, TAU); ctx.fill();
  }
}
// Blood splatter in the screen's corners (made once: blobs and flecks, in units of the splat's size).
const SCREEN_SPLATS = (() => {
  const R = rng(4711), at = [[0, 0, 1], [1, 0, 0.8], [0, 1, 0.9], [1, 1, 1.1], [0.5, 0, 0.55], [0, 0.5, 0.6], [1, 0.55, 0.6]];
  return at.map(([fx, fy, size]) => ({ fx, fy, size, blobs: Array.from({ length: 7 }, (_, i) => ({
    a: R() * TAU, d: i ? 0.15 + R() * 0.55 : 0, r: i ? 0.06 + R() * 0.12 : 0.42, pts: lumpShape(Math.floor(R() * 1e6), 10, 0.35).pts })) }));
})();
function drawScreenSplats(k, n = SCREEN_SPLATS.length) {
  const S = Math.min(VW, VH) * 0.2;
  ctx.save();
  for (const sp of SCREEN_SPLATS.slice(0, n)) {
    const ox = sp.fx * VW, oy = HUD_H + sp.fy * (VH - HUD_H), s = S * sp.size;
    ctx.fillStyle = `rgba(125,5,10,${Math.min(0.9, 0.8 * k)})`;
    for (const b of sp.blobs) {
      const bx = ox + Math.cos(b.a) * b.d * s, by = oy + Math.sin(b.a) * b.d * s, br = b.r * s;
      ctx.beginPath(); b.pts.forEach(([px, py, pr], i) => ctx[i ? 'lineTo' : 'moveTo'](bx + px * pr * br, by + py * pr * br)); ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}
// This browser's own injury on screen: a red haze at the border beating with the heart while hurt (the
// middle stays clear), dark red tunnel vision while down, near black while out; the hit flash on top.
function drawInjuryOverlay(t) {
  const h = me.health || 'ok', cx = VW / 2, cy = VH / 2, r = Math.hypot(VW, VH) / 2;
  if (h === 'hurt') {
    const p = heartPulse(t, heartPeriod(h)), fresh = clamp((me.hurtT || 0) / HURT_TIME, 0, 1), k = 0.75 + 0.25 * fresh;
    screenGradient(cx, cy, r * (0.48 - 0.06 * p), r, [[0, [170, 0, 10], 0], [0.4, [150, 0, 10], (0.4 + 0.3 * p) * k], [1, [95, 0, 6], 0.92 * k]]);   // (art.js: in GL with the sprites)
    drawScreenSplats((0.55 + 0.35 * p) * k, 4);
  } else if (h === 'down' || h === 'out') {
    const p = h === 'down' ? heartPulse(t, heartPeriod(h)) : 0, col = h === 'down' ? [60, 0, 2] : [24, 0, 0];
    screenGradient(cx, cy, r * (h === 'down' ? 0.14 + 0.03 * p : 0.04), r, [[0, col, 0], [0.5, col, h === 'down' ? 0.78 + 0.1 * p : 0.88], [1, [20, 0, 0], h === 'out' ? 0.98 : 0.96]]);
    drawScreenSplats(h === 'down' ? 0.8 + 0.2 * p : 0.5);
  }
  if (INJ.flash > 0) {                                          // the hit itself
    const f = Math.min(1, INJ.flash);
    screenGradient(cx, cy, 0, r, [[0, [255, 40, 30], (INJ.flashDown ? 0.35 : 0.2) * f], [0.6, [230, 20, 16], 0.5 * f], [1, [160, 0, 0], 0.85 * f]]);
  }
}
// What being hurt means right now, and what helps: { title, lines, col } for the badge (null when fine).
function injuryStatus(c = me) {
  const h = c.health || 'ok';
  if (h === 'ok') return null;
  const mates = crew.filter(o => o !== c && standing(o)).length > 0, heal = c.heal != null ? ` · being treated ${Math.round(c.heal * 100)} %` : '';
  let self = null; try { self = c === player ? treatInfo(c) : withCrew(c, () => treatInfo(c)); } catch (e) { /* (a synced crew member without input) */ }
  if (h === 'hurt') {
    const snack = (c.snackT || 0) > 0 ? `snack machine again in ${Math.ceil(c.snackT)} s` : 'Helps: a snack (10 s sooner)';
    return { title: 'HURT', col: '#ff5a4a', lines: [
      'One more hit and you\'re DOWN',
      `Heals by itself in ${Math.ceil(c.hurtT || 0)} s${heal}`,
      snack,
      mates ? '…or a crewmate patches you up' : 'Coffee: walk faster for a while'] };
  }
  if (h === 'down') return { title: 'DOWN', col: '#ff3b30', lines: [
    'You can\'t move. One more hit: OUT COLD',
    self ? `Hold E: ${self.label} (${self.time} s)${heal}` : `Wait for treatment${heal}`,
    mates ? 'A crewmate can treat you faster' : ''].filter(Boolean) };
  return { title: 'OUT COLD', col: '#c9ced8', lines: [
    self ? `Hold E: ${self.label} (${self.time} s)${heal}` : `A crewmate has to treat you${heal}`] };
}
// The badge: above the energy panel (bottom left), clear of the inventory and the screen prompt.
function drawInjuryBadge(t) {
  const st = injuryStatus(me);
  if (!st) return;
  const p = me.health === 'out' ? 0 : heartPulse(t, heartPeriod(me.health)), w = 262, lh = 17, h = 34 + st.lines.length * lh + 6;
  const x = 14, y = VH - 104 - 14 - 10 - h;                    // (drawPowerPanel: h 104 at the bottom)
  ctx.save();
  rr(x, y, w, h, 10); ctx.fillStyle = 'rgba(28,6,8,0.9)'; ctx.fill(); stroke(2 + 1.5 * p, st.col);
  const hx = x + 22, hy = y + 18, hs = 7 * (1 + 0.25 * p);     // a beating heart
  ctx.fillStyle = st.col; ctx.beginPath();
  ctx.moveTo(hx, hy + hs); ctx.bezierCurveTo(hx - hs * 1.6, hy - hs * 0.2, hx - hs * 0.8, hy - hs * 1.4, hx, hy - hs * 0.5);
  ctx.bezierCurveTo(hx + hs * 0.8, hy - hs * 1.4, hx + hs * 1.6, hy - hs * 0.2, hx, hy + hs); ctx.fill();
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = '800 18px system-ui, sans-serif'; ctx.fillStyle = st.col; ctx.fillText(st.title, x + 38, y + 18);
  ctx.font = '12px system-ui, sans-serif';
  st.lines.forEach((l, i) => { ctx.fillStyle = i ? '#e6c9c6' : '#ffb0a4'; ctx.fillText(l, x + 12, y + 40 + i * lh, w - 22); });
  ctx.restore();
}
// A small red cross for a hurt crewmate's name tag (down / out: the big one over them, drawDownCross).
function drawHurtTagCross(x, y, s) {
  ctx.fillStyle = '#e23c32'; ctx.fillRect(x - s * 0.18, y - s * 0.5, s * 0.36, s); ctx.fillRect(x - s * 0.5, y - s * 0.18, s, s * 0.36);
}

// Charging the heavy blaster: a growing orb at the muzzle; fully charged it flickers blue-white.
function drawBlasterCharge(c, t) {
  const k = clamp(c.charge / BLASTER_CHARGE, 0, 1), full = k >= 1;
  const m = muzzleAt(c), x = m.x * T, y = (m.y - GFX.lift(m.z)) * T, r = T * (0.06 + 0.16 * k) * (full ? 1 + 0.15 * Math.sin(t * 30) : 1);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, full ? '#9cd8ff' : '#ffb07a'); g.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, TAU); ctx.fill();
}
// The helmet lamp's glow (the beam itself is a light, js/lights.js): a small cool-white dot at the
// front of the helmet, only when it faces the camera (else the head hides it).
function drawHelmetGlow(c, sprited) {
  const s = Math.sin(c.face);
  if (s < -0.25) return;
  const [cx, cy] = crewDrawAt(c), z = sprited ? GFX.lift(1.22) : 0;   // (the brim of the helmet)
  const x = (cx + Math.cos(c.face) * 0.2) * T, y = (cy + s * 0.12 - z) * T, r = T * 0.24, k = clamp((s + 0.25) / 0.6, 0, 1);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);   // (a pale blue halo, so it reads on the white helmet)
  g.addColorStop(0, `rgba(255,255,255,${k})`); g.addColorStop(0.18, `rgba(225,240,255,${0.9 * k})`); g.addColorStop(0.45, `rgba(140,190,255,${0.45 * k})`); g.addColorStop(1, 'rgba(120,180,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function drawSafetyLine(c) {                  // spacewalk: safety line back to the nearest hatch
  const h = HATCHES.reduce((a, b) => Math.hypot(c.x - a.outside[0], c.y - a.outside[1]) < Math.hypot(c.x - b.outside[0], c.y - b.outside[1]) ? a : b);
  const [hx, hy] = [h.x * T, h.y * T], [px, py] = [c.x * T, c.y * T];
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo((hx + px) / 2 + 20, (hy + py) / 2 + 30, px, py);
  ctx.strokeStyle = 'rgba(20,22,27,0.7)'; ctx.lineWidth = 4; ctx.stroke();
  ctx.strokeStyle = 'rgba(210,166,46,0.85)'; ctx.lineWidth = 2; ctx.stroke();
}
function drawCrewOutside(c, t) {
  if (c.mode === 'eva') drawSafetyLine(c);
  drawCrew(c.x * T, c.y * T, c.face, c.walk, true, c.color);
}

// Two ways to draw the world:
// - classic (GFX.on false: ?classic, no WebGL2, tests, the server): everything in 2D on `c`, top-down.
// - sprites (GFX.on): the WebGL canvas under `c` draws the pre-rendered sprites (js/sprites.js) in the
//   tilted view; the old 2D drawing of everything not converted yet still runs, into three 2D layers:
//   'back' (space and what's behind the ship, under the hull sprites), 'mid' (everything the old code
//   drew before the crew: composited into the GL picture above the floors, under the walls and the
//   crew, lit like the floor) and `c` itself (everything drawn after the crew, and the HUD, on top).
//   Each layer gets the same world transform (y squashed by sin 50°), so old drawings stay at
//   ground level where they belong.
const SCREEN_CTX = ctx;
let glowLayer = (fn) => fn();                      // (set by render(): draw fn into the unlit 'glow' layer with sprites)
function render(t) {
  updateInjuryFx(clamp(t - (INJ.t ?? t), 0, 0.1), t); INJ.t = t;   // (hit flash, heartbeat, blood: from the synced crew state)
  const view = camera(), G = GFX.on;
  const js = jumpSpace();                            // (the jump: stars streak; js/mission.js)
  const space = { x: (cam.x + cam.ox) * T * 4, y: (cam.y + cam.oy) * T * 4 * view.sy - t * CRUISE_SPEED - js.drift, rot: 0, streak: js.streak };
  const world = (k) => ctx.setTransform(k * view.zoom, 0, 0, k * view.zoom * view.sy, k * view.ox, k * view.oy);
  // markers, halos and energy glows: in the unlit 'glow' layer with sprites (under the crew, not dimmed by the dark)
  const glow = glowLayer = (fn) => { if (!G) return fn(); const prev = ctx; ctx = GFX.layer2d('glow'); world(GFX.layer2dScale); fn(); ctx = prev; };
  let parts = {};
  ctx = SCREEN_CTX;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (G) {
    GFX.begin(view, t);
    streamMission();
    GFX.lighting(gameLighting(t));
    updateLightLevels(1 / 60);
    parts = drawShipSprites(t);
    const k = GFX.layer2dScale;
    ctx = GFX.layer2d('back'); ctx.setTransform(k, 0, 0, k, 0, 0);
    drawSpace(t, space, VW, VH);
    world(k);
    drawCombatBack(t);
    if (parts.hull) drawEngineBell(t, ENGINE);
    else drawShipHull(t, HULL, GUNS, ENGINE);
    ctx = GFX.layer2d('mid'); world(k);
    if (!parts.hull) drawHullDecor(t);
  } else {
    drawSpace(t, space, VW, VH);
    ctx.save(); ctx.translate(view.ox, view.oy); ctx.scale(view.zoom, view.zoom * view.sy);
    drawCombatBack(t);
    drawShipHull(t, HULL, GUNS, ENGINE);
    drawHullDecor(t);
  }
  drawShipDecals();
  if (typeof drawStrainCracks === 'function') drawStrainCracks(t);   // the ship near falling apart: cracks in the hull and floors (js/breakup.js)
  drawBreachesOutside(t);
  drawEvaJobs(t);
  drawOrganicWorld(t);
  drawDock(t);
  drawDockEntries(t);                                 // the docked ships' ways in from space (js/dockentry.js)
  const gunsSprited = GUNS.filter(g => G && drawGunSprite(g));
  for (const g of GUNS) if (!gunsSprited.includes(g)) drawGun(g.x * T, g.y * T, g.aim, g.flash);
  if (!parts.walls) drawSpine(SPINE_Y0, SPINE_Y1, 0.2, SHIP_W - 0.2, DECK_DOORS);
  if (!G) { drawSpineDecor(t); drawInteriorWalls(); }
  if (!parts.floors) drawFloors(FLOOR_RECTS, (r) => zoneAtX(r.x + 0.01).tint);
  if (!G) drawLightPools();
  drawLeviathanWarning(t);
  drawFloorDecor(t);
  drawBlood();                                       // hurt crew drip blood, the downed lie in a pool (updateInjuryFx; over the floors in both views)
  if (typeof drawLevShip === 'function') drawLevShip(t);   // the boss fight's vents, override panel and brood (js/leviathan.js; after the floors: classic drew them over it)
  drawJunk();
  drawGoo();
  drawBreaches(t);
  drawPowerLines(t);
  if (G) glow(() => drawPowerGlow(t));
  glow(() => drawJumpCrackle(t));                    // the jump drive charging: blue crackle on the cables and the hull
  if (typeof drawBreakupRift === 'function') glow(() => drawBreakupRift(t));   // breaking up: the fracture tearing open (js/breakup.js)
  if (!parts.locks) for (const d of DECK_DOORS) drawDeckDoor(d, t);
  if (!parts.doors) drawDoorways();
  drawDoorLocks(t);                                  // the doors' bolts and wheels (js/art.js; over the door sprites)
  if (!parts.hatches) for (const h of HATCHES) drawAirlock2D(h, t);   // (the outer airlocks: js/airlock.js)
  else drawAirlockRings();
  for (const g of GUNS) drawGunLadder(g);
  drawReactor(REACTOR, t);
  drawLever(t);
  for (const s of STATIONS) drawStation(s, t);
  drawHelmNavcore(t);                                  // chapter 4: the Red Comet's nav core, installed in the helm (js/dock.js)
  for (const c of CAPACITORS) drawCapacitor(c, CAP_MAX, t);
  for (const b of SHIELD_BUTTONS) {
    const s = combat.shields[b.side];
    drawShieldButton(b, s.up > 0 ? 'up' : s.cd > 0 ? 'cooldown' : 'ready', 1 - s.cd / SHIELD_COOLDOWN, t);
  }
  drawPropDecor(t);
  drawInterior(t);
  drawHazardProps(t);
  drawEncounterProps(t);
  drawMinigameProps(t);
  drawInserter(t);
  glow(() => drawItems(t));
  drawFires(t);
  drawDoorPry();                                       // pirates forcing a door: its progress ring
  glow(() => { for (const s of SYSTEMS) if (s.broken) drawBroken(s, t); });
  glow(() => {
    drawEnergyBolts();
    drawLeechSuck(t, G ? 'inside' : 'all');            // leeches drinking a capacitor: its energy creeping out to them (js/organic.js)
  });
  // the crew (as sprites when they're loaded, else in 2D)
  const visorOf = (c) => isOutside(c) || inVacuum(c.x, c.y) || airlockVacuum(c.x, c.y);   // (a pumped-out airlock chamber: js/airlock.js)
  const sprited = new Set();
  for (const c of crew) {
    if (G && drawCrewSprite(c, visorOf(c), t)) { sprited.add(c); if (c.mode === 'eva') drawSafetyLine(c); continue; }
    if (!standing(c)) drawCrewDown(c, t);
    else if (c.mode === 'inside') drawCrew(c.x * T, c.y * T, c.face, c.walk, visorOf(c), c.color);
    else drawCrewOutside(c, t);
  }
  if (G) {                                           // the rest goes on top, on `c`
    ctx = SCREEN_CTX; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, VW, VH);
    ctx.save(); world(DPR);
    drawSpineDecor(t); drawInteriorWalls();
    drawBrokenLabels();                              // (js/systems.js: on top of the machines' sprites)
    drawLeechSuck(t, 'outside');                     // (the leeches' energy ball out on the hull: over the leech sprites)
    for (const g of gunsSprited) drawMuzzleFlash(g);
  }
  for (const c of crew) {
    if (sprited.has(c) && !standing(c)) drawDownCross(c, t);
    if (c === crew[0]) drawBloodAir();                // (once: droplets drifting off a hurt spacewalker)
    const tr = crew.find(o => o.treat?.id === c.id);                  // someone treating them: the heartbeat ring
    if (tr) {
      const info = withCrew(tr, () => treatInfo(c));
      const [rx, ry] = crewDrawAt(c);
      if (info) {                                   // (the progress itself: drawWorkBar)
        const beat = 1 - (((tr.treat.t + BEAT / 2) % BEAT) - BEAT / 2) ** 2 * 40;   // the heartbeat: click when the ring pulses
        if (beat > 0) { ctx.beginPath(); ctx.arc(rx * T, ry * T, T * (0.7 + 0.15 * beat), 0, TAU); ctx.strokeStyle = `rgba(255,120,140,${beat})`; ctx.lineWidth = 3; ctx.stroke(); }
      }
    }
    if (c.mode === 'gun' && c.cover > 0) drawCover(c.gun, c.cover);
    if (c.charge != null) drawBlasterCharge(c, t);
    if (c.lamp && standing(c) && c.mode !== 'gun') drawHelmetGlow(c, sprited.has(c));
    if (c !== me && crew.length > 1) upright(view, c.x, c.y, sprited.has(c) ? 1.35 : 0.45, () => {   // name tags for the others
      ctx.font = `700 ${T * 0.26}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const dark = labelIsDark(c.color);                     // dark suits (black): a light outline, so the dark name still reads
      ctx.lineWidth = dark ? 5 : 4; ctx.strokeStyle = dark ? 'rgba(226,232,244,0.92)' : 'rgba(10,12,18,0.8)'; ctx.strokeText(c.name, 0, 0);
      ctx.fillStyle = c.color; ctx.fillText(c.name, 0, 0); ctx.textAlign = 'left';
      if (c.health === 'hurt') drawHurtTagCross(-ctx.measureText(c.name).width / 2 - T * 0.22, -T * 0.14, T * 0.24 * (1 + 0.2 * heartPulse(t, heartPeriod('hurt'))));   // hurt: a red cross by the name
    });
  }
  drawBoarding(t);
  drawDockActors(t);
  if (!G) drawLights(1 / 60);
  drawVacuumTint();
  drawSporesInside(t);                               // spore haze, puffs through doors, fuzz on glitching parts (js/spores.js)
  drawSporeCloud(t);                                 // the spore mother's cloud round the hull (js/spores.js)
  drawVentRush(t);                                   // a room being vented: air, papers and mist rushing out (js/hazards.js)
  drawAirlockPump(t);                                // an outer airlock pumping: air out (streaks, exhaust, frost) or in (puffs, haze) (js/airlock.js)
  drawDockDarkness();
  drawCombatFront(t);
  if (typeof drawBreakupFront === 'function') drawBreakupFront(t);   // breaking up / under strain: hull plates, vented air, explosions (js/breakup.js)
  drawUseMarks(t);                                   // rings round what you can use, over everything in the world (js/systems.js)
  drawWalkFieldDebug();                              // debug: where the crew walk (js/walkfield.js; ?walkfield or the debug menu)
  if (typeof drawTutorialWorld === 'function') drawTutorialWorld(view, t);   // the tutorial's markers (js/tutorial.js)
  if (typeof drawTrainingWorld === 'function') drawTrainingWorld(view, t);   // your crew training marks (js/tutorial-mp.js)
  drawJumpStallMark(view, t);                        // the jump stalled: NO ENERGY over the middle capacitor

  ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); drawEncounterOverlay(view, t); ctx.restore();   // (storm darkness, flare glare: under the prompts)
  const prompt = me.prompt, hover = me.hover;
  const working = workProgress(me);
  const promptAbove = G && sprited.has(me) ? 1.45 : 0.55;
  if (prompt && !prompt.screen && !prompt.quiet && !working) upright(view, me.x, me.y, promptAbove, () => {
    ctx.font = `600 ${T * 0.3}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    // on screen whatever the width: wrapped onto more lines when it's wider than the screen, and kept off its edges
    const z = view.zoom || 1, room = (VW - 24) / z - 18, measure = (s) => ctx.measureText(s).width;
    const lines = measure(prompt.text) <= room ? [prompt.text] : wrapText(prompt.text, room, measure);
    const w = Math.max(...lines.map(measure)) + 18, lh = T * 0.34, sx = view.ox + me.x * T * z;
    let dx = clamp(0, (12 - sx) / z + w / 2, Math.max((12 - sx) / z + w / 2, (VW - 12 - sx) / z - w / 2));
    // never under the left-hand panels (drawn on top of it): moved right of / below / above them (js/sidebar.js)
    const by = -T * 0.42 - (lines.length - 1) * lh, bh = T * 0.46 + (lines.length - 1) * lh, sy = view.oy + me.y * T * z * view.sy - promptAbove * T * z;
    const off = keepOffPanels({ x: sx + (dx - w / 2) * z, y: sy + by * z, w: w * z, h: bh * z }, leftPanelRects(HUD_H), VW, VH);
    dx += off.dx / z; const dy = off.dy / z;
    rr(dx - w / 2, by + dy, w, bh, 6); ctx.fillStyle = 'rgba(12,14,20,0.82)'; ctx.fill(); stroke(1.5, prompt.ok ? USE_COL : '#6b7486');
    ctx.fillStyle = prompt.ok ? '#ffffff' : '#c9ced8'; lines.forEach((l, i) => ctx.fillText(l, dx, dy - T * 0.06 - (lines.length - 1 - i) * lh));
    ctx.textAlign = 'left';
  });
  ctx.restore();
  drawInjuryOverlay(t);                              // (under the screen prompt: being down, you still read what to do)
  drawJumpVignette(t);
  if (prompt && prompt.screen) {
    ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(prompt.text).width + 30;
    const py = me.mode === 'inside' ? invSlots()[0].y - 46 : VH - 54;   // (above the inventory)
    rr(VW / 2 - w / 2, py, w, 34, 8); ctx.fillStyle = 'rgba(12,14,20,0.82)'; ctx.fill(); stroke(1.5, USE_COL);
    ctx.fillStyle = '#ffffff'; ctx.fillText(prompt.text, VW / 2, py + 17); ctx.textAlign = 'left';
  }
  for (const c of crew) drawWorkBar(view, c, sprited.has(c));   // hold jobs: a progress bar over the head
  drawCombatHUD(view, HUD_H);
  drawSystemsHUD(HUD_H);
  if (me.mode === 'gun' && standing(me)) drawCannonHUD(me.gun);
  drawSidebar(HUD_H);
  drawInjuryBadge(t);                                // hurt / down / out: what it means and what helps
  drawProblemMarkers(view);                          // where in the ship things happen (js/sidebar.js)
  if (typeof drawTrainingHUD === 'function' && !me.ui.panel) drawTrainingHUD(t);   // your crew training card, under the arrows' hints (js/tutorial-mp.js)
  drawClaimGuide(view);                              // big arrows to the jobs you claimed (js/claims.js)
  if (hover && !debugOpen && !invSlotAt(mouse.x, mouse.y)) {   // tooltip next to the mouse
    ctx.font = '600 13px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    const measure = (s) => ctx.measureText(s).width, lines = measure(hover.text) + 16 <= VW - 12 ? [hover.text] : wrapText(hover.text, VW - 28, measure);   // (wider than the screen: wrapped)
    const w = Math.max(...lines.map(measure)) + 16, h = 24 + (lines.length - 1) * 17;
    const tx = Math.max(6, Math.min(mouse.x + 16, VW - w - 6)), ty = Math.min(mouse.y + 22, VH - h - 6);
    rr(tx, ty - 12, w, h, 6); ctx.fillStyle = 'rgba(12,14,20,0.88)'; ctx.fill(); stroke(1.5, hover.ok ? USE_COL : '#6b7486');
    ctx.fillStyle = hover.ok ? '#ffffff' : '#c9ced8'; lines.forEach((l, i) => ctx.fillText(l, tx + 8, ty + i * 17));
  }
  drawHUD();
  if (typeof drawTutorialHUD === 'function') drawTutorialHUD(t);
  drawDebugMenu();
  drawPanels(t);
  if (typeof drawTrainingHUD === 'function' && me.ui.panel) drawTrainingHUD(t);   // (a panel open: the card stays readable on top of it)
  if (G) GFX.end();
}
// Progress of a hold job (repairing, welding, treating, …): a bar over the worker's head, in screen
// space so it stays big and readable; yours with a caption, the others' small.
function drawWorkBar(view, c, sprited) {
  const w = workProgress(c);
  if (!w || (c.mode !== 'inside' && c.mode !== 'eva' && !(c.mode === 'gun' && !standing(c)))) return;
  const [ax, ay] = crewDrawAt(c), lift = (sprited ? 1.6 : 0.8) * T * view.zoom, k = clamp(w.k, 0, 1);
  const mine = c === me;
  ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sx = view.ox + ax * T * view.zoom, sy = view.oy + ay * T * view.zoom * view.sy - lift;
  if (!mine) {                                       // the others': a small bar
    const bw = 110, bh = 10, x = clamp(sx - bw / 2, 8, VW - bw - 8), y = clamp(sy - bh, HUD_H + 8, VH - 40);
    rr(x - 3, y - 3, bw + 6, bh + 6, 5); ctx.fillStyle = '#0c0e14'; ctx.fill();
    if (k > 0) { rr(x, y, Math.max(4, bw * k), bh, 3); ctx.fillStyle = '#ffffff'; ctx.fill(); }
    ctx.restore(); return;
  }
  // yours: one opaque panel with the caption and a big bar (drawn over everything, labels included)
  ctx.font = '700 16px system-ui, sans-serif';
  const pw = Math.max(280, ctx.measureText(w.label).width + 32), ph = 62, bw = pw - 24, bh = 20;
  const px = clamp(sx - pw / 2, 8, VW - pw - 8), py = clamp(sy - ph, HUD_H + 8, invSlots()[0].y - ph - 8);
  rr(px, py, pw, ph, 10); ctx.fillStyle = '#0c0e14'; ctx.fill(); stroke(2, '#8a909c');
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(w.label, px + pw / 2, py + 17);
  const bx = px + 12, by = py + 32;
  rr(bx, by, bw, bh, 5); ctx.fillStyle = '#2b303a'; ctx.fill();
  if (k > 0) { rr(bx, by, Math.max(10, bw * k), bh, 5); ctx.fillStyle = '#ffffff'; ctx.fill(); }   // (white: yellow is energy)
  rr(bx, by, bw, bh, 5); ctx.lineWidth = 1.5; ctx.strokeStyle = '#c9ced8'; ctx.stroke();
  const pct = `${Math.floor(k * 100)} %`;
  ctx.font = '800 14px system-ui, sans-serif';
  ctx.fillStyle = k > 0.45 ? '#14161b' : '#ffffff'; ctx.fillText(pct, bx + bw / 2, by + bh / 2 + 1);
  ctx.restore(); ctx.textAlign = 'left';
}
// Text and labels above a world point, upright (not squashed by the tilted view): fn draws around
// (0, -lift·T) in world px, with the world transform's zoom. `above`: screen units above the ground.
function upright(view, x, y, above, fn) {
  ctx.save(); ctx.translate(x * T, y * T); ctx.scale(1, 1 / view.sy); ctx.translate(0, -above * T);
  fn(); ctx.restore();
}

function drawHUD() {
  ctx.fillStyle = 'rgba(10,12,18,0.75)'; ctx.fillRect(0, 0, VW, HUD_H);
  drawMuteButton();
  ctx.font = '700 15px system-ui, sans-serif'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8ecf4'; ctx.fillText('MANIFOLD NOVUM', 74, 18);
  const helpX = 74 + ctx.measureText('MANIFOLD NOVUM').width + 16;
  ctx.font = '13px system-ui, sans-serif';
  const room = roomAt(player.x, player.y);
  const where = player.mode === 'gun' ? player.gun.name : player.mode === 'eva' ? 'Spacewalk'
    : room ? room.name : airlockAt(player.x, player.y) ? 'Outer airlock' : inDock(player.x, player.y) ? dockName() : DECK_DOORS.some(d => inRect(player.x, player.y, d)) ? 'Deck door' : 'Doorway';
  ctx.textAlign = 'right'; ctx.fillStyle = '#e8ecf4'; ctx.fillText(where, VW - 14, 18);
  const ww = ctx.measureText(where).width;
  const song = sfx.muted ? '♪ muted' : `♪ ${music.title}`;
  ctx.fillStyle = '#6b7486'; ctx.fillText(song, VW - 30 - ww, 18);
  const sw = ctx.measureText(song).width, aw = drawAlarmHUD(VW - 46 - ww - sw, 18, time) || 0;   // fire / red alert (js/lights.js)
  ctx.textAlign = 'left'; ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5';
  // the controls, as many as fit before the right-hand group (narrow screens: the last ones drop off)
  const help = ['WASD move', 'E / click: use', 'Space / right click: weapon', 'arrows: aim', 'M: mute'], room2 = VW - 46 - ww - sw - aw - 16 - helpX;
  while (help.length && ctx.measureText(help.join(' · ')).width > room2) help.pop();
  if (help.length) ctx.fillText(help.join(' · '), helpX, 18);
  drawGuideButton();                                 // (last: its tooltip hangs over the sidebar)
}

// Cannon ammo panel (bottom right while manning a cannon): shells, energy left, RELOAD button.
const reloadBtn = () => ({ x: VW - 176, y: VH - 62, w: 160, h: 40 });
function inReloadBtn(x, y) { const b = reloadBtn(); return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
const climbBtn = () => ({ x: VW - 176, y: VH - 200, w: 160, h: 34 });
function inClimbBtn(x, y) { const b = climbBtn(); return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
function drawCannonHUD(g) {
  const b = reloadBtn(), cap = CAPACITORS[GUN_CAP[g.id]], empty = !g.shots && !g.reload;
  rr(b.x - 10, b.y - 70, b.w + 20, b.h + 80, 10); ctx.fillStyle = 'rgba(10,12,18,0.8)'; ctx.fill(); stroke(1.5, '#4b5263');
  ctx.font = '700 11px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5'; ctx.textBaseline = 'middle';
  ctx.fillText('SHOTS', b.x, b.y - 56);
  // shells: always SHOTS_PER_ENERGY of them (4 with the efficient cannons), full or empty, squeezed to fit left of
  // the energy text (b.x + 86): 4 at the old 26 px pitch ran under it and the last one seemed to vanish when spent
  const step = Math.min(26, 78 / SHOTS_PER_ENERGY), sw = Math.min(14, step - 6);
  for (let i = 0; i < SHOTS_PER_ENERGY; i++) {
    const sx = b.x + 4 + i * step, sy = b.y - 44, on = i < g.shots;
    rr(sx, sy, sw, 30, Math.min(6, sw / 2)); ctx.fillStyle = on ? '#e8c34f' : '#2b303a'; ctx.fill(); stroke(1.5);
    if (on) { ctx.fillStyle = '#b8862a'; ctx.fillRect(sx + 2, sy + 20, sw - 4, 5); }
  }
  ctx.fillStyle = cap.charge ? POWER_COL : '#ff8a7a'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(`energy: ${cap.charge}/${CAP_MAX}`, b.x + 86, b.y - 38);
  ctx.fillText(`(${['left', 'mid', 'right'][GUN_CAP[g.id]]} capacitor)`, b.x + 86, b.y - 22);
  const hover = inReloadBtn(mouse.x, mouse.y), pulse = empty ? 0.5 + 0.5 * Math.sin(time * 6) : 0;
  rr(b.x, b.y, b.w, b.h, 8);
  ctx.fillStyle = g.reload ? '#2b303a' : empty ? `rgb(${150 + 60 * pulse | 0},${60 + 20 * pulse | 0},40)` : hover ? '#4a515e' : '#3a3f4a'; ctx.fill();
  stroke(2, empty ? '#ffb07a' : '#6b7486');
  if (g.reload) { rr(b.x + 3, b.y + 3, (b.w - 6) * (1 - g.reload / RELOAD_TIME), b.h - 6, 6); ctx.fillStyle = '#5fd6a0'; ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.font = '800 14px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(g.reload ? 'RELOADING…' : 'RELOAD · 1 energy', b.x + b.w / 2, b.y + b.h / 2); ctx.textAlign = 'left';
  const c = climbBtn(), ch = inClimbBtn(mouse.x, mouse.y);                       // climb back down
  rr(c.x, c.y, c.w, c.h, 8); ctx.fillStyle = ch ? '#4a515e' : '#2b303a'; ctx.fill(); stroke(2, '#6b7486');
  ctx.fillStyle = '#e8ecf4'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⬇ CLIMB DOWN', c.x + c.w / 2, c.y + c.h / 2); ctx.textAlign = 'left';
}

// Speaker icon; crossed out when muted.
function drawMuteButton() {
  const { x, y, w, h } = MUTE_BTN, hover = inMuteBtn(mouse.x, mouse.y);
  rr(x, y, w, h, 5); ctx.fillStyle = hover ? '#2f3542' : '#1c2028'; ctx.fill(); stroke(1.2, '#4b5263');
  const cx = x + 9, cy = y + h / 2;
  poly([[cx - 5, cy - 3], [cx - 2, cy - 3], [cx + 3, cy - 7], [cx + 3, cy + 7], [cx - 2, cy + 3], [cx - 5, cy + 3]]);
  ctx.fillStyle = sfx.muted ? '#6b7486' : '#e8ecf4'; ctx.fill();
  ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  if (sfx.muted) {
    ctx.strokeStyle = '#e2574c';
    ctx.beginPath(); ctx.moveTo(cx + 6, cy - 4); ctx.lineTo(cx + 13, cy + 4); ctx.moveTo(cx + 13, cy - 4); ctx.lineTo(cx + 6, cy + 4); ctx.stroke();
  } else {
    ctx.strokeStyle = '#e8ecf4';
    for (const r of [5, 9]) { ctx.beginPath(); ctx.arc(cx + 3, cy, r, -0.7, 0.7); ctx.stroke(); }
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
// The shared simulation: every crew member (with their own input), then the world.
function simTick(dt) {
  time += dt;
  if (mission.over?.survived) {         // jumped: the ship is safe, nothing burns, breaks or bleeds any more (time runs for the jump-out)
    for (const c of crew) { const i = c.input; i.pressed.clear(); i.mouse.click = false; i.mouse.rightClick = false; i.mouse.look = 0; }
    return;
  }
  for (const c of crew) withCrew(c, () => {
    updatePlayer(dt);
    updateInteraction(dt);
    updateOverride(dt);
    updateInjury(player, dt);
    inv.cd = Math.max(0, inv.cd - dt);
    if (typeof s7Struggle === 'function') s7Struggle(player, pressed);   // held by S-7: mashing the keys wriggles you free (js/culture.js)
    pressed.clear(); mouse.click = false; mouse.rightClick = false; mouse.look = 0;
  });
  updateAirlocks(dt);                                 // (the outer airlocks: js/airlock.js)
  updateCombat(dt);
  updatePower(dt);
  updateBoarding(dt);
  updateDoors(dt);
  updateFires(dt);
  updateMission(dt);
  updateLuck(dt);
  updateHazards(dt);
  updateEva(dt);
  updateSpores(dt);                                   // spores inside the ship (js/spores.js)
  updateEncounters(dt);
  updateMinigames(dt);
  updateOrganic(dt);
  updateDock(dt);
  updateCrewTasks(dt);                                // claims and task plates (js/claims.js)
  if (typeof updateTutorial === 'function') updateTutorial(dt);   // js/tutorial.js (solo only)
  if (typeof updateTraining === 'function') updateTraining(dt);   // crew training (js/tutorial-mp.js; only in mission 'training')
}

// This browser only: menus, buttons, mute, music, the mouse's world point, sidebar, camera.
function clientUpdate(dt) {
  if (DEBUG_DO.length) {
    const at = location.hash.match(/&at=(-?[\d.]+),(-?[\d.]+)/);
    if (at) { me.x = +at[1]; me.y = +at[2]; }
    const todo = DEBUG_DO.splice(0), late = todo.filter(k => 'pqugvy'.includes(k));
    for (const k of todo) if (!late.includes(k)) sendCommand(['debug', k]);
    for (let i = 0; i < DEBUG_WARP * 60; i++) tick(1 / 60);
    for (const k of late) sendCommand(['debug', k]);          // shields: after the warp
    for (let i = 0; i < 12; i++) tick(1 / 60);
    cam.zoom = 0;
  }
  const m = localInput.mouse;
  [m.wx, m.wy] = screenToWorld(m.x, m.y);
  if (GFX.on) {                                        // pointing at a raised sprite (crew): its ground point,
    const p = GFX.pickAt(m.x, m.y);                    // unless it only hides something you can use on the ground behind it
    const acts = (x, y) => withCrew(me, () => actionable(pickHover(me, x, y)));   // (e.g. your own back in front of a barnacle)
    if (p && !(acts(m.wx, m.wy) && !acts(p[0], p[1]))) [m.wx, m.wy] = p;
  }
  if (tutAllows('debug')) updateDebug();
  if (localInput.pressed.has('KeyM')) sfx.toggleMute();
  // The menus (main menu, lobby, locker, shipyard: everything in #lobby) play Held Together, calm and steady
  // (stage 1: no build-up, no threat, no spool), the same piece across every menu screen; a mission plays its own.
  const lobby = document.getElementById?.('lobby')?.hidden === false;   // (#lobby itself: #menu/#room keep their own flags under it during a game)
  music.setThreat(!lobby && (combat.enemies.some(e => e.phase === 'fighting') || combat.asteroids.length > 0 || !!combat.swarm || boarding.invaders.length > 0
    || (!!mission.press && !mission.over)));             // not jumping yet: the hot zone keeps the threat up
  music.setMission(lobby ? 'menu' : mission.id || 'practice');   // each mission has its own piece, building up towards the jump
  // (the arc is laid out for a mission MUSIC_TAIL s longer than this one: the piece is still rising when the drive
  //  spools, instead of sitting on its climax, repeating it, for the last minute; 2026-10-24, the user: "the awkward loop at the end")
  music.setIntensity(lobby || !mission.active || mission.over ? 0.15 : isFinite(mission.jumpAt) ? Math.pow(clamp(mission.t / (mission.jumpAt + MUSIC_TAIL), 0, 1), 1.3) : 0.3);
  music.setJump(!lobby && !!mission.jump && !mission.over);
  if (mission.over?.survived && !lobby) music.jumped();    // the big final hit as we jump out
  else if (!mission.over || lobby) music.rearm();          // a new mission, the menu or the lobby: the music plays again
  if (mission.over) creditMission();                 // rewards for this browser's player (once per run; early, before anything else can throw)
  jumpFxUpdate(dt);                                        // the jump's animation clock (js/mission.js)
  if (typeof breakupUpdate === 'function') breakupUpdate(dt);   // strain and break-up: clock, particles, creaks (js/breakup.js)
  try { sfx.hum(jumpCharge()); } catch (e) { /* no audio */ }   // the drive's hum
  miniClient(dt);
  practiceClient();
  if (me.ui.panel && m.click) { panelClick(m.x, m.y); m.click = false; }
  if (!me.ui.panel && m.click && typeof inTrainCard === 'function' && inTrainCard(m.x, m.y)) { sendCommand(['train', 'next']); m.click = false; m.suppress = true; }   // your crew training card: next page / fold (js/tutorial-mp.js)
  if (!me.ui.panel && m.click && mission.active && plateAt(m.x, m.y)) { sendCommand(['claim', plateAt(m.x, m.y)]); m.click = false; m.suppress = true; }   // claim a plate (js/claims.js)
  if (me.mode === 'gun' && standing(me) && m.click && inReloadBtn(m.x, m.y)) { sendCommand(['reload']); m.click = false; m.suppress = true; }
  if (me.mode === 'gun' && standing(me) && m.click && inClimbBtn(m.x, m.y)) { sendCommand(['climbDown']); m.click = false; m.suppress = true; }
  if (me.mode === 'inside' && !me.ui.panel && m.click && invSlotAt(m.x, m.y)) { const b = invSlotAt(m.x, m.y); if (me.inv[b.slot]) sendCommand(['drop', b.slot]); m.click = false; m.suppress = true; }
  if (!m.down) m.suppress = false;
  // end screen: any key (but M, mute) or click goes back to the lobby; not during the jump animation, and only
  // after END_GRACE s, so a click or key meant for the fight doesn't skip the report
  endShown = endScreenReady() ? endShown + dt : 0;
  if (endShown > END_GRACE && ([...localInput.pressed].some(k => k !== 'KeyM') || m.click || m.rightClick)) backToLobby();
  if (NET.on) me.hover = withCrew(me, () => (me.mode === 'inside' || me.mode === 'eva') && !invSlotAt(m.x, m.y) ? pickHover(me, m.wx, m.wy) : null);   // the server doesn't send hover; work it out here
  updateSidebar(HUD_H, dt);
  updateCamera(dt);
}
let endShown = 0;
const END_GRACE = 1;
// Solo: one step of everything (also used by tests and the debug warp).
function tick(dt) { clientUpdate(dt); simTick(dt); }

// Multiplayer hooks (js/net.js fills these in when the page is served by server.js).
const NET = { on: false, frame: null };
function backToLobby() { location.reload(); }
let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now;   // (the first frame's timestamp can be a hair before `last`)
  if (NET.on) NET.frame(dt);
  else if (typeof tutorialPaused === 'function' && tutorialPaused()) tutorialClient(dt);   // a tutorial message is open: the game is paused
  else if (!lobbyOpen()) tick(dt); else { clientUpdate(dt); localInput.pressed.clear(); }   // (menus: a key counts once, so M mutes once, not every frame)
  // a drawing error must never stop the game loop (the end of a mission, its rewards: clientUpdate above)
  try { render(now / 1000); } catch (e) { if (!frame.err) { frame.err = true; console.error('render error', e); } }
  requestAnimationFrame(frame);
}
mission.active = false;                              // the lobby starts a mission
const lobbyOpen = () => !!document.getElementById('lobby') && !document.getElementById('lobby').hidden;
if (DEBUG_DO.length || location.hash) { const l = document.getElementById('lobby'); if (l) l.hidden = true; }   // debug setups skip the lobby
requestAnimationFrame(frame);
