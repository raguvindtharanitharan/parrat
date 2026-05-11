import { describe, expect, it } from 'vitest';
import { inputSchema } from '../../src/skills/lineage-analysis/input-schema.js';
import { outputSchema } from '../../src/skills/lineage-analysis/output-schema.js';

describe('lineage-analysis inputSchema', () => {
  it('rejects missing node_id', () => {
    const result = inputSchema.safeParse({ direction: 'both', depth: 3 });
    expect(result.success).toBe(false);
  });

  it('rejects depth above 5', () => {
    const result = inputSchema.safeParse({ node_id: 'model.parrat_dogfood.fct_orders', depth: 6 });
    expect(result.success).toBe(false);
  });

  it('rejects depth below 1', () => {
    const result = inputSchema.safeParse({ node_id: 'model.parrat_dogfood.fct_orders', depth: 0 });
    expect(result.success).toBe(false);
  });

  it('applies default direction of both', () => {
    const result = inputSchema.safeParse({ node_id: 'model.parrat_dogfood.fct_orders' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.direction).toBe('both');
  });

  it('applies default depth of 3', () => {
    const result = inputSchema.safeParse({ node_id: 'model.parrat_dogfood.fct_orders' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.depth).toBe(3);
  });
});

describe('lineage-analysis outputSchema', () => {
  const validOutput = {
    node_id: 'model.parrat_dogfood.fct_orders',
    upstream_nodes: ['model.parrat_dogfood.stg_orders', 'source.parrat_dogfood.tpch.orders'],
    downstream_nodes: ['model.parrat_dogfood.mart_revenue'],
    impact_count: 3,
    impact_summary: 'fct_orders depends on 2 upstream nodes and feeds 1 downstream mart.',
    confidence: 'high' as const,
    evidence: [{ tool: 'get_lineage_dev', finding: 'returned 3 nodes at depth 3' }],
  };

  it('accepts a valid output payload', () => {
    expect(outputSchema.safeParse(validOutput).success).toBe(true);
  });

  it('impact_count matches upstream + downstream length', () => {
    const result = outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.impact_count).toBe(
        result.data.upstream_nodes.length + result.data.downstream_nodes.length,
      );
    }
  });

  it('defaults truncated to false when omitted', () => {
    const result = outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.truncated).toBe(false);
  });

  it('accepts truncated: true', () => {
    const result = outputSchema.safeParse({ ...validOutput, truncated: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.truncated).toBe(true);
  });

  it('accepts output without critical_path', () => {
    const result = outputSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.critical_path).toBeUndefined();
  });

  it('accepts output with critical_path populated', () => {
    const result = outputSchema.safeParse({
      ...validOutput,
      critical_path: [
        'source.parrat_dogfood.tpch.orders',
        'model.parrat_dogfood.stg_orders',
        'model.parrat_dogfood.fct_orders',
      ],
    });
    expect(result.success).toBe(true);
  });
});
