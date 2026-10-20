import type { OSMSurveillanceFeature } from './cameras';

const R = 6378137;
const toRad = (deg: number) => deg * Math.PI / 180;
const toDeg = (rad: number) => rad * 180 / Math.PI;

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const l1 = toRad(lat1);
  const l2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function parseDirection(directionStr: string | undefined): number | null {
  if (!directionStr) return null;
  const d = directionStr.trim().toUpperCase();
  const dirMap: Record<string, number> = {
    'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5, 'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
    'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5, 'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5
  };
  if (dirMap[d] !== undefined) return dirMap[d];
  const num = parseFloat(d);
  if (!isNaN(num) && num >= 0 && num <= 360) return num;
  return null;
}

export {
  fetchOSMCameras,
  fetchPragueCameras,
  getStaticCameras
} from './cameras';
export type { OSMSurveillanceFeature, CameraFeature } from './cameras';
