import { create } from 'zustand';
import { SafeHavenPOI } from '../data/safe-havens-poi';

type AppState = {
  childLocation: { lat: number; lng: number } | null;
  setChildLocation: (loc: { lat: number; lng: number } | null) => void;

  activeMode: 'parent' | 'night_girl' | 'child';
  setActiveMode: (mode: 'parent' | 'night_girl' | 'child') => void;

  isSimulating: boolean;
  setIsSimulating: (sim: boolean) => void;
  
  simulationProgress: number;
  setSimulationProgress: (prog: number) => void;
  
  childStatus: 'ON_ROUTE' | 'AT_SAFE_STOP' | 'DEVIATED' | 'ALERT';
  setChildStatus: (status: 'ON_ROUTE' | 'AT_SAFE_STOP' | 'DEVIATED' | 'ALERT') => void;
  
  deviationTimer: number;
  setDeviationTimer: (timer: number) => void;

  activeSafeHaven: SafeHavenPOI | null;
  setActiveSafeHaven: (haven: SafeHavenPOI | null) => void;

  heightenedVigilance: boolean;
  setHeightenedVigilance: (val: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  childLocation: null,
  setChildLocation: (loc) => set({ childLocation: loc }),

  activeMode: 'parent',
  setActiveMode: (mode) => set({ activeMode: mode }),

  isSimulating: false,
  setIsSimulating: (sim) => set({ isSimulating: sim }),
  
  simulationProgress: 0,
  setSimulationProgress: (prog) => set({ simulationProgress: prog }),
  
  childStatus: 'ON_ROUTE',
  setChildStatus: (status) => set({ childStatus: status }),
  
  deviationTimer: 0,
  setDeviationTimer: (timer) => set({ deviationTimer: timer }),

  activeSafeHaven: null,
  setActiveSafeHaven: (haven) => set({ activeSafeHaven: haven }),

  heightenedVigilance: false,
  setHeightenedVigilance: (val) => set({ heightenedVigilance: val }),
}));
