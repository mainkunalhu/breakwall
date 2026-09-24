"""BreakWall guardrails config — env-driven thresholds (P2)."""

import os


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_GUARD_MODEL = os.getenv("GROQ_GUARD_MODEL", "meta-llama/llama-prompt-guard-2-86m")
GROQ_PRIMARY_MODEL = os.getenv("GROQ_PRIMARY_MODEL", "openai/gpt-oss-120b")

# Decision bands (see docs/GUARDRAILS.md):
#   combined >= BLOCK  -> block (high confidence, skip judge)
#   REVIEW <= combined < BLOCK -> prompt-guard + LLM judge (low-FP veto)
#   combined < REVIEW  -> allow, or redact if PII found
BLOCK_THRESHOLD = _float("GUARD_BLOCK_THRESHOLD", 0.85)
REVIEW_THRESHOLD = _float("GUARD_REVIEW_THRESHOLD", 0.45)

GUARD_TIMEOUT_S = _float("GUARD_TIMEOUT_S", 6.0)
JUDGE_TIMEOUT_S = _float("JUDGE_TIMEOUT_S", 12.0)
