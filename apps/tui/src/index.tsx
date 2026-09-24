import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./App.tsx"
import { exportMarkdown } from "./export.ts"

if (process.argv.includes("--export")) {
  const md = await exportMarkdown()
  const outIdx = process.argv.indexOf("--out")
  const outPath = outIdx >= 0 ? process.argv[outIdx + 1] : undefined
  if (outPath) {
    await Bun.write(outPath, md)
  } else {
    process.stdout.write(md)
  }
  process.exit(0)
}

const renderer = await createCliRenderer()
createRoot(renderer).render(<App />)

process.on("SIGINT", () => renderer.destroy())
process.on("SIGTERM", () => renderer.destroy())
