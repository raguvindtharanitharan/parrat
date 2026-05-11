import { DuplicateSkillError, SkillNotFoundError } from '../errors.js';
import type { Skill } from './Skill.js';

/**
 * Read-only Skill registry — created once at startup from the manifest in
 * src/skills/index.ts, consumed by the runtime to dispatch Skills by name.
 *
 * v1 design: static manifest. The runtime calls createRegistry(skills) once
 * with the full set of Skills it knows about; the registry is immutable after.
 *
 * Phase 1+ deferred: replace static creation with dynamic loading
 * (filesystem-based discovery, NPM-published Skill packages, or
 * import.meta.glob-style) when third-party Skills become a real use case.
 * See business/plan/v1-technical-spec.md §14 for the deferred-decision record.
 */
export interface SkillRegistry {
  list(): string[];
  has(name: string): boolean;
  lookup(name: string): Skill;
}

export function createRegistry(skills: readonly Skill[]): SkillRegistry {
  const byName = new Map<string, Skill>();
  for (const skill of skills) {
    if (byName.has(skill.name)) {
      throw new DuplicateSkillError(skill.name);
    }
    byName.set(skill.name, skill);
  }

  return {
    list: () => Array.from(byName.keys()).sort(),
    has: (name) => byName.has(name),
    lookup: (name) => {
      const skill = byName.get(name);
      if (!skill) {
        throw new SkillNotFoundError(name, Array.from(byName.keys()).sort());
      }
      return skill;
    },
  };
}
