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
  if (e.kind === 'hatch') { e.ref.entryT = ENTRY_HATCH_OPEN; sfx.hatch(); combatBanner('The service hatch grinds open — quick, through!'); return; }
  e.ref.entry = 'open';
  if (e.kind === 'viewport') { sfx.clank(); combatBanner('The cracked viewport gives — climb in.'); return; }
  sfx.explosion(); sfx.whoosh?.();
  combatBanner(e.ship === 'raid' ? 'You smashed the raider\'s canopy — it vents into space!' : 'Canopy smashed — the pirate ship vents! Its crew get thrown about.');
  const aboard = (p) => e.ship === 'raid' ? (p.raid && inRect(p.x, p.y, raidGeom(e.ref).tube)) : (inDock(p.x, p.y) && !roomAt(p.x, p.y));
  for (const p of dk.pirates) if (!p.dead && aboard(p)) hurtPirate(p, 1, 2.5);
  for (let i = 0; i < 16; i++) combatFx(e.cx + (Math.random() - 0.5), e.face, (Math.random() - 0.5) * 3, e.out * (1 + Math.random() * 3), 0.7, '#dfe8f0', 0.15);
}
function updateDockEntries(dt) {
  for (const e of dockEntries()) if (e.kind === 'hatch' && e.ref.entryT > 0) {
    const inIt = crew.some(c => inRect(c.x, c.y, e.slot, CREW_R) || inRect(c.x, c.y, e.step, CREW_R));
    e.ref.entryT = inIt ? Math.max(e.ref.entryT - dt, 0.5) : e.ref.entryT - dt;
    if (e.ref.entryT <= 0) { e.ref.entryT = 0; sfx.hatch(); }
  }
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
    const text = e.kind === 'canopy' ? 'Click: smash the raider\'s canopy (manual override) — it vents the whole ship'
      : e.kind === 'viewport' ? 'Click: pry the cracked viewport open (manual override)'
      : eva ? 'Click: crank the base\'s service hatch open (three heaves) — it shuts again behind you' : 'Click: crank the service hatch open (out onto the hull)';
    act({ text, at, run: () => startOverride({ dockEntry: true }, label, () => openDockEntry(e)) });
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
      : e.kind === 'viewport' ? `dock/viewport_${e.side}_${open ? 'open' : 'shut'}` : `base/service_hatch_${e.side}_${open ? 'open' : 'shut'}`;
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
    rr(x - 4, y - 4, w + 8, hh + 8, 4); ctx.fillStyle = e.kind === 'hatch' ? '#4a4440' : '#5c626c'; ctx.fill(); stroke(2);
    if (open) { ctx.fillStyle = '#07080a'; ctx.fillRect(x, y, w, hh); }
    else if (e.kind === 'viewport') { ctx.fillStyle = '#6f8296'; ctx.fillRect(x, y, w, hh); ctx.strokeStyle = '#1a1c20'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x + 4, y + 3); ctx.lineTo(x + w - 6, y + hh - 2); ctx.moveTo(x + w - 4, y + 2); ctx.lineTo(x + 6, y + hh - 4); ctx.stroke(); }
    else { hazardStripe(x, y, w, hh); ctx.beginPath(); ctx.arc(x + w / 2, y + hh / 2, 7, 0, TAU); ctx.fillStyle = '#a83a3a'; ctx.fill(); stroke(1.5); }
    if (!open) jobMarker(e.cx, e.face + e.out * 0.4, t, false, '#9cd8ff');
  }
}
