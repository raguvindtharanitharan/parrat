import type { Config } from './schema.js';

/**
 * Apply PARRAT_<UPPERCASE_DOTTED> env vars as config overrides. The dotted
 * suffix maps to the config path, with underscores becoming dots and snake-case
 * preserved.
 *
 * Examples:
 *   PARRAT_TENANT_ID=acme            → config.tenant_id
 *   PARRAT_CLAUDE_MODEL=opus-4-7     → config.claude.model
 *   PARRAT_AUDIT_LOG_PATH=/var/log/  → config.audit.log_path
 *
 * Only string-leaf fields are overridable; numeric fields are coerced if the
 * env var parses cleanly. Unknown paths are ignored (no errors) so users can
 * have unrelated PARRAT_*-prefixed env vars without breakage.
 */
export function applyEnvOverrides(config: Config, env: NodeJS.ProcessEnv): Config {
  // Map of override path → known field type (so we can coerce correctly)
  const overrideMap: Record<
    string,
    { type: 'string' | 'number' | 'tenant'; apply: (cfg: Config, val: string) => Config }
  > = {
    PARRAT_TENANT_ID: {
      type: 'tenant',
      apply: (cfg, val) => ({ ...cfg, tenant_id: val }),
    },
    PARRAT_CLAUDE_MODEL: {
      type: 'string',
      apply: (cfg, val) => ({ ...cfg, claude: { ...cfg.claude, model: val } }),
    },
    PARRAT_CLAUDE_MAX_TURNS: {
      type: 'number',
      apply: (cfg, val) => ({
        ...cfg,
        claude: { ...cfg.claude, max_turns: Number.parseInt(val, 10) },
      }),
    },
    PARRAT_CLAUDE_MAX_TOKENS: {
      type: 'number',
      apply: (cfg, val) => ({
        ...cfg,
        claude: { ...cfg.claude, max_tokens: Number.parseInt(val, 10) },
      }),
    },
    PARRAT_CLAUDE_TEMPERATURE: {
      type: 'number',
      apply: (cfg, val) => ({
        ...cfg,
        claude: { ...cfg.claude, temperature: Number.parseFloat(val) },
      }),
    },
    PARRAT_AUDIT_LOG_PATH: {
      type: 'string',
      apply: (cfg, val) => ({ ...cfg, audit: { ...cfg.audit, log_path: val } }),
    },
    PARRAT_AUDIT_RETENTION_DAYS: {
      type: 'number',
      apply: (cfg, val) => ({
        ...cfg,
        audit: { ...cfg.audit, retention_days: Number.parseInt(val, 10) },
      }),
    },
  };

  let result = config;
  for (const [envVar, descriptor] of Object.entries(overrideMap)) {
    const value = env[envVar];
    if (value === undefined || value === '') continue;
    if (descriptor.type === 'number' && Number.isNaN(Number.parseFloat(value))) continue;
    result = descriptor.apply(result, value);
  }
  return result;
}
