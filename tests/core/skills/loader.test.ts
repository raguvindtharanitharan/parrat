import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidUserSkillError } from '../../../src/core/errors.js';
import { loadUserSkills } from '../../../src/core/skills/loader.js';
import { cleanupTempDir, makeTempDir } from '../../helpers/tempDir.js';

const VALID_SKILL_TS = `
import { z } from 'zod';
export default {
  name: 'test-user-skill',
  kind: 'investigation',
  inputSchema: z.object({ target: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  async run(input) { return { result: input.target }; },
};
`;

const NO_NAME_TS = `
import { z } from 'zod';
export default {
  kind: 'investigation',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
  async run() { return {}; },
};
`;

const NO_RUN_TS = `
import { z } from 'zod';
export default {
  name: 'broken',
  inputSchema: z.object({}),
  outputSchema: z.object({}),
};
`;

describe('loadUserSkills', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir('loader-test');
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it('returns [] when parrat-skills/ does not exist', async () => {
    expect(await loadUserSkills(tmpDir)).toEqual([]);
  });

  it('returns [] when parrat-skills/ is empty', async () => {
    await mkdir(join(tmpDir, 'parrat-skills'));
    expect(await loadUserSkills(tmpDir)).toEqual([]);
  });

  it('ignores non-.ts files in parrat-skills/', async () => {
    const dir = join(tmpDir, 'parrat-skills');
    await mkdir(dir);
    await writeFile(join(dir, 'skill.js'), 'module.exports = {};', 'utf8');
    await writeFile(join(dir, 'README.md'), '# hi', 'utf8');
    expect(await loadUserSkills(tmpDir)).toEqual([]);
  });

  it('loads a valid Skill from a .ts file', async () => {
    const dir = join(tmpDir, 'parrat-skills');
    await mkdir(dir);
    await writeFile(join(dir, 'test-user-skill.ts'), VALID_SKILL_TS, 'utf8');
    const loaded = await loadUserSkills(tmpDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.name).toBe('test-user-skill');
    expect(typeof loaded[0]?.run).toBe('function');
  });

  it('throws InvalidUserSkillError when default export has no name', async () => {
    const dir = join(tmpDir, 'parrat-skills');
    await mkdir(dir);
    await writeFile(join(dir, 'bad-skill.ts'), NO_NAME_TS, 'utf8');
    await expect(loadUserSkills(tmpDir)).rejects.toThrow(InvalidUserSkillError);
    await expect(loadUserSkills(tmpDir)).rejects.toThrow(/name/);
  });

  it('throws InvalidUserSkillError when default export has no run function', async () => {
    const dir = join(tmpDir, 'parrat-skills');
    await mkdir(dir);
    await writeFile(join(dir, 'bad-skill.ts'), NO_RUN_TS, 'utf8');
    await expect(loadUserSkills(tmpDir)).rejects.toThrow(InvalidUserSkillError);
    await expect(loadUserSkills(tmpDir)).rejects.toThrow(/run/);
  });
});
