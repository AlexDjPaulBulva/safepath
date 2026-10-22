import React from 'react';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PrivacyModal({ isOpen, onClose }: PrivacyModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn font-sans">
      <div className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl p-4 sm:p-6 sm:p-7 shadow-2xl relative text-white my-auto">
        {/* Zavírací křížek */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 w-9 h-9 min-w-[36px] min-h-[36px] rounded-full flex items-center justify-center transition-all border border-slate-700 text-sm font-bold active:scale-90"
          aria-label="Zavřít"
        >
          ✕
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-xl text-emerald-400">
            🛡️
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black tracking-tight text-white">
              Ochrana soukromí a GDPR
            </h3>
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              Princip minimalizace dat (Privacy by Design)
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mt-3 mb-5">
          Bezpečnost a důvěra jsou jádrem aplikace SafePath. Vaše geolokační data chráníme striktním technickým zabezpečením:
        </p>

        <div className="space-y-3.5 text-xs text-slate-300 max-h-[60vh] overflow-y-auto pr-1">
          {/* Bod 1 */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3">
            <span className="text-lg shrink-0">📍</span>
            <div>
              <strong className="text-slate-100 block mb-0.5">Pouze reálný čas, žádná historie</strong>
              GPS data jsou přenášena výhradně v reálném čase formou přímého live streamu mezi zařízením dítěte a rodičovským dispečinkem. V databázi se udržuje výhradně <em>poslední známý bod</em>.
            </div>
          </div>

          {/* Bod 2 */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3">
            <span className="text-lg shrink-0">🗑️</span>
            <div>
              <strong className="text-slate-100 block mb-0.5">Okamžité a trvalé mazání</strong>
              Při ukončení navigace nebo odpojení je záznam z Firebase okamžitě a kompletně odstraněn. Všechna neaktivní sezení starší než 2 hodiny jsou automaticky smazána bez možnosti obnovení.
            </div>
          </div>

          {/* Bod 3 */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3">
            <span className="text-lg shrink-0">🔒</span>
            <div>
              <strong className="text-slate-100 block mb-0.5">Žádný prodej dat ani reklama</strong>
              Polohová data nikdy neprodáváme třetím stranám, nepoužíváme je k profilování, reklamním účelům ani pro sledování chování uživatele.
            </div>
          </div>

          {/* Bod 4 */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3">
            <span className="text-lg shrink-0">⚖️</span>
            <div>
              <strong className="text-slate-100 block mb-0.5">Soulad s Nařízením GDPR</strong>
              Uživatel má plné právo na okamžitý výmaz svých údajů, informovanost o zpracování a ochranu integrity přenášených dat podle evropských právních standardů.
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-xl text-xs transition-all shadow-lg active:scale-95 min-h-[44px] flex items-center justify-center"
          >
            Rozumím a zavřít
          </button>
        </div>
      </div>
    </div>
  );
}

export default PrivacyModal;
