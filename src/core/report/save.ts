import { mkdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

export interface SaveReportOptions {
  reportsDir: string;
  skillName: string;
  html: string;
}

export interface SaveReportResult {
  filePath: string;
  relativePath: string;
}

function toSlug(skillName: string, now: Date): string {
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${skillName}-${date}-${time}`;
}

export async function saveReport(options: SaveReportOptions): Promise<SaveReportResult> {
  const absDir = resolve(options.reportsDir);
  await mkdir(absDir, { recursive: true });
  const filename = `${toSlug(options.skillName, new Date())}.html`;
  const filePath = join(absDir, filename);
  await writeFile(filePath, options.html, 'utf8');
  const relativePath = relative(process.cwd(), filePath);
  return { filePath, relativePath };
}
