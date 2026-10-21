import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Popup, Polyline, Circle, useMap, GeoJSON, CircleMarker, useMapEvents, Marker, Polygon } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as turf from '@turf/turf';
import { SafetyFeature, SafeHavenFeature } from '../lib/opendata';
import { RouteResult, RouteSegment, getPointAlongRoute } from '../lib/routing';
import { OSMSurveillanceFeature } from '../lib/osm-surveillance-harvester';
import { calculateFOVPolygon } from '../lib/fov-calculator';
import { SafetyReveal, SafetyZone } from '../types/safety';
import incidentsData from '../data/incidents.json';
import pragueVectorData from '../data/prague-vector-network.json';
import { getDynamicZoneScore, getDistance, pointInPolygon, calculateLocationSafety, getSafetyRiskLabel } from '../lib/safety-engine';
import { getSafetyDataFusion } from '../lib/safetyDataFusion';

// Fix pro výchozí ikony Leafletu v prostředích s bundlery
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Pomocná komponenta pro změnu centra mapy a sledování viewportu
function MapController({ 
  center, 
  selectedRoute,
  routeA,
  routeB,
  routeC,
  startPoint,
  endPoint,
  userLocation,
  recenterTrigger,
  setStartPoint,
  setEndPoint,
  onBoundsChange,
  onMapClick,
  onMapDoubleClick,
  onMapRightClick,
  onRouteProximityChange,
  onSelectRoute,
  onToast
}: { 
  center: [number, number] | null;
  selectedRoute: 'A' | 'B' | 'C';
  routeA?: RouteResult | null;
  routeB?: RouteResult | null;
  routeC?: RouteResult | null;
  startPoint?: {lat: number, lng: number; name?: string} | null;
  endPoint?: {lat: number, lng: number; name?: string} | null;
  userLocation?: { lat: number; lng: number; accuracy: number } | null;
  recenterTrigger?: { coords: [number, number]; timestamp: number } | null;
  setStartPoint?: (point: {lat: number, lng: number; name?: string} | null) => void;
  setEndPoint?: (point: {lat: number, lng: number; name?: string} | null) => void;
  onBoundsChange: (bounds: L.LatLngBounds, zoom: number) => void;
  onMapClick?: (lat: number, lng: number, name?: string) => void;
  onMapDoubleClick?: (lat: number, lng: number) => void;
  onMapRightClick?: (lat: number, lng: number) => void;
  onRouteProximityChange?: (point: [number, number] | null) => void;
  onSelectRoute?: (route: 'A' | 'B' | 'C') => void;
  onToast?: (message: string) => void;
}) {
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRecenterRef = React.useRef<number>(0);

  const map = useMapEvents({
    moveend: () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onBoundsChange(map.getBounds(), map.getZoom());
      }, 250);
    },
    zoomend: () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onBoundsChange(map.getBounds(), map.getZoom());
      }, 250);
    },
    click(e) {
      try {
        if (!e.latlng) return;
        const { lat, lng } = e.latlng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        if (onMapClick) {
          onMapClick(lat, lng);
        } else if (setStartPoint) {
          if (!startPoint) {
            setStartPoint({ lat, lng });
            onToast?.('Start nastaven. Nyní klepněte na cíl.');
          } else if (!endPoint) {
            setEndPoint?.({ lat, lng });
            onToast?.('Cíl nastaven. Počítám bezpečnou trasu...');
          } else {
            // Třetí klik nastaví nový start a resetuje trasu
            setStartPoint({ lat, lng });
            setEndPoint?.(null);
            onToast?.('Start nastaven. Nyní klepněte na cíl.');
          }
        }
      } catch (err) {
        console.error("Chyba při zpracování kliknutí na mapu:", err);
      }
    },
    dblclick(e) {
      try {
        if (onMapDoubleClick) {
          const { lat, lng } = e.latlng;
          if (Number.isFinite(lat) && Number.isFinite(lng)) onMapDoubleClick(lat, lng);
        }
      } catch (err) {
        console.error("Chyba při zpracování dvojkliku na mapu:", err);
      }
    },
    contextmenu(e) {
      try {
        // Deaktivace debugovacího listeneru: zamezení výchozího menu prohlížeče i tvorby testovacích kruhů/špendlíků
        if (e.originalEvent) {
          e.originalEvent.preventDefault();
          e.originalEvent.stopPropagation();
        }
      } catch (err) {
        console.error("Chyba při potlačení contextmenu:", err);
      }
    }
  });

  // Plynulé vycentrování mapy při stisku tlačítka zaměření GPS
  useEffect(() => {
    if (recenterTrigger && recenterTrigger.timestamp > lastRecenterRef.current) {
      lastRecenterRef.current = recenterTrigger.timestamp;
      map.flyTo(recenterTrigger.coords, 17, { animate: true, duration: 1.0 });
    }
  }, [recenterTrigger, map]);

  useEffect(() => {
    const selectedGeometry = routeA?.geometry;
    if (selectedGeometry && selectedGeometry.length > 0) {
      const polyline = L.polyline(selectedGeometry);
      map.flyToBounds(polyline.getBounds(), { padding: [60, 60], duration: 1.2 });
    } else if (center) {
      map.flyTo(center, 15, { animate: true, duration: 1.1 });
    }
    // Úvodní zavolání bounds
    onBoundsChange(map.getBounds(), map.getZoom());
  }, [center, routeA?.geometry, map]);

  return null;
}

