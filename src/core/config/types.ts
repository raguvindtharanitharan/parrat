/**
 * Re-export of TypeScript types derived from Zod schemas. Imported by
 * downstream modules so they don't need to depend on Zod directly.
 */
export type {
  AuditConfig,
  ClaudeConfig,
  Config,
  McpServerConfig,
  NotifyConfig,
  SkillDefaults,
  SlackNotifyConfig,
  WatchConfig,
  WebhookConfig,
} from './schema.js';
