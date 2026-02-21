import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { BitmapLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { FlyToInterpolator } from '@deck.gl/core';

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 1.5,
  minZoom: 1,
  maxZoom: 15,
  pitch: 0,
  bearing: 0,
};

const COLOR_RANGE = [
  [1, 152, 189],
  [73, 227, 206],
  [216, 254, 181],
  [254, 237, 177],
  [254, 173, 84],
  [209, 55, 78],
];

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

export default function GeothermalGlobe() {
  const [data, setData] = useState([]);
  const [boundaries, setBoundaries] = useState([]);
  const [topSites, setTopSites] = useState([]);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [selected, setSelected] = useState(null);
  const [aiReport, setAiReport] = useState('');
  const [loadingAI, setLoadingAI] = useState(false);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

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

  const flyTo = useCallback((lon, lat) => {
    setViewState((prev) => ({
      ...prev,
      longitude: lon,
      latitude: lat,
      zoom: 6,
      transitionDuration: 1500,
      transitionInterpolator: new FlyToInterpolator(),
    }));
  }, []);

  const selectPoint = useCallback((point) => {
    setSelected(point);
    setAiReport('');
  }, []);

  // Find nearest data point to a clicked map coordinate
  const handleMapClick = useCallback(
    ({ coordinate, object, layer }) => {
      // Top-site pin clicks are handled by their layer's onClick — skip here
      if (object && layer?.id === 'top-sites') return;
      if (!coordinate || !data.length) return;

      const [clickLon, clickLat] = coordinate;
      let nearest = null;
      let minDist = Infinity;
      for (const pt of data) {
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

  const generateReport = useCallback(async () => {
    if (!selected) return;
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (!apiKey) {
      setAiReport('Add VITE_ANTHROPIC_API_KEY to .env to enable AI reports.');
      return;
    }

    setLoadingAI(true);
    setAiReport('');
    const [lon, lat] = selected.coordinates;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 220,
          messages: [
            {
              role: 'user',
              content: `You are a geothermal energy expert. In exactly 3 concise sentences, give a sharp economic investment assessment for this potential plant site. Be specific and quantitative.

Location: ${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E
Heat flow: ${selected.hf} mW/m²  (global avg ~65 mW/m²; commercial threshold ~80 mW/m²)
Distance to nearest plate boundary: ${selected.bd} km
Composite viability score: ${selected.score}/1.00`,
            },
          ],
        }),
      });
      const json = await res.json();
      setAiReport(json.content?.[0]?.text ?? 'No response received.');
    } catch {
      setAiReport('Error contacting Claude API. Check console for details.');
    } finally {
      setLoadingAI(false);
    }
  }, [selected]);

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

    const heatmap = new HeatmapLayer({
      id: 'heatmap',
      data,
      getPosition: (d) => d.coordinates,
      getWeight: (d) => d.score,
      radiusPixels: 60,
      intensity: 1,
      threshold: 0.03,
      colorRange: COLOR_RANGE,
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

    return [basemap, heatmap, boundaryLayer, pinsLayer].filter(Boolean);
  }, [data, boundaries, topSites, showBoundaries, selected, selectPoint, flyTo]);

  const [selLon, selLat] = selected?.coordinates ?? [0, 0];

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState: vs }) => setViewState(vs)}
        controller={true}
        layers={layers}
        onClick={handleMapClick}
        getCursor={() => 'crosshair'}
        parameters={{ clearColor: [0.02, 0.02, 0.02, 1] }}
        style={{ width: '100%', height: '100%' }}
      />

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

          <StatRow label="Location" value={`${selLat.toFixed(3)}°, ${selLon.toFixed(3)}°`} />
          <StatRow label="Composite score" value={selected.score?.toFixed(4) ?? '—'} accent />
          <StatRow label="Heat flow" value={selected.hf != null ? `${selected.hf} mW/m²` : '—'} />
          <StatRow label="Plate boundary" value={selected.bd != null ? `${selected.bd} km` : '—'} />

          {/* Score bar */}
          <div style={{ marginTop: 10, marginBottom: 12 }}>
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

          <button
            onClick={generateReport}
            disabled={loadingAI}
            style={{
              width: '100%',
              padding: '8px 0',
              background: loadingAI ? 'rgba(249,115,22,0.3)' : '#f97316',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loadingAI ? 'wait' : 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
              fontWeight: 'bold',
              letterSpacing: 1,
              transition: 'background 0.15s',
            }}
          >
            {loadingAI ? 'GENERATING…' : '✦ AI SITE REPORT'}
          </button>

          {aiReport && (
            <div
              style={{
                marginTop: 10,
                padding: '9px 10px',
                background: 'rgba(255,255,255,0.04)',
                borderRadius: 4,
                fontSize: 11,
                lineHeight: 1.65,
                color: '#bbb',
                borderLeft: '2px solid #f97316',
              }}
            >
              {aiReport}
            </div>
          )}
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
