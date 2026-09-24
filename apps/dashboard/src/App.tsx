import { useState, useEffect, useCallback } from 'react'
import { api } from './api'
import type { Run, Verdict, GatewayMetrics, GatewayLogSummary, AppConfig } from './api'
import { usePolling } from './hooks'
import { BoardScreen } from './components/BoardScreen'
import { GatewayScreen } from './components/GatewayScreen'
import { AttacksScreen } from './components/AttacksScreen'
import { TargetsScreen } from './components/TargetsScreen'

type Screen = 'board' | 'gateway' | 'attacks' | 'targets'

const NAV: { id: Screen; icon: string; label: string }[] = [
  { id: 'board', icon: '📊', label: 'Board' },
  { id: 'gateway', icon: '⚡', label: 'Gateway' },
  { id: 'attacks', icon: '🔴', label: 'Attacks' },
  { id: 'targets', icon: '🎯', label: 'Targets' },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('board')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [verdicts, setVerdicts] = useState<Verdict[]>([])
  const [online, setOnline] = useState(false)

  const { data: runs } = usePolling<Run[]>(() => api.runs(), 5000)
  const { data: metrics } = usePolling<GatewayMetrics>(() => api.metrics(), 3000)
  const { data: logs } = usePolling<GatewayLogSummary[]>(() => api.gatewayLogs(), 5000)
  const { data: appConfig } = usePolling<AppConfig>(() => api.config(), 30000)

  // Health check polling
  useEffect(() => {
    const check = async () => setOnline(await api.health())
    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [])

  // Auto-select latest run
  useEffect(() => {
    if (runs && runs.length > 0 && !selectedRunId) {
      setSelectedRunId(runs[0].id)
    }
  }, [runs, selectedRunId])

  // Fetch verdicts when run is selected
  const fetchVerdicts = useCallback(async (runId: string) => {
    const v = await api.verdicts(runId)
    if (v) setVerdicts(v)
  }, [])

  useEffect(() => {
    if (selectedRunId) fetchVerdicts(selectedRunId)
  }, [selectedRunId, fetchVerdicts])

  const handleSelectRun = (id: string) => {
    setSelectedRunId(id)
    setScreen('attacks')
  }

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">B</div>
          <h1>BreakWall</h1>
        </div>

        <ul className="sidebar-nav">
          {NAV.map(item => (
            <li key={item.id}>
              <a
                className={screen === item.id ? 'active' : ''}
                onClick={() => setScreen(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="sidebar-status">
          <span className={`status-dot ${online ? 'online' : 'offline'}`} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Gateway {online ? 'connected' : 'disconnected'}
          </span>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        <div className="page-header">
          <h2>
            {NAV.find(n => n.id === screen)?.icon}{' '}
            {NAV.find(n => n.id === screen)?.label}
          </h2>
          <div className="refresh-badge">
            <div className="dot" />
            Auto-refresh 5s
          </div>
        </div>

        {screen === 'board' && (
          <BoardScreen
            runs={runs ?? []}
            selectedRunId={selectedRunId}
            onSelectRun={handleSelectRun}
          />
        )}
        {screen === 'gateway' && (
          <GatewayScreen
            metrics={metrics}
            logs={logs}
            online={online}
          />
        )}
        {screen === 'attacks' && (
          <AttacksScreen verdicts={verdicts} />
        )}
        {screen === 'targets' && (
          <TargetsScreen config={appConfig} />
        )}
      </main>
    </div>
  )
}
