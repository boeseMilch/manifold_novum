// Loads the game scripts into a sandbox with a no-op canvas and no audio, so game logic
// can be driven from Node. Usage: const G = loadGame(); G.tick(1 / 60); ...
const fs = require('fs'), path = require('path'), vm = require('vm');

const SCRIPTS = ['audio', 'music', 'art', 'ship', 'decor', 'interior', 'enemies', 'combat', 'systems', 'invader', 'mission', 'hazards', 'eva', 'sidebar', 'game', 'net'];

function loadGame(expose = []) {
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
  vm.createContext(sandbox);
  const dir = path.join(__dirname, '..', 'js');
  let code = SCRIPTS.map(f => fs.readFileSync(path.join(dir, f + '.js'), 'utf8')).join('\n;\n');
  // live getters, so reassigned variables (like `prompt`) read their current value
  code += `\n;globalThis.__game = { ${expose.map(n => `get ${n}() { return ${n}; }`).join(', ')} };`;
  vm.runInContext(code, sandbox);
  return Object.assign(sandbox.__game, { listeners });
}

module.exports = { loadGame };
