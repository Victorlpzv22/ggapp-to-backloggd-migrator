import { type GGAppStatus, type BackloggdStatus } from '../models/index.js';

const DEFAULT_MAPPING: Record<GGAppStatus, BackloggdStatus> = {
  'Want to Play': 'backlog',
  Playing: 'playing',
  Beaten: 'played',
  Completed: 'played',
  Shelved: 'paused',
  Abandoned: 'dropped',
  Wishlist: 'backlog',
};

export function mapStatus(
  status: GGAppStatus,
  customMapping?: Partial<Record<GGAppStatus, BackloggdStatus>>,
): BackloggdStatus {
  if (customMapping?.[status]) {
    return customMapping[status]!;
  }
  return DEFAULT_MAPPING[status];
}
