import { type Page, type BrowserContext } from 'playwright';
import { type Game, type BackloggdStatus, type ConflictPolicy, type ImportReport, type GGAppStatus } from '../models/index.js';
import { mapStatus } from '../mappers/states.js';
import * as logger from '../utils/logger.js';
import { wait } from '../utils/throttle.js';

const BACKLOGGD_BASE = 'https://backloggd.com';

export async function loginBackloggd(page: Page): Promise<void> {
  await page.goto(`${BACKLOGGD_BASE}/login`, { waitUntil: 'networkidle' });
  logger.info('Please log in to Backloggd in the browser window.');
  logger.info('Waiting for login to complete...');

  await page.waitForFunction(
    () => !window.location.pathname.startsWith('/login'),
    { timeout: 0 },
  );
  await page.waitForTimeout(2000);
  logger.success('Backloggd login detected');
}

export async function importGames(
  page: Page,
  context: BrowserContext,
  games: Game[],
  options: {
    conflictPolicy: ConflictPolicy;
    throttleSpeed: 'slow' | 'normal' | 'fast';
    stateMapping?: Partial<Record<GGAppStatus, BackloggdStatus>>;
  },
): Promise<ImportReport> {
  const report: ImportReport = {
    totalGames: games.length,
    successfullyImported: 0,
    skipped: 0,
    notFound: 0,
    errors: 0,
    notFoundGames: [],
  };

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    logger.info(`[${i + 1}/${games.length}] Processing: ${game.title}`);

    try {
      await wait(options.throttleSpeed);

      const searchUrl = `${BACKLOGGD_BASE}/games?search=${encodeURIComponent(game.title)}`;
      await page.goto(searchUrl, { waitUntil: 'networkidle' });

      const gameFound = await findExactGameLink(page, game.title);

      if (!gameFound) {
        logger.warn(`Not found: ${game.title}`);
        report.notFound++;
        report.notFoundGames.push({
          title: game.title,
          status: game.status,
          lists: game.lists,
        });
        continue;
      }

      await page.goto(gameFound, { waitUntil: 'networkidle' });
      await wait(options.throttleSpeed);

      const backloggdStatus = mapStatus(game.status, options.stateMapping);
      const alreadyInLibrary = await isInLibrary(page);

      if (alreadyInLibrary) {
        const action = options.conflictPolicy;
        if (action === 'skip') {
          logger.warn(`Already in library, skipping: ${game.title}`);
          report.skipped++;
          continue;
        }
        if (action === 'merge' || action === 'overwrite') {
          await updateGameOnPage(page, game, backloggdStatus);
          if (game.lists.length > 0) {
            await syncGameLists(page, game, options.throttleSpeed);
          }
          report.successfullyImported++;
          continue;
        }
        if (action === 'ask') {
          const userAction = await promptConflictAction(game.title);
          if (userAction === 'skip') {
            report.skipped++;
            continue;
          }
          await updateGameOnPage(page, game, backloggdStatus);
          if (game.lists.length > 0) {
            await syncGameLists(page, game, options.throttleSpeed);
          }
          report.successfullyImported++;
          continue;
        }
      }

      await addGameToLibrary(page, game, backloggdStatus);
      if (game.lists.length > 0) {
        await syncGameLists(page, game, options.throttleSpeed);
      }
      report.successfullyImported++;
    } catch (err) {
      logger.error(`Error processing ${game.title}: ${err}`);
      report.errors++;
    }
  }

  return report;
}

async function findExactGameLink(page: Page, title: string): Promise<string | null> {
  return page.evaluate((searchTitle) => {
    const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/games/"]');
    for (const link of links) {
      const text = link.textContent?.trim() ?? '';
      if (text.toLowerCase() === searchTitle.toLowerCase()) {
        return link.href;
      }
    }
    return null;
  }, title);
}

async function isInLibrary(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return !!document.querySelector('[data-in-library]');
  });
}

async function updateGameOnPage(
  page: Page,
  game: Game,
  status: BackloggdStatus,
): Promise<void> {
  if (game.rating) {
    const ratingBtn = page.locator(`[data-rating-value="${game.rating}"]`);
    if (await ratingBtn.isVisible()) {
      await ratingBtn.click();
    }
  }

  if (game.review) {
    const reviewArea = page.locator('[data-review-textarea]');
    if (await reviewArea.isVisible()) {
      await reviewArea.fill(game.review);
    }
  }

  const statusSelect = page.locator('[data-status-select]');
  if (await statusSelect.isVisible()) {
    await statusSelect.selectOption(status);
  }
}

async function addGameToLibrary(
  page: Page,
  game: Game,
  status: BackloggdStatus,
): Promise<void> {
  const addButton = page.locator('[data-add-to-library]');
  if (await addButton.isVisible()) {
    await addButton.click();
    await wait();
  }

  await updateGameOnPage(page, game, status);
}

async function syncGameLists(
  page: Page,
  game: Game,
  throttleSpeed: 'slow' | 'normal' | 'fast',
): Promise<void> {
  if (game.lists.length === 0) return;

  const listsButton = page.locator('[data-lists-button]');
  if (await listsButton.isVisible()) {
    await listsButton.click();
    await wait(throttleSpeed);
  }

  for (const listName of game.lists) {
    const listCheckbox = page.locator(`[data-list-checkbox="${listName}"]`);
    if (await listCheckbox.isVisible()) {
      await listCheckbox.check();
    } else {
      const newListInput = page.locator('[data-new-list-input]');
      if (await newListInput.isVisible()) {
        await newListInput.fill(listName);
        await page.locator('[data-create-list-button]').click();
        await wait(throttleSpeed);
      }
    }
  }
}

async function promptConflictAction(title: string): Promise<'skip' | 'update'> {
  const { createInterface } = await import('node:readline');
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(
      `"${title}" already exists in Backloggd. (s)kip or (u)pdate? `,
      (answer: string) => {
        rl.close();
        if (answer.toLowerCase() === 'u') {
          resolve('update');
        } else {
          resolve('skip');
        }
      },
    );
  });
}
