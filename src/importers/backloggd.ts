import { type Page, type BrowserContext } from 'playwright';
import { type Game, type BackloggdStatus, type ConflictPolicy, type ImportReport, type GGAppStatus } from '../models/index.js';
import { mapStatus } from '../mappers/states.js';
import * as logger from '../utils/logger.js';
import { wait } from '../utils/throttle.js';

const BACKLOGGD_BASE = 'https://backloggd.com';

const PLAY_TYPE_LABEL: Record<string, string> = {
  played: 'Played',
  paused: 'Shelved',
  dropped: 'Abandoned',
};

export async function loginBackloggd(page: Page): Promise<void> {
  await page.goto(`${BACKLOGGD_BASE}/users/sign_in`, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  logger.info('Please log in to Backloggd in the browser window.');
  logger.info('Waiting for login to complete...');

  await page.waitForFunction(
    () => !window.location.pathname.startsWith('/users/sign_in'),
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

      let gameUrl: string | null = null;
      if (game.slug) {
        gameUrl = `${BACKLOGGD_BASE}/games/${game.slug}/`;
      } else {
        const searchUrl = `${BACKLOGGD_BASE}/search/games/${encodeURIComponent(game.title)}`;
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
        gameUrl = await findExactGameLink(page, game.title);
      }

      if (!gameUrl) {
        logger.warn(`Not found: ${game.title}`);
        report.notFound++;
        report.notFoundGames.push({
          title: game.title,
          status: game.status,
          lists: game.lists,
        });
        continue;
      }

      await navigateToGamePage(page, gameUrl);
      await wait(options.throttleSpeed);

      const backloggdStatus = mapStatus(game.status, options.stateMapping);
      const alreadyInLibrary = await isInLibrary(page);

      if (alreadyInLibrary) {
        const action = options.conflictPolicy;
        if (action === 'skip') {
          logger.info(`Already in library, syncing lists only: ${game.title}`);
          if (game.lists.length > 0) {
            await syncGameLists(page, game, options.throttleSpeed);
          }
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
            if (game.lists.length > 0) {
              await syncGameLists(page, game, options.throttleSpeed);
            }
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

async function navigateToGamePage(page: Page, url: string): Promise<void> {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 15000 });
  } catch {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(1000);
}

async function findExactGameLink(page: Page, title: string): Promise<string | null> {
  return page.evaluate((searchTitle) => {
    const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/games/"]');
    const lowerTitle = searchTitle.toLowerCase();
    for (const link of links) {
      const text = link.textContent?.trim() ?? '';
      if (text.toLowerCase().startsWith(lowerTitle)) {
        return link.href;
      }
    }
    return null;
  }, title);
}

async function isInLibrary(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const editBtn = document.querySelector('.log-editor-btn-edit');
    return !!editBtn && !editBtn.classList.contains('d-none');
  });
}

async function setRatingOnPage(page: Page, rating: number): Promise<void> {
  await page.evaluate((r: number) => {
    const star = document.querySelector<HTMLInputElement>(`.star-radio[value="${r}"]`);
    if (star) star.checked = true;
  }, rating);
}

async function addGameToLibrary(
  page: Page,
  game: Game,
  status: BackloggdStatus,
): Promise<void> {
  const needsModal = status === 'played' || status === 'paused' || status === 'dropped';

  if (needsModal) {
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>('.d-md-flex .played-btn-container button');
      btn?.click();
    });
    await page.waitForTimeout(1500);

    const playType = PLAY_TYPE_LABEL[status] || 'Played';
    await page.evaluate((type: string) => {
      const option = document.querySelector<HTMLElement>(`.play-type-option[title="${type}"]`);
      option?.click();
    }, playType);
  } else {
    const typeMap: Record<string, string> = {
      backlog: 'backlog',
      playing: 'playing',
      wishlist: 'wishlist',
    };
    const btnType = typeMap[status];
    if (!btnType) return;

    await page.evaluate((t: string) => {
      const btn = document.querySelector<HTMLElement>(`.d-md-flex .${t}-btn-container button`);
      btn?.click();
    }, btnType);
  }

  await page.waitForTimeout(1500);

  if (game.rating) {
    await setRatingOnPage(page, game.rating);
  }

  if (game.review) {
    await openLogEditor(page);
    await page.waitForTimeout(1000);
    await page.evaluate((text: string) => {
      const review = document.getElementById('review') as HTMLTextAreaElement;
      if (review) review.value = text;
    }, game.review);
    await page.evaluate(() => {
      const saveBtn = document.querySelector<HTMLElement>('.save-log');
      saveBtn?.click();
    });
    await page.waitForTimeout(1000);
  }
}

