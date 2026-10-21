import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AddressSearchInput } from './AddressSearchInput';
import { SafeHavenFeature } from '../lib/opendata';
import { reverseGeocode } from '../lib/geocoding';
import { RouteResult } from '../lib/routing';
import { SafetyReveal } from '../types/safety';
import { pluralize } from '../utils/formatters';

export type RouteStats = RouteResult;

interface SidebarProps {
  startPointName: string;
  endPointName: string;
  onSelectStart: (lat: number, lng: number, name: string) => void;
  onSelectEnd: (lat: number, lng: number, name: string) => void;
  selectedRoute: 'A' | 'B' | 'C';
  onSelectRoute: (route: 'A' | 'B' | 'C') => void;
  routeA: RouteStats | null;
  routeB: RouteStats | null;
  routeC: RouteStats | null;
  fastestRoute?: RouteStats | null;
  showFastestRoute?: boolean;
  onToggleFastestRoute?: () => void;
  argumentsText: string[];
  layers: { cameras: boolean; lights: boolean; havens?: boolean; incidents?: boolean; zones?: boolean; localDataOnly?: boolean };
  onToggleLayer: (layer: 'cameras' | 'lights' | 'havens' | 'incidents' | 'zones' | 'localDataOnly') => void;
  timeOfDay: number;
  onChangeTime: (time: number) => void;
  onSelectProfile: (childName: string) => void;
  safeHavens?: SafeHavenFeature[];
  isSimulating?: boolean;
  onToggleSimulation?: () => void;
  activeProfiles?: string[];
  activeMode?: 'parent' | 'night_girl' | 'child';
  onMetricHover: (reveal: SafetyReveal | null) => void;
  isRoutingLoading?: boolean;
  routingError?: string | null;
  userLocation?: { lat: number; lng: number; accuracy: number } | null;
  onRecenterGps?: () => void;
}

