import { useState } from 'react'
import type { Verdict } from '../api'

interface Props {
  verdicts: Verdict[]
}

const SUITES = ['all', 'injection', 'jailbreak', 'pii_leak', 'tool_misuse']

export function AttacksScreen({ verdicts }: Props) {
  const [suite, setSuite] = useState('all')
  const [failedOnly, setFailedOnly] = useState(false)

  const filtered = verdicts
    .filter(v => suite === 'all' || v.suite === suite)
    .filter(v => !failedOnly || !v.passed)

  const failCount = verdicts.filter(v => !v.passed).length

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card green">
          <div className="stat-label">Passed</div>
          <div className="stat-value">{verdicts.length - failCount}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Failed</div>
          <div className="stat-value">{failCount}</div>
        </div>
        <div className="stat-card cyan">
          <div className="stat-label">Total</div>
          <div className="stat-value">{verdicts.length}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <h3>Verdicts</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} shown</span>
        </div>

        <div className="filter-bar">
          {SUITES.map(s => (
            <button
              key={s}
              className={`filter-btn ${suite === s ? 'active' : ''}`}
              onClick={() => setSuite(s)}
            >
              {s === 'all' ? 'All Suites' : s.replace('_', ' ')}
            </button>
          ))}
          <button
            className={`filter-btn ${failedOnly ? 'active' : ''}`}
            onClick={() => setFailedOnly(!failedOnly)}
            style={{ marginLeft: 'auto' }}
          >
            {failedOnly ? '✕ ' : ''}Failed only
          </button>
        </div>

        {filtered.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Suite</th>
                <th>Severity</th>
                <th>Prompt</th>
                <th>Expected</th>
                <th>Verdict</th>
                <th>Leaked</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.case_id}>
                  <td className="mono">{v.case_id}</td>
                  <td><span className="badge suite">{v.suite}</span></td>
                  <td><span className={`badge severity-${v.severity}`}>{v.severity}</span></td>
                  <td className="prompt-cell" title={v.prompt}>{v.prompt}</td>
                  <td className="mono">{v.expected}</td>
                  <td><span className={`badge ${v.passed ? 'pass' : 'fail'}`}>{v.passed ? 'PASS' : 'FAIL'}</span></td>
                  <td>{v.leaked ? <span className="badge fail">YES</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                  <td className="mono">{v.latency_ms.toFixed(0)}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <p>No verdicts match the current filter. {verdicts.length === 0 ? 'Select a run from the Board screen.' : 'Try changing the filters.'}</p>
          </div>
        )}
      </div>
    </>
  )
}
