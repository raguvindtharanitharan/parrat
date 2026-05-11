import { Command } from 'commander';
import { createRegistry } from '../core/skills/registry.js';
import { skills } from '../skills/index.js';

/**
 * Returns the list of installed Skill names, sorted alphabetically.
 * Pure function — used by the CLI handler and unit tests alike.
 */
export function listSkillNames(): string[] {
  return createRegistry(skills).list();
}

const listCommand = new Command('list').description('List all installed Skills').action(() => {
  const names = listSkillNames();
  if (names.length === 0) {
    console.log('No Skills installed.');
    return;
  }
  for (const name of names) {
    console.log(name);
  }
});

export const skillsCommand = new Command('skills')
  .description('Manage Parrat Skills')
  .addCommand(listCommand);
