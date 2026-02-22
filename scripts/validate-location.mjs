#!/usr/bin/env node
/**
 * Validation script for resolveLocation containment logic.
 * Run: node scripts/validate-location.mjs
 *
 * Known points:
 *   Sudan:      lat 15.5,  lon 32.56  -> Sudan
 *   Algeria:   lat 28,    lon 2       -> Algeria
 *   Red Sea:   lat 20,    lon 38      -> Open ocean (not a country)
 *   France:    lat 46,    lon 2       -> France
 */

import { resolveLocationWithCollection } from '../src/location/resolveLocation.js';

const COUNTRIES_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson';

const TESTS = [
  { lat: 15.5, lon: 32.56, expectCountry: 'Sudan', desc: 'Sudan' },
  { lat: 28, lon: 2, expectCountry: 'Algeria', desc: 'Algeria' },
  { lat: 20, lon: 38, expectCountry: null, expectLabel: 'Open ocean', desc: 'Red Sea' },
  { lat: 46, lon: 2, expectCountry: 'France', desc: 'France' },
];

async function main() {
  console.log('Fetching countries GeoJSON...');
  const res = await fetch(COUNTRIES_URL);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const collection = await res.json();
  console.log('Running validation tests...\n');

  let failed = 0;
  for (const t of TESTS) {
    const result = resolveLocationWithCollection(t.lat, t.lon, collection);
    const countryOk = t.expectCountry !== undefined ? result.country === t.expectCountry : true;
    const labelOk =
      t.expectLabel !== undefined ? result.label === t.expectLabel : result.country === t.expectCountry;
    const pass = countryOk && labelOk;
    if (!pass) failed++;
    console.log(
      pass ? 'PASS' : 'FAIL',
      t.desc,
      `(${t.lat}, ${t.lon})`,
      '->',
      result.label,
      t.expectCountry !== undefined ? `(expected country: ${t.expectCountry})` : `(expected label: ${t.expectLabel})`
    );
  }
  console.log('\n' + (failed === 0 ? 'All tests passed.' : `${failed} test(s) failed.`));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
