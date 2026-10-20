export interface StreetSegment {
  id: string;
  lengthMeters: number;
  cameraCoveragePercent: number; // 0-100
  lightingQuality: 'none' | 'poor' | 'standard' | 'bright';
  crossingType: 'none' | 'uncontrolled' | 'controlled_light' | 'underpass';
  incidentDensity: number; // 0.0 - 1.0 (historická hustota hlášení)
}

import incidentsData from '../data/incidents.json';
import { SafetyFeature } from './opendata';
import { mockSafetyZones } from '../data/mock-zones';
import pragueSafetyCache from '../data/prague_safety_cache.json';

/**
 * Vypočítá SafetyScore (0 - 100) pro daný uliční segment.
 * 100 znamená maximálně bezpečný úsek, 0 je vysoce rizikový.
 * @param timeOfDay Hodina dne (0-23). 17-06 je noc.
 */
export function calculateEdgeSafety(edgeData: StreetSegment, timeOfDay: number = 12): number {
  let score = 100;
  
  const isNight = timeOfDay >= 17 || timeOfDay <= 6;

  // 1. Kamery (MKS/THMP): Kamera poskytuje vysoký pocit bezpečí, chybějící kamera snižuje score
  // V noci je váha kamer mnohem vyšší
  const cameraWeight = isNight ? 0.5 : 0.2; 
  const cameraPenalty = (100 - edgeData.cameraCoveragePercent) * cameraWeight;
  score -= cameraPenalty;

  // 2. Osvětlení: Neosvětlené ulice představují masivní riziko hlavně v noci
  if (isNight) {
    switch (edgeData.lightingQuality) {
      case 'none':
        score -= 60; // Extrémní penalizace v noci
        break;
      case 'poor':
        score -= 30;
        break;
      case 'standard':
        score -= 0;
        break;
      case 'bright':
        score += 10;
        break;
    }
  } else {
    // Přes den osvětlení nehraje tak velkou roli
    if (edgeData.lightingQuality === 'none') score -= 5;
  }

  // 3. Typy přechodů: Neřízené víceproudé přechody a podchody snižují pocit bezpečí
  // Přes den (hustý provoz) je to větší problém než v noci
  const crossingPenaltyMultiplier = isNight ? 0.5 : 1.5;
  switch (edgeData.crossingType) {
    case 'uncontrolled':
      score -= (15 * crossingPenaltyMultiplier);
      break;
    case 'underpass':
      score -= (25 * crossingPenaltyMultiplier); 
      break;
    case 'none':
    case 'controlled_light':
      break;
  }

  // 4. Incidenty: Zvýšený výskyt historických incidentů masivně sráží skóre
  score -= (edgeData.incidentDensity * 35);

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Vzorec pro úpravu váhy hrany v grafu pro algoritmy jako A* / Dijkstra.
 */
export function calculateRoutingWeight(edgeData: StreetSegment, timeOfDay: number = 12): number {
  const safetyScore = calculateEdgeSafety(edgeData, timeOfDay);
  const dangerFactor = 1 + ((100 - safetyScore) / 25); 
  return edgeData.lengthMeters * dangerFactor;
}

// Haversine formule pro výpočet vzdálenosti v metrech
export function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Reálný prostorový výpočet pro protnutí trasy a kamer (Line-to-Camera Intersection).
 * Vytvoří body podél trasy po 10-20 metrech a kontroluje jejich dohled.
 */
export function calculateRouteSafetyMetrics(routeCoordinates: [number, number][], safetyNodes: any[], isNight: boolean) {
  // Rozsekat trasu na body po cca 15 metrech pro přesný prostorový výpočet
  const densePoints: [number, number][] = [];
  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const p1 = routeCoordinates[i];
    const p2 = routeCoordinates[i + 1];
    const dist = getDistance(p1[0], p1[1], p2[0], p2[1]);
    const segments = Math.max(1, Math.floor(dist / 15));

    for (let j = 0; j < segments; j++) {
      const t = j / segments;
      densePoints.push([
        p1[0] + (p2[0] - p1[0]) * t,
        p1[1] + (p2[1] - p1[1]) * t
      ]);
    }
  }
  if (routeCoordinates.length > 0) {
    densePoints.push(routeCoordinates[routeCoordinates.length - 1]);
  }

  const totalPoints = densePoints.length || 1;

  // 1. Kamery: využijeme předané safetyNodes i rozsáhlou pražskou cache kamer
  const nodeCameras = (safetyNodes || []).filter((n: any) => n.type === 'camera');
  const allCameras = nodeCameras.length >= 10 ? nodeCameras : (pragueSafetyCache.cameras || []);

  let pointsUnderCamera = 0;
  const camerasNearby = new Set<string | number>();

  for (const point of densePoints) {
    const lat = point[0];
    const lng = point[1];

    let hasCamera = false;
    for (const cam of allCameras) {
      const camLat = Array.isArray(cam?.coords) ? cam.coords[0] : (cam?.lat ?? 0);
      const camLng = Array.isArray(cam?.coords) ? cam.coords[1] : (cam?.lng ?? 0);
      const range = cam?.radius || cam?.rangeMeters || 45;

      // Rychlý bbox check (cca 80m)
      if (Math.abs(camLat - lat) > 0.001 || Math.abs(camLng - lng) > 0.0015) continue;

      const d = getDistance(lat, lng, camLat, camLng);
      if (d <= range) {
        hasCamera = true;
      }
      if (d <= 55) {
        camerasNearby.add(cam.id);
      }
    }

    if (hasCamera) pointsUnderCamera++;
  }

  const cameraCoveragePercent = Math.round((pointsUnderCamera / totalPoints) * 100);
  const camerasNearbyCount = camerasNearby.size;

  // 2. Tmavé úseky (Dark segments):
  // Ve dne je přirozené světlo (0 tmavých úseků).
  // V noci standardní ulice v Praze osvětluje veřejné osvětlení; tmavé úseky tvoří neosvětlené parky a podchody.
  let unlitSegmentsCount = 0;
  let parkIntersectionCount = 0;
  const visitedParks = new Set<string>();

  if (isNight) {
    let consecutiveDark = 0;
    for (const point of densePoints) {
      let isDarkPoint = false;
      for (const zone of mockSafetyZones) {
        if ((zone.type === 'park' && !zone.factors.wellLit) || zone.type === 'underpass') {
          if (pointInPolygon([point[0], point[1]], zone.coordinates)) {
            isDarkPoint = true;
            visitedParks.add(zone.id);
            break;
          }
        }
      }

      if (isDarkPoint) {
        consecutiveDark++;
      } else {
        if (consecutiveDark >= 2) {
          unlitSegmentsCount++;
        }
        consecutiveDark = 0;
      }
    }
    if (consecutiveDark >= 2) {
      unlitSegmentsCount++;
    }
  } else {
    // Ve dne pouze zaznamenáme průchod parkem
    for (const point of densePoints) {
      for (const zone of mockSafetyZones) {
        if (zone.type === 'park' && pointInPolygon([point[0], point[1]], zone.coordinates)) {
          visitedParks.add(zone.id);
        }
      }
    }
  }

  parkIntersectionCount = visitedParks.size;

  // 3. Riziková místa (Unikátní incidenty do 80 m od geometrie trasy)
  const uniqueIncidents = new Set<string>();
  let maxIncidentSeverity = 0;

  for (const incident of incidentsData) {
    const incLat = incident.coordinates[0];
    const incLng = incident.coordinates[1];

    for (const point of densePoints) {
      if (Math.abs(incLat - point[0]) <= 0.0012 && Math.abs(incLng - point[1]) <= 0.0018) {
        if (getDistance(point[0], point[1], incLat, incLng) <= 80) {
          uniqueIncidents.add(incident.id);
          if (incident.severity > maxIncidentSeverity) {
            maxIncidentSeverity = incident.severity;
          }
          break;
        }
      }
    }
  }

  const riskSpotsCount = uniqueIncidents.size;

  // 4. Bezpečné body (Safe Havens)
  const havens = (safetyNodes || []).filter((n: any) => n.type === 'haven');
  const uniqueHavensNearby = new Set<string>();
  for (const haven of havens) {
    const hLat = Array.isArray(haven?.coords) ? haven.coords[0] : (haven?.lat ?? 0);
    const hLng = Array.isArray(haven?.coords) ? haven.coords[1] : (haven?.lng ?? 0);
    for (const point of densePoints) {
      if (Math.abs(hLat - point[0]) > 0.0015 || Math.abs(hLng - point[1]) > 0.002) continue;
      if (hLat !== 0 && getDistance(point[0], point[1], hLat, hLng) <= 70) {
        uniqueHavensNearby.add(haven.id);
        break;
      }
    }
  }
  const havensNearbyCount = uniqueHavensNearby.size;

  // 5. Výpočet Safety Score
  // Obytné ulice (Vinohrady, Vršovice apod.) mají základní vysokou bezpečnost (92 %)
  let score = 92;
  score += Math.min(cameraCoveragePercent * 0.15, 12);
  score += Math.min(havensNearbyCount * 4, 10);

  if (isNight && unlitSegmentsCount > 0) {
    score -= Math.min(25, unlitSegmentsCount * 12);
  }

  if (riskSpotsCount > 0) {
    score -= Math.min(30, riskSpotsCount * 10 + maxIncidentSeverity * 2);
  }

  return {
    cameraCoveragePercent,
    unlitSegmentsCount,
    uncontrolledCrossingsCount: 0,
    mainRoadPercent: Math.min(100, Math.max(30, 100 - unlitSegmentsCount * 25)),
    overallSafetyScore: Math.max(25, Math.min(98, Math.round(score))),
    camerasNearbyCount,
    hasSafeHaven: havensNearbyCount > 0,
    parkIntersectionCount,
    riskSpotsCount
  };
}

