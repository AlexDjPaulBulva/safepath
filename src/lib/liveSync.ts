import { ref, set, update, onValue, get, remove } from 'firebase/database';
import { db } from './firebase';

export interface ChildSessionData {
  code: string;
  lat: number;
  lng: number;
  inCorridor: boolean;
  lastSeen: number;
  timestamp?: number;
  battery?: number;
  accuracy?: number;
  role?: string;
  isOffline?: boolean;
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
  battery?: number
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
  await update(sessionRef, updateData);
}

/**
 * Připojí posluchač onValue na uzel daného kódu a při každé změně polohy dítěte
 * předá aktuální data do rodičovské komponenty.
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
  onPositionChange?: (coords: { lat: number; lng: number }) => void
): () => void {
  let isStopped = false;
  let watchId: number | null = null;
  let intervalId: any = null;

  let currentLat = 50.0755;
  let currentLng = 14.4378;
  let currentAccuracy: number | undefined = undefined;
  let inCorridor = true;
  let currentBattery: number = 88;

  // Sledování úrovně baterie zařízení
  if (typeof navigator !== 'undefined' && 'getBattery' in (navigator as any)) {
    (navigator as any).getBattery().then((batteryObj: any) => {
      currentBattery = Math.round(batteryObj.level * 100);
      batteryObj.addEventListener('levelchange', () => {
        currentBattery = Math.round(batteryObj.level * 100);
      });
    }).catch(() => {});
  }

  const pushUpdate = () => {
    if (isStopped) return;
    updateChildPosition(code, currentLat, currentLng, inCorridor, currentAccuracy, currentBattery).catch((err) => {
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
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000
      }
    );
  }

  // Zajištění odesílání každé 3-4 sekundy i při pomalém GPS pohybu
  intervalId = setInterval(() => {
    pushUpdate();
  }, 3500);

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
