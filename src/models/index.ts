export type GGAppStatus =
  | 'jugando'
  | 'completado'
  | 'abandonado'
  | 'pendiente'
  | 'en pausa'
  | 'deseado';

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
