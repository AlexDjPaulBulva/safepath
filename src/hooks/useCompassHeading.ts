import { useState, useEffect, useRef } from 'react';

export interface CompassHeadingOptions {
  gpsHeading?: number | null;
  speed?: number | null; // v m/s
  alpha?: number; // koeficient EMA vyhlazování (výchozí 0.22)
  deadbandDegrees?: number; // mrtvé pásmo v stupních (výchozí 7)
  minWalkingSpeedMps?: number; // minimální rychlost pro aktualizaci z GPS (výchozí 0.4 m/s)
}

/**
 * Hook pro stabilní, vyhlazené směrování navigační šipky (Low-Pass EMA Filter + Deadband + 360° Wrap).
 * Eliminuje třes a rotaci při stání na místě (< 0.4 m/s) a mikro-výkyvy pod 7°.
 */
export function useCompassHeading(options: CompassHeadingOptions = {}): number | null {
  const {
    gpsHeading,
    speed,
    alpha = 0.22,
    deadbandDegrees = 7,
    minWalkingSpeedMps = 0.4
  } = options;

  const [smoothedHeading, setSmoothedHeading] = useState<number | null>(null);
  const currentHeadingRef = useRef<number | null>(null);
  const lastWalkingHeadingRef = useRef<number | null>(null);

  // Hardwarový digitální kompas (záložní čtení orientace zařízení)
  const [deviceCompass, setDeviceCompass] = useState<number | null>(null);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let compass: number | null = null;
      // iOS Safari (webkitCompassHeading udává azimut 0-360 stupňů od severu)
      if (typeof (e as any).webkitCompassHeading === 'number') {
        compass = (e as any).webkitCompassHeading;
      } else if (typeof e.alpha === 'number') {
        // Standardní Android / Chrome
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

  useEffect(() => {
    let target: number | null = null;
    const isMoving = speed !== null && speed !== undefined && speed >= minWalkingSpeedMps;

    // 1. Pokud uživatel jde (rychlost >= 0.4 m/s) a GPS má platný směr:
    if (isMoving && gpsHeading !== null && gpsHeading !== undefined && !isNaN(gpsHeading)) {
      target = gpsHeading;
      lastWalkingHeadingRef.current = gpsHeading;
    } 
    // 2. Při stání na místě (rychlost < 0.4 m/s): zakaž aktualizaci podle GPS a zachovej poslední známý směr chůze
    else if (speed !== null && speed !== undefined && speed < minWalkingSpeedMps) {
      target = lastWalkingHeadingRef.current ?? deviceCompass;
    } 
    // 3. Fallback: pokud rychlost není známa, preferuj GPS heading, jinak kompas
    else if (gpsHeading !== null && gpsHeading !== undefined && !isNaN(gpsHeading)) {
      target = gpsHeading;
      lastWalkingHeadingRef.current = gpsHeading;
    } else {
      target = lastWalkingHeadingRef.current ?? deviceCompass;
    }

    if (target === null || isNaN(target)) return;

    // První inicializace
    if (currentHeadingRef.current === null) {
      currentHeadingRef.current = target;
      setSmoothedHeading(Math.round(target));
      return;
    }

    const current = currentHeadingRef.current;

    // Ošetření přechodu přes 360°/0° (nejkratší oblouk v intervalu [-180, 180])
    const diff = ((target - current + 540) % 360) - 180;

    // Mrtvé pásmo (deadband threshold): Pokud je změna úhlu menší než 7°, neměň natočení šipky
    if (Math.abs(diff) < deadbandDegrees) {
      return;
    }

    // Exponenciální vyhlazování (EMA)
    const nextAngle = (current + alpha * diff + 360) % 360;
    currentHeadingRef.current = nextAngle;
    setSmoothedHeading(Math.round(nextAngle));
  }, [gpsHeading, speed, deviceCompass, alpha, deadbandDegrees, minWalkingSpeedMps]);

  return smoothedHeading;
}

export default useCompassHeading;
