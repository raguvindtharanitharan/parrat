import { access, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { InvalidUserSkillError } from '../errors.js';
import type { Skill } from './Skill.js';

/**
 * Discovers and loads user-authored Skills from `<cwd>/parrat-skills/*.ts`.
 * Returns [] silently when the directory does not exist or contains no .ts files.
 * Throws InvalidUserSkillError if a file's default export fails the Skill shape check.
 */
export async function loadUserSkills(cwd: string): Promise<Skill[]> {
  const skillsDir = join(cwd, 'parrat-skills');

  try {
    await access(skillsDir);
  } catch {
    return [];
  }

  const entries = await readdir(skillsDir);
  const tsFiles = entries.filter((f) => f.endsWith('.ts'));
  if (tsFiles.length === 0) return [];

  const { register } = await import('tsx/esm/api');
  const unregister = register();

  const loaded: Skill[] = [];
  try {
    for (const file of tsFiles) {
      const absPath = resolve(skillsDir, file);
      const mod = await import(absPath);
      validateSkillShape(mod.default, absPath);
      loaded.push(mod.default as Skill);
    }
  } finally {
    unregister();
  }

  return loaded;
}

function validateSkillShape(value: unknown, filePath: string): void {
  if (value === null || typeof value !== 'object') {
    throw new InvalidUserSkillError(filePath, 'default export must be an object');
  }
  const obj = value as Record<string, unknown>;
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    throw new InvalidUserSkillError(filePath, 'default export must have a non-empty string "name"');
  }
  if (typeof obj.run !== 'function') {
    throw new InvalidUserSkillError(filePath, 'default export must have a "run" function');
  }
  if (typeof (obj.inputSchema as Record<string, unknown> | undefined)?.parse !== 'function') {
    throw new InvalidUserSkillError(filePath, 'default export must have a Zod "inputSchema"');
  }
  if (typeof (obj.outputSchema as Record<string, unknown> | undefined)?.parse !== 'function') {
    throw new InvalidUserSkillError(filePath, 'default export must have a Zod "outputSchema"');
  }
}
