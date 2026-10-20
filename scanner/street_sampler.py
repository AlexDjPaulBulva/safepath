import json
import urllib.request
import urllib.parse
from shapely.geometry import LineString
import math

# Default bounding box: Náměstí Míru / Vinohrady okolí
MIN_LAT = 50.070
MAX_LAT = 50.080
MIN_LNG = 14.430
MAX_LNG = 14.450

# Vzdálenost mezi vzorkovanými body (v metrech)
SAMPLE_DISTANCE = 30 

def fetch_streets():
    print(f"Stahuji uliční síť z Overpass API...")
    query = f"""
    [out:json][timeout:25];
    way["highway"]({MIN_LAT},{MIN_LNG},{MAX_LAT},{MAX_LNG});
    out geom;
    """
    url = "https://overpass-api.de/api/interpreter"
    data = ("data=" + urllib.parse.quote(query)).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'User-Agent': 'SafePathScanner/1.0'})
    
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

def degrees_to_meters(lon_diff, lat_diff, current_lat):
    # Přibližný převod stupňů na metry pro střední Evropu
    r_earth = 6378137
    m_per_lat = (math.pi / 180) * r_earth
    m_per_lon = m_per_lat * math.cos(math.radians(current_lat))
    return lon_diff * m_per_lon, lat_diff * m_per_lat

def meters_to_degrees(x_meters, y_meters, current_lat):
    r_earth = 6378137
    m_per_lat = (math.pi / 180) * r_earth
    m_per_lon = m_per_lat * math.cos(math.radians(current_lat))
    return x_meters / m_per_lon, y_meters / m_per_lat

def sample_points_from_ways(osm_data):
    print("Vzorkuji kontrolní body...")
    points = []
    point_id = 1
    
    for element in osm_data.get('elements', []):
        if element['type'] == 'way':
            # Overpass geom vrací pole bodů: [{'lat': X, 'lon': Y}, ...]
            geometry = element.get('geometry', [])
            if len(geometry) < 2:
                continue
            
            # Převedeme geometrii na "lokální metry" pro Shapely interpolaci
            # (Pro jednoduchost zvolíme první bod cesty jako lokální [0, 0])
            ref_lat = geometry[0]['lat']
            ref_lon = geometry[0]['lon']
            
            local_coords = []
            for node in geometry:
                x, y = degrees_to_meters(node['lon'] - ref_lon, node['lat'] - ref_lat, ref_lat)
                local_coords.append((x, y))
                
            line = LineString(local_coords)
            length = line.length
            
            num_points = max(1, int(length // SAMPLE_DISTANCE))
            for i in range(num_points + 1):
                dist = i * SAMPLE_DISTANCE
                if dist > length:
                    dist = length
                    
                pt = line.interpolate(dist)
                lon_diff, lat_diff = meters_to_degrees(pt.x, pt.y, ref_lat)
                final_lat = ref_lat + lat_diff
                final_lon = ref_lon + lon_diff
                
                points.append({
                    "id": point_id,
                    "lat": round(final_lat, 6),
                    "lng": round(final_lon, 6),
                    "way_id": element['id']
                })
                point_id += 1
                
    return points

def main():
    osm_data = fetch_streets()
    sampled_points = sample_points_from_ways(osm_data)
    
    with open('sampled_points.json', 'w', encoding='utf-8') as f:
        json.dump(sampled_points, f, indent=2, ensure_ascii=False)
        
    print(f"Hotovo. Vygenerováno {len(sampled_points)} kontrolních bodů do sampled_points.json.")

if __name__ == "__main__":
    main()
