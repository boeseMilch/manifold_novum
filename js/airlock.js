// Outer airlocks (HATCHES in js/ship.js; 2026-10-21, the user: "for the outer airlocks we actually want the double
// doors"). Each is a small chamber against the hull wall with an INNER door (to the airlock room) and an OUTER door
// (the hatch, to space); only one of them is ever open. The chamber is pressurized or pumped out (h.air: the side it
// matches). Nobody presses anything:
//   going out   walk up to the inner door (it opens while you're in front of it, if the chamber has air), step in:
//               the inner door shuts behind you, the chamber pumps out (LOCK_CYCLE), the outer door opens, and
//               stepping out onto the doorstep outside puts you on a spacewalk (airlockThreshold).
//   coming in   float up to the outer door: an empty chamber cycles to you, the door opens, float in (pushing in
//               at the open hatch puts you back on your feet), it shuts, pumps up, the inner door opens.
//   in the chamber, E / click cycles it by hand (e.g. to turn back halfway).
// Who works the sensors: crew on their feet (inside, and on a spacewalk at the outer door), a friendly NPC walking
// home, and pirates while their ship is docked here. Intruders never open it (and keep out of the chamber).
// Docked with air on the other side (a pirate ship, the pirate base, the chapter-5 raider), the chamber is a plain
// passage: no pumping, each door opens for whoever comes (both may stand open). The derelict's tube has no air:
// the chamber cycles as usual, its outer door opening into the tube.
// Locked by security: both doors stay shut (never on someone), no cycling. Broken: the doors stay as they are.
// Either way the manual override forces it: both doors open at once and the airlock room vents to space
// (js/hazards.js forceHatchVent; the vent panel next to it does the same): during a vent both doors stand open,
// afterwards both shut and the chamber is pressurized again.
// ---------------------------------------------------------------------------------------------------------------
const AIRLOCK_DOOR_TIME = 0.3;           // s for a door to slide open / shut (the far one starts opening as the pump finishes)
const LOCK_CYCLES = { base: 1.3, fast: 0.7 };   // s the pump takes (LOCK_CYCLE, js/game.js), with the 'airlocks' ship upgrade: fast (js/progress.js)
const AIRLOCK_SENSE = 1.1;               // how far in front of a door its sensor reaches
const AIRLOCK_STEP_OUT = 0.12;           // stepping this far out past the hull's face (onto the doorstep) starts a spacewalk
const INTRUDER_ENTER_TIME = 2.4;         // s an intruder takes to force its way in through the chamber (js/invader.js enterHatch)
const otherLockSide = (s) => (s === 'inner' ? 'outer' : 'inner');
const airlockRoomId = (h) => (h.side === 'port' ? 'portLock' : 'starLock');
// One pass through the chamber (s): the door behind you shuts, the pump, the door ahead opens, a few steps.
// tools/balance.js uses it for spacewalks (twice: out and back in); tests/airlock.js checks it against a real walk.
const airlockPass = () => AIRLOCK_DOOR_TIME + LOCK_CYCLE + OL_W / WALK_SPEED;

