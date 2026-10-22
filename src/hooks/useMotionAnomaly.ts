import { useState, useEffect, useRef, useCallback } from 'react';
import { SyncEngine } from '../lib/sync-engine';
import { useAppStore } from '../store/useAppStore';
import { OSMSurveillanceFeature } from '../lib/osm-surveillance-harvester';
import { getDistance } from '../lib/safety-engine';

export interface MotionAnomalyState {
  currentSpeedKmh: number;
  heightenedVigilance: boolean; // Běh / úprk (> 12 km/h)
  fallDetected: boolean; // Detekován náraz > 25 m/s² a 5s klid
  fallCountdown: number | null; // 20s odpočet
  isStuckInDark: boolean; // Uváznutí na místě (< 0.5 km/h) bez kamer > 90s
  stuckDurationSeconds: number;
  dismissFall: () => void;
  dismissStuck: () => void;
  // Testovací simulace pro snazší ověření
  triggerFallSimulation: () => void;
  triggerRunningSimulation: () => void;
  triggerStuckSimulation: () => void;
  resetAnomalies: () => void;
}

export interface UseMotionAnomalyOptions {
  enabled?: boolean;
  currentLocation?: { lat: number; lng: number } | null;
  activeMode?: 'parent' | 'night_girl' | 'child';
  isNight?: boolean;
  cameras?: (OSMSurveillanceFeature | { coords: [number, number]; radius?: number })[];
}

const RUN_SPEED_THRESHOLD_KMH = 12.0; // 12 km/h = cca 3.33 m/s
const STUCK_SPEED_THRESHOLD_KMH = 0.5; // 0.5 km/h
const IMPACT_ACCELERATION_THRESHOLD = 25.0; // 25 m/s²
const FALL_REST_TIME_MS = 5000; // 5 sekund klidu po nárazu
const STUCK_TIME_THRESHOLD_SEC = 90; // 90 sekund bez pohybu v nehlídané zóně
const FALL_COUNTDOWN_SEC = 20; // 20 sekund na potvrzení "Jsem v pořádku"

