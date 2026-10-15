// Lit metal for the menus (main menu, game lobby, Locker / Shipyard): the DOM stays the source of
// truth for layout, clicks, keyboard focus and text; this draws the Blender-rendered UI kit
// (assets/ui/, tools/blender/models/ui/ui.py) underneath, from the elements' bounding boxes, and lights
// it like the ship: beauty × (ambient + the key light from the upper right with shadows), normal-mapped,
// with screen-space shadows marched through the pieces' heights (raised buttons throw a little shadow
// onto the plate). The hovered (or keyboard-focused) button lights up itself: brighter, with a warm
// glowing rim (no light following the mouse: playtesters found the moving lamp confusing). Pressed
// buttons sink in (the `_down` renders, lower, no shadow); chosen missions / gear stay latched in with
// a green LED; the chosen suit colour's lamp glows in its colour. Locked Locker / Shipyard choices are
// drawn dark and grey, with a padlock (DOM) where the LED would be.
//
// Own small WebGL2 renderer, not js/gfx.js: gfx.js draws the tilted world (atlas pages, world
// camera, tiled lights, last-frame shadows) and runs every game frame; the menu is flat screen-space
// panels that only need redrawing when something changes. Each layer (the lobby, and the shop over
// it) has its own fixed canvas behind its content with its own small WebGL2 context, so the shop can
// sit over a dimmed lobby and nothing is read back (no main-thread stalls).
//   Pass 1: every piece into a G-buffer (albedo; normal + height; emissive / specular / hover).
//   Pass 2: full-screen lighting with shadows, into the visible canvas.
// Redraws only on layout changes (MutationObserver, scroll, resize) and hover / press animations, capped by measured cost; nothing at all while a mission runs (both layers hidden).
//
// Without WebGL2, with ?classic or from file://: html.metal-css, the same textures as CSS
// border-images (index.html). html.metal-gl switches the DOM's own backgrounds off once loaded.
// Panelling that fits each plate: n panels across (and down) dividing its inner area evenly, each
// PANEL_MIN..PANEL_MAX CSS px (the fill tile stretches a little to fit), as few as possible, so a
// small plate has no seam through it. Inner area = the plate's box minus its 24 px frame.
const PANEL_MIN = 180, PANEL_MAX = 540, PLATE_FRAME = 28;   // (540: the menu plates stay one panel at desktop widths)
function panelGrid(w, h) {
  const fit = (L) => { const n = Math.max(1, Math.ceil(L / PANEL_MAX)); return L / n; };
  return [fit(Math.max(1, w - 2 * PLATE_FRAME)), fit(Math.max(1, h - 2 * PLATE_FRAME))];
}
// CSS look: the plates' fill background gets the same grid (border 3 px, so the inner area starts 25 px in)
function sizePanelsCss() {
  const plates = [...document.querySelectorAll('#lobby .plate, #shop .plate')];
  const fit = () => { for (const el of plates) { if (!el.offsetWidth) continue; const [tx, ty] = panelGrid(el.offsetWidth, el.offsetHeight);
    el.style.backgroundSize = `${tx.toFixed(2)}px ${ty.toFixed(2)}px`; el.style.backgroundPosition = `${PLATE_FRAME - 3}px ${PLATE_FRAME - 3}px`; } };
  if (window.ResizeObserver) { const ro = new ResizeObserver(fit); plates.forEach(el => ro.observe(el)); }
  addEventListener('resize', fit); fit();
}
const MenuGL = (() => {
  const off = { on: false, redraw() {} };
  if (typeof window === 'undefined' || typeof document === 'undefined' || !document.getElementById('lobby')) return off;
  const html = document.documentElement;
  html.classList.add('metal-css');
  sizePanelsCss();
  if (/[?&]classic\b/.test(location.search) || location.protocol === 'file:' || /[?&]nometal\b/.test(location.search)) return off;
  // one WebGL2 context per layer, drawing straight into that layer's canvas (no read-back: the
  // browser composites it off the main thread). `gl` / PG / PL / TEX / G point at the current one.
  const GLOPT = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false };
  let gl = null, PG = null, PL = null, TEX = {}, G = null;
  const use = (L) => { ({ gl, PG, PL, TEX } = L.cx); G = L.cx; gl.bindVertexArray(L.cx.vao); };

  // --- what is drawn for which element (first match wins) -------------------------------------------
  const RULES = [
    ['.plate', { kind: 'plate' }],
    ['#menu-games, #lobby-brief, #lobby-missions', { kind: 'inset' }],
    ['#lobby input', { kind: 'inset', scale: 0.55 }],
    ['#lobby-profile .bar', { kind: 'inset', scale: 0.3, flat: true }],
    ['.paint', { kind: 'swatch' }],
    ['#room-back, .game button.join', { kind: 'btns' }],
    ['button', { kind: 'btn' }],
  ];
  const SEL = RULES.map(r => r[0]).join(', ');
  const toneOf = (el) => (el.matches('#lobby-start') ? 'red' : 'steel');          // colour sparingly: one red button, the rest silver
  const latched = (el) => el.matches('.mission.chosen, .item.chosen, .paint.chosen');
  const hasLed = (el) => el.matches('.mission, #shop .item:not(.locked)');
  // decals on plates (ui.py: tape, tag_*): where on which plate. at: 'tr' / 'bl' corner (tape) or 'b' (on the bottom lip)
  const DECALS = [['#menu-you', [['tape', 'tr'], ['tag_crew', 'b']]], ['#menu-play', [['tag_ops', 'b']]],
                  ['#room .plate', [['tag_brief', 'b'], ['tape', 'bl']]], ['#shop .plate', [['tag_stores', 'b']]]];
  const LIP_TOP = 6.4;                                     // CSS px: the plate's lip above its panels

  // --- textures ------------------------------------------------------------------------------------
  let META = null, ready = false;
  const IMG = {};
  function loadImage(src) {
    return new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = bad; im.src = src; });
  }
  function upload(im, repeat) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const w = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
    return t;
  }
  async function load() {
    META = await (await fetch('assets/ui/ui.json')).json();
    await Promise.all(Object.entries(META.pieces).map(async ([name, p]) => {
      const [b, n, m] = await Promise.all([loadImage(`assets/ui/${name}.png`), loadImage(`assets/ui/${name}.nh.png`), p.mask ? loadImage(`assets/ui/${name}.m.png`) : null]);
      IMG[name] = { p, b, n, m };
    }));
    for (const L of layers) {
      use(L);
      for (const [name, I] of Object.entries(IMG)) TEX[name] = { p: I.p, b: upload(I.b, I.p.tile), n: upload(I.n, I.p.tile), m: I.m ? upload(I.m, false) : null };
    }
    ready = true;
    html.classList.remove('metal-css'); html.classList.add('metal-gl');
    for (const L of layers) L.dirty = true;
    kick();
  }

  // --- shaders -------------------------------------------------------------------------------------
  const VS = `#version 300 es
in vec2 aPos; uniform vec4 uRect; uniform vec2 uView;   // rect in device px (x, y top-down, w, h), view size
void main() { vec2 p = uRect.xy + aPos * uRect.zw; gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0); }`;
  const FS_G = `#version 300 es
precision highp float;
uniform sampler2D uB, uN, uB2, uN2, uM, uFB, uFN;
uniform vec4 uRect;            // device px
uniform vec2 uView;
uniform float uDpr, uMode;     // 0 nine-slice, 1 nine-slice with the fill tile in the centre, 2 whole sprite
uniform vec4 uSl;              // texture size, slice (tex px), border (CSS px), -
uniform vec2 uFillSz;          // one fill panel (CSS px; panelGrid())
uniform vec4 uZ;               // piece height 0 / 1 (CSS px), fill height 0 / 1
uniform vec4 uTint;            // rgb, amount (on the mask)
uniform vec4 uFx;              // press 0..1, dim 0..1 (locked: more), emissive, hover 0..1
uniform float uGlow;           // the tinted (masked) part glows in its colour: the chosen suit colour
uniform float uLod, uSpec, uRep;   // uRep: edges and centre repeat (whole periods, stretched to fit)
uniform vec2 uFillOrg;         // CSS px of the fill's origin inside the rect
layout(location = 0) out vec4 o0;
layout(location = 1) out vec4 o1;
layout(location = 2) out vec4 o2;
float sl(float p, float S, float B, float s, float T) {
  float b = min(B, S * 0.5), k = s / B;
  if (p < b) return p * k;
  if (p > S - b) return T - (S - p) * k;
  float f = (p - b) / max(S - 2.0 * b, 1e-3);
  if (uRep > 0.5) { float n = max(1.0, floor((S - 2.0 * b) / ((T - 2.0 * s) / k) + 0.5)); f = fract(f * n); }
  return s + f * (T - 2.0 * s);
}
void main() {
  vec2 dev = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y);
  vec2 p = (dev - uRect.xy) / uDpr, S = uRect.zw / uDpr;     // CSS px inside the element
  vec4 b, n; float z0 = uZ.x, z1 = uZ.y, glow = 0.0;
  float B = min(uSl.z, min(S.x, S.y) * 0.5);
  bool fill = uMode > 0.5 && uMode < 1.5 && p.x > B && p.x < S.x - B && p.y > B && p.y < S.y - B;
  if (fill) {
    vec2 uv = (p - uFillOrg) / uFillSz;
    b = textureLod(uFB, uv, uLod); n = textureLod(uFN, uv, uLod); z0 = uZ.z; z1 = uZ.w;
  } else {
    vec2 uv = uMode > 1.5 ? p / S : vec2(sl(p.x, S.x, uSl.z, uSl.y, uSl.x), sl(p.y, S.y, uSl.z, uSl.y, uSl.x)) / uSl.x;
    b = textureLod(uB, uv, uLod); n = textureLod(uN, uv, uLod);
    if (uFx.x > 0.0) { b = mix(b, textureLod(uB2, uv, uLod), uFx.x); n = mix(n, textureLod(uN2, uv, uLod), uFx.x); }
    if (uTint.w > 0.0) { float m = textureLod(uM, uv, uLod).r * uTint.w; b.rgb = mix(b.rgb, b.rgb * uTint.rgb * 1.08, m);
      if (uGlow > 0.0) {
        if (dot(uTint.rgb, vec3(0.3, 0.55, 0.15)) > 0.25) { b.rgb = mix(b.rgb, max(b.rgb, uTint.rgb * 0.75), m * uGlow); glow = 0.55 * m * uGlow; }   // (lit, but still its colour)
        else {                                   // black has no light: its glossy core stays black, a cool white ring glows round it
          float ring = m * smoothstep(0.42, 0.62, length(p / S - 0.5) * 2.0) * uGlow;
          b.rgb = mix(b.rgb, vec3(0.8, 0.86, 1.0), ring); glow = ring;
        } } }
  }
  float a = b.a;
  if (a < 0.003) discard;
  vec3 c = b.rgb;
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(c, vec3(l), min(1.0, 0.6 * uFx.y)) * (1.0 - 0.22 * uFx.y);
  c *= 1.0 - 0.26 * uFx.x;                                  // pushed in: in the bezel's shade
  float h = mix(z0, z1, n.b);
  float e = max(uFx.z * smoothstep(0.45, 0.9, max(c.r, max(c.g, c.b))), glow);
  // hover: the whole piece a little, its rim (outer few px; round pieces: the outer ring) a lot
  float rim = uMode > 1.5 ? smoothstep(0.55, 0.92, length(p / S - 0.5) * 2.0) : 1.0 - smoothstep(2.0, 7.0, min(min(p.x, S.x - p.x), min(p.y, S.y - p.y)));
  o0 = vec4(c * a, a);
  o1 = vec4(n.r * a, n.g * a, clamp(h / 64.0 + 0.5, 0.0, 1.0) * a, a);
  o2 = vec4(e * a, uSpec * (0.35 + 1.3 * l) * a, uFx.w * (0.45 + 0.55 * rim) * a, a);   // brighter metal (bolts, silver) shines more
}`;
  const NL = 8;
  const FS_L = `#version 300 es
precision highp float;
uniform sampler2D uG0, uG1, uG2;
uniform vec2 uView; uniform float uDpr;
uniform vec3 uKey; uniform vec3 uKeyCol; uniform vec3 uAmb;
uniform vec4 uLP[${NL}]; uniform vec4 uLC[${NL}];    // light: CSS px x, y, z, radius / rgb * intensity, shadows
uniform int uNL;
out vec4 outColor;
float H(vec2 css) { return (texture(uG1, vec2(css.x * uDpr, uView.y - css.y * uDpr) / uView).b - 0.5) * 64.0; }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// 0 = lit, 1 = fully in shadow: march from P towards the light over the height buffer
float shade(vec3 P, vec3 L, float maxd) {
  vec2 d = L.xy - P.xy; float dl = length(d);
  if (dl < 0.5) return 0.0;
  float slope = (L.z - P.z) / dl, occ = 0.0, j = ign(gl_FragCoord.xy);
  vec2 u = d / dl; float far = min(dl, maxd);
  for (int i = 1; i <= 8; i++) {
    float t = (float(i) - j) / 8.0 * far;
    float rz = P.z + slope * t;
    occ = max(occ, clamp((H(P.xy + u * t) - rz - 0.3) / (1.0 + 0.35 * t), 0.0, 1.0));   // penumbra widens away from the caster
  }
  return occ;
}
void main() {
  ivec2 ic = ivec2(gl_FragCoord.xy);
  vec4 g0 = texelFetch(uG0, ic, 0);
  if (g0.a < 0.003) { outColor = vec4(0.0); return; }
  vec4 g1 = texelFetch(uG1, ic, 0), g2 = texelFetch(uG2, ic, 0);
  vec3 alb = g0.rgb / g0.a;
  vec2 css = vec2(gl_FragCoord.x, uView.y - gl_FragCoord.y) / uDpr;
  vec3 N = vec3(g1.r * 2.0 - 1.0, -(g1.g * 2.0 - 1.0), 0.0);
  N.z = sqrt(max(1.0 - dot(N.xy, N.xy), 0.05)); N = normalize(N);
  float h = (g1.b - 0.5) * 64.0;
  vec3 P = vec3(css, h);
  // contact shading: lower than the surroundings -> a little darker
  float occl = 0.0;
  for (int i = 0; i < 5; i++) {
    float a = float(i) * 1.2566371 + ign(gl_FragCoord.xy) * 1.2;
    vec2 d = vec2(cos(a), sin(a));
    occl += max(H(css + d * 4.0) - h, 0.0) / 4.0 + max(H(css + d * 11.0) - h, 0.0) / 11.0;
  }
  float ao = clamp(1.0 - occl * 0.14, 0.42, 1.0);
  // key light (directional, upper right), relative to a flat surface so the baked look stays
  float ndl = max(dot(N, uKey), 0.0) / uKey.z;
  float ks = shade(P, P + uKey * (40.0 / max(length(uKey.xy), 0.01)), 40.0);
  vec3 light = uAmb * ao * (0.75 + 0.25 * N.z) + uKeyCol * mix(1.0, ndl, 0.6) * (1.0 - 0.92 * ks) * mix(1.0, ao, 0.5);
  vec3 spec = vec3(0.0);
  vec3 V = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < ${NL}; i++) {
    if (i >= uNL) break;
    vec4 lp = uLP[i], lc = uLC[i];
    vec3 L = lp.xyz - P; float dl = length(L);
    if (dl >= lp.w) continue;
    vec3 l = L / dl;
    float att = 1.0 - dl / lp.w; att *= att;
    float d = max((dot(N, l) + 0.15) / 1.15, 0.0);
    float sh = lc.w > 0.5 ? 1.0 - 0.85 * shade(P, lp.xyz, 60.0) : 1.0;
    light += lc.rgb * d * att * sh;
    vec3 hv = normalize(l + V);
    spec += lc.rgb * (pow(max(dot(N, hv), 0.0), 36.0) * 1.6 + pow(max(dot(N, hv), 0.0), 6.0) * 0.12) * att * sh;
  }
  float sk = g2.g / g0.a;
  vec3 hk = normalize(uKey + V);
  spec += uKeyCol * pow(max(dot(N, hk), 0.0), 50.0) * (1.0 - ks) * 0.8;
  vec3 c = alb * light + spec * sk * mix(vec3(1.0), alb * 2.5, 0.4) + alb * (g2.r / g0.a) * 1.4;
  float hv = g2.b / g0.a;                                      // hovered: brighter, with a warm glowing rim
  c = c * (1.0 + 0.4 * hv) + vec3(1.0, 0.8, 0.45) * 0.45 * max(hv - 0.45, 0.0) / 0.55;
  vec3 over = max(c - 0.9, 0.0);
  c = min(c, 0.9) + 0.1 * (1.0 - exp(-over / 0.1));
  outColor = vec4(c * g0.a, g0.a);
}`;
  function program(vs, fs) {
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('menugl shader: ' + gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('menugl link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function makeContext(canvas) {
    gl = canvas.getContext('webgl2', GLOPT);
    if (!gl) return null;
    try { PG = program(VS, FS_G); PL = program(VS, FS_L); } catch (e) { console.warn(e); return null; }
    const quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    return { gl, PG, PL, vao, TEX: {}, gW: 0, gH: 0, fbo: null, gTex: [] };
  }

  // G-buffer (3 × RGBA8 at the device size), per context
  function gbuffer(w, h) {
    if (w === G.gW && h === G.gH) return;
    G.gW = w; G.gH = h;
    if (!G.fbo) G.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo);
    const gTex = G.gTex;
    for (let i = 0; i < 3; i++) {
      if (gTex[i]) gl.deleteTexture(gTex[i]);
      const t = gTex[i] = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
    }
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // --- layers: the lobby (menu + game lobby) and the shop over it -----------------------------------
  const layers = ['lobby', 'shop'].map(id => {
    const root = document.getElementById(id);
    if (!root) return null;
    const c = document.createElement('canvas'); c.className = 'metal-layer'; c.setAttribute('aria-hidden', 'true');
    root.insertBefore(c, root.firstChild);
    const cx = makeContext(c);
    if (!cx) { c.remove(); return null; }
    return { root, c, cx, dirty: true, items: null, shown: false };
  }).filter(Boolean);
  if (!layers.length) return off;
  const visible = (L) => !L.root.hidden && L.root.getClientRects().length > 0;
  const topLayer = () => { for (let i = layers.length - 1; i >= 0; i--) if (visible(layers[i])) return layers[i]; return null; };

  // per-element animation state
  const ST = new WeakMap();
  const st = (el) => { let s = ST.get(el); if (!s) ST.set(el, s = { hover: 0, press: 0 }); return s; };
  let hoverEl = null, pressEl = null, keyFocus = null;

  function clipOf(el, root, cache) {
    let r = [0, 0, innerWidth, innerHeight];
    for (let a = el.parentElement; a && a !== root.parentElement; a = a.parentElement) {
      let c = cache.get(a);
      if (c === undefined) {
        const cs = getComputedStyle(a);
        c = cs.overflowY !== 'visible' || cs.overflowX !== 'visible' ? a.getBoundingClientRect() : null;
        if (c) { const bl = a.clientLeft, bt = a.clientTop; const m = a.matches('.plate') ? 20 : 3;   // (not over a plate's frame / an inset's rim)
          c = [c.left + bl + m, c.top + bt + m, c.left + bl + a.clientWidth - m, c.top + bt + a.clientHeight - m]; }
        cache.set(a, c);
      }
      if (c) r = [Math.max(r[0], c[0]), Math.max(r[1], c[1]), Math.min(r[2], c[2]), Math.min(r[3], c[3])];
    }
    return r;
  }
  function collect(L) {
    const out = [], cache = new Map(), bases = new Map();
    for (const el of L.root.querySelectorAll(SEL)) {
      if (!el.getClientRects().length) continue;
      const rule = RULES.find(r => el.matches(r[0]))[1];
      const r = el.getBoundingClientRect().toJSON();
      if (el.tagName === 'BUTTON' && el.matches(':active:not(:disabled)')) r.top -= 1;   // (the CSS nudges a pressed button's label 1 px)
      if (r.width < 2 || r.height < 2) continue;
      const clip = clipOf(el, L.root, cache);
      if (clip[2] <= clip[0] || clip[3] <= clip[1] || r.right < clip[0] || r.left > clip[2] || r.bottom < clip[1] || r.top > clip[3]) continue;
      let base = 0;                                         // the surface it sits on: a plate (0) or the floor of an inset
      for (let a = el.parentElement; a && a !== L.root; a = a.parentElement) if (bases.has(a)) { base = bases.get(a); break; }
      const it = { el, kind: rule.kind, scale: rule.scale || 1, flat: rule.flat, x: r.left, y: r.top, w: r.width, h: r.height, clip, base };
      if (it.kind === 'inset') bases.set(el, base - 16 * it.scale);   // (the inset's glass floor)
      else if (it.kind === 'plate') bases.set(el, base);
      const after = [];
      if (it.kind === 'plate') {
        const d = DECALS.find(([sel]) => el.matches(sel));
        for (const [name, at] of d ? d[1] : []) {
          const T = META.pieces[name]; if (!T || !IMG[name]) continue;
          const w = T.size / 2, h = (T.h || T.size) / 2;
          const cx = at === 'b' ? r.left + r.width / 2 : at === 'tr' ? r.right - 34 : r.left + 40;
          const cy = at === 'b' ? r.bottom - 14 : at === 'tr' ? r.top + 30 : r.bottom - 34;
          after.push({ el, kind: 'decal', name, scale: 1, x: cx - w / 2, y: cy - h / 2, w, h, clip, base: at === 'b' ? LIP_TOP : 0 });
        }
      }
      if (el.tagName === 'BUTTON') {
        it.tone = toneOf(el); it.latched = latched(el); it.led = hasLed(el);
        it.dim = el.matches('#shop .item.locked') ? 2.2                  // locked choices: clearly darker and grey
          : (el.disabled && !el.matches('.item.chosen')) || el.matches('#room.guest .mission:not(.chosen), .mission.locked') || parseFloat(getComputedStyle(el).opacity) < 0.9;   // (owned gear: latched, not dimmed)
        if (it.kind === 'swatch') it.tint = el.dataset.paint || getComputedStyle(el).backgroundColor;
      }
      out.push(it, ...after);
    }
    return out;
  }
  const hexRgb = (c) => {
    if (!c) return [1, 1, 1];
    let m = /^#([0-9a-f]{6})$/i.exec(c);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16) / 255);
    m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    return m ? [m[1] / 255, m[2] / 255, m[3] / 255] : [1, 1, 1];
  };

  const luma = (c) => 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2];
  // --- drawing -------------------------------------------------------------------------------------
  const KEY = (() => { const v = [0.34, -0.56, 0.76], l = Math.hypot(...v); return v.map(x => x / l); })();
  function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }
  function drawItem(it, dpr, W, H) {
    const u = PG.u, s = st(it.el);
    let name, mode = 0, spec = 0.8, emis = 0, press = 0, tint = null, glow = 0;
    if (it.kind === 'plate') { name = 'plate'; mode = 1; spec = 0.55; }
    else if (it.kind === 'decal') { name = it.name; mode = 2; spec = 0.5; }
    else if (it.kind === 'inset') { name = 'inset'; spec = 1.0; }
    else if (it.kind === 'swatch') { name = 'swatch'; mode = 2; tint = hexRgb(it.tint); press = Math.max(s.press, it.latched ? 1 : 0); glow = it.latched ? 1 : 0;
      spec = 0.8 + 3 * Math.max(0, 0.45 - luma(tint)); }   // (dark paint: glossier, so black reads as a black lamp, not a missing one)
    else { name = (it.kind === 'btns' ? 'btns' : 'btn') + (it.tone === 'red' ? '_red' : ''); spec = 1.0; press = Math.max(s.press, it.latched ? 0.85 : 0); }
    const T = TEX[name]; if (!T) return;
    const D = TEX[name + '_down'] || T, F = TEX.plate_fill, P = T.p, k = META.texPerCss, pz = 0;   // (heights in ui.json are already above the plate surface)
    const y = it.y;
    const x0 = Math.max(it.x, it.clip[0]), y0 = Math.max(y, it.clip[1]), x1 = Math.min(it.x + it.w, it.clip[2]), y1 = Math.min(y + it.h, it.clip[3]);
    if (x1 <= x0 || y1 <= y0) return;
    gl.scissor(Math.floor(x0 * dpr), Math.floor(H - y1 * dpr), Math.ceil((x1 - x0) * dpr), Math.ceil((y1 - y0) * dpr));
    gl.uniform4f(u.uRect, it.x * dpr, y * dpr, it.w * dpr, it.h * dpr);
    gl.uniform1f(u.uDpr, dpr); gl.uniform1f(u.uMode, mode);
    const border = mode === 2 ? 1 : (P.slice / k) * it.scale;
    gl.uniform4f(u.uSl, P.size, P.slice || 1, border, 0);
    const fs = mode === 1 ? panelGrid(it.w, it.h) : [256, 256];
    gl.uniform2f(u.uFillSz, fs[0], fs[1]);
    const zs = it.flat ? 0.5 : it.scale;
    gl.uniform4f(u.uZ, it.base + (P.zmin - pz) * zs, it.base + (P.zmax - pz) * zs, it.base + (F.p.zmin - pz), it.base + (F.p.zmax - pz));
    gl.uniform2f(u.uFillOrg, P.fillAt ? P.fillAt / k : border, P.fillAt ? P.fillAt / k : border);
    gl.uniform4f(u.uTint, ...(tint || [1, 1, 1]), tint ? 1 : 0);
    gl.uniform4f(u.uFx, press, +it.dim || 0, emis, s.hover); gl.uniform1f(u.uGlow, glow);
    gl.uniform1f(u.uLod, Math.max(0, Math.log2(k / (dpr * (mode === 2 ? it.w / (P.size / k) : it.scale)))));
    gl.uniform1f(u.uSpec, spec); gl.uniform1f(u.uRep, P.repeat ? 1 : 0);
    bindTex(0, T.b); bindTex(1, T.n); bindTex(2, D.b); bindTex(3, D.n); bindTex(4, T.m || T.b); bindTex(5, F.b); bindTex(6, F.n);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (it.led) {                                            // indicator lamp at the right, middle
      const Ld = TEX[it.latched ? 'led_on' : 'led_off']; if (!Ld) return;
      const sz = 16, lx = it.x + it.w - 25 - sz / 2, ly = y + it.h / 2 - sz / 2;
      gl.uniform4f(u.uRect, lx * dpr, ly * dpr, sz * dpr, sz * dpr); gl.uniform1f(u.uMode, 2);
      gl.uniform4f(u.uSl, Ld.p.size, 1, 1, 256);
      const top = it.base + (press ? 3 : 13) * it.scale;
      gl.uniform4f(u.uZ, top + Ld.p.zmin * 0.3, top + Ld.p.zmax * 0.3, 0, 0);   // (flattened: a lamp this small shouldn't smear the cap with shadow)
      gl.uniform4f(u.uTint, 1, 1, 1, 0); gl.uniform4f(u.uFx, 0, it.dim ? 0.6 : 0, Ld.p.emissive || 0, 0); gl.uniform1f(u.uGlow, 0);
      gl.uniform1f(u.uLod, Math.max(0, Math.log2(Ld.p.size / (sz * dpr)))); gl.uniform1f(u.uSpec, 1); gl.uniform1f(u.uRep, 0);
      bindTex(0, Ld.b); bindTex(1, Ld.n);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
  function lightsFor(items) {
    const out = [];
    for (const it of items) {                                  // chosen gear / missions: their green LED glows a little
      if (out.length >= NL) break;
      const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
      if (cx < it.clip[0] || cx > it.clip[2] || cy < it.clip[1] || cy > it.clip[3]) continue;   // scrolled out of its list
      if (it.led && it.latched) out.push([it.x + it.w - 25, it.y + it.h / 2, 10, 46, 0.12, 0.42, 0.26, 0]);
      else if (it.kind === 'swatch' && it.latched) { const t = hexRgb(it.tint), c = luma(t) > 0.25 ? t.map(v => 0.15 + 0.85 * v) : [0.62, 0.7, 0.95];   /* (black: a cool white light) */ out.push([it.x + it.w / 2, it.y + it.h / 2, 16, 52, c[0] * 1.1, c[1] * 1.1, c[2] * 1.1, 0]); }   // (its lamp lights the plate around it)
    }
    return out.slice(0, NL);
  }
  function render(L) {
    const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
    const dpr = Math.min(dpr0, Math.sqrt(4.2e6 / Math.max(1, innerWidth * innerHeight))) * res;   // res < 1: a slow GPU (software GL) gets fewer pixels
    const W = Math.max(1, Math.round(innerWidth * dpr)), H = Math.max(1, Math.round(innerHeight * dpr));
    use(L);
    if (L.c.width !== W || L.c.height !== H) { L.c.width = W; L.c.height = H; }
    if (L.dirty || !L.items) { L.items = collect(L); L.dirty = false; }
    gbuffer(W, H);
    // pass 1
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo); gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearBufferfv(gl.COLOR, 1, [0.5, 0.5, 0.5, 0]); gl.clearBufferfv(gl.COLOR, 2, [0, 0, 0, 0]);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.SCISSOR_TEST);
    gl.useProgram(PG.p); const u = PG.u;
    gl.uniform2f(u.uView, W, H);
    ['uB', 'uN', 'uB2', 'uN2', 'uM', 'uFB', 'uFN'].forEach((n, i) => gl.uniform1i(u[n], i));
    for (const it of L.items) drawItem(it, dpr, W, H);
    gl.disable(gl.SCISSOR_TEST); gl.disable(gl.BLEND);
    // pass 2
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(PL.p); const v = PL.u;
    gl.uniform4f(v.uRect, 0, 0, W, H); gl.uniform2f(v.uView, W, H); gl.uniform1f(v.uDpr, dpr);
    gl.uniform3f(v.uKey, ...KEY); gl.uniform3f(v.uKeyCol, 0.6, 0.58, 0.54); gl.uniform3f(v.uAmb, 0.42, 0.44, 0.5);
    const Ls = lightsFor(L.items);
    const lp = new Float32Array(NL * 4), lc = new Float32Array(NL * 4);
    Ls.forEach((l, i) => { lp.set(l.slice(0, 4), i * 4); lc.set(l.slice(4, 8), i * 4); });
    gl.uniform4fv(v.uLP, lp); gl.uniform4fv(v.uLC, lc); gl.uniform1i(v.uNL, Ls.length);
    ['uG0', 'uG1', 'uG2'].forEach((n, i) => { gl.uniform1i(v[n], i); bindTex(i, G.gTex[i]); });
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    L.shown = true;
  }

  // --- when to draw ----------------------------------------------------------------------------------
  let raf = 0, lastT = 0, cost = 0, res = 1;
  function kick() { if (!raf && ready) raf = requestAnimationFrame(frame); }
  function frame(t) {
    raf = 0;
    const top = topLayer();
    if (!top) { for (const L of layers) L.dirty = true; return; }   // a mission is running: nothing to do
    const minGap = Math.min(100, Math.max(0, cost * 1.5 - 16));    // slow (software GL): fewer frames
    if (t - lastT < minGap) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.1, (t - (lastT || t)) / 1000) || 0.016; lastT = t;
    let busy = false;
    for (const it of top.items || []) {                            // hover / press easing
      const s = st(it.el);
      const hT = (it.el === hoverEl || it.el === keyFocus) && !it.dim && !it.el.disabled && it.kind !== 'plate' && it.kind !== 'inset' ? 1 : 0;
      const pT = it.el === pressEl && !it.dim ? 1 : 0;
      const nh = s.hover + Math.sign(hT - s.hover) * Math.min(Math.abs(hT - s.hover), dt / 0.14);
      const np = s.press + Math.sign(pT - s.press) * Math.min(Math.abs(pT - s.press), dt / (pT ? 0.05 : 0.12));
      if (nh !== s.hover || np !== s.press) { s.hover = nh; s.press = np; busy = true; }
    }
    const need = busy || layers.some(L => L.dirty && visible(L));
    if (need) {
      const t0 = performance.now();
      for (const L of layers) {
        if (!visible(L)) continue;
        if (L === top || L.dirty || !L.shown) render(L);
      }
      cost = cost * 0.7 + (performance.now() - t0) * 0.3;
      if (cost > 40 && res > 0.35) { res = Math.max(0.35, res * 0.75); dirty(); }      // the text is DOM: the metal can go softer
      else if (cost < 10 && res < 1) res = Math.min(1, res * 1.2);
    }
    if (busy) raf = requestAnimationFrame(frame);
  }
  const dirty = () => { for (const L of layers) L.dirty = true; kick(); };
  const pieceAt = (target) => target && target.closest && target.closest('button, input');
  for (const L of layers) {
    new MutationObserver(dirty).observe(L.root, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'disabled', 'style'] });
    if (window.ResizeObserver) new ResizeObserver(dirty).observe(L.root);
  }
  addEventListener('resize', dirty);
  document.addEventListener('scroll', dirty, true);
  addEventListener('pointermove', (e) => {
    if (!ready || !topLayer()) return;
    const el = pieceAt(e.target);
    if (el !== hoverEl) { hoverEl = el; kick(); }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { hoverEl = null; kick(); });
  addEventListener('pointerdown', (e) => { if (!ready || !topLayer()) return; pressEl = pieceAt(e.target); dirty(); }, { passive: true });
  addEventListener('pointerup', () => { if (pressEl) { pressEl = null; dirty(); } }, { passive: true });
  addEventListener('pointercancel', () => { pressEl = null; kick(); });
  document.addEventListener('focusin', (e) => {                      // keyboard focus lights up like hover
    if (!ready || !topLayer()) return;
    const el = pieceAt(e.target);
    keyFocus = el && el.matches(':focus-visible') ? el : null;
    kick();
  });
  document.addEventListener('focusout', () => { keyFocus = null; kick(); });
  addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && keyFocus && document.activeElement === keyFocus) { pressEl = keyFocus; kick(); } });
  addEventListener('keyup', () => { if (pressEl && pressEl === keyFocus) { pressEl = null; kick(); } });
  for (const L of layers) L.c.addEventListener('webglcontextlost', (e) => {   // (back to the CSS look; no restore)
    e.preventDefault(); ready = false; html.classList.remove('metal-gl'); html.classList.add('metal-css');
    for (const M of layers) M.c.style.display = 'none';
  });
  load().catch((e) => { console.warn('menu metal: textures failed, CSS look', e); });
  return { on: true, redraw: dirty, get ready() { return ready; }, stats: () => ({ cost, res }) };
})();
