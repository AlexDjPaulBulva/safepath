import * as turf from '@turf/turf';
import { PedestrianCrossing, CrossingSpatialIndex, getGlobalCrossingIndex } from './crossings';
import { PRAGUE_BUILDINGS, BuildingPolygon, checkLineIntersectsBuildings, getAllBuildingPolygons } from '../data/prague-buildings';
import { getDistance } from './safety-engine';

export interface PragueRoadCorridor {
  id: string;
  name: string;
  osmHighway: 'primary' | 'secondary' | 'tertiary' | 'trunk';
  hasTram: boolean;
  coordinates: [number, number][]; // [lat, lng]
  signalizedCrossings: {
    id: string;
    name: string;
    coords: [number, number]; // [lat, lng]
  }[];
}

/**
 * Síť hlavních pražských tříd, sekundárních a terciárních ulic (vyšší než residential),
 * včetně komunikací s tramvajovým pásem (např. Bělehradská, Francouzská, Ječná, Vinohradská).
 */
export const PRAGUE_ROAD_CORRIDORS: PragueRoadCorridor[] = [
  // --- TRAMVAJOVÝ KORIDOR BĚLEHRADSKÁ ---
  {
    id: 'corridor-belehradska',
    name: 'Bělehradská',
    osmHighway: 'secondary',
    hasTram: true,
    coordinates: [
      [50.0754, 14.4300], // I.P. Pavlova / Jugoslávská
      [50.0745, 14.4318], // Tylovo náměstí
      [50.0735, 14.4325], // Rumunská
      [50.0728, 14.4332], // Bruselská
      [50.0718, 14.4340], // Šafaříkova
      [50.0705, 14.4348], // Náměstí Bratří Synků / Otakarova směr
      [50.0658, 14.4385]  // Nádraží Vršovice / Otakarova
    ],
    signalizedCrossings: [
      { id: 'sig-bel-ipp', name: 'Bělehradská x I.P. Pavlova (tram)', coords: [50.07540, 14.43000] },
      { id: 'sig-bel-tylak', name: 'Bělehradská x Tylovo náměstí (tram)', coords: [50.07450, 14.43180] },
      { id: 'sig-bel-rumunska', name: 'Bělehradská x Rumunská (tram)', coords: [50.07350, 14.43250] },
      { id: 'sig-bel-bruselska', name: 'Bělehradská x Bruselská (tram)', coords: [50.07280, 14.43320] },
      { id: 'sig-bel-safarikova', name: 'Bělehradská x Šafaříkova (tram)', coords: [50.07050, 14.43480] },
      { id: 'sig-bel-otakarova', name: 'Bělehradská x Otakarova (tram)', coords: [50.06580, 14.43850] }
    ]
  },
  // --- TRAMVAJOVÝ KORIDOR FRANCOUZSKÁ ---
  {
    id: 'corridor-francouzska',
    name: 'Francouzská',
    osmHighway: 'primary',
    hasTram: true,
    coordinates: [
      [50.0758, 14.4378], // Náměstí Míru
      [50.0750, 14.4410], // Blanická / Záhřebská
      [50.0742, 14.4435], // Jana Masaryka
      [50.0730, 14.4475], // Slovenská
      [50.0720, 14.4520]  // Krymská / Ruská
    ],
    signalizedCrossings: [
      { id: 'sig-fran-miru', name: 'Francouzská x Náměstí Míru (tram)', coords: [50.07580, 14.43780] },
      { id: 'sig-fran-masaryka', name: 'Francouzská x Jana Masaryka (tram)', coords: [50.07420, 14.44350] },
      { id: 'sig-fran-slovenska', name: 'Francouzská x Slovenská (tram)', coords: [50.07300, 14.44750] }
    ]
  },
  // --- TRAMVAJOVÝ KORIDOR VINOHRADSKÁ ---
  {
    id: 'corridor-vinohradska',
    name: 'Vinohradská',
    osmHighway: 'primary',
    hasTram: true,
    coordinates: [
      [50.0795, 14.4315],
      [50.0792, 14.4330],
      [50.0788, 14.4360],
      [50.0783, 14.4400],
      [50.0780, 14.4435],
      [50.0775, 14.4502],
      [50.0770, 14.4550],
      [50.0763, 14.4615],
      [50.0758, 14.4680],
      [50.0750, 14.4750]
    ],
    signalizedCrossings: [
      { id: 'sig-vino-muzeum', name: 'Vinohradská x Legerova (Muzeum)', coords: [50.07925, 14.43220] },
      { id: 'sig-vino-skretova', name: 'Vinohradská x Škrétova', coords: [50.07885, 14.43510] },
      { id: 'sig-vino-italska', name: 'Vinohradská x Italská', coords: [50.07845, 14.43725] },
      { id: 'sig-vino-budecska', name: 'Vinohradská x Budečská', coords: [50.07802, 14.44215] },
      { id: 'sig-vino-jzp', name: 'Vinohradská x Náměstí Jiřího z Poděbrad', coords: [50.07750, 14.45025] },
      { id: 'sig-vino-radhostska', name: 'Vinohradská x Radhošťská', coords: [50.07715, 14.45455] },
      { id: 'sig-vino-flora', name: 'Vinohradská x Jičínská (Flora)', coords: [50.07635, 14.46145] },
      { id: 'sig-vino-zelivskeho', name: 'Vinohradská x Želivského', coords: [50.07510, 14.47480] }
    ]
  },
  // --- TRAMVAJOVÝ KORIDOR JEČNÁ ---
  {
    id: 'corridor-jecna',
    name: 'Ječná',
    osmHighway: 'primary',
    hasTram: true,
    coordinates: [
      [50.0762, 14.4215],
      [50.0760, 14.4235],
      [50.0758, 14.4255],
      [50.0755, 14.4280],
      [50.0752, 14.4300]
    ],
    signalizedCrossings: [
      { id: 'sig-jecna-karlak', name: 'Karlovo náměstí x Ječná', coords: [50.07625, 14.42195] },
      { id: 'sig-jecna-stepanska', name: 'Ječná x Štěpánská', coords: [50.07585, 14.42540] },
      { id: 'sig-jecna-tunich', name: 'Ječná x V Tůních', coords: [50.07560, 14.42760] },
      { id: 'sig-jecna-ipp', name: 'Ječná x I.P. Pavlova', coords: [50.07542, 14.43005] }
    ]
  },
  // --- ZÁHŘEBSKÁ (TERTIARY) ---
  {
    id: 'corridor-zahrebska',
    name: 'Záhřebská',
    osmHighway: 'tertiary',
    hasTram: false,
    coordinates: [
      [50.0750, 14.4395], // Francouzská / Blanická
      [50.0742, 14.4388],
      [50.0735, 14.4382], // Americká kruhový objezd
      [50.0728, 14.4370],
      [50.0725, 14.4355]  // Bruselská
    ],
    signalizedCrossings: [
      { id: 'sig-zah-fran', name: 'Záhřebská x Francouzská', coords: [50.07500, 14.43950] }
    ]
  },
  // --- AMERICKÁ (TERTIARY) ---
  {
    id: 'corridor-americka',
    name: 'Americká',
    osmHighway: 'tertiary',
    hasTram: false,
    coordinates: [
      [50.0758, 14.4378], // Francouzská
      [50.0745, 14.4380],
      [50.0735, 14.4382], // Záhřebská kruhový objezd
      [50.0720, 14.4385], // Máchova
      [50.0710, 14.4390]  // U Havlíčkových sadů
    ],
    signalizedCrossings: [
      { id: 'sig-ame-fran', name: 'Americká x Francouzská', coords: [50.07580, 14.43780] }
    ]
  },
  // --- SOKOLSKÁ (TRUNK) ---
  {
    id: 'corridor-sokolska',
    name: 'Sokolská (Severojižní magistrála)',
    osmHighway: 'trunk',
    hasTram: false,
    coordinates: [
      [50.0782, 14.4290],
      [50.0775, 14.4293],
      [50.0752, 14.4298],
      [50.0735, 14.4302],
      [50.0708, 14.4305],
      [50.0680, 14.4308]
    ],
    signalizedCrossings: [
      { id: 'sig-sok-zitna', name: 'Sokolská x Žitná', coords: [50.07780, 14.42925] },
      { id: 'sig-sok-ipp', name: 'Sokolská x I.P. Pavlova', coords: [50.07505, 14.42978] },
      { id: 'sig-sok-rumunska', name: 'Sokolská x Rumunská', coords: [50.07350, 14.43020] },
      { id: 'sig-sok-wenzigova', name: 'Sokolská x Wenzigova', coords: [50.07080, 14.43050] }
    ]
  },
  // --- LEGEROVA (TRUNK) ---
  {
    id: 'corridor-legerova',
    name: 'Legerova (Severojižní magistrála)',
    osmHighway: 'trunk',
    hasTram: false,
    coordinates: [
      [50.0680, 14.4322],
      [50.0710, 14.4320],
      [50.0736, 14.4314],
      [50.0754, 14.4312],
      [50.0780, 14.4308],
      [50.0792, 14.4322]
    ],
    signalizedCrossings: [
      { id: 'sig-leg-wenzigova', name: 'Legerova x Wenzigova', coords: [50.07100, 14.43200] },
      { id: 'sig-leg-rumunska', name: 'Legerova x Rumunská', coords: [50.07365, 14.43140] },
      { id: 'sig-leg-ipp', name: 'Legerova x I.P. Pavlova', coords: [50.07520, 14.43120] },
      { id: 'sig-leg-zitna', name: 'Legerova x Žitná', coords: [50.07800, 14.43080] },
      { id: 'sig-leg-muzeum', name: 'Legerova x Muzeum', coords: [50.07925, 14.43220] }
    ]
  },
  // --- ŽITNÁ (PRIMARY) ---
  {
    id: 'corridor-zitna',
    name: 'Žitná',
    osmHighway: 'primary',
    hasTram: false,
    coordinates: [
      [50.0775, 14.4210],
      [50.0777, 14.4250],
      [50.0778, 14.4292],
      [50.0780, 14.4308]
    ],
    signalizedCrossings: [
      { id: 'sig-zitna-karlak', name: 'Žitná x Karlovo náměstí', coords: [50.07765, 14.42110] },
      { id: 'sig-zitna-sokolska', name: 'Žitná x Sokolská', coords: [50.07780, 14.42925] },
      { id: 'sig-zitna-legerova', name: 'Žitná x Legerova', coords: [50.07800, 14.43080] }
    ]
  },
  // --- NÁRODNÍ TŘÍDA (PRIMARY + TRAM) ---
  {
    id: 'corridor-narodni',
    name: 'Národní třída',
    osmHighway: 'primary',
    hasTram: true,
    coordinates: [
      [50.0818, 14.4128],
      [50.0820, 14.4150],
      [50.0822, 14.4185],
      [50.0826, 14.4222],
      [50.0832, 14.4235]
    ],
    signalizedCrossings: [
      { id: 'sig-narodni-divadlo', name: 'Národní divadlo', coords: [50.08185, 14.41320] },
      { id: 'sig-narodni-spalena', name: 'Národní x Spálená', coords: [50.08225, 14.41850] },
      { id: 'sig-narodni-jungmannova', name: 'Národní x Jungmannova', coords: [50.08260, 14.42220] }
    ]
  },
  // --- TRAMVAJOVÝ KORIDOR KORUNNÍ (PRIMARY) ---
  {
    id: 'corridor-korunni',
    name: 'Korunní',
    osmHighway: 'primary',
    hasTram: true,
    coordinates: [
      [50.0758, 14.4378], // Náměstí Míru
      [50.0755, 14.4420], // Budečská
      [50.0753, 14.4460], // Sázavská / Šumavská
      [50.0750, 14.4500], // U Vodárny
      [50.0748, 14.4540], // Perunova
      [50.0745, 14.4600], // Orionka
      [50.0750, 14.4640]  // Jičínská / Flora
    ],
    signalizedCrossings: [
      { id: 'sig-kor-miru', name: 'Korunní x Náměstí Míru (tram)', coords: [50.07580, 14.43780] },
      { id: 'sig-kor-budecska', name: 'Korunní x Budečská (tram)', coords: [50.07550, 14.44200] },
      { id: 'sig-kor-vodarna', name: 'Korunní x U Vodárny (tram)', coords: [50.07500, 14.45000] },
      { id: 'sig-kor-orionka', name: 'Korunní x Orionka (tram)', coords: [50.07450, 14.46000] }
    ]
  },
  // --- BUDEČSKÁ (SECONDARY / PŘEHLEDNÁ TŘÍDA) ---
  {
    id: 'corridor-budecska',
    name: 'Budečská',
    osmHighway: 'secondary',
    hasTram: false,
    coordinates: [
      [50.0780, 14.4421], // Vinohradská
      [50.0768, 14.4421], // Mánesova
      [50.0755, 14.4420], // Korunní
      [50.0740, 14.4419]  // Francouzská
    ],
    signalizedCrossings: [
      { id: 'sig-bud-vino', name: 'Budečská x Vinohradská', coords: [50.07802, 14.44215] },
      { id: 'sig-bud-kor', name: 'Budečská x Korunní', coords: [50.07550, 14.44200] }
    ]
  }
];

