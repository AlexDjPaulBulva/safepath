import RBush from 'rbush';
import * as turf from '@turf/turf';
import { getDistance } from './safety-engine';
import pragueStaticSafety from '../data/pragueStaticSafety.json';

export type CrossingCategory = 'priority' | 'standard';

export interface PedestrianCrossing {
  id: string | number;
  lat: number;
  lng: number;
  category: CrossingCategory;
  crossingType: 'traffic_signals' | 'zebra' | 'uncontrolled' | 'island' | 'marked' | 'other';
  hasSignals: boolean;
  hasZebra: boolean;
  streetName?: string;
  tags?: Record<string, string>;
}

export interface CrossingSpatialItem {
  minX: number; // lng
  minY: number; // lat
  maxX: number; // lng
  maxY: number; // lat
  crossing: PedestrianCrossing;
}

export interface CrossingBBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/**
 * Prostorový R-Tree index (RBush) pro vyhledávání nejbližších přechodů v řádu mikrosekund.
 */
export class CrossingSpatialIndex {
  private tree: RBush<CrossingSpatialItem>;
  private itemsById: Map<string | number, PedestrianCrossing> = new Map();

  constructor() {
    this.tree = new RBush<CrossingSpatialItem>();
  }

  public insert(crossing: PedestrianCrossing): void {
    if (this.itemsById.has(crossing.id)) return;
    this.itemsById.set(crossing.id, crossing);
    this.tree.insert({
      minX: crossing.lng,
      minY: crossing.lat,
      maxX: crossing.lng,
      maxY: crossing.lat,
      crossing
    });
  }

  public load(crossings: PedestrianCrossing[]): void {
    const toInsert: CrossingSpatialItem[] = [];
    for (const c of crossings) {
      if (!this.itemsById.has(c.id)) {
        this.itemsById.set(c.id, c);
        toInsert.push({
          minX: c.lng,
          minY: c.lat,
          maxX: c.lng,
          maxY: c.lat,
          crossing: c
        });
      }
    }
    if (toInsert.length > 0) {
      this.tree.load(toInsert);
    }
  }

  /**
   * Vyhledá nejbližší přechod v zadaném okruhu v metrech.
   * Preferuje prioritní přechody (světelná signalizace nebo zebra).
   */
  public findNearest(
    lat: number,
    lng: number,
    maxRadiusMeters: number = 35,
    prioritizeSignalOrZebra: boolean = true
  ): { crossing: PedestrianCrossing; distanceMeters: number } | null {
    // V Praze (~50°N): 1° lat ~ 111 320 m, 1° lng ~ 71 500 m
    const deltaLat = (maxRadiusMeters * 1.25) / 111320;
    const deltaLng = (maxRadiusMeters * 1.25) / (111320 * Math.cos((lat * Math.PI) / 180));

    const candidates = this.tree.search({
      minX: lng - deltaLng,
      minY: lat - deltaLat,
      maxX: lng + deltaLng,
      maxY: lat + deltaLat
    });

    if (candidates.length === 0) return null;

    let bestPriority: { crossing: PedestrianCrossing; distanceMeters: number } | null = null;
    let bestStandard: { crossing: PedestrianCrossing; distanceMeters: number } | null = null;

    for (const item of candidates) {
      const c = item.crossing;
      const dist = getDistance(lat, lng, c.lat, c.lng);
      if (dist > maxRadiusMeters) continue;

      if (c.category === 'priority') {
        if (!bestPriority || dist < bestPriority.distanceMeters) {
          bestPriority = { crossing: c, distanceMeters: dist };
        }
      } else {
        if (!bestStandard || dist < bestStandard.distanceMeters) {
          bestStandard = { crossing: c, distanceMeters: dist };
        }
      }
    }

    if (prioritizeSignalOrZebra && bestPriority) {
      return bestPriority;
    }
    return bestPriority || bestStandard;
  }

