<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/parrat-logo-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/parrat-logo-light.png">
    <img src="assets/parrat-logo-light.png" width="80" alt="Parrat" />
  </picture><br />
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/parrat-name-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="assets/parrat-name-light.png">
    <img src="assets/parrat-name-light.png" width="160" alt="Parrat" />
  </picture>
</p>

<p align="center">AI-powered root cause analysis for data incidents.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/parrat"><img src="https://img.shields.io/npm/v/parrat" alt="npm version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="Apache 2.0" /></a>
</p>

---

Smart engineers shouldn't spend their evenings chasing breakage across vendor walls. Parrat puts the toil where it belongs: on the agent, not the human.

Parrat is an open-source CLI that uses Claude to investigate data incidents. Point it at your data stack, describe the problem, and get a root cause in under 90 seconds — with a full audit trail.

**Validated across 11 live investigations with 100% correct root causes at an average cost of $0.07 per investigation.**

## How it works

Parrat runs **Skills** — pre-codified investigation playbooks that reason across your stack using a deliberately thin set of tools. Each Skill gives Claude access to only the tools it needs for that specific investigation, producing predictable, auditable reasoning paths.

Every run writes to an append-only audit log. Every run is replayable.

```
parrat run freshness-investigation
parrat run metric-drop-rca
parrat run lineage-analysis
```

## Skills

| Skill | What it investigates |
|---|---|
| `freshness-investigation` | Why is this source stale? Which downstream models are at risk? |
| `metric-drop-rca` | Why did this metric drop? Which upstream model caused it? |
| `lineage-analysis` | What does this model depend on, and what depends on it? |

## Prerequisites

- Node.js 20+
- [dbt-mcp](https://github.com/dbt-labs/dbt-mcp) running and accessible
- `ANTHROPIC_API_KEY` (set in environment or `.env` file)

## Install

```bash
npm install -g parrat
```

## Configure

Create a `parrat.config.yaml` in your project root:

```yaml
mcp:
  command: uvx
  args: ["dbt-mcp"]

skills:
  freshness-investigation:
    enabled: true
  metric-drop-rca:
    enabled: true
  lineage-analysis:
    enabled: true
```

See [`examples/snowflake/`](examples/snowflake/) for a complete configuration example.

## Verify your setup

```bash
parrat doctor
```

This checks Node version, API key, config file, and dbt-mcp connectivity before you run your first investigation.

## Run an investigation

```bash
parrat run freshness-investigation
```

Parrat reads your data stack, reasons about what broke, and returns a structured root cause with confidence rating. The full reasoning chain is logged to `.parrat/audit.jsonl`.

## Replay any investigation

```bash
parrat replay <run_id>
```

Every investigation is replayable — every tool call, every Claude turn, input tokens, output tokens, cost, and duration.

## Examples

- [`examples/snowflake/`](examples/snowflake/) — configuration for Snowflake + dbt
- [`examples/custom-skill/`](examples/custom-skill/) — write your own investigation Skill in TypeScript

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

Built by [Raguvind Tharanitharan](https://raguvind.com).
