import fs from 'fs';

const minLat = 50.05;
const maxLat = 50.10;
const minLng = 14.38;
const maxLng = 14.48;

const cameras = [];
let idCounter = 1;

for (let i = 0; i < 300; i++) {
  const lat = minLat + Math.random() * (maxLat - minLat);
  const lng = minLng + Math.random() * (maxLng - minLng);
  const type = Math.random() > 0.3 ? 'bullet' : (Math.random() > 0.5 ? 'dome' : 'ptz');
  const angle = type === 'bullet' ? 70 : 360;
  const direction = type === 'bullet' ? Math.floor(Math.random() * 360) : null;
  const rangeMeters = type === 'ptz' ? 60 : 45;
  
  cameras.push({
    id: idCounter++,
    lat,
    lng,
    type,
    direction,
    angle,
    rangeMeters,
    description: `MKS Kamera #${idCounter}`
  });
}

const havens = [];
for (let i = 0; i < 20; i++) {
  const lat = minLat + Math.random() * (maxLat - minLat);
  const lng = minLng + Math.random() * (maxLng - minLng);
  const r = Math.random();
  let type = 'pharmacy';
  let name = 'Lékárna';
  let is247 = false;
  
  if (r < 0.2) {
    type = 'police';
    name = 'Policie ČR/MP';
    is247 = true;
  } else if (r < 0.4) {
    type = 'fire_station';
    name = 'Hasiči';
    is247 = true;
  } else if (r < 0.6) {
    name = 'Non-stop Lékárna';
    is247 = true;
  }
  
  havens.push({
    id: idCounter++,
    lat,
    lng,
    type,
    name,
    is247,
    phone: is247 ? '158' : undefined
  });
}

const output = {
  cameras,
  safeHavens: havens
};

fs.mkdirSync('./src/data', { recursive: true });
fs.writeFileSync('./src/data/prague_safety_cache.json', JSON.stringify(output, null, 2));
console.log("Mock cache generated with " + cameras.length + " cameras.");