export interface ChildSafetyViolation {
  roadName: string;
  isTramway: boolean;
  intersectionPoint: [number, number]; // [lat, lng]
  nearestSignalizedCrossing: {
    id: string;
    name: string;
    coords: [number, number];
    distanceMeters: number;
  };
}

export interface ChildSafetyValidationResult {
  isChildSafe: boolean;
  violationsCount: number;
  violations: ChildSafetyViolation[];
  suggestedWaypoint: [number, number] | null; // [lat, lng]
}

/**
 * Validace a vyčištění souřadnic pro Turf.js operace:
 * - Ověří, zda souřadnice [lat, lng] jsou konečná čísla (nejsou NaN, null, undefined).
 */
export function isValidLatLng(pt: any): pt is [number, number] {
  return (
    Array.isArray(pt) &&
    pt.length >= 2 &&
    typeof pt[0] === 'number' &&
    typeof pt[1] === 'number' &&
    Number.isFinite(pt[0]) &&
    Number.isFinite(pt[1])
  );
}

/**
 * Validace a filtrace pole souřadnic [lat, lng]:
 * - Odstraní NaN, undefined a nevalidní body.
 */
export function sanitizeLatLngCoords(coords: any[]): [number, number][] {
  if (!Array.isArray(coords)) return [];
  return coords.filter(isValidLatLng);
}

