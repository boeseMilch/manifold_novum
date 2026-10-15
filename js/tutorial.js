// Tutorial: RAIDER basic training. A railroaded solo run on a stock ship, driven by a list of steps.
//   - Messages: click-through pages (Next, a click on the box, Enter or Space); the simulation is paused
//     while one is open (game.js frame() → tutorialPaused / tutorialClient).
//   - Railroading: game.js asks tutorialAllows(what, arg) at its central places (interaction targets and
//     prompts, cannon fire / reload / cover, climbing down, closing panels, hand weapons, the debug menu);
//     only what the current step allows works.
//   - Enemy hits never do real damage here (combat.js shipHit / crewHit → tutorialHit).
//   - Steps are data: TUT_STEPS[id] = { objective(), marker(), allow(what, arg), enter(), tick(dt) }.
//     tutGo(id) moves on; add a step by adding an entry and pointing a tutGo at it.
//   - After the last message: free roam (step 'roam'), every gate open, until the player leaves (BACK TO MENU / Esc).
// Solo only: the server doesn't load this file (every hook in the other files checks it exists).

const tut = {
  on: false, controls: 'mouse', step: null, t: 0, d: {}, msg: null,
  enemyFire: 'off',          // 'off': the interceptor holds its fire · 'one': one scripted shot · 'on': fires as usual (harmless)
  killed: false,             // the interceptor is dead
  reactorDone: false,        // the reactor section is done (the lever demo)
  fuelLoaded: false,         // a cell went into the reactor: from then on the training reactor never runs dry
  misses: 0, blockFails: 0, swallow: new Set(), done: false,
  ask: false,                // free roam: the "back to the menu?" confirm is open
};
const TUT_KEY = 'mn-controls', TUT_DONE_KEY = 'mn-tutorial-done';
const tutC = (mouseText, keyText) => (tut.controls === 'keyboard' ? keyText : mouseText);   // the text for the chosen controls
const tutGun = () => GUNS.find(g => g.id === 'port');
const tutFoe = () => combat.enemies.find(e => e.kind === 'interceptor' && e.phase === 'fighting');
const tutPoi = (e, id) => e?.pois.find(p => p.id === id);
const tutPoiAt = (e, p) => { const [x, y] = enemyToWorld(e, ...p.c); return { x, y, r: 0.5 }; };
const tutSys = (name) => SYSTEMS.find(s => s.name === name);
const tutLeftCannon = () => SYSTEMS.find(s => s.ref === tutGun());
const tutMaint = () => { const e = mission.events.find(e => e.kind === 'maintenance'); return { target: e?.sys, decoy: e?.decoy }; };
const lc = (s) => s.name.charAt(0).toLowerCase() + s.name.slice(1);

MISSIONS.tutorial = {
  name: 'Tutorial', tutorial: true, rules: {}, objective: null,
  blurb: 'RAIDER basic training.',
  build: (target) => [{ t: 30, kind: 'maintenance', sys: target, radar: false }],
};

// ---------------------------------------------------------------------------
// Start, messages, pause
// ---------------------------------------------------------------------------
function startTutorial(controls = 'mouse') {
  tut.controls = controls === 'keyboard' ? 'keyboard' : 'mouse';
  try { localStorage.setItem(TUT_KEY, tut.controls); } catch (e) { /* no storage */ }
  startMission('tutorial', { ship: {} });                    // a stock ship: the numbers in the texts hold
  combat.banner = null;
  const target = tutSys('Left shield button'), decoy = tutSys('Right capacitor');
  // the two "irregular readings" at the helm, from the start (warnFrom); the target breaks in the repair step
  mission.events = [{ id: 0, kind: 'maintenance', t: 1e9, t1: 1e9, sys: target, decoy, serviced: false, warnFrom: 0, radar: false, done: false }];
  mission.jumpAt = Infinity;
  power.reactor.fuel = 0; power.reactor.t = 0; power.reserve = Math.max(1, power.reserve);   // the cell is empty (the reactor section)
  power.lever.pos = 1; power.lever.jammed = true;              // wedged on MID: nothing reaches the left capacitor
  CAPACITORS.forEach(c => { c.charge = 1; });                  // the left one: exactly one reload
  tutGun().shots = 1;
  Object.assign(me, { x: 22.2, y: 4.5, mode: 'inside', gun: null, health: 'ok', cover: 0 });
  me.inv.weapon = null; me.inv.item = null;
  Object.assign(tut, { on: true, killed: false, reactorDone: false, fuelLoaded: false, misses: 0, blockFails: 0, enemyFire: 'off', done: false, msg: null });
  tutGo('welcome');
}
function tutGo(id) {
  tut.step = id; tut.t = 0; tut.d = {};
  TUT_STEPS[id].enter?.();
}
// pages: strings or { text, mark: point | [points] | () => ..., view: 'ship' }. opts.waitFor: closes when it
// returns true (instead of Next); opts.pass: key codes that still reach the game while it's open; opts.button.
function tutSay(pages, then, opts = {}) {
  tut.msg = { pages: pages.map(p => (typeof p === 'string' ? { text: p } : p)), i: 0, then, ...opts };
  tutDom.render();
}
function tutorialNext() {
  const m = tut.msg;
  if (!m || m.waitFor) return;
  if (++m.i < m.pages.length) { tutDom.render(); return; }
  tutClose();
}
function tutClose(keepInput = false) {
  const m = tut.msg;
  tut.msg = null; tutDom.render();
  if (!keepInput) {                                   // the click / key that closed it does nothing in the game
    const mo = localInput.mouse; mo.click = false; mo.down = false; mo.suppress = true; mo.rightClick = false;
  }
  localInput.pressed.clear();
  m?.then?.();
}
function tutorialPaused() { return tut.on && !!tut.msg; }
const tutorialOverview = () => tut.on && tut.msg?.pages[tut.msg.i]?.view === 'ship';
// A paused frame (instead of tick): only the camera moves; input that isn't for the message is dropped.
function tutorialClient(dt) {
  const m = tut.msg;
  if (m?.waitFor && m.waitFor()) { tutClose(true); return; }
  if (localInput.pressed.has('KeyM')) sfx.toggleMute();     // (M mutes during a message too)
  localInput.pressed.clear(); localInput.mouse.click = false; localInput.mouse.rightClick = false;
  updateCamera(dt);
  updateSidebar(HUD_H, dt);                          // (the plates still slide in: a message can point at a new one)
}
const coverHeld = () => localInput.keys.has('ShiftLeft') || localInput.keys.has('ShiftRight') || localInput.mouse.right;

