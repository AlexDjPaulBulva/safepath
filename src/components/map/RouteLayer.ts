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

// Výchozí hodnoty vrstev trasy
const DEFAULT_GLOW_OPACITY = 0.65;
const DEFAULT_GLOW_BLUR = 3;
const DEFAULT_CORE_OPACITY = 1.0;
const DEFAULT_CORE_COLOR = '#059669';

// Globální správa animační smyčky dýchání (pulse) pro výpočty trasy trvající > 1000 ms
let breathingAnimationId: number | null = null;
let breathingStartTime = 0;
let activeBreathingMap: maplibregl.Map | null = null;

/**
 * Zastaví animační smyčku dýchání trasy a vrátí paint vlastnosti vrstev do výchozího čistého stavu.
 */
export function stopRouteBreathing(map?: maplibregl.Map | null) {
  if (breathingAnimationId !== null) {
    cancelAnimationFrame(breathingAnimationId);
    breathingAnimationId = null;
  }
  const targetMap = map || activeBreathingMap;
  activeBreathingMap = null;

  if (targetMap && targetMap.isStyleLoaded()) {
    try {
      if (targetMap.getLayer('safe-route-glow')) {
        targetMap.setPaintProperty('safe-route-glow', 'line-opacity', DEFAULT_GLOW_OPACITY);
        targetMap.setPaintProperty('safe-route-glow', 'line-blur', DEFAULT_GLOW_BLUR);
      }
      if (targetMap.getLayer('safe-route-core')) {
        targetMap.setPaintProperty('safe-route-core', 'line-opacity', DEFAULT_CORE_OPACITY);
        targetMap.setPaintProperty('safe-route-core', 'line-color', DEFAULT_CORE_COLOR);
      }
    } catch {
      // Ignorovat, pokud se styl právě mění
    }
  }
}

/**
 * Spustí jemnou plynulou animaci „dýchání“ na vrstvách trasy (bezpečný sinusový průběh),
 * pokud výpočet nové trasy trvá déle než 1000 ms.
 */
export function startRouteBreathing(map: maplibregl.Map) {
  if (!map) return;
  // Pokud již animace běží na této mapě, není třeba zakládat duplicitní smyčku
  if (breathingAnimationId !== null && activeBreathingMap === map) {
    return;
  }

  stopRouteBreathing(map);

  activeBreathingMap = map;
  breathingStartTime = performance.now();

  const step = () => {
    if (!activeBreathingMap || activeBreathingMap !== map) {
      stopRouteBreathing(map);
      return;
    }

    if (!map.isStyleLoaded() || !map.getLayer('safe-route-glow') || !map.getLayer('safe-route-core')) {
      // Pokud se styl zrovna načítá, počkáme na další snímek
      breathingAnimationId = requestAnimationFrame(step);
      return;
    }

    try {
      const elapsed = performance.now() - breathingStartTime;
      // Plynulá sinusová oscilace (perioda ~1.5s, hodnota 0.0 až 1.0)
      const wave = (Math.sin((elapsed / 1000) * Math.PI * 1.33) + 1) / 2;

      // Glow jemně pulzuje: opacity 0.35 až 0.75, blur 2.0 až 5.0
      const currentGlowOpacity = 0.35 + wave * 0.40;
      const currentGlowBlur = 2.0 + wave * 3.0;

      // Jádro trasy jemně pulzuje: opacity 0.75 až 1.00
      const currentCoreOpacity = 0.75 + wave * 0.25;

      map.setPaintProperty('safe-route-glow', 'line-opacity', currentGlowOpacity);
      map.setPaintProperty('safe-route-glow', 'line-blur', currentGlowBlur);
      map.setPaintProperty('safe-route-core', 'line-opacity', currentCoreOpacity);

      breathingAnimationId = requestAnimationFrame(step);
    } catch {
      stopRouteBreathing(map);
    }
  };

  breathingAnimationId = requestAnimationFrame(step);
}

export function isRouteBreathing(): boolean {
  return breathingAnimationId !== null;
}

export function renderRoute(map: maplibregl.Map, coords: [number, number][] | any[], isPending: boolean = false) {
  if (!map) return;

  const validCoords = normalizeRouteCoords(coords);

  // Pokud souřadnice chybí nebo je méně než 2 body, vyčistíme zdroj trasy, aby nezůstávala viset stará trasa
  if (!validCoords || validCoords.length < 2) {
    stopRouteBreathing(map);
    try {
      const source = map.getSource('safe-route-source') as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: []
        });
      }
    } catch (e) {
      console.warn('Chyba při promazávání safe-route-source:', e);
    }
    return;
  }

  // Pokud styl mapy ještě není připraven, počkáme na jeho načtení
  if (!map.isStyleLoaded()) {
    const onStyleReady = () => {
      renderRoute(map, validCoords, isPending);
    };
    map.once('style.load', onStyleReady);
    map.once('load', onStyleReady);
    return;
  }

  // Pokud nová trasa dorazila a není pending, zastavíme animaci dýchání a vrátíme výchozí čistý styl
  if (!isPending) {
    stopRouteBreathing(map);
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

    const glowOpacity = isPending ? 0.35 : DEFAULT_GLOW_OPACITY;
    const coreOpacity = isPending ? 0.65 : DEFAULT_CORE_OPACITY;
    const coreColor = DEFAULT_CORE_COLOR;

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
          'line-opacity': glowOpacity,
          'line-blur': DEFAULT_GLOW_BLUR,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 6, 13, 10, 16, 18]
        }
      });
    } else if (!isRouteBreathing()) {
      map.setLayoutProperty('safe-route-glow', 'visibility', 'visible');
      map.setPaintProperty('safe-route-glow', 'line-opacity', glowOpacity);
      map.setPaintProperty('safe-route-glow', 'line-blur', DEFAULT_GLOW_BLUR);
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
          'line-color': coreColor,
          'line-opacity': coreOpacity,
          'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 13, 5, 16, 9]
        }
      });
    } else if (!isRouteBreathing()) {
      map.setLayoutProperty('safe-route-core', 'visibility', 'visible');
      map.setPaintProperty('safe-route-core', 'line-color', coreColor);
      map.setPaintProperty('safe-route-core', 'line-opacity', coreOpacity);
    }
  } catch (err) {
    console.error('Chyba při renderování trasy v RouteLayer:', err);
  }
}

export const updateRouteLayer = renderRoute;
