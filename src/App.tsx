import React, { useState } from 'react';
import SafePathApp from './components/SafePathApp';

export { SafePathApp };

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<any>(null);

  return (
    <SafePathApp 
      currentRoute={currentRoute}
      onRouteCalculated={setCurrentRoute}
    />
  );
}

