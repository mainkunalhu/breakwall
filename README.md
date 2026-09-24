# BreakWall — Red-Team + Eval Harness for Groq LLMs

Safety + quality lab: fires 190 attacks (injection 80, PII-leak 40, jailbreak 40,
tool-misuse 30) at Groq models nightly, scores them, gateway blocks/redacts/caches.

> Status: P0–P5 done (monorepo, contracts+infra, guardrails, gateway, eval,
> TUI board). P6 next: k6 + Grafana proof. TUI-first (OpenTUI React), no Next.js.
> Docs: `docs/ARCHITECTURE.md`, `docs/METRICS.md`, `docs/GUARDRAILS.md`, `docs/GATEWAY.md`, `docs/EVAL.md`, `docs/TUI.md`.

## Stack

- `apps/gateway` — Hono on Bun (rate-limit + semantic cache + guardrails + streaming abort)
- `apps/tui` — OpenTUI React eval board (`bun create tui --template react`)
- `apps/workers` — Bun workers (eval fan-out)
- `services/guardrails` — Python FastAPI (regex + prompt-guard-2 + LLM-judge)
- `services/eval-runner` — Python nightly runner (ASR, leakage, faithfulness, p95, cost/query)
- `infra/` — Docker Compose (Postgres, Redis, Prometheus, Grafana) + k6

## Quickstart

```bash
cp .env.example .env   # add GROQ_API_KEY
bun install
docker-compose -f infra/docker-compose.yml up -d
bun --filter gateway dev    # :8787 (needs guardrails below)
bun --filter tui dev        # eval board
(cd services/guardrails && uv run uvicorn app.main:app --port 8000)
```

Verify: `bun run typecheck && bun run test && bun run test:py && bun run lint`

## Hiring line

`190-case red-team harness, blocked 95% of attacks (97.5% injections), 34% cost saved via cache, 5k-conn gateway p99 <30ms`
