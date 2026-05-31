import { access, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { InvalidUserPlaybookError } from '../errors.js';
import type { Playbook } from './Playbook.js';

/**
 * Discovers and loads user-authored Playbooks from `<cwd>/parrat-playbooks/*.ts`.
 * Returns [] silently when the directory does not exist or contains no .ts files.
 * Throws InvalidUserPlaybookError if a file's default export fails the Playbook shape check.
 */
export async function loadUserPlaybooks(cwd: string): Promise<Playbook[]> {
  const playbooksDir = join(cwd, 'parrat-playbooks');

  try {
    await access(playbooksDir);
  } catch {
    return [];
  }

  const entries = await readdir(playbooksDir);
  const tsFiles = entries.filter((f) => f.endsWith('.ts'));
  if (tsFiles.length === 0) return [];

  const { register } = await import('tsx/esm/api');
  const unregister = register();

  const loaded: Playbook[] = [];
  try {
    for (const file of tsFiles) {
      const absPath = resolve(playbooksDir, file);
      const mod = await import(absPath);
      validatePlaybookShape(mod.default, absPath);
      loaded.push(mod.default as Playbook);
    }
  } finally {
    unregister();
  }

  return loaded;
}

function validatePlaybookShape(value: unknown, filePath: string): void {
  if (value === null || typeof value !== 'object') {
    throw new InvalidUserPlaybookError(filePath, 'default export must be an object');
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    throw new InvalidUserPlaybookError(
      filePath,
      'default export must have a non-empty string "name"',
    );
  }
  if (typeof obj.run !== 'function') {
    throw new InvalidUserPlaybookError(filePath, 'default export must have a "run" function');
  }
  if (typeof (obj.inputSchema as Record<string, unknown> | undefined)?.parse !== 'function') {
    throw new InvalidUserPlaybookError(filePath, 'default export must have a Zod "inputSchema"');
  }
  if (typeof (obj.outputSchema as Record<string, unknown> | undefined)?.parse !== 'function') {
    throw new InvalidUserPlaybookError(filePath, 'default export must have a Zod "outputSchema"');
  }
}
