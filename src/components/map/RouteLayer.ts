import * as maplibregl from 'maplibre-gl';

export function updateRouteLayer(map: maplibregl.Map, coords: [number, number][]) {
  if (!map || !coords || coords.length < 2) return;

  const renderRoute = () => {
    try {
      const source = map.getSource('safe-route-source') as maplibregl.GeoJSONSource | undefined;
      const geojsonData = {
        type: 'FeatureCollection' as const,
        features: [{
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: coords }
        }]
      };

      if (source) {
        source.setData(geojsonData);
      } else {
        map.addSource('safe-route-source', {
          type: 'geojson',
          data: geojsonData
        });
      }

      // Neonová záře (Glow)
      if (!map.getLayer('safe-route-glow')) {
        map.addLayer({
          id: 'safe-route-glow',
          type: 'line',
          source: 'safe-route-source',
          paint: { 'line-color': '#10b981', 'line-width': 10, 'line-opacity': 0.5 }
        });
      }

      // Syté zelené jádro (Core)
      if (!map.getLayer('safe-route-core')) {
        map.addLayer({
          id: 'safe-route-core',
          type: 'line',
          source: 'safe-route-source',
          paint: { 'line-color': '#059669', 'line-width': 4, 'line-opacity': 1.0 }
        });
      }

      // Vynést vrstvy nad podkladové rastrové dlaždice
      try {
        if (map.getLayer('safe-route-glow')) map.moveLayer('safe-route-glow');
        if (map.getLayer('safe-route-core')) map.moveLayer('safe-route-core');
      } catch (e) {
        // ignorovat
      }
    } catch (e) {
      console.warn('Chyba při aktualizaci vrstvy trasy:', e);
    }
  };

  if (!map.isStyleLoaded()) {
    map.once('style.load', renderRoute);
    return;
  }

  renderRoute();
}
