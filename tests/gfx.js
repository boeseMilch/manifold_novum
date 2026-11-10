// The sprite renderer (js/gfx.js) brought up against a fake WebGL2 and DOM: no picture, but its own bookkeeping runs.
// Checked here (2026-11-10): the settings' getters are live (GFX.setPathScratches(true) did nothing until a reload),
// the decoded bitmaps kept for the tint measurement are closed once the page's sprites are measured, and a lost
// context ends in the 2D view with a notice on the page. Run: node tests/gfx.js
const fs = require('fs'), path = require('path'), vm = require('vm');
let failed = 0;
const check = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'}  ${text}`); if (!ok) failed++; };
const ROOT = path.join(__dirname, '..');

// A GL context that accepts everything: constants are numbers, shaders compile, framebuffers are complete.
const consts = new Map(), K = (k) => consts.get(k) || (consts.set(k, 1000 + consts.size), consts.get(k));
const glFns = { getParameter: () => 8, getExtension: () => new Proxy({}, { get: (t, k) => K(k) }), getShaderParameter: () => true, getProgramParameter: (p, what) => (what === K('ACTIVE_UNIFORMS') ? 0 : true),
  checkFramebufferStatus: () => K('FRAMEBUFFER_COMPLETE'), getError: () => 0, isContextLost: () => false };
const gl = new Proxy({}, { get: (t, k) => (typeof k !== 'string' ? undefined : /^[A-Z][A-Z0-9_]*$/.test(k) ? K(k) : glFns[k] || (/^(create|get)/.test(k) ? () => ({}) : () => {})) });
// A 2D context that draws nothing; getImageData: an opaque mid-grey picture, all of it inside the tint mask.
const ctx2d = new Proxy({}, { get: (t, k) => (k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(210) }) : k === 'measureText' ? () => ({ width: 10 }) : k === 'canvas' ? { width: 1, height: 1 } : () => ctx2d), set: () => true });
const body = { kids: [], appendChild(n) { this.kids.push(n); n.parentNode = this; }, removeChild(n) { this.kids = this.kids.filter(k => k !== n); n.parentNode = null; }, insertBefore(n) { this.appendChild(n); } };
const element = (tag) => { const on = {}; return { tag, style: {}, width: 300, height: 150, parentNode: null, textContent: '', on, attrs: {},
  getContext: (kind) => (kind === 'webgl2' ? gl : ctx2d), addEventListener: (n, f) => { (on[n] ||= []).push(f); }, setAttribute(k, v) { this.attrs[k] = v; }, remove() { this.parentNode?.removeChild(this); } }; };
const bitmaps = [], frames = [], warns = [];
const store = {};
const sandbox = { window: { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 }, document: { createElement: element, getElementById: () => null, body },
  location: { search: '', protocol: 'http:', href: 'http://localhost/' }, WebGL2RenderingContext: function () {}, navigator: { userAgent: 'node' }, performance,
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
  requestAnimationFrame: (f) => { frames.push(f); }, console: { ...console, warn: (...a) => warns.push(a.join(' ')) }, Math, setTimeout, Promise, Float32Array, Uint8Array, Uint8ClampedArray, Uint16Array, Int32Array, Map, Set, WeakMap,
  fetch: async (url) => (/sprites\.json$/.test(url) ? { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'sprites', 'sprites.json'), 'utf8')) } : { ok: true, blob: async () => ({ url }) }),
  createImageBitmap: async (blob) => { const m = /\/([a-z0-9]+\/page\d+)(?:\.([nhm]))?\.webp$/.exec(blob.url), b = { url: blob.url, page: m[1], kind: m[2] || 'b', width: 64, height: 64, closed: false, close() { this.closed = true; } }; bitmaps.push(b); return b; } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'gfx.js'), 'utf8'), sandbox);
const GFX = vm.runInContext('GFX', sandbox);
const settle = () => new Promise(r => setTimeout(r, 0));
const frame = async (n = 1) => { for (let i = 0; i < n; i++) { await settle(); for (const f of frames.splice(0)) f(); } };

