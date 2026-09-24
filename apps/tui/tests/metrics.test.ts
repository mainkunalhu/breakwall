import { describe, expect, test } from "bun:test"
import { parseMetrics } from "../src/gatewayStats.ts"

const SAMPLE = `breakwall_gateway_requests_total{model="m",decision="allow"} 7
breakwall_gateway_requests_total{model="m",decision="block"} 2
breakwall_gateway_requests_total{model="m",decision="cache_hit"} 4
breakwall_gateway_block_total{model="m",reason="heuristic"} 2
breakwall_gateway_cache_hits_total{model="m"} 4
breakwall_guard_fallback_total 1
breakwall_gateway_request_duration_ms{quantile="0.5"} 141.0
breakwall_gateway_request_duration_ms{quantile="0.95"} 223.0
breakwall_gateway_request_duration_ms{quantile="0.99"} 300.5
breakwall_gateway_request_duration_ms_count 13
`

describe("parseMetrics", () => {
  test("sums counters and reads quantiles", () => {
    const s = parseMetrics(SAMPLE)
    expect(s.requests).toBe(13)
    expect(s.blocks).toBe(2)
    expect(s.cacheHits).toBe(4)
    expect(s.fallbacks).toBe(1)
    expect(s.p50Ms).toBe(141)
    expect(s.p95Ms).toBe(223)
    expect(s.p99Ms).toBe(300.5)
  })

  test("empty input yields zeros", () => {
    const s = parseMetrics("")
    expect(s.requests).toBe(0)
    expect(s.p99Ms).toBe(0)
  })
})
