// Local players: split screen in the normal game (2026-11-01, the user). The host of a game (multiplayer, on
// `node server.js`) adds up to three more players at this screen in the lobby: each gets a name, a device (the keyboard
// and mouse, or a controller; any mix, never one device twice; the host picks theirs too), their own LOCKER, and a spot
// on the screen (the little map: drag the names around). Each extra player is a hidden copy of the game in an iframe
// (`index.html?split=2..4&name=…&input=kbm|padN`: js/progress.js SPLIT) that joins this game as its own player, with
// its own progress by name. When the mission starts the screen splits (2: halves, 3-4: quarters) and every view gets
// a coloured border with its player's name that fades out after a few seconds.
//   - this page is player 1 (slot 1); the extra ones are slots 2-4
//   - gamepads are read here (this page has the focus browsers want) and handed to the views (splitPads); keys typed
//     in a view that isn't the keyboard player's go to the keyboard player (js/split.js, and here)
//   - only this page plays sound (the views are silent; their mute is this page's: splitApi)
//   - the shared column (mission box, plates) and the banners: only in the top-left view (localSharedSlot)
//   - after a mission this page reloads back into the lobby (js/net.js mn-return) and brings its local players back
//     (sessionStorage 'mn-local-run'; each view rejoins its own seat: js/net.js mn-seat)
const localUI = (() => {
  if (typeof document === 'undefined' || typeof window === 'undefined' || !document.getElementById('local-box')) return null;
  if (window.parent !== window && /[?&]split=/.test(location.search || '')) return null;   // (a view itself)
  const $ = (id) => document.getElementById(id);
  const COLORS = ['#e8873a', '#4aa3ff', '#5fd06a', '#e05fb0'];
  const MAX = 4, FADE_AFTER = 4, FADE_TIME = 2;
  let players = [];                                  // the extra ones: { slot, name, input, frame, locker }
  let mine = 'kbm';                                  // this page's player's device
  let order = [1];                                   // slots by screen position (top left, top right, bottom left, bottom right)
  let game = null, host = false, inGame = false, rect = null;
  const pads = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])];
  const myName = () => ($('lobby-name')?.value || 'You').trim();
  const read = (st, k) => { try { return JSON.parse(st.getItem(k)); } catch (e) { return null; } };
  const mem = read(localStorage, 'mn-local') || {};  // (names and devices from last time: just the defaults)
  if (mem.mine) mine = mem.mine;
  let roster = read(localStorage, 'mn-local-roster') || (mem.players || []).map(({ name, input, paint }) => ({ name, input, paint }));
  if (!Array.isArray(roster)) roster = [];
  function save() {
    const list = players.map(p => ({ slot: p.slot, name: p.name, input: p.input, paint: p.paint || null }));
    try { localStorage.setItem('mn-local', JSON.stringify({ mine, players: list })); } catch (e) { /* no storage */ }
    // the roster: everyone who played here as a local player, most recent first (name, device, colour; their locker
    // and progress are in their own profile by name), so "+ LOCAL PLAYER" brings them back next time
    const known = new Set(list.map(q => q.name.toLowerCase()));
    roster = [...list.map(({ name, input, paint }) => ({ name, input, paint })), ...roster.filter(q => !known.has(q.name.toLowerCase()))].slice(0, 12);
    try { localStorage.setItem('mn-local-roster', JSON.stringify(roster)); } catch (e) { /* no storage */ }
    try { sessionStorage.setItem('mn-local-run', JSON.stringify({ game, mine, order, players: list })); } catch (e) { /* no storage */ }
  }
  const active = () => players.length > 0;
  const inputs = () => [mine, ...players.map(p => p.input)];

  // ----- the views
  function frameFor(p) {
    const f = document.createElement('iframe');
    f.className = 'local-view'; f.title = `${p.name}'s view`; f.allow = 'gamepad; autoplay';
    f.src = `index.html?split=${p.slot}&name=${encodeURIComponent(p.name)}&input=${p.input}`;
    f.hidden = true;
    f.addEventListener('load', () => setTimeout(() => paintSync(p), 600));   // (its colour: see paintSync)
    document.body.appendChild(f);
    return f;
  }
  function drop(p) {
    try { p.frame?.contentWindow?.splitLeave?.(); } catch (e) { /* gone */ }
    const f = p.frame; p.frame = null;
    try { sessionStorage.removeItem('mn-seat#' + p.slot); } catch (e) { /* no storage */ }
    if (f) setTimeout(() => f.remove(), 250);        // (a moment for the leave to go out)
  }
  function add() {
    if (players.length >= MAX - 1) return;
    const slot = [2, 3, 4].find(s => !players.some(p => p.slot === s));
    const used = inputs(), names = [myName(), ...players.map(p => p.name)].map(n => n.toLowerCase());
    const old = roster.find(q => q && q.name && !names.includes(q.name.toLowerCase()));   // (the most recent one not here yet)
    let name = old ? old.name : `Player ${slot}`;
    for (let k = slot; names.includes(name.toLowerCase()); k++) name = `Player ${k + 1}`;
    const input = old?.input && !used.includes(old.input) ? old.input : ['pad0', 'pad1', 'pad2', 'pad3', 'kbm'].find(i => !used.includes(i));
    const p = { slot, name, input, paint: old?.paint || null };
    p.frame = frameFor(p);
    players.push(p); order.push(slot);
    save(); render();
  }
  function remove(p) {
    drop(p);
    players = players.filter(q => q !== p); order = order.filter(s => s !== p.slot);
    save(); render(); place();
  }
  function change(p, what, v) {                      // a new name or device: the view comes back with it (a new seat)
    v = String(v).trim();
    if (what === 'name') {
      if (!v || [myName(), ...players.filter(q => q !== p).map(q => q.name)].some(n => n.toLowerCase() === v.toLowerCase())) return render(`Pick another name for ${p.name}: everyone needs their own (progress is kept by name).`);
      if (v === p.name) return;
      p.name = v.slice(0, 24);
    } else return setDevice(p, v);
    drop(p); p.frame = frameFor(p); p.locker = false;
    save(); render('');
  }
  // A device for `who` (this page's player: 'me', or a local player). Someone else has it: they get who's old one
  // (a swap; the user, 2026-11-01). A local player's view comes back with its new device (a new seat).
  function setDevice(who, v) {
    const old = who === 'me' ? mine : who.input;
    if (v === old) return;
    const other = mine === v && who !== 'me' ? 'me' : players.find(q => q !== who && q.input === v);
    const give = (w, d) => { if (w === 'me') mine = d; else { w.input = d; drop(w); w.frame = frameFor(w); w.locker = false; } };
    give(who, v);
    if (other) give(other, old);
    save(); render('');
  }
  const setMine = (v) => setDevice('me', v);

  // ----- the screen: halves for two, quarters for three or four (by `order`)
  // the shared column (mission box, objective, encounter and task plates) gets a strip of its own on the far left,
  // outside everyone's view (localStrip); the views share the rest
  const STRIP_W = 296;
  const stripS = () => Math.max(0.5, Math.min(0.85, window.innerHeight / 1270));
  const views = () => order.filter(s => s !== undefined).length;
  // three players: the quarters fill the whole width and the column goes into the empty quarter (the user)
  const emptyQuarter = () => [0, 1, 2, 3].find(i => order[i] === undefined);
  const stripW = () => (inGame && active() && views() !== 3 ? Math.round(STRIP_W * stripS()) : 0);
  // where the shared column is drawn: the strip on the far left, or the empty quarter
  const stripRect = () => (views() === 3 ? rectAt(emptyQuarter(), 4) : { x: 0, y: 0, w: stripW(), h: window.innerHeight });
  function rectAt(i, n) {
    const x0 = stripW(), W = window.innerWidth - x0, H = window.innerHeight, g = 2;
    if (n === 2) return { x: x0 + (i ? Math.ceil(W / 2) + g / 2 : 0), y: 0, w: Math.floor(W / 2) - g / 2, h: H };
    const cw = Math.floor(W / 2) - g / 2, ch = Math.floor(H / 2) - g / 2;
    return { x: x0 + (i % 2 ? W - cw : 0), y: i >= 2 ? H - ch : 0, w: cw, h: ch };
  }
  const rectOf = (slot) => rectAt(order.indexOf(slot), Math.max(2, order.length));
  const setFrame = (f, r) => Object.assign(f.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
  function place() {                                  // in a mission: every view in its spot; in the lobby: only open lockers
    rect = inGame && active() ? rectOf(1) : null;
    if (typeof resize === 'function') resize();
    for (const p of players) {
      if (!p.frame) continue;
      const show = (inGame && active()) || p.locker;
      p.frame.hidden = !show;
      p.frame.classList.toggle('locker', !inGame && !!p.locker);
      if (show) setFrame(p.frame, rectOf(p.slot));
    }
  }
  window.addEventListener('resize', () => { if (inGame || players.some(p => p.locker)) place(); });
  // the coloured borders: whose view is whose, fading out after a few seconds
  function borders() {
    document.querySelectorAll('.local-border').forEach(b => b.remove());
    for (const slot of order) {
      const name = slot === 1 ? myName() : players.find(p => p.slot === slot)?.name || '';
      const col = (typeof crew !== 'undefined' && crew.find(c => c.name === name)?.color) || colorOf(slot === 1 ? 'me' : players.find(p => p.slot === slot) || { slot });
      const r = rectOf(slot), b = document.createElement('div');
      b.className = 'local-border';
      Object.assign(b.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', borderColor: col, transitionDuration: FADE_TIME + 's' });
      b.innerHTML = `<span style="background:${col}">${escapeHtml(name)}</span>`;
      document.body.appendChild(b);
      setTimeout(() => { b.style.opacity = '0'; }, FADE_AFTER * 1000);
      setTimeout(() => b.remove(), (FADE_AFTER + FADE_TIME) * 1000 + 200);
    }
  }

  // ----- the lobby panel (host only)
  // Every device, always: the keyboard + mouse and controllers 1-4 (a browser only lists a controller after a button
  // press on it, so the ones it hasn't seen yet are there too, named so), and who has it now (picking it swaps)
  const DEVICES = ['kbm', 'pad0', 'pad1', 'pad2', 'pad3'];
  function devLabel(v, who) {
    const P = pads(), i = v === 'kbm' ? -1 : +v.slice(3);
    const base = v === 'kbm' ? 'Keyboard + mouse' : P[i] ? `Controller ${i + 1}: ${P[i].id.replace(/\s*\(.*$/, '').slice(0, 22)}` : `Controller ${i + 1} (press a button on it)`;
    const holder = mine === v ? 'me' : players.find(q => q.input === v);
    return holder && holder !== who ? `${base} · ${holder === 'me' ? myName() : holder.name}'s: swap` : base;
  }
  function devOptions(sel, cur, who) {
    sel.innerHTML = DEVICES.map(v => `<option value="${v}">${escapeHtml(devLabel(v, who))}</option>`).join('');
    sel.value = cur;
  }
  function relabel() {                                // (a controller seen for the first time: just the names, no rebuild)
    document.querySelectorAll('#local-rows select').forEach(sel => {
      const slot = +sel.closest('.local-row')?.dataset.slot || 0, who = slot ? players.find(q => q.slot === slot) : 'me';
      [...sel.options].forEach(o => { const t = devLabel(o.value, who); if (o.textContent !== t) o.textContent = t; });
    });
  }
  let lastMsg = '';
  function render(msg) {
    const box = $('local-box');
    if (!box) return;
    if (msg !== undefined) lastMsg = msg;
    box.hidden = !host || game == null;
    if (box.hidden) return;
    const n = 1 + players.length;
    $('local-add').disabled = n >= MAX;
    const rows = $('local-rows');
    rows.innerHTML = `<div class="local-row"><button class="paint local-paint" data-paint-me data-paint="${colorOf('me')}" style="background:${colorOf('me')}" title="Suit colour (the main menu's): click for the next one"></button><span class="local-me">${escapeHtml(myName())} <small>(you)</small></span><select data-me></select></div>`
      + players.map(p => `<div class="local-row" data-slot="${p.slot}"><button class="paint local-paint" data-paint="${colorOf(p)}" style="background:${colorOf(p)}" title="${escapeHtml(p.name)}'s suit colour: click for the next one"></button><input value="${escapeHtml(p.name)}" maxlength="24" aria-label="Name">`
      + `<select></select><button class="local-locker" title="${escapeHtml(p.name)}'s locker: opens in their part of the screen">LOCKER</button><button class="local-x" title="Remove">✕</button></div>`).join('')
      + (lastMsg ? `<p class="local-msg">${escapeHtml(lastMsg)}</p>` : '');
    devOptions(rows.querySelector('[data-me]'), mine, 'me');
    rows.querySelector('[data-me]').onchange = (e) => setMine(e.target.value);
    rows.querySelector('[data-paint-me]').onclick = () => nextPaint('me');
    for (const p of players) {
      const row = rows.querySelector(`[data-slot="${p.slot}"]`);
      devOptions(row.querySelector('select'), p.input, p);
      row.querySelector('select').onchange = (e) => change(p, 'input', e.target.value);
      row.querySelector('input').onchange = (e) => change(p, 'name', e.target.value);
      row.querySelector('.local-locker').onclick = () => locker(p);
      row.querySelector('.local-x').onclick = () => remove(p);
      row.querySelector('.local-paint').onclick = () => nextPaint(p);
    }
    // the map: where everyone's view goes; drag a name onto another spot to swap (or click two in turn)
    const map = $('local-map');
    map.hidden = n < 2;
    map.className = n > 2 ? 'quad' : '';
    const cells = n > 2 ? 4 : 2;
    map.innerHTML = Array.from({ length: cells }, (_, i) => {
      const slot = order[i], name = slot === 1 ? myName() : players.find(p => p.slot === slot)?.name;
      return `<div class="local-cell" data-i="${i}">${slot ? `<span class="local-chip${pick === slot ? ' picked' : ''}" draggable="true" data-slot="${slot}" style="background:${colorOf(slot === 1 ? 'me' : players.find(p => p.slot === slot) || { slot })}">${escapeHtml(name || '')}</span>` : ''}</div>`;
    }).join('');
    map.querySelectorAll('.local-chip').forEach(ch => {
      ch.ondragstart = (e) => { e.dataTransfer.setData('text/plain', ch.dataset.slot); };
      ch.onclick = () => { const s = +ch.dataset.slot; if (pick && pick !== s) { swap(pick, order.indexOf(s)); pick = null; } else pick = pick === s ? null : s; render(); };
    });
    map.querySelectorAll('.local-cell').forEach(c => {
      c.ondragover = (e) => e.preventDefault();
      c.ondrop = (e) => { e.preventDefault(); const s = +e.dataTransfer.getData('text/plain'); if (s) swap(s, +c.dataset.i); };
      c.onclick = (e) => { if (e.target === c && pick) { swap(pick, +c.dataset.i); pick = null; } };
    });
  }
  let pick = null;
  function swap(slot, i) {                            // put `slot` at position i (whoever is there takes its old spot)
    const from = order.indexOf(slot);
    if (from < 0 || i < 0 || i >= Math.max(2, order.length > 2 ? 4 : 2)) return;
    const o = order.slice(); while (o.length <= i) o.push(undefined);
    [o[from], o[i]] = [o[i], o[from]];
    order = o.filter((s, k) => s !== undefined || k < o.length);   // (3 players: one spot stays empty)
    while (order.length && order[order.length - 1] === undefined) order.pop();
    save(); render(); place();
  }
  // Suit colours: this page's player has the main menu's (profile.paint; changing it here changes it there), each local
  // player their own (in their profile, by name: js/split.js splitApi.setPaint). A click: the next colour.
  // (none picked: the colour the server gives them, from the lobby's player list)
  let lobbyCol = {};
  const colorOf = (who) => (who === 'me' ? (typeof profile !== 'undefined' && profile.paint) || lobbyCol[myName()] || COLORS[0]
    : who.paint || lobbyCol[who.name] || COLORS[who.slot - 1]);
  function nextPaint(who) {
    const P = typeof PAINTS !== 'undefined' ? PAINTS : COLORS, next = P[(P.indexOf(colorOf(who)) + 1) % P.length];
    if (who === 'me') { profile.paint = next; saveProfile(profile); lobbyUI.render(); lobbyUI.onProfile?.(); }
    else { who.paint = next; try { who.frame?.contentWindow?.splitApi?.setPaint(next); } catch (e) { /* not ready: on load */ } save(); }
    render();
  }
  // A view's colour once it's loaded: the one set here, or (none set yet) the one in its player's profile
  function paintSync(p) {
    const a = p.frame?.contentWindow?.splitApi;
    if (!a) return;
    if (p.paint) a.setPaint(p.paint); else if (a.paint) { p.paint = a.paint; save(); render(); }
  }
  // Everyone's locker at once (the lobby's LOCKER button with local players): each in their part of the screen, this
  // page's own (#shop) in its part too, so everybody kits out in parallel, each with their own controller.
  function lockers() {
    if (!active()) return false;
    for (const p of players) locker(p);
    lobbyUI.shop('locker');
    const r = rectOf(1), shop = $('shop');
    Object.assign(shop.style, { inset: 'auto', left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', background: '#07090f' });   // (opaque: the lobby stays behind it)
    return true;
  }
  if ($('shop')) new MutationObserver(() => { const sh = $('shop'); if (sh.hidden) ['inset', 'left', 'top', 'width', 'height', 'background'].forEach(k => { sh.style[k] = ''; }); })
    .observe($('shop'), { attributes: true, attributeFilter: ['hidden'] });
  // a player's own locker, in their part of the screen (several at once: each kits out in parallel)
  function locker(p) {
    if (!p.frame) return;
    p.locker = true; place();
    const open = () => { try { p.frame.contentWindow.splitApi?.locker(); } catch (e) { /* not ready */ } };
    if (p.frame.contentWindow?.splitApi?.locker) open(); else p.frame.addEventListener('load', () => setTimeout(open, 300), { once: true });
  }
  window.localLockerClosed = (slot) => { const p = players.find(q => q.slot === slot); if (p) { p.locker = false; place(); } };
  window.localRemove = (slot) => { const p = players.find(q => q.slot === slot); if (p) remove(p); };

  $('local-add').onclick = add;

  // ----- what the views and the rest of the game ask
  window.splitPads = pads;
  window.splitGame = null;
  window.splitKbm = () => (!active() ? null : mine === 'kbm' ? window : players.find(p => p.input === 'kbm')?.frame?.contentWindow || null);
  window.splitApi = (slot) => (slot === 1 ? { toggleMute: () => sfx.toggleMute(), get muted() { return sfx.muted; } } : null);
  window.localIds = () => [typeof me !== 'undefined' ? me.id : null, ...players.map(p => { try { return p.frame?.contentWindow?.splitApi?.id; } catch (e) { return null; } })].filter(x => x != null);   // (who plays at this screen: js/progress.js bannerHere)
  window.localSharedSlot = () => (inGame && active() ? order.find(s => s !== undefined) : 1);   // (the banners: the top-left view)
  window.localSplit = () => inGame && active();      // (in a split mission no view draws the shared column: the strip does)
  // The strip: the shared column drawn here, every frame (js/game.js render), on a canvas of its own; a click on a
  // plate claims it as in a view (js/claims.js)
  let sc = null;
  window.localStripH = () => (inGame && active() ? Math.round(stripRect().h / stripS()) : 0);   // (js/sidebar.js: how many plates fit)
  window.localStrip = () => {
    if (!(inGame && active())) { if (sc) sc.hidden = true; return; }
    const s = stripS(), R = stripRect(), w = R.w, h = R.h, dpr = window.devicePixelRatio || 1;
    if (!sc) {
      sc = document.createElement('canvas'); sc.id = 'local-strip'; document.body.appendChild(sc);
      sc.addEventListener('mousedown', (e) => {
        const R = stripRect(), x = (e.clientX - R.x) / stripS(), y = (e.clientY - R.y) / stripS(), k = typeof plateAt === 'function' && plateAt(x, y, true);
        if (e.button === 0 && k && mission.active) sendCommand(['claim', k]);
      });
    }
    if (sc.width !== Math.round(w * dpr) || sc.height !== Math.round(h * dpr)) { sc.width = Math.round(w * dpr); sc.height = Math.round(h * dpr); sc.style.width = w + 'px'; sc.style.height = h + 'px'; }
    sc.hidden = false; sc.style.left = R.x + 'px'; sc.style.top = R.y + 'px';
    const g = sc.getContext('2d'), keep = ctx;
    g.setTransform(dpr * s, 0, 0, dpr * s, 0, 0); g.fillStyle = '#07090f'; g.fillRect(0, 0, w / s, h / s);
    ctx = g;
    try { drawSidebar(HUD_H); } catch (e) { /* never stop the frame */ } finally { ctx = keep; }
  };
  window.localViewRect = () => rect;                 // this page's own view in a mission (js/game.js resize)
  window.localPad = () => (!active() ? undefined : mine === 'kbm' ? null : +mine.slice(3));   // (js/gamepad.js)
  // keys typed here while someone else has the keyboard: theirs (in a mission; the lobby's own fields stay here)
  for (const type of ['keydown', 'keyup']) window.addEventListener(type, (e) => {
    if (!e.isTrusted || !inGame || !active() || mine === 'kbm') return;
    const to = window.splitKbm(); if (!to || to === window) return;
    e.stopImmediatePropagation(); e.preventDefault();
    to.dispatchEvent(new to.KeyboardEvent(type, { code: e.code, key: e.key, repeat: e.repeat, bubbles: true, cancelable: true }));
  }, true);
  setInterval(() => { if (host && game != null && !inGame) { const sig = pads().map(p => p && p.id).join(); if (sig !== relabel.sig) { relabel.sig = sig; relabel(); } } }, 700);

  return {
    // js/net.js: the room (re)drawn, this page's game joined, the mission started, the game left
    room(st) {
      const col = Object.fromEntries((st.players || []).map(q => [q.name, q.color])), colChanged = JSON.stringify(col) !== JSON.stringify(lobbyCol);
      lobbyCol = col;
      if (!!st.host === host && render.done) {          // (not rebuilt on every lobby update: an open dropdown would close)
        if (colChanged) document.querySelectorAll('#local-rows .local-paint, #local-map .local-chip').forEach(b => {
          const slot = +(b.closest('.local-row')?.dataset.slot || b.dataset.slot || 1), who = slot === 1 ? 'me' : players.find(q => q.slot === slot);
          if (who) { b.style.background = colorOf(who); if (b.dataset.paint) b.dataset.paint = colorOf(who); }
        });
        return;
      }
      host = !!st.host; render.done = true; render();
    },
    joined(id) {
      game = id; window.splitGame = id;
      const run = read(sessionStorage, 'mn-local-run');
      if (run && run.game === id && !players.length) {   // back from a mission: the same local players again
        mine = run.mine || mine; order = (run.order || [1]).slice();
        players = (run.players || []).map(q => ({ ...q })); players.forEach(p => { p.frame = frameFor(p); });
        order = order.filter(s => s === 1 || s === undefined || players.some(p => p.slot === s));
        if (!order.includes(1)) order.unshift(1);
        players.forEach(p => { if (!order.includes(p.slot)) order.push(p.slot); });
      }
      save(); render();
    },
    start() {
      inGame = true;
      for (const p of players) p.locker = false;
      place();
      if (active()) borders();
    },
    left() { players.slice().forEach(drop); players = []; order = [1]; game = null; window.splitGame = null; inGame = false; save(); render(); place(); },
    get active() { return active(); },
    lockers,
  };
})();
