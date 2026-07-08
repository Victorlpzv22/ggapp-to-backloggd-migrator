import { describe, it, expect } from 'vitest';
import {
  buildSlugVariants,
  buildCleanSlug,
  normalizeForSearch,
  stripTrademarks,
  normalizeApostrophes,
  stripDuplicateTag,
  normalizeForMatch,
  normalizeForMatchExtended,
  slugToDisplayName,
} from './slug';

describe('slug utils', () => {
  it('strips trademark symbols', () => {
    expect(stripTrademarks('Minecraft™')).toBe('Minecraft');
    expect(stripTrademarks('Foo® Bar©')).toBe('Foo Bar');
  });
  it('normalizeApostrophes converts straight, backtick, acute to straight apostrophe; leaves U+2019 alone', () => {
    expect(normalizeApostrophes("Foo'Bar")).toBe("Foo'Bar");
    expect(normalizeApostrophes('Foo`Bar')).toBe("Foo'Bar");
    expect(normalizeApostrophes('Foo´Bar')).toBe("Foo'Bar");
    expect(normalizeApostrophes('Foo’Bar')).toBe('Foo’Bar');
  });
  it('strips [duplicate] tag case-insensitively', () => {
    expect(stripDuplicateTag('Halo [Duplicate]')).toBe('Halo');
  });
  it('normalizeForSearch collapses whitespace, strips trademarks, trims', () => {
    expect(normalizeForSearch('  Hellblade  II™ ')).toBe('Hellblade II');
  });
  it('buildCleanSlug default removes apostrophe (regex char-class), stripApos=true gives different output', () => {
    expect(buildCleanSlug("Assassin's Creed II")).toBe('assassin-s-creed-ii');
    expect(buildCleanSlug("Assassin's Creed II", true)).toBe('assassins-creed-ii');
    expect(buildCleanSlug("Assassin's Creed II", true)).not.toBe(
      buildCleanSlug("Assassin's Creed II"),
    );
  });
  it('buildSlugVariants with originalSlug: original first, then clean, then arabic', () => {
    expect(buildSlugVariants('Hellblade II', 'hellblade-2')).toEqual([
      'hellblade-2',
      'hellblade-ii',
    ]);
  });
  it('buildSlugVariants without originalSlug: clean first, then arabic', () => {
    expect(buildSlugVariants('Hellblade II')).toEqual(['hellblade-ii', 'hellblade-2']);
  });
  it('normalizeForMatch dedupes and sorts tokens alphabetically', () => {
    expect(normalizeForMatch('the legend of zelda')).toBe('legend of the zelda');
  });
  it('normalizeForMatchExtended strips non-word chars, collapses whitespace', () => {
    expect(normalizeForMatchExtended('Mario + Rabbids!')).toBe('mario rabbids');
  });
  it('slugToDisplayName lowercases small-words but capitalizes other tokens', () => {
    expect(slugToDisplayName('the-legend-of-zelda')).toBe('the Legend of Zelda');
    expect(slugToDisplayName('hello-world')).toBe('Hello World');
  });
});
