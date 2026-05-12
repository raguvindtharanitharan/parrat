import type { MessageParam, Tool, ToolUseBlock } from '@anthropic-ai/sdk/resources';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AuditActor, AuditLogger } from '../audit/logger.js';
import { MaxTurnsExceededError, SchemaValidationError } from '../errors.js';
import {
  type McpClient,
  type McpServerConfig,
  type McpToolDefinition,
  connectMcpClient,
  resolveAllowlist,
} from '../mcp/index.js';
import type { TenantId } from '../types.js';
import type { LlmClient } from './client.js';

/**
 * Per-Skill MCP server declaration: the server config + the bare tool names
 * the Skill allows Claude to invoke.
 */
export interface SkillMcpServer {
  config: McpServerConfig;
  tools: string[];
}

export interface SkillExecutorOptions<TOutputSchema extends ZodTypeAny> {
  skillName: string;
  llm: LlmClient;
  systemPrompt: string;
  userMessage: string;
  mcpServers: Record<string, SkillMcpServer>;
  outputSchema: TOutputSchema;
  model: string;
  maxTurns: number;
  maxTokens: number;
  temperature: number;
  auditLogger: AuditLogger;
  runId: string;
  workflowId: string;
  tenantId: TenantId;
  actor: AuditActor;
}

export interface SkillExecutorResult<TOutput> {
  output: TOutput;
  totalTurns: number;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  durationMs: number;
}

