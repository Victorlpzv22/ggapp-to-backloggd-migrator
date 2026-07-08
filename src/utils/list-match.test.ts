import { describe, it, expect } from 'vitest';
import { rankLinkMatch, normalizeLinkText } from './list-match.js';

describe('normalizeLinkText', () => {
  it('lowercases and strips trademarks', () => {
    expect(normalizeLinkText('Hades™')).toBe('hades');
  });
  it('normalizes straight, backtick, and acute apostrophes to a space (matches normalizeForMatchExtended)', () => {
    expect(normalizeLinkText("Assassin's Creed")).toBe('assassin s creed');
    expect(normalizeLinkText('Assassin`s Creed')).toBe('assassin s creed');
    expect(normalizeLinkText('Assassin´s Creed')).toBe('assassin s creed');
  });
  it('strips U+2019 because \\w does not match it (matches normalizeForMatchExtended behavior)', () => {
    expect(normalizeLinkText('Assassin’s Creed')).toBe('assassin s creed');
  });
  it('strips non-word/non-space/non-hyphen characters and collapses runs', () => {
    expect(normalizeLinkText('Mario + Rabbids!')).toBe('mario rabbids');
  });
  it('collapses whitespace and hyphens to single spaces', () => {
    expect(normalizeLinkText('hellblade  ---  ii')).toBe('hellblade ii');
  });
});

describe('rankLinkMatch', () => {
  it('returns exact when normalized raw equals query', () => {
    expect(rankLinkMatch('Hades', 'hades')).toBe('exact');
  });
  it('returns prefix when raw starts with query', () => {
    expect(rankLinkMatch('Hades II', 'hades')).toBe('prefix');
  });
  it('returns null when no match', () => {
    expect(rankLinkMatch('Celeste', 'hades')).toBeNull();
  });
  it('ignores case after normalization', () => {
    expect(rankLinkMatch('HADES', 'hades')).toBe('exact');
  });
  it('exact wins over prefix when query would match as both', () => {
    expect(rankLinkMatch('hades ii', 'hades')).toBe('prefix');
  });
});
