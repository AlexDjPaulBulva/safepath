import * as maplibregl from 'maplibre-gl';

/**
 * Normalizuje a ověří pole souřadnic pro MapLibre GeoJSON.
 * MapLibre vyžaduje formát [lng, lat].
 * Pokud souřadnice přijdou jako [lat, lng] (v ČR lat cca 48-51, lng 12-19), automaticky je přehodí.
 */
export function normalizeRouteCoords(raw: any[]): [number, number][] {
  if (!raw || !Array.isArray(raw)) return [];

  return raw
    .map((p: any) => {
      if (!p) return null;
      let lng: number;
      let lat: number;

      if (Array.isArray(p)) {
        if (p.length < 2) return null;
        const v0 = Number(p[0]);
        const v1 = Number(p[1]);
        if (!Number.isFinite(v0) || !Number.isFinite(v1)) return null;

        // Pokud je první hodnota > 30 (zeměpisná šířka v ČR/Evropě je ~50°), jedná se o [lat, lng]
        if (v0 > 30) {
          lat = v0;
          lng = v1;
        } else {
          lng = v0;
          lat = v1;
        }
      } else if (typeof p === 'object') {
        const pLat = Number(p.lat ?? p.latitude);
        const pLng = Number(p.lng ?? p.longitude ?? p.lon);
        if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) return null;
        lat = pLat;
        lng = pLng;
      } else {
        return null;
      }

      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
      return [lng, lat] as [number, number];
    })
    .filter((pt): pt is [number, number] => pt !== null);
}

export function renderRoute(map: maplibregl.Map, coords: [number, number][] | any[]) {
  if (!map) return;

  const validCoords = normalizeRouteCoords(coords);
  console.log("ROUTE LAYER - PŘIJATÉ A VALIDOVANÉ SOUŘADNICE:", validCoords.length);

  // Pokud souřadnice chybí nebo je méně než 2 body, nemažeme vrstvu, ale ani nic nekreslíme
  if (!validCoords || validCoords.length < 2) {
    return;
  }

  // Pokud styl mapy ještě není připraven, počkáme na jeho načtení
  if (!map.getStyle()) {
    const onStyleReady = () => {
      renderRoute(map, validCoords);
    };
    map.once('style.load', onStyleReady);
    map.once('load', onStyleReady);
    return;
  }

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

  try {
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
        layout: { 
          'line-join': 'round', 
          'line-cap': 'round',
          'visibility': 'visible'
        },
        paint: {
          'line-color': '#10b981',
          'line-opacity': 0.65,
          'line-blur': 3,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 13, 10, 16, 18]
        }
      });
    } else {
      map.setLayoutProperty('safe-route-glow', 'visibility', 'visible');
    }

    if (!map.getLayer('safe-route-core')) {
      map.addLayer({
        id: 'safe-route-core',
        type: 'line',
        source: 'safe-route-source',
        layout: { 
          'line-join': 'round', 
          'line-cap': 'round',
          'visibility': 'visible'
        },
        paint: {
          'line-color': '#059669',
          'line-opacity': 1.0,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 13, 5, 16, 9]
        }
      });
    } else {
      map.setLayoutProperty('safe-route-core', 'visibility', 'visible');
    }

    map.moveLayer('safe-route-glow');
    map.moveLayer('safe-route-core');
  } catch (err) {
    console.error('Chyba při renderování trasy v RouteLayer:', err);
  }
}

export const updateRouteLayer = renderRoute;
