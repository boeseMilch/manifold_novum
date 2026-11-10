// Loads the game scripts into a sandbox with a no-op canvas and no audio, so game logic
// can be driven from Node. Usage: const G = loadGame(); G.tick(1 / 60); ...
// For a new test's checks: const { check, done } = require('./harness').checks('airlock'); ... done();
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

// The scripts index.html loads from js/, in its order: the one list. A script added to the page is in the
// tests from then on (tests/scripts.js holds server.js's own, shorter list against it).
function pageScripts() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script\s+src="js\/([^"]+)\.js"\s*>/g)].map(m => m[1]);
}

// The page's scripts that are not loaded here, and why. Each is the browser's own shell around the game:
// none holds game rules. Anything else on the page is loaded.
const BROWSER_ONLY = {
  split: 'a split-screen view inside an iframe: needs window.parent and the DOM (the save side is js/progress.js, tests/split.js)',
  local: 'the host page\'s split-screen roster: builds iframes, reads localStorage and the lobby DOM',
  menugl: 'the WebGL menu background: needs the lobby DOM and a GL context',
  gamepad: 'reads navigator.getGamepads and sends key events to the page; tests/gamepad.js runs it in its own sandbox with a fake pad',
  menupad: 'walks the menu DOM and starts a timer that would keep every test process alive; tests/menupad.js runs it in its own sandbox',
};

const SCRIPTS = pageScripts().filter(f => !(f in BROWSER_ONLY));

let compiled = null;                                   // the scripts as one vm.Script, compiled once per process
function gameScript() {
  if (!compiled) {
    const code = SCRIPTS.map(f => fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8')).join('\n;\n');
    compiled = new vm.Script(code, { filename: 'game-scripts.js' });
  }
  return compiled;
}

function loadGame(expose = [], env = {}) {   // env: sandbox globals to add / replace (e.g. location, document, localStorage)
  const noop = new Proxy(function () {}, {
    get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : noop), apply: () => noop, set: () => true,
  });
  const listeners = {};
  const sandbox = {
    window: { addEventListener: (n, f) => { listeners[n] = f; }, innerWidth: 1600, innerHeight: 1000, devicePixelRatio: 1 },
    document: { getElementById: () => ({ getContext: () => noop, style: {}, addEventListener() {} }) },
    performance: { now: () => 0 }, requestAnimationFrame: () => {}, location: { hash: '#test' },
    console, Math, setTimeout, setInterval,
  };
  Object.assign(sandbox, env);
  vm.createContext(sandbox);
  gameScript().runInContext(sandbox);
  // live getters, so reassigned variables (like `prompt`) read their current value
  // (a second script in the same context: it sees the first one's top-level const / let)
  vm.runInContext(`globalThis.__game = { ${expose.map(n => `get ${n}() { return ${n}; }`).join(', ')} };`, sandbox);
  return Object.assign(sandbox.__game, { listeners });
}

// The check helper every test needs: prints one line per check, counts the failures, and done() prints the
// last line and exits non-zero if any failed (tests/run.js reads the exit code).
function checks(what) {
  let failed = 0;
  return {
    check(ok, text) { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; return !!ok; },
    get failed() { return failed; },
    done() { console.log(failed ? `\n${failed} FAILED` : `\nall ${what} checks passed`); process.exit(failed ? 1 : 0); },
  };
}

module.exports = { loadGame, checks, pageScripts, SCRIPTS, BROWSER_ONLY };
