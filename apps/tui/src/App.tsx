import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react"
import { useCallback, useEffect, useState } from "react"
import {
  caseVerdicts,
  latestRuns,
  recentGatewayLogs,
  suiteStats,
} from "./db.ts"
import { fetchGatewayStats } from "./gatewayStats.ts"
import { AttacksScreen, SUITES } from "./screens/Attacks.tsx"
import { BoardScreen } from "./screens/Board.tsx"
import { GatewayScreen } from "./screens/Gateway.tsx"
import { TargetsScreen } from "./screens/Targets.tsx"
import type {
  CaseVerdict,
  EvalRun,
  GatewayLogRow,
  GatewayStat,
  SuiteStat,
} from "./types.ts"
import { config } from "./types.ts"

type Screen = "board" | "gateway" | "attacks" | "targets"

export function App() {
  const renderer = useRenderer()
  const [screen, setScreen] = useState<Screen>("board")
  const [runs, setRuns] = useState<EvalRun[]>([])
  const [suites, setSuites] = useState<SuiteStat[]>([])
  const [cases, setCases] = useState<CaseVerdict[]>([])
  const [stats, setStats] = useState<GatewayStat | null>(null)
  const [logs, setLogs] = useState<GatewayLogRow[]>([])
  const [dbError, setDbError] = useState<string | null>(null)
  const [gwError, setGwError] = useState<string | null>(null)
  const [suiteIdx, setSuiteIdx] = useState(0)
  const [failedOnly, setFailedOnly] = useState(false)
  const [offset, setOffset] = useState(0)
  const { width, height } = useTerminalDimensions()

  const refresh = useCallback(async () => {
    try {
      const r = await latestRuns(10)
      setRuns(r)
      setDbError(null)
      if (r.length > 0) {
        const first = r[0]
        if (first) {
          const [s, c] = await Promise.all([
            suiteStats(first.id),
            caseVerdicts(first.id, {
              suite: SUITES[suiteIdx] === "all" ? undefined : SUITES[suiteIdx],
              failedOnly,
              limit: 60,
            }),
          ])
          setSuites(s)
          setCases(c)
        }
      }
    } catch (e) {
      setDbError(e instanceof Error ? e.message : String(e))
    }
    try {
      const [s, l] = await Promise.all([
        fetchGatewayStats(),
        recentGatewayLogs(20),
      ])
      if (s) {
        setStats(s)
        setGwError(null)
      } else {
        setGwError(`no /metrics at ${config.gatewayUrl}`)
      }
      setLogs(l)
    } catch (e) {
      setGwError(e instanceof Error ? e.message : String(e))
    }
  }, [suiteIdx, failedOnly])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), config.refreshMs)
    return () => clearInterval(t)
  }, [refresh])

  useKeyboard((key) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      renderer.destroy()
      return
    }
    if (key.name === "1") setScreen("board")
    if (key.name === "2") setScreen("gateway")
    if (key.name === "3") setScreen("attacks")
    if (key.name === "4") setScreen("targets")
    if (key.name === "r") void refresh()
    if (screen === "attacks") {
      if (key.name === "s") {
        setSuiteIdx((i) => (i + 1) % SUITES.length)
        setOffset(0)
      }
      if (key.name === "f") {
        setFailedOnly((v) => !v)
        setOffset(0)
      }
      if (key.name === "j" || key.name === "down") setOffset((o) => o + 1)
      if (key.name === "k" || key.name === "up")
        setOffset((o) => Math.max(0, o - 1))
    }
  })

  return (
    <box flexDirection="column" flexGrow={1} backgroundColor="#0a0a0f">
      <box
        backgroundColor="#1a1b26"
        paddingLeft={1}
        paddingRight={1}
        height={3}
      >
        <text>
          <span fg="#ff5555">⬢ BreakWall</span>
          <span fg="#666"> │ red-team harness │ </span>
          <span fg="#888">
            [1]board [2]gateway [3]attacks [4]targets [r]efresh │ {width}x
            {height}
          </span>
        </text>
      </box>
      <box flexGrow={1} padding={1}>
        {screen === "board" && (
          <BoardScreen runs={runs} suites={suites} error={dbError} />
        )}
        {screen === "gateway" && (
          <GatewayScreen stats={stats} logs={logs} error={gwError} />
        )}
        {screen === "attacks" && (
          <AttacksScreen
            cases={cases}
            suite={SUITES[suiteIdx] ?? "all"}
            failedOnly={failedOnly}
            offset={offset}
            error={dbError}
          />
        )}
        {screen === "targets" && (
          <TargetsScreen
            primary={process.env.GROQ_PRIMARY_MODEL ?? "openai/gpt-oss-120b"}
            guard={
              process.env.GROQ_GUARD_MODEL ??
              "meta-llama/llama-prompt-guard-2-86m"
            }
            blockThreshold={process.env.GUARD_BLOCK_THRESHOLD ?? "0.85"}
            cacheThreshold={process.env.CACHE_SIM_THRESHOLD ?? "0.92"}
          />
        )}
      </box>
      <box backgroundColor="#1a1b26" paddingLeft={1} height={1}>
        <text fg="#555">
          ESC quit │ 1-4 screens │ r refresh │ attacks: s/f/j/k
        </text>
      </box>
    </box>
  )
}
