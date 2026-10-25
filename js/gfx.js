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
//   recolor   '#rrggbb': the saturated cyan / green pixels (energy glows) take this colour (no mask needed)
//   emissive  0..1: how much the brightest pixels light themselves (screens, lamps)
//   unlit     true: beauty as rendered, no lighting
//   scale     size multiplier       flip   true: mirrored horizontally around the origin
//   rot       screen rotation around the origin (rad, clockwise) = the object turned about the view axis
//             (normals and heights turn with it, so the lighting stays put)   sx   stretch along the sprite's x
//   clip      [x0, y0, x1, y1, cz]: only the part of the sprite inside this world rectangle, taken
//             at height cz (default 0) — for tiles (null / ±Infinity = open side)
//   depthBias added to the pixel depth (+ = closer to the camera)   depthWrite  false: test only
//   billboard true: ignore the height map, the sprite is an upright plane through its origin (text
//             labels, steam: depth and lighting as if it stood at (x, y), rising from z)
//   desat     0..1: desaturate the beauty (a crew member who is out cold)
//   pick      [halfWidth, height] in screen units above the origin: GFX.pickAt() finds it
//   floor     [layout, wear top-left, top-right, bottom-left, bottom-right]: a 2 x 2 floor tile; the
//             shader draws procedural scratches, gouges and duct tape on it (FLOOR_WEAR; layout 1 / 2 /
//             3 = tile layout a / b / all tread). Off with ?noscratch or GFX.setScratches(false) (remembered).
//             Then optionally the walk field per plate cell (js/walkfield.js walkFieldPacked(), order as the
//             wear): part of the hairlines follow it (FW_PATH). Off with ?nopathscratch or GFX.setPathScratches(false).
//
// Lighting (one place for it: js/lights.js gameLighting()):
//   GFX.lighting({ ambient: [r,g,b], sun: { dir: [x,y,z], color: [r,g,b], k }, areas: [{ x, y, w, h,
//     color: [r,g,b], sun }], lights: [...], grade: [r,g,b] })
//   A pixel's light = ambient of the area it lies in (the last area that contains it wins, soft
//   edges) + the sun × the area's sun factor + point lights (N·L from the normal map, smooth
//   falloff to `radius`). A light: { x, y, z, color, radius, intensity, wrap (0.22: how far light
//   wraps round the terminator), dir + cone (a spot: direction, half-angle in rad), x2, y2, z2 (a
//   strip from (x, y, z) to there), shadow (true: screen-space shadows), size (the light's radius for
//   the shadows' penumbra; default 0.08, spots 0.04) }. Up to MAX_LIGHTS on
//   screen, binned per screen tile (TILE_SLOTS - 1 strongest per tile); up to MAX_AREAS areas.
//   Shadows march through THIS frame's depth buffer: a depth pre-pass (depthPass) draws every sprite
//   once with a cheap shader (alpha + height map, no lighting) before anything is lit, so a moving
//   caster's shadow never lags a frame behind it. Only solid, lit pixels below 1.75 above their origin
//   cast them. They are soft: then a half-resolution pass marches one
//   ray per pixel and light (to a random point of the light's disc: penumbra) into a visibility
//   channel per light (overlapping lights get different ones; up to 28), a depth-aware blur turns the
//   noise into smooth edges, and the lighting reads it back depth-aware (marching per pixel only
//   where the half-res buffer doesn't show the surface: see-through or thin slivers). ?noshadows /
//   GFX.setShadows(false).
//   grade multiplies the final picture (unless GFX.end(post) passes its own).
//   walls: [[x0, y0, x1, y1], ...] (up to MAX_WALLS; height wallHeight, default 1.6): vertical planes that
//   block every light (wallVis): the walls the camera sees over (cut down) but the light must not get past.

// Backdrop: GFX.backdrop({ base: [r, g, b], glows: [[x, y, radius, r, g, b, a], ...], rects, n }) paints
// space behind everything, in GL (before the 'back' layer): the base colour, up to 4 soft radial glows
// (colour, alpha a at the centre, to transparent black at the radius, as a 2D canvas gradient would), then n small rects (rects: x, y, w, h,
// r, g, b, a per rect; stars, and streaks while jumping). All in CSS px, colours 0..1. (js/art.js drawSpace
// used to fill the 'back' canvas with them: in a browser without accelerated 2D canvases, Firefox here,
// those full-screen gradients alone took ~10 ms a frame.)
//
// Screen overlays: GFX.overlay(cx, cy, r0, r1, stops) → true when queued (else draw it yourself: GFX off, or
// more than MAX_OV this frame): a full-screen radial gradient (CSS px; a 2D canvas radialGradient from r0 to
// r1 around (cx, cy), stops [[t, [r, g, b] 0..255, a], ...], up to 3; one stop: a flat tint), composited over
// the finished picture in the order queued. It lies UNDER everything on the 2D canvas `c`. For the edge glows
// and tints (the jump drive, injuries, the flare): a full-screen gradient on a 4K 2D canvas took ~12 ms in Firefox.
// (art.js screenGradient() / screenTint() use it, or the canvas.)
//
// 2D layers: GFX.layer2d('back') is drawn first and unlit (space, things behind the ship);
// GFX.layer2d('mid') is drawn after the 'ground', 'decal' and 'wall' sprites and before 'main', lit
// like the floor (flat, at z = 0); GFX.layer2d('glow') right after it, unlit (markers, halos, energy
// glows: under the crew, but not dimmed by the dark). All are at the internal resolution and cleared on
// first use per frame; GFX.layer2dScale is their pixels per CSS px. Only what was drawn is cleared, uploaded
// and composited: each layer's context tracks the box its drawing covers (trackDirty()), so a layer with
// a few markers costs next to nothing (a full-screen 2D canvas upload took ~3-5 ms a layer in Firefox; see READBACK).
//
// Sprites drawn by the game: GFX.canvasSprite(key, w, h, { ppu, ox, oy }) → { name, ctx, w, h, commit() }
// (draw into ctx, commit() uploads it, then GFX.sprite(name, ...) like any sprite; flat normal, no height
// map: it lies at z, or stands up with { billboard: true }). With { maps: true } it also gets a normal and a
// height map: D.nmap / D.hmap (RGBA bytes, w × h, encoded like the Blender passes: rgb = n·0.5 + 0.5 with
// x right, y up the screen, z up; height r = z / heightRange (GFX.heightRange) · 255), uploaded by commit()
// while D.mapsDirty (set it again after changing them).
// GFX.text(text, font, fill, { outline, base, spacing, ppu }) → the name of a text label sprite (rasterized once per distinct label; font in world
// px, T = 48). Both return null when GFX is off.
//
// Shield domes: GFX.dome({ c: [x, y, z], r: [rx, ry, rz], out: [ox, oy], fade: [s0, s1], grow: [x, y, z, R],
// color: [r, g, b], strength, time, cell, hits: [{ x, y, z, age (0..1), heavy }] }) queues a hexagon-tiled
// energy shell for this frame: the upper half (z ≥ 0) of the ellipsoid (centre c, radii r) on the side
// `out` points to (q·out from s0 (gone) to s1 (full), q the point in the unit sphere's coordinates),
// shown within R of the emitter at grow. Drawn after all sprites (before the bloom), additive, unlit,
// depth-tested against the walls and the crew; up to 8 impacts flare the cells around them and ripple.

// Internal resolution: min(1, 2048 / physical width) of the screen, upscaled with linear filtering;
// change it with ?gfxscale=0.75 (remembered) or GFX.setScale(k) (null = default).
// Other helpers: GFX.has(name), GFX.ready(name), GFX.info(name) (the sprites.json entry),
// GFX.frameIndex(name, angle, f), GFX.toScreen(x, y, z) (CSS px), GFX.onScreen(x, y, z, r) (can anything within r of it show), GFX.lift(z) (how many ground-y
// units a height z shifts things up on screen; 0 in the classic view), GFX.pickAt(cssX, cssY), GFX.stats.