// ---------------------------------------------------------------------------
// Gates (asked by game.js) and hits (asked by combat.js)
// ---------------------------------------------------------------------------
function tutorialAllows(what, arg) {
  if (!tut.on) return true;
  if (tut.msg) return false;
  const S = TUT_STEPS[tut.step];
  return !!S?.allow?.(what, arg);
}
// Enemy hits are for show: true = don't do the damage. In the block lesson a hit is noted (it got through).
function tutorialHit(kind) {
  if (!tut.on) return false;
  if (tut.step === 'block') tut.d.hit = kind;
  return true;
}
// what the targets are (interaction targets / prompts: { text, run, repair, x, y })
const tt = {
  text: (t, re) => !!t && re.test(t.text || ''),
  lever: (t) => !!t && t.x === LEVER.x && t.y === LEVER.y,
  climbLeft: (t) => tt.text(t, /climb into the left cannon/),
};
const allowGun = (...list) => (what, arg) => list.includes(what);

// ---------------------------------------------------------------------------
// Upkeep, every simulation tick
// ---------------------------------------------------------------------------
function updateTutorial(dt) {
  if (!tut.on || tut.msg) return;
  tut.t += dt;
  for (const e of combat.enemies) if (tut.enemyFire === 'off') { e.fireT = Math.max(e.fireT, 3); e.target = null; }
  if (tut.fuelLoaded) power.reactor.fuel = Math.max(power.reactor.fuel, 2);   // the training cell never runs dry
  const ev = mission.events.find(e => e.kind === 'interceptor' && !e.done);
  if (ev) ev.t = mission.t + 30;                                            // the radar contact stays "on its way" until you're in the cannon
  TUT_STEPS[tut.step]?.tick?.(dt);
}
// Where to walk: the target, or first the nearest deck airlock when it's on the other deck.
function tutRoute(x, y) {
  const deck = (yy) => (yy < SPINE_Y0 ? 'top' : yy > SPINE_Y1 ? 'bottom' : 'lock');
  const md = deck(me.y), td = deck(y);
  if (me.mode !== 'inside' || md === td || md === 'lock') return { x, y };
  const mid = (Lk) => Lk.x + Lk.w / 2;
  const Lk = [...DECK_LOCKS].sort((a, b) => (Math.abs(mid(a) - me.x) + Math.abs(mid(a) - x)) - (Math.abs(mid(b) - me.x) + Math.abs(mid(b) - x)))[0];
  return { x: mid(Lk), y: (SPINE_Y0 + SPINE_Y1) / 2, via: true, down: md === 'top' };
}
const viaText = (p) => (p.via ? ` — first ${p.down ? 'down' : 'up'} through a deck airlock (walk in, it cycles)` : '');
function tutBoom() {                                  // a late hit on the left hull (for show)
  combat.bigFlashes.port = 1; combat.shake = 0.7; sfx.explosion();
  combatFlip('fx/explosion_l', -0.4, 9.4, 0.8);
  combat.decals.push({ x: 0.3, y: 9.6, r: 0.5, seed: Math.random() * 1000, hot: time, side: 'port' });
}
const tutReactorFast = (k, dt) => { if (power.reactor.fuel > 0 && !broken(REACTOR)) power.reactor.t += dt * k; };

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------
const MIDDLE = [(SPINE_Y0 + SPINE_Y1) / 2];   // (the deck airlocks' middle)
const roomMark = (id) => { const [x, y] = roomCenter(ROOMS.find(r => r.id === id)); return { x, y }; };
const TUT_STEPS = {
  welcome: {
    enter() {
      tutSay([
        'Welcome to the *Rapid Assistance & Interplanetary Defense Enterprise Resources* corporation — *RAIDER* for short. We are professionals who help people in need!',
        { text: 'This is the ship you\'ll be working on. Wondering why we don\'t give a newbie an old, rusty ship? Well, our ships usually don\'t last long enough to become old and rusty.', view: 'ship' },
        'But don\'t worry: if you follow this tutorial, you will be fine. Probably. And if not, we just use your salary to make another clone of you.',
        { text: 'This is you (marked). Company-issue suit, company-issue legs. Walk with *W A S D*.', mark: () => me },
        { text: 'A quick tour. The ship has two decks. Up top: the *left cannon room*, the *bridge* in the middle and the *right cannon room*.', view: 'ship', mark: () => ['portGun', 'bridge', 'starGun'].map(roomMark) },
        { text: 'Below: the *left airlock room*, the *reactor room* and the *right airlock room*. The *deck airlocks* are the only way up and down: walk in and they cycle.', view: 'ship',
          mark: () => [...['portLock', 'reactor', 'starLock'].map(roomMark), ...DECK_LOCKS.map(Lk => ({ x: Lk.x + Lk.w / 2, y: MIDDLE[0] }))] },
        { text: 'On the job you only see the room you\'re in. The *label above your head* always says what you can do right here.', view: 'ship' },
        `First stop: the *helm*, at the front of the bridge. Walk up to it and ${tutC('click it', 'press *E*')}.`,
      ], () => tutGo('helm'));
    },
  },
  helm: {
    objective: () => `Walk to the helm (front of the bridge) and ${tutC('click it', 'press E')}`,
    marker: () => ({ x: HELM.x, y: HELM.y + 0.5 }),
    allow: (w, t) => w === 'target' && t?.run === openDiagnosis,
    tick() {
      if (me.ui.panel !== 'diagnosis') return;
      const m = tutMaint();
      tutSay([
        'This is the *systems diagnosis*: every part of the ship and how it\'s doing. Green means fine.',
        `Two lines are *yellow*: "irregular readings" on the *${lc(m.target)}* and the *${lc(m.decoy)}*. RAIDER engineering calls that "character".`,
        'One of them *will fail* later. Before it does, its line turns *orange* and counts down: service it with the *repair kit* then and it won\'t break. The other one is just being dramatic.',
        'Remember those two. We\'ll come back to them. Close the panel with *E* or *Esc*.',
      ], () => tutGo('helmClose'));
    },
  },
  helmClose: {
    objective: () => 'Close the diagnosis: E or Esc',
    allow: (w) => w === 'closePanel',
    tick() {
      if (me.ui.panel) return;
      tutSay([`Next: the *radar*. It's the map table in the middle of the bridge. ${tutC('Click it', 'Walk up to it and press *E*')} to scan.`], () => tutGo('radar'));
    },
  },
  radar: {
    objective: () => `Scan with the radar: the map table in the middle of the bridge (${tutC('click it', 'E')})`,
    marker: () => ({ x: 22.2, y: 6.4 }),
    allow: (w, t) => w === 'target' && t?.run === radarScan,
    tick() {
      if (mission.lastScan === null) return;
      tutSay([
        `The radar shows everything that comes at us in the next ${RADAR_RANGE} seconds. And: nothing. Good! You are in a *safe part of space*. We picked it specially for training.`,
        'Scan again, just to be sure. (Always scan twice. Company policy.)',
      ], () => {
        mission.events.push({ id: 1, kind: 'interceptor', side: 'port', t: mission.t + 30, t1: mission.t + 30, radar: true, done: false });
        tutGo('radar2');
      });
    },
  },
  radar2: {
    objective: () => `Scan again (${tutC('click', 'E')} the radar table)`,
    marker: () => ({ x: 22.2, y: 6.4 }),
    allow: (w, t) => w === 'target' && t?.run === radarScan,
    enter() { tut.d.scan = mission.lastScan; },
    tick() {
      if (mission.lastScan === tut.d.scan) return;
      tutSay([
        { text: 'Ah. A *pirate interceptor*, coming in on the *left*. Contacts the radar found show up in the list on the left of the screen, with the time until they arrive.', mark: () => ({ x: -12, y: 8 }) },
        'So, not that safe after all. Statistically, it never is. Pirates don\'t negotiate, so let\'s get you to a gun.',
        `Go to the *left cannon room* and climb into the cannon at its ladder (${tutC('click the ladder', 'press *E* at the ladder')}).`,
      ], () => tutGo('toCannon'));
    },
  },
  toCannon: {
    objective: () => `Climb into the left cannon: its ladder in the left cannon room (${tutC('click it', 'E')})`,
    marker: () => ({ x: tutGun().hatch[0], y: tutGun().hatch[1] }),
    allow: (w, t) => w === 'target' && tt.climbLeft(t),
    tick() {
      if (me.mode !== 'gun' || me.gun !== tutGun()) return;
      const ev = mission.events.find(e => e.kind === 'interceptor'); if (ev) ev.done = true;
      tutGun().shots = 1;
      combatSpawn('interceptor', 'port', true);
      const e = tutFoe(); e.ampMul = e.ampGoal = 0.7;            // (a bit calmer than usual: it's training)
      tutSay([
        `You're in the left cannon. Welcome to the pointy end. Aim by ${tutC('moving the mouse', 'holding *A* / *D* (or the arrow keys)')}. Bottom right: your *shots*, and the energy in the capacitor that feeds this cannon.`,
        { text: 'And there\'s our interceptor. See the *glowing blue bits*? Those are its *weak spots*. Hitting the hull mostly scratches the paint; hitting a weak spot breaks something that matters.', mark: () => tutFoe() || [] },
        { text: `Shoot its *windshield*: the blue crack at the front of the cockpit (marked). Fire with ${tutC('a *left click*', '*Space*')}. You have exactly *one shot*, so take your time. It isn't shooting back. Yet.`,
          mark: () => { const e = tutFoe(); return e ? tutPoiAt(e, tutPoi(e, 'crack')) : []; } },
      ], () => tutGo('shoot1'));
    },
  },
  shoot1: {
    objective: () => `Shoot the windshield crack (${tutC('left click', 'Space')}) · aim: ${tutC('mouse', 'A / D or arrows')}`,
    marker: () => { const e = tutFoe(); return e && tutPoiAt(e, tutPoi(e, 'crack')); },
    allow: allowGun('fire'),
    tick() {
      const e = tutFoe(), g = tutGun();
      if (!e) return;
      for (const p of e.pois) if (p.id !== 'crack' && p.hit) { p.hit = false; p.smoke = 0; tut.d.other = p.name; }   // only the windshield counts here: the rest is fixed at once
      e.hullHits = 0; e.ampGoal = 0.7; e.omegaGoal = 1; e.shotCount = 0;
      if (tutPoi(e, 'crack').hit) { tut.d.hitT ??= tut.t; if (tut.t - tut.d.hitT > 0.9) tutGo('advantage'); return; }
      if (g.shots > 0 || combat.shells.length) return;
      const other = tut.d.other; tut.d.other = null;
      const lines = [
        'Missed! Don\'t worry, it happens to everyone. Mostly to clones. Here\'s your shot back: this one\'s on RAIDER.',
        'Close! Have another one, on the house. Tip: it sways around. Wait until it slows down at the end of a swing, then fire.',
        'Accounting is starting to ask questions. Here\'s another shot anyway. Aim for the blue crack in the windshield.',
      ];
      tutSay([lines[Math.min(tut.misses++, lines.length - 1)] + (other ? ` (You did hit its ${other.toLowerCase()}. Nice, but we said windshield, and training pirates fix things very fast.)` : '')],
             () => { g.shots = 1; });
    },
  },
  advantage: {
    enter() {
      const e = tutFoe(), effects = e.D.pois.map(p => `*${p.name}*: ${p.effect.charAt(0).toLowerCase() + p.effect.slice(1)}`).join(' · ');
      tutSay([
        'Bullseye! The pirates are now *duct-taping their windshield*. While they do, they can\'t see, so they can\'t shoot.',
        `That's the deal with weak spots: *every hit on one gives you an advantage*. On an interceptor: ${effects}. Hit them all and it's done for.`,
        { text: 'Bigger ships have more of them. The list at the top right shows every enemy\'s weak spots and which ones you\'ve hit.', mark: () => ({ x: -12, y: 8 }) },
        'And plain hull hits aren\'t wasted: every few of them shake a weak spot loose anyway.',
        `Cannon empty: *reload*. Press *R*${tutC(' (or click *RELOAD*)', '')}. One reload costs *one energy* from the left capacitor and gives *${SHOTS_PER_ENERGY} shots*. That's the left capacitor's *last* energy: make them count.`,
      ], () => tutGo('reload'));
    },
  },
  reload: {
    objective: () => `Reload: R${tutC(' or the RELOAD button', '')}`,
    allow: allowGun('reload'),
    tick() {
      const e = tutFoe(), g = tutGun();
      if (e) e.blind = Math.max(e.blind, 3);                   // (still taping)
      if (g.shots >= SHOTS_PER_ENERGY && !g.reload) tutGo('block');
    },
  },
  // The interceptor fires one shot at the gunner; mid-air the game pauses for the cover lesson.
  // A shot that gets through does nothing (tutorialHit) and the lesson repeats.
  block: {
    objective: () => (tut.d.phase === 'flying' ? `Keep the cover up: ${tutC('hold the right mouse button', 'hold Shift')}` : 'Incoming…'),
    marker: () => tut.d.shot && combat.shots.includes(tut.d.shot) ? { x: tut.d.shot.x, y: tut.d.shot.y, r: 0.6 } : null,
    allow: allowGun('cover'),
    enter() { tut.d.phase = 'wait'; },
    tick() {
      const e = tutFoe(), g = tutGun(), d = tut.d;
      if (!e) return;
      if (d.phase === 'wait' && tut.t > (tut.blockFails ? 0.8 : 1.2)) {
        e.blind = 0; e.target = { atCrew: true, crewId: me.id, tx: me.x, ty: me.y }; e.fireT = 0.7;
        tut.enemyFire = 'one'; d.phase = 'aim';
      } else if (d.phase === 'aim') {
        const s = combat.shots.find(s => s.atCrew && s.crewId === me.id);
        if (s) { d.shot = s; d.phase = 'flying'; tut.enemyFire = 'off'; }
      } else if (d.phase === 'flying') {
        const s = d.shot;
        if (!combat.shots.includes(s)) {                        // it's over: blocked, or it got through
          d.phase = 'done'; d.endT = tut.t;
        } else if (!d.paused && (Math.hypot(s.x - g.x, s.y - g.y) - 1.6) / Math.hypot(s.vx, s.vy) < 0.45) {
          d.paused = true;
          tutSay([{ text: tut.blockFails ? `Again: ${tutC('hold the *right mouse button*', 'hold *Shift*')} and *keep holding* until the shot hits the plate.`
            : `Incoming! They finished taping and shot back. Time is paused: that red blob is about to hit you. Raise the *cover plate*: ${tutC('hold the *right mouse button*', 'hold *Shift*')}, and *keep holding* until the shot hits it.`,
            mark: () => (combat.shots.includes(s) ? { x: s.x, y: s.y, r: 0.6 } : []) }],
            null, { waitFor: coverHeld, pass: ['ShiftLeft', 'ShiftRight'], hint: tutC('Hold the right mouse button…', 'Hold Shift…') });
        }
      } else if (d.phase === 'done' && tut.t - d.endT > 0.7) {
        me.health = 'ok'; me.hurtT = 0;                          // (nothing happened anyway: see tutorialHit)
        if (!d.hit) {
          tutSay([
            '*CLANG.* Blocked! That\'s what the plate is for.',
            'While the cover is up you can\'t fire, so don\'t hide behind it all day: raise it when a shot comes, then get back to shooting.',
            `Now finish the job: hit its *other blue spots*, the *weapon cable* and the *engine cooling*. You have ${SHOTS_PER_ENERGY} shots.`,
          ], () => tutGo('kill'));
        } else {
          const first = !tut.blockFails++;
          tutSay(first ? [
            'Ouch. That one got through: you let go too early. Luckily this was a training round, so nothing happened. Here\'s what would have:',
            '*You*: that hit would have left you *hurt*. More on injuries at the end of training.',
            '*The ship*: a small hit on the hull sometimes starts a *fire* or *breaks a part*. Big hits (heavy shots) always break a part and start a fire, and later in your career they tear *holes* in the hull.',
            'The plate goes up in front of the cannon, so keep it pointed at the interceptor. Let\'s try that again.',
          ] : ['Through again. Hold the cover until the shot hits it, and keep the cannon pointed at the interceptor. Again.'], () => tutGo('block'));
        }
      }
    },
  },
  kill: {
    objective: () => `Hit the other blue spots: weapon cable, engine cooling (${tutC('left click', 'Space')})`,
    marker: () => { const e = tutFoe(); const p = e?.pois.find(p => !p.hit); return p && tutPoiAt(e, p); },
    allow: allowGun('fire', 'cover', 'reload'),
    enter() { tut.enemyFire = 'on'; },
    tick() {
      const e = tutFoe(), g = tutGun();
      if (!e) {
        if (tut.t - (tut.d.deadT ??= tut.t) < 1.5) return;
        tut.killed = true;
        tutSay([
          'Interceptor *destroyed*! Not bad for a clone on their first day.',
          'But look at your energy: the left capacitor is *empty*. It should be getting new energy from the reactor, and it isn\'t. Something\'s off down there.',
          `Climb down (${tutC('click *CLIMB DOWN* or press *E*', 'press *E*')}) and go to the *reactor room* (lower deck, middle) to have a look.`,
        ], () => tutGo('toReactor'));
        return;
      }
      if (g.shots > 0 || g.reload > 0 || combat.shells.length) { tut.d.emptyT = null; return; }
      if (tut.t - (tut.d.emptyT ??= tut.t) < 1.2) return;
      tutSay([
        '*Click.* Out of shots, and the left capacitor is *empty*: no energy, no reload.',
        'Normally the reactor keeps the capacitors topped up. Something is wrong down at the *reactor*. Climb down and go have a look.',
        'The interceptor? Ignore it for now: we\'ve told it this is a training exercise. It will keep shooting, but its shots won\'t hurt anything.',
      ], () => tutGo('toReactor'));
    },
  },
  exitCannon: {                     // the interceptor died in the second fight (the reactor is done): climb out, the fire starts right then
    objective: () => `Climb down: ${tutC('click CLIMB DOWN or press E', 'press E')}`,
    allow: (w) => w === 'climbDown',
    tick() { if (me.mode === 'inside') tutGo('fire'); },
  },
  toReactor: {
    objective: () => {
      if (me.mode === 'gun') return `Climb down: ${tutC('click CLIMB DOWN or press E', 'press E')}`;
      return 'Go to the reactor room (lower deck, middle)' + viaText(tutRoute(REACTOR.x, REACTOR.y));
    },
    marker: () => (me.mode === 'gun' ? null : tutRoute(REACTOR.x, REACTOR.y - 2)),
    allow: (w) => w === 'climbDown',
    tick() {
      if (roomAt(me.x, me.y)?.id !== 'reactor') return;
      tutSay([
        { text: 'The *reactor room*. That big pizza oven is the *reactor*: it burns fuel cells and turns them into energy.', mark: () => ({ x: REACTOR.x, y: REACTOR.y }) },
        'And look at that: its fuel cell is *empty*. Whoever had this shift before you forgot to refuel. (They have been recycled.)',
        { text: `Spare cells are in the *fuel crate* (marked). Take one and load it into the reactor (${tutC('click the crate, then the reactor', '*E* at the crate, then *E* at the reactor')}).`, mark: () => FUEL_CRATE },
      ], () => tutGo('fuel'));
    },
  },
  fuel: {
    objective: () => (me.inv.item === 'fuel' ? `Load the fuel cell into the reactor (${tutC('click it', 'E')})` : `Take a fuel cell from the crate (${tutC('click it', 'E')})`),
    marker: () => (me.inv.item === 'fuel' ? { x: REACTOR.x, y: REACTOR.y } : FUEL_CRATE),
    allow: (w, t) => w === 'target' && (tt.text(t, /take a fuel cell/) || tt.text(t, /load the fuel cell/)),
    enter() { power.reserve = Math.max(1, power.reserve); },
    tick() {
      if (!(power.reactor.fuel > 0)) return;
      tut.fuelLoaded = true;
      const caps = () => CAPACITORS.map(c => ({ x: c.x, y: c.y }));
      tutSay([
        'Fuel\'s in. Every 20 seconds the reactor makes *one energy* (a cell is good for 5).',
        { text: 'Each energy flies as a glowing *bolt* along the power lines, through the *power lever* (marked), to one of three *capacitors*: LEFT, MID or RIGHT.', mark: () => LEVER },
        { text: `A capacitor stores up to ${CAP_MAX} energy. The *left* one feeds the left cannon and the left shield, the *right* one the right side, the *middle* one the front cannon, the front shield and the *jump drive*. One energy is *one reload* or *one shield*.`, view: 'ship', mark: caps },
        { text: 'Normally the lever steps on after every energy: MID, RIGHT, LEFT, MID… so every capacitor gets its share.', mark: () => LEVER },
        { text: 'See the *wrench* stuck in it? It locks the lever. Someone wedged it on *MID*, so all the energy went to the middle and none to your cannon.', mark: () => LEVER },
        `Pull the wrench out: ${tutC('click the *hub* in the middle of the lever', 'stand at the lever and *hold E* for half a second')}.`,
      ], () => tutGo('wrench'));
    },
  },
  wrench: {
    objective: () => `Pull the wrench out of the lever (${tutC('click the hub', 'hold E at the lever')})`,
    marker: () => LEVER,
    allow: (w, t) => w === 'target' && tt.lever(t) && power.lever.jammed,
    tick() {
      if (power.lever.jammed) return;
      tutSay(['Wrench out. Now watch the lever: we\'ll run the reactor fast for a moment so you can see it step after each energy.'], () => tutGo('cycle'));
    },
  },
  cycle: {                          // the lever demo: the reactor runs fast for 4 energies
    objective: () => `Watch the lever: now on ${LEVER_NAMES[power.lever.pos]}`,
    marker: () => LEVER,
    allow: () => false,
    enter() { tut.d.n = 0; tut.d.pos = power.lever.pos; },
    tick(dt) {
      const d = tut.d;
      if (power.lever.pos !== d.pos) { d.pos = power.lever.pos; d.n++; }
      if (d.n < 4) { tutReactorFast(ENERGY_TIME / 1.3, dt); return; }
      if (power.bolts.some(b => !b.done) || tut.t - (d.endT ??= tut.t) < 1.2) return;
      tut.reactorDone = true;
      if (tutFoe()) tutSay([
        'See? MID, RIGHT, LEFT, MID. Fair for everyone. But right now only the *left* side matters: that\'s where the interceptor is.',
        `So lock it on *LEFT*: turn the lever until it points at LEFT (${tutC('click its *handle*', '*tap E* at the lever')}), then wedge the wrench back in (${tutC('click the *hub*', '*hold E*')}).`,
      ], () => tutGo('lockLeft'));
      else tutSay([
        'See? MID, RIGHT, LEFT, MID. Fair for everyone.',
        'When one side needs everything (a big fight on the left, say), turn the lever there and wedge the wrench in. Just don\'t forget to pull it out again afterwards, or you end up like your predecessor.',
      ], () => tutGo('fire'));       // (the interceptor died in the first fight: the fire comes now, after the reactor)
    },
  },
  lockLeft: {
    objective: () => (power.lever.pos !== 0 ? (power.lever.jammed ? `Pull the wrench out first (${tutC('click the hub', 'hold E')})` : `Turn the lever to LEFT (${tutC('click its handle', 'tap E')}) · now ${LEVER_NAMES[power.lever.pos]}`)
      : `Wedge the wrench in (${tutC('click the hub', 'hold E')})`),
    marker: () => LEVER,
    allow: (w, t) => w === 'target' && tt.lever(t),
    tick() {
      if (power.lever.pos !== 0 || !power.lever.jammed) return;
      tutSay([
        'Locked on LEFT. Every energy now goes to the left capacitor, and from there into your cannon. (Training bonus: the reactor runs faster for you right now.)',
        'Back to the *left cannon*. Finish that interceptor. Its shots still won\'t hurt.',
      ], () => tutGo('toCannon2'));
    },
  },
  toCannon2: {
    objective: () => `Back into the left cannon (${tutC('click its ladder', 'E at its ladder')})` + viaText(tutRoute(...tutGun().hatch)),
    marker: () => tutRoute(...tutGun().hatch),
    allow: (w, t) => w === 'target' && tt.climbLeft(t),
    tick(dt) {
      tutReactorFast(3, dt);
      if (me.mode === 'gun' && me.gun === tutGun()) tutGo('kill2');
    },
  },
  kill2: {
    objective: () => `Destroy the interceptor: hit its blue spots · reload: R${tutC(' or RELOAD', '')}`,
    marker: () => { const e = tutFoe(); const p = e?.pois.find(p => !p.hit); return p && tutPoiAt(e, p); },
    allow: allowGun('fire', 'cover', 'reload'),
    tick(dt) {
      tutReactorFast(power.lever.pos === 0 ? 3 : 0, dt);
      if (tutFoe()) return;
      if (tut.t - (tut.d.deadT ??= tut.t) < 1.5) return;
      tut.killed = true;
      tutSay([`Interceptor *destroyed*! Climb down (${tutC('*CLIMB DOWN* or *E*', '*E*')}).`], () => tutGo('exitCannon'));
    },
  },
  fire: {
    enter() {
      tutBoom();
      const s = tutLeftCannon();
      igniteSystem(s);
      const f = fires.find(f => f.sys === s); if (f) f.tame = true;   // never spreads, burns out or goes out on its own (mission.js updateFires)
      tut.d.fire = f;
    },
    objective: () => '',
    tick() {
      if (tut.t < 0.9 || tut.d.said) return;
      tut.d.said = true;
      const f = tut.d.fire, ext = tutExtinguisher();
      tutSay([
        { text: '*BOOM.* That interceptor got a hit in on the left hull after all: the left cannon\'s mount is *on fire*. Hits do that.', mark: () => f },
        'Left alone, a fire *spreads* or *burns its part out*. The red ring under it shows when. Put it out first.',
        { text: `The nearest *fire extinguisher* is on the bridge (marked). Pick it up (${tutC('click it', '*E*')}), walk up to the fire and spray: ${tutC('*hold the right mouse button* towards the fire', 'face the fire with the *arrow keys* and *hold Space*')}.`, mark: () => ext },
      ], () => tutGo('extinguish'));
    },
  },
  extinguish: {
    objective: () => (me.inv.weapon === 'extinguisher' ? `Put out the fire: ${tutC('hold the right mouse button towards it', 'face it (arrows) and hold Space')}` : `Get the fire extinguisher (${tutC('click it', 'E')})`),
    marker: () => (me.inv.weapon === 'extinguisher' ? fires[0] : tutExtinguisher()),
    allow: (w, t) => w === 'weapon' || (w === 'target' && tt.text(t, /take the fire extinguisher/)),
    tick() {
      if (fires.length) return;
      if (tut.t - (tut.d.outT ??= tut.t) < 0.8) return;
      tutSay(['Fire\'s out. RAIDER fire safety thanks you, and so does the left cannon.'].concat(tut.reactorDone ? [] : [
        'Now, about that empty capacitor. Off to the *reactor room* (lower deck, middle) to see what\'s wrong.']), () => tutGo(tut.reactorDone ? 'repair' : 'toReactor'));
    },
  },
  repair: {
    enter() {
      const s = tutMaint().target;
      breakSystem(s); mission.events.forEach(e => { if (e.kind === 'maintenance') e.done = true; });
      tutSay([
        { text: `Hear that? The *${lc(s)}* just broke. Remember the helm? It was one of the two with "irregular readings". Told you one would fail.`, mark: () => s },
        `A broken part *does nothing* until it's repaired. See for yourself: walk up to the ${lc(s)} (marked).`,
      ], () => tutGo('tryIt'));
    },
  },
  tryIt: {
    objective: () => `Walk up to the ${lc(tutMaint().target)}` + viaText(tutRoute(tutMaint().target.x, tutMaint().target.y + 1)),
    marker: () => tutRoute(tutMaint().target.x, tutMaint().target.y + 0.4),
    allow: () => false,
    tick() {
      if (!/broken/.test(me.prompt?.text || '')) { tut.d.seenT = null; return; }
      if (tut.t - (tut.d.seenT ??= tut.t) < 1.2) return;
      const s = tutMaint().target;
      tutSay([
        `See? Broken: no left shield until it's fixed. Same everywhere: broken cannons only spark, broken capacitors hold nothing.`,
        'Had you serviced it with the repair kit while its line at the helm was orange, it would never have broken. Next time.',
        { text: `The ship's one *repair kit* is right here in the left airlock room (marked). Take it, then ${tutC('*hold click* on the broken button', 'stand next to the broken button and *hold E*')} for 5 seconds.`, mark: () => tutItem('repair') },
      ], () => tutGo('fix'));
    },
  },
  fix: {
    objective: () => (me.inv.weapon === 'repair' ? `Repair the ${lc(tutMaint().target)}: ${tutC('hold click on it', 'hold E next to it')} (5 s)` : `Take the repair kit (${tutC('click it', 'E')})`),
    marker: () => (me.inv.weapon === 'repair' ? tutMaint().target : tutItem('repair')),
    allow: (w, t) => w === 'closePanel' || (w === 'target' && (tt.text(t, /take the repair kit/) || t?.repair === tutMaint().target)),
    tick() {
      if (tutMaint().target.broken) return;
      tutSay(['Repaired. Honestly, that\'s most of the job: things break, you fix them. Repeat until the jump.',
              `Last part: a quick tour of everything else on board. ${tutC('Click', 'Enter')} to go on.`], () => tutGo('overview'));
    },
  },
  overview: {
    enter() {
      const pt = (x, y) => ({ x, y });
      tutSay([
        { text: 'The *laser gun* (right airlock room). Just in case an intruder walks onto the ship. Unheard of, of course. Pick it up and shoot with ' + tutC('the *right mouse button*', '*Space*') + '.', view: 'ship', mark: () => tutItem('laser') || pt(42.4, 22.4) },
        { text: 'The *outer airlocks* (left and right airlock rooms) take you out on a *spacewalk*. The *shield emitters* sit out there, and so do jobs like mines, jammed cannon tracks and a crooked radar antenna.', view: 'ship', mark: () => HATCHES.map(h => pt(h.x, h.y)) },
        { text: 'Doors and airlocks that are *locked* or *broken* can be forced with a *manual override*: three good whacks on the handle. Forcing an *outer airlock* opens both its doors at once: the airlock room *vents to space* and the blast doors seal it off for a while.', view: 'ship', mark: () => [...DECK_LOCKS.map(Lk => pt(Lk.x + Lk.w / 2, MIDDLE[0])), ...DOORWAYS.map(d => pt(d.x + d.w / 2, d.y + d.h / 2))] },
        { text: 'Next to each outer airlock: a *vent panel*. It blows the room\'s air into space, fires and all. You\'re fine (visor), but anyone else in there gets hurt.', view: 'ship', mark: () => Object.values(VENT_PANELS).map(([x, y]) => pt(x, y)) },
        { text: 'The *security console* (left cannon room): lock and unlock doors and airlocks (handy to shut an intruder in), and see where everyone is.', view: 'ship', mark: () => pt(SECURITY.x, SECURITY.y + 0.5) },
        { text: `The *shield buttons* (left, front, right; lower deck): one energy = that side's shield for ${SHIELD_UP_TIME} s, then ${SHIELD_COOLDOWN} s to recharge. Heavy shot charging? That's what they're for.`, view: 'ship', mark: () => SHIELD_BUTTONS.map(b => pt(b.x, b.y)) },
        { text: `*Injuries*: the first hit leaves you *hurt* for 30 s (slower, tunnel vision). A second one puts you *down*: ${tutC('hold click on yourself', 'hold *E*')} to get back up, or a crewmate treats you. A third, and you're *out cold*.`, view: 'ship' },
        { text: `Hurt or down crewmates: ${tutC('*hold click* on them', 'stand next to them and *hold E*')} for 2 s. ${tutC('Click', 'Tap E')} in time with the heartbeat to go faster.`, view: 'ship' },
        { text: `Top left: *DAMAGE*. Every broken part counts. At ${MAX_DAMAGE + 1} broken parts at once the ship falls apart, so fix things.`, view: 'ship' },
        { text: '*Hull plates* (crates in the airlock rooms) seal holes in the hull. The *patch board* by the power lever reroutes power when a line breaks. The *snack machine* (left cannon room) helps when you\'re hurt.', view: 'ship', mark: () => [...PLATE_CRATES.map(c => pt(c.x, c.y)), pt(SNACK.x, SNACK.y)] },
        { text: 'The *coffee* on the *kitchen counter* (left cannon room): drink it and you walk faster for 15 s. When it\'s empty, someone makes more.', view: 'ship', mark: () => pt(COFFEE_MUG.x, COFFEE_MUG.y) },
        { text: 'And the *jump*: at the end of every mission the jump drive spools up and needs *one energy in the middle capacitor*. Keep some there. No energy, no jump: the drive stalls, and the trouble keeps coming faster until you jump.', view: 'ship', mark: () => pt(CAPACITORS[1].x, CAPACITORS[1].y) },
      ], () => tutGo('end'));
    },
  },
  end: {
    enter() {
      tut.done = true;
      try { localStorage.setItem(TUT_DONE_KEY, '1'); } catch (e) { /* no storage */ }
      tutSay([
        'That\'s it for basic training. *More training modules are coming soon*, pending budget approval.',
        'Remember: jump in, solve the problem, jump out. RAIDER thanks you for your service. Your next clone is on standby, just in case.',
        'Your training is saved. The ship is all yours now: walk around and *try everything*, no rush, nothing attacks. When you\'re done: *BACK TO MENU* (top right) or *Esc*.',
      ], () => tutGo('roam'), { button: 'EXPLORE THE SHIP ▸' });
    },
  },
  // Free roam after the training: every gate open (but the debug menu), no threats, no jump, no timer. Only the
  // player leaves (tutLeave: the BACK TO MENU button, or Esc → a small confirm).
  roam: {
    objective: () => 'Training complete — explore the ship freely',
    allow: (what) => what !== 'debug',
    enter() { tut.done = true; tutDom.render(); },
    tick() {
      mission.jumpAt = Infinity; mission.jump = null; mission.press = null;   // a calm sandbox: no jump, no hot zone
      const broken = SYSTEMS.filter(s => s.broken);                          // (and the ship never falls apart)
      if (broken.length >= MAX_DAMAGE) broken[0].broken = false;
    },
  },
};
// Back to the menu (the training is already saved: TUT_DONE_KEY is written when the end step starts).
function tutLeave() { tut.ask = false; if (typeof backToLobby === 'function') backToLobby(); }
// Esc in free roam asks first, unless it has something else to close (a panel, an override, the debug menu).
const tutEscapeAsks = () => tut.on && tut.step === 'roam' && !tut.msg && !me.ui.panel && !me.ui.override && !debugOpen;
const tutItem = (kind) => ITEMS.find(i => i.kind === kind) || null;
function tutExtinguisher() {                          // the one nearest to the fire (the bridge's)
  const f = fires[0] || tutLeftCannon();
  return ITEMS.filter(i => i.kind === 'extinguisher').sort((a, b) => Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0] || null;
}

