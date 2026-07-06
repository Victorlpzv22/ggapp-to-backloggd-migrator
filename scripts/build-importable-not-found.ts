import * as fs from 'node:fs';

const ROMAN_TO_ARABIC: Record<string, string> = {
  ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9',
};

function stripTrademarks(s: string): string {
  return s.replace(/[™®©]/g, '');
}
function normalizeApostrophes(s: string): string {
  return s.replace(/[''`´]/g, "'");
}
function stripDuplicateTag(s: string): string {
  return s.replace(/\s*\[duplicate\]/gi, '').trim();
}
function normalizeForSearch(title: string): string {
  return stripDuplicateTag(stripTrademarks(normalizeApostrophes(title)))
    .replace(/\s+/g, ' ').trim();
}
function buildCleanSlug(title: string, stripApos = false): string {
  let s = normalizeForSearch(title);
  if (stripApos) s = s.replace(/'/g, '');
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function buildSlugVariants(title: string, originalSlug?: string): string[] {
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

const notFound = JSON.parse(fs.readFileSync('data/not-found.json', 'utf-8')) as Array<{
  title: string;
  status: string;
  lists: string[];
}>;

const ggappPath = 'data/ggapp-data.json';
const ggapp = fs.existsSync(ggappPath)
  ? (JSON.parse(fs.readFileSync(ggappPath, 'utf-8')) as { games: any[] })
  : { games: [] };
const byTitle = new Map(ggapp.games.map((g) => [g.title as string, g]));

const enriched = notFound.map((n) => {
  const full = byTitle.get(n.title);
  const base = {
    title: n.title,
    status: n.status,
    lists: n.lists,
    gameId: full?.gameId,
    token: full?.token,
    slug: full?.slug,
  };
  const variants = buildSlugVariants(n.title, full?.slug);
  return { ...base, _slugVariants: variants };
});

fs.writeFileSync('data/not-found-importable.json', JSON.stringify(enriched, null, 2));
console.log(`Wrote ${enriched.length} games to data/not-found-importable.json`);