  /**
   * Vyhledá všechny přechody v okruhu r metrů.
   */
  public searchInRadius(lat: number, lng: number, radiusMeters: number): { crossing: PedestrianCrossing; distanceMeters: number }[] {
    const deltaLat = (radiusMeters * 1.25) / 111320;
    const deltaLng = (radiusMeters * 1.25) / (111320 * Math.cos((lat * Math.PI) / 180));

    const candidates = this.tree.search({
      minX: lng - deltaLng,
      minY: lat - deltaLat,
      maxX: lng + deltaLng,
      maxY: lat + deltaLat
    });

    const results: { crossing: PedestrianCrossing; distanceMeters: number }[] = [];
    for (const item of candidates) {
      const dist = getDistance(lat, lng, item.crossing.lat, item.crossing.lng);
      if (dist <= radiusMeters) {
        results.push({ crossing: item.crossing, distanceMeters: dist });
      }
    }
    return results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  /**
   * Vyhledá všechny přechody uvnitř Bounding Boxu.
   */
  public searchInBBox(bbox: CrossingBBox): PedestrianCrossing[] {
    const items = this.tree.search({
      minX: bbox.west,
      minY: bbox.south,
      maxX: bbox.east,
      maxY: bbox.north
    });
    return items.map(i => i.crossing);
  }

  /**
   * Vyhledá všechny chráněné přechody podél celé trajektorie trasy (v koridoru do corridorRadiusMeters, typicky 22 m).
   * Zajišťuje, že se započítají jak přechody na křižovatkách, tak přechody překonávané v přímém směru.
   */
  public searchCrossingsAlongRoute(
    routeCoords: [number, number][],
    corridorRadiusMeters: number = 22
  ): PedestrianCrossing[] {
    if (!routeCoords || routeCoords.length < 2) return [];

    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    for (const [lat, lng] of routeCoords) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }

    const marginLat = (corridorRadiusMeters * 2) / 111320;
    const marginLng = (corridorRadiusMeters * 2) / (111320 * Math.cos((minLat * Math.PI) / 180));

    const candidates = this.tree.search({
      minX: minLng - marginLng,
      minY: minLat - marginLat,
      maxX: maxLng + marginLng,
      maxY: maxLat + marginLat
    });

    if (candidates.length === 0) return [];

    const turfCoords = routeCoords.map(([lat, lng]) => [lng, lat]);
    const routeLine = turf.lineString(turfCoords);

    const traversed: PedestrianCrossing[] = [];
    const seenIds = new Set<string | number>();

    for (const item of candidates) {
      const c = item.crossing;
      if (seenIds.has(c.id)) continue;

      const pt = turf.point([c.lng, c.lat]);
      const dist = turf.pointToLineDistance(pt, routeLine, { units: 'meters' });

      if (dist <= corridorRadiusMeters) {
        seenIds.add(c.id);
        traversed.push(c);
      }
    }

    return traversed;
  }

  public size(): number {
    return this.itemsById.size;
  }

  public getAll(): PedestrianCrossing[] {
    return Array.from(this.itemsById.values());
  }

  public clear(): void {
    this.tree.clear();
    this.itemsById.clear();
  }
}

/**
 * Robustní dataset přechodů pro centrální a širší Prahu (Vinohradská, Ječná, Sokolská,
 * Legerova, Žitná, Karlovo náměstí, Národní, I.P. Pavlova, Náměstí Míru, Florenc, Anděl atd.)
 * Zajišťuje okamžité vyhledávání i při výpadku nebo zpoždění sítě Overpass API.
 */
