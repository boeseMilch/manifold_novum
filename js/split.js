// Split screen, one half (split.html puts two of these pages side by side, ?split=1|2&name=…&input=kbm|padN; each
// half is its own player in the same local game on `node server.js`; js/progress.js SPLIT, js/net.js, js/gamepad.js).
// Here, early (before the game's own key handlers): the keyboard belongs to the keyboard + mouse half, so keys typed
// while a controller's half has the focus are passed over to it; and what the parent page may call on this half.
(() => {
  if (typeof window === 'undefined' || window.parent === window || !/[?&]split=[1-4]\b/.test(location.search)) return;
  if (!/[?&]input=kbm\b/.test(location.search)) for (const type of ['keydown', 'keyup']) window.addEventListener(type, (e) => {
    if (!e.isTrusted) return;                          // (this half's own controller: synthetic keys, js/gamepad.js)
    let to = null; try { to = window.parent.splitKbm?.(); } catch (err) { to = null; }
    if (!to || to === window) return;                  // (two controllers: nobody owns the keyboard)
    e.stopImmediatePropagation(); e.preventDefault();
    to.dispatchEvent(new to.KeyboardEvent(type, { code: e.code, key: e.key, repeat: e.repeat, bubbles: true, cancelable: true }));
  }, true);
  // the left half plays the sound (the right one is silent, js/audio.js): its mute is the one both halves show
  window.splitApi = { toggleMute: () => sfx.toggleMute(), get muted() { return sfx.muted; } };
})();
