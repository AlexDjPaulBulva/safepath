import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import polyline from '@mapbox/polyline';

import staticSafetyData from '../data/pragueStaticSafety.json';
import { useAppStore } from '../store/useAppStore';
import { subscribeToChildSession, ChildSessionData } from '../lib/liveSync';
import { RouteResult, getPointAlongRoute } from '../lib/routing';
import { SafetyFeature, SafeHavenFeature } from '../lib/opendata';
import { OSMSurveillanceFeature } from '../lib/osm-surveillance-harvester';
import { SafetyReveal } from '../types/safety';
import { useVoiceNavigation } from '../hooks/useVoiceNavigation';
import { useCompassHeading } from '../hooks/useCompassHeading';
import { AudioNavToggle } from './AudioNavToggle';
import { SafePassModal } from './SafePassModal';
import { MapErrorBoundary, MapErrorFallback } from './MapErrorBoundary';

export { MapErrorBoundary, MapErrorFallback };

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
}

export interface MapEngineProps {
  routeData?: any;
  routeCoordinates?: any;
  routeA?: RouteResult | null;
  routeB?: RouteResult | null;
  routeC?: RouteResult | null;
  fastestRoute?: RouteResult | null;
  showFastestRoute?: boolean;
  selectedRoute?: 'A' | 'B' | 'C';
  startPoint?: { lat: number; lng: number; name?: string } | null;
  endPoint?: { lat: number; lng: number; name?: string } | null;
  userLocation?: UserLocation | null;
  recenterTrigger?: { coords: [number, number]; timestamp: number } | null;
  setStartPoint?: (point: { lat: number; lng: number; name?: string } | null) => void;
  setEndPoint?: (point: { lat: number; lng: number; name?: string } | null) => void;
  onToast?: (message: string) => void;
  safetyNodes?: SafetyFeature[];
  osmCameras?: OSMSurveillanceFeature[];
  safeHavens?: SafeHavenFeature[];
  layers?: {
    cameras?: boolean;
    lights?: boolean;
    havens?: boolean;
    incidents?: boolean;
    zones?: boolean;
    localDataOnly?: boolean;
  };
  timeOfDay?: number;
  center?: [number, number] | null;
  onMapClick?: (lat: number, lng: number, name?: string) => void;
  isSimulating?: boolean;
  simulationProgress?: number;
  activeProfiles?: string[];
  scannedLocation?: { lat: number; lng: number; name: string } | null;
  onCloseScanner?: () => void;
  onMapDoubleClick?: (lat: number, lng: number) => void;
  onMapRightClick?: (lat: number, lng: number) => void;
  safeStops?: { lat: number; lng: number; name: string }[];
  childDeviation?: { lat: number; lng: number } | null;
  reveal?: SafetyReveal | null;
  proximityPoint?: [number, number] | null;
  onRouteProximityChange?: (point: [number, number] | null) => void;
  onSelectRoute?: (route: 'A' | 'B' | 'C') => void;
  childLiveLocation?: {
    lat: number;
    lng: number;
    inCorridor?: boolean;
    lastSeen?: number;
    isOffline?: boolean;
    timestamp?: number;
    battery?: number;
  } | null;
  isSosActive?: boolean;
}

const PRAGUE_CENTER_LNG_LAT: [number, number] = [14.4378, 50.0755];

