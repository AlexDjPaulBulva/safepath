import { ref, set, update, onValue, get } from 'firebase/database';
import { db } from './firebase';

export interface ChildSessionData {
  code: string;
  lat: number;
  lng: number;
  inCorridor: boolean;
  lastSeen: number;
  role?: string;
}

/**
 * Zapíše do databáze nový uzel:
 * { code, lat: initialCoords.lat, lng: initialCoords.lng, inCorridor: true, lastSeen: Date.now(), role: 'child' }
 */
export async function startChildSession(
  code: string,
  initialCoords: { lat: number; lng: number }
): Promise<void> {
  const sessionRef = ref(db, `sessions/${code}`);
  await set(sessionRef, {
    code,
    lat: initialCoords.lat,
    lng: initialCoords.lng,
    inCorridor: true,
    lastSeen: Date.now(),
    role: 'child'
  });
}

/**
 * Pomocí update(ref(db, `sessions/${code}`), { lat, lng, inCorridor, lastSeen: Date.now() })
 * posílá polohu dítěte.
 */
export async function updateChildPosition(
  code: string,
  lat: number,
  lng: number,
  inCorridor: boolean = true
): Promise<void> {
  const sessionRef = ref(db, `sessions/${code}`);
  await update(sessionRef, {
    lat,
    lng,
    inCorridor,
    lastSeen: Date.now()
  });
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
  let inCorridor = true;

  const pushUpdate = () => {
    if (isStopped) return;
    updateChildPosition(code, currentLat, currentLng, inCorridor).catch((err) => {
      console.warn('Chyba při aktualizaci polohy dítěte do Firebase:', err);
    });
  };

  if (typeof window !== 'undefined' && 'geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        currentLat = pos.coords.latitude;
        currentLng = pos.coords.longitude;
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
