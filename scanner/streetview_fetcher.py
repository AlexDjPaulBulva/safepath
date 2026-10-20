import json
import os
import requests
import urllib3
from dotenv import load_dotenv

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

load_dotenv()
MAPILLARY_ACCESS_TOKEN = os.getenv('MAPILLARY_ACCESS_TOKEN')

def fetch_mapillary_image(lat, lng):
    # Prohledá snímky v okruhu cca 20 metrů
    delta = 0.0002
    bbox = f"{lng-delta},{lat-delta},{lng+delta},{lat+delta}"
    
    url = f"https://graph.mapillary.com/images?access_token={MAPILLARY_ACCESS_TOKEN}&fields=id,geometry,is_pano&bbox={bbox}&limit=1"
    try:
        response = requests.get(url, verify=False)
        data = response.json()
        if data.get('data') and len(data['data']) > 0:
            return data['data'][0]
    except Exception as e:
        print(f"Chyba při komunikaci s Mapillary: {e}")
    return None

def download_image_cuts(image_data, point_id):
    """
    Zde by proběhlo stažení 360° snímku a jeho rozřezání na 4 směry.
    Jelikož je to demonstační skript, vytvoříme dummy záznamy, pokud chybí reálná data.
    """
    img_id = image_data['id']
    # Získání skutečného URL obrázku by vyžadovalo volání image URL přes graph API s field=thumb_1024_url
    url = f"https://graph.mapillary.com/{img_id}?access_token={MAPILLARY_ACCESS_TOKEN}&fields=thumb_1024_url"
    
    res = requests.get(url, verify=False).json()
    img_url = res.get('thumb_1024_url')
    
    if not img_url:
        return []
        
    # V reálné pipeline stáhneme obrázek a rozřežeme ho.
    # Pro zjednodušení si stáhneme pouze tento jeden statický pohled a nasimulujeme rozřezání
    angles = [0, 90, 180, 270]
    cuts = []
    
    for angle in angles:
        filename = f"images/point_{point_id}_angle_{angle}.jpg"
        cuts.append({
            "filename": filename,
            "angle": angle,
            "mapillary_id": img_id,
            "url": img_url # V plné verzi se uloží lokálně upravený výřez
        })
        
        # Zde v produkci: img = Image.open(BytesIO(requests.get(img_url).content)) ... ořez ... img.save(filename)
    return cuts

def main():
    use_mock = False
    if not MAPILLARY_ACCESS_TOKEN or MAPILLARY_ACCESS_TOKEN == 'your_mapillary_client_token_here':
        print("POZOR: Chybí platný MAPILLARY_ACCESS_TOKEN v .env souboru!")
        print("Skript poběží v mockovacím/testovacím režimu bez reálného stahování.")
        use_mock = True
        
    os.makedirs('images', exist_ok=True)
    
    try:
        with open('sampled_points.json', 'r', encoding='utf-8') as f:
            points = json.load(f)
    except FileNotFoundError:
        print("Soubor sampled_points.json nenalezen. Spusťte nejdříve street_sampler.py.")
        return

    print(f"Zahajuji stahování pro {len(points)} bodů...")
    metadata = []
    
    import time
    
    for i, point in enumerate(points):
        if i % 100 == 0:
            print(f"Zpracováno {i}/{len(points)} bodů...")
            
        print(f"Stahuji bod {point['id']}...")
        if use_mock:
            angles = [0, 90, 180, 270]
            for angle in angles:
                metadata.append({
                    "filename": f"images/point_{point['id']}_angle_{angle}.jpg",
                    "angle": angle,
                    "mapillary_id": "mock_id",
                    "url": "http://mock.url/image.jpg",
                    "lat": point['lat'],
                    "lng": point['lng']
                })
        else:
            img_data = fetch_mapillary_image(point['lat'], point['lng'])
            if img_data:
                cuts = download_image_cuts(img_data, point['id'])
                for cut in cuts:
                    cut['lat'] = point['lat']
                    cut['lng'] = point['lng']
                    metadata.append(cut)
            time.sleep(0.3) # Rate-limiting prodleva
                
    with open('image_metadata.json', 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
        
    print(f"Vygenerováno {len(metadata)} snímkových záznamů.")

if __name__ == "__main__":
    main()
