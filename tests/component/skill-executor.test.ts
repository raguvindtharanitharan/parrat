import type { Message, Tool } from '@anthropic-ai/sdk/resources';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { type AuditEventInput, createNoopAuditLogger } from '../../src/core/audit/logger.js';
import { MaxTurnsExceededError } from '../../src/core/errors.js';
import type { LlmClient } from '../../src/core/llm/client.js';
import { executeSkill } from '../../src/core/llm/skill-executor.js';
import { DEFAULT_TENANT_ID } from '../../src/core/types.js';
import { createMockMcpClient } from '../helpers/mockMcpServer.js';

vi.mock('../../src/core/mcp/client.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/core/mcp/client.js')>(
    '../../src/core/mcp/client.js',
  );
  return { ...actual, connectMcpClient: vi.fn() };
});

import { connectMcpClient } from '../../src/core/mcp/client.js';

const outputSchema = z.object({
  status: z.enum(['ok', 'fail']),
  detail: z.string(),
});

type AuditLogger = { write: (e: AuditEventInput) => Promise<void> };

function createCapturingLogger(): { logger: AuditLogger; events: AuditEventInput[] } {
  const events: AuditEventInput[] = [];
  return {
    logger: {
      write: async (e) => {
        events.push(e);
      },
    },
    events,
  };
}

