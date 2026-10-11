// Alien invader: forces its way in through a side outer airlock, then roams the ship room
// by room (using the deck airlocks like the crew does). Once you attack it, it fights:
// keeps its distance, strafes, sidesteps incoming shots and spits acid back.
// Also holds the indoor projectiles (laser bolts, thrown wrenches, acid spit).

const ALIEN_HP = 6, ALIEN_SPEED = 2.6;              // footprint is the crew's (CREW_R), so it fits doors and airlocks
const ENGAGE_RANGE = 4.5, SABOTAGE_TIME = 10;
const SPIT_SPEED = 9, SPIT_COOLDOWN = [1.6, 2.6], SPIT_WINDUP = 0.7, DODGE_SPEED = 9, DODGE_TIME = 0.25, DODGE_COOLDOWN = 2.2;
const POUNCE_RANGE = 3.4, POUNCE_WINDUP = 0.65, POUNCE_TIME = 0.32, POUNCE_SPEED = 12;

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
const freeAt = (x, y) => walkRects().some(r => inRect(x, y, r)) || !pointInPoly(x, y);   // projectile space

// ---------------------------------------------------------------------------
// Invaders
// ---------------------------------------------------------------------------
function spawnInvader(side) {
  const h = HATCHES.find(h => h.side === side);
  boarding.invaders.push({
    uid: newUid(), x: h.outside[0], y: h.outside[1], vx: 0, vy: 0, face: h.dir < 0 ? 0 : Math.PI, walk: 0, mode: 'outside',
    state: 'entering', hatch: h, t: 0, hp: ALIEN_HP, path: [], linger: 0, stuck: 0,
    spitT: 1.5, lockedOut: 0, act: null, dodgeCd: 0, strafe: Math.random() < 0.5 ? 1 : -1, stun: 0, seen: 0, flash: 0,
  });
  combatBanner(`Intruder alert — something is coming in through the ${side === 'port' ? 'left' : 'right'} airlock!`);
  sfx.hatch();
}

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

