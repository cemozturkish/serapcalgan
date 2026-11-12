// WebGL renderer for the sky. Everything is drawn in a stereographic projection
// of the celestial sphere, as seen from the inside.

const PROJECT = `
uniform mat3 uM;
uniform vec2 uScale;
vec3 toView(vec3 p) { return uM * p; }
vec2 project(vec3 v) {
  float d = max(1.0 + v.z, 0.03);
  return v.xy / d * uScale;
}`;

const UNPROJECT = `
uniform vec2 uInvScale;
uniform mat3 uVT;
vec3 viewDir(vec2 ndc) {
  vec2 q = ndc * uInvScale;
  float r2 = dot(q, q);
  return vec3(2.0 * q, 1.0 - r2) / (1.0 + r2);
}`;

const NOISE3 = `
float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x),
                 mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x),
                 mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}`;

const FULLSCREEN_VS = `
attribute vec2 aQ;
varying vec2 vNdc;
void main() { vNdc = aQ; gl_Position = vec4(aQ, 0.0, 1.0); }`;

// The Milky Way is painted once into a texture in galactic coordinates
// (u = galactic longitude, v = galactic latitude), then sampled every frame.
const MILKYWAY_FS = `
precision highp float;
varying vec2 vNdc;
${NOISE3}
void main() {
  float l = vNdc.x * 3.14159265;
  float b = vNdc.y * 1.57079633;
  vec3 d = vec3(cos(b) * cos(l), cos(b) * sin(l), sin(b));
  float core = exp(-pow(abs(l) / 0.95, 2.0));
  float width = radians(5.5) + radians(8.0) * core;
  float bb = b + (fbm(d * 3.0) - 0.5) * radians(7.0);
  float band = exp(-pow(bb / width, 2.0));
  float wide = exp(-pow(bb / (width * 2.8), 2.0));
  float along = 0.42 + 0.6 * core + 0.22 * exp(-pow((l - 1.3) / 0.4, 2.0));
  float clouds = fbm(d * 7.0);
  float fine = fbm(d * 24.0);
  float I = (band * (0.25 + 2.3 * clouds * clouds) + wide * 0.2) * along;
  float dust = smoothstep(0.44, 0.66, fbm(d * 9.0 + 4.0)) * exp(-pow(bb / (width * 0.6), 2.0));
  I *= 1.0 - 0.8 * dust * (0.35 + 0.65 * core + 0.6 * exp(-pow((l - 0.75) / 0.6, 2.0)));
  I *= 0.7 + 0.6 * fine;
  vec3 c = mix(vec3(0.60, 0.72, 1.0), vec3(1.0, 0.86, 0.70), clamp(core * 1.15, 0.0, 1.0)) * I;
  float bulge = exp(-(l * l / 0.05 + b * b / 0.02));
  c += vec3(1.0, 0.84, 0.64) * bulge * 0.55 * (1.0 - 0.6 * dust);
  gl_FragColor = vec4(c * 0.55, 1.0);
}`;

const BACKGROUND_FS = `
precision highp float;
varying vec2 vNdc;
${UNPROJECT}
uniform mat3 uGV;
uniform vec3 uZenith, uHorizon, uGlow, uHaze, uSunV, uMoonV;
uniform float uMilky, uMoonGlow, uSunDisc;
uniform sampler2D uMW;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 d = viewDir(vNdc);
  vec3 h = uVT * d;
  float sa = clamp(h.z, 0.0, 1.0);
  vec3 col = mix(uZenith, uHorizon, pow(1.0 - sa, 4.0));
  col += uHaze * exp(-sa * 11.0);

  float cs = clamp(dot(d, uSunV), -1.0, 1.0);
  float ang = acos(cs);
  col += uGlow * (exp(-ang * ang * 1.1) * exp(-sa * 5.0) + 0.5 * exp(-ang * ang * 7.0));
  col += uSunDisc * (smoothstep(0.99990, 0.99996, cs) * vec3(1.0, 0.96, 0.86)
       + vec3(1.0, 0.9, 0.7) * (0.5 * pow(max(cs, 0.0), 900.0) + 0.22 * pow(max(cs, 0.0), 60.0)));

  vec3 g = uGV * d;
  vec2 uv = vec2(atan(g.y, g.x) / 6.2831853 + 0.5, asin(clamp(g.z, -1.0, 1.0)) / 3.14159265 + 0.5);
  col += uMilky * texture2D(uMW, uv).rgb * smoothstep(-0.02, 0.3, h.z);

  float cm = max(dot(d, uMoonV), 0.0);
  col += uMoonGlow * vec3(0.50, 0.62, 0.92) * (0.16 * pow(cm, 14.0) + 0.3 * pow(cm, 160.0) + 0.5 * pow(cm, 1800.0));

  col += (hash(gl_FragCoord.xy) - 0.5) / 200.0;
  gl_FragColor = vec4(col, 1.0);
}`;

