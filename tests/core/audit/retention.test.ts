import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sweepAuditLog } from '../../../src/core/audit/retention.js';

describe('core/audit/sweepAuditLog', () => {
  let dir: string;
  let auditPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'parrat-retention-'));
    auditPath = join(dir, 'audit.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeEvent(offsetMs: number) {
    const record = {
      event_type: 'trigger',
      timestamp: new Date(Date.now() - offsetMs).toISOString(),
    };
    writeFileSync(auditPath, `${JSON.stringify(record)}\n`, { flag: 'a' });
  }

  it('returns removed=0 when file does not exist', async () => {
    const result = await sweepAuditLog(auditPath, 90);
    expect(result).toEqual({ removed: 0 });
  });

  it('removes events older than retentionDays', async () => {
    writeEvent(91 * 86400 * 1000); // 91 days ago — over 90-day limit
    const result = await sweepAuditLog(auditPath, 90);
    expect(result).toEqual({ removed: 1 });
    expect(readFileSync(auditPath, 'utf8').trim()).toBe('');
  });

  it('keeps events within retentionDays', async () => {
    writeEvent(10 * 86400 * 1000); // 10 days ago — within 90-day limit
    const result = await sweepAuditLog(auditPath, 90);
    expect(result).toEqual({ removed: 0 });
    expect(readFileSync(auditPath, 'utf8').trim()).not.toBe('');
  });

  it('does not rewrite file when nothing is removed', async () => {
    writeEvent(10 * 86400 * 1000);
    const before = readFileSync(auditPath, 'utf8');
    await sweepAuditLog(auditPath, 90);
    const after = readFileSync(auditPath, 'utf8');
    expect(after).toBe(before);
  });

  it('reports accurate removed count with mixed old and fresh events', async () => {
    writeEvent(91 * 86400 * 1000); // old
    writeEvent(91 * 86400 * 1000); // old
    writeEvent(10 * 86400 * 1000); // fresh
    const result = await sweepAuditLog(auditPath, 90);
    expect(result).toEqual({ removed: 2 });
    const lines = readFileSync(auditPath, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
  });
});
