import { describe, it, expect } from 'vitest';
import { mapStatus } from './states';

describe('mapStatus', () => {
  it('should map Want to Play to backlog', () => {
    expect(mapStatus('Want to Play')).toBe('backlog');
  });

  it('should map Playing to playing', () => {
    expect(mapStatus('Playing')).toBe('playing');
  });

  it('should map Beaten to played', () => {
    expect(mapStatus('Beaten')).toBe('played');
  });

  it('should map Completed to played', () => {
    expect(mapStatus('Completed')).toBe('played');
  });

  it('should map Shelved to paused', () => {
    expect(mapStatus('Shelved')).toBe('paused');
  });

  it('should map Abandoned to dropped', () => {
    expect(mapStatus('Abandoned')).toBe('dropped');
  });

  it('should map Wishlist to backlog (merged with Want to Play)', () => {
    expect(mapStatus('Wishlist')).toBe('backlog');
  });

  it('should use custom mapping when provided', () => {
    const customMapping = { Completed: 'backlog' as const };
    expect(mapStatus('Completed', customMapping)).toBe('backlog');
  });

  it('should fall back to default for unmapped status', () => {
    const customMapping = { Playing: 'backlog' as const } as Partial<
      Record<import('../models/index.js').GGAppStatus, import('../models/index.js').BackloggdStatus>
    >;
    expect(mapStatus('Beaten', customMapping)).toBe('played');
  });
});
