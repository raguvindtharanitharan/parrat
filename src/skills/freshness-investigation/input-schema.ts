import { z } from 'zod';

/**
 * Input shape for the freshness-investigation Skill.
 *
 * `source` is a dbt source identifier in 'source_name.table_name' format
 * (e.g., 'tpch.orders'). Omit to investigate all sources with freshness
 * configs in the project.
 *
 * `threshold` controls which level of staleness counts as a violation:
 * 'warn' surfaces sources past their warn_after threshold; 'error' (default)
 * surfaces only sources past error_after.
 */
export const inputSchema = z.object({
  source: z.string().min(1).optional(),
  threshold: z.enum(['warn', 'error']).default('error'),
});

export type FreshnessInvestigationInput = z.infer<typeof inputSchema>;
