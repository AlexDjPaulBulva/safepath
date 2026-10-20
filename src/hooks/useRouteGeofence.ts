import { useState, useEffect, useRef, useMemo } from 'react';
import * as turf from '@turf/turf';
import { SyncEngine } from '../lib/sync-engine';
import { useAppStore } from '../store/useAppStore';

export interface UseRouteGeofenceOptions {
  corridorMeters?: number; // Výchozí: 35 m
  warningThresholdSec?: number; // Výchozí: 15 s
  alertThresholdSec?: number; // Výchozí: 45 s
  enabled?: boolean;
  safeStops?: { lat: number; lng: number; name?: string }[];
}

export interface GeofenceState {
  distanceMeters: number;
  isDeviated: boolean;
  deviationSeconds: number;
  warningActive: boolean;
  alertActive: boolean;
  resetGeofence: () => void;
}

/**
 * Hook pro koridorový geofencing:
 * - V reálném čase měří kolmou vzdálenost od aktivní trasy pomocí turf.pointToLineDistance.
 * - Throttling: Test vzdálenosti od koridoru spouštěn maximálně jednou za 3 sekundy pro úsporu baterie.
 * - Prostorový model trasy (Turf LineString) se generuje POUZE JEDNOU při změně geometrie trasy (useMemo).
 * - Toleranční koridor 35 metrů.
 * - Při odchylce > 35 m po dobu > 15 s spustí vibraci a varovnou notifikaci v UI.
 * - Při trvání > 45 s nastaví stav ALERT a simuluje push notifikaci na dispečink rodiče.
 */
export function useRouteGeofence(
  currentLocation: { lat: number; lng: number } | null,
  routeGeometry: [number, number][] | null,
  options: UseRouteGeofenceOptions = {}
): GeofenceState {
  const {
    corridorMeters = 35,
    warningThresholdSec = 15,
    alertThresholdSec = 45,
    enabled = true,
    safeStops = []
  } = options;

  const [distanceMeters, setDistanceMeters] = useState<number>(0);
  const [isDeviated, setIsDeviated] = useState<boolean>(false);
  const [deviationSeconds, setDeviationSeconds] = useState<number>(0);
  const [warningActive, setWarningActive] = useState<boolean>(false);
  const [alertActive, setAlertActive] = useState<boolean>(false);

  const setChildStatus = useAppStore((state) => state.setChildStatus);

  const hasVibratedRef = useRef(false);
  const hasAlertedRef = useRef(false);

  // Throttling reference (max 1x za 3 sekundy)
  const lastCalculationTimeRef = useRef<number>(0);
  const pendingLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prostorový výpočet trasy: POUZE JEDNOU při přijetí nové geometrie z routovacího enginu
  const routeLineString = useMemo(() => {
    if (!routeGeometry || routeGeometry.length < 2) {
      return null;
    }
    try {
      const turfCoords = routeGeometry.map(([lat, lng]) => [lng, lat]);
      return turf.lineString(turfCoords);
    } catch (err) {
      console.warn('Geofence: Nelze sestavit Turf LineString z geometrie:', err);
      return null;
    }
  }, [routeGeometry]);

  const evaluateCorridorDistance = (loc: { lat: number; lng: number }) => {
    if (!routeLineString) return;
    try {
      const pt = turf.point([loc.lng, loc.lat]);
      const dist = turf.pointToLineDistance(pt, routeLineString, { units: 'meters' });
      setDistanceMeters(Math.round(dist * 10) / 10);

      // Kontrola, zda uživatel není na povolené bezpečné zastávce (např. kavárna, knihovna, škola)
      const inSafeStop = safeStops.some(stop => {
        const d = turf.distance(
          pt,
          turf.point([stop.lng, stop.lat]),
          { units: 'meters' }
        );
        return d <= 50; // 50m okruh zastávky
      });

      if (inSafeStop) {
        setIsDeviated(false);
      } else {
        setIsDeviated(dist > corridorMeters);
      }
      lastCalculationTimeRef.current = Date.now();
    } catch (e) {
      console.warn('Chyba při výpočtu geofence vzdálenosti:', e);
    }
  };

  // Throttled výpočet vzdálenosti od trasy: maximálně 1x za 3 sekundy, nikoliv při každém mikroposunu GPS
  useEffect(() => {
    if (!enabled || !currentLocation || !routeLineString) {
      setDistanceMeters(0);
      setIsDeviated(false);
      return;
    }

    pendingLocationRef.current = currentLocation;
    const now = Date.now();
    const elapsed = now - lastCalculationTimeRef.current;

    if (elapsed >= 3000) {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      evaluateCorridorDistance(currentLocation);
    } else if (!throttleTimerRef.current) {
      const delay = 3000 - elapsed;
      throttleTimerRef.current = setTimeout(() => {
        throttleTimerRef.current = null;
        if (pendingLocationRef.current) {
          evaluateCorridorDistance(pendingLocationRef.current);
        }
      }, delay);
    }

    return () => {
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
    };
  }, [currentLocation, enabled, corridorMeters, safeStops, routeLineString]);

  // Časovač odchylky a eskalace (15s a 45s)
  useEffect(() => {
    if (!enabled || !isDeviated) {
      setDeviationSeconds(0);
      setWarningActive(false);
      setAlertActive(false);
      hasVibratedRef.current = false;
      hasAlertedRef.current = false;
      return;
    }

    const interval = setInterval(() => {
      setDeviationSeconds((prev) => {
        const next = prev + 1;

        // 1. Stupeň: Odchylka > 15 sekund -> Haptická odezva a varování v UI
        if (next >= warningThresholdSec && !hasVibratedRef.current) {
          hasVibratedRef.current = true;
          setWarningActive(true);

          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([200, 100, 200]);
            } catch {
              // Některé prohlížeče vyžadují uživatelskou interakci
            }
          }
        }

        // 2. Stupeň: Odchylka > 45 sekund -> Stav incidentu ALERT a push dispečinku
        if (next >= alertThresholdSec && !hasAlertedRef.current) {
          hasAlertedRef.current = true;
          setAlertActive(true);
          setChildStatus('ALERT');

          if (currentLocation) {
            SyncEngine.broadcast('DEVIATION_ALERT', {
              location: [currentLocation.lat, currentLocation.lng],
              durationSeconds: next,
              distanceMeters,
              message: 'Byla zjištěna závažná odchylka z bezpečné trasy (> 45 s mimo koridor 35 m)!'
            });
          }
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, isDeviated, warningThresholdSec, alertThresholdSec, currentLocation, distanceMeters, setChildStatus]);

  const resetGeofence = () => {
    setDeviationSeconds(0);
    setWarningActive(false);
    setAlertActive(false);
    hasVibratedRef.current = false;
    hasAlertedRef.current = false;
  };

  return {
    distanceMeters,
    isDeviated,
    deviationSeconds,
    warningActive,
    alertActive,
    resetGeofence
  };
}
