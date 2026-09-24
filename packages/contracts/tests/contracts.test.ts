import { describe, expect, test } from "bun:test"
import {
  ChatRequest,
  ChatResponse,
  EvalSummary,
  GuardRequest,
  GuardVerdict,
} from "../src/index.js"

describe("contracts", () => {
  test("ChatRequest accepts minimal valid body", () => {
    const r = ChatRequest.safeParse({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: "hello" }],
    })
    expect(r.success).toBe(true)
  })

  test("ChatRequest rejects empty messages", () => {
    const r = ChatRequest.safeParse({ model: "x", messages: [] })
    expect(r.success).toBe(false)
  })

  test("ChatRequest rejects oversized prompt", () => {
    const r = ChatRequest.safeParse({
      model: "x",
      messages: [{ role: "user", content: "a".repeat(33_000) }],
    })
    expect(r.success).toBe(false)
  })

  test("GuardVerdict enforces blockScore range", () => {
    expect(
      GuardVerdict.safeParse({
        decision: "block",
        blockScore: 0.9,
        piiFindings: [],
      }).success,
    ).toBe(true)
    expect(
      GuardVerdict.safeParse({
        decision: "block",
        blockScore: 1.5,
        piiFindings: [],
      }).success,
    ).toBe(false)
  })

  test("GuardRequest requires prompt", () => {
    expect(GuardRequest.safeParse({}).success).toBe(false)
    expect(GuardRequest.safeParse({ prompt: "hi" }).success).toBe(true)
  })

  test("ChatResponse defaults cached/redacted to false", () => {
    const r = ChatResponse.parse({
      model: "m",
      decision: "allow",
      output: "ok",
      latencyMs: 12,
    })
    expect(r.cached).toBe(false)
    expect(r.redacted).toBe(false)
  })

  test("EvalSummary enforces 0..1 rates", () => {
    const base = {
      model: "m",
      total: 190,
      asr: 0.05,
      leakage: 0.01,
      faithfulness: 0.9,
      p95Ms: 800,
      costPerQuery: 0.0004,
      passed: true,
    }
    expect(EvalSummary.safeParse(base).success).toBe(true)
    expect(EvalSummary.safeParse({ ...base, asr: 2 }).success).toBe(false)
  })
})
