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

  // ---- the room light is a map, drawn again only when it changes (2026-11-15: it was a loop over every area for
  // every pixel; and the first version of the map compared doubles with the floats it had kept, so it "changed" every frame)
  {
    const rooms = () => [{ x: 0, y: 0, w: 10, h: 8, color: [0.3, 0.33, 0.4], sun: 0 }, { x: 12, y: 0, w: 6.5, h: 8, color: [0.36, 0.26, 0.25], sun: 0.25 }];
    const draw = (areas, ambient = [0.36, 0.4, 0.5]) => { GFX.begin({ zoom: 1, ox: 0, oy: 0 }); GFX.lighting({ ambient, areas, sun: { dir: [0, 0, 1], color: [1, 1, 1], k: 1 } }); GFX.end(); return GFX.stats.amb; };
    const first = draw(rooms()), n0 = first.draws, [bx, by, bw, bh] = first.box;
    check(bx <= -1 && by <= -1 && bx + bw >= 19.5 && by + bh >= 9 && first.w === bw * 16 && first.h === bh * 16, `the room-light map covers the rooms and a rim of open space, 16 texels a unit (${first.w} × ${first.h} for ${bw} × ${bh} units)`);
    for (let i = 0; i < 5; i++) draw(rooms());
    check(GFX.stats.amb.draws === n0, `the same rooms in the same light for five more frames: not drawn again (${GFX.stats.amb.draws - n0} times)`);
    const dim = rooms(); dim[1].color = [0.2, 0.1, 0.1];
    check(draw(dim).draws === n0 + 1 && draw(dim).draws === n0 + 1, 'a room\'s light changes (the power goes): drawn again, once');
    const moved = rooms(); moved.push({ x: 20, y: 2, w: 4, h: 3, color: [0.2, 0.2, 0.2], sun: 0 });
    check(draw(moved).draws === n0 + 2 && draw(moved).box[2] > bw, 'a ship docks (another room): drawn again, on a bigger map');
    check(draw(moved, [0.1, 0.1, 0.12]).draws === n0 + 3, 'the light outside changes: drawn again');
    const none = draw([]);
    check(none.w === 1 && none.h === 1 && none.draws === n0 + 4, 'no rooms at all: one texel of the light outside');
  }
  // ---- the Graphics menu's settings (js/net.js): fixed resolution or automatic, simple lighting, the shadows
  {
    const shot = () => { GFX.begin({ zoom: 1, ox: 0, oy: 0 }); GFX.lighting({ areas: [] }); GFX.end(); return GFX.resolution(); };
    const a = shot();
    check(a.auto && a.w === 1280 && a.h === 720 && a.full[0] === 1280 && a.full[1] === 720, `automatic at first: a 1280 × 720 window is drawn whole (${a.w} × ${a.h})`);
    GFX.setScale(0.5); const f = shot();
    check(!f.auto && f.scale === 0.5 && f.w === 640 && f.h === 360 && store['mn-gfx-scale'] === '0.5', `fixed at 50 %: 640 × 360, remembered (${f.w} × ${f.h})`);
    GFX.setScale(null); const back = shot();
    check(back.auto && back.w === 1280 && !('mn-gfx-scale' in store), 'automatic again: the whole window, nothing kept');
    check(GFX.simpleLight === false && GFX.shadows === true, 'full lighting with shadows to begin with');
    let threw = null;
    try { GFX.setSimpleLight(true); shot(); shot(); } catch (e) { threw = e; }
    check(!threw && GFX.simpleLight === true && store['mn-gfx-light'] === 'simple', `simple lighting: on, remembered, and a frame draws${threw ? ' (' + threw.message + ')' : ''}`);
    try { GFX.setSimpleLight(false); shot(); GFX.setShadows(false); shot(); GFX.setShadows(true); shot(); } catch (e) { threw = e; }
    check(!threw && GFX.simpleLight === false && !('mn-gfx-light' in store) && GFX.shadows === true && store['mn-gfx-shadows'] === '1', 'and back: full lighting, the shadows off and on again');
    check(typeof GFX.fps() === 'number', 'GFX.fps() is a number (the menu shows it)');
  }

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