const COST_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-opus-4': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5': { input: 0.8, output: 4.0 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const entry = Object.entries(COST_PER_MTOK).find(([prefix]) => model.startsWith(prefix));
  if (!entry) return 0;
  const [, rates] = entry;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

/**
 * Orchestrates the agentic execution of a Parrat Skill:
 *   1. Spawn declared MCP servers; list and filter their tools to the allowlist
 *   2. Inject emit_findings as the structured output channel (derived from outputSchema)
 *   3. Drive the Claude conversation across multiple turns:
 *      — on tool_use: route MCP calls to the right server, emit mcp_call audit events,
 *        feed tool_result back; handle emit_findings by capturing and validating output
 *      — on end_turn: return captured output if emit_findings was called, else throw
 *   4. Emit claude_call audit events per turn and skill_output_captured on emit_findings
 *   5. Close all MCP servers in try/finally regardless of outcome
 *
 * The Skill's run() function calls this once and receives the validated output.
 * All MCP lifecycle, Claude conversation management, audit emission, and turn
 * budgeting happen here — the Skill itself has no knowledge of any of it.
 */
export async function executeSkill<TOutputSchema extends ZodTypeAny>(
  options: SkillExecutorOptions<TOutputSchema>,
): Promise<SkillExecutorResult<z.infer<TOutputSchema>>> {
  const startedAt = Date.now();
  const clients: McpClient[] = [];

  // Build the Anthropic tool definitions + a lookup map from
  // fully-qualified tool name -> { client, bareName }
  const toolRouting = new Map<string, { client: McpClient; bareName: string }>();
  const tools: Tool[] = [];

  // Inject emit_findings as a synthetic tool — Claude must call it to produce output.
  // Input schema is derived from the Skill's outputSchema so the two stay in sync.
  const emitFindingsName = 'emit_findings';
  tools.push({
    name: emitFindingsName,
    description:
      'Report your investigation findings. Call this exactly once when your investigation is complete.',
    input_schema: zodToJsonSchema(options.outputSchema) as Tool['input_schema'],
  });

  try {
    for (const [serverName, server] of Object.entries(options.mcpServers)) {
      const client = await connectMcpClient(serverName, server.config);
      clients.push(client);

      const allowlist = resolveAllowlist(serverName, server.tools);
      const allowedSet = new Set(server.tools);
      const allTools = await client.listTools();

      for (const tool of allTools) {
        if (!allowedSet.has(tool.name)) continue;
        const fqName = `mcp__${serverName}__${tool.name}`;
        toolRouting.set(fqName, { client, bareName: tool.name });
        tools.push({
          name: fqName,
          description: tool.description ?? `Tool ${tool.name} from MCP server ${serverName}`,
          input_schema: tool.inputSchema as Tool['input_schema'],
        });
      }
      // Sanity — fail loud if the allowlist names a tool the server didn't expose
      const exposedNames = new Set(allTools.map((t) => t.name));
      for (const expected of server.tools) {
        if (!exposedNames.has(expected)) {
          throw new Error(
            `MCP server '${serverName}' did not expose required tool '${expected}'. ` +
              `Available: ${[...exposedNames].join(', ') || '(none)'}.`,
          );
        }
      }
      // Mark allowlist as referenced (silence the unused warning)
      void allowlist;
    }

    const messages: MessageParam[] = [{ role: 'user', content: options.userMessage }];
    let inputTokens = 0;
    let outputTokens = 0;
    let totalCostUsd = 0;
    let capturedOutput: z.infer<TOutputSchema> | undefined;

    for (let turn = 0; turn < options.maxTurns; turn++) {
      const turnStartedAt = Date.now();
      const response = await options.llm.call({
        model: options.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        system: options.systemPrompt,
        messages,
        tools,
      });
      const turnDurationMs = Date.now() - turnStartedAt;

      inputTokens += response.usage.input_tokens;
      outputTokens += response.usage.output_tokens;
      const turnCostUsd = estimateCost(
        options.model,
        response.usage.input_tokens,
        response.usage.output_tokens,
      );
      totalCostUsd += turnCostUsd;

      await options.auditLogger.write({
        type: 'claude_call',
        tenantId: options.tenantId,
        runId: options.runId,
        workflowId: options.workflowId,
        skill: options.skillName,
        actor: options.actor,
        payload: {
          model: options.model,
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cost_estimate_usd: turnCostUsd,
          duration_ms: turnDurationMs,
          turn_index: turn,
        },
      });

      if (response.stop_reason === 'end_turn') {
        if (capturedOutput !== undefined) {
          return {
            output: capturedOutput,
            totalTurns: turn + 1,
            inputTokens,
            outputTokens,
            totalCostUsd,
            durationMs: Date.now() - startedAt,
          };
        }
        throw new MaxTurnsExceededError(options.skillName, options.maxTurns);
      }

      if (response.stop_reason === 'tool_use') {
        const toolUses = response.content.filter(
          (block): block is ToolUseBlock => block.type === 'tool_use',
        );

        messages.push({ role: 'assistant', content: response.content });

        const toolResultBlocks: { type: 'tool_result'; tool_use_id: string; content: string }[] =
          [];

        for (const toolUse of toolUses) {
          // emit_findings is handled here; not routed to any MCP client
          if (toolUse.name === emitFindingsName) {
            try {
              capturedOutput = options.outputSchema.parse(toolUse.input) as z.infer<TOutputSchema>;
              await options.auditLogger.write({
                type: 'skill_output_captured',
                tenantId: options.tenantId,
                runId: options.runId,
                workflowId: options.workflowId,
                skill: options.skillName,
                actor: options.actor,
                payload: { output: capturedOutput, turn_index: turn },
              });
              toolResultBlocks.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: 'Findings recorded.',
              });
            } catch (e) {
              const message = e instanceof ZodError ? e.message : String(e);
              toolResultBlocks.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: `Validation error — revise and call emit_findings again: ${message}`,
              });
            }
            continue;
          }

          const route = toolRouting.get(toolUse.name);
          if (!route) {
            throw new Error(
              `Claude requested tool '${toolUse.name}' which is not in the allowlist. This indicates a bug — the API SDK should never expose disallowed tools.`,
            );
          }

          const callStartedAt = Date.now();
          const args = toolUse.input as Record<string, unknown>;
          const result = await route.client.callTool(route.bareName, args);
          const durationMs = Date.now() - callStartedAt;

          const isError = result.isError ?? false;
          const toolReturnedError =
            !isError &&
            Array.isArray(result.content) &&
            result.content.some(
              (item) =>
                item !== null &&
                typeof item === 'object' &&
                (item as Record<string, unknown>).type === 'text' &&
                typeof (item as Record<string, unknown>).text === 'string' &&
                /^error/i.test(
                  ((item as Record<string, unknown>).text as string).trim(),
                ),
            );

          await options.auditLogger.write({
            type: 'mcp_call',
            tenantId: options.tenantId,
            runId: options.runId,
            workflowId: options.workflowId,
            skill: options.skillName,
            actor: options.actor,
            payload: {
              server: route.client.serverName,
              tool: route.bareName,
              args,
              result: result.content,
              is_error: isError,
              tool_returned_error: toolReturnedError,
              duration_ms: durationMs,
              turn_index: turn,
            },
          });

          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result.content),
          });
        }

        // If emit_findings was the only tool call and output is captured, we're done
        if (
          capturedOutput !== undefined &&
          toolResultBlocks.every((b) => b.content === 'Findings recorded.')
        ) {
          return {
            output: capturedOutput,
            totalTurns: turn + 1,
            inputTokens,
            outputTokens,
            totalCostUsd,
            durationMs: Date.now() - startedAt,
          };
        }

        messages.push({ role: 'user', content: toolResultBlocks });
        continue;
      }

      // Any other stop_reason (e.g., max_tokens, refusal) — bail
      throw new Error(
        `Unexpected stop_reason '${response.stop_reason}' from Claude in skill '${options.skillName}'`,
      );
    }

    throw new MaxTurnsExceededError(options.skillName, options.maxTurns);
  } finally {
    for (const client of clients) {
      try {
        await client.close();
      } catch {
        // Best-effort cleanup; don't shadow the original error
      }
    }
  }
}
