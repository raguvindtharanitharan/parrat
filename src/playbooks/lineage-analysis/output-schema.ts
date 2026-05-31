import { z } from 'zod';

const evidenceSchema = z.object({
  tool: z.string().describe('Which MCP tool produced this evidence'),
  finding: z.string().describe("What the tool returned that's load-bearing for the conclusion"),
});

export const outputSchema = z.object({
  node_id: z.string(),
  upstream_nodes: z.array(z.string()),
  downstream_nodes: z.array(z.string()),
  impact_count: z.number().int(),
  impact_summary: z.string(),
  critical_path: z.array(z.string()).optional(),
  truncated: z.boolean().default(false),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: z.array(evidenceSchema).default([]),
});

export type LineageAnalysisOutput = z.infer<typeof outputSchema>;
