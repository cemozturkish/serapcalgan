// Builds the compact sky data used by the site from the d3-celestial catalog
// (https://github.com/ofrohn/d3-celestial, BSD-3-Clause).
//
//   npm install d3-celestial
//   node tools/build-data.mjs node_modules/d3-celestial/data
//
// Output:
//   data/stars.bin  6 bytes per star, brightest first:
//                   uint16 RA (0..360°), int16 Dec (±90°), uint8 (mag+2)*20, uint8 (B-V+0.5)*100
//   data/sky.json   constellation lines + names, and names of the brighter stars
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('usage: node tools/build-data.mjs <d3-celestial/data>');
const load = (f) => JSON.parse(readFileSync(join(src, f), 'utf8'));
const ra360 = (lon) => ((lon % 360) + 360) % 360;
const r2 = (v) => Math.round(v * 100) / 100;

// ---- stars ---------------------------------------------------------------
const stars = load('stars.8.json').features
  .map((f) => ({
    hip: f.id,
    ra: ra360(f.geometry.coordinates[0]),
    dec: f.geometry.coordinates[1],
    mag: f.properties.mag,
    bv: Number.isFinite(parseFloat(f.properties.bv)) ? parseFloat(f.properties.bv) : 0.6,
  }))
  .sort((a, b) => a.mag - b.mag);

const buf = Buffer.alloc(stars.length * 6);
stars.forEach((s, i) => {
  buf.writeUInt16LE(Math.min(65535, Math.round((s.ra / 360) * 65536)), i * 6);
  buf.writeInt16LE(Math.round((s.dec / 90) * 32767), i * 6 + 2);
  buf.writeUInt8(Math.max(0, Math.min(255, Math.round((s.mag + 2) * 20))), i * 6 + 4);
  buf.writeUInt8(Math.max(0, Math.min(255, Math.round((s.bv + 0.5) * 100))), i * 6 + 5);
});
writeFileSync('data/stars.bin', buf);

// ---- star names ----------------------------------------------------------
const names = load('starnames.json');
const named = [];
stars.forEach((s, i) => {
  if (s.mag > 5.2) return;
  const n = names[s.hip];
  if (!n) return;
  const desig = n.bayer || n.flam || '';
  if (!n.name && !desig) return;
  // [index into stars.bin, proper name, Turkish name, designation, constellation]
  named.push([i, n.name || '', n.tr && n.tr !== n.name ? n.tr : '', desig, n.c || '']);
});

// ---- constellations ------------------------------------------------------
const lines = {};
for (const f of load('constellations.lines.json').features) {
  lines[f.id] = f.geometry.coordinates.map((line) => line.map(([lon, lat]) => [r2(ra360(lon)), r2(lat)]));
}
const constellations = load('constellations.json').features.map((f) => ({
  id: f.id,
  en: f.properties.en || f.properties.name,
  la: f.properties.name,
  gen: f.properties.gen,
  tr: f.properties.tr || f.properties.name,
  rank: +f.properties.rank,
  at: [r2(ra360(f.geometry.coordinates[0])), r2(f.geometry.coordinates[1])],
  lines: lines[f.id] || [],
}));

writeFileSync('data/sky.json', JSON.stringify({ count: stars.length, named, constellations }));
console.log(`${stars.length} stars, ${named.length} named, ${constellations.length} constellations`);
