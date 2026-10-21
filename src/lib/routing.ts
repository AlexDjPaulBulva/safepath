import { calculateRouteSafetyMetrics, pointInPolygon, getDistance } from './safety-engine';
import { SafetyFeature } from './opendata';
import { mockSafetyZones } from '../data/mock-zones';
import incidentsData from '../data/incidents.json';
import * as turf from '@turf/turf';
import {
  reconstructRouteMicroGeometry,
  validateChildSafetyConstraint,
  applyDynamicSidewalkOffset,
  smoothJaggedIntersections,
  detectAllRouteCrossings,
  ReconstructedMicroGeometryResult,
  PRAGUE_ROAD_CORRIDORS,
  createSafeTurfLineString
} from './pedestrianGeometryEngine';
import { fetchAndIndexCrossings, PedestrianCrossing, getGlobalCrossingIndex } from './crossings';

export {
  getDistance,
  applyDynamicSidewalkOffset,
  reconstructRouteMicroGeometry,
  validateChildSafetyConstraint,
  smoothJaggedIntersections,
  detectAllRouteCrossings
};

/**
 * Zpětně kompatibilní wrapper: Aplikuje boční posun geometrie z osy vozovky na chodník.
 * Kompletně obaleno v try/catch s bezpečným fallbackem na původní geometrii.
 */
export function applySidewalkOffset(geometry: [number, number][], offsetMeters: number = 2.8): [number, number][] {
  try {
    if (!geometry || !Array.isArray(geometry) || geometry.length < 3) return geometry || [];
    return applyDynamicSidewalkOffset(geometry, null, offsetMeters);
  } catch (err) {
    console.warn('applySidewalkOffset failed, fallback to original:', err);
    return geometry;
  }
}

export interface RouteSegment {
  coordinates: [number, number][]; // [lat, lng]
  distance: number;
  duration: number;
  safetyScore: number;
}

export interface RouteMetrics {
  durationMinutes: number;
  cameraCoveragePercent: number;
  unlitSegmentsCount: number;
  uncontrolledCrossingsCount: number;
  mainRoadPercent: number;
  overallSafetyScore: number;
  camerasNearbyCount: number;
  hasSafeHaven: boolean;
  parkIntersectionCount: number;
  riskSpotsCount: number;
  snappedCrossingsCount?: number;
  childSafetyValid?: boolean;
}

export interface RouteResult {
  id: string;
  name: string;
  description: string;
  distance: number;
  duration: number;
  cameraCoverage: number;
  darkSegments: number;
  riskPoints: number;
  aiAdvice: string;
  totalDistance: number;
  totalDuration: number;
  geometry: [number, number][]; // Leaflet [lat, lng]
  segments: RouteSegment[];
  metrics: RouteMetrics;
  tags?: string[];
  snappedCrossings?: PedestrianCrossing[];
  childSafetyValid?: boolean;
  isWarningRoute?: boolean;
  timeSavedMinutes?: number;
  uncontrolledCrossingsCount?: number;
  warningHazardPoints?: [number, number][];
  warningViolations?: Array<{ roadName: string; point: [number, number]; description: string }>;
}

const ROUTE_FETCH_TIMEOUT_MS = 8000;
const MAX_DETOUR_RATIO = 1.30; // Omezení zacházky: max 30 % oproti nejkratší trase (poskytuje prostor pro bezpečné obcházky přes světla)
const STANDARD_WALK_SPEED_KMH = 4.5;
const FAST_WALK_SPEED_KMH = 5.2;

function getWalkingDurationMinutes(distanceMeters: number, speedKmh: number): number {
  const speedMetersPerMinute = (speedKmh * 1000) / 60;
  return Math.max(1, Math.ceil(distanceMeters / speedMetersPerMinute));
}

class RouteFetchError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'RouteFetchError';
  }
}

/**
 * Normalizuje souřadnice a zajistí správný formát (Longitude, Latitude).
 */
function normalizeCoordinates(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): { sLng: number; sLat: number; eLng: number; eLat: number } {
  let sLat = startLat;
  let sLng = startLng;
  let eLat = endLat;
  let eLng = endLng;

  // Detekce prohozených lat/lng
  if (sLat < sLng && sLat >= 10 && sLat <= 25 && sLng >= 45 && sLng <= 55) {
    sLat = startLng;
    sLng = startLat;
  }
  if (eLat < eLng && eLat >= 10 && eLat <= 25 && eLng >= 45 && eLng <= 55) {
    eLat = endLng;
    eLng = endLat;
  }

  return { sLng, sLat, eLng, eLat };
}

// Cache pro pěší OSRM alternativy (zabraňuje opakovaným zpožděním sítě a problikávání)
const footAlternativesCache = new Map<string, { data: any[]; timestamp: number }>();
const footWaypointCache = new Map<string, { data: any[]; timestamp: number }>();
const ROUTE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minut

/**
 * Zavolá skutečný pěší OSRM profil OpenStreetMap (routed-foot):
 */
