# BreakWall — Red-Team + Eval Harness for Groq LLMs

Safety + quality lab: fires 190 attacks (injection 80, PII-leak 40, jailbreak 40,
tool-misuse 30) at Groq models nightly, scores them, gateway blocks/redacts/caches.

> Docs: `docs/ARCHITECTURE.md`, `docs/METRICS.md`, `docs/GUARDRAILS.md`, `docs/GATEWAY.md`, `docs/EVAL.md`, `docs/TUI.md`.

## Stack

- `apps/gateway` — Hono on Bun (rate-limit + semantic cache + guardrails + streaming abort)
- `apps/tui` — OpenTUI React eval board (`bun create tui --template react`)
- `apps/workers` — Bun workers (eval fan-out)
- `services/guardrails` — Python FastAPI (regex + prompt-guard-2 + LLM-judge)
- `services/eval-runner` — Python nightly runner (ASR, leakage, faithfulness, p95, cost/query)
- `infra/` — Docker Compose (Postgres, Redis, Prometheus, Grafana) + k6

## Quickstart

1. **Setup environment and install dependencies**:
   ```bash
   cp .env.example .env   # Add your GROQ_API_KEY
   bun install
   ```

2. **Start the infrastructure and core services (Gateway & Guardrails)**:
   ```bash
   make dev-all
   ```

3. **Start the TUI (in a new terminal)**:
   ```bash
   bun --filter tui dev
   ```

4. **Verify tests (optional)**:
   ```bash
   bun run typecheck && bun run test && bun run test:py && bun run lint
   ```

To gracefully stop the background infrastructure (Postgres, Redis, Prometheus, Grafana), you can run:
```bash
make dev-down
```
