// WebGL2 sprite renderer for the pre-rendered Blender sprites (assets/sprites, format in
// tools/sprites/README.md). It draws on its own canvas UNDER the 2D canvas `c`; `c` stays on top
// as a transparent overlay (HUD, panels, prompts, text, effects). Everything here is a no-op when
// there is no WebGL2 (Node tests, the server's headless simulation, old browsers), with `?classic`
// in the URL, or when the page is opened as a file:// (textures can't be loaded there): then
// GFX.on is false and the game draws its old look.
//
// View: orthographic, 50° above the horizon, not rotated. A world point (x, y, z) in layout units
// (game y grows downwards, z up) lands on screen at  (x, y·sin50° − z·cos50°) × pixels-per-unit.
//
// Per frame (js/game.js render() does this):
//   GFX.begin(view, t)              view = camera(): { ox, oy, zoom, sy } in CSS px (see camera())
//   GFX.lighting({ ambient, sun, areas, lights })   see js/lights.js
//   GFX.sprite(name, frame, x, y, z, opts)          any number, any order (see below)
//   ctx = GFX.layer2d('back' | 'mid')               2D canvases composited into the GL picture
//   GFX.end()                                       draws it all
//
// GFX.sprite(name, frame, x, y, z = 0, opts) → true if drawn (false: unknown, or its atlas page is
// still loading — the first call starts loading it). `frame` indexes the sprite's frames
// (k = dir * frames + f; GFX.frameIndex(name, angle, f) computes it). (x, y, z) is the world point
// where the sprite's ground origin goes. opts (all optional):
//   layer     'under' | 'ground' | 'decal' | 'wall' | 'main' (default) | 'top'
//             under: before everything else (things outside, below / behind the hull: enemies, asteroids)
//             ground, decal: drawn first, in submission order, no depth (hull, floor tiles; decals)
//             wall: the ship's structure (walls, doors, airlocks, cannons): sorted by sortY, with
//               per-pixel depth from the height map; drawn BEFORE the 2D 'mid' layer, so old 2D
//               things mounted on walls (consoles, signs) stay visible on top of them
//             main: things that move (crew, ...): sorted, per-pixel depth (so the walls still hide
//               them where they should), drawn after the 'mid' layer
//             top: after everything, in submission order, no depth test
//   sortY     sort key in 'wall' / 'main' (default y). Ties keep submission order.
//   alpha     0..1                  tint   '#rrggbb' or [r, g, b] (0..1) for the tint mask
//   emissive  0..1: how much the brightest pixels light themselves (screens, lamps)
//   unlit     true: beauty as rendered, no lighting
//   scale     size multiplier       flip   true: mirrored horizontally around the origin
//   rot       screen rotation around the origin (rad, clockwise)   sx   stretch along the sprite's x
//   clip      [x0, y0, x1, y1, cz]: only the part of the sprite inside this world rectangle, taken
//             at height cz (default 0) — for tiles (null / ±Infinity = open side)
//   depthBias added to the pixel depth (+ = closer to the camera)   depthWrite  false: test only
//   billboard true: ignore the height map, the sprite is an upright plane through its origin (text
//             labels, steam: depth and lighting as if it stood at (x, y), rising from z)
//   desat     0..1: desaturate the beauty (a crew member who is out cold)
//   pick      [halfWidth, height] in screen units above the origin: GFX.pickAt() finds it
//
// Lighting (one place for it: js/lights.js gameLighting()):
//   GFX.lighting({ ambient: [r,g,b], sun: { dir: [x,y,z], color: [r,g,b], k }, areas: [{ x, y, w, h,
//     color: [r,g,b], sun }], lights: [...], grade: [r,g,b] })
//   A pixel's light = ambient of the area it lies in (the last area that contains it wins, soft
//   edges) + the sun × the area's sun factor + point lights (N·L from the normal map, smooth
//   falloff to `radius`). A light: { x, y, z, color, radius, intensity, wrap (0.22: how far light
//   wraps round the terminator), dir + cone (a spot: direction, half-angle in rad), x2, y2, z2 (a
//   strip from (x, y, z) to there), shadow (true: screen-space shadows) }. Up to MAX_LIGHTS on
//   screen, binned per screen tile (TILE_SLOTS - 1 strongest per tile); up to MAX_AREAS areas.
//   Shadows march through LAST frame's depth buffer (reprojected), so they cost no extra pass;
//   only solid, lit pixels below 1.75 above their origin cast them. ?noshadows / GFX.setShadows(false).
//   grade multiplies the final picture (unless GFX.end(post) passes its own).

// 2D layers: GFX.layer2d('back') is drawn first and unlit (space, things behind the ship);
// GFX.layer2d('mid') is drawn after the 'ground', 'decal' and 'wall' sprites and before 'main', lit
// like the floor (flat, at z = 0); GFX.layer2d('glow') right after it, unlit (markers, halos, energy
// glows: under the crew, but not dimmed by the dark). All are at the internal resolution and cleared on
// first use per frame; GFX.layer2dScale is their pixels per CSS px.
//
// Sprites drawn by the game: GFX.canvasSprite(key, w, h, { ppu, ox, oy }) → { name, ctx, w, h, commit() }
// (draw into ctx, commit() uploads it, then GFX.sprite(name, ...) like any sprite; flat normal, no height
// map: it lies at z, or stands up with { billboard: true }). GFX.text(text, font, fill, { outline, base,
// spacing, ppu }) → the name of a text label sprite (rasterized once per distinct label; font in world
// px, T = 48). Both return null when GFX is off.
//
// Internal resolution: min(1, 2048 / physical width) of the screen, upscaled with linear filtering;
// change it with ?gfxscale=0.75 (remembered) or GFX.setScale(k) (null = default).
// Other helpers: GFX.has(name), GFX.ready(name), GFX.info(name) (the sprites.json entry),
// GFX.frameIndex(name, angle, f), GFX.toScreen(x, y, z) (CSS px), GFX.lift(z) (how many ground-y
// units a height z shifts things up on screen; 0 in the classic view), GFX.pickAt(cssX, cssY), GFX.stats.

