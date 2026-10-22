import * as L from 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    rotate?: boolean;
    touchRotate?: boolean;
    rotateControl?: boolean | {
      closeOnZeroBearing?: boolean;
      position?: L.ControlPosition;
    };
    bearing?: number;
  }

  interface Map {
    setBearing: (bearing: number) => void;
    getBearing: () => number;
    touchRotate: {
      enable: () => void;
      disable: () => void;
      enabled: () => boolean;
    };
    compassBearing?: {
      enable: () => void;
      disable: () => void;
      enabled: () => boolean;
    };
  }
}
