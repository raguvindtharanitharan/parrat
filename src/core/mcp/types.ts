import type { McpServerConfig } from '../config/types.js';

export type { McpServerConfig };

/**
 * Computed per-Skill: which fully-qualified tool names the Skill wants
 * Claude to see. The fully-qualified names use the Claude Agent SDK
 * convention `mcp__{server_name}__{tool_name}` (double underscores).
 */
export interface ResolvedToolAllowlist {
  serverName: string;
  toolNames: readonly string[];
  fullyQualified: readonly string[];
}