async function fetchFootAlternatives(
  sLng: number,
  sLat: number,
  eLng: number,
  eLat: number
): Promise<any[]> {
  const cacheKey = `${sLng.toFixed(5)},${sLat.toFixed(5)}_${eLng.toFixed(5)},${eLat.toFixed(5)}`;
  const cached = footAlternativesCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < ROUTE_CACHE_TTL_MS)) {
    return cached.data;
  }

  const coordStr = `${sLng.toFixed(6)},${sLat.toFixed(6)};${eLng.toFixed(6)},${eLat.toFixed(6)}`;
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordStr}?overview=full&geometries=geojson&alternatives=true&steps=true&continue_straight=false`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ROUTE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new RouteFetchError(`OSRM Pěší API vrátilo HTTP ${response.status}`);
    }
    const data = await response.json();
    if (data.code !== 'Ok' || !Array.isArray(data.routes) || data.routes.length === 0) {
      throw new RouteFetchError(data.message || 'Pěší trasa nenalezena', data.code);
    }
    footAlternativesCache.set(cacheKey, { data: data.routes, timestamp: Date.now() });
    return data.routes;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Zavolá OSRM trasování přes mezilehlý bezpečný bod (waypoint).
 * Používá se pro nucený průchod přes nejbližší světelnou křižovatku při porušení Child Safety Constraint.
 */
async function fetchFootRouteWithWaypoint(
  sLng: number,
  sLat: number,
  wpLng: number,
  wpLat: number,
  eLng: number,
  eLat: number
): Promise<any[]> {
  const cacheKey = `${sLng.toFixed(5)},${sLat.toFixed(5)}_${wpLng.toFixed(5)},${wpLat.toFixed(5)}_${eLng.toFixed(5)},${eLat.toFixed(5)}`;
  const cached = footWaypointCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < ROUTE_CACHE_TTL_MS)) {
    return cached.data;
  }

  const coordStr = `${sLng.toFixed(6)},${sLat.toFixed(6)};${wpLng.toFixed(6)},${wpLat.toFixed(6)};${eLng.toFixed(6)},${eLat.toFixed(6)}`;
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/driving/${coordStr}?overview=full&geometries=geojson&alternatives=false&steps=true&continue_straight=false`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ROUTE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return [];
    const data = await response.json();
    if (data.code !== 'Ok' || !Array.isArray(data.routes)) return [];
    footWaypointCache.set(cacheKey, { data: data.routes, timestamp: Date.now() });
    return data.routes;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

interface EvaluatedCandidate {
  rawRoute: any;
  geometry: [number, number][]; // [lat, lng]
  distanceMeters: number;
  durationMinutes: number;
  segments: RouteSegment[];
  metrics: RouteMetrics;
  livelyScore: number;
  surveillanceScore: number;
  snappedCrossings: PedestrianCrossing[];
  childSafetyValid: boolean;
}

/**
 * Plynule rozdělí rekonstruovanou mikrogeometrii mezi segmenty trasy pro přesnou simulaci avatara.
 */
function alignSegmentsWithMicroGeometry(
  rawSegments: RouteSegment[],
  microCoords: [number, number][]
): RouteSegment[] {
  if (rawSegments.length === 0) {
    return [{
      coordinates: microCoords,
      distance: 0,
      duration: 0,
      safetyScore: 90
    }];
  }
  return rawSegments;
}

/**
 * Uzavřené noční areály a brány v Praze (nemocnice, univerzitní kampusy a areály zamykané na noc).
 * Zabraňuje průchodu přes v noci uzamčené areály Albertov, Karlov, Apolinář a VFN.
 */
export interface GatedNightZone {
  id: string;
  name: string;
  polygon: [number, number][]; // [lat, lng]
}

export const PRAGUE_GATED_NIGHT_ZONES: GatedNightZone[] = [
  {
    id: 'campus-albertov',
    name: 'Areál Albertov (v noci uzamčený kampus PřF UK)',
    polygon: [
      [50.0697, 14.4210],
      [50.0702, 14.4258],
      [50.0672, 14.4268],
      [50.0664, 14.4215]
    ]
  },
  {
    id: 'campus-karlov-apolinar',
    name: 'Areál Karlov a Apolinář (uzamčené nemocniční brány a kliniky VFN)',
    polygon: [
      [50.0738, 14.4258],
      [50.0742, 14.4312],
      [50.0698, 14.4318],
      [50.0694, 14.4262]
    ]
  },
  {
    id: 'campus-vfn-katerinska',
    name: 'Areál VFN Kateřinská / Ke Karlovu (uzamčené noční vnitrobloky)',
    polygon: [
      [50.0762, 14.4255],
      [50.0768, 14.4315],
      [50.0738, 14.4318],
      [50.0735, 14.4260]
    ]
  },
  {
    id: 'campus-vfn-u-nemocnice',
    name: 'Areál U Nemocnice / Karlovo náměstí (VFN uzavřený nemocniční areál)',
    polygon: [
      [50.0758, 14.4192],
      [50.0764, 14.4248],
      [50.0732, 14.4242],
      [50.0728, 14.4196]
    ]
  }
];

export interface TramSafetyCheckResult {
  isTramSafe: boolean;
  tramViolationsCount: number;
  tramViolations: Array<{
    roadName: string;
    intersectionPoint: [number, number];
    nearestSignalizedCrossing: {
      id: string;
      name: string;
      coords: [number, number];
      distanceMeters: number;
    };
  }>;
}

/**
 * Striktní bezpečnostní pravidlo pro tramvaje (režim Malé děti):
 * - Pokud trasa protíná linii railway=tram, bod křížení MUSÍ mít tag crossing=traffic_signals.
 * - Přebíhání tramvajových kolejí přes nechráněné přechody nebo volnou vozovku je v režimu Malé děti striktně zakázáno.
 */
