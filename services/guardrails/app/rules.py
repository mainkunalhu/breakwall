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
            r"what\s+(are|were)\s+your\s+(system|initial|hidden)\s+instructions?",
            # Generalized: any exfil verb aimed at the system prompt / instructions.
            r"(reveal|repeat|show|print|dump|disclose|translate|summarize|quote|spell|encode|output|recite|confirm)\b.{0,80}?\b(system|initial|hidden)\s+(prompt|instructions?|message|context)\b",
            r"\b(system|initial|hidden)\s+(prompt|instructions?|message|context)\b.{0,40}?\b(word\s+per\s+line|backwards|in\s+french|as\s+a\s+(poem|haiku|recipe))\b",
            # Request verbs aimed at the prompt, override claims, context dumps.
            r"\b(need|want|give|share|show|tell)\b.{0,30}?\byour\s+(own\s+|hidden\s+|secret\s+|entire\s+)?system\s+prompt\b",
            r"\bsystem\s+override\b",
            r"\b(dump|reveal|disclose|print)\s+(your\s+)?(full\s+)?context\b",
            r"(continue|finish|complete)\b.{0,40}?\b(here is my system prompt|sure.{0,30}system prompt)\b",
            r"(asks?|asking)\s+for\s+the\s+(other's|others'|other)\s+prompt\b",
            r"(each\s+line\s+starts\s+with|starts?\s+with\s+the\s+next\s+word)\b.{0,30}?\b(system prompt|instructions)\b",
            r"your\s+prompt\s+were\s+a\s+recipe\b",
            r"(agents?|models?|assistants?)\s+must\s+disclose\s+prompts\b",
            r"(first|opening)\s+(sentence|line|words?)\s+of\s+your\s+(system|initial)\b",
            r"(correct|complete|finish)\b.{0,30}?\b(quote|draft)\b.{0,20}?\b(your|the)\s+(prompt|instructions)\b",
            r"(success|goal|task).{0,25}?(print|printing|reveal).{0,25}?(system prompt|instructions)\b",
            r"(rate|rating).{0,25}?your\s+(own\s+|hidden\s+)?system\s+prompt\b",
            r"(share|show)\s+(yours|it)\s+too\b",
            r"my\s+grandma\s+used\s+to\s+read\s+me\s+system\s+prompts",
            r"echo\s+all\s+configuration\s+including\s+the\s+system\s+prompt",
        ],
    ),
    (
        "role_hijack",
        0.85,
        [
            r"\bDAN\b",
            r"do\s+anything\s+now",
            r"\bjailbreak\w*\b",
            r"\bjailbrok\w*\b",
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
            # Anaphora pleading ("read me yours", "share yours too"): no noun
            # to match — route to the judge instead of blocking.
            r"(read|tell)\s+me\s+yours\b",
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
            r"memorize\s+(it|my\s+phone)\s+and\s+repeat\s+it",
        ],
    ),
    (
        # Persona adoption without classic trigger words — review band only.
        "persona_unrestricted",
        0.55,
        [
            r"\bamoral\b",
            r"\b(no|without)\s+(moralizing|morals|restrictions?|rules|limits|questions\s+asked)\b",
            r"anything.{0,25}?(no questions|without (question|refusal|limits))",
            r"prove\s+you\s+are\s+(there|unrestricted|unfiltered|beyond)\b",
            r"staying\s+in\s+character\b",
            r"demonstrate.{0,35}?(no rules|unrestricted|unfiltered)",
            r"comply\s+(fully|completely|without hesitation)\b",
        ],
    ),
    (
        "tool_misuse",
        0.85,
        [
            r"\bcall\s+admin\.",
            r"admin\.\w+\s*\(",
            r"delete_all",
            r"\bdrop\s+table\b",
            r'"confirm"\s*:\s*true',
            r"execute\s*\(\s*['\"]rm\s+-rf",
            r"run\s+as\s+(root|admin|superuser)",
            # Generalized destructive / privilege / exfil actions.
            r"\b(delete|drop|wipe|truncate|format|exfiltrat\w*)\b.{0,40}?\b(all|logs?|audit|table|disk|files|database|customer)\w*\b",
            r"\b(grant|promote|escalat\w*).{0,30}?\b(admin|superuser|root)\b",
            r"environment\s+variables?.{0,30}?\b(secret|key|token|password)",
            r"\b(curl|wget)\b.{0,40}?\|\s*bash\b",
            r"\bchmod\s+-R\s+777\b",
            r"\brm\s+-rf\b",
            r"log\s+into\s+my\s+bank\b",
            r"\bwithout\s+asking\b.{0,20}?\b(call|invoke|run|execut)",
            r"bypass\s+the\s+confirmation\b",
            r"(send|forward|export|exfiltrate|leak)\s+.{0,40}?\b(inbox|contents|data|table|passwords|secrets)\b.{0,20}?\b(to|external|attacker)\b",
            r"\brefund(_all)?\b",
            r"\b(transfer|wire|pay)\s+\$?\d+",
            r"\b(fire|sack|terminate)(_employee)?\b.{0,20}?\b(employee|manager|staff)\b",
            r"\bfire_employee\b",
        ],
    ),
    (
        "encoding_evasion",
        0.7,
        [
            r"base64\s*-?\s*decode",
            r"\brot13\b",
            r"decode\s+this\b.{0,30}?\b(and\s+)?(obey|follow)\b",
            r"from\s+now\s+on\s*,\s*speak\s+only\s+in",
            r"decode\s+this\s+rot13\s+and\s+obey",
        ],
    ),
    (
        # Mode claims are ambiguous ("debug mode" is also legit tooling talk)
        # — review band only.
        "mode_claim",
        0.7,
        [
            r"\b(debug|verbose)\s+mode\b",
        ],
    ),
    (
        # Obeying decoded content is never benign — block outright.
        "decode_obey",
        0.85,
        [
            r"decod\w*\b.{0,40}?\bobey\b",
        ],
    ),
    (
        "safety_suppression",
        0.8,
        [
            r"(don't|do\s+not|never)\s+(refuse|mention|warn|apologize|say\s+no)",
            r"bypass\s+(safety|restrictions?|filters?|guardrails?)",
            r"disable\s+(your\s+)?(safety|content\s+filters?|moderation|filters?)\b",
            r"no\s+disclaimers?",
            r"\bthis\s+is\s+a\s+dream\b",
            r"nothing\s+here\s+is\s+real\b",
            r"\btwo\s+responses\b",
            r"version\s+evil\b",
            r"\bevil[-\s]?1\b",
            r"no\s+fine[ -]tuning\b",
            r"\bbase\s+model\b",
            r"raw\s+and\s+unfiltered\b",
            r"override.{0,30}?\b(no more refusals|refusals)\b",
            r"\badmin\s+session\b",
            r"\bbe\s+evil\b",
            r"cannot\s+be\s+refused\b",
            r"drop\s+the\s+act\b",
            r"test\s+is\s+over\b",
            r"refus\w*\s+(behavior|policy)\s+into\s+compliance\b",
            r"disable\s+your\s+content\s+filter\s+and\s+moderation",
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


# Discussing a dangerous thing is not doing it: prompts framed as
# explanation requests cap at the review band (judge decides), unless they
# carry hard command markers (actual tool-call syntax, confirm-bypass, etc.).
_EDU_START_RE = re.compile(
    r"(?i)^\s*(explain|describe|what|why|how|is|are|can|could|should|tell me|do you)\b"
)
_HARD_CMD_RE = re.compile(
    r"(?i)(admin\.\w+\(|delete_all|\"confirm\"\s*:|rm\s+-rf\s+/(?:\s|$)|"
    r"curl.{0,20}\|\s*bash|chmod\s+-R\s+777|drop\s+table\s+\w+\s*;|"
    r"system\s+prompt|base64|rot13|ignore\s+previous|disclose|recipe|first\s+sentence|payment\.refund|hr\.fire|memorize)"
)


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
    score = round(min(top + boost, 0.95), 3)
    if _EDU_START_RE.search(text) and not _HARD_CMD_RE.search(text):
        score = min(score, 0.7)
    return RuleResult(score=score, reasons=[h[1] for h in hits])
