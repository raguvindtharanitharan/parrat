import { describe, expect, it } from 'vitest';
import { type EnterpriseFeature, featureEnabled } from '../../src/core/license.js';

describe('core/license', () => {
  const features: EnterpriseFeature[] = ['audit_redaction', 'multi_tenant', 'sso'];

  for (const feature of features) {
    it(`featureEnabled('${feature}') returns false (v1 stub)`, () => {
      expect(featureEnabled(feature)).toBe(false);
    });
  }
});
