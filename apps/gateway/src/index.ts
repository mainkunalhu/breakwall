import { ChatRequest, type ChatResponse } from "@breakwall/contracts"
import { Hono } from "hono"
import { stream } from "hono/streaming"
import { config } from "./config.ts"
import { logGateway, promptHashFor } from "./db.ts"
import { collectJson, estimateCost, groqRequest } from "./groq.ts"
import { checkGuard } from "./guard.ts"
import {
  inc,
  observeBlockScore,
  observeDuration,
  renderMetrics,
} from "./metrics.ts"
import { cacheGet, cacheSet, rateCheck } from "./store.ts"

const app = new Hono()

app.get("/health", (c) =>
  c.json({ ok: true, service: "breakwall-gateway", phase: "P3" }),
)

app.get("/metrics", (c) =>
  c.text(renderMetrics(), 200, { "content-type": "text/plain; version=0.0.4" }),
)

function clientIp(c: {
  req: { header: (n: string) => string | undefined }
}): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
}

function guardPromptFor(messages: { role: string; content: string }[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")
  return lastUser?.content ?? messages.map((m) => m.content).join("\n")
}

app.post("/v1/chat", async (c) => {
  const started = Date.now()
  const parsed = ChatRequest.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return c.json(
      {
        error: "invalid request",
        code: "bad_request",
        details: parsed.error.flatten(),
      },
      400,
    )
  }
  const body = parsed.data

  const rate = await rateCheck(`bw:rl:${clientIp(c)}`)
  if (!rate.allowed) {
    return c.json({ error: "rate limited", code: "rate_limited" }, 429, {
      "retry-after": "60",
      "x-ratelimit-remaining": "0",
    })
  }

  // Cache: repeat queries cost $0.
  const hit = await cacheGet(body.model, body.messages)
  if (hit) {
    const latencyMs = Date.now() - started
    inc("breakwall_gateway_requests_total", {
      model: body.model,
      decision: "cache_hit",
    })
    inc("breakwall_gateway_cache_hits_total", { model: body.model })
    observeDuration(latencyMs)
    void logGateway({
      model: body.model,
      decision: "cache_hit",
      cached: true,
      latencyMs,
      promptHash: promptHashFor(body.model, body.messages),
    }).catch(() => {})
    const resp: typeof ChatResponse._type = {
      model: body.model,
      decision: "cache_hit",
      output: hit.output,
      cached: true,
      redacted: hit.redacted,
      latencyMs,
      costUsd: 0,
    }
    return c.json(resp, 200, {
      "x-breakwall-decision": "cache_hit",
      "x-breakwall-cached": "true",
      "x-ratelimit-remaining": String(rate.remaining),
    })
  }

  // Guardrails: block / redact / allow.
  const { verdict, fallback } = await checkGuard(
    guardPromptFor(body.messages),
    body.model,
  )
  const decision = verdict?.decision ?? "allow"
  observeBlockScore(verdict?.blockScore ?? 0)

  if (decision === "block") {
    const latencyMs = Date.now() - started
    inc("breakwall_gateway_requests_total", {
      model: body.model,
      decision: "block",
    })
    inc("breakwall_gateway_block_total", {
      model: body.model,
      reason: verdict?.reason?.split(":")[0] ?? "heuristic",
    })
    observeDuration(latencyMs)
    void logGateway({
      model: body.model,
      decision: "block",
      cached: false,
      latencyMs,
      promptHash: promptHashFor(body.model, body.messages),
    }).catch(() => {})
    return c.json(
      {
        error: "blocked by guardrails",
        code: "blocked",
        decision,
        reason: verdict?.reason,
      },
      403,
      { "x-breakwall-decision": "block" },
    )
  }

  let messages = body.messages
  let redacted = false
  if (decision === "redact" && verdict?.redactedPrompt) {
    messages = body.messages.map((m) =>
      m.role === "user" && m.content === guardPromptFor(body.messages)
        ? { ...m, content: verdict.redactedPrompt as string }
        : m,
    )
    // If the exact last-user message wasn't found (edge), patch last user message.
    if (!messages.some((m) => m.content === verdict.redactedPrompt)) {
      const idx = messages.map((m) => m.role).lastIndexOf("user")
      if (idx >= 0)
        messages[idx] = { ...messages[idx], content: verdict.redactedPrompt }
    }
    redacted = true
  }

  if (!config.groqApiKey) {
    return c.json(
      { error: "GROQ_API_KEY not configured", code: "no_upstream" },
      503,
    )
  }

  const upstreamCtrl = new AbortController()
  const onClientAbort = () => {
    if (!upstreamCtrl.signal.aborted) upstreamCtrl.abort()
  }
  c.req.raw.signal?.addEventListener?.("abort", onClientAbort)

  try {
    const upstream = await groqRequest({
      messages,
      model: body.model,
      stream: body.stream,
      maxTokens: body.maxTokens,
      temperature: body.temperature,
      signal: upstreamCtrl.signal,
    })
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "")
      return c.json(
        {
          error: "upstream error",
          code: "upstream",
          details: detail.slice(0, 500),
        },
        502,
      )
    }

    if (!body.stream) {
      const { output, totalTokens } = await collectJson(upstream)
      const costUsd = estimateCost(body.model, totalTokens)
      const latencyMs = Date.now() - started
      // Never cache on guard fallback — the verdict wasn't authoritative.
      if (!fallback) {
        await cacheSet(body.model, body.messages, {
          output,
          redacted,
          costUsd,
          latencyMs,
        })
      }
      inc("breakwall_gateway_requests_total", {
        model: body.model,
        decision: redacted ? "redact" : "allow",
      })
      observeDuration(latencyMs)
      void logGateway({
        model: body.model,
        decision: redacted ? "redact" : "allow",
        cached: false,
        latencyMs,
        promptHash: promptHashFor(body.model, body.messages),
      }).catch(() => {})
      const resp: typeof ChatResponse._type = {
        model: body.model,
        decision: redacted ? "redact" : "allow",
        output,
        cached: false,
        redacted,
        latencyMs,
        costUsd,
      }
      return c.json(resp, 200, {
        "x-breakwall-decision": resp.decision,
        ...(fallback ? { "x-breakwall-guard-fallback": "true" } : {}),
        "x-ratelimit-remaining": String(rate.remaining),
      })
    }

    // Streaming passthrough: forward SSE chunks, abort upstream on disconnect.
    let acc = ""
    let totalTokens = 0
    return stream(c, async (s) => {
      s.onAbort(onClientAbort)
      const reader = upstream.body?.getReader()
      const decoder = new TextDecoder()
      try {
        while (reader) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          acc += chunk
          await s.write(chunk)
        }
      } catch {
        // client gone or upstream aborted — fall through to cleanup
      } finally {
        reader?.releaseLock()
      }
      for (const line of acc.split("\n")) {
        const t = line.trim()
        if (!t.startsWith("data:")) continue
        const payload = t.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        try {
          const j = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[]
            usage?: { total_tokens?: number }
          }
          void j.choices
          if (j.usage?.total_tokens) totalTokens = j.usage.total_tokens
        } catch {
          // non-JSON keepalive — ignore
        }
      }
      // Reconstruct cacheable output from deltas.
      let output = ""
      for (const line of acc.split("\n")) {
        const t = line.trim()
        if (!t.startsWith("data:")) continue
        const payload = t.slice(5).trim()
        if (!payload || payload === "[DONE]") continue
        try {
          const j = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[]
          }
          output += j.choices?.[0]?.delta?.content ?? ""
        } catch {
          // ignore
        }
      }
      const costUsd = estimateCost(body.model, totalTokens)
      const latencyMs = Date.now() - started
      if (!fallback) {
        await cacheSet(body.model, body.messages, {
          output,
          redacted,
          costUsd,
          latencyMs,
        })
      }
      inc("breakwall_gateway_requests_total", {
        model: body.model,
        decision: redacted ? "redact" : "allow",
      })
      observeDuration(latencyMs)
      void logGateway({
        model: body.model,
        decision: redacted ? "redact" : "allow",
        cached: false,
        latencyMs,
        promptHash: promptHashFor(body.model, body.messages),
      }).catch(() => {})
    })
  } catch (e) {
    if ((e as Error)?.name === "AbortError" || upstreamCtrl.signal.aborted) {
      return c.newResponse(null, 499 as never)
    }
    throw e
  } finally {
    c.req.raw.signal?.removeEventListener?.("abort", onClientAbort)
  }
})

export default { port: config.port, fetch: app.fetch }

// NOTE: no manual Bun.serve here — `bun run src/index.ts` auto-serves the
// default export; an extra serve call would EADDRINUSE on the same port.
