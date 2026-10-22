import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function detectPlatform(): 'ios' | 'android' | 'desktop' {
  if (typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

interface GeolocationPermissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function GeolocationPermissionModal({
  isOpen,
  onClose,
  onRetry,
  isRetrying = false
}: GeolocationPermissionModalProps) {
  const platform = detectPlatform();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10002] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto pointer-events-auto"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, y: 15 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 15 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-700/80 w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col text-white my-auto relative"
          >
            {/* Zavírací křížek */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl hover:bg-slate-800 transition-colors active:scale-90"
              aria-label="Zavřít"
            >
              ✕
            </button>

            {/* Záhlaví dialogu */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl shrink-0">
                📍
              </div>
              <div>
                <h3 className="text-lg font-bold text-white leading-tight">
                  Jak odblokovat přístup k GPS
                </h3>
                <p className="text-xs text-amber-300/90 font-medium mt-0.5">
                  {platform === 'ios' && 'Postup pro iPhone / iPad (Safari)'}
                  {platform === 'android' && 'Postup pro Android (Chrome / prohlížeč)'}
                  {platform === 'desktop' && 'Postup pro počítačový prohlížeč'}
                </p>
              </div>
            </div>

            {/* Postup podle detekovaného zařízení */}
            <div className="bg-slate-850/80 rounded-2xl p-4 border border-slate-800 space-y-3 mb-6 text-sm">
              {platform === 'ios' && (
                <>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      V adresním řádku nahoře klepněte na ikonu <strong>nastavení / zámeček</strong> vedle adresy webu (nebo ikonu <strong>„aA“</strong>).
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      Zvolte <strong>„Nastavení pro tento web“</strong> → <strong>„Poloha“</strong> → <strong>„Povolit“</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      3
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      Vraťte se sem a klepněte na tlačítko <strong>„Zkusit znovu“</strong> níže.
                    </p>
                  </div>
                </>
              )}

              {platform === 'android' && (
                <>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      Klepněte na ikonu <strong>zámečku 🔒</strong> v adresním řádku.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      Povolte přístup k <strong>poloze</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      3
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      Vraťte se sem a klepněte na tlačítko <strong>„Zkusit znovu“</strong> níže.
                    </p>
                  </div>
                </>
              )}

              {platform === 'desktop' && (
                <>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      V adresním řádku prohlížeče vlevo klepněte na ikonu <strong>zámečku 🔒</strong> nebo nastavení webu.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      U položky <strong>„Poloha“</strong> přepněte volbu na <strong>„Povolit“</strong>.
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      3
                    </span>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      Klepněte na tlačítko <strong>„Zkusit znovu“</strong> níže.
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Tlačítka akce */}
            <div className="flex items-center gap-3">
              <button
                onClick={onRetry}
                disabled={isRetrying}
                className="flex-1 py-3 px-4 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2"
              >
                {isRetrying ? (
                  <>
                    <span className="animate-spin text-base">⟳</span>
                    <span>Ověřuji oprávnění...</span>
                  </>
                ) : (
                  <>
                    <span className="text-base">⟳</span>
                    <span>Zkusit znovu</span>
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="py-3 px-4 min-h-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-semibold text-sm transition-all"
              >
                Rozumím
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default GeolocationPermissionModal;
