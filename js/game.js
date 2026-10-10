// World simulation, input, camera and rendering.

const canvas = document.getElementById('c');
ctx = canvas.getContext('2d');
let VW = 0, VH = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  canvas.width = VW * DPR; canvas.height = VH * DPR;
  canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
}
window.addEventListener('resize', resize); resize();

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------
const keys = new Set(), pressed = new Set();
const mouse = { x: 0, y: 0, down: false, wx: 0, wy: 0 };
window.addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });
canvas.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
canvas.addEventListener('mousedown', () => { mouse.down = true; });
window.addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
const held = (...codes) => codes.some(c => keys.has(c));

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
// dr = damage reduction per hit. Death: small drops rock, medium drops small
// asteroids + rock, large splits into medium asteroids.
const SIZES = [
  { r: 22, hp: 8,  dr: 0, rocks: [1, 3], smalls: [0, 0], mediums: 0 },
  { r: 40, hp: 15, dr: 1, rocks: [1, 3], smalls: [1, 3], mediums: 0 },
  { r: 66, hp: 30, dr: 3, rocks: [0, 0], smalls: [0, 0], mediums: 2 },
];
const SHELL_POWER = 12;                       // pierces: leftover damage carries on
const LASER_TIERS = [[5 * T, 3], [10 * T, 2], [Infinity, 1]];   // [range, damage]
const GUN_RATE_FORWARD = 0.65, GUN_RATE_MANNED = 0.2;
const SHIP_THRUST = 300, SHIP_REVERSE = 180, SHIP_TURN = 3.2, SHIP_MAX = 600, CRUISE = 40;
// Unrealistic space friction as a deceleration of max(MIN, K * sqrt(speed)): roughly constant,
// so the ship stops crisply when slow but can still get fast (top speed = (THRUST / K)^2 = 450).
// Sideways friction is stronger so the ship doesn't slide sideways after a turn.
const SHIP_FRICTION_MIN = 120, SHIP_FRICTION_K = 300 / Math.sqrt(450), SHIP_SIDE_FRICTION = 2.5;
const SHELL_SPEED = 950, SHELL_LIFE = 2.2;   // ~2100px range
const EVA_ACCEL = 450, EVA_DRAG = 1.3, TETHER_GRAB = 1.2 * T, TETHER_LEN = 1.1 * T;
const ROCK_MASS = 0.35;                       // per tethered rock, relative to the astronaut
const VACUUM_R = 7 * T;                       // intake pulls in loose rock within this radius
const ASTEROID_COUNT = 34, SPAWN_MIN = 2000, SPAWN_MAX = 2600, DESPAWN = 3300;
const HULL_BOX = [0, 0, 14.6 * T, 9 * T];     // collision box, ship-local px

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const R = rng(12345);
const randInt = ([a, b]) => a + Math.floor(R() * (b - a + 1));
const ship = { x: 0, y: 0, vx: CRUISE, vy: 0, a: 0, va: 0, throttle: 0.3 };
const player = { mode: 'walk', lx: 6.5 * T, ly: 5.5 * T, face: 0, walk: 0, x: 0, y: 0, vx: 0, vy: 0, cd: 0, tethered: [] };
const cam = { x: 0, y: 0, zoom: 1, rot: 0, shake: 0 };
let asteroids = [], pickups = [], shots = [], parts = [], floaters = [];
let prompt = null;

function localToWorld(lx, ly) {
  const [x, y] = rot(lx - SHIP_C[0], ly - SHIP_C[1], ship.a);
  return [ship.x + x, ship.y + y];
}
function worldToLocal(x, y) {
  const [lx, ly] = rot(x - ship.x, y - ship.y, -ship.a);
  return [lx + SHIP_C[0], ly + SHIP_C[1]];
}
function screenToWorld(sx, sy) {
  const [x, y] = rot((sx - VW / 2) / cam.zoom, (sy - VH / 2) / cam.zoom, -cam.rot);
  return [cam.x + x, cam.y + y];
}
function worldToScreen(x, y) {
  const [sx, sy] = rot((x - cam.x) * cam.zoom, (y - cam.y) * cam.zoom, cam.rot);
  return [VW / 2 + sx, VH / 2 + sy];
}