async function openLogEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>('.log-editor-btn');
    btn?.click();
  });
  await page.waitForTimeout(1500);
}

async function updateGameOnPage(
  page: Page,
  game: Game,
  status: BackloggdStatus,
): Promise<void> {
  await openLogEditor(page);

  if (game.rating) {
    await setRatingOnPage(page, game.rating);
  }

  if (game.review) {
    await page.evaluate((text: string) => {
      const review = document.getElementById('review') as HTMLTextAreaElement;
      if (review) review.value = text;
    }, game.review);
  }

  const typeMap: Record<string, string> = {
    backlog: 'backlog_toggle_checkbox',
    playing: 'playing_toggle_checkbox',
    wishlist: 'wishlist_toggle_checkbox',
    played: 'play_toggle_checkbox',
    paused: 'play_toggle_checkbox',
    dropped: 'play_toggle_checkbox',
  };
  const checkboxId = typeMap[status];
  if (checkboxId) {
    await page.evaluate((id: string) => {
      const toggle = document.getElementById(id) as HTMLInputElement;
      if (toggle) toggle.checked = true;
    }, checkboxId);
  }

  if ((status === 'played' || status === 'paused' || status === 'dropped') && status !== 'played') {
    const playType = PLAY_TYPE_LABEL[status];
    await page.evaluate((type: string) => {
      const selector = document.getElementById('game-status-selector');
      selector?.click();
      // After clicking, find the option by title
      const options = document.querySelectorAll<HTMLElement>('.play-type-option');
      for (const opt of options) {
        if (opt.getAttribute('title') === type) {
          opt.click();
          break;
        }
      }
    }, playType);
    await page.waitForTimeout(500);
  }

  await page.evaluate(() => {
    const saveBtn = document.querySelector<HTMLElement>('.save-log');
    saveBtn?.click();
  });
  await page.waitForTimeout(1000);
}

async function syncGameLists(
  page: Page,
  game: Game,
  throttleSpeed: 'slow' | 'normal' | 'fast',
): Promise<void> {
  if (game.lists.length === 0) return;

  await page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>('#add-to-list');
    if (!btn) {
      // Try from inside journal modal
      const listBtn = document.querySelector<HTMLElement>('.quick-list');
      listBtn?.click();
    } else {
      btn.click();
    }
  });
  await wait(throttleSpeed);

  for (const listName of game.lists) {
    await page.evaluate((name: string) => {
      const container = document.getElementById('list-container');
      if (!container) return;
      const items = container.querySelectorAll<HTMLInputElement>('input.list-checkbox');
      for (const cb of items) {
        const label = container.querySelector<HTMLElement>(`label[for="${cb.id}"]`);
        if (!label) continue;
        const link = label.querySelector<HTMLAnchorElement>('a[href*="/list/"]');
        const slug = link?.getAttribute('href')?.split('/list/')[1]?.replace('/', '');
        if (slug === name) {
          cb.checked = true;
          return;
        }
      }
    }, listName);
    await wait(throttleSpeed);
  }

  await page.evaluate(() => {
    const save = document.querySelector<HTMLElement>('#add-to-list-save');
    save?.click();
  });
  await page.waitForTimeout(1500);
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
