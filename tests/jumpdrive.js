// The jump drive in every mission: three jump coils on the hull (aligned unless the `coils` rule), a jump
// handle at the helm the autopilot pulls (with the `handle` rule a person must), the coils' spool-up and flare;
// gravity tides (warning, lurch: items slide, spacewalkers pushed off, one coil knocked off with the `coils`
// rule); the herd (two organic encounters at once from one side); snapshot sync of all of it.
// Run: node tests/jumpdrive.js
const { loadGame } = require('./harness');
const NAMES = ['simTick', 'tick', 'me', 'crew', 'mission', 'startMission', 'MISSIONS', 'evs', 'enc', 'org', 'combat', 'CAPACITORS', 'SYSTEMS', 'ITEMS',
  'JUMP_HANDLE', 'JUMP_PULL', 'AUTO_LEAD', 'AUTO_PULL', 'handlePull', 'clickTarget', 'withCrew', 'coilFx', 'jumpCharge', 'jumpOutT', 'startTide', 'TIDE_WARN',
  'TIDE_TIME', 'runEvent', 'makeEvent', 'eventLabel', 'HERD_KINDS', 'evaReach', 'roomAt', 'GFX', 'drawMinigameProps', 'drawEvaJobs', 'netSerialize', 'netApply',
  'COIL_SPOTS', 'encounterPlates', 'radarList', 'makeCrew'];
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const tickN = (G, n, each) => { for (let i = 0; i < n; i++) { each?.(); G.simTick(DT); } };
const calm = (G) => { G.combat.shots.length = 0; G.combat.enemies.length = 0; G.SYSTEMS.forEach(s => { s.broken = false; }); };
// a mission at the end of its timeline: nothing else happens, MID has energy
const atJump = (G, id, lead = 6) => {
  G.startMission(id); G.mission.events.forEach(e => { e.done = true; }); calm(G);
  G.CAPACITORS[1].charge = 2; G.mission.t = G.mission.jumpAt - lead;
};

// --- the coils and the handle are part of every mission
{
  const G = loadGame(NAMES);
  const ids = Object.keys(G.MISSIONS).filter(id => !G.MISSIONS[id].tutorial);
  let coilsOk = true, handleOk = true, drawnOk = true;
  for (const id of ids) {
    G.startMission(id); G.mission.active = false;
    const rule = !!G.mission.rules?.coils;
    if (G.evs.coils.length !== 3 || !G.evs.coils.every(c => c.ok === !rule)) { coilsOk = false; console.log(`   ${id}: coils ${JSON.stringify(G.evs.coils.map(c => c.ok))}`); }
    const me = G.me; me.mode = 'inside'; me.x = G.JUMP_HANDLE.x + 0.9; me.y = G.JUMP_HANDLE.y + 0.8;
    const h = G.withCrew(me, () => G.clickTarget(G.JUMP_HANDLE.x, G.JUMP_HANDLE.y));
    if (!h || !/jump handle/i.test(h.text)) { handleOk = false; console.log(`   ${id}: handle "${h?.text}"`); }
    const drawn = [], GFX = G.GFX, saved = { on: GFX.on, ready: GFX.ready, sprite: GFX.sprite, frameIndex: GFX.frameIndex };
    Object.assign(GFX, { on: true, ready: () => true, frameIndex: () => 0, sprite: (n) => { drawn.push(n); return true; } });
    try { G.drawMinigameProps(0); G.drawEvaJobs(0); } catch (e) { /* (2D bits after the sprites) */ }
    Object.assign(GFX, saved);
    if (!drawn.includes('systems/jump_off') || ['left', 'right', 'stern'].some(n => !drawn.some(d => d.startsWith(`hull/coil_${n}_`)))) { drawnOk = false; console.log(`   ${id}: drew ${drawn.filter(d => /jump|coil/.test(d))}`); }
  }
  check(coilsOk, `every mission has the 3 jump coils, misaligned only with the coils rule (${ids.length} missions)`);
  check(handleOk, 'every mission has the jump handle at the helm');
  check(drawnOk, 'the handle and all three coils are drawn in every mission');
}