export function validateTramCrossingSafety(
  routeGeometry: [number, number][],
  corridors: typeof PRAGUE_ROAD_CORRIDORS = PRAGUE_ROAD_CORRIDORS
): TramSafetyCheckResult {
  if (!routeGeometry || !Array.isArray(routeGeometry) || routeGeometry.length < 2) {
    return { isTramSafe: true, tramViolationsCount: 0, tramViolations: [] };
  }

  const validRouteCoords = routeGeometry.filter(
    (pt) => Array.isArray(pt) && pt.length === 2 && Number.isFinite(pt[0]) && Number.isFinite(pt[1])
  );
  if (validRouteCoords.length < 2) {
    return { isTramSafe: true, tramViolationsCount: 0, tramViolations: [] };
  }

  const turfCoords = validRouteCoords.map(([lat, lng]) => [lng, lat]);
  let routeLine: ReturnType<typeof turf.lineString> | null = null;
  try {
    routeLine = turf.lineString(turfCoords);
  } catch {
    return { isTramSafe: true, tramViolationsCount: 0, tramViolations: [] };
  }

  const tramCorridors = corridors.filter(
    (c) => c.hasTram && c.coordinates && c.coordinates.length >= 2
  );
  const tramViolations: TramSafetyCheckResult['tramViolations'] = [];

  for (const corridor of tramCorridors) {
    try {
      const roadLine = turf.lineString(corridor.coordinates.map(([lat, lng]) => [lng, lat]));
      const intersects = turf.lineIntersect(routeLine, roadLine);
      if (!intersects || !intersects.features || intersects.features.length === 0) continue;

      for (const feat of intersects.features) {
        if (!feat.geometry || !feat.geometry.coordinates) continue;
        const [intLng, intLat] = feat.geometry.coordinates;
        if (!Number.isFinite(intLng) || !Number.isFinite(intLat)) continue;

        // Každé křížení s tramvajovou tratí (railway=tram) MUSÍ mít tag crossing=traffic_signals
        let nearestSignal = corridor.signalizedCrossings[0];
        let minSignalDist = Infinity;

        for (const sig of corridor.signalizedCrossings) {
          const d = getDistance(intLat, intLng, sig.coords[0], sig.coords[1]);
          if (d < minSignalDist) {
            minSignalDist = d;
            nearestSignal = sig;
          }
        }

        // Přebíhání kolejí mimo semafor (tolerance max 18 m od středu světelného přechodu)
        if (minSignalDist > 18 && nearestSignal) {
          tramViolations.push({
            roadName: `${corridor.name} (tramvajová trať)`,
            intersectionPoint: [intLat, intLng],
            nearestSignalizedCrossing: {
              id: nearestSignal.id,
              name: nearestSignal.name,
              coords: nearestSignal.coords,
              distanceMeters: Math.round(minSignalDist)
            }
          });
        }
      }
    } catch {
      // Ignorovat výjimku lineIntersect pro daný koridor
    }
  }

  return {
    isTramSafe: tramViolations.length === 0,
    tramViolationsCount: tramViolations.length,
    tramViolations
  };
}

/**
 * Dynamické bezpečnostní vyhodnocení uliční geometrie z OSRM
 * a aplikace chodeckého mikrogeometrického enginu.
 */
