import * as maplibregl from 'maplibre-gl';

export const PRAGUE_CENTER_LNG_LAT: [number, number] = [14.4378, 50.0755];

export const MAP_BACKGROUND_COLOR = '#f8f4f0';

// Barevné silniční dlaždice Esri World Street Map se stabilním světlým podkladem (zabraňuje černému pozadí)
export const VIBRANT_STREET_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'street-tiles': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS'
    }
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: {
        'background-color': MAP_BACKGROUND_COLOR
      }
    },
    {
      id: 'street-base-layer',
      type: 'raster',
      source: 'street-tiles',
      minzoom: 0,
      maxzoom: 24,
      paint: {
        'raster-fade-duration': 0
      }
    }
  ]
};

/**
 * Zaručí, že mapa má vždy načtený a zachovaný podkladový styl, background vrstvu
 * a rastrové dlaždice bez rizika zčernání pozadí při rychlých akcích či ztrátě stylu.
 */
export function ensureBaseStyleAndLayers(map: maplibregl.Map): void {
  if (!map || !map.getStyle()) return;

  try {
    // 1. Zajištění background vrstvy s příjemnou světlou barvou (nikdy černá)
    if (!map.getLayer('background')) {
      const firstLayerId = map.getStyle()?.layers?.[0]?.id;
      map.addLayer(
        {
          id: 'background',
          type: 'background',
          paint: {
            'background-color': MAP_BACKGROUND_COLOR
          }
        },
        firstLayerId
      );
    }

    // 2. Zajištění zdroje dlaždic
    if (!map.getSource('street-tiles')) {
      map.addSource('street-tiles', VIBRANT_STREET_STYLE.sources['street-tiles']);
    }

    // 3. Zajištění základní podkladové vrstvy dlaždic (maxzoom 24 pro plynulý overzoom bez zmizení dlaždic)
    if (!map.getLayer('street-base-layer')) {
      const beforeId = map.getLayer('safe-route-glow') ? 'safe-route-glow' : undefined;
      map.addLayer(
        {
          id: 'street-base-layer',
          type: 'raster',
          source: 'street-tiles',
          minzoom: 0,
          maxzoom: 24,
          paint: {
            'raster-fade-duration': 0
          }
        },
        beforeId
      );
    }
  } catch (err) {
    console.warn('MapCore: Bezpečnostní kontrola stylu mapy zachytila chybu:', err);
  }
}
