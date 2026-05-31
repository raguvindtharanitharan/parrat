import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InvalidUserPlaybookError } from '../../../src/core/errors.js';
import { loadUserPlaybooks } from '../../../src/core/playbooks/loader.js';
import { cleanupTempDir, makeTempDir } from '../../helpers/tempDir.js';

const VALID_SKILL_TS = `
import { z } from 'zod';
export default {
  name: 'test-user-playbook',
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

describe('loadUserPlaybooks', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir('loader-test');
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  it('returns [] when parrat-playbooks/ does not exist', async () => {
    expect(await loadUserPlaybooks(tmpDir)).toEqual([]);
  });

  it('returns [] when parrat-playbooks/ is empty', async () => {
    await mkdir(join(tmpDir, 'parrat-playbooks'));
    expect(await loadUserPlaybooks(tmpDir)).toEqual([]);
  });

  it('ignores non-.ts files in parrat-playbooks/', async () => {
    const dir = join(tmpDir, 'parrat-playbooks');
    await mkdir(dir);
    await writeFile(join(dir, 'playbook.js'), 'module.exports = {};', 'utf8');
    await writeFile(join(dir, 'README.md'), '# hi', 'utf8');
    expect(await loadUserPlaybooks(tmpDir)).toEqual([]);
  });

  it('loads a valid Playbook from a .ts file', async () => {
    const dir = join(tmpDir, 'parrat-playbooks');
    await mkdir(dir);
    await writeFile(join(dir, 'test-user-playbook.ts'), VALID_SKILL_TS, 'utf8');
    const loaded = await loadUserPlaybooks(tmpDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.name).toBe('test-user-playbook');
    expect(typeof loaded[0]?.run).toBe('function');
  });

  it('throws InvalidUserPlaybookError when default export has no name', async () => {
    const dir = join(tmpDir, 'parrat-playbooks');
    await mkdir(dir);
    await writeFile(join(dir, 'bad-playbook.ts'), NO_NAME_TS, 'utf8');
    await expect(loadUserPlaybooks(tmpDir)).rejects.toThrow(InvalidUserPlaybookError);
    await expect(loadUserPlaybooks(tmpDir)).rejects.toThrow(/name/);
  });

  it('throws InvalidUserPlaybookError when default export has no run function', async () => {
    const dir = join(tmpDir, 'parrat-playbooks');
    await mkdir(dir);
    await writeFile(join(dir, 'bad-playbook.ts'), NO_RUN_TS, 'utf8');
    await expect(loadUserPlaybooks(tmpDir)).rejects.toThrow(InvalidUserPlaybookError);
    await expect(loadUserPlaybooks(tmpDir)).rejects.toThrow(/run/);
  });
});
