// Ship systems: energy (reactor, distribution lever, capacitors), breakable parts and
// repairs, the inventory (weapon slot + item slot) with items lying around, and the
// hand weapons (laser gun, heavy blaster, wrench toss). Units: layout units.

const CELL_ENERGY = 5, ENERGY_TIME = 20, REPAIR_TIME = 5;
let SHOTS_PER_ENERGY = 3;                              // (ship upgrades: see progress.js)
// Power lever: its position is the capacitor index it feeds, laid out left → right on the
// dial (port, middle, starboard). Auto mode steps right and wraps: mid → stbd → port → mid.
const LEVER_NAMES = ['LEFT', 'MID', 'RIGHT'];
const LEVER = { x: 22.2, y: 22.75 }, LEVER_HUB = 0.22;
const leverAngle = (i) => -Math.PI / 2 + (i - 1) * 0.9;
const FUEL_CRATE = { x: 17.4, y: 19.6 };
const REACH = 1.9;                                // how far you can reach to click things
const LASER_COOLDOWN = 0.9, WRENCH_COOLDOWN = 8, BOLT_SPEED = 26, WRENCH_SPEED = 13;
// Heavy blaster (weapons specialist gear): slower shots of 1-2 damage; hold to charge a 3-damage blast
// (outside it also flies on as a cannon shell). Carrying it slows you a bit, charging a lot.
const BLASTER_COOLDOWN = LASER_COOLDOWN / 0.66, BLASTER_CHARGE = 1.5, BLASTER_SLOW_AFTER = 0.2;
const BLASTER_CARRY_SPEED = 0.85, BLASTER_CHARGE_SPEED = 0.3;
const OVERCHARGE_FIRE = 0.1;                      // overcharged reactor: chance per energy that it catches fire

const power = {
  reactor: { fuel: CELL_ENERGY, t: 0 },          // energy left in the loaded cell, progress to the next one
  reserve: 3,                                     // spare fuel cells in the crate
  lever: { pos: 1, jammed: false, angle: 0 },     // starts on MID; jammed = a wrench wedged in front of the handle
  bolts: [],                                      // energy travelling from the reactor to a capacitor
  pulses: [],                                     // energy travelling from a capacitor to what used it
  patch: [0, 1, 2],                               // patch board: lever output → capacitor it feeds
  overcharge: false,                              // an engineer overcharged it: double speed, may catch fire
};
let inv = { weapon: null, item: null, cd: 0 };     // the acting crew member's inventory (see withCrew)
const ITEMS = [
  { kind: 'repair', x: 1.6, y: 22.35 },          // the one repair kit, bottom left
  { kind: 'laser', x: 42.4, y: 22.4 },
  { kind: 'extinguisher', x: 15.3, y: 2.2 },     // bridge
  { kind: 'extinguisher', x: 31.7, y: 3.8 },     // starboard cannon room
];
const ITEM_NAMES = { repair: 'repair kit', laser: 'laser gun', heavy: 'heavy blaster', fuel: 'fuel cell', extinguisher: 'fire extinguisher', plate: 'hull plate',
                     coolant: 'coolant canister', blackbox: 'black box', drill: 'mining drill', ore: 'ore sample' };
const WEAPONS = new Set(['repair', 'laser', 'heavy', 'extinguisher', 'drill']);
const slotOf = (kind) => WEAPONS.has(kind) ? 'weapon' : 'item';

// ---------------------------------------------------------------------------
// Breakable systems. col: which zone column a hit on that side damages.
// ---------------------------------------------------------------------------
const SYSTEMS = [
  ...GUNS.map(g => ({ kind: 'cannon', ref: g, col: { front: 1, port: 0, star: 2 }[g.id], x: g.hatch[0], y: g.hatch[1], name: g.name })),
  ...SHIELD_BUTTONS.map(b => ({ kind: 'shield', ref: b, col: SIDE_CAP[b.side], x: b.x, y: b.y, name: `${SIDE_LABEL[b.side]} shield button` })),
  ...CAPACITORS.map((c, i) => ({ kind: 'capacitor', ref: c, col: i, x: c.x, y: c.y, name: `${['Left', 'Middle', 'Right'][i]} capacitor` })),
  { kind: 'reactor', ref: REACTOR, col: 1, x: REACTOR.x, y: REACTOR.y, name: 'Reactor', r: 1.9 },
  { kind: 'lever', ref: LEVER, col: 1, x: LEVER.x, y: LEVER.y, name: 'Power lever' },
  ...DECK_LOCKS.map(L => ({ kind: 'lock', ref: L, col: L.col, x: L.x + L.w / 2, y: (SPINE_Y0 + SPINE_Y1) / 2, name: `${['Left', 'Middle', 'Right'][L.col]} deck airlock`, r: 2.4 })),
  ...HATCHES.map(h => ({ kind: 'hatch', ref: h, col: h.side === 'port' ? 0 : 2, x: h.inside[0] - h.dir * 0.4, y: h.inside[1], name: `${h.side === 'port' ? 'Left' : 'Right'} outer airlock` })),
].map(s => ({ ...s, broken: false, r: s.r || 1.0 }));
const broken = (ref) => !!SYSTEMS.find(s => s.ref === ref)?.broken;

function breakSystem(s) {
  s.broken = true;
  sfx.spark(); sfx.clank();
  combatBanner(`${s.name} broken!`);
  for (let i = 0; i < 14; i++) combatFx(s.x, s.y, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 0.7, i % 2 ? '#ffb347' : '#6a6f7a', 0.12);
}
// Hits on the hull damage systems in the zone column that was hit.
function damageColumn(side, large) {
  const col = side === 'port' ? 0 : side === 'star' ? 2 : 1;
  const intact = SYSTEMS.filter(s => s.col === col && !s.broken);
  const taped = intact.filter(s => s.taped);              // quick tape jobs give first
  if (large && taped.length) { breakSystem(taped[0]); taped[0].taped = false; return; }
  const n = large ? (Math.random() < (lucky() ? 0.1 : 0.3) ? 2 : 1) : 0;
  for (let i = 0; i < n && intact.length; i++) breakSystem(intact.splice(Math.floor(Math.random() * intact.length), 1)[0]);
}

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------
const capBroken = (i) => broken(CAPACITORS[i]);
// line: the power line the energy leaves through (a pulse runs along it to the consumer)
function useEnergy(i, line) {
  const c = CAPACITORS[i];
  if (capBroken(i) || c.charge <= 0) return false;
  c.charge--;
  if (line) power.pulses.push({ line, t: 0 });
  return true;
}