// ---------------------------------------------------------------------------
// Drawing: markers in the world, the objective line
// ---------------------------------------------------------------------------
function tutMarks() {
  if (!tut.on) return [];
  let m;
  if (tut.msg) { m = tut.msg.pages[tut.msg.i]?.mark; m = typeof m === 'function' ? m() : m; }
  else m = TUT_STEPS[tut.step]?.marker?.();
  return (Array.isArray(m) ? m : m ? [m] : []).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
}
function drawTutorialWorld(view, t) {
  for (const p of tutMarks()) {
    const k = 0.5 + 0.5 * Math.sin(t * 5), r = (p.r || 0.7) + 0.15 * k;
    ctx.beginPath(); ctx.arc(p.x * T, p.y * T, r * T, 0, TAU);
    ctx.strokeStyle = `rgba(255,224,110,${0.55 + 0.4 * k})`; ctx.lineWidth = 4; ctx.stroke();
    upright(view, p.x, p.y, 1.1 + 0.25 * k, () => {          // a bouncing arrow above it
      const s = T * 0.32;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s * 0.7, -s); ctx.lineTo(-s * 0.25, -s); ctx.lineTo(-s * 0.25, -s * 1.9);
      ctx.lineTo(s * 0.25, -s * 1.9); ctx.lineTo(s * 0.25, -s); ctx.lineTo(s * 0.7, -s); ctx.closePath();
      ctx.fillStyle = '#ffe06e'; ctx.fill(); ctx.strokeStyle = 'rgba(20,22,27,0.9)'; ctx.lineWidth = 2; ctx.stroke();
    });
  }
}
function drawTutorialHUD() {
  if (!tut.on || tut.msg) return;
  const text = TUT_STEPS[tut.step]?.objective?.() || '';
  if (!text) return;
  ctx.font = '22px "Patrick Hand", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 64, y = HUD_H + 58;
  rr(VW / 2 - w / 2, y, w, 38, 8); ctx.fillStyle = 'rgba(30,26,10,0.88)'; ctx.fill(); stroke(2, '#ffe06e');
  ctx.fillStyle = '#ffe9a0'; ctx.fillText('▶ ' + text, VW / 2, y + 20); ctx.textAlign = 'left';
}

