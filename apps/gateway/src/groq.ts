import { config } from "./config.ts"

// Approximate blended prices ($/1M tokens, prompt+completion averaged).
// Documented estimates — see docs/GATEWAY.md. Groq dashboard is authoritative.
const PRICE_PER_1M: Record<string, number> = {
  "openai/gpt-oss-120b": 0.35,
  "openai/gpt-oss-20b": 0.1,
  "llama-3.3-70b-versatile": 0.35,
  "llama-3.1-8b-instant": 0.08,
  "qwen/qwen3-32b": 0.25,
  "meta-llama/llama-4-scout-17b-16e-instruct": 0.2,
}

export function estimateCost(model: string, totalTokens: number): number {
  const per1m = PRICE_PER_1M[model] ?? 0.3
  return (totalTokens / 1_000_000) * per1m
}

export interface GroqCall {
  messages: unknown
  model: string
  stream: boolean
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export function groqRequest(call: GroqCall): Promise<Response> {
  const { messages, model, stream, maxTokens, temperature, signal } = call
  return fetch(`${config.groqBase}/openai/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.groqApiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    }),
    signal,
  })
}

export interface Collected {
  output: string
  totalTokens: number
}

export async function collectJson(res: Response): Promise<Collected> {
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
    usage?: { total_tokens?: number }
  }
  return {
    output: data.choices?.[0]?.message?.content ?? "",
    totalTokens: data.usage?.total_tokens ?? 0,
  }
}
