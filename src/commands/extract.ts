import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractGGAppData } from '../extractors/ggapp.js';
import * as logger from '../utils/logger.js';
import { type GGAppData } from '../models/index.js';

export async function extractCommand(options: {
  username: string;
  dataFile?: string;
}) {
  const dataFile = options.dataFile ?? 'data/ggapp-data.json';

  logger.info(`Extracting data for GGApp user "${options.username}"...`);
  const games = await extractGGAppData(options.username);

  const dir = path.dirname(dataFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data: GGAppData = {
    exportedAt: new Date().toISOString(),
    games,
  };

  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  logger.success(`Data saved to ${dataFile}`);

  // Summary
  const byStatus = new Map<string, number>();
  for (const game of games) {
    byStatus.set(game.status, (byStatus.get(game.status) || 0) + 1);
  }
  logger.info('Summary:');
  for (const [status, count] of byStatus) {
    logger.info(`  ${status}: ${count}`);
  }
  const withRatings = games.filter((g) => g.rating).length;
  const withReviews = games.filter((g) => g.review).length;
  if (withRatings) logger.info(`  Ratings: ${withRatings}`);
  if (withReviews) logger.info(`  Reviews: ${withReviews}`);
}
