import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import { loadConfig } from './config';
import * as logger from './logger';

describe('loadConfig', () => {
  const testConfig = {
    stateMapping: { Completed: 'playing' },
    headless: true,
  };

  beforeEach(() => {
    fs.writeFileSync('test-config.json', JSON.stringify(testConfig));
  });

  afterEach(() => {
    if (fs.existsSync('test-config.json')) {
      fs.unlinkSync('test-config.json');
    }
  });

  it('should load config from file', () => {
    const config = loadConfig('test-config.json');
    expect(config.stateMapping?.Completed).toBe('playing');
    expect(config.headless).toBe(true);
  });

  it('should return empty config if file does not exist', () => {
    const config = loadConfig('nonexistent.json');
    expect(config).toEqual({});
  });

  it('should return empty config on invalid JSON', () => {
    fs.writeFileSync('test-config.json', 'not-json');
    const config = loadConfig('test-config.json');
    expect(config).toEqual({});
  });

  it('logs a warning on invalid JSON so a typo is not silently ignored', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    fs.writeFileSync('test-config.json', '{not valid json}');
    const config = loadConfig('test-config.json');
    expect(config).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('Could not parse config');
    warnSpy.mockRestore();
  });
});