// ---------------------------------------------------------------------------
// Browser: the message box, the controls question, the menu button (DOM)
// ---------------------------------------------------------------------------
const tutDom = {
  box: null,
  ready: () => typeof document !== 'undefined' && typeof document.createElement === 'function' && !!document.body,
  build() {
    const veil = document.createElement('div'); veil.id = 'tut-veil'; veil.hidden = true;
    veil.innerHTML = '<div id="tut-box"><div class="tut-head"><span>RAIDER ONBOARDING</span><span id="tut-page"></span></div><div id="tut-text"></div>'
      + '<div class="tut-foot"><button id="tut-skip">leave training</button><span id="tut-hint"></span><button id="tut-next">NEXT ▸</button></div></div>';
    document.body.appendChild(veil);
    const box = veil.querySelector('#tut-box');
    box.addEventListener('click', e => { if (e.target.id === 'tut-skip') return; if (!tut.msg?.waitFor) tutorialNext(); });
    box.addEventListener('mousedown', e => { if (e.button === 2 && tut.msg?.waitFor) localInput.mouse.right = true; });   // right button on the box: the cover
    box.addEventListener('contextmenu', e => e.preventDefault());
    veil.querySelector('#tut-skip').onclick = () => { if (confirm('Leave the training? You can start it again from the menu.')) backToLobby(); };
    this.box = veil;
    // free roam: the BACK TO MENU button (top right) and the Esc confirm
    const menu = document.createElement('button'); menu.id = 'tut-menu'; menu.hidden = true; menu.textContent = '◂ BACK TO MENU';
    menu.title = 'Training complete: your progress is saved'; menu.onclick = tutLeave;
    const ask = document.createElement('div'); ask.id = 'tut-ask'; ask.hidden = true;
    ask.innerHTML = '<div class="tut-card"><div class="tut-head"><span>RAIDER ONBOARDING</span></div><p>Back to the main menu? Your training is saved.</p>'
      + '<div class="tut-ask-row"><button class="tut-stay">stay aboard (Esc)</button><button class="tut-go">BACK TO MENU (Enter)</button></div></div>';
    ask.querySelector('.tut-stay').onclick = () => { tut.ask = false; this.render(); };
    ask.querySelector('.tut-go').onclick = tutLeave;
    for (const el of [menu, ask]) el.addEventListener('mousedown', e => e.stopPropagation());
    document.body.append(menu, ask);
    this.menu = menu; this.ask = ask;
  },
  render() {
    if (!this.ready()) return;
    if (!this.box) this.build();
    this.menu.hidden = !(tut.on && tut.step === 'roam');
    this.ask.hidden = !(tut.on && tut.ask);
    const m = tut.msg, veil = this.box;
    veil.hidden = !m;
    if (!m) return;
    const p = m.pages[m.i];
    veil.classList.toggle('wait', !!m.waitFor);
    veil.querySelector('#tut-text').innerHTML = escapeHtml(p.text).replace(/\*(.+?)\*/g, '<b>$1</b>');
    veil.querySelector('#tut-page').textContent = m.pages.length > 1 ? `⏸ paused · ${m.i + 1} / ${m.pages.length}` : '⏸ paused';
    const next = veil.querySelector('#tut-next');
    next.hidden = !!m.waitFor;
    next.textContent = m.i === m.pages.length - 1 && m.button ? m.button : 'NEXT ▸';
    veil.querySelector('#tut-hint').textContent = m.waitFor ? m.hint || '' : tutC('click or Enter', 'Enter or Space');
  },
};
// Keys while a message is open: Enter / Space go to the box, everything else is held back from the game
// (except the keys a waiting message passes through, like Shift for the cover). A key that turned a page
// stays swallowed until it's let go (no stray cannon shot from a held Space).
function tutKeyDown(e) {
  if (!tut.on) return;
  if (tut.swallow.has(e.code)) { e.stopImmediatePropagation(); e.preventDefault(); return; }
  if (tut.ask) {                                      // free roam's "back to the menu?": Enter goes, Esc stays
    e.stopImmediatePropagation(); e.preventDefault();
    if (e.code === 'Enter' || e.code === 'NumpadEnter') tutLeave();
    else if (e.code === 'Escape') { tut.ask = false; tutDom.render(); }
    return;
  }
  if (e.code === 'Escape' && !e.repeat && tutEscapeAsks()) { e.stopImmediatePropagation(); e.preventDefault(); tut.ask = true; tutDom.render(); return; }
  const m = tut.msg;
  if (!m || e.target?.tagName === 'INPUT') return;
  if (m.pass?.includes(e.code) || e.code === 'KeyM') return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (!m.waitFor && !e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) { tut.swallow.add(e.code); tutorialNext(); }
}
// Before the tutorial: mouse or keyboard?
function tutAskControls() {
  let pref = 'mouse';
  try { pref = localStorage.getItem(TUT_KEY) || 'mouse'; } catch (e) { /* no storage */ }
  let d = document.getElementById('tut-choice');
  if (!d) {
    d = document.createElement('div'); d.id = 'tut-choice';
    d.innerHTML = `<div class="tut-card"><div class="tut-head"><span>RAIDER ONBOARDING</span></div>
      <p>Before we start: how do you like to play?</p>
      <div class="tut-pick"><button data-c="mouse"><b>MOUSE</b><small>aim with the mouse · click to fire · hold right-click for cover</small></button>
      <button data-c="keyboard"><b>KEYBOARD</b><small>aim with A / D or the arrows · Space to fire · hold Shift for cover</small></button></div>
      <p class="tut-small">Walking is W A S D and E uses things, either way. Both work all the time; this only picks what we tell you.</p>
      <button class="tut-cancel">‹ back</button></div>`;
    document.body.appendChild(d);
    d.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { d.hidden = true; tutLaunch(b.dataset.c); });
    d.querySelector('.tut-cancel').onclick = () => { d.hidden = true; };
  }
  d.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('chosen', b.dataset.c === pref));
  d.hidden = false;
}
function tutLaunch(controls) {
  const name = document.getElementById('lobby-name')?.value;
  try { if (name) localStorage.setItem('mn-name', name); } catch (e) { /* no storage */ }
  me.name = name || 'You';
  document.getElementById('lobby').hidden = true;
  applyKit(me, profileKit());
  startTutorial(controls);
}
if (tutDom.ready() && document.getElementById('lobby')) {
  window.addEventListener('keydown', tutKeyDown, true);              // (capture: before game.js's own key handler)
  window.addEventListener('keyup', e => tut.swallow.delete(e.code), true);
  const b = document.getElementById('menu-tutorial');
  if (b) {
    let done = false;
    try { done = localStorage.getItem(TUT_DONE_KEY) === '1'; } catch (e) { /* no storage */ }
    if (!done) b.classList.add('fresh');
    b.onclick = tutAskControls;
  }
}
