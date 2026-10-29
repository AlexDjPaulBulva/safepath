import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import * as turf from '@turf/turf';
import polyline from '@mapbox/polyline';

import staticSafetyData from '../data/pragueStaticSafety.json';
import incidentsData from '../data/incidents.json';
import { useAppStore } from '../store/useAppStore';
import { subscribeToChildSession, ChildSessionData } from '../lib/liveSync';
import { RouteResult, getPointAlongRoute } from '../lib/routing';
import { SafetyFeature, SafeHavenFeature } from '../lib/opendata';
import { OSMSurveillanceFeature } from '../lib/osm-surveillance-harvester';
import { SafetyPoint, getSafetyPointsAlongRoute, buildSafetyPointsCollection, isPointNearRoute } from '../lib/safetyPoints';
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

const initSafeRouteLayers = (map: maplibregl.Map) => {
  if (!map.isStyleLoaded()) return;

  if (!map.getSource('safe-route-source')) {
    map.addSource('safe-route-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });
  }

  // Spodní neonová záře
  if (!map.getLayer('safe-route-glow')) {
    map.addLayer({
      id: 'safe-route-glow',
      type: 'line',
      source: 'safe-route-source',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#10b981',
        'line-width': 14,
        'line-opacity': 0.45,
        'line-blur': 3
      }
    });
  }

  // Hlavní sytý koridor
  if (!map.getLayer('safe-route-core')) {
    map.addLayer({
      id: 'safe-route-core',
      type: 'line',
      source: 'safe-route-source',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#059669',
        'line-width': 6,
        'line-opacity': 1.0
      }
    });
  }

  try {
    if (map.getLayer('safe-route-glow')) map.moveLayer('safe-route-glow');
    if (map.getLayer('safe-route-core')) map.moveLayer('safe-route-core');
  } catch (e) {
    console.warn('moveLayer safe-route error:', e);
  }
};

function getCameraAzimuth(cam: { lat: number; lng: number; direction?: number }, routeCoords: [number, number][]): number {
  if (typeof cam.direction === 'number' && !isNaN(cam.direction)) {
    return cam.direction;
  }
  if (!routeCoords || routeCoords.length === 0) return 45;
  let minDist = Infinity;
  let closest: [number, number] = routeCoords[0];
  for (const c of routeCoords) {
    const d = (c[0] - cam.lng) ** 2 + (c[1] - cam.lat) ** 2;
    if (d < minDist) {
      minDist = d;
      closest = c;
    }
  }
  const dLng = closest[0] - cam.lng;
  const dLat = closest[1] - cam.lat;
  let angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return Math.round(angle);
}

