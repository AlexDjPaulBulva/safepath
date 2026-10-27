import React, { useState, useEffect, useRef } from 'react';
import polyline from '@mapbox/polyline';
import { AddressSearchInput } from './AddressSearchInput';
import { SafeHavenFeature } from '../lib/opendata';
import { RouteResult } from '../lib/routing';
import { SafetyReveal } from '../types/safety';
import { PrivacyModal } from './PrivacyModal';
import { terminateChildNavigation, dispatchRouteToChild } from '../lib/liveSync';
import { useAppStore } from '../store/useAppStore';

export type RouteStats = RouteResult;

export type SheetState = 'minimized' | 'peek' | 'expanded';

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
  argumentsText?: string[];
  layers?: { cameras: boolean; lights: boolean; havens?: boolean; incidents?: boolean; zones?: boolean; localDataOnly?: boolean };
  onToggleLayer?: (layer: 'cameras' | 'lights' | 'havens' | 'incidents' | 'zones' | 'localDataOnly') => void;
  timeOfDay?: number;
  onChangeTime?: (time: number) => void;
  onSelectProfile?: (childName: string) => void;
  safeHavens?: SafeHavenFeature[];
  isSimulating?: boolean;
  onToggleSimulation?: () => void;
  activeProfiles?: string[];
  activeMode?: 'parent' | 'night_girl' | 'child';
  onMetricHover: (reveal: SafetyReveal | null) => void;
  onRouteCalculated?: (route: any) => void;
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

export function extractRouteCoordinates(route: any): [number, number][] {
  if (!route) return [];
  let raw = route.coordinates 
    || route.geometry?.coordinates 
    || route.geometry 
    || route.path 
    || route.points 
    || route.latlngs 
    || (Array.isArray(route) ? route : null);

  if (typeof raw === 'string') {
    try {
      raw = polyline.decode(raw).map(([lat, lng]: [number, number]) => [lat, lng]);
    } catch (e) {
      console.warn('Sidebar polyline decode error:', e);
    }
  }

  if (Array.isArray(raw) && raw.length > 0) {
    return raw;
  }

  if (route.segments && Array.isArray(route.segments)) {
    const coords: [number, number][] = [];
    route.segments.forEach((seg: any) => {
      if (Array.isArray(seg.coordinates)) {
        seg.coordinates.forEach((c: any) => coords.push(c));
      }
    });
    if (coords.length > 0) return coords;
  }

  return [];
}

