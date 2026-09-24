# Architecture (P0 stub — full in P1)

Gateway (Hono/Bun) -> Guardrails (FastAPI) -> Groq.
Eval-runner (nightly) -> Postgres. TUI reads Postgres + gateway /metrics.
Redis: rate-limit + semantic cache. Prometheus + Grafana for p95/p99.
