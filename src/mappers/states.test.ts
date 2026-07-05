import { describe, it, expect } from 'vitest';
import { mapStatus } from './states';

describe('mapStatus', () => {
  it('should map jugando to playing', () => {
    expect(mapStatus('jugando')).toBe('playing');
  });

  it('should map completado to played', () => {
    expect(mapStatus('completado')).toBe('played');
  });

  it('should map abandonado to dropped', () => {
    expect(mapStatus('abandonado')).toBe('dropped');
  });

  it('should map pendiente to backlog', () => {
    expect(mapStatus('pendiente')).toBe('backlog');
  });

  it('should map en pausa to paused', () => {
    expect(mapStatus('en pausa')).toBe('paused');
  });

  it('should map deseado to wishlist', () => {
    expect(mapStatus('deseado')).toBe('wishlist');
  });

  it('should use custom mapping when provided', () => {
    const customMapping = { completado: 'playing' as const };
    expect(mapStatus('completado', customMapping)).toBe('playing');
  });

  it('should fall back to default for unmapped status', () => {
    const customMapping = { pendiente: 'paused' as const };
    expect(mapStatus('completado', customMapping)).toBe('played');
  });
});
