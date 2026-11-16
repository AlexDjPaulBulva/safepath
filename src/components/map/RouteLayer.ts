import * as maplibregl from 'maplibre-gl';

export function renderRoute(map: maplibregl.Map, coords: [number, number][]) {
  if (!map) return;
  if (!map.getStyle() && !map.isStyleLoaded()) {
    map.once('style.load', () => renderRoute(map, coords));
    return;
  }

  const geojsonData: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: coords && coords.length >= 2 ? coords : []
      }
    }]
  };

  const source = map.getSource('safe-route-source') as maplibregl.GeoJSONSource | undefined;
  if (!source) {
    map.addSource('safe-route-source', { type: 'geojson', data: geojsonData });
  } else {
    source.setData(geojsonData);
  }

  if (!map.getLayer('safe-route-glow')) {
    map.addLayer({
      id: 'safe-route-glow',
      type: 'line',
      source: 'safe-route-source',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#10b981',
        'line-opacity': 0.45,
        'line-blur': 2,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 13, 9, 16, 16]
      }
    });
  }

  if (!map.getLayer('safe-route-core')) {
    map.addLayer({
      id: 'safe-route-core',
      type: 'line',
      source: 'safe-route-source',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#059669',
        'line-opacity': 1.0,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 13, 4.5, 16, 8]
      }
    });
  }

  try {
    if (map.getLayer('safe-route-glow')) map.moveLayer('safe-route-glow');
    if (map.getLayer('safe-route-core')) map.moveLayer('safe-route-core');
  } catch (e) {}
}

export const updateRouteLayer = renderRoute;