// --- without the handle rule the autopilot pulls it; the jump comes on time
{
  const G = loadGame(NAMES); atJump(G, 'intro');
  const at = G.mission.jumpAt, me = G.me;
  tickN(G, 60 * (6 - G.AUTO_LEAD - 0.5));
  check(G.mission.autoPull == null && G.handlePull() === 0, 'before the spool-up the handle rests');
  let banner = null, pullMid = null;
  tickN(G, 60, () => { if (/Autopilot: jump handle engaged/.test(G.combat.banner?.text || '')) banner = G.combat.banner.text; });
  check(G.mission.autoPull != null && banner, `${G.AUTO_LEAD} s before the spool-up the autopilot engages the handle ("${banner}")`);
  tickN(G, Math.round(60 * G.AUTO_PULL / 2) - 30); pullMid = G.handlePull();
  tickN(G, Math.round(60 * G.AUTO_PULL));
  check(pullMid > 0.2 && pullMid < 0.8 && G.handlePull() === 1, `you see it move: halfway ${pullMid.toFixed(2)}, then fully pulled`);
  const h = G.withCrew(me, () => G.clickTarget(G.JUMP_HANDLE.x, G.JUMP_HANDLE.y));
  check(h && !h.ok && /autopilot/i.test(h.text), `nobody has to pull it ("${h?.text}")`);
  while (!G.mission.over && G.mission.t < at + 3) { calm(G); G.simTick(DT); }
  check(G.mission.over?.won && Math.abs(G.mission.over.t - at) < 0.1, `it jumps right when the drive spools (${(G.mission.over?.t - at).toFixed(2)} s after the due time)`);
}
// --- with the handle rule (no nav fix) a person must
{
  const G = loadGame(NAMES); atJump(G, 'deep'); G.evs.coils.forEach(c => { c.ok = true; });
  let banner = null;
  tickN(G, 60 * 9, () => { calm(G); if (/No nav fix/.test(G.combat.banner?.text || '')) banner = G.combat.banner.text; });
  check(G.mission.jump && !G.mission.over && G.mission.autoPull == null && G.handlePull() === 0, 'with the handle rule the autopilot can\'t: the drive waits');
  check(!!banner, `"${banner}"`);
  const me = G.me; me.x = G.JUMP_HANDLE.x + 0.9; me.y = G.JUMP_HANDLE.y + 0.8; me.health = 'ok';
  const m = me.input.mouse; m.wx = G.JUMP_HANDLE.x; m.wy = G.JUMP_HANDLE.y; m.down = true;
  let t = 0, half = null; while (!G.mission.over && t < 10) { calm(G); G.simTick(DT); t += DT; if (half === null && t >= G.JUMP_PULL / 2) half = G.handlePull(); }
  check(G.mission.over?.won && Math.abs(half - 0.5) < 0.1, `a crew member holds it ${t.toFixed(1)} s (the handle shows ${half?.toFixed(2)} halfway), then it jumps`);
}

// --- the coils come alive in the spool-up and flare at the jump
{
  const G = loadGame(NAMES); atJump(G, 'intro', 12);
  const c = G.evs.coils[0], f0 = G.coilFx(c);
  while (G.mission.t < G.mission.jumpAt - 0.5) { calm(G); G.tick(DT); }
  const f1 = G.coilFx(c);
  check(f0.k === 0 && f0.spin === 0 && f0.flare === 0, 'at rest the coils are dark and still');
  check(f1.k > 0.4 && f1.spin > 5 && !f1.sputter && f1.flare === 0, `in the spool-up they glow and their dials spin (charge ${f1.k.toFixed(2)}, ${f1.spin.toFixed(1)} rad/s)`);
  G.mission.coilsChecked = true; G.evs.coils[1].ok = false;   // (knocked off after its delay was counted: e.g. a tide in the spool-up)
  const bad = G.coilFx(G.evs.coils[1]);
  check(bad.sputter && bad.spin === 0, 'a misaligned coil sputters red instead of spinning');
  while (!G.mission.over) { calm(G); G.tick(DT); }
  G.tick(DT);
  const f2 = G.coilFx(c);
  check(f2.flare > 0.8, `at the jump they flare (${f2.flare.toFixed(2)})`);
  for (let i = 0; i < 60; i++) G.tick(DT);
  check(G.coilFx(c).flare === 0, 'and the flare fades within a second');
}

