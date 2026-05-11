import { z } from 'zod';

/**
 * Per-MCP-server configuration. The map key (e.g., "dbt") becomes the server
 * name in the Agent SDK's `mcp__{name}__{tool}` tool naming convention.
 *
 * Skills declare their own tool allowlist; the optional `tools` field on this
 * config can pre-restrict at the server level (Skill allowlists then intersect).
 */
export const mcpServerConfigSchema = z
  .object({
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
    tools: z.array(z.string()).optional(),
  })
  .strict();

/**
 * Defaults applied to every Skill invocation; per-Skill overrides go on the
 * Skill spec itself.
 */
export const skillDefaultsSchema = z
  .object({
    timeout_seconds: z.number().int().positive().default(60),
    max_retries: z.number().int().nonnegative().default(2),
  })
  .strict();

/**
 * Audit log configuration. Hashing/redaction fields ship in v1 schema but
 * are M4 deliverables; v1 ignores them at runtime.
 */
export const auditConfigSchema = z
  .object({
    log_path: z.string().default('.parrat/audit.jsonl'),
    hash_algorithm: z.literal('sha256').default('sha256'),
    retention_days: z.number().int().positive().default(90),
    redact_fields: z.array(z.string()).default([]),
    idempotency_window_hours: z.number().int().positive().default(24),
  })
  .strict();

/**
 * Claude / LLM client configuration. API key is sourced from ANTHROPIC_API_KEY
 * env var only — never declared here (avoids accidental commit).
 */
export const claudeConfigSchema = z
  .object({
    model: z.string().default('claude-sonnet-4-6'),
    max_turns: z.number().int().positive().default(6),
    max_tokens: z.number().int().positive().default(4096),
    temperature: z.number().min(0).max(1).default(0.0),
  })
  .strict();

/**
 * watch — which skill to run and what input to pass when `parrat watch` is invoked.
 * The schedule string is informational; actual scheduling is handled by the OS
 * (Task Scheduler / cron). Both fields are required when `watch` is present.
 */
export const watchConfigSchema = z
  .object({
    skill: z.string().min(1),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

/**
 * notify.slack — incoming webhook for Slack delivery. No OAuth; just a POST
 * to the webhook_url with a JSON body.
 */
export const slackNotifyConfigSchema = z
  .object({
    webhook_url: z.string().url(),
  })
  .strict();

export const notifyConfigSchema = z
  .object({
    slack: slackNotifyConfigSchema.optional(),
  })
  .strict();

/**
 * webhook — HTTP listener for external alert triggers (Monte Carlo, dbt Cloud).
 * `secret` is checked against the X-Parrat-Secret header if set.
 */
export const webhookConfigSchema = z
  .object({
    port: z.number().int().positive().default(8080),
    secret: z.string().optional(),
  })
  .strict();

/**
 * Top-level Parrat configuration. Versioned so future schema changes can
 * evolve without breaking existing config files.
 */
export const configSchema = z
  .object({
    version: z.literal(1),
    tenant_id: z.string().default('default'),
    mcpServers: z.record(z.string(), mcpServerConfigSchema).default({}),
    skills: z
      .object({
        defaults: skillDefaultsSchema.default({}),
      })
      .strict()
      .default({}),
    audit: auditConfigSchema.default({}),
    claude: claudeConfigSchema.default({}),
    watch: watchConfigSchema.optional(),
    notify: notifyConfigSchema.optional(),
    webhook: webhookConfigSchema.optional(),
  })
  .strict();

export type Config = z.infer<typeof configSchema>;
export type McpServerConfig = z.infer<typeof mcpServerConfigSchema>;
export type SkillDefaults = z.infer<typeof skillDefaultsSchema>;
export type AuditConfig = z.infer<typeof auditConfigSchema>;
export type ClaudeConfig = z.infer<typeof claudeConfigSchema>;
export type WatchConfig = z.infer<typeof watchConfigSchema>;
export type NotifyConfig = z.infer<typeof notifyConfigSchema>;
export type SlackNotifyConfig = z.infer<typeof slackNotifyConfigSchema>;
export type WebhookConfig = z.infer<typeof webhookConfigSchema>;
