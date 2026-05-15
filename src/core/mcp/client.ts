import { Client as McpSdkClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { McpServerStartError } from '../errors.js';
import type { McpServerConfig } from './types.js';

/**
 * Tool definition exposed by an MCP server. Matches the @modelcontextprotocol/sdk
 * shape for `tools/list` results.
 */
export interface McpToolDefinition {
  name: string;
  description?: string | undefined;
  inputSchema: Record<string, unknown>;
}

export interface McpToolCallResult {
  content: unknown;
  isError?: boolean | undefined;
}

/**
 * Connected MCP client — wraps the @modelcontextprotocol/sdk Client + a
 * StdioClientTransport. The lifecycle is tied to a single Skill invocation:
 * spawn → use → close in a try/finally.
 */
export interface McpClient {
  readonly serverName: string;
  listTools(): Promise<McpToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult>;
  close(): Promise<void>;
}

/**
 * Spawn an MCP server as a subprocess and connect to it over stdio. Returns
 * a connected McpClient ready for listTools / callTool. Caller MUST call
 * close() when done (use try/finally).
 *
 * Inherits parent process env when `config.env` is not set, mirroring the
 * @modelcontextprotocol/sdk default. Concrete env values from config are
 * merged on top.
 */
export async function connectMcpClient(
  serverName: string,
  config: McpServerConfig,
): Promise<McpClient> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: [...config.args],
    env: { ...process.env, ...config.env } as Record<string, string>,
    stderr: 'pipe',
  });

  const sdkClient = new McpSdkClient(
    { name: 'parrat-mcp-client', version: '0.0.0' },
    { capabilities: {} },
  );

  try {
    await sdkClient.connect(transport);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Connection closed') || msg.includes('-32000')) {
      throw new McpServerStartError(serverName);
    }
    throw e;
  }

  return {
    serverName,
    async listTools() {
      const result = await sdkClient.listTools();
      return result.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
      }));
    },
    async callTool(name, args) {
      const result = await sdkClient.callTool({ name, arguments: args });
      return {
        content: result.content,
        isError: typeof result.isError === 'boolean' ? result.isError : undefined,
      };
    },
    async close() {
      await sdkClient.close();
    },
  };
}
