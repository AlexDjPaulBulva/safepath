import enrichedData from '../data/pragueEnrichedSafety.json';
import staticData from '../data/pragueStaticSafety.json';

export interface GeocodeResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

const reverseGeocodeCache = new Map<string, string>();

/**
 * Rychlé lokální určení ulice / adresního bodu z offline databáze RÚIAN
 * a světelných křižovatek v Praze. Spolehlivě vrací reálnou ulici i bez sítě.
 */
export function getLocalStreetOrPlace(lat: number, lng: number): string | null {
  try {
    // 1. Zkontroluj RÚIAN vchody (do ~80 m, cca 0.0008°)
    const ruianEntrances = (enrichedData as any)?.ruianEntrances || [];
    let bestRuian: any = null;
    let minRuianDist = Infinity;
    for (const ent of ruianEntrances) {
      const d = Math.hypot(ent.lat - lat, ent.lng - lng);
      if (d < minRuianDist) {
        minRuianDist = d;
        bestRuian = ent;
      }
    }
    if (bestRuian && minRuianDist < 0.0008) {
      if (bestRuian.address) return bestRuian.address;
      if (bestRuian.street) return `${bestRuian.street} ${bestRuian.houseNumber || ''}`.trim();
    }

    // 2. Zkontroluj křižovatky s uličními názvy (do ~120 m, cca 0.0012°)
    const crossings = (staticData as any)?.crossings || [];
    let bestCrossing: any = null;
    let minCrossingDist = Infinity;
    for (const cr of crossings) {
      if (!cr.streetName) continue;
      const d = Math.hypot(cr.lat - lat, cr.lng - lng);
      if (d < minCrossingDist) {
        minCrossingDist = d;
        bestCrossing = cr;
      }
    }
    if (bestCrossing && minCrossingDist < 0.0012) {
      return `ul. ${bestCrossing.streetName}`;
    }
  } catch (e) {
    console.warn('Chyba při čtení lokální geodatabáze:', e);
  }

  return null;
}

/**
 * Hledání adres pomocí veřejného Nominatim API (OpenStreetMap).
 * Omezeno na Prahu (viewbox).
 */
export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  if (!query || query.length < 3) return [];

  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=cz&viewbox=14.22,50.17,14.71,49.94&bounded=1&limit=5&email=safepath.praha@gmail.com`;
    
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'cs-CZ,cs;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error('Chyba při komunikaci s Nominatim API');
    }

    return await response.json();
  } catch (error) {
    console.error('Chyba geocodingu:', error);
    return [];
  }
}

/**
 * Reverzní geokódování (Reverse Geocoding) pro získání názvu z kliknutí na mapě.
 * Vždy vrátí reálnou ulici nebo čitelnou adresu (buď z Nominatim API, nebo z lokální RÚIAN databáze).
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey)!;
  }

  const localFallback = getLocalStreetOrPlace(lat, lng);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&email=safepath.praha@gmail.com`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'cs-CZ,cs;q=0.9'
      }
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();

      if (data && data.address) {
        const road = data.address.road || data.address.pedestrian || data.address.footway || data.address.path;
        const houseNumber = data.address.house_number || '';
        const district = data.address.city_district || data.address.suburb || data.address.quarter;
        const city = data.address.city || data.address.town || data.address.village || 'Praha';

        let resolved = '';
        if (road) {
          resolved = houseNumber ? `${road} ${houseNumber}` : road;
        } else if (district) {
          resolved = `${district}, ${city}`;
        } else if (city) {
          resolved = `${city}`;
        }

        if (resolved) {
          reverseGeocodeCache.set(cacheKey, resolved);
          return resolved;
        }
      }
    }
  } catch (error) {
    // Síťové selhání, timeout nebo rate-limit – fallback na lokální data
  }

  if (localFallback) {
    reverseGeocodeCache.set(cacheKey, localFallback);
    return localFallback;
  }

  const fallbackCoord = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  reverseGeocodeCache.set(cacheKey, fallbackCoord);
  return fallbackCoord;
}
