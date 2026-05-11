import { resolve } from 'node:path';
import { Command } from 'commander';
import { isDuplicateRun } from '../core/audit/idempotency.js';
import { sweepAuditLog } from '../core/audit/retention.js';
import { loadConfig } from '../core/config/loader.js';
import type { Config } from '../core/config/types.js';
import { SlackNotifier } from '../core/notify/slack.js';
import { runSkill } from './run.js';

export interface WatchOptions {
  config: Config;
  auditPath: string;
}

export interface WatchResult {
  exitCode: number;
  error?: string;
}

function formatSlackMessage(skillName: string, output: unknown, error: string | undefined): string {
  if (error) {
    return `[parrat] ${skillName} | FAILED\n${error}`;
  }
  const json = JSON.stringify(output, null, 2);
  const body = json.length > 2000 ? `${json.slice(0, 2000)}\n...(truncated)` : json;
  return `[parrat] ${skillName} | OK\n${body}`;
}

/**
 * Pure handler for `parrat watch`. Reads skill + input from config.watch,
 * runs the skill, then delivers to config.notify.slack if configured.
 * Throws are not caught here — the Commander wrapper handles process.exit.
 */
export async function watchSkill(options: WatchOptions): Promise<WatchResult> {
  const { config, auditPath } = options;

  if (!config.watch) {
    return {
      exitCode: 1,
      error:
        "No 'watch' section in config. Add watch.skill and watch.input to .parrat/config.yaml.",
    };
  }

  const { skill, input } = config.watch;

  const runResult = await runSkill({
    skillName: skill,
    inputJson: JSON.stringify(input),
    auditPath: resolve(auditPath),
  });

  const slackWebhookUrl = config.notify?.slack?.webhook_url;
  if (slackWebhookUrl) {
    const message = formatSlackMessage(skill, runResult.output, runResult.error);
    const notifier = new SlackNotifier(slackWebhookUrl);
    try {
      await notifier.send({ text: message });
    } catch (e) {
      const notifyError = e instanceof Error ? e.message : String(e);
      return {
        exitCode: 1,
        error: `Skill ${runResult.exitCode === 0 ? 'succeeded' : 'failed'} but Slack notification failed: ${notifyError}`,
      };
    }
  }

  return {
    exitCode: runResult.exitCode,
    ...(runResult.error ? { error: runResult.error } : {}),
  };
}

export const watchCommand = new Command('watch')
  .description('Run the configured watch skill once (schedule via cron / Task Scheduler)')
  .option('--audit-path <path>', 'Path to audit log file', '.parrat/audit.jsonl')
  .action(async (opts: { auditPath: string }) => {
    let config: Config;
    try {
      config = await loadConfig();
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(4);
    }

    sweepAuditLog(opts.auditPath, config.audit.retention_days).catch(() => {});

    const correlationId = process.env.correlation_id ?? process.env.CORRELATION_ID;
    if (correlationId) {
      const isDup = await isDuplicateRun(
        opts.auditPath,
        correlationId,
        config.audit.idempotency_window_hours,
      );
      if (isDup) {
        console.log(`Skipped: duplicate correlation_id ${correlationId}`);
        process.exit(0);
      }
    }

    const result = await watchSkill({ config, auditPath: opts.auditPath });

    if (result.error) {
      console.error(result.error);
    }
    if (result.exitCode !== 0) {
      process.exit(result.exitCode);
    }
  });
