/**
 * Public API for the config primitive. Most consumers only need
 * `loadConfig` and the type re-exports.
 */
export { loadConfig, resolveConfigPath, resolveEnvVars, expandTilde } from './loader.js';
export { applyEnvOverrides } from './overrides.js';
export type { AuditConfig, ClaudeConfig, Config, McpServerConfig, SkillDefaults } from './types.js';
