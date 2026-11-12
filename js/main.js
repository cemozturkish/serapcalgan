import { CONFIG, T, LANG, VOICE_LINES } from './config.js';
import { Renderer, MAX_METEOR_VERTS } from './renderer.js';
import * as astro from './astro.js';
import { paintSkyline } from './skyline.js';
import * as audio from './audio.js';

const DEG = Math.PI / 180;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// ── elements ───────────────────────────────────────────────────────────────
const skyCanvas = $('sky');
const labelCanvas = $('labels');
const lctx = labelCanvas.getContext('2d');
const el = {
  veil: $('veil'), intro: $('intro'), begin: $('begin'), top: $('top'), clock: $('clock'),
  caption: $('caption'), skip: $('skip'), count: $('count'), countN: $('countN'), card: $('card'), bar: $('bar'), time: $('time'),
  ticks: $('ticks'), btnLines: $('btnLines'), btnSound: $('btnSound'), btnReplay: $('btnReplay'),
};

document.documentElement.lang = LANG;
$('introDate').textContent = T.introDate;
$('introPlace').textContent = T.introPlace;
el.begin.textContent = T.loading;
el.skip.textContent = T.skip;
$('countLabel').textContent = T.p_count;
el.btnLines.querySelector('span').textContent = T.constellation;
el.btnSound.querySelector('span').textContent = T.sound;
el.btnReplay.querySelector('span').textContent = T.replay;

// ── state ──────────────────────────────────────────────────────────────────
const BIRTH = CONFIG.birthTime ? astro.parseClock(CONFIG.birthTime) : null;
const STORM_START = 5 * 60 + 14;
// the person this is from: minutes (relative to her midnight) of their night sky
const FROM = CONFIG.from;
const FROM_DAYS = FROM
  ? Math.round((Date.UTC(CONFIG.date.year, CONFIG.date.month - 1, CONFIG.date.day) - Date.UTC(FROM.date.year, FROM.date.month - 1, FROM.date.day)) / 864e5)
  : 0;
const FROM_NIGHT = -FROM_DAYS * 1440 + 21 * 60; // 21:00 on the evening of that day
const FROM_START = FROM && FROM.time ? -FROM_DAYS * 1440 + astro.parseClock(FROM.time) : FROM_NIGHT;
const EVENING = BIRTH !== null && BIRTH >= 17 * 60 + 45 ? BIRTH : 22 * 60;

const cam = { az: 143, alt: 12, fov: 108 };
const S = {
  mode: 'intro',     // intro → story → finale → explore
  minutes: STORM_START,
  flow: 0,           // minutes of sky time per second
  lines: 0,          // constellation lines
  labels: 0,         // names of stars and planets
  morph: 0,          // 0: stars in the sky, 1: stars spelling the message
  reveal: 0,         // let the stars shine through daylight
  party: 0,          // celebratory meteors per second during the finale
  storm: 0,          // extra Leonids per second while the story tells of the storm
  lapse: null,       // while the days race by: { from, days, rest, u }
  dateOnly: false,   // show the date without the hour
  linesWanted: false,
  selected: null,
};
let renderer, meta, starPos, starData, starCount;
let W = 1, H = 1;
let sky = null;
let M, MT, V, VT, scale = [1, 1];
let named = [];
let conById = {};

// ── tweens ─────────────────────────────────────────────────────────────────
let tweens = [];
function tween(obj, to, ms, ease = easeInOut) {
  for (const key of Object.keys(to)) {
    tweens = tweens.filter((t) => !(t.obj === obj && t.key === key));
    tweens.push({ obj, key, from: obj[key], to: to[key], t0: performance.now(), ms, ease });
  }
}
function runTweens(now) {
  tweens = tweens.filter((t) => {
    const u = clamp((now - t.t0) / t.ms, 0, 1);
    t.obj[t.key] = lerp(t.from, t.to, t.ease(u));
    return u < 1;
  });
}
const camTo = (to, ms, ease) => {
  const target = { ...to };
  if (to.az !== undefined) target.az = cam.az + ((((to.az - cam.az) % 360) + 540) % 360) - 180;
  tween(cam, target, ms, ease);
};

// ── camera ─────────────────────────────────────────────────────────────────
function viewMatrix(az, alt) {
  const a = az * DEG, e = alt * DEG;
  const f = [Math.cos(e) * Math.cos(a), -Math.cos(e) * Math.sin(a), Math.sin(e)];
  const r = [-Math.sin(a), -Math.cos(a), 0];
  const u = cross(r, f);
  return new Float32Array([r[0], u[0], f[0], r[1], u[1], f[1], r[2], u[2], f[2]]);
}
function updateCamera() {
  const k = 1 / Math.tan((cam.fov * DEG) / 4);
  scale = W >= H ? [k, (k * W) / H] : [(k * H) / W, k];
  V = viewMatrix(cam.az, cam.alt);
  VT = astro.transpose(V);
  M = astro.mul(V, sky.R);
  MT = astro.transpose(M);
}
/** catalogue direction → screen (CSS px) */
function project(vec, m = M) {
  const v = astro.apply(m, vec);
  if (v[2] < -0.7) return null;
  const d = 1 + v[2];
  return { x: ((v[0] / d) * scale[0] + 1) * 0.5 * W, y: (1 - (v[1] / d) * scale[1]) * 0.5 * H };
}
/** screen → catalogue direction */
function unproject(x, y) {
  const qx = ((x / W) * 2 - 1) / scale[0], qy = (1 - (y / H) * 2) / scale[1];
  const r2 = qx * qx + qy * qy;
  return astro.apply(MT, [(2 * qx) / (1 + r2), (2 * qy) / (1 + r2), (1 - r2) / (1 + r2)]);
}
const storyAlt = () => (W > H ? 25 : 35);
const pxPerDeg = () => (scale[0] * W * DEG) / 4;
const horVec = (az, alt) => [Math.cos(alt * DEG) * Math.cos(az * DEG), -Math.cos(alt * DEG) * Math.sin(az * DEG), Math.sin(alt * DEG)];

