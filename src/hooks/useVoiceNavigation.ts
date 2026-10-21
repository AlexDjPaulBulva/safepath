import { useState, useEffect, useRef, useCallback } from 'react';
import * as turf from '@turf/turf';
import { RouteResult, NavigationStep } from '../lib/routing';
import { PedestrianCrossing } from '../lib/crossings';

export interface UseVoiceNavigationProps {
  currentLocation: { lat: number; lng: number; accuracy?: number } | null;
  activeRoute: RouteResult | null;
  snappedCrossings?: PedestrianCrossing[];
  staticCrossings?: any[];
  enabled?: boolean;
}

export interface UseVoiceNavigationResult {
  isVoiceEnabled: boolean;
  toggleVoice: () => void;
  setVoiceEnabled: (enabled: boolean) => void;
  speak: (text: string, priority?: boolean) => void;
  cancelSpeech: () => void;
  lastSpokenText: string | null;
}

interface DetectedTurn {
  id: string;
  lat: number;
  lng: number;
  direction: 'left' | 'right';
  streetName?: string;
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Vyhledá český hlas v systému (Google čeština, Microsoft Jakub/Vlasta apod.)
 */
function findCzechVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const czech = voices.find((v) => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    return (
      lang === 'cs-cz' ||
      lang.startsWith('cs') ||
      name.includes('czech') ||
      name.includes('čes') ||
      name.includes('jakub')
    );
  });

  return czech || null;
}

/**
 * Hook pro hlasovou a haptickou navigaci dětí:
 * - Web Speech API v češtině (rate: 0.95, pitch: 1.05).
 * - Fronta pokynů s ochranou proti překrývání.
 * - Sledování GPS polohy vůči aktivní trase:
 *   * 25 metrů před odbočením: "Za 25 metrů odboč vpravo/vlevo do ulice..." + vibrace [100, 50, 100].
 *   * 20 metrů před semaforem: "Blížíš se k semaforu. Počkej na zeleného panáčka a rozhlédni se." + vibrace [300].
 *   * Odchylka z koridoru (> 35 m): "Pozor, sešel jsi z bezpečné trasy. Vrať se zpět na chodník." + vibrace [200, 100, 200, 100, 200].
 *   * Dosažení cíle (< 15 m): "Jsi bezpečně v cíli!"
 * - Přepínač perzistovaný v localStorage('safepath_voice_enabled').
 */
