// Hit effects (js/hitfx.js), the sprite path: every particle is drawn through one reused options object (2026-11-10:
// two fresh objects per particle per frame, up to 1400 particles), and nothing of one particle's options leaks into
// the next one's. Run: node tests/hitfx.js
const { loadGame } = require('./harness');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const G = loadGame(['HITFX', 'drawHitFxGL', 'hitFxImpact', 'GFX', 'startMission']);
G.startMission('c1');
const calls = [], objs = new Set();
// (what GFX.sprite reads of the options, the way it reads them: js/gfx.js sprite())
const read = (o) => ({ layer: o.layer ?? 'main', sortY: o.sortY ?? null, depthWrite: o.depthWrite !== false, unlit: !!o.unlit, scale: o.scale || 1, sx: o.sx || 1, rot: o.rot || 0, alpha: o.alpha == null ? 1 : o.alpha,
  extra: Object.keys(o).filter(k => !['layer', 'sortY', 'depthWrite', 'unlit', 'scale', 'sx', 'rot', 'alpha'].includes(k)).join() });
G.GFX.on = true; G.GFX.sprite = (name, frame, x, y, z, o) => { objs.add(o); calls.push({ name, x, y, z, ...read(o) }); return true; };
G.HITFX.spr = { spark: ['s0', 's1', 's2', 's3', 's4'], heat: [] };

// a big hit from outside and a small one: sparks, embers, smoke, debris and the shock ring
G.hitFxImpact(-0.5, 10, 'port', true); G.hitFxImpact(44.5, 20, 'star', false);
const n = G.HITFX.parts.length, kinds = new Set(G.HITFX.parts.map(p => p.k));
check(n > 150 && [0, 1, 2, 3, 4].every(k => kinds.has(k)), `two hits spawn every kind of particle (${n}: kinds ${[...kinds].sort().join()})`);
G.drawHitFxGL();
check(calls.length >= n && objs.size === 1, `${calls.length} sprites drawn through ${objs.size} options object (none made per particle)`);
check(calls.every(c => !c.extra), 'and it carries nothing but the options the particles set');

// each kind's options, drawn one after the other in the worst order (a ring, then an inside puff, then an outside spark ...)
const P = { life: 0.5, max: 1, x: 5, y: 6, z: 1, vx: 1, vy: 0, vz: 0, temp: 1, size: 1 };
G.HITFX.parts.length = 0; calls.length = 0;
G.HITFX.parts.push({ ...P, k: 4, r: 2 }, { ...P, k: 2, r: 0.5, seed: 3, inside: true }, { ...P, k: 0 }, { ...P, k: 3, rot: 1.25, inside: true }, { ...P, k: 2, r: 0.5, seed: 0 }, { ...P, k: 1, inside: true });
G.drawHitFxGL();
const ring = calls.slice(0, 18), [puffIn, spark, shard, glow, puffOut, ember] = calls.slice(18);
check(calls.length === 24 && ring.every(c => c.layer === 'top' && c.unlit && c.sx === 3 && c.scale === 1.6 && c.sortY === null && c.depthWrite), 'the shock ring: 18 unlit streaks on top');
check(puffIn.name === 'fx/smoke_3' && puffIn.layer === 'main' && puffIn.sortY === 6.3 && !puffIn.depthWrite && !puffIn.unlit && puffIn.sx === 1 && puffIn.rot === 0 && puffIn.scale === 2,
  'smoke inside, right after it: lit, sorted with the room, no depth, not stretched or turned like the ring');
check(spark.layer === 'top' && spark.sortY === null && spark.depthWrite && spark.unlit && spark.sx > 1 && spark.name === 's1', 'a spark outside: on top, unlit, stretched along its motion, nothing left of the puff\'s sorting');
check(shard.name === 'fx/junk_shard' && shard.rot === 1.25 && !shard.unlit && shard.sx === 1 && shard.sortY === 6.3 && glow.name === 's2' && glow.unlit && glow.rot === 0 && glow.sortY === 6.3,
  'a shard of plating inside: turned and lit, its glow on it unlit and not turned');
check(puffOut.name === 'fx/smoke_0' && puffOut.layer === 'top' && puffOut.depthWrite && !puffOut.unlit && puffOut.rot === 0, 'smoke outside: on top, lit');
check(ember.layer === 'main' && ember.sortY === 6.3 && !ember.depthWrite && ember.unlit && Math.abs(ember.scale - 1.1) < 1e-9, 'an ember inside: unlit, sorted with the room');
process.exitCode = failed ? 1 : 0;
