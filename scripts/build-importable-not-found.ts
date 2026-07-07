import * as fs from 'node:fs';
import { buildSlugVariants } from '../src/utils/slug.js';

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