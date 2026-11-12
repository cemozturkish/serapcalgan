// The horizon as seen from the Galata Tower: a strip that wraps once around
// the compass (x = azimuth 0…360°, y = altitude 0…9°). Bearings of the
// landmarks are real; their heights are exaggerated so they read as silhouettes.
import { SKYLINE_TOP_DEG } from './renderer.js';

const W = 4096, H = 256;
const X = W / 360;              // px per degree of azimuth
const Y = H / SKYLINE_TOP_DEG;  // px per degree of altitude

function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function paintSkyline() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rand = rng(19112002);
  const px = (az) => az * X;
  const py = (alt) => H - alt * Y;
  const lights = [];
  const light = (az, alt, kind = 0) => lights.push([az, alt, kind]);

  g.fillStyle = '#000';

  // rolling land all the way round, with a few gentle hills
  const land = (az) => {
    const a = (az * Math.PI) / 180;
    let h = 0.55 + 0.16 * Math.sin(a * 3 + 1) + 0.1 * Math.sin(a * 7 + 2) + 0.05 * Math.sin(a * 17);
    const hill = (c0, w, amp) => amp * Math.exp(-((((az - c0 + 540) % 360 - 180) / w) ** 2));
    h += hill(88, 13, 1.25);   // Çamlıca
    h += hill(160, 16, 0.75);  // the old city on its ridge
    h += hill(219, 9, 0.7);    // Süleymaniye's hill
    h += hill(20, 22, 0.5);    // the hills up the Bosphorus
    h -= hill(118, 10, 0.3);   // the mouth of the Bosphorus, open to the Marmara
    return Math.max(0.22, h);
  };
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) g.lineTo(x, py(land(x / X)));
  g.lineTo(W, H);
  g.fill();

  // a jumble of rooftops along the ridge line
  for (let az = 0; az < 360; az += 0.3 + rand() * 0.5) {
    const base = land(az);
    const dense = az > 125 && az < 240 ? 1 : az > 300 || az < 60 ? 0.8 : 0.45;
    if (rand() > dense) continue;
    const w = 0.25 + rand() * 0.6;
    const h = 0.08 + rand() * 0.3 * dense;
    g.fillRect(px(az), py(base + h), w * X, h * Y + 4);
    if (rand() < 0.75) light(az + rand() * w, base * (0.35 + rand() * 0.6));
    if (rand() < 0.5) light(az + rand() * w, base * (0.2 + rand() * 0.7));
  }

  const minaret = (az, base, h, w = 0.2) => {
    const x = px(az);
    const hw = (w * X) / 2;
    g.fillRect(x - hw, py(base + h * 0.86), hw * 2, h * 0.86 * Y + 2);
    for (const k of [0.5, 0.7]) g.fillRect(x - hw * 1.9, py(base + h * k), hw * 3.8, 2.2); // balconies
    g.beginPath(); // the pointed cap
    g.moveTo(x - hw * 1.15, py(base + h * 0.86));
    g.lineTo(x, py(base + h));
    g.lineTo(x + hw * 1.15, py(base + h * 0.86));
    g.fill();
  };
  // drawn as ellipses, because a degree is taller than it is wide in this strip
  const dome = (az, base, r) => {
    g.beginPath();
    g.ellipse(px(az), py(base), r * X, r * Y, 0, Math.PI, 0);
    g.fill();
    g.fillRect(px(az) - 1, py(base + r) - 5, 2, 6); // finial
  };
  const block = (az0, az1, base, top) => g.fillRect(px(az0), py(top), (az1 - az0) * X, (top - base) * Y + 3);

  const mosque = (az, base, size, minarets) => {
    block(az - size * 1.5, az + size * 1.5, base, base + size * 0.42);
    dome(az - size * 1.05, base + size * 0.36, size * 0.5);
    dome(az + size * 1.05, base + size * 0.36, size * 0.5);
    block(az - size * 0.9, az + size * 0.9, base, base + size * 0.75);
    dome(az, base + size * 0.72, size * 0.82);
    for (const [dx, h] of minarets) minaret(az + dx * size, base, h);
    light(az - size * 0.6, base + size * 0.2, 1);
    light(az + size * 0.6, base + size * 0.2, 1);
    light(az, base + size * 0.5, 1);
  };

  // Topkapı Palace: long low walls, the Tower of Justice, a few chimneys
  const tk = land(153.6);
  block(150.4, 156.6, tk - 0.1, tk + 0.28);
  for (let a = 150.8; a < 156.4; a += 0.62) dome(a, tk + 0.26, 0.17);
  block(153.4, 153.8, tk, tk + 1.3);
  g.beginPath();
  g.moveTo(px(153.25), py(tk + 1.3));
  g.lineTo(px(153.6), py(tk + 2.1));
  g.lineTo(px(153.95), py(tk + 1.3));
  g.fill();
  light(153.6, tk + 1.1, 1);

  // Hagia Sophia: broad shoulders, one great dome, four minarets
  mosque(165, land(165), 1.25, [[-2.0, 2.9], [-1.25, 2.6], [1.25, 2.6], [2.0, 2.9]]);
  // the Blue Mosque and its six
  mosque(174, land(174), 1.15, [[-2.3, 2.5], [-1.6, 3.1], [-0.95, 2.7], [0.95, 2.7], [1.6, 3.1], [2.3, 2.5]]);
  // the New Mosque down by the water
  mosque(189, land(189) - 0.25, 0.8, [[-1.5, 2.2], [1.5, 2.2]]);
  // Süleymaniye on its hill
  mosque(219, land(219), 1.2, [[-2.1, 2.4], [-1.45, 3.2], [1.45, 3.2], [2.1, 2.4]]);
  // Fatih, further off
  mosque(243, land(243), 0.7, [[-1.5, 1.9], [1.5, 1.9]]);

  // the Maiden's Tower, alone in the water at the mouth of the Bosphorus
  const mt = 0.2;
  block(100.35, 101.65, 0, mt + 0.3);
  block(100.75, 101.25, 0, mt + 0.95);
  g.beginPath();
  g.moveTo(px(100.6), py(mt + 0.95));
  g.lineTo(px(101), py(mt + 1.7));
  g.lineTo(px(101.4), py(mt + 0.95));
  g.fill();
  g.fillRect(px(101) - 1, py(mt + 2.1), 2, 0.5 * Y);
  light(101, mt + 0.75, 1);
  light(101, mt + 2.1, 2);

  // Haydarpaşa station across the water
  const hp = land(130);
  block(128.6, 131.4, hp - 0.1, hp + 0.5);
  for (const a of [128.75, 131.25]) {
    block(a - 0.2, a + 0.2, hp, hp + 0.8);
    g.beginPath();
    g.moveTo(px(a - 0.24), py(hp + 0.8));
    g.lineTo(px(a), py(hp + 1.25));
    g.lineTo(px(a + 0.24), py(hp + 0.8));
    g.fill();
  }
  for (let a = 128.9; a < 131.2; a += 0.33) light(a, hp + 0.25, 1);

  // the masts on Çamlıca
  for (const [a, h] of [[85.5, 1.9], [87.6, 2.6], [89.4, 1.6], [91.2, 2.2]]) {
    g.fillRect(px(a) - 1, py(land(a) + h), 2, h * Y);
    light(a, land(a) + h, 2);
    light(a, land(a) + h * 0.55, 2);
  }

  // the Bosphorus Bridge, strung between its two towers
  const b0 = 60.5, b1 = 73.5, deck = 0.95, tower = 2.5;
  g.fillRect(px(b0 - 3), py(deck), (b1 - b0 + 6) * X, 2.5);
  for (const a of [b0, b1]) g.fillRect(px(a) - 1.6, py(tower), 3.2, tower * Y);
  g.strokeStyle = '#000';
  g.lineWidth = 1.6;
  g.beginPath();
  for (let a = b0 - 3; a <= b1 + 3; a += 0.1) {
    let y;
    if (a < b0) y = deck + (tower - deck) * ((a - (b0 - 3)) / 3) ** 1.6;
    else if (a > b1) y = deck + (tower - deck) * ((b1 + 3 - a) / 3) ** 1.6;
    else y = deck + 0.12 + (tower - deck - 0.12) * ((a - (b0 + b1) / 2) / ((b1 - b0) / 2)) ** 2;
    a === b0 - 3 ? g.moveTo(px(a), py(y)) : g.lineTo(px(a), py(y));
  }
  g.stroke();
  g.lineWidth = 0.6;
  for (let a = b0 + 0.45; a < b1; a += 0.45) {
    const y = deck + 0.12 + (tower - deck - 0.12) * ((a - (b0 + b1) / 2) / ((b1 - b0) / 2)) ** 2;
    g.beginPath();
    g.moveTo(px(a), py(y));
    g.lineTo(px(a), py(deck));
    g.stroke();
    light(a, deck + 0.04, 1);
  }
  light(b0, tower, 2);
  light(b1, tower, 2);

  // lights: warm windows, brighter floodlights, red beacons
  g.globalCompositeOperation = 'source-atop';
  for (const [az, alt, kind] of lights) {
    const x = px(az), y = py(alt);
    const r = kind === 1 ? 2.6 : kind === 2 ? 2.2 : 1.3 + rand() * 0.8;
    const col = kind === 2 ? '255,70,50' : kind === 1 ? '255,200,120' : rand() < 0.8 ? '255,186,110' : '200,220,255';
    const a = kind ? 0.95 : 0.35 + rand() * 0.6;
    const gr = g.createRadialGradient(x, y, 0, x, y, r * 2.2);
    gr.addColorStop(0, `rgba(${col},${a})`);
    gr.addColorStop(0.35, `rgba(${col},${a * 0.45})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
  }
  // the beacons sit on top of thin masts, so let them glow past the silhouette
  g.globalCompositeOperation = 'source-over';
  for (const [az, alt, kind] of lights) {
    if (kind !== 2) continue;
    const x = px(az), y = py(alt);
    const gr = g.createRadialGradient(x, y, 0, x, y, 3.5);
    gr.addColorStop(0, 'rgba(255,80,60,0.95)');
    gr.addColorStop(1, 'rgba(255,80,60,0)');
    g.fillStyle = gr;
    g.fillRect(x - 4, y - 4, 8, 8);
  }
  return c;
}
