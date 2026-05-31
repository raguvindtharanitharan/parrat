import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runPlaybook } from '../../src/cli/run.js';

// vi.mock is hoisted to the top of the file, so the playbook definition must live
// inside the factory (not as a top-level const) to avoid a TDZ reference error.
vi.mock('../../src/playbooks/index.js', async () => {
  const { definePlaybook } = await import('../../src/core/playbooks/Playbook.js');
  const { z } = await import('zod');
  const testPlaybook = definePlaybook({
    name: 'test-echo',
    inputSchema: z.object({ name: z.string().min(1) }),
    outputSchema: z.object({ greeting: z.string() }),
    run: async (input) => ({ greeting: `Hello, ${input.name}!` }),
  });
  return { playbooks: [testPlaybook] };
});

describe('cli/run', () => {
  let tempDir: string;
  let auditPath: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `parrat-cli-run-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
    auditPath = join(tempDir, 'audit.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns exitCode 0 and the Playbook output for valid input', async () => {
    const result = await runPlaybook({
      playbookName: 'test-echo',
      inputJson: '{"name":"World"}',
      auditPath,
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toEqual({ greeting: 'Hello, World!' });
    expect(result.error).toBeUndefined();
  });

  it('returns exitCode 2 with a parse error message on invalid JSON', async () => {
    const result = await runPlaybook({
      playbookName: 'test-echo',
      inputJson: 'not json',
      auditPath,
    });
    expect(result.exitCode).toBe(2);
    expect(result.error).toMatch(/Invalid JSON/);
  });

  it('returns exitCode 1 with PlaybookNotFoundError on unknown playbook name', async () => {
    const result = await runPlaybook({
      playbookName: 'nonexistent',
      inputJson: '{}',
      auditPath,
    });
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/PlaybookNotFoundError/);
  });

  it('returns exitCode 1 with SchemaValidationError on invalid Playbook input', async () => {
    const result = await runPlaybook({
      playbookName: 'test-echo',
      inputJson: '{"name":""}',
      auditPath,
    });
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/SchemaValidationError/);
  });
});
