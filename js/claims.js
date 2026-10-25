// Claims: "this one's mine". A player clicks an encounter plate in the left sidebar (js/sidebar.js) to take that
// problem on: the plate grows a little flag in their suit colour (everyone sees it), and they alone get big guide
// arrows: along the walking route, at the target, with a short "what to do" next to it (drawClaimGuide; the
// ⇢ button next to mute turns them off for this browser). Clicking your own plate again lets go of it; clicking
// someone else's takes it over (the last click wins: simple and predictable, and nobody can hog a fire).
//
// Everything lives in the simulation (solo: this page; multiplayer: the server) and is synced in the snapshot
// (js/net.js, `tasks`): browsers only read crewTasks and send ['claim', key] (runCommand → claimCommand).
//
//   crewTasks.claims  { [plateKey]: crewId }      who took on which plate
//   crewTasks.custom  [ customPlate ]             task plates that aren't encounters (the multiplayer tutorial's)
//
// Plate keys are the sidebar's (encounterPlates): 'fire' + uid, 'enemy' + uid, 'inv' + uid, 'breach' + room id,
// 'broken', 'jump', 'swarm', ... The uids are set by the simulation when the thing is made (newUid) and travel
// in the snapshot, so a key is the same on the server and in every browser.
// A claim ends on its own when its plate is gone for CLAIM_GRACE s (the fire is out, the enemy dead), when the
// claimant leaves the game, and with a new mission.
//
// API (simulation code; in multiplayer it only does something on the server):
//   claimEncounter(key, crewId) → true if claimed (crewId must be on the crew); takes it over from anyone else
//   releaseEncounter(key)                  nobody's
//   claimOf(key) → crewId | null           claimsOf(crewId) → [key, ...]
//   toggleClaim(key, crewId)               what a click does: mine → released, else → mine
//   addTaskPlate({ key, title, sub, icon, stripe, red, targets, hint, owner, done }) → key
//       A plate of its own in the sidebar (under the objective), claimable like any other.
//       targets: [{ x, y, hint? }] in ship units (the arrows go to the one nearest the claimant; inside the ship
//                they follow the walking route, outside it via the nearest airlock); hint: the default "what to do".
//       owner:   crew id to give it to right away (or null: up for grabs).
//       done:    () => bool, checked every tick in the simulation (not synced): true removes the plate. Without
//                one the plate stays until removeTaskPlate(key).
//       icon / stripe: as the sidebar's (plateIcon kinds: 'fire', 'wrench', 'jump', 'ping', ...; a CSS colour).
//   updateTaskPlate(key, changes)          new title / sub / targets / hint / done (owner: use claimEncounter)
//   removeTaskPlate(key)                   gone, and its claim with it
//   taskPlate(key) → the plate | null
//   Example: addTaskPlate({ key: 'tut-fuel', title: 'FUEL CELL', sub: 'load one into the reactor', icon: 'jump',
//              targets: [{ x: REACTOR.x, y: REACTOR.y + 1.7, hint: 'Click the reactor with a fuel cell' }], owner: 2,
//              done: () => power.reactor.fuel > 0 });

const CLAIM_GRACE = 0.5, CLAIM_SCAN = 0.25;          // s a plate may be missing before its claim ends; s between checks
const crewTasks = { claims: {}, custom: [] };
const taskDone = new Map();                          // key → done() (simulation side only)
const claimAbsent = new Map();                       // key → s its plate has been missing
let claimScanT = 0;

function resetCrewTasks() { crewTasks.claims = {}; crewTasks.custom = []; taskDone.clear(); claimAbsent.clear(); claimScanT = 0; }
function claimEncounter(key, crewId) {
  if (key == null || !crew.some(c => c.id === crewId)) return false;
  crewTasks.claims[String(key)] = crewId; claimAbsent.delete(String(key));
  return true;
}
function releaseEncounter(key) { delete crewTasks.claims[key]; claimAbsent.delete(key); }
const claimOf = (key) => crewTasks.claims[key] ?? null;
const claimsOf = (crewId) => Object.keys(crewTasks.claims).filter(k => crewTasks.claims[k] === crewId);
function toggleClaim(key, crewId) { if (claimOf(key) === crewId) { releaseEncounter(key); return false; } return claimEncounter(key, crewId); }
function releaseCrewClaims(crewId) { for (const k of claimsOf(crewId)) releaseEncounter(k); }