const STAR_VS = `
attribute vec3 aPos;
attribute vec3 aData;    // magnitude, B-V colour index, random seed (<0: a planet, no twinkle)
attribute vec3 aTarget;  // where this star sits when the stars spell the message (z<0: nowhere)
${PROJECT}
uniform vec3 uUp;        // the zenith, in catalogue coordinates
uniform float uTime, uPx, uMagLimit, uAlpha, uMorph, uPass, uSizeK, uTextPx;
varying vec3 vCol;
varying float vI;
varying float vSpike;
vec3 bvColor(float bv) {
  vec3 c = mix(vec3(0.58, 0.70, 1.0), vec3(1.0), smoothstep(-0.3, 0.35, bv));
  c = mix(c, vec3(1.0, 0.88, 0.68), smoothstep(0.35, 1.0, bv));
  return mix(c, vec3(1.0, 0.66, 0.40), smoothstep(1.0, 1.8, bv));
}
void main() {
  float mag = aData.x, seed = aData.z;
  bool planet = seed < 0.0;
  float s = abs(seed);
  vec2 p = project(toView(aPos));
  float lp = length(p);
  if (lp > 2.6) p *= 2.6 / lp;

  float sinAlt = dot(uUp, aPos);
  float flux = pow(2.512, -mag);
  float size = uPx * (2.6 + 8.5 * min(pow(flux, 0.36), 2.6)) * uSizeK;
  float inten = min(0.30 + 1.7 * pow(flux, 0.28), 2.2) * clamp((uMagLimit - mag) * 0.8, 0.0, 1.0);
  inten *= mix(0.3, 1.0, smoothstep(-0.02, 0.2, sinAlt)) * uAlpha;
  float low = pow(1.0 - clamp(sinAlt, 0.0, 1.0), 4.0);
  float tw = planet ? 1.0 : 1.0 + (0.12 + 0.5 * low) * sin(uTime * (2.0 + s * 6.0) + s * 90.0);

  bool has = aTarget.z >= 0.0;
  float e = 0.0;
  if (has) {
    float tt = clamp(uMorph * 1.7 - aTarget.z * 0.7, 0.0, 1.0);
    e = tt * tt * (3.0 - 2.0 * tt);
  }
  bool flying = e > 0.0;
  if ((uPass < 0.5 && flying) || (uPass > 0.5 && !flying)) {
    gl_Position = vec4(3.0, 3.0, 3.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }
  vec2 dir = aTarget.xy - p;
  vec2 pos = mix(p, aTarget.xy, e) + vec2(-dir.y, dir.x) * sin(e * 3.14159) * 0.35 * (s - 0.5);

  vec3 col = bvColor(aData.y);
  if (!has) inten *= 1.0 - 0.55 * uMorph;
  float sparkle = 0.62 + 0.38 * sin(uTime * (2.0 + s * 4.0) + s * 40.0);
  vCol = mix(col, vec3(1.0, 0.91, 0.74), e * 0.85);
  vI = mix(inten * tw, sparkle, e);
  vSpike = mix(smoothstep(1.6, -0.5, mag), 0.25, e);
  gl_PointSize = max(mix(size, uTextPx * (0.7 + 0.9 * s * s), e), 2.0);
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const STAR_FS = `
precision mediump float;
varying vec3 vCol;
varying float vI;
varying float vSpike;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float r = sqrt(r2);
  float core = exp(-r2 * 6.0);
  float halo = 0.3 * pow(1.0 - r, 2.5);
  vec2 a = abs(q);
  float spike = vSpike * 0.5 * (exp(-a.x * 16.0 - a.y * 2.6) + exp(-a.y * 16.0 - a.x * 2.6)) * (1.0 - r);
  float v = (core + halo + spike) * vI;
  gl_FragColor = vec4(mix(vCol, vec3(1.0), core * 0.6) * v, v);
}`;

const LINE_VS = `
attribute vec3 aPos;
${PROJECT}
varying float vVis;
void main() {
  vec3 v = toView(aPos);
  vVis = v.z > -0.35 ? 1.0 : 0.0;
  gl_Position = vec4(project(v), 0.0, 1.0);
}`;

const LINE_FS = `
precision mediump float;
uniform float uAlpha;
varying float vVis;
void main() {
  if (vVis < 0.999) discard;
  gl_FragColor = vec4(vec3(0.45, 0.62, 1.0) * uAlpha, uAlpha);
}`;

const MOON_VS = `
attribute vec2 aQ;
uniform vec2 uCenter, uHalf;
varying vec2 vQ;
void main() { vQ = aQ; gl_Position = vec4(uCenter + aQ * uHalf, 0.0, 1.0); }`;

const MOON_FS = `
precision highp float;
varying vec2 vQ;
uniform vec3 uL;       // direction to the Sun, in the Moon's screen frame
uniform float uK;      // quad half-size, in lunar radii
uniform float uBright; // halo strength
uniform float uPale;   // washed out by daylight
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 x) {
  vec2 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y);
}
float fbm2(vec2 p) { return 0.5 * n2(p) + 0.25 * n2(p * 2.1 + 3.0) + 0.125 * n2(p * 4.3 + 7.0) + 0.0625 * n2(p * 8.7); }
void main() {
  vec2 q = vQ * uK;
  float r = length(q);
  float disc = smoothstep(1.0, 0.93, r);
  vec3 n = vec3(q, sqrt(max(1.0 - r * r, 0.0)));
  float lit = smoothstep(-0.04, 0.22, dot(n, uL));
  float maria = smoothstep(0.42, 0.6, fbm2(q * 1.9 + vec2(4.2, 1.3)));
  vec3 surf = mix(vec3(1.0, 0.985, 0.94), vec3(0.60, 0.63, 0.70), maria * 0.6);
  surf *= 0.86 + 0.14 * n.z;
  vec3 col = surf * (lit + 0.015) * disc * mix(1.0, 0.75, uPale);
  float halo = uBright * (0.55 * exp(-max(r - 1.0, 0.0) * 1.6) + 0.25 * exp(-max(r - 1.0, 0.0) * 0.45)) * (1.0 - disc);
  halo *= smoothstep(uK, uK * 0.6, r);
  float a = disc * mix(1.0, 0.8, uPale);
  gl_FragColor = vec4(col + vec3(0.72, 0.80, 1.0) * halo, a);
}`;

const METEOR_VS = `
attribute vec2 aXY;
attribute vec4 aCol;
varying vec4 vCol;
void main() { vCol = aCol; gl_Position = vec4(aXY, 0.0, 1.0); }`;

const METEOR_FS = `
precision mediump float;
varying vec4 vCol;
void main() { gl_FragColor = vCol; }`;

// The horizon: sea below, and the silhouette of the city painted into a strip
// texture that wraps once around the compass.
const GROUND_FS = `
precision highp float;
varying vec2 vNdc;
${UNPROJECT}
uniform sampler2D uSky;
uniform vec3 uGround, uSea;
uniform float uNight, uTime, uTop;
void main() {
  vec3 h = uVT * viewDir(vNdc);
  float alt = asin(clamp(h.z, -1.0, 1.0));
  if (alt > uTop) discard;
  float u = atan(-h.y, h.x) / 6.2831853;
  if (alt >= 0.0) {
    vec4 s = texture2D(uSky, vec2(u, alt / uTop));
    gl_FragColor = vec4(uGround * s.a + s.rgb * uNight * s.a, s.a);
  } else {
    float depth = -alt / uTop;
    float wob = sin(depth * 260.0 + uTime * 1.3) * 0.00035 * (1.0 + depth * 6.0);
    vec3 refl = texture2D(uSky, vec2(u + wob, depth * 0.55 + 0.02)).rgb;
    vec3 col = mix(uSea, uGround, smoothstep(0.0, 2.5, depth));
    col += refl * uNight * 0.5 * exp(-depth * 2.2);
    gl_FragColor = vec4(col, 1.0);
  }
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) + '\n' + src);
  }
  return sh;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  const a = {};
  const m = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < m; i++) {
    const info = gl.getActiveAttrib(p, i);
    a[info.name] = gl.getAttribLocation(p, info.name);
  }
  return { p, u, a };
}

