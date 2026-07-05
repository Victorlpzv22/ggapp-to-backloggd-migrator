import { type BrowserContext } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_SESSION_DIR = 'sessions';

export function getSessionPath(site: string, sessionDir?: string): string {
  const dir = sessionDir ?? DEFAULT_SESSION_DIR;
  return path.join(dir, `${site}.json`);
}

export async function saveSession(
  context: BrowserContext,
  site: string,
  sessionDir?: string,
): Promise<void> {
  const filePath = getSessionPath(site, sessionDir);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  await context.storageState({ path: filePath });
}

export function sessionExists(site: string, sessionDir?: string): boolean {
  return fs.existsSync(getSessionPath(site, sessionDir));
}