(async () => {
  check(GFX.on && !warns.length, `the renderer comes up on the fake context (${GFX.on ? 'on' : 'off: ' + GFX.reason}${warns.length ? '; ' + warns.join('; ') : ''})`);
  if (!GFX.on) { process.exitCode = 1; return; }

  // ---- the settings' getters are live
  await frame(3);
  check(GFX.pathScratches === true && GFX.scratches === true, 'scratches and path scratches start on');
  GFX.setPathScratches(false); GFX.setScratches(false);
  check(GFX.pathScratches === false && GFX.scratches === false && store['mn-gfx-pathscratch'] === '0', 'switched off: GFX.pathScratches / GFX.scratches say so (and it is remembered)');
  GFX.setPathScratches(true); GFX.setScratches(true);
  check(GFX.pathScratches === true && GFX.scratches === true, 'switched on again without a reload: they say so (js/sprites.js reads GFX.pathScratches every frame)');
  check(!!GFX.manifest && !!GFX.manifest['crew/idle'] === GFX.has('crew/idle') && Object.keys(GFX.manifest).length > 1000, 'GFX.manifest is the loaded sprite list, not what it was before loading');

  // ---- the tint measurement's bitmaps
  for (let i = 0; i < 400 && !(bitmaps.length && bitmaps.every(b => b.closed)); i++) await frame();
  const masked = Object.values(GFX.manifest).filter(S => (S.maps || '').includes('m') && ['crew', 'interior', 'ship'].includes(S.group));
  const pages = [...new Set(bitmaps.map(b => b.page))], withMask = [...new Set(bitmaps.filter(b => b.kind === 'm').map(b => b.page))];
  check(pages.length >= 5 && withMask.length >= 2, `the first pages load (${pages.join(', ')}; with a tint mask: ${withMask.join(', ')})`);
  check(GFX.ready('crew/idle') || GFX.ready(masked[0].name), 'and are ready to draw');
  const open = bitmaps.filter(b => !b.closed);
  check(!open.length, `every decoded bitmap is closed once it is on the GPU and measured (${open.length} of ${bitmaps.length} still open${open.length ? ': ' + open.slice(0, 4).map(b => b.url).join(', ') : ''})`);
  check(masked.length > 5 && masked.every(S => S._tintRef > 0.5 && S._tintRef < 1), `after every tinted sprite on those pages got its reference brightness (${masked.length} sprites, e.g. ${masked[0].name}: ${masked[0]._tintRef?.toFixed(2)})`);

  // ---- more areas than the shader takes: said once
  const areas = Array.from({ length: GFX.MAX_AREAS + 3 }, (_, i) => ({ x: i * 0.1, y: 0, w: 1, h: 1, color: [1, 1, 1] }));
  sandbox.VW = 1280; sandbox.VH = 720;
  for (let i = 0; i < 3; i++) { GFX.begin({ zoom: 1, ox: 0, oy: 0 }); GFX.lighting({ areas }); }
  check(warns.filter(w => /light areas/.test(w)).length === 1, `more light areas on screen than the shader takes: one console warning in three frames (${warns.join('; ') || 'none'})`);

  // ---- the context is lost
  const glc = body.kids.find(k => k.tag === 'canvas');
  let prevented = 0; warns.length = 0;
  for (const f of glc.on.webglcontextlost) f({ preventDefault() { prevented++; } });
  const notes = () => body.kids.filter(k => k.tag === 'div');
  check(!GFX.on && /context lost/i.test(GFX.reason) && !body.kids.includes(glc) && GFX.sprite('crew/idle', 0, 1, 1) === false, 'context lost: the renderer is off (the game draws its 2D view from here)');
  check(notes().length === 1 && /graphics lost/i.test(notes()[0].textContent) && /reload/i.test(notes()[0].textContent) && warns.length === 1, `and the page says so: "${notes()[0]?.textContent}"`);
  for (const f of glc.on.webglcontextlost) f({ preventDefault() {} });
  check(notes().length === 1, 'once');
  notes()[0].on.click[0](); check(notes().length === 0, 'a click puts the notice away');
  let threw = null; try { await frame(3); } catch (e) { threw = e; }
  check(!threw, 'and the upload loop keeps running without an error');
  process.exitCode = failed ? 1 : 0;
})();