const GFX = (() => {
  const ELEV = 50 * Math.PI / 180, SIN = Math.sin(ELEV), COS = Math.cos(ELEV);
  const noop = () => {};
  const api = {
    on: false, reason: '', SIN, COS, layer2dScale: 1, stats: {},
    begin: noop, end: noop, sprite: () => false, lighting: noop, layer2d: () => null, canvasSprite: () => null, text: () => null,
    has: () => false, ready: () => false, info: () => null, frameIndex: () => 0, preload: noop,
    setScale: noop, setShadows: noop, toScreen: () => [0, 0], pickAt: () => null, disable: noop,
  };
  api.lift = (z) => (api.on ? z * COS / SIN : 0);    // 0 in the classic view
  const off = (why) => { api.reason = why; return api; };
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof document.createElement !== 'function') return off('no DOM');
  const search = (typeof location !== 'undefined' && location.search) || '';
  if (/[?&]classic\b/.test(search)) return off('?classic');
  if (typeof location !== 'undefined' && location.protocol === 'file:') return off('opened as a file (sprites need the server: node server.js)');
  if (typeof WebGL2RenderingContext === 'undefined') return off('no WebGL2');

  const glc = document.createElement('canvas');
  glc.id = 'gfx';
  const gl = glc.getContext('webgl2', { antialias: false, alpha: false, depth: true, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) return off('WebGL2 context failed');
  const hdr = !!gl.getExtension('EXT_color_buffer_float');
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  // Lights are binned per screen tile (tiled forward shading): MAX_LIGHTS on screen in all, up to
  // TILE_SLOTS - 1 per tile (the strongest win). Light data lives in a float texture (4 texels per
  // light), the per-tile index lists in an R8UI texture (slot 0 = count).
  const MAX_LIGHTS = 255, TILE_SLOTS = 32, MAX_AREAS = 24, DEPTH_SCALE = 1 / 200;
  const SHADOW_STEPS = 10;

  // --- shaders ------------------------------------------------------------------------------------
  const LIGHTING = `
uniform vec3 uAmbient;
uniform float uSunK;
uniform vec3 uSunDir, uSunCol;
uniform vec4 uAreaRect[${MAX_AREAS}];   // x0, y0, x1, y1
uniform vec4 uAreaCol[${MAX_AREAS}];    // rgb ambient, sun factor
uniform int uNumAreas;
uniform highp sampler2D uLights;        // per light (row): pos+radius, rgb*intensity+wrap, spot dir+cos, segment end+flags
uniform highp usampler2D uTiles;        // per tile: count, light indices
uniform ivec4 uTileInfo;                // tile size (device px), screen height (device px), shadows on, -
uniform highp sampler2D uDepthBuf;      // LAST frame's depth (y·cos + z·sin) of the front-most opaque surface per pixel
uniform vec4 uPrevCam;                  // last frame's device px of world (0, 0), device px per unit, 1 / its width
uniform vec2 uPrevInvH;                 // 1 / last frame's height, -
// Screen-space shadow: march from P towards the light through last frame's depth buffer (reprojected
// with last frame's camera, so panning doesn't smear). A sample is blocked when the surface seen
// at its pixel lies in front of it (towards the camera) by a little, but not by more than an
// object is thick. 1 = lit, 0 = in shadow.
float shadowRay(vec3 P, vec3 S) {
  float vis = 1.0;
  vec3 D = S - P;
  float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));   // per-pixel jitter
  float s1 = max(0.0, 1.0 - 0.45 / max(length(D), 1e-3));   // stop short of the light (its own lamp housing)
  for (int i = 0; i < ${SHADOW_STEPS}; i++) {
    float s = 0.02 + (float(i) + j) / ${SHADOW_STEPS}.0 * (s1 - 0.02);
    vec3 Q = P + D * s;
    vec2 uv = vec2((uPrevCam.x + Q.x * uPrevCam.z) * uPrevCam.w,
                   1.0 - (uPrevCam.y + (Q.y * ${SIN.toFixed(6)} - Q.z * ${COS.toFixed(6)}) * uPrevCam.z) * uPrevInvH.x);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    float front = texture(uDepthBuf, uv).r - (Q.y * ${COS.toFixed(6)} + Q.z * ${SIN.toFixed(6)});
    vis *= 1.0 - smoothstep(0.04, 0.14, front) * (1.0 - smoothstep(1.3, 2.2, front));
    if (vis < 0.02) break;
  }
  return vis;
}
vec3 lighting(vec3 P, vec3 N, out vec3 spec) {
  vec3 amb = uAmbient; float sk = uSunK;
  for (int i = 0; i < ${MAX_AREAS}; i++) {
    if (i >= uNumAreas) break;
    vec4 r = uAreaRect[i];
    float d = min(min(P.x - r.x, r.z - P.x), min(P.y - r.y, r.w - P.y));
    float w = clamp(d / 0.3 + 0.5, 0.0, 1.0);
    amb = mix(amb, uAreaCol[i].rgb, w); sk = mix(sk, uAreaCol[i].a, w);
  }
  vec3 acc = amb + uSunCol * sk * max(dot(N, uSunDir) * 0.75 + 0.25, 0.0);
  vec3 V = vec3(0.0, ${COS.toFixed(6)}, ${SIN.toFixed(6)});
  spec = vec3(0.0);
  ivec2 fc = ivec2(gl_FragCoord.xy);
  ivec2 tile = ivec2(fc.x / uTileInfo.x, (uTileInfo.y - 1 - fc.y) / uTileInfo.x);
  int c0 = tile.x * ${TILE_SLOTS};
  int n = int(texelFetch(uTiles, ivec2(c0, tile.y), 0).r);
  for (int k = 0; k < ${TILE_SLOTS - 1}; k++) {
    if (k >= n) break;
    int li = int(texelFetch(uTiles, ivec2(c0 + 1 + k, tile.y), 0).r);
    vec4 l0 = texelFetch(uLights, ivec2(0, li), 0), l3 = texelFetch(uLights, ivec2(3, li), 0);
    vec3 S = l0.xyz;
    float flags = l3.w;
    if (mod(flags, 2.0) > 0.5) {                     // a strip: the nearest point on the segment
      vec3 ab = l3.xyz - l0.xyz;
      S += ab * clamp(dot(P - l0.xyz, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    }
    vec3 L = S - P;
    float d = length(L);
    float a = clamp(1.0 - d / l0.w, 0.0, 1.0);
    if (a <= 0.0) continue;
    a = a * a * (1.0 + 0.6 / (1.0 + 3.0 * d * d));
    vec3 l = L / max(d, 1e-3);
    vec4 l1 = texelFetch(uLights, ivec2(1, li), 0), l2 = texelFetch(uLights, ivec2(2, li), 0);
    if (l2.w > -1.5) a *= smoothstep(l2.w, mix(l2.w, 1.0, 0.45), dot(-l, l2.xyz));   // spot cone
    float ndl = max((dot(N, l) + l1.w) / (1.0 + l1.w), 0.0);
    if (a * ndl <= 0.0) continue;
    if (uTileInfo.z > 0 && flags > 1.5) a *= shadowRay(P + N * 0.03, S);
    acc += l1.rgb * a * ndl;
    spec += l1.rgb * a * pow(max(dot(N, normalize(l + V)), 0.0), 28.0);
  }
  return acc;
}`;

  const VS_SPRITE = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 iScreen;   // origin on screen (device px), device px per canvas px, flip (+1 / -1)
layout(location = 2) in vec4 iQuad;     // drawn rect on the sprite canvas (canvas px)
layout(location = 3) in vec4 iBase;     // base (or whole frame) rect on the canvas
layout(location = 4) in vec4 iPatch;    // patch rect on the canvas (w = 0: none)
layout(location = 5) in vec4 iOff;      // canvas -> page px: base xy, patch zw
layout(location = 6) in vec4 iGround;   // world x, y, z of the origin; ppu
layout(location = 7) in vec4 iOrigin;   // origin on the canvas (ox, oy), object scale, depth bias
layout(location = 8) in vec4 iTint;     // rgb, strength
layout(location = 9) in vec4 iMisc;     // tint reference luminance, emissive, alpha, flags (1 unlit)
layout(location = 10) in vec4 iXf;      // screen rotation (rad, clockwise) around the origin, stretch along the sprite's x, desaturation, -
uniform vec2 uView;
out vec2 vLp;
flat out vec4 vBase, vPatch, vOff, vGround, vOrigin, vTint, vMisc;
flat out float vFlip, vRot, vDesat;
void main() {
  vec2 lp = iQuad.xy + aPos * iQuad.zw;
  vLp = lp;
  vec2 q = vec2((lp.x - iOrigin.x) * iScreen.w * iXf.y, lp.y - iOrigin.y) * iScreen.z;
  float cr = cos(iXf.x), sr = sin(iXf.x);
  vec2 p = iScreen.xy + vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr);
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  vBase = iBase; vPatch = iPatch; vOff = iOff; vGround = iGround; vOrigin = iOrigin; vTint = iTint; vMisc = iMisc; vFlip = iScreen.w * iXf.y; vRot = iXf.x; vDesat = iXf.z;
}`;

  const FS_SPRITE = `#version 300 es
precision highp float;
in vec2 vLp;
flat in vec4 vBase, vPatch, vOff, vGround, vOrigin, vTint, vMisc;
flat in float vFlip, vRot, vDesat;
uniform sampler2D uBeauty, uNormal, uHeight, uMask;
uniform vec2 uPage;        // page size (beauty px); the map pages are scaled copies with the same uv
uniform float uHasMask, uHR, uDepthScale;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outDepth;   // for next frame's screen-space shadows (see shadowRay)
${LIGHTING}
void main() {
  vec2 lp = vLp;
  vec2 gdx = dFdx(lp) / uPage, gdy = dFdy(lp) / uPage;      // gradients from the continuous canvas position (no seams at patch edges)
  vec2 tp;
  if (vPatch.z > 0.0 && all(greaterThanEqual(lp, vPatch.xy)) && all(lessThan(lp, vPatch.xy + vPatch.zw))) tp = lp + vOff.zw;
  else if (all(greaterThanEqual(lp, vBase.xy)) && all(lessThan(lp, vBase.xy + vBase.zw))) tp = lp + vOff.xy;
  else discard;
  vec2 uv = tp / uPage;
  vec4 b = textureGrad(uBeauty, uv, gdx, gdy);
  float alpha = b.a * vMisc.z;
  if (alpha < 0.01) discard;
  vec3 n = textureGrad(uNormal, uv, gdx, gdy).rgb * 2.0 - 1.0;
  float sc = vOrigin.z;
  float hz = textureGrad(uHeight, uv, gdx, gdy).r * uHR * sc;
  vec2 o = vec2(vFlip * (lp.x - vOrigin.x), lp.y - vOrigin.y) / vGround.w * sc;   // screen offset from the origin (units)
  if (vRot != 0.0) o = vec2(o.x * cos(vRot) - o.y * sin(vRot), o.x * sin(vRot) + o.y * cos(vRot));
  if (mod(floor(vMisc.w * 0.5), 2.0) > 0.5) hz = -o.y / ${COS.toFixed(6)};   // billboard: an upright plane through the origin
  vec3 P = vec3(vGround.x + o.x, vGround.y + (o.y + hz * ${COS.toFixed(6)}) / ${SIN.toFixed(6)}, vGround.z + hz);
  float depth = P.y * ${COS.toFixed(6)} + P.z * ${SIN.toFixed(6)} + vOrigin.w;   // larger = closer to the camera
  vec3 base = b.rgb;
  if (vTint.a > 0.0 && uHasMask > 0.5) {
    float m = textureGrad(uMask, uv, gdx, gdy).r * vTint.a;
    float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
    float ref = max(vMisc.x, 0.05);
    vec3 t = vTint.rgb * (lum / ref);
    t = mix(t, vec3(1.0), clamp(lum / ref - 1.3, 0.0, 0.6));   // keep specular glints white
    base = mix(base, t, m);
  }
  if (vDesat > 0.0) base = mix(base, vec3(dot(base, vec3(0.2126, 0.7152, 0.0722))), vDesat);
  vec3 col = base;
  if (mod(vMisc.w, 2.0) < 0.5) {
    vec3 N = vec3(n.x * sign(vFlip), -n.y, n.z);
    if (vRot != 0.0) N.xy = vec2(N.x * cos(vRot) - N.y * sin(vRot), N.x * sin(vRot) + N.y * cos(vRot));
    N = normalize(N);
    vec3 spec;
    vec3 acc = lighting(P, N, spec);
    float e = vMisc.y * smoothstep(0.62, 0.97, max(base.r, max(base.g, base.b)));
    col = base * acc + spec * 0.22;
    col = mix(col, base * 1.15, e);
  }
  gl_FragDepth = clamp(0.5 - depth * uDepthScale, 0.0, 1.0);
  outColor = vec4(col, alpha);
  // only solid, lit pixels below the ceiling cast shadows (not the hanging lamps and their cables)
  outDepth = vec4(depth - vOrigin.w, 0.0, 0.0, alpha > 0.6 && mod(vMisc.w, 2.0) < 0.5 && P.z - vGround.z < 1.75 ? 1.0 : 0.0);
}`;

  // A 2D canvas as a full-screen layer: 'back' unlit, 'mid' lit as a flat floor at z = 0.
  const VS_FULL = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUV;
void main() { vUV = aPos; gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;
  const FS_LAYER = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uLit, uEmissive;
uniform vec4 uCam;        // device px of world (0, 0), device px per unit (x), per unit (y on the ground)
uniform vec2 uView;
out vec4 outColor;
${LIGHTING}
void main() {
  vec4 c = texture(uTex, vec2(vUV.x, 1.0 - vUV.y));
  if (c.a < 0.004) discard;
  vec3 col = c.rgb;
  if (uLit > 0.5) {
    vec2 px = vec2(vUV.x, 1.0 - vUV.y) * uView;
    vec3 P = vec3((px.x - uCam.x) / uCam.z, (px.y - uCam.y) / uCam.w, 0.0);
    vec3 spec;
    vec3 acc = lighting(P, vec3(0.0, 0.0, 1.0), spec);
    float e = uEmissive * smoothstep(0.55, 0.95, max(col.r, max(col.g, col.b)));
    col = mix(col * acc + spec * 0.1, col, e);
  }
  outColor = vec4(col, c.a);
}`;
  const FS_BRIGHT = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform float uThreshold; out vec4 outColor;
void main() { vec3 c = texture(uTex, vUV).rgb; float l = max(c.r, max(c.g, c.b)); outColor = vec4(c * (max(l - uThreshold, 0.0) / max(l, 1e-4)), 1.0); }`;
  const FS_BLUR = `#version 300 es
precision highp float;
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 outColor;
void main() {
  vec3 s = texture(uTex, vUV).rgb * 0.2270270;
  s += (texture(uTex, vUV + uDir * 1.3846154).rgb + texture(uTex, vUV - uDir * 1.3846154).rgb) * 0.3162162;
  s += (texture(uTex, vUV + uDir * 3.2307692).rgb + texture(uTex, vUV - uDir * 3.2307692).rgb) * 0.0702703;
  outColor = vec4(s, 1.0);
}`;
  const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene, uBloom1, uBloom2;
uniform float uBloom;
uniform vec3 uGrade;
out vec4 outColor;
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  c += (texture(uBloom1, vUV).rgb * 0.8 + texture(uBloom2, vUV).rgb * 1.1) * uBloom;
  c *= uGrade;
  vec3 over = max(c - 0.85, 0.0);
  c = min(c, 0.85) + 0.15 * (1.0 - exp(-over / 0.15));   // soft shoulder instead of hard clipping
  outColor = vec4(c, 1.0);
}`;

  function program(vs, fs) {
    const mk = (type, src) => {
      const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh));
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  let P;
  try {
    P = { sprite: program(VS_SPRITE, FS_SPRITE), layer: program(VS_FULL, FS_LAYER), bright: program(VS_FULL, FS_BRIGHT),
          blur: program(VS_FULL, FS_BLUR), comp: program(VS_FULL, FS_COMPOSITE) };
  } catch (e) { console.warn('[gfx]', e); return off('shader error'); }
  for (const prog of [P.sprite, P.layer]) {          // the lighting's samplers live on units 4..6 (no clash with unit 0)
    gl.useProgram(prog.p); gl.uniform1i(prog.u.uLights, 4); gl.uniform1i(prog.u.uTiles, 5); gl.uniform1i(prog.u.uDepthBuf, 6);
  }

  // geometry: a unit quad (location 0) and the instance buffer (locations 1..10, 10 vec4 per instance)
  const INST = 10 * 4;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const instBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
  for (let i = 1; i <= 10; i++) { gl.enableVertexAttribArray(i); gl.vertexAttribDivisor(i, 1); }
  let inst = new Float32Array(INST * 1024), instCap = 0;
  const vaoFull = gl.createVertexArray();            // full-screen passes: just the quad
  gl.bindVertexArray(vaoFull);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  function pointInstances(first) {
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    for (let i = 0; i < 10; i++) gl.vertexAttribPointer(i + 1, 4, gl.FLOAT, false, INST * 4, (first * INST + i * 4) * 4);
  }

  // --- textures ---------------------------------------------------------------------------------------
  function texture(src, mips) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (src instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (mips && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    return t;
  }
  const flatNormal = texture(new Uint8Array([128, 128, 255, 255])), zero = texture(new Uint8Array([0, 0, 0, 255]));

  function target(w, h, withDepth, useHdr) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (useHdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    let rb = null;
    if (withDepth) {
      rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) { gl.deleteFramebuffer(fb); gl.deleteTexture(t); if (rb) gl.deleteRenderbuffer(rb); return null; }
    return { fb, t, rb, w, h };
  }
  let RT = null, useHdr = hdr;
  function freeT(x) { if (!x) return; gl.deleteFramebuffer(x.fb); gl.deleteTexture(x.t); if (x.rb) gl.deleteRenderbuffer(x.rb); }
  // Two R16F screen buffers, ping-ponged: this frame writes the depth of its solid pixels into one
  // (second colour attachment of the scene) while the lighting reads last frame's from the other.
  function depthTex(w, h) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.HALF_FLOAT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  function ensureTargets(w, h) {
    if (RT && RT.w === w && RT.h === h) return;
    if (RT) { for (const k of ['scene', 'a1', 'b1', 'a2', 'b2']) freeT(RT[k]); for (const t of RT.depth || []) gl.deleteTexture(t); }
    let scene = useHdr && target(w, h, true, true);
    if (!scene) { useHdr = false; scene = target(w, h, true, false); }
    const w1 = Math.max(1, w >> 1), h1 = Math.max(1, h >> 1), w2 = Math.max(1, w >> 3), h2 = Math.max(1, h >> 3);
    RT = { w, h, scene, a1: target(w1, h1, false, useHdr), b1: target(w1, h1, false, useHdr), a2: target(w2, h2, false, useHdr), b2: target(w2, h2, false, useHdr), depth: null, cur: 0 };
    prevCam = null;
    if (useHdr && shadowsWanted) {                     // shadows need a float colour attachment
      RT.depth = [depthTex(w, h), depthTex(w, h)];
      gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, RT.depth[0], 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, null, 0);
        for (const t of RT.depth) gl.deleteTexture(t);
        RT.depth = null;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }
  // Light data and the per-tile light lists (see LIGHTING)
  function dataTex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  const lightTex = dataTex(), tileTex = dataTex();
  const lightData = new Float32Array(4 * 4 * MAX_LIGHTS);
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 4, MAX_LIGHTS, 0, gl.RGBA, gl.FLOAT, lightData);
  let tileData = new Uint8Array(0), tileW = 0, tileH = 0, tileSize = 64;
  let prevCam = null, shadowsWanted = true;
  try { if (/[?&]noshadows\b/.test(search) || localStorage.getItem('mn-gfx-shadows') === '0') shadowsWanted = false; } catch (e) { /* no storage */ }

  // --- the sprite atlas: sprites.json + pages, loaded lazily per page --------------------------------
  let MAN = null, META = null, HR = 4;
  const PAGES = {};                     // 'group/i' -> { state: 'loading' | 'ready' | 'failed', w, h, maps, tex: {b, n, h, m}, img: {b, m} }
  const BASE_URL = 'assets/sprites/';
  function loadImage(url) {
    return new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('missing ' + url)); i.src = url; });
  }
  function page(group, i) {
    const key = group + '/' + i;
    let p = PAGES[key];
    if (p) return p;
    const m = META.pages[group][i];
    p = PAGES[key] = { state: 'loading', w: m.w, h: m.h, maps: m.maps || '', tex: {}, img: {} };
    const kinds = ['b', ...p.maps.split('')];
    Promise.all(kinds.map(k => loadImage(BASE_URL + m.file + (k === 'b' ? '' : '.' + k) + '.webp').catch(() => null))).then(imgs => {
      if (!imgs[0]) { p.state = 'failed'; console.warn('[gfx] missing page', key); return; }
      kinds.forEach((k, j) => { if (imgs[j]) { p.tex[k] = texture(imgs[j], k === 'b' || k === 'm'); if (k === 'b' || k === 'm') p.img[k] = imgs[j]; } });
      p.state = 'ready';
    });
    return p;
  }
  function pagesOf(S) {
    if (!S._pages) S._pages = [...new Set([...(S.f || []).filter(Boolean).map(f => f[0]), ...(S.bases || []).map(b => b[0])])];
    return S._pages;
  }
  function spriteReady(S) {
    if (S.dyn) return !!S.dyn.tex.b;
    let ok = true;
    for (const i of pagesOf(S)) if (page(S.group, i).state !== 'ready') ok = false;
    return ok;
  }
  // The tint mask recolours by luminance relative to the untinted mask area's mean (measured once).
  function tintRef(S) {
    if (S._tintRef != null) return S._tintRef;
    S._tintRef = 0.45;
    try {
      const fr = S.f.find(Boolean); if (!fr) return S._tintRef;
      const r = fr.length > 7 ? S.bases[fr[7]] : fr, p = page(S.group, r[0]);
      if (!p.img.b || !p.img.m) return S._tintRef;
      const c = document.createElement('canvas'); c.width = r[3]; c.height = r[4];
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(p.img.b, r[1], r[2], r[3], r[4], 0, 0, r[3], r[4]); const b = g.getImageData(0, 0, r[3], r[4]).data;
      g.clearRect(0, 0, r[3], r[4]); g.drawImage(p.img.m, r[1], r[2], r[3], r[4], 0, 0, r[3], r[4]); const m = g.getImageData(0, 0, r[3], r[4]).data;
      let s = 0, n = 0;
      for (let i = 0; i < b.length; i += 4) if (m[i] > 160 && b[i + 3] > 200) { s += (0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]) / 255; n++; }
      if (n > 20) S._tintRef = Math.max(0.12, s / n * 1.1);
    } catch (e) { /* tainted or not ready: keep the default */ }
    return S._tintRef;
  }

  const rgbCache = new Map();
  function rgb(c) {
    if (Array.isArray(c)) return c;
    let v = rgbCache.get(c);
    if (!v) {
      const h = c.replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
      v = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; rgbCache.set(c, v);
    }
    return v;
  }

  // --- sprites the game draws itself, at runtime: a 2D canvas each (text labels, steam, glows) ---------
  // GFX.canvasSprite(key, w, h, { ppu, ox, oy }) → { name, ctx, w, h, commit() }: draw into ctx, then
  // commit() uploads it; GFX.sprite(name, ...) draws it like any sprite (flat normal, no height: lying
  // at z, or upright with { billboard: true }). GFX.text(text, font, fill, { outline, base, ppu }) → a
  // sprite name for a text label (rasterized once per distinct label; font sizes in world px, T = 48).
  const DYNS = {}, DYN = {};
  function canvasSprite(key, w, h, o = {}) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    let D = DYN[key];
    if (D && (D.w !== w || D.h !== h)) { if (D.pg.tex.b) gl.deleteTexture(D.pg.tex.b); D = null; }
    if (!D) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const pg = { state: 'ready', w, h, maps: '', tex: {}, img: {} }, ox = o.ox != null ? o.ox : w / 2, oy = o.oy != null ? o.oy : h / 2;
      const name = 'dyn/' + key;
      const S = DYNS[name] = { name, group: 'dyn', dyn: pg, ppu: o.ppu || 96, w, h, ox, oy, dirs: 1, frames: 1, maps: '', f: [[0, 0, 0, w, h, ox, oy]] };
      D = DYN[key] = { name, S, pg, w, h, c, ctx: c.getContext('2d'), commit() {
        if (!api.on) return;
        if (!pg.tex.b) pg.tex.b = texture(c, true);
        else {
          gl.bindTexture(gl.TEXTURE_2D, pg.tex.b);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
        }
      } };
    }
    return D;
  }
  const TEXTS = new Map(), measure = document.createElement('canvas').getContext('2d');
  function text(str, font, fill, o = {}) {
    const key = [str, font, fill, o.outline || '', o.base || 'middle', o.spacing || 0, o.ppu || 120].join('|');
    let name = TEXTS.get(key);
    if (name) return name;
    const ppu = o.ppu || 120, k = ppu / 48, ow = o.outline ? (o.outlineWidth || 3) : 0;
    measure.font = font; measure.letterSpacing = (o.spacing || 0) + 'px';
    const m = measure.measureText(str), size = parseFloat((font.match(/([\d.]+)px/) || [0, 12])[1]);
    const pad = ow + 2, tw = m.width + pad * 2, th = size * 1.3 + pad * 2;
    const D = canvasSprite('t' + TEXTS.size, tw * k, th * k, { ppu, ox: tw * k / 2, oy: (o.base === 'bottom' ? th - pad : o.base === 'top' ? pad : th / 2) * k });
    const g = D.ctx;
    g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, tw, th);
    g.font = font; g.letterSpacing = (o.spacing || 0) + 'px'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const cy = th / 2 + size * 0.04;
    if (ow) { g.lineJoin = 'round'; g.lineWidth = ow; g.strokeStyle = o.outline; g.strokeText(str, tw / 2, cy); }
    g.fillStyle = fill; g.fillText(str, tw / 2, cy);
    D.commit();
    TEXTS.set(key, D.name);
    return D.name;
  }

  // --- frame state ----------------------------------------------------------------------------------
  const LAYERS = { under: -1, ground: 0, decal: 1, wall: 2, main: 3, top: 4 };
  let view = null, W = 1, H = 1, K = 1, Sdev = 1, camOX = 0, camOY = 0, frameNo = 0, active = false;
  let queue = [], seq = 0, picks = [], lastPicks = [];
  let light = { ambient: [1, 1, 1], sun: null, areas: [], lights: [] };
  let userScale = null;
  try { const q = search.match(/[?&]gfxscale=([\d.]+)/); if (q) { userScale = +q[1]; localStorage.setItem('mn-gfx-scale', q[1]); } else { const s = localStorage.getItem('mn-gfx-scale'); if (s) userScale = +s; } } catch (e) { /* no storage */ }

  // 2D layers composited into the GL picture
  const L2D = {};
  function layer2d(name) {
    if (!api.on) return null;
    let L = L2D[name];
    if (!L) {
      const c = document.createElement('canvas');
      L = L2D[name] = { c, g: c.getContext('2d'), tex: null, tw: 0, th: 0, used: -1 };
    }
    if (L.c.width !== W || L.c.height !== H) { L.c.width = W; L.c.height = H; }
    if (L.used !== frameNo) { L.used = frameNo; L.g.setTransform(1, 0, 0, 1, 0, 0); L.g.clearRect(0, 0, W, H); }
    return L.g;
  }
  function uploadLayer(L) {
    gl.bindTexture(gl.TEXTURE_2D, L.tex || (L.tex = gl.createTexture()));
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (L.tw !== W || L.th !== H) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, L.c);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      L.tw = W; L.th = H;
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, L.c);
  }

  function begin(v, t) {
    if (!api.on) return;
    view = v; frameNo++; active = true;
    const vw = Math.max(1, window.innerWidth), vh = Math.max(1, window.innerHeight), dpr = window.devicePixelRatio || 1;
    const scale = userScale || Math.min(1, 2048 / (vw * dpr));
    W = Math.max(1, Math.round(vw * dpr * scale)); H = Math.max(1, Math.round(vh * dpr * scale));
    if (glc.width !== W || glc.height !== H) { glc.width = W; glc.height = H; }
    glc.style.width = vw + 'px'; glc.style.height = vh + 'px';
    K = W / vw; api.layer2dScale = K;
    Sdev = 48 * v.zoom * K;                               // device px per layout unit (T = 48)
    camOX = v.ox * K; camOY = v.oy * K;
    queue.length = 0; seq = 0; picks = [];
    light = { ambient: [1, 1, 1], sun: null, areas: [], lights: [] };
  }
  function lighting(L) { if (api.on) light = Object.assign({ ambient: [1, 1, 1], sun: null, areas: [], lights: [] }, L); }
  function setShadows(on) {                          // screen-space shadows (default on; ?noshadows or GFX.setShadows(false) turns them off)
    shadowsWanted = !!on; RT && (RT.w = -1);         // rebuild the targets on the next frame
    try { localStorage.setItem('mn-gfx-shadows', on ? '1' : '0'); } catch (e) { /* no storage */ }
  }
  const toDev = (x, y, z) => [camOX + x * Sdev, camOY + (y * SIN - z * COS) * Sdev];

  function frameIndex(name, angle, f = 0) {
    const S = MAN && MAN[name]; if (!S) return 0;
    const dirs = S.dirs || 1, frames = S.frames || 1;
    const d = dirs > 1 ? ((Math.round(angle / (2 * Math.PI / dirs)) % dirs) + dirs) % dirs : 0;
    return d * frames + (((Math.floor(f) % frames) + frames) % frames);
  }

  function sprite(name, frame, x, y, z = 0, o = {}) {
    if (!api.on || !active) return false;
    const S = DYNS[name] || (MAN && MAN[name]); if (!S || !S.f || !S.f.length) return false;
    if (!spriteReady(S)) return false;
    const fr = S.f[frame] !== undefined ? S.f[frame] : S.f[((frame % S.f.length) + S.f.length) % S.f.length];
    if (!fr) return true;                              // an empty frame: nothing to draw
    const patch = fr.length > 7, b = patch ? S.bases[fr[7]] : fr;
    const bx = S.ox - b[5], by = S.oy - b[6];
    let qx0 = bx, qy0 = by, qx1 = bx + b[3], qy1 = by + b[4];
    let px = 0, py = 0, pw = 0, ph = 0;
    if (patch && fr[3] > 0) {
      px = S.ox - fr[5]; py = S.oy - fr[6]; pw = fr[3]; ph = fr[4];
      qx0 = Math.min(qx0, px); qy0 = Math.min(qy0, py); qx1 = Math.max(qx1, px + pw); qy1 = Math.max(qy1, py + ph);
    }
    const sc = o.scale || 1, flip = o.flip ? -1 : 1, ppu = S.ppu;
    if (o.clip) {                                      // world rect at height cz -> canvas px
      const [cx0, cy0, cx1, cy1, cz = 0] = o.clip, k = ppu / sc;
      if (cx0 != null && cx0 > -Infinity) { const v = S.ox + flip * (cx0 - x) * k; if (flip > 0) qx0 = Math.max(qx0, v); else qx1 = Math.min(qx1, v); }
      if (cx1 != null && cx1 < Infinity) { const v = S.ox + flip * (cx1 - x) * k; if (flip > 0) qx1 = Math.min(qx1, v); else qx0 = Math.max(qx0, v); }
      if (cy0 != null && cy0 > -Infinity) qy0 = Math.max(qy0, S.oy + ((cy0 - y) * SIN - (cz - z) * COS) * k);
      if (cy1 != null && cy1 < Infinity) qy1 = Math.min(qy1, S.oy + ((cy1 - y) * SIN - (cz - z) * COS) * k);
      if (qx1 <= qx0 || qy1 <= qy0) return true;
    }
    const [sx, sy] = toDev(x, y, z), k = Sdev / ppu * sc;
    // cull off screen
    const ex0 = flip > 0 ? sx + (qx0 - S.ox) * k : sx - (qx1 - S.ox) * k, ex1 = flip > 0 ? sx + (qx1 - S.ox) * k : sx - (qx0 - S.ox) * k;
    const ey0 = sy + (qy0 - S.oy) * k, ey1 = sy + (qy1 - S.oy) * k;
    if (o.pick) picks.push({ x, y, sortY: o.sortY != null ? o.sortY : y, x0: sx - o.pick[0] * Sdev, x1: sx + o.pick[0] * Sdev, y0: sy - o.pick[1] * Sdev, y1: sy + 0.15 * Sdev });
    if (!o.rot && !o.sx && (ex1 < 0 || ex0 > W || ey1 < 0 || ey0 > H)) return true;
    const t = o.tint ? rgb(o.tint) : null, useMask = !!t && (S.maps || '').includes('m');
    queue.push({
      layer: LAYERS[o.layer] ?? 3, sortY: o.sortY != null ? o.sortY : y, seq: seq++, page: S.dyn || page(S.group, b[0]), mask: useMask,
      d: [sx, sy, k, flip, qx0, qy0, qx1 - qx0, qy1 - qy0, bx, by, b[3], b[4], px, py, pw, ph,
          b[1] - bx, b[2] - by, patch ? fr[1] - px : 0, patch ? fr[2] - py : 0, x, y, z, ppu, S.ox, S.oy, sc, o.depthBias || 0,
          t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0, useMask ? 1 : 0, useMask ? tintRef(S) : 0.45, o.emissive || 0, o.alpha == null ? 1 : o.alpha, (o.unlit ? 1 : 0) + (o.billboard ? 2 : 0), o.rot || 0, o.sx || 1, o.desat || 0, 0],
      depthWrite: o.depthWrite !== false,
    });
    return true;
  }

  function setLightUniforms(u) {
    const L = light;
    gl.uniform3fv(u.uAmbient, L.ambient);
    const sun = L.sun, sd = sun && sun.dir ? sun.dir : [0, 0, 1], n = Math.hypot(...sd) || 1;
    gl.uniform3f(u.uSunDir, sd[0] / n, sd[1] / n, sd[2] / n);
    gl.uniform3fv(u.uSunCol, sun && sun.color ? sun.color : [0, 0, 0]);
    gl.uniform1f(u.uSunK, sun ? (sun.k == null ? 1 : sun.k) : 0);
    const areas = (L.areas || []).slice(0, MAX_AREAS), ar = new Float32Array(MAX_AREAS * 4), ac = new Float32Array(MAX_AREAS * 4);
    areas.forEach((a, i) => { ar.set([a.x, a.y, a.x + a.w, a.y + a.h], i * 4); ac.set([a.color[0], a.color[1], a.color[2], a.sun || 0], i * 4); });
    gl.uniform4fv(u.uAreaRect, ar); gl.uniform4fv(u.uAreaCol, ac); gl.uniform1i(u.uNumAreas, areas.length);
    const shadows = !!(RT && RT.depth && prevCam);
    gl.uniform4i(u.uTileInfo, tileSize, H, shadows ? 1 : 0, 0);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, lightTex); gl.uniform1i(u.uLights, 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, tileTex); gl.uniform1i(u.uTiles, 5);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, shadows ? RT.depth[1 - RT.cur] : zero); gl.uniform1i(u.uDepthBuf, 6);
    if (shadows) { gl.uniform4f(u.uPrevCam, prevCam[0], prevCam[1], prevCam[2], 1 / prevCam[3]); gl.uniform2f(u.uPrevInvH, 1 / prevCam[4], 0); }
    gl.activeTexture(gl.TEXTURE0);
  }
  // This frame's lights: drop the ones off screen, keep the MAX_LIGHTS strongest, write them into the
  // light texture and bin them into screen tiles (each tile keeps its TILE_SLOTS - 1 strongest).
  // A light: { x, y, z, color, radius, intensity, wrap (0.22), dir + cone (spot: direction it points,
  // half-angle in rad), x2, y2, z2 (a strip from (x, y, z) to there), shadow (true: casts shadows) }.
  function cullLights() {
    const vis = [];
    for (const l of light.lights || []) {
      const r = l.radius || 4, i = l.intensity == null ? 1 : l.intensity, c = l.color || [1, 1, 1];
      if (!(i > 0.001)) continue;
      const strip = l.x2 != null;
      const [ax, ay] = toDev(l.x, l.y, l.z || 0), [bx, by] = strip ? toDev(l.x2, l.y2, l.z2 == null ? l.z || 0 : l.z2) : [ax, ay], R = r * Sdev;
      const x0 = Math.min(ax, bx) - R, x1 = Math.max(ax, bx) + R, y0 = Math.min(ay, by) - R, y1 = Math.max(ay, by) + R;
      if (x1 < 0 || x0 > W || y1 < 0 || y0 > H) continue;
      vis.push({ l, r, i, c, strip, x0, x1, y0, y1, w: i * Math.max(c[0], c[1], c[2]) * (1 + r * 0.1) });
    }
    vis.sort((a, b) => b.w - a.w);
    if (vis.length > MAX_LIGHTS) vis.length = MAX_LIGHTS;
    tileSize = Math.max(32, Math.ceil(W / 40), Math.ceil(H / 40));
    const tx = Math.ceil(W / tileSize), ty = Math.ceil(H / tileSize);
    if (tx * TILE_SLOTS !== tileW || ty !== tileH) { tileW = tx * TILE_SLOTS; tileH = ty; tileData = new Uint8Array(tileW * tileH); }
    else tileData.fill(0);
    vis.forEach((v, k) => {
      const l = v.l, o = k * 16, d = l.dir;
      lightData[o] = l.x; lightData[o + 1] = l.y; lightData[o + 2] = l.z || 0; lightData[o + 3] = v.r;
      lightData[o + 4] = v.c[0] * v.i; lightData[o + 5] = v.c[1] * v.i; lightData[o + 6] = v.c[2] * v.i; lightData[o + 7] = l.wrap == null ? 0.22 : l.wrap;
      if (d && l.cone) { const n = Math.hypot(d[0], d[1], d[2]) || 1; lightData[o + 8] = d[0] / n; lightData[o + 9] = d[1] / n; lightData[o + 10] = d[2] / n; lightData[o + 11] = Math.cos(l.cone); }
      else { lightData[o + 8] = 0; lightData[o + 9] = 0; lightData[o + 10] = -1; lightData[o + 11] = -2; }
      lightData[o + 12] = v.strip ? l.x2 : l.x; lightData[o + 13] = v.strip ? l.y2 : l.y; lightData[o + 14] = v.strip ? (l.z2 == null ? l.z || 0 : l.z2) : l.z || 0;
      lightData[o + 15] = (v.strip ? 1 : 0) + (l.shadow ? 2 : 0);
      const i0 = Math.max(0, Math.floor(v.x0 / tileSize)), i1 = Math.min(tx - 1, Math.floor(v.x1 / tileSize));
      const j0 = Math.max(0, Math.floor(v.y0 / tileSize)), j1 = Math.min(ty - 1, Math.floor(v.y1 / tileSize));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c0 = j * tileW + i * TILE_SLOTS, n = tileData[c0];
        if (n < TILE_SLOTS - 1) { tileData[c0 + 1 + n] = k; tileData[c0] = n + 1; }
      }
    });
    gl.bindTexture(gl.TEXTURE_2D, lightTex);
    if (vis.length) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4, vis.length, gl.RGBA, gl.FLOAT, lightData, 0);
    gl.bindTexture(gl.TEXTURE_2D, tileTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, tileW, tileH, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, tileData);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    api.stats.lights = vis.length;
  }

  function drawLayer2d(name, lit) {
    const L = L2D[name];
    if (!L || L.used !== frameNo) return;
    uploadLayer(L);
    const u = P.layer.u;
    gl.bindVertexArray(vaoFull);
    gl.useProgram(P.layer.p);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L.tex); gl.uniform1i(u.uTex, 0);
    gl.uniform1f(u.uLit, lit ? 1 : 0); gl.uniform1f(u.uEmissive, 0.45);
    gl.uniform4f(u.uCam, camOX, camOY, Sdev, Sdev * SIN); gl.uniform2f(u.uView, W, H);
    if (lit) setLightUniforms(u);
    if (RT.depth) gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.NONE]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (RT.depth) gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  }

  function drawQueue(items) {
    if (!items.length) return;
    gl.bindVertexArray(vao);
    if (instCap < items.length) { instCap = Math.max(items.length, instCap * 2, 256); inst = new Float32Array(INST * instCap); }
    items.forEach((it, i) => inst.set(it.d, i * INST));
    gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
    gl.bufferData(gl.ARRAY_BUFFER, inst.subarray(0, items.length * INST), gl.STREAM_DRAW);
    const u = P.sprite.u;
    let i = 0;
    while (i < items.length) {
      const a = items[i];
      let j = i + 1;
      while (j < items.length && items[j].page === a.page && items[j].layer === a.layer && items[j].depthWrite === a.depthWrite) j++;
      const depth = a.layer === 2 || a.layer === 3;
      if (depth) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(a.depthWrite); }
      else { gl.disable(gl.DEPTH_TEST); gl.depthMask(false); }
      const p = a.page;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, p.tex.b);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, p.tex.n || flatNormal);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, p.tex.h || zero);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, p.tex.m || zero);
      gl.uniform2f(u.uPage, p.w, p.h); gl.uniform1f(u.uHasMask, p.tex.m ? 1 : 0);
      pointInstances(i);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, j - i);
      api.stats.batches++;
      i = j;
    }
  }

  function fullPass(prog, dst, setup) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H);
    gl.useProgram(prog.p); setup(prog.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }

  function end(post = {}) {
    if (!api.on || !active) return;
    active = false;
    const t0 = performance.now();
    api.stats = { sprites: queue.length, batches: 0, lights: 0 };
    lastPicks = picks;
    ensureTargets(W, H);
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, RT.scene.fb);
    gl.viewport(0, 0, W, H);
    gl.clearDepth(1); gl.depthMask(true);
    if (RT.depth) {
      RT.cur = 1 - RT.cur;                              // write into one, read last frame's from the other
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, RT.depth[RT.cur], 0);
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
      gl.clearBufferfv(gl.COLOR, 0, [0.02, 0.025, 0.04, 1]);
      gl.clearBufferfv(gl.COLOR, 1, [-1000, 0, 0, 0]);
      gl.clear(gl.DEPTH_BUFFER_BIT);
    } else {
      gl.clearColor(0.02, 0.025, 0.04, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    cullLights();
    const u = P.sprite.u;
    gl.useProgram(P.sprite.p);
    gl.uniform2f(u.uView, W, H); gl.uniform1f(u.uHR, HR); gl.uniform1f(u.uDepthScale, DEPTH_SCALE);
    gl.uniform1i(u.uBeauty, 0); gl.uniform1i(u.uNormal, 1); gl.uniform1i(u.uHeight, 2); gl.uniform1i(u.uMask, 3);
    setLightUniforms(u);
    const by = (l) => queue.filter(q => q.layer === l);
    const ground = [...by(-1), ...by(0), ...by(1)];
    const sorted = (l) => by(l).sort((a, b) => a.sortY - b.sortY || a.seq - b.seq);
    drawLayer2d('back', false);
    gl.useProgram(P.sprite.p); drawQueue(ground);
    gl.useProgram(P.sprite.p); drawQueue(sorted(2));
    drawLayer2d('mid', true);
    drawLayer2d('glow', false);
    gl.useProgram(P.sprite.p); drawQueue(sorted(3));
    gl.useProgram(P.sprite.p); drawQueue(by(4));
    // bloom + composite
    gl.bindVertexArray(vaoFull);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
    const thr = post.threshold == null ? 0.85 : post.threshold;
    fullPass(P.bright, RT.a1, (u) => { bindTex(0, RT.scene.t); gl.uniform1i(u.uTex, 0); gl.uniform1f(u.uThreshold, thr); });
    for (let i = 0; i < 2; i++) {
      fullPass(P.blur, RT.b1, (u) => { bindTex(0, RT.a1.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 1.5 / RT.a1.w, 0); });
      fullPass(P.blur, RT.a1, (u) => { bindTex(0, RT.b1.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 0, 1.5 / RT.a1.h); });
    }
    fullPass(P.blur, RT.a2, (u) => { bindTex(0, RT.a1.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 1 / RT.a1.w, 0); });
    fullPass(P.blur, RT.b2, (u) => { bindTex(0, RT.a2.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 1.2 / RT.a2.w, 0); });
    fullPass(P.blur, RT.a2, (u) => { bindTex(0, RT.b2.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 0, 1.2 / RT.a2.h); });
    fullPass(P.comp, null, (u) => {
      bindTex(0, RT.scene.t); bindTex(1, RT.a1.t); bindTex(2, RT.a2.t);
      gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uBloom1, 1); gl.uniform1i(u.uBloom2, 2);
      gl.uniform1f(u.uBloom, post.bloom == null ? 0.55 : post.bloom); gl.uniform3fv(u.uGrade, post.grade || light.grade || [1, 1, 1]);
    });
    prevCam = RT.depth ? [camOX, camOY, Sdev, W, H] : null;
    api.stats.ms = +(performance.now() - t0).toFixed(2);
  }

  // The front-most picked sprite under a CSS-px point → its ground point [x, y] (or null).
  function pickAt(cx, cy) {
    const x = cx * K, y = cy * K;
    let best = null;
    for (const p of lastPicks) if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1 && (!best || p.sortY > best.sortY)) best = p;
    return best ? [best.x, best.y] : null;
  }

  function disable(why) {
    if (!api.on) return;
    api.on = false; api.reason = why; console.warn('[gfx] off:', why);
    if (glc.parentNode) glc.parentNode.removeChild(glc);
  }

  Object.assign(api, {
    on: true, gl, begin, end, sprite, lighting, layer2d, frameIndex, pickAt, disable, setShadows, canvasSprite, text,
    has: (name) => !!(DYNS[name] || (MAN && MAN[name] && MAN[name].f && MAN[name].f.length)),
    ready: (name) => !!(DYNS[name] ? spriteReady(DYNS[name]) : MAN && MAN[name] && spriteReady(MAN[name])),
    info: (name) => DYNS[name] || (MAN && MAN[name]) || null,
    preload: (groups) => { if (META) for (const g of groups) (META.pages[g] || []).forEach((_, i) => page(g, i)); },
    setScale: (k) => { userScale = k || null; try { if (k) localStorage.setItem('mn-gfx-scale', String(k)); else localStorage.removeItem('mn-gfx-scale'); } catch (e) { /* no storage */ } },
    toScreen: (x, y, z = 0) => { const [sx, sy] = toDev(x, y, z); return [sx / K, sy / K]; },
    get manifest() { return MAN; },
  });

  // put the GL canvas under the 2D canvas
  glc.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;pointer-events:none;z-index:0';
  const c2d = document.getElementById('c');
  if (c2d) { c2d.style.position = 'fixed'; c2d.style.left = '0'; c2d.style.top = '0'; c2d.style.zIndex = '1'; c2d.parentNode.insertBefore(glc, c2d); }
  else document.body.appendChild(glc);
  glc.addEventListener('webglcontextlost', (e) => { e.preventDefault(); disable('WebGL context lost'); });

  fetch(BASE_URL + 'sprites.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(d => {
    MAN = d.sprites; META = d.meta; HR = META.heightRange || 4;
    for (const k in MAN) MAN[k].name = k;
    api.preload(['hull', 'interior', 'ship', 'crew']);
  }).catch(e => disable('sprites.json: ' + e.message));

  return api;
})();
