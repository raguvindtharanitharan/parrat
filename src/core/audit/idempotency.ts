import { readFileSync } from 'node:fs';

/**
 * Returns true if a trigger event with workflow_id === correlationId
 * already exists in the audit log within the past windowHours.
 * Returns false if the file does not exist or no match is found.
 */
export async function isDuplicateRun(
  auditPath: string,
  correlationId: string,
  windowHours: number,
): Promise<boolean> {
  let raw: string;
  try {
    raw = readFileSync(auditPath, 'utf8');
  } catch {
    return false;
  }

  const cutoff = Date.now() - windowHours * 3600 * 1000;

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (
      record.event_type === 'trigger' &&
      record.workflow_id === correlationId &&
      typeof record.timestamp === 'string' &&
      Date.parse(record.timestamp) >= cutoff
    ) {
      return true;
    }
  }

  return false;
}
