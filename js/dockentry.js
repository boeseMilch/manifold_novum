// Ways into a ship docked to ours from a spacewalk (2026-10-23). A docked ship's tube covers our pod's hatch, so a
// spacewalker can't come back in at that airlock; with both airlocks taken (chapter 5: the base and the raider) they'd
// be stranded. The user: "Maybe make an airlock on most ships that dock? … Or some other way to enter through that ship
// so you can't get deadlocked if both airlocks are occupied." and "I.e. hit the windshield or something to get into
// the other ship." So every ship that docks has a way in from space, the kind that fits it, forced with the manual
// override (three good whacks / heaves) from outside:
//   the Red Comet raider (docked pirates, the brig barge, chapter 5's raider at our other airlock): SMASH ITS CANOPY
//     (the glass cockpit on the beak beside the tube). It stays smashed: the raider vents, its crew aboard get blown
//     about (a hit and stunned), and the tube is airless now, so our pod cycles like to space. Climb in through the
//     cockpit and drop into the tube.
//   the derelict lab (airless and dead already): PRY ITS CRACKED VIEWPORT (in the roof over its airlock room's north
//     wall). It stays open; nothing to vent.
//   the pirate base: CRANK ITS SERVICE HATCH (in the docking bay's low south wall: a cramped hand-cranked lock, so the
//     bay keeps its air): it lets you through and swings shut again after ENTRY_HATCH_OPEN s. From inside the bay the
//     same crank lets you out.
// In through the opening (pushing in at it, like at our own hatch: dockEntryThreshold), on your feet through that ship
// and its tube into our pod's open outer door. Cast off / detach with someone in the opening or the cockpit: cast
// adrift (js/dock.js undock, js/captain.js updateRaid). EVA reach counts the docked ship as hull (dockReachPolys), and
// a spacewalker can't float through the raider at our other airlock (dockBlocksEva).
// ---------------------------------------------------------------------------------------------------------------
const ENTRY_HATCH_OPEN = 4;              // s the base's service hatch stays open after cranking (held while someone's in it)
// Port layout, u relative to our hatch (out from it: u < 0), v: y - hatch y. face: the hull line you come in at; out:
// which way is outside (-1 north, +1 south); u0..u1: the opening; to: where it meets a floor inside (the tube, a room).
const DOCK_ENTRY_SPEC = {
  canopy: { name: 'canopy', what: 'the raider\'s canopy', u0: -4.65, u1: -3.35, face: -2.65, out: -1, to: -0.6 },
  viewport: { name: 'cracked viewport', what: 'the derelict\'s cracked viewport', u0: -8.6, u1: -7.2, face: -4.7, out: -1, to: -2.4 },
  hatch: { name: 'service hatch', what: 'the base\'s service hatch', u0: -9.6, u1: -8.2, face: 3.7, out: 1, to: 3.0 },
};
const entryKind = (d) => d.kind === 'base' ? 'hatch' : d.kind === 'derelict' ? 'viewport' : 'canopy';
// One entry: { kind, spec, side, ref (where its state lives: dk.dock or dk.raid), slot (walkable while open: the
// opening down to the floor inside), step (the lip just outside), cx, face (world y), out, half, inside, outside }.
function makeEntry(kind, side, ref, ship) {
  const S = DOCK_ENTRY_SPEC[kind], y = HATCHES.find(h => h.side === side).y, face = y + S.face;
  const slot = dockR(side, R(S.u0, y + Math.min(S.face, S.to), S.u1, y + Math.max(S.face, S.to)));
  const step = dockR(side, R(S.u0, S.out < 0 ? face - 0.45 : face, S.u1, S.out < 0 ? face : face + 0.45));
  const cx = dockX(side, (S.u0 + S.u1) / 2);
  return { kind, spec: S, side, ref, ship, slot, step, cx, face, out: S.out, half: (S.u1 - S.u0) / 2,
           inside: [cx, face - S.out * 0.7], outside: [cx, face + S.out * 1.1] };
}
function dockEntries() {
  const out = [];
  if (typeof dk === 'undefined') return out;
  if (dk.dock) out.push(makeEntry(entryKind(dk.dock), dk.dock.side, dk.dock, 'dock'));
  if (dk.raid?.state === 'docked') out.push(makeEntry('canopy', dk.raid.side, dk.raid, 'raid'));
  return out;
}
const entryOpen = (e) => e.ref.entry === 'open' || (e.kind === 'hatch' && e.ref.entryT > 0);
// Walkable while open (js/ship.js walkRects): the opening and the lip outside it.
function dockEntryRects() { return dockEntries().filter(entryOpen).flatMap(e => [e.slot, e.step]); }
const inDockEntry = (x, y, ship) => dockEntries().some(e => (!ship || e.ship === ship) && inRect(x, y, e.slot));
// The ship whose tube is airless now (its canopy smashed): js/airlock.js airlockTube.
const shipBreached = (ref) => !!ref && ref.entry === 'open' && ref.kind !== 'base' && ref.kind !== 'derelict';

