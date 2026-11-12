// Where everything in the sky was, for a given minute. All the real work is done
// by Astronomy Engine (https://github.com/cosinekitty/astronomy, MIT).
import { CONFIG } from './config.js';

const A = window.Astronomy;
const DEG = Math.PI / 180;

export const observer = new A.Observer(CONFIG.place.latitude, CONFIG.place.longitude, CONFIG.place.elevation);

const { year, month, day } = CONFIG.date;
const MIDNIGHT = Date.UTC(year, month - 1, day) - CONFIG.utcOffsetHours * 3600e3;

/** Minutes after local midnight on the birth date → absolute time (ms). */
export const fromMinutes = (m) => MIDNIGHT + m * 60e3;
export const toMinutes = (ms) => (ms - MIDNIGHT) / 60e3;

/** "06:10" → minutes after midnight */
export const parseClock = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export const clock = (minutes) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// ── tiny 3×3 matrix helpers (column-major, like WebGL) ──
export const mul = (a, b) => {
  const o = new Float32Array(9);
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 3; r++)
      o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2];
  return o;
};
export const transpose = (m) => new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
export const apply = (m, v) => [
  m[0] * v[0] + m[3] * v[1] + m[6] * v[2],
  m[1] * v[0] + m[4] * v[1] + m[7] * v[2],
  m[2] * v[0] + m[5] * v[1] + m[8] * v[2],
];
const flat = (r) => new Float32Array([...r.rot[0], ...r.rot[1], ...r.rot[2]]);

export const unit = (raDeg, decDeg) => {
  const ra = raDeg * DEG, dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
};
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Catalogue (J2000) → galactic rotation, constant. */
export const GAL = flat(A.Rotation_EQJ_GAL());

/** Horizontal vector (x north, y west, z up) → altitude / azimuth in degrees. */
export const altAz = (h) => ({
  alt: Math.asin(Math.max(-1, Math.min(1, h[2]))) / DEG,
  az: ((Math.atan2(-h[1], h[0]) / DEG) + 360) % 360,
});

export const PLANETS = [
  { id: 'Mercury', bv: 0.95 },
  { id: 'Venus', bv: 0.72 },
  { id: 'Mars', bv: 1.45 },
  { id: 'Jupiter', bv: 0.8 },
  { id: 'Saturn', bv: 1.02 },
];

/** Leonid radiant (J2000). */
export const LEONID_RADIANT = unit(153.3, 21.8);

// The 2002 storm as seen from Europe: a sharp peak at 04:10 UT on 19 November
// (06:10 in Istanbul) on top of the normal shower. Returns meteors per hour
// for an observer with the radiant overhead.
const STORM_PEAK = Date.UTC(2002, 10, 19, 4, 10);
export function leonidZHR(ms) {
  const h = (ms - STORM_PEAK) / 3600e3;
  const storm = 2500 * Math.exp(-0.5 * (h / 0.3) ** 2);
  const broad = 150 * Math.exp(-0.5 * (h / 1.6) ** 2);
  const shower = 15 * Math.exp(-0.5 * (h / 30) ** 2);
  return storm + broad + shower;
}

/** Everything time-dependent. */
export function skyAt(ms) {
  const time = A.MakeTime(new Date(ms));
  const R = flat(A.Rotation_EQJ_HOR(time, observer)); // catalogue → horizon
  const body = (name) => {
    const eq = A.Equator(name, time, observer, false, true);
    const vec = norm([eq.vec.x, eq.vec.y, eq.vec.z]);
    const hor = apply(R, vec);
    return { id: name, vec, hor, ...altAz(hor), ra: eq.ra, dec: eq.dec };
  };
  const sun = body('Sun');
  const moon = body('Moon');
  moon.fraction = A.Illumination('Moon', time).phase_fraction;
  const planets = PLANETS.map((p) => ({ ...body(p.id), bv: p.bv, mag: A.Illumination(p.id, time).mag }));
  const radiant = altAz(apply(R, LEONID_RADIANT));
  return { ms, R, sun, moon, planets, radiant };
}

export const constellationOf = (b) => A.Constellation(b.ra, b.dec).symbol;
