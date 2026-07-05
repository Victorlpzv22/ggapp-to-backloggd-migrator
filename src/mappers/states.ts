import { type GGAppStatus, type BackloggdStatus } from '../models/index.js';

const DEFAULT_MAPPING: Record<GGAppStatus, BackloggdStatus> = {
  jugando: 'playing',
  completado: 'played',
  abandonado: 'dropped',
  pendiente: 'backlog',
  'en pausa': 'paused',
  deseado: 'wishlist',
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