// The docked ship as hull for the spacewalk's reach (js/ship.js evaReach): its rooms, as polygons.
function dockReachPolys() {
  const rects = [];
  if (typeof dk === 'undefined') return rects;
  if (dk.dock) { const g = DG(); rects.push(...g.rooms, ...g.doors); }
  if (dk.raid?.state === 'docked') { const g = raidGeom(dk.raid); rects.push(...g.rooms, ...g.doors); }
  return rects.map(q => [[q.x, q.y], [q.x + q.w, q.y], [q.x + q.w, q.y + q.h], [q.x, q.y + q.h]]);
}
// The raider at our other airlock: its rooms aren't walkable, and you can't float through it either.
const raidBlocksEva = (x, y) => !!dk.raid && dk.raid.state === 'docked' && (() => { const g = raidGeom(dk.raid); return [...g.rooms, ...g.doors].some(q => inRect(x, y, q, CREW_R)); })();

// Forced open (the override's last whack / heave).
function openDockEntry(e) {
  const burst = (n, col, sp, size, life) => { for (let i = 0; i < n; i++) combatFx(e.cx + (Math.random() - 0.5) * 1.2, e.face, (Math.random() - 0.5) * sp, e.out * (0.5 + Math.random()) * sp, life * (0.6 + 0.8 * Math.random()), col, size); };
  if (e.kind === 'hatch') {                         // the crank's last heave: the ratchet runs out, the lid swings up
    e.ref.entryT = ENTRY_HATCH_OPEN; sfx.ratchet(8); sfx.hatch(); combat.shake = Math.max(combat.shake, 0.12);
    combatBanner('The service hatch grinds open — through, quick: it swings shut again!'); return;
  }
  e.ref.entry = 'open';
  if (e.kind === 'viewport') {                      // the frozen glass gives under the bar
    sfx.shatter(); sfx.clank(); combat.shake = Math.max(combat.shake, 0.18); burst(14, '#b8c8d8', 2.2, 0.07, 2.2);
    combatBanner('The cracked viewport gives — climb in.'); return;
  }
  // the canopy: glass everywhere, the raider's air roaring out of the hole (ventT: the puff in updateDockEntries)
  sfx.shatter(); sfx.whoosh?.(); combat.shake = Math.max(combat.shake, 0.45); e.ref.ventT = 3;
  burst(26, '#cfe6ff', 3.5, 0.06, 3.0); burst(10, '#ffffff', 5, 0.04, 1.2);
  combatBanner(e.ship === 'raid' ? 'Canopy smashed — the raider vents!' : 'Canopy smashed — their ship vents!');
  const aboard = (p) => e.ship === 'raid' ? (p.raid && inRect(p.x, p.y, raidGeom(e.ref).tube)) : (inDock(p.x, p.y) && !roomAt(p.x, p.y));
  for (const p of dk.pirates) if (!p.dead && aboard(p)) hurtPirate(p, 1, 2.5);   // (stunned; then they carry on in their masks)
  if (e.ship === 'dock' && e.ref.brig && dk.npc && inDock(dk.npc.x, dk.npc.y) && !e.ref.brigNote) {
    e.ref.brigNote = true;
    combatBanner('Canopy smashed! Dr. Varga\'s cell is sealed: she\'s safe.');
  }
}
// Per tick: the base's hatch shutting again; the override at an entry (the crank turning, a crack / a ratchet per whack);
// the canopy's air puffing out for a few s after it's smashed.
function updateDockEntries(dt) {
  for (const e of dockEntries()) {
    e.ref.crankT = Math.max(0, (e.ref.crankT || 0) - dt);
    for (const c of crew) {
      const o = c.ui?.override;
      if (!o?.ref || o.ref.dockEntry !== e.ship) continue;
      if (e.kind === 'hatch') e.ref.crankT = 0.3;
      if ((o.seen || 0) < o.hits) {                 // a whack / heave just landed
        o.seen = o.hits;
        if (e.kind === 'hatch') sfx.ratchet(3);
        else { sfx.crack(); for (let i = 0; i < 5; i++) combatFx(e.cx + (Math.random() - 0.5) * 0.8, e.face + e.out * 0.1, (Math.random() - 0.5) * 2, e.out * Math.random() * 2, 0.5, '#e8f0f8', 0.05); }
      }
    }
    if (e.ref.ventT > 0) {
      e.ref.ventT -= dt;
      const k = Math.max(0, e.ref.ventT / 3);
      if (Math.random() < dt * 40 * k) combatFx(e.cx + (Math.random() - 0.5) * 1.6, e.face + e.out * 0.2, (Math.random() - 0.5) * 2.5, e.out * (2 + Math.random() * 3) * (0.4 + k), 0.9, 'rgba(222,232,245,0.55)', 0.06 + 0.06 * k);
    }
    if (e.kind === 'hatch' && e.ref.entryT > 0) {
      const inIt = crew.some(c => inRect(c.x, c.y, e.slot, CREW_R) || inRect(c.x, c.y, e.step, CREW_R));
      e.ref.entryT = inIt ? Math.max(e.ref.entryT - dt, 0.5) : e.ref.entryT - dt;
      if (e.ref.entryT <= 0) { e.ref.entryT = 0; sfx.hatch(); sfx.ratchet(4); }
    }
  }
}
// Is this crew member at an entry (in it, on its lip, or right outside it)? Their sprite is drawn in front of the ship
// there, so the beak / the hull roof never hides them (js/sprites.js drawCrewSprite).
function dockEntryReveal(c) {
  if (c.mode !== 'inside' && c.mode !== 'eva') return false;
  return dockEntries().some(e => inRect(c.x, c.y, e.slot, 0.2) || inRect(c.x, c.y, e.step, 0.2) ||
    (c.mode === 'eva' && Math.abs(c.x - e.cx) < e.half + 0.8 && (c.y - e.face) * e.out > -0.3 && (c.y - e.face) * e.out < 1.8));
}

