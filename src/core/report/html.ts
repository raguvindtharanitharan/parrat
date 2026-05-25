export interface ReportMeta {
  generatedAt: string;
  skillName: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return iso;
  }
}

const STATUS_COLORS: Record<string, string> = {
  fresh: '#059669',
  stale_warn: '#D97706',
  stale_error: '#DC2626',
  no_freshness_config: '#6B7280',
  unknown: '#6B7280',
  data_missing: '#D97706',
  volume_drop: '#D97706',
  upstream_model_issue: '#DC2626',
  pipeline_failure: '#DC2626',
  schema_change: '#D97706',
};

function statusColor(s: string): string {
  return STATUS_COLORS[s] ?? '#6B7280';
}

function confidenceColor(c: string): string {
  if (c === 'high') return '#059669';
  if (c === 'medium') return '#D97706';
  if (c === 'low') return '#DC2626';
  return '#6B7280';
}

function pill(label: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 12px;border-radius:99px;background:${color}1a;color:${color};font-size:0.8rem;font-weight:600;letter-spacing:0.03em;text-transform:uppercase;">${esc(label)}</span>`;
}

function card(title: string, body: string): string {
  return `
    <div style="background:#fff;border:1px solid #E1E5F0;border-radius:8px;padding:20px 24px;margin-bottom:16px;">
      <div style="font-size:0.72rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6366F1;margin-bottom:8px;">${esc(title)}</div>
      ${body}
    </div>`;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' ? v : undefined;
}

