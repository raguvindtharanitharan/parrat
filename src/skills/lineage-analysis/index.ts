import { executeSkill } from '../../core/llm/skill-executor.js';
import { type SkillContext, defineSkill } from '../../core/skills/Skill.js';
import { type LineageAnalysisInput, inputSchema } from './input-schema.js';
import { type LineageAnalysisOutput, outputSchema } from './output-schema.js';
import { BASE_PROMPT } from './prompt.js';

const allowedDbtTools = ['list', 'get_node_details_dev', 'get_lineage_dev'];

export const lineageAnalysisSkill = defineSkill({
  name: 'lineage-analysis',
  inputSchema,
  outputSchema,
  kind: 'investigation',
  mcpServers: {
    dbt: {
      config: { command: '', args: [], env: {} },
      tools: allowedDbtTools,
    },
  },

  async run(input: LineageAnalysisInput, ctx: SkillContext): Promise<LineageAnalysisOutput> {
    if (!ctx.config) throw new Error('lineage-analysis requires runtime-provided config.');
    if (!ctx.llmClient) throw new Error('lineage-analysis requires an LLM client.');

    const dbtUserConfig = ctx.config.mcpServers.dbt;
    if (!dbtUserConfig) {
      throw new Error("lineage-analysis requires a 'dbt' MCP server in parrat.config.yaml.");
    }

    const result = await executeSkill({
      skillName: 'lineage-analysis',
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
