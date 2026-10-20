import React, { useEffect } from 'react';
import staticSafetyData from '../data/pragueStaticSafety.json';
import { MapEngine, MapEngineProps } from './MapEngine';
import { MapErrorBoundary, MapErrorFallback } from './MapErrorBoundary';

export { MapEngine, MapErrorBoundary, MapErrorFallback };
export type { MapEngineProps };

export function Map(props: MapEngineProps) {
  useEffect(() => {
    console.log("SafePath: Načteno kamer:", staticSafetyData?.cameras?.length || 0);
    console.log("SafePath: Načteno přechodů:", staticSafetyData?.crossings?.length || 0);
  }, []);

  return (
    <MapErrorBoundary fallback={<MapErrorFallback />}>
      <MapEngine {...props} />
    </MapErrorBoundary>
  );
}

export default Map;
