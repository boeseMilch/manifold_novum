// Main loop, input, crew movement, deck airlocks, spacewalks, cannons,
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
const makeInput = () => ({ keys: new Set(), pressed: new Set(), mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false, click: false, right: false, rightClick: false, moved: 0 } });
const localInput = makeInput();
window.addEventListener('keydown', e => {
  if (e.target?.tagName === 'INPUT') return;                 // typing in the lobby
  if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (!localInput.keys.has(e.code)) localInput.pressed.add(e.code); localInput.keys.add(e.code);
});
window.addEventListener('keyup', e => localInput.keys.delete(e.code));
window.addEventListener('blur', () => { localInput.keys.clear(); localInput.mouse.down = false; });
canvas.addEventListener('mousemove', e => { localInput.mouse.x = e.clientX; localInput.mouse.y = e.clientY; localInput.mouse.moved = 1; });
const MUTE_BTN = { x: 8, y: 6, w: 26, h: 24 };
const inMuteBtn = (x, y) => x >= MUTE_BTN.x && x <= MUTE_BTN.x + MUTE_BTN.w && y >= MUTE_BTN.y && y <= MUTE_BTN.y + MUTE_BTN.h;
canvas.addEventListener('mousedown', e => {
  const m = localInput.mouse;
  if (e.button === 0 && inMuteBtn(e.clientX, e.clientY)) { sfx.toggleMute(); return; }
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
const LOCK_DOOR_TIME = 0.55;
let LOCK_CYCLE = 1.3;                        // deck airlock: per door, and pressure cycle (upgradeable)
const HURT_SPEED = 0.6;                       // walking speed while hurt
const HATCH_TIME = 1.6;                      // going through an outer airlock
const GUN_TURN = 1.6;                        // rad/s when aiming with A/D
const COVER_SPEED = 6;                       // raising / lowering the cover plate (1/s)
const CRUISE_SPEED = 260;                    // px/s of starfield drift
const HUD_H = 36;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
// mode: 'inside' | 'hatch' (going through an outer airlock) | 'eva' | 'gun'
// The simulation updates crew members one at a time; while it does, the globals below point at
// that crew member ("acting crew"): player, keys, pressed, mouse, inv, ui, prompt, hover.
const CREW_COLORS = ['#c4683a', '#3a8fc4', '#5fb04a', '#c43a8f', '#c4b03a', '#8a5ac4', '#3ac4b0', '#c43a3a'];
let crewIdCounter = 1;
function makeCrew(name = 'Crew', x = 22.2, y = 4.5) {
  const id = crewIdCounter++;
  return { id, name, color: CREW_COLORS[(id - 1) % CREW_COLORS.length], x, y, vx: 0, vy: 0, face: -Math.PI / 2, walk: 0, mode: 'inside', cover: 0, health: 'ok', hurtT: 0, treat: null,
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
const DEBUG_DO = (location.hash.match(/^#do=([\da-zA-Z,]+)/) || [])[1]?.split(',') || [];
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

function updateCrew(c, dt, ix, iy) {
  if (c.health === 'down' || c.health === 'out') { ix = iy = 0; }          // can't move while down
  const eva = c.mode === 'eva', floaty = eva || (c.mode === 'inside' && noGravAt(c.x, c.y) && !perk(c, 'boots'));
  const len = Math.hypot(ix, iy), speed = (eva ? EVA_SPEED : WALK_SPEED) * (c.health === 'hurt' ? HURT_SPEED : 1) * crewSpeedMul(c) * (c.slow || 1) * gearSpeed(c);
  const tx = len ? ix / len * speed : 0, ty = len ? iy / len * speed : 0;
  const k = Math.min(1, (floaty ? EVA_ACCEL * (eva ? 1 : 0.5) : WALK_ACCEL) * dt / speed);
  c.vx = lerp(c.vx, tx, k); c.vy = lerp(c.vy, ty, k);
  const ok = eva ? (x, y) => evaOk(x, y) : (() => { const rects = walkRects(); return (x, y) => canStand(x, y, rects); })();
  unstick(c, ok);
  const nx = c.x + c.vx * dt;
  if (ok(nx, c.y)) c.x = nx; else c.vx = 0;
  const ny = c.y + c.vy * dt;
  if (ok(c.x, ny)) c.y = ny; else c.vy = 0;
  if (c.mode === 'inside' && inRect(c.x, c.y, TREADMILL)) {          // on the treadmill: the belt carries you back
    const belt = speed * BELT_K, by = c.y + belt * dt;                // (half of this crew member's own walking speed)
    if (ok(c.x, by)) c.y = by;
    if (len) c.walk += belt * dt * 3.2;                       // (and your legs keep going)
  }
  const sp = Math.hypot(c.vx, c.vy);
  if (c.aim != null && standing(c)) c.face = c.aim;               // arrow keys: point that way
  else if (len && sp > 0.3) c.face = Math.atan2(c.vy, c.vx);       // otherwise: the way you walk
  c.walk += sp * dt * (eva ? 1.2 : 3.2);
}

// ---------------------------------------------------------------------------
// Deck airlocks: walk in, the door behind you closes, the chamber cycles, the
// far door opens. Walking up to a closed door cycles an empty chamber to you.
// ---------------------------------------------------------------------------
const other = (s) => s === 'top' ? 'bottom' : 'top';

function startCycle(L, target) {
  L.phase = 'closing'; L.target = target;
}

// Everyone the door sensors react to: crew inside the ship and intruders.
const actors = () => [...crew.filter(c => c.mode === 'inside'), ...boarding.invaders.filter(a => a.mode === 'inside')];

function updateDeckLock(L, dt) {
  if (broken(L)) return;                           // broken: doors stay as they are
  if (L.locked && L.phase === 'idle') {            // locked by security: both doors shut (never on someone)
    for (const s of ['top', 'bottom']) {
      if (actors().some(c => inRect(c.x, c.y, L.doorRect[s], CREW_R))) continue;
      L.doors[s] = Math.max(0, L.doors[s] - dt / LOCK_DOOR_TIME);
    }
    return;
  }
  if (!L.locked && L.phase === 'idle' && L.open && L.doors[L.open] < 1) L.doors[L.open] = Math.min(1, L.doors[L.open] + dt / LOCK_DOOR_TIME);
  const ch = L.chamber, crew = actors();
  const occupants = crew.filter(c => c.x > L.x && c.x < L.x + L.w && c.y > SPINE_Y0 && c.y < SPINE_Y1);
  const insideFully = crew.filter(c => c.x - CREW_R >= ch.x && c.x + CREW_R <= ch.x + ch.w &&
                                       c.y - CREW_R >= ch.y && c.y + CREW_R <= ch.y + ch.h);
  // remember which side a crew member stepped in from
  for (const c of crew) {
    const inX = c.mode === 'inside' && c.x > L.x && c.x < L.x + L.w;
    const side = c.y < ch.y ? 'top' : c.y > ch.y + ch.h ? 'bottom' : 'in';
    const prev = (c.lockSide ||= {})[L.col];
    if (inX && side === 'in' && prev && prev !== 'in') L.entry = prev;
    c.lockSide[L.col] = inX ? side : null;
  }

  if (L.phase === 'idle') {
    if (insideFully.length && L.entry === L.open) {
      L.entry = null; startCycle(L, other(L.open));
    } else if (!occupants.length) {
      const closed = other(L.open);
      const waiting = crew.some(c => c.mode === 'inside' && c.x > L.x - 0.2 && c.x < L.x + L.w + 0.2 &&
        (closed === 'top' ? c.y > SPINE_Y0 - 1.2 && c.y < SPINE_Y0 : c.y > SPINE_Y1 && c.y < SPINE_Y1 + 1.2));
      if (waiting) startCycle(L, closed);
    }
  } else if (L.phase === 'closing') {
    const s = L.open;
    // never close on someone standing in the doorway: reopen and wait until it's clear
    if (actors().some(c => inRect(c.x, c.y, L.doorRect[s], CREW_R))) { L.doors[s] = Math.min(1, L.doors[s] + dt / LOCK_DOOR_TIME); return; }
    L.doors[s] = Math.max(0, L.doors[s] - dt / LOCK_DOOR_TIME);
    if (L.doors[s] === 0) { L.phase = 'cycling'; L.t = 0; L.open = null; }
  } else if (L.phase === 'cycling') {
    L.t += dt;
    if (L.t >= LOCK_CYCLE) L.phase = 'opening';
  } else if (L.phase === 'opening') {
    const s = L.target;
    L.doors[s] = Math.min(1, L.doors[s] + dt / LOCK_DOOR_TIME);
    if (L.doors[s] === 1) { L.phase = 'idle'; L.open = s; L.target = null; }
  }
}

// ---------------------------------------------------------------------------
// Outer airlocks (hatches): inside ⇄ spacewalk. Visor goes down outside.
// ---------------------------------------------------------------------------
function startHatch(h, dir) {
  player.mode = 'hatch'; player.hatch = h; player.hatchDir = dir; player.hatchT = 0;
  player.vx = player.vy = 0; sfx.hatch();
}
// Hatches nobody is using swing shut (run once per tick, after the crew).
function updateHatches(dt) {
  for (const h of HATCHES) if (!crew.some(c => c.mode === 'hatch' && c.hatch === h)) h.open = Math.max(0, h.open - dt * 2);
}
function updateHatch(dt) {
  if (player.mode !== 'hatch') return;
  const h = player.hatch, k = (player.hatchT += dt) / HATCH_TIME;
  h.open = Math.sin(Math.PI * clamp(k, 0, 1));
  const [a, b] = player.hatchDir === 'out' ? [h.inside, h.outside] : [h.outside, h.inside];
  const q = clamp((k - 0.25) / 0.5, 0, 1);
  player.x = lerp(a[0], b[0], q); player.y = lerp(a[1], b[1], q);
  player.face = player.hatchDir === 'out' ? (h.dir < 0 ? Math.PI : 0) : (h.dir < 0 ? 0 : Math.PI);
  if (k >= 1) { player.mode = player.hatchDir === 'out' ? 'eva' : 'inside'; h.open = 0; }
}

// ---------------------------------------------------------------------------
// Player input and interaction
// ---------------------------------------------------------------------------
// World point under the acting crew member's mouse (each browser computes it from its camera).
function mouseWorld() { return [mouse.wx, mouse.wy]; }
// (the ground plane, z = 0: in the tilted sprite view the screen's y is the ground's y × sin 50°)
function screenToWorld(sx, sy) { const v = camera(); return [(sx - v.ox) / (v.zoom * T), (sy - v.oy) / (v.zoom * T * v.sy)]; }

function updatePlayer(dt) {
  const block = (debugOpen && player === me) || !!ui.panel || !!mission.over;
  if (ui.panel && (pressed.has('KeyE') || pressed.has('Escape'))) { ui.panel = null; ui.override = null; ui.mini = null; pressed.delete('KeyE'); player.eUsed = true; }
  if (!keys.has('KeyE')) player.eUsed = false;           // (E that did something stays used until it's let go)
  const ix = block ? 0 : (held('KeyD') ? 1 : 0) - (held('KeyA') ? 1 : 0);   // WASD walks, the arrow keys aim
  const iy = block ? 0 : (held('KeyS') ? 1 : 0) - (held('KeyW') ? 1 : 0);
  const ax = block ? 0 : (held('ArrowRight') ? 1 : 0) - (held('ArrowLeft') ? 1 : 0), ay = block ? 0 : (held('ArrowDown') ? 1 : 0) - (held('ArrowUp') ? 1 : 0);
  player.aim = ax || ay ? Math.atan2(ay, ax) : null;
  const use = !block && pressed.has('KeyE');   // (only the cannon still reads E directly: climbing down)
  prompt = null;

  if (player.mode === 'hatch') { updateHatch(dt); prompt = { text: 'Cycling outer airlock…' }; return; }
  if (player.health === 'down' || player.health === 'out') {     // can't do anything but get patched up
    updateCrew(player, dt, 0, 0);
    const self = treatInfo(player);
    prompt = { text: self ? `You're down — hold click on yourself to ${self.label.replace(' — ', ': ')} (${self.time} s)` : 'You are out cold — a crewmate has to treat you (hold click on you, 2 s)', screen: true };
    return;
  }

  if (player.mode === 'gun') {
    const g = player.gun;
    if (mouse.moved) {
      const [wx, wy] = mouseWorld();
      g.aim = Math.atan2(wy - g.y, wx - g.x);
    }
    g.aim += (ix + ax) * GUN_TURN * dt;
    const d = wrapAngle(g.aim - g.a);
    const arc = gunArc(g);
    g.aim = g.a + clamp(d, -arc, arc);
    // cover: a metal plate that rises in front of you and the cannon; no firing while it's up
    const covering = !block && (held('ShiftLeft', 'ShiftRight') || mouse.right);
    player.cover = clamp(player.cover + (covering ? dt : -dt) * COVER_SPEED, 0, 1);
    // reload: R (the on-screen RELOAD button is handled by the browser and sent as a command)
    if (!block && pressed.has('KeyR')) reloadCannon(g);
    if (!block && held('KeyR') && g.reload > 0) g.reload = Math.max(0.01, g.reload - dt * RELOAD_HOLD_RATE * (player.health === 'hurt' ? 0.6 : 1));
    if (!mouse.down) player.gunReady = true;            // the click that got you in doesn't fire: let go first
    if (!block && player.cover < 0.3 && ((mouse.down && !mouse.suppress && player.gunReady) || held('Space'))) fireCannon(g);
    // the gunner always sits opposite the barrel
    player.x = g.x - Math.cos(g.aim) * GUNNER_OFFSET; player.y = g.y - Math.sin(g.aim) * GUNNER_OFFSET; player.face = g.aim;
    prompt = { text: player.cover > 0.5 ? 'Cover raised — let go of the right mouse button to fire again'
                                        : broken(g) ? `${g.name} is BROKEN — repair it at its ladder`
                                        : g.shots ? `${g.name} · Left click: fire · Right click (hold): raise cover`
                                        : `${g.name} is empty — click RELOAD (uses 1 energy)`, screen: true };
    if (use) climbDown();
    return;
  }

  updateCrew(player, dt, ix, iy);

  if (player.mode === 'eva') {
    // (cannons are only manned from inside, via their ladders; spacewalks are for other jobs)
    const h = HATCHES.find(h => Math.hypot(player.x - h.outside[0], player.y - h.outside[1]) < 1.5);
    if (h) {
      const at = { x: h.x, y: h.y, r: 1.2 };
      if (broken(h)) act({ text: 'Click: force the broken outer airlock (manual override)', at, run: () => startOverride(h, 'Broken outer airlock', () => startHatch(h, 'in')) });
      else if (h.locked) act({ text: 'Click: outer airlock is locked — manual override', at, run: () => startOverride(h, 'Outer airlock') });
      else act({ text: 'Click: go back inside', at, run: () => startHatch(h, 'in') });
    }
    return;
  }

  // inside: whatever you're standing next to
  const hatch = HATCHES.find(h => Math.hypot(player.x - h.inside[0], player.y - h.inside[1]) < 1.3 && dk.dock?.side !== h.side);   // (docked: walk through)
  const button = SHIELD_BUTTONS.find(b => Math.hypot(player.x - b.x, player.y - (b.y + 0.7)) < 1.1);
  const ladder = GUNS.find(g => Math.hypot(player.x - g.hatch[0], player.y - g.hatch[1]) < 0.9);
  const doorway = DOORWAYS.find(d => Math.hypot(player.x - (d.x + d.w / 2), player.y - (d.y + d.h / 2)) < 1.3);
  if (ladder) {
    act({ text: `Click: climb up into the ${ladder.name.toLowerCase()}`, at: { x: ladder.hatch[0], y: ladder.hatch[1], r: 0.7 },
          run: () => { player.mode = 'gun'; player.gun = ladder; player.vx = player.vy = 0; mouse.moved = 0; player.gunReady = false; } });
  } else if (button) {
    const s = combat.shields[button.side], cap = CAPACITORS[SIDE_CAP[button.side]], at = { x: button.x, y: button.y, r: 0.7 };
    if (broken(button)) act({ text: 'Shield button is broken', at });
    else if (s.up > 0) {                              // hold the button to keep it up 2 s longer (1 more energy)
      const onIt = Math.hypot(mouse.wx - at.x, mouse.wy - at.y) <= at.r;
      if (mouse.down && onIt && !s.extended && s.up < 0.5 && cap.charge > 0 && useEnergy(SIDE_CAP[button.side], 'shield_' + button.side)) { s.up += 2; s.cd += 2; s.extended = true; sfx.shieldUp(); }
      act({ text: s.extended ? 'Shield is up! (extended)' : 'Shield is up! Keep holding click on the button for +2 s (1 more energy)', at, ok: true });
    }
    else if (s.cd > 0) act({ text: `Shield recharging (${s.cd.toFixed(1)} s)`, at });
    else if (cap.charge <= 0 || broken(cap)) act({ text: 'No energy for the shield (capacitor empty)', at });
    else act({ text: `Click: raise the ${SIDE_LABEL[button.side].toLowerCase()} shield (${SHIELD_UP_TIME} s, 1 energy)`, at, run: () => pressShield(button.side) });
  } else if (hatch) {
    const at = { x: hatch.x - hatch.dir * 0.2, y: hatch.y, r: 1.1 };
    if (broken(hatch)) act({ text: 'Click: force the broken outer airlock (manual override)', at, run: () => startOverride(hatch, 'Broken outer airlock', () => startHatch(hatch, 'out')) });
    else if (hatch.locked) act({ text: 'Click: outer airlock is locked — manual override', at, run: () => startOverride(hatch, 'Outer airlock') });
    else act({ text: 'Click: go outside (spacewalk)', at, run: () => startHatch(hatch, 'out') });
  } else if (dockAct()) {
  } else if (doorway && doorway.blast && doorRooms(doorway).some(r => r.id === 'reactor')) {
    act({ text: 'Blast door sealed — no pressure on the other side, and the cat lives in the reactor room. Go around.', at: { x: doorway.x + doorway.w / 2, y: doorway.y + doorway.h / 2, r: 1.2 } });
  } else if (doorway && doorway.blast) {
    act({ text: 'Click: blast door (vacuum behind it) — force it up for 5 s (manual override)', at: { x: doorway.x + doorway.w / 2, y: doorway.y + doorway.h / 2, r: 1.2 },
          run: () => startOverride(doorway, 'Blast door', () => { doorway.blastHold = 5; doorway.blast = false; }) });
  } else if (doorway && doorway.locked) {
    act({ text: 'Click: door is locked by security — manual override', at: { x: doorway.x + doorway.w / 2, y: doorway.y + doorway.h / 2, r: 1.2 }, run: () => startOverride(doorway, 'Door') });
  } else {
    const L = DECK_LOCKS.find(L => player.x > L.x - 0.2 && player.x < L.x + L.w + 0.2 &&
                                   player.y > SPINE_Y0 - 1.2 && player.y < SPINE_Y1 + 1.2);
    if (L) {
      const inside = player.y > SPINE_Y0 && player.y < SPINE_Y1, at = { x: L.x + L.w / 2, y: (SPINE_Y0 + SPINE_Y1) / 2, r: 1.8 };
      if (broken(L)) {
        const stuck = !(L.doors.top > 0.95 && L.doors.bottom > 0.95);
        if (stuck) act({ text: 'Click: airlock is broken — force a door open (manual override)', at, run: () => startOverride(L, 'Broken deck airlock', () => forceDeckLock(L)) });
        else act({ text: 'Deck airlock is broken (doors forced open)', at });
      }
      else if (L.locked) act({ text: 'Click: airlock is locked by security — manual override', at, run: () => startOverride(L, 'Deck airlock') });
      else if (L.phase === 'cycling') act({ text: 'Airlock cycling…', at });
      else if (L.phase !== 'idle') act({ text: 'Airlock doors moving…', at });
      else if (inside) act({ text: 'Click: cycle the airlock', at, run: () => startCycle(L, other(L.open)) });
    }
  }
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
function act(p) {
  prompt = { ok: !!p.run || !!p.ok, ...p };
  if (!p.run) return;
  if ((debugOpen && player === me) || ui.panel || mission.over) return;
  const m = mouseWorld(), onIt = p.at && Math.hypot(m[0] - p.at.x, m[1] - p.at.y) <= p.at.r && !clickTarget(m[0], m[1])?.ok;   // something more specific under the mouse wins
  const eForMe = pressed.has('KeyE') && !ui.panel && !hover?.ok;   // (E on something highlighted under the mouse goes there)
  if ((mouse.click && onIt) || eForMe) { mouse.click = false; if (eForMe) player.eUsed = true; pressed.delete('KeyE'); p.run(); }
}

// Mouse in the world: left click grabs / uses / repairs (hold), right click attacks.
// E does the same as a click on whatever is highlighted: under the mouse, or else the nearest thing
// in reach (hold E for hold jobs). Space fires the weapon the way you face.
function updateInteraction(dt) {
  hover = null;
  if (mission.over || ui.panel) { player.repair = null; player.treat = null; player.hold = null; player.charge = null; return; }
  if (player.mode === 'gun' || player.mode === 'hatch') { player.repair = null; player.treat = null; player.hold = null; player.charge = null; return; }
  const [mx, my] = mouseWorld();
  hover = pickHover(player, mx, my);
  let target = hover, holding = mouse.down, click = mouse.click;
  const eDown = keys.has('KeyE') && !player.eUsed, eTap = pressed.has('KeyE') && !player.eUsed;
  if (!mouse.down) {
    const e = hover?.ok ? hover : nearbyTarget(eDown || eTap);
    if (e && !hover?.ok && !prompt?.run && !prompt?.screen)            // show what E would do
      prompt = { text: e.text.replace(/^Hold click:/, 'Hold E:').replace(/^Click:/, 'E:').replace('quick click:', 'tap E:'), ok: true, e: true, at: { x: e.x, y: e.y, r: e.r } };
    if (eDown || eTap || (player.eHeld && !keys.has('KeyE'))) { target = e; holding = eDown; click = eTap; }   // (letting go of E counts too: quick taps)
  }
  player.eHeld = eDown;
  if (target?.run && click) { target.run(); mouse.click = false; player.eUsed = true; }
  updateRepair(dt, target, holding);
  updateHold(dt, target, holding);
  updateTreat(dt, target, holding);
  if (!standing(player)) { player.charge = null; return; }      // down: no weapons
  updateWeapon(dt, mx, my);
}
// The nearest thing in reach that a click would do something with (for E). Rescanned every tick
// while E is down, otherwise a few times a second (it's only shown as a prompt then).
function nearbyTarget(now) {
  if (!now && player.eScan && time - player.eScan.t < 0.15) return player.eScan.target;
  let best = null, bd = Infinity;
  if (player.mode === 'inside' || player.mode === 'eva')
    for (let gx = -REACH; gx <= REACH; gx += 0.3) for (let gy = -REACH; gy <= REACH; gy += 0.3) {
      if (gx * gx + gy * gy > REACH * REACH) continue;
      const t = clickTarget(player.x + gx, player.y + gy);
      if (!t?.ok || !(t.run || t.repair || t.treat || t.hold)) continue;
      const d = Math.hypot(t.x - player.x, t.y - player.y);
      if (d < bd) { bd = d; best = t; }
    }
  player.eScan = { t: time, target: best };
  return best;
}

function climbDown() {
  if (player.mode !== 'gun') return;
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
  else if (kind === 'reload') { if (player.mode === 'gun') reloadCannon(player.gun); }
  else if (kind === 'climbDown') climbDown();
  else if (kind === 'reboot') rebootSwitch(arg);
  else if (kind === 'practice') runPractice(arg);
  else if (kind === 'debug') DEBUG_ITEMS.find(it => it.key === arg)?.run();
}
let sendCommand = (cmd) => withCrew(me, () => runCommand(cmd));   // multiplayer replaces this

// Doors between rooms: open unless locked; never close on someone standing in them.
function updateDoorways(dt) {
  for (const d of DOORWAYS) {
    // only an open door waits for someone standing in it; a shut door never reopens for someone pushing on it
    const blocked = d.open > 0.5 && actors().some(c => inRect(c.x, c.y, d, CREW_R));
    const target = (d.locked || d.blast) && !blocked ? 0 : 1;
    d.open = clamp(d.open + Math.sign(target - d.open) * dt / 0.35, 0, 1);
  }
}

// ---------------------------------------------------------------------------
// Debug menu (` key)
// ---------------------------------------------------------------------------
function teleportToGun(id) {
  const g = GUNS.find(g => g.id === id);
  player.mode = 'gun'; player.gun = g; mouse.moved = 0; player.gunReady = false;
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
  { key: 'i', label: 'Invader through the left airlock', run: () => spawnInvader('port') },
  { key: 'o', label: 'Invader through the right airlock', run: () => spawnInvader('star') },
  { key: '0', label: 'Clear threats and reset hit counts', run: () => { combatClear(); boarding.invaders = []; boarding.bolts = []; } },
  { key: 'm', label: 'Restart the mission', run: () => { combatClear(); boarding.invaders = []; fires.length = 0; startMission(); } },
  { key: 'n', label: 'Stop the mission (free play)', run: () => { mission.active = false; } },
  { key: 'f', label: 'Start a fire next to you', run: () => spawnFire(player.x + 1, player.y) },
  { key: 'b', label: 'Break a random system', run: () => { const s = SYSTEMS.filter(s => !s.broken); if (s.length) breakSystem(s[Math.floor(Math.random() * s.length)]); } },
  { key: 'e', label: 'Fill all capacitors', run: () => CAPACITORS.forEach(c => { c.charge = CAP_MAX; }) },
  { key: 'h', label: 'Hull breach in this room (or the nearest)', run: () => { const r = roomAt(player.x, player.y); breachRoom(r && BREACH_SPOTS[r.id] ? r.id : 'portLock'); } },
  { key: 'j', label: 'Surge, no gravity, plasma fire (here)', run: () => { const r = roomAt(player.x, player.y) || ROOMS[0]; surgeColumn(r.col); failGravity(r.id); const s = SYSTEMS.filter(s => !burning(s)).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0]; igniteSystem(s, true); } },
  { key: 'k', label: 'Spacewalk jobs: mines, spores, debris, antenna, canister', run: () => { spawnMineDrone('port'); spawnSpores('star'); jamCannon('port'); knockAntenna(); spawnCanister('port'); } },
  { key: 'l', label: 'Ship-wide: flare, storm, coolant leak, AI glitch', run: () => { startFlare(); startStorm(); startCoolantLeak(); startGlitch(); } },
  { key: 'z', label: 'Stealth fighter left, tractor tug right', run: () => { combatSpawn('stealth', 'port', true); combatSpawn('tractor', 'star', true); } },
  { key: 'c', label: 'Organic: grappler left, leeches + spore mother right, leviathan', run: () => { combatSpawn('grappler', 'port', true); combatSpawn('mother', 'star', true); spawnLeeches('star'); startLeviathan(); } },
  { key: 'd', label: 'Pirates dock left · derelict (box + engineer) right', run: () => { dockShip('pirate', 'port'); } },
  { key: 'r', label: 'Derelict with black box + engineer on the right', run: () => { dockShip('derelict', 'star', { blackbox: true, npc: true }); } },
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
  { key: 'y', label: '', hidden: true, run: () => { openRadar(); ui.mini.angle = Math.PI; radarPing(ui.mini); } },
  { key: 'w', label: '', hidden: true, run: () => { power.lever.jammed = true; } },
  { key: 'u', label: '', hidden: true, run: () => { ui.panel = 'security'; DOORWAYS[2].locked = true; DECK_LOCKS[1].locked = true; } },
  { key: 'g', label: '', hidden: true, run: () => openScope() },
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
    if (pressed.has(/\d/.test(it.key) ? 'Digit' + it.key : 'Key' + it.key.toUpperCase()) || hitRow) { sendCommand(['debug', it.key]); debugOpen = false; mouse.click = false; mouse.down = false; return; }
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
// follows you; on a cannon it frames the cannon's field of fire. Tab: whole ship.
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
  const vh = VH - HUD_H, vsy = viewSy(), zRoom = Math.min(VW / (VIEW_ROOM.w * T), vh / (VIEW_ROOM.h * T * vsy));
  if (player.mode === 'gun') {
    const [cx, cy, w] = player.gun.view;
    return [cx, cy, Math.min(VW / (w * T), vh / (w * 0.62 * T * vsy))];
  }
  if (player.mode === 'eva' || (player.mode === 'hatch' && player.hatchDir === 'out' && player.hatchT > HATCH_TIME / 2))
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
  cam.overview = clamp(cam.overview + (held('Tab') || DEBUG_OVERVIEW ? dt : -dt) * 4, 0, 1);
  const o = cam.overview * cam.overview * (3 - 2 * cam.overview);
  const vh = VH - HUD_H;
  const zShip = Math.min(VW / ((VIEW_SHIP.x1 - VIEW_SHIP.x0) * T), vh / ((VIEW_SHIP.y1 - VIEW_SHIP.y0) * T * viewSy()));
  const k = cam.zoom ? 1 - Math.exp(-2.6 * dt) : 1;
  cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k);
  cam.baseZoom = lerp(cam.baseZoom || tz, tz, k);
  cam.zoom = cam.baseZoom * Math.pow(zShip / cam.baseZoom, o);
  cam.ox = lerp(0, (VIEW_SHIP.x0 + VIEW_SHIP.x1) / 2 - cam.x, o);
  cam.oy = lerp(0, (VIEW_SHIP.y0 + VIEW_SHIP.y1) / 2 - cam.y, o);
  const s = combat.shake * combat.shake * 0.35;        // big hits rattle the whole ship
  cam.sx = s * (Math.sin(time * 61) + 0.5 * Math.sin(time * 97)); cam.sy = s * (Math.cos(time * 53) + 0.5 * Math.sin(time * 89));
}
// Screen (CSS px) = (ox + x·T·zoom, oy + y·T·zoom·sy) for a point on the ground.
function camera() {
  const x = cam.x + cam.ox + cam.sx, y = cam.y + cam.oy + cam.sy, sy = viewSy();
  return { zoom: cam.zoom, sy, ox: VW / 2 - x * T * cam.zoom, oy: HUD_H + (VH - HUD_H) / 2 - y * T * cam.zoom * sy };
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
function drawDownCross(c, t) {
  const k = 0.6 + 0.4 * Math.sin(t * 5), x = c.x * T, y = (c.y - 0.6 - GFX.lift(0.4)) * T;
  ctx.fillStyle = `rgba(226,60,50,${k})`; ctx.fillRect(x - 3, y - 9, 6, 18); ctx.fillRect(x - 9, y - 3, 18, 6);
  ctx.strokeStyle = 'rgba(20,22,27,0.8)'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 3, y - 9, 6, 18); ctx.strokeRect(x - 9, y - 3, 18, 6);
}
// This browser's own injury on screen: tunnel vision while hurt, dark red while down, near black while out.
function drawInjuryOverlay(t) {
  const h = me.health || 'ok';
  if (h === 'ok') return;
  const cx = VW / 2, cy = VH / 2, r = Math.hypot(VW, VH) / 2;
  const inner = h === 'hurt' ? 0.28 + 0.03 * Math.sin(t * 6) : h === 'down' ? 0.12 : 0.04;   // heartbeat while hurt
  const g = ctx.createRadialGradient(cx, cy, r * inner, cx, cy, r);
  const col = h === 'hurt' ? '8,4,6' : '30,0,0';
  g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(0.55, `rgba(${col},${h === 'hurt' ? 0.75 : 0.85})`); g.addColorStop(1, `rgba(${col},${h === 'out' ? 0.98 : 0.95})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  if (h === 'hurt') {
    ctx.fillStyle = 'rgba(255,140,120,0.8)'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(`HURT — ${Math.ceil(me.hurtT)} s (another hit puts you down)`, cx, HUD_H + 12); ctx.textAlign = 'left';
  }
}

// Charging the heavy blaster: a growing orb at the muzzle; fully charged it flickers blue-white.
function drawBlasterCharge(c, t) {
  const k = clamp(c.charge / BLASTER_CHARGE, 0, 1), full = k >= 1;
  const x = (c.x + Math.cos(c.face) * 0.42) * T, y = (c.y + Math.sin(c.face) * 0.42) * T, r = T * (0.06 + 0.16 * k) * (full ? 1 + 0.15 * Math.sin(t * 30) : 1);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, full ? '#9cd8ff' : '#ffb07a'); g.addColorStop(1, 'rgba(120,200,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, TAU); ctx.fill();
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
function render(t) {
  const view = camera(), G = GFX.on;
  const space = { x: (cam.x + cam.ox) * T * 4, y: (cam.y + cam.oy) * T * 4 * view.sy - t * CRUISE_SPEED, rot: 0 };
  const world = (k) => ctx.setTransform(k * view.zoom, 0, 0, k * view.zoom * view.sy, k * view.ox, k * view.oy);
  let parts = {};
  ctx = SCREEN_CTX;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (G) {
    GFX.begin(view, t);
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
  drawBreachesOutside(t);
  drawEvaJobs(t);
  drawOrganicWorld(t);
  drawDock(t);
  const gunsSprited = GUNS.filter(g => G && drawGunSprite(g));
  for (const g of GUNS) if (!gunsSprited.includes(g)) drawGun(g.x * T, g.y * T, g.aim, g.flash);
  if (!parts.walls) drawSpine(SPINE_Y0, SPINE_Y1, 0.2, SHIP_W - 0.2, DECK_LOCKS);
  if (!G) { drawSpineDecor(t); drawInteriorWalls(); }
  if (!parts.floors) drawFloors(FLOOR_RECTS, (r) => zoneAtX(r.x + 0.01).tint);
  for (const r of ROOMS) drawRoomLabel(r);
  if (!G) drawLightPools();
  drawLeviathanWarning(t);
  drawFloorDecor(t);
  drawJunk();
  drawGoo();
  drawBreaches(t);
  drawPowerLines(t);
  drawEngineHousing(t, ENGINE);
  if (!parts.locks) for (const L of DECK_LOCKS) drawDeckLock(L, t);
  if (!parts.doors) drawDoorways();
  if (!parts.hatches) for (const h of HATCHES) drawHatch(h);
  for (const g of GUNS) drawGunLadder(g);
  drawReactor(REACTOR, t);
  drawLever(t);
  for (const s of STATIONS) drawStation(s, t);
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
  drawInteractMarkers(t);
  drawItems(t);
  drawFires(t);
  for (const s of SYSTEMS) if (s.broken) drawBroken(s, t);
  drawEnergyBolts();
  drawClickTarget(me.hover);
  if (me.prompt?.e && !me.hover?.ok) drawClickTarget({ ...me.prompt.at, ok: true });   // what E would do
  // the crew (as sprites when they're loaded, else in 2D)
  const visorOf = (c) => isOutside(c) || (c.mode === 'hatch' && c.hatchDir === 'out' ? c.hatchT > HATCH_TIME * 0.3 : c.mode === 'hatch' ? c.hatchT < HATCH_TIME * 0.7 : inVacuum(c.x, c.y));
  const sprited = new Set();
  for (const c of crew) {
    if (G && drawCrewSprite(c, visorOf(c), t)) { sprited.add(c); if (c.mode === 'eva') drawSafetyLine(c); continue; }
    if (!standing(c)) drawCrewDown(c, t);
    else if (c.mode === 'inside' || c.mode === 'hatch') drawCrew(c.x * T, c.y * T, c.face, c.walk, visorOf(c), c.color);
    else drawCrewOutside(c, t);
  }
  if (G) {                                           // the rest goes on top, on `c`
    ctx = SCREEN_CTX; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, VW, VH);
    ctx.save(); world(DPR);
    drawSpineDecor(t); drawInteriorWalls();
    drawBrokenLabels();                              // (js/systems.js: on top of the machines' sprites)
    for (const g of gunsSprited) drawMuzzleFlash(g);
  }
  for (const c of crew) {
    if (sprited.has(c) && !standing(c)) drawDownCross(c, t);
    const tr = crew.find(o => o.treat?.id === c.id);                  // someone treating them: progress ring
    if (tr) {
      const info = withCrew(tr, () => treatInfo(c));
      if (info) {
        ctx.beginPath(); ctx.arc(c.x * T, c.y * T, T * 0.55, -Math.PI / 2, -Math.PI / 2 + Math.min(1, tr.treat.t / info.time) * TAU); ctx.strokeStyle = '#5fd6a0'; ctx.lineWidth = 5; ctx.stroke();
        const beat = 1 - (((tr.treat.t + BEAT / 2) % BEAT) - BEAT / 2) ** 2 * 40;   // the heartbeat: click when the ring pulses
        if (beat > 0) { ctx.beginPath(); ctx.arc(c.x * T, c.y * T, T * (0.7 + 0.15 * beat), 0, TAU); ctx.strokeStyle = `rgba(255,120,140,${beat})`; ctx.lineWidth = 3; ctx.stroke(); }
      }
    }
    if (c.mode === 'gun' && c.cover > 0) drawCover(c.gun, c.cover);
    if (c.charge != null) drawBlasterCharge(c, t);
    if (c !== me && crew.length > 1) upright(view, c.x, c.y, sprited.has(c) ? 1.35 : 0.45, () => {   // name tags for the others
      ctx.font = `700 ${T * 0.26}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,18,0.8)'; ctx.strokeText(c.name, 0, 0);
      ctx.fillStyle = c.color; ctx.fillText(c.name, 0, 0); ctx.textAlign = 'left';
    });
  }
  drawBoarding(t);
  drawDockActors(t);
  if (!G) drawLights(1 / 60);
  drawVacuumTint();
  drawDockDarkness();
  drawCombatFront(t);

  const prompt = me.prompt, hover = me.hover;
  if (prompt && !prompt.screen) upright(view, me.x, me.y, G && sprited.has(me) ? 1.45 : 0.55, () => {
    ctx.font = `600 ${T * 0.3}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    const w = ctx.measureText(prompt.text).width + 18;
    rr(-w / 2, -T * 0.42, w, T * 0.46, 6); ctx.fillStyle = 'rgba(12,14,20,0.82)'; ctx.fill(); stroke(1.5, prompt.ok ? '#5fd6a0' : '#6b7486');
    ctx.fillStyle = prompt.ok ? '#c8ffe6' : '#c9ced8'; ctx.fillText(prompt.text, 0, -T * 0.06);
    ctx.textAlign = 'left';
  });
  ctx.restore();
  if (prompt && prompt.screen) {
    ctx.font = '600 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(prompt.text).width + 30;
    rr(VW / 2 - w / 2, VH - 54, w, 34, 8); ctx.fillStyle = 'rgba(12,14,20,0.82)'; ctx.fill(); stroke(1.5, '#5fd6a0');
    ctx.fillStyle = '#c8ffe6'; ctx.fillText(prompt.text, VW / 2, VH - 37); ctx.textAlign = 'left';
  }
  drawEncounterOverlay(view, t);
  drawInjuryOverlay(t);
  drawCombatHUD(view, HUD_H);
  drawSystemsHUD(HUD_H);
  if (me.mode === 'gun') drawCannonHUD(me.gun);
  drawSidebar(HUD_H);
  if (hover && !debugOpen) {                        // tooltip next to the mouse
    ctx.font = '600 13px system-ui, sans-serif'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(hover.text).width + 16;
    const tx = Math.min(mouse.x + 16, VW - w - 6), ty = mouse.y + 22;
    rr(tx, ty - 12, w, 24, 6); ctx.fillStyle = 'rgba(12,14,20,0.88)'; ctx.fill(); stroke(1.5, hover.ok ? '#5fd6a0' : '#6b7486');
    ctx.fillStyle = hover.ok ? '#c8ffe6' : '#c9ced8'; ctx.fillText(hover.text, tx + 8, ty);
  }
  drawHUD();
  drawDebugMenu();
  drawPanels(t);
  if (G) GFX.end();
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
  ctx.fillStyle = '#e8ecf4'; ctx.fillText('MANIFOLD NOVUM', 44, 18);
  ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5';
  ctx.fillText('WASD move · Arrows aim · E / left click: interact · Space / right click: weapon · Tab: overview · M: mute · `: debug', 200, 18);
  const room = roomAt(player.x, player.y);
  const where = player.mode === 'gun' ? player.gun.name : player.mode === 'eva' ? 'Spacewalk' : player.mode === 'hatch' ? 'Outer airlock'
    : room ? room.name : inDock(player.x, player.y) ? dockName() : 'Deck airlock';
  ctx.textAlign = 'right'; ctx.fillStyle = '#e8ecf4'; ctx.fillText(where, VW - 14, 18);
  const ww = ctx.measureText(where).width;
  const song = sfx.muted ? '♪ muted' : `♪ ${music.title}`;
  ctx.fillStyle = '#6b7486'; ctx.fillText(song, VW - 30 - ww, 18);
  drawAlarmHUD(VW - 46 - ww - ctx.measureText(song).width, 18, time);   // fire / red alert (js/lights.js)
  ctx.textAlign = 'left';
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
  for (let i = 0; i < SHOTS_PER_ENERGY; i++) {        // shells
    const sx = b.x + 4 + i * 26, sy = b.y - 44, on = i < g.shots;
    rr(sx, sy, 14, 30, 6); ctx.fillStyle = on ? '#e8c34f' : '#2b303a'; ctx.fill(); stroke(1.5);
    if (on) { ctx.fillStyle = '#b8862a'; ctx.fillRect(sx + 2, sy + 20, 10, 5); }
  }
  ctx.fillStyle = cap.charge ? '#9cd8ff' : '#ff8a7a'; ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(`energy: ${cap.charge}/${CAP_MAX}`, b.x + 86, b.y - 38);
  ctx.fillText(`(${['left', 'mid', 'right'][GUN_CAP[g.id]]} capacitor)`, b.x + 86, b.y - 22);
  const hover = inReloadBtn(mouse.x, mouse.y), pulse = empty ? 0.5 + 0.5 * Math.sin(time * 6) : 0;
  rr(b.x, b.y, b.w, b.h, 8);
  ctx.fillStyle = g.reload ? '#2b303a' : empty ? `rgb(${150 + 60 * pulse | 0},${60 + 20 * pulse | 0},40)` : hover ? '#4a515e' : '#3a3f4a'; ctx.fill();
  stroke(2, empty ? '#ffb07a' : '#6b7486');
  if (g.reload) { rr(b.x + 3, b.y + 3, (b.w - 6) * (1 - g.reload / RELOAD_TIME), b.h - 6, 6); ctx.fillStyle = '#5fd6a0'; ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.font = '800 14px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(g.reload ? 'RELOADING…' : 'RELOAD · 1 energy', b.x + b.w / 2, b.y + b.h / 2); ctx.textAlign = 'left';
  drawCrank(g);
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
  for (const c of crew) withCrew(c, () => {
    updatePlayer(dt);
    updateInteraction(dt);
    updateOverride(dt);
    updateInjury(player, dt);
    inv.cd = Math.max(0, inv.cd - dt);
    pressed.clear(); mouse.click = false; mouse.rightClick = false;
  });
  updateHatches(dt);
  for (const L of DECK_LOCKS) updateDeckLock(L, dt);
  updateCombat(dt);
  updatePower(dt);
  updateBoarding(dt);
  updateDoorways(dt);
  updateFires(dt);
  updateMission(dt);
  updateLuck(dt);
  updateHazards(dt);
  updateEva(dt);
  updateEncounters(dt);
  updateMinigames(dt);
  updateOrganic(dt);
  updateDock(dt);
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
  if (GFX.on) { const p = GFX.pickAt(m.x, m.y); if (p) [m.wx, m.wy] = p; }   // pointing at a raised sprite (crew): its ground point
  updateDebug();
  if (localInput.pressed.has('KeyM')) sfx.toggleMute();
  music.setThreat(combat.enemies.some(e => e.phase === 'fighting') || combat.asteroids.length > 0 || !!combat.swarm || boarding.invaders.length > 0);
  music.setMission(mission.id || 'intro');                // each mission has its own piece, building up towards the jump
  music.setIntensity(!mission.active || mission.over ? 0.15 : isFinite(mission.jumpAt) ? Math.pow(clamp(mission.t / mission.jumpAt, 0, 1), 1.3) : 0.3);
  music.setJump(!!mission.jump && !mission.over);
  if (mission.over?.survived) music.jumped();              // the big final hit as we jump out
  miniClient(dt);
  practiceClient();
  if (me.ui.panel && m.click) { panelClick(m.x, m.y); m.click = false; }
  if (me.mode === 'gun' && m.click && inReloadBtn(m.x, m.y)) { sendCommand(['reload']); m.click = false; m.suppress = true; }
  if (me.mode === 'gun' && m.click && inClimbBtn(m.x, m.y)) { sendCommand(['climbDown']); m.click = false; m.suppress = true; }
  if (!m.down) m.suppress = false;
  if (mission.over) creditMission();                 // rewards for this browser's player (once per run)
  if (mission.over && localInput.pressed.has('KeyR')) backToLobby();
  if (NET.on) me.hover = withCrew(me, () => (me.mode === 'inside' || me.mode === 'eva') ? pickHover(me, m.wx, m.wy) : null);   // the server doesn't send hover; work it out here
  updateSidebar(HUD_H, dt);
  updateCamera(dt);
}
// Solo: one step of everything (also used by tests and the debug warp).
function tick(dt) { clientUpdate(dt); simTick(dt); }

// Multiplayer hooks (js/net.js fills these in when the page is served by server.js).
const NET = { on: false, frame: null };
function backToLobby() { location.reload(); }
let last = performance.now();
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now;   // (the first frame's timestamp can be a hair before `last`)
  if (NET.on) NET.frame(dt); else if (!lobbyOpen()) tick(dt); else clientUpdate(dt);
  render(now / 1000);
  requestAnimationFrame(frame);
}
mission.active = false;                              // the lobby starts a mission
const lobbyOpen = () => !!document.getElementById('lobby') && !document.getElementById('lobby').hidden;
if (DEBUG_DO.length || location.hash) { const l = document.getElementById('lobby'); if (l) l.hidden = true; }   // debug setups skip the lobby
requestAnimationFrame(frame);
