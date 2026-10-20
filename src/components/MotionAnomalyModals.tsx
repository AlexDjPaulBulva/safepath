import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface MotionAnomalyModalsProps {
  fallCountdown: number | null;
  onDismissFall: () => void;
  heightenedVigilance: boolean;
  currentSpeedKmh: number;
  isStuckInDark: boolean;
  stuckDurationSeconds: number;
  onDismissStuck: () => void;
  deviationWarning: boolean;
  deviationDistance: number;
  deviationSeconds: number;
  onResetDeviation: () => void;
}

export function MotionAnomalyModals({
  fallCountdown,
  onDismissFall,
  heightenedVigilance,
  currentSpeedKmh,
  isStuckInDark,
  stuckDurationSeconds,
  onDismissStuck,
  deviationWarning,
  deviationDistance,
  deviationSeconds,
  onResetDeviation
}: MotionAnomalyModalsProps) {
  return (
    <>
      {/* 1. PÁD / NÁRAZ: 20-sekundový odpočet */}
      <AnimatePresence>
        {fallCountdown !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[12000] bg-red-950/90 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 30 }}
              className="bg-slate-900 border-4 border-red-600 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-[0_0_80px_rgba(220,38,38,0.8)] text-center flex flex-col items-center"
            >
              <div className="w-20 h-20 rounded-full bg-red-600/30 border-2 border-red-500 flex items-center justify-center text-4xl mb-4 animate-bounce">
                💥
              </div>

              <h2 className="text-2xl font-black text-white mb-2">
                Byl detekován pád nebo náraz!
              </h2>

              <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                Zaznamenali jsme náhlou změnu pohybu následovanou nehybností. Pokud do{' '}
                <span className="font-bold text-red-400">20 sekund</span> neodpovíte, automaticky vyšleme tísňový signál a polohu na rodičovský dispečink.
              </p>

              {/* Kruhový odpočet */}
              <div className="relative w-28 h-28 flex items-center justify-center mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-red-500/30 animate-pulse"></div>
                <div className="text-5xl font-black text-white tracking-tighter">
                  {fallCountdown}s
                </div>
              </div>

              <button
                onClick={onDismissFall}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xl rounded-2xl shadow-xl shadow-emerald-900/50 transition-all flex items-center justify-center gap-2"
              >
                <span>✓</span> Jsem v pořádku
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. BĚH / ÚPRK: Indikátor zvýšené bdělosti */}
      <AnimatePresence>
        {heightenedVigilance && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[1050] bg-amber-950/95 border-2 border-amber-500 rounded-2xl px-5 py-3 shadow-[0_0_30px_rgba(245,158,11,0.5)] backdrop-blur-md flex items-center gap-3 text-amber-200"
          >
            <span className="text-2xl animate-pulse">🏃‍♀️</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                  Zvýšená bdělost – Rychlý běh / úprk
                </span>
                <span className="text-[11px] bg-amber-500/30 px-2 py-0.5 rounded-full font-bold text-amber-200">
                  {currentSpeedKmh.toFixed(1)} km/h
                </span>
              </div>
              <p className="text-xs text-amber-100/80">
                Detekována vysoká rychlost chůze/běhu v nočním nebo dětském režimu. Sledujeme trasu.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. UVÁZNUTÍ NA MÍSTĚ: Kontrolní dotaz po > 90 s v nehlídaném úseku */}
      <AnimatePresence>
        {isStuckInDark && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[1050] bg-slate-900/95 border-2 border-indigo-500 rounded-2xl p-4 shadow-2xl backdrop-blur-md max-w-md w-[90%] text-slate-100 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <span className="text-3xl">⏱️</span>
              <div>
                <h4 className="text-sm font-bold text-indigo-300">
                  Uváznutí na místě ({stuckDurationSeconds}s)
                </h4>
                <p className="text-xs text-slate-400">
                  Stojíte déle než 90 s v nehlídaném úseku bez kamer. Jste v bezpečí?
                </p>
              </div>
            </div>

            <button
              onClick={onDismissStuck}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shrink-0 transition-colors"
            >
              V pořádku
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. ODCHYLKA Z TRASE: Koridorové varování (> 15 s) */}
      <AnimatePresence>
        {deviationWarning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[1100] bg-gradient-to-r from-amber-950/95 via-red-950/95 to-amber-950/95 border-2 border-amber-400 rounded-2xl px-6 py-3 shadow-[0_0_35px_rgba(245,158,11,0.6)] backdrop-blur-md flex items-center gap-4 text-white"
          >
            <span className="text-2xl animate-spin">⚠️</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                  Odchylka z trasy ({deviationDistance} m)
                </span>
                <span className="text-xs bg-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                  {deviationSeconds}s mimo koridor
                </span>
              </div>
              <p className="text-xs text-slate-200">
                Byla zjištěna odchylka z bezpečné trasy. Vraťte se do koridoru ({Math.max(0, 45 - deviationSeconds)}s do eskalace).
              </p>
            </div>
            <button
              onClick={onResetDeviation}
              className="px-2.5 py-1.5 bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold border border-slate-600 transition-colors"
            >
              Rozumím
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
