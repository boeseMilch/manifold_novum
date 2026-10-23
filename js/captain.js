// Captain Red Comet: the pirate base's boss (chapter 5), in the captain's quarters (js/dock.js baseGeom rooms[5]).
// He never dies: a recurring villain. A shield generator on his back projects a FRONT energy shield: shots from his
// front ripple off; only the generator (CAPT_GEN behind his centre) can be hurt. One health bar (HP grows with the crew).
//   PHASE 1 (100-50 %), repeating: BUCKSHOT x3 (he turns to his target, a laser-sight cone for the telegraph, then a
//            blunderbuss spread of pellets; cover stops them) → SPIN (plants his feet, 1.5 fast turns spraying a 2-armed
//            spiral of bolts with gaps; the generator sweeps past everyone) → CATCH BREATH (leans on his cannon: walk
//            round behind him and shoot the generator; facing a wall closely, he steps off it first).
//            At 75 %: ALL HANDS: he whistles, pirates come in through the pirate-only blast door (1 solo, 2 for two, max 3).
//   AT 50 %: the shield flares into a full bubble (invulnerable), he roars and throws off his coat, the lights go red, a
//            pirate wave: COMET MODE (the generator feeds rocket jets).
//   PHASE 2 (50-0 %), repeating: BUCKSHOT x2 (faster) → DASH (a glowing line on the floor + a rising jet whine, then he
//            rockets along it, leaving a burning trail; the extinguisher puts it out). Into a wall or cover: DAZED (shield
//            down, double damage from any side). In the open: straight into a faster 3-armed SPIN → CATCH BREATH (shorter).
//            One more pirate through the blast door every CAPT_TRICKLE s (at most 3 of them alive; solo 2: captDoorMax).
//   AT 0:    the generator bursts, he staggers into his escape pod ("THIS ISN'T OVER!"), it launches, and the brig door's
//            lockdown lifts (no code needed any more; until then the brig keypad refuses every code).
// He starts when someone walks into his quarters ("Who let you in here?!"); with nobody standing in there he walks back
// to his throne (no healing) and waits.
// THE RAID (2+ players only, never solo): while the crew is in the base a Red Comet raider docks at our OTHER airlock
// (just its tube is walkable: dk.raid) and its two pirates come for our fuel cells like any raider's crew. They cast off
// once both are back home with their loot (or down). Triggered CAPT_RAID_DELAY s after the captain's fight first starts:
// a stab in the back while the crew is busy with him, never before (2026-10-17 playtest: there used to be a fallback
// CAPT_RAID_LATE s after docking, which mostly came first, while the crew was still clearing rooms).
// State: dk.boss and dk.raid (plain data, in the snapshot with dk). Hooks: dockBase → captainDock, updateDock →
// updateCaptain, js/invader.js boltHitsBody → captainBoltTest, sprayDock → captainSpray, updatePirate → raidPirateMove.

const CAPT_HP = [18, 24], CAPT_HP_PER = 12, CAPT_WALK = 1.3, CAPT_TURN = 5;
const CAPT_BODY = { r: 0.55, top: 1.9 }, CAPT_GEN = 0.55, CAPT_GEN_R = 0.42, CAPT_GEN_Z = 1.35;   // the generator: this far behind his centre
const CAPT_SHOTS = [3, 2], CAPT_TEL = [0.6, 0.45], CAPT_RECOVER = [0.5, 0.35], CAPT_TURN_MAX = 0.8;
const CAPT_PELLETS = 7, CAPT_SPREAD = 0.5, CAPT_PELLET_V = 12, CAPT_PELLET_LIFE = 0.95;
const CAPT_PLANT = [0.45, 0.3], CAPT_SPIN_TURNS = 1.5, CAPT_SPIN_W = [5.0, 6.5], CAPT_SPIN_EVERY = 0.065, CAPT_SPIN_ON = 0.34, CAPT_SPIN_GAP = 0.5;
const CAPT_BOLT_V = 7, CAPT_BOLT_LIFE = 1.9, CAPT_SPIN_MUZZLE = 33 * Math.PI / 180;   // (p*_spin: the cannon swung out 33° right of his facing)
const CAPT_BREATH = [3.5, 2.5], CAPT_WHISTLE = 1.3, CAPT_TRANSITION = 2.4;
const CAPT_DASH_TEL = 0.8, CAPT_DASH_V = 15, CAPT_DASH_OVER = 2.5, CAPT_DASH_MAX = 11, CAPT_DAZE = 2.5, CAPT_TRAIL = 5, CAPT_TRAIL_STEP = 0.7;
const CAPT_EASY_K = [1, 1.35, 1.7], CAPT_EASY_BREATH = [0, 1, 2], CAPT_EASY_DAZE = [0, 0.7, 1.5];
const CAPT_TRICKLE = 30, CAPT_DOOR_MAX = 3, CAPT_AWAY = 3;
const CAPT_RAID_DELAY = 15;   // (was 6, with a CAPT_RAID_LATE 150 s fallback)
const CAPT_MUZZLE = { fwd: 0.95, right: 0.42, z: 1.05 };

const captEasy = () => clamp(typeof mission !== 'undefined' ? mission.easy || 0 : 0, 0, 2);
// HP by crew size (the user, 2026-10-17): 18 solo, 24 with two (70 % of the old 36), then +12 a player (near linear), up to 8
const captMaxHp = (n) => (n <= 1 ? CAPT_HP[0] : CAPT_HP[1] + CAPT_HP_PER * (Math.min(8, n) - 2));
const captWave = (n) => Math.min(captDoorMax(), Math.max(1, n - captEasy()));
// At most this many door pirates alive at once: 3, solo 2 (2026-10-20, the user: one less for solo)
const captDoorMax = () => (crewSize() <= 1 ? CAPT_DOOR_MAX - 1 : CAPT_DOOR_MAX);
// Spots in the quarters (port coords like baseGeom: x absolute, y relative to the hatch; mirrored for starboard).
function captSpots(g) {
  const port = dk.dock.side === 'port', pt = (x, dy) => ({ x: dockX(dk.dock.side, x), y: g.y + dy });
  return { throne: pt(-36.2, -18.9), pod: pt(-38.4, -18.9), mid: pt(-34.0, -16.0), door: pt(-28.9, -18.3),
           posts: [pt(-30.0, -15.0), pt(-29.4, -11.9), pt(-33.0, -15.6)], extinguisher: pt(-19.6, -10.4) };
}
const captVuln = (B) => !['transition', 'flee', 'gone'].includes(B.state);
const captGen = (B) => ({ x: B.x - Math.cos(B.face) * CAPT_GEN, y: B.y - Math.sin(B.face) * CAPT_GEN });
// Where his shots leave the cannon: aiming (forward and a bit right), or spinning (the cannon swung out wide).
function captMuzzle(B, a = B.face) {
  return { x: B.x + Math.cos(a) * CAPT_MUZZLE.fwd - Math.sin(a) * CAPT_MUZZLE.right, y: B.y + Math.sin(a) * CAPT_MUZZLE.fwd + Math.cos(a) * CAPT_MUZZLE.right, z: CAPT_MUZZLE.z };
}
// He's ~1.4x a pirate: his footprint is a 0.9 box; he never leaves his quarters.
function captOk(x, y) {
  const g = DG();
  return !!g && inRect(x, y, g.rooms[5], -0.45) && [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]].every(([a, b]) => pirateOk(x + a, y + b));
}
function captStep(B, tx, ty, v, dt) {
  const dx = tx - B.x, dy = ty - B.y, d = Math.hypot(dx, dy);
  if (d < 0.01) return 0;
  const sp = Math.min(d, v * dt), vx = dx / d * sp, vy = dy / d * sp;
  let moved = 0;
  if (captOk(B.x + vx, B.y)) { B.x += vx; moved += Math.abs(vx); }
  if (captOk(B.x, B.y + vy)) { B.y += vy; moved += Math.abs(vy); }
  B.walk += moved * 2.4;
  return moved;
}
// Walking somewhere in the quarters: straight, or round the cover by the room's middle when that gets stuck.
function captWalkTo(B, to, v, dt) {
  const goal = B.via || to;
  B.face = turnTo(B.face, Math.atan2(goal.y - B.y, goal.x - B.x), CAPT_TURN * dt);
  const moved = captStep(B, goal.x, goal.y, v, dt);
  if (B.via && Math.hypot(B.via.x - B.x, B.via.y - B.y) < 0.3) B.via = null;
  B.stuck = moved < v * dt * 0.2 ? (B.stuck || 0) + dt : 0;
  if (B.stuck > 0.8) { B.stuck = 0; B.via = B.via ? null : captSpots(DG()).mid; }
  return Math.hypot(to.x - B.x, to.y - B.y) < 0.25;
}
const turnTo = (a, b, max) => a + clamp(wrapAngle(b - a), -max, max);

