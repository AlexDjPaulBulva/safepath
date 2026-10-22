import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as turf from '@turf/turf';
import { PRAGUE_SAFE_HAVENS, SafeHavenPOI, getSafeHavenIcon, getSafeHavenTypeLabel } from '../data/safe-havens-poi';
import { SafeHavenFeature } from '../lib/opendata';
import { getActiveSafeHavens, getSafeHavenBadge } from '../lib/safeHavens';

interface SafeHavenButtonProps {
  currentLocation: { lat: number; lng: number } | null;
  onNavigateToHaven: (haven: SafeHavenPOI, distanceMeters: number) => void;
  activeHaven: SafeHavenPOI | null;
  onCancelHaven: () => void;
  extraHavens?: SafeHavenFeature[];
}

export function SafeHavenButton({
  currentLocation,
  onNavigateToHaven,
  activeHaven,
  onCancelHaven,
  extraHavens = []
}: SafeHavenButtonProps) {
  const [isSearching, setIsSearching] = useState(false);

  // Spojení statického pražského POI datasetu s dynamicky načtenými Overpass body s filtrací podle denní/noční doby
  const allHavens: SafeHavenPOI[] = React.useMemo(() => {
    const list = [...PRAGUE_SAFE_HAVENS];
    if (extraHavens && extraHavens.length > 0) {
      for (const h of extraHavens) {
        if (!list.some(existing => existing.coords[0] === h.lat && existing.coords[1] === h.lng)) {
          let mappedType: SafeHavenPOI['type'] = 'police';
          if (h.type === 'pharmacy') mappedType = 'pharmacy';
          else if (h.type === 'fuel') mappedType = 'fuel';

          list.push({
            id: `extra_${h.id}`,
            name: h.name,
            type: mappedType,
            address: 'Praha',
            coords: [h.lat, h.lng],
            is247: h.is247,
            phone: h.phone,
            description: 'Ověřený záchytný bod z mapové sítě'
          });
        }
      }
    }
    // Aplikace právního a časového filtru (v noci 20:00-07:00 výhradně ověřené 24/7 provozy)
    return getActiveSafeHavens(new Date().getHours(), list);
  }, [extraHavens]);

  const handleFindNearestHaven = () => {
    if (activeHaven) {
      onCancelHaven();
      return;
    }

    // Výchozí pozice uživatele: pokud není k dispozici GPS, použijeme centrum Prahy (Václavské náměstí)
    const userLat = currentLocation?.lat ?? 50.0815;
    const userLng = currentLocation?.lng ?? 14.4280;

    setIsSearching(true);

    try {
      // Sestavení Turf bodů
      const userPoint = turf.point([userLng, userLat]);
      const features = allHavens.map((haven) =>
        turf.point([haven.coords[1], haven.coords[0]], { ...haven })
      );
      const featureCollection = turf.featureCollection(features);

      // Vyhledání prostorově nejbližšího úkrytu
      const nearest = turf.nearestPoint(userPoint, featureCollection);
      const havenData = nearest.properties as unknown as SafeHavenPOI;

      // Výpočet přesné vzdálenosti v metrech
      const distMeters = Math.round(
        turf.distance(userPoint, nearest, { units: 'meters' })
      );

      // Vyvolání haptiky
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([150, 100, 150]);
        } catch {
          // ignore
        }
      }

      onNavigateToHaven(havenData, distMeters);
    } catch (err) {
      console.error('Chyba při hledání nejbližšího Safe Haven:', err);
      // Fallback: první položka z datasetu
      if (allHavens.length > 0) {
        onNavigateToHaven(allHavens[0], 250);
      }
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleFindNearestHaven}
        className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl font-bold shadow-2xl transition-all duration-300 border-2 ${
          activeHaven
            ? 'bg-amber-600 hover:bg-amber-500 text-white border-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.6)] animate-pulse'
            : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white border-red-400 shadow-[0_0_25px_rgba(239,68,68,0.5)]'
        }`}
        title="Vyhledat nejbližší nepřetržitý bezpečný úkryt (lékárna, policie, metro, čerpací stanice)"
      >
        <div className="relative flex items-center justify-center w-7 h-7 bg-white/20 rounded-xl text-lg backdrop-blur-sm">
          {activeHaven ? '✕' : '🛡️'}
          {!activeHaven && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full animate-ping"></span>
          )}
        </div>
        <div className="flex flex-col text-left">
          <span className="text-xs uppercase tracking-wider font-black text-rose-100 leading-tight">
            {activeHaven ? 'Ukončit nouzi' : 'Nouzový úkryt'}
          </span>
          <span className="text-sm font-extrabold text-white leading-tight">
            {isSearching ? 'Hledám...' : activeHaven ? 'Zrušit navigaci' : 'SAFE HAVEN (SOS)'}
          </span>
        </div>
      </motion.button>
    </div>
  );
}

export function SafeHavenBanner({
  haven,
  distanceMeters,
  onCancel
}: {
  haven: SafeHavenPOI;
  distanceMeters: number;
  onCancel: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-gradient-to-r from-red-950/95 via-slate-900/95 to-rose-950/95 border-2 border-red-500 rounded-2xl p-3 sm:p-4 shadow-[0_0_40px_rgba(239,68,68,0.5)] backdrop-blur-md max-w-[calc(100vw-1.5rem)] sm:max-w-lg w-full flex items-center justify-between gap-3"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-red-600/30 border border-red-500 flex items-center justify-center text-xl sm:text-2xl shadow-inner shrink-0">
          {getSafeHavenIcon(haven.type)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500 text-white shrink-0">
              Nouzový úkryt aktivní
            </span>
            <span className="text-[11px] sm:text-xs text-red-300 font-semibold shrink-0">
              cca {distanceMeters} m
            </span>
          </div>
          <h4 className="text-sm sm:text-base font-bold text-white mt-0.5 leading-snug truncate">
            {haven.name}
          </h4>
          <p className="text-[11px] sm:text-xs text-slate-300 leading-tight truncate">
            {haven.address} • <span className="text-amber-300 font-semibold">{getSafeHavenBadge(haven)}</span>
          </p>
          {haven.phone && (
            <p className="text-[11px] sm:text-xs text-emerald-400 font-bold mt-0.5">
              Tel: <a href={`tel:${haven.phone}`} className="underline">{haven.phone}</a>
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onCancel}
        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold border border-slate-600 transition-colors shrink-0 active:scale-95 min-h-[40px] flex items-center"
      >
        Ukončit
      </button>
    </motion.div>
  );
}
