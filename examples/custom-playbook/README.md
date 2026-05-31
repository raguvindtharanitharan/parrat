# Custom Playbook example — row-count-check

A minimal Parrat Playbook that checks whether a dbt model has at least a minimum number of rows.

## What it demonstrates

- The full Playbook contract: `inputSchema`, `outputSchema`, `run()`
- A thin tool surface: 1 tool (`show`) is all this investigation needs
- How to write a system prompt that drives `emit_findings`

## How to use it

1. Copy `index.ts` to `.parrat/playbooks/row-count-check/index.ts` in your project
2. Run it:

```bash
parrat run row-count-check '{"model": "mart_orders", "min_rows": 1000}'
```

## The thin tool surface pattern

Each Playbook declares `allowedDbtTools` — the exact set of tools Claude can call.
This Playbook uses 1 tool. The built-in Playbooks use 3–4 of the 47 available dbt-mcp tools.

Fewer tools = more predictable reasoning + readable audit logs.
