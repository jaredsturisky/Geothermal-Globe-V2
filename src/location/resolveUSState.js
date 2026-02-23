/**
 * resolveUSState.js
 *
 * Resolves (lat, lon) to a US state name using polygon containment.
 * Used only when the country has already been resolved to the United States.
 * Loads US states GeoJSON once and caches parsed features with bboxes for performance.
 */

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import bbox from '@turf/bbox';
import usStatesCollection from '../data/us_states.json';

let cachedFeatures = null;

function normalizeLon(lon) {
  let l = Number(lon);
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}

function clampLat(lat) {
  const la = Number(lat);
  return Math.max(-90, Math.min(90, la));
}

function getFeaturesWithBbox() {
  if (cachedFeatures) return cachedFeatures;
  cachedFeatures = (usStatesCollection.features || []).map((feature) => ({
    feature,
    bbox: bbox(feature),
  }));
  return cachedFeatures;
}

function pointInBbox(lon, lat, box) {
  const [minX, minY, maxX, maxY] = box;
  if (minX <= maxX) {
    return lon >= minX && lon <= maxX && lat >= minY && lat <= maxY;
  }
  return (lon >= minX || lon <= maxX) && lat >= minY && lat <= maxY;
}

function getStateName(feature) {
  const p = feature?.properties || {};
  return p.name || p.NAME || p.admin || p.ADMIN || null;
}

/**
 * Resolve (lat, lon) to a US state name using point-in-polygon.
 * Supports Polygon and MultiPolygon (via Turf). Alaska and Hawaii included.
 *
 * @param {number} lat - Latitude WGS84
 * @param {number} lon - Longitude WGS84
 * @returns {string|null} State name or null if not in any state
 */
export function resolveUSState(lat, lon) {
  const latNorm = clampLat(lat);
  const lonNorm = normalizeLon(lon);
  const featuresWithBbox = getFeaturesWithBbox();
  const pt = point([lonNorm, latNorm]);

  for (const { feature, bbox: box } of featuresWithBbox) {
    if (!pointInBbox(lonNorm, latNorm, box)) continue;
    if (booleanPointInPolygon(pt, feature)) {
      return getStateName(feature);
    }
  }
  return null;
}
