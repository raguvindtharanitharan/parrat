import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { Command } from 'commander';
import { loadConfig } from '../core/config/index.js';
import type { Config } from '../core/config/types.js';
import type { FreshnessInvestigationInput } from '../playbooks/freshness-investigation/input-schema.js';
import { runPlaybook } from './run.js';

export interface WebhookOptions {
  config: Config;
  auditPath: string;
  port: number;
  secret?: string;
}

export interface WebhookServer {
  port: number;
  close(): void;
}

/**
 * Maps a Monte Carlo freshness alert payload to a FreshnessInvestigationInput.
 * Returns null if the payload is not a recognised Monte Carlo freshness alert.
 */
export function mapMonteCarloPayload(
  body: unknown,
): { playbook: string; input: FreshnessInvestigationInput } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (b.alert_type !== 'freshness') return null;

  const sourceRaw = b.table ?? b.source_name;
  const input: FreshnessInvestigationInput = {
    threshold: 'error',
    ...(typeof sourceRaw === 'string' && sourceRaw.length > 0 ? { source: sourceRaw } : {}),
  };

  return { playbook: 'freshness-investigation', input };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

export function startWebhook(options: WebhookOptions): Promise<WebhookServer> {
  const { config, auditPath, port, secret } = options;

  const server: Server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/trigger') {
      send(res, 404, { error: 'Not found. Only POST /trigger is supported.' });
      return;
    }

    if (secret) {
      const header = req.headers['x-parrat-secret'];
      if (header !== secret) {
        send(res, 401, { error: 'Unauthorized. X-Parrat-Secret header missing or incorrect.' });
        return;
      }
    }

    let body: unknown;
    try {
      const raw = await readBody(req);
      body = JSON.parse(raw);
    } catch {
      send(res, 400, { error: 'Invalid JSON body.' });
      return;
    }

    const mapped = mapMonteCarloPayload(body);
    if (!mapped) {
      send(res, 400, {
        error: 'Unrecognised payload format. Expected a Monte Carlo freshness alert.',
      });
      return;
    }

    const notifyConfig = config.notify;
    const slackWebhookUrl = notifyConfig?.slack?.webhook_url;

    const result = await runPlaybook({
      playbookName: mapped.playbook,
      inputJson: JSON.stringify(mapped.input),
      auditPath,
      ...(slackWebhookUrl ? {} : {}),
    });

    if (result.exitCode === 0) {
      send(res, 200, { ok: true, output: result.output });
    } else {
      send(res, 500, { error: result.error ?? 'Playbook execution failed.' });
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => {
      const addr = server.address() as { port: number };
      console.log(`parrat webhook listening on port ${addr.port}`);
      resolve({
        port: addr.port,
        close() {
          server.close();
        },
      });
    });
  });
}

export const webhookCommand = new Command('webhook')
  .description('Start an HTTP listener that accepts external alert triggers (e.g. Monte Carlo)')
  .option('--port <number>', 'Port to listen on (overrides config)', (v) => Number.parseInt(v, 10))
  .option('--audit-path <path>', 'Path to audit log file', '.parrat/audit.jsonl')
  .action(async (opts: { port?: number; auditPath: string }) => {
    const config = await loadConfig();
    const port = opts.port ?? config.webhook?.port ?? 8080;
    const secret = config.webhook?.secret;

    const webhook = await startWebhook({
      config,
      auditPath: opts.auditPath,
      port,
      ...(secret ? { secret } : {}),
    });

    process.on('SIGINT', () => {
      webhook.close();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      webhook.close();
      process.exit(0);
    });
  });
