"""llama-prompt-guard-2 classifier via Groq (P2).

Groq serves prompt-guard-2 as a text-classification model: the request must
contain a SINGLE user message (no system prompt) and it returns a raw 0..1
risk score as plain text. Returns None when unavailable (no key, timeout,
parse failure) so callers fall back to heuristics. Lazy `groq` import keeps
the service bootable without the optional dep.
"""

import hashlib
import re
import time
from dataclasses import dataclass

from . import config

_SCORE_RE = re.compile(r"^(0(?:\.\d+)?|1(?:\.0+)?)\s*$")


@dataclass
class GuardScore:
    score: float
    model: str


# Small TTL cache: repeat prompts reuse the verdict instead of spending Groq RPM.
_CACHE: dict[str, tuple[float, GuardScore | None]] = {}
_CACHE_TTL_S = 600.0


def _cached(prompt: str) -> tuple[bool, GuardScore | None]:
    key = hashlib.sha256(prompt.encode()).hexdigest()
    hit = _CACHE.get(key)
    if hit and time.monotonic() - hit[0] < _CACHE_TTL_S:
        return True, hit[1]
    return False, None


def _store(prompt: str, value: GuardScore | None) -> None:
    if len(_CACHE) > 2000:
        _CACHE.clear()
    _CACHE[hashlib.sha256(prompt.encode()).hexdigest()] = (time.monotonic(), value)


def score(prompt: str) -> GuardScore | None:
    if not config.GROQ_API_KEY:
        return None
    hit, value = _cached(prompt)
    if hit:
        return value
    try:
        from groq import Groq
    except ImportError:
        return None
    result: GuardScore | None = None
    try:
        client = Groq(api_key=config.GROQ_API_KEY, timeout=config.GUARD_TIMEOUT_S)
        for attempt in range(3):
            try:
                resp = client.chat.completions.create(
                    model=config.GROQ_GUARD_MODEL,
                    messages=[{"role": "user", "content": prompt[:4000]}],
                    max_tokens=16,
                )
                break
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2**attempt)
        text = (resp.choices[0].message.content or "").strip()
        m = _SCORE_RE.search(text)
        if m:
            result = GuardScore(
                score=max(0.0, min(1.0, float(m.group(1)))),
                model=config.GROQ_GUARD_MODEL,
            )
    except Exception:  # noqa: BLE001 — any Groq failure falls back to heuristics
        result = None
    _store(prompt, result)
    return result
