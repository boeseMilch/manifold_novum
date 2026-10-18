// Energy, shields, reactor + lever, fuel, inventory, repairs, lights, enemy turrets and
// the invader. Run: node tests/systems.js
const { loadGame } = require('./harness');
const G = loadGame(['tick', 'time', 'ui', 'miniCommand', 'player', 'combat', 'combatClear', 'combatSpawn', 'teleportToGun', 'fireCannon', 'pressShield', 'reloadCannon',
  'CAPACITORS', 'CAP_MAX', 'GUNS', 'power', 'inv', 'ITEMS', 'SYSTEMS', 'clickTarget', 'updateRepair', 'grab', 'lightLevel',
  'drawLights', 'fuelFraction', 'CELL_ENERGY', 'REACTOR', 'LEVER', 'FUEL_CRATE', 'ENERGY_TIME', 'boarding', 'spawnInvader', 'hurtInvader',
  'enemyToWorld', 'ENEMY_TYPES', 'hitPoi', 'mouse', 'SHIELD_COOLDOWN', 'SHIELD_UP_TIME', 'combatBanner', 'lineOfSight', 'canStand', 'walkRects', 'fires',
  'LEVER_ANGLES', 'LEVER_HANDLE_STEP', 'LEVER_HANDLE_FRAMES']);
const DT = 1 / 60;
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const run = (sec, each) => { for (let i = 0; i < sec * 60; i++) { each?.(); G.tick(DT); } };
const caps = (a, b, c) => { [a, b, c].forEach((v, i) => { G.CAPACITORS[i].charge = v; }); };
const fixAll = () => G.SYSTEMS.forEach(s => { s.broken = false; });
const reset = () => { G.combatClear(); fixAll(); G.fires.length = 0; G.boarding.invaders.length = 0; G.boarding.bolts.length = 0; G.power.bolts.length = 0;
  G.player.mode = 'inside'; G.player.gun = null; G.player.x = 22.2; G.player.y = 4.5; };

// --- cannons: start loaded with 3 shots; empty = click; reload (R / button) costs 1 energy
reset(); caps(1, 1, 1); G.teleportToGun('port');
const pg = G.GUNS.find(g => g.id === 'port'); pg.shots = 3; pg.reload = 0;
const fireAll = (g) => { let n = 0; for (let i = 0; i < 10; i++) { g.cd = 0; const k = G.combat.shells.length; G.fireCannon(g); if (G.combat.shells.length > k) n++; } return n; };
let shots = fireAll(pg);
check(shots === 3 && G.CAPACITORS[0].charge === 1, `a loaded cannon fires 3 shots without touching energy, then only clicks (fired ${shots}, capacitor still ${G.CAPACITORS[0].charge})`);
check(G.reloadCannon(pg) && G.CAPACITORS[0].charge === 0, 'reloading takes 1 energy from the port capacitor');
run(3.2);
check(pg.shots === 3 && fireAll(pg) === 3, 'after the reload (3 s on its own) it has 3 shots again');
check(!G.reloadCannon(pg) && pg.shots === 0, 'with the capacitor empty, reloading does nothing');
caps(0, 2, 0); const fg = G.GUNS.find(g => g.id === 'front'); fg.shots = 0; fg.reload = 0; G.reloadCannon(fg);
check(G.CAPACITORS[1].charge === 1, 'the front cannon reloads from the middle capacitor');

// --- cannons are manned from inside only (ladder), not from a spacewalk
reset(); { const g = G.GUNS.find(g => g.id === 'port'); G.player.mode = 'eva'; G.player.x = g.x - 1.2; G.player.y = g.y + 1.5; G.player.input.pressed.add('KeyE'); G.tick(DT);
  check(G.player.mode === 'eva' && !G.player.prompt, 'floating next to a cannon outside: you cannot man it (only from the ladder inside)'); }

// --- shields cost energy; none → nothing happens, no cooldown
reset(); caps(0, 0, 1);
const noE = G.pressShield('port');
check(noE === 'noenergy' && G.combat.shields.port.up === 0 && G.combat.shields.port.cd === 0, 'port shield without energy: no shield, no cooldown');
const okE = G.pressShield('star');
check(okE === true && G.CAPACITORS[2].charge === 0 && G.combat.shields.star.up > 0, 'starboard shield costs 1 energy from the starboard capacitor');

