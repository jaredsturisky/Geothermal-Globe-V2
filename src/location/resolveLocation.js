/**
 * resolveLocation.js
 *
 * Resolves a (lat, lon) point to a country name using offline polygon containment.
 * We use polygon containment (point-in-polygon) instead of reverse geocoding APIs
 * so that:
 *   - Clicks on land always resolve to the correct country (no snapping to seas or
 *     distant places).
 *   - Results are deterministic and work offline.
 *   - No API rate limits or CORS issues.
 *
 * To update the country dataset: replace public/geo/countries_110m.json with a new
 * GeoJSON (e.g. Natural Earth 110m or 50m admin 0 countries), or change
 * COUNTRIES_GEOJSON_URL below to point to a new source.
 */

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import bbox from '@turf/bbox';

const COUNTRIES_GEOJSON_URL = '/geo/countries_110m.json';
const COUNTRIES_CDN_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_countries.geojson';

let cachedCollection = null;
let cachedFeatures = null;

/**
 * Normalize longitude to [-180, 180]. Handles antimeridian wrapping.
 */
function normalizeLon(lon) {
  let l = Number(lon);
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}

/**
 * Clamp latitude to valid range.
 */
function clampLat(lat) {
  const la = Number(lat);
  return Math.max(-90, Math.min(90, la));
}

/**
 * Load and parse countries GeoJSON. Tries local path first, then CDN. Caches result.
 */
async function loadCountries() {
  if (cachedCollection) return cachedCollection;
  let url = COUNTRIES_GEOJSON_URL;
  let res = await fetch(url).catch(() => null);
  if (!res?.ok) {
    url = COUNTRIES_CDN_URL;
    res = await fetch(url);
  }
  if (!res.ok) throw new Error(`Failed to load countries: ${res.status}`);
  const collection = await res.json();
  cachedCollection = collection;
  cachedFeatures = null;
  return collection;
}

/**
 * Build list of { feature, bbox } for fast bbox prefilter. Cached after first load.
 */
function getFeaturesWithBbox(collection) {
  if (cachedFeatures) return cachedFeatures;
  cachedFeatures = buildFeaturesWithBbox(collection);
  return cachedFeatures;
}

/**
 * Check if point [lon, lat] is inside bbox [minX, minY, maxX, maxY].
 * Handles bboxes that cross antimeridian (maxX < minX).
 */
function pointInBbox(lon, lat, bbox) {
  const [minX, minY, maxX, maxY] = bbox;
  if (minX <= maxX) {
    return lon >= minX && lon <= maxX && lat >= minY && lat <= maxY;
  }
  return (lon >= minX || lon <= maxX) && lat >= minY && lat <= maxY;
}

/**
 * Get country name from feature properties (Natural Earth uses NAME or ADMIN).
 */
function getCountryName(feature) {
  const p = feature?.properties || {};
  return p.NAME || p.ADMIN || p.name || p.admin || 'Unknown';
}

/**
 * Build features with bbox for a collection (no caching).
 */
function buildFeaturesWithBbox(collection) {
  return (collection.features || []).map((feature) => ({
    feature,
    bbox: bbox(feature),
  }));
}

/**
 * Resolve (latitude, longitude) to country or ocean using a preloaded GeoJSON collection.
 * Used for tests and validation without fetching. Handles MultiPolygon via Turf.
 *
 * @param {number} lat - Latitude in WGS84 (-90 to 90)
 * @param {number} lon - Longitude in WGS84 (any range; normalized to -180..180)
 * @param {object} collection - GeoJSON FeatureCollection (e.g. Natural Earth countries)
 * @returns {{ country: string|null, region: string|null, city: string|null, label: string, lat: number, lon: number }}
 */
export function resolveLocationWithCollection(lat, lon, collection) {
  const latNorm = clampLat(lat);
  const lonNorm = normalizeLon(lon);
  const result = {
    country: null,
    region: null,
    city: null,
    label: '',
    lat: latNorm,
    lon: lonNorm,
  };
  const featuresWithBbox = buildFeaturesWithBbox(collection);
  const pt = point([lonNorm, latNorm]);
  for (const { feature, bbox: box } of featuresWithBbox) {
    if (!pointInBbox(lonNorm, latNorm, box)) continue;
    if (booleanPointInPolygon(pt, feature)) {
      result.country = getCountryName(feature);
      result.label = result.country;
      return result;
    }
  }
  result.label = 'Open ocean';
  return result;
}

/** Country name(s) that trigger US state lookup (Natural Earth may use either). */
const USA_COUNTRY_NAMES = ['United States of America', 'United States'];

/**
 * Resolve (latitude, longitude) to country or ocean label using polygon containment.
 * When the country is the USA, an additional state lookup runs and the label becomes "State, USA".
 *
 * @param {number} lat - Latitude in WGS84 (-90 to 90)
 * @param {number} lon - Longitude in WGS84 (any range; normalized to -180..180)
 * @returns {Promise<{ country: string|null, region: string|null, city: string|null, label: string, lat: number, lon: number }>}
 */
export async function resolveLocation(lat, lon) {
  const collection = await loadCountries();
  let result = resolveLocationWithCollection(lat, lon, collection);

  if (USA_COUNTRY_NAMES.includes(result.country)) {
    const { resolveUSState } = await import('./resolveUSState.js');
    const stateName = resolveUSState(lat, lon);
    if (stateName) {
      result = { ...result, label: `${stateName}, USA` };
      console.log('Resolved USA state:', stateName);
    }
  }

  return result;
}
