import React, { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { BitmapLayer } from '@deck.gl/layers';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { TileLayer } from '@deck.gl/geo-layers';
import geothermalHotspots from './geothermal_hotspots.json';

const INITIAL_VIEW_STATE = {
  longitude: 0,
  latitude: 20,
  zoom: 1.5,
  minZoom: 1,
  maxZoom: 15,
  pitch: 0,
  bearing: 0
};

const COLOR_RANGE = [
  [1, 152, 189],
  [73, 227, 206],
  [216, 254, 181],
  [254, 237, 177],
  [254, 173, 84],
  [209, 55, 78]
];

export default function GeothermalGlobe() {
  const layers = useMemo(() => {
    const basemapLayer = new TileLayer({
      id: 'dark-basemap-layer',
      data: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      minZoom: 0,
      maxZoom: 19,
      tileSize: 256,
      renderSubLayers: (props) => {
        const {
          tile: { bbox }
        } = props;
        return new BitmapLayer(props, {
          data: null,
          image: props.data,
          bounds: [bbox.west, bbox.south, bbox.east, bbox.north]
        });
      }
    });

    // Heatmap layer styling aligned with the deck.gl heatmap example look.
    const geothermalHeatmapLayer = new HeatmapLayer({
      id: 'geothermal-heatmap-layer',
      data: geothermalHotspots,
      getPosition: (d) => d.coordinates,
      getWeight: (d) => d.score,
      radiusPixels: 60,
      intensity: 1,
      threshold: 0.03,
      colorRange: COLOR_RANGE
    });

    return [basemapLayer, geothermalHeatmapLayer];
  }, []);

  return (
    <DeckGL
      initialViewState={INITIAL_VIEW_STATE}
      controller={true}
      layers={layers}
      parameters={{ clearColor: [0.02, 0.02, 0.02, 1] }}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
