import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bounding box for Prague
const MIN_LAT = 49.94;
const MAX_LAT = 50.18;
const MIN_LNG = 14.20;
const MAX_LNG = 14.72;

function getRandomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function processNodes() {
  const cache = {
    cameras: [],
    sosHavens: [],
    lastUpdated: new Date().toISOString()
  };

  console.log("Generuji 5000 kamer pro pokrytí celé Prahy...");

  for (let id = 1; id <= 5000; id++) {
    const type = Math.random() > 0.7 ? 'ptz' : (Math.random() > 0.5 ? 'dome' : 'fixed');
    let direction = Math.floor(Math.random() * 360);
    
    let radius = 40;
    let angle = 60;
    if (type === 'ptz') {
      radius = 60;
      angle = 360;
    } else if (type === 'dome') {
      radius = 35;
      angle = 360;
    }

    cache.cameras.push({
      id: id,
      lat: getRandomInRange(MIN_LAT, MAX_LAT),
      lng: getRandomInRange(MIN_LNG, MAX_LNG),
      type: type,
      direction: direction,
      angle: angle,
      rangeMeters: radius,
      description: "Městský kamerový systém (AI MOCK)"
    });
  }

  console.log("Generuji 150 SOS záchytných bodů...");
  for (let id = 1; id <= 150; id++) {
    const havenType = Math.random() > 0.6 ? 'police' : (Math.random() > 0.5 ? 'fire' : 'pharmacy');
    let is247 = true;
    if (havenType === 'pharmacy' && Math.random() > 0.5) {
      is247 = false;
    }
    
    cache.sosHavens.push({
      id: id,
      lat: getRandomInRange(MIN_LAT, MAX_LAT),
      lng: getRandomInRange(MIN_LNG, MAX_LNG),
      name: havenType === 'police' ? 'Policie ČR' : (havenType === 'fire' ? 'Hasičská záchranná stanice' : 'Lékárna'),
      type: havenType,
      is247: is247,
      phone: "112"
    });
  }

  return cache;
}

async function main() {
  try {
    const cache = processNodes();

    const outPath = path.join(__dirname, '..', 'src', 'data', 'prague_safety_cache.json');
    fs.writeFileSync(outPath, JSON.stringify(cache, null, 2), 'utf-8');

    console.log(`\nSuccessfully saved to ${outPath}`);
    console.log(`Total Cameras: ${cache.cameras.length}`);
    console.log(`Total SOS Havens: ${cache.sosHavens.length}`);
  } catch (err) {
    console.error("Failed to populate cache:", err);
  }
}

main();
