import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sessionExists, saveSession } from '../utils/session.js';
import { loginBackloggd, importGames } from '../importers/backloggd.js';
import * as logger from '../utils/logger.js';
import { type GGAppData, type ConflictPolicy } from '../models/index.js';
import { loadConfig } from '../utils/config.js';

const BACKLOGGD_BASE = 'https://backloggd.com';

export async function importCommand(options: {
  throttle?: string;
  headless?: boolean;
  sessionDir?: string;
  dataFile?: string;
  config?: string;
  onConflict?: string;
}) {
  const config = loadConfig(options.config);
  const headless = options.headless ?? config.headless ?? true;
  const throttleSpeed = (options.throttle ?? config.throttle ?? 'normal') as 'slow' | 'normal' | 'fast';
  const sessionDir = options.sessionDir ?? config.sessionDir ?? 'sessions';
  const dataFile = options.dataFile ?? 'data/ggapp-data.json';
  const conflictPolicy = (options.onConflict ?? config.defaultConflictPolicy ?? 'skip') as ConflictPolicy;

  if (!fs.existsSync(dataFile)) {
    logger.error(`Data file not found: ${dataFile}. Run extract first.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(dataFile, 'utf-8');
  const data: GGAppData = JSON.parse(raw);
  logger.info(`Loaded ${data.games.length} games from ${dataFile}`);

  const browser = await chromium.launch({ headless });
  const sessionPath = sessionExists('backloggd', sessionDir)
    ? path.join(sessionDir, 'backloggd.json')
    : undefined;
  const context = await browser.newContext({ storageState: sessionPath });

  try {
    const page = await context.newPage();

    if (sessionPath) {
      logger.info('Restored saved Backloggd session');
      await page.goto(BACKLOGGD_BASE, { waitUntil: 'networkidle' });
    } else {
      await loginBackloggd(page);
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
    logger.info(`Total: ${report.totalGames} | Imported: ${report.successfullyImported} | Skipped: ${report.skipped} | Not found: ${report.notFound} | Errors: ${report.errors}`);
  } finally {
    await browser.close();
  }
}
