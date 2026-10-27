import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Map, MapErrorBoundary, MapErrorFallback } from './Map';
import { Header } from './Header';
import { ModeSelectionModal } from './ModeSelectionModal';
import { OpenDataService, SafetyFeature } from '../lib/opendata';
import { generateParentArguments, RouteComparison } from '../lib/nlp-generator';
import { fetchOSRMRoute, RouteResult, RouteSegment, getPointAlongRoute } from '../lib/routing';
import { getDistance } from '../lib/safety-engine';
import { fetchOSMCameras, OSMSurveillanceFeature } from '../lib/osm-surveillance-harvester';
import { reverseGeocode } from '../lib/geocoding';
import { fetchOSMSafeHavens, SafeHavenFeature } from '../lib/opendata';
import polyline from '@mapbox/polyline';

import { SyncEngine, SyncMessage } from '../lib/sync-engine';
import { useAppStore } from '../store/useAppStore';
import { SafetyReveal } from '../types/safety';
import { SafeHavenButton, SafeHavenBanner } from './SafeHavenButton';
import { SafeHavenPOI } from '../data/safe-havens-poi';
import { useRouteGeofence } from '../hooks/useRouteGeofence';
import { useMotionAnomaly } from '../hooks/useMotionAnomaly';
import { MotionAnomalyModals } from './MotionAnomalyModals';
import { GeolocationPermissionModal } from './GeolocationPermissionModal';
import { SafePassModal } from './SafePassModal';

const modeLayerConfig: Record<string, { cameras: boolean; lights: boolean; havens: boolean; incidents: boolean; zones: boolean; localDataOnly: boolean }> = {
  parent: { cameras: true, lights: true, havens: true, incidents: true, zones: false, localDataOnly: true },
  night_girl: { cameras: true, lights: true, havens: true, incidents: true, zones: false, localDataOnly: true },
  child: { cameras: true, lights: true, havens: true, incidents: true, zones: false, localDataOnly: true },
};

