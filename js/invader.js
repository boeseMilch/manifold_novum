// Boarders that come in through a side outer airlock (boarding.invaders, `kind` 'alien' or 'saboteur'):
// - the alien (the fighter): hunts the crew room by room (using the deck airlocks like the crew does)
//   and fights whoever it finds: keeps its distance, strafes, sidesteps incoming shots, spits acid, pounces.
// - the saboteur (the sneak): cloaks once inside and pops up next to a part in one of the rooms next to
//   that airlock (you know the airlock, not which of the two rooms), then wrecks the part. Solo there's
//   just time to run over from the other room; with a crew you need someone in each. Weak in a fight.
// Also holds the indoor projectiles (laser bolts, thrown wrenches, acid spit, the saboteur's shots).

const ALIEN_HP = 4, ALIEN_SPEED = 2.6;              // footprint is the crew's (CREW_R), so it fits doors and airlocks
const ENGAGE_RANGE = 4.5, HUNT_SIGHT = 8, HUNT_REPLAN = 2.5;
const SPIT_SPEED = 11.5, SPIT_RANGE = 14.4, SPIT_COOLDOWN = [1.6, 2.6], SPIT_WINDUP = 0.7, DODGE_SPEED = 9, DODGE_TIME = 0.25, DODGE_COOLDOWN = 2.2;
const POUNCE_RANGE = 3.4, POUNCE_WINDUP = 0.65, POUNCE_TIME = 0.32, POUNCE_SPEED = 12;
// Contact hurts: a pounce that connects, or just bumping into it, costs one hit; then nothing more from that
// alien for ALIEN_TOUCH_COOLDOWN s (so one contact is one hit, a pounce and the touch it ends in included).
const ALIEN_TOUCH_R = 0.55, ALIEN_TOUCH_COOLDOWN = 1.5;

const boarding = { invaders: [], bolts: [] };

// ---------------------------------------------------------------------------
// Navigation graph: room spots, doorways, deck-airlock approaches and chambers.
// ---------------------------------------------------------------------------
const NAV_SPOTS = { portGun: [7, 7.6], bridge: [22.2, 9.2], starGun: [37, 7.2], portLock: [7.5, 19], reactor: [22.2, 16.6], starLock: [37, 19.6] };
const NAV = (() => {
  const nodes = [], edges = [];
  const add = (x, y, room = null) => { nodes.push({ x, y, room }); return nodes.length - 1; };
  const link = (a, b) => { edges.push([a, b]); };
  const roomNode = {};
  for (const r of ROOMS) roomNode[r.id] = add(...NAV_SPOTS[r.id], r.id);
  const roomOf = (x, y) => ROOMS.find(r => r.rects.some(q => inRect(x, y, q, 0.7)));
  for (const d of DOORWAYS) {
    const n = add(d.x + d.w / 2, d.y + d.h / 2);
    for (const r of ROOMS) if (r.rects.some(q => inRect(d.x - 0.3, d.y + 1, q) || inRect(d.x + d.w + 0.3, d.y + 1, q))) link(n, roomNode[r.id]);
  }
  for (const Lk of DECK_LOCKS) {
    const cx = Lk.x + Lk.w / 2;
    const top = add(cx, SPINE_Y0 - 0.7), mid = add(cx, (SPINE_Y0 + SPINE_Y1) / 2), bot = add(cx, SPINE_Y1 + 0.7);
    link(top, mid); link(mid, bot);
    link(top, roomNode[roomOf(cx, SPINE_Y0 - 1).id]); link(bot, roomNode[roomOf(cx, SPINE_Y1 + 1).id]);
    nodes[mid].lock = Lk;
  }
  const nb = nodes.map(() => []);
  for (const [a, b] of edges) { nb[a].push(b); nb[b].push(a); }
  return { nodes, nb, roomNode };
})();
function navPath(from, to) {                         // BFS over node indices
  const prev = new Map([[from, -1]]), q = [from];
  while (q.length) {
    const n = q.shift();
    if (n === to) break;
    for (const m of NAV.nb[n]) if (!prev.has(m)) { prev.set(m, n); q.push(m); }
  }
  if (!prev.has(to)) return [];
  const path = [];
  for (let n = to; n !== -1; n = prev.get(n)) path.unshift(n);
  return path;
}
function nearestNav(x, y) {
  let best = 0, bd = Infinity;
  NAV.nodes.forEach((n, i) => { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = i; } });
  return best;
}

// Is a straight line between two points free of walls (inside the ship)?
function lineOfSight(x0, y0, x1, y1) {
  const rects = walkRects(), n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.25);
  for (let i = 1; i < n; i++) {
    const x = lerp(x0, x1, i / n), y = lerp(y0, y1, i / n);
    if (!rects.some(r => inRect(x, y, r))) return false;
  }
  return true;
}
const freeAt = (x, y) => walkRects().some(r => inRect(x, y, r)) || (!pointInPoly(x, y) && !(typeof dockSolid === 'function' && dockSolid(x, y)));   // projectile space (the pirate base's walls stop shots too)

// ---------------------------------------------------------------------------
// Invaders
// ---------------------------------------------------------------------------
// zone ('top' | 'bottom'): the deck it keeps to while another alien is still alive (see alienPrey).
function spawnInvader(side, zone = null, banner = true) {
  const h = HATCHES.find(h => h.side === side);
  boarding.invaders.push({
    uid: newUid(), kind: 'alien', x: h.outside[0], y: h.outside[1], vx: 0, vy: 0, face: h.dir < 0 ? 0 : Math.PI, walk: 0, mode: 'outside',
    state: 'entering', hatch: h, t: 0, hp: ALIEN_HP, path: [], linger: 0, stuck: 0,
    spitT: 1.5, lockedOut: 0, act: null, dodgeCd: 0, strafe: Math.random() < 0.5 ? 1 : -1, stun: 0, seen: 0, flash: 0, touchCd: 0, zone,
  });
  if (banner) combatBanner(`Intruder alert — something is coming in through the ${side === 'port' ? 'left' : 'right'} airlock!`);
  sfx.hatch();
}
// An intruder event: one alien through ev.side's airlock, or (ev.count > 1) several, one per airlock in turn,
// each keeping to its own deck (the first the upper, the next the lower, ...) so they don't hunt as a pack.
function spawnIntruders(ev) {
  const n = Math.max(1, ev.count || 1);
  if (ev.pods && boarding.pods.some(p => p.state === 'sealed')) return hatchPods(ev, n);
  if (n === 1) return spawnInvader(ev.side);
  const other = ev.side === 'port' ? 'star' : 'port';
  for (let i = 0; i < n; i++) spawnInvader(i % 2 ? other : ev.side, i % 2 ? 'bottom' : 'top', false);
  combatBanner(`Intruder alert — ${n === 2 ? 'two of them' : `${n} of them`}, coming in through both airlocks!`);
}

