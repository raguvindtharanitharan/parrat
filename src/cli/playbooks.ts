import { Command } from 'commander';
import { loadUserPlaybooks } from '../core/playbooks/loader.js';
import { createRegistry } from '../core/playbooks/registry.js';
import { playbooks } from '../playbooks/index.js';

/**
 * Returns the list of installed Playbook names (built-in + user), sorted alphabetically.
 */
export async function listPlaybookNames(cwd: string = process.cwd()): Promise<string[]> {
  const userPlaybooks = await loadUserPlaybooks(cwd);
  return createRegistry([...playbooks, ...userPlaybooks]).list();
}

const listCommand = new Command('list')
  .description('List all installed Playbooks')
  .action(async () => {
    const names = await listPlaybookNames();
    if (names.length === 0) {
      console.log('No Playbooks installed.');
      return;
    }
    for (const name of names) {
      console.log(name);
    }
  });

export const playbooksCommand = new Command('playbooks')
  .description('Manage Parrat Playbooks')
  .addCommand(listCommand);
