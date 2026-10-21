import React from 'react';

export interface AudioNavToggleProps {
  isVoiceEnabled: boolean;
  onToggle: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Plovoucí kulaté tlačítko na mapě pro zapnutí / vypnutí hlasových a haptických navigačních pokynů.
 * Výchozí stav: Přeškrtnutý reproduktor (VolumeX), tmavý slate-800 s bílou ikonou.
 * Aktivní stav: Nepřeškrtnutý reproduktor (Volume2), zelené zvýraznění (#10b981) se zvukovými vlnami.
 */
export function AudioNavToggle({
  isVoiceEnabled,
  onToggle,
  className = '',
  style
}: AudioNavToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-12 h-12 rounded-full shadow-2xl border flex items-center justify-center transition-all duration-300 active:scale-90 relative ${
        isVoiceEnabled
          ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400 shadow-[0_0_18px_rgba(16,185,129,0.55)]'
          : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700/80 shadow-lg'
      } ${className}`}
      title={isVoiceEnabled ? 'Hlasové pokyny aktivní (kliknutím vypnout)' : 'Zapnout hlasové a haptické pokyny pro děti'}
      aria-label={isVoiceEnabled ? 'Vypnout hlasové pokyny' : 'Zapnout hlasové pokyny'}
      style={style}
    >
      {isVoiceEnabled ? (
        // Ikona Volume2 se zvukovými vlnami
        <svg
          className="w-6 h-6 animate-pulse"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" fillOpacity="0.2" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      ) : (
        // Ikona VolumeX (přeškrtnutý reproduktor)
        <svg
          className="w-6 h-6 text-slate-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <line x1="23" y1="9" x2="17" y2="15" />
          <line x1="17" y1="9" x2="23" y2="15" />
        </svg>
      )}

      {/* Zelený pulsující majáček při aktivním hlasovém doprovodu */}
      {isVoiceEnabled && (
        <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400"></span>
        </span>
      )}
    </button>
  );
}

export default AudioNavToggle;
