/**
 * Public API for the MCP integration layer. Filter helpers compute the
 * fully-qualified tool names (`mcp__server__tool` convention). The client
 * spawns an MCP server as a subprocess and exposes listTools/callTool.
 */
export { connectMcpClient } from './client.js';
export type { McpClient, McpToolCallResult, McpToolDefinition } from './client.js';
export { aggregateAllowlists, assertToolAllowed, resolveAllowlist } from './filter.js';
export type { McpServerConfig, ResolvedToolAllowlist } from './types.js';
