import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { BitmapLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { _GlobeView as GlobeView, FlyToInterpolator } from '@deck.gl/core';
import { resolveLocation } from './src/location/resolveLocation.js';
import { parseResolvedPlace, getContinentFromCountry, CONTINENT_OPTIONS } from './src/location/regionUtils.js';
import InfoModal from './src/InfoModal.jsx';

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 1.5,
  minZoom: 0,
  maxZoom: 20,
};

const COLOR_RANGE = [
  [1, 152, 189],
  [73, 227, 206],
  [216, 254, 181],
  [254, 237, 177],
  [254, 173, 84],
  [209, 55, 78],
];

function scoreToColor(score) {
  const t = Math.max(0, Math.min(1, score));
  const i = t * (COLOR_RANGE.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, COLOR_RANGE.length - 1);
  const f = i - lo;
  const a = COLOR_RANGE[lo];
  const b = COLOR_RANGE[hi];
  return [
    Math.round(a[0] + f * (b[0] - a[0])),
    Math.round(a[1] + f * (b[1] - a[1])),
    Math.round(a[2] + f * (b[2] - a[2])),
    180,
  ];
}

const GLOBE_VIEW = new GlobeView({ id: 'globe', controller: true });

const PANEL = {
  position: 'absolute',
  background: 'rgba(8, 8, 18, 0.88)',
  backdropFilter: 'blur(10px)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  color: '#e0e0e0',
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  fontSize: 12,
};

/** Proxy score breakdown from available fields (hf, bd). Used for compare-mode explanation. */
function getScoreBreakdown(site) {
  if (!site) return { heatFlowComponent: 0, boundaryDistanceKm: null };
  return {
    heatFlowComponent: site.hf ?? 0,
    boundaryDistanceKm: site.bd ?? null,
  };
}

/** Build winner explanation from score components (higher heat flow better, lower bd better). */
function getWinnerExplanation(slotA, slotB) {
  const a = getScoreBreakdown(slotA);
  const b = getScoreBreakdown(slotB);
  const winner = (slotA?.score ?? 0) >= (slotB?.score ?? 0) ? 'A' : 'B';
  const parts = [];
  if (winner === 'A') {
    const hfDiff = (a.heatFlowComponent ?? 0) - (b.heatFlowComponent ?? 0);
    const bdDiff = (b.boundaryDistanceKm ?? 0) - (a.boundaryDistanceKm ?? 0);
    if (hfDiff > 0) parts.push(`higher heat flow (+${hfDiff.toFixed(0)} mW/m²)`);
    if (bdDiff > 0) parts.push(`closer to plate boundary (−${bdDiff.toFixed(1)} km)`);
  } else {
    const hfDiff = (b.heatFlowComponent ?? 0) - (a.heatFlowComponent ?? 0);
    const bdDiff = (a.boundaryDistanceKm ?? 0) - (b.boundaryDistanceKm ?? 0);
    if (hfDiff > 0) parts.push(`higher heat flow (+${hfDiff.toFixed(0)} mW/m²)`);
    if (bdDiff > 0) parts.push(`closer to plate boundary (−${bdDiff.toFixed(1)} km)`);
  }
  if (parts.length === 0) return 'Scores are very close.';
  return `${winner} wins because it has ${parts.join(' and ')}.`;
}

const BATCH_SIZE = 150;

