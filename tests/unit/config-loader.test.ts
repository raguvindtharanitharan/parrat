import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  expandTilde,
  loadConfig,
  resolveConfigPath,
  resolveEnvVars,
} from '../../src/core/config/loader.js';
import { ConfigNotFoundError, ConfigValidationError } from '../../src/core/errors.js';
import { cleanupTempDir, makeTempDir } from '../helpers/tempDir.js';

describe('core/config/loader', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir('parrat-config-loader');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('resolveConfigPath', () => {
    it('honors PARRAT_CONFIG_PATH env var when set', async () => {
      const customPath = join(tempDir, 'custom.yaml');
      await writeFile(customPath, 'version: 1\n', 'utf8');
      const env = { PARRAT_CONFIG_PATH: customPath };
      expect(resolveConfigPath(env, tempDir)).toBe(customPath);
    });

    it('falls back to .parrat/config.yaml relative to cwd', async () => {
      const defaultDir = join(tempDir, '.parrat');
      await mkdir(defaultDir, { recursive: true });
      const defaultPath = join(defaultDir, 'config.yaml');
      await writeFile(defaultPath, 'version: 1\n', 'utf8');
      expect(resolveConfigPath({}, tempDir)).toBe(defaultPath);
    });

    it('throws ConfigNotFoundError when PARRAT_CONFIG_PATH points at non-existent file', () => {
      const env = { PARRAT_CONFIG_PATH: join(tempDir, 'nope.yaml') };
      expect(() => resolveConfigPath(env, tempDir)).toThrow(ConfigNotFoundError);
    });

    it('throws ConfigNotFoundError when no default exists', () => {
      expect(() => resolveConfigPath({}, tempDir)).toThrow(ConfigNotFoundError);
    });
  });

  describe('resolveEnvVars', () => {
    it('substitutes $VAR references', () => {
      expect(resolveEnvVars('hello $NAME', { NAME: 'world' })).toBe('hello world');
    });

    it('substitutes ${VAR} references', () => {
      expect(resolveEnvVars('${HOME}/projects', { HOME: '/Users/raguv' })).toBe(
        '/Users/raguv/projects',
      );
    });

    it('throws when env var is undefined', () => {
      expect(() => resolveEnvVars('$MISSING', {})).toThrow(ConfigValidationError);
    });

    it('handles multiple substitutions in one string', () => {
      expect(resolveEnvVars('$A and $B', { A: 'foo', B: 'bar' })).toBe('foo and bar');
    });
  });

  describe('expandTilde', () => {
    it('expands a bare ~', () => {
      expect(expandTilde('~', '/home/user')).toBe('/home/user');
    });

    it('expands ~/ prefix', () => {
      const result = expandTilde('~/foo', '/home/user');
      expect(result).toMatch(/[\\/]home[\\/]user[\\/]foo$/);
    });

    it('leaves non-tilde paths untouched', () => {
      expect(expandTilde('/absolute/path', '/home/user')).toBe('/absolute/path');
      expect(expandTilde('relative/path', '/home/user')).toBe('relative/path');
    });
  });

  describe('loadConfig', () => {
    it('parses a minimal config file end-to-end', async () => {
      const dir = join(tempDir, '.parrat');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'config.yaml'), 'version: 1\ntenant_id: acme\n', 'utf8');
      const config = await loadConfig({}, tempDir);
      expect(config.tenant_id).toBe('acme');
      expect(Object.isFrozen(config)).toBe(true);
    });

    it('throws ConfigValidationError on invalid YAML', async () => {
      const dir = join(tempDir, '.parrat');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'config.yaml'), 'version: 1\n  bad: indentation: here\n', 'utf8');
      await expect(loadConfig({}, tempDir)).rejects.toThrow(ConfigValidationError);
    });

    it('throws ConfigValidationError on schema failure', async () => {
      const dir = join(tempDir, '.parrat');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'config.yaml'), 'version: 99\n', 'utf8');
      await expect(loadConfig({}, tempDir)).rejects.toThrow(ConfigValidationError);
    });

    it('resolves $ENV_VAR in string fields', async () => {
      const dir = join(tempDir, '.parrat');
      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, 'config.yaml'),
        'version: 1\nmcpServers:\n  dbt:\n    command: $TEST_CMD\n',
        'utf8',
      );
      const config = await loadConfig({ TEST_CMD: 'uvx' }, tempDir);
      expect(config.mcpServers.dbt?.command).toBe('uvx');
    });
  });
});
