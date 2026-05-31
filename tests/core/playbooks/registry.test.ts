import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DuplicatePlaybookError, PlaybookNotFoundError } from '../../../src/core/errors.js';
import { definePlaybook } from '../../../src/core/playbooks/Playbook.js';
import { createRegistry } from '../../../src/core/playbooks/registry.js';

const makePlaybook = (name: string) =>
  definePlaybook({
    name,
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    run: async () => ({}),
  });

describe('core/playbooks/registry', () => {
  it('list returns names sorted alphabetically', () => {
    const registry = createRegistry([
      makePlaybook('zebra'),
      makePlaybook('apple'),
      makePlaybook('mango'),
    ]);
    expect(registry.list()).toEqual(['apple', 'mango', 'zebra']);
  });

  it('has returns true for known names, false otherwise', () => {
    const registry = createRegistry([makePlaybook('foo'), makePlaybook('bar')]);
    expect(registry.has('foo')).toBe(true);
    expect(registry.has('bar')).toBe(true);
    expect(registry.has('baz')).toBe(false);
  });

  it('lookup returns the matching Playbook', () => {
    const playbook = makePlaybook('hello');
    const registry = createRegistry([playbook]);
    expect(registry.lookup('hello')).toBe(playbook);
  });

  it('lookup throws PlaybookNotFoundError with helpful message listing available', () => {
    const registry = createRegistry([makePlaybook('foo'), makePlaybook('bar')]);
    expect(() => registry.lookup('baz')).toThrow(PlaybookNotFoundError);
    expect(() => registry.lookup('baz')).toThrow(/Playbook not found: 'baz'/);
    expect(() => registry.lookup('baz')).toThrow(/Available playbooks: bar, foo/);
  });

  it('PlaybookNotFoundError carries playbookName and available list', () => {
    const registry = createRegistry([makePlaybook('foo'), makePlaybook('bar')]);
    try {
      registry.lookup('baz');
      expect.fail('expected lookup to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(PlaybookNotFoundError);
      if (e instanceof PlaybookNotFoundError) {
        expect(e.playbookName).toBe('baz');
        expect(e.available).toEqual(['bar', 'foo']);
      }
    }
  });

  it('lookup error says "(none)" when registry is empty', () => {
    const registry = createRegistry([]);
    expect(() => registry.lookup('anything')).toThrow(/\(none\)/);
  });

  it('createRegistry throws DuplicatePlaybookError on duplicate names', () => {
    expect(() => createRegistry([makePlaybook('foo'), makePlaybook('foo')])).toThrow(
      DuplicatePlaybookError,
    );
    expect(() => createRegistry([makePlaybook('foo'), makePlaybook('foo')])).toThrow(
      /Duplicate playbook name: foo/,
    );
  });
});
