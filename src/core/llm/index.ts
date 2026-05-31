/**
 * Public API for the LLM reasoning layer. The client wraps the Anthropic
 * basic SDK with retry-on-transient logic; the playbook executor orchestrates
 * Claude + MCP servers + audit emission for one Playbook invocation.
 */
export { createLlmClient } from './client.js';
export type { CreateLlmClientOptions, LlmCallOptions, LlmClient } from './client.js';
export { executePlaybook } from './playbook-executor.js';
export type {
  PlaybookExecutorOptions,
  PlaybookExecutorResult,
  PlaybookMcpServer,
} from './playbook-executor.js';
