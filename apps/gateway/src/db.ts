import { config } from "./config.ts"
import { sha256hex } from "./store.ts"

export interface GatewayLogRow {
  model: string
  decision: "allow" | "redact" | "block" | "cache_hit"
  cached: boolean
  latencyMs: number
  promptHash: string
}

// Best-effort: never throws, never blocks the request path.
// One shared pool — a connection per request melts postgres under load
// (proven by the P6 soak crashing colima).
type Pool = {
  unsafe: (text: string, params: unknown[]) => Promise<unknown>
}

let _pool: Pool | null | undefined

async function pool(): Promise<Pool | null> {
  if (process.env.BREAKWALL_OFFLINE_TEST === "1") return null
  if (_pool !== undefined) return _pool
  if (!config.databaseUrl) {
    _pool = null
    return null
  }
  try {
    const { default: postgres } = await import("postgres")
    _pool = postgres(config.databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 3,
    }) as unknown as Pool
    return _pool
  } catch {
    _pool = null
    return null
  }
}

export async function logGateway(row: GatewayLogRow): Promise<void> {
  if (process.env.BREAKWALL_OFFLINE_TEST === "1") return
  try {
    const p = await pool()
    if (!p) return
    await p.unsafe(
      `INSERT INTO gateway_logs (model, decision, cached, latency_ms, prompt_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.model, row.decision, row.cached, row.latencyMs, row.promptHash],
    )
  } catch {
    // logging must never fail the request
  }
}

export function promptHashFor(model: string, messages: unknown): string {
  return sha256hex(`${model}\n${JSON.stringify(messages)}`)
}