// --- gravity tides
{
  const G = loadGame(NAMES); G.startMission('deep'); G.mission.active = false; calm(G);
  G.evs.coils.forEach(c => { c.ok = true; });
  const it = G.ITEMS.find(i => { const r = G.roomAt(i.x, i.y); return r && G.roomAt(i.x - 1.3, i.y) === r; }) || G.ITEMS[0];
  const x0 = it.x, room0 = G.roomAt(it.x, it.y);
  const walker = G.me; walker.mode = 'eva'; walker.x = -1.0; walker.y = 16; walker.vx = walker.vy = 0;
  const e0 = G.evaReach(walker.x, walker.y).e;
  G.startTide(-1);
  check(G.enc.tide?.phase === 'warn' && /Gravity tide in 5 s/.test(G.combat.banner?.text || ''), `a warning first ("${G.combat.banner?.text}")`);
  check(G.encounterPlates().some(p => p.key === 'tide'), 'the sidebar shows the tide');
  tickN(G, 60 * (G.TIDE_WARN - 0.5), () => { walker.x = -1.0; walker.y = 16; walker.vx = walker.vy = 0; });
  check(G.evs.coils.every(c => c.ok) && it.x === x0, 'during the warning nothing moves yet');
  let shake = 0;
  tickN(G, 60 * (0.5 + G.TIDE_TIME + 0.2), () => { shake = Math.max(shake, G.combat.shake); });
  const knocked = G.evs.coils.filter(c => !c.ok);
  check(shake > 0.9, 'the tide hits: the ship lurches (screen shake)');
  check(knocked.length === 1, `it knocks exactly one jump coil out of alignment (the ${knocked[0]?.name} one)`);
  check(it.x < x0 - 0.5 && x0 - it.x <= 1.25 && G.roomAt(it.x, it.y) === room0, `the ${it.kind} on the floor slid ${(x0 - it.x).toFixed(2)} to the left, staying in its room`);
  const e1 = G.evaReach(walker.x, walker.y).e;
  check(e1 > e0 + 0.1, `the spacewalker got pushed away from the hull (reach ${e0.toFixed(2)} → ${e1.toFixed(2)})`);
  check(!G.enc.tide, 'then it is over');
  G.startTide(); tickN(G, 60 * (G.TIDE_WARN + G.TIDE_TIME + 0.5));
  check(G.evs.coils.filter(c => !c.ok).length === 2, 'another tide, another coil off');
  // without the coils rule: no coil knocked; the event kind and the rule
  const G2 = loadGame(NAMES); G2.startMission('intro'); G2.mission.active = false; calm(G2);
  G2.runEvent({ t: 0, kind: 'tide' }); tickN(G2, 60 * (G2.TIDE_WARN + G2.TIDE_TIME + 0.5));
  check(G2.evs.coils.every(c => c.ok), 'without the coils rule the coils stay aligned');
  check(G2.eventLabel({ kind: 'tide' }) === 'Gravity tide — everywhere', 'event kind tide has a label');
  const G3 = loadGame(NAMES); G3.startMission('intro'); G3.mission.events = []; G3.mission.jumpAt = Infinity; G3.mission.rules.tides = 20;
  let first = null; tickN(G3, 60 * 45, () => { calm(G3); if (first === null && G3.enc.tide) first = G3.mission.t; });
  check(first !== null && first <= 20.1, `rule tides: 20 brings a tide ~20 s in (at ${first?.toFixed(1)} s)`);
  // and only that one (2026-10-17, the user: "just do one gravity wave per mission")
  let starts = 0, was = false; tickN(G3, 60 * 120, () => { calm(G3); if (G3.enc.tide && !was) starts++; was = !!G3.enc.tide; });
  check(starts === 0 && G3.enc.tideDone, `... and never again (${starts} more in the next 2 minutes)`);
  const S3 = loadGame(NAMES); S3.startMission('intro'); S3.mission.rules.tides = 20; S3.netApply(JSON.parse(JSON.stringify(G3.netSerialize())));
  check(S3.enc.tideDone === true, 'the "tide done" flag survives a snapshot (JSON)');
}
// --- at most one gravity tide per mission: written tide events + the rule's one, every mission, crew size and difficulty
{
  const G = loadGame(NAMES), had = new Set(), bad = [];
  for (const id of Object.keys(G.MISSIONS).filter(id => !G.MISSIONS[id].practice)) for (let n = 1; n <= 8; n++) for (let easy = 0; easy <= 2; easy++) {
    G.crew.length = 1; while (G.crew.length < n) G.crew.push(G.makeCrew('P' + G.crew.length));
    G.startMission(id, { easy }); G.mission.active = false;
    const tides = G.mission.events.filter(e => e.kind === 'tide').length + (G.mission.rules?.tides ? 1 : 0);
    if (tides > 1) bad.push(`${id} ×${n} easy ${easy}: ${tides}`);
    if (tides) had.add(id);
  }
  G.crew.length = 1;
  check(!bad.length, `at most one gravity tide per mission, every mission, 1-8 players, every difficulty${bad.length ? ': ' + bad.slice(0, 6).join(', ') : ''}`);
  check(['c7', 'c8', 'deep'].every(id => had.has(id) && G.MISSIONS[id].rules.tides), `the tide missions still have theirs (${[...had].join(', ')})`);
}

