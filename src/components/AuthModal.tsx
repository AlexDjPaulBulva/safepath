import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { startChildSession, startGpsStreaming, getChildSession } from '../lib/liveSync';

export interface AuthModalProps {
  onSelectMode?: (mode: 'parent' | 'child') => void;
  onSelectProfiles?: (profiles: string[]) => void;
  onClose?: () => void;
  initialTab?: 'child' | 'parent';
}

export function AuthModal({
  onSelectMode,
  onSelectProfiles,
  onClose,
  initialTab = 'child'
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'child' | 'parent'>(initialTab);
  
  // DĚTSKÝ KÓD
  const [childCode, setChildCode] = useState<string>('');
  const [childCopied, setChildCopied] = useState(false);
  const [childIsEntering, setChildIsEntering] = useState(false);

  // RODIČOVSKÝ KÓD
  const [parentInputCode, setParentInputCode] = useState<string>('');
  const [parentLoading, setParentLoading] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);

  // Globální Zustand store
  const { 
    setActiveMode, 
    setPairedChildCode, 
    setMyChildCode 
  } = useAppStore();

  // Právní disclaimer pro rodiče
  const [disclaimerAccepted, setDisclaimerAccepted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('safepath_disclaimer_accepted') === 'true';
  });
  const [hasCheckedConsent, setHasCheckedConsent] = useState(false);

  // 1. Automatické vygenerování nebo načtení 6místného kódu pro DÍTĚ
  useEffect(() => {
    let code = localStorage.getItem('safepath_child_code');
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      // Vygeneruj nový náhodný 6místný kód (např. 482915)
      code = Math.floor(100000 + Math.random() * 900000).toString();
      localStorage.setItem('safepath_child_code', code);
    }
    setChildCode(code);
    setMyChildCode(code);
  }, [setMyChildCode]);

  // Načtení uloženého spárovaného kódu pro rodiče (pokud existuje)
  useEffect(() => {
    const savedPaired = localStorage.getItem('safepath_paired_child_code');
    if (savedPaired && /^\d{6}$/.test(savedPaired)) {
      setParentInputCode(savedPaired);
    }
  }, []);

  // Formátování kódu s mezerou uprostřed (např. "482 915")
  const formatDisplayCode = (raw: string) => {
    if (!raw || raw.length !== 6) return raw || '000 000';
    return `${raw.slice(0, 3)} ${raw.slice(3)}`;
  };

  // Vygenerování nového kódu pro dítě na vyžádání
  const handleRegenerateCode = () => {
    const newCode = Math.floor(100000 + Math.random() * 900000).toString();
    localStorage.setItem('safepath_child_code', newCode);
    setChildCode(newCode);
    setMyChildCode(newCode);
    setChildCopied(false);
  };

  // Zkopírování kódu dítěte
  const handleCopyChildCode = async () => {
    try {
      await navigator.clipboard.writeText(childCode);
      setChildCopied(true);
      setTimeout(() => setChildCopied(false), 2000);
    } catch {
      setChildCopied(false);
    }
  };

  // Vstoupit do mapy jako DÍTĚ
  const handleEnterChildMap = async () => {
    setChildIsEntering(true);
    const code = childCode || localStorage.getItem('safepath_child_code') || '123456';
    
    // Získání aktuální polohy pro počáteční zápis do Firebase
    const getInitialCoords = (): Promise<{ lat: number; lng: number }> => {
      return new Promise((resolve) => {
        if (typeof window !== 'undefined' && 'geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve({ lat: 50.0755, lng: 14.4378 }),
            { timeout: 4000, enableHighAccuracy: true }
          );
        } else {
          resolve({ lat: 50.0755, lng: 14.4378 });
        }
      });
    };

    try {
      const coords = await getInitialCoords();
      // Inicializace sezení v Realtime Database
      await startChildSession(code, coords);
      // Spuštění automatického streamování polohy každých 3-5 sekund
      startGpsStreaming(code);
      
      localStorage.setItem('safepath_mode', 'child');
      setActiveMode('child');
      if (onSelectProfiles) onSelectProfiles(['child']);
      if (onSelectMode) onSelectMode('child');
      if (onClose) onClose();
    } catch (err) {
      console.error('Chyba při inicializaci dětského sezení:', err);
      // I při selhání sítě umožníme vstup
      localStorage.setItem('safepath_mode', 'child');
      setActiveMode('child');
      if (onSelectMode) onSelectMode('child');
      if (onClose) onClose();
    } finally {
      setChildIsEntering(false);
    }
  };

  // Připojit k dítěti jako RODIČ
  const handleConnectParent = async () => {
    const cleanCode = parentInputCode.trim().replace(/\s+/g, '');
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setParentError('Zadejte prosím platný 6místný číselný kód.');
      return;
    }

    setParentLoading(true);
    setParentError(null);

    try {
      // Ověření, zda uzel v Realtime Database existuje
      const session = await getChildSession(cleanCode);
      if (!session) {
        console.info(`SafePath: Sezení ${cleanCode} ještě nebylo založeno dítětem, ale párujeme kód.`);
      }

      // Uložení spárovaného kódu do localStorage a Zustand store
      localStorage.setItem('safepath_paired_child_code', cleanCode);
      localStorage.setItem('safepath_mode', 'parent');
      localStorage.setItem('safepath_disclaimer_accepted', 'true');
      setPairedChildCode(cleanCode);
      setActiveMode('parent');

      if (onSelectProfiles) onSelectProfiles(['parent']);
      if (onSelectMode) onSelectMode('parent');
      if (onClose) onClose();
    } catch (err) {
      console.warn('Ověření sezení selhalo, pokračuji s uloženým kódem:', err);
      localStorage.setItem('safepath_paired_child_code', cleanCode);
      localStorage.setItem('safepath_mode', 'parent');
      setPairedChildCode(cleanCode);
      setActiveMode('parent');

      if (onSelectProfiles) onSelectProfiles(['parent']);
      if (onSelectMode) onSelectMode('parent');
      if (onClose) onClose();
    } finally {
      setParentLoading(false);
    }
  };

  // Vstup do aplikace jako rodič bez okamžitého spárování
  const handleEnterParentWithoutPairing = () => {
    localStorage.setItem('safepath_mode', 'parent');
    localStorage.setItem('safepath_disclaimer_accepted', 'true');
    setActiveMode('parent');
    if (onSelectProfiles) onSelectProfiles(['parent']);
    if (onSelectMode) onSelectMode('parent');
    if (onClose) onClose();
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden select-none">
      {/* Vizuální efekty pozadí */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[100px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[100px] rounded-full"></div>
      </div>

      <div className="z-10 w-full max-w-xl bg-slate-800/90 backdrop-blur-md rounded-3xl border border-slate-700 p-6 md:p-8 shadow-2xl relative">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-400 hover:text-white bg-slate-700/60 hover:bg-slate-600 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold border border-slate-600 transition-colors"
          >
            ✕
          </button>
        )}

        {/* Hlavička aplikace */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-3 mb-2">
            <div className="relative flex h-6 w-6">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-6 w-6 bg-emerald-500"></span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">SafePath</h1>
          </div>
          <p className="text-slate-400 text-sm">Živé propojení a navigace pro bezpečný návrat domů</p>
        </div>

        {/* Přepínač záložek (Karta Dítě vs Karta Rodič) */}
        <div className="flex bg-slate-950/70 p-1.5 rounded-2xl border border-slate-700/80 mb-6 shadow-inner">
          <button
            onClick={() => setActiveTab('child')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'child'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">👶</span>
            <span>Karta Dítě</span>
          </button>
          <button
            onClick={() => setActiveTab('parent')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'parent'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">👨‍👧</span>
            <span>Karta Rodič</span>
          </button>
        </div>

        {/* OBSAH KARTY: DÍTĚ */}
        {activeTab === 'child' && (
          <div className="flex flex-col items-center text-center animate-fadeIn">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-3xl mb-3">
              📱
            </div>

            <h2 className="text-xl font-bold text-white mb-1">Párovací kód pro rodiče</h2>
            <p className="text-slate-400 text-xs mb-6 max-w-sm">
              Tento kód zadejte do telefonu rodiče v záložce Rodič. Po vstupu do mapy bude vaše poloha v reálném čase přenášena přes Firebase.
            </p>

            {/* Velký kód pro rodiče */}
            <div className="w-full bg-slate-950 border-2 border-emerald-500/40 rounded-2xl p-5 mb-4 shadow-xl flex flex-col items-center justify-center">
              <span className="text-xs uppercase font-bold tracking-widest text-emerald-400 mb-1">
                Kód pro rodiče
              </span>
              <div className="text-4xl md:text-5xl font-black text-white tracking-widest font-mono py-1">
                [{formatDisplayCode(childCode)}]
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleCopyChildCode}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-emerald-300 font-semibold px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <span>{childCopied ? '✓' : '📋'}</span>
                  <span>{childCopied ? 'Kód zkopírován' : 'Kopírovat kód'}</span>
                </button>
                <button
                  onClick={handleRegenerateCode}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95"
                  title="Vygenerovat nový kód"
                >
                  <span>🔄</span>
                  <span>Nový kód</span>
                </button>
              </div>
            </div>

            <div className="w-full text-left bg-slate-900/60 border border-slate-700/60 rounded-xl p-3 mb-6 text-xs text-slate-400 flex items-center gap-2.5">
              <span className="text-base text-emerald-400">📡</span>
              <span>Po kliknutí níže se automaticky aktivuje GPS sledování a vysílání souřadnic.</span>
            </div>

            {/* Tlačítko: Vstoupit do mapy */}
            <button
              onClick={handleEnterChildMap}
              disabled={childIsEntering}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-bold py-4 px-4 rounded-xl text-lg transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <span>{childIsEntering ? '⏳' : '🗺️'}</span>
              <span>{childIsEntering ? 'Připojuji GPS...' : 'Vstoupit do mapy'}</span>
            </button>
          </div>
        )}

        {/* OBSAH KARTY: RODIČ */}
        {activeTab === 'parent' && (
          <div className="flex flex-col animate-fadeIn">
            <div className="text-center mb-4">
              <div className="w-14 h-14 mx-auto bg-cyan-500/10 border border-cyan-500/30 rounded-full flex items-center justify-center text-3xl mb-3">
                🛡️
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Rodičovský dispečink</h2>
              <p className="text-slate-400 text-xs max-w-sm mx-auto">
                Zadejte 6místný kód zobrazený na telefonu dítěte pro zahájení živého dohledu a kontrolu bezpečnostního koridoru.
              </p>
            </div>

            {/* Vstup pro 6místný kód */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2 text-center">
                Zadejte 6místný kód dítěte
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={parentInputCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setParentInputCode(val);
                  setParentError(null);
                }}
                placeholder="např. 482915"
                className="w-full bg-slate-950 border-2 border-slate-700 focus:border-cyan-500 rounded-xl text-center text-3xl md:text-4xl font-mono font-black text-white tracking-widest py-3.5 focus:outline-none transition-colors shadow-inner"
              />
              {parentError && (
                <p className="text-rose-400 text-xs mt-2 text-center font-medium animate-shake">
                  {parentError}
                </p>
              )}
            </div>

            {/* Důležité právní upozornění pro rodiče */}
            {!disclaimerAccepted && (
              <div className="mb-4 p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs shadow-lg leading-relaxed">
                <p className="mb-2 text-amber-200/90 font-medium">
                  „SafePath je asistenční nástroj. Vyhodnocení bezpečnosti tras je algoritmické a nenahrazuje dohled zákonného zástupce.“
                </p>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={hasCheckedConsent}
                    onChange={(e) => setHasCheckedConsent(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-[11px] font-medium leading-tight text-amber-100/90">
                    Rozumím a beru na vědomí.
                  </span>
                </label>
              </div>
            )}

            {/* Tlačítko: Připojit k dítěti */}
            <button
              onClick={handleConnectParent}
              disabled={parentLoading || parentInputCode.trim().length !== 6 || (!disclaimerAccepted && !hasCheckedConsent)}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 px-4 rounded-xl text-lg transition-all shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 active:scale-[0.98] mb-3"
            >
              <span>{parentLoading ? '⏳' : '🔗'}</span>
              <span>{parentLoading ? 'Ověřuji propojení...' : 'Připojit k dítěti'}</span>
            </button>

            {/* Alternativní vstup bez párování */}
            <button
              onClick={handleEnterParentWithoutPairing}
              disabled={!disclaimerAccepted && !hasCheckedConsent}
              className="w-full bg-slate-700/60 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all border border-slate-600/60 flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <span>Vstoupit do mapy bez spárování</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuthModal;
