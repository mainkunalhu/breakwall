// Minimal Prometheus exposition (no deps). P6 scrapes these.
const counters = new Map<string, number>()
const durations: number[] = []
const BLOCK_SCORES = [0.5, 0.7, 0.85, 0.95]

function key(name: string, labels: Record<string, string>): string {
  const l = Object.entries(labels)
    .map(([k, v]) => `${k}="${v}"`)
    .join(",")
  return l ? `${name}{${l}}` : name
}

export function inc(
  name: string,
  labels: Record<string, string> = {},
  by = 1,
): void {
  const k = key(name, labels)
  counters.set(k, (counters.get(k) ?? 0) + by)
}

export function observeDuration(ms: number): void {
  durations.push(ms)
  if (durations.length > 5000) durations.splice(0, durations.length - 5000)
}

export function observeBlockScore(score: number): void {
  for (const b of BLOCK_SCORES) {
    if (score >= b) inc("breakwall_guard_block_score_bucket", { le: String(b) })
  }
  inc("breakwall_guard_block_score_count")
  inc("breakwall_guard_block_score_sum", {}, score)
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const i = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  )
  return sorted[Math.max(0, i)]
}

export function renderMetrics(): string {
  const lines = [
    "# HELP breakwall_gateway_requests_total Requests by model+decision",
    "# TYPE breakwall_gateway_requests_total counter",
    "# HELP breakwall_gateway_block_total Blocked prompts by model+reason",
    "# TYPE breakwall_gateway_block_total counter",
    "# HELP breakwall_gateway_cache_hits_total Cache hits by model",
    "# TYPE breakwall_gateway_cache_hits_total counter",
    "# HELP breakwall_guard_fallback_total Guardrails-unreachable fallbacks",
    "# TYPE breakwall_guard_fallback_total counter",
  ]
  for (const [k, v] of counters) {
    if (k.startsWith("breakwall_guard_block_score_")) continue
    lines.push(`${k} ${v}`)
  }
  const s = [...durations].sort((a, b) => a - b)
  lines.push(
    "# HELP breakwall_gateway_request_duration_ms Request latency",
    "# TYPE breakwall_gateway_request_duration_ms summary",
    `breakwall_gateway_request_duration_ms{quantile="0.5"} ${percentile(s, 50).toFixed(1)}`,
    `breakwall_gateway_request_duration_ms{quantile="0.95"} ${percentile(s, 95).toFixed(1)}`,
    `breakwall_gateway_request_duration_ms{quantile="0.99"} ${percentile(s, 99).toFixed(1)}`,
    `breakwall_gateway_request_duration_ms_count ${s.length}`,
    "# HELP breakwall_guard_block_score Block-score distribution",
    "# TYPE breakwall_guard_block_score histogram",
  )
  for (const b of BLOCK_SCORES) {
    lines.push(
      `breakwall_guard_block_score_bucket{le="${b}"} ${counters.get(`breakwall_guard_block_score_bucket{le="${b}"}`) ?? 0}`,
    )
  }
  lines.push(
    `breakwall_guard_block_score_count ${counters.get("breakwall_guard_block_score_count") ?? 0}`,
    `breakwall_guard_block_score_sum ${counters.get("breakwall_guard_block_score_sum") ?? 0}`,
  )
  return `${lines.join("\n")}\n`
}

export function resetMetrics(): void {
  counters.clear()
  durations.length = 0
}