// ---------------------------------------------------------------------------
// Power lines: the cables actually carry the energy. Reactor → each capacitor (feed), and each
// capacitor → its shield button and its cannon ladder. A line glows while its capacitor holds
// charge; energy runs along it as a pulse when it's delivered or used.
// ---------------------------------------------------------------------------
const POWER_LINES = [
  { id: 'feed0', cap: 0, feed: true, pts: [[20.3, 20.2], [18.6, 21.2], [16.2, 20.8], [13.9, 19.4], [11.0, 20.6], [8.6, 21.6], [7.0, 22.1]] },
  { id: 'feed1', cap: 1, feed: true, pts: [[24.1, 20.2], [25.4, 21.6], [26.2, 23.0], [27.0, 24.4]] },
  { id: 'feed2', cap: 2, feed: true, pts: [[24.1, 19.8], [27.5, 20.4], [29.6, 19.8], [30.5, 19.6], [33.5, 20.6], [36.0, 21.6], [37.4, 22.4]] },
  { id: 'shield_port', cap: 0, pts: [[6.4, 22.1], [6.6, 20.0], [7.0, 17.4], [7.0, 15.8]] },
  { id: 'shield_front', cap: 1, pts: [[27.4, 24.4], [28.9, 22.8], [29.0, 18.5], [26.0, 16.6], [22.6, 15.9]] },
  { id: 'shield_star', cap: 2, pts: [[37.6, 22.4], [37.4, 20.0], [37.2, 17.4], [37.2, 15.8]] },
  { id: 'gun_port', cap: 0, pts: [[5.8, 22.4], [3.0, 21.2], [2.2, 18.0], [2.0, 15.0], [2.0, 11.4], [1.6, 9.4]] },
  { id: 'gun_front', cap: 1, pts: [[27.4, 24.6], [29.6, 23.0], [29.8, 18.0], [29.6, 11.4], [28.6, 6.0], [27.2, 1.5], [25.6, -1.2]] },
  { id: 'gun_star', cap: 2, pts: [[38.4, 22.6], [41.8, 21.0], [42.6, 18.0], [42.6, 15.0], [42.6, 11.4], [43.0, 9.2]] },
].map(l => {
  let len = 0; const seg = [0];
  for (let i = 1; i < l.pts.length; i++) { len += Math.hypot(l.pts[i][0] - l.pts[i - 1][0], l.pts[i][1] - l.pts[i - 1][1]); seg.push(len); }
  return { ...l, len, seg };
});
const LINE = Object.fromEntries(POWER_LINES.map(l => [l.id, l]));
function linePoint(l, k) {                          // point at fraction k (0..1) along a power line
  const d = clamp(k, 0, 1) * l.len;
  let i = 1; while (i < l.seg.length - 1 && l.seg[i] < d) i++;
  const q = (d - l.seg[i - 1]) / ((l.seg[i] - l.seg[i - 1]) || 1);
  return [lerp(l.pts[i - 1][0], l.pts[i][0], q), lerp(l.pts[i - 1][1], l.pts[i][1], q)];
}
function drawPowerLines(t) {
  for (const l of POWER_LINES) {
    const cap = CAPACITORS[l.cap], dead = capBroken(l.cap);
    const live = !dead && (l.feed ? power.reactor.fuel > 0 && !broken(REACTOR) : cap.charge > 0);
    const path = () => { ctx.beginPath(); l.pts.forEach(([x, y], i) => (i ? ctx.lineTo(L(x), L(y)) : ctx.moveTo(L(x), L(y)))); };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 11; ctx.save(); ctx.translate(2, 3); ctx.stroke(); ctx.restore();
    path(); ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.stroke();
    path(); ctx.strokeStyle = dead ? '#5a2a26' : live ? '#b8902e' : '#4a4a44'; ctx.lineWidth = 6; ctx.stroke();
    if (live) {                                       // energy flowing (slowly) towards the far end
      ctx.setLineDash([3, 14]); ctx.lineDashOffset = -t * 18;
      path(); ctx.strokeStyle = 'rgba(255,236,160,0.85)'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
    }
    for (let d = 2.5; d < l.len - 1; d += 3.5) {      // clamps
      const [x, y] = linePoint(l, d / l.len);
      rr(L(x) - 4, L(y) - 4, 8, 8, 2); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(1.2);
    }
  }
}
function deliverEnergy() {
  const i = power.patch[power.lever.pos];
  if (typeof surging === 'function' && surging('feed' + i)) {          // an arcing feed line: the energy is lost on the way
    combatBanner(`Energy lost — the ${lineName(LINE['feed' + i])} is arcing`); sfx.spark();
  } else power.bolts.push({ to: i, t: 0 });
  if (!power.lever.jammed && !broken(LEVER)) power.lever.pos = (power.lever.pos + 1) % 3;
}
function updatePower(dt) {
  const R = power.reactor;
  updateInserter(dt);
  if (power.overcharge && broken(REACTOR)) power.overcharge = false;
  if (R.fuel > 0 && !broken(REACTOR) && !(enc.scram > 0)) {
    R.t += dt * (power.overcharge ? 2 : 1);
    if (R.t >= ENERGY_TIME) {
      R.t = 0; R.fuel--; deliverEnergy();
      if (power.overcharge && Math.random() < OVERCHARGE_FIRE) igniteSystem(SYSTEMS.find(s => s.ref === REACTOR));
    }
  }
  for (const b of power.bolts) {
    b.t += dt / 0.9;
    if (b.t >= 1 && !b.done) {
      b.done = true;
      const c = CAPACITORS[b.to];
      if (capBroken(b.to) || c.charge >= CAP_MAX) {                  // full or broken: wasted
        for (let k = 0; k < 10; k++) combatFx(c.x, c.y - 0.3, (Math.random() - 0.5) * 3, -Math.random() * 3, 0.8, '#9cd8ff', 0.1);
        combatBanner(`Energy wasted — ${['left', 'middle', 'right'][b.to]} capacitor ${capBroken(b.to) ? 'broken' : 'full'}`);
      } else { c.charge++; c.pulse = 1; sfx.poi(); }
    }
  }
  power.bolts = power.bolts.filter(b => b.t < 1.2);
  for (const p of power.pulses) p.t += dt / 0.7;
  power.pulses = power.pulses.filter(p => p.t < 1);
  for (const c of CAPACITORS) c.pulse = Math.max(0, (c.pulse || 0) - dt * 2);
  const target = leverAngle(power.lever.pos);                            // handle points at the active output
  power.lever.angle = lerp(power.lever.angle || target, target, 1 - Math.exp(-10 * dt));
}

