import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Map } from './Map';
import { RouteResult } from '../lib/routing';
import { SyncEngine } from '../lib/sync-engine';
import { useBatteryProtocol } from '../hooks/useBatteryProtocol';
import { SafePassModal } from './SafePassModal';
import { 
  startGpsStreaming, 
  updateChildPosition, 
  terminateChildNavigation, 
  subscribeToAssignedRoute,
  AssignedRouteData
} from '../lib/liveSync';
import { useAppStore } from '../store/useAppStore';

interface ChildViewProps {
  onBack?: () => void;
}

export function ChildView({ onBack }: ChildViewProps) {
  const storeChildCode = useAppStore((state) => state.myChildCode);
  const activeChildCode = storeChildCode || (typeof window !== 'undefined' ? localStorage.getItem('safepath_child_code') : null);

  const [isPaired, setIsPaired] = useState<boolean>(() => !!activeChildCode);
  const [pinInput, setPinInput] = useState('');
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ 
    lat: number; 
    lng: number; 
    accuracy?: number; 
    heading?: number | null; 
    speed?: number | null; 
  }>({ 
    lat: 50.0755, 
    lng: 14.4378,
    accuracy: 10
  });

  const [assignedRouteData, setAssignedRouteData] = useState<AssignedRouteData | null>(null);
  const [showRouteReadyBanner, setShowRouteReadyBanner] = useState<boolean>(false);
  const [showSafePassModal, setShowSafePassModal] = useState<boolean>(false);

  // Protokol sledování baterie a úsporný režim
  const {
    level: batteryLevel,
    charging: isCharging,
    powerSavingMode
  } = useBatteryProtocol({
    childCode: activeChildCode || '',
    currentCoords,
    remainingMinutes: assignedRouteData?.durationMin ?? 12
  });

  // Živé GPS streamování do Firebase
  useEffect(() => {
    if (!activeChildCode) return;
    setIsPaired(true);

    const stopGps = startGpsStreaming(
      activeChildCode, 
      (coords) => {
        setCurrentCoords((prev) => ({
          ...prev,
          lat: coords.lat,
          lng: coords.lng
        }));
      },
      {
        isPowerSaving: powerSavingMode,
        getRouteRemainingMinutes: () => assignedRouteData?.durationMin ?? 10
      }
    );

    return () => {
      stopGps();
    };
  }, [activeChildCode, powerSavingMode, assignedRouteData?.durationMin]);

  // Poslech na přiřazenou trasu od rodičů z Firebase
  useEffect(() => {
    if (!activeChildCode) return;

    const unsubscribe = subscribeToAssignedRoute(activeChildCode, (route) => {
      if (route && route.pathCoords && route.pathCoords.length >= 2) {
        setAssignedRouteData(route);
        setShowRouteReadyBanner(true);
        // Vyvolat haptické potvrzení
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate([100, 50, 100]);
          } catch {
            // ignore
          }
        }
      } else {
        setAssignedRouteData(null);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [activeChildCode]);

  // Převod přiřazené trasy z Firebase na RouteResult pro komponentu Map
  const assignedRouteResult = useMemo<RouteResult | null>(() => {
    if (!assignedRouteData || !assignedRouteData.pathCoords || assignedRouteData.pathCoords.length < 2) {
      return null;
    }

    const dist = assignedRouteData.distanceKm ?? 1.2;
    const dur = assignedRouteData.durationMin ?? 15;

    return {
      id: 'assigned-child-route',
      name: 'Doporučená bezpečná trasa od rodičů',
      description: 'Oficiální bezpečná trasa vybraná tvými rodiči.',
      distance: dist,
      duration: dur,
      totalDistance: dist * 1000,
      totalDuration: dur * 60,
      cameraCoverage: 92,
      darkSegments: 0,
      riskPoints: 0,
      aiAdvice: 'Sleduj zelený koridor pod dohledem městských kamer a rodičovského dispečinku.',
      geometry: assignedRouteData.pathCoords,
      segments: [],
      metrics: {
        durationMinutes: dur,
        cameraCoveragePercent: 95,
        unlitSegmentsCount: 0,
        uncontrolledCrossingsCount: 0,
        mainRoadPercent: 5,
        overallSafetyScore: 98,
        camerasNearbyCount: 12,
        hasSafeHaven: true,
        parkIntersectionCount: 0,
        riskSpotsCount: 0,
        childSafetyValid: true,
        lightingCoveragePercent: 95,
        collisionIntersectionsCount: 0,
        schoolZonePercent: 85,
        hasTskClosureConflict: false
      },
      safetyScore: 98,
      childSafetyValid: true,
      tags: ['[Trasa od rodičů]', '[Zvýšená ochrana a dohled]', '[Dohled kamer]']
    };
  }, [assignedRouteData]);

  const handlePair = () => {
    if (SyncEngine.verifyPin(pinInput)) {
      setIsPaired(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem('safepath_child_code', pinInput);
      }
    } else {
      alert('Neplatný PIN. Zkontrolujte kód na obrazovce rodiče.');
    }
  };

  const handleExitNavigation = () => {
    if (activeChildCode) {
      terminateChildNavigation(activeChildCode).catch(console.warn);
    }
    onBack?.();
  };

  const handleSOSPress = () => {
    if (sosCountdown !== null) return;
    setSosCountdown(3);
  };

  const handleSOSCancel = () => {
    setSosCountdown(null);
  };

  // SOS odpočet (3 sekundy)
  useEffect(() => {
    if (sosCountdown === null) return;
    if (sosCountdown > 0) {
      const timer = setTimeout(() => setSosCountdown(sosCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (sosCountdown === 0) {
      SyncEngine.broadcast('SOS_ALERT', { location: [currentCoords.lat, currentCoords.lng] });
      
      if (activeChildCode) {
        updateChildPosition(activeChildCode, currentCoords.lat, currentCoords.lng, false).catch(console.error);
      }

      setSosCountdown(null);
      alert('SOS odesláno rodičům! Okamžitě tě lokalizujeme.');
    }
  }, [sosCountdown, activeChildCode, currentCoords]);

  // Obrazovka párování, pokud telefon ještě nemá kód
  if (!isPaired) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative font-sans">
        {onBack && (
          <button 
            onClick={handleExitNavigation}
            className="absolute top-6 left-6 text-slate-400 hover:text-white flex items-center gap-2 text-sm font-semibold bg-slate-800/80 hover:bg-slate-700/80 px-4 py-2.5 rounded-xl border border-slate-700 transition-all shadow-lg active:scale-95"
          >
            <span>←</span> Zpět do menu
          </button>
        )}

        <div className="w-full max-w-sm bg-slate-800 rounded-3xl shadow-2xl border border-slate-700 p-8 flex flex-col items-center">
          <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mb-6 border border-slate-700 shadow-inner">
            <span className="text-3xl">📱</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2 text-center">Spárování telefonu</h2>
          <p className="text-slate-400 text-sm text-center mb-8">
            Zadejte 6místný kód z obrazovky Rodičovského dispečinku.
          </p>
          <input 
            type="text"
            maxLength={6}
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl text-center text-4xl font-black text-white tracking-widest py-4 mb-4 focus:outline-none focus:border-cyan-500 transition-colors"
            placeholder="000000"
          />
          <button 
            onClick={handlePair}
            disabled={pinInput.length !== 6}
            className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl text-lg transition-colors shadow-lg shadow-cyan-600/20 active:scale-[0.98]"
          >
            Připojit
          </button>

          {onBack && (
            <button 
              onClick={handleExitNavigation}
              className="w-full mt-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600/60 text-slate-300 hover:text-white font-semibold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <span>←</span> Zpět na výběr režimu
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full bg-slate-950 relative overflow-hidden font-sans select-none">
      {/* 1. Plnohodnotná Canvas Leaflet mapa - žádná pole ODKUD/KAM, pouze zelená trasa od rodičů */}
      <div className="absolute inset-0 z-0">
        <Map
          routeA={assignedRouteResult}
          selectedRoute="A"
          center={[currentCoords.lat, currentCoords.lng]}
          userLocation={{
            lat: currentCoords.lat,
            lng: currentCoords.lng,
            accuracy: currentCoords.accuracy || 10,
            heading: currentCoords.heading,
            speed: currentCoords.speed
          }}
          safetyNodes={[]}
          layers={{ cameras: true, lights: true, havens: true, incidents: false, zones: false, localDataOnly: true }}
          timeOfDay={new Date().getHours()}
          activeProfiles={['child']}
          isSosActive={sosCountdown !== null}
        />
      </div>

      {/* 2. Horní plovoucí lišta: Zpět, Stav připojení + Baterie, Krizový SafePass */}
      <div className="absolute top-4 left-0 right-0 px-4 flex items-center justify-between z-[1200] gap-2 pointer-events-none">
        {onBack ? (
          <button 
            onClick={handleExitNavigation}
            className="bg-slate-900/90 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl border border-slate-700 shadow-xl backdrop-blur flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95 pointer-events-auto"
          >
            <span>←</span> Zpět
          </button>
        ) : <div className="w-12" />}

        <div className="bg-slate-900/95 px-3.5 py-1.5 rounded-full border border-slate-700 shadow-2xl backdrop-blur flex items-center space-x-2 max-w-[55%] truncate pointer-events-auto">
          <span className={`w-2.5 h-2.5 rounded-full ${powerSavingMode ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse'}`}></span>
          <span className="font-bold text-xs text-slate-200 truncate">
            {activeChildCode ? `Kód: ${activeChildCode}` : 'Sledováno'}
          </span>
          {batteryLevel !== null && (
            <span className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded-md ${
              powerSavingMode ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'bg-slate-800 text-slate-300'
            }`}>
              {isCharging ? '⚡' : '🔋'}{batteryLevel}%
            </span>
          )}
        </div>

        <button
          onClick={() => setShowSafePassModal(true)}
          className="bg-emerald-600/95 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl border border-emerald-400 shadow-xl backdrop-blur flex items-center gap-1 text-xs font-bold transition-all active:scale-95 shrink-0 pointer-events-auto"
        >
          <span>🏷️</span> SafePass
        </button>
      </div>

      {/* 3. Zelený banner: "Trasa od rodičů připravena. Můžeš vyrazit!" */}
      {showRouteReadyBanner && assignedRouteResult && (
        <div 
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[1300] w-[92%] max-w-md bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white px-4 py-3 rounded-2xl shadow-[0_0_35px_rgba(16,185,129,0.5)] border-2 border-emerald-300 backdrop-blur-md flex items-center justify-between gap-3 animate-fadeIn pointer-events-auto"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl flex-shrink-0 animate-bounce">🎒</span>
            <div className="truncate">
              <div className="font-black text-sm text-white leading-tight">
                Trasa od rodičů připravena. Můžeš vyrazit!
              </div>
              <div className="text-[11px] text-emerald-100 font-medium truncate mt-0.5">
                Cíl: {assignedRouteData?.end?.name || 'Cíl'} • cca {assignedRouteResult.duration} min chůze
              </div>
            </div>
          </div>
          <button 
            onClick={() => setShowRouteReadyBanner(false)}
            className="text-emerald-200 hover:text-white p-1 font-bold text-xs shrink-0"
            aria-label="Zavřít"
          >
            ✕
          </button>
        </div>
      )}

      {/* 4. Stav bez zadané trasy - klidné čekání na pokyn rodiče */}
      {!assignedRouteResult && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[1300] w-[90%] max-w-sm bg-slate-900/95 border border-slate-700 text-slate-200 px-4 py-2.5 rounded-2xl shadow-xl backdrop-blur text-center text-xs pointer-events-auto flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
          <span>Čekám na odeslání bezpečné trasy od rodičů...</span>
        </div>
      )}

      {/* 5. Vpravo dole: Červené SOS tlačítko pro nouzový signál */}
      <div className="fixed bottom-6 right-6 z-[1200] pointer-events-auto">
        <AnimatePresence>
          {sosCountdown !== null ? (
            <motion.button
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={handleSOSCancel}
              className="w-24 h-24 sm:w-28 sm:h-28 bg-red-600 rounded-full flex flex-col items-center justify-center border-4 border-red-900 shadow-[0_0_40px_rgba(220,38,38,0.9)] active:scale-95 transition-transform"
            >
              <span className="text-3xl sm:text-4xl font-black text-white">{sosCountdown}</span>
              <span className="text-red-200 font-bold uppercase tracking-widest text-[10px]">Zrušit</span>
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSOSPress}
              className="w-20 h-20 sm:w-24 sm:h-24 bg-red-600 hover:bg-red-500 rounded-full flex flex-col items-center justify-center border-4 border-red-800 shadow-[0_0_35px_rgba(220,38,38,0.7)] text-white"
              title="Stiskni pro SOS pomoc"
            >
              <span className="text-2xl sm:text-3xl font-black tracking-tight leading-none">SOS</span>
              <span className="text-[10px] font-bold uppercase text-red-200 mt-0.5">Pomoc</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Krizový SafePass Modal pro dítě */}
      {showSafePassModal && (
        <SafePassModal
          childCode={activeChildCode || 'SAFE-PASS-DEMO'}
          onClose={() => setShowSafePassModal(false)}
        />
      )}
    </div>
  );
}

export default ChildView;
