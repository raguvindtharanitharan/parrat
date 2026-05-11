import { defineSkill, type SkillContext } from 'parrat/core';
import { z } from 'zod';

// --- Input schema ---

const inputSchema = z.object({
  model: z.string().min(1).describe("dbt model name to check (e.g. 'mart_orders')"),
  min_rows: z.number().int().positive().describe('Minimum expected row count'),
});

type Input = z.infer<typeof inputSchema>;

// --- Output schema ---

const outputSchema = z.object({
  model: z.string(),
  row_count: z.number().nullable().describe('Actual row count, or null if query failed'),
  passed: z.boolean().describe('True if row_count >= min_rows'),
  confidence: z.enum(['high', 'medium', 'low']),
  summary: z.string(),
});

type Output = z.infer<typeof outputSchema>;

// --- Skill definition ---

// Thin tool surface: 1 tool. `show` runs arbitrary SQL against the warehouse
// via dbt's existing connection — no separate warehouse credentials needed.
const allowedDbtTools = ['show'];

export const rowCountCheckSkill = defineSkill({
  name: 'row-count-check',
  inputSchema,
  outputSchema,
  kind: 'investigation',
  mcpServers: {
    dbt: {
      config: { command: '', args: [], env: {} }, // filled in at runtime from parrat.config.yaml
      tools: allowedDbtTools,
    },
  },

  async run(input: Input, ctx: SkillContext): Promise<Output> {
    if (!ctx.config) throw new Error('row-count-check requires runtime config.');
    if (!ctx.llmClient) throw new Error('row-count-check requires an LLM client.');

    const dbtUserConfig = ctx.config.mcpServers.dbt;
    if (!dbtUserConfig) {
      throw new Error("row-count-check requires a 'dbt' MCP server in parrat.config.yaml.");
    }

    const { executeSkill } = await import('parrat/core');

    const result = await executeSkill({
      skillName: 'row-count-check',
      llm: ctx.llmClient,
      systemPrompt: `
You are a data quality agent. Your job is to check whether a dbt model has at least a minimum
number of rows.

Use the \`show\` tool to run: SELECT COUNT(*) AS row_count FROM {{ ref('MODEL_NAME') }}
Replace MODEL_NAME with the model name provided in the input.

Then call emit_findings with:
- model: the model name
- row_count: the integer result from the query (null if the query failed)
- passed: true if row_count >= min_rows
- confidence: "high" if the query succeeded, "low" if it failed
- summary: one sentence describing the result
      `.trim(),
      userMessage: JSON.stringify(input),
      mcpServers: { dbt: { config: dbtUserConfig, tools: allowedDbtTools } },
      outputSchema,
      model: ctx.config.claude.model,
      maxTurns: ctx.config.claude.max_turns,
      maxTokens: ctx.config.claude.max_tokens,
      temperature: ctx.config.claude.temperature,
      auditLogger: ctx.auditLogger,
      runId: ctx.runId,
      workflowId: ctx.workflowId,
      tenantId: ctx.tenantId,
      actor: ctx.actor ?? 'user',
    });

    return result.output;
  },
});
