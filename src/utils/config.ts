import * as fs from 'node:fs';
import * as path from 'node:path';
import { type MigratorConfig } from '../models/index.js';
import { info, warn } from './logger.js';

const DEFAULT_CONFIG_PATH = 'migrator.config.json';

export function loadConfig(configPath?: string): MigratorConfig {
  const filePath = configPath ?? DEFAULT_CONFIG_PATH;
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const config = JSON.parse(raw) as MigratorConfig;
    info(`Loaded config from ${filePath}`);
    return config;
  } catch (err) {
    warn(`Could not parse config from ${filePath}: ${err instanceof Error ? err.message : String(err)}. Using defaults.`);
    return {};
  }
}
