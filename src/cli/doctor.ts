import { execFile } from 'node:child_process';
import { constants, access, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Command } from 'commander';
import { loadConfig } from '../core/config/index.js';

function execFileAsync(
  cmd: string,
  args: string[],
  opts: { timeout: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, opts, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}

export type DoctorStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  message: string;
}

/**
 * The dbt-mcp version Parrat is tested and pinned against.
 * Update this constant when upgrading dbt-mcp.
 */
export const PINNED_DBT_MCP_VERSION = '0.4.3';

async function checkApiKey(): Promise<DoctorCheck> {
  const key = process.env.ANTHROPIC_API_KEY;
  return key && key.length > 0
    ? { name: 'ANTHROPIC_API_KEY', status: 'ok', message: 'Present' }
    : {
        name: 'ANTHROPIC_API_KEY',
        status: 'fail',
        message: 'Missing — set ANTHROPIC_API_KEY in your environment or .env file',
      };
}

async function checkConfig(): Promise<DoctorCheck> {
  try {
    await loadConfig();
    return { name: 'Config file', status: 'ok', message: 'Loaded and valid' };
  } catch (e) {
    return {
      name: 'Config file',
      status: 'fail',
      message: `${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function checkDbtMcpVersion(): Promise<DoctorCheck> {
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig();
  } catch {
    return { name: 'dbt-mcp version', status: 'warn', message: 'Skipped — config not loadable' };
  }

  const usesDbtMcp = Object.values(config.mcpServers).some(
    (s) => s.command.includes('dbt-mcp') || s.args.some((a) => a.includes('dbt-mcp')),
  );

  if (!usesDbtMcp) {
    return { name: 'dbt-mcp version', status: 'ok', message: 'dbt-mcp not configured — skipped' };
  }

  try {
    const { stdout } = await execFileAsync('uvx', ['dbt-mcp', '--version'], { timeout: 10_000 });
    const version = stdout.trim().split(/\s+/).pop() ?? '';
    if (version === PINNED_DBT_MCP_VERSION) {
      return { name: 'dbt-mcp version', status: 'ok', message: `${version} (matches pinned)` };
    }
    return {
      name: 'dbt-mcp version',
      status: 'fail',
      message: `Found ${version || '(unknown)'}, expected ${PINNED_DBT_MCP_VERSION} — run: uvx install dbt-mcp==${PINNED_DBT_MCP_VERSION}`,
    };
  } catch (e) {
    return {
      name: 'dbt-mcp version',
      status: 'fail',
      message: `Could not run 'uvx dbt-mcp --version': ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

async function checkAuditDir(auditPath: string): Promise<DoctorCheck> {
  const dir = dirname(auditPath);
  try {
    await access(dir, constants.W_OK);
    return { name: 'Audit directory', status: 'ok', message: `${dir} is writable` };
  } catch {
    try {
      await mkdir(dir, { recursive: true });
      return { name: 'Audit directory', status: 'ok', message: `${dir} created` };
    } catch (e) {
      return {
        name: 'Audit directory',
        status: 'warn',
        message: `Could not create ${dir}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }
}

export async function runDoctor(auditPath: string): Promise<DoctorCheck[]> {
  return Promise.all([
    checkApiKey(),
    checkConfig(),
    checkDbtMcpVersion(),
    checkAuditDir(auditPath),
  ]);
}

function formatCheck(check: DoctorCheck): string {
  const icon = check.status === 'ok' ? '✓' : check.status === 'warn' ? '!' : '✗';
  return `${icon} ${check.name.padEnd(22)} ${check.status.padEnd(6)}  ${check.message}`;
}

export const doctorCommand = new Command('doctor')
  .description('Check Parrat configuration and dependencies')
  .option('--audit-path <path>', 'Path to audit log file', '.parrat/audit.jsonl')
  .action(async (opts: { auditPath: string }) => {
    const checks = await runDoctor(opts.auditPath);
    for (const check of checks) {
      console.log(formatCheck(check));
    }
    const hasFail = checks.some((c) => c.status === 'fail');
    if (hasFail) process.exit(1);
  });
