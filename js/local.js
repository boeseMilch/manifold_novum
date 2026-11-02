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
  function save() {
    const list = players.map(p => ({ slot: p.slot, name: p.name, input: p.input }));
    try { localStorage.setItem('mn-local', JSON.stringify({ mine, players: list })); } catch (e) { /* no storage */ }
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
    const old = (mem.players || []).find(q => q.slot === slot);
    let name = old?.name && !names.includes(old.name.toLowerCase()) ? old.name : `Player ${slot}`;
    for (let k = slot; names.includes(name.toLowerCase()); k++) name = `Player ${k + 1}`;
    const input = old?.input && !used.includes(old.input) ? old.input : ['pad0', 'pad1', 'pad2', 'pad3', 'kbm'].find(i => !used.includes(i));
    const p = { slot, name, input };
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
    } else {
      if (inputs().some((i, k) => i === v && (k === 0 || players[k - 1] !== p))) return render('That device is someone else\'s already: everyone needs their own.');
      p.input = v;
    }
    drop(p); p.frame = frameFor(p); p.locker = false;
    save(); render();
  }
  function setMine(v) {
    if (players.some(p => p.input === v)) return render('That device is someone else\'s already: everyone needs their own.');
    mine = v; save(); render();
  }

  // ----- the screen: halves for two, quarters for three or four (by `order`)
  // the shared column (mission box, objective, encounter and task plates) gets a strip of its own on the far left,
  // outside everyone's view (localStrip); the views share the rest
  const STRIP_W = 296;
  const stripS = () => Math.max(0.5, Math.min(0.85, window.innerHeight / 1270));
  const stripW = () => (inGame && active() ? Math.round(STRIP_W * stripS()) : 0);
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
      const col = (typeof crew !== 'undefined' && crew.find(c => c.name === name)?.color) || COLORS[slot - 1];
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
  function devOptions(sel, cur) {
    const opts = [['kbm', 'Keyboard + mouse']];
    pads().forEach((p, i) => { if (p) opts.push(['pad' + i, `Controller ${i + 1}: ${p.id.replace(/\s*\(.*$/, '').slice(0, 26)}`]); });
    if (!opts.some(o => o[0] === cur)) opts.push([cur, `Controller ${+cur.slice(3) + 1} (press a button on it)`]);
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('');
    sel.value = cur;
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
    rows.innerHTML = `<div class="local-row"><i style="background:${COLORS[0]}"></i><span class="local-me">${escapeHtml(myName())} <small>(you)</small></span><select data-me></select></div>`
      + players.map(p => `<div class="local-row" data-slot="${p.slot}"><i style="background:${COLORS[p.slot - 1]}"></i><input value="${escapeHtml(p.name)}" maxlength="24" aria-label="Name">`
      + `<select></select><button class="local-locker" title="${escapeHtml(p.name)}'s locker: opens in their part of the screen">LOCKER</button><button class="local-x" title="Remove">✕</button></div>`).join('')
      + (lastMsg ? `<p class="local-msg">${escapeHtml(lastMsg)}</p>` : '');
    devOptions(rows.querySelector('[data-me]'), mine);
    rows.querySelector('[data-me]').onchange = (e) => setMine(e.target.value);
    for (const p of players) {
      const row = rows.querySelector(`[data-slot="${p.slot}"]`);
      devOptions(row.querySelector('select'), p.input);
      row.querySelector('select').onchange = (e) => change(p, 'input', e.target.value);
      row.querySelector('input').onchange = (e) => change(p, 'name', e.target.value);
      row.querySelector('.local-locker').onclick = () => locker(p);
      row.querySelector('.local-x').onclick = () => remove(p);
    }
    // the map: where everyone's view goes; drag a name onto another spot to swap (or click two in turn)
    const map = $('local-map');
    map.hidden = n < 2;
    map.className = n > 2 ? 'quad' : '';
    const cells = n > 2 ? 4 : 2;
    map.innerHTML = Array.from({ length: cells }, (_, i) => {
      const slot = order[i], name = slot === 1 ? myName() : players.find(p => p.slot === slot)?.name;
      return `<div class="local-cell" data-i="${i}">${slot ? `<span class="local-chip${pick === slot ? ' picked' : ''}" draggable="true" data-slot="${slot}" style="background:${COLORS[slot - 1]}">${escapeHtml(name || '')}</span>` : ''}</div>`;
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
  window.localSharedSlot = () => (inGame && active() ? order.find(s => s !== undefined) : 1);   // (the banners: the top-left view)
  window.localSplit = () => inGame && active();      // (in a split mission no view draws the shared column: the strip does)
  // The strip: the shared column drawn here, every frame (js/game.js render), on a canvas of its own; a click on a
  // plate claims it as in a view (js/claims.js)
  let sc = null;
  window.localStripH = () => (inGame && active() ? Math.round(window.innerHeight / stripS()) : 0);   // (js/sidebar.js: how many plates fit)
  window.localStrip = () => {
    if (!(inGame && active())) { if (sc) sc.hidden = true; return; }
    const s = stripS(), w = stripW(), h = window.innerHeight, dpr = window.devicePixelRatio || 1;
    if (!sc) {
      sc = document.createElement('canvas'); sc.id = 'local-strip'; document.body.appendChild(sc);
      sc.addEventListener('mousedown', (e) => {
        const x = e.clientX / stripS(), y = e.clientY / stripS(), k = typeof plateAt === 'function' && plateAt(x, y, true);
        if (e.button === 0 && k && mission.active) sendCommand(['claim', k]);
      });
    }
    if (sc.width !== Math.round(w * dpr) || sc.height !== Math.round(h * dpr)) { sc.width = Math.round(w * dpr); sc.height = Math.round(h * dpr); sc.style.width = w + 'px'; sc.style.height = h + 'px'; }
    sc.hidden = false;
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
  setInterval(() => { if (host && game != null && !inGame && !document.querySelector('#local-rows select:focus')) { const sig = pads().map(p => p && p.id).join(); if (sig !== render.sig) { render.sig = sig; render(); } } }, 700);

  return {
    // js/net.js: the room (re)drawn, this page's game joined, the mission started, the game left
    room(st) { host = !!st.host; render(); },
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
  };
})();