export const PRAGUE_SEED_CROSSINGS: PedestrianCrossing[] = [
  // --- I.P. PAVLOVA / JEČNÁ / SOKOLSKÁ / LEGEROVA ---
  {
    id: 'prg-cross-ipp-1',
    lat: 50.07542,
    lng: 14.43005,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Ječná x Sokolská (I.P. Pavlova východ)'
  },
  {
    id: 'prg-cross-ipp-2',
    lat: 50.07505,
    lng: 14.42978,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Sokolská (I.P. Pavlova jih)'
  },
  {
    id: 'prg-cross-ipp-3',
    lat: 50.07565,
    lng: 14.42965,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Ječná x Legerova (I.P. Pavlova sever)'
  },
  {
    id: 'prg-cross-ipp-4',
    lat: 50.07520,
    lng: 14.43120,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Legerova (I.P. Pavlova stanice metra)'
  },
  {
    id: 'prg-cross-tyl-1',
    lat: 50.07450,
    lng: 14.43230,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Tylovo náměstí x Bělehradská'
  },

  // --- KARLOVO NÁMĚSTÍ / JEČNÁ / RESSLOVA / ŽITNÁ ---
  {
    id: 'prg-cross-karlak-1',
    lat: 50.07625,
    lng: 14.42195,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Karlovo náměstí x Ječná'
  },
  {
    id: 'prg-cross-karlak-2',
    lat: 50.07580,
    lng: 14.41785,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Resslova x Karlovo náměstí'
  },
  {
    id: 'prg-cross-karlak-3',
    lat: 50.07650,
    lng: 14.41950,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Karlovo náměstí (středový park)'
  },
  {
    id: 'prg-cross-karlak-4',
    lat: 50.07765,
    lng: 14.42110,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Žitná x Karlovo náměstí'
  },
  {
    id: 'prg-cross-karlak-5',
    lat: 50.07720,
    lng: 14.42020,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Odborů x Myslíkova'
  },
  {
    id: 'prg-cross-stepanska-jecna',
    lat: 50.07585,
    lng: 14.42540,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Ječná x Štěpánská'
  },
  {
    id: 'prg-cross-tunich-jecna',
    lat: 50.07560,
    lng: 14.42760,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Ječná x V Tůních'
  },
  {
    id: 'prg-cross-karlovu-jecna',
    lat: 50.07550,
    lng: 14.42860,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Ječná x Ke Karlovu'
  },

  // --- SOKOLSKÁ & LEGEROVA (Severojižní magistrála) ---
  {
    id: 'prg-cross-zitna-sokolska',
    lat: 50.07780,
    lng: 14.42925,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Žitná x Sokolská'
  },
  {
    id: 'prg-cross-zitna-legerova',
    lat: 50.07800,
    lng: 14.43080,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Žitná x Legerova'
  },
  {
    id: 'prg-cross-rumunska-sokolska',
    lat: 50.07350,
    lng: 14.43020,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Rumunská x Sokolská'
  },
  {
    id: 'prg-cross-rumunska-legerova',
    lat: 50.07365,
    lng: 14.43140,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Rumunská x Legerova'
  },
  {
    id: 'prg-cross-wenzigova-sokolska',
    lat: 50.07080,
    lng: 14.43050,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Wenzigova x Sokolská'
  },
  {
    id: 'prg-cross-wenzigova-legerova',
    lat: 50.07100,
    lng: 14.43200,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Wenzigova x Legerova'
  },

  // --- VINOHRADSKÁ KORIDOR ---
  {
    id: 'prg-cross-vino-muzeum',
    lat: 50.07925,
    lng: 14.43220,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Vinohradská x Legerova (Muzeum)'
  },
  {
    id: 'prg-cross-vino-spanelska',
    lat: 50.07905,
    lng: 14.43380,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Vinohradská x Španělská'
  },
  {
    id: 'prg-cross-vino-skretova',
    lat: 50.07885,
    lng: 14.43510,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Vinohradská x Škrétova'
  },
  {
    id: 'prg-cross-vino-italska',
    lat: 50.07845,
    lng: 14.43725,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Vinohradská x Italská'
  },
  {
    id: 'prg-cross-vino-anny-letenske',
    lat: 50.07815,
    lng: 14.44105,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Vinohradská x Anny Letenské'
  },
  {
    id: 'prg-cross-vino-budecska',
    lat: 50.07802,
    lng: 14.44215,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Vinohradská x Budečská'
  },
  {
    id: 'prg-cross-vino-blanicka',
    lat: 50.07780,
    lng: 14.44520,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Vinohradská x Blanická'
  },
  {
    id: 'prg-cross-vino-sazavska',
    lat: 50.07765,
    lng: 14.44750,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Vinohradská x Sázavská'
  },
  {
    id: 'prg-cross-vino-jzp',
    lat: 50.07750,
    lng: 14.45025,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Vinohradská x Náměstí Jiřího z Poděbrad'
  },
  {
    id: 'prg-cross-vino-perunova',
    lat: 50.07730,
    lng: 14.45280,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Vinohradská x Perunova'
  },
  {
    id: 'prg-cross-vino-radhostska',
    lat: 50.07715,
    lng: 14.45455,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Vinohradská x Radhošťská'
  },
  {
    id: 'prg-cross-vino-baranova',
    lat: 50.07670,
    lng: 14.45805,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Vinohradská x Baranova'
  },
  {
    id: 'prg-cross-vino-flora',
    lat: 50.07635,
    lng: 14.46145,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Vinohradská x Jičínská (Flora)'
  },
  {
    id: 'prg-cross-vino-olsany',
    lat: 50.07580,
    lng: 14.46650,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Vinohradská (Olšanské hřbitovy)'
  },
  {
    id: 'prg-cross-vino-zelivskeho',
    lat: 50.07510,
    lng: 14.47480,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Vinohradská x Želivského'
  },

  // --- NÁMĚSTÍ MÍRU / FRANCOUZSKÁ / KORUNNÍ ---
  {
    id: 'prg-cross-nam-miru-zapad',
    lat: 50.07560,
    lng: 14.43720,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Náměstí Míru západ / Rumunská'
  },
  {
    id: 'prg-cross-nam-miru-jih',
    lat: 50.07520,
    lng: 14.43850,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Náměstí Míru jih'
  },
  {
    id: 'prg-cross-nam-miru-francouzska',
    lat: 50.07580,
    lng: 14.43980,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Francouzská x Náměstí Míru'
  },
  {
    id: 'prg-cross-anglicka-miru',
    lat: 50.07620,
    lng: 14.43780,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Anglická x Náměstí Míru'
  },
  {
    id: 'prg-cross-korunni-zatek',
    lat: 50.07610,
    lng: 14.44100,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Korunní začátek'
  },
  {
    id: 'prg-cross-korunni-budecska',
    lat: 50.07590,
    lng: 14.44420,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Korunní x Budečská'
  },
  {
    id: 'prg-cross-korunni-sumavska',
    lat: 50.07560,
    lng: 14.44980,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Korunní x Šumavská'
  },

  // --- NÁRODNÍ TŘÍDA / SPÁLENÁ / JUNGMANNOVA ---
  {
    id: 'prg-cross-narodni-divadlo',
    lat: 50.08185,
    lng: 14.41320,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Národní divadlo / Smetanovo nábřeží'
  },
  {
    id: 'prg-cross-narodni-karoliny-svetle',
    lat: 50.08200,
    lng: 14.41550,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Národní x Karolíny Světlé'
  },
  {
    id: 'prg-cross-narodni-spalena',
    lat: 50.08225,
    lng: 14.41850,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Národní x Spálená'
  },
  {
    id: 'prg-cross-narodni-jungmannova',
    lat: 50.08260,
    lng: 14.42220,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Národní x Jungmannova'
  },
  {
    id: 'prg-cross-jungmannak',
    lat: 50.08320,
    lng: 14.42350,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Jungmannovo náměstí'
  },

  // --- VÁCLAVSKÉ NÁMĚSTÍ / VODIČKOVA / JINDŘIŠSKÁ ---
  {
    id: 'prg-cross-mustek',
    lat: 50.08420,
    lng: 14.42450,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Můstek / Na Příkopě'
  },
  {
    id: 'prg-cross-vodickova-jindrisska',
    lat: 50.08280,
    lng: 14.42650,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Vodičkova x Jindřišská'
  },
  {
    id: 'prg-cross-stepanska-vaclavak',
    lat: 50.08150,
    lng: 14.42850,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Štěpánská x Václavské náměstí'
  },
  {
    id: 'prg-cross-muzeum-horni-vaclavak',
    lat: 50.08010,
    lng: 14.43000,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Muzeum / Horní Václavské náměstí'
  },

  // --- FLORENC & KARLÍN (KŘIŽÍKOVA) ---
  {
    id: 'prg-cross-florenc-1',
    lat: 50.09020,
    lng: 14.43850,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Křižíkova x Ke Štvanici (Florenc)'
  },
  {
    id: 'prg-cross-florenc-prvniho-pluku',
    lat: 50.09100,
    lng: 14.44200,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Křižíkova x Prvního pluku'
  },
  {
    id: 'prg-cross-karlin-namesti',
    lat: 50.09180,
    lng: 14.44650,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Křižíkova x Karlínské náměstí'
  },
  {
    id: 'prg-cross-karlin-thamova',
    lat: 50.09350,
    lng: 14.45520,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Křižíkova x Thámova (Křižíkova metro)'
  },

  // --- ANDĚL & SMÍCHOV ---
  {
    id: 'prg-cross-andel-krizovatka',
    lat: 50.07150,
    lng: 14.40420,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Plzeňská x Nádražní (Anděl)'
  },
  {
    id: 'prg-cross-andel-stefanikova',
    lat: 50.07220,
    lng: 14.40380,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Plzeňská x Štefánikova'
  },
  {
    id: 'prg-cross-smichov-bozdechova',
    lat: 50.06850,
    lng: 14.40550,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Nádražní x Bozděchova'
  },
  {
    id: 'prg-cross-smichov-valentince',
    lat: 50.06550,
    lng: 14.40680,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Nádražní x Na Valentince'
  },

  // --- LETNÁ & HOLEŠOVICE ---
  {
    id: 'prg-cross-letna-korunovacni',
    lat: 50.09880,
    lng: 14.42150,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Milady Horákové x Korunovační'
  },
  {
    id: 'prg-cross-letna-namesti',
    lat: 50.09920,
    lng: 14.42780,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Milady Horákové x Letenské náměstí'
  },
  {
    id: 'prg-cross-veletrzni-dukelskych',
    lat: 50.10050,
    lng: 14.43320,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Veletržní x Dukelských hrdinů'
  },
  {
    id: 'prg-cross-strossmayerovo-nam',
    lat: 50.10180,
    lng: 14.43550,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Strossmayerovo náměstí'
  },

  // --- ZÁHŘEBSKÁ, AMERICKÁ, BĚLEHRADSKÁ (VINOHRADY) ---
  {
    id: 'prg-cross-zahrebska-americka',
    lat: 50.07350,
    lng: 14.43820,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Záhřebská x Americká (kruhový objezd)'
  },
  {
    id: 'prg-cross-zahrebska-francouzska',
    lat: 50.07500,
    lng: 14.43950,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Záhřebská x Francouzská / Blanická'
  },
  {
    id: 'prg-cross-zahrebska-masarykova',
    lat: 50.07220,
    lng: 14.43980,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Záhřebská x Jana Masaryka'
  },
  {
    id: 'prg-cross-zahrebska-bruselska',
    lat: 50.07250,
    lng: 14.43550,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Záhřebská x Bruselská'
  },
  {
    id: 'prg-cross-americka-francouzska',
    lat: 50.07580,
    lng: 14.43780,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Americká x Francouzská'
  },
  {
    id: 'prg-cross-americka-machova',
    lat: 50.07200,
    lng: 14.43850,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Americká x Máchova'
  },
  {
    id: 'prg-cross-americka-grebovka',
    lat: 50.07100,
    lng: 14.43900,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Americká x U Havlíčkových sadů'
  },
  {
    id: 'prg-cross-belehradska-ipp',
    lat: 50.07540,
    lng: 14.43000,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Bělehradská x Jugoslávská (I.P. Pavlova / tram)'
  },
  {
    id: 'prg-cross-belehradska-tylak',
    lat: 50.07450,
    lng: 14.43180,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Bělehradská x Tylovo náměstí (tram)'
  },
  {
    id: 'prg-cross-belehradska-rumunska',
    lat: 50.07350,
    lng: 14.43250,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Bělehradská x Rumunská (tram)'
  },
  {
    id: 'prg-cross-belehradska-bruselska',
    lat: 50.07280,
    lng: 14.43320,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Bělehradská x Bruselská (tram)'
  },
  {
    id: 'prg-cross-belehradska-safarikova',
    lat: 50.07050,
    lng: 14.43480,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Bělehradská x Šafaříkova (tram)'
  },
  {
    id: 'prg-cross-belehradska-otakarova',
    lat: 50.06580,
    lng: 14.43850,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Bělehradská x Otakarova (Nádraží Vršovice / tram)'
  },
  {
    id: 'prg-cross-londynska-anglicka',
    lat: 50.07680,
    lng: 14.43450,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Londýnská x Anglická'
  },
  {
    id: 'prg-cross-londynska-jugoslavska',
    lat: 50.07550,
    lng: 14.43520,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Londýnská x Jugoslávská'
  },
  {
    id: 'prg-cross-londynska-rumunska',
    lat: 50.07420,
    lng: 14.43580,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Londýnská x Rumunská'
  },
  {
    id: 'prg-cross-londynska-bruselska',
    lat: 50.07300,
    lng: 14.43620,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Londýnská x Bruselská'
  },
  {
    id: 'prg-cross-masaryka-francouzska',
    lat: 50.07420,
    lng: 14.44350,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Jana Masaryka x Francouzská'
  },
  {
    id: 'prg-cross-masaryka-machova',
    lat: 50.07280,
    lng: 14.44380,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Jana Masaryka x Máchova'
  },
  {
    id: 'prg-cross-lublanska-tylak',
    lat: 50.07480,
    lng: 14.43080,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Lublaňská x Tylovo náměstí'
  },
  {
    id: 'prg-cross-lublanska-wenzigova',
    lat: 50.07120,
    lng: 14.43120,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Lublaňská x Wenzigova'
  },
  {
    id: 'prg-cross-anglicka-ital',
    lat: 50.07720,
    lng: 14.43400,
    category: 'priority',
    crossingType: 'traffic_signals',
    hasSignals: true,
    hasZebra: true,
    streetName: 'Anglická x Italská'
  },
  {
    id: 'prg-cross-korunni-perunova',
    lat: 50.07540,
    lng: 14.45300,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Korunní x Perunova'
  },
  {
    id: 'prg-cross-blanicka-slezska',
    lat: 50.07680,
    lng: 14.44480,
    category: 'priority',
    crossingType: 'zebra',
    hasSignals: false,
    hasZebra: true,
    streetName: 'Blanická x Slezská'
  }
];

