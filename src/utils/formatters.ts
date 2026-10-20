/**
 * Pomocné funkce pro formátování a českou gramatiku.
 */

/**
 * Vrátí správně vyskloňovaný tvar českého podstatného jména podle počtu.
 * @param count Počet
 * @param one Tvar pro 1 (např. 'rizikové místo')
 * @param few Tvar pro 2-4 (např. 'riziková místa')
 * @param many Tvar pro 0 a 5+ (např. 'rizikových míst')
 */
export function pluralize(count: number, one: string, few: string, many: string): string {
  if (count === 1) return `${count} ${one}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

/**
 * Formátuje minuty s českým skloňováním.
 */
export function formatMinutes(count: number): string {
  return pluralize(count, 'minuta', 'minuty', 'minut');
}
