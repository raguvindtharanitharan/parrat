import { describe, expect, it } from 'vitest';
import { generateHtmlReport } from '../../../src/core/report/html.js';

const META = { generatedAt: '2026-05-24T14:30:00.000Z', skillName: 'freshness-investigation' };

const FRESHNESS_OUTPUT = {
  status: 'stale_error',
  confidence: 'high',
  root_cause_summary: 'The orders source has not loaded in 4 days.',
  recommended_action: 'Check the Airflow DAG load_orders_daily.',
  stale_sources: [
    {
      source: 'jaffle_shop.orders',
      last_loaded_at: '2026-05-20T09:00:00Z',
      threshold_breached: 'error',
      summary: 'Expected load every 24h; last seen 4 days ago.',
    },
  ],
  downstream_impact: {
    models: ['mart_orders', 'mart_revenue'],
    severity: 'high',
  },
  evidence: [
    { tool: 'dbt__get_sources', finding: 'orders freshness status: error' },
    { tool: 'dbt__get_models', finding: '2 downstream models depend on orders' },
  ],
};

describe('generateHtmlReport', () => {
  it('returns a non-empty string', () => {
    const html = generateHtmlReport('freshness-investigation', {}, META);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100);
  });

  it('contains skill name in title and header', () => {
    const html = generateHtmlReport('freshness-investigation', {}, META);
    expect(html).toContain('freshness-investigation');
  });

  it('contains the generated date in title', () => {
    const html = generateHtmlReport('my-skill', {}, META);
    expect(html).toContain('2026-05-24');
  });

  it('renders status badge for fresh (green)', () => {
    const html = generateHtmlReport('s', { status: 'fresh' }, META);
    expect(html).toContain('#059669');
    expect(html).toContain('fresh');
  });

  it('renders status badge for stale_warn (amber)', () => {
    const html = generateHtmlReport('s', { status: 'stale_warn' }, META);
    expect(html).toContain('#D97706');
    expect(html).toContain('stale warn');
  });

  it('renders status badge for stale_error (red)', () => {
    const html = generateHtmlReport('s', { status: 'stale_error' }, META);
    expect(html).toContain('#DC2626');
  });

  it('renders confidence badge — high green', () => {
    const html = generateHtmlReport('s', { confidence: 'high' }, META);
    expect(html).toContain('#059669');
    expect(html).toContain('high confidence');
  });

  it('renders confidence badge — medium amber', () => {
    const html = generateHtmlReport('s', { confidence: 'medium' }, META);
    expect(html).toContain('#D97706');
  });

  it('renders confidence badge — low red', () => {
    const html = generateHtmlReport('s', { confidence: 'low' }, META);
    expect(html).toContain('#DC2626');
  });

  it('renders root_cause_summary when present', () => {
    const html = generateHtmlReport('s', { root_cause_summary: 'Something broke.' }, META);
    expect(html).toContain('Something broke.');
  });

  it('falls back to root_cause when root_cause_summary absent', () => {
    const html = generateHtmlReport('s', { root_cause: 'Metric dropped 40%.' }, META);
    expect(html).toContain('Metric dropped 40%.');
  });

  it('falls back to impact_summary when other root cause fields absent', () => {
    const html = generateHtmlReport('s', { impact_summary: 'Impact is wide.' }, META);
    expect(html).toContain('Impact is wide.');
  });

  it('renders recommended_action when non-null string', () => {
    const html = generateHtmlReport('s', { recommended_action: 'Restart the pipeline.' }, META);
    expect(html).toContain('Restart the pipeline.');
  });

  it('skips recommended_action when null', () => {
    const html = generateHtmlReport('s', { recommended_action: null }, META);
    expect(html).not.toContain('Recommended action');
  });

  it('renders evidence list with tool and finding', () => {
    const html = generateHtmlReport(
      's',
      { evidence: [{ tool: 'dbt__get_sources', finding: 'status: error' }] },
      META,
    );
    expect(html).toContain('dbt__get_sources');
    expect(html).toContain('status: error');
    expect(html).toContain('Evidence chain');
  });

  it('renders stale_sources table rows', () => {
    const html = generateHtmlReport(
      's',
      {
        stale_sources: [
          {
            source: 'jaffle_shop.orders',
            last_loaded_at: '2026-05-20T09:00:00Z',
            threshold_breached: 'error',
            summary: 'Too old.',
          },
        ],
      },
      META,
    );
    expect(html).toContain('jaffle_shop.orders');
    expect(html).toContain('Too old.');
    expect(html).toContain('Stale sources');
  });

  it('renders downstream_impact models and severity', () => {
    const html = generateHtmlReport(
      's',
      { downstream_impact: { models: ['mart_orders', 'mart_revenue'], severity: 'high' } },
      META,
    );
    expect(html).toContain('mart_orders');
    expect(html).toContain('mart_revenue');
    expect(html).toContain('Downstream impact');
  });

  it('renders metric_name and drop_percent for metric-drop-rca style output', () => {
    const html = generateHtmlReport(
      'metric-drop-rca',
      { metric_name: 'revenue_total', drop_percent: 42.5 },
      META,
    );
    expect(html).toContain('revenue_total');
    expect(html).toContain('42.5');
  });

  it('renders node_id and impact_count for lineage-analysis style output', () => {
    const html = generateHtmlReport(
      'lineage-analysis',
      { node_id: 'model.jaffle_shop.orders', impact_count: 7 },
      META,
    );
    expect(html).toContain('model.jaffle_shop.orders');
    expect(html).toContain('7');
  });

  it('always renders raw JSON collapsible', () => {
    const html = generateHtmlReport('s', { foo: 'bar' }, META);
    expect(html).toContain('Raw JSON output');
    // JSON is HTML-escaped inside <pre>, so double quotes become &quot;
    expect(html).toContain('&quot;foo&quot;');
    expect(html).toContain('&quot;bar&quot;');
  });

  it('skips all optional sections when output has none of the known keys', () => {
    const html = generateHtmlReport('s', {}, META);
    expect(html).not.toContain('Evidence chain');
    expect(html).not.toContain('Stale sources');
    expect(html).not.toContain('Downstream impact');
    expect(html).not.toContain('Root cause');
    expect(html).not.toContain('Recommended action');
  });

  it('escapes HTML special chars in output strings (XSS guard)', () => {
    const html = generateHtmlReport(
      's',
      { root_cause_summary: '<script>alert("xss")</script>' },
      META,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('produces no external src= references (self-contained, no CDN)', () => {
    const html = generateHtmlReport('freshness-investigation', FRESHNESS_OUTPUT, META);
    // No external resources loaded via src= (scripts, images, stylesheets from CDNs)
    // Footer href links to parrat.dev are fine — they're links, not loaded assets.
    const externalSrc = html.match(/src="https?:\/\//g) ?? [];
    expect(externalSrc).toHaveLength(0);
  });

  it('renders a complete freshness-investigation report with all sections', () => {
    const html = generateHtmlReport('freshness-investigation', FRESHNESS_OUTPUT, META);
    expect(html).toContain('stale error');
    expect(html).toContain('high confidence');
    expect(html).toContain('The orders source has not loaded in 4 days.');
    expect(html).toContain('Check the Airflow DAG load_orders_daily.');
    expect(html).toContain('jaffle_shop.orders');
    expect(html).toContain('mart_orders');
    expect(html).toContain('dbt__get_sources');
    expect(html).toContain('Raw JSON output');
  });
});
