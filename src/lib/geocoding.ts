export interface GeocodeResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
}

/**
 * Hledání adres pomocí veřejného Nominatim API (OpenStreetMap).
 * Omezeno na Prahu (viewbox).
 */
export async function searchAddress(query: string): Promise<GeocodeResult[]> {
  if (!query || query.length < 3) return [];

  try {
    // Bounding box pro Prahu a omezení na ČR
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&countrycodes=cz&viewbox=14.22,50.17,14.71,49.94&bounded=1&limit=5`;
    
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'cs-CZ,cs;q=0.9',
        // Nominatim vyžaduje User-Agent
        'User-Agent': 'SafePath-App-Demo/1.0'
      }
    });

    if (!response.ok) {
      throw new Error('Chyba při komunikaci s Nominatim API');
    }

    return await response.json();
  } catch (error) {
    console.error('Chyba geocodingu:', error);
    return [];
  }
}

/**
 * Reverzní geokódování (Reverse Geocoding) pro získání názvu z kliknutí na mapě.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'cs-CZ,cs;q=0.9',
        'User-Agent': 'SafePath-App-Demo/1.0'
      }
    });

    if (!response.ok) {
      throw new Error('Chyba při komunikaci s Nominatim API');
    }

    const data = await response.json();

    if (data && data.address) {
      const road = data.address.road || data.address.pedestrian || data.address.footway || data.address.path;
      const houseNumber = data.address.house_number || '';
      const district = data.address.city_district || data.address.suburb || data.address.quarter;
      const city = data.address.city || data.address.town || data.address.village || 'Praha';

      if (road) {
        return houseNumber ? `${road} ${houseNumber}` : road;
      }

      if (district) {
        return `${district}, ${city}`;
      }

      if (city) {
        return `${city}`;
      }

      return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }

    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (error) {
    console.error('Chyba reverse geocodingu:', error);
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}
