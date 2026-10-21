import React, { useState, useEffect } from 'react';
import { verifyResetCode, confirmNewPassword, getAuthErrorMessage } from '../lib/authService';

export interface ResetPasswordModalProps {
  oobCode: string;
  onSuccess: (email: string) => void;
  onClose: () => void;
}

export function ResetPasswordModal({
  oobCode,
  onSuccess,
  onClose
}: ResetPasswordModalProps) {
  const [userEmail, setUserEmail] = useState<string>('');
  const [verifyingCode, setVerifyingCode] = useState<boolean>(true);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Ověření platnosti jednorázového kódu oobCode při načtení
  useEffect(() => {
    let isMounted = true;

    async function checkCode() {
      try {
        setVerifyingCode(true);
        setCodeError(null);
        const email = await verifyResetCode(oobCode);
        if (isMounted) {
          setUserEmail(email);
          setVerifyingCode(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setCodeError(getAuthErrorMessage(err));
          setVerifyingCode(false);
        }
      }
    }

    if (oobCode) {
      checkCode();
    } else {
      setCodeError('Chybí bezpečnostní kód pro obnovu hesla.');
      setVerifyingCode(false);
    }

    return () => {
      isMounted = false;
    };
  }, [oobCode]);

  // Odeslání nového hesla
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      setSubmitError('Heslo musí mít alespoň 6 znaků.');
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Zadaná hesla se neshodují.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      await confirmNewPassword(oobCode, password);
      onSuccess(userEmail);
    } catch (err: any) {
      setSubmitError(getAuthErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 md:p-6 relative overflow-hidden select-none">
      {/* Vizuální ambientní efekty SafePath */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-emerald-500/10 blur-[100px] rounded-full"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-500/10 blur-[100px] rounded-full"></div>
      </div>

      <div className="z-10 w-full max-w-md bg-slate-800/90 backdrop-blur-md rounded-3xl border border-slate-700 p-6 md:p-8 shadow-2xl relative my-auto animate-fadeIn">
        {/* Záhlaví s logem SafePath */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-3 mb-2">
            <div className="relative flex h-6 w-6">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-6 w-6 bg-emerald-500"></span>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">SafePath</h1>
          </div>

          <div className="flex justify-center mt-1 mb-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              🛡️ Zabezpečená obnova hesla
            </span>
          </div>

          {userEmail && (
            <p className="text-slate-400 text-xs">
              Účet: <span className="text-cyan-300 font-semibold">{userEmail}</span>
            </p>
          )}
        </div>

        {/* 1. Stav: Ověřování kódu z e-mailu */}
        {verifyingCode && (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-sm font-medium text-slate-300">
              Ověřování platnosti bezpečnostního kódu...
            </p>
          </div>
        )}

        {/* 2. Stav: Chyba kódu (expirovaný / neplatný) */}
        {!verifyingCode && codeError && (
          <div className="flex flex-col items-center text-center gap-4 py-2">
            <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center text-3xl">
              ⚠️
            </div>
            <div>
              <h3 className="text-base font-bold text-white mb-1">Neplatný odkaz</h3>
              <p className="text-xs text-rose-300 max-w-xs">{codeError}</p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md active:scale-95 mt-2"
            >
              Přejít na přihlášení
            </button>
          </div>
        )}

        {/* 3. Stav: Formulář pro zadání nového hesla */}
        {!verifyingCode && !codeError && (
          <form method="post" onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Viditelné pole pro e-mail (username) garantující automatické vyplnění v prohlížeči */}
            <div>
              <label htmlFor="reset-username" className="block text-xs font-semibold text-slate-300 mb-1">
                Účet (e-mail)
              </label>
              <input
                id="reset-username"
                type="email"
                name="username"
                value={userEmail}
                autoComplete="username"
                readOnly
                className="w-full bg-slate-950/70 border border-slate-700/80 rounded-xl px-4 py-3 text-sm text-cyan-300 font-semibold cursor-default select-all focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="new-password" className="block text-xs font-semibold text-slate-300 mb-1">
                Nové heslo (min. 6 znaků)
              </label>
              <div className="relative">
                <input
                  id="new-password"
                  name="new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setSubmitError(null);
                  }}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 pr-11 text-sm text-white focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 text-base transition-colors"
                  title={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                  aria-label={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirm-new-password" className="block text-xs font-semibold text-slate-300 mb-1">
                Potvrzení nového hesla
              </label>
              <div className="relative">
                <input
                  id="confirm-new-password"
                  name="confirm-new-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setSubmitError(null);
                  }}
                  placeholder="••••••••"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-4 py-3 pr-11 text-sm text-white focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 text-base transition-colors"
                  title={showConfirmPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                  aria-label={showConfirmPassword ? 'Skrýt heslo' : 'Zobrazit heslo'}
                >
                  {showConfirmPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {submitError && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs font-medium">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 active:scale-[0.98] mt-1"
            >
              <span>{submitting ? '⏳' : '💾'}</span>
              <span>{submitting ? 'Ukládám nové heslo...' : 'Uložit nové heslo a přihlásit se'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white font-semibold text-center mt-2 cursor-pointer transition-colors"
            >
              Zrušit a přejít na přihlášení
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default ResetPasswordModal;
