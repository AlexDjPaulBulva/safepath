import * as maplibregl from 'maplibre-gl';

export function setupMapClickHandler(
  map: maplibregl.Map,
  getStart: () => any,
  getEnd: () => any,
  onSetStart: (pt: { lat: number; lng: number }) => void,
  onSetEnd: (pt: { lat: number; lng: number }) => void
) {
  map.on('click', (e: maplibregl.MapMouseEvent) => {
    const lat = e.lngLat.lat;
    const lng = e.lngLat.lng;

    const start = getStart();
    const end = getEnd();

    if (!start) {
      onSetStart({ lat, lng });
    } else if (!end) {
      onSetEnd({ lat, lng });
    } else {
      // Pokud už obě hodnoty existují, plynule aktualizujeme cíl pro snadné testování tras
      onSetEnd({ lat, lng });
    }
  });
}