// Spacewalk ⇄ on your feet at an open entry (like our hatch: js/airlock.js airlockThreshold). Out: stepping past its
// face; in: floating at it and pushing in.
function dockEntryThreshold(c, tx, ty) {
  if (typeof netLive !== 'undefined' && netLive) return;
  for (const e of dockEntries()) {
    if (!entryOpen(e)) continue;
    const a = (c.y - e.face) * -e.out, dx = Math.abs(c.x - e.cx);
    if (c.mode === 'inside' && a < -AIRLOCK_STEP_OUT && dx < e.half) { c.mode = 'eva'; c.y = e.face + e.out * 0.5; return; }
    if (c.mode === 'eva' && a > -0.6 && dx < e.half - CREW_R - 0.02 && (-e.out * (ty || 0) > 0.3 || -e.out * c.vy > 0.3)) {
      c.mode = 'inside'; c.y = e.face - e.out * 0.05; return;
    }
  }
}

// What you can do there (js/game.js updatePlayer: on a spacewalk, and inside for the base's hatch). True if it prompted.
function dockEntryAct() {
  const p = player, eva = p.mode === 'eva';
  for (const e of dockEntries()) {
    const at = { x: e.cx, y: e.face, r: 1.0 };
    const near = eva ? Math.hypot(p.x - e.outside[0], p.y - e.outside[1]) < 1.5 : e.kind === 'hatch' && Math.hypot(p.x - e.inside[0], p.y - e.inside[1]) < 1.1;
    if (!near) continue;
    if (entryOpen(e)) { act({ text: e.kind === 'hatch' ? 'Service hatch open — through, quick!' : `Climb in through ${e.spec.what}`, at, quiet: true }); return true; }
    const label = e.kind === 'canopy' ? 'Raider canopy' : e.kind === 'viewport' ? 'Cracked viewport' : 'Service hatch';
    const text = e.kind === 'canopy' ? 'Click / E: smash the canopy (vents their ship)'
      : e.kind === 'viewport' ? 'Click / E: pry the cracked viewport open'
      : eva ? 'Click / E: crank the service hatch open (it shuts behind you)' : 'Click / E: crank the service hatch open (out onto the hull)';
    act({ text, at, run: () => startOverride({ dockEntry: e.ship }, label, () => openDockEntry(e)) });
    return true;
  }
  return false;
}
// A spacewalker at one of our pods with a ship docked to it: where to get in instead (js/airlock.js airlockAct).
function dockEntryHint(h) {
  const e = dockEntries().find(e => e.side === h.side);
  if (!e) return null;
  const other = HATCHES.find(q => q !== h), otherFree = !dockEntries().some(q => q.side === other.side);
  return `A ship is docked here — get in through ${e.spec.what}${otherFree ? ' or the other airlock' : ''}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing: sprites (tools/blender/models/dock/entries.py, drawn over the ship at our hatch like the ship), or 2D.
// ---------------------------------------------------------------------------------------------------------------
function drawDockEntries(t) {
  for (const e of dockEntries()) {
    const h = HATCHES.find(q => q.side === e.side), open = entryOpen(e);
    const name = e.kind === 'canopy' ? (open ? `dock/canopy_smashed_${e.side}` : null)
      : e.kind === 'viewport' ? `dock/viewport_${e.side}_${open ? 'open' : 'shut'}`
      : open ? `base/service_hatch_${e.side}_open` : e.ref.crankT > 0 ? `base/service_hatch_${e.side}_crank_f${Math.floor(t * 10) % 4}` : `base/service_hatch_${e.side}_shut`;
    if (GFX.on && (!name || GFX.ready(name))) {
      if (name) GFX.sprite(name, 0, h.x, h.y, 0, { layer: 'wall', sortY: e.face + (e.out > 0 ? 0.2 : 0.9), emissive: 0.3, depthBias: 0.5 });
      if (!open) jobMarker(e.cx, e.face + e.out * 0.4, t, crew.some(c => c.mode === 'eva' && Math.hypot(c.x - e.outside[0], c.y - e.outside[1]) < 3), '#9cd8ff');
      continue;
    }
    if (GFX.on && name) GFX.preload([name.split('/')[0]]);
    // 2D: the opening's frame on the hull; shut: glass / a lid; open: a dark hole (and glass bits round a smashed canopy)
    const r = e.slot, x = L(r.x), y = L(e.out < 0 ? e.face : e.face - 0.7), w = L(r.w), hh = L(0.7);
    if (e.kind === 'canopy') {                      // the raider's glass canopy on the beak (ships.py canopy(): 1.15 x 0.75 at v -1.9)
      const H0 = HATCHES.find(q => q.side === e.side), X = L(e.cx), Y = L(H0.y - 1.9);
      ctx.beginPath(); ctx.ellipse(X, Y, L(1.24), L(0.83), 0, 0, TAU); ctx.fillStyle = '#2b2f36'; ctx.fill(); stroke(2);
      ctx.beginPath(); ctx.ellipse(X, Y, L(1.15), L(0.75), 0, 0, TAU); ctx.fillStyle = open ? '#07080a' : '#3a4654'; ctx.fill();
      if (!open) { ctx.beginPath(); ctx.ellipse(X + L(0.4), Y - L(0.3), L(0.35), L(0.08), -0.35, 0, TAU); ctx.fillStyle = 'rgba(220,235,255,0.5)'; ctx.fill(); jobMarker(e.cx, e.face + e.out * 0.4, t, false, '#9cd8ff'); }
      else { ctx.strokeStyle = 'rgba(200,220,240,0.85)'; ctx.lineWidth = 2; for (let i = 0; i < 14; i++) { const a = i / 14 * TAU; ctx.beginPath(); ctx.moveTo(X + Math.cos(a) * L(1.15), Y + Math.sin(a) * L(0.75)); ctx.lineTo(X + Math.cos(a + 0.1) * L(0.85), Y + Math.sin(a + 0.1) * L(0.5)); ctx.stroke(); } }
      continue;
    }
    if (e.kind === 'viewport') {                    // the derelict's roof viewport: a rounded white frame with a teal band
      const vx = L(r.x), vy = L(r.y), vw = L(r.w), vh = L(r.h);
      rr(vx - 7, vy - 2, vw + 14, vh + 6, 12); ctx.fillStyle = '#d8d6cc'; ctx.fill(); stroke(2);
      ctx.fillStyle = '#3b7a8a'; ctx.fillRect(vx - 4, vy + vh + 1, vw + 8, 3);
      rr(vx + 3, vy + 9, vw - 6, vh - 12, 8); ctx.fillStyle = open ? '#07080a' : '#6f8296'; ctx.fill(); stroke(1.5);
      const cxp = vx + vw / 2 + 5, cyp = vy + vh / 2 - 6;
      if (!open) {                                   // crazed: spokes from the impact and rings of cross cracks
        ctx.strokeStyle = 'rgba(235,242,250,0.9)'; ctx.lineWidth = 1.1; ctx.beginPath();
        for (let i = 0; i < 11; i++) { const a = i / 11 * TAU + 0.2, Lr = (0.55 + 0.4 * ((i * 37) % 10) / 10) * vw * 0.55; ctx.moveTo(cxp, cyp); ctx.lineTo(cxp + Math.cos(a) * Lr, cyp + Math.sin(a) * Lr * 1.2);
          for (const k of [0.3, 0.6]) { const b = a + 0.45; ctx.moveTo(cxp + Math.cos(a) * Lr * k, cyp + Math.sin(a) * Lr * k * 1.2); ctx.lineTo(cxp + Math.cos(b) * Lr * k * 1.05, cyp + Math.sin(b) * Lr * k * 1.25); } }
        ctx.stroke();
      } else {                                       // pried: glass teeth round the frame, the outer edge bent up
        ctx.fillStyle = 'rgba(190,210,230,0.9)';
        for (let i = 0; i < 6; i++) { const tx = vx + 6 + i * (vw - 12) / 5; ctx.beginPath(); ctx.moveTo(tx - 4, vy + 9); ctx.lineTo(tx + 4, vy + 9); ctx.lineTo(tx, vy + 16); ctx.fill(); ctx.beginPath(); ctx.moveTo(tx - 4, vy + vh - 3); ctx.lineTo(tx + 4, vy + vh - 3); ctx.lineTo(tx, vy + vh - 10); ctx.fill(); }
        ctx.fillStyle = '#a3abb8'; ctx.fillRect(vx - 7, vy - 7, vw + 14, 6); ctx.strokeStyle = '#1a1c20'; ctx.lineWidth = 1.5; ctx.strokeRect(vx - 7, vy - 7, vw + 14, 6);
      }
    } else {                                         // the base's service hatch in the bay's low south wall
      const hx = L(r.x), hy = L(r.y), hw = L(r.w), hh2 = L(r.h);
      rr(hx - 7, hy - 2, hw + 14, hh2 + 4, 4); ctx.fillStyle = '#4a4440'; ctx.fill(); stroke(2);
      hazardStripe(hx - 6, hy + hh2 - 6, hw + 12, 6);
      if (open) { ctx.fillStyle = '#07080a'; ctx.fillRect(hx + 2, hy + 2, hw - 4, hh2 - 10); ctx.fillStyle = '#6a6458'; ctx.fillRect(hx + 2, hy - 8, hw - 4, 8); stroke(1.5); }
      else {
        rr(hx + 2, hy + 2, hw - 4, hh2 - 10, 3); ctx.fillStyle = '#6a6458'; ctx.fill(); stroke(1.5);
        const wx = hx + hw / 2, wy = hy + (hh2 - 8) / 2 + 2, a0 = e.ref.crankT > 0 ? t * 8 : 0, rW = 9;
        ctx.strokeStyle = '#a83a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(wx, wy, rW, 0, TAU); ctx.stroke();
        ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k < 4; k++) { const a = a0 + k * Math.PI / 2; ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a) * rW, wy + Math.sin(a) * rW); } ctx.stroke();
        ctx.beginPath(); ctx.arc(wx + Math.cos(a0) * rW, wy + Math.sin(a0) * rW, 2.5, 0, TAU); ctx.fillStyle = '#a3abb8'; ctx.fill();
      }
    }
    if (!open) jobMarker(e.cx, e.face + e.out * 0.4, t, false, '#9cd8ff');
  }
}