function makeEndTurnMessage(text = ''): Message {
  return {
    id: 'msg-final',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'end_turn',
    stop_sequence: null,
    content: text ? [{ type: 'text', text, citations: null }] : [],
    usage: {
      input_tokens: 50,
      output_tokens: 20,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as Message;
}

function makeToolUseMessage(
  toolName: string,
  toolUseId: string,
  args: Record<string, unknown>,
): Message {
  return {
    id: `msg-${toolUseId}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    stop_reason: 'tool_use',
    stop_sequence: null,
    content: [{ type: 'tool_use', id: toolUseId, name: toolName, input: args }],
    usage: {
      input_tokens: 50,
      output_tokens: 20,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
    },
  } as Message;
}

function makeMockLlmClient(responses: Message[], onCall?: (tools: Tool[]) => void): LlmClient {
  const queue = [...responses];
  return {
    call: async (opts) => {
      onCall?.(opts.tools ?? []);
      const next = queue.shift();
      if (!next) throw new Error('mock LlmClient: no more responses queued');
      return next;
    },
  };
}

const BASE_OPTIONS = {
  systemPrompt: 'sys',
  userMessage: 'go',
  mcpServers: {
    dbt: { config: { command: 'uvx', args: [] as string[], env: {} }, tools: ['list'] },
  },
  outputSchema,
  model: 'claude-sonnet-4-6',
  maxTurns: 6,
  maxTokens: 1024,
  temperature: 0,
  auditLogger: createNoopAuditLogger(),
  runId: 'run-1',
  workflowId: 'run-1',
  tenantId: DEFAULT_TENANT_ID,
  actor: 'user' as const,
};

describe('core/llm/skill-executor', () => {
  beforeEach(() => {
    vi.mocked(connectMcpClient).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('injects emit_findings into the tools list presented to Claude', async () => {
    const mock = createMockMcpClient('dbt', [
      { name: 'list', description: 'list', inputSchema: {} },
    ]);
    vi.mocked(connectMcpClient).mockResolvedValue(mock);

    const capturedTools: Tool[] = [];
    const llm = makeMockLlmClient(
      [makeToolUseMessage('emit_findings', 'tu-1', { status: 'ok', detail: 'done' })],
      (tools) => capturedTools.push(...tools),
    );

    await executeSkill({ ...BASE_OPTIONS, skillName: 'test-skill', llm });

    const names = capturedTools.map((t) => t.name);
    expect(names).toContain('emit_findings');
    expect(names).toContain('mcp__dbt__list');
  });

  it('returns the validated output on a single-turn happy path via emit_findings', async () => {
    const mock = createMockMcpClient('dbt', [
      { name: 'list', description: 'list', inputSchema: {} },
    ]);
    vi.mocked(connectMcpClient).mockResolvedValue(mock);

    const llm = makeMockLlmClient([
      makeToolUseMessage('emit_findings', 'tu-1', { status: 'ok', detail: 'all good' }),
    ]);

    const result = await executeSkill({ ...BASE_OPTIONS, skillName: 'test-skill', llm });

    expect(result.output).toEqual({ status: 'ok', detail: 'all good' });
    expect(result.totalTurns).toBe(1);
    expect(result.inputTokens).toBe(50);
    expect(result.outputTokens).toBe(20);
  });

  it('captures output and emits skill_output_captured audit event', async () => {
    const mock = createMockMcpClient('dbt', [
      { name: 'list', description: 'list', inputSchema: {} },
    ]);
    vi.mocked(connectMcpClient).mockResolvedValue(mock);

    const { logger, events } = createCapturingLogger();
    const llm = makeMockLlmClient([
      makeToolUseMessage('emit_findings', 'tu-1', { status: 'ok', detail: 'captured' }),
    ]);

    const result = await executeSkill({
      ...BASE_OPTIONS,
      skillName: 'test-skill',
      llm,
      auditLogger: logger,
    });

    expect(result.output).toEqual({ status: 'ok', detail: 'captured' });
    const captureEvent = events.find((e) => e.type === 'skill_output_captured');
    expect(captureEvent).toBeDefined();
    expect(captureEvent?.payload.output).toEqual({ status: 'ok', detail: 'captured' });
    expect(captureEvent?.payload.turn_index).toBe(0);
  });

  it('routes a tool call through the right MCP client before emit_findings', async () => {
    const mock = createMockMcpClient('dbt', [
      { name: 'list', description: 'list', inputSchema: {} },
    ]);
    mock.queueResponse('list', { sources: ['tpch.orders'] });
    vi.mocked(connectMcpClient).mockResolvedValue(mock);

    const llm = makeMockLlmClient([
      makeToolUseMessage('mcp__dbt__list', 'tu-1', { filter: 'sources' }),
      makeToolUseMessage('emit_findings', 'tu-2', { status: 'ok', detail: 'found 1 source' }),
    ]);

    const result = await executeSkill({ ...BASE_OPTIONS, skillName: 'test-skill', llm });

    expect(result.totalTurns).toBe(2);
    expect(mock.calls).toEqual([{ name: 'list', args: { filter: 'sources' } }]);
  });

  it('returns error tool_result and retries when emit_findings args fail validation', async () => {
    const mock = createMockMcpClient('dbt', [
      { name: 'list', description: 'list', inputSchema: {} },
    ]);
    vi.mocked(connectMcpClient).mockResolvedValue(mock);

    const llm = makeMockLlmClient([
      makeToolUseMessage('emit_findings', 'tu-1', { status: 'banana' }), // invalid enum
      makeToolUseMessage('emit_findings', 'tu-2', { status: 'ok', detail: 'fixed' }),
    ]);

    const result = await executeSkill({ ...BASE_OPTIONS, skillName: 'test-skill', llm });

    expect(result.output).toEqual({ status: 'ok', detail: 'fixed' });
    expect(result.totalTurns).toBe(2);
  });

  it('throws MaxTurnsExceededError when budget is hit without emit_findings', async () => {
    const mock = createMockMcpClient('dbt', [
      { name: 'list', description: 'list', inputSchema: {} },
    ]);
    vi.mocked(connectMcpClient).mockResolvedValue(mock);

    const llm = makeMockLlmClient([
      makeToolUseMessage('mcp__dbt__list', 'tu-1', {}),
      makeToolUseMessage('mcp__dbt__list', 'tu-2', {}),
    ]);

    await expect(
      executeSkill({ ...BASE_OPTIONS, skillName: 'budget-test', llm, maxTurns: 2 }),
    ).rejects.toThrow(MaxTurnsExceededError);
  });

  it('throws MaxTurnsExceededError on end_turn without a prior emit_findings call', async () => {
    const mock = createMockMcpClient('dbt', [
      { name: 'list', description: 'list', inputSchema: {} },
    ]);
    vi.mocked(connectMcpClient).mockResolvedValue(mock);

    const llm = makeMockLlmClient([makeEndTurnMessage()]);

    await expect(executeSkill({ ...BASE_OPTIONS, skillName: 'no-emit-test', llm })).rejects.toThrow(
      MaxTurnsExceededError,
    );
  });

  it('sets tool_returned_error true when tool returns error text content', async () => {
    const mock = createMockMcpClient('dbt', [
      { name: 'list', description: 'list', inputSchema: {} },
    ]);
    mock.queueResponse('list', [{ type: 'text', text: 'Error: model not found' }]);
    vi.mocked(connectMcpClient).mockResolvedValue(mock);

    const { logger, events } = createCapturingLogger();
    const llm = makeMockLlmClient([
      makeToolUseMessage('mcp__dbt__list', 'tu-1', {}),
      makeToolUseMessage('emit_findings', 'tu-2', { status: 'ok', detail: 'done' }),
    ]);

    await executeSkill({ ...BASE_OPTIONS, skillName: 'test-skill', llm, auditLogger: logger });

    const mcpEvent = events.find((e) => e.type === 'mcp_call');
    expect(mcpEvent?.payload.tool_returned_error).toBe(true);
    expect(mcpEvent?.payload.is_error).toBe(false);
  });

  it('sets is_error true when tool returns a protocol-level error', async () => {
    const mock = createMockMcpClient('dbt', [
      { name: 'list', description: 'list', inputSchema: {} },
    ]);
    mock.queueResponse('list', [{ type: 'text', text: 'tool failed' }], true);
    vi.mocked(connectMcpClient).mockResolvedValue(mock);

    const { logger, events } = createCapturingLogger();
    const llm = makeMockLlmClient([
      makeToolUseMessage('mcp__dbt__list', 'tu-1', {}),
      makeToolUseMessage('emit_findings', 'tu-2', { status: 'ok', detail: 'done' }),
    ]);

    await executeSkill({ ...BASE_OPTIONS, skillName: 'test-skill', llm, auditLogger: logger });

    const mcpEvent = events.find((e) => e.type === 'mcp_call');
    expect(mcpEvent?.payload.is_error).toBe(true);
    expect(mcpEvent?.payload.tool_returned_error).toBe(false);
  });

  it('throws when allowlist references a tool the server did not expose', async () => {
    const mock = createMockMcpClient('dbt', [
      { name: 'list', description: 'list', inputSchema: {} },
    ]);
    vi.mocked(connectMcpClient).mockResolvedValue(mock);

    const llm = makeMockLlmClient([makeEndTurnMessage()]);

    await expect(
      executeSkill({
        ...BASE_OPTIONS,
        skillName: 'missing-tool',
        llm,
        mcpServers: {
          dbt: {
            config: { command: 'uvx', args: [], env: {} },
            tools: ['list', 'get_node_details_dev'],
          },
        },
      }),
    ).rejects.toThrow(/did not expose required tool 'get_node_details_dev'/);
  });
});
