import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AuditConfig } from '../config/types.js';
import { AuditWriteError } from '../errors.js';
import type { TenantId } from '../types.js';

/**
 * The event categories Parrat audits. Step 6 emits `trigger`, `playbook_complete`,
 * and `error` directly. `claude_call` is added in step 7 (runtime + Claude);
 * `mcp_call` lands in M1 onward as MCPs come online.
 */
export type AuditEventType =
  | 'trigger'
  | 'playbook_complete'
  | 'claude_call'
  | 'mcp_call'
  | 'playbook_output_captured'
  | 'error';

/**
 * Who initiated the event. `scheduler` for cron-triggered runs, `webhook` for
 * external alerts, `user` for CLI-invoked runs, `system` for internal events
 * (errors not tied to a specific user request).
 */
export type AuditActor = 'scheduler' | 'webhook' | 'user' | 'system';

/**
 * What the caller passes to the logger (camelCase, ergonomic). The logger
 * fills in event_id, timestamp, and redaction_applied automatically.
 *
 * `workflowId` (M1) is the cross-Playbook correlation identifier — for composite
 * Playbooks (Phase 1+) and external orchestrators (Airflow, Step Functions). If
 * omitted, the logger sets it to `runId` so single-Playbook runs default to
 * `workflow_id == run_id` per Option C v1 forward-compat.
 */
export interface AuditEventInput {
  type: AuditEventType;
  tenantId: TenantId;
  runId: string;
  workflowId?: string;
  playbook?: string;
  actor: AuditActor;
  payload: Record<string, unknown>;
}

/**
 * Payload shapes per event type. NOT enforced at write time (payload field is
 * generic Record<string, unknown>); these interfaces document the convention
 * for downstream consumers — replay (M2), observability tools, audit query.
 */
export interface TriggerPayload {
  input: unknown;
  triggerMetadata?: Record<string, unknown>;
}

export interface ClaudeCallPayload {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_estimate_usd: number;
  duration_ms: number;
  turn_index: number;
}

export interface McpCallPayload {
  server: string;
  tool: string;
  args: Record<string, unknown>;
  result: unknown;
  duration_ms: number;
  turn_index: number;
  is_error: boolean;
  tool_returned_error: boolean;
}

export interface PlaybookOutputCapturedPayload {
  output: unknown;
  turn_index: number;
}

export interface PlaybookCompletePayload {
  output: unknown;
  duration_ms?: number;
  total_turns?: number;
}

export interface ErrorPayload {
  error_name: string;
  error_message: string;
  stack?: string;
}

export interface AuditLogger {
  write(input: AuditEventInput): Promise<void>;
}

export interface CreateAuditLoggerOptions {
  filePath: string;
  auditConfig?: Pick<AuditConfig, 'hash_algorithm' | 'redact_fields'>;
}

// Fields to hash per event type: [sourceKey, replacementKey]
const HASH_FIELDS: Partial<Record<AuditEventType, [string, string][]>> = {
  mcp_call: [
    ['args', 'args_hash'],
    ['result', 'result_hash'],
  ],
  trigger: [['input', 'input_hash']],
};

function sha256hex(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function applyHashing(
  eventType: AuditEventType,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const targets = HASH_FIELDS[eventType];
  if (!targets) return payload;
  const result = { ...payload };
  for (const [src, dest] of targets) {
    if (src in result) {
      result[dest] = sha256hex(result[src]);
      delete result[src];
    }
  }
  return result;
}

function applyRedaction(
  payload: Record<string, unknown>,
  redactFields: string[],
): { payload: Record<string, unknown>; redacted: boolean } {
  if (redactFields.length === 0) return { payload, redacted: false };
  let redacted = false;
  const walk = (obj: Record<string, unknown>): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (redactFields.includes(k)) {
        out[k] = '[REDACTED]';
        redacted = true;
      } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = walk(v as Record<string, unknown>);
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  return { payload: walk(payload), redacted };
}

/**
 * Create an audit logger that appends NDJSON events to `options.filePath`.
 *
 * Each call to `write()` opens the file in append mode, writes one line, and
 * closes it. The parent directory is created lazily on first write. Write
 * failures (disk full, permissions, EISDIR) are wrapped in AuditWriteError
 * with the underlying error accessible via `.cause`.
 *
 * The on-disk record uses snake_case keys (`tenant_id`, `run_id`,
 * `event_type`, etc.) — this is THE wire format. Cloud and Enterprise audit
 * sinks (Phase 3+) will write the same record shape to S3 / BigQuery / SIEM.
 */
/**
 * No-op audit logger — useful for unit tests that don't care about audit writes,
 * and for debug paths where audit needs to be temporarily disabled.
 * Returns a logger whose write() resolves immediately and emits nothing.
 */
export function createNoopAuditLogger(): AuditLogger {
  return { write: async () => {} };
}

export function createAuditLogger(options: CreateAuditLoggerOptions): AuditLogger {
  return {
    write: async (input) => {
      const cfg = options.auditConfig;
      let payload = input.payload;
      let redactionApplied = false;

      if (cfg?.hash_algorithm) {
        payload = applyHashing(input.type, payload);
      }

      if (cfg?.redact_fields && cfg.redact_fields.length > 0) {
        const result = applyRedaction(payload, cfg.redact_fields);
        payload = result.payload;
        redactionApplied = result.redacted;
      }

      const record = {
        schema_version: 1,
        event_id: randomUUID(),
        timestamp: new Date().toISOString(),
        tenant_id: input.tenantId,
        run_id: input.runId,
        workflow_id: input.workflowId ?? input.runId,
        playbook: input.playbook,
        event_type: input.type,
        actor: input.actor,
        payload,
        redaction_applied: redactionApplied,
      };
      try {
        await mkdir(dirname(options.filePath), { recursive: true });
        await appendFile(options.filePath, `${JSON.stringify(record)}\n`, 'utf8');
      } catch (e) {
        throw new AuditWriteError(options.filePath, e);
      }
    },
  };
}
