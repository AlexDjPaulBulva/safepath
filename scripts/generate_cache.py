import urllib.request
import urllib.parse
import json
import math
import os

minLat = 50.00
minLng = 14.22
maxLat = 50.18
maxLng = 14.70

def get_distance_meters(lat1, lon1, lat2, lon2):
    R = 6378137
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def get_bearing(lat1, lon1, lat2, lon2):
    l1 = math.radians(lat1)
    l2 = math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(l2)
    x = math.cos(l1) * math.sin(l2) - math.sin(l1) * math.cos(l2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360

def parse_direction(d):
    if not d: return None
    d = str(d).strip().upper()
    dmap = {
        'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5, 'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
        'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5, 'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5
    }
    if d in dmap: return dmap[d]
    try:
        num = float(d)
        if 0 <= num <= 360: return num
    except:
        pass
    return None

def fetch_overpass(query):
    url = "https://overpass-api.de/api/interpreter"
    data = ("data=" + urllib.parse.quote(query)).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'User-Agent': 'SafePathApp/1.0'})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode('utf-8'))

def fetch_cameras():
    query = f"""
    [out:json][timeout:60];
    node["man_made"="surveillance"]({minLat},{minLng},{maxLat},{maxLng})->.cameras;
    .cameras out body;
    way(around.cameras:50)["highway"]->.streets;
    .streets out body;
    >;
    out skel qt;
    """
    data = fetch_overpass(query)
    camera_nodes = []
    ways = []
    way_nodes_map = {}
    
    for el in data.get('elements', []):
        if el['type'] == 'node' and el.get('tags', {}).get('man_made') == 'surveillance':
            camera_nodes.append(el)
        elif el['type'] == 'node':
            way_nodes_map[el['id']] = {'lat': el['lat'], 'lon': el['lon']}
        elif el['type'] == 'way' and 'highway' in el.get('tags', {}):
            ways.append(el)
            
    cameras = []
    for cam in camera_nodes:
        tags = cam.get('tags', {})
        raw_type = tags.get('camera:type', 'unknown')
        direction = parse_direction(tags.get('camera:direction') or tags.get('direction'))
        ctype = 'unknown'
        angle = 70
        rng = 45
        
        if 'ptz' in raw_type:
            ctype = 'ptz'
            angle = 360
            direction = None
            rng = 60
        elif 'dome' in raw_type:
            ctype = 'dome'
            angle = 360
            direction = None
            rng = 35
        else:
            ctype = 'bullet'
            try:
                angle = float(tags.get('camera:angle', 70))
            except:
                angle = 70
            rng = 45
            
            if direction is None:
                closest_dist = float('inf')
                best_bearing = 0
                for way in ways:
                    nodes = way.get('nodes', [])
                    for i in range(len(nodes)-1):
                        n1 = way_nodes_map.get(nodes[i])
                        n2 = way_nodes_map.get(nodes[i+1])
                        if not n1 or not n2: continue
                        midLat = (n1['lat'] + n2['lat']) / 2
                        midLon = (n1['lon'] + n2['lon']) / 2
                        dist = get_distance_meters(cam['lat'], cam['lon'], midLat, midLon)
                        if dist < closest_dist:
                            closest_dist = dist
                            best_bearing = get_bearing(n1['lat'], n1['lon'], n2['lat'], n2['lon'])
                            d1 = get_distance_meters(cam['lat'], cam['lon'], n1['lat'], n1['lon'])
                            d2 = get_distance_meters(cam['lat'], cam['lon'], n2['lat'], n2['lon'])
                            if d2 < d1:
                                best_bearing = (best_bearing + 180) % 360
                if closest_dist < 50:
                    direction = round(best_bearing)
                else:
                    angle = 360
                    rng = 35
                    
        cameras.append({
            'id': cam['id'], 'lat': cam['lat'], 'lng': cam['lon'],
            'type': ctype, 'direction': direction, 'angle': angle, 'rangeMeters': rng,
            'description': tags.get('name') or tags.get('description') or f"MKS/OSM Kamera #{cam['id']}"
        })
    return cameras

def fetch_havens():
    query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="police"]({minLat},{minLng},{maxLat},{maxLng});
      way["amenity"="police"]({minLat},{minLng},{maxLat},{maxLng});
      node["amenity"="fire_station"]({minLat},{minLng},{maxLat},{maxLng});
      way["amenity"="fire_station"]({minLat},{minLng},{maxLat},{maxLng});
      node["amenity"="pharmacy"]({minLat},{minLng},{maxLat},{maxLng});
      way["amenity"="pharmacy"]({minLat},{minLng},{maxLat},{maxLng});
    );
    out center;
    """
    data = fetch_overpass(query)
    havens = []
    for el in data.get('elements', []):
        lat = el.get('lat') or el.get('center', {}).get('lat')
        lon = el.get('lon') or el.get('center', {}).get('lon')
        if not lat or not lon: continue
        tags = el.get('tags', {})
        amenity = tags.get('amenity')
        htype = 'pharmacy'
        if amenity == 'police': htype = 'police'
        if amenity == 'fire_station': htype = 'fire_station'
        is247 = tags.get('opening_hours') == '24/7' or tags.get('emergency') == 'yes'
        
        name = tags.get('name')
        if not name:
            if htype == 'police': name = 'Policie ČR/MP'
            elif htype == 'fire_station': name = 'Hasiči'
            else: name = 'Lékárna'
            
        havens.append({
            'id': el['id'], 'lat': lat, 'lng': lon, 'type': htype,
            'name': name, 'is247': is247, 'phone': tags.get('phone') or tags.get('contact:phone')
        })
    return havens

print("Fetching cameras...")
cameras = fetch_cameras()
print("Fetching havens...")
havens = fetch_havens()
output = {"cameras": cameras, "safeHavens": havens}

os.makedirs('src/data', exist_ok=True)
with open('src/data/prague_safety_cache.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print(f"Saved {len(cameras)} cameras and {len(havens)} havens.")