// Custom task plates: plain data only (it's in the snapshot); done() stays here.
const TASK_FIELDS = ['title', 'sub', 'icon', 'stripe', 'red', 'hint'];
function taskTargets(list) { return (list || []).filter(t => t && Number.isFinite(t.x) && Number.isFinite(t.y)).map(t => ({ x: t.x, y: t.y, ...(t.hint ? { hint: String(t.hint) } : {}) })); }
function addTaskPlate(spec) {
  const key = String(spec.key);
  const p = { key, title: String(spec.title || 'TASK'), sub: String(spec.sub || ''), icon: spec.icon || 'ping', stripe: spec.stripe || '#ffe08a', red: !!spec.red,
              hint: spec.hint ? String(spec.hint) : '', targets: taskTargets(spec.targets) };
  crewTasks.custom = crewTasks.custom.filter(q => q.key !== key).concat(p);
  if (typeof spec.done === 'function') taskDone.set(key, spec.done); else taskDone.delete(key);
  if (spec.owner != null) claimEncounter(key, spec.owner);
  return key;
}
function updateTaskPlate(key, ch) {
  const p = taskPlate(key);
  if (!p) return false;
  for (const f of TASK_FIELDS) if (ch[f] !== undefined) p[f] = f === 'red' ? !!ch[f] : String(ch[f]);
  if (ch.targets) p.targets = taskTargets(ch.targets);
  if (typeof ch.done === 'function') taskDone.set(key, ch.done);
  return true;
}
function removeTaskPlate(key) { crewTasks.custom = crewTasks.custom.filter(q => q.key !== key); taskDone.delete(key); releaseEncounter(key); }
const taskPlate = (key) => crewTasks.custom.find(q => q.key === key) || null;

// Every plate key there is right now (the sidebar's list, custom plates included). null if it can't tell.
function liveTaskKeys() {
  try { return new Set(encounterPlates().map(p => p.key)); } catch (e) { return null; }
}
// A browser's click on a plate (['claim', key], run as that crew member): only plates that are there.
function claimCommand(key) {
  if (typeof key !== 'string' || key.length > 120) return;
  const live = liveTaskKeys();
  if (live && !live.has(key)) return;
  toggleClaim(key, player.id);
}

// Simulation tick: finished custom tasks go; claims of crew who left, and of plates that are gone, end.
function updateCrewTasks(dt) {
  for (const [key, done] of taskDone) { let d = false; try { d = done(); } catch (e) { /* a broken check keeps the plate */ } if (d) removeTaskPlate(key); }
  for (const k of Object.keys(crewTasks.claims)) if (!crew.some(c => c.id === crewTasks.claims[k])) releaseEncounter(k);
  if ((claimScanT += dt) < CLAIM_SCAN) return;
  const step = claimScanT; claimScanT = 0;
  const keys = Object.keys(crewTasks.claims);
  if (!keys.length) return;
  const live = liveTaskKeys();
  if (!live) return;
  for (const k of keys) {
    if (live.has(k)) { claimAbsent.delete(k); continue; }
    const t = (claimAbsent.get(k) || 0) + step;
    if (t >= CLAIM_GRACE) releaseEncounter(k); else claimAbsent.set(k, t);
  }
}