function makeAsteroid(x, y, size, vx, vy) {
  return { x, y, vx, vy, size, r: SIZES[size].r, hp: SIZES[size].hp, a: R() * TAU, va: (R() - 0.5) * 0.8,
           shape: lumpShape(Math.floor(R() * 1e9), size === 0 ? 9 : 12, 0.3), hit: 0 };
}
function spawnAsteroid(minD, maxD) {
  const ang = R() * TAU, d = minD + R() * (maxD - minD), roll = R();
  const size = roll < 0.4 ? 0 : roll < 0.75 ? 1 : 2;
  const va = R() * TAU, sp = 10 + R() * 40;
  asteroids.push(makeAsteroid(ship.x + Math.cos(ang) * d, ship.y + Math.sin(ang) * d, size, Math.cos(va) * sp, Math.sin(va) * sp));
}
for (let i = 0; i < ASTEROID_COUNT; i++) spawnAsteroid(550, SPAWN_MAX);

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
function burst(x, y, n, col, speed, vx = 0, vy = 0) {
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, s = speed * (0.3 + R());
    parts.push({ x, y, vx: vx + Math.cos(a) * s, vy: vy + Math.sin(a) * s, life: 0.4 + R() * 0.6, max: 1, s: 2 + R() * 3, col });
  }
}

function floatText(x, y, text, col) {
  floaters.push({ x, y, text, col, life: 0.9 });
}

// Applies `power` to an asteroid. Returns how much of the projectile's power was used up
// (damage dealt + the asteroid's damage reduction) and any asteroids spawned by its death.
function hitAsteroid(a, power, s) {
  const S = SIZES[a.size];
  const dealt = Math.min(a.hp, Math.max(0, power - S.dr));
  if (dealt <= 0) {
    floatText(s.x, s.y - 10, '0', '#8a93a5');
    burst(s.x, s.y, 3, '#c9d0dc', 60, a.vx, a.vy);
    return { used: power, spawned: [] };
  }
  a.hp -= dealt; a.hit = 1;
  floatText(s.x, s.y - 10, String(dealt), s.kind === 'laser' ? '#9ff3ff' : '#ffd38a');
  const sp = Math.hypot(s.vx, s.vy) || 1;
  a.vx += s.vx / sp * dealt * 2; a.vy += s.vy / sp * dealt * 2;
  burst(s.x, s.y, 5, s.kind === 'laser' ? '#9ff3ff' : '#ffd38a', 120, a.vx, a.vy);
  return { used: dealt + S.dr, spawned: a.hp <= 0 ? destroyAsteroid(a) : [] };
}

function destroyAsteroid(a) {
  const S = SIZES[a.size];
  asteroids.splice(asteroids.indexOf(a), 1);
  burst(a.x, a.y, 10 + a.size * 8, C.asterLight, 90 + a.size * 30, a.vx, a.vy);
  const spawned = [];
  const children = [...Array(S.mediums).fill(1), ...Array(randInt(S.smalls)).fill(0)];
  children.forEach((size, i) => {
    const ang = i / children.length * TAU + R() * 0.8, off = a.r * 0.45, sp = 30 + R() * 25;
    const c = makeAsteroid(a.x + Math.cos(ang) * off, a.y + Math.sin(ang) * off, size, a.vx + Math.cos(ang) * sp, a.vy + Math.sin(ang) * sp);
    asteroids.push(c); spawned.push(c);
  });
  const n = randInt(S.rocks);
  for (let i = 0; i < n; i++) {
    const ang = i / n * TAU + R() * 0.6, sp = 30 + R() * 55;
    pickups.push({ x: a.x + Math.cos(ang) * 8, y: a.y + Math.sin(ang) * 8, vx: a.vx + Math.cos(ang) * sp, vy: a.vy + Math.sin(ang) * sp,
                   a: R() * TAU, va: (R() - 0.5) * 2, k: Math.floor(R() * 5), state: 'free' });
  }
  return spawned;
}

