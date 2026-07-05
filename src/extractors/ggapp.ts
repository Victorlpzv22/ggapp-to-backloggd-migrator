import { type Game, type GGAppStatus } from '../models/index.js';
import * as logger from '../utils/logger.js';

const API_URL = 'https://api.ggapp.io/';

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
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new GGAppAPIError(`API error: ${response.status} ${response.statusText}`);
  }

  const result = (await response.json()) as GraphQLResponse;

  if (result.errors) {
    throw new GGAppAPIError(
      `GraphQL error: ${result.errors.map((e) => e.message).join(', ')}`,
    );
  }

  return result.data;
}

/**
 * Fetch all games from GGApp using the public GraphQL API.
 * No authentication needed — profile data is public.
 */
export async function extractGGAppData(username: string): Promise<Game[]> {
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

  // Step 2: Get all games with their statuses
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

  const entries = (gamesData as { listGamesForStatuses: Array<{ game: { id: number; name: string; slug: string; token: string }; playStatus: { id: number; title: string } }> }).listGamesForStatuses || [];

  const games: Game[] = entries.map((entry) => ({
    title: entry.game.name,
    status: entry.playStatus.title as GGAppStatus,
    rating: undefined,
    review: undefined,
    lists: [],
    gameId: entry.game.id,
    token: entry.game.token,
  }));

  logger.success(`Found ${games.length} games with a play status`);

  // Step 3: Fetch games without a play status (DEFAULT / Wishlist)
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

    const unstatusedEntries = (unstatusedData as { listGamesForStatuses: Array<{ game: { id: number; name: string; slug: string; token: string }; playStatus: { id: number; title: string } }> }).listGamesForStatuses || [];

    for (const entry of unstatusedEntries) {
      if (!games.some((g) => g.gameId === entry.game.id)) {
        games.push({
          title: entry.game.name,
          status: 'Wishlist' as GGAppStatus,
          rating: undefined,
          review: undefined,
          lists: [],
          gameId: entry.game.id,
          token: entry.game.token,
        });
      }
    }
    logger.success(`Found ${unstatusedEntries.length} unstatused games`);
  } catch (err) {
    logger.warn(`Could not fetch unstatused games: ${err instanceof Error ? err.message : String(err)}`);
  }

  logger.info(`Total games: ${games.length}`);

  // Step 4: Fetch reviews and ratings
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

      const reviews = (reviewsData as { reviews: Array<{ ratingValue: number | null; body: string | null; game: { id: number; name: string } }> }).reviews || [];

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

  // Step 4: Fetch list memberships
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

    const lists = (listsData as { lists: Array<{ id: number; slug: string; token: string; gameCount: number }> }).lists || [];
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

        const listGames = (listGamesData as { gamesForList: Array<{ game: { id: number; name: string } }> }).gamesForList || [];
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
