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

## Quick Start

**Prerequisites:** Node.js 20+, Python, a configured dbt project (`~/.dbt/profiles.yml`), and an `ANTHROPIC_API_KEY`.

All commands below run from your dbt project root. Navigate there first:

```bash
cd your-dbt-project/
```

**1. Install dbt-mcp**

Parrat connects to your dbt project via [dbt-mcp](https://github.com/dbt-labs/dbt-mcp):

```bash
pip install uv
uvx dbt-mcp --help   # confirm it works
```

dbt-mcp picks up your project from the current directory and credentials from `~/.dbt/profiles.yml` automatically.

**2. Set your Anthropic API key**

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# or add it to a .env file in your project root
```

**3. Install Parrat and create config**

```bash
npm install -g parrat
```

Create `parrat.config.yaml` in your dbt project root:

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

**4. Verify and run**

```bash
parrat doctor                        # checks API key, config, and dbt-mcp connectivity
parrat run freshness-investigation   # investigates all sources in your project
```

---

## How it works

Parrat runs **Skills** — pre-codified investigation playbooks that reason across your stack using a deliberately thin set of tools. Each Skill gives Claude access to only the tools it needs for that specific investigation, producing predictable, auditable reasoning paths.

Every run writes to an append-only audit log. Every run is replayable.

## Skills

| Skill | What it investigates |
|---|---|
| `freshness-investigation` | Why is this source stale? Which downstream models are at risk? |
| `metric-drop-rca` | Why did this metric drop? Which upstream model caused it? |
| `lineage-analysis` | What does this model depend on, and what depends on it? |

## Run an investigation

> Replace `my_project` with your dbt project name (from `dbt_project.yml`) and `my_source` with your source name (from `sources.yml`).

**Freshness investigation** — no input required. Investigates all sources with freshness configs:

```bash
parrat run freshness-investigation

# or investigate a specific source (source_name.table_name):
parrat run freshness-investigation '{"source": "my_source.orders"}'
```

**Metric drop RCA** — pass the metric and model context:

```bash
parrat run metric-drop-rca '{"metric_name":"revenue","model_id":"model.my_project.fct_revenue","metric_column":"amount","drop_percent":25}'
```

**Lineage analysis** — pass the dbt node ID:

```bash
parrat run lineage-analysis '{"node_id":"model.my_project.fct_orders"}'
```

Parrat returns a structured root cause with confidence rating. The full reasoning chain is logged to `.parrat/audit.jsonl`.

## Replay any investigation

```bash
parrat replay <run_id>
```

The run ID is printed at the end of each investigation and also visible in `.parrat/audit.jsonl`. Every investigation is replayable — every tool call, every Claude turn, input tokens, output tokens, cost, and duration.

## License

Apache 2.0 — see [LICENSE](LICENSE).

---

Built by [Raguvind Tharanitharan](https://raguvind.com).