function asArray(v: unknown): unknown[] | undefined {
  return Array.isArray(v) && v.length > 0 ? v : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

// ── section renderers ─────────────────────────────────────────────────────────

function renderEvidence(evidence: unknown[]): string {
  const rows = evidence
    .map((item, i) => {
      const e = asRecord(item) ?? {};
      const tool = asString(e.tool) ?? '—';
      const finding = asString(e.finding) ?? '—';
      return `
        <div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid #F0F2F9;">
          <div style="flex-shrink:0;width:24px;height:24px;border-radius:50%;background:#EEF2FF;color:#6366F1;font-size:0.75rem;font-weight:700;display:flex;align-items:center;justify-content:center;">${i + 1}</div>
          <div>
            <div style="font-size:0.8rem;font-weight:600;color:#374151;font-family:monospace;">${esc(tool)}</div>
            <div style="font-size:0.87rem;color:#374151;margin-top:2px;">${esc(finding)}</div>
          </div>
        </div>`;
    })
    .join('');
  return card('Evidence chain', `<div style="margin-top:4px;">${rows}</div>`);
}

function renderStaleSources(sources: unknown[]): string {
  const rows = sources
    .map((item) => {
      const s = asRecord(item) ?? {};
      const source = asString(s.source) ?? '—';
      const lastLoaded = asString(s.last_loaded_at) ?? '—';
      const threshold = asString(s.threshold_breached);
      const summary = asString(s.summary) ?? '';
      const color = threshold === 'error' ? '#DC2626' : threshold === 'warn' ? '#D97706' : '#6B7280';
      return `
        <tr>
          <td style="font-family:monospace;font-size:0.83rem;">${esc(source)}</td>
          <td style="font-size:0.83rem;color:#374151;">${esc(lastLoaded)}</td>
          <td><span style="color:${color};font-weight:600;font-size:0.8rem;text-transform:uppercase;">${threshold ? esc(threshold) : '—'}</span></td>
          <td style="font-size:0.83rem;color:#374151;">${esc(summary)}</td>
        </tr>`;
    })
    .join('');
  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
      <thead>
        <tr style="background:#F4F6FC;">
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;border-bottom:1px solid #E1E5F0;">Source</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;border-bottom:1px solid #E1E5F0;">Last loaded</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;border-bottom:1px solid #E1E5F0;">Threshold</th>
          <th style="padding:8px 12px;text-align:left;font-weight:600;color:#374151;border-bottom:1px solid #E1E5F0;">Summary</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  return card('Stale sources', tableHtml);
}

function renderDownstreamImpact(impact: Record<string, unknown>): string {
  const models = asArray(impact.models) ?? [];
  const severity = asString(impact.severity);
  const sevColor = severity === 'high' ? '#DC2626' : severity === 'medium' ? '#D97706' : '#059669';
  const modelList =
    models.length > 0
      ? `<ul style="margin:8px 0 0 0;padding-left:20px;">${models.map((m) => `<li style="font-family:monospace;font-size:0.83rem;color:#374151;">${esc(String(m))}</li>`).join('')}</ul>`
      : '';
  const body = `
    ${severity ? `<div style="margin-bottom:8px;">${pill(severity + ' severity', sevColor)}</div>` : ''}
    <div style="font-size:0.87rem;color:#374151;">${models.length} downstream model${models.length !== 1 ? 's' : ''} affected</div>
    ${modelList}`;
  return card('Downstream impact', body);
}

// ── main export ───────────────────────────────────────────────────────────────

export function generateHtmlReport(skillName: string, output: unknown, meta: ReportMeta): string {
  const out = asRecord(output) ?? {};

  const status = asString(out.status);
  const confidence = asString(out.confidence);
  const rootCause =
    asString(out.root_cause_summary) ?? asString(out.root_cause) ?? asString(out.impact_summary);
  const recommendedAction = out.recommended_action !== null ? asString(out.recommended_action) : undefined;
  const staleSources = asArray(out.stale_sources);
  const downstreamImpact = asRecord(out.downstream_impact);
  const evidence = asArray(out.evidence);
  const metricName = asString(out.metric_name);
  const dropPercent = asNumber(out.drop_percent);
  const nodeId = asString(out.node_id);
  const impactCount = asNumber(out.impact_count);

  // Status-row badges
  const statusBadge = status
    ? `<div style="margin-right:8px;">${pill(status.replace(/_/g, ' '), statusColor(status))}</div>`
    : '';
  const confidenceBadge = confidence
    ? `<div>${pill(confidence + ' confidence', confidenceColor(confidence))}</div>`
    : '';

  // Context line for skill-specific summary identifiers
  let contextLine = '';
  if (metricName !== undefined) {
    const pct = dropPercent !== undefined ? ` · drop ${dropPercent.toFixed(1)}%` : '';
    contextLine = `<div style="font-size:0.85rem;color:#6B7280;margin-bottom:16px;">Metric: <span style="font-family:monospace;">${esc(metricName)}</span>${esc(pct)}</div>`;
  } else if (nodeId !== undefined) {
    const cnt = impactCount !== undefined ? ` · ${impactCount} nodes affected` : '';
    contextLine = `<div style="font-size:0.85rem;color:#6B7280;margin-bottom:16px;">Node: <span style="font-family:monospace;">${esc(nodeId)}</span>${esc(cnt)}</div>`;
  }

  const rootCauseSection = rootCause
    ? card('Root cause', `<p style="margin:0;font-size:0.95rem;color:#111827;line-height:1.6;">${esc(rootCause)}</p>`)
    : '';

  const recommendedActionSection = recommendedAction
    ? card(
        'Recommended action',
        `<div style="display:flex;gap:12px;align-items:flex-start;">
          <span style="font-size:1.1rem;">→</span>
          <p style="margin:0;font-size:0.93rem;color:#111827;line-height:1.6;">${esc(recommendedAction)}</p>
        </div>`,
      )
    : '';

  const staleSourcesSection = staleSources ? renderStaleSources(staleSources) : '';
  const downstreamSection = downstreamImpact ? renderDownstreamImpact(downstreamImpact) : '';
  const evidenceSection = evidence ? renderEvidence(evidence) : '';

  const rawJson = JSON.stringify(output, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Parrat — ${esc(skillName)} — ${esc(meta.generatedAt.slice(0, 10))}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #F0F2F9; color: #111827; }
    .container { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }
    header { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; flex-wrap: wrap; }
    .brand { font-weight: 700; font-size: 1.1rem; color: #6366F1; letter-spacing: -0.01em; }
    .skill-chip { background: #EEF2FF; color: #4338CA; font-size: 0.8rem; font-weight: 600; padding: 3px 10px; border-radius: 99px; font-family: monospace; }
    .ts { font-size: 0.8rem; color: #9CA3AF; margin-left: auto; }
    .status-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
    details.raw { background: #fff; border: 1px solid #E1E5F0; border-radius: 8px; margin-top: 24px; }
    details.raw summary { padding: 14px 20px; font-size: 0.85rem; font-weight: 600; color: #374151; cursor: pointer; user-select: none; }
    details.raw pre { margin: 0; padding: 16px 20px; font-size: 0.8rem; color: #374151; overflow-x: auto; border-top: 1px solid #E1E5F0; background: #F4F6FC; border-radius: 0 0 8px 8px; white-space: pre-wrap; word-break: break-all; }
    footer { margin-top: 40px; font-size: 0.78rem; color: #9CA3AF; text-align: center; }
    footer a { color: #6366F1; text-decoration: none; }
    tr:not(:last-child) td { border-bottom: 1px solid #F0F2F9; }
    td { padding: 9px 12px; vertical-align: top; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <span class="brand">Parrat</span>
      <span class="skill-chip">${esc(skillName)}</span>
      <span class="ts">${esc(formatTs(meta.generatedAt))}</span>
    </header>

    <div class="status-row">
      ${statusBadge}${confidenceBadge}
    </div>

    ${contextLine}
    ${rootCauseSection}
    ${recommendedActionSection}
    ${staleSourcesSection}
    ${downstreamSection}
    ${evidenceSection}

    <details class="raw">
      <summary>Raw JSON output</summary>
      <pre>${esc(rawJson)}</pre>
    </details>

    <footer>Generated by <a href="https://parrat.dev">Parrat</a></footer>
  </div>
</body>
</html>`;
}
