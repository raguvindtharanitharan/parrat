import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { isDuplicateRun } from '../core/audit/idempotency.js';
import { createAuditLogger } from '../core/audit/logger.js';
import { sweepAuditLog } from '../core/audit/retention.js';
import { loadConfig } from '../core/config/index.js';
import { generateHtmlReport } from '../core/report/html.js';
import { saveReport } from '../core/report/save.js';
import { createRuntime } from '../core/runtime.js';
import { loadUserSkills } from '../core/skills/loader.js';
import { createRegistry } from '../core/skills/registry.js';
import { skills } from '../skills/index.js';

export interface RunOptions {
  skillName: string;
  inputJson: string;
  auditPath: string;
  /**
   * External orchestrator's workflow run ID — set as `workflow_id` on every
   * audit event for cross-tool correlation. Sourced from `correlation_id` env
   * var by the Commander wrapper.
   */
  correlationId?: string;
  reportFormat?: 'html';
}

export interface RunResult {
  exitCode: number;
  output?: unknown;
  error?: string;
  reportPath?: string;
}

/**
 * Pure handler for `parrat run`. Returns a structured result so the Commander
 * wrapper (or tests) can render it without subprocess plumbing.
 *
 * Exit codes (locked for v1):
 *   0 — success
 *   1 — Skill execution error (SkillNotFoundError, SchemaValidationError, MaxTurnsExceededError, etc.)
 *   2 — invalid JSON input
 *   3 — approval-pending / --resume requested (reserved for Phase 1+ composite Skills)
 *   4 — internal/config error (MissingClaudeKeyError, ConfigValidationError, ConfigNotFoundError)
 */
export async function runSkill(options: RunOptions): Promise<RunResult> {
  let input: unknown;
  try {
    input = JSON.parse(options.inputJson);
  } catch (e) {
    return {
      exitCode: 2,
      error: `Invalid JSON input: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const userSkills = await loadUserSkills(process.cwd());
  const registry = createRegistry([...skills, ...userSkills]);
  const auditLogger = createAuditLogger({ filePath: resolve(options.auditPath) });
  const runtime = createRuntime({ registry, auditLogger });

  try {
    const output = await runtime.invoke({
      skill: options.skillName,
      input,
      actor: 'user',
      ...(options.correlationId ? { correlationId: options.correlationId } : {}),
    });

    let reportPath: string | undefined;
    if (options.reportFormat === 'html') {
      try {
        const html = generateHtmlReport(options.skillName, output, {
          generatedAt: new Date().toISOString(),
          skillName: options.skillName,
        });
        const saved = await saveReport({
          reportsDir: '.parrat/reports',
          skillName: options.skillName,
          html,
        });
        reportPath = saved.relativePath;
      } catch {
        // Report save failure is non-fatal — skill output still returned
      }
    }

    return { exitCode: 0, output, ...(reportPath ? { reportPath } : {}) };
  } catch (e) {
    const errorName = e instanceof Error ? e.name : 'UnknownError';
    const message = e instanceof Error ? `${e.name}: ${e.message}` : String(e);

    // Internal/config errors → exit code 4
    if (
      errorName === 'MissingClaudeKeyError' ||
      errorName === 'ConfigValidationError' ||
      errorName === 'ConfigNotFoundError' ||
      errorName === 'InvalidUserSkillError'
    ) {
      return { exitCode: 4, error: message };
    }
    return { exitCode: 1, error: message };
  }
}

export const runCommand = new Command('run')
  .description('Run a Skill with the given input')
  .argument('<skill>', 'Name of the Skill to run (e.g. hello-world)')
  .argument('[input]', 'JSON input string for the Skill', '{}')
  .option('--audit-path <path>', 'Path to audit log file', '.parrat/audit.jsonl')
  .option(
    '--input-file <path>',
    'Read Skill input from JSON file (alternative to positional argument)',
  )
  .option('--resume <workflow_id>', 'Resume a paused workflow (Phase 1+ feature; v1 stub)')
  .option('--report <format>', 'Save investigation report to .parrat/reports/ (supported: html)')
  .action(
    async (
      skillName: string,
      positionalInputJson: string,
      opts: { auditPath: string; resume?: string; inputFile?: string; report?: string },
    ) => {
      if (opts.report && opts.report !== 'html') {
        console.error(`Unknown --report format '${opts.report}'. Supported: html`);
        process.exit(2);
      }

      // --resume is reserved for Phase 1+ composite Skills (paused on approval).
      // v1 errors clearly with exit code 3 so external callers know this is a
      // "approval-pending / not-yet-implemented" signal, not a generic failure.
      if (opts.resume) {
        console.error(
          'parrat run --resume is reserved for Phase 1+ composite Skills. v1 has no resumable workflows.',
        );
        process.exit(3);
      }

      let inputJson = positionalInputJson;
      if (opts.inputFile) {
        if (positionalInputJson !== '{}') {
          console.error('Cannot pass both a positional JSON argument and --input-file. Pick one.');
          process.exit(2);
        }
        try {
          inputJson = readFileSync(opts.inputFile, 'utf8');
        } catch (e) {
          console.error(
            `Failed to read --input-file '${opts.inputFile}': ${e instanceof Error ? e.message : String(e)}`,
          );
          process.exit(2);
        }
      }

      // Read correlation_id from env (both casings supported; orchestrators vary).
      const correlationId = process.env.correlation_id ?? process.env.CORRELATION_ID;

      const config = await loadConfig().catch(() => null);
      if (config) {
        sweepAuditLog(opts.auditPath, config.audit.retention_days).catch(() => {});
      }
      if (correlationId && config) {
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

      const result = await runSkill({
        skillName,
        inputJson,
        auditPath: opts.auditPath,
        ...(correlationId ? { correlationId } : {}),
        ...(opts.report === 'html' ? { reportFormat: 'html' as const } : {}),
      });

      if (result.error) {
        console.error(result.error);
      }
      if (result.output !== undefined) {
        console.log(JSON.stringify(result.output, null, 2));
      }
      if (result.reportPath) {
        process.stderr.write(`Report saved to ${result.reportPath}\n`);
      }
      if (result.exitCode !== 0) {
        process.exit(result.exitCode);
      }
    },
  );
