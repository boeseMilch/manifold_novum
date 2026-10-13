// Encounters that happen to the whole ship (and two sneaky enemy ships):
//   solar flare (shelter on the lower deck; cannons and enemies go quiet), ion storm (lights out,
//   radar and security scrambled, full capacitors arc), coolant leak (the reactor overheats and
//   scrams unless someone screws in a coolant canister), ship AI glitch (doors lock on their own until
//   the security console is rebooted in the order the helm shows), the stealth fighter (only visible
//   after a radar ping) and the tractor tug (freezes the jump countdown until its emitter is shot).
// Everything in `enc` is plain data.

const enc = { flare: null, storm: null, coolant: null, scram: 0, glitch: null };
const FLARE_WARN = 10, FLARE_TIME = 8, STORM_TIME = 30, STORM_ARC = 10, COOLANT_RISE = 50, SCRAM_TIME = 30, COOLANT_FIX = 3, GLITCH_STEP = 3;
const COOLANT_CRATE = { x: 11.4, y: 22.6 };
const UPPER = new Set(['portGun', 'bridge', 'starGun']);

function resetEncounters() { Object.assign(enc, { flare: null, storm: null, coolant: null, scram: 0, glitch: null }); }

// ---------------------------------------------------------------------------
// Starting them
// ---------------------------------------------------------------------------
function startFlare() {
  enc.flare = { phase: 'warn', t: FLARE_WARN, hits: 0 };
  combatBanner(`SOLAR FLARE in ${FLARE_WARN} s — everyone to the lower deck!`); sfx.alarm(); sfx.say?.('Solar flare incoming. Please shelter on the lower deck.');
}
function startStorm() {
  enc.storm = { t: STORM_TIME, arc: 0 };
  combatBanner('ION STORM — full capacitors will arc, use the energy!'); sfx.spark();
  arcFullCaps();
}
function startCoolantLeak() {
  if (enc.coolant) return;
  enc.coolant = { heat: 0 };
  combatBanner('Coolant leak — get a canister from the left airlock room!'); sfx.alarm();
}
function startGlitch() {
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  enc.glitch = { t: 0, order, step: 0, locked: [] };
  combatBanner('Ship AI glitch — doors are locking on their own! Reboot it at the security console.'); sfx.say?.('I am. Fine. Everything. Is fine.');
}
const exposed = (c) => c.mode === 'eva' || c.mode === 'gun' || c.mode === 'hatch' || (c.mode === 'inside' && UPPER.has(roomAt(c.x, c.y)?.id));
function arcFullCaps() {
  CAPACITORS.forEach((c, i) => {
    if (c.charge < CAP_MAX || capBroken(i)) return;
    c.charge--; sfx.spark();
    for (let k = 0; k < 14; k++) combatFx(c.x, c.y - 0.3, (Math.random() - 0.5) * 4, -Math.random() * 4, 0.5, '#bfe8ff', 0.08);
    combatBanner(`The ${['left', 'middle', 'right'][i]} capacitor arced in the storm (it was full)`);
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function updateEncounters(dt) {
  const f = enc.flare;
  if (f) {
    f.t -= dt;
    if (f.phase === 'warn' && f.t <= 0) { f.phase = 'rad'; f.t = FLARE_TIME; flareHit(); sfx.explosion(); }
    else if (f.phase === 'rad') {
      if (f.hits < 2 && f.t <= FLARE_TIME / 2) flareHit();
      if (f.t <= 0) { enc.flare = null; combatBanner('The flare has passed'); }
    }
  }
  if (enc.storm) {
    const s = enc.storm;
    s.t -= dt; s.arc += dt;
    if (s.arc >= STORM_ARC) { s.arc = 0; arcFullCaps(); }
    if (s.t <= 0) { enc.storm = null; combatBanner('The ion storm has passed'); }
  }
  if (enc.coolant) {
    enc.coolant.heat += dt * 100 / COOLANT_RISE;
    if (enc.coolant.heat >= 100) {
      enc.scram = SCRAM_TIME; enc.coolant.heat = 60;
      combatBanner(`REACTOR SCRAM — overheated, no energy for ${SCRAM_TIME} s!`); sfx.explosion(); sfx.say?.('Reactor scram.');
    }
  }
  enc.scram = Math.max(0, enc.scram - dt);
  if (enc.glitch) {
    const g = enc.glitch;
    if ((g.t += dt) >= GLITCH_STEP) {
      g.t = 0;
      const all = lockables(), i = Math.floor(Math.random() * all.length), l = all[i];
      if (l.kind !== 'hatch') {                         // it leaves the outer airlocks alone (nobody gets stranded)
        l.ref.locked = !l.ref.locked; sfx.clank();
        if (l.ref.locked && !g.locked.includes(i)) g.locked.push(i);
      }
    }
  }
}
function flareHit() {
  enc.flare.hits++;
  for (const c of crew) if (exposed(c)) { hurtCrew(c); combatBanner(`${c.name} got a dose of radiation!`); }
}
// The security console during a glitch: three switches, pressed in the order the helm shows.
function rebootSwitch(i) {
  const g = enc.glitch;
  if (!g) return;
  if (g.order[g.step] === i) {
    sfx.clank();
    if (++g.step >= 3) {
      const all = lockables();
      for (const k of g.locked) if (all[k]) all[k].ref.locked = false;
      enc.glitch = null; ui.panel = null;
      combatBanner('Ship AI rebooted — doors behave again'); sfx.win();
    }
  } else { g.step = 0; sfx.empty(); combatBanner('Wrong order — the reboot starts over (check the helm)'); }
}

// ---------------------------------------------------------------------------
// Clicking: the coolant crate and screwing the canister into the reactor
// ---------------------------------------------------------------------------
function encounterClickTarget(mx, my) {
  if (Math.hypot(mx - COOLANT_CRATE.x, my - COOLANT_CRATE.y) < 0.55) {
    const t = { x: COOLANT_CRATE.x, y: COOLANT_CRATE.y, r: 0.55 };
    if (!near(t.x, t.y)) return { ...t, text: 'Coolant crate — get closer', ok: false };
    if (!enc.coolant) return { ...t, text: 'Coolant canisters (only needed for a coolant leak)', ok: false };
    return { ...t, ok: true, text: `Click: take a coolant canister${inv.item ? ` (drops your ${ITEM_NAMES[inv.item]})` : ''}`, run: () => grab('coolant') };
  }
  const R = REACTOR;
  if (enc.coolant && inv.item === 'coolant' && Math.abs(mx - R.x) < R.w / 2 && Math.abs(my - R.y) < R.h / 2) {
    if (!near(R.x, R.y, REACH + 1.4)) return { text: 'Reactor — get closer', ok: false, x: R.x, y: R.y, r: 1.9 };
    return holdTarget('coolant', COOLANT_FIX, `Hold click: screw the coolant canister in (${COOLANT_FIX} s)`, R.x, R.y, 1.9,
                      () => { inv.item = null; enc.coolant = null; combatBanner('Coolant topped up — the reactor cools down'); sfx.hatch(); sfx.win(); });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stealth fighter and tractor tug (enemy kinds)
// ---------------------------------------------------------------------------
function stealthAlpha(e) { return clamp(Math.max(e.reveal || 0, e.phase === 'burning' ? 1 : 0), 0.04, 1); }
ENEMY_TYPES.stealth = {
  ...ENEMY_TYPES.interceptor, name: 'Stealth fighter', stealth: true, fire: [3.2, 4.6],
  paint: { hull: ['#3a4458', '#141a26'], stripe: '#2a3448', pod: ['#3a4250', '#1a1e28'] },   // matte black-blue
  update(e, dt) { e.reveal = Math.max(0, (e.reveal || 0) - dt * 0.6); },
  draw(e, t) { drawInterceptor(e, t); stealthShimmer(t); },
  overlay(e, t) { interceptorOverlay(e, t); stealthShimmer(t); },   // (sprites: the hull fades with stealthAlpha)
};
function stealthShimmer(t) {                             // a heat shimmer where the cloak bends the light: just about visible even when hidden
  ctx.save(); ctx.globalAlpha = 1;
  for (let i = 0; i < 3; i++) { poly(LP(INTERCEPTOR_HULL.map(([x, y]) => [x * (1.05 + i * 0.06) + Math.sin(t * 3 + y * 2 + i) * 0.04, y * (1.03 + i * 0.04)])));
    ctx.strokeStyle = `rgba(170,220,255,${(0.1 - i * 0.025) * (1 + 0.6 * Math.sin(t * 5 + i))})`; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.restore();
}
const TRACTOR_EMITTER = [3.1, 1.75, 0.34];                // on a mast at the rear, clear of the other weak spots
ENEMY_TYPES.tractor = {
  ...ENEMY_TYPES.interceptor, name: 'Tractor tug', fire: [3.5, 5],
  paint: { hull: ['#c09a3a', '#6a5018'], stripe: '#2b2b2b', pod: ['#7a7a70', '#3a3a34'] },   // work-yard yellow
  solids: [...ENEMY_TYPES.interceptor.solids, box(2.3, 1.6, 2.8, 1.9)],
  pois: [...ENEMY_TYPES.interceptor.pois, { id: 'emitter', name: 'Tractor emitter', effect: 'beam off, jump clock runs again', shape: { circle: TRACTOR_EMITTER } }],
  update(e, dt) {
    if (poiHit(e, 'emitter') || !mission.active || mission.jump || mission.over) return;
    mission.jumpAt += dt;                              // held in the beam: the jump countdown doesn't move
  },
  draw(e, t) {
    drawInterceptor(e, t);
    for (const [x0, y0] of [[-1.45, 0.25], [1.0, 0.25]]) hazardStripe(L(x0), L(y0), L(0.45), L(0.22));   // hazard stripes on the wings
    const hit = poiHit(e, 'emitter'), [ex, ey, er] = TRACTOR_EMITTER;
    rr(L(2.3), L(1.6), L(0.55), L(0.3), 3); ctx.fillStyle = '#4a515e'; ctx.fill(); stroke(2);   // mast
    if (!hit) blueGlow(ex, ey, er * 2.2, t);
    ctx.beginPath(); ctx.arc(L(ex), L(ey), L(er), 0, TAU); ctx.fillStyle = bluePaint(ex - er, ey - er, ex + er, ey + er, t, hit); ctx.fill(); stroke(2);
    ctx.beginPath(); ctx.arc(L(ex), L(ey), L(er * 0.45), 0, TAU); ctx.fillStyle = hit ? '#2b303a' : '#e8f8ff'; ctx.fill();
  },
  drawExtra(e, t) {                                    // the beam itself, from the emitter to our hull
    if (poiHit(e, 'emitter') || e.phase !== 'fighting') return;
    const [x0, y0] = enemyToWorld(e, TRACTOR_EMITTER[0], TRACTOR_EMITTER[1]), x1 = e.side === 'port' ? 0 : SHIP_W, y1 = 13;
    const g = ctx.createLinearGradient(L(x0), L(y0), L(x1), L(y1));
    g.addColorStop(0, 'rgba(140,210,255,0.55)'); g.addColorStop(1, 'rgba(140,210,255,0.08)');
    ctx.fillStyle = g; poly([[L(x0), L(y0) - 6], [L(x1), L(y1) - L(5)], [L(x1), L(y1) + L(5)], [L(x0), L(y0) + 6]]); ctx.fill();
    ctx.strokeStyle = 'rgba(200,240,255,0.5)'; ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {                       // rings travelling along the beam
      const k = (t * 0.6 + i / 4) % 1, x = lerp(x0, x1, k), y = lerp(y0, y1, k), r = lerp(0.2, 5, k);
      ctx.beginPath(); ctx.ellipse(L(x), L(y), 4, L(r), 0, 0, TAU); ctx.stroke();
    }
  },
};
EVENT_SIDES.stealth = randSide; EVENT_SIDES.tractor = randSide;
EVENT_RUNNERS.flare = () => startFlare();
EVENT_RUNNERS.storm = () => startStorm();
EVENT_RUNNERS.coolant = () => startCoolantLeak();
EVENT_RUNNERS.glitch = () => startGlitch();
EVENT_RUNNERS.stealth = (ev) => combatSpawn('stealth', ev.side);
EVENT_RUNNERS.tractor = (ev) => combatSpawn('tractor', ev.side);
Object.assign(EVENT_LABELS, {
  flare: () => 'Solar flare — everywhere', storm: () => 'Ion storm — everywhere', coolant: () => 'Coolant leak — reactor', glitch: () => 'AI glitch — doors',
  stealth: (ev) => `Stealth fighter — ${SIDE_NAME[ev.side]}`, tractor: (ev) => `Tractor tug — ${SIDE_NAME[ev.side]}`,
});

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// The reactor's temperature gauge during a coolant leak, and the coolant crate's label.
function drawEncounterProps(t) {
  if (enc.coolant || enc.scram) {
    const x = L(REACTOR.x + REACTOR.w / 2 + 0.35), y = L(REACTOR.y - 1.1), h = L(2.0), k = enc.coolant ? enc.coolant.heat / 100 : 1;
    rr(x - 6, y, 12, h, 6); ctx.fillStyle = '#1c2028'; ctx.fill(); stroke(2);
    rr(x - 3, y + h * (1 - k) + 3, 6, h * k - 6, 3); ctx.fillStyle = k > 0.8 ? (Math.sin(t * 12) > 0 ? '#ff4a3a' : '#ffb347') : '#ff8a2e'; ctx.fill();
    ctx.fillStyle = '#ffd0c8'; ctx.font = `800 ${T * 0.12}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(enc.scram ? `SCRAM ${Math.ceil(enc.scram)}` : 'HEAT', x, y - 2); ctx.textAlign = 'left';
    if (enc.coolant && GFX.on) fxDecal('fx/coolant_puddle', REACTOR.x, REACTOR.y + REACTOR.h / 2 + 0.35, 1, clamp(0.4 + enc.coolant.heat / 60, 0, 1));   // the puddle grows darker as it leaks
    if (enc.coolant) for (let i = 0; i < 2; i++) {     // coolant dripping out under the reactor
      const q = (t * 0.7 + i / 2) % 1;
      ctx.beginPath(); ctx.arc(L(REACTOR.x - 0.6 + i * 1.1), L(REACTOR.y + REACTOR.h / 2) + q * 14, 3, 0, TAU); ctx.fillStyle = `rgba(74,192,224,${1 - q})`; ctx.fill();
    }
  }
}
// Screen space: the flare's glare, the storm's darkness (a flashlight cone around you).
function drawEncounterOverlay(view, t) {
  const f = enc.flare;
  if (f?.phase === 'warn') {
    const k = 0.5 + 0.5 * Math.sin(t * 6);
    const g = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.35, VW / 2, VH / 2, Math.hypot(VW, VH) / 2);
    g.addColorStop(0, 'rgba(255,170,60,0)'); g.addColorStop(1, `rgba(255,170,60,${0.18 + 0.12 * k})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  } else if (f?.phase === 'rad') {
    ctx.fillStyle = `rgba(255,236,190,${0.22 + 0.06 * Math.sin(t * 20)})`; ctx.fillRect(0, 0, VW, VH);
  }
  if (enc.storm && me.mode === 'inside') {
    const sx = view.ox + L(me.x) * view.zoom, sy = view.oy + L(me.y - GFX.lift(0.9)) * view.zoom * (view.sy || 1), r = L(5.5) * view.zoom, a = me.face;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, VW, VH);
    const r0 = L(0.9) * view.zoom;                     // one keyhole shape: the flashlight cone plus a little light around you
    ctx.moveTo(sx + Math.cos(a - 0.5) * r, sy + Math.sin(a - 0.5) * r);
    ctx.arc(sx, sy, r, a - 0.5, a + 0.5); ctx.arc(sx, sy, r0, a + 0.5, a - 0.5 + TAU); ctx.closePath();
    ctx.fillStyle = 'rgba(2,3,8,0.9)'; ctx.fill('evenodd');
    if (Math.random() < 0.04) { ctx.fillStyle = 'rgba(190,230,255,0.25)'; ctx.fillRect(0, 0, VW, VH); }   // lightning flicker
    ctx.restore();
  }
}
// Sidebar plates.
function shipEventPlates(add) {
  if (enc.flare) add('flare', { icon: 'flare', title: 'SOLAR FLARE', sub: enc.flare.phase === 'warn' ? `in ${Math.ceil(enc.flare.t)} s · shelter on the lower deck!` : `radiation · ${Math.ceil(enc.flare.t)} s`, stripe: '#ffb347', red: true });
  if (enc.storm) add('storm', { icon: 'surge', title: 'ION STORM', sub: `${Math.ceil(enc.storm.t)} s · full capacitors arc`, stripe: '#9cc4ff', red: true });
  if (enc.coolant) add('coolant', { icon: 'fire', title: 'COOLANT LEAK', sub: `reactor heat ${Math.round(enc.coolant.heat)}% · canister in the left airlock room`, stripe: '#4ac0e0', red: true });
  if (enc.scram) add('scram', { icon: 'fire', title: 'REACTOR SCRAM', sub: `no energy for ${Math.ceil(enc.scram)} s`, stripe: '#ff4a3a', red: true });
  if (enc.glitch) add('glitch', { icon: 'unknown', title: 'AI GLITCH', sub: 'doors lock themselves · reboot at security', stripe: '#c08aff', red: true });
}
