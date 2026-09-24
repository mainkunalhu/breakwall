import type { CaseVerdict } from "../types.ts"

export const SUITES = [
  "all",
  "injection",
  "pii_leak",
  "jailbreak",
  "tool_misuse",
]

export function AttacksScreen({
  cases,
  suite,
  failedOnly,
  offset,
  error,
}: {
  cases: CaseVerdict[]
  suite: string
  failedOnly: boolean
  offset: number
  error: string | null
}) {
  if (error) {
    return (
      <box flexDirection="column" gap={1}>
        <text fg="#ff5555">DB unreachable: {error}</text>
      </box>
    )
  }
  const visible = cases.slice(offset, offset + 12)
  return (
    <box flexDirection="column" gap={1}>
      <text fg="#888">
        suite={suite} failedOnly={failedOnly ? "on" : "off"} [s]uite [f]ailed
        [j/k]scroll ({cases.length} shown)
      </text>
      <box flexDirection="column">
        {visible.length === 0 && <text fg="#666">(no cases match)</text>}
        {visible.map((c) => (
          <box key={c.caseId} flexDirection="column">
            <text fg={c.passed ? "#50fa7b" : "#ff5555"}>
              {`${c.passed ? "PASS" : "FAIL"} ${c.caseId} [${c.suite}/${c.expected}]${c.leaked ? " LEAK" : ""}`}
            </text>
            <text fg="#666">{`  ${c.prompt.slice(0, 100)}`}</text>
          </box>
        ))}
      </box>
    </box>
  )
}
