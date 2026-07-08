/**
 * GGApp play statuses.
 *
 * `Wishlist` is **synthetic**: GGApp itself has no "Wishlist" play status.
 * It is used for:
 *   (a) authenticated wishlist games fetched via the auth-only `wishlistGames` query, and
 *   (b) games with status id 0 (DEFAULT / no play status) collected from
 *       `listGamesForStatuses(statusIds: [0])`.
 *
 * Both map to Backloggd `backlog` via `mapStatus` in src/mappers/states.ts.
 */
export type GGAppStatus =
  | 'Want to Play'
  | 'Playing'
  | 'Beaten'
  | 'Completed'
  | 'Shelved'
  | 'Abandoned'
  | 'Wishlist';

export type BackloggdStatus =
  | 'playing'
  | 'played'
  | 'dropped'
  | 'backlog'
  | 'paused'
  | 'wishlist';

export type ConflictPolicy = 'skip' | 'merge' | 'overwrite' | 'ask';

export type ThrottleSpeed = 'slow' | 'normal' | 'fast';

export interface Game {
  title: string;
  status: GGAppStatus;
  rating?: number;
  review?: string;
  lists: string[];
  /** GGApp internal game ID */
  gameId?: number;
  /** GGApp game token */
  token?: string;
  /** IGDB slug (shared between GGApp and Backloggd) */
  slug?: string;
}

export interface GGAppData {
  exportedAt: string;
  games: Game[];
}

export interface ImportReport {
  totalGames: number;
  successfullyImported: number;
  skipped: number;
  notFound: number;
  errors: number;
  notFoundGames: { title: string; status: string; lists: string[] }[];
}

export interface MigratorConfig {
  stateMapping?: Partial<Record<GGAppStatus, BackloggdStatus>>;
  defaultConflictPolicy?: ConflictPolicy;
  headless?: boolean;
  throttle?: ThrottleSpeed;
  sessionDir?: string;
}