// The way through the chamber from outside in: the hatch, the chamber's middle, the inner door (route points for
// pirates and the NPC: js/dock.js dockRoute, js/captain.js raidRoute).
const airlockWay = (h) => [{ x: h.outer.x + h.outer.w / 2, y: h.y }, { x: h.chamber.x + h.chamber.w / 2, y: h.y }, { x: h.inner.x + h.inner.w / 2, y: h.y }];
// What's docked at this airlock: 'air' (a pirate ship, the base, the raider: a pressurized tube), 'vacuum' (the
// derelict's tube, airless) or null (open space).
function airlockTube(h) {
  if (typeof dk === 'undefined') return null;
  const d = dk.dock;
  if (d && d.side === h.side && d.tube !== 'detached') return d.kind === 'derelict' ? 'vacuum' : 'air';
  if (dk.raid?.state === 'docked' && dk.raid.side === h.side) return 'air';
  return null;
}
const airlockVenting = (h) => typeof hz !== 'undefined' && hz.vent?.room === airlockRoomId(h);
// How far (x, y) is in from the hull's outer face, along the airlock (0 at the hatch's outer face, OL_WALL at the
// chamber, ... ; negative: outside).
const airlockDepth = (h, x) => (x - h.x) * -h.dir;
// Where (x, y) is: 'in' (the chamber), 'inner' (the room side: the inner door and in front of it), 'outer' (the
// hatch, the doorstep, outside, a docked tube) or null (nowhere near).
function airlockRegion(h, x, y) {
  const a = airlockDepth(h, x), dy = Math.abs(y - h.y);
  if (a >= OL_WALL && a <= OL_WALL + OL_W) return dy <= OL_H / 2 ? 'in' : null;
  if (a > OL_WALL + OL_W) return a < OL_WALL * 2 + OL_W + AIRLOCK_SENSE + 0.6 && dy < OL_H / 2 + 0.6 ? 'inner' : null;
  return a > -3 && dy < OL_H / 2 + 1.2 ? 'outer' : null;
}
const inAirlock = (h, x, y) => inRect(x, y, h.chamber);
const airlockAt = (x, y) => HATCHES.find(h => inRect(x, y, h.chamber) || inRect(x, y, h.inner) || inRect(x, y, h.outer)) || null;
// In front of a door, on its far side from the chamber (where you wait for it): the room side of the inner door,
// the outside of the outer one (the doorstep, a spacewalk spot by the hatch, the docked tube's mouth).
function airlockWaiting(h, s, x, y) {
  const a = airlockDepth(h, x), dy = Math.abs(y - h.y);
  if (s === 'inner') return a >= OL_WALL + OL_W && a < OL_WALL * 2 + OL_W + AIRLOCK_SENSE && dy < OL_H / 2 + 0.1;
  return a <= OL_WALL && a > -0.45 - AIRLOCK_SENSE - 0.5 && dy < 0.9 + 0.4;
}
// Pumped out (or open to space): the chamber, the hatch's passage and the doorstep. Visor down in there (js/game.js).
function airlockVacuum(x, y) {
  for (const h of HATCHES) {
    if (airlockTube(h) === 'air') continue;
    if (inRect(x, y, h.outer) || inRect(x, y, h.step)) return true;
    if (inRect(x, y, h.chamber)) return h.air === 'outer' || h.phase === 'vent' || (h.phase === 'cycling' && h.target === 'outer') || h.doors.outer > 0.05;
  }
  return false;
}
// The side each crew member / pirate / NPC came into the chamber from (for the chamber logic; host only).
const airlockEntries = new WeakMap();
function airlockEntry(o, h) { return airlockEntries.get(o)?.[h.side] ?? null; }

// Who the sensors react to at this airlock (see the top).
function airlockFriends(h) {
  const out = crew.filter(c => standing(c) && (c.mode === 'inside' || c.mode === 'eva'));
  if (typeof dk !== 'undefined') {
    if (dk.npc && dk.npc.state !== 'down') out.push(dk.npc);
    if (airlockTube(h) === 'air') out.push(...dk.pirates.filter(p => !p.dead && !(p.stun > 0)));
  }
  return out;
}
// Anyone with a body in the doorway (a door never shuts on them).
function airlockBodies() {
  return [...crew.filter(c => c.mode === 'inside'), ...boarding.invaders.filter(a => a.mode === 'inside'),
          ...(typeof dk !== 'undefined' ? [...dk.pirates, ...(dk.npc ? [dk.npc] : [])] : [])];
}
function startAirlockCycle(h, target = otherLockSide(h.air)) {
  if (h.phase !== 'idle' || target === h.air) return;
  h.phase = 'closing'; h.target = target; h.t = 0;
}