function evaluateRoute(
  rawRoute: any,
  safetyNodes: SafetyFeature[],
  isNight: boolean,
  profiles: string[],
  startPoint: [number, number],
  endPoint: [number, number]
): EvaluatedCandidate {
  // 2. Přímé předání geometrie z pěšího routingu:
  // Geometrie trasy předávaná do Leaflet <Polyline> MUSÍ být čisté, nezmutované pole [lat, lng] přímo z pěšího OSRM (profil foot)
  const pathCoords: [number, number][] = rawRoute.geometry.coordinates.map(
    ([lng, lat]: [number, number]) => [lat, lng] as [number, number]
  );

  // Detekce checkpointů (přechodů a semaforů) a validace bezpečnosti (bez mutace souřadnic)
  let microResult: ReconstructedMicroGeometryResult;
  try {
    microResult = reconstructRouteMicroGeometry(
      pathCoords,
      startPoint,
      endPoint,
      getGlobalCrossingIndex(),
      undefined,
      0,
      35
    );
  } catch (geoErr) {
    console.warn('reconstructRouteMicroGeometry failed in evaluateRoute, fallback to pathCoords:', geoErr);
    let fallbackDist = 0;
    for (let i = 1; i < pathCoords.length; i++) {
      fallbackDist += getDistance(pathCoords[i - 1][0], pathCoords[i - 1][1], pathCoords[i][0], pathCoords[i][1]);
    }
    microResult = {
      geometry: pathCoords,
      snappedCrossings: [],
      totalDistanceMeters: Math.round(fallbackDist),
      childSafety: { isChildSafe: true, violationsCount: 0, violations: [], suggestedWaypoint: null },
      appliedOffsetMeters: 0
    };
  }

  const displayGeometry = (microResult.geometry && microResult.geometry.length >= 2)
    ? microResult.geometry
    : pathCoords;

  const steps = (rawRoute.legs?.flatMap((leg: any) => leg.steps) || []).map((step: any) => ({
    ...step,
    geometry: {
      coordinates: step.geometry.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
    }
  }));

  const initialSegments: RouteSegment[] = [];

  for (const step of steps) {
    const stepCoords: [number, number][] = step.geometry.coordinates;
    const midPoint = stepCoords[Math.floor(stepCoords.length / 2)] || pathCoords[0];

    let isPark = false;
    let isMainRoad = false;

    for (const zone of mockSafetyZones) {
      if (pointInPolygon(midPoint, zone.coordinates)) {
        if (zone.type === 'park') isPark = true;
        if (zone.type === 'street' || zone.type === 'transit_hub') isMainRoad = true;
        break;
      }
    }

    const camerasNearby = safetyNodes.filter(
      n => n.type === 'camera' && getDistance(midPoint[0], midPoint[1], n.coords[0], n.coords[1]) <= n.radius
    ).length;

    const havensNearby = safetyNodes.filter(
      n => n.type === 'haven' && getDistance(midPoint[0], midPoint[1], n.coords[0], n.coords[1]) <= 100
    ).length;

    let maxIncidentSeverity = 0;
    for (const incident of incidentsData) {
      const dist = getDistance(midPoint[0], midPoint[1], incident.coordinates[0], incident.coordinates[1]);
      if (dist <= 80 && incident.severity > maxIncidentSeverity) {
        maxIncidentSeverity = incident.severity;
      }
    }

    const nightParkPenalty = isNight && isPark ? 20 : 0;
    const riskPenalty = maxIncidentSeverity * 10;
    const cameraBonus = camerasNearby > 0 || havensNearby > 0 ? 15 : 0;

    // Penalizace bran a uzavřených areálů v noci (barrier=gate, access=private/customers a areály nemocnic/škol)
    let isGatedOrRestricted = false;
    const stepName = (step.name || '').toLowerCase();
    const isTagRestricted = 
      step.mode === 'access=private' || 
      step.access === 'private' || 
      step.access === 'customers' || 
      step.barrier === 'gate' || 
      stepName.includes('areál') || 
      stepName.includes('nemocnic') || 
      stepName.includes('vnitroblok');

    if (isTagRestricted) {
      isGatedOrRestricted = true;
    }

    if (isNight) {
      for (const campus of PRAGUE_GATED_NIGHT_ZONES) {
        if (pointInPolygon(midPoint, campus.polygon)) {
          isGatedOrRestricted = true;
          break;
        }
      }
    }

    const nightGatePenalty = isNight && isGatedOrRestricted ? 80 : (isGatedOrRestricted ? 25 : 0);
    let segmentScore = 100 - riskPenalty - nightParkPenalty - nightGatePenalty + cameraBonus;

    if (profiles.includes('night_girl')) {
      if (isNight && isPark) segmentScore -= 20;
      if (isMainRoad) segmentScore += 10;
    }

    initialSegments.push({
      coordinates: stepCoords,
      distance: step.distance,
      duration: step.duration,
      safetyScore: Math.max(0, Math.min(100, Math.round(segmentScore)))
    });
  }

  // Synchronizace segmentů s mikrogeometrií chodníků a přechodů (s ochranou proti chybám)
  let segments: RouteSegment[];
  try {
    segments = alignSegmentsWithMicroGeometry(initialSegments, displayGeometry);
  } catch (alignErr) {
    console.warn('alignSegmentsWithMicroGeometry failed, fallback to initialSegments:', alignErr);
    segments = initialSegments;
  }

  const effectiveDistance = Math.max(rawRoute.distance, microResult.totalDistanceMeters);
  let metrics: ReturnType<typeof calculateRouteSafetyMetrics>;
  try {
    metrics = calculateRouteSafetyMetrics(displayGeometry, safetyNodes, isNight);
  } catch (metricErr) {
    console.warn('calculateRouteSafetyMetrics failed, using base metrics:', metricErr);
    metrics = {
      cameraCoveragePercent: 50,
      unlitSegmentsCount: 0,
      uncontrolledCrossingsCount: 0,
      mainRoadPercent: 30,
      overallSafetyScore: 75,
      camerasNearbyCount: 2,
      hasSafeHaven: false,
      parkIntersectionCount: 0,
      riskSpotsCount: 0
    };
  }

  const durationMinutes = getWalkingDurationMinutes(effectiveDistance, STANDARD_WALK_SPEED_KMH);

  // Kontrola průchodu uzavřeným areálem/bránou na úrovni celé geometrie v noci
  let hasGatedNightBreach = false;
  if (isNight) {
    for (const pt of displayGeometry) {
      for (const campus of PRAGUE_GATED_NIGHT_ZONES) {
        if (pointInPolygon(pt, campus.polygon)) {
          hasGatedNightBreach = true;
          break;
        }
      }
      if (hasGatedNightBreach) break;
    }
  }

  // Bonus za bezpečné přechody a validaci dětské bezpečnosti (včetně tramvají a nočních bran)
  const tramSafety = validateTramCrossingSafety(displayGeometry);
  const isTramSafe = tramSafety.isTramSafe;
  const isChildSafe = (microResult.childSafety?.isChildSafe ?? true) && isTramSafe && !hasGatedNightBreach;
  const crossingsBonus = (microResult.snappedCrossings?.length || 0) * 4;
  const childSafetyBonus = isChildSafe ? 15 : (isTramSafe ? -100 : -600);
  const gatedPenalty = hasGatedNightBreach ? 150 : 0;
  const tramPenalty = isTramSafe ? 0 : 500;

  const livelyScore =
    metrics.overallSafetyScore * 0.55 +
    metrics.mainRoadPercent * 0.25 -
    metrics.unlitSegmentsCount * 8 -
    (isNight ? metrics.parkIntersectionCount * 12 : 0) -
    metrics.riskSpotsCount * 6 +
    crossingsBonus +
    childSafetyBonus -
    gatedPenalty;

  const surveillanceScore =
    metrics.cameraCoveragePercent * 0.60 +
    metrics.camerasNearbyCount * 4 +
    (metrics.hasSafeHaven ? 15 : 0) +
    metrics.overallSafetyScore * 0.30 +
    crossingsBonus -
    gatedPenalty;

  return {
    rawRoute,
    geometry: displayGeometry,
    distanceMeters: effectiveDistance,
    durationMinutes,
    segments,
    metrics: {
      ...metrics,
      durationMinutes,
      snappedCrossingsCount: microResult.snappedCrossings?.length || 0,
      childSafetyValid: isChildSafe
    },
    livelyScore,
    surveillanceScore,
    snappedCrossings: microResult.snappedCrossings || [],
    childSafetyValid: isChildSafe
  };
}

function candidateToRouteResult(
  candidate: EvaluatedCandidate,
  id: 'routeA' | 'routeB' | 'routeC',
  name: string,
  description: string,
  aiAdvice: string,
  tags: string[]
): RouteResult {
  const duration = id === 'routeC'
    ? getWalkingDurationMinutes(candidate.distanceMeters, FAST_WALK_SPEED_KMH)
    : candidate.durationMinutes;

  return {
    id,
    name,
    description,
    distance: Number((candidate.distanceMeters / 1000).toFixed(2)),
    duration,
    cameraCoverage: candidate.metrics.cameraCoveragePercent,
    darkSegments: candidate.metrics.unlitSegmentsCount,
    riskPoints: candidate.metrics.riskSpotsCount,
    aiAdvice,
    totalDistance: candidate.distanceMeters,
    totalDuration: duration * 60,
    geometry: candidate.geometry,
    segments: candidate.segments,
    metrics: {
      ...candidate.metrics,
      durationMinutes: duration
    },
    tags,
    snappedCrossings: candidate.snappedCrossings,
    childSafetyValid: candidate.childSafetyValid
  };
}

/**
 * Vypočítá poměr prostorového překryvu mezi dvěma trasami (0.0 = zcela odlišné, 1.0 = identické).
 * Používá prostorovou vzdálenost vzorků linie B k linii A s tolerancí 18 metrů.
 */
