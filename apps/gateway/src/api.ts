/**
 * Dashboard API routes — serves eval run data from Postgres.
 * Mounted as /api/* on the gateway Hono app.
 */
import { Hono } from "hono"
import { cors } from "hono/cors"

type Pool = {
  unsafe: (text: string, params?: unknown[]) => Promise<unknown[]>
}

let _pool: Pool | null | undefined

async function pool(): Promise<Pool | null> {
  if (_pool !== undefined) return _pool
  const dbUrl = process.env.DATABASE_URL ?? ""
  if (!dbUrl) {
    _pool = null
    return null
  }
  try {
    const { default: postgres } = await import("postgres")
    _pool = postgres(dbUrl, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 3,
    }) as unknown as Pool
    return _pool
  } catch {
    _pool = null
    return null
  }
}

const api = new Hono()
api.use("/*", cors())

api.get("/runs", async (c) => {
  const p = await pool()
  if (!p) return c.json({ error: "database unavailable" }, 503)
  const rows = await p.unsafe(
    `SELECT id, started_at, finished_at, model, total, asr, leakage,
            faithfulness, p95_ms, cost_per_query, passed
     FROM runs ORDER BY started_at DESC LIMIT 20`,
  )
  return c.json(rows)
})

api.get("/runs/:id/verdicts", async (c) => {
  const p = await pool()
  if (!p) return c.json({ error: "database unavailable" }, 503)
  const runId = c.req.param("id")
  const rows = await p.unsafe(
    `SELECT v.case_id, v.suite, v.passed, v.attack_success, v.leaked,
            v.latency_ms, v.cost_usd, ec.prompt, ec.expected, ec.severity
     FROM verdicts v JOIN eval_cases ec ON ec.id = v.case_id
     WHERE v.run_id = $1
     ORDER BY v.passed ASC, v.suite, v.case_id`,
    [runId],
  )
  return c.json(rows)
})

api.get("/cases", async (c) => {
  const p = await pool()
  if (!p) return c.json({ error: "database unavailable" }, 503)
  const rows = await p.unsafe(
    `SELECT id, suite, severity, prompt, expected FROM eval_cases ORDER BY suite, id`,
  )
  return c.json(rows)
})

api.get("/gateway-logs", async (c) => {
  const p = await pool()
  if (!p) return c.json({ error: "database unavailable" }, 503)
  const rows = await p.unsafe(
    `SELECT decision, COUNT(*)::int AS count,
            ROUND(AVG(latency_ms)::numeric, 1) AS avg_latency_ms
     FROM gateway_logs
     WHERE ts > now() - interval '1 hour'
     GROUP BY decision ORDER BY count DESC`,
  )
  return c.json(rows)
})

api.get("/config", (c) => {
  return c.json({
    primaryModel: process.env.GROQ_PRIMARY_MODEL ?? "openai/gpt-oss-120b",
    guardModel: process.env.GROQ_GUARD_MODEL ?? "meta-llama/llama-prompt-guard-2-86m",
    blockThreshold: process.env.GUARD_BLOCK_THRESHOLD ?? "0.85",
    reviewThreshold: process.env.GUARD_REVIEW_THRESHOLD ?? "0.45",
    cacheSimThreshold: process.env.CACHE_SIM_THRESHOLD ?? "0.92",
    rateLimit: process.env.GATEWAY_RATE_LIMIT ?? "60",
  })
})

export { api }
