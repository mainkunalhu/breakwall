import type { GatewayLogRow, GatewayStat } from "../types.ts"

export function GatewayScreen({
  stats,
  logs,
  error,
}: {
  stats: GatewayStat | null
  logs: GatewayLogRow[]
  error: string | null
}) {
  if (error || !stats) {
    return (
      <box flexDirection="column" gap={1}>
        <text fg="#ff5555">Gateway unreachable: {error ?? "no /metrics"}</text>
        <text fg="#666">
          Run: bun --filter gateway dev (needs guardrails :8000)
        </text>
      </box>
    )
  }
  const total = Math.max(1, stats.requests)
  const blockPct = ((100 * stats.blocks) / total).toFixed(1)
  const cachePct = ((100 * stats.cacheHits) / total).toFixed(1)
  return (
    <box flexDirection="column" gap={1}>
      <text fg="#eee">
        req {stats.requests} · block {stats.blocks} ({blockPct}%) · cache{" "}
        {stats.cacheHits} ({cachePct}%) · fallback {stats.fallbacks}
      </text>
      <text fg="#eee">
        p50 {stats.p50Ms.toFixed(0)}ms · p95 {stats.p95Ms.toFixed(0)}ms · p99{" "}
        {stats.p99Ms.toFixed(0)}ms
      </text>
      <box flexDirection="column">
        <text fg="#888">recent decisions:</text>
        {logs.length === 0 && <text fg="#666">(no gateway_logs yet)</text>}
        {logs.slice(0, 12).map((l, i) => (
          <text
            key={`${l.ts}-${i}`}
            fg={
              l.decision === "block"
                ? "#ff5555"
                : l.decision === "cache_hit"
                  ? "#50fa7b"
                  : "#eee"
            }
          >
            {`${l.decision.padEnd(9)} ${l.model} ${l.latencyMs.toFixed(0)}ms${l.cached ? " cached" : ""}`}
          </text>
        ))}
      </box>
    </box>
  )
}