// ---------------------------------------------------------------------------
// Inventory and clicking things
// ---------------------------------------------------------------------------
function grab(kind) {
  const slot = slotOf(kind);
  if (inv[slot]) ITEMS.push({ kind: inv[slot], ...dropSpot(player.x + (Math.random() - 0.5) * 0.4, player.y + 0.35) });   // drop what you had
  inv[slot] = kind; sfx.clank();
}
// Somewhere on a fixed floor (a room or an airlock chamber), so a dropped item never ends
// up somewhere unreachable like a doorway.
function dropSpot(x, y) {
  const floors = [...ROOM_RECTS, ...DECK_LOCKS.map(Lk => Lk.chamber), ...(typeof dockRects === 'function' ? dockRects() : [])];
  if (floors.some(q => inRect(x, y, q, -0.3))) return { x, y };
  let best = null, bd = Infinity;
  for (const q of floors) {
    const px = clamp(x, q.x + 0.5, q.x + q.w - 0.5), py = clamp(y, q.y + 0.5, q.y + q.h - 0.5), d = Math.hypot(px - x, py - y);
    if (d < bd) { bd = d; best = { x: px, y: py }; }
  }
  return best;
}
const near = (x, y, r = REACH) => Math.hypot(player.x - x, player.y - y) <= r;

