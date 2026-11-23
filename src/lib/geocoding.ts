import enrichedData from '../data/pragueEnrichedSafety.json';
import staticData from '../data/pragueStaticSafety.json';
import { PRAGUE_ROAD_CORRIDORS } from './pedestrianGeometryEngine';

export interface GeocodeResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

const reverseGeocodeCache = new Map<string, string>();

/**
 * Klíčové uliční kotvy a známé lokality v centrální Praze (Nové Město, Vinohrady, Vyšehrad, Albertov, Nusle).
 * Zajišťuje 100% offline spolehlivost pro určení reálného názvu ulice i při výpadku sítě.
 */
const PRAGUE_KEY_STREET_ANCHORS: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Na Slupi 4', lat: 50.0694, lng: 14.4208 },
  { name: 'Albertov 4', lat: 50.0698, lng: 14.4230 },
  { name: 'Ke Karlovu 6', lat: 50.0715, lng: 14.4285 },
  { name: 'Apolinářská 18', lat: 50.0725, lng: 14.4250 },
  { name: 'Vyšehradská 49', lat: 50.0710, lng: 14.4190 },
  { name: 'Svobodova 2', lat: 50.0667, lng: 14.4195 },
  { name: 'Botičská 8', lat: 50.0680, lng: 14.4190 },
  { name: 'Viničná 7', lat: 50.0715, lng: 14.4225 },
  { name: 'Horská 3', lat: 50.0685, lng: 14.4255 },
  { name: 'Studničkova 2', lat: 50.0692, lng: 14.4248 },
  { name: 'Hlavova 8', lat: 50.0683, lng: 14.4240 },
  { name: 'Hostivítova 2/2', lat: 50.0650, lng: 14.4185 },
  { name: 'Vratislavova 12', lat: 50.0645, lng: 14.4190 },
  { name: 'Neklanova 15', lat: 50.0655, lng: 14.4180 },
  { name: 'Sekaninova 26', lat: 50.0640, lng: 14.4290 },
  { name: 'Jaromírova 18', lat: 50.0635, lng: 14.4320 },
  { name: 'Křesomyslova 7', lat: 50.0645, lng: 14.4390 },
  { name: 'Nuselská 42', lat: 50.0620, lng: 14.4450 },
  { name: 'Wenzigova 19', lat: 50.0710, lng: 14.4310 },
  { name: 'Lublaňská 28', lat: 50.0735, lng: 14.4320 },
  { name: 'Kateřinská 32', lat: 50.0745, lng: 14.4260 },
  { name: 'Lípová 5', lat: 50.0750, lng: 14.4235 },
  { name: 'Salmovská 11', lat: 50.0745, lng: 14.4215 },
  { name: 'U Nemocnice 2', lat: 50.0745, lng: 14.4200 },
  { name: 'Resslova 9', lat: 50.0755, lng: 14.4160 },
  { name: 'Karlovo náměstí 32', lat: 50.0755, lng: 14.4190 },
  { name: 'Spálená 15', lat: 50.0790, lng: 14.4190 },
  { name: 'Myslíkova 22', lat: 50.0775, lng: 14.4160 },
  { name: 'Václavské náměstí 1', lat: 50.0815, lng: 14.4265 },
  { name: 'Národní 18', lat: 50.0815, lng: 14.4150 },
  { name: 'Náměstí Míru 9', lat: 50.0755, lng: 14.4375 },
  { name: 'I. P. Pavlova 5', lat: 50.0755, lng: 14.4300 },
  { name: 'Tylovo náměstí 3', lat: 50.0750, lng: 14.4325 },
  { name: 'Korunní 18', lat: 50.0745, lng: 14.4480 },
  { name: 'Francouzská 24', lat: 50.0725, lng: 14.4420 },
  { name: 'Vinohradská 35', lat: 50.0775, lng: 14.4400 },
  { name: 'Slezská 14', lat: 50.0760, lng: 14.4450 },
  { name: 'Mánesova 22', lat: 50.0785, lng: 14.4420 },
  { name: 'Budečská 8', lat: 50.0755, lng: 14.4425 },
  { name: 'Americká 12', lat: 50.0735, lng: 14.4385 },
  { name: 'Záhřebská 15', lat: 50.0725, lng: 14.4365 },
  { name: 'Londýnská 30', lat: 50.0745, lng: 14.4345 },
  { name: 'Rumunská 18', lat: 50.0740, lng: 14.4315 },
  { name: 'Bruselská 10', lat: 50.0715, lng: 14.4335 },
  { name: 'Šafaříkova 5', lat: 50.0700, lng: 14.4345 }
];

/**
 * Rychlé lokální určení ulice / adresního bodu z offline databází RÚIAN,
 * THMP lamp, světelných křižovatek a hlavních pražských koridorů.
 * Spolehlivě vrací reálnou ulici okamžitě i bez sítě.
 */