// Globální singleton prostorového indexu naplněný prioritně z lokálního bundle JSONu
const globalCrossingIndex = new CrossingSpatialIndex();
const staticCrossings = (pragueStaticSafety.crossings || []) as PedestrianCrossing[];
globalCrossingIndex.load([...staticCrossings, ...PRAGUE_SEED_CROSSINGS]);

export function getGlobalCrossingIndex(): CrossingSpatialIndex {
  return globalCrossingIndex;
}

/**
 * Parsuje OSM prvky z Overpass API a kategorizuje je.
 * PRIORITNÍ: crossing=traffic_signals nebo crossing=zebra (vyznačená zebra).
 * BĚŽNÉ / NECHRÁNĚNÉ: ostatní uzly.
 */
export function parseOverpassCrossingElement(element: any): PedestrianCrossing | null {
  if (!element || element.type !== 'node' || !element.lat || !element.lng) return null;
  const tags: Record<string, string> = element.tags || {};

  const crossingTag = (tags['crossing'] || '').toLowerCase();
  const highwayTag = (tags['highway'] || '').toLowerCase();
  const signalsTag = (tags['traffic_signals'] || tags['crossing:signals'] || '').toLowerCase();
  const markingsTag = (tags['crossing:markings'] || '').toLowerCase();

  const hasSignals =
    crossingTag === 'traffic_signals' ||
    highwayTag === 'traffic_signals' ||
    signalsTag === 'yes' ||
    signalsTag === 'traffic_signals';

  const hasZebra =
    crossingTag === 'zebra' ||
    crossingTag === 'marked' ||
    markingsTag === 'zebra' ||
    markingsTag === 'yes';

  let category: CrossingCategory = 'standard';
  let crossingType: PedestrianCrossing['crossingType'] = 'uncontrolled';

  if (hasSignals) {
    category = 'priority';
    crossingType = 'traffic_signals';
  } else if (hasZebra) {
    category = 'priority';
    crossingType = 'zebra';
  } else if (crossingTag === 'island' || tags['crossing:island'] === 'yes') {
    crossingType = 'island';
  }

  return {
    id: element.id,
    lat: element.lat,
    lng: element.lng,
    category,
    crossingType,
    hasSignals,
    hasZebra,
    streetName: tags['name'] || tags['description'],
    tags
  };
}

