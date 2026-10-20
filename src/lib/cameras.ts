import pragueStaticSafety from '../data/pragueStaticSafety.json';
import pragueSafetyCache from '../data/prague_safety_cache.json';

export interface OSMSurveillanceFeature {
  id: number;
  lat: number;
  lng: number;
  type: 'bullet' | 'dome' | 'ptz' | 'fixed' | 'unknown';
  direction: number | null; 
  angle: number; 
  rangeMeters: number; 
  description?: string;
}

export type CameraFeature = OSMSurveillanceFeature;

// 1. Prioritní načtení dat z lokálního bundle JSONu bez síťového požadavku
const staticCameras = (pragueStaticSafety.cameras || []) as OSMSurveillanceFeature[];
const cachedCameras = (pragueSafetyCache.cameras || []) as OSMSurveillanceFeature[];

// Inicializace paměťové cache s deduplikací podle ID
const uniqueMap = new Map<number, OSMSurveillanceFeature>();
for (const cam of [...staticCameras, ...cachedCameras]) {
  uniqueMap.set(cam.id, cam);
}

let inMemoryCameras: OSMSurveillanceFeature[] = Array.from(uniqueMap.values());
let isBackgroundFetchRunning = false;

/**
 * Volitelný background fetch z Overpass API:
 * - Spouští se pouze jako doplňkový background fetch na pozadí (fire-and-forget).
 * - NIKDY na něm nenechá viset vykreslení mapy ani výpočet trasy.
 * - Pokud síť selže nebo vrátí 429, aplikace běží 100% z lokálního souboru.
 */
async function triggerOptionalBackgroundOverpassFetch(
  minLat: number, minLng: number, maxLat: number, maxLng: number
): Promise<void> {
  if (isBackgroundFetchRunning) return;
  isBackgroundFetchRunning = true;

  try {
    const query = `[out:json][timeout:6];(
      node["man_made"="surveillance"](${minLat.toFixed(3)},${minLng.toFixed(3)},${maxLat.toFixed(3)},${maxLng.toFixed(3)});
      node["surveillance"](${minLat.toFixed(3)},${minLng.toFixed(3)},${maxLat.toFixed(3)},${maxLng.toFixed(3)});
    );out body;`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const endpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter'
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(`${ep}?data=${encodeURIComponent(query)}`, {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });

        if (res.status === 429) {
          console.warn('Overpass API vrátilo 429 (Rate Limit). Běžím 100% z lokálního statického datasetu.');
          break;
        }

        if (!res.ok) continue;

        const text = await res.text();
        if (!text.startsWith('{')) continue;

        const data = JSON.parse(text);
        if (Array.isArray(data?.elements)) {
          let added = false;
          for (const el of data.elements) {
            if (!uniqueMap.has(el.id)) {
              const newCam: OSMSurveillanceFeature = {
                id: el.id,
                lat: el.lat,
                lng: el.lon,
                type: 'ptz',
                direction: null,
                angle: 360,
                rangeMeters: 60,
                description: 'MKS kamera (Overpass update)'
              };
              uniqueMap.set(el.id, newCam);
              added = true;
            }
          }
          if (added) {
            inMemoryCameras = Array.from(uniqueMap.values());
          }
          break;
        }
      } catch {
        // Ignorovat síťové výpadky
      }
    }
    clearTimeout(timeout);
  } catch {
    // 100% fail-safe fallback
  } finally {
    isBackgroundFetchRunning = false;
  }
}

/**
 * Hlavní exportovaná funkce pro načtení MKS kamer:
 * - Prioritně okamžitě vrací data z lokálního bundle JSONu (pragueStaticSafety.json).
 * - Nevyžaduje ani nečeká na síťový požadavek.
 */
export async function fetchOSMCameras(
  minLat = 50.00, minLng = 14.22, maxLat = 50.18, maxLng = 14.70
): Promise<OSMSurveillanceFeature[]> {
  // Volitelný background fetch na pozadí bez await – mapa ani routing nikdy nečekají
  triggerOptionalBackgroundOverpassFetch(minLat, minLng, maxLat, maxLng).catch(() => {});

  // Okamžitý návrat lokálního bundle datasetu
  return inMemoryCameras;
}

export const fetchPragueCameras = fetchOSMCameras;

export function getStaticCameras(): OSMSurveillanceFeature[] {
  return inMemoryCameras;
}
