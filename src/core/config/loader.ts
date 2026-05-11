import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { ConfigNotFoundError, ConfigValidationError } from '../errors.js';
import { applyEnvOverrides } from './overrides.js';
import { type Config, configSchema } from './schema.js';

const ENV_VAR_PATTERN = /\$([A-Z_][A-Z0-9_]*)|\$\{([A-Z_][A-Z0-9_]*)\}/g;

/**
 * Resolve which config file to load. Precedence:
 *   1. PARRAT_CONFIG_PATH env var (absolute or cwd-relative)
 *   2. ./.parrat/config.yaml relative to cwd
 *
 * Throws ConfigNotFoundError if neither exists.
 */
export function resolveConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  const fromEnv = env.PARRAT_CONFIG_PATH;
  if (fromEnv) {
    const absolute = isAbsolute(fromEnv) ? fromEnv : resolve(cwd, fromEnv);
    if (!existsSync(absolute)) {
      throw new ConfigNotFoundError(absolute, 'PARRAT_CONFIG_PATH');
    }
    return absolute;
  }

  const defaultPath = resolve(cwd, '.parrat', 'config.yaml');
  if (!existsSync(defaultPath)) {
    throw new ConfigNotFoundError(defaultPath, 'default');
  }
  return defaultPath;
}

/**
 * Load + validate + resolve a Parrat config from disk. Performs:
 *   1. File read
 *   2. YAML parse
 *   3. Zod schema validation
 *   4. $ENV_VAR resolution in string fields
 *   5. ~ tilde expansion in path fields
 *   6. PARRAT_<DOTTED> env var overrides
 *
 * Returns a frozen Config. Throws ConfigValidationError with field-path detail
 * on schema failure.
 */
export async function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): Promise<Readonly<Config>> {
  const path = resolveConfigPath(env, cwd);
  const raw = readFileSync(path, 'utf-8');

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (cause) {
    throw new ConfigValidationError(path, 'YAML parse failed', cause);
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigValidationError(path, 'schema validation failed', result.error);
  }

  // Walk the validated config; resolve $ENV_VAR + tilde expansion in string leaves.
  const resolved = walkAndTransform(result.data, env, homedir()) as Config;

  // Apply PARRAT_<DOTTED> env var overrides on top.
  const withOverrides = applyEnvOverrides(resolved, env);

  return Object.freeze(withOverrides);
}

/**
 * Substitute $VAR / ${VAR} references in a string against env. Throws if a
 * referenced variable is unset.
 */
export function resolveEnvVars(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(
    ENV_VAR_PATTERN,
    (_match, bare: string | undefined, braced: string | undefined) => {
      const name = bare ?? braced ?? '';
      const resolved = env[name];
      if (resolved === undefined) {
        throw new ConfigValidationError(
          '<env-resolution>',
          `Environment variable '${name}' referenced in config but not set`,
          undefined,
        );
      }
      return resolved;
    },
  );
}

/**
 * Expand a leading ~ to the user's home directory. Leaves other paths
 * untouched.
 */
export function expandTilde(path: string, home: string): string {
  if (path === '~') return home;
  if (path.startsWith('~/') || path.startsWith('~\\')) {
    return resolve(home, path.slice(2));
  }
  return path;
}

/**
 * Walk an arbitrary value (object/array/primitive) and apply $ENV_VAR and
 * tilde-expansion to every string leaf. Used after schema validation so we
 * only transform shapes we know about.
 */
function walkAndTransform(value: unknown, env: NodeJS.ProcessEnv, home: string): unknown {
  if (typeof value === 'string') {
    const envResolved = resolveEnvVars(value, env);
    return expandTilde(envResolved, home);
  }
  if (Array.isArray(value)) {
    return value.map((item) => walkAndTransform(item, env, home));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = walkAndTransform(v, env, home);
    }
    return out;
  }
  return value;
}
