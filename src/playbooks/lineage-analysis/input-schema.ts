import { z } from 'zod';

export const inputSchema = z.object({
  node_id: z.string().min(1),
  direction: z.enum(['upstream', 'downstream', 'both']).default('both'),
  depth: z.number().int().min(1).max(5).default(3),
  project_path: z.string().optional(),
});

export type LineageAnalysisInput = z.infer<typeof inputSchema>;
