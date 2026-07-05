import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { sessionExists, saveSession } from '../utils/session.js';
import { loginGGApp, navigateToGames, extractGGAppData } from '../extractors/ggapp.js';
import * as logger from '../utils/logger.js';
import { type GGAppData } from '../models/index.js';
import { loadConfig } from '../utils/config.js';

export async function extractCommand(options: {
  throttle?: string;
  headless?: boolean;
  sessionDir?: string;
  dataFile?: string;
  config?: string;
}) {
  const config = loadConfig(options.config);
  const headless = options.headless ?? config.headless ?? true;
  const throttleSpeed = (options.throttle ?? config.throttle ?? 'normal') as 'slow' | 'normal' | 'fast';
  const sessionDir = options.sessionDir ?? config.sessionDir ?? 'sessions';
  const dataFile = options.dataFile ?? 'data/ggapp-data.json';

  const browser = await chromium.launch({ headless });
  const sessionPath = sessionExists('ggapp', sessionDir)
    ? path.join(sessionDir, 'ggapp.json')
    : undefined;
  const context = await browser.newContext({ storageState: sessionPath });

  try {
    const page = await context.newPage();

    if (sessionPath) {
      logger.info('Restored saved GGApp session');
      await page.goto('https://ggapp.io', { waitUntil: 'networkidle' });
    } else {
      await loginGGApp(page);
    }

    await navigateToGames(page);
    const games = await extractGGAppData(page, context, throttleSpeed);

    await saveSession(context, 'ggapp', sessionDir);

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
  } finally {
    await browser.close();
  }
}