export function ParentDashboard({ 
  isPublic = false, 
  onLoginClick, 
  onBackToMenu,
  initialProfiles = ['parent'],
  routeData: propRouteData,
  currentRouteData: propCurrentRouteData,
  currentRoute: propCurrentRoute,
  onRouteCalculated: propOnRouteCalculated
}: { 
  isPublic?: boolean; 
  onLoginClick?: () => void; 
  onBackToMenu?: () => void; 
  initialProfiles?: string[]; 
  routeData?: any;
  currentRouteData?: any;
  currentRoute?: any;
  onRouteCalculated?: (route: any) => void;
}) {
  const [internalRoute, setInternalRoute] = useState<any>(null);
  const currentRouteData = propRouteData ?? propCurrentRouteData ?? propCurrentRoute ?? internalRoute;
  const currentRoute = currentRouteData;
  const setCurrentRouteData = (route: any) => {
    setInternalRoute(route);
    propOnRouteCalculated?.(route);
  };
  const setCurrentRoute = setCurrentRouteData;

  const activeMode = useAppStore((state) => state.activeMode);
  const setActiveMode = useAppStore((state) => state.setActiveMode);
  const pairedChildCode = useAppStore((state) => state.pairedChildCode);
  const [isSafePassModalOpen, setIsSafePassModalOpen] = useState(false);
  const [showPwaTip, setShowPwaTip] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('safepath_pwa_tip_dismissed') !== 'true';
  });
  const [layers, setLayers] = useState({ cameras: true, lights: false, havens: false, incidents: true, zones: false, localDataOnly: true });
  
  // Bezpečnostní prvky
  const [safetyNodes, setSafetyNodes] = useState<SafetyFeature[]>([]); // Osvětlení (mock)
  const [osmCameras, setOsmCameras] = useState<OSMSurveillanceFeature[]>([]); // Reálné kamery
  const [safeHavens, setSafeHavens] = useState<SafeHavenFeature[]>([]); // Policie, Hasiči, Lékárny

  const [argumentsText, setArgumentsText] = useState<string[]>([]);
  
  // Přidáno pro Parent Dashboard sync
  const [pairingPin, setPairingPin] = useState<string | null>(null);
  const [isPaired, setIsPaired] = useState(false);
  const [sosAlert, setSosAlert] = useState<{ active: boolean, location: [number, number] | null }>({ active: false, location: null });

  useEffect(() => {
    SyncEngine.init();
    const unsubscribe = SyncEngine.subscribe((msg: SyncMessage) => {
      if (msg.type === 'PAIRING_SUCCESS') {
        setIsPaired(true);
      } else if (msg.type === 'SOS_ALERT' || msg.type === 'DEVIATION_ALERT') {
        setSosAlert({ active: true, location: msg.payload.location });
      } else if (msg.type === 'TOGGLE_SIMULATION') {
        setIsSimulating((prev) => {
          if (!prev) {
            setSimulationProgress(0);
            setChildDeviation(null);
            setDeviationTimer(0);
            setChildStatus('ON_ROUTE');
            return true;
          }
          return false;
        });
      }
    });
    return () => {
      unsubscribe();
      SyncEngine.destroy();
    };
  }, []);

  const handleGeneratePin = () => {
    const pin = SyncEngine.generatePin();
    setPairingPin(pin);
  };
  const [loading, setLoading] = useState(true);
  const [isRoutingLoading, setIsRoutingLoading] = useState(false);
  const [routingError, setRoutingError] = useState<string | null>(null);

  // Nové stavy pro V2
  const [timeOfDay, setTimeOfDay] = useState<number>(new Date().getHours()); // Default na aktuální čas
  
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOfDay(new Date().getHours());
    }, 60000); // Kontrola každou minutu
    return () => clearInterval(interval);
  }, []);

  const [startPoint, setStartPoint] = useState<{lat: number, lng: number, name: string} | null>(null);
  const [endPoint, setEndPoint] = useState<{lat: number, lng: number, name: string} | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  
  // Živé GPS sledování polohy uživatele (Google Maps styl)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; accuracy: number; heading?: number | null; speed?: number | null } | null>(null);
  const [isTrackingLocation, setIsTrackingLocation] = useState<boolean>(false);
  const [recenterTrigger, setRecenterTrigger] = useState<{ coords: [number, number]; timestamp: number } | null>(null);
  const [locationPermissionDenied, setLocationPermissionDenied] = useState<boolean>(false);
  const [showPermissionModal, setShowPermissionModal] = useState<boolean>(false);
  const [isRetryingLocation, setIsRetryingLocation] = useState<boolean>(false);

  // Mobilní vizuální toast notifikace (Start/Cíl)
  const [mapToast, setMapToast] = useState<{ message: string; type?: 'info' | 'success'; id: number } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showMapToast = (message: string, type: 'info' | 'success' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const id = Date.now();
    setMapToast({ message, type, id });
    toastTimerRef.current = setTimeout(() => {
      setMapToast(prev => (prev?.id === id ? null : prev));
    }, 3500);
  };

  // Aktivní sledování GPS v reálném čase s ochranou proti zbytečnému re-routování (40m guard)
  useEffect(() => {
    if (!navigator.geolocation) return;

    let hasCenteredInitially = false;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy, heading, speed } = position.coords;
        const newLoc = { 
          lat, 
          lng, 
          accuracy: accuracy || 20,
          heading: typeof heading === 'number' && !isNaN(heading) ? heading : null,
          speed: typeof speed === 'number' && !isNaN(speed) ? speed : null
        };
        setUserLocation(newLoc);
        setIsTrackingLocation(true);
        setLocationPermissionDenied(false);

        // 1. One-Tap Routing: Nastav startPoint automaticky, pokud ještě není žádný vybrán
        setStartPoint(prev => {
          if (!prev) {
            return { lat, lng, name: 'Moje aktuální poloha' };
          }
          // 2. Rerouting guard: Pokud navigujeme od GPS a uživatel se posunul o > 40 m
          if (prev.name === 'Moje aktuální poloha') {
            const dist = getDistance(prev.lat, prev.lng, lat, lng);
            if (dist > 40) {
              return { lat, lng, name: 'Moje aktuální poloha' };
            }
          }
          return prev;
        });

        // Úvodní vycentrování na uživatele při prvním zachycení signálu
        if (!hasCenteredInitially) {
          hasCenteredInitially = true;
          setMapCenter([lat, lng]);
        }
      },
      (err) => {
        console.warn('Geolocation watch error:', err);
        if (err.code === 1 || err.code === (err as any).PERMISSION_DENIED) {
          setLocationPermissionDenied(true);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  const handleRecenterGps = () => {
    if (userLocation) {
      setRecenterTrigger({ coords: [userLocation.lat, userLocation.lng], timestamp: Date.now() });
      showMapToast('Zaměřeno na vaši aktuální polohu', 'info');
      if (!startPoint) {
        setStartPoint({ lat: userLocation.lat, lng: userLocation.lng, name: 'Moje aktuální poloha' });
      }
    } else {
      if (!navigator.geolocation) {
        showMapToast('Váš prohlížeč nepodporuje geolokaci GPS.', 'info');
        return;
      }
      showMapToast('Vyhledávám GPS satelity...', 'info');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lng, accuracy, heading, speed } = pos.coords;
          const loc = { 
            lat, 
            lng, 
            accuracy: accuracy || 20,
            heading: typeof heading === 'number' && !isNaN(heading) ? heading : null,
            speed: typeof speed === 'number' && !isNaN(speed) ? speed : null
          };
          setUserLocation(loc);
          setIsTrackingLocation(true);
          setLocationPermissionDenied(false);
          setRecenterTrigger({ coords: [lat, lng], timestamp: Date.now() });
          if (!startPoint) {
            setStartPoint({ lat, lng, name: 'Moje aktuální poloha' });
          }
          showMapToast('GPS poloha zaměřena', 'success');
        },
        (err) => {
          console.warn('Geolocation error:', err);
          if (err.code === 1 || err.code === (err as any).PERMISSION_DENIED) {
            setLocationPermissionDenied(true);
            setShowPermissionModal(true);
          } else {
            showMapToast('Nepodařilo se získat GPS polohu.', 'info');
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
      );
    }
  };

  const handleRetryLocation = () => {
    if (!navigator.geolocation) {
      showMapToast('Váš prohlížeč nepodporuje geolokaci GPS.', 'info');
      return;
    }
    setIsRetryingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy, heading, speed } = pos.coords;
        const loc = { 
          lat, 
          lng, 
          accuracy: accuracy || 20,
          heading: typeof heading === 'number' && !isNaN(heading) ? heading : null,
          speed: typeof speed === 'number' && !isNaN(speed) ? speed : null
        };
        setUserLocation(loc);
        setIsTrackingLocation(true);
        setLocationPermissionDenied(false);
        setShowPermissionModal(false);
        setIsRetryingLocation(false);
        setRecenterTrigger({ coords: [lat, lng], timestamp: Date.now() });
        setMapCenter([lat, lng]);
        setStartPoint(prev => {
          if (!prev || prev.name === 'Moje aktuální poloha') {
            return { lat, lng, name: 'Moje aktuální poloha' };
          }
          return prev;
        });
        showMapToast('GPS poloha zaměřena', 'success');
      },
      (err) => {
        setIsRetryingLocation(false);
        console.warn('Geolocation retry error:', err);
        if (err.code === 1 || err.code === (err as any).PERMISSION_DENIED) {
          setLocationPermissionDenied(true);
          showMapToast('Poloha je stále zablokována. Povolte ji v nastavení prohlížeče.', 'info');
        } else {
          showMapToast('Nepodařilo se zaměřit signál GPS. Zkuste to prosím znovu.', 'info');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };
  
  const [routeA, setRouteA] = useState<RouteResult | null>(null);
  const [routeB, setRouteB] = useState<RouteResult | null>(null);
  const [routeC, setRouteC] = useState<RouteResult | null>(null);
  const [fastestRoute, setFastestRoute] = useState<RouteResult | null>(null);
  const [showFastestRoute, setShowFastestRoute] = useState<boolean>(false);
  const [selectedRoute, setSelectedRoute] = useState<'A' | 'B' | 'C'>('A');
  const [safetyReveal, setSafetyReveal] = useState<SafetyReveal | null>(null);
  const [routeProximityPoint, setRouteProximityPoint] = useState<[number, number] | null>(null);

  // Kompletní odstranění visícího výběrového toastu/banneru, jakmile existuje Start i Cíl nebo vypočtená trasa
  useEffect(() => {
    if ((startPoint && endPoint) || currentRoute || routeA) {
      setMapToast(prev => {
        if (prev?.message?.includes('nastaven') || prev?.message?.includes('Zvolte start')) {
          return null;
        }
        return prev;
      });
    }
  }, [startPoint, endPoint, currentRoute, routeA]);

  // Bezpečné zastávky (Geofencing)
  const [safeStops, setSafeStops] = useState<{lat: number, lng: number, name: string}[]>([]);
  const [childStatus, setChildStatus] = useState<'ON_ROUTE' | 'AT_SAFE_STOP' | 'DEVIATED' | 'ALERT'>('ON_ROUTE');

  // Simulace a Profil
  const [activeProfiles, setActiveProfiles] = useState<string[]>(initialProfiles);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showModeSelectionModal, setShowModeSelectionModal] = useState(false);
  const [tempProfiles, setTempProfiles] = useState<string[]>(initialProfiles);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(0);

  useEffect(() => {
    const normalizedMode = activeMode && ['parent', 'night_girl', 'child'].includes(activeMode) ? activeMode : 'parent';
    const modeProfile = [normalizedMode];
    setActiveProfiles(modeProfile);
    setTempProfiles(modeProfile);
    setActiveMode(normalizedMode);
    setLayers(prev => ({ ...prev, ...(modeLayerConfig[normalizedMode] || modeLayerConfig.parent) }));
  }, [activeMode, setActiveMode]);

  // Map Scanner
  const [scannedLocation, setScannedLocation] = useState<{lat: number, lng: number, name: string} | null>(null);

  // 1. Inicializace dat (Mock Osvětlení + Reálné OSM Kamery)
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Načteme mockovaná OpenData (pro lampy)
        const service = new OpenDataService();
        const bbox = { minLat: 50.00, maxLat: 50.15, minLng: 14.30, maxLng: 14.50 };
        const data = await service.getSafetyFeatures(bbox);
        
        // Ponecháme pouze lampy, kamery zahodíme
        const lightsOnly = data.features.filter(f => f.type === 'light');
        setSafetyNodes(lightsOnly);

        // Nyní stáhneme skutečné kamery z OSM pro celou Prahu
        const cameras = await fetchOSMCameras();
        setOsmCameras(cameras);

        // Nyní stáhneme Safe Havens
        const havens = await fetchOSMSafeHavens(bbox);
        setSafeHavens(havens);

      } catch (err) {
        console.error('Chyba při inicializaci:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Reference na aktuální bezpečnostní data (zabraňuje zbytečnému re-routování a problikávání při doběhnutí background fetchů)
  const safetyDataRef = useRef({ safetyNodes, osmCameras, safeHavens });
  useEffect(() => {
    safetyDataRef.current = { safetyNodes, osmCameras, safeHavens };
  }, [safetyNodes, osmCameras, safeHavens]);

  // Klíče souřadnic pro stabilní spouštění výpočtu trasy (reverzní geokódování textu nemění souřadnice a nespouští zbytečné refreshe)
  const startCoordKey = startPoint ? `${startPoint.lat.toFixed(5)},${startPoint.lng.toFixed(5)}` : '';
  const endCoordKey = endPoint ? `${endPoint.lat.toFixed(5)},${endPoint.lng.toFixed(5)}` : '';

  // 2. Načtení trasy přes OSRM s debouncingem a eliminací problikávání
  useEffect(() => {
    if (!startPoint || !endPoint) {
      setRouteA(null);
      setRouteB(null);
      setRouteC(null);
      setFastestRoute(null);
      setSafeStops([]);
      setCurrentRoute(null);
      return;
    }

    let isCurrentRequest = true;
    setIsRoutingLoading(true);

    const debounceTimer = setTimeout(async () => {
      try {
        setRoutingError(null);

        const { safetyNodes: sNodes, osmCameras: oCams, safeHavens: sHavens } = safetyDataRef.current;

        const combinedSafetyNodes = [
          ...sNodes,
          ...oCams.map(c => ({
            id: c.id.toString(),
            type: 'camera' as const,
            coords: [c.lat, c.lng] as [number, number],
            radius: c.rangeMeters,
            active_night: true
          })),
          ...sHavens.map(h => ({
            id: h.id.toString(),
            type: 'haven' as const,
            coords: [h.lat, h.lng] as [number, number],
            radius: 100,
            active_night: h.is247
          }))
        ];

        const isChildMode = activeMode === 'child' || activeMode === 'parent' || activeProfiles.includes('child') || activeProfiles.includes('parent');

        const { routeA: rA, fastestRoute: fR } = await fetchOSRMRoute(
          startPoint.lat, startPoint.lng,
          endPoint.lat, endPoint.lng,
          combinedSafetyNodes,
          timeOfDay,
          activeProfiles,
          activeMode
        );

        if (!isCurrentRequest) return;
        setRouteA(rA);
        const rACoords = Array.isArray(rA?.geometry)
          ? rA.geometry
          : (typeof rA?.geometry === 'string' ? polyline.decode(rA.geometry).map(([lat, lng]) => [lat, lng]) : []);
        setCurrentRoute({
          ...rA,
          coordinates: rACoords,
          distance: rA?.distance,
          duration: rA?.duration
        });
        if (rA?.infoPoints && rA.infoPoints.length > 0) {
          setSafeStops(rA.infoPoints.map(p => ({ lat: p.lat, lng: p.lng, name: p.name })));
        } else {
          setSafeStops([]);
        }
        setRouteB(null);
        setRouteC(null);
        setFastestRoute(fR || null);
        setSelectedRoute('A');
        setArgumentsText(generateParentArguments({ safeRoute: rA.metrics }, isChildMode));
      } catch (err) {
        if (!isCurrentRequest) return;
        console.error('Chyba routingu:', err);
        const message = err instanceof Error && err.name === 'AbortError'
          ? 'Výpočet trasy trval příliš dlouho. Zkuste body posunout blíže ke komunikaci.'
          : (err instanceof Error ? err.message : 'Nelze nalézt cestu po komunikacích. Zkuste body posunout blíže ke komunikaci.');
        setRoutingError(message);
      } finally {
        if (isCurrentRequest) {
          setLoading(false);
          setIsRoutingLoading(false);
        }
      }
    }, 180);

    return () => {
      isCurrentRequest = false;
      clearTimeout(debounceTimer);
    };
  }, [startCoordKey, endCoordKey, timeOfDay, activeMode, activeProfiles]);

  // Generování argumentace AI pro doporučenou bezpečnou trasu
  useEffect(() => {
    if (!routeA) {
      setArgumentsText([]);
      return;
    }
    const isChild = activeMode === 'child' || activeMode === 'parent' || activeProfiles.includes('child') || activeProfiles.includes('parent');
    setArgumentsText(generateParentArguments({ safeRoute: routeA.metrics }, isChild));
  }, [routeA, activeMode, activeProfiles]);

  const toggleLayer = (layer: 'cameras' | 'lights' | 'havens' | 'incidents' | 'zones' | 'localDataOnly') => {
    setLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  const handleSelectStart = (lat: number, lng: number, name: string) => {
    setStartPoint({lat, lng, name});
    setMapCenter([lat, lng]);
  };

  const handleSelectEnd = (lat: number, lng: number, name: string) => {
    setEndPoint({lat, lng, name});
    if (!startPoint) {
      setMapCenter([lat, lng]);
      if (locationPermissionDenied || !userLocation) {
        showMapToast('Cíl nastaven. Zvolte start klepnutím do mapy', 'info');
      }
    }
  };

  const [childDeviation, setChildDeviation] = useState<{lat: number, lng: number} | null>(null);
  const [deviationTimer, setDeviationTimer] = useState<number>(0);
  const [activeSafeHaven, setActiveSafeHaven] = useState<{ haven: SafeHavenPOI; distance: number } | null>(null);

  const handleNavigateToHaven = (haven: SafeHavenPOI, distanceMeters: number) => {
    setActiveSafeHaven({ haven, distance: distanceMeters });
    if (!startPoint) {
      setStartPoint({ lat: 50.0755, lng: 14.4378, name: 'Výchozí poloha (Praha 2)' });
      setMapCenter([50.0755, 14.4378]);
    }
    setEndPoint({
      lat: haven.coords[0],
      lng: haven.coords[1],
      name: `${haven.name} (${haven.address})`
    });
    setSelectedRoute('A');
  };

  const handleCancelHaven = () => {
    setActiveSafeHaven(null);
  };

  const simulatedLocation = React.useMemo(() => {
    if (childDeviation) return childDeviation;
    if (isSimulating && routeA) {
      const pt = getPointAlongRoute(routeA.segments, simulationProgress);
      if (pt) return { lat: pt[0], lng: pt[1] };
    }
    return startPoint ? { lat: startPoint.lat, lng: startPoint.lng } : null;
  }, [childDeviation, isSimulating, routeA, simulationProgress, startPoint]);

  const activeGeometry = React.useMemo(() => {
    return selectedRoute === 'A' ? routeA?.geometry : selectedRoute === 'B' ? routeB?.geometry : routeC?.geometry;
  }, [selectedRoute, routeA?.geometry, routeB?.geometry, routeC?.geometry]);

  const geofence = useRouteGeofence(simulatedLocation, activeGeometry ?? null, {
    corridorMeters: 35,
    warningThresholdSec: 15,
    alertThresholdSec: 45,
    enabled: isSimulating || Boolean(activeGeometry),
    safeStops
  });

  const motionAnomaly = useMotionAnomaly({
    enabled: true,
    currentLocation: simulatedLocation,
    activeMode: activeMode as any,
    isNight: timeOfDay >= 18 || timeOfDay <= 6,
    cameras: osmCameras
  });

  const formatCoordinateLabel = (lat: number, lng: number) => `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  const applyInstantPoint = (kind: 'start' | 'end', lat: number, lng: number, fallbackName?: string) => {
    const coordinateName = fallbackName || formatCoordinateLabel(lat, lng);
    const patch = { lat, lng, name: coordinateName };

    if (kind === 'start') {
      setStartPoint(prev => {
        const next = prev && prev.lat === lat && prev.lng === lng ? prev : patch;
        return next;
      });
      reverseGeocode(lat, lng)
        .then(resolved => {
          setStartPoint(prev => {
            if (!prev || prev.lat !== lat || prev.lng !== lng) return prev;
            return { ...prev, name: resolved || coordinateName };
          });
        })
        .catch(() => undefined);
      return;
    }

    setEndPoint(prev => {
      const next = prev && prev.lat === lat && prev.lng === lng ? prev : patch;
      return next;
    });
    reverseGeocode(lat, lng)
      .then(resolved => {
        setEndPoint(prev => {
          if (!prev || prev.lat !== lat || prev.lng !== lng) return prev;
          return { ...prev, name: resolved || coordinateName };
        });
      })
      .catch(() => undefined);
  };

  const handleMapClick = async (lat: number, lng: number, name?: string) => {
    try {
      if (isSimulating) {
        setChildDeviation({ lat, lng });
        return;
      }

      // One-Tap Routing: Pokud máme živou polohu uživatele a startPoint ještě nebyl inicializován
      let effectiveStart = startPoint;
      if (!effectiveStart && userLocation && !locationPermissionDenied) {
        effectiveStart = { lat: userLocation.lat, lng: userLocation.lng, name: 'Moje aktuální poloha' };
        setStartPoint(effectiveStart);
      }

      if (!effectiveStart) {
        applyInstantPoint('start', lat, lng, name);
        setSelectedRoute('A');
        showMapToast('Start nastaven. Nyní klepněte na cíl.', 'success');
        return;
      } else if (!endPoint) {
        // Jediné klepnutí rovnou nastaví CÍL a spustí navigaci od aktuální polohy!
        applyInstantPoint('end', lat, lng, name);
        setSelectedRoute('A');
        if (locationPermissionDenied || !userLocation) {
          showMapToast('Cíl nastaven. Zvolte start klepnutím do mapy', 'info');
        } else {
          showMapToast('Cíl nastaven. Počítám bezpečnou trasu z vaší polohy...', 'success');
        }
        return;
      } else {
        // Pokud navigujeme od GPS polohy, klepnutí do mapy změní cíl; v manuálním režimu resetuje trasu
        if (effectiveStart.name === 'Moje aktuální poloha' && userLocation && !locationPermissionDenied) {
          applyInstantPoint('end', lat, lng, name);
          setSelectedRoute('A');
          showMapToast('Cíl aktualizován. Přepočítávám trasu...', 'success');
        } else {
          // Třetí klik nastaví nový start a resetuje trasu
          applyInstantPoint('start', lat, lng, name);
          setEndPoint(null);
          setRouteA(null);
          setRouteB(null);
          setRouteC(null);
          setFastestRoute(null);
          setSelectedRoute('A');
          showMapToast('Start nastaven. Nyní klepněte na cíl.', 'success');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMapDoubleClick = async (lat: number, lng: number) => {
    try {
      const addressName = await reverseGeocode(lat, lng);
      const fallbackName = addressName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

      if (!startPoint) {
        setStartPoint({ lat, lng, name: fallbackName });
      } else if (!endPoint) {
        setEndPoint({ lat, lng, name: fallbackName });
      } else {
        setStartPoint({ lat, lng, name: fallbackName });
        setEndPoint(null);
        setRouteA(null);
        setRouteB(null);
        setRouteC(null);
        setFastestRoute(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectProfiles = (profiles: string[]) => {
    setActiveProfiles(profiles);
    const newMode = profiles.includes('night_girl') ? 'night_girl' : (profiles.includes('child') ? 'child' : 'parent');
    setActiveMode(newMode);
    
    // Záměrně nevyplňujeme Start, čekáme na kliknutí do mapy nebo vyhledávání
    setStartPoint(null);
    setRouteA(null);
    setRouteB(null);
    setRouteC(null);
    setFastestRoute(null);
    setSelectedRoute('A');
    setIsSimulating(false);
    setSimulationProgress(0);
  };

  const toggleTempProfile = (profile: string) => {
    setTempProfiles(prev => {
      if (prev.includes(profile)) {
        // Zabráníme odznačení poslední volby, vždy musí být aspoň 1 vybraná
        if (prev.length === 1) return prev;
        return prev.filter(p => p !== profile);
      }
      return [...prev, profile];
    });
  };

  const handleToggleSimulation = () => {
    if (!routeA) return;
    if (isSimulating) {
      setIsSimulating(false);
      setChildDeviation(null);
      setDeviationTimer(0);
      setChildStatus('ON_ROUTE');
    } else {
      setSimulationProgress(0);
      setChildDeviation(null);
      setDeviationTimer(0);
      setChildStatus('ON_ROUTE');
      setIsSimulating(true);
    }
  };

  const safeStopsRef = useRef(safeStops);
  safeStopsRef.current = safeStops;
  const childStatusRef = useRef(childStatus);
  childStatusRef.current = childStatus;

  useEffect(() => {
    let interval: any;
    if (isSimulating && routeA) {
      interval = setInterval(() => {
        setSimulationProgress(p => {
          if (p >= 1) {
            setIsSimulating(false);
            setChildDeviation(null);
            setChildStatus('ON_ROUTE');
            return 1;
          }
          return p + 0.005; // Přidá 0.5% každých 100ms
        });
        
        setChildDeviation(prevDev => {
          setDeviationTimer(prevTimer => {
            const isDeviated = prevDev !== null;
            if (isDeviated) {
               // Zkontrolujeme, jestli není na povolené zastávce
               const inSafeStop = safeStopsRef.current.some(stop => getDistance(stop.lat, stop.lng, prevDev.lat, prevDev.lng) <= 75);
               if (inSafeStop) {
                 setChildStatus('AT_SAFE_STOP');
                 return 0; // timer se resetuje
               } else {
                 setChildStatus('DEVIATED');
                 const newTimer = prevTimer + 0.1; // interval je 100ms = 0.1s
                 if (newTimer >= 120 && childStatusRef.current !== 'ALERT') { // 2 minuty timeout
                    setChildStatus('ALERT');
                    setSosAlert({ active: true, location: [prevDev.lat, prevDev.lng] });
                 }
                 return newTimer;
               }
            } else {
               setChildStatus('ON_ROUTE');
               return 0;
            }
          });
          return prevDev;
        });

      }, 100);
    }
    return () => clearInterval(interval);
  }, [isSimulating, routeA]);

  if (loading && safetyNodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen w-full bg-slate-900 text-emerald-500">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen min-h-[100dvh] max-h-[100dvh] w-full max-w-[100vw] bg-slate-900 overflow-hidden relative">
      {/* SOS ALERT MODAL */}
      <AnimatePresence>
        {sosAlert.active && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-red-900/90 flex flex-col items-center justify-center backdrop-blur-md"
          >
            <div className="text-center p-8 bg-black/50 rounded-3xl border-4 border-red-500 shadow-[0_0_100px_rgba(239,68,68,0.8)]">
              <span className="text-8xl animate-bounce block mb-6">⚠️</span>
              <h1 className="text-5xl font-black text-white mb-4">SOS ALARM</h1>
              <p className="text-xl text-red-200 mb-8">Dítě spustilo nouzový protokol!</p>
              <button 
                onClick={() => { setSosAlert({active: false, location: null}); setMapCenter(sosAlert.location || [50.0755, 14.4378]); }}
                className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl text-xl"
              >
                Zobrazit polohu na mapě
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PROFILE SELECTOR MODAL */}
      <AnimatePresence>
        {showProfileModal && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-slate-900/80 flex flex-col items-center justify-center backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="bg-slate-800 w-full max-w-3xl rounded-3xl shadow-2xl border border-slate-700 p-6 md:p-8 flex flex-col max-h-screen"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Vyberte režim aplikace</h2>
                <button onClick={() => setShowProfileModal(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 overflow-y-auto pr-2">
                
                <div 
                  onClick={() => toggleTempProfile('parent')}
                  className={`cursor-pointer rounded-2xl p-5 border-2 transition-all ${tempProfiles.includes('parent') ? 'border-emerald-500 bg-emerald-900/30' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-3xl">👨‍👧</div>
                    <h3 className="font-bold text-lg text-white">Cesta pro malé děti</h3>
                    {tempProfiles.includes('parent') && <span className="ml-auto w-5 h-5 rounded-md bg-emerald-500 flex items-center justify-center shadow-[0_0_10px_rgba(16,185,129,0.8)]"><span className="text-white text-xs">✓</span></span>}
                    {!tempProfiles.includes('parent') && <span className="ml-auto w-5 h-5 rounded-md border-2 border-slate-500"></span>}
                  </div>
                  <p className="text-sm text-slate-300">Rodičovský režim: Zvýšená ochrana a dohled, vysoké pokrytí MKS kamerami, priorita řízených přechodů se semafory, vynechání rizikových zón.</p>
                </div>

                <div 
                  onClick={() => toggleTempProfile('night_girl')}
                  className={`cursor-pointer rounded-2xl p-5 border-2 transition-all ${tempProfiles.includes('night_girl') ? 'border-purple-500 bg-purple-900/30' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-3xl">🌙</div>
                    <h3 className="font-bold text-lg text-white">Dívky 14+</h3>
                    {tempProfiles.includes('night_girl') && <span className="ml-auto w-5 h-5 rounded-md bg-purple-500 flex items-center justify-center shadow-[0_0_10px_rgba(168,85,247,0.8)]"><span className="text-white text-xs">✓</span></span>}
                    {!tempProfiles.includes('night_girl') && <span className="ml-auto w-5 h-5 rounded-md border-2 border-slate-500"></span>}
                  </div>
                  <p className="text-sm text-slate-300">Noční bezpečný režim: Dobře osvětlené ulice a živé třídy, aktivní podniky v okolí. Vyhýbá se tmavým parkům a podchodům.</p>
                </div>

              </div>

              <button 
                onClick={() => { handleSelectProfiles(tempProfiles); setShowProfileModal(false); }}
                className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-lg shadow-lg transition-colors"
              >
                Aplikovat režim
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Sidebar - Na mobilu fixed bottom sheet, na desktopu pevný panel vlevo */}
      <div className="md:relative fixed inset-x-0 bottom-0 z-20 w-full md:w-96 md:max-w-md pointer-events-none md:pointer-events-auto flex flex-col justify-end md:justify-start md:h-full h-auto">
        <Sidebar 
          startPointName={startPoint ? startPoint.name : ''}
          endPointName={endPoint ? endPoint.name : ''}
          onSelectStart={handleSelectStart}
          onSelectEnd={handleSelectEnd}
          selectedRoute={selectedRoute}
          onSelectRoute={(route) => { 
            setSelectedRoute(route); 
            setSafetyReveal(null); 
            setRouteProximityPoint(null); 
            const active = route === 'A' ? routeA : route === 'B' ? routeB : routeC;
            setCurrentRoute(active);
          }}
          routeA={routeA}
          routeB={routeB}
          routeC={routeC}
          fastestRoute={fastestRoute}
          showFastestRoute={showFastestRoute}
          onToggleFastestRoute={() => setShowFastestRoute(prev => !prev)}
          argumentsText={argumentsText}
          layers={layers}
          onToggleLayer={toggleLayer}
          timeOfDay={timeOfDay}
          onChangeTime={setTimeOfDay}
          onSelectProfile={(p: string) => handleSelectProfiles([p])}
          safeHavens={safeHavens}
          isSimulating={isSimulating}
          onToggleSimulation={handleToggleSimulation}
          activeProfiles={activeProfiles}
          activeMode={activeMode}
          onMetricHover={setSafetyReveal}
          onRouteCalculated={(route) => {
            console.log('App received route:', route);
            setCurrentRouteData(route);
          }}
          isRoutingLoading={isRoutingLoading}
          routingError={routingError}
          userLocation={userLocation}
          onRecenterGps={handleRecenterGps}
        />
      </div>
      
      {/* Mapa - Na mobilu fixní pozadí přes celou obrazovku, na desktopu zabírá zbytek (flex-1) */}
      <div 
        id="map" 
        className="fixed inset-0 md:relative md:flex-1 z-0 w-full h-full pointer-events-auto"
        style={{ touchAction: 'pan-x pan-y' }}
      >
        {/* JEDNOTNÝ KONTEJNER PRO NOTIFIKACE A TOASTY (Centrovaně nahoře, bez kolize s přepínačem režimu a tlačítkem Zpět) */}
        <div 
          className="fixed z-[2500] pointer-events-none flex flex-col items-center gap-2 max-w-[calc(100vw-1.5rem)] md:max-w-md w-full"
          style={{ top: 'calc(0.75rem + env(safe-area-inset-top, 0px))', left: '50%', transform: 'translateX(-50%)' }}
        >
          {/* 1. Karta pro odblokování GPS při PERMISSION_DENIED */}
          <AnimatePresence>
            {locationPermissionDenied && !userLocation && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="w-full flex justify-center pointer-events-auto"
              >
                <div 
                  onClick={() => setShowPermissionModal(true)}
                  className="bg-slate-900/95 border-2 border-amber-500/90 hover:border-amber-400 text-white px-4 py-2.5 rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.6),0_0_15px_rgba(245,158,11,0.3)] backdrop-blur-md flex items-center justify-between gap-3 cursor-pointer group transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-3 w-3 relative shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                    </span>
                    <span className="text-xs md:text-sm font-bold tracking-wide text-amber-300 group-hover:text-amber-200">
                      Poloha je zablokována. Klepněte pro návod k odblokování.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetryLocation();
                      }}
                      disabled={isRetryingLocation}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 hover:text-white border border-amber-500/40 text-xs font-bold transition-colors flex items-center gap-1 active:scale-95"
                    >
                      {isRetryingLocation ? (
                        <span className="animate-spin text-xs">⟳</span>
                      ) : (
                        <span className="text-xs">⟳</span>
                      )}
                      <span>Zkusit znovu</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocationPermissionDenied(false);
                      }}
                      className="text-slate-400 hover:text-white text-xs px-1 font-bold transition-colors"
                      aria-label="Zavřít"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 2. Horní lišta Toast (Auto-dismiss po 3.5 sekundách) */}
          <AnimatePresence>
            {mapToast && !(
              ((startPoint && endPoint) || currentRoute || routeA) &&
              (mapToast.message.includes('nastaven') || mapToast.message.includes('Zvolte start'))
            ) && (
              <motion.div
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.95 }}
                transition={{ duration: 0.25 }}
                className="w-full flex justify-center pointer-events-auto"
              >
                <div className="bg-slate-900/95 border-2 border-emerald-500/90 text-white px-5 py-2.5 rounded-2xl shadow-[0_10px_25px_rgba(0,0,0,0.6),0_0_15px_rgba(16,185,129,0.3)] backdrop-blur-md flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-2.5 w-2.5 relative shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs md:text-sm font-bold tracking-wide text-emerald-300">
                      {mapToast.message}
                    </span>
                  </div>
                  <button
                    onClick={() => setMapToast(null)}
                    className="text-slate-400 hover:text-white text-xs px-1 font-bold ml-1 transition-colors"
                    aria-label="Zavřít oznámení"
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 3. Child Status Banner */}
          {isSimulating && (
            <div className="pointer-events-auto flex flex-col items-center">
              <div className={`px-5 py-2.5 rounded-2xl shadow-2xl border font-bold text-xs md:text-sm flex items-center gap-2.5 backdrop-blur-md transition-colors duration-500
                ${childStatus === 'ON_ROUTE' ? 'bg-emerald-900/90 text-emerald-300 border-emerald-500 shadow-emerald-500/20' : ''}
                ${childStatus === 'AT_SAFE_STOP' ? 'bg-blue-900/90 text-blue-300 border-blue-500 shadow-blue-500/20' : ''}
                ${childStatus === 'DEVIATED' ? 'bg-amber-900/90 text-amber-300 border-amber-500 shadow-amber-500/20' : ''}
                ${childStatus === 'ALERT' ? 'bg-red-900/90 text-red-100 border-red-500 shadow-red-500/50 animate-pulse' : ''}
              `}>
                {childStatus === 'ON_ROUTE' && <><span className="text-lg">✅</span> Na bezpečné trase</>}
                {childStatus === 'AT_SAFE_STOP' && <><span className="text-lg">☕</span> Na povolené zastávce (Tichý stav)</>}
                {childStatus === 'DEVIATED' && <><span className="text-lg">⚠️</span> Opuštění trasy ({Math.max(0, 120 - Math.floor(deviationTimer))}s do poplachu)</>}
                {childStatus === 'ALERT' && <><span className="text-lg">🚨</span> ZÁVAŽNÁ ODCHYLKA! ALARM!</>}
              </div>
            </div>
          )}
        </div>

        {/* Záhlaví a přepínač režimů: Mobilní šipka Zpět / Desktopová lišta */}
        <Header 
          activeProfiles={activeProfiles}
          onOpenModeModal={() => { setTempProfiles(activeProfiles); setShowProfileModal(true); }}
          onOpenSafePass={() => setIsSafePassModalOpen(true)}
          onBackToMenu={() => {
            if (onBackToMenu) {
              onBackToMenu();
            } else if (onLoginClick) {
              onLoginClick();
            } else {
              setShowModeSelectionModal(true);
            }
          }}
        />

        {isRoutingLoading && startPoint && endPoint && (
           <div className={`absolute right-4 z-50 bg-slate-900/80 px-4 py-2 rounded-full text-emerald-400 text-xs font-bold animate-pulse border border-emerald-500 ${isPublic ? 'top-20' : 'top-4'}`}>
             Počítám bezpečnou trasu...
           </div>
        )}
        {routingError && (
          <div className={`absolute right-4 z-50 max-w-sm bg-red-950/95 px-4 py-3 rounded-xl text-red-200 text-sm font-semibold border border-red-500 shadow-xl ${isPublic ? 'top-32' : 'top-16'}`}>
            {routingError}
          </div>
        )}
        <MapErrorBoundary fallback={<MapErrorFallback />}>
          <Map 
            routeData={currentRouteData}
            routeCoordinates={currentRouteData}
            isSosActive={sosAlert.active || Boolean(activeSafeHaven)}
            routeA={routeA}
            routeB={routeB}
            routeC={routeC}
            fastestRoute={fastestRoute}
            showFastestRoute={showFastestRoute}
            selectedRoute={selectedRoute}
            startPoint={startPoint}
            endPoint={endPoint}
            userLocation={userLocation}
            recenterTrigger={recenterTrigger}
            setStartPoint={setStartPoint as any}
            setEndPoint={setEndPoint as any}
            onToast={showMapToast}
            safetyNodes={safetyNodes}
            osmCameras={osmCameras}
            safeHavens={safeHavens}
            layers={layers}
            timeOfDay={timeOfDay}
            center={mapCenter}
            onMapClick={handleMapClick}
            onSelectRoute={(route) => { setSelectedRoute(route); setSafetyReveal(null); setRouteProximityPoint(null); }}
            isSimulating={isSimulating}
            simulationProgress={simulationProgress}
            activeProfiles={activeProfiles}
            scannedLocation={scannedLocation}
            onCloseScanner={() => setScannedLocation(null)}
            onMapDoubleClick={handleMapDoubleClick}
            safeStops={safeStops}
            childDeviation={childDeviation}
            reveal={safetyReveal}
            proximityPoint={routeProximityPoint}
            onRouteProximityChange={setRouteProximityPoint}
          />
        </MapErrorBoundary>

        {/* Safe Haven Banner */}
        <AnimatePresence>
          {activeSafeHaven && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1050] w-[90%] max-w-lg flex justify-center">
              <SafeHavenBanner
                haven={activeSafeHaven.haven}
                distanceMeters={activeSafeHaven.distance}
                onCancel={handleCancelHaven}
              />
            </div>
          )}
        </AnimatePresence>

        {/* GPS Recenter Floating Action Button */}
        <div 
          className="fixed md:absolute z-[1000] transition-all duration-300 pointer-events-auto"
          style={{ 
            right: 'calc(1rem + env(safe-area-inset-right, 0px))',
            bottom: 'calc(var(--bottom-sheet-height, 9.5rem) + 4.5rem + env(safe-area-inset-bottom, 0px))' 
          }}
        >
          <button
            onClick={handleRecenterGps}
            className={`w-12 h-12 min-w-[44px] min-h-[44px] rounded-full shadow-2xl border flex items-center justify-center transition-all active:scale-90 relative ${
              userLocation 
                ? 'bg-slate-900/95 text-blue-400 hover:text-blue-300 border-blue-500/70 hover:border-blue-400 shadow-[0_0_15px_rgba(37,99,235,0.4)]'
                : 'bg-slate-900/95 text-slate-400 hover:text-white border-slate-700 hover:border-slate-500'
            }`}
            title="Zaměřit mou polohu (GPS)"
            aria-label="Zaměřit mou polohu"
          >
            <svg 
              className="w-6 h-6" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.2"
            >
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              <path strokeLinecap="round" d="M12 2v3m0 14v3M2 12h3m14 0h3" />
            </svg>
            {userLocation && (
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
            )}
          </button>
        </div>

        {/* Safe Haven FAB Button */}
        <div 
          className="fixed md:absolute z-[1000] transition-all duration-300 pointer-events-auto"
          style={{ 
            right: 'calc(1rem + env(safe-area-inset-right, 0px))',
            bottom: 'calc(var(--bottom-sheet-height, 9.5rem) + 12px + env(safe-area-inset-bottom, 0px))' 
          }}
        >
          <SafeHavenButton
            currentLocation={simulatedLocation}
            onNavigateToHaven={handleNavigateToHaven}
            activeHaven={activeSafeHaven?.haven ?? null}
            onCancelHaven={handleCancelHaven}
            extraHavens={safeHavens}
          />
        </div>

        {/* Modální okna a bannery detekovaných anomálií */}
        <MotionAnomalyModals
          fallCountdown={motionAnomaly.fallCountdown}
          onDismissFall={motionAnomaly.dismissFall}
          heightenedVigilance={motionAnomaly.heightenedVigilance}
          currentSpeedKmh={motionAnomaly.currentSpeedKmh}
          isStuckInDark={motionAnomaly.isStuckInDark}
          stuckDurationSeconds={motionAnomaly.stuckDurationSeconds}
          onDismissStuck={motionAnomaly.dismissStuck}
          deviationWarning={geofence.warningActive}
          deviationDistance={geofence.distanceMeters}
          deviationSeconds={geofence.deviationSeconds}
          onResetDeviation={geofence.resetGeofence}
        />

        {/* ÚVODNÍ MODAL VÝBĚRU REŽIMŮ (HLAVNÍ MENU) */}
        <AnimatePresence>
          {showModeSelectionModal && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[10001] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
            >
              <div className="relative w-full max-w-lg my-auto">
                <button
                  onClick={() => setShowModeSelectionModal(false)}
                  className="absolute top-4 right-4 z-50 text-slate-400 hover:text-white px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700 text-xs font-bold"
                >
                  ✕ Zavřít
                </button>
                <ModeSelectionModal
                  onSelectMode={(mode) => {
                    setShowModeSelectionModal(false);
                    if (mode === 'child') {
                      onBackToMenu?.();
                    } else {
                      handleSelectProfiles([mode]);
                    }
                  }}
                  onSelectProfiles={(profiles) => {
                    handleSelectProfiles(profiles);
                  }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Správa očekávání u PWA na pozadí (diskrétní informační tip) */}
        {showPwaTip && (
          <div 
            className="fixed md:bottom-5 md:left-6 md:right-auto md:max-w-md z-[1000] bg-slate-900/95 border border-slate-700/80 rounded-2xl p-3 sm:p-3.5 shadow-2xl backdrop-blur-md text-xs text-slate-300 leading-relaxed flex items-start gap-2.5 pointer-events-auto animate-fadeIn max-w-[calc(100vw-1.5rem)]"
            style={{
              left: 'calc(0.75rem + env(safe-area-inset-left, 0px))',
              right: 'calc(0.75rem + env(safe-area-inset-right, 0px))',
              bottom: 'calc(var(--bottom-sheet-height, 9.5rem) + 84px + env(safe-area-inset-bottom, 0px))'
            }}
          >
            <span className="text-base shrink-0">💡</span>
            <div className="flex-1 min-w-0">
              <span className="font-bold text-white">Tip pro spolehlivý dohled:</span> Webové prohlížeče na mobilu mohou při zamčené obrazovce omezit přenos GPS. Pro nepřetržitý dohled doporučujeme nechat aplikaci otevřenou na popředí. Pro sledování se zhasnutým displejem v kapse připravujeme nativní verzi pro App Store a Google Play.
            </div>
            <button
              onClick={() => {
                setShowPwaTip(false);
                if (typeof window !== 'undefined') {
                  localStorage.setItem('safepath_pwa_tip_dismissed', 'true');
                }
              }}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors text-xs shrink-0 min-w-[28px] min-h-[28px] flex items-center justify-center"
              title="Zavřít tip"
              aria-label="Zavřít tip"
            >
              ✕
            </button>
          </div>
        )}

        {/* Návod na odblokování geolokace GPS */}
        <GeolocationPermissionModal
          isOpen={showPermissionModal}
          onClose={() => setShowPermissionModal(false)}
          onRetry={handleRetryLocation}
          isRetrying={isRetryingLocation}
        />

        {/* Krizový SafePass Modal pro rodiče (zobrazení / tisk / stažení) */}
        {isSafePassModalOpen && (
          <SafePassModal
            childCode={pairedChildCode || (typeof window !== 'undefined' ? localStorage.getItem('safepath_paired_child_code') : null) || 'SAFE-PASS-DEMO'}
            onClose={() => setIsSafePassModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}


