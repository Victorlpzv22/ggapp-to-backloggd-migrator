export function normalizeLinkText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[''`´]/g, "'")
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[-_\s]+/g, ' ')
    .trim();
}

export function rankLinkMatch(raw: string, normalizedQuery: string): 'exact' | 'prefix' | null {
  const linkN = normalizeLinkText(raw);
  if (linkN === normalizedQuery) return 'exact';
  if (linkN.startsWith(normalizedQuery)) return 'prefix';
  return null;
}