// ---------------------------------------------------------------------------
// Cargo pods (chapter 2, "Strange Cargo"): the delivery is two sealed salvage pods, strapped down in the reactor
// room's back corner (boarding.pods; solid, like crates: podRect in SOLIDS). Its intruder event (ev.pods, not a
// radar contact: it happens inside) hatches them instead of bringing aliens in through the airlocks: pod i starts
// to stir (bulges, twitches, a banner) i·POD_GAP s after the event, and bursts POD_STIR s later; its alien crawls
// out in front of it (keeping to its deck like the airlock pair: the first the upper, the next the lower). The
// burst-open shell stays (state 'open'). Count beyond the sealed pods: the rest come through the airlocks as before.
// ---------------------------------------------------------------------------
const CARGO_PODS = [{ x: 28.15, y: 23.3 }, { x: 29.55, y: 23.3 }];   // reactor room, right of the engine, below the line to the right airlock room
const POD_W = 1.2, POD_H = 0.72, POD_STIR = 6, POD_GAP = 10;
boarding.pods = [];
const podHatchAt = (i) => i * POD_GAP + POD_STIR;   // s after the event that pod i bursts (tools/balance.js)
const podRect = (p) => ({ ...R(p.x - POD_W / 2, p.y - POD_H / 2, p.x + POD_W / 2, p.y + POD_H / 2), pod: true });
// The pods' footprints in SOLIDS (re-done whenever the pods change: mission start, every snapshot)
function syncPodSolids() {
  for (let i = SOLIDS.length - 1; i >= 0; i--) if (SOLIDS[i].pod) SOLIDS.splice(i, 1);
  for (const p of boarding.pods) SOLIDS.push(podRect(p));
}
// n sealed pods aboard at the mission start (the missions whose written intruder events say pods: their count)
function setupCargoPods(n) {
  boarding.pods = CARGO_PODS.slice(0, Math.max(0, n)).map((p, i) => ({ id: i, x: p.x, y: p.y, state: 'sealed', t: 0, zone: null }));
  syncPodSolids();
}
function hatchPods(ev, n) {
  const sealed = boarding.pods.filter(p => p.state === 'sealed'), k = Math.min(n, sealed.length);
  sealed.slice(0, k).forEach((p, i) => Object.assign(p, { state: 'stir', t: -i * POD_GAP, zone: n > 1 ? (i % 2 ? 'bottom' : 'top') : null, nth: i, of: k }));
  for (let i = k; i < n; i++) spawnInvader(i % 2 ? (ev.side === 'port' ? 'star' : 'port') : ev.side, n > 1 ? (i % 2 ? 'bottom' : 'top') : null, false);
}
function updatePods(dt) {
  for (const p of boarding.pods) {
    if (p.state !== 'stir') continue;
    const t0 = p.t; p.t += dt;
    if (!p.warned && p.t >= 0) {                     // it starts: the warning beat
      p.warned = true;
      combatBanner(p.nth ? 'The other cargo pod is moving too!' : 'Something is moving in the cargo pod! (reactor room)');
      sfx.squelch?.(); sfx.clank();
    }
    if (p.t >= 0 && Math.floor(p.t * 1.6) !== Math.floor(t0 * 1.6)) sfx.clank();   // thumps from inside, faster than you'd like
    if (p.t >= POD_STIR) podBurst(p);
  }
}
function podBurst(p) {
  p.state = 'open'; p.t = 0;
  const rects = walkRects(), [x, y] = nearestFree(p.x, p.y - POD_H / 2 - 0.35, (x, y) => canStand(x, y, rects)) || [p.x, p.y - POD_H / 2 - 0.35];
  boarding.invaders.push({
    uid: newUid(), kind: 'alien', x, y, vx: 0, vy: 0, face: -Math.PI / 2, walk: 0, mode: 'inside',
    state: 'wander', hatch: null, t: 0, hp: ALIEN_HP, path: [], linger: 0.6, stuck: 0,
    spitT: 1.5, lockedOut: 0, act: null, dodgeCd: 0, strafe: Math.random() < 0.5 ? 1 : -1, stun: 0, seen: 0, flash: 0, touchCd: 0, zone: p.zone, pod: p.id,
  });
  if (typeof slimeBurst === 'function') slimeBurst(p.x, p.y - 0.1, 26, 0.12, 0.45); else sfx.squelch?.();
  for (let i = 0; i < 14; i++) combatFx(p.x, p.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 4, 0.6, i % 2 ? '#ffb36a' : '#e8e4d8', 0.08);   // shell shards
  sfx.alienHurt(); sfx.crack?.();
  combatBanner(p.of > 1 ? (p.nth ? 'The second pod burst — both of them are loose!' : 'The cargo pod burst open — something got out! The other pod is next…')
                        : 'The cargo pod burst open — something got out!');
}
const deckOf = (y) => (y < (SPINE_Y0 + SPINE_Y1) / 2 ? 'top' : 'bottom');
// Does it keep to its zone (its own deck) right now? Only while another alien is still about.
const zoned = (a) => !!a.zone && boarding.invaders.some(b => b !== a && b.kind !== 'saboteur' && !b.dead && b.state !== 'dormant');
// Who it hunts: the nearest crew member aboard (in its zone, while it keeps to one).
function alienPrey(a) {
  const z = zoned(a) ? a.zone : null;
  return crew.filter(c => c.mode === 'inside' && standing(c) && (!z || deckOf(c.y) === z))
             .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
}
// Contact: one hit (and a shove away from it) to whoever it touches, then ALIEN_TOUCH_COOLDOWN s of nothing.
function alienStrike(a, c) {
  if ((a.touchCd || 0) > 0) return false;
  a.touchCd = ALIEN_TOUCH_COOLDOWN;
  combat.hits.crew++; combat.flashes[c.x < a.x ? 'port' : 'star'] = 1; sfx.hit(true); hurtCrew(c);
  for (let i = 0; i < 12; i++) combatFx(c.x, c.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.5, '#e2574c', 0.11);
  const d = Math.hypot(c.x - a.x, c.y - a.y), ux = d > 0.01 ? (c.x - a.x) / d : Math.cos(a.face), uy = d > 0.01 ? (c.y - a.y) / d : Math.sin(a.face);
  const kx = c.x + ux * 0.9, ky = c.y + uy * 0.9;          // knocked back
  if (canStand(kx, ky, walkRects())) { c.x = kx; c.y = ky; }
  return true;
}
function alienTouch(a) {
  const c = crew.find(c => c.mode === 'inside' && standing(c) && Math.hypot(c.x - a.x, c.y - a.y) < ALIEN_TOUCH_R);
  if (c) alienStrike(a, c);
}
const invaderMaxHp = (a) => (a.kind === 'saboteur' ? SAB_HP : ALIEN_HP);

function alienMove(a, tx, ty, speed, dt) {
  const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
  const vx = d > 0.01 ? dx / d * speed : 0, vy = d > 0.01 ? dy / d * speed : 0;
  return alienStep(a, vx, vy, dt);
}
function alienStep(a, vx, vy, dt) {
  const rects = walkRects();
  if (a.mode === 'inside') unstick(a, (x, y) => canStand(x, y, rects));    // never frozen in place
  // while fighting it stays out of airlock chambers (it would get shut in)
  const inSpine = (y) => y > SPINE_Y0 - 0.25 && y < SPINE_Y1 + 0.25;
  const ok = (x, y) => canStand(x, y, rects) && (a.state !== 'fight' || inSpine(a.y) || !inSpine(y));
  let moved = 0;
  const nx = a.x + vx * dt; if (ok(nx, a.y)) { a.x = nx; moved += Math.abs(vx * dt); }
  const ny = a.y + vy * dt; if (ok(a.x, ny)) { a.y = ny; moved += Math.abs(vy * dt); }
  if (Math.hypot(vx, vy) > 0.2) a.face = Math.atan2(vy, vx);
  a.walk += moved * 4;
  return moved;
}

// Forcing the outer airlock open and stepping in (both kinds). True while it's still at it.
function enterHatch(a, dt) {
  if (a.state !== 'entering') return false;
  if (a.hatch.locked) {                            // locked by security: the alien bashes it open, the saboteur picks the lock
    const sab = a.kind === 'saboteur', step = sab ? 0.9 : 0.7;
    a.bash = (a.bash || 0) + dt;
    if (Math.floor(a.bash / step) !== Math.floor((a.bash - dt) / step)) {
      if (sab) sfx.spark(); else sfx.clank();
      for (let i = 0; i < 5; i++) combatFx(a.hatch.x, a.hatch.y, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.3, sab ? '#5ae0ff' : '#ffd28a', 0.07);
    }
    if (a.bash >= (sab ? SAB_PICK_TIME : 8)) {
      a.hatch.locked = false; a.bash = 0;
      combatBanner(sab ? `The saboteur cracked the ${a.hatch.side === 'port' ? 'left' : 'right'} airlock's lock!` : `The intruder bashed the ${a.hatch.side === 'port' ? 'left' : 'right'} airlock open!`);
    }
    return true;
  }
  a.t += dt;
  const k = a.t / HATCH_TIME, h = a.hatch;
  h.open = Math.max(h.open, Math.sin(Math.PI * clamp(k, 0, 1)));
  const q = clamp((k - 0.25) / 0.5, 0, 1);
  a.x = lerp(h.outside[0], h.inside[0], q); a.y = lerp(h.outside[1], h.inside[1], q);
  if (k >= 1) { a.state = 'wander'; a.mode = 'inside'; }
  return true;
}

