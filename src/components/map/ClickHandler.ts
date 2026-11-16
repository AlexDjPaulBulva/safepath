import * as maplibregl from 'maplibre-gl';

export function setupMapClickHandler(
  map: maplibregl.Map,
  getStart: () => { lat: number; lng: number } | null | undefined,
  getEnd: () => { lat: number; lng: number } | null | undefined,
  onSetStart: (pt: { lat: number; lng: number }) => void,
  onSetEnd: (pt: { lat: number; lng: number }) => void,
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

    // 3. Pokud nemáme cíl, nastavíme CÍL
    if (!end) {
      onSetEnd({ lat, lng });
      return;
    }

    // 4. Obě hodnoty existují:
    // Inteligentní rozhodování podle vzdálenosti:
    // Pokud je nový klik blíž k současnému startu než k cíli, aktualizujeme start, jinak cíl!
    const distToStart = Math.hypot(lat - start.lat, lng - start.lng);
    const distToEnd = Math.hypot(lat - end.lat, lng - end.lng);

    if (distToStart < distToEnd) {
      onSetStart({ lat, lng });
    } else {
      onSetEnd({ lat, lng });
    }
  });
}
