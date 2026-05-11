# L4 — End-to-end tests

Tests in this directory exercise the full Parrat → Claude → dbt-mcp → dbt → DuckDB stack against a custom dbt fixture project at `tests/fixtures/dbt-project/`.

## Status (M1)

L4 fixture and bootstrap script are not yet wired up in M1. The plan:

1. Custom dbt fixture project at `tests/fixtures/dbt-project/` (1 source + 1 staging + 1 mart with explicit freshness configs)
2. Python venv with `dbt-core` + `dbt-duckdb` installed via `uv` (one-time bootstrap)
3. `dbt parse` runs to populate `target/manifest.json` (which dbt-mcp reads)
4. e2e test invokes Parrat CLI; asserts on structured JSON output + audit log content

This is the natural upgrade path for L4. The component-level coverage at
`tests/component/tool-loop.test.ts` covers the Parrat-side flow with mocked
LLM + mock MCP today, which catches the bulk of regression risk before
end-to-end becomes critical.

## When this lands

L4 fixture + bootstrap is a Pre-M1.B deliverable per
`.claude/plans/pre-m1-dogfood-setup.md`. By then we'll also have the full
dogfood setup at `parrat-dogfood/` to validate against (a richer test target
than a synthetic local fixture).

## Until then

Manual end-to-end testing happens via `parrat-dogfood/` (the personal Snowflake
project from Pre-M1.A) — set `ANTHROPIC_API_KEY`, configure
`.parrat/config.yaml` to point at the dogfood, run
`parrat run freshness-investigation '{"source":"tpch.orders"}'`.
