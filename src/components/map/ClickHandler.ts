import * as maplibregl from 'maplibre-gl';

export function setupMapClickHandler(
  map: maplibregl.Map,
  getStart: () => { lat: number; lng: number } | null | undefined,
  getEnd: () => { lat: number; lng: number } | null | undefined,
  onSetStart: (pt: { lat: number; lng: number }) => void,
  onSetEnd: (pt: { lat: number; lng: number }) => void,
  onResetForNewStart?: (pt: { lat: number; lng: number }) => void,
  isSettingStartMode?: () => boolean
) {
  map.on('click', (e: maplibregl.MapMouseEvent) => {
    const lat = e.lngLat.lat;
    const lng = e.lngLat.lng;

    const start = getStart();
    const end = getEnd();

    // 1. Shift + klik nebo aktivní režim změny startu -> nastavujeme START
    const isShiftPressed = Boolean(e.originalEvent && (e.originalEvent.shiftKey || e.originalEvent.altKey));
    const forceStart = isShiftPressed || (isSettingStartMode ? isSettingStartMode() : false);

    if (forceStart) {
      onSetStart({ lat, lng });
      return;
    }

    // 2. Pokud nemáme start, nastavíme START
    if (!start) {
      onSetStart({ lat, lng });
      return;
    }

    // 3. Pokud nemáme cíl, nastavíme CÍL a spustíme výpočet trasy
    if (!end) {
      onSetEnd({ lat, lng });
      return;
    }

    // 4. Obě hodnoty již existují (dokončený pár START + CÍL):
    // A) Cílená úprava existujícího bodu, pokud uživatel klepl přímo na marker • START nebo • CÍL (v okruhu 48 px)
    try {
      const startPx = map.project([start.lng, start.lat]);
      const endPx = map.project([end.lng, end.lat]);
      const distToStart = Math.hypot(e.point.x - startPx.x, e.point.y - startPx.y);
      const distToEnd = Math.hypot(e.point.x - endPx.x, e.point.y - endPx.y);
      const PROXIMITY_RADIUS_PX = 48;

      if (distToStart <= PROXIMITY_RADIUS_PX && distToStart <= distToEnd) {
        onSetStart({ lat, lng });
        return;
      }

      if (distToEnd <= PROXIMITY_RADIUS_PX && distToEnd < distToStart) {
        onSetEnd({ lat, lng });
        return;
      }
    } catch {
      // Bezpečný fallback při projekci souřadnic
    }

    // B) Nový cyklus výběru: kliknutí kamkoliv do mapy po dokončení trasy nastaví nový START
    // a vyčistí/resetuje předchozí CÍL / starou trasu pro nový výběr
    if (onResetForNewStart) {
      onResetForNewStart({ lat, lng });
    } else {
      onSetStart({ lat, lng });
    }
  });
}
