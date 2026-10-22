import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { searchAddress, GeocodeResult } from '../lib/geocoding';

interface AddressSearchInputProps {
  label: string;
  placeholder: string;
  value: string;
  onSelect: (lat: number, lng: number, addressName: string) => void;
  iconColor: string;
  showCurrentLocation?: boolean;
  onUseCurrentLocation?: () => void;
}

export function AddressSearchInput({ label, placeholder, value, onSelect, iconColor, showCurrentLocation = false, onUseCurrentLocation }: AddressSearchInputProps) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync prop value
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setQuery(text);
    
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.length < 3) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(async () => {
      const data = await searchAddress(text);
      setResults(data);
      setIsOpen(data.length > 0);
      setIsLoading(false);
    }, 300);
  };

  const handleSelect = (result: GeocodeResult) => {
    // Odstraníme PSČ a zemi pro čistší zobrazení
    const cleanName = result.display_name.split(',').slice(0, 3).join(',');
    setQuery(cleanName);
    setIsOpen(false);
    onSelect(parseFloat(result.lat), parseFloat(result.lon), cleanName);
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex items-start space-x-3 sm:space-x-4 mb-3 sm:mb-4">
        <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-4 flex-shrink-0 mt-1 ${iconColor}`}></div>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span>
          <div className="relative flex items-center">
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => { if (results.length > 0) setIsOpen(true); }}
              placeholder={placeholder}
              className="w-full bg-slate-900/60 border-b border-slate-700 text-base md:text-sm font-semibold text-slate-100 mt-1 py-1.5 pr-20 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-500"
            />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Vymazat hledaný text"
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors active:scale-90 text-xs"
                >
                  ✕
                </button>
              )}
              {showCurrentLocation && onUseCurrentLocation && (
                <button
                  type="button"
                  onClick={onUseCurrentLocation}
                  className="text-[11px] font-bold uppercase tracking-wide text-emerald-400 hover:text-emerald-300 whitespace-nowrap px-1.5 py-1 rounded bg-emerald-950/60 border border-emerald-600/40 active:scale-95 transition-all"
                  title="Použít moji aktuální polohu"
                >
                  📍 Poloha
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="absolute top-full left-0 sm:left-9 right-0 z-50 bg-slate-850/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl overflow-hidden mt-1 max-h-56 overflow-y-auto custom-scrollbar"
          >
            {isLoading ? (
              <div className="p-3 text-xs text-slate-400 flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
                <span>Vyhledávám adresu...</span>
              </div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {results.map((res) => (
                  <li
                    key={res.place_id}
                    onClick={() => handleSelect(res)}
                    className="p-3 hover:bg-slate-800 cursor-pointer text-xs font-medium text-slate-200 transition-colors flex items-start gap-2.5 active:bg-slate-700"
                  >
                    <span className="text-emerald-400 shrink-0 mt-0.5">📍</span>
                    <span className="line-clamp-2 leading-relaxed">{res.display_name}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
