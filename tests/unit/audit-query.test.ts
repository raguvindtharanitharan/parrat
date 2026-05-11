import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { queryAuditLog } from '../../src/cli/audit-query.js';

describe('queryAuditLog', () => {
  let dir: string;
  let auditPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'parrat-audit-query-'));
    auditPath = join(dir, 'audit.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeEvent(overrides: Record<string, unknown> = {}) {
    const record = {
      event_type: 'trigger',
      run_id: 'aaaabbbb-0000-0000-0000-000000000000',
      workflow_id: 'aaaabbbb-0000-0000-0000-000000000000',
      timestamp: new Date().toISOString(),
      actor: 'user',
      payload: {},
      ...overrides,
    };
    writeFileSync(auditPath, `${JSON.stringify(record)}\n`, { flag: 'a' });
  }

  it('returns exitCode 1 when audit file does not exist', async () => {
    const result = await queryAuditLog({ auditPath });
    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('not found');
  });

  it('returns exitCode 1 with empty lines when no events match', async () => {
    writeEvent({ event_type: 'trigger' });
    const result = await queryAuditLog({ auditPath, eventType: 'mcp_call' });
    expect(result.exitCode).toBe(1);
    expect(result.lines).toHaveLength(0);
  });

  it('returns exitCode 1 for empty audit file', async () => {
    writeFileSync(auditPath, '');
    const result = await queryAuditLog({ auditPath });
    expect(result.exitCode).toBe(1);
  });

  it('filters by run_id', async () => {
    writeEvent({ run_id: 'run-aaa' });
    writeEvent({ run_id: 'run-bbb' });
    const result = await queryAuditLog({ auditPath, runId: 'run-aaa' });
    expect(result.exitCode).toBe(0);
    expect(result.lines).toHaveLength(1);
    expect(result.lines?.[0]).toContain('run-aaa'.slice(0, 8));
  });

  it('filters by event_type', async () => {
    writeEvent({ event_type: 'trigger' });
    writeEvent({
      event_type: 'mcp_call',
      payload: { server: 'dbt', tool: 'list', duration_ms: 12 },
    });
    const result = await queryAuditLog({ auditPath, eventType: 'mcp_call' });
    expect(result.exitCode).toBe(0);
    expect(result.lines).toHaveLength(1);
    expect(result.lines?.[0]).toContain('mcp_call');
  });

  it('filters by since timestamp', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    writeEvent({ timestamp: past });
    writeEvent({ timestamp: future });
    const result = await queryAuditLog({
      auditPath,
      since: new Date(Date.now() - 30_000).toISOString(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.lines).toHaveLength(1);
  });

  it('applies limit', async () => {
    writeEvent();
    writeEvent();
    writeEvent();
    const result = await queryAuditLog({ auditPath, limit: 2 });
    expect(result.exitCode).toBe(0);
    expect(result.lines).toHaveLength(2);
  });

  it('outputs raw NDJSON when json option is set', async () => {
    writeEvent({ run_id: 'run-json-test' });
    const result = await queryAuditLog({ auditPath, json: true });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.lines?.[0] ?? '');
    expect(parsed.run_id).toBe('run-json-test');
  });

  it('skips malformed lines and returns valid events', async () => {
    writeFileSync(auditPath, 'not-valid-json\n');
    writeEvent({ run_id: 'run-valid' });
    const result = await queryAuditLog({ auditPath });
    expect(result.exitCode).toBe(0);
    expect(result.lines).toHaveLength(1);
  });

  it('combines run_id and event_type filters', async () => {
    writeEvent({ run_id: 'run-aaa', event_type: 'trigger' });
    writeEvent({
      run_id: 'run-aaa',
      event_type: 'mcp_call',
      payload: { server: 'dbt', tool: 'list', duration_ms: 5 },
    });
    writeEvent({ run_id: 'run-bbb', event_type: 'trigger' });
    const result = await queryAuditLog({ auditPath, runId: 'run-aaa', eventType: 'mcp_call' });
    expect(result.exitCode).toBe(0);
    expect(result.lines).toHaveLength(1);
  });
});
