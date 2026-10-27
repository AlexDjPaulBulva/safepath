import { create } from 'zustand';
import { SafeHavenPOI } from '../data/safe-havens-poi';
import type { ChildSessionData } from '../lib/liveSync';

export interface AuthUserInfo {
  uid: string;
  email: string | null;
}

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

  // Firebase Live Sync stav
  pairedChildCode: string | null;
  setPairedChildCode: (code: string | null) => void;

  childSession: ChildSessionData | null;
  setChildSession: (session: ChildSessionData | null) => void;

  myChildCode: string | null;
  setMyChildCode: (code: string | null) => void;

  // Firebase Auth stav rodiče
  currentUser: AuthUserInfo | null;
  setCurrentUser: (user: AuthUserInfo | null) => void;

  pairedChildrenList: string[];
  setPairedChildrenList: (list: string[]) => void;

  // Statistiky bezpečnostních bodů podél aktivní trasy
  activeSafetyStats: { camerasCount: number; crossingsCount: number };
  setActiveSafetyStats: (stats: { camerasCount: number; crossingsCount: number }) => void;
};

const getInitialPairedCode = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('safepath_paired_child_code') || null;
};

const getInitialMyChildCode = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('safepath_child_code') || null;
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

  pairedChildCode: getInitialPairedCode(),
  setPairedChildCode: (code) => {
    if (typeof window !== 'undefined') {
      if (code) {
        localStorage.setItem('safepath_paired_child_code', code);
      } else {
        localStorage.removeItem('safepath_paired_child_code');
      }
    }
    set({ pairedChildCode: code });
  },

  childSession: null,
  setChildSession: (session) => set({ childSession: session }),

  myChildCode: getInitialMyChildCode(),
  setMyChildCode: (code) => {
    if (typeof window !== 'undefined') {
      if (code) {
        localStorage.setItem('safepath_child_code', code);
      } else {
        localStorage.removeItem('safepath_child_code');
      }
    }
    set({ myChildCode: code });
  },

  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),

  pairedChildrenList: [],
  setPairedChildrenList: (list) => set({ pairedChildrenList: list }),

  activeSafetyStats: { camerasCount: 0, crossingsCount: 0 },
  setActiveSafetyStats: (stats) => set({ activeSafetyStats: stats }),
}));
