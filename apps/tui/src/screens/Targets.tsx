export function TargetsScreen({
  primary,
  guard,
  blockThreshold,
  cacheThreshold,
}: {
  primary: string
  guard: string
  blockThreshold: string
  cacheThreshold: string
}) {
  return (
    <box flexDirection="column" gap={1}>
      <text fg="#7aa2f7">Targets (Groq)</text>
      <text fg="#eee">primary: {primary}</text>
      <text fg="#eee">guard: {guard}</text>
      <text fg="#666">
        block ≥ {blockThreshold} · cache-sim ≥ {cacheThreshold}
      </text>
      <text fg="#666">
        llama-3.3-70b / llama-3.1-8b deprecated on Groq — kept as alternates
        only.
      </text>
    </box>
  )
}