function laserDamage(s) {
  const d = Math.hypot(s.x - s.ox, s.y - s.oy);
  return LASER_TIERS.find(([range]) => d <= range)[1];
}

function fireGun() {
  const rate = player.mode === 'gunner' ? GUN_RATE_MANNED : GUN_RATE_FORWARD;
  if (gun.cd > 0) return;
  if (gun.ammo <= 0) { gun.dry = 1; gun.cd = 0.3; return; }
  gun.ammo--; gun.cd = rate; gun.flash = 1; cam.shake = Math.max(cam.shake, 0.25);
  const ang = ship.a + gun.rel, [gx, gy] = localToWorld(...GUN_POS);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  shots.push({ kind: 'shell', x: gx + dx * T, y: gy + dy * T, vx: ship.vx + dx * SHELL_SPEED, vy: ship.vy + dy * SHELL_SPEED, life: SHELL_LIFE,
               power: SHELL_POWER, hits: new Set(), k: Math.floor(R() * 5) });
}

function fireLaser() {
  if (player.cd > 0) return;
  player.cd = 0.18;
  const dx = Math.cos(player.face), dy = Math.sin(player.face);
  const x = player.x + dx * 14, y = player.y + dy * 14;
  shots.push({ kind: 'laser', x, y, ox: x, oy: y, vx: player.vx + dx * 1300, vy: player.vy + dy * 1300, life: 0.55, hits: new Set() });
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
const STATIONS = [
  { tile: PILOT_SEAT, mode: 'pilot', label: 'Pilot ship' },
  { tile: GUNNER_SEAT, mode: 'gunner', label: 'Man cannon' },
  { tile: { x: AIRLOCK_TILE.x, y: AIRLOCK_TILE.y - 1 }, mode: 'eva', label: 'Exit airlock' },
];
const AIRLOCK_OUTSIDE = [AIRLOCK_TILE.x * T + T / 2, (AIRLOCK_TILE.y + 1) * T + T * 0.5];

function walkCollide() {
  const r = T * 0.28;
  const tx0 = Math.floor((player.lx - r) / T), tx1 = Math.floor((player.lx + r) / T);
  const ty0 = Math.floor((player.ly - r) / T), ty1 = Math.floor((player.ly + r) / T);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (!isBlocked(tx, ty)) continue;
    const cx = clamp(player.lx, tx * T, tx * T + T), cy = clamp(player.ly, ty * T, ty * T + T);
    const dx = player.lx - cx, dy = player.ly - cy, d = Math.hypot(dx, dy);
    if (d < r && d > 0) { player.lx += dx / d * (r - d); player.ly += dy / d * (r - d); }
  }
}

function board() {
  player.mode = 'walk'; airlock.open = 1;
  player.lx = AIRLOCK_TILE.x * T + T / 2; player.ly = (AIRLOCK_TILE.y - 1) * T + T / 2;
  player.face = -Math.PI / 2;
  const n = player.tethered.length;
  if (n) {
    for (const p of player.tethered) p.state = 'stored';
    player.tethered = [];
    storeRock(n);
    floatText(...localToWorld(...tileCenter(CHEST_TILE)), `+${n} rock`, '#ffe08a');
  }
}