const GFX = (() => {
  const ELEV = 50 * Math.PI / 180, SIN = Math.sin(ELEV), COS = Math.cos(ELEV);
  const noop = () => {};
  const api = {
    on: false, reason: '', SIN, COS, layer2dScale: 1, stats: {},
    begin: noop, end: noop, sprite: () => false, lighting: noop, backdrop: noop, overlay: () => false, dome: noop, layer2d: () => null, canvasSprite: () => null, text: () => null,
    has: () => false, ready: () => false, info: () => null, frameIndex: () => 0, preload: noop, stream: noop, streaming: () => 0,
    setScale: noop, setShadows: noop, setScratches: noop, setPathScratches: noop, toScreen: () => [0, 0], onScreen: () => true, pickAt: () => null, disable: noop,
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
  const floatBlend = !!gl.getExtension('EXT_float_blend');   // the depth buffer for the shadows can be 32-bit (it is drawn with blending)
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  // Lights are binned per screen tile (tiled forward shading): MAX_LIGHTS on screen in all, up to
  // TILE_SLOTS - 1 per tile (the strongest win). Light data lives in a float texture (4 texels per
  // light), the per-tile index lists in an R8UI texture (slot 0 = count).
  const MAX_LIGHTS = 255, TILE_SLOTS = 32, MAX_AREAS = 24, MAX_WALLS = 16, DEPTH_SCALE = 1 / 200;
  // Shadows: one ray per pixel per light, SHADOW_STEPS samples, aimed at a random point of the light's
  // disc (size): computed at 1/SH_DIV resolution into SH_CH visibility channels (the RGBA of SH_LAYERS layers of an array texture),
  // blurred depth-aware, then read back depth-aware by the lighting (see shadowPass()).
  const SHADOW_STEPS = 12, SHADOW_STEPS_MARCH = 7, SH_DIV = 2, SH_BLUR = 4, LIGHT_TEXELS = 5;
  const SH_LAYERS = Math.max(1, Math.min(7, (gl.getParameter(gl.MAX_DRAW_BUFFERS) || 4) - 1)), SH_CH = 4 * SH_LAYERS;   // + their depth: ≤ 8 draw buffers

  // --- shaders ------------------------------------------------------------------------------------
  const LIGHTING = `
uniform vec3 uAmbient;
uniform float uSunK;
uniform vec3 uSunDir, uSunCol;
uniform vec4 uAreaRect[${MAX_AREAS}];   // x0, y0, x1, y1
uniform vec4 uAreaCol[${MAX_AREAS}];    // rgb ambient, sun factor
uniform int uNumAreas;
uniform vec4 uWallSeg[${MAX_WALLS}];    // light occluders (cutaway walls, see lighting()): x0, y0, x1, y1 of the plane
uniform vec4 uWallInfo;                 // count, the walls' height, their bounding box's min y, -
uniform highp sampler2D uLights;        // per light (row): pos+radius, rgb*intensity+wrap, spot dir+cos, segment end+flags, size+shadow channel
uniform highp usampler2D uTiles;        // per tile: count, light indices
uniform ivec4 uTileInfo;                // tile size (device px), screen height (device px), shadows on, -
uniform highp sampler2D uDepthBuf;      // this frame's depth (y·cos + z·sin) of the front-most opaque lit surface per pixel, and whether it casts shadows (depthPass)
uniform vec4 uDCam;                     // device px of world (0, 0), device px per unit, 1 / width
uniform float uDInvH;                   // 1 / height (device px)
uniform highp sampler2DArray uShadowV;  // this frame's soft shadows (see shadowPass): visibility channel c in layer c / 4, component c % 4
uniform highp sampler2D uShadowD;       // and their depth
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }   // interleaved gradient noise
// Screen-space shadow: march from P towards a random point of the light's disc (radius: its size, so
// shadows get a penumbra that widens away from the caster) through this frame's depth buffer
// (drawn by depthPass() before anything is lit, so moving casters don't drag their shadows a frame
// behind). A sample is blocked when the
// surface seen at its pixel lies in front of it (towards the camera) by a little, but not by more
// than an object is thick. n: two noise values in 0..1. 1 = lit, 0 = in shadow.
float shadowRay(vec3 P, vec3 S, float size, vec2 n, float steps) {
  float vis = 1.0;
  vec3 D = S - P;
  float len = max(length(D), 1e-3);
  vec3 dn = D / len, t1 = normalize(cross(dn, abs(dn.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0))), t2 = cross(dn, t1);
  float ang = n.y * 6.2831853, rad = size * sqrt(fract(n.x * 1.618034 + n.y * 0.5));
  D += (t1 * cos(ang) + t2 * sin(ang)) * rad;
  float s1 = max(0.0, 1.0 - 0.45 / len);   // stop short of the light (its own lamp housing)
  for (int i = 0; i < ${SHADOW_STEPS}; i++) {
    if (float(i) >= steps) break;
    float s = 0.02 + (float(i) + n.x) / steps * (s1 - 0.02);
    vec3 Q = P + D * s;
    vec2 uv = vec2((uDCam.x + Q.x * uDCam.z) * uDCam.w,
                   1.0 - (uDCam.y + (Q.y * ${SIN.toFixed(6)} - Q.z * ${COS.toFixed(6)}) * uDCam.z) * uDInvH);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
    vec2 dz = texture(uDepthBuf, uv).rg;           // depth, casts shadows (0 / 1)
    float front = dz.r - (Q.y * ${COS.toFixed(6)} + Q.z * ${SIN.toFixed(6)});
    vis *= 1.0 - dz.g * smoothstep(0.04, 0.14, front) * (1.0 - smoothstep(1.3, 2.2, front));
    if (vis < 0.02) break;
  }
  return vis;
}
// The soft shadows at this pixel: where to read them (shUV). Bilinear between the 4 nearest low-res
// texels where they all show this surface (about P's depth); at a silhouette the nearest texel
// of the 3×3 around it that does (so a shadow doesn't bleed over a sprite's edge). false: none
// shows this surface (see-through, or a thin sliver the half-res pass missed): march here instead.
vec2 shUV;
bool softShadows(vec3 P) {
  float dp = P.y * ${COS.toFixed(6)} + P.z * ${SIN.toFixed(6)};
  ivec2 sz = textureSize(uShadowD, 0);
  vec2 h = gl_FragCoord.xy / ${SH_DIV}.0 - 0.5;
  ivec2 b0 = ivec2(floor(h));
  float worst = 1.0, behind = 1e9;
  for (int k = 0; k < 4; k++) {
    ivec2 t = clamp(b0 + ivec2(k & 1, k >> 1), ivec2(0), sz - 1);
    float dd = texelFetch(uShadowD, t, 0).r - dp;
    worst = min(worst, exp(-dd * dd / 0.0144));
    behind = min(behind, dd);
  }
  // all of them show this surface, or something in front of it (it's drawn over later, most likely:
  // no need to march for it)
  shUV = (h + 0.5) / vec2(sz);
  if (worst >= 0.5 || behind > 0.3) return true;
  float best = 0.25;
  ivec2 c = ivec2(floor(h + 0.5)), bt = ivec2(-1);
  for (int k = 0; k < 9; k++) {
    ivec2 t = clamp(c + ivec2(k % 3 - 1, k / 3 - 1), ivec2(0), sz - 1);
    float dd = (texelFetch(uShadowD, t, 0).r - dp) / 0.12, dw = exp(-dd * dd);
    if (dw > best) { best = dw; bt = t; }
  }
  shUV = (vec2(bt) + 0.5) / vec2(sz);
  return bt.x >= 0;
}
float softVis(int c) { return texture(uShadowV, vec3(shUV, float(c >> 2)))[c & 3]; }
// Floor scratches (FLOOR_WEAR): a groove along gGlintT reflects a light when the half vector is
// perpendicular to it, so fine scratches flash up and go dark as a light (or the helmet lamp) moves.
// gGlintK: its strength in units of spec (0: none, everything but the floor tiles).
vec3 gGlintT = vec3(1.0, 0.0, 0.0);
float gGlintK = 0.0;
// The cut-down walls (the near walls and the low ends of the up-down walls) still stop light at their full
// height: the camera sees over them, the light doesn't. 0 where the segment P → S crosses one of these wall
// planes below uWallInfo.y (soft over the last few cm, so the edge on the wall's top isn't a jagged line).
// The screen-space shadows can't do it (they only know what's drawn: a 0.35 high wall).
float wallVis(vec3 P, vec3 S) {
  if (max(P.y, S.y) < uWallInfo.z) return 1.0;
  float vis = 1.0;
  for (int i = 0; i < ${MAX_WALLS}; i++) {
    if (float(i) >= uWallInfo.x) break;
    vec4 w = uWallSeg[i];
    vec2 ab = w.zw - w.xy, n = normalize(vec2(-ab.y, ab.x));
    float sp = dot(P.xy - w.xy, n), ss = dot(S.xy - w.xy, n);
    if (sp * ss >= 0.0) continue;
    float t = sp / (sp - ss), u = dot(mix(P.xy, S.xy, t) - w.xy, ab) / dot(ab, ab);
    float zc = mix(P.z, S.z, t);
    float k = smoothstep(-0.02, 0.0, u) * smoothstep(-0.02, 0.0, 1.0 - u)       // within the wall's length
            * (1.0 - smoothstep(uWallInfo.y - 0.05, uWallInfo.y + 0.05, zc))     // below its top
            * smoothstep(0.0, 0.03, min(abs(sp), abs(ss)));                      // (not just grazing it)
    vis *= 1.0 - k;
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
  int soft = 0;                                    // 0: not looked up yet, 1: soft shadows here, -1: none (march)
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
    a *= wallVis(P, S);
    if (a <= 0.0) continue;
    if (uTileInfo.z > 0 && flags > 1.5) {
      vec4 l4 = texelFetch(uLights, ivec2(4, li), 0);
      int ch = int(l4.y);
      if (ch >= 0 && soft == 0) soft = softShadows(P) ? 1 : -1;
      if (ch >= 0 && soft > 0) a *= softVis(ch);
      else a *= shadowRay(P + N * 0.03, S, l4.x, vec2(ign(gl_FragCoord.xy), ign(gl_FragCoord.yx + 17.0)), ${SHADOW_STEPS_MARCH}.0);   // no channel left, or no soft value here (moved, see-through)
    }
    acc += l1.rgb * a * ndl;
    vec3 H = normalize(l + V);
    spec += l1.rgb * a * pow(max(dot(N, H), 0.0), 28.0);
    if (gGlintK > 0.0) { float ht = dot(H, gGlintT); spec += l1.rgb * a * gGlintK * exp(-ht * ht / 0.008) * smoothstep(0.35, 0.8, H.z); }
  }
  return acc;
}`;

  // Procedural floor wear for the floor tiles (GFX.sprite(..., { floor: [layout, wear x4] }); from
  // tools/sprites/scratch_proto.html). Per pixel, from the world position, so every 1 x 1 plate cell
  // and every 2 x 2 tile gets its own marks (nothing repeats with the baked tile variants):
  //   fine hairlines  normal only: a V-groove box-filtered over the pixel's footprint (a scratch thinner
  //                   than a pixel is a faint light/dark dipole, not aliasing), plus the glint (lighting())
  //   scuff clusters  parallel lines (a crate's corner dragged); swirls (a chair turning)
  //   deep gouges     rare: bare metal in the groove, a dark burr rim, a normal edge
  //   drags           long lines across the seams (from the 3 x 3 neighbouring cells), faded by the wear
  //   duct tape       occasional, per 2 x 2 tile: a strip across or along a seam, an X, an L round a
  //                   corner, a patch of overlapping strips; mostly silver, some black, rarely hazard
  // Wear (the instance's iFloor: the wear field at the tile's four corners, bilinear in between,
  // see js/sprites.js floorWear()) scales the number of scratches. Layout (iXf.w): 1 = tile layout a
  // (tread at the top right), 2 = b (wide plate on top, tread + grille below), 3 = all tread.
  // The cost stays low: one hash yields four 8-bit randoms, a scratch is rejected by its bounding
  // circle before its other parameters are drawn, tape only looks at the tiles whose margin holds the pixel.
  const FLOOR_WEAR = `
uniform vec4 uWear;          // on (0 / 1), fine scratch density, gouge chance per cell, tape chance per tile
uint fwH(uint x) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
uint fwH2(ivec2 c, uint s) { return fwH(uint(c.x) * 1597334677u ^ uint(c.y) * 3812015801u ^ s * 2654435769u); }
uint fwSt;
float fwR() { fwSt = fwH(fwSt + 0x9e3779b9u); return float(fwSt >> 8) / 16777216.0; }
vec4 fwB4(uint h) { return vec4((uvec4(h, h >> 8, h >> 16, h >> 24) & 255u)) / 255.0; }   // four 8-bit randoms
vec4 fwR4() { fwSt = fwH(fwSt + 0x9e3779b9u); return fwB4(fwSt); }
vec2 fwDir(float a) { return vec2(cos(a), sin(a)); }
vec2 fwTilt, fwTan, fwDx, fwDy;   // sum of normal tilts (world xy); the strongest groove's tangent; world units per pixel
float fwCov, fwBare, fwRim;        // the strongest groove's coverage (glint); gouges: bare metal, dark rim
float fwPathA, fwPathK, fwPathBoxA, fwPathBox;   // this plate cell's walking direction + strength, crate axis + nearness (FW_PATH)
// One groove: s along (total length L), d across (unit p, tangent t), half width w, depth h; kind 1 = gouge.
void fwGroove(float s, float d, float L, vec2 p, vec2 t, float w, float h, float kind) {
  float pw = abs(dot(p, fwDx)) + abs(dot(p, fwDy)), pl = abs(dot(t, fwDx)) + abs(dot(t, fwDy));
  if (abs(d) > (kind > 0.5 ? 2.2 * w : w) + pw || s < -pl || s > L + pl) return;
  float u = clamp(s / L, 0.0, 1.0);
  float tap = sqrt(clamp(6.4 * u * (1.0 - u), 0.0, 1.0));             // tapered ends
  float we = w * max(tap, 0.15), he = h * tap;
  float endA = smoothstep(-pl, pl, s) * smoothstep(-pl, pl, L - s);
  float r = max(pw * 0.5, we * 0.2);                                  // box filter over the pixel
  float slope = (-he * max(0.0, 1.0 - abs(d + r) / we) + he * max(0.0, 1.0 - abs(d - r) / we)) / (2.0 * r);
  fwTilt += p * (-slope) * endA;
  float cov = clamp((min(d + r, we) - max(d - r, -we)) / (2.0 * r), 0.0, 1.0) * endA;
  float unres = 1.0 - smoothstep(1.0, 4.0, we / pw);                  // thinner than a pixel: mostly glint
  float g = cov * (0.35 + 0.65 * unres) * (h / (h + 0.0015));
  if (g > fwCov) { fwCov = g; fwTan = t; }
  if (kind > 0.5) {
    fwBare = max(fwBare, cov * tap);
    float rim = clamp((min(d + r, we * 2.2) - max(d - r, -we * 2.2)) / (2.0 * r), 0.0, 1.0) - cov;
    fwRim = max(fwRim, rim * tap * endA);
  }
}
void fwSeg(vec2 q, vec2 a, vec2 b, float w, float h, float kind) {
  vec2 ab = b - a; float L = max(length(ab), 1e-4); vec2 t = ab / L, p = vec2(-t.y, t.x), rel = q - a;
  fwGroove(dot(rel, t), dot(rel, p), L, p, t, w, h, kind);
}
void fwArc(vec2 q, vec2 c, float R, float a0, float span, float w, float h, float kind) {
  vec2 rel = q - c; float rr = length(rel);
  if (abs(rr - R) > 2.2 * w + 0.05) return;
  float th = mod(atan(rel.y, rel.x) - a0 + 3.14159265, 6.2831853) - 3.14159265;
  vec2 p = rel / max(rr, 1e-4), t = vec2(-p.y, p.x);
  fwGroove(th * R, rr - R, span * R, p, t, w, h, kind);
}
// plate cell kind (sub: 0..1, 0..1 in the tile): 0 plain, 1 tread, 2 grille (tools/blender/models/interior/floors.py)
float fwKind(float lay, ivec2 sub) {
  if (lay > 2.5) return 1.0;
  if (lay > 1.5) return sub.y == 0 ? 0.0 : sub.x == 0 ? 1.0 : 2.0;
  return (sub.x == 1 && sub.y == 0) ? 1.0 : 0.0;
}
// The scratches at world point P (cell: its plate cell, kind, the cell's wear; wearP: the wear at P).
void fwScratches(vec2 P, ivec2 cell, float kind, float wear, float wearP) {
  vec2 q = P - vec2(cell);
  float onPlate = kind < 0.5 ? 1.0 : kind < 1.5 ? 0.35 : 0.0;
  if (onPlate > 0.0) {
    uint seed = fwH2(cell, 17u);
    fwSt = seed;
    vec4 r0 = fwB4(seed);
    float dir0 = r0.x * 3.14159265;                                    // the cell's main traffic direction
    float cw = wear * mix(0.35, 1.6, r0.y * r0.z);
    int nf = min(24, int(uWear.y * cw * (4.0 + 10.0 * r0.w) * onPlate));
    for (int i = 0; i < 24; i++) {                                     // fine hairlines
      if (i >= nf) break;
      fwSt = fwH(seed + uint(i + 1) * 0x9e3779b9u);                   // each scratch its own stream: skipping one keeps the rest
      vec4 a = fwB4(fwSt);
      vec2 c = vec2(0.08) + a.xy * 0.84;
      float L = 0.04 + 0.30 * a.z * a.z;
      // -- path scratches (FW_PATH): where the crew walk (js/walkfield.js), part of the hairlines are boot
      // scuffs along the way they go (±13°), a bit shorter, bunched round two spots per cell; next to crates a few
      // are shoved-box scrapes along the crate's axis. Its own random stream: with the field at 0 (off,
      // ?nopathscratch) every hairline is exactly what it was.
      float fpK = 0.0, fpAng = 0.0;
      if (fwPathK + fwPathBox > 0.0) {
        vec4 e = fwB4(fwH(fwSt ^ 0x68e31da4u));
        if (e.x < 0.85 * fwPathK) {                                    // a boot scuff
          vec4 sp = fwB4(fwH(seed ^ 0x2545f491u));
          vec2 st = fwDir(fwPathA), sn = vec2(-st.y, st.x);
          if (e.z < 0.65) c = vec2(0.2) + (e.y < 0.5 ? sp.xy : sp.zw) * 0.6 + st * (a.x - 0.5) * 0.3 + sn * (a.y - 0.5) * 0.12;
          L = 0.04 + 0.22 * a.z * a.z;
          fpK = 1.0; fpAng = fwPathA + (e.w - 0.5) * 0.45;
        } else if (e.x > 1.0 - 0.25 * fwPathBox) {                     // a crate shoved along the floor
          L = 0.08 + 0.22 * a.z;
          fpK = 1.0; fpAng = fwPathBoxA + (e.w - 0.5) * 0.15;
        }
      }
      // -- (end of path scratches)
      if (length(q - c) > L * 0.5 + 0.01) continue;                    // not near it: skip the rest
      vec4 b = fwR4();
      float ang = fpK > 0.5 ? fpAng : a.w < 0.65 ? dir0 + (b.x - 0.5) * 0.7 : b.x * 3.14159265;
      vec2 hd = fwDir(ang) * L * 0.5;
      fwSeg(q, clamp(c - hd, 0.05, 0.95), clamp(c + hd, 0.05, 0.95), 0.0025 + 0.003 * b.y, 0.0008 + 0.0012 * b.z, 0.0);
    }
    fwSt = fwH2(cell, 18u);
    vec4 r1 = fwB4(fwSt);
    if (r1.x < 0.2 * cw * onPlate) {                                   // a cluster of parallel scuffs
      vec4 a = fwR4();
      vec2 c = vec2(0.2) + a.xy * 0.6;
      float ang = dir0 + (a.z - 0.5) * 0.5, L = 0.15 + 0.3 * a.w;
      if (length(q - c) < L * 0.5 + 0.12) {
        vec2 t = fwDir(ang), p = vec2(-t.y, t.x);
        int n = 3 + int(r1.y * 4.99);
        float gap = 0.008 + 0.014 * r1.z;
        for (int k = 0; k < 7; k++) {
          if (k >= n) break;
          vec4 b = fwR4();
          vec2 o = p * (float(k) * gap + (b.x - 0.5) * 0.004) + t * (b.y - 0.5) * 0.05;
          float Lk = L * (0.6 + 0.4 * b.z);
          fwSeg(q, clamp(c + o - t * Lk * 0.5, 0.05, 0.95), clamp(c + o + t * Lk * 0.5, 0.05, 0.95), 0.003 + 0.002 * b.w, 0.0012 + 0.001 * b.w, 0.0);
        }
      }
    }
    fwSt = fwH2(cell, 19u);
    vec4 r2 = fwB4(fwSt);
    if (r2.x < 0.1 * cw * onPlate) {                                   // a swirl (a chair on its casters)
      vec2 c = vec2(0.3) + r2.yz * 0.4;
      float R = 0.12 + 0.2 * r2.w, a0 = r0.w * 37.0;
      if (abs(length(q - c) - R) < 0.06) {
        int n = 2 + int(fwR() * 3.99);
        for (int k = 0; k < 5; k++) {
          if (k >= n) break;
          vec4 b = fwR4();
          fwArc(q, c, min(R + (b.x - 0.5) * 0.06, 0.45), a0 + b.y * 1.5, 0.6 + 1.8 * b.z, 0.0025 + 0.002 * b.w, 0.001 + 0.001 * b.w, 0.0);
        }
      }
    }
    fwSt = fwH2(cell, 20u);
    vec4 r3 = fwB4(fwSt);
    if (r3.x < uWear.z * mix(0.6, 1.4, clamp(cw / 1.6, 0.0, 1.5)) * onPlate) {   // a deep gouge: one slightly curved stroke
      vec4 a = fwR4();
      vec2 c = vec2(0.25) + r3.yz * 0.5;
      float R = 0.6 + 2.0 * a.x, a0 = a.y * 6.2831853, L = 0.1 + 0.3 * a.z;
      fwArc(q, c - fwDir(a0) * R, R, a0 - 0.5 * L / R, L / R, 0.004 + 0.005 * a.w, 0.003 + 0.003 * r3.w, 1.0);
    }
  }
  // drags: long lines across the seams, started by any of the 3 x 3 cells around; faded in and out
  // by the (continuous) wear at P, so they don't end at a tile edge where the wear differs
  for (int k = 0; k < 9; k++) {
    ivec2 nc = cell + ivec2(k % 3 - 1, k / 3 - 1);
    fwSt = fwH2(nc, 91u);
    vec4 a = fwB4(fwSt);
    float gate = clamp((0.1 * wearP - a.x) / 0.03, 0.0, 1.0);
    if (gate <= 0.0) continue;
    vec2 s0 = vec2(nc) + a.yz;
    float L = 0.8 + 1.0 * a.w;
    if (length(P - s0) > L + 0.1) continue;
    vec4 b = fwR4();
    vec2 t = fwDir(b.x * 3.14159265), p = vec2(-t.y, t.x);
    int n = 1 + int(b.y * 2.99);
    float gap = 0.01 + 0.02 * b.z;
    vec2 tilt0 = fwTilt; float cov0 = fwCov;
    for (int j = 0; j < 3; j++) {
      if (j >= n) break;
      vec4 c = fwR4();
      fwSeg(P, s0 + p * float(j) * gap, s0 + p * float(j) * gap + t * L * (0.7 + 0.3 * c.x), 0.003 + 0.002 * c.y, 0.001 + 0.0012 * c.z, 0.0);
    }
    fwTilt = mix(tilt0, fwTilt, gate); fwCov = mix(cov0, fwCov, gate);
  }
}

// --- duct tape --------------------------------------------------------------------------------------
float fwTape, fwTapeSpec;
vec3 fwTapeCol;
vec2 fwTapeTilt;
float fwNoise(vec2 x) {
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  ivec2 c = ivec2(i);
  float a = float(fwH2(c, 7u) >> 8), b = float(fwH2(c + ivec2(1, 0), 7u) >> 8), d = float(fwH2(c + ivec2(0, 1), 7u) >> 8), e = float(fwH2(c + ivec2(1, 1), 7u) >> 8);
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y) / 16777216.0;
}
float fwFbm(vec2 x) { return 0.6 * fwNoise(x) + 0.4 * fwNoise(mat2(0.8, -0.6, 0.6, 0.8) * x * 2.1 + 3.7); }
// One strip: centre c, angle, half length hl, half width hw; col 0 silver, 1 hazard, 2 black; age 0..1;
// peel (0: none) lifts a corner at one end; sd: its own seed.
void fwStrip(vec2 P, vec2 c, float ang, float hl, float hw, int col, float age, float peel, float sd) {
  vec2 t = fwDir(ang), p = vec2(-t.y, t.x), rel = P - c;
  float s = dot(rel, t), d = dot(rel, p);
  if (abs(s) > hl + 0.03 || abs(d) > hw + 0.03) return;
  float pw = abs(dot(p, fwDx)) + abs(dot(p, fwDy)), pl = abs(dot(t, fwDx)) + abs(dot(t, fwDy));
  float rw = max(pw * 0.5, 0.0015), rl = max(pl * 0.5, 0.0015);
  float hwE = hw * (1.0 + 0.05 * (fwNoise(vec2(s * 22.0, sd * 50.0)) - 0.5));       // wavy edges
  float tear = 0.009 * abs(fract(d * 38.0 + sd * 3.0) - 0.5) * 2.0 + 0.005 * fwNoise(vec2(d * 90.0, sd * 50.0 + 5.0));   // torn ends
  float hlE = hl - tear;
  float cw = clamp((hwE - abs(d)) / (2.0 * rw) + 0.5, 0.0, 1.0), cl = clamp((hlE - abs(s)) / (2.0 * rl) + 0.5, 0.0, 1.0);
  float a = cw * cl;
  float cut = 0.0, lip = 0.0;
  if (peel > 0.0) {                                                   // a peeled corner, curling up
    float pk = peel * hw * 1.6, e = (s * sign(sd - 0.5 + 1e-3) - hl) + (hw - d), rr = max(rl, rw);
    cut = clamp((e + pk) / (2.0 * rr) + 0.5, 0.0, 1.0) * cl * cw;
    lip = exp(-pow((e + pk) / max(0.006, rr * 2.0), 2.0)) * cw * cl;
    a *= 1.0 - cut;
  }
  if (a <= 0.0 && lip <= 0.0 && cut <= 0.0) return;
  vec3 tc = col == 0 ? vec3(0.4, 0.41, 0.43) * mix(vec3(1.0), vec3(1.04, 1.0, 0.9), age) : col == 1 ? vec3(0.62, 0.5, 0.17) : vec3(0.19, 0.19, 0.2);
  if (col == 1) {                                                     // hazard: broad diagonal bands, filtered
    float u = (s + d) * 3.2, tri = abs(fract(u) - 0.5) * 2.0, fw = (pw + pl) * 3.2 * 2.0 + 0.02;
    tc = mix(tc, vec3(0.15, 0.135, 0.11), smoothstep(0.5 - fw, 0.5 + fw, tri));
  }
  float edge = min(hwE - abs(d), hlE - abs(s));                       // dirt along the edges and in blotches
  float dirt = (0.2 + 0.4 * age) * exp(-max(edge, 0.0) / 0.012) + age * 0.3 * smoothstep(0.45, 0.75, fwFbm(rel * 18.0 + sd * 13.0));
  tc *= 1.0 - 0.55 * clamp(dirt, 0.0, 1.0);
  // relief: the edge is a small step up (box-filtered); soft crumples (isotropic bumps, no stripes),
  // faded out once they get smaller than a few pixels
  float th = 0.006;
  float gw = (abs(abs(d) - hwE) < rw ? -sign(d) / (2.0 * rw) : 0.0) * cl;
  float glE = (abs(abs(s) - hlE) < rl ? -sign(s) / (2.0 * rl) : 0.0) * cw;
  vec2 tilt = -(p * gw + t * glE) * th * (1.0 - cut);
  float wr = 1.0 - smoothstep(0.006, 0.02, max(pw, pl));
  if (wr > 0.0 && col != 1) {
    vec2 x = vec2(s * 14.0, d * 18.0) + sd * 31.0;
    float n0 = fwFbm(x), nx = fwFbm(x + vec2(0.12, 0.0)), ny = fwFbm(x + vec2(0.0, 0.12));
    tilt += (t * (nx - n0) + p * (ny - n0)) / 0.12 * 0.08 * wr * a;
  }
  vec2 pd = normalize(t * sign(sd - 0.5 + 1e-3) - p);                 // the lip faces away from the tape
  tilt += pd * lip * 0.6;
  float under = cut * 0.6;                                            // adhesive grime where it peeled off
  fwTapeCol = mix(fwTapeCol * (1.0 - under), tc, a) + vec3(lip * 0.3);
  fwTapeTilt = mix(fwTapeTilt, vec2(0.0), a) + tilt;
  fwTapeSpec = mix(fwTapeSpec, col == 0 ? 0.5 : col == 2 ? 0.25 : 0.3, a);
  fwTape = max(fwTape, max(a, under * 0.7));
}
// Tape on the 2 x 2 tiles around P (only those whose reach, 0.6 beyond the tile, holds P). Each taped
// tile lays out its strips first (up to 3), then one loop draws those near P: a single fwStrip call
// site (inlined once, not once per arrangement) keeps the shader small and cheap.
void fwTapes(vec2 P, float chance) {
  ivec2 t0 = ivec2(floor(P * 0.5));
  vec4 S0[3]; vec2 S1[3];                     // per strip: centre, angle, half length; peel, seed
  for (int k = 0; k < 9; k++) {
    ivec2 tl = t0 + ivec2(k % 3 - 1, k / 3 - 1);
    vec2 o = vec2(tl) * 2.0, rp = P - o;
    if (rp.x < -0.6 || rp.y < -0.6 || rp.x > 2.6 || rp.y > 2.6) continue;
    fwSt = fwH2(tl, 333u);
    vec4 a = fwB4(fwSt);
    if (a.x > chance) continue;
    vec4 b = fwR4(), e = fwR4(), f = fwR4(), g = fwR4();
    int type = a.y < 0.35 ? 0 : a.y < 0.6 ? 1 : a.y < 0.75 ? 2 : a.y < 0.85 ? 3 : 4;
    int col = a.z < 0.8 ? 0 : a.z < 0.94 ? 2 : 1;
    float age = a.w, hw = 0.04 + 0.02 * b.x, sd = b.y;
    vec2 sp = o + vec2(b.z < 0.5 ? 0.0 : 1.0, b.w < 0.5 ? 0.0 : 1.0);   // a seam crossing on the 1-unit grid
    bool vert = e.x < 0.5;
    float base = vert ? 1.5707963 : 0.0, pe = e.z < 0.4 ? 0.4 + 0.5 * e.w : 0.0;
    int n = 1;
    if (type == 0) {             // across a seam
      S0[0] = vec4(sp + (vert ? vec2(0.0, 0.15 + 0.7 * e.y) : vec2(0.15 + 0.7 * e.y, 0.0)), base + 1.5707963 + (f.x - 0.5) * 0.5, 0.12 + 0.25 * f.y);
      S1[0] = vec2(pe, sd);
    } else if (type == 1) {      // along a seam, over a long crack
      S0[0] = vec4(sp + (vert ? vec2(0.0, 0.5 + (e.y - 0.5) * 0.4) : vec2(0.5 + (e.y - 0.5) * 0.4, 0.0)), base + (f.x - 0.5) * 0.1, 0.25 + 0.4 * f.y);
      S1[0] = vec2(pe, sd);
    } else if (type == 2) {      // an X over a crack (in the top-left plate: plain in every layout)
      vec2 c = o + vec2(0.3 + 0.4 * e.y, 0.3 + 0.4 * e.w);
      float a0 = f.x * 3.14159265, L = 0.12 + 0.12 * f.y;
      S0[0] = vec4(c, a0, L); S1[0] = vec2(0.0, sd);
      S0[1] = vec4(c, a0 + 1.2 + 0.7 * f.z, L * (0.85 + 0.3 * f.w)); S1[1] = vec2(pe, fract(sd + 0.37));
      n = 2;
    } else if (type == 3) {      // an L round a plate corner
      vec2 sx = vec2(e.y < 0.5 ? 1.0 : -1.0, e.w < 0.5 ? 1.0 : -1.0), c = sp + sx * 0.08;
      float L = 0.12 + 0.12 * f.x, j = (f.y - 0.5) * 0.15;
      S0[0] = vec4(c + vec2(sx.x * L * 0.8, 0.0), j, L); S1[0] = vec2(pe, sd);
      S0[1] = vec4(c + vec2(0.0, sx.y * L * 0.8), 1.5707963 + j, L); S1[1] = vec2(0.0, fract(sd + 0.61));
      n = 2;
    } else {                     // overlapping strips side by side (a patched plate)
      vec2 c = sp + (vert ? vec2(0.0, 0.2 + 0.6 * e.y) : vec2(0.2 + 0.6 * e.y, 0.0));
      float a0 = base + 1.5707963 + (f.x - 0.5) * 0.25, L = 0.15 + 0.2 * f.y;
      vec2 pp = vec2(-sin(a0), cos(a0));
      n = 2 + int(e.w * 1.99);
      for (int m = 0; m < 3; m++) {
        vec4 r = m == 0 ? g : m == 1 ? fwB4(fwH(fwSt + 1u)) : fwB4(fwH(fwSt + 2u));
        S0[m] = vec4(c + pp * float(m) * hw * 1.4 + fwDir(a0) * (r.x - 0.5) * 0.1, a0 + (r.y - 0.5) * 0.12, L * (0.75 + 0.4 * r.z));
        S1[m] = vec2(r.w < 0.3 ? 0.6 : 0.0, fract(sd + float(m) * 0.29));
      }
    }
    for (int m = 0; m < 3; m++) {
      if (m >= n) break;
      if (length(P - S0[m].xy) > S0[m].w + hw + 0.04) continue;
      fwStrip(P, S0[m].xy, S0[m].z, S0[m].w, hw, col, age, S1[m].x, S1[m].y);
    }
  }
}
// All of it, for the floor pixel at P (world, game axes; taken on the plate tops' plane, so the seams'
// depth doesn't bend the marks) with base colour and normal: changes them and
// returns the specular factor; sets gGlintK / gGlintT for lighting(). msk: the tile's plate mask;
// dlx, dly: the canvas position's screen derivatives.
float floorWear(vec3 P, inout vec3 base, inout vec3 N, float msk, vec2 dlx, vec2 dly) {
  fwDx = vec2(dlx.x, dlx.y / ${SIN.toFixed(6)}) / vGround.w; fwDy = vec2(dly.x, dly.y / ${SIN.toFixed(6)}) / vGround.w;
  fwTilt = vec2(0.0); fwCov = 0.0; fwTan = vec2(1.0, 0.0); fwBare = 0.0; fwRim = 0.0;
  fwTape = 0.0; fwTapeCol = vec3(1.0); fwTapeTilt = vec2(0.0); fwTapeSpec = 0.0;
  vec2 rel = P.xy - vGround.xy;
  ivec2 sub = clamp(ivec2(floor(rel)), ivec2(0), ivec2(1));
  ivec2 cell = ivec2(floor(vGround.xy + 0.5)) + sub;
  vec2 u = clamp(rel * 0.5, 0.0, 1.0), uc = (vec2(sub) + 0.5) * 0.5;
  float wearP = mix(mix(vFloor.x, vFloor.y, u.x), mix(vFloor.z, vFloor.w, u.x), u.y);
  float wearC = mix(mix(vFloor.x, vFloor.y, uc.x), mix(vFloor.z, vFloor.w, uc.x), uc.y);
  uint pu = uint(vPath[sub.x + 2 * sub.y] + 0.5);                    // FW_PATH: packed by js/walkfield.js walkFieldPacked()
  fwPathA = float(pu >> 14) / 64.0 * 3.14159265; fwPathK = float((pu >> 9) & 31u) / 31.0;
  fwPathBoxA = float((pu >> 4) & 31u) / 32.0 * 3.14159265; fwPathBox = float(pu & 15u) / 15.0;
  fwScratches(P.xy, cell, fwKind(vLayout, sub), wearC, wearP);
  float flat_ = smoothstep(0.5, 0.9, msk) * smoothstep(0.96, 0.995, N.z);   // the plate tops only (not seams, bevels, rivets)
  fwTilt *= flat_; fwCov *= flat_; fwBare *= flat_; fwRim *= flat_;
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  base = mix(base, vec3(lum * 1.35 + 0.05) * vec3(0.97, 0.99, 1.03), fwBare * 0.75);   // bare steel in a gouge
  base *= 1.0 - 0.45 * fwRim;                                                         // its burr + grime
  float specK = 0.22;
  if (uWear.w > 0.0) fwTapes(P.xy, uWear.w);
  if (fwTape > 0.0) {
    float cov = clamp(fwTape, 0.0, 1.0);
    base = mix(base * min(fwTapeCol, vec3(1.0)), fwTapeCol, cov);
    fwTilt *= 1.0 - cov; fwCov *= 1.0 - cov;
    specK = mix(specK, fwTapeSpec, cov);
    N.xy *= 1.0 - 0.6 * cov;                                          // tape bridges the tread and the seams
  }
  N = normalize(N + vec3(fwTilt + fwTapeTilt, 0.0));
  gGlintT = vec3(fwTan, 0.0); gGlintK = fwCov * 0.5 / specK;
  return specK;
}
`;
  // Sprite instances: INST floats (INST / 4 vec4 texels) each, uploaded once per frame into an RGBA32F texture,
  // INST_ROW instances per row; the vertex shader fetches its own with gl_InstanceID (one uniform per batch
  // instead of re-pointing 11 instanced attributes, which cost more CPU than everything else in end())
  const INST = 12 * 4, INST_ROW = 128;
  const VS_SPRITE = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
// the instance (uploadInstances): INST / 4 texels in a row of the uInst texture, INST_ROW instances per row
// (a new field: one more vec4 here, its texelFetch in main(), and INST += 4)
uniform highp sampler2D uInst;
uniform int uFirst;                     // the batch's first instance (drawQueue)
vec4 iScreen;   // origin on screen (device px), device px per canvas px, flip (+1 / -1)
vec4 iQuad;     // drawn rect on the sprite canvas (canvas px)
vec4 iBase;     // base (or whole frame) rect on the canvas
vec4 iPatch;    // patch rect on the canvas (w = 0: none)
vec4 iOff;      // canvas -> page px: base xy, patch zw
vec4 iGround;   // world x, y, z of the origin; ppu
vec4 iOrigin;   // origin on the canvas (ox, oy), object scale, depth bias
vec4 iTint;     // rgb, strength
vec4 iMisc;     // tint reference luminance, emissive, alpha, flags (1 unlit)
vec4 iXf;      // screen rotation (rad, clockwise) around the origin, stretch along the sprite's x, desaturation, floor layout (0: not a floor tile; see FLOOR_WEAR)
vec4 iFloor;   // floor tiles: wear at the tile's corners (top-left, top-right, bottom-left, bottom-right)
vec4 iPath;    // floor tiles: the walk field per plate cell (same order; packed, see FW_PATH; 0 = none)
uniform vec2 uView;
out vec2 vLp;
flat out vec4 vBase, vPatch, vOff, vGround, vOrigin, vTint, vMisc, vFloor, vPath;
flat out vec4 vXf;   // flip/stretch, rotation, desaturation, floor layout: one vector (Firefox runs out of varyings with four floats)
void main() {
  int id = uFirst + gl_InstanceID;
  ivec2 at = ivec2((id % ${INST_ROW}) * ${INST / 4}, id / ${INST_ROW});
  iScreen = texelFetch(uInst, at + ivec2(0, 0), 0); iQuad = texelFetch(uInst, at + ivec2(1, 0), 0); iBase = texelFetch(uInst, at + ivec2(2, 0), 0); iPatch = texelFetch(uInst, at + ivec2(3, 0), 0); iOff = texelFetch(uInst, at + ivec2(4, 0), 0); iGround = texelFetch(uInst, at + ivec2(5, 0), 0); iOrigin = texelFetch(uInst, at + ivec2(6, 0), 0); iTint = texelFetch(uInst, at + ivec2(7, 0), 0); iMisc = texelFetch(uInst, at + ivec2(8, 0), 0); iXf = texelFetch(uInst, at + ivec2(9, 0), 0); iFloor = texelFetch(uInst, at + ivec2(10, 0), 0); iPath = texelFetch(uInst, at + ivec2(11, 0), 0);
  vec2 lp = iQuad.xy + aPos * iQuad.zw;
  vLp = lp;
  vec2 q = vec2((lp.x - iOrigin.x) * iScreen.w * iXf.y, lp.y - iOrigin.y) * iScreen.z;
  float cr = cos(iXf.x), sr = sin(iXf.x);
  vec2 p = iScreen.xy + vec2(q.x * cr - q.y * sr, q.x * sr + q.y * cr);
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
  vBase = iBase; vPatch = iPatch; vOff = iOff; vGround = iGround; vOrigin = iOrigin; vTint = iTint; vMisc = iMisc; vXf = vec4(iScreen.w * iXf.y, iXf.x, iXf.z, iXf.w); vFloor = iFloor; vPath = iPath;
}`;

  const FS_SPRITE = `#version 300 es
precision highp float;
in vec2 vLp;
flat in vec4 vBase, vPatch, vOff, vGround, vOrigin, vTint, vMisc, vFloor, vPath;
flat in vec4 vXf;
#define vFlip vXf.x
#define vRot vXf.y
#define vDesat vXf.z
#define vLayout vXf.w
uniform sampler2D uBeauty, uNormal, uHeight, uMask;
uniform vec2 uPage;        // page size (beauty px); the map pages are scaled copies with the same uv
uniform float uHasMask, uHR, uDepthScale;
#ifdef DEPTH_ONLY
layout(location = 0) out vec4 outDepth;   // the depth pre-pass (depthPass): this frame's depth for the screen-space shadows
#else
layout(location = 0) out vec4 outColor;
${LIGHTING}
${FLOOR_WEAR}
#endif
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
  // a sprite turned on screen is the object turned about the camera's view axis: every pixel keeps its depth
  // along the view, so its height changes with its screen y (and the normals turn about the view axis below)
  if (vRot != 0.0) { float oy0 = o.y; o = vec2(o.x * cos(vRot) - o.y * sin(vRot), o.x * sin(vRot) + o.y * cos(vRot)); hz += (oy0 - o.y) * ${COS.toFixed(6)}; }
  if (mod(floor(vMisc.w * 0.5), 2.0) > 0.5) hz = -o.y / ${COS.toFixed(6)};   // billboard: an upright plane through the origin
  vec3 P = vec3(vGround.x + o.x, vGround.y + (o.y + hz * ${COS.toFixed(6)}) / ${SIN.toFixed(6)}, vGround.z + hz);
  float depth = P.y * ${COS.toFixed(6)} + P.z * ${SIN.toFixed(6)} + vOrigin.w;   // larger = closer to the camera
  gl_FragDepth = clamp(0.5 - depth * uDepthScale, 0.0, 1.0);
#ifdef DEPTH_ONLY
  // solid, lit pixels: their depth (where the soft shadows are computed); only those below the
  // ceiling cast shadows (not the hanging lamps and their cables)
  outDepth = vec4(depth - vOrigin.w, P.z - vGround.z < 1.75 ? 1.0 : 0.0, 0.0, alpha > 0.6 && mod(vMisc.w, 2.0) < 0.5 ? 1.0 : 0.0);
#else
  vec3 base = b.rgb;
  if (vTint.a > 0.0 && uHasMask > 0.5) {
    float m = textureGrad(uMask, uv, gdx, gdy).r * vTint.a;
    float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
    float ref = max(vMisc.x, 0.05);
    vec3 t = vTint.rgb * (lum / ref);
    t = mix(t, vec3(1.0), clamp(lum / ref - 1.3, 0.0, 0.6));   // keep specular glints white
    base = mix(base, t, m);
  } else if (vTint.a < 0.0) {                       // recolor: the saturated cyan / green pixels (energy glows) take the colour
    float m = smoothstep(0.08, 0.28, max(base.g, base.b) - base.r);
    base = mix(base, vTint.rgb * max(base.r, max(base.g, base.b)), m);
  }
  if (vDesat > 0.0) base = mix(base, vec3(dot(base, vec3(0.2126, 0.7152, 0.0722))), vDesat);
  vec3 col = base;
  if (mod(vMisc.w, 2.0) < 0.5) {
    vec3 N = vec3(n.x * sign(vFlip), -n.y, n.z);
    if (vRot != 0.0) {                              // turn about the view axis (screen right, screen down, towards the camera)
      float a = N.x, b = N.y * ${SIN.toFixed(6)} - N.z * ${COS.toFixed(6)}, c = N.y * ${COS.toFixed(6)} + N.z * ${SIN.toFixed(6)};
      vec2 r = vec2(a * cos(vRot) - b * sin(vRot), a * sin(vRot) + b * cos(vRot));
      N = vec3(r.x, r.y * ${SIN.toFixed(6)} + c * ${COS.toFixed(6)}, -r.y * ${COS.toFixed(6)} + c * ${SIN.toFixed(6)});
    }
    N = normalize(N);
    float specK = 0.22;
    if (vLayout > 0.5 && uWear.x > 0.5) specK = floorWear(vec3(vGround.x + o.x, vGround.y + (o.y + 0.025 * ${COS.toFixed(6)}) / ${SIN.toFixed(6)}, 0.0), base, N, uHasMask > 0.5 ? textureGrad(uMask, uv, gdx, gdy).r : 1.0, gdx * uPage, gdy * uPage);
    vec3 spec;
    vec3 acc = lighting(P, N, spec);
    float e = vMisc.y * smoothstep(0.62, 0.97, max(base.r, max(base.g, base.b)));
    col = base * acc + spec * specK;
    col = mix(col, base * 1.15, e);
  }
  outColor = vec4(col, alpha);
#endif
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
  // The backdrop (GFX.backdrop): the base colour and the radial glows, full screen ...
  const FS_GLOWS = `#version 300 es
precision highp float;
uniform vec3 uBase;
uniform vec4 uGlow[4];      // centre x, y (device px, y down), radius, -
uniform vec4 uGlowCol[4];   // rgb, alpha at the centre
uniform int uNumGlows;
uniform float uH;
out vec4 outColor;
void main() {
  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  vec3 c = uBase;
  for (int i = 0; i < 4; i++) {
    if (i >= uNumGlows) break;
    float t = clamp(length(p - uGlow[i].xy) / uGlow[i].z, 0.0, 1.0);
    c = mix(c, uGlowCol[i].rgb * (1.0 - t), uGlowCol[i].a * (1.0 - t));   // (a 2D canvas gradient to transparent black: unpremultiplied)
  }
  outColor = vec4(c, 1.0);
}`;
  // ... then the rects, instanced (CSS px; under a pixel they grow to one and fade by their area, like a 2D canvas's coverage)
  const VS_RECTS = `#version 300 es
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec4 aRect;
layout(location = 2) in vec4 aCol;
uniform vec2 uView;
uniform float uK;
out vec4 vCol;
void main() {
  vec2 sz = aRect.zw * uK, s1 = max(sz, vec2(1.0));
  vec2 p = aRect.xy * uK + sz * 0.5 + (aPos - 0.5) * s1;
  vCol = vec4(aCol.rgb, aCol.a * sz.x * sz.y / (s1.x * s1.y));
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;
  const FS_COLOR = `#version 300 es
precision highp float;
in vec4 vCol;
out vec4 outColor;
void main() { outColor = vCol; }`;
  // Soft shadows, pass 1 (at 1/SH_DIV resolution, after depthPass, before the scene): every pixel takes
  // the surface this frame's depth buffer shows there (P from its screen position and depth: the
  // view is orthographic) and marches one jittered ray to each shadow-casting light of its tile that
  // has a channel (cullLights() gives overlapping lights different ones). Out: visibility channels
  // (layers of RGBA8) and the depth (-1000: no surface), for the depth-aware blur and lookup.
  const FS_SHPASS = `#version 300 es
precision highp float;
uniform vec4 uCam;        // this frame: device px of world (0, 0), device px per unit, height (device px)
${Array.from({ length: SH_LAYERS }, (_, i) => `layout(location = ${i}) out vec4 outV${i};`).join('\n')}
layout(location = ${SH_LAYERS}) out vec4 outD;
${LIGHTING}
vec4 v[${SH_LAYERS}];
void main() {
  for (int i = 0; i < ${SH_LAYERS}; i++) v[i] = vec4(1.0);
  ${Array.from({ length: SH_LAYERS }, (_, i) => `outV${i} = v[${i}];`).join(' ')}
  vec2 fc = gl_FragCoord.xy * ${SH_DIV}.0;
  float x = (fc.x - uCam.x) / uCam.z, sy = (uCam.w - fc.y - uCam.y) / uCam.z;   // world x, y·sin − z·cos
  float d = texelFetch(uDepthBuf, min(ivec2(fc), textureSize(uDepthBuf, 0) - 1), 0).r;
  outD = vec4(d, 0.0, 0.0, 1.0);
  if (d < -500.0) return;
  vec3 P = vec3(x, sy * ${SIN.toFixed(6)} + d * ${COS.toFixed(6)}, d * ${SIN.toFixed(6)} - sy * ${COS.toFixed(6)});
  vec3 V = vec3(0.0, ${COS.toFixed(6)}, ${SIN.toFixed(6)});
  vec2 nz = vec2(ign(gl_FragCoord.xy), ign(gl_FragCoord.yx + 17.0));
  ivec2 ic = ivec2(fc);
  ivec2 tile = ivec2(ic.x / uTileInfo.x, (uTileInfo.y - 1 - ic.y) / uTileInfo.x);
  int c0 = tile.x * ${TILE_SLOTS};
  int n = int(texelFetch(uTiles, ivec2(c0, tile.y), 0).r);
  for (int k = 0; k < ${TILE_SLOTS - 1}; k++) {
    if (k >= n) break;
    int li = int(texelFetch(uTiles, ivec2(c0 + 1 + k, tile.y), 0).r);
    vec4 l4 = texelFetch(uLights, ivec2(4, li), 0);
    int ch = int(l4.y);
    if (ch < 0) continue;
    vec4 l0 = texelFetch(uLights, ivec2(0, li), 0), l3 = texelFetch(uLights, ivec2(3, li), 0);
    vec3 S = l0.xyz;
    if (mod(l3.w, 2.0) > 0.5) { vec3 ab = l3.xyz - l0.xyz; S += ab * clamp(dot(P - l0.xyz, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0); }
    vec3 L = S - P;
    float dl = length(L);
    if (dl >= l0.w) continue;
    vec3 l = L / max(dl, 1e-3);
    vec4 l2 = texelFetch(uLights, ivec2(2, li), 0);
    if (l2.w > -1.5 && dot(-l, l2.xyz) <= l2.w) continue;   // outside the spot cone
    v[ch >> 2][ch & 3] = shadowRay(P + V * 0.02 + l * 0.03, S, l4.x, nz, ${SHADOW_STEPS}.0);
  }
  ${Array.from({ length: SH_LAYERS }, (_, i) => `outV${i} = v[${i}];`).join(' ')}
}`;
  // pass 2 and 3: a separable blur of the channels that only mixes texels of about the same depth
  // (no shadow bleeding over sprite edges and walls); the noise of the jittered rays becomes penumbra.
  const FS_SHBLUR = `#version 300 es
precision highp float;
uniform highp sampler2DArray uV;
uniform highp sampler2D uD;
uniform ivec2 uDir;
${Array.from({ length: SH_LAYERS }, (_, i) => `layout(location = ${i}) out vec4 outV${i};`).join('\n')}
layout(location = ${SH_LAYERS}) out vec4 outD;
vec4 v[${SH_LAYERS}];
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy), sz = textureSize(uD, 0);
  float d0 = texelFetch(uD, p, 0).r;
  outD = vec4(d0, 0.0, 0.0, 1.0);
  for (int j = 0; j < ${SH_LAYERS}; j++) v[j] = vec4(0.0);
  float ws = 0.0;
  if (d0 > -500.0) for (int i = -${SH_BLUR}; i <= ${SH_BLUR}; i++) {
    ivec2 q = clamp(p + uDir * i, ivec2(0), sz - 1);
    float fi = float(i), dd = (texelFetch(uD, q, 0).r - d0) / (0.08 + 0.04 * abs(fi));
    float w = exp(-fi * fi / 8.0 - dd * dd);
    if (w < 0.004) continue;
    for (int j = 0; j < ${SH_LAYERS}; j++) v[j] += texelFetch(uV, ivec3(q, j), 0) * w;
    ws += w;
  }
  for (int j = 0; j < ${SH_LAYERS}; j++) v[j] = ws > 0.0 ? v[j] / ws : vec4(1.0);
  ${Array.from({ length: SH_LAYERS }, (_, i) => `outV${i} = v[${i}];`).join(' ')}
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
  const MAX_OV = 6;
  const FS_COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene, uBloom1, uBloom2;
uniform float uBloom;
uniform vec3 uGrade;
uniform vec4 uOvGeo[MAX_OV];     // the overlays (GFX.overlay): centre (device px, y down), r0, r1
uniform vec4 uOvT[MAX_OV];       // stop positions t0, t1, t2, number of stops
uniform vec4 uOvCol[MAX_OV * 3]; // stop colours (rgb 0..1, a)
uniform int uNumOv;
uniform float uH;
out vec4 outColor;
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  c += (texture(uBloom1, vUV).rgb * 0.8 + texture(uBloom2, vUV).rgb * 1.1) * uBloom;
  c *= uGrade;
  vec3 over = max(c - 0.85, 0.0);
  c = min(c, 0.85) + 0.15 * (1.0 - exp(-over / 0.15));   // soft shoulder instead of hard clipping
  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y);
  for (int i = 0; i < MAX_OV; i++) {
    if (i >= uNumOv) break;
    vec4 g = uOvGeo[i], st = uOvT[i];
    float t = clamp((length(p - g.xy) - g.z) / max(g.w - g.z, 1e-3), 0.0, 1.0);
    vec4 k = uOvCol[i * 3];
    if (st.w > 1.5) {
      if (t > st.y && st.w > 2.5) k = mix(uOvCol[i * 3 + 1], uOvCol[i * 3 + 2], clamp((t - st.y) / max(st.z - st.y, 1e-5), 0.0, 1.0));
      else k = mix(k, uOvCol[i * 3 + 1], clamp((t - st.x) / max(st.y - st.x, 1e-5), 0.0, 1.0));
    }
    c = mix(c, k.rgb, k.a);
  }
  outColor = vec4(c, 1.0);
}`.replace(/MAX_OV/g, String(MAX_OV));

  // Shield domes (GFX.dome): a quad over the dome's screen box; every pixel casts its view ray (the
  // view is orthographic) against the ellipsoid and shades one of the two hits (uMisc.y: 0 the front
  // one, 1 the back one; two draws so each is depth-tested against the walls and the crew on its own).
  // Unlit and additive: hexagon cells over the surface, a fresnel rim where it's seen edge-on, a bright
  // base ring, the reveal sphere growing out of the emitter, impacts flaring the cells and rippling.
  const VS_RECT = `#version 300 es
layout(location = 0) in vec2 aPos;
uniform vec4 uRect;       // device px x0, y0, x1, y1 (y down)
uniform vec2 uView;
void main() { vec2 p = mix(uRect.xy, uRect.zw, aPos); gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0); }`;
  const FS_DOME = `#version 300 es
