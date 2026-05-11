import { describe, expect, it } from 'vitest';
import { DEFAULT_TENANT_ID, type ParratEntity } from '../../src/core/types.js';

describe('core/types', () => {
  it('DEFAULT_TENANT_ID is "default"', () => {
    expect(DEFAULT_TENANT_ID).toBe('default');
  });

  it('ParratEntity shape accepts tenantId', () => {
    const sample: ParratEntity = { tenantId: DEFAULT_TENANT_ID };
    expect(sample.tenantId).toBe('default');
  });
});
