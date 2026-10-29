/**
 * Bezpečnostní body podél trasy (semafory, MKS kamery, přechody, safe havens, riziková místa).
 * Přísný prostorový koridorový filtr na vyžádání.
 */

import pragueSafetyCache from '../data/prague_safety_cache.json';

export type SafetyPointType = 'traffic_signal' | 'crossing' | 'camera' | 'safe_haven' | 'hazard' | 'light';

export interface SafetyPoint {
  id: string | number;
  lat: number;
  lng: number;
  type: SafetyPointType;
  title: string;
  description?: string;
  safetyInfo?: string;
  is247?: boolean;
  phone?: string;
  direction?: number; // azimut natočení kamery (0-360 stupňů)
  fovAngle?: number;  // šířka zorného pole (např. 60 stupňů)
  rangeMeters?: number; // dosah kamery
  severity?: number;
  details?: Record<string, any>;
}

/**
 * Spočítá přesnou kolmou vzdálenost bodu od linie trasy v metrech.
 */
export function getDistanceToPolylineMeters(
  point: { lat: number; lng: number },
  routeCoords: [number, number][]
): number {
  if (!routeCoords || routeCoords.length < 2) return Infinity;

  // Normalizace souřadnic bodu pro ČR (lat ~50, lng ~14)
  const pLat = point.lat > 30 ? point.lat : point.lng;
  const pLng = point.lat > 30 ? point.lng : point.lat;

  let minDistance = Infinity;

  // Přepočet stupňů zeměpisné šířky a délky na metry v okolí Prahy (lat ~50.08)
  const latToM = 110540;
  const lngToM = Math.cos((pLat * Math.PI) / 180) * 111320;

  const px = pLng * lngToM;
  const py = pLat * latToM;

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const cA = routeCoords[i];
    const cB = routeCoords[i + 1];

    const aLng = cA[0] > 30 ? cA[1] : cA[0];
    const aLat = cA[0] > 30 ? cA[0] : cA[1];
    const bLng = cB[0] > 30 ? cB[1] : cB[0];
    const bLat = cB[0] > 30 ? cB[0] : cB[1];

    const ax = aLng * lngToM;
    const ay = aLat * latToM;
    const bx = bLng * lngToM;
    const by = bLat * latToM;

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let dist = 0;
    if (lenSq === 0) {
      const dpx = px - ax;
      const dpy = py - ay;
      dist = Math.sqrt(dpx * dpx + dpy * dpy);
    } else {
      // Projekce bodu na úsečku AB: parametr t oříznutý mezi 0 a 1
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
      const projX = ax + t * dx;
      const projY = ay + t * dy;
      const dpx = px - projX;
      const dpy = py - projY;
      dist = Math.sqrt(dpx * dpx + dpy * dpy);
    }

    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance;
}

/**
 * Ověří, zda bod leží v definovaném koridoru (výchozí 60 metrů od zelené linie).
 */
export function isPointNearRoute(
  point: { lat: number; lng: number },
  routeCoords: [number, number][],
  maxDistanceMeters = 60
): boolean {
  if (!routeCoords || routeCoords.length < 2) return false;
  return getDistanceToPolylineMeters(point, routeCoords) <= maxDistanceMeters;
}

/**
 * Vybere POUZE body, jejichž kolmá vzdálenost od zelené čáry je menší než maxDistanceMeters (výchozí 60m).
 */
export function getSafetyPointsAlongRoute(
  routeCoords: [number, number][],
  allPoints: SafetyPoint[],
  maxDistanceMeters = 60
): SafetyPoint[] {
  if (!routeCoords || routeCoords.length < 2) return [];
  return allPoints.filter(point => isPointNearRoute(point, routeCoords, maxDistanceMeters));
}

/**
 * Sestaví sjednocený seznam bezpečnostních prvků ze všech dostupných datových zdrojů
 */
