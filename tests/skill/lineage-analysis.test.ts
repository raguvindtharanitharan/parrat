import { describe, expect, it } from 'vitest';
import { createNoopAuditLogger } from '../../src/core/audit/logger.js';
import type { Config } from '../../src/core/config/types.js';
import type { LlmClient } from '../../src/core/llm/client.js';
import { DEFAULT_TENANT_ID } from '../../src/core/types.js';
import { lineageAnalysisSkill } from '../../src/skills/lineage-analysis/index.js';
import { BASE_PROMPT } from '../../src/skills/lineage-analysis/prompt.js';

describe('skills/lineage-analysis', () => {
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

  it('prompt handles node-not-found pattern', () => {
    expect(BASE_PROMPT).toContain('not found in the dbt project');
    expect(BASE_PROMPT).toContain("confidence='low'");
  });

  it('prompt handles empty lineage graph', () => {
    expect(BASE_PROMPT).toContain('not an error');
    expect(BASE_PROMPT).toContain("confidence='medium'");
  });

  it('prompt handles tool error from dbt', () => {
    expect(BASE_PROMPT).toContain('Do not retry the failing tool');
  });

  it('has the expected name and kind', () => {
    expect(lineageAnalysisSkill.name).toBe('lineage-analysis');
    expect(lineageAnalysisSkill.kind).toBe('investigation');
  });

  it('declares the expected dbt tool allowlist', () => {
    const dbt = lineageAnalysisSkill.mcpServers?.dbt;
    expect(dbt).toBeDefined();
    expect(dbt?.tools).toEqual(['list', 'get_node_details_dev', 'get_lineage_dev']);
  });

  it('throws when ctx.config is missing', async () => {
    await expect(
      lineageAnalysisSkill.run({ node_id: 'model:fct_orders', direction: 'both', depth: 3 }, baseCtx),
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
      lineageAnalysisSkill.run(
        { node_id: 'model:fct_orders', direction: 'both', depth: 3 },
        { ...baseCtx, config },
      ),
    ).rejects.toThrow(/requires an LLM client/);
  });

  it("throws when config.mcpServers doesn't have 'dbt'", async () => {
    const config = {
      version: 1,
      tenant_id: 'default',
      mcpServers: {},
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

    const fakeLlm: LlmClient = {
      call: async () => {
        throw new Error('should not be called');
      },
    };

    await expect(
      lineageAnalysisSkill.run(
        { node_id: 'model:fct_orders', direction: 'both', depth: 3 },
        { ...baseCtx, config, llmClient: fakeLlm },
      ),
    ).rejects.toThrow(/requires a 'dbt' MCP server/);
  });
});
