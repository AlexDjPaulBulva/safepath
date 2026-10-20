# AI Street View Scanner (Fáze 2)

Tento modul slouží k automatické detekci bezpečnostních kamer z panoramatických snímků ulic (Mapillary / Street View) pomocí neuronové sítě YOLOv8. Nově detekované kamery se následně automaticky zanesou do hlavní mapové databáze `SafePath`.

## Požadavky

Před spuštěním nainstalujte potřebné Python knihovny:

```bash
pip install -r requirements.txt
```

## Konfigurace

1. Přejmenujte `scanner/.env.example` na `scanner/.env`.
2. Otevřete [Mapillary Dashboard](https://www.mapillary.com/dashboard/developers) a zaregistrujte novou aplikaci.
3. Zkopírujte **Client Token** a vložte jej do `.env` jako hodnotu `MAPILLARY_ACCESS_TOKEN`.

> **Poznámka:** Pokud necháte token prázdný, poběží modul `streetview_fetcher.py` ve fallback testovacím/mock režimu.

## YOLOv8 Detektor (Duální režim)

Skript `detector.py` umí pracovat ve dvou režimech:
1. **Specializovaný model (best.pt)**: Pokud do složky `weights/` vložíte natrénovaný model na bezpečnostní kamery s názvem `best.pt`, skript jej použije.
2. **Fallback režim**: Pokud složka `weights/best.pt` neexistuje, skript automaticky stáhne základní COCO model `yolov8n.pt` a spustí heuristickou "mock" detekci. To vám umožní otestovat průchod dat celou pipeline bez nutnosti trénování!

## Spuštění Pipeline

Pro kompletní obohacení mapové vrstvy postupujte sekvenčně spuštěním těchto skriptů v uvedené složce `scanner`:

1. **Sběr bodů uliční sítě**
   Vzorkuje testovací úsek v centru Prahy (Vinohrady/Staré Město).
   ```bash
   python street_sampler.py
   ```

2. **Stahování snímků**
   Dotazuje se na Mapillary API a získává statické výřezy/metadata.
   ```bash
   python streetview_fetcher.py
   ```

3. **AI Detekce**
   Spustí YOLOv8 inferenci nad získanými daty.
   ```bash
   python detector.py
   ```

4. **Integrace do SafePath (Export)**
   Slučuje nově detekované body se stávající `prague_safety_cache.json` a deduplikuje je (15 m rádius).
   ```bash
   python export_to_cache.py
   ```
