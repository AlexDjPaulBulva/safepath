import React, { useEffect, useState } from 'react';
import staticSafetyData from '../data/pragueStaticSafety.json';
import { MapEngine, MapEngineProps } from './MapEngine';
import { MapErrorBoundary, MapErrorFallback } from './MapErrorBoundary';
import { useAppStore } from '../store/useAppStore';
import { subscribeToChildSession, ChildSessionData } from '../lib/liveSync';

export { MapEngine, MapErrorBoundary, MapErrorFallback };
export type { MapEngineProps };

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

  return (
    <div className="relative w-full h-full">
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

      {/* Stavová lišta spárovaného dítěte */}
      {pairedCode && isParentMode && (
        <div className="absolute top-4 left-4 z-[1000] hidden sm:flex items-center gap-2 bg-slate-900/90 backdrop-blur border border-slate-700/80 px-3.5 py-1.5 rounded-xl shadow-lg text-xs font-semibold text-slate-200">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${childData ? 'bg-lime-400' : 'bg-amber-400'} opacity-75`}></span>
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${childData ? 'bg-lime-500' : 'bg-amber-500'}`}></span>
          </span>
          <span className={childData ? 'text-lime-300 font-bold' : 'text-amber-300 font-medium'}>
            {childData ? 'Dítě živě sledováno' : 'Čekám na polohu dítěte'}
          </span>
          <span className="text-slate-400 font-mono">({pairedCode})</span>
        </div>
      )}

      <MapErrorBoundary fallback={<MapErrorFallback />}>
        <MapEngine 
          {...props} 
          childLiveLocation={childData || props.childLiveLocation}
        />
      </MapErrorBoundary>
    </div>
  );
}

export default Map;
