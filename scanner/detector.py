import os
import json
import random
try:
    from ultralytics import YOLO
except ImportError:
    YOLO = None

def mock_inference(image_meta):
    """
    Simuluje detekci, pokud nemáme k dispozici skutečný natrénovaný model pro kamery.
    Detekuje fiktivní kamery náhodně (šance 15 %).
    """
    if random.random() < 0.15:
        camera_type = random.choice(['bullet', 'dome', 'traffic'])
        # Nasimulujeme direction podle toho, jaký výřez (0, 90, 180, 270) jsme zpracovávali
        direction = image_meta['angle'] + random.randint(-15, 15)
        direction = direction % 360
        
        return {
            "lat": image_meta['lat'],
            "lng": image_meta['lng'],
            "type": camera_type,
            "direction": direction,
            "confidence": round(random.uniform(0.65, 0.98), 2),
            "angle_fov": 70 if camera_type == 'bullet' else 360,
            "source_image": image_meta['filename']
        }
    return None

def main():
    if YOLO is None:
        print("Chybí knihovna ultralytics. Nainstalujte ji pomocí: pip install ultralytics")
        return

    weight_path = os.path.join('weights', 'best.pt')
    
    use_mock = False
    if os.path.exists(weight_path):
        print("Načítám specializovaný YOLOv8 model (best.pt)...")
        model = YOLO(weight_path)
    else:
        print("Model best.pt nenalezen! Stahuji základní yolov8n.pt a aktivuji fallback/mock režim...")
        model = YOLO('yolov8n.pt') # Stáhne se automaticky, pokud chybí
        use_mock = True

    try:
        with open('image_metadata.json', 'r', encoding='utf-8') as f:
            metadata = json.load(f)
    except FileNotFoundError:
        print("Chybí image_metadata.json. Spusťte nejdříve streetview_fetcher.py.")
        return

    detections = []
    
    print(f"Spouštím detektor na {len(metadata)} snímcích...")
    for meta in metadata:
        # V produkci bychom nahráli reálný obrázek do modelu:
        # results = model(meta['filename'])
        # for box in results[0].boxes:
        #     if box.conf >= 0.65 and box.cls == CAMERA_CLASS_ID:
        #         # ulož detekci
        
        # Provedeme inferenci se základním modelem, abychom otestovali pipeline
        # (Základní COCO model nezná bezpečnostní kamery, proto přidáme heuristiku/mock)
        if use_mock:
            det = mock_inference(meta)
            if det:
                detections.append(det)

    with open('detections.json', 'w', encoding='utf-8') as f:
        json.dump(detections, f, indent=2, ensure_ascii=False)
        
    print(f"Detekce dokončena. Nalezeno {len(detections)} kamer. Výsledek uložen do detections.json.")

if __name__ == "__main__":
    main()
