/**
 * Enterprise / paid-tier features. The v1 list reflects the architectural
 * opinions baked in (audit redaction, multi-tenant runtime, SSO). New feature
 * names land here when their gates ship.
 */
export type EnterpriseFeature = 'audit_redaction' | 'multi_tenant' | 'sso';

/**
 * Whether an Enterprise feature is enabled in the current installation.
 *
 * v1 stub: always returns false. The license-key check ships in Phase 3+
 * Enterprise, validating against a license server and caching the result.
 *
 * Crucially, no v1 code path is crippled by this gate — only Enterprise-only
 * features are gated, and those don't exist yet. This is shape, not function.
 */
export function featureEnabled(_feature: EnterpriseFeature): boolean {
  return false;
}
