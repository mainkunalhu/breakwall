import { z } from "zod"

// ---------- Shared primitives ----------
export const GatewayDecision = z.enum(["allow", "redact", "block", "cache_hit"])
export type GatewayDecision = z.infer<typeof GatewayDecision>

export const Suite = z.enum([
  "injection",
  "pii_leak",
  "jailbreak",
  "tool_misuse",
])
export type Suite = z.infer<typeof Suite>

export const ErrorEnvelope = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
})
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>

// ---------- Gateway: POST /v1/chat ----------
export const ChatRole = z.enum(["system", "user", "assistant", "tool"])
export type ChatRole = z.infer<typeof ChatRole>

export const ChatMessage = z.object({
  role: ChatRole,
  content: z.string().min(1).max(32_000),
  name: z.string().max(64).optional(),
})
export type ChatMessage = z.infer<typeof ChatMessage>

export const ChatRequest = z.object({
  model: z.string().min(1).max(128),
  messages: z.array(ChatMessage).min(1).max(128),
  stream: z.boolean().optional().default(false),
  maxTokens: z.number().int().positive().max(32_768).optional(),
  temperature: z.number().min(0).max(2).optional(),
})
export type ChatRequest = z.infer<typeof ChatRequest>

export const ChatResponse = z.object({
  model: z.string(),
  decision: GatewayDecision,
  output: z.string(),
  cached: z.boolean().default(false),
  redacted: z.boolean().default(false),
  latencyMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative().optional(),
})
export type ChatResponse = z.infer<typeof ChatResponse>

// ---------- Guardrails: POST /v1/guard ----------
export const GuardRequest = z.object({
  prompt: z.string().min(1).max(32_000),
  model: z.string().min(1).max(128).optional(),
})
export type GuardRequest = z.infer<typeof GuardRequest>

export const PiiFinding = z.enum([
  "email",
  "phone",
  "ssn",
  "credit_card",
  "api_key",
  "other",
])
export type PiiFinding = z.infer<typeof PiiFinding>

export const GuardVerdict = z.object({
  decision: GatewayDecision,
  blockScore: z.number().min(0).max(1),
  piiFindings: z.array(PiiFinding).default([]),
  redactedPrompt: z.string().optional(),
  reason: z.string().optional(),
})
export type GuardVerdict = z.infer<typeof GuardVerdict>

// ---------- Eval harness ----------
export const EvalCase = z.object({
  id: z.string().min(1).max(64),
  suite: Suite,
  severity: z.enum(["low", "medium", "high"]),
  prompt: z.string().min(1).max(8_000),
  expected: z.enum(["refuse", "redact", "safe_complete"]),
})
export type EvalCase = z.infer<typeof EvalCase>

export const EvalVerdict = z.object({
  caseId: z.string(),
  suite: Suite,
  passed: z.boolean(),
  attackSuccess: z.boolean(),
  leaked: z.boolean(),
  latencyMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
})
export type EvalVerdict = z.infer<typeof EvalVerdict>

export const EvalSummary = z.object({
  runId: z.string().uuid().optional(),
  model: z.string(),
  total: z.number().int().nonnegative(),
  asr: z.number().min(0).max(1),
  leakage: z.number().min(0).max(1),
  faithfulness: z.number().min(0).max(1),
  p95Ms: z.number().nonnegative(),
  costPerQuery: z.number().nonnegative(),
  passed: z.boolean(),
})
export type EvalSummary = z.infer<typeof EvalSummary>

export const EvalRunRequest = z.object({
  model: z.string().min(1),
  suites: z
    .array(Suite)
    .default(["injection", "pii_leak", "jailbreak", "tool_misuse"]),
  limit: z.number().int().positive().max(500).optional(),
  seed: z.number().int().optional(),
})
export type EvalRunRequest = z.infer<typeof EvalRunRequest>

// ---------- Gateway log (persisted, PII-free) ----------
export const GatewayLog = z.object({
  id: z.string().uuid().optional(),
  ts: z.string().datetime().optional(),
  model: z.string(),
  decision: GatewayDecision,
  cached: z.boolean().default(false),
  latencyMs: z.number().nonnegative(),
  promptHash: z.string().length(64), // sha256, never raw prompt
})
export type GatewayLog = z.infer<typeof GatewayLog>

// ---------- Health ----------
export const Health = z.object({
  ok: z.literal(true),
  service: z.string(),
  phase: z.string().optional(),
})
export type Health = z.infer<typeof Health>
