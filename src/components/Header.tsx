import React from 'react';

interface HeaderProps {
  activeProfiles: string[];
  onOpenModeModal: () => void;
  onBackToMenu?: () => void;
  onOpenSafePass?: () => void;
}

export function Header({ activeProfiles, onOpenModeModal, onBackToMenu, onOpenSafePass }: HeaderProps) {
  const isChild = activeProfiles.length === 1 && activeProfiles.includes('parent');
  const isNightGirl = activeProfiles.length === 1 && activeProfiles.includes('night_girl');
  const isCombined = activeProfiles.length > 1;

  const handleBack = () => {
    if (onBackToMenu) {
      onBackToMenu();
    } else {
      onOpenModeModal();
    }
  };

  return (
    <>
      {/* Mobilní elegantní tlačítko Zpět (←) do hlavního menu */}
      <div 
        className="md:hidden fixed z-[1050] transition-all pointer-events-auto"
        style={{
          top: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
          left: 'calc(0.75rem + env(safe-area-inset-left, 0px))'
        }}
      >
        <button
          onClick={handleBack}
          className="w-12 h-12 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-white border border-slate-700/80 shadow-2xl active:scale-90 transition-all select-none backdrop-blur-md"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.85)' }}
          title="Zpět do hlavního menu / výběr režimu"
          aria-label="Zpět do hlavního menu"
        >
          {/* ArrowLeft ikona */}
          <svg 
            className="w-5 h-5 text-slate-200" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>
      </div>

      {/* Mobilní tlačítko SafePass */}
      {onOpenSafePass && (
        <div 
          className="md:hidden fixed z-[1050] transition-all pointer-events-auto"
          style={{
            top: 'calc(0.75rem + env(safe-area-inset-top, 0px))',
            right: 'calc(0.75rem + env(safe-area-inset-right, 0px))'
          }}
        >
          <button
            onClick={onOpenSafePass}
            className="h-12 px-3 rounded-full flex items-center justify-center text-white border border-emerald-500/80 shadow-2xl active:scale-90 transition-all select-none backdrop-blur-md bg-emerald-600/90 text-xs font-bold gap-1"
            title="Můj Safe Pass"
            aria-label="Můj Safe Pass"
          >
            <span>🏷️</span>
            <span>SafePass</span>
          </button>
        </div>
      )}

      {/* Desktopová lišta přepínače režimu a SafePass (na mobilu skryto) */}
      <div className="hidden md:flex absolute top-4 right-4 z-[1000] items-center gap-2 pointer-events-auto">
        {onOpenSafePass && (
          <button
            onClick={onOpenSafePass}
            className="bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg transition-all border border-emerald-400 flex items-center gap-1.5 text-sm active:scale-95"
            title="Zobrazit a vytisknout SafePass kartičku na batoh / klíčenku"
          >
            <span>🏷️</span>
            <span>Safe Pass</span>
          </button>
        )}
        <button 
          onClick={onOpenModeModal}
          className="bg-slate-800/90 backdrop-blur hover:bg-slate-700 text-white font-bold py-2.5 px-6 rounded-xl shadow-lg transition-all border border-slate-600 flex items-center gap-2"
        >
          {isChild && '👨‍👧 Režim: Malé děti'}
          {isNightGirl && '🌙 Režim: Dívky 14+'}
          {isCombined && `🔄 Režim: Kombinovaný (${activeProfiles.length})`}
          <span className="ml-2 text-xs text-slate-400">▼ Změnit</span>
        </button>
      </div>
    </>
  );
}

export default Header;