function updatePlayer(dt) {
  prompt = null;
  const mx = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
  const my = (held('KeyS', 'ArrowDown') ? 1 : 0) - (held('KeyW', 'ArrowUp') ? 1 : 0);
  const use = pressed.has('KeyE');
  player.cd -= dt;

  if (player.mode === 'walk') {
    const len = Math.hypot(mx, my);
    if (len) {
      player.lx += mx / len * 3.4 * T * dt; player.ly += my / len * 3.4 * T * dt;
      player.face = Math.atan2(my, mx); player.walk += dt * 11;
    }
    walkCollide();
    let best = null, bd = T * 0.8;
    for (const s of STATIONS) {
      const [cx, cy] = tileCenter(s.tile), d = Math.hypot(player.lx - cx, player.ly - cy);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) {
      prompt = { label: best.label, at: localToWorld(...tileCenter(best.tile)) };
      if (use) {
        if (best.mode === 'eva') {
          [player.x, player.y] = localToWorld(...AIRLOCK_OUTSIDE);
          const [ox, oy] = rot(0, 90, ship.a);
          player.vx = ship.vx + ox; player.vy = ship.vy + oy;
          airlock.open = 1;
        } else {
          [player.lx, player.ly] = tileCenter(best.tile);
          player.face = best.tile.face;
        }
        player.mode = best.mode;
      }
    }
  } else if (player.mode === 'pilot' || player.mode === 'gunner') {
    if (use || pressed.has('Escape')) { player.mode = 'walk'; }
    if (player.mode === 'pilot' && held('Space')) fireGun();
    if (player.mode === 'gunner' && (held('Space') || mouse.down)) fireGun();
  } else if (player.mode === 'eva') {
    const len = Math.hypot(mx, my);
    const accel = EVA_ACCEL / (1 + player.tethered.length * ROCK_MASS);   // towed rock adds mass
    if (len) { player.vx += mx / len * accel * dt; player.vy += my / len * accel * dt; }
    const drag = Math.exp(-EVA_DRAG * dt);
    player.vx *= drag; player.vy *= drag;
    player.x += player.vx * dt; player.y += player.vy * dt;
    player.face = Math.atan2(mouse.wy - player.y, mouse.wx - player.x);
    player.walk += len ? dt * 6 : 0;
    if (len && R() < 0.6) {
      const [bx, by] = rot(-T * 0.45, 0, player.face);
      parts.push({ x: player.x + bx, y: player.y + by, vx: -mx / len * 80 + player.vx, vy: -my / len * 80 + player.vy, life: 0.3, max: 0.3, s: 3, col: '#ffd9a0' });
    }
    if (mouse.down || held('Space')) fireLaser();
    for (const a of asteroids) {
      const dx = player.x - a.x, dy = player.y - a.y, d = Math.hypot(dx, dy), min = a.r + T * 0.25;
      if (d < min && d > 0) {
        player.x += dx / d * (min - d); player.y += dy / d * (min - d);
        const vn = (player.vx - a.vx) * dx / d + (player.vy - a.vy) * dy / d;
        if (vn < 0) { player.vx -= 1.4 * vn * dx / d; player.vy -= 1.4 * vn * dy / d; }
      }
    }
    // loose rock close by gets clipped onto the tether chain
    for (const p of pickups) {
      if (p.state === 'free' && Math.hypot(p.x - player.x, p.y - player.y) < TETHER_GRAB) {
        p.state = 'tether'; player.tethered.push(p);
      }
    }
    const [ax, ay] = localToWorld(...AIRLOCK_OUTSIDE);
    if (Math.hypot(player.x - ax, player.y - ay) < 75) {
      prompt = { label: player.tethered.length ? `Board ship (+${player.tethered.length} rock)` : 'Board ship', at: [ax, ay] };
      if (use) board();
    }
  }
  airlock.open = Math.max(0, airlock.open - dt * 0.8);
}

// ---------------------------------------------------------------------------
// Ship, gun, world
// ---------------------------------------------------------------------------
function friction(v, scale, dt) {
  const d = Math.max(SHIP_FRICTION_MIN, SHIP_FRICTION_K * Math.sqrt(Math.abs(v))) * scale * dt;
  return Math.abs(v) <= d ? 0 : v - Math.sign(v) * d;
}

