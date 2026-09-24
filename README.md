# BreakWall — Red-Team + Eval Harness for Groq LLMs

Safety + quality lab: fires 190 attacks (injection 80, PII-leak 40, jailbreak 40,
tool-misuse 30) at Groq models nightly, scores them, gateway blocks/redacts/caches.

> Phase 0 scaffold. See `docs/` for architecture. TUI-first (OpenTUI React), no Next.js.

## Stack

- `apps/gateway` — Hono on Bun (rate-limit + semantic cache + guardrails + streaming abort)
- `apps/tui` — OpenTUI React eval board (`bun create tui --template react`)
- `apps/workers` — Bun workers (eval fan-out)
- `services/guardrails` — Python FastAPI (regex + prompt-guard-2 + LLM-judge)
- `services/eval-runner` — Python nightly runner (ASR, leakage, faithfulness, p95, cost/query)
- `infra/` — Docker Compose (Postgres, Redis, Prometheus, Grafana) + k6

## Quickstart (P0)

```bash
cp .env.example .env   # add GROQ_API_KEY
bun install
docker-compose -f infra/docker-compose.yml up -d
bun --filter tui dev
bun --filter gateway dev
```

## Hiring line

`190-case red-team harness, blocked 93% injections, 34% cost saved via cache, 5k-conn gateway p99 <300ms`
