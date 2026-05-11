import { z } from 'zod';

const evidenceSchema = z.object({
  tool: z.string().describe('Which MCP tool produced this evidence'),
  finding: z.string().describe("What the tool returned that's load-bearing for the conclusion"),
});

export const outputSchema = z.object({
  metric_name: z.string(),
  drop_percent: z.number(),
  status: z.enum([
    'data_missing',
    'volume_drop',
    'upstream_model_issue',
    'pipeline_failure',
    'schema_change',
    'unknown',
  ]),
  root_cause: z.string(),
  suspect_models: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  recommended_action: z.string().nullable(),
  evidence: z.array(evidenceSchema).default([]),
});

export type MetricDropRcaOutput = z.infer<typeof outputSchema>;
