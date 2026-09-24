import { createCliRenderer } from "@opentui/core"
import { createRoot, useKeyboard, useTerminalDimensions } from "@opentui/react"
import { useState } from "react"

type Screen = "board" | "gateway" | "attacks" | "targets"

function App() {
  const [screen, setScreen] = useState<Screen>("board")
  const { width, height } = useTerminalDimensions()

  useKeyboard((key) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      renderer.destroy()
    }
    if (key.name === "1") setScreen("board")
    if (key.name === "2") setScreen("gateway")
    if (key.name === "3") setScreen("attacks")
    if (key.name === "4") setScreen("targets")
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
            [1]board [2]gateway [3]attacks [4]targets │ {width}x{height}
          </span>
        </text>
      </box>

      <box flexGrow={1} padding={1}>
        {screen === "board" && (
          <box flexDirection="column" gap={1}>
            <text fg="#7aa2f7">
              Eval Board — P0 scaffold (P5 builds full board)
            </text>
            <text fg="#666">
              No runs yet. Run eval-runner to populate Postgres.
            </text>
            <text fg="#666">
              Metrics: ASR · leakage · faithfulness · p95 · cost/query
            </text>
          </box>
        )}
        {screen === "gateway" && (
          <box flexDirection="column" gap={1}>
            <text fg="#7aa2f7">Live Gateway — P0 scaffold</text>
            <text fg="#666">
              Blocks · cache hits · p99. Wire to Hono /metrics in P3.
            </text>
          </box>
        )}
        {screen === "attacks" && (
          <box flexDirection="column" gap={1}>
            <text fg="#7aa2f7">Attacks — 190 cases planned</text>
            <text fg="#666">
              injection 80 · pii-leak 40 · jailbreak 40 · tool-misuse 30
            </text>
            <text fg="#666">See datasets/ in P4.</text>
          </box>
        )}
        {screen === "targets" && (
          <box flexDirection="column" gap={1}>
            <text fg="#7aa2f7">Targets (Groq)</text>
            <text fg="#666">
              primary: openai/gpt-oss-120b (llama-3.3-70b deprecated)
            </text>
            <text fg="#666">guard: meta-llama/llama-prompt-guard-2-86m</text>
          </box>
        )}
      </box>

      <box backgroundColor="#1a1b26" paddingLeft={1} height={1}>
        <text fg="#555">ESC quit │ 1-4 switch screen │ P0 scaffold</text>
      </box>
    </box>
  )
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<App />)

process.on("SIGINT", () => renderer.destroy())
process.on("SIGTERM", () => renderer.destroy())
