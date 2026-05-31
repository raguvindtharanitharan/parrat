# The Investigation Methodology

**Methodology v1.0 · May 2026 · 13 investigations validated**

> How Parrat investigates data incidents — and why it works the way it does.

---

## Contents

1. [The Problem](#1-the-problem)
2. [The Investigation as a Unit of Work](#2-the-investigation-as-a-unit-of-work)
3. [Why the Tool Surface Is Thin](#3-why-the-tool-surface-is-thin)
4. [The Confidence Rating](#4-the-confidence-rating)
5. [The Audit Trail](#5-the-audit-trail)
6. [Reading an Investigation Output](#6-reading-an-investigation-output)
7. [The Practice and the Practitioner](#7-the-practice-and-the-practitioner)
8. [Methodology Changelog](#8-methodology-changelog)

---

## 1. The Problem

Most data incidents are investigated the same way: manually, informally, and once. The engineer who resolves it carries the knowledge in their head. The next incident starts from scratch.

You know the experience. An alert fires — or a stakeholder messages you — at a bad time. Something downstream is stale or wrong. You open your laptop and begin the familiar sequence: check the freshness dashboard, query the source table, look at the dbt run logs, trace the lineage back one hop, then another, then another. Forty minutes later you find it. You fix it. You write a Slack message explaining what happened. You close the laptop.

Three months later, the same thing happens. A different engineer is on call. They start from scratch.

The investigation you ran was real work, done by a playbooked person. It required knowing where to look, what questions to ask, how to read a dbt graph, how to interpret a warehouse timestamp. But it left no artifact. The reasoning is gone. The next investigation is as hard as the first.

This is not a tooling problem. It is a practice problem. Data incident investigation has never been treated as a discipline — a named, repeatable, documented process with known steps, shared methodology, and accumulated institutional memory. Every other part of the modern data stack has infrastructure: transformation has dbt, testing has dbt test, orchestration has Airflow, observability has Monte Carlo. Investigation has a senior engineer's muscle memory and an informal Slack thread.

**Parrat is built on a simple claim: investigation is a first-class discipline in data engineering, and the data engineer who runs investigations deserves tooling as good as the code they write.** This document explains how that discipline works when Parrat runs it — and why the design choices were made the way they were.

---

## 2. The Investigation as a Unit of Work

An investigation has structure. Most teams have never made that structure explicit — the work happens informally, in someone's head, with ad hoc tooling. Parrat makes it explicit by running it the same way every time.

Every Parrat investigation has four components:

| Component | Description |
|-----------|-------------|
| **A Trigger** | The event that initiated the investigation — a freshness threshold breach, an anomaly alert, a stakeholder report, or an explicit question. Recorded in the audit trail. The trigger defines the scope. |
| **A Method** | A sequence of evidence-gathering steps using a defined, bounded set of tools. Each Playbook encodes the method for a specific investigation type. The method is opinionated — it does not explore, it investigates. |
| **A Conclusion** | A structured root cause with a confidence rating and a recommended action. Not a guess — a reasoned finding supported by direct evidence from the data stack. |
| **An Artifact** | The audit trail — a permanent, replayable record of every tool call, every evidence step, every reasoning turn, cost, and duration. The investigation exists after the engineer has closed their laptop. |

### Playbooks: codified investigation playbooks

Each Parrat Playbook is an implementation of this structure for a specific investigation type. Current Playbooks:

- **`freshness-investigation`** — why is this source stale, which threshold did it breach, and which downstream models are at risk?
- **`metric-drop-rca`** — why did this metric drop, which upstream model caused it, and what changed?
- **`lineage-analysis`** — what does this model depend on, and what depends on it?

Each Playbook has a fixed input schema (what information it needs to start), a fixed output schema (what it promises to return), and a bounded tool surface (what it is allowed to access). The schema is a contract. The contract is what makes the output trustworthy and the investigation comparable across runs.

---

## 3. Why the Tool Surface Is Thin

Every Parrat Playbook operates with 3–5 tools. This is a deliberate design choice, not a limitation.

The data stack MCP ecosystem has made it trivially easy to expose 40, 60, 80 tools to an agent in a single session. Each vendor ships a comprehensive MCP server covering every operation their platform supports. Parrat deliberately does not use most of them.

|  | Bloated surface (exploration mode) | Thin surface (Parrat's investigation mode) |
|--|-------------------------------------|---------------------------------------------|
| Tools available | 30–60 in a single session | 3–5, chosen to answer the specific question |
| Agent behavior | Can query anything, go anywhere | Forms a hypothesis and tests it |
| Reasoning | Expands to fill the available space | Bounded by the available evidence paths |
| Tangents | Become conclusions | No tools to take them with |
| Token cost | 54,000+ before useful work begins | $0.05–$0.07 per investigation |
| Output | Verbose, uncertain, hard to act on | Structured, confident, actionable |

The difference is not just efficiency. It is epistemological. A bloated tool surface produces exploration — the agent tries many things hoping something is useful. A thin tool surface produces investigation — the agent forms a hypothesis about the root cause and uses the available tools to confirm or refute it.

Consider freshness investigation. The question is: *"what is the most recent timestamp in the source table, and does it breach the configured threshold?"* Answering that question requires exactly three tools: source metadata from dbt (to find the freshness configuration and the loaded_at field), a warehouse query (to find `MAX(loaded_at)`), and lineage data (to understand what is downstream). A fourth tool — say, git history — is not needed to answer the question. Including it does not improve the answer. It expands the reasoning surface and introduces the risk of an irrelevant finding becoming the conclusion.

> **Security property:** A freshness investigation Playbook cannot accidentally read your git history, send a Slack message, or modify your dbt project. The tool surface is the explicit contract between the Playbook and your data stack. You can audit exactly what Parrat was allowed to access before you run it — because the allowlist is in the Playbook definition.

### Tool surface by Playbook

- **`freshness-investigation`**: `get_source_details` (freshness config), `show` (warehouse timestamp query), `get_lineage` (downstream impact). Three tools. The investigation question is answered completely.
- **`metric-drop-rca`**: `get_node_details` (model definition), `show` (warehouse query for metric), `get_lineage` (upstream chain), `get_node_details` (upstream model). Four tools. The upstream cause question requires one additional hop.

---

## 4. The Confidence Rating

Every Parrat investigation concludes with a confidence rating. This rating is not a disclaimer or a hedge — it is information. A `confidence: high` finding and a `confidence: low` finding are both real outputs. They tell you different things about what to do next.

| Rating | What it means | What to do |
|--------|---------------|------------|
| `confidence: high` | Direct warehouse evidence confirms the root cause. Parrat executed a query against the actual table and found definitive proof — a timestamp, a row count, a value — that conclusively establishes the cause. The reasoning chain is complete. | Act on the recommended action directly. The finding is as certain as a query result can be. |
| `confidence: medium` | Strong inferential evidence points to the root cause, but a definitive warehouse confirmation was not possible — due to permissions, table availability, or the investigation hitting max_turns before the final verification step. | Treat as a strong hypothesis. Run the suggested verification query manually to confirm before acting. |
| `confidence: low` | Candidate explanations were surfaced but alternatives could not be eliminated. The investigation found signals but not a definitive cause. This is not a failure — it is an honest report of what the available evidence supports. | Treat as a starting point. The evidence chain in the audit trail will show you which path to investigate next manually. |

Across 13 validated investigations on Snowflake and DuckDB, Parrat has returned `confidence: high` in 100% of cases where a root cause was determinable from the source data. The confidence rating is calibrated, not optimistic.

> **Why this transparency matters.** Most AI tools in the data observability space return an answer with implicit certainty. Parrat returns an answer with an explicit confidence level and a full evidence chain. You are not asked to trust the conclusion — you are given the means to verify it. The confidence rating is part of the methodology because investigation without epistemic honesty is not investigation. It is guessing with extra steps.

---

## 5. The Audit Trail

Every investigation Parrat runs writes a complete record to `.parrat/audit.jsonl`. This file is append-only. Each entry is a self-contained investigation record.

The audit trail contains:

- **The complete input** — what trigger initiated the investigation and what context was provided
- **Every tool call** — name, arguments, and the exact result returned from the data stack
- **Every reasoning turn** — Claude's reasoning steps, including what hypothesis was formed and how it was tested
- **The final output** — the structured conclusion, confidence rating, evidence chain, and recommended action
- **Run metadata** — run ID, Playbook name, model used, token counts, estimated cost, duration

### Three reasons the audit trail matters

**Verification.** You can inspect whether Claude's reasoning was sound — not just whether the conclusion was correct. If the output surprised you, the audit trail shows you exactly why Parrat reached that conclusion. Every step is on the record.

**Learning.** When the same source goes stale six months later, you can read how you diagnosed it last time. The evidence chain from the prior investigation is your starting hypothesis for the new one. Investigation builds on investigation.

**Institutional memory.** When the engineer who resolved the incident moves to another team or leaves the company, the investigation is still on file. The organization retains the knowledge. The next incident of the same type starts from evidence, not from scratch.

### Replay

Every investigation is replayable:

```
parrat replay <run_id>
```

The run ID is printed at the end of each investigation and stored in the audit log. Replay reconstructs the investigation step by step — every tool call in sequence, every reasoning turn, the final conclusion. It is not a re-run: it is a reconstruction from the stored audit record. The investigation you ran six months ago can be replayed today and will produce the same structured output from the same stored evidence.

### Schema stability

The audit schema is versioned. The current schema is **v1**. Future schema changes will always include a migration path so investigations recorded today remain replayable in future versions of Parrat. The audit trail is a contract — not an implementation detail that changes between releases.

---

## 6. Reading an Investigation Output

*A real freshness investigation, field by field. Project: [jaffle_shop](https://github.com/dbt-labs/jaffle-shop) (dbt Labs' canonical sample project, DuckDB).*

Below is a complete freshness investigation output from a cold-install run against jaffle_shop — dbt Labs' canonical DuckDB sample project. This project was not designed by Parrat's author. It is the standard project every dbt user encounters first.

```json
{
  "status": "stale_error",

  "stale_sources": [
    {
      "source": "ecom.raw_stores",
      "last_loaded_at": "2019-09-13T00:00:00+00:00",
      "threshold_breached": "error",
      "summary": "raw_stores has only 6 rows and its freshness field opened_at has not advanced beyond 2019-09-13 — over 5 years ago. This far exceeds the 48h error threshold. The table appears to be a static, never-updated dataset."
    },
    {
      "source": "ecom.raw_orders",
      "last_loaded_at": "2025-08-31T18:46:00+00:00",
      "threshold_breached": "error",
      "summary": "raw_orders contains 61,948 rows and is an active table, but the most recent ordered_at is 2025-08-31T18:46:00 — past the 48h error threshold. The ingestion pipeline has stalled."
    }
  ],

  "confidence": "high",

  "root_cause_summary": "Two sources breach the 48h error threshold. raw_stores: opened_at is 2019-09-13 — a static reference dataset with no ingestion pipeline. raw_orders: ordered_at is 2025-08-31T18:46:00 — an active table whose pipeline has stalled since that timestamp.",

  "evidence": [
    { "tool": "mcp__dbt__get_node_details_dev",
      "finding": "raw_stores: warn_after=24h, error_after=48h, loaded_at_field='opened_at'" },
    { "tool": "mcp__dbt__get_node_details_dev",
      "finding": "raw_orders: warn_after=24h, error_after=48h, loaded_at_field='ordered_at'" },
    { "tool": "mcp__dbt__show",
      "finding": "raw_stores warehouse: row_count=6, MAX(opened_at)='2019-09-13'" },
    { "tool": "mcp__dbt__show",
      "finding": "raw_orders warehouse: row_count=61948, MAX(ordered_at)='2025-08-31T18:46:00'" },
    { "tool": "mcp__dbt__get_lineage_dev",
      "finding": "raw_stores downstream: stg_locations → locations" },
    { "tool": "mcp__dbt__get_lineage_dev",
      "finding": "raw_orders downstream: stg_orders → order_items → orders → customers" }
  ],

  "recommended_action": "raw_stores: investigate whether this is intentionally static. If so, replace with a dbt seed and remove the freshness check. raw_orders: check ETL scheduler for failures since 2025-08-31T18:46:00 and trigger a manual sync.",

  "downstream_impact": {
    "models": [
      "stg_locations", "locations",
      "stg_orders", "order_items", "orders", "customers"
    ],
    "severity": "high"
  }
}
```

### Field reference

| Field | What it tells you |
|-------|-------------------|
| `status` | `fresh` — all sources within threshold. `warn` — at least one source in warn window. `stale_error` — at least one source breached the error threshold. `no_freshness_config` — no sources have freshness thresholds configured. |
| `stale_sources` | Each source that breached a threshold, with the actual warehouse timestamp (`last_loaded_at`), which threshold was breached (`warn` or `error`), and a summary of the finding. Fresh sources are not listed. |
| `confidence` | `high` / `medium` / `low` — as defined in Section 4. High means the warehouse query returned definitive evidence. This example is high because `MAX(loaded_at)` was queried directly for both sources. |
| `root_cause_summary` | The narrative explanation — written to be shared directly with your team or included in an incident ticket. Distinguishes between root causes when multiple sources are stale. In this example: a static dataset vs. a pipeline stall — different causes, different fixes. |
| `evidence` | The chain of tool calls that led to the conclusion. Each entry is a tool name and the finding it returned. This is the distilled evidence, not every intermediate step. Reading this chain tells you exactly how Parrat reached its conclusion. |
| `recommended_action` | What to do next, specific to the root cause found. Not generic advice — actionable steps tied to the actual finding. In this example, different actions for raw_stores (investigate static data) vs. raw_orders (restart pipeline). |
| `downstream_impact` | The models that depend on the stale sources, derived from dbt lineage. `severity: high` when the affected models include mart-level tables (orders, customers) that power dashboards or downstream processes. |

### The evidence chain in detail

The evidence array shows six tool calls. Three tools, used twice each — once per source. This is the thin tool surface in action:

1. **`get_node_details`** — Fetched raw_stores freshness config: `warn_after=24h, error_after=48h, loaded_at_field='opened_at'`. This tells Parrat what question to ask the warehouse.
2. **`get_node_details`** — Fetched raw_orders freshness config: `warn_after=24h, error_after=48h, loaded_at_field='ordered_at'`.
3. **`show`** — Queried warehouse: `SELECT MAX(opened_at), COUNT(*) FROM jaffle_shop.raw.raw_stores`. Result: `row_count=6, MAX(opened_at)='2019-09-13'`. Definitive evidence — 5+ years stale.
4. **`show`** — Queried warehouse: `SELECT MAX(ordered_at), COUNT(*) FROM jaffle_shop.raw.raw_orders`. Result: `row_count=61,948, MAX(ordered_at)='2025-08-31T18:46:00'`. Pipeline stall confirmed.
5. **`get_lineage`** — Fetched raw_stores downstream lineage: `stg_locations → locations`. Two models at risk.
6. **`get_lineage`** — Fetched raw_orders downstream lineage: `stg_orders → order_items → orders → customers`. Four models at risk, including mart-level tables. Severity: high.

Six tool calls. Two sources investigated. Downstream impact mapped. Root causes distinguished. Total cost: $0.07. Total time: under 90 seconds.

---

## 7. The Practice and the Practitioner

Data engineers have been running investigations for as long as there have been data pipelines. They have been doing the work informally, without tooling, without a methodology, without a name for it.

dbt named a practice — analytics engineering — and the data engineering community organized around it. The tool was the artifact. The name was the product.

**We are naming data incident investigation.**

Not a feature. Not a product category. A discipline — with a methodology, a structure, a confidence standard, and an audit trail that makes the work reproducible and the knowledge permanent.

The practice is **data incident investigation**: the structured process of identifying the root cause of a data anomaly, tracing it through the stack to its source, assessing downstream impact, and producing a reproducible record of how the conclusion was reached.

The practitioner is a **data incident investigator** — the data engineer who runs this process with rigor. Not the engineer who guesses at root causes under pressure and hopes they got it right. The one who forms a hypothesis, tests it against warehouse evidence, and produces a finding with a confidence rating and an audit trail.

This is not a new job. It is a name for something data engineers already do. The name matters because named practices attract tooling, community, and professional identity. The Analytics Engineer did not exist as a job title before it was named. The practice existed. The name made it claimable.

> **The long-game bet:** in 2030, data engineers will run investigations the way they run dbt models today — with a structured command, a versioned methodology, and an artifact that outlasts the incident. The investigation history of a data team — the patterns, the recurring failures, the institutional knowledge encoded in thousands of audit records — is not a log. It is a 10-year relationship between a team and their data. Parrat is building the infrastructure for that relationship.

### What this methodology commits us to

This document is a public contract, not a marketing page. It will be updated as the methodology evolves. When we discover new failure modes, when patterns emerge across hundreds of investigations, when a confidence calibration needs adjustment — we will update this document and note what changed in the changelog below.

The methodology is also the quality bar for the Playbooks ecosystem. A Parrat Playbook — whether written by us or by the community — should be evaluable against these principles: does it use a bounded tool surface? Does it form a hypothesis and test it? Does it produce a confidence rating backed by direct evidence? Does it write a complete audit record? These are not preferences. They are the definition of investigation methodology compliance.

---

## 8. Methodology Changelog

*Version history. Updated when the methodology changes, not when the software changes.*

### v1.0 — May 2026 — Initial methodology

First public version. Covers freshness investigation, metric-drop RCA, and lineage analysis. Confidence rating framework (high / medium / low) defined. Thin tool surface principle (3–5 tools per Playbook) documented. Audit trail schema v1 established. Validated across 13 investigations: 11 on Snowflake (parrat-dogfood) and 2 on DuckDB (jaffle_shop). 100% `confidence: high` rate where root cause was determinable. Average cost: $0.07/investigation. Average latency: freshness ~45s, lineage ~25s, metric-drop ~110s.

---

*Future versions will note: what changed, why it changed, and whether existing audit records are affected. Schema changes will include a migration path. Investigations recorded under v1 will remain replayable under all future versions.*

---

Parrat · [github.com/RaguvindTharanitharan/parrat](https://github.com/RaguvindTharanitharan/parrat) · Raguvind Tharanitharan