// Paměťová cache stažených bounding boxů pro zabránění opakovaným dotazům
const fetchedBBoxes = new Set<string>();

/**
 * 1. Prioritní načtení přechodů z lokálního bundle JSONu:
 * - Okamžitě vrací přednaplněný lokální index bez čekání na síťový požadavek.
 * - Overpass API se volá pouze volitelně jako doplňkový background fetch na pozadí,
 *   ale NIKDY na něm nenechá viset vykreslení mapy ani výpočet trasy.
 * - Pokud síť selže nebo vrátí 429, aplikace běží 100% z lokálního souboru.
 */
export async function fetchAndIndexCrossings(
  bbox: CrossingBBox,
  index: CrossingSpatialIndex = globalCrossingIndex
): Promise<PedestrianCrossing[]> {
  const bboxKey = `${bbox.south.toFixed(3)},${bbox.west.toFixed(3)},${bbox.north.toFixed(3)},${bbox.east.toFixed(3)}`;

  // Okamžitý lokální výsledek z přednaplněného prostorového indexu
  const localResult = index.searchInBBox(bbox);

  // Volitelný doplňkový background fetch z Overpass API na pozadí (fire-and-forget)
  if (!fetchedBBoxes.has(bboxKey)) {
    fetchedBBoxes.add(bboxKey);

    (async () => {
      const query = `[out:json][timeout:6];(
        node["highway"="crossing"](${bbox.south.toFixed(5)},${bbox.west.toFixed(5)},${bbox.north.toFixed(5)},${bbox.east.toFixed(5)});
        node["crossing"](${bbox.south.toFixed(5)},${bbox.west.toFixed(5)},${bbox.north.toFixed(5)},${bbox.east.toFixed(5)});
      );out body;`;

      const endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter'
      ];

      for (const ep of endpoints) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(`${ep}?data=${encodeURIComponent(query)}`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' }
          });
          clearTimeout(timer);

          if (res.status === 429) {
            console.warn('Overpass API vrátilo 429 (Rate Limit). Běžím 100% z lokálního souboru.');
            break;
          }
          if (!res.ok) continue;

          const text = await res.text();
          if (!text.startsWith('{')) continue;

          const data = JSON.parse(text);
          if (Array.isArray(data.elements)) {
            const parsed: PedestrianCrossing[] = [];
            for (const el of data.elements) {
              const item = parseOverpassCrossingElement(el);
              if (item) {
                parsed.push(item);
              }
            }
            if (parsed.length > 0) {
              index.load(parsed);
            }
            break;
          }
        } catch {
          // Ignorovat síťové výpadky
        }
      }
    })().catch(() => {});
  }

  // Okamžitě vrátit lokální data bez čekání na Overpass
  return localResult;
}
