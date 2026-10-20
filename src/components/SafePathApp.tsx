import React, { useEffect, useState } from 'react';
import { RoleSelector } from './RoleSelector';
import { ParentDashboard } from './ParentDashboard';
import { ChildCompanion } from './ChildCompanion';
import { useAppStore } from '../store/useAppStore';

type AppMode = 'map' | 'login' | 'parent' | 'child';

const readStoredMode = (): 'parent' | 'night_girl' => {
  if (typeof window === 'undefined') return 'parent';
  const mode = window.localStorage.getItem('safepath_mode');
  const validModes = ['parent', 'night_girl'];
  return validModes.includes(mode ?? '') ? (mode as 'parent' | 'night_girl') : 'parent';
};

export default function SafePathApp() {
  const [appMode, setAppMode] = useState<AppMode>('login');
  const [initialProfiles, setInitialProfiles] = useState<string[]>(['parent']);
  const { setActiveMode } = useAppStore();

  useEffect(() => {
    const savedMode = readStoredMode();
    setInitialProfiles([savedMode]);
    setActiveMode(savedMode);
    window.localStorage.setItem('safepath_mode', savedMode);
  }, [setActiveMode]);

  if (appMode === 'login') {
    return (
      <RoleSelector 
        onSelectMode={setAppMode} 
        onSelectProfiles={setInitialProfiles}
      />
    );
  }

  if (appMode === 'child') {
    return <ChildCompanion onBack={() => setAppMode('login')} />;
  }

  return (
    <ParentDashboard 
      isPublic={true} 
      initialProfiles={initialProfiles} 
      onBackToMenu={() => setAppMode('login')} 
      onLoginClick={() => setAppMode('login')} 
    />
  );
}