// ── the colour of the sky, by how high the Sun is ──────────────────────────
const KEYS = [-18, -12, -6, -2, 3, 12];
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const RAMP = {
  zenith: ['#02040c', '#040817', '#0c1a3c', '#1d3a6e', '#2d62ad', '#3474c6'].map(hex),
  horizon: ['#070e20', '#101d3d', '#3c4f7e', '#8d90aa', '#a9c5e2', '#b6d6f3'].map(hex),
  glow: [[0, 0, 0], [0.07, 0.08, 0.14], [0.78, 0.33, 0.14], [0.95, 0.5, 0.2], [0.75, 0.56, 0.32], [0.3, 0.29, 0.25]],
  star: [[1], [1], [0.5], [0.1], [0], [0]],
  mag: [[0], [-0.6], [-3.8], [-6.5], [-9], [-9]],
};
function ramp(name, alt) {
  const r = RAMP[name];
  if (alt <= KEYS[0]) return r[0];
  for (let i = 1; i < KEYS.length; i++) {
    if (alt <= KEYS[i]) {
      const t = (alt - KEYS[i - 1]) / (KEYS[i] - KEYS[i - 1]);
      return r[i].map((v, j) => lerp(r[i - 1][j], v, t));
    }
  }
  return r[r.length - 1];
}

// ── meteors ────────────────────────────────────────────────────────────────
const meteors = [];
const meteorData = new Float32Array(MAX_METEOR_VERTS * 6);
let lastChime = 0;

function spawnMeteor(now, o = {}) {
  if (meteors.length >= 60) return false;
  const up = [sky.R[2], sky.R[5], sky.R[8]];
  let P = o.through;
  if (!P) {
    P = unproject(Math.random() * W, Math.random() * H);
    if (dot(up, P) < 0.12) return false;
  }
  let away, reach;
  const c = dot(astro.LEONID_RADIANT, P);
  if (o.leonid && c < 0.995 && c > -0.4) {
    away = norm([c * P[0] - astro.LEONID_RADIANT[0], c * P[1] - astro.LEONID_RADIANT[1], c * P[2] - astro.LEONID_RADIANT[2]]);
    reach = Math.sqrt(1 - c * c);
  } else {
    away = norm(cross(P, norm([Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5])));
    reach = 0.75 + Math.random() * 0.25;
  }
  const bright = o.bright ?? 0.18 + 0.82 * Math.pow(Math.random(), 1.8);
  const L = (11 + Math.random() * 17) * DEG * Math.max(reach, 0.3) * (o.long ? 1.7 : 1);
  let start = P, dir = away;
  if (o.through) {
    const h = L / 2;
    start = [0, 1, 2].map((i) => Math.cos(h) * P[i] - Math.sin(h) * away[i]);
    dir = [0, 1, 2].map((i) => Math.sin(h) * P[i] + Math.cos(h) * away[i]);
  }
  meteors.push({
    P: start, a: dir, L, t0: now, bright,
    dur: (0.32 + Math.random() * 0.4) * (o.long ? 1.5 : 1),
    train: 0.35 + bright * 0.9,
    tint: Math.random(),
  });
  if (bright > 0.72 && now - lastChime > 900 && S.mode !== 'intro') {
    lastChime = now;
    audio.chime(0.035 + bright * 0.035);
  }
  return true;
}

function buildMeteors(now) {
  let n = 0;
  const K = 8;
  const put = (x, y, r, g, b, a) => {
    const i = n * 6;
    meteorData[i] = (x / W) * 2 - 1;
    meteorData[i + 1] = 1 - (y / H) * 2;
    meteorData[i + 2] = r * a;
    meteorData[i + 3] = g * a;
    meteorData[i + 4] = b * a;
    meteorData[i + 5] = a;
    n++;
  };
  for (let m = meteors.length - 1; m >= 0; m--) {
    const me = meteors[m];
    const u = (now - me.t0) / 1000 / me.dur;
    const after = (u - 1) * me.dur / me.train;
    if (after > 1) {
      meteors.splice(m, 1);
      continue;
    }
    const sh = me.L * Math.min(u, 1);
    const st = Math.max(0, sh - me.L * 0.6) + (u > 1 ? Math.min(after, 1) * me.L * 0.25 : 0);
    const fade = (u < 1 ? Math.min(1, u * 8) : Math.pow(1 - after, 1.6) * 0.55) * (0.3 + 0.7 * me.bright);
    const pts = [];
    for (let i = 0; i <= K; i++) {
      const s = lerp(st, sh, i / K);
      const p = project([0, 1, 2].map((j) => Math.cos(s) * me.P[j] + Math.sin(s) * me.a[j]));
      if (!p) break;
      pts.push(p);
    }
    if (pts.length <= K) continue;
    const head = pts[K];
    const dx = head.x - pts[0].x, dy = head.y - pts[0].y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const wHead = 0.9 + 1.6 * me.bright;
    const tail = [lerp(0.45, 0.6, me.tint), lerp(0.85, 0.75, me.tint), 1.0];
    for (let i = 0; i < K; i++) {
      const f0 = i / K, f1 = (i + 1) / K;
      const w0 = wHead * Math.pow(f0, 0.6), w1 = wHead * Math.pow(f1, 0.6);
      const a0 = fade * Math.pow(f0, 1.5), a1 = fade * Math.pow(f1, 1.5);
      const c0 = tail.map((v) => lerp(v, 1, f0 * f0)), c1 = tail.map((v) => lerp(v, 1, f1 * f1));
      const A = pts[i], B = pts[i + 1];
      put(A.x - nx * w0, A.y - ny * w0, ...c0, a0);
      put(A.x + nx * w0, A.y + ny * w0, ...c0, a0);
      put(B.x - nx * w1, B.y - ny * w1, ...c1, a1);
      put(A.x + nx * w0, A.y + ny * w0, ...c0, a0);
      put(B.x + nx * w1, B.y + ny * w1, ...c1, a1);
      put(B.x - nx * w1, B.y - ny * w1, ...c1, a1);
    }
    if (u < 1 && me.bright > 0.45) {
      const r = 2 + 6 * me.bright;
      const a = fade * 0.7 * Math.min(1, u * 5);
      const ring = [];
      for (let i = 0; i < 10; i++) ring.push([Math.cos(i * 0.6283) * r, Math.sin(i * 0.6283) * r]);
      for (let i = 0; i < 10; i++) {
        const q0 = ring[i], q1 = ring[(i + 1) % 10];
        put(head.x, head.y, 1, 1, 1, a);
        put(head.x + q0[0], head.y + q0[1], 0.6, 0.8, 1, 0);
        put(head.x + q1[0], head.y + q1[1], 0.6, 0.8, 1, 0);
      }
    }
  }
  return n;
}

