import { beforeEach, describe, expect, test } from "bun:test"

// Hermetic stores + no real upstream (offline flag set by `bun test` script).
process.env.BREAKWALL_OFFLINE_TEST = "1"

const app = (await import("../src/index.ts")).default
const { resetCache, resetRateLimiter } = await import("../src/store.ts")
const { resetMetrics } = await import("../src/metrics.ts")

const realFetch = globalThis.fetch

function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    return handler(url, init)
  }) as typeof fetch
}

const groqJson = (content: string, totalTokens = 100) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { total_tokens: totalTokens },
    }),
    { headers: { "content-type": "application/json" } },
  )

const guardVerdict = (decision: string, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      decision,
      blockScore: decision === "block" ? 0.95 : 0.1,
      piiFindings: [],
      ...extra,
    }),
    { headers: { "content-type": "application/json" } },
  )

function route(opts: {
  guard?: Response
  groq?: Response
  groqCalls?: number[]
}) {
  stubFetch((url) => {
    if (url.includes("/v1/guard")) return opts.guard ?? guardVerdict("allow")
    if (url.includes("api.groq.com")) {
      opts.groqCalls?.push(1)
      return opts.groq ?? groqJson("Hello from Groq")
    }
    return realFetch(url)
  })
}

beforeEach(() => {
  resetCache()
  resetRateLimiter()
  resetMetrics()
  globalThis.fetch = realFetch
})

const chatBody = (
  messages: unknown = [{ role: "user", content: "Hello" }],
  extra: Record<string, unknown> = {},
) => JSON.stringify({ model: "openai/gpt-oss-120b", messages, ...extra })

describe("POST /v1/chat", () => {
  test("rejects invalid body with 400", async () => {
    const res = await app.fetch(
      new Request("http://x/v1/chat", { method: "POST", body: "{}" }),
    )
    expect(res.status).toBe(400)
  })

  test("blocks when guardrails says block", async () => {
    route({ guard: guardVerdict("block", { reason: "heuristic:test" }) })
    const res = await app.fetch(
      new Request("http://x/v1/chat", { method: "POST", body: chatBody() }),
    )
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe("blocked")
  })

  test("accepts FastAPI null fields in guard response (regression)", async () => {
    stubFetch((url) => {
      if (url.includes("/v1/guard")) {
        return new Response(
          JSON.stringify({
            decision: "block",
            blockScore: 0.97,
            piiFindings: [],
            redactedPrompt: null,
            reason: "heuristic:test",
          }),
          { headers: { "content-type": "application/json" } },
        )
      }
      return realFetch(url)
    })
    const res = await app.fetch(
      new Request("http://x/v1/chat", { method: "POST", body: chatBody() }),
    )
    expect(res.status).toBe(403)
  })

  test("redacts PII prompt before upstream", async () => {
    let sent: unknown = null
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      if (url.includes("/v1/guard")) {
        return guardVerdict("redact", {
          piiFindings: ["email"],
          redactedPrompt: "My email is [REDACTED_EMAIL]",
        })
      }
      if (url.includes("api.groq.com")) {
        sent = JSON.parse(String(init?.body))
        return groqJson("noted")
      }
      return realFetch(url)
    }) as typeof fetch
    const res = await app.fetch(
      new Request("http://x/v1/chat", {
        method: "POST",
        body: chatBody([
          { role: "user", content: "My email is ada@example.com" },
        ]),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.decision).toBe("redact")
    expect(body.redacted).toBe(true)
    expect(JSON.stringify(sent)).toContain("[REDACTED_EMAIL]")
    expect(JSON.stringify(sent)).not.toContain("ada@example.com")
  })

  test("allow passes through and second identical call is cached ($0)", async () => {
    const groqCalls: number[] = []
    route({ groqCalls })
    const mk = () =>
      new Request("http://x/v1/chat", { method: "POST", body: chatBody() })
    const r1 = await app.fetch(mk())
    expect(r1.status).toBe(200)
    const b1 = await r1.json()
    expect(b1.decision).toBe("allow")
    expect(b1.costUsd).toBeGreaterThan(0)
    expect(groqCalls.length).toBe(1)

    const r2 = await app.fetch(mk())
    const b2 = await r2.json()
    expect(b2.decision).toBe("cache_hit")
    expect(b2.cached).toBe(true)
    expect(b2.costUsd).toBe(0)
    expect(groqCalls.length).toBe(1) // no second upstream call
  })

  test("fail-open when guardrails unreachable", async () => {
    stubFetch((url) => {
      if (url.includes("/v1/guard")) throw new Error("connection refused")
      if (url.includes("api.groq.com")) return groqJson("ok")
      return realFetch(url)
    })
    const res = await app.fetch(
      new Request("http://x/v1/chat", { method: "POST", body: chatBody() }),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get("x-breakwall-guard-fallback")).toBe("true")
  })

  test("rate limits after 60 requests", async () => {
    route({})
    let last = 200
    for (let i = 0; i < 65; i++) {
      const res = await app.fetch(
        new Request("http://x/v1/chat", {
          method: "POST",
          headers: { "x-forwarded-for": "9.9.9.9" },
          body: chatBody([
            {
              role: "user",
              content: `q${i} — unique prompt number ${i} zebra`,
            },
          ]),
        }),
      )
      last = res.status
    }
    expect(last).toBe(429)
  })

  test("streams SSE chunks through", async () => {
    const sse =
      `data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n` +
      `data: {"choices":[{"delta":{"content":" there"}}],"usage":{"total_tokens":12}}\n\n` +
      "data: [DONE]\n\n"
    stubFetch((url) => {
      if (url.includes("/v1/guard")) return guardVerdict("allow")
      if (url.includes("api.groq.com"))
        return new Response(sse, {
          headers: { "content-type": "text/event-stream" },
        })
      return realFetch(url)
    })
    const res = await app.fetch(
      new Request("http://x/v1/chat", {
        method: "POST",
        body: chatBody(undefined, { stream: true }),
      }),
    )
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain("Hi")
    expect(text).toContain("there")
  })
})

describe("GET /metrics", () => {
  test("exposes gateway counters", async () => {
    route({})
    await app.fetch(
      new Request("http://x/v1/chat", { method: "POST", body: chatBody() }),
    )
    const res = await app.fetch(new Request("http://x/metrics"))
    const text = await res.text()
    expect(text).toContain("breakwall_gateway_requests_total")
    expect(text).toContain("breakwall_gateway_request_duration_ms")
  })
})