// --- reactor + lever: one energy per 20 s, auto order middle → starboard → port, full = wasted
// (lever positions are capacitor indices: 0 port, 1 middle, 2 starboard; it starts on middle)
check(G.power.lever.pos === 1, 'the lever starts on MID');
reset(); caps(0, 0, 0); G.power.reactor.fuel = 5; G.power.reactor.t = 0; G.power.lever.pos = 1; G.power.lever.jammed = false;
run(G.ENERGY_TIME * 3 + 2);
check(G.CAPACITORS.map(c => c.charge).join() === '1,1,1' && G.power.reactor.fuel === 2,
      `3 energies in 60 s go middle, starboard, port (caps ${G.CAPACITORS.map(c => c.charge)}, fuel left ${G.power.reactor.fuel})`);
caps(0, G.CAP_MAX, 0); G.power.lever.pos = 1; G.power.reactor.t = G.ENERGY_TIME - 0.1;
run(2);
check(G.CAPACITORS[1].charge === G.CAP_MAX && G.power.lever.pos === 2, 'energy into a full capacitor is wasted, lever moves on');
caps(0, 0, 0); G.power.lever.pos = 0; G.power.lever.jammed = true; G.power.reactor.fuel = 5;
for (let k = 0; k < 2; k++) { G.power.reactor.t = G.ENERGY_TIME - 0.1; run(1.5); }
check(G.CAPACITORS[0].charge === 2 && G.power.lever.pos === 0, 'manual override (wrench) keeps the lever on one output');

// --- the handle's sprite: one frame per LEVER_HANDLE_STEP from LEFT to RIGHT, and the packed sheet has all of them
// (a re-pack from stale renders once left 13 frames for 19 angles: the handle twitched and never reached RIGHT)
const sheet = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../assets/sprites/sprites.json'), 'utf8')).sprites['systems/lever_handle'];
const span = Math.abs(G.LEVER_ANGLES[2] - G.LEVER_ANGLES[0]);
check(Math.abs(span / G.LEVER_HANDLE_STEP + 1 - G.LEVER_HANDLE_FRAMES) < 1e-9 && sheet?.frames === G.LEVER_HANDLE_FRAMES,
  `the lever handle sheet has a frame for every ${Math.round(G.LEVER_HANDLE_STEP * 180 / Math.PI)}° step (${sheet?.frames} frames, the code wants ${G.LEVER_HANDLE_FRAMES})`);

// --- clicking: lever turn + override, fuel crate → reactor
reset(); G.power.lever.jammed = false; G.power.lever.pos = 1;
G.player.x = G.LEVER.x; G.player.y = G.LEVER.y - 1.0;
let t = G.clickTarget(G.LEVER.x + 0.4, G.LEVER.y); t.run();
check(G.power.lever.pos === 2, 'clicking the dial turns the lever to the next output (MID → STBD)');
t = G.clickTarget(G.LEVER.x, G.LEVER.y); t.run();
check(G.power.lever.jammed && !G.clickTarget(G.LEVER.x + 0.4, G.LEVER.y).run, 'clicking the hub wedges a wrench in: the lever can\'t turn');
G.power.reactor.fuel = 0; G.power.reserve = 3; G.inv.item = null;
G.player.x = G.FUEL_CRATE.x + 0.8; G.player.y = G.FUEL_CRATE.y;
G.clickTarget(G.FUEL_CRATE.x, G.FUEL_CRATE.y).run();
check(G.inv.item === 'fuel' && G.power.reserve === 2, 'clicking the crate takes a fuel cell (3 → 2 spare)');
G.player.x = G.REACTOR.x - 2.5; G.player.y = G.REACTOR.y;
G.clickTarget(G.REACTOR.x, G.REACTOR.y).run();
check(G.power.reactor.fuel === 5 && G.inv.item === null && !G.ui.panel, 'clicking the reactor with a fuel cell loads it right away (5 energy)');

// --- the fuel bar: how full the loaded cell still is, in whole energies
G.power.reactor.fuel = 5; G.power.reactor.t = 0;
check(G.fuelFraction() === 1, 'a fresh cell is 100% full');
G.power.reactor.fuel = 3; G.power.reactor.t = G.ENERGY_TIME / 2;
check(G.fuelFraction() === 3 / G.CELL_ENERGY, `3 energy left, half way to the next: still 3 of 5 bars (${G.fuelFraction()})`);
G.power.reactor.fuel = 0; G.power.reactor.t = 0;
check(G.fuelFraction() === 0, 'an empty reactor: 0');

