#!/usr/bin/env node
/**
 * Download Natural Earth 110m countries GeoJSON into public/geo for same-origin loading.
 * Run once: node scripts/download-countries.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = `${__dirname}/../public/geo/countries_110m.json`;
const URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson';

const res = await fetch(URL);
if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
const json = await res.json();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(json), 'utf8');
console.log('Wrote', OUT);
