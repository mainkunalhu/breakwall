/** API client — fetches from the gateway proxy */

export interface Run {
  id: string
  started_at: string
  finished_at: string | null
  model: string
  total: number
  asr: number
  leakage: number
  faithfulness: number
  p95_ms: number
  cost_per_query: number
  passed: boolean
}

export interface Verdict {
  case_id: string
  suite: string
  passed: boolean
  attack_success: boolean
  leaked: boolean
  latency_ms: number
  cost_usd: number
  prompt: string
  expected: string
  severity: string
}

export interface GatewayLogSummary {
  decision: string
  count: number
  avg_latency_ms: number
}

export interface GatewayMetrics {
  requests: Record<string, number>
  blocks: Record<string, number>
  cacheHits: number
  totalRequests: number
  p50: number
  p95: number
  p99: number
  requestCount: number
}

export interface AppConfig {
  primaryModel: string
  guardModel: string
  blockThreshold: string
  reviewThreshold: string
  cacheSimThreshold: string
  rateLimit: string
}

async function get<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  }
}

export const api = {
  runs: () => get<Run[]>('/api/runs'),
  verdicts: (runId: string) => get<Verdict[]>(`/api/runs/${runId}/verdicts`),
  gatewayLogs: () => get<GatewayLogSummary[]>('/api/gateway-logs'),
  config: () => get<AppConfig>('/api/config'),

  health: async (): Promise<boolean> => {
    try {
      const r = await fetch('/health')
      return r.ok
    } catch {
      return false
    }
  },

  metrics: async (): Promise<GatewayMetrics | null> => {
    try {
      const r = await fetch('/metrics')
      if (!r.ok) return null
      const text = await r.text()
      return parsePrometheus(text)
    } catch {
      return null
    }
  },
}

function parsePrometheus(text: string): GatewayMetrics {
  const m: GatewayMetrics = {
    requests: {},
    blocks: {},
    cacheHits: 0,
    totalRequests: 0,
    p50: 0,
    p95: 0,
    p99: 0,
    requestCount: 0,
  }

  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue

    const reqMatch = line.match(/^breakwall_gateway_requests_total\{.*decision="([^"]+)".*\}\s+([\d.]+)/)
    if (reqMatch) {
      m.requests[reqMatch[1]] = Number(reqMatch[2])
      m.totalRequests += Number(reqMatch[2])
    }

    const blockMatch = line.match(/^breakwall_gateway_block_total\{.*reason="([^"]+)".*\}\s+([\d.]+)/)
    if (blockMatch) {
      m.blocks[blockMatch[1]] = Number(blockMatch[2])
    }

    const cacheMatch = line.match(/^breakwall_gateway_cache_hits_total\{.*\}\s+([\d.]+)/)
    if (cacheMatch) m.cacheHits = Number(cacheMatch[1])

    if (line.includes('quantile="0.5"')) {
      const v = line.match(/([\d.]+)$/)
      if (v) m.p50 = Number(v[1])
    }
    if (line.includes('quantile="0.95"')) {
      const v = line.match(/([\d.]+)$/)
      if (v) m.p95 = Number(v[1])
    }
    if (line.includes('quantile="0.99"')) {
      const v = line.match(/([\d.]+)$/)
      if (v) m.p99 = Number(v[1])
    }
    if (line.startsWith('breakwall_gateway_request_duration_ms_count')) {
      const v = line.match(/([\d.]+)$/)
      if (v) m.requestCount = Number(v[1])
    }
  }

  return m
}