export const SKYLINE_TOP_DEG = 9;
const MAX_METEOR_VERTS = 64 * 14 * 6;

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    this.canvas = canvas;
    this.dpr = 1;

    this.pBg = program(gl, FULLSCREEN_VS, BACKGROUND_FS);
    this.pStar = program(gl, STAR_VS, STAR_FS);
    this.pLine = program(gl, LINE_VS, LINE_FS);
    this.pMoon = program(gl, MOON_VS, MOON_FS);
    this.pMeteor = program(gl, METEOR_VS, METEOR_FS);
    this.pGround = program(gl, FULLSCREEN_VS, GROUND_FS);

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

    this.starPos = gl.createBuffer();
    this.starData = gl.createBuffer();
    this.starTarget = gl.createBuffer();
    this.planetPos = gl.createBuffer();
    this.planetData = gl.createBuffer();
    this.lineBuf = gl.createBuffer();
    this.meteorBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.meteorBuf);
    gl.bufferData(gl.ARRAY_BUFFER, MAX_METEOR_VERTS * 6 * 4, gl.DYNAMIC_DRAW);
    this.starCount = 0;
    this.lineCount = 0;

    this.mw = this.paintMilkyWay();
    this.skyline = gl.createTexture();

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
  }

  paintMilkyWay() {
    const gl = this.gl;
    const W = 1024, H = 512;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const prog = program(gl, FULLSCREEN_VS, MILKYWAY_FS);
    gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND);
    gl.useProgram(prog.p);
    this.bindQuad(prog);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.deleteProgram(prog.p);
    return tex;
  }

  bindQuad(prog) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(prog.a.aQ);
    gl.vertexAttribPointer(prog.a.aQ, 2, gl.FLOAT, false, 0, 0);
  }

  setStars(pos, data) {
    const gl = this.gl;
    this.starCount = pos.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starPos);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starData);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const none = new Float32Array(pos.length).fill(-1);
    this.setTargets(none);
  }

  setTargets(targets) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.starTarget);
    gl.bufferData(gl.ARRAY_BUFFER, targets, gl.DYNAMIC_DRAW);
  }

  setLines(verts) {
    const gl = this.gl;
    this.lineCount = verts.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  }

  setSkyline(canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.skyline);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  resize() {
    const c = this.canvas;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * this.dpr);
    const h = Math.round(c.clientHeight * this.dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
  }

  drawStars(f, pos, data, count, pass, withTargets) {
    const gl = this.gl;
    const s = this.pStar;
    gl.bindBuffer(gl.ARRAY_BUFFER, pos);
    gl.enableVertexAttribArray(s.a.aPos);
    gl.vertexAttribPointer(s.a.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, data);
    gl.enableVertexAttribArray(s.a.aData);
    gl.vertexAttribPointer(s.a.aData, 3, gl.FLOAT, false, 0, 0);
    if (withTargets) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.starTarget);
      gl.enableVertexAttribArray(s.a.aTarget);
      gl.vertexAttribPointer(s.a.aTarget, 3, gl.FLOAT, false, 0, 0);
    } else {
      gl.disableVertexAttribArray(s.a.aTarget);
      gl.vertexAttrib3f(s.a.aTarget, 0, 0, -1);
    }
    gl.uniform1f(s.u.uPass, pass);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  draw(f) {
    const gl = this.gl;
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    const inv = [1 / f.scale[0], 1 / f.scale[1]];

    // ── sky ──
    gl.disable(gl.BLEND);
    let p = this.pBg;
    gl.useProgram(p.p);
    this.bindQuad(p);
    gl.uniform2fv(p.u.uInvScale, inv);
    gl.uniformMatrix3fv(p.u.uVT, false, f.VT);
    gl.uniformMatrix3fv(p.u.uGV, false, f.GV);
    gl.uniform3fv(p.u.uZenith, f.zenith);
    gl.uniform3fv(p.u.uHorizon, f.horizon);
    gl.uniform3fv(p.u.uGlow, f.glow);
    gl.uniform3fv(p.u.uHaze, f.haze);
    gl.uniform3fv(p.u.uSunV, f.sunV);
    gl.uniform3fv(p.u.uMoonV, f.moonV);
    gl.uniform1f(p.u.uMilky, f.milky);
    gl.uniform1f(p.u.uMoonGlow, f.moonGlow);
    gl.uniform1f(p.u.uSunDisc, f.sunDisc);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.mw);
    gl.uniform1i(p.u.uMW, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    // ── constellation lines ──
    if (f.lines > 0.003 && this.lineCount) {
      p = this.pLine;
      gl.useProgram(p.p);
      gl.uniformMatrix3fv(p.u.uM, false, f.M);
      gl.uniform2fv(p.u.uScale, f.scale);
      gl.uniform1f(p.u.uAlpha, f.lines);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
      gl.enableVertexAttribArray(p.a.aPos);
      gl.vertexAttribPointer(p.a.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, this.lineCount);
    }

    // ── stars and planets ──
    p = this.pStar;
    gl.useProgram(p.p);
    gl.uniformMatrix3fv(p.u.uM, false, f.M);
    gl.uniform2fv(p.u.uScale, f.scale);
    gl.uniform3fv(p.u.uUp, f.up);
    gl.uniform1f(p.u.uTime, f.t);
    gl.uniform1f(p.u.uPx, this.dpr);
    gl.uniform1f(p.u.uMagLimit, f.magLimit);
    gl.uniform1f(p.u.uAlpha, f.starAlpha);
    gl.uniform1f(p.u.uMorph, f.morph);
    gl.uniform1f(p.u.uSizeK, f.sizeK);
    gl.uniform1f(p.u.uTextPx, f.textPx * this.dpr);
    if (f.starAlpha > 0.003) this.drawStars(f, this.starPos, this.starData, this.starCount, 0, true);
    if (f.planetCount) {
      gl.uniform1f(p.u.uMagLimit, 99);
      gl.uniform1f(p.u.uAlpha, f.planetAlpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.planetPos);
      gl.bufferData(gl.ARRAY_BUFFER, f.planetPos, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.planetData);
      gl.bufferData(gl.ARRAY_BUFFER, f.planetData, gl.DYNAMIC_DRAW);
      this.drawStars(f, this.planetPos, this.planetData, f.planetCount, 0, false);
    }

    // ── the Moon ──
    if (f.moon) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      p = this.pMoon;
      gl.useProgram(p.p);
      this.bindQuad(p);
      const K = 7;
      gl.uniform2f(p.u.uCenter, f.moon.x, f.moon.y);
      gl.uniform2f(p.u.uHalf, (f.moon.r * K * 2) / W, (f.moon.r * K * 2) / H);
      gl.uniform3fv(p.u.uL, f.moon.light);
      gl.uniform1f(p.u.uK, K);
      gl.uniform1f(p.u.uBright, f.moon.halo);
      gl.uniform1f(p.u.uPale, f.moon.pale);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.blendFunc(gl.ONE, gl.ONE);
    }

    // ── meteors ──
    if (f.meteorVerts > 0) {
      p = this.pMeteor;
      gl.useProgram(p.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.meteorBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, f.meteorData.subarray(0, f.meteorVerts * 6));
      gl.enableVertexAttribArray(p.a.aXY);
      gl.vertexAttribPointer(p.a.aXY, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(p.a.aCol);
      gl.vertexAttribPointer(p.a.aCol, 4, gl.FLOAT, false, 24, 8);
      gl.drawArrays(gl.TRIANGLES, 0, f.meteorVerts);
    }

    // ── the ground ──
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    p = this.pGround;
    gl.useProgram(p.p);
    this.bindQuad(p);
    gl.uniform2fv(p.u.uInvScale, inv);
    gl.uniformMatrix3fv(p.u.uVT, false, f.VT);
    gl.uniform3fv(p.u.uGround, f.ground);
    gl.uniform3fv(p.u.uSea, f.sea);
    gl.uniform1f(p.u.uNight, f.night);
    gl.uniform1f(p.u.uTime, f.t);
    gl.uniform1f(p.u.uTop, (SKYLINE_TOP_DEG * Math.PI) / 180);
    gl.bindTexture(gl.TEXTURE_2D, this.skyline);
    gl.uniform1i(p.u.uSky, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // ── stars on their way to spell the message, above everything ──
    if (f.morph > 0) {
      gl.blendFunc(gl.ONE, gl.ONE);
      p = this.pStar;
      gl.useProgram(p.p);
      gl.uniform1f(p.u.uMagLimit, f.magLimit);
      gl.uniform1f(p.u.uAlpha, f.starAlpha);
      this.drawStars(f, this.starPos, this.starData, this.starCount, 1, true);
    }
  }
}

export { MAX_METEOR_VERTS };
