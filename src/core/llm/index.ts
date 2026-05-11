/**
 * Public API for the LLM reasoning layer. The client wraps the Anthropic
 * basic SDK with retry-on-transient logic; the skill executor orchestrates
 * Claude + MCP servers + audit emission for one Skill invocation.
 */
export { createLlmClient } from './client.js';
export type { CreateLlmClientOptions, LlmCallOptions, LlmClient } from './client.js';
export { executeSkill } from './skill-executor.js';
export type {
  SkillExecutorOptions,
  SkillExecutorResult,
  SkillMcpServer,
} from './skill-executor.js';
