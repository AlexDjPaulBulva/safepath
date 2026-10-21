import React, { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { 
  startChildSession, 
  startGpsStreaming, 
  getChildSession 
} from '../lib/liveSync';
import {
  registerParent,
  loginParent,
  logoutParent,
  resetParentPassword,
  subscribeToAuthChanges,
  savePairedChildToParent,
  removePairedChildFromParent,
  subscribeToParentPairedChildren,
  getAuthErrorMessage
} from '../lib/authService';

export interface AuthModalProps {
  onSelectMode?: (mode: 'parent' | 'child') => void;
  onSelectProfiles?: (profiles: string[]) => void;
  onClose?: () => void;
  initialTab?: 'parent' | 'child';
  initialEmail?: string;
  initialToastMessage?: string;
}

export function AuthModal({
  onSelectMode,
  onSelectProfiles,
  onClose,
  initialTab = 'parent',
  initialEmail = '',
  initialToastMessage = ''
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<'parent' | 'child'>(initialTab);
  
  // DĚTSKÝ KÓD
  const [childCode, setChildCode] = useState<string>('');
  const [childCopied, setChildCopied] = useState(false);
  const [childIsEntering, setChildIsEntering] = useState(false);

  // RODIČ - AUTENTIZACE (E-mail + Heslo)
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot_password'>('login');
  const [emailInput, setEmailInput] = useState(initialEmail);
  const [passwordInput, setPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(initialToastMessage || null);

  useEffect(() => {
    if (initialEmail) {
      setEmailInput(initialEmail);
    }
  }, [initialEmail]);

  useEffect(() => {
    if (initialToastMessage) {
      setAuthSuccessMessage(initialToastMessage);
    }
  }, [initialToastMessage]);

  // RODIČ - PÁROVÁNÍ
  const [parentInputCode, setParentInputCode] = useState<string>('');
  const [parentConnectLoading, setParentConnectLoading] = useState(false);
  const [parentConnectError, setParentConnectError] = useState<string | null>(null);

  // Globální Zustand store
  const { 
    setActiveMode, 
    setPairedChildCode, 
    pairedChildCode,
    setMyChildCode,
    currentUser,
    setCurrentUser,
    pairedChildrenList,
    setPairedChildrenList
  } = useAppStore();

  // Právní disclaimer pro rodiče
  const [disclaimerAccepted, setDisclaimerAccepted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('safepath_disclaimer_accepted') === 'true';
  });
  const [hasCheckedConsent, setHasCheckedConsent] = useState(false);

  // 1. Sledování stavu přihlášení (onAuthStateChanged)
  useEffect(() => {
    const unsubscribeAuth = subscribeToAuthChanges((firebaseUser) => {
      if (firebaseUser) {
        setCurrentUser({ uid: firebaseUser.uid, email: firebaseUser.email });
      } else {
        setCurrentUser(null);
        setPairedChildrenList([]);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, [setCurrentUser, setPairedChildrenList]);

  // 2. Trvalé načítání spárovaných dětí přihlášeného rodiče z Firebase
  useEffect(() => {
    if (!currentUser?.uid) return;

    const unsubscribeChildren = subscribeToParentPairedChildren(currentUser.uid, (children) => {
      setPairedChildrenList(children);
      // Pokud rodič nemá vybrané aktivní dítě a má k dispozici spárovaná zařízení, předvolíme první
      if (children.length > 0 && !pairedChildCode) {
        const firstCode = children[0];
        setPairedChildCode(firstCode);
      }
    });

    return () => {
      unsubscribeChildren();
    };
  }, [currentUser?.uid, pairedChildCode, setPairedChildCode, setPairedChildrenList]);

  // 3. Automatické vygenerování nebo načtení 6místného kódu pro DÍTĚ
  useEffect(() => {
    let code = localStorage.getItem('safepath_child_code');
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
      code = Math.floor(100000 + Math.random() * 900000).toString();
      localStorage.setItem('safepath_child_code', code);
    }
    setChildCode(code);
    setMyChildCode(code);
  }, [setMyChildCode]);

  // Načtení uloženého spárovaného kódu pro rodiče
  useEffect(() => {
    const savedPaired = localStorage.getItem('safepath_paired_child_code');
    if (savedPaired && /^\d{6}$/.test(savedPaired)) {
      setParentInputCode(savedPaired);
    }
  }, []);

  // Formátování kódu s mezerou (např. "482 915")
  const formatDisplayCode = (raw: string) => {
    if (!raw || raw.length !== 6) return raw || '000 000';
    return `${raw.slice(0, 3)} ${raw.slice(3)}`;
  };

  // Vygenerování nového kódu pro dítě
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

  // Vstoupit do mapy jako DÍTĚ (100% bezheslové)
  const handleEnterChildMap = async () => {
    setChildIsEntering(true);
    const code = childCode || localStorage.getItem('safepath_child_code') || '123456';
    
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
      await startChildSession(code, coords);
      startGpsStreaming(code);
      
      localStorage.setItem('safepath_mode', 'child');
      setActiveMode('child');
      if (onSelectProfiles) onSelectProfiles(['child']);
      if (onSelectMode) onSelectMode('child');
      if (onClose) onClose();
    } catch (err) {
      console.error('Chyba při inicializaci dětského sezení:', err);
      localStorage.setItem('safepath_mode', 'child');
      setActiveMode('child');
      if (onSelectMode) onSelectMode('child');
      if (onClose) onClose();
    } finally {
      setChildIsEntering(false);
    }
  };

  // PŘIHLÁŠENÍ RODIČE (E-mail + Heslo)
  const handleParentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      setAuthError('Zadejte prosím e-mailovou adresu.');
      return;
    }
    if (!passwordInput) {
      setAuthError('Zadejte prosím heslo.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccessMessage(null);

    try {
      const user = await loginParent(emailInput, passwordInput);
      setCurrentUser({ uid: user.uid, email: user.email });
      setAuthError(null);
    } catch (error: any) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  // REGISTRACE RODIČE (E-mail + Heslo + Potvrzení)
  const handleParentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      setAuthError('Zadejte prosím e-mailovou adresu.');
      return;
    }
    if (passwordInput.length < 6) {
      setAuthError('Heslo musí mít alespoň 6 znaků.');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setAuthError('Zadaná hesla se neshodují');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccessMessage(null);

    try {
      const user = await registerParent(emailInput, passwordInput);
      setCurrentUser({ uid: user.uid, email: user.email });
      setAuthError(null);
    } catch (error: any) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  // OBNOVENÍ ZAPOMENUTÉHO HESLA RODIČE
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) {
      setAuthError('Zadejte prosím e-mailovou adresu.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    setAuthSuccessMessage(null);

    try {
      await resetParentPassword(emailInput);
      setAuthSuccessMessage('Odkaz pro obnovení hesla byl odeslán na váš e-mail. Zkontrolujte prosím svoji doručenou poštu i složku se spamem.');
    } catch (error: any) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setAuthLoading(false);
    }
  };

  // ODHLÁŠENÍ RODIČE
  const handleParentLogout = async () => {
    try {
      await logoutParent();
      setCurrentUser(null);
      setPairedChildrenList([]);
    } catch (err) {
      console.error('Chyba při odhlašování:', err);
    }
  };

  // PŘIPOJIT K DÍTĚTI A ULOŽIT DO ÚČTU RODIČE (TRVALÉ PÁROVÁNÍ)
  const handleConnectAndSaveChild = async (codeToPair?: string) => {
    const rawCode = codeToPair || parentInputCode;
    const cleanCode = rawCode.trim().replace(/\s+/g, '');
    
    if (cleanCode.length !== 6 || !/^\d{6}$/.test(cleanCode)) {
      setParentConnectError('Zadejte prosím platný 6místný číselný kód.');
      return;
    }

    setParentConnectLoading(true);
    setParentConnectError(null);

    try {
      // 1. Ověření existence sezení ve Firebase
      const session = await getChildSession(cleanCode);
      if (!session) {
        console.info(`SafePath: Sezení ${cleanCode} zatím nebylo založeno dítětem, ale párujeme kód.`);
      }

      // 2. Trvalé uložení k účtu přihlášeného rodiče do Firebase
      if (currentUser?.uid) {
        await savePairedChildToParent(currentUser.uid, cleanCode);
      }

      // 3. Uložení lokálně a přechod do dispečinku
      localStorage.setItem('safepath_paired_child_code', cleanCode);
      localStorage.setItem('safepath_mode', 'parent');
      localStorage.setItem('safepath_disclaimer_accepted', 'true');
      setPairedChildCode(cleanCode);
      setActiveMode('parent');

      if (onSelectProfiles) onSelectProfiles(['parent']);
      if (onSelectMode) onSelectMode('parent');
      if (onClose) onClose();
    } catch (err) {
      console.warn('Upozornění při párování:', err);
      // I při dočasném výpadku uložíme lokálně a pokračujeme
      localStorage.setItem('safepath_paired_child_code', cleanCode);
      localStorage.setItem('safepath_mode', 'parent');
      setPairedChildCode(cleanCode);
      setActiveMode('parent');

      if (onSelectProfiles) onSelectProfiles(['parent']);
      if (onSelectMode) onSelectMode('parent');
      if (onClose) onClose();
    } finally {
      setParentConnectLoading(false);
    }
  };

  // Odebrání dříve spárovaného dítěte z účtu rodiče
  const handleRemoveChild = async (childCodeToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser?.uid) return;
    try {
      await removePairedChildFromParent(currentUser.uid, childCodeToRemove);
      if (pairedChildCode === childCodeToRemove) {
        setPairedChildCode(null);
        localStorage.removeItem('safepath_paired_child_code');
      }
    } catch (err) {
      console.error('Chyba při odebírání dítěte z profilu:', err);
    }
  };

  // Vstup do aplikace bez spárování
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
      {/* Vizuální efekty na pozadí */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[100px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[100px] rounded-full"></div>
      </div>

      <div className="z-10 w-full max-w-xl bg-slate-800/90 backdrop-blur-md rounded-3xl border border-slate-700 p-6 md:p-8 shadow-2xl relative my-auto">
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
          <p className="text-slate-400 text-sm">Autentizace a živý dohled pro bezpečný návrat domů</p>
        </div>

        {/* Hlavní přepínač záložek: RODIČ vs DÍTĚ */}
        <div className="flex bg-slate-950/70 p-1.5 rounded-2xl border border-slate-700/80 mb-6 shadow-inner">
          <button
            onClick={() => setActiveTab('parent')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'parent'
                ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">👨‍👩‍👧</span>
            <span>Rodičovský dispečink</span>
          </button>
          <button
            onClick={() => setActiveTab('child')}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
              activeTab === 'child'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span className="text-lg">🐣</span>
            <span>Jsem dítě / Chráněná osoba</span>
          </button>
        </div>

        {/* ============================================================== */}
        {/* OBSAH ZÁLOŽKY: DÍTĚ (100% BEZHESLOVÉ PŘES 6MÍSTNÝ KÓD) */}
        {/* ============================================================== */}
        {activeTab === 'child' && (
          <div className="flex flex-col items-center text-center animate-fadeIn">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center text-3xl mb-3">
              📱
            </div>

            <h2 className="text-xl font-bold text-white mb-1">Párovací kód pro rodiče</h2>
            <p className="text-slate-400 text-xs mb-6 max-w-sm">
              Tento kód nadiktujte nebo pošlete rodiči. Po vstupu do mapy bude vaše poloha v reálném čase přenášena přes Firebase.
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
              <span>100% bezpečné a bez hesla. Poloha se začne sdílet kliknutím na tlačítko níže.</span>
            </div>

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

        {/* ============================================================== */}
        {/* OBSAH ZÁLOŽKY: RODIČOVSKÝ DISPEČINK (FIREBASE AUTH + TRVALÉ PÁROVÁNÍ) */}
        {/* ============================================================== */}
        {activeTab === 'parent' && (
          <div className="flex flex-col animate-fadeIn">
            {/* Stav 1: Rodič je přihlášený */}
            {currentUser ? (
              <div className="flex flex-col">
                {/* Přihlášený profilový banner */}
                <div className="bg-slate-900/80 border border-cyan-500/40 rounded-2xl p-4 mb-5 flex items-center justify-between shadow-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-400 flex items-center justify-center text-lg">
                      🛡️
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-400">
                        Účet rodiče aktivní
                      </div>
                      <div className="text-sm font-bold text-white truncate max-w-[200px] sm:max-w-[260px]">
                        {currentUser.email}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleParentLogout}
                    className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Odhlásit
                  </button>
                </div>

                {/* Seznam dříve spárovaných dětí (Trvalé párování přes Firebase) */}
                {pairedChildrenList.length > 0 && (
                  <div className="mb-5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                      Dříve spárovaná zařízení ({pairedChildrenList.length}):
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {pairedChildrenList.map((code) => {
                        const isSelected = pairedChildCode === code;
                        return (
                          <div
                            key={code}
                            onClick={() => handleConnectAndSaveChild(code)}
                            className={`cursor-pointer rounded-xl p-3 border transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-cyan-950/60 border-cyan-400 shadow-md shadow-cyan-900/40'
                                : 'bg-slate-900/60 border-slate-700 hover:border-slate-500'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-xl">👶</span>
                              <div>
                                <div className="text-xs text-slate-400 font-medium">Dítě kód:</div>
                                <div className="text-base font-black font-mono text-white tracking-wider">
                                  {formatDisplayCode(code)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-cyan-400 bg-cyan-950/80 px-2 py-1 rounded-md border border-cyan-800">
                                Sledovat
                              </span>
                              <button
                                onClick={(e) => handleRemoveChild(code, e)}
                                title="Odebrat toto zařízení"
                                className="text-slate-500 hover:text-rose-400 p-1 rounded transition-colors text-sm"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Zadání nového párovacího kódu */}
                <div className="bg-slate-900/60 border border-slate-700/80 rounded-2xl p-4 mb-4">
                  <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
                    <span>➕</span> Spárovat další telefon dítěte
                  </h3>
                  <p className="text-xs text-slate-400 mb-3">
                    Zadejte 6místný kód zobrazený na telefonu dítěte. Automaticky se trvale uloží k vašemu profilu.
                  </p>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={parentInputCode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setParentInputCode(val);
                        setParentConnectError(null);
                      }}
                      placeholder="např. 482915"
                      className="flex-1 bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl text-center text-2xl font-mono font-black text-white tracking-widest py-2.5 focus:outline-none transition-colors"
                    />
                    <button
                      onClick={() => handleConnectAndSaveChild()}
                      disabled={parentConnectLoading || parentInputCode.trim().length !== 6}
                      className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold px-5 rounded-xl transition-all shadow-md active:scale-95 text-sm flex items-center gap-1.5"
                    >
                      <span>{parentConnectLoading ? '⏳' : '🔗'}</span>
                      <span>Připojit</span>
                    </button>
                  </div>

                  {parentConnectError && (
                    <p className="text-rose-400 text-xs mt-2 font-medium">
                      {parentConnectError}
                    </p>
                  )}
                </div>

                {/* Vstup do dispečinku */}
                <button
                  onClick={handleEnterParentWithoutPairing}
                  className="w-full bg-slate-700/60 hover:bg-slate-700 text-slate-200 font-semibold py-3 px-4 rounded-xl text-sm transition-all border border-slate-600/60 flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <span>🗺️</span>
                  <span>Otevřít mapový dispečink</span>
                </button>
              </div>
            ) : (
              /* Stav 2: Rodič není přihlášený (Formulář Přihlášení / Registrace) */
              <div className="flex flex-col">
                {/* FORMULÁŘ PRO PŘIHLÁŠENÍ RODIČE (authView === 'login') */}
                {authView === 'login' && (
                  <form method="post" onSubmit={handleParentLogin} className="flex flex-col gap-3.5">
                    <div className="text-center mb-1">
                      <h2 className="text-xl font-bold text-white mb-0.5">Přihlášení rodiče</h2>
                      <p className="text-xs text-slate-400">Přihlaste se ke svému účtu pro správu dětí a bezpečný dispečink</p>
                    </div>

                    <div>
                      <label htmlFor="parent-login-email" className="block text-xs font-semibold text-slate-300 mb-1">
                        E-mail
                      </label>
                      <input
                        id="parent-login-email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        required
                        value={emailInput}
                        onChange={(e) => {
                          setEmailInput(e.target.value);
                          setAuthError(null);
                          setAuthSuccessMessage(null);
                        }}
                        placeholder="rodic@email.cz"
                        className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="parent-login-password" className="block text-xs font-semibold text-slate-300">
                          Heslo
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthView('forgot_password');
                            setAuthError(null);
                            setAuthSuccessMessage(null);
                          }}
                          className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                        >
                          Zapomenuté heslo?
                        </button>
                      </div>
                      <input
                        id="parent-login-password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                        value={passwordInput}
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          setAuthError(null);
                        }}
                        placeholder="••••••••"
                        className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                      />
                    </div>

                    {authError && (
                      <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-medium">
                        {authError}
                      </div>
                    )}

                    {authSuccessMessage && (
                      <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/60 text-emerald-300 text-xs font-medium flex items-start gap-2.5">
                        <span className="text-base leading-none text-emerald-400">✓</span>
                        <span>{authSuccessMessage}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 active:scale-[0.98] mt-1"
                    >
                      <span>{authLoading ? '⏳' : '🔑'}</span>
                      <span>{authLoading ? 'Přihlašuji...' : 'Přihlásit se'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthView('register');
                        setAuthError(null);
                        setAuthSuccessMessage(null);
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-4 text-center mt-2 cursor-pointer transition-colors"
                    >
                      Nemáte ještě rodičovský účet? Zaregistrujte se
                    </button>
                  </form>
                )}

                {/* FORMULÁŘ PRO REGISTRACI RODIČE (authView === 'register') */}
                {authView === 'register' && (
                  <form method="post" onSubmit={handleParentRegister} className="flex flex-col gap-3.5">
                    <div className="text-center mb-1">
                      <h2 className="text-xl font-bold text-white mb-0.5">Vytvořit účet rodiče</h2>
                      <p className="text-xs text-slate-400">Zaregistrujte se pro trvalé párování dětí a živý dohled</p>
                    </div>

                    <div>
                      <label htmlFor="parent-register-email" className="block text-xs font-semibold text-slate-300 mb-1">
                        E-mail
                      </label>
                      <input
                        id="parent-register-email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        required
                        value={emailInput}
                        onChange={(e) => {
                          setEmailInput(e.target.value);
                          setAuthError(null);
                          setAuthSuccessMessage(null);
                        }}
                        placeholder="rodic@email.cz"
                        className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                      />
                    </div>

                    <div>
                      <label htmlFor="parent-register-password" className="block text-xs font-semibold text-slate-300 mb-1">
                        Heslo
                      </label>
                      <input
                        id="parent-register-password"
                        name="new-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={passwordInput}
                        onChange={(e) => {
                          setPasswordInput(e.target.value);
                          setAuthError(null);
                        }}
                        placeholder="Heslo (min. 6 znaků)"
                        className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                      />
                    </div>

                    <div>
                      <label htmlFor="parent-register-confirm" className="block text-xs font-semibold text-slate-300 mb-1">
                        Potvrzení hesla
                      </label>
                      <input
                        id="parent-register-confirm"
                        name="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        required
                        minLength={6}
                        value={confirmPasswordInput}
                        onChange={(e) => {
                          setConfirmPasswordInput(e.target.value);
                          setAuthError(null);
                        }}
                        placeholder="Potvrďte heslo"
                        className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                      />
                    </div>

                    {authError && (
                      <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-medium">
                        {authError}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 active:scale-[0.98] mt-1"
                    >
                      <span>{authLoading ? '⏳' : '📝'}</span>
                      <span>{authLoading ? 'Vytvářím účet...' : 'Zaregistrovat se a vytvořit profil'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthView('login');
                        setAuthError(null);
                        setAuthSuccessMessage(null);
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-4 text-center mt-2 cursor-pointer transition-colors"
                    >
                      Již máte účet? Přihlaste se
                    </button>
                  </form>
                )}

                {/* FORMULÁŘ PRO OBNOVENÍ HESLA (authView === 'forgot_password') */}
                {authView === 'forgot_password' && (
                  <form onSubmit={handleResetPassword} className="flex flex-col gap-3.5">
                    <div className="text-center mb-1">
                      <h2 className="text-xl font-bold text-white mb-0.5">Obnovení zapomenutého hesla</h2>
                      <p className="text-xs text-slate-400">
                        Zadejte svůj e-mail a my vám zašleme odkaz pro nastavení nového hesla.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        E-mail
                      </label>
                      <input
                        type="email"
                        required
                        value={emailInput}
                        onChange={(e) => {
                          setEmailInput(e.target.value);
                          setAuthError(null);
                          setAuthSuccessMessage(null);
                        }}
                        placeholder="rodic@email.cz"
                        className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white focus:outline-none transition-colors"
                      />
                    </div>

                    {authError && (
                      <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-medium">
                        {authError}
                      </div>
                    )}

                    {authSuccessMessage && (
                      <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/60 text-emerald-300 text-xs font-medium flex items-start gap-2.5">
                        <span className="text-base leading-none text-emerald-400">✓</span>
                        <span>{authSuccessMessage}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={authLoading}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 active:scale-[0.98] mt-1"
                    >
                      <span>{authLoading ? '⏳' : '✉️'}</span>
                      <span>{authLoading ? 'Odesílám...' : 'Odeslat odkaz pro obnovení'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthView('login');
                        setAuthError(null);
                        setAuthSuccessMessage(null);
                      }}
                      className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline underline-offset-4 text-center mt-2 cursor-pointer transition-colors"
                    >
                      ← Zpět na přihlášení
                    </button>
                  </form>
                )}

                {/* Vstup bez registrace */}
                <div className="mt-5 pt-4 border-t border-slate-700/60">
                  <button
                    onClick={handleEnterParentWithoutPairing}
                    className="w-full bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all border border-slate-600/50 flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <span>Vstoupit do mapy bez přihlášení</span>
                  </button>
                </div>
              </div>
            )}

            {/* Důležité právní upozornění */}
            {!disclaimerAccepted && (
              <div className="mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs shadow-lg leading-relaxed">
                <p className="mb-2 text-amber-200/90 font-medium">
                  „SafePath je asistenční nástroj a nenahrazuje dohled zákonného zástupce.“
                </p>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={hasCheckedConsent}
                    onChange={(e) => {
                      setHasCheckedConsent(e.target.checked);
                      if (e.target.checked) {
                        localStorage.setItem('safepath_disclaimer_accepted', 'true');
                        setDisclaimerAccepted(true);
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span className="text-[11px] font-medium leading-tight text-amber-100/90">
                    Rozumím a beru na vědomí.
                  </span>
                </label>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default AuthModal;
