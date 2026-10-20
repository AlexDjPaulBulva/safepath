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
      <div className="flex items-start space-x-4 mb-4">
        <div className={`w-6 h-6 rounded-full border-4 flex-shrink-0 mt-0.5 ${iconColor}`}></div>
        <div className="flex-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
          <div className="relative flex items-center">
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              onFocus={() => { if (results.length > 0) setIsOpen(true); }}
              placeholder={placeholder}
              className="w-full bg-slate-900/50 border-b border-slate-700 text-sm font-semibold text-slate-200 mt-1 py-1 pr-16 focus:outline-none focus:border-emerald-500 transition-colors placeholder-slate-600"
            />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  aria-label="Vymazat hledaný text"
                  className="flex items-center justify-center h-6 w-6 rounded-full bg-slate-700 text-slate-200 hover:bg-slate-600 transition-colors"
                >
                  ✕
                </button>
              )}
              {showCurrentLocation && onUseCurrentLocation && (
                <button
                  type="button"
                  onClick={onUseCurrentLocation}
                  className="text-[10px] font-bold uppercase tracking-wide text-emerald-300 hover:text-emerald-200 whitespace-nowrap"
                >
                  Moje aktuální poloha
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-10 right-0 z-50 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden mt-1"
          >
            {isLoading ? (
              <div className="p-3 text-xs text-slate-400">Vyhledávám...</div>
            ) : (
              <ul>
                {results.map((res) => (
                  <li
                    key={res.place_id}
                    onClick={() => handleSelect(res)}
                    className="p-3 border-b border-slate-700/50 hover:bg-slate-700 cursor-pointer text-xs text-slate-300 transition-colors"
                  >
                    {res.display_name}
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
