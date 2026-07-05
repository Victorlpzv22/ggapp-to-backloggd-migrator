import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { loadConfig } from './config';

describe('loadConfig', () => {
  const testConfig = {
    stateMapping: { completado: 'playing' },
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
    expect(config.stateMapping?.completado).toBe('playing');
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
});