export interface MapEngineProps {
  routeA?: RouteResult | null;
  routeB?: RouteResult | null;
  routeC?: RouteResult | null;
  fastestRoute?: RouteResult | null;
  showFastestRoute?: boolean;
  selectedRoute: 'A' | 'B' | 'C';
  startPoint?: {lat: number, lng: number; name?: string} | null;
  endPoint?: {lat: number, lng: number; name?: string} | null;
  userLocation?: { lat: number; lng: number; accuracy: number } | null;
  recenterTrigger?: { coords: [number, number]; timestamp: number } | null;
  setStartPoint?: (point: {lat: number, lng: number; name?: string} | null) => void;
  setEndPoint?: (point: {lat: number, lng: number; name?: string} | null) => void;
  onToast?: (message: string) => void;
  safetyNodes: SafetyFeature[]; // Lampy
  osmCameras?: OSMSurveillanceFeature[]; // Reálné OSM kamery
  safeHavens?: SafeHavenFeature[];
  layers: { cameras: boolean; lights: boolean; havens?: boolean; incidents?: boolean; zones?: boolean; localDataOnly?: boolean; };
  timeOfDay: number;
  center: [number, number] | null;
  onMapClick?: (lat: number, lng: number, name?: string) => void;
  isSimulating?: boolean;
  simulationProgress?: number;
  activeProfiles?: string[];
  scannedLocation?: {lat: number, lng: number, name: string} | null;
  onCloseScanner?: () => void;
  onMapDoubleClick?: (lat: number, lng: number) => void;
  onMapRightClick?: (lat: number, lng: number) => void;
  safeStops?: {lat: number, lng: number, name: string}[];
  childDeviation?: {lat: number, lng: number} | null;
  reveal?: SafetyReveal | null;
  proximityPoint?: [number, number] | null;
  onRouteProximityChange?: (point: [number, number] | null) => void;
  onSelectRoute?: (route: 'A' | 'B' | 'C') => void;
  childLiveLocation?: { lat: number; lng: number; inCorridor?: boolean; lastSeen?: number; isOffline?: boolean; timestamp?: number } | null;
  isSosActive?: boolean;
}