import { SafetyZone } from '../types/safety';

/**
 * Standard ray-casting algorithm to check if a point is inside a polygon.
 */
export function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  let isInside = false;
  const [lat, lng] = point;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    
    const intersect = ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  
  return isInside;
}

/**
 * Calculates dynamic safety score for a zone based on time of day and community rating.
 */
export function getDynamicZoneScore(zone: SafetyZone, timeOfDay: number): number {
  let score = zone.baseScore;
  const isNight = timeOfDay >= 17 || timeOfDay <= 6;
  
  // Vliv historie incidentů
  score -= zone.factors.incidentPenalty;
  
  // Vliv komunitního hodnocení (1-5 hvězd -> -20 až +20 bodů)
  if (zone.factors.userReportsCount > 0) {
    const ratingImpact = (zone.factors.userRating - 3) * 10;
    score += ratingImpact;
  }

  if (isNight) {
    // Drastický propad u parků a podchodů v noci
    if (zone.type === 'park' || zone.type === 'underpass') {
      score -= 40;
    }
  }
  
  if (zone.factors.cameraCoverage) score += 10;
  if (zone.factors.wellLit) score += 5;
  if (zone.factors.sosNearby) score += 10;
  
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Calculates safety of an arbitrary location based on its surroundings.
 */
export function calculateLocationSafety(
  lat: number,
  lng: number,
  timeOfDay: number,
  cameras: SafetyFeature[],
  havens: SafetyFeature[]
) {
  const isNight = timeOfDay >= 17 || timeOfDay <= 6;

  // Výchozí baseline pro běžnou ulici: 95 %
  let score = 95;

  // Hledání kamer (do 60m)
  let cameraCount = 0;
  if (cameras && Array.isArray(cameras)) {
    for (const cam of cameras) {
      const pos = cam?.coords as any;
      const camLat = Array.isArray(pos) ? pos[0] : (pos?.lat ?? 0);
      const camLng = Array.isArray(pos) ? pos[1] : (pos?.lng ?? 0);
      if (camLat !== 0 && getDistance(lat, lng, camLat, camLng) <= 60) {
        cameraCount++;
      }
    }
  }

  // Přítomnost MKS kamery zvyšuje skóre na 99-100 %. Absence kamery nestrhává skóre.
  if (cameraCount > 0) {
    score = Math.min(100, score + cameraCount * 4);
  } else {
    score = Math.max(90, score - 0);
  }

  // Hledání SOS bodů (do 150m)
  let havenCount = 0;
  if (havens && Array.isArray(havens)) {
    for (const haven of havens) {
      const pos = haven?.coords as any;
      const hLat = Array.isArray(pos) ? pos[0] : (pos?.lat ?? 0);
      const hLng = Array.isArray(pos) ? pos[1] : (pos?.lng ?? 0);
      if (hLat !== 0 && getDistance(lat, lng, hLat, hLng) <= 150) {
        havenCount++;
      }
    }
  }

  // Hledání incidentů (do 200m)
  let incidentPenalty = 0;
  const nearbyIncidents: any[] = [];
  if (incidentsData && Array.isArray(incidentsData)) {
    for (const incident of incidentsData) {
      const pos = incident?.coordinates as any;
      const incLat = Array.isArray(pos) ? pos[0] : (pos?.lat ?? 0);
      const incLng = Array.isArray(pos) ? pos[1] : (pos?.lng ?? 0);

      if (incLat !== 0 && incLng !== 0) {
        const dist = getDistance(lat, lng, incLat, incLng);
        if (dist <= 200) {
          nearbyIncidents.push(incident);
          incidentPenalty += (incident.severity || 0) * (isNight && incident.time_of_day === 'noc' ? 2 : 1.2);
        }
      }
    }
  }

  // Incidenty a rizika srážejí body dolů.
  if (nearbyIncidents.length > 0) {
    score -= Math.min(30, nearbyIncidents.length * 10);
  }

  if (isNight && nearbyIncidents.length > 0) {
    score -= 20;
  }

  // Rizikové zóny / podchody / parky v noci: další propad.
  const isRiskyNightLocation = isNight && nearbyIncidents.some(incident => incident.severity >= 5 || incident.time_of_day === 'noc');
  if (isRiskyNightLocation) {
    score -= 20;
  }

  // Pokud je místo normální ulice bez incidentů, zachovej základ 90-95 %.
  if (nearbyIncidents.length === 0) {
    score = Math.max(90, Math.min(98, score));
  }

  // Mírně pochybná / tmavší ulička: 65-75 %
  if (nearbyIncidents.length === 0 && isNight && cameraCount === 0 && havenCount === 0) {
    score = Math.max(65, Math.min(75, score));
  }

  // Kritické zóny: 10-25 %
  if (nearbyIncidents.some(incident => incident.severity >= 8) || isRiskyNightLocation) {
    score = Math.min(25, score);
  }

  let envType = 'Běžná zástavba';
  if (cameraCount >= 2 || havenCount >= 1) {
    envType = 'Hlavní ulice / Uzel';
  } else if (nearbyIncidents.length > 0) {
    envType = 'Riziková zóna';
  } else if (cameraCount === 0 && !isNight) {
    envType = 'Klidná rezidenční zóna';
  }

  return {
    score: Math.max(10, Math.min(100, Math.round(score))),
    cameraCount,
    havenCount,
    incidentCount: nearbyIncidents.length,
    incidents: nearbyIncidents,
    envType
  };
}

export function getSafetyRiskLabel(score: number): string {
  if (score >= 85) return 'Bezpečná zóna';
  if (score >= 40) return 'Střední riziko';
  return 'Vysoké riziko';
}
