'use strict';
// WebGL sprite renderer for the pre-rendered Blender sprites.
//
// Every sprite is drawn as one screen-space quad with four textures: beauty, world normals, height and
// (optional) tint mask. From a pixel's place in the sprite and its height the fragment shader rebuilds
// the pixel's 3D world position, which gives
//   * runtime lighting: beauty x (ambient + sum of point lights with normal-map N.L and 3D falloff),
//   * a real depth value (distance along the camera axis) written to the depth buffer, so sprites that
//     overlap (crew walking behind the reactor) intersect correctly per pixel on top of painter's order.
// The scene goes into an offscreen buffer (half-float when available), then a bloom pass and a final
// composite (soft highlight shoulder + vignette) put it on screen.
//
// WebGL2 preferred; WebGL1 works (shaders are written with a few macros and translated), with depth
// writes only if EXT_frag_depth exists and bloom in 8-bit.

const MAX_LIGHTS = 32;

function createRenderer(canvas) {
  const opts = { antialias: false, alpha: false, premultipliedAlpha: false, depth: true, preserveDrawingBuffer: false };
  let gl = /[?&]gl1\b/.test(location.search) ? null : canvas.getContext('webgl2', opts);   // ?gl1 forces the WebGL1 path
  const isGL2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
  if (!gl) throw new Error('WebGL is not available in this browser');

  const hasFragDepth = isGL2 || !!gl.getExtension('EXT_frag_depth');
  let hdr = false;
  if (isGL2 && gl.getExtension('EXT_color_buffer_float')) hdr = true;
  gl.getExtension('OES_texture_float_linear');
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');

  // --- shader translation -------------------------------------------------------------------------
  function translate(s, frag) {
    const head = [];
    if (isGL2) {
      head.push('#version 300 es');
      if (hasFragDepth) head.push('#define HAS_DEPTH 1');
      head.push('precision highp float;', 'precision highp int;');
      if (frag) head.push('out vec4 outColor;');
      head.push('#define MAX_LIGHTS ' + MAX_LIGHTS);
      s = s.replace(/\bVARYING\b/g, frag ? 'in' : 'out').replace(/\bATTR\b/g, 'in').replace(/\bTEX\(/g, 'texture(')
        .replace(/\bFRAGCOLOR\b/g, 'outColor').replace(/\bFRAGDEPTH\b/g, 'gl_FragDepth');
    } else {
      if (frag && hasFragDepth) head.push('#extension GL_EXT_frag_depth : enable', '#define HAS_DEPTH 1');
      head.push('precision highp float;', '#define MAX_LIGHTS ' + MAX_LIGHTS);
      s = s.replace(/\bVARYING\b/g, 'varying').replace(/\bATTR\b/g, 'attribute').replace(/\bTEX\(/g, 'texture2D(')
        .replace(/\bFRAGCOLOR\b/g, 'gl_FragColor').replace(/\bFRAGDEPTH\b/g, 'gl_FragDepthEXT');
    }
    return head.join('\n') + '\n' + s;
  }
  function program(vs, fs) {
    const mk = (type, src) => {
      const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh) + '\n' + src);
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, translate(vs, false)));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, translate(fs, true)));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); const nm = info.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }

  // --- shaders --------------------------------------------------------------------------------------
  const VS_RECT = `
ATTR vec2 aPos;
uniform vec4 uRect;      // device px: x, y, w, h (top-left origin)
uniform vec2 uView;
VARYING vec2 vUV;
VARYING vec2 vScreen;
void main() {
  vUV = aPos;
  vec2 p = uRect.xy + aPos * uRect.zw;
  vScreen = p;
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;

  const FS_SPRITE = `
