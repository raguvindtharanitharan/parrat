import 'dotenv/config';
import { Command } from 'commander';
import { auditCommand } from './cli/audit-query.js';
import { doctorCommand } from './cli/doctor.js';
import { initCommand } from './cli/init.js';
import { replayCommand } from './cli/replay.js';
import { runCommand } from './cli/run.js';
import { skillsCommand } from './cli/skills.js';
import { watchCommand } from './cli/watch.js';
import { webhookCommand } from './cli/webhook.js';

declare const __PARRAT_VERSION__: string;

const program = new Command()
  .name('parrat')
  .description('Claude-native cross-stack agent for data ops')
  .version(__PARRAT_VERSION__);

program.addCommand(doctorCommand);
program.addCommand(initCommand);
program.addCommand(runCommand);
program.addCommand(skillsCommand);
program.addCommand(replayCommand);
program.addCommand(watchCommand);
program.addCommand(auditCommand);
program.addCommand(webhookCommand);

await program.parseAsync(process.argv);
