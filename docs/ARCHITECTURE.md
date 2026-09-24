# Architecture (P1)

```
                 ┌─────────────┐
                 │  apps/tui   │  OpenTUI React board (reads Postgres + /metrics)
                 └──────┬──────┘
                        │ SQL + Prometheus
┌──────────┐   ┌───────▼────────┐   ┌──────────────┐   ┌──────────┐
│ datasets │──▶│  eval-runner   │──▶│   gateway    │──▶│ Groq API │
│ 190 jsonl│   │ (nightly, P4)  │   │ (Hono, P3)   │   └──────────┘
└──────────┘   └───────┬────────┘   └──────┬───────┘
                       │ verdicts          │ guard check
                       ▼                   ▼
                 ┌─────────────┐   ┌──────────────┐
                 │  Postgres   │   │ guardrails   │
                 │  runs/cases │   │ (FastAPI,P2) │
                 └─────────────┘   └──────────────┘
                        ▲                   ▲
                 ┌──────┴───────────────────┴──────┐
                 │  Redis: rate-limit + sem-cache  │
                 └─────────────────────────────────┘
Prometheus scrapes gateway :8787/metrics + guardrails :8000/metrics.
Grafana :3000 visualizes p99, block %, cache %.
```

Contracts: `packages/contracts` (zod) + `openapi.yaml` are the single source of
truth. Gateway, guardrails, eval-runner, TUI must validate against them.

Infra: `docker-compose -f infra/docker-compose.yml up -d` brings up
postgres :5432, redis :6379, prometheus :9090, grafana :3000.
Run the gateway (`bun --filter gateway dev`) and guardrails
(`uv run uvicorn app.main:app --port 8000`) on the host — Prometheus scrapes
both via `host.docker.internal`.

Compose note: this machine uses the `docker-compose` binary (not `docker compose`).