VARYING vec2 vUV;
VARYING vec2 vScreen;
uniform sampler2D uBeauty, uNormal, uHeight, uMask;
uniform vec4 uSize;        // sprite canvas w, h and ground origin ox, oy (sprite px)
uniform vec3 uGround;      // world position of the ground origin: x, y (game, down), z offset
uniform vec4 uProj;        // sin(elev), cos(elev), ppu, heightRange
uniform int uMode;         // 0 beauty, 1 lit, 2 normals, 3 height
uniform vec3 uAmbient;
uniform vec4 uLightPos[MAX_LIGHTS];   // x, y, z, radius
uniform vec4 uLightCol[MAX_LIGHTS];   // rgb * intensity
uniform int uNumLights;
uniform vec4 uTint;        // rgb, strength (0 = no tint)
uniform float uTintRef;    // luminance of the untinted suit, so shading survives the recolour
uniform float uEmissive;   // how much the brightest beauty pixels count as self-lit
uniform float uAlpha;
uniform vec4 uCutout;      // see-through circle: screen x, y, radius (0 = off), depth of what to reveal
uniform float uDepthScale, uDepthBias;
uniform float uObjScale;   // stand-ins (a crate as the crew) can be drawn smaller
void main() {
  vec4 b = TEX(uBeauty, vUV);
  if (b.a < 0.02) discard;
  vec3 n = TEX(uNormal, vUV).rgb * 2.0 - 1.0;
  float hz = TEX(uHeight, vUV).r * uProj.w * uObjScale;
  // world position of this pixel: screen offset + height -> (x, y, z)
  vec2 lp = vUV * uSize.xy;
  float dy = (lp.y - uSize.w) / uProj.z * uObjScale;
  vec3 P = vec3(uGround.x + (lp.x - uSize.z) / uProj.z * uObjScale, uGround.y + (dy + hz * uProj.y) / uProj.x, uGround.z + hz);
  float depth = P.y * uProj.y + P.z * uProj.x + uDepthBias;      // larger = closer to the camera

  vec3 base = b.rgb;
  if (uTint.a > 0.0) {
    float m = TEX(uMask, vUV).r * uTint.a;
    float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
    vec3 t = uTint.rgb * (lum / max(uTintRef, 0.05));
    t = mix(t, vec3(1.0), clamp(lum / max(uTintRef, 0.05) - 1.3, 0.0, 0.6));   // keep specular glints white
    base = mix(base, t, m);
  }
  vec3 col = base;
  if (uMode == 2) col = n * 0.5 + 0.5;
  else if (uMode == 3) { float h = hz / 3.0; col = mix(vec3(0.05, 0.07, 0.16), vec3(1.0, 0.95, 0.75), clamp(h, 0.0, 1.0)); col = mix(col, vec3(1.0, 0.35, 0.2), step(1.0, h)); }
  else if (uMode == 1) {
    vec3 N = normalize(vec3(n.x, -n.y, n.z));          // to game coords (y down the screen)
    vec3 V = vec3(0.0, uProj.y, uProj.x);              // towards the camera
    vec3 acc = uAmbient, spec = vec3(0.0);
    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= uNumLights) break;
      vec3 L = uLightPos[i].xyz - P;
      float d = length(L);
      float a = clamp(1.0 - d / uLightPos[i].w, 0.0, 1.0);
      a = a * a * (1.0 + 0.6 / (1.0 + 3.0 * d * d));  // smooth reach + a warmer core close to the light
      vec3 l = L / max(d, 1e-3);
      float ndl = max(dot(N, l) * 0.82 + 0.18, 0.0);   // slightly wrapped: toy-like, soft terminator
      acc += uLightCol[i].rgb * a * ndl;
      vec3 h = normalize(l + V);
      spec += uLightCol[i].rgb * a * pow(max(dot(N, h), 0.0), 28.0);
    }
    float e = uEmissive * smoothstep(0.62, 0.97, max(base.r, max(base.g, base.b)));
    col = base * acc + spec * 0.22;
    col = mix(col, base * 1.2, e);                     // self-lit pixels keep their own colour
  }
  float alpha = b.a * uAlpha;
  if (uCutout.z > 0.0 && depth > uCutout.w + 0.02) {
    float dd = distance(vScreen, uCutout.xy) / uCutout.z;
    alpha *= mix(0.22, 1.0, smoothstep(0.55, 1.0, dd));
  }
#ifdef HAS_DEPTH
  FRAGDEPTH = clamp(0.5 - depth * uDepthScale, 0.0, 1.0);
#endif
  FRAGCOLOR = vec4(col, alpha);
}`;

  // Soft blobs: light halos (additive), contact shadows (darken), laser streaks (rotated, additive).
  const VS_BLOB = `
ATTR vec2 aPos;
uniform vec2 uView;
uniform vec2 uCenter;    // device px
uniform vec2 uHalf;      // half size, device px
uniform float uAngle;
VARYING vec2 vQ;
void main() {
  vQ = aPos * 2.0 - 1.0;
  vec2 q = vQ * uHalf;
  float c = cos(uAngle), s = sin(uAngle);
  vec2 p = uCenter + vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  gl_Position = vec4(p.x / uView.x * 2.0 - 1.0, 1.0 - p.y / uView.y * 2.0, 0.0, 1.0);
}`;
  const FS_BLOB = `
