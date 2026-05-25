import { describe, expect, it, vi } from 'vitest';
import { watchSkill } from '../../src/cli/watch.js';
import type { Config } from '../../src/core/config/types.js';

vi.mock('../../src/cli/run.js', () => ({ runSkill: vi.fn() }));
vi.mock('../../src/core/notify/slack.js', () => ({
  SlackNotifier: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
}));

import { runSkill } from '../../src/cli/run.js';
import { SlackNotifier } from '../../src/core/notify/slack.js';

const BASE_CONFIG: Config = {
  version: 1,
  tenant_id: 'default',
  mcpServers: {},
  skills: { defaults: { timeout_seconds: 60, max_retries: 2 } },
  audit: {
    log_path: '.parrat/audit.jsonl',
    hash_algorithm: 'sha256',
    retention_days: 90,
    redact_fields: [],
  },
  claude: { model: 'claude-sonnet-4-6', max_turns: 6, max_tokens: 4096, temperature: 0 },
};

const WATCH_CONFIG: Config = {
  ...BASE_CONFIG,
  watch: { skill: 'freshness-investigation', input: { source: 'tpch.orders', threshold: 'error' } },
};

const NOTIFY_CONFIG: Config = {
  ...WATCH_CONFIG,
  notify: { slack: { webhook_url: 'https://hooks.slack.com/services/test' } },
};

describe('cli/watch', () => {
  it('returns exitCode 1 when config.watch is missing', async () => {
    const result = await watchSkill({ config: BASE_CONFIG, auditPath: '.parrat/audit.jsonl' });
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/No 'watch' section in config/);
  });

  it('runs the skill named in config.watch with the configured input and html report', async () => {
    vi.mocked(runSkill).mockResolvedValue({ exitCode: 0, output: { status: 'fresh' } });
    await watchSkill({ config: WATCH_CONFIG, auditPath: '.parrat/audit.jsonl' });
    expect(runSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        skillName: 'freshness-investigation',
        inputJson: JSON.stringify({ source: 'tpch.orders', threshold: 'error' }),
        reportFormat: 'html',
      }),
    );
  });

  it('returns exitCode 0 on skill success with no notify configured', async () => {
    vi.mocked(runSkill).mockResolvedValue({ exitCode: 0, output: { status: 'fresh' } });
    const result = await watchSkill({ config: WATCH_CONFIG, auditPath: '.parrat/audit.jsonl' });
    expect(result.exitCode).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('returns the skill exitCode on skill failure with no notify configured', async () => {
    vi.mocked(runSkill).mockResolvedValue({
      exitCode: 1,
      error: 'MaxTurnsExceededError: exceeded 6 turns',
    });
    const result = await watchSkill({ config: WATCH_CONFIG, auditPath: '.parrat/audit.jsonl' });
    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/MaxTurnsExceededError/);
  });

  it('does not call SlackNotifier when notify.slack is not configured', async () => {
    vi.mocked(runSkill).mockResolvedValue({ exitCode: 0, output: {} });
    await watchSkill({ config: WATCH_CONFIG, auditPath: '.parrat/audit.jsonl' });
    expect(SlackNotifier).not.toHaveBeenCalled();
  });

  it('does not send Slack when status is fresh (clean run)', async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    vi.mocked(SlackNotifier).mockImplementation(() => ({ send: mockSend }));
    vi.mocked(runSkill).mockResolvedValue({ exitCode: 0, output: { status: 'fresh' } });

    await watchSkill({ config: NOTIFY_CONFIG, auditPath: '.parrat/audit.jsonl' });

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends Slack on stale_error status', async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    vi.mocked(SlackNotifier).mockImplementation(() => ({ send: mockSend }));
    vi.mocked(runSkill).mockResolvedValue({
      exitCode: 0,
      output: { status: 'stale_error', confidence: 'high', root_cause_summary: 'Pipeline stalled.' },
      reportPath: '.parrat/reports/freshness-investigation-20260524-231219.html',
    });

    await watchSkill({ config: NOTIFY_CONFIG, auditPath: '.parrat/audit.jsonl' });

    expect(mockSend).toHaveBeenCalledOnce();
    const [msg] = mockSend.mock.calls[0] as [{ text: string }];
    expect(msg.text).toContain('STALE ERROR');
    expect(msg.text).toContain('Confidence: high');
    expect(msg.text).toContain('Pipeline stalled.');
    expect(msg.text).toContain('freshness-investigation-20260524-231219.html');
  });

  it('sends Slack on stale_warn status', async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    vi.mocked(SlackNotifier).mockImplementation(() => ({ send: mockSend }));
    vi.mocked(runSkill).mockResolvedValue({
      exitCode: 0,
      output: { status: 'stale_warn', confidence: 'medium' },
    });

    await watchSkill({ config: NOTIFY_CONFIG, auditPath: '.parrat/audit.jsonl' });

    expect(mockSend).toHaveBeenCalledOnce();
    const [msg] = mockSend.mock.calls[0] as [{ text: string }];
    expect(msg.text).toContain('STALE WARN');
  });

  it('sends Slack on skill failure (exitCode 1)', async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    vi.mocked(SlackNotifier).mockImplementation(() => ({ send: mockSend }));
    vi.mocked(runSkill).mockResolvedValue({
      exitCode: 1,
      error: 'MaxTurnsExceededError: exceeded 6 turns',
    });

    await watchSkill({ config: NOTIFY_CONFIG, auditPath: '.parrat/audit.jsonl' });

    const [msg] = mockSend.mock.calls[0] as [{ text: string }];
    expect(msg.text).toContain('FAILED');
    expect(msg.text).toContain('MaxTurnsExceededError');
  });

  it('returns exitCode 1 when Slack notification fails', async () => {
    const mockSend = vi.fn().mockRejectedValue(new Error('Slack webhook returned 500'));
    vi.mocked(SlackNotifier).mockImplementation(() => ({ send: mockSend }));
    vi.mocked(runSkill).mockResolvedValue({ exitCode: 0, output: { status: 'stale_error' } });

    const result = await watchSkill({ config: NOTIFY_CONFIG, auditPath: '.parrat/audit.jsonl' });

    expect(result.exitCode).toBe(1);
    expect(result.error).toMatch(/Slack notification failed/);
  });

  it('constructs SlackNotifier with the configured webhook URL', async () => {
    const mockSend = vi.fn().mockResolvedValue(undefined);
    vi.mocked(SlackNotifier).mockImplementation(() => ({ send: mockSend }));
    vi.mocked(runSkill).mockResolvedValue({ exitCode: 0, output: {} });

    await watchSkill({ config: NOTIFY_CONFIG, auditPath: '.parrat/audit.jsonl' });

    expect(SlackNotifier).toHaveBeenCalledWith('https://hooks.slack.com/services/test');
  });
});