// E / click in the chamber: cycle it by hand (whoever is in there now wants the far side).
function airlockManual(h) {
  if (h.phase !== 'idle') return;
  for (const o of airlockFriends(h)) if (inAirlock(h, o.x, o.y)) { const rec = airlockEntries.get(o) || {}; rec[h.side] = h.air; rec['@' + h.side] = 'in'; airlockEntries.set(o, rec); }
  h.manual = true; startAirlockCycle(h);
}
function updateAirlocks(dt) { for (const h of HATCHES) updateAirlock(h, dt); }
function updateAirlock(h, dt) {
  const bodies = airlockBodies(), friends = airlockFriends(h);
  const inDoor = (s) => bodies.some(c => inRect(c.x, c.y, h[s], CREW_R));
  const move = (s, want) => { h.doors[s] = clamp(h.doors[s] + (want ? dt : -dt) / AIRLOCK_DOOR_TIME, 0, 1); };
  const shut = (s) => move(s, inDoor(s) && h.doors[s] > 0.25);   // closing, but never on someone standing in it
  // which side everyone stepped into the chamber from
  for (const o of friends) {
    const reg = airlockRegion(h, o.x, o.y), rec = airlockEntries.get(o) || {}, prev = rec['@' + h.side];
    if (reg === 'in') { if (prev === 'inner' || prev === 'outer') rec[h.side] = prev; }
    else rec[h.side] = null;
    rec['@' + h.side] = reg; airlockEntries.set(o, rec);
  }
  if (h.forced > 0) { h.forced -= dt; return; }       // an intruder forcing its way in works the doors (enterHatch)
  if (airlockVenting(h)) { h.phase = 'vent'; h.target = null; move('inner', true); move('outer', true); return; }
  if (h.phase === 'vent') h.phase = 'shut';          // the vent is over: both doors swing shut (broken or not), air again
  if (h.phase === 'shut') {
    shut('inner'); shut('outer');
    if (!h.doors.inner && !h.doors.outer) { h.phase = 'idle'; h.air = 'inner'; }
    return;
  }
  const tube = airlockTube(h);
  if (tube === 'air') {                              // a pressurized ship docked here: a plain passage (their docking clamp holds it,
                                                     // broken or locked: as the old hatch, which stood open while they were docked)
    h.phase = 'idle'; h.target = null; h.air = 'inner';
    for (const s of ['inner', 'outer']) {
      const near = friends.some(o => airlockWaiting(h, s, o.x, o.y) || (inAirlock(h, o.x, o.y) && Math.abs(airlockDepth(h, o.x) - (s === 'inner' ? OL_WALL + OL_W : OL_WALL)) < AIRLOCK_SENSE));
      move(s, near || (inDoor(s) && h.doors[s] > 0.25));
    }
    return;
  }
  if (broken(h)) { if (h.doors.inner > 0 && h.doors.outer > 0) shut('outer'); return; }   // broken: the doors stay as they are (never both open)
  if (h.locked) {                                    // locked by security: both shut, no cycling
    if (h.phase !== 'idle') { h.phase = 'idle'; h.target = null; }
    shut('inner'); shut('outer');
    if (h.doors.outer > 0) h.air = 'outer'; else if (h.doors.inner > 0) h.air = 'inner';
    return;
  }
  // both open (left from a passage, a forced door): the outer one shuts first, the chamber keeps the room's air
  if (h.phase === 'idle' && h.doors.inner > 0 && h.doors.outer > 0) { shut('outer'); if (!inDoor('outer')) h.air = 'inner'; return; }
  const A = h.air, B = otherLockSide(A);
  const occupants = friends.filter(o => inAirlock(h, o.x, o.y));
  const fully = (o) => inRect(o.x, o.y, h.chamber, -CREW_R);
  const wants = (o) => { const e = airlockEntry(o, h); return e ? otherLockSide(e) : A; };   // (no idea where they came from: out the open side)
  const goingOn = occupants.some(o => fully(o) && wants(o) === B), stayingA = occupants.some(o => wants(o) === A);
  const waitA = friends.some(o => airlockWaiting(h, A, o.x, o.y)), waitB = friends.some(o => airlockWaiting(h, B, o.x, o.y));
  if (h.phase === 'idle') {
    shut(B);
    if (goingOn && !inDoor(A) && !stayingA) { startAirlockCycle(h, B); return; }
    if (!occupants.length && waitB && !waitA && !inDoor(A) && h.doors[B] === 0) { startAirlockCycle(h, B); return; }
    move(A, waitA || stayingA || (inDoor(A) && h.doors[A] > 0.25));
  } else if (h.phase === 'closing') {
    const s = h.air;
    if (!(goingOn || (!occupants.length && waitB) || h.manual)) { h.phase = 'idle'; h.target = null; return; }   // (changed their mind)
    if (inDoor(s)) { move(s, true); return; }        // never shut on someone: wait until the doorway is clear
    move(s, false); shut(otherLockSide(s));
    if (h.doors[s] === 0) { h.phase = 'cycling'; h.t = 0; sfx.hatch(); }
  } else if (h.phase === 'cycling') {
    h.t += dt;
    if (h.t >= LOCK_CYCLE - AIRLOCK_DOOR_TIME) move(h.target, true);   // (the far door starts opening as the pump finishes: quicker)
    if (h.t >= LOCK_CYCLE) { h.phase = 'opening'; h.air = h.target; }
  } else if (h.phase === 'opening') {
    move(h.target, true);
    if (h.doors[h.target] === 1) { h.phase = 'idle'; h.target = null; h.manual = false; }
  }
}

