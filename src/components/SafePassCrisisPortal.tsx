import React, { useState, useEffect } from 'react';
import { reportSafePassCrisis } from '../lib/liveSync';
import { reverseGeocode } from '../lib/geocoding';

interface SafePassCrisisPortalProps {
  childCode: string;
  onContinueToApp?: () => void;
}

export function SafePassCrisisPortal({ childCode, onContinueToApp }: SafePassCrisisPortalProps) {
  const [venueName, setVenueName] = useState('');
  const [reporterAddress, setReporterAddress] = useState('');
  const [gpsLocation, setGpsLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'acquiring' | 'acquired' | 'error'>('idle');
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [reportedSummary, setReportedSummary] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Pokus o automatické nebo nabídnuté zjištění GPS nálezce
  const requestRescuerGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('error');
      setGpsErrorMsg('Prohlížeč nepodporuje geolokaci.');
      return;
    }

    setGpsStatus('acquiring');
    setGpsErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGpsLocation(coords);
        setGpsStatus('acquired');

        try {
          const street = await reverseGeocode(coords.lat, coords.lng);
          if (street) {
            setReporterAddress(street);
          }
        } catch (e) {
          console.warn('Reverzní geokódování polohy nálezce selhalo:', e);
        }
      },
      (err) => {
        console.warn('Chyba při čtení GPS nálezce:', err);
        setGpsStatus('error');
        setGpsErrorMsg('Poloha nebyla povolena. Můžete zadat název místa nebo adresu ručně níže.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  useEffect(() => {
    // Nabídnout GPS ihned po načtení
    requestRescuerGps();
  }, []);

  const handleSendRescueReport = async () => {
    if (!childCode) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      await reportSafePassCrisis(childCode, {
        venueName: venueName.trim() || undefined,
        reporterAddress: reporterAddress.trim() || undefined,
        reporterLocation: gpsLocation
      });

      const locText = venueName.trim() 
        ? `${venueName.trim()}${reporterAddress.trim() ? ` (${reporterAddress.trim()})` : ''}`
        : (reporterAddress.trim() || (gpsLocation ? `${gpsLocation.lat.toFixed(5)}, ${gpsLocation.lng.toFixed(5)}` : 'Praha'));

      setReportedSummary(`Dítě nahlášeno na krizovém bodě / Safe Haven! Poloha nálezce: ${locText}`);
      setIsSuccess(true);
    } catch (err: any) {
      console.error('Chyba odeslání krizové zprávy SafePass:', err);
      setErrorMessage('Nepodařilo se odeslat zprávu rodičům. Zkontrolujte připojení k internetu a zkuste to znovu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 md:p-8 font-sans selection:bg-emerald-500 selection:text-white">
      {/* Horní hlavička s brandem a krizovým štítkem */}
      <header className="max-w-2xl mx-auto w-full flex items-center justify-between pb-6 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-950">
            <span className="text-xl">🛡️</span>
          </div>
          <div>
            <div className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              SafePath <span className="text-emerald-400">SafePass</span>
            </div>
            <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
              Oficiální systém záchrany a bezpečí
            </div>
          </div>
        </div>

        <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          Krizový portál
        </div>
      </header>

      {/* Hlavní obsah */}
      <main className="max-w-xl mx-auto w-full my-auto py-8">
        {!isSuccess ? (
          <div className="bg-slate-900 border-2 border-emerald-500/60 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(16,185,129,0.15)] relative backdrop-blur-xl">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-3xl mb-4 shadow-inner">
                🤝
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight mb-2">
                Nalezli jste dítě se SafePass kartou nebo je dítě v nouzi?
              </h1>
              <p className="text-sm text-slate-300 leading-relaxed max-w-md mx-auto">
                Tento systém okamžitě a bezpečně spojí vaši polohu s rodiči dítěte v reálném čase. Nemusíte nic instalovat ani se registrovat.
              </p>
            </div>

            {/* Identifikátor dítěte */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-6 text-center shadow-inner">
              <span className="text-[11px] uppercase tracking-wider font-extrabold text-slate-400 block mb-1">
                Kód nalezeného dítěte (SafePass ID)
              </span>
              <span className="text-3xl font-black font-mono tracking-widest text-emerald-400">
                {childCode}
              </span>
            </div>

            {/* Volitelná pole pro přesnější specifikaci místa */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  🏢 Název provozovny / místa (volitelné)
                </label>
                <input
                  type="text"
                  placeholder="např. Lékárna Dr. Max, Večerka, Železniční stanice..."
                  value={venueName}
                  onChange={(e) => setVenueName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  📍 Adresa / ulice (volitelné nebo zjištěné z GPS)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="např. Sokolovská 42, Praha 8"
                    value={reporterAddress}
                    onChange={(e) => setReporterAddress(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={requestRescuerGps}
                    className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3.5 py-3 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 active:scale-95"
                    title="Zaměřit mou GPS polohu"
                  >
                    <span>🛰️</span>
                    <span className="hidden sm:inline">Zaměřit</span>
                  </button>
                </div>
              </div>

              {/* Stav GPS */}
              <div className="text-xs">
                {gpsStatus === 'acquiring' && (
                  <div className="text-amber-400 flex items-center gap-1.5 font-medium animate-pulse">
                    <span>🛰️</span> Zjišťuji vaši přesnou GPS polohu pro rodiče...
                  </div>
                )}
                {gpsStatus === 'acquired' && gpsLocation && (
                  <div className="text-emerald-400 flex items-center gap-1.5 font-medium">
                    <span>✅</span> Poloha zaměřena ({gpsLocation.lat.toFixed(5)}, {gpsLocation.lng.toFixed(5)})
                  </div>
                )}
                {gpsStatus === 'error' && gpsErrorMsg && (
                  <div className="text-slate-400 text-[11px] leading-tight">
                    ℹ️ {gpsErrorMsg}
                  </div>
                )}
              </div>
            </div>

            {errorMessage && (
              <div className="bg-rose-950/80 border border-rose-500 text-rose-200 p-3 rounded-xl text-xs mb-4 font-semibold">
                ⚠️ {errorMessage}
              </div>
            )}

            {/* Hlavní tlačítko s vysokým kontrastem */}
            <button
              onClick={handleSendRescueReport}
              disabled={isSubmitting}
              className="w-full bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 hover:from-emerald-400 hover:via-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-black text-base sm:text-lg py-4 px-6 rounded-2xl shadow-[0_0_35px_rgba(16,185,129,0.4)] border-2 border-emerald-300 transition-all transform active:scale-[0.98] flex items-center justify-center gap-3 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  <span>Odesílám zprávu na dispečink...</span>
                </>
              ) : (
                <>
                  <span className="text-2xl">📢</span>
                  <span>Odeslat zprávu rodičům: Dítě je v bezpečí u mě</span>
                </>
              )}
            </button>

            <div className="mt-5 text-center">
              <a
                href="tel:158"
                className="inline-flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 font-bold underline transition-colors"
              >
                <span>🚨</span> V případě bezprostředního ohrožení volejte Policii ČR (158)
              </a>
            </div>
          </div>
        ) : (
          /* Obrazovka potvrzení pro nálezce / personál */
          <div className="bg-slate-900 border-2 border-emerald-400 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(16,185,129,0.3)] text-center relative backdrop-blur-xl animate-fadeIn">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-4xl mx-auto mb-4 text-emerald-400 shadow-lg shadow-emerald-950">
              ✓
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2">
              Rodiče byli úspěšně informováni
            </h2>

            <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-2xl p-4 my-6 text-left">
              <div className="text-[11px] uppercase tracking-wider font-extrabold text-emerald-400 mb-1">
                Zpráva odeslaná na dispečink rodičů
              </div>
              <div className="text-sm font-bold text-white">
                {reportedSummary || `Dítě nahlášeno na krizovém bodě / Safe Haven!`}
              </div>
              <div className="text-xs text-emerald-200/80 mt-1">
                Čas odeslání: {new Date().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            </div>

            <div className="space-y-3 text-xs sm:text-sm text-slate-300 leading-relaxed max-w-md mx-auto mb-8 text-left bg-slate-950 p-4 rounded-xl border border-slate-800">
              <p>
                ❤️ <strong>Děkujeme za vaši pomoc a lidskost.</strong>
              </p>
              <p>
                Rodiče obdrželi okamžitou výstrahu na své obrazovce s vaší polohou a pravděpodobně vás brzy kontaktují nebo na místo dorazí.
              </p>
              <p className="text-slate-400 text-xs">
                Prosíme, zůstaňte s dítětem na bezpečném a viditelném místě do příchodu rodičů.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="tel:158"
                className="bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/50 font-bold py-3 px-5 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2"
              >
                <span>📞</span> Volejte 158 (Tísňová linka)
              </a>

              {onContinueToApp && (
                <button
                  onClick={onContinueToApp}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-5 rounded-xl text-xs sm:text-sm transition-all shadow-lg active:scale-95"
                >
                  Přejít do aplikace SafePath →
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Spodní patička */}
      <footer className="max-w-2xl mx-auto w-full text-center text-xs text-slate-500 pt-6 border-t border-slate-800/80">
        SafePath Community Safety Protocol • Ochrana dětí a zranitelných osob v městském prostoru
      </footer>
    </div>
  );
}

export default SafePassCrisisPortal;