export default function GeothermalGlobe() {
  const [started, setStarted] = useState(false);
  const [data, setData] = useState([]);
  const [boundaries, setBoundaries] = useState([]);
  const [enrichedData, setEnrichedData] = useState(null);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [selected, setSelected] = useState(null);
  const [clickCoordinate, setClickCoordinate] = useState(null);
  const [resolvedLocation, setResolvedLocation] = useState(null);
  const [locationResolving, setLocationResolving] = useState(false);
  const [viewState, setViewState] = useState({ globe: INITIAL_VIEW_STATE });
  const [potentialThreshold, setPotentialThreshold] = useState(0.5);
  const [continentFilter, setContinentFilter] = useState('All');
  const [countryFilter, setCountryFilter] = useState('All');
  const [compareMode, setCompareMode] = useState(false);
  const [compareSlotA, setCompareSlotA] = useState(null);
  const [compareSlotB, setCompareSlotB] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/geothermal_data.json').then((r) => r.json()),
      fetch('/plate_boundaries.json').then((r) => r.json()),
    ]).then(([geo, bounds]) => {
      setData(geo);
      setBoundaries(bounds);
    });
  }, []);

  useEffect(() => {
    if (!data.length) return;
    let cancelled = false;
    (async () => {
      const enriched = [];
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        if (cancelled) return;
        const batch = data.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          batch.map(async (pt) => {
            const [lon, lat] = pt.coordinates;
            const res = await resolveLocation(lat, lon).catch(() => ({ label: 'Unknown' }));
            const { countryName, stateName } = parseResolvedPlace(res.label);
            const continentName = getContinentFromCountry(countryName);
            return {
              ...pt,
              resolvedPlace: res.label,
              countryName,
              stateName,
              continentName,
            };
          })
        );
        enriched.push(...results);
      }
      if (!cancelled) setEnrichedData(enriched);
    })();
    return () => { cancelled = true; };
  }, [data]);

  const flyTo = useCallback((lon, lat) => {
    setViewState((prev) => ({
      ...prev,
      globe: {
        ...prev.globe,
        longitude: lon,
        latitude: lat,
        zoom: 6,
        transitionDuration: 1500,
        transitionInterpolator: new FlyToInterpolator(),
      },
    }));
  }, []);

  const selectPoint = useCallback((point) => {
    setSelected(point);
  }, []);

  const sourceForFilter = enrichedData ?? data.map((pt) => ({ ...pt, resolvedPlace: '', countryName: '', stateName: null, continentName: 'Other' }));
  const filteredSites = useMemo(() => {
    return sourceForFilter.filter((pt) => {
      if (continentFilter !== 'All' && pt.continentName !== continentFilter) return false;
      if (countryFilter !== 'All' && pt.countryName !== countryFilter) return false;
      return true;
    });
  }, [sourceForFilter, continentFilter, countryFilter]);

  const { topSitesComputed, uniqueCountries } = useMemo(() => {
    const scoreExtent =
      filteredSites.length > 0
        ? filteredSites.reduce(
            (acc, d) => {
              const s = d.score ?? 0;
              return { min: Math.min(acc.min, s), max: Math.max(acc.max, s) };
            },
            { min: Infinity, max: -Infinity }
          )
        : { min: 0, max: 1 };
    const scoreRange = scoreExtent.max - scoreExtent.min || 1;
    const normalizeScore = (s) =>
      (Math.max(scoreExtent.min, Math.min(scoreExtent.max, s ?? 0)) - scoreExtent.min) / scoreRange;
    const aboveThreshold = filteredSites.filter((d) => normalizeScore(d.score) >= potentialThreshold);
    const sorted = [...aboveThreshold].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const top20 = sorted.slice(0, 20).map((site, i) => {
      const [lon, lat] = site.coordinates;
      return { ...site, rank: i + 1, lon, lat };
    });
    const countries = [...new Set(sourceForFilter.map((pt) => pt.countryName).filter(Boolean))].sort();
    return { topSitesComputed: top20, uniqueCountries: countries };
  }, [filteredSites, potentialThreshold, sourceForFilter]);

  const handleMapClick = useCallback(
    ({ coordinate, object, layer }) => {
      const setResolvedAndSelect = (lon, lat, point, doFly = true) => {
        setClickCoordinate([lon, lat]);
        setLocationResolving(true);
        resolveLocation(lat, lon)
          .then((res) => {
            setResolvedLocation(res);
            setLocationResolving(false);
          })
          .catch(() => {
            setResolvedLocation({ country: null, region: null, city: null, label: 'Unable to load map data', lat, lon });
            setLocationResolving(false);
          });
        selectPoint(point);
        if (doFly) flyTo(lon, lat);
      };

      const pointToSlot = (obj) => {
        const lon = obj.lon ?? obj.coordinates?.[0];
        const lat = obj.lat ?? obj.coordinates?.[1];
        const resolvedPlace = obj.resolvedPlace ?? '';
        return {
          coordinates: [lon, lat],
          lon,
          lat,
          score: obj.score,
          hf: obj.hf,
          bd: obj.bd,
          resolvedPlace,
        };
      };

      const isSamePoint = (slot, obj) => {
        if (!slot) return false;
        const lon = obj.lon ?? obj.coordinates?.[0];
        const lat = obj.lat ?? obj.coordinates?.[1];
        return slot.lon === lon && slot.lat === lat;
      };

      if (compareMode) {
        if (object && (layer?.id === 'top-sites' || layer?.id === 'heatmap-dots')) {
          const lon = object.lon ?? object.coordinates?.[0];
          const lat = object.lat ?? object.coordinates?.[1];
          const slot = pointToSlot({ ...object, lon, lat, resolvedPlace: object.resolvedPlace ?? '' });
          if (isSamePoint(compareSlotA, slot)) {
            setCompareSlotA(null);
            return;
          }
          if (isSamePoint(compareSlotB, slot)) {
            setCompareSlotB(null);
            return;
          }
          if (!compareSlotA) {
            setCompareSlotA(slot);
            setResolvedAndSelect(lon, lat, { ...object, coordinates: [lon, lat], score: object.score, hf: object.hf, bd: object.bd }, true);
            return;
          }
          if (!compareSlotB) {
            setCompareSlotB(slot);
            setResolvedAndSelect(lon, lat, { ...object, coordinates: [lon, lat], score: object.score, hf: object.hf, bd: object.bd }, true);
            return;
          }
          setCompareSlotA(slot);
          setCompareSlotB(null);
          setResolvedAndSelect(lon, lat, { ...object, coordinates: [lon, lat], score: object.score, hf: object.hf, bd: object.bd }, true);
          return;
        }
        if (coordinate) {
          const [clickLon, clickLat] = coordinate;
          const extent = filteredSites.length
            ? filteredSites.reduce((acc, d) => ({ min: Math.min(acc.min, d.score ?? 0), max: Math.max(acc.max, d.score ?? 0) }), { min: Infinity, max: -Infinity })
            : { min: 0, max: 1 };
          const range = extent.max - extent.min || 1;
          const norm = (s) => (Math.max(extent.min, Math.min(extent.max, s ?? 0)) - extent.min) / range;
          const highOnly = filteredSites.filter((pt) => norm(pt.score) >= potentialThreshold);
          let nearest = null;
          let minDist = Infinity;
          for (const pt of highOnly) {
            const [lon, lat] = pt.coordinates;
            const d = (lon - clickLon) ** 2 + (lat - clickLat) ** 2;
            if (d < minDist) {
              minDist = d;
              nearest = pt;
            }
          }
          if (nearest) {
            const slot = pointToSlot(nearest);
            if (isSamePoint(compareSlotA, slot)) {
              setCompareSlotA(null);
              return;
            }
            if (isSamePoint(compareSlotB, slot)) {
              setCompareSlotB(null);
              return;
            }
            if (!compareSlotA) {
              setCompareSlotA(slot);
              setResolvedAndSelect(nearest.coordinates[0], nearest.coordinates[1], nearest, true);
              return;
            }
            if (!compareSlotB) {
              setCompareSlotB(slot);
              setResolvedAndSelect(nearest.coordinates[0], nearest.coordinates[1], nearest, true);
              return;
            }
            setCompareSlotA(slot);
            setCompareSlotB(null);
            setResolvedAndSelect(nearest.coordinates[0], nearest.coordinates[1], nearest, true);
          }
        }
        return;
      }

      if (object && layer?.id === 'top-sites') {
        setResolvedAndSelect(object.lon, object.lat, {
          coordinates: [object.lon, object.lat],
          score: object.score,
          hf: object.hf,
          bd: object.bd,
        });
        return;
      }
      if (object && layer?.id === 'heatmap-dots') {
        const [lon, lat] = object.coordinates;
        setResolvedAndSelect(lon, lat, object);
        return;
      }
      if (!coordinate) return;
      const [clickLon, clickLat] = coordinate;
      setClickCoordinate(coordinate);
      setLocationResolving(true);
      resolveLocation(clickLat, clickLon)
        .then((res) => {
          setResolvedLocation(res);
          setLocationResolving(false);
        })
        .catch(() => {
          setResolvedLocation({ country: null, region: null, city: null, label: 'Unable to load map data', lat: clickLat, lon: clickLon });
          setLocationResolving(false);
        });

      if (!filteredSites.length) return;
      const extent = filteredSites.reduce(
        (acc, d) => {
          const s = d.score ?? 0;
          return { min: Math.min(acc.min, s), max: Math.max(acc.max, s) };
        },
        { min: Infinity, max: -Infinity }
      );
      const range = extent.max - extent.min || 1;
      const norm = (s) => (Math.max(extent.min, Math.min(extent.max, s ?? 0)) - extent.min) / range;
      const highOnly = filteredSites.filter((pt) => norm(pt.score) >= potentialThreshold);
      let nearest = null;
      let minDist = Infinity;
      for (const pt of highOnly) {
        const [lon, lat] = pt.coordinates;
        const d = (lon - clickLon) ** 2 + (lat - clickLat) ** 2;
        if (d < minDist) {
          minDist = d;
          nearest = pt;
        }
      }
      selectPoint(nearest);
    },
    [data, filteredSites, potentialThreshold, selectPoint, flyTo, compareMode, compareSlotA, compareSlotB]
  );

  const layers = useMemo(() => {
    const basemap = new TileLayer({
      id: 'basemap',
      data: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: (props) => {
        const { tile: { bbox } } = props;
        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [bbox.west, bbox.south, bbox.east, bbox.north],
        });
      },
    });

    const scoreExtent =
      filteredSites.length > 0
        ? filteredSites.reduce(
            (acc, d) => {
              const s = d.score ?? 0;
              return { min: Math.min(acc.min, s), max: Math.max(acc.max, s) };
            },
            { min: Infinity, max: -Infinity }
          )
        : { min: 0, max: 1 };
    const scoreRange = scoreExtent.max - scoreExtent.min || 1;
    const normalizeScore = (s) =>
      (Math.max(scoreExtent.min, Math.min(scoreExtent.max, s ?? 0)) - scoreExtent.min) / scoreRange;
    const highPotentialData = filteredSites.filter((d) => normalizeScore(d.score) >= potentialThreshold);

    const heatmapDots = new ScatterplotLayer({
      id: 'heatmap-dots',
      data: highPotentialData,
      getPosition: (d) => d.coordinates,
      getRadius: 28000,
      radiusUnits: 'meters',
      getFillColor: (d) => scoreToColor(normalizeScore(d.score)),
      stroked: false,
      pickable: true,
    });

    const boundaryLayer = showBoundaries
      ? new PathLayer({
          id: 'boundaries',
          data: boundaries,
          getPath: (d) => d.path,
          getColor: [255, 190, 60, 160],
          getWidth: 1.5,
          widthUnits: 'pixels',
          widthMinPixels: 1,
        })
      : null;

    const isSlotA = (d) => compareSlotA && d.lon === compareSlotA.lon && d.lat === compareSlotA.lat;
    const isSlotB = (d) => compareSlotB && d.lon === compareSlotB.lon && d.lat === compareSlotB.lat;
    const pinsLayer = new ScatterplotLayer({
      id: 'top-sites',
      data: topSitesComputed,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => (isSlotA(d) || isSlotB(d) ? 11 : 7),
      radiusUnits: 'pixels',
      getFillColor: (d) => {
        if (isSlotA(d)) return [255, 255, 255, 255];
        if (isSlotB(d)) return [255, 200, 100, 255];
        if (selected?.coordinates?.[0] === d.lon && selected?.coordinates?.[1] === d.lat) return [255, 255, 255, 255];
        return [255, 210, 0, 230];
      },
      getLineColor: (d) => (isSlotA(d) || isSlotB(d) ? [255, 165, 0, 255] : [20, 20, 20, 200]),
      stroked: true,
      lineWidthMinPixels: 2,
      pickable: true,
      updateTriggers: { getFillColor: [selected, compareSlotA, compareSlotB], getRadius: [compareSlotA, compareSlotB] },
    });

    return [basemap, heatmapDots, boundaryLayer, pinsLayer].filter(Boolean);
  }, [data, boundaries, filteredSites, potentialThreshold, topSitesComputed, showBoundaries, selected, compareSlotA, compareSlotB]);

  const [selLon, selLat] = selected?.coordinates ?? [0, 0];
  const displayLat = resolvedLocation?.lat ?? clickCoordinate?.[1] ?? selLat;
  const displayLon = resolvedLocation?.lon ?? clickCoordinate?.[0] ?? selLon;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <DeckGL
        views={[GLOBE_VIEW]}
        viewState={viewState}
        onViewStateChange={({ viewId, viewState: vs }) =>
          setViewState((prev) => ({ ...prev, [viewId]: vs }))
        }
        layers={layers}
        onClick={handleMapClick}
        getCursor={() => 'crosshair'}
        parameters={{ clearColor: [0.02, 0.02, 0.02, 1], cull: true }}
        style={{ width: '100%', height: '100%' }}
      />

      {/* ── Intro overlay (blurred map + description + Start) ─── */}
      {!started && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(8, 8, 18, 0.5)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            transition: 'opacity 0.4s ease',
            zIndex: 10,
          }}
        >
          <div
            style={{
              ...PANEL,
              maxWidth: 420,
              padding: 28,
              textAlign: 'center',
              boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            }}
          >
            <h1
              style={{
                margin: '0 0 14px',
                color: '#f97316',
                fontWeight: 'bold',
                letterSpacing: 2,
                fontSize: 16,
              }}
            >
              GEOTHERMAL POTENTIAL
            </h1>
            <p
              style={{
                margin: '0 0 24px',
                color: '#b0b0b0',
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              This app helps you explore global geothermal energy potential. Use the map to view heat-flow data and composite scores, compare top sites, and inspect plate boundaries. Click the map or the Top 20 list to zoom to a location and see detailed stats.
            </p>
            <button
              onClick={() => setStarted(true)}
              style={{
                background: '#f97316',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '10px 28px',
                fontSize: 13,
                fontWeight: 'bold',
                letterSpacing: 1,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.2s, transform 0.1s',
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              Start
            </button>
          </div>
        </div>
      )}

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div
        style={{
          ...PANEL,
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '7px 16px',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: '#f97316', fontWeight: 'bold', letterSpacing: 2, fontSize: 11 }}>
          GEOTHERMAL POTENTIAL
        </span>
        <Btn active={showBoundaries} onClick={() => setShowBoundaries((b) => !b)}>
          Plate Boundaries
        </Btn>
        <Btn active={showSidebar} onClick={() => setShowSidebar((s) => !s)}>
          Top 20 Sites
        </Btn>
      </div>

      {/* ── Legend ──────────────────────────────────────────── */}
      <div style={{ ...PANEL, bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '6px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: '#666', fontSize: 10 }}>LOW</span>
        {COLOR_RANGE.map(([r, g, b], i) => (
          <div key={i} style={{ width: 22, height: 10, borderRadius: 2, background: `rgb(${r},${g},${b})` }} />
        ))}
        <span style={{ color: '#666', fontSize: 10 }}>HIGH</span>
        <span style={{ color: '#555', fontSize: 10, marginLeft: 8 }}>
          ● plate boundary &nbsp;◆ top site
        </span>
      </div>

      {/* ── Left sidebar — top sites ─────────────────────────── */}
      {showSidebar && (
        <div
          style={{
            ...PANEL,
            top: 56,
            left: 12,
            bottom: 54,
            width: 230,
            overflowY: 'auto',
            padding: 0,
          }}
        >
          <div
            style={{
              padding: '10px 12px 7px',
              borderBottom: 'none',
              color: '#f97316',
              fontWeight: 'bold',
              fontSize: 10,
              letterSpacing: 2,
              position: 'sticky',
              top: 0,
              background: 'rgba(8,8,18,0.95)',
            }}
          >
            HIGH POTENTIAL THRESHOLD
          </div>
          <div style={{ padding: '8px 12px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ color: '#888', fontSize: 10, marginBottom: 4 }}>Threshold {potentialThreshold.toFixed(2)}</div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={potentialThreshold}
              onChange={(e) => setPotentialThreshold(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#f97316' }}
            />
          </div>

          <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#f97316', fontWeight: 'bold', fontSize: 10, letterSpacing: 2 }}>
            REGION FILTERS
          </div>
          <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ marginBottom: 6 }}>
              <label style={{ color: '#888', fontSize: 10, display: 'block', marginBottom: 2 }}>Continent</label>
              <select
                value={continentFilter}
                onChange={(e) => setContinentFilter(e.target.value)}
                style={{ width: '100%', padding: '4px 6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e0e0e0', fontSize: 11 }}
              >
                {CONTINENT_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ color: '#888', fontSize: 10, display: 'block', marginBottom: 2 }}>Country</label>
              <select
                value={countryFilter}
                onChange={(e) => setCountryFilter(e.target.value)}
                style={{ width: '100%', padding: '4px 6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, color: '#e0e0e0', fontSize: 11 }}
              >
                <option value="All">All</option>
                {uniqueCountries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', color: '#f97316', fontWeight: 'bold', fontSize: 10, letterSpacing: 2 }}>
            COMPARE
          </div>
          <div style={{ padding: '8px 12px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
              <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)} style={{ accentColor: '#f97316' }} />
              <span style={{ fontSize: 11, color: '#ddd' }}>Compare mode</span>
            </label>
            {compareMode && (
              <p style={{ color: '#888', fontSize: 10, margin: '0 0 8px', lineHeight: 1.4 }}>
                Click two points to compare, click again to unpin.
              </p>
            )}
            <div style={{ fontSize: 10, color: '#888', marginBottom: 4 }}>Slot A: {compareSlotA ? `${compareSlotA.resolvedPlace || 'Selected'} (${(compareSlotA.score ?? 0).toFixed(3)})` : 'None selected'}</div>
            <div style={{ fontSize: 10, color: '#888', marginBottom: 8 }}>Slot B: {compareSlotB ? `${compareSlotB.resolvedPlace || 'Selected'} (${(compareSlotB.score ?? 0).toFixed(3)})` : 'None selected'}</div>
            <button
              type="button"
              onClick={() => { setCompareSlotA(null); setCompareSlotB(null); }}
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '4px 10px', color: '#aaa', fontSize: 10, cursor: 'pointer' }}
            >
              Clear compare
            </button>
            {compareSlotA && compareSlotB && (
              <div style={{ marginTop: 12, padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 4 }}>
                <div style={{ color: '#f97316', fontSize: 10, fontWeight: 'bold', marginBottom: 6 }}>Comparison</div>
                <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#888' }}>
                      <th style={{ textAlign: 'left', padding: '2px 4px' }}>Metric</th>
                      <th style={{ textAlign: 'center', padding: '2px 4px' }}>A</th>
                      <th style={{ textAlign: 'center', padding: '2px 4px' }}>B</th>
                    </tr>
                  </thead>
                  <tbody style={{ color: '#ddd' }}>
                    <tr><td style={{ padding: '2px 4px' }}>Score</td><td style={{ textAlign: 'center' }}>{(compareSlotA.score ?? 0).toFixed(4)}</td><td style={{ textAlign: 'center' }}>{(compareSlotB.score ?? 0).toFixed(4)}</td></tr>
                    <tr><td style={{ padding: '2px 4px' }}>Heat flow (mW/m²)</td><td style={{ textAlign: 'center' }}>{compareSlotA.hf != null ? compareSlotA.hf : '—'}</td><td style={{ textAlign: 'center' }}>{compareSlotB.hf != null ? compareSlotB.hf : '—'}</td></tr>
                    <tr><td style={{ padding: '2px 4px' }}>Boundary (km)</td><td style={{ textAlign: 'center' }}>{compareSlotA.bd != null ? compareSlotA.bd.toFixed(1) : '—'}</td><td style={{ textAlign: 'center' }}>{compareSlotB.bd != null ? compareSlotB.bd.toFixed(1) : '—'}</td></tr>
                  </tbody>
                </table>
                <div style={{ marginTop: 6, fontSize: 10, color: '#b0b0b0' }}>
                  Winner: {getWinnerExplanation(compareSlotA, compareSlotB)}
                </div>
              </div>
            )}
          </div>

          <div style={{ padding: '8px 12px 7px', color: '#f97316', fontWeight: 'bold', fontSize: 10, letterSpacing: 2 }}>
            TOP 20 SITES
          </div>
          {topSitesComputed.map((site) => {
            const isActive =
              selected?.coordinates?.[0] === site.lon &&
              selected?.coordinates?.[1] === site.lat;
            return (
              <div
                key={`${site.rank}-${site.lon}-${site.lat}`}
                onClick={() => {
                  setClickCoordinate([site.lon, site.lat]);
                  if (site.resolvedPlace) {
                    setResolvedLocation({ label: site.resolvedPlace, lat: site.lat, lon: site.lon });
                  } else {
                    setLocationResolving(true);
                    resolveLocation(site.lat, site.lon)
                      .then((res) => {
                        setResolvedLocation(res);
                        setLocationResolving(false);
                      })
                      .catch(() => {
                        setResolvedLocation({ country: null, region: null, city: null, label: 'Unable to load map data', lat: site.lat, lon: site.lon });
                        setLocationResolving(false);
                      });
                  }
                  selectPoint({
                    coordinates: [site.lon, site.lat],
                    score: site.score,
                    hf: site.hf,
                    bd: site.bd,
                  });
                  flyTo(site.lon, site.lat);
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 9,
                  background: isActive ? 'rgba(249,115,22,0.13)' : 'transparent',
                  borderLeft: isActive ? '2px solid #f97316' : '2px solid transparent',
                  transition: 'background 0.12s',
                }}
              >
                <span style={{ color: '#f97316', width: 20, textAlign: 'right', flexShrink: 0, fontSize: 11 }}>
                  #{site.rank}
                </span>
                <div>
                  <div style={{ color: '#ddd', fontSize: 11 }}>
                    {site.lat.toFixed(2)}°, {site.lon.toFixed(2)}°
                  </div>
                  <div style={{ color: '#666', fontSize: 10, marginTop: 1 }}>
                    {site.score.toFixed(3)} score · {site.hf} mW/m²
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Debug overlay: last click lat/lon (4 decimals) and resolved label ─── */}
      {clickCoordinate != null && resolvedLocation && (
        <div
          style={{
            ...PANEL,
            bottom: 24,
            left: 12,
            padding: '8px 12px',
            fontSize: 11,
            maxWidth: 320,
          }}
        >
          <div style={{ color: '#888', marginBottom: 4 }}>Last click (WGS84)</div>
          <div style={{ color: '#ddd', fontFamily: 'monospace' }}>
            lat {resolvedLocation.lat.toFixed(4)}°, lon {resolvedLocation.lon.toFixed(4)}°
          </div>
          <div style={{ color: '#f97316', marginTop: 4 }}>{resolvedLocation.label}</div>
        </div>
      )}

      {/* ── Right panel — location and optional site detail ──────────────── */}
      {clickCoordinate != null && (
        <div style={{ ...PANEL, top: 56, right: 12, width: 268, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: 10, letterSpacing: 2 }}>
              SITE ANALYSIS
            </span>
            <span
              onClick={() => {
                setSelected(null);
                setClickCoordinate(null);
                setResolvedLocation(null);
                setLocationResolving(false);
              }}
              style={{ cursor: 'pointer', color: '#555', fontSize: 14, lineHeight: 1 }}
            >
              ✕
            </span>
          </div>

          <StatRow label="Coordinates" value={`${displayLat.toFixed(4)}°, ${displayLon.toFixed(4)}°`} />
          <StatRow label="Location" value={locationResolving ? 'Loading…' : (resolvedLocation?.label ?? '—')} />
          <StatRow label="Composite score" value={selected?.score?.toFixed(4) ?? '—'} accent />
          <StatRow label="Heat flow" value={selected?.hf != null ? `${selected.hf} mW/m²` : '—'} />
          <StatRow label="Plate boundary" value={selected?.bd != null ? `${selected.bd} km` : '—'} />

          {/* Score bar — only when a heat/site point is selected */}
          {selected != null && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(selected.score ?? 0) * 100}%`,
                    borderRadius: 2,
                    background: 'linear-gradient(90deg, #1d9abf, #f97316)',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      <InfoModal />
    </div>
  );
}

function StatRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ color: accent ? '#f97316' : '#ddd', fontWeight: accent ? 'bold' : 'normal' }}>
        {value}
      </span>
    </div>
  );
}

function Btn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.06)',
        color: active ? '#f97316' : '#666',
        border: `1px solid ${active ? 'rgba(249,115,22,0.5)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 4,
        padding: '3px 10px',
        cursor: 'pointer',
        fontSize: 11,
        fontFamily: 'inherit',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </button>
  );
}
