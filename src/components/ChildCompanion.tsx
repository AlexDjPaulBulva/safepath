import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SyncEngine } from '../lib/sync-engine';
import { useMotionAnomaly } from '../hooks/useMotionAnomaly';
import { MotionAnomalyModals } from './MotionAnomalyModals';

interface ChildCompanionProps {
  onBack?: () => void;
}

export function ChildCompanion({ onBack }: ChildCompanionProps) {
  const [isPaired, setIsPaired] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);

  const motionAnomaly = useMotionAnomaly({
    enabled: isPaired,
    currentLocation: { lat: 50.0755, lng: 14.4378 },
    activeMode: 'child',
    isNight: false,
    cameras: []
  });

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
      // Fire SOS!
      SyncEngine.broadcast('SOS_ALERT', { location: [50.0755, 14.4378] }); // Mocked location
      setSosCountdown(null);
      alert('SOS Odesláno! Naviguji k nejbližšímu záchytnému bodu...');
      // Zde by normálně proběhl fetch trasy k policii/hasičům
    }
  }, [sosCountdown]);

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
        <div className="absolute inset-0 bg-[url('https://cartodb-basemaps-c.global.ssl.fastly.net/dark_all/15/17799/11188.png')] bg-cover bg-center opacity-30"></div>
        
        {/* Plovoucí info a tlačítko Zpět */}
        {onBack && (
          <button 
            onClick={onBack}
            className="absolute top-6 left-4 bg-slate-900/90 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl border border-slate-700 shadow-xl backdrop-blur flex items-center gap-1.5 text-xs font-bold z-20 transition-all active:scale-95"
          >
            <span>←</span> Zpět
          </button>
        )}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-900/90 px-6 py-3 rounded-full border border-slate-700 shadow-xl backdrop-blur flex items-center space-x-3 z-10 w-[90%] max-w-sm">
          <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-bold text-sm text-slate-200">Poloha sledována rodičem</span>
        </div>

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
        
        <button 
          onClick={() => SyncEngine.broadcast('TOGGLE_SIMULATION', {})}
          className="w-full mt-4 bg-emerald-600 border border-emerald-500 p-4 rounded-2xl flex flex-row items-center justify-center space-x-3 active:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/50"
        >
          <span className="text-xl">📍</span>
          <span className="font-bold text-white">Simulovat pohyb po trase (Test)</span>
        </button>
      </div>

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
