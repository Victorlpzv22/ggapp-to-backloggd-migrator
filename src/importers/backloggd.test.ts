import { describe, it, expect } from 'vitest';
import { parseUsernameFromHref, isNotFoundScenario } from './backloggd.js';

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

describe('isNotFoundScenario', () => {
  it('true on title exactly "Game not found" with no nav error', () => {
    expect(isNotFoundScenario('Game not found', false)).toBe(true);
  });
  it('false on a real page title', () => {
    expect(isNotFoundScenario('Hades — Backloggd', false)).toBe(false);
  });
  it('false when navigation errored (transient, not a real 404)', () => {
    expect(isNotFoundScenario('Game not found', true)).toBe(false);
  });
  it('false on any non-matching title', () => {
    expect(isNotFoundScenario('Some other page', false)).toBe(false);
  });
});
