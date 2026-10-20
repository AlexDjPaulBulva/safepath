import { SafetyZone } from '../types/safety';

function createRectPolygon(lat: number, lng: number, radiusX: number, radiusY: number): [number, number][] {
  return [
    [lat - radiusX, lng - radiusY],
    [lat + radiusX, lng - radiusY],
    [lat + radiusX, lng + radiusY],
    [lat - radiusX, lng + radiusY],
    [lat - radiusX, lng - radiusY]
  ];
}

export const mockSafetyZones: SafetyZone[] = [
  // PARKY (Rizikové v noci)
  {
    id: 'zone-riegrak',
    name: 'Riegrovy sady',
    type: 'park',
    coordinates: createRectPolygon(50.0815, 14.4422, 0.003, 0.004),
    baseScore: 85,
    factors: { cameraCoverage: false, wellLit: false, sosNearby: false, incidentPenalty: 15, userRating: 4.2, userReportsCount: 15 }
  },
  {
    id: 'zone-vitkov',
    name: 'Vítkov',
    type: 'park',
    coordinates: createRectPolygon(50.088, 14.455, 0.002, 0.007),
    baseScore: 70,
    factors: { cameraCoverage: false, wellLit: false, sosNearby: false, incidentPenalty: 25, userRating: 3.8, userReportsCount: 22 }
  },
  {
    id: 'zone-letna',
    name: 'Letenské sady',
    type: 'park',
    coordinates: createRectPolygon(50.096, 14.417, 0.004, 0.008),
    baseScore: 75,
    factors: { cameraCoverage: false, wellLit: false, sosNearby: false, incidentPenalty: 10, userRating: 4.5, userReportsCount: 45 }
  },
  {
    id: 'zone-stromovka',
    name: 'Stromovka',
    type: 'park',
    coordinates: createRectPolygon(50.106, 14.419, 0.006, 0.010),
    baseScore: 80,
    factors: { cameraCoverage: false, wellLit: false, sosNearby: false, incidentPenalty: 5, userRating: 4.8, userReportsCount: 88 }
  },
  {
    id: 'zone-folimanka',
    name: 'Folimanka',
    type: 'park',
    coordinates: createRectPolygon(50.067, 14.430, 0.002, 0.004),
    baseScore: 60,
    factors: { cameraCoverage: false, wellLit: false, sosNearby: false, incidentPenalty: 35, userRating: 3.1, userReportsCount: 12 }
  },
  {
    id: 'zone-grebovka',
    name: 'Havlíčkovy sady (Grébovka)',
    type: 'park',
    coordinates: createRectPolygon(50.069, 14.445, 0.003, 0.005),
    baseScore: 85,
    factors: { cameraCoverage: false, wellLit: true, sosNearby: false, incidentPenalty: 5, userRating: 4.6, userReportsCount: 50 }
  },

  // UZLY (Dopravní a náměstí)
  {
    id: 'zone-sherwood',
    name: 'Vrchlického sady (Sherwood)',
    type: 'transit_hub',
    coordinates: createRectPolygon(50.0835, 14.4330, 0.0015, 0.002),
    baseScore: 45,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 40, userRating: 2.1, userReportsCount: 120 }
  },
  {
    id: 'zone-florenc',
    name: 'Florenc',
    type: 'transit_hub',
    coordinates: createRectPolygon(50.089, 14.440, 0.002, 0.003),
    baseScore: 50,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 30, userRating: 2.8, userReportsCount: 80 }
  },
  {
    id: 'zone-andel',
    name: 'Anděl',
    type: 'transit_hub',
    coordinates: createRectPolygon(50.072, 14.403, 0.002, 0.003),
    baseScore: 65,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 25, userRating: 3.5, userReportsCount: 95 }
  },
  {
    id: 'zone-palmovka',
    name: 'Palmovka',
    type: 'transit_hub',
    coordinates: createRectPolygon(50.104, 14.474, 0.002, 0.003),
    baseScore: 48,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 35, userRating: 2.5, userReportsCount: 65 }
  },
  {
    id: 'zone-karlovo',
    name: 'Karlovo náměstí',
    type: 'park',
    coordinates: createRectPolygon(50.076, 14.420, 0.003, 0.002),
    baseScore: 70,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 20, userRating: 3.9, userReportsCount: 110 }
  },
  {
    id: 'zone-miru',
    name: 'Náměstí Míru',
    type: 'transit_hub',
    coordinates: createRectPolygon(50.075, 14.437, 0.0015, 0.0015),
    baseScore: 95,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 2, userRating: 4.8, userReportsCount: 200 }
  },

  // ČTVRTĚ (Bloky a ulice)
  {
    id: 'zone-vinohrady',
    name: 'Vinohrady',
    type: 'street',
    coordinates: createRectPolygon(50.076, 14.444, 0.008, 0.010),
    baseScore: 90,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 5, userRating: 4.7, userReportsCount: 350 }
  },
  {
    id: 'zone-karlin',
    name: 'Karlín',
    type: 'street',
    coordinates: createRectPolygon(50.092, 14.453, 0.004, 0.008),
    baseScore: 88,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 8, userRating: 4.6, userReportsCount: 220 }
  },
  {
    id: 'zone-zizkov',
    name: 'Žižkov',
    type: 'street',
    coordinates: createRectPolygon(50.084, 14.455, 0.006, 0.008),
    baseScore: 75,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 18, userRating: 3.8, userReportsCount: 180 }
  },
  {
    id: 'zone-holesovice',
    name: 'Holešovice',
    type: 'street',
    coordinates: createRectPolygon(50.103, 14.438, 0.006, 0.010),
    baseScore: 82,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 12, userRating: 4.2, userReportsCount: 140 }
  },
  {
    id: 'zone-smichov',
    name: 'Smíchov',
    type: 'street',
    coordinates: createRectPolygon(50.068, 14.405, 0.007, 0.006),
    baseScore: 78,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 15, userRating: 4.0, userReportsCount: 160 }
  },
  {
    id: 'zone-staremesto',
    name: 'Staré Město',
    type: 'street',
    coordinates: createRectPolygon(50.087, 14.421, 0.005, 0.007),
    baseScore: 90,
    factors: { cameraCoverage: true, wellLit: true, sosNearby: true, incidentPenalty: 15, userRating: 4.5, userReportsCount: 400 } // incidents from tourists, but mostly safe
  }
];
