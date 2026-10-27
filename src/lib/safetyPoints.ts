/**
 * Bezpečnostní body podél trasy (semafory, MKS kamery, přechody, safe havens).
 * Dynamický spatial filtr podél koridoru trasy.
 */

export type SafetyPointType = 'traffic_signal' | 'crossing' | 'camera' | 'safe_haven' | 'light';

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
  details?: Record<string, any>;
}

/**
 * Výpočet vzdálenosti bodu od linie trasy a vyfiltrování relevantních prvků
 * Maximální odstup od linie koridoru trasy je ve výchozím stavu 45 metrů.
 */
export function getSafetyPointsAlongRoute(
  routeCoords: [number, number][],
  allPoints: SafetyPoint[],
  maxDistanceMeters = 45
): SafetyPoint[] {
  if (!routeCoords || routeCoords.length < 2) return [];
  return allPoints.filter(point => {
    return routeCoords.some(coord => {
      // coord je [lng, lat]
      // Rychlý euklidovský odhad vzdálenosti v metrech
      const dLng = (point.lng - coord[0]) * Math.cos((coord[1] * Math.PI) / 180) * 111320;
      const dLat = (point.lat - coord[1]) * 110540;
      return Math.sqrt(dLng * dLng + dLat * dLat) <= maxDistanceMeters;
    });
  });
}

/**
 * Sestaví sjednocený seznam bezpečnostních bodů ze všech dostupných datových zdrojů
 */
export function buildSafetyPointsCollection(options: {
  snappedCrossings?: any[];
  staticCrossings?: any[];
  osmCameras?: any[];
  safetyNodes?: any[];
  staticCameras?: any[];
  safeHavens?: any[];
}): SafetyPoint[] {
  const points: SafetyPoint[] = [];
  const seenKeys = new Set<string>();

  const addPoint = (pt: SafetyPoint) => {
    // Deduplikace podle přibližné polohy (cca 10 metrů) a typu
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

  // 3. OSM dohledové kamery
  if (options.osmCameras && Array.isArray(options.osmCameras)) {
    options.osmCameras.forEach((cam, idx) => {
      addPoint({
        id: cam.id ?? `osm_cam_${idx}`,
        lat: cam.lat,
        lng: cam.lng,
        type: 'camera',
        title: `Dohledová kamera MKS #${cam.id || idx + 1}`,
        description: cam.operator || 'Městský kamerový systém hl. m. Prahy',
        safetyInfo: 'Pod stálým dohledem PČR a Městské policie'
      });
    });
  }

  // 4. Bezpečnostní uzly s kamerami
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

  // 5. Statické kamery
  if (options.staticCameras && Array.isArray(options.staticCameras)) {
    options.staticCameras.forEach((cam, idx) => {
      addPoint({
        id: cam.id ?? `static_cam_${idx}`,
        lat: cam.lat,
        lng: cam.lng,
        type: 'camera',
        title: `Dohledová kamera MKS #${cam.id || idx + 1}`,
        description: cam.description || 'Kamerový systém hl. m. Prahy',
        safetyInfo: 'Pod stálým dohledem PČR a operačního střediska'
      });
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
        title: h.name || 'Safe Haven (Bezpečný přístav)',
        description: `Typ: ${h.type || 'Pohotovostní bod'}${h.phone ? ` • Tel: ${h.phone}` : ''}`,
        safetyInfo: is247 ? '⚡ 24/7 Nepřetržitá pomoc a asistence' : 'Ověřené bezpečné útočiště pro děti a chodce',
        is247,
        phone: h.phone
      });
    });
  }

  return points;
}