export function RouteSafetyBenefits() {
  const benefits = [
    {
      icon: '🚦',
      text: 'Díky této trase se předchází přebíhání frekventované silnice mimo řízený přechod.'
    },
    {
      icon: '🎥',
      text: 'Díky zvolené trase má dítě zajištěn stálý pohyb v zónách s vysokým dohledem MKS kamer a aktivním pouličním provozem.'
    },
    {
      icon: '💡',
      text: 'Předchází se průchodu neosvětlenými, odlehlými vnitrobloky a rizikovými zákoutími.'
    },
    {
      icon: '🚸',
      text: 'Všechna křížení s vozovkou jsou vedena přes světelně řízené semafory s dostatečným časem na přejití.'
    }
  ];

  return (
    <div className="mt-3 p-4 rounded-xl bg-slate-800/70 border border-emerald-500/30 shadow-lg">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700/60">
        <span className="text-base text-emerald-400">🛡️</span>
        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
          Prevence a ochrana na trase
        </h4>
      </div>
      <div className="space-y-2.5">
        {benefits.map((item, index) => (
          <div key={index} className="flex items-start gap-2.5">
            <span className="text-sm mt-0.5 shrink-0">{item.icon}</span>
            <p className="text-xs text-slate-300 leading-relaxed m-0 font-medium">
              {item.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RouteCard({ 
  route, 
  onMetricHover,
  layers,
  onToggleLayer
}: { 
  route: RouteStats | null, 
  onMetricHover: (reveal: SafetyReveal | null) => void,
  layers?: { cameras: boolean; lights: boolean; havens?: boolean; incidents?: boolean; zones?: boolean; localDataOnly?: boolean },
  onToggleLayer?: (layer: 'cameras' | 'lights' | 'havens' | 'incidents' | 'zones' | 'localDataOnly') => void,
  routeId?: 'A' | 'B' | 'C',
  isSelected?: boolean,
  onSelect?: () => void,
  isSingleRoute?: boolean
}) {
  if (!route) {
    return null;
  }

  const durationMinutes = route.duration;
  const distanceText = `${route.distance.toFixed(2)} km`;

  return (
    <div
      className="w-full text-left p-4 rounded-xl border border-emerald-500 bg-emerald-900/20 shadow-[0_0_15px_rgba(16,185,129,0.1)] mb-3 relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-1 bg-emerald-500 rounded-bl-lg">
        <span className="text-[10px] font-bold text-slate-900 uppercase tracking-wider px-2">Vybráno</span>
      </div>

      <h4 className="text-lg font-bold mb-1 text-emerald-400">
        Garantovaná bezpečná trasa
      </h4>
      <p className="text-xs text-slate-400 mb-3 leading-relaxed">{route.description}</p>
      <p className="text-xs text-emerald-200/80 mb-3 leading-relaxed border-l-2 border-emerald-500/50 pl-2">
        {route.aiAdvice}
      </p>

      {route.tags && route.tags.length > 0 && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {route.tags.map((tag, index) => (
            <span 
              key={`${tag}-${index}`} 
              className="text-[10px] font-semibold px-2 py-1 rounded-full border border-slate-600 bg-slate-900/60 text-slate-200"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {route.snappedCrossings && route.snappedCrossings.length > 0 && (
        <div className="mb-3 px-2.5 py-1.5 rounded-lg bg-emerald-950/50 border border-emerald-700/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-emerald-300 font-semibold">
            <span>🚦</span>
            <span>
              {pluralize(route.snappedCrossings.length, 'chráněný přechod', 'chráněné přechody', 'chráněných přechodů')}
            </span>
          </div>
          <span className="text-[10px] text-emerald-300 font-bold bg-emerald-900/70 px-1.5 py-0.5 rounded border border-emerald-600/50">
            100% semafory ✓
          </span>
        </div>
      )}
      
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center space-x-2 bg-slate-900/50 p-2 rounded-lg">
          <span className="text-xl">⏱️</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Čas</div>
            <div className="font-bold text-slate-200">{durationMinutes} min</div>
            <div className="text-[10px] text-slate-400">{distanceText}</div>
          </div>
        </div>
        <div 
          className="flex items-center space-x-2 bg-slate-900/50 p-2 rounded-lg" 
          onMouseEnter={() => onMetricHover('camera')} 
          onMouseLeave={() => onMetricHover(null)}
        >
          <span className="text-xl">🎥</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Dohled</div>
            <div className={`font-bold ${route.cameraCoverage > 50 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {route.cameraCoverage}%
            </div>
          </div>
        </div>
        <div 
          className="flex items-center space-x-2 bg-slate-900/50 p-2 rounded-lg" 
          onMouseEnter={() => onMetricHover('dark')} 
          onMouseLeave={() => onMetricHover(null)}
        >
          <span className="text-xl">💡</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Osvětlení</div>
            <div className={`font-bold ${route.darkSegments === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {route.darkSegments === 0
                ? 'Vysoké'
                : pluralize(route.darkSegments, 'tmavý úsek', 'tmavé úseky', 'tmavých úseků')}
            </div>
          </div>
        </div>
        <div 
          className="flex items-center space-x-2 bg-slate-900/50 p-2 rounded-lg" 
          onMouseEnter={() => onMetricHover('hazard')} 
          onMouseLeave={() => onMetricHover(null)}
        >
          <span className="text-xl">⚠️</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Rizika</div>
            <div className={`font-bold ${route.riskPoints === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {route.riskPoints === 0
                ? 'Bez rizik'
                : pluralize(route.riskPoints, 'rizikové místo', 'riziková místa', 'rizikových míst')}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2 bg-slate-900/50 p-2 rounded-lg col-span-2">
          <span className="text-xl">🌳</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Průchod parkem</div>
            <div className={`font-bold ${route.metrics.parkIntersectionCount === 0 ? 'text-slate-200' : 'text-amber-400'}`}>
              {route.metrics.parkIntersectionCount > 0 ? 'Ano (bezpečné osvětlené cesty)' : 'Ne (pouze ulice)'}
            </div>
          </div>
        </div>
      </div>

      {/* Tlačítko Safe Haven přímo na kartě trasy */}
      {onToggleLayer && (
        <button
          type="button"
          onClick={() => onToggleLayer('havens')}
          className={`w-full mt-3 py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
            layers?.havens
              ? 'bg-blue-600/30 border-blue-400 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
              : 'bg-slate-900/60 border-slate-700/80 text-slate-300 hover:border-slate-500 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base">🛡️</span>
            <span>Safe Haven záchytné body (SOS)</span>
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
            layers?.havens ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400 border border-slate-700'
          }`}>
            {layers?.havens ? 'Aktivní' : 'Zobrazit'}
          </span>
        </button>
      )}
    </div>
  );
}

export function Sidebar({
  startPointName, endPointName, onSelectStart, onSelectEnd,
  selectedRoute, onSelectRoute, routeA, routeB, routeC,
  fastestRoute = null, showFastestRoute = false, onToggleFastestRoute,
  argumentsText, layers, onToggleLayer,
  timeOfDay, onChangeTime, onSelectProfile,
  safeHavens = [], isSimulating = false, onToggleSimulation, activeProfiles = ['parent'], activeMode, onMetricHover,
  isRoutingLoading = false, routingError = null,
  userLocation = null, onRecenterGps
}: SidebarProps) {
  // Výchozí stav na mobilu: sbaleno dole (isOpen = false), na desktopu vždy otevřeno
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });

  const touchStartY = React.useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;
    // Swipe nahoru (diff > 35) -> otevřít
    if (diff > 35) {
      setIsOpen(true);
    } 
    // Swipe dolů (diff < -35) -> sbalit
    else if (diff < -35) {
      setIsOpen(false);
    }
    touchStartY.current = null;
  };

  const isChildMode = activeMode === 'child' || activeMode === 'parent' || activeProfiles.includes('child') || activeProfiles.includes('parent');

  React.useEffect(() => {
    if (isChildMode && selectedRoute === 'C') {
      onSelectRoute('A');
    }
  }, [isChildMode, selectedRoute, onSelectRoute]);

  return (
    <>
      {/* Mobile Backdrop when bottom sheet is expanded */}
      {isOpen && (
        <div 
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] z-10 md:hidden pointer-events-auto transition-opacity"
          aria-hidden="true"
        />
      )}

      <aside 
        className={`
          bg-slate-900/95 backdrop-blur-md border-r border-slate-700/50
          w-full md:w-96 shadow-2xl flex flex-col pointer-events-auto relative z-20
          transition-all duration-300 ease-out md:translate-y-0 md:h-full pt-0
          ${isOpen 
            ? 'translate-y-0 h-[85vh] max-h-[85vh] rounded-t-3xl border-t border-slate-700/70 md:border-t-0 md:rounded-none' 
            : 'translate-y-0 h-[5.25rem] max-h-[5.25rem] overflow-hidden rounded-t-2xl border-t border-slate-700/70 md:border-t-0 md:rounded-none'
          }
        `}
      >
        {/* Mobile Handle / Drawer Peek Bar */}
        <div 
          className="md:hidden flex flex-col justify-center px-4 py-2 border-b border-slate-700/60 bg-slate-900/95 cursor-pointer active:bg-slate-800 transition-colors select-none rounded-t-2xl shrink-0"
          onClick={() => setIsOpen(!isOpen)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-12 h-1.5 bg-slate-500 rounded-full mx-auto mb-1.5 cursor-grab"></div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{routeA ? 'Garantovaná bezpečná trasa' : 'Bezpečná navigace'}</span>
                </div>
                {routeA && (
                  <div className="text-[11px] text-emerald-400 font-semibold">
                    ⏱️ {routeA.duration} min ({routeA.distance.toFixed(2)} km)
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-slate-300 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
              <span>{isOpen ? 'Sbalit' : 'Přehled'}</span>
              <span className="text-[10px] text-emerald-400">{isOpen ? '▼' : '▲'}</span>
            </div>
          </div>
        </div>

        {/* Pevná hlavička (Logo SafePath + vstupy ODKUD / KAM) bez scrollování */}
        <div className="shrink-0 px-5 pt-3 pb-3 border-b border-slate-800/80 bg-slate-900/95">
          {/* Header a Profil */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                SafePath
              </h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Rodičovský Dispečink</p>
            </div>
            <div className="bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/80 flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Režim:</span>
              <span className="text-xs font-black text-white">
                {isChildMode && activeProfiles.length === 1 && '👨‍👧 Malé děti'}
                {!isChildMode && activeProfiles.length === 1 && activeProfiles.includes('night_girl') && '🌙 Dívky 14+'}
                {activeProfiles.length > 1 && `🔄 Kombinovaný (${activeProfiles.length})`}
              </span>
            </div>
          </div>

          {/* Vyhledávání */}
          <div className="space-y-2">
            <AddressSearchInput
              label="Odkud"
              placeholder="Odkud?"
              value={startPointName}
              onSelect={onSelectStart}
              iconColor="text-emerald-400"
              showCurrentLocation={true}
              onUseCurrentLocation={() => {
                if (userLocation) {
                  onSelectStart(userLocation.lat, userLocation.lng, 'Moje aktuální poloha');
                  onRecenterGps?.();
                } else if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      const lat = position.coords.latitude;
                      const lng = position.coords.longitude;
                      onSelectStart(lat, lng, 'Moje aktuální poloha');
                      onRecenterGps?.();
                    },
                    () => {},
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
                  );
                }
              }}
            />
            <AddressSearchInput
              label="Kam"
              placeholder="Kam to bude?"
              value={endPointName}
              onSelect={onSelectEnd}
              iconColor="text-blue-400"
            />
          </div>
        </div>

        {/* Samostatně scrollovatelný zbytek obsahu */}
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 space-y-5"
          style={{ paddingBottom: '3.5rem' }}
        >
          {/* Trasa */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
              Bezpečná trasa pro dítě
            </h3>
            {routingError ? (
              <div className="p-4 rounded-xl bg-red-950/70 border border-red-500/70 text-red-200 text-sm shadow-lg">
                <div className="flex items-center gap-2 font-bold mb-1.5 text-red-400">
                  <span className="text-base">⚠️</span>
                  <span>Chyba při výpočtu trasy</span>
                </div>
                <p className="text-xs text-red-300 leading-relaxed mb-2.5">{routingError}</p>
                <p className="text-[11px] text-slate-400">Zvolte jiný cíl nebo posuňte bod blíže k silnici či pěší komunikaci.</p>
              </div>
            ) : isRoutingLoading ? (
              <div className="space-y-3">
                <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-slate-700/50 rounded w-1/3 mb-2"></div>
                  <div className="h-3 bg-slate-700/50 rounded w-2/3"></div>
                </div>
                <div className="bg-slate-800/30 border border-slate-700 rounded-xl p-4 animate-pulse">
                  <div className="h-4 bg-slate-700/50 rounded w-1/3 mb-2"></div>
                  <div className="h-3 bg-slate-700/50 rounded w-2/3"></div>
                </div>
              </div>
            ) : routeA ? (
              <>
                <RouteCard 
                  route={routeA} 
                  onMetricHover={onMetricHover}
                  layers={layers}
                  onToggleLayer={onToggleLayer}
                />
                {/* Přepínač pro porovnání s nejrychlejší trasou */}
                {fastestRoute && (
                  <div className="mt-2.5 p-3 rounded-xl bg-slate-800/40 border border-slate-700/60 flex items-center justify-between transition-all hover:bg-slate-800/60">
                    <div className="flex items-center gap-2.5">
                      <span className="text-base">⚡</span>
                      <div>
                        <div className="text-xs font-bold text-slate-200">
                          Porovnat s nejrychlejší trasou
                        </div>
                        <div className="text-[11px] text-slate-400 font-medium">
                          {fastestRoute.duration} min • {fastestRoute.distance.toFixed(2)} km (běžná navigace)
                        </div>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input 
                        type="checkbox" 
                        checked={!!showFastestRoute} 
                        onChange={onToggleFastestRoute}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-slate-500"></div>
                    </label>
                  </div>
                )}
              </>
            ) : (
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 text-slate-400 text-xs text-center">
                Zadejte výchozí a cílový bod pro vyhledání bezpečné trasy.
              </div>
            )}
          </div>

        {/* Vrstvy a Ovládání */}
        <div className="space-y-6">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Dohled v čase</h3>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-md">
                {timeOfDay}:00
              </span>
            </div>
            <input 
              type="range" 
              min="0" max="23" 
              value={timeOfDay} 
              onChange={(e) => onChangeTime(parseInt(e.target.value))}
              className="w-full accent-emerald-500 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Aktivní vrstvy</h3>
            <div className="space-y-2">
              <label className="flex items-center space-x-3 p-3 bg-slate-800/50 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700">
                <input type="checkbox" checked={layers.cameras} onChange={() => onToggleLayer('cameras')} className="form-checkbox h-5 w-5 text-emerald-500 rounded border-slate-600 bg-slate-900 focus:ring-0 focus:ring-offset-0" />
                <span className="text-sm font-medium">Kamery MKS (Zorné pole)</span>
              </label>
              <label className="flex items-center space-x-3 p-3 bg-slate-800/50 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700">
                <input type="checkbox" checked={layers.zones} onChange={() => onToggleLayer('zones')} className="form-checkbox h-5 w-5 text-emerald-500 rounded border-slate-600 bg-slate-900 focus:ring-0 focus:ring-offset-0" />
                <span className="text-sm font-medium">Bezpečnost ulic (Živé třídy)</span>
              </label>
              <label className="flex items-center space-x-3 p-3 bg-slate-800/50 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700">
                <input type="checkbox" checked={layers.incidents} onChange={() => onToggleLayer('incidents')} className="form-checkbox h-5 w-5 text-emerald-500 rounded border-slate-600 bg-slate-900 focus:ring-0 focus:ring-offset-0" />
                <span className="text-sm font-medium">Nedávné incidenty (Rizika)</span>
              </label>
              <div className="pt-2 border-t border-slate-700/50 mt-2">
                <label className="flex items-center space-x-3 p-3 bg-slate-800/20 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700">
                  <input type="checkbox" checked={layers.localDataOnly} onChange={() => onToggleLayer('localDataOnly')} className="form-checkbox h-5 w-5 text-indigo-500 rounded border-slate-600 bg-slate-900 focus:ring-0 focus:ring-offset-0" />
                  <span className="text-xs font-medium text-slate-300">Zobrazit data pouze v okolí trasy (Doporučeno pro přehlednost)</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Simulace */}
        {routeA && (
          <div className="mt-8 pt-8 border-t border-slate-700/50">
            <button
              onClick={onToggleSimulation}
              className={`w-full py-4 rounded-xl font-bold transition-all shadow-lg text-white ${
                isSimulating 
                  ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20' 
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
              }`}
            >
              {isSimulating ? 'Zastavit sledování polohy' : '▶ Spustit simulaci pohybu dítěte'}
            </button>
          </div>
        )}

        {/* Spodní bezpečná zóna pro scroll (safe-area padding) */}
        <div className="h-14 shrink-0" aria-hidden="true" />
      </div>
    </aside>
    </>
  );
}
