import type { McpClient, McpToolCallResult, McpToolDefinition } from '../../src/core/mcp/client.js';

/**
 * In-process MCP client mock for L3 Skill tests. Records every tool call so
 * tests can assert on routing + args; returns canned responses keyed by tool
 * name (or via per-call response queues for fine-grained scenarios).
 *
 * Usage:
 *   const mock = createMockMcpClient('dbt', [
 *     { name: 'list', description: 'List nodes', inputSchema: {} },
 *     { name: 'get_node_details_dev', description: '...', inputSchema: {} },
 *   ]);
 *   mock.queueResponse('list', { nodes: [...] });
 *   // Skill invocation routes through mock.callTool(...)
 *   expect(mock.calls).toEqual([{ name: 'list', args: {} }]);
 */
export interface MockMcpClient extends McpClient {
  readonly calls: ReadonlyArray<{ name: string; args: Record<string, unknown> }>;
  queueResponse(toolName: string, content: unknown, isError?: boolean): void;
  setDefaultResponse(toolName: string, content: unknown, isError?: boolean): void;
}

export function createMockMcpClient(serverName: string, tools: McpToolDefinition[]): MockMcpClient {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const queues = new Map<string, McpToolCallResult[]>();
  const defaults = new Map<string, McpToolCallResult>();

  return {
    serverName,
    async listTools() {
      return tools;
    },
    async callTool(name, args) {
      calls.push({ name, args });
      const queue = queues.get(name);
      if (queue && queue.length > 0) {
        const next = queue.shift();
        if (next) return next;
      }
      const fallback = defaults.get(name);
      if (fallback) return fallback;
      return { content: { mock: true, name, args } };
    },
    async close() {
      // no-op
    },
    get calls() {
      return calls;
    },
    queueResponse(toolName, content, isError) {
      const queue = queues.get(toolName) ?? [];
      const result: McpToolCallResult = {
        content,
        ...(isError !== undefined ? { isError } : {}),
      };
      queue.push(result);
      queues.set(toolName, queue);
    },
    setDefaultResponse(toolName, content, isError) {
      const result: McpToolCallResult = {
        content,
        ...(isError !== undefined ? { isError } : {}),
      };
      defaults.set(toolName, result);
    },
  };
}
