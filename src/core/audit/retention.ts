import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

/**
 * Deletes audit events older than retentionDays from the audit log.
 * Rewrites the file in-place with surviving events.
 * Returns the count of removed events. No-ops if the file does not exist.
 */
export async function sweepAuditLog(
  auditPath: string,
  retentionDays: number,
): Promise<{ removed: number }> {
  let raw: string;
  try {
    raw = readFileSync(auditPath, 'utf8');
  } catch {
    return { removed: 0 };
  }

  const cutoff = Date.now() - retentionDays * 86400 * 1000;
  const survivors: string[] = [];
  let removed = 0;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      survivors.push(trimmed);
      continue;
    }
    if (typeof record.timestamp === 'string' && Date.parse(record.timestamp) < cutoff) {
      removed++;
    } else {
      survivors.push(trimmed);
    }
  }

  if (removed > 0) {
    await writeFile(auditPath, survivors.join('\n') + (survivors.length > 0 ? '\n' : ''), 'utf8');
  }

  return { removed };
}