// ---------------------------------------------------------------------------
// Docking (from dockBase): the captain at his throne, the escape pod shut, an extinguisher in the barracks
// ---------------------------------------------------------------------------
function captainDock(g, n) {
  const S = captSpots(g), max = captMaxHp(n);
  dk.boss = { x: S.throne.x, y: S.throne.y, face: Math.PI / 2, walk: 0, hp: max, max, phase: 1, state: 'wait', t: 0, sub: null, step: -1, clock: 0,
              met: false, s75: false, whistleDue: false, red: false, coat: null, pod: 'closed', hidden: false, fled: false,
              flash: 0, ripT: -9, fireT: -9, burstT: -9, dazeT: -9, say: null, away: 0, trail: [], burn: {}, door: null, trickle: 0,
              shots: 0, aimA: 0, target: null, dash: null, arms: 2, spinA: 0, emitT: 0, raidAt: null, raided: false };
  dk.raid = null;
  ITEMS.push({ kind: 'extinguisher', x: S.extinguisher.x, y: S.extinguisher.y });   // (for his fire trail)
}
// Practice: dock the base, skip to the quarters' door (open), the rooms cleared, the sentry off.
function captainPractice(phase) {
  dk.dock = null; dk.pirates = []; dk.bodies = []; dk.raid = null;
  dockShip('base', 'port');
  const d = dk.dock, g = DG(), B = dk.boss, Dq = g.doors[2];
  d.doors[1] = d.doors[2] = false; d.terminal = 'hacked'; d.sentry.state = 'off'; dk.pirates = [];
  Object.assign(player, { mode: 'inside', gun: null, x: Dq.x + Dq.w / 2, y: Dq.y + Dq.h + 0.6, vx: 0, vy: 0 });
  if (phase === 2) {
    Object.assign(B, { hp: B.max * 0.5, phase: 2, s75: true, red: true });
    B.coat = { x: B.x + 1.2, y: B.y + 0.4 };
  }
  combatBanner(`Practice: Captain Red Comet, phase ${phase} — the door to his quarters is open.`);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function captTargets() {
  const g = DG(), Q = g.rooms[5];
  return crew.filter(c => c.mode === 'inside' && standing(c) && inRect(c.x, c.y, Q));
}
function captPick(B) {
  const T = captTargets(), last = T.find(c => c.id === B.lastHit);
  return last || T.sort((a, b) => Math.hypot(a.x - B.x, a.y - B.y) - Math.hypot(b.x - B.x, b.y - B.y))[0] || null;
}
function captSay(B, text) { B.say = { text, t: B.clock }; }
function captStart(B, state, more = {}) { Object.assign(B, { state, t: 0, sub: null }, more); }
// The next thing in his cycle (the whistle at 75 % slots in between).
function captNext(B) {
  if (B.whistleDue) { B.whistleDue = false; captStart(B, 'whistle'); captSay(B, '*WHEEEET!*'); sfx.alarm(); captDoor(B, captWave(crewSize()), 'ALL HANDS! The captain whistles — pirates are coming through the blast door!'); return; }
  const C = ['buckshot', B.phase === 1 ? 'spin' : 'dash', 'breath'];
  B.step = (B.step + 1) % C.length;
  const k = C[B.step];
  if (k === 'buckshot') captStart(B, 'buckshot', { sub: 'turn', shots: CAPT_SHOTS[B.phase - 1] });
  else if (k === 'spin') captStart(B, 'spin', { sub: 'plant', arms: 2 });
  else if (k === 'dash') captStart(B, 'dash', { sub: 'tele', dash: null });
  else captBreath(B);
}
function captBreath(B) {
  const ahead = !captOk(B.x + Math.cos(B.face) * 1.0, B.y + Math.sin(B.face) * 1.0);   // facing a wall (or cover) closely: a step back off it first
  captStart(B, 'breath', { sub: ahead ? 'step' : 'pant' });
}
function captEngage(B) {
  const first = !B.met;
  B.met = true; B.away = 0; B.step = -1; B.via = null;
  combatBanner(first ? 'CAPTAIN RED COMET: "Who let you in here?!"' : 'CAPTAIN RED COMET: "Back for more?!"'); sfx.alarm();
  if (first && crewSize() >= 2 && B.raidAt == null) B.raidAt = B.clock + CAPT_RAID_DELAY;
  captNext(B);
}
// Pirates through the blast door: k of them (at most captDoorMax() of theirs alive at once).
function captDoor(B, k, banner) {
  if (B.door) { B.door.queue += k; return; }
  B.door = { state: 'alarm', t: 0, queue: k };
  dk.dock.blast = 'alarm';
  if (banner) combatBanner(banner);
}
function captDoorUpdate(B, dt) {
  const D = B.door, d = dk.dock;
  if (!D) return;
  D.t += dt;
  const alive = dk.pirates.filter(p => p.door).length;
  if (D.state === 'alarm' && D.t >= 1.2) { D.state = 'open'; D.t = 0; D.next = 0; d.blast = 'open'; sfx.hatch(); }
  else if (D.state === 'open') {
    if ((D.next -= dt) <= 0 && D.queue > 0) {
      D.next = 0.8;
      if (alive < captDoorMax()) {
        const S = captSpots(DG()), post = S.posts[dk.pirates.filter(p => p.door).length % S.posts.length];
        dk.pirates.push({ uid: newUid(), x: S.door.x, y: S.door.y, face: d.side === 'port' ? Math.PI : 0, walk: 0, hp: PIRATE_HP, carry: null, state: 'guard', cd: 1.2, aim: 0, route: [], stuck: 0, stun: 0, flash: 0,
                          post: { x: post.x, y: post.y }, mode: 'guard', room: 5, door: true });
      }
      D.queue--;
    }
    if (D.queue <= 0 && D.next <= -1.5) { B.door = null; d.blast = 'closed'; sfx.hatch(); }
  }
}
function captHurt(B, dmg) {
  B.flash = 1; sfx.alienHurt();
  B.hp = Math.max(0, B.hp - dmg);
  if (B.phase === 1 && B.hp <= B.max * 0.5) { B.hp = B.max * 0.5; captTransition(B); return; }
  if (!B.s75 && B.hp <= B.max * 0.75) { B.s75 = true; B.whistleDue = true; }
  if (B.phase === 2 && B.hp <= 0) captFlee(B);
}
function captTransition(B) {
  captStart(B, 'transition'); B.met = true; B.red = true; B.s75 = true; B.whistleDue = false;
  captSay(B, 'ROAAAR!'); sfx.explosion();
  combatBanner('The captain\'s shield flares into a full bubble — he throws off his coat: COMET MODE!');
}
function captFlee(B) {
  captStart(B, 'flee', { sub: 'burst' }); B.burstT = B.clock; B.dash = null;
  sfx.explosion(); combatFlip('fx/explosion_s', captGen(B).x, captGen(B).y, 0.8, 1.2);
  combatBanner('KRZZAK! His shield generator bursts!');
}
function updateCaptain(dt) {
  updateRaid(dt);
  const B = dk.boss, d = dk.dock;
  if (!B || d?.kind !== 'base') return;
  B.clock += dt; B.t += dt; B.flash = Math.max(0, B.flash - dt * 2.5);
  captDoorUpdate(B, dt);
  captTrail(B, dt);
  captRaidTrigger(B);
  if (B.state === 'gone') return;
  const T = captTargets(), easy = captEasy(), ph = B.phase - 1;
  // nobody standing in his quarters: back to his throne
  if (!['wait', 'return', 'transition', 'flee', 'whistle'].includes(B.state) && !(B.state === 'dash' && B.sub === 'go')) {
    B.away = T.length ? 0 : B.away + dt;
    if (B.away > CAPT_AWAY) { captStart(B, 'return'); B.dash = null; B.via = null; }
  }
  if (B.state === 'wait' || B.state === 'return') {
    if (T.length) { captEngage(B); return; }
    if (B.state === 'return' && captWalkTo(B, captSpots(DG()).throne, CAPT_WALK, dt)) captStart(B, 'wait');
    if (B.state === 'wait') B.face = turnTo(B.face, Math.PI / 2, CAPT_TURN * dt);
    return;
  }
  if (B.phase === 2 && !['transition', 'flee'].includes(B.state)) {   // one more pirate through the door every CAPT_TRICKLE s
    if ((B.trickle += dt) >= CAPT_TRICKLE) { B.trickle = 0; if (dk.pirates.filter(p => p.door).length < captDoorMax()) captDoor(B, 1, 'Another pirate comes through the captain\'s blast door!'); }
  }
  const tel = (s) => s * CAPT_EASY_K[easy];
  if (B.state === 'buckshot') {
    if (B.sub === 'turn') {
      const c = captPick(B);
      if (c) {
        B.target = c.id;
        const a = Math.atan2(c.y - B.y, c.x - B.x), off = Math.abs(wrapAngle(a - B.face));
        B.face = turnTo(B.face, a, CAPT_TURN * dt);
        if (Math.hypot(c.x - B.x, c.y - B.y) > 6.5) captStep(B, c.x, c.y, CAPT_WALK, dt);
        if (off < 0.08 || B.t > CAPT_TURN_MAX) { B.sub = 'aim'; B.t = 0; B.aimA = B.face; }
      } else if (B.t > CAPT_TURN_MAX) { B.sub = 'aim'; B.t = 0; B.aimA = B.face; }
    } else if (B.sub === 'aim') {
      B.face = B.aimA;
      if (B.t >= tel(CAPT_TEL[ph])) {
        const M = captMuzzle(B, B.aimA);
        for (let i = 0; i < CAPT_PELLETS; i++) {
          const a = B.aimA + (i / (CAPT_PELLETS - 1) * 2 - 1) * CAPT_SPREAD + (Math.random() - 0.5) * 0.06, v = CAPT_PELLET_V * (0.92 + Math.random() * 0.16);
          boarding.bolts.push({ x: M.x, y: M.y, z: M.z, ox: M.x, oy: M.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: CAPT_PELLET_LIFE, owner: 'captain', kind: 'pellet' });
        }
        B.fireT = B.clock; B.shots--; B.sub = 'recover'; B.t = 0; sfx.heavyLaunch();
      }
    } else if (B.sub === 'recover' && B.t >= CAPT_RECOVER[ph]) {
      if (B.shots > 0) { B.sub = 'turn'; B.t = 0; } else captNext(B);
    }
  } else if (B.state === 'spin') {
    if (B.sub === 'plant') { if (B.t >= CAPT_PLANT[ph] * CAPT_EASY_K[easy]) { B.sub = 'spin'; B.t = 0; B.spinA = 0; B.emitT = 0; } }
    else {
      const w = CAPT_SPIN_W[ph], da = w * dt;
      B.face += da; B.spinA += da;
      for (B.emitT -= dt; B.emitT <= 0; B.emitT += CAPT_SPIN_EVERY) {
        if ((B.t % CAPT_SPIN_GAP) > CAPT_SPIN_ON) continue;                      // the gaps in the spiral
        for (let k = 0; k < B.arms; k++) {
          const a = B.face + CAPT_SPIN_MUZZLE + k * TAU / B.arms, ox = B.x + Math.cos(a) * 1.0, oy = B.y + Math.sin(a) * 1.0;
          boarding.bolts.push({ x: ox, y: oy, z: 0.85, ox, oy, vx: Math.cos(a) * CAPT_BOLT_V, vy: Math.sin(a) * CAPT_BOLT_V, life: CAPT_BOLT_LIFE, owner: 'captain', kind: 'spin' });
        }
        B.shots++;
      }
      if (B.spinA >= CAPT_SPIN_TURNS * TAU) { B.face = wrapAngle(B.face); captNext(B); }
    }
  } else if (B.state === 'breath') {
    if (B.sub === 'step') {
      const back = B.face + Math.PI;
      captStep(B, B.x + Math.cos(back), B.y + Math.sin(back), 2, dt);
      if (B.t >= 0.5) { B.sub = 'pant'; B.t = 0; }
    } else if (B.t >= CAPT_BREATH[ph] + CAPT_EASY_BREATH[easy]) captNext(B);
  } else if (B.state === 'whistle') {
    if (B.t >= CAPT_WHISTLE) { B.step = Math.max(-1, B.step); captNext(B); }
  } else if (B.state === 'transition') {
    if (!B.coat && B.t >= 1.3) { B.coat = { x: B.x - Math.cos(B.face) * 1.1, y: B.y - Math.sin(B.face) * 1.1 }; sfx.whoosh?.(); }
    if (B.t >= 0.5 && !B.waved) { B.waved = true; captDoor(B, captWave(crewSize()), 'A pirate wave pours in through the blast door!'); }
    if (B.t >= CAPT_TRANSITION) { B.phase = 2; B.step = -1; B.trickle = 0; captNext(B); }
  } else if (B.state === 'dash') captDashUpdate(B, dt, tel);
  else if (B.state === 'dazed') { if (B.t >= CAPT_DAZE + CAPT_EASY_DAZE[easy]) captNext(B); }
  else if (B.state === 'flee') captFleeUpdate(B, dt);
}
function captDashPlan(B, tx, ty) {
  const a = Math.atan2(ty - B.y, tx - B.x), want = Math.min(CAPT_DASH_MAX, Math.hypot(tx - B.x, ty - B.y) + CAPT_DASH_OVER);
  let s = 0, hit = false;
  while (s < want) { const n = Math.min(want, s + 0.05); if (!captOk(B.x + Math.cos(a) * n, B.y + Math.sin(a) * n)) { hit = true; break; } s = n; }
  return { a, x0: B.x, y0: B.y, x1: B.x + Math.cos(a) * s, y1: B.y + Math.sin(a) * s, len: s, hit, s: 0, laid: 0, struck: [] };
}
function captDashUpdate(B, dt, tel) {
  if (B.sub === 'tele') {
    if (!B.dash) {
      const c = captPick(B);
      const tx = c ? c.x : B.x + Math.cos(B.face) * 4, ty = c ? c.y : B.y + Math.sin(B.face) * 4;
      B.dash = captDashPlan(B, tx, ty);
    }
    B.face = turnTo(B.face, B.dash.a, CAPT_TURN * 2 * dt);
    if (B.t >= tel(CAPT_DASH_TEL)) { B.sub = 'go'; B.t = 0; B.face = B.dash.a; sfx.whoosh?.(); }
    return;
  }
  const D = B.dash, x0 = B.x, y0 = B.y;
  D.s = Math.min(D.len, D.s + CAPT_DASH_V * dt);
  B.x = D.x0 + Math.cos(D.a) * D.s; B.y = D.y0 + Math.sin(D.a) * D.s; B.walk += CAPT_DASH_V * dt;
  while (D.laid + CAPT_TRAIL_STEP <= D.s) {                    // the fire trail behind him
    D.laid += CAPT_TRAIL_STEP;
    B.trail.push({ x: D.x0 + Math.cos(D.a) * D.laid, y: D.y0 + Math.sin(D.a) * D.laid, life: CAPT_TRAIL, hp: 1, k: B.trail.length % 2 });
  }
  for (const c of crew) {                                      // anyone in his way: a hit, knocked aside
    if (c.mode !== 'inside' || D.struck.includes(c.id) || !segCircle(x0, y0, B.x, B.y, c.x, c.y, 0.7)) continue;
    D.struck.push(c.id); hurtCrew(c); combat.hits.crew++; sfx.hit(true);
    const side = Math.sign(-Math.sin(D.a) * (c.x - B.x) + Math.cos(D.a) * (c.y - B.y)) || 1;
    for (const s of [side, -side]) { const kx = c.x - Math.sin(D.a) * 1.2 * s, ky = c.y + Math.cos(D.a) * 1.2 * s; if (canStand(kx, ky, walkRects())) { c.x = kx; c.y = ky; break; } }
    combatBanner(`${c.name} got run over by the captain's dash!`);
  }
  if (D.s >= D.len) {
    if (D.hit) { captStart(B, 'dazed'); B.dazeT = B.clock; B.dash = null; captSay(B, 'CRUNCH!'); sfx.explosion(); combatBanner('CRUNCH! He slammed into it — DAZED: his shield is down, double damage from any side!'); }
    else { captStart(B, 'spin', { sub: 'plant', arms: 3 }); B.dash = null; }
  }
}
function captFleeUpdate(B, dt) {
  const S = captSpots(DG()), d = dk.dock;
  if (B.sub === 'burst') { if (B.t >= 1.2) { B.sub = 'walk'; B.t = 0; B.pod = 'open'; sfx.hatch(); } return; }
  if (B.sub === 'walk') {
    if (captWalkTo(B, S.pod, 1.6, dt) || B.t > 12) { Object.assign(B, { x: S.pod.x, y: S.pod.y, hidden: true, sub: 'pod', t: 0, pod: 'closed' }); captSay(B, 'THIS ISN\'T OVER!'); combatBanner('CAPTAIN RED COMET: "THIS ISN\'T OVER!"'); sfx.hatch(); }
    return;
  }
  if (B.sub === 'pod' && B.t >= 1.4) {
    B.pod = 'launched'; B.fled = true; B.red = false; captStart(B, 'gone'); B.goneT = B.clock; sfx.explosion();
    if (d.doors[4]) { d.doors[4] = false; sfx.hatch(); }
    combatBanner('His escape pod launched — he\'ll be back. The brig door\'s lockdown is off: get Dr. Varga!');
  }
}
// The fire trail: burns out over CAPT_TRAIL s (or the extinguisher puts it out); stepping in it hurts (once a second and a half).
function captTrail(B, dt) {
  for (const f of B.trail) { f.life -= dt; if (f.life <= 0) f.hp = 0; }
  B.trail = B.trail.filter(f => f.hp > 0);
  for (const id in B.burn) B.burn[id] = Math.max(0, B.burn[id] - dt);
  for (const c of crew) {
    if (c.mode !== 'inside' || (B.burn[c.id] || 0) > 0 || !B.trail.some(f => Math.hypot(f.x - c.x, f.y - c.y) < 0.45)) continue;
    B.burn[c.id] = 1.5; hurtCrew(c); combatBanner(`${c.name} stepped into the fire trail!`); sfx.hit(false);
  }
}
function captainSpray(a, dt) {
  const B = dk.boss;
  if (!B) return;
  for (const f of B.trail) {
    const d = Math.hypot(f.x - player.x, f.y - player.y), off = Math.abs(wrapAngle(Math.atan2(f.y - player.y, f.x - player.x) - a));
    if (d < 0.6 || (d < SPRAY_RANGE && off < 0.45)) f.hp -= SPRAY_RATE * 1.5 * dt;
  }
}
// Our bolt vs him (js/invader.js boltHitsBody): the generator behind him, or his body (the front shield ripples them off,
// armour from the back; dazed: no shield, double damage anywhere). Returns { k, hit } (how far along the step) or null.
function captainBoltTest(b, x0, y0) {
  const B = dk.boss;
  if (!B || B.hidden || B.state === 'gone' || dk.dock?.kind !== 'base') return null;
  const G = captGen(B), lz = GFX.lift(b.z || 0), gy = G.y - GFX.lift(CAPT_GEN_Z), n = Math.max(1, Math.ceil(Math.hypot(b.x - x0, b.y - y0) / 0.03));
  let kg = -1;
  for (let i = 0; i <= n; i++) { const k = i / n; if (Math.hypot(x0 + (b.x - x0) * k - G.x, y0 + (b.y - y0) * k - lz - gy) <= CAPT_GEN_R) { kg = k; break; } }
  const kb = segBody(x0, y0, b.x, b.y, b.z, B.x, B.y, CAPT_BODY.r, CAPT_BODY.top);
  if (kg < 0 && kb < 0) return null;
  const gen = kg >= 0 && (kb < 0 || kg <= kb), k = gen ? kg : kb;
  return { k, hit: () => captBoltHit(B, b, gen) };
}
function captBoltHit(B, b, gen) {
  const from = crew.filter(c => c.mode === 'inside').sort((p, q) => Math.hypot(p.x - (b.ox ?? b.x), p.y - (b.oy ?? b.y)) - Math.hypot(q.x - (b.ox ?? b.x), q.y - (b.oy ?? b.y)))[0];
  if (from) B.lastHit = from.id;
  const dazed = B.state === 'dazed', sp = Math.hypot(b.vx, b.vy) || 1, front = (-b.vx / sp) * Math.cos(B.face) + (-b.vy / sp) * Math.sin(B.face) > -0.08;
  if (captVuln(B) && (gen || dazed)) {
    captHurt(B, boltDamage(b) * (dazed ? 2 : 1));
    for (let i = 0; i < 10; i++) combatFxAt(1.3, b.x, b.y, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.45, i % 2 ? '#7ad0ff' : '#e8f8ff', 0.1);
    return;
  }
  if (!captVuln(B) || front) { B.ripT = B.clock; sfx.shieldBlock?.(); for (let i = 0; i < 6; i++) combatFxAt(b.z || 0.9, b.x, b.y, -b.vx / sp * 3 + (Math.random() - 0.5) * 3, -b.vy / sp * 3 + (Math.random() - 0.5) * 3, 0.3, '#5ab0ff', 0.08); }
  else { sfx.clank(); for (let i = 0; i < 4; i++) combatFxAt(b.z || 0.9, b.x, b.y, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 0.25, '#ffe0a0', 0.06); }
}

// ---------------------------------------------------------------------------
// The raid (2+ players): a raider at our other airlock, its tube walkable, two pirates after our fuel
// ---------------------------------------------------------------------------
function captRaidTrigger(B) {
  if (B.raided || dk.raid || crewSize() < 2 || (typeof mission !== 'undefined' && mission.jump)) return;
  if (B.raidAt != null && B.clock >= B.raidAt) { B.raided = true; startRaid(dk.dock.side === 'port' ? 'star' : 'port'); }
}
function raidGeom(R) { return dockGeom(R.side); }
const raidRects = () => (dk.raid?.state === 'docked' ? [raidGeom(dk.raid).tube] : []);
const raidHome = (R) => { const tq = raidGeom(R).tube; return { x: R.side === 'port' ? tq.x + 0.4 : tq.x + tq.w - 0.4, y: tq.y + tq.h / 2 }; };
const inRaidTube = (x, y) => !!dk.raid && dk.raid.state === 'docked' && inRect(x, y, raidGeom(dk.raid).tube) && !roomAt(x, y);
function startRaid(side) {
  const R = dk.raid = { side, state: 'docked', stolen: [], leaveT: null }, H = raidHome(R);
  for (let i = 0; i < 2; i++) dk.pirates.push({ uid: newUid(), x: H.x + (side === 'port' ? 0.5 : -0.5) * i, y: H.y + (i ? 0.25 : -0.25), face: side === 'port' ? 0 : Math.PI, walk: 0, hp: PIRATE_HP, carry: null, state: 'steal',
                                                cd: 1.5 + i, aim: 0, route: [], stuck: 0, stun: 0, flash: 0, raid: true, loots: 0 });
  combatBanner(`A Red Comet raider docked at our ${side === 'port' ? 'left' : 'right'} airlock while we're busy — two pirates are after our fuel cells!`); sfx.explosion();
}
function raidRoute(x, y, tx, ty) {
  const H = HATCHES.find(h => h.side === dk.raid.side), hin = { x: H.inside[0], y: H.inside[1] };
  const nav = (ax, ay, bx, by) => navPath(nearestNav(ax, ay), nearestNav(bx, by)).map(n => ({ x: NAV.nodes[n].x, y: NAV.nodes[n].y }));
  const out = (px, py) => inRaidTube(px, py) || airlockAt(px, py) === H, way = airlockWay(H);   // (the tube, or our airlock's chamber: js/airlock.js)
  const a = out(x, y), b = out(tx, ty);
  let pts = a && b ? [] : a ? [...way, hin, ...nav(hin.x, hin.y, tx, ty)] : b ? [...nav(x, y, hin.x, hin.y), hin, ...way.slice().reverse()] : nav(x, y, tx, ty);
  pts.push({ x: tx, y: ty });
  const clear = (q) => { const n = Math.ceil(Math.hypot(q.x - x, q.y - y) / 0.15); for (let i = 1; i <= n; i++) if (!pirateOk(x + (q.x - x) * i / n, y + (q.y - y) * i / n)) return false; return true; };
  while (pts.length > 1 && clear(pts[1])) pts.shift();
  return pts;
}
// A raid pirate (updatePirate hands over here): fetch a fuel cell twice (from the crate, or one lying about on the lower deck), then home.
function raidPirateMove(p, dt) {
  const R = dk.raid;
  if (!R || R.state !== 'docked') return;
  let goal = null;
  const loot = ITEMS.filter(it => it.kind === 'fuel' && roomAt(it.x, it.y) && deckOf(it.y) === deckOf(FUEL_CRATE.y));   // (fuel only: the crate, or a cell lying about on the lower deck)
  if (power.reserve > 0) loot.push({ x: FUEL_CRATE.x + 0.95, y: FUEL_CRATE.y, crate: true });   // (just clear of the crate: a spot they can stand on)
  if (!p.carry && !p.done && (p.loots >= PIRATE_LOOT || !loot.length || R.leaveT != null)) { p.done = true; combatBanner('A raider pirate heads back to their ship'); }
  if (p.carry || p.done) goal = { ...raidHome(R), home: true };
  else goal = loot.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  if (!goal) return;
  const key = `${goal.x.toFixed(1)},${goal.y.toFixed(1)}`;
  if (!p.route.length || p.goalKey !== key) { p.route = raidRoute(p.x, p.y, goal.x, goal.y); p.goalKey = key; }
  const n = p.route[0], moved = n ? pirateStep(p, n.x, n.y, dt) : 0;
  if (n && Math.hypot(n.x - p.x, n.y - p.y) < 0.2) p.route.shift();
  p.stuck = moved < 0.002 && Math.hypot(goal.x - p.x, goal.y - p.y) > 0.5 ? p.stuck + dt : 0;
  if (p.stuck > 3) { p.route = []; p.stuck = 0; }
  if (Math.hypot(goal.x - p.x, goal.y - p.y) < 0.5) {
    if (goal.home) { if (p.carry) { R.stolen.push(p.carry); p.carry = null; p.loots++; sfx.clank(); } else p.home = true; }
    else if (goal.crate) { power.reserve--; p.carry = 'fuel'; sfx.clank(); combatBanner('A raider pirate grabbed a fuel cell!'); p.route = []; }
    else { const i = ITEMS.indexOf(goal); if (i >= 0) { ITEMS.splice(i, 1); p.carry = goal.kind; sfx.clank(); combatBanner(`A raider pirate grabbed the ${ITEM_NAMES[goal.kind]}!`); p.route = []; } }
  }
}
function updateRaid(dt) {
  const R = dk.raid;
  if (!R || R.state !== 'docked') return;
  const H = HATCHES.find(h => h.side === R.side);   // (docked: its tube connects at our outer airlock, a plain passage: js/airlock.js)
  const P = dk.pirates.filter(p => p.raid);
  if (R.leaveT == null && (P.every(p => p.home) || (typeof mission !== 'undefined' && mission.jump))) {
    R.leaveT = P.length && !mission.jump ? LEAVE_DELAY : 1;
    if (P.length) combatBanner(`The raider's crew is back aboard — they cast off in ${Math.ceil(R.leaveT)} s!`);
  }
  if (R.leaveT != null && (R.leaveT -= dt) <= 0) {
    const tube = raidGeom(R).tube;
    for (const c of crew) if (c.mode === 'inside' && inRect(c.x, c.y, tube) && !roomAt(c.x, c.y)) [c.x, c.y] = H.inside;
    for (const c of crew) if (c.mode === 'inside' && inDockEntry(c.x, c.y, 'raid')) {   // (in its smashed cockpit: cast adrift, js/dockentry.js)
      const e = dockEntries().find(e => e.ship === 'raid'); c.mode = 'eva'; [c.x, c.y] = e.outside; combatBanner(`${c.name} was left in the raider's cockpit — cast adrift!`);
    }
    for (const it of ITEMS) if (inRect(it.x, it.y, tube) && !roomAt(it.x, it.y)) [it.x, it.y] = H.inside;
    dk.pirates = dk.pirates.filter(p => !p.raid || roomAt(p.x, p.y) && !inRect(p.x, p.y, tube));
    for (const p of dk.pirates) if (p.raid) { delete p.raid; p.done = true; }   // (one left on our ship: stays and fights)
    R.state = 'gone'; sfx.hatch();
    const n = R.stolen.length;
    combatBanner(n ? `The raider cast off with ${n === 1 ? 'a' : n} ${n === 1 ? 'fuel cell' : 'stolen things'}.` : 'The raider cast off empty-handed!');
  }
}

// ---------------------------------------------------------------------------
// Drawing. With sprites: chars/captain/p{1,2}_* (8 dirs, ground origin between his feet), fx/boss_* (the shield
// in a back and a front half around him, the bubble, the generator burst, muzzle blast, pellets and bolts, the dash
// line, the fire trail, the dazed stars). 2D fallback: a bigger red crew figure, a blue arc (the shield) and a blue
// box (the generator). Telegraphs on the floor (glowLayer): the buckshot cone, the spin ring, the dash line.
// ---------------------------------------------------------------------------
function captAnim(B) {
  const p = `chars/captain/p${B.phase}_`, mv = actorMoving('captain', B.walk), wf = Math.floor(B.walk / TAU * 8), c = B.clock;
  switch (B.state) {
    case 'buckshot': return B.sub === 'recover' ? [p + 'fire_buckshot', Math.min(2, Math.floor(B.t / 0.12))] : B.sub === 'aim' ? [p + 'aim_buckshot', 0] : mv ? [p + 'walk', wf] : [p + 'aim_buckshot', 0];
    case 'spin': return B.sub === 'spin' ? [p + 'spin', Math.floor(c * 30) % 2] : [p + 'aim_buckshot', 0];
    case 'breath': return B.sub === 'step' ? [p + 'walk', wf] : [p + 'catch_breath', Math.floor(c * 5)];
    case 'whistle': return ['chars/captain/p1_whistle', Math.min(3, Math.floor(B.t / CAPT_WHISTLE * 4))];
    case 'transition': return ['chars/captain/p1_coat_off', clamp(Math.floor((B.t - 0.3) / 0.25), 0, 5)];
    case 'dash': return B.sub === 'go' ? ['chars/captain/p2_dash', Math.floor(c * 14) % 2] : ['chars/captain/p2_aim_buckshot', 0];
    case 'dazed': return ['chars/captain/p2_dazed', Math.floor(c * 6)];
    case 'flee': return ['chars/captain/p2_defeated_stagger', Math.floor(c * 8)];
    default: return mv ? [p + 'walk', wf] : [p + 'idle', Math.floor(c * 4)];
  }
}
function captShieldState(B) {          // [sprite base, frame] of the front shield (or null)
  const c = B.clock;
  if (B.state === 'transition' || B.hidden || B.state === 'gone') return null;
  if (B.state === 'dazed') { const k = Math.floor((c - B.dazeT) / 0.07); return k < 6 ? ['fx/boss_shield_off', k] : null; }
  if (B.state === 'flee') { const k = Math.floor((c - B.burstT) / 0.07); return k < 6 ? ['fx/boss_shield_off', k] : null; }
  if (c - B.ripT < 0.36) return ['fx/boss_shield_hit', Math.floor((c - B.ripT) / 0.06)];
  return ['fx/boss_shield', Math.floor(c * 10)];
}
function drawCaptain(t) {
  const B = dk.boss;
  captainSounds(B && dk.dock?.kind === 'base' ? B : null);
  if (!B || dk.dock?.kind !== 'base' || B.hidden || B.state === 'gone') return;
  const view = camera(), c = B.clock;
  let sprited = false;
  if (GFX.on) {
    const [name, f] = captAnim(B), sh = captShieldState(B), bubble = B.state === 'transition';
    if (!GFX.ready(name)) GFX.preload(['chars', 'fx']);
    const bf = bubble ? (B.t < CAPT_TRANSITION - 0.6 ? Math.floor(c * 10) % 4 : 4 + Math.min(3, Math.floor((B.t - (CAPT_TRANSITION - 0.6)) / 0.15))) : 0;
    if (sh) GFX.sprite(sh[0] + '_back', GFX.frameIndex(sh[0] + '_back', B.face, sh[1]), B.x, B.y, 0, { sortY: B.y - 0.02, unlit: true, alpha: 0.85 });
    if (bubble) GFX.sprite('fx/boss_bubble_back', bf, B.x, B.y, 0, { sortY: B.y - 0.02, unlit: true });
    sprited = GFX.sprite(name, GFX.frameIndex(name, B.face, f), B.x, B.y, 0, { emissive: 0.3, pick: [0.5, 1.9] });
    if (sprited) {
      if (sh) GFX.sprite(sh[0] + '_front', GFX.frameIndex(sh[0] + '_front', B.face, sh[1]), B.x, B.y, 0, { sortY: B.y + 0.02, unlit: true, alpha: 0.85 });
      if (bubble) GFX.sprite('fx/boss_bubble_front', bf, B.x, B.y, 0, { sortY: B.y + 0.02, unlit: true });
      if (c - B.fireT < 0.2) { const M = captMuzzle(B, B.aimA); GFX.sprite('fx/boss_muzzle', GFX.frameIndex('fx/boss_muzzle', B.aimA, Math.floor((c - B.fireT) / 0.05)), M.x, M.y, M.z, { layer: 'top', unlit: true }); }
      if (B.state === 'dazed') GFX.sprite('fx/boss_dazed', Math.floor(c * 10) % 8, B.x, B.y, 2.55, { layer: 'top', unlit: true });
      if (B.state === 'flee' && c - B.burstT < 0.75) { const G = captGen(B); GFX.sprite('fx/boss_gen_burst', Math.floor((c - B.burstT) / 0.0625), G.x, G.y, 0, { layer: 'top', unlit: true }); }
    }
  }
  if (!sprited) {                                         // 2D: a big red figure, the shield arc in front, the generator behind
    ctx.save(); ctx.translate(L(B.x), L(B.y)); ctx.scale(1.4, 1.4); drawCrew(0, 0, B.face, B.walk, false, B.phase === 1 ? '#a8241c' : '#6a3a34'); ctx.restore();
    const G = captGen(B);
    rr(L(G.x) - 7, L(G.y) - 7, 14, 14, 3); ctx.fillStyle = B.state === 'flee' ? '#3a404d' : '#4ab0ff'; ctx.fill(); stroke(2);
    const sh = captShieldState(B);
    if (B.state === 'transition') { ctx.beginPath(); ctx.arc(L(B.x), L(B.y), L(1.3), 0, TAU); ctx.strokeStyle = 'rgba(120,200,255,0.8)'; ctx.lineWidth = 5; ctx.stroke(); }
    else if (sh && sh[0] !== 'fx/boss_shield_off') { ctx.beginPath(); ctx.arc(L(B.x), L(B.y), L(1.0), B.face - 1.45, B.face + 1.45); ctx.strokeStyle = c - B.ripT < 0.3 ? '#e8f8ff' : 'rgba(90,170,255,0.85)'; ctx.lineWidth = 4; ctx.stroke(); }
    if (B.state === 'dazed') for (let i = 0; i < 3; i++) { const q = t * 4 + i * TAU / 3; ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(L(B.x) + Math.cos(q) * 14, L(B.y) - L(0.7) + Math.sin(q) * 5, 3, 0, TAU); ctx.fill(); }
  }
  if (B.flash > 0) { ctx.fillStyle = `rgba(160,220,255,${B.flash * 0.6})`; const G = captGen(B); ctx.beginPath(); ctx.arc(L(G.x), L(G.y - GFX.lift(CAPT_GEN_Z)), L(0.35), 0, TAU); ctx.fill(); }
  // name tag, speech
  const tag = () => {
    ctx.font = `900 ${T * 0.24}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText('CAPTAIN RED COMET', 0, 0); ctx.fillStyle = '#ff6a4a'; ctx.fillText('CAPTAIN RED COMET', 0, 0);
    const sub = { breath: 'CATCHING HIS BREATH', dazed: 'DAZED!', wait: '', return: '' }[B.state];
    if (sub) { ctx.font = `800 ${T * 0.17}px system-ui, sans-serif`; ctx.strokeText(sub, 0, T * 0.22); ctx.fillStyle = B.state === 'dazed' ? '#ffe08a' : '#9cd8ff'; ctx.fillText(sub, 0, T * 0.22); }
    if (B.say && c - B.say.t < 2.2) { ctx.font = `900 ${T * 0.3}px system-ui, sans-serif`; ctx.lineWidth = 5; ctx.strokeText(B.say.text, 0, -T * 0.32); ctx.fillStyle = '#fff2c8'; ctx.fillText(B.say.text, 0, -T * 0.32); }
    ctx.textAlign = 'left';
  };
  if (GFX.on) upright(view, B.x, B.y, 2.15, tag); else { ctx.save(); ctx.translate(L(B.x), L(B.y) - L(0.9)); tag(); ctx.restore(); }
}
// Speech once he's in the pod (drawn while hidden too).
function drawCaptainPod(B, view) {
  if (!B.hidden || !B.say || B.clock - B.say.t > 2.6) return;
  const S = captSpots(DG()), say = () => { ctx.font = `900 ${T * 0.3}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText(B.say.text, 0, 0); ctx.fillStyle = '#fff2c8'; ctx.fillText(B.say.text, 0, 0); ctx.textAlign = 'left'; };
  if (GFX.on) upright(view, S.pod.x, S.pod.y, 2.8, say); else { ctx.save(); ctx.translate(L(S.pod.x), L(S.pod.y) - L(1.4)); say(); ctx.restore(); }
}
// On the floor (after the base, under the actors): the thrown coat, the fire trail, the telegraphs; the raider.
function drawCaptainFloor(d, g, t) {
  drawRaid(t);
  const B = dk.boss;
  if (!B) return;
  const Q = g.rooms[5], c = B.clock, easy = captEasy(), ph = B.phase - 1;
  if (B.coat && !(GFX.on && GFX.sprite('chars/captain/coat_floor', 0, B.coat.x, B.coat.y, 0, { layer: 'decal' }))) { ctx.fillStyle = '#a8241c'; ctx.beginPath(); ctx.ellipse(L(B.coat.x), L(B.coat.y), L(0.6), L(0.3), 0.4, 0, TAU); ctx.fill(); stroke(2); }
  for (const f of B.trail) {
    const a = clamp(f.life / 1.2, 0, 1) * clamp(f.hp * 1.5, 0, 1), name = f.k ? 'fx/boss_trail_b' : 'fx/boss_trail_a';
    if (GFX.on && GFX.sprite(name, Math.floor(c * 12 + f.x * 3) % 8, f.x, f.y, 0, { unlit: true, alpha: a, sortY: f.y - 0.3 })) continue;
    for (let i = 0; i < 3; i++) { const h = L(0.35 + 0.15 * Math.sin(t * 9 + i + f.x)) * a; ctx.beginPath(); ctx.ellipse(L(f.x) + (i - 1) * 7, L(f.y) - h / 2, 5, h / 2, 0, 0, TAU); ctx.fillStyle = i % 2 ? '#ff9a2e' : '#d8401c'; ctx.fill(); }
  }
  if (B.hidden || B.state === 'gone') { drawCaptainPod(B, camera()); return; }
  glowLayer(() => {
    ctx.save(); ctx.beginPath(); ctx.rect(L(Q.x), L(Q.y), L(Q.w), L(Q.h)); ctx.clip();
    if (B.state === 'buckshot' && B.sub === 'aim') {        // the laser-sight cone, filling up as the shot comes
      const k = clamp(B.t / (CAPT_TEL[ph] * CAPT_EASY_K[easy]), 0, 1), M = captMuzzle(B, B.aimA), R = L(CAPT_PELLET_V * CAPT_PELLET_LIFE);
      const gr = ctx.createRadialGradient(L(M.x), L(M.y), 0, L(M.x), L(M.y), R);
      gr.addColorStop(0, `rgba(255,60,40,${0.15 + 0.35 * k})`); gr.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(L(M.x), L(M.y)); ctx.arc(L(M.x), L(M.y), R, B.aimA - CAPT_SPREAD, B.aimA + CAPT_SPREAD); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(255,90,90,${0.4 + 0.5 * k})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(L(M.x), L(M.y)); ctx.lineTo(L(M.x + Math.cos(B.aimA) * 11), L(M.y + Math.sin(B.aimA) * 11)); ctx.stroke();
    }
    if (B.state === 'spin' && B.sub === 'plant') {           // feet planted: a ring of warning round him
      const k = B.t / (CAPT_PLANT[ph] * CAPT_EASY_K[easy]);
      ctx.strokeStyle = `rgba(255,120,60,${0.4 + 0.5 * k})`; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 60;
      ctx.beginPath(); ctx.arc(L(B.x), L(B.y), L(1.2 + 0.6 * k), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    }
    if (B.state === 'dash' && B.dash && B.sub === 'tele' && !GFX.on) {   // (with sprites: fx/boss_dash_line below)
      const D = B.dash; ctx.strokeStyle = `rgba(255,70,40,${0.5 + 0.4 * Math.sin(t * 20)})`; ctx.lineWidth = L(0.34); ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(L(D.x0), L(D.y0)); ctx.lineTo(L(D.x1), L(D.y1)); ctx.stroke();
    }
    ctx.restore();
  });
  if (B.state === 'dash' && B.dash && B.sub === 'tele' && GFX.on) {
    const D = B.dash, n = Math.max(1, Math.round(D.len));
    for (let i = 0; i < n; i++) { const s = (i + 0.5) * D.len / n; GFX.sprite('fx/boss_dash_line', GFX.frameIndex('fx/boss_dash_line', D.a, Math.floor(c * 12)), D.x0 + Math.cos(D.a) * s, D.y0 + Math.sin(D.a) * s, 0, { layer: 'decal', unlit: true }); }
  }
}
// His shots: pellets (fx/boss_pellet) and the spin's bolts (fx/boss_bolt). Returns false for the 2D fallback.
function drawCaptainBolt(b) {
  if (!GFX.on) return false;
  if (b.kind === 'pellet') return GFX.sprite('fx/boss_pellet', Math.floor(b.life * 30) % 4, b.x, b.y, b.z || 1, { layer: 'top', unlit: true });
  return GFX.sprite('fx/boss_bolt', GFX.frameIndex('fx/boss_bolt', Math.atan2(b.vy, b.vx), Math.floor(b.life * 20)), b.x, b.y, b.z || 0.85, { layer: 'top', unlit: true });
}
// The raider at our other airlock: its ship and tube (sprites like a docked raider's; 2D: a hull and a tube).
function drawRaid(t) {
  const R = dk.raid;
  if (!R || R.state !== 'docked') return;
  const g = raidGeom(R), h = g.hatch, n = R.stolen.length;
  const ship = `dock/pirate_${R.side}`, tube = `dock/tube_${R.side}`, crate = n >= 2 ? 'dock/crate_loot_full' : n === 1 ? 'dock/crate_loot_one' : 'dock/crate_loot_empty';
  if (GFX.on && [ship, tube, crate, 'dock/pirate_reactor'].every(s => GFX.ready(s))) {
    const y0 = Math.min(...[...g.rooms, ...g.doors].map(q => q.y));
    GFX.sprite(ship, 0, h.x, h.y, 0, { layer: 'wall', sortY: y0 - 1, emissive: 0.35 });
    GFX.sprite(tube, 0, h.x, h.y, 0, { layer: 'wall', sortY: g.tube.y, emissive: 0.3 });
    GFX.sprite('dock/pirate_reactor', Math.floor(t * 3) % 6, g.core.x, g.core.y, 0, { layer: 'wall', sortY: g.core.y, emissive: 0.6 });
    GFX.sprite(crate, 0, g.crate.x, g.crate.y, 0, { layer: 'wall', sortY: g.crate.y, emissive: 0.2 });
    return;
  }
  if (GFX.on) GFX.preload(['dock']);
  const all = [...g.rooms, ...g.doors], x0 = Math.min(...all.map(q => q.x)) - 0.7, x1 = Math.max(...all.map(q => q.x + q.w)) + 0.7, y0 = Math.min(...all.map(q => q.y)) - 0.7, y1 = Math.max(...all.map(q => q.y + q.h)) + 0.7;
  rr(L(x0), L(y0), L(x1 - x0), L(y1 - y0), 18); ctx.fillStyle = '#4a3a40'; ctx.fill(); stroke(4);
  rr(L(x0) + 6, L(y0) + 6, L(x1 - x0) - 12, L(y1 - y0) - 12, 14); ctx.strokeStyle = '#a83a3a'; ctx.lineWidth = 3; ctx.stroke();
  const tq = g.tube; rr(L(tq.x), L(tq.y) - 6, L(tq.w), L(tq.h) + 12, 10); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(3);
  ctx.fillStyle = 'rgba(30,34,42,0.5)'; ctx.fillRect(L(tq.x), L(tq.y), L(tq.w), L(tq.h));
}
// Screen space: his health bar while the fight is on (and for whoever is in the base): the name, the 75 % and 50 % ticks.
function drawCaptainScreen(view, t) {
  const B = dk.boss;
  if (!B || !B.met || dk.dock?.kind !== 'base' || (B.state === 'gone' && B.clock - (B.goneT || 0) > 4) || !inBase(me.x, me.y)) return;
  const w = Math.min(560, VW * 0.5), h = 16, x = (VW - w) / 2, y = HUD_H + 112, k = B.hp / B.max;
  ctx.fillStyle = 'rgba(10,12,18,0.8)'; ctx.fillRect(x - 6, y - 26, w + 12, h + 34);
  ctx.font = '900 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff6a4a'; ctx.fillText(`CAPTAIN RED COMET${B.phase === 2 && B.state !== 'gone' ? ' · COMET MODE' : B.state === 'gone' ? ' · ESCAPED' : ''}`, VW / 2, y - 13);
  ctx.fillStyle = '#2b303a'; ctx.fillRect(x, y, w, h);
  const hurt = B.flash > 0 && Math.sin(t * 40) > 0;
  ctx.fillStyle = hurt ? '#ffffff' : B.state === 'transition' ? '#7ad0ff' : B.phase === 2 ? '#ff5a3a' : '#e2574c'; ctx.fillRect(x, y, w * k, h);
  ctx.fillStyle = 'rgba(232,236,244,0.9)'; for (const q of [0.75, 0.5]) ctx.fillRect(x + w * q - 1, y - 3, 2, h + 6);
  ctx.strokeStyle = 'rgba(232,236,244,0.6)'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
  ctx.textAlign = 'left';
}
// Sounds heard from the synced state (the telegraph whines; one-shots come from the simulation).
const captHeard = { key: null, stop: null };
function captainSounds(B) {
  const key = B && B.state === 'dash' && B.sub === 'tele' ? 'dash' : B && B.state === 'buckshot' && B.sub === 'aim' ? 'aim' : null;
  if (key === captHeard.key) return;
  if (captHeard.stop) { captHeard.stop(); captHeard.stop = null; }
  captHeard.key = key;
  if (key) captHeard.stop = sfx.charge(Math.max(0.2, (key === 'aim' ? CAPT_TEL[B.phase - 1] : CAPT_DASH_TEL) * CAPT_EASY_K[captEasy()] - B.t));
}
function captainPlates(add) {
  const B = dk.boss;
  if (B && B.met && B.state !== 'gone') {
    const pct = Math.ceil(B.hp / B.max * 100);
    const sub = { buckshot: 'BUCKSHOT — dodge the cone or duck behind cover', spin: 'SPIN — slip through the gaps; his generator swings past', breath: 'catching his breath — get behind him, shoot the generator!',
                  whistle: 'ALL HANDS — pirates through the blast door', transition: 'shield bubble — invulnerable', dash: B.sub === 'go' ? 'DASHING!' : 'DASH — get off the glowing line (lure him into cover)',
                  dazed: 'DAZED — shield down: double damage from any side!', flee: 'beaten — running for his escape pod', wait: 'on his throne · walk in to fight', return: 'back to his throne' }[B.state] || '';
    add('captain', { icon: 'frigate', title: `RED COMET · ${pct}%`, sub: (B.phase === 2 ? 'COMET MODE · ' : '') + sub, stripe: '#ff6a4a', red: ['buckshot', 'spin', 'dash'].includes(B.state), wrap: true });
  }
  const R = dk.raid;
  if (R?.state === 'docked') add('raid', { icon: 'frigate', title: 'RAIDER DOCKED', sub: `${SIDE_LABEL[R.side].toLowerCase()} airlock · ${dk.pirates.filter(p => p.raid).length} pirates after our fuel · ${R.stolen.length} stolen`, stripe: '#e2574c', red: true });
}