VARYING vec2 vQ;
uniform vec4 uColor;     // rgb, strength
uniform float uSharp;    // falloff sharpness
uniform int uKind;       // 0 additive glow, 1 shadow, 2 flat rect
void main() {
  float r2 = dot(vQ, vQ);
  if (uKind == 2) { FRAGCOLOR = uColor; return; }
  float f = exp(-r2 * uSharp) * (1.0 - smoothstep(0.85, 1.0, r2));
  if (uKind == 1) FRAGCOLOR = vec4(0.0, 0.0, 0.0, f * uColor.a);
  else FRAGCOLOR = vec4(uColor.rgb * f * uColor.a, 1.0);
}`;

  const VS_FULL = `
ATTR vec2 aPos;
VARYING vec2 vUV;
void main() { vUV = aPos; gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

  const FS_STARS = `
VARYING vec2 vUV;
uniform vec2 uView;     // device px
uniform vec2 uCam;      // camera position in screen units (for parallax)
uniform float uScale;   // device px per unit
uniform float uTime;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec2 px = vec2(vUV.x, 1.0 - vUV.y) * uView;           // top-left origin like the rest
  vec3 col = vec3(0.012, 0.016, 0.035);
  // nebula: slow, far away
  vec2 np = (px - uView * 0.5) / uScale * 0.06 + uCam * 0.02;
  float nb = fbm(np * 1.3 + vec2(0.0, uTime * 0.004));
  float nb2 = fbm(np * 2.1 - 3.7);
  col += vec3(0.10, 0.05, 0.16) * smoothstep(0.45, 0.85, nb) + vec3(0.02, 0.09, 0.12) * smoothstep(0.5, 0.9, nb2);
  // three parallax layers of stars
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float par = 0.12 + 0.18 * fk;
    float cell = (34.0 - fk * 7.0) * max(uScale / 72.0, 0.6);
    vec2 p = (px - uView * 0.5 + uCam * uScale * par) / cell + fk * 17.3;
    vec2 c = floor(p), f = fract(p);
    float h = hash(c + fk * 3.1);
    if (h > 0.55) {
      vec2 pos = vec2(hash(c + 1.7), hash(c + 9.2)) * 0.8 + 0.1;
      float d = length((f - pos) * cell);
      float tw = 0.75 + 0.25 * sin(uTime * (1.0 + 3.0 * h) + h * 40.0);
      float size = 0.6 + fk * 0.45 + step(0.97, h) * 0.9;
      float b = exp(-d * d / (size * size)) * tw * (0.35 + 0.65 * (h - 0.55) / 0.45) * (0.5 + 0.25 * fk);
      vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash(c + 5.5));
      col += tint * b;
    }
  }
  FRAGCOLOR = vec4(col, 1.0);
}`;

  const FS_BRIGHT = `
VARYING vec2 vUV;
uniform sampler2D uTex;
uniform float uThreshold;
void main() {
  vec3 c = TEX(uTex, vUV).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThreshold, 0.0) / max(l, 1e-4);
  FRAGCOLOR = vec4(c * k, 1.0);
}`;
  const FS_BLUR = `
VARYING vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;       // texel step
void main() {
  vec3 s = TEX(uTex, vUV).rgb * 0.2270270;
  s += (TEX(uTex, vUV + uDir * 1.3846154).rgb + TEX(uTex, vUV - uDir * 1.3846154).rgb) * 0.3162162;
  s += (TEX(uTex, vUV + uDir * 3.2307692).rgb + TEX(uTex, vUV - uDir * 3.2307692).rgb) * 0.0702703;
  FRAGCOLOR = vec4(s, 1.0);
}`;
  const FS_COMPOSITE = `
VARYING vec2 vUV;
uniform sampler2D uScene, uBloom1, uBloom2;
uniform float uBloom;
uniform vec3 uGrade;     // overall colour multiplier (alarm wash)
void main() {
  vec3 c = TEX(uScene, vUV).rgb;
  c += (TEX(uBloom1, vUV).rgb * 0.8 + TEX(uBloom2, vUV).rgb * 1.1) * uBloom;
  c *= uGrade;
  // soft shoulder above 0.8 instead of hard clipping
  vec3 over = max(c - 0.8, 0.0);
  c = min(c, 0.8) + 0.2 * (1.0 - exp(-over / 0.2));
  vec2 q = vUV - 0.5;
  c *= 1.0 - 0.55 * dot(q, q) * 1.6;
  FRAGCOLOR = vec4(c, 1.0);
}`;

  const P = {
    sprite: program(VS_RECT, FS_SPRITE),
    blob: program(VS_BLOB, FS_BLOB),
    stars: program(VS_FULL, FS_STARS),
    bright: program(VS_FULL, FS_BRIGHT),
    blur: program(VS_FULL, FS_BLUR),
    comp: program(VS_FULL, FS_COMPOSITE),
  };

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // --- textures -------------------------------------------------------------------------------------
  function texture(src, { mips = false, nearest = false } = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    if (src instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const pow2 = (v) => (v & (v - 1)) === 0;
    const canMip = mips && (isGL2 || (pow2(src.width) && pow2(src.height)));
    if (canMip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, nearest ? gl.NEAREST : canMip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, nearest ? gl.NEAREST : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (canMip && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    return t;
  }
  const flatNormal = texture(new Uint8Array([128, 128, 255, 255]));
  const zero = texture(new Uint8Array([0, 0, 0, 255]));

  // --- framebuffers ---------------------------------------------------------------------------------
  function target(w, h, withDepth, useHdr) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (useHdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    let rb = null;
    if (withDepth) {
      rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, isGL2 ? gl.DEPTH_COMPONENT24 : gl.DEPTH_COMPONENT16, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    }
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) { gl.deleteFramebuffer(fb); gl.deleteTexture(t); if (rb) gl.deleteRenderbuffer(rb); return null; }
    return { fb, t, rb, w, h };
  }
  let T = null;
  function free(x) { if (!x) return; gl.deleteFramebuffer(x.fb); gl.deleteTexture(x.t); if (x.rb) gl.deleteRenderbuffer(x.rb); }
  function ensureTargets(w, h) {
    if (T && T.w === w && T.h === h) return;
    if (T) for (const k of ['scene', 'a1', 'b1', 'a2', 'b2']) free(T[k]);
    let scene = hdr && target(w, h, true, true);
    if (!scene) { hdr = false; scene = target(w, h, true, false); }
    const w1 = Math.max(1, w >> 1), h1 = Math.max(1, h >> 1), w2 = Math.max(1, w >> 3), h2 = Math.max(1, h >> 3);
    T = { w, h, scene, a1: target(w1, h1, false, hdr), b1: target(w1, h1, false, hdr), a2: target(w2, h2, false, hdr), b2: target(w2, h2, false, hdr) };
  }

  // --- frame state ----------------------------------------------------------------------------------
  const lightPos = new Float32Array(MAX_LIGHTS * 4), lightCol = new Float32Array(MAX_LIGHTS * 4);
  let frame = null;

  function begin(f) {
    // f: { w, h, mode, ambient:[r,g,b], lights:[{x,y,z,r,c:[r,g,b]}], proj:{sin,cos,ppu,hr}, depthScale }
    frame = f;
    ensureTargets(f.w, f.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.scene.fb);
    gl.viewport(0, 0, f.w, f.h);
    gl.clearColor(0, 0, 0, 1); gl.clearDepth(1);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const n = Math.min(MAX_LIGHTS, f.lights.length);
    for (let i = 0; i < n; i++) {
      const L = f.lights[i];
      lightPos.set([L.x, L.y, L.z, L.r], i * 4);
      lightCol.set([L.c[0], L.c[1], L.c[2], 1], i * 4);
    }
    const u = P.sprite.u;
    gl.useProgram(P.sprite.p);
    gl.uniform2f(u.uView, f.w, f.h);
    gl.uniform4fv(u.uLightPos, lightPos); gl.uniform4fv(u.uLightCol, lightCol);
    gl.uniform1i(u.uNumLights, n);
    gl.uniform3fv(u.uAmbient, f.ambient);
    gl.uniform4f(u.uProj, f.proj.sin, f.proj.cos, f.proj.ppu, f.proj.hr);
    gl.uniform1i(u.uMode, f.mode);
    gl.uniform1f(u.uDepthScale, f.depthScale);
    gl.uniform1i(u.uBeauty, 0); gl.uniform1i(u.uNormal, 1); gl.uniform1i(u.uHeight, 2); gl.uniform1i(u.uMask, 3);
  }

  function stars(cam, scale, time) {
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.useProgram(P.stars.p);
    const u = P.stars.u;
    gl.uniform2f(u.uView, frame.w, frame.h); gl.uniform2f(u.uCam, cam[0], cam[1]);
    gl.uniform1f(u.uScale, scale); gl.uniform1f(u.uTime, time);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // s: { x, y, w, h (device rect), tex:{b,n,h,m}, size:[w,h,ox,oy], ground:[x,y,z], tint, tintRef, emissive, alpha, cutout, depthBias, depthWrite }
  let lastProg = null;
  function sprite(s) {
    const u = P.sprite.u;
    gl.useProgram(P.sprite.p);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    gl.depthMask(s.depthWrite !== false);
    gl.uniform4f(u.uRect, s.x, s.y, s.w, s.h);
    gl.uniform4f(u.uSize, s.size[0], s.size[1], s.size[2], s.size[3]);
    gl.uniform3f(u.uGround, s.ground[0], s.ground[1], s.ground[2]);
    const t = s.tint;
    gl.uniform4f(u.uTint, t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0, t && s.tex.m ? 1 : 0);
    gl.uniform1f(u.uTintRef, s.tintRef || 0.45);
    gl.uniform1f(u.uEmissive, s.emissive || 0);
    gl.uniform1f(u.uAlpha, s.alpha == null ? 1 : s.alpha);
    const c = s.cutout;
    gl.uniform4f(u.uCutout, c ? c[0] : 0, c ? c[1] : 0, c ? c[2] : 0, c ? c[3] : 0);
    gl.uniform1f(u.uDepthBias, s.depthBias || 0);
    gl.uniform1f(u.uObjScale, s.scale || 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, s.tex.b);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, s.tex.n || flatNormal);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, s.tex.h || zero);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, s.tex.m || zero);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // kind: 'glow' (additive), 'shadow' (darken), 'rect' (flat colour, alpha blended; angle 0)
  function blob(kind, cx, cy, hw, hh, color, strength, sharp = 3, angle = 0) {
    const u = P.blob.u;
    gl.useProgram(P.blob.p);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false);
    gl.enable(gl.BLEND);
    if (kind === 'glow') gl.blendFunc(gl.ONE, gl.ONE);
    else if (kind === 'shadow') gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform2f(u.uView, frame.w, frame.h);
    gl.uniform2f(u.uCenter, cx, cy); gl.uniform2f(u.uHalf, hw, hh); gl.uniform1f(u.uAngle, angle);
    gl.uniform4f(u.uColor, color[0], color[1], color[2], kind === 'rect' ? (color[3] == null ? 1 : color[3]) : strength);
    gl.uniform1f(u.uSharp, sharp);
    gl.uniform1i(u.uKind, kind === 'glow' ? 0 : kind === 'shadow' ? 1 : 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function fullPass(prog, dst, setup) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
    gl.viewport(0, 0, dst ? dst.w : frame.w, dst ? dst.h : frame.h);
    gl.useProgram(prog.p);
    setup(prog.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); }

  function end({ bloom = 0.9, threshold = 0.78, grade = [1, 1, 1] } = {}) {
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
    fullPass(P.bright, T.a1, (u) => { bindTex(0, T.scene.t); gl.uniform1i(u.uTex, 0); gl.uniform1f(u.uThreshold, threshold); });
    for (let i = 0; i < 2; i++) {
      fullPass(P.blur, T.b1, (u) => { bindTex(0, T.a1.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 1.5 / T.a1.w, 0); });
      fullPass(P.blur, T.a1, (u) => { bindTex(0, T.b1.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 0, 1.5 / T.a1.h); });
    }
    fullPass(P.blur, T.a2, (u) => { bindTex(0, T.a1.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 1 / T.a1.w, 0); });
    for (let i = 0; i < 2; i++) {
      fullPass(P.blur, T.b2, (u) => { bindTex(0, T.a2.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 1.2 / T.a2.w, 0); });
      fullPass(P.blur, T.a2, (u) => { bindTex(0, T.b2.t); gl.uniform1i(u.uTex, 0); gl.uniform2f(u.uDir, 0, 1.2 / T.a2.h); });
    }
    fullPass(P.comp, null, (u) => {
      bindTex(0, T.scene.t); bindTex(1, T.a1.t); bindTex(2, T.a2.t);
      gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uBloom1, 1); gl.uniform1i(u.uBloom2, 2);
      gl.uniform1f(u.uBloom, bloom); gl.uniform3fv(u.uGrade, grade);
    });
  }

  return {
    gl, isGL2, hasFragDepth, get hdr() { return hdr; }, MAX_LIGHTS,
    texture, begin, stars, sprite, blob, end,
  };
}
