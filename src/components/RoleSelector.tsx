import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

interface RoleSelectorProps {
  onSelectMode: (mode: 'parent' | 'child') => void;
  onSelectProfiles?: (profiles: string[]) => void;
}

const PROFILES = [
  {
    id: 'parent',
    icon: '👨‍👧',
    title: 'Cesta pro malé děti',
    subtitle: 'Rodičovský režim',
    description: 'Maximální bezpečnost, 100% pokrytí MKS kamerami, přechody se semafory, vynechání rizikových zón.',
    borderColor: 'border-emerald-500',
    bgColor: 'bg-emerald-900/30',
    checkColor: 'bg-emerald-500',
    glowColor: 'shadow-[0_0_12px_rgba(16,185,129,0.6)]',
  },
  {
    id: 'night_girl',
    icon: '🌙',
    title: 'Dívky 14+',
    subtitle: 'Noční bezpečný režim',
    description: 'Dobře osvětlené ulice a živé třídy, aktivní podniky v okolí. Vyhýbá se tmavým parkům a podchodům.',
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-900/30',
    checkColor: 'bg-purple-500',
    glowColor: 'shadow-[0_0_12px_rgba(168,85,247,0.6)]',
  },
];

export function RoleSelector({ onSelectMode, onSelectProfiles }: RoleSelectorProps) {
  const [activeMode, setActiveMode] = useState<string>('parent');
  const [copied, setCopied] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('safepath_disclaimer_accepted') === 'true';
  });
  const [hasCheckedConsent, setHasCheckedConsent] = useState(false);
  const { setActiveMode: setGlobalMode } = useAppStore();

  useEffect(() => {
    const savedMode = localStorage.getItem('safepath_mode');
    if (savedMode && PROFILES.some(profile => profile.id === savedMode)) {
      setActiveMode(savedMode);
    }
  }, []);

  const handleEnter = () => {
    const selectedMode = activeMode || 'parent';
    localStorage.setItem('safepath_mode', selectedMode);
    localStorage.setItem('safepath_disclaimer_accepted', 'true');
    setDisclaimerAccepted(true);
    setGlobalMode(selectedMode as 'parent' | 'night_girl');

    if (onSelectProfiles) {
      onSelectProfiles([selectedMode]);
    }
    onSelectMode('parent');
  };

  const handleCopyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error('Nepodařilo se zkopírovat odkaz:', error);
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[100px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[100px] rounded-full"></div>
      </div>

      <div className="z-10 w-full max-w-2xl bg-slate-800/80 backdrop-blur-md rounded-3xl border border-slate-700 p-6 md:p-8 shadow-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-3 mb-2">
            <div className="relative flex h-6 w-6">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-6 w-6 bg-emerald-500"></span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">SafePath</h1>
          </div>
          <p className="text-slate-400 text-sm">Váš strážce na každém kroku</p>
          <p className="text-slate-500 text-xs mt-2">Vyberte, k čemu aplikaci potřebujete. Zvolte právě jednu možnost.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {PROFILES.map(profile => {
            const isSelected = activeMode === profile.id;
            return (
              <label
                key={profile.id}
                className={`cursor-pointer rounded-2xl p-5 border-2 transition-all duration-200 ${
                  isSelected 
                    ? `${profile.borderColor} ${profile.bgColor} ${profile.glowColor}` 
                    : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="text-3xl">{profile.icon}</div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white text-base">{profile.title}</h3>
                    <p className="text-xs text-slate-400">{profile.subtitle}</p>
                  </div>
                  <input
                    type="radio"
                    name="mode-selection"
                    value={profile.id}
                    checked={isSelected}
                    onChange={() => setActiveMode(profile.id)}
                    className="h-5 w-5 accent-emerald-500"
                  />
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{profile.description}</p>
              </label>
            );
          })}
        </div>

        <div className="flex gap-3 mb-6">
          <button
            onClick={handleCopyLink}
            className="flex-1 bg-slate-700/80 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 border border-slate-600/50"
          >
            <span>{copied ? '✓' : '📋'}</span>
            <span>{copied ? 'Odkaz zkopírován' : 'Kopírovat odkaz'}</span>
          </button>
        </div>

        {/* Povinný právní disclaimer: Zodpovědnost a bezpečnost dětí */}
        {!disclaimerAccepted && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs shadow-lg leading-relaxed">
            <div className="flex items-center gap-2 text-amber-400 font-bold mb-1.5 text-sm">
              <span>⚖️</span>
              <span>Důležité právní upozornění</span>
            </div>
            <p className="mb-3 text-amber-200/90 font-medium">
              „SafePath je orientační navigační a asistenční nástroj. Vyhodnocení bezpečnosti tras je algoritmické a nenahrazuje dohled zákonného zástupce ani povinnost dodržovat pravidla silničního provozu.“
            </p>
            <label className="flex items-start gap-2.5 cursor-pointer text-slate-300 hover:text-white select-none">
              <input
                type="checkbox"
                checked={hasCheckedConsent}
                onChange={(e) => setHasCheckedConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-[11px] font-medium leading-tight text-amber-100/80">
                Beru na vědomí, že trasy a bezpečnostní zóny mají orientační charakter.
              </span>
            </label>
          </div>
        )}

        <button
          onClick={handleEnter}
          disabled={!disclaimerAccepted && !hasCheckedConsent}
          className={`w-full font-bold py-4 px-4 rounded-xl transition-all shadow-lg text-lg flex items-center justify-center gap-2 ${
            (!disclaimerAccepted && !hasCheckedConsent)
              ? 'bg-slate-700/50 text-slate-400 cursor-not-allowed border border-slate-600/40 shadow-none'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 active:scale-[0.98]'
          }`}
        >
          {disclaimerAccepted ? 'Vstoupit do aplikace' : 'Rozumím a vstupuji'}
        </button>

        <div className="mt-6 pt-5 border-t border-slate-700/50">
          <p className="text-sm text-slate-400 text-center mb-3">Pro děti a chráněné osoby</p>
          <button 
            onClick={() => onSelectMode('child')}
            className="w-full bg-slate-700 hover:bg-slate-600 border border-slate-600 text-white font-bold py-3.5 px-4 rounded-xl transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span>📱</span> Mám párovací kód od rodičů
          </button>
        </div>
      </div>
    </div>
  );
}
