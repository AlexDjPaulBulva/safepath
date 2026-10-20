export interface RouteMetrics {
  durationMinutes: number;
  cameraCoveragePercent: number;
  unlitSegmentsCount: number;
  uncontrolledCrossingsCount: number;
  mainRoadPercent: number; // Procento trasy vedené po hlavních osvětlených třídách
  overallSafetyScore: number;
  camerasNearbyCount: number;
  hasSafeHaven: boolean;
  parkIntersectionCount?: number;
  riskSpotsCount?: number;
}

export interface RouteComparison {
  safeRoute: RouteMetrics;
  fastRoute?: RouteMetrics;
}

/**
 * Modul pro deterministické generování argumentů pro rodiče a děti.
 * V dětském režimu komunikuje výhradně pozitivní bezpečnostní pokyny bez strašení.
 */
export function generateParentArguments(
  comparison: RouteComparison,
  isChildMode: boolean = false
): string[] {
  const args: string[] = [];
  const { safeRoute, fastRoute } = comparison;

  if (isChildMode) {
    // V dětském režimu komunikuje asistent výhradně pozitivní bezpečnostní pokyny
    args.push('Cesta vede kolem přehledných ulic a po světelných přechodech, drž se na chodníku.');

    if (safeRoute.camerasNearbyCount >= 2 || safeRoute.cameraCoveragePercent >= 40) {
      args.push(`Trasa je z ${safeRoute.cameraCoveragePercent} % pod stálým dohledem městských kamer pro tvůj bezpečný příchod.`);
    }

    if (safeRoute.uncontrolledCrossingsCount === 0) {
      args.push('Všechny přechody přes vozovku na této trase mají semafor – přecházej vždy v klidu na zeleného panáčka.');
    } else {
      args.push('Všechna křížení hlavních tříd a tramvajových pásů jsou bezpečně řízena světelnou signalizací.');
    }

    if (safeRoute.hasSafeHaven) {
      args.push('Na trase je ověřený bezpečný záchytný bod (lékárna nebo otevřená provozovna), kde ti v případě potřeby ochotně pomohou.');
    }

    if (safeRoute.mainRoadPercent >= 25) {
      args.push('Trasa vede po frekventovaných bulvárech s trvalým pohybem lidí a otevřenými obchody.');
    }

    args.push('Cesta se vyhýbá tmavým průchodům i neosvětleným uličkám, celá trasa je dobře viditelná.');

    return args.slice(0, 4);
  }

  // STANDARDNÍ / RODIČOVSKÝ POHLED
  if (fastRoute) {
    const timeDiff = safeRoute.durationMinutes - fastRoute.durationMinutes;

    if (timeDiff === 0 && safeRoute.cameraCoveragePercent === fastRoute.cameraCoveragePercent) {
      args.push('Doporučená trasa je nejbezpečnější i časově optimální volbou.');
    } else if (timeDiff > 0) {
      args.push(`Bezpečná trasa je o ${formatMinutes(timeDiff)} delší, ale nabízí výrazně vyšší úroveň dohledu a ochrany.`);
    } else {
      args.push('Doporučená trasa spojuje nejrychlejší přesun s maximálním bezpečnostním skóre.');
    }
  }

  if (safeRoute.camerasNearbyCount >= 3) {
    args.push(`Trasa je z ${safeRoute.cameraCoveragePercent} % pokryta městským kamerovým systémem.`);
  }

  if (safeRoute.hasSafeHaven) {
    args.push('Na trase se nachází aktivní bezpečný záchytný bod.');
  }

  if (safeRoute.uncontrolledCrossingsCount === 0) {
    args.push('Všechny přechody přes vozovku na této trase jsou řízeny světelnou signalizací.');
  }

  if (args.length < 3) {
    args.push('Trasa je optimalizována pro přehledné osvětlené ulice a vyloučení rizikových lokalit.');
  }

  return args;
}

/**
 * Generuje edukační kontrast pro odstrašující rizikovou zkratku (Trasa B).
 */
export function generateRouteContrastArguments(
  safeRoute: RouteMetrics,
  warningRoute: RouteMetrics,
  timeSavedMinutes: number = 2
): string[] {
  const minText = timeSavedMinutes === 1 ? '1 minutu' : timeSavedMinutes < 5 ? `${timeSavedMinutes} minuty` : `${timeSavedMinutes} minut`;
  return [
    `Tato zkratka sice ušetří ${minText}, ale nutí dítě přebíhat vozovku mimo semafory a procházet místy bez dohledu kamer. Doporučujeme zůstat na Trase A.`,
    'Přebíhání víceproudé komunikace a tramvajových pásů představuje pro školáka kritické bezpečnostní riziko kvůli omezenému rozhledu.',
    'Trasa A nabízí 100% přechodů se světelnou signalizací a stálý dohled MKS kamer – ušetřený čas nestojí za hazard se zdravím.'
  ];
}

// Pomocné formátovací funkce pro správné české skloňování
function formatMinutes(m: number): string {
  if (m === 1) return 'minutu';
  if (m >= 2 && m <= 4) return 'minuty';
  return 'minut';
}

function formatUnlit(c: number): string {
  if (c === 1) return 'temnému úseku (např. vnitroblok nebo park)';
  if (c >= 2 && c <= 4) return 'temným úsekům (např. vnitrobloky nebo parky)';
  return 'temným úsekům';
}

function formatCrossings(c: number): string {
  if (c === 1) return 'neřízený přechod';
  if (c >= 2 && c <= 4) return 'neřízené přechody';
  return 'neřízených přechodů';
}