// --- the herd: two organic encounters at once, one side
{
  const G = loadGame(NAMES); G.startMission('intro'); G.mission.active = false; calm(G);
  G.runEvent({ t: 0, kind: 'herd', kinds: ['grappler', 'leeches'], side: 'port' });
  check(G.combat.enemies.some(e => e.kind === 'grappler' && e.side === 'port') && G.org.leeches.length === 6 && G.org.leeches.every(l => l.side === 'port'),
        'a herd of grappler + leeches: both arrive at once, both on the left');
  check(/calls from the deep.*LEFT side/.test(G.combat.banner?.text || '') && G.org.herd?.side === 'port', `announced by the call ("${G.combat.banner?.text}")`);
  check(G.encounterPlates().some(p => p.key === 'herd'), 'the sidebar shows the herd');
  tickN(G, 60 * 10);
  check(!G.org.herd, 'the call fades after a few seconds (the encounters stay)');
  const G2 = loadGame(NAMES); G2.startMission('intro'); G2.mission.active = false; calm(G2);
  G2.runEvent({ t: 0, kind: 'herd', kinds: ['mother', 'spores'], side: 'star' });
  check(G2.combat.enemies.some(e => e.kind === 'mother' && e.side === 'star') && G2.evs.spores.length && G2.evs.spores.every(s => s.side === 'star'), 'spore mother + spore clouds: both on the right');
  let pairsOk = true;
  for (let i = 0; i < 40; i++) { const ev = G2.makeEvent('herd', 50, null); if (ev.kinds.length !== 2 || ev.kinds[0] === ev.kinds[1] || !ev.kinds.every(k => G2.HERD_KINDS.includes(k)) || !['port', 'star'].includes(ev.side)) pairsOk = false; }
  check(pairsOk, 'makeEvent(\'herd\') draws two different organic kinds and a side');
  const lbl = G2.eventLabel({ kind: 'herd', kinds: ['grappler', 'leeches'], side: 'port' });
  check(lbl === 'Herd: grappler + leech swarm — left', `the radar / sidebar label: "${lbl}"`);
}

// --- snapshot sync
{
  const S = loadGame(NAMES); S.startMission('deep'); S.mission.active = false; calm(S);
  S.evs.coils.forEach(c => { c.ok = true; });
  S.startTide(1); tickN(S, 60 * (S.TIDE_WARN + 0.3));
  S.runEvent({ t: 0, kind: 'herd', kinds: ['grappler', 'leeches'], side: 'star' });
  S.mission.autoPull = 12.5;
  const B = loadGame(NAMES); B.startMission('intro');
  B.netApply(JSON.parse(JSON.stringify(S.netSerialize())), S.me.id);
  check(B.enc.tide?.phase === 'lurch' && B.enc.tide.dir === 1 && B.enc.tide.coil === S.enc.tide.coil, 'a browser gets the tide (phase, side, the coil it knocked)');
  check(JSON.stringify(B.evs.coils.map(c => c.ok)) === JSON.stringify(S.evs.coils.map(c => c.ok)) && B.evs.coils.some(c => !c.ok), 'and the coils\' alignment');
  check(B.org.herd?.side === 'star' && B.org.herd.kinds.join() === 'grappler,leeches', 'and the herd\'s call');
  check(B.mission.autoPull === 12.5 && B.mission.rules.handle === true, 'and the autopilot\'s pull and the handle rule');
}

console.log(failed ? `\n${failed} FAILED` : '\nall ok');
process.exit(failed ? 1 : 0);
