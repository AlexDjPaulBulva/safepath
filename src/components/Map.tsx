import React, { useEffect, useState, useMemo } from 'react';
import staticSafetyData from '../data/pragueStaticSafety.json';
import { MapEngine, MapEngineProps, UserLocation } from './MapEngine';
import { MapErrorBoundary, MapErrorFallback } from './MapErrorBoundary';
import { useAppStore } from '../store/useAppStore';
import { subscribeToChildSession, ChildSessionData } from '../lib/liveSync';
import { getPointAlongRoute } from '../lib/routing';
import { useVoiceNavigation } from '../hooks/useVoiceNavigation';
import { AudioNavToggle } from './AudioNavToggle';

export { MapEngine, MapErrorBoundary, MapErrorFallback };
export type { MapEngineProps, UserLocation };

export function Map(props: MapEngineProps) {
  const activeMode = useAppStore((state) => state.activeMode);
  const storePairedCode = useAppStore((state) => state.pairedChildCode);
  const setStoreChildLocation = useAppStore((state) => state.setChildLocation);
  const setChildSession = useAppStore((state) => state.setChildSession);

  // Kód spárovaného dítěte ze storu nebo localStorage
  const pairedCode = storePairedCode || (typeof window !== 'undefined' ? localStorage.getItem('safepath_paired_child_code') : null);

  // Zjištění, zda se nacházíme v rodičovském režimu
  const isParentMode = activeMode === 'parent' || props.activeProfiles?.includes('parent') || true;

  // Stav polohy dítěte přijaté v reálném čase z Firebase
  const [childData, setChildData] = useState<ChildSessionData | null>(null);

  useEffect(() => {
    console.log("SafePath: Načteno kamer:", staticSafetyData?.cameras?.length || 0);
    console.log("SafePath: Načteno přechodů:", staticSafetyData?.crossings?.length || 0);
  }, []);

  // Živé předplatné na Firebase Realtime Database
  useEffect(() => {
    if (!pairedCode || !isParentMode) {
      setChildData(null);
      return;
    }

    console.log(`SafePath Map: Připojuji se k živému vysílání dítěte s kódem ${pairedCode}...`);

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
      console.log(`SafePath Map: Odpojuji se od sezení ${pairedCode}`);
      unsubscribe();
    };
  }, [pairedCode, isParentMode, setChildSession, setStoreChildLocation]);

  // Kontrola odchýlení z trasy (inCorridor === false)
  const isDeviated = childData !== null && childData.inCorridor === false;

  // Heartbeat Watchdog pro kontrolu stáří posledních přijatých dat dítěte (každých 10 sekund)
  const [isHeartbeatLost, setIsHeartbeatLost] = useState<boolean>(false);
  const [minutesSinceLastSeen, setMinutesSinceLastSeen] = useState<number>(0);

  useEffect(() => {
    if (!pairedCode || !isParentMode) {
      setIsHeartbeatLost(false);
      setMinutesSinceLastSeen(0);
      return;
    }

    const checkHeartbeat = () => {
      const activeChild = childData || props.childLiveLocation;
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
  }, [childData, props.childLiveLocation, pairedCode, isParentMode]);

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
      : props.routeC;

  // Efektivní aktuální poloha pro navigaci (simulace, Firebase dítě, nebo GPS zařízení)
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

  // Hlasová a haptická turn-by-turn navigace pro děti
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

  // Vizuální bublina naposledy vyhlášeného navigačního pokynu (auto-hide po 4.5s)
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

  return (
    <div className="relative w-full h-full">
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

      {/* Plovoucí přepínač hlasových pokynů na mapě (nad terčíkem polohy) */}
      <div 
        className="fixed md:absolute right-4 md:right-6 z-[1000] transition-all duration-300 pointer-events-auto"
        style={{ bottom: 'calc(var(--bottom-sheet-height, 9.5rem) + 8.25rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <AudioNavToggle
          isVoiceEnabled={isVoiceEnabled}
          onToggle={toggleVoice}
        />
      </div>

      {/* Červené výstražné upozornění na displeji rodiče: "Dítě se odchýlilo z trasy!" */}
      {isDeviated && (
        <div 
          className="fixed z-[3000] w-[90vw] max-w-md bg-rose-600/95 text-white px-5 py-3.5 rounded-2xl shadow-2xl border-2 border-rose-300 backdrop-blur-md flex items-center gap-3 animate-bounce pointer-events-auto"
          style={{ top: '1rem', left: '50%', transform: 'translateX(-50%)' }}
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

      {/* Varovný banner při ztrátě spojení se zařízením (Heartbeat Watchdog > 60s) */}
      {isHeartbeatLost && !isDeviated && (
        <div 
          className="fixed z-[3000] w-[92vw] max-w-lg bg-gradient-to-r from-amber-950 via-slate-900 to-rose-950 text-white px-5 py-3.5 rounded-2xl shadow-[0_0_25px_rgba(245,158,11,0.5)] border-2 border-amber-500 backdrop-blur-md flex items-center gap-3 animate-pulse pointer-events-auto"
          style={{ top: '1rem', left: '50%', transform: 'translateX(-50%)' }}
          role="alert"
        >
          <span className="text-3xl flex-shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="font-black text-xs uppercase tracking-wider text-amber-400">
              Ztráta spojení se zařízením
            </div>
            <div className="text-sm font-bold text-white leading-snug">
              Upozornění: Zařízení dítěte je déle než 1 minutu offline. Poslední známá poloha před {minutesSinceLastSeen} min, stav baterie: {childData?.battery ?? (props.childLiveLocation as any)?.battery ?? 18} %.
            </div>
            {childData && (
              <div className="text-[11px] text-amber-200/80 mt-1 truncate">
                Poslední známé souřadnice: {childData.lat.toFixed(5)}, {childData.lng.toFixed(5)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stavová lišta spárovaného dítěte */}
      {pairedCode && isParentMode && (
        <div className="absolute top-4 left-4 z-[1000] hidden sm:flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-slate-700/80 px-3.5 py-1.5 rounded-xl shadow-lg text-xs font-semibold text-slate-200">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isHeartbeatLost ? 'bg-slate-500' : (childData ? 'bg-lime-400' : 'bg-amber-400')} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isHeartbeatLost ? 'bg-slate-400' : (childData ? 'bg-lime-500' : 'bg-amber-500')}`}></span>
          </span>
          <span className={isHeartbeatLost ? 'text-slate-300 font-bold' : (childData ? 'text-lime-300 font-bold' : 'text-amber-300 font-medium')}>
            {isHeartbeatLost ? 'Offline / Ztráta signálu' : (childData ? 'Dítě živě sledováno' : 'Čekám na polohu dítěte')}
          </span>
          <span className="text-slate-400 font-mono">({pairedCode})</span>
        </div>
      )}

      <MapErrorBoundary fallback={<MapErrorFallback />}>
        <MapEngine 
          {...props} 
          isSosActive={isSos}
          childLiveLocation={effectiveChildLocation}
        />
      </MapErrorBoundary>
    </div>
  );
}

export default Map;
