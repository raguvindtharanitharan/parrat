import type { Config } from './config/types.js';

export interface TelemetryEvent {
  event: string;
  properties?: Record<string, unknown>;
}

// Always false in v1. Phase 1 reads config.telemetry.enabled when the
// telemetry config section and backend endpoint are added.
export function isTelemetryEnabled(_config: Config): boolean {
  return false;
}

// No-op in v1. Phase 1 POSTs to the Parrat telemetry endpoint.
export async function track(_event: TelemetryEvent): Promise<void> {}
