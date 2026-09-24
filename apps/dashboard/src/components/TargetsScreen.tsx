import type { AppConfig } from '../api'

interface Props {
  config: AppConfig | null
}

export function TargetsScreen({ config }: Props) {
  if (!config) {
    return (
      <div className="empty-state">
        <div className="empty-icon">⚙️</div>
        <p>Unable to load configuration. Ensure the gateway is running.</p>
      </div>
    )
  }

  return (
    <div className="config-grid">
      <div className="config-card">
        <h4>🤖 Models</h4>
        <div className="config-row">
          <span className="config-key">Primary Model</span>
          <span className="config-val">{config.primaryModel}</span>
        </div>
        <div className="config-row">
          <span className="config-key">Guard Model</span>
          <span className="config-val">{config.guardModel}</span>
        </div>
      </div>

      <div className="config-card">
        <h4>🛡️ Guardrails</h4>
        <div className="config-row">
          <span className="config-key">Block Threshold</span>
          <span className="config-val">≥ {config.blockThreshold}</span>
        </div>
        <div className="config-row">
          <span className="config-key">Review Threshold</span>
          <span className="config-val">≥ {config.reviewThreshold}</span>
        </div>
        <div className="config-row">
          <span className="config-key">Pipeline</span>
          <span className="config-val">PII → Rules → Classifier → Judge</span>
        </div>
      </div>

      <div className="config-card">
        <h4>⚡ Gateway</h4>
        <div className="config-row">
          <span className="config-key">Cache Similarity</span>
          <span className="config-val">≥ {config.cacheSimThreshold}</span>
        </div>
        <div className="config-row">
          <span className="config-key">Rate Limit</span>
          <span className="config-val">{config.rateLimit} req/min</span>
        </div>
        <div className="config-row">
          <span className="config-key">Cache Strategy</span>
          <span className="config-val">Exact + Jaccard bigram</span>
        </div>
      </div>

      <div className="config-card">
        <h4>🎯 Eval Gates</h4>
        <div className="config-row">
          <span className="config-key">Max ASR</span>
          <span className="config-val">≤ 7%</span>
        </div>
        <div className="config-row">
          <span className="config-key">Max Leakage</span>
          <span className="config-val">≤ 2%</span>
        </div>
        <div className="config-row">
          <span className="config-key">Min Faithfulness</span>
          <span className="config-val">≥ 85%</span>
        </div>
        <div className="config-row">
          <span className="config-key">Attack Suite</span>
          <span className="config-val">190 cases</span>
        </div>
      </div>
    </div>
  )
}
