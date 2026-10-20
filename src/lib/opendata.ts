export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface SafetyFeature {
  id: string;
  type: 'camera' | 'light' | 'haven';
  coords: [number, number]; // [lat, lng]
  radius: number;
  active_night: boolean;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  features: SafetyFeature[];
}

// In-memory cache pro simulaci
const cache: {
  data: FeatureCollection | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hodina

/**
 * Modul pro načítání, filtraci a normalizaci bezpečnostních dat (kamery, osvětlení) 
 * pro zadaný Bounding Box (např. Praha 2, 4, 10).
 */
export class OpenDataService {
  private cameraApiUrl = 'https://api.golemio.cz/v2/cameras'; // Příklad endpointu Golemio
  private lightApiUrl = 'https://api.golemio.cz/v2/street-lighting';

  constructor(private apiKey: string = 'DEMO_KEY') {}

  /**
   * Hlavní metoda pro získání normalizovaných dat pro mapu a graf
   */
  async getSafetyFeatures(bbox: BoundingBox): Promise<FeatureCollection> {
    // 1. Kontrola Cache
    const now = Date.now();
    if (cache.data && now - cache.timestamp < CACHE_TTL_MS) {
      return this.filterByBbox(cache.data, bbox);
    }

    try {
      // 2. Fetch reálných dat (v produkci by se volalo reálné API)
      const [rawCameras, rawLights] = await Promise.all([
        this.fetchMockData('camera'), 
        this.fetchMockData('light')
      ]);

      // 3. Normalizace do jednotného GeoJSON-like formátu
      const normalizedFeatures: SafetyFeature[] = [
        ...this.normalizeCameras(rawCameras),
        ...this.normalizeLights(rawLights)
      ];

      const collection: FeatureCollection = {
        type: 'FeatureCollection',
        features: normalizedFeatures
      };

      // 4. Uložení do Cache
      cache.data = collection;
      cache.timestamp = now;

      // 5. Filtrace podle Bounding Boxu
      return this.filterByBbox(collection, bbox);
    } catch (error) {
      console.error('Chyba při stahování OpenData:', error);
      throw new Error('Nepodařilo se načíst data z portálu Golemio.');
    }
  }

  private filterByBbox(collection: FeatureCollection, bbox: BoundingBox): FeatureCollection {
    const filtered = collection.features.filter(feature => {
      const [lat, lng] = feature.coords;
      return (
        lat >= bbox.minLat &&
        lat <= bbox.maxLat &&
        lng >= bbox.minLng &&
        lng <= bbox.maxLng
      );
    });

    return {
      type: 'FeatureCollection',
      features: filtered
    };
  }

  private normalizeCameras(rawData: any[]): SafetyFeature[] {
    return rawData.map(c => ({
      id: `cam_${c.id}`,
      type: 'camera',
      coords: [c.lat, c.lng],
      radius: 60, // Kamery mají typicky dosah rozpoznání tváře cca 60 metrů
      active_night: true
    }));
  }

  private normalizeLights(rawData: any[]): SafetyFeature[] {
    return rawData.map(l => ({
      id: `light_${l.id}`,
      type: 'light',
      coords: [l.lat, l.lng],
      radius: 25, // Dosah standardního lampového sloupu
      active_night: l.is_working === true
    }));
  }

  /**
   * Mock funkce nahrazující reálný fetch pro účely ukázky.
   */
  private async fetchMockData(type: 'camera' | 'light'): Promise<any[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (type === 'camera') {
          resolve([
            { id: 101, lat: 50.0755, lng: 14.4378 },
            { id: 102, lat: 50.0770, lng: 14.4420 }
          ]);
        } else {
          resolve([
            { id: 201, lat: 50.0785, lng: 14.4465, is_working: true },
            { id: 202, lat: 50.0810, lng: 14.4400, is_working: true }
          ]);
        }
      }, 300);
    });
  }
}

export interface SafeHavenFeature {
  id: number;
  lat: number;
  lng: number;
  type: 'police' | 'fire_station' | 'pharmacy' | 'fuel';
  name: string;
  is247: boolean;
  phone?: string;
}

import pragueSafetyCache from '../data/prague_safety_cache.json';

export async function fetchOSMSafeHavens(bbox: BoundingBox): Promise<SafeHavenFeature[]> {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="pharmacy"]["opening_hours"~"24/7"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
      node["amenity"="fuel"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
      node["amenity"="police"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
    );
    out body;
  `;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Overpass API error');
    const data = await response.json();
    
    return data.elements.map((el: any) => {
      let type: 'police' | 'pharmacy' | 'fuel' = 'police';
      let is247 = false;
      let name = el.tags.name || 'Neznámý záchytný bod';
      
      if (el.tags.amenity === 'pharmacy') {
        type = 'pharmacy';
        is247 = true;
        name = el.tags.name || 'Pohotovostní lékárna (24/7)';
      } else if (el.tags.amenity === 'fuel') {
        type = 'fuel';
        is247 = true;
        name = el.tags.name || 'Čerpací stanice';
      } else if (el.tags.amenity === 'police') {
        type = 'police';
        is247 = true;
        name = el.tags.name || 'Policejní služebna';
      }

      return {
        id: el.id,
        lat: el.lat,
        lng: el.lon, // Overpass uses lon
        type,
        name,
        is247,
        phone: el.tags.phone
      };
    });
  } catch (e) {
    console.warn('SafeHaven fetch selhal, používám statickou cache.', e);
    return pragueSafetyCache.sosHavens as SafeHavenFeature[];
  }
}