export function MapEngine({ 
  routeA,
  routeB,
  routeC,
  fastestRoute,
  showFastestRoute = false,
  selectedRoute,
  startPoint,
  endPoint,
  userLocation,
  recenterTrigger,
  setStartPoint,
  setEndPoint,
  onToast,
  safetyNodes, 
  osmCameras = [], 
  safeHavens = [],
  layers, 
  timeOfDay, 
  center,
  onMapClick,
  isSimulating = false,
  simulationProgress = 0,
  activeProfiles = ['parent'],
  scannedLocation = null,
  onCloseScanner,
  onMapDoubleClick,
  onMapRightClick,
  safeStops = [],
  childDeviation = null,
  childLiveLocation = null,
  reveal = null,
  proximityPoint = null,
  onRouteProximityChange,
  onSelectRoute,
  isSosActive = false
}: MapEngineProps) {
  const [mapBounds, setMapBounds] = useState<L.LatLngBounds | null>(null);
  const [currentZoom, setCurrentZoom] = useState(15);
  const [tileSource, setTileSource] = useState<'osm' | 'carto'>('osm');
  
  const isNight = timeOfDay >= 17 || timeOfDay <= 6;
  const tileUrl = tileSource === 'osm'
    ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

  const getSegmentColor = (score: number) => {
    if (score >= 80) return '#10b981'; // Zelená
    if (score >= 50) return '#f59e0b'; // Oranžová
    return '#ef4444'; // Červená
  };

  // Výpočet bounding boxu pro zobrazenou trasu A (pro lokální kontext)
  const routeBounds = useMemo(() => {
    if (!routeA?.geometry || routeA.geometry.length === 0) return null;
    const bounds = L.latLngBounds([]);
    routeA.geometry.forEach((c: [number, number]) => bounds.extend(c));
    return bounds.isValid() ? bounds.pad(0.05) : null;
  }, [routeA]);

  // Lazy Rendering: Vybereme jen kamery, které jsou v zorném poli (Viewport) a v okolí trasy (pokud je zapnutý localDataOnly)
  const visibleCameras = useMemo(() => {
    if (!mapBounds) return [];
    if (layers.localDataOnly && !routeBounds) return []; // Pokud není zvolena trasa a je zapnutá restrikce, neukazuj nic
    
    return osmCameras.filter(cam => {
      const p = [cam.lat, cam.lng] as [number, number];
      if (!mapBounds.contains(p)) return false;
      if (layers.localDataOnly && routeBounds && !routeBounds.contains(p)) return false;
      return true;
    });
  }, [osmCameras, mapBounds, routeBounds, layers.localDataOnly]);

  const scannedData = useMemo(() => {
    if (!scannedLocation) return null;
    const mappedCameras = osmCameras.map(cam => ({
      id: cam.id.toString(), type: 'camera' as const, coords: [cam.lat, cam.lng] as [number, number], radius: 60, active_night: true
    }));
    return calculateLocationSafety(scannedLocation.lat, scannedLocation.lng, timeOfDay, mappedCameras, safeHavens as any);
  }, [scannedLocation, timeOfDay, osmCameras, safeHavens]);

  const activeRoute = routeA;

  const activeSegments = useMemo(() => {
    return activeRoute?.segments;
  }, [activeRoute]);
  const cameraRevealActive = reveal === 'camera' || proximityPoint !== null;
  const hazardRevealActive = reveal === 'hazard' || proximityPoint !== null;
  const darkRevealActive = reveal === 'dark' || proximityPoint !== null;
  const safetyContextActive = reveal !== null || proximityPoint !== null;
  const isNearProximity = (lat: number, lng: number) => !proximityPoint
    || getDistance(proximityPoint[0], proximityPoint[1], lat, lng) <= 300;

  const trafficSignalIcon = useMemo(() => L.divIcon({
    html: `<div class="relative flex items-center justify-center">
             <div class="w-6 h-6 rounded-full flex items-center justify-center bg-slate-900 border-2 border-emerald-400 text-xs shadow-[0_0_8px_rgba(52,211,153,0.8)] cursor-pointer select-none" title="Chráněný světelný přechod se semaforem">
               🚦
             </div>
           </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  }), []);

  const zebraCrossingIcon = useMemo(() => L.divIcon({
    html: `<div class="relative flex items-center justify-center">
             <div class="w-6 h-6 rounded-full flex items-center justify-center bg-slate-900 border-2 border-emerald-400 text-xs shadow-[0_0_8px_rgba(16,185,129,0.8)] cursor-pointer select-none" title="Vyznačený přechod pro chodce">
               🚸
             </div>
           </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  }), []);

  const schoolCorridorIcon = useMemo(() => L.divIcon({
    html: `<div class="relative flex items-center justify-center pointer-events-auto">
             <div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-600/95 border border-emerald-300 text-[11px] font-bold text-white shadow-[0_0_15px_rgba(16,185,129,0.7)] backdrop-blur whitespace-nowrap cursor-pointer">
               <span class="text-xs">🎒</span>
               <span class="text-[10px] font-bold tracking-tight">Bezpečná školní cesta</span>
             </div>
           </div>`,
    className: '',
    iconSize: [140, 24],
    iconAnchor: [70, 12]
  }), []);

  // THMP stožáry veřejného osvětlení (efektivní světelný rádius 18 m) podél trasy
  const thmpLampsOnRoute = useMemo(() => {
    if (!routeA?.geometry || routeA.geometry.length < 2) return [];
    return getSafetyDataFusion().getTHMPLampsAlongRoute(routeA.geometry, 25);
  }, [routeA?.geometry]);

  // IPR Praha: body oficiálních koridorů Bezpečné cesty do školy
  const schoolBadgesOnRoute = useMemo(() => {
    if (!routeA?.geometry || routeA.geometry.length < 2) return [];
    return getSafetyDataFusion().checkSchoolCorridorCoverage(routeA.geometry).badgePoints;
  }, [routeA?.geometry]);

  // Kužely zorného pole kamer v blízkosti trasy (CCTV Visual Cones - délka 25 m mířící do ulice)
  const routeCctvCones = useMemo(() => {
    if (!layers.cameras || !routeA?.geometry || routeA.geometry.length < 2 || !osmCameras || osmCameras.length === 0) {
      return [];
    }

    const routeCoords = routeA.geometry;
    const maxDistanceMeters = 60; // Kamery do 60 m od trasy

    const nearCams = osmCameras.filter(cam => {
      for (let i = 0; i < routeCoords.length; i++) {
        const [rLat, rLng] = routeCoords[i];
        const dLat = (cam.lat - rLat) * 111320;
        const dLng = (cam.lng - rLng) * 111320 * Math.cos(rLat * Math.PI / 180);
        if (dLat * dLat + dLng * dLng <= maxDistanceMeters * maxDistanceMeters) {
          return true;
        }
      }
      return false;
    });

    return nearCams.map(cam => ({
      id: cam.id,
      lat: cam.lat,
      lng: cam.lng,
      description: cam.description,
      positions: calculateFOVPolygon(cam, routeA.segments || activeSegments, 25)
    }));
  }, [layers.cameras, routeA?.geometry, routeA?.segments, osmCameras, activeSegments]);

  const routeConeStyle = {
    color: '#38bdf8',
    fillColor: '#38bdf8',
    fillOpacity: 0.2,
    weight: 1,
    className: 'pointer-events-none'
  };

  const fovFeatures = useMemo(() => {
    if (!layers.cameras || !cameraRevealActive) return [];
    return visibleCameras.filter(cam => isNearProximity(cam.lat, cam.lng)).map(cam => ({
      id: cam.id,
      positions: calculateFOVPolygon(cam, activeSegments)
    }));
  }, [visibleCameras, layers.cameras, activeSegments, cameraRevealActive, proximityPoint]);

  const fovStyle = {
    color: '#2dd4bf', 
    fillColor: '#0ea5e9',
    fillOpacity: 0.25,
    weight: 1,
    className: 'animate-pulse pointer-events-none' 
  };

  // Vytvoření ikon clusteru
  const createClusterCustomIcon = (cluster: any) => {
    const count = cluster.getChildCount();
    let sizeClass = 'marker-cluster-custom';
    if (count > 20) {
      sizeClass += ' marker-cluster-large';
    }
    return L.divIcon({
      html: `<div><span>${count}</span></div>`,
      className: sizeClass,
      iconSize: L.point(40, 40, true),
    });
  };

  const startIcon = L.divIcon({
    html: `<div class="relative flex items-center justify-center">
             <div class="absolute -top-6 bg-slate-900 border border-emerald-500 text-emerald-400 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shadow">Start</div>
             <span class="animate-ping absolute inline-flex h-5 w-5 rounded-full bg-emerald-400 opacity-75"></span>
             <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border border-white"></span>
           </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const endIcon = L.divIcon({
    html: `<div class="relative flex items-center justify-center">
             <div class="absolute -top-6 bg-slate-900 border border-indigo-500 text-indigo-400 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shadow">Cíl</div>
             <span class="relative inline-flex rounded-full h-3 w-3 bg-indigo-500 border border-white"></span>
           </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const getHavenIcon = (is247: boolean, showText: boolean) => L.divIcon({
    html: `<div class="relative flex items-center justify-center">
             ${showText ? `<div class="absolute -top-6 bg-slate-900 border ${is247 ? 'border-yellow-500 text-yellow-400' : 'border-blue-500 text-blue-400'} text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shadow whitespace-nowrap">
               ${is247 ? '24/7 Pohotovost' : 'SOS'}
             </div>` : ''}
             <div class="h-6 w-6 rounded flex items-center justify-center ${is247 ? 'bg-yellow-500' : 'bg-blue-500'} text-white shadow-lg text-sm border border-slate-900">
               🛡️
             </div>
           </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const avatarPoint = useMemo(() => {
    if (!isSimulating || !routeA?.segments || routeA?.segments.length === 0) return null;
    if (childDeviation) return childDeviation;
    const pt = getPointAlongRoute(routeA?.segments, simulationProgress);
    if (!pt) return null;
    return { lat: pt[0], lng: pt[1] };
  }, [isSimulating, routeA?.segments, simulationProgress, childDeviation]);

  const isAvatarSafe = useMemo(() => {
    if (!avatarPoint) return false;
    const inSOS = safeHavens.some(h => getDistance(avatarPoint.lat, avatarPoint.lng, h.lat, h.lng) <= 60);
    if (inSOS) return true;
    for (const fov of fovFeatures) {
      if (pointInPolygon([avatarPoint.lat, avatarPoint.lng], fov.positions)) {
        return true;
      }
    }
    return false;
  }, [avatarPoint, safeHavens, fovFeatures]);

  const avatarIcon = L.divIcon({
    html: `<div class="relative flex items-center justify-center">
             <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full ${isAvatarSafe ? 'bg-cyan-400' : 'bg-emerald-400'} opacity-75"></span>
             <div class="relative inline-flex rounded-full h-8 w-8 ${isAvatarSafe ? 'bg-cyan-900 border-cyan-400 shadow-cyan-400/50' : 'bg-slate-800 border-emerald-500 shadow-emerald-500/50'} border-2 items-center justify-center text-lg shadow-xl transition-colors duration-300">
               ${activeProfiles.includes('parent') ? '👧' : '🚶'}
             </div>
             ${isAvatarSafe ? `<div class="absolute -top-6 bg-cyan-900 text-cyan-300 border border-cyan-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-lg">V zorném poli MKS</div>` : ''}
           </div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  const childLiveIcon = useMemo(() => {
    const isOffline = Boolean(
      childLiveLocation?.isOffline ||
      (childLiveLocation?.lastSeen && Date.now() - childLiveLocation.lastSeen > 60000)
    );

    if (isOffline) {
      return L.divIcon({
        html: `<div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
                 <div class="relative inline-flex rounded-full h-8 w-8 bg-slate-600 border-2 border-slate-400 shadow-[0_0_15px_rgba(148,163,184,0.6)] items-center justify-center text-sm shadow-xl font-bold text-white">
                   ⚠️
                 </div>
                 <div class="absolute -top-6 bg-slate-900/95 text-slate-300 border border-slate-600 text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap shadow-lg tracking-wider uppercase">
                   Offline / Ztráta signálu
                 </div>
               </div>`,
        className: 'custom-child-marker-offline pointer-events-auto',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });
    }

    return L.divIcon({
      html: `<div class="relative flex items-center justify-center -translate-x-1/2 -translate-y-1/2">
               <span class="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-lime-400 opacity-75"></span>
               <span class="animate-pulse absolute inline-flex h-8 w-8 rounded-full bg-yellow-400/50"></span>
               <div class="relative inline-flex rounded-full h-8 w-8 bg-gradient-to-tr from-lime-500 to-yellow-400 border-2 border-white shadow-[0_0_15px_rgba(163,230,53,0.8)] items-center justify-center text-sm shadow-xl font-bold">
                 👶
               </div>
               <div class="absolute -top-6 bg-slate-900/90 text-lime-300 border border-lime-400/80 text-[10px] font-black px-2 py-0.5 rounded-full whitespace-nowrap shadow-lg tracking-wider uppercase">
                 Dítě
               </div>
             </div>`,
      className: 'custom-child-marker pointer-events-auto',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  }, [childLiveLocation?.isOffline, childLiveLocation?.lastSeen]);

  // Memoizace JSX vrstev pro zamezení re-renderu
  const camerasLayer = useMemo(() => {
    if (!layers.cameras || !cameraRevealActive) return null;
    const contextualCameras = visibleCameras.filter(node => isNearProximity(node.lat, node.lng));
    return (
      <>
        {fovFeatures.map(fov => (
          <Polygon 
            key={`fov-${fov.id}-${currentZoom}`}
            positions={fov.positions} 
            pathOptions={fovStyle} 
          />
        ))}
        
        <MarkerClusterGroup
          chunkedLoading={true}
          iconCreateFunction={createClusterCustomIcon}
          maxClusterRadius={80}
          showCoverageOnHover={false}
          spiderfyOnMaxZoom={false}
          zoomToBoundsOnClick={true}
          disableClusteringAtZoom={15}
        >
          {contextualCameras.map((node) => (
            <CircleMarker 
              key={node.id} 
              center={[node.lat, node.lng]}
              radius={5}
              pathOptions={{
                color: '#2dd4bf',
                fillColor: '#2dd4bf',
                fillOpacity: 1,
                weight: 2
              }}
            >
              <Popup className={isNight ? "custom-popup" : ""}>
                <div className={`text-xs font-semibold ${isNight ? 'text-slate-900' : 'text-slate-800'}`}>
                  <p className="font-bold border-b pb-1 mb-1">{node.description}</p>
                  <p className="text-emerald-600">Typ: {node.type.toUpperCase()}</p>
                  {node.direction !== null && <p>Směr: {node.direction}°</p>}
                  <p>Záběr: {node.angle}°</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MarkerClusterGroup>
      </>
    );
  }, [layers.cameras, cameraRevealActive, fovFeatures, visibleCameras, proximityPoint, isNight, currentZoom]);

  const havensLayer = useMemo(() => {
    if (!isSosActive && !layers.havens && !proximityPoint) return null;

    // Zákaz plošného vykreslování po celém městě v běžném provozu:
    // Vykreslíme VÝHRADNĚ body do 150 metrů od linie bezpečné trasy (turf.pointToLineDistance).
    // Pokud trasa neexistuje a SOS není aktivní, skryjeme všechny body.
    let routeLine: ReturnType<typeof turf.lineString> | null = null;
    if (!isSosActive) {
      const activeCoords = routeA?.geometry;
      if (!activeCoords || activeCoords.length < 2) {
        return null;
      }
      routeLine = turf.lineString(activeCoords.map(([lat, lng]) => [lng, lat]));
    }

    const visibleHavens = safeHavens.filter(h => {
      const p = [h.lat, h.lng] as [number, number];
      if (!mapBounds || !mapBounds.contains(p)) return false;
      if (layers.localDataOnly && !routeBounds) return false;
      if (layers.localDataOnly && routeBounds && !routeBounds.contains(p)) return false;
      if (proximityPoint && !isNearProximity(h.lat, h.lng)) return false;

      // V SOS režimu se zobrazí všechny záchytné body ve viewportu
      if (isSosActive) return true;

      // V běžném režimu VÝHRADNĚ ty do vzdálenosti 150 metrů od linie trasy
      if (routeLine) {
        const pt = turf.point([h.lng, h.lat]);
        const dist = turf.pointToLineDistance(pt, routeLine, { units: 'meters' });
        return dist <= 150;
      }

      return false;
    });

    if (visibleHavens.length === 0) return null;

    return (
      <MarkerClusterGroup
        chunkedLoading={true}
        iconCreateFunction={createClusterCustomIcon}
        maxClusterRadius={80}
        showCoverageOnHover={false}
        spiderfyOnMaxZoom={false}
        zoomToBoundsOnClick={true}
        disableClusteringAtZoom={15}
      >
        {visibleHavens.map((haven) => (
          <Marker 
            key={haven.id} 
            position={[haven.lat, haven.lng]} 
            icon={getHavenIcon(haven.is247, currentZoom >= 15)}
          >
            <Popup className="custom-popup">
              <div className="text-xs font-semibold text-slate-800">
                <p className="font-bold border-b pb-1 mb-1 text-slate-900">{haven.name}</p>
                <p>Typ: {{
                  'police': 'Policie ČR / MP',
                  'fire_station': 'Hasiči',
                  'pharmacy': 'Lékárna',
                  'fuel': 'Čerpací stanice'
                }[haven.type] || haven.type.toUpperCase()}</p>
                {haven.phone && <p>Tel: {haven.phone}</p>}
                {haven.is247 && <p className="text-yellow-600 font-bold">24/7 Pohotovost</p>}
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    );
  }, [layers.havens, layers.localDataOnly, safeHavens, currentZoom, mapBounds, routeBounds, proximityPoint, isSosActive, routeA]);

  const incidentIcon = L.divIcon({
    html: `<div class="relative flex items-center justify-center">
             <span class="animate-ping absolute inline-flex h-8 w-8 rounded-full bg-orange-400 opacity-75"></span>
             <div class="relative inline-flex rounded-full h-6 w-6 bg-orange-500 border-2 border-white items-center justify-center text-xs text-white font-bold shadow-[0_0_15px_rgba(249,115,22,0.7)]">
               ⚠️
             </div>
           </div>`,
    className: '',
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });

  const severeIncidentIcon = L.divIcon({
    html: `<div class="relative flex items-center justify-center">
             <span class="animate-ping absolute inline-flex h-10 w-10 rounded-full bg-red-500 opacity-80"></span>
             <div class="relative inline-flex rounded-full h-8 w-8 bg-red-600 border-2 border-slate-900 items-center justify-center text-sm text-white font-bold shadow-[0_0_20px_rgba(220,38,38,0.9)]">
               ❗
             </div>
           </div>`,
    className: '',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  const createIncidentClusterIcon = (cluster: any) => {
    const count = cluster.getChildCount();
    return L.divIcon({
      html: `<div class="relative flex items-center justify-center">
               <span class="animate-pulse absolute inline-flex h-12 w-12 rounded-full bg-red-500 opacity-50"></span>
               <div class="relative inline-flex rounded-full h-10 w-10 bg-red-600 border-2 border-slate-900 items-center justify-center text-sm text-white font-black shadow-[0_0_20px_rgba(220,38,38,0.8)]">
                 ${count}
               </div>
             </div>`,
      className: '',
      iconSize: L.point(40, 40, true),
    });
  };

  const incidentsLayer = useMemo(() => {
    if (!layers.incidents || !hazardRevealActive) return null;
    
    // Filtrování incidentů podle kontextu
    const visibleIncidents = incidentsData.filter(inc => {
      const p = inc.coordinates as [number, number];
      if (!mapBounds || !mapBounds.contains(p)) return false;
      if (layers.localDataOnly && !routeBounds) return false;
      if (layers.localDataOnly && routeBounds && !routeBounds.contains(p)) return false;
      return isNearProximity(p[0], p[1]);
    });

    if (visibleIncidents.length === 0) return null;

    return (
      <MarkerClusterGroup
        chunkedLoading={true}
        iconCreateFunction={createIncidentClusterIcon}
        maxClusterRadius={80}
        showCoverageOnHover={false}
        spiderfyOnMaxZoom={false}
        zoomToBoundsOnClick={true}
        disableClusteringAtZoom={15}
      >
        {visibleIncidents.map((incident) => (
          <Marker
            key={incident.id}
            position={incident.coordinates as [number, number]}
            icon={incident.severity >= 9 ? severeIncidentIcon : incidentIcon}
          >
            <Popup className="incident-popup">
              <div 
                className="w-64 p-3 rounded-lg flex flex-col gap-2 !m-0"
                style={{
                  background: '#0f172a',
                  color: '#f8fafc',
                  border: '1px solid #334155',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                }}
              >
                <div className="flex justify-between items-start border-b border-slate-700 pb-2 mb-1">
                  <h4 className="font-bold text-red-400 text-sm m-0 p-0 leading-tight pr-2">{incident.title}</h4>
                  <span className="bg-red-900/50 text-red-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-red-700/50 whitespace-nowrap">
                    {incident.severity}/10
                  </span>
                </div>
                <p className="text-slate-400 italic text-xs m-0 p-0">{incident.time_of_day}</p>
                <p className="text-slate-200 text-xs leading-relaxed m-0 p-0">{incident.summary}</p>
                
                {(incident.recommendation || incident.time_of_day === 'noc') && (
                  <div className="mt-1 bg-slate-800/80 text-amber-200 p-2 rounded border border-amber-900/50 text-[10px] font-semibold">
                    DOPORUČENÍ: {incident.recommendation || `Vyhněte se této oblasti po ${incident.time_of_day === 'noc' ? '22:00' : 'setmění'}.`}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    );
  }, [layers.incidents, hazardRevealActive, layers.localDataOnly, mapBounds, routeBounds, proximityPoint]);

  const darkSegmentsLayer = darkRevealActive && activeSegments
    ? activeSegments
      .filter(segment => segment.safetyScore < 80)
      .filter(segment => !proximityPoint || segment.coordinates.some(([lat, lng]) => isNearProximity(lat, lng)))
      .map((segment, index) => (
        <Polyline
          key={`dark-segment-${index}`}
          positions={segment.coordinates}
          pathOptions={{ color: '#f59e0b', weight: 8, opacity: 0.7, lineCap: 'round', lineJoin: 'round' }}
          className="safety-fade-layer"
          interactive={false}
        />
      ))
    : null;

  return (
    <div id="map-engine-root" className="w-full h-full relative z-0 pointer-events-auto" style={{ touchAction: 'pan-x pan-y' }}>
      {isSimulating && avatarPoint && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 px-6 py-3 rounded-full text-emerald-400 text-sm font-bold shadow-2xl border border-emerald-500 flex items-center space-x-3 backdrop-blur">
          <span className="animate-pulse h-3 w-3 bg-emerald-500 rounded-full"></span>
          <span>Právě prochází zónou pod dohledem kamery MKS...</span>
        </div>
      )}
      <MapContainer 
        {...({ tap: false } as any)}
        center={center || [50.0775, 14.4400]} 
        zoom={15} 
        minZoom={11}
        maxZoom={18}
        className="h-full w-full bg-slate-900 pointer-events-auto" 
        style={{ touchAction: 'pan-x pan-y' }}
        zoomControl={false}
        preferCanvas={true}
        doubleClickZoom={false}
      >
        <MapController 
          center={center} 
          selectedRoute={selectedRoute}
          routeA={routeA}
          routeB={routeB}
          routeC={routeC}
          startPoint={startPoint}
          endPoint={endPoint}
          userLocation={userLocation}
          recenterTrigger={recenterTrigger}
          setStartPoint={setStartPoint}
          setEndPoint={setEndPoint}
          onToast={onToast}
          onRouteProximityChange={onRouteProximityChange}
          onBoundsChange={(bounds, zoom) => {
            setMapBounds(bounds);
            setCurrentZoom(zoom);
          }} 
          onMapClick={onMapClick}
          onMapDoubleClick={onMapDoubleClick}
          onMapRightClick={onMapRightClick}
        />
        
        <TileLayer
          key={tileUrl}
          attribution={tileSource === 'osm'
            ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            : '&copy; OpenStreetMap contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'}
          url={tileUrl}
          className="map-tiles"
          maxNativeZoom={18}
          maxZoom={18}
          noWrap={true}
          keepBuffer={8}
          updateWhenIdle={true}
          updateWhenZooming={false}
          eventHandlers={{
            tileerror: () => {
              if (tileSource === 'osm') setTileSource('carto');
            }
          }}
        />

        {/* Live GPS Blue Dot (Google Maps styl) */}
        {userLocation && (
          <React.Fragment key="user-live-gps-dot">
            {/* Vnější pulzující kruh přesnosti GPS */}
            <Circle
              center={[userLocation.lat, userLocation.lng]}
              radius={Math.min(userLocation.accuracy || 25, 120)}
              pathOptions={{
                color: '#3b82f6',
                fillColor: '#60a5fa',
                fillOpacity: 0.15,
                weight: 1,
                className: 'pointer-events-none'
              }}
            />
            {/* Vnější pulzující aura modrého bodu */}
            <CircleMarker
              center={[userLocation.lat, userLocation.lng]}
              radius={13}
              pathOptions={{
                color: '#2563eb',
                fillColor: '#3b82f6',
                fillOpacity: 0.35,
                weight: 0,
                className: 'pointer-events-none animate-pulse'
              }}
            />
            {/* Vnitřní modrý bod s bílým okrajem */}
            <CircleMarker
              center={[userLocation.lat, userLocation.lng]}
              radius={7.5}
              pathOptions={{
                color: '#ffffff',
                fillColor: '#2563eb',
                fillOpacity: 1.0,
                weight: 2.5,
                className: 'pointer-events-none'
              }}
            />
          </React.Fragment>
        )}

        {/* Start and End Markers */}
        {startPoint && startPoint.name !== 'Moje aktuální poloha' && (
          <Marker position={[startPoint.lat, startPoint.lng]} icon={startIcon} zIndexOffset={1000}>
          </Marker>
        )}
        {endPoint && (
          <Marker position={[endPoint.lat, endPoint.lng]} icon={endIcon} zIndexOffset={1000}>
          </Marker>
        )}

        {/* Volitelné srovnání s nejrychlejší trasou (kontrastní Google Maps linie běžné navigace) */}
        {showFastestRoute && fastestRoute?.geometry && fastestRoute.geometry.length >= 2 && (
          <Polyline
            key="route-fastest-comparison"
            positions={fastestRoute.geometry}
            pathOptions={{
              color: '#94a3b8',
              weight: 4,
              dashArray: '6, 8',
              opacity: 0.75,
              lineCap: 'round'
            }}
            smoothFactor={1}
            className="pointer-events-none"
          />
        )}

        {/* Garantovaná bezpečná trasa A se světelným bezpečnostním koridorem (Safety Aura) */}
        {routeA?.geometry && routeA.geometry.length >= 2 && (
          <React.Fragment key="route-active-A">
            {/* 1. Světelný bezpečnostní koridor (Safety Aura) - chráněný tunel */}
            <Polyline
              positions={routeA.geometry}
              pathOptions={{
                color: '#10b981',
                weight: 24,
                opacity: 0.15,
                lineCap: 'round',
                lineJoin: 'round'
              }}
              smoothFactor={1}
              className="pointer-events-none"
            />
            {/* Spodní vrstva (casing/stín) */}
            <Polyline
              positions={routeA.geometry}
              pathOptions={{
                color: '#064e3b',
                weight: 8,
                opacity: 0.35,
                lineCap: 'round',
                lineJoin: 'round'
              }}
              smoothFactor={1}
              className="transition-all duration-300 pointer-events-none"
            />
            {/* Hlavní trasa na popředí jako výrazná smaragdová linka */}
            <Polyline
              positions={routeA.geometry}
              pathOptions={{
                color: '#34d399',
                weight: 5,
                opacity: 1.0,
                lineCap: 'round',
                lineJoin: 'round'
              }}
              smoothFactor={1}
              className="safety-fade-layer"
              eventHandlers={{
                add: (event) => event.target.bringToFront(),
                mouseover: () => onRouteProximityChange?.(null),
                mousemove: (event) => onRouteProximityChange?.([event.latlng.lat, event.latlng.lng]),
                mouseout: () => onRouteProximityChange?.(null)
              }}
            />
          </React.Fragment>
        )}

        {/* 2. Kužely zorného pole kamer v blízkosti trasy (CCTV Visual Cones) */}
        {routeCctvCones && routeCctvCones.map((cone) => (
          <React.Fragment key={`route-cctv-cone-${cone.id}`}>
            <Polygon
              positions={cone.positions}
              pathOptions={routeConeStyle}
            />
            <CircleMarker
              center={[cone.lat, cone.lng]}
              radius={4}
              pathOptions={{
                color: '#38bdf8',
                fillColor: '#38bdf8',
                fillOpacity: 0.85,
                weight: 1
              }}
            >
              <Popup className="custom-popup">
                <div className="p-1.5 text-xs bg-slate-900 text-slate-100 rounded">
                  <p className="font-bold text-sky-400 mb-0.5">📹 Městský kamerový systém (MKS)</p>
                  <p className="text-[11px] text-slate-300 m-0">{cone.description || 'Monitorovaný bezpečnostní koridor'}</p>
                </div>
              </Popup>
            </CircleMarker>
          </React.Fragment>
        ))}

        {/* 3. Ikony chráněných přechodů přímo na trase (Checkpoints) */}
        {activeRoute?.snappedCrossings && activeRoute.snappedCrossings.map((crossing) => (
          <Marker
            key={`snapped-crossing-${crossing.id}`}
            position={[crossing.lat, crossing.lng]}
            icon={(crossing.hasSignals || crossing.crossingType === 'traffic_signals') ? trafficSignalIcon : zebraCrossingIcon}
            zIndexOffset={500}
          >
            <Popup className="custom-popup">
              <div className="p-2 text-xs bg-slate-900 text-slate-100 rounded-md shadow-xl border border-slate-700">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400 border-b border-slate-700 pb-1 mb-1">
                  <span>{(crossing.hasSignals || crossing.crossingType === 'traffic_signals') ? '🚦' : '🚸'}</span>
                  <span>{(crossing.hasSignals || crossing.crossingType === 'traffic_signals') ? 'Řízený světelný přechod (semafor)' : 'Vyznačený přechod pro chodce'}</span>
                </div>
                <p className="text-[11px] text-slate-300 m-0">
                  {crossing.streetName || 'Bezpečný chráněný uzel pro přecházení komunikace'}
                </p>
                <div className="text-[10px] text-emerald-300 mt-1.5 font-semibold flex items-center gap-1">
                  <span>✓</span>
                  <span>Ověřený bezpečnostní bod na trase (Checkpoint)</span>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* 4. Stožáry veřejného osvětlení THMP podél trasy (CircleMarker r=3, žlutá/teplá záře s kuželem 18 m) */}
        {thmpLampsOnRoute && thmpLampsOnRoute.map((lamp) => (
          <React.Fragment key={`thmp-lamp-${lamp.id}`}>
            <Circle
              center={[lamp.lat, lamp.lng]}
              radius={18}
              pathOptions={{
                color: '#fef08a',
                fillColor: '#fef08a',
                fillOpacity: isNight ? 0.22 : 0.08,
                weight: 0,
                className: 'pointer-events-none'
              }}
            />
            <CircleMarker
              center={[lamp.lat, lamp.lng]}
              radius={3}
              pathOptions={{
                color: '#eab308',
                fillColor: '#fef08a',
                fillOpacity: 0.95,
                weight: 1.5,
                className: 'pointer-events-none'
              }}
            />
          </React.Fragment>
        ))}

        {/* 5. Zvýraznění úseků 'Bezpečná školní cesta' (IPR koridory) odznaky */}
        {schoolBadgesOnRoute && schoolBadgesOnRoute.map((badge) => (
          <Marker
            key={`school-corridor-badge-${badge.id}`}
            position={badge.coords}
            icon={schoolCorridorIcon}
            zIndexOffset={650}
          >
            <Popup className="custom-popup">
              <div className="p-2 text-xs bg-slate-900 text-slate-100 rounded-md shadow-xl border border-emerald-500/50">
                <div className="flex items-center gap-1.5 font-bold text-emerald-400 border-b border-slate-700 pb-1 mb-1">
                  <span>🎒</span>
                  <span>Bezpečná školní cesta (IPR Praha)</span>
                </div>
                <p className="font-semibold text-emerald-300 text-[11px] m-0 mb-0.5">{badge.schoolName}</p>
                <p className="text-[10px] text-slate-300 m-0">{badge.description}</p>
                <div className="text-[9px] text-emerald-400/90 mt-1 font-medium">
                  ✓ Garantovaný pěší koridor a Zóna 30
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Reálné bezpečnostní vrstvy - Kamery (OSM) s Clusteringem */}
        {camerasLayer}

        {/* Bezpečnostní vrstvy - Osvětlení (Lampy) */}
        {layers.lights && (reveal === 'dark' || proximityPoint) && safetyNodes.filter(n => n.type === 'light' && isNearProximity(n.coords[0], n.coords[1])).map((node) => (
          <React.Fragment key={node.id}>
            <Circle
              center={node.coords}
              radius={node.radius}
              pathOptions={{
                color: '#fde047', 
                fillColor: '#fef08a',
                fillOpacity: isNight ? 0.35 : 0.1,
                weight: 0
              }}
            />
            <CircleMarker
              center={node.coords}
              radius={2}
              pathOptions={{ color: '#ca8a04', fillColor: '#ca8a04', fillOpacity: 1, weight: 0 }}
            />
          </React.Fragment>
        ))}

        {/* SOS Body / Safe Havens */}
        {havensLayer}

        {/* Hlášené incidenty */}
        {incidentsLayer}

        {/* Tmavé úseky se objeví pouze při hoveru nad metrikou nebo trasou */}
        {darkSegmentsLayer}

        {/* Avatar Simulace */}
        {isSimulating && avatarPoint && (
          <Marker position={[avatarPoint.lat, avatarPoint.lng]} icon={avatarIcon} />
        )}

        {/* Živý marker dítěte ze vzdáleného Firebase Realtime Database */}
        {childLiveLocation && (
          <Marker
            position={[childLiveLocation.lat, childLiveLocation.lng]}
            icon={childLiveIcon}
            zIndexOffset={2000}
          >
            <Popup className="custom-popup">
              {(() => {
                const isOffline = Boolean(
                  childLiveLocation.isOffline ||
                  (childLiveLocation.lastSeen && Date.now() - childLiveLocation.lastSeen > 60000)
                );
                return (
                  <div className={`p-2 text-xs bg-slate-900 text-slate-100 rounded-md shadow-xl border ${isOffline ? 'border-slate-600' : 'border-lime-500/50'}`}>
                    <div className={`flex items-center gap-1.5 font-bold border-b border-slate-700 pb-1 mb-1 ${isOffline ? 'text-slate-300' : 'text-lime-400'}`}>
                      <span>{isOffline ? '⚠️' : '👶'}</span>
                      <span>{isOffline ? 'Dítě (Offline / Ztráta signálu)' : 'Dítě (Živý GPS signál)'}</span>
                    </div>
                    <p className="text-[11px] text-slate-300 m-0">
                      Poloha: {childLiveLocation.lat.toFixed(5)}, {childLiveLocation.lng.toFixed(5)}
                    </p>
                    <p className="text-[11px] text-slate-300 m-0 mt-0.5">
                      Stav baterie: <span className={`font-bold ${((childLiveLocation as any).battery ?? 85) <= 20 ? 'text-red-400' : 'text-emerald-400'}`}>{(childLiveLocation as any).battery ?? 85} %</span>
                    </p>
                    <div className={`text-[10px] mt-1.5 font-semibold flex items-center gap-1 ${
                      isOffline
                        ? 'text-amber-400'
                        : (childLiveLocation.inCorridor !== false ? 'text-emerald-400' : 'text-rose-400 animate-pulse')
                    }`}>
                      <span>{isOffline ? '⚠️' : (childLiveLocation.inCorridor !== false ? '✓' : '🚨')}</span>
                      <span>
                        {isOffline
                          ? 'Ztráta spojení (> 60 s)'
                          : (childLiveLocation.inCorridor !== false ? 'V bezpečnostním koridoru' : 'Odchýleno z trasy!')}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </Popup>
          </Marker>
        )}

        {/* Vektorové zóny a ulice */}
        {layers.zones && safetyContextActive && currentZoom >= 15 && (pragueVectorData.parks as SafetyZone[]).map((zone) => {
          const zoneScore = getDynamicZoneScore(zone, timeOfDay);
          let color = '#ef4444'; // Red
          if (zoneScore >= 75) color = '#10b981'; // Green
          else if (zoneScore >= 50) color = '#f59e0b'; // Yellow/Orange
          
          return (
            <Polygon
              key={zone.id}
              positions={zone.coordinates}
              pathOptions={{
                color: color,
                fillColor: color,
                fillOpacity: 0.15,
                weight: 2,
                opacity: 0.9,
                dashArray: '4, 4'
              }}
              interactive={true}
              eventHandlers={{
                mouseover: (e) => {
                  const layer = e.target;
                  layer.setStyle({ fillOpacity: 0.35 });
                },
                mouseout: (e) => {
                  const layer = e.target;
                  layer.setStyle({ fillOpacity: 0.15 });
                },
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (onMapClick) {
                    onMapClick(e.latlng.lat, e.latlng.lng, zone.name);
                  }
                }
              }}
            />
          );
        })}

        {layers.zones && safetyContextActive && currentZoom >= 15 && (pragueVectorData.streets as SafetyZone[]).map((street) => {
          const streetScore = getDynamicZoneScore(street, timeOfDay);
          let color = '#ef4444'; // Red
          if (streetScore >= 75) color = '#10b981'; // Green
          else if (streetScore >= 50) color = '#f59e0b'; // Yellow/Orange
          
          return (
            <Polyline
              key={street.id}
              positions={street.coordinates}
              pathOptions={{
                color: color,
                weight: 4,
                opacity: 0.85,
              }}
              interactive={true}
              eventHandlers={{
                mouseover: (e) => {
                  const layer = e.target;
                  layer.setStyle({ weight: 8, opacity: 1 });
                },
                mouseout: (e) => {
                  const layer = e.target;
                  layer.setStyle({ weight: 4, opacity: 0.85 });
                },
                click: (e) => {
                  L.DomEvent.stopPropagation(e);
                  if (onMapClick) {
                    onMapClick(e.latlng.lat, e.latlng.lng, street.name);
                  }
                }
              }}
            />
          );
        })}

      </MapContainer>

      {/* Skener Mapy jako fixní plovoucí panel mimo Leaflet události */}
      {scannedLocation && scannedData && (
        <div 
          className="absolute top-4 right-4 z-[9999] w-[320px] rounded-xl flex flex-col gap-3"
          style={{
            background: '#0f172a',
            backdropFilter: 'blur(12px)',
            border: '1px solid #1e293b',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            pointerEvents: 'auto',
            padding: '1rem',
          }}
        >
          <div className="flex justify-between items-start border-b border-slate-700 pb-2">
            <div>
              <h3 className="font-bold text-indigo-400 text-base flex items-center gap-2 m-0 p-0">
                <span>📡</span> Mapový Skener
              </h3>
              <p className="text-slate-300 text-xs font-medium mt-1 truncate w-48 m-0 p-0">{scannedLocation.name || 'Neznámá oblast'}</p>
            </div>
            <button onClick={onCloseScanner} className="text-slate-400 hover:text-white bg-slate-800 rounded-full w-6 h-6 flex items-center justify-center text-sm border border-slate-600 shadow-md">✕</button>
          </div>
          
          <div className="flex items-center justify-between bg-slate-800/80 p-2 rounded-lg border border-slate-700">
            <span className="text-slate-300 font-medium text-xs">Index bezpečí</span>
            <span className={`text-xl font-black m-0 p-0 ${
              scannedData.score >= 85 ? 'text-emerald-400' : 
              (scannedData.score >= 65 ? 'text-yellow-400' : 'text-rose-400')
            }`}>
              {scannedData.score} %
            </span>
          </div>

          <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
            <span className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
              scannedData.score >= 85 ? 'text-emerald-300' :
              (scannedData.score >= 65 ? 'text-yellow-300' : 'text-rose-300')
            }`}>
              {getSafetyRiskLabel(scannedData.score)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300">
            <div className="col-span-2 bg-slate-800/50 p-1.5 rounded border border-slate-700/50 flex flex-col items-center justify-center text-center gap-1">
              <span className="text-sm">🏙️</span>
              <span className="font-bold text-indigo-300">{scannedData.envType}</span>
            </div>
            <div className="bg-slate-800/50 p-1.5 rounded border border-slate-700/50 flex flex-col items-center justify-center text-center gap-1">
              <span className="text-sm">{scannedData.cameraCount > 0 ? '📹' : '👁️‍🗨️'}</span>
              <span>{scannedData.cameraCount} kamer (60m)</span>
            </div>
            <div className="bg-slate-800/50 p-1.5 rounded border border-slate-700/50 flex flex-col items-center justify-center text-center gap-1">
              <span className="text-sm">{scannedData.havenCount > 0 ? '🛡️' : '🏪'}</span>
              <span>{scannedData.havenCount} SOS (150m)</span>
            </div>
          </div>
          
          {scannedData.incidentCount > 0 && (
            <div className="mt-0.5 bg-red-900/30 border border-red-500/50 rounded-lg p-1.5 text-[10px]">
              <p className="text-red-400 font-bold mb-1 flex items-center gap-1 m-0 p-0">
                <span className="animate-pulse">⚠️</span> Varování (200m)
              </p>
              <p className="text-slate-300 m-0 p-0">{scannedData.incidentCount} incidentů.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
