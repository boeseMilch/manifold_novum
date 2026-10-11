// Rough difficulty budget: shots / energy each encounter needs (perfect aim and 50% misses)
// versus the energy the ship can have on that side by then. Reads the real constants from the
// game, so it stays honest when numbers change. Run: node tools/balance.js
const { loadGame } = require('../tests/harness');
const G = loadGame(['ENEMY_TYPES', 'SHOTS_PER_ENERGY', 'CANNON_COOLDOWN', 'RELOAD_TIME', 'HEAVY_PERIOD', 'HEAVY_CHARGE',
  'SHIELD_PERIOD', 'SHIELD_ON', 'ENERGY_TIME', 'CELL_ENERGY', 'power', 'CAP_MAX', 'CAPACITORS', 'SWARM_SIZE', 'SWARM_INTERVAL',
  'ASTEROID_WEAR', 'startMission', 'mission', 'JUMP_DELAY']);
G.startMission();

const AIM_TIME = 1.2;                 // seconds to line up a shot on a moving target (rough guess)
const acc = [1, 0.5];
const fmt = (n) => (Math.round(n * 10) / 10).toString();

// Shots to finish each threat with perfect aim (misses scale it by 1/accuracy).
const threats = {
  interceptor: { cannon: 'side', shots: G.ENEMY_TYPES.interceptor.pois.length, heavy: false },
  frigate: { cannon: 'side', shots: G.ENEMY_TYPES.frigate.pois.length, heavy: true, shieldBlocks: G.SHIELD_ON / G.SHIELD_PERIOD },
  // per big asteroid: 1 crack shot + 1 shot per small piece (2) = 3; worst case 4 body hits instead of the crack
  swarm: { cannon: 'front', shots: G.SWARM_SIZE * 3, perfectWorst: G.SWARM_SIZE * (G.ASTEROID_WEAR + 2) },
};

function need(kind, a) {
  const T = threats[kind];
  // frigate: its shield bubble is up SHIELD_ON of every SHIELD_PERIOD, shots into it are wasted unless you wait
  const shots = Math.ceil(T.shots / a);
  const reloads = Math.max(0, Math.ceil((shots - G.SHOTS_PER_ENERGY) / G.SHOTS_PER_ENERGY));
  let fight = shots * AIM_TIME + reloads * G.RELOAD_TIME;
  if (T.shieldBlocks) fight /= 1 - T.shieldBlocks;                   // waiting out the bubble
  if (kind === 'swarm') fight = Math.max(fight, (G.SWARM_SIZE - 1) * G.SWARM_INTERVAL + 10);
  const heavies = T.heavy ? Math.max(1, Math.floor((fight + 7 - G.HEAVY_CHARGE) / G.HEAVY_PERIOD) + 1) : 0;
  return { shots, reloads, fight, heavies, energy: reloads + heavies };
}

// Energy on each side over time: auto lever (mid → stbd → port), capacitors cap at CAP_MAX, starting
// charge 1 each, reactor refuelled right away (CELL_ENERGY per cell, 1 + reserve cells).
function supplyAt(t, side) {
  const caps = [1, 1, 1]; let fuel = G.CELL_ENERGY * (1 + G.power.reserve), pos = 1, wasted = 0;
  for (let k = G.ENERGY_TIME; k <= t && fuel > 0; k += G.ENERGY_TIME) {
    fuel--; if (caps[pos] < G.CAP_MAX) caps[pos]++; else wasted++;
    pos = (pos + 1) % 3;
  }
  return { have: caps[side], wasted, produced: Math.min(Math.floor(t / G.ENERGY_TIME), G.CELL_ENERGY * (1 + G.power.reserve)) };
}

console.log(`Constants: ${G.SHOTS_PER_ENERGY} shots per energy (cannons start full), reload ${G.RELOAD_TIME} s, 1 energy every ${G.ENERGY_TIME} s,`);
console.log(`           capacitors hold ${G.CAP_MAX} and start at 1, fuel: ${1 + G.power.reserve} cells × ${G.CELL_ENERGY} energy, aim time guess ${AIM_TIME} s/shot\n`);
const rows = [];
const sideIdx = { port: 0, star: 2, front: 1 };
for (const ev of G.mission.events) {
  if (!threats[ev.kind]) continue;
  const side = ev.side || 'front', si = sideIdx[side];
  const sup = supplyAt(ev.t, si);
  for (const a of acc) {
    const n = need(ev.kind, a);
    // during the fight you can pin the lever on this side (wrench): +1 per ENERGY_TIME
    const during = Math.floor(n.fight / G.ENERGY_TIME);
    rows.push({ at: `T+${ev.t}`, what: `${ev.kind} (${side})`, aim: a === 1 ? 'perfect' : '50% miss', shots: n.shots, reloads: n.reloads,
                shields: n.heavies, need: n.energy, have: `${sup.have} stored + ${during} pinned`, ok: n.energy <= sup.have + during ? 'yes' : 'NO', fight: `${Math.round(n.fight)} s` });
  }
}
const jumpAt = G.mission.jumpAt;
rows.push({ at: `T+${jumpAt}`, what: 'jump (front/mid)', aim: '-', shots: '-', reloads: '-', shields: '-', need: 1, have: `${supplyAt(jumpAt, 1).have} stored`, ok: 'yes', fight: '-' });
console.table(rows);

// The old 6-asteroid swarm, for comparison
const old = { shots: 6 * 3 };
for (const a of acc) {
  const shots = Math.ceil(old.shots / a), reloads = Math.ceil((shots - 3) / 3);
  console.log(`old 6-asteroid swarm, ${a === 1 ? 'perfect' : '50% miss'}: ${shots} shots → ${reloads} energy from the middle capacitor (holds ${G.CAP_MAX}) → ${reloads <= G.CAP_MAX + 2 ? 'tight' : 'impossible'}`);
}
const total = supplyAt(jumpAt, 0).produced + 3;
console.log(`\nWhole mission: up to ${total} energy (3 starting + ${total - 3} from the reactor if you refuel), but each capacitor only holds ${G.CAP_MAX}.`);