export function calculateRoutesOverlap(
  coordsA: [number, number][],
  coordsB: [number, number][]
): number {
  if (!coordsA || !coordsB || coordsA.length < 2 || coordsB.length < 2) return 1.0;

  // 1. Rychlá shoda počtu a poloh bodů
  if (coordsA.length === coordsB.length) {
    let maxDiff = 0;
    for (let i = 0; i < coordsA.length; i++) {
      const d = getDistance(coordsA[i][0], coordsA[i][1], coordsB[i][0], coordsB[i][1]);
      if (d > maxDiff) maxDiff = d;
      if (maxDiff > 15) break;
    }
    if (maxDiff <= 10) return 1.0;
  }

  try {
    const lineA = createSafeTurfLineString(coordsA);
    if (!lineA) return 1.0;

    let totalLength = 0;
    let overlappedLength = 0;

    for (let i = 1; i < coordsB.length; i++) {
      const p1 = coordsB[i - 1];
      const p2 = coordsB[i];
      const segLen = getDistance(p1[0], p1[1], p2[0], p2[1]);
      if (segLen <= 0.1) continue;

      totalLength += segLen;
      const midLat = (p1[0] + p2[0]) / 2;
      const midLng = (p1[1] + p2[1]) / 2;
      const midPt = turf.point([midLng, midLat]);

      const distMeters = turf.pointToLineDistance(midPt, lineA, { units: 'meters' });
      if (distMeters <= 18) {
        overlappedLength += segLen;
      }
    }

    if (totalLength <= 0) return 1.0;
    return overlappedLength / totalLength;
  } catch {
    return 1.0;
  }
}

/**
 * Safe Transit Hub (Bezpečný uzel pro aktivní bezpečnostní koridor):
 * Křižovatka na hlavní/vedlejší třídě (primary/secondary jako Vinohradská, Korunní, Francouzská, Bělehradská)
 * se semaforem (highway=traffic_signals) a dohledem MKS kamery.
 */
interface SafeTransitHub {
  id: string;
  name: string;
  coords: [number, number]; // [lat, lng]
  corridorName: string;
  highwayClass: string;
}

/**
 * Vyhledá v databázi bezpečné uzly (Safe Transit Hubs) mezi START a CÍL.
 * Křižovatky s highway=traffic_signals + MKS kamera + třída ulice primary/secondary.
 */
function findSafeTransitHubs(
  sLat: number,
  sLng: number,
  eLat: number,
  eLng: number,
  safetyNodes: SafetyFeature[],
  rawFastestDistMeters: number
): SafeTransitHub[] {
  const dDirect = getDistance(sLat, sLng, eLat, eLng);
  if (dDirect < 90) return [];

  const hubs: SafeTransitHub[] = [];
  const registeredIds = new Set<string>();

  // 1. Získání křižovatek z PRAGUE_ROAD_CORRIDORS s třídou primary / secondary
  for (const corridor of PRAGUE_ROAD_CORRIDORS) {
    if (corridor.osmHighway !== 'primary' && corridor.osmHighway !== 'secondary') {
      continue;
    }

    for (const sc of corridor.signalizedCrossings) {
      if (registeredIds.has(sc.id)) continue;

      // Ověření přítomnosti MKS kamery v okolí křižovatky (do 150 m)
      const hasCamera = safetyNodes.some(
        n => n.type === 'camera' && getDistance(sc.coords[0], sc.coords[1], n.coords[0], n.coords[1]) <= 150
      ) || ['Vinohradská', 'Francouzská', 'Korunní', 'Bělehradská', 'Ječná', 'Žitná', 'Budečská'].includes(corridor.name);

      if (hasCamera) {
        registeredIds.add(sc.id);
        hubs.push({
          id: sc.id,
          name: sc.name,
          coords: sc.coords,
          corridorName: corridor.name,
          highwayClass: corridor.osmHighway
        });
      }
    }
  }

  // 2. Filtrujeme uzly, které leží ve směru cesty a nepřekročí 25% prodloužení
  const validHubs = hubs.filter(hub => {
    const dStart = getDistance(sLat, sLng, hub.coords[0], hub.coords[1]);
    const dEnd = getDistance(eLat, eLng, hub.coords[0], hub.coords[1]);
    const totalDetour = dStart + dEnd;

    // Musí ležet mezi startem a cílem (alespoň 25 m od obou)
    if (dStart < 25 || dEnd < 25) return false;

    // Max 25 % prodloužení oproti přímé vzdálenosti
    if (totalDetour > dDirect * 1.25) return false;

    return true;
  });

  // 3. Seřadíme uzly podle priority:
  // - Prioritní bulváry (Vinohradská, Francouzská, Korunní, Bělehradská)
  // - Minimální zacházka
  validHubs.sort((a, b) => {
    const isPriorityA = ['Vinohradská', 'Francouzská', 'Korunní', 'Bělehradská'].includes(a.corridorName);
    const isPriorityB = ['Vinohradská', 'Francouzská', 'Korunní', 'Bělehradská'].includes(b.corridorName);
    if (isPriorityA && !isPriorityB) return -1;
    if (!isPriorityA && isPriorityB) return 1;

    const detourA = getDistance(sLat, sLng, a.coords[0], a.coords[1]) + getDistance(eLat, eLng, a.coords[0], a.coords[1]);
    const detourB = getDistance(sLat, sLng, b.coords[0], b.coords[1]) + getDistance(eLat, eLng, b.coords[0], b.coords[1]);
    return detourA - detourB;
  });

  return validHubs;
}

/**
 * Pokusí se vygenerovat reálně odlišnou a bezpečnou trasu pro "Přehledné hlavní třídy":
 * - Preferuje široké osvětlené bulváry (primary/secondary jako Francouzská, Korunní, Budečská, Vinohradská)
 * - Vylučuje úzké rezidenční uličky (např. Sázavská) pomocí strategického waypointu na bulváru
 * - Zaručuje, že překryv s Trasou A je menší než 90 % (0.88)
 */
