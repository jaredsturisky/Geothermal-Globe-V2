#!/usr/bin/env node
/**
 * Download US states GeoJSON into src/data for USA state lookup.
 * Run once: node scripts/download-us-states.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = `${__dirname}/../src/data/us_states.json`;
const URL = 'https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json';

const res = await fetch(URL);
if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
const json = await res.json();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(json), 'utf8');
console.log('Wrote', OUT);
