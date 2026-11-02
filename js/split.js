// Split screen: a local player's view (js/local.js puts these iframes on the host's page, ?split=2..4&name=…&input=…;
// each is its own player in the same game; js/progress.js SPLIT, js/net.js, js/gamepad.js). Here, early (before the
// game's own key handlers): the keyboard belongs to the keyboard + mouse player, so keys typed while a controller
// player's view has the focus are passed over to them; and what the host's page may call on this view.
(() => {
  if (typeof window === 'undefined' || window.parent === window || !/[?&]split=[1-4]\b/.test(location.search)) return;
  const slot = +/[?&]split=(\d)/.exec(location.search)[1];
  if (!/[?&]input=kbm\b/.test(location.search)) for (const type of ['keydown', 'keyup']) window.addEventListener(type, (e) => {
    if (!e.isTrusted) return;                          // (this view's own controller: synthetic keys, js/gamepad.js)
    let to = null; try { to = window.parent.splitKbm?.(); } catch (err) { to = null; }
    if (!to || to === window) return;                  // (all controllers: nobody owns the keyboard)
    e.stopImmediatePropagation(); e.preventDefault();
    to.dispatchEvent(new to.KeyboardEvent(type, { code: e.code, key: e.key, repeat: e.repeat, bubbles: true, cancelable: true }));
  }, true);
  window.splitApi = {
    toggleMute: () => sfx.toggleMute(), get muted() { return sfx.muted; },
    get id() { return typeof me !== 'undefined' && me ? me.id : null; },   // (this view's crew member: js/progress.js bannerHere)
    locker: () => lobbyUI.shop('locker'),            // (the host's lobby: this player's own locker, in their part of the screen)
    // this player's suit colour (their profile, by name; the host's lobby picks it): saved, and told to the server
    setPaint(c) { if (typeof PAINTS !== 'undefined' && !PAINTS.includes(c)) return; profile.paint = c; saveProfile(profile); lobbyUI.render(); lobbyUI.onProfile?.(); },
    get paint() { return profile.paint || null; },
  };
  // the locker closed: tell the host's page (it hides this view again)
  const watch = () => {
    const shop = document.getElementById('shop');
    if (!shop) return;
    new MutationObserver(() => { if (shop.hidden) { try { window.parent.localLockerClosed?.(slot); } catch (e) { /* not ours */ } } }).observe(shop, { attributes: true, attributeFilter: ['hidden'] });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