precision highp float;
uniform vec4 uCam;        // device px of world (0, 0), device px per unit, height (device px)
uniform vec3 uC, uR;      // the ellipsoid: centre, radii (world axes)
uniform vec4 uOut;        // outward (horizontal unit vector), fade start, fade end (in q·out)
uniform vec4 uGrow;       // the emitter (x, y, z), reveal radius
uniform vec4 uCol;        // rgb, strength
uniform vec4 uMisc;       // time, back hit (0 / 1), cell size (units), -
uniform vec4 uHit[8];     // impact x, y, z (on the surface), age 0..1
uniform vec4 uHitK[8];    // heavy (0 / 1)
uniform int uNumHits;
uniform float uDepthScale;
out vec4 outColor;
const vec2 HS = vec2(1.0, 1.7320508);
vec4 hexCell(vec2 p) {     // offset from the nearest cell centre, cell id
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / HS.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * HS, p - (hc.zw + 0.5) * HS);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + 0.5);
}
void main() {
  float x = (gl_FragCoord.x - uCam.x) / uCam.z, sy = (uCam.w - gl_FragCoord.y - uCam.y) / uCam.z;
  vec3 V = vec3(0.0, ${COS.toFixed(6)}, ${SIN.toFixed(6)});
  vec3 A = vec3(x, sy * ${SIN.toFixed(6)}, -sy * ${COS.toFixed(6)});   // the ray: A + t·V, t = depth
  vec3 q0 = (A - uC) / uR, qv = V / uR;
  float a = dot(qv, qv), b = dot(q0, qv), c = dot(q0, q0) - 1.0, disc = b * b - a * c;
  if (disc <= 0.0) discard;
  float t = (-b + (uMisc.y > 0.5 ? -1.0 : 1.0) * sqrt(disc)) / a;
  vec3 P = A + V * t;
  if (P.z < 0.0) discard;
  vec3 q = (P - uC) / uR;
  float s = dot(q.xy, uOut.xy);                    // 1: the outer rim on the ground, 0: over the crown
  float fade = smoothstep(uOut.z, uOut.w, s);
  float dg = length(P - uGrow.xyz);
  float reveal = 1.0 - smoothstep(uGrow.w - 2.0, uGrow.w, dg);
  if (fade * reveal <= 0.0 && uNumHits == 0) discard;
  vec3 N = normalize(q / uR);
  float fres = pow(1.0 - abs(dot(N, V)), 2.5);
  // the cells: around the along axis (from the outer rim up over the crown) × world units along it
  vec2 al = vec2(-uOut.y, uOut.x);
  float rm = sqrt(abs(dot(uR.xy, uOut.xy)) * uR.z), ra = abs(dot(uR.xy, al));
  vec2 uv = vec2(atan(q.z, s) * rm, dot(P.xy - uC.xy, al)) / uMisc.z;
  vec4 hx = hexCell(uv);
  // impacts light up whole cells (by their centre's distance) and ripple outward
  vec2 cc = (uv - hx.xy) * uMisc.z;                // the cell's centre: lon · rm, along
  float qa = clamp(cc.y / ra, -1.0, 1.0), lon = cc.x / rm, rr = sqrt(1.0 - qa * qa);
  vec3 PC = uC + uR * vec3(uOut.xy * cos(lon) * rr + al * qa, sin(lon) * rr);
  float boost = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNumHits) break;
    vec4 h = uHit[i];
    float k = 1.0 - h.w, d = length(PC - h.xyz), big = 1.0 + 0.6 * uHitK[i].x, ring = abs(d - h.w * 3.2 * big);
    boost += (max(0.0, 1.0 - d / (2.2 * big)) * 1.6 + max(0.0, 1.0 - ring / 0.6) * 0.8) * k;
  }
  if (fade * (reveal + boost) <= 0.0) discard;
  vec2 ap = abs(hx.xy);
  float e = 0.5 - max(dot(ap, HS * 0.5), ap.x);   // 0 on a cell's edge, 0.5 in its middle
  float w = fwidth(e);
  float line = 1.0 - smoothstep(0.015, 0.015 + 1.5 * w + 0.025, e);
  float cn = fract(sin(dot(hx.zw, vec2(12.9898, 78.233))) * 43758.5453);
  float shim = 0.75 + 0.25 * sin(uMisc.x * 1.7 + cn * 6.2832);
  float rim = exp(-P.z / 0.12);                    // where it meets the deck plane: the curtain's base line
  float front = uGrow.w < 80.0 ? exp(-pow((dg - uGrow.w + 0.6) / 0.7, 2.0)) : 0.0;   // the growing edge
  float k = uCol.w * reveal * fade;
  float I = k * (line * (0.07 + 1.0 * fres) * shim + 0.006 + 0.22 * fres + 0.5 * rim) + front * fade * 0.8;
  I += boost * fade * (0.3 + line * 1.2 + 0.3 * (1.0 - smoothstep(0.0, 0.3, e)));
  if (uMisc.y > 0.5) I *= 0.45;                    // the far wall, seen through the near one
  vec3 col = uCol.rgb * I + vec3(0.8, 0.9, 1.0) * boost * fade * line * 0.25;
  gl_FragDepth = clamp(0.5 - (P.y * ${COS.toFixed(6)} + P.z * ${SIN.toFixed(6)}) * uDepthScale, 0.0, 1.0);
  outColor = vec4(col, 1.0);
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
    P = { sprite: program(VS_SPRITE, FS_SPRITE), spriteDepth: program(VS_SPRITE, FS_SPRITE.replace('precision highp float;', '#define DEPTH_ONLY\nprecision highp float;')), layer: program(VS_FULL, FS_LAYER), bright: program(VS_FULL, FS_BRIGHT),
          blur: program(VS_FULL, FS_BLUR), comp: program(VS_FULL, FS_COMPOSITE), shPass: program(VS_FULL, FS_SHPASS), shBlur: program(VS_FULL, FS_SHBLUR),
          dome: program(VS_RECT, FS_DOME), backGlow: program(VS_FULL, FS_GLOWS), backRects: program(VS_RECTS, FS_COLOR) };
  } catch (e) { console.warn('[gfx]', e); return off('shader error'); }
  for (const prog of [P.sprite, P.layer, P.shPass]) {   // the lighting's samplers live on units 4..8 (no clash with units 0..3)
    gl.useProgram(prog.p); gl.uniform1i(prog.u.uLights, 4); gl.uniform1i(prog.u.uTiles, 5); gl.uniform1i(prog.u.uDepthBuf, 6);
    gl.uniform1i(prog.u.uShadowV, 7); gl.uniform1i(prog.u.uShadowD, 8);
  }

  // geometry: a unit quad (location 0); the instances come from instTex (see INST)
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quadBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const INST_UNIT = 9;                               // instTex stays bound on this texture unit (nothing else uses it)
  const instTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + INST_UNIT); gl.bindTexture(gl.TEXTURE_2D, instTex);
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.activeTexture(gl.TEXTURE0);
  let inst = new Float32Array(INST * INST_ROW * 8), instRows = 0;
  for (const prog of [P.sprite, P.spriteDepth]) { gl.useProgram(prog.p); gl.uniform1i(prog.u.uInst, INST_UNIT); }
  const vaoFull = gl.createVertexArray();            // full-screen passes: just the quad
  gl.bindVertexArray(vaoFull);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const vaoRects = gl.createVertexArray(), rectBuf = gl.createBuffer();   // the backdrop's rects: the quad + a rect and colour per instance
  gl.bindVertexArray(vaoRects);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, rectBuf);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

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
  function arrayTex(w, h, layers, data) {             // RGBA8 layers, linear filtering
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, w, h, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D_ARRAY, k, v);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    return t;
  }
  const litArr = arrayTex(1, 1, 1, new Uint8Array([255, 255, 255, 255]));   // the soft shadows' unit when there are none
  function bindArr(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); }

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
  // The shadows' depth buffer, RG32F (RG16F without EXT_float_blend): the depth of the front-most
  // solid lit pixel and whether it casts shadows. depthPass() draws it first every frame, into its own
  // framebuffer that shares the scene's depth renderbuffer; the shadows and the lighting then read it.
  function depthTex(w, h, fmt) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (fmt === 'r16') gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.HALF_FLOAT, null);
    else if (!floatBlend) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, w, h, 0, gl.RG, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, w, h, 0, gl.RG, gl.FLOAT, null);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  // The soft shadow buffers (1/SH_DIV resolution): the visibility channels (SH_LAYERS RGBA8 layers)
  // and their depth (R16F), as one framebuffer; two of them, for the blur's ping-pong.
  function shadowTarget(w, h) {
    const T = { w, h, v: arrayTex(w, h, SH_LAYERS), d: depthTex(w, h, 'r16'), fb: gl.createFramebuffer() };
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.fb);
    const bufs = [];
    for (let i = 0; i < SH_LAYERS; i++) { gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, T.v, 0, i); bufs.push(gl.COLOR_ATTACHMENT0 + i); }
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + SH_LAYERS, gl.TEXTURE_2D, T.d, 0); bufs.push(gl.COLOR_ATTACHMENT0 + SH_LAYERS);
    gl.drawBuffers(bufs);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) { freeShadowTarget(T); return null; }
    return T;
  }
  function freeShadowTarget(T) { if (!T) return; gl.deleteFramebuffer(T.fb); for (const t of [T.v, T.d]) gl.deleteTexture(t); }
  // → false if the render targets can't be made (the context was lost mid-frame, a 0-sized canvas): skip
  // the frame and try again on the next one, rather than drawing into a null framebuffer.
  function ensureTargets(w, h) {
    if (!targets(w, h)) {
      if (RT) { for (const k of ['scene', 'a1', 'b1', 'a2', 'b2']) freeT(RT[k]); freeT(RT.depth); freeShadowTarget(RT.sh0); freeShadowTarget(RT.sh1); }
      RT = null; return false;
    }
    return true;
  }
  function targets(w, h) {
    if (RT && RT.w === w && RT.h === h) return !!(RT.scene && RT.a1 && RT.b1 && RT.a2 && RT.b2);
    if (RT) { for (const k of ['scene', 'a1', 'b1', 'a2', 'b2']) freeT(RT[k]); freeT(RT.depth); freeShadowTarget(RT.sh0); freeShadowTarget(RT.sh1); }
    let scene = useHdr && target(w, h, true, true);
    if (!scene) { useHdr = false; scene = target(w, h, true, false); }
    const w1 = Math.max(1, w >> 1), h1 = Math.max(1, h >> 1), w2 = Math.max(1, w >> 3), h2 = Math.max(1, h >> 3);
    RT = { w, h, scene, a1: target(w1, h1, false, useHdr), b1: target(w1, h1, false, useHdr), a2: target(w2, h2, false, useHdr), b2: target(w2, h2, false, useHdr), depth: null };
    if (useHdr && shadowsWanted) {                     // shadows need a float colour attachment
      const D = { t: depthTex(w, h), fb: gl.createFramebuffer(), rb: null, w, h };
      gl.bindFramebuffer(gl.FRAMEBUFFER, D.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, D.t, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, scene.rb);   // shared: not freed with D
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) RT.depth = D;
      else freeT(D);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (RT.depth) {                                  // the soft shadow buffers (without them: the old per-pixel march)
        const sw = Math.max(1, Math.ceil(w / SH_DIV)), sh = Math.max(1, Math.ceil(h / SH_DIV));
        RT.sh0 = shadowTarget(sw, sh); RT.sh1 = RT.sh0 && shadowTarget(sw, sh);
        if (!RT.sh1) { freeShadowTarget(RT.sh0); RT.sh0 = null; }
      }
    }
    return !!(RT.scene && RT.a1 && RT.b1 && RT.a2 && RT.b2);
  }
  // Light data and the per-tile light lists (see LIGHTING)
  function dataTex() {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  }
  const lightTex = dataTex(), tileTex = dataTex();
  const lightData = new Float32Array(LIGHT_TEXELS * 4 * MAX_LIGHTS);
  gl.bindTexture(gl.TEXTURE_2D, lightTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, LIGHT_TEXELS, MAX_LIGHTS, 0, gl.RGBA, gl.FLOAT, lightData);
  let tileData = new Uint8Array(0), tileW = 0, tileH = 0, tileSize = 64, tileTexW = 0, tileTexH = 0;
  let shadowsWanted = true, softReady = false;
  // Procedural floor wear (FLOOR_WEAR): on unless ?noscratch or GFX.setScratches(false) (remembered).
  let scratchOn = true;
  try { if (/[?&]noscratch\b/.test(search) || localStorage.getItem('mn-gfx-scratch') === '0') scratchOn = false; } catch (e) { /* no storage */ }
  // The hairlines along the crew's paths (FW_PATH, js/walkfield.js): on unless ?nopathscratch or
  // GFX.setPathScratches(false) (remembered); off, the floor is exactly as before.
  let pathScratchOn = true;
  try { if (/[?&]nopathscratch\b/.test(search) || localStorage.getItem('mn-gfx-pathscratch') === '0') pathScratchOn = false; } catch (e) { /* no storage */ }
  const WEAR = { fine: 1, gouge: 0.07, tape: 0.1 };   // fine scratch density, deep gouge chance per plate cell, tape chance per 2 x 2 tile
  try { if (/[?&]noshadows\b/.test(search) || localStorage.getItem('mn-gfx-shadows') === '0') shadowsWanted = false; } catch (e) { /* no storage */ }

  // --- the sprite atlas: sprites.json + pages, loaded lazily per page --------------------------------
  let MAN = null, META = null, HR = 4;
  const PAGES = {};                     // 'group/i' -> { state: 'loading' | 'ready' | 'failed', w, h, maps, tex: {b, n, h, m}, img: {b, m} }
  const BASE_URL = 'assets/sprites/';
  // Pages load without holding up a frame. (Decoded and uploaded in one go, a 4096² map stalled the game ~0.2 s, and a
  // group's maps all arrived together: the pirate base froze it for a second or two.) They're fetched and decoded off
  // the main thread (createImageBitmap), then uploaded a band of rows at a time within a byte budget per frame (pump).
  // GFX.stream(names) queues pages ('group' or 'group/i') to fetch in the background, one at a time, on a smaller
  // budget: a mission streams what its timeline will spawn (js/mission.js streamMission), so it's there in time.
  function loadImage(url) {
    if (typeof createImageBitmap === 'function')
      return fetch(url).then(r => { if (!r.ok) throw new Error('missing ' + url); return r.blob(); })
        .then(b => createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }));
    return new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('missing ' + url)); i.src = url; })
      .then(i => (i.decode ? i.decode().then(() => i, () => i) : i));
  }
  const UPLOADS = [], STREAM = [];      // bands left to upload: { p, k, src, t, y, mips }; pages to stream: [group, i]
  const BUDGET = { now: 24 << 20, bg: 4 << 20 };   // bytes uploaded per frame: for a page something waits for / streamed ahead
  function page(group, i, bg = false) {
    const key = group + '/' + i;
    let p = PAGES[key];
    if (p) { if (!bg) p.bg = false; return p; }      // (wanted now: a streamed page jumps the queue)
    const m = META.pages[group][i];
    p = PAGES[key] = { state: 'loading', w: m.w, h: m.h, maps: m.maps || '', tex: {}, img: {}, bg, left: 0 };
    const kinds = ['b', ...p.maps.split('')];
    Promise.all(kinds.map(k => loadImage(BASE_URL + m.file + (k === 'b' ? '' : '.' + k) + '.webp').catch(() => null))).then(imgs => {
      if (!imgs[0]) { p.state = 'failed'; console.warn('[gfx] missing page', key); return; }
      kinds.forEach((k, j) => {
        const src = imgs[j];
        if (!src) return;
        const mips = k === 'b' || k === 'm', t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texStorage2D(gl.TEXTURE_2D, mips ? Math.floor(Math.log2(Math.max(src.width, src.height))) + 1 : 1, gl.RGBA8, src.width, src.height);
        UPLOADS.push({ p, k, src, t, y: 0, mips }); p.left++;
        if (mips) p.img[k] = src;
      });
      p.state = 'uploading';
    });
    return p;
  }
  function uploadBand(u, budget) {
    const w = u.src.width, h = u.src.height, rows = Math.min(h - u.y, Math.max(16, Math.floor(budget / (w * 4))));
    gl.bindTexture(gl.TEXTURE_2D, u.t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, u.y);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, u.y, w, rows, gl.RGBA, gl.UNSIGNED_BYTE, u.src);
    gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    u.y += rows;
    if (u.y < h) return rows * w * 4;
    if (u.mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, u.mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (u.mips && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    u.p.tex[u.k] = u.t;
    if (!u.mips && u.src.close) u.src.close();       // (the colour and tint maps stay: tintRef reads them)
    if (--u.p.left === 0) u.p.state = 'ready';
    UPLOADS.splice(UPLOADS.indexOf(u), 1);
    return rows * w * 4;
  }
  function pump() {
    if (!api.on) return;
    const now = UPLOADS.filter(u => !u.p.bg);         // (what's wanted now goes first, on the bigger budget)
    let budget = now.length ? BUDGET.now : BUDGET.bg;
    for (const u of now.length ? now : UPLOADS.slice()) { if (budget <= 0) break; budget -= uploadBand(u, budget); }
    // the next streamed page: one at a time, and only while nothing else is loading
    if (!STREAM.length || Object.values(PAGES).some(p => p.state === 'loading' || p.state === 'uploading')) return;
    const [g, i] = STREAM.shift();
    page(g, i, true);
  }
  let streamLater = [];                 // (asked before sprites.json is in)
  function stream(names) {
    if (!META) { streamLater.push(...names); return; }
    for (const n of names) {
      const [g, i] = n.split('/'), pages = META.pages[g] || [];
      for (let j = 0; j < pages.length; j++) if ((i == null || +i === j) && !PAGES[g + '/' + j] && !STREAM.some(s => s[0] === g && s[1] === j)) STREAM.push([g, j]);
    }
  }
  requestAnimationFrame(function loop() { pump(); requestAnimationFrame(loop); });
  function pagesOf(S) {
    if (!S._pages) S._pages = [...new Set([...(S.f || []).filter(Boolean).map(f => f[0]), ...(S.bases || []).map(b => b[0])])];
    return S._pages;
  }
  function spriteReady(S) {
    if (S.dyn) return !!S.dyn.tex.b;
    if (S._ready) return true;                         // (a loaded page stays loaded)
    let ok = true;
    for (const i of pagesOf(S)) if (page(S.group, i).state !== 'ready') ok = false;
    return (S._ready = ok);
  }
  const pageOf = (S, i) => (S._pg || (S._pg = []))[i] || (S._pg[i] = page(S.group, i));   // (page() memoized on the sprite: no key string per call)
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
    if (D && (D.w !== w || D.h !== h || !!o.maps !== !!D.nmap)) { for (const t of Object.values(D.pg.tex)) gl.deleteTexture(t); D = null; }
    if (!D) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const pg = { state: 'ready', w, h, maps: '', tex: {}, img: {} }, ox = o.ox != null ? o.ox : w / 2, oy = o.oy != null ? o.oy : h / 2;
      const name = 'dyn/' + key;
      const S = DYNS[name] = { name, group: 'dyn', dyn: pg, ppu: o.ppu || 96, w, h, ox, oy, dirs: 1, frames: 1, maps: '', f: [[0, 0, 0, w, h, ox, oy]] };
      // (a CPU canvas: uploading a GPU-backed one makes the GPU process switch GL contexts twice per commit)
      D = DYN[key] = { name, S, pg, w, h, c, ctx: c.getContext('2d', { willReadFrequently: true }), commit() {
        if (!api.on) return;
        if (!pg.tex.b) pg.tex.b = texture(c, true);
        else {
          gl.bindTexture(gl.TEXTURE_2D, pg.tex.b);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); gl.generateMipmap(gl.TEXTURE_2D);
        }
        if (D.nmap && D.mapsDirty) for (const [k, px] of [['n', D.nmap], ['h', D.hmap]]) {   // { maps: true }: the normal and height maps too (when D.mapsDirty)
          if (!pg.tex[k]) pg.tex[k] = texture(new Uint8Array(4), false);
          gl.bindTexture(gl.TEXTURE_2D, pg.tex[k]);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
          D.mapsDirty = false;
        }
      } };
      if (o.maps) { D.nmap = new Uint8Array(w * h * 4); D.hmap = new Uint8Array(w * h * 4); D.mapsDirty = true; }
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
  const domes = [];
  let back = null;                                   // this frame's GFX.backdrop()
  const ovGeo = new Float32Array(MAX_OV * 4), ovT = new Float32Array(MAX_OV * 4), ovCol = new Float32Array(MAX_OV * 12);
  let numOv = 0;                                     // this frame's GFX.overlay()s
  let light = { ambient: [1, 1, 1], sun: null, areas: [], lights: [] };
  let userScale = null;
  try { const q = search.match(/[?&]gfxscale=([\d.]+)/); if (q) { userScale = +q[1]; localStorage.setItem('mn-gfx-scale', q[1]); } else { const s = localStorage.getItem('mn-gfx-scale'); if (s) userScale = +s; } } catch (e) { /* no storage */ }

  // 2D layers composited into the GL picture. What each frame's drawing covers is kept per DT x DT tile
  // (L.tiles: 1 = drawn this frame, 2 = drawn last frame, so cleared now and uploaded again) and as one box,
  // L.box [x0, y0, x1, y1] (device px; empty: x0 > x1). L.full: unknown, all of it.
  const L2D = {}, DT = 64;
  // Firefox (2D canvases in software here) copies the whole canvas for every upload from it, however small:
  // there the layers are CPU canvases and the changed tiles are read back (getImageData) and uploaded. Elsewhere
  // (Chrome: GPU canvases, where a read back stalls) one upload from the canvas of the changed tiles' box.
  const READBACK = typeof navigator !== 'undefined' && /Firefox\//.test(navigator.userAgent || '');
  const noBox = () => [Infinity, Infinity, -Infinity, -Infinity];
  // the tiles with any of the bits in `bits` set, as rects (runs along a row, merged down the rows while they
  // line up) → f(x0, y0, x1, y1) in device px
  function tileRuns(L, bits, f) {
    const tw = L.tw0, th = L.th0, T = L.tiles;
    let open = new Map();                              // 'i0,i1' → first row
    for (let j = 0; j <= th; j++) {
      const next = new Map();
      if (j < th) for (let i = 0; i < tw; i++) {
        if (!(T[j * tw + i] & bits)) continue;
        let k = i + 1;
        while (k < tw && (T[j * tw + k] & bits)) k++;
        const key = i + ',' + k;
        next.set(key, open.has(key) ? open.get(key) : j);
        open.delete(key);
        i = k;
      }
      for (const [key, j0] of open) { const [i0, i1] = key.split(',').map(Number); f(i0 * DT, j0 * DT, Math.min(W, i1 * DT), Math.min(H, j * DT)); }
      open = next;
    }
  }
  function layer2d(name) {
    if (!api.on) return null;
    let L = L2D[name];
    if (!L) {
      const c = document.createElement('canvas');
      L = L2D[name] = { c, g: c.getContext('2d', { willReadFrequently: READBACK }), tex: null, tw: 0, th: 0, used: -1, box: noBox(), full: true, reset: null, tiles: null, tw0: 0, th0: 0 };
      trackDirty(L);
    }
    if (L.c.width !== W || L.c.height !== H) {         // (resizing clears it and resets its state)
      L.c.width = W; L.c.height = H; L.reset(); L.full = true;
      L.tw0 = Math.ceil(W / DT); L.th0 = Math.ceil(H / DT); L.tiles = new Uint8Array(L.tw0 * L.th0);
    }
    if (L.used !== frameNo) {
      L.used = frameNo; L.g.setTransform(1, 0, 0, 1, 0, 0);
      const T = L.tiles;
      if (L.full) { L.g.clearRect(0, 0, W, H); T.fill(2); }
      else {
        tileRuns(L, 1, (x0, y0, x1, y1) => L.g.clearRect(x0, y0, x1 - x0, y1 - y0));
        for (let i = 0; i < T.length; i++) T[i] = T[i] & 1 ? 2 : T[i];   // (2s not uploaded yet stay 2)
      }
      L.box = noBox(); L.full = false;
    }
    return L.g;
  }
  // Wraps the layer context's drawing calls (on the instance) to grow L.box by what each one can touch: the
  // current path's points (through a copy of the transform), plus the line width, shadow and a pixel of
  // antialiasing. Anything it can't bound (Path2D, putImageData, arcTo, compositing that clears outside the
  // shape) sets L.full. A call whose box lies entirely off the canvas is skipped: it couldn't change a pixel
  // (the ship is drawn whole every frame, the camera shows about a room of it).
  function trackDirty(L) {
    const g = L.g, proto = Object.getPrototypeOf(g);
    let m = [1, 0, 0, 1, 0, 0], stack = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;     // the current path
    // ... and its pieces (a stroke marks each one: a long thin line doesn't dirty everything in its box):
    // seg holds x0, y0, x1, y1 per piece, ns pieces; lx, ly: the last point (NaN: none)
    let seg = new Float32Array(256), ns = 0, lx = NaN, ly = NaN;
    const piece = (a, b, c, d) => {
      if (ns * 4 + 4 > seg.length) { if (seg.length >= 1 << 16) { ns = 0; seg[0] = x0; seg[1] = y0; seg[2] = x1; seg[3] = y1; ns = 1; return; } const n = new Float32Array(seg.length * 2); n.set(seg); seg = n; }
      seg[ns * 4] = a; seg[ns * 4 + 1] = b; seg[ns * 4 + 2] = c; seg[ns * 4 + 3] = d; ns++;
    };
    L.reset = () => { m = [1, 0, 0, 1, 0, 0]; stack = []; x0 = y0 = Infinity; x1 = y1 = -Infinity; ns = 0; lx = ly = NaN; };
    const pt = (x, y, join) => {
      const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5];
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
      if (join && lx === lx) piece(Math.min(lx, X), Math.min(ly, Y), Math.max(lx, X), Math.max(ly, Y));
      else piece(X, Y, X, Y);
      lx = X; ly = Y;
    };
    const ell = (x, y, r) => {                                         // a circle (or an ellipse's bounding circle)
      const X = m[0] * x + m[2] * y + m[4], Y = m[1] * x + m[3] * y + m[5], ex = r * (Math.abs(m[0]) + Math.abs(m[2])), ey = r * (Math.abs(m[1]) + Math.abs(m[3]));
      if (X - ex < x0) x0 = X - ex; if (X + ex > x1) x1 = X + ex; if (Y - ey < y0) y0 = Y - ey; if (Y + ey > y1) y1 = Y + ey;
      if (lx === lx) piece(Math.min(lx, X - ex), Math.min(ly, Y - ey), Math.max(lx, X + ex), Math.max(ly, Y + ey));   // (the line from the last point to its start)
      else piece(X - ex, Y - ey, X + ex, Y + ey);
      lx = X; ly = Y;                                                  // (about where it ends: within its box)
    };
    const curve = (pts) => {                                           // a curve: the box of its control points
      const fx = lx, fy = ly;
      let a = fx === fx ? fx : Infinity, b = fy === fy ? fy : Infinity, c = fx === fx ? fx : -Infinity, d = fy === fy ? fy : -Infinity;
      for (let k = 0; k < pts.length; k += 2) {
        const X = m[0] * pts[k] + m[2] * pts[k + 1] + m[4], Y = m[1] * pts[k] + m[3] * pts[k + 1] + m[5];
        if (X < a) a = X; if (X > c) c = X; if (Y < b) b = Y; if (Y > d) d = Y; lx = X; ly = Y;
      }
      if (a < x0) x0 = a; if (c > x1) x1 = c; if (b < y0) y0 = b; if (d > y1) y1 = d;
      piece(a, b, c, d);
    };
    const GLOBAL_OPS = { copy: 1, 'source-in': 1, 'source-out': 1, 'destination-in': 1, 'destination-atop': 1 };
    // how far (device px) a call's pixels can reach past its shape: a pixel of antialiasing, half the line width
    // (line width in user units; miter joins: times the miter limit), the shadow. -1: anywhere (a compositing mode
    // that clears outside the shape, a filter). Read once per call: the context's getters aren't free.
    const pad = (line) => {
      if (GLOBAL_OPS[g.globalCompositeOperation] || g.filter !== 'none' && g.filter) return -1;
      let e = 2;
      if (line) e += line * Math.max(Math.hypot(m[0], m[1]), Math.hypot(m[2], m[3])) * (g.lineJoin === 'miter' ? Math.max(1, g.miterLimit) : 1) * 0.5;
      if (g.shadowBlur > 0 || g.shadowOffsetX || g.shadowOffsetY) e += g.shadowBlur * 2 + Math.abs(g.shadowOffsetX) + Math.abs(g.shadowOffsetY);
      return e;
    };
    // marks the tiles a device px box (grown by e = pad()) touches; false if it lies entirely off the canvas
    const mark = (bx0, by0, bx1, by1, e) => {
      if (e < 0) { L.full = true; return true; }
      if (!(bx0 <= bx1)) return true;                                  // (an empty path, NaN: left to the canvas)
      const X0 = Math.max(0, Math.floor(bx0 - e)), Y0 = Math.max(0, Math.floor(by0 - e)), X1 = Math.min(W, Math.ceil(bx1 + e)), Y1 = Math.min(H, Math.ceil(by1 + e));
      if (X1 <= X0 || Y1 <= Y0) return false;
      if (L.full) return true;
      const b = L.box;
      if (X0 < b[0]) b[0] = X0; if (Y0 < b[1]) b[1] = Y0; if (X1 > b[2]) b[2] = X1; if (Y1 > b[3]) b[3] = Y1;
      const T = L.tiles, tw = L.tw0, i1 = Math.ceil(X1 / DT), j1 = Math.ceil(Y1 / DT);
      for (let j = Math.floor(Y0 / DT); j < j1; j++) for (let i = Math.floor(X0 / DT); i < i1; i++) T[j * tw + i] |= 1;
      return true;
    };
    const rectBox = (x, y, w, h, line) => {                            // a rect in user units → mark (keeps the path)
      const ax = m[0] * x, bx = m[0] * (x + w), ay = m[1] * x, by = m[1] * (x + w), cx = m[2] * y, dx = m[2] * (y + h), cy = m[3] * y, dy = m[3] * (y + h);
      return mark(Math.min(ax, bx) + Math.min(cx, dx) + m[4], Math.min(ay, by) + Math.min(cy, dy) + m[5],
        Math.max(ax, bx) + Math.max(cx, dx) + m[4], Math.max(ay, by) + Math.max(cy, dy) + m[5], pad(line));
    };
    const rectPath = (x, y, w, h) => { pt(x, y, false); pt(x + w, y, true); pt(x + w, y + h, true); pt(x, y + h, true); pt(x, y, true); };
    const wrap = (name, before) => {                                   // (before() returning false: skip the call, it draws nothing on the canvas)
      const orig = proto[name];
      if (typeof orig !== 'function') return;
      g[name] = function (a, b, c, d, e, f, h, i, j) { if (before(a, b, c, d, e, f, h, i, j, arguments.length) === false) return; return orig.apply(g, arguments); };
    };
    wrap('save', () => { stack.push(m.slice()); });
    wrap('restore', () => { if (stack.length) m = stack.pop(); });
    wrap('setTransform', (a, b, c, d, e, f, h, i, j, n) => {
      if (n === 0) m = [1, 0, 0, 1, 0, 0];
      else if (typeof a === 'object') m = [a.a ?? a.m11 ?? 1, a.b ?? a.m12 ?? 0, a.c ?? a.m21 ?? 0, a.d ?? a.m22 ?? 1, a.e ?? a.m41 ?? 0, a.f ?? a.m42 ?? 0];
      else m = [a, b, c, d, e, f];
    });
    wrap('resetTransform', () => { m = [1, 0, 0, 1, 0, 0]; });
    wrap('transform', (a, b, c, d, e, f) => { m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; });
    wrap('translate', (x, y) => { m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; });
    wrap('scale', (sx, sy) => { m[0] *= sx; m[1] *= sx; m[2] *= sy; m[3] *= sy; });
    wrap('rotate', (r) => { const c = Math.cos(r), s = Math.sin(r); m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, m[2] * c - m[0] * s, m[3] * c - m[1] * s, m[4], m[5]]; });
    wrap('beginPath', () => { x0 = y0 = Infinity; x1 = y1 = -Infinity; ns = 0; lx = ly = NaN; });
    wrap('moveTo', (x, y) => pt(x, y, false));
    wrap('lineTo', (x, y) => pt(x, y, true));
    wrap('quadraticCurveTo', (a, b, x, y) => curve([a, b, x, y]));
    wrap('bezierCurveTo', (a, b, c, d, x, y) => curve([a, b, c, d, x, y]));
    wrap('arc', (x, y, r) => ell(x, y, r));
    wrap('ellipse', (x, y, rx, ry) => ell(x, y, Math.max(rx, ry)));
    wrap('rect', (x, y, w, h) => rectPath(x, y, w, h));
    wrap('roundRect', (x, y, w, h) => rectPath(x, y, w, h));
    wrap('arcTo', (a, b, c, d) => { L.full = true; curve([a, b, c, d]); });   // (its arc lies within the corner's triangle: the box, for skipping)
    wrap('closePath', () => { if (ns && lx === lx) piece(lx, ly, lx, ly); });   // (the closing line lies within the path's box: fills mark that box anyway)
    wrap('fill', (a) => { if (typeof a === 'object' && a) { L.full = true; return; } return mark(x0, y0, x1, y1, pad(0)); });
    wrap('stroke', (a) => {
      if (typeof a === 'object' && a) { L.full = true; return; }
      const e = pad(g.lineWidth);
      if (ns > 64 || e < 0) return mark(x0, y0, x1, y1, e);            // (many pieces: the whole box is as good)
      if (!ns) return;
      let on = false;
      for (let k = 0; k < ns; k++) if (mark(seg[k * 4], seg[k * 4 + 1], seg[k * 4 + 2], seg[k * 4 + 3], e)) on = true;
      return on;
    });
    wrap('fillRect', (x, y, w, h) => rectBox(x, y, w, h, 0));
    wrap('strokeRect', (x, y, w, h) => rectBox(x, y, w, h, g.lineWidth));
    let lastFont = '', lastFs = 48;
    const textBox = (t, x, y, mw, line) => {
      const font = g.font;
      if (font !== lastFont) { lastFont = font; lastFs = +((/([\d.]+)px/.exec(font) || [])[1] || 48); }
      const fs = lastFs, al = g.textAlign, ls = parseFloat(g.letterSpacing) || 0;
      const box = (w) => { w += fs * 0.5; const x0 = al === 'center' ? x - w / 2 : al === 'right' || al === 'end' ? x - w : x;   // (left-to-right text)
        return rectBox(x0 - fs * 0.25, y - fs * 1.3, w + fs * 0.5, fs * 2.6, line); };
      // far off the canvas (no glyph is 2 em wide): skipped before measuring it (stencils, labels round the whole ship)
      const most = t.length * (2 * fs + Math.max(0, ls) * (/em$/.test(g.letterSpacing) ? fs : 1));
      if (!box(mw != null ? Math.min(mw, most) : most)) return false;
      const w = g.measureText(t).width;
      return box(mw != null ? Math.min(mw, w) : w);
    };
    wrap('fillText', (t, x, y, mw) => textBox(String(t), x, y, mw, 0));
    wrap('strokeText', (t, x, y, mw) => textBox(String(t), x, y, mw, g.lineWidth));
    wrap('drawImage', (img, a, b, c, d, e, f, h, i, n) => {
      if (n >= 9) return rectBox(e, f, h, i, 0);
      if (n >= 5) return rectBox(a, b, c, d, 0);
      return rectBox(a, b, img.width || 0, img.height || 0, 0);
    });
    wrap('putImageData', () => { L.full = true; });
  }
  // Uploads what changed since the last upload: this frame's drawing and last frame's (now cleared), as one box.
  function uploadLayer(L) {
    gl.bindTexture(gl.TEXTURE_2D, L.tex || (L.tex = gl.createTexture()));
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (L.tw !== W || L.th !== H) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, L.c);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      L.tw = W; L.th = H;
      return;
    }
    const T = L.tiles;
    if (L.full) T.fill(1);
    let n = 0;
    for (let i = 0; i < T.length; i++) if (T[i]) n++;
    if (n === T.length) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, L.c);
    else if (n && !READBACK) {
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      tileRuns(L, 3, (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); });
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, x1 - x0, y1 - y0, gl.RGBA, gl.UNSIGNED_BYTE, L.c);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0); gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    } else if (n) {
      tileRuns(L, 3, (x0, y0, x1, y1) => {
        const d = L.g.getImageData(x0, y0, x1 - x0, y1 - y0);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, x0, y0, x1 - x0, y1 - y0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(d.data.buffer));
      });
    }
    for (let i = 0; i < T.length; i++) T[i] &= 1;     // (the cleared ones are uploaded now)
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
    queue.length = 0; seq = 0; picks = []; domes.length = 0; back = null; numOv = 0;
    light ={ ambient: [1, 1, 1], sun: null, areas: [], lights: [] };
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
    const t = o.tint ? rgb(o.tint) : o.recolor ? rgb(o.recolor) : null, useMask = !!o.tint && (S.maps || '').includes('m'), fl = o.floor && scratchOn ? o.floor : null, fp = fl && pathScratchOn && fl.length > 8;
    queue.push({
      layer: LAYERS[o.layer] ?? 3, sortY: o.sortY != null ? o.sortY : y, seq: seq++, page: S.dyn || pageOf(S, b[0]), mask: useMask,
      d: [sx, sy, k, flip, qx0, qy0, qx1 - qx0, qy1 - qy0, bx, by, b[3], b[4], px, py, pw, ph,
          b[1] - bx, b[2] - by, patch ? fr[1] - px : 0, patch ? fr[2] - py : 0, x, y, z, ppu, S.ox, S.oy, sc, o.depthBias || 0,
          t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0, useMask ? 1 : !o.tint && o.recolor ? -1 : 0, useMask ? tintRef(S) : 0.45, o.emissive || 0, o.alpha == null ? 1 : o.alpha, (o.unlit ? 1 : 0) + (o.billboard ? 2 : 0), o.rot || 0, o.sx || 1, o.desat || 0, fl ? fl[0] : 0,
          fl ? fl[1] : 0, fl ? fl[2] : 0, fl ? fl[3] : 0, fl ? fl[4] : 0,
          fp ? fl[5] : 0, fp ? fl[6] : 0, fp ? fl[7] : 0, fp ? fl[8] : 0],
      depthWrite: o.depthWrite !== false,
      // anything for depthPass(): it writes the depth buffer, or can be a solid lit pixel
      inDepth: ((LAYERS[o.layer] ?? 3) === 2 || (LAYERS[o.layer] ?? 3) === 3) && o.depthWrite !== false || !o.unlit && !(o.alpha <= 0.6),
    });
    return true;
  }

  const areaRect = new Float32Array(MAX_AREAS * 4), areaCol = new Float32Array(MAX_AREAS * 4), wallSeg = new Float32Array(MAX_WALLS * 4);
  function setLightUniforms(u) {
    const L = light;
    gl.uniform3fv(u.uAmbient, L.ambient);
    const sun = L.sun, sd = sun && sun.dir ? sun.dir : [0, 0, 1], n = Math.hypot(...sd) || 1;
    gl.uniform3f(u.uSunDir, sd[0] / n, sd[1] / n, sd[2] / n);
    gl.uniform3fv(u.uSunCol, sun && sun.color ? sun.color : [0, 0, 0]);
    gl.uniform1f(u.uSunK, sun ? (sun.k == null ? 1 : sun.k) : 0);
    const areas = L.areas || [], na = Math.min(areas.length, MAX_AREAS), ar = areaRect.fill(0), ac = areaCol.fill(0);
    for (let i = 0; i < na; i++) {
      const a = areas[i], j = i * 4;
      ar[j] = a.x; ar[j + 1] = a.y; ar[j + 2] = a.x + a.w; ar[j + 3] = a.y + a.h;
      ac[j] = a.color[0]; ac[j + 1] = a.color[1]; ac[j + 2] = a.color[2]; ac[j + 3] = a.sun || 0;
    }
    gl.uniform4fv(u.uAreaRect, ar); gl.uniform4fv(u.uAreaCol, ac); gl.uniform1i(u.uNumAreas, na);
    const walls = L.walls || [], nw = Math.min(walls.length, MAX_WALLS), ws = wallSeg.fill(0);
    let wy = Infinity;
    for (let i = 0; i < nw; i++) { ws.set(walls[i], i * 4); wy = Math.min(wy, walls[i][1], walls[i][3]); }
    if (u.uWallSeg) gl.uniform4fv(u.uWallSeg, ws);
    if (u.uWallInfo) gl.uniform4f(u.uWallInfo, nw, L.wallHeight || 1.6, nw ? wy - 0.5 : 1e9, 0);
    const shadows = !!(RT && RT.depth);
    gl.uniform4i(u.uTileInfo, tileSize, H, shadows ? 1 : 0, 0);
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, lightTex); gl.uniform1i(u.uLights, 4);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, tileTex); gl.uniform1i(u.uTiles, 5);
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, shadows ? RT.depth.t : zero); gl.uniform1i(u.uDepthBuf, 6);
    const soft = shadows && softReady ? RT.sh0 : null;  // (no channel is used without them: cullLights)
    bindArr(7, soft ? soft.v : litArr);
    gl.activeTexture(gl.TEXTURE8); gl.bindTexture(gl.TEXTURE_2D, soft ? soft.d : zero);
    gl.uniform4f(u.uDCam, camOX, camOY, Sdev, 1 / W); gl.uniform1f(u.uDInvH, 1 / H);
    gl.activeTexture(gl.TEXTURE0);
  }
  // This frame's lights: drop the ones off screen, keep the MAX_LIGHTS strongest, write them into the
  // light texture and bin them into screen tiles (each tile keeps its TILE_SLOTS - 1 strongest).
  // A light: { x, y, z, color, radius, intensity, wrap (0.22), dir + cone (spot: direction it points,
  // half-angle in rad), x2, y2, z2 (a strip from (x, y, z) to there), shadow (true: casts shadows),
  // size (radius of the light's disc for the shadows' penumbra; default 0.08, spots 0.04) }.
  // Shadow-casting lights get a soft-shadow channel (0..SH_CH-1): greedily, strongest first, one that
  // no other light whose screen box (plus the blur's reach) overlaps uses; the rest (-1) march per pixel.
  const SH_MARGIN = (SH_BLUR + 2) * SH_DIV;
  const chBoxes = Array.from({ length: SH_CH }, () => []);
  function cullLights(softOn) {
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
    for (const B of chBoxes) B.length = 0;
    let marched = 0;
    for (const v of vis) {
      v.ch = -1;
      if (!v.l.shadow) continue;
      if (softOn) for (let c = 0; c < SH_CH; c++) {
        if (chBoxes[c].some(o => v.x0 - SH_MARGIN < o.x1 && v.x1 + SH_MARGIN > o.x0 && v.y0 - SH_MARGIN < o.y1 && v.y1 + SH_MARGIN > o.y0)) continue;
        chBoxes[c].push(v); v.ch = c; break;
      }
      if (v.ch < 0 && RT && RT.depth) marched++;
    }
    tileSize = Math.max(32, Math.ceil(W / 40), Math.ceil(H / 40));
    const tx = Math.ceil(W / tileSize), ty = Math.ceil(H / tileSize);
    if (tx * TILE_SLOTS !== tileW || ty !== tileH) { tileW = tx * TILE_SLOTS; tileH = ty; tileData = new Uint8Array(tileW * tileH); }
    else tileData.fill(0);
    vis.forEach((v, k) => {
      const l = v.l, o = k * LIGHT_TEXELS * 4, d = l.dir;
      lightData[o] = l.x; lightData[o + 1] = l.y; lightData[o + 2] = l.z || 0; lightData[o + 3] = v.r;
      lightData[o + 4] = v.c[0] * v.i; lightData[o + 5] = v.c[1] * v.i; lightData[o + 6] = v.c[2] * v.i; lightData[o + 7] = l.wrap == null ? 0.22 : l.wrap;
      if (d && l.cone) { const n = Math.hypot(d[0], d[1], d[2]) || 1; lightData[o + 8] = d[0] / n; lightData[o + 9] = d[1] / n; lightData[o + 10] = d[2] / n; lightData[o + 11] = Math.cos(l.cone); }
      else { lightData[o + 8] = 0; lightData[o + 9] = 0; lightData[o + 10] = -1; lightData[o + 11] = -2; }
      lightData[o + 12] = v.strip ? l.x2 : l.x; lightData[o + 13] = v.strip ? l.y2 : l.y; lightData[o + 14] = v.strip ? (l.z2 == null ? l.z || 0 : l.z2) : l.z || 0;
      lightData[o + 15] = (v.strip ? 1 : 0) + (l.shadow ? 2 : 0);
      lightData[o + 16] = l.size != null ? l.size : d && l.cone ? 0.04 : 0.08; lightData[o + 17] = v.ch;
      const i0 = Math.max(0, Math.floor(v.x0 / tileSize)), i1 = Math.min(tx - 1, Math.floor(v.x1 / tileSize));
      const j0 = Math.max(0, Math.floor(v.y0 / tileSize)), j1 = Math.min(ty - 1, Math.floor(v.y1 / tileSize));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const c0 = j * tileW + i * TILE_SLOTS, n = tileData[c0];
        if (n < TILE_SLOTS - 1) { tileData[c0 + 1 + n] = k; tileData[c0] = n + 1; }
      }
    });
    gl.bindTexture(gl.TEXTURE_2D, lightTex);
    if (vis.length) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LIGHT_TEXELS, vis.length, gl.RGBA, gl.FLOAT, lightData, 0);
    gl.bindTexture(gl.TEXTURE_2D, tileTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (tileTexW !== tileW || tileTexH !== tileH) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8UI, tileW, tileH, 0, gl.RED_INTEGER, gl.UNSIGNED_BYTE, tileData); tileTexW = tileW; tileTexH = tileH; }
    else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, tileW, tileH, gl.RED_INTEGER, gl.UNSIGNED_BYTE, tileData);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    api.stats.lights = vis.length;
    api.stats.shadow = { soft: chBoxes.reduce((n, B) => n + B.length, 0), channels: chBoxes.filter(B => B.length).length, marched };
  }

  // This frame's depth for the shadows, before anything is lit (FS_SPRITE built with DEPTH_ONLY: the
  // beauty's alpha and the height map, no lighting): the same sprites in the same order, with the same
  // depth test and blending as the scene pass, so it holds what the scene will show. (The shadows used
  // to march through LAST frame's depth, so whatever moved dragged its shadow a frame behind.)
  function depthPass(groups) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, RT.depth.fb);
    gl.viewport(0, 0, W, H);
    gl.clearBufferfv(gl.COLOR, 0, [-1000, 0, 0, 0]);
    gl.clearDepth(1); gl.depthMask(true); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const prog = P.spriteDepth, u = prog.u;
    gl.useProgram(prog.p);
    gl.uniform2f(u.uView, W, H); gl.uniform1f(u.uHR, HR); gl.uniform1f(u.uDepthScale, DEPTH_SCALE);
    gl.uniform1i(u.uBeauty, 0); gl.uniform1i(u.uHeight, 2);
    for (const items of groups) drawQueue(items.filter(it => it.inDepth), prog);
  }

  // The soft shadows for this frame (FS_SHPASS, then FS_SHBLUR across and down) into RT.sh0, after
  // depthPass() and before the scene is drawn.
  function shadowPass() {
    const A = RT.sh0, B = RT.sh1;
    gl.bindVertexArray(vaoFull);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(false);
    bindArr(7, litArr); bindTex(8, zero);              // no feedback loop: the lighting's soft-shadow units stay unbound here
    gl.bindFramebuffer(gl.FRAMEBUFFER, A.fb); gl.viewport(0, 0, A.w, A.h);
    const u = P.shPass.u;
    gl.useProgram(P.shPass.p);
    gl.uniform4f(u.uCam, camOX, camOY, Sdev, H);
    gl.uniform4i(u.uTileInfo, tileSize, H, 1, 0);
    bindTex(4, lightTex); bindTex(5, tileTex); bindTex(6, RT.depth.t);
    gl.uniform4f(u.uDCam, camOX, camOY, Sdev, 1 / W); gl.uniform1f(u.uDInvH, 1 / H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.useProgram(P.shBlur.p);
    const ub = P.shBlur.u;
    gl.uniform1i(ub.uV, 0); gl.uniform1i(ub.uD, 1);
    for (const [src, dst, dx, dy] of [[A, B, 1, 0], [B, A, 0, 1]]) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
      bindArr(0, src.v); bindTex(1, src.d);
      gl.uniform2i(ub.uDir, dx, dy);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    bindArr(0, null); bindTex(1, null);
    gl.activeTexture(gl.TEXTURE0);
  }

  function drawLayer2d(name, lit) {
    const L = L2D[name];
    if (!L || L.used !== frameNo) return;               // (uploaded at the start of end())
    const b = L.full ? [0, 0, W, H] : L.box;
    if (!(b[0] < b[2] && b[1] < b[3])) return;          // nothing drawn: only where something was
    const u = P.layer.u;
    gl.bindVertexArray(vaoFull);
    gl.useProgram(P.layer.p);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, L.tex); gl.uniform1i(u.uTex, 0);
    gl.uniform1f(u.uLit, lit ? 1 : 0); gl.uniform1f(u.uEmissive, 0.45);
    gl.uniform4f(u.uCam, camOX, camOY, Sdev, Sdev * SIN); gl.uniform2f(u.uView, W, H);
    if (lit) setLightUniforms(u);
    gl.enable(gl.SCISSOR_TEST); gl.scissor(b[0], H - b[3], b[2] - b[0], b[3] - b[1]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
  }

  // All of this frame's sprites into the instance buffer, once (it.ii: where each one went), for
  // depthPass() and the scene pass.
  function uploadInstances(groups) {
    let n = 0;
    for (const g of groups) n += g.length;
    const rows = Math.max(1, Math.ceil(n / INST_ROW));
    if (inst.length < rows * INST_ROW * INST) inst = new Float32Array(Math.max(rows, inst.length / (INST_ROW * INST) * 2) * INST_ROW * INST);
    n = 0;
    for (const g of groups) for (const it of g) { inst.set(it.d, n * INST); it.ii = n++; }
    gl.activeTexture(gl.TEXTURE0 + INST_UNIT); gl.bindTexture(gl.TEXTURE_2D, instTex);
    if (instRows < rows) {                             // (re)allocate: as many rows as inst holds
      instRows = inst.length / (INST_ROW * INST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, INST_ROW * INST / 4, instRows, 0, gl.RGBA, gl.FLOAT, inst);
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, INST_ROW * INST / 4, rows, gl.RGBA, gl.FLOAT, inst, 0);
    gl.activeTexture(gl.TEXTURE0);
  }
  function drawQueue(items, prog = P.sprite) {
    if (!items.length) return;
    gl.bindVertexArray(vao);
    const u = prog.u, bound = [undefined, undefined, undefined, undefined];   // (only the GL state that changes between batches is set)
    let i = 0, mode = -1, pw = -1, ph = -1, hm = -1;
    const modeOf = (it) => (it.layer === 2 || it.layer === 3 ? (it.depthWrite ? 2 : 1) : 0);   // 0: no depth test; 1: test; 2: test + write
    const bind = (unit, t) => { if (bound[unit] !== t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); bound[unit] = t; } };
    while (i < items.length) {
      const a = items[i], m = modeOf(a);
      let j = i + 1;
      while (j < items.length && items[j].ii === a.ii + j - i && items[j].page === a.page && modeOf(items[j]) === m) j++;
      if (m !== mode) {
        if (m) { if (mode <= 0) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); } gl.depthMask(m === 2); }
        else { gl.disable(gl.DEPTH_TEST); gl.depthMask(false); }
        mode = m;
      }
      const p = a.page;
      bind(0, p.tex.b); bind(1, p.tex.n || flatNormal); bind(2, p.tex.h || zero); bind(3, p.tex.m || zero);
      if (p.w !== pw || p.h !== ph) { gl.uniform2f(u.uPage, p.w, p.h); pw = p.w; ph = p.h; }
      const has = p.tex.m ? 1 : 0;
      if (has !== hm) { gl.uniform1f(u.uHasMask, has); hm = has; }
      gl.uniform1i(u.uFirst, a.ii);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, j - i);
      api.stats.batches++;
      i = j;
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  // GFX.dome(d): queue a shield dome for this frame (see FS_DOME and the header).
  function dome(d) { if (api.on && active) domes.push(d); }
  function drawDomes() {
    if (!domes.length) return;
    gl.bindVertexArray(vaoFull);
    gl.useProgram(P.dome.p);
    const u = P.dome.u;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(false);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform2f(u.uView, W, H); gl.uniform4f(u.uCam, camOX, camOY, Sdev, H); gl.uniform1f(u.uDepthScale, DEPTH_SCALE);
    const hit = new Float32Array(32), hitK = new Float32Array(32);
    for (const d of domes) {
      const [cx, cy, cz] = d.c, [rx, ry, rz] = d.r;
      const f0 = d.fade ? d.fade[0] : -0.05;
      const span = (c, r, o) => (o ? [c + o * r * f0, c + o * r] : [c - r, c + r]);   // only the side it stands on
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;   // screen box of that part of the ellipsoid's upper half
      for (const X of span(cx, rx, d.out[0])) for (const Y of span(cy, ry, d.out[1])) for (const Z of [Math.max(0, cz - rz), cz + rz]) {
        const [sx, sy] = toDev(X, Y, Z);
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
      if (x1 <= x0 || y1 <= y0) continue;
      const hits = (d.hits || []).slice(0, 8);
      hit.fill(0); hitK.fill(0);
      hits.forEach((h, i) => { hit.set([h.x, h.y, h.z, h.age], i * 4); hitK[i * 4] = h.heavy ? 1 : 0; });
      gl.uniform4f(u.uRect, x0, y0, x1, y1);
      gl.uniform3f(u.uC, cx, cy, cz); gl.uniform3f(u.uR, rx, ry, rz);
      gl.uniform4f(u.uOut, d.out[0], d.out[1], d.fade ? d.fade[0] : -0.05, d.fade ? d.fade[1] : 0.45);
      const g = d.grow || [cx, cy, cz, 1e4];
      gl.uniform4f(u.uGrow, g[0], g[1], g[2], g[3]);
      gl.uniform4f(u.uCol, d.color[0], d.color[1], d.color[2], d.strength == null ? 1 : d.strength);
      gl.uniform4fv(u.uHit, hit); gl.uniform4fv(u.uHitK, hitK); gl.uniform1i(u.uNumHits, hits.length);
      for (const back of [1, 0]) {
        gl.uniform4f(u.uMisc, d.time || 0, back, d.cell || 0.9, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  // GFX.overlay(cx, cy, r0, r1, stops): a screen-space radial gradient over the picture (see the header)
  function overlay(cx, cy, r0, r1, stops) {
    if (!api.on || !active || numOv >= MAX_OV || !stops || !stops.length) return false;
    const i = numOv++, n = Math.min(3, stops.length);
    ovGeo.set([cx * K, cy * K, r0 * K, r1 * K], i * 4);
    ovT.set([stops[0][0], n > 1 ? stops[1][0] : 1, n > 2 ? stops[2][0] : 1, n], i * 4);
    for (let k = 0; k < 3; k++) { const s = stops[Math.min(k, n - 1)]; ovCol.set([s[1][0] / 255, s[1][1] / 255, s[1][2] / 255, s[2]], (i * 3 + k) * 4); }
    return true;
  }
  // GFX.backdrop(b): space behind everything this frame (see the header)
  function backdrop(b) { if (api.on && active) back = b; }
  function drawBackdrop() {
    if (!back) return;
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND);
    gl.bindVertexArray(vaoFull);
    const u = P.backGlow.u, gs = (back.glows || []).slice(0, 4), g = new Float32Array(16), gc = new Float32Array(16);
    gs.forEach((q, i) => { g.set([q[0] * K, q[1] * K, Math.max(1e-3, q[2] * K), 0], i * 4); gc.set([q[3], q[4], q[5], q[6]], i * 4); });
    gl.useProgram(P.backGlow.p);
    gl.uniform3fv(u.uBase, back.base || [0, 0, 0]); gl.uniform4fv(u.uGlow, g); gl.uniform4fv(u.uGlowCol, gc);
    gl.uniform1i(u.uNumGlows, gs.length); gl.uniform1f(u.uH, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const n = back.n || 0;
    if (n > 0 && back.rects) {
      gl.bindVertexArray(vaoRects);
      gl.bindBuffer(gl.ARRAY_BUFFER, rectBuf);
      gl.bufferData(gl.ARRAY_BUFFER, back.rects.subarray ? back.rects.subarray(0, n * 8) : new Float32Array(back.rects.slice(0, n * 8)), gl.STREAM_DRAW);
      gl.useProgram(P.backRects.p);
      gl.uniform2f(P.backRects.u.uView, W, H); gl.uniform1f(P.backRects.u.uK, K);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    }
    gl.bindVertexArray(vao);
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
    if (gl.isContextLost() || !ensureTargets(W, H)) return;
    // the 2D layers first, all together: each upload makes the GPU process switch from the WebGL context to
    // the 2D canvases' one and back (a costly MakeCurrent); between the WebGL passes that was 6 switches a frame
    for (const k of ['back', 'mid', 'glow']) if (L2D[k] && L2D[k].used === frameNo) uploadLayer(L2D[k]);
    const by = [[], [], [], [], [], []];                // layers -1..4, in queue order (one pass)
    for (const q of queue) { const b = by[q.layer + 1]; if (b) b.push(q); }
    const ground = by[0].concat(by[1], by[2]);
    const sorted = (b) => b.sort((a, c) => a.sortY - c.sortY || a.seq - c.seq);
    const walls = sorted(by[3]), mains = sorted(by[4]), tops = by[5];
    uploadInstances([ground, walls, mains, tops]);
    if (RT.depth) depthPass([ground, walls, mains, tops]);   // (the 2D layers write no depth)
    softReady = !!(RT.depth && RT.sh0);
    cullLights(softReady);
    if (softReady) shadowPass();
    gl.bindVertexArray(vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, RT.scene.fb);
    gl.viewport(0, 0, W, H);
    gl.clearDepth(1); gl.depthMask(true);
    gl.clearColor(0.02, 0.025, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const u = P.sprite.u;
    gl.useProgram(P.sprite.p);
    gl.uniform2f(u.uView, W, H); gl.uniform1f(u.uHR, HR); gl.uniform1f(u.uDepthScale, DEPTH_SCALE);
    gl.uniform1i(u.uBeauty, 0); gl.uniform1i(u.uNormal, 1); gl.uniform1i(u.uHeight, 2); gl.uniform1i(u.uMask, 3);
    gl.uniform4f(u.uWear, scratchOn ? 1 : 0, WEAR.fine, WEAR.gouge, WEAR.tape);
    setLightUniforms(u);
    drawBackdrop();
    drawLayer2d('back', false);
    gl.useProgram(P.sprite.p); drawQueue(ground);
    gl.useProgram(P.sprite.p); drawQueue(walls);
    drawLayer2d('mid', true);
    drawLayer2d('glow', false);
    gl.useProgram(P.sprite.p); drawQueue(mains);
    gl.useProgram(P.sprite.p); drawQueue(tops);
    drawDomes();
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
      gl.uniform4fv(u.uOvGeo, ovGeo); gl.uniform4fv(u.uOvT, ovT); gl.uniform4fv(u.uOvCol, ovCol); gl.uniform1i(u.uNumOv, numOv); gl.uniform1f(u.uH, H);
    });
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
    on: true, gl, begin, end, sprite, lighting, backdrop, overlay, layer2d, frameIndex, pickAt, disable, setShadows, canvasSprite, text, dome, wear: WEAR,
    get scratches() { return scratchOn; },
    setScratches: (on) => { scratchOn = !!on; try { localStorage.setItem('mn-gfx-scratch', on ? '1' : '0'); } catch (e) { /* no storage */ } },
    get pathScratches() { return pathScratchOn; },
    setPathScratches: (on) => { pathScratchOn = !!on; try { localStorage.setItem('mn-gfx-pathscratch', on ? '1' : '0'); } catch (e) { /* no storage */ } },
    has: (name) => !!(DYNS[name] || (MAN && MAN[name] && MAN[name].f && MAN[name].f.length)),
    ready: (name) => !!(DYNS[name] ? spriteReady(DYNS[name]) : MAN && MAN[name] && spriteReady(MAN[name])),
    info: (name) => DYNS[name] || (MAN && MAN[name]) || null,
    preload: (groups) => { if (META) for (const g of groups) (META.pages[g] || []).forEach((_, i) => page(g, i)); },
    stream,
    streaming: () => STREAM.length + Object.values(PAGES).filter(p => p.state !== 'ready' && p.state !== 'failed').length,   // (pages still to come)
    setScale: (k) => { userScale = k || null; try { if (k) localStorage.setItem('mn-gfx-scale', String(k)); else localStorage.removeItem('mn-gfx-scale'); } catch (e) { /* no storage */ } },
    toScreen: (x, y, z = 0) => { const [sx, sy] = toDev(x, y, z); return [sx / K, sy / K]; },
    // whether anything within r (layout units, on screen) of (x, y, z) can show this frame (between begin and end)
    onScreen: (x, y, z = 0, r = 1) => { const [sx, sy] = toDev(x, y, z), R = r * Sdev; return sx + R >= 0 && sx - R <= W && sy + R >= 0 && sy - R <= H; },
    get manifest() { return MAN; },
  });

  // put the GL canvas under the 2D canvas
  glc.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;display:block;pointer-events:none;z-index:0';
  const c2d = document.getElementById('c');
  if (c2d) { c2d.style.position = 'fixed'; c2d.style.left = '0'; c2d.style.top = '0'; c2d.style.zIndex = '1'; c2d.parentNode.insertBefore(glc, c2d); }
  else document.body.appendChild(glc);
  glc.addEventListener('webglcontextlost', (e) => { e.preventDefault(); disable('WebGL context lost'); });

  fetch(BASE_URL + 'sprites.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(d => {
    MAN = d.sprites; META = d.meta; HR = META.heightRange || 4; api.heightRange = HR;
    for (const k in MAN) MAN[k].name = k;
    api.preload(['hull', 'interior', 'ship', 'crew']);
    stream(streamLater); streamLater = [];
  }).catch(e => disable('sprites.json: ' + e.message));

  return api;
})();
