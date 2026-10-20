export interface SafetyZone {
  id: string;
  name: string;
  type: 'street' | 'park' | 'transit_hub' | 'underpass';
  coordinates: [number, number][]; // Polygon
  baseScore: number; // 0-100
  factors: {
    cameraCoverage: boolean;
    wellLit: boolean;
    sosNearby: boolean;
    incidentPenalty: number; // z historie incidentů/zpráv (0-100)
    userRating: number; // průměr 1-5 od komunity
    userReportsCount: number;
  };
}

export type SafetyReveal = 'camera' | 'hazard' | 'dark';

export interface ExtractedIncident {
  id: string;
  title: string;
  incident_type: string;
  severity: number; // 1-10
  location_name: string;
  time_of_day: string;
  summary: string;
  coordinates: [number, number]; // [lat, lng]
  source_url: string;
}
