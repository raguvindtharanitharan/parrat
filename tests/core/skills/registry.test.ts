import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DuplicateSkillError, SkillNotFoundError } from '../../../src/core/errors.js';
import { defineSkill } from '../../../src/core/skills/Skill.js';
import { createRegistry } from '../../../src/core/skills/registry.js';

const makeSkill = (name: string) =>
  defineSkill({
    name,
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    run: async () => ({}),
  });

describe('core/skills/registry', () => {
  it('list returns names sorted alphabetically', () => {
    const registry = createRegistry([makeSkill('zebra'), makeSkill('apple'), makeSkill('mango')]);
    expect(registry.list()).toEqual(['apple', 'mango', 'zebra']);
  });

  it('has returns true for known names, false otherwise', () => {
    const registry = createRegistry([makeSkill('foo'), makeSkill('bar')]);
    expect(registry.has('foo')).toBe(true);
    expect(registry.has('bar')).toBe(true);
    expect(registry.has('baz')).toBe(false);
  });

  it('lookup returns the matching Skill', () => {
    const skill = makeSkill('hello');
    const registry = createRegistry([skill]);
    expect(registry.lookup('hello')).toBe(skill);
  });

  it('lookup throws SkillNotFoundError with helpful message listing available', () => {
    const registry = createRegistry([makeSkill('foo'), makeSkill('bar')]);
    expect(() => registry.lookup('baz')).toThrow(SkillNotFoundError);
    expect(() => registry.lookup('baz')).toThrow(/Skill not found: 'baz'/);
    expect(() => registry.lookup('baz')).toThrow(/Available skills: bar, foo/);
  });

  it('SkillNotFoundError carries skillName and available list', () => {
    const registry = createRegistry([makeSkill('foo'), makeSkill('bar')]);
    try {
      registry.lookup('baz');
      expect.fail('expected lookup to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SkillNotFoundError);
      if (e instanceof SkillNotFoundError) {
        expect(e.skillName).toBe('baz');
        expect(e.available).toEqual(['bar', 'foo']);
      }
    }
  });

  it('lookup error says "(none)" when registry is empty', () => {
    const registry = createRegistry([]);
    expect(() => registry.lookup('anything')).toThrow(/\(none\)/);
  });

  it('createRegistry throws DuplicateSkillError on duplicate names', () => {
    expect(() => createRegistry([makeSkill('foo'), makeSkill('foo')])).toThrow(DuplicateSkillError);
    expect(() => createRegistry([makeSkill('foo'), makeSkill('foo')])).toThrow(
      /Duplicate skill name: foo/,
    );
  });
});
