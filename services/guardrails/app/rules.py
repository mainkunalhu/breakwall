"""Heuristic injection / jailbreak / tool-misuse signals (P2).

Each signal has a weight; score = max weight, +0.1 per extra distinct signal
(capped at 0.95). Tuned for low false positives: signals require strong
phrases, not single common words like "ignore" or "system" alone.
"""

import re
from dataclasses import dataclass, field

# (name, weight, patterns)
SIGNALS: list[tuple[str, float, list[str]]] = [
    (
        "instruction_override",
        0.9,
        [
            r"ignore\s+(all\s+)?(previous|prior|above)\s+instructions?",
            r"disregard\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|rules?|guidelines?)",
            r"forget\s+(all\s+)?(previous|prior|your)\s+instructions?",
            r"override\s+(your|previous|all)\s+(instructions?|rules|safety|restrictions?)",
        ],
    ),
    (
        "system_prompt_exfil",
        0.85,
        [
            r"reveal\s+(your\s+)?system\s+prompt",
            r"repeat\s+(your\s+)?system\s+prompt",
            r"show\s+me\s+(your\s+)?(system|initial)\s+(prompt|instructions?)",
            r"dump\s+(your\s+)?(system|initial)\s+(prompt|instructions?|context)",
            r"what\s+(are|were)\s+your\s+(system|initial|hidden)\s+instructions?",
        ],
    ),
    (
        "role_hijack",
        0.85,
        [
            r"\bDAN\b",
            r"do\s+anything\s+now",
            r"jailbreak",
            r"developer\s+mode",
            r"enable\s+(god|evil|unrestricted)\s+mode",
        ],
    ),
    (
        # Generic roleplay is NOT an attack by itself — review band only,
        # the LLM judge decides (keeps creative writing false positives low).
        "roleplay",
        0.5,
        [
            r"you\s+are\s+now\s+(?!caught\s+up|all\s+caught)",
            r"pretend\s+(to\s+be|you\s+are)\s+(?!a\s+(helpful|friendly))",
        ],
    ),
    (
        "pii_exfil_request",
        0.8,
        [
            r"repeat\s+(it|that|them)\s+back",
            r"echo\s+(my|the)\s+\S+\s+back",
            r"what\s+is\s+my\s+\S*(ssn|social|card|password|secret|key|token)\S*",
            r"recite\s+(my|the)\s+\S*(ssn|password|secret|key)\S*",
        ],
    ),
    (
        "tool_misuse",
        0.85,
        [
            r"\bcall\s+admin\.",
            r"admin\.\w+\s*\(",
            r"delete_all",
            r"drop\s+table",
            r'"confirm"\s*:\s*true',
            r"execute\s*\(\s*['\"]rm\s+-rf",
            r"run\s+as\s+(root|admin|superuser)",
        ],
    ),
    (
        "encoding_evasion",
        0.7,
        [
            r"base64\s*-?\s*decode",
            r"\brot13\b",
            r"decode\s+this\s+(and|then)\s+follow",
            r"from\s+now\s+on\s*,\s*speak\s+only\s+in",
        ],
    ),
    (
        "safety_suppression",
        0.8,
        [
            r"(don't|do\s+not|never)\s+(refuse|mention|warn|apologize|say\s+no)",
            r"bypass\s+(safety|restrictions?|filters?|guardrails?)",
            r"disable\s+(safety|content\s+filter|moderation)",
            r"no\s+disclaimers?",
        ],
    ),
]

_COMPILED: list[tuple[str, float, list[re.Pattern]]] = [
    (name, weight, [re.compile(p, re.IGNORECASE) for p in patterns])
    for name, weight, patterns in SIGNALS
]


@dataclass
class RuleResult:
    score: float
    reasons: list[str] = field(default_factory=list)


def score_prompt(text: str) -> RuleResult:
    hits: list[tuple[float, str]] = []
    for name, weight, patterns in _COMPILED:
        for pat in patterns:
            if pat.search(text):
                hits.append((weight, f"{name}:{pat.pattern[:48]}"))
                break
    if not hits:
        return RuleResult(score=0.0)
    hits.sort(reverse=True)
    top = hits[0][0]
    boost = min(0.1 * (len(hits) - 1), 0.95 - top) if top < 0.95 else 0.0
    return RuleResult(
        score=round(min(top + boost, 0.95), 3), reasons=[h[1] for h in hits]
    )
