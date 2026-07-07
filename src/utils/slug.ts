export function slugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .map((w) => (['and', 'in', 'a', 'an', 'of', 'to', 'for', 'the', 'i'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function normalizeForMatch(name: string): string {
  return [...new Set(
    name.toLowerCase().replace(/[-_\s]+/g, ' ').split(' ').filter(Boolean)
  )].sort().join(' ');
}

export const ROMAN_TO_ARABIC: Record<string, string> = {
  ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9',
};

export function stripTrademarks(s: string): string {
  return s.replace(/[™®©]/g, '');
}

export function normalizeApostrophes(s: string): string {
  return s.replace(/[''`´]/g, "'");
}

export function stripDuplicateTag(s: string): string {
  return s.replace(/\s*\[duplicate\]/gi, '').trim();
}

export function normalizeForSearch(title: string): string {
  return stripDuplicateTag(stripTrademarks(normalizeApostrophes(title)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeForMatchExtended(name: string): string {
  return stripDuplicateTag(stripTrademarks(normalizeApostrophes(name)))
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[-_\s]+/g, ' ')
    .trim();
}

export function buildCleanSlug(title: string, stripApos: boolean = false): string {
  let s = normalizeForSearch(title);
  if (stripApos) s = s.replace(/'/g, '');
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildSlugVariants(title: string, originalSlug?: string): string[] {
  const variants: string[] = [];
  const clean = buildCleanSlug(title);
  const noApos = buildCleanSlug(title, true);

  if (originalSlug && originalSlug !== clean && originalSlug !== noApos) variants.push(originalSlug);
  if (clean && !variants.includes(clean)) variants.push(clean);
  if (noApos !== clean && noApos && !variants.includes(noApos)) variants.push(noApos);

  const romanSuffix = clean.match(/-(ii|iii|iv|v|vi|vii|viii|ix)$/);
  if (romanSuffix) {
    const arabic = clean.slice(0, -romanSuffix[1].length) + ROMAN_TO_ARABIC[romanSuffix[1]];
    if (!variants.includes(arabic)) variants.push(arabic);
  }
  return [...new Set(variants.filter(Boolean))];
}