function meteorRate() {
  // real shower activity, scaled by how high the radiant is and how dark the sky is
  const dark = smooth(-5, -13, sky.sun.alt);
  const leonids = (astro.leonidZHR(sky.ms) / 3600) * Math.max(Math.sin(sky.radiant.alt * DEG), 0) * dark * 2.6;
  const sporadic = S.mode === 'explore' ? 0.045 * dark : 0;
  return { leonids, sporadic };
}

// ── the message, written in stars ─────────────────────────────────────────
function messagePoints() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = g.strokeStyle = '#fff';
  g.lineJoin = 'round';
  const fontOf = (size, name) => `${name ? 'normal 600' : 'italic 400'} ${size}px Cormorant, Georgia, serif`;
  const fit = (text, name, maxW, maxSize) => {
    g.font = fontOf(maxSize, name);
    const w = g.measureText(text).width;
    return w > maxW ? (maxSize * maxW) / w : maxSize;
  };
  const maxW = Math.min(W * 0.88, 780);
  const name = CONFIG.name.trim();
  const s1 = fit(T.happy, false, maxW, name ? Math.min(88, H * 0.085) : 120);
  const s2 = name ? fit(name, true, maxW, Math.min(180, s1 * 2.2, H * 0.2)) : 0;
  const block = s1 * 1.05 + s2 * 0.95;

  // keep clear of the Moon
  let top = H * 0.36 - block / 2;
  const moon = sky.moon.alt > 0 ? project(sky.moon.vec) : null;
  if (moon && moon.y > top - 40 && moon.y < top + block + 30 && Math.abs(moon.x - W / 2) < maxW / 2 + 30) {
    top = moon.y + 46 + block < H * 0.7 ? moon.y + 46 : moon.y - 40 - block;
  }

  const pts = [];
  const write = (text, size, baseline, isName) => {
    g.clearRect(0, 0, W, H);
    g.font = fontOf(size, isName);
    // thin strokes get a little extra weight so they still read as a line of stars
    g.lineWidth = clamp(2.6 - size * 0.02, 0, 2);
    if (g.lineWidth > 0.2) g.strokeText(text, W / 2, baseline);
    g.fillText(text, W / 2, baseline);
    const y0 = Math.max(0, Math.floor(baseline - size * 1.1)), y1 = Math.min(H, Math.ceil(baseline + size * 0.45));
    const img = g.getImageData(0, y0, W, y1 - y0).data;
    // one star per small cell that has ink in it, placed on the ink itself,
    // so that even hairline strokes come out as an unbroken string of stars
    const step = clamp(size * 0.03, 2.3, 3.5) * (W < 600 ? 1 : 1.15);
    const rows = y1 - y0;
    for (let cy = 0; cy < rows; cy += step) {
      for (let cx = 0; cx < W; cx += step) {
        let sum = 0, sx = 0, sy = 0;
        const xe = Math.min(W, Math.floor(cx + step)), ye = Math.min(rows, Math.floor(cy + step));
        for (let y = Math.floor(cy); y < ye; y++) {
          for (let x = Math.floor(cx); x < xe; x++) {
            const a = img[(y * W + x) * 4 + 3];
            sum += a;
            sx += a * x;
            sy += a * y;
          }
        }
        if (sum < 255 * 1.1) continue;
        pts.push([sx / sum + 0.5 + (Math.random() - 0.5) * step * 0.35, sy / sum + 0.5 + y0 + (Math.random() - 0.5) * step * 0.35]);
      }
    }
  };
  write(T.happy, s1, top + s1 * 0.8, false);
  if (name) write(name, s2, top + s1 * 1.05 + s2 * 0.76, true);
  return pts;
}

function gatherStars() {
  const pts = messagePoints();
  const targets = new Float32Array(starCount * 3).fill(-1);
  const up = [sky.R[2], sky.R[5], sky.R[8]];
  // prefer the stars she can actually see right now, brightest first
  const chosen = [];
  const rest = [];
  for (let i = 0; i < starCount && chosen.length < pts.length; i++) {
    const v = [starPos[i * 3], starPos[i * 3 + 1], starPos[i * 3 + 2]];
    const p = dot(up, v) > 0.1 ? project(v) : null;
    if (p && p.x > -20 && p.x < W + 20 && p.y > -20 && p.y < H + 20) chosen.push([i, p.x, p.y]);
    else if (rest.length < pts.length) rest.push([i, Math.random() * W, -40]);
  }
  while (chosen.length < pts.length && rest.length) chosen.push(rest.shift());
  // pair them left-to-right so the paths do not all cross
  chosen.sort((a, b) => a[1] - b[1]);
  pts.sort((a, b) => a[0] - b[0]);
  const span = Math.hypot(W, H);
  chosen.forEach(([i, x, y], k) => {
    const p = pts[k];
    if (!p) return;
    targets[i * 3] = (p[0] / W) * 2 - 1;
    targets[i * 3 + 1] = 1 - (p[1] / H) * 2;
    targets[i * 3 + 2] = clamp((Math.hypot(p[0] - x, p[1] - y) / span) * 0.9 + Math.random() * 0.45, 0, 1);
  });
  renderer.setTargets(targets);
}