// Inside → spacewalk and back, at an open outer door (run per crew member after it moved: js/game.js updateCrew).
// Out: stepping past the hull's face onto the doorstep. In: floating at the open hatch and pushing towards it.
// (tx, ty: where the crew member is pushing.)
function airlockThreshold(c, tx, ty) {
  if (typeof netLive !== 'undefined' && netLive) return;   // (a multiplayer client: the server says when you're out, js/net.js)
  for (const h of HATCHES) {
    if (h.doors.outer <= DOOR_WALK || airlockTube(h)) continue;
    const a = airlockDepth(h, c.x);
    if (c.mode === 'inside' && a < -AIRLOCK_STEP_OUT && Math.abs(c.y - h.y) < 0.9) {
      c.mode = 'eva'; c.x = h.x + h.dir * 0.5; c.gun = null;
      return;
    }
    if (c.mode === 'eva' && a > -0.6 && Math.abs(c.y - h.y) < 0.9 - CREW_R - 0.02 && (-h.dir * (tx || 0) > 0.3 || -h.dir * c.vx > 0.3)) {
      c.mode = 'inside'; c.x = h.x + h.dir * 0.05;
      return;
    }
  }
}

// What you can do at an outer airlock (from js/game.js updatePlayer). True if it put up a prompt.
function airlockAct() {
  const p = player;
  for (const h of HATCHES) {
    const reg = airlockRegion(h, p.x, p.y);
    if (!reg) continue;
    const inIt = reg === 'in', outside = p.mode === 'eva';
    const atDoor = inIt || (outside ? Math.hypot(p.x - h.outside[0], p.y - h.outside[1]) < 1.5 : reg === 'inner' && airlockWaiting(h, 'inner', p.x, p.y));
    if (!atDoor || airlockTube(h) === 'air') continue;   // (docked: just walk through)
    const [cx, cy] = [h.chamber.x + h.chamber.w / 2, h.chamber.y + h.chamber.h / 2];
    const at = inIt ? { x: cx, y: cy, r: 1.3 } : outside ? { x: h.x, y: h.y, r: 1.2 } : { x: h.inner.x + h.inner.w / 2, y: h.y, r: 1.2 };
    const what = inIt ? 'the airlock' : outside ? 'the airlock room' : 'this room';
    if (broken(h) || h.locked) {
      const shutNow = h.doors.inner < 0.95 || h.doors.outer < 0.95;
      if (!shutNow) { act({ text: 'Outer airlock forced open — venting', at, quiet: true }); return true; }
      act({ text: `Click: force the ${broken(h) ? 'broken' : 'locked'} outer airlock (manual override) — vents ${what}!`, at,
            run: () => startOverride(h, broken(h) ? 'Broken outer airlock' : 'Outer airlock', () => { h.locked = false; forceHatchVent(h, player); }) });
      return true;
    }
    if (h.phase === 'vent') { act({ text: 'Outer airlock open — the room is venting', at, quiet: true }); return true; }
    if (h.phase === 'cycling') { act({ text: h.target === 'outer' ? 'Airlock pumping out…' : 'Airlock pumping up…', at, quiet: true }); return true; }
    if (h.phase !== 'idle') { act({ text: 'Airlock doors moving…', at, quiet: true }); return true; }
    if (inIt) { act({ text: h.air === 'inner' ? 'Click: cycle the airlock (out to space)' : 'Click: cycle the airlock (back inside)', at, run: () => airlockManual(h) }); return true; }
    if (outside) { act({ text: h.air === 'outer' ? 'Outer airlock — float in' : 'Outer airlock — cycling to you', at, quiet: true }); return true; }
    act({ text: h.air === 'inner' ? 'Outer airlock — walk in to go outside (spacewalk)' : 'Outer airlock — cycling to you', at, quiet: true });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing. Sprites (tools/blender/models/interior/outerlock.py + doors.py): the chamber's floor plate with its
// light strips (state), the control panel on the inner door's jamb (room side), the inner door (the doorways'
// interior/door_v_*), the outer door (the hatch: interior/hatch_<side>_*). The walls round the chamber are the
// ship's wall kit (js/sprites.js buildWalls). Classic view (?classic): drawAirlock2D.
// ---------------------------------------------------------------------------------------------------------------
// The state the lights show: 'air' (pressurized, idle), 'vac' (pumped out), 'cycle' (pumping), 'busy' (doors
// moving), 'locked', 'broken', 'vent'.
function airlockLook(h) {
  if (broken(h)) return 'broken';
  if (h.phase === 'vent') return 'vent';
  if (h.locked) return 'locked';
  if (h.phase === 'cycling') return 'cycle';
  if (h.phase !== 'idle') return 'busy';
  return h.air === 'outer' && airlockTube(h) !== 'air' ? 'vac' : 'air';
}
// Lighting (js/lights.js gameLighting; lamp: each column's lamp power 0..1): the chamber gets an ambient area and a
// light in the colour of its state (green: air, red: pumped out / locked / venting, amber blinking: pumping or doors
// moving, a dying flicker: broken); the room's corners beside the chamber (cut off from the room's lamps by its
// walls) a lamp each.
function airlockLighting(t, lamp) {
  const areas = [], lights = [];
  for (const h of HATCHES) {
    const k = lamp[h.side === 'port' ? 0 : 2], c = h.chamber, look = airlockLook(h), blink = Math.sin(t * 12) > 0 ? 1 : 0.35;
    areas.push({ x: c.x, y: c.y, w: c.w, h: c.h, k });
    const col = { air: [0.55, 1.0, 0.65], vac: [1.0, 0.3, 0.22], cycle: [1.0, 0.7, 0.25], busy: [1.0, 0.7, 0.25], locked: [1.0, 0.25, 0.2], broken: [1.0, 0.75, 0.45], vent: [1.0, 0.25, 0.18] }[look];
    const f = look === 'cycle' || look === 'busy' || look === 'vent' ? blink : look === 'broken' ? (Math.sin(t * 37) > 0.7 ? 1 : 0.1) : 1;
    lights.push({ x: c.x + c.w / 2, y: c.y + c.h / 2, z: 1.3, color: col, radius: 2.4, intensity: 0.75 * f * Math.max(0.25, k), shadow: false });
    const B = OL_BLOCK[h.side];
    for (const y of [(B.y + (SPINE_Y1)) / 2, (B.y + B.h + 23.2) / 2])
      lights.push({ x: B.x + B.w / 2, y, z: 1.6, color: LIGHT_TUNING.lamp.color, radius: 3.2, intensity: 0.45 * k, shadow: false });
  }
  return { areas, lights };
}
// The control panel's spot: on the inner door's north jamb, room side.
const airlockPanelAt = (h) => ({ x: h.side === 'port' ? h.inner.x + h.inner.w + 0.08 : h.inner.x - 0.08, y: h.chamber.y - 0.3 });   // (clear of the door frame's collar)
function drawAirlockSprites(t) {
  if (!GFX.ready('interior/hatch_port_frame') || !GFX.ready('interior/door_v_frame')) return false;
  const have = GFX.ready('interior/outerlock_port_floor_air') && GFX.ready('interior/outerlock_port_panel_air');
  for (const h of HATCHES) {
    const look = airlockLook(h), f8 = Math.floor(t * 8) % 8, c = h.chamber;
    // the chamber's floor plate with its light strips
    if (have) {
      const p = `interior/outerlock_${h.side}`, f2 = Math.floor(t * 8) % 2;
      const fl = look === 'cycle' || look === 'busy' ? `${p}_floor_${look}_f${f8}` : look === 'broken' ? `${p}_floor_broken_f${f2}` : `${p}_floor_${look === 'vent' ? 'vac' : look}`;
      GFX.sprite(fl, 0, c.x, c.y, 0, { layer: 'ground', emissive: 0.6 });
      const pn = look === 'cycle' || look === 'busy' || look === 'vent' ? `${p}_panel_${look}_f${f8}` : look === 'broken' ? `${p}_panel_broken_f${f2}` : `${p}_panel_${look}`;
      const P = airlockPanelAt(h);
      GFX.sprite(pn, 0, P.x, P.y, 0, { layer: 'wall', sortY: P.y + 0.3, emissive: 0.8 });
    }
    // the inner door: the doorways' door (frame + panels; a vent: the blast beacon turns)
    const ix = h.inner.x + h.inner.w / 2, k = Math.round(clamp(h.doors.inner, 0, 1) * 5);
    const frame = look === 'vent' ? `interior/door_v_frame_blast_f${Math.floor(t * 4) % 4}` : look === 'locked' || look === 'broken' ? 'interior/door_v_frame_locked' : 'interior/door_v_frame';
    const panels = look === 'locked' && k === 0 ? 'interior/door_v_locked_f0' : look === 'broken' && h.doors.inner > 0.5 && GFX.has('interior/door_v_forced') ? 'interior/door_v_forced' : `interior/door_v_f${k}`;
    GFX.sprite(frame, 0, ix, h.inner.y, 0, { layer: 'wall', sortY: h.y, emissive: 0.6, depthBias: PIECE_BIAS });
    GFX.sprite(panels, 0, ix, h.inner.y, 0, { layer: 'wall', sortY: h.y + 0.01, depthBias: PIECE_BIAS });
    // the outer door: the hatch in the hull wall
    const s = `interior/hatch_${h.side}`, x = h.x - h.dir * 0.3, y = h.y - 0.9, b = look === 'broken';
    const hf = b ? `${s}_frame_broken_f${Math.floor(t * 8) % 2}` : h.locked ? `${s}_frame_locked` : `${s}_frame`;
    const hp = b && h.doors.outer < 0.5 ? `${s}_broken` : h.locked && h.doors.outer < 0.05 ? `${s}_locked` : `${s}_f${Math.round(clamp(h.doors.outer, 0, 1) * 5)}`;
    GFX.sprite(hf, 0, x, y, 0, { layer: 'wall', sortY: h.y, emissive: 0.6, depthBias: PIECE_BIAS });
    GFX.sprite(hp, 0, x, y, 0, { layer: 'wall', sortY: h.y + 0.01, depthBias: PIECE_BIAS });
  }
  return true;
}
// Over the sprites (js/game.js render, in the 2D world layer): the pump's progress ring.
function drawAirlockRings() { for (const h of HATCHES) if (h.phase === 'cycling') airlockRing(h, h.t / LOCK_CYCLE); }
// The pump's progress: a ring over the chamber (UI, procedural in both views).
function airlockRing(h, k) {
  const c = h.chamber, x = (c.x + c.w / 2) * T, y = (c.y + c.h / 2) * T;
  ctx.beginPath(); ctx.arc(x, y, T * 0.32, -Math.PI / 2, -Math.PI / 2 + clamp(k, 0, 1) * TAU);
  ctx.strokeStyle = 'rgba(20,22,27,0.6)'; ctx.lineWidth = 7; ctx.stroke();
  ctx.strokeStyle = h.target === 'outer' ? '#ff9a6a' : '#9cd8ff'; ctx.lineWidth = 3.5; ctx.stroke();
}
// Classic view: the chamber (dashed hazard outline, a glow while it pumps), the two sliding doors, the lamps.
function drawAirlock2D(h, t) {
  const c = h.chamber, x = c.x * T, y = c.y * T, w = c.w * T, hh = c.h * T, look = airlockLook(h);
  ctx.save(); ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(210,166,46,0.75)'; ctx.lineWidth = 2;
  ctx.strokeRect(x + 6, y + 6, w - 12, hh - 12); ctx.restore();
  if (look === 'cycle' || look === 'vac' || look === 'vent') {
    ctx.fillStyle = look === 'cycle' ? `rgba(150,200,255,${0.12 + 0.1 * Math.sin(t * 18)})` : 'rgba(20,30,60,0.35)'; ctx.fillRect(x, y, w, hh);
  }
  const door = (r, open, vertical) => {               // two panels sliding apart (along y: they meet in the middle)
    const rx = r.x * T, ry = r.y * T, rw = r.w * T, rh = r.h * T, ph = (rh / 2) * (1 - open);
    ctx.fillStyle = '#14161b'; ctx.fillRect(rx, ry, rw, rh);
    if (ph < 0.5) return;
    for (const sd of [0, 1]) {
      const py = sd ? ry + rh - ph : ry;
      ctx.fillStyle = vertical ? '#6b7486' : '#7a8396'; ctx.fillRect(rx + 2, py, rw - 4, ph);
      ctx.fillStyle = C.hazard; ctx.fillRect(rx + 2, sd ? py : py + ph - 5, rw - 4, 5);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(rx + 2, py, rw - 4, ph);
    }
  };
  door(h.inner, h.doors.inner, false);
  door(h.outer, h.doors.outer, true);
  const P = airlockPanelAt(h), col = { air: '#5fd6a0', vac: '#e2574c', cycle: Math.sin(t * 14) > 0 ? '#ffd36a' : '#7a5a1a', busy: Math.sin(t * 14) > 0 ? '#ffd36a' : '#7a5a1a',
    locked: '#e2574c', broken: Math.sin(t * 30) > 0.6 ? '#ffd28a' : '#30343c', vent: Math.sin(t * 10) > 0 ? '#ff5a4a' : '#5a1a14' }[look];
  ctx.beginPath(); ctx.arc(P.x * T, (P.y - 0.05) * T, 6, 0, TAU); ctx.fillStyle = col; ctx.fill(); stroke(1.5);
  if (h.phase === 'cycling') airlockRing(h, h.t / LOCK_CYCLE);
}
