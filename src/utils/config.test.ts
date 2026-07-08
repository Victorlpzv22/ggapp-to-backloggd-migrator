import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadConfig } from './config';
import * as logger from './logger';

describe('loadConfig', () => {
  const testConfig = {
    stateMapping: { Completed: 'playing' },
    headless: true,
  };
  const tmpFile = path.join(
    os.tmpdir(),
    `migrator-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );

  beforeEach(() => {
    fs.writeFileSync(tmpFile, JSON.stringify(testConfig));
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  it('should load config from file', () => {
    const config = loadConfig(tmpFile);
    expect(config.stateMapping?.Completed).toBe('playing');
    expect(config.headless).toBe(true);
  });

  it('should return empty config if file does not exist', () => {
    const config = loadConfig(path.join(os.tmpdir(), `migrator-nonexistent-${Math.random()}.json`));
    expect(config).toEqual({});
  });

  it('should return empty config on invalid JSON', () => {
    fs.writeFileSync(tmpFile, 'not-json');
    const config = loadConfig(tmpFile);
    expect(config).toEqual({});
  });

  it('logs a warning on invalid JSON so a typo is not silently ignored', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    fs.writeFileSync(tmpFile, '{not valid json}');
    const config = loadConfig(tmpFile);
    expect(config).toEqual({});
    expect(warnSpy).toHaveBeenCalled();
    const message = warnSpy.mock.calls[0][0] as string;
    expect(message).toContain('Could not parse config');
    warnSpy.mockRestore();
  });
});
