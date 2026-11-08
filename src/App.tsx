import React, { useState, useCallback } from 'react';
import SafePathApp from './components/SafePathApp';

export { SafePathApp };

export default function App() {
  const [currentRouteData, setCurrentRouteData] = useState<any>(null);

  const handleRouteCalculated = useCallback((route: any) => {
    setCurrentRouteData(route);
  }, []);

  return (
    <SafePathApp 
      routeData={currentRouteData}
      currentRouteData={currentRouteData}
      currentRoute={currentRouteData}
      onRouteCalculated={handleRouteCalculated}
    />
  );
}


