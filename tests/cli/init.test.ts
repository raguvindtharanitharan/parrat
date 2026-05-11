import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pathExists, writeDefaultConfig } from '../../src/cli/init.js';

describe('cli/init', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `parrat-cli-init-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('pathExists', () => {
    it('returns true for an existing file', async () => {
      const file = join(tempDir, 'present.yaml');
      await writeDefaultConfig(file);
      expect(await pathExists(file)).toBe(true);
    });

    it('returns false for a missing path', async () => {
      expect(await pathExists(join(tempDir, 'missing.yaml'))).toBe(false);
    });
  });

  describe('writeDefaultConfig', () => {
    it('writes a YAML file with v1 schema-compatible sections', async () => {
      const path = join(tempDir, 'config.yaml');
      await writeDefaultConfig(path);
      const content = await readFile(path, 'utf8');
      expect(content).toContain('version: 1');
      expect(content).toContain('tenant_id: default');
      expect(content).toContain('audit:');
      expect(content).toContain('log_path: .parrat/audit.jsonl');
      expect(content).toContain('claude:');
      expect(content).toContain('model: claude-sonnet-4-6');
      expect(content).toContain('mcpServers:');
    });

    it('creates parent directories if missing', async () => {
      const path = join(tempDir, 'nested', 'deeper', 'config.yaml');
      await writeDefaultConfig(path);
      const stats = await stat(path);
      expect(stats.isFile()).toBe(true);
    });
  });
});
