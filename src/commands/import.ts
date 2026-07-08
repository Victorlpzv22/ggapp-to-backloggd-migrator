import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sessionExists, saveSession } from '../utils/session.js';
import { loginBackloggd, importGames } from '../importers/backloggd.js';
import * as logger from '../utils/logger.js';
import { type GGAppData, type ConflictPolicy } from '../models/index.js';
import { loadConfig } from '../utils/config.js';
import { BACKLOGGD_BASE } from '../constants.js';

export async function importCommand(options: {
  throttle?: string;
  headless?: boolean;
  sessionDir?: string;
  dataFile?: string;
  config?: string;
  onConflict?: string;
}) {
  const config = loadConfig(options.config);
  const throttleSpeed = (options.throttle ?? config.throttle ?? 'normal') as
    'slow' | 'normal' | 'fast';
  const sessionDir = options.sessionDir ?? config.sessionDir ?? 'sessions';
  const dataFile = options.dataFile ?? 'data/ggapp-data.json';
  const conflictPolicy = (options.onConflict ??
    config.defaultConflictPolicy ??
    'skip') as ConflictPolicy;

  if (!fs.existsSync(dataFile)) {
    throw new Error(`Data file not found: ${dataFile}. Run extract first.`);
  }

  const raw = fs.readFileSync(dataFile, 'utf-8');
  const parsed = JSON.parse(raw);
  let data: GGAppData;
  if (Array.isArray(parsed)) {
    const games = parsed
      .filter((g: any) => g && typeof g.title === 'string')
      .map((g: any) => ({
        title: g.title,
        status: g.status ?? 'Want to Play',
        rating: g.rating,
        review: g.review,
        lists: Array.isArray(g.lists) ? g.lists : [],
        gameId: g.gameId,
        token: g.token,
        slug: g.slug,
      }));
    data = { exportedAt: new Date().toISOString(), games };
    logger.info(`Loaded ${data.games.length} games from not-found file ${dataFile}`);
  } else {
    data = parsed as GGAppData;
    logger.info(`Loaded ${data.games.length} games from ${dataFile}`);
  }

  const sessionPath = sessionExists('backloggd', sessionDir)
    ? path.join(sessionDir, 'backloggd.json')
    : undefined;

  // Force visible browser for login if no session exists
  const headless = sessionPath ? (options.headless ?? config.headless ?? true) : false;

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: sessionPath });

  try {
    const page = await context.newPage();

    if (sessionPath) {
      logger.info('Restored saved Backloggd session');
      await page.goto(BACKLOGGD_BASE, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
    } else {
      await loginBackloggd(page);
      try {
        await saveSession(context, 'backloggd', sessionDir);
        logger.success('Backloggd session saved');
      } catch (e) {
        logger.warn(`Could not save session: ${e}`);
      }
    }

    const report = await importGames(page, context, data.games, {
      conflictPolicy,
      throttleSpeed,
      stateMapping: config.stateMapping,
    });

    await saveSession(context, 'backloggd', sessionDir);

    const dir = path.dirname(dataFile);
    const reportPath = path.join(dir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    if (report.notFoundGames.length > 0) {
      const notFoundPath = path.join(dir, 'not-found.json');
      fs.writeFileSync(notFoundPath, JSON.stringify(report.notFoundGames, null, 2));
      logger.warn(`Not-found games saved to ${notFoundPath}`);
    }

    logger.success('Import completed');
    logger.info(
      `Total: ${report.totalGames} | Imported: ${report.successfullyImported} | Skipped: ${report.skipped} | Not found: ${report.notFound} | Errors: ${report.errors}`,
    );
  } finally {
    await browser.close();
  }
}
