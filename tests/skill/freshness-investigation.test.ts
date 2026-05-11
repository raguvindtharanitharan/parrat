import { describe, expect, it } from 'vitest';
import { createNoopAuditLogger } from '../../src/core/audit/logger.js';
import type { Config } from '../../src/core/config/types.js';
import type { LlmClient } from '../../src/core/llm/client.js';
import { DEFAULT_TENANT_ID } from '../../src/core/types.js';
import { freshnessInvestigationSkill } from '../../src/skills/freshness-investigation/index.js';
import { buildSystemPrompt } from '../../src/skills/freshness-investigation/prompt.js';

/**
 * L3 tests for freshness-investigation. These exercise the Skill's
 * pre-flight assertions (config + llmClient + dbt MCP server present).
 * Full end-to-end flow with canned MCP responses lives in
 * tests/component/skill-executor.test.ts (more comprehensive coverage at the
 * skill-executor layer; the Skill is a thin composition over it).
 */
describe('skills/freshness-investigation', () => {
  const baseCtx = {
    tenantId: DEFAULT_TENANT_ID,
    runId: 'test-run',
    workflowId: 'test-run',
    auditLogger: createNoopAuditLogger(),
    actor: 'user' as const,
  };

  it('prompt instructs Claude to call emit_findings (not return raw JSON)', () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain('emit_findings');
    expect(prompt).not.toContain('Your ENTIRE response must be a single valid JSON object');
  });

  it('has the expected name and kind', () => {
    expect(freshnessInvestigationSkill.name).toBe('freshness-investigation');
    expect(freshnessInvestigationSkill.kind).toBe('investigation');
  });

  it('declares the expected dbt tool allowlist', () => {
    const dbt = freshnessInvestigationSkill.mcpServers?.dbt;
    expect(dbt).toBeDefined();
    expect(dbt?.tools).toEqual(['list', 'get_node_details_dev', 'get_lineage_dev', 'show']);
  });

  it('throws when ctx.config is missing', async () => {
    await expect(
      freshnessInvestigationSkill.run(
        { source: 'tpch.orders', threshold: 'error' as const },
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
      },
      claude: { model: 'claude-sonnet-4-6', max_turns: 6, max_tokens: 4096, temperature: 0 },
    } as Config;

    await expect(
      freshnessInvestigationSkill.run(
        { source: 'tpch.orders', threshold: 'error' as const },
        { ...baseCtx, config },
      ),
    ).rejects.toThrow(/requires an LLM client/);
  });

  it("throws when config.mcpServers doesn't have 'dbt'", async () => {
    const config = {
      version: 1,
      tenant_id: 'default',
      mcpServers: {}, // no dbt
      skills: { defaults: { timeout_seconds: 60, max_retries: 2 } },
      audit: {
        log_path: '.parrat/audit.jsonl',
        hash_algorithm: 'sha256' as const,
        retention_days: 90,
        redact_fields: [],
      },
      claude: { model: 'claude-sonnet-4-6', max_turns: 6, max_tokens: 4096, temperature: 0 },
    } as Config;

    const fakeLlm: LlmClient = {
      call: async () => {
        throw new Error('should not be called');
      },
    };

    await expect(
      freshnessInvestigationSkill.run(
        { source: 'tpch.orders', threshold: 'error' as const },
        { ...baseCtx, config, llmClient: fakeLlm },
      ),
    ).rejects.toThrow(/requires an 'dbt' MCP server/);
  });
});
