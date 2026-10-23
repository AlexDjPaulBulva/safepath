import { useState, useEffect, useRef } from 'react';

export interface CompassHeadingOptions {
  gpsHeading?: number | null;
  speed?: number | null; // v m/s
  accuracy?: number | null; // v metrech
  alpha?: number; // koeficient EMA vyhlazování (výchozí 0.2)
  deadbandDegrees?: number; // mrtvé pásmo ve stupních (výchozí 6)
  minWalkingSpeedMps?: number; // minimální rychlost pro aktualizaci z GPS (výchozí 0.5 m/s)
}

export interface CompassHeadingResult {
  heading: number | null;
  isMoving: boolean;
}

/**
 * Hook pro stabilní, vyhlazené směrování navigační šipky (Low-Pass EMA Filter + Deadband + 360° Wrap).
 * Šipka reaguje na azimut POUZE při reálném pohybu (speed > 0.5 m/s).
 * Pokud uživatel stojí na místě nebo je signál slabý, šipka se nezmatkuje, drží poslední známý směr
 * a indikuje klidový stav (isMoving: false).
 */
export function useCompassHeading(options: CompassHeadingOptions = {}): CompassHeadingResult {
  const {
    gpsHeading,
    speed,
    accuracy,
    alpha = 0.2,
    deadbandDegrees = 6,
    minWalkingSpeedMps = 0.5
  } = options;

  const [smoothedHeading, setSmoothedHeading] = useState<number | null>(null);
  const currentHeadingRef = useRef<number | null>(null);
  const lastWalkingHeadingRef = useRef<number | null>(null);

  // Hardwarový digitální kompas (počáteční záložní čtení)
  const [deviceCompass, setDeviceCompass] = useState<number | null>(null);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let compass: number | null = null;
      if (typeof (e as any).webkitCompassHeading === 'number') {
        compass = (e as any).webkitCompassHeading;
      } else if (typeof e.alpha === 'number') {
        compass = (360 - e.alpha) % 360;
      }
      if (compass !== null && !isNaN(compass)) {
        setDeviceCompass(Math.round(compass));
      }
    };

    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', handleOrientation, true);
      window.addEventListener('deviceorientationabsolute' as any, handleOrientation, true);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('deviceorientation', handleOrientation, true);
        window.removeEventListener('deviceorientationabsolute' as any, handleOrientation, true);
      }
    };
  }, []);

  // Vyhodnocení reálného pohybu: rychlost musí být striktně > 0.5 m/s a signál nesmí být slabý (> 30 m accuracy)
  const isWeakSignal = typeof accuracy === 'number' && accuracy > 30;
  const isMoving = !isWeakSignal && typeof speed === 'number' && speed > minWalkingSpeedMps;

  useEffect(() => {
    // 1. Šipka reaguje na azimut POUZE při reálném pohybu (speed > 0.5 m/s)
    if (isMoving && gpsHeading !== null && gpsHeading !== undefined && !isNaN(gpsHeading)) {
      lastWalkingHeadingRef.current = gpsHeading;
      const target = gpsHeading;

      // První inicializace
      if (currentHeadingRef.current === null) {
        currentHeadingRef.current = target;
        setSmoothedHeading(Math.round(target));
        return;
      }

      const current = currentHeadingRef.current;
      // Ošetření přechodu přes 360°/0° (nejkratší oblouk v intervalu [-180, 180])
      const diff = ((target - current + 540) % 360) - 180;

      // Mrtvé pásmo: pokud je změna úhlu menší než deadbandDegrees, neměň natočení
      if (Math.abs(diff) < deadbandDegrees) {
        return;
      }

      // Exponenciální vyhlazování (EMA)
      const nextAngle = (current + alpha * diff + 360) % 360;
      currentHeadingRef.current = nextAngle;
      setSmoothedHeading(Math.round(nextAngle));
    } else {
      // 2. Pokud uživatel stojí na místě nebo je signál slabý:
      // Šipka se nezmatkuje, drží poslední známý směr chůze
      if (lastWalkingHeadingRef.current !== null) {
        setSmoothedHeading(Math.round(lastWalkingHeadingRef.current));
      } else if (deviceCompass !== null && currentHeadingRef.current === null) {
        currentHeadingRef.current = deviceCompass;
        setSmoothedHeading(Math.round(deviceCompass));
      }
    }
  }, [gpsHeading, speed, accuracy, isMoving, deviceCompass, alpha, deadbandDegrees]);

  return {
    heading: smoothedHeading ?? lastWalkingHeadingRef.current ?? deviceCompass,
    isMoving
  };
}

export default useCompassHeading;
