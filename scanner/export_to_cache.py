import json
import math
import os

# Haversine formula pro výpočet vzdálenosti (metry)
def get_distance_meters(lat1, lon1, lat2, lon2):
    R = 6378137
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def main():
    cache_path = '../src/data/prague_safety_cache.json'
    
    try:
        with open('detections.json', 'r', encoding='utf-8') as f:
            new_detections = json.load(f)
    except FileNotFoundError:
        print("Chybí detections.json. Spusťte nejdříve detector.py.")
        return

    if not os.path.exists(cache_path):
        print(f"Chybí soubor cache {cache_path}.")
        return

    with open(cache_path, 'r', encoding='utf-8') as f:
        cache = json.load(f)
        
    existing_cameras = cache.get('cameras', [])
    
    # Zjistíme nejvyšší existující ID, abychom mohli přidělovat nová
    max_id = 0
    for cam in existing_cameras:
        try:
            cid = int(cam['id'])
            if cid > max_id:
                max_id = cid
        except:
            pass

    print(f"Původní stav cache: {len(existing_cameras)} kamer.")
    
    added_count = 0
    duplicate_count = 0
    
    for det in new_detections:
        lat = det['lat']
        lng = det['lng']
        
        # Hledání duplicit v okruhu 15 metrů
        is_duplicate = False
        for cam in existing_cameras:
            if get_distance_meters(lat, lng, cam['lat'], cam['lng']) < 15.0:
                is_duplicate = True
                break
                
        if is_duplicate:
            duplicate_count += 1
        else:
            max_id += 1
            rng = 45
            if det['type'] == 'ptz': rng = 60
            elif det['type'] == 'dome': rng = 35
            
            existing_cameras.append({
                "id": max_id,
                "lat": lat,
                "lng": lng,
                "type": det['type'],
                "direction": det['direction'],
                "angle": det['angle_fov'],
                "rangeMeters": rng,
                "description": f"AI Detekce (conf: {det['confidence']})"
            })
            added_count += 1

    cache['cameras'] = existing_cameras
    
    with open(cache_path, 'w', encoding='utf-8') as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)
        
    print(f"Export dokončen.")
    print(f"Přidáno nových kamer: {added_count}")
    print(f"Zahozeno duplicit (okruh 15m): {duplicate_count}")
    print(f"Nový stav cache: {len(existing_cameras)} kamer.")

if __name__ == "__main__":
    main()