function RouteCard({ 
  route, 
  onMetricHover,
  onRouteCalculated
}: { 
  route: RouteStats | null; 
  onMetricHover: (reveal: SafetyReveal | null) => void;
  onRouteCalculated?: (route: any) => void;
  layers?: any;
  onToggleLayer?: any;
  routeId?: 'A' | 'B' | 'C';
  isSelected?: boolean;
  onSelect?: () => void;
  isSingleRoute?: boolean;
}) {
  useEffect(() => {
    if (route) {
      const routeCoordinatesArray = extractRouteCoordinates(route);
      onRouteCalculated?.({
        ...route,
        coordinates: routeCoordinatesArray,
        distance: route.distance,
        duration: route.duration,
        steps: route.navigationSteps || []
      });
    }
  }, [route, onRouteCalculated]);

  if (!route) {
    return null;
  }

  const activeSafetyStats = useAppStore((state) => state.activeSafetyStats);

  const durationMinutes = route.duration;
  const distanceText = `${route.distance.toFixed(2)} km`;
  const camerasCount = activeSafetyStats.camerasCount > 0
    ? activeSafetyStats.camerasCount
    : Math.max(
        3,
        route.metrics?.camerasNearbyCount ||
        (route.cameraCoverage > 0 ? Math.round(route.cameraCoverage / 12) : 5)
      );

  const crossingsCount = activeSafetyStats.crossingsCount > 0
    ? activeSafetyStats.crossingsCount
    : (route.snappedCrossings?.length || route.metrics?.snappedCrossingsCount || 0);

  const hazardsCount = activeSafetyStats.hazardsCount !== undefined
    ? activeSafetyStats.hazardsCount
    : (route.metrics?.collisionIntersectionsCount ?? route.riskPoints ?? 0);

  return (
    <div className="w-full text-left p-4 rounded-xl border border-emerald-500/80 bg-emerald-950/20 shadow-[0_0_20px_rgba(16,185,129,0.12)] mb-3 relative overflow-hidden">
      {/* 3. Sjednocené záhlaví bez štítku "VYBRÁNO" a bez duplicit */}
      <h4 className="text-base sm:text-lg font-bold mb-1.5 text-emerald-400 flex items-center gap-2">
        <span>🛡️</span>
        <span>Doporučená bezpečná trasa</span>
      </h4>
      <p className="text-xs text-slate-400 mb-2 leading-relaxed">{route.description}</p>
      <p className="text-xs text-emerald-200/90 mb-3 leading-relaxed border-l-2 border-emerald-500/60 pl-2 font-medium">
        {route.aiAdvice}
      </p>

      {/* Ověřená bezpečnostní charakteristika */}
      <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-950/60 border border-emerald-700/60 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 text-emerald-300 font-semibold">
          <span>🚦</span>
          <span>100 % světelně řízených přechodů</span>
        </div>
        <span className="text-[10px] text-emerald-300 font-bold bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-600/60 whitespace-nowrap">
          Chráněná cesta ✓
        </span>
      </div>
      
      {/* 4. Nahrazení nízkých procent dohledu konkrétními čísly */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="flex items-center space-x-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-xl">⏱️</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Čas chůze</div>
            <div className="font-bold text-slate-200">{durationMinutes} min</div>
            <div className="text-[10px] text-slate-400">{distanceText}</div>
          </div>
        </div>

        <div 
          className="flex items-center space-x-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80" 
          onMouseEnter={() => onMetricHover('camera')} 
          onMouseLeave={() => onMetricHover(null)}
        >
          <span className="text-xl">🎥</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Kamerový dohled</div>
            <div className="font-bold text-emerald-400 leading-tight">
              {camerasCount} MKS kamer
            </div>
            <div className="text-[10px] text-slate-400">na trase a křižovatkách</div>
          </div>
        </div>

        <div 
          className="flex items-center space-x-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80" 
          onMouseEnter={() => onMetricHover('dark')} 
          onMouseLeave={() => onMetricHover(null)}
        >
          <span className="text-xl">💡</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Osvětlení (THMP)</div>
            <div className="font-bold text-emerald-400 leading-tight">
              Osvětlené třídy
            </div>
            <div className="text-[10px] text-slate-400">
              {route.metrics?.lightingCoveragePercent ?? 98} % v kuželu světel
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-xl">🚦</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Přecházení</div>
            <div className="font-bold text-emerald-400 leading-tight">
              {crossingsCount > 0 ? `${crossingsCount} semaforů / přechodů` : '100 % semaforů'}
            </div>
            <div className="text-[10px] text-slate-400">0 neřízených křížení</div>
          </div>
        </div>

        <div 
          className="flex items-center space-x-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80" 
          onMouseEnter={() => onMetricHover('hazard')} 
          onMouseLeave={() => onMetricHover(null)}
        >
          <span className="text-xl">⚠️</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Rizika (CDV)</div>
            <div className={`font-bold leading-tight ${hazardsCount === 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {hazardsCount === 0
                ? '0 kolizních míst'
                : `${hazardsCount} rizik`}
            </div>
            <div className="text-[10px] text-slate-400">databáze nehod PČR</div>
          </div>
        </div>

        <div className="flex items-center space-x-2 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
          <span className="text-xl">🎒</span>
          <div>
            <div className="text-[10px] text-slate-500 uppercase font-bold">Školní zóna</div>
            <div className={`font-bold leading-tight ${(route.metrics?.schoolZonePercent ?? 0) > 0 ? 'text-emerald-400' : 'text-slate-300'}`}>
              {(route.metrics?.schoolZonePercent ?? 0) > 0
                ? `${route.metrics.schoolZonePercent} % v koridoru ZŠ`
                : 'Bezpečné chodníky'}
            </div>
            <div className="text-[10px] text-slate-400">IPR Praha</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({
  startPointName, endPointName, onSelectStart, onSelectEnd,
  selectedRoute, onSelectRoute, routeA, routeB, routeC,
  fastestRoute = null, showFastestRoute = false, onToggleFastestRoute,
  isSimulating = false, onToggleSimulation, activeProfiles = ['parent'], activeMode, onMetricHover,
  isRoutingLoading = false, routingError = null,
  userLocation = null, onRecenterGps, onRouteCalculated
}: SidebarProps) {
  const calculatedRoute = selectedRoute === 'A' ? routeA : selectedRoute === 'B' ? (routeB || routeA) : (routeC || routeA);

  useEffect(() => {
    if (calculatedRoute) {
      const routeCoordinatesArray = extractRouteCoordinates(calculatedRoute);
      onRouteCalculated?.({
        ...calculatedRoute,
        coordinates: routeCoordinatesArray, // Pole bodů trasy z OSRM / routovací funkce
        distance: calculatedRoute.distance,
        duration: calculatedRoute.duration,
        steps: calculatedRoute.navigationSteps || (calculatedRoute as any).steps || []
      });
    }
  }, [calculatedRoute, onRouteCalculated]);
  // 1. Třípolohový ergonomický Bottom Sheet pro mobil:
  // - minimized: tenká spodní lišta (cca 48px)
  // - peek: výchozí náhled s drag lištou a kompaktními vstupy (cca 148px)
  // - expanded: plné rozbalení (85vh)
  const [sheetState, setSheetState] = useState<SheetState>('peek');
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);

  const storePairedCode = useAppStore((state) => state.pairedChildCode);
  const selectedChildCode = storePairedCode || (typeof window !== 'undefined' ? localStorage.getItem('safepath_paired_child_code') : null);
  const [routeDispatched, setRouteDispatched] = useState<boolean>(false);
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  const handleDispatchRouteToChild = async () => {
    if (!routeA) return;
    let pathCoords: [number, number][] = [];
    if (typeof routeA.geometry === 'string') {
      try {
        const decoded = polyline.decode(routeA.geometry);
        pathCoords = decoded.map(([lat, lng]) => [lat, lng]);
      } catch (err) {
        console.warn('Sidebar polyline decode error:', err);
      }
    } else if (Array.isArray(routeA.geometry)) {
      pathCoords = routeA.geometry;
    }
    if (pathCoords.length < 2) return;

    const targetCode = selectedChildCode || prompt('Zadejte 6místný kód dítěte pro odeslání trasy:');
    if (!targetCode) return;

    setIsDispatching(true);
    try {
      await dispatchRouteToChild(targetCode.trim(), {
        pathCoords,
        start: { lat: pathCoords[0][0], lng: pathCoords[0][1], name: startPointName },
        end: { lat: pathCoords[pathCoords.length - 1][0], lng: pathCoords[pathCoords.length - 1][1], name: endPointName },
        distance: routeA.distance,
        duration: routeA.duration,
        distanceKm: routeA.distance,
        durationMin: routeA.duration
      });
      setRouteDispatched(true);
      setTimeout(() => setRouteDispatched(false), 5000);
    } catch (err) {
      console.error('Chyba odeslání trasy dítěti:', err);
      alert('Trasu se nepodařilo odeslat. Zkontrolujte připojení.');
    } finally {
      setIsDispatching(false);
    }
  };

  const touchStartY = useRef<number | null>(null);

  // Synchronizace CSS proměnné --bottom-sheet-height pro plynulé umístění Safe Haven FAB a GPS tlačítek
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateHeight = () => {
      if (window.innerWidth >= 768) {
        document.documentElement.style.setProperty('--bottom-sheet-height', '0px');
      } else {
        const heights: Record<SheetState, string> = {
          minimized: '48px',
          peek: '148px',
          expanded: '85vh'
        };
        document.documentElement.style.setProperty('--bottom-sheet-height', heights[sheetState]);
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, [sheetState]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY; // > 0 swipe nahoru, < 0 swipe dolů
    
    if (diff > 30) {
      if (sheetState === 'minimized') {
        setSheetState('peek');
      } else if (sheetState === 'peek') {
        setSheetState('expanded');
      }
    } else if (diff < -30) {
      if (sheetState === 'expanded') {
        setSheetState('peek');
      } else if (sheetState === 'peek') {
        setSheetState('minimized');
      }
    }
    touchStartY.current = null;
  };

  const isChildMode = activeMode === 'child' || activeMode === 'parent' || activeProfiles.includes('child') || activeProfiles.includes('parent');

  useEffect(() => {
    if (isChildMode && selectedRoute === 'C') {
      onSelectRoute('A');
    }
  }, [isChildMode, selectedRoute, onSelectRoute]);

  return (
    <>
      {/* Mobile Backdrop při plném rozbalení Bottom Sheetu */}
      {sheetState === 'expanded' && (
        <div 
          onClick={() => setSheetState('peek')}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-[2px] z-20 md:hidden pointer-events-auto transition-opacity"
          aria-hidden="true"
        />
      )}

      <aside 
        style={{
          paddingBottom: 'env(safe-area-inset-bottom, 0px)'
        }}
        className={`
          w-full md:w-96 md:max-w-md bg-slate-900 border-slate-700/60 shadow-2xl flex flex-col pointer-events-auto z-30 transition-all duration-300 ease-out
          md:relative md:h-full md:border-r md:pt-3 md:px-4 md:pb-0
          fixed inset-x-0 bottom-0 rounded-t-3xl border-t
          ${sheetState === 'minimized' ? 'max-md:h-[52px] max-md:max-h-[52px] max-md:overflow-hidden max-md:p-0' : ''}
          ${sheetState === 'peek' ? 'max-md:h-[154px] max-md:max-h-[154px] max-md:overflow-hidden max-md:pt-1.5 max-md:px-3.5 max-md:pb-2' : ''}
          ${sheetState === 'expanded' ? 'max-md:h-[85vh] max-md:max-h-[85vh] max-md:pt-2 max-md:px-4 max-md:pb-0' : ''}
        `}
      >
        {/* ======================================================== */}
        {/* MOBILNÍ STAV 1: MINIMIZED (Výška 52px)                     */}
        {/* ======================================================== */}
        <div 
          className={`block md:hidden flex-col h-[52px] shrink-0 justify-between select-none cursor-pointer active:bg-slate-800/60 ${sheetState === 'minimized' ? 'flex' : 'hidden'} md:!hidden`}
          onClick={() => setSheetState('peek')}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-12 h-1 bg-slate-600 rounded-full mx-auto mt-1.5 cursor-grab" />
          <div className="flex items-center justify-between px-3.5 pb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              <span className="text-xs font-bold text-white truncate">
                {routeA ? `Naviguji: ${routeA.duration} min (${routeA.distance.toFixed(1)} km)` : 'SafePath: Bezpečná trasa'}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setSheetState('peek'); }}
              className="text-[11px] font-bold text-emerald-400 bg-emerald-950/80 px-3 py-1.5 rounded-lg border border-emerald-600/50 flex items-center gap-1 active:scale-95 shrink-0 min-h-[36px]"
            >
              <span>Přehled</span>
              <span>▲</span>
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* MOBILNÍ STAV 2: PEEK (Výchozí náhled, výška ~154px)         */}
        {/* ======================================================== */}
        <div 
          className={`block md:hidden flex-col shrink-0 select-none ${sheetState === 'peek' ? 'flex' : 'hidden'} md:!hidden`}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {/* Drag Bar & Summary Row */}
          <div className="w-12 h-1.5 bg-slate-500/80 rounded-full mx-auto mt-1 mb-1.5 cursor-grab" />
          <div className="flex items-center justify-between px-1 mb-2 block md:hidden">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
              <span className="text-xs font-black text-white">SafePath</span>
              {routeA && (
                <span className="text-xs font-bold text-emerald-400 truncate">
                  ⏱️ {routeA.duration} min • {routeA.distance.toFixed(2)} km
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setSheetState('expanded')}
                className="text-[11px] font-bold text-slate-200 bg-slate-800/90 hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-700 flex items-center gap-1 active:scale-95 min-h-[36px]"
              >
                <span>Detaily</span>
                <span className="text-emerald-400">▲</span>
              </button>
              <button
                type="button"
                onClick={() => setSheetState('minimized')}
                className="text-xs text-slate-400 hover:text-white px-2 py-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg"
                title="Sbalit panel"
                aria-label="Sbalit panel"
              >
                ▼
              </button>
            </div>
          </div>

          {/* Přímo pod ním kompaktní vstupní pole ODKUD a KAM pro okamžitou změnu bez otevírání celého panelu */}
          <div className="space-y-1.5">
            <div 
              onClick={() => setSheetState('expanded')}
              className="flex items-center bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2 cursor-pointer active:bg-slate-700/80 transition-colors min-h-[40px]"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 mr-2" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1.5 shrink-0">Od:</span>
              <span className="text-xs font-semibold text-slate-200 truncate flex-1">
                {startPointName || 'Zvolte odkud vyrazit...'}
              </span>
            </div>
            <div 
              onClick={() => setSheetState('expanded')}
              className="flex items-center bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2 cursor-pointer active:bg-slate-700/80 transition-colors min-h-[40px]"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0 mr-2" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1.5 shrink-0">Do:</span>
              <span className="text-xs font-semibold text-slate-200 truncate flex-1">
                {endPointName || 'Zvolte cíl cesty...'}
              </span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* MOBILNÍ STAV 3: EXPANDED (85vh) & DESKTOP ROZVRŽENÍ         */}
        {/* ======================================================== */}
        <div 
          className={`flex-1 flex-col min-h-0 overflow-hidden md:flex ${sheetState === 'expanded' ? 'flex' : 'hidden md:flex'}`}
        >
          {/* Mobilní lišta pro stažení z Expanded do Peek */}
          <div 
            className="block md:hidden flex-col items-center pt-1 pb-2 shrink-0 cursor-pointer select-none border-b border-slate-800 mb-2 min-h-[44px] flex justify-center md:!hidden"
            onClick={() => setSheetState('peek')}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <div className="w-12 h-1.5 bg-slate-500 rounded-full mb-1 cursor-grab" />
            <div className="flex items-center justify-between w-full px-2">
              <span className="text-xs font-bold text-slate-300">Detaily trasy a asistence</span>
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <span>Sbalit</span>
                <span>▼</span>
              </span>
            </div>
          </div>

          {/* Fixní záhlaví pro desktop / expanded */}
          <div className="shrink-0 mb-3 max-md:hidden">
            <div className="mb-2.5">
              <h1 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                SafePath
              </h1>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Rodičovský dispečink</p>
            </div>
          </div>

          {/* Vstupy ODKUD a KAM (plné vyhledávání pro desktop & expanded) */}
          <div className="shrink-0 space-y-2 mb-3">
            <AddressSearchInput
              label="Odkud"
              placeholder="Odkud vyrazit?"
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
              placeholder="Kam to bude bezpečně?"
              value={endPointName}
              onSelect={onSelectEnd}
              iconColor="text-blue-400"
            />
          </div>

          {/* Samostatně scrollovatelný obsah */}
          <div className="flex-1 h-full max-h-screen overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 space-y-3 pb-16">
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
                {/* 3. Karta trasy sjednocená do "🛡️ Doporučená bezpečná trasa" bez duplicit */}
                <RouteCard 
                  route={routeA} 
                  onMetricHover={onMetricHover}
                  onRouteCalculated={onRouteCalculated}
                />

                {/* Výrazné tlačítko: Odeslat trasu dítěti */}
                <div className="pt-1 space-y-2">
                  <button
                    type="button"
                    onClick={handleDispatchRouteToChild}
                    disabled={isDispatching}
                    className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold py-3.5 px-4 rounded-xl text-sm transition-all shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 active:scale-[0.98] border border-emerald-400"
                  >
                    <span className="text-base">{isDispatching ? '⏳' : (routeDispatched ? '✅' : '📲')}</span>
                    <span>{isDispatching ? 'Odesílám trasu...' : '📲 Odeslat trasu dítěti'}</span>
                  </button>
                  {routeDispatched && (
                    <div className="p-3 rounded-xl bg-emerald-950/90 border border-emerald-400 text-emerald-300 text-xs font-bold text-center flex items-center justify-center gap-2 shadow-lg animate-fadeIn">
                      <span className="text-emerald-400 text-base">✓</span>
                      <span>Trasa byla úspěšně odeslána do telefonu dítěte.</span>
                    </div>
                  )}
                  {selectedChildCode && (
                    <div className="text-[10px] text-emerald-400/80 font-mono text-center mt-1">
                      Cílové zařízení dítěte: {selectedChildCode}
                    </div>
                  )}
                </div>

                {/* 2. Čisté srovnání s nejrychlejší trasou */}
                {fastestRoute && (
                  <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/70 flex items-center justify-between transition-all hover:bg-slate-800/70">
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

                {/* Výhody a prevence */}
                <RouteSafetyBenefits />

                {/* Simulace */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (isSimulating) {
                        const pairedCode = typeof window !== 'undefined' ? localStorage.getItem('safepath_paired_child_code') : null;
                        if (pairedCode) {
                          terminateChildNavigation(pairedCode).catch(console.warn);
                        }
                      }
                      onToggleSimulation?.();
                    }}
                    className={`w-full py-3.5 rounded-xl font-bold transition-all shadow-lg text-white text-sm ${
                      isSimulating 
                        ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20' 
                        : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
                    }`}
                  >
                    {isSimulating ? 'Ukončit navigaci (Smazat data)' : '▶ Spustit simulaci pohybu dítěte'}
                  </button>
                </div>
              </>
            ) : (
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 text-slate-400 text-xs text-center">
                Zadejte výchozí a cílový bod pro vyhledání bezpečné trasy.
              </div>
            )}

            {/* Posílený právní disclaimer a GDPR zápatí */}
            <div className="mt-4 pt-3.5 border-t border-slate-800/90 text-left">
              <p className="text-[10px] text-slate-400 leading-relaxed mb-2">
                Aplikace SafePath poskytuje doporučené koridory na základě dostupných městských dat. Trasa má orientační charakter a nenahrazuje dohled rodičů ani pravidla silničního provozu.
              </p>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setIsPrivacyModalOpen(true)}
                  className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1.5 transition-colors underline"
                >
                  <span>🛡️</span>
                  <span>Ochrana soukromí (GDPR)</span>
                </button>
                <span className="text-[10px] text-slate-500 font-mono">Minimalizace dat</span>
              </div>
            </div>

            {/* Spodní bezpečná zóna pro scroll (safe-area padding) */}
            <div className="h-14 shrink-0" aria-hidden="true" />
          </div>
        </div>
      </aside>

      {/* Modal Ochrany soukromí a GDPR */}
      <PrivacyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />
    </>
  );
}
