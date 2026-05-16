import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command } from 'commander';

export interface ReplayOptions {
  runId: string;
  auditPath: string;
}

export interface ReplayResult {
  exitCode: number;
  lines?: string[];
  error?: string;
}

interface AuditRecord {
  schema_version?: number;
  event_id: string;
  timestamp: string;
  run_id: string;
  skill?: string;
  event_type: string;
  actor: string;
  payload: Record<string, unknown>;
}

function formatTime(iso: string): string {
  return iso.slice(11, 19); // HH:MM:SS
}

function formatRecord(r: AuditRecord): string {
  const t = formatTime(r.timestamp);
  switch (r.event_type) {
    case 'trigger':
      return `[${t}] TRIGGER   skill=${r.skill ?? '?'} actor=${r.actor}`;
    case 'claude_call': {
      const p = r.payload;
      const cost = typeof p.cost_estimate_usd === 'number' ? p.cost_estimate_usd.toFixed(4) : '?';
      const dur = typeof p.duration_ms === 'number' ? (p.duration_ms / 1000).toFixed(1) : '?';
      return `[${t}] CLAUDE    turn=${p.turn_index} in=${p.input_tokens} out=${p.output_tokens} cost=$${cost} dur=${dur}s`;
    }
    case 'mcp_call': {
      const p = r.payload;
      const dur = typeof p.duration_ms === 'number' ? (p.duration_ms / 1000).toFixed(1) : '?';
      const status = p.is_error ? ' ERROR' : '';
      return `[${t}] MCP       server=${p.server} tool=${p.tool} dur=${dur}s${status}`;
    }
    case 'skill_output_captured':
      return `[${t}] OUTPUT    turn=${r.payload.turn_index}`;
    case 'skill_complete': {
      const dur =
        typeof r.payload.duration_ms === 'number'
          ? ` dur=${(r.payload.duration_ms / 1000).toFixed(1)}s`
          : '';
      return `[${t}] COMPLETE${dur}`;
    }
    case 'error':
      return `[${t}] ERROR     ${r.payload.error_name}: ${r.payload.error_message}`;
    default:
      return `[${t}] ${r.event_type.toUpperCase().padEnd(9)}`;
  }
}

/**
 * Pure handler for `parrat replay`. Reads the audit log, filters by run_id,
 * and returns formatted lines. Returns exitCode 1 if the run_id is not found.
 */
export function replayRun(options: ReplayOptions): ReplayResult {
  let raw: string;
  try {
    raw = readFileSync(resolve(options.auditPath), 'utf8');
  } catch (e) {
    return {
      exitCode: 1,
      error: `Cannot read audit log at '${options.auditPath}': ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const records = raw
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as AuditRecord];
      } catch {
        return [];
      }
    })
    .filter((r) => r.run_id === options.runId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (records.length === 0) {
    return {
      exitCode: 1,
      error: `No events found for run_id '${options.runId}' in '${options.auditPath}'`,
    };
  }

  return { exitCode: 0, lines: records.map(formatRecord) };
}

export const replayCommand = new Command('replay')
  .description('Print a human-readable trace of a past Skill run from the audit log')
  .argument('<run_id>', 'The run ID to replay')
  .option('--audit-path <path>', 'Path to audit log file', '.parrat/audit.jsonl')
  .action(async (runId: string, opts: { auditPath: string }) => {
    const result = replayRun({ runId, auditPath: opts.auditPath });

    if (result.error) {
      console.error(result.error);
    }
    if (result.lines) {
      for (const line of result.lines) {
        console.log(line);
      }
    }
    if (result.exitCode !== 0) {
      process.exit(result.exitCode);
    }
  });
