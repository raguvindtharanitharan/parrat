import { describe, expect, it } from 'vitest';
import { createNoopAuditLogger } from '../../src/core/audit/logger.js';
import type { Config } from '../../src/core/config/types.js';
import type { LlmClient } from '../../src/core/llm/client.js';
import { DEFAULT_TENANT_ID } from '../../src/core/types.js';
import { metricDropRcaSkill } from '../../src/skills/metric-drop-rca/index.js';
import { BASE_PROMPT } from '../../src/skills/metric-drop-rca/prompt.js';

describe('skills/metric-drop-rca', () => {
  const baseCtx = {
    tenantId: DEFAULT_TENANT_ID,
    runId: 'test-run',
    workflowId: 'test-run',
    auditLogger: createNoopAuditLogger(),
    actor: 'user' as const,
  };

  it('prompt instructs Claude to call emit_findings (not return raw JSON)', () => {
    expect(BASE_PROMPT).toContain('emit_findings');
  });

  it('prompt handles model-not-found pattern', () => {
    expect(BASE_PROMPT).toContain("status='unknown'");
    expect(BASE_PROMPT).toContain("confidence='low'");
  });

  it('prompt handles show failure', () => {
    expect(BASE_PROMPT).toContain('query failed');
    expect(BASE_PROMPT).toContain('Do not retry');
  });

  it('prompt handles external tables upstream', () => {
    expect(BASE_PROMPT).toContain('external stages');
  });

  it('prompt handles empty upstream lineage', () => {
    expect(BASE_PROMPT).toContain('root model');
  });

  it('has the expected name and kind', () => {
    expect(metricDropRcaSkill.name).toBe('metric-drop-rca');
    expect(metricDropRcaSkill.kind).toBe('investigation');
  });

  it('declares the expected dbt tool allowlist', () => {
    const dbt = metricDropRcaSkill.mcpServers?.dbt;
    expect(dbt).toBeDefined();
    expect(dbt?.tools).toEqual(['list', 'get_node_details_dev', 'get_lineage_dev', 'show']);
  });

  it('throws when ctx.config is missing', async () => {
    await expect(
      metricDropRcaSkill.run(
        {
          metric_name: 'revenue',
          model_id: 'fct_revenue',
          metric_column: 'total',
          drop_percent: 20,
        },
        baseCtx,
      ),
    ).rejects.toThrow(/requires runtime-provided config/);
  });

  it('throws when ctx.llmClient is missing (config present)', async () => {
    const config = {
      version: 1,
      tenant_id: 'default',
      mcpServers: { dbt: { command: 'uvx', args: [], env: {} } },
      skills: { defaults: { timeout_seconds: 60, max_retries: 2 } },
      audit: {
        log_path: '.parrat/audit.jsonl',
        hash_algorithm: 'sha256' as const,
        retention_days: 90,
        redact_fields: [],
        idempotency_window_hours: 24,
      },
      claude: { model: 'claude-sonnet-4-6', max_turns: 6, max_tokens: 4096, temperature: 0 },
    } as Config;

    await expect(
      metricDropRcaSkill.run(
        {
          metric_name: 'revenue',
          model_id: 'fct_revenue',
          metric_column: 'total',
          drop_percent: 20,
        },
        { ...baseCtx, config },
      ),
    ).rejects.toThrow(/requires an LLM client/);
  });
});
