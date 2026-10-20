import fs from 'fs';
import path from 'path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const minLat = 50.00, minLng = 14.22, maxLat = 50.18, maxLng = 14.70;
const R = 6378137;
const toRad = (deg) => deg * Math.PI / 180;
const toDeg = (rad) => rad * 180 / Math.PI;

function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBearing(lat1, lon1, lat2, lon2) {
  const l1 = toRad(lat1);
  const l2 = toRad(lat2);
  const dl = toRad(lon2 - lon1);
  const y = Math.sin(dl) * Math.cos(l2);
  const x = Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function parseDirection(directionStr) {
  if (!directionStr) return null;
  const d = directionStr.trim().toUpperCase();
  const dirMap = {
    'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5, 'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
    'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5, 'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5
  };
  if (dirMap[d] !== undefined) return dirMap[d];
  const num = parseFloat(d);
  if (!isNaN(num) && num >= 0 && num <= 360) return num;
  return null;
}

async function myFetch(query) {
  const response = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query), {
    method: 'GET',
    headers: { 
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'SafePathApp-Generator/1.0 (test@example.com)'
    }
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse JSON. Response was:", text.substring(0, 500));
    throw e;
  }
}

async function fetchCameras() {
  const query = `
    [out:json][timeout:60];
    node["man_made"="surveillance"](${minLat},${minLng},${maxLat},${maxLng})->.cameras;
    .cameras out body;
    way(around.cameras:50)["highway"]->.streets;
    .streets out body;
    >;
    out skel qt;
  `;
  const data = await myFetch(query);
  
  const cameraNodes = [];
  const ways = [];
  const wayNodesMap = new Map();

  for (const element of data.elements) {
    if (element.type === 'node' && element.tags && element.tags['man_made'] === 'surveillance') {
      cameraNodes.push(element);
    } else if (element.type === 'node') {
      wayNodesMap.set(element.id, { lat: element.lat, lon: element.lon });
    } else if (element.type === 'way' && element.tags && element.tags['highway']) {
      ways.push(element);
    }
  }

  const cameras = [];
  for (const cam of cameraNodes) {
    const tags = cam.tags || {};
    const rawType = tags['camera:type'] || 'unknown';
    let direction = parseDirection(tags['camera:direction'] || tags['direction']);
    let type = 'unknown';
    let angle = 70;
    let range = 45;

    if (rawType.includes('ptz')) {
      type = 'ptz'; angle = 360; direction = null; range = 60;
    } else if (rawType.includes('dome')) {
      type = 'dome'; angle = 360; direction = null; range = 35;
    } else {
      type = 'bullet';
      angle = tags['camera:angle'] ? parseFloat(tags['camera:angle']) : 70;
      if (isNaN(angle)) angle = 70;
      range = 45;

      if (direction === null) {
        let closestDist = Infinity;
        let bestBearing = 0;
        for (const way of ways) {
          if (!way.nodes) continue;
          for (let i = 0; i < way.nodes.length - 1; i++) {
            const n1 = wayNodesMap.get(way.nodes[i]);
            const n2 = wayNodesMap.get(way.nodes[i+1]);
            if (!n1 || !n2) continue;
            const midLat = (n1.lat + n2.lat) / 2;
            const midLon = (n1.lon + n2.lon) / 2;
            const dist = getDistanceMeters(cam.lat, cam.lon, midLat, midLon);
            if (dist < closestDist) {
              closestDist = dist;
              bestBearing = getBearing(n1.lat, n1.lon, n2.lat, n2.lon);
              const distToN1 = getDistanceMeters(cam.lat, cam.lon, n1.lat, n1.lon);
              const distToN2 = getDistanceMeters(cam.lat, cam.lon, n2.lat, n2.lon);
              if (distToN2 < distToN1) {
                bestBearing = (bestBearing + 180) % 360;
              }
            }
          }
        }
        if (closestDist < 50) {
          direction = Math.round(bestBearing);
        } else {
          angle = 360;
          range = 35;
        }
      }
    }
    cameras.push({
      id: cam.id, lat: cam.lat, lng: cam.lon, type, direction, angle, rangeMeters: range,
      description: tags['name'] || tags['description'] || `MKS/OSM Kamera #${cam.id}`
    });
  }
  return cameras;
}

async function fetchHavens() {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="police"](${minLat},${minLng},${maxLat},${maxLng});
      way["amenity"="police"](${minLat},${minLng},${maxLat},${maxLng});
      node["amenity"="fire_station"](${minLat},${minLng},${maxLat},${maxLng});
      way["amenity"="fire_station"](${minLat},${minLng},${maxLat},${maxLng});
      node["amenity"="pharmacy"](${minLat},${minLng},${maxLat},${maxLng});
      way["amenity"="pharmacy"](${minLat},${minLng},${maxLat},${maxLng});
    );
    out center;
  `;
  const data = await myFetch(query);
  const havens = [];
  for (const element of data.elements) {
    const lat = element.lat || element.center?.lat;
    const lon = element.lon || element.center?.lon;
    if (!lat || !lon) continue;
    const tags = element.tags || {};
    const amenity = tags['amenity'];
    let type = 'pharmacy';
    if (amenity === 'police') type = 'police';
    if (amenity === 'fire_station') type = 'fire_station';
    const is247 = tags['opening_hours'] === '24/7' || tags['emergency'] === 'yes';
    havens.push({
      id: element.id, lat, lng: lon, type,
      name: tags['name'] || (type === 'police' ? 'Policie ČR/MP' : type === 'fire_station' ? 'Hasiči' : 'Lékárna'),
      is247, phone: tags['phone'] || tags['contact:phone']
    });
  }
  return havens;
}

async function run() {
  console.log("Fetching cameras...");
  const cameras = await fetchCameras();
  console.log("Fetching havens...");
  const havens = await fetchHavens();
  const output = {
    cameras,
    safeHavens: havens
  };
  fs.mkdirSync('./src/data', { recursive: true });
  fs.writeFileSync('./src/data/prague_safety_cache.json', JSON.stringify(output, null, 2));
  console.log("Saved prague_safety_cache.json");
}

run();
