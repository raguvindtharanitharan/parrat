import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DbtFreshnessContextProvider } from '../../src/playbooks/freshness-investigation/freshness-context-provider.js';
import { cleanupTempDir, makeTempDir } from '../helpers/tempDir.js';

function makeSourcesJson(results: unknown[]): string {
  return JSON.stringify({ results });
}

function makeResult(overrides: Record<string, unknown>) {
  return {
    unique_id: 'source.parrat_dogfood.tpch.orders',
    max_loaded_at: '1998-08-02T00:00:00+00:00',
    status: 'pass',
    ...overrides,
  };
}

describe('DbtFreshnessContextProvider', () => {
  let tmpDir: string;
  let targetDir: string;

  beforeEach(async () => {
    tmpDir = await makeTempDir('freshness-provider-test');
    targetDir = join(tmpDir, 'target');
    await mkdir(targetDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tmpDir);
  });

  async function writeSourcesJson(results: unknown[]) {
    await writeFile(join(targetDir, 'sources.json'), makeSourcesJson(results), 'utf8');
  }

  it('returns [] when sources.json is absent', async () => {
    const provider = new DbtFreshnessContextProvider(tmpDir);
    const result = await provider.getContext();
    expect(result).toEqual([]);
  });

  it('throws on malformed JSON', async () => {
    await writeFile(join(targetDir, 'sources.json'), '{ not valid json', 'utf8');
    const provider = new DbtFreshnessContextProvider(tmpDir);
    await expect(provider.getContext()).rejects.toThrow(/sources\.json parse error/);
  });

  it('returns [] when results array is empty', async () => {
    await writeSourcesJson([]);
    const provider = new DbtFreshnessContextProvider(tmpDir);
    expect(await provider.getContext()).toEqual([]);
  });

  it('maps status "pass" to fresh with no thresholdBreached', async () => {
    await writeSourcesJson([makeResult({ status: 'pass' })]);
    const provider = new DbtFreshnessContextProvider(tmpDir);
    const [ctx] = await provider.getContext();
    expect(ctx?.status).toBe('fresh');
    expect(ctx?.thresholdBreached).toBeUndefined();
  });

  it('maps status "warn" to stale_warn with thresholdBreached warn', async () => {
    await writeSourcesJson([makeResult({ status: 'warn' })]);
    const provider = new DbtFreshnessContextProvider(tmpDir);
    const [ctx] = await provider.getContext();
    expect(ctx?.status).toBe('stale_warn');
    expect(ctx?.thresholdBreached).toBe('warn');
  });

  it('maps status "error" to stale_error with thresholdBreached error', async () => {
    await writeSourcesJson([makeResult({ status: 'error' })]);
    const provider = new DbtFreshnessContextProvider(tmpDir);
    const [ctx] = await provider.getContext();
    expect(ctx?.status).toBe('stale_error');
    expect(ctx?.thresholdBreached).toBe('error');
  });

  it('maps unknown status to unknown', async () => {
    await writeSourcesJson([makeResult({ status: 'something_else' })]);
    const provider = new DbtFreshnessContextProvider(tmpDir);
    const [ctx] = await provider.getContext();
    expect(ctx?.status).toBe('unknown');
  });

  it('maps dbt "runtime error" status to unknown (not stale)', async () => {
    await writeSourcesJson([makeResult({ status: 'runtime error', max_loaded_at: null })]);
    const provider = new DbtFreshnessContextProvider(tmpDir);
    const [ctx] = await provider.getContext();
    expect(ctx?.status).toBe('unknown');
    expect(ctx?.thresholdBreached).toBeUndefined();
  });

  it('maps status "pass" with explicit null max_loaded_at to fresh', async () => {
    await writeSourcesJson([makeResult({ status: 'pass', max_loaded_at: null })]);
    const provider = new DbtFreshnessContextProvider(tmpDir);
    const [ctx] = await provider.getContext();
    expect(ctx?.status).toBe('fresh');
    expect(ctx?.lastLoadedAt).toBeNull();
  });

  it('sets lastLoadedAt to null when max_loaded_at is absent', async () => {
    await writeSourcesJson([makeResult({ max_loaded_at: undefined })]);
    const provider = new DbtFreshnessContextProvider(tmpDir);
    const [ctx] = await provider.getContext();
    expect(ctx?.lastLoadedAt).toBeNull();
  });

  it('returns all entries when no filter is provided', async () => {
    await writeSourcesJson([
      makeResult({ unique_id: 'source.proj.s.orders' }),
      makeResult({ unique_id: 'source.proj.s.customers' }),
    ]);
    const provider = new DbtFreshnessContextProvider(tmpDir);
    const results = await provider.getContext();
    expect(results).toHaveLength(2);
  });

  it('filters by short source name', async () => {
    await writeSourcesJson([
      makeResult({ unique_id: 'source.parrat_dogfood.tpch.orders' }),
      makeResult({ unique_id: 'source.parrat_dogfood.tpch.customers' }),
    ]);
    const provider = new DbtFreshnessContextProvider(tmpDir);
    const results = await provider.getContext(['tpch.orders']);
    expect(results).toHaveLength(1);
    expect(results.map((r) => r.source)).toEqual(['source.parrat_dogfood.tpch.orders']);
  });
});
