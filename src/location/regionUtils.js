/**
 * regionUtils.js
 * Parsing resolvedPlace strings and country-to-continent mapping for region filters.
 */

/** Continent options for the filter select. "Other" for unknown countries. */
export const CONTINENT_OPTIONS = [
  'All',
  'Africa',
  'Antarctica',
  'Asia',
  'Europe',
  'North America',
  'Oceania',
  'South America',
  'Other',
];

/**
 * Minimal country → continent mapping. Unknown countries map to "Other".
 * Covers countries commonly present in geothermal datasets.
 */
const COUNTRY_TO_CONTINENT = {
  Afghanistan: 'Asia',
  Algeria: 'Africa',
  Argentina: 'South America',
  Australia: 'Oceania',
  Austria: 'Europe',
  Bangladesh: 'Asia',
  Bolivia: 'South America',
  Brazil: 'South America',
  Bulgaria: 'Europe',
  Canada: 'North America',
  Chile: 'South America',
  China: 'Asia',
  Colombia: 'South America',
  'Costa Rica': 'North America',
  Croatia: 'Europe',
  Cyprus: 'Asia',
  'Czech Republic': 'Europe',
  Denmark: 'Europe',
  Ecuador: 'South America',
  Egypt: 'Africa',
  Ethiopia: 'Africa',
  Finland: 'Europe',
  France: 'Europe',
  Germany: 'Europe',
  Greece: 'Europe',
  Guatemala: 'North America',
  Honduras: 'North America',
  Hungary: 'Europe',
  Iceland: 'Europe',
  India: 'Asia',
  Indonesia: 'Asia',
  Iran: 'Asia',
  Israel: 'Asia',
  Italy: 'Europe',
  Japan: 'Asia',
  Jordan: 'Asia',
  Kenya: 'Africa',
  Kuwait: 'Asia',
  Lebanon: 'Asia',
  Libya: 'Africa',
  Mexico: 'North America',
  Morocco: 'Africa',
  Nepal: 'Asia',
  'New Zealand': 'Oceania',
  Nicaragua: 'North America',
  Nigeria: 'Africa',
  Norway: 'Europe',
  Oman: 'Asia',
  Pakistan: 'Asia',
  Panama: 'North America',
  'Papua New Guinea': 'Oceania',
  Peru: 'South America',
  Philippines: 'Asia',
  Poland: 'Europe',
  Portugal: 'Europe',
  Romania: 'Europe',
  Russia: 'Europe',
  'Saudi Arabia': 'Asia',
  Serbia: 'Europe',
  Slovakia: 'Europe',
  Slovenia: 'Europe',
  'South Africa': 'Africa',
  Spain: 'Europe',
  Sudan: 'Africa',
  Sweden: 'Europe',
  Switzerland: 'Europe',
  Syria: 'Asia',
  Taiwan: 'Asia',
  Tanzania: 'Africa',
  Thailand: 'Asia',
  Tunisia: 'Africa',
  Turkey: 'Asia',
  Uganda: 'Africa',
  Ukraine: 'Europe',
  'United Arab Emirates': 'Asia',
  'United Kingdom': 'Europe',
  'United States': 'North America',
  'United States of America': 'North America',
  USA: 'North America',
  Venezuela: 'South America',
  Vietnam: 'Asia',
  Yemen: 'Asia',
  Zambia: 'Africa',
};

/**
 * Parse resolvedPlace string into countryName and stateName (for USA).
 * Rules:
 * - If it ends with ", USA", countryName = "USA", stateName = part before ", USA"
 * - Else if it contains a comma, last segment (trimmed) = countryName
 * - Else countryName = resolvedPlace, stateName = null
 *
 * @param {string} resolvedPlace - Label from resolveLocation (e.g. "Texas, USA", "France")
 * @returns {{ countryName: string, stateName: string|null }}
 */
export function parseResolvedPlace(resolvedPlace) {
  if (resolvedPlace == null || typeof resolvedPlace !== 'string') {
    return { countryName: '', stateName: null };
  }
  const trimmed = resolvedPlace.trim();
  if (!trimmed) return { countryName: '', stateName: null };

  if (trimmed.endsWith(', USA')) {
    const statePart = trimmed.slice(0, trimmed.length - ', USA'.length).trim();
    return { countryName: 'USA', stateName: statePart || null };
  }

  const lastComma = trimmed.lastIndexOf(',');
  if (lastComma !== -1) {
    const countryPart = trimmed.slice(lastComma + 1).trim();
    return { countryName: countryPart, stateName: null };
  }

  return { countryName: trimmed, stateName: null };
}

/**
 * Get continent name for a country. Returns "Other" if not in mapping.
 * @param {string} countryName
 * @returns {string}
 */
export function getContinentFromCountry(countryName) {
  if (countryName == null || countryName === '') return 'Other';
  const continent = COUNTRY_TO_CONTINENT[countryName];
  return continent ?? 'Other';
}
