import { describe, expect, it } from 'vitest';
import type { AuditEventInput, AuditLogger } from '../../src/core/audit/logger.js';
import { createRegistry } from '../../src/core/playbooks/registry.js';
import { createRuntime } from '../../src/core/runtime.js';
import { freshnessInvestigationPlaybook } from '../../src/playbooks/freshness-investigation/index.js';
import { outputSchema } from '../../src/playbooks/freshness-investigation/output-schema.js';

/**
 * L5 — Live tests against the personal Snowflake dogfood. Gated on
 * SNOWFLAKE_TEST_CONNECTION env var; skipped when absent (the default
 * in PR CI).
 *
 * To run locally: set SNOWFLAKE_TEST_CONNECTION=1 in your shell, ensure
 * `.parrat/config.yaml` points at the dogfood project, and have
 * ANTHROPIC_API_KEY set.
 */
const live = process.env.SNOWFLAKE_TEST_CONNECTION ? describe : describe.skip;

function createCapturingAuditLogger(): AuditLogger & { events: AuditEventInput[] } {
  const events: AuditEventInput[] = [];
  return {
    events,
    write: async (event) => {
      events.push(event);
    },
  };
}

live('playbooks/freshness-investigation (live Snowflake)', () => {
  it('runs end-to-end against the dogfood and returns valid output', async () => {
    const auditLogger = createCapturingAuditLogger();
    const registry = createRegistry([freshnessInvestigationPlaybook]);
    const runtime = createRuntime({ registry, auditLogger });

    const output = await runtime.invoke({
      playbook: 'freshness-investigation',
      input: { threshold: 'error' },
      actor: 'user',
    });

    expect(() => outputSchema.parse(output)).not.toThrow();
  }, 180_000);

  it('cost per investigation stays under $0.50', async () => {
    const auditLogger = createCapturingAuditLogger();
    const registry = createRegistry([freshnessInvestigationPlaybook]);
    const runtime = createRuntime({ registry, auditLogger });

    await runtime.invoke({
      playbook: 'freshness-investigation',
      input: { threshold: 'error' },
      actor: 'user',
    });

    const totalCostUsd = auditLogger.events
      .filter((e) => e.type === 'claude_call')
      .reduce((sum, e) => sum + ((e.payload.cost_estimate_usd as number) ?? 0), 0);

    expect(totalCostUsd).toBeLessThan(0.5);
  }, 180_000);

  // Latency gate tests a single-source investigation. Single-source runs
  // 4 MCP calls (list + node_details + lineage + show) at 5-9s each plus
  // 3-4 Claude turns, putting P50 at ~60-70s. 90s gate catches regressions
  // (e.g., extra playbook-executor turns, unbounded retries) without flapping on P50.
  // All-sources runs are bounded by the 6-turn budget, not this gate.
  it('latency under 90s for single-source typical case', async () => {
    const auditLogger = createCapturingAuditLogger();
    const registry = createRegistry([freshnessInvestigationPlaybook]);
    const runtime = createRuntime({ registry, auditLogger });

    const startedAt = Date.now();
    await runtime.invoke({
      playbook: 'freshness-investigation',
      input: { source: 'tpch.orders', threshold: 'error' },
      actor: 'user',
    });
    const durationMs = Date.now() - startedAt;

    expect(durationMs).toBeLessThan(90_000);
  }, 120_000);
});
