// Split screen (split.html, js/progress.js SPLIT): each half's player keeps their own progress, by name. This
// browser's own player (localStorage 'mn-name') keeps the usual save (cookie + localStorage); anyone else gets
// 'mn-profile@<name>' in localStorage and never touches the cookie. The right half hides the shared column and banners.
// Run: node tests/split.js
const { loadGame } = require('./harness');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };

// a browser: its cookie jar and localStorage, kept across page loads
function browser() {
  const ls = {}, jar = {};
  const localStorage = { getItem: (k) => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = String(v); }, removeItem: (k) => { delete ls[k]; } };
  const document = {
    getElementById: () => ({ getContext: () => new Proxy(function () {}, { get: () => () => ({ width: 10 }) }), style: {}, addEventListener() {} }),
    get cookie() { return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '); },
    set cookie(s) { const [kv] = s.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); },
  };
  return { ls, jar, load: (search) => loadGame(['profile', 'saveProfile', 'SPLIT', 'splitShared', 'defaultProfile'], { localStorage, document, URLSearchParams, location: { hash: '', search } }) };
}

{
  const B = browser();
  B.ls['mn-name'] = 'Ripley';
  const usual = B.load('');                          // the usual game: its own save
  usual.profile.money = 500; usual.profile.gear.boots = true; usual.saveProfile(usual.profile);
  const cookie0 = B.jar['mn-profile'];
  check(!!cookie0 && JSON.parse(B.ls['mn-profile']).money === 500, 'the usual game saves to the cookie and localStorage, as always');

  const zoe = B.load('?split=2&name=Zoe&input=pad0');
  check(zoe.SPLIT && zoe.SPLIT.slot === 2 && zoe.SPLIT.name === 'Zoe' && zoe.SPLIT.pad === 0, 'the right half knows its slot, name and controller');
  check(zoe.profile.money === 0 && !zoe.profile.gear.boots, 'a new name starts with a fresh profile (not the browser\'s own)');
  zoe.profile.money = 77; zoe.profile.gear.armor = true; zoe.saveProfile(zoe.profile);
  check(JSON.parse(B.ls['mn-profile@Zoe']).money === 77 && B.jar['mn-profile'] === cookie0 && JSON.parse(B.ls['mn-profile']).money === 500,
        'Zoe\'s progress goes to mn-profile@Zoe; the usual cookie and save stay exactly as they were');
  check(!zoe.splitShared(), 'the right half doesn\'t show the shared column / banners');

  const rip = B.load('?split=1&name=Ripley&input=kbm');
  check(rip.profile.money === 500 && rip.profile.gear.boots && rip.splitShared(), 'the left half as this browser\'s own player (Ripley) plays on the usual save, shows the shared column');
  rip.profile.money = 600; rip.saveProfile(rip.profile);
  check(JSON.parse(decodeURIComponent(B.jar['mn-profile'])).money === 600, '…and saves to it (the cookie too)');

  const zoe2 = B.load('?split=1&name=Zoe&input=kbm');
  check(zoe2.profile.money === 77 && zoe2.profile.gear.armor, 'next time, Zoe gets her progress and locker back by name (in either half)');
  const back = B.load('');
  check(back.profile.money === 600 && !back.SPLIT && back.splitShared(), 'the usual game afterwards: the usual save, no split');
}

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
