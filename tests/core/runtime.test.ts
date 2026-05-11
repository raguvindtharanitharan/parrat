import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createAuditLogger } from '../../src/core/audit/logger.js';
import { SkillNotFoundError } from '../../src/core/errors.js';
import { createRuntime } from '../../src/core/runtime.js';
import { defineSkill } from '../../src/core/skills/Skill.js';
import { createRegistry } from '../../src/core/skills/registry.js';
import { DEFAULT_TENANT_ID } from '../../src/core/types.js';

describe('core/runtime', () => {
  let tempDir: string;
  let auditPath: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `parrat-runtime-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    auditPath = join(tempDir, 'audit.jsonl');
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const echoSkill = defineSkill({
    name: 'echo',
    inputSchema: z.object({ name: z.string().min(1) }),
    outputSchema: z.object({ greeting: z.string() }),
    run: async (input) => ({ greeting: `Hello, ${input.name}!` }),
  });

  const setup = () => {
    const registry = createRegistry([echoSkill]);
    const auditLogger = createAuditLogger({ filePath: auditPath });
    return createRuntime({ registry, auditLogger });
  };

  const readEvents = async () => {
    const content = await readFile(auditPath, 'utf8');
    return content
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
  };

  it('invoke runs the named skill and returns its output', async () => {
    const runtime = setup();
    const result = await runtime.invoke({
      skill: 'echo',
      input: { name: 'World' },
      actor: 'user',
    });
    expect(result).toEqual({ greeting: 'Hello, World!' });
  });

  it('emits trigger then skill_complete audit events with the same run_id', async () => {
    const runtime = setup();
    await runtime.invoke({
      skill: 'echo',
      input: { name: 'X' },
      actor: 'user',
    });

    const events = await readEvents();
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.event_type)).toEqual(['trigger', 'skill_complete']);
    expect(new Set(events.map((e) => e.run_id)).size).toBe(1);
  });

  it('audits tenant_id, skill, and actor on every event', async () => {
    const runtime = setup();
    await runtime.invoke({
      skill: 'echo',
      input: { name: 'X' },
      actor: 'webhook',
    });
    const events = await readEvents();
    for (const e of events) {
      expect(e.tenant_id).toBe(DEFAULT_TENANT_ID);
      expect(e.skill).toBe('echo');
      expect(e.actor).toBe('webhook');
    }
  });

  it('emits error audit event when skill throws, then rethrows', async () => {
    const broken = defineSkill({
      name: 'broken',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      run: async () => {
        throw new Error('intentional failure');
      },
    });
    const registry = createRegistry([broken]);
    const auditLogger = createAuditLogger({ filePath: auditPath });
    const runtime = createRuntime({ registry, auditLogger });

    await expect(runtime.invoke({ skill: 'broken', input: {}, actor: 'user' })).rejects.toThrow(
      'intentional failure',
    );

    const events = await readEvents();
    expect(events.map((e) => e.event_type)).toEqual(['trigger', 'error']);
    expect(events[1]?.payload?.error_message).toBe('intentional failure');
  });

  it('throws SkillNotFoundError without writing any audit event when skill does not exist', async () => {
    const runtime = setup();
    await expect(
      runtime.invoke({ skill: 'nonexistent', input: {}, actor: 'user' }),
    ).rejects.toThrow(SkillNotFoundError);

    // Audit file should not exist (no write happened)
    await expect(readFile(auditPath, 'utf8')).rejects.toThrow();
  });

  it('passes auditLogger to Skill via context for skill-internal events', async () => {
    const inner = defineSkill({
      name: 'inner',
      inputSchema: z.object({}),
      outputSchema: z.object({}),
      run: async (_input, ctx) => {
        await ctx.auditLogger.write({
          type: 'claude_call',
          tenantId: ctx.tenantId,
          runId: ctx.runId,
          skill: 'inner',
          actor: 'system',
          payload: { model: 'sonnet', tokens: 100 },
        });
        return {};
      },
    });
    const registry = createRegistry([inner]);
    const auditLogger = createAuditLogger({ filePath: auditPath });
    const runtime = createRuntime({ registry, auditLogger });

    await runtime.invoke({ skill: 'inner', input: {}, actor: 'user' });

    const events = await readEvents();
    expect(events.map((e) => e.event_type)).toEqual(['trigger', 'claude_call', 'skill_complete']);
  });

  it('generates unique runIds across invocations', async () => {
    const runtime = setup();
    await runtime.invoke({ skill: 'echo', input: { name: 'A' }, actor: 'user' });
    await runtime.invoke({ skill: 'echo', input: { name: 'B' }, actor: 'user' });

    const events = await readEvents();
    const runIds = new Set(events.map((e) => e.run_id));
    expect(runIds.size).toBe(2);
  });
});
