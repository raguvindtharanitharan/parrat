import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDoctor } from '../../src/cli/doctor.js';

vi.mock('../../src/core/config/index.js', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

import { execFile } from 'node:child_process';
import { loadConfig } from '../../src/core/config/index.js';

const validConfig = {
  version: 1 as const,
  tenant_id: 'default',
  mcpServers: {},
  skills: { defaults: { timeout_seconds: 60, max_retries: 2 } },
  audit: {
    log_path: '.parrat/audit.jsonl',
    hash_algorithm: 'sha256' as const,
    retention_days: 90,
    redact_fields: [],
    idempotency_window_hours: 24,
  },
  claude: { model: 'claude-sonnet-4-6', max_turns: 6, max_tokens: 4096, temperature: 0 },
};

describe('runDoctor', () => {
  let dir: string;
  let auditPath: string;
  const origEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'parrat-doctor-'));
    auditPath = join(dir, '.parrat', 'audit.jsonl');
    vi.mocked(loadConfig).mockResolvedValue(validConfig as never);
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (err: null, stdout: string, stderr: string) => void)(null, 'uv 0.5.0', '');
      return {} as never;
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (origEnv !== undefined) {
      process.env.ANTHROPIC_API_KEY = origEnv;
    } else {
      // biome-ignore lint/performance/noDelete: must delete to truly unset a process.env key (assignment sets "undefined" string)
      delete process.env.ANTHROPIC_API_KEY;
    }
    vi.restoreAllMocks();
  });

  it('ANTHROPIC_API_KEY check fails when key is missing', async () => {
    // biome-ignore lint/performance/noDelete: must delete to truly unset a process.env key
    delete process.env.ANTHROPIC_API_KEY;
    const checks = await runDoctor(auditPath);
    const check = checks.find((c) => c.name === 'ANTHROPIC_API_KEY');
    expect(check?.status).toBe('fail');
  });

  it('ANTHROPIC_API_KEY check passes when key is present', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const checks = await runDoctor(auditPath);
    const check = checks.find((c) => c.name === 'ANTHROPIC_API_KEY');
    expect(check?.status).toBe('ok');
  });

  it('Config file check fails when loadConfig throws', async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error('Config not found'));
    const checks = await runDoctor(auditPath);
    const check = checks.find((c) => c.name === 'Config file');
    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('Config not found');
  });

  it('Config file check passes when loadConfig succeeds', async () => {
    const checks = await runDoctor(auditPath);
    const check = checks.find((c) => c.name === 'Config file');
    expect(check?.status).toBe('ok');
  });

  it('uvx check fails when uvx is not found', async () => {
    vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (err: Error, stdout: string, stderr: string) => void)(
        new Error('command not found'),
        '',
        '',
      );
      return {} as never;
    });
    const checks = await runDoctor(auditPath);
    const check = checks.find((c) => c.name === 'uvx');
    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('pip install uv');
  });

  it('uvx check passes when uvx is available', async () => {
    const checks = await runDoctor(auditPath);
    const check = checks.find((c) => c.name === 'uvx');
    expect(check?.status).toBe('ok');
    expect(check?.message).toContain('dbt-mcp fetched automatically');
  });

  it('dbt-mcp check fails when uv run returns error', async () => {
    vi.mocked(execFile).mockImplementation((cmd, _args, _opts, cb) => {
      if (cmd === 'uv') {
        (cb as (err: Error, stdout: string, stderr: string) => void)(
          new Error('command not found'),
          '',
          '',
        );
      } else {
        (cb as (err: null, stdout: string, stderr: string) => void)(null, 'uv 0.5.0', '');
      }
      return {} as never;
    });
    const checks = await runDoctor(auditPath);
    const check = checks.find((c) => c.name === 'dbt-mcp');
    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('dbt-mcp not accessible');
  });

  it('dbt-mcp check passes when uv run returns version', async () => {
    vi.mocked(execFile).mockImplementation((cmd, _args, _opts, cb) => {
      if (cmd === 'uv') {
        (cb as (err: null, stdout: string, stderr: string) => void)(null, '1.19.1', '');
      } else {
        (cb as (err: null, stdout: string, stderr: string) => void)(null, 'uv 0.5.0', '');
      }
      return {} as never;
    });
    const checks = await runDoctor(auditPath);
    const check = checks.find((c) => c.name === 'dbt-mcp');
    expect(check?.status).toBe('ok');
    expect(check?.message).toBe('1.19.1');
  });

  it('all checks pass → no fail status in results', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    mkdirSync(join(dir, '.parrat'), { recursive: true });
    writeFileSync(join(dir, '.parrat', 'audit.jsonl'), '');
    const checks = await runDoctor(auditPath);
    const failures = checks.filter((c) => c.status === 'fail');
    expect(failures).toHaveLength(0);
  });
});
