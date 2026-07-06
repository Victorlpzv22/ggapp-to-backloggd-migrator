import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractGGAppData } from '../extractors/ggapp.js';
import { sessionExists, saveSession } from '../utils/session.js';
import { loginBackloggd, importGames } from '../importers/backloggd.js';
import * as logger from '../utils/logger.js';
import { type GGAppData, type ConflictPolicy } from '../models/index.js';
import { loadConfig } from '../utils/config.js';

const BACKLOGGD_BASE = 'https://backloggd.com';

export async function migrateCommand(options: {
  username: string;
  throttle?: string;
  headless?: boolean;
  sessionDir?: string;
  dataFile?: string;
  config?: string;
  onConflict?: string;
  direct?: boolean;
}) {
  const config = loadConfig(options.config);
  const throttleSpeed = (options.throttle ?? config.throttle ?? 'normal') as 'slow' | 'normal' | 'fast';
  const sessionDir = options.sessionDir ?? config.sessionDir ?? 'sessions';
  const dataFile = options.dataFile ?? 'data/ggapp-data.json';
  const conflictPolicy = (options.onConflict ?? config.defaultConflictPolicy ?? 'skip') as ConflictPolicy;
  const direct = options.direct ?? false;

  // --- Phase 1: Extract (API-based, no Playwright) ---
  logger.info(`Extracting data for GGApp user "${options.username}"...`);
  const games = await extractGGAppData(options.username);

  if (!direct) {
    const dir = path.dirname(dataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data: GGAppData = { exportedAt: new Date().toISOString(), games };
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    logger.success(`Data saved to ${dataFile}`);
  }

  // --- Phase 2: Import (Playwright for Backloggd) ---
  const backloggdSessionPath = sessionExists('backloggd', sessionDir)
    ? path.join(sessionDir, 'backloggd.json')
    : undefined;

  // Force visible browser for login if no session exists
  const headless = backloggdSessionPath ? (options.headless ?? config.headless ?? true) : false;

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ storageState: backloggdSessionPath });

  try {
    const page = await context.newPage();

    if (backloggdSessionPath) {
      logger.info('Restored saved Backloggd session');
      await page.goto(BACKLOGGD_BASE, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
    } else {
      await loginBackloggd(page);
    }

    const report = await importGames(page, context, games, {
      conflictPolicy,
      throttleSpeed,
      stateMapping: config.stateMapping,
    });

    await saveSession(context, 'backloggd', sessionDir);

    const outputDir = path.dirname(dataFile);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const reportPath = path.join(outputDir, 'report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    if (report.notFoundGames.length > 0) {
      const notFoundPath = path.join(outputDir, 'not-found.json');
      fs.writeFileSync(notFoundPath, JSON.stringify(report.notFoundGames, null, 2));
      logger.warn(`Not-found games saved to ${notFoundPath}`);
    }

    logger.success('Migration completed');
    logger.info(`Total: ${report.totalGames} | Imported: ${report.successfullyImported} | Skipped: ${report.skipped} | Not found: ${report.notFound} | Errors: ${report.errors}`);
  } finally {
    await browser.close();
  }
}