// ---------------------------------------------------------------------------
// Browser side: the guide arrows for your own claims, and their on / off button (HUD, next to mute)
// ---------------------------------------------------------------------------
let guideArrows = true;
try { guideArrows = localStorage.getItem('mn-guide-arrows') !== '0'; } catch (e) { /* no storage */ }
function setGuideArrows(on) { guideArrows = !!on; try { localStorage.setItem('mn-guide-arrows', on ? '1' : '0'); } catch (e) { /* no storage */ } }
const GUIDE_BTN = { x: 38, y: 6, w: 26, h: 24 };
const inGuideBtn = (x, y) => x >= GUIDE_BTN.x && x <= GUIDE_BTN.x + GUIDE_BTN.w && y >= GUIDE_BTN.y && y <= GUIDE_BTN.y + GUIDE_BTN.h;
function drawGuideButton() {
  const { x, y, w, h } = GUIDE_BTN, hover = inGuideBtn(mouse.x, mouse.y), col = guideArrows ? (me?.color || '#ffe08a') : '#6b7486';
  rr(x, y, w, h, 5); ctx.fillStyle = hover ? '#2f3542' : '#1c2028'; ctx.fill(); stroke(1.2, '#4b5263');
  const cx = x + w / 2, cy = y + h / 2;
  poly([[cx - 8, cy - 2.5], [cx + 1, cy - 2.5], [cx + 1, cy - 7], [cx + 9, cy], [cx + 1, cy + 7], [cx + 1, cy + 2.5], [cx - 8, cy + 2.5]]);
  ctx.fillStyle = col; ctx.fill(); stroke(1, 'rgba(10,12,18,0.9)');
  if (!guideArrows) { ctx.strokeStyle = '#e2574c'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x + 5, y + h - 5); ctx.lineTo(x + w - 5, y + 5); ctx.stroke(); }
  if (hover) {                                       // what it is
    const t = `Guide arrows for the jobs you claim: ${guideArrows ? 'ON' : 'OFF'} (click)`;
    ctx.font = '600 13px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const tw = ctx.measureText(t).width + 16;
    rr(x, y + h + 6, tw, 24, 6); ctx.fillStyle = 'rgba(12,14,20,0.92)'; ctx.fill(); stroke(1.5, '#4b5263');
    ctx.fillStyle = '#ffffff'; ctx.fillText(t, x + 8, y + h + 18);
  }
}