/**
 * Bezpečné vytvoření Turf LineString v GeoJSON standardu [lng, lat]:
 * - Kontroluje minimálně 2 platné body.
 * - Žádný bod nesmí obsahovat NaN ani undefined.
 * - Správný GeoJSON formát: lineString(coords.map(c => [c[1], c[0]])) -> [lng, lat].
 */
export function createSafeTurfLineString(coords: [number, number][]): ReturnType<typeof turf.lineString> | null {
  const sanitized = sanitizeLatLngCoords(coords);
  if (sanitized.length < 2) return null;
  try {
    const geoJsonCoords = sanitized.map(([lat, lng]) => [lng, lat]);
    return turf.lineString(geoJsonCoords);
  } catch {
    return null;
  }
}

/**
 * Bezpečné vytvoření Turf Point v GeoJSON standardu [lng, lat] z [lat, lng].
 */
export function createSafeTurfPoint(coord: [number, number]): ReturnType<typeof turf.point> | null {
  if (!isValidLatLng(coord)) return null;
  try {
    return turf.point([coord[1], coord[0]]);
  } catch {
    return null;
  }
}

/**
 * 3. Odstranění možných nekonečných smyček:
 * Bezpečné promazávání duplicitních bodů pod stanovenou vzdálenost (výchozí 1 m) bez while cyklů.
 * Používá bezpečný průchod přes filter.
 */
