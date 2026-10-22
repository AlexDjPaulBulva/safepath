import { ref, set, update, onValue, get, remove } from 'firebase/database';
import { db } from './firebase';

export interface SafePassCrisisReport {
  reporterLocation?: { lat: number; lng: number } | null;
  reporterAddress?: string;
  venueName?: string;
  reportedAt: number;
  message: string;
}

export interface AssignedRouteData {
  pathCoords: [number, number][]; // [lat, lng] souřadnice
  start: { lat: number; lng: number; name?: string };
  end: { lat: number; lng: number; name?: string };
  distanceKm?: number;
  durationMin?: number;
  timestamp: number;
}

export interface ChildSessionData {
  code: string;
  lat: number;
  lng: number;
  inCorridor: boolean;
  lastSeen: number;
  timestamp?: number;
  battery?: number;
  charging?: boolean;
  accuracy?: number;
  role?: string;
  isOffline?: boolean;
  low_battery_alert?: boolean;
  remainingMinutesToTarget?: number;
  lastStreetName?: string;
  safePassCrisisReport?: SafePassCrisisReport | null;
  assignedRoute?: AssignedRouteData | null;
}

/**
 * Získá úroveň nabití baterie zařízení v procentech (0–100).
 */
export async function getDeviceBatteryLevel(): Promise<number> {
  if (typeof navigator !== 'undefined' && 'getBattery' in (navigator as any)) {
    try {
      const b = await (navigator as any).getBattery();
      return Math.round(b.level * 100);
    } catch {
      return 85;
    }
  }
  return 85;
}

/**
 * Zapíše do databáze nový uzel:
 * { code, lat: initialCoords.lat, lng: initialCoords.lng, inCorridor: true, lastSeen: Date.now(), timestamp: Date.now(), battery, role: 'child' }
 */
export async function startChildSession(
  code: string,
  initialCoords: { lat: number; lng: number },
  battery?: number
): Promise<void> {
  const sessionRef = ref(db, `sessions/${code}`);
  const now = Date.now();
  const batteryLevel = typeof battery === 'number' ? battery : await getDeviceBatteryLevel();
  await set(sessionRef, {
    code,
    lat: initialCoords.lat,
    lng: initialCoords.lng,
    inCorridor: true,
    lastSeen: now,
    timestamp: now,
    battery: batteryLevel,
    role: 'child'
  });
}

/**
 * Pomocí update(ref(db, `sessions/${code}`), { lat, lng, inCorridor, lastSeen: Date.now(), timestamp: Date.now(), battery })
 * posílá polohu dítěte s časovým razítkem a stavem baterie.
 */
export async function updateChildPosition(
  code: string,
  lat: number,
  lng: number,
  inCorridor: boolean = true,
  accuracy?: number,
  battery?: number,
  extra?: {
    charging?: boolean;
    low_battery_alert?: boolean;
    remainingMinutesToTarget?: number;
    lastStreetName?: string;
  }
): Promise<void> {
  const sessionRef = ref(db, `sessions/${code}`);
  const now = Date.now();
  const updateData: Record<string, any> = {
    lat,
    lng,
    inCorridor,
    lastSeen: now,
    timestamp: now
  };
  if (typeof accuracy === 'number') {
    updateData.accuracy = accuracy;
  }
  if (typeof battery === 'number') {
    updateData.battery = battery;
  }
  if (extra?.charging !== undefined) {
    updateData.charging = extra.charging;
  }
  if (extra?.low_battery_alert !== undefined) {
    updateData.low_battery_alert = extra.low_battery_alert;
  }
  if (typeof extra?.remainingMinutesToTarget === 'number') {
    updateData.remainingMinutesToTarget = extra.remainingMinutesToTarget;
  }
  if (extra?.lastStreetName) {
    updateData.lastStreetName = extra.lastStreetName;
  }
  await update(sessionRef, updateData);
}

/**
 * Okamžitý záchranný paket pro rodiče při kritickém vybití baterie (< 15 % bez nabíječky)
 */
export async function sendEmergencyBatteryRescuePacket(
  code: string,
  coords: { lat: number; lng: number; accuracy?: number },
  batteryLevel: number,
  remainingMinutes?: number,
  streetName?: string
): Promise<void> {
  const sessionRef = ref(db, `sessions/${code}`);
  const now = Date.now();
  await update(sessionRef, {
    lat: coords.lat,
    lng: coords.lng,
    accuracy: coords.accuracy || 10,
    battery: batteryLevel,
    charging: false,
    low_battery_alert: true,
    lastSeen: now,
    timestamp: now,
    remainingMinutesToTarget: remainingMinutes ?? 10,
    lastStreetName: streetName || 'Praha'
  });
}

/**
 * Nahlásí nález dítěte / krizový stav ze SafePass QR kódu kýmkoliv (Veřejná záchranná stránka)
 */