// What a left click on (mx, my) would do. Returns { text, ok, run?, repair?, x, y, r }.
function clickTarget(mx, my) {
  // crew members you can treat (or yourself, when you're down)
  for (const c of crew) {
    if (Math.hypot(mx - c.x, my - c.y) > 0.55 || c.mode === 'gun') continue;
    const info = treatInfo(c);
    if (!info) continue;
    if (c !== player && Math.hypot(player.x - c.x, player.y - c.y) > REACH) return { text: `${c.name} needs help — get closer`, ok: false, x: c.x, y: c.y, r: 0.55 };
    return { text: `Hold click: ${info.label} (${info.time} s)`, ok: true, treat: c, time: info.time, x: c.x, y: c.y, r: 0.55 };
  }
  if (!standing(player)) return null;                                      // down: you can only patch yourself up
  if (player.mode === 'eva') return evaClickTarget(mx, my);
  if (player.mode !== 'inside') return null;
  // broken systems first
  const m = hazardClickTarget(mx, my) || dockClickTarget(mx, my) || encounterClickTarget(mx, my) || minigameClickTarget(mx, my) || missionClickTarget(mx, my);
  if (m) return m;
  for (const s of SYSTEMS) {
    if (!s.broken || Math.hypot(mx - s.x, my - s.y) > s.r) continue;
    if (!near(s.x, s.y, REACH + s.r * 0.6)) return { text: `${s.name} is broken — get closer`, ok: false, ...s };
    if (inv.weapon !== 'repair') return { text: `${s.name} is broken — needs the repair kit`, ok: false, ...s };
    return { text: `Hold click: repair ${s.name.toLowerCase()} (${REPAIR_TIME} s) · quick click: tape job`, ok: true, repair: s, x: s.x, y: s.y, r: s.r };
  }
  for (const it of ITEMS) {
    if (Math.hypot(mx - it.x, my - it.y) > 0.45) continue;
    const swap = inv[slotOf(it.kind)] ? ` (drops your ${ITEM_NAMES[inv[slotOf(it.kind)]]})` : '';
    if (!near(it.x, it.y)) return { text: `${ITEM_NAMES[it.kind]} — get closer`, ok: false, x: it.x, y: it.y, r: 0.45 };
    return { text: `Click: take the ${ITEM_NAMES[it.kind]}${swap}`, ok: true, x: it.x, y: it.y, r: 0.45,
             run: () => { ITEMS.splice(ITEMS.indexOf(it), 1); grab(it.kind); } };
  }
  if (power.inserter && Math.hypot(mx - (FUEL_CRATE.x - 0.8), my - FUEL_CRATE.y) < 0.3) {   // the inserter: scooch the cells out of its reach (or back)
    const t = { x: FUEL_CRATE.x - 0.8, y: FUEL_CRATE.y, r: 0.3 };
    if (!near(t.x, t.y)) return { ...t, text: 'Inserter handle — get closer', ok: false };
    return { ...t, ok: true, text: power.inserter.on ? 'Click: scooch the cells left (the inserter stops loading)' : 'Click: scooch the cells back (the inserter loads again)', run: () => { power.inserter.on = !power.inserter.on; sfx.clank(); } };
  }
  if (Math.hypot(mx - FUEL_CRATE.x, my - FUEL_CRATE.y) < 0.75) {
    const t = { x: FUEL_CRATE.x, y: FUEL_CRATE.y, r: 0.75 };
    if (!power.reserve) return { ...t, text: 'Fuel crate is empty', ok: false };
    if (!near(t.x, t.y)) return { ...t, text: 'Fuel crate — get closer', ok: false };
    return { ...t, text: `Click: take a fuel cell (${power.reserve} left)${inv.item ? ` (drops your ${ITEM_NAMES[inv.item]})` : ''}`, ok: true,
             run: () => { power.reserve--; grab('fuel'); } };
  }
  if (Math.hypot(mx - LEVER.x, my - LEVER.y) < LEVER_HUB) {          // the hub: wedge / pull the wrench
    const t = { x: LEVER.x, y: LEVER.y, r: LEVER_HUB + 0.05 };
    if (!near(t.x, t.y)) return { ...t, text: 'Power lever — get closer', ok: false };
    return { ...t, ok: true, text: power.lever.jammed ? 'Click: pull the wrench out (lever steps on its own again)' : 'Click: manual override — wedge a wrench in so the lever can\'t move on',
             run: () => { power.lever.jammed = !power.lever.jammed; sfx.clank(); } };
  }
  if (Math.hypot(mx - LEVER.x, my - LEVER.y) < 0.6) {
    const t = { x: LEVER.x, y: LEVER.y, r: 0.6 };
    if (!near(t.x, t.y)) return { ...t, text: 'Power lever — get closer', ok: false };
    if (power.lever.jammed) return { ...t, text: 'The wrench blocks the lever (click the hub to pull it out)', ok: false };
    const nextPos = (power.lever.pos + 1) % 3;
    return { ...t, ok: true, text: `Click: turn lever to ${LEVER_NAMES[nextPos]} (now ${LEVER_NAMES[power.lever.pos]})`,
             run: () => { power.lever.pos = nextPos; sfx.clank(); } };
  }
  const R = REACTOR;
  if (Math.abs(mx - R.x) < R.w / 2 && Math.abs(my - R.y) < R.h / 2) {
    const t = { x: R.x, y: R.y, r: 1.9 };
    const status = power.reactor.fuel ? `${power.reactor.fuel} energy left in the cell, next in ${Math.ceil((ENERGY_TIME - power.reactor.t) / (power.overcharge ? 2 : 1))} s` : 'out of fuel';
    const close = near(R.x, R.y, REACH + 1.4);
    if (inv.item === 'fuel' && !power.reactor.fuel) {
      if (!close) return { ...t, text: 'Reactor — get closer', ok: false };
      return { ...t, ok: true, text: 'Click: load the fuel cell', run: () => { inv.item = null; power.reactor.fuel = CELL_ENERGY; power.reactor.t = 0; sfx.hatch(); sfx.poi(); combatBanner('Fuel cell loaded'); } };
    }
    if (power.overcharge && close)
      return { ...t, ok: true, text: `Click: stop the overcharge (${status})`, run: () => { power.overcharge = false; sfx.clank(); combatBanner('Reactor back to normal speed'); } };
    if (perk(player, 'overcharge') && close && !broken(REACTOR))
      return { ...t, ok: true, text: `Click: overcharge the reactor — double speed, ${OVERCHARGE_FIRE * 100}% fire risk per energy (${status})`, run: () => { power.overcharge = true; sfx.spark(); combatBanner('Reactor OVERCHARGED — double speed, watch for fire'); } };
    if (inv.item === 'fuel' && power.reactor.fuel) return { ...t, text: `Reactor still has fuel (${power.reactor.fuel} energy left)`, ok: false };
    return { ...t, text: `Reactor: ${status}`, ok: false };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Injuries. ok → (hit) hurt for HURT_TIME: tunnel vision, slower → (hit) down: patch yourself up
// (hold click on yourself, SELF_TREAT s) → (hit while down) out: someone else has to treat you.
// Anyone can treat anyone by holding click on them for TREAT_TIME (down / out → hurt, hurt → ok).
// Alone on the ship, someone who's out can still crawl back slowly (SOLO_TREAT s) — no softlocks.
// ---------------------------------------------------------------------------
const HURT_TIME = 30, SELF_TREAT = 10, SOLO_TREAT = 20, TREAT_TIME = 2;
const hurtTime = (c) => perk(c, 'painkillers') ? 15 : HURT_TIME;
const standing = (c) => (c.health || 'ok') === 'ok' || c.health === 'hurt';
function hurtCrew(c) {
  if (!c) return;
  if (c.armor > 0) { c.armor--; combatBanner(`${c.name}'s armor vest took the hit`); sfx.clank(); return; }   // (gear: see progress.js)
  const h = c.health || 'ok';
  c.health = h === 'ok' ? 'hurt' : h === 'hurt' ? 'down' : 'out';
  c.hurtT = hurtTime(c); c.treat = null;
  if (c.health === 'down' || c.health === 'out') {
    if (c.mode === 'gun') { c.cover = 0; c.mode = 'inside'; [c.x, c.y] = c.gun.hatch; c.gun = null; }   // falls back down the ladder
    combatBanner(`${c.name} is ${c.health === 'out' ? 'OUT — someone has to treat them!' : 'down!'}`);
  }
}
function updateInjury(c, dt) {
  if (c.health === 'hurt' && (c.hurtT -= dt) <= 0) { c.health = 'ok'; c.hurtT = 0; }
}
// The treat action on crew member `who`, from the acting crew member: { time, label } or null.
function treatInfo(who) {
  if (!who || standing(who) && who.health !== 'hurt') return null;
  if (who === player) {
    if (who.health === 'down') return { time: perk(who, 'stim') ? 3 : perk(who, 'medic') ? 6 : SELF_TREAT, label: 'patch yourself up' };
    if (who.health === 'out' && crew.every(c => c === who || !standing(c))) return { time: SOLO_TREAT, label: 'nobody can help — slowly patch yourself up' };
    return null;
  }
  return standing(player) ? { time: perk(player, 'trauma') ? 0.7 : perk(player, 'medic') ? 1.2 : TREAT_TIME, label: `treat ${who.name}` } : null;
}
function updateTreat(dt, target, holding) {
  if (!target?.treat) { player.treat = null; return; }
  const who = target.treat;
  if (!holding) {                                    // letting go briefly (to click on a heartbeat) doesn't lose progress
    if (player.treat?.id === who.id && (player.treat.up = (player.treat.up || 0) + dt) > 0.4) player.treat = null;
    return;
  }
  if (player.treat?.id !== who.id) player.treat = { id: who.id, t: 0 };
  if (mouse.click && player.treat.t > 0.1) {         // a click right on the heartbeat speeds it up
    const off = Math.abs(((player.treat.t + BEAT / 2) % BEAT) - BEAT / 2);
    if (off < 0.15) { player.treat.t += 0.5; player.treat.beat = 1; sfx.poi(); }
  }
  player.treat.up = 0; player.treat.beat = Math.max(0, (player.treat.beat || 0) - dt * 3);
  player.treat.t += dt;
  if (player.treat.t >= target.time) {
    who.health = who.health === 'hurt' ? 'ok' : 'hurt'; who.hurtT = hurtTime(who);
    sfx.poi(); combatBanner(who === player ? 'Patched up — still hurt for a while' : `${who.name} is back on their feet`);
    if (who !== player) hz.stats.treated[player.name] = (hz.stats.treated[player.name] || 0) + 1;
    player.treat = null;
  }
}

// Generic "hold click" jobs (tarps, welds, splices, …): target.hold = { id, time, done }.
function updateHold(dt, target, holding) {
  if (!holding || !target?.hold) { player.hold = null; return; }
  const h = target.hold;
  if (player.hold?.id !== h.id) player.hold = { id: h.id, t: 0, time: h.time };
  player.hold.t += dt * (player.health === 'hurt' ? 0.8 : 1) * repairSpeed(player);
  if (Math.random() < dt * 8) combatFx(target.x + (Math.random() - 0.5) * 0.6, target.y + (Math.random() - 0.5) * 0.6, 0, -1, 0.3, '#ffe08a', 0.06);
  if (player.hold.t >= h.time) { player.hold = null; h.done(); }
}
// What a click does on a spacewalk (hazards, EVA jobs).
function evaClickTarget(mx, my) {
  return hazardEvaTarget(mx, my) || evaJobTarget(mx, my) || organicEvaTarget(mx, my) || dockEvaTarget(mx, my);
}

// Repairing: hold the mouse on a broken system with the repair kit.
function updateRepair(dt, target, holding) {
  if (!holding && player.repair && player.repair.t < 0.3 && target?.repair === player.repair.sys && !target.service) { const s = player.repair.sys; player.repair = null; openTape(s); return; }   // a quick click: the tape job
  if (!holding || !target?.repair) { player.repair = null; return; }
  if (player.repair?.sys !== target.repair) player.repair = { sys: target.repair, t: 0 };
  player.repair.t += dt * repairSpeed(player);
  if (Math.random() < dt * 8) combatFx(target.x + (Math.random() - 0.5) * 0.6, target.y + (Math.random() - 0.5) * 0.6, 0, -1, 0.3, '#ffe08a', 0.06);
  if (player.repair.t >= REPAIR_TIME) {
    if (target.service) { mission.maint.serviced = true; combatBanner(`${player.repair.sys.name} serviced — it won't break now`); }
    else { player.repair.sys.broken = false; hz.stats.repairs++; combatBanner(`${player.repair.sys.name} repaired`); }
    sfx.win();
    player.repair = null;
  }
}

// The weapon in hand: right click towards the mouse, or Space the way you face (arrow keys aim).
// The heavy blaster fires when you let go: a quick click is a shot, held until charged a blast.
function updateWeapon(dt, mx, my) {
  const keyHeld = keys.has('Space'), keyPressed = pressed.has('Space');
  const mouseAim = () => Math.atan2(my - player.y, mx - player.x);
  if (inv.weapon !== 'heavy') player.charge = null;
  if (inv.weapon === 'heavy') {
    if (player.charge == null && (mouse.rightClick || keyPressed) && canShoot()) { player.charge = 0; player.chargeKey = !mouse.rightClick; }
    if (player.charge == null) return;
    if (!canShoot(true)) { player.charge = null; return; }
    const a = player.chargeKey ? player.face : mouseAim();
    if (player.chargeKey ? keyHeld : mouse.right) { player.charge = Math.min(BLASTER_CHARGE, player.charge + dt); player.face = a; return; }
    const blast = player.charge >= BLASTER_CHARGE; player.charge = null;
    attack(a, blast);
  } else if (mouse.rightClick) attack(mouseAim());
  else if (keyPressed) attack(player.face);
  if (inv.weapon === 'extinguisher' && player.mode === 'inside') {
    if (mouse.right) spray(mx, my, dt);
    else if (keyHeld) spray(player.x + Math.cos(player.face) * 2, player.y + Math.sin(player.face) * 2, dt);
  }
}
function canShoot(ignoreCd = false) {
  return !!inv.weapon && inv.weapon !== 'extinguisher' && inv.weapon !== 'drill' && inv.item !== 'blackbox' && (ignoreCd || inv.cd <= 0) && (player.mode === 'inside' || player.mode === 'eva');
}
const weaponCooldown = (w) => w === 'laser' ? LASER_COOLDOWN : w === 'heavy' ? BLASTER_COOLDOWN : WRENCH_COOLDOWN;
// Fire the weapon in hand at angle a. Laser: fast bolt. Heavy blaster: slower 1-2 damage bolt, or a
// charged blast. Repair kit: throw a wrench (long cooldown).
function attack(a, blast = false) {
  if (!canShoot()) return;
  const dx = Math.cos(a), dy = Math.sin(a), x = player.x + dx * 0.4, y = player.y + dy * 0.4;
  const fast = perk(player, 'weapons') ? 0.65 : 1;
  player.face = a;
  if (inv.weapon === 'laser') {
    inv.cd = LASER_COOLDOWN * fast;
    boarding.bolts.push({ x, y, vx: dx * BOLT_SPEED, vy: dy * BOLT_SPEED, life: 0.9, owner: 'crew' });
    sfx.enemyShot();
  } else if (inv.weapon === 'heavy') {
    inv.cd = BLASTER_COOLDOWN * fast;
    if (blast) {
      boarding.bolts.push({ x, y, vx: dx * BOLT_SPEED, vy: dy * BOLT_SPEED, life: 0.9, owner: 'crew', dmg: 3, stun: 1, heavy: true });
      if (player.mode === 'eva') combat.shells.push({ x, y, vx: dx * SHELL_SPEED, vy: dy * SHELL_SPEED, life: SHELL_LIFE });   // hits like a ship cannon
      for (let i = 0; i < 10; i++) combatFx(x, y, dx * 4 + (Math.random() - 0.5) * 3, dy * 4 + (Math.random() - 0.5) * 3, 0.3, '#9cd8ff', 0.1);
      sfx.shoot();
    } else {
      boarding.bolts.push({ x, y, vx: dx * BOLT_SPEED, vy: dy * BOLT_SPEED, life: 0.9, owner: 'crew', dmg: Math.random() < 0.5 ? 1 : 2 });
      sfx.enemyShot();
    }
  } else if (inv.weapon === 'repair') {
    inv.cd = WRENCH_COOLDOWN;
    boarding.bolts.push({ x: player.x + dx * 0.4, y: player.y + dy * 0.4, vx: dx * WRENCH_SPEED, vy: dy * WRENCH_SPEED, life: 0.8, owner: 'crew', wrench: true, spin: 0 });
    sfx.clank();
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// Rooms of a zone column go dim when its capacitor is empty or broken.
const lightLevel = [1, 1, 1];
function drawLights(dt) {
  for (let col = 0; col < 3; col++) {
    const dark = CAPACITORS[col].charge <= 0 || capBroken(col);
    lightLevel[col] = lerp(lightLevel[col], dark ? 0 : 1, 1 - Math.exp(-3 * dt));
    const a = (1 - lightLevel[col]) * 0.42;
    if (a < 0.01) continue;
    ctx.fillStyle = `rgba(40,4,6,${a})`;                // emergency lighting: dim and red
    for (const r of ROOMS.filter(r => r.col === col)) for (const q of r.rects) ctx.fillRect(L(q.x), L(q.y), L(q.w), L(q.h));
  }
}

function drawLever(t) {
  const x = L(LEVER.x), y = L(LEVER.y), lv = power.lever;
  shadowEllipse(x + 3, y + 5, T * 0.55, T * 0.45, 0.3);
  ctx.beginPath(); ctx.arc(x, y, T * 0.5, 0, TAU); ctx.fillStyle = '#3f4757'; ctx.fill(); stroke(2.5);
  ctx.beginPath(); ctx.arc(x, y, T * 0.38, leverAngle(0) - 0.25, leverAngle(2) + 0.25);   // the track
  ctx.strokeStyle = '#262a33'; ctx.lineWidth = 7; ctx.stroke();
  for (let i = 0; i < 3; i++) {                    // the three outputs, left → right
    const a = leverAngle(i), on = i === lv.pos;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * T * 0.38, y + Math.sin(a) * T * 0.38, 4.5, 0, TAU);
    ctx.fillStyle = on ? '#5fd6a0' : '#4a515e'; ctx.fill(); stroke(1);
    ctx.fillStyle = 'rgba(232,236,244,0.75)'; ctx.font = `800 ${T * 0.13}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LEVER_NAMES[i], x + Math.cos(a) * T * 0.72, y + Math.sin(a) * T * 0.72);
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(lv.angle + Math.PI / 2);   // handle
  rr(-4, -T * 0.42, 8, T * 0.42, 3); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(1.5);
  ctx.beginPath(); ctx.arc(0, -T * 0.42, 6, 0, TAU); ctx.fillStyle = '#e2574c'; ctx.fill(); stroke(1.5);
  ctx.restore();
  if (lv.jammed) {                                 // wrench wedged right where the handle would go next
    const next = (lv.pos + 1) % 3, a = leverAngle(lv.pos) + Math.sign(leverAngle(next) - leverAngle(lv.pos)) * 0.42;
    wrench(x + Math.cos(a) * T * 0.3, y + Math.sin(a) * T * 0.3, a);
  }
  ctx.beginPath(); ctx.arc(x, y, T * LEVER_HUB * 0.55, 0, TAU); ctx.fillStyle = lv.jammed ? '#e8c34f' : '#9aa3b5'; ctx.fill(); stroke(1.5);   // hub
  ctx.fillStyle = 'rgba(232,236,244,0.75)'; ctx.font = `800 ${T * 0.11}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(lv.jammed ? 'MANUAL (WRENCH)' : 'AUTO', x, y + T * 0.55);
  ctx.textAlign = 'left';
}

// Glowing energy packets flying from the reactor to a capacitor.
// Energy pulses running along the power lines (deliveries from the reactor, and energy being used).
function drawEnergyBolts() {
  const orb = ([x, y]) => {
    const g = ctx.createRadialGradient(L(x), L(y), 0, L(x), L(y), 15);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#ffe08a'); g.addColorStop(1, 'rgba(255,200,90,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L(x), L(y), 15, 0, TAU); ctx.fill();
  };
  for (const b of power.bolts) if (b.t < 1) orb(linePoint(LINE['feed' + b.to], b.t * b.t * (3 - 2 * b.t)));
  for (const p of power.pulses) if (LINE[p.line]) orb(linePoint(LINE[p.line], p.t));
}

// Broken look: scorch, a loose panel, smoke and the odd spark.
function drawBroken(s, t) {
  const x = L(s.x), y = L(s.y), r = L(Math.min(s.r, 1.1));
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(15,12,10,0.55)'); g.addColorStop(1, 'rgba(15,12,10,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(x + r * 0.3, y - r * 0.2); ctx.rotate(0.5);
  rr(-8, -5, 16, 10, 2); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(1.5); ctx.restore();
  for (let i = 0; i < 3; i++) {
    const q = (t * 0.5 + i / 3) % 1;
    ctx.beginPath(); ctx.arc(x + Math.sin(t + i * 2) * 5, y - q * L(1.1), L(0.12 + q * 0.25), 0, TAU);
    ctx.fillStyle = `rgba(70,70,76,${0.5 * (1 - q)})`; ctx.fill();
  }
  const rr2 = rng(Math.floor(t * 5) + s.x * 7);
  if (rr2() < 0.15) {
    ctx.strokeStyle = 'rgba(255,220,120,0.85)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { const a = rr2() * TAU; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); ctx.stroke(); }
  }
  ctx.fillStyle = 'rgba(255,120,100,0.9)'; ctx.font = `800 ${T * 0.15}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('BROKEN', x, y - r * 0.6); ctx.textAlign = 'left';
}

// Item icons (pixel coords). Used on the floor and in the inventory.
function drawItemIcon(kind, x, y, s = 1, t = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (kind === 'repair') {
    rr(-6, -13, 12, 5, 2); ctx.strokeStyle = OUT; ctx.lineWidth = 3; ctx.stroke();             // handle
    rr(-15, -9, 30, 19, 3); ctx.fillStyle = C.hazard; ctx.fill(); stroke(2);                     // yellow tool case
    ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-15, -3, 30, 2);
    ctx.save(); ctx.rotate(-0.6);                                                               // wrench emblem
    ctx.fillStyle = '#2b303a';
    ctx.fillRect(-7, -1.8, 12, 3.6);
    ctx.beginPath(); ctx.arc(6.5, 0, 4.2, 0.75, TAU - 0.75); ctx.lineTo(6.5, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(-7.5, 0, 3, 0, TAU); ctx.fill();
    ctx.restore();
  } else if (kind === 'laser') {
    rr(-14, -4, 22, 8, 3); ctx.fillStyle = '#5a6272'; ctx.fill(); stroke(2);
    rr(6, -3, 9, 6, 2); ctx.fillStyle = '#3a3f4a'; ctx.fill(); stroke(1.5);
    rr(-10, 2, 6, 9, 2); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);
    ctx.fillStyle = '#ff6a4a'; ctx.fillRect(-8, -2, 10, 2.5);
    ctx.beginPath(); ctx.arc(15, 0, 2, 0, TAU); ctx.fillStyle = '#ffb0a0'; ctx.fill();
  } else if (kind === 'heavy') {
    rr(-16, -6, 26, 12, 3); ctx.fillStyle = '#4a5468'; ctx.fill(); stroke(2);                   // chunky body
    rr(8, -4, 10, 8, 2); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);                     // muzzle
    rr(-11, 4, 7, 9, 2); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.5);                     // grip
    for (let i = 0; i < 3; i++) { ctx.fillStyle = '#9cd8ff'; ctx.fillRect(-12 + i * 6, -3, 4, 6); }   // charge cells
    ctx.beginPath(); ctx.arc(18, 0, 2.5, 0, TAU); ctx.fillStyle = '#d8f0ff'; ctx.fill();
  } else if (kind === 'extinguisher') {
    extinguisher(-4, 0, 0);
  } else if (kind === 'plate') {
    ctx.rotate(0.2); rr(-13, -10, 26, 20, 3); ctx.fillStyle = '#8a93a5'; ctx.fill(); stroke(2);
    ctx.fillStyle = '#2b303a'; for (const [rx, ry] of [[-9, -6], [9, -6], [-9, 6], [9, 6]]) ctx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-11, -8, 22, 3);
  } else if (kind === 'coolant') {
    rr(-7, -12, 14, 24, 4); ctx.fillStyle = '#4ac0e0'; ctx.fill(); stroke(2);
    ctx.fillStyle = '#e8f8ff'; ctx.fillRect(-5, -4, 10, 6); ctx.fillStyle = '#2b303a'; ctx.fillRect(-4, -15, 8, 4);
    ctx.fillStyle = '#1a5a70'; ctx.font = '800 6px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('COOL', 0, -1);
  } else if (kind === 'blackbox') {
    rr(-13, -9, 26, 18, 3); ctx.fillStyle = '#e8762e'; ctx.fill(); stroke(2);         // (black boxes are orange)
    ctx.fillStyle = '#2b303a'; ctx.fillRect(-10, -3, 20, 2); ctx.fillRect(-10, 2, 20, 2);
    hazardStripe(-13, -9, 26, 4);
  } else if (kind === 'drill') {
    rr(-14, -5, 16, 10, 3); ctx.fillStyle = '#d9a54a'; ctx.fill(); stroke(2);
    poly([[2, -4], [15, 0], [2, 4]]); ctx.fillStyle = '#c9ced8'; ctx.fill(); stroke(1.5);
    ctx.strokeStyle = '#6b7486'; ctx.lineWidth = 1.2; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(4 + i * 3.5, -3); ctx.lineTo(6 + i * 3.5, 3); ctx.stroke(); }
    rr(-10, 4, 6, 8, 2); ctx.fillStyle = '#2b303a'; ctx.fill(); stroke(1.2);
  } else if (kind === 'ore') {
    poly([[-9, -4], [-3, -10], [6, -8], [10, 0], [5, 9], [-6, 8]]); ctx.fillStyle = '#6e6359'; ctx.fill(); stroke(2);
    ctx.fillStyle = '#7af0ff'; for (const [ox, oy] of [[-2, -3], [3, 2], [-4, 4]]) { ctx.beginPath(); ctx.arc(ox, oy, 2.2, 0, TAU); ctx.fill(); }
  } else if (kind === 'fuel') {
    rr(-6, -12, 12, 24, 5);
    const g = ctx.createLinearGradient(-6, 0, 6, 0); g.addColorStop(0, '#3a9a5a'); g.addColorStop(0.5, '#b8ffd0'); g.addColorStop(1, '#2a7a4a');
    ctx.fillStyle = g; ctx.fill(); stroke(2);
    ctx.fillStyle = '#c9ced8'; ctx.fillRect(-4, -14, 8, 3);
  }
  ctx.restore();
}
// Things you can pick up glow, pulse and bob, so they stand out from the clutter. In reach
// (for the local player) they get a bright ring and a small "click to take" tag.
function pickupHalo(x, y, r, t, inReach, seed = 0) {
  const k = 0.5 + 0.5 * Math.sin(t * 3.2 + seed);
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.6);
  g.addColorStop(0, `rgba(255,224,138,${0.35 + 0.2 * k})`); g.addColorStop(0.6, `rgba(255,200,90,${0.12 + 0.08 * k})`); g.addColorStop(1, 'rgba(255,200,90,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.9 + seed);
  ctx.setLineDash([7, 6]);
  ctx.beginPath(); ctx.arc(0, 0, r + 3 * k, 0, TAU);
  ctx.lineWidth = 4.5; ctx.strokeStyle = 'rgba(20,22,27,0.55)'; ctx.stroke();
  ctx.lineWidth = 2.2; ctx.strokeStyle = `rgba(255,224,138,${0.75 + 0.25 * k})`; ctx.stroke();
  ctx.restore();
  if (inReach) {
    ctx.beginPath(); ctx.arc(x, y, r - 4, 0, TAU); ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(255,255,255,${0.6 + 0.4 * k})`; ctx.stroke();
    ctx.font = `800 ${T * 0.2}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,12,18,0.85)'; ctx.strokeText('CLICK TO TAKE', x, y - r - 6);
    ctx.fillStyle = '#ffe08a'; ctx.fillText('CLICK TO TAKE', x, y - r - 6); ctx.textAlign = 'left';
  }
}
function drawItems(t) {
  const reachable = (x, y) => me.mode === 'inside' && Math.hypot(me.x - x, me.y - y) <= REACH;
  if (power.reserve > 0) pickupHalo(L(FUEL_CRATE.x), L(FUEL_CRATE.y), T * 0.85, t, reachable(FUEL_CRATE.x, FUEL_CRATE.y), 1.3);
  ITEMS.forEach((it, i) => {
    const x = L(it.x), y = L(it.y), bob = Math.sin(t * 2.6 + i * 1.7) * 3;
    pickupHalo(x, y, T * 0.5, t, reachable(it.x, it.y), i * 0.9);
    shadowEllipse(x + 3, y + 5, 13 - bob * 0.6, 8, 0.3);
    drawItemIcon(it.kind, x, y - 3 + bob, 1.15, t);
  });
}

// Hover highlight + repair progress ring (world space).
function drawClickTarget(target) {
  if (!target) return;
  ctx.beginPath(); ctx.arc(L(target.x), L(target.y), L(target.r), 0, TAU);
  ctx.setLineDash([6, 5]); ctx.strokeStyle = target.ok ? 'rgba(95,214,160,0.9)' : 'rgba(180,186,198,0.6)'; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
  const hk = player.hold && target.hold?.id === player.hold.id ? player.hold.t / player.hold.time : null;
  if (hk !== null || (player.repair && target.repair === player.repair.sys)) {
    const k = hk ?? player.repair.t / REPAIR_TIME;
    ctx.beginPath(); ctx.arc(L(target.x), L(target.y), L(target.r) + 6, -Math.PI / 2, -Math.PI / 2 + k * TAU);
    ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 5; ctx.stroke();
  }
}

// Screen space: inventory slots and the power panel (bottom left).
function drawSystemsHUD(top) {
  const x0 = 14, y0 = VH - 84;
  for (const [i, slot] of ['weapon', 'item'].entries()) {
    const x = x0 + i * 74;
    rr(x, y0, 66, 66, 8); ctx.fillStyle = 'rgba(10,12,18,0.8)'; ctx.fill(); stroke(1.5, '#4b5263');
    ctx.fillStyle = '#6b7486'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(slot === 'weapon' ? 'R-CLICK/SPACE' : 'ITEM', x + 33, y0 + 4);
    if (inv[slot]) {
      drawItemIcon(inv[slot], x + 33, y0 + 36, 1.2);
      if (slot === 'weapon' && inv.cd > 0) {
        const k = Math.min(1, inv.cd / weaponCooldown(inv.weapon));
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x + 2, y0 + 66 - 64 * k, 62, 64 * k);
      }
      ctx.fillStyle = '#c9ced8'; ctx.font = '10px system-ui, sans-serif'; ctx.textBaseline = 'bottom';
      ctx.fillText(ITEM_NAMES[inv[slot]], x + 33, y0 + 64);
    }
  }
  ctx.textAlign = 'left';
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = '#9aa3b5'; ctx.textBaseline = 'bottom';
  ctx.fillText('Left click / E: interact · Right click / Space: use weapon · Arrows: aim', x0, y0 - 4);
  // power panel
  const px = x0 + 156, R = power.reactor;
  const lines = [
    [`Reactor: ${broken(REACTOR) ? 'BROKEN' : R.fuel ? `${R.fuel}/${CELL_ENERGY} energy in cell · next in ${Math.ceil((ENERGY_TIME - R.t) / (power.overcharge ? 2 : 1))} s${power.overcharge ? ' · OVERCHARGED' : ''}` : 'OUT OF FUEL'}`, broken(REACTOR) || !R.fuel ? '#ff9a8a' : power.overcharge ? '#ffd28a' : '#c8ffe6'],
    [`Lever → ${LEVER_NAMES[power.lever.pos]} (${power.lever.jammed ? 'manual override' : 'auto'})${broken(LEVER) ? ' · BROKEN' : ''} · spare fuel cells: ${power.reserve} · duct tape: ${hz.tape} · hull plates: ${hz.plates}`, '#c9ced8'],
    [`Capacitors  left ${CAPACITORS[0].charge}/${CAP_MAX}${capBroken(0) ? '✖' : ''}   mid ${CAPACITORS[1].charge}/${CAP_MAX}${capBroken(1) ? '✖' : ''}   right ${CAPACITORS[2].charge}/${CAP_MAX}${capBroken(2) ? '✖' : ''}`, '#9cd8ff'],
  ];
  const broke = SYSTEMS.filter(s => s.broken).map(s => s.name);
  if (broke.length) lines.push([`Broken: ${broke.join(', ')}`, '#ff9a8a']);
  ctx.font = '12px system-ui, sans-serif';
  const w = Math.max(...lines.map(l => ctx.measureText(l[0]).width)) + 20, h = lines.length * 17 + 10;
  rr(px, VH - 18 - h, w, h, 6); ctx.fillStyle = 'rgba(10,12,18,0.75)'; ctx.fill();
  ctx.textBaseline = 'top';
  lines.forEach(([text, col], i) => { ctx.fillStyle = col; ctx.fillText(text, px + 10, VH - 13 - h + i * 17); });
}
