import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const fixtureDir = fileURLToPath(new URL('../fixtures/dbt-project', import.meta.url));
const isWindows = os.platform() === 'win32';
const venvPython = path.join(fixtureDir, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python');
const venvDbt = path.join(fixtureDir, '.venv', isWindows ? 'Scripts/dbt.exe' : 'bin/dbt');

// Skip when the venv is not set up (requires dbt-duckdb installed in .venv)
const hasVenv = fs.existsSync(venvPython);
const e2e = hasVenv ? describe : describe.skip;

function runDbt(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(venvDbt, [...args, '--profiles-dir', '.'], {
      cwd: fixtureDir,
      encoding: 'utf8',
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.status ?? 1,
    };
  }
}

e2e('freshness-investigation fixture (dbt-duckdb)', () => {
  beforeAll(() => {
    execFileSync(venvPython, ['setup_fixture.py'], { cwd: fixtureDir });
  });

  it('dbt parse succeeds', () => {
    const { stdout, stderr, exitCode } = runDbt(['parse']);
    const output = stdout + stderr;
    expect(exitCode, output).toBe(0);
  });

  it('events_fresh reports PASS', () => {
    const { stdout, stderr } = runDbt(['source', 'freshness']);
    const output = stdout + stderr;
    expect(output).toContain('PASS freshness of raw.events_fresh');
  });

  it('events_stale reports ERROR STALE', () => {
    const { stdout, stderr } = runDbt(['source', 'freshness']);
    const output = stdout + stderr;
    expect(output).toContain('ERROR STALE freshness of raw.events_stale');
  });

  it('events_no_config is not checked (no freshness config)', () => {
    const { stdout, stderr } = runDbt(['source', 'freshness']);
    const output = stdout + stderr;
    expect(output).not.toContain('events_no_config');
  });
});
