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

function shouldNotifySlack(output: unknown, exitCode: number): boolean {
  if (exitCode !== 0) return true;
  const out = typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : {};
  const status = typeof out.status === 'string' ? out.status : '';
  return status === 'stale_warn' || status === 'stale_error';
}

function formatSlackMessage(
  skillName: string,
  output: unknown,
  error: string | undefined,
  reportPath: string | undefined,
): string {
  if (error) {
    return `[parrat watch] ${skillName} | FAILED\n${error}`;
  }
  const out = typeof output === 'object' && output !== null ? (output as Record<string, unknown>) : {};
  const status = typeof out.status === 'string' ? out.status.replace(/_/g, ' ').toUpperCase() : 'UNKNOWN';
  const confidence = typeof out.confidence === 'string' ? out.confidence : '';
  const rootCause =
    typeof out.root_cause_summary === 'string'
      ? out.root_cause_summary
      : typeof out.root_cause === 'string'
        ? out.root_cause
        : '';

  const lines = [`[parrat watch] ${skillName} | ${status}`];
  if (confidence) lines.push(`Confidence: ${confidence}`);
  if (rootCause) lines.push(rootCause.length > 300 ? `${rootCause.slice(0, 300)}…` : rootCause);
  if (reportPath) lines.push(`Report: ${reportPath}`);
  return lines.join('\n');
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
    reportFormat: 'html',
  });

  const slackWebhookUrl = config.notify?.slack?.webhook_url;
  if (slackWebhookUrl && shouldNotifySlack(runResult.output, runResult.exitCode)) {
    const message = formatSlackMessage(skill, runResult.output, runResult.error, runResult.reportPath);
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