function updateInvader(a, dt) {
  a.flash = Math.max(0, a.flash - dt * 4);
  if (a.kind === 'saboteur') return updateSaboteur(a, dt);
  a.touchCd = Math.max(0, (a.touchCd || 0) - dt);
  if (enterHatch(a, dt)) return;
  if (a.stun > 0) { a.stun -= dt; return; }
  if (a.state !== 'dormant') alienTouch(a);        // bumping into it hurts (asleep or stunned it does nothing)
  if (a.state === 'dormant') {                     // asleep (on a derelict) until someone comes close
    const c = crew.find(c => c.mode === 'inside' && standing(c) && Math.hypot(c.x - a.x, c.y - a.y) < ENGAGE_RANGE && lineOfSight(a.x, a.y, c.x, c.y));
    if (c) { a.state = 'fight'; a.target = c; a.seen = 0; sfx.alienHurt(); }
    return;
  }
  // the nearest crew member inside that it can see
  const visible = crew.filter(c => c.mode === 'inside' && standing(c) && Math.hypot(c.x - a.x, c.y - a.y) < 14 && lineOfSight(a.x, a.y, c.x, c.y))
                      .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
  if (a.state !== 'fight' || !a.target || !crew.includes(a.target) || (visible.length && !visible.includes(a.target))) a.target = visible[0] || a.target;
  const player = a.target && crew.includes(a.target) ? a.target : (visible[0] || crew[0] || { x: a.x, y: a.y, mode: 'none' });   // who it's after
  const seesPlayer = visible.includes(player);

  if (a.state === 'fight') {
    a.seen = seesPlayer ? 0 : a.seen + dt;
    if ((a.seen > 6 || player.mode !== 'inside') && a.dormantHome) { a.state = 'dormant'; a.act = null; return; }
    if (a.seen > 3 || player.mode !== 'inside') { a.state = 'wander'; a.path = []; a.replanT = 0; a.act = null; return; }   // lost them: hunt
    const dx = player.x - a.x, dy = player.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    a.dodgeCd -= dt; a.spitT -= dt;
    const act = a.act;                               // current move: windup → strike → recover, all readable
    if (act) {
      act.t += dt;
      if (act.kind === 'lunge') {                    // dodge: a fast sideways lunge out of the line of fire
        alienStep(a, act.dir[0] * DODGE_SPEED, act.dir[1] * DODGE_SPEED, dt);
        if (act.t >= DODGE_TIME) a.act = { kind: 'recover', t: 0, len: 0.5 };
      } else if (act.kind === 'spit') {              // head pulls back, throat glows, then it spits
        a.face = Math.atan2(dy, dx);
        if (act.t >= SPIT_WINDUP && !act.fired) {
          act.fired = true;
          boarding.bolts.push({ x: a.x + ux * 0.4, y: a.y + uy * 0.4, vx: ux * SPIT_SPEED, vy: uy * SPIT_SPEED, life: SPIT_RANGE / SPIT_SPEED, owner: 'alien' });
          sfx.spit();
        }
        if (act.t >= SPIT_WINDUP + 0.35) a.act = null;
      } else if (act.kind === 'pounce') {            // coils up (rear wiggles), then leaps at where you stood
        if (act.t < POUNCE_WINDUP) { a.face = Math.atan2(dy, dx); act.to = [player.x, player.y]; }
        else {
          const [tx, ty] = act.to, td = Math.hypot(tx - a.x, ty - a.y);
          if (!act.leapt) { act.leapt = true; sfx.alienHurt(); }
          if (td > 0.2) alienStep(a, (tx - a.x) / td * POUNCE_SPEED, (ty - a.y) / td * POUNCE_SPEED, dt);
          if (!act.hit && player.mode === 'inside' && standing(player) && Math.hypot(player.x - a.x, player.y - a.y) < ALIEN_TOUCH_R) {
            act.hit = true; alienStrike(a, player);                                     // (not twice: the touch shares the cooldown)
          }
          if (act.t >= POUNCE_WINDUP + POUNCE_TIME) a.act = { kind: 'recover', t: 0, len: 0.8 };
        }
      } else if (act.kind === 'recover') {           // off balance: can't dodge (your chance)
        if (act.t >= act.len) a.act = null;
      }
      return;
    }
    // in its ready stance (crouched = it will dodge): watch for incoming bolts
    if (a.dodgeCd <= 0) {
      for (const bo of boarding.bolts) {
        if (bo.owner !== 'crew') continue;
        const rx = a.x - bo.x, ry = a.y - bo.y, sp = Math.hypot(bo.vx, bo.vy), along = (rx * bo.vx + ry * bo.vy) / sp;
        const miss = Math.abs(rx * bo.vy - ry * bo.vx) / sp;
        if (along > 0 && along < 5 && miss < 0.7) {
          const side = Math.sign(rx * bo.vy - ry * bo.vx) || 1;
          a.act = { kind: 'lunge', t: 0, dir: [bo.vy / sp * side, -bo.vx / sp * side] }; a.dodgeCd = DODGE_COOLDOWN;
          return;
        }
      }
    }
    // choose an attack now and then: pounce when close, spit from range
    if (a.spitT <= 0 && seesPlayer) {
      a.spitT = SPIT_COOLDOWN[0] + Math.random() * (SPIT_COOLDOWN[1] - SPIT_COOLDOWN[0]);
      a.act = d < POUNCE_RANGE ? { kind: 'pounce', t: 0 } : { kind: 'spit', t: 0 };
      return;
    }
    // otherwise keep ~4–6 units away and strafe sideways around the player
    const want = lockAround(a) ? 1 : d > 6 ? 1 : d < 4 ? -0.6 : 0;   // (caught in a deck airlock: get out of it, towards them)
    if (Math.random() < dt * 0.4) a.strafe *= -1;
    const vx = ux * want * ALIEN_SPEED + -uy * a.strafe * ALIEN_SPEED * 0.8, vy = uy * want * ALIEN_SPEED + ux * a.strafe * ALIEN_SPEED * 0.8;
    if (alienStep(a, vx, vy, dt) < 0.01 * dt) a.strafe *= -1;
    a.face = Math.atan2(dy, dx);
    return;
  }

  // it's out for blood: engage whoever it can see in reach
  if (seesPlayer && Math.hypot(player.x - a.x, player.y - a.y) < HUNT_SIGHT && !lockAround(a)) { a.state = 'fight'; a.seen = 0; a.path = []; return; }   // (not from inside a deck airlock: out first)
  if (a.linger > 0) { a.linger -= dt; return; }
  // hunt: head for the room of the nearest crew member aboard (re-planned as they move); with nobody
  // aboard, or while every way to them is locked, it prowls from room to room
  const prey = alienPrey(a);
  a.replanT = (a.replanT || 0) - dt; a.prowl = Math.max(0, (a.prowl || 0) - dt);
  if (prey && !a.prowl && (a.replanT <= 0 || !a.path.length)) {
    a.replanT = HUNT_REPLAN;
    const pr = roomAt(prey.x, prey.y), goal = pr ? NAV.roomNode[pr.id] : nearestNav(prey.x, prey.y);
    if (!a.path.length || a.path[a.path.length - 1] !== goal) {   // (same goal: keep the route, so being stuck adds up)
      const path = navPath(nearestNav(a.x, a.y), goal);
      a.path = path.length > 1 ? path : [];
      if (!a.path.length) { a.linger = 0.4; a.walkTo = [prey.x, prey.y]; }
    }
  }
  if (!a.path.length && a.walkTo) {                 // same room, out of sight (round a corner): go to where they are
    const [tx, ty] = a.walkTo;
    if (alienMove(a, tx, ty, ALIEN_SPEED * 0.85, dt) < 0.002 || Math.hypot(tx - a.x, ty - a.y) < 0.4) a.walkTo = null;
    return;
  }
  if (!a.path.length) {
    const room = roomAt(a.x, a.y) || NAV.nodes[nearestNav(a.x, a.y)].room && ROOMS.find(r => r.id === NAV.nodes[nearestNav(a.x, a.y)].room) || ROOMS[0];
    // keeping to its zone: off it, head for one of its rooms; on it, prowl its rooms only
    const zone = zoned(a) ? a.zone : null, adj = adjacentRooms(room).filter(r => !zone || room.deck !== zone || r.deck === zone);
    const home = zone && room.deck !== zone ? ROOMS.filter(r => r.deck === zone) : null;
    const next = home || adj.filter(r => r.id !== a.prevRoom);
    const to = (next.length ? next : adj)[Math.floor(Math.random() * (next.length || adj.length))];
    a.prevRoom = room.id;
    a.path = navPath(nearestNav(a.x, a.y), NAV.roomNode[to.id]);
    if (!a.path.length) { a.linger = 1.5; return; }
  }
  const n = NAV.nodes[a.path[0]];
  const moved = alienMove(a, n.x, n.y, ALIEN_SPEED * (prey && !a.prowl ? 0.9 : 0.75), dt);
  if (Math.hypot(n.x - a.x, n.y - a.y) < 0.15) {
    a.path.shift(); a.stuck = 0;
    if (n.lock) a.linger = 0.3;
  } else if (moved < 0.002) {                       // blocked (closed door): wait, try another route, then bash
    a.stuck += dt;
    // Doors locked by security contain it: it never bashes those, it gives up on that way for a while and
    // prowls about instead (shut in, it paces the room). Broken / jammed doors it bashes open.
    const lock = lockAround(a), door = lock ? { lock, side: n.y < (SPINE_Y0 + SPINE_Y1) / 2 ? 'top' : 'bottom' } : blockingDoor(a);
    const locked = door && (door.doorway?.locked || door.doorway?.blast || door.lock?.locked);
    if (locked && a.stuck > 2) {
      a.path = []; a.stuck = 0; a.linger = 1.5;
      if (++a.lockedOut >= 2) { a.prowl = 8; a.lockedOut = 0; }         // that way is shut: prowl about for a while
    } else if (door && !locked && a.stuck > (lock ? 3 : 6)) bashDoor(a, dt, door, lock ? 4 : 5);
    else if (!door && a.stuck > 6) { a.path = []; a.stuck = 0; }
  } else { a.bash = 0; if (moved > 0.01) a.replanned = false; }
}