export function useVoiceNavigation({
  currentLocation,
  activeRoute,
  snappedCrossings,
  staticCrossings,
  enabled = true
}: UseVoiceNavigationProps): UseVoiceNavigationResult {
  const [isVoiceEnabled, setIsVoiceEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('safepath_voice_enabled') === 'true';
    } catch {
      return false;
    }
  });

  const [lastSpokenText, setLastSpokenText] = useState<string | null>(null);

  // Evidujeme projeté a již vyslovené body (každý pokyn smí zaznít jen jednou)
  const spokenStepsSet = useRef<Set<string>>(new Set());

  // Fronta hlášek a stav přehrávání (pokyny se nesmí překrývat)
  const speechQueueRef = useRef<Array<{ text: string; priority?: boolean }>>([]);
  const isSpeakingRef = useRef<boolean>(false);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stav odchýlení z koridoru
  const isCurrentlyDeviatedRef = useRef<boolean>(false);
  const lastDeviationAlertTimeRef = useRef<number>(0);

  // Klíč trasy pro vyčištění stavu při změně cíle
  const currentRouteKeyRef = useRef<string | null>(null);

  // Hlasová syntéza: inicializace a načtení českých hlasů
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const handleVoicesChanged = () => {
      // Hlasy byly načteny systémem
      findCzechVoice();
    };

    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = handleVoicesChanged;
    }
  }, []);

  // Haptická vibrace
  const triggerHaptic = useCallback((pattern: number | number[]) => {
    if (!isVoiceEnabled || !enabled) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // Některé mobilní prohlížeče vyžadují předchozí dotyk
      }
    }
  }, [isVoiceEnabled, enabled]);

  // Vyřízení fronty hlasových zpráv (zabraňuje překrývání)
  const processSpeechQueue = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (isSpeakingRef.current) return;
    if (speechQueueRef.current.length === 0) return;

    const nextItem = speechQueueRef.current.shift();
    if (!nextItem) return;

    try {
      const utterance = new SpeechSynthesisUtterance(nextItem.text);
      utterance.lang = 'cs-CZ';
      utterance.rate = 0.95; // Mírně pomalejší a srozumitelnější pro děti
      utterance.pitch = 1.05; // Přátelský, jasný tón

      const czechVoice = findCzechVoice();
      if (czechVoice) {
        utterance.voice = czechVoice;
      }

      utterance.onstart = () => {
        isSpeakingRef.current = true;
        setLastSpokenText(nextItem.text);
      };

      const finishUtterance = () => {
        isSpeakingRef.current = false;
        if (speechTimeoutRef.current) {
          clearTimeout(speechTimeoutRef.current);
          speechTimeoutRef.current = null;
        }
        // Malá pauza mezi větami pro přirozený poslech
        setTimeout(() => {
          processSpeechQueue();
        }, 200);
      };

      utterance.onend = finishUtterance;
      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis utterance error:', e);
        finishUtterance();
      };

      // Bezpečnostní watchdog pro případ, že prohlížeč nezavolá onend
      speechTimeoutRef.current = setTimeout(() => {
        if (isSpeakingRef.current) {
          isSpeakingRef.current = false;
          processSpeechQueue();
        }
      }, 7000);

      isSpeakingRef.current = true;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('SpeechSynthesis error:', err);
      isSpeakingRef.current = false;
    }
  }, []);

  // Odeslání pokynu do řečového procesoru
  const speak = useCallback((text: string, priority: boolean = false) => {
    if (!isVoiceEnabled || !enabled) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const cleanText = text.trim();
    if (!cleanText) return;

    if (priority) {
      // Prioritní hláška (např. varování o sejití z trasy): zruš stávající řeč a přehraj ihned
      try {
        window.speechSynthesis.cancel();
      } catch {}
      speechQueueRef.current = [];
      isSpeakingRef.current = false;
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = null;
      }
    }

    speechQueueRef.current.push({ text: cleanText, priority });
    processSpeechQueue();
  }, [isVoiceEnabled, enabled, processSpeechQueue]);

  // Zrušení veškeré řeči
  const cancelSpeech = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
    } catch {}
    speechQueueRef.current = [];
    isSpeakingRef.current = false;
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
  }, []);

  // Přepnutí stavu zvuku
  const setVoiceEnabled = useCallback((value: boolean) => {
    setIsVoiceEnabledState(value);
    try {
      localStorage.setItem('safepath_voice_enabled', String(value));
    } catch {}

    if (value) {
      // Při zapnutí přehraj potvrzovací hlášku
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.cancel();
          const confirmationText = "Hlasové pokyny zapnuty. Telefon můžeš dát do kapsy.";
          const utterance = new SpeechSynthesisUtterance(confirmationText);
          utterance.lang = 'cs-CZ';
          utterance.rate = 0.95;
          utterance.pitch = 1.05;
          const czech = findCzechVoice();
          if (czech) utterance.voice = czech;
          window.speechSynthesis.speak(utterance);
          setLastSpokenText(confirmationText);
        }
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try { navigator.vibrate([100, 50, 100]); } catch {}
        }
      }, 150);
    } else {
      cancelSpeech();
    }
  }, [cancelSpeech]);

  const toggleVoice = useCallback(() => {
    setVoiceEnabled(!isVoiceEnabled);
  }, [isVoiceEnabled, setVoiceEnabled]);

  // Reset historie projetých bodů při přepnutí / přepočtu trasy
  useEffect(() => {
    const routeKey = activeRoute
      ? `${activeRoute.id}_${activeRoute.totalDistance}_${activeRoute.geometry?.[0]?.join(',') || ''}`
      : null;

    if (routeKey !== currentRouteKeyRef.current) {
      currentRouteKeyRef.current = routeKey;
      spokenStepsSet.current.clear();
      isCurrentlyDeviatedRef.current = false;
      lastDeviationAlertTimeRef.current = 0;
      cancelSpeech();
    }
  }, [activeRoute, cancelSpeech]);

  // Vyhodnocení navigačních bodů odbočení na trase (z OSRM kroků nebo geometrie)
  const extractTurns = useCallback((route: RouteResult): DetectedTurn[] => {
    const turns: DetectedTurn[] = [];

    // 1. Přednostní zpracování z OSRM navigationSteps (obsahuje přesná jména ulic)
    if (route.navigationSteps && route.navigationSteps.length > 0) {
      for (const step of route.navigationSteps) {
        const mod = (step.modifier || '').toLowerCase();
        const type = (step.type || '').toLowerCase();

        let direction: 'left' | 'right' | null = null;
        if (mod.includes('left') || type.includes('left')) {
          direction = 'left';
        } else if (mod.includes('right') || type.includes('right')) {
          direction = 'right';
        }

        if (direction) {
          turns.push({
            id: step.id || `turn_${step.lat.toFixed(5)}_${step.lng.toFixed(5)}`,
            lat: step.lat,
            lng: step.lng,
            direction,
            streetName: step.streetName || undefined
          });
        }
      }
      if (turns.length > 0) {
        return turns;
      }
    }

    // 2. Fallback: Geometrická detekce ostrých úhlů podél souřadnic trasy
    const coords = route.geometry;
    if (coords && coords.length >= 3) {
      for (let i = 1; i < coords.length - 1; i++) {
        const prev = coords[i - 1];
        const curr = coords[i];
        const next = coords[i + 1];

        const b1 = calculateBearing(prev[0], prev[1], curr[0], curr[1]);
        const b2 = calculateBearing(curr[0], curr[1], next[0], next[1]);

        let diff = b2 - b1;
        while (diff < -180) diff += 360;
        while (diff > 180) diff -= 360;

        // Úhlový zlom větší než 35 stupňů představuje reálné odbočení
        if (diff > 35 && diff < 145) {
          turns.push({
            id: `geom_turn_right_${curr[0].toFixed(5)}_${curr[1].toFixed(5)}`,
            lat: curr[0],
            lng: curr[1],
            direction: 'right'
          });
        } else if (diff < -35 && diff > -145) {
          turns.push({
            id: `geom_turn_left_${curr[0].toFixed(5)}_${curr[1].toFixed(5)}`,
            lat: curr[0],
            lng: curr[1],
            direction: 'left'
          });
        }
      }
    }

    return turns;
  }, []);

  // Kontrola navigačních podmínek při každé aktualizaci GPS polohy
  useEffect(() => {
    if (!isVoiceEnabled || !enabled || !currentLocation || !activeRoute) return;
    const { lat, lng } = currentLocation;
    const geometry = activeRoute.geometry;
    if (!geometry || geometry.length < 2) return;

    // 1. DOSAŽENÍ CÍLE (< 15 m)
    const endPoint = geometry[geometry.length - 1];
    const distToEnd = getDistanceMeters(lat, lng, endPoint[0], endPoint[1]);
    if (distToEnd <= 15 && !spokenStepsSet.current.has('destination_reached')) {
      spokenStepsSet.current.add('destination_reached');
      speak("Jsi bezpečně v cíli!", true);
      triggerHaptic([150, 100, 150, 100, 300]);
      return;
    }

    // 2. ODCHYLKA Z KORIDORU (> 35 m)
    try {
      const pt = turf.point([lng, lat]);
      const line = turf.lineString(geometry.map(([gLat, gLng]) => [gLng, gLat]));
      const corridorDistMeters = turf.pointToLineDistance(pt, line, { units: 'meters' });

      if (corridorDistMeters > 35) {
        const now = Date.now();
        // Zabráníme spamu hlášek: opakujeme maximálně jednou za 25 sekund
        if (!isCurrentlyDeviatedRef.current || (now - lastDeviationAlertTimeRef.current > 25000)) {
          isCurrentlyDeviatedRef.current = true;
          lastDeviationAlertTimeRef.current = now;
          speak("Pozor, sešel jsi z bezpečné trasy. Vrať se zpět na chodník.", true);
          triggerHaptic([200, 100, 200, 100, 200]);
        }
      } else if (corridorDistMeters <= 25) {
        // Návrat zpět do koridoru
        isCurrentlyDeviatedRef.current = false;
      }
    } catch {
      // Ignorujeme případné chyby v Turf LineString
    }

    // 3. PŘÍCHOD K ŘÍZENÉMU PŘECHODU SE SEMAFOREM (20 m před přechodem)
    const crossings = [
      ...(activeRoute.snappedCrossings || []),
      ...(snappedCrossings || []),
      ...(staticCrossings || [])
    ];

    for (const crossing of crossings) {
      const isSignalized = crossing.hasSignals || crossing.crossingType === 'traffic_signals';
      if (!isSignalized) continue;

      const cLat = crossing.lat;
      const cLng = crossing.lng;
      if (!cLat || !cLng) continue;

      const crossingId = `crossing_${crossing.id || `${cLat.toFixed(5)},${cLng.toFixed(5)}`}`;
      if (spokenStepsSet.current.has(crossingId)) continue;

      const dist = getDistanceMeters(lat, lng, cLat, cLng);
      // Okno přiblížení k přechodu: cca 20 metrů (8 až 26 m)
      if (dist <= 26 && dist >= 8) {
        spokenStepsSet.current.add(crossingId);
        speak("Blížíš se k semaforu. Počkej na zeleného panáčka a rozhlédni se.");
        triggerHaptic([300]); // 1× delší zavibrování
        break;
      }
    }

    // 4. POKYN K ODBOČENÍ (25 metrů před odbočením)
    const turns = extractTurns(activeRoute);
    for (const turn of turns) {
      if (spokenStepsSet.current.has(turn.id)) continue;

      const distToTurn = getDistanceMeters(lat, lng, turn.lat, turn.lng);
      // Okno přiblížení k odbočení: cca 25 metrů (10 až 32 m)
      if (distToTurn <= 32 && distToTurn >= 10) {
        spokenStepsSet.current.add(turn.id);
        const dirText = turn.direction === 'left' ? 'vlevo' : 'vpravo';
        const street = turn.streetName ? turn.streetName.trim() : '';

        const instruction = street
          ? `Za 25 metrů odboč ${dirText} do ulice ${street}.`
          : `Za 25 metrů odboč ${dirText}.`;

        speak(instruction);
        triggerHaptic([100, 50, 100]); // 2× krátké zavibrování
        break;
      }
    }
  }, [
    currentLocation,
    activeRoute,
    isVoiceEnabled,
    enabled,
    snappedCrossings,
    staticCrossings,
    extractTurns,
    speak,
    triggerHaptic
  ]);

  return {
    isVoiceEnabled,
    toggleVoice,
    setVoiceEnabled,
    speak,
    cancelSpeech,
    lastSpokenText
  };
}

export default useVoiceNavigation;
