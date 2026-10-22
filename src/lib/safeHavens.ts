import { PRAGUE_SAFE_HAVENS, SafeHavenPOI } from '../data/safe-havens-poi';

/**
 * Zjistí, zda se nacházíme v nočních a pozdních hodinách (20:00 – 07:00).
 */
export function isNightHours(hour?: number): boolean {
  const h = typeof hour === 'number' ? hour : new Date().getHours();
  return h >= 20 || h < 7;
}

/**
 * Zjistí, zda je dané místo ověřenou nonstop provozovnou (24/7).
 * V noci je přísně zakázáno označovat běžné denní lékárny či obchody jako pohotovost.
 */
export function isVerified247Haven(haven: SafeHavenPOI): boolean {
  // 1. Ověřené 24/7 lékárenské pohotovosti v Praze
  if (haven.type === 'pharmacy') {
    const verifiedKeywords = [
      'palackého',
      'motol',
      'thomayer',
      'vinohrady',
      'fnkv',
      'karlovo nám',
      'bulovk'
    ];
    const text = `${haven.name} ${haven.address} ${haven.id}`.toLowerCase();
    return haven.is247 && verifiedKeywords.some(kw => text.includes(kw));
  }

  // 2. Nonstop služebny Policie ČR a Městské policie s trvalou recepcí
  if (haven.type === 'police') {
    return haven.is247;
  }

  // 3. Nonstop čerpací stanice s nepřetržitou obsluhou
  if (haven.type === 'fuel') {
    return haven.is247;
  }

  // Metro a ostatní nejsou nonstop v hluboké noci (00:00 - 05:00)
  return false;
}

/**
 * Zjistí, zda je úkryt v danou hodinu otevřený a způsobilý poskytnout pomoc.
 */
export function isSafeHavenOpen(haven: SafeHavenPOI, hour?: number): boolean {
  const currentHour = typeof hour === 'number' ? hour : new Date().getHours();
  const isNight = isNightHours(currentHour);

  // V nočních hodinách (20:00 - 07:00):
  if (isNight) {
    // Stanice metra jsou po půlnoci (00:00 - 04:45) uzavřeny
    if (haven.type === 'metro') {
      return currentHour >= 20 && currentHour < 24; // Otevřeno pouze do půlnoci
    }
    // Zobrazovat výhradně ověřené 24/7 nonstop provozy
    return isVerified247Haven(haven);
  }

  // Přes den (07:00 - 20:00) jsou otevřena všechna registrovaná záchytná místa
  return true;
}

/**
 * Vrátí přesný, právně a provozně korektní štítek pro bod pomoci podle denní/noční doby.
 */
export function getSafeHavenBadge(haven: SafeHavenPOI, hour?: number): string {
  const currentHour = typeof hour === 'number' ? hour : new Date().getHours();
  const isNight = isNightHours(currentHour);

  switch (haven.type) {
    case 'pharmacy':
      if (isVerified247Haven(haven)) {
        return 'Nonstop lékárna (24/7)';
      }
      return isNight ? 'Běžná lékárna (ZAVŘENO)' : 'Denní lékárna (do 20:00)';

    case 'police':
      if (haven.name.toLowerCase().includes('městsk')) {
        return 'Služebna Městské policie (24/7)';
      }
      return 'Služebna PČR (24/7)';

    case 'fuel':
      return 'Nonstop čerpací stanice (24/7)';

    case 'metro':
      if (currentHour >= 0 && currentHour < 5) {
        return 'Vestibul metra (ZAVŘENO)';
      }
      return 'Střežený vestibul metra (05:00–00:00)';

    default:
      return 'Bezpečný záchytný bod';
  }
}

/**
 * Filtruje seznam záchytných bodů (Safe Havens) podle aktuální otevírací doby.
 * V noci (20:00 - 07:00) vylučuje běžné denní lékárny/obchody a vrací pouze ověřené 24/7 body.
 */
export function getActiveSafeHavens(
  currentHour?: number,
  baseList: SafeHavenPOI[] = PRAGUE_SAFE_HAVENS
): SafeHavenPOI[] {
  const hour = typeof currentHour === 'number' ? currentHour : new Date().getHours();
  
  return baseList.filter((haven) => isSafeHavenOpen(haven, hour));
}

/**
 * Vyhledá nejbližší otevřený bod pomoci z daných souřadnic se zohledněním denní/noční doby.
 */
export function findNearestVerifiedSafeHaven(
  coords: { lat: number; lng: number },
  currentHour?: number,
  extraHavens: SafeHavenPOI[] = []
): { haven: SafeHavenPOI; distanceMeters: number; badge: string } | null {
  const combined = [...PRAGUE_SAFE_HAVENS, ...extraHavens];
  const activeHavens = getActiveSafeHavens(currentHour, combined);

  if (activeHavens.length === 0) return null;

  let bestHaven: SafeHavenPOI = activeHavens[0];
  let minDistance = Infinity;

  for (const h of activeHavens) {
    // Pythagorova aproximace vzdálenosti pro Prahu
    const dLat = (h.coords[0] - coords.lat) * 111320;
    const dLng = (h.coords[1] - coords.lng) * 71600;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);

    if (dist < minDistance) {
      minDistance = dist;
      bestHaven = h;
    }
  }

  return {
    haven: bestHaven,
    distanceMeters: Math.round(minDistance),
    badge: getSafeHavenBadge(bestHaven, currentHour)
  };
}