// ── labels ─────────────────────────────────────────────────────────────────
const dateLabel = (minutes) => {
  const d = new Date(astro.fromMinutes(minutes) + CONFIG.utcOffsetHours * 3600e3);
  const date = `${d.getUTCDate()} ${T.months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return S.dateOnly ? date : `${date}  ·  ${astro.clock(minutes)}`;
};

function selectedVec() {
  const s = S.selected;
  if (!s) return null;
  if (s.kind === 'star') return [starPos[s.i * 3], starPos[s.i * 3 + 1], starPos[s.i * 3 + 2]];
  if (s.kind === 'moon') return sky.moon.vec;
  return sky.planets.find((p) => p.id === s.id).vec;
}

function drawLabels(now, night) {
  const dpr = renderer.dpr;
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  lctx.clearRect(0, 0, W, H);
  const up = [sky.R[2], sky.R[5], sky.R[8]];
  const above = (v, min = 0.05) => dot(up, v) > min;
  const dim = 1 - 0.85 * S.morph;
  const spaced = (px) => {
    if ('letterSpacing' in lctx) lctx.letterSpacing = px;
  };

  // compass points
  const a0 = S.labels * dim;
  if (a0 > 0.01) {
    lctx.font = SANS_10;
    lctx.textAlign = 'center';
    spaced('0px');
    for (let i = 0; i < 4; i++) {
      const p = project(horVec(i * 90, 0), V);
      if (!p) continue;
      lctx.fillStyle = `rgba(244,236,221,${0.5 * a0})`;
      lctx.fillText(T.cardinals[i], p.x, p.y + 20);
    }
  }

  // constellation names
  if (S.lines > 0.02) {
    lctx.font = '500 9.5px ui-sans-serif, -apple-system, Helvetica, Arial, sans-serif';
    lctx.textAlign = 'center';
    spaced('2.4px');
    const maxRank = cam.fov > 90 ? 2 : 3;
    for (const c of meta.constellations) {
      if (c.rank > maxRank || !above(c.vec, 0.12)) continue;
      const p = project(c.vec);
      if (!p || p.x < -40 || p.x > W + 40 || p.y < 0 || p.y > H) continue;
      lctx.fillStyle = S.reveal > 0.5 ? `rgba(255,255,255,${0.8 * S.lines * dim})` : `rgba(150,180,255,${0.62 * S.lines * dim * night})`;
      lctx.fillText((LANG === 'tr' ? c.tr : c.la).toLocaleUpperCase(LANG), p.x, p.y);
    }
    spaced('0px');
  }

  const a = S.labels * dim * night;
  if (a > 0.01) {
    // bright stars
    lctx.textAlign = 'left';
    lctx.font = 'italic 400 14px Cormorant, Georgia, serif';
    const limit = 1.3 + (108 - cam.fov) / 28;
    for (const s of named) {
      if (s.mag > limit) break;
      if (!s.name || !above(s.vec, 0.1)) continue;
      const p = project(s.vec);
      if (!p || p.x < 0 || p.x > W || p.y < 0 || p.y > H) continue;
      lctx.fillStyle = `rgba(244,236,221,${0.6 * a})`;
      lctx.fillText(s.name, p.x + 8, p.y + 4);
    }
  }

  // planets and the Moon stay labelled into twilight
  const ap = S.labels * dim * Math.max(smooth(-2, -7, sky.sun.alt), S.reveal);
  if (ap > 0.01) {
    lctx.textAlign = 'left';
    lctx.font = '500 15.5px Cormorant, Georgia, serif';
    for (const pl of sky.planets) {
      if (pl.alt < 2) continue;
      const p = project(pl.vec);
      if (!p) continue;
      lctx.fillStyle = S.reveal > 0.5 ? `rgba(255,255,255,${0.95 * ap})` : `rgba(255,223,168,${0.92 * ap})`;
      lctx.fillText(T.planets[pl.id], p.x + 10, p.y + 5);
    }
    if (sky.moon.alt > 1) {
      const p = project(sky.moon.vec);
      if (p) {
        lctx.fillStyle = `rgba(255,223,168,${0.92 * ap})`;
        lctx.fillText(T.moon, p.x + moonRadius() + 8, p.y + 5);
      }
    }
  }

  // the star she tapped
  const sv = selectedVec();
  if (sv) {
    const p = project(sv);
    if (p) {
      const age = (now - S.selected.t0) / 1000;
      const r = (S.selected.kind === 'moon' ? moonRadius() + 7 : 13) + 10 * Math.pow(1 - clamp(age / 0.5, 0, 1), 2);
      lctx.strokeStyle = `rgba(255,223,168,${0.85 * clamp(age / 0.2, 0, 1)})`;
      lctx.lineWidth = 1;
      lctx.beginPath();
      lctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      lctx.stroke();
    }
  }

  // wish sparkles
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const sp = sparkles[i];
    const u = (now - sp.t0) / 1100;
    if (u > 1) {
      sparkles.splice(i, 1);
      continue;
    }
    const r = 6 + 26 * easeOut(u);
    lctx.strokeStyle = `rgba(255,236,200,${0.8 * (1 - u)})`;
    lctx.lineWidth = 1;
    lctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 2 + u * 0.6;
      lctx.moveTo(sp.x + Math.cos(ang) * r * 0.35, sp.y + Math.sin(ang) * r * 0.35);
      lctx.lineTo(sp.x + Math.cos(ang) * r, sp.y + Math.sin(ang) * r);
    }
    lctx.stroke();
  }
}
const sparkles = [];
const SANS_10 = '500 10px ui-sans-serif, -apple-system, Helvetica, Arial, sans-serif';
const moonRadius = () => Math.max(0.26 * pxPerDeg(), W < 600 ? 9 : 11);

// ── frame ──────────────────────────────────────────────────────────────────
let lastT = 0;
let skyCacheKey = null;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  runTweens(now);
  if (S.flow) S.minutes = Math.min(S.minutes + S.flow * dt, 1800);
  if (S.lapse) {
    // step through whole days, always at night, so the sky wheels through the
    // seasons without flashing between day and night
    const L = S.lapse;
    const day = Math.round(L.days * L.u);
    S.minutes = L.from + day * 1440 + L.rest * L.u;
    el.countN.textContent = day + 1;
  }
  inertia(dt);

  const key = Math.round(S.minutes * 600);
  if (key !== skyCacheKey) {
    sky = astro.skyAt(astro.fromMinutes(S.minutes));
    skyCacheKey = key;
    el.clock.textContent = dateLabel(S.minutes);
  }
  updateCamera();

  const sunAlt = sky.sun.alt;
  const night = smooth(-3, -9, sunAlt);
  const day = smooth(-6, 2, sunAlt);
  const moonUp = smooth(-2, 8, sky.moon.alt);
  const zenith = ramp('zenith', sunAlt).map((v, i) => v + moonUp * (1 - day) * [0.006, 0.012, 0.03][i]);
  let starAlpha = ramp('star', sunAlt)[0];
  let magLimit = 6.5 + ((108 - cam.fov) / 108) * 1.8 + ramp('mag', sunAlt)[0];
  if (S.reveal > 0) {
    starAlpha = Math.max(starAlpha, S.reveal * 0.95);
    magLimit = Math.max(magLimit, lerp(magLimit, 5.4, S.reveal));
  }

  // meteors
  if (S.mode !== 'intro') {
    const rate = meteorRate();
    if (Math.random() < (rate.leonids + S.storm) * dt) for (let k = 0; k < 5 && !spawnMeteor(now, { leonid: true }); k++);
    if (Math.random() < rate.sporadic * dt) spawnMeteor(now, {});
    if (S.party && Math.random() < S.party * dt) spawnMeteor(now, { bright: 0.35 + Math.random() * 0.6, long: Math.random() < 0.3 });
  }
  const meteorVerts = buildMeteors(now);

  // planets
  const pp = new Float32Array(sky.planets.length * 3);
  const pd = new Float32Array(sky.planets.length * 3);
  sky.planets.forEach((p, i) => {
    pp.set(p.vec, i * 3);
    pd.set([p.mag, p.bv, -0.5], i * 3);
  });

  // the Moon
  let moon = null;
  const mp = sky.moon.alt > -1.5 ? project(sky.moon.vec) : null;
  if (mp) {
    const mv = astro.apply(M, sky.moon.vec), sv = astro.apply(M, sky.sun.vec);
    const L = norm([sv[0] * 389 - mv[0], sv[1] * 389 - mv[1], sv[2] * 389 - mv[2]]);
    const ez = [-mv[0], -mv[1], -mv[2]];
    const ex = norm([1 - ez[0] * ez[0], -ez[0] * ez[1], -ez[0] * ez[2]]);
    const ey = cross(ex, ez);
    moon = {
      x: (mp.x / W) * 2 - 1,
      y: 1 - (mp.y / H) * 2,
      r: moonRadius() * renderer.dpr,
      light: [dot(L, ex), dot(L, ey), dot(L, ez)],
      halo: (1 - day) * (1 - 0.5 * S.morph),
      pale: day,
    };
  }

  renderer.draw({
    M, VT, scale,
    GV: astro.mul(astro.GAL, MT),
    up: [sky.R[2], sky.R[5], sky.R[8]],
    t: now / 1000,
    zenith,
    horizon: ramp('horizon', sunAlt),
    glow: ramp('glow', sunAlt),
    haze: [0.085, 0.062, 0.045].map((v) => v * night),
    sunV: astro.apply(M, sky.sun.vec),
    moonV: astro.apply(M, sky.moon.vec),
    milky: night * (1 - 0.3 * moonUp) * (1 - 0.6 * S.morph),
    moonGlow: moonUp * (1 - day) * (1 - 0.5 * S.morph) * (S.lapse ? 0.45 : 1),
    sunDisc: smooth(-1.2, 0.2, sunAlt),
    magLimit,
    starAlpha,
    sizeK: (1 + ((108 - cam.fov) / 108) * 0.55) * (W < 600 ? 1 : 1.15),
    textPx: W < 600 ? 4.4 : 5.4,
    morph: S.morph,
    lines: S.lines * 0.34 * Math.max(night, S.reveal) * (1 - 0.8 * S.morph),
    planetPos: pp,
    planetData: pd,
    planetCount: sky.planets.length,
    planetAlpha: Math.max(smooth(-1.5, -6.5, sunAlt), S.reveal) * (1 - 0.6 * S.morph),
    moon,
    meteorData,
    meteorVerts,
    ground: [0.012, 0.016, 0.03].map((v, i) => lerp(v, [0.075, 0.105, 0.15][i], day)),
    sea: [0.022, 0.032, 0.06].map((v, i) => lerp(v, [0.2, 0.33, 0.47][i], day)),
    night,
  });
  drawLabels(now, Math.max(night, S.reveal));
}

// ── touch: drag to look around, pinch to zoom, tap to ask or to wish ───────
const pointers = new Map();
let vel = { az: 0, alt: 0 };
let pinch = null;
let tapStart = null;
const canLook = () => S.mode === 'explore';

function inertia(dt) {
  if (pointers.size || (!vel.az && !vel.alt)) return;
  cam.az = (cam.az + vel.az * dt + 360) % 360;
  cam.alt = clamp(cam.alt + vel.alt * dt, -4, 89.5);
  const k = Math.exp(-dt * 3.2);
  vel.az *= k;
  vel.alt *= k;
  if (Math.abs(vel.az) + Math.abs(vel.alt) < 0.05) vel = { az: 0, alt: 0 };
}

skyCanvas.addEventListener('pointerdown', (e) => {
  skyCanvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) {
    tapStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    vel = { az: 0, alt: 0 };
    tweens = tweens.filter((t) => t.obj !== cam || !canLook());
  } else {
    tapStart = null;
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: cam.fov };
  }
  skyCanvas.classList.add('dragging');
});
skyCanvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (!canLook()) return;
  if (pointers.size === 1) {
    const k = 1 / pxPerDeg();
    const dAz = (-dx * k) / Math.max(Math.cos(cam.alt * DEG), 0.3), dAlt = dy * k;
    cam.az = (cam.az + dAz + 360) % 360;
    cam.alt = clamp(cam.alt + dAlt, -4, 89.5);
    vel = { az: lerp(vel.az, dAz * 60, 0.5), alt: lerp(vel.alt, dAlt * 60, 0.5) };
  } else if (pinch) {
    const [a, b] = [...pointers.values()];
    cam.fov = clamp((pinch.fov * pinch.d) / Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1), 22, 135);
  }
});
const release = (e) => {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size < 2) pinch = null;
  if (pointers.size === 0) {
    skyCanvas.classList.remove('dragging');
    if (tapStart && performance.now() - tapStart.t < 400 && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) < 9) {
      vel = { az: 0, alt: 0 };
      tap(e.clientX, e.clientY);
    }
    tapStart = null;
  }
};
skyCanvas.addEventListener('pointerup', release);
skyCanvas.addEventListener('pointercancel', release);
skyCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (canLook()) cam.fov = clamp(cam.fov * Math.exp(e.deltaY * 0.0012), 22, 135);
}, { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

function tap(x, y) {
  if (S.mode !== 'explore') return;
  const now = performance.now();
  const up = [sky.R[2], sky.R[5], sky.R[8]];
  let best = null;
  const consider = (vec, reach, make) => {
    const p = project(vec);
    if (!p) return;
    const d = Math.hypot(p.x - x, p.y - y) - reach;
    if (d < 26 && (!best || d < best.d)) best = { d, make };
  };
  const dark = sky.sun.alt < -4;
  if (sky.moon.alt > 0) consider(sky.moon.vec, moonRadius(), () => ({ kind: 'moon' }));
  if (dark) {
    for (const p of sky.planets) if (p.alt > 0) consider(p.vec, 6, () => ({ kind: 'planet', id: p.id }));
    const limit = 4.6 + (108 - cam.fov) / 60;
    for (const s of named) {
      if (s.mag > limit) break;
      if (dot(up, s.vec) > 0.03) consider(s.vec, Math.max(0, 4 - s.mag), () => ({ kind: 'star', i: s.i, s }));
    }
  }
  if (best) {
    S.selected = { ...best.make(), t0: now };
    showCard();
    audio.bell(1174.66, 0, 0.09, 1.8);
    return;
  }
  if (S.selected) {
    hideCard();
    return;
  }
  // nothing there: make a wish
  const P = unproject(x, y);
  if (dot(up, P) < 0.06 || !dark) return;
  spawnMeteor(now, { through: P, leonid: sky.radiant.alt > 5, bright: 1, long: true });
  sparkles.push({ x, y, t0: now });
  audio.chime(0.12);
  if (!wished) {
    wished = true;
    say(T.wish, 2600, 'raised');
  }
}
let wished = false;

// ── info card ──────────────────────────────────────────────────────────────
let cardTimer = 0;
const conName = (id) => {
  const c = conById[id] || conById[id + '1'];
  return c ? (LANG === 'tr' ? c.tr : c.la) : id;
};
function showCard() {
  const s = S.selected;
  let title, sub, fact = '';
  if (s.kind === 'moon') {
    title = T.moon;
    sub = T.moonLit((sky.moon.fraction * 100).toFixed(sky.moon.fraction > 0.995 ? 1 : 0));
    fact = T.moonFact;
  } else if (s.kind === 'planet') {
    const p = sky.planets.find((q) => q.id === s.id);
    title = T.planets[s.id];
    sub = `${T.planet} · ${T.inCon(conName(astro.constellationOf(p)))} · ${T.mag(p.mag.toFixed(1))}`;
    fact = T.planetFacts[s.id];
  } else {
    const c = conById[s.s.con] || conById[s.s.con + '1'];
    const desig = c && s.s.desig ? `${s.s.desig} ${c.gen}` : '';
    title = s.s.name || desig;
    sub = [T.star, T.inCon(conName(s.s.con)), T.mag(s.s.mag.toFixed(1))].join(' · ');
    fact = s.s.name && desig ? desig : '';
  }
  $('cardTitle').textContent = title;
  $('cardSub').textContent = sub;
  $('cardFact').textContent = fact;
  el.card.hidden = false;
  requestAnimationFrame(() => el.card.classList.add('on'));
  clearTimeout(cardTimer);
  cardTimer = setTimeout(hideCard, 9000);
}
function hideCard() {
  S.selected = null;
  el.card.classList.remove('on');
  clearTimeout(cardTimer);
}

// ── captions ───────────────────────────────────────────────────────────────
let captionTimer = 0;
let voiceUntil = 0; // when the line being spoken ends
function stopVoice() {
  audio.stopVoice();
  voiceUntil = 0;
}
function say(text, ms, cls = '', line = null) {
  // with a recording, the caption stays up for as long as the voice needs
  const spoken = line ? audio.speak(line) * 1000 : 0;
  if (spoken) {
    voiceUntil = performance.now() + spoken + 450;
    ms = Math.max(ms, spoken + 300);
  }
  clearTimeout(captionTimer);
  el.caption.classList.remove('on');
  captionTimer = setTimeout(() => {
    el.caption.className = cls;
    el.caption.textContent = text;
    void el.caption.offsetWidth;
    el.caption.classList.add('on');
    captionTimer = setTimeout(() => el.caption.classList.remove('on'), ms);
  }, el.caption.textContent ? 700 : 0);
}
function hush() {
  clearTimeout(captionTimer);
  el.caption.classList.remove('on');
}

// ── the story ──────────────────────────────────────────────────────────────
let token = 0;
const CANCEL = Symbol('cancel');
// a pause in the story; it never ends while a recorded line is still being spoken
const sleep = (ms, t) =>
  new Promise((res, rej) => {
    const done = () => {
      if (t !== token) return rej(CANCEL);
      const left = voiceUntil - performance.now();
      left > 0 ? setTimeout(done, left) : res();
    };
    setTimeout(done, ms);
  });

/** Where to point the camera in the evening: between Saturn and the Moon. */
function eveningAim() {
  const s = astro.skyAt(astro.fromMinutes(EVENING));
  const saturn = s.planets.find((p) => p.id === 'Saturn');
  if (saturn.alt < 10) return { az: s.moon.az + 8, alt: storyAlt(), saturn: false };
  const d = ((s.moon.az - saturn.az + 540) % 360) - 180;
  return { az: saturn.az + d / 2, alt: storyAlt(), saturn: true };
}

async function story() {
  const t = ++token;
  const B = BIRTH;
  const hhmm = B !== null ? astro.clock(B) : '';
  S.mode = 'story';
  el.skip.hidden = false;
  el.bar.classList.remove('on');
  hideCard();
  tweens = [];
  Object.assign(S, { flow: 0, lines: 0, labels: 0, morph: 0, reveal: 0, party: 0, storm: 0 });
  Object.assign(cam, { az: 143, alt: 12, fov: 108 });
  const bornBeforeStorm = B !== null && B < STORM_START;
  const bornInStorm = B !== null && B >= STORM_START && B < 6 * 60 + 40;
  const bornByDay = B !== null && B >= 6 * 60 + 40 && B < 17 * 60 + 45;
  const bornAtNight = B !== null && B >= 17 * 60 + 45;

  const arrival = bornBeforeStorm ? B : STORM_START;
  endLapse();
  stopVoice();

  if (FROM) {
    // 0 ─ the sky of the one who was already here, and the days in between
    const then = astro.skyAt(astro.fromMinutes(FROM_START));
    const byDay = then.sun.alt > -6;
    const [day, month, year] = [FROM.date.day, T.monthsLong[FROM.date.month - 1], FROM.date.year];
    S.minutes = FROM_START;
    S.dateOnly = !FROM.time;
    cam.az = byDay ? then.sun.az + 12 : 246;
    el.veil.classList.add('clear');
    el.top.classList.add('on');
    await sleep(1400, t);
    camTo({ alt: storyAlt() }, 9000);
    S.flow = 1;
    if (!FROM.time) {
      say(T.p_date(day, month, year), 3000);
      await sleep(4100, t);
      say(T.p_born(FROM.name), 5000);
      tween(S, { labels: 1 }, 2500);
      await sleep(6200, t);
    } else {
      say(T.p_bornAt(FROM.name, FROM.time, day, month, year), 5000, '', 'p_bornAt');
      await sleep(6000, t);
      if (byDay && FROM_NIGHT > FROM_START) {
        // let that first day run on into its night
        S.flow = 0;
        tween(S, { minutes: FROM_NIGHT }, 4400);
        camTo({ az: 246 }, 4400);
        await sleep(3000, t);
      }
      tween(S, { labels: 1 }, 2500);
      if (astro.skyAt(astro.fromMinutes(Math.max(FROM_START, FROM_NIGHT))).moon.alt < 0) say(T.p_night, 4400, '', 'p_night');
      await sleep(5600, t);
      S.flow = 0;
    }
    S.dateOnly = true;
    say(T.p_alone(FROM.name, FROM_DAYS), 10200, '', 'p_alone');
    tween(S, { labels: 0 }, 1500);
    await sleep(1600, t);
    S.flow = 0;
    const span = arrival - S.minutes;
    const days = Math.floor(span / 1440);
    S.lapse = { from: S.minutes, days, rest: span - days * 1440, u: 0 };
    el.count.classList.add('on');
    tween(S.lapse, { u: 1 }, 9000, easeInOut);
    camTo({ az: 143 }, 9000);
    await sleep(9100, t);
    endLapse();
    S.minutes = arrival;
    S.flow = bornBeforeStorm ? 0.5 : 1.3;
    say(T.p_until, 3400, '', 'p_until');
    await sleep(4500, t);
  } else {
    S.minutes = arrival;
    el.veil.classList.add('clear');
    el.top.classList.add('on');

    // 1 ─ the place, the date
    await sleep(1400, t);
    say(T.s_place, 3600);
    camTo({ alt: storyAlt() }, 11000);
    S.flow = bornBeforeStorm ? 0.5 : 1.3;
    await sleep(4700, t);
  }
  say(T.s_real, 4400, '', 's_real');
  tween(S, { lines: 1 }, 2500);
  tween(S, { labels: 1 }, 2500);
  await sleep(5300, t);

  if (bornBeforeStorm) {
    say(T.s_birthNight(hhmm), 5000);
    await sleep(6200, t);
    S.flow = 0;
    tween(S, { minutes: STORM_START + 12 }, 3500);
    await sleep(3600, t);
    S.flow = 1.3;
  }

  // 2 ─ the storm
  tween(S, { lines: 0 }, 2500);
  tween(S, { labels: 0 }, 2500);
  say(T.s_storm1, 4200, '', 's_storm1');
  tween(S, { storm: 1.6 }, 6000);
  await sleep(5400, t);
  say(T.s_storm2, 6600, '', 's_storm2');
  await sleep(7600, t);
  if (bornInStorm) {
    S.flow = 0;
    tween(S, { minutes: B }, 2500);
    say(T.s_birthStorm(hhmm), 5200);
    await sleep(6400, t);
  }

  // 3 ─ the day goes by
  S.flow = 0;
  tween(S, { storm: 0 }, 1500);
  const aim = eveningAim();
  say(T.s_sunrise, 5200, '', 's_sunrise');
  if (bornByDay) {
    const part = (B - S.minutes) / (EVENING - S.minutes);
    tween(S, { minutes: B }, 3000 + 5000 * part, easeInOut);
    // look towards the Sun, so she can see which stars it was standing among
    const sun = astro.skyAt(astro.fromMinutes(B)).sun;
    camTo({ az: sun.az - 13, alt: storyAlt() }, 3000 + 5000 * part);
    await sleep(3200 + 5000 * part, t);
    say(T.s_birthDay(hhmm, sun.alt > 20), 4600, '', 's_birthDay');
    await sleep(2400, t);
    tween(S, { reveal: 1 }, 2800);
    await sleep(3200, t);
    say(T.s_birthDay2, 4800, '', 's_birthDay2');
    tween(S, { lines: 1, labels: 1 }, 2500);
    await sleep(6000, t);
    // on 19 November the Sun is in Libra, a few degrees from the border of Scorpius
    if (['Lib', 'Sco'].includes(astro.constellationOf(sun))) {
      say(T.s_birthDay3, 5000, '', 's_birthDay3');
      await sleep(6200, t);
    }
    tween(S, { reveal: 0, lines: 0, labels: 0 }, 2500);
    await sleep(1500, t);
  }
  const lapse = bornByDay ? 7000 : 10500;
  tween(S, { minutes: EVENING - 6 }, lapse, easeInOut);
  camTo({ az: aim.az, alt: aim.alt }, lapse);
  await sleep(lapse + 200, t);

  // 4 ─ the night
  S.flow = 0.5;
  tween(S, { labels: 1 }, 2500);
  say(T.s_moon, 4400, '', 's_moon');
  await sleep(5400, t);
  if (bornAtNight) {
    say(T.s_birthNight(hhmm), 5200);
    await sleep(6400, t);
  }
  if (aim.saturn) {
    tween(S, { lines: 1 }, 2500);
    say(T.s_saturn, 4400, '', 's_saturn');
    await sleep(5400, t);
  }
  say(T.s_all, 3800, '', 's_all');
  tween(S, { lines: 0 }, 3000);
  await sleep(4300, t);
  await finale(t);
}

function endLapse() {
  S.lapse = null;
  S.dateOnly = false;
  el.count.classList.remove('on');
  skyCacheKey = null;
}

async function finale(t) {
  S.mode = 'finale';
  endLapse();
  stopVoice();
  hush();
  hideCard();
  const aim = eveningAim();
  S.flow = 0;
  if (Math.abs(S.minutes - EVENING) > 30) {
    tweens = [];
    S.minutes = EVENING;
    Object.assign(cam, { az: aim.az, alt: aim.alt, fov: 108 });
    S.reveal = 0;
    S.storm = 0;
  }
  tween(S, { lines: 0, labels: 0 }, 1500);
  el.veil.classList.add('clear');
  el.top.classList.add('on');
  await sleep(900, t);
  gatherStars();
  tween(S, { morph: 1 }, 5200, (u) => u);
  S.party = 0.5;
  const tune = audio.happyBirthday(0.52) * 1000;
  document.title = CONFIG.name ? `${T.happy}, ${CONFIG.name} ✦` : `${T.happy} ✦`;
  await sleep(5400, t);
  voiceUntil = performance.now() + audio.speak('happy') * 1000;
  await sleep(800, t);
  say(FROM ? `${T.s_after}\n${T.p_too(FROM.name)}` : T.s_after, Math.max(tune - 4500, 6000), 'small', 's_after');
  await sleep(Math.max(tune - 5200, 7000) + 3500, t);
  S.party = 0;
  tween(S, { morph: 0 }, 4200, (u) => u);
  await sleep(4000, t);
  explore();
}

function explore() {
  token++;
  S.mode = 'explore';
  endLapse();
  stopVoice();
  el.skip.hidden = true;
  S.flow = 0;
  S.party = 0;
  S.storm = 0;
  tween(S, { labels: 1, lines: S.linesWanted ? 1 : 0, reveal: 0 }, 1500);
  el.time.value = Math.round(S.minutes);
  el.bar.hidden = false;
  requestAnimationFrame(() => el.bar.classList.add('on'));
  say(T.hint, 7500, 'small raised');
}

const guard = (p) => p.catch((e) => { if (e !== CANCEL) throw e; });

el.skip.addEventListener('click', () => {
  if (S.mode === 'story') guard(finale(++token));
  else if (S.mode === 'finale') {
    hush();
    tween(S, { morph: 0 }, 1800, (u) => u);
    explore();
  }
});

// ── controls ───────────────────────────────────────────────────────────────
el.time.addEventListener('input', () => {
  S.minutes = +el.time.value;
  hideCard();
  if (Math.abs(S.minutes - (6 * 60 + 10)) < 14 && !stormNoted) {
    stormNoted = true;
    say(T.stormNow, 3200, 'small raised');
  }
});
let stormNoted = false;

el.btnLines.addEventListener('click', () => {
  S.linesWanted = !S.linesWanted;
  el.btnLines.setAttribute('aria-pressed', S.linesWanted);
  tween(S, { lines: S.linesWanted ? 1 : 0 }, 900);
});
el.btnSound.addEventListener('click', () => {
  audio.setMuted(!audio.isMuted());
  el.btnSound.setAttribute('aria-pressed', !audio.isMuted());
});
el.btnReplay.addEventListener('click', () => {
  el.bar.classList.remove('on');
  hush();
  el.veil.classList.remove('clear');
  const t = ++token;
  guard(sleep(1700, t).then(() => story()));
});

function buildTicks() {
  const marks = [[6 * 60 + 10, T.ev_storm, ''], [1440 + 3 * 60 + 34, T.ev_full, '']];
  if (BIRTH !== null) marks.push([BIRTH, T.ev_birth, 'you']);
  for (const [m, label, cls] of marks) {
    const s = document.createElement('span');
    s.textContent = label;
    s.className = cls;
    s.style.left = `${(m / 1800) * 100}%`;
    el.ticks.appendChild(s);
  }
}

// ── boot ───────────────────────────────────────────────────────────────────
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  renderer.resize();
  labelCanvas.width = Math.round(W * renderer.dpr);
  labelCanvas.height = Math.round(H * renderer.dpr);
  if (S.morph > 0 && sky) {
    updateCamera();
    gatherStars();
  }
}

function slerpPush(out, a, b) {
  const ang = Math.acos(clamp(dot(a, b), -1, 1));
  const n = Math.max(1, Math.ceil(ang / (3 * DEG)));
  let prev = a;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const p = ang < 1e-6 ? b : norm([0, 1, 2].map((k) => (Math.sin((1 - u) * ang) * a[k] + Math.sin(u * ang) * b[k]) / Math.sin(ang)));
    out.push(...prev, ...p);
    prev = p;
  }
}

async function boot() {
  try {
    renderer = new Renderer(skyCanvas);
  } catch (e) {
    document.body.innerHTML = `<div class="fallback"><small>${T.noWebgl}</small>${T.happy}${CONFIG.name ? ', ' + CONFIG.name : ''} ✦</div>`;
    return;
  }
  const [bin, json] = await Promise.all([
    fetch('data/stars.bin').then((r) => r.arrayBuffer()),
    fetch('data/sky.json').then((r) => r.json()),
    document.fonts.load('italic 500 40px Cormorant', T.happy + CONFIG.name).catch(() => {}),
    document.fonts.load('600 40px Cormorant', T.happy + CONFIG.name).catch(() => {}),
  ]);
  meta = json;
  const dv = new DataView(bin);
  starCount = bin.byteLength / 6;
  starPos = new Float32Array(starCount * 3);
  starData = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const v = astro.unit((dv.getUint16(i * 6, true) / 65536) * 360, (dv.getInt16(i * 6 + 2, true) / 32767) * 90);
    starPos.set(v, i * 3);
    starData[i * 3] = dv.getUint8(i * 6 + 4) / 20 - 2;
    starData[i * 3 + 1] = dv.getUint8(i * 6 + 5) / 100 - 0.5;
    starData[i * 3 + 2] = 0.02 + Math.random() * 0.98;
  }
  renderer.setStars(starPos, starData);

  const lines = [];
  for (const c of meta.constellations) {
    c.vec = astro.unit(c.at[0], c.at[1]);
    conById[c.id] = c;
    for (const line of c.lines)
      for (let i = 1; i < line.length; i++) slerpPush(lines, astro.unit(...line[i - 1]), astro.unit(...line[i]));
  }
  renderer.setLines(new Float32Array(lines));
  named = meta.named.map(([i, name, , desig, con]) => ({
    i, name, desig, con,
    mag: starData[i * 3],
    vec: [starPos[i * 3], starPos[i * 3 + 1], starPos[i * 3 + 2]],
  }));
  renderer.setSkyline(paintSkyline());
  buildTicks();
  if (CONFIG.voice) audio.loadVoice(CONFIG.voice.lang, CONFIG.voice.ext, VOICE_LINES);

  sky = astro.skyAt(astro.fromMinutes(S.minutes));
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);

  el.begin.textContent = T.introTap;
  el.begin.disabled = false;
  const begin = () => {
    if (S.mode !== 'intro') return;
    audio.startAudio();
    el.intro.classList.add('gone');
    guard(story());
  };
  el.intro.addEventListener('click', begin);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') begin();
  });
}

if (new URLSearchParams(location.search).has('debug')) {
  window.__sky = {
    S, cam, explore, tap,
    where: (kind, name) => {
      const v = kind === 'moon' ? sky.moon.vec : kind === 'star' ? named.find((n) => n.name === name).vec : sky.planets.find((p) => p.id === kind).vec;
      const p = project(v);
      return [p.x, p.y];
    },
  };
}

boot();
