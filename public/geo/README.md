# Geo data

`countries_110m.json` is used for offline country lookup (Natural Earth 110m admin 0 countries GeoJSON).

To create or update it, run from the project root:

    node scripts/download-countries.mjs

If the file is missing, the app will try to load the same data from CDN (may fail due to CORS in some environments).
