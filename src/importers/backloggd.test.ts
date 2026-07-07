import { describe, it, expect } from 'vitest';
import { parseUsernameFromHref } from './backloggd.js';

describe('parseUsernameFromHref', () => {
  it('extracts username from /u/<name>/profile', () => {
    expect(parseUsernameFromHref('/u/Victorlpzv/profile')).toBe('Victorlpzv');
  });
  it('strips trailing fragments', () => {
    expect(parseUsernameFromHref('/u/johndoe/lists#top')).toBe('johndoe');
  });
  it('returns null when no /u/ segment', () => {
    expect(parseUsernameFromHref('/users/sign_in')).toBeNull();
  });
  it('handles bare /u/<name>', () => {
    expect(parseUsernameFromHref('/u/jane')).toBe('jane');
  });
  it('returns null for empty string', () => {
    expect(parseUsernameFromHref('')).toBeNull();
  });
});
