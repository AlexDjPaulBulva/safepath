import React, { useEffect, useState } from 'react';
import { AuthModal } from './AuthModal';
import { ParentDashboard } from './ParentDashboard';
import { ChildCompanion } from './ChildCompanion';
import { ResetPasswordModal } from './ResetPasswordModal';
import { useAppStore } from '../store/useAppStore';

export type AppMode = 'map' | 'login' | 'parent' | 'child';

const readStoredMode = (): 'parent' | 'night_girl' => {
  if (typeof window === 'undefined') return 'parent';
  const mode = window.localStorage.getItem('safepath_mode');
  const validModes = ['parent', 'night_girl'];
  return validModes.includes(mode ?? '') ? (mode as 'parent' | 'night_girl') : 'parent';
};

export default function SafePathApp() {
  const [appMode, setAppMode] = useState<AppMode>('login');
  const [initialProfiles, setInitialProfiles] = useState<string[]>(['parent']);
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [prefilledEmail, setPrefilledEmail] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const { setActiveMode } = useAppStore();

  // Kontrola URL parametrů pro in-app reset hesla (?mode=resetPassword&oobCode=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const mode = urlParams.get('mode');
      const oobCode = urlParams.get('oobCode');

      if (mode === 'resetPassword') {
        if (oobCode && oobCode.trim().length > 0) {
          setResetCode(oobCode.trim());
        } else {
          // Pokud parametr mode=resetPassword neobsahuje platný ověřovací kód, okamžitě vyčisti URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    } catch (e) {
      console.warn('Chyba při čtení URL parametrů pro reset hesla:', e);
    }
  }, []);

  useEffect(() => {
    const savedMode = readStoredMode();
    setInitialProfiles([savedMode]);
    setActiveMode(savedMode);
    window.localStorage.setItem('safepath_mode', savedMode);
  }, [setActiveMode]);

  // Automatické skrytí toast zprávy po 3.5 sekundách
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Pokud je v URL přítomen jednorázový kód pro reset hesla, zobrazíme moderní SafePath in-app modal
  if (resetCode) {
    return (
      <ResetPasswordModal
        oobCode={resetCode}
        onSuccess={(email) => {
          setPrefilledEmail(email);
          setToastMessage('Heslo bylo úspěšně změněno.');
          setResetCode(null);
          setAppMode('login');

          // Vyčištění URL parametrů
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }}
        onClose={() => {
          setResetCode(null);
          setAppMode('login');

          // Okamžité vyčištění URL parametrů při zavření/zrušení
          if (typeof window !== 'undefined') {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        }}
      />
    );
  }

  return (
    <div className="relative min-h-screen">
      {/* Plovoucí globální toast notifikace po úspěšném resetu (centrovaně nahoře, nekoliduje s UI) */}
      {toastMessage && (
        <div 
          className="fixed z-[2500] pointer-events-none flex justify-center w-full max-w-md px-4"
          style={{ top: '1rem', left: '50%', transform: 'translateX(-50%)' }}
        >
          <div className="bg-emerald-600/95 text-white px-5 py-3 rounded-2xl shadow-2xl border border-emerald-400 backdrop-blur-md flex items-center gap-3 text-sm font-bold pointer-events-auto animate-fadeIn">
            <span className="text-lg">✅</span>
            <span>{toastMessage}</span>
            <button
              onClick={() => setToastMessage(null)}
              className="ml-2 hover:bg-emerald-700/60 p-1 rounded-lg text-emerald-100 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {appMode === 'login' && (
        <AuthModal
          onSelectMode={setAppMode}
          onSelectProfiles={setInitialProfiles}
          initialEmail={prefilledEmail}
          initialToastMessage={toastMessage || undefined}
        />
      )}

      {appMode === 'child' && (
        <ChildCompanion onBack={() => setAppMode('login')} />
      )}

      {appMode !== 'login' && appMode !== 'child' && (
        <ParentDashboard
          isPublic={true}
          initialProfiles={initialProfiles}
          onBackToMenu={() => setAppMode('login')}
          onLoginClick={() => setAppMode('login')}
        />
      )}
    </div>
  );
}
