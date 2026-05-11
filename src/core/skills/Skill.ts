import { ZodError, type ZodTypeAny, type z } from 'zod';
import type { AuditActor, AuditLogger } from '../audit/logger.js';
import type { Config, McpServerConfig } from '../config/types.js';
import { SchemaValidationError } from '../errors.js';
import type { LlmClient } from '../llm/client.js';
import type { TenantId } from '../types.js';

/**
 * Categorizes a Skill's role in the level model (see action-layer-design-notes.md).
 * v1 ships only `'investigation'` Skills; `'action'` and `'composite'` are
 * Phase 1+ concepts but the type ships in v1 for forward-compat.
 */
export type SkillKind = 'investigation' | 'action' | 'composite';

/**
 * Declares how an action Skill handles rollback. Type-only in v1; populated
 * by Phase 1+ action Skills.
 */
export type RollbackStrategy = 'best-effort' | 'transactional' | 'forward-only';

/**
 * Approval gate policy for action Skills (Phase 1+). Type-only in v1.
 */
export interface ApprovalPolicy {
  channel?: string;
  timeout?: string;
  approvers?: string[];
}

/**
 * Approval request issued by a composite Skill via SkillContext.requestApproval.
 * Type-only in v1; runtime stub is undefined.
 */
export interface ApprovalRequest {
  message: string;
  scope?: 'one-time' | 'session' | 'persistent';
}

export interface ApprovalResult {
  granted: boolean;
  approver_identity?: string;
  granted_at?: string;
  reason?: string;
}

/**
 * Per-Skill MCP server declaration. The `tools` array is the Skill's tool
 * allowlist (bare names; runtime resolves to `mcp__{server_name}__{tool_name}`
 * for the Claude Agent SDK's `allowedTools` parameter).
 */
export interface SkillMcpServer {
  config: McpServerConfig;
  tools: string[];
}

/**
 * Runtime context passed to every Skill invocation.
 *
 * - `workflowId` (M1) — defaults to `runId` for single-Skill executions; differs
 *   when invoked by a composite Skill (Phase 1+) or when an external orchestrator
 *   passes a `correlation_id` env var.
 * - `invokeSkill` / `requestApproval` — Phase 1+ stubs. Undefined in v1.
 */
export interface SkillContext {
  tenantId: TenantId;
  runId: string;
  workflowId: string;
  auditLogger: AuditLogger;
  /**
   * Who triggered the run (CLI user, webhook, scheduler, etc.). M1: runtime
   * always populates this. v1 Skills that don't need actor metadata can ignore.
   */
  actor?: AuditActor;
  /**
   * Loaded Parrat config — populated by runtime when present. Skills that
   * need config (LLM-driven Skills) read `ctx.config?.claude` etc.
   */
  config?: Config;
  /**
   * LLM client constructed by the runtime when the Skill declares
   * `mcpServers` in its spec. Pure-function Skills (e.g., hello-world) ignore.
   */
  llmClient?: LlmClient;
  invokeSkill?: (name: string, input: unknown) => Promise<unknown>;
  requestApproval?: (request: ApprovalRequest) => Promise<ApprovalResult>;
}

/**
 * The typed Skill specification — input/output Zod schemas + an async run method.
 * Generic over input/output schemas so TS can infer run's parameter and return types.
 *
 * M1 additions (all optional):
 * - `mcpServers` — declare which MCP servers + tool allowlist this Skill uses
 * - `systemPrompt` — system prompt for Skills that invoke the LLM client
 * - `kind` — defaults to 'investigation' when omitted
 * - `approvalRequired` / `rollbackStrategy` — type-only in v1; Phase 1+ usage
 */
export interface SkillSpec<TInputSchema extends ZodTypeAny, TOutputSchema extends ZodTypeAny> {
  name: string;
  inputSchema: TInputSchema;
  outputSchema: TOutputSchema;
  run(input: z.infer<TInputSchema>, ctx: SkillContext): Promise<z.infer<TOutputSchema>>;
  mcpServers?: Record<string, SkillMcpServer>;
  systemPrompt?: string;
  kind?: SkillKind;
  approvalRequired?: boolean | ApprovalPolicy;
  rollbackStrategy?: RollbackStrategy;
}

/**
 * Erased Skill type for registries holding heterogeneous Skills.
 * The registry doesn't know each Skill's specific schemas at compile time;
 * this type lets it store and dispatch them uniformly.
 */
export type Skill = SkillSpec<ZodTypeAny, ZodTypeAny>;

/**
 * Define a Skill with type inference and automatic input/output validation.
 *
 * The returned Skill's run() validates input against inputSchema before invoking
 * the user's run logic, then validates output against outputSchema before returning.
 * Validation failures are wrapped in SchemaValidationError (with the original
 * ZodError accessible via .cause) so callers can handle them uniformly.
 */
export function defineSkill<TInputSchema extends ZodTypeAny, TOutputSchema extends ZodTypeAny>(
  spec: SkillSpec<TInputSchema, TOutputSchema>,
): SkillSpec<TInputSchema, TOutputSchema> {
  const validate = <T>(schema: ZodTypeAny, value: unknown, direction: 'input' | 'output'): T => {
    try {
      return schema.parse(value) as T;
    } catch (e) {
      if (e instanceof ZodError) {
        throw new SchemaValidationError(direction, spec.name, e);
      }
      throw e;
    }
  };

  return {
    ...spec,
    run: async (input, ctx) => {
      const validInput = validate<z.infer<TInputSchema>>(spec.inputSchema, input, 'input');
      const output = await spec.run(validInput, ctx);
      return validate<z.infer<TOutputSchema>>(spec.outputSchema, output, 'output');
    },
  };
}
