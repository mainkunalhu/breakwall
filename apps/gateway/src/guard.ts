import { GuardVerdict } from "@breakwall/contracts"
import { config } from "./config.ts"
import { inc } from "./metrics.ts"

export interface GuardOutcome {
  verdict: typeof GuardVerdict._type | null
  fallback: boolean
}

// Fail-open with a metric when guardrails is unreachable (documented in GATEWAY.md).
// Safety-critical deployments should set GUARD_STRICT=1 to fail closed instead.
const STRICT = process.env.GUARD_STRICT === "1"

export async function checkGuard(
  prompt: string,
  model?: string,
): Promise<GuardOutcome> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), config.guardTimeoutMs)
  try {
    const res = await fetch(`${config.guardrailsUrl}/v1/guard`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, model }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`guardrails ${res.status}`)
    const parsed = GuardVerdict.safeParse(await res.json())
    if (!parsed.success) throw new Error("guardrails schema mismatch")
    return { verdict: parsed.data, fallback: false }
  } catch {
    inc("breakwall_guard_fallback_total")
    if (STRICT) {
      return {
        verdict: {
          decision: "block",
          blockScore: 1,
          piiFindings: [],
          reason: "guard-unreachable-strict",
        },
        fallback: true,
      }
    }
    return {
      verdict: {
        decision: "allow",
        blockScore: 0,
        piiFindings: [],
        reason: "guard-unreachable-fallback",
      },
      fallback: true,
    }
  } finally {
    clearTimeout(t)
  }
}