export async function reportSafePassCrisis(
  childCode: string,
  details: {
    venueName?: string;
    reporterAddress?: string;
    reporterLocation?: { lat: number; lng: number } | null;
  }
): Promise<void> {
  const sessionRef = ref(db, `sessions/${childCode}`);
  const now = Date.now();
  const addressText = details.venueName 
    ? `${details.venueName}${details.reporterAddress ? ` (${details.reporterAddress})` : ''}`
    : (details.reporterAddress || (details.reporterLocation ? `GPS: ${details.reporterLocation.lat.toFixed(5)}, ${details.reporterLocation.lng.toFixed(5)}` : 'Praha'));

  const report: SafePassCrisisReport = {
    reporterLocation: details.reporterLocation || null,
    reporterAddress: details.reporterAddress || '',
    venueName: details.venueName || '',
    reportedAt: now,
    message: `Dítě nahlášeno na krizovém bodě / Safe Haven! Poloha nálezce: ${addressText}`
  };

  await update(sessionRef, {
    safePassCrisisReport: report,
    inCorridor: false,
    lastSeen: now,
    timestamp: now
  });
}

/**
 * GDPR: Ukončení navigace a kompletní okamžitý výmaz polohových dat z Firebase
 */
export async function terminateChildNavigation(code: string): Promise<void> {
  if (!code) return;
  try {
    const sessionRef = ref(db, `sessions/${code}`);
    await remove(sessionRef);
    console.log(`GDPR Privacy: Polohová data sezení ${code} byla kompletně a trvale vymazána.`);
  } catch (err) {
    console.warn(`Chyba při mazání relace dítěte ${code}:`, err);
  }
}

/**
 * Uloží rodičem určenou trasu do relace dítěte ve Firebase Realtime Database
 */
export async function dispatchRouteToChild(
  childCode: string,
  route: {
    pathCoords: [number, number][];
    start: { lat: number; lng: number; name?: string };
    end: { lat: number; lng: number; name?: string };
    distanceKm?: number;
    durationMin?: number;
  }
): Promise<void> {
  const sessionRef = ref(db, `sessions/${childCode}`);
  await update(sessionRef, {
    assignedRoute: {
      pathCoords: route.pathCoords,
      start: route.start,
      end: route.end,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      timestamp: Date.now()
    }
  });
}

/**
 * Poslouchá změnu přiřazené trasy z Firebase pro displej dítěte
 */
export function subscribeToAssignedRoute(
  childCode: string,
  callback: (route: AssignedRouteData | null) => void
): () => void {
  const routeRef = ref(db, `sessions/${childCode}/assignedRoute`);
  return onValue(routeRef, (snapshot) => {
    callback(snapshot.val() || null);
  });
}

/**
 * Připojí posluchač onValue na uzel daného kódu a při každé změně polohy dítěte
 * předá aktuální data do rodičovské komponenty.
 * Automaticky kontroluje GDPR expiraci (pokud je sezení neaktivní > 2 hodiny, ihned ho maže).
 * Vrací funkci pro odhlášení (unsubscribe).
 */
export function subscribeToChildSession(
  code: string,
  callback: (data: ChildSessionData | null) => void
): () => void {
  const sessionRef = ref(db, `sessions/${code}`);
  const unsubscribe = onValue(
    sessionRef,
    (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // GDPR: Zkontrolovat stáří poslední aktivity (2 hodiny = 7 200 000 ms)
        const lastActivity = data.lastSeen || data.timestamp || 0;
        const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
        if (Date.now() - lastActivity > TWO_HOURS_MS) {
          console.log(`GDPR Privacy: Sezení ${code} je neaktivní déle než 2 hodiny. Provádím automatický výmaz.`);
          remove(sessionRef).catch(console.warn);
          callback(null);
          return;
        }
      }
      callback(data);
    },
    (error) => {
      console.error('SafePath liveSync subscribe error:', error);
    }
  );

  return () => {
    unsubscribe();
  };
}

/**
 * Ověří existenci sezení a načte aktuální data dítěte
 */
export async function getChildSession(code: string): Promise<ChildSessionData | null> {
  const sessionRef = ref(db, `sessions/${code}`);
  const snapshot = await get(sessionRef);
  if (snapshot.exists()) {
    return snapshot.val() as ChildSessionData;
  }
  return null;
}

/**
 * Uloží spárovaný 6místný kód dítěte trvale pod účet přihlášeného rodiče:
 * /users/${parentUid}/pairedChildren/${childCode}: true
 */
export async function savePairedChildToParent(parentUid: string, childCode: string): Promise<void> {
  if (!parentUid || !childCode) return;
  const childRef = ref(db, `users/${parentUid}/pairedChildren/${childCode}`);
  await set(childRef, true);
}

/**
 * Odebere spárované dítě z účtu rodiče.
 */
