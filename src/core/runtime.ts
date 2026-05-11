import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { AuditActor, AuditLogger } from './audit/logger.js';
import { loadConfig } from './config/index.js';
import type { Config } from './config/types.js';
import { getClaudeKey } from './keys.js';
import { type LlmClient, createLlmClient } from './llm/client.js';
import type { SkillContext, SkillSpec } from './skills/Skill.js';
import type { SkillRegistry } from './skills/registry.js';
import { isTelemetryEnabled, track } from './telemetry.js';
import { DEFAULT_TENANT_ID, type TenantId } from './types.js';

/**
 * What the caller passes to runtime.invoke. Input is `unknown` because the
 * caller (CLI parsing JSON, a webhook handler, etc.) typically doesn't know
 * the Skill's compile-time input shape — the Skill's Zod inputSchema validates
 * it at the boundary.
 *
 * `correlationId` (M1) — when an external orchestrator invokes Parrat, it
 * passes its workflow run identifier here. Parrat sets `workflow_id` on every
 * audit event to this value so audit logs correlate across systems. If
 * omitted, `workflow_id` defaults to `run_id`.
 */
export interface InvokeOptions {
  skill: string;
  input: unknown;
  actor: AuditActor;
  triggerMetadata?: Record<string, unknown>;
  correlationId?: string;
}

export interface CreateRuntimeOptions {
  registry: SkillRegistry;
  auditLogger: AuditLogger;
  tenantId?: TenantId;
  /**
   * Pre-loaded config. If omitted, runtime calls loadConfig() lazily on first
   * invoke. Tests typically inject a config directly to avoid filesystem
   * dependencies.
   */
  config?: Config;
  /**
   * Pre-built LLM client. If omitted, runtime constructs one lazily when an
   * invoked Skill declares `mcpServers` (i.e., needs to talk to Claude).
   * Tests can inject a mock client.
   */
  llmClient?: LlmClient;
}

export interface Runtime {
  invoke(options: InvokeOptions): Promise<unknown>;
}

/**
 * The runtime orchestrates a Skill invocation:
 *
 *   1. Look up the Skill by name (throws SkillNotFoundError if missing —
 *      pre-flight failure, NOT audited)
 *   2. Generate a fresh runId (UUID); set workflowId = correlationId ?? runId
 *   3. If the Skill needs config / LLM (declares `mcpServers`), lazily load
 *      config + construct an LlmClient. Otherwise leave undefined for
 *      pure-function Skills like hello-world.
 *   4. Build a SkillContext with tenantId, runId, workflowId, auditLogger,
 *      actor, config, llmClient
 *   5. Emit a `trigger` audit event capturing the input
 *   6. Run the Skill (input/output schema validation happens inside the Skill)
 *   7. On success: emit `skill_complete` with the output, return the output
 *      On failure: emit `error` with name + message, then rethrow
 *
 * Skills MAY write their own audit events via ctx.auditLogger (e.g., the
 * skill-executor emits `mcp_call` events on every Claude tool invocation).
 */
export function createRuntime(options: CreateRuntimeOptions): Runtime {
  const { registry, auditLogger } = options;
  const tenantId = options.tenantId ?? DEFAULT_TENANT_ID;
  let cachedConfig: Config | undefined = options.config;
  let cachedLlmClient: LlmClient | undefined = options.llmClient;

  async function getConfig(): Promise<Config> {
    if (cachedConfig) return cachedConfig;
    cachedConfig = await loadConfig();
    return cachedConfig;
  }

  async function getLlmClient(): Promise<LlmClient> {
    if (cachedLlmClient) return cachedLlmClient;
    const apiKey = await getClaudeKey(tenantId);
    cachedLlmClient = createLlmClient({ apiKey });
    return cachedLlmClient;
  }

  return {
    invoke: async ({ skill: skillName, input, actor, triggerMetadata, correlationId }) => {
      const skill = registry.lookup(skillName);
      const runId = randomUUID();
      const workflowId = correlationId ?? runId;
      const skillSpec = skill as SkillSpec<typeof skill.inputSchema, typeof skill.outputSchema>;
      const skillNeedsLlm = !!skillSpec.mcpServers && Object.keys(skillSpec.mcpServers).length > 0;

      // Lazy: only load config / construct LLM client when the Skill needs them.
      const config = skillNeedsLlm ? await getConfig() : undefined;
      const llmClient = skillNeedsLlm ? await getLlmClient() : undefined;

      const ctx: SkillContext = {
        tenantId,
        runId,
        workflowId,
        auditLogger,
        actor,
        ...(config ? { config } : {}),
        ...(llmClient ? { llmClient } : {}),
      };

      await auditLogger.write({
        type: 'trigger',
        tenantId,
        runId,
        workflowId,
        skill: skillName,
        actor,
        payload: { input, triggerMetadata: triggerMetadata ?? {} },
      });

      try {
        const output = await skill.run(input, ctx);
        await auditLogger.write({
          type: 'skill_complete',
          tenantId,
          runId,
          workflowId,
          skill: skillName,
          actor,
          payload: { output },
        });
        if (config && isTelemetryEnabled(config)) {
          await track({ event: 'skill_complete', properties: { skill: skillName } });
        }
        return output;
      } catch (e) {
        await auditLogger.write({
          type: 'error',
          tenantId,
          runId,
          workflowId,
          skill: skillName,
          actor,
          payload: {
            error_name: e instanceof Error ? e.name : 'UnknownError',
            error_message: e instanceof Error ? e.message : String(e),
          },
        });
        throw e;
      }
    },
  };
}
