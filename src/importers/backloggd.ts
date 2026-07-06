import { type Page, type BrowserContext } from 'playwright';
import { type Game, type BackloggdStatus, type ConflictPolicy, type ImportReport, type GGAppStatus } from '../models/index.js';
import { mapStatus } from '../mappers/states.js';
import * as logger from '../utils/logger.js';
import { wait } from '../utils/throttle.js';

const BACKLOGGD_BASE = 'https://backloggd.com';

function slugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .map((w) => (['and', 'in', 'a', 'an', 'of', 'to', 'for', 'the', 'i'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function normalizeForMatch(name: string): string {
  return [...new Set(
    name.toLowerCase().replace(/[-_\s]+/g, ' ').split(' ').filter(Boolean)
  )].sort().join(' ');
}

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
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeForMatchExtended(name: string): string {
  return stripDuplicateTag(stripTrademarks(normalizeApostrophes(name)))
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/[-_\s]+/g, ' ')
    .trim();
}

function buildCleanSlug(title: string, stripApos: boolean = false): string {
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

  const username = await getUsername(page);
  const listMapping = await ensureListsExist(page, username, games);

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    logger.info(`[${i + 1}/${games.length}] Processing: ${game.title}`);

    try {
      await wait(options.throttleSpeed);

      let gameUrl: string | null = null;

      if (game.slug) {
        const slugVariants = buildSlugVariants(game.title, game.slug);
        for (const slug of slugVariants) {
          const slugUrl = `${BACKLOGGD_BASE}/games/${slug}/`;
          await navigateToGamePage(page, slugUrl);
          const pageTitle = await page.title();
          if (pageTitle !== 'Game not found') {
            gameUrl = slugUrl;
            break;
          }
        }

        if (!gameUrl) {
          const cleanTitle = normalizeForSearch(game.title);
          logger.info(`Slugs failed, searching by title: ${cleanTitle}`);
          const searchUrl = `${BACKLOGGD_BASE}/search/games/${encodeURIComponent(cleanTitle)}`;
          await page.goto(searchUrl, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
          await page.waitForTimeout(2000);
          gameUrl = await findExactGameLink(page, game.title);
        }
      } else {
        const cleanTitle = normalizeForSearch(game.title);
        const searchUrl = `${BACKLOGGD_BASE}/search/games/${encodeURIComponent(cleanTitle)}`;
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);
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

      if (await page.title() === 'Game not found') {
        logger.warn(`Game page not found: ${game.title} (${gameUrl})`);
        report.notFound++;
        report.notFoundGames.push({
          title: game.title,
          status: game.status,
          lists: game.lists,
        });
        continue;
      }

      const backloggdStatus = mapStatus(game.status, options.stateMapping);
      const alreadyInLibrary = await isInLibrary(page);

      if (alreadyInLibrary) {
        const action = options.conflictPolicy;
        if (action === 'skip') {
          logger.info(`Already in library, syncing lists only: ${game.title}`);
          if (game.lists.length > 0) {
            await syncGameLists(page, game, options.throttleSpeed, listMapping);
          }
          report.skipped++;
          continue;
        }
        if (action === 'merge' || action === 'overwrite') {
          await updateGameOnPage(page, game, backloggdStatus);
          if (game.lists.length > 0) {
            await syncGameLists(page, game, options.throttleSpeed, listMapping);
          }
          report.successfullyImported++;
          continue;
        }
        if (action === 'ask') {
          const userAction = await promptConflictAction(game.title);
          if (userAction === 'skip') {
            if (game.lists.length > 0) {
              await syncGameLists(page, game, options.throttleSpeed, listMapping);
            }
            report.skipped++;
            continue;
          }
          await updateGameOnPage(page, game, backloggdStatus);
          if (game.lists.length > 0) {
            await syncGameLists(page, game, options.throttleSpeed, listMapping);
          }
          report.successfullyImported++;
          continue;
        }
      }

      await addGameToLibrary(page, game, backloggdStatus);
      if (game.lists.length > 0) {
        await syncGameLists(page, game, options.throttleSpeed, listMapping);
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
  const queryNorm = normalizeForMatchExtended(title);
  return page.evaluate((searchQ: string) => {
    const links = document.querySelectorAll<HTMLAnchorElement>('a[href*="/games/"]');
    let exact: string | null = null;
    let prefix: string | null = null;

    for (const link of links) {
      const raw = link.textContent?.trim() ?? '';
      if (!raw) continue;
      const linkN = raw
        .toLowerCase()
        .replace(/[™®©]/g, '')
        .replace(/[''`´]/g, "'")
        .replace(/[^\w\s-]/g, ' ')
        .replace(/[-_\s]+/g, ' ')
        .trim();
      if (linkN === searchQ) {
        return link.href;
      }
      if (!prefix && linkN.startsWith(searchQ)) {
        prefix = link.href;
      }
    }
    return prefix;
  }, queryNorm);
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
  listMapping: Map<string, string>,
): Promise<void> {
  if (game.lists.length === 0) {
    logger.info(`  No lists to sync for ${game.title}`);
    return;
  }

  logger.info(`  Syncing lists for ${game.title}: [${game.lists.join(', ')}]`);

  const addBtn = page.locator('#add-to-list');
  if (!(await addBtn.isVisible().catch(() => false))) {
    logger.info(`  #add-to-list not visible for ${game.title}`);
    return;
  }
  await addBtn.click();
  await page.waitForFunction(() => {
    const c = document.getElementById('list-container');
    return c && c.querySelectorAll('input.list-checkbox').length > 0;
  }, { timeout: 8000 }).catch(() => logger.info('  TIMEOUT waiting for list checkboxes'));
  await page.waitForTimeout(500);

  const listsInModal = await page.evaluate(() => {
    const container = document.getElementById('list-container');
    if (!container) return [];
    const items = container.querySelectorAll<HTMLInputElement>('input.list-checkbox');
    return Array.from(items).map(cb => {
      const label = container.querySelector<HTMLElement>(`label[for="${cb.id}"]`);
      const link = label?.querySelector<HTMLAnchorElement>('a[href*="/list/"]');
      const slug = link?.getAttribute('href')?.split('/list/')[1]?.replace('/', '');
      const title = label?.querySelector<HTMLElement>('[class*="title"]')?.textContent?.trim() || '';
      return { id: cb.id, checked: cb.checked, slug, title };
    });
  });

  logger.info(`  Found ${listsInModal.length} lists in modal`);

  let matched = 0;
  for (const listName of game.lists) {
    const backloggdSlug = listMapping.get(listName);
    if (!backloggdSlug) {
      logger.info(`  No mapping for "${listName}"`);
      continue;
    }

    let checkbox = listsInModal.find(l => l.slug === backloggdSlug);
    if (!checkbox) {
      const normalizedTarget = normalizeForMatch(listName);
      checkbox = listsInModal.find(l => normalizeForMatch(l.title) === normalizedTarget);
      if (checkbox) {
        logger.info(`  Matched "${listName}" by title → slug "${checkbox.slug}"`);
      }
    }
    
    if (!checkbox) {
      logger.info(`  Checkbox not found for "${listName}" (slug "${backloggdSlug}")`);
      continue;
    }

    await page.locator(`label[for="${checkbox.id}"]`).click();
    matched++;
  }

  if (matched > 0) {
    logger.info(`  Saving ${matched} list changes...`);
    await page.locator('#add-to-list-save').click();
    await page.waitForTimeout(2000);
  }
}

async function getUsername(page: Page): Promise<string> {
  return page.evaluate(() => {
    const profileLink = document.querySelector<HTMLAnchorElement>('nav a[href*="/u/"], .dropdown-item[href*="/u/"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href') || '';
      const parts = href.split('/u/');
      if (parts.length > 1) {
        return parts[1].split('/')[0].split('#')[0];
      }
    }
    return 'Victorlpzv';
  });
}

async function fetchExistingListSlugs(page: Page, gameSlug: string, gameTitle: string): Promise<Map<string, string>> {
  const slugVariants = buildSlugVariants(gameTitle, gameSlug);
  let found = false;
  for (const slug of slugVariants) {
    const listsUrl = `${BACKLOGGD_BASE}/games/${slug}/`;
    await navigateToGamePage(page, listsUrl);
    if ((await page.title()) !== 'Game not found') {
      found = true;
      break;
    }
  }

  if (!found) {
    const cleanTitle = normalizeForSearch(gameTitle);
    const searchUrl = `${BACKLOGGD_BASE}/search/games/${encodeURIComponent(cleanTitle)}`;
    await page.goto(searchUrl, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const link = await findExactGameLink(page, gameTitle);
    if (!link) return new Map();
    await navigateToGamePage(page, link);
  }

  const addBtn = page.locator('#add-to-list');
  if (!(await addBtn.isVisible().catch(() => false))) return new Map();
  await addBtn.click();

  await page.waitForFunction(() => {
    const c = document.getElementById('list-container');
    if (!c) return false;
    return c.querySelectorAll('input.list-checkbox').length > 0;
  }, { timeout: 8000 }).catch(() => {});

  const raw = await page.evaluate(() => {
    const container = document.getElementById('list-container');
    if (!container) return [];
    const items = container.querySelectorAll<HTMLInputElement>('input.list-checkbox');
    const results: Array<[string, string]> = [];
    const seen = new Set<string>();
    for (const cb of items) {
      const label = container.querySelector<HTMLElement>(`label[for="${cb.id}"]`);
      if (!label) continue;
      const link = label.querySelector<HTMLAnchorElement>('a[href*="/list/"]');
      const slug = link?.getAttribute('href')?.split('/list/')[1]?.replace('/', '');
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      const title = label.querySelector<HTMLElement>('[class*="title"]')?.textContent?.trim() || slug;
      results.push([title, slug]);
    }
    return results;
  });

  await page.locator('[data-micromodal-close]').click().catch(() => {});
  await page.waitForTimeout(500);

  const map = new Map<string, string>();
  for (const [title, slug] of raw) {
    map.set(normalizeForMatch(title), slug);
  }
  return map;
}

async function createBackloggdList(page: Page, username: string, displayName: string): Promise<string> {
  await page.goto(`${BACKLOGGD_BASE}/u/${username}/lists/`, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const listBtn = page.locator('button', { hasText: 'Create List' }).first();
  await listBtn.click();
  await page.waitForTimeout(1500);

  await page.evaluate((name: string) => {
    const input = document.getElementById('list_name') as HTMLInputElement;
    if (input) {
      input.value = '';
      input.value = name;
    }
  }, displayName);

  await page.evaluate(() => {
    const createBtn = document.getElementById('create-new-list-btn') as HTMLElement;
    createBtn?.click();
  });
  await page.waitForTimeout(2000);

  return displayName.toLowerCase().replace(/\s+/g, '-');
}

async function fetchAllExistingListSlugs(page: Page, username: string): Promise<Map<string, string>> {
  await page.goto(`${BACKLOGGD_BASE}/u/${username}/lists/`, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  return page.evaluate(() => {
    const results: Array<[string, string]> = [];
    const seen = new Set<string>();
    const links = document.querySelectorAll<HTMLAnchorElement>('a.secondary-link[href*="/list/"]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const m = href.match(/\/list\/([^/]+)\/?/);
      if (!m) continue;
      const slug = m[1];
      if (seen.has(slug)) continue;
      seen.add(slug);
      const text = link.textContent?.trim() || slug;
      results.push([text, slug]);
    }
    return results;
  }).then((raw: Array<[string, string]>) => {
    const map = new Map<string, string>();
    for (const [title, slug] of raw) {
      map.set(normalizeForMatch(title), slug);
    }
    return map;
  });
}

async function ensureListsExist(page: Page, username: string, games: Game[]): Promise<Map<string, string>> {
  const allGGAppListNames = [...new Set(games.flatMap((g) => g.lists || []))].sort();
  if (allGGAppListNames.length === 0) return new Map();

  logger.info(`Ensuring ${allGGAppListNames.length} lists exist on Backloggd...`);

  const existingLists = await fetchAllExistingListSlugs(page, username);
  logger.info(`Existing lists on profile: ${existingLists.size} unique`);

  const mapping = new Map<string, string>();

  for (const ggappName of allGGAppListNames) {
    const normalized = normalizeForMatch(ggappName);
    const matchedSlug = existingLists.get(normalized);
    if (matchedSlug) {
      logger.info(`Found existing list "${ggappName}" → slug "${matchedSlug}"`);
      mapping.set(ggappName, matchedSlug);
      continue;
    }

    const displayName = slugToDisplayName(ggappName);
    logger.info(`Creating list: ${displayName}`);
    const newSlug = await createBackloggdList(page, username, displayName);
    mapping.set(ggappName, newSlug);
    existingLists.set(normalizeForMatch(displayName), newSlug);
  }

  logger.success(`All ${allGGAppListNames.length} lists ready`);
  return mapping;
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
