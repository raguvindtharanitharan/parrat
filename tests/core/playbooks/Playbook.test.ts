import { describe, expect, it } from 'vitest';
import { ZodError, z } from 'zod';
import { createNoopAuditLogger } from '../../../src/core/audit/logger.js';
import { SchemaValidationError } from '../../../src/core/errors.js';
import { type PlaybookContext, definePlaybook } from '../../../src/core/playbooks/Playbook.js';
import { DEFAULT_TENANT_ID } from '../../../src/core/types.js';

const ctx: PlaybookContext = {
  tenantId: DEFAULT_TENANT_ID,
  runId: 'test-run-id',
  auditLogger: createNoopAuditLogger(),
};

const inputSchema = z.object({ value: z.number() });
const outputSchema = z.object({ doubled: z.number() });

describe('core/playbooks/Playbook', () => {
  it('definePlaybook preserves name and schemas', () => {
    const playbook = definePlaybook({
      name: 'doubler',
      inputSchema,
      outputSchema,
      run: async (input) => ({ doubled: input.value * 2 }),
    });

    expect(playbook.name).toBe('doubler');
    expect(playbook.inputSchema).toBe(inputSchema);
    expect(playbook.outputSchema).toBe(outputSchema);
  });

  it('run() returns validated output for valid input', async () => {
    const playbook = definePlaybook({
      name: 'doubler',
      inputSchema,
      outputSchema,
      run: async (input) => ({ doubled: input.value * 2 }),
    });

    const result = await playbook.run({ value: 5 }, ctx);
    expect(result).toEqual({ doubled: 10 });
  });

  it('run() throws SchemaValidationError on invalid input shape', async () => {
    const playbook = definePlaybook({
      name: 'doubler',
      inputSchema,
      outputSchema,
      run: async (input) => ({ doubled: input.value * 2 }),
    });

    // @ts-expect-error: deliberately invalid input shape to test runtime validation
    await expect(playbook.run({ wrong: 'type' }, ctx)).rejects.toThrow(SchemaValidationError);
  });

  it('SchemaValidationError carries direction, playbookName, and ZodError as cause', async () => {
    const playbook = definePlaybook({
      name: 'doubler',
      inputSchema,
      outputSchema,
      run: async (input) => ({ doubled: input.value * 2 }),
    });

    try {
      // @ts-expect-error: deliberately invalid input shape
      await playbook.run({ wrong: 'type' }, ctx);
      expect.fail('expected playbook.run to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaValidationError);
      if (e instanceof SchemaValidationError) {
        expect(e.direction).toBe('input');
        expect(e.playbookName).toBe('doubler');
        expect(e.cause).toBeInstanceOf(ZodError);
      }
    }
  });

  it('run() throws SchemaValidationError when implementation returns invalid output', async () => {
    const playbook = definePlaybook({
      name: 'broken',
      inputSchema,
      outputSchema,
      // @ts-expect-error: deliberately bad return shape to test output validation
      run: async () => ({ wrong: 'shape' }),
    });

    await expect(playbook.run({ value: 5 }, ctx)).rejects.toThrow(SchemaValidationError);
  });
});
