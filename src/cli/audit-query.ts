import { readFileSync } from 'node:fs';
import { Command } from 'commander';

export interface AuditQueryOptions {
  auditPath: string;
  runId?: string;
  eventType?: string;
  since?: string;
  limit?: number;
  json?: boolean;
}

export interface AuditQueryResult {
  exitCode: number;
  lines?: string[];
  error?: string;
}

function formatRecord(record: Record<string, unknown>): string {
  const ts = typeof record.timestamp === 'string' ? record.timestamp : '?';
  const type = typeof record.event_type === 'string' ? record.event_type : '?';
  const runId = typeof record.run_id === 'string' ? record.run_id.slice(0, 8) : '?';
  const skill = typeof record.skill === 'string' ? `  skill=${record.skill}` : '';

  let detail = '';
  const payload = record.payload;
  if (type === 'mcp_call' && typeof payload === 'object' && payload !== null) {
    const p = payload as Record<string, unknown>;
    const tool = typeof p.tool === 'string' ? p.tool : '';
    const server = typeof p.server === 'string' ? p.server : '';
    const ms = typeof p.duration_ms === 'number' ? ` (${p.duration_ms}ms)` : '';
    detail = `  ${server}.${tool}${ms}`;
  } else if (type === 'claude_call' && typeof payload === 'object' && payload !== null) {
    const p = payload as Record<string, unknown>;
    const tokens = typeof p.output_tokens === 'number' ? ` ${p.output_tokens} tokens` : '';
    const cost =
      typeof p.cost_estimate_usd === 'number' ? ` $${p.cost_estimate_usd.toFixed(4)}` : '';
    detail = `${tokens}${cost}`;
  } else if (type === 'error' && typeof payload === 'object' && payload !== null) {
    const p = payload as Record<string, unknown>;
    detail = `  ${typeof p.error_message === 'string' ? p.error_message : ''}`;
  }

  return `[${ts}] ${type.padEnd(22)} run=${runId}${skill}${detail}`;
}

export async function queryAuditLog(options: AuditQueryOptions): Promise<AuditQueryResult> {
  let raw: string;
  try {
    raw = readFileSync(options.auditPath, 'utf8');
  } catch {
    return { exitCode: 1, error: `Audit log not found: ${options.auditPath}` };
  }

  const sinceMs = options.since ? Date.parse(options.since) : undefined;
  if (options.since && sinceMs !== undefined && Number.isNaN(sinceMs)) {
    return { exitCode: 1, error: `Invalid --since value: ${options.since}` };
  }

  const records: Record<string, unknown>[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as Record<string, unknown>);
    } catch {}
  }

  let filtered = records.filter((r) => {
    if (options.runId && r.run_id !== options.runId) return false;
    if (options.eventType && r.event_type !== options.eventType) return false;
    if (sinceMs !== undefined && typeof r.timestamp === 'string') {
      if (Date.parse(r.timestamp) < sinceMs) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const ta = typeof a.timestamp === 'string' ? a.timestamp : '';
    const tb = typeof b.timestamp === 'string' ? b.timestamp : '';
    return ta.localeCompare(tb);
  });

  if (options.limit !== undefined && options.limit > 0) {
    filtered = filtered.slice(0, options.limit);
  }

  if (filtered.length === 0) {
    return { exitCode: 1, lines: [], error: 'No matching events found.' };
  }

  const lines = options.json ? filtered.map((r) => JSON.stringify(r)) : filtered.map(formatRecord);

  return { exitCode: 0, lines };
}

export const auditCommand = new Command('audit').description('Audit log tools');

auditCommand.addCommand(
  new Command('query')
    .description('Query the audit log')
    .option('--audit-path <path>', 'Path to audit log file', '.parrat/audit.jsonl')
    .option('--run-id <id>', 'Filter by run ID')
    .option('--event-type <type>', 'Filter by event type (trigger, mcp_call, claude_call, ...)')
    .option('--since <iso>', 'Only show events after this ISO 8601 timestamp')
    .option('--limit <n>', 'Maximum number of events to show', (v) => Number.parseInt(v, 10))
    .option('--json', 'Output raw NDJSON instead of human-readable format')
    .action(
      async (opts: {
        auditPath: string;
        runId?: string;
        eventType?: string;
        since?: string;
        limit?: number;
        json?: boolean;
      }) => {
        const result = await queryAuditLog({
          auditPath: opts.auditPath,
          ...(opts.runId ? { runId: opts.runId } : {}),
          ...(opts.eventType ? { eventType: opts.eventType } : {}),
          ...(opts.since ? { since: opts.since } : {}),
          ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
          ...(opts.json ? { json: opts.json } : {}),
        });

        if (result.lines) {
          for (const line of result.lines) {
            console.log(line);
          }
        }
        if (result.error && result.lines?.length === 0) {
          console.error(result.error);
        }
        if (result.exitCode !== 0) process.exit(result.exitCode);
      },
    ),
);
