import { z } from 'zod';

export const inputSchema = z.object({
  metric_name: z.string().min(1),
  model_id: z.string().min(1),
  metric_column: z.string().min(1),
  drop_percent: z.number().min(0).max(100),
  time_window_hours: z.number().positive().default(24),
  project_path: z.string().optional(),
});

export type MetricDropRcaInput = z.infer<typeof inputSchema>;