// --- early swap: a fresh cell into a reactor that still has fuel throws the rest away
G.power.reactor.fuel = 2; G.power.reactor.t = 7; G.power.reserve = 2; G.inv.item = null;
G.player.x = G.FUEL_CRATE.x + 0.8; G.player.y = G.FUEL_CRATE.y;
G.clickTarget(G.FUEL_CRATE.x, G.FUEL_CRATE.y).run();
G.player.x = G.REACTOR.x - 2.5; G.player.y = G.REACTOR.y;
t = G.clickTarget(G.REACTOR.x, G.REACTOR.y);
check(t.ok && /swap in a fresh cell \(wastes the 2 energy left in this one\)/.test(t.text), `holding a cell at a part-full reactor offers the swap and says what it wastes ("${t.text}")`);
t.run();
check(G.power.reactor.fuel === 5 && G.power.reactor.t === 0 && G.power.reserve === 1 && G.inv.item === null,
      `the swap loads a full cell, wastes the 2 left and uses one spare (fuel ${G.power.reactor.fuel}, spare ${G.power.reserve})`);
// no spare cells: nothing to swap in
G.power.reactor.fuel = 2; G.power.reserve = 0; G.inv.item = null;
t = G.clickTarget(G.REACTOR.x, G.REACTOR.y);
check(!t.ok && !/swap/.test(t.text), `no cell in hand: no swap offered ("${t.text}")`);
G.player.x = G.FUEL_CRATE.x + 0.8; G.player.y = G.FUEL_CRATE.y;
t = G.clickTarget(G.FUEL_CRATE.x, G.FUEL_CRATE.y);
check(!t.ok && G.inv.item === null, 'and with the crate empty there is no cell to take');
G.power.reserve = 3;

// --- inventory: grabbing into a full slot drops the old item where you stand
reset(); G.inv.weapon = 'laser'; const before = G.ITEMS.length;
G.grab('repair');
const dropped = G.ITEMS.find(it => it.kind === 'laser' && Math.hypot(it.x - G.player.x, it.y - G.player.y) < 1);
check(G.inv.weapon === 'repair' && G.ITEMS.length === before + 1 && dropped, 'grabbing a weapon with a full weapon slot drops the old one at your feet');

// --- repair: hold 5 s with the repair kit
reset(); const cap0 = G.SYSTEMS.find(s => s.kind === 'capacitor' && s.ref === G.CAPACITORS[0]);
cap0.broken = true; G.player.x = cap0.x; G.player.y = cap0.y - 1.0; G.inv.weapon = null;
check(!G.clickTarget(cap0.x, cap0.y).ok, 'without the repair kit a broken part cannot be repaired');
G.inv.weapon = 'repair';
let held = 0;
for (let i = 0; i < 60 * 6 && cap0.broken; i++) { G.updateRepair(DT, G.clickTarget(cap0.x, cap0.y), true); held += DT; }
check(!cap0.broken && Math.abs(held - 5) < 0.1, `holding click with the repair kit fixes it in 5 s (took ${held.toFixed(2)} s)`);
cap0.broken = true; G.updateRepair(DT, G.clickTarget(cap0.x, cap0.y), true); G.updateRepair(DT, G.clickTarget(cap0.x, cap0.y), false);
for (let i = 0; i < 60 * 3; i++) G.updateRepair(DT, G.clickTarget(cap0.x, cap0.y), true);
check(cap0.broken, 'letting go restarts the repair');
fixAll();
// broken capacitor: no energy out of it
caps(3, 3, 3); G.SYSTEMS.find(s => s.ref === G.CAPACITORS[2]).broken = true;
check(G.pressShield('star') === 'noenergy', 'a broken capacitor gives no energy');
fixAll();

// --- lights: a column with an empty capacitor goes dark
caps(0, 2, 2); for (let i = 0; i < 120; i++) G.drawLights(DT);
check(G.lightLevel[0] < 0.1 && G.lightLevel[1] > 0.9, `port rooms dim when the port capacitor is empty (light ${G.lightLevel.map(v => v.toFixed(2))})`);

