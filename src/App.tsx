import React, { useState } from 'react';
import SafePathApp from './components/SafePathApp';

export { SafePathApp };

export default function App() {
  const [currentRouteData, setCurrentRouteData] = useState<any>(null);

  return (
    <SafePathApp 
      routeData={currentRouteData}
      currentRouteData={currentRouteData}
      currentRoute={currentRouteData}
      onRouteCalculated={(route) => {
        console.log('App received route:', route);
        setCurrentRouteData(route);
      }}
    />
  );
}

