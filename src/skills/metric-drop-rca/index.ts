import { executeSkill } from '../../core/llm/skill-executor.js';
import { type SkillContext, defineSkill } from '../../core/skills/Skill.js';
import { type MetricDropRcaInput, inputSchema } from './input-schema.js';
import { type MetricDropRcaOutput, outputSchema } from './output-schema.js';
import { BASE_PROMPT } from './prompt.js';

const allowedDbtTools = ['list', 'get_node_details_dev', 'get_lineage_dev', 'show'];

export const metricDropRcaSkill = defineSkill({
  name: 'metric-drop-rca',
  inputSchema,
  outputSchema,
  kind: 'investigation',
  mcpServers: {
    dbt: {
      config: { command: '', args: [], env: {} },
      tools: allowedDbtTools,
    },
  },

  async run(input: MetricDropRcaInput, ctx: SkillContext): Promise<MetricDropRcaOutput> {
    if (!ctx.config) throw new Error('metric-drop-rca requires runtime-provided config.');
    if (!ctx.llmClient) throw new Error('metric-drop-rca requires an LLM client.');

    const dbtUserConfig = ctx.config.mcpServers.dbt;
    if (!dbtUserConfig) {
      throw new Error("metric-drop-rca requires a 'dbt' MCP server in parrat.config.yaml.");
    }

    const result = await executeSkill({
      skillName: 'metric-drop-rca',
      llm: ctx.llmClient,
      systemPrompt: BASE_PROMPT,
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
