# TUI eval board (P5) — OpenTUI React, no Next.js

`apps/tui` (`bun create tui --template react`). Four screens, 5s auto-refresh:

- `[1] board` — latest run from Postgres (`runs` + per-suite fail counts): gate,
  ASR/leakage/faithfulness/p95/cost, recent runs.
- `[2] gateway` — live Hono `/metrics` (requests, block/cache %, p50/p95/p99)
  plus recent `gateway_logs` rows. Shows an unreachable hint when down.
- `[3] attacks` — latest-run verdicts joined with `eval_cases`: `[s]`uite cycle,
  `[f]`ailed-only toggle, `[j/k]` scroll.
- `[4] targets` — Groq models + thresholds from env.

Keys: `1-4` screens, `r` refresh, `ESC` quit (owns `renderer.destroy()` on all
shutdown paths).

Non-interactive export for reports/CI-less nightly logs:

```bash
bun --filter tui dev -- --export            # markdown to stdout
bun --filter tui dev -- --export --out reports/board.md
```

Data layer: `src/db.ts` (postgres, short timeouts, connections closed per
refresh), `src/gatewayStats.ts` (Prometheus text parse). Screens are pure
presentational components over props — tested with `testRender` snapshots.
