import { describe, expect, it } from 'vitest';
import { listPlaybookNames } from '../../src/cli/playbooks.js';

describe('cli/playbooks', () => {
  it('returns the list of installed Playbook names, sorted, including freshness-investigation', async () => {
    const names = await listPlaybookNames(process.cwd());
    expect(names).toContain('freshness-investigation');
    expect(names).toEqual([...names].sort());
  });
});
