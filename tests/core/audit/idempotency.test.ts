import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isDuplicateRun } from '../../../src/core/audit/idempotency.js';

describe('core/audit/isDuplicateRun', () => {
  let dir: string;
  let auditPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'parrat-idempotency-'));
    auditPath = join(dir, 'audit.jsonl');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeTrigger(correlationId: string, offsetMs = 0) {
    const record = {
      event_type: 'trigger',
      workflow_id: correlationId,
      timestamp: new Date(Date.now() - offsetMs).toISOString(),
    };
    writeFileSync(auditPath, `${JSON.stringify(record)}\n`, { flag: 'a' });
  }

  it('returns false when audit file does not exist', async () => {
    const result = await isDuplicateRun(auditPath, 'corr-1', 24);
    expect(result).toBe(false);
  });

  it('returns true when matching trigger exists within window', async () => {
    writeTrigger('corr-1', 60_000); // 1 minute ago
    const result = await isDuplicateRun(auditPath, 'corr-1', 24);
    expect(result).toBe(true);
  });

  it('returns false when matching trigger is outside the window', async () => {
    writeTrigger('corr-1', 25 * 3600 * 1000); // 25 hours ago — outside 24h window
    const result = await isDuplicateRun(auditPath, 'corr-1', 24);
    expect(result).toBe(false);
  });

  it('returns false when no trigger matches the correlationId', async () => {
    writeTrigger('corr-other', 60_000);
    const result = await isDuplicateRun(auditPath, 'corr-1', 24);
    expect(result).toBe(false);
  });

  it('skips malformed lines and still finds valid match', async () => {
    writeFileSync(auditPath, 'not-valid-json\n');
    writeTrigger('corr-1', 60_000);
    const result = await isDuplicateRun(auditPath, 'corr-1', 24);
    expect(result).toBe(true);
  });
});
