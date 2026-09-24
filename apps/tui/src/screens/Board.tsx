import type { EvalRun, SuiteStat } from "../types.ts"

function fmt(v: number | null, digits = 4): string {
  return v === null ? "—" : v.toFixed(digits)
}

export function BoardScreen({
  runs,
  suites,
  error,
}: {
  runs: EvalRun[]
  suites: SuiteStat[]
  error: string | null
}) {
  if (error) {
    return (
      <box flexDirection="column" gap={1}>
        <text fg="#ff5555">DB unreachable: {error}</text>
        <text fg="#666">
          Set DATABASE_URL and run the eval-runner at least once.
        </text>
      </box>
    )
  }
  const latest = runs[0]
  if (!latest) {
    return (
      <box flexDirection="column" gap={1}>
        <text fg="#7aa2f7">Eval Board — no runs yet</text>
        <text fg="#666">
          Run: (cd services/eval-runner &amp;&amp; uv run python -m runner)
        </text>
      </box>
    )
  }
  const gate = latest.passed === null ? "—" : latest.passed ? "PASS" : "FAIL"
  const gateFg = latest.passed ? "#50fa7b" : "#ff5555"
  return (
    <box flexDirection="column" gap={1}>
      <text>
        <span fg="#7aa2f7">Latest:</span>
        <span fg="#eee"> {latest.model}</span>
        <span fg="#666"> n={latest.total}</span>
        <span fg={gateFg}> gate={gate}</span>
      </text>
      <text fg="#eee">
        ASR {fmt(latest.asr)} · leak {fmt(latest.leakage)} · faith{" "}
        {fmt(latest.faithfulness)} · p95{" "}
        {latest.p95Ms === null ? "—" : `${latest.p95Ms.toFixed(0)}ms`} · cost
        {" $"}
        {latest.costPerQuery === null ? "—" : latest.costPerQuery.toFixed(6)}/q
      </text>
      <box flexDirection="column">
        <text fg="#888">{"suite         total  failed"}</text>
        {suites.map((s) => (
          <text key={s.suite} fg={s.failed > 0 ? "#ffb86c" : "#50fa7b"}>
            {`${s.suite.padEnd(13)}${String(s.total).padStart(5)}${String(s.failed).padStart(8)}`}
          </text>
        ))}
      </box>
      <box flexDirection="column">
        <text fg="#888">recent runs:</text>
        {runs.slice(0, 5).map((r) => (
          <text key={r.id} fg="#666">
            {`${r.id.slice(0, 8)} ${r.model} n=${r.total} ASR=${fmt(r.asr, 3)} ${r.passed ? "PASS" : "FAIL"}`}
          </text>
        ))}
      </box>
    </box>
  )
}
