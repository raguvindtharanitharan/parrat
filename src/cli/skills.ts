import { Command } from 'commander';
import { loadUserSkills } from '../core/skills/loader.js';
import { createRegistry } from '../core/skills/registry.js';
import { skills } from '../skills/index.js';

/**
 * Returns the list of installed Skill names (built-in + user), sorted alphabetically.
 */
export async function listSkillNames(cwd: string = process.cwd()): Promise<string[]> {
  const userSkills = await loadUserSkills(cwd);
  return createRegistry([...skills, ...userSkills]).list();
}

const listCommand = new Command('list')
  .description('List all installed Skills')
  .action(async () => {
    const names = await listSkillNames();
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
