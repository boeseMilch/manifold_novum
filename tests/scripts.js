// The lists of game scripts: index.html's script tags are the one list. The harness loads from it (all but the
// browser's own shell, tests/harness.js BROWSER_ONLY); server.js and music.html keep lists of their own, which
// are held against the page here, so a new script can't be forgotten in one of them. Run: node tests/scripts.js
const fs = require('fs'), path = require('path');
const { loadGame, checks, pageScripts, SCRIPTS, BROWSER_ONLY } = require('./harness');
const { check, done } = checks('script list');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const inOrder = (part, whole) => { let i = -1; return part.every(f => (i = whole.indexOf(f, i + 1)) >= 0); };

const page = pageScripts();

// The page's scripts the server's simulation leaves out, and why. Everything else on the page must be in its list.
const NOT_ON_SERVER = {
  cables: 'drawing only (the 3D power cables; js/systems.js calls it behind a typeof check and GFX.on)',
  tutorial: 'the solo tutorial: never runs on the server (crew training is js/tutorial-mp.js)',
  hitfx: 'drawing only (hit sparks, from synced state)',
  breakup: 'drawing and sound only (called behind typeof checks)',
  walkfield: 'drawing only (the floor scratches; js/sprites.js calls it behind a typeof check)',
};
const serverSkips = (f) => f in BROWSER_ONLY || f in NOT_ON_SERVER || f.startsWith('music/');   // (the pieces: the server plays no music)

{ // index.html and the files in js/
  const onDisk = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).sort()) {
    if (f.endsWith('.js')) onDisk.push(f.slice(0, -3));
    else if (fs.statSync(path.join(ROOT, 'js', f)).isDirectory()) for (const g of fs.readdirSync(path.join(ROOT, 'js', f)).sort()) if (g.endsWith('.js')) onDisk.push(f + '/' + g.slice(0, -3));
  }
  const missing = page.filter(f => !onDisk.includes(f)), unloaded = onDisk.filter(f => !page.includes(f));
  check(page.length > 40 && new Set(page).size === page.length, `index.html loads ${page.length} scripts from js/, none twice`);
  check(!missing.length, `every script index.html loads exists${missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''}`);
  check(!unloaded.length, `every file in js/ is loaded by index.html${unloaded.length ? ' (not loaded: ' + unloaded.join(', ') + ')' : ''}`);
}

{ // the harness
  const stale = Object.keys(BROWSER_ONLY).filter(f => !page.includes(f));
  check(!stale.length, `every script the harness skips is still on the page${stale.length ? ' (gone: ' + stale.join(', ') + ')' : ''}`);
  check(SCRIPTS.length === page.length - Object.keys(BROWSER_ONLY).length && inOrder(SCRIPTS, page), `the harness loads the other ${SCRIPTS.length}, in the page's order`);
  const G = loadGame(['drawCables3d', 'cableState', 'breakupUpdate', 'walkFieldPacked', 'tutorialAllows']);
  check(typeof G.drawCables3d === 'function' && typeof G.cableState === 'function', 'js/cables.js is loaded in the tests');
  check(typeof G.breakupUpdate === 'function' && typeof G.walkFieldPacked === 'function' && typeof G.tutorialAllows === 'function',
    'and so are breakup, walkfield and the tutorial');
}

{ // server.js
  const m = /^const SCRIPTS = \[([^\]]*)\];/m.exec(read('server.js'));
  check(!!m, 'server.js has its SCRIPTS list');
  const srv = m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
  const unknown = srv.filter(f => !page.includes(f)), shell = srv.filter(f => f in BROWSER_ONLY);
  check(srv.length > 20 && !unknown.length, `every script of the server's simulation is one the page loads${unknown.length ? ' (not on the page: ' + unknown.join(', ') + ')' : ''}`);
  check(inOrder(srv, page), 'in the same order as the page');
  check(!shell.length, `none of them is the browser's shell${shell.length ? ' (' + shell.join(', ') + ')' : ''}`);
  const forgotten = page.filter(f => !srv.includes(f) && !serverSkips(f));
  check(!forgotten.length, `every other script on the page is in the server's list${forgotten.length ? ' (add to server.js SCRIPTS, or to NOT_ON_SERVER here with the reason: ' + forgotten.join(', ') + ')' : ''}`);
  const both = Object.keys(NOT_ON_SERVER).filter(f => srv.includes(f) || !page.includes(f));
  check(!both.length, `the scripts listed here as left out by the server are left out, and on the page${both.length ? ' (' + both.join(', ') + ')' : ''}`);
}

{ // music.html: the sound engine and every piece
  const mus = [...read('music.html').matchAll(/<script\s+src="js\/([^"]+)\.js"\s*>/g)].map(x => x[1]);
  const want = page.filter(f => f === 'audio' || f === 'music' || f.startsWith('music/'));
  check(mus.join() === want.join(), `music.html loads the engine and the page's ${want.length - 2} pieces, in the page's order`);
}

done();
