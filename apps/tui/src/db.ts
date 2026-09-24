import type { CaseVerdict, EvalRun, GatewayLogRow, SuiteStat } from "./types.ts"
import { config } from "./types.ts"

async function sql() {
  if (!config.databaseUrl) throw new Error("DATABASE_URL not set")
  const { default: postgres } = await import("postgres")
  return postgres(config.databaseUrl, {
    connect_timeout: 3,
    idle_timeout: 5,
    max: 1,
  })
}

export async function latestRuns(limit = 10): Promise<EvalRun[]> {
  const sqlc = await sql()
  try {
    const rows = await sqlc`
      SELECT id, started_at, model, total, asr, leakage, faithfulness,
             p95_ms, cost_per_query, passed
      FROM runs ORDER BY started_at DESC LIMIT ${limit}`
    return rows.map((r) => ({
      id: String(r.id),
      startedAt: String(r.started_at),
      model: String(r.model),
      total: Number(r.total),
      asr: r.asr === null ? null : Number(r.asr),
      leakage: r.leakage === null ? null : Number(r.leakage),
      faithfulness: r.faithfulness === null ? null : Number(r.faithfulness),
      p95Ms: r.p95_ms === null ? null : Number(r.p95_ms),
      costPerQuery: r.cost_per_query === null ? null : Number(r.cost_per_query),
      passed: r.passed,
    }))
  } finally {
    await sqlc.end({ timeout: 2 }).catch(() => {})
  }
}

export async function suiteStats(runId: string): Promise<SuiteStat[]> {
  const sqlc = await sql()
  try {
    const rows = await sqlc`
      SELECT suite, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE NOT passed) AS failed
      FROM verdicts WHERE run_id = ${runId} GROUP BY suite ORDER BY suite`
    return rows.map((r) => ({
      suite: String(r.suite),
      total: Number(r.total),
      failed: Number(r.failed),
    }))
  } finally {
    await sqlc.end({ timeout: 2 }).catch(() => {})
  }
}

export async function caseVerdicts(
  runId: string,
  opts: { suite?: string; failedOnly?: boolean; limit?: number } = {},
): Promise<CaseVerdict[]> {
  const sqlc = await sql()
  try {
    const suite = opts.suite ?? ""
    const limit = opts.limit ?? 50
    const rows = await sqlc`
      SELECT v.case_id, v.suite, c.expected, c.severity,
             LEFT(c.prompt, 160) AS prompt,
             v.passed, v.attack_success, v.leaked, v.latency_ms
      FROM verdicts v JOIN eval_cases c ON c.id = v.case_id
      WHERE v.run_id = ${runId}
        AND (${suite} = '' OR v.suite = ${suite})
        AND (${opts.failedOnly === true} = FALSE OR NOT v.passed)
      ORDER BY v.passed ASC, v.case_id ASC
      LIMIT ${limit}`
    return rows.map((r) => ({
      caseId: String(r.case_id),
      suite: String(r.suite),
      expected: String(r.expected),
      severity: String(r.severity),
      prompt: String(r.prompt),
      passed: r.passed,
      attackSuccess: r.attack_success,
      leaked: r.leaked,
      latencyMs: r.latency_ms === null ? null : Number(r.latency_ms),
    }))
  } finally {
    await sqlc.end({ timeout: 2 }).catch(() => {})
  }
}

export async function recentGatewayLogs(limit = 20): Promise<GatewayLogRow[]> {
  const sqlc = await sql()
  try {
    const rows = await sqlc`
      SELECT ts, model, decision, cached, latency_ms
      FROM gateway_logs ORDER BY ts DESC LIMIT ${limit}`
    return rows.map((r) => ({
      ts: String(r.ts),
      model: String(r.model),
      decision: String(r.decision),
      cached: Boolean(r.cached),
      latencyMs: Number(r.latency_ms),
    }))
  } finally {
    await sqlc.end({ timeout: 2 }).catch(() => {})
  }
}