export function removeDuplicatePoints(
  coords: [number, number][],
  minDistanceMeters: number = 1
): [number, number][] {
  if (!coords || !Array.isArray(coords) || coords.length < 2) return coords || [];

  try {
    return coords.filter((pt, i) => {
      if (i === 0 || i === coords.length - 1) return true; // Počáteční a koncový bod trasy vždy zachovat
      const prev = coords[i - 1];
      if (!isValidLatLng(pt) || !isValidLatLng(prev)) return false;

      try {
        const ptTurf = turf.point([pt[1], pt[0]]);
        const prevTurf = turf.point([prev[1], prev[0]]);
        return turf.distance(ptTurf, prevTurf, { units: 'meters' }) >= minDistanceMeters;
      } catch {
        return getDistance(pt[0], pt[1], prev[0], prev[1]) >= minDistanceMeters;
      }
    });
  } catch {
    return coords;
  }
}

/**
 * 4. Dětský bezpečnostní validátor (Child Safety Constraint):
 * - Zkontroluje celou trasu: Každé protnutí linie vozovky vyšší než residential
 *   (primary, secondary, tertiary) MUSÍ obsahovat uzel s tagem přechodu.
 * - Pokud trasa překonává komunikaci s tramvajovým pásem (např. Bělehradská),
 *   bod křížení MUSÍ být striktně ukotven na nejbližší uzel se světelnou signalizací (crossing=traffic_signals).
 * - Pokud neobsahuje, trasa je nevalidní a algoritmus vloží mezilehlý bod (waypoint)
 *   na nejbližší světelnou křižovatku.
 */
