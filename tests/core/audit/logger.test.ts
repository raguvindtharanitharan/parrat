import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuditLogger } from '../../../src/core/audit/logger.js';
import { AuditWriteError } from '../../../src/core/errors.js';
import { DEFAULT_TENANT_ID } from '../../../src/core/types.js';

describe('core/audit/logger', () => {
  let tempDir: string;
  let auditPath: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `parrat-audit-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    auditPath = join(tempDir, 'audit.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes a single event as one JSON line with snake_case keys', async () => {
    const logger = createAuditLogger({ filePath: auditPath });
    await logger.write({
      type: 'trigger',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-123',
      playbook: 'freshness-investigation',
      actor: 'user',
      payload: { greeting: 'hi' },
    });

    const content = await readFile(auditPath, 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.tenant_id).toBe('default');
    expect(parsed.run_id).toBe('run-123');
    expect(parsed.event_type).toBe('trigger');
    expect(parsed.playbook).toBe('freshness-investigation');
    expect(parsed.actor).toBe('user');
    expect(parsed.payload).toEqual({ greeting: 'hi' });
    expect(parsed.event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parsed.redaction_applied).toBe(false);
    expect(parsed.schema_version).toBe(1);
  });

  it('appends multiple events as separate NDJSON lines', async () => {
    const logger = createAuditLogger({ filePath: auditPath });
    await logger.write({
      type: 'trigger',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-1',
      actor: 'user',
      payload: {},
    });
    await logger.write({
      type: 'playbook_complete',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-1',
      actor: 'user',
      payload: { status: 'ok' },
    });

    const content = await readFile(auditPath, 'utf8');
    const events = content
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.event_type)).toEqual(['trigger', 'playbook_complete']);
  });

  it('creates parent directory lazily if it does not exist', async () => {
    const nestedPath = join(tempDir, 'nested', 'deeper', 'audit.jsonl');
    const logger = createAuditLogger({ filePath: nestedPath });
    await logger.write({
      type: 'trigger',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-1',
      actor: 'user',
      payload: {},
    });
    const content = await readFile(nestedPath, 'utf8');
    expect(content).toContain('"event_type":"trigger"');
  });

  it('omits playbook field when caller does not provide it', async () => {
    const logger = createAuditLogger({ filePath: auditPath });
    await logger.write({
      type: 'error',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-1',
      actor: 'system',
      payload: { message: 'oops' },
    });
    const content = await readFile(auditPath, 'utf8');
    const parsed = JSON.parse(content.trim());
    expect(parsed.playbook).toBeUndefined();
  });

  it('generates a unique event_id per write', async () => {
    const logger = createAuditLogger({ filePath: auditPath });
    await logger.write({
      type: 'trigger',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-1',
      actor: 'user',
      payload: {},
    });
    await logger.write({
      type: 'trigger',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-1',
      actor: 'user',
      payload: {},
    });

    const content = await readFile(auditPath, 'utf8');
    const events = content
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    const ids = events.map((e) => e.event_id);
    expect(new Set(ids).size).toBe(2);
  });

  it('hashes mcp_call args and result when hash_algorithm is set', async () => {
    const logger = createAuditLogger({
      filePath: auditPath,
      auditConfig: { hash_algorithm: 'sha256', redact_fields: [] },
    });
    await logger.write({
      type: 'mcp_call',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-1',
      actor: 'user',
      payload: { args: { sql: 'SELECT 1' }, result: ['row1'] },
    });
    const parsed = JSON.parse((await readFile(auditPath, 'utf8')).trim());
    expect(parsed.payload.args).toBeUndefined();
    expect(parsed.payload.result).toBeUndefined();
    expect(typeof parsed.payload.args_hash).toBe('string');
    expect(typeof parsed.payload.result_hash).toBe('string');
    expect(parsed.payload.args_hash).toHaveLength(64); // sha256 hex
  });

  it('replaces trigger input with input_hash when hash_algorithm is set', async () => {
    const logger = createAuditLogger({
      filePath: auditPath,
      auditConfig: { hash_algorithm: 'sha256', redact_fields: [] },
    });
    await logger.write({
      type: 'trigger',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-1',
      actor: 'user',
      payload: { input: { source_id: 'orders' } },
    });
    const parsed = JSON.parse((await readFile(auditPath, 'utf8')).trim());
    expect(parsed.payload.input).toBeUndefined();
    expect(typeof parsed.payload.input_hash).toBe('string');
  });

  it('redacts matching fields and sets redaction_applied to true', async () => {
    const logger = createAuditLogger({
      filePath: auditPath,
      auditConfig: { hash_algorithm: 'sha256', redact_fields: ['password'] },
    });
    // playbook_complete has no hash targets so password survives to the redaction step
    await logger.write({
      type: 'playbook_complete',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-1',
      actor: 'user',
      payload: { output: { user: 'alice', password: 'secret' } },
    });
    const parsed = JSON.parse((await readFile(auditPath, 'utf8')).trim());
    expect(parsed.redaction_applied).toBe(true);
    expect(parsed.payload.output.password).toBe('[REDACTED]');
    expect(parsed.payload.output.user).toBe('alice');
  });

  it('leaves redaction_applied false when no fields match redact_fields', async () => {
    const logger = createAuditLogger({
      filePath: auditPath,
      auditConfig: { hash_algorithm: 'sha256', redact_fields: ['password'] },
    });
    await logger.write({
      type: 'playbook_complete',
      tenantId: DEFAULT_TENANT_ID,
      runId: 'run-1',
      actor: 'user',
      payload: { output: { status: 'fresh' } },
    });
    const parsed = JSON.parse((await readFile(auditPath, 'utf8')).trim());
    expect(parsed.redaction_applied).toBe(false);
  });

  it('throws AuditWriteError when target path is a directory (EISDIR)', async () => {
    // tempDir is a directory; using it as the audit file path forces EISDIR on appendFile
    const logger = createAuditLogger({ filePath: tempDir });
    await expect(
      logger.write({
        type: 'trigger',
        tenantId: DEFAULT_TENANT_ID,
        runId: 'run-1',
        actor: 'user',
        payload: {},
      }),
    ).rejects.toThrow(AuditWriteError);
  });
});