// Oficiální barevné silniční dlaždice Esri World Street Map (zelené parky, modrá voda, žluté/bílé ulice)
const VIBRANT_STREET_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    'street-tiles': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS'
    }
  },
  layers: [
    {
      id: 'street-base-layer',
      type: 'raster',
      source: 'street-tiles',
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

const getRouteCoordinates = (route?: RouteResult | null): [number, number][] => {
  if (!route) return [];
  let geom: any = route.geometry;
  if (typeof geom === 'string' && geom.trim().length > 0) {
    try {
      const decoded = polyline.decode(geom.trim());
      return decoded.map(([lat, lng]: [number, number]) => [lng, lat]);
    } catch {
      return [];
    }
  }
  if (geom && Array.isArray(geom) && geom.length >= 2) {
    return geom;
  }
  if (route.segments && Array.isArray(route.segments) && route.segments.length > 0) {
    const coords: [number, number][] = [];
    route.segments.forEach((seg) => {
      if (seg.coordinates && Array.isArray(seg.coordinates)) {
        seg.coordinates.forEach((c) => coords.push(c));
      }
    });
    if (coords.length >= 2) return coords;
  }
  return [];
};

const normalizeToLngLat = (coords: [number, number][]): [number, number][] => {
  return coords.map((coord) => {
    // Pokud je první hodnota > 30 (typicky pražská latitude ~50), otoč na [lng, lat]
    return coord[0] > 30 ? [coord[1], coord[0]] : [coord[0], coord[1]];
  });
};

export function Map(props: MapEngineProps) {
  console.log('DEBUG SAFE PATH DATA:', props.routeCoordinates);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isCourseUp, setIsCourseUp] = useState(false);
  const [pointsCount, setPointsCount] = useState<number>(0);
  const [renderStatus, setRenderStatus] = useState<string>('');
  const pendingRouteRef = useRef<[number, number][] | null>(null);

  // References pro zamezení stale closures při kliknutí do mapy
  const onMapClickRef = useRef(props.onMapClick);
  const startPointRef = useRef(props.startPoint);
  const endPointRef = useRef(props.endPoint);
  const setStartPointRef = useRef(props.setStartPoint);
  const setEndPointRef = useRef(props.setEndPoint);
  const onToastRef = useRef(props.onToast);

  useEffect(() => { onMapClickRef.current = props.onMapClick; }, [props.onMapClick]);
  useEffect(() => { startPointRef.current = props.startPoint; }, [props.startPoint]);
  useEffect(() => { endPointRef.current = props.endPoint; }, [props.endPoint]);
  useEffect(() => { setStartPointRef.current = props.setStartPoint; }, [props.setStartPoint]);
  useEffect(() => { setEndPointRef.current = props.setEndPoint; }, [props.setEndPoint]);
  useEffect(() => { onToastRef.current = props.onToast; }, [props.onToast]);

  // Markers refs pro správu životního cyklu v MapLibre GL
  const userPuckMarkerRef = useRef<maplibregl.Marker | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const childLiveMarkerRef = useRef<maplibregl.Marker | null>(null);
  const avatarMarkerRef = useRef<maplibregl.Marker | null>(null);
  const havenMarkersRef = useRef<maplibregl.Marker[]>([]);
  const crossingMarkersRef = useRef<maplibregl.Marker[]>([]);

  const activeMode = useAppStore((state) => state.activeMode);
  const storePairedCode = useAppStore((state) => state.pairedChildCode);
  const setStoreChildLocation = useAppStore((state) => state.setChildLocation);
  const setChildSession = useAppStore((state) => state.setChildSession);

  const pairedCode = storePairedCode || (typeof window !== 'undefined' ? localStorage.getItem('safepath_paired_child_code') : null);
  const isChildMode = props.activeProfiles?.includes('child') || activeMode === 'child';
  const isParentMode = !isChildMode && (activeMode === 'parent' || props.activeProfiles?.includes('parent') || false);

  const [childData, setChildData] = useState<ChildSessionData | null>(null);

  // Firebase Realtime Database živé předplatné
  useEffect(() => {
    if (!pairedCode || !isParentMode) {
      setChildData(null);
      return;
    }

    const unsubscribe = subscribeToChildSession(pairedCode, (data) => {
      if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
        setChildData(data);
        setChildSession(data);
        setStoreChildLocation({ lat: data.lat, lng: data.lng });
      } else {
        setChildData(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [pairedCode, isParentMode, setChildSession, setStoreChildLocation]);

  const isDeviated = childData !== null && childData.inCorridor === false;
  const isLowBattery = Boolean(
    childData?.low_battery_alert ||
    (childData?.battery !== undefined && childData.battery <= 15 && childData.charging !== true)
  );

  const [showSafePassModal, setShowSafePassModal] = useState<boolean>(false);
  const [isHeartbeatLost, setIsHeartbeatLost] = useState<boolean>(false);
  const [minutesSinceLastSeen, setMinutesSinceLastSeen] = useState<number>(0);

  const childDataRef = useRef(childData);
  childDataRef.current = childData;
  const childLiveLocRef = useRef(props.childLiveLocation);
  childLiveLocRef.current = props.childLiveLocation;

  // Heartbeat Watchdog
  useEffect(() => {
    if (!pairedCode || !isParentMode) {
      setIsHeartbeatLost(false);
      setMinutesSinceLastSeen(0);
      return;
    }

    const checkHeartbeat = () => {
      const activeChild = childDataRef.current || childLiveLocRef.current;
      const lastSeen = activeChild?.lastSeen || activeChild?.timestamp;
      if (lastSeen && typeof lastSeen === 'number') {
        const diffMs = Date.now() - lastSeen;
        if (diffMs > 60000) {
          setIsHeartbeatLost(true);
          const mins = Math.max(1, Math.floor(diffMs / 60000));
          setMinutesSinceLastSeen(mins);
        } else {
          setIsHeartbeatLost(false);
          setMinutesSinceLastSeen(0);
        }
      } else {
        setIsHeartbeatLost(false);
      }
    };

    checkHeartbeat();
    const interval = setInterval(checkHeartbeat, 10000);
    return () => clearInterval(interval);
  }, [pairedCode, isParentMode]);

  const storeSafeHaven = useAppStore((state) => state.activeSafeHaven);
  const isSos = Boolean(props.isSosActive || storeSafeHaven);

  const effectiveChildLocation = (childData || props.childLiveLocation)
    ? {
        ...(childData || props.childLiveLocation)!,
        isOffline: isHeartbeatLost
      }
    : null;

  // Aktivní trasa
  const activeRoute = props.selectedRoute === 'A'
    ? props.routeA
    : props.selectedRoute === 'B'
      ? props.routeB
      : props.selectedRoute === 'C'
        ? props.routeC
        : props.routeA;

  // Efektivní aktuální poloha pro navigaci
  const currentNavPosition = useMemo(() => {
    if (props.isSimulating && activeRoute?.segments) {
      const pt = getPointAlongRoute(activeRoute.segments, props.simulationProgress ?? 0);
      if (pt) return { lat: pt[0], lng: pt[1], accuracy: 5 };
    }
    if (childData && typeof childData.lat === 'number' && typeof childData.lng === 'number') {
      return { lat: childData.lat, lng: childData.lng, accuracy: 5 };
    }
    if (props.childLiveLocation && typeof props.childLiveLocation.lat === 'number') {
      return { lat: props.childLiveLocation.lat, lng: props.childLiveLocation.lng, accuracy: 5 };
    }
    if (props.userLocation) {
      return {
        lat: props.userLocation.lat,
        lng: props.userLocation.lng,
        accuracy: props.userLocation.accuracy,
        heading: props.userLocation.heading,
        speed: props.userLocation.speed
      };
    }
    return null;
  }, [props.isSimulating, props.simulationProgress, activeRoute, childData, props.childLiveLocation, props.userLocation]);

  // Hlasová a haptická turn-by-turn navigace
  const {
    isVoiceEnabled,
    toggleVoice,
    lastSpokenText
  } = useVoiceNavigation({
    currentLocation: currentNavPosition,
    activeRoute: activeRoute ?? null,
    snappedCrossings: activeRoute?.snappedCrossings,
    staticCrossings: staticSafetyData?.crossings as any[]
  });

  const [visibleSpokenText, setVisibleSpokenText] = useState<string | null>(null);

  useEffect(() => {
    if (lastSpokenText) {
      setVisibleSpokenText(lastSpokenText);
      const timer = setTimeout(() => {
        setVisibleSpokenText(null);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [lastSpokenText]);

  // Vyhlazení azimutu pro rotaci navigačního puku a mapy
  const { heading: effectiveHeading } = useCompassHeading({
    gpsHeading: currentNavPosition?.heading ?? props.userLocation?.heading,
    speed: currentNavPosition?.speed ?? props.userLocation?.speed,
    accuracy: currentNavPosition?.accuracy ?? props.userLocation?.accuracy,
    minWalkingSpeedMps: 0.5
  });

  // Pomocná funkce pro 3D budovy (pokud styl obsahuje vektorové podklady)
  const add3DBuildingsLayer = (map: maplibregl.Map) => {
    if (!map.isStyleLoaded() || map.getLayer('3d-buildings')) return;

    const style = map.getStyle();
    if (!style) return;

    const sources = style.sources || {};
    const vectorSourceId = Object.keys(sources).find(
      (key) => (sources[key] as any).type === 'vector'
    );
    if (!vectorSourceId) return;

    const layers = style.layers || [];
    let labelLayerId: string | undefined;
    for (const layer of layers) {
      if (layer.type === 'symbol' && (layer.layout as any)?.['text-field']) {
        labelLayerId = layer.id;
        break;
      }
    }

    try {
      map.addLayer(
        {
          id: '3d-buildings',
          source: vectorSourceId,
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': [
              'interpolate',
              ['linear'],
              ['get', 'render_height'],
              0, '#1e293b',
              30, '#0f172a',
              60, '#090d16'
            ],
            'fill-extrusion-height': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14, 0,
              14.05, ['coalesce', ['get', 'render_height'], ['*', ['get', 'levels'], 3.2], 8]
            ],
            'fill-extrusion-base': [
              'interpolate',
              ['linear'],
              ['zoom'],
              14, 0,
              14.05, ['coalesce', ['get', 'render_min_height'], ['*', ['get', 'min_level'], 3.2], 0]
            ],
            'fill-extrusion-opacity': 0.75
          }
        },
        labelLayerId
      );
    } catch (err) {
      console.warn('SafePath: Nepodařilo se přidat vrstvu 3D budov:', err);
    }
  };

  // Pomocná funkce pro zaručené vykreslení vrstvy nejrychlejší alternativní trasy
  const drawFastestRoute = (map: maplibregl.Map) => {
    if (!map.isStyleLoaded()) return;

    const rawFastestCoords = getRouteCoordinates(props.fastestRoute);
    const normalizedFastestCoords = (props.showFastestRoute && rawFastestCoords.length >= 2)
      ? normalizeToLngLat(rawFastestCoords)
      : [];

    const fastestData: GeoJSON.Feature<GeoJSON.LineString> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: normalizedFastestCoords
      }
    };

    const existingFastestSource = map.getSource('fastest-route') as maplibregl.GeoJSONSource | undefined;
    if (!existingFastestSource) {
      map.addSource('fastest-route', {
        type: 'geojson',
        data: fastestData
      });
    } else {
      existingFastestSource.setData(fastestData);
    }

    if (!map.getLayer('fastest-route-corridor')) {
      map.addLayer({
        id: 'fastest-route-corridor',
        type: 'line',
        source: 'fastest-route',
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: {
          'line-color': '#94a3b8',
          'line-width': 4,
          'line-dasharray': [2, 2],
          'line-opacity': 0.75
        }
      });
    }
  };

  // 1. Inicializace MapLibre GL mapy se spolehlivým životním cyklem Reactu
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let initialCenter = PRAGUE_CENTER_LNG_LAT;
    const initialRouteCoords = normalizeToLngLat(getRouteCoordinates(activeRoute));
    if (props.center) {
      initialCenter = props.center[0] > 30 ? [props.center[1], props.center[0]] : [props.center[0], props.center[1]];
    } else if (initialRouteCoords.length > 0) {
      initialCenter = initialRouteCoords[0];
    } else if (props.userLocation) {
      initialCenter = [props.userLocation.lng, props.userLocation.lat];
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: VIBRANT_STREET_STYLE,
      center: initialCenter,
      zoom: 14,
      maxZoom: 19,
      pitch: 0,
      bearing: 0,
      pitchWithRotate: true,
      touchZoomRotate: true,
      maxPitch: 35,
      failIfMajorPerformanceCaveat: false,
      ...({ antialias: true } as any)
    });

    // Navigační kompas v pravém horním rohu
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      map.resize();
      drawFastestRoute(map);
      setIsMapLoaded(true);
    });

    map.on('style.load', () => {
      drawFastestRoute(map);
    });

    map.on('click', (e: maplibregl.MapMouseEvent) => {
      const lat = e.lngLat.lat;
      const lng = e.lngLat.lng;

      if (onMapClickRef.current) {
        onMapClickRef.current(lat, lng);
      } else if (setStartPointRef.current || setEndPointRef.current) {
        if (startPointRef.current && !endPointRef.current) {
          setEndPointRef.current?.({ lat, lng });
          onToastRef.current?.('Cíl nastaven. Počítám bezpečnou trasu...');
        } else {
          setStartPointRef.current?.({ lat, lng });
          setEndPointRef.current?.(null);
          onToastRef.current?.('Start nastaven. Nyní klepněte na cíl.');
        }
      }
    });

    map.on('dblclick', (e: maplibregl.MapMouseEvent) => {
      props.onMapDoubleClick?.(e.lngLat.lat, e.lngLat.lng);
    });

    mapRef.current = map;

    const handleResize = () => {
      map.resize();
    };
    window.addEventListener('resize', handleResize);

    // Záložní přepočet rozměrů pro pomalejší WebView (Instagram, Facebook in-app prohlížeče)
    const resizeTimer1 = setTimeout(() => {
      if (mapRef.current) mapRef.current.resize();
    }, 150);

    const resizeTimer2 = setTimeout(() => {
      if (mapRef.current) mapRef.current.resize();
    }, 300);

    const resizeTimer3 = setTimeout(() => {
      if (mapRef.current) mapRef.current.resize();
    }, 800);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(resizeTimer1);
      clearTimeout(resizeTimer2);
      clearTimeout(resizeTimer3);
      setIsMapLoaded(false);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  const routeData = props.routeData ?? props.routeCoordinates ?? activeRoute;

  const validCoords: [number, number][] = useMemo(() => {
    if (!routeData) return [];

    let rawPoints = 
      routeData?.coordinates || 
      routeData?.geometry?.coordinates || 
      routeData?.geometry || 
      routeData?.path || 
      routeData?.points || 
      routeData?.latlngs || 
      (Array.isArray(routeData) ? routeData : null);

    // Pokud přišla zakódovaná polyline jako řetězec, dekóduj ji
    if (typeof rawPoints === 'string') {
      try {
        rawPoints = polyline.decode(rawPoints).map(([lat, lng]) => [lng, lat]);
      } catch (e) {
        console.error('Chyba dekódování polyline:', e);
      }
    }

    return (Array.isArray(rawPoints) ? rawPoints : [])
      .map((p: any) => {
        if (Array.isArray(p)) {
          // Normalizace pro ČR: [lng ~14, lat ~50]
          return Number(p[0]) > 30 ? [Number(p[1]), Number(p[0])] : [Number(p[0]), Number(p[1])];
        }
        if (p && typeof p === 'object') {
          const lat = p.lat ?? p.latitude;
          const lng = p.lng ?? p.longitude ?? p.lon;
          return [Number(lng), Number(lat)];
        }
        return null;
      })
      .filter((p): p is [number, number] => p !== null && !isNaN(p[0]) && !isNaN(p[1]));
  }, [routeData]);

  const hasBothPoints = Boolean(props.startPoint && props.endPoint);
  const hasCalculatedRoute = Boolean(
    routeData && (
      (Array.isArray(routeData) && routeData.length >= 2) ||
      (routeData.geometry && (Array.isArray(routeData.geometry) ? routeData.geometry.length >= 2 : typeof routeData.geometry === 'string')) ||
      (routeData.coordinates && routeData.coordinates.length >= 2) ||
      (activeRoute && ((activeRoute.geometry && activeRoute.geometry.length >= 2) || (activeRoute.segments && activeRoute.segments.length > 0)))
    )
  );

  const showSelectionBanner = !hasBothPoints && !hasCalculatedRoute && Boolean(
    (props.startPoint && !props.endPoint) || (!props.startPoint && props.endPoint)
  );

  // 2. Reaktivní parser a bezpečné vykreslení zelené trasy ve WebGL GeoJSON vrstvě (safe-route-line-source)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !routeData) {
      setPointsCount(0);
      setRenderStatus('');
      if (map?.isStyleLoaded()) {
        const src = map.getSource('safe-route-line-source') as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData({ type: 'FeatureCollection', features: [] });
        }
      }
      return;
    }

    setPointsCount(validCoords.length);

    if (validCoords.length < 2) {
      if (map.isStyleLoaded()) {
        const src = map.getSource('safe-route-line-source') as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData({ type: 'FeatureCollection', features: [] });
        }
      }
      setRenderStatus('');
      return;
    }

    const drawRouteNow = () => {
      try {
        const geojsonFeature: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates: validCoords
              }
            }
          ]
        };

        // 1. ZDROJ DAT (GeoJSON Source)
        const existingSource = map.getSource('safe-route-line-source') as maplibregl.GeoJSONSource;
        if (existingSource) {
          existingSource.setData(geojsonFeature);
        } else {
          map.addSource('safe-route-line-source', {
            type: 'geojson',
            data: geojsonFeature
          });
        }

        // 2. SPODNÍ ZÁŘE (AURA) - kontroluj a přidej nezávisle na zdroji!
        if (!map.getLayer('safe-route-aura')) {
          map.addLayer({
            id: 'safe-route-aura',
            type: 'line',
            source: 'safe-route-line-source',
            layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'visible' },
            paint: {
              'line-color': '#10b981',
              'line-width': 16,
              'line-opacity': 0.6,
              'line-blur': 3
            }
          });
        }

        // 3. HLAVNÍ ZELENÝ KORIDOR - kontroluj a přidej nezávisle na zdroji!
        if (!map.getLayer('safe-route-core')) {
          map.addLayer({
            id: 'safe-route-core',
            type: 'line',
            source: 'safe-route-line-source',
            layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'visible' },
            paint: {
              'line-color': '#059669',
              'line-width': 7,
              'line-opacity': 1.0
            }
          });
        }

        // 4. VYTÁHNI VRSTVY NA ÚPLNÝ VRCHOL NAD DLAŽDICE ULIC
        try {
          map.moveLayer('safe-route-aura');
          map.moveLayer('safe-route-core');
        } catch (e) {
          console.warn('moveLayer warning:', e);
        }

        const bounds = validCoords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(validCoords[0], validCoords[0]));
        map.fitBounds(bounds, { padding: 80, duration: 600 });

        map.triggerRepaint();

        setRenderStatus(`VYKRESLENO (${validCoords.length} b.) [${validCoords[0][0].toFixed(2)}, ${validCoords[0][1].toFixed(2)}]`);

      } catch (err: any) {
        console.error('Chyba MapLibre při vykreslování:', err);
        setRenderStatus(`CHYBA: ${err?.message || 'Neznámá'}`);
      }
    };

    drawRouteNow();
  }, [routeData, validCoords, isMapLoaded]);

  // Podpora pro volitelnou linku nejrychlejší alternativní trasy
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    drawFastestRoute(map);
  }, [props.showFastestRoute, props.fastestRoute, isMapLoaded]);

  // 3. Plynulé vycentrování mapy / přizpůsobení geometrii
  const lastRecenterRef = useRef<number>(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    if (props.recenterTrigger && props.recenterTrigger.timestamp > lastRecenterRef.current) {
      lastRecenterRef.current = props.recenterTrigger.timestamp;
      const rc = props.recenterTrigger.coords;
      const normalizedRc: [number, number] = rc[0] > 30 ? [rc[1], rc[0]] : [rc[0], rc[1]];
      map.flyTo({
        center: normalizedRc,
        zoom: 17,
        duration: 1000
      });
      return;
    }

    const routeCoords = normalizeToLngLat(getRouteCoordinates(activeRoute));
    if (routeCoords.length >= 2) {
      if (isChildMode) {
        const start = routeCoords[0];
        map.flyTo({
          center: start,
          zoom: 17,
          pitch: 0,
          duration: 1000
        });
      } else {
        const bounds = new maplibregl.LngLatBounds();
        routeCoords.forEach((coord) => bounds.extend(coord));
        map.fitBounds(bounds, { padding: 60, duration: 1200 });
      }
    } else if (props.center) {
      const c = props.center;
      const normalizedCenter: [number, number] = c[0] > 30 ? [c[1], c[0]] : [c[0], c[1]];
      map.flyTo({
        center: normalizedCenter,
        zoom: 15,
        duration: 1000
      });
    }
  }, [props.recenterTrigger, activeRoute, isMapLoaded, isChildMode]);

  // 4. Navigační puk polohy uživatele / dítěte s rotací šipky
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const loc = currentNavPosition || props.userLocation;
    if (!loc) {
      if (userPuckMarkerRef.current) {
        userPuckMarkerRef.current.remove();
        userPuckMarkerRef.current = null;
      }
      return;
    }

    if (!userPuckMarkerRef.current) {
      const puckEl = document.createElement('div');
      puckEl.className = 'safepath-nav-puck-container';
      puckEl.style.width = '44px';
      puckEl.style.height = '44px';
      puckEl.style.position = 'relative';
      puckEl.style.display = 'flex';
      puckEl.style.alignItems = 'center';
      puckEl.style.justifyContent = 'center';
      puckEl.style.pointerEvents = 'none';

      puckEl.innerHTML = `
        <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: rgba(37, 99, 235, 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background-color: #2563eb; border: 2.5px solid #ffffff; box-shadow: 0 0 12px rgba(37, 99, 235, 0.8), 0 2px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="12" height="12" style="display: block; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.4));">
            <path d="M12 3 L20 20 L12 16 L4 20 Z" fill="#ffffff" />
          </svg>
        </div>
      `;

      userPuckMarkerRef.current = new maplibregl.Marker({
        element: puckEl,
        rotationAlignment: 'map'
      })
        .setLngLat([loc.lng, loc.lat])
        .addTo(map);
    } else {
      userPuckMarkerRef.current.setLngLat([loc.lng, loc.lat]);
    }

    // Rotace směrové šipky puku
    if (typeof effectiveHeading === 'number') {
      userPuckMarkerRef.current.setRotation(effectiveHeading);
    }

    // 5. Course-Up režim: plynulé natáčení mapy podle chůze dítěte
    if (isCourseUp && typeof effectiveHeading === 'number') {
      map.easeTo({
        center: [loc.lng, loc.lat],
        bearing: effectiveHeading,
        pitch: 30,
        duration: 800
      });
    }
  }, [currentNavPosition, props.userLocation, effectiveHeading, isCourseUp]);

  // 6. Start a Cíl Markery
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Start
    if (props.startPoint && props.startPoint.name !== 'Moje aktuální poloha') {
      if (!startMarkerRef.current) {
        const startEl = document.createElement('div');
        startEl.innerHTML = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="background: #064e3b; border: 2px solid #ffffff; color: #ffffff; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 2px 8px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.6); margin-bottom: 2px; white-space: nowrap;">
              Start
            </div>
            <div style="width: 16px; height: 16px; border-radius: 50%; background: #10b981; border: 3px solid #ffffff; box-shadow: 0 0 12px rgba(16, 185, 129, 0.9), 0 3px 6px rgba(0,0,0,0.5);"></div>
          </div>
        `;
        startMarkerRef.current = new maplibregl.Marker({ element: startEl, anchor: 'bottom' })
          .setLngLat([props.startPoint.lng, props.startPoint.lat])
          .addTo(map);
      } else {
        startMarkerRef.current.setLngLat([props.startPoint.lng, props.startPoint.lat]);
      }
    } else if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }

    // Cíl
    if (props.endPoint) {
      if (!endMarkerRef.current) {
        const endEl = document.createElement('div');
        endEl.innerHTML = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            <div style="background: #312e81; border: 2px solid #ffffff; color: #ffffff; font-size: 11px; font-weight: 800; text-transform: uppercase; padding: 2px 8px; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.6); margin-bottom: 2px; white-space: nowrap;">
              Cíl
            </div>
            <div style="width: 16px; height: 16px; border-radius: 50%; background: #6366f1; border: 3px solid #ffffff; box-shadow: 0 0 12px rgba(99, 102, 241, 0.9), 0 3px 6px rgba(0,0,0,0.5);"></div>
          </div>
        `;
        endMarkerRef.current = new maplibregl.Marker({ element: endEl, anchor: 'bottom' })
          .setLngLat([props.endPoint.lng, props.endPoint.lat])
          .addTo(map);
      } else {
        endMarkerRef.current.setLngLat([props.endPoint.lng, props.endPoint.lat]);
      }
    } else if (endMarkerRef.current) {
      endMarkerRef.current.remove();
      endMarkerRef.current = null;
    }
  }, [props.startPoint, props.endPoint]);

  // 7. Safe Havens (Záchranné stanice, lékárny, policie)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    havenMarkersRef.current.forEach((m) => m.remove());
    havenMarkersRef.current = [];

    const shouldShowHavens = isSos || props.layers?.havens || props.proximityPoint;
    if (!shouldShowHavens || !props.safeHavens || props.safeHavens.length === 0) return;

    let routeLine: ReturnType<typeof turf.lineString> | null = null;
    const safeRouteCoords = normalizeToLngLat(getRouteCoordinates(activeRoute));
    if (!isSos && safeRouteCoords.length >= 2) {
      routeLine = turf.lineString(safeRouteCoords);
    }

    const filteredHavens = props.safeHavens.filter((h) => {
      if (isSos) return true;
      if (routeLine) {
        const pt = turf.point([h.lng, h.lat]);
        return turf.pointToLineDistance(pt, routeLine, { units: 'meters' }) <= 150;
      }
      return false;
    });

    filteredHavens.forEach((haven) => {
      const havenEl = document.createElement('div');
      const is247 = Boolean(haven.is247);
      const icon = haven.type === 'police' ? '👮' : (haven.type === 'pharmacy' ? '💊' : (haven.type === 'fire_station' ? '🚒' : (haven.type === 'fuel' ? '⛽' : '🛡️')));

      havenEl.className = 'safepath-haven-marker';
      havenEl.innerHTML = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          ${is247 ? `
            <div style="position: absolute; top: -20px; background: #0f172a; border: 1px solid #eab308; color: #facc15; font-size: 9px; font-weight: bold; padding: 1px 4px; border-radius: 4px; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">
              24/7
            </div>
          ` : ''}
          <div style="width: 28px; height: 28px; border-radius: 8px; background: ${is247 ? '#ca8a04' : '#2563eb'}; border: 2px solid #ffffff; box-shadow: 0 0 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; font-size: 14px;">
            ${icon}
          </div>
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
        <div style="font-family: sans-serif; color: #0f172a; padding: 4px; font-size: 12px; min-width: 140px;">
          <div style="font-weight: bold; font-size: 13px; margin-bottom: 4px; border-bottom: 1px solid #cbd5e1; padding-bottom: 2px; color: #0f172a;">${haven.name}</div>
          <div style="color: #475569; margin-bottom: 2px;">Typ: ${haven.type}</div>
          ${haven.phone ? `<div style="color: #0369a1; font-weight: 600;">Tel: ${haven.phone}</div>` : ''}
          ${is247 ? `<div style="color: #b45309; font-weight: bold; margin-top: 4px;">⚡ 24/7 Pohotovost</div>` : ''}
        </div>
      `);

      const marker = new maplibregl.Marker({ element: havenEl })
        .setLngLat([haven.lng, haven.lat])
        .setPopup(popup)
        .addTo(map);

      havenMarkersRef.current.push(marker);
    });
  }, [isSos, props.layers?.havens, props.safeHavens, activeRoute, props.proximityPoint]);

  // 8. Chráněné přechody a semafory na trase (Checkpoints)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    crossingMarkersRef.current.forEach((m) => m.remove());
    crossingMarkersRef.current = [];

    if (!activeRoute?.snappedCrossings || activeRoute.snappedCrossings.length === 0) return;

    activeRoute.snappedCrossings.forEach((crossing) => {
      const isSignal = crossing.hasSignals || crossing.crossingType === 'traffic_signals';
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="width: 24px; height: 24px; border-radius: 50%; background: #0f172a; border: 2px solid ${isSignal ? '#10b981' : '#34d399'}; box-shadow: 0 0 8px rgba(16,185,129,0.7); display: flex; align-items: center; justify-content: center; font-size: 11px; cursor: pointer;">
          ${isSignal ? '🚦' : '🚸'}
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 12 }).setHTML(`
        <div style="font-family: sans-serif; color: #0f172a; padding: 4px; font-size: 11px; min-width: 140px;">
          <div style="font-weight: bold; color: #059669; margin-bottom: 2px;">
            ${isSignal ? '🚦 Řízený semafor' : '🚸 Přechod pro chodce'}
          </div>
          <div style="color: #334155;">${crossing.streetName || 'Bezpečný uzel pro přecházení'}</div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([crossing.lng, crossing.lat])
        .setPopup(popup)
        .addTo(map);

      crossingMarkersRef.current.push(marker);
    });
  }, [activeRoute?.snappedCrossings]);

  // 9. Živý marker dítěte pro rodičovský režim
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!effectiveChildLocation) {
      if (childLiveMarkerRef.current) {
        childLiveMarkerRef.current.remove();
        childLiveMarkerRef.current = null;
      }
      return;
    }

    const isOffline = Boolean(effectiveChildLocation.isOffline);

    if (!childLiveMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'safepath-child-live-marker';
      el.innerHTML = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background: ${isOffline ? 'rgba(148, 163, 184, 0.4)' : 'rgba(163, 230, 53, 0.5)'}; animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: absolute; top: -22px; background: #0f172a; border: 1px solid ${isOffline ? '#64748b' : '#84cc16'}; color: ${isOffline ? '#cbd5e1' : '#bef264'}; font-size: 10px; font-weight: 900; padding: 1px 6px; border-radius: 12px; text-transform: uppercase; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.5);">
            ${isOffline ? 'Offline' : 'Dítě'}
          </div>
          <div style="width: 30px; height: 30px; border-radius: 50%; background: ${isOffline ? '#475569' : 'linear-gradient(135deg, #84cc16, #eab308)'}; border: 2.5px solid #ffffff; box-shadow: 0 0 15px ${isOffline ? 'rgba(100,116,139,0.8)' : 'rgba(132,204,22,0.8)'}; display: flex; align-items: center; justify-content: center; font-size: 15px;">
            ${isOffline ? '⚠️' : '👶'}
          </div>
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 18 }).setHTML(`
        <div style="font-family: sans-serif; color: #0f172a; padding: 4px; font-size: 11px;">
          <div style="font-weight: bold; font-size: 12px; margin-bottom: 2px; color: ${isOffline ? '#64748b' : '#4d7c0f'};">
            ${isOffline ? '⚠️ Dítě (Offline / Ztráta signálu)' : '👶 Dítě (Živý GPS signál)'}
          </div>
          <div>Souřadnice: ${effectiveChildLocation.lat.toFixed(5)}, ${effectiveChildLocation.lng.toFixed(5)}</div>
          <div>Baterie: <b>${effectiveChildLocation.battery ?? 85} %</b></div>
          <div style="font-weight: bold; margin-top: 4px; color: ${effectiveChildLocation.inCorridor !== false ? '#15803d' : '#b91c1c'};">
            ${effectiveChildLocation.inCorridor !== false ? '✓ V bezpečnostním koridoru' : '🚨 Odchýleno z trasy!'}
          </div>
        </div>
      `);

      childLiveMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([effectiveChildLocation.lng, effectiveChildLocation.lat])
        .setPopup(popup)
        .addTo(map);
    } else {
      childLiveMarkerRef.current.setLngLat([effectiveChildLocation.lng, effectiveChildLocation.lat]);
    }
  }, [effectiveChildLocation]);

  // 10. Avatar simulace průchodu trasou
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!props.isSimulating || !activeRoute?.segments || activeRoute.segments.length === 0) {
      if (avatarMarkerRef.current) {
        avatarMarkerRef.current.remove();
        avatarMarkerRef.current = null;
      }
      return;
    }

    let simLat: number;
    let simLng: number;
    if (props.childDeviation) {
      simLat = props.childDeviation.lat;
      simLng = props.childDeviation.lng;
    } else {
      const pt = getPointAlongRoute(activeRoute.segments, props.simulationProgress ?? 0);
      if (!pt) return;
      [simLat, simLng] = pt;
    }

    if (!avatarMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background: rgba(52, 211, 153, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="width: 28px; height: 28px; border-radius: 50%; background: #0f172a; border: 2px solid #10b981; box-shadow: 0 0 12px rgba(16,185,129,0.8); display: flex; align-items: center; justify-content: center; font-size: 15px;">
            ${isParentMode ? '👧' : '🚶'}
          </div>
        </div>
      `;
      avatarMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([simLng, simLat])
        .addTo(map);
    } else {
      avatarMarkerRef.current.setLngLat([simLng, simLat]);
    }
  }, [props.isSimulating, activeRoute?.segments, props.simulationProgress, props.childDeviation, isParentMode]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-slate-950">
      {/* Plátno MapLibre GL WebGL mapy pevně roztažené přes celou plochu */}
      <div id="map" ref={mapContainerRef} className="w-full h-full absolute inset-0" />

      {/* Dočasný ladicí štítek přímo do levého horního rohu mapy */}
      <div className="absolute top-16 left-4 z-50 bg-black/90 text-emerald-400 text-xs px-2.5 py-1.5 rounded font-mono shadow-lg border border-emerald-500/40 pointer-events-none">
        {mapRef.current?.getLayer('safe-route-core') ? '🟢 KORIDOR AKTIVNÍ' : '🔴 VRSTVA CHYBÍ'} ({validCoords.length} b.)
      </div>

      {/* Tlačítko Course-Up: "Sledovat směr chůze" (3D rotace mapy s pohledem chodce) */}
      <button
        type="button"
        onClick={() => {
          setIsCourseUp((prev) => {
            const next = !prev;
            if (next && mapRef.current) {
              mapRef.current.easeTo({
                bearing: effectiveHeading ?? mapRef.current.getBearing(),
                pitch: 30,
                duration: 800
              });
            } else if (mapRef.current) {
              mapRef.current.easeTo({
                bearing: 0,
                pitch: 0,
                duration: 600
              });
            }
            return next;
          });
        }}
        className={`absolute top-3.5 right-14 z-[400] px-3 py-1.5 rounded-xl text-xs font-bold shadow-xl backdrop-blur-md border transition-all flex items-center gap-1.5 active:scale-95 ${
          isCourseUp
            ? 'bg-emerald-600/95 text-white border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.5)]'
            : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:text-white hover:bg-slate-800'
        }`}
        title={isCourseUp ? 'Vypnout sledování směru (srovnat na sever)' : 'Sledovat směr chůze (3D perspektiva)'}
      >
        <span className={isCourseUp ? 'animate-pulse text-sm' : 'text-sm'}>🧭</span>
        <span className="hidden sm:inline font-semibold">
          {isCourseUp ? 'Sledování směru chůze' : 'Sledovat směr chůze'}
        </span>
      </button>

      {/* Stavový pruh při výběru bodů trasy (kompletně skryt, pokud existuje start i cíl NEBO vypočtená trasa) */}
      {showSelectionBanner && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[2600] bg-slate-900/95 border-2 border-emerald-400 text-white px-5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-bounce pointer-events-auto"
          role="status"
        >
          <span className="text-emerald-400 text-base">🟢</span>
          <span className="text-xs font-bold text-slate-100">
            {props.startPoint && !props.endPoint
              ? 'Start nastaven. Nyní klepněte na cíl.'
              : 'Cíl nastaven. Zvolte start klepnutím do mapy.'}
          </span>
        </div>
      )}

      {/* Vizuální notifikace naposledy proneseného hlasového pokynu */}
      {isVoiceEnabled && visibleSpokenText && (
        <div
          className="fixed top-16 md:top-20 left-1/2 -translate-x-1/2 z-[2500] max-w-sm w-[90%] bg-slate-900/95 border-2 border-emerald-400 text-white px-4 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-3 animate-fadeIn pointer-events-auto"
          role="status"
        >
          <span className="text-xl animate-pulse flex-shrink-0">🔊</span>
          <span className="text-xs font-bold text-slate-100 flex-1 leading-snug">{visibleSpokenText}</span>
          <button
            type="button"
            onClick={() => setVisibleSpokenText(null)}
            className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded"
            aria-label="Zavřít"
          >
            ✕
          </button>
        </div>
      )}

      {/* Plovoucí přepínač hlasových pokynů na mapě */}
      <div
        className="fixed md:absolute right-4 md:right-6 z-[1000] transition-all duration-300 pointer-events-auto"
        style={{ bottom: isChildMode ? '8.5rem' : 'calc(var(--bottom-sheet-height, 9.5rem) + 8.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <AudioNavToggle
          isVoiceEnabled={isVoiceEnabled}
          onToggle={toggleVoice}
        />
      </div>

      {/* Skupina varovných a krizových bannerů na obrazovce rodiče */}
      {isParentMode && (
        <div
          className="fixed z-[3100] w-[92vw] max-w-lg flex flex-col gap-2.5 pointer-events-none"
          style={{ top: '1rem', left: '50%', transform: 'translateX(-50%)' }}
        >
          {/* SafePass krizové hlášení */}
          {childData?.safePassCrisisReport && (
            <div
              className="w-full bg-emerald-950/95 text-white px-5 py-3.5 rounded-2xl shadow-[0_0_35px_rgba(16,185,129,0.7)] border-2 border-emerald-400 backdrop-blur-md flex items-center gap-3 animate-bounce pointer-events-auto"
              role="alert"
            >
              <span className="text-3xl flex-shrink-0">📍</span>
              <div className="flex-1 min-w-0">
                <div className="font-black text-xs uppercase tracking-wider text-emerald-300">
                  SafePass • Záchranné hlášení
                </div>
                <div className="text-sm font-bold text-white leading-snug">
                  {childData.safePassCrisisReport.message}
                </div>
                <div className="text-[11px] text-emerald-200/80 mt-1">
                  Hlášeno: {new Date(childData.safePassCrisisReport.reportedAt).toLocaleTimeString('cs-CZ')}
                </div>
              </div>
            </div>
          )}

          {/* Kritický stav baterie */}
          {isLowBattery && (
            <div
              className="w-full bg-gradient-to-r from-red-700 via-rose-600 to-red-800 text-white px-5 py-3.5 rounded-2xl shadow-[0_0_35px_rgba(220,38,38,0.7)] border-2 border-red-300 backdrop-blur-md flex items-center gap-3 animate-pulse pointer-events-auto"
              role="alert"
            >
              <span className="text-3xl flex-shrink-0">🪫</span>
              <div className="flex-1 min-w-0">
                <div className="font-black text-xs uppercase tracking-wider text-red-200">
                  Kritický stav baterie
                </div>
                <div className="text-sm font-black text-white leading-snug">
                  ⚠️ Zařízení dítěte má kriticky málo baterie ({childData?.battery ?? 12} %). Poslední poloha: {childData?.lastStreetName || 'Praha'}.
                </div>
              </div>
            </div>
          )}

          {/* Odchýlení z trasy */}
          {isDeviated && (
            <div
              className="w-full bg-rose-600/95 text-white px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-rose-300 backdrop-blur-md flex items-center gap-3 animate-bounce pointer-events-auto"
              role="alert"
            >
              <span className="text-3xl animate-pulse flex-shrink-0">🚨</span>
              <div className="flex-1 min-w-0">
                <div className="font-black text-xs uppercase tracking-wider text-rose-200">
                  Bezpečnostní koridor narušen
                </div>
                <div className="text-base font-black text-white leading-tight">
                  Dítě se odchýlilo z trasy!
                </div>
                {childData && (
                  <div className="text-[11px] text-rose-100 mt-0.5 truncate">
                    Poslední známá poloha: {childData.lat.toFixed(5)}, {childData.lng.toFixed(5)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Ztráta signálu (Heartbeat watchdog > 60s) */}
          {isHeartbeatLost && !isDeviated && !isLowBattery && (
            <div
              className="w-full bg-gradient-to-r from-amber-950 via-slate-900 to-rose-950 text-white px-5 py-3.5 rounded-2xl shadow-[0_0_25px_rgba(245,158,11,0.5)] border-2 border-amber-500 backdrop-blur-md flex items-center gap-3 animate-pulse pointer-events-auto"
              role="alert"
            >
              <span className="text-3xl flex-shrink-0">⚠️</span>
              <div className="flex-1 min-w-0">
                <div className="font-black text-xs uppercase tracking-wider text-amber-400">
                  Ztráta spojení se zařízením
                </div>
                <div className="text-sm font-bold text-white leading-snug">
                  Upozornění: Zařízení dítěte je déle než 1 minutu offline. Poslední známá poloha před {minutesSinceLastSeen} min.
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stavová lišta spárovaného dítěte */}
      {pairedCode && isParentMode && (
        <div className="absolute top-4 left-4 z-[400] hidden sm:flex items-center gap-2.5 bg-slate-900/90 backdrop-blur border border-slate-700/80 px-3.5 py-1.5 rounded-xl shadow-lg text-xs font-semibold text-slate-200">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isHeartbeatLost ? 'bg-slate-500' : (childData ? 'bg-lime-400' : 'bg-amber-400')} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isHeartbeatLost ? 'bg-slate-400' : (childData ? 'bg-lime-500' : 'bg-amber-500')}`}></span>
          </span>
          <span className={isHeartbeatLost ? 'text-slate-300 font-bold' : (childData ? 'text-lime-300 font-bold' : 'text-amber-300 font-medium')}>
            {isHeartbeatLost ? 'Offline / Ztráta signálu' : (childData ? 'Dítě živě sledováno' : 'Čekám na polohu dítěte')}
          </span>
          <span className="text-slate-400 font-mono">({pairedCode})</span>

          {childData?.battery !== undefined && (
            <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${
              isLowBattery ? 'bg-red-500/20 text-red-300 border border-red-500/40' : 'bg-slate-800 text-slate-300'
            }`}>
              <span>{childData.charging ? '⚡' : (isLowBattery ? '🪫' : '🔋')}</span>
              <span>{childData.battery}%</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowSafePassModal(true)}
            className="ml-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 hover:border-emerald-400 px-2 py-0.5 rounded-lg text-[11px] font-bold transition-colors flex items-center gap-1 active:scale-95"
            title="Zobrazit / Vytisknout SafePass QR krizovou kartičku"
          >
            <span>🏷️</span> SafePass
          </button>
        </div>
      )}

      {/* SafePass Modal */}
      {showSafePassModal && (
        <SafePassModal
          childCode={pairedCode || 'SAFE-PASS-DEMO'}
          onClose={() => setShowSafePassModal(false)}
        />
      )}
    </div>
  );
}

export const MapEngine = Map;
export default Map;
