import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { BitmapLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { _GlobeView as GlobeView, FlyToInterpolator } from '@deck.gl/core';

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

function formatPlaceFromNominatim(result) {
  if (!result) return null;
  const addr = result.address || {};
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.county;
  const region = addr.state || addr.region || addr.country;
  if (city && region) return `${city}, ${region}`;
  return region || city || result.display_name || null;
}

export default function GeothermalGlobe() {
  const [started, setStarted] = useState(false);
  const [data, setData] = useState([]);
  const [boundaries, setBoundaries] = useState([]);
  const [topSites, setTopSites] = useState([]);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [selected, setSelected] = useState(null);
  const [locationPlace, setLocationPlace] = useState(null);
  const [locationPlaceLoading, setLocationPlaceLoading] = useState(false);
  const [viewState, setViewState] = useState({ globe: INITIAL_VIEW_STATE });

  useEffect(() => {
    Promise.all([
      fetch('/geothermal_data.json').then((r) => r.json()),
      fetch('/plate_boundaries.json').then((r) => r.json()),
      fetch('/top_sites.json').then((r) => r.json()),
    ]).then(([geo, bounds, sites]) => {
      setData(geo);
      setBoundaries(bounds);
      setTopSites(sites);
    });
  }, []);

  // Reverse geocode selected location for city/region (Nominatim, no key required)
  useEffect(() => {
    if (!selected?.coordinates?.length) {
      setLocationPlace(null);
      setLocationPlaceLoading(false);
      return;
    }
    const [lon, lat] = selected.coordinates;
    setLocationPlace(null);
    setLocationPlaceLoading(true);
    const controller = new AbortController();
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;
    fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Runtime-Terror-Geothermal-App',
      },
      signal: controller.signal,
      referrerPolicy: 'no-referrer',
    })
      .then((r) => r.json())
      .then((data) => {
        setLocationPlace(formatPlaceFromNominatim(data));
        setLocationPlaceLoading(false);
      })
      .catch(() => {
        setLocationPlace(null);
        setLocationPlaceLoading(false);
      });
    return () => controller.abort();
  }, [selected?.coordinates?.[0], selected?.coordinates?.[1]]);

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

  // Find nearest data point to a clicked map coordinate (or use clicked heat dot)
  const handleMapClick = useCallback(
    ({ coordinate, object, layer }) => {
      if (object && layer?.id === 'top-sites') return;
      if (object && layer?.id === 'heatmap-dots') {
        selectPoint(object);
        return;
      }
      if (!coordinate || !data.length) return;

      const extent = data.reduce(
        (acc, d) => {
          const s = d.score ?? 0;
          return { min: Math.min(acc.min, s), max: Math.max(acc.max, s) };
        },
        { min: Infinity, max: -Infinity }
      );
      const range = extent.max - extent.min || 1;
      const norm = (s) => (Math.max(extent.min, Math.min(extent.max, s ?? 0)) - extent.min) / range;
      const highOnly = data.filter((pt) => norm(pt.score) >= 0.5);

      const [clickLon, clickLat] = coordinate;
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
    [data, selectPoint]
  );

  const layers = useMemo(() => {
    const basemap = new TileLayer({
      id: 'basemap',
      data: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: (props) => {
        const {
          tile: { bbox },
        } = props;
        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [bbox.west, bbox.south, bbox.east, bbox.north],
        });
      },
    });

    // Normalize score to 0–1 over current data range for color scale
    const scoreExtent =
      data.length > 0
        ? data.reduce(
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

    // Only show yellow, orange, or red dots (normalized score >= 0.5)
    const HIGH_POTENTIAL_THRESHOLD = 0.5;
    const highPotentialData = data.filter((d) => normalizeScore(d.score) >= HIGH_POTENTIAL_THRESHOLD);

    // Globe-compatible replacement for HeatmapLayer: scatter points colored by score
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

    const pinsLayer = new ScatterplotLayer({
      id: 'top-sites',
      data: topSites,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 7,
      radiusUnits: 'pixels',
      getFillColor: (d) =>
        selected?.coordinates[0] === d.lon && selected?.coordinates[1] === d.lat
          ? [255, 255, 255, 255]
          : [255, 210, 0, 230],
      getLineColor: [20, 20, 20, 200],
      stroked: true,
      lineWidthMinPixels: 1,
      pickable: true,
      updateTriggers: { getFillColor: [selected] },
      onClick: ({ object }) => {
        selectPoint({
          coordinates: [object.lon, object.lat],
          score: object.score,
          hf: object.hf,
          bd: object.bd,
        });
        flyTo(object.lon, object.lat);
      },
    });

    return [basemap, heatmapDots, boundaryLayer, pinsLayer].filter(Boolean);
  }, [data, boundaries, topSites, showBoundaries, selected, selectPoint, flyTo]);

  const [selLon, selLat] = selected?.coordinates ?? [0, 0];

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
            TOP 20 SITES
          </div>
          {topSites.map((site) => {
            const isActive =
              selected?.coordinates[0] === site.lon &&
              selected?.coordinates[1] === site.lat;
            return (
              <div
                key={site.rank}
                onClick={() => {
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

      {/* ── Right panel — selected site detail ──────────────── */}
      {selected && (
        <div style={{ ...PANEL, top: 56, right: 12, width: 268, padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: 10, letterSpacing: 2 }}>
              SITE ANALYSIS
            </span>
            <span
              onClick={() => setSelected(null)}
              style={{ cursor: 'pointer', color: '#555', fontSize: 14, lineHeight: 1 }}
            >
              ✕
            </span>
          </div>

          <StatRow label="Coordinates" value={`${selLat.toFixed(3)}°, ${selLon.toFixed(3)}°`} />
          <StatRow label="City / Region" value={locationPlaceLoading ? 'Loading…' : (locationPlace ?? '—')} />
          <StatRow label="Composite score" value={selected.score?.toFixed(4) ?? '—'} accent />
          <StatRow label="Heat flow" value={selected.hf != null ? `${selected.hf} mW/m²` : '—'} />
          <StatRow label="Plate boundary" value={selected.bd != null ? `${selected.bd} km` : '—'} />

          {/* Score bar */}
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
        </div>
      )}
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
