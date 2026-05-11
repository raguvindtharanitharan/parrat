import { afterEach, describe, expect, it, vi } from 'vitest';
import { MissingClaudeKeyError } from '../../src/core/errors.js';
import { getClaudeKey } from '../../src/core/keys.js';
import { DEFAULT_TENANT_ID } from '../../src/core/types.js';

describe('core/keys', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the value of ANTHROPIC_API_KEY when set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test-12345');
    const key = await getClaudeKey(DEFAULT_TENANT_ID);
    expect(key).toBe('sk-test-12345');
  });

  it('throws MissingClaudeKeyError when ANTHROPIC_API_KEY is not set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await expect(getClaudeKey(DEFAULT_TENANT_ID)).rejects.toThrow(MissingClaudeKeyError);
  });

  it('ignores tenantId in v1 (returns same key regardless of tenant)', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-from-env');
    const keyDefault = await getClaudeKey(DEFAULT_TENANT_ID);
    const keyOther = await getClaudeKey('other-tenant');
    expect(keyDefault).toBe('sk-from-env');
    expect(keyOther).toBe('sk-from-env');
  });
});
