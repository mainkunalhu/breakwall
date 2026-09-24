export interface EvalRun {
  id: string
  startedAt: string
  model: string
  total: number
  asr: number | null
  leakage: number | null
  faithfulness: number | null
  p95Ms: number | null
  costPerQuery: number | null
  passed: boolean | null
}

export interface SuiteStat {
  suite: string
  total: number
  failed: number
}

export interface CaseVerdict {
  caseId: string
  suite: string
  expected: string
  severity: string
  prompt: string
  passed: boolean | null
  attackSuccess: boolean | null
  leaked: boolean | null
  latencyMs: number | null
}

export interface GatewayStat {
  requests: number
  blocks: number
  cacheHits: number
  fallbacks: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
}

export interface GatewayLogRow {
  ts: string
  model: string
  decision: string
  cached: boolean
  latencyMs: number
}

export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "",
  gatewayUrl: process.env.GATEWAY_URL ?? "http://localhost:8787",
  refreshMs: Number(process.env.TUI_REFRESH_MS ?? 5000),
}