function updateShip(dt) {
  const fx = Math.cos(ship.a), fy = Math.sin(ship.a);
  // friction first, so thrust and the autopilot work against it
  const f = friction(ship.vx * fx + ship.vy * fy, 1, dt), sd = friction(-ship.vx * fy + ship.vy * fx, SHIP_SIDE_FRICTION, dt);
  ship.vx = f * fx - sd * fy; ship.vy = f * fy + sd * fx;
  if (player.mode === 'pilot') {
    const thrust = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? SHIP_REVERSE / SHIP_THRUST : 0);
    const turn = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
    ship.vx += fx * thrust * SHIP_THRUST * dt; ship.vy += fy * thrust * SHIP_THRUST * dt;
    ship.va += turn * SHIP_TURN * dt;
    ship.throttle = lerp(ship.throttle, Math.max(0.15, thrust), 1 - Math.exp(-dt * 8));
  } else {
    // autopilot: ease towards a slow forward cruise
    const tx = fx * CRUISE - ship.vx, ty = fy * CRUISE - ship.vy, d = Math.hypot(tx, ty);
    const step = Math.min(d, 200 * dt);
    if (d > 0) { ship.vx += tx / d * step; ship.vy += ty / d * step; }
    ship.throttle = lerp(ship.throttle, 0.3, 1 - Math.exp(-dt * 4));
  }
  ship.va *= Math.exp(-2.5 * dt);
  ship.va = clamp(ship.va, -1.4, 1.4);
  const sp = Math.hypot(ship.vx, ship.vy);
  if (sp > SHIP_MAX) { ship.vx *= SHIP_MAX / sp; ship.vy *= SHIP_MAX / sp; }
  ship.x += ship.vx * dt; ship.y += ship.vy * dt; ship.a += ship.va * dt;

  // gun: turns toward the mouse when manned, otherwise returns to forward
  gun.cd -= dt; gun.flash = Math.max(0, gun.flash - dt * 6); gun.dry = Math.max(0, gun.dry - dt * 2);
  let want = 0;
  if (player.mode === 'gunner') {
    const [gx, gy] = localToWorld(...GUN_POS);
    want = Math.atan2(mouse.wy - gy, mouse.wx - gx) - ship.a;
  }
  const diff = wrapAngle(want - gun.rel);
  gun.rel = wrapAngle(gun.rel + clamp(diff, -5 * dt, 5 * dt));

  // asteroids bounce off the hull
  for (const a of asteroids) {
    const [lx, ly] = worldToLocal(a.x, a.y);
    const cx = clamp(lx, HULL_BOX[0], HULL_BOX[2]), cy = clamp(ly, HULL_BOX[1], HULL_BOX[3]);
    let nx = lx - cx, ny = ly - cy, d = Math.hypot(nx, ny);
    if (d >= a.r) continue;
    if (d === 0) { nx = 0; ny = ly < SHIP_C[1] ? -1 : 1; d = 0; } else { nx /= d; ny /= d; }
    const [wx, wy] = rot(nx, ny, ship.a);
    a.x += wx * (a.r - d); a.y += wy * (a.r - d);
    const vn = (a.vx - ship.vx) * wx + (a.vy - ship.vy) * wy;
    if (vn < 0) {
      a.vx -= 1.5 * vn * wx; a.vy -= 1.5 * vn * wy;
      const k = [0.04, 0.1, 0.22][a.size];
      ship.vx += vn * wx * k; ship.vy += vn * wy * k;
      cam.shake = Math.max(cam.shake, Math.min(1, -vn / 150));
    }
  }
}

