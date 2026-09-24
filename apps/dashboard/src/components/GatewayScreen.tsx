import type { GatewayMetrics, GatewayLogSummary } from '../api'

interface Props {
  metrics: GatewayMetrics | null
  logs: GatewayLogSummary[] | null
  online: boolean
}

export function GatewayScreen({ metrics, logs, online }: Props) {
  const blockPct = metrics && metrics.totalRequests > 0
    ? ((metrics.requests['block'] ?? 0) / metrics.totalRequests * 100).toFixed(1)
    : '0.0'
  const cachePct = metrics && metrics.totalRequests > 0
    ? (metrics.cacheHits / metrics.totalRequests * 100).toFixed(1)
    : '0.0'

  return (
    <>
      <div className="stats-grid">
        <div className={`stat-card ${online ? 'green' : 'red'}`}>
          <div className="stat-label">Gateway Status</div>
          <div className="stat-value">{online ? 'ONLINE' : 'OFFLINE'}</div>
          <div className="stat-sub">:8787</div>
        </div>
        <div className="stat-card cyan">
          <div className="stat-label">Total Requests</div>
          <div className="stat-value">{metrics?.totalRequests.toLocaleString() ?? '—'}</div>
          <div className="stat-sub">{metrics?.requestCount ?? 0} measured</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Block Rate</div>
          <div className="stat-value">{blockPct}%</div>
          <div className="stat-sub">{metrics?.requests['block'] ?? 0} blocked</div>
        </div>
        <div className="stat-card teal">
          <div className="stat-label">Cache Hit Rate</div>
          <div className="stat-value">{cachePct}%</div>
          <div className="stat-sub">{metrics?.cacheHits ?? 0} hits</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-label">p50 Latency</div>
          <div className="stat-value">{metrics?.p50.toFixed(1) ?? '—'}<span style={{ fontSize: 14, opacity: 0.6 }}>ms</span></div>
        </div>
        <div className="stat-card purple">
          <div className="stat-label">p95 Latency</div>
          <div className="stat-value">{metrics?.p95.toFixed(1) ?? '—'}<span style={{ fontSize: 14, opacity: 0.6 }}>ms</span></div>
        </div>
        <div className="stat-card amber">
          <div className="stat-label">p99 Latency</div>
          <div className="stat-value">{metrics?.p99.toFixed(1) ?? '—'}<span style={{ fontSize: 14, opacity: 0.6 }}>ms</span></div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h3>Decisions by Type</h3>
        </div>
        {metrics && Object.keys(metrics.requests).length > 0 ? (
          <div className="suite-bars">
            {Object.entries(metrics.requests)
              .sort((a, b) => b[1] - a[1])
              .map(([decision, count]) => {
                const pct = metrics.totalRequests > 0 ? (count / metrics.totalRequests) * 100 : 0
                const colorClass = decision === 'block' ? 'red' : 'green'
                return (
                  <div key={decision} className="suite-bar-row">
                    <span className="suite-bar-label">{decision}</span>
                    <div className="suite-bar-track">
                      <div
                        className={`suite-bar-fill ${colorClass}`}
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      >
                        {count.toLocaleString()}
                      </div>
                    </div>
                    <span className="suite-bar-stat">{pct.toFixed(1)}%</span>
                  </div>
                )
              })}
          </div>
        ) : (
          <div className="empty-state">
            <p>No requests yet. Send traffic through the gateway to see metrics.</p>
          </div>
        )}
      </div>

      {logs && logs.length > 0 && (
        <div className="section">
          <div className="section-header">
            <h3>Last Hour Summary</h3>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Decision</th>
                <th>Count</th>
                <th>Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(row => (
                <tr key={row.decision}>
                  <td><span className={`badge ${row.decision === 'block' ? 'block' : row.decision === 'cache_hit' ? 'cache' : row.decision === 'redact' ? 'redact' : 'allow'}`}>{row.decision}</span></td>
                  <td className="mono">{row.count}</td>
                  <td className="mono">{row.avg_latency_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