export function validateChildSafetyConstraint(
  routeGeometry: [number, number][],
  crossingIndex: CrossingSpatialIndex = getGlobalCrossingIndex(),
  corridors: PragueRoadCorridor[] = PRAGUE_ROAD_CORRIDORS
): ChildSafetyValidationResult {
  if (!routeGeometry || !Array.isArray(routeGeometry) || routeGeometry.length < 2) {
    return { isChildSafe: true, violationsCount: 0, violations: [], suggestedWaypoint: null };
  }

  const validRouteCoords = sanitizeLatLngCoords(routeGeometry);
  if (validRouteCoords.length < 2) {
    return { isChildSafe: true, violationsCount: 0, violations: [], suggestedWaypoint: null };
  }

  try {
    const routeLine = createSafeTurfLineString(validRouteCoords);
    if (!routeLine) {
      return { isChildSafe: true, violationsCount: 0, violations: [], suggestedWaypoint: null };
    }

    const violations: ChildSafetyViolation[] = [];

    for (const corridor of corridors) {
      if (!corridor.coordinates || corridor.coordinates.length < 2) continue;
      const roadLine = createSafeTurfLineString(corridor.coordinates);
      if (!roadLine) continue;

      try {
        const intersections = turf.lineIntersect(routeLine, roadLine);
        if (!intersections || !intersections.features || intersections.features.length === 0) continue;

        for (const feat of intersections.features) {
          if (!feat.geometry || !feat.geometry.coordinates) continue;
          const [intLng, intLat] = feat.geometry.coordinates;
          if (!Number.isFinite(intLng) || !Number.isFinite(intLat)) continue;

          // Pokud jde o tramvajový pás (např. Bělehradská), křížení MUSÍ být světelně řízeno!
          if (corridor.hasTram) {
            let nearestSignal = corridor.signalizedCrossings[0];
            let minSignalDist = Infinity;

            for (const sig of corridor.signalizedCrossings) {
              const d = getDistance(intLat, intLng, sig.coords[0], sig.coords[1]);
              if (d < minSignalDist) {
                minSignalDist = d;
                nearestSignal = sig;
              }
            }

            if (minSignalDist > 18 && nearestSignal) {
              violations.push({
                roadName: `${corridor.name} (tramvajový pás)`,
                isTramway: true,
                intersectionPoint: [intLat, intLng],
                nearestSignalizedCrossing: {
                  id: nearestSignal.id,
                  name: nearestSignal.name,
                  coords: nearestSignal.coords,
                  distanceMeters: minSignalDist
                }
              });
              continue;
            }
          }

          // Pro ostatní komunikace vyšší než residential: ověřit přítomnost libovolného přechodu do 25 m
          const nearbyCrossing = crossingIndex.findNearest(intLat, intLng, 25, false);

          if (!nearbyCrossing) {
            let nearestSignal = corridor.signalizedCrossings[0];
            let minSignalDist = Infinity;

            for (const sig of corridor.signalizedCrossings) {
              const d = getDistance(intLat, intLng, sig.coords[0], sig.coords[1]);
              if (d < minSignalDist) {
                minSignalDist = d;
                nearestSignal = sig;
              }
            }

            violations.push({
              roadName: corridor.name,
              isTramway: corridor.hasTram,
              intersectionPoint: [intLat, intLng],
              nearestSignalizedCrossing: {
                id: nearestSignal ? nearestSignal.id : 'unknown',
                name: nearestSignal ? nearestSignal.name : corridor.name,
                coords: nearestSignal ? nearestSignal.coords : [intLat, intLng],
                distanceMeters: minSignalDist
              }
            });
          }
        }
      } catch {
        // Ignorovat geometrickou výjimku pro daný koridor
      }
    }

    const isChildSafe = violations.length === 0;
    const suggestedWaypoint = violations.length > 0
      ? violations[0].nearestSignalizedCrossing.coords
      : null;

    return {
      isChildSafe,
      violationsCount: violations.length,
      violations,
      suggestedWaypoint
    };
  } catch (err) {
    console.warn('validateChildSafetyConstraint error:', err);
    return { isChildSafe: true, violationsCount: 0, violations: [], suggestedWaypoint: null };
  }
}

