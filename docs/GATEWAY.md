# Gateway (P3) — Hono on Bun

`apps/gateway`: rate-limit → semantic cache → guardrails → Groq passthrough.

## Run

```bash
set -a; source .env; set +a
bun --filter gateway dev          # :8787 (needs guardrails :8000 for verdicts)
(cd services/guardrails && uv run uvicorn app.main:app --port 8000)
```

## Chain (`POST /v1/chat`)

1. **Validate** with `@breakwall/contracts` `ChatRequest` → 400 otherwise.
2. **Rate-limit**: Redis sliding-window ZSET (`bw:rl:<ip>`, 60/min default),
   memory fallback. Fail-open: unparseable Redis results fall through to memory —
   limits are approximate under infra races (documented, not a bug).
3. **Cache**: normalized-exact (case/punct-insensitive, `$0`, `cache_hit`) +
   token-bigram Jaccard similarity (`CACHE_SIM_THRESHOLD=0.92`) over a
   per-process memory index, values in Redis (1h TTL) when available.
   Model-namespaced keys — models never share entries. No caching on guard fallback.
4. **Guardrails** (`POST /v1/guard`): `block` → 403; `redact` → upstream receives
   `redactedPrompt` (PII never reaches Groq); `allow` → passthrough.
   Unreachable guardrails → fail-open `allow` + `x-breakwall-guard-fallback: true`
   + `breakwall_guard_fallback_total` (use `GUARD_STRICT=1` to fail closed).
5. **Groq** passthrough (`/openai/v1/chat/completions`): JSON or SSE streaming.
   Client disconnect aborts upstream (`stream.onAbort` + `req.raw.signal`, Bun-safe).
   Cost estimated from usage tokens (static price table — Groq dashboard authoritative).

## Endpoints

- `GET /health`, `GET /metrics` (`breakwall_gateway_requests_total{model,decision}`,
  `breakwall_gateway_block_total{model,reason}`, `breakwall_gateway_cache_hits_total`,
  `breakwall_gateway_request_duration_ms` summary w/ p50/p95/p99,
  `breakwall_guard_block_score` histogram)
- `POST /v1/chat` → `ChatResponse`; headers `x-breakwall-decision`,
  `x-breakwall-cached`, `x-ratelimit-remaining`; 429 has `retry-after`.

## Persistence

Best-effort `gateway_logs` inserts (model, decision, cached, latency, sha256 prompt
hash — never raw prompts). Never blocks/fails requests.

## Redis gotchas (learned P3)

- `ioredis` + `lazyConnect: true` requires an explicit `connect()` — without it,
  `pipeline.exec()` *resolves* with per-command failures; parsing that as a count
  yields `NaN` → always-429. We connect eagerly and treat non-finite counts as
  infra failure → memory fallback.
- Tests run hermetic (`BREAKWALL_OFFLINE_TEST=1` in the `test` script): memory
  stores, stubbed `fetch`, no Postgres.

## Verified live (P3)

allow→200, repeat→`cache_hit` 2ms `$0`, injection→403, PII→`redact` (model confirms
no email seen), SSE streaming, client-abort survives, 60→429 trips, `gateway_logs`
rows + Prometheus metrics correct.
