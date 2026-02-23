/**
 * Minimal tests for parseResolvedPlace (regionUtils).
 * Run: node scripts/test-region-utils.mjs
 */

import { parseResolvedPlace, getContinentFromCountry } from '../src/location/regionUtils.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const tests = [
  () => {
    const { countryName, stateName } = parseResolvedPlace('Texas, USA');
    assert(countryName === 'USA', 'USA: countryName');
    assert(stateName === 'Texas', 'USA: stateName');
  },
  () => {
    const { countryName, stateName } = parseResolvedPlace('California, USA');
    assert(countryName === 'USA' && stateName === 'California', 'California, USA');
  },
  () => {
    const { countryName, stateName } = parseResolvedPlace('France');
    assert(countryName === 'France' && stateName === null, 'France');
  },
  () => {
    const { countryName, stateName } = parseResolvedPlace('Sudan');
    assert(countryName === 'Sudan' && stateName === null, 'Sudan');
  },
  () => {
    const { countryName } = parseResolvedPlace('Some Region, United Kingdom');
    assert(countryName === 'United Kingdom', 'last segment is country');
  },
  () => {
    const { countryName, stateName } = parseResolvedPlace('');
    assert(countryName === '' && stateName === null, 'empty string');
  },
  () => {
    assert(getContinentFromCountry('USA') === 'North America', 'USA continent');
    assert(getContinentFromCountry('France') === 'Europe', 'France continent');
    assert(getContinentFromCountry('Unknown') === 'Other', 'unknown → Other');
  },
];

let passed = 0;
for (const t of tests) {
  try {
    t();
    passed++;
  } catch (err) {
    console.error('FAIL:', err.message);
  }
}
console.log(`regionUtils: ${passed}/${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