// Where the claimant should go next for a plate, and what to do there: { x, y, hint } (ship units) or null.
// Step by step: no tool yet → the tool first; the target outside and you inside → the nearest airlock first.
const nearestTo = (c, list) => list.slice().sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0] || null;
function fetchStep(c, kind, what) {                  // the nearest such item, or whoever carries it
  const holder = crew.find(o => o !== c && (o.inv.weapon === kind || o.inv.item === kind));
  const it = nearestTo(c, ITEMS.filter(i => i.kind === kind));
  if (it) return { x: it.x, y: it.y, hint: `Grab the ${what} (click it)` };
  if (holder) return { x: holder.x, y: holder.y, hint: `${holder.name} has the ${what}` };
  return null;
}
const kitFirst = (c, step) => c.inv.weapon === 'repair' ? step : fetchStep(c, 'repair', 'repair kit') || step;
function gunStep(c, side, aim, hint) {               // man the cannon on that side, then aim at it
  const g = GUNS.find(g => g.id === side) || GUNS.find(g => g.id === 'front');
  if (!g) return null;
  if (c.mode === 'gun' && c.gun === g) return aim ? { x: aim.x, y: aim.y, hint } : null;
  return { x: g.hatch[0], y: g.hatch[1], hint: `Man the ${g.name.toLowerCase()} (click the ladder)` };
}
function claimStep(key, c) {
  const n = (p) => key.startsWith(p) ? key.slice(p.length) : null;
  const custom = taskPlate(key);
  if (custom) { const t = nearestTo(c, custom.targets); return t ? { x: t.x, y: t.y, hint: t.hint || custom.hint || custom.sub } : null; }
  let id;
  if ((id = n('fire')) !== null) {
    const f = fires.find(f => String(f.uid) === id);
    if (!f) return null;
    if (f.plasma) return { x: f.x, y: f.y, hint: 'Plasma fire: vent the room at the airlock panel' };
    return c.inv.weapon === 'extinguisher' ? { x: f.x, y: f.y, hint: 'Spray it: hold right click / Space towards it' } : fetchStep(c, 'extinguisher', 'fire extinguisher') || { x: f.x, y: f.y, hint: 'Put it out' };
  }
  if (key === 'broken') {
    const s = nearestTo(c, SYSTEMS.filter(s => s.broken));
    if (!s) return null;
    if (burning(s)) return { x: s.x, y: s.y, hint: 'Put the fire out first' };
    return kitFirst(c, { x: s.x, y: s.y, hint: `Repair the ${s.name.toLowerCase()}: hold right click / Space` });
  }
  if ((id = n('failing')) !== null) { const s = serviceTargets().find(s => s.name === id); return s && kitFirst(c, { x: s.x, y: s.y, hint: 'Fix it before it breaks: hold right click / Space' }); }
  if ((id = n('breach')) !== null) {
    const b = hz.breaches.find(b => b.room === id), p = BREACH_SPOTS[id];
    if (!b || !p) return null;
    if (!b.plated && !b.tarp && c.inv.item !== 'plate') { const cr = nearestTo(c, PLATE_CRATES); return { x: cr.x, y: cr.y, hint: 'Take a hull plate from the crate' }; }
    return kitFirst(c, { x: p.x, y: p.y, hint: b.plated ? 'Nail the plate down (repair kit)' : 'Hold the plate over the hole (click)' });
  }
  if ((id = n('surge')) !== null) { const l = LINE[id]; if (!l) return null; const [x, y] = linePoint(l, 0.5); return kitFirst(c, { x, y, hint: 'Splice the arcing line (repair kit)' }); }
  if ((id = n('grav')) !== null) { const r = roomById(id); if (!r) return null; const [x, y] = roomCenter(r); return kitFirst(c, { x, y, hint: 'Reset the floor breaker (repair kit)' }); }
  if ((id = n('inv')) !== null) {
    const a = boarding.invaders.find(a => String(a.uid) === id);
    if (!a) return null;
    if (!['laser', 'heavy'].includes(c.inv.weapon)) { const g = fetchStep(c, 'laser', 'laser gun'); if (g) return g; }
    return { x: a.x, y: a.y, hint: a.kind === 'saboteur' ? 'Shoot the saboteur before it wrecks something' : 'Shoot it: hold right click / Space' };
  }
  if ((id = n('enemy') ?? n('dockT') ?? n('tent')) !== null) {
    const e = combat.enemies.find(e => String(e.uid) === id);
    return e ? gunStep(c, e.side, e, key.startsWith('tent') ? 'Shoot the tentacle' : 'Shoot its weak spots') : null;
  }
  if (key === 'swarm') { const a = nearestTo(c, combat.asteroids); return gunStep(c, a?.side || 'front', a, 'Shoot the rocks before they hit'); }
  if (key === 'jump' && mission.jump) {
    if (mission.rules?.handle && (mission.jump.pull || 0) < JUMP_PULL) { const h = STATIONS.find(s => s.name === 'Helm'); return { x: h.x, y: h.y + 0.6, hint: 'Pull the jump handle at the helm (hold)' }; }
    const cap = CAPACITORS[1];
    if (broken(cap)) return kitFirst(c, { x: cap.x, y: cap.y, hint: 'Repair the middle capacitor' });
    if (cap.charge <= 0) return { x: LEVER.x, y: LEVER.y, hint: power.lever.pos === 1 ? 'Lever on MID: wait for 1 energy' : 'Turn the power lever to MID' };
    return null;
  }
  // anything else with a place in the ship (js/sidebar.js problemSpots)
  const s = typeof problemSpots === 'function' && problemSpots().find(s => s.key === key);
  if (s) return { x: s.x, y: s.y, hint: s.what.charAt(0) + s.what.slice(1).toLowerCase() };
  return null;
}
// With the way out / in: a target outside while you're inside → the nearest outer airlock; the other way round, back in.
const outsideShip = (x, y) => !pointInPoly(x, y) && !(typeof inDock === 'function' && inDock(x, y));
function claimTarget(key, c = me) {
  const s = claimStep(key, c);
  if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
  if (c.mode === 'inside' && outsideShip(s.x, s.y)) {
    const h = nearestTo(c, HATCHES.map(h => ({ x: h.inside[0], y: h.inside[1], h })));
    return { x: h.x, y: h.y, hint: `Out through the ${SIDE_LABEL[h.h.side].toLowerCase()} airlock, then: ${s.hint}`, via: true };
  }
  if (c.mode === 'eva' && !outsideShip(s.x, s.y) && !(typeof inDock === 'function' && inDock(s.x, s.y))) {
    const h = nearestTo(c, HATCHES.map(h => ({ x: h.outside[0], y: h.outside[1], h })));
    return { x: h.x, y: h.y, hint: `Back in through the ${SIDE_LABEL[h.h.side].toLowerCase()} airlock, then: ${s.hint}`, via: true };
  }
  return s;
}

