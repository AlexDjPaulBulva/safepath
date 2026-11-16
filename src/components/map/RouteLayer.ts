import * as maplibregl from 'maplibre-gl';

export function renderRoute(map: maplibregl.Map, coords: [number, number][]) {
  console.log("ROUTE LAYER - PŘIJATÉ SOUŘADNICE:", coords);
  if (!map) return;
  
  // Pokud styl ještě není načtený, počkáme na událost style.load
  if (!map.isStyleLoaded()) {
    map.once('style.load', () => renderRoute(map, coords));
    return;
  }

  const validCoords = coords && Array.isArray(coords) && coords.length >= 2 ? coords : [];

  const geojsonData: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: validCoords
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
        'line-opacity': 0.6,
        'line-blur': 3,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 13, 10, 16, 18]
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
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 13, 5, 16, 9]
      }
    });
  }

  try {
    map.moveLayer('safe-route-glow');
    map.moveLayer('safe-route-core');
  } catch (e) {}
}

export const updateRouteLayer = renderRoute;