function updatePickups(dt) {
  const [ix, iy] = localToWorld(...INTAKE_POS);
  for (const p of pickups) {
    p.a += p.va * dt;
    if (p.state === 'free' || p.state === 'pulled') {
      const dx = ix - p.x, dy = iy - p.y, d = Math.hypot(dx, dy);
      if (d < VACUUM_R) {
        // pulled toward the intake, faster the closer it gets; matches ship velocity so it never orbits
        p.state = 'pulled';
        const speed = lerp(90, 520, 1 - d / VACUUM_R);
        const k = 1 - Math.exp(-dt * 5);
        p.vx = lerp(p.vx, ship.vx + dx / d * speed, k); p.vy = lerp(p.vy, ship.vy + dy / d * speed, k);
        if (d < T * 0.6) { p.state = 'stored'; storeRock(1); continue; }
      } else {
        p.state = 'free';
        const drag = Math.exp(-0.6 * dt);
        p.vx *= drag; p.vy *= drag;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }
  // tethered rock: each on its own rope to the astronaut. Ropes are inextensible
  // constraints (no springs, so no wobble); slack ropes let the rock drift.
  const tethered = player.tethered;
  for (const p of tethered) {
    const k = 1 - Math.exp(-dt * 0.8);              // slowly settle to the astronaut's velocity
    p.vx = lerp(p.vx, player.vx, k); p.vy = lerp(p.vy, player.vy, k);
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (let i = 0; i < tethered.length; i++) {       // rocks push apart so they fan out
    for (let j = i + 1; j < tethered.length; j++) {
      const a = tethered[i], b = tethered[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d < T * 0.7) {
        const push = (T * 0.7 - d) * 0.5 * Math.min(1, dt * 10);
        a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push;
      }
    }
  }
  for (const p of tethered) {
    const dx = player.x - p.x, dy = player.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d <= TETHER_LEN) continue;
    const nx = dx / d, ny = dy / d;
    p.x += nx * (d - TETHER_LEN); p.y += ny * (d - TETHER_LEN);
    const vrel = (player.vx - p.vx) * nx + (player.vy - p.vy) * ny;   // > 0: rope pulling taut
    if (vrel > 0) { p.vx += nx * vrel; p.vy += ny * vrel; }
  }
  pickups = pickups.filter(p => p.state !== 'stored' && (p.state === 'tether' || Math.hypot(p.x - ship.x, p.y - ship.y) < DESPAWN));
}

function updateWorld(dt) {
  for (const a of asteroids) {
    a.x += a.vx * dt; a.y += a.vy * dt; a.a += a.va * dt; a.hit = Math.max(0, a.hit - dt * 4);
  }
  asteroids = asteroids.filter(a => Math.hypot(a.x - ship.x, a.y - ship.y) < DESPAWN);
  while (asteroids.length < ASTEROID_COUNT) spawnAsteroid(SPAWN_MIN, SPAWN_MAX);

  for (const s of shots) {
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    for (const a of asteroids) {
      if (s.hits.has(a) || Math.hypot(s.x - a.x, s.y - a.y) >= a.r + 4) continue;
      const power = s.kind === 'laser' ? laserDamage(s) : s.power;
      const { used, spawned } = hitAsteroid(a, power, s);
      s.hits.add(a); spawned.forEach(c => s.hits.add(c));    // fragments don't eat the same shell
      if (s.kind === 'laser') { s.life = 0; break; }
      s.power -= used;
      if (s.power <= 0) { s.life = 0; break; }
    }
  }
  shots = shots.filter(s => s.life > 0);

  updatePickups(dt);

  for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; }
  parts = parts.filter(q => q.life > 0);
  for (const f of floaters) { f.y -= 30 * dt / cam.zoom; f.life -= dt; }
  floaters = floaters.filter(f => f.life > 0);
}

function updateCamera(dt) {
  const base = Math.min(1.3, VW / (17.5 * T), VH / (11.5 * T));
  let tx = ship.x, ty = ship.y, tz = base, tr = -ship.a;
  if (player.mode === 'pilot' || player.mode === 'gunner') {
    tx += ship.vx * 0.5; ty += ship.vy * 0.5; tz = base * 0.42; tr = 0;
  } else if (player.mode === 'eva') {
    tx = player.x; ty = player.y; tz = base * 0.6; tr = 0;
  }
  const k = 1 - Math.exp(-dt * 7);
  cam.x = lerp(cam.x, tx, k); cam.y = lerp(cam.y, ty, k);
  cam.zoom = Math.exp(lerp(Math.log(cam.zoom), Math.log(tz), 1 - Math.exp(-dt * 3)));
  cam.rot += wrapAngle(tr - cam.rot) * (1 - Math.exp(-dt * 4));
  cam.shake = Math.max(0, cam.shake - dt * 2.5);
  [mouse.wx, mouse.wy] = screenToWorld(mouse.x, mouse.y);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function shipTransform(ox = 0, oy = 0) {
  ctx.translate(ship.x + ox, ship.y + oy); ctx.rotate(ship.a); ctx.translate(-SHIP_C[0], -SHIP_C[1]);
}

function render(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const sx = (R() - 0.5) * cam.shake * 10, sy = (R() - 0.5) * cam.shake * 10;
  drawSpace(t, cam, VW, VH);

  ctx.translate(VW / 2 + sx, VH / 2 + sy); ctx.rotate(cam.rot); ctx.scale(cam.zoom, cam.zoom); ctx.translate(-cam.x, -cam.y);
  for (const a of asteroids) drawAsteroid(a, t);
  for (const p of pickups) if (p.state === 'free') drawPickup(p, t);

  ctx.save(); shipTransform(); drawVacuum(...INTAKE_POS, VACUUM_R, t, pickups.some(p => p.state === 'pulled')); ctx.restore();
  // ship (drop shadow keeps a world-fixed offset)
  ctx.save(); shipTransform(8, 10); poly(HULL_PTS); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); ctx.restore();
  ctx.save(); shipTransform();
  drawEngines(t, ship.throttle);
  drawHull(t);
  drawShipInterior(t, player.mode);
  if (player.mode !== 'eva') drawCrew(player.lx, player.ly, player.face, player.walk, false);
  drawGun(...GUN_POS, gun.rel, gun.flash);
  ctx.restore();
  for (const p of pickups) if (p.state === 'pulled') drawRockItem(p.x, p.y, p.k, 1.05, p.a);

  for (const s of shots) {
    if (s.kind === 'laser') {
      const dmg = laserDamage(s);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const sp = Math.hypot(s.vx, s.vy), dx = s.vx / sp, dy = s.vy / sp;
      ctx.strokeStyle = `rgba(95,214,228,${0.15 * dmg})`; ctx.lineWidth = 3 + 2 * dmg;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - dx * 34, s.y - dy * 34); ctx.stroke();
      ctx.strokeStyle = `rgba(230,253,255,${0.3 + 0.23 * dmg})`; ctx.lineWidth = 1 + 0.6 * dmg; ctx.stroke();
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.05, s.y - s.vy * 0.05);
      g.addColorStop(0, 'rgba(255,200,120,0.8)'); g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.05, s.y - s.vy * 0.05); ctx.stroke();
      drawRockItem(s.x, s.y, s.k, 0.55, t * 8);
    }
  }
  for (const q of parts) {
    ctx.globalAlpha = clamp(q.life / q.max * 1.5, 0, 1);
    ctx.fillStyle = q.col; ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
  }
  ctx.globalAlpha = 1;
  if (player.mode === 'eva') {
    for (const p of player.tethered) drawTether(player.x, player.y, p.x, p.y, TETHER_LEN);
    for (const p of player.tethered) drawRockItem(p.x, p.y, p.k, 1.05, p.a);
    drawCrew(player.x, player.y, player.face, player.walk, true);
  }

  drawHUD(t);
}

