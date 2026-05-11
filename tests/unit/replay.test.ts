import { describe, expect, it, vi } from 'vitest';
import { replayRun } from '../../src/cli/replay.js';

vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));

import { readFileSync } from 'node:fs';

const AUDIT_PATH = '.parrat/audit.jsonl';
const RUN_ID = 'run-abc';

function makeRecord(
  event_type: string,
  payload: Record<string, unknown>,
  timestamp = '2026-05-09T10:00:00.000Z',
) {
  return JSON.stringify({
    event_id: 'evt-1',
    timestamp,
    tenant_id: 'default',
    run_id: RUN_ID,
    skill: 'freshness-investigation',
    event_type,
    actor: 'user',
    payload,
    redaction_applied: false,
  });
}

function stubFile(lines: string[]) {
  vi.mocked(readFileSync).mockReturnValue(lines.join('\n'));
}

describe('cli/replay', () => {
  it('returns exitCode 1 when audit file cannot be read', () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/Cannot read audit log/);
  });

  it('returns exitCode 1 when run_id is not found', () => {
    stubFile([makeRecord('trigger', { input: {} })]);
    const result = replayRun({ runId: 'unknown-run', auditPath: AUDIT_PATH });
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/No events found for run_id/);
  });

  it('filters out events from other run_ids', () => {
    const other = JSON.stringify({
      event_id: 'evt-2',
      timestamp: '2026-05-09T10:00:00.000Z',
      run_id: 'other-run',
      event_type: 'trigger',
      actor: 'user',
      payload: {},
    });
    stubFile([makeRecord('trigger', { input: {} }), other]);
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.exitCode).toBe(0);
    expect(result.lines).toHaveLength(1);
  });

  it('skips malformed NDJSON lines without failing', () => {
    stubFile([makeRecord('trigger', { input: {} }), '{bad json']);
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.exitCode).toBe(0);
    expect(result.lines).toHaveLength(1);
  });

  it('sorts events by timestamp', () => {
    stubFile([
      makeRecord('skill_complete', { duration_ms: 5000 }, '2026-05-09T10:00:02.000Z'),
      makeRecord('trigger', { input: {} }, '2026-05-09T10:00:00.000Z'),
      makeRecord(
        'claude_call',
        {
          turn_index: 0,
          input_tokens: 100,
          output_tokens: 50,
          cost_estimate_usd: 0.001,
          duration_ms: 1200,
        },
        '2026-05-09T10:00:01.000Z',
      ),
    ]);
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.exitCode).toBe(0);
    expect(result.lines?.[0]).toMatch(/TRIGGER/);
    expect(result.lines?.[1]).toMatch(/CLAUDE/);
    expect(result.lines?.[2]).toMatch(/COMPLETE/);
  });

  it('formats trigger event', () => {
    stubFile([makeRecord('trigger', { input: {} })]);
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.lines?.[0]).toMatch(
      /\[10:00:00\] TRIGGER\s+skill=freshness-investigation actor=user/,
    );
  });

  it('formats claude_call event', () => {
    stubFile([
      makeRecord('claude_call', {
        turn_index: 1,
        input_tokens: 2000,
        output_tokens: 300,
        cost_estimate_usd: 0.0105,
        duration_ms: 3500,
      }),
    ]);
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.lines?.[0]).toMatch(/CLAUDE\s+turn=1 in=2000 out=300 cost=\$0\.0105 dur=3\.5s/);
  });

  it('formats mcp_call event', () => {
    stubFile([
      makeRecord('mcp_call', { server: 'dbt', tool: 'list', duration_ms: 800, is_error: false }),
    ]);
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.lines?.[0]).toMatch(/MCP\s+server=dbt tool=list dur=0\.8s/);
  });

  it('appends ERROR to mcp_call when is_error is true', () => {
    stubFile([
      makeRecord('mcp_call', { server: 'dbt', tool: 'show', duration_ms: 200, is_error: true }),
    ]);
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.lines?.[0]).toMatch(/ERROR/);
  });

  it('formats skill_output_captured event', () => {
    stubFile([makeRecord('skill_output_captured', { output: {}, turn_index: 2 })]);
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.lines?.[0]).toMatch(/OUTPUT\s+turn=2/);
  });

  it('formats skill_complete event with duration', () => {
    stubFile([makeRecord('skill_complete', { duration_ms: 85000 })]);
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.lines?.[0]).toMatch(/COMPLETE\s+dur=85\.0s/);
  });

  it('formats error event', () => {
    stubFile([
      makeRecord('error', {
        error_name: 'MaxTurnsExceededError',
        error_message: 'exceeded 6 turns',
      }),
    ]);
    const result = replayRun({ runId: RUN_ID, auditPath: AUDIT_PATH });
    expect(result.lines?.[0]).toMatch(/ERROR\s+MaxTurnsExceededError: exceeded 6 turns/);
  });
});