export function useMotionAnomaly(options: UseMotionAnomalyOptions = {}): MotionAnomalyState {
  const {
    enabled = true,
    currentLocation = null,
    activeMode = 'parent',
    isNight = false,
    cameras = []
  } = options;

  const [currentSpeedKmh, setCurrentSpeedKmh] = useState<number>(0);
  const [heightenedVigilance, setHeightenedVigilance] = useState<boolean>(false);
  const [fallDetected, setFallDetected] = useState<boolean>(false);
  const [fallCountdown, setFallCountdown] = useState<number | null>(null);
  const [isStuckInDark, setIsStuckInDark] = useState<boolean>(false);
  const [stuckDurationSeconds, setStuckDurationSeconds] = useState<number>(0);

  const setChildStatus = useAppStore((state) => state.setChildStatus);

  // Reference pro sledování časů a zrychlení
  const impactTimestampRef = useRef<number | null>(null);
  const restingAfterImpactRef = useRef<boolean>(false);
  const lastLocationRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const stuckTimerRef = useRef<number>(0);

  // 1. SLEDOVÁNÍ AKCELERACE (Device Motion API)
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const ax = acc.x || 0;
      const ay = acc.y || 0;
      const az = acc.z || 0;
      const totalAcc = Math.sqrt(ax * ax + ay * ay + az * az);

      const now = Date.now();

      // Detekce nárazu > 25 m/s²
      if (totalAcc > IMPACT_ACCELERATION_THRESHOLD && !fallDetected && fallCountdown === null) {
        impactTimestampRef.current = now;
        restingAfterImpactRef.current = true;
      }

      // Kontrola, zda po nárazu následuje 5 sekund klid (cca tíhové zrychlení ~9.8 m/s² s odchylkou < 2)
      if (impactTimestampRef.current !== null && restingAfterImpactRef.current) {
        const timeSinceImpact = now - impactTimestampRef.current;
        const diffFromGravity = Math.abs(totalAcc - 9.81);

        if (diffFromGravity > 3.5 && timeSinceImpact < FALL_REST_TIME_MS) {
          // Příliš mnoho pohybu - nebyl to pád do bezvědomí/klidu
          restingAfterImpactRef.current = false;
          impactTimestampRef.current = null;
        } else if (timeSinceImpact >= FALL_REST_TIME_MS) {
          // 5 sekund klidu po nárazu potvrzeno -> spustíme odpočet pádu!
          impactTimestampRef.current = null;
          restingAfterImpactRef.current = false;
          setFallDetected(true);
          setFallCountdown(FALL_COUNTDOWN_SEC);

          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate([300, 150, 300, 150, 300]);
            } catch {
              // ignore
            }
          }
        }
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [enabled, fallDetected, fallCountdown]);

  // 2. SLEDOVÁNÍ RYCHLOSTI POHYBU (Běh / Úprk a Uváznutí)
  useEffect(() => {
    if (!enabled || !currentLocation) return;

    const now = Date.now();
    let speedKmh = 0;

    if (lastLocationRef.current) {
      const dtSeconds = (now - lastLocationRef.current.time) / 1000;
      if (dtSeconds > 0.5) {
        const distMeters = getDistance(
          lastLocationRef.current.lat,
          lastLocationRef.current.lng,
          currentLocation.lat,
          currentLocation.lng
        );
        speedKmh = (distMeters / dtSeconds) * 3.6;
        setCurrentSpeedKmh(Math.round(speedKmh * 10) / 10);
      }
    }

    lastLocationRef.current = { lat: currentLocation.lat, lng: currentLocation.lng, time: now };

    // A. Běh / Úprk: rychlost > 12 km/h v nočním režimu nebo dětském profilu
    const isVulnerableMode = activeMode === 'night_girl' || activeMode === 'child' || isNight;
    if (speedKmh > RUN_SPEED_THRESHOLD_KMH && isVulnerableMode) {
      setHeightenedVigilance(true);
    } else if (speedKmh <= 6.0) {
      // Návrat k normální chůzi resetuje zvýšenou bdělost po chvíli
      setHeightenedVigilance(false);
    }

    // B. Uváznutí: rychlost < 0.5 km/h v nehlídaném úseku bez kamer
    let camerasNearby = 0;
    if (cameras.length > 0) {
      for (const cam of cameras) {
        const camCoords = 'coords' in cam ? cam.coords : [cam.lat, cam.lng] as [number, number];
        const radius = ('radius' in cam && cam.radius) || 60;
        if (getDistance(currentLocation.lat, currentLocation.lng, camCoords[0], camCoords[1]) <= radius) {
          camerasNearby++;
          break;
        }
      }
    }

    const isUnmonitored = camerasNearby === 0;
    isStuckCandidateRef.current = speedKmh < STUCK_SPEED_THRESHOLD_KMH && isUnmonitored;
  }, [currentLocation, enabled, activeMode, isNight, cameras]);

  const isStuckCandidateRef = useRef<boolean>(false);

  // Samostatný stabilní interval pro uváznutí na místě (přesně 1x za sekundu s cleanupem)
  useEffect(() => {
    if (!enabled) {
      stuckTimerRef.current = 0;
      setStuckDurationSeconds(0);
      setIsStuckInDark(false);
      return;
    }

    const timer = setInterval(() => {
      if (isStuckCandidateRef.current) {
        stuckTimerRef.current += 1;
        setStuckDurationSeconds(stuckTimerRef.current);
        if (stuckTimerRef.current >= STUCK_TIME_THRESHOLD_SEC) {
          setIsStuckInDark(true);
        }
      } else {
        if (stuckTimerRef.current > 0) {
          stuckTimerRef.current = 0;
          setStuckDurationSeconds(0);
          setIsStuckInDark(false);
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [enabled]);

  // 3. ODPOČET PÁDU (20 sekund s potvrzením "Jsem v pořádku")
  useEffect(() => {
    if (fallCountdown === null) return;

    if (fallCountdown > 0) {
      const timer = setTimeout(() => {
        setFallCountdown(fallCountdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (fallCountdown === 0) {
      // Vypršel limit 20s bez odpovědi -> Aktivace stavu nouze a dispečinku!
      setFallCountdown(null);
      setChildStatus('ALERT');

      if (currentLocation) {
        SyncEngine.broadcast('SOS_ALERT', {
          location: [currentLocation.lat, currentLocation.lng],
          reason: 'Byl detekován pád a uživatel neodpověděl do 20 sekund!'
        });
      }
    }
  }, [fallCountdown, currentLocation, setChildStatus]);

  const dismissFall = useCallback(() => {
    setFallDetected(false);
    setFallCountdown(null);
    impactTimestampRef.current = null;
    restingAfterImpactRef.current = false;
  }, []);

  const dismissStuck = useCallback(() => {
    setIsStuckInDark(false);
    stuckTimerRef.current = 0;
    setStuckDurationSeconds(0);
  }, []);

  // Testovací simulační funkce
  const triggerFallSimulation = useCallback(() => {
    setFallDetected(true);
    setFallCountdown(FALL_COUNTDOWN_SEC);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200]);
      } catch {
        // ignore
      }
    }
  }, []);

  const triggerRunningSimulation = useCallback(() => {
    setCurrentSpeedKmh(14.5);
    setHeightenedVigilance(true);
    setTimeout(() => {
      setHeightenedVigilance(false);
      setCurrentSpeedKmh(4.2);
    }, 15000); // Po 15 sekundách návrat do normálu
  }, []);

  const triggerStuckSimulation = useCallback(() => {
    setCurrentSpeedKmh(0.1);
    setStuckDurationSeconds(95);
    setIsStuckInDark(true);
  }, []);

  const resetAnomalies = useCallback(() => {
    setHeightenedVigilance(false);
    setFallDetected(false);
    setFallCountdown(null);
    setIsStuckInDark(false);
    setStuckDurationSeconds(0);
    setCurrentSpeedKmh(0);
    stuckTimerRef.current = 0;
  }, []);

  return {
    currentSpeedKmh,
    heightenedVigilance,
    fallDetected,
    fallCountdown,
    isStuckInDark,
    stuckDurationSeconds,
    dismissFall,
    dismissStuck,
    triggerFallSimulation,
    triggerRunningSimulation,
    triggerStuckSimulation,
    resetAnomalies
  };
}
