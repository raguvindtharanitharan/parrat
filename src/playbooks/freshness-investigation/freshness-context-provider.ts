import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface FreshnessContext {
  source: string;
  lastLoadedAt: string | null;
  status: 'fresh' | 'stale_warn' | 'stale_error' | 'unknown';
  thresholdBreached?: 'warn' | 'error';
}

export interface FreshnessContextProvider {
  getContext(sources?: string[]): Promise<FreshnessContext[]>;
}

interface SourcesJsonResult {
  unique_id: string;
  max_loaded_at?: string | null;
  status?: string;
}

interface SourcesJson {
  results: SourcesJsonResult[];
}

export class DbtFreshnessContextProvider implements FreshnessContextProvider {
  constructor(private readonly dbtProjectDir: string) {}

  async getContext(sources?: string[]): Promise<FreshnessContext[]> {
    const filePath = join(this.dbtProjectDir, 'target', 'sources.json');

    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }

    let parsed: SourcesJson;
    try {
      parsed = JSON.parse(raw) as SourcesJson;
    } catch (e) {
      throw new Error(`sources.json parse error: ${(e as Error).message}`);
    }

    const results = parsed.results ?? [];
    const all = results.map(mapResult);

    if (!sources || sources.length === 0) return all;

    return all.filter((ctx) =>
      sources.some((s) => ctx.source === s || ctx.source.endsWith(`.${s}`)),
    );
  }
}

function mapResult(r: SourcesJsonResult): FreshnessContext {
  const lastLoadedAt = r.max_loaded_at ?? null;

  if (r.status === 'pass') {
    return { source: r.unique_id, lastLoadedAt, status: 'fresh' };
  }
  if (r.status === 'warn') {
    return { source: r.unique_id, lastLoadedAt, status: 'stale_warn', thresholdBreached: 'warn' };
  }
  if (r.status === 'error') {
    return {
      source: r.unique_id,
      lastLoadedAt,
      status: 'stale_error',
      thresholdBreached: 'error',
    };
  }
  // dbt emits "runtime error" when it cannot evaluate freshness — typically because
  // loaded_at_field is not configured on the source. Treat as unknown, not stale.
  if (r.status === 'runtime error') {
    return { source: r.unique_id, lastLoadedAt, status: 'unknown' };
  }
  return { source: r.unique_id, lastLoadedAt, status: 'unknown' };
}
