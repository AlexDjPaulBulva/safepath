import { useState, useEffect, useRef, useCallback } from 'react';
import { sendEmergencyBatteryRescuePacket } from '../lib/liveSync';
import { reverseGeocode } from '../lib/geocoding';

export interface BatteryStatus {
  level: number; // 0 - 100
  charging: boolean;
  isLowBattery: boolean; // < 15 % && !charging
  supported: boolean;
  powerSavingMode: boolean;
  simulateLowBattery: boolean;
  toggleSimulateLowBattery: () => void;
}

export function useBatteryProtocol(options?: {
  childCode?: string | null;
  currentCoords?: { lat: number; lng: number; accuracy?: number } | null;
  remainingMinutes?: number;
}): BatteryStatus {
  const [level, setLevel] = useState<number>(85);
  const [charging, setCharging] = useState<boolean>(false);
  const [supported, setSupported] = useState<boolean>(false);
  const [simulateLowBattery, setSimulateLowBattery] = useState<boolean>(false);

  const lastAlertSentRef = useRef<boolean>(false);

  const toggleSimulateLowBattery = useCallback(() => {
    setSimulateLowBattery(prev => !prev);
  }, []);

  useEffect(() => {
    let batteryObj: any = null;

    const handleBatteryUpdate = () => {
      if (!batteryObj) return;
      const rawLevel = Math.round(batteryObj.level * 100);
      const rawCharging = Boolean(batteryObj.charging);
      setLevel(rawLevel);
      setCharging(rawCharging);
      setSupported(true);
    };

    if (typeof navigator !== 'undefined' && 'getBattery' in (navigator as any)) {
      (navigator as any).getBattery()
        .then((b: any) => {
          batteryObj = b;
          handleBatteryUpdate();
          b.addEventListener('levelchange', handleBatteryUpdate);
          b.addEventListener('chargingchange', handleBatteryUpdate);
        })
        .catch(() => {
          setSupported(false);
        });
    }

    return () => {
      if (batteryObj) {
        batteryObj.removeEventListener('levelchange', handleBatteryUpdate);
        batteryObj.removeEventListener('chargingchange', handleBatteryUpdate);
      }
    };
  }, []);

  const effectiveLevel = simulateLowBattery ? 12 : level;
  const effectiveCharging = simulateLowBattery ? false : charging;
  const isLowBattery = effectiveLevel < 15 && !effectiveCharging;
  const powerSavingMode = isLowBattery;

  // Okamžitý záchranný paket pro rodiče při přechodu do kritického stavu
  useEffect(() => {
    if (!isLowBattery) {
      lastAlertSentRef.current = false;
      return;
    }

    if (lastAlertSentRef.current) return;
    if (!options?.childCode || !options?.currentCoords) return;

    lastAlertSentRef.current = true;
    const { lat, lng } = options.currentCoords;

    console.log(`[SafePath BatteryProtocol] ⚠️ Aktivován nouzový protokol vybití: ${effectiveLevel}%`);

    reverseGeocode(lat, lng)
      .then((street) => {
        sendEmergencyBatteryRescuePacket(
          options.childCode!,
          options.currentCoords!,
          effectiveLevel,
          options.remainingMinutes ?? 10,
          street || 'Praha'
        ).catch(console.warn);
      })
      .catch(() => {
        sendEmergencyBatteryRescuePacket(
          options.childCode!,
          options.currentCoords!,
          effectiveLevel,
          options.remainingMinutes ?? 10,
          'Praha'
        ).catch(console.warn);
      });
  }, [isLowBattery, effectiveLevel, options?.childCode, options?.currentCoords, options?.remainingMinutes]);

  return {
    level: effectiveLevel,
    charging: effectiveCharging,
    isLowBattery,
    supported,
    powerSavingMode,
    simulateLowBattery,
    toggleSimulateLowBattery
  };
}
