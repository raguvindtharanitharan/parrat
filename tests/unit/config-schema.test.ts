import { describe, expect, it } from 'vitest';
import { configSchema, webhookConfigSchema } from '../../src/core/config/schema.js';

describe('core/config/schema', () => {
  it('accepts a minimal valid config', () => {
    const result = configSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tenant_id).toBe('default');
      expect(result.data.claude.model).toBe('claude-sonnet-4-6');
      expect(result.data.claude.max_turns).toBe(6);
      expect(result.data.audit.log_path).toBe('.parrat/audit.jsonl');
    }
  });

  it('rejects missing version field', () => {
    const result = configSchema.safeParse({ tenant_id: 'acme' });
    expect(result.success).toBe(false);
  });

  it('rejects wrong version literal', () => {
    const result = configSchema.safeParse({ version: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects empty mcpServers.*.command', () => {
    const result = configSchema.safeParse({
      version: 1,
      mcpServers: { dbt: { command: '' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative claude.max_turns', () => {
    const result = configSchema.safeParse({
      version: 1,
      claude: { max_turns: -1 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects zero claude.max_turns', () => {
    const result = configSchema.safeParse({
      version: 1,
      claude: { max_turns: 0 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects claude.temperature outside [0,1]', () => {
    const result = configSchema.safeParse({
      version: 1,
      claude: { temperature: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a complete mcpServers entry', () => {
    const result = configSchema.safeParse({
      version: 1,
      mcpServers: {
        dbt: {
          command: 'uvx',
          args: ['dbt-mcp'],
          env: { DBT_PROJECT_DIR: '/tmp/project' },
          tools: ['list', 'get_node_details_dev'],
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown top-level fields (.strict() in effect)', () => {
    const result = configSchema.safeParse({
      version: 1,
      unknown_field: 'oops',
    });
    expect(result.success).toBe(false);
  });

  it('applies retention_days default when audit block is empty object', () => {
    const result = configSchema.safeParse({ version: 1, audit: {} });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.audit.retention_days).toBe(90);
    }
  });

  it('accepts a valid watch section', () => {
    const result = configSchema.safeParse({
      version: 1,
      watch: { skill: 'freshness-investigation', input: { source: 'tpch.orders' } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.watch?.skill).toBe('freshness-investigation');
    }
  });

  it('defaults watch.input to {} when omitted', () => {
    const result = configSchema.safeParse({
      version: 1,
      watch: { skill: 'freshness-investigation' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.watch?.input).toEqual({});
    }
  });

  it('rejects watch.skill as empty string', () => {
    const result = configSchema.safeParse({
      version: 1,
      watch: { skill: '' },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid notify.slack section', () => {
    const result = configSchema.safeParse({
      version: 1,
      notify: { slack: { webhook_url: 'https://hooks.slack.com/services/test' } },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notify?.slack?.webhook_url).toBe('https://hooks.slack.com/services/test');
    }
  });

  it('rejects notify.slack.webhook_url that is not a URL', () => {
    const result = configSchema.safeParse({
      version: 1,
      notify: { slack: { webhook_url: 'not-a-url' } },
    });
    expect(result.success).toBe(false);
  });

  it('accepts config with no watch or notify (both optional)', () => {
    const result = configSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.watch).toBeUndefined();
      expect(result.data.notify).toBeUndefined();
    }
  });

  it('audit.idempotency_window_hours defaults to 24', () => {
    const result = configSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.audit.idempotency_window_hours).toBe(24);
    }
  });

  it('accepts a valid webhook config with port and secret', () => {
    const result = webhookConfigSchema.safeParse({ port: 9090, secret: 'abc123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.port).toBe(9090);
      expect(result.data.secret).toBe('abc123');
    }
  });

  it('webhook secret is optional — omitting it is valid', () => {
    const result = webhookConfigSchema.safeParse({ port: 8080 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.secret).toBeUndefined();
    }
  });

  it('webhook section is optional in root config', () => {
    const result = configSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.webhook).toBeUndefined();
    }
  });
});