// The walking route there (inside our ship: the nav graph of js/invader.js, shortcut where you can see through).
// Remembered for a moment (lineOfSight is not free).
const guideRouteCache = { t: -1, key: '', pts: null };
function guideRoute(c, tx, ty) {
  if (c.mode !== 'inside' || !pointInPoly(c.x, c.y) || !pointInPoly(tx, ty)) return null;
  const key = `${tx.toFixed(1)},${ty.toFixed(1)}`;
  if (guideRouteCache.key === key && time - guideRouteCache.t < 0.3 && guideRouteCache.pts) { guideRouteCache.pts[0] = [c.x, c.y]; return guideRouteCache.pts; }
  let pts = [[c.x, c.y]];
  if (!lineOfSight(c.x, c.y, tx, ty)) for (const i of navPath(nearestNavSeen(c.x, c.y), nearestNav(tx, ty))) pts.push([NAV.nodes[i].x, NAV.nodes[i].y]);
  pts.push([tx, ty]);
  for (let i = 1; i < pts.length - 1;) {             // drop the corners you can walk past in a straight line
    if (lineOfSight(pts[i - 1][0], pts[i - 1][1], pts[i + 1][0], pts[i + 1][1])) pts.splice(i, 1); else i++;
  }
  Object.assign(guideRouteCache, { t: time, key, pts });
  return pts;
}