// --- hull hits break things in the column that got hit
reset(); G.combat.hits.large = 0;
const col0 = () => G.SYSTEMS.filter(s => s.col === 0 && s.broken).length, col2 = () => G.SYSTEMS.filter(s => s.col === 2 && s.broken).length;
G.combatSpawn('frigate', 'port');                      // its heavy shot will hit the port side
const fr = G.combat.enemies[0]; fr.heavyT = 0.1;
run(10);
check(G.combat.hits.large >= 1 && col0() >= 1 && col2() === 0, `a large hit on the port side breaks port-column parts (${col0()} broken there, ${col2()} on starboard)`);

// --- enemy turrets turn to where they shoot; cable hit → next shot fizzles
reset(); caps(3, 3, 3); G.combatSpawn('interceptor', 'port');
const e = G.combat.enemies[0]; let aligned = 0, total = 0;
run(10, () => {
  const n = G.combat.shots.length;
  if (n) {
    const s = G.combat.shots[n - 1];
    if (!s.checked) {
      s.checked = true; total++;
      const D = e.D, [px, py] = G.enemyToWorld(e, ...D.pivot);
      const muzzleDir = Math.atan2(s.y - py, s.x - px), shotDir = Math.atan2(s.vy, s.vx);
      if (Math.abs(((muzzleDir - shotDir + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.35) aligned++;
    }
  }
  fixAll();
});
check(total > 0 && aligned === total, `interceptor shots leave along the barrel (${aligned}/${total})`);
reset(); G.combatSpawn('interceptor', 'port');
const e2 = G.combat.enemies[0];
G.hitPoi(e2, e2.pois.find(p => p.id === 'cable'), e2.x, e2.y);
const shotsBefore = G.combat.shots.length; let fizzled = false;
for (let i = 0; i < 60 * 5 && e2.shotCount < 0; i++) G.tick(DT);
check(e2.shotCount === 0 && G.combat.shots.length === shotsBefore, 'after hitting the cable the very next shot fizzles');

// --- invader: comes in, roams, uses deck airlocks, fights back and dodges, dies after 4 hits
reset(); G.spawnInvader('port');
const a = G.boarding.invaders[0];
const seenRooms = new Set();
for (let i = 0; i < 60 * 300 && seenRooms.size < 2; i++) { if (a.mode === 'inside') seenRooms.add(a.y < 11.5 ? 'top' : 'bottom'); G.tick(DT); }
check(a.mode === 'inside', 'invader gets in through the outer airlock');
check(seenRooms.has('top') && seenRooms.has('bottom'), `invader roams both decks via the deck airlocks (${[...seenRooms]})`);
// fight: put the player in view, provoke it, and count spit + dodges
G.player.mode = 'inside';
a.x = 18.5; a.y = 9.0; a.path = []; G.player.x = 24.5; G.player.y = 9.5;   // open floor on the bridge, in view of each other
G.hurtInvader(a, 1);
a.hp = 100;                                              // don't let the test's own shots kill it here
let spat = 0, dodged = 0;
run(8, () => {
  G.player.health = 'ok';                         // (its spit and touch hurt: keep the target on its feet)
  if (G.boarding.bolts.some(b => b.owner === 'alien' && !b.counted && (b.counted = true))) spat++;
  if (a.act?.kind === 'lunge' && !a.dodgeCounted) { dodged++; a.dodgeCounted = true; } else if (a.act?.kind !== 'lunge') a.dodgeCounted = false;
  if (Math.random() < 0.03) {                     // shoot at it now and then
    const dx = a.x - G.player.x, dy = a.y - G.player.y, d = Math.hypot(dx, dy);
    G.boarding.bolts.push({ x: G.player.x, y: G.player.y, vx: dx / d * 26, vy: dy / d * 26, life: 0.9, owner: 'crew' });
  }
});
check(a.state === 'fight' && spat > 0, `provoked invader fights back (spat ${spat} times)`);
check(dodged > 0, `invader dodges incoming shots (${dodged} dodges)`);
a.hp = 4;
for (let k = 0; k < 4 && !a.dead; k++) G.hurtInvader(a, 1);
G.tick(DT);
check(a.dead && !G.boarding.invaders.includes(a), 'invader dies after 4 hits (ALIEN_HP 4)');

process.exitCode = failed ? 1 : 0;