function hudPanel(x, y, w, h) {
  ctx.fillStyle = 'rgba(12,15,22,0.78)'; rr(x, y, w, h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.stroke();
}

const MODE_INFO = {
  walk: ['On foot', 'WASD walk · E use station'],
  pilot: ['Piloting', 'W/S thrust · A/D turn · Space fire cannon (forward) · E leave'],
  gunner: ['Manning cannon', 'Mouse aim · Click/Space fire (fast) · E leave'],
  eva: ['EVA', 'WASD jetpack · Mouse aim · Click/Space laser · fly into rock to tether it · E at airlock to board'],
};

function drawHUD(t) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.font = '700 14px system-ui, sans-serif';
  for (const f of floaters) {
    const [x, y] = worldToScreen(f.x, f.y);
    ctx.globalAlpha = clamp(f.life * 2, 0, 1);
    ctx.lineWidth = 3; ctx.strokeStyle = OUT; ctx.strokeText(f.text, x, y);
    ctx.fillStyle = f.col; ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;

  ctx.textAlign = 'left';
  const panelH = player.mode === 'eva' ? 154 : 132;
  hudPanel(16, 16, 230, panelH);
  ctx.fillStyle = '#e8ecf3'; ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillText('MANIFOLD NOVUM', 30, 36);
  ctx.fillStyle = '#ffd38a'; ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillText(MODE_INFO[player.mode][0], 30, 58);
  ctx.fillStyle = '#9aa3b5'; ctx.font = '13px system-ui, sans-serif';
  ctx.fillText(`Speed ${Math.hypot(ship.vx, ship.vy).toFixed(0)}`, 30, 80);
  drawRockItem(38, 104, 0, 0.6, 0.3);
  ctx.fillStyle = '#9aa3b5'; ctx.fillText(`Chest  ${chest.count}`, 54, 104);
  ctx.fillText('Ammo', 30, 128);
  drawAmmoPips(76, 123, gun.ammo, AMMO_MAX, gun.dry);
  if (player.mode === 'eva') { ctx.fillStyle = '#9aa3b5'; ctx.fillText(`Tethered  ${player.tethered.length}`, 30, 150); }

  const help = MODE_INFO[player.mode][1];
  ctx.font = '13px system-ui, sans-serif';
  const hw = ctx.measureText(help).width + 28;
  hudPanel(VW / 2 - hw / 2, VH - 46, hw, 30);
  ctx.textAlign = 'center'; ctx.fillStyle = '#c9d0dc'; ctx.fillText(help, VW / 2, VH - 31);

  if (prompt) {
    const [px, py] = worldToScreen(...prompt.at);
    const label = `[E] ${prompt.label}`;
    ctx.font = '600 13px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 18;
    hudPanel(px - w / 2, py - 46, w, 24);
    ctx.fillStyle = '#ffe08a'; ctx.fillText(label, px, py - 34);
  }
  if (gun.dry > 0 && player.mode !== 'walk') {
    ctx.font = '700 15px system-ui, sans-serif'; ctx.fillStyle = `rgba(255,110,90,${gun.dry})`;
    ctx.fillText('NO AMMO', VW / 2, VH - 70);
  }
  // in EVA, point back to the ship when it is off screen
  if (player.mode === 'eva') {
    const [sx, sy] = worldToScreen(ship.x, ship.y);
    const m = 40;
    if (sx < m || sy < m || sx > VW - m || sy > VH - m) {
      const ang = Math.atan2(sy - VH / 2, sx - VW / 2);
      const k = Math.min((VW / 2 - m) / Math.abs(Math.cos(ang) || 1e-6), (VH / 2 - m) / Math.abs(Math.sin(ang) || 1e-6));
      const ax = VW / 2 + Math.cos(ang) * k, ay = VH / 2 + Math.sin(ang) * k;
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
      poly([[14, 0], [-8, -9], [-4, 0], [-8, 9]]); ctx.fillStyle = '#5fd6e4'; ctx.fill(); stroke(2);
      ctx.restore();
      ctx.font = '600 12px system-ui, sans-serif'; ctx.fillStyle = '#5fd6e4';
      ctx.fillText(`SHIP ${Math.round(Math.hypot(ship.x - player.x, ship.y - player.y) / T)}m`, ax - Math.cos(ang) * 34, ay - Math.sin(ang) * 22);
    }
  }
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
cam.x = ship.x; cam.y = ship.y;
cam.zoom = Math.min(1.3, VW / (17.5 * T), VH / (11.5 * T));
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  updatePlayer(dt);
  updateShip(dt);
  updateBelts(dt);
  updateWorld(dt);
  updateCamera(dt);
  pressed.clear();
  render(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug: index.html#pilot, #gunner or #eva starts in that mode.
if (location.hash.length > 1) {
  const m = location.hash.slice(1);
  if (m === 'eva') {
    player.mode = 'eva';
    [player.x, player.y] = localToWorld(...AIRLOCK_OUTSIDE);
    player.y += 220;
  } else if (STATIONS.some(s => s.mode === m)) {
    const s = STATIONS.find(s => s.mode === m);
    player.mode = m; [player.lx, player.ly] = tileCenter(s.tile); player.face = s.tile.face;
  }
}
