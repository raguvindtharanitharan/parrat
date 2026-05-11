import { MissingClaudeKeyError } from './errors.js';
import type { TenantId } from './types.js';

/**
 * Resolve the Claude API key for a given tenant.
 *
 * v1 (OSS): reads ANTHROPIC_API_KEY from env, ignoring tenantId.
 * Phase 3+ (Cloud): looks up by tenantId in a secrets backend.
 * Phase 3+ (Enterprise): KMS / HSM lookup.
 *
 * Async because Phase 3+ implementations involve network calls; committing
 * to async now avoids a breaking-change refactor later.
 *
 * Throws MissingClaudeKeyError if no key is available.
 */
export async function getClaudeKey(_tenantId: TenantId): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new MissingClaudeKeyError();
  }
  return key;
}