// Where to stand to sabotage a part: next to it, on free floor inside that room
// (parts between the decks are worked on from the room's edge of the shaft / airlock).
function sabotageSpot(sys, room) {
  if (sys.y > SPINE_Y0 && sys.y < SPINE_Y1) return [sys.x, room.deck === 'top' ? SPINE_Y0 - 0.6 : SPINE_Y1 + 0.6];
  const [cx, cy] = roomCenter(room), rects = walkRects();
  const d = Math.hypot(cx - sys.x, cy - sys.y) || 1, ux = (cx - sys.x) / d, uy = (cy - sys.y) / d;
  for (let k = 0.6; k <= 3.2; k += 0.2) {
    const x = sys.x + ux * k, y = sys.y + uy * k;
    if (canStand(x, y, rects) && room.rects.some(q => inRect(x, y, q, -0.3))) return [x, y];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Saboteur: cloak → pop up next to a part in a neighbouring room → wreck it → cloak again
// ---------------------------------------------------------------------------
// Timings come from tools/travel.js (real walking times): the two rooms next to a side airlock are
// 7–9.5 s apart, next-door rooms never less than 3.7 s. Solo, the work takes long enough to run over
// from the other room (tests/saboteur.js checks this against the measured times); with a crew it's too
// quick to get there from anywhere but that room.
const SAB_HP = 3, SAB_SPEED = 2.3, SAB_PICK_TIME = 6;
const SAB_FADE = 0.8, SAB_SNEAK = [3.5, 5], SAB_WORK_SOLO = 12, SAB_WORK_TEAM = 2;
const SAB_NOTICE = 5, SAB_LOSE = 3;                  // spots crew this close (in view); cloaks away once out of sight this long
const SAB_SHOT_SPEED = 4.5, SAB_SHOT_COOLDOWN = [3.5, 5], SAB_AIM = 1.0;   // slow, telegraphed, easy to sidestep
const sabWorkTime = () => (crew.length > 1 ? SAB_WORK_TEAM : SAB_WORK_SOLO);

function spawnSaboteur(side) {
  const h = HATCHES.find(h => h.side === side);
  boarding.invaders.push({
    uid: newUid(), kind: 'saboteur', x: h.outside[0], y: h.outside[1], vx: 0, vy: 0, face: h.dir < 0 ? 0 : Math.PI, walk: 0, mode: 'outside',
    state: 'entering', hatch: h, t: 0, hp: SAB_HP, path: [], stuck: 0, act: null, shotT: 1.5, strafe: Math.random() < 0.5 ? 1 : -1,
    stun: 0, seen: 0, flash: 0, room: roomAt(...h.inside)?.id, from: null,
  });
  const where = adjacentRooms(roomAt(...h.inside)).map(r => r.name.toLowerCase()).join(' or the ');
  combatBanner(`Saboteur at the ${side === 'port' ? 'left' : 'right'} airlock — it cloaks! Watch the ${where}.`);
  sfx.hatch();
}

// Can it slip from one room to a neighbour? Not through a door or deck airlock security has locked.
function roomLinkOpen(a, b) {
  if (a.col === b.col) return !DECK_LOCKS[a.col].locked;
  const x = COLS[Math.max(a.col, b.col)].x - 0.3;
  const d = DOORWAYS.find(d => Math.abs(d.x + d.w / 2 - x) < 0.5 && (d.y < SPINE_Y0) === (a.deck === 'top'));
  return !d || !(d.locked || d.blast);
}
const sabTargets = (room) => SYSTEMS.filter(s => !s.broken && sysRooms(s).includes(room)).map(s => [s, sabotageSpot(s, room)]).filter(([, p]) => p);
// Where it turns up next: a random open neighbour with something left to break (the room it's in if it's shut in).
function sabPickRoom(a) {
  const here = ROOMS.find(r => r.id === a.room) || roomAt(a.x, a.y) || ROOMS[0];
  const open = adjacentRooms(here).filter(r => roomLinkOpen(here, r) && sabTargets(r).length);
  const pool = open.length ? open : sabTargets(here).length ? [here] : adjacentRooms(here).filter(r => roomLinkOpen(here, r));
  return (pool.length ? pool : [here])[Math.floor(Math.random() * (pool.length || 1))];
}
function sabCloak(a) {
  a.state = 'cloak'; a.t = 0; a.task = null; a.act = null;
  sfx.hatch();
  for (let i = 0; i < 14; i++) combatFx(a.x + (Math.random() - 0.5) * 0.6, a.y + (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 2, -Math.random() * 2, 0.6, '#5ae0ff', 0.06);
}
function sabPopUp(a) {
  // security locked the way while it was sneaking over: it's stuck in the room it was leaving, and works there
  const here = ROOMS.find(r => r.id === a.room), there = ROOMS.find(r => r.id === a.dest) || ROOMS[0];
  const room = here && here !== there && !roomLinkOpen(here, there) ? here : there, targets = sabTargets(room);
  const [sys, spot] = targets[Math.floor(Math.random() * targets.length)] || [null, roomCenter(room)];
  a.x = spot[0]; a.y = spot[1]; a.room = room.id; a.mode = 'inside'; a.state = 'decloak'; a.t = 0; a.seen = 0;
  a.task = sys ? { kind: 'sabotage', sys, t: 0, need: sabWorkTime() } : null;
  if (sys) a.face = Math.atan2(sys.y - a.y, sys.x - a.x);
  combatBanner(`The saboteur decloaked in the ${room.name.toLowerCase()}${sys ? ` — it's at the ${sys.name.toLowerCase()}!` : '!'}`);
  sfx.spark();
  for (let i = 0; i < 14; i++) combatFx(a.x + (Math.random() - 0.5) * 0.6, a.y + (Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 2, -Math.random() * 2, 0.6, '#5ae0ff', 0.06);
}
// Crew it can see close by (who'd catch it at work).
function sabWatchers(a, range) {
  return crew.filter(c => c.mode === 'inside' && standing(c) && Math.hypot(c.x - a.x, c.y - a.y) < range && lineOfSight(a.x, a.y, c.x, c.y))
             .sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
}
function sabProvoke(a) { if (['work', 'decloak', 'lurk'].includes(a.state)) { a.state = 'fight'; a.seen = 0; a.task = null; a.act = null; a.shotT = Math.max(a.shotT, 1.2); } }

function updateSaboteur(a, dt) {
  if (enterHatch(a, dt)) { if (a.state !== 'entering') { a.room = roomAt(a.x, a.y)?.id || a.room; sabCloak(a); } return; }
  if (a.stun > 0) { a.stun -= dt; return; }
  a.t += dt;
  if (a.state === 'cloak') {                         // fading out (it can still be shot)
    if (a.t >= SAB_FADE) { a.state = 'sneak'; a.mode = 'cloaked'; a.t = 0; a.sneak = SAB_SNEAK[0] + Math.random() * (SAB_SNEAK[1] - SAB_SNEAK[0]); a.dest = sabPickRoom(a).id; }
    return;
  }
  if (a.state === 'sneak') { if (a.t >= a.sneak) sabPopUp(a); return; }
  if (a.state === 'decloak') {                       // shimmering in: already at the part, already catchable
    if (sabWatchers(a, SAB_NOTICE).length) { sabProvoke(a); return; }
    if (a.t >= SAB_FADE) { a.state = a.task ? 'work' : 'lurk'; a.t = 0; }
    return;
  }
  if (a.state === 'lurk') { if (sabWatchers(a, SAB_NOTICE).length) sabProvoke(a); else if (a.t > 3) sabCloak(a); return; }
  if (a.state === 'work') {
    const sys = a.task.sys;
    if (sabWatchers(a, SAB_NOTICE).length) { sabProvoke(a); return; }
    if (sys.broken) { sabCloak(a); return; }         // somebody else got there first: move on
    a.face = Math.atan2(sys.y - a.y, sys.x - a.x);
    const before = a.task.t; a.task.t += dt;
    if (Math.floor(a.task.t / 0.6) !== Math.floor(before / 0.6)) {
      sfx.spark();
      for (let i = 0; i < 3; i++) combatFx(sys.x + (Math.random() - 0.5) * 0.6, sys.y + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 3, -Math.random() * 3, 0.35, '#5ae0ff', 0.06);
    }
    if (a.task.t >= a.task.need) { breakSystem(sys); combatBanner(`The saboteur wrecked the ${sys.name.toLowerCase()}!`); sabCloak(a); }
    return;
  }
  if (a.state === 'fight') {
    const seen = sabWatchers(a, 14), foe = seen[0];
    a.seen = foe ? 0 : a.seen + dt;
    if (a.seen > SAB_LOSE) { sabCloak(a); return; }  // shook them off: slip away to the next room
    a.shotT -= dt;
    const act = a.act;
    if (act) {                                       // aim (laser sight, 1 s) → a slow shot → lower the gun
      act.t += dt;
      if (foe && !act.fired) a.face = Math.atan2(foe.y - a.y, foe.x - a.x);
      if (act.t >= SAB_AIM && !act.fired) {
        act.fired = true;
        const ux = Math.cos(a.face), uy = Math.sin(a.face);
        boarding.bolts.push({ x: a.x + ux * 0.45, y: a.y + uy * 0.45, vx: ux * SAB_SHOT_SPEED, vy: uy * SAB_SHOT_SPEED, life: 2.6, owner: 'saboteur' });
        sfx.spit();
      }
      if (act.t >= SAB_AIM + 0.4) a.act = null;
      return;
    }
    if (!foe) return;
    const dx = foe.x - a.x, dy = foe.y - a.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    if (a.shotT <= 0) { a.shotT = SAB_SHOT_COOLDOWN[0] + Math.random() * (SAB_SHOT_COOLDOWN[1] - SAB_SHOT_COOLDOWN[0]); a.act = { kind: 'aim', t: 0 }; return; }
    // backs off to 5–7 units and edges sideways
    const want = d < 5 ? -1 : d > 7 ? 0.6 : 0;
    if (Math.random() < dt * 0.3) a.strafe *= -1;
    const vx = ux * want * SAB_SPEED - uy * a.strafe * SAB_SPEED * 0.5, vy = uy * want * SAB_SPEED + ux * a.strafe * SAB_SPEED * 0.5;
    if (alienStep(a, vx, vy, dt) < 0.01 * dt) a.strafe *= -1;
    a.face = Math.atan2(dy, dx);
    a.room = roomAt(a.x, a.y)?.id || a.room;
    return;
  }
  sabCloak(a);                                       // (anything else, e.g. a state from an older save of the sync: start over)
}

// No getting stuck: an intruder that can't get through bashes its way out.
function lockAround(a) {                            // the deck-airlock chamber it's standing in, if any
  return DECK_LOCKS.find(L => a.x > L.x && a.x < L.x + L.w && a.y > SPINE_Y0 && a.y < SPINE_Y1) || null;
}
function blockingDoor(a) {                          // the nearest closed door it's up against
  const d = DOORWAYS.find(d => d.open < 0.95 && Math.hypot(a.x - (d.x + d.w / 2), a.y - (d.y + d.h / 2)) < 1.6);
  if (d) return { doorway: d };
  for (const L of DECK_LOCKS) for (const side of ['top', 'bottom']) {
    const r = L.doorRect[side];
    if (L.doors[side] < 0.95 && Math.hypot(a.x - (r.x + r.w / 2), a.y - (r.y + r.h / 2)) < 1.6) return { lock: L, side };
  }
  return null;
}
function bashDoor(a, dt, door, time) {
  const before = a.bash || 0;
  a.bash = before + dt;
  if (Math.floor(a.bash / 0.6) !== Math.floor(before / 0.6)) {
    sfx.clank();
    for (let i = 0; i < 5; i++) combatFx(a.x + Math.cos(a.face) * 0.4, a.y + Math.sin(a.face) * 0.4, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.3, '#ffd28a', 0.07);
  }
  if (a.bash < time) return;
  if (door.doorway) { door.doorway.locked = false; door.doorway.open = 1; }
  else { const L = door.lock; L.doors[door.side] = 1; L.open = door.side; L.phase = 'idle'; L.locked = false; }
  combatBanner('The intruder bashed a door open!');
  a.bash = 0; a.stuck = 0; a.replanned = false;
}

function hurtInvader(a, dmg, stun = 0) {
  const sab = a.kind === 'saboteur';
  a.hp -= dmg; a.flash = 1; a.stun = Math.max(a.stun, stun);
  if (sab) sabProvoke(a);
  else if (a.state !== 'entering') { a.state = 'fight'; a.seen = 0; }
  for (let i = 0; i < 8; i++) combatFx(a.x, a.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.5, sab ? '#5ae0ff' : '#9cff5a', 0.1);
  sfx.alienHurt();
  if (a.hp <= 0) {
    a.dead = true; mission.kills = (mission.kills || 0) + 1;
    if (sab) {
      for (let i = 0; i < 24; i++) combatFx(a.x, a.y, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0.8, i % 2 ? '#5ae0ff' : '#ffffff', 0.12);
      combat.decals.push({ x: a.x, y: a.y, r: 0.5, body: 'saboteur', face: a.face });
      combatBanner('Saboteur down'); sfx.win();
    } else {
      for (let i = 0; i < 30; i++) combatFx(a.x, a.y, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 1, i % 2 ? '#9cff5a' : '#5a2a6a', 0.16);
      combat.decals.push({ x: a.x, y: a.y, r: 0.6, goo: true });
      combatBanner('Intruder neutralized'); sfx.win();
    }
  } else if (sab && a.hp === 1 && a.state === 'fight') sabCloak(a);   // nearly done for: it tries to slip away
}

// What one of our bolts does: 1 (a wrench too, but it stuns), heavy blaster shots carry their own damage.
const boltDamage = (b) => b.dmg || 1;
const boltStun = (b) => b.stun ?? (b.wrench ? 1.5 : 0);
// Our bolt's step vs everyone it can hit (the invaders; the pirates, js/dock.js), as they're drawn (segBody: a
// capsule from feet to head, the bolt at its muzzle height b.z): the first one along its path that isn't behind a wall.
const HUMAN_HIT = { r: 0.4, top: 1.05 }, ALIEN_HIT = { r: 0.42, top: 0.45 }, BROOD_HIT = { r: 0.34, top: 0.3 };
function boltHitsBody(b, x0, y0) {
  let best = null, bk = 2;
  const test = (o, H, hit) => {
    const k = segBody(x0, y0, b.x, b.y, b.z, o.x, o.y, H.r, H.top);
    if (k >= 0 && k < bk && freeAt(x0 + (b.x - x0) * k, y0 + (b.y - y0) * k)) { bk = k; best = hit; }
  };
  for (const a of boarding.invaders) if (a.state !== 'entering' && a.mode === 'inside') test(a, a.kind === 'saboteur' ? HUMAN_HIT : ALIEN_HIT, () => hurtInvader(a, boltDamage(b), boltStun(b)));
  if (typeof dk !== 'undefined') for (const p of dk.pirates) if (!p.dead) test(p, HUMAN_HIT, () => hurtPirate(p, boltDamage(b), boltStun(b), b));
  if (typeof levBrood === 'function') for (const w of levBrood()) if (w.hp > 0) test(w, BROOD_HIT, () => levHurtBrood(w, boltDamage(b)));   // the leviathan's brood (js/leviathan.js)
  if (typeof captainBoltTest === 'function') { const C = captainBoltTest(b, x0, y0); if (C && C.k < bk && freeAt(x0 + (b.x - x0) * C.k, y0 + (b.y - y0) * C.k)) { bk = C.k; best = C.hit; } }   // Captain Red Comet: his generator / his shield (js/captain.js)
  if (!best) { if (typeof s7BoltHit === 'function' && s7BoltHit(b, x0, y0)) { b.dead = true; return true; } return false; }   // (S-7's tendrils and creep: js/culture.js)
  b.dead = true; best(); return true;
}
function updateBoarding(dt) {
  updatePods(dt);
  for (const a of boarding.invaders) updateInvader(a, dt);
  boarding.invaders = boarding.invaders.filter(a => !a.dead);
  for (const b of boarding.bolts) {
    const x0 = b.x, y0 = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.wrench) b.spin += dt * 18;
    if (b.fast && !freeAt((x0 + b.x) / 2, (y0 + b.y) / 2)) { b.x = (x0 + b.x) / 2; b.y = (y0 + b.y) / 2; }   // (fast shots: don't skip through a wall)
    if (b.owner === 'crew' && boltHitsBody(b, x0, y0)) continue;   // (before the wall: someone standing right at one)
    if (!freeAt(b.x, b.y)) {                       // hit a wall
      b.dead = true;
      for (let i = 0; i < 5; i++) combatFx(x0, y0, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.3, b.owner === 'alien' ? '#9cff5a' : b.owner === 'saboteur' ? '#5ae0ff' : '#ffb0a0', 0.07);
      continue;
    }
    if (b.owner === 'crew') {
      // a near miss still gets its attention
      for (const a of boarding.invaders) if (a.mode === 'inside' && Math.hypot(a.x - b.x, a.y - b.y) < 1.5) {
        if (a.kind === 'saboteur') sabProvoke(a); else if (a.state === 'wander') { a.state = 'fight'; a.seen = 0; }
      }
    } else {
      const c = crew.find(c => c.mode === 'inside' && segCircle(x0, y0, b.x, b.y, c.x, c.y, 0.35));
      if (c) {
        b.dead = true; combat.hits.crew++; combat.flashes[b.vx > 0 ? 'port' : 'star'] = 1; sfx.hit(false); hurtCrew(c);
        for (let i = 0; i < 10; i++) combatFx(c.x, c.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.5, b.owner === 'saboteur' ? '#5ae0ff' : b.owner === 'alien' ? '#9cff5a' : '#ff8a6a', 0.1);
      }
    }
  }
  boarding.bolts = boarding.bolts.filter(b => !b.dead && b.life > 0);
}

// ---------------------------------------------------------------------------
// Art
// ---------------------------------------------------------------------------
// Top-down alien: plated violet carapace with a spiked ridge and glowing spots, a segmented
// tail with a stinger, six jointed legs with claws, a wedge head with antennae, mandibles and
// three eyes (red when fighting). Its pose telegraphs what it's about to do:
//   ready stance (crouched, legs wide) = it will dodge · head pulled back + glowing throat = spit
//   deep coil + wiggling rear + flashing eyes = pounce · stretched = lunging / leaping · sprawled = recovering
function alienPose(a, t) {
  const p = { crouch: 0, headBack: 0, stretch: 0, throat: 0, wiggle: 0, sprawl: 0, eyeFlash: 0 };
  if (a.state !== 'fight') return p;
  const act = a.act;
  if (!act) p.crouch = 0.6;
  else if (act.kind === 'spit') {
    const k = Math.min(1, act.t / SPIT_WINDUP);
    p.headBack = act.fired ? Math.max(0, 1 - (act.t - SPIT_WINDUP) * 6) * -0.6 : k; p.throat = act.fired ? 0 : k; p.crouch = 0.3;
  } else if (act.kind === 'pounce') {
    if (act.t < POUNCE_WINDUP) { const k = act.t / POUNCE_WINDUP; p.crouch = 0.6 + 0.4 * k; p.wiggle = k; p.eyeFlash = (Math.sin(t * 30) > 0) ? 1 : 0; }
    else p.stretch = 1;
  } else if (act.kind === 'lunge') p.stretch = 0.8;
  else if (act.kind === 'recover') p.sprawl = 1 - act.t / act.len;
  return p;
}

function drawAlienBody(a, t, P) {
  const coil = P.wiggle;                            // pounce windup: squeezed short, legs tucked
  const lenK = (1 - 0.12 * P.crouch - 0.25 * coil) * (1 + 0.45 * P.stretch), spread = 1 + 0.45 * P.crouch - 0.35 * coil + 0.5 * P.sprawl;
  ctx.save(); ctx.translate(-T * 0.12 * P.headBack, 0);   // spit windup: whole body rears back
  const wig = Math.sin(t * 18) * 0.25 * P.wiggle;
  // tail with stinger (behind the abdomen), swishing
  const sw = Math.sin(t * 3 + a.x) * 0.35 + wig;
  ctx.beginPath(); ctx.moveTo(-T * 0.36 * lenK, 0);
  ctx.quadraticCurveTo(-T * 0.55 * lenK, T * 0.12 * sw, -T * 0.66 * lenK, T * 0.22 * sw);
  ctx.strokeStyle = OUT; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = '#5a2a6a'; ctx.lineWidth = 4.5; ctx.stroke();
  ctx.save(); ctx.translate(-T * 0.66 * lenK, T * 0.22 * sw); ctx.rotate(Math.PI + sw * 0.6);
  poly([[0, -4], [11, 0], [0, 4]]); ctx.fillStyle = '#c9b38a'; ctx.fill(); stroke(1.5);
  ctx.restore();
  // legs: coxa, femur, tibia with a hooked claw
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) {
    const ph = Math.sin(a.walk * 1.5 + i * 2 + (sd > 0 ? Math.PI : 0)) * 0.35 * (1 - P.crouch * 0.6);
    const bx = T * (0.1 - i * 0.13) * lenK, by = sd * T * 0.11;
    // ready stance: the front pair is raised forward like a mantis, claws up
    const raise = i === 0 ? P.crouch * (1 - coil) : 0;
    const a1 = sd * ((1.15 + ph) * spread * (1 - raise * 0.75)) + (i - 1) * 0.35 * sd;
    const kx = bx + Math.cos(a1) * T * 0.22, ky = by + Math.sin(a1) * T * 0.22 * spread;
    const a2 = a1 + sd * (0.7 - 0.3 * P.sprawl - raise * 1.3) + (i - 1) * 0.25;
    const fx = kx + Math.cos(a2) * T * 0.22, fy = ky + Math.sin(a2) * T * 0.2;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy);
    ctx.strokeStyle = OUT; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.strokeStyle = '#6a3a7c'; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(kx, ky, 2.6, 0, TAU); ctx.fillStyle = '#9a5ab0'; ctx.fill(); stroke(1);   // knee
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.quadraticCurveTo(fx + Math.cos(a2) * 6, fy + Math.sin(a2) * 6, fx + Math.cos(a2 + sd) * 5, fy + Math.sin(a2 + sd) * 5);
    ctx.strokeStyle = '#c9b38a'; ctx.lineWidth = 2; ctx.stroke();                                   // claw
  }
  // abdomen: plated, with a spiked ridge and glowing spots
  ctx.save(); ctx.translate(-T * 0.2 * lenK, 0); ctx.rotate(wig * 0.5);
  ctx.beginPath(); ctx.ellipse(0, 0, T * 0.25 * lenK, T * 0.19, 0, 0, TAU);
  const g = ctx.createRadialGradient(-T * 0.06, -T * 0.07, 2, 0, 0, T * 0.27);
  g.addColorStop(0, '#b06ac8'); g.addColorStop(0.6, '#6a2e80'); g.addColorStop(1, '#3a1448');
  ctx.fillStyle = g; ctx.fill(); stroke(2.4);
  ctx.strokeStyle = 'rgba(20,6,26,0.55)'; ctx.lineWidth = 1.6;
  for (const k of [-0.12, -0.02, 0.08]) { ctx.beginPath(); ctx.ellipse(T * k * lenK, 0, T * 0.05, T * 0.17, 0, -1.2, 1.2); ctx.stroke(); }
  for (let i = 0; i < 4; i++) {                    // ridge spikes
    const sx = T * (-0.16 + i * 0.09) * lenK;
    poly([[sx - 3, -2], [sx, -9 - (i % 2) * 2], [sx + 3, -2]]); ctx.fillStyle = '#d8c8a0'; ctx.fill(); stroke(1);
  }
  const glow = 0.55 + 0.35 * Math.sin(t * 3 + a.x);
  for (const [gx, gy] of [[-0.14, 0.09], [-0.04, -0.1], [0.06, 0.1], [-0.18, -0.06]]) {
    ctx.beginPath(); ctx.arc(T * gx * lenK, T * gy, 2.6, 0, TAU); ctx.fillStyle = `rgba(156,255,90,${glow})`; ctx.fill();
  }
  ctx.restore();
  // thorax
  ctx.beginPath(); ctx.ellipse(T * 0.05 * lenK, 0, T * 0.13, T * 0.125, 0, 0, TAU);
  const tg = ctx.createLinearGradient(0, -T * 0.13, 0, T * 0.13); tg.addColorStop(0, '#8a4aa0'); tg.addColorStop(1, '#4e2060');
  ctx.fillStyle = tg; ctx.fill(); stroke(2);
  ctx.beginPath(); ctx.arc(T * 0.03 * lenK, -T * 0.04, T * 0.05, Math.PI, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke();
  // head: pulled back to spit, glowing throat
  const hx = T * (0.17 - 0.1 * P.headBack) * lenK;
  if (P.throat > 0) {                              // swelling acid sac under the head
    const gg = ctx.createRadialGradient(hx, 0, 0, hx, 0, T * 0.32);
    gg.addColorStop(0, `rgba(156,255,90,${0.9 * P.throat})`); gg.addColorStop(1, 'rgba(156,255,90,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(hx, 0, T * 0.32, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(hx - T * 0.02, 0, T * (0.06 + 0.07 * P.throat), T * (0.07 + 0.08 * P.throat), 0, 0, TAU);
    ctx.fillStyle = '#9cff5a'; ctx.fill(); stroke(1.8);
  }
  ctx.save(); ctx.translate(hx, 0); ctx.scale(1.3, 1.3);
  for (const sd of [-1, 1]) {                       // antennae
    ctx.beginPath(); ctx.moveTo(T * 0.06, sd * T * 0.05);
    ctx.quadraticCurveTo(T * 0.2, sd * T * (0.16 + 0.03 * Math.sin(t * 4 + sd)), T * 0.3, sd * T * 0.24);
    ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = '#9a5ab0'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  const m = Math.sin(t * 9) * 0.15 + P.throat * 0.45;
  for (const sd of [-1, 1]) {                       // mandibles
    ctx.beginPath(); ctx.moveTo(T * 0.08, sd * T * 0.05); ctx.quadraticCurveTo(T * 0.2, sd * T * (0.1 + m), T * 0.17, sd * T * 0.015);
    ctx.strokeStyle = OUT; ctx.lineWidth = 4.5; ctx.stroke(); ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 2.2; ctx.stroke();
  }
  poly([[-T * 0.04, -T * 0.1], [T * 0.11, -T * 0.06], [T * 0.14, 0], [T * 0.11, T * 0.06], [-T * 0.04, T * 0.1]]);
  ctx.fillStyle = '#4e2a5c'; ctx.fill(); stroke(2);
  const eye = a.state === 'fight' ? (P.eyeFlash ? '255,255,255' : '255,80,60') : '200,255,110';
  for (const [ex, ey, er] of [[0.05, -0.035, 2.6], [0.05, 0.035, 2.6], [0.09, 0, 2]]) {
    const eg = ctx.createRadialGradient(T * ex, T * ey, 0, T * ex, T * ey, 5);
    eg.addColorStop(0, `rgba(${eye},0.6)`); eg.addColorStop(1, `rgba(${eye},0)`);
    ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(T * ex, T * ey, 5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(T * ex, T * ey, er * 0.8, 0, TAU); ctx.fillStyle = `rgb(${eye})`; ctx.fill(); stroke(0.8);
  }
  ctx.restore();
  ctx.restore();
}

// The intruder as a sprite (chars/alien/*, models/chars/alien.py): which set and frame for its state,
// and the eye colour through the tint mask (green wandering, red fighting, flashing white while it
// coils to pounce). Walk frames follow the distance travelled (a.walk grows 4 per unit; one cycle =
// 0.68 units, 0.44 in the crouched ready stance). Returns [name, frame, eyes].
const ALIEN_WALK_CYCLE = 0.68, ALIEN_EYES = { wander: '#c8ff6e', fight: '#ff503c', flash: '#ffffff' };
const alienAnim = new Map();
function alienSprite(a, t, P) {
  let m = alienAnim.get(a.uid);
  if (!m) alienAnim.set(a.uid, m = { walk: a.walk, moving: 0 });
  m.moving = Math.abs(a.walk - m.walk) > 1e-4 ? 0.12 : Math.max(0, m.moving - 1 / 60);
  m.walk = a.walk;
  const fight = a.state === 'fight', eyes = P.eyeFlash ? ALIEN_EYES.flash : fight ? ALIEN_EYES.fight : ALIEN_EYES.wander;
  const walkF = (cycle) => Math.floor((a.walk / 4 / cycle) * 8);
  const act = a.act;
  if (a.state === 'entering') return a.hatch.locked ? ['chars/alien/sabotage', Math.floor(t * 6), eyes] : ['chars/alien/walk', Math.floor(t * 12), eyes];
  if (a.stun > 0) return ['chars/alien/stunned', Math.floor(t * 6), eyes];
  if (a.state === 'dormant') return ['chars/alien/dormant', 0, eyes];
  if (fight && act) {
    if (act.kind === 'spit') return ['chars/alien/spit', act.fired ? 4 : Math.min(3, Math.floor(act.t / SPIT_WINDUP * 4)), eyes];
    if (act.kind === 'pounce') return act.t < POUNCE_WINDUP ? ['chars/alien/coil', Math.floor(t * 14), eyes] : ['chars/alien/leap', 0, eyes];
    if (act.kind === 'lunge') return ['chars/alien/leap', 0, eyes];
    if (act.kind === 'recover') return ['chars/alien/sprawl', 0, eyes];
  }
  if (fight) return ['chars/alien/ready', m.moving > 0 ? walkF(ALIEN_WALK_CYCLE * 0.65) : 0, eyes];
  if (a.bash > 0 && a.stuck > 0) return ['chars/alien/sabotage', Math.floor(t * 6), eyes];   // bashing a door
  return m.moving > 0 ? ['chars/alien/walk', walkF(ALIEN_WALK_CYCLE), eyes] : ['chars/alien/idle', 0, eyes];
}
function drawAlienSprite(a, t, P) {
  if (!GFX.on) return false;
  const [name, f, eyes] = alienSprite(a, t, P), k = GFX.frameIndex(name, a.face, f);
  if (!GFX.sprite(name, k, a.x, a.y, 0, { tint: eyes, emissive: 0.45, pick: [0.45, 0.8] })) return false;
  if (a.act?.kind === 'lunge' || (a.act?.kind === 'pounce' && P.stretch)) {      // motion ghosts
    const dir = a.act.kind === 'lunge' ? a.act.dir : [Math.cos(a.face), Math.sin(a.face)];
    for (let i = 3; i >= 1; i--) GFX.sprite(name, k, a.x - dir[0] * i * 0.21, a.y - dir[1] * i * 0.21, 0, { tint: eyes, alpha: 0.12 * (4 - i), depthWrite: false, sortY: a.y - 0.01 });
  }
  return true;
}

function drawAlien(a, t) {
  const x = L(a.x), y = L(a.y), P = alienPose(a, t);
  if (drawAlienSprite(a, t, P)) {                    // procedural on top: hurt flash, stun stars, health pips
    const lz = GFX.lift(0.35);
    if (a.flash > 0) {
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,255,255,${a.flash * 0.35})`;
      ctx.beginPath(); ctx.ellipse(x, L(a.y - lz), T * 0.45, T * 0.3, 0, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (a.stun > 0) for (let i = 0; i < 3; i++) {
      const q = t * 4 + i * TAU / 3;
      ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(x + Math.cos(q) * 12, L(a.y - GFX.lift(0.8)) + Math.sin(q) * 4, 2.5, 0, TAU); ctx.fill();
    }
    if (a.hp < ALIEN_HP) upright(camera(), a.x, a.y, 0.95, () => {
      for (let i = 0; i < ALIEN_HP; i++) { ctx.fillStyle = i < a.hp ? '#9cff5a' : '#2b303a'; ctx.fillRect(-15 + i * 5, 0, 4, 3); }
    });
    return;
  }
  if (a.act?.kind === 'lunge' || (a.act?.kind === 'pounce' && P.stretch)) {      // motion ghosts
    const dir = a.act.kind === 'lunge' ? a.act.dir : [Math.cos(a.face), Math.sin(a.face)];
    for (let i = 3; i >= 1; i--) {
      ctx.save(); ctx.globalAlpha = 0.12 * (4 - i); ctx.translate(x - dir[0] * i * 10, y - dir[1] * i * 10); ctx.rotate(a.face);
      drawAlienBody(a, t, P); ctx.restore();
    }
  }
  ctx.save(); ctx.translate(x, y);
  shadowEllipse(3, 5, T * (0.34 + 0.06 * P.crouch), T * 0.26, 0.4);
  ctx.rotate(a.face);
  drawAlienBody(a, t, P);
  if (a.flash > 0) {
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,255,255,${a.flash * 0.35})`;
    ctx.beginPath(); ctx.ellipse(-T * 0.05, 0, T * 0.4, T * 0.22, 0, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  if (a.stun > 0) {                                  // dazed stars
    for (let i = 0; i < 3; i++) {
      const q = t * 4 + i * TAU / 3;
      ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(x + Math.cos(q) * 12, y - 18 + Math.sin(q) * 4, 2.5, 0, TAU); ctx.fill();
    }
  }
  if (a.hp < ALIEN_HP) {                             // health pips
    for (let i = 0; i < ALIEN_HP; i++) { ctx.fillStyle = i < a.hp ? '#9cff5a' : '#2b303a'; ctx.fillRect(x - 15 + i * 5, y - 28, 4, 3); }
  }
}

// Dead intruders: the corpse sprite on each goo decal hurtInvader leaves (sprites only; the 2D view
// has just the goo, drawn by drawShipDecals).
function drawAlienCorpses() {
  if (!GFX.on) return;
  for (const d of combat.decals) if (d.goo) {
    const dir = Math.floor(((d.x * 7.3 + d.y * 3.1) % 8 + 8) % 8);
    GFX.sprite('chars/alien/dead', GFX.frameIndex('chars/alien/dead', dir * Math.PI / 4), d.x, d.y, 0, { tint: '#3a4a30', sortY: d.y - 0.4 });
  }
}

// Saboteur (chars/saboteur/*, models/chars/saboteur.py): slim infiltrator in a charcoal stealth suit,
// visor slit and seam lights through the tint mask (cyan sneaking / working, red fighting). Cloaking
// fades it out (it's gone while it sneaks), decloaking fades it in. While it aims: a laser sight.
const SAB_LIGHT = { calm: '#5ae0ff', fight: '#ff4a3a' }, SAB_GUN_Z = 1.0;
function sabAlpha(a) {
  if (a.state === 'sneak') return 0;
  if (a.state === 'cloak') return Math.max(0, 1 - a.t / SAB_FADE) * (0.75 + 0.25 * Math.sin(a.t * 40));
  if (a.state === 'decloak') return Math.min(1, a.t / SAB_FADE) * (0.75 + 0.25 * Math.sin(a.t * 40));
  return 1;
}
function sabSprite(a, t) {
  const moving = actorMoving(a.uid, a.walk), wf = Math.floor((a.walk / 4 / ALIEN_WALK_CYCLE) * 8);
  if (a.state === 'entering') return a.hatch.locked ? ['chars/saboteur/sabotage', Math.floor(t * 8)] : ['chars/saboteur/walk', Math.floor(t * 12)];
  if (a.stun > 0) return ['chars/saboteur/stunned', Math.floor(t * 2.5)];
  if (a.state === 'work') return ['chars/saboteur/sabotage', Math.floor(t * 8)];
  if (a.act?.kind === 'aim') return ['chars/saboteur/aim', 0];
  return moving ? ['chars/saboteur/walk', wf] : ['chars/saboteur/idle', 0];
}
function drawSaboteurBody(a, t, light) {            // 2D fallback (classic view, or while the sprites load), facing +x
  shadowEllipse(2, 4, T * 0.26, T * 0.2, 0.35);
  ctx.rotate(a.face);
  const crouch = a.state === 'work' ? 0.85 : 1, sw = Math.sin(a.walk * 1.6) * 0.18 * (a.state === 'work' ? 0 : 1);
  ctx.fillStyle = '#23282f';                          // legs
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(T * sd * sw * 0.6, sd * T * 0.08, T * 0.11, T * 0.06, 0, 0, TAU); ctx.fill(); stroke(1.2); }
  ctx.fillStyle = '#2e353e'; ctx.fillRect(-T * 0.26, -T * 0.13, T * 0.12, T * 0.26); stroke(1.2);   // cloak emitter pack
  ctx.beginPath(); ctx.arc(-T * 0.2, 0, T * 0.05, 0, TAU); ctx.strokeStyle = light; ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-T * 0.02, 0, T * 0.15 * crouch, T * 0.2, 0, 0, TAU);   // shoulders
  const g = ctx.createLinearGradient(0, -T * 0.2, 0, T * 0.2); g.addColorStop(0, '#47505c'); g.addColorStop(1, '#262c34');
  ctx.fillStyle = g; ctx.fill(); stroke(2);
  ctx.strokeStyle = light; ctx.lineWidth = 1.4; ctx.globalAlpha *= 0.8;          // seam lights
  ctx.beginPath(); ctx.moveTo(-T * 0.1, -T * 0.16); ctx.lineTo(T * 0.06, -T * 0.12); ctx.moveTo(-T * 0.1, T * 0.16); ctx.lineTo(T * 0.06, T * 0.12); ctx.stroke();
  ctx.globalAlpha /= 0.8;
  const arm = a.act?.kind === 'aim' ? 1 : a.state === 'work' ? 0.6 : 0;
  if (arm) {                                          // pistol arm forward (aiming), or both hands at the part
    ctx.strokeStyle = '#2b3139'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, T * 0.12); ctx.lineTo(T * 0.32 * arm, T * 0.04); ctx.stroke();
    if (a.state === 'work') { ctx.beginPath(); ctx.moveTo(0, -T * 0.12); ctx.lineTo(T * 0.28, -T * 0.04 + Math.sin(t * 20) * 2); ctx.stroke(); }
    else { ctx.fillStyle = '#15181d'; ctx.fillRect(T * 0.3, T * 0.01, T * 0.12, T * 0.06); }
  }
  ctx.beginPath(); ctx.arc(T * 0.04, 0, T * 0.11, 0, TAU); ctx.fillStyle = '#323943'; ctx.fill(); stroke(1.8);   // helmet
  ctx.beginPath(); ctx.arc(T * 0.04, 0, T * 0.085, -0.7, 0.7); ctx.strokeStyle = light; ctx.lineWidth = 3; ctx.stroke();   // visor slit
}
function drawSaboteur(a, t) {
  const alpha = sabAlpha(a), light = a.state === 'fight' ? SAB_LIGHT.fight : SAB_LIGHT.calm;
  if (alpha <= 0.01) return;
  let sprited = false;
  if (GFX.on) {
    const [name, f] = sabSprite(a, t);
    sprited = GFX.sprite(name, GFX.frameIndex(name, a.face, f), a.x, a.y, 0, { tint: light, emissive: 0.5, alpha, pick: [0.32, 1.2], depthWrite: alpha > 0.9 });
    if (!sprited) {                                    // stand-in until its own sprites are packed: a ghostly grey suit, crew suit sprite
      const sn = name === 'chars/saboteur/walk' ? 'crew/run' : 'crew/idle';
      sprited = GFX.sprite(sn, GFX.frameIndex(sn, a.face, sn === 'crew/run' ? f : 0), a.x, a.y, 0, { tint: '#3a4048', desat: 1, alpha: alpha * 0.6, pick: [0.32, 1.2], depthWrite: false });
      if (sprited && alpha > 0.3) {                    // its visor slit glowing through
        const [vx, vy] = [L(a.x + Math.cos(a.face) * 0.12), L(a.y + Math.sin(a.face) * 0.05 - GFX.lift(1.05))];
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha;
        const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, L(0.3)); g.addColorStop(0, light); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(vx, vy, L(0.3), 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
    }
  }
  const lz = sprited ? GFX.lift(SAB_GUN_Z) : 0;
  if (a.act?.kind === 'aim' && !a.act.fired) {        // laser sight: faint, then bright and flickering just before the shot
    const k = a.act.t / SAB_AIM, hot = k > 0.65;
    let len = 0; while (len < 14 && freeAt(a.x + Math.cos(a.face) * len, a.y + Math.sin(a.face) * len)) len += 0.1;
    ctx.beginPath(); ctx.moveTo(L(a.x + Math.cos(a.face) * 0.4), L(a.y + Math.sin(a.face) * 0.4 - lz)); ctx.lineTo(L(a.x + Math.cos(a.face) * len), L(a.y + Math.sin(a.face) * len - lz));
    ctx.strokeStyle = hot ? `rgba(255,${Math.sin(t * 40) > 0 ? 70 : 170},70,0.9)` : 'rgba(90,224,255,0.35)'; ctx.lineWidth = hot ? 2.5 : 1.2; ctx.stroke();
  }
  if (!sprited) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(L(a.x), L(a.y));
    drawSaboteurBody(a, t, light);
    ctx.restore();
  }
  const view = camera(), up = sprited ? 1.35 : 0.75;
  if (a.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${a.flash * 0.4})`; ctx.beginPath(); ctx.ellipse(L(a.x), L(a.y - (sprited ? GFX.lift(0.65) : 0)), L(0.3), L(sprited ? 0.55 : 0.3), 0, 0, TAU); ctx.fill(); }
  if (a.stun > 0) for (let i = 0; i < 3; i++) {
    const q = t * 4 + i * TAU / 3;
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(L(a.x) + Math.cos(q) * 12, L(a.y - (sprited ? GFX.lift(1.3) : 0.6)) + Math.sin(q) * 4, 2.5, 0, TAU); ctx.fill();
  }
  if (a.hp < SAB_HP && alpha > 0.5) {
    const pips = () => { for (let i = 0; i < SAB_HP; i++) { ctx.fillStyle = i < a.hp ? '#5ae0ff' : '#2b303a'; ctx.fillRect(-8 + i * 6, 0, 5, 3); } };
    if (sprited) upright(view, a.x, a.y, up, pips); else { ctx.save(); ctx.translate(L(a.x), L(a.y) - L(0.5)); pips(); ctx.restore(); }
  }
}
// A dead saboteur lies where it fell (the decal hurtInvader leaves).
function drawSaboteurCorpses() {
  for (const d of combat.decals) if (d.body === 'saboteur') {
    if (GFX.on && GFX.sprite('chars/saboteur/down', GFX.frameIndex('chars/saboteur/down', d.face || 0), d.x, d.y, 0, { tint: '#203038', sortY: d.y - 0.4 })) continue;
    ctx.save(); ctx.translate(L(d.x), L(d.y)); ctx.globalAlpha = 0.9;
    drawSaboteurBody({ face: d.face || 0, walk: 0, state: 'down' }, 0, '#203038'); ctx.restore();
  }
}

// A thrown wrench (sprite mode): items/wrench, 16 spin angles (dir i = turned to i * 22.5 deg), lying flat at
// its flight height b.z, lit like the rest. The nearest angle, turned on screen by what's left to b.spin, so
// it spins smoothly instead of in 22.5 deg steps. (The asteroids instead spin about the view axis: one picture, js/enemies.js drawAsteroidSprite.)
function drawWrenchSprite(b) {
  if (!GFX.on || !GFX.ready('items/wrench')) return false;
  const step = TAU / 16, i = Math.round(b.spin / step);
  return GFX.sprite('items/wrench', ((i % 16) + 16) % 16, b.x, b.y, b.z || 0, { rot: b.spin - i * step, emissive: 0.15, sortY: b.y });
}
// The cargo pods (cargo/pod_<v> frames 0-3: at rest, then three bulges; cargo/pod_<v>_open: the burst shell,
// models/cargo/pod.py). Sealed, one twitches now and then (just a look: nothing happens yet); stirring, it bulges
// faster and faster and shudders. 2D fallback: a strapped capsule, a torn one with goo once open.
function podPose(p, t) {
  if (p.state === 'open') return { f: 0, dx: 0 };
  if (p.state === 'stir' && p.t >= 0) {
    const k = clamp(p.t / POD_STIR, 0, 1);
    return { f: 1 + Math.floor(t * (5 + 9 * k) + p.id) % 3, dx: Math.sin(t * 47) * 0.025 * (0.4 + k) };
  }
  const ph = (t * 0.12 + p.id * 0.43) % 1;           // a twitch every ~8 s, half a second long
  return { f: ph < 0.06 ? 1 + Math.floor(ph / 0.02) % 3 : 0, dx: 0 };
}
function drawCargoPods(t) {
  for (const p of boarding.pods) {
    const P = podPose(p, t), name = p.state === 'open' ? `cargo/pod_${p.id % 2}_open` : `cargo/pod_${p.id % 2}`;
    if (GFX.on && GFX.sprite(name, Math.min(P.f, (GFX.info(name)?.frames || 1) - 1), p.x + P.dx, p.y, 0, { emissive: 0.5, sortY: p.y })) continue;
    const x = L(p.x + P.dx), y = L(p.y), w = L(POD_W), h = L(POD_H), b = P.f ? 1 + 0.05 * (P.f === 2 ? 1.6 : 1) : 1;
    ctx.save(); ctx.translate(x, y);
    shadowEllipse(3, 4, w * 0.5, h * 0.5, 0.35);
    if (p.state === 'open') {                         // the burst shell: torn edges, goo
      stain(0, L(0.15), L(0.55), 'rgba(120,220,70,0.45)', p.id * 7 + 3);
      rr(-w / 2, -h / 2, w, h, h * 0.45); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(2);
      ctx.beginPath(); ctx.ellipse(0, 0, w * 0.36, h * 0.3, 0, 0, TAU); ctx.fillStyle = '#1b2016'; ctx.fill();
      ctx.fillStyle = '#c98a4a';
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; ctx.beginPath(); ctx.moveTo(Math.cos(a) * w * 0.3, Math.sin(a) * h * 0.26); ctx.lineTo(Math.cos(a + 0.25) * w * 0.48, Math.sin(a + 0.25) * h * 0.5); ctx.lineTo(Math.cos(a + 0.5) * w * 0.3, Math.sin(a + 0.5) * h * 0.26); ctx.fill(); stroke(1.2); }
    } else {
      rr(-w / 2, -h / 2, w, h, h * 0.45); ctx.fillStyle = '#6a6f7a'; ctx.fill(); stroke(2);
      ctx.save(); ctx.scale(b, b); ctx.beginPath(); ctx.ellipse(0, 0, w * 0.3, h * 0.28, 0, 0, TAU);
      ctx.fillStyle = `rgba(232,150,70,${0.75 + 0.2 * Math.sin(t * 2 + p.id)})`; ctx.fill(); stroke(1.5); ctx.restore();
      ctx.fillStyle = '#e8c34f'; for (const sx of [-0.32, 0.32]) { ctx.fillRect(sx * w - L(0.05), -h / 2 - 1, L(0.1), h + 2); }
    }
    ctx.restore();
  }
}
function drawBoarding(t) {
  drawCargoPods(t);
  drawAlienCorpses();
  drawSaboteurCorpses();
  for (const a of boarding.invaders) {
    if (a.task?.kind === 'sabotage' && a.state === 'work') glowLayer(() => {   // progress ring round its feet (on the floor; big parts would hide one on the part)
      ctx.beginPath(); ctx.arc(L(a.x), L(a.y), L(0.6), -Math.PI / 2, -Math.PI / 2 + (a.task.t / a.task.need) * TAU);
      ctx.strokeStyle = 'rgba(20,22,27,0.6)'; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = SAB_LIGHT.calm; ctx.lineWidth = 4; ctx.stroke();
    });
    if (a.kind === 'saboteur') drawSaboteur(a, t); else drawAlien(a, t);
  }
  for (const b of boarding.bolts) {
    const by = b.y - GFX.lift(b.z || 0);           // (our shots fly at the height of the muzzle they left: b.z)
    if (b.wrench) { if (!drawWrenchSprite(b)) wrench(L(b.x), L(by), b.spin); continue; }
    if (b.owner === 'captain' && typeof drawCaptainBolt === 'function' && drawCaptainBolt(b)) continue;   // (his pellets and spin bolts: js/captain.js)
    const crew = b.owner === 'crew' || b.owner === 'pirate' || b.owner === 'sentry' || b.owner === 'captain', sp = Math.hypot(b.vx, b.vy), dx = b.vx / sp, dy = b.vy / sp;
    if (crew) {                                      // laser bolt: bright red streak (a pirate's fast shot: a long one)
      // (the streak's tail: no further back than where it left the muzzle)
      const len0 = b.fast ? 2.2 : 0.7, len = b.ox != null ? Math.min(len0, Math.hypot(b.x - b.ox, b.y - b.oy)) : len0, w = b.heavy ? 2.2 : b.dmg === 2 ? 1.5 : 1;   // heavy blaster: fatter (a charged blast: blue-white)
      ctx.beginPath(); ctx.moveTo(L(b.x), L(by)); ctx.lineTo(L(b.x - dx * len), L(by - dy * len));
      ctx.strokeStyle = b.heavy ? 'rgba(120,200,255,0.55)' : 'rgba(255,80,60,0.5)'; ctx.lineWidth = 7 * w; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = b.heavy ? '#f0f8ff' : '#ffe0d8'; ctx.lineWidth = 2.5 * w; ctx.stroke();
    } else if (b.owner === 'saboteur') {             // the saboteur's shot: a slow, fat cyan plasma ball (easy to see coming)
      const pulse = 0.8 + 0.2 * Math.sin(b.life * 30);
      for (let i = 3; i >= 0; i--) {
        ctx.beginPath(); ctx.arc(L(b.x - dx * i * 0.18), L(b.y - dy * i * 0.18), (7 - i * 1.4) * pulse, 0, TAU);
        ctx.fillStyle = i ? `rgba(90,224,255,${0.45 - i * 0.1})` : '#e8fbff'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(L(b.x), L(b.y), 7 * pulse, 0, TAU); ctx.strokeStyle = 'rgba(90,224,255,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    } else {                                         // acid spit: green glob with a trail
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(L(b.x - dx * i * 0.15), L(b.y - dy * i * 0.15), 6 - i * 1.6, 0, TAU);
        ctx.fillStyle = `rgba(156,255,90,${0.9 - i * 0.25})`; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(L(b.x), L(b.y), 6, 0, TAU); stroke(1.5);
    }
  }
}