// Draw (screen space, after the problem markers): for each plate you claimed, chevrons along the route, a big
// bouncing arrow over the target with what to do there; an arrow at the screen's edge if it's off-screen.
function drawClaimGuide(view) {
  if (!guideArrows || !me || !mission.active || mission.over) return;
  const mine = claimsOf(me.id);
  if (!mine.length) return;
  const col = me.color || '#ffe08a', z = view.zoom || 1;
  const toS = (x, y) => [view.ox + x * T * z, view.oy + y * T * z * view.sy];
  const box = { x0: SIDEBAR_X + PLATE_W + 50, y0: HUD_H + 60, x1: VW - 24, y1: (typeof invSlots === 'function' ? invSlots()[0].y : VH) - 16 };
  const placed = [];
  ctx.save();
  for (const key of mine.slice(0, 3)) {
    const t = claimTarget(key, me);
    if (!t) continue;
    const [sx, sy] = toS(t.x, t.y);
    // the route: chevrons marching towards the target
    const route = guideRoute(me, t.x, t.y);
    if (route && route.length > 1) {
      const S = route.map(p => toS(p[0], p[1])), gap = Math.max(26, 0.9 * T * z), size = Math.max(7, 0.2 * T * z);
      let along = (time * 40) % gap, total = 0;
      for (let i = 1; i < S.length; i++) {
        const [ax, ay] = S[i - 1], [bx, by] = S[i], L = Math.hypot(bx - ax, by - ay), a = Math.atan2(by - ay, bx - ax);
        for (let d = along; d < L; d += gap) {
          const left = total + d, fade = clamp(left / 40, 0, 1);   // (not right under your feet)
          ctx.save(); ctx.translate(ax + Math.cos(a) * d, ay + Math.sin(a) * d); ctx.rotate(a); ctx.globalAlpha = 0.85 * fade;
          poly([[size, 0], [-size * 0.6, -size], [-size * 0.1, 0], [-size * 0.6, size]]); ctx.fillStyle = col; ctx.fill(); stroke(1.5, 'rgba(10,12,18,0.85)');
          ctx.restore();
        }
        along = ((along - L) % gap + gap) % gap; total += L;
      }
    }
    const on = sx > 20 && sx < VW - 20 && sy > HUD_H + 16 && sy < box.y1 + 10   // (on screen and not under the left-hand panels)
      && !leftPanelRects(HUD_H).some(r => sx > r.x - 10 && sx < r.x + r.w + 10 && sy > r.y - 10 && sy < r.y + r.h + 10);
    ctx.font = '700 15px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const tw = Math.min(ctx.measureText(t.hint).width, VW * 0.5), w = tw + 28, h = 32;
    const text = tw < ctx.measureText(t.hint).width ? plateLines(t.hint, tw, false)[0] : t.hint;
    if (on) {                                        // over the target: a big arrow bouncing down at it, the hint above
      const up = sy - 22 - 50 - h < HUD_H, f = up ? -1 : 1;   // (too close to the top: from below, pointing up)
      const bob = Math.abs(Math.sin(time * 4)) * 10, ay = sy - f * (22 + bob);
      ctx.save(); ctx.translate(sx, ay); ctx.scale(1, f); ctx.globalAlpha = 0.95;
      poly([[0, 0], [-17, -20], [-7, -20], [-7, -40], [7, -40], [7, -20], [17, -20]]); ctx.fillStyle = col; ctx.fill(); stroke(2.5, 'rgba(10,12,18,0.9)');
      ctx.restore();
      ctx.beginPath(); ctx.arc(sx, sy, 18 + 4 * Math.sin(time * 5), 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
      let px = clamp(sx, w / 2 + 12, VW - w / 2 - 12), py = clamp(ay - f * (40 + h / 2 + 6), HUD_H + h / 2 + 8, VH - h / 2 - 8);
      for (const q of placed) if (Math.abs(q.x - px) < (q.w + w) / 2 && Math.abs(q.y - py) < h + 4) py = q.y - h - 6;
      placed.push({ x: px, y: py, w });
      rr(px - w / 2, py - h / 2, w, h, 8); ctx.fillStyle = 'rgba(12,14,20,0.92)'; ctx.fill(); stroke(2.5, col);
      ctx.fillStyle = '#ffffff'; ctx.fillText(text, px, py + 0.5);
    } else {                                         // off-screen: a big arrow at the edge, pointing to it, with the hint
      const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, dx = sx - cx, dy = sy - cy, a = Math.atan2(dy, dx);
      const kx = dx ? (dx > 0 ? box.x1 - cx : box.x0 - cx) / dx : Infinity, ky = dy ? (dy > 0 ? box.y1 - cy : box.y0 - cy) / dy : Infinity, k = Math.min(kx, ky);
      const ex = cx + dx * k, ey = cy + dy * k, pulse = 0.8 + 0.2 * Math.sin(time * 5);
      ctx.save(); ctx.translate(ex, ey); ctx.rotate(a); ctx.globalAlpha = pulse;
      poly([[24, 0], [-6, -22], [-6, -9], [-26, -9], [-26, 9], [-6, 9], [-6, 22]]); ctx.fillStyle = col; ctx.fill(); stroke(2.5, 'rgba(10,12,18,0.9)');
      ctx.restore();
      let px = clamp(ex - Math.cos(a) * (w / 2 + 34), box.x0 + w / 2, box.x1 - w / 2), py = clamp(ey - Math.sin(a) * (h / 2 + 34), box.y0 + h / 2, box.y1 - h / 2);
      for (const q of placed) if (Math.abs(q.x - px) < (q.w + w) / 2 && Math.abs(q.y - py) < h + 4) py = q.y + h + 6;
      placed.push({ x: px, y: py, w });
      rr(px - w / 2, py - h / 2, w, h, 8); ctx.fillStyle = 'rgba(12,14,20,0.92)'; ctx.fill(); stroke(2.5, col);
      ctx.fillStyle = '#ffffff'; ctx.fillText(text, px, py + 0.5);
    }
  }
  ctx.textAlign = 'left';
  ctx.restore();
}
