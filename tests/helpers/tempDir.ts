import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Create a fresh temp directory for a test. Returns the path; caller is
 * responsible for cleanup (typically in afterEach via cleanupTempDir).
 */
export async function makeTempDir(prefix = 'parrat-test'): Promise<string> {
  const path = join(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(path, { recursive: true });
  return path;
}

export async function cleanupTempDir(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
