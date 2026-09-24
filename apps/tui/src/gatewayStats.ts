import type { GatewayStat } from "./types.ts"
import { config } from "./types.ts"

function numFor(text: string, name: string, labels = ""): number {
  const m = text.match(new RegExp(`^${name}${labels} ([0-9.eE+-]+)`, "m"))
  return m ? Number(m[1]) : 0
}

function sumByPrefix(text: string, prefix: string): number {
  let total = 0
  for (const line of text.split("\n")) {
    if (line.startsWith(`${prefix}{`) || line === prefix) {
      const v = Number(line.split(" ").pop())
      if (Number.isFinite(v)) total += v
    }
  }
  return total
}

export function parseMetrics(text: string): GatewayStat {
  return {
    requests: sumByPrefix(text, "breakwall_gateway_requests_total"),
    blocks: sumByPrefix(text, "breakwall_gateway_block_total"),
    cacheHits: sumByPrefix(text, "breakwall_gateway_cache_hits_total"),
    fallbacks: numFor(text, "breakwall_guard_fallback_total"),
    p50Ms: numFor(
      text,
      "breakwall_gateway_request_duration_ms",
      '\\{quantile="0.5"\\}',
    ),
    p95Ms: numFor(
      text,
      "breakwall_gateway_request_duration_ms",
      '\\{quantile="0.95"\\}',
    ),
    p99Ms: numFor(
      text,
      "breakwall_gateway_request_duration_ms",
      '\\{quantile="0.99"\\}',
    ),
  }
}

export async function fetchGatewayStats(): Promise<GatewayStat | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 4000)
    try {
      const res = await fetch(`${config.gatewayUrl}/metrics`, {
        signal: ctrl.signal,
      })
      if (!res.ok) return null
      return parseMetrics(await res.text())
    } finally {
      clearTimeout(t)
    }
  } catch {
    return null
  }
}
