import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveReport } from '../../../src/core/report/save.js';
import { cleanupTempDir, makeTempDir } from '../../helpers/tempDir.js';

describe('saveReport', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir('parrat-save-report');
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    vi.useRealTimers();
  });

  it('creates reportsDir if it does not exist', async () => {
    const reportsDir = join(tempDir, 'nested', 'reports');
    await saveReport({ reportsDir, playbookName: 'my-playbook', html: '<html/>' });
    const { stat } = await import('node:fs/promises');
    const s = await stat(reportsDir);
    expect(s.isDirectory()).toBe(true);
  });

  it('written file contents match the html argument', async () => {
    const html = '<!DOCTYPE html><html><body>hello</body></html>';
    const result = await saveReport({ reportsDir: tempDir, playbookName: 'my-playbook', html });
    const contents = await readFile(result.filePath, 'utf8');
    expect(contents).toBe(html);
  });

  it('filename matches pattern <playbook>-YYYYMMDD-HHmmss.html', async () => {
    const result = await saveReport({
      reportsDir: tempDir,
      playbookName: 'freshness-investigation',
      html: '',
    });
    expect(result.filePath).toMatch(/freshness-investigation-\d{8}-\d{6}\.html$/);
  });

  it('filePath is absolute', async () => {
    const result = await saveReport({ reportsDir: tempDir, playbookName: 'my-playbook', html: '' });
    expect(isAbsolute(result.filePath)).toBe(true);
  });

  it('relativePath is relative (not absolute)', async () => {
    const result = await saveReport({ reportsDir: tempDir, playbookName: 'my-playbook', html: '' });
    expect(isAbsolute(result.relativePath)).toBe(false);
  });

  it('two sequential calls with distinct mocked times produce distinct filenames', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-24T14:30:00.000Z'));
    const r1 = await saveReport({ reportsDir: tempDir, playbookName: 'my-playbook', html: 'a' });

    vi.setSystemTime(new Date('2026-05-24T14:30:01.000Z'));
    const r2 = await saveReport({ reportsDir: tempDir, playbookName: 'my-playbook', html: 'b' });

    expect(r1.filePath).not.toBe(r2.filePath);
  });
});