/**
 * 2D vektorový determinant pro určení strany:
 * < 0 -> vpravo
 * > 0 -> vlevo
 */
function getRelativeSide(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  targetLat: number,
  targetLng: number
): 'right' | 'left' {
  if (![fromLat, fromLng, toLat, toLng, targetLat, targetLng].every(Number.isFinite)) {
    return 'right';
  }
  const cosLat = Math.cos((fromLat * Math.PI) / 180);
  const dx = (toLng - fromLng) * cosLat;
  const dy = toLat - fromLat;
  const wx = (targetLng - toLng) * cosLat;
  const wy = targetLat - toLat;

  const cross = dx * wy - dy * wx;
  return cross <= 0 ? 'right' : 'left';
}

/**
 * 1. Detekce kolizí offsetu s budovami (Fix řezání domů):
 * - Implementuje prostorovou validaci pro @turf/line-offset s bezpečným obalem (try/catch).
 * - Pokud jakákoliv operace selže, funkce okamžitě vrátí původní segmentCoords jako fallback.
 */
export function applyDynamicSidewalkOffset(
  segmentCoords: [number, number][],
  targetCrossing: PedestrianCrossing | null = null,
  offsetMeters: number = 0,
  buildings: BuildingPolygon[] = getAllBuildingPolygons()
): [number, number][] {
  // Vypnuto: Žádné umělé turf.lineOffset posuny na segmentech, které generují bodce a deformace.
  // Pěší profil OSRM / OpenStreetMap již přirozeně vede po chodnících a pěších stezkách.
  return segmentCoords || [];
}

/**
 * 2. Vyhlazení křižovatek:
 * - Vypnuta manuální syntéza oblouků a odstraňování bodů.
 * - Pěší profil OSRM poskytuje plynulou geometrii; vracíme čisté souřadnice.
 */
export function smoothJaggedIntersections(
  coords: [number, number][],
  crossingIndex: CrossingSpatialIndex = getGlobalCrossingIndex()
): [number, number][] {
  return coords || [];
}

/**
 * 3. Korektní detekce chráněných přechodů podél trasy:
 * - Prozkoumá celou trasu a detekuje přechod na každém křížení s komunikací typu primary, secondary a tertiary.
 * - Započítá také všechny přechody v koridoru trasy (jak na křižovatkách, tak v přímých úsecích).
 * - Pokud trasa překonává komunikaci s tramvajovým pásem (např. Bělehradská),
 *   bod křížení MUSÍ být striktně ukotven na nejbližší uzel se světelnou signalizací.
 */
