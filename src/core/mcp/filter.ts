import { McpToolDeniedError } from '../errors.js';
import type { ResolvedToolAllowlist } from './types.js';

/**
 * Compute the fully-qualified tool names for a Playbook's tool allowlist. Used
 * to construct the Claude Agent SDK's `allowedTools` array — see
 * https://platform.claude.com/docs/en/agent-sdk/mcp for naming convention.
 *
 * Example: resolveAllowlist('dbt', ['list', 'get_node_details_dev']) →
 *          { fullyQualified: ['mcp__dbt__list', 'mcp__dbt__get_node_details_dev'] }
 */
export function resolveAllowlist(
  serverName: string,
  toolNames: readonly string[],
): ResolvedToolAllowlist {
  return {
    serverName,
    toolNames,
    fullyQualified: toolNames.map((name) => `mcp__${serverName}__${name}`),
  };
}

/**
 * Aggregate multiple resolved allowlists into a single deduplicated array of
 * fully-qualified tool names suitable for the Agent SDK's `allowedTools`.
 */
export function aggregateAllowlists(
  allowlists: readonly ResolvedToolAllowlist[],
): readonly string[] {
  const seen = new Set<string>();
  for (const list of allowlists) {
    for (const name of list.fullyQualified) {
      seen.add(name);
    }
  }
  return [...seen];
}

/**
 * Defensive assertion — throws McpToolDeniedError if a tool call surfaces
 * outside the allowlist. The Agent SDK's `allowedTools` should prevent this
 * at the source; this is a defense-in-depth check for Phase 1+ when custom
 * MCP proxies or non-SDK clients may be involved.
 */
export function assertToolAllowed(toolName: string, allowlist: readonly string[]): void {
  if (!allowlist.includes(toolName)) {
    throw new McpToolDeniedError(toolName, allowlist);
  }
}
