import { executePlaybook } from '../../core/llm/playbook-executor.js';
import { type PlaybookContext, definePlaybook } from '../../core/playbooks/Playbook.js';
import { DbtFreshnessContextProvider } from './freshness-context-provider.js';
import { type FreshnessInvestigationInput, inputSchema } from './input-schema.js';
import { type FreshnessInvestigationOutput, outputSchema } from './output-schema.js';
import { buildSystemPrompt } from './prompt.js';

/**
 * The freshness-investigation Playbook — Parrat's M1 wedge.
 *
 * Given a stale dbt source (or asked to check all sources), investigates the
 * root cause by walking the dbt project's freshness configs + lineage via
 * dbt-mcp tools, returning a structured finding.
 *
 * Tool allowlist (4 of dbt-mcp's 47 tools): `list`, `get_node_details_dev`,
 * `get_lineage_dev`, `show`. The thin tool surface is the methodology — see
 * business/plan/learning-dbt-vs-airbyte.md Lesson #7.
 *
 * The MCP server config (command, args, env) comes from the user's
 * parrat.config.yaml at runtime. Here we declare which tools the Playbook
 * allowlists. The runtime merges Playbook allowlist + user MCP server config
 * before spawning.
 */
const allowedDbtTools = ['list', 'get_node_details_dev', 'get_lineage_dev', 'show'];

export const freshnessInvestigationPlaybook = definePlaybook({
  name: 'freshness-investigation',
  inputSchema,
  outputSchema,
  kind: 'investigation',
  // Tool allowlist — declared at the Playbook level. The runtime resolves the
  // actual MCP server config (command, args, env) from the user's
  // parrat.config.yaml at invocation time.
  mcpServers: {
    dbt: {
      // The `config` field is filled in by the runtime from parrat.config.yaml
      // when the Playbook is invoked. We use a placeholder here that the runtime
      // overrides; declaring it satisfies the PlaybookSpec type.
      config: { command: '', args: [], env: {} },
      tools: allowedDbtTools,
    },
  },

  async run(
    input: FreshnessInvestigationInput,
    ctx: PlaybookContext,
  ): Promise<FreshnessInvestigationOutput> {
    if (!ctx.config) {
      throw new Error(
        'freshness-investigation requires runtime-provided config. Did the runtime forget to load it?',
      );
    }
    if (!ctx.llmClient) {
      throw new Error(
        'freshness-investigation requires an LLM client. Did the runtime forget to construct one?',
      );
    }
    const userMcpServers = ctx.config.mcpServers;
    const dbtUserConfig = userMcpServers.dbt;
    if (!dbtUserConfig) {
      throw new Error(
        "freshness-investigation requires an 'dbt' MCP server in parrat.config.yaml.",
      );
    }

    const dbtProjectDir = ctx.config.mcpServers.dbt?.env?.DBT_PROJECT_DIR;
    if (!dbtProjectDir) {
      throw new Error(
        'freshness-investigation: DBT_PROJECT_DIR must be set in mcpServers.dbt.env in parrat.config.yaml',
      );
    }
    const provider = new DbtFreshnessContextProvider(dbtProjectDir);
    const contexts = await provider.getContext(input.source ? [input.source] : undefined);
    const prompt = buildSystemPrompt(contexts);

    const result = await executePlaybook({
      playbookName: 'freshness-investigation',
      llm: ctx.llmClient,
      systemPrompt: prompt,
      userMessage: JSON.stringify(input),
      mcpServers: {
        dbt: {
          config: dbtUserConfig,
          tools: allowedDbtTools,
        },
      },
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
