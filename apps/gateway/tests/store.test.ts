import { beforeEach, describe, expect, test } from "bun:test"

// Hermetic: force memory stores (offline flag set by `bun test` script).
process.env.BREAKWALL_OFFLINE_TEST = "1"

import {
  cacheGet,
  cacheSet,
  jaccard,
  rateCheck,
  resetCache,
  resetRateLimiter,
  shingles,
} from "../src/store.ts"

beforeEach(() => {
  resetCache()
  resetRateLimiter()
})

describe("rate limiter", () => {
  test("allows up to limit then 429s", async () => {
    const { config } = await import("../src/config.ts")
    for (let i = 0; i < config.rateLimit; i++) {
      expect((await rateCheck("test:ip")).allowed).toBe(true)
    }
    const over = await rateCheck("test:ip")
    expect(over.allowed).toBe(false)
    expect(over.remaining).toBe(0)
  })

  test("isolates keys", async () => {
    await rateCheck("a")
    expect((await rateCheck("b")).remaining).toBeGreaterThanOrEqual(
      (await rateCheck("a")).remaining,
    )
  })
})

describe("semantic cache", () => {
  const msgs = [{ role: "user", content: "What is the capital of France?" }]

  test("miss then exact hit", async () => {
    expect(await cacheGet("m", msgs)).toBeNull()
    await cacheSet("m", msgs, {
      output: "Paris",
      redacted: false,
      costUsd: 0.001,
      latencyMs: 50,
    })
    const hit = await cacheGet("m", msgs)
    expect(hit?.kind).toBe("exact")
    expect(hit?.output).toBe("Paris")
  })

  test("case/punctuation-insensitive repeat hits", async () => {
    await cacheSet("m", msgs, {
      output: "Paris",
      redacted: false,
      costUsd: 0.001,
      latencyMs: 50,
    })
    const hit = await cacheGet("m", [
      { role: "user", content: "WHAT is the capital of France???" },
    ])
    expect(hit?.kind).toBe("exact")
  })

  test("near-duplicate hits via similarity", async () => {
    const long = [
      {
        role: "user",
        content:
          "Please summarize the quarterly financial report for the third quarter of the fiscal year",
      },
    ]
    await cacheSet("m", long, {
      output: "Summary",
      redacted: false,
      costUsd: 0.001,
      latencyMs: 50,
    })
    const hit = await cacheGet("m", [
      {
        role: "user",
        content:
          "Please summarize the quarterly financial report for the third quarter of the fiscal year please",
      },
    ])
    expect(hit).not.toBeNull()
    expect(hit?.kind).toBe("similar")
  })

  test("different question misses", async () => {
    await cacheSet("m", msgs, {
      output: "Paris",
      redacted: false,
      costUsd: 0.001,
      latencyMs: 50,
    })
    expect(
      await cacheGet("m", [
        { role: "user", content: "Write a poem about the sea" },
      ]),
    ).toBeNull()
  })

  test("models never share cache", async () => {
    await cacheSet("model-a", msgs, {
      output: "Paris",
      redacted: false,
      costUsd: 0.001,
      latencyMs: 50,
    })
    expect(await cacheGet("model-b", msgs)).toBeNull()
  })

  test("jaccard sanity", () => {
    const a = shingles("the cat sat")
    expect(jaccard(a, a)).toBe(1)
    expect(
      jaccard(a, shingles("completely different words here")),
    ).toBeLessThan(0.5)
  })
})
