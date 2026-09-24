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
export async function logGateway(row: GatewayLogRow): Promise<void> {
  if (process.env.BREAKWALL_OFFLINE_TEST === "1") return
  if (!config.databaseUrl) return
  try {
    const { default: postgres } = await import("postgres")
    const sql = postgres(config.databaseUrl, {
      connect_timeout: 2,
      idle_timeout: 5,
      max: 1,
    })
    try {
      await sql`INSERT INTO gateway_logs (model, decision, cached, latency_ms, prompt_hash)
        VALUES (${row.model}, ${row.decision}, ${row.cached}, ${row.latencyMs}, ${row.promptHash})`
    } finally {
      await sql.end({ timeout: 2 }).catch(() => {})
    }
  } catch {
    // logging must never fail the request
  }
}

export function promptHashFor(model: string, messages: unknown): string {
  return sha256hex(`${model}\n${JSON.stringify(messages)}`)
}
