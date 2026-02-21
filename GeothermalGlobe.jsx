import React, { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { _GlobeView } from '@deck.gl/core';
import { BitmapLayer, ScatterplotLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import geothermalHotspots from './geothermal_hotspots.json';

const INITIAL_VIEW_STATE = {
  longitude: -97,
  latitude: 38,
  zoom: 0.6
};

const COLOR_RANGE = [
  [10, 20, 80], // dark blue
  [0, 230, 255], // cyan
  [0, 255, 120], // green
  [255, 235, 0], // yellow
  [255, 20, 160] // neon pink
];

const EARTH_BASEMAP_TEXTURE_URL = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';

function getInterpolatedColor(score, alpha = 255) {
  const clamped = Math.max(0, Math.min(1, score ?? 0));
  const scaled = clamped * (COLOR_RANGE.length - 1);
  const index = Math.floor(scaled);
  const nextIndex = Math.min(index + 1, COLOR_RANGE.length - 1);
  const t = scaled - index;
  const [r1, g1, b1] = COLOR_RANGE[index];
  const [r2, g2, b2] = COLOR_RANGE[nextIndex];

  return [
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
    alpha
  ];
}

export default function GeothermalGlobe() {
  const layers = useMemo(() => {
    // External Earth texture basemap (real imagery mapped to full globe bounds).
    const basemapLayer = new BitmapLayer({
      id: 'external-earth-texture-layer',
      image: EARTH_BASEMAP_TEXTURE_URL,
      bounds: [-180, -90, 180, 90]
    });

    // Heatmap layer plots geothermal hotspots by coordinates and weighted score.
    const geothermalHeatmapLayer = new HeatmapLayer({
      id: 'geothermal-heatmap-layer',
      data: geothermalHotspots,
      getPosition: (d) => d.coordinates,
      getWeight: (d) => d.score,
      radiusPixels: 40,
      intensity: 1.5,
      threshold: 0,
      colorRange: COLOR_RANGE
    });

    // GlobeView currently does not render HeatmapLayer reliably, so draw a heat-style fallback.
    const geothermalGlowLayer = new ScatterplotLayer({
      id: 'geothermal-glow-layer',
      data: geothermalHotspots,
      getPosition: (d) => d.coordinates,
      getRadius: (d) => 180000 + d.score * 420000,
      radiusUnits: 'meters',
      radiusMinPixels: 12,
      radiusMaxPixels: 80,
      stroked: false,
      filled: true,
      getFillColor: (d) => getInterpolatedColor(d.score, 110),
      parameters: { depthTest: false }
    });

    // Add bright cores to improve hotspot readability against the black globe.
    const geothermalCoreLayer = new ScatterplotLayer({
      id: 'geothermal-core-layer',
      data: geothermalHotspots,
      getPosition: (d) => d.coordinates,
      getRadius: (d) => 45000 + d.score * 100000,
      radiusUnits: 'meters',
      radiusMinPixels: 4,
      radiusMaxPixels: 18,
      stroked: false,
      filled: true,
      getFillColor: (d) => getInterpolatedColor(d.score, 235),
      parameters: { depthTest: false }
    });

    return [
      basemapLayer,
      geothermalHeatmapLayer,
      geothermalGlowLayer,
      geothermalCoreLayer
    ];
  }, []);

  return (
    <DeckGL
      views={new _GlobeView()}
      initialViewState={INITIAL_VIEW_STATE}
      controller={true}
      layers={layers}
      parameters={{ clearColor: [0.03, 0.05, 0.11, 1], cull: true }}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
