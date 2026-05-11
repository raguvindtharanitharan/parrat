import { describe, expect, it } from 'vitest';
import { inputSchema } from '../../src/skills/metric-drop-rca/input-schema.js';
import { outputSchema } from '../../src/skills/metric-drop-rca/output-schema.js';

describe('metric-drop-rca inputSchema', () => {
  it('rejects missing metric_name', () => {
    const result = inputSchema.safeParse({
      model_id: 'fct_orders',
      metric_column: 'revenue',
      drop_percent: 40,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing model_id', () => {
    const result = inputSchema.safeParse({
      metric_name: 'weekly_revenue',
      metric_column: 'revenue',
      drop_percent: 40,
    });
    expect(result.success).toBe(false);
  });

  it('rejects drop_percent above 100', () => {
    const result = inputSchema.safeParse({
      metric_name: 'weekly_revenue',
      model_id: 'fct_orders',
      metric_column: 'revenue',
      drop_percent: 110,
    });
    expect(result.success).toBe(false);
  });

  it('applies default time_window_hours of 24', () => {
    const result = inputSchema.safeParse({
      metric_name: 'weekly_revenue',
      model_id: 'fct_orders',
      metric_column: 'revenue',
      drop_percent: 40,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.time_window_hours).toBe(24);
  });
});

describe('metric-drop-rca outputSchema', () => {
  const validOutput = {
    metric_name: 'weekly_revenue',
    drop_percent: 40,
    status: 'upstream_model_issue' as const,
    root_cause: 'stg_orders had 0 rows for the current window',
    suspect_models: ['model.parrat_dogfood.stg_orders'],
    confidence: 'high' as const,
    recommended_action: 'Check stg_orders pipeline for failures',
    evidence: [{ tool: 'show', finding: 'COUNT(*) returned 0 for current window' }],
  };

  it('accepts a valid output payload', () => {
    expect(outputSchema.safeParse(validOutput).success).toBe(true);
  });

  it('accepts null recommended_action', () => {
    const result = outputSchema.safeParse({ ...validOutput, recommended_action: null });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status value', () => {
    const result = outputSchema.safeParse({ ...validOutput, status: 'not_a_status' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid confidence value', () => {
    const result = outputSchema.safeParse({ ...validOutput, confidence: 'very_high' });
    expect(result.success).toBe(false);
  });

  it('defaults evidence to empty array when omitted', () => {
    const { evidence: _, ...withoutEvidence } = validOutput;
    const result = outputSchema.safeParse(withoutEvidence);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.evidence).toEqual([]);
  });
});
