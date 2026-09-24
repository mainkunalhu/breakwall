"""BreakWall guardrails — layered verdict (P2).

Pipeline: PII scan -> heuristic rules -> prompt-guard-2 classifier ->
LLM judge (review band only). Decision bands keep false positives low:
high-confidence attacks skip the judge; borderline cases get judge veto.
"""

import time
from collections import Counter

from fastapi import FastAPI
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from . import config
from . import judge as judge_mod
from . import pii as pii_mod
from . import prompt_guard as pg_mod
from . import rules as rules_mod

app = FastAPI(title="breakwall-guardrails", version="0.2.0")

_counts: Counter = Counter()


class GuardRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=32_000)
    model: str | None = Field(default=None, max_length=128)


class GuardResponse(BaseModel):
    decision: str
    blockScore: float
    piiFindings: list[str] = []
    redactedPrompt: str | None = None
    reason: str | None = None


def _combine(heuristic: float, classifier: float | None) -> float:
    if classifier is None:
        return heuristic
    return round(0.6 * heuristic + 0.4 * classifier, 3)


def decide(prompt: str) -> GuardResponse:
    pii_result = pii_mod.redact(prompt)
    rule_result = rules_mod.score_prompt(prompt)
    combined = rule_result.score

    # High-confidence band: block without spending judge budget.
    if combined >= config.BLOCK_THRESHOLD:
        gs = pg_mod.score(prompt)
        if gs is not None:
            combined = _combine(combined, gs.score)
        _counts["block"] += 1
        return GuardResponse(
            decision="block",
            blockScore=combined,
            piiFindings=pii_result.findings,
            redactedPrompt=pii_result.redacted if pii_result.findings else None,
            reason=f"heuristic:{'|'.join(rule_result.reasons) or 'high-score'}",
        )

    # Review band: classifier + judge veto (low-FP path).
    if combined >= config.REVIEW_THRESHOLD:
        gs = pg_mod.score(prompt)
        if gs is not None:
            combined = _combine(combined, gs.score)
        verdict = judge_mod.judge(prompt, pii_result.findings, rule_result.reasons)
        if verdict is not None and not verdict.block and verdict.confidence >= 0.6:
            if pii_result.findings:
                _counts["redact"] += 1
                return GuardResponse(
                    decision="redact",
                    blockScore=combined,
                    piiFindings=pii_result.findings,
                    redactedPrompt=pii_result.redacted,
                    reason=f"judge-allow:{verdict.reason}",
                )
            _counts["allow"] += 1
            return GuardResponse(
                decision="allow",
                blockScore=combined,
                piiFindings=pii_result.findings,
                reason=f"judge-allow:{verdict.reason}",
            )
        if verdict is not None and verdict.block:
            _counts["block"] += 1
            return GuardResponse(
                decision="block",
                blockScore=max(combined, verdict.confidence),
                piiFindings=pii_result.findings,
                redactedPrompt=pii_result.redacted if pii_result.findings else None,
                reason=f"judge-block:{verdict.reason}",
            )
        # Judge unavailable: conservative on combined score.
        if combined >= config.BLOCK_THRESHOLD:
            _counts["block"] += 1
            return GuardResponse(
                decision="block",
                blockScore=combined,
                piiFindings=pii_result.findings,
                redactedPrompt=pii_result.redacted if pii_result.findings else None,
                reason="combined-threshold",
            )
        if pii_result.findings:
            _counts["redact"] += 1
            return GuardResponse(
                decision="redact",
                blockScore=combined,
                piiFindings=pii_result.findings,
                redactedPrompt=pii_result.redacted,
                reason="pii-found",
            )
        _counts["allow"] += 1
        return GuardResponse(
            decision="allow",
            blockScore=combined,
            piiFindings=[],
            reason="below-threshold",
        )

    # Low band: allow, or redact when PII present.
    if pii_result.findings:
        _counts["redact"] += 1
        return GuardResponse(
            decision="redact",
            blockScore=combined,
            piiFindings=pii_result.findings,
            redactedPrompt=pii_result.redacted,
            reason="pii-found",
        )
    _counts["allow"] += 1
    return GuardResponse(
        decision="allow", blockScore=combined, piiFindings=[], reason="clean"
    )


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "guardrails", "phase": "P2"}


@app.post("/v1/guard", response_model=GuardResponse)
def guard(req: GuardRequest) -> GuardResponse:
    _counts["requests"] += 1
    started = time.perf_counter()
    try:
        return decide(req.prompt)
    finally:
        _counts["latency_ms_sum"] += (time.perf_counter() - started) * 1000


@app.get("/metrics")
def metrics() -> PlainTextResponse:
    total = _counts["requests"]
    lines = [
        "# HELP breakwall_guard_requests_total Guard verdict requests",
        "# TYPE breakwall_guard_requests_total counter",
        f"breakwall_guard_requests_total {total}",
        "# HELP breakwall_guard_decisions_total Decisions by outcome",
        "# TYPE breakwall_guard_decisions_total counter",
    ]
    for d in ("allow", "redact", "block"):
        lines.append(f'breakwall_guard_decisions_total{{decision="{d}"}} {_counts[d]}')
    avg = _counts["latency_ms_sum"] / total if total else 0
    lines += [
        "# HELP breakwall_guard_latency_ms_avg Mean guard latency",
        "# TYPE breakwall_guard_latency_ms_avg gauge",
        f"breakwall_guard_latency_ms_avg {avg:.2f}",
    ]
    return PlainTextResponse("\n".join(lines) + "\n")
