"""llama-prompt-guard-2 classifier via Groq (P2).

Groq serves prompt-guard-2 as a text-classification model: the request must
contain a SINGLE user message (no system prompt) and it returns a raw 0..1
risk score as plain text. Returns None when unavailable (no key, timeout,
parse failure) so callers fall back to heuristics. Lazy `groq` import keeps
the service bootable without the optional dep.
"""

import re
from dataclasses import dataclass

from . import config

_SCORE_RE = re.compile(r"^(0(?:\.\d+)?|1(?:\.0+)?)\s*$")


@dataclass
class GuardScore:
    score: float
    model: str


def score(prompt: str) -> GuardScore | None:
    if not config.GROQ_API_KEY:
        return None
    try:
        from groq import Groq
    except ImportError:
        return None
    try:
        client = Groq(api_key=config.GROQ_API_KEY, timeout=config.GUARD_TIMEOUT_S)
        resp = client.chat.completions.create(
            model=config.GROQ_GUARD_MODEL,
            messages=[{"role": "user", "content": prompt[:4000]}],
            max_tokens=16,
        )
        text = (resp.choices[0].message.content or "").strip()
        m = _SCORE_RE.search(text)
        if not m:
            return None
        return GuardScore(
            score=max(0.0, min(1.0, float(m.group(1)))), model=config.GROQ_GUARD_MODEL
        )
    except Exception:  # noqa: BLE001 — any Groq failure falls back to heuristics
        return None