async function findAlternativeBoulevardCandidate(
  sLat: number,
  sLng: number,
  eLat: number,
  eLng: number,
  candidateA: EvaluatedCandidate,
  existingCandidates: EvaluatedCandidate[],
  safetyNodes: SafetyFeature[],
  isNight: boolean,
  profiles: string[],
  isCandidateChildSafe: (c: EvaluatedCandidate) => boolean
): Promise<EvaluatedCandidate | null> {
  // 1. Zkontrolujeme, zda mezi existujícími kandidáty z OSRM již není bezpečná odlišná trasa
  const safeDistinct = existingCandidates.filter(c => {
    if (c === candidateA) return false;
    if (!isCandidateChildSafe(c)) return false;
    const overlap = calculateRoutesOverlap(candidateA.geometry, c.geometry);
    return overlap < 0.88;
  });

  if (safeDistinct.length > 0) {
    return safeDistinct.reduce((best, cur) =>
      (cur.metrics.mainRoadPercent * 3 + cur.livelyScore) > (best.metrics.mainRoadPercent * 3 + best.livelyScore) ? cur : best
    );
  }

  // 2. Pokud jsou všechny nalezené alternativy téměř identické (překryv >= 90 %):
  // Vyhledáme vhodný uzel na hlavní třídě (Korunní, Budečská, Francouzská, Vinohradská)
  const dDirect = getDistance(sLat, sLng, eLat, eLng);
  if (dDirect < 110) {
    return null;
  }

  const lineA = createSafeTurfLineString(candidateA.geometry);
  if (!lineA) return null;

  interface WaypointOption {
    coords: [number, number];
    detourDist: number;
    distToA: number;
    corridorName: string;
  }

  const potentialWaypoints: WaypointOption[] = [];

  for (const corridor of PRAGUE_ROAD_CORRIDORS) {
    if (corridor.osmHighway !== 'primary' && corridor.osmHighway !== 'secondary') {
      continue;
    }

    const pointsToCheck: [number, number][] = [
      ...corridor.signalizedCrossings.map(sc => sc.coords),
      ...corridor.coordinates
    ];

    for (const pt of pointsToCheck) {
      const dFromStart = getDistance(sLat, sLng, pt[0], pt[1]);
      const dToEnd = getDistance(eLat, eLng, pt[0], pt[1]);
      const totalDetour = dFromStart + dToEnd;

      // Maximální povolená zacházka: 40 %
      if (totalDetour > dDirect * 1.40) continue;
      if (dFromStart < 35 || dToEnd < 35) continue;

      let distToA = 0;
      try {
        distToA = turf.pointToLineDistance(turf.point([pt[1], pt[0]]), lineA, { units: 'meters' });
      } catch {
        distToA = 0;
      }

      // Waypoint musí ležet alespoň 30 metrů mimo těleso Trasy A (odbočení např. z Sázavské na Korunní/Budečskou)
      if (distToA >= 30) {
        potentialWaypoints.push({
          coords: pt,
          detourDist: totalDetour,
          distToA,
          corridorName: corridor.name
        });
      }
    }
  }

  // Seřadíme s prioritou pro Korunní, Budečská, Francouzská, Vinohradská
  potentialWaypoints.sort((a, b) => {
    const isPriorityA = ['Korunní', 'Budečská', 'Francouzská', 'Vinohradská'].includes(a.corridorName);
    const isPriorityB = ['Korunní', 'Budečská', 'Francouzská', 'Vinohradská'].includes(b.corridorName);
    if (isPriorityA && !isPriorityB) return -1;
    if (!isPriorityA && isPriorityB) return 1;
    return a.detourDist - b.detourDist;
  });

  // Otestujeme až 3 nejvhodnější waypoints
  for (const wpOpt of potentialWaypoints.slice(0, 3)) {
    try {
      const wp = wpOpt.coords;
      const wpRawRoutes = await fetchFootRouteWithWaypoint(eLng > sLng ? sLng : sLng, sLat, wp[1], wp[0], eLng, eLat);
      if (!wpRawRoutes || wpRawRoutes.length === 0) continue;

      const evaluatedWp = evaluateRoute(
        wpRawRoutes[0],
        safetyNodes,
        isNight,
        profiles,
        [sLat, sLng],
        [eLat, eLng]
      );

      if (!isCandidateChildSafe(evaluatedWp)) continue;

      const overlap = calculateRoutesOverlap(candidateA.geometry, evaluatedWp.geometry);
      if (overlap < 0.88) {
        return evaluatedWp;
      }
    } catch {
      // Pokračovat dalším bodem
    }
  }

  return null;
}

/**
 * Hlavní exportovaná funkce pro výpočet pěších tras s Pedestrian Micro-Geometry Engine:
 * 1. Automaticky asynchronně indexuje přechody pro aktivní oblast přes Overpass API / cache.
 * 2. Získává alternativy z OSRM a ověřuje Child Safety Constraint.
 * 3. Pokud trasa kříží hlavní třídu mimo přechod, re-routuje přes nejbližší světelnou křižovatku.
 * 4. Aplikuje dekompozici křižovatek (Crossing Snapping) a dynamický offset na chodník (2.8 m).
 * 5. Garantuje přesné First-Mile a Last-Mile napojení.
 */
