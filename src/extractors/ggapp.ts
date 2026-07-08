import { chromium, type BrowserContext } from 'playwright';
import { type Game, type GGAppStatus } from '../models/index.js';
import * as logger from '../utils/logger.js';
import { saveSession, sessionExists } from '../utils/session.js';
import { GGAPP_API_URL } from '../constants.js';

const SITE_NAME = 'ggapp';

interface GraphQLResponse {
  data: Record<string, unknown>;
  errors?: Array<{ message: string }>;
}

export class GGAppAPIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GGAppAPIError';
  }
}

async function graphqlRequest(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const response = await fetch(GGAPP_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new GGAppAPIError(`API error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as GraphQLResponse;

  if (result.errors) {
    throw new GGAppAPIError(`GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`);
  }

  return result.data;
}

/** Login to GGApp via visible browser and save session */
export async function loginGGApp(): Promise<void> {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://ggapp.io/', { waitUntil: 'networkidle' });
  logger.info('Please log in to GGApp in the browser window.');

  const loginBtn = page.getByText('Login').first();
  await loginBtn.click();
  await page.waitForTimeout(500);

  logger.info('Waiting for login to complete...');
  logger.info('Enter your credentials in the modal and click "Log in"');

  await page.waitForFunction(
    () => window.location.pathname !== '/' && window.location.pathname !== '/login',
    { timeout: 0 },
  );
  await page.waitForTimeout(2000);
  logger.success(
    `GGApp login detected — logged in as ${page.url().replace('https://ggapp.io/', '')}`,
  );

  await saveSession(context, SITE_NAME);
  logger.success('Session saved');

  await browser.close();
}

/** Get wishlist game IDs from authenticated session */
async function fetchWishlistIds(
  userId: number,
  headless: boolean,
  existingContext?: BrowserContext,
): Promise<Map<number, { name: string; slug: string }>> {
  if (!sessionExists(SITE_NAME)) {
    logger.warn('No saved GGApp session found. Run login first with: npm run login');
    return new Map();
  }

  let browser: import('playwright').Browser | null = null;
  let context: BrowserContext;
  if (existingContext) {
    context = existingContext;
  } else {
    browser = await chromium.launch({ headless, args: ['--no-sandbox'] });
    context = await browser.newContext({ storageState: `sessions/${SITE_NAME}.json` });
  }
  const page = await context.newPage();

  try {
    // Navigate to ggapp.io so the page context has access to localStorage
    try {
      await page.goto('https://ggapp.io/', { waitUntil: 'networkidle', timeout: 30000 });
    } catch {
      await page.goto('https://ggapp.io/', { waitUntil: 'load', timeout: 30000 });
    }
    await page.waitForTimeout(2000);

    const result = await page.evaluate(async (uid: number) => {
      const token = localStorage.getItem('authToken');
      if (!token) {
        return { error: 'No auth token in localStorage' };
      }

      // First get total count
      const countResp = await fetch('https://api.ggapp.io/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: `query wishlistGamesCount($userId: Int) { wishlistGamesCount(userId: $userId) }`,
          variables: { userId: uid },
        }),
      });
      const countData = (await countResp.json()) as { data?: { wishlistGamesCount: number } };
      const total = countData?.data?.wishlistGamesCount || 0;

      // Fetch all wishlist games (max 1000)
      const resp = await fetch('https://api.ggapp.io/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          query: `query wishlistGames($filter: WishlistFilter, $order: WishlistOrder, $limit: Int, $offset: Int) {
            wishlistGames(filter: $filter, order: $order, limit: $limit, offset: $offset) {
              game { id name slug }
            }
          }`,
          variables: {
            filter: { platforms: [], userId: uid },
            order: { direction: 'ASC', field: 'GAME_NAME' },
            limit: 1000,
            offset: 0,
          },
        }),
      });
      const data = (await resp.json()) as {
        data?: { wishlistGames?: Array<{ game: { id: number; name: string; slug: string } }> };
      };
      const games = data?.data?.wishlistGames || [];
      return {
        total,
        games: games.map((wg) => ({ id: wg.game.id, name: wg.game.name, slug: wg.game.slug })),
      };
    }, userId);

    if ((result as any).error) {
      logger.warn(`Wishlist auth error: ${(result as any).error}`);
      return new Map();
    }

    const { total, games } = result as {
      total: number;
      games: Array<{ id: number; name: string; slug: string }>;
    };
    logger.success(`Wishlist: ${games.length} of ${total} games fetched via session`);
    return new Map(games.map((g) => [g.id, { name: g.name, slug: g.slug }]));
  } catch (err) {
    logger.warn(`Could not fetch wishlist: ${err instanceof Error ? err.message : String(err)}`);
    return new Map();
  } finally {
    if (browser) await browser.close();
  }
}

/**
 * Fetch all games from GGApp using the public GraphQL API.
 * No authentication needed — profile data is public.
 * If saved session exists, also merges authenticated wishlist data.
 */
export async function extractGGAppData(
  username: string,
  headless = true,
  context?: BrowserContext,
): Promise<Game[]> {
  // Step 1: Get user ID
  logger.info(`Fetching user info for "${username}"...`);
  const userData = await graphqlRequest(
    `query getUser($username: String) {
      getUser(username: $username) { id username }
    }`,
    { username },
  );

  const user = (userData as { getUser: { id: number; username: string } }).getUser;
  if (!user) {
    throw new GGAppAPIError(`User "${username}" not found`);
  }
  const userId = user.id;
  logger.info(`User ID: ${userId}`);

  // Step 2: Get games by play status
  logger.info('Fetching games...');
  const statusIds = [1, 2, 3, 4, 5, 6];
  const gamesData = await graphqlRequest(
    `query listGamesForStatuses($statusIds: [ID], $userId: ID, $limit: Int) {
      listGamesForStatuses(statusIds: $statusIds, userId: $userId, limit: $limit) {
        game { id name slug token }
        playStatus { id title }
      }
    }`,
    { statusIds, userId, limit: 1000 },
  );

  const entries =
    (
      gamesData as {
        listGamesForStatuses: Array<{
          game: { id: number; name: string; slug: string; token: string };
          playStatus: { id: number; title: string };
        }>;
      }
    ).listGamesForStatuses || [];

  const games: Game[] = entries.map((entry) => ({
    title: entry.game.name,
    status: entry.playStatus.title as GGAppStatus,
    rating: undefined,
    review: undefined,
    lists: [],
    gameId: entry.game.id,
    token: entry.game.token,
    slug: entry.game.slug,
  }));

  logger.success(`Found ${games.length} games with a play status`);

  // Step 3: Fetch games without a play status (collection 0 / DEFAULT)
  logger.info('Fetching unstatused games...');
  try {
    const unstatusedData = await graphqlRequest(
      `query listGamesForStatuses($statusIds: [ID], $userId: ID, $limit: Int) {
        listGamesForStatuses(statusIds: $statusIds, userId: $userId, limit: $limit) {
          game { id name slug token }
          playStatus { id title }
        }
      }`,
      { statusIds: [0], userId, limit: 1000 },
    );

    const unstatusedEntries =
      (
        unstatusedData as {
          listGamesForStatuses: Array<{
            game: { id: number; name: string; slug: string; token: string };
            playStatus: { id: number; title: string };
          }>;
        }
      ).listGamesForStatuses || [];

    for (const entry of unstatusedEntries) {
      if (!games.some((g) => g.gameId === entry.game.id)) {
        games.push({
          title: entry.game.name,
          // Synthetic 'Wishlist' label for DEFAULT(0) games — see models/index.ts. Maps to backlog.
          status: 'Wishlist' as GGAppStatus,
          rating: undefined,
          review: undefined,
          lists: [],
          gameId: entry.game.id,
          token: entry.game.token,
          slug: entry.game.slug,
        });
      }
    }
    logger.success(`Found ${unstatusedEntries.length} unstatused games`);
  } catch (err) {
    logger.warn(
      `Could not fetch unstatused games: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Step 4: Cross-reference with authenticated wishlist (if session exists)
  const wishlistGames = await fetchWishlistIds(userId, headless, context);
  if (wishlistGames.size > 0) {
    let added = 0;
    for (const [id, info] of wishlistGames) {
      if (!games.some((g) => g.gameId === id)) {
        games.push({
          title: info.name,
          status: 'Wishlist' as GGAppStatus,
          rating: undefined,
          review: undefined,
          lists: [],
          gameId: id,
          token: undefined,
          slug: info.slug,
        });
        added++;
      }
    }
    if (added > 0) {
      logger.info(`Added ${added} wishlist games not previously extracted`);
    }
  }

  logger.info(`Total games: ${games.length}`);

  // Step 5: Fetch reviews and ratings
  if (games.length > 0) {
    logger.info('Fetching reviews...');
    try {
      const reviewsData = await graphqlRequest(
        `query reviews($filter: ReviewFilter, $limit: Int) {
          reviews(filter: $filter, limit: $limit) {
            ratingValue
            body
            game { id name }
          }
        }`,
        { filter: { userId }, limit: 1000 },
      );

      const reviews =
        (
          reviewsData as {
            reviews: Array<{
              ratingValue: number | null;
              body: string | null;
              game: { id: number; name: string };
            }>;
          }
        ).reviews || [];

      for (const review of reviews) {
        const game = games.find((g) => g.gameId === review.game.id);
        if (game) {
          if (review.ratingValue) game.rating = review.ratingValue;
          if (review.body) game.review = review.body;
        }
      }
      logger.info(`Found ${reviews.length} reviews`);
    } catch (err) {
      logger.warn(`Could not fetch reviews: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Step 6: Fetch list memberships
  logger.info('Fetching lists...');
  try {
    const listsData = await graphqlRequest(
      `query lists($filter: ListFilter, $limit: Int) {
        lists(filter: $filter, limit: $limit) {
          id slug token gameCount
        }
      }`,
      { filter: { userId }, limit: 100 },
    );

    const lists =
      (
        listsData as {
          lists: Array<{ id: number; slug: string; token: string; gameCount: number }>;
        }
      ).lists || [];
    logger.info(`Found ${lists.length} lists`);

    for (const list of lists) {
      if (list.gameCount === 0) continue;
      try {
        const listGamesData = await graphqlRequest(
          `query gamesForList($listId: ID!, $limit: Int) {
            gamesForList(listId: $listId, limit: $limit) {
              game { id name }
            }
          }`,
          { listId: list.id, limit: 1000 },
        );

        const listGames =
          (listGamesData as { gamesForList: Array<{ game: { id: number; name: string } }> })
            .gamesForList || [];
        for (const entry of listGames) {
          const game = games.find((g) => g.gameId === entry.game.id);
          if (game && !game.lists.includes(list.slug)) {
            game.lists.push(list.slug);
          }
        }
      } catch {
        logger.warn(`Could not fetch games for list "${list.slug}"`);
      }
    }
  } catch {
    logger.warn('Could not fetch lists');
  }

  return games;
}