export function buildSafetyPointsCollection(options: {
  snappedCrossings?: any[];
  staticCrossings?: any[];
  osmCameras?: any[];
  safetyNodes?: any[];
  staticCameras?: any[];
  safeHavens?: any[];
  incidents?: any[];
}): SafetyPoint[] {
  const points: SafetyPoint[] = [];
  const seenKeys = new Set<string>();

  const addPoint = (pt: SafetyPoint) => {
    // Deduplikace podle přibližné polohy (cca 12 metrů) a typu
    const key = `${pt.type}_${pt.lat.toFixed(4)}_${pt.lng.toFixed(4)}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    points.push(pt);
  };

  // 1. Zmapované přechody a semafory na trase
  if (options.snappedCrossings && Array.isArray(options.snappedCrossings)) {
    options.snappedCrossings.forEach((c, idx) => {
      const isSignal = Boolean(c.hasSignals || c.crossingType === 'traffic_signals');
      addPoint({
        id: c.id ?? `snap_cross_${idx}`,
        lat: c.lat,
        lng: c.lng,
        type: isSignal ? 'traffic_signal' : 'crossing',
        title: isSignal ? 'Světelně řízený semafor' : 'Bezpečný přechod pro chodce',
        description: c.streetName ? `Ulice ${c.streetName}` : 'Chráněné místo pro přecházení',
        safetyInfo: isSignal ? 'Akustická signalizace a světelné řízení' : 'Přehledné vodorovné značení a snížená rychlost'
      });
    });
  }

  // 2. Statické přechody z databáze Prahy
  if (options.staticCrossings && Array.isArray(options.staticCrossings)) {
    options.staticCrossings.forEach((c, idx) => {
      const isSignal = Boolean(c.hasSignals || c.crossingType === 'traffic_signals');
      addPoint({
        id: c.id ?? `static_cross_${idx}`,
        lat: c.lat,
        lng: c.lng,
        type: isSignal ? 'traffic_signal' : 'crossing',
        title: isSignal ? 'Světelně řízený přechod' : 'Přechod pro chodce',
        description: c.streetName ? `Ulice ${c.streetName}` : 'Ověřený přechodový bod',
        safetyInfo: isSignal ? 'Světelná signalizace pro chodce' : 'Značený přechod'
      });
    });
  }

  // 3. Statické kamery s definovaným azimutem a zorným polem
  if (options.staticCameras && Array.isArray(options.staticCameras)) {
    options.staticCameras.forEach((cam, idx) => {
      addPoint({
        id: cam.id ?? `static_cam_${idx}`,
        lat: cam.lat,
        lng: cam.lng,
        type: 'camera',
        title: `MKS Kamera #${cam.id || idx + 1}`,
        description: cam.description || 'Městský kamerový systém hl. m. Prahy',
        safetyInfo: 'Pod stálým dohledem PČR a operačního střediska',
        direction: typeof cam.direction === 'number' ? cam.direction : undefined,
        fovAngle: typeof cam.angle === 'number' ? cam.angle : 60,
        rangeMeters: typeof cam.rangeMeters === 'number' ? cam.rangeMeters : 45
      });
    });
  }

  // 3b. Rozsáhlá databáze pražských kamer (2541 MKS kamer)
  if (pragueSafetyCache && Array.isArray((pragueSafetyCache as any).cameras)) {
    ((pragueSafetyCache as any).cameras as any[]).forEach((cam, idx) => {
      addPoint({
        id: cam.id ?? `cache_cam_${idx}`,
        lat: cam.lat,
        lng: cam.lng,
        type: 'camera',
        title: `MKS Kamera #${cam.id || idx + 1}`,
        description: cam.description || 'Městský kamerový systém hl. m. Prahy',
        safetyInfo: 'Stálý záznam PČR',
        direction: typeof cam.direction === 'number' ? cam.direction : undefined
      });
    });
  }

  // 4. OSM dohledové kamery
  if (options.osmCameras && Array.isArray(options.osmCameras)) {
    options.osmCameras.forEach((cam, idx) => {
      addPoint({
        id: cam.id ?? `osm_cam_${idx}`,
        lat: cam.lat,
        lng: cam.lng,
        type: 'camera',
        title: `Dohledová kamera MKS #${cam.id || idx + 1}`,
        description: cam.operator || 'Městský kamerový systém hl. m. Prahy',
        safetyInfo: 'Pod stálým dohledem PČR a Městské policie',
        direction: typeof cam.direction === 'number' ? cam.direction : undefined
      });
    });
  }

  // 5. Bezpečnostní uzly s kamerami
  if (options.safetyNodes && Array.isArray(options.safetyNodes)) {
    options.safetyNodes.forEach((node, idx) => {
      if (node.type === 'camera' && node.coords && node.coords.length >= 2) {
        addPoint({
          id: node.id ?? `node_cam_${idx}`,
          lat: node.coords[0],
          lng: node.coords[1],
          type: 'camera',
          title: `Dohledová kamera MKS #${node.id || idx + 1}`,
          description: 'Městský kamerový systém hl. m. Prahy',
          safetyInfo: 'Pod stálým dohledem PČR'
        });
      }
    });
  }

  // 6. Safe Havens (Záchranné stanice, lékárny, policejní služebny)
  if (options.safeHavens && Array.isArray(options.safeHavens)) {
    options.safeHavens.forEach((h, idx) => {
      const is247 = Boolean(h.is247);
      addPoint({
        id: h.id ?? `haven_${idx}`,
        lat: h.lat,
        lng: h.lng,
        type: 'safe_haven',
        title: h.name || 'Safe Haven (Nouzový úkryt)',
        description: `Typ: ${h.type || 'Pohotovostní bod'}${h.phone ? ` • Tel: ${h.phone}` : ''}`,
        safetyInfo: is247 ? '⚡ 24/7 Nepřetržitá pomoc a asistence' : 'Ověřené bezpečné útočiště na trase',
        is247,
        phone: h.phone
      });
    });
  }

  // 7. Riziková místa (Hrozby / Kolizní body z nehodové databáze PČR / CDV)
  if (options.incidents && Array.isArray(options.incidents)) {
    options.incidents.forEach((inc, idx) => {
      const coords = inc.coordinates;
      if (Array.isArray(coords) && coords.length >= 2) {
        addPoint({
          id: inc.id ?? `incident_${idx}`,
          lat: coords[0],
          lng: coords[1],
          type: 'hazard',
          title: inc.title || 'Rizikové místo (Hrozba)',
          description: inc.summary || inc.location_name || 'Evidované kolizní či nepřehledné místo',
          safetyInfo: inc.recommendation || 'Doporučena zvýšená opatrnost a pozornost',
          severity: inc.severity ?? 5
        });
      }
    });
  }

  return points;
}