export function Map(props: MapEngineProps) {
  console.log('DEBUG SAFE PATH DATA:', props.routeCoordinates);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [isCourseUp, setIsCourseUp] = useState(false);
  const [svgPath, setSvgPath] = useState<string>('');
  const lastFittedRouteIdRef = useRef<string | null>(null);
  const userInteractedRef = useRef<boolean>(false);
  const pendingRouteRef = useRef<[number, number][] | null>(null);

  // Zásada čisté mapy: správa aktivních koridorových markerů bez memory leaků
  const corridorMarkersRef = useRef<maplibregl.Marker[]>([]);
  const clearCorridorElements = () => {
    corridorMarkersRef.current.forEach((marker) => marker.remove());
    corridorMarkersRef.current = [];
  };

  // References pro zamezení stale closures při kliknutí do mapy
  const onMapClickRef = useRef(props.onMapClick);
  const startPointRef = useRef(props.startPoint);
  const endPointRef = useRef(props.endPoint);
  const setStartPointRef = useRef(props.setStartPoint);
  const setEndPointRef = useRef(props.setEndPoint);
  const onToastRef = useRef(props.onToast);

  const prevStartKeyRef = useRef<string | null>(null);
  const prevEndKeyRef = useRef<string | null>(null);

  // Reset uživatelského zámku kamery POUZE při výběru nového startu nebo nového cíle
  useEffect(() => {
    const startKey = props.startPoint ? `${props.startPoint.lat.toFixed(5)},${props.startPoint.lng.toFixed(5)}` : null;
    const endKey = props.endPoint ? `${props.endPoint.lat.toFixed(5)},${props.endPoint.lng.toFixed(5)}` : null;

    if (startKey !== prevStartKeyRef.current || endKey !== prevEndKeyRef.current) {
      prevStartKeyRef.current = startKey;
      prevEndKeyRef.current = endKey;
      userInteractedRef.current = false;
      lastFittedRouteIdRef.current = null;
    }
  }, [props.startPoint, props.endPoint]);

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

  const activeMode = useAppStore((state) => state.activeMode);
  const storePairedCode = useAppStore((state) => state.pairedChildCode);
  const setStoreChildLocation = useAppStore((state) => state.setChildLocation);
  const setChildSession = useAppStore((state) => state.setChildSession);
  const setActiveSafetyStats = useAppStore((state) => state.setActiveSafetyStats);

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
      initSafeRouteLayers(map);
      drawFastestRoute(map);
      setIsMapLoaded(true);
    });

    map.on('style.load', () => {
      initSafeRouteLayers(map);
      drawFastestRoute(map);
    });

    // Uživatelský zámek kamery pro zamezení gumového zoomu (Rubberbanding)
    map.on('dragstart', () => { userInteractedRef.current = true; });
    map.on('zoomstart', (e: any) => { if (e.originalEvent) userInteractedRef.current = true; });
    map.on('rotatestart', () => { userInteractedRef.current = true; });

    map.on('click', (e: maplibregl.MapMouseEvent) => {
      const lat = e.lngLat.lat;
      const lng = e.lngLat.lng;

      if (onMapClickRef.current) {
        onMapClickRef.current(lat, lng);
      } else if (setStartPointRef.current || setEndPointRef.current) {
        userInteractedRef.current = false;
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
      clearCorridorElements();
      if (startMarkerRef.current) {
        startMarkerRef.current.remove();
        startMarkerRef.current = null;
      }
      if (endMarkerRef.current) {
        endMarkerRef.current.remove();
        endMarkerRef.current = null;
      }
      if (userPuckMarkerRef.current) {
        userPuckMarkerRef.current.remove();
        userPuckMarkerRef.current = null;
      }
      if (childLiveMarkerRef.current) {
        childLiveMarkerRef.current.remove();
        childLiveMarkerRef.current = null;
      }
      if (avatarMarkerRef.current) {
        avatarMarkerRef.current.remove();
        avatarMarkerRef.current = null;
      }
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

  // 2. Garantované vykreslení zelené linie trasy (SVG projekce + GPU WebGL synchronizace)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded || !validCoords || validCoords.length < 2) {
      setSvgPath('');
      lastFittedRouteIdRef.current = null;
      if (map && map.getSource('safe-route-source')) {
        try {
          (map.getSource('safe-route-source') as maplibregl.GeoJSONSource).setData({
            type: 'FeatureCollection',
            features: []
          });
        } catch (e) {
          // Ignorovat při unmount
        }
      }
      return;
    }

    initSafeRouteLayers(map);

    // Přepočet GPS bodů trasy na pixely obrazovky pro SVG Overlay
    const syncPath = () => {
      try {
        const d = validCoords
          .map((coord, idx) => {
            const pixel = map.project(coord);
            return `${idx === 0 ? 'M' : 'L'} ${pixel.x.toFixed(1)} ${pixel.y.toFixed(1)}`;
          })
          .join(' ');
        setSvgPath(d);
      } catch (err) {
        console.error('Chyba přepočtu trasy:', err);
      }
    };

    // Prvotní vykreslení
    syncPath();

    // Nativní GeoJSON pro GPU
    const geojson: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
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

    const src = map.getSource('safe-route-source') as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(geojson);
    }

    try {
      if (map.getLayer('safe-route-glow')) map.moveLayer('safe-route-glow');
      if (map.getLayer('safe-route-core')) map.moveLayer('safe-route-core');
    } catch (e) {
      console.warn('moveLayer safe-route warning:', e);
    }

    // Automatické přizpůsobení pohledu na novou trasu POUZE JEDNOU, pokud uživatel mapu manuálně neovládá
    const routeSignature = `${validCoords[0].join(',')}-${validCoords[validCoords.length - 1].join(',')}`;
    if (lastFittedRouteIdRef.current !== routeSignature) {
      lastFittedRouteIdRef.current = routeSignature;
      if (!userInteractedRef.current) {
        const bounds = validCoords.reduce(
          (b, c) => b.extend(c),
          new maplibregl.LngLatBounds(validCoords[0], validCoords[0])
        );
        map.fitBounds(bounds, { padding: 80, duration: 600 });
      }
    }

    map.on('move', syncPath);
    map.on('zoom', syncPath);
    map.on('rotate', syncPath);
    map.on('pitch', syncPath);

    return () => {
      map.off('move', syncPath);
      map.off('zoom', syncPath);
      map.off('rotate', syncPath);
      map.off('pitch', syncPath);
    };
  }, [validCoords, isMapLoaded]);

  // Podpora pro volitelnou linku nejrychlejší alternativní trasy
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    drawFastestRoute(map);
  }, [props.showFastestRoute, props.fastestRoute, isMapLoaded]);

  // 3. Plynulé vycentrování mapy na pokyn uživatele (GPS recenter / center prop)
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

    if (props.center && (!validCoords || validCoords.length < 2)) {
      const c = props.center;
      const normalizedCenter: [number, number] = c[0] > 30 ? [c[1], c[0]] : [c[0], c[1]];
      map.flyTo({
        center: normalizedCenter,
        zoom: 15,
        duration: 1000
      });
    }
  }, [props.recenterTrigger, props.center, isMapLoaded, validCoords]);

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

  // 6. Start a Cíl Markery (Striktní styl proti smrštění flexboxu - Zákaz ořezávání na písmeno "L")
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Start
    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }
    if (props.startPoint) {
      const startEl = document.createElement('div');
      startEl.style.cssText = 'display: inline-flex !important; align-items: center !important; gap: 4px !important; padding: 4px 10px !important; background: #059669 !important; color: #ffffff !important; font-size: 11px !important; font-weight: 800 !important; border-radius: 9999px !important; border: 2px solid #ffffff !important; box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important; white-space: nowrap !important; width: auto !important; min-width: max-content !important; flex-shrink: 0 !important; z-index: 40 !important;';
      startEl.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></span><span>START</span>`;

      startMarkerRef.current = new maplibregl.Marker({ element: startEl, anchor: 'center' })
        .setLngLat([props.startPoint.lng, props.startPoint.lat])
        .addTo(map);
    }

    // Cíl
    if (endMarkerRef.current) {
      endMarkerRef.current.remove();
      endMarkerRef.current = null;
    }
    if (props.endPoint) {
      const destEl = document.createElement('div');
      destEl.style.cssText = 'display: inline-flex !important; align-items: center !important; gap: 4px !important; padding: 4px 10px !important; background: #4f46e5 !important; color: #ffffff !important; font-size: 11px !important; font-weight: 800 !important; border-radius: 9999px !important; border: 2px solid #ffffff !important; box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important; white-space: nowrap !important; width: auto !important; min-width: max-content !important; flex-shrink: 0 !important; z-index: 40 !important;';
      destEl.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></span><span>CÍL</span>`;

      endMarkerRef.current = new maplibregl.Marker({ element: destEl, anchor: 'center' })
        .setLngLat([props.endPoint.lng, props.endPoint.lat])
        .addTo(map);
    }

    return () => {
      if (startMarkerRef.current) {
        startMarkerRef.current.remove();
        startMarkerRef.current = null;
      }
      if (endMarkerRef.current) {
        endMarkerRef.current.remove();
        endMarkerRef.current = null;
      }
    };
  }, [props.startPoint, props.endPoint]);

  // 7. Vykreslení bezpečnostních odznaků podél trasy (Corridor Safety Markers do 60 m)
  useEffect(() => {
    // 1. Vyčištění
    corridorMarkersRef.current.forEach(m => m.remove());
    corridorMarkersRef.current = [];

    if (!validCoords || validCoords.length < 2) {
      setActiveSafetyStats({
        camerasCount: 0,
        crossingsCount: 0,
        hazardsCount: 0,
        havensCount: 0
      });
      return;
    }

    // Shromáždění bezpečnostních prvků (kamery, semafory/přechody, safe havens)
    const allSafetyPoints = buildSafetyPointsCollection({
      snappedCrossings: activeRoute?.snappedCrossings,
      staticCrossings: staticSafetyData?.crossings as any[],
      osmCameras: props.osmCameras,
      safetyNodes: props.safetyNodes,
      staticCameras: staticSafetyData?.cameras as any[],
      safeHavens: props.safeHavens
    });

    // 2. Oprava prostorového filtru (ošetření prohozených [lng, lat])
    const corridorPoints = (allSafetyPoints || []).filter((pt: any) => {
      const pLng = Number(pt.lng ?? pt.longitude ?? pt.lon ?? (Array.isArray(pt) ? pt[0] : 0));
      const pLat = Number(pt.lat ?? pt.latitude ?? (Array.isArray(pt) ? pt[1] : 0));
      if (!pLng || !pLat) return false;

      return validCoords.some((coord: [number, number]) => {
        // coord je v MapLibre standardu [lng, lat]
        const cLng = coord[0];
        const cLat = coord[1];
        const dX = (pLng - cLng) * 71500; // metry na délku v Praze
        const dY = (pLat - cLat) * 111300; // metry na šířku
        return (dX * dX + dY * dY) <= 3600; // 60 metrů na druhou
      });
    });

    // Synchronizace statistik se Sidebarem
    const camerasCount = corridorPoints.filter((p: any) => {
      return p.type === 'camera' || p.type === 'mks' || String(p.name || p.title || '').toLowerCase().includes('kamera');
    }).length;
    const crossingsCount = corridorPoints.filter((p: any) => {
      const isCam = p.type === 'camera' || p.type === 'mks' || String(p.name || p.title || '').toLowerCase().includes('kamera');
      return !isCam && p.type !== 'safe_haven';
    }).length;
    const havensCount = corridorPoints.filter((p: any) => p.type === 'safe_haven').length;

    setActiveSafetyStats({
      camerasCount,
      crossingsCount,
      hazardsCount: 0,
      havensCount
    });

    // 3. Vykreslení skutečných SVG ikon namísto písmen
    corridorPoints.forEach((pt: any) => {
      const isCam = pt.type === 'camera' || pt.type === 'mks' || String(pt.name || pt.title || '').toLowerCase().includes('kamera');
      
      const el = document.createElement('div');
      el.style.cssText = 'width: 28px !important; height: 28px !important; border-radius: 50% !important; display: flex !important; align-items: center !important; justify-content: center !important; box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important; cursor: pointer !important; z-index: 30 !important;';

      if (isCam) {
        // IKONA KAMERY (Tmavě modrá s modrým rámečkem)
        el.style.background = '#0f172a';
        el.style.border = '2px solid #38bdf8';
        el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;
      } else {
        // IKONA SEMAFORU (Smaragdově zelená)
        el.style.background = '#059669';
        el.style.border = '2px solid #ffffff';
        el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="3"/><circle cx="12" cy="7" r="1.5" fill="#ef4444"/><circle cx="12" cy="12" r="1.5" fill="#f59e0b"/><circle cx="12" cy="17" r="1.5" fill="#10b981"/></svg>`;
      }

      const pLng = Number(pt.lng ?? pt.longitude ?? pt.lon);
      const pLat = Number(pt.lat ?? pt.latitude);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pLng, pLat])
        .addTo(mapRef.current!);

      corridorMarkersRef.current.push(marker);
    });

    return () => {
      corridorMarkersRef.current.forEach(m => m.remove());
      corridorMarkersRef.current = [];
    };
  }, [
    validCoords, 
    activeRoute, 
    props.osmCameras, 
    props.safetyNodes, 
    props.safeHavens,
    setActiveSafetyStats
  ]);

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

      {/* Obnovená SVG vrstva spojující souřadnice */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ overflow: 'visible' }}>
        {svgPath && (
          <>
            <path d={svgPath} fill="none" stroke="#10b981" strokeWidth={14} strokeOpacity={0.4} strokeLinecap="round" strokeLinejoin="round" />
            <path d={svgPath} fill="none" stroke="#059669" strokeWidth={6} strokeOpacity={0.95} strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
      </svg>

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

      {/* Minimalistická stavová pilulka spárovaného dítěte */}
      {pairedCode && isParentMode && (
        <div className="absolute top-3 left-3 z-[400] hidden sm:flex items-center gap-2 bg-slate-900/85 backdrop-blur-md border border-slate-700/70 px-2.5 py-1 rounded-full shadow-md text-[11px] font-semibold text-slate-200">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isHeartbeatLost ? 'bg-slate-500' : (childData ? 'bg-lime-400' : 'bg-amber-400')} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isHeartbeatLost ? 'bg-slate-400' : (childData ? 'bg-lime-500' : 'bg-amber-500')}`}></span>
          </span>
          <span className={isHeartbeatLost ? 'text-slate-300' : (childData ? 'text-lime-300 font-bold' : 'text-amber-300')}>
            {isHeartbeatLost ? 'Offline' : (childData ? 'Dítě sledováno' : 'Čekám na polohu')}
          </span>
          <span className="text-slate-400 font-mono text-[10px]">({pairedCode})</span>

          {childData?.battery !== undefined && (
            <span className={`text-[10px] font-mono px-1 py-0.5 rounded flex items-center gap-0.5 ${
              isLowBattery ? 'bg-red-500/20 text-red-300' : 'bg-slate-800 text-slate-300'
            }`}>
              <span>{childData.charging ? '⚡' : (isLowBattery ? '🪫' : '🔋')}</span>
              <span>{childData.battery}%</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowSafePassModal(true)}
            className="ml-0.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded-full text-[10px] font-bold transition-colors flex items-center gap-1 active:scale-95"
            title="SafePass QR"
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
