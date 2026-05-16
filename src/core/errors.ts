import type { ZodError } from 'zod';

/**
 * Base class for all Parrat-thrown errors. Catch ParratError to handle anything
 * Parrat raises uniformly; catch a specific subclass for typed handling.
 *
 * All subclasses preserve the original Error message format used in v1.0 so
 * regex-based assertions and human-readable logs continue to work.
 */
export class ParratError extends Error {
  override readonly name: string = 'ParratError';
}

/**
 * Thrown by the Skill registry when a name is requested that wasn't registered.
 * Carries the requested name and the available names for programmatic recovery.
 */
export class SkillNotFoundError extends ParratError {
  override readonly name = 'SkillNotFoundError';

  constructor(
    public readonly skillName: string,
    public readonly available: readonly string[],
  ) {
    const list = available.join(', ') || '(none)';
    super(`Skill not found: '${skillName}'. Available skills: ${list}.`);
  }
}

/**
 * Thrown at registry creation when two Skills share the same name.
 */
export class DuplicateSkillError extends ParratError {
  override readonly name = 'DuplicateSkillError';

  constructor(public readonly skillName: string) {
    super(`Duplicate skill name: ${skillName}`);
  }
}

/**
 * Thrown when a Skill's input or output fails Zod validation.
 * Carries the direction (which boundary failed), the Skill name, and the
 * underlying ZodError accessible via `.cause`.
 */
export class SchemaValidationError extends ParratError {
  override readonly name = 'SchemaValidationError';

  constructor(
    public readonly direction: 'input' | 'output',
    public readonly skillName: string,
    cause: ZodError,
  ) {
    super(`Skill '${skillName}' ${direction} failed schema validation: ${cause.message}`, {
      cause,
    });
  }
}

/**
 * Thrown when the audit logger fails to write to disk (permissions, disk full,
 * EISDIR, etc.). The underlying error is accessible via `.cause`.
 */
export class AuditWriteError extends ParratError {
  override readonly name = 'AuditWriteError';

  constructor(
    public readonly filePath: string,
    cause: unknown,
  ) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to write audit log to '${filePath}': ${causeMsg}`, { cause });
  }
}

/**
 * Thrown by getClaudeKey when no Claude API key is available in the environment.
 * In v1 (OSS), the only resolution path is the ANTHROPIC_API_KEY env var.
 */
export class MissingClaudeKeyError extends ParratError {
  override readonly name = 'MissingClaudeKeyError';

  constructor() {
    super(
      'Claude API key not found. Set ANTHROPIC_API_KEY in your environment, or run `parrat init` to configure.',
    );
  }
}

/**
 * Thrown when the config loader can't find a config file at any expected path.
 * `source` indicates which lookup attempt failed: 'PARRAT_CONFIG_PATH' (env-var
 * override) or 'default' (./.parrat/config.yaml).
 */
export class ConfigNotFoundError extends ParratError {
  override readonly name = 'ConfigNotFoundError';

  constructor(
    public readonly path: string,
    public readonly source: 'PARRAT_CONFIG_PATH' | 'default',
  ) {
    const hint =
      source === 'PARRAT_CONFIG_PATH'
        ? `Expected a config at PARRAT_CONFIG_PATH='${path}' but no file exists there.`
        : `No config found at '${path}'. Run \`parrat init\` to scaffold one.`;
    super(`Parrat config not found: ${hint}`);
  }
}

/**
 * Thrown when a config file fails YAML parsing, schema validation, or env-var
 * resolution. The underlying error is accessible via `.cause`.
 */
export class ConfigValidationError extends ParratError {
  override readonly name = 'ConfigValidationError';

  constructor(
    public readonly path: string,
    public readonly stage: string,
    cause: unknown,
  ) {
    const causeMsg = cause instanceof Error ? cause.message : String(cause ?? '');
    super(`Config validation failed at '${path}' (${stage}): ${causeMsg}`, { cause });
  }
}

/**
 * Thrown when an MCP server subprocess fails to start (e.g. dbt not on PATH).
 * The message includes the server name and actionable fix guidance.
 */
export class McpServerStartError extends ParratError {
  override readonly name = 'McpServerStartError';

  constructor(public readonly serverName: string) {
    super(
      `MCP server '${serverName}' failed to start. Check DBT_PATH in .parrat/config.yaml — dbt may not be on your PATH.\nFind your dbt path: which dbt (Mac/Linux) or where dbt (Windows), or look in your virtual environment at .venv/bin/dbt (Mac/Linux) or .venv\\Scripts\\dbt.exe (Windows).`,
    );
  }
}

/**
 * Thrown when Claude attempts to invoke an MCP tool that isn't in the Skill's
 * allowlist. Should never trigger if Agent SDK filtering is configured
 * correctly; defensive check for Phase 1+ when custom MCP servers are added.
 */
export class McpToolDeniedError extends ParratError {
  override readonly name = 'McpToolDeniedError';

  constructor(
    public readonly toolName: string,
    public readonly allowlist: readonly string[],
  ) {
    const allowed = allowlist.join(', ') || '(none)';
    super(`MCP tool '${toolName}' is not in this Skill's allowlist. Allowed: ${allowed}.`);
  }
}

/**
 * Thrown when the LLM tool-call loop exceeds the Skill's max_turns budget
 * without returning a final answer. The Skill should be redesigned with a
 * higher budget OR a tighter prompt if this fires.
 */
export class MaxTurnsExceededError extends ParratError {
  override readonly name = 'MaxTurnsExceededError';

  constructor(
    public readonly skillName: string,
    public readonly maxTurns: number,
  ) {
    super(
      `Skill '${skillName}' did not converge within max_turns=${maxTurns}. Increase max_turns or refine the system prompt.`,
    );
  }
}

/**
 * Thrown when a user Skill file in parrat-skills/ fails to load — either
 * because the default export is missing or doesn't conform to the Skill shape.
 */
export class InvalidUserSkillError extends ParratError {
  override readonly name = 'InvalidUserSkillError';

  constructor(
    public readonly filePath: string,
    reason: string,
  ) {
    super(`Invalid Skill in '${filePath}': ${reason}`);
  }
}

/**
 * Thrown on Anthropic API failures after retry exhaustion (transient errors)
 * or on the first 4xx response (auth, malformed request). The underlying
 * Anthropic error is accessible via `.cause`.
 */
export class LlmApiError extends ParratError {
  override readonly name = 'LlmApiError';

  constructor(message: string, cause: unknown) {
    super(message, { cause });
  }
}
