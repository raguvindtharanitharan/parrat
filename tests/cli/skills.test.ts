import { describe, expect, it } from 'vitest';
import { listSkillNames } from '../../src/cli/skills.js';

describe('cli/skills', () => {
  it('returns the list of installed Skill names, sorted, including freshness-investigation', async () => {
    const names = await listSkillNames(process.cwd());
    expect(names).toContain('freshness-investigation');
    expect(names).toEqual([...names].sort());
  });
});
