import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SyncEngine } from '../lib/sync-engine';
import { useMotionAnomaly } from '../hooks/useMotionAnomaly';
import { MotionAnomalyModals } from './MotionAnomalyModals';
import { startGpsStreaming, updateChildPosition } from '../lib/liveSync';
import { useAppStore } from '../store/useAppStore';
import { useBatteryProtocol } from '../hooks/useBatteryProtocol';
import { SafePassModal } from './SafePassModal';

interface ChildCompanionProps {
  onBack?: () => void;
}

export function ChildCompanion({ onBack }: ChildCompanionProps) {
  const storeChildCode = useAppStore((state) => state.myChildCode);
  const activeChildCode = storeChildCode || (typeof window !== 'undefined' ? localStorage.getItem('safepath_child_code') : null);

  const [isPaired, setIsPaired] = useState<boolean>(() => {
    return !!activeChildCode;
  });
  const [pinInput, setPinInput] = useState('');
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lng: number }>({ lat: 50.0755, lng: 14.4378 });
  const [showSafePassModal, setShowSafePassModal] = useState(false);

  // Protokol sledování baterie a nouzový balíček při kritickém vybití (< 15 %)
  const {
    level: batteryLevel,
    charging: isCharging,
    powerSavingMode,
    isLowBattery,
    toggleSimulateLowBattery
  } = useBatteryProtocol({
    childCode: activeChildCode || '',
    currentCoords,
    remainingMinutes: 12
  });

  const motionAnomaly = useMotionAnomaly({
    enabled: isPaired,
    currentLocation: currentCoords,
    activeMode: 'child',
    isNight: false,
    cameras: []
  });

  // Živé GPS streamování do Firebase Realtime Database
  useEffect(() => {
    if (!activeChildCode) return;
    setIsPaired(true);

    const stopGps = startGpsStreaming(activeChildCode, (coords) => {
      setCurrentCoords(coords);
    });

    return () => {
      stopGps();
    };
  }, [activeChildCode]);

  useEffect(() => {
    SyncEngine.init();
    return () => SyncEngine.destroy();
  }, []);

  const handlePair = () => {
    if (SyncEngine.verifyPin(pinInput)) {
      setIsPaired(true);
    } else {
      alert('Neplatný PIN. Zkontrolujte kód na obrazovce rodiče.');
    }
  };

  const handleSOSPress = () => {
    if (sosCountdown !== null) return;
    setSosCountdown(3);
  };

  const handleSOSCancel = () => {
    setSosCountdown(null);
  };

  useEffect(() => {
    if (sosCountdown === null) return;
    if (sosCountdown > 0) {
      const timer = setTimeout(() => setSosCountdown(sosCountdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (sosCountdown === 0) {
      // Fire SOS do BroadcastChannel i Firebase!
      SyncEngine.broadcast('SOS_ALERT', { location: [currentCoords.lat, currentCoords.lng] });
      
      if (activeChildCode) {
        // Označit jako odchýlení / nouzový stav ve Firebase (inCorridor: false)
        updateChildPosition(activeChildCode, currentCoords.lat, currentCoords.lng, false).catch(console.error);
      }

      setSosCountdown(null);
      alert('SOS Odesláno rodiči! Naviguji k nejbližšímu záchytnému bodu...');
    }
  }, [sosCountdown, activeChildCode, currentCoords]);

  if (!isPaired) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative">
        {onBack && (
          <button 
            onClick={onBack}
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
              onClick={onBack}
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
    <div className="flex flex-col h-screen w-full bg-slate-900 font-sans text-slate-100 overflow-hidden relative">
      
      {/* Hlavní mapa - fake placeholder pro mobilní UI */}
      <div className="flex-1 bg-slate-800 relative z-0">
        <div className={`absolute inset-0 bg-[url('https://cartodb-basemaps-c.global.ssl.fastly.net/dark_all/15/17799/11188.png')] bg-cover bg-center ${powerSavingMode ? 'opacity-20' : 'opacity-30'}`}></div>
        
        {/* Horní lišta: Zpět, Stav sledování + Baterie, Tlačítko Safe Pass */}
        <div className="absolute top-4 left-0 right-0 px-4 flex items-center justify-between z-20 gap-2">
          {onBack ? (
            <button 
              onClick={onBack}
              className="bg-slate-900/90 text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-slate-700 shadow-xl backdrop-blur flex items-center gap-1.5 text-xs font-bold transition-all active:scale-95"
            >
              <span>←</span> Zpět
            </button>
          ) : <div className="w-16" />}

          <div className="bg-slate-900/95 px-3.5 py-1.5 rounded-full border border-slate-700 shadow-2xl backdrop-blur flex items-center space-x-2.5 max-w-[55%] truncate">
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
            className="bg-emerald-600/95 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl border border-emerald-400 shadow-xl backdrop-blur flex items-center gap-1 text-xs font-bold transition-all active:scale-95 shrink-0"
          >
            <span>🏷️</span> Můj Safe Pass
          </button>
        </div>

        {/* Úsporný režim upozornění */}
        {powerSavingMode && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-sm bg-gradient-to-r from-amber-600 via-rose-600 to-amber-700 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center justify-between shadow-2xl border border-amber-300 backdrop-blur">
            <div className="flex items-center gap-2 truncate">
              <span className="text-sm">⚡</span>
              <span className="truncate">Úsporný režim (&lt; 15 %): animace vypnuty</span>
            </div>
            <button 
              onClick={toggleSimulateLowBattery}
              className="text-[10px] uppercase font-black tracking-wider bg-black/30 hover:bg-black/50 px-2 py-0.5 rounded text-amber-200 shrink-0 ml-2"
            >
              Reset
            </button>
          </div>
        )}

        {/* SOS Button Layer */}
        <div className="absolute bottom-32 left-0 right-0 flex justify-center z-20">
          <AnimatePresence>
            {sosCountdown !== null ? (
              <motion.button
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                onClick={handleSOSCancel}
                className="w-48 h-48 bg-red-600 rounded-full flex flex-col items-center justify-center border-8 border-red-900 shadow-[0_0_50px_rgba(220,38,38,0.8)] active:scale-95 transition-transform"
              >
                <span className="text-6xl font-black text-white">{sosCountdown}</span>
                <span className="text-red-200 font-bold mt-2 uppercase tracking-widest text-sm">Zrušit</span>
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleSOSPress}
                className="w-40 h-40 bg-red-600 rounded-full flex flex-col items-center justify-center border-4 border-red-800 shadow-[0_0_40px_rgba(220,38,38,0.6)]"
              >
                <span className="text-5xl font-black text-white tracking-tighter">SOS</span>
                <span className="text-red-200 font-semibold text-xs mt-1 uppercase">Pomoc</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Rychlé trasy (Bottom Sheet) */}
      <div className="bg-slate-900 border-t border-slate-800 p-6 z-30 pb-10 shadow-[0_-10px_30px_rgba(0,0,0,0.5)] rounded-t-3xl relative">
        <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-6"></div>
        <h3 className="text-lg font-bold text-slate-300 mb-4 px-2">Rychlé trasy</h3>
        <div className="grid grid-cols-2 gap-4">
          <button className="bg-slate-800 border border-slate-700 p-4 rounded-2xl flex flex-col items-center text-center active:bg-slate-700 transition-colors">
            <span className="text-2xl mb-2">🏠</span>
            <span className="font-bold text-sm text-slate-200">Cesta domů</span>
          </button>
          <button className="bg-slate-800 border border-slate-700 p-4 rounded-2xl flex flex-col items-center text-center active:bg-slate-700 transition-colors">
            <span className="text-2xl mb-2">🏫</span>
            <span className="font-bold text-sm text-slate-200">Do školy</span>
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button 
            onClick={() => {
              SyncEngine.broadcast('TOGGLE_SIMULATION', {});
              if (activeChildCode) {
                // Simulovaný posun v poloze
                const simLat = currentCoords.lat + 0.0008;
                const simLng = currentCoords.lng + 0.0008;
                setCurrentCoords({ lat: simLat, lng: simLng });
                updateChildPosition(activeChildCode, simLat, simLng, true).catch(console.error);
              }
            }}
            className="bg-emerald-600 border border-emerald-500 p-3 rounded-2xl flex flex-row items-center justify-center space-x-2 active:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/50"
          >
            <span className="text-lg">📍</span>
            <span className="font-bold text-xs text-white">Simulovat pohyb</span>
          </button>

          <button 
            onClick={toggleSimulateLowBattery}
            className={`border p-3 rounded-2xl flex flex-row items-center justify-center space-x-2 transition-colors shadow-lg ${
              powerSavingMode 
                ? 'bg-amber-600 border-amber-400 text-white' 
                : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
            }`}
          >
            <span className="text-lg">🪫</span>
            <span className="font-bold text-xs">{powerSavingMode ? 'Vypnout test vybití' : 'Test vybití (<15%)'}</span>
          </button>
        </div>
      </div>

      {/* Krizový SafePass Modal pro dítě */}
      {showSafePassModal && (
        <SafePassModal
          childCode={activeChildCode || 'SAFE-PASS-DEMO'}
          onClose={() => setShowSafePassModal(false)}
        />
      )}

      <MotionAnomalyModals
        fallCountdown={motionAnomaly.fallCountdown}
        onDismissFall={motionAnomaly.dismissFall}
        heightenedVigilance={motionAnomaly.heightenedVigilance}
        currentSpeedKmh={motionAnomaly.currentSpeedKmh}
        isStuckInDark={motionAnomaly.isStuckInDark}
        stuckDurationSeconds={motionAnomaly.stuckDurationSeconds}
        onDismissStuck={motionAnomaly.dismissStuck}
        deviationWarning={false}
        deviationDistance={0}
        deviationSeconds={0}
        onResetDeviation={() => {}}
      />
    </div>
  );
}
