import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface SafePassModalProps {
  childCode: string;
  onClose: () => void;
  childName?: string;
}

export function SafePassModal({ childCode, onClose, childName }: SafePassModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);

  const safePassUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?safepass=${encodeURIComponent(childCode)}`
    : `https://safepath-ochre.vercel.app/?safepass=${encodeURIComponent(childCode)}`;

  useEffect(() => {
    QRCode.toDataURL(safePassUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'H'
    })
      .then(url => setQrDataUrl(url))
      .catch(err => console.error('Chyba generování QR kódu SafePass:', err));
  }, [safePassUrl]);

  const handlePrintCard = () => {
    window.print();
  };

  const handleCopyLink = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(safePassUrl).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2500);
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      {/* Vlastní kartička pro tisk (aktivní při window.print()) */}
      <div className="hidden print:block fixed inset-0 bg-white text-black p-8">
        <div className="max-w-sm mx-auto border-4 border-slate-900 rounded-3xl p-6 text-center shadow-none">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-3xl">🛡️</span>
            <span className="text-2xl font-black tracking-tight">SafePath SafePass</span>
          </div>
          <div className="text-xs uppercase tracking-widest font-bold text-slate-600 mb-4">
            Krizová kartička na batoh / klíčenku
          </div>

          {qrDataUrl && (
            <img src={qrDataUrl} alt="SafePass QR Kód" className="w-56 h-56 mx-auto mb-4 border-2 border-slate-900 rounded-2xl p-2" />
          )}

          <div className="bg-slate-100 border-2 border-slate-900 rounded-xl py-2 px-4 mb-4">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Krizový kód dítěte</div>
            <div className="text-3xl font-black tracking-widest font-mono text-slate-900">{childCode}</div>
            {childName && <div className="text-sm font-bold text-slate-700 mt-0.5">{childName}</div>}
          </div>

          <div className="text-[11px] font-bold leading-relaxed text-slate-700">
            🆘 <strong>POMOC DÍTĚTI:</strong> Naskenujte fotoaparátem jakéhokoliv telefonu. Záchranný systém SafePath ihned odešle vaši polohu rodičům dítěte bez nutnosti instalace aplikace.
          </div>
        </div>
      </div>

      {/* Interaktivní modal na displeji */}
      <div className="w-full max-w-[calc(100vw-1.5rem)] sm:max-w-md bg-slate-900 border-2 border-emerald-500/80 rounded-3xl p-4 sm:p-6 sm:p-7 shadow-[0_0_50px_rgba(16,185,129,0.25)] relative text-white print:hidden my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-5 sm:right-5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 w-9 h-9 min-w-[36px] min-h-[36px] rounded-full flex items-center justify-center transition-all border border-slate-700 text-sm font-bold active:scale-90"
          aria-label="Zavřít"
        >
          ✕
        </button>

        <div className="flex items-center gap-2.5 mb-1 pr-8">
          <span className="text-2xl shrink-0">🏷️</span>
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-emerald-400">QR Safe Pass</h3>
          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0">
            Krizový systém
          </span>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-4 sm:mb-5">
          Offline záchranná kartička pro případ, že se dítěti vybije telefon, ztratí se nebo potřebuje pomoc personálu v obchodě či na nádraží.
        </p>

        {/* QR kód karta */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 text-center shadow-xl mb-4 flex flex-col items-center">
          {qrDataUrl ? (
            <img 
              src={qrDataUrl} 
              alt="SafePass QR Kód" 
              className="w-44 h-44 sm:w-56 sm:h-56 mx-auto rounded-xl shadow-inner border border-slate-200"
            />
          ) : (
            <div className="w-44 h-44 sm:w-56 sm:h-56 flex items-center justify-center text-slate-400 text-xs animate-pulse">
              Generuji QR kód...
            </div>
          )}

          <div className="mt-3.5 pt-3 border-t border-slate-200 w-full text-center">
            <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block mb-0.5">
              Identifikační kód SafePass
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono tracking-widest text-slate-900 bg-slate-100 px-3 sm:px-4 py-1 rounded-lg border border-slate-300 inline-block">
              {childCode}
            </span>
          </div>
        </div>

        {/* Instrukce pro nálezce */}
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-3 mb-4 sm:mb-5 flex items-start gap-2.5 text-xs leading-relaxed text-slate-300">
          <span className="text-lg shrink-0">ℹ️</span>
          <div>
            <strong>Jak to funguje:</strong> Kdokoliv kód naskenuje běžným fotoaparátem a stiskne tlačítko <em>„Dítě je v bezpečí u mě“</em>. Rodiče v tu chvíli dostanou zprávu s přesnou GPS polohou a adresou.
          </div>
        </div>

        {/* Tlačítka akcí (Mobile-first: jednosloupcový na úzkých displejích, 2 sloupce na sm+) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
          <button
            onClick={handlePrintCard}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-900/30 active:scale-95 min-h-[44px]"
          >
            <span>🖨️</span> Vytisknout kartičku
          </button>
          {qrDataUrl && (
            <a
              href={qrDataUrl}
              download={`safepass-${childCode}.png`}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 hover:text-white font-bold py-3 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 text-center min-h-[44px]"
            >
              <span>💾</span> Stáhnout QR kód
            </a>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between pt-2.5 border-t border-slate-800 gap-2">
          <button
            onClick={handleCopyLink}
            className="text-xs font-semibold text-slate-400 hover:text-emerald-400 flex items-center gap-1.5 py-1.5 min-h-[36px]"
          >
            <span>🔗</span> {isCopied ? 'Zkopírováno do schránky!' : 'Kopírovat záchranný odkaz'}
          </button>
          <a
            href={safePassUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 underline py-1.5 min-h-[36px] flex items-center"
          >
            Otestovat portál nálezce ↗
          </a>
        </div>
      </div>
    </div>
  );
}

export default SafePassModal;
