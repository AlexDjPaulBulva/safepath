import { OSMSurveillanceFeature } from './osm-surveillance-harvester';
import { RouteSegment } from './routing';

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => deg * Math.PI / 180;
  const toDeg = (rad: number) => rad * 180 / Math.PI;
  const l1 = toRad(lat1);
  const l2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

export function calculateFOVPolygon(
  camera: OSMSurveillanceFeature, 
  routeSegments?: RouteSegment[],
  customRadiusMeters: number = 25
): [number, number][] {
  const safeRadius = customRadiusMeters; // standardně 25 metrů
  const lat = camera.lat;
  const lng = camera.lng;
  const radiusMeters = safeRadius;
  
  let bearingDeg = camera.direction !== null ? camera.direction : 0;
  
  // Smart Snapping to Route if direction is missing
  if (camera.direction === null && camera.type !== 'ptz' && routeSegments && routeSegments.length > 0) {
    let minDist = Infinity;
    let closestPoint: [number, number] | null = null;
    for (const segment of routeSegments) {
      for (const coord of segment.coordinates) {
        const d = getDistance(lat, lng, coord[0], coord[1]);
        if (d < minDist) {
          minDist = d;
          closestPoint = coord;
        }
      }
    }
    if (closestPoint) {
      bearingDeg = getBearing(lat, lng, closestPoint[0], closestPoint[1]);
    }
  }

  // Odstranění kruhů: Všechny kamery na mapě budou používat jednotnou 65° výseč
  const fovAngleDeg = 65;
  
  const points: [number, number][] = [[lat, lng]];
  
  const startAngle = bearingDeg - fovAngleDeg / 2;
  const endAngle = bearingDeg + fovAngleDeg / 2;
  const step = 5;

  for (let angle = startAngle; angle <= endAngle; angle += step) {
    const rad = (angle * Math.PI) / 180;
    // Přibližný přepočet (1 stupeň lat ≈ 111320m)
    const dLat = (radiusMeters / 111320) * Math.cos(rad);
    const dLng = (radiusMeters / (111320 * Math.cos(lat * Math.PI / 180))) * Math.sin(rad);
    points.push([lat + dLat, lng + dLng]);
  }
  // Zpět do středu (pro bezpečné uzavření polygonu)
  points.push([lat, lng]);

  return points;
}
