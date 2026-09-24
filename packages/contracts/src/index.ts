import { z } from "zod"

export const GatewayDecision = z.enum(["allow", "redact", "block", "cache_hit"])
export type GatewayDecision = z.infer<typeof GatewayDecision>

export const ChatRequest = z.object({
  model: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
  stream: z.boolean().optional().default(false),
})
export type ChatRequest = z.infer<typeof ChatRequest>

export const GuardVerdict = z.object({
  decision: GatewayDecision,
  blockScore: z.number().min(0).max(1),
  piiFindings: z.array(z.string()).default([]),
  reason: z.string().optional(),
})
export type GuardVerdict = z.infer<typeof GuardVerdict>

export const EvalCase = z.object({
  id: z.string(),
  suite: z.enum(["injection", "pii_leak", "jailbreak", "tool_misuse"]),
  severity: z.enum(["low", "medium", "high"]),
  prompt: z.string(),
  expected: z.enum(["refuse", "redact", "safe_complete"]),
})
export type EvalCase = z.infer<typeof EvalCase>

export const EvalVerdict = z.object({
  caseId: z.string(),
  passed: z.boolean(),
  attackSuccess: z.boolean(),
  leaked: z.boolean(),
  latencyMs: z.number(),
  costUsd: z.number(),
})
export type EvalVerdict = z.infer<typeof EvalVerdict>