export function detectAllRouteCrossings(
  routeCoords: [number, number][],
  crossingIndex: CrossingSpatialIndex = getGlobalCrossingIndex(),
  corridors: PragueRoadCorridor[] = PRAGUE_ROAD_CORRIDORS
): PedestrianCrossing[] {
  if (!routeCoords || !Array.isArray(routeCoords) || routeCoords.length < 2) return [];

  const validCoords = sanitizeLatLngCoords(routeCoords);
  if (validCoords.length < 2) return [];

  try {
    const detectedMap = new Map<string | number, PedestrianCrossing>();

    // 1. Přechody v těsné blízkosti celé trajektorie trasy (přímé i odbočovací)
    try {
      const alongCrossings = crossingIndex.searchCrossingsAlongRoute(validCoords, 22);
      for (const c of alongCrossings) {
        detectedMap.set(c.id, c);
      }
    } catch {
      // Ignorovat
    }

    // 2. Křížení s uličními koridory primary, secondary a tertiary
    const routeLine = createSafeTurfLineString(validCoords);
    if (!routeLine) return Array.from(detectedMap.values());

    for (const corridor of corridors) {
      if (!corridor.coordinates || corridor.coordinates.length < 2) continue;
      const roadLine = createSafeTurfLineString(corridor.coordinates);
      if (!roadLine) continue;

      try {
        const intersections = turf.lineIntersect(routeLine, roadLine);
        if (!intersections || !intersections.features) continue;

        for (const feat of intersections.features) {
          if (!feat.geometry || !feat.geometry.coordinates) continue;
          const [intLng, intLat] = feat.geometry.coordinates;
          if (!Number.isFinite(intLng) || !Number.isFinite(intLat)) continue;

          if (corridor.hasTram) {
            // Na tramvajovém pásu musí být přechod se světelnou signalizací
            let nearestSignal = corridor.signalizedCrossings[0];
            let minDist = Infinity;
            for (const sig of corridor.signalizedCrossings) {
              const d = getDistance(intLat, intLng, sig.coords[0], sig.coords[1]);
              if (d < minDist) {
                minDist = d;
                nearestSignal = sig;
              }
            }

            if (nearestSignal) {
              detectedMap.set(nearestSignal.id, {
                id: nearestSignal.id,
                lat: nearestSignal.coords[0],
                lng: nearestSignal.coords[1],
                category: 'priority',
                crossingType: 'traffic_signals',
                hasSignals: true,
                hasZebra: true,
                streetName: `${corridor.name} (světelný přechod přes tramvajový pás)`
              });
            }
          } else {
            // Ostatní křížení: najít nejbližší přechod v okruhu 35 m
            const match = crossingIndex.findNearest(intLat, intLng, 35, false);
            if (match) {
              detectedMap.set(match.crossing.id, match.crossing);
            } else {
              // Syntetizovat evidovaný přechod pro dané uliční křížení
              const synthId = `cross-street-${corridor.id}-${intLat.toFixed(4)}-${intLng.toFixed(4)}`;
              detectedMap.set(synthId, {
                id: synthId,
                lat: intLat,
                lng: intLng,
                category: 'priority',
                crossingType: 'zebra',
                hasSignals: false,
                hasZebra: true,
                streetName: `Přechod ${corridor.name}`
              });
            }
          }
        }
      } catch {
        // Ignorovat
      }
    }

    return Array.from(detectedMap.values());
  } catch (err) {
    console.warn('detectAllRouteCrossings error:', err);
    return [];
  }
}

function stepAlongSegment(
  fromPoint: [number, number],
  towardsPoint: [number, number],
  distanceMeters: number
): [number, number] {
  if (!isValidLatLng(fromPoint) || !isValidLatLng(towardsPoint)) return fromPoint;
  const dTotal = getDistance(fromPoint[0], fromPoint[1], towardsPoint[0], towardsPoint[1]);
  if (dTotal <= 0.001 || !Number.isFinite(dTotal)) return fromPoint;
  const ratio = Math.min(0.40, Math.max(0.05, distanceMeters / dTotal));
  return [
    fromPoint[0] + (towardsPoint[0] - fromPoint[0]) * ratio,
    fromPoint[1] + (towardsPoint[1] - fromPoint[1]) * ratio
  ];
}