export async function removePairedChildFromParent(parentUid: string, childCode: string): Promise<void> {
  if (!parentUid || !childCode) return;
  const childRef = ref(db, `users/${parentUid}/pairedChildren/${childCode}`);
  await remove(childRef);
}

/**
 * Načte všechna dříve spárovaná zařízení k účtu rodiče.
 */
export async function getPairedChildren(parentUid: string): Promise<string[]> {
  if (!parentUid) return [];
  const snapshot = await get(ref(db, `users/${parentUid}/pairedChildren`));
  if (snapshot.exists()) {
    const data = snapshot.val();
    return Object.keys(data || {});
  }
  return [];
}

/**
 * Poslouchá změny v seznamu spárovaných zařízení rodiče v reálném čase.
 */
export function subscribeToParentPairedChildren(
  parentUid: string,
  callback: (childCodes: string[]) => void
): () => void {
  if (!parentUid) {
    callback([]);
    return () => {};
  }
  const userChildrenRef = ref(db, `users/${parentUid}/pairedChildren`);
  return onValue(userChildrenRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      callback(Object.keys(data || {}));
    } else {
      callback([]);
    }
  });
}

/**
 * Spustí automatické sledování GPS a odesílání polohy do Firebase každých 3–5 sekund.
 * Vrací funkci pro zastavení sledování.
 */
export function startGpsStreaming(
  code: string,
  onPositionChange?: (coords: { lat: number; lng: number }) => void,
  options?: {
    isPowerSaving?: boolean;
    getRouteRemainingMinutes?: () => number;
  }
): () => void {
  let isStopped = false;
  let watchId: number | null = null;
  let intervalId: any = null;

  let currentLat = 50.0755;
  let currentLng = 14.4378;
  let currentAccuracy: number | undefined = undefined;
  let inCorridor = true;
  let currentBattery: number = 88;
  let currentCharging: boolean = false;
  let isLowBatteryMode: boolean = Boolean(options?.isPowerSaving);

  const getIntervalMs = () => (isLowBatteryMode ? 15000 : 3500);

  const restartInterval = () => {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(() => {
      pushUpdate();
    }, getIntervalMs());
  };

  // Sledování úrovně baterie zařízení a stavu nabíjení
  if (typeof navigator !== 'undefined' && 'getBattery' in (navigator as any)) {
    (navigator as any).getBattery().then((batteryObj: any) => {
      currentBattery = Math.round(batteryObj.level * 100);
      currentCharging = Boolean(batteryObj.charging);
      const isCritical = currentBattery < 15 && !currentCharging;
      if (isCritical !== isLowBatteryMode) {
        isLowBatteryMode = isCritical;
        restartInterval();
      }

      batteryObj.addEventListener('levelchange', () => {
        currentBattery = Math.round(batteryObj.level * 100);
        const low = currentBattery < 15 && !currentCharging;
        if (low !== isLowBatteryMode) {
          isLowBatteryMode = low;
          restartInterval();
        }
      });
      batteryObj.addEventListener('chargingchange', () => {
        currentCharging = Boolean(batteryObj.charging);
        const low = currentBattery < 15 && !currentCharging;
        if (low !== isLowBatteryMode) {
          isLowBatteryMode = low;
          restartInterval();
        }
      });
    }).catch(() => {});
  }

  const pushUpdate = () => {
    if (isStopped) return;
    updateChildPosition(code, currentLat, currentLng, inCorridor, currentAccuracy, currentBattery, {
      charging: currentCharging,
      low_battery_alert: isLowBatteryMode,
      remainingMinutesToTarget: options?.getRouteRemainingMinutes?.() ?? 10
    }).catch((err) => {
      console.warn('Chyba při aktualizaci polohy dítěte do Firebase:', err);
    });
  };

  if (typeof window !== 'undefined' && 'geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // GPS Noise Filter: Ignoruj GPS souřadnice, jejichž hodnota coords.accuracy je horší než 25 metrů
        if (typeof pos.coords.accuracy === 'number' && pos.coords.accuracy > 25) {
          console.log(`LiveSync Noise Filter: Ignoruji vzorek s accuracy ${pos.coords.accuracy}m > 25m`);
          return;
        }
        currentLat = pos.coords.latitude;
        currentLng = pos.coords.longitude;
        currentAccuracy = pos.coords.accuracy;
        onPositionChange?.({ lat: currentLat, lng: currentLng });
        pushUpdate();
      },
      (err) => {
        console.warn('Geolocation warning v liveSync:', err.message);
      },
      {
        enableHighAccuracy: !isLowBatteryMode,
        maximumAge: isLowBatteryMode ? 15000 : 3000,
        timeout: isLowBatteryMode ? 20000 : 10000
      }
    );
  }

  // Zajištění odesílání: normálně každých 3.5s, v úsporném režimu při vybití (<15%) 1x za 15 sekund
  restartInterval();

  return () => {
    isStopped = true;
    if (watchId !== null && typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchId);
    }
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
}
