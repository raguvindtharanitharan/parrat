import { z } from 'zod';

const staleSourceSchema = z.object({
  source: z.string().describe("Source identifier in 'source_name.table_name' format"),
  last_loaded_at: z.string().describe('ISO 8601 timestamp of the most recent loaded data'),
  threshold_breached: z.enum(['warn', 'error']).describe('Which threshold was crossed'),
  summary: z.string().describe('One-paragraph explanation of why this specific source is stale'),
});

const downstreamImpactSchema = z.object({
  models: z
    .array(z.string())
    .describe('Fully-qualified model names that depend on stale source(s)'),
  severity: z
    .enum(['high', 'medium', 'low'])
    .describe(
      'Estimated business impact: high = critical mart; medium = intermediate; low = limited',
    ),
});

const evidenceSchema = z.object({
  tool: z.string().describe('Which MCP tool produced this evidence'),
  finding: z.string().describe("What the tool returned that's load-bearing for the conclusion"),
});

/**
 * Output shape for the freshness-investigation Skill.
 *
 * `status` covers all observed states including 'no_freshness_config' (source
 * has no freshness rules; can't be classified as fresh/stale) and 'unknown'
 * (Claude couldn't determine; evidence is incomplete).
 *
 * `confidence` calibration:
 *   high   — ≥2 corroborating tool results agree
 *   medium — 1 tool result + plausible reasoning fills gaps
 *   low    — inferred from incomplete evidence; status='unknown' is preferred
 */
export const outputSchema = z.object({
  status: z.enum(['fresh', 'stale_warn', 'stale_error', 'no_freshness_config', 'unknown']),
  stale_sources: z.array(staleSourceSchema).default([]),
  confidence: z.enum(['high', 'medium', 'low']),
  root_cause_summary: z.string(),
  evidence: z.array(evidenceSchema).default([]),
  recommended_action: z.string().nullable(),
  downstream_impact: downstreamImpactSchema,
});

export type FreshnessInvestigationOutput = z.infer<typeof outputSchema>;
