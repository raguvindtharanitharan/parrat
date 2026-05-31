import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mapMonteCarloPayload, startWebhook } from '../../src/cli/webhook.js';
import type { WebhookServer } from '../../src/cli/webhook.js';
import type { Config } from '../../src/core/config/types.js';

vi.mock('../../src/cli/run.js', () => ({
  runPlaybook: vi.fn(),
}));

import { runPlaybook } from '../../src/cli/run.js';

const minimalConfig: Config = {
  version: 1,
  tenant_id: 'default',
  mcpServers: {},
  playbooks: { defaults: { timeout_seconds: 60, max_retries: 2 } },
  audit: {
    log_path: '.parrat/audit.jsonl',
    hash_algorithm: 'sha256',
    retention_days: 90,
    redact_fields: [],
    idempotency_window_hours: 24,
  },
  claude: { model: 'claude-sonnet-4-6', max_turns: 6, max_tokens: 4096, temperature: 0 },
};

describe('mapMonteCarloPayload', () => {
  it('returns mapped payload for a valid Monte Carlo freshness alert', () => {
    const result = mapMonteCarloPayload({ alert_type: 'freshness', table: 'orders' });
    expect(result).toEqual({
      playbook: 'freshness-investigation',
      input: { source: 'orders', threshold: 'error' },
    });
  });

  it('accepts source_name when table is absent', () => {
    const result = mapMonteCarloPayload({ alert_type: 'freshness', source_name: 'payments' });
    expect(result?.input.source).toBe('payments');
  });

  it('returns null for non-freshness alert_type', () => {
    expect(mapMonteCarloPayload({ alert_type: 'schema_change' })).toBeNull();
  });

  it('returns null for non-object payload', () => {
    expect(mapMonteCarloPayload('not-an-object')).toBeNull();
    expect(mapMonteCarloPayload(null)).toBeNull();
  });
});

describe('startWebhook HTTP handler', () => {
  let server: WebhookServer;

  beforeEach(() => {
    vi.mocked(runPlaybook).mockReset();
  });

  afterEach(() => {
    server?.close();
  });

  async function post(port: number, body: unknown, headers: Record<string, string> = {}) {
    return fetch(`http://localhost:${port}/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('returns 200 when playbook succeeds', async () => {
    vi.mocked(runPlaybook).mockResolvedValue({ exitCode: 0, output: { status: 'fresh' } });
    server = await startWebhook({
      config: minimalConfig,
      auditPath: '.parrat/audit.jsonl',
      port: 0,
    });
    const res = await post(server.port, { alert_type: 'freshness', table: 'orders' });
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json.ok).toBe(true);
  });

  it('returns 500 when playbook fails', async () => {
    vi.mocked(runPlaybook).mockResolvedValue({ exitCode: 1, error: 'something went wrong' });
    server = await startWebhook({
      config: minimalConfig,
      auditPath: '.parrat/audit.jsonl',
      port: 0,
    });
    const res = await post(server.port, { alert_type: 'freshness', table: 'orders' });
    expect(res.status).toBe(500);
  });

  it('returns 400 for unrecognised payload format', async () => {
    server = await startWebhook({
      config: minimalConfig,
      auditPath: '.parrat/audit.jsonl',
      port: 0,
    });
    const res = await post(server.port, { alert_type: 'schema_change' });
    expect(res.status).toBe(400);
  });

  it('returns 401 when secret is wrong', async () => {
    server = await startWebhook({
      config: minimalConfig,
      auditPath: '.parrat/audit.jsonl',
      port: 0,
      secret: 'correct',
    });
    const res = await post(
      server.port,
      { alert_type: 'freshness', table: 'orders' },
      { 'X-Parrat-Secret': 'wrong' },
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 when correct secret is provided', async () => {
    vi.mocked(runPlaybook).mockResolvedValue({ exitCode: 0, output: {} });
    server = await startWebhook({
      config: minimalConfig,
      auditPath: '.parrat/audit.jsonl',
      port: 0,
      secret: 'mysecret',
    });
    const res = await post(
      server.port,
      { alert_type: 'freshness', table: 'orders' },
      { 'X-Parrat-Secret': 'mysecret' },
    );
    expect(res.status).toBe(200);
  });

  it('skips auth check when no secret is configured', async () => {
    vi.mocked(runPlaybook).mockResolvedValue({ exitCode: 0, output: {} });
    server = await startWebhook({
      config: minimalConfig,
      auditPath: '.parrat/audit.jsonl',
      port: 0,
    });
    const res = await post(server.port, { alert_type: 'freshness', table: 'orders' });
    expect(res.status).toBe(200);
  });

  it('returns 404 for non-POST or wrong path', async () => {
    server = await startWebhook({
      config: minimalConfig,
      auditPath: '.parrat/audit.jsonl',
      port: 0,
    });
    const res = await fetch(`http://localhost:${server.port}/health`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid JSON body', async () => {
    server = await startWebhook({
      config: minimalConfig,
      auditPath: '.parrat/audit.jsonl',
      port: 0,
    });
    const res = await fetch(`http://localhost:${server.port}/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});