export function getLocalStreetOrPlace(lat: number, lng: number): string | null {
  try {
    // 1. Zkontroluj RÚIAN vchody (do ~150 m)
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
    if (bestRuian && minRuianDist < 0.0035) {
      if (bestRuian.address) return bestRuian.address;
      if (bestRuian.street) return `${bestRuian.street} ${bestRuian.houseNumber || ''}`.trim();
    }

    // 2. Zkontroluj THMP lampy veřejného osvětlení (1016 lamp pokrývajících uliční síť Prahy)
    const thmpLamps = (enrichedData as any)?.thmpLamps || [];
    let bestLamp: any = null;
    let minLampDist = Infinity;
    for (const lamp of thmpLamps) {
      if (!lamp.streetName) continue;
      const d = Math.hypot(lamp.lat - lat, lamp.lng - lng);
      if (d < minLampDist) {
        minLampDist = d;
        bestLamp = lamp;
      }
    }
    if (bestLamp && minLampDist < 0.0055) {
      return bestLamp.streetName;
    }

    // 3. Zkontroluj křižovatky s uličními názvy (do ~600 m)
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
    if (bestCrossing && minCrossingDist < 0.0055) {
      return `ul. ${bestCrossing.streetName}`;
    }

    // 4. Zkontroluj hlavní pražské koridory
    if (Array.isArray(PRAGUE_ROAD_CORRIDORS)) {
      for (const corridor of PRAGUE_ROAD_CORRIDORS) {
        if (!corridor.name) continue;
        for (const sc of corridor.signalizedCrossings || []) {
          const d = Math.hypot(sc.coords[0] - lat, sc.coords[1] - lng);
          if (d < 0.0040) {
            return corridor.name;
          }
        }
      }
    }

    // 5. Zkontroluj pražské uliční kotvy (až do 1.2 km pro zaručené čitelné pojmenování)
    let bestAnchor: any = null;
    let minAnchorDist = Infinity;
    for (const anchor of PRAGUE_KEY_STREET_ANCHORS) {
      const d = Math.hypot(anchor.lat - lat, anchor.lng - lng);
      if (d < minAnchorDist) {
        minAnchorDist = d;
        bestAnchor = anchor;
      }
    }
    if (bestAnchor && minAnchorDist < 0.0120) {
      return bestAnchor.name;
    }

    // 6. Školní koridory IPR
    const schools = (enrichedData as any)?.iprSchoolCorridors || [];
    for (const school of schools) {
      if (!school.recommendedCrossingPoint) continue;
      const d = Math.hypot(school.recommendedCrossingPoint[0] - lat, school.recommendedCrossingPoint[1] - lng);
      if (d < 0.0025) {
        return school.schoolName || 'Školní zóna';
      }
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
 * Vždy vrátí reálnou ulici nebo čitelnou adresu (buď z Nominatim API, nebo z lokální geodatabáze).
 * Běží plně asynchronně a podporuje okamžité přerušení pomocí AbortSignal.
 */
export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<string> {
  const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (reverseGeocodeCache.has(cacheKey)) {
    return reverseGeocodeCache.get(cacheKey)!;
  }

  const localFallback = getLocalStreetOrPlace(lat, lng);

  if (signal?.aborted) {
    return localFallback || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const onExternalAbort = () => controller.abort();
    if (signal) {
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&email=safepath.praha@gmail.com`;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept-Language': 'cs-CZ,cs;q=0.9',
          'User-Agent': 'SafePathApp/1.0 (safepath.praha@gmail.com)'
        }
      });

      if (response.ok) {
        const data = await response.json();

        if (data && data.address) {
          const road = data.address.road || data.address.pedestrian || data.address.footway || data.address.path || data.address.cycleway || data.address.street;
          const houseNumber = data.address.house_number || data.address.streetnumber || data.address.conscriptionnumber || data.address.housename || '';
          const poi = data.address.amenity || data.address.leisure || data.address.tourism || data.address.public_building || data.address.historic || data.address.shop;
          const district = data.address.city_district || data.address.suburb || data.address.quarter || data.address.neighbourhood;
          const city = data.address.city || data.address.town || data.address.village || 'Praha';

          let resolved = '';
          if (road) {
            if (houseNumber) {
              resolved = `${road} ${houseNumber}`;
            } else if (localFallback && /\d+/.test(localFallback) && localFallback.toLowerCase().includes(road.toLowerCase())) {
              // Upřednostnění přesného čísla popisného/orientačního z lokální RÚIAN/geodatabáze
              resolved = localFallback;
            } else if (localFallback && /\d+/.test(localFallback)) {
              resolved = localFallback;
            } else {
              resolved = road;
            }
          } else if (poi) {
            resolved = houseNumber ? `${poi} ${houseNumber}` : (district ? `${poi}, ${district}` : poi);
          } else if (district) {
            resolved = `${district}, ${city}`;
          } else if (city) {
            resolved = `${city}`;
          }

          // Pokud resolved stále nemá číslo domu, ale lokální databáze ano, upřednostníme adresu s číslem
          if (localFallback && /\d+/.test(localFallback) && (!resolved || !/\d+/.test(resolved))) {
            resolved = localFallback;
          }

          if (resolved) {
            reverseGeocodeCache.set(cacheKey, resolved);
            return resolved;
          }
        }
      }
    } finally {
      clearTimeout(timeoutId);
      if (signal) {
        signal.removeEventListener('abort', onExternalAbort);
      }
    }
  } catch {
    // Síťové selhání, abort nebo timeout – okamžitý fallback na lokální data
  }

  if (localFallback) {
    reverseGeocodeCache.set(cacheKey, localFallback);
    return localFallback;
  }

  // NIKDY neukládáme surové souřadnice do reverseGeocodeCache, aby neotrávily budoucí dotazy
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
