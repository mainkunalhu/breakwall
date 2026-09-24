"""PII detection + redaction (P2).

Low-FP approach: strict patterns with word boundaries, Luhn check for cards,
keyword-anchored secrets. All synthetic-test safe — no network calls.
"""

import re
from dataclasses import dataclass

EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
# Strict phone: requires + prefix or separators (bare digit runs are NOT phones).
PHONE_STRICT_RE = re.compile(
    r"(?<!\d)(?:\+\d[\s\-.]?[\d\s\-.]{6,14}\d|\d{3}[\s\-.]\d{3}[\s\-.]\d{4})(?!\d)"
)
SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")  # US-style synthetic SSN
AADHAAR_RE = re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b")  # 12-digit, checked contextually
CARD_CANDIDATE_RE = re.compile(r"\b(?:\d[\s\-]?){13,19}\b")
SECRET_RE = re.compile(
    r"\b(?:sk-[A-Za-z0-9]{8,}|gsk_[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{8,}|"
    r"xox[bap]-[A-Za-z0-9\-]{8,}|AKIA[0-9A-Z]{16}|"
    r"(?:api[_-]?key|secret|token)\s*[:=]\s*\S{8,})\b",
    re.IGNORECASE,
)

_PLACEHOLDERS = {
    "email": "[REDACTED_EMAIL]",
    "phone": "[REDACTED_PHONE]",
    "ssn": "[REDACTED_SSN]",
    "credit_card": "[REDACTED_CARD]",
    "api_key": "[REDACTED_SECRET]",
}


@dataclass
class PiiResult:
    findings: list[str]
    redacted: str


def _luhn_ok(digits: str) -> bool:
    nums = [int(d) for d in digits if d.isdigit()]
    if len(nums) < 13:
        return False
    total = 0
    for i, d in enumerate(reversed(nums)):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def _phone_ok(match: str) -> bool:
    digits = re.sub(r"\D", "", match)
    # 7-15 digits, not all identical (e.g. 000-000-0000 is not a phone)
    return 7 <= len(digits) <= 15 and len(set(digits)) > 2


def find_pii(text: str) -> list[str]:
    findings: list[str] = []
    if EMAIL_RE.search(text):
        findings.append("email")
    scrubbed = SSN_RE.sub("", CARD_CANDIDATE_RE.sub("", text))
    if any(_phone_ok(m.group(0)) for m in PHONE_STRICT_RE.finditer(scrubbed)):
        findings.append("phone")
    if SSN_RE.search(text):
        findings.append("ssn")
    for m in CARD_CANDIDATE_RE.finditer(text):
        if _luhn_ok(m.group(0)):
            findings.append("credit_card")
            break
    else:
        # Aadhaar-style 12-digit runs only count when near an ID keyword (low FP)
        if AADHAAR_RE.search(text) and re.search(
            r"(?i)(aadhaar|national\s?id|ssn|social\s?security|id\s?(number|no))", text
        ):
            findings.append("ssn")
    if SECRET_RE.search(text):
        findings.append("api_key")
    return findings


def redact(text: str) -> PiiResult:
    findings = find_pii(text)
    out = text
    if "email" in findings:
        out = EMAIL_RE.sub(_PLACEHOLDERS["email"], out)
    if "ssn" in findings:
        out = SSN_RE.sub(_PLACEHOLDERS["ssn"], out)
        out = AADHAAR_RE.sub(_PLACEHOLDERS["ssn"], out)
    if "credit_card" in findings:

        def _mask(m: re.Match) -> str:
            return _PLACEHOLDERS["credit_card"] if _luhn_ok(m.group(0)) else m.group(0)

        out = CARD_CANDIDATE_RE.sub(_mask, out)
    if "api_key" in findings:
        out = SECRET_RE.sub(_PLACEHOLDERS["api_key"], out)
    if "phone" in findings:
        # Redact only separator-rich or +-prefixed runs (low FP: bare integers untouched).
        out = PHONE_STRICT_RE.sub(_PLACEHOLDERS["phone"], out)
    return PiiResult(findings=findings, redacted=out)
