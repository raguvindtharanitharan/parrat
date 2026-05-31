import { DuplicatePlaybookError, PlaybookNotFoundError } from '../errors.js';
import type { Playbook } from './Playbook.js';

/**
 * Read-only Playbook registry — created once at startup from the manifest in
 * src/playbooks/index.ts, consumed by the runtime to dispatch Playbooks by name.
 *
 * v1 design: static manifest. The runtime calls createRegistry(playbooks) once
 * with the full set of Playbooks it knows about; the registry is immutable after.
 *
 * Phase 1+ deferred: replace static creation with dynamic loading
 * (filesystem-based discovery, NPM-published Playbook packages, or
 * import.meta.glob-style) when third-party Playbooks become a real use case.
 * See business/plan/v1-technical-spec.md §14 for the deferred-decision record.
 */
export interface PlaybookRegistry {
  list(): string[];
  has(name: string): boolean;
  lookup(name: string): Playbook;
}

export function createRegistry(playbooks: readonly Playbook[]): PlaybookRegistry {
  const byName = new Map<string, Playbook>();
  for (const playbook of playbooks) {
    if (byName.has(playbook.name)) {
      throw new DuplicatePlaybookError(playbook.name);
    }
    byName.set(playbook.name, playbook);
  }

  return {
    list: () => Array.from(byName.keys()).sort(),
    has: (name) => byName.has(name),
    lookup: (name) => {
      const playbook = byName.get(name);
      if (!playbook) {
        throw new PlaybookNotFoundError(name, Array.from(byName.keys()).sort());
      }
      return playbook;
    },
  };
}
