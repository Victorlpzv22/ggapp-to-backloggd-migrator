import { type Page, type BrowserContext } from 'playwright';
import { type Game, type GGAppStatus } from '../models/index.js';
import * as logger from '../utils/logger.js';
import { wait } from '../utils/throttle.js';

export async function extractGGAppData(
  page: Page,
  context: BrowserContext,
  throttleSpeed: 'slow' | 'normal' | 'fast',
): Promise<Game[]> {
  const games: Game[] = [];
  let currentPage = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    logger.info(`Scraping page ${currentPage}...`);
    await wait(throttleSpeed);

    const pageGames = await parseGameList(page);
    games.push(...pageGames);

    hasNextPage = await goToNextPage(page);
    currentPage++;
  }

  logger.success(`Extracted ${games.length} games total`);
  return games;
}

export async function loginGGApp(page: Page): Promise<void> {
  await page.goto('https://ggapp.io/login', { waitUntil: 'networkidle' });
  logger.info('Please log in to GGApp in the browser window.');
  logger.info('Waiting for login to complete...');

  await page.waitForURL('https://ggapp.io/**', { timeout: 0 });
  logger.success('GGApp login detected');
}

export async function navigateToGames(page: Page): Promise<void> {
  await page.goto('https://ggapp.io/games', { waitUntil: 'networkidle' });
  logger.info('Navigated to games page');
}

async function parseGameList(page: Page): Promise<Game[]> {
  return page.evaluate(() => {
    const items = document.querySelectorAll('[data-game-card]');
    return Array.from(items).map((el) => {
      const titleEl = el.querySelector('[data-game-title]');
      const statusEl = el.querySelector('[data-game-status]');
      const ratingEl = el.querySelector('[data-game-rating]');
      const reviewEl = el.querySelector('[data-game-review]');
      const listEls = el.querySelectorAll('[data-game-list]');

      return {
        title: titleEl?.textContent?.trim() ?? '',
        status: (statusEl?.textContent?.trim() ?? 'pendiente') as GGAppStatus,
        rating: ratingEl ? parseFloat(ratingEl.textContent?.trim() ?? '') : undefined,
        review: reviewEl?.textContent?.trim() || undefined,
        lists: Array.from(listEls).map((l) => l.textContent?.trim() ?? ''),
      };
    });
  });
}

async function goToNextPage(page: Page): Promise<boolean> {
  const nextButton = page.locator('[data-pagination-next]');
  if (await nextButton.isVisible()) {
    await nextButton.click();
    await page.waitForLoadState('networkidle');
    return true;
  }
  return false;
}