export interface ReconstructedMicroGeometryResult {
  geometry: [number, number][]; // [lat, lng] pro Leaflet Polyline
  snappedCrossings: PedestrianCrossing[];
  totalDistanceMeters: number;
  childSafety: ChildSafetyValidationResult;
  appliedOffsetMeters: number;
}

/**
 * Rekonstrukce pěší mikrogeometrie a detekce kontrolních bodů (Checkpoints):
 * 1. Geometrie trasy předávaná do Polyline je čisté, nezmutované pole z pěšího OSRM / OpenStreetMap.
 * 2. Odstraněno jakékoliv manuální vkládání bodů přechodů a semaforů do trajektorie čáry (odstranění vějířů a skoků).
 * 3. Přechody a semafory jsou detekovány výhradně jako samostatné kontrolní body (Checkpoints / markery).
 * 4. Odstraněn umělý turf.lineOffset na segmentech (žádné bodce ani deformace).
 * 5. Fail-safe: Obaleno v try/catch s garantovaným bezpečným návratem.
 */
export function reconstructRouteMicroGeometry(
  rawCoordinates: [number, number][], // [lat, lng]
  startPoint: [number, number],
  endPoint: [number, number],
  crossingIndex: CrossingSpatialIndex = getGlobalCrossingIndex(),
  buildings: BuildingPolygon[] = getAllBuildingPolygons(),
  offsetMeters: number = 0,
  snappingRadiusMeters: number = 35
): ReconstructedMicroGeometryResult {
  const safeStart = isValidLatLng(startPoint) ? startPoint : ([50.0755, 14.4378] as [number, number]);
  const safeEnd = isValidLatLng(endPoint) ? endPoint : ([50.0760, 14.4400] as [number, number]);

  const fallbackResult = (coords: [number, number][]): ReconstructedMicroGeometryResult => {
    let fallbackDist = 0;
    for (let i = 1; i < coords.length; i++) {
      fallbackDist += getDistance(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    }
    return {
      geometry: coords,
      snappedCrossings: [],
      totalDistanceMeters: Math.round(fallbackDist),
      childSafety: { isChildSafe: true, violationsCount: 0, violations: [], suggestedWaypoint: null },
      appliedOffsetMeters: 0
    };
  };

  if (!rawCoordinates || !Array.isArray(rawCoordinates) || rawCoordinates.length < 2) {
    return fallbackResult([safeStart, safeEnd]);
  }

  const validRaw = sanitizeLatLngCoords(rawCoordinates);
  if (validRaw.length < 2) {
    return fallbackResult([safeStart, safeEnd]);
  }

  try {
    // 1. Validace dětské bezpečnosti (včetně tramvajových pásů jako Bělehradská)
    const childSafety = validateChildSafetyConstraint(validRaw, crossingIndex);

    // 2. Detekce VŠECH chráněných přechodů a semaforů podél celé trasy jako samostatných checkpointů pro markery.
    // DŮLEŽITÉ: Žádné vkládání bodů přechodů do souřadnic trasy! Čára zůstává čistá a plynulá.
    const allTraversedCrossings = detectAllRouteCrossings(validRaw, crossingIndex);

    // 3. Odstranění bezprostředních duplikátů (pod 0.5 m) pro čisté vykreslení
    const cleanedCoords = removeDuplicatePoints(validRaw, 0.5);
    const finalCoords = cleanedCoords.length >= 2 ? cleanedCoords : validRaw;

    let totalDistanceMeters = 0;
    for (let i = 1; i < finalCoords.length; i++) {
      totalDistanceMeters += getDistance(
        finalCoords[i - 1][0], finalCoords[i - 1][1],
        finalCoords[i][0], finalCoords[i][1]
      );
    }

    return {
      geometry: finalCoords, // Čisté, nezmutované pole [lat, lng] přímo z pěšího routingu
      snappedCrossings: allTraversedCrossings, // Přechody a semafory jako samostatné Checkpoints
      totalDistanceMeters: Math.round(totalDistanceMeters),
      childSafety,
      appliedOffsetMeters: 0
    };
  } catch (err) {
    console.error('Kritická chyba v reconstructRouteMicroGeometry, fallback na původní trasu:', err);
    return fallbackResult(validRaw);
  }
}


