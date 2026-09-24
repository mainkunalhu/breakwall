# Dashboard (P5 → P7) — Vite + React Web UI

Replaced the broken OpenTUI terminal dashboard with a modern Vite + React web dashboard.

`apps/dashboard` runs on `:5173` and proxies API calls to the gateway on `:8787`.

## Screens

- **Board** — Latest eval run stats (ASR, leakage, faithfulness, gate pass/fail), suite breakdown bars, recent runs table. Click a run to jump to Attacks.
- **Gateway** — Live Prometheus metrics (total requests, block %, cache hit %, p50/p95/p99 latency), decision breakdown, last-hour log summary from Postgres.
- **Attacks** — Filterable verdict table for the selected run. Filter by suite, toggle failed-only. Shows case ID, severity, prompt preview, expected vs actual, leaked flag.
- **Targets** — Model configuration (primary + guard), guardrails thresholds, gateway settings, eval gate targets.

## Auto-refresh

All data polls every 3–5 seconds. Gateway health check runs on a 5s interval with a live status dot in the sidebar.

## API Endpoints (on gateway)

The dashboard consumes these endpoints added to the gateway (`apps/gateway/src/api.ts`):

- `GET /api/runs` — Latest 20 eval runs
- `GET /api/runs/:id/verdicts` — Verdicts for a specific run (joined with eval_cases)
- `GET /api/gateway-logs` — Last-hour gateway log summary by decision
- `GET /api/config` — Current model + threshold configuration from env
- `GET /metrics` — Raw Prometheus text (parsed client-side)
- `GET /health` — Gateway health check

## Development

```bash
bun --filter dashboard dev   # http://localhost:5173
# Or via Makefile:
make dev-all                 # starts everything together
```
