import { describe, expect, it } from 'vitest';
import { ZodError, z } from 'zod';
import { createNoopAuditLogger } from '../../../src/core/audit/logger.js';
import { SchemaValidationError } from '../../../src/core/errors.js';
import { type SkillContext, defineSkill } from '../../../src/core/skills/Skill.js';
import { DEFAULT_TENANT_ID } from '../../../src/core/types.js';

const ctx: SkillContext = {
  tenantId: DEFAULT_TENANT_ID,
  runId: 'test-run-id',
  auditLogger: createNoopAuditLogger(),
};

const inputSchema = z.object({ value: z.number() });
const outputSchema = z.object({ doubled: z.number() });

describe('core/skills/Skill', () => {
  it('defineSkill preserves name and schemas', () => {
    const skill = defineSkill({
      name: 'doubler',
      inputSchema,
      outputSchema,
      run: async (input) => ({ doubled: input.value * 2 }),
    });

    expect(skill.name).toBe('doubler');
    expect(skill.inputSchema).toBe(inputSchema);
    expect(skill.outputSchema).toBe(outputSchema);
  });

  it('run() returns validated output for valid input', async () => {
    const skill = defineSkill({
      name: 'doubler',
      inputSchema,
      outputSchema,
      run: async (input) => ({ doubled: input.value * 2 }),
    });

    const result = await skill.run({ value: 5 }, ctx);
    expect(result).toEqual({ doubled: 10 });
  });

  it('run() throws SchemaValidationError on invalid input shape', async () => {
    const skill = defineSkill({
      name: 'doubler',
      inputSchema,
      outputSchema,
      run: async (input) => ({ doubled: input.value * 2 }),
    });

    // @ts-expect-error: deliberately invalid input shape to test runtime validation
    await expect(skill.run({ wrong: 'type' }, ctx)).rejects.toThrow(SchemaValidationError);
  });

  it('SchemaValidationError carries direction, skillName, and ZodError as cause', async () => {
    const skill = defineSkill({
      name: 'doubler',
      inputSchema,
      outputSchema,
      run: async (input) => ({ doubled: input.value * 2 }),
    });

    try {
      // @ts-expect-error: deliberately invalid input shape
      await skill.run({ wrong: 'type' }, ctx);
      expect.fail('expected skill.run to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaValidationError);
      if (e instanceof SchemaValidationError) {
        expect(e.direction).toBe('input');
        expect(e.skillName).toBe('doubler');
        expect(e.cause).toBeInstanceOf(ZodError);
      }
    }
  });

  it('run() throws SchemaValidationError when implementation returns invalid output', async () => {
    const skill = defineSkill({
      name: 'broken',
      inputSchema,
      outputSchema,
      // @ts-expect-error: deliberately bad return shape to test output validation
      run: async () => ({ wrong: 'shape' }),
    });

    await expect(skill.run({ value: 5 }, ctx)).rejects.toThrow(SchemaValidationError);
  });
});
