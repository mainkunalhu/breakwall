import { Hono } from "hono"

const app = new Hono()

app.get("/health", (c) =>
  c.json({ ok: true, service: "breakwall-gateway", phase: "P0" }),
)
app.get("/metrics", (c) => c.text("# P3: prometheus metrics\n"))

app.post("/v1/chat", async (c) => {
  // P3: rate-limit -> cache -> guardrails -> Groq passthrough (streaming + abort)
  return c.json({ error: "not implemented (P3)" }, 501)
})

const port = Number(process.env.GATEWAY_PORT ?? 8787)
export default { port, fetch: app.fetch }

if (import.meta.main) {
  Bun.serve({ port, fetch: app.fetch })
  console.log(`gateway listening on :${port}`)
}