function updateInvader(a, dt) {
  a.flash = Math.max(0, a.flash - dt * 4);
  if (a.state === 'entering') {                    // forcing the outer airlock open
    if (a.hatch.locked) {                          // locked by security: it has to bash it open first
      a.bash = (a.bash || 0) + dt;
      if (Math.floor(a.bash / 0.7) !== Math.floor((a.bash - dt) / 0.7)) {
        sfx.clank();
        for (let i = 0; i < 5; i++) combatFx(a.hatch.x, a.hatch.y, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.3, '#ffd28a', 0.07);
      }
      if (a.bash >= 8) { a.hatch.locked = false; combatBanner(`The intruder bashed the ${a.hatch.side === 'port' ? 'left' : 'right'} airlock open!`); }
      return;
    }
    a.t += dt;
    const k = a.t / HATCH_TIME, h = a.hatch;
    h.open = Math.max(h.open, Math.sin(Math.PI * clamp(k, 0, 1)));
    const q = clamp((k - 0.25) / 0.5, 0, 1);
    a.x = lerp(h.outside[0], h.inside[0], q); a.y = lerp(h.outside[1], h.inside[1], q);
    if (k >= 1) { a.state = 'wander'; a.mode = 'inside'; }
    return;
  }
  if (a.stun > 0) { a.stun -= dt; return; }
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
    if (a.seen > 6 || player.mode !== 'inside') { a.state = 'wander'; a.path = []; a.task = null; a.doneRoom = null; a.act = null; return; }
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
          boarding.bolts.push({ x: a.x + ux * 0.4, y: a.y + uy * 0.4, vx: ux * SPIT_SPEED, vy: uy * SPIT_SPEED, life: 1.6, owner: 'alien' });
          sfx.spit();
        }
        if (act.t >= SPIT_WINDUP + 0.35) a.act = null;
      } else if (act.kind === 'pounce') {            // coils up (rear wiggles), then leaps at where you stood
        if (act.t < POUNCE_WINDUP) { a.face = Math.atan2(dy, dx); act.to = [player.x, player.y]; }
        else {
          const [tx, ty] = act.to, td = Math.hypot(tx - a.x, ty - a.y);
          if (!act.leapt) { act.leapt = true; sfx.alienHurt(); }
          if (td > 0.2) alienStep(a, (tx - a.x) / td * POUNCE_SPEED, (ty - a.y) / td * POUNCE_SPEED, dt);
          if (!act.hit && Math.hypot(player.x - a.x, player.y - a.y) < 0.55) {
            act.hit = true; combat.hits.crew++; combat.flashes[player.x < a.x ? 'port' : 'star'] = 1; sfx.hit(true); hurtCrew(player);
            for (let i = 0; i < 12; i++) combatFx(player.x, player.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.5, '#e2574c', 0.11);
            const kx = player.x + ux * 0.9, ky = player.y + uy * 0.9;                  // knocked back
            if (canStand(kx, ky, walkRects())) { player.x = kx; player.y = ky; }
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
    const want = d > 6 ? 1 : d < 4 ? -0.6 : 0;
    if (Math.random() < dt * 0.4) a.strafe *= -1;
    const vx = ux * want * ALIEN_SPEED + -uy * a.strafe * ALIEN_SPEED * 0.8, vy = uy * want * ALIEN_SPEED + ux * a.strafe * ALIEN_SPEED * 0.8;
    if (alienStep(a, vx, vy, dt) < 0.01 * dt) a.strafe *= -1;
    a.face = Math.atan2(dy, dx);
    return;
  }

  // engage when the crew gets close
  if (seesPlayer && Math.hypot(player.x - a.x, player.y - a.y) < ENGAGE_RANGE) { a.state = 'fight'; a.seen = 0; a.task = null; return; }
  if (a.linger > 0) { a.linger -= dt; return; }
  // routine: go to an adjacent room, sabotage a part there (SABOTAGE_TIME), move on, repeat
  if (a.task?.kind === 'sabotage') {
    const sys = a.task.sys;
    a.face = Math.atan2(sys.y - a.y, sys.x - a.x); a.walk += dt * 6;
    const before = a.task.t; a.task.t += dt;
    if (Math.floor(a.task.t / 0.8) !== Math.floor(before / 0.8)) {
      sfx.spark();
      for (let i = 0; i < 4; i++) combatFx(sys.x + (Math.random() - 0.5) * 0.6, sys.y + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 3, -Math.random() * 3, 0.4, '#9cff5a', 0.07);
    }
    if (sys.broken) { a.task = null; return; }
    if (a.task.t >= SABOTAGE_TIME) { breakSystem(sys); combatBanner(`The intruder sabotaged the ${sys.name.toLowerCase()}!`); a.task = null; a.linger = 1; }
    return;
  }
  if (a.task?.kind === 'approach') {
    const [sx, sy] = a.task.spot, sys = a.task.sys;
    const moved = alienMove(a, sx, sy, ALIEN_SPEED * 0.75, dt);
    const close = Math.hypot(sx - a.x, sy - a.y) < 0.25;
    a.task.stuck = moved < 0.002 ? (a.task.stuck || 0) + dt : 0;
    if (close || (a.task.stuck > 1.5 && Math.hypot(sys.x - a.x, sys.y - a.y) < 2.8)) a.task = { kind: 'sabotage', sys, t: 0 };
    else if (a.task.stuck > 4) a.task = null;
    return;
  }
  if (!a.path.length) {
    const room = roomAt(a.x, a.y) || NAV.nodes[nearestNav(a.x, a.y)].room && ROOMS.find(r => r.id === NAV.nodes[nearestNav(a.x, a.y)].room) || ROOMS[0];
    if (a.doneRoom !== room.id) {                   // new room: find something to break
      a.doneRoom = room.id;
      const pool = SYSTEMS.filter(s => !s.broken && sysRooms(s).includes(room));
      const target = pool[Math.floor(Math.random() * pool.length)];
      const spot = target && sabotageSpot(target, room);
      if (spot) { a.task = { kind: 'approach', sys: target, spot }; return; }
    }
    const next = adjacentRooms(room).filter(r => r.id !== a.prevRoom);
    const to = (next.length ? next : adjacentRooms(room))[Math.floor(Math.random() * (next.length || adjacentRooms(room).length))];
    a.prevRoom = room.id;
    a.path = navPath(nearestNav(a.x, a.y), NAV.roomNode[to.id]);
    if (!a.path.length) { a.linger = 1.5; if (++a.lockedOut >= 2) { a.doneRoom = null; a.lockedOut = 0; } return; }
  }
  const n = NAV.nodes[a.path[0]];
  const moved = alienMove(a, n.x, n.y, ALIEN_SPEED * 0.75, dt);
  if (Math.hypot(n.x - a.x, n.y - a.y) < 0.15) {
    a.path.shift(); a.stuck = 0;
    if (n.lock) a.linger = 0.3;
  } else if (moved < 0.002) {                       // blocked (closed door): wait, try another route, then bash
    a.stuck += dt;
    // Doors locked by security contain it: it never bashes those, it tries elsewhere, and if every way
    // out is locked it keeps wrecking the room it's shut in. Broken / jammed doors it bashes open.
    const lock = lockAround(a), door = lock ? { lock, side: n.y < (SPINE_Y0 + SPINE_Y1) / 2 ? 'top' : 'bottom' } : blockingDoor(a);
    const locked = door && (door.doorway?.locked || door.doorway?.blast || door.lock?.locked);
    if (locked && a.stuck > 2) {
      a.path = []; a.stuck = 0; a.linger = 1.5;
      if (++a.lockedOut >= 2) { a.doneRoom = null; a.lockedOut = 0; }   // can't get out: break something else in here
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
  a.hp -= dmg; a.flash = 1; a.stun = Math.max(a.stun, stun);
  if (a.state !== 'entering') { a.state = 'fight'; a.seen = 0; a.task = null; }
  for (let i = 0; i < 8; i++) combatFx(a.x, a.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.5, '#9cff5a', 0.1);
  sfx.alienHurt();
  if (a.hp <= 0) {
    a.dead = true;
    for (let i = 0; i < 30; i++) combatFx(a.x, a.y, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 1, i % 2 ? '#9cff5a' : '#5a2a6a', 0.16);
    combat.decals.push({ x: a.x, y: a.y, r: 0.6, goo: true });
    combatBanner('Intruder neutralized'); sfx.win();
  }
}

function updateBoarding(dt) {
  for (const a of boarding.invaders) updateInvader(a, dt);
  boarding.invaders = boarding.invaders.filter(a => !a.dead);
  for (const b of boarding.bolts) {
    const x0 = b.x, y0 = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (b.wrench) b.spin += dt * 18;
    if (!freeAt(b.x, b.y)) {                       // hit a wall
      b.dead = true;
      for (let i = 0; i < 5; i++) combatFx(x0, y0, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.3, b.owner === 'alien' ? '#9cff5a' : '#ffb0a0', 0.07);
      continue;
    }
    if (b.owner === 'crew') {
      for (const a of boarding.invaders) {
        if (a.state !== 'entering' && segCircle(x0, y0, b.x, b.y, a.x, a.y, 0.42)) { b.dead = true; hurtInvader(a, b.wrench ? 3 : 1, b.wrench ? 1.5 : 0); break; }
      }
      // a near miss still gets its attention
      for (const a of boarding.invaders) if (a.state === 'wander' && Math.hypot(a.x - b.x, a.y - b.y) < 1.5) { a.state = 'fight'; a.seen = 0; a.task = null; }
    } else {
      const c = crew.find(c => c.mode === 'inside' && segCircle(x0, y0, b.x, b.y, c.x, c.y, 0.35));
      if (c) {
        b.dead = true; combat.hits.crew++; combat.flashes[b.vx > 0 ? 'port' : 'star'] = 1; sfx.hit(false); hurtCrew(c);
        for (let i = 0; i < 10; i++) combatFx(c.x, c.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.5, '#9cff5a', 0.1);
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

function drawAlien(a, t) {
  const x = L(a.x), y = L(a.y), P = alienPose(a, t);
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

function drawBoarding(t) {
  for (const a of boarding.invaders) {
    if (a.task?.kind === 'sabotage') {               // green progress ring on the part it's wrecking
      const sys = a.task.sys;
      ctx.beginPath(); ctx.arc(L(sys.x), L(sys.y), L(0.9), -Math.PI / 2, -Math.PI / 2 + (a.task.t / SABOTAGE_TIME) * TAU);
      ctx.strokeStyle = 'rgba(20,22,27,0.6)'; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = '#9cff5a'; ctx.lineWidth = 4; ctx.stroke();
    }
    drawAlien(a, t);
  }
  for (const b of boarding.bolts) {
    if (b.wrench) { wrench(L(b.x), L(b.y), b.spin); continue; }
    const crew = b.owner === 'crew' || b.owner === 'pirate', sp = Math.hypot(b.vx, b.vy), dx = b.vx / sp, dy = b.vy / sp;
    if (crew) {                                      // laser bolt: bright red streak
      ctx.beginPath(); ctx.moveTo(L(b.x), L(b.y)); ctx.lineTo(L(b.x - dx * 0.7), L(b.y - dy * 0.7));
      ctx.strokeStyle = 'rgba(255,80,60,0.5)'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = '#ffe0d8'; ctx.lineWidth = 2.5; ctx.stroke();
    } else {                                         // acid spit: green glob with a trail
      for (let i = 0; i < 3; i++) {
        ctx.beginPath(); ctx.arc(L(b.x - dx * i * 0.15), L(b.y - dy * i * 0.15), 6 - i * 1.6, 0, TAU);
        ctx.fillStyle = `rgba(156,255,90,${0.9 - i * 0.25})`; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(L(b.x), L(b.y), 6, 0, TAU); stroke(1.5);
    }
  }
}