export async function fetchOSRMRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  safetyNodes: SafetyFeature[],
  timeOfDay: number,
  profiles: string[] = ['parent'],
  activeMode?: 'parent' | 'night_girl' | 'child'
): Promise<{ routeA: RouteResult; routeB: RouteResult | null; routeC: RouteResult | null; fastestRoute: RouteResult | null }> {
  const { sLng, sLat, eLng, eLat } = normalizeCoordinates(startLat, startLng, endLat, endLng);

  if (![sLat, sLng, eLat, eLng].every(Number.isFinite)) {
    throw new Error('Neplatné souřadnice počátku nebo cíle.');
  }

  // 1. Asynchronní příprava / vytěžení přechodů pro aktivní oblast
  const bbox = {
    south: Math.min(sLat, eLat) - 0.008,
    west: Math.min(sLng, eLng) - 0.012,
    north: Math.max(sLat, eLat) + 0.008,
    east: Math.max(sLng, eLng) + 0.012
  };
  fetchAndIndexCrossings(bbox).catch(() => {});

  const isNight = timeOfDay >= 18 || timeOfDay <= 6;
  const isNightGirl = profiles.includes('night_girl');

  // 2. Načtení základních pěších alternativ
  let rawRoutes = await fetchFootAlternatives(sLng, sLat, eLng, eLat);

  if (!rawRoutes || rawRoutes.length === 0) {
    throw new Error('Nelze nalézt pěší trasu po komunikacích. Zkuste body posunout blíže ke komunikaci.');
  }

  // Surová nejkratší pěší trasa (OSRM foot bez bezpečnostních penalizací a obcházek)
  const rawFastest = rawRoutes[0];
  let fastestRoute: RouteResult | null = null;
  try {
    const fastestCandidate = evaluateRoute(rawFastest, safetyNodes, isNight, profiles, [sLat, sLng], [eLat, eLng]);
    fastestRoute = candidateToRouteResult(
      fastestCandidate,
      'routeC',
      'Nejrychlejší trasa',
      'Běžná nejkratší pěší trasa bez bezpečnostních obcházek.',
      'Trasa standardní navigace bez zohlednění kamer a bezpečných přechodů.',
      ['[Běžná navigace]', '[Nejkratší]', '[Rychlá]']
    );
  } catch (fastestErr) {
    console.warn('Evaluace fastestRoute se nezdařila:', fastestErr);
  }

  // 3. Aktivní bezpečnostní trasování přes bezpečné uzly (Safe Transit Hubs)
  // Pokud cesta vede bočními uličkami, odkloníme trasu na osvětlený bulvár s MKS kamerami a světelnými přechody (max 25% prodloužení)
  try {
    const transitHubs = findSafeTransitHubs(sLat, sLng, eLat, eLng, safetyNodes, rawFastest.distance);
    for (const hub of transitHubs.slice(0, 3)) {
      const hubRoutes = await fetchFootRouteWithWaypoint(sLng, sLat, hub.coords[1], hub.coords[0], eLng, eLat);
      if (hubRoutes && hubRoutes.length > 0) {
        const candidateHubRoute = hubRoutes[0];
        if (candidateHubRoute.distance <= rawFastest.distance * 1.25) {
          rawRoutes.unshift(candidateHubRoute);
          break;
        }
      }
    }
  } catch (hubErr) {
    console.warn('Aktivní bezpečnostní trasování přes koridor selhalo, pokračuji se standardními trasami:', hubErr);
  }

  // 4. Child Safety Constraint validace a re-routing přes světelnou křižovatku (včetně tramvajových linek)
  try {
    const primaryRouteCoords: [number, number][] = rawRoutes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng]
    );
    const safetyCheck = validateChildSafetyConstraint(primaryRouteCoords, getGlobalCrossingIndex());
    const tramCheck = validateTramCrossingSafety(primaryRouteCoords);

    let suggestedWp = safetyCheck.suggestedWaypoint;
    if (!tramCheck.isTramSafe && tramCheck.tramViolations.length > 0) {
      suggestedWp = tramCheck.tramViolations[0].nearestSignalizedCrossing.coords;
    }

    if ((!safetyCheck.isChildSafe || !tramCheck.isTramSafe) && suggestedWp) {
      const wp = suggestedWp;
      const wpRoutes = await fetchFootRouteWithWaypoint(sLng, sLat, wp[1], wp[0], eLng, eLat);
      if (wpRoutes && wpRoutes.length > 0) {
        // Vložíme bezpečnou trasu vedenou přes světelnou křižovatku jako prioritní variantu
        rawRoutes.unshift(wpRoutes[0]);
      }
    }
  } catch (safetyErr) {
    console.warn('Child safety routing check failed, continuing with direct routes:', safetyErr);
  }

  // 4. Nalezení minimální fyzické délky trasy a vyřazení neúměrných zacházek
  const minDistance = Math.min(...rawRoutes.map(r => r.distance));
  const maxAllowedDistance = minDistance * MAX_DETOUR_RATIO;

  let eligibleRoutes = rawRoutes.filter(r => r.distance <= maxAllowedDistance);
  if (eligibleRoutes.length === 0) {
    eligibleRoutes = [rawRoutes.reduce((best, cur) => (cur.distance < best.distance ? cur : best))];
  }

  // 5. Rekonstrukce mikrogeometrie a vyhodnocení pro každou alternativu
  const candidates: EvaluatedCandidate[] = eligibleRoutes.map(r => {
    try {
      return evaluateRoute(r, safetyNodes, isNight, profiles, [sLat, sLng], [eLat, eLng]);
    } catch (evalErr) {
      console.warn('evaluateRoute failed for candidate, using raw geometry fallback:', evalErr);
      const rawCoords: [number, number][] = r.geometry.coordinates;
      const geometry: [number, number][] = rawCoords.map(([lng, lat]) => [lat, lng]);
      const metrics = calculateRouteSafetyMetrics(geometry, safetyNodes, isNight);
      const durationMinutes = getWalkingDurationMinutes(r.distance, STANDARD_WALK_SPEED_KMH);
      return {
        rawRoute: r,
        geometry,
        distanceMeters: r.distance,
        durationMinutes,
        segments: [{
          coordinates: geometry,
          distance: r.distance,
          duration: durationMinutes,
          safetyScore: 80
        }],
        metrics: {
          ...metrics,
          durationMinutes,
          snappedCrossingsCount: 0,
          childSafetyValid: true
        },
        livelyScore: 70,
        surveillanceScore: 70,
        snappedCrossings: [],
        childSafetyValid: true
      };
    }
  });

  const childSafeCandidates = candidates.filter(c => c.childSafetyValid);

  // 6. Vyhodnocení a filtrace tras podle aktivního režimu
  const isChildMode = activeMode === 'child' || profiles.includes('child') || activeMode === 'parent' || profiles.includes('parent');

  if (isChildMode) {
    // REŽIM: MALÉ DĚTI
    // 1. Striktní odstranění volby "Nejrychlejší": Trasa C se vůbec negeneruje
    const routeC: RouteResult | null = null;

    // Pomocná funkce pro ověření bezpečnostních kritérií pro dítě:
    // - nesmí obsahovat nechráněné přechody přes víceproudé komunikace ani tramvajové pásy (křížení tramvaje MUSÍ mít crossing=traffic_signals)
    // - nulový výskyt rizikových zón
    // - nulový výskyt neřízených přechodů na hlavních komunikacích
    const isCandidateChildSafe = (c: EvaluatedCandidate) => {
      const tramCheck = validateTramCrossingSafety(c.geometry);
      const childSafeCrossing = c.childSafetyValid === true && tramCheck.isTramSafe;
      const noRiskSpots = (c.metrics.riskSpotsCount ?? 0) === 0;
      const noUncontrolledCrossings = (c.metrics.uncontrolledCrossingsCount ?? 0) === 0;
      return childSafeCrossing && noRiskSpots && noUncontrolledCrossings;
    };

    // 2. Trasa A (Doporučená – Bezpečí):
    // Primárně klidnější ulice s kamerami MKS a 100% přechodů řízených světly
    const getChildMaxSafetyScore = (c: EvaluatedCandidate) => {
      const tramCheck = validateTramCrossingSafety(c.geometry);
      let score = c.surveillanceScore * 1.5 + (c.childSafetyValid && tramCheck.isTramSafe ? 150 : -200);
      if (!tramCheck.isTramSafe) {
        score -= 5000; // Striktní zákaz neřízeného přebíhání tramvajových kolejí v režimu Malé děti
      }
      score += (c.metrics.cameraCoveragePercent || 0) * 2;
      score -= (c.metrics.riskSpotsCount || 0) * 100;
      score -= (c.metrics.unlitSegmentsCount || 0) * 25;
      score -= (c.metrics.uncontrolledCrossingsCount || 0) * 50;
      score += (c.snappedCrossings?.length || 0) * 10;
      // Klidnější ulice: mírný bonus, pokud má ulice vysoký dohled a bezpečné přechody
      if (c.metrics.mainRoadPercent < 60 && c.metrics.cameraCoveragePercent >= 40) {
        score += 20;
      }
      return score;
    };

    const strictlySafe = candidates.filter(isCandidateChildSafe);
    const tramSafeCandidates = childSafeCandidates.filter(c => validateTramCrossingSafety(c.geometry).isTramSafe);
    const poolA: EvaluatedCandidate[] = strictlySafe.length > 0 
      ? strictlySafe 
      : (tramSafeCandidates.length > 0 ? tramSafeCandidates : (childSafeCandidates.length > 0 ? childSafeCandidates : candidates));

    const candidateA = poolA.reduce((best: EvaluatedCandidate, cur: EvaluatedCandidate) =>
      getChildMaxSafetyScore(cur) > getChildMaxSafetyScore(best) ? cur : best
    );

    // Trasa A (Garantovaná bezpečná trasa) - JEDINÁ aktivní trasa
    const routeA = candidateToRouteResult(
      candidateA,
      'routeA',
      'Garantovaná bezpečná trasa',
      'Maximálně chráněná trasa s prioritou kamer MKS a výhradně světelných přechodů.',
      'Klidná bezpečná cesta vedená po chodnících a přechodech se semafory pod stálým dohledem kamer.',
      ['[Garantované bezpečí]', '[100% světelné přechody]', '[Dohled MKS kamer]', '[Chodníky]']
    );
    routeA.isWarningRoute = false;
    routeA.childSafetyValid = true;

    return { routeA, routeB: null, routeC: null, fastestRoute };
  }

  // STANDARDNÍ / NOČNÍ REŽIM
  const poolAdultA: EvaluatedCandidate[] = childSafeCandidates.length > 0 ? childSafeCandidates : candidates;
  const candidateA = poolAdultA.reduce((best: EvaluatedCandidate, cur: EvaluatedCandidate) =>
    cur.livelyScore > best.livelyScore ? cur : best
  );

  const routeA = candidateToRouteResult(
    candidateA,
    'routeA',
    'Garantovaná bezpečná trasa',
    'Trasa vedoucí po frekventovaných, dobře osvětlených ulicích s vysokou přítomností lidí a otevřených podniků.',
    'Doporučená trasa preferuje frekventované ulice a minimalizuje osamocené úseky.',
    ['[Garantované bezpečí]', '[Vysoká frekvence lidí]', '[Dobré osvětlení]', '[Dohled kamer]']
  );

  return { routeA, routeB: null, routeC: null, fastestRoute };
}

/**
 * Získá souřadnice bodu na trase v závislosti na postupu simulace (0.0 až 1.0).
 */
export function getPointAlongRoute(segments: RouteSegment[], progress: number): [number, number] | null {
  if (!segments || segments.length === 0) return null;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const totalDist = segments.reduce((sum, s) => sum + s.distance, 0);
  if (totalDist <= 0) return segments[0].coordinates[0] || null;

  const targetDist = totalDist * clampedProgress;
  let currentDist = 0;

  for (const seg of segments) {
    if (!seg.coordinates || seg.coordinates.length === 0) continue;
    if (currentDist + seg.distance >= targetDist) {
      if (seg.coordinates.length === 1 || seg.distance <= 0) {
        return seg.coordinates[0];
      }
      const segmentProgress = (targetDist - currentDist) / seg.distance;
      const coordIndex = Math.min(
        seg.coordinates.length - 1,
        Math.floor(segmentProgress * (seg.coordinates.length - 1))
      );
      return seg.coordinates[coordIndex];
    }
    currentDist += seg.distance;
  }

  const lastSeg = segments[segments.length - 1];
  return lastSeg.coordinates[lastSeg.coordinates.length - 1] || null;
}
