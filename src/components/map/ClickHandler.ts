import * as maplibregl from 'maplibre-gl';

export function setupMapClickHandler(
  map: maplibregl.Map,
  getStart: () => { lat: number; lng: number } | null | undefined,
  getEnd: () => { lat: number; lng: number } | null | undefined,
  onSetStart: (pt: { lat: number; lng: number }) => void,
  onSetEnd: (pt: { lat: number; lng: number }) => void,
  isSettingStartMode?: () => boolean
) {
  // Pamatuje si naposledy upravený bod pro střídání při klikání do mapy
  let lastUpdated: 'start' | 'end' = 'end';

  map.on('click', (e: maplibregl.MapMouseEvent) => {
    const lat = e.lngLat.lat;
    const lng = e.lngLat.lng;

    const start = getStart();
    const end = getEnd();

    // 1. Shift + klik nebo aktivní režim změny startu -> nastavujeme START
    const isShiftPressed = Boolean(e.originalEvent && (e.originalEvent.shiftKey || e.originalEvent.altKey));
    const forceStart = isShiftPressed || (isSettingStartMode ? isSettingStartMode() : false);

    if (forceStart) {
      lastUpdated = 'start';
      onSetStart({ lat, lng });
      return;
    }

    // 2. Pokud nemáme start, nastavíme START
    if (!start) {
      lastUpdated = 'start';
      onSetStart({ lat, lng });
      return;
    }

    // 3. Pokud nemáme cíl, nastavíme CÍL
    if (!end) {
      lastUpdated = 'end';
      onSetEnd({ lat, lng });
      return;
    }

    // 4. Obě hodnoty existují:
    // Střídání posledně upraveného bodu:
    // Pokud předchozí kliknutí změnilo start, další kliknutí do mapy automaticky změní cíl – a obráceně.
    if (lastUpdated === 'start') {
      lastUpdated = 'end';
      onSetEnd({ lat, lng });
    } else {
      lastUpdated = 'start';
      onSetStart({ lat, lng });
    }
  });
}